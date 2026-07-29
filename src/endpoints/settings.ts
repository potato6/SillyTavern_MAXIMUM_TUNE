import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { Elysia } from 'elysia';
import { throttle } from 'es-toolkit/compat';
import writeFileAtomic from 'write-file-atomic';
import bytes from 'bytes';

import { SETTINGS_FILE } from '../constants.js';
import { getConfigValue, generateTimestamp, removeOldBackups } from '../util.js';
import { getAllUserHandles, getUserDirectories } from '../users.js';

const ENABLE_EXTENSIONS = !!getConfigValue('extensions.enabled', true, 'boolean' as const);
const ENABLE_EXTENSIONS_AUTO_UPDATE = !!getConfigValue(
    'extensions.autoUpdate',
    true,
    'boolean' as const,
);
const ENABLE_ACCOUNTS = !!getConfigValue('enableUserAccounts', false, 'boolean' as const);
const ENABLE_REQUEST_COMPRESSION = !!getConfigValue(
    'performance.requestCompression.enabled',
    false,
    'boolean',
);
const REQUEST_COMPRESSION_MIN =
    bytes.parse(getConfigValue('performance.requestCompression.minPayloadSize', '256kb')) || 0;
const REQUEST_COMPRESSION_MAX =
    bytes.parse(getConfigValue('performance.requestCompression.maxPayloadSize', '8mb')) || 0;
const REQUEST_COMPRESSION_TIMEOUT =
    Number(getConfigValue('performance.requestCompression.timeout', 3000, 'number' as const)) || 0;

// 10 minutes
const AUTOSAVE_INTERVAL = 10 * 60 * 1000;
const FORBIDDEN_PATH_REGEX = path.sep === '/' ? /[/\x00]/ : /[/\x00\\]/;

interface UserDirectories {
    root?: string;
    backups?: string;
    novelAI_Settings?: string;
    openAI_Settings?: string;
    textGen_Settings?: string;
    koboldAI_Settings?: string;
    worlds?: string;
    themes?: string;
    movingUI?: string;
    quickreplies?: string;
    instruct?: string;
    context?: string;
    sysprompt?: string;
    reasoning?: string;
    [key: string]: unknown;
}

interface UserProfile {
    handle?: string;
    [key: string]: unknown;
}

interface UserContext {
    directories?: UserDirectories;
    profile?: UserProfile;
    [key: string]: unknown;
}

/**
 * Map of functions to trigger settings autosave for a user.
 * @type {Map<string, () => void>}
 */
const AUTOSAVE_FUNCTIONS = new Map<string, () => void>();

/**
 * Triggers autosave for a user every 10 minutes.
 * @param {string} handle User handle
 * @returns {void}
 */
function triggerAutoSave(handle: string) {
    if (!handle) return;
    let fn = AUTOSAVE_FUNCTIONS.get(handle);
    if (!fn) {
        fn = throttle(() => {
            backupUserSettingsAsync(handle, true).catch((err) => {
                console.error('Autosave backup failed for', handle, err);
            });
        }, AUTOSAVE_INTERVAL);
        AUTOSAVE_FUNCTIONS.set(handle, fn);
    }
    fn();
}

/**
 * Reads and parses files from a directory asynchronously.
 * @param {string} directoryPath Path to the directory
 * @param {string} fileExtension File extension
 * @returns {Promise<Array>} Parsed files
 */
async function readAndParseFromDirectoryAsync(directoryPath: string, fileExtension = '.json'): Promise<unknown[]> {
    let dirents: fs.Dirent[];
    try {
        dirents = await fsp.readdir(directoryPath, { withFileTypes: true });
    } catch {
        return [];
    }

    const filteredNames: string[] = [];
    for (let i = 0; i < dirents.length; i++) {
        const e = dirents[i]!;
        if (e.isFile() && e.name.endsWith(fileExtension)) {
            filteredNames.push(e.name);
        }
    }

    filteredNames.sort((a, b) => a.localeCompare(b));

    const count = filteredNames.length;
    const isJson = fileExtension === '.json';
    const parsedFiles: unknown[] = [];

    for (let i = 0; i < count; i++) {
        const item = filteredNames[i]!;
        try {
            const file = await fsp.readFile(path.join(directoryPath, item), 'utf-8');
            parsedFiles.push(isJson ? JSON.parse(file) : file);
        } catch {
            // Skip unreadable or corrupted files
        }
    }

    return parsedFiles;
}

