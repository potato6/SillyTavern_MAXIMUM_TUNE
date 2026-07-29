import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import { Elysia } from 'elysia';
import writeFileAtomic from 'write-file-atomic';

import { getAllUserHandles, getUserDirectories } from '../users.js';

const STATS_FILE = 'stats.json';
const DEFAULT_FIRST_CHAT_TIME = new Date('9999-12-31T23:59:59.999Z').getTime();

interface UserDirectories {
    chats?: string;
    characters?: string;
    root?: string;
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
 * @type {Map<string, object>} The stats object for each user.
 */
const STATS = new Map<string, Record<string, unknown>>();
/**
 * @type {Map<string, number>} The timestamps for each user.
 */
const TIMESTAMPS = new Map<string, number>();

const MONTH_MAP: Record<string, string> = {
    January: '01',
    February: '02',
    March: '03',
    April: '04',
    May: '05',
    June: '06',
    July: '07',
    August: '08',
    September: '09',
    October: '10',
    November: '11',
    December: '12',
    Jan: '01',
    Feb: '02',
    Mar: '03',
    Apr: '04',
    Jun: '06',
    Jul: '07',
    Aug: '08',
    Sep: '09',
    Oct: '10',
    Nov: '11',
    Dec: '12',
};

const DIGITS_ONLY_REGEX = /^\d+$/;
const ISO_PATTERN_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const MERIDIEM_PATTERN = /(\w+)\s(\d{1,2}),\s(\d{4})\s(\d{1,2}):(\d{1,2})(am|pm)/i;
const HUMANIZED_PATTERN_1 = /(\d{4})-(\d{1,2})-(\d{1,2})@(\d{1,2})h(\d{1,2})m(\d{1,2})s(\d{1,3})ms/;
const HUMANIZED_PATTERN_2 = /(\d{4})-(\d{1,2})-(\d{1,2})@(\d{1,2})h(\d{1,2})m(\d{1,2})s/;
const HUMANIZED_PATTERN_3 =
    /(\d{4})-(\d{1,2})-(\d{1,2})\s+@(\d{1,2})h\s+(\d{1,2})m\s+(\d{1,2})s(?:\s+(\d{1,3})ms)?/;
const WORD_BOUND_REGEX = /\b\w+\b/g;

/**
 * Convert a timestamp to an integer timestamp.
 * @param {string|number|Date} timestamp - The timestamp to convert.
 * @returns {number} The timestamp in milliseconds since the Unix Epoch, or 0 if the input cannot be parsed.
 */
function parseTimestamp(timestamp: string | number | Date): number {
    if (!timestamp) {
        return 0;
    }

    if (typeof timestamp === 'number') {
        return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : 0;
    }

    if (timestamp instanceof Date) {
        return timestamp.getTime();
    }

    if (typeof timestamp !== 'string') {
        return 0;
    }

    if (DIGITS_ONLY_REGEX.test(timestamp)) {
        const unixTime = Number(timestamp);
        return Number.isFinite(unixTime) && unixTime >= 0 ? unixTime : 0;
    }

    if (ISO_PATTERN_REGEX.test(timestamp)) {
        const t = Date.parse(timestamp);
        return Number.isNaN(t) ? 0 : t;
    }

    const meridiemMatch = MERIDIEM_PATTERN.exec(timestamp);
    if (meridiemMatch) {
        const month = meridiemMatch[1]!;
        const day = meridiemMatch[2]!;
        const year = meridiemMatch[3]!;
        const hour = meridiemMatch[4]!;
        const minute = meridiemMatch[5]!;
        const meridiem = meridiemMatch[6]!;

        const monthNum = MONTH_MAP[month] ?? '01';
        const hInt = parseInt(hour, 10) % 12;
        const hour24 = meridiem.toLowerCase() === 'pm' ? hInt + 12 : hInt;
        const iso = `${year}-${monthNum}-${day.padStart(2, '0')}T${String(hour24).padStart(2, '0')}:${minute.padStart(2, '0')}:00`;
        const t = Date.parse(iso);
        return Number.isNaN(t) ? 0 : t;
    }

    const humanizedMatch =
        HUMANIZED_PATTERN_1.exec(timestamp) ||
        HUMANIZED_PATTERN_2.exec(timestamp) ||
        HUMANIZED_PATTERN_3.exec(timestamp);

    if (humanizedMatch) {
        const year = humanizedMatch[1]!;
        const month = humanizedMatch[2]!;
        const day = humanizedMatch[3]!;
        const hour = humanizedMatch[4]!;
        const min = humanizedMatch[5]!;
        const sec = humanizedMatch[6]!;
        const ms = humanizedMatch[7];
        const msStr = ms !== undefined ? `.${ms.padStart(3, '0')}` : '';
        const iso = `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${min.padStart(2, '0')}:${sec.padStart(2, '0')}${msStr}Z`;
        const t = Date.parse(iso);
        return Number.isNaN(t) ? 0 : t;
    }

    const fallback = Date.parse(timestamp);
    return Number.isNaN(fallback) ? 0 : fallback;
}

/**
 * Calculates the time difference between two dates.
 * @param {string} gen_started - The start time in ISO 8601 format.
 * @param {string} gen_finished - The finish time in ISO 8601 format.
 * @returns {number} - The difference in time in milliseconds.
 */
function calculateGenTime(gen_started: string, gen_finished: string): number {
    const start = Date.parse(gen_started);
    const end = Date.parse(gen_finished);
    if (Number.isNaN(start) || Number.isNaN(end)) return 0;
    return end - start;
}

/**
 * Counts the number of words in a string.
 * @param {string} str - The string to count words in.
 * @returns {number} - The number of words in the string.
 */
function countWordsInString(str: string): number {
    if (!str) return 0;
    WORD_BOUND_REGEX.lastIndex = 0;
    let count = 0;
    while (WORD_BOUND_REGEX.exec(str) !== null) {
        count++;
    }
    return count;
}

/**
 * Calculates the total generation time and word count for a chat asynchronously.
 */
async function calculateTotalGenTimeAndWordCountAsync(
    filepath: string,
    uniqueGenStartTimes: Set<string>,
) {
    let fileContents: string;
    try {
        fileContents = await fsp.readFile(filepath, 'utf8');
    } catch {
        return {
            totalGenTime: 0,
            userWordCount: 0,
            nonUserWordCount: 0,
            userMsgCount: 0,
            nonUserMsgCount: 0,
            totalSwipeCount: 0,
            firstChatTime: DEFAULT_FIRST_CHAT_TIME,
        };
    }

    const lines = fileContents.split('\n');
    let totalGenTime = 0;
    let userWordCount = 0;
    let nonUserWordCount = 0;
    let nonUserMsgCount = 0;
    let userMsgCount = 0;
    let totalSwipeCount = 0;
    let firstChatTime = DEFAULT_FIRST_CHAT_TIME;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (line.length === 0) continue;

        try {
            const json = JSON.parse(line);
            const mes = json.mes;

            if (mes && typeof mes === 'string') {
                const hash = crypto.createHash('sha256').update(mes).digest('hex');
                if (uniqueGenStartTimes.has(hash)) {
                    continue;
                }
                uniqueGenStartTimes.add(hash);
            }

            const genStarted = json.gen_started;
            const genFinished = json.gen_finished;
            if (genStarted && genFinished) {
                const genTime = calculateGenTime(genStarted, genFinished);
                totalGenTime += genTime;

                if (json.swipes && !json.swipe_info && Array.isArray(json.swipes)) {
                    totalGenTime += genTime * json.swipes.length;
                }
            }

            if (mes && typeof mes === 'string') {
                const wordCount = countWordsInString(mes);
                if (json.is_user) {
                    userWordCount += wordCount;
                    userMsgCount++;
                } else {
                    nonUserWordCount += wordCount;
                    nonUserMsgCount++;
                }
            }

            const swipes = json.swipes;
            if (Array.isArray(swipes) && swipes.length > 1) {
                totalSwipeCount += swipes.length - 1;
                for (let j = 1; j < swipes.length; j++) {
                    const swipeText = swipes[j];
                    if (typeof swipeText === 'string') {
                        const wordCount = countWordsInString(swipeText);
                        if (json.is_user) {
                            userWordCount += wordCount;
                            userMsgCount++;
                        } else {
                            nonUserWordCount += wordCount;
                            nonUserMsgCount++;
                        }
                    }
                }
            }

            const swipeInfo = json.swipe_info;
            if (Array.isArray(swipeInfo) && swipeInfo.length > 1) {
                for (let j = 1; j < swipeInfo.length; j++) {
                    const swipe = swipeInfo[j];
                    if (swipe && swipe.gen_started && swipe.gen_finished) {
                        totalGenTime += calculateGenTime(swipe.gen_started, swipe.gen_finished);
                    }
                }
            }

            if (json.is_user && json.send_date) {
                const parsedDate = parseTimestamp(json.send_date);
                if (parsedDate > 0 && parsedDate < firstChatTime) {
                    firstChatTime = parsedDate;
                }
            }
        } catch {
            // Invalid JSON line
        }
    }

