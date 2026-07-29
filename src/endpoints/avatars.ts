import path from 'node:path';
import fsp from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import writeFileAtomic from 'write-file-atomic';

import { getImages, tryParse } from '../util.js';
import { applyAvatarCropResize } from './characters.js';
import { invalidateThumbnail } from './thumbnails.js';
import { UPLOADS_DIRECTORY } from '../constants.js';

interface UserDirectories {
    avatars?: string;
    [key: string]: unknown;
}

interface UserContext {
    directories?: UserDirectories;
    [key: string]: unknown;
}

export const router = new Elysia({ prefix: '/api/avatars' })
    .post('/get', (context) => {
        const ctx = context as Record<string, unknown>;
        const user = ctx.user as UserContext | undefined;
        const avatarsDir = user?.directories?.avatars ?? '';

        return getImages(avatarsDir);
    })
    .post('/delete', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const body = ctx.body as Record<string, unknown> | undefined;
        const avatar = body?.avatar;

        if (typeof avatar !== 'string') {
            set.status = 404;
            return;
        }

        const sanitizedAvatar = sanitize(avatar);
        if (avatar !== sanitizedAvatar) {
            console.error('Malicious avatar name prevented');
            set.status = 403;
            return;
        }

        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;
        const avatarsDir = directories?.avatars ?? '';
        const fileName = path.join(avatarsDir, sanitizedAvatar);

        try {
            await fsp.unlink(fileName);
            invalidateThumbnail(directories as any, 'persona', sanitizedAvatar);
            return { result: 'ok' };
        } catch {
            set.status = 404;
            return;
        }
    })
    .post('/upload', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const user = ctx.user as UserContext | undefined;
        const uploadedFile = ctx.file as { destination?: string; filename?: string } | undefined;
        const body = ctx.body as Record<string, unknown> | undefined;

        const fileObj = body?.avatar;

        if (!uploadedFile && (!body || !fileObj)) {
            set.status = 400;
            return;
        }

        let pathToUpload: string | null = null;
        let needsCleanup = false;

        try {
            if (uploadedFile) {
                // Express bridge mode — multer already wrote the file to disk
                pathToUpload = path.join(
                    uploadedFile.destination ?? '',
                    uploadedFile.filename ?? '',
                );
                needsCleanup = true;
            } else {
                // Elysia-native mode — file is a File object in body.avatar
                if (typeof fileObj !== 'object' || !fileObj || !('arrayBuffer' in fileObj)) {
                    set.status = 400;
                    return;
                }
                const buffer = Buffer.from(await (fileObj as File).arrayBuffer());
                const dataRoot = (globalThis as Record<string, unknown>).DATA_ROOT as string ?? '';
                const uploadsDir = path.join(dataRoot, UPLOADS_DIRECTORY);
                const tempName = randomUUID();
                pathToUpload = path.join(uploadsDir, tempName);
                await fsp.writeFile(pathToUpload, buffer);
                needsCleanup = true;
            }

            const crop = tryParse(body?.crop as string);
            const fileBuffer = await fsp.readFile(pathToUpload);
            const image = await applyAvatarCropResize(fileBuffer, crop);

            const overwriteNameRaw = body?.overwrite_name as string | undefined;
            let filename: string;

            if (overwriteNameRaw) {
                filename = sanitize(overwriteNameRaw);
                invalidateThumbnail(user?.directories as any, 'persona', filename);
            } else {
                filename = `${Date.now()}.png`;
            }

            const directories = user?.directories;
            const avatarsDir = directories?.avatars ?? '';
            const pathToNewFile = path.join(avatarsDir, filename);

            await writeFileAtomic(pathToNewFile, image);

            return { path: filename };
        } catch (err) {
            console.error('Error uploading user avatar:', err);
            set.status = 400;
            return 'Is not a valid image';
        } finally {
            if (needsCleanup && pathToUpload) {
                fsp.unlink(pathToUpload).catch(() => {});
            }
        }
    });
