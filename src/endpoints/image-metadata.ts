import * as fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { imageSize } from 'image-size';
import writeFileAtomic from 'write-file-atomic';
import { Elysia } from 'elysia';
import { inflateSync } from 'node:zlib';
import { getConfigValue, isPathUnderParent, uuidv4 } from '../util.js';

export const METADATA_FILE = 'image-metadata.json';

export interface ImageMetadata {
    hash?: string;
    aspectRatio?: number;
    isAnimated?: boolean;
    dominantColor?: string;
    folderIds: string[];
    addedTimestamp?: number;
    thumbnailResolution?: number;
    mtime?: number;
}

export interface MetadataIndex {
    version: number;
    images: Record<string, ImageMetadata>;
    folders: Array<{ id: string; name: string; thumbnailFile: string }>;
}

export type ThumbnailType = 'bg' | 'avatar' | 'persona';

interface UserDirectories {
    root?: string;
    [key: string]: unknown;
}

interface UserContext {
    directories?: UserDirectories;
    [key: string]: unknown;
}

export const thumbnailDimensions: Record<string, number[]> = {
    bg: getConfigValue('thumbnails.dimensions.bg', [160, 90]) as number[],
    avatar: getConfigValue('thumbnails.dimensions.avatar', [96, 144]) as number[],
    persona: getConfigValue('thumbnails.dimensions.persona', [96, 144]) as number[],
};

function getUserRoot(ctx: Record<string, unknown>): string {
    const user = ctx.user as UserContext | undefined;
    return user?.directories?.root ?? '';
}

/**
 * Gets the configured resolution for a given thumbnail type.
 * @param {ThumbnailType} type Thumbnail type
 * @returns {number} Resolution (width * height)
 */
export function getThumbnailResolution(type: ThumbnailType): number {
    const dims = thumbnailDimensions[type];
    if (Array.isArray(dims) && dims.length >= 2) {
        return (dims[0] as number) * (dims[1] as number);
    }
    return 0;
}

/**
 * Checks if a buffer contains an animated PNG (APNG) by looking for the 'acTL' chunk.
 * @param {Buffer} buffer The file buffer.
 * @returns {boolean} True if the PNG is animated
 */
export function isAnimatedApng(buffer: Buffer): boolean {
    const header = buffer.length > 200 ? buffer.subarray(0, 200) : buffer;
    return header.includes('acTL');
}

/**
 * Checks if a WebP buffer is animated by looking for 'ANIM' or 'ANMF' chunks.
 * @param {Buffer} buffer The WebP file buffer (can be full file or header)
 * @returns {boolean} True if the WebP is animated
 */
export function isAnimatedWebP(buffer: Buffer): boolean {
    const header = buffer.length > 200 ? buffer.subarray(0, 200) : buffer;
    return header.includes('ANIM') || header.includes('ANMF');
}

/**
 * Calculate average color using Bun.Image.
 * Resizes the image to 1x1 to efficiently get the average color.
 * @param {Buffer} buffer The image buffer.
 * @returns {Promise<string>} The average color as a hex string (e.g., '#RRGGBB').
 */
async function getAverageColor(buffer: Buffer): Promise<string> {
    try {
        const pngBuf = await new Bun.Image(buffer).resize(1, 1).png().buffer();
        const pixel = new Uint8Array(pngBuf);
        let offset = 8;
        const len = pixel.length;
        const view = new DataView(pixel.buffer, pixel.byteOffset, len);

        while (offset < len) {
            const length = view.getUint32(offset);
            // Check chunk type 'IDAT' (I=73, D=68, A=65, T=84)
            if (
                pixel[offset + 4] === 73 &&
                pixel[offset + 5] === 68 &&
                pixel[offset + 6] === 65 &&
                pixel[offset + 7] === 84
            ) {
                const compressed = pixel.subarray(offset + 8, offset + 8 + length);
                const raw = inflateSync(compressed);
                const r = (raw[1] as number).toString(16).padStart(2, '0');
                const g = (raw[2] as number).toString(16).padStart(2, '0');
                const b = (raw[3] as number).toString(16).padStart(2, '0');
                return `#${r}${g}${b}`;
            }
            offset += 12 + length;
        }
        return '#808080';
    } catch (error: any) {
        console.warn('[Bun.Image] Failed to calculate average color:', error.message);
        return '#808080';
    }
}

