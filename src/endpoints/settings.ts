import fs from 'node:fs';
import path from 'node:path';

import { Elysia } from 'elysia';
import { throttle } from 'es-toolkit/compat';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
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
const REQUEST_COMPRESSION_MIN = bytes.parse(
    getConfigValue('performance.requestCompression.minPayloadSize', '256kb'),
);
const REQUEST_COMPRESSION_MAX = bytes.parse(
    getConfigValue('performance.requestCompression.maxPayloadSize', '8mb'),
);
const REQUEST_COMPRESSION_TIMEOUT = Number(
    getConfigValue('performance.requestCompression.timeout', 3000, 'number' as const),
);

// 10 minutes
const AUTOSAVE_INTERVAL = 10 * 60 * 1000;

/**
 * Map of functions to trigger settings autosave for a user.
 * @type {Map<string, () => void>}
 */
const AUTOSAVE_FUNCTIONS = new Map();

/**
 * Triggers autosave for a user every 10 minutes.
 * @param {string} handle User handle
 * @returns {void}
 */
function triggerAutoSave(handle: string) {
    if (!AUTOSAVE_FUNCTIONS.has(handle)) {
        const throttledAutoSave = throttle(
            () => backupUserSettings(handle, true),
            AUTOSAVE_INTERVAL,
        );
        AUTOSAVE_FUNCTIONS.set(handle, throttledAutoSave);
    }

    const functionToCall = AUTOSAVE_FUNCTIONS.get(handle);
    if (functionToCall && typeof functionToCall === 'function') {
        functionToCall();
    }
}

/**
 * Reads and parses files from a directory.
 * @param {string} directoryPath Path to the directory
 * @param {string} fileExtension File extension
 * @returns {Array} Parsed files
 */
function readAndParseFromDirectory(directoryPath: string, fileExtension = '.json') {
    const files = fs
        .readdirSync(directoryPath)
        .filter((x) => path.parse(x).ext == fileExtension)
        .toSorted();

    const parsedFiles: unknown[] = [];

    files.forEach((item) => {
        try {
            const file = fs.readFileSync(path.join(directoryPath, item), 'utf-8');
            parsedFiles.push(fileExtension == '.json' ? JSON.parse(file) : file);
        } catch {
            // skip
        }
    });

    return parsedFiles;
}

/**
 * Gets a sort function for sorting strings.
 * @param {string} _directoryPath Directory path (unused)
 * @returns {(a: string, b: string) => number} Sort function
 */
