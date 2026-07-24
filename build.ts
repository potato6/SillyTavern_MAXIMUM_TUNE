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

/**
 * Recursively copy static assets.
 * @param {string} src Source directory path
 * @param {string} dest Destination directory path
 */
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
            // Exclude only .ts and .css files, as they will be built and minified by Bun.
            if (entry.name.endsWith('.ts') || entry.name.endsWith('.css')) {
                continue;
            }
            copyFileSync(srcPath, destPath);
        }
    }
}

const git = simpleGit();
const status = await git.status();
const isDirty = status.files.length > 0;

if (!isDirty) {
    const commitHash = await git.revparse(['HEAD']);

    if (existsSync(COMMIT_HASH_FILE)) {
        const storedHash = readFileSync(COMMIT_HASH_FILE, 'utf-8').trim();
        if (storedHash === commitHash) {
            console.log(`Commit ${commitHash} already built. Skipping.`);
            process.exit(0);
        }
        console.log(`Commit changed from ${storedHash} to ${commitHash}. Rebuilding.`);
    } else {
        console.log('No previous build hash found. Building fresh.');
    }
} else {
    console.log('Working tree is dirty. Cleaning and rebuilding.');
}

if (existsSync(DIST_DIR)) {
    rmSync(DIST_DIR, { recursive: true, force: true });
}
mkdirSync(DIST_DIR, { recursive: true });

console.log('Cleaning and copying static assets (including HTML templates)...');
copyRecursiveSync(PUBLIC_DIR, DIST_DIR);

const allTs = [...new Bun.Glob('public/**/*.ts').scanSync()].filter(
    (f) => !f.startsWith('public/lib/tinymce/'),
);
const allCss = [...new Bun.Glob('public/**/*.css').scanSync()].filter(
    (f) => !f.startsWith('public/lib/tinymce/'),
);
const entrypoints = [...allTs, ...allCss];

console.log('Building, bundling, and minifying scripts and styles...');
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
    minify: true, //disable while debugging
});

if (!result.success) {
    console.error('Build failed:');
    for (const message of result.logs) {
        console.error(message);
    }
    process.exit(1);
} else {
    console.log(`Build completed successfully! Generated ${result.outputs.length} files.`);

    if (!isDirty) {
        const commitHash = await git.revparse(['HEAD']);
        writeFileSync(COMMIT_HASH_FILE, commitHash, 'utf-8');
        console.log(`Stored build commit hash: ${commitHash}`);
    }
}

// Copy pre-built vendor CSS that isn't processed by Bun.build
// (ToastUI CSS is loaded at runtime by the editor)
const TOASTUI_CSS = 'node_modules/@toast-ui/editor/dist/toastui-editor.css';
const TOASTUI_CSS_DARK = 'node_modules/@toast-ui/editor/dist/theme/toastui-editor-dark.css';
const VENDOR_CSS_DEST = 'public/dist/lib/toastui/';
mkdirSync(path.join(VENDOR_CSS_DEST, 'theme'), { recursive: true });
copyFileSync(TOASTUI_CSS, path.join(VENDOR_CSS_DEST, 'toastui-editor.css'));
copyFileSync(TOASTUI_CSS_DARK, path.join(VENDOR_CSS_DEST, 'theme/toastui-editor-dark.css'));
console.log('Copied ToastUI CSS assets.');

console.log('Compiling backend binary...');
const serverResult = await Bun.build({
    entrypoints: ['server.ts'],
    outdir: 'dist/server',
    target: 'bun',
    compile: true,
    minify: true,
    bytecode: false, // causing build errors rn, but i plan to enable as soon as its stable
    sourcemap: 'linked',
    external: ['@huggingface/transformers'],
});

if (!serverResult.success) {
    console.error('Backend build failed:');
    for (const message of serverResult.logs) {
        console.error(message);
    }
    process.exit(1);
} else {
    console.log('Backend binary compiled successfully.');
}