/**
 * Generates metadata for a single image file.
 * @param {string} filePath - The full path to the image file.
 * @param {ThumbnailType} type - The thumbnail type for resolution calculation.
 * @returns {Promise<ImageMetadata>} A metadata object. Throws an error if processing fails.
 */
export async function generateImageMetadata(
    filePath: string,
    type: ThumbnailType,
): Promise<ImageMetadata> {
    const buffer = await fs.readFile(filePath);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const dimensions = imageSize(buffer);

    if (!dimensions || !dimensions.width || !dimensions.height) {
        throw new Error('Could not determine image dimensions.');
    }

    const aspectRatio = dimensions.width / dimensions.height;
    let isAnimated = false;

    switch (dimensions.type) {
        case 'gif':
            isAnimated = true;
            break;
        case 'png':
            isAnimated = isAnimatedApng(buffer);
            break;
        case 'webp':
            isAnimated = isAnimatedWebP(buffer);
            break;
    }

    const dominantColor = isAnimated ? '#808080' : await getAverageColor(buffer);

    let addedTimestamp: number;
    try {
        const stats = await fs.stat(filePath);
        addedTimestamp = Math.floor(stats.birthtimeMs || stats.mtimeMs);
    } catch {
        addedTimestamp = Date.now();
    }

    return {
        hash,
        aspectRatio: Math.round(aspectRatio * 10000) / 10000,
        isAnimated,
        dominantColor,
        folderIds: [],
        addedTimestamp,
        thumbnailResolution: getThumbnailResolution(type),
    };
}

/**
 * Reads the centralized metadata index from the user data root.
 * @param {string} userDataRoot - Path to the user data directory root
 * @returns {Promise<MetadataIndex>} The metadata index
 */
export async function readMetadataIndex(userDataRoot: string): Promise<MetadataIndex> {
    const indexPath = path.join(userDataRoot, METADATA_FILE);
    try {
        const rawData = await fs.readFile(indexPath, 'utf8');
        return JSON.parse(rawData);
    } catch {
        return { version: 1, images: {}, folders: [] };
    }
}

/**
 * Writes the centralized metadata index to the user data root.
 * @param {string} userDataRoot - Path to the user data directory root
 * @param {MetadataIndex} metadata - The metadata to write
 */
export async function writeMetadataIndex(
    userDataRoot: string,
    metadata: MetadataIndex,
): Promise<void> {
    const indexPath = path.join(userDataRoot, METADATA_FILE);
    const jsonString = JSON.stringify(metadata, null, 4);
    await writeFileAtomic(indexPath, jsonString, 'utf8');
}

/**
 * Gets metadata for multiple images, generating on-demand as needed.
 * Uses relative paths from the user data root as keys in the centralized index.
 * @param {string} userDataRoot - Path to the user data directory root
 * @param {string[]} relativePaths - Array of relative paths from userDataRoot
 * @param {ThumbnailType} type - The thumbnail type for resolution calculation.
 * @returns {Promise<{results: {[key: string]: ImageMetadata}, generatedCount: number}>} Results map and count of newly generated
 */
