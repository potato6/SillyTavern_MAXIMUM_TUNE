import { DOMPurify, Bowser } from '../lib.js';

import {
    characters,
    online_status,
    main_api,
    is_send_press,
    max_context,
    saveSettingsDebounced,
    active_group,
    active_character,
    setActiveGroup,
    setActiveCharacter,
    getEntitiesList,
    buildAvatarList,
    selectCharacterById,
    eventSource,
    menu_type,
    substituteParams,
    sendTextareaMessage,
    doNavbarIconClick,
    isSwipingAllowed,
} from '../script.js';

import {
    power_user,
    send_on_enter_options,
} from './power-user.js';

import { selected_group, is_group_generating, openGroupById } from './group-chats.js';
import { getTagKeyForEntity, applyTagsOnCharacterSelect } from './tags.js';
import {
    SECRET_KEYS,
    secret_state,
} from './secrets.js';
import { debounce, getStringHash, isValidUrl } from './utils.js';
import { chat_completion_sources, oai_settings } from './openai.js';
import { getTokenCountAsync } from './tokenizers.js';
import { textgen_types, textgenerationwebui_settings as textgen_settings, getTextGenServer } from './textgen-settings.js';
import { debounce_timeout, SWIPE_SOURCE } from './constants.js';

import { Popup } from './popup.js';
import { accountStorage } from './util/AccountStorage.js';
import { getCurrentUserHandle } from './user.js';
import { kai_settings } from './kai-settings.js';

const RPanelPin = document.getElementById('rm_button_panel_pin');
const LPanelPin = document.getElementById('lm_button_panel_pin');
const WIPanelPin = document.getElementById('WI_panel_pin');

const RightNavPanel = document.getElementById('right-nav-panel');
const RightNavDrawerIcon = document.getElementById('rightNavDrawerIcon');
const LeftNavPanel = document.getElementById('left-nav-panel');
const LeftNavDrawerIcon = document.getElementById('leftNavDrawerIcon');
const WorldInfo = document.getElementById('WorldInfo');
const WIDrawerIcon = document.getElementById('WIDrawerIcon');

const SelectedCharacterTab = document.getElementById('rm_button_selected_ch');

let connection_made = false;
let retry_delay = 500;
let counterNonce = Date.now();

const observerConfig = { childList: true, subtree: true };
const countTokensDebounced = debounce(RA_CountCharTokens, debounce_timeout.relaxed);
const countTokensShortDebounced = debounce(RA_CountCharTokens, debounce_timeout.short);
const checkStatusDebounced = debounce(RA_checkOnlineStatus, debounce_timeout.short);

const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
        if (!(mutation.target instanceof HTMLElement)) {
            return;
        }
        if (mutation.target.classList.contains('online_status_text')) {
            checkStatusDebounced();
        } else if (mutation.target.parentNode === SelectedCharacterTab) {
            countTokensShortDebounced();
        } else if (mutation.target.classList.contains('mes_text')) {
            for (const element of mutation.target.getElementsByTagName('math')) {
                element.childNodes.forEach(function (child) {
                    if (child.nodeType === Node.TEXT_NODE) {
                        child.textContent = '';
                    }
                });
            }
        }
    });
});

observer.observe(document.documentElement, observerConfig);


/**
 * Converts generation time from milliseconds to a human-readable format.
 *
 * The function takes total generation time as an input, then converts it to a format
 * of "_ Days, _ Hours, _ Minutes, _ Seconds". If the generation time does not exceed a
 * particular measure (like days or hours), that measure will not be included in the output.
 * @param {number} total_gen_time - The total generation time in milliseconds.
 * @returns {string} - A human-readable string that represents the time spent generating characters.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'total_gen_time' implicitly has an 'any'... Remove this comment to see the full error message
export function humanizeGenTime(total_gen_time) {
    //convert time_spent to humanized format of "_ Hours, _ Minutes, _ Seconds" from milliseconds
    let time_spent = total_gen_time || 0;
    time_spent = Math.floor(time_spent / 1000);
    const seconds = time_spent % 60;
    time_spent = Math.floor(time_spent / 60);
    const minutes = time_spent % 60;
    time_spent = Math.floor(time_spent / 60);
    const hours = time_spent % 24;
    time_spent = Math.floor(time_spent / 24);
    const days = time_spent;
    let result = '';
    if (days > 0) { result += `${days} Days, `; }
    if (hours > 0) { result += `${hours} Hours, `; }
    if (minutes > 0) { result += `${minutes} Minutes, `; }
    result += `${seconds} Seconds`;
    return result;
}

/**
 * DON'T OPTIMIZE, don't change this to a const or let, it needs to be a var.
 */
// @ts-expect-error TS(7034) FIXME: Variable 'parsedUA' implicitly has type 'any' in s... Remove this comment to see the full error message
let parsedUA = null;

/**
 * @returns {object|null} Parsed user agent object, or null if not yet parsed
 */
export function getParsedUA() {
    // @ts-expect-error TS(7005) FIXME: Variable 'parsedUA' implicitly has an 'any' type.
    if (!parsedUA) {
        try {
            parsedUA = Bowser.parse(navigator.userAgent);
        } catch {
            // In case the user agent is an empty string or Bowser can't parse it for some other reason
        }
    }

    // @ts-expect-error TS(7005) FIXME: Variable 'parsedUA' implicitly has an 'any' type.
    return parsedUA;
}

/**
 * Checks if the device is a mobile device.
 * @returns {boolean} - True if the device is a mobile device, false otherwise.
 */
export function isMobile() {
    const mobileTypes = ['mobile', 'tablet'];

    return mobileTypes.includes(getParsedUA()?.platform?.type);
}

/**
 * @returns {boolean} Whether enter should send the message
 */
export function shouldSendOnEnter() {
    if (!power_user) {
        return false;
    }

    switch (power_user.send_on_enter) {
        case send_on_enter_options.DISABLED:
            return false;
        case send_on_enter_options.AUTO:
            return !isMobile();
        case send_on_enter_options.ENABLED:
            return true;
    }
}

/**
 * Gets a humanized date time string from a given timestamp.
 * @param {number} timestamp Timestamp in milliseconds
 * @returns {string} Humanized date time string in the format `YYYY-MM-DD@HHhMMmSSsMSms`
 */
