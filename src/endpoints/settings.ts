// @ts-expect-error TS(1192) FIXME: Module '"node:fs"' has no default export.
import fs from 'node:fs';
// @ts-expect-error TS(1259) FIXME: Module '"node:path"' can only be default-imported ... Remove this comment to see the full error message
import path from 'node:path';

// @ts-expect-error TS(1259) FIXME: Module '"/mnt/DISCO/downloads/some_git_projects/Si... Remove this comment to see the full error message
import express from 'express';
// @ts-expect-error TS(2792) FIXME: Cannot find module 'es-toolkit/compat'. Did you me... Remove this comment to see the full error message
import { throttle } from 'es-toolkit/compat';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
// @ts-expect-error TS(1259) FIXME: Module '"/mnt/DISCO/downloads/some_git_projects/Si... Remove this comment to see the full error message
import bytes from 'bytes';

import { SETTINGS_FILE } from '../constants.js';
import { getConfigValue, generateTimestamp, removeOldBackups } from '../util.js';
import { getAllUserHandles, getUserDirectories } from '../users.js';
import { getFileNameValidationFunction } from '../middleware/validateFileName.js';

// @ts-expect-error TS(2345) FIXME: Argument of type 'true' is not assignable to param... Remove this comment to see the full error message
const ENABLE_EXTENSIONS = !!getConfigValue('extensions.enabled', true, 'boolean');
// @ts-expect-error TS(2345) FIXME: Argument of type 'true' is not assignable to param... Remove this comment to see the full error message
const ENABLE_EXTENSIONS_AUTO_UPDATE = !!getConfigValue('extensions.autoUpdate', true, 'boolean');
// @ts-expect-error TS(2345) FIXME: Argument of type 'false' is not assignable to para... Remove this comment to see the full error message
const ENABLE_ACCOUNTS = !!getConfigValue('enableUserAccounts', false, 'boolean');
// @ts-expect-error TS(2345) FIXME: Argument of type 'false' is not assignable to para... Remove this comment to see the full error message
const ENABLE_REQUEST_COMPRESSION = !!getConfigValue('performance.requestCompression.enabled', false, 'boolean');
// @ts-expect-error TS(2345) FIXME: Argument of type '"256kb"' is not assignable to pa... Remove this comment to see the full error message
const REQUEST_COMPRESSION_MIN = bytes.parse(getConfigValue('performance.requestCompression.minPayloadSize', '256kb'));
// @ts-expect-error TS(2345) FIXME: Argument of type '"8mb"' is not assignable to para... Remove this comment to see the full error message
const REQUEST_COMPRESSION_MAX = bytes.parse(getConfigValue('performance.requestCompression.maxPayloadSize', '8mb'));
// @ts-expect-error TS(2345) FIXME: Argument of type '3000' is not assignable to param... Remove this comment to see the full error message
const REQUEST_COMPRESSION_TIMEOUT = Number(getConfigValue('performance.requestCompression.timeout', 3000, 'number'));

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
        const throttledAutoSave = throttle(() => backupUserSettings(handle, true), AUTOSAVE_INTERVAL);
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
        // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
        .filter(x => path.parse(x).ext == fileExtension)
        .sort();

    const parsedFiles: unknown[] = [];

    // @ts-expect-error TS(7006) FIXME: Parameter 'item' implicitly has an 'any' type.
    files.forEach(item => {
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
function readPresetsFromDirectory(directoryPath: string, options: { sortFunction?: (a: string, b: string) => number; removeFileExtension?: boolean; fileExtension?: string } = {}) {
    const {
        sortFunction,
        removeFileExtension = false,
        fileExtension = '.json',
    } = options;

    // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
    const files = fs.readdirSync(directoryPath).sort(sortFunction).filter(x => path.parse(x).ext == fileExtension);
    const fileContents: string[] = [];
    const fileNames: string[] = [];

    // @ts-expect-error TS(7006) FIXME: Parameter 'item' implicitly has an 'any' type.
    files.forEach(item => {
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

    const backupFile = path.join(userDirectories.backups, `${getSettingsBackupFilePrefix(handle)}${generateTimestamp()}.json`);
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
    const backupFiles = fs.readdirSync(userDirectories.backups)
        // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
        .filter(x => x.startsWith(getSettingsBackupFilePrefix(handle)))
        // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
        .map(x => ({ name: x, ctime: fs.statSync(path.join(userDirectories.backups, x)).ctimeMs }));
    // @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
    const latestBackup = backupFiles.sort((a, b) => b.ctime - a.ctime)[0]?.name;
    if (!latestBackup) {
        return null;
    }
    return path.join(userDirectories.backups, latestBackup);
}

export const router = express.Router();

// @ts-expect-error TS(7006) FIXME: Parameter 'request' implicitly has an 'any' type.
router.post('/save', function (request, response) {
    try {
        const pathToSettings = path.join(request.user.directories.root, SETTINGS_FILE);
        writeFileAtomicSync(pathToSettings, JSON.stringify(request.body, null, 4), 'utf8');
        triggerAutoSave(request.user.profile.handle);
        response.send({ result: 'ok' });
    } catch (err) {
        console.error(err);
        response.send(err);
    }
});

// Wintermute's code
// @ts-expect-error TS(7006) FIXME: Parameter 'request' implicitly has an 'any' type.
router.post('/get', (request, response) => {
    let settings;
    try {
        const pathToSettings = path.join(request.user.directories.root, SETTINGS_FILE);
        settings = fs.readFileSync(pathToSettings, 'utf8');
    } catch {
        return response.sendStatus(500);
    }

    // NovelAI Settings
    const { fileContents: novelai_settings, fileNames: novelai_setting_names }
        = readPresetsFromDirectory(request.user.directories.novelAI_Settings, {
            sortFunction: sortByName(request.user.directories.novelAI_Settings),
            removeFileExtension: true,
        });

    // OpenAI Settings
    const { fileContents: openai_settings, fileNames: openai_setting_names }
        = readPresetsFromDirectory(request.user.directories.openAI_Settings, {
            sortFunction: sortByName(request.user.directories.openAI_Settings), removeFileExtension: true,
        });

    // TextGenerationWebUI Settings
    const { fileContents: textgenerationwebui_presets, fileNames: textgenerationwebui_preset_names }
        = readPresetsFromDirectory(request.user.directories.textGen_Settings, {
            sortFunction: sortByName(request.user.directories.textGen_Settings), removeFileExtension: true,
        });

    //Kobold
    const { fileContents: koboldai_settings, fileNames: koboldai_setting_names }
        = readPresetsFromDirectory(request.user.directories.koboldAI_Settings, {
            sortFunction: sortByName(request.user.directories.koboldAI_Settings), removeFileExtension: true,
        });

    const worldFiles = fs
        .readdirSync(request.user.directories.worlds)
        // @ts-expect-error TS(7006) FIXME: Parameter 'file' implicitly has an 'any' type.
        .filter(file => path.extname(file).toLowerCase() === '.json')
        // @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
        .sort((a, b) => a.localeCompare(b));
    // @ts-expect-error TS(7006) FIXME: Parameter 'item' implicitly has an 'any' type.
    const world_names = worldFiles.map(item => path.parse(item).name);

    const themes = readAndParseFromDirectory(request.user.directories.themes);
    const movingUIPresets = readAndParseFromDirectory(request.user.directories.movingUI);
    const quickReplyPresets = readAndParseFromDirectory(request.user.directories.quickreplies);

    const instruct = readAndParseFromDirectory(request.user.directories.instruct);
    const context = readAndParseFromDirectory(request.user.directories.context);
    const sysprompt = readAndParseFromDirectory(request.user.directories.sysprompt);
    const reasoning = readAndParseFromDirectory(request.user.directories.reasoning);

    response.send({
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
        context,
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
    });
});

// @ts-expect-error TS(7006) FIXME: Parameter 'request' implicitly has an 'any' type.
router.post('/get-snapshots', async (request, response) => {
    try {
        const snapshots = fs.readdirSync(request.user.directories.backups);
        const userFilesPattern = getSettingsBackupFilePrefix(request.user.profile.handle);
        // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
        const userSnapshots = snapshots.filter(x => x.startsWith(userFilesPattern));

        // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
        const result = userSnapshots.map(x => {
            const stat = fs.statSync(path.join(request.user.directories.backups, x));
            return { date: stat.ctimeMs, name: x, size: stat.size };
        });

        response.json(result);
    } catch (error) {
        console.error(error);
        response.sendStatus(500);
    }
});

// @ts-expect-error TS(7006) FIXME: Parameter 'request' implicitly has an 'any' type.
router.post('/load-snapshot', getFileNameValidationFunction('name'), async (request, response) => {
    try {
        const userFilesPattern = getSettingsBackupFilePrefix(request.user.profile.handle);

        if (!request.body.name || !request.body.name.startsWith(userFilesPattern)) {
            return response.status(400).send({ error: 'Invalid snapshot name' });
        }

        const snapshotName = request.body.name;
        const snapshotPath = path.join(request.user.directories.backups, snapshotName);

        if (!fs.existsSync(snapshotPath)) {
            return response.sendStatus(404);
        }

        const content = fs.readFileSync(snapshotPath, 'utf8');

        response.send(content);
    } catch (error) {
        console.error(error);
        response.sendStatus(500);
    }
});

// @ts-expect-error TS(7006) FIXME: Parameter 'request' implicitly has an 'any' type.
router.post('/make-snapshot', async (request, response) => {
    try {
        backupUserSettings(request.user.profile.handle, false);
        response.sendStatus(204);
    } catch (error) {
        console.error(error);
        response.sendStatus(500);
    }
});

// @ts-expect-error TS(7006) FIXME: Parameter 'request' implicitly has an 'any' type.
router.post('/restore-snapshot', getFileNameValidationFunction('name'), async (request, response) => {
    try {
        const userFilesPattern = getSettingsBackupFilePrefix(request.user.profile.handle);

        if (!request.body.name || !request.body.name.startsWith(userFilesPattern)) {
            return response.status(400).send({ error: 'Invalid snapshot name' });
        }

        const snapshotName = request.body.name;
        const snapshotPath = path.join(request.user.directories.backups, snapshotName);

        if (!fs.existsSync(snapshotPath)) {
            return response.sendStatus(404);
        }

        const pathToSettings = path.join(request.user.directories.root, SETTINGS_FILE);
        fs.rmSync(pathToSettings, { force: true });
        fs.copyFileSync(snapshotPath, pathToSettings);

        response.sendStatus(204);
    } catch (error) {
        console.error(error);
        response.sendStatus(500);
    }
});

/**
 * Initializes the settings endpoint
 */
export async function init() {
    await backupSettings();
}
