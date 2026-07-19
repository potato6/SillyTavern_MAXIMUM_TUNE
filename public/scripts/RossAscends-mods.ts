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
import { debounce_timeout } from './constants.js';

import { Popup } from './popup.js';
import { accountStorage } from './util/AccountStorage.js';
import { getCurrentUserHandle } from './user.js';
import { kai_settings } from './kai-settings.js';

const RPanelPin = document.getElementById('rm_button_panel_pin')! as HTMLInputElement;
const LPanelPin = document.getElementById('lm_button_panel_pin')! as HTMLInputElement;
const WIPanelPin = document.getElementById('WI_panel_pin')! as HTMLInputElement;

const RightNavPanel = document.getElementById('right-nav-panel')!;
const RightNavDrawerIcon = document.getElementById('rightNavDrawerIcon')!;
const LeftNavPanel = document.getElementById('left-nav-panel')!;
const LeftNavDrawerIcon = document.getElementById('leftNavDrawerIcon')!;
const WorldInfo = document.getElementById('WorldInfo')!;
const WIDrawerIcon = document.getElementById('WIDrawerIcon')!;

const SelectedCharacterTab = document.getElementById('rm_button_selected_ch')!;

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
export function humanizeGenTime(total_gen_time: number): string {
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
let parsedUA: Record<string, unknown> | null = null;

/**
 * @returns {object|null} Parsed user agent object, or null if not yet parsed
 */
export function getParsedUA() {
    if (!parsedUA) {
        try {
            parsedUA = Bowser.parse(navigator.userAgent) as unknown as Record<string, unknown>;
        } catch {
            // In case the user agent is an empty string or Bowser can't parse it for some other reason
        }
    }

    return parsedUA;
}

/**
 * Checks if the device is a mobile device.
 * @returns {boolean} - True if the device is a mobile device, false otherwise.
 */
export function isMobile() {
    const mobileTypes = ['mobile', 'tablet'];

    const ua = getParsedUA();
    const platform = (ua as Record<string, unknown>)?.platform as Record<string, unknown>;
    return mobileTypes.includes(platform?.type as string);
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
    for (const key of Object.keys(dt) as (keyof typeof dt)[]) {
        const padLength = key === 'millisecond' ? 3 : 2;
        dt[key] = dt[key].toString().padStart(padLength, '0') as never;
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
document.getElementById('rm_button_create')?.addEventListener('click', function () {                 //when "+New Character" is clicked
        const selectedCharH2 = SelectedCharacterTab?.querySelector(':scope > h2');
    if (selectedCharH2) selectedCharH2.innerHTML = '';
});
//when any input is made to the create/edit character form textareas
document.getElementById('rm_ch_create_block')?.addEventListener('input', function () { countTokensDebounced(); });
//when any input is made to the advanced editing popup textareas
document.getElementById('character_popup')?.addEventListener('input', function () { countTokensDebounced(); });
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

        const counter = tokenCounter as HTMLElement;
        const input = document.getElementById(counter.getAttribute('data-token-counter') ?? '');
        const isPermanent = counter.getAttribute('data-token-permanent') === 'true';
        const value = String(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement ? input.value : '');

        if (!input) {
            counter.textContent = 'Invalid input reference';
            continue;
        }

        if (!value) {
            input.dataset.lastValueHash = '';
            counter.textContent = '0';
            continue;
        }

        const valueHash = getStringHash(value);

        if (input.dataset.lastValueHash === String(valueHash)) {
            total_tokens += Number(counter.textContent);
            permanent_tokens += isPermanent ? Number(counter.textContent) : 0;
        } else {
            // We substitute macro for existing characters, but not for the character being created
            const valueToCount = menu_type === 'create' ? value : substituteParams(value);
            const tokens = await getTokenCountAsync(valueToCount);

            if (counterNonceLocal !== counterNonce) {
                return;
            }

            counter.textContent = tokens;
            total_tokens += tokens;
            permanent_tokens += isPermanent ? tokens : 0;
            input.dataset.lastValueHash = String(valueHash);
        }
    }

    // Warn if total tokens exceeds the limit of half the max context
    const tokenLimit = Math.max(((main_api !== 'openai' ? max_context : oai_settings.openai_max_context) / 2), 1024);
    const showWarning = (total_tokens > tokenLimit);
    document.getElementById('result_info_total_tokens')!.textContent = String(total_tokens);
    document.getElementById('result_info_permanent_tokens')!.textContent = String(permanent_tokens);
    document.getElementById('result_info_text')?.classList.toggle('neutral_warning', showWarning);
    const _ctEl = document.getElementById('chartokenwarning') as HTMLElement; if (_ctEl) _ctEl.style.display = showWarning ? '' : 'none';
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
            const selectedCharElement = document.querySelector(`#rm_print_characters_block .character_select[chid="${active_character_id}"]`);
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
    const container = document.querySelector('#right-nav-panel .hotswap')!;

    // Hard limit is required because even if all hotswaps don't fit the screen, their images would still be loaded
    // 25 is roughly calculated as the maximum number of favs that can fit an ultrawide monitor with the default theme
    const FAVS_LIMIT = 25;
    const favs = entities.filter(x => x.item.fav || x.item.fav == 'true').slice(0, FAVS_LIMIT);

    //helpful instruction message if no characters are favorited
    if (favs.length == 0) {
        container.innerHTML = DOMPurify.sanitize(`<small><span><i class="fa-solid fa-star"></i>&nbsp;${(container as HTMLElement).getAttribute('no_favs') ?? ''}</span></small>`);
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
        const send_textarea = document.getElementById('send_textarea');
        send_textarea?.setAttribute('placeholder', send_textarea.getAttribute('no_connection_text') ?? ''); //Input bar placeholder tells users they are not connected
        document.getElementById('send_form')?.classList.add('no-connection');
        document.getElementById('send_but')?.classList.add('displayNone'); //send button is hidden when not connected;
        document.getElementById('mes_continue')?.classList.add('displayNone'); //continue button is hidden when not connected;
        document.getElementById('mes_impersonate')?.classList.add('displayNone'); //continue button is hidden when not connected;
        document.getElementById('API-status-top')?.classList.remove('fa-plug');
        document.getElementById('API-status-top')?.classList.add('fa-plug-circle-exclamation', 'redOverlayGlow');
        connection_made = false;
    } else {
        if (online_status !== undefined && online_status !== 'no_connection') {
            const send_textarea = document.getElementById('send_textarea');
            send_textarea?.setAttribute('placeholder', send_textarea.getAttribute('connected_text') ?? ''); //on connect, placeholder tells user to type message
            document.getElementById('send_form')?.classList.remove('no-connection');
            document.getElementById('API-status-top')?.classList.remove('fa-plug-circle-exclamation', 'redOverlayGlow');
            document.getElementById('API-status-top')?.classList.add('fa-plug');
            connection_made = true;
            retry_delay = 100;

            if (!is_send_press && !(selected_group && is_group_generating)) {
                document.getElementById('send_but')?.classList.remove('displayNone'); //on connect, send button shows
                document.getElementById('mes_continue')?.classList.remove('displayNone'); //continue button is shown when connected
                document.getElementById('mes_impersonate')?.classList.remove('displayNone'); //continue button is shown when connected
            }
        }
    }
}
//Auto-connect to API (when set to kobold, API URL exists, and auto_connect is true)

/**
 * @param {string} PrevApi The previous API name
 */
function RA_autoconnect(PrevApi?: string) {
    // secrets.js or script.js not loaded
    if (SECRET_KEYS === undefined || online_status === undefined) {
        setTimeout(RA_autoconnect, 100);
        return;
    }
    if (online_status === 'no_connection' && power_user.auto_connect) {
        switch (main_api) {
            case 'kobold':
                if (kai_settings.api_server && isValidUrl(kai_settings.api_server)) {
                    document.getElementById('api_button')?.dispatchEvent(new Event('click', { bubbles: true }));
                }
                break;
            case 'novel':
                            if ((secret_state as Record<string, unknown>)[SECRET_KEYS.NOVEL]) {
                    document.getElementById('api_button_novel')?.dispatchEvent(new Event('click', { bubbles: true }));
                }
                break;
            case 'textgenerationwebui':
                if ((textgen_settings.type === textgen_types.MANCER && (secret_state as Record<string, unknown>)[SECRET_KEYS.MANCER])
                    || (textgen_settings.type === textgen_types.TOGETHERAI && (secret_state as Record<string, unknown>)[SECRET_KEYS.TOGETHERAI])
                    || (textgen_settings.type === textgen_types.INFERMATICAI && (secret_state as Record<string, unknown>)[SECRET_KEYS.INFERMATICAI])
                    || (textgen_settings.type === textgen_types.DREAMGEN && (secret_state as Record<string, unknown>)[SECRET_KEYS.DREAMGEN])
                    || (textgen_settings.type === textgen_types.OPENROUTER && (secret_state as Record<string, unknown>)[SECRET_KEYS.OPENROUTER])
                    || (textgen_settings.type === textgen_types.FEATHERLESS && (secret_state as Record<string, unknown>)[SECRET_KEYS.FEATHERLESS])
                ) {
                    document.getElementById('api_button_textgenerationwebui')?.dispatchEvent(new Event('click', { bubbles: true }));
                } else if (isValidUrl(getTextGenServer())) {
                    document.getElementById('api_button_textgenerationwebui')?.dispatchEvent(new Event('click', { bubbles: true }));
                }
                break;
            case 'openai':
                if ((((secret_state as Record<string, unknown>)[SECRET_KEYS.OPENAI] || oai_settings.reverse_proxy) && oai_settings.chat_completion_source == chat_completion_sources.OPENAI)
                    || (((secret_state as Record<string, unknown>)[SECRET_KEYS.CLAUDE] || oai_settings.reverse_proxy) && oai_settings.chat_completion_source == chat_completion_sources.CLAUDE)
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.OPENROUTER] && oai_settings.chat_completion_source == chat_completion_sources.OPENROUTER)
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.AI21] && oai_settings.chat_completion_source == chat_completion_sources.AI21)
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.MAKERSUITE] && oai_settings.chat_completion_source == chat_completion_sources.MAKERSUITE)
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.VERTEXAI] && oai_settings.chat_completion_source == chat_completion_sources.VERTEXAI && oai_settings.vertexai_auth_mode === 'express')
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.VERTEXAI_SERVICE_ACCOUNT] && oai_settings.chat_completion_source == chat_completion_sources.VERTEXAI && oai_settings.vertexai_auth_mode === 'full')
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.MISTRALAI] && oai_settings.chat_completion_source == chat_completion_sources.MISTRALAI)
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.COHERE] && oai_settings.chat_completion_source == chat_completion_sources.COHERE)
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.PERPLEXITY] && oai_settings.chat_completion_source == chat_completion_sources.PERPLEXITY)
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.GROQ] && oai_settings.chat_completion_source == chat_completion_sources.GROQ)
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.CHUTES] && oai_settings.chat_completion_source == chat_completion_sources.CHUTES)
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.SILICONFLOW] && oai_settings.chat_completion_source == chat_completion_sources.SILICONFLOW)
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.ELECTRONHUB] && oai_settings.chat_completion_source == chat_completion_sources.ELECTRONHUB)
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.NANOGPT] && oai_settings.chat_completion_source == chat_completion_sources.NANOGPT)
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.DEEPSEEK] && oai_settings.chat_completion_source == chat_completion_sources.DEEPSEEK)
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.XAI] && oai_settings.chat_completion_source == chat_completion_sources.XAI)
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.AIMLAPI] && oai_settings.chat_completion_source == chat_completion_sources.AIMLAPI)
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.MOONSHOT] && oai_settings.chat_completion_source == chat_completion_sources.MOONSHOT)
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.FIREWORKS] && oai_settings.chat_completion_source == chat_completion_sources.FIREWORKS)
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.COMETAPI] && oai_settings.chat_completion_source == chat_completion_sources.COMETAPI)
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.ZAI] && oai_settings.chat_completion_source == chat_completion_sources.ZAI)
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.POLLINATIONS] && oai_settings.chat_completion_source === chat_completion_sources.POLLINATIONS)
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.WORKERS_AI] && oai_settings.chat_completion_source == chat_completion_sources.WORKERS_AI)
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.MINIMAX] && oai_settings.chat_completion_source == chat_completion_sources.MINIMAX)
                    || (isValidUrl(oai_settings.custom_url) && oai_settings.chat_completion_source == chat_completion_sources.CUSTOM)
                    || ((secret_state as Record<string, unknown>)[SECRET_KEYS.AZURE_OPENAI] && oai_settings.chat_completion_source == chat_completion_sources.AZURE_OPENAI)
                ) {
                    document.getElementById('api_button_openai')?.dispatchEvent(new Event('click', { bubbles: true }));
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
            document.getElementById('rightNavDrawerIcon')?.dispatchEvent(new Event('click', { bubbles: true }));
        }

        //auto-open L nav if locked and previously open
        if (accountStorage.getItem('LNavLockOn') == 'true' && accountStorage.getItem('LNavOpened') == 'true') {
            console.debug('RA -- clicking left nav to open');
            document.getElementById('leftNavDrawerIcon')?.dispatchEvent(new Event('click', { bubbles: true }));
        }

        //auto-open WI if locked and previously open
        if (accountStorage.getItem('WINavLockOn') == 'true' && accountStorage.getItem('WINavOpened') == 'true') {
            console.debug('RA -- clicking WI to open');
            document.getElementById('WIDrawerIcon')?.dispatchEvent(new Event('click', { bubbles: true }));
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
        const el = document.getElementById('send_textarea') as HTMLTextAreaElement | null;
        if (el) {
            el.value = userInput;
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
}

/**
 *
 */
function saveUserInput() {
    const el = document.getElementById('send_textarea') as HTMLTextAreaElement | null;
    const userInput = String(el?.value ?? '');
    localStorage.setItem(getUserInputKey(), userInput);
    console.debug('User Input -- ', userInput);
}
const saveUserInputDebounced = debounce(saveUserInput);

/**
 * Make the given element draggable. This is used for Moving UI.
 * @param {HTMLElement} elmnt - The element to make draggable.
 */
export function dragElement(elmnt: HTMLElement) {
    let actionType: string | null = null; // "drag" or "resize"
    let isMouseDown = false;

    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let height = 0, width = 0, top = 0, left = 0, right = 0, bottom = 0,
        maxX = 0, maxY = 0, winHeight = 0, winWidth = 0;

    if (!elmnt) return;
    const elmntName = elmnt.id;

    /**
     *
     */
    function savePositionAndSize() {
        const state = (power_user.movingUIState as Record<string, Record<string, unknown>>);
        if (!state[elmntName]) state[elmntName] = {};
        state[elmntName]!.top = top;
        state[elmntName]!.left = left;
        state[elmntName]!.right = right;
        state[elmntName]!.bottom = bottom;
        state[elmntName]!.margin = 'unset';
        if (actionType === 'resize') {
            state[elmntName]!.width = width;
            state[elmntName]!.height = height;
            eventSource.emit('resizeUI', elmntName);
        }
        saveSettingsDebounced();
    }

    /**
     *
     */
    function clampToViewport() {
        if (top <= 0) elmnt.style.setProperty('top', '0px', 'important');
        else if (maxY >= winHeight) elmnt.style.setProperty('top', (winHeight - maxY + top - 1) + 'px', 'important');
        if (left <= 0) elmnt.style.setProperty('left', '0px', 'important');
        else if (maxX >= winWidth) elmnt.style.setProperty('left', (winWidth - maxX + left - 1) + 'px', 'important');
    }

    const observer = new MutationObserver((mutations: MutationRecord[]) => {
        const target = mutations[0]!.target;
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

        const state = (power_user.movingUIState as Record<string, Record<string, unknown>>);
        if (!state[elmntName]) state[elmntName] = {};

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
        } else if (actionType === 'drag') {
            clampToViewport();
        }

        savePositionAndSize();
    });

    /**
     * @param {MouseEvent} e Mouse event
     */
    function dragMouseDown(e: MouseEvent) {
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
    function elementDrag(e: MouseEvent) {
        const state = (power_user.movingUIState as Record<string, Record<string, unknown>>);
        if (!state[elmntName]) state[elmntName] = {};
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
        elmnt.style.setProperty('height', height + 'px', 'important');
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
        elmntHeader.addEventListener('mousedown', (e: MouseEvent) => {
            if (e.target && (e.target as HTMLElement).classList.contains('drag-grabber')) {
                actionType = 'drag';
                isMouseDown = true;
                observer.observe(elmnt, { attributes: true, attributeFilter: ['style'] });
                dragMouseDown(e);
            }
        });
    }

    elmnt.addEventListener('mousedown', (e: MouseEvent) => {
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
        dragElement(document.getElementById('sheld')!);
        dragElement(document.getElementById('left-nav-panel')!);
        dragElement(document.getElementById('right-nav-panel')!);
        dragElement(document.getElementById('WorldInfo')!);
        dragElement(document.getElementById('floatingPrompt')!);
        dragElement(document.getElementById('logprobsViewer')!);
        dragElement(document.getElementById('cfgConfig')!);
    }
}

const sendTextArea = document.querySelector('#send_textarea') as HTMLTextAreaElement | null;
const chatBlock = document.getElementById('chat') as HTMLElement | null;
const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;

/**
 * this makes the chat input text area resize vertically to match the text size (limited by CSS at 50% window height)
 */
function autoFitSendTextArea() {
    if (!chatBlock || !sendTextArea) return;
    const originalScrollBottom = chatBlock.scrollHeight - (chatBlock.scrollTop + chatBlock.offsetHeight);

    sendTextArea.style.height = '1px'; // Reset height to 1px to force recalculation of scrollHeight
    const newHeight = sendTextArea.scrollHeight;
    sendTextArea.style.height = `${newHeight}px`;

    if (!isFirefox) {
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
        RA_autoconnect();
    }

    document.getElementById('main_api')?.addEventListener('change', function () {
        const PrevAPI = main_api;
        setTimeout(() => RA_autoconnect(PrevAPI), 100);
    });

    document.getElementById('api_button')?.addEventListener('click', () => checkStatusDebounced());

    //toggle pin class when lock toggle clicked
    RPanelPin.addEventListener('click', function () {
        accountStorage.setItem('NavLockOn', RPanelPin.checked);
        if (RPanelPin.checked) {
            //console.log('adding pin class to right nav');
            RightNavPanel.classList.add('pinnedOpen');
            RightNavDrawerIcon.classList.add('drawerPinnedOpen');
        } else {
            //console.log('removing pin class from right nav');
            RightNavPanel.classList.remove('pinnedOpen');
            RightNavDrawerIcon.classList.remove('drawerPinnedOpen');

            if (RightNavPanel.classList.contains('openDrawer') && document.querySelectorAll('.openDrawer').length > 1) {
                const toggle = document.getElementById('unimportantYes');
                if (toggle) doNavbarIconClick.call(toggle);
            }
        }
    });
    LPanelPin.addEventListener('click', function () {
        accountStorage.setItem('LNavLockOn', LPanelPin.checked);
        if (LPanelPin.checked) {
            //console.log('adding pin class to Left nav');
            LeftNavPanel.classList.add('pinnedOpen');
            LeftNavDrawerIcon.classList.add('drawerPinnedOpen');
        } else {
            //console.log('removing pin class from Left nav');
            LeftNavPanel.classList.remove('pinnedOpen');
            LeftNavDrawerIcon.classList.remove('drawerPinnedOpen');

            if (LeftNavPanel.classList.contains('openDrawer') && document.querySelectorAll('.openDrawer').length > 1) {
                const toggle = document.querySelector('#ai-config-button>.drawer-toggle');
                if (toggle) doNavbarIconClick.call(toggle as HTMLElement);
            }
        }
    });

    WIPanelPin.addEventListener('click', async function () {
        accountStorage.setItem('WINavLockOn', WIPanelPin.checked);
        if (WIPanelPin.checked) {
            console.debug('adding pin class to WI');
            WorldInfo.classList.add('pinnedOpen');
            WIDrawerIcon.classList.add('drawerPinnedOpen');
        } else {
            console.debug('removing pin class from WI');
            WorldInfo.classList.remove('pinnedOpen');
            WIDrawerIcon.classList.remove('drawerPinnedOpen');

            if (WorldInfo.classList.contains('openDrawer') && document.querySelectorAll('.openDrawer').length > 1) {
                console.debug('closing WI after lock removal');
                const toggle = document.querySelector('#WI-SP-button>.drawer-toggle');
                if (toggle) doNavbarIconClick.call(toggle as HTMLElement);
            }
        }
    });

    if (!isMobile()) { //only read/set pin states on non-mobile devices
        // read the state of right Nav Lock and apply to rightnav classlist
        RPanelPin.checked = accountStorage.getItem('NavLockOn') == 'true';
        if (accountStorage.getItem('NavLockOn') == 'true') {
            //console.log('setting pin class via local var');
            RightNavPanel.classList.add('pinnedOpen');
            RightNavDrawerIcon.classList.add('drawerPinnedOpen');
        }
        if (RPanelPin.checked) {
            console.debug('setting pin class via checkbox state');
            RightNavPanel.classList.add('pinnedOpen');
            RightNavDrawerIcon.classList.add('drawerPinnedOpen');
        }
        // read the state of left Nav Lock and apply to leftnav classlist
        LPanelPin.checked = accountStorage.getItem('LNavLockOn') === 'true';
        if (accountStorage.getItem('LNavLockOn') == 'true') {
            //console.log('setting pin class via local var');
            LeftNavPanel.classList.add('pinnedOpen');
            LeftNavDrawerIcon.classList.add('drawerPinnedOpen');
        }
        if (LPanelPin.checked) {
            console.debug('setting pin class via checkbox state');
            LeftNavPanel.classList.add('pinnedOpen');
            LeftNavDrawerIcon.classList.add('drawerPinnedOpen');
        }

        // read the state of WI Lock and apply to WI classlist
        WIPanelPin.checked = accountStorage.getItem('WINavLockOn') === 'true';
        if (accountStorage.getItem('WINavLockOn') == 'true') {
            //console.log('setting pin class via local var');
            WorldInfo.classList.add('pinnedOpen');
            WIDrawerIcon.classList.add('drawerPinnedOpen');
        }

        if (WIPanelPin.checked) {
            console.debug('setting pin class via checkbox state');
            WorldInfo.classList.add('pinnedOpen');
            WIDrawerIcon.classList.add('drawerPinnedOpen');
        }
    }


    //save state of Right nav being open or closed
    document.getElementById('rightNavDrawerIcon')?.addEventListener('click', function () {
        if (!document.getElementById('rightNavDrawerIcon')!.classList.contains('openIcon')) {
            accountStorage.setItem('NavOpened', 'true');
        } else { accountStorage.setItem('NavOpened', 'false'); }
    });

    //save state of Left nav being open or closed
    document.getElementById('leftNavDrawerIcon')?.addEventListener('click', function () {
        if (!document.getElementById('leftNavDrawerIcon')!.classList.contains('openIcon')) {
            accountStorage.setItem('LNavOpened', 'true');
        } else { accountStorage.setItem('LNavOpened', 'false'); }
    });

    //save state of WI nav being open or closed
    document.getElementById('WorldInfo')?.addEventListener('click', function () {
        if (!document.getElementById('WorldInfo')!.classList.contains('openIcon')) {
            accountStorage.setItem('WINavOpened', 'true');
        } else { accountStorage.setItem('WINavOpened', 'false'); }
    });

    let chatbarInFocus = false;
    document.getElementById('send_textarea')?.addEventListener('focus', function () {
        chatbarInFocus = true;
    });

    document.getElementById('send_textarea')?.addEventListener('blur', function () {
        chatbarInFocus = false;
    });

    setTimeout(() => {
        OpenNavPanels();
    }, 300);

    SelectedCharacterTab?.addEventListener('click', function () { accountStorage.setItem('SelectedNavTab', 'rm_button_selected_ch'); });
    document.getElementById('rm_button_characters')?.addEventListener('click', function () { accountStorage.setItem('SelectedNavTab', 'rm_button_characters'); });

    // when a char is selected from the list, save them as the auto-load character for next page load

    // when a char is selected from the list, save their name as the auto-load character for next page load
    document.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const el = target.closest('.character_select');
        if (!el) return;
        const characterId = el.getAttribute('data-chid');
        setActiveCharacter(characterId);
        setActiveGroup(null);
        saveSettingsDebounced();
    });

    document.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const el = target.closest('.group_select');
        if (!el) return;
        const groupId = el.getAttribute('data-chid') || el.getAttribute('data-grid');
        setActiveCharacter(null);
        setActiveGroup(groupId);
        saveSettingsDebounced();
    });

    const cssAutofit = CSS.supports('field-sizing', 'content');

    if (cssAutofit && chatBlock) {
        let lastHeight = chatBlock.offsetHeight;
        const chatBlockResizeObserver = new ResizeObserver((entries: ResizeObserverEntry[]) => {
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

        chatBlockResizeObserver.observe(chatBlock);
    }

    sendTextArea?.addEventListener('input', () => {
        saveUserInputDebounced();
        if (!sendTextArea) return;

        if (cssAutofit) {
            // Unset modifications made with a manual resize
            sendTextArea.style.height = 'auto';
            return;
        }

        const hasContent = sendTextArea.value !== '';
        const fitsCurrentSize = sendTextArea.scrollHeight <= sendTextArea.offsetHeight;
        const isScrollbarShown = sendTextArea.clientWidth < sendTextArea.offsetWidth;
        const isHalfScreenHeight = sendTextArea.offsetHeight >= window.innerHeight / 2;
        const needsDebounce = hasContent && (fitsCurrentSize || (isScrollbarShown && isHalfScreenHeight));
        if (needsDebounce) autoFitSendTextAreaDebounced();
        else autoFitSendTextArea();
    });

    restoreUserInput();

    // Swipe gestures (see: https://www.npmjs.com/package/swiped-events)
    document.addEventListener('swiped-left', function (e: Event) {
        if (power_user.gestures === false) {
            return;
        }
        if (Popup.util.isPopupOpen()) {
            return;
        }
        if (!(e.target instanceof Element) || !e.target.closest('#sheld')) {
            return;
        }
        if (document.getElementById('curEditTextarea')) {
            return;
        }
        const SwipeButR = [...document.querySelectorAll('.swipe_right')].pop();
        const SwipeTargetMesClassParent = e.target instanceof Element ? e.target.closest('.last_mes') : null;
        if (SwipeTargetMesClassParent !== null && SwipeButR) {
            if ((SwipeButR as HTMLElement).offsetParent !== null) {
                SwipeButR.dispatchEvent(new Event('click', { bubbles: true }));
            }
        }
    });
    document.addEventListener('swiped-right', function (e: Event) {
        if (power_user.gestures === false) {
            return;
        }
        if (Popup.util.isPopupOpen()) {
            return;
        }
        if (!(e.target instanceof Element) || !e.target.closest('#sheld')) {
            return;
        }
        if (document.getElementById('curEditTextarea')) {
            return;
        }
        const SwipeButL = [...document.querySelectorAll('.swipe_left')].pop();
        const SwipeTargetMesClassParent = e.target instanceof Element ? e.target.closest('.last_mes') : null;
        if (SwipeTargetMesClassParent !== null && SwipeButL) {
            if ((SwipeButL as HTMLElement).offsetParent !== null) {
                SwipeButL.dispatchEvent(new Event('click', { bubbles: true }));
            }
        }
    });


    /**
     * @returns {boolean} Whether an input element is currently focused
     */
    function isInputElementInFocus() {
        //return $(document.activeElement).is(":input");
        const focused = document.activeElement;
        if (focused && (focused.matches('input') || focused.matches('textarea') || focused.getAttribute('contenteditable') == 'true')) {
            if (focused.getAttribute('id') === 'send_textarea') {
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
    function isModifiedKeyboardEvent(event: KeyboardEvent) {
        return (event instanceof KeyboardEvent &&
            (event.shiftKey ||
            event.ctrlKey ||
            event.altKey ||
            event.metaKey));
    }

    document.addEventListener('keydown', async function (event: KeyboardEvent) {
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
    async function processHotkeys(event: KeyboardEvent) {
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
                document.getElementById('dialogue_popup_ok')?.dispatchEvent(new Event('click', { bubbles: true }));
                return;
            }
        }
        //ctrl+shift+up to scroll to context line
        if (event.shiftKey && event.ctrlKey && event.key == 'ArrowUp') {
            event.preventDefault();
            const chatEl = document.getElementById('chat');
            const contextLine = document.querySelector('.lastInContext');
            if (chatEl && contextLine) {
                chatEl.scrollTo({
                    top: contextLine.getBoundingClientRect().top - chatEl.getBoundingClientRect().top + chatEl.scrollTop,
                    behavior: 'smooth',
                });
            } else {
                notyf.warning('Context line not found, send a message first!');
            }
            return;
        }
        //ctrl+shift+down to scroll to bottom of chat
        if (event.shiftKey && event.ctrlKey && event.key == 'ArrowDown') {
            event.preventDefault();
            document.getElementById('chat')?.scrollTo({
                top: 999999,
                behavior: 'smooth',
            });
            return;
        }

        // Alt+Enter or AltGr+Enter to Continue
        if ((event.altKey || (event.altKey && event.ctrlKey)) && event.key == 'Enter') {
            if (is_send_press == false) {
                console.debug('Continuing with Alt+Enter');
                document.getElementById('option_continue')?.dispatchEvent(new Event('click', { bubbles: true }));
                return;
            }
        }

        // Ctrl+Enter for Regeneration Last Response. If editing, accept the edits instead
        if (event.ctrlKey && event.key == 'Enter') {
            const editMesDone = [...document.querySelectorAll('.mes_edit_done')].find(e => (e as HTMLElement).offsetParent !== null);
            const reasoningMesDone = [...document.querySelectorAll('.mes_reasoning_edit_done')].find(e => (e as HTMLElement).offsetParent !== null);
            if (editMesDone) {
                console.debug('Accepting edits with Ctrl+Enter');
                document.getElementById('send_textarea')?.dispatchEvent(new Event('focus', { bubbles: true }));
                editMesDone.dispatchEvent(new Event('click', { bubbles: true }));
                return;
            } else if (reasoningMesDone) {
                console.debug('Accepting edits with Ctrl+Enter');
                document.getElementById('send_textarea')?.dispatchEvent(new Event('focus', { bubbles: true }));
                reasoningMesDone.dispatchEvent(new Event('click', { bubbles: true }));
                return;
            } else if (is_send_press == false) {
                const skipConfirmKey = 'RegenerateWithCtrlEnter';
                const skipConfirm = accountStorage.getItem(skipConfirmKey) === 'true';
                /**
                 *
                 */
                function doRegenerate() {
                    console.debug('Regenerating with Ctrl+Enter');
                    document.getElementById('option_regenerate')?.dispatchEvent(new Event('click', { bubbles: true }));
                    const optionsEl = document.getElementById('options'); if (optionsEl) optionsEl.style.display = 'none';
                }

                // If there is input text, we do not trigger a regenerate - we just send it
                const sendTextareaEl = document.getElementById('send_textarea') as HTMLTextAreaElement | null;
                if (sendTextareaEl && sendTextareaEl.value !== '') {
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
                        onClose: (popup: { inputResults: Map<string, unknown> }) => {
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
                (document.getElementById('send_textarea') as HTMLTextAreaElement | null)?.value === '' &&
                !isInputElementInFocus() &&
                !isModifiedKeyboardEvent(event) &&
                !(document.activeElement instanceof HTMLVideoElement)
            ) {
                const swipeBtn = [...document.querySelectorAll('.swipe_left')].pop();
                if (swipeBtn) swipeBtn.dispatchEvent(new Event('click'));
                return;
            }
        }
        if (event.key == 'ArrowRight') { //swipes right
            if (
                isSwipingAllowed() &&
                !isNanogallery2LightboxActive() &&  // Check if lightbox is NOT active
                (document.getElementById('send_textarea') as HTMLTextAreaElement | null)?.value === '' &&
                !isInputElementInFocus() &&
                !isModifiedKeyboardEvent(event) &&
                !(document.activeElement instanceof HTMLVideoElement)
            ) {
                const swipeBtn = [...document.querySelectorAll('.swipe_right')].pop();
                if (swipeBtn) swipeBtn.dispatchEvent(new Event('click'));
                return;
            }
        }


        if (event.ctrlKey && event.key == 'ArrowUp') { //edits last USER message if chatbar is empty and focused
            if (
                hotkeyTargets.send_textarea && hotkeyTargets.send_textarea.value === '' &&
                chatbarInFocus === true &&
                isSwipingAllowed()
            ) {
                const isUserMesList = document.querySelectorAll('div[is_user="true"]');
                const lastIsUserMes = isUserMesList[isUserMesList.length - 1];
                const editMes = lastIsUserMes?.querySelector('.mes_block .mes_edit');
                if (editMes) {
                    editMes.dispatchEvent(new Event('click', { bubbles: true }));
                    return;
                }
            }
        }

        if (event.key == 'ArrowUp') { //edits last message if chatbar is empty and focused
            console.log('got uparrow input');
            if (
                hotkeyTargets.send_textarea && hotkeyTargets.send_textarea.value === '' &&
                chatbarInFocus === true &&
                document.querySelector('.last_mes .mes_buttons') &&
                (document.querySelector('.last_mes .mes_buttons') as HTMLElement).offsetParent !== null
            ) {
                const lastMes = document.querySelector('.last_mes');
                const editMes = lastMes?.querySelector('.mes_block .mes_edit');
                if (editMes) {
                    editMes.dispatchEvent(new Event('click', { bubbles: true }));
                    return;
                }
            }
        }

        if (event.key == 'Escape') { //closes various panels
            //dont override Escape hotkey functions from script.js
            //"close edit box" and "cancel stream generation".
            const curEditTextarea = document.getElementById('curEditTextarea');
            const mesStop = document.getElementById('mes_stop');
            if ((curEditTextarea && (curEditTextarea as HTMLElement).offsetParent !== null) || (mesStop && (mesStop as HTMLElement).offsetParent !== null)) {
                console.debug('escape key, but deferring to script.js routines');
                return;
            }

            const dialoguePopup = document.getElementById('dialogue_popup');
            if (dialoguePopup && (dialoguePopup as HTMLElement).offsetParent !== null) {
                const cancelBtn = document.getElementById('dialogue_popup_cancel');
                if (cancelBtn && (cancelBtn as HTMLElement).offsetParent !== null) {
                    cancelBtn.dispatchEvent(new Event('click', { bubbles: true }));
                    return;
                } else {
                    document.getElementById('dialogue_popup_ok')?.dispatchEvent(new Event('click', { bubbles: true }));
                    return;
                }
            }

            const selectChatPopup = document.getElementById('select_chat_popup');
            if (selectChatPopup && (selectChatPopup as HTMLElement).offsetParent !== null) {
                document.getElementById('select_chat_cross')?.dispatchEvent(new Event('click', { bubbles: true }));
                return;
            }

            const characterPopup = document.getElementById('character_popup');
            if (characterPopup && (characterPopup as HTMLElement).offsetParent !== null) {
                document.getElementById('character_cross')?.dispatchEvent(new Event('click', { bubbles: true }));
                return;
            }

            const delMesCancel = document.getElementById('dialogue_del_mes_cancel');
            if (delMesCancel && (delMesCancel as HTMLElement).offsetParent !== null) {
                delMesCancel.dispatchEvent(new Event('click', { bubbles: true }));
                return;
            }

            const drawerContents = [...document.querySelectorAll('.drawer-content')].filter(el =>
                !['WorldInfo','left-nav-panel','right-nav-panel','floatingPrompt','cfgConfig','logprobsViewer'].includes(el.id) &&
                !el.matches('#movingDivs > div')
            );
            if (drawerContents.some(el => (el as HTMLElement).offsetParent !== null)) {
                const visibleDrawerContent = drawerContents.filter(el => (el as HTMLElement).offsetParent !== null);
                const drawerIcon = visibleDrawerContent[0]?.parentElement?.querySelector('.drawer-icon');
                drawerIcon?.dispatchEvent(new Event('click', { bubbles: true }));
                return;
            }

            const logprobsViewer = document.getElementById('logprobsViewer');
            if (logprobsViewer && (logprobsViewer as HTMLElement).offsetParent !== null) {
                document.getElementById('logprobsViewerClose')?.dispatchEvent(new Event('click', { bubbles: true }));
                return;
            }

            const cfgConfig = document.getElementById('cfgConfig');
            if (cfgConfig && (cfgConfig as HTMLElement).offsetParent !== null) {
                document.getElementById('CFGClose')?.dispatchEvent(new Event('click', { bubbles: true }));
                return;
            }

            const floatingPrompt = document.getElementById('floatingPrompt');
            if (floatingPrompt && (floatingPrompt as HTMLElement).offsetParent !== null) {
                document.getElementById('ANClose')?.dispatchEvent(new Event('click', { bubbles: true }));
                return;
            }

            const worldInfoEl = document.getElementById('WorldInfo');
            if (worldInfoEl && (worldInfoEl as HTMLElement).offsetParent !== null) {
                document.getElementById('WIDrawerIcon')?.dispatchEvent(new Event('click', { bubbles: true }));
                return;
            }

            const movingDivs = [...document.querySelectorAll('#movingDivs > div')].reverse();
            for (const div of movingDivs) {
                if ((div as HTMLElement).offsetParent !== null) {
                    div.querySelector('.floating_panel_close, .dragClose')?.dispatchEvent(new Event('click', { bubbles: true }));
                    return;
                }
            }

            const leftNavPanel = document.getElementById('left-nav-panel');
            if (leftNavPanel && (leftNavPanel as HTMLElement).offsetParent !== null &&
                LPanelPin.checked === false) {
                document.getElementById('leftNavDrawerIcon')?.dispatchEvent(new Event('click', { bubbles: true }));
                return;
            }

            const rightNavPanel = document.getElementById('right-nav-panel');
            if (rightNavPanel && (rightNavPanel as HTMLElement).offsetParent !== null &&
                RPanelPin.checked === false) {
                document.getElementById('rightNavDrawerIcon')?.dispatchEvent(new Event('click', { bubbles: true }));
                return;
            }

            const draggable = document.querySelector('.draggable');
            if (draggable && (draggable as HTMLElement).offsetParent !== null) {
                // Remove the first matched element
                draggable.remove();
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
