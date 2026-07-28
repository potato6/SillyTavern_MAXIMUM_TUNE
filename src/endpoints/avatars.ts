import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { getImages, tryParse } from '../util.js';
import { applyAvatarCropResize } from './characters.js';
import { invalidateThumbnail } from './thumbnails.js';
import { UPLOADS_DIRECTORY } from '../constants.js';

export const router = new Elysia({ prefix: '/api/avatars' })
    .post('/get', (context) => {
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const images = getImages(directories?.avatars ?? '');
        return images;
    })
    .post('/delete', (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const bodyAny = body as Record<string, unknown>;

        const avatar = bodyAny.avatar as string;
        if (avatar !== sanitize(avatar)) {
            console.error('Malicious avatar name prevented');
            set.status = 403;
            return;
        }

        const fileName = path.join(directories?.avatars ?? '', sanitize(avatar));

        if (fs.existsSync(fileName)) {
            fs.unlinkSync(fileName);
            invalidateThumbnail(directories as any, 'persona', sanitize(avatar));
            return { result: 'ok' };
        }

        set.status = 404;
    })
    .post('/upload', async (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const uploadedFile = (context as unknown as Record<string, unknown>).file as Record<
            string,
            unknown
        > | null;

        if (!uploadedFile && (!body || !(body as Record<string, unknown>).avatar)) {
            set.status = 400;
            return;
        }

        try {
            let pathToUpload: string | null = null;
            let needsCleanup = false;

            if (uploadedFile) {
                // Express bridge mode — multer already wrote the file to disk
                pathToUpload = path.join(
                    uploadedFile.destination as string,
                    uploadedFile.filename as string,
                );
                needsCleanup = true;
            } else {
                // Elysia-native mode — file is a File object in body.avatar
                const fileObj = (body as Record<string, unknown>).avatar as File;
                if (typeof fileObj !== 'object' || !fileObj || !('arrayBuffer' in fileObj)) {
                    set.status = 400;
                    return;
                }
                const buffer = Buffer.from(await fileObj.arrayBuffer());
                const uploadsDir = path.join(globalThis.DATA_ROOT as string, UPLOADS_DIRECTORY);
                const tempName = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
                pathToUpload = path.join(uploadsDir, tempName);
                await fsp.writeFile(pathToUpload, buffer);
                needsCleanup = true;
            }

            const crop = tryParse((body as Record<string, unknown>).crop as string);
            const fileBuffer = fs.readFileSync(pathToUpload!);
            const image = await applyAvatarCropResize(fileBuffer, crop);

            if ((body as Record<string, unknown>).overwrite_name) {
                invalidateThumbnail(
                    directories as any,
                    'persona',
                    sanitize((body as Record<string, unknown>).overwrite_name as string),
                );
            }

            const filename = sanitize(
                ((body as Record<string, unknown>).overwrite_name as string) || `${Date.now()}.png`,
            );
            const pathToNewFile = path.join(directories?.avatars ?? '', filename);
            writeFileAtomicSync(pathToNewFile, image);

            if (needsCleanup && pathToUpload && fs.existsSync(pathToUpload)) {
                fs.unlinkSync(pathToUpload);
            }

            return { path: filename };
        } catch (err) {
            console.error('Error uploading user avatar:', err);
            set.status = 400;
            return 'Is not a valid image';
        }
    });
