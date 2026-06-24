import fs from 'node:fs';
import path from 'node:path';
import { serverDirectory } from '../server-directory.js';

/**
 *
 */
export default function getBunServeMiddleware() {
    /**
     *
     * @param req
     * @param res
     * @param next
     */
    function devMiddleware(req, res, next) {
        if (req.method === 'GET' && req.path === '/lib.js') {
            const outDir = path.resolve(globalThis.DATA_ROOT, '_bun');
            return res.sendFile('lib.js', { root: outDir });
        }
        next();
    }

    devMiddleware.buildLib = async () => {
        console.log();
        console.log('Compiling frontend libraries with Bun...');

        const entry = path.join(serverDirectory, 'public', 'lib.js');
        const outDir = path.resolve(globalThis.DATA_ROOT, '_bun');
        fs.mkdirSync(outDir, { recursive: true });

        // @ts-expect-error TS(2304): Cannot find name 'Bun'.
        const result = await Bun.build({
            entrypoints: [entry],
            outdir: outDir,
            naming: 'lib.js',
            format: 'esm',
            target: 'browser',
            sourcemap: 'none',
            minify: false,
        });

        if (!result.success) {
            console.error('Frontend library build failed:');
            for (const log of result.logs) {
                console.error(log);
            }
            throw new Error('Failed to build lib.js with Bun');
        }

        console.log('Frontend libraries compiled successfully.');
        console.log();
    };

    return devMiddleware;
}
