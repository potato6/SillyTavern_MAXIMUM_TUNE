import fs from 'node:fs';
import path from 'node:path';
import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';

import { invalidateThumbnail } from './thumbnails.js';
import {
    thumbnailDimensions,
    readMetadataIndex,
    renameMetadata,
    removeMetadata,
    getOrGenerateMetadataBatch,
} from './image-metadata.js';
import { getImages } from '../util.js';

export const router = new Elysia({ prefix: '/api/backgrounds' })
    .post('/all', async (context) => {
        const user = (context as unknown as Record<string, unknown>).user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            const images = getImages(directories?.backgrounds ?? '');
            const config = { width: thumbnailDimensions.bg[0], height: thumbnailDimensions.bg[1] };

            const relativePaths = images.map((img) => path.join('backgrounds', img));
            const { results: metadataMap } = await getOrGenerateMetadataBatch(
                directories?.root ?? '',
                relativePaths,
                'bg',
            );

            const imagesWithMetadata = images.map((img) => {
                const relativePath = path.join('backgrounds', img);
                const metadata = (metadataMap as Record<string, unknown>)?.[relativePath] as Record<string, unknown> | undefined;
                return {
                    filename: img,
                    isAnimated: metadata?.isAnimated ?? false,
                };
            });

            return { images: imagesWithMetadata, config };
        } catch (error) {
            console.error('[Backgrounds] Error fetching backgrounds:', error);
            return new Response(JSON.stringify({ error: 'Failed to fetch backgrounds' }), { status: 500 });
        }
    })
    .post('/folders', async (context) => {
        const user = (context as unknown as Record<string, unknown>).user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            const index = await readMetadataIndex(directories?.root ?? '');
            const folders = index.folders || [];

            const imageFolderMap: Record<string, string[]> = {};
            for (const [relativePath, meta] of Object.entries(index.images)) {
                if (Array.isArray(meta.folderIds) && meta.folderIds.length > 0) {
                    const filename = relativePath.split('/').pop() || relativePath;
                    imageFolderMap[filename] = meta.folderIds;
                }
            }

            return { folders, imageFolderMap };
        } catch (error) {
            console.error('[Backgrounds] Folders endpoint error:', error);
            return new Response(JSON.stringify({ error: 'Internal server error.' }), { status: 500 });
        }
    })
    .post('/delete', (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const bodyAny = body as Record<string, unknown>;

        try {
            if (!bodyAny) {
                set.status = 400;
                return;
            }

            const bg = bodyAny.bg as string;
            if (bg !== sanitize(bg)) {
                console.error('Malicious bg name prevented');
                set.status = 403;
                return;
            }

            const fileName = path.join(directories?.backgrounds ?? '', sanitize(bg));

            if (!fs.existsSync(fileName)) {
                console.error('BG file not found');
                set.status = 400;
                return;
            }

            fs.unlinkSync(fileName);
            invalidateThumbnail(directories as any, 'bg', bg);

            const relativePath = path.join('backgrounds', bg);
            removeMetadata(directories?.root ?? '', relativePath).catch((err: Error) => {
                console.warn('[Backgrounds] Failed to remove metadata:', err.message);
            });

            return 'ok';
        } catch (err) {
            console.error(err);
            set.status = 500;
        }
    })
    .post('/rename', (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const bodyAny = body as Record<string, unknown>;

        try {
            if (!bodyAny) {
                set.status = 400;
                return;
            }

            const oldFileName = path.join(directories?.backgrounds ?? '', sanitize(bodyAny.old_bg as string));
            const newFileName = path.join(directories?.backgrounds ?? '', sanitize(bodyAny.new_bg as string));

            if (!fs.existsSync(oldFileName)) {
                console.error('BG file not found');
                set.status = 400;
                return;
            }

            if (fs.existsSync(newFileName)) {
                console.error('New BG file already exists');
                set.status = 400;
                return;
            }

            fs.copyFileSync(oldFileName, newFileName);
            fs.unlinkSync(oldFileName);
            invalidateThumbnail(directories as any, 'bg', bodyAny.old_bg as string);

            const oldRelativePath = path.join('backgrounds', bodyAny.old_bg as string);
            const newRelativePath = path.join('backgrounds', bodyAny.new_bg as string);
            renameMetadata(directories?.root ?? '', oldRelativePath, newRelativePath).catch((err: Error) => {
                console.warn('[Backgrounds] Failed to rename metadata:', err.message);
            });

            return 'ok';
        } catch (err) {
            console.error(err);
            set.status = 500;
        }
    })
    .post('/upload', async (context) => {
        const { set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const file = (context as unknown as Record<string, unknown>).file as Record<string, unknown> | null;

        try {
            if (!file) {
                set.status = 400;
                return;
            }

            const img_path = path.join(file.destination as string, file.filename as string);
            const filename = sanitize(file.originalname as string);
            fs.copyFileSync(img_path, path.join(directories?.backgrounds ?? '', filename));
            fs.unlinkSync(img_path);
            invalidateThumbnail(directories as any, 'bg', filename);

            const relativePath = path.join('backgrounds', filename);
            getOrGenerateMetadataBatch(directories?.root ?? '', [relativePath], 'bg').catch(
                (err: Error) => {
                    console.warn('[Backgrounds] Failed to generate metadata for upload:', err.message);
                },
            );

            return filename;
        } catch (err) {
            console.error(err);
            set.status = 500;
        }
    });
