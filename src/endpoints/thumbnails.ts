import fs from 'node:fs';
import path from 'node:path';
import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import { imageSize as sizeOf } from 'image-size';

import { getConfigValue } from '../util.js';
import {
    getThumbnailResolution,
    isAnimatedWebP,
    isAnimatedApng,
    thumbnailDimensions as dimensions,
} from './image-metadata.js';

export const SKIPPED_EXTENSIONS = new Set([
    '.apng',
    '.mp4',
    '.webm',
    '.avi',
    '.mkv',
    '.flv',
    '.gif',
]);
export const ALLOWED_IMAGE_EXTENSIONS = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.bmp',
    '.tif',
    '.tiff',
    '.apng',
]);

const thumbnailsEnabled = !!getConfigValue('thumbnails.enabled', true, 'boolean' as const);
const quality = Math.min(
    100,
    Math.max(1, parseInt(getConfigValue('thumbnails.quality', 95, 'number' as const))),
);
const pngFormat = String(getConfigValue('thumbnails.format', 'jpg')).toLowerCase().trim() === 'png';

function getThumbnailFolder(
    directories: Record<string, string>,
    type: 'bg' | 'avatar' | 'persona',
) {
    switch (type) {
        case 'bg':
            return directories.thumbnailsBg;
        case 'avatar':
            return directories.thumbnailsAvatar;
        case 'persona':
            return directories.thumbnailsPersona;
    }
}

function getOriginalFolder(directories: Record<string, string>, type: 'bg' | 'avatar' | 'persona') {
    switch (type) {
        case 'bg':
            return directories.backgrounds;
        case 'avatar':
            return directories.characters;
        case 'persona':
            return directories.avatars;
    }
}

export function invalidateThumbnail(
    directories: Record<string, string>,
    type: 'bg' | 'avatar' | 'persona',
    file: string,
) {
    const folder = getThumbnailFolder(directories, type);
    if (folder === undefined) throw new Error('Invalid thumbnail type');

    const pathToThumbnail = path.join(folder, sanitize(file));

    if (fs.existsSync(pathToThumbnail)) {
        fs.unlinkSync(pathToThumbnail);
    }
}

export async function generateThumbnail(
    directories: Record<string, string>,
    type: 'bg' | 'avatar' | 'persona',
    file: string,
    forceGenerate = false,
    isKnownAnimated: boolean | null = null,
) {
    if (isKnownAnimated) {
        return { path: null, aspectRatio: null, resolution: null };
    }

    const thumbnailFolder = getThumbnailFolder(directories, type);
    const originalFolder = getOriginalFolder(directories, type);
    if (thumbnailFolder === undefined || originalFolder === undefined)
        throw new Error('Invalid thumbnail type');
    const pathToCachedFile = path.join(thumbnailFolder, file);

    try {
        const pathToOriginalFile = path.join(originalFolder, file);

        if (!forceGenerate && fs.existsSync(pathToCachedFile)) {
            try {
                const originalFileExists = fs.existsSync(pathToOriginalFile);
                if (originalFileExists) {
                    const originalStat = fs.statSync(pathToOriginalFile);
                    const cachedStat = fs.statSync(pathToCachedFile);
                    if (originalStat.mtimeMs > cachedStat.ctimeMs) {
                        forceGenerate = true;
                    }
                }
                if (!forceGenerate) {
                    const buffer = fs.readFileSync(pathToCachedFile);
                    const fileDimensions = sizeOf(buffer);
                    const ratio =
                        fileDimensions.height > 0
                            ? fileDimensions.width / fileDimensions.height
                            : 1.0;
                    const resolution = getThumbnailResolution(type);
                    return { path: pathToCachedFile, aspectRatio: ratio, resolution };
                }
            } catch {
                forceGenerate = true;
            }
        }
        if (!fs.existsSync(pathToOriginalFile)) {
            console.error(
                `[generateThumbnail] Cannot generate thumbnail, original file not found: ${pathToOriginalFile}`,
            );
            return { path: null, aspectRatio: null, resolution: null };
        }

        const fileExtension = path.extname(file).toLowerCase();

        if (fileExtension === '.webp' && isKnownAnimated !== false) {
            const buffer = fs.readFileSync(pathToOriginalFile);
            const isAnimated = isAnimatedWebP(buffer);
            if (isAnimated) return { path: null, aspectRatio: null, resolution: null };
        }

        if (fileExtension === '.png' && isKnownAnimated !== false) {
            const buffer = fs.readFileSync(pathToOriginalFile);
            const isAnimated = isAnimatedApng(buffer);
            if (isAnimated) return { path: null, aspectRatio: null, resolution: null };
        }

        if (SKIPPED_EXTENSIONS.has(fileExtension)) {
            return { path: null, aspectRatio: null, resolution: null };
        }

        const result = await processSingleImage(file, originalFolder, thumbnailFolder, type);
        if (result.success) {
            return {
                path: pathToCachedFile,
                aspectRatio: result.aspectRatio ?? null,
                resolution: result.resolution ?? null,
            };
        } else {
            console.error(`[generateThumbnail] Failed to process image ${file}:`, result.error);
            return { path: null, aspectRatio: null, resolution: null };
        }
    } catch (error) {
        console.error(`[generateThumbnail] Unexpected error processing ${file}:`, error);
        return { path: null, aspectRatio: null, resolution: null };
    }
}

