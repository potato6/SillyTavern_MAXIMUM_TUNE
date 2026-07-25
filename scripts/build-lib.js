import path from 'node:path';
import crypto from 'node:crypto';
import { getVersion } from '../src/util.js';

const appVersion = await getVersion();

function getOutputDirectory(forceDist = false) {
    const webpackRoot = forceDist
        ? path.resolve(process.cwd(), 'dist', '_bun')
        : path.resolve(globalThis.DATA_ROOT || path.resolve(process.cwd(), 'data'), '_bun');

    const cacheVersion = crypto
        .createHash('shake256', { outputLength: 8 })
        .update(JSON.stringify([appVersion.pkgVersion, appVersion.gitRevision, 'bun']))
        .digest('hex');

    return path.join(webpackRoot, cacheVersion, 'output');
}

async function build() {
    const outdir = getOutputDirectory(process.env.FORCE_DIST === 'true');

    console.log(`Compiling frontend libraries to ${outdir}...`);

    const result = await Bun.build({
        entrypoints: ['./public/lib.js'],
        outdir: outdir,
        minify: true,
        format: 'esm',
    });

    if (!result.success) {
        console.error('Build failed');
        for (const message of result.logs) {
            console.error(message);
        }
        process.exit(1);
    }
    console.log(`Successfully built to ${outdir}`);
}

build();
