import path from 'node:path';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';

import { UNSAFE_EXTENSIONS } from '../constants.js';
import { clientRelativePath, isValidUrl } from '../util.js';
import { getHostFromUrl, isHostWhitelisted } from './content-manager.js';

const VALID_CATEGORIES = new Set(['bgm', 'ambient', 'blip', 'live2d', 'vrm', 'character', 'temp']);

export function validateAssetFileName(inputFilename: string) {
    if (!/^[a-zA-Z0-9_\-.]+$/.test(inputFilename)) {
        return {
            error: true,
            message: "Illegal character in filename; only alphanumeric, '_', '-' are accepted.",
        };
    }

    const inputExtension = path.extname(inputFilename).toLowerCase();
    if (UNSAFE_EXTENSIONS.some((ext: string) => ext === inputExtension)) {
        return { error: true, message: 'Forbidden file extension.' };
    }

    if (inputFilename.startsWith('.')) {
        return { error: true, message: "Filename cannot start with '.'" };
    }

    if (sanitize(inputFilename) !== inputFilename) {
        return { error: true, message: 'Reserved or long filename.' };
    }

    return { error: false };
}

export const router = new Elysia({ prefix: '/api/assets' })
    .post('/upload', async (context: Record<string, unknown>) => {
        const set = context.set as Record<string, unknown>;
        const body = context.body as Record<string, unknown>;
        const user = context.user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            const name = body.name as string;
            const data = body.data as string | undefined;
            const url = body.url as string | undefined;
            const category = body.category as string;
            const overwrite = body.overwrite as boolean | undefined;

            if (!name) {
                (set.set as (code: number) => void)?.(400);
                return { error: 'No asset name specified' };
            }

            if (!category || !VALID_CATEGORIES.has(category)) {
                (set.set as (code: number) => void)?.(400);
                return { error: 'Invalid or missing category' };
            }

            const validation = validateAssetFileName(name);
            if (validation.error) {
                (set.set as (code: number) => void)?.(400);
                return { error: validation.message };
            }

            const assetsDir = directories?.assets ?? '';

            if (data) {
                const fileBuffer = Buffer.from(data, 'base64');
                const pathToUpload = path.join(assetsDir, category, sanitize(name));

                if (!overwrite && fs.existsSync(pathToUpload)) {
                    (set.set as (code: number) => void)?.(409);
                    return { error: 'Asset already exists' };
                }

                const dir = path.dirname(pathToUpload);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(pathToUpload, fileBuffer);
                const relative = clientRelativePath(directories?.root ?? '', pathToUpload);
                return { path: relative };
            }

            if (url) {
                if (!isValidUrl(url)) {
                    (set.set as (code: number) => void)?.(400);
                    return { error: 'Invalid URL' };
                }

                const host = getHostFromUrl(url);
                if (!isHostWhitelisted(host)) {
                    (set.set as (code: number) => void)?.(403);
                    return { error: 'Host not whitelisted' };
                }

                const response = await fetch(url);
                if (!response.ok) {
                    (set.set as (code: number) => void)?.(502);
                    return { error: `Failed to fetch asset from URL: ${response.status}` };
                }

                const pathToUpload = path.join(assetsDir, category, sanitize(name));

                if (!overwrite && fs.existsSync(pathToUpload)) {
                    (set.set as (code: number) => void)?.(409);
                    return { error: 'Asset already exists' };
                }

                const dir = path.dirname(pathToUpload);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }

                const fileStream = fs.createWriteStream(pathToUpload);
                if (response.body) {
                    await finished(
                        Readable.fromWeb(
                            response.body as unknown as import('stream/web').ReadableStream,
                        ).pipe(fileStream),
                    );
                }
                const relative = clientRelativePath(directories?.root ?? '', pathToUpload);
                return { path: relative };
            }

            (set.set as (code: number) => void)?.(400);
            return { error: 'No data or URL provided' };
        } catch (error) {
            console.error('Asset upload error:', error);
            (set.set as (code: number) => void)?.(500);
            return { error: 'Failed to upload asset' };
        }
    })
    .post('/delete', (context: Record<string, unknown>) => {
        const set = context.set as Record<string, unknown>;
        const body = context.body as Record<string, unknown>;
        const user = context.user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            if (!body.path) {
                (set.set as (code: number) => void)?.(400);
                return { error: 'No path specified' };
            }

            const pathToDelete = path.join(directories?.root ?? '', body.path as string);
            if (!pathToDelete.startsWith(directories?.assets ?? '')) {
                (set.set as (code: number) => void)?.(400);
                return { error: 'Invalid path' };
            }

            if (!fs.existsSync(pathToDelete)) {
                (set.set as (code: number) => void)?.(404);
                return { error: 'File not found' };
            }

            fs.unlinkSync(pathToDelete);
            (set.set as (code: number) => void)?.(204);
            return;
        } catch (error) {
            console.error(error);
            (set.set as (code: number) => void)?.(500);
        }
    })
    .post('/download', (context: Record<string, unknown>) => {
        const set = context.set as Record<string, unknown>;
        const body = context.body as Record<string, unknown>;
        const user = context.user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            if (!body.path) {
                (set.set as (code: number) => void)?.(400);
                return { error: 'No path specified' };
            }

            const pathToDownload = path.join(directories?.root ?? '', body.path as string);
            if (!pathToDownload.startsWith(directories?.assets ?? '')) {
                (set.set as (code: number) => void)?.(400);
                return { error: 'Invalid path' };
            }

            if (!fs.existsSync(pathToDownload)) {
                (set.set as (code: number) => void)?.(404);
                return { error: 'File not found' };
            }

            return new Response(Bun.file(pathToDownload));
        } catch (error) {
            console.error(error);
            (set.set as (code: number) => void)?.(500);
        }
    })
    .post('/list', (context: Record<string, unknown>) => {
        const set = context.set as Record<string, unknown>;
        const body = context.body as Record<string, unknown>;
        const user = context.user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            const category = body.category as string;
            if (!category || !VALID_CATEGORIES.has(category)) {
                (set.set as (code: number) => void)?.(400);
                return { error: 'Invalid or missing category' };
            }

            const assetsDir = path.join(directories?.assets ?? '', category);
            if (!fs.existsSync(assetsDir)) {
                return [];
            }

            const files = fs.readdirSync(assetsDir).filter((f) => {
                const ext = path.extname(f).toLowerCase();
                return !UNSAFE_EXTENSIONS.some((ue: string) => ue === ext);
            });

            return files;
        } catch (error) {
            console.error(error);
            (set.set as (code: number) => void)?.(500);
        }
    });
