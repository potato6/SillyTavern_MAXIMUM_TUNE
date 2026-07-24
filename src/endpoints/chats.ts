import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import process from 'node:process';

import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import { throttle, isObjectLike } from 'es-toolkit/compat';

import { forbiddenRegExp } from '../middleware/validateFileName.js';
import {
    getConfigValue,
    humanizedDateTime,
    tryParse,
    generateTimestamp,
    removeOldBackups,
    formatBytes,
    tryWriteFileSync,
    tryReadFileSync,
    tryDeleteFile,
    readFirstLine,
    isPathUnderParent,
} from '../util.js';

const isBackupEnabled = !!getConfigValue('backups.chat.enabled', true, 'boolean');
const maxTotalChatBackups = Number(getConfigValue('backups.chat.maxTotalBackups', -1, 'number'));
const throttleInterval = Number(getConfigValue('backups.chat.throttleInterval', 10_000, 'number'));
const checkIntegrity = !!getConfigValue('backups.chat.checkIntegrity', true, 'boolean');

export const CHAT_BACKUPS_PREFIX = 'chat_';

type ChatMatchFunction = (textArray: string[]) => boolean;

/**
 * Checks the avatar_url field in the request body for forbidden characters.
 * Mimics the behaviour of the Express validateAvatarUrlMiddleware.
 */
function validateAvatarUrlField(body: unknown): boolean {
    if (body && typeof body === 'object' && 'avatar_url' in (body as Record<string, unknown>)) {
        const value = (body as Record<string, unknown>).avatar_url;
        if (value != null && typeof (value as any).toString === 'function') {
            if (forbiddenRegExp.test(String(value))) {
                return false;
            }
        }
    }
    return true;
}

/**
 * Saves a chat to the backups directory.
 * @param {string} directory The user's backup directory.
 * @param {string} name The name of the chat.
 * @param {string} data The serialized chat to save.
 * @param {string} backupPrefix The file prefix. Typically CHAT_BACKUPS_PREFIX.
 */
function backupChat(
    directory: string,
    name: string,
    data: string,
    backupPrefix = CHAT_BACKUPS_PREFIX,
) {
    try {
        if (!isBackupEnabled) {
            return;
        }
        if (!fs.existsSync(directory)) {
            console.error(
                `The chat couldn't be backed up because no directory exists at ${directory}!`,
            );
        }
        // replace non-alphanumeric characters with underscores
        name = sanitize(name)
            .replace(/[^a-z0-9]/gi, '_')
            .toLowerCase();

        const backupFile = path.join(
            directory,
            `${backupPrefix}${name}_${generateTimestamp()}.jsonl`,
        );

        tryWriteFileSync(backupFile, data);
        removeOldBackups(directory, `${backupPrefix}${name}_`);
        if (isNaN(maxTotalChatBackups) || maxTotalChatBackups < 0) {
            return;
        }
        // @ts-expect-error TS(2345) FIXME: Argument of type 'number' is not assignable to par... Remove this comment to see the full error message
        removeOldBackups(directory, backupPrefix, maxTotalChatBackups);
    } catch (err) {
        console.error(`Could not backup chat for ${name}`, err);
    }
}

/**
 * @type {Map<string, import('es-toolkit/compat').DebouncedFunc<typeof backupChat>>}
 */
const backupFunctions = new Map();

/**
 * Gets a backup function for a user.
 * @param {string} handle User handle
 * @returns {typeof backupChat} Backup function
 */
function getBackupFunction(handle: string) {
    if (!backupFunctions.has(handle)) {
        backupFunctions.set(
            handle,
            throttle(backupChat, throttleInterval, { leading: true, trailing: true }),
        );
    }
    return backupFunctions.get(handle) || (() => {});
}

/**
 * Gets a preview message from a chat message string.
 * @param {string} [lastMessage] - The message to truncate
 * @returns {string} A truncated preview of the last message or empty string if no messages
 */
function getPreviewMessage(lastMessage: string): string {
    const strlen = 400;

    if (!lastMessage) {
        return '';
    }

    return lastMessage.length > strlen
        ? '...' + lastMessage.substring(lastMessage.length - strlen)
        : lastMessage;
}

process.on('exit', () => {
    for (const func of backupFunctions.values()) {
        func.flush();
    }
});

/**
 * Imports a chat from Ooba's format.
 * @param {string} userName User name
 * @param {string} characterName Character name
 * @param {object} jsonData JSON data
 * @returns {string} Chat data
 */
function importOobaChat(userName: string, characterName: string, jsonData: object): string {
    /** @type {object[]} */
    const chat = [
        {
            chat_metadata: {},
            user_name: 'unused',
            character_name: 'unused',
        },
    ];

    // @ts-expect-error TS(2339) FIXME: Property 'data_visible' does not exist on type 'ob... Remove this comment to see the full error message
    for (const arr of jsonData.data_visible) {
        if (arr[0]) {
            const userMessage = {
                name: userName,
                is_user: true,
                send_date: new Date().toISOString(),
                mes: arr[0],
                extra: {},
            };
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ name: string; is_user: boolean... Remove this comment to see the full error message
            chat.push(userMessage);
        }
        if (arr[1]) {
            const charMessage = {
                name: characterName,
                is_user: false,
                send_date: new Date().toISOString(),
                mes: arr[1],
                extra: {},
            };
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ name: string; is_user: boolean... Remove this comment to see the full error message
            chat.push(charMessage);
        }
    }

    return chat.map((obj) => JSON.stringify(obj)).join('\n');
}

