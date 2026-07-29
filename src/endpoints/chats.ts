import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import process from 'node:process';

import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import writeFileAtomic from 'write-file-atomic';
import { throttle, isObjectLike } from 'es-toolkit/compat';

import { forbiddenRegExp } from '../middleware/validateFileName.js';
import {
    getConfigValue,
    humanizedDateTime,
    tryParse,
    generateTimestamp,
    removeOldBackups,
    formatBytes,
    readFirstLine,
    isPathUnderParent,
} from '../util.js';

const isBackupEnabled = !!getConfigValue('backups.chat.enabled', true, 'boolean');
const maxTotalChatBackups = Number(getConfigValue('backups.chat.maxTotalBackups', -1, 'number'));
const throttleInterval = Number(getConfigValue('backups.chat.throttleInterval', 10_000, 'number'));
const checkIntegrity = !!getConfigValue('backups.chat.checkIntegrity', true, 'boolean');

export const CHAT_BACKUPS_PREFIX = 'chat_';

type ChatMatchFunction = (textArray: string[]) => boolean;

interface UserDirectories {
    chats?: string;
    groupChats?: string;
    backups?: string;
    characters?: string;
    groups?: string;
    [key: string]: unknown;
}

interface UserContext {
    directories?: UserDirectories;
    profile?: { handle?: string };
    [key: string]: unknown;
}

/**
 * Checks the avatar_url field in the request body for forbidden characters.
 * Mimics the behaviour of the Express validateAvatarUrlMiddleware.
 */
function validateAvatarUrlField(body: unknown): boolean {
    if (body && typeof body === 'object' && 'avatar_url' in (body as Record<string, unknown>)) {
        const value = (body as Record<string, unknown>).avatar_url;
        if (value != null) {
            return !forbiddenRegExp.test(String(value));
        }
        return true;
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

        const sanitizedName = sanitize(name)
            .replace(/[^a-z0-9]/gi, '_')
            .toLowerCase();

        const backupFile = path.join(
            directory,
            `${backupPrefix}${sanitizedName}_${generateTimestamp()}.jsonl`,
        );

        writeFileAtomic(backupFile, data).catch((err) => {
            console.error(`Write atomic backup failed for ${name}`, err);
        });

        removeOldBackups(directory, `${backupPrefix}${sanitizedName}_`);
        if (isNaN(maxTotalChatBackups) || maxTotalChatBackups < 0) {
            return;
        }
        removeOldBackups(directory, backupPrefix, maxTotalChatBackups as any);
    } catch (err) {
        console.error(`Could not backup chat for ${name}`, err);
    }
}

/**
 * @type {Map<string, import('es-toolkit/compat').DebouncedFunc<typeof backupChat>>}
 */
const backupFunctions = new Map<string, any>();

/**
 * Gets a backup function for a user.
 * @param {string} handle User handle
 * @returns {typeof backupChat} Backup function
 */
