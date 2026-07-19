// statsHelper.js
import { moment } from '../lib.js';
import { getRequestHeaders, characters, this_chid } from '../script.js';
import { humanizeGenTime } from './RossAscends-mods.js';
import { callGenericPopup, POPUP_TYPE } from './popup.js';
import { registerDebugFunction } from './power-user.js';
import { t, translate } from './i18n.js';

let charStats = {};

/**
 * Creates an HTML stat block.
 * @param {string} statName - The name of the stat to be displayed.
 * @param {number|string} statValue - The value of the stat to be displayed.
 * @returns {string} - An HTML string representing the stat block.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'statName' implicitly has an 'any' type.
function createStatBlock(statName, statValue) {
    return `<div class="rm_stat_block">
                <div class="rm_stat_name">${statName}:</div>
                <div class="rm_stat_value">${statValue}</div>
            </div>`;
}

/**
 * Verifies and returns a numerical stat value. If the provided stat is not a number, returns 0.
 * @param {number|string} stat - The stat value to be checked and returned.
 * @returns {number} - The stat value if it is a number, otherwise 0.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'stat' implicitly has an 'any' type.
function verifyStatValue(stat) {
    return isNaN(Number(stat)) ? 0 : Number(stat);
}

/**
 * Calculates total stats from character statistics.
 * @returns {object} - Object containing total statistics.
 */
function calculateTotalStats() {
    const totalStats = {
        total_gen_time: 0,
        user_msg_count: 0,
        non_user_msg_count: 0,
        user_word_count: 0,
        non_user_word_count: 0,
        total_swipe_count: 0,
        date_last_chat: 0,
        date_first_chat: new Date('9999-12-31T23:59:59.999Z').getTime(),
    };

    for (const stats of Object.values(charStats)) {
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        totalStats.total_gen_time += verifyStatValue(stats.total_gen_time);
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        totalStats.user_msg_count += verifyStatValue(stats.user_msg_count);
        totalStats.non_user_msg_count += verifyStatValue(
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            stats.non_user_msg_count,
        );
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        totalStats.user_word_count += verifyStatValue(stats.user_word_count);
        totalStats.non_user_word_count += verifyStatValue(
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            stats.non_user_word_count,
        );
        totalStats.total_swipe_count += verifyStatValue(
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            stats.total_swipe_count,
        );

        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        if (verifyStatValue(stats.date_last_chat) != 0) {
            totalStats.date_last_chat = Math.max(
                totalStats.date_last_chat,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                stats.date_last_chat,
            );
        }
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        if (verifyStatValue(stats.date_first_chat) != 0) {
            totalStats.date_first_chat = Math.min(
                totalStats.date_first_chat,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                stats.date_first_chat,
            );
        }
    }

    return totalStats;
}

/**
 * Generates an HTML report of stats.
 *
 * This function creates an HTML report from the provided stats, including chat age,
 * chat time, number of user messages and character messages, word count, and swipe count.
 * The stat blocks are tailored depending on the stats type ("User" or "Character").
 * @param {string} statsType - The type of stats (e.g., "User", "Character").
 * @param {object} stats - The stats data. Expected keys in this object include:
 *      total_gen_time - total generation time
 *      date_first_chat - timestamp of the first chat
 *      date_last_chat - timestamp of the most recent chat
 *      user_msg_count - count of user messages
 *      non_user_msg_count - count of non-user messages
 *      user_word_count - count of words used by the user
 *      non_user_word_count - count of words used by the non-user
 *      total_swipe_count - total swipe count
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'statsType' implicitly has an 'any' type... Remove this comment to see the full error message
function createHtml(statsType, stats) {
    // Get time string
    const timeStirng = humanizeGenTime(stats.total_gen_time);
    let chatAge = 'Never';
    if (stats.date_first_chat < Date.now()) {
        chatAge = moment
            .duration(stats.date_last_chat - stats.date_first_chat)
            .humanize();
    }
    // @ts-expect-error TS(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
    const statsTypeTranslated = translate(statsType, `stats_header_${statsType}`);

    // Create popup HTML with stats
    let html = '<h3>' + t`${statsTypeTranslated} Stats` + '</h3>';
    if (statsType === 'User') {
        html += createStatBlock(t`Chatting Since`, `${chatAge} ago`);
    } else {
        html += createStatBlock(t`First Interaction`, `${chatAge} ago`);
    }
    html += createStatBlock(t`Chat Time`, timeStirng);
    html += createStatBlock(t`User Messages`, stats.user_msg_count);
    html += createStatBlock(
        t`Character Messages`,
        stats.non_user_msg_count - stats.total_swipe_count,
    );
    html += createStatBlock(t`User Words`, stats.user_word_count);
    html += createStatBlock(t`Character Words`, stats.non_user_word_count);
    html += createStatBlock(t`Swipes`, stats.total_swipe_count);

    return callGenericPopup(html, POPUP_TYPE.TEXT);
}

/**
 * Handles the user stats by getting them from the server, calculating the total and generating the HTML report.
 */
async function userStatsHandler() {
    // Get stats from server
    await getStats();

    // Calculate total stats
    const totalStats = calculateTotalStats();

    // Create HTML with stats
    createHtml('User', totalStats);
}

