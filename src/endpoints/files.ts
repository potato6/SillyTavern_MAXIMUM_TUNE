import path from 'node:path';
import fsp from 'node:fs/promises';
import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import writeFileAtomic from 'write-file-atomic';

import { validateAssetFileName } from './assets.js';
import { clientRelativePath } from '../util.js';

interface UserDirectories {
    root?: string;
    files?: string;
    [key: string]: unknown;
}

interface UserProfile {
    handle?: string;
    [key: string]: unknown;
}

interface UserContext {
    directories?: UserDirectories;
    profile?: UserProfile;
    [key: string]: unknown;
}

export const router = new Elysia({ prefix: '/api/files' })
    .post('/sanitize-filename', (context) => {
        const { set } = context;

        const body = (context as Record<string, unknown>).body as Record<string, unknown> | undefined;

        try {
            const fileName = body?.fileName;
            if (typeof fileName !== 'string' || fileName.length === 0) {
                set.status = 400;
                return 'No fileName specified';
            }
            return { fileName: sanitize(fileName) };
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    })
    .post('/upload', async (context) => {
        const { set } = context;

        const body = (context as Record<string, unknown>).body as Record<string, unknown> | undefined;
        const user = (context as Record<string, unknown>).user as UserContext | undefined;
        const directories = user?.directories;
        const profile = user?.profile;

        try {
            const name = body?.name;
            const data = body?.data;

            if (typeof name !== 'string' || name.length === 0) {
                set.status = 400;
                return 'No upload name specified';
            }

            if (typeof data !== 'string' || data.length === 0) {
                set.status = 400;
                return 'No upload data specified';
            }

            const validation = validateAssetFileName(name);
            if (validation.error) {
                set.status = 400;
                return validation.message;
            }

            const filesDir = directories?.files ?? '';
            const rootDir = directories?.root ?? '';
            const pathToUpload = path.join(filesDir, name);
            const fileBuffer = Buffer.from(data, 'base64');

            await writeFileAtomic(pathToUpload, fileBuffer);

            const url = clientRelativePath(rootDir, pathToUpload);
            console.info(`Uploaded file: ${url} from ${profile?.handle}`);
            return { path: url };
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    })
    .post('/delete', async (context) => {
        const { set } = context;

        const body = (context as Record<string, unknown>).body as Record<string, unknown> | undefined;
        const user = (context as Record<string, unknown>).user as UserContext | undefined;
        const directories = user?.directories;

        try {
            const reqPath = body?.path;

            if (typeof reqPath !== 'string' || reqPath.length === 0) {
                set.status = 400;
                return 'No path specified';
            }

            const rootDir = directories?.root ?? '';
            const filesDir = directories?.files ?? '';
            const pathToDelete = path.join(rootDir, reqPath);

            if (!pathToDelete.startsWith(filesDir)) {
                set.status = 400;
                return 'Invalid path';
            }

            try {
                await fsp.unlink(pathToDelete);
                set.status = 204;
            } catch (err: any) {
                if (err?.code === 'ENOENT') {
                    set.status = 404;
                    return 'File not found';
                }
                throw err;
            }
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    })
    .post('/verify', async (context) => {
        const { set } = context;

        const body = (context as Record<string, unknown>).body as Record<string, unknown> | undefined;
        const user = (context as Record<string, unknown>).user as UserContext | undefined;
        const directories = user?.directories;

        try {
            const urls = body?.urls;
            if (!Array.isArray(urls)) {
                set.status = 400;
                return 'No URLs specified';
            }

            const rootDir = directories?.root ?? '';
            const filesDir = directories?.files ?? '';
            const verified: Record<string, boolean> = {};

            const results = await Promise.all(
                urls.map(async (url) => {
                    if (typeof url !== 'string') {
                        return null;
                    }

                    const pathToVerify = path.join(rootDir, url);
                    if (!pathToVerify.startsWith(filesDir)) {
                        console.warn(`File verification: Invalid path: ${pathToVerify}`);
                        return null;
                    }

                    try {
                        await fsp.access(pathToVerify);
                        return { url, exists: true } as const;
                    } catch {
                        return { url, exists: false } as const;
                    }
                }),
            );

            for (const res of results) {
                if (res) {
                    verified[res.url] = res.exists;
                }
            }

            return verified;
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    });