    return {
        totalGenTime,
        userWordCount,
        nonUserWordCount,
        userMsgCount,
        nonUserMsgCount,
        totalSwipeCount,
        firstChatTime,
    };
}

/**
 * calculateStats - Calculate statistics for a given character chat directory asynchronously.
 */
async function calculateStatsAsync(chatsPath: string, item: string) {
    const folderName = item.endsWith('.png') ? item.slice(0, -4) : item;
    const chatDir = path.join(chatsPath, folderName);

    const stats = {
        total_gen_time: 0,
        user_word_count: 0,
        non_user_word_count: 0,
        user_msg_count: 0,
        non_user_msg_count: 0,
        total_swipe_count: 0,
        chat_size: 0,
        date_last_chat: 0,
        date_first_chat: DEFAULT_FIRST_CHAT_TIME,
    };

    const uniqueGenStartTimes = new Set<string>();

    let chats: string[];
    try {
        chats = await fsp.readdir(chatDir);
    } catch {
        return { [item]: stats };
    }

    for (let i = 0; i < chats.length; i++) {
        const chat = chats[i]!;
        const filePath = path.join(chatDir, chat);

        const result = await calculateTotalGenTimeAndWordCountAsync(filePath, uniqueGenStartTimes);

        stats.total_gen_time += result.totalGenTime;
        stats.user_word_count += result.userWordCount;
        stats.non_user_word_count += result.nonUserWordCount;
        stats.user_msg_count += result.userMsgCount;
        stats.non_user_msg_count += result.nonUserMsgCount;
        stats.total_swipe_count += result.totalSwipeCount;

        try {
            const chatStat = await fsp.stat(filePath);
            stats.chat_size += chatStat.size;
            const mtime = Math.floor(chatStat.mtimeMs);
            if (mtime > stats.date_last_chat) {
                stats.date_last_chat = mtime;
            }
        } catch {
            // File unstatable
        }

        if (result.firstChatTime < stats.date_first_chat) {
            stats.date_first_chat = result.firstChatTime;
        }
    }

    return { [item]: stats };
}

