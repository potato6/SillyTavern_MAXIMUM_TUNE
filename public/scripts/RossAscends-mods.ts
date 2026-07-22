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

// Cached DOM references
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

// Generic DOM event trigger
const triggerClick = (target: string | Element | null) => {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    el?.dispatchEvent(new Event('click', { bubbles: true }));
};

const observer = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
        const target = mutations[i]!.target;
        if (!(target instanceof HTMLElement)) continue;

        if (target.classList.contains('online_status_text')) {
            checkStatusDebounced();
        } else if (target.parentNode === SelectedCharacterTab) {
            countTokensShortDebounced();
        } else if (target.classList.contains('mes_text')) {
            const mathElems = target.getElementsByTagName('math');
            for (let j = 0; j < mathElems.length; j++) {
                const childNodes = mathElems[j]!.childNodes;
                for (let k = 0; k < childNodes.length; k++) {
                    if (childNodes[k]!.nodeType === Node.TEXT_NODE) {
                        childNodes[k]!.textContent = '';
                    }
                }
            }
        }
    }
});

observer.observe(document.documentElement, observerConfig);

/**
 * Converts generation time from milliseconds to a human-readable format.
 * @param {number} total_gen_time - The total generation time in milliseconds.
 * @returns {string} - A human-readable string that represents the time spent generating characters.
 */
export function humanizeGenTime(total_gen_time: number): string {
    let totalSecs = Math.floor((total_gen_time || 0) / 1000);
    const seconds = totalSecs % 60;
    totalSecs = Math.floor(totalSecs / 60);
    const minutes = totalSecs % 60;
    totalSecs = Math.floor(totalSecs / 60);
    const hours = totalSecs % 24;
    const days = Math.floor(totalSecs / 24);

    const parts: string[] = [];
    if (days > 0) parts.push(`${days} Days`);
    if (hours > 0) parts.push(`${hours} Hours`);
    if (minutes > 0) parts.push(`${minutes} Minutes`);
    parts.push(`${seconds} Seconds`);

    return parts.join(', ');
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
            // In case the user agent is an empty string or Bowser can't parse it
        }
    }
    return parsedUA;
}

/**
 * Checks if the device is a mobile device.
 * @returns {boolean} - True if the device is a mobile device, false otherwise.
 */
export function isMobile() {
    const ua = getParsedUA();
    const platformType = ((ua as Record<string, unknown>)?.platform as Record<string, unknown>)?.type as string;
    return platformType === 'mobile' || platformType === 'tablet';
}

/**
 * @returns {boolean} Whether enter should send the message
 */
export function shouldSendOnEnter() {
    if (!power_user) return false;

    switch (power_user.send_on_enter) {
        case send_on_enter_options.DISABLED:
            return false;
        case send_on_enter_options.AUTO:
            return !isMobile();
        case send_on_enter_options.ENABLED:
            return true;
        default:
            return false;
    }
}

/**
 * Gets a humanized date time string from a given timestamp.
 * @param {number} timestamp Timestamp in milliseconds
 * @returns {string} Humanized date time string in the format `YYYY-MM-DD@HHhMMmSSsMSms`
 */