/**
 * Gets backup file prefix for user settings.
 * @param {string} handle User handle
 * @returns {string} File prefix
 */
export function getSettingsBackupFilePrefix(handle: string) {
    return `settings_${handle}_`;
}

/**
 * Reads presets from a directory asynchronously.
 * @param {string} directoryPath Path to the directory
 * @param {object} options Options object
 * @returns {Promise<{ fileContents: string[], fileNames: string[] }>} Object with file contents and names
 */
async function readPresetsFromDirectoryAsync(
    directoryPath: string,
    options: {
        sortFunction?: (a: string, b: string) => number;
        removeFileExtension?: boolean;
        fileExtension?: string;
    } = {},
) {
    const { sortFunction, removeFileExtension = false, fileExtension = '.json' } = options;

    let dirents: fs.Dirent[];
    try {
        dirents = await fsp.readdir(directoryPath, { withFileTypes: true });
    } catch {
        return { fileContents: [], fileNames: [] };
    }

    const matchedNames: string[] = [];
    for (let i = 0; i < dirents.length; i++) {
        const e = dirents[i]!;
        if (e.isFile() && e.name.endsWith(fileExtension)) {
            matchedNames.push(e.name);
        }
    }

    if (sortFunction) {
        matchedNames.sort(sortFunction);
    } else {
        matchedNames.sort((a, b) => a.localeCompare(b));
    }

    const fileContents: string[] = [];
    const fileNames: string[] = [];
    const extLen = fileExtension.length;

    for (let i = 0; i < matchedNames.length; i++) {
        const item = matchedNames[i]!;
        try {
            const file = await fsp.readFile(path.join(directoryPath, item), 'utf8');
            JSON.parse(file);
            fileContents.push(file);

            if (removeFileExtension) {
                fileNames.push(item.endsWith(fileExtension) ? item.slice(0, -extLen) : item);
            } else {
                fileNames.push(item);
            }
        } catch {
            console.warn(`${item} is not a valid JSON`);
        }
    }

    return { fileContents, fileNames };
}

/**
 *
 */
async function backupSettings() {
    try {
        const userHandles = await getAllUserHandles();

        for (let i = 0; i < userHandles.length; i++) {
            await backupUserSettingsAsync(userHandles[i]!, true);
        }
    } catch (err) {
        console.error('Could not backup settings file', err);
    }
}

/**
 * Makes a backup of the user's settings file.
 * @param {string} handle User handle
 * @param {boolean} preventDuplicates Prevent duplicate backups
 * @returns {Promise<void>}
 */
async function backupUserSettingsAsync(handle: string, preventDuplicates: boolean): Promise<void> {
    const userDirectories = getUserDirectories(handle);

    try {
        await fsp.access(userDirectories.root);
    } catch {
        return;
    }

    const sourceFile = path.join(userDirectories.root, SETTINGS_FILE);

    try {
        await fsp.access(sourceFile);
    } catch {
        return;
    }

    if (preventDuplicates) {
        const latestBackup = await getLatestBackupAsync(handle);
        if (latestBackup && (await areFilesEqualAsync(latestBackup, sourceFile))) {
            return;
        }
    }

    const backupFile = path.join(
        userDirectories.backups,
        `${getSettingsBackupFilePrefix(handle)}${generateTimestamp()}.json`,
    );

    await fsp.copyFile(sourceFile, backupFile);
    removeOldBackups(userDirectories.backups, `settings_${handle}`);
}

/**
 * Returns true if the two files are equal by byte comparison.
 * @param {string} file1 File path
 * @param {string} file2 File path
 * @returns {Promise<boolean>} True if the files are equal
 */
async function areFilesEqualAsync(file1: string, file2: string): Promise<boolean> {
    try {
        const [content1, content2] = await Promise.all([
            fsp.readFile(file1),
            fsp.readFile(file2),
        ]);
        return content1.equals(content2);
    } catch {
        return false;
    }
}

/**
 * Gets the latest backup file for a user asynchronously.
 * @param {string} handle User handle
 * @returns {Promise<string|null>} Latest backup file. Null if no backup exists.
 */