function getBackupFunction(handle: string) {
    let fn = backupFunctions.get(handle);
    if (!fn) {
        fn = throttle(backupChat, throttleInterval, { leading: true, trailing: true });
        backupFunctions.set(handle, fn);
    }
    return fn;
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
        ? '...' + lastMessage.slice(lastMessage.length - strlen)
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
function importOobaChat(
    userName: string,
    characterName: string,
    jsonData: Record<string, any>,
): string {
    const dataVisible = jsonData.data_visible;
    if (!Array.isArray(dataVisible)) return '';

    const count = dataVisible.length;
    const lines: string[] = [
        JSON.stringify({ chat_metadata: {}, user_name: 'unused', character_name: 'unused' }),
    ];

    for (let i = 0; i < count; i++) {
        const arr = dataVisible[i];
        if (!Array.isArray(arr)) continue;
        if (arr[0]) {
            lines.push(
                JSON.stringify({
                    name: userName,
                    is_user: true,
                    send_date: new Date().toISOString(),
                    mes: arr[0],
                    extra: {},
                }),
            );
        }
        if (arr[1]) {
            lines.push(
                JSON.stringify({
                    name: characterName,
                    is_user: false,
                    send_date: new Date().toISOString(),
                    mes: arr[1],
                    extra: {},
                }),
            );
        }
    }

    return lines.join('\n');
}

/**
 * Imports a chat from Agnai's format.
 * @param {string} userName User name
 * @param {string} characterName Character name
 * @param {object} jsonData Chat data
 * @returns {string} Chat data
 */
function importAgnaiChat(
    userName: string,
    characterName: string,
    jsonData: Record<string, any>,
): string {
    const messages = jsonData.messages;
    if (!Array.isArray(messages)) return '';

    const count = messages.length;
    const lines: string[] = Array.from({ length: count + 1 });
    lines[0] = JSON.stringify({ chat_metadata: {}, user_name: 'unused', character_name: 'unused' });

    for (let i = 0; i < count; i++) {
        const message = messages[i];
        const isUser = Boolean(message.userId);
        lines[i + 1] = JSON.stringify({
            name: isUser ? userName : characterName,
            is_user: isUser,
            send_date: new Date().toISOString(),
            mes: message.msg,
            extra: {},
        });
    }

    return lines.join('\n');
}

/**
 * Imports a chat from CAI Tools format.
 * @param {string} userName User name
 * @param {string} characterName Character name
 * @param {object} jsonData JSON data
 * @returns {string[]} Converted data
 */
function importCAIChat(
    userName: string,
    characterName: string,
    jsonData: Record<string, any>,
): string[] {
    const histories = jsonData.histories?.histories;
    if (!Array.isArray(histories)) return [];

    const count = histories.length;
    const newChats: string[] = Array.from({ length: count });

    for (let i = 0; i < count; i++) {
        const history = histories[i];
        const msgs = history?.msgs;
        if (!Array.isArray(msgs)) {
            newChats[i] = JSON.stringify({
                chat_metadata: {},
                user_name: 'unused',
                character_name: 'unused',
            });
            continue;
        }

        const msgCount = msgs.length;
        const lines = Array.from<string>({ length: msgCount + 1 });
        lines[0] = JSON.stringify({
            chat_metadata: {},
            user_name: 'unused',
            character_name: 'unused',
        });

        for (let j = 0; j < msgCount; j++) {
            const msg = msgs[j];
            const isHuman = Boolean(msg.src?.is_human);
            lines[j + 1] = JSON.stringify({
                name: isHuman ? userName : characterName,
                is_user: isHuman,
                send_date: new Date().toISOString(),
                mes: msg.text,
                extra: {},
            });
        }
        newChats[i] = lines.join('\n');
    }

    return newChats;
}

/**
 * Imports a chat from Kobold Lite format.
 * @param {string} _userName User name
 * @param {string} _characterName Character name
 * @param {object} data JSON data
 * @returns {string} Chat data
 */
function importKoboldLiteChat(
    _userName: string,
    _characterName: string,
    data: Record<string, any>,
): string {
    const savedsettings = data.savedsettings || {};
    const userName = String(savedsettings.chatname || _userName);
    const opponentStr = String(savedsettings.chatopponent || _characterName);
    const pipeIdx = opponentStr.indexOf('||$||');
    const characterName = pipeIdx !== -1 ? opponentStr.slice(0, pipeIdx) : opponentStr;

    const inputToken = '{{[INPUT]}}';
    const outputToken = '{{[OUTPUT]}}';

    const actions = Array.isArray(data.actions) ? data.actions : [];
    const hasPrompt = Boolean(data.prompt);
    const totalMsgs = actions.length + (hasPrompt ? 1 : 0);

    const lines: string[] = Array.from({ length: totalMsgs + 1 });
    lines[0] = JSON.stringify({ chat_metadata: {}, user_name: 'unused', character_name: 'unused' });

    let lineIdx = 1;

    const processKoboldMessage = (msg: string) => {
        const isUser = msg.includes(inputToken);
        const cleanMes = msg.replaceAll(inputToken, '').replaceAll(outputToken, '').trim();
        return JSON.stringify({
            name: isUser ? userName : characterName,
            is_user: isUser,
            mes: cleanMes,
            send_date: new Date().toISOString(),
            extra: {},
        });
    };

    if (data.prompt) {
        lines[lineIdx++] = processKoboldMessage(data.prompt);
    }

    for (let i = 0; i < actions.length; i++) {
        lines[lineIdx++] = processKoboldMessage(actions[i]);
    }

    return lines.join('\n');
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
    if (!Array.isArray(lines)) return '';
    const count = lines.length;
    const resultLines = Array.from<string>({ length: count });

    for (let i = 0; i < count; i++) {
        const line = lines[i]!;
        const lineData = tryParse(line);
        if (!lineData) {
            resultLines[i] = line;
            continue;
        }

        if (lineData.mes && typeof lineData.mes === 'object' && lineData.mes.message) {
            lineData.mes = lineData.mes.message;
        }

        if (Array.isArray(lineData.swipes)) {
            const swipes = lineData.swipes;
            for (let j = 0; j < swipes.length; j++) {
                const swipe = swipes[j];
                swipes[j] =
                    typeof swipe === 'object' && swipe !== null && swipe.message
                        ? swipe.message
                        : String(swipe);
            }
        }

        resultLines[i] = JSON.stringify(lineData);
    }

    return resultLines.join('\n');
}

/**
 * Imports a chat from RisuAI format.
 * @param {string} userName User name
 * @param {string} characterName Character name
 * @param {object} jsonData Imported chat data
 * @returns {string} Chat data
 */
function importRisuChat(
    userName: string,
    characterName: string,
    jsonData: Record<string, any>,
): string {
    const messages = jsonData?.data?.message;
    if (!Array.isArray(messages)) return '';

    const count = messages.length;
    const lines = Array.from<string>({ length: count + 1 });
    lines[0] = JSON.stringify({ chat_metadata: {}, user_name: 'unused', character_name: 'unused' });

    for (let i = 0; i < count; i++) {
        const message = messages[i];
        const isUser = message.role === 'user';
        const msgTime = message.time ? Number(message.time) : Date.now();
        lines[i + 1] = JSON.stringify({
            name: message.name ?? (isUser ? userName : characterName),
            is_user: isUser,
            send_date: new Date(msgTime).toISOString(),
            mes: message.data ?? '',
            extra: {},
        });
    }

    return lines.join('\n');
}

/**
 * Checks if the chat being saved has the same integrity as the one being loaded.
 * @param {string} filePath Path to the chat file
 * @param {string} integritySlug Integrity slug
 * @returns {Promise<boolean>} Whether the chat is intact
 */
async function checkChatIntegrity(filePath: string, integritySlug: string): Promise<boolean> {
    try {
        await fsp.access(filePath);
    } catch {
        return true;
    }

    const firstLine = await readFirstLine(filePath);
    const jsonData = tryParse(firstLine as string) as Record<string, any> | null;
    const chatIntegrity = jsonData?.chat_metadata?.integrity;

    if (!chatIntegrity) {
        console.debug(
            `File "${filePath}" does not have integrity metadata matching "${integritySlug}". The integrity validation has been skipped.`,
        );
        return true;
    }

    return chatIntegrity === integritySlug;
}

/**
 * Reads the information from a chat file.
 * @param {string} pathToFile - Path to the chat file
 * @param {object} additionalData - Additional data to include in the result
 * @param {boolean} withMetadata - Whether to read chat metadata
 * @param {ChatMatchFunction|null} matcher - Optional function to match messages
 * @returns {Promise<Record<string, unknown>>} Chat information
 */
export async function getChatInfo(
    pathToFile: string,
    additionalData: Record<string, unknown> = {},
    withMetadata = false,
    matcher: ChatMatchFunction | null = null,
): Promise<Record<string, unknown>> {
    const lastSlash = Math.max(pathToFile.lastIndexOf('/'), pathToFile.lastIndexOf('\\'));
    const fileName = lastSlash !== -1 ? pathToFile.slice(lastSlash + 1) : pathToFile;
    const lastDot = fileName.lastIndexOf('.');
    const fileId = lastDot !== -1 ? fileName.slice(0, lastDot) : fileName;

    let stats: fs.Stats;
    try {
        stats = await fsp.stat(pathToFile);
    } catch {
        return {};
    }

    const hasMatcher = typeof matcher === 'function';

    const chatData: Record<string, unknown> = {
        match: false,
        file_id: fileId,
        file_name: fileName,
        file_size: formatBytes(stats.size),
        chat_items: 0,
        mes: '[The chat is empty]',
        last_mes: stats.mtimeMs,
        ...additionalData,
    };

    if (stats.size === 0) {
        return chatData;
    }

    return new Promise((res) => {
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
                const jsonData = tryParse(line) as Record<string, any> | null;
                if (jsonData && isObjectLike(jsonData.chat_metadata)) {
                    chatData.chat_metadata = jsonData.chat_metadata;
                }
            }
            if (hasMatcher && !hasAnyMatch && itemCounter > 0) {
                const jsonData = tryParse(line) as Record<string, any> | null;
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
                const jsonData = tryParse(lastLine) as Record<string, any> | null;
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
            } else {
                res(chatData);
            }
        });
    });
}