export function humanizedDateTime(timestamp = Date.now()) {
    const date = new Date(timestamp);
    const dt = {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes(),
        second: date.getSeconds(),
        millisecond: date.getMilliseconds(),
    };
    for (const key in dt) {
        const padLength = key === 'millisecond' ? 3 : 2;
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        dt[key] = dt[key].toString().padStart(padLength, '0');
    }
    return `${dt.year}-${dt.month}-${dt.day}@${dt.hour}h${dt.minute}m${dt.second}s${dt.millisecond}ms`;
}

/**
 * Gets a timestamp for messages in ISO 8601 format.
 * @param {number} timestamp - optional timestamp in milliseconds
 * @returns {string} ISO 8601 formatted timestamp
 */
export function getMessageTimeStamp(timestamp = Date.now()) {
    const date = new Date(timestamp);
    return date.toISOString();
}


// triggers:
// @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
$('#rm_button_create').on('click', function () {                 //when "+New Character" is clicked
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    const selectedCharH2 = SelectedCharacterTab.querySelector(':scope > h2');
    if (selectedCharH2) selectedCharH2.innerHTML = '';
});
//when any input is made to the create/edit character form textareas
// @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
$('#rm_ch_create_block').on('input', function () { countTokensDebounced(); });
//when any input is made to the advanced editing popup textareas
// @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
$('#character_popup').on('input', function () { countTokensDebounced(); });
//function:
/**
 *
 */
export async function RA_CountCharTokens() {
    counterNonce = Date.now();
    const counterNonceLocal = counterNonce;
    let total_tokens = 0;
    let permanent_tokens = 0;

    const tokenCounters = document.querySelectorAll('[data-token-counter]');
    for (const tokenCounter of tokenCounters) {
        if (counterNonceLocal !== counterNonce) {
            return;
        }

        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const counter = $(tokenCounter);
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const input = $(document.getElementById(counter.data('token-counter')));
        const isPermanent = counter.data('token-permanent') === true;
        const value = String(input.val());

        if (input.length === 0) {
            counter.text('Invalid input reference');
            continue;
        }

        if (!value) {
            input.data('last-value-hash', '');
            counter.text(0);
            continue;
        }

        const valueHash = getStringHash(value);

        if (input.data('last-value-hash') === valueHash) {
            total_tokens += Number(counter.text());
            permanent_tokens += isPermanent ? Number(counter.text()) : 0;
        } else {
            // We substitute macro for existing characters, but not for the character being created
            const valueToCount = menu_type === 'create' ? value : substituteParams(value);
            const tokens = await getTokenCountAsync(valueToCount);

            if (counterNonceLocal !== counterNonce) {
                return;
            }

            counter.text(tokens);
            total_tokens += tokens;
            permanent_tokens += isPermanent ? tokens : 0;
            input.data('last-value-hash', valueHash);
        }
    }

    // Warn if total tokens exceeds the limit of half the max context
    const tokenLimit = Math.max(((main_api !== 'openai' ? max_context : oai_settings.openai_max_context) / 2), 1024);
    const showWarning = (total_tokens > tokenLimit);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#result_info_total_tokens').text(total_tokens);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#result_info_permanent_tokens').text(permanent_tokens);
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    document.getElementById('result_info_text').classList.toggle('neutral_warning', showWarning);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#chartokenwarning').toggle(showWarning);
}
/**
 * Auto load chat with the last active character or group.
 * Fires when active_character is defined and auto_load_chat is true.
 * The function first tries to find a character with a specific ID from the global settings.
 * If it doesn't exist, it tries to find a group with a specific grid from the global settings.
 * If the character list hadn't been loaded yet, it calls itself again after 100ms delay.
 * The character or group is selected (clicked) if it is found.
 */
async function RA_autoloadchat() {
    // active character is the name, we should look it up in the character list and get the id
    if (active_character !== null && active_character !== undefined) {
        const active_character_id = characters.findIndex(x => getTagKeyForEntity(x) === active_character);
        if (active_character_id !== -1) {
            await selectCharacterById(active_character_id);

            // Do a little tomfoolery to spoof the tag selector
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const selectedCharElement = $(`#rm_print_characters_block .character_select[chid="${active_character_id}"]`);
            applyTagsOnCharacterSelect.call(selectedCharElement);
        } else {
            setActiveCharacter(null);
            saveSettingsDebounced();
            console.warn(`Currently active character with ID ${active_character} not found. Resetting to no active character.`);
        }
    }

    if (active_group !== null && active_group !== undefined) {
        if (active_character) {
            console.warn('Active character and active group are both set. Only active character will be loaded. Resetting active group.');
            setActiveGroup(null);
            saveSettingsDebounced();
        } else {
            const result = await openGroupById(String(active_group));
            if (!result) {
                setActiveGroup(null);
                saveSettingsDebounced();
                console.warn(`Currently active group with ID ${active_group} not found. Resetting to no active group.`);
            }
        }
    }
}

/**
 *
 */
export async function favsToHotswap() {
    const entities = getEntitiesList({ doFilter: false });
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const container = $('#right-nav-panel .hotswap');

    // Hard limit is required because even if all hotswaps don't fit the screen, their images would still be loaded
    // 25 is roughly calculated as the maximum number of favs that can fit an ultrawide monitor with the default theme
    const FAVS_LIMIT = 25;
    const favs = entities.filter(x => x.item.fav || x.item.fav == 'true').slice(0, FAVS_LIMIT);

    //helpful instruction message if no characters are favorited
    if (favs.length == 0) {
        container.html(`<small><span><i class="fa-solid fa-star"></i>&nbsp;${DOMPurify.sanitize(container.attr('no_favs'))}</span></small>`);
        return;
    }

    buildAvatarList(container, favs, { interactable: true, highlightFavs: false });
}

//changes input bar and send button display depending on connection status
/**
 *
 */
function RA_checkOnlineStatus() {
    if (online_status == 'no_connection') {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const send_textarea = $('#send_textarea');
        send_textarea.attr('placeholder', send_textarea.attr('no_connection_text')); //Input bar placeholder tells users they are not connected
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('send_form').classList.add('no-connection');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('send_but').classList.add('displayNone'); //send button is hidden when not connected;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('mes_continue').classList.add('displayNone'); //continue button is hidden when not connected;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('mes_impersonate').classList.add('displayNone'); //continue button is hidden when not connected;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('API-status-top').classList.remove('fa-plug');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('API-status-top').classList.add('fa-plug-circle-exclamation', 'redOverlayGlow');
        connection_made = false;
    } else {
        if (online_status !== undefined && online_status !== 'no_connection') {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const send_textarea = $('#send_textarea');
            send_textarea.attr('placeholder', send_textarea.attr('connected_text')); //on connect, placeholder tells user to type message
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            document.getElementById('send_form').classList.remove('no-connection');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            document.getElementById('API-status-top').classList.remove('fa-plug-circle-exclamation', 'redOverlayGlow');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            document.getElementById('API-status-top').classList.add('fa-plug');
            connection_made = true;
            retry_delay = 100;

            if (!is_send_press && !(selected_group && is_group_generating)) {
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                document.getElementById('send_but').classList.remove('displayNone'); //on connect, send button shows
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                document.getElementById('mes_continue').classList.remove('displayNone'); //continue button is shown when connected
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                document.getElementById('mes_impersonate').classList.remove('displayNone'); //continue button is shown when connected
            }
        }
    }
}
//Auto-connect to API (when set to kobold, API URL exists, and auto_connect is true)

