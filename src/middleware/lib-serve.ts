/* global Bun */
import path from 'node:path';
import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { getVersion } from '../util.js';

/**
 *
 * @param forceDist
 */
async function getLibOutputPath(forceDist = false) {
    const appVersion = await getVersion();
    const webpackRoot = forceDist
        ? path.resolve(process.cwd(), 'dist', '_webpack')
        : path.resolve(globalThis.DATA_ROOT || process.cwd(), '_webpack');

    const cacheVersion = crypto.createHash('shake256', { outputLength: 8 })
        .update(JSON.stringify([appVersion.pkgVersion, appVersion.gitRevision, 'bun']))
        .digest('hex');

    return {
        path: path.join(webpackRoot, cacheVersion, 'output'),
        filename: 'lib.js',
    };
}

/**
 *
 */
export default function getLibServeMiddleware() {
    /**
     * A very spartan recreation of webpack-dev-middleware.
     * @param {import('express').Request} req Request object.
     * @param {import('express').Response} res Response object.
     * @param {import('express').NextFunction} next Next function.
     * @type {import('express').RequestHandler}
     */
    async function devMiddleware(req: Request, res: Response, next: NextFunction) {
        const { path: outputPath, filename: outputFile } = await getLibOutputPath();
        const parsedPath = path.parse(req.path);

        if (req.method === 'GET' && parsedPath.dir === '/' && parsedPath.base === outputFile) {
            return res.sendFile(outputFile, { root: outputPath });
        }

        next();
    }

    /**
     * Wait until Bun is done compiling.
     * @param {object} param Parameters.
     * @param {boolean} [param.forceDist] Whether to force the use the /dist folder.
     * @returns {Promise<void>}
     */
    devMiddleware.runBunBuild = async ({ forceDist = false } = {}) => {
        console.log();
        console.log('Compiling frontend libraries with Bun...');

        const { path: outdir } = await getLibOutputPath(forceDist);

        // @ts-expect-error TS(2304): Cannot find name 'Bun'.
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
            throw new Error('Frontend build failed');
        }

        console.log(`Successfully built to ${outdir}`);
        console.log();
    };

    return devMiddleware;
}
