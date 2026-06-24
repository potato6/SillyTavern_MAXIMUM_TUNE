import fs from 'node:fs';
import path from 'node:path';

import express from 'express';
import _ from 'lodash';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import bytes from 'bytes';

import { SETTINGS_FILE } from '../constants.js';
import { getConfigValue, generateTimestamp, removeOldBackups } from '../util.js';
import { getAllUserHandles, getUserDirectories } from '../users.js';
import { getFileNameValidationFunction } from '../middleware/validateFileName.js';

// @ts-expect-error TS(2345): Argument of type 'true' is not assignable to param... Remove this comment to see the full error message
const ENABLE_EXTENSIONS = !!getConfigValue('extensions.enabled', true, 'boolean');
// @ts-expect-error TS(2345): Argument of type 'true' is not assignable to param... Remove this comment to see the full error message
const ENABLE_EXTENSIONS_AUTO_UPDATE = !!getConfigValue('extensions.autoUpdate', true, 'boolean');
// @ts-expect-error TS(2345): Argument of type 'false' is not assignable to para... Remove this comment to see the full error message
const ENABLE_ACCOUNTS = !!getConfigValue('enableUserAccounts', false, 'boolean');
// @ts-expect-error TS(2345): Argument of type 'false' is not assignable to para... Remove this comment to see the full error message
const ENABLE_REQUEST_COMPRESSION = !!getConfigValue('performance.requestCompression.enabled', false, 'boolean');
// @ts-expect-error TS(2345): Argument of type '"256kb"' is not assignable to pa... Remove this comment to see the full error message
const REQUEST_COMPRESSION_MIN = bytes.parse(getConfigValue('performance.requestCompression.minPayloadSize', '256kb'));
// @ts-expect-error TS(2345): Argument of type '"8mb"' is not assignable to para... Remove this comment to see the full error message
const REQUEST_COMPRESSION_MAX = bytes.parse(getConfigValue('performance.requestCompression.maxPayloadSize', '8mb'));
// @ts-expect-error TS(2345): Argument of type '3000' is not assignable to param... Remove this comment to see the full error message
const REQUEST_COMPRESSION_TIMEOUT = Number(getConfigValue('performance.requestCompression.timeout', 3000, 'number'));

// 10 minutes
const AUTOSAVE_INTERVAL = 10 * 60 * 1000;

/**
 * Map of functions to trigger settings autosave for a user.
 * @type {Map<string, function>}
 */
const AUTOSAVE_FUNCTIONS = new Map();

/**
 * Triggers autosave for a user every 10 minutes.
 * @param {string} handle User handle
 * @returns {void}
 */