/**
 * @param {string} PrevApi The previous API name
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'PrevApi' implicitly has an 'any' type.
function RA_autoconnect(PrevApi) {
    // secrets.js or script.js not loaded
    if (SECRET_KEYS === undefined || online_status === undefined) {
        setTimeout(RA_autoconnect, 100);
        return;
    }
    if (online_status === 'no_connection' && power_user.auto_connect) {
        switch (main_api) {
            case 'kobold':
                if (kai_settings.api_server && isValidUrl(kai_settings.api_server)) {
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $('#api_button').trigger('click');
                }
                break;
            case 'novel':
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                if (secret_state[SECRET_KEYS.NOVEL]) {
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $('#api_button_novel').trigger('click');
                }
                break;
            case 'textgenerationwebui':
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                if ((textgen_settings.type === textgen_types.MANCER && secret_state[SECRET_KEYS.MANCER])
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (textgen_settings.type === textgen_types.TOGETHERAI && secret_state[SECRET_KEYS.TOGETHERAI])
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (textgen_settings.type === textgen_types.INFERMATICAI && secret_state[SECRET_KEYS.INFERMATICAI])
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (textgen_settings.type === textgen_types.DREAMGEN && secret_state[SECRET_KEYS.DREAMGEN])
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (textgen_settings.type === textgen_types.OPENROUTER && secret_state[SECRET_KEYS.OPENROUTER])
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (textgen_settings.type === textgen_types.FEATHERLESS && secret_state[SECRET_KEYS.FEATHERLESS])
                ) {
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $('#api_button_textgenerationwebui').trigger('click');
                } else if (isValidUrl(getTextGenServer())) {
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $('#api_button_textgenerationwebui').trigger('click');
                }
                break;
            case 'openai':
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                if (((secret_state[SECRET_KEYS.OPENAI] || oai_settings.reverse_proxy) && oai_settings.chat_completion_source == chat_completion_sources.OPENAI)
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || ((secret_state[SECRET_KEYS.CLAUDE] || oai_settings.reverse_proxy) && oai_settings.chat_completion_source == chat_completion_sources.CLAUDE)
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.OPENROUTER] && oai_settings.chat_completion_source == chat_completion_sources.OPENROUTER)
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.AI21] && oai_settings.chat_completion_source == chat_completion_sources.AI21)
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.MAKERSUITE] && oai_settings.chat_completion_source == chat_completion_sources.MAKERSUITE)
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.VERTEXAI] && oai_settings.chat_completion_source == chat_completion_sources.VERTEXAI && oai_settings.vertexai_auth_mode === 'express')
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.VERTEXAI_SERVICE_ACCOUNT] && oai_settings.chat_completion_source == chat_completion_sources.VERTEXAI && oai_settings.vertexai_auth_mode === 'full')
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.MISTRALAI] && oai_settings.chat_completion_source == chat_completion_sources.MISTRALAI)
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.COHERE] && oai_settings.chat_completion_source == chat_completion_sources.COHERE)
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.PERPLEXITY] && oai_settings.chat_completion_source == chat_completion_sources.PERPLEXITY)
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.GROQ] && oai_settings.chat_completion_source == chat_completion_sources.GROQ)
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.CHUTES] && oai_settings.chat_completion_source == chat_completion_sources.CHUTES)
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.SILICONFLOW] && oai_settings.chat_completion_source == chat_completion_sources.SILICONFLOW)
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.ELECTRONHUB] && oai_settings.chat_completion_source == chat_completion_sources.ELECTRONHUB)
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.NANOGPT] && oai_settings.chat_completion_source == chat_completion_sources.NANOGPT)
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.DEEPSEEK] && oai_settings.chat_completion_source == chat_completion_sources.DEEPSEEK)
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.XAI] && oai_settings.chat_completion_source == chat_completion_sources.XAI)
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.AIMLAPI] && oai_settings.chat_completion_source == chat_completion_sources.AIMLAPI)
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.MOONSHOT] && oai_settings.chat_completion_source == chat_completion_sources.MOONSHOT)
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.FIREWORKS] && oai_settings.chat_completion_source == chat_completion_sources.FIREWORKS)
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.COMETAPI] && oai_settings.chat_completion_source == chat_completion_sources.COMETAPI)
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.ZAI] && oai_settings.chat_completion_source == chat_completion_sources.ZAI)
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.POLLINATIONS] && oai_settings.chat_completion_source === chat_completion_sources.POLLINATIONS)
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.WORKERS_AI] && oai_settings.chat_completion_source == chat_completion_sources.WORKERS_AI)
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.MINIMAX] && oai_settings.chat_completion_source == chat_completion_sources.MINIMAX)
                    || (isValidUrl(oai_settings.custom_url) && oai_settings.chat_completion_source == chat_completion_sources.CUSTOM)
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    || (secret_state[SECRET_KEYS.AZURE_OPENAI] && oai_settings.chat_completion_source == chat_completion_sources.AZURE_OPENAI)
                ) {
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $('#api_button_openai').trigger('click');
                }
                break;
        }

        if (!connection_made) {
            retry_delay = Math.min(retry_delay * 2, 30000); // double retry delay up to to 30 secs
            // console.log('connection attempts: ' + RA_AC_retries + ' delay: ' + (retry_delay / 1000) + 's');
            // setTimeout(RA_autoconnect, retry_delay);
        }
    }
}

/**
 *
 */