/**
 * Imports a chat from Agnai's format.
 * @param {string} userName User name
 * @param {string} characterName Character name
 * @param {object} jsonData Chat data
 * @returns {string} Chat data
 */
function importAgnaiChat(userName: string, characterName: string, jsonData: object): string {
    /** @type {object[]} */
    const chat = [
        {
            chat_metadata: {},
            user_name: 'unused',
            character_name: 'unused',
        },
    ];

    // @ts-expect-error TS(2339) FIXME: Property 'messages' does not exist on type 'object... Remove this comment to see the full error message
    for (const message of jsonData.messages) {
        const isUser = !!message.userId;
        chat.push({
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ name: string; is_user: boolean... Remove this comment to see the full error message
            name: isUser ? userName : characterName,
            is_user: isUser,
            send_date: new Date().toISOString(),
            mes: message.msg,
            extra: {},
        });
    }

    return chat.map((obj) => JSON.stringify(obj)).join('\n');
}

/**
 * Imports a chat from CAI Tools format.
 * @param {string} userName User name
 * @param {string} characterName Character name
 * @param {object} jsonData JSON data
 * @returns {string[]} Converted data
 */
function importCAIChat(userName: string, characterName: string, jsonData: object): string[] {
    /**
     * Converts the chat data to suitable format.
     * @param {object} history Imported chat data
     * @returns {object[]} Converted chat data
     */
    function convert(history: object) {
        const starter = {
            chat_metadata: {},
            user_name: 'unused',
            character_name: 'unused',
        };

        // @ts-expect-error TS(2339) FIXME: Property 'msgs' does not exist on type 'object'.
        const historyData = history.msgs.map(
            (msg: { src: { is_human: boolean }; text: string }) => ({
                name: msg.src.is_human ? userName : characterName,
                is_user: msg.src.is_human,
                send_date: new Date().toISOString(),
                mes: msg.text,
                extra: {},
            }),
        );

        return [starter, ...historyData];
    }

    // @ts-expect-error TS(2339) FIXME: Property 'histories' does not exist on type 'objec... Remove this comment to see the full error message
    const newChats = (jsonData.histories.histories ?? []).map((history: object) =>
        newChats.push(
            convert(history)
                .map((obj) => JSON.stringify(obj))
                .join('\n'),
        ),
    );
    return newChats;
}

/**
 * Imports a chat from Kobold Lite format.
 * @param {string} _userName User name
 * @param {string} _characterName Character name
 * @param {object} data JSON data
 * @returns {string} Chat data
 */
function importKoboldLiteChat(_userName: string, _characterName: string, data: object): string {
    const inputToken = '{{[INPUT]}}';
    const outputToken = '{{[OUTPUT]}}';

    /** @type {function(string): object} */
    function processKoboldMessage(msg: string): object {
        const isUser = msg.includes(inputToken);
        return {
            name: isUser ? userName : characterName,
            is_user: isUser,
            mes: msg.replaceAll(inputToken, '').replaceAll(outputToken, '').trim(),
            send_date: new Date().toISOString(),
            extra: {},
        };
    }

    // Create the header
    // @ts-expect-error TS(2339) FIXME: Property 'savedsettings' does not exist on type 'o... Remove this comment to see the full error message
    const userName = String(data.savedsettings.chatname);
    // @ts-expect-error TS(2339) FIXME: Property 'savedsettings' does not exist on type 'o... Remove this comment to see the full error message
    const characterName = String(data.savedsettings.chatopponent).split('||$||')[0];
    const header = {
        chat_metadata: {},
        user_name: 'unused',
        character_name: 'unused',
    };
    // Format messages
    // @ts-expect-error TS(2339) FIXME: Property 'actions' does not exist on type 'object'... Remove this comment to see the full error message
    const formattedMessages = data.actions.map(processKoboldMessage);
    // Add prompt if available
    // @ts-expect-error TS(2339) FIXME: Property 'prompt' does not exist on type 'object'.
    if (data.prompt) {
        // @ts-expect-error TS(2339) FIXME: Property 'prompt' does not exist on type 'object'.
        formattedMessages.unshift(processKoboldMessage(data.prompt));
    }
    // Combine header and messages
    const chatData = [header, ...formattedMessages];
    return chatData.map((obj) => JSON.stringify(obj)).join('\n');
}

/**
 * Flattens `msg` and `swipes` data from Chub Chat format.
 * Only changes enough to make it compatible with the standard chat serialization format.
 * @param {string} userName User name
 * @param {string} characterName Character name
 * @param {string[]} lines serialised JSONL data
 * @returns {string} Converted data
 */