export async function getOrGenerateMetadataBatch(
    userDataRoot: string,
    relativePaths: string[],
    type: ThumbnailType,
) {
    const results: Record<string, ImageMetadata> = {};
    const index = await readMetadataIndex(userDataRoot);
    let indexModified = false;
    let generatedCount = 0;

    const isPosixSep = path.sep === '/';

    for (const relativePath of relativePaths) {
        const posixPath = isPosixSep ? relativePath : relativePath.replaceAll('\\', '/');
        const fullPath = path.join(userDataRoot, relativePath);

        let stats;
        try {
            stats = await fs.stat(fullPath);
        } catch {
            continue;
        }

        const currentMtime = stats.mtimeMs;
        const cached = index.images[posixPath];

        if (cached && cached.mtime === currentMtime) {
            results[relativePath] = cached;
            continue;
        }

        try {
            const metadata = await generateImageMetadata(fullPath, type);
            metadata.mtime = currentMtime;

            if (cached?.folderIds) {
                metadata.folderIds = cached.folderIds;
            }

            index.images[posixPath] = metadata;
            results[relativePath] = metadata;
            indexModified = true;
            generatedCount++;
        } catch (error) {
            console.warn(
                `[ImageMetadata] Failed to generate metadata for ${relativePath}:`,
                (error as any).message,
            );
        }
    }

    if (indexModified) {
        await writeMetadataIndex(userDataRoot, index);
    }

    return { results, generatedCount };
}

/**
 * Removes metadata for an image from the centralized index.
 * @param {string} userDataRoot - Path to the user data directory root
 * @param {string} relativePath - The relative path to remove
 */
export async function removeMetadata(userDataRoot: string, relativePath: string): Promise<void> {
    const posixPath = path.sep === '/' ? relativePath : relativePath.replaceAll('\\', '/');
    const index = await readMetadataIndex(userDataRoot);
    if (index.images[posixPath]) {
        delete index.images[posixPath];

        const lastSlash = posixPath.lastIndexOf('/');
        const deletedFileName = lastSlash !== -1 ? posixPath.slice(lastSlash + 1) : posixPath;

        const folders = index.folders;
        if (Array.isArray(folders)) {
            for (const folder of folders) {
                if (folder.thumbnailFile === deletedFileName) {
                    folder.thumbnailFile = '';
                }
            }
        }

        await writeMetadataIndex(userDataRoot, index);
    }
}

/**
 * Updates metadata for an image (e.g., after rename).
 * @param {string} userDataRoot - Path to the user data directory root
 * @param {string} oldRelativePath - The old relative path
 * @param {string} newRelativePath - The new relative path
 * @returns {Promise<ImageMetadata|null>} The updated metadata
 */
export async function renameMetadata(
    userDataRoot: string,
    oldRelativePath: string,
    newRelativePath: string,
): Promise<ImageMetadata | null> {
    const isPosixSep = path.sep === '/';
    const posixOldPath = isPosixSep ? oldRelativePath : oldRelativePath.replaceAll('\\', '/');
    const posixNewPath = isPosixSep ? newRelativePath : newRelativePath.replaceAll('\\', '/');

    const index = await readMetadataIndex(userDataRoot);
    const data = index.images[posixOldPath];

    if (!data) {
        throw new Error(`Image '${oldRelativePath}' not found in metadata.`);
    }

    delete index.images[posixOldPath];
    index.images[posixNewPath] = data;

    const lastOld = posixOldPath.lastIndexOf('/');
    const oldFileName = lastOld !== -1 ? posixOldPath.slice(lastOld + 1) : posixOldPath;

    const lastNew = posixNewPath.lastIndexOf('/');
    const newFileName = lastNew !== -1 ? posixNewPath.slice(lastNew + 1) : posixNewPath;

    if (oldFileName !== newFileName && Array.isArray(index.folders)) {
        const folders = index.folders;
        for (const folder of folders) {
            if (folder.thumbnailFile === oldFileName) {
                folder.thumbnailFile = newFileName;
            }
        }
    }

    await writeMetadataIndex(userDataRoot, index);
    return data;
}

/**
 * Cleans up orphaned entries from the metadata index.
 * Iterates over all entries and removes those whose files no longer exist.
 * @param {string} userDataRoot - Path to the user data directory root
 * @returns {Promise<string[]>} Array of removed paths
 */
