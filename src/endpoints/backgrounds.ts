import fsp from 'node:fs/promises';
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

interface UserDirectories {
    backgrounds?: string;
    root?: string;
    [key: string]: unknown;
}

interface UserContext {
    directories?: UserDirectories;
    [key: string]: unknown;
}

interface MetadataItem {
    isAnimated?: boolean;
    folderIds?: string[];
    [key: string]: unknown;
}

interface MetadataIndex {
    folders?: unknown[];
    images: Record<string, MetadataItem>;
}

export const router = new Elysia({ prefix: '/api/backgrounds', aot: false })
    .post('/all', async (context) => {
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;
        const backgroundsDir = directories?.backgrounds ?? '';
        const rootDir = directories?.root ?? '';

        try {
            const images = getImages(backgroundsDir);
            const relativePaths = images.map((img) => path.join('backgrounds', String(img)));

            const { results: metadataMap } = await getOrGenerateMetadataBatch(
                rootDir,
                relativePaths,
                'bg',
            );

            const metaRecord = metadataMap as Record<string, MetadataItem | undefined> | undefined;

            const imagesWithMetadata = images.map((img) => {
                const relPath = path.join('backgrounds', String(img));
                const metadata = metaRecord?.[relPath];
                return {
                    filename: img,
                    isAnimated: Boolean(metadata?.isAnimated),
                };
            });

            const bgDims = thumbnailDimensions.bg;
            const config = {
                width: bgDims?.[0] ?? 160,
                height: bgDims?.[1] ?? 90,
            };

            return { images: imagesWithMetadata, config };
        } catch (error) {
            console.error('[Backgrounds] Error fetching backgrounds:', error);
            const { set } = context;
            set.status = 500;
            return { error: 'Failed to fetch backgrounds' };
        }
    })
    .post('/folders', async (context) => {
        const user = context.user as UserContext | undefined;
        const rootDir = user?.directories?.root ?? '';

        try {
            const index = (await readMetadataIndex(rootDir)) as unknown as MetadataIndex;
            const folders = index.folders || [];
            const images = index.images || {};

            const imageFolderMap: Record<string, string[]> = {};

            for (const relativePath in images) {
                if (Object.hasOwn(images, relativePath)) {
                    const meta = images[relativePath];
                    const folderIds = meta?.folderIds;

                    if (Array.isArray(folderIds) && folderIds.length > 0) {
                        const lastSlash = Math.max(
                            relativePath.lastIndexOf('/'),
                            relativePath.lastIndexOf('\\'),
                        );
                        const filename =
                            lastSlash !== -1 ? relativePath.slice(lastSlash + 1) : relativePath;
                        imageFolderMap[filename] = folderIds;
                    }
                }
            }

            return { folders, imageFolderMap };
        } catch (error) {
            console.error('[Backgrounds] Folders endpoint error:', error);
            const { set } = context;
            set.status = 500;
            return { error: 'Internal server error.' };
        }
    })
    .post('/delete', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;

        try {
            if (!body) {
                set.status = 400;
                return;
            }

            const bg = body.bg;
            if (typeof bg !== 'string') {
                set.status = 400;
                return;
            }

            const sanitizedBg = sanitize(bg);
            if (bg !== sanitizedBg) {
                console.error('Malicious bg name prevented');
                set.status = 403;
                return;
            }

            const user = context.user as UserContext | undefined;
            const directories = user?.directories;
            const backgroundsDir = directories?.backgrounds ?? '';
            const rootDir = directories?.root ?? '';

            const fileName = path.join(backgroundsDir, sanitizedBg);

            try {
                await fsp.unlink(fileName);
            } catch {
                console.error('BG file not found');
                set.status = 400;
                return;
            }

            invalidateThumbnail(directories as any, 'bg', sanitizedBg);

            const relativePath = path.join('backgrounds', sanitizedBg);
            removeMetadata(rootDir, relativePath).catch((err: Error) => {
                console.warn('[Backgrounds] Failed to remove metadata:', err.message);
            });

            return 'ok';
        } catch (err) {
            console.error(err);
            set.status = 500;
        }
    })
    .post('/rename', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;

        try {
            if (!body) {
                set.status = 400;
                return;
            }

            const oldBg = body.old_bg;
            const newBg = body.new_bg;

            if (typeof oldBg !== 'string' || typeof newBg !== 'string') {
                set.status = 400;
                return;
            }

            const sanitizedOldBg = sanitize(oldBg);
            const sanitizedNewBg = sanitize(newBg);

            const user = context.user as UserContext | undefined;
            const directories = user?.directories;
            const backgroundsDir = directories?.backgrounds ?? '';
            const rootDir = directories?.root ?? '';

            const oldFileName = path.join(backgroundsDir, sanitizedOldBg);
            const newFileName = path.join(backgroundsDir, sanitizedNewBg);

            try {
                await fsp.access(oldFileName);
            } catch {
                console.error('BG file not found');
                set.status = 400;
                return;
            }

            try {
                await fsp.access(newFileName);
                console.error('New BG file already exists');
                set.status = 400;
                return;
            } catch {
                // target file does not exist, proceed
            }

            await fsp.copyFile(oldFileName, newFileName);
            await fsp.unlink(oldFileName);

            invalidateThumbnail(directories as any, 'bg', sanitizedOldBg);

            const oldRelativePath = path.join('backgrounds', sanitizedOldBg);
            const newRelativePath = path.join('backgrounds', sanitizedNewBg);

            renameMetadata(rootDir, oldRelativePath, newRelativePath).catch((err: Error) => {
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
        const user = context.user as UserContext | undefined;
        const file = context.file as
            | { destination?: string; filename?: string; originalname?: string }
            | undefined;

        try {
            if (!file || !file.destination || !file.filename || !file.originalname) {
                set.status = 400;
                return;
            }

            const imgPath = path.join(file.destination, file.filename);
            const filename = sanitize(file.originalname);

            const directories = user?.directories;
            const backgroundsDir = directories?.backgrounds ?? '';
            const rootDir = directories?.root ?? '';

            const destPath = path.join(backgroundsDir, filename);

            await fsp.copyFile(imgPath, destPath);
            await fsp.unlink(imgPath);

            invalidateThumbnail(directories as any, 'bg', filename);

            const relativePath = path.join('backgrounds', filename);
            getOrGenerateMetadataBatch(rootDir, [relativePath], 'bg').catch((err: Error) => {
                console.warn('[Backgrounds] Failed to generate metadata for upload:', err.message);
            });

            return filename;
        } catch (err) {
            console.error(err);
            set.status = 500;
        }
    });