async function processSingleImage(
    file: string,
    originalFolder: string,
    thumbnailFolder: string,
    type: 'bg' | 'avatar' | 'persona',
) {
    const pathToOriginalFile = path.join(originalFolder, file);
    const pathToCachedFile = path.join(thumbnailFolder, file);

    try {
        const fileBuffer = fs.readFileSync(pathToOriginalFile);
        const metadata = await new Bun.Image(fileBuffer).metadata();
        const originalWidth = metadata.width ?? 0;
        const originalHeight = metadata.height ?? 0;
        const aspectRatio = originalHeight > 0 ? originalWidth / originalHeight : 1.0;

        const thumbnailResolution = getThumbnailResolution(type);

        let pipeline = new Bun.Image(fileBuffer);

        if (type === 'bg') {
            const [configWidth, configHeight] = dimensions[type];
            const targetPixelArea = configWidth! * configHeight!;
            const thumbWidth = Math.round(Math.sqrt(targetPixelArea * aspectRatio));
            const thumbHeight = Math.round(Math.sqrt(targetPixelArea / aspectRatio));
            pipeline = pipeline.resize(thumbWidth, thumbHeight);
        } else if (type === 'avatar' || type === 'persona') {
            const [configWidth, configHeight] = dimensions[type];
            pipeline = pipeline.resize(configWidth!, configHeight!);
        }

        const buffer = pngFormat
            ? await pipeline.png().buffer()
            : await pipeline.jpeg({ quality }).buffer();

        writeFileAtomicSync(pathToCachedFile, buffer);
        return { success: true, aspectRatio, resolution: thumbnailResolution };
    } catch (error) {
        console.warn(`[Thumbnails] Failed to process image ${file}:`, error);
        return { success: false, filename: file, error: (error as Error).message };
    }
}

// Public router (GET / — serve thumbnails)
const publicRouter = new Elysia({ prefix: '/thumbnail' }).get('/', async (context) => {
    const { query, set } = context;
    const user = (context as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
    > | null;
    const directories = user?.directories as Record<string, string> | undefined;

    try {
        const rawFile = query.file as string | undefined;
        const type = query.type as string | undefined;
        const animated = query.animated as string | undefined;

        if (typeof rawFile !== 'string' || typeof type !== 'string') {
            set.status = 400;
            return;
        }
        if (!(type === 'bg' || type === 'avatar' || type === 'persona')) {
            set.status = 400;
            return;
        }

        const file = sanitize(rawFile);
        if (file !== rawFile) {
            set.status = 403;
            return;
        }

        const serveOriginal = () => {
            const folder = getOriginalFolder(
                directories ?? {},
                type as 'bg' | 'avatar' | 'persona',
            );
            const pathToOriginalFile = path.resolve(path.join(folder ?? '', file));
            if (!fs.existsSync(pathToOriginalFile)) {
                set.status = 404;
                return;
            }
            return new Response(Bun.file(pathToOriginalFile));
        };

        if (!thumbnailsEnabled) {
            return serveOriginal();
        }

        const animatedEnabled = animated === 'true';
        const fileExtension = path.extname(file).toLowerCase();
        const isAnimatedFormat = SKIPPED_EXTENSIONS.has(fileExtension);

        if ((animatedEnabled && isAnimatedFormat) || fileExtension === '.gif') {
            return serveOriginal();
        }

        const thumbnailFolder = getThumbnailFolder(
            directories ?? {},
            type as 'bg' | 'avatar' | 'persona',
        );
        const pathToCachedFile = path.join(thumbnailFolder ?? '', file);

        if (!fs.existsSync(pathToCachedFile)) {
            const thumbResult = await generateThumbnail(
                directories ?? {},
                type as 'bg' | 'avatar' | 'persona',
                file,
                false,
            );
            if (!thumbResult.path) {
                return serveOriginal();
            }
        }

        if (fs.existsSync(pathToCachedFile)) {
            return new Response(Bun.file(pathToCachedFile));
        }

        set.status = 404;
    } catch (error) {
        console.error('Failed getting thumbnail', error);
        set.status = 500;
    }
});

// API router (currently empty, placeholder for future routes)
const apiRouter = new Elysia();

// Combined export — mounted at /thumbnail in server.ts
const router = new Elysia();
router.use(publicRouter);
router.use(apiRouter);

export { publicRouter, apiRouter, router };