function OpenNavPanels() {
    if (!isMobile()) {
        //auto-open R nav if locked and previously open
        if (accountStorage.getItem('NavLockOn') == 'true' && accountStorage.getItem('NavOpened') == 'true') {
            //console.log("RA -- clicking right nav to open");
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#rightNavDrawerIcon').trigger('click');
        }

        //auto-open L nav if locked and previously open
        if (accountStorage.getItem('LNavLockOn') == 'true' && accountStorage.getItem('LNavOpened') == 'true') {
            console.debug('RA -- clicking left nav to open');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#leftNavDrawerIcon').trigger('click');
        }

        //auto-open WI if locked and previously open
        if (accountStorage.getItem('WINavLockOn') == 'true' && accountStorage.getItem('WINavOpened') == 'true') {
            console.debug('RA -- clicking WI to open');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#WIDrawerIcon').trigger('click');
        }
    }
}

const getUserInputKey = () => getCurrentUserHandle() + '_userInput';

/**
 *
 */
function restoreUserInput() {
    if (!power_user.restore_user_input) {
        console.debug('restoreUserInput disabled');
        return;
    }

    const userInput = localStorage.getItem(getUserInputKey());
    if (userInput) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#send_textarea').val(userInput)[0].dispatchEvent(new Event('input', { bubbles: true }));
    }
}

/**
 *
 */
function saveUserInput() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const userInput = String($('#send_textarea').val());
    localStorage.setItem(getUserInputKey(), userInput);
    console.debug('User Input -- ', userInput);
}
const saveUserInputDebounced = debounce(saveUserInput);

/**
 * Make the given element draggable. This is used for Moving UI.
 * @param {HTMLElement} elmnt - The element to make draggable.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'elmnt' implicitly has an 'any' type.
export function dragElement(elmnt) {
    // @ts-expect-error TS(7034) FIXME: Variable 'actionType' implicitly has type 'any' in... Remove this comment to see the full error message
    let actionType = null; // "drag" or "resize"
    let isMouseDown = false;

    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    // @ts-expect-error TS(7034) FIXME: Variable 'height' implicitly has type 'any' in som... Remove this comment to see the full error message
    let height, width, top, left, right, bottom,
        // @ts-expect-error TS(7034) FIXME: Variable 'maxX' implicitly has type 'any' in some ... Remove this comment to see the full error message
        maxX, maxY, winHeight, winWidth;

    const elmntName = elmnt.id;

    /**
     *
     */
    function savePositionAndSize() {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        if (!power_user.movingUIState[elmntName]) power_user.movingUIState[elmntName] = {};
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        power_user.movingUIState[elmntName].top = top;
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        power_user.movingUIState[elmntName].left = left;
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        power_user.movingUIState[elmntName].right = right;
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        power_user.movingUIState[elmntName].bottom = bottom;
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        power_user.movingUIState[elmntName].margin = 'unset';
        // @ts-expect-error TS(7005) FIXME: Variable 'actionType' implicitly has an 'any' type... Remove this comment to see the full error message
        if (actionType === 'resize') {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            power_user.movingUIState[elmntName].width = width;
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            power_user.movingUIState[elmntName].height = height;
            eventSource.emit('resizeUI', elmntName);
        }
        saveSettingsDebounced();
    }

    /**
     *
     */
    function clampToViewport() {
        // @ts-expect-error TS(7005) FIXME: Variable 'top' implicitly has an 'any' type.
        if (top <= 0) elmnt.style.setProperty('top', '0px', 'important');
        // @ts-expect-error TS(7005) FIXME: Variable 'maxY' implicitly has an 'any' type.
        else if (maxY >= winHeight) elmnt.style.setProperty('top', (winHeight - maxY + top - 1) + 'px', 'important');
        // @ts-expect-error TS(7005) FIXME: Variable 'left' implicitly has an 'any' type.
        if (left <= 0) elmnt.style.setProperty('left', '0px', 'important');
        // @ts-expect-error TS(7005) FIXME: Variable 'maxX' implicitly has an 'any' type.
        else if (maxX >= winWidth) elmnt.style.setProperty('left', (winWidth - maxX + left - 1) + 'px', 'important');
    }

    const observer = new MutationObserver((mutations) => {
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        const target = mutations[0].target;
        if (!(target instanceof HTMLElement)) {
            observer.disconnect();
            return;
        }
        if (
            target.offsetHeight < 50 ||
            target.offsetWidth < 50 ||
            target.classList.contains('resizing') ||
            power_user.movingUI === false ||
            isMobile() ||
            !isMouseDown
        ) {
            observer.disconnect();
            return;
        }

        const style = getComputedStyle(target);
        height = parseInt(style.height);
        width = parseInt(style.width);
        top = parseInt(style.top);
        left = parseInt(style.left);
        right = parseInt(style.right);
        bottom = parseInt(style.bottom);
        maxX = width + left;
        maxY = height + top;
        winWidth = window.innerWidth;
        winHeight = window.innerHeight;

        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        if (!power_user.movingUIState[elmntName]) power_user.movingUIState[elmntName] = {};

        // @ts-expect-error TS(7005) FIXME: Variable 'actionType' implicitly has an 'any' type... Remove this comment to see the full error message
        if (actionType === 'resize') {
            const containerAspectRatio = height / width;
            if (elmnt.id.startsWith('zoomFor_')) {
                const zoomedAvatarImage = elmnt.querySelector('.zoomed_avatar_img');
                if (zoomedAvatarImage instanceof HTMLElement) {
                    const imgHeight = zoomedAvatarImage.offsetHeight;
                    const imgWidth = zoomedAvatarImage.offsetWidth;
                    if (imgWidth > 0) {
                        const imageAspectRatio = imgHeight / imgWidth;
                        if (containerAspectRatio !== imageAspectRatio) {
                            elmnt.style.width = elmnt.offsetWidth + 'px';
                            elmnt.style.height = elmnt.offsetWidth * imageAspectRatio + 'px';
                        }
                        if (top + elmnt.offsetHeight >= winHeight) {
                            elmnt.style.setProperty('height', (winHeight - top - 1) + 'px', 'important');
                            elmnt.style.setProperty('width', ((winHeight - top - 1) / imageAspectRatio) + 'px', 'important');
                        }
                        if (left + elmnt.offsetWidth >= winWidth) {
                            elmnt.style.setProperty('width', (winWidth - left - 1) + 'px', 'important');
                            elmnt.style.setProperty('height', ((winWidth - left - 1) * imageAspectRatio) + 'px', 'important');
                        }
                    }
                }
            } else {
                if (top + elmnt.offsetHeight >= winHeight) elmnt.style.setProperty('height', (winHeight - top - 1) + 'px', 'important');
                if (left + elmnt.offsetWidth >= winWidth) elmnt.style.setProperty('width', (winWidth - left - 1) + 'px', 'important');
            }
            elmnt.style.setProperty('left', left + 'px', 'important');
            elmnt.style.setProperty('top', top + 'px', 'important');
        // @ts-expect-error TS(7005) FIXME: Variable 'actionType' implicitly has an 'any' type... Remove this comment to see the full error message
        } else if (actionType === 'drag') {
            clampToViewport();
        }

        savePositionAndSize();
    });

    /**
     * @param {MouseEvent} e Mouse event
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
    function dragMouseDown(e) {
        if (e) {
            actionType = 'drag';
            isMouseDown = true;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
        }
        document.addEventListener('mouseup', closeDragElement);
        document.addEventListener('mousemove', elementDrag);
    }

    /**
     * @param {MouseEvent} e Mouse event
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
    function elementDrag(e) {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        if (!power_user.movingUIState[elmntName]) power_user.movingUIState[elmntName] = {};
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        elmnt.setAttribute('data-dragged', 'true');
        const rect = elmnt.getBoundingClientRect();
        elmnt.style.setProperty('left', (rect.left - pos1) + 'px', 'important');
        elmnt.style.setProperty('top', (rect.top - pos2) + 'px', 'important');
        elmnt.style.setProperty('margin', 'unset', 'important');
        // @ts-expect-error TS(7005) FIXME: Variable 'height' implicitly has an 'any' type.
        elmnt.style.setProperty('height', height + 'px', 'important');
        // @ts-expect-error TS(7005) FIXME: Variable 'width' implicitly has an 'any' type.
        elmnt.style.setProperty('width', width + 'px', 'important');
    }

    /**
     *
     */
    function closeDragElement() {
        isMouseDown = false;
        actionType = null;
        document.removeEventListener('mouseup', closeDragElement);
        document.removeEventListener('mousemove', elementDrag);
        elmnt.setAttribute('data-dragged', 'false');
        observer.disconnect();
        savePositionAndSize();
    }

    /**
     *
     */
    function onMouseUp() {
        isMouseDown = false;
        actionType = null;
        observer.disconnect();
    }

    const elmntHeader = document.getElementById(elmntName + 'header');
    if (elmntHeader) {
        elmntHeader.addEventListener('mousedown', (e) => {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            if (e.target.classList.contains('drag-grabber')) {
                actionType = 'drag';
                isMouseDown = true;
                observer.observe(elmnt, { attributes: true, attributeFilter: ['style'] });
                dragMouseDown(e);
            }
        });
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
    elmnt.addEventListener('mousedown', (e) => {
        const rect = elmnt.getBoundingClientRect();
        const resizeMargin = 16;
        const isNearRight = e.clientX > rect.right - resizeMargin;
        const isNearBottom = e.clientY > rect.bottom - resizeMargin;
        if (isNearRight && isNearBottom) {
            actionType = 'resize';
            isMouseDown = true;
            observer.observe(elmnt, { attributes: true, attributeFilter: ['style'] });
        }
    });

    elmnt.addEventListener('mouseup', onMouseUp);
}