/**
 * Handles the character stats by getting them from the server and generating the HTML report.
 * @param {object} characters - Object containing character data.
 * @param {string} this_chid - The character id.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'characters' implicitly has an 'any' typ... Remove this comment to see the full error message
async function characterStatsHandler(characters, this_chid) {
    // Get stats from server
    await getStats();
    // Get character stats
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    let myStats = charStats[characters[this_chid].avatar];
    if (myStats === undefined) {
        myStats = {
            total_gen_time: 0,
            user_msg_count: 0,
            non_user_msg_count: 0,
            user_word_count: 0,
            non_user_word_count: countWords(characters[this_chid].first_mes),
            total_swipe_count: 0,
            date_last_chat: 0,
            date_first_chat: new Date('9999-12-31T23:59:59.999Z').getTime(),
        };
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        charStats[characters[this_chid].avatar] = myStats;
        updateStats();
    }
    // Create HTML with stats
    createHtml('Character', myStats);
}

/**
 * Fetches the character stats from the server.
 */
async function getStats() {
    const response = await fetch('/api/stats/get', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({}),
        cache: 'no-cache',
    });

    if (!response.ok) {
        notyf.error('Stats could not be loaded. Try reloading the page.');
        throw new Error('Error getting stats');
    }
    charStats = await response.json();
}

/**
 * Asynchronously recreates the stats file from chat files.
 *
 * Sends a POST request to the "/api/stats/recreate" endpoint. If the request fails,
 * it displays an error notification and throws an error.
 * @throws {Error} If the request to recreate stats is unsuccessful.
 */
async function recreateStats() {
    const response = await fetch('/api/stats/recreate', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({}),
        cache: 'no-cache',
    });

    if (!response.ok) {
        notyf.error('Stats could not be loaded. Try reloading the page.');
        throw new Error('Error getting stats');
    } else {
        notyf.success('Stats file recreated successfully!');
    }
}


/**
 * Calculates the generation time based on start and finish times.
 * @param {string} gen_started - The start time in ISO 8601 format.
 * @param {string} gen_finished - The finish time in ISO 8601 format.
 * @returns {number} - The difference in time in milliseconds.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'gen_started' implicitly has an 'any' ty... Remove this comment to see the full error message
function calculateGenTime(gen_started, gen_finished) {
    if (gen_started === undefined || gen_finished === undefined) {
        return 0;
    }
    const startDate = new Date(gen_started);
    const endDate = new Date(gen_finished);
    return endDate.getTime() - startDate.getTime();
}

/**
 * Sends a POST request to the server to update the statistics.
 */
async function updateStats() {
    const response = await fetch('/api/stats/update', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(charStats),
    });

    if (response.status !== 200) {
        console.error('Failed to update stats');
        console.log(response.status);
    }
}

/**
 * Returns the count of words in the given string.
 * A word is a sequence of alphanumeric characters (including underscore).
 * @param {string} str - The string to count words in.
 * @returns {number} - Number of words.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'str' implicitly has an 'any' type.
function countWords(str) {
    const match = str.match(/\b\w+\b/g);
    return match ? match.length : 0;
}

/**
 * Handles stat processing for messages.
 * @param {object} line - Object containing message data.
 * @param {string} type - The type of the message processing (e.g., 'append', 'continue', 'appendFinal', 'swipe').
 * @param {object} characters - Object containing character data.
 * @param {string} this_chid - The character id.
 * @param {string} oldMessage - The old message that's being processed.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'line' implicitly has an 'any' type.
async function statMesProcess(line, type, characters, this_chid, oldMessage) {
    if (this_chid === undefined || characters[this_chid] === undefined) {
        return;
    }
    await getStats();

    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    let stat = charStats[characters[this_chid].avatar];

    if (!stat) {
        stat = {
            total_gen_time: 0,
            user_word_count: 0,
            non_user_msg_count: 0,
            user_msg_count: 0,
            total_swipe_count: 0,
            date_first_chat: Date.now(),
            date_last_chat: Date.now(),
        };
    }

    stat.total_gen_time += calculateGenTime(
        line.gen_started,
        line.gen_finished,
    );
    if (line.is_user) {
        if (type != 'append' && type != 'continue' && type != 'appendFinal') {
            stat.user_msg_count++;
            stat.user_word_count += countWords(line.mes);
        } else {
            const oldLen = oldMessage.split(' ').length;
            stat.user_word_count += countWords(line.mes) - oldLen;
        }
    } else {
        // if continue, don't add a message, get the last message and subtract it from the word count of
        // the new message
        if (type != 'append' && type != 'continue' && type != 'appendFinal') {
            stat.non_user_msg_count++;
            stat.non_user_word_count += countWords(line.mes);
        } else {
            const oldLen = oldMessage.split(' ').length;
            stat.non_user_word_count += countWords(line.mes) - oldLen;
        }
    }

    if (type === 'swipe') {
        stat.total_swipe_count++;
    }
    stat.date_last_chat = Date.now();
    stat.date_first_chat = Math.min(
        stat.date_first_chat ?? new Date('9999-12-31T23:59:59.999Z').getTime(),
        Date.now(),
    );
    updateStats();
}

/**
 *
 */
export function initStats() {
    document.querySelector('.rm_stats_button')?.addEventListener('click', function (this: HTMLElement, e: Event) {
        characterStatsHandler(characters, this_chid);
    });
    // Wait for debug functions to load, then add the refresh stats function
    registerDebugFunction('refreshStats', 'Refresh Stat File', 'Recreates the stats file based on existing chat files', recreateStats);
}

export { userStatsHandler, characterStatsHandler, getStats, statMesProcess, charStats };