export async function cleanupOrphanedMetadata(userDataRoot: string): Promise<string[]> {
    const index = await readMetadataIndex(userDataRoot);
    const orphanedPaths: string[] = [];

    for (const [relativePath] of Object.entries(index.images)) {
        const fullPath = path.resolve(userDataRoot, relativePath);

        if (!isPathUnderParent(userDataRoot, fullPath)) {
            orphanedPaths.push(relativePath);
            delete index.images[relativePath];
            continue;
        }

        try {
            await fs.access(fullPath);
        } catch {
            orphanedPaths.push(relativePath);
            delete index.images[relativePath];
        }
    }

    if (orphanedPaths.length > 0) {
        await writeMetadataIndex(userDataRoot, index);
        console.log(`[ImageMetadata] Cleaned up ${orphanedPaths.length} orphaned metadata entries`);
    }

    return orphanedPaths;
}

/**
 * Creates a new virtual folder.
 * @param {string} userDataRoot User data directory root
 * @param {string} name Folder name
 * @returns {Promise<{id: string, name: string, thumbnailFile: string}>} The created folder
 */
export async function createFolder(
    userDataRoot: string,
    name: string,
): Promise<{ id: string; name: string; thumbnailFile: string }> {
    const index = await readMetadataIndex(userDataRoot);
    const id = uuidv4();
    const folder = { id, name, thumbnailFile: '' };
    index.folders.push(folder);
    await writeMetadataIndex(userDataRoot, index);
    return folder;
}

/**
 * Sets thumbnail files for multiple folders in a single atomic read-modify-write.
 * Folders not found in the index are silently skipped.
 * @param {string} userDataRoot User data directory root
 * @param {{id: string, thumbnailFile: string}[]} updates Array of folder ID to thumbnail file mappings
 * @returns {Promise<void>}
 */
export async function setFolderThumbnailsBatch(
    userDataRoot: string,
    updates: { id: string; thumbnailFile: string }[],
): Promise<void> {
    const index = await readMetadataIndex(userDataRoot);
    const folders = index.folders;

    for (const update of updates) {
        const updateId = update.id;
        for (const folder of folders) {
            if (folder.id === updateId) {
                folder.thumbnailFile = update.thumbnailFile;
                break;
            }
        }
    }
    await writeMetadataIndex(userDataRoot, index);
}

/**
 * Renames or updates a virtual folder.
 * @param {string} userDataRoot User data directory root
 * @param {string} folderId Folder ID
 * @param {{name?: string, thumbnailFile?: string}} updates Fields to update
 * @returns {Promise<{id: string, name: string, thumbnailFile: string}>} The updated folder
 */
export async function updateFolder(
    userDataRoot: string,
    folderId: string,
    updates: { name?: string; thumbnailFile?: string },
): Promise<{ id: string; name: string; thumbnailFile: string }> {
    const index = await readMetadataIndex(userDataRoot);
    const folders = index.folders;
    let folder: { id: string; name: string; thumbnailFile: string } | undefined;

    for (const f of folders) {
        if (f.id === folderId) {
            folder = f;
            break;
        }
    }

    if (!folder) throw new Error(`Folder '${folderId}' not found.`);
    if (updates.name !== undefined) folder.name = updates.name;
    if (updates.thumbnailFile !== undefined) folder.thumbnailFile = updates.thumbnailFile;
    await writeMetadataIndex(userDataRoot, index);
    return folder;
}

/**
 * Deletes a virtual folder and removes its ID from all images.
 * @param {string} userDataRoot User data directory root
 * @param {string} folderId Folder ID
 * @returns {Promise<void>}
 */
export async function deleteFolder(userDataRoot: string, folderId: string): Promise<void> {
    const index = await readMetadataIndex(userDataRoot);
    const folders = index.folders;
    let idx = -1;

    for (let i = 0; i < folders.length; i++) {
        const f = folders[i];
        if (f && f.id === folderId) {
            idx = i;
            break;
        }
    }

    if (idx === -1) throw new Error(`Folder '${folderId}' not found.`);
    folders.splice(idx, 1);

    for (const meta of Object.values(index.images)) {
        if (Array.isArray(meta.folderIds)) {
            const fi = meta.folderIds.indexOf(folderId);
            if (fi !== -1) meta.folderIds.splice(fi, 1);
        }
    }

    await writeMetadataIndex(userDataRoot, index);
}