async function getLatestBackupAsync(handle: string): Promise<string | null> {
    const userDirectories = getUserDirectories(handle);
    const backupsDir = userDirectories.backups;

    let dirents: fs.Dirent[];
    try {
        dirents = await fsp.readdir(backupsDir, { withFileTypes: true });
    } catch {
        return null;
    }

    const prefix = getSettingsBackupFilePrefix(handle);
    const matchingFiles: string[] = [];

    for (let i = 0; i < dirents.length; i++) {
        const e = dirents[i]!;
        if (e.isFile() && e.name.startsWith(prefix)) {
            matchingFiles.push(e.name);
        }
    }

    if (matchingFiles.length === 0) {
        return null;
    }

    const statsPromises: Promise<{ name: string; ctime: number }>[] = Array.from({ length: matchingFiles.length });
    for (let i = 0; i < matchingFiles.length; i++) {
        const fn = matchingFiles[i]!;
        statsPromises[i] = fsp.stat(path.join(backupsDir, fn)).then((st) => ({
            name: fn,
            ctime: st.ctimeMs,
        }));
    }

    const statsResults = await Promise.all(statsPromises);
    statsResults.sort((a, b) => b.ctime - a.ctime);

    return path.join(backupsDir, statsResults[0]!.name);
}

/**
 * Checks if a value passes filename validation.
 * Returns an error message string if invalid, or null if valid.
 */
function validateFileName(name: unknown): string | null {
    if (name == null) return null;
    const strName = typeof name === 'string' ? name : String(name);
    if (FORBIDDEN_PATH_REGEX.test(strName)) {
        return 'Invalid snapshot name';
    }
    return null;
}

