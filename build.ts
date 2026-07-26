import {
    existsSync,
    mkdirSync,
    rmSync,
    readdirSync,
    copyFileSync,
    readFileSync,
    writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';

const PUBLIC_DIR = 'public';
const DIST_DIR = 'public/dist';
const COMMIT_HASH_FILE = path.join(DIST_DIR, '.commit-hash');

function copyRecursiveSync(src: string, dest: string) {
    if (!existsSync(dest)) {
        mkdirSync(dest, { recursive: true });
    }

    const entries = readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            if (entry.name === 'dist') continue;
            copyRecursiveSync(srcPath, destPath);
        } else {
            if (entry.name.endsWith('.ts') || entry.name.endsWith('.css')) continue;
            copyFileSync(srcPath, destPath);
        }
    }
}

// ── Check if we can skip the build ──────────────────────────────────────────

const git = simpleGit();
const status = await git.status();
const isDirty = status.files.length > 0;

if (!isDirty) {
    const commitHash = await git.revparse(['HEAD']);

    if (existsSync(COMMIT_HASH_FILE)) {
        const storedHash = readFileSync(COMMIT_HASH_FILE, 'utf-8').trim();
        if (storedHash === commitHash) {
            console.log(`✓ Up to date (${commitHash.slice(0, 12)})`);
            process.exit(0);
        }
    }
}

if (isDirty) {
    console.log('⚠ Dirty tree — rebuilding');
}

// ── Frontend ────────────────────────────────────────────────────────────────

if (existsSync(DIST_DIR)) {
    rmSync(DIST_DIR, { recursive: true, force: true });
}
mkdirSync(DIST_DIR, { recursive: true });

copyRecursiveSync(PUBLIC_DIR, DIST_DIR);

const allTs = [...new Bun.Glob('public/**/*.ts').scanSync()].filter(
    (f) => !f.startsWith('public/lib/tinymce/'),
);
const allCss = [...new Bun.Glob('public/**/*.css').scanSync()].filter(
    (f) => !f.startsWith('public/lib/tinymce/'),
);
const entrypoints = [...allTs, ...allCss];

const result = await Bun.build({
    entrypoints,
    outdir: DIST_DIR,
    root: PUBLIC_DIR,
    external: [
        'http',
        'https',
        'url',
        'fs',
        'JSZip',
        '*.png',
        '*.jpg',
        '*.jpeg',
        '*.gif',
        '*.svg',
        '*.webp',
        '*.woff',
        '*.woff2',
        '*.ttf',
        '*.eot',
    ],
    sourcemap: 'linked',
    splitting: true,
    format: 'esm',
    minify: false,
});

if (!result.success) {
    console.error('✗ Frontend build failed:');
    for (const message of result.logs) {
        console.error(`  ${message}`);
    }
    process.exit(1);
}

console.log(`✓ Frontend: ${result.outputs.length} files`);

if (!isDirty) {
    const commitHash = await git.revparse(['HEAD']);
    writeFileSync(COMMIT_HASH_FILE, commitHash, 'utf-8');
}

// Copy pre-built vendor CSS not processed by Bun.build
const VENDOR_CSS_DEST = 'public/dist/lib/toastui/';
mkdirSync(VENDOR_CSS_DEST, { recursive: true });
copyFileSync(
    'node_modules/@toast-ui/editor/dist/toastui-editor.css',
    path.join(VENDOR_CSS_DEST, 'toastui-editor.css'),
);

// ── Backend binary ──────────────────────────────────────────────────────────

const serverResult = await Bun.build({
    entrypoints: ['server.ts'],
    outdir: 'dist/server',
    target: 'bun',
    compile: {
        outfile: 'SillyTavern',
    },
    minify: false,
    bytecode: false,
    sourcemap: 'linked',
    external: ['@huggingface/transformers'],
});

if (!serverResult.success) {
    console.error('✗ Backend build failed:');
    for (const message of serverResult.logs) {
        console.error(`  ${message}`);
    }
    process.exit(1);
}

console.log('✓ Backend: SillyTavern');