/**
 * Assigns images to a folder.
 * @param {string} userDataRoot User data directory root
 * @param {string} folderId Folder ID
 * @param {string[]} relativePaths Relative paths of images to assign
 * @returns {Promise<void>}
 */
export async function assignImagesToFolder(
    userDataRoot: string,
    folderId: string,
    relativePaths: string[],
): Promise<void> {
    const index = await readMetadataIndex(userDataRoot);
    const folders = index.folders;
    let foundFolder = false;

    for (const f of folders) {
        if (f.id === folderId) {
            foundFolder = true;
            break;
        }
    }

    if (!foundFolder) {
        throw new Error(`Folder '${folderId}' not found.`);
    }

    const isPosixSep = path.sep === '/';

    for (const rp of relativePaths) {
        const posixPath = isPosixSep ? rp : rp.replaceAll('\\', '/');

        const normalized = path.posix.normalize(posixPath);
        if (!normalized.startsWith('backgrounds/') || normalized.includes('..')) {
            throw new Error(`Invalid background path: '${posixPath}'`);
        }

        const absPath = path.join(userDataRoot, normalized);
        try {
            await fs.access(absPath);
        } catch {
            console.warn(`[ImageMetadata] Skipping missing background file: '${posixPath}'`);
            continue;
        }

        let meta = index.images[normalized];
        if (!meta) {
            meta = { folderIds: [] };
            index.images[normalized] = meta;
        }
        if (!Array.isArray(meta.folderIds)) meta.folderIds = [];
        if (!meta.folderIds.includes(folderId)) {
            meta.folderIds.push(folderId);
        }
    }
    await writeMetadataIndex(userDataRoot, index);
}

/**
 * Unassigns images from a folder.
 * @param {string} userDataRoot User data directory root
 * @param {string} folderId Folder ID
 * @param {string[]} relativePaths Relative paths of images to unassign
 * @returns {Promise<void>}
 */
export async function unassignImagesFromFolder(
    userDataRoot: string,
    folderId: string,
    relativePaths: string[],
): Promise<void> {
    const index = await readMetadataIndex(userDataRoot);
    const isPosixSep = path.sep === '/';

    for (const rp of relativePaths) {
        const posixPath = isPosixSep ? rp : rp.replaceAll('\\', '/');
        const meta = index.images[posixPath];
        if (!meta || !Array.isArray(meta.folderIds)) continue;
        const fi = meta.folderIds.indexOf(folderId);
        if (fi !== -1) meta.folderIds.splice(fi, 1);
    }
    await writeMetadataIndex(userDataRoot, index);
}