/**
 *
 */
export async function initMovingUI() {
    if (!isMobile() && power_user.movingUI === true) {
        console.debug('START MOVING UI');
        dragElement(document.getElementById('sheld'));
        dragElement(document.getElementById('left-nav-panel'));
        dragElement(document.getElementById('right-nav-panel'));
        dragElement(document.getElementById('WorldInfo'));
        dragElement(document.getElementById('floatingPrompt'));
        dragElement(document.getElementById('logprobsViewer'));
        dragElement(document.getElementById('cfgConfig'));
    }
}

/**@type {HTMLTextAreaElement} */
const sendTextArea = document.querySelector('#send_textarea');
const chatBlock = document.getElementById('chat');
const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;

/**
 * this makes the chat input text area resize vertically to match the text size (limited by CSS at 50% window height)
 */
function autoFitSendTextArea() {
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    const originalScrollBottom = chatBlock.scrollHeight - (chatBlock.scrollTop + chatBlock.offsetHeight);

    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    sendTextArea.style.height = '1px'; // Reset height to 1px to force recalculation of scrollHeight
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    const newHeight = sendTextArea.scrollHeight;
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    sendTextArea.style.height = `${newHeight}px`;

    if (!isFirefox) {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        chatBlock.scrollTop = chatBlock.scrollHeight - (chatBlock.offsetHeight + originalScrollBottom);
    }
}
export const autoFitSendTextAreaDebounced = debounce(autoFitSendTextArea, debounce_timeout.short);

// ---------------------------------------------------

/**
 *
 */
