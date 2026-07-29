import fs from 'node:fs';
import path from 'node:path';

import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { getImageBuffers } from '../util.js';

/**
 * Gets the path to the sprites folder for the provided character name
 * @param {import('../users.js').UserDirectoryList} directories - User directories
 * @param {string} name - The name of the character
 * @param {boolean} isSubfolder - Whether the name contains a subfolder
 * @returns {string | null} The path to the sprites folder. Null if the name is invalid.
 */
function getSpritesPath(
    directories: import('../users.js').UserDirectoryList,
    name: string,
    isSubfolder: boolean,
) {
    if (isSubfolder) {
        const nameParts = name.split('/');
        const characterName = sanitize(nameParts[0]!);
        const subfolderName = sanitize(nameParts[1]!);

        if (!characterName || !subfolderName) {
            return null;
        }

        return path.join(directories.characters, characterName, subfolderName);
    }

    name = sanitize(name);

    if (!name) {
        return null;
    }

    return path.join(directories.characters, name);
}

/**
 * Imports base64 encoded sprites from RisuAI character data.
 * The sprites are saved in the character's sprites folder.
 * The additionalAssets and emotions are removed from the data.
 * @param {import('../users.js').UserDirectoryList} directories User directories
 * @param {object} data RisuAI character data
 * @returns {void}
 */
export function importRisuSprites(
    directories: import('../users.js').UserDirectoryList,
    data: Record<string, unknown>,
) {
    try {
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        const name = data?.data?.name;
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        const risuData = data?.data?.extensions?.risuai;

        // Not a Risu AI character
        if (!risuData || !name) {
            return;
        }

        let images: Array<[string, string]> = [];

        if (Array.isArray(risuData.additionalAssets)) {
            images = images.concat(risuData.additionalAssets);
        }

        if (Array.isArray(risuData.emotions)) {
            images = images.concat(risuData.emotions);
        }

        // No sprites to import
        if (images.length === 0) {
            return;
        }

        // Create sprites folder if it doesn't exist
        const spritesPath = getSpritesPath(directories, name, false);

        // Invalid sprites path
        if (!spritesPath) {
            return;
        }

        // Create sprites folder if it doesn't exist
        if (!fs.existsSync(spritesPath)) {
            fs.mkdirSync(spritesPath, { recursive: true });
        }

        // Path to sprites is not a directory. This should never happen.
        if (!fs.statSync(spritesPath).isDirectory()) {
            return;
        }

        console.info(`RisuAI: Found ${images.length} sprites for ${name}. Writing to disk.`);
        const files = fs.readdirSync(spritesPath);

        outer: for (const [label, fileBase64] of images) {
            // Remove existing sprite with the same label
            for (const file of files) {
                if (path.parse(file).name === label) {
                    console.warn(
                        `RisuAI: The sprite ${label} for ${name} already exists. Skipping.`,
                    );
                    continue outer;
                }
            }

            const filename = label + '.png';
            const pathToFile = path.join(spritesPath, sanitize(filename));
            writeFileAtomicSync(pathToFile, fileBase64, { encoding: 'base64' });
        }

        // Remove additionalAssets and emotions from data (they are now in the sprites folder)
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        delete data.data.extensions.risuai.additionalAssets;
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        delete data.data.extensions.risuai.emotions;
    } catch (error) {
        console.error(error);
    }
}