export const router = new Elysia({ prefix: '/api/image-metadata' })

    /**
     * POST /api/image-metadata/folders/get
     * List all virtual folders.
     */
    .post('/folders/get', async (ctx) => {
        try {
            const index = await readMetadataIndex(getUserRoot(ctx as any));
            return index.folders || [];
        } catch (error) {
            console.error('[ImageMetadata] Folders list error:', error);
            ctx.set.status = 500;
            return { error: 'Internal server error.' };
        }
    })

    /**
     * POST /api/image-metadata/folders/create
     * Create a new folder. Body: { name: string }
     */
    .post('/folders/create', async (ctx) => {
        try {
            const body = (ctx.body ?? {}) as Record<string, unknown>;
            const name = body.name;
            if (!name || typeof name !== 'string') {
                ctx.set.status = 400;
                return { error: '"name" is required.' };
            }
            const folder = await createFolder(getUserRoot(ctx as any), name.trim());
            return folder;
        } catch (error) {
            console.error('[ImageMetadata] Folder create error:', error);
            ctx.set.status = 500;
            return { error: 'Internal server error.' };
        }
    })

    /**
     * POST /api/image-metadata/folders/set-thumbnails
     * Batch-set thumbnail files for multiple folders in one write. Body: { updates: [{id, thumbnailFile}] }
     */
    .post('/folders/set-thumbnails', async (ctx) => {
        try {
            const body = (ctx.body ?? {}) as Record<string, unknown>;
            const updates = body.updates;
            if (
                !Array.isArray(updates) ||
                updates.some((u: any) => !u || !u.id || typeof u.thumbnailFile !== 'string')
            ) {
                ctx.set.status = 400;
                return { error: '"updates" must be an array of {id, thumbnailFile}.' };
            }
            await setFolderThumbnailsBatch(getUserRoot(ctx as any), updates as any[]);
            return { ok: true };
        } catch (error) {
            console.error('[ImageMetadata] Folder set-thumbnails error:', error);
            ctx.set.status = 500;
            return { error: 'Internal server error.' };
        }
    })

    /**
     * POST /api/image-metadata/folders/update
     * Update a folder. Body: { id: string, name?: string, thumbnailFile?: string }
     */
    .post('/folders/update', async (ctx) => {
        try {
            const body = (ctx.body ?? {}) as Record<string, unknown>;
            const { id, ...updates } = body;
            if (!id || typeof id !== 'string') {
                ctx.set.status = 400;
                return { error: '"id" is required.' };
            }
            const folder = await updateFolder(getUserRoot(ctx as any), id, updates);
            return folder;
        } catch (error) {
            if ((error as any).message.includes('not found')) {
                ctx.set.status = 404;
                return { error: (error as any).message };
            }
            console.error('[ImageMetadata] Folder update error:', error);
            ctx.set.status = 500;
            return { error: 'Internal server error.' };
        }
    })

    /**
     * POST /api/image-metadata/folders/delete
     * Delete a folder and unassign all images. Body: { id: string }
     */
    .post('/folders/delete', async (ctx) => {
        try {
            const body = (ctx.body ?? {}) as Record<string, unknown>;
            const id = body.id;
            if (!id || typeof id !== 'string') {
                ctx.set.status = 400;
                return { error: '"id" is required.' };
            }
            await deleteFolder(getUserRoot(ctx as any), id);
            return { ok: true };
        } catch (error) {
            if ((error as any).message.includes('not found')) {
                ctx.set.status = 404;
                return { error: (error as any).message };
            }
            console.error('[ImageMetadata] Folder delete error:', error);
            ctx.set.status = 500;
            return { error: 'Internal server error.' };
        }
    })

    /**
     * POST /api/image-metadata/folders/assign
     * Assign images to a folder. Body: { id: string, paths: string[] }
     */
    .post('/folders/assign', async (ctx) => {
        try {
            const body = (ctx.body ?? {}) as Record<string, unknown>;
            const { id, paths } = body;
            if (!id || typeof id !== 'string') {
                ctx.set.status = 400;
                return { error: '"id" is required.' };
            }
            if (!Array.isArray(paths)) {
                ctx.set.status = 400;
                return { error: '"paths" array is required.' };
            }
            await assignImagesToFolder(getUserRoot(ctx as any), id, paths as string[]);
            return { ok: true };
        } catch (error) {
            if ((error as any).message.includes('not found')) {
                ctx.set.status = 404;
                return { error: (error as any).message };
            }
            console.error('[ImageMetadata] Folder assign error:', error);
            ctx.set.status = 500;
            return { error: 'Internal server error.' };
        }
    })

    /**
     * POST /api/image-metadata/folders/unassign
     * Unassign images from a folder. Body: { id: string, paths: string[] }
     */
    .post('/folders/unassign', async (ctx) => {
        try {
            const body = (ctx.body ?? {}) as Record<string, unknown>;
            const { id, paths } = body;
            if (!id || typeof id !== 'string') {
                ctx.set.status = 400;
                return { error: '"id" is required.' };
            }
            if (!Array.isArray(paths)) {
                ctx.set.status = 400;
                return { error: '"paths" array is required.' };
            }
            await unassignImagesFromFolder(getUserRoot(ctx as any), id, paths as string[]);
            return { ok: true };
        } catch (error) {
            console.error('[ImageMetadata] Folder unassign error:', error);
            ctx.set.status = 500;
            return { error: 'Internal server error.' };
        }
    })

    /**
     * POST /api/image-metadata
     * Get metadata for image(s) by path.
     */
    .post('/', async (ctx) => {
        try {
            const body = (ctx.body ?? {}) as Record<string, unknown>;
            const singlePath = body.path;
            const paths = body.paths;
            const type = body.type as ThumbnailType | undefined;

            if (!singlePath && !paths) {
                ctx.set.status = 400;
                return { error: 'Either "path" or "paths" is required.' };
            }

            const userDataRoot = getUserRoot(ctx as any);

            const validatePath = (relativePath: string) => {
                const fullPath = path.resolve(userDataRoot, relativePath);
                if (!isPathUnderParent(userDataRoot, fullPath)) {
                    throw new Error(`Path "${relativePath}" is outside the user data directory.`);
                }
                return relativePath;
            };

            if (singlePath && !paths) {
                const relativePath = validatePath(singlePath as string);
                const fullPath = path.join(userDataRoot, relativePath);

                try {
                    await fs.access(fullPath);
                } catch {
                    ctx.set.status = 404;
                    return { error: 'File not found.' };
                }

                const { results: metadataResults } = await getOrGenerateMetadataBatch(
                    userDataRoot,
                    [relativePath],
                    type as ThumbnailType,
                );
                const metadata = metadataResults[relativePath];

                if (!metadata) {
                    ctx.set.status = 404;
                    return { error: 'Could not generate metadata for file.' };
                }

                return metadata;
            }

            if (paths && Array.isArray(paths)) {
                const results: Record<string, unknown> = {};
                const validPaths: string[] = [];

                for (const rawPath of paths) {
                    const relativePath = String(rawPath);
                    try {
                        validatePath(relativePath);
                        validPaths.push(relativePath);
                    } catch (error) {
                        results[relativePath] = { error: (error as any).message };
                    }
                }

                const { results: batchMetadata } = await getOrGenerateMetadataBatch(
                    userDataRoot,
                    validPaths,
                    type as ThumbnailType,
                );

                for (const relativePath of validPaths) {
                    const md = batchMetadata[relativePath];
                    if (md) {
                        results[relativePath] = md;
                    } else {
                        results[relativePath] = { error: 'File not found or could not process.' };
                    }
                }

                return results;
            }

            ctx.set.status = 400;
            return { error: 'Invalid request format.' };
        } catch (error) {
            console.error('[ImageMetadata] API error:', error);
            ctx.set.status = 500;
            return { error: 'Internal server error.' };
        }
    })

    /**
     * POST /api/image-metadata/all
     * Get all metadata from the index.
     * @param {string} [prefix] - Optional path prefix to filter results
     */
    .post('/all', async (ctx) => {
        try {
            const body = (ctx.body ?? {}) as Record<string, unknown>;
            const userDataRoot = getUserRoot(ctx as any);
            const prefix = typeof body.prefix === 'string' ? body.prefix : '';
            const index = await readMetadataIndex(userDataRoot);

            if (prefix.length > 0) {
                const filteredImages: Record<string, ImageMetadata> = {};
                const images = index.images;
                for (const key in images) {
                    if (Object.hasOwn(images, key) && key.startsWith(prefix)) {
                        filteredImages[key] = images[key]!;
                    }
                }
                return { version: index.version, images: filteredImages };
            }

            return index;
        } catch (error) {
            console.error('[ImageMetadata] Failed to read metadata index:', error);
            ctx.set.status = 500;
            return { error: 'Internal server error.' };
        }
    })

    /**
     * POST /api/image-metadata/cleanup
     * Clean up orphaned metadata entries (files that no longer exist).
     */
    .post('/cleanup', async (ctx) => {
        try {
            const userDataRoot = getUserRoot(ctx as any);
            const removed = await cleanupOrphanedMetadata(userDataRoot);
            return { removed, count: removed.length };
        } catch (error) {
            console.error('[ImageMetadata] Cleanup error:', error);
            ctx.set.status = 500;
            return { error: 'Internal server error.' };
        }
    });