function flattenChubChat(userName: string, characterName: string, lines: string[]): string {
    /**
     * Flattens a swipe entry
     * @param {{message?: string} | string} swipe Swipe entry
     * @returns {string} The flattened swipe message
     */
    function flattenSwipe(swipe: { message?: string } | string): string {
        return typeof swipe === 'object' && swipe.message ? swipe.message : String(swipe);
    }

    /**
     * Converts a single chat line
     * @param {string} line Serialized chat line
     * @returns {string} Converted chat line
     */
    function convert(line: string): string {
        const lineData = tryParse(line);
        if (!lineData) return line;

        if (lineData.mes && lineData.mes.message) {
            lineData.mes = lineData?.mes.message;
        }

        if (lineData?.swipes && Array.isArray(lineData.swipes)) {
            lineData.swipes = lineData.swipes.map((swipe: { message?: string } | string) =>
                flattenSwipe(swipe),
            );
        }

        return JSON.stringify(lineData);
    }

    return (lines ?? []).map(convert).join('\n');
}

/**
 * Imports a chat from RisuAI format.
 * @param {string} userName User name
 * @param {string} characterName Character name
 * @param {object} jsonData Imported chat data
 * @returns {string} Chat data
 */
function importRisuChat(userName: string, characterName: string, jsonData: object): string {
    /** @type {object[]} */
    const chat = [
        {
            chat_metadata: {},
            user_name: 'unused',
            character_name: 'unused',
        },
    ];

    // @ts-expect-error TS(2339) FIXME: Property 'data' does not exist on type 'object'.
    for (const message of jsonData.data.message) {
        const isUser = message.role === 'user';
        chat.push({
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ name: any; is_user: boolean; s... Remove this comment to see the full error message
            name: message.name ?? (isUser ? userName : characterName),
            is_user: isUser,
            send_date: new Date(Number(message.time ?? Date.now())).toISOString(),
            mes: message.data ?? '',
            extra: {},
        });
    }

    return chat.map((obj) => JSON.stringify(obj)).join('\n');
}

/**
 * Checks if the chat being saved has the same integrity as the one being loaded.
 * @param {string} filePath Path to the chat file
 * @param {string} integritySlug Integrity slug
 * @returns {Promise<boolean>} Whether the chat is intact
 */
async function checkChatIntegrity(filePath: string, integritySlug: string): Promise<boolean> {
    // If the chat file doesn't exist, assume it's intact
    if (!fs.existsSync(filePath)) {
        return true;
    }

    // Parse the first line of the chat file as JSON
    const firstLine = await readFirstLine(filePath);
    // @ts-expect-error TS(2345) FIXME: Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
    const jsonData = tryParse(firstLine);
    const chatIntegrity = jsonData?.chat_metadata?.integrity;

    // If the chat has no integrity metadata, assume it's intact
    if (!chatIntegrity) {
        console.debug(
            `File "${filePath}" does not have integrity metadata matching "${integritySlug}". The integrity validation has been skipped.`,
        );
        return true;
    }

    // Check if the integrity matches
    return chatIntegrity === integritySlug;
}

/**
 * @typedef {object} ChatInfo
 * @property {string} [file_id] - The name of the chat file (without extension)
 * @property {string} [file_name] - The name of the chat file (with extension)
 * @property {string} [file_size] - The size of the chat file in a human-readable format
 * @property {number} [chat_items] - The number of chat items in the file
 * @property {string} [mes] - The last message in the chat
 * @property {number|string} [last_mes] - The timestamp of the last message
 * @property {object} [chat_metadata] - Additional chat metadata
 * @property {boolean} [match] - Whether the chat matches the search criteria
 */

/**
 * Reads the information from a chat file.
 * @param {string} pathToFile - Path to the chat file
 * @param {object} additionalData - Additional data to include in the result
 * @param {boolean} withMetadata - Whether to read chat metadata
 * @param {ChatMatchFunction|null} matcher - Optional function to match messages
 * @returns {Promise<ChatInfo>} Chat information
 */
export async function getChatInfo(
    pathToFile: string,
    additionalData: Record<string, unknown> = {},
    withMetadata = false,
    matcher: ChatMatchFunction | null = null,
) {
    return new Promise(async (res) => {
        const parsedPath = path.parse(pathToFile);
        const stats = await fs.promises.stat(pathToFile);
        const hasMatcher = typeof matcher === 'function';

        const chatData = {
            match: false,
            file_id: parsedPath.name,
            file_name: parsedPath.base,
            file_size: formatBytes(stats.size),
            chat_items: 0,
            mes: '[The chat is empty]',
            last_mes: stats.mtimeMs,
            ...additionalData,
        };

        if (stats.size === 0) {
            res(chatData);
            return;
        }

        const fileStream = fs.createReadStream(pathToFile);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity,
        });

        let lastLine: string | undefined;
        let itemCounter = 0;
        let hasAnyMatch = false;
        let matchBuffer: string[] = [];
        rl.on('line', (line) => {
            if (withMetadata && itemCounter === 0) {
                const jsonData = tryParse(line);
                if (jsonData && isObjectLike(jsonData.chat_metadata)) {
                    // @ts-expect-error TS(2339) FIXME: Property 'chat_metadata' does not exist on type '{... Remove this comment to see the full error message
                    chatData.chat_metadata = jsonData.chat_metadata;
                }
            }
            // Skip matching if any match was already found
            if (hasMatcher && !hasAnyMatch && itemCounter > 0) {
                const jsonData = tryParse(line);
                if (jsonData) {
                    matchBuffer.push(jsonData.mes || '');
                    if (matcher(matchBuffer)) {
                        hasAnyMatch = true;
                        matchBuffer = [];
                    }
                }
            }
            itemCounter++;
            lastLine = line;
        });
        rl.on('close', () => {
            rl.close();

            if (lastLine) {
                const jsonData = tryParse(lastLine);
                if (
                    jsonData &&
                    (jsonData.name || jsonData.character_name || jsonData.chat_metadata)
                ) {
                    chatData.chat_items = itemCounter - 1;
                    chatData.mes = jsonData.mes || '[The message is empty]';
                    chatData.last_mes =
                        jsonData.send_date || new Date(Math.round(stats.mtimeMs)).toISOString();
                    chatData.match = hasMatcher ? hasAnyMatch : true;

                    res(chatData);
                } else {
                    console.warn('Found an invalid or corrupted chat file:', pathToFile);
                    res({});
                }
            }
        });
    });
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error
class IntegrityMismatchError extends Error {
    date: Date;
    constructor(...params: unknown[]) {
        // Pass remaining arguments (including vendor specific ones) to parent constructor
        // @ts-expect-error TS(2769) FIXME: No overload matches this call.
        super(...params);
        // Maintains proper stack trace for where our error was thrown (non-standard)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, IntegrityMismatchError);
        }
        this.date = new Date();
    }
}

