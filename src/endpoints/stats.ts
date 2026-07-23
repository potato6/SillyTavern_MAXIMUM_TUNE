import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { Elysia } from 'elysia';
import writeFileAtomic from 'write-file-atomic';

const readFile = fs.promises.readFile;
const readdir = fs.promises.readdir;

import { getAllUserHandles, getUserDirectories } from '../users.js';

const STATS_FILE = 'stats.json';

const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
];

/**
 * @type {Map<string, object>} The stats object for each user.
 */
const STATS = new Map();
/**
 * @type {Map<string, number>} The timestamps for each user.
 */
const TIMESTAMPS = new Map();

/**
 * Convert a timestamp to an integer timestamp.
 * This function can handle several different timestamp formats:
 * 1. Date.now timestamps (the number of milliseconds since the Unix Epoch)
 * 2. ST "humanized" timestamps, formatted like `YYYY-MM-DD@HHhMMmSSsMSms`
 * 3. Date strings in the format `Month DD, YYYY H:MMam/pm`
 * 4. ISO 8601 formatted strings
 * 5. Date objects
 *
 * The function returns the timestamp as the number of milliseconds since
 * the Unix Epoch, which can be converted to a JavaScript Date object with new Date().
 * @param {string|number|Date} timestamp - The timestamp to convert.
 * @returns {number} The timestamp in milliseconds since the Unix Epoch, or 0 if the input cannot be parsed.
 * @example
 * // Unix timestamp
 * parseTimestamp(1609459200);
 * // ST humanized timestamp
 * parseTimestamp("2021-01-01 \@00h 00m 00s 000ms");
 * // Date string
 * parseTimestamp("January 1, 2021 12:00am");
 */