export function humanizedDateTime(timestamp = Date.now()) {
    const date = new Date(timestamp);
    const pad = (num: number, len = 2) => String(num).padStart(len, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}@${pad(date.getHours())}h${pad(date.getMinutes())}m${pad(date.getSeconds())}s${pad(date.getMilliseconds(), 3)}ms`;
}

/**
 * Gets a timestamp for messages in ISO 8601 format.
 * @param {number} timestamp - optional timestamp in milliseconds
 * @returns {string} ISO 8601 formatted timestamp
 */
export function getMessageTimeStamp(timestamp = Date.now()) {
    return new Date(timestamp).toISOString();
}

// Global Event Listeners
document.getElementById('rm_button_create')?.addEventListener('click', () => {
    const selectedCharH2 = SelectedCharacterTab?.querySelector(':scope > h2');
    if (selectedCharH2) selectedCharH2.innerHTML = '';
});

document.getElementById('rm_ch_create_block')?.addEventListener('input', countTokensDebounced);
document.getElementById('character_popup')?.addEventListener('input', countTokensDebounced);

export async function RA_CountCharTokens() {
    counterNonce = Date.now();
    const counterNonceLocal = counterNonce;
    let total_tokens = 0;
    let permanent_tokens = 0;

    const tokenCounters = document.querySelectorAll('[data-token-counter]');
    for (let i = 0; i < tokenCounters.length; i++) {
        if (counterNonceLocal !== counterNonce) return;

        const counter = tokenCounters[i] as HTMLElement;
        const inputId = counter.getAttribute('data-token-counter') ?? '';
        const input = document.getElementById(inputId);
        const isPermanent = counter.getAttribute('data-token-permanent') === 'true';

        if (!input) {
            counter.textContent = 'Invalid input reference';
            continue;
        }

        const value = String((input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) ? input.value : '');
        if (!value) {
            input.dataset.lastValueHash = '';
            counter.textContent = '0';
            continue;
        }

        const valueHash = String(getStringHash(value));

        if (input.dataset.lastValueHash === valueHash) {
            const count = Number(counter.textContent);
            total_tokens += count;
            if (isPermanent) permanent_tokens += count;
        } else {
            const valueToCount = menu_type === 'create' ? value : substituteParams(value);
            const tokens = await getTokenCountAsync(valueToCount);

            if (counterNonceLocal !== counterNonce) return;

            counter.textContent = String(tokens);
            total_tokens += tokens;
            if (isPermanent) permanent_tokens += tokens;
            input.dataset.lastValueHash = valueHash;
        }
    }

    const maxCtx = main_api !== 'openai' ? max_context : oai_settings.openai_max_context;
    const tokenLimit = Math.max(maxCtx / 2, 1024);
    const showWarning = total_tokens > tokenLimit;

    document.getElementById('result_info_total_tokens')!.textContent = String(total_tokens);
    document.getElementById('result_info_permanent_tokens')!.textContent = String(permanent_tokens);
    document.getElementById('result_info_text')?.classList.toggle('neutral_warning', showWarning);

    const _ctEl = document.getElementById('chartokenwarning');
    if (_ctEl) _ctEl.style.display = showWarning ? '' : 'none';
}

async function RA_autoloadchat() {
    if (active_character !== null && active_character !== undefined) {
        const active_character_id = characters.findIndex(x => getTagKeyForEntity(x) === active_character);
        if (active_character_id !== -1) {
            await selectCharacterById(active_character_id);
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

export async function favsToHotswap() {
    const entities = getEntitiesList({ doFilter: false });
    const container = document.querySelector('#right-nav-panel .hotswap')!;
    const FAVS_LIMIT = 25;
    const favs = entities.filter(x => x.item.fav || x.item.fav === 'true').slice(0, FAVS_LIMIT);

    if (favs.length === 0) {
        const noFavsAttr = (container as HTMLElement).getAttribute('no_favs') ?? '';
        container.innerHTML = DOMPurify.sanitize(`<small><span><i class="fa-solid fa-star"></i>&nbsp;${noFavsAttr}</span></small>`);
        return;
    }

    buildAvatarList(container, favs, { interactable: true, highlightFavs: false });
}

function RA_checkOnlineStatus() {
    const isDisconnected = online_status === 'no_connection';
    const sendTextarea = document.getElementById('send_textarea');

    if (sendTextarea) {
        const attr = isDisconnected ? 'no_connection_text' : 'connected_text';
        sendTextarea.setAttribute('placeholder', sendTextarea.getAttribute(attr) ?? '');
    }

    const toggleClass = (id: string, className: string, force: boolean) => {
        document.getElementById(id)?.classList.toggle(className, force);
    };

    toggleClass('send_form', 'no-connection', isDisconnected);

    const apiStatus = document.getElementById('API-status-top');
    if (apiStatus) {
        apiStatus.classList.toggle('fa-plug', !isDisconnected);
        apiStatus.classList.toggle('fa-plug-circle-exclamation', isDisconnected);
        apiStatus.classList.toggle('redOverlayGlow', isDisconnected);
    }

    connection_made = !isDisconnected;

    if (isDisconnected) {
        toggleClass('send_but', 'displayNone', true);
        toggleClass('mes_continue', 'displayNone', true);
        toggleClass('mes_impersonate', 'displayNone', true);
    } else if (online_status !== undefined) {
        retry_delay = 100;
        const hideActionButtons = Boolean(is_send_press || (selected_group && is_group_generating));
        toggleClass('send_but', 'displayNone', hideActionButtons);
        toggleClass('mes_continue', 'displayNone', hideActionButtons);
        toggleClass('mes_impersonate', 'displayNone', hideActionButtons);
    }
}

/**
 * Builds a source-to-secret mapping from two objects that share property names.
 * By convention, a key in `sources` maps to the same key in `secrets`.
 * Exceptions (VERTEXAI's two-key auth, rev-proxy eligibility) are declared as
 * data in the options, so no provider name ever needs to be written inline.
 */
type BuildSourceMapOptions = {
    skip?: string[];
    revProxySources?: string[];
    isRevProxy?: boolean;
    overrides?: Record<string, (sourceValue: string, secrets: Record<string, string | undefined>) => string | undefined>;
};

function buildSourceMap(
    sources: Record<string, string>,
    secrets: Record<string, string | undefined>,
    options: BuildSourceMapOptions = {},
): [string, string | undefined, boolean?][] {
    const skip = new Set(options.skip ?? ['CUSTOM']);
    const revProxy = new Set(options.revProxySources ?? []);

    return (Object.entries(sources) as [string, string][])
        .filter(([key]) => !skip.has(key))
        .map(([key, source]): [string, string | undefined, boolean?] => {
            const secretKey = options.overrides?.[key]?.(source, secrets) ?? secrets[key];
            return [source, secretKey, revProxy.has(key) ? options.isRevProxy : undefined];
        });
}

function RA_autoconnect(PrevApi?: string) {
    if (SECRET_KEYS === undefined || online_status === undefined) {
        setTimeout(RA_autoconnect, 100);
        return;
    }

    if (online_status === 'no_connection' && power_user.auto_connect) {
        const state = secret_state as Record<string, unknown>;
        const getSecret = (key?: string) => key ? Boolean(state[key]) : false;

        switch (main_api) {
            case 'kobold':
                if (kai_settings.api_server && isValidUrl(kai_settings.api_server)) {
                    triggerClick('api_button');
                }
                break;
            case 'novel':
                if (getSecret(SECRET_KEYS.NOVEL)) {
                    triggerClick('api_button_novel');
                }
                break;
            case 'textgenerationwebui': {
                const textgenType = textgen_settings.type;
                const hasTypeSecret = (
                    (textgenType === textgen_types.MANCER && getSecret(SECRET_KEYS.MANCER)) ||
                    (textgenType === textgen_types.TOGETHERAI && getSecret(SECRET_KEYS.TOGETHERAI)) ||
                    (textgenType === textgen_types.INFERMATICAI && getSecret(SECRET_KEYS.INFERMATICAI)) ||
                    (textgenType === textgen_types.DREAMGEN && getSecret(SECRET_KEYS.DREAMGEN)) ||
                    (textgenType === textgen_types.OPENROUTER && getSecret(SECRET_KEYS.OPENROUTER)) ||
                    (textgenType === textgen_types.FEATHERLESS && getSecret(SECRET_KEYS.FEATHERLESS))
                );

                if (hasTypeSecret || isValidUrl(getTextGenServer())) {
                    triggerClick('api_button_textgenerationwebui');
                }
                break;
            }
            case 'openai': {
                const src = oai_settings.chat_completion_source;

                /**
                 * Builds the source-to-secret mapping for chat completion providers.
                 * Derives the mapping from shared property names between chat_completion_sources
                 * and SECRET_KEYS, so you never have to repeat a provider name.
                 */
                const sourceSecretMap = buildSourceMap(
                    chat_completion_sources as Record<string, string>,
                    SECRET_KEYS as Record<string, string | undefined>,
                    {
                        skip: ['CUSTOM'],
                        revProxySources: ['OPENAI', 'CLAUDE'],
                        isRevProxy: Boolean(oai_settings.reverse_proxy),
                        overrides: {
                            VERTEXAI: (_src, secrets) =>
                                oai_settings.vertexai_auth_mode === 'express'
                                    ? secrets.VERTEXAI
                                    : secrets.VERTEXAI_SERVICE_ACCOUNT,
                        },
                    },
                );

                const isCustomValid = src === chat_completion_sources.CUSTOM && isValidUrl(oai_settings.custom_url);
                const canConnect = isCustomValid || sourceSecretMap.some(([targetSrc, secretKey, allowFallback]) =>
                    src === targetSrc && (getSecret(secretKey) || Boolean(allowFallback))
                );

                if (canConnect) {
                    triggerClick('api_button_openai');
                }
                break;
            }
        }

        if (!connection_made) {
            retry_delay = Math.min(retry_delay * 2, 30000);
        }
    }
}

function OpenNavPanels() {
    if (isMobile()) return;

    const navPanels: [string, string, string][] = [
        ['NavLockOn', 'NavOpened', 'rightNavDrawerIcon'],
        ['LNavLockOn', 'LNavOpened', 'leftNavDrawerIcon'],
        ['WINavLockOn', 'WINavOpened', 'WIDrawerIcon'],
    ];

    for (let i = 0; i < navPanels.length; i++) {
        const [lockKey, openKey, iconId] = navPanels[i]!;
        if (accountStorage.getItem(lockKey) === 'true' && accountStorage.getItem(openKey) === 'true') {
            triggerClick(iconId);
        }
    }
}

const getUserInputKey = () => getCurrentUserHandle() + '_userInput';

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

function saveUserInput() {
    const el = document.getElementById('send_textarea') as HTMLTextAreaElement | null;
    const userInput = String(el?.value ?? '');
    localStorage.setItem(getUserInputKey(), userInput);
    console.debug('User Input -- ', userInput);
}
const saveUserInputDebounced = debounce(saveUserInput);

export function dragElement(elmnt: HTMLElement) {
    if (!elmnt) return;

    let actionType: string | null = null;
    let isMouseDown = false;

    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let height = 0, width = 0, top = 0, left = 0, right = 0, bottom = 0;
    let maxX = 0, maxY = 0, winHeight = 0, winWidth = 0;

    const elmntName = elmnt.id;

    function savePositionAndSize() {
        const state = power_user.movingUIState as Record<string, Record<string, unknown>>;
        if (!state[elmntName]) state[elmntName] = {};
        const elState = state[elmntName]!;
        elState.top = top;
        elState.left = left;
        elState.right = right;
        elState.bottom = bottom;
        elState.margin = 'unset';

        if (actionType === 'resize') {
            elState.width = width;
            elState.height = height;
            eventSource.emit('resizeUI', elmntName);
        }
        saveSettingsDebounced();
    }

    function clampToViewport() {
        if (top <= 0) {
            elmnt.style.setProperty('top', '0px', 'important');
        } else if (maxY >= winHeight) {
            elmnt.style.setProperty('top', `${winHeight - maxY + top - 1}px`, 'important');
        }

        if (left <= 0) {
            elmnt.style.setProperty('left', '0px', 'important');
        } else if (maxX >= winWidth) {
            elmnt.style.setProperty('left', `${winWidth - maxX + left - 1}px`, 'important');
        }
    }

    const dragObserver = new MutationObserver((mutations: MutationRecord[]) => {
        const target = mutations[0]!.target;
        if (!(target instanceof HTMLElement)) {
            dragObserver.disconnect();
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
            dragObserver.disconnect();
            return;
        }

        const style = getComputedStyle(target);
        height = parseInt(style.height, 10);
        width = parseInt(style.width, 10);
        top = parseInt(style.top, 10);
        left = parseInt(style.left, 10);
        right = parseInt(style.right, 10);
        bottom = parseInt(style.bottom, 10);
        maxX = width + left;
        maxY = height + top;
        winWidth = window.innerWidth;
        winHeight = window.innerHeight;

        const state = power_user.movingUIState as Record<string, Record<string, unknown>>;
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
                            elmnt.style.width = `${elmnt.offsetWidth}px`;
                            elmnt.style.height = `${elmnt.offsetWidth * imageAspectRatio}px`;
                        }
                        if (top + elmnt.offsetHeight >= winHeight) {
                            elmnt.style.setProperty('height', `${winHeight - top - 1}px`, 'important');
                            elmnt.style.setProperty('width', `${(winHeight - top - 1) / imageAspectRatio}px`, 'important');
                        }
                        if (left + elmnt.offsetWidth >= winWidth) {
                            elmnt.style.setProperty('width', `${winWidth - left - 1}px`, 'important');
                            elmnt.style.setProperty('height', `${(winWidth - left - 1) * imageAspectRatio}px`, 'important');
                        }
                    }
                }
            } else {
                if (top + elmnt.offsetHeight >= winHeight) elmnt.style.setProperty('height', `${winHeight - top - 1}px`, 'important');
                if (left + elmnt.offsetWidth >= winWidth) elmnt.style.setProperty('width', `${winWidth - left - 1}px`, 'important');
            }
            elmnt.style.setProperty('left', `${left}px`, 'important');
            elmnt.style.setProperty('top', `${top}px`, 'important');
        } else if (actionType === 'drag') {
            clampToViewport();
        }

        savePositionAndSize();
    });

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

    function elementDrag(e: MouseEvent) {
        const state = power_user.movingUIState as Record<string, Record<string, unknown>>;
        if (!state[elmntName]) state[elmntName] = {};
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        elmnt.setAttribute('data-dragged', 'true');
        const rect = elmnt.getBoundingClientRect();
        elmnt.style.setProperty('left', `${rect.left - pos1}px`, 'important');
        elmnt.style.setProperty('top', `${rect.top - pos2}px`, 'important');
        elmnt.style.setProperty('margin', 'unset', 'important');
        elmnt.style.setProperty('height', `${height}px`, 'important');
        elmnt.style.setProperty('width', `${width}px`, 'important');
    }

    function closeDragElement() {
        isMouseDown = false;
        actionType = null;
        document.removeEventListener('mouseup', closeDragElement);
        document.removeEventListener('mousemove', elementDrag);
        elmnt.setAttribute('data-dragged', 'false');
        dragObserver.disconnect();
        savePositionAndSize();
    }

    function onMouseUp() {
        isMouseDown = false;
        actionType = null;
        dragObserver.disconnect();
    }

    const elmntHeader = document.getElementById(`${elmntName}header`);
    if (elmntHeader) {
        elmntHeader.addEventListener('mousedown', (e: MouseEvent) => {
            if (e.target && (e.target as HTMLElement).classList.contains('drag-grabber')) {
                actionType = 'drag';
                isMouseDown = true;
                dragObserver.observe(elmnt, { attributes: true, attributeFilter: ['style'] });
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
            dragObserver.observe(elmnt, { attributes: true, attributeFilter: ['style'] });
        }
    });

    elmnt.addEventListener('mouseup', onMouseUp);
}

export async function initMovingUI() {
    if (!isMobile() && power_user.movingUI === true) {
        console.debug('START MOVING UI');
        const ids = ['sheld', 'left-nav-panel', 'right-nav-panel', 'WorldInfo', 'floatingPrompt', 'logprobsViewer', 'cfgConfig'];
        for (let i = 0; i < ids.length; i++) {
            const el = document.getElementById(ids[i]!);
            if (el) dragElement(el);
        }
    }
}

const sendTextArea = document.querySelector('#send_textarea') as HTMLTextAreaElement | null;
const chatBlock = document.getElementById('chat') as HTMLElement | null;
const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');

function autoFitSendTextArea() {
    if (!chatBlock || !sendTextArea) return;
    const originalScrollBottom = chatBlock.scrollHeight - (chatBlock.scrollTop + chatBlock.offsetHeight);

    sendTextArea.style.height = '1px';
    const newHeight = sendTextArea.scrollHeight;
    sendTextArea.style.height = `${newHeight}px`;

    if (!isFirefox) {
        chatBlock.scrollTop = chatBlock.scrollHeight - (chatBlock.offsetHeight + originalScrollBottom);
    }
}
export const autoFitSendTextAreaDebounced = debounce(autoFitSendTextArea, debounce_timeout.short);

// ---------------------------------------------------

export function initRossMods() {
    checkStatusDebounced();

    if (power_user.auto_load_chat) {
        RA_autoloadchat();
    }

    if (power_user.auto_connect) {
        RA_autoconnect();
    }

    document.getElementById('main_api')?.addEventListener('change', () => {
        const PrevAPI = main_api;
        setTimeout(() => RA_autoconnect(PrevAPI), 100);
    });

    document.getElementById('api_button')?.addEventListener('click', () => checkStatusDebounced());

    // Generic helper for side panel pins
    const setupPanelPin = (
        pinEl: HTMLInputElement,
        storageKey: string,
        panelEl: HTMLElement,
        iconEl: HTMLElement,
        toggleSelector: string
    ) => {
        const updateState = (isPinned: boolean) => {
            panelEl.classList.toggle('pinnedOpen', isPinned);
            iconEl.classList.toggle('drawerPinnedOpen', isPinned);
        };

        pinEl.addEventListener('click', () => {
            const isChecked = pinEl.checked;
            accountStorage.setItem(storageKey, isChecked);
            updateState(isChecked);

            if (!isChecked && panelEl.classList.contains('openDrawer') && document.querySelectorAll('.openDrawer').length > 1) {
                const toggle = document.querySelector(toggleSelector);
                if (toggle) doNavbarIconClick.call(toggle as HTMLElement);
            }
        });

        if (!isMobile()) {
            const isPinned = accountStorage.getItem(storageKey) === 'true';
            pinEl.checked = isPinned;
            if (isPinned) updateState(true);
        }
    };

    setupPanelPin(RPanelPin, 'NavLockOn', RightNavPanel, RightNavDrawerIcon, '#unimportantYes');
    setupPanelPin(LPanelPin, 'LNavLockOn', LeftNavPanel, LeftNavDrawerIcon, '#ai-config-button>.drawer-toggle');
    setupPanelPin(WIPanelPin, 'WINavLockOn', WorldInfo, WIDrawerIcon, '#WI-SP-button>.drawer-toggle');

    // Generic helper for recording drawer open/closed state
    const bindNavOpenState = (elementId: string, storageKey: string) => {
        document.getElementById(elementId)?.addEventListener('click', (e) => {
            const target = e.currentTarget as HTMLElement;
            const isClosed = !target.classList.contains('openIcon');
            accountStorage.setItem(storageKey, String(isClosed));
        });
    };

    bindNavOpenState('rightNavDrawerIcon', 'NavOpened');
    bindNavOpenState('leftNavDrawerIcon', 'LNavOpened');
    bindNavOpenState('WorldInfo', 'WINavOpened');

    setTimeout(() => { OpenNavPanels(); }, 300);

    SelectedCharacterTab?.addEventListener('click', () => { accountStorage.setItem('SelectedNavTab', 'rm_button_selected_ch'); });
    document.getElementById('rm_button_characters')?.addEventListener('click', () => { accountStorage.setItem('SelectedNavTab', 'rm_button_characters'); });

    // Delegated entity click helper
    const bindEntitySelect = (selector: string, isGroup: boolean) => {
        document.addEventListener('click', (event) => {
            if (!(event.target instanceof Element)) return;
            const el = event.target.closest(selector);
            if (!el) return;

            const id = el.getAttribute('data-chid') || (isGroup ? el.getAttribute('data-grid') : null);
            setActiveCharacter(isGroup ? null : id);
            setActiveGroup(isGroup ? id : null);
            saveSettingsDebounced();
        });
    };

    bindEntitySelect('.character_select', false);
    bindEntitySelect('.group_select', true);

    const cssAutofit = CSS.supports('field-sizing', 'content');

    if (cssAutofit && chatBlock) {
        let lastHeight = chatBlock.offsetHeight;
        const chatBlockResizeObserver = new ResizeObserver((entries: ResizeObserverEntry[]) => {
            for (let i = 0; i < entries.length; i++) {
                if (entries[i]!.target !== chatBlock) continue;

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

    // Swipe gestures
    const handleSwipe = (e: Event, selector: string) => {
        if (power_user.gestures === false || Popup.util.isPopupOpen()) return;
        if (!(e.target instanceof Element) || !e.target.closest('#sheld') || document.getElementById('curEditTextarea')) return;

        if (e.target.closest('.last_mes')) {
            const buttons = document.querySelectorAll(selector);
            const swipeBtn = buttons[buttons.length - 1] as HTMLElement | undefined;
            if (swipeBtn && swipeBtn.offsetParent !== null) {
                triggerClick(swipeBtn);
            }
        }
    };

    document.addEventListener('swiped-left', (e) => handleSwipe(e, '.swipe_right'));
    document.addEventListener('swiped-right', (e) => handleSwipe(e, '.swipe_left'));

    document.addEventListener('keydown', async (event: KeyboardEvent) => {
        await processHotkeys(event);
    });

    const hotkeyTargets = {
        send_textarea: sendTextArea,
        dialogue_popup_input: document.querySelector('#dialogue_popup_input'),
    };

    async function processHotkeys(event: KeyboardEvent) {
        if (Popup.util.isPopupOpen()) return;

        if (document.activeElement === hotkeyTargets.send_textarea) {
            if (!event.isComposing && !event.shiftKey && !event.ctrlKey && !event.altKey && event.key === 'Enter' && shouldSendOnEnter()) {
                event.preventDefault();
                sendTextareaMessage();
                return;
            }
        }

        if (document.activeElement === hotkeyTargets.dialogue_popup_input && !isMobile()) {
            if (!event.shiftKey && !event.ctrlKey && event.key === 'Enter') {
                event.preventDefault();
                triggerClick('dialogue_popup_ok');
                return;
            }
        }

        if (event.shiftKey && event.ctrlKey && event.key === 'ArrowUp') {
            event.preventDefault();
            const chatEl = document.getElementById('chat');
            const contextLine = document.querySelector('.lastInContext');
            if (chatEl && contextLine) {
                chatEl.scrollTo({
                    top: contextLine.getBoundingClientRect().top - chatEl.getBoundingClientRect().top + chatEl.scrollTop,
                    behavior: 'smooth',
                });
            } else if (typeof notyf !== 'undefined') {
                notyf.warning('Context line not found, send a message first!');
            }
            return;
        }

        if (event.shiftKey && event.ctrlKey && event.key === 'ArrowDown') {
            event.preventDefault();
            document.getElementById('chat')?.scrollTo({
                top: 999999,
                behavior: 'smooth',
            });
            return;
        }

        if ((event.altKey || (event.altKey && event.ctrlKey)) && event.key === 'Enter') {
            if (!is_send_press) {
                console.debug('Continuing with Alt+Enter');
                triggerClick('option_continue');
                return;
            }
        }

        if (event.ctrlKey && event.key === 'Enter') {
            const editMesDone = Array.from(document.querySelectorAll('.mes_edit_done')).find(e => (e as HTMLElement).offsetParent !== null) as HTMLElement;
            const reasoningMesDone = Array.from(document.querySelectorAll('.mes_reasoning_edit_done')).find(e => (e as HTMLElement).offsetParent !== null) as HTMLElement;

            if (editMesDone) {
                triggerClick(editMesDone);
            } else if (reasoningMesDone) {
                triggerClick(reasoningMesDone);
            } else {
                triggerClick('option_regenerate');
            }
        }
    }
}