/**
 * Tries to save the chat data to a file, performing an integrity check if required.
 * @param {Array} chatData The chat array to save.
 * @param {string} filePath Target file path for the data.
 * @param {boolean} skipIntegrityCheck If undefined, the chat's integrity will not be checked.
 * @param {string} handle The users handle, passed to getBackupFunction.
 * @param {string} cardName Passed to backupChat.
 * @param {string} backupDirectory Passed to backupChat.
 */
export async function trySaveChat(
    chatData: { chat_metadata?: { integrity?: string } }[],
    filePath: string,
    skipIntegrityCheck = false,
    handle: string,
    cardName: string,
    backupDirectory: string,
): Promise<void> {
    const jsonlData = chatData?.map((m: unknown) => JSON.stringify(m)).join('\n');

    const doIntegrityCheck = checkIntegrity && !skipIntegrityCheck;
    const chatIntegritySlug = doIntegrityCheck
        ? chatData?.[0]?.chat_metadata?.integrity
        : undefined;

    if (chatIntegritySlug && !(await checkChatIntegrity(filePath, chatIntegritySlug))) {
        throw new IntegrityMismatchError(
            `Chat integrity check failed for "${filePath}". The expected integrity slug was "${chatIntegritySlug}".`,
        );
    }
    tryWriteFileSync(filePath, jsonlData);
    getBackupFunction(handle)(backupDirectory, cardName, jsonlData);
}