export const router = new Elysia({ prefix: '/api/sprites' })
    .get('/get', (context: any) => {
        const { query } = context;
        const user = context.user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const name = String(query.name);
        const isSubfolder = name.includes('/');
        const spritesPath = getSpritesPath(
            directories as import('../users.js').UserDirectoryList,
            name,
            isSubfolder,
        );
        let sprites: Array<{ label: string; path: string }> = [];

        try {
            if (
                spritesPath &&
                fs.existsSync(spritesPath) &&
                fs.statSync(spritesPath).isDirectory()
            ) {
                sprites = fs
                    .readdirSync(spritesPath)
                    .filter((file) => {
                        const mimeType = Bun.file(file).type;
                        return mimeType && mimeType.startsWith('image/');
                    })
                    .map((file) => {
                        const pathToSprite = path.join(spritesPath, file);
                        const mtime = fs
                            .statSync(pathToSprite)
                            .mtime?.toISOString()
                            .replace(/[^0-9]/g, '')
                            .slice(0, 14);

                        const fileName = path.parse(pathToSprite).name.toLowerCase();
                        // Extract the label from the filename via regex, which can be suffixed with a sub-name, either connected with a dash or a dot.
                        // Examples: joy.png, joy-1.png, joy.expressive.png
                        const label = fileName.match(/^(.+?)(?:[-\\\\.].*?)?$/)?.[1] ?? fileName;

                        return {
                            label: label,
                            path: `/characters/${name}/${file}` + (mtime ? `?t=${mtime}` : ''),
                        };
                    });
            }
        } catch (err) {
            console.error(err);
        }
        return sprites;
    })
    .post('/delete', async (context: any) => {
        const { body, set } = context;
        const bodyAny = body as Record<string, unknown>;
        const user = context.user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const label = bodyAny.label as string;
        const name = String(bodyAny.name);
        const isSubfolder = name.includes('/');
        const spriteName = (bodyAny.spriteName as string) || label;

        if (!spriteName || !name) {
            set.status = 400;
            return;
        }

        try {
            const spritesPath = getSpritesPath(
                directories as import('../users.js').UserDirectoryList,
                name,
                isSubfolder,
            );

            // No sprites folder exists, or not a directory
            if (
                !spritesPath ||
                !fs.existsSync(spritesPath) ||
                !fs.statSync(spritesPath).isDirectory()
            ) {
                set.status = 404;
                return;
            }

            const files = fs.readdirSync(spritesPath);

            // Remove existing sprite with the same label
            for (const file of files) {
                if (path.parse(file).name === spriteName) {
                    fs.unlinkSync(path.join(spritesPath, file));
                }
            }

            set.status = 200;
            return;
        } catch (error) {
            console.error(error);
            set.status = 500;
            return;
        }
    })
    .post('/upload-zip', async (context: any) => {
        const { body, set } = context;
        const bodyAny = body as Record<string, unknown>;
        const user = context.user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const uploadedFile = context.file as Record<string, unknown> | null;
        const name = String(bodyAny.name);
        const isSubfolder = name.includes('/');

        if (!uploadedFile || !name) {
            set.status = 400;
            return;
        }

        try {
            const spritesPath = getSpritesPath(
                directories as import('../users.js').UserDirectoryList,
                name,
                isSubfolder,
            );

            // Invalid sprites path
            if (!spritesPath) {
                set.status = 400;
                return;
            }

            // Create sprites folder if it doesn't exist
            if (!fs.existsSync(spritesPath)) {
                fs.mkdirSync(spritesPath, { recursive: true });
            }

            // Path to sprites is not a directory. This should never happen.
            if (!fs.statSync(spritesPath).isDirectory()) {
                set.status = 404;
                return;
            }

            const spritePackPath = path.join(
                uploadedFile.destination as string,
                uploadedFile.filename as string,
            );
            const sprites = await getImageBuffers(spritePackPath);
            const files = fs.readdirSync(spritesPath);

            for (const [filename, buffer] of sprites) {
                // Remove existing sprite with the same label
                const existingFile = files.find(
                    (f) => path.parse(f).name === path.parse(filename).name,
                );

                if (existingFile) {
                    fs.unlinkSync(path.join(spritesPath, existingFile));
                }

                // Write sprite buffer to disk
                const pathToSprite = path.join(spritesPath, sanitize(filename));
                writeFileAtomicSync(pathToSprite, buffer);
            }

            // Remove uploaded ZIP file
            fs.unlinkSync(spritePackPath);
            return { ok: true, count: sprites.length };
        } catch (error) {
            console.error(error);
            set.status = 500;
            return;
        }
    })
    .post('/upload', async (context: any) => {
        const { body, set } = context;
        const bodyAny = body as Record<string, unknown>;
        const user = context.user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const uploadedFile = context.file as Record<string, unknown> | null;
        const label = bodyAny.label as string;
        const name = String(bodyAny.name);
        const isSubfolder = name.includes('/');
        const spriteName = (bodyAny.spriteName as string) || label;

        if (!uploadedFile || !label || !name) {
            set.status = 400;
            return;
        }

        try {
            const spritesPath = getSpritesPath(
                directories as import('../users.js').UserDirectoryList,
                name,
                isSubfolder,
            );

            // Invalid sprites path
            if (!spritesPath) {
                set.status = 400;
                return;
            }

            // Create sprites folder if it doesn't exist
            if (!fs.existsSync(spritesPath)) {
                fs.mkdirSync(spritesPath, { recursive: true });
            }

            // Path to sprites is not a directory. This should never happen.
            if (!fs.statSync(spritesPath).isDirectory()) {
                set.status = 404;
                return;
            }

            const files = fs.readdirSync(spritesPath);

            // Remove existing sprite with the same label
            for (const entry of files) {
                if (path.parse(entry).name === spriteName) {
                    fs.unlinkSync(path.join(spritesPath, entry));
                }
            }

            const filename = spriteName + path.parse(uploadedFile.originalname as string).ext;
            const spritePath = path.join(
                uploadedFile.destination as string,
                uploadedFile.filename as string,
            );
            const pathToFile = path.join(spritesPath, sanitize(filename));
            // Copy uploaded file to sprites folder
            fs.cpSync(spritePath, pathToFile);
            // Remove uploaded file
            fs.unlinkSync(spritePath);
            return { ok: true };
        } catch (error) {
            console.error(error);
            set.status = 500;
            return;
        }
    });