export function initRossMods() {
    // initial status check
    checkStatusDebounced();

    if (power_user.auto_load_chat) {
        RA_autoloadchat();
    }

    if (power_user.auto_connect) {
        // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
        RA_autoconnect();
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#main_api').on('change', function () {
        const PrevAPI = main_api;
        setTimeout(() => RA_autoconnect(PrevAPI), 100);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#api_button').on('click', () => checkStatusDebounced());

    //toggle pin class when lock toggle clicked
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(RPanelPin).on('click', function () {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        accountStorage.setItem('NavLockOn', RPanelPin.checked);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (RPanelPin.checked) {
            //console.log('adding pin class to right nav');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            RightNavPanel.classList.add('pinnedOpen');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            RightNavDrawerIcon.classList.add('drawerPinnedOpen');
        } else {
            //console.log('removing pin class from right nav');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            RightNavPanel.classList.remove('pinnedOpen');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            RightNavDrawerIcon.classList.remove('drawerPinnedOpen');

            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            if (RightNavPanel.classList.contains('openDrawer') && $('.openDrawer').length > 1) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                const toggle = $('#unimportantYes');
                doNavbarIconClick.call(toggle);
            }
        }
    });
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(LPanelPin).on('click', function () {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        accountStorage.setItem('LNavLockOn', LPanelPin.checked);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (LPanelPin.checked) {
            //console.log('adding pin class to Left nav');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            LeftNavPanel.classList.add('pinnedOpen');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            LeftNavDrawerIcon.classList.add('drawerPinnedOpen');
        } else {
            //console.log('removing pin class from Left nav');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            LeftNavPanel.classList.remove('pinnedOpen');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            LeftNavDrawerIcon.classList.remove('drawerPinnedOpen');

            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            if (LeftNavPanel.classList.contains('openDrawer') && $('.openDrawer').length > 1) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                const toggle = $('#ai-config-button>.drawer-toggle');
                doNavbarIconClick.call(toggle);
            }
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(WIPanelPin).on('click', async function () {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        accountStorage.setItem('WINavLockOn', WIPanelPin.checked);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (WIPanelPin.checked) {
            console.debug('adding pin class to WI');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            WorldInfo.classList.add('pinnedOpen');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            WIDrawerIcon.classList.add('drawerPinnedOpen');
        } else {
            console.debug('removing pin class from WI');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            WorldInfo.classList.remove('pinnedOpen');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            WIDrawerIcon.classList.remove('drawerPinnedOpen');

            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            if (WorldInfo.classList.contains('openDrawer') && $('.openDrawer').length > 1) {
                console.debug('closing WI after lock removal');
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                const toggle = $('#WI-SP-button>.drawer-toggle');
                doNavbarIconClick.call(toggle);
            }
        }
    });

    if (!isMobile()) { //only read/set pin states on non-mobile devices
        // read the state of right Nav Lock and apply to rightnav classlist
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        RPanelPin.checked = accountStorage.getItem('NavLockOn') == 'true';
        if (accountStorage.getItem('NavLockOn') == 'true') {
            //console.log('setting pin class via local var');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            RightNavPanel.classList.add('pinnedOpen');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            RightNavDrawerIcon.classList.add('drawerPinnedOpen');
        }
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (RPanelPin.checked) {
            console.debug('setting pin class via checkbox state');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            RightNavPanel.classList.add('pinnedOpen');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            RightNavDrawerIcon.classList.add('drawerPinnedOpen');
        }
        // read the state of left Nav Lock and apply to leftnav classlist
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        LPanelPin.checked = accountStorage.getItem('LNavLockOn') === 'true';
        if (accountStorage.getItem('LNavLockOn') == 'true') {
            //console.log('setting pin class via local var');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            LeftNavPanel.classList.add('pinnedOpen');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            LeftNavDrawerIcon.classList.add('drawerPinnedOpen');
        }
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (LPanelPin.checked) {
            console.debug('setting pin class via checkbox state');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            LeftNavPanel.classList.add('pinnedOpen');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            LeftNavDrawerIcon.classList.add('drawerPinnedOpen');
        }

        // read the state of left Nav Lock and apply to leftnav classlist
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        WIPanelPin.checked = accountStorage.getItem('WINavLockOn') === 'true';
        if (accountStorage.getItem('WINavLockOn') == 'true') {
            //console.log('setting pin class via local var');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            WorldInfo.classList.add('pinnedOpen');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            WIDrawerIcon.classList.add('drawerPinnedOpen');
        }

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (WIPanelPin.checked) {
            console.debug('setting pin class via checkbox state');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            WorldInfo.classList.add('pinnedOpen');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            WIDrawerIcon.classList.add('drawerPinnedOpen');
        }
    }


    //save state of Right nav being open or closed
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#rightNavDrawerIcon').on('click', function () {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (!document.getElementById('rightNavDrawerIcon').classList.contains('openIcon')) {
            accountStorage.setItem('NavOpened', 'true');
        } else { accountStorage.setItem('NavOpened', 'false'); }
    });

    //save state of Left nav being open or closed
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#leftNavDrawerIcon').on('click', function () {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (!document.getElementById('leftNavDrawerIcon').classList.contains('openIcon')) {
            accountStorage.setItem('LNavOpened', 'true');
        } else { accountStorage.setItem('LNavOpened', 'false'); }
    });

    //save state of Left nav being open or closed
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#WorldInfo').on('click', function () {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (!document.getElementById('WorldInfo').classList.contains('openIcon')) {
            accountStorage.setItem('WINavOpened', 'true');
        } else { accountStorage.setItem('WINavOpened', 'false'); }
    });

    let chatbarInFocus = false;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#send_textarea').on('focus', function () {
        chatbarInFocus = true;
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#send_textarea').on('blur', function () {
        chatbarInFocus = false;
    });

    setTimeout(() => {
        OpenNavPanels();
    }, 300);

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(SelectedCharacterTab).on('click', function () { accountStorage.setItem('SelectedNavTab', 'rm_button_selected_ch'); });
    document.getElementById('rm_button_characters').addEventListener('click', function () { accountStorage.setItem('SelectedNavTab', 'rm_button_characters'); });

    // when a char is selected from the list, save them as the auto-load character for next page load

    // when a char is selected from the list, save their name as the auto-load character for next page load
    document.addEventListener('click', function (event) {
        const el = event.target.closest('.character_select');
        if (!el) return;
        const characterId = el.getAttribute('data-chid');
        setActiveCharacter(characterId);
        setActiveGroup(null);
        saveSettingsDebounced();
    });

    document.addEventListener('click', function (event) {
        const el = event.target.closest('.group_select');
        if (!el) return;
        const groupId = el.getAttribute('data-chid') || el.getAttribute('data-grid');
        setActiveCharacter(null);
        setActiveGroup(groupId);
        saveSettingsDebounced();
    });

    const cssAutofit = CSS.supports('field-sizing', 'content');

    if (cssAutofit) {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        let lastHeight = chatBlock.offsetHeight;
        const chatBlockResizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.target !== chatBlock) {
                    continue;
                }

                const threshold = 1;
                const newHeight = chatBlock.offsetHeight;
                const deltaHeight = newHeight - lastHeight;
                const isScrollAtBottom = Math.abs(chatBlock.scrollHeight - chatBlock.scrollTop - newHeight) <= threshold;

                if (!isScrollAtBottom && Math.abs(deltaHeight) > threshold) {
                    chatBlock.scrollTop -= deltaHeight;
                }
                lastHeight = newHeight;
            }
        });

        // @ts-expect-error TS(2345) FIXME: Argument of type 'HTMLElement | null' is not assig... Remove this comment to see the full error message
        chatBlockResizeObserver.observe(chatBlock);
    }

    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    sendTextArea.addEventListener('input', () => {
        saveUserInputDebounced();

        if (cssAutofit) {
            // Unset modifications made with a manual resize
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            sendTextArea.style.height = 'auto';
            return;
        }

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const hasContent = sendTextArea.value !== '';
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const fitsCurrentSize = sendTextArea.scrollHeight <= sendTextArea.offsetHeight;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const isScrollbarShown = sendTextArea.clientWidth < sendTextArea.offsetWidth;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const isHalfScreenHeight = sendTextArea.offsetHeight >= window.innerHeight / 2;
        const needsDebounce = hasContent && (fitsCurrentSize || (isScrollbarShown && isHalfScreenHeight));
        if (needsDebounce) autoFitSendTextAreaDebounced();
        else autoFitSendTextArea();
    });

    restoreUserInput();

    // Swipe gestures (see: https://www.npmjs.com/package/swiped-events)
    document.addEventListener('swiped-left', function (e) {
        if (power_user.gestures === false) {
            return;
        }
        if (Popup.util.isPopupOpen()) {
            return;
        }
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (!e.target.closest('#sheld')) {
            return;
        }
        if (document.getElementById('curEditTextarea')) {
            return;
        }
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const SwipeButR = $('.swipe_right:last');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const SwipeTargetMesClassParent = e.target.closest('.last_mes');
        if (SwipeTargetMesClassParent !== null) {
            if (SwipeButR.is(':visible')) {
                SwipeButR.trigger('click');
            }
        }
    });
    document.addEventListener('swiped-right', function (e) {
        if (power_user.gestures === false) {
            return;
        }
        if (Popup.util.isPopupOpen()) {
            return;
        }
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (!e.target.closest('#sheld')) {
            return;
        }
        if (document.getElementById('curEditTextarea')) {
            return;
        }
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const SwipeButL = $('.swipe_left:last');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const SwipeTargetMesClassParent = e.target.closest('.last_mes');
        if (SwipeTargetMesClassParent !== null) {
            if (SwipeButL.is(':visible')) {
                SwipeButL.trigger('click');
            }
        }
    });


    /**
     * @returns {boolean} Whether an input element is currently focused
     */
    function isInputElementInFocus() {
        //return $(document.activeElement).is(":input");
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const focused = $(':focus');
        if (focused.is('input') || focused.is('textarea') || focused.prop('contenteditable') == 'true') {
            if (focused.attr('id') === 'send_textarea') {
                return false;
            }
            return true;
        }
        return false;
    }

    /**
     * @param {KeyboardEvent} event Keyboard event to check
     * @returns {boolean} Whether the event has modifier keys pressed
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    function isModifiedKeyboardEvent(event) {
        return (event instanceof KeyboardEvent &&
            (event.shiftKey ||
            event.ctrlKey ||
            event.altKey ||
            event.metaKey));
    }

    document.addEventListener('keydown', async function (event) {
        await processHotkeys(event);
    });

    const hotkeyTargets = {
        'send_textarea': sendTextArea,
        'dialogue_popup_input': document.querySelector('#dialogue_popup_input'),
    };

    //Additional hotkeys CTRL+ENTER and CTRL+UPARROW
    /**
     * @param {KeyboardEvent} event Keyboard event to process
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    async function processHotkeys(event) {
        // Default hotkeys and shortcuts shouldn't work if any popup is currently open
        if (Popup.util.isPopupOpen()) {
            return;
        }

        //Enter to send when send_textarea in focus
        if (document.activeElement == hotkeyTargets.send_textarea) {
            const sendOnEnter = shouldSendOnEnter();
            if (!event.isComposing && !event.shiftKey && !event.ctrlKey && !event.altKey && event.key == 'Enter' && sendOnEnter) {
                event.preventDefault();
                sendTextareaMessage();
                return;
            }
        }
        if (document.activeElement == hotkeyTargets.dialogue_popup_input && !isMobile()) {
            if (!event.shiftKey && !event.ctrlKey && event.key == 'Enter') {
                event.preventDefault();
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#dialogue_popup_ok').trigger('click');
                return;
            }
        }
        //ctrl+shift+up to scroll to context line
        if (event.shiftKey && event.ctrlKey && event.key == 'ArrowUp') {
            event.preventDefault();
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const contextLine = $('.lastInContext');
            if (contextLine.length !== 0) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#chat').animate({
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    scrollTop: contextLine.offset().top - $('#chat').offset().top + $('#chat').scrollTop(),
                }, 300);
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            } else { toastr.warning('Context line not found, send a message first!'); }
            return;
        }
        //ctrl+shift+down to scroll to bottom of chat
        if (event.shiftKey && event.ctrlKey && event.key == 'ArrowDown') {
            event.preventDefault();
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#chat').animate({
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                scrollTop: $('#chat').prop('scrollHeight'),
            }, 300);
            return;
        }

        // Alt+Enter or AltGr+Enter to Continue
        if ((event.altKey || (event.altKey && event.ctrlKey)) && event.key == 'Enter') {
            if (is_send_press == false) {
                console.debug('Continuing with Alt+Enter');
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#option_continue').trigger('click');
                return;
            }
        }

        // Ctrl+Enter for Regeneration Last Response. If editing, accept the edits instead
        if (event.ctrlKey && event.key == 'Enter') {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const editMesDone = $('.mes_edit_done:visible');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const reasoningMesDone = $('.mes_reasoning_edit_done:visible');
            if (editMesDone.length > 0) {
                console.debug('Accepting edits with Ctrl+Enter');
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#send_textarea').trigger('focus');
                editMesDone.trigger('click');
                return;
            } else if (reasoningMesDone.length > 0) {
                console.debug('Accepting edits with Ctrl+Enter');
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#send_textarea').trigger('focus');
                reasoningMesDone.trigger('click');
                return;
            } else if (is_send_press == false) {
                const skipConfirmKey = 'RegenerateWithCtrlEnter';
                const skipConfirm = accountStorage.getItem(skipConfirmKey) === 'true';
                /**
                 *
                 */
                function doRegenerate() {
                    console.debug('Regenerating with Ctrl+Enter');
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $('#option_regenerate').trigger('click');
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $('#options').hide();
                }

                // If there is input text, we do not trigger a regenerate - we just send it
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                if ($('#send_textarea').val() !== '') {
                    if (shouldSendOnEnter()) {
                        console.debug('Sending with Ctrl+Enter');
                        event.preventDefault();
                        sendTextareaMessage();
                    } else {
                        console.debug('Text area is not empty, but send on enter is disabled');
                    }
                    return;
                }

                if (skipConfirm) {
                    doRegenerate();
                } else {
                    let regenerateWithCtrlEnter = false;
                    const result = await Popup.show.confirm('Regenerate Message', 'Are you sure you want to regenerate the latest message?', {
                        customInputs: [{ id: 'regenerateWithCtrlEnter', label: 'Don\'t ask again' }],
                        // @ts-expect-error TS(7006) FIXME: Parameter 'popup' implicitly has an 'any' type.
                        onClose: (popup) => {
                            regenerateWithCtrlEnter = Boolean(popup.inputResults.get('regenerateWithCtrlEnter') ?? false);
                        },
                    });
                    if (!result) {
                        return;
                    }

                    accountStorage.setItem(skipConfirmKey, String(regenerateWithCtrlEnter));
                    doRegenerate();
                }
                return;
            } else {
                console.debug('Ctrl+Enter ignored');
            }
        }

        // Helper function to check if nanogallery2's lightbox is active
        /**
         * @returns {boolean} Whether nanogallery2 lightbox is active
         */
        function isNanogallery2LightboxActive() {
            // Check if the body has the 'nGY2On' class, adjust this based on actual behavior
            return document.body.classList.contains('nGY2_body_scrollbar');
        }

        if (event.key == 'ArrowLeft') {        //swipes left
            if (
                isSwipingAllowed() &&
                !isNanogallery2LightboxActive() &&  // Check if lightbox is NOT active
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#send_textarea').val() === '' &&
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#character_popup').css('display') === 'none' &&
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#shadow_select_chat_popup').css('display') === 'none' &&
                !isInputElementInFocus() &&
                !isModifiedKeyboardEvent(event) &&
                !(document.activeElement instanceof HTMLVideoElement)
            ) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('.swipe_left:last').trigger('click', { source: SWIPE_SOURCE.KEYBOARD, repeated: event.repeat });
                return;
            }
        }
        if (event.key == 'ArrowRight') { //swipes right
            if (
                isSwipingAllowed() &&
                !isNanogallery2LightboxActive() &&  // Check if lightbox is NOT active
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#send_textarea').val() === '' &&
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#character_popup').css('display') === 'none' &&
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#shadow_select_chat_popup').css('display') === 'none' &&
                !isInputElementInFocus() &&
                !isModifiedKeyboardEvent(event) &&
                !(document.activeElement instanceof HTMLVideoElement)
            ) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('.swipe_right:last').trigger('click', { source: SWIPE_SOURCE.KEYBOARD, repeated: event.repeat });
                return;
            }
        }


        if (event.ctrlKey && event.key == 'ArrowUp') { //edits last USER message if chatbar is empty and focused
            if (
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                hotkeyTargets.send_textarea.value === '' &&
                chatbarInFocus === true &&
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                ($('.swipe_right:last').css('display') === 'flex' || $('.last_mes').attr('is_system') === 'true') &&
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#character_popup').css('display') === 'none' &&
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#shadow_select_chat_popup').css('display') === 'none'
            ) {
                const isUserMesList = document.querySelectorAll('div[is_user="true"]');
                const lastIsUserMes = isUserMesList[isUserMesList.length - 1];
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                const editMes = lastIsUserMes.querySelector('.mes_block .mes_edit');
                if (editMes !== null) {
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $(editMes).trigger('click');
                    return;
                }
            }
        }

        if (event.key == 'ArrowUp') { //edits last message if chatbar is empty and focused
            console.log('got uparrow input');
            if (
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                hotkeyTargets.send_textarea.value === '' &&
                chatbarInFocus === true &&
                //$('.swipe_right:last').css('display') === 'flex' &&
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('.last_mes .mes_buttons').is(':visible') &&
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#character_popup').css('display') === 'none' &&
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#shadow_select_chat_popup').css('display') === 'none'
            ) {
                const lastMes = document.querySelector('.last_mes');
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                const editMes = lastMes.querySelector('.mes_block .mes_edit');
                if (editMes !== null) {
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $(editMes).trigger('click');
                    return;
                }
            }
        }

        if (event.key == 'Escape') { //closes various panels
            //dont override Escape hotkey functions from script.js
            //"close edit box" and "cancel stream generation".
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            if ($('#curEditTextarea').is(':visible') || $('#mes_stop').is(':visible')) {
                console.debug('escape key, but deferring to script.js routines');
                return;
            }

            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            if ($('#dialogue_popup').is(':visible')) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                if ($('#dialogue_popup_cancel').is(':visible')) {
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $('#dialogue_popup_cancel').trigger('click');
                    return;
                } else {
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $('#dialogue_popup_ok').trigger('click');
                    return;
                }
            }

            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            if ($('#select_chat_popup').is(':visible')) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#select_chat_cross').trigger('click');
                return;
            }

            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            if ($('#character_popup').is(':visible')) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#character_cross').trigger('click');
                return;
            }

            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            if ($('#dialogue_del_mes_cancel').is(':visible')) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#dialogue_del_mes_cancel').trigger('click');
                return;
            }

            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            if ($('.drawer-content')
                .not('#WorldInfo')
                .not('#left-nav-panel')
                .not('#right-nav-panel')
                .not('#floatingPrompt')
                .not('#cfgConfig')
                .not('#logprobsViewer')
                .not('#movingDivs > div')
                .is(':visible')) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                const visibleDrawerContent = $('.drawer-content:visible')
                    .not('#WorldInfo')
                    .not('#left-nav-panel')
                    .not('#right-nav-panel')
                    .not('#floatingPrompt')
                    .not('#cfgConfig')
                    .not('#logprobsViewer')
                    .not('#movingDivs > div');
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $(visibleDrawerContent[0].parentElement.querySelector('.drawer-icon')).trigger('click');
                return;
            }

            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            if ($('#logprobsViewer').is(':visible')) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#logprobsViewerClose').trigger('click');
                return;
            }

            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            if ($('#cfgConfig').is(':visible')) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#CFGClose').trigger('click');
                return;
            }

            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            if ($('#floatingPrompt').is(':visible')) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#ANClose').trigger('click');
                return;
            }

            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            if ($('#WorldInfo').is(':visible')) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#WIDrawerIcon').trigger('click');
                return;
            }

            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const movingDivs = $('#movingDivs > div').toArray().reverse();
            for (const div of movingDivs) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                if ($(div).is(':visible')) {
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $(div.querySelector('.floating_panel_close, .dragClose')).trigger('click');
                    return;
                }
            }

            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            if ($('#left-nav-panel').is(':visible') &&
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $(LPanelPin).prop('checked') === false) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#leftNavDrawerIcon').trigger('click');
                return;
            }

            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            if ($('#right-nav-panel').is(':visible') &&
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $(RPanelPin).prop('checked') === false) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#rightNavDrawerIcon').trigger('click');
                return;
            }
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            if ($('.draggable').is(':visible')) {
                // Remove the first matched element
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('.draggable:first').remove();
                return;
            }
        }


        if (event.ctrlKey && /^[1-9]$/.test(event.key)) {
            // This will eventually be to trigger quick replies
            // event.preventDefault();
            console.log('Ctrl +' + event.key + ' pressed!');
        }
    }
}