/**
 * Collects and aggregates stats for all characters.
 */
async function collectAndCreateStats(chatsPath: string, charactersPath: string) {
    let files: string[];
    try {
        files = await fsp.readdir(charactersPath);
    } catch {
        files = [];
    }

    const pngFiles: string[] = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        if (file.endsWith('.png')) {
            pngFiles.push(file);
        }
    }

    const count = pngFiles.length;
    const processingPromises: Promise<Record<string, unknown>>[] = Array.from({ length: count });
    for (let i = 0; i < count; i++) {
        processingPromises[i] = calculateStatsAsync(chatsPath, pngFiles[i]!);
    }

    const statsArr = await Promise.all(processingPromises);

    const finalStats: Record<string, unknown> = {};
    for (let i = 0; i < statsArr.length; i++) {
        const item = statsArr[i];
        if (item) {
            const keys = Object.keys(item);
            if (keys.length > 0) {
                const k = keys[0]!;
                finalStats[k] = item[k];
            }
        }
    }

    finalStats.timestamp = Date.now();
    return finalStats;
}

/**
 * Recreates the stats object for a user.
 */
export async function recreateStats(handle: string, chatsPath: string, charactersPath: string) {
    console.info('Collecting and creating stats for user:', handle);
    const stats = await collectAndCreateStats(chatsPath, charactersPath);
    STATS.set(handle, stats);
    await saveStatsToFile();
}