export const router = new Elysia({ prefix: '/api/chats' })

    .post('/save', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const profile = user?.profile as Record<string, string> | undefined;

        try {
            if (!body || !validateAvatarUrlField(body)) {
                set.status = 400;
                return;
            }

            const handle = profile?.handle ?? '';
            const cardName = String(body.avatar_url).replace('.png', '');
            const chatData = body.chat;
            const chatFileName = `${String(body.file_name)}.jsonl`;
            const chatFilePath = path.join(
                directories?.chats ?? '',
                cardName,
                sanitize(chatFileName),
            );
            if (!isPathUnderParent(directories?.chats ?? '', chatFilePath)) {
                set.status = 400;
                return;
            }

            if (Array.isArray(chatData)) {
                await trySaveChat(
                    chatData as { chat_metadata?: { integrity?: string } }[],
                    chatFilePath,
                    body.force as boolean,
                    handle,
                    cardName,
                    directories?.backups ?? '',
                );
                return { ok: true };
            } else {
                set.status = 400;
                return { error: "The request's body.chat is not an array." };
            }
        } catch (error) {
            if (error instanceof IntegrityMismatchError) {
                console.error(error.message);
                set.status = 400;
                return { error: 'integrity' };
            }
            console.error(error);
            set.status = 500;
            return { error: 'An error has occurred, see the console logs for more information.' };
        }
    })

    .post('/get', (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            if (!body || !validateAvatarUrlField(body)) {
                set.status = 400;
                return;
            }

            const dirName = String(body.avatar_url).replace('.png', '');
            const directoryPath = path.join(directories?.chats ?? '', dirName);
            if (!isPathUnderParent(directories?.chats ?? '', directoryPath)) {
                set.status = 400;
                return;
            }
            const chatDirExists = fs.existsSync(directoryPath);

            //if no chat dir for the character is found, make one with the character name
            if (!chatDirExists) {
                fs.mkdirSync(directoryPath);
                return {};
            }

            if (!body.file_name) {
                return {};
            }

            const chatFileName = `${String(body.file_name)}.jsonl`;
            const chatFilePath = path.join(directoryPath, sanitize(chatFileName));

            return getChatData(chatFilePath);
        } catch (error) {
            console.error(error);
            return {};
        }
    })

    .post('/rename', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            if (!body || !validateAvatarUrlField(body)) {
                set.status = 400;
                return;
            }

            if (!body.original_file || !body.renamed_file) {
                set.status = 400;
                return;
            }

            const pathToFolder = body.is_group
                ? (directories?.groupChats ?? '')
                : path.join(directories?.chats ?? '', String(body.avatar_url).replace('.png', ''));
            if (!body.is_group && !isPathUnderParent(directories?.chats ?? '', pathToFolder)) {
                set.status = 400;
                return;
            }
            const pathToOriginalFile = path.join(
                pathToFolder,
                sanitize(body.original_file as string),
            );
            const pathToRenamedFile = path.join(
                pathToFolder,
                sanitize(body.renamed_file as string),
            );
            const sanitizedFileName = path.parse(pathToRenamedFile).name;
            console.debug('Old chat name', pathToOriginalFile);
            console.debug('New chat name', pathToRenamedFile);

            if (!fs.existsSync(pathToOriginalFile) || fs.existsSync(pathToRenamedFile)) {
                console.error('Either Source or Destination files are not available');
                set.status = 400;
                return { error: true };
            }

            fs.copyFileSync(pathToOriginalFile, pathToRenamedFile);
            fs.unlinkSync(pathToOriginalFile);
            console.info('Successfully renamed chat file.');
            return { ok: true, sanitizedFileName };
        } catch (error) {
            console.error('Error renaming chat file:', error);
            set.status = 500;
            return { error: true };
        }
    })

    .post('/delete', (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            if (!body || !validateAvatarUrlField(body)) {
                set.status = 400;
                return;
            }

            if (!path.extname(body.chatfile as string)) {
                body.chatfile = (body.chatfile as string) + '.jsonl';
            }

            const dirName = String(body.avatar_url).replace('.png', '');
            const chatFileName = String(body.chatfile);
            const chatFilePath = path.join(
                directories?.chats ?? '',
                dirName,
                sanitize(chatFileName),
            );
            if (!isPathUnderParent(directories?.chats ?? '', chatFilePath)) {
                set.status = 400;
                return;
            }
            //Return success if the file was deleted.
            if (tryDeleteFile(chatFilePath)) {
                return { ok: true };
            } else {
                console.error('The chat file was not deleted.');
                set.status = 400;
                return;
            }
        } catch (error) {
            console.error(error);
            set.status = 500;
            return;
        }
    })

    .post('/export', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        if (!body || !validateAvatarUrlField(body)) {
            set.status = 400;
            return;
        }

        if (!body.file || (!body.avatar_url && body.is_group === false)) {
            set.status = 400;
            return;
        }
        const pathToFolder = body.is_group
            ? (directories?.groupChats ?? '')
            : path.join(directories?.chats ?? '', String(body.avatar_url).replace('.png', ''));
        const filename = path.join(pathToFolder, sanitize(body.file as string));
        if (!body.is_group && !isPathUnderParent(directories?.chats ?? '', filename)) {
            set.status = 400;
            return;
        }
        const exportfilename = body.exportfilename as string;
        if (!fs.existsSync(filename)) {
            const errorMessage = {
                message: `Could not find JSONL file to export. Source chat file: ${filename}.`,
            };
            console.error(errorMessage.message);
            set.status = 404;
            return errorMessage;
        }
        try {
            // Short path for JSONL files
            if (body.format === 'jsonl') {
                try {
                    const rawFile = fs.readFileSync(filename, 'utf8');
                    const successMessage = {
                        message: `Chat saved to ${exportfilename}`,
                        result: rawFile,
                    };

                    console.info(`Chat exported as ${exportfilename}`);
                    set.status = 200;
                    return successMessage;
                } catch (err) {
                    console.error(err);
                    const errorMessage = {
                        message: `Could not read JSONL file to export. Source chat file: ${filename}.`,
                    };
                    console.error(errorMessage.message);
                    set.status = 500;
                    return errorMessage;
                }
            }

            const readStream = fs.createReadStream(filename);
            const rl = readline.createInterface({
                input: readStream,
            });
            let buffer = '';
            rl.on('line', (line) => {
                const data = JSON.parse(line);
                // Skip non-printable/prompt-hidden messages
                if (data.is_system) {
                    return;
                }
                if (data.mes) {
                    const name = data.name;
                    const message = (data?.extra?.display_text || data?.mes || '').replace(
                        /\r?\n/g,
                        '\n',
                    );
                    buffer += `${name}: ${message}\n\n`;
                }
            });
            await new Promise<void>((resolve) => {
                rl.on('close', () => {
                    const successMessage = {
                        message: `Chat saved to ${exportfilename}`,
                        result: buffer,
                    };
                    console.info(`Chat exported as ${exportfilename}`);
                    set.status = 200;
                    // We can't return from inside the event handler, so store and resolve
                    (context as unknown as Record<string, unknown>)._exportResult = successMessage;
                    resolve();
                });
            });
            return (context as unknown as Record<string, unknown>)._exportResult;
        } catch (err) {
            console.error('chat export failed.', err);
            set.status = 400;
            return;
        }
    })

    .post('/group/import', (context) => {
        const { set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const filedata = (context as unknown as Record<string, unknown>).file as Record<
            string,
            unknown
        > | null;

        try {
            if (!filedata) {
                set.status = 400;
                return;
            }

            const chatname = humanizedDateTime();
            const pathToUpload = path.join(
                filedata.destination as string,
                filedata.filename as string,
            );
            const pathToNewFile = path.join(directories?.groupChats ?? '', `${chatname}.jsonl`);
            fs.copyFileSync(pathToUpload, pathToNewFile);
            fs.unlinkSync(pathToUpload);
            return { res: chatname };
        } catch (error) {
            console.error(error);
            return { error: true };
        }
    })

    .post('/import', (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const fileField = (context as unknown as Record<string, unknown>).file as Record<
            string,
            unknown
        > | null;

        if (!body || !validateAvatarUrlField(body)) {
            set.status = 400;
            return;
        }

        const format = body.file_type as string;
        const avatarUrl = (body.avatar_url as string).replace('.png', '');
        const characterName = sanitize((body.character_name as string) || 'Character');
        const userName = sanitize((body.user_name as string) || 'User');
        const fileNames: string[] = [];

        if (!fileField) {
            set.status = 400;
            return;
        }

        const directoryPath = path.join(directories?.chats ?? '', avatarUrl);
        if (!isPathUnderParent(directories?.chats ?? '', directoryPath)) {
            set.status = 400;
            return;
        }

        try {
            const pathToUpload = path.join(
                fileField.destination as string,
                fileField.filename as string,
            );
            const data = fs.readFileSync(pathToUpload, 'utf8');

            if (format === 'json') {
                fs.unlinkSync(pathToUpload);
                const jsonData = JSON.parse(data);

                /** @type {function(string, string, object): string|string[]} */
                let importFunc;

                if (jsonData.savedsettings !== undefined) {
                    // Kobold Lite format
                    importFunc = importKoboldLiteChat;
                } else if (jsonData.histories !== undefined) {
                    // CAI Tools format
                    importFunc = importCAIChat;
                } else if (Array.isArray(jsonData.data_visible)) {
                    // oobabooga's format
                    importFunc = importOobaChat;
                } else if (Array.isArray(jsonData.messages)) {
                    // Agnai's format
                    importFunc = importAgnaiChat;
                } else if (jsonData.type === 'risuChat') {
                    // RisuAI format
                    importFunc = importRisuChat;
                } else {
                    // Unknown format
                    console.error('Incorrect chat format .json');
                    return { error: true };
                }

                const handleChat = (chat: string) => {
                    const fileName = `${characterName} - ${humanizedDateTime()} imported.jsonl`;
                    const filePath = path.join(directoryPath, fileName);
                    fileNames.push(fileName);
                    writeFileAtomicSync(filePath, chat, 'utf8');
                };

                const chat = importFunc(userName, characterName, jsonData);

                if (Array.isArray(chat)) {
                    chat.forEach(handleChat);
                } else {
                    handleChat(chat);
                }

                return { res: true, fileNames };
            }

            if (format === 'jsonl') {
                const lines = data.split('\n');
                const header = lines[0];

                const jsonData: Record<string, unknown> = JSON.parse(header!);

                if (
                    !(
                        jsonData.user_name !== undefined ||
                        jsonData.name !== undefined ||
                        jsonData.chat_metadata !== undefined
                    )
                ) {
                    console.error('Incorrect chat format .jsonl');
                    return { error: true };
                }

                // Do a tiny bit of work to import Chub Chat data
                // Processing the entire file is so fast that it's not worth checking if it's a Chub chat first
                let flattenedChat = data;
                try {
                    // flattening is unlikely to break, but it's not worth failing to
                    // import normal chats in an attempt to import a Chub chat
                    flattenedChat = flattenChubChat(userName, characterName, lines);
                } catch (error) {
                    console.warn('Failed to flatten Chub Chat data: ', error);
                }

                const fileName = `${characterName} - ${humanizedDateTime()} imported.jsonl`;
                const filePath = path.join(directoryPath, fileName);
                fileNames.push(fileName);
                if (flattenedChat !== data) {
                    writeFileAtomicSync(filePath, flattenedChat, 'utf8');
                } else {
                    fs.copyFileSync(pathToUpload, filePath);
                }
                fs.unlinkSync(pathToUpload);
                return { res: true, fileNames };
            }
        } catch (error) {
            console.error(error);
            return { error: true };
        }
    })

    .post('/group/get', (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        if (!body || !body.id) {
            set.status = 400;
            return;
        }

        const id = body.id as string;
        const chatFilePath = path.join(directories?.groupChats ?? '', sanitize(`${id}.jsonl`));

        return getChatData(chatFilePath);
    })

    .post('/group/info', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            if (!body || !body.id) {
                set.status = 400;
                return;
            }

            const id = body.id as string;
            const chatFilePath = path.join(directories?.groupChats ?? '', sanitize(`${id}.jsonl`));

            const chatInfo = await getChatInfo(chatFilePath);
            return chatInfo;
        } catch (error) {
            console.error(error);
            set.status = 500;
            return;
        }
    })

    .post('/group/delete', (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            if (!body || !body.id) {
                set.status = 400;
                return;
            }

            const id = body.id as string;
            const chatFilePath = path.join(directories?.groupChats ?? '', sanitize(`${id}.jsonl`));

            //Return success if the file was deleted.
            if (tryDeleteFile(chatFilePath)) {
                return { ok: true };
            } else {
                console.error('The group chat file was not deleted.');
                set.status = 400;
                return;
            }
        } catch (error) {
            console.error(error);
            set.status = 500;
            return;
        }
    })

    .post('/group/save', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const profile = user?.profile as Record<string, string> | undefined;

        try {
            if (!body || !body.id) {
                set.status = 400;
                return;
            }

            const id = body.id as string;
            const handle = profile?.handle ?? '';
            const chatFilePath = path.join(directories?.groupChats ?? '', sanitize(`${id}.jsonl`));
            const chatData = body.chat;

            if (Array.isArray(chatData)) {
                await trySaveChat(
                    chatData as { chat_metadata?: { integrity?: string } }[],
                    chatFilePath,
                    body.force as boolean,
                    handle,
                    id,
                    directories?.backups ?? '',
                );
                return { ok: true };
            } else {
                set.status = 400;
                return { error: "The request's body.chat is not an array." };
            }
        } catch (error) {
            if (error instanceof IntegrityMismatchError) {
                console.error(error.message);
                set.status = 400;
                return { error: 'integrity' };
            }
            console.error(error);
            set.status = 500;
            return { error: 'An error has occurred, see the console logs for more information.' };
        }
    })

    .post('/search', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            if (!body || !validateAvatarUrlField(body)) {
                set.status = 400;
                return;
            }

            const { query, avatar_url, group_id } = body as Record<string, unknown>;

            /** @type {string[]} */
            let chatFiles: string[] = [];

            if (group_id) {
                // Find group's chat IDs first
                const groupDir = directories?.groups ?? '';
                const groupFiles = fs
                    .readdirSync(groupDir)
                    .filter((file) => path.extname(file) === '.json');

                let targetGroup: Record<string, unknown> | undefined;
                for (const groupFile of groupFiles) {
                    try {
                        const groupData = JSON.parse(
                            fs.readFileSync(path.join(groupDir, groupFile), 'utf8'),
                        );
                        if (groupData.id === group_id) {
                            targetGroup = groupData;
                            break;
                        }
                    } catch (error) {
                        console.warn(groupFile, 'group file is corrupted:', error);
                    }
                }

                if (!Array.isArray(targetGroup?.chats)) {
                    return [] as Record<string, unknown>[];
                }

                // Find group chat files for given group ID
                const groupChatsDir = directories?.groupChats ?? '';
                chatFiles = (targetGroup.chats as string[])
                    .map((chatId: string) => path.join(groupChatsDir, `${chatId}.jsonl`))
                    .filter((fileName: string) => fs.existsSync(fileName));
            } else {
                // Regular character chat directory
                const character_name = (avatar_url as string).replace('.png', '');
                const directoryPath = path.join(directories?.chats ?? '', character_name);

                if (!fs.existsSync(directoryPath)) {
                    return [] as Record<string, unknown>[];
                }

                chatFiles = fs
                    .readdirSync(directoryPath)
                    .filter((file) => path.extname(file) === '.jsonl')
                    .map((fileName) => path.join(directoryPath, fileName));
            }

            const results: Record<string, unknown>[] = [];

            /** @type {string[]} */
            const fragments = query
                ? (query as string)
                      .trim()
                      .toLowerCase()
                      .split(/\s+/)
                      .filter((x: string) => x)
                : [];

            /** @type {ChatMatchFunction} */
            const hasTextMatch = (textArray: string[]): boolean => {
                if (fragments.length === 0) {
                    return true;
                }
                return fragments.every((fragment: string) =>
                    textArray.some((text: string) =>
                        String(text ?? '')
                            .toLowerCase()
                            .includes(fragment),
                    ),
                );
            };

            for (const chatFile of chatFiles) {
                const matcher = query ? hasTextMatch : null;
                const chatInfo = (await getChatInfo(chatFile, {}, false, matcher)) as Record<
                    string,
                    unknown
                >;
                const hasMatch =
                    chatInfo.match || hasTextMatch([(chatInfo.file_id as string) ?? '']);

                // Skip corrupted or invalid chat files
                if (!chatInfo.file_name) {
                    continue;
                }

                // Empty chats without a file name match are skipped when searching with a query
                if (query && chatInfo.chat_items === 0 && !hasMatch) {
                    continue;
                }

                // If no search query or a match was found, include the chat in results
                if (!query || hasMatch) {
                    results.push({
                        file_name: chatInfo.file_id,
                        file_size: chatInfo.file_size,
                        message_count: chatInfo.chat_items,
                        last_mes: chatInfo.last_mes,
                        preview_message: getPreviewMessage(chatInfo.mes as string),
                    });
                }
            }

            return results;
        } catch (error) {
            console.error('Chat search error:', error);
            set.status = 500;
            return { error: 'Search failed' };
        }
    })

    .post('/recent', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            /** @type {{pngFile?: string, groupId?: string, filePath: string, mtime: number}[]} */
            const allChatFiles: {
                pngFile?: string;
                groupId?: string;
                filePath: string;
                mtime: number;
            }[] = [];
            const pinnedChats = Array.isArray(body?.pinned)
                ? (body.pinned as Record<string, unknown>[])
                : [];

            const getCharacterChatFiles = async () => {
                const pngDirents = await fs.promises.readdir(directories?.characters ?? '', {
                    withFileTypes: true,
                });
                const pngFiles = pngDirents
                    .filter((e) => e.isFile() && path.extname(e.name) === '.png')
                    .map((e) => e.name);

                for (const pngFile of pngFiles) {
                    const chatsDirectory = pngFile.replace('.png', '');
                    const pathToChats = path.join(directories?.chats ?? '', chatsDirectory);
                    if (!fs.existsSync(pathToChats)) {
                        continue;
                    }
                    const pathStats = await fs.promises.stat(pathToChats);
                    if (pathStats.isDirectory()) {
                        const chatFiles = await fs.promises.readdir(pathToChats);
                        const jsonlFiles = chatFiles.filter(
                            (file) => path.extname(file) === '.jsonl',
                        );

                        for (const file of jsonlFiles) {
                            const filePath = path.join(pathToChats, file);
                            const stats = await fs.promises.stat(filePath);
                            allChatFiles.push({ pngFile, filePath, mtime: stats.mtimeMs });
                        }
                    }
                }
            };

            const getGroupChatFiles = async () => {
                const groupDirents = await fs.promises.readdir(directories?.groups ?? '', {
                    withFileTypes: true,
                });
                const groups = groupDirents
                    .filter((e) => e.isFile() && path.extname(e.name) === '.json')
                    .map((e) => e.name);

                for (const group of groups) {
                    try {
                        const groupPath = path.join(directories?.groups ?? '', group);
                        const groupContents = await fs.promises.readFile(groupPath, 'utf8');
                        const groupData = JSON.parse(groupContents);

                        if (Array.isArray(groupData.chats)) {
                            for (const chat of groupData.chats) {
                                const filePath = path.join(
                                    directories?.groupChats ?? '',
                                    `${chat}.jsonl`,
                                );
                                if (!fs.existsSync(filePath)) {
                                    continue;
                                }
                                const stats = await fs.promises.stat(filePath);
                                allChatFiles.push({
                                    groupId: groupData.id,
                                    filePath,
                                    mtime: stats.mtimeMs,
                                });
                            }
                        }
                    } catch {
                        // Skip group files that can't be read or parsed
                        continue;
                    }
                }
            };

            const getRootChatFiles = async () => {
                const dirents = await fs.promises.readdir(directories?.chats ?? '', {
                    withFileTypes: true,
                });
                const chatFiles = dirents
                    .filter((e) => e.isFile() && path.extname(e.name) === '.jsonl')
                    .map((e) => e.name);

                for (const file of chatFiles) {
                    const filePath = path.join(directories?.chats ?? '', file);
                    const stats = await fs.promises.stat(filePath);
                    allChatFiles.push({ filePath, mtime: stats.mtimeMs });
                }
            };

            await Promise.allSettled([
                getCharacterChatFiles(),
                getGroupChatFiles(),
                getRootChatFiles(),
            ]);

            const max = parseInt(String(body?.max ?? Number.MAX_SAFE_INTEGER)) + pinnedChats.length;
            const isPinned = (chatFile: { pngFile?: string; groupId?: string; filePath: string }) =>
                pinnedChats.some(
                    (p: Record<string, unknown>) =>
                        p.file_name === path.basename(chatFile.filePath) &&
                        (p.avatar === chatFile.pngFile || p.group === chatFile.groupId),
                );
            const recentChats = allChatFiles
                .toSorted((a, b) => {
                    const isAPinned = isPinned(a);
                    const isBPinned = isPinned(b);

                    if (isAPinned && !isBPinned) return -1;
                    if (!isAPinned && isBPinned) return 1;

                    return b.mtime - a.mtime;
                })
                .slice(0, max);
            const jsonFilesPromise = recentChats.map((file) => {
                const withMetadata = !!body?.metadata;
                return file.groupId
                    ? getChatInfo(file.filePath, { group: file.groupId }, withMetadata)
                    : getChatInfo(file.filePath, { avatar: file.pngFile }, withMetadata);
            });

            const chatData = (await Promise.allSettled(jsonFilesPromise))
                .filter((x) => x.status === 'fulfilled')
                .map((x) => x.value as { file_name?: string });
            const validFiles = chatData.filter((i) => i.file_name);

            return validFiles;
        } catch (error) {
            console.error(error);
            set.status = 500;
            return;
        }
    });

/**
 * Gets the chat as an object.
 * @param {string} chatFilePath The full chat file path.
 * @returns {Array}} If the chatFilePath cannot be read, this will return [].
 */
export function getChatData(chatFilePath: string): object[] {
    let chatData = [];

    const chatJSON = tryReadFileSync(chatFilePath) ?? '';
    if (chatJSON.length > 0) {
        const lines = chatJSON.split('\n');
        // Iterate through the array of strings and parse each line as JSON
        chatData = lines.map((line) => tryParse(line)).filter((x) => x);
    } else {
        console.warn(`File not found: ${chatFilePath}. The chat does not exist or is empty.`);
    }

    return chatData;
}
