import path from 'node:path';
import fs from 'node:fs';
import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import { sync as writeFileSyncAtomic } from 'write-file-atomic';

import { validateAssetFileName } from './assets.js';
import { clientRelativePath } from '../util.js';

export const router = new Elysia({ prefix: '/api/files' })
    .post('/sanitize-filename', (context) => {
        const body = context.body as Record<string, unknown>;
        try {
            const fileName = String(body.fileName ?? '');
            if (!fileName) {
                return new Response('No fileName specified', { status: 400 });
            }
            return { fileName: sanitize(fileName) };
        } catch (error) {
            console.error(error);
            return new Response(null, { status: 500 });
        }
    })
    .post('/upload', (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const profile = user?.profile as Record<string, unknown> | undefined;

        try {
            const name = body.name as string;
            const data = body.data as string;

            if (!name) {
                return new Response('No upload name specified', { status: 400 });
            }

            if (!data) {
                return new Response('No upload data specified', { status: 400 });
            }

            const validation = validateAssetFileName(name);
            if (validation.error) return new Response(validation.message, { status: 400 });

            const pathToUpload = path.join(directories?.files ?? '', name);
            const fileBuffer = Buffer.from(data, 'base64');
            writeFileSyncAtomic(pathToUpload, fileBuffer);
            const url = clientRelativePath(directories?.root ?? '', pathToUpload);
            console.info(`Uploaded file: ${url} from ${profile?.handle}`);
            return { path: url };
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    })
    .post('/delete', (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            const reqPath = body.path as string;

            if (!reqPath) {
                return new Response('No path specified', { status: 400 });
            }

            const pathToDelete = path.join(directories?.root ?? '', reqPath);
            if (!pathToDelete.startsWith(directories?.files ?? '')) {
                return new Response('Invalid path', { status: 400 });
            }

            if (!fs.existsSync(pathToDelete)) {
                return new Response('File not found', { status: 404 });
            }

            fs.unlinkSync(pathToDelete);
            set.status = 204;
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    })
    .post('/verify', (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            const urls = body.urls as string[];
            if (!Array.isArray(urls)) {
                return new Response('No URLs specified', { status: 400 });
            }

            const verified: Record<string, boolean> = {};

            for (const url of urls) {
                const pathToVerify = path.join(directories?.root ?? '', url);
                if (!pathToVerify.startsWith(directories?.files ?? '')) {
                    console.warn(`File verification: Invalid path: ${pathToVerify}`);
                    continue;
                }
                const fileExists = fs.existsSync(pathToVerify);
                verified[url] = fileExists;
            }

            return verified;
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    });