/**
 * Loads the stats file into memory. If the file doesn't exist or is invalid,
 * initializes stats by collecting and creating them for each character.
 */
export async function init() {
    try {
        const userHandles = await getAllUserHandles();
        for (let i = 0; i < userHandles.length; i++) {
            const handle = userHandles[i]!;
            const directories = getUserDirectories(handle);
            try {
                const statsFilePath = path.join(directories.root, STATS_FILE);
                const statsFileContent = await fsp.readFile(statsFilePath, 'utf-8');
                STATS.set(handle, JSON.parse(statsFileContent));
            } catch (err: any) {
                if (err?.code === 'ENOENT' || err instanceof SyntaxError) {
                    await recreateStats(handle, directories.chats, directories.characters);
                } else {
                    throw err;
                }
            }
        }
    } catch (err) {
        console.error('Failed to initialize stats:', err);
    }
    // Save stats every 5 minutes
    setInterval(saveStatsToFile, 5 * 60 * 1000);
}

/**
 * Saves the current state of charStats to a file, only if the data has changed since the last save.
 */
async function saveStatsToFile() {
    const userHandles = await getAllUserHandles();
    for (let i = 0; i < userHandles.length; i++) {
        const handle = userHandles[i]!;
        if (!STATS.has(handle)) {
            continue;
        }
        const charStats = STATS.get(handle)!;
        const lastSaveTimestamp = TIMESTAMPS.get(handle) || 0;
        const currentTimestamp = Number(charStats.timestamp || 0);

        if (currentTimestamp > lastSaveTimestamp) {
            try {
                const directories = getUserDirectories(handle);
                const statsFilePath = path.join(directories.root, STATS_FILE);
                await writeFileAtomic(statsFilePath, JSON.stringify(charStats));
                TIMESTAMPS.set(handle, Date.now());
            } catch (error) {
                console.error('Failed to save stats to file.', error);
            }
        }
    }
}

/**
 * Attempts to save charStats to a file and then terminates the process.
 */
export async function onExit() {
    try {
        await saveStatsToFile();
    } catch (err) {
        console.error('Failed to write stats to file:', err);
    }
}

/**
 * Sets the current charStats object.
 * @param {string} handle - The user handle.
 * @param {object} stats - The new charStats object.
 */
function setCharStats(handle: string, stats: Record<string, unknown>) {
    stats.timestamp = Date.now();
    STATS.set(handle, stats);
}

export const router = new Elysia({ prefix: '/api/stats' })

    /**
     * Handle a POST request to get the stats object
     */
    .post('/get', (context) => {
        const user = context.user as UserContext | undefined;
        const profile = user?.profile;
        const handle = profile?.handle;

        if (!handle) return {};
        return STATS.get(handle) || {};
    })

    /**
     * Triggers the recreation of statistics from chat files.
     */
    .post('/recreate', async (context) => {
        const user = context.user as UserContext | undefined;
        const profile = user?.profile;
        const directories = user?.directories;

        try {
            const handle = profile?.handle ?? '';
            const chatsPath = directories?.chats ?? '';
            const charactersPath = directories?.characters ?? '';

            await recreateStats(handle, chatsPath, charactersPath);
            return new Response(null, { status: 200 });
        } catch (error) {
            console.error(error);
            return new Response(null, { status: 500 });
        }
    })

    /**
     * Handle a POST request to update the stats object
     */
    .post('/update', (context) => {
        const user = context.user as UserContext | undefined;
        const profile = user?.profile;
        const body = context.body as Record<string, unknown> | null;

        if (!body) return new Response(null, { status: 400 });

        const handle = profile?.handle;
        if (handle) {
            setCharStats(handle, body);
        }
        return new Response(null, { status: 200 });
    });