function parseTimestamp(timestamp: string | number | Date) {
    if (!timestamp) {
        return 0;
    }

    // Date object
    if (timestamp instanceof Date) {
        return timestamp.getTime();
    }

    // Unix time
    if (typeof timestamp === 'number' || /^\d+$/.test(timestamp)) {
        const unixTime = Number(timestamp);
        const isValid = Number.isFinite(unixTime) && !Number.isNaN(unixTime) && unixTime >= 0;
        if (!isValid) return 0;
        return new Date(unixTime).getTime();
    }

    // ISO 8601 format
    const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
    if (isoPattern.test(timestamp)) {
        return new Date(timestamp).getTime();
    }

    const dateFormats = [];

    // meridiem-based format
    const convertFromMeridiemBased = (
        _: string,
        month: string,
        day: string,
        year: string,
        hour: string,
        minute: string,
        meridiem: string,
    ) => {
        const monthNum = monthNames.indexOf(month) + 1;
        const hour24 =
            meridiem.toLowerCase() === 'pm'
                ? (parseInt(hour, 10) % 12) + 12
                : parseInt(hour, 10) % 12;
        return `${year}-${monthNum}-${day.padStart(2, '0')}T${hour24.toString().padStart(2, '0')}:${minute.padStart(2, '0')}:00`;
    };
    // June 19, 2023 2:20pm
    dateFormats.push({
        callback: convertFromMeridiemBased,
        pattern: /(\w+)\s(\d{1,2}),\s(\d{4})\s(\d{1,2}):(\d{1,2})(am|pm)/i,
    });

    // ST "humanized" format patterns
    const convertFromHumanized = (
        _: string,
        year: string,
        month: string,
        day: string,
        hour: string,
        min: string,
        sec: string,
        ms: string | undefined,
    ) => {
        ms = typeof ms !== 'undefined' ? `.${ms.padStart(3, '0')}` : '';
        return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${min.padStart(2, '0')}:${sec.padStart(2, '0')}${ms}Z`;
    };
    // 2024-07-12@01h31m37s123ms
    dateFormats.push({
        callback: convertFromHumanized,
        pattern: /(\d{4})-(\d{1,2})-(\d{1,2})@(\d{1,2})h(\d{1,2})m(\d{1,2})s(\d{1,3})ms/,
    });
    // 2024-7-12@01h31m37s
    dateFormats.push({
        callback: convertFromHumanized,
        pattern: /(\d{4})-(\d{1,2})-(\d{1,2})@(\d{1,2})h(\d{1,2})m(\d{1,2})s/,
    });
    // 2024-6-5 @14h 56m 50s 682ms
    dateFormats.push({
        callback: convertFromHumanized,
        pattern: /(\d{4})-(\d{1,2})-(\d{1,2}) @(\d{1,2})h (\d{1,2})m (\d{1,2})s (\d{1,3})ms/,
    });

    for (const x of dateFormats) {
        const rgxMatch = timestamp.match(x.pattern);
        if (!rgxMatch) continue;
        // @ts-expect-error TS(2556) FIXME: A spread argument must either have a tuple type or... Remove this comment to see the full error message
        const isoTimestamp = x.callback(...rgxMatch);
        return new Date(isoTimestamp).getTime();
    }

    return 0;
}

/**
 * Collects and aggregates stats for all characters.
 * @param {string} chatsPath - The path to the directory containing the chat files.
 * @param {string} charactersPath - The path to the directory containing the character files.
 * @returns {Promise<object>} The aggregated stats object.
 */
async function collectAndCreateStats(chatsPath: string, charactersPath: string) {
    const files = await readdir(charactersPath);

    const pngFiles = files.filter((file) => file.endsWith('.png'));

    const processingPromises = pngFiles.map((file) => calculateStats(chatsPath, file));
    const statsArr = await Promise.all(processingPromises);

    let finalStats = {};
    for (const stat of statsArr) {
        finalStats = { ...finalStats, ...stat };
    }
    // tag with timestamp on when stats were generated
    // @ts-expect-error TS(2339) FIXME: Property 'timestamp' does not exist on type '{}'.
    finalStats.timestamp = Date.now();
    return finalStats;
}

/**
 * Recreates the stats object for a user.
 * @param {string} handle User handle
 * @param {string} chatsPath Path to the directory containing the chat files.
 * @param {string} charactersPath Path to the directory containing the character files.
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
        for (const handle of userHandles) {
            const directories = getUserDirectories(handle);
            try {
                const statsFilePath = path.join(directories.root, STATS_FILE);
                const statsFileContent = await readFile(statsFilePath, 'utf-8');
                STATS.set(handle, JSON.parse(statsFileContent));
            } catch (err) {
                // If the file doesn't exist or is invalid, initialize stats
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                if (err.code === 'ENOENT' || err instanceof SyntaxError) {
                    await recreateStats(handle, directories.chats, directories.characters);
                } else {
                    throw err; // Rethrow the error if it's something we didn't expect
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
    for (const handle of userHandles) {
        if (!STATS.has(handle)) {
            continue;
        }
        const charStats = STATS.get(handle);
        const lastSaveTimestamp = TIMESTAMPS.get(handle) || 0;
        if (charStats.timestamp > lastSaveTimestamp) {
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
 * If an error occurs during the file write, it logs the error before exiting.
 */
export async function onExit() {
    try {
        await saveStatsToFile();
    } catch (err) {
        console.error('Failed to write stats to file:', err);
    }
}

/**
 * Reads the contents of a file and returns the lines in the file as an array.
 * @param {string} filepath - The path of the file to be read.
 * @returns {Array<string>} - The lines in the file.
 * @throws {Error} Will throw an error if the file cannot be read.
 */
function readAndParseFile(filepath: string) {
    try {
        const file = fs.readFileSync(filepath, 'utf8');
        const lines = file.split('\n');
        return lines;
    } catch (error) {
        console.error(`Error reading file at ${filepath}: ${error}`);
        return [];
    }
}

/**
 * Calculates the time difference between two dates.
 * @param {string} gen_started - The start time in ISO 8601 format.
 * @param {string} gen_finished - The finish time in ISO 8601 format.
 * @returns {number} - The difference in time in milliseconds.
 */
function calculateGenTime(gen_started: string, gen_finished: string) {
    const startDate = new Date(gen_started);
    const endDate = new Date(gen_finished);
    return Number(endDate) - Number(startDate);
}

/**
 * Counts the number of words in a string.
 * @param {string} str - The string to count words in.
 * @returns {number} - The number of words in the string.
 */
function countWordsInString(str: string) {
    const match = str.match(/\b\w+\b/g);
    return match ? match.length : 0;
}

/**
 * calculateStats - Calculate statistics for a given character chat directory.
 * @param  {string} chatsPath The directory containing the chat files.
 * @param  {string} item     The name of the character.
 * @returns {object}          An object containing the calculated statistics.
 */
const calculateStats = (chatsPath: string, item: string) => {
    const chatDir = path.join(chatsPath, item.replace('.png', ''));
    const stats = {
        total_gen_time: 0,
        user_word_count: 0,
        non_user_word_count: 0,
        user_msg_count: 0,
        non_user_msg_count: 0,
        total_swipe_count: 0,
        chat_size: 0,
        date_last_chat: 0,
        date_first_chat: new Date('9999-12-31T23:59:59.999Z').getTime(),
    };
    const uniqueGenStartTimes = new Set();

    if (fs.existsSync(chatDir)) {
        const chats = fs.readdirSync(chatDir);
        if (Array.isArray(chats) && chats.length) {
            for (const chat of chats) {
                const result = calculateTotalGenTimeAndWordCount(
                    chatDir,
                    chat,
                    // @ts-expect-error TS(2345) FIXME: Argument of type 'Set<unknown>' is not assignable ... Remove this comment to see the full error message
                    uniqueGenStartTimes,
                );
                stats.total_gen_time += result.totalGenTime || 0;
                stats.user_word_count += result.userWordCount || 0;
                stats.non_user_word_count += result.nonUserWordCount || 0;
                stats.user_msg_count += result.userMsgCount || 0;
                stats.non_user_msg_count += result.nonUserMsgCount || 0;
                stats.total_swipe_count += result.totalSwipeCount || 0;

                const chatStat = fs.statSync(path.join(chatDir, chat));
                stats.chat_size += chatStat.size;
                stats.date_last_chat = Math.max(stats.date_last_chat, Math.floor(chatStat.mtimeMs));
                stats.date_first_chat = Math.min(stats.date_first_chat, result.firstChatTime);
            }
        }
    }

    return { [item]: stats };
};

/**
 * Sets the current charStats object.
 * @param {string} handle - The user handle.
 * @param {object} stats - The new charStats object.
 */
function setCharStats(handle: string, stats: Record<string, unknown>) {
    stats.timestamp = Date.now();
    STATS.set(handle, stats);
}

/**
 * Calculates the total generation time and word count for a chat with a character.
 * @param {string} chatDir - The directory path where character chat files are stored.
 * @param {string} chat - The name of the chat file.
 * @param {Set<string>} uniqueGenStartTimes - Set of unique message hashes.
 * @returns {object} - An object containing the total generation time, user word count, and non-user word count.
 * @throws {Error} Will throw an error if the file cannot be read or parsed.
 */
function calculateTotalGenTimeAndWordCount(
    chatDir: string,
    chat: string,
    uniqueGenStartTimes: Set<string>,
) {
    const filepath = path.join(chatDir, chat);
    const lines = readAndParseFile(filepath);

    let totalGenTime = 0;
    let userWordCount = 0;
    let nonUserWordCount = 0;
    let nonUserMsgCount = 0;
    let userMsgCount = 0;
    let totalSwipeCount = 0;
    let firstChatTime = new Date('9999-12-31T23:59:59.999Z').getTime();

    for (const line of lines) {
        if (line.length) {
            try {
                const json = JSON.parse(line);
                if (json.mes) {
                    const hash = crypto.createHash('sha256').update(json.mes).digest('hex');
                    if (uniqueGenStartTimes.has(hash)) {
                        continue;
                    }
                    if (hash) {
                        uniqueGenStartTimes.add(hash);
                    }
                }

                if (json.gen_started && json.gen_finished) {
                    const genTime = calculateGenTime(json.gen_started, json.gen_finished);
                    totalGenTime += genTime;

                    if (json.swipes && !json.swipe_info) {
                        // If there are swipes but no swipe_info, estimate the genTime
                        totalGenTime += genTime * json.swipes.length;
                    }
                }

                if (json.mes) {
                    const wordCount = countWordsInString(json.mes);
                    if (json.is_user) {
                        userWordCount += wordCount;
                    } else {
                        nonUserWordCount += wordCount;
                    }
                    if (json.is_user) {
                        userMsgCount++;
                    } else {
                        nonUserMsgCount++;
                    }
                }

                if (json.swipes && json.swipes.length > 1) {
                    totalSwipeCount += json.swipes.length - 1; // Subtract 1 to not count the first swipe
                    for (let i = 1; i < json.swipes.length; i++) {
                        // Start from the second swipe
                        const swipeText = json.swipes[i];

                        const wordCount = countWordsInString(swipeText);
                        if (json.is_user) {
                            userWordCount += wordCount;
                        } else {
                            nonUserWordCount += wordCount;
                        }
                        if (json.is_user) {
                            userMsgCount++;
                        } else {
                            nonUserMsgCount++;
                        }
                    }
                }

                if (json.swipe_info && json.swipe_info.length > 1) {
                    for (let i = 1; i < json.swipe_info.length; i++) {
                        // Start from the second swipe
                        const swipe = json.swipe_info[i];
                        if (swipe.gen_started && swipe.gen_finished) {
                            totalGenTime += calculateGenTime(swipe.gen_started, swipe.gen_finished);
                        }
                    }
                }

                // If this is the first user message, set the first chat time
                if (json.is_user) {
                    //get min between firstChatTime and timestampToMoment(json.send_date)
                    firstChatTime = Math.min(parseTimestamp(json.send_date), firstChatTime);
                }
            } catch (error) {
                console.error(`Error parsing line ${line}: ${error}`);
            }
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

export const router = new Elysia({ prefix: '/api/stats' })

    /**
     * Handle a POST request to get the stats object
     */
    .post('/get', (context) => {
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const profile = user?.profile as Record<string, unknown> | undefined;
        const stats = STATS.get(profile?.handle) || {};
        return stats;
    })

    /**
     * Triggers the recreation of statistics from chat files.
     */
    .post('/recreate', async (context) => {
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const profile = user?.profile as Record<string, unknown> | undefined;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            await recreateStats(
                profile?.handle as string,
                directories?.chats as string,
                directories?.characters as string,
            );
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
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const profile = user?.profile as Record<string, unknown> | undefined;
        const body = context.body as Record<string, unknown> | null;

        if (!body) return new Response(null, { status: 400 });

        setCharStats(profile?.handle as string, body);
        return new Response(null, { status: 200 });
    });
