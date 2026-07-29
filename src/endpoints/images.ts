import fsp from 'node:fs/promises';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';

import { clientRelativePath, removeFileExtension, getImages, isPathUnderParent } from '../util.js';
import { MEDIA_EXTENSIONS, MEDIA_REQUEST_TYPE } from '../constants.js';

interface UserDirectories {
    userImages?: string;
    root?: string;
    [key: string]: unknown;
}

interface UserContext {
    directories?: UserDirectories;
    [key: string]: unknown;
}

export const router = new Elysia({ prefix: '/api/images' })
    .post('/upload', async (context) => {
        const { set } = context;

        const body = (context as Record<string, unknown>).body as Record<string, unknown> | undefined;
        const user = (context as Record<string, unknown>).user as UserContext | undefined;
        const directories = user?.directories;

        try {
            if (!body) {
                set.status = 400;
                return { error: 'No data provided' };
            }

            const image = body.image;
            const format = body.format;

            if (typeof image !== 'string' || image.length === 0) {
                set.status = 400;
                return { error: 'No image data provided' };
            }

            const formatStr = typeof format === 'string' ? format : '';
            if (!MEDIA_EXTENSIONS.includes(formatStr)) {
                set.status = 400;
                return { error: 'Invalid image format' };
            }

            const rawFilename = body.filename;
            let filename: string;
            if (typeof rawFilename === 'string' && rawFilename.length > 0) {
                filename = `${removeFileExtension(rawFilename)}.${formatStr}`;
            } else {
                filename = `${Date.now()}.${formatStr}`;
            }

            const userImagesDir = directories?.userImages ?? '';
            const sanitizedFilename = sanitize(filename);
            let pathToNewFile: string;

            const chName = body.ch_name;
            if (typeof chName === 'string' && chName.length > 0) {
                pathToNewFile = path.join(userImagesDir, sanitize(chName), sanitizedFilename);
            } else {
                pathToNewFile = path.join(userImagesDir, sanitizedFilename);
            }

            await fsp.mkdir(path.dirname(pathToNewFile), { recursive: true });
            const imageBuffer = Buffer.from(image, 'base64');
            await fsp.writeFile(pathToNewFile, imageBuffer);

            const rootDir = directories?.root ?? '';
            return { path: clientRelativePath(rootDir, pathToNewFile) };
        } catch (error) {
            console.error(error);
            set.status = 500;
            return { error: 'Failed to save the image' };
        }
    })
    .post('/list/:folder?', async (context) => {
        const { params, set } = context;

        const bodyAny = ((context as Record<string, unknown>).body ?? {}) as Record<string, unknown>;
        const user = (context as Record<string, unknown>).user as UserContext | undefined;
        const directories = user?.directories;

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
            if (typeof folder !== 'string' || folder.length === 0) {
                set.status = 400;
                return { error: 'No folder specified' };
            }

            const userImagesDir = directories?.userImages ?? '';
            const directoryPath = path.join(userImagesDir, sanitize(folder));
            const type = Number(bodyAny.type ?? MEDIA_REQUEST_TYPE.IMAGE);
            const sort = typeof bodyAny.sortField === 'string' ? bodyAny.sortField : 'date';
            const order = typeof bodyAny.sortOrder === 'string' ? bodyAny.sortOrder : 'asc';

            try {
                await fsp.access(directoryPath);
            } catch {
                await fsp.mkdir(directoryPath, { recursive: true });
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
    .post('/folders', async (context) => {
        const { set } = context;

        const user = (context as Record<string, unknown>).user as UserContext | undefined;
        const directories = user?.directories;

        try {
            const directoryPath = directories?.userImages ?? '';

            let dirents: import('node:fs').Dirent[];
            try {
                dirents = await fsp.readdir(directoryPath, { withFileTypes: true });
            } catch {
                await fsp.mkdir(directoryPath, { recursive: true });
                return [];
            }

            const folders: string[] = [];
            for (const dirent of dirents) {
                if (dirent.isDirectory()) {
                    folders.push(dirent.name);
                }
            }

            return folders;
        } catch (error) {
            console.error(error);
            set.status = 500;
            return { error: 'Unable to retrieve folders' };
        }
    })
    .post('/delete', async (context) => {
        const { set } = context;

        const bodyAny = ((context as Record<string, unknown>).body ?? {}) as Record<string, unknown>;
        const user = (context as Record<string, unknown>).user as UserContext | undefined;
        const directories = user?.directories;

        try {
            const reqPath = bodyAny.path;
            if (typeof reqPath !== 'string' || reqPath.length === 0) {
                set.status = 400;
                return 'No path specified';
            }

            const rootDir = directories?.root ?? '';
            const userImagesDir = directories?.userImages ?? '';
            const pathToDelete = path.join(rootDir, reqPath);

            if (!isPathUnderParent(userImagesDir, pathToDelete)) {
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
    });