class IntegrityMismatchError extends Error {
    date: Date;
    constructor(...params: unknown[]) {
        super(...(params as [string?]));
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
    const count = chatData ? chatData.length : 0;
    const lines = Array.from<string>({ length: count });
    for (let i = 0; i < count; i++) {
        lines[i] = JSON.stringify(chatData[i]);
    }
    const jsonlData = lines.join('\n');

    const doIntegrityCheck = checkIntegrity && !skipIntegrityCheck;
    const chatIntegritySlug = doIntegrityCheck
        ? chatData?.[0]?.chat_metadata?.integrity
        : undefined;

    if (chatIntegritySlug && !(await checkChatIntegrity(filePath, chatIntegritySlug))) {
        throw new IntegrityMismatchError(
            `Chat integrity check failed for "${filePath}". The expected integrity slug was "${chatIntegritySlug}".`,
        );
    }

    await writeFileAtomic(filePath, jsonlData);
    getBackupFunction(handle)(backupDirectory, cardName, jsonlData);
}

export async function getChatDataAsync(chatFilePath: string): Promise<object[]> {
    try {
        const chatJSON = await fsp.readFile(chatFilePath, 'utf8');
        if (chatJSON.length === 0) return [];

        const lines = chatJSON.split('\n');
        const count = lines.length;
        const chatData: object[] = [];

        for (let i = 0; i < count; i++) {
            const parsed = tryParse(lines[i]!);
            if (parsed) {
                chatData.push(parsed as object);
            }
        }
        return chatData;
    } catch {
        console.warn(`File not found: ${chatFilePath}. The chat does not exist or is empty.`);
        return [];
    }
}

export const router = new Elysia({ prefix: '/api/chats' })