function triggerAutoSave(handle: any) {
    if (!AUTOSAVE_FUNCTIONS.has(handle)) {
        const throttledAutoSave = _.throttle(() => backupUserSettings(handle, true), AUTOSAVE_INTERVAL);
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
function readAndParseFromDirectory(directoryPath: any, fileExtension = '.json') {
    const files = fs
        .readdirSync(directoryPath)
        .filter(x => path.parse(x).ext == fileExtension)
        .sort();

    const parsedFiles: any = [];

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
 * @param {*} _
 * @returns {(a: string, b: string) => number} Sort function
 */
function sortByName(_: any) {
    return (a: any, b: any) => a.localeCompare(b);
}

/**
 * Gets backup file prefix for user settings.
 * @param {string} handle User handle
 * @returns {string} File prefix
 */
export function getSettingsBackupFilePrefix(handle: any) {
    return `settings_${handle}_`;
}

function readPresetsFromDirectory(directoryPath: any, options = {}) {
    const {
        // @ts-expect-error TS(2339): Property 'sortFunction' does not exist on type '{}... Remove this comment to see the full error message
        sortFunction,
        // @ts-expect-error TS(2339): Property 'removeFileExtension' does not exist on t... Remove this comment to see the full error message
        removeFileExtension = false,
        // @ts-expect-error TS(2339): Property 'fileExtension' does not exist on type '{... Remove this comment to see the full error message
        fileExtension = '.json',
    } = options;

    const files = fs.readdirSync(directoryPath).sort(sortFunction).filter(x => path.parse(x).ext == fileExtension);
    const fileContents: any = [];
    const fileNames: any = [];

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
function backupUserSettings(handle: any, preventDuplicates: any) {
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
function isDuplicateBackup(handle: any, sourceFile: any) {
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
 */
function areFilesEqual(file1: any, file2: any) {
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
function getLatestBackup(handle: any) {
    const userDirectories = getUserDirectories(handle);
    const backupFiles = fs.readdirSync(userDirectories.backups)
        .filter(x => x.startsWith(getSettingsBackupFilePrefix(handle)))
        .map(x => ({ name: x, ctime: fs.statSync(path.join(userDirectories.backups, x)).ctimeMs }));
    const latestBackup = backupFiles.sort((a, b) => b.ctime - a.ctime)[0]?.name;
    if (!latestBackup) {
        return null;
    }
    return path.join(userDirectories.backups, latestBackup);
}

export const router = express.Router();

router.post('/save', function (request, response) {
    try {
        // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
        const pathToSettings = path.join(request.user.directories.root, SETTINGS_FILE);
        writeFileAtomicSync(pathToSettings, JSON.stringify(request.body, null, 4), 'utf8');
        // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
        triggerAutoSave(request.user.profile.handle);
        response.send({ result: 'ok' });
    } catch (err) {
        console.error(err);
        response.send(err);
    }
});

// Wintermute's code
router.post('/get', (request, response) => {
    let settings;
    try {
        // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
        const pathToSettings = path.join(request.user.directories.root, SETTINGS_FILE);
        settings = fs.readFileSync(pathToSettings, 'utf8');
    } catch (e) {
        return response.sendStatus(500);
    }

    // NovelAI Settings
    const { fileContents: novelai_settings, fileNames: novelai_setting_names }
        // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
        = readPresetsFromDirectory(request.user.directories.novelAI_Settings, {
            // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
            sortFunction: sortByName(request.user.directories.novelAI_Settings),
            removeFileExtension: true,
        });

    // OpenAI Settings
    const { fileContents: openai_settings, fileNames: openai_setting_names }
        // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
        = readPresetsFromDirectory(request.user.directories.openAI_Settings, {
            // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
            sortFunction: sortByName(request.user.directories.openAI_Settings), removeFileExtension: true,
        });

    // TextGenerationWebUI Settings
    const { fileContents: textgenerationwebui_presets, fileNames: textgenerationwebui_preset_names }
        // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
        = readPresetsFromDirectory(request.user.directories.textGen_Settings, {
            // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
            sortFunction: sortByName(request.user.directories.textGen_Settings), removeFileExtension: true,
        });

    //Kobold
    const { fileContents: koboldai_settings, fileNames: koboldai_setting_names }
        // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
        = readPresetsFromDirectory(request.user.directories.koboldAI_Settings, {
            // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
            sortFunction: sortByName(request.user.directories.koboldAI_Settings), removeFileExtension: true,
        });

    const worldFiles = fs
        // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
        .readdirSync(request.user.directories.worlds)
        .filter(file => path.extname(file).toLowerCase() === '.json')
        .sort((a, b) => a.localeCompare(b));
    const world_names = worldFiles.map(item => path.parse(item).name);

    // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
    const themes = readAndParseFromDirectory(request.user.directories.themes);
    // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
    const movingUIPresets = readAndParseFromDirectory(request.user.directories.movingUI);
    // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
    const quickReplyPresets = readAndParseFromDirectory(request.user.directories.quickreplies);

    // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
    const instruct = readAndParseFromDirectory(request.user.directories.instruct);
    // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
    const context = readAndParseFromDirectory(request.user.directories.context);
    // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
    const sysprompt = readAndParseFromDirectory(request.user.directories.sysprompt);
    // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
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

router.post('/get-snapshots', async (request, response) => {
    try {
        // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
        const snapshots = fs.readdirSync(request.user.directories.backups);
        // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
        const userFilesPattern = getSettingsBackupFilePrefix(request.user.profile.handle);
        const userSnapshots = snapshots.filter(x => x.startsWith(userFilesPattern));

        const result = userSnapshots.map(x => {
            // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
            const stat = fs.statSync(path.join(request.user.directories.backups, x));
            return { date: stat.ctimeMs, name: x, size: stat.size };
        });

        response.json(result);
    } catch (error) {
        console.error(error);
        response.sendStatus(500);
    }
});

router.post('/load-snapshot', getFileNameValidationFunction('name'), async (request, response) => {
    try {
        // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
        const userFilesPattern = getSettingsBackupFilePrefix(request.user.profile.handle);

        if (!request.body.name || !request.body.name.startsWith(userFilesPattern)) {
            return response.status(400).send({ error: 'Invalid snapshot name' });
        }

        const snapshotName = request.body.name;
        // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
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

router.post('/make-snapshot', async (request, response) => {
    try {
        // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
        backupUserSettings(request.user.profile.handle, false);
        response.sendStatus(204);
    } catch (error) {
        console.error(error);
        response.sendStatus(500);
    }
});

router.post('/restore-snapshot', getFileNameValidationFunction('name'), async (request, response) => {
    try {
        // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
        const userFilesPattern = getSettingsBackupFilePrefix(request.user.profile.handle);

        if (!request.body.name || !request.body.name.startsWith(userFilesPattern)) {
            return response.status(400).send({ error: 'Invalid snapshot name' });
        }

        const snapshotName = request.body.name;
        // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
        const snapshotPath = path.join(request.user.directories.backups, snapshotName);

        if (!fs.existsSync(snapshotPath)) {
            return response.sendStatus(404);
        }

        // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
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