function sortByName(_directoryPath: string) {
    return (a: string, b: string) => a.localeCompare(b);
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
 * Reads presets from a directory.
 * @param {string} directoryPath Path to the directory
 * @param {object} options Options object
 * @param {Function} [options.sortFunction] Sort function for files
 * @param {boolean} [options.removeFileExtension] Whether to remove file extensions from names
 * @param {string} [options.fileExtension] File extension to filter by
 * @returns {{ fileContents: string[], fileNames: string[] }} Object with file contents and names
 */
function readPresetsFromDirectory(
    directoryPath: string,
    options: {
        sortFunction?: (a: string, b: string) => number;
        removeFileExtension?: boolean;
        fileExtension?: string;
    } = {},
) {
    const { sortFunction, removeFileExtension = false, fileExtension = '.json' } = options;

    const files = fs
        .readdirSync(directoryPath)
        .toSorted(sortFunction)
        .filter((x) => path.parse(x).ext == fileExtension);
    const fileContents: string[] = [];
    const fileNames: string[] = [];

    files.forEach((item) => {
        try {
            const file = fs.readFileSync(path.join(directoryPath, item), 'utf8');
            JSON.parse(file);
            fileContents.push(file);
            fileNames.push(removeFileExtension ? item.replace(/\.[^/.]+$/, '') : item);
        } catch {
            // skip
            console.warn(`${item} is not a valid JSON`);
        }
    });

    return { fileContents, fileNames };
}

/**
 *
 */
async function backupSettings() {
    try {
        const userHandles = await getAllUserHandles();

        for (const handle of userHandles) {
            backupUserSettings(handle, true);
        }
    } catch (err) {
        console.error('Could not backup settings file', err);
    }
}

/**
 * Makes a backup of the user's settings file.
 * @param {string} handle User handle
 * @param {boolean} preventDuplicates Prevent duplicate backups
 * @returns {void}
 */
function backupUserSettings(handle: string, preventDuplicates: boolean) {
    const userDirectories = getUserDirectories(handle);

    if (!fs.existsSync(userDirectories.root)) {
        return;
    }

    const backupFile = path.join(
        userDirectories.backups,
        `${getSettingsBackupFilePrefix(handle)}${generateTimestamp()}.json`,
    );
    const sourceFile = path.join(userDirectories.root, SETTINGS_FILE);

    if (preventDuplicates && isDuplicateBackup(handle, sourceFile)) {
        return;
    }

    if (!fs.existsSync(sourceFile)) {
        return;
    }

    fs.copyFileSync(sourceFile, backupFile);
    removeOldBackups(userDirectories.backups, `settings_${handle}`);
}

/**
 * Checks if the backup would be a duplicate.
 * @param {string} handle User handle
 * @param {string} sourceFile Source file path
 * @returns {boolean} True if the backup is a duplicate
 */
function isDuplicateBackup(handle: string, sourceFile: string) {
    const latestBackup = getLatestBackup(handle);
    if (!latestBackup) {
        return false;
    }
    return areFilesEqual(latestBackup, sourceFile);
}

/**
 * Returns true if the two files are equal.
 * @param {string} file1 File path
 * @param {string} file2 File path
 * @returns {boolean} True if the files are equal
 */
function areFilesEqual(file1: string, file2: string) {
    if (!fs.existsSync(file1) || !fs.existsSync(file2)) {
        return false;
    }

    const content1 = fs.readFileSync(file1);
    const content2 = fs.readFileSync(file2);
    return content1.toString() === content2.toString();
}

/**
 * Gets the latest backup file for a user.
 * @param {string} handle User handle
 * @returns {string|null} Latest backup file. Null if no backup exists.
 */
function getLatestBackup(handle: string) {
    const userDirectories = getUserDirectories(handle);
    const backupFiles = fs
        .readdirSync(userDirectories.backups)
        .filter((x) => x.startsWith(getSettingsBackupFilePrefix(handle)))
        .map((x) => ({
            name: x,
            ctime: fs.statSync(path.join(userDirectories.backups, x)).ctimeMs,
        }));
    const latestBackup = backupFiles.toSorted((a, b) => b.ctime - a.ctime)[0]?.name;
    if (!latestBackup) {
        return null;
    }
    return path.join(userDirectories.backups, latestBackup);
}

/**
 * Checks if a value passes filename validation.
 * Returns an error message string if invalid, or null if valid.
 */
function validateFileName(name: unknown): string | null {
    if (name == null) return null;
    const strName = typeof name === 'string' ? name : String(name);
    const forbidden = path.sep === '/' ? /[/\x00]/ : /[/\x00\\]/;
    if (forbidden.test(strName)) {
        return 'Invalid snapshot name';
    }
    return null;
}

export const router = new Elysia({ prefix: '/api/settings' })
    .post('/save', (context) => {
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            const pathToSettings = path.join(directories?.root ?? '', SETTINGS_FILE);
            writeFileAtomicSync(pathToSettings, JSON.stringify(body, null, 4), 'utf8');
            triggerAutoSave((user?.profile as Record<string, unknown>)?.handle as string);
            return { result: 'ok' };
        } catch (err) {
            console.error(err);
            return err;
        }
    })
    .post('/get', (context) => {
        const { set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        let settings;
        try {
            const pathToSettings = path.join(directories?.root ?? '', SETTINGS_FILE);
            settings = fs.readFileSync(pathToSettings, 'utf8');
        } catch {
            set.status = 500;
            return;
        }

        // NovelAI Settings
        const { fileContents: novelai_settings, fileNames: novelai_setting_names } =
            readPresetsFromDirectory(directories?.novelAI_Settings ?? '', {
                sortFunction: sortByName(directories?.novelAI_Settings ?? ''),
                removeFileExtension: true,
            });

        // OpenAI Settings
        const { fileContents: openai_settings, fileNames: openai_setting_names } =
            readPresetsFromDirectory(directories?.openAI_Settings ?? '', {
                sortFunction: sortByName(directories?.openAI_Settings ?? ''),
                removeFileExtension: true,
            });

        // TextGenerationWebUI Settings
        const {
            fileContents: textgenerationwebui_presets,
            fileNames: textgenerationwebui_preset_names,
        } = readPresetsFromDirectory(directories?.textGen_Settings ?? '', {
            sortFunction: sortByName(directories?.textGen_Settings ?? ''),
            removeFileExtension: true,
        });

        //Kobold
        const { fileContents: koboldai_settings, fileNames: koboldai_setting_names } =
            readPresetsFromDirectory(directories?.koboldAI_Settings ?? '', {
                sortFunction: sortByName(directories?.koboldAI_Settings ?? ''),
                removeFileExtension: true,
            });

        const worldFiles = fs
            .readdirSync(directories?.worlds ?? '')
            .filter((file) => path.extname(file).toLowerCase() === '.json')
            .toSorted((a, b) => a.localeCompare(b));
        const world_names = worldFiles.map((item) => path.parse(item).name);

        const themes = readAndParseFromDirectory(directories?.themes ?? '');
        const movingUIPresets = readAndParseFromDirectory(directories?.movingUI ?? '');
        const quickReplyPresets = readAndParseFromDirectory(directories?.quickreplies ?? '');

        const instruct = readAndParseFromDirectory(directories?.instruct ?? '');
        const contextItems = readAndParseFromDirectory(directories?.context ?? '');
        const sysprompt = readAndParseFromDirectory(directories?.sysprompt ?? '');
        const reasoning = readAndParseFromDirectory(directories?.reasoning ?? '');

        return {
            settings,
            koboldai_settings,
            koboldai_setting_names,
            world_names,
            novelai_settings,
            novelai_setting_names,
            openai_settings,
            openai_setting_names,
            textgenerationwebui_presets,
            textgenerationwebui_preset_names,
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
                minPayloadSize: REQUEST_COMPRESSION_MIN || 0,
                maxPayloadSize: REQUEST_COMPRESSION_MAX || 0,
                timeout: REQUEST_COMPRESSION_TIMEOUT || 0,
            },
        };
    })
    .post('/get-snapshots', (context) => {
        const { set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            const snapshots = fs.readdirSync(directories?.backups ?? '');
            const userFilesPattern = getSettingsBackupFilePrefix(
                (user?.profile as Record<string, unknown>)?.handle as string,
            );
            const userSnapshots = snapshots.filter((x) => x.startsWith(userFilesPattern));

            const result = userSnapshots.map((x) => {
                const stat = fs.statSync(path.join(directories?.backups ?? '', x));
                return { date: stat.ctimeMs, name: x, size: stat.size };
            });

            return result;
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    })
    .post('/load-snapshot', (context) => {
        const body = context.body as Record<string, unknown>;
        const { set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            const validationError = validateFileName(body?.name);
            if (validationError) {
                set.status = 400;
                return { error: validationError };
            }

            const userFilesPattern = getSettingsBackupFilePrefix(
                (user?.profile as Record<string, unknown>)?.handle as string,
            );

            if (!body?.name || !(body.name as string).startsWith(userFilesPattern)) {
                set.status = 400;
                return { error: 'Invalid snapshot name' };
            }

            const snapshotName = body.name as string;
            const snapshotPath = path.join(directories?.backups ?? '', snapshotName);

            if (!fs.existsSync(snapshotPath)) {
                set.status = 404;
                return;
            }

            return fs.readFileSync(snapshotPath, 'utf8');
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    })
    .post('/make-snapshot', (context) => {
        const { set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;

        try {
            backupUserSettings((user?.profile as Record<string, unknown>)?.handle as string, false);
            set.status = 204;
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    })
    .post('/restore-snapshot', (context) => {
        const body = context.body as Record<string, unknown>;
        const { set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            const validationError = validateFileName(body?.name);
            if (validationError) {
                set.status = 400;
                return { error: validationError };
            }

            const userFilesPattern = getSettingsBackupFilePrefix(
                (user?.profile as Record<string, unknown>)?.handle as string,
            );

            if (!body?.name || !(body.name as string).startsWith(userFilesPattern)) {
                set.status = 400;
                return { error: 'Invalid snapshot name' };
            }

            const snapshotName = body.name as string;
            const snapshotPath = path.join(directories?.backups ?? '', snapshotName);

            if (!fs.existsSync(snapshotPath)) {
                set.status = 404;
                return;
            }

            const pathToSettings = path.join(directories?.root ?? '', SETTINGS_FILE);
            fs.rmSync(pathToSettings, { force: true });
            fs.copyFileSync(snapshotPath, pathToSettings);

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