    .post('/save', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;
        const profile = user?.profile;

        try {
            if (!body || !validateAvatarUrlField(body)) {
                set.status = 400;
                return { error: 'Invalid request body' };
            }

            const handle = profile?.handle ?? '';
            const avatarUrl = String(body.avatar_url);
            const cardName = avatarUrl.endsWith('.png') ? avatarUrl.slice(0, -4) : avatarUrl;
            const chatData = body.chat;
            const chatFileName = `${String(body.file_name)}.jsonl`;
            const chatsDir = directories?.chats ?? '';
            const chatFilePath = path.join(chatsDir, cardName, sanitize(chatFileName));

            if (!isPathUnderParent(chatsDir, chatFilePath)) {
                set.status = 400;
                return { error: 'Invalid path' };
            }

            if (Array.isArray(chatData)) {
                await trySaveChat(
                    chatData as { chat_metadata?: { integrity?: string } }[],
                    chatFilePath,
                    Boolean(body.force),
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

    .post('/get', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;

        try {
            if (!body || !validateAvatarUrlField(body)) {
                set.status = 400;
                return { error: 'Invalid request body' };
            }

            const avatarUrl = String(body.avatar_url);
            const dirName = avatarUrl.endsWith('.png') ? avatarUrl.slice(0, -4) : avatarUrl;
            const chatsDir = directories?.chats ?? '';
            const directoryPath = path.join(chatsDir, dirName);

            if (!isPathUnderParent(chatsDir, directoryPath)) {
                set.status = 400;
                return { error: 'Invalid path' };
            }

            try {
                await fsp.access(directoryPath);
            } catch {
                await fsp.mkdir(directoryPath, { recursive: true });
                return {};
            }

            if (!body.file_name) {
                return {};
            }

            const chatFileName = `${String(body.file_name)}.jsonl`;
            const chatFilePath = path.join(directoryPath, sanitize(chatFileName));

            return await getChatDataAsync(chatFilePath);
        } catch (error) {
            console.error(error);
            return {};
        }
    })

    .post('/rename', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;

        try {
            if (!body || !validateAvatarUrlField(body)) {
                set.status = 400;
                return { error: 'Invalid request body' };
            }

            if (!body.original_file || !body.renamed_file) {
                set.status = 400;
                return { error: 'Missing original_file or renamed_file' };
            }

            const avatarUrl = String(body.avatar_url);
            const avatarDir = avatarUrl.endsWith('.png') ? avatarUrl.slice(0, -4) : avatarUrl;
            const chatsDir = directories?.chats ?? '';

            const pathToFolder = body.is_group
                ? (directories?.groupChats ?? '')
                : path.join(chatsDir, avatarDir);

            if (!body.is_group && !isPathUnderParent(chatsDir, pathToFolder)) {
                set.status = 400;
                return { error: 'Invalid path' };
            }

            const pathToOriginalFile = path.join(
                pathToFolder,
                sanitize(body.original_file as string),
            );
            const pathToRenamedFile = path.join(
                pathToFolder,
                sanitize(body.renamed_file as string),
            );

            const lastSlash = Math.max(
                pathToRenamedFile.lastIndexOf('/'),
                pathToRenamedFile.lastIndexOf('\\'),
            );
            const baseFile =
                lastSlash !== -1 ? pathToRenamedFile.slice(lastSlash + 1) : pathToRenamedFile;
            const lastDot = baseFile.lastIndexOf('.');
            const sanitizedFileName = lastDot !== -1 ? baseFile.slice(0, lastDot) : baseFile;

            try {
                await fsp.access(pathToOriginalFile);
            } catch {
                console.error('Source file not available');
                set.status = 400;
                return { error: true };
            }

            try {
                await fsp.access(pathToRenamedFile);
                console.error('Destination file already exists');
                set.status = 400;
                return { error: true };
            } catch {
                // target file does not exist, proceed
            }

            await fsp.copyFile(pathToOriginalFile, pathToRenamedFile);
            await fsp.unlink(pathToOriginalFile);

            console.info('Successfully renamed chat file.');
            return { ok: true, sanitizedFileName };
        } catch (error) {
            console.error('Error renaming chat file:', error);
            set.status = 500;
            return { error: true };
        }
    })

    .post('/delete', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;

        try {
            if (!body || !validateAvatarUrlField(body)) {
                set.status = 400;
                return { error: true };
            }

            let chatFileStr = String(body.chatfile ?? '');
            if (!chatFileStr.endsWith('.jsonl')) {
                chatFileStr += '.jsonl';
            }

            const avatarUrl = String(body.avatar_url);
            const dirName = avatarUrl.endsWith('.png') ? avatarUrl.slice(0, -4) : avatarUrl;
            const chatsDir = directories?.chats ?? '';

            const chatFilePath = path.join(chatsDir, dirName, sanitize(chatFileStr));

            if (!isPathUnderParent(chatsDir, chatFilePath)) {
                set.status = 400;
                return { error: true };
            }

            try {
                await fsp.unlink(chatFilePath);
                return { ok: true };
            } catch {
                console.error('The chat file was not deleted.');
                set.status = 400;
                return { error: true };
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
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;

        if (!body || !validateAvatarUrlField(body)) {
            set.status = 400;
            return { error: true };
        }

        if (!body.file || (!body.avatar_url && body.is_group === false)) {
            set.status = 400;
            return { error: true };
        }

        const avatarUrl = String(body.avatar_url ?? '');
        const avatarDir = avatarUrl.endsWith('.png') ? avatarUrl.slice(0, -4) : avatarUrl;
        const chatsDir = directories?.chats ?? '';

        const pathToFolder = body.is_group
            ? (directories?.groupChats ?? '')
            : path.join(chatsDir, avatarDir);

        const filename = path.join(pathToFolder, sanitize(body.file as string));
        if (!body.is_group && !isPathUnderParent(chatsDir, filename)) {
            set.status = 400;
            return { error: true };
        }

        const exportfilename = body.exportfilename as string;

        try {
            await fsp.access(filename);
        } catch {
            const errorMessage = {
                message: `Could not find JSONL file to export. Source chat file: ${filename}.`,
            };
            console.error(errorMessage.message);
            set.status = 404;
            return errorMessage;
        }

        try {
            if (body.format === 'jsonl') {
                try {
                    const rawFile = await fsp.readFile(filename, 'utf8');
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
                const data = tryParse(line) as Record<string, any> | null;
                if (!data || data.is_system) {
                    return;
                }
                if (data.mes) {
                    const name = data.name;
                    const message = String(data?.extra?.display_text || data?.mes || '').replace(
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
                    resolve();
                });
            });

            return {
                message: `Chat saved to ${exportfilename}`,
                result: buffer,
            };
        } catch (err) {
            console.error('chat export failed.', err);
            set.status = 400;
            return { error: true };
        }
    })

    .post('/group/import', async (context) => {
        const { set } = context;
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;
        const filedata = context.file as { destination?: string; filename?: string } | undefined;

        try {
            if (!filedata || !filedata.destination || !filedata.filename) {
                set.status = 400;
                return { error: true };
            }

            const chatname = humanizedDateTime();
            const pathToUpload = path.join(filedata.destination, filedata.filename);
            const pathToNewFile = path.join(directories?.groupChats ?? '', `${chatname}.jsonl`);

            await fsp.copyFile(pathToUpload, pathToNewFile);
            await fsp.unlink(pathToUpload);

            return { res: chatname };
        } catch (error) {
            console.error(error);
            return { error: true };
        }
    })

    .post('/import', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;
        const fileField = context.file as { destination?: string; filename?: string } | undefined;

        if (!body || !validateAvatarUrlField(body)) {
            set.status = 400;
            return { error: true };
        }

        const format = body.file_type as string;
        const rawAvatarUrl = String(body.avatar_url ?? '');
        const avatarUrl = rawAvatarUrl.endsWith('.png') ? rawAvatarUrl.slice(0, -4) : rawAvatarUrl;

        const characterName = sanitize((body.character_name as string) || 'Character');
        const userName = sanitize((body.user_name as string) || 'User');
        const fileNames: string[] = [];

        if (!fileField || !fileField.destination || !fileField.filename) {
            set.status = 400;
            return { error: true };
        }

        const chatsDir = directories?.chats ?? '';
        const directoryPath = path.join(chatsDir, avatarUrl);
        if (!isPathUnderParent(chatsDir, directoryPath)) {
            set.status = 400;
            return { error: true };
        }

        try {
            const pathToUpload = path.join(fileField.destination, fileField.filename);
            const data = await fsp.readFile(pathToUpload, 'utf8');

            if (format === 'json') {
                await fsp.unlink(pathToUpload);
                const jsonData = JSON.parse(data);

                let importFunc: (u: string, c: string, d: any) => string | string[];

                if (jsonData.savedsettings !== undefined) {
                    importFunc = importKoboldLiteChat;
                } else if (jsonData.histories !== undefined) {
                    importFunc = importCAIChat;
                } else if (Array.isArray(jsonData.data_visible)) {
                    importFunc = importOobaChat;
                } else if (Array.isArray(jsonData.messages)) {
                    importFunc = importAgnaiChat;
                } else if (jsonData.type === 'risuChat') {
                    importFunc = importRisuChat;
                } else {
                    console.error('Incorrect chat format .json');
                    return { error: true };
                }

                const handleChat = async (chat: string) => {
                    const fileName = `${characterName} - ${humanizedDateTime()} imported.jsonl`;
                    const filePath = path.join(directoryPath, fileName);
                    fileNames.push(fileName);
                    await writeFileAtomic(filePath, chat, 'utf8');
                };

                const chat = importFunc(userName, characterName, jsonData);

                if (Array.isArray(chat)) {
                    for (let i = 0; i < chat.length; i++) {
                        await handleChat(chat[i]!);
                    }
                } else {
                    await handleChat(chat);
                }

                return { res: true, fileNames };
            }

            if (format === 'jsonl') {
                const firstNewline = data.indexOf('\n');
                const header = firstNewline !== -1 ? data.slice(0, firstNewline) : data;

                const jsonData = tryParse(header) as Record<string, unknown> | null;

                if (
                    !jsonData ||
                    (jsonData.user_name === undefined &&
                        jsonData.name === undefined &&
                        jsonData.chat_metadata === undefined)
                ) {
                    console.error('Incorrect chat format .jsonl');
                    return { error: true };
                }

                const lines = data.split('\n');
                let flattenedChat = data;
                try {
                    flattenedChat = flattenChubChat(userName, characterName, lines);
                } catch (error) {
                    console.warn('Failed to flatten Chub Chat data: ', error);
                }

                const fileName = `${characterName} - ${humanizedDateTime()} imported.jsonl`;
                const filePath = path.join(directoryPath, fileName);
                fileNames.push(fileName);

                if (flattenedChat !== data) {
                    await writeFileAtomic(filePath, flattenedChat, 'utf8');
                } else {
                    await fsp.copyFile(pathToUpload, filePath);
                }
                await fsp.unlink(pathToUpload);
                return { res: true, fileNames };
            }
        } catch (error) {
            console.error(error);
            return { error: true };
        }
    })

    .post('/group/get', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;

        if (!body || !body.id) {
            set.status = 400;
            return { error: true };
        }

        const id = String(body.id);
        const chatFilePath = path.join(directories?.groupChats ?? '', sanitize(`${id}.jsonl`));

        return await getChatDataAsync(chatFilePath);
    })

    .post('/group/info', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;

        try {
            if (!body || !body.id) {
                set.status = 400;
                return { error: true };
            }

            const id = String(body.id);
            const chatFilePath = path.join(directories?.groupChats ?? '', sanitize(`${id}.jsonl`));

            return await getChatInfo(chatFilePath);
        } catch (error) {
            console.error(error);
            set.status = 500;
            return;
        }
    })