export const router = new Elysia({ prefix: '/api/settings' })
    .post('/save', async (context) => {
        const ctx = context as Record<string, unknown>;
        const body = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

        try {
            const rootDir = directories?.root ?? '';
            const pathToSettings = path.join(rootDir, SETTINGS_FILE);
            const jsonStr = JSON.stringify(body, null, 4);

            await writeFileAtomic(pathToSettings, jsonStr, 'utf8');

            const handle = user?.profile?.handle;
            if (handle) {
                triggerAutoSave(handle);
            }

            return { result: 'ok' };
        } catch (err) {
            console.error(err);
            return err;
        }
    })
    .post('/get', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

        const rootDir = directories?.root ?? '';
        const pathToSettings = path.join(rootDir, SETTINGS_FILE);

        let settings: string;
        try {
            settings = await fsp.readFile(pathToSettings, 'utf8');
        } catch {
            set.status = 500;
            return;
        }

        const [
            novelai,
            openai,
            textgen,
            kobold,
            themes,
            movingUIPresets,
            quickReplyPresets,
            instruct,
            contextItems,
            sysprompt,
            reasoning,
            worldFilesResult,
        ] = await Promise.all([
            readPresetsFromDirectoryAsync(directories?.novelAI_Settings ?? '', {
                removeFileExtension: true,
            }),
            readPresetsFromDirectoryAsync(directories?.openAI_Settings ?? '', {
                removeFileExtension: true,
            }),
            readPresetsFromDirectoryAsync(directories?.textGen_Settings ?? '', {
                removeFileExtension: true,
            }),
            readPresetsFromDirectoryAsync(directories?.koboldAI_Settings ?? '', {
                removeFileExtension: true,
            }),
            readAndParseFromDirectoryAsync(directories?.themes ?? ''),
            readAndParseFromDirectoryAsync(directories?.movingUI ?? ''),
            readAndParseFromDirectoryAsync(directories?.quickreplies ?? ''),
            readAndParseFromDirectoryAsync(directories?.instruct ?? ''),
            readAndParseFromDirectoryAsync(directories?.context ?? ''),
            readAndParseFromDirectoryAsync(directories?.sysprompt ?? ''),
            readAndParseFromDirectoryAsync(directories?.reasoning ?? ''),
            (async () => {
                const worldsDir = directories?.worlds ?? '';
                try {
                    const dirents = await fsp.readdir(worldsDir, { withFileTypes: true });
                    const jsonFiles: string[] = [];
                    for (let i = 0; i < dirents.length; i++) {
                        const e = dirents[i]!;
                        if (e.isFile() && e.name.toLowerCase().endsWith('.json')) {
                            jsonFiles.push(e.name);
                        }
                    }
                    jsonFiles.sort((a, b) => a.localeCompare(b));
                    const count = jsonFiles.length;
                    const names = Array.from<string>({ length: count });
                    for (let i = 0; i < count; i++) {
                        const fn = jsonFiles[i]!;
                        const lastDot = fn.lastIndexOf('.');
                        names[i] = lastDot !== -1 ? fn.slice(0, lastDot) : fn;
                    }
                    return names;
                } catch {
                    return [];
                }
            })(),
        ]);

        return {
            settings,
            koboldai_settings: kobold.fileContents,
            koboldai_setting_names: kobold.fileNames,
            world_names: worldFilesResult,
            novelai_settings: novelai.fileContents,
            novelai_setting_names: novelai.fileNames,
            openai_settings: openai.fileContents,
            openai_setting_names: openai.fileNames,
            textgenerationwebui_presets: textgen.fileContents,
            textgenerationwebui_preset_names: textgen.fileNames,
            themes,
            movingUIPresets,
            quickReplyPresets,
            instruct,
            context: contextItems,
            sysprompt,
            reasoning,
            enable_extensions: ENABLE_EXTENSIONS,
            enable_extensions_auto_update: ENABLE_EXTENSIONS_AUTO_UPDATE,
            enable_accounts: ENABLE_ACCOUNTS,
            request_compression: {
                enabled: ENABLE_REQUEST_COMPRESSION,
                minPayloadSize: REQUEST_COMPRESSION_MIN,
                maxPayloadSize: REQUEST_COMPRESSION_MAX,
                timeout: REQUEST_COMPRESSION_TIMEOUT,
            },
        };
    })
    .post('/get-snapshots', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;
        const handle = user?.profile?.handle ?? '';

        try {
            const backupsDir = directories?.backups ?? '';
            const userFilesPattern = getSettingsBackupFilePrefix(handle);

            let dirents: fs.Dirent[];
            try {
                dirents = await fsp.readdir(backupsDir, { withFileTypes: true });
            } catch {
                return [];
            }

            const matchedNames: string[] = [];
            for (let i = 0; i < dirents.length; i++) {
                const e = dirents[i]!;
                if (e.isFile() && e.name.startsWith(userFilesPattern)) {
                    matchedNames.push(e.name);
                }
            }

            const count = matchedNames.length;
            const statPromises: Promise<{ date: number; name: string; size: number }>[] = Array.from({ length: count });

            for (let i = 0; i < count; i++) {
                const fn = matchedNames[i]!;
                statPromises[i] = fsp.stat(path.join(backupsDir, fn)).then((stat) => ({
                    date: stat.ctimeMs,
                    name: fn,
                    size: stat.size,
                }));
            }

            const result = await Promise.all(statPromises);
            return result;
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    })
    .post('/load-snapshot', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const body = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;
        const handle = user?.profile?.handle ?? '';

        try {
            const snapshotName = body?.name;
            const validationError = validateFileName(snapshotName);
            if (validationError) {
                set.status = 400;
                return { error: validationError };
            }

            const userFilesPattern = getSettingsBackupFilePrefix(handle);

            if (typeof snapshotName !== 'string' || !snapshotName.startsWith(userFilesPattern)) {
                set.status = 400;
                return { error: 'Invalid snapshot name' };
            }

            const backupsDir = directories?.backups ?? '';
            const snapshotPath = path.join(backupsDir, snapshotName);

            try {
                return await fsp.readFile(snapshotPath, 'utf8');
            } catch {
                set.status = 404;
                return;
            }
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    })
    .post('/make-snapshot', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const user = ctx.user as UserContext | undefined;
        const handle = user?.profile?.handle ?? '';

        try {
            await backupUserSettingsAsync(handle, false);
            set.status = 204;
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    })
    .post('/restore-snapshot', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const body = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;
        const handle = user?.profile?.handle ?? '';

        try {
            const snapshotName = body?.name;
            const validationError = validateFileName(snapshotName);
            if (validationError) {
                set.status = 400;
                return { error: validationError };
            }

            const userFilesPattern = getSettingsBackupFilePrefix(handle);

            if (typeof snapshotName !== 'string' || !snapshotName.startsWith(userFilesPattern)) {
                set.status = 400;
                return { error: 'Invalid snapshot name' };
            }

            const backupsDir = directories?.backups ?? '';
            const snapshotPath = path.join(backupsDir, snapshotName);

            try {
                await fsp.access(snapshotPath);
            } catch {
                set.status = 404;
                return;
            }

            const rootDir = directories?.root ?? '';
            const pathToSettings = path.join(rootDir, SETTINGS_FILE);

            await fsp.copyFile(snapshotPath, pathToSettings);

            set.status = 204;
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    });

/**
 * Initializes the settings endpoint
 */
export async function init() {
    await backupSettings();
}
