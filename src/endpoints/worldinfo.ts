import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import writeFileAtomic from 'write-file-atomic';
import { tryParse } from '../util.js';

interface UserDirectories {
    worlds?: string;
    [key: string]: unknown;
}

interface UserContext {
    directories?: UserDirectories;
    [key: string]: unknown;
}

/**
 * Synchronous world info file reader (kept for backwards compatibility).
 */
export function readWorldInfoFile(
    directories: Record<string, string>,
    worldInfoName: string,
    allowDummy: boolean,
) {
    if (!worldInfoName) {
        return allowDummy ? { entries: {} } : null;
    }

    const sanitizedName = sanitize(worldInfoName);
    const filename = `${sanitizedName}.json`;
    const worldsDir = directories.worlds ?? '';
    const pathToWorldInfo = path.join(worldsDir, filename);

    try {
        const worldInfoText = fs.readFileSync(pathToWorldInfo, 'utf8');
        return JSON.parse(worldInfoText);
    } catch {
        console.error(`World info file ${filename} doesn't exist.`);
        return allowDummy ? { entries: {} } : null;
    }
}

/**
 * Asynchronous world info file reader for non-blocking route execution.
 */
export async function readWorldInfoFileAsync(
    directories: Record<string, string>,
    worldInfoName: string,
    allowDummy: boolean,
) {
    if (!worldInfoName) {
        return allowDummy ? { entries: {} } : null;
    }

    const sanitizedName = sanitize(worldInfoName);
    const filename = `${sanitizedName}.json`;
    const worldsDir = directories.worlds ?? '';
    const pathToWorldInfo = path.join(worldsDir, filename);

    try {
        const worldInfoText = await fsp.readFile(pathToWorldInfo, 'utf8');
        return JSON.parse(worldInfoText);
    } catch {
        console.error(`World info file ${filename} doesn't exist.`);
        return allowDummy ? { entries: {} } : null;
    }
}

export const router = new Elysia({ prefix: '/api/worldinfo', aot: false })
    .post('/list', async (context) => {
        const { set } = context;

        const user = context.user as UserContext | undefined;
        const directories = user?.directories;
        const worldsDir = directories?.worlds ?? '';

        try {
            let dirents: fs.Dirent[];
            try {
                dirents = await fsp.readdir(worldsDir, { withFileTypes: true });
            } catch {
                return [];
            }

            const jsonFileNames: string[] = [];
            for (const entry of dirents) {
                if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
                    jsonFileNames.push(entry.name);
                }
            }

            jsonFileNames.sort((a, b) => a.localeCompare(b));

            const readPromises = jsonFileNames.map(async (fileName) => {
                const filePath = path.join(worldsDir, fileName);

                try {
                    const fileContents = await fsp.readFile(filePath, 'utf8');
                    const fileContentsParsed = (tryParse(fileContents) || {}) as Record<
                        string,
                        any
                    >;
                    const fileExtensions = fileContentsParsed.extensions;
                    const fileNameWithoutExt = fileName.toLowerCase().endsWith('.json')
                        ? fileName.slice(0, -5)
                        : fileName;

                    return {
                        file_id: fileNameWithoutExt,
                        name: fileContentsParsed.name || fileNameWithoutExt,
                        extensions:
                            typeof fileExtensions === 'object' && fileExtensions !== null
                                ? fileExtensions
                                : {},
                    };
                } catch (error) {
                    console.warn(`Error reading or parsing World Info file ${fileName}:`, error);
                    return null;
                }
            });

            const rawResults = await Promise.all(readPromises);
            const data = rawResults.filter((r) => r !== null) as Record<string, unknown>[];

            return data;
        } catch (error) {
            console.error('Error reading World Info directory:', error);
            set.status = 500;
        }
    })
    .post('/get', async (context) => {
        const { set } = context;

        const bodyAny = context.body as Record<string, unknown> | undefined;
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;

        const name = bodyAny?.name;
        if (typeof name !== 'string' || name.length === 0) {
            set.status = 400;
            return;
        }

        const file = await readWorldInfoFileAsync(
            (directories ?? {}) as Record<string, string>,
            name,
            true,
        );
        return file;
    })
    .post('/delete', async (context) => {
        const { set } = context;

        const bodyAny = context.body as Record<string, unknown> | undefined;
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;

        const worldInfoName = bodyAny?.name;
        if (typeof worldInfoName !== 'string' || worldInfoName.length === 0) {
            set.status = 400;
            return;
        }

        const sanitizedName = sanitize(worldInfoName);
        const filename = `${sanitizedName}.json`;
        const worldsDir = directories?.worlds ?? '';
        const pathToWorldInfo = path.join(worldsDir, filename);

        try {
            await fsp.unlink(pathToWorldInfo);
            set.status = 204;
        } catch {
            throw new Error(`World info file ${filename} doesn't exist.`);
        }
    })
    .post('/import', async (context) => {
        const { set } = context;

        const body = (context.body ?? {}) as Record<string, unknown>;
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;
        const file = context.file as
            | { destination?: string; filename?: string; originalname?: string }
            | undefined;

        if (!file || typeof file.originalname !== 'string') {
            set.status = 400;
            return;
        }

        const sanitizedOriginal = sanitize(file.originalname);
        const lastDot = sanitizedOriginal.lastIndexOf('.');
        const rawWorldName =
            lastDot !== -1 ? sanitizedOriginal.slice(0, lastDot) : sanitizedOriginal;

        if (!rawWorldName) {
            set.status = 400;
            return 'World file must have a name';
        }

        const filename = `${rawWorldName}.json`;
        let fileContents: string;

        if (typeof body.convertedData === 'string' && body.convertedData.length > 0) {
            fileContents = body.convertedData;
        } else {
            const uploadDest = file.destination ?? '';
            const uploadFile = file.filename ?? '';
            const pathToUpload = path.join(uploadDest, uploadFile);

            try {
                fileContents = await fsp.readFile(pathToUpload, 'utf8');
                await fsp.unlink(pathToUpload);
            } catch {
                set.status = 400;
                return 'Is not a valid world info file';
            }
        }

        try {
            const worldContent = JSON.parse(fileContents);
            if (
                !worldContent ||
                typeof worldContent !== 'object' ||
                !Object.hasOwn(worldContent, 'entries')
            ) {
                throw new Error('File must contain a world info entries list');
            }
        } catch {
            set.status = 400;
            return 'Is not a valid world info file';
        }

        const worldsDir = directories?.worlds ?? '';
        const pathToNewFile = path.join(worldsDir, filename);

        await writeFileAtomic(pathToNewFile, fileContents);
        return { name: rawWorldName };
    })
    .post('/edit', async (context) => {
        const { set } = context;

        const bodyAny = context.body as Record<string, unknown> | undefined;
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;

        if (!bodyAny) {
            set.status = 400;
            return;
        }

        const rawName = bodyAny.name;
        if (typeof rawName !== 'string' || rawName.length === 0) {
            set.status = 400;
            return 'World file must have a name';
        }

        const dataObj = bodyAny.data;
        if (!dataObj || typeof dataObj !== 'object' || !Object.hasOwn(dataObj, 'entries')) {
            set.status = 400;
            return 'Is not a valid world info file';
        }

        const sanitizedName = sanitize(rawName);
        const filename = `${sanitizedName}.json`;
        const worldsDir = directories?.worlds ?? '';
        const pathToFile = path.join(worldsDir, filename);

        await writeFileAtomic(pathToFile, JSON.stringify(dataObj, null, 4));
        return { ok: true };
    });
