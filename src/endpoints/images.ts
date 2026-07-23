import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';

import { clientRelativePath, removeFileExtension, getImages, isPathUnderParent } from '../util.js';
import { MEDIA_EXTENSIONS, MEDIA_REQUEST_TYPE } from '../constants.js';

function ensureDirectoryExistence(filePath: string) {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
}

export const router = new Elysia({ prefix: '/api/images' })
    .post('/upload', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            if (!body) {
                set.status = 400;
                return { error: 'No data provided' };
            }

            const { image, format } = body as { image?: string; format?: string };

            if (!image) {
                set.status = 400;
                return { error: 'No image data provided' };
            }

            const validFormat = MEDIA_EXTENSIONS.includes(format ?? '');
            if (!validFormat) {
                set.status = 400;
                return { error: 'Invalid image format' };
            }

            let filename: string;
            if (body.filename) {
                filename = `${removeFileExtension(body.filename as string)}.${format}`;
            } else {
                filename = `${Date.now()}.${format}`;
            }

            let pathToNewFile = path.join(directories?.userImages ?? '', sanitize(filename));
            if (body.ch_name) {
                pathToNewFile = path.join(
                    directories?.userImages ?? '',
                    sanitize(body.ch_name as string),
                    sanitize(filename),
                );
            }

            ensureDirectoryExistence(pathToNewFile);
            const imageBuffer = Buffer.from(image, 'base64');
            await fs.promises.writeFile(pathToNewFile, new Uint8Array(imageBuffer));
            return { path: clientRelativePath(directories?.root ?? '', pathToNewFile) };
        } catch (error) {
            console.error(error);
            set.status = 500;
            return { error: 'Failed to save the image' };
        }
    })
    .post('/list/:folder?', (context) => {
        const { params, body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const bodyAny = body as Record<string, unknown>;

        try {
            let folder = params.folder;
            if (folder) {
                if (bodyAny.folder) {
                    set.status = 400;
                    return { error: 'Folder specified in both URL and body' };
                }
                console.warn('Deprecated: Use POST /api/images/list with folder in request body');
                bodyAny.folder = folder;
            }

            folder = bodyAny.folder as string;
            if (!folder) {
                set.status = 400;
                return { error: 'No folder specified' };
            }

            const directoryPath = path.join(
                directories?.userImages ?? '',
                sanitize(folder),
            );
            const type = Number(bodyAny.type ?? MEDIA_REQUEST_TYPE.IMAGE);
            const sort = (bodyAny.sortField as string) || 'date';
            const order = (bodyAny.sortOrder as string) || 'asc';

            if (!fs.existsSync(directoryPath)) {
                fs.mkdirSync(directoryPath, { recursive: true });
            }

            const images = getImages(directoryPath, sort, type);
            if (order === 'desc') {
                images.reverse();
            }
            return images;
        } catch (error) {
            console.error(error);
            set.status = 500;
            return { error: 'Unable to retrieve files' };
        }
    })
    .post('/folders', (context) => {
        const user = (context as unknown as Record<string, unknown>).user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            const directoryPath = directories?.userImages ?? '';
            if (!fs.existsSync(directoryPath)) {
                fs.mkdirSync(directoryPath, { recursive: true });
            }

            const folders = fs
                .readdirSync(directoryPath, { withFileTypes: true })
                .filter((dirent) => dirent.isDirectory())
                .map((dirent) => dirent.name);

            return folders;
        } catch (error) {
            console.error(error);
            return new Response(JSON.stringify({ error: 'Unable to retrieve folders' }), { status: 500 });
        }
    })
    .post('/delete', async (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const bodyAny = body as Record<string, unknown>;

        try {
            const reqPath = bodyAny.path as string;
            if (!reqPath) {
                return new Response('No path specified', { status: 400 });
            }

            const pathToDelete = path.join(directories?.root ?? '', reqPath);
            if (!isPathUnderParent(directories?.userImages ?? '', pathToDelete)) {
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
    });