    .post('/group/delete', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;

        try {
            if (!body || !body.id) {
                set.status = 400;
                return { error: true };
            }

            const id = String(body.id);
            const chatFilePath = path.join(directories?.groupChats ?? '', sanitize(`${id}.jsonl`));

            try {
                await fsp.unlink(chatFilePath);
                return { ok: true };
            } catch {
                console.error('The group chat file was not deleted.');
                set.status = 400;
                return { error: true };
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
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;
        const profile = user?.profile;

        try {
            if (!body || !body.id) {
                set.status = 400;
                return { error: true };
            }

            const id = String(body.id);
            const handle = profile?.handle ?? '';
            const chatFilePath = path.join(directories?.groupChats ?? '', sanitize(`${id}.jsonl`));
            const chatData = body.chat;

            if (Array.isArray(chatData)) {
                await trySaveChat(
                    chatData as { chat_metadata?: { integrity?: string } }[],
                    chatFilePath,
                    Boolean(body.force),
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
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;

        try {
            if (!body || !validateAvatarUrlField(body)) {
                set.status = 400;
                return { error: true };
            }

            const { query, avatar_url, group_id } = body;
            const chatFiles: string[] = [];

            if (group_id) {
                const groupDir = directories?.groups ?? '';
                const groupFiles: string[] = [];
                try {
                    const files = await fsp.readdir(groupDir);
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i]!;
                        if (file.endsWith('.json')) {
                            groupFiles.push(file);
                        }
                    }
                } catch {
                    // Group directory does not exist
                }

                let targetGroup: Record<string, unknown> | undefined;
                for (let i = 0; i < groupFiles.length; i++) {
                    const groupFile = groupFiles[i]!;
                    try {
                        const contents = await fsp.readFile(path.join(groupDir, groupFile), 'utf8');
                        const groupData = JSON.parse(contents);
                        if (groupData.id === group_id) {
                            targetGroup = groupData;
                            break;
                        }
                    } catch (error) {
                        console.warn(groupFile, 'group file is corrupted:', error);
                    }
                }

                if (!Array.isArray(targetGroup?.chats)) {
                    return [];
                }

                const groupChatsDir = directories?.groupChats ?? '';
                const rawChats = targetGroup.chats as string[];
                for (let i = 0; i < rawChats.length; i++) {
                    const chatPath = path.join(groupChatsDir, `${rawChats[i]}.jsonl`);
                    try {
                        await fsp.access(chatPath);
                        chatFiles.push(chatPath);
                    } catch {
                        // File does not exist
                    }
                }
            } else {
                const avatarUrlStr = String(avatar_url ?? '');
                const characterName = avatarUrlStr.endsWith('.png')
                    ? avatarUrlStr.slice(0, -4)
                    : avatarUrlStr;
                const directoryPath = path.join(directories?.chats ?? '', characterName);

                try {
                    const files = await fsp.readdir(directoryPath);
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i]!;
                        if (file.endsWith('.jsonl')) {
                            chatFiles.push(path.join(directoryPath, file));
                        }
                    }
                } catch {
                    return [];
                }
            }

            const results: Record<string, unknown>[] = [];
            const fragments =
                typeof query === 'string'
                    ? query.trim().toLowerCase().split(/\s+/).filter(Boolean)
                    : [];

            const hasTextMatch = (textArray: string[]): boolean => {
                if (fragments.length === 0) {
                    return true;
                }
                for (let i = 0; i < fragments.length; i++) {
                    const frag = fragments[i]!;
                    let found = false;
                    for (let j = 0; j < textArray.length; j++) {
                        if (
                            String(textArray[j] ?? '')
                                .toLowerCase()
                                .includes(frag)
                        ) {
                            found = true;
                            break;
                        }
                    }
                    if (!found) return false;
                }
                return true;
            };

            for (const chatFile of chatFiles) {
                const matcher = query ? hasTextMatch : null;
                const chatInfo = await getChatInfo(chatFile, {}, false, matcher);
                const hasMatch =
                    Boolean(chatInfo.match) || hasTextMatch([(chatInfo.file_id as string) ?? '']);

                if (!chatInfo.file_name) {
                    continue;
                }

                if (query && chatInfo.chat_items === 0 && !hasMatch) {
                    continue;
                }

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
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;

        try {
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
                const charsDir = directories?.characters ?? '';
                let dirents: fs.Dirent[];
                try {
                    dirents = await fsp.readdir(charsDir, { withFileTypes: true });
                } catch {
                    return;
                }

                const pngFiles: string[] = [];
                for (const e of dirents) {
                    if (e.isFile() && e.name.endsWith('.png')) {
                        pngFiles.push(e.name);
                    }
                }

                const chatsBaseDir = directories?.chats ?? '';
                for (const pngFile of pngFiles) {
                    const chatsDirectory = pngFile.slice(0, -4);
                    const pathToChats = path.join(chatsBaseDir, chatsDirectory);

                    try {
                        const pathStats = await fsp.stat(pathToChats);
                        if (pathStats.isDirectory()) {
                            const chatFiles = await fsp.readdir(pathToChats);
                            for (const file of chatFiles) {
                                if (file.endsWith('.jsonl')) {
                                    const filePath = path.join(pathToChats, file);
                                    const stats = await fsp.stat(filePath);
                                    allChatFiles.push({ pngFile, filePath, mtime: stats.mtimeMs });
                                }
                            }
                        }
                    } catch {
                        // Chats directory does not exist
                    }
                }
            };

            const getGroupChatFiles = async () => {
                const groupsDir = directories?.groups ?? '';
                let groupDirents: fs.Dirent[];
                try {
                    groupDirents = await fsp.readdir(groupsDir, { withFileTypes: true });
                } catch {
                    return;
                }

                const groupChatsDir = directories?.groupChats ?? '';

                for (const e of groupDirents) {
                    if (e.isFile() && e.name.endsWith('.json')) {
                        try {
                            const groupPath = path.join(groupsDir, e.name);
                            const groupContents = await fsp.readFile(groupPath, 'utf8');
                            const groupData = JSON.parse(groupContents);

                            if (Array.isArray(groupData.chats)) {
                                for (const chatId of groupData.chats) {
                                    const filePath = path.join(groupChatsDir, `${chatId}.jsonl`);
                                    try {
                                        const stats = await fsp.stat(filePath);
                                        allChatFiles.push({
                                            groupId: groupData.id,
                                            filePath,
                                            mtime: stats.mtimeMs,
                                        });
                                    } catch {
                                        // Chat file missing
                                    }
                                }
                            }
                        } catch {
                            // Skip invalid group file
                        }
                    }
                }
            };

            const getRootChatFiles = async () => {
                const chatsDir = directories?.chats ?? '';
                let dirents: fs.Dirent[];
                try {
                    dirents = await fsp.readdir(chatsDir, { withFileTypes: true });
                } catch {
                    return;
                }

                for (const e of dirents) {
                    if (e.isFile() && e.name.endsWith('.jsonl')) {
                        const filePath = path.join(chatsDir, e.name);
                        try {
                            const stats = await fsp.stat(filePath);
                            allChatFiles.push({ filePath, mtime: stats.mtimeMs });
                        } catch {
                            // File unreadable
                        }
                    }
                }
            };

            await Promise.allSettled([
                getCharacterChatFiles(),
                getGroupChatFiles(),
                getRootChatFiles(),
            ]);

            const max =
                parseInt(String(body?.max ?? Number.MAX_SAFE_INTEGER), 10) + pinnedChats.length;

            const isPinned = (chatFile: {
                pngFile?: string;
                groupId?: string;
                filePath: string;
            }) => {
                const lastSlash = Math.max(
                    chatFile.filePath.lastIndexOf('/'),
                    chatFile.filePath.lastIndexOf('\\'),
                );
                const baseName =
                    lastSlash !== -1 ? chatFile.filePath.slice(lastSlash + 1) : chatFile.filePath;

                for (const p of pinnedChats) {
                    if (
                        p.file_name === baseName &&
                        (p.avatar === chatFile.pngFile || p.group === chatFile.groupId)
                    ) {
                        return true;
                    }
                }
                return false;
            };

            allChatFiles.sort((a, b) => {
                const isAPinned = isPinned(a);
                const isBPinned = isPinned(b);

                if (isAPinned && !isBPinned) return -1;
                if (!isAPinned && isBPinned) return 1;

                return b.mtime - a.mtime;
            });

            const sliced = allChatFiles.slice(0, max);
            const jsonFilesPromise = Array.from({ length: sliced.length });
            const withMetadata = Boolean(body?.metadata);

            for (let i = 0; i < sliced.length; i++) {
                const file = sliced[i]!;
                jsonFilesPromise[i] = file.groupId
                    ? getChatInfo(file.filePath, { group: file.groupId }, withMetadata)
                    : getChatInfo(file.filePath, { avatar: file.pngFile }, withMetadata);
            }
            const settled = await Promise.allSettled(jsonFilesPromise);
            const validFiles: unknown[] = [];

            for (const item of settled) {
                if (item.status === 'fulfilled') {
                    const val = item.value as Record<string, unknown> | undefined;
                    if (val?.file_name) {
                        validFiles.push(val);
                    }
                }
            }

            return validFiles;
        } catch (error) {
            console.error(error);
            set.status = 500;
            return;
        }
    });
