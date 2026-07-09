import {
    MarkdownIt,
    moment,
    DOMPurify,
    hljs,
    Handlebars,
    SVGInject,
    initLibraryShims,
    default as libs,
} from './lib.js';

import { humanizedDateTime, favsToHotswap, getMessageTimeStamp, dragElement, isMobile, initRossMods } from './scripts/RossAscends-mods.js';
import { userStatsHandler, statMesProcess, initStats } from './scripts/stats.js';
import {
    generateKoboldWithStreaming,
    kai_settings,
    loadKoboldSettings,
    getKoboldGenerationData,
    kai_flags,
    koboldai_settings,
    koboldai_setting_names,
    initKoboldSettings,
} from './scripts/kai-settings.js';

import {
    textgenerationwebui_settings as textgen_settings,
    loadTextGenSettings,
    generateTextGenWithStreaming,
    getTextGenGenerationData,
    textgen_types,
    parseTextgenLogprobs,
    parseTabbyLogprobs,
    initTextGenSettings,
} from './scripts/textgen-settings.js';

import {
    world_info,
    getWorldInfoPrompt,
    getWorldInfoSettings,
    setWorldInfoSettings,
    world_names,
    importEmbeddedWorldInfo,
    checkEmbeddedWorld,
    setWorldInfoButtonClass,
    wi_anchor_position,
    world_info_include_names,
    initWorldInfo,
    charUpdatePrimaryWorld,
    charSetAuxWorlds,
} from './scripts/world-info.js';

import {
    groups,
    selected_group,
    saveGroupChat,
    getGroups,
    generateGroupWrapper,
    is_group_generating,
    resetSelectedGroup,
    select_group_chats,
    regenerateGroup,
    // @ts-expect-error TS(7034) FIXME: Variable 'group_generation_id' implicitly has type... Remove this comment to see the full error message
    group_generation_id,
    getGroupChat,
    renameGroupMember,
    createNewGroupChat,
    getGroupAvatar,
    deleteGroupChat,
    renameGroupChat,
    importGroupChat,
    getGroupBlock,
    getGroupCharacterCardsLazy,
    getGroupDepthPrompts,
} from './scripts/group-chats.js';

import {
    collapseNewlines,
    loadPowerUserSettings,
    playMessageSound,
    fixMarkdown,
    power_user,
    persona_description_positions,
    loadMovingUIState,
    getCustomStoppingStrings,
    MAX_CONTEXT_DEFAULT,
    MAX_RESPONSE_DEFAULT,
    renderStoryString,
    sortEntitiesList,
    registerDebugFunction,
    flushEphemeralStoppingStrings,
    resetMovableStyles,
    forceCharacterEditorTokenize,
    applyPowerUserSettings,
    generatedTextFiltered,
    applyStylePins,
} from './scripts/power-user.js';

import {
    setOpenAIMessageExamples,
    setOpenAIMessages,
    setupChatCompletionPromptManager,
    prepareOpenAIMessages,
    sendOpenAIRequest,
    loadOpenAISettings,
    oai_settings,
    openai_messages_count,
    chat_completion_sources,
    getChatCompletionModel,
    proxies,
    loadProxyPresets,
    selected_proxy,
    initOpenAI,
} from './scripts/openai.js';

import {
    generateNovelWithStreaming,
    getNovelGenerationData,
    getKayraMaxContextTokens,
    loadNovelSettings,
    nai_settings,
    adjustNovelInstructionPrompt,
    parseNovelAILogprobs,
    novelai_settings,
    novelai_setting_names,
    initNovelAISettings,
} from './scripts/nai-settings.js';

import {
    initBookmarks,
    showBookmarksButtons,
    updateBookmarkDisplay,
} from './scripts/bookmarks.js';

import {
    horde_settings,
    loadHordeSettings,
    generateHorde,
    getStatusHorde,
    getHordeModels,
    adjustHordeGenerationParams,
    isHordeGenerationNotAllowed,
    MIN_LENGTH,
    initHorde,
} from './scripts/horde.js';

import {
    debounce,
    delay,
    trimToEndSentence,
    countOccurrences,
    isOdd,
    sortMoments,
    timestampToMoment,
    download,
    isDataURL,
    getCharaFilename,
    PAGINATION_TEMPLATE,
    waitUntilCondition,
    escapeRegex,
    resetScrollHeight,
    onlyUnique,
    getBase64Async,
    humanFileSize,
    Stopwatch,
    isValidUrl,
    ensureImageFormatSupported,
    flashHighlight,
    toggleDrawer,
    isElementInViewport,
    copyText,
    escapeHtml,
    saveBase64AsFile,
    uuidv4,
    equalsIgnoreCaseAndAccents,
    localizePagination,
    renderPaginationDropdown,
    paginationDropdownChangeHandler,
    importFromExternalUrl,
    shiftUpByOne,
    shiftDownByOne,
    canUseNegativeLookbehind,
    trimSpaces,
    clamp,
    shakeElement,
    createTimeout,
} from './scripts/utils.js';
import { debounce_timeout, GENERATION_TYPE_TRIGGERS, IGNORE_SYMBOL, inject_ids, MEDIA_DISPLAY, MEDIA_SOURCE, MEDIA_TYPE, OVERSWIPE_BEHAVIOR, SCROLL_BEHAVIOR, SWIPE_DIRECTION, SWIPE_SOURCE, SWIPE_STATE } from './scripts/constants.js';

import { cancelDebouncedMetadataSave, doDailyExtensionUpdatesCheck, extension_settings, initExtensions, loadExtensionSettings, runGenerationInterceptors } from './scripts/extensions.js';
import { COMMENT_NAME_DEFAULT, CONNECT_API_MAP, executeSlashCommandsOnChatInput, initDefaultSlashCommands, initSlashCommandAutoComplete, isExecutingCommandsFromChatInput, pauseScriptExecution, stopScriptExecution, UNIQUE_APIS } from './scripts/slash-commands.js';
import { initMacroAutoComplete } from './scripts/autocomplete/MacroAutoComplete.js';
import {
    tag_map,
    // @ts-expect-error TS(7034) FIXME: Variable 'tags' implicitly has type 'any[]' in som... Remove this comment to see the full error message
    tags,
    filterByTagState,
    isBogusFolder,
    isBogusFolderOpen,
    chooseBogusFolder,
    getTagBlock,
    loadTagsSettings,
    printTagFilters,
    getTagKeyForEntity,
    printTagList,
    createTagMapFromList,
    renameTagKey,
    importTags,
    tag_filter_type,
    compareTagsForSort,
    initTags,
    applyTagsOnCharacterSelect,
    applyTagsOnGroupSelect,
    tag_import_setting,
    applyCharacterTagsToMessageDivs,
} from './scripts/tags.js';
import { checkOpenRouterAuth, initSecrets, readSecretState } from './scripts/secrets.js';
import { processMarkdownExclusions } from './scripts/markdown-exclusion.js';
import { processMarkdownUnderscores } from './scripts/markdown-underscore.js';
import { NOTE_MODULE_NAME, initAuthorsNote, metadata_keys, setFloatingPrompt, shouldWIAddPrompt } from './scripts/authors-note.js';
import { registerPromptManagerMigration } from './scripts/PromptManager.js';
import { getRegexedString, regex_placement } from './scripts/extensions/regex/engine.js';
import { initLogprobs, saveLogprobsForActiveMessage } from './scripts/logprobs.js';
import { FILTER_STATES, FILTER_TYPES, FilterHelper, isFilterState } from './scripts/filters.js';
import { getCfgPrompt, getGuidanceScale, initCfg } from './scripts/cfg-scale.js';
import {
    force_output_sequence,
    formatInstructModeChat,
    formatInstructModePrompt,
    formatInstructModeExamples,
    formatInstructModeStoryString,
    getInstructStoppingSequences,
} from './scripts/instruct-mode.js';
import { initLocales, t } from './scripts/i18n.js';
import { getFriendlyTokenizerName, getTokenCount, getTokenCountAsync, initTokenizers, saveTokenCache } from './scripts/tokenizers.js';
import {
    user_avatar,
    getUserAvatars,
    getUserAvatar,
    setUserAvatar,
    initPersonas,
    setPersonaDescription,
    initUserAvatar,
    updatePersonaConnectionsAvatarList,
    isPersonaPanelOpen,
} from './scripts/personas.js';
import { getBackgrounds, initBackgrounds, loadBackgroundSettings, background_settings } from './scripts/backgrounds.js';
import { loader } from './scripts/action-loader.js';
import { BulkEditOverlay } from './scripts/BulkEditOverlay.js';
import { initTextGenModels } from './scripts/textgen-models.js';
import { appendFileContent, hasPendingFileAttachment, populateFileAttachment, decodeStyleTags, encodeStyleTags, isExternalMediaAllowed, preserveNeutralChat, restoreNeutralChat, formatCreatorNotes, initChatUtilities, addDOMPurifyHooks } from './scripts/chats.js';
import { getPresetManager, initPresetManager } from './scripts/preset-manager.js';
import { evaluateMacros, getLastMessageId, initMacros } from './scripts/macros.js';
import { currentUser, setUserControls } from './scripts/user.js';
import { POPUP_RESULT, POPUP_TYPE, Popup, callGenericPopup, fixToastrForDialogs } from './scripts/popup.js';
import { renderTemplate, renderTemplateAsync } from './scripts/templates.js';
import { initScrapers } from './scripts/scrapers.js';
import { initCustomSelectedSamplers, validateDisabledSamplers } from './scripts/samplerSelect.js';
import { DragAndDropHandler } from './scripts/dragdrop.js';
import { INTERACTABLE_CONTROL_CLASS, initKeyboard } from './scripts/keyboard.js';
import { initDynamicStyles } from './scripts/dynamic-styles.js';
import { initInputMarkdown } from './scripts/input-md-formatting.js';
import { AbortReason } from './scripts/util/AbortReason.js';
import { initSystemPrompts } from './scripts/sysprompt.js';
import { registerExtensionSlashCommands as initExtensionSlashCommands } from './scripts/extensions-slashcommands.js';
import { ToolManager } from './scripts/tool-calling.js';
// @ts-expect-error TS(2792) FIXME: Cannot find module 'markdown-it-emoji'. Did you me... Remove this comment to see the full error message
import { full as markdownitEmoji } from 'markdown-it-emoji';
// @ts-expect-error TS(2792) FIXME: Cannot find module 'markdown-it-ins'. Did you mean... Remove this comment to see the full error message
import markdownitIns from 'markdown-it-ins';
import { applyBrowserFixes } from './scripts/browser-fixes.js';
import { initServerHistory } from './scripts/server-history.js';
import { initSettingsSearch } from './scripts/setting-search.js';
import { initBulkEdit } from './scripts/bulk-edit.js';
import { getContext } from './scripts/st-context.js';
import { extractReasoningFromData, extractReasoningSignatureFromData, initReasoning, parseReasoningInSwipes, PromptReasoning, ReasoningHandler, removeReasoningFromString, updateReasoningUI } from './scripts/reasoning.js';
import { accountStorage } from './scripts/util/AccountStorage.js';
import { initWelcomeScreen, openPermanentAssistantChat, openPermanentAssistantCard, getPermanentAssistantAvatar } from './scripts/welcome-screen.js';
import { initDataMaid } from './scripts/data-maid.js';
import { clearItemizedPrompts, deleteItemizedPromptForMessage, deleteItemizedPrompts, findItemizedPromptSet, initItemizedPrompts, itemizedParams, itemizedPrompts, loadItemizedPrompts, promptItemize, replaceItemizedPromptText, saveItemizedPrompts, swapItemizedPrompts } from './scripts/itemized-prompts.js';
import { getSystemMessageByType, initSystemMessages, SAFETY_CHAT, sendSystemMessage, system_message_types, system_messages } from './scripts/system-messages.js';
import { event_types, eventSource } from './scripts/events.js';
import { initAccessibility } from './scripts/a11y.js';
import { applyStreamFadeIn } from './scripts/util/stream-fadein.js';
import { initDomHandlers } from './scripts/dom-handlers.js';
import { SimpleMutex } from './scripts/util/SimpleMutex.js';
import { AudioPlayer } from './scripts/audio-player.js';
import { MacroEnvBuilder } from './scripts/macros/engine/MacroEnvBuilder.js';
import { MacroEngine } from './scripts/macros/engine/MacroEngine.js';
import { addChatBackupsBrowser } from './scripts/chat-backups.js';
import { onboardingExperimentalMacroEngine } from './scripts/macros/engine/MacroDiagnostics.js';
import { compressRequest, setRequestCompressionConfig } from './scripts/request-compression.js';
import { canJumpToSwipeForMessage, canOpenSwipePickerForMessage, initSwipePicker } from './scripts/swipe-picker.js';
import { range } from 'es-toolkit';

// API OBJECT FOR EXTERNAL WIRING
globalThis.SillyTavern = {
    libs,
    // @ts-expect-error TS(2322) FIXME: Type '() => { accountStorage: AccountStorage; chat... Remove this comment to see the full error message
    getContext,
};

export {
    user_avatar,
    setUserAvatar,
    getUserAvatars,
    getUserAvatar,
    nai_settings,
    isOdd,
    countOccurrences,
    renderTemplate,
    promptItemize,
    itemizedPrompts,
    saveItemizedPrompts,
    loadItemizedPrompts,
    itemizedParams,
    clearItemizedPrompts,
    replaceItemizedPromptText,
    deleteItemizedPrompts,
    findItemizedPromptSet,
    koboldai_settings,
    koboldai_setting_names,
    novelai_settings,
    novelai_setting_names,
    UNIQUE_APIS,
    CONNECT_API_MAP,
    system_messages,
    system_message_types,
    sendSystemMessage,
    getSystemMessageByType,
    event_types,
    eventSource,
    /** @deprecated Use setCharacterSettingsOverrides instead. */
    setCharacterSettingsOverrides as setScenarioOverride,
    /** @deprecated Use appendMediaToMessage instead. */
    appendMediaToMessage as appendImageToMessage,
    /** @deprecated Use getMaxPromptTokens instead. */
    getMaxPromptTokens as getMaxContextSize,
};

/**
 * Wait for page to load before continuing the app initialization.
 */
await new Promise((resolve) => {
    if (document.readyState === 'complete') {
        // @ts-expect-error TS(2794) FIXME: Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
        resolve();
    } else {
        window.addEventListener('load', resolve);
    }
});

// Configure toast library:
// @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
toastr.options = {
    positionClass: 'toast-top-center',
    closeButton: false,
    progressBar: false,
    showDuration: 250,
    hideDuration: 250,
    timeOut: 4000,
    extendedTimeOut: 10000,
    showEasing: 'linear',
    hideEasing: 'linear',
    showMethod: 'fadeIn',
    hideMethod: 'fadeOut',
    escapeHtml: true,
    onHidden: function () {
        // If we have any dialog still open, the last "hidden" toastr will remove the toastr-container. We need to keep it alive inside the dialog though
        // so the toasts still show up inside there.
        fixToastrForDialogs();
    },
};

// Run once during startup
// @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
toastr.subscribe(function (args) {
    if (args.state !== 'visible') {
        return;
    }

    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
    const $container = toastr.getContainer(args.options, false);
    if (!$container || !$container.length) {
        return;
    }

    // toastr has already inserted the element at this point
    const $toast = args.options.newestOnTop
        ? $container.children().first()
        : $container.children().last();

    // Meaning of "clickable":
    // Interactable unless tapToDismiss was explicitly false
    const isInteractable = args.options.tapToDismiss !== false;
    $toast.toggleClass('interactable', isInteractable);
    if (isInteractable) {
        $toast.attr('title', t`Tap to close`);
    } else {
        $toast.removeAttr('title');
        $toast.addClass('toast-non-interactable');
    }
});

export const characterGroupOverlay = new BulkEditOverlay();

// Markdown converter
// @ts-expect-error TS(7005) FIXME: Variable 'mesForMarkdownParse' implicitly has an '... Remove this comment to see the full error message
export let mesForMarkdownParse; //intended to be used as a context to compare markdown strings against
/** @type {import('markdown-it')} */
// @ts-expect-error TS(7005) FIXME: Variable 'converter' implicitly has an 'any' type.
export let converter;

// array for prompt token calculations

export const systemUserName = 'SillyTavern System';
export const neutralCharacterName = 'Assistant';
const default_user_name = 'User';
export let name1 = default_user_name;
export let name2 = systemUserName;
/** @type {ChatMessage[]} */
export const chat = [];

/**
 * @type {import('./scripts/constants.js').SWIPE_STATE}
 */
export let swipeState = SWIPE_STATE.NONE;
// @ts-expect-error TS(7034) FIXME: Variable 'chatSaveTimeout' implicitly has type 'an... Remove this comment to see the full error message
let chatSaveTimeout;
// @ts-expect-error TS(7034) FIXME: Variable 'importFlashTimeout' implicitly has type ... Remove this comment to see the full error message
let importFlashTimeout;
export let isChatSaving = false;
let firstRun = false;
export let settingsReady = false;
let currentVersion = '0.0.0';
export let displayVersion = 'SillyTavern';

let generation_started = new Date();
/** @type {Character[]} */
export const characters: Character[] = [];
/**
 * Stringified index of a currently chosen entity in the characters array.
 * @type {string|undefined} Yes, we hate it as much as you do.
 */
// @ts-expect-error TS(7005) FIXME: Variable 'this_chid' implicitly has an 'any' type.
export let this_chid;
let saveCharactersPage = 0;
export const default_avatar = 'img/ai4.png';
export const system_avatar = 'img/five.png';
export const comment_avatar = 'img/quill.png';
export const default_user_avatar = 'img/user-default.png';
export let CLIENT_VERSION = 'SillyTavern:UNKNOWN:Cohee#1207'; // For Horde header


// Saved here for performance reasons
// @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
const messageTemplate = $('#message_template .mes');
// @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
export const chatElement = $('#chat');

// @ts-expect-error TS(7034) FIXME: Variable 'dialogueResolve' implicitly has type 'an... Remove this comment to see the full error message
let dialogueResolve = null;
let dialogueCloseStop = false;
/** @type {ChatMetadata} */
export let chat_metadata: ChatMetadata = {};
/** @type {StreamingProcessor} */
export let streamingProcessor = null;
// @ts-expect-error TS(7034) FIXME: Variable 'crop_data' implicitly has type 'any' in ... Remove this comment to see the full error message
let crop_data = undefined;
let is_delete_mode = false;
let fav_ch_checked = false;
let scrollLock = false;
export let abortStatusCheck = new AbortController();
export let charDragDropHandler = null;
export let chatDragDropHandler = null;

/** @type {debounce_timeout} The debounce timeout used for chat/settings save. debounce_timeout.long: 1.000 ms */
export const DEFAULT_SAVE_EDIT_TIMEOUT = debounce_timeout.relaxed;
/** @type {debounce_timeout} The debounce timeout used for printing. debounce_timeout.quick: 100 ms */
export const DEFAULT_PRINT_TIMEOUT = debounce_timeout.quick;

export const saveSettingsDebounced = debounce((loopCounter = 0) => saveSettings(loopCounter), DEFAULT_SAVE_EDIT_TIMEOUT);
// @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
export const saveCharacterDebounced = debounce(() => $('#create_button').trigger('click'), DEFAULT_SAVE_EDIT_TIMEOUT);

/**
 * Prints the character list in a debounced fashion without blocking, with a delay of 100 milliseconds.
 * Use this function instead of a direct `printCharacters()` whenever the reprinting of the character list is not the primary focus.
 *
 * The printing will also always reprint all filter options of the global list, to keep them up to date.
 */
export const printCharactersDebounced = debounce(() => { printCharacters(false); }, DEFAULT_PRINT_TIMEOUT);

/**
 * @enum {number} Extension prompt types
 */
export const extension_prompt_types = {
    NONE: -1,
    IN_PROMPT: 0,
    IN_CHAT: 1,
    BEFORE_PROMPT: 2,
};

/**
 * @enum {number} Extension prompt roles
 */
export const extension_prompt_roles = {
    SYSTEM: 0,
    USER: 1,
    ASSISTANT: 2,
};

export const MAX_INJECTION_DEPTH = 10000;

/**
 *
 */
async function getClientVersion() {
    try {
        const response = await fetch('/version');
        const data = await response.json();
        CLIENT_VERSION = data.agent;
        displayVersion = `SillyTavern ${data.pkgVersion}`;
        currentVersion = data.pkgVersion;

        if (data.gitRevision && data.gitBranch) {
            displayVersion += ` '${data.gitBranch}' (${data.gitRevision})`;
        }

        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#version_display').text(displayVersion);
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#version_display_welcome').text(displayVersion);
    } catch (err) {
        console.error('Couldn\'t get client version', err);
    }
}

/**
 *
 */
export function reloadMarkdownProcessor() {
    converter = new MarkdownIt({
        html: true,
        breaks: true,
        linkify: false,
        typographer: false,
    });

    converter.use(markdownitEmoji);
    converter.use(markdownitIns);

    return converter;
}

/**
 *
 */
export function getCurrentChatId() {
    if (selected_group) {
        return groups.find(x => x.id == selected_group)?.chat_id;
    } else if (this_chid !== undefined) {
        return characters[this_chid]?.chat;
    }
}

export const talkativeness_default = 0.5;
export const depth_prompt_depth_default = 4;
export const depth_prompt_role_default = 'system';
const per_page_default = 50;

let is_advanced_char_open = false;

/**
 * The type of the right menu
 * @typedef {'characters' | 'character_edit' | 'create' | 'group_edit' | 'group_create' | '' } MenuType
 */

/**
 * The type of the right menu that is currently open
 * @type {MenuType}
 */
export let menu_type = '';

export let selected_button = ''; //which button pressed

//create pole save
export const create_save = {
    name: '',
    description: '',
    creator_notes: '',
    post_history_instructions: '',
    character_version: '',
    system_prompt: '',
    tags: '',
    creator: '',
    personality: '',
    first_message: '',
    /** @type {FileList|null} */
    avatar: null,
    scenario: '',
    mes_example: '',
    world: '',
    talkativeness: talkativeness_default,
    alternate_greetings: [],
    depth_prompt_prompt: '',
    depth_prompt_depth: depth_prompt_depth_default,
    depth_prompt_role: depth_prompt_role_default,
    extensions: {},
    extra_books: [],
};

//animation right menu
export const ANIMATION_DURATION_DEFAULT = 125;
export let animation_duration = ANIMATION_DURATION_DEFAULT;
export const animation_easing = 'ease-in-out';
let popup_type = '';
let chat_file_for_del = '';
export let online_status = 'no_connection';

export let is_send_press = false; //Send generation
export const isGenerating = () => (is_send_press || is_group_generating);

let this_del_mes = -1;

/** @type {string} */
let this_edit_mes_chname = '';
/** @type {number|undefined} */
// @ts-expect-error TS(7034) FIXME: Variable 'this_edit_mes_id' implicitly has type 'a... Remove this comment to see the full error message
let this_edit_mes_id = undefined;

//settings
// @ts-expect-error TS(7005) FIXME: Variable 'settings' implicitly has an 'any' type.
export let settings;
export let amount_gen = 80; //default max length of AI generated responses
export let max_context = 2048;

/** User preference for swipeable messages */
let swipes = true;
/** Forcefully hide swipes. */
export let swipesHidden = false;
/** @type {{ now: number, direction: string }} */
export let lastSwipeInfo = { now: performance.now(), direction: SWIPE_DIRECTION.RIGHT };
export let recentSwipes = 0;

export let extension_prompts = {};

// @ts-expect-error TS(7005) FIXME: Variable 'main_api' implicitly has an 'any' type.
export let main_api;// = "kobold";
let abortController = new AbortController();

//css
// @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
const css_send_form_display = $('<div id=send_form></div>').css('display');

let kobold_horde_model = '';

// @ts-expect-error TS(7005) FIXME: Variable 'token' implicitly has an 'any' type.
export let token;


/** The tag of the active character. (NOT the id) */
export let active_character = '';
/** The tag of the active group. (Coincidentally also the id) */
export let active_group = '';

export const entitiesFilter = new FilterHelper(printCharactersDebounced);

/**
 *
 * @param root0
 * @param root0.omitContentType
 */
export function getRequestHeaders({ omitContentType = false } = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token,
    };

    if (omitContentType) {
        // @ts-expect-error TS(2790) FIXME: The operand of a 'delete' operator must be optiona... Remove this comment to see the full error message
        delete headers['Content-Type'];
    }

    return headers;
}

/**
 *
 */
export function getSlideToggleOptions() {
    return {
        miliseconds: animation_duration * 1.5,
        transitionFunction: animation_duration > 0 ? 'ease-in-out' : 'step-start',
    };
}

// @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
$.ajaxPrefilter((options, originalOptions, xhr) => {
    xhr.setRequestHeader('X-CSRF-Token', token);
});

/**
 * Pings the STserver to check if it is reachable.
 * @returns {Promise<boolean>} True if the server is reachable, false otherwise.
 */
export async function pingServer() {
    try {
        const result = await fetch('api/ping', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (!result.ok) {
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error pinging server', error);
        return false;
    }
}

//MARK: firstLoadInit
/**
 *
 */
async function firstLoadInit() {
    try {
        const tokenResponse = await fetch('/csrf-token');
        const tokenData = await tokenResponse.json();
        token = tokenData.token;
    } catch {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`Couldn't get CSRF token. Please refresh the page.`, t`Error`, { timeOut: 0, extendedTimeOut: 0, preventDuplicates: true });
        throw new Error('Initialization failed');
    }

    try {
        const initLoaderOverlay = loader.createOverlay();
        initLoaderOverlay.classList.add('splash-screen');

        const splashLogo = document.createElement('img');
        splashLogo.src = '/img/logo.png';
        splashLogo.alt = 'SillyTavern';
        splashLogo.className = 'splash-logo';
        splashLogo.ariaLabel = t`SillyTavern Logo`;

        const splashMessage = document.createElement('h2');
        splashMessage.className = 'splash-message';
        splashMessage.textContent = t`Initializing…`;
        splashMessage.dataset.i18n = 'Initializing…';

        initLoaderOverlay.prepend(splashLogo);
        initLoaderOverlay.appendChild(splashMessage);

        const initLoaderHandle = loader.show({
            slug: 'app-init',
            toastMode: loader.ToastMode.NONE,
            overlayContent: initLoaderOverlay,
        });

        registerPromptManagerMigration();
        initDomHandlers();
        initStandaloneMode();
        initLibraryShims();
        addDOMPurifyHooks();
        reloadMarkdownProcessor();
        applyBrowserFixes();
        await getClientVersion();
        await initSecrets();
        await readSecretState();
        await initLocales();
        initChatUtilities();
        initDefaultSlashCommands();
        initTextGenModels();
        initOpenAI();
        initTextGenSettings();
        initKoboldSettings();
        initNovelAISettings();
        initSystemPrompts();
        await initExtensions();
        initExtensionSlashCommands();
        ToolManager.initToolSlashCommands();
        await initPresetManager();
        await initSystemMessages();
        // @ts-expect-error TS(2345) FIXME: Argument of type 'ActionLoaderHandle' is not assig... Remove this comment to see the full error message
        await getSettings(initLoaderHandle);
        await checkOpenRouterAuth();
        initKeyboard();
        initDynamicStyles();
        initTags();
        initBookmarks();
        await getUserAvatars(true, user_avatar);
        await getCharacters();
        await getBackgrounds();
        await initTokenizers();
        initBackgrounds();
        initAuthorsNote();
        await initPersonas();
        await initSlashCommandAutoComplete();
        initMacroAutoComplete();
        initWorldInfo();
        initHorde();
        initRossMods();
        initStats();
        initCfg();
        initLogprobs();
        initInputMarkdown();
        initServerHistory();
        initSettingsSearch();
        initBulkEdit();
        initReasoning();
        initWelcomeScreen();
        await initScrapers();
        initCustomSelectedSamplers();
        initDataMaid();
        initItemizedPrompts();
        initAccessibility();
        initSwipePicker();
        addDebugFunctions();
        doDailyExtensionUpdatesCheck();
        await eventSource.emit(event_types.APP_INITIALIZED);
        await initLoaderHandle.hide();
        await fixViewport();
        await eventSource.emit(event_types.APP_READY);
    } catch (error) {
        console.error('Critical error during firstLoadInit:', error);
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`An error occurred during initialization. Check console for details.`, t`Init Error`);
    }
}

/**
 *
 */
async function fixViewport() {
    document.body.style.position = 'absolute';
    await delay(1);
    document.body.style.position = '';
}

/**
 *
 */
function initStandaloneMode() {
    const isPwaMode = window.matchMedia('(display-mode: standalone)').matches;
    if (isPwaMode) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('body').addClass('PWA');
    }
}

/**
 *
 * @param reason
 */
export function cancelStatusCheck(reason = 'Manually cancelled status check') {
    abortStatusCheck?.abort(new AbortReason(reason));
    abortStatusCheck = new AbortController();
    setOnlineStatus('no_connection');
}

/**
 *
 */
export function displayOnlineStatus() {
    if (online_status == 'no_connection') {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('.online_status_indicator').removeClass('success');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('.online_status_text').text($('#API-status-top').attr('no_connection_text'));
    } else {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('.online_status_indicator').addClass('success');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('.online_status_text').text(online_status);
    }
}

/**
 * Sets the duration of JS animations.
 * @param {number} ms Duration in milliseconds. Resets to default if null.
 */
export function setAnimationDuration(ms = null) {
    animation_duration = ms ?? ANIMATION_DURATION_DEFAULT;
    // Set CSS variable to document
    document.documentElement.style.setProperty('--animation-duration', `${animation_duration}ms`);
}

/**
 * Sets the currently active character
 * @param {object|number|string} [entityOrKey] - An entity with id property (character, group, tag), or directly an id or tag key. If not provided, the active character is reset to `null`.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'entityOrKey' implicitly has an 'any' ty... Remove this comment to see the full error message
export function setActiveCharacter(entityOrKey) {
    active_character = entityOrKey ? getTagKeyForEntity(entityOrKey) : null;
    // @ts-expect-error TS(2322) FIXME: Type 'null' is not assignable to type 'string'.
    if (active_character) active_group = null;
}

/**
 * Sets the currently active group.
 * @param {object|number|string} [entityOrKey] - An entity with id property (character, group, tag), or directly an id or tag key. If not provided, the active group is reset to `null`.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'entityOrKey' implicitly has an 'any' ty... Remove this comment to see the full error message
export function setActiveGroup(entityOrKey) {
    active_group = entityOrKey ? getTagKeyForEntity(entityOrKey) : null;
    // @ts-expect-error TS(2322) FIXME: Type 'null' is not assignable to type 'string'.
    if (active_group) active_character = null;
}

/**
 *
 */
export function startStatusLoading() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('.api_loading').show();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('.api_button').addClass('disabled');
}

/**
 *
 */
export function stopStatusLoading() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('.api_loading').hide();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('.api_button').removeClass('disabled');
}

/**
 *
 */
export function resultCheckStatus() {
    displayOnlineStatus();
    stopStatusLoading();
}

/**
 * Switches the currently selected character to the one with the given ID. (character index, not the character key!)
 *
 * If the character ID doesn't exist, if the chat is being saved, or if a group is being generated, this function does nothing.
 * If the character is different from the currently selected one, it will clear the chat and reset any selected character or group.
 * @param {number} id The ID of the character to switch to.
 * @param {object} [options] Options for the switch.
 * @param {boolean} [options.switchMenu] Whether to switch the right menu to the character edit menu if the character is already selected.
 * @returns {Promise<void>} A promise that resolves when the character is switched.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'id' implicitly has an 'any' type.
export async function selectCharacterById(id, { switchMenu = true } = {}) {
    if (characters[id] === undefined) {
        return;
    }

    if (isChatSaving) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info(t`Please wait until the chat is saved before switching characters.`, t`Your chat is still saving...`);
        return;
    }

    if (selected_group && is_group_generating) {
        return;
    }

    if (selected_group || String(this_chid) !== String(id)) {
        //if clicked on a different character from what was currently selected
        if (!is_send_press) {
            setCharacterId(undefined);
            setCharacterName('');
            resetSelectedGroup();
            await clearChat({ clearData: true });
            cancelTtsPlay();
            this_edit_mes_id = undefined;
            selected_button = 'character_edit';
            setCharacterId(id);
            chat_metadata = {};
            await getChat();
        }
    } else {
        //if clicked on character that was already selected
        if (switchMenu) selected_button = 'character_edit';
        await unshallowCharacter(this_chid);
        select_selected_character(this_chid, { switchMenu });
    }
}

/**
 *
 */
function getBackBlock() {
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    const template = document.querySelector('#bogus_folder_back_template .bogus_folder_select').cloneNode(true);
    return template;
}

/**
 *
 */
async function getEmptyBlock() {
    const icons = ['fa-dragon', 'fa-otter', 'fa-kiwi-bird', 'fa-crow', 'fa-frog'];
    const texts = [t`Here be dragons`, t`Otterly empty`, t`Kiwibunga`, t`Pump-a-Rum`, t`Croak it`];
    const roll = new Date().getMinutes() % icons.length;
    const params = {
        text: texts[roll],
        icon: icons[roll],
    };
    const html = await renderTemplateAsync('emptyBlock', params);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    return wrapper.firstElementChild;
}

/**
 * @param {number} hidden Number of hidden characters
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'hidden' implicitly has an 'any' type.
async function getHiddenBlock(hidden) {
    const params = {
        text: (hidden > 1 ? t`${hidden} characters hidden.` : t`${hidden} character hidden.`),
    };
    const html = await renderTemplateAsync('hiddenBlock', params);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    return wrapper.firstElementChild;
}

/**
 *
 * @param item
 * @param id
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'item' implicitly has an 'any' type.
function getCharacterBlock(item, id) {
    let this_avatar = default_avatar;
    if (item.avatar != 'none') {
        this_avatar = getThumbnailUrl('avatar', item.avatar);
    }
    // Populate the template
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const $templateClone = $(document.querySelector('#character_template .character_select').cloneNode(true));
    $templateClone.attr({ 'data-chid': id, 'id': `CharID${id}` });
    $templateClone.find('img').attr('src', this_avatar).attr('alt', item.name);
    $templateClone.find('.avatar').attr('title', `[Character] ${item.name}\nFile: ${item.avatar}`);
    $templateClone.find('.ch_name').text(item.name).attr('title', `[Character] ${item.name}`);
    if (power_user.show_card_avatar_urls) {
        $templateClone.find('.ch_avatar_url').text(item.avatar);
    }
    $templateClone.find('.ch_fav_icon').css('display', 'none');
    $templateClone.toggleClass('is_fav', item.fav || item.fav == 'true');
    $templateClone.find('.ch_fav').val(item.fav);

    const isAssistant = item.avatar === getPermanentAssistantAvatar();
    if (!isAssistant) {
        $templateClone.find('.ch_assistant')[0]?.remove();
    }

    const description = item.data?.creator_notes || '';
    if (description) {
        $templateClone.find('.ch_description').text(description);
    } else {
        $templateClone.find('.ch_description').hide();
    }

    const auxFieldName = power_user.aux_field || 'character_version';
    const auxFieldValue = (item.data && item.data[auxFieldName]) || '';
    if (auxFieldValue) {
        $templateClone.find('.character_version').text(auxFieldValue);
    } else {
        $templateClone.find('.character_version').hide();
    }

    // Display inline tags
    const tagsElement = $templateClone.find('.tags');
    printTagList(tagsElement, { forEntityOrKey: id, tagOptions: { isCharacterList: true } });

    // Add to the list
    return $templateClone[0];
}

/**
 * Prints the global character list, optionally doing a full refresh of the list
 * Use this function whenever the reprinting of the character list is the primary focus, otherwise using `printCharactersDebounced` is preferred for a cleaner, non-blocking experience.
 *
 * The printing will also always reprint all filter options of the global list, to keep them up to date.
 * @param {boolean} fullRefresh - If true, the list is fully refreshed and the navigation is being reset
 */
export async function printCharacters(fullRefresh = false) {
    const storageKey = 'Characters_PerPage';
    const listId = '#rm_print_characters_block';

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    let currentScrollTop = $(listId).scrollTop();

    if (fullRefresh) {
        saveCharactersPage = 0;
        currentScrollTop = 0;
        await delay(1);
    }

    // Before printing the personas, we check if we should enable/disable search sorting
    verifyCharactersSearchSortRule();

    // We are actually always reprinting filters, as it "doesn't hurt", and this way they are always up to date
    printTagFilters(tag_filter_type.character);
    printTagFilters(tag_filter_type.group_members_list);
    printTagFilters(tag_filter_type.group_candidates_list);

    // We are also always reprinting the lists on character/group edit window, as these ones doesn't get updated otherwise
    applyTagsOnCharacterSelect();
    applyTagsOnGroupSelect();

    const entities = getEntitiesList({ doFilter: true });

    const pageSize = Number(accountStorage.getItem(storageKey)) || per_page_default;
    const sizeChangerOptions = [10, 25, 50, 100, 250, 500, 1000];
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#rm_print_characters_pagination').pagination({
        dataSource: entities,
        pageSize,
        pageRange: 1,
        pageNumber: saveCharactersPage || 1,
        position: 'top',
        showPageNumbers: false,
        showSizeChanger: true,
        prevText: '<',
        nextText: '>',
        formatNavigator: PAGINATION_TEMPLATE,
        formatSizeChanger: renderPaginationDropdown(pageSize, sizeChangerOptions),
        showNavigator: true,
        // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
        callback: async function (/** @type {Entity[]} */ data) {
            const listEl = document.querySelector(listId);
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            listEl.innerHTML = '';
            if (power_user.bogus_folders && isBogusFolderOpen()) {
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                listEl.append(getBackBlock());
            }
            if (!data.length) {
                const emptyBlock = await getEmptyBlock();
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                listEl.append(emptyBlock);
            }
            let displayCount = 0;
            for (const i of data) {
                switch (i.type) {
                    case 'character':
                        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                        listEl.append(getCharacterBlock(i.item, i.id));
                        displayCount++;
                        break;
                    case 'group':
                        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                        listEl.append(getGroupBlock(i.item));
                        displayCount++;
                        break;
                    case 'tag':
                        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                        listEl.append(getTagBlock(i.item, i.entities, i.hidden, i.isUseless));
                        break;
                }
            }

            const hidden = (characters.length + groups.length) - displayCount;
            if (hidden > 0 && entitiesFilter.hasAnyFilter()) {
                const hiddenBlock = await getHiddenBlock(hidden);
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                listEl.append(hiddenBlock);
            }
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            localizePagination($('#rm_print_characters_pagination'));

            eventSource.emit(event_types.CHARACTER_PAGE_LOADED);
        },
        // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
        afterSizeSelectorChange: function (e, size) {
            accountStorage.setItem(storageKey, e.target.value);
            paginationDropdownChangeHandler(e, size);
        },
        // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
        afterPaging: function (e) {
            saveCharactersPage = e;
        },
        afterRender: function () {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(listId).scrollTop(currentScrollTop);
        },
    });

    favsToHotswap();
    updatePersonaConnectionsAvatarList();
}

/** Checks the state of the current search, and adds/removes the search sorting option accordingly */
function verifyCharactersSearchSortRule() {
    const searchTerm = entitiesFilter.getFilterData(FILTER_TYPES.SEARCH);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const searchOption = $('#character_sort_order option[data-field="search"]');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const selector = $('#character_sort_order');
    const isHidden = searchOption.attr('hidden') !== undefined;

    // If we have a search term, we are displaying the sorting option for it
    if (searchTerm && isHidden) {
        searchOption.removeAttr('hidden');
        searchOption.prop('selected', true);
        flashHighlight(selector);
    }
    // If search got cleared, we make sure to hide the option and go back to the one before
    if (!searchTerm && !isHidden) {
        searchOption.attr('hidden', '');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $(`#character_sort_order option[data-order="${power_user.sort_order}"][data-field="${power_user.sort_field}"]`).prop('selected', true);
    }
}

/**
 * @typedef {object} Entity - Object representing a display entity
 * @property {Character|Group|import('./scripts/tags.js').Tag|*} item - The item
 * @property {string|number} id - The id
 * @property {'character'|'group'|'tag'} type - The type of this entity (character, group, tag)
 * @property {Entity[]?} [entities=null] - An optional list of entities relevant for this item
 * @property {number?} [hidden=null] - An optional number representing how many hidden entities this entity contains
 * @property {boolean?} [isUseless=null] - Specifies if the entity is useless (not relevant, but should still be displayed for consistency) and should be displayed greyed out
 */

/**
 * Converts the given character to its entity representation
 * @param {Character} character - The character
 * @param {string|number} id - The id of this character
 * @returns {Entity} The entity for this character
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'character' implicitly has an 'any' type... Remove this comment to see the full error message
export function characterToEntity(character, id) {
    return { item: character, id, type: 'character' };
}

/**
 * Converts the given group to its entity representation
 * @param {Group} group - The group
 * @returns {Entity} The entity for this group
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'group' implicitly has an 'any' type.
export function groupToEntity(group) {
    return { item: group, id: group.id, type: 'group' };
}

/**
 * Converts the given tag to its entity representation
 * @param {import('./scripts/tags.js').Tag} tag - The tag
 * @returns {Entity} The entity for this tag
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'tag' implicitly has an 'any' type.
export function tagToEntity(tag) {
    return { item: structuredClone(tag), id: tag.id, type: 'tag', entities: [] };
}

/**
 * Builds the full list of all entities available
 *
 * They will be correctly marked and filtered.
 * @param {object} param0 - Optional parameters
 * @param {boolean} [param0.doFilter] - Whether this entity list should already be filtered based on the global filters
 * @param {boolean} [param0.doSort] - Whether the entity list should be sorted when returned
 * @returns {Entity[]} All entities
 */
export function getEntitiesList({ doFilter = false, doSort = true } = {}) {
    let entities = [
        ...characters.map((item, index) => characterToEntity(item, index)),
        ...groups.map(item => groupToEntity(item)),
        // @ts-expect-error TS(7005) FIXME: Variable 'tags' implicitly has an 'any[]' type.
        ...(power_user.bogus_folders ? tags.filter(isBogusFolder).sort(compareTagsForSort).map(item => tagToEntity(item)) : []),
    ];

    // We need to do multiple filter runs in a specific order, otherwise different settings might override each other
    // and screw up tags and search filter, sub lists or similar.
    // The specific filters are written inside the "filterByTagState" method and its different parameters.
    // Generally what we do is the following:
    //   1. First swipe over the list to remove the most obvious things
    //   2. Build sub entity lists for all folders, filtering them similarly to the second swipe
    //   3. We do the last run, where global filters are applied, and the search filters last

    // First run filters, that will hide what should never be displayed
    if (doFilter) {
        entities = filterByTagState(entities);
    }

    // Run over all entities between first and second filter to save some states
    for (const entity of entities) {
        // For folders, we remember the sub entities so they can be displayed later, even if they might be filtered
        // Those sub entities should be filtered and have the search filters applied too
        if (entity.type === 'tag') {
            // @ts-expect-error TS(2322) FIXME: Type '{ item: any; id: any; type: string; }' is no... Remove this comment to see the full error message
            let subEntities = filterByTagState(entities, { subForEntity: entity, filterHidden: false });
            const subCount = subEntities.length;
            // @ts-expect-error TS(2322) FIXME: Type '{ item: any; id: any; type: string; }' is no... Remove this comment to see the full error message
            subEntities = filterByTagState(entities, { subForEntity: entity });
            if (doFilter) {
                // sub entities filter "hacked" because folder filter should not be applied there, so even in "only folders" mode characters show up
                subEntities = entitiesFilter.applyFilters(subEntities, { clearScoreCache: false, tempOverrides: { [FILTER_TYPES.FOLDER]: FILTER_STATES.UNDEFINED }, clearFuzzySearchCaches: false });
            }
            if (doSort) {
                sortEntitiesList(subEntities, false);
            }
            // @ts-expect-error TS(2339) FIXME: Property 'entities' does not exist on type '{ item... Remove this comment to see the full error message
            entity.entities = subEntities;
            // @ts-expect-error TS(2339) FIXME: Property 'hidden' does not exist on type '{ item: ... Remove this comment to see the full error message
            entity.hidden = subCount - subEntities.length;
        }
    }

    // Second run filters, hiding whatever should be filtered later
    if (doFilter) {
        const beforeFinalEntities = filterByTagState(entities, { globalDisplayFilters: true });
        entities = entitiesFilter.applyFilters(beforeFinalEntities, { clearFuzzySearchCaches: false });

        // Magic for folder filter. If that one is enabled, and no folders are display anymore, we remove that filter to actually show the characters.
        if (isFilterState(entitiesFilter.getFilterData(FILTER_TYPES.FOLDER), FILTER_STATES.SELECTED) && entities.filter(x => x.type == 'tag').length == 0) {
            entities = entitiesFilter.applyFilters(beforeFinalEntities, { tempOverrides: { [FILTER_TYPES.FOLDER]: FILTER_STATES.UNDEFINED }, clearFuzzySearchCaches: false });
        }
    }

    // Final step, updating some properties after the last filter run
    const nonTagEntitiesCount = entities.filter(entity => entity.type !== 'tag').length;
    for (const entity of entities) {
        if (entity.type === 'tag') {
            // @ts-expect-error TS(2339) FIXME: Property 'entities' does not exist on type '{ item... Remove this comment to see the full error message
            if (entity.entities?.length == nonTagEntitiesCount) entity.isUseless = true;
        }
    }

    // Sort before returning if requested
    if (doSort) {
        sortEntitiesList(entities, false);
    }
    entitiesFilter.clearFuzzySearchCaches();
    return entities;
}

/**
 *
 * @param avatarUrl
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'avatarUrl' implicitly has an 'any' type... Remove this comment to see the full error message
export async function getOneCharacter(avatarUrl) {
    const response = await fetch('/api/characters/get', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            avatar_url: avatarUrl,
        }),
    });

    if (response.ok) {
        const getData = await response.json();
        getData.name = DOMPurify.sanitize(getData.name);
        getData.chat = String(getData.chat);

        const indexOf = characters.findIndex(x => x.avatar === avatarUrl);

        if (indexOf !== -1) {
            characters[indexOf] = getData;
        } else {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(t`Character ${avatarUrl} not found in the list`, t`Error`, { timeOut: 5000, preventDuplicates: true });
        }
    }
}

/**
 *
 * @param chId
 */
export function getCharacterSource(chId = this_chid) {
    const character = characters[chId];

    if (!character) {
        return '';
    }

    const chubId = characters[chId]?.data?.extensions?.chub?.full_path;

    if (chubId) {
        return `https://chub.ai/characters/${chubId}`;
    }

    const pygmalionId = characters[chId]?.data?.extensions?.pygmalion_id;

    if (pygmalionId) {
        return `https://pygmalion.chat/${pygmalionId}`;
    }

    const githubRepo = characters[chId]?.data?.extensions?.github_repo;

    if (githubRepo) {
        return `https://github.com/${githubRepo}`;
    }

    const sourceUrl = characters[chId]?.data?.extensions?.source_url;

    if (sourceUrl) {
        return sourceUrl;
    }

    const risuId = characters[chId]?.data?.extensions?.risuai?.source;

    if (Array.isArray(risuId) && risuId.length && typeof risuId[0] === 'string' && risuId[0].startsWith('risurealm:')) {
        const realmId = risuId[0].split(':')[1];
        return `https://realm.risuai.net/character/${realmId}`;
    }

    const perchanceSlug = characters[chId]?.data?.extensions?.perchance_data?.slug;

    if (perchanceSlug) {
        return `https://perchance.org/ai-character-chat?data=${perchanceSlug}`;
    }

    return '';
}

/**
 *
 */
export async function getCharacters() {
    const response = await fetch('/api/characters/all', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({}),
    });
    if (response.ok) {
        const previousAvatar = this_chid !== undefined ? characters[this_chid]?.avatar : null;
        characters.splice(0, characters.length);
        const getData = await response.json();
        for (let i = 0; i < getData.length; i++) {
            characters[i] = getData[i];
            characters[i].name = DOMPurify.sanitize(characters[i].name);

            // For dropped-in cards
            if (!characters[i].chat) {
                characters[i].chat = `${characters[i].name} - ${humanizedDateTime()}`;
            }

            characters[i].chat = String(characters[i].chat);
        }

        if (previousAvatar) {
            const newCharacterId = characters.findIndex(x => x.avatar === previousAvatar);
            if (newCharacterId >= 0) {
                setCharacterId(newCharacterId);
                await selectCharacterById(newCharacterId, { switchMenu: false });
            } else {
                await Popup.show.text(t`ERROR: The active character is no longer available.`, t`The page will be refreshed to prevent data loss. Press "OK" to continue.`);
                return location.reload();
            }
        }

        await getGroups();
        await printCharacters(true);
    } else {
        console.error('Failed to fetch characters:', response.statusText);
        const errorData = await response.json();
        if (errorData?.overflow) {
            await Popup.show.text(t`Character data length limit reached`, t`To resolve this, set "performance.lazyLoadCharacters" to "true" in config.yaml and restart the server.`);
        }
    }
}

/**
 *
 * @param chatfile
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'chatfile' implicitly has an 'any' type.
async function delChat(chatfile) {
    const response = await fetch('/api/chats/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            chatfile: chatfile,
            avatar_url: characters[this_chid].avatar,
        }),
    });
    if (response.ok === true) {
        // choose another chat if current was deleted
        const name = chatfile.replace('.jsonl', '');
        if (name === characters[this_chid].chat) {
            chat_metadata = {};
            await replaceCurrentChat();
        }
        await eventSource.emit(event_types.CHAT_DELETED, name);
    }
}

/**
 * Deletes a character chat by its name.
 * @param {string} characterId Character ID to delete chat for
 * @param {string} fileName Name of the chat file to delete (without .jsonl extension)
 * @returns {Promise<void>} A promise that resolves when the chat is deleted.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'characterId' implicitly has an 'any' ty... Remove this comment to see the full error message
export async function deleteCharacterChatByName(characterId, fileName) {
    // Make sure all the data is loaded.
    await unshallowCharacter(characterId);

    /** @type {Character} */
    const character = characters[characterId];
    if (!character) {
        console.warn(`Character with ID ${characterId} not found.`);
        return;
    }

    const response = await fetch('/api/chats/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            chatfile: `${fileName}.jsonl`,
            avatar_url: character.avatar,
        }),
    });

    if (!response.ok) {
        console.error('Failed to delete chat for character.');
        return;
    }

    if (fileName === character.chat) {
        const chatsResponse = await fetch('/api/characters/chats', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ avatar_url: character.avatar }),
        });
        const chats = Object.values(await chatsResponse.json());
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        chats.sort((a, b) => sortMoments(timestampToMoment(a.last_mes), timestampToMoment(b.last_mes)));
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const newChatName = chats.length && typeof chats[0] === 'object' ? chats[0].file_name.replace('.jsonl', '') : `${character.name} - ${humanizedDateTime()}`;
        await updateRemoteChatName(characterId, newChatName);
    }

    await eventSource.emit(event_types.CHAT_DELETED, fileName);
}

/**
 *
 */
export async function replaceCurrentChat() {
    await clearChat({ clearData: true });

    const chatsResponse = await fetch('/api/characters/chats', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ avatar_url: characters[this_chid].avatar }),
    });

    if (chatsResponse.ok) {
        const chats = Object.values(await chatsResponse.json());
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        chats.sort((a, b) => sortMoments(timestampToMoment(a.last_mes), timestampToMoment(b.last_mes)));

        if (chats.length && typeof chats[0] === 'object') {
            // pick existing chat
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            characters[this_chid].chat = chats[0].file_name.replace('.jsonl', '');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#selected_chat_pole').val(characters[this_chid].chat);
            saveCharacterDebounced();
            await getChat();
        } else {
            // start new chat
            characters[this_chid].chat = `${name2} - ${humanizedDateTime()}`;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#selected_chat_pole').val(characters[this_chid].chat);
            saveCharacterDebounced();
            await getChat();
        }
    }
}

/**
 *
 * @param messagesToLoad
 */
export async function showMoreMessages(messagesToLoad = null) {
    const firstDisplayedMesId = chatElement.children('.mes').first().attr('mesid');
    let messageId = Number(firstDisplayedMesId);
    const count = messagesToLoad || power_user.chat_truncation || Number.MAX_SAFE_INTEGER;

    // If there are no messages displayed, or the message somehow has no mesid, we default to one higher than last message id,
    // so the first "new" message being shown will be the last available message
    if (isNaN(messageId)) {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        messageId = getLastMessageId() + 1;
    }

    console.debug('Inserting messages before', messageId, 'count', count, 'chat length', chat.length);
    const prevHeight = chatElement.prop('scrollHeight');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const showMoreButton = $('#show_more_messages');
    const isButtonInView = isElementInViewport(showMoreButton[0]);

    const firstId = clamp(messageId - count, 0, Infinity);
    // @ts-expect-error TS(7034) FIXME: Variable 'messageElements' implicitly has type 'an... Remove this comment to see the full error message
    const messageElements = [];
    chat.slice(firstId, messageId).forEach((message, id) => {
        messageElements.push(updateMessageElement(message, { messageId: firstId + id }));
    });
    // This could be faster: https://developer.mozilla.org/en-US/docs/Web/API/Element/insertAdjacentElement
    // Fallback to chatElement if the button isn't where it's expected to be.
    if (showMoreButton[0]) {
        // @ts-expect-error TS(7005) FIXME: Variable 'messageElements' implicitly has an 'any[... Remove this comment to see the full error message
        showMoreButton[0].after(...messageElements.map(el => el[0]));
    } else {
        // @ts-expect-error TS(7005) FIXME: Variable 'messageElements' implicitly has an 'any[... Remove this comment to see the full error message
        chatElement[0].prepend(...messageElements.map(el => el[0]));
    }

    refreshSwipeButtons();

    if (firstId === 0) {
        showMoreButton[0].remove();
    }

    if (isButtonInView) {
        const newHeight = chatElement.prop('scrollHeight');
        chatElement.scrollTop(newHeight - prevHeight);
    }

    applyStylePins();
    await eventSource.emit(event_types.MORE_MESSAGES_LOADED);
}

/**
 *
 */
export async function printMessages() {
    let startIndex = 0;
    const count = power_user.chat_truncation || Number.MAX_SAFE_INTEGER;

    if (chat.length > count) {
        startIndex = chat.length - count;
        chatElement[0].insertAdjacentHTML('beforeend', '<div id="show_more_messages">Show more messages</div>');
    }

    await redisplayChat({ startIndex, fade: false });

    scrollChatToBottom({ waitForFrame: true });
    delay(debounce_timeout.short).then(() => scrollOnMediaLoad());
}

/**
 * Visually updates all chat messages including and after index by removing them, then adding them.
 * @param {object} [options] Options
 * @param {ChatMessage[]} [options.targetChat] All messages in chat before startIndex will remain unchanged.
 * @param {number} [options.startIndex] Everything including and after startIndex will be replaced.
 * @param {boolean} [options.fade] When false, the swipe chevrons will not fade in.
 */
export async function redisplayChat({ targetChat = chat, startIndex = 0, fade = true } = {}) {
    const messageElements = chatElement.find('.mes');
    messageElements.removeClass('last_mes');

    //Remove messages after index.
    [...messageElements.filter(`.mes[mesid="${startIndex}"]`).nextAll('.mes').addBack()].forEach(el => el.remove());

    const t1 = performance.now();

    const messages = targetChat.slice(startIndex);

    if (messages.length > 0) {
        const newMessageElements = messages.map((message, offset) => {
            const i = startIndex + offset;
            const messageElement = updateMessageElement(message, { messageId: i });

            return messageElement[0];
        });

        //The last_mes has been removed, add it to the new last message.
        newMessageElements.at(-1).classList.add('last_mes');

        //Append to chat in one DOM update.
        chatElement[0].append(...newMessageElements);

        applyCharacterTagsToMessageDivs({ mesIds: range(startIndex, targetChat.length) as number[] });

    }

    refreshSwipeButtons(false, fade);
    applyStylePins();
    updateEditArrowClasses();

    console.info(`Rendered ${targetChat.length - startIndex} messages in ${((performance.now() - t1) / 1000).toFixed(3)} seconds.`);
}

/**
 *
 */
export function scrollOnMediaLoad() {
    const started = Date.now();
    const media = chatElement.find('.mes_block img, .mes_block video, .mes_block audio').toArray();
    let mediaLoaded = 0;

    for (const currentElement of media) {
        if (currentElement instanceof HTMLImageElement) {
            if (currentElement.complete) {
                incrementAndCheck();
            } else {
                currentElement.addEventListener('load', incrementAndCheck);
                currentElement.addEventListener('error', incrementAndCheck);
            }
        }
        if (currentElement instanceof HTMLMediaElement) {
            if (currentElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                incrementAndCheck();
            } else {
                currentElement.addEventListener('loadeddata', incrementAndCheck);
                currentElement.addEventListener('error', incrementAndCheck);
            }
        }
    }

    /**
     *
     */
    function incrementAndCheck() {
        const MAX_DELAY = 1000; // 1 second
        if ((Date.now() - started) > MAX_DELAY) {
            return;
        }
        mediaLoaded++;
        if (mediaLoaded === media.length) {
            scrollChatToBottom({ waitForFrame: true });
        }
    }
}

/**
 * Cancels the debounced chat save if it is currently pending.
 */
export function cancelDebouncedChatSave() {
    // @ts-expect-error TS(7005) FIXME: Variable 'chatSaveTimeout' implicitly has an 'any'... Remove this comment to see the full error message
    if (chatSaveTimeout) {
        console.debug('Debounced chat save cancelled');
        clearTimeout(chatSaveTimeout);
        chatSaveTimeout = null;
    }
}

/**
 * Visually removes all chat message elements.
 * @param {object} [options] Options
 * @param {boolean} [options.clearData] Optionally clear the chat array's contents.
 */
export async function clearChat({ clearData = false } = {}) {
    cancelDebouncedChatSave();
    cancelDebouncedMetadataSave();
    closeMessageEditor();
    extension_prompts = {};
    if (is_delete_mode) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#dialogue_del_mes_cancel').trigger('click');
    }
    //This will also remove non '.mes' elements, e.g. '<div id="show_more_messages">Show more messages</div>'.
    chatElement[0].innerHTML = '';
    const zoomedAvatars = document.querySelectorAll('.zoomed_avatar[forChar]');
    if (zoomedAvatars.length) {
        console.debug('saw avatars to remove');
        zoomedAvatars.forEach(el => el.remove());
    } else { console.debug('saw no avatars'); }

    await saveItemizedPrompts(getCurrentChatId());
    itemizedPrompts.length = 0;

    if (clearData) chat.length = 0;
}

/**
 *
 */
export async function deleteLastMessage() {
    deleteItemizedPromptForMessage(chat.length - 1);
    chat.length = chat.length - 1;
    const mesChildren = [...chatElement[0].children].filter(el => el.matches('.mes'));
    mesChildren[mesChildren.length - 1]?.remove();
    await eventSource.emit(event_types.MESSAGE_DELETED, chat.length);
}

/**
 * Deletes a message from the chat by its ID, optionally asking for confirmation.
 * @param {number} id The ID of the message to delete.
 * @param {number} [swipeDeletionIndex] Deletes the swipe with that index.
 * @param {boolean} [askConfirmation] Whether to ask for confirmation before deleting.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'id' implicitly has an 'any' type.
export async function deleteMessage(id, swipeDeletionIndex = undefined, askConfirmation = false) {
    const canDeleteSwipe = swipeDeletionIndex !== undefined && swipeDeletionIndex !== null;
    if (canDeleteSwipe) {
        if (swipeDeletionIndex < 0) {
            throw new Error('Swipe index cannot be negative');
        }
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        if (!Array.isArray(chat[id].swipes)) {
            throw new Error('Message has no swipes to delete');
        }
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        if (chat[id].swipes.length <= swipeDeletionIndex) {
            throw new Error('Swipe index out of bounds');
        }
    }

    const minId = getFirstDisplayedMessageId();
    const messageElement = chatElement.find(`.mes[mesid="${id}"]`);
    if (messageElement.length === 0) {
        return;
    }

    let deleteOnlySwipe = canDeleteSwipe;
    if (askConfirmation) {
        // @ts-expect-error TS(2345) FIXME: Argument of type 'null' is not assignable to param... Remove this comment to see the full error message
        const result = await callGenericPopup(t`Are you sure you want to delete this message?`, POPUP_TYPE.CONFIRM, null, {
            okButton: canDeleteSwipe ? t`Delete Swipe` : t`Delete Message`,
            cancelButton: 'Cancel',
            customButtons: canDeleteSwipe ? [t`Delete Message`] : null,
        });
        if (!result) {
            return;
        }
        deleteOnlySwipe = canDeleteSwipe && result === POPUP_RESULT.AFFIRMATIVE; // Default button, not the custom one
    }

    if (deleteOnlySwipe) {
        await deleteSwipe(swipeDeletionIndex, id);
        return;
    }

    chat.splice(id, 1);
    messageElement[0]?.remove();

    chat_metadata.tainted = true;

    const startIndex = [0, minId].includes(id) ? id : null;
    deleteItemizedPromptForMessage(id);
    updateViewMessageIds(startIndex);
    saveChatDebounced();

    // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
    if (this_edit_mes_id === id) {
        this_edit_mes_id = undefined;
    }

    refreshSwipeButtons();

    await eventSource.emit(event_types.MESSAGE_DELETED, chat.length);
}

export const reloadChatMutex = new SimpleMutex(reloadCurrentChatUnsafe);
export const reloadCurrentChat = reloadChatMutex.update.bind(reloadChatMutex);

/**
 * Reloads the current chat unsafely, without mutex protection.
 * Use `reloadCurrentChat` instead to ensure thread safety.
 * @returns {Promise<void>} A promise that resolves when the chat is reloaded.
 */
export async function reloadCurrentChatUnsafe() {
    preserveNeutralChat();
    await clearChat({ clearData: true });

    if (selected_group) {
        await getGroupChat(selected_group, true);
    } else if (this_chid !== undefined) {
        await getChat();
    } else {
        resetChatState();
        restoreNeutralChat();
        await getCharacters();
        await printMessages();
        await eventSource.emit(event_types.CHAT_CHANGED, getCurrentChatId());
    }

    refreshSwipeButtons();
}

/**
 * Send the message currently typed into the chat box.
 */
export async function sendTextareaMessage() {
    // don't proceed during swipeGenerate()
    if (swipeState == SWIPE_STATE.EDITING) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning(t`Confirm the edit to start a generation.`, t`You cannot send a message during a swipe-edit.`);
        return;
    }
    if (swipeState !== SWIPE_STATE.NONE) return; // don't proceed if mid-swipe.
    if (is_send_press) return;
    if (isExecutingCommandsFromChatInput) return;

    hideSwipeButtons(); //Swipe buttons must be hidden now, otherwise concurrent generations are possible.

    let generateType = 'normal';
    // "Continue on send" is activated when the user hits "send" (or presses enter) on an empty chat box, and the last
    // message was sent from a character (not the user or the system).
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const textareaText = String($('#send_textarea').val());
    const lastMessage = chat[chat.length - 1];
    if (power_user.continue_on_send &&
        !hasPendingFileAttachment() &&
        !textareaText &&
        !selected_group &&
        chat.length &&
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        !lastMessage.is_user &&
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        !lastMessage.is_system
    ) {
        generateType = 'continue';
    }

    if (textareaText && !selected_group && this_chid === undefined && name2 !== neutralCharacterName) {
        await newAssistantChat({ temporary: false });
    }

    const generation = await Generate(generateType);
    showSwipeButtons();
    return generation;
}

/**
 * Formats the message text into an HTML string using Markdown and other formatting.
 * @param {string} mes Message text
 * @param {string} ch_name Character name
 * @param {boolean} isSystem If the message was sent by the system
 * @param {boolean} isUser If the message was sent by the user
 * @param {number} messageId Message index in chat array
 * @param {Partial<DOMPurify.Config>} [sanitizerOverrides] DOMPurify sanitizer option overrides
 * @param {boolean} [isReasoning] If the message is reasoning output
 * @returns {string} HTML string
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'mes' implicitly has an 'any' type.
export function messageFormatting(mes, ch_name, isSystem, isUser, messageId, sanitizerOverrides = {}, isReasoning = false) {
    if (!mes) {
        return '';
    }

    if (Number(messageId) === 0 && !isSystem && !isUser && !isReasoning) {
        const mesBeforeReplace = mes;
        const chatMessage = chat[messageId];
        // @ts-expect-error TS(2554) FIXME: Expected 1-2 arguments, but got 3.
        mes = substituteParams(mes, undefined, ch_name);
        // @ts-expect-error TS(2339) FIXME: Property 'mes' does not exist on type 'never'.
        if (chatMessage && chatMessage.mes === mesBeforeReplace && chatMessage.extra?.display_text !== mesBeforeReplace) {
            // @ts-expect-error TS(2339) FIXME: Property 'mes' does not exist on type 'never'.
            chatMessage.mes = mes;
        }
    }

    mesForMarkdownParse = mes;

    // Force isSystem = false on comment messages so they get formatted properly
    if (ch_name === COMMENT_NAME_DEFAULT && isSystem && !isUser) {
        isSystem = false;
    }

    // Let hidden messages have markdown
    if (isSystem && ch_name !== systemUserName) {
        isSystem = false;
    }

    // Prompt bias replacement should be applied on the raw message
    const replacedPromptBias = power_user.user_prompt_bias && substituteParams(power_user.user_prompt_bias);
    if (!power_user.show_user_prompt_bias && ch_name && !isUser && !isSystem && replacedPromptBias && mes.startsWith(replacedPromptBias)) {
        mes = mes.slice(replacedPromptBias.length);
    }

    if (!isSystem) {
        /**
         *
         */
        function getRegexPlacement() {
            try {
                if (isReasoning) {
                    return regex_placement.REASONING;
                }
                if (isUser) {
                    return regex_placement.USER_INPUT;
                // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
                } else if (chat[messageId]?.extra?.type === 'narrator') {
                    return regex_placement.SLASH_COMMAND;
                } else {
                    return regex_placement.AI_OUTPUT;
                }
            } catch {
                return regex_placement.AI_OUTPUT;
            }
        }

        const regexPlacement = getRegexPlacement();
        // @ts-expect-error TS(2339) FIXME: Property 'is_system' does not exist on type 'never... Remove this comment to see the full error message
        const usableMessages = chat.map((x, index) => ({ message: x, index: index })).filter(x => !x.message.is_system);
        const indexOf = usableMessages.findIndex(x => x.index === Number(messageId));
        const depth = messageId >= 0 && indexOf !== -1 ? (usableMessages.length - indexOf - 1) : undefined;

        // Always override the character name
        mes = getRegexedString(mes, regexPlacement, {
            characterOverride: ch_name,
            isMarkdown: true,
            depth: depth,
        });
    }

    if (power_user.auto_fix_generated_markdown) {
        mes = fixMarkdown(mes, true);
    }

    if (!isSystem && power_user.encode_tags) {
        mes = canUseNegativeLookbehind()
            ? mes.replaceAll('<', '&lt;').replace(new RegExp('(?<!^|\\n\\s*)>', 'g'), '&gt;')
            : mes.replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    }

    // Make sure reasoning strings are always shown, even if they include "<" or ">"
    [power_user.reasoning.prefix, power_user.reasoning.suffix].forEach((reasoningString) => {
        if (!reasoningString || !reasoningString.trim().length) {
            return;
        }
        // Only replace the first occurrence of the reasoning string
        if (mes.includes(reasoningString)) {
            mes = mes.replace(reasoningString, escapeHtml(reasoningString));
        }
    });

    if (!isSystem) {
        // Save double quotes in tags as a special character to prevent them from being encoded
        if (!power_user.encode_tags) {
            // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
            mes = mes.replace(/<([^>]+)>/g, function (_, contents) {
                return '<' + contents.replace(/"/g, '\ufffe') + '>';
            });
        }

        mes = mes.replace(
            /<style>[\s\S]*?<\/style>|```[\s\S]*?```|~~~[\s\S]*?~~~|``[\s\S]*?``|`[\s\S]*?`|(".*?")|(\u201C.*?\u201D)|(\u00AB.*?\u00BB)|(\u300C.*?\u300D)|(\u300E.*?\u300F)|(\uFF02.*?\uFF02)/gim,
            // @ts-expect-error TS(7006) FIXME: Parameter 'match' implicitly has an 'any' type.
            function (match, p1, p2, p3, p4, p5, p6) {
                if (p1) {
                    // English double quotes
                    return `<q>"${p1.slice(1, -1)}"</q>`;
                } else if (p2) {
                    // Curly double quotes “ ”
                    return `<q>“${p2.slice(1, -1)}”</q>`;
                } else if (p3) {
                    // Guillemets « »
                    return `<q>«${p3.slice(1, -1)}»</q>`;
                } else if (p4) {
                    // Corner brackets 「 」
                    return `<q>「${p4.slice(1, -1)}」</q>`;
                } else if (p5) {
                    // White corner brackets 『 』
                    return `<q>『${p5.slice(1, -1)}』</q>`;
                } else if (p6) {
                    // Fullwidth quotes ＂ ＂
                    return `<q>＂${p6.slice(1, -1)}＂</q>`;
                } else {
                    // Return the original match if no quotes are found
                    return match;
                }
            },
        );

        // Restore double quotes in tags
        if (!power_user.encode_tags) {
            mes = mes.replace(/\ufffe/g, '"');
        }

        mes = mes.replaceAll('\\begin{align*}', '$$');
        mes = mes.replaceAll('\\end{align*}', '$$');
        mes = processMarkdownExclusions(mes);
        mes = converter.render(mes);
        mes = processMarkdownUnderscores(mes);

        // @ts-expect-error TS(7006) FIXME: Parameter 'match' implicitly has an 'any' type.
        mes = mes.replace(/<code(.*)>[\s\S]*?<\/code>/g, function (match) {
            // Firefox creates extra newlines from <br>s in code blocks, so we replace them before converting newlines to <br>s.
            return match.replace(/\n/gm, '\u0000');
        });
        mes = mes.replace(/\u0000/g, '\n'); // Restore converted newlines
        mes = mes.trim();

        // @ts-expect-error TS(7006) FIXME: Parameter 'match' implicitly has an 'any' type.
        mes = mes.replace(/<code(.*)>[\s\S]*?<\/code>/g, function (match) {
            return match.replace(/&amp;/g, '&');
        });
    }

    if (!power_user.allow_name2_display && ch_name && !isUser && !isSystem) {
        mes = mes.replace(new RegExp(`(^|\n)${escapeRegex(ch_name)}:`, 'g'), '$1');
    }

    /** @type {DOMPurify.Config} */
    const config = {
        RETURN_DOM: false,
        RETURN_DOM_FRAGMENT: false,
        RETURN_TRUSTED_TYPE: false,
        MESSAGE_SANITIZE: true,
        ADD_TAGS: ['custom-style'],
        ...sanitizerOverrides,
    };
    mes = encodeStyleTags(mes);
    mes = DOMPurify.sanitize(mes, config);
    mes = decodeStyleTags(mes, { prefix: '.mes_text ' });

    return mes;
}

/**
 * Creates an Image element for the given API/model icon.
 * The image references the matching SVG file from `/img/` and includes a tooltip with API and model info.
 * The caller is responsible for appending the image to the DOM and optionally calling `SVGInject` on it.
 * @param {string} apiName - API identifier matching an SVG file in /img/ (e.g. 'openai', 'openrouter', 'claude')
 * @param {string} [modelName] - Model name shown in the tooltip
 * @returns {HTMLImageElement} The image element (not yet in the DOM)
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'apiName' implicitly has an 'any' type.
export function createModelIcon(apiName, modelName = '') {
    const image = new Image();
    image.classList.add('icon-svg');
    image.src = `/img/${apiName}.svg`;
    image.title = modelName ? `${apiName} - ${modelName}` : apiName;
    return image;
}

/**
 * Inserts or replaces an SVG icon adjacent to the provided message's timestamp.
 * @param {JQuery<HTMLElement>} mes - The message element containing the timestamp where the icon should be inserted or replaced.
 * @param {ChatMessageExtra} extra - Contains the API and model details.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'mes' implicitly has an 'any' type.
function insertSVGIcon(mes, extra) {
    const apiName = extra?.api || '';

    if (!apiName) {
        return;
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'image' implicitly has an 'any' type.
    const insertOrReplaceSVG = (image, className, targetSelector, insertBefore) => {
        image.onload = async function () {
            const existingSVG = insertBefore ? mes.find(targetSelector).prev(`.${className}`) : mes.find(targetSelector).next(`.${className}`);
            const targetEl = mes.find(targetSelector)[0];
            if (existingSVG.length) {
                existingSVG[0]?.replaceWith(image);
            } else {
                if (targetEl) targetEl.insertAdjacentElement(insertBefore ? 'beforebegin' : 'afterend', image);
            }
            await SVGInject(image);
        };
    };

    // @ts-expect-error TS(7006) FIXME: Parameter 'className' implicitly has an 'any' type... Remove this comment to see the full error message
    const insertIcon = (className, targetSelector, insertBefore) => {
        const image = createModelIcon(apiName, extra?.model);
        image.classList.add(className);
        insertOrReplaceSVG(image, className, targetSelector, insertBefore);
    };

    // @ts-expect-error TS(2554) FIXME: Expected 3 arguments, but got 2.
    insertIcon('timestamp-icon', '.timestamp');
    insertIcon('thinking-icon', '.mes_reasoning_header_title', true);
}

/**
 * Re-renders a message block with updated content.
 * @param {number} messageId Message ID
 * @param {object} message Message object
 * @param {object} [options] Optional arguments
 * @param {boolean} [options.rerenderMessage] Whether to re-render the message content (inside <c>.mes_text</c>)
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'messageId' implicitly has an 'any' type... Remove this comment to see the full error message
export function updateMessageBlock(messageId, message, { rerenderMessage = true } = {}) {
    const messageElement = chatElement.find(`[mesid="${messageId}"]`);
    if (rerenderMessage) {
        const text = message?.extra?.display_text ?? message.mes;
        messageElement.find('.mes_text').html(messageFormatting(text, message.name, message.is_system, message.is_user, messageId, {}, false));
    }

    updateReasoningUI(messageElement);

    addCopyToCodeBlocks(messageElement);
    appendMediaToMessage(message, messageElement);
}

/**
 * Ensures that the message media properties are arrays, adding getters/setters for single media items.
 * @param {ChatMessage} mes Message object
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'mes' implicitly has an 'any' type.
export function ensureMessageMediaIsArray(mes) {
    /**
     * Determines if a property of an object is a plain property (not a getter/setter or non-enumerable).
     * @param {object} obj Object to check
     * @param {string} name Property name
     * @returns {boolean} True if the property is a plain property, false otherwise
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'obj' implicitly has an 'any' type.
    function isPlainObjectProperty(obj, name) {
        const hasProperty = Object.hasOwn(obj, name);
        if (hasProperty) {
            const descriptor = Object.getOwnPropertyDescriptor(obj, name);
            return descriptor && descriptor.enumerable && descriptor.configurable && descriptor.writable;
        }
        return false;
    }

    /**
     * Determines if a property of an object is a getter (not a plain property).
     * @param {object} obj Object to check
     * @param {string} name Property name
     * @returns {boolean} True if the property is a getter, false otherwise
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'obj' implicitly has an 'any' type.
    function isGetterObjectProperty(obj, name) {
        const hasProperty = Object.hasOwn(obj, name);
        if (hasProperty) {
            const descriptor = Object.getOwnPropertyDescriptor(obj, name);
            return descriptor && typeof descriptor.get === 'function';
        }
        return false;
    }

    /**
     * Adds a plain property to an object that wraps around an array property.
     * @param {object} obj Object to add property to
     * @param {string} plainProperty Plain property name
     * @param {string} arrayProperty Array property to back the plain property
     * @param {(value: any) => boolean} [filterFn] Optional filter function to apply when getting/setting the plain property
     * @param {(value: any) => any} [mapFn] Optional map function to apply when getting/setting the plain property
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'obj' implicitly has an 'any' type.
    function addArrayAutoWrapper(obj, plainProperty, arrayProperty, filterFn = () => true, mapFn = (t) => t) {
        // If the plain property is already a getter, do nothing.
        const hasGetterProperty = isGetterObjectProperty(obj, plainProperty);
        if (hasGetterProperty) {
            return;
        }

        // Define the plain property as a getter/setter that wraps around the array property.
        Object.defineProperty(obj, plainProperty, {
            // Getting the plain property returns the first item in the array property, or undefined if the array is empty.
            get: function () {
                console.trace(`Attempting to GET an array-wrapped property '${plainProperty}'. Use the array property '${arrayProperty}' instead.`);
                const array = Array.isArray(this[arrayProperty]) ? this[arrayProperty].filter(filterFn).map(mapFn) : [];
                return array.length > 0 ? array[0] : void 0;
            },
            // Setting the plain property is not supported, as it would be ambiguous.
            set: function () {
                console.trace(`Attempting to SET an array-wrapped property '${plainProperty}'. Use the array property '${arrayProperty}' instead.`);
            },
            // Exclude the property from JSON serialization and from being listed in for...in loops.
            enumerable: false,
            // Make the property non-configurable to prevent deletion or redefinition.
            configurable: false,
        });
    }

    /**
     * Migrates image swipes from a single image property to an array.
     * @param {ChatMessageExtra} obj
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'obj' implicitly has an 'any' type.
    function migrateMediaToArray(obj) {
        if (isPlainObjectProperty(obj, 'file')) {
            if (!Array.isArray(obj.files)) {
                obj.files = [];
            }
            const fileValue = obj.file;
            delete obj.file;
            if (fileValue) {
                obj.files.push(fileValue);
            }
        }

        if (Array.isArray(obj.image_swipes)) {
            if (!Array.isArray(obj.media)) {
                obj.media = [];
            }
            for (const swipe of obj.image_swipes) {
                if (swipe && typeof swipe === 'string') {
                    obj.media_display = MEDIA_DISPLAY.GALLERY;
                    obj.media.push({ type: MEDIA_TYPE.IMAGE, url: swipe });
                }
            }
            delete obj.image_swipes;
        }

        if (isPlainObjectProperty(obj, 'image')) {
            if (!Array.isArray(obj.media)) {
                obj.media = [];
            }
            const imageValue = obj.image;
            delete obj.image;
            if (imageValue && typeof imageValue === 'string') {
                obj.media.push({ type: MEDIA_TYPE.IMAGE, url: imageValue });
            }
            if (obj.media_display === MEDIA_DISPLAY.GALLERY) {
                // @ts-expect-error TS(7006) FIXME: Parameter 't' implicitly has an 'any' type.
                const selectedIndex = obj.media.findIndex(t => t.url === imageValue);
                if (selectedIndex > -1) {
                    obj.media_index = selectedIndex;
                }
            }
            // @ts-expect-error TS(7006) FIXME: Parameter 'v' implicitly has an 'any' type.
            obj.media = obj.media.filter((v, i, a) => i === a.findIndex(t => t.url === v.url));
        }

        if (isPlainObjectProperty(obj, 'video')) {
            if (!Array.isArray(obj.media)) {
                obj.media = [];
            }
            const videoValue = obj.video;
            delete obj.video;
            if (videoValue && typeof videoValue === 'string') {
                obj.media.push({ type: MEDIA_TYPE.VIDEO, url: videoValue });
            }
        }
    }

    if (!mes || !mes.extra || typeof mes.extra !== 'object') {
        return;
    }

    migrateMediaToArray(mes.extra);
    addArrayAutoWrapper(mes.extra, 'file', 'files');
    // @ts-expect-error TS(2345) FIXME: Argument of type '(t: any) => boolean' is not assi... Remove this comment to see the full error message
    addArrayAutoWrapper(mes.extra, 'image', 'media', (t) => t.type === MEDIA_TYPE.IMAGE, (t) => t.url);
    // @ts-expect-error TS(2345) FIXME: Argument of type '(t: any) => boolean' is not assi... Remove this comment to see the full error message
    addArrayAutoWrapper(mes.extra, 'video', 'media', (t) => t.type === MEDIA_TYPE.VIDEO, (t) => t.url);
}

/**
 * Gets the media display setting for a message.
 * @param {ChatMessage} mes Message object
 * @returns {MEDIA_DISPLAY} Media display setting
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'mes' implicitly has an 'any' type.
export function getMediaDisplay(mes) {
    const value = mes?.extra?.media_display || power_user.media_display || MEDIA_DISPLAY.LIST;
    return Object.values(MEDIA_DISPLAY).includes(value) ? value : MEDIA_DISPLAY.LIST;
}

/**
 * Gets the media index for a message.
 * @param {ChatMessage} mes Message object
 * @returns {number} Media index
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'mes' implicitly has an 'any' type.
export function getMediaIndex(mes) {
    if (!Array.isArray(mes?.extra?.media)) {
        return 0;
    }
    const value = mes.extra?.media_index;
    if (isNaN(value) || value < 0 || value >= mes.extra.media.length) {
        return 0;
    }
    return value;
}

/**
 * Appends image or file to the message element.
 * @param {ChatMessage} mes Message object
 * @param {JQuery<HTMLElement>} messageElement Message element
 * @param {string} [scrollBehavior] Scroll behavior when adjusting scroll position
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'mes' implicitly has an 'any' type.
export function appendMediaToMessage(mes, messageElement, scrollBehavior = SCROLL_BEHAVIOR.ADJUST) {
    ensureMessageMediaIsArray(mes);

    const fileWrapper = messageElement.find('.mes_file_wrapper');
    const mediaWrapper = messageElement.find('.mes_media_wrapper');

    const hasMedia = Array.isArray(mes?.extra?.media) && mes.extra.media.length > 0;
    const hasFiles = Array.isArray(mes?.extra?.files) && mes.extra.files.length > 0;
    const mediaDisplay = hasMedia ? getMediaDisplay(mes) : null;
    const hideMessageText = hasMedia && mes?.extra?.inline_image === false;

    // @ts-expect-error TS(7034) FIXME: Variable 'mediaBlocks' implicitly has type 'any[]'... Remove this comment to see the full error message
    const mediaBlocks = [];
    // @ts-expect-error TS(7034) FIXME: Variable 'mediaPromises' implicitly has type 'any[... Remove this comment to see the full error message
    const mediaPromises = [];

    const chatHeight = (hasMedia || hasFiles) ? chatElement.prop('scrollHeight') : 0;
    const scrollPosition = (hasMedia || hasFiles) ? chatElement.scrollTop() : 0;
    const doAdjustScroll = () => {
        if (!hasMedia && !hasFiles) {
            return;
        }
        if (scrollBehavior === SCROLL_BEHAVIOR.NONE) {
            return;
        }
        if (scrollBehavior === SCROLL_BEHAVIOR.KEEP) {
            chatElement.scrollTop(scrollPosition);
            return;
        }
        const newChatHeight = chatElement.prop('scrollHeight');
        const diff = newChatHeight - chatHeight;
        chatElement.scrollTop(scrollPosition + diff);
    };

    // Set media display attribute
    messageElement.attr('data-media-display', mediaDisplay);
    // Toggle text visibility
    messageElement.find('.mes_text').toggleClass('inline_media', hideMessageText);

    /**
     * Appends a single image attachment to the message element.
     * @param {MediaAttachment} attachment Image attachment object
     * @param {number} index Index of the image attachment
     * @returns {JQuery<HTMLElement>} The appended image container element
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'attachment' implicitly has an 'any' typ... Remove this comment to see the full error message
    function appendImageAttachment(attachment, index) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const template = $(document.querySelector('#message_image_template .mes_img_container').cloneNode(true));
        template.attr('data-index', index);

        const image = template.find('.mes_img');
        image.attr('src', attachment.url);
        image.attr('title', attachment.title || mes.extra.title || '');
        mediaPromises.push(new Promise((resolve) => {
            /**
             *
             */
            function onLoad() {
                image.removeAttr('alt');
                image.removeClass('error');
                // @ts-expect-error TS(2794) FIXME: Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
                resolve();
            }
            /**
             *
             */
            function onError() {
                image.attr('alt', '');
                image.addClass('error');
                // @ts-expect-error TS(2794) FIXME: Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
                resolve();
            }
            if (image.prop('complete')) {
                onLoad();
            } else {
                image.off('load').on('load', onLoad);
                image.off('error').on('error', onError);
            }
        }));

        mediaBlocks.push(template);
        return template;
    }

    /**
     * Appends a single video attachment to the message element.
     * @param {MediaAttachment} attachment Video attachment object
     * @param {number} index Index of the video attachment
     * @returns {JQuery<HTMLElement>} The appended video container element
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'attachment' implicitly has an 'any' typ... Remove this comment to see the full error message
    function appendVideoAttachment(attachment, index) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const template = $(document.querySelector('#message_video_template .mes_video_container').cloneNode(true));
        template.attr('data-index', index);

        const video = template.find('.mes_video');
        video.attr('src', attachment.url);
        video.attr('title', attachment.title || mes.extra.title || '');
        mediaPromises.push(new Promise((resolve) => {
            /**
             *
             */
            function onLoad() {
                // @ts-expect-error TS(2794) FIXME: Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
                resolve();
            }
            /**
             *
             */
            function onError() {
                video.addClass('error');
                // @ts-expect-error TS(2794) FIXME: Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
                resolve();
            }
            if (video.prop('readyState') >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                onLoad();
            } else {
                video.off('loadeddata').on('loadeddata', onLoad);
                video.off('error').on('error', onError);
            }
        }));

        mediaBlocks.push(template);
        return template;
    }

    /**
     * Appends a single audio attachment to the message element.
     * @param {MediaAttachment} attachment Audio attachment object
     * @param {number} index Index of the audio attachment
     * @returns {JQuery<HTMLElement>} The appended audio container element
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'attachment' implicitly has an 'any' typ... Remove this comment to see the full error message
    function appendAudioAttachment(attachment, index) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const template = $(document.querySelector('#message_audio_template .mes_audio_container').cloneNode(true));
        template.attr('data-index', index);
        const audio = template.find('.mes_audio');
        audio.attr('src', attachment.url);
        audio.attr('title', attachment.title || mes.extra.title || '');

        mediaPromises.push(new Promise((resolve) => {
            /**
             *
             */
            function onLoad() {
                // @ts-expect-error TS(2794) FIXME: Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
                resolve();
            }
            /**
             *
             */
            function onError() {
                audio.addClass('error');
                // @ts-expect-error TS(2794) FIXME: Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
                resolve();
            }
            if (audio.prop('readyState') >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                onLoad();
            } else {
                audio.off('loadeddata').on('loadeddata', onLoad);
                audio.off('error').on('error', onError);
            }
        }));

        new AudioPlayer(audio.get(0), template.get(0));

        mediaBlocks.push(template);
        return template;
    }

    /**
     * Appends a media attachment to the message element.
     * @param {MediaAttachment} attachment Media attachment object
     * @param {number} index Index of the media attachment
     * @returns {JQuery<HTMLElement>} The appended media container element
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'attachment' implicitly has an 'any' typ... Remove this comment to see the full error message
    function appendMediaAttachment(attachment, index) {
        if (!attachment.type) {
            attachment.type = MEDIA_TYPE.IMAGE;
        }
        switch (attachment.type) {
            case MEDIA_TYPE.IMAGE:
                return appendImageAttachment(attachment, index);
            case MEDIA_TYPE.VIDEO:
                return appendVideoAttachment(attachment, index);
            case MEDIA_TYPE.AUDIO:
                return appendAudioAttachment(attachment, index);
        }

        console.warn(`Unknown media type: ${attachment.type}, defaulting to image.`, attachment);
        return appendImageAttachment(attachment, index);
    }

    /**
     * Saves the current playback times of media elements in the message.
     * @returns {Map<string, MediaState>} Media playback times by source URL
     */
    function saveMediaStates() {
        const states = new Map();
        const media = mediaWrapper.find('video, audio');
        // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
        media.each((_, element) => {
            if (element instanceof HTMLMediaElement) {
                if (!element.currentSrc || element.readyState === HTMLMediaElement.HAVE_NOTHING) {
                    return;
                }
                const state = { currentTime: element.currentTime, paused: element.paused };
                states.set(element.currentSrc, state);
            }
        });
        return states;
    }

    /**
     * Restores the playback times of media elements in the message.
     * @param {Map<string, MediaState>} states Media playback times by source URL
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'states' implicitly has an 'any' type.
    function restoreMediaStates(states) {
        const media = mediaWrapper.find('video, audio');
        // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
        media.each((_, element) => {
            if (element instanceof HTMLMediaElement) {
                const restoreState = () => {
                    if (!states.has(element.currentSrc)) {
                        return;
                    }
                    const state = states.get(element.currentSrc);
                    element.currentTime = state.currentTime;
                    if (!state.paused) {
                        element.play();
                    }
                };
                if (element.readyState < HTMLMediaElement.HAVE_METADATA) {
                    element.addEventListener('loadedmetadata', () => restoreState(), { once: true });
                } else {
                    restoreState();
                }
            }
        });
    }

    // Add media gallery to message
    if (hasMedia && mediaDisplay === MEDIA_DISPLAY.GALLERY) {
        const mediaIndex = getMediaIndex(mes);
        const selectedMedia = mes.extra.media[mediaIndex];

        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const galleryControls = $(document.querySelector('#message_gallery_controls .mes_img_swipes').cloneNode(true));
        const counter = galleryControls.find('.mes_img_swipe_counter');
        counter.text(`${mediaIndex + 1}/${mes.extra.media.length}`);

        const template = appendMediaAttachment(selectedMedia, mediaIndex);
        template.addClass('img_swipes');
        template[0].append(galleryControls[0]);
    }

    // Add media as a list to message
    if (hasMedia && mediaDisplay === MEDIA_DISPLAY.LIST) {
        for (let index = 0; index < mes.extra.media.length; index++) {
            const attachment = mes.extra.media[index];
            appendMediaAttachment(attachment, index);
        }
    }

    // Remove existing file containers
    fileWrapper[0].innerHTML = '';

    // Add files to message
    if (hasFiles) {
        for (let index = 0; index < mes.extra.files.length; index++) {
            const file = mes.extra.files[index];
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const template = $(document.querySelector('#message_file_template .mes_file_container').cloneNode(true));
            template.attr('data-index', index);
            template.find('.mes_file_name').text(file.name).attr('title', file.name);
            template.find('.mes_file_size').text(humanFileSize(file.size)).attr('title', file.size);
            fileWrapper[0].append(template[0]);
        }
    }

    // Early return if no media
    if (!hasMedia) {
        mediaWrapper[0].innerHTML = '';
        doAdjustScroll();
        return;
    }

    // TODO: Consider making this awaitable
    // @ts-expect-error TS(7005) FIXME: Variable 'mediaPromises' implicitly has an 'any[]'... Remove this comment to see the full error message
    Promise.race([Promise.all(mediaPromises), delay(debounce_timeout.short)]).then(() => {
        const states = saveMediaStates();
        mediaWrapper[0].innerHTML = '';
        // @ts-expect-error TS(7005) FIXME: Variable 'mediaBlocks' implicitly has an 'any[]' t... Remove this comment to see the full error message
        mediaWrapper[0].append(...mediaBlocks.map(el => el[0]));
        restoreMediaStates(states);
        doAdjustScroll();
    });
}

/**
 *
 * @param messageElement
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'messageElement' implicitly has an 'any'... Remove this comment to see the full error message
export function addCopyToCodeBlocks(messageElement) {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const codeBlocks = $(messageElement).find('pre code');
    for (let i = 0; i < codeBlocks.length; i++) {
        hljs.highlightElement(codeBlocks.get(i));
        const copyButton = document.createElement('i');
        copyButton.classList.add('fa-solid', 'fa-copy', 'code-copy', 'interactable');
        copyButton.title = 'Copy code';
        codeBlocks.get(i).appendChild(copyButton);
        copyButton.addEventListener('click', function (e) {
            e.stopPropagation();
        });
        copyButton.addEventListener('pointerup', async function () {
            const text = codeBlocks.get(i).textContent;
            await copyText(text);
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.info(t`Copied!`, '', { timeOut: 2000 });
        });
    }
}

/**
 * Shows or hides the Prompt display button
 * @param {ChatMessage} message Message object
 * @param {object} options Options
 * @param {number} [options.messageId] Message ID
 * @param {JQuery<HTMLElement>} [options.messageElement] Message element
 * @returns {void}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'message' implicitly has an 'any' type.
function updateMessageItemizedPromptButton(message, { messageId = chat.indexOf(message), messageElement = chatElement.find(`.mes[mesid="${messageId}"]`) }) {
    //if we have itemized messages, and the array isn't null..
    if (!message.is_user && Array.isArray(itemizedPrompts) && itemizedPrompts.length > 0) {
        // @ts-expect-error TS(2339) FIXME: Property 'mesId' does not exist on type 'never'.
        const itemizedPrompt = itemizedPrompts.find(x => Number(x.mesId) === Number(messageId));
        if (itemizedPrompt) {
            messageElement.find('.mes_prompt').show();
        }
    }
}

/**
 * Gets messageFormatting for a ChatMessage object.
 * @param {ChatMessage} message
 * @param {object} options Options
 * @param {number} [options.messageId] Message ID
 * @returns {string} Formatted message HTML
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'message' implicitly has an 'any' type.
function getMessageTextHTML(message, { messageId = chat.indexOf(message) }) {
    // if mes.extra.uses_system_ui is true, set an override on the sanitizer options
    /** @type {Partial<DOMPurify.Config>} */
    const sanitizerOverrides = message.extra?.uses_system_ui ? { MESSAGE_ALLOW_SYSTEM_UI: true } : {};

    return messageFormatting(
        message.extra?.display_text || message.mes,
        message.name,
        message.is_system,
        message.is_user,
        messageId,
        sanitizerOverrides,
        false,
    );
}

/**
 * Adds a single message to the chat.
 * @param {ChatMessage} mes Message object
 * @param {object} [options] Options
 * @param {string} [options.type] Deprecated. Use updateMessageElement instead.
 * @param {number} [options.insertAfter] Message ID to insert the new message after
 * @param {boolean} [options.scroll] Whether to scroll to the new message
 * @param {number} [options.insertBefore] Message ID to insert the new message before
 * @param {number} [options.forceId] Force the message ID
 * @param {boolean} [options.showSwipes] Whether to refresh the swipe buttons.
 * @returns {JQuery<HTMLElement>} The newly added message element
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'mes' implicitly has an 'any' type.
export function addOneMessage(mes, { type = undefined, insertAfter = null, scroll = true, insertBefore = null, forceId = null, showSwipes = true } = {}) {
    // Callers push the new message to chat before calling addOneMessage
    const messageId = (() => {
        if (typeof forceId === 'number') {
            return forceId;
        }
        if (typeof insertBefore === 'number') {
            return insertBefore - 1;
        }
        if (typeof insertAfter === 'number') {
            return insertAfter + 1;
        }
        // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
        const index = chat.indexOf(mes);
        if (index !== -1) {
            return index;
        }
        return chat.length - 1;
    })();

    let messageElement;

    if (type === 'swipe') {
        // Forbidden black magic
        // This allows to use "continue" on user messages
        mes.swipe_id ??= 0;
        mes.swipes ??= [mes.mes];
        //This keeps listeners intact.
        messageElement = chatElement.find(`[mesid="${messageId}"]`);
        updateMessageElement(mes, { messageId, messageElement, adjustMediaScroll: scroll ? SCROLL_BEHAVIOR.ADJUST : SCROLL_BEHAVIOR.NONE });
    } else {
        messageElement = updateMessageElement(mes, { messageId, adjustMediaScroll: scroll ? SCROLL_BEHAVIOR.ADJUST : SCROLL_BEHAVIOR.NONE });
        if (typeof insertAfter === 'number' && insertAfter >= 0) {
            const target = chatElement.find(`.mes[mesid="${insertAfter}"]`);
            target[0].insertAdjacentElement('afterend', messageElement[0]);
        } else if (typeof insertBefore === 'number' && insertBefore >= 0) {
            const target = chatElement.find(`.mes[mesid="${insertBefore}"]`);
            target[0].insertAdjacentElement('beforebegin', messageElement[0]);
        } else {
            chatElement[0].append(messageElement[0]);
        }
    }


    //last_mes should always be updated.
    chatElement.find('.mes').removeClass('last_mes');
    chatElement.find('.mes').last().addClass('last_mes');

    if (showSwipes) refreshSwipeButtons();
    // Don't scroll if not inserting last
    if (!insertAfter && !insertBefore && scroll) {
        scrollChatToBottom({ waitForFrame: true });
    }

    // @ts-expect-error TS(2322) FIXME: Type 'number' is not assignable to type 'never[]'.
    applyCharacterTagsToMessageDivs({ mesIds: messageId });
    updateEditArrowClasses();
    return messageElement;
}

/**
 * Creates the element of a single message as if it were the last message or at forceMesId
 * @param {ChatMessage} mes Message object
 * @param {object} [options] Options
 * @param {number} [options.messageId] Force the message ID
 * @param {JQuery<HTMLElement>} [options.messageElement] This message element will be updated with the ChatMessage object.
 * @param {SCROLL_BEHAVIOR} [options.adjustMediaScroll] Scroll behavior option passed to appendMediaToMessage.
 * @returns {JQuery<HTMLElement>} Rendered HTMLElement.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'mes' implicitly has an 'any' type.
export function updateMessageElement(mes, { messageId = chat.length - 1, messageElement = $(messageTemplate[0].cloneNode(true)), adjustMediaScroll = SCROLL_BEHAVIOR.NONE } = {}) {
    let avatarImg = getThumbnailUrl('persona', user_avatar);

    //for non-user messages
    if (!mes.is_user) {
        if (mes.force_avatar) {
            avatarImg = mes.force_avatar;
        } else if (this_chid === undefined) {
            avatarImg = system_avatar;
        } else if (characters[this_chid] && characters[this_chid].avatar !== 'none') {
            avatarImg = getThumbnailUrl('avatar', characters[this_chid].avatar);
        } else {
            avatarImg = default_avatar;
        }
        //old processing:
        //if message is from system, use the name provided in the message JSONL to proceed,
        //if not system message, use name2 (char's name) to proceed
        //characterName = mes.is_system || mes.force_avatar ? mes.name : name2;
    } else if (mes.is_user && mes.force_avatar) {
        // Special case for persona images.
        avatarImg = mes.force_avatar;
    }
    const momentDate = timestampToMoment(mes.send_date);
    const timestamp = momentDate.isValid() ? momentDate.format('LL LT') : '';
    const messageHTML = getMessageTextHTML(mes, { messageId });
    const bookmarkLink = mes?.extra?.bookmark_link;
    const tokenCount = mes.extra?.token_count;
    const { timerValue, timerTitle } = formatGenerationTimer(mes.gen_started, mes.gen_finished, mes.extra?.token_count, mes.extra?.reasoning_duration, mes.extra?.time_to_first_token);

    messageElement.attr({
        'mesid': messageId,
        'swipeid': mes.swipe_id ?? 0,
        'ch_name': mes.name,
        'is_user': mes.is_user,
        'is_system': !!mes.is_system,
        'bookmark_link': bookmarkLink,
        'force_avatar': !!mes.force_avatar,
        'timestamp': timestamp,
        // ...(type ?? { type }),
        'type': mes.extra?.type ?? '',
    });

    messageElement.find('.avatar img').attr('src', avatarImg);
    messageElement.find('.ch_name .name_text').text(mes.name);
    messageElement.find('.timestamp').text(timestamp).attr('title', `${mes.extra?.api ? mes.extra.api + ' - ' : ''}${mes.extra?.model ?? ''}`);
    messageElement.find('.mesIDDisplay').text(`#${messageId}`);
    if (tokenCount) messageElement.find('.tokenCounterDisplay').text(`${tokenCount}t`);
    if (mes.title) messageElement.attr('title', mes.title);
    if (timerValue) messageElement.find('.mes_timer').attr('title', timerTitle).text(timerValue);
    if (bookmarkLink) updateBookmarkDisplay(messageElement);

    if (mes.extra?.bias !== '') {
        const bias = messageFormatting(mes.extra?.bias, '', false, false, -1, {}, false);
        messageElement.find('.mes_bias').html(bias);
    }

    updateReasoningUI(messageElement);

    if (power_user.timestamp_model_icon && mes.extra?.api) {
        insertSVGIcon(messageElement, mes.extra);
    }

    if (mes?.extra?.isSmallSys === true) {
        messageElement.addClass('smallSysMes');
    }

    if (Array.isArray(mes?.extra?.tool_invocations)) {
        messageElement.addClass('toolCall');
    }

    updateMessageItemizedPromptButton(mes, { messageId, messageElement });

    messageElement.find('.avatar img').on('error', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $(this).hide();
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $(this).parent().html('<div class="missing-avatar fa-solid fa-user-slash"></div>');
    });

    appendMediaToMessage(mes, messageElement, adjustMediaScroll);
    messageElement.find('.mes_text').html(messageHTML);
    addCopyToCodeBlocks(messageElement);

    // Set the swipes counter for all non-user messages.
    if (!mes.is_user) {
        updateSwipeCounter(messageId, { message: mes, messageElement });
    }

    return messageElement;
}

/**
 * Returns the URL of the avatar for the given character Id.
 * @param {number|string} characterId Character Id
 * @returns {string} Avatar URL
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'characterId' implicitly has an 'any' ty... Remove this comment to see the full error message
export function getCharacterAvatar(characterId) {
    const character = characters[characterId];
    const avatarImg = character?.avatar;

    if (!avatarImg || avatarImg === 'none') {
        return default_avatar;
    }

    return formatCharacterAvatar(avatarImg);
}

/**
 *
 * @param characterAvatar
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'characterAvatar' implicitly has an 'any... Remove this comment to see the full error message
export function formatCharacterAvatar(characterAvatar) {
    return `characters/${characterAvatar}`;
}

/**
 * Formats the title for the generation timer.
 * @param {MessageTimestamp} gen_started Date when generation was started
 * @param {MessageTimestamp} gen_finished Date when generation was finished
 * @param {number} tokenCount Number of tokens generated (0 if not available)
 * @param {number?} [reasoningDuration] Reasoning duration (null if no reasoning was done)
 * @param {number?} [timeToFirstToken] Time to first token
 * @returns {object} Object containing the formatted timer value and title
 * @example
 * const { timerValue, timerTitle } = formatGenerationTimer(gen_started, gen_finished, tokenCount);
 * console.log(timerValue); // 1.2s
 * console.log(timerTitle); // Generation queued: 12:34:56 7 Jan 2021\nReply received: 12:34:57 7 Jan 2021\nTime to generate: 1.2 seconds\nToken rate: 5 t/s
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'gen_started' implicitly has an 'any' ty... Remove this comment to see the full error message
function formatGenerationTimer(gen_started, gen_finished, tokenCount, reasoningDuration = null, timeToFirstToken = null) {
    if (!gen_started || !gen_finished) {
        return {};
    }

    const dateFormat = 'HH:mm:ss D MMM YYYY';
    const start = moment(gen_started);
    const finish = moment(gen_finished);
    const seconds = finish.diff(start, 'seconds', true);
    const timerValue = `${seconds.toFixed(1)}s`;
    const timerTitle = [
        `Generation queued: ${start.format(dateFormat)}`,
        `Reply received: ${finish.format(dateFormat)}`,
        `Time to generate: ${seconds} seconds`,
        timeToFirstToken ? `Time to first token: ${timeToFirstToken / 1000} seconds` : '',
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        reasoningDuration > 0 ? `Time to think: ${reasoningDuration / 1000} seconds` : '',
        tokenCount > 0 ? `Token rate: ${Number(tokenCount / seconds).toFixed(3)} t/s` : '',
    ].filter(x => x).join('\n').trim();

    if (isNaN(seconds) || seconds < 0) {
        return { timerValue: '', timerTitle };
    }

    return { timerValue, timerTitle };
}

// @ts-expect-error TS(7034) FIXME: Variable 'requestId' implicitly has type 'any' in ... Remove this comment to see the full error message
let requestId = null;

/**
 * Scrolls the chat to the bottom if configured to do so.
 * @param {object} [options] Options
 * @param {boolean} [options.waitForFrame] If true, waits for the animation frame before scrolling
 */
export function scrollChatToBottom({
    waitForFrame
}: { waitForFrame?: boolean } = {}) {
    if (!power_user.auto_scroll_chat_to_bottom) {
        return;
    }

    const doScroll = () => {
        let position = chatElement[0].scrollHeight;

        if (power_user.waifuMode) {
            const lastMessage = chatElement.find('.mes').last();
            if (lastMessage.length) {
                const lastMessagePosition = lastMessage.position().top;
                position = chatElement.scrollTop() + lastMessagePosition;
            }
        }

        chatElement.scrollTop(position);
        requestId = null;
    };

    // Do not check truthiness. requestId can loop to zero.
    // @ts-expect-error TS(7005) FIXME: Variable 'requestId' implicitly has an 'any' type.
    if (requestId !== null) {
        // @ts-expect-error TS(7005) FIXME: Variable 'requestId' implicitly has an 'any' type.
        cancelAnimationFrame(requestId);
    }

    if (!waitForFrame) {
        doScroll();
        return;
    }

    // This prevents layout thrashing.
    // https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame#return_value
    // https://gist.github.com/paulirish/5d52fb081b3570c81e3a#file-what-forces-layout-md
    requestId = requestAnimationFrame(() => doScroll());
}

/**
 * @param content
 * @param additionalMacro
 * @param postProcessFn
 * @deprecated Function is not needed anymore, as the new signature of substituteParams is more flexible.
 *
 * Substitutes {{macro}} parameters in a string.
 * @returns {string} The string with substituted parameters.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'content' implicitly has an 'any' type.
export function substituteParamsExtended(content, additionalMacro = {}, postProcessFn = (x) => x) {
    return substituteParams(content, { dynamicMacros: additionalMacro, postProcessFn });
}

/**
 * Substitutes {{macro}} parameters in a string.
 * @param {string} content - The string to substitute parameters in.
 * @param {string} [_name1] - The name of the user. Uses global name1 if not provided.
 * @param {string} [_name2] - The name of the character. Uses global name2 if not provided.
 * @param {string} [_original] - The original message for {{original}} substitution.
 * @param {string} [_group] - The group members list for {{group}} substitution.
 * @param {boolean} [_replaceCharacterCard] - Whether to replace character card macros.
 * @param {Record<string,any>} [additionalMacro] - Additional environment variables for substitution.
 * @param {(x: string) => string} [postProcessFn] - Post-processing function for each substituted macro.
 * @returns {string} The string with substituted parameters.
 */
// @ts-expect-error TS(7023) FIXME: 'substituteParamsLegacy' implicitly has return typ... Remove this comment to see the full error message
export function substituteParamsLegacy(content, _name1, _name2, _original, _group, _replaceCharacterCard = true, additionalMacro = {}, postProcessFn = (x) => x) {
    if (!content) {
        return '';
    }

    // If experimental macro engine is enabled, use it. This code will be cleaned up in the future.
    if (power_user?.experimental_macro_engine) {
        return substituteParams(content, {
            name1Override: _name1,
            name2Override: _name2,
            original: _original,
            groupOverride: _group,
            replaceCharacterCard: _replaceCharacterCard ?? true,
            dynamicMacros: additionalMacro ?? {},
            postProcessFn: postProcessFn ?? ((x) => x),
        });
    }

    // Try to roughly detect experimental macro features to show the onboarding if needed.
    // This does not have to be 100% accurate, only best effort what we can quickly check.
    // Only do this if the warning wasn't shown yet, to prevent needless regex checks.
    if (accountStorage.getItem('slash_command_experimental_engine_warning_shown') !== 'true') {
        let feature = /** @type {string|null} */ (null);
        if (/{{\s*if/.test(content)) feature = '{{if}} macro';
        else if (/{{\s*\//.test(content)) feature = 'scoped macro';
        else if (/{{\s*[!?~#/]/.test(content)) feature = 'macro flags';
        else if (/{{\s*[.$]/.test(content)) feature = 'variable shorthands';
        else if (/\{\{(?:(?!\}\}).)*\{\{(?=[\s\S]*?\}\}[\s\S]*?\}\})/.test(content)) feature = 'nested macro';
        else if (/{{(?:greeting|charFirstMessage)(?:::\d+)?}}/i.test(content)) feature = 'greeting macro';

        if (feature) void onboardingExperimentalMacroEngine(feature);
    }

    const environment = {};

    if (typeof _original === 'string') {
        let originalSubstituted = false;
        // @ts-expect-error TS(2339) FIXME: Property 'original' does not exist on type '{}'.
        environment.original = () => {
            if (originalSubstituted) {
                return '';
            }

            originalSubstituted = true;
            return _original;
        };
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'includeMuted' implicitly has an 'any' t... Remove this comment to see the full error message
    const getGroupValue = (includeMuted) => {
        if (typeof _group === 'string') {
            return _group;
        }

        if (selected_group) {
            const members = groups.find(x => x.id === selected_group)?.members;
            /** @type {string[]} */
            const disabledMembers = groups.find(x => x.id === selected_group)?.disabled_members ?? [];
            // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
            const isMuted = x => includeMuted ? true : !disabledMembers.includes(x);
            const names = Array.isArray(members)
                ? members.filter(isMuted).map(m => characters.find(c => c.avatar === m)?.name).filter(Boolean).join(', ')
                : '';
            return names;
        } else {
            return _name2 ?? name2;
        }
    };

    const getNotCharValue = () => {
        const currentUser = _name1 ?? name1;
        const currentSpeaker = _name2 ?? name2;

        // Single character chat
        if (!selected_group) {
            return currentUser;
        }

        // Group chat
        const members = groups.find(x => x.id === selected_group)?.members;

        if (!Array.isArray(members)) {
            return currentUser;
        }

        const memberNames = members
            .map(m => characters.find(c => c.avatar === m)?.name)
            .filter(Boolean); // Filter out any null/undefined names

        // Filter out the current speaker and add the user
        const otherMembers = memberNames.filter(name => name !== currentSpeaker);
        otherMembers.push(currentUser);

        return otherMembers.join(', ');
    };

    if (_replaceCharacterCard) {
        const fields = getCharacterCardFields();
        // @ts-expect-error TS(2339) FIXME: Property 'charPrompt' does not exist on type '{}'.
        environment.charPrompt = fields.system || '';
        // @ts-expect-error TS(2339) FIXME: Property 'charInstruction' does not exist on type ... Remove this comment to see the full error message
        environment.charInstruction = environment.charJailbreak = fields.jailbreak || '';
        // @ts-expect-error TS(2339) FIXME: Property 'description' does not exist on type '{}'... Remove this comment to see the full error message
        environment.description = fields.description || '';
        // @ts-expect-error TS(2339) FIXME: Property 'personality' does not exist on type '{}'... Remove this comment to see the full error message
        environment.personality = fields.personality || '';
        // @ts-expect-error TS(2339) FIXME: Property 'scenario' does not exist on type '{}'.
        environment.scenario = fields.scenario || '';
        // @ts-expect-error TS(2339) FIXME: Property 'persona' does not exist on type '{}'.
        environment.persona = fields.persona || '';
        // @ts-expect-error TS(2339) FIXME: Property 'mesExamples' does not exist on type '{}'... Remove this comment to see the full error message
        environment.mesExamples = () => {
            const isInstruct = power_user.instruct.enabled && main_api !== 'openai';
            const mesExamplesArray = parseMesExamples(fields.mesExamples, isInstruct);
            if (isInstruct) {
                const instructExamples = formatInstructModeExamples(mesExamplesArray, name1, name2);
                return instructExamples.join('');
            }
            return mesExamplesArray.join('');
        };
        // @ts-expect-error TS(2339) FIXME: Property 'mesExamplesRaw' does not exist on type '... Remove this comment to see the full error message
        environment.mesExamplesRaw = fields.mesExamples || '';
        // @ts-expect-error TS(2339) FIXME: Property 'charVersion' does not exist on type '{}'... Remove this comment to see the full error message
        environment.charVersion = fields.version || '';
        // @ts-expect-error TS(2339) FIXME: Property 'char_version' does not exist on type '{}... Remove this comment to see the full error message
        environment.char_version = fields.version || '';
        // @ts-expect-error TS(2339) FIXME: Property 'charDepthPrompt' does not exist on type ... Remove this comment to see the full error message
        environment.charDepthPrompt = fields.charDepthPrompt || '';
        // @ts-expect-error TS(2339) FIXME: Property 'creatorNotes' does not exist on type '{}... Remove this comment to see the full error message
        environment.creatorNotes = fields.creatorNotes || '';
    }

    // Must be substituted last so that they're replaced inside {{description}}
    // @ts-expect-error TS(2339) FIXME: Property 'user' does not exist on type '{}'.
    environment.user = _name1 ?? name1;
    // @ts-expect-error TS(2339) FIXME: Property 'char' does not exist on type '{}'.
    environment.char = _name2 ?? name2;
    // @ts-expect-error TS(2339) FIXME: Property 'group' does not exist on type '{}'.
    environment.group = environment.charIfNotGroup = getGroupValue(true);
    // @ts-expect-error TS(2339) FIXME: Property 'groupNotMuted' does not exist on type '{... Remove this comment to see the full error message
    environment.groupNotMuted = getGroupValue(false);
    // @ts-expect-error TS(2339) FIXME: Property 'notChar' does not exist on type '{}'.
    environment.notChar = getNotCharValue();
    // @ts-expect-error TS(2339) FIXME: Property 'model' does not exist on type '{}'.
    environment.model = getGeneratingModel();

    if (additionalMacro && typeof additionalMacro === 'object') {
        Object.assign(environment, additionalMacro);
    }

    return evaluateMacros(content, environment, postProcessFn);
}

/** @typedef {import('./scripts/macros/engine/MacroRegistry.js').MacroHandler} MacroHandler */

/**
 * Substitutes {{macros}} in a string using the new macro engine.
 *
 * This will replace all registered macros and dynamic additional macros as environment context.
 * @param {string} content - The string to substitute parameters in.
 * @param {object} [options] - Options for the substitution.
 * @param {string} [options.name1Override] - The name of the user. Uses global name1 if not provided.
 * @param {string} [options.name2Override] - The name of the character. Uses global name2 if not provided.
 * @param {string} [options.original] - The original message for {{original}} substitution.
 * @param {string} [options.groupOverride] - The group members list for {{group}} substitution.
 * @param {boolean} [options.replaceCharacterCard] - Whether to replace character card macros.
 * @param {Record<string, import('./scripts/macros/engine/MacroEnv.types.js').DynamicMacroValue>} [options.dynamicMacros] - Additional environment variables as dynamic macros for substitution. Registered as macro functions.
 * @param {(x: string) => string} [options.postProcessFn] - Post-processing function for each substituted macro.
 * @returns {string} The string with substituted parameters.
 */
// @ts-expect-error TS(7023) FIXME: 'substituteParams' implicitly has return type 'any... Remove this comment to see the full error message
export function substituteParams(content, options = {}) {
    if (!content) return '';

    if (typeof content !== 'string') {
        console.warn('substituteParams: content will be coerced to string', content);
        content = String(content);
    }

    // Handle legacy signature calls to substituteParams
    // We'll simply re-route them to a temporary legacy function. In the future, we'll remove this and cleanly build the options object ourselves.
    const isOptionsObject = options && typeof options === 'object' && !Array.isArray(options);
    if (!isOptionsObject) {
        // @ts-expect-error TS(2554) FIXME: Expected 6-9 arguments, but got 3.
        return substituteParamsLegacy.call(this, content, options);
    }

    // Keep the new macro engine behind a feature switch for now
    if (!power_user?.experimental_macro_engine) {
        // @ts-expect-error TS(2339) FIXME: Property 'name1Override' does not exist on type '{... Remove this comment to see the full error message
        return substituteParamsLegacy(content, options.name1Override, options.name2Override, options.original, options.groupOverride, options.replaceCharacterCard, options.dynamicMacros, options.postProcessFn);
    }

    const ctx = /** @type {import('./scripts/macros/engine/MacroEnvBuilder.js').MacroEnvRawContext} */ ({
        content,
        // @ts-expect-error TS(2339) FIXME: Property 'name1Override' does not exist on type '{... Remove this comment to see the full error message
        name1Override: options.name1Override,
        // @ts-expect-error TS(2339) FIXME: Property 'name2Override' does not exist on type '{... Remove this comment to see the full error message
        name2Override: options.name2Override,
        // @ts-expect-error TS(2339) FIXME: Property 'original' does not exist on type '{}'.
        original: options.original,
        // @ts-expect-error TS(2339) FIXME: Property 'groupOverride' does not exist on type '{... Remove this comment to see the full error message
        groupOverride: options.groupOverride,
        // @ts-expect-error TS(2339) FIXME: Property 'replaceCharacterCard' does not exist on ... Remove this comment to see the full error message
        replaceCharacterCard: options.replaceCharacterCard ?? true,
        // @ts-expect-error TS(2339) FIXME: Property 'dynamicMacros' does not exist on type '{... Remove this comment to see the full error message
        dynamicMacros: options.dynamicMacros ?? {},
        // @ts-expect-error TS(2339) FIXME: Property 'postProcessFn' does not exist on type '{... Remove this comment to see the full error message
        postProcessFn: options.postProcessFn ?? ((x) => x),
    });

    const env = MacroEnvBuilder.buildFromRawEnv(ctx);
    const result = MacroEngine.evaluate(content, env);
    return result;
}


/**
 * Gets stopping sequences for the prompt.
 * @param {boolean} isImpersonate A request is made to impersonate a user
 * @param {boolean} isContinue A request is made to continue the message
 * @param {string} [api] Optional API name to get API-specific stopping sequences for
 * @returns {string[]} Array of stopping strings
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'isImpersonate' implicitly has an 'any' ... Remove this comment to see the full error message
export function getStoppingStrings(isImpersonate, isContinue, api = main_api) {
    // Only custom stop strings apply to Chat Completion
    if (api === 'openai') {
        return getCustomStoppingStrings();
    }

    const result = [];

    if (power_user.context.names_as_stop_strings) {
        const charString = `\n${name2}:`;
        const userString = `\n${name1}:`;
        result.push(isImpersonate ? charString : userString);

        result.push(userString);

        // @ts-expect-error TS(2339) FIXME: Property 'is_user' does not exist on type 'never'.
        if (isContinue && Array.isArray(chat) && chat[chat.length - 1]?.is_user) {
            result.push(charString);
        }

        // Add group members as stopping strings if generating for a specific group member or user. (Allow slash commands to work around name stopping string restrictions)
        if (selected_group && (name2 || isImpersonate)) {
            const group = groups.find(x => x.id === selected_group);

            if (group && Array.isArray(group.members)) {
                const names = group.members
                    .map(x => characters.find(y => y.avatar == x))
                    .filter(x => x && x.name && x.name !== name2)
                    .map(x => `\n${x.name}:`);
                result.push(...names);
            }
        }
    }

    result.push(...getInstructStoppingSequences());
    result.push(...getCustomStoppingStrings());

    if (power_user.single_line) {
        result.unshift('\n');
    }

    return result.filter(x => x).filter(onlyUnique);
}

/**
 * Background generation based on the provided prompt.
 * @typedef {object} GenerateQuietPromptParams
 * @property {string} [quietPrompt] Instruction prompt for the AI
 * @property {boolean} [quietToLoud] Whether the message should be sent in a foreground (loud) or background (quiet) mode
 * @property {boolean} [skipWIAN] Whether to skip addition of World Info and Author's Note into the prompt
 * @property {string} [quietImage] Image to use for the quiet prompt
 * @property {string} [quietName] Name to use for the quiet prompt (defaults to "System:")
 * @property {number} [responseLength] Maximum response length. If unset, the global default value is used.
 * @property {number} [forceChId] Character ID to use for this generation run. Works in groups only.
 * @property {object} [jsonSchema] JSON schema to use for the structured generation. Usually requires a special instruction.
 * @property {boolean} [removeReasoning] Parses and removes the reasoning block according to reasoning format preferences
 * @property {boolean} [trimToSentence] Whether to trim the response to the last complete sentence
 * @param {GenerateQuietPromptParams} params Parameters for the quiet prompt generation
 * @param {...any} args
 * @returns {Promise<string>} Generated text. If using structured output, will contain a serialized JSON object.
 * @property
 */
export async function generateQuietPrompt({ quietPrompt = '', quietToLoud = false, skipWIAN = false, quietImage = null, quietName = null, responseLength = null, forceChId = null, jsonSchema = null, removeReasoning = true, trimToSentence = false } = {}, ...args: unknown[]) {
    if (args.length > 0 && typeof args[0] !== 'object') {
        console.trace('generateQuietPrompt called with positional arguments. Please use an object instead.');
        // @ts-expect-error TS(2322) FIXME: Type 'unknown' is not assignable to type 'string'.
        [quietPrompt, quietToLoud, skipWIAN, quietImage, quietName, responseLength, forceChId, jsonSchema] = args;
    }

    const responseLengthCustomized = typeof responseLength === 'number' && responseLength > 0;
    let eventHook = () => { };
    try {
        /** @type {GenerateOptions} */
        const generateOptions = {
            quiet_prompt: quietPrompt ?? '',
            quietToLoud: quietToLoud ?? false,
            skipWIAN: skipWIAN ?? false,
            force_name2: true,
            quietImage: quietImage ?? null,
            quietName: quietName ?? null,
            force_chid: forceChId ?? null,
            jsonSchema: jsonSchema ?? null,
        };
        if (responseLengthCustomized) {
            TempResponseLength.save(main_api, responseLength);
            eventHook = TempResponseLength.setupEventHook(main_api);
        }
        let result = await Generate('quiet', generateOptions);
        result = trimToSentence ? trimToEndSentence(result) : result;
        result = removeReasoning ? removeReasoningFromString(result) : result;
        return result;
    } finally {
        if (responseLengthCustomized && TempResponseLength.isCustomized()) {
            TempResponseLength.restore(main_api);
            TempResponseLength.removeEventHook(main_api, eventHook);
        }
    }
}

/**
 * Executes slash commands and returns the new text and whether the generation was interrupted.
 * @param {string} message Text to be sent
 * @returns {Promise<boolean>} Whether the message sending was interrupted
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'message' implicitly has an 'any' type.
export async function processCommands(message) {
    if (!message || !message.trim().startsWith('/')) {
        return false;
    }
    await executeSlashCommandsOnChatInput(message, {
        clearChatInput: true,
    });
    return true;
}

/**
 * Extracts the contents of bias macros from a message.
 * @param {string} message Message text
 * @returns {string} Message bias extracted from the message (or an empty string if not found)
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'message' implicitly has an 'any' type.
export function extractMessageBias(message) {
    if (!message) {
        return '';
    }

    try {
        const biasHandlebars = Handlebars.create();
        // @ts-expect-error TS(7034) FIXME: Variable 'biasMatches' implicitly has type 'any[]'... Remove this comment to see the full error message
        const biasMatches = [];
        biasHandlebars.registerHelper('bias', function (text) {
            biasMatches.push(text);
            return '';
        });
        const template = biasHandlebars.compile(message);
        template({});

        // @ts-expect-error TS(7005) FIXME: Variable 'biasMatches' implicitly has an 'any[]' t... Remove this comment to see the full error message
        if (biasMatches && biasMatches.length > 0) {
            // @ts-expect-error TS(7005) FIXME: Variable 'biasMatches' implicitly has an 'any[]' t... Remove this comment to see the full error message
            return ` ${biasMatches.join(' ')}`;
        }

        return '';
    } catch {
        return '';
    }
}

/**
 * Removes impersonated group member lines from the group member messages.
 * Doesn't do anything if group reply trimming is disabled.
 * @param {string} getMessage Group message
 * @returns Cleaned-up group message
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'getMessage' implicitly has an 'any' typ... Remove this comment to see the full error message
function cleanGroupMessage(getMessage) {
    if (power_user.disable_group_trimming) {
        return getMessage;
    }

    const group = groups.find((x) => x.id == selected_group);

    if (group && Array.isArray(group.members) && group.members) {
        for (const member of group.members) {
            const character = characters.find(x => x.avatar == member);

            if (!character) {
                continue;
            }

            const name = character.name;

            // Skip current speaker.
            if (name === name2) {
                continue;
            }

            const regex = new RegExp(`(^|\n)${escapeRegex(name)}:`);
            const nameMatch = getMessage.match(regex);
            if (nameMatch) {
                getMessage = getMessage.substring(0, nameMatch.index);
            }
        }
    }
    return getMessage;
}

/**
 *
 */
function addPersonaDescriptionExtensionPrompt() {
    const INJECT_TAG = 'PERSONA_DESCRIPTION';
    setExtensionPrompt(INJECT_TAG, '', extension_prompt_types.IN_PROMPT, 0);

    if (!power_user.persona_description || power_user.persona_description_position === persona_description_positions.NONE) {
        return;
    }

    const promptPositions = [persona_description_positions.BOTTOM_AN, persona_description_positions.TOP_AN];

    if (promptPositions.includes(power_user.persona_description_position) && shouldWIAddPrompt) {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        const originalAN = extension_prompts[NOTE_MODULE_NAME].value;
        const ANWithDesc = power_user.persona_description_position === persona_description_positions.TOP_AN
            ? `${power_user.persona_description}\n${originalAN}`
            : `${originalAN}\n${power_user.persona_description}`;

        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        setExtensionPrompt(NOTE_MODULE_NAME, ANWithDesc, chat_metadata[metadata_keys.position], chat_metadata[metadata_keys.depth], extension_settings.note.allowWIScan, chat_metadata[metadata_keys.role]);
    }

    if (power_user.persona_description_position === persona_description_positions.AT_DEPTH) {
        setExtensionPrompt(INJECT_TAG, power_user.persona_description, extension_prompt_types.IN_CHAT, power_user.persona_description_depth, true, power_user.persona_description_role);
    }
}

/**
 * Returns all extension prompts combined.
 * @returns {Promise<string>} Combined extension prompts
 */
async function getAllExtensionPrompts() {
    const values = [];

    for (const prompt of Object.values(extension_prompts)) {
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        const value = prompt?.value?.trim();

        if (!value) {
            continue;
        }

        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        const hasFilter = typeof prompt.filter === 'function';
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        if (hasFilter && !(await prompt.filter())) {
            continue;
        }

        values.push(value);
    }

    return substituteParams(values.join('\n'));
}

/**
 * Wrapper to fetch extension prompts by module name
 * @param {string} moduleName Module name
 * @returns {Promise<string>} Extension prompt
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'moduleName' implicitly has an 'any' typ... Remove this comment to see the full error message
export async function getExtensionPromptByName(moduleName) {
    if (!moduleName) {
        return '';
    }

    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    const prompt = extension_prompts[moduleName];

    if (!prompt) {
        return '';
    }

    const hasFilter = typeof prompt.filter === 'function';

    if (hasFilter && !(await prompt.filter())) {
        return '';
    }

    return substituteParams(prompt.value);
}

/**
 * Gets the maximum depth of extension prompts.
 * @returns {number} Maximum depth of extension prompts
 */
export function getExtensionPromptMaxDepth() {
    return MAX_INJECTION_DEPTH;
    /*
    const prompts = Object.values(extension_prompts);
    const maxDepth = Math.max(...prompts.map(x => x.depth ?? 0));
    // Clamp to 1 <= depth <= MAX_INJECTION_DEPTH
    return Math.max(Math.min(maxDepth, MAX_INJECTION_DEPTH), 1);
    */
}

/**
 * Returns the extension prompt for the given position, depth, and role.
 * If multiple prompts are found, they are joined with a separator.
 * @param {number} [position] Position of the prompt
 * @param {number} [depth] Depth of the prompt
 * @param {string} [separator] Separator for joining multiple prompts
 * @param {number} [role] Role of the prompt
 * @param {boolean} [wrap] Wrap start and end with a separator
 * @returns {Promise<string>} Extension prompt
 */
export async function getExtensionPrompt(position = extension_prompt_types.IN_PROMPT, depth = undefined, separator = '\n', role = undefined, wrap = true) {
    // @ts-expect-error TS(7006) FIXME: Parameter 'prompt' implicitly has an 'any' type.
    const filterByFunction = async (prompt) => {
        const hasFilter = typeof prompt.filter === 'function';
        if (hasFilter && !(await prompt.filter())) {
            return false;
        }
        return true;
    };
    const promptPromises = Object.keys(extension_prompts)
        .sort()
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        .map((x) => extension_prompts[x])
        .filter(x => x.position == position && x.value)
        .filter(x => depth === undefined || x.depth === undefined || x.depth === depth)
        .filter(x => role === undefined || x.role === undefined || x.role === role)
        .filter(filterByFunction);
    const prompts = await Promise.all(promptPromises);

    let values = prompts.map((x: { value: string }) => x.value.trim()).join(separator);
    if (wrap && values.length && !values.startsWith(separator)) {
        values = separator + values;
    }
    if (wrap && values.length && !values.endsWith(separator)) {
        values = values + separator;
    }
    if (values.length) {
        values = substituteParams(values);
    }
    return values;
}

/**
 * Base chat replacement function for character card fields.
 * 1. Substitutes macros using substituteParams.
 * 2. Collapses newlines if enabled in power user settings.
 * 3. Removes carriage return characters.
 * @param {string} value Input string
 * @param {string?} name1Override Override for name1
 * @param {string?} name2Override Override for name2
 * @returns {string} Processed string
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
export function baseChatReplace(value, name1Override = null, name2Override = null) {
    if (typeof value === 'string' && value.length > 0) {
        value = substituteParams(value, { name1Override, name2Override, replaceCharacterCard: false });

        if (power_user.collapse_newlines) {
            value = collapseNewlines(value);
        }

        value = value.replace(/\r/g, '');
    }
    return value;
}

/**
 * @typedef {object} CharacterCardFields
 * @property {string} system System prompt
 * @property {string} mesExamples Message examples
 * @property {string} description Description
 * @property {string} personality Personality
 * @property {string} persona Persona
 * @property {string} scenario Scenario
 * @property {string} jailbreak Jailbreak instructions
 * @property {string} version Character version
 * @property {string} charDepthPrompt Character depth note
 * @property {string} creatorNotes Character creator notes
 * @property {string} firstMessage Character first message / greeting
 * @property {string[]} alternateGreetings Character alternate greetings
 */

/**
 * Helper to create an object with lazy, memoized getters from a map of field resolvers.
 * @param {Record<string, () => string|string[]>} resolvers Map of field names to resolver functions
 * @returns {CharacterCardFields} Object with lazy getters
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'resolvers' implicitly has an 'any' type... Remove this comment to see the full error message
export function createLazyFields(resolvers) {
    const result = /** @type {CharacterCardFields} */ ({});
    for (const [key, resolver] of Object.entries(resolvers)) {
        // @ts-expect-error TS(7034) FIXME: Variable 'cached' implicitly has type 'any' in som... Remove this comment to see the full error message
        let cached;
        let resolved = false;
        Object.defineProperty(result, key, {
            get() {
                if (!resolved) {
                    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                    cached = resolver();
                    resolved = true;
                }
                // @ts-expect-error TS(7005) FIXME: Variable 'cached' implicitly has an 'any' type.
                return cached;
            },
            enumerable: true,
            configurable: true,
        });
    }
    return result;
}

/**
 * Returns the character card fields for the current character as lazy getters.
 * Each field is only processed (baseChatReplace) when first accessed.
 * @param {object} [options]
 * @param {number} [options.chid] Optional character index
 * @returns {CharacterCardFields} Character card fields with lazy evaluation
 */
export function getCharacterCardFieldsLazy({ chid = undefined } = {}) {
    const currentChid = chid ?? this_chid;
    const character = characters[currentChid];

    // For group chats, we need to check if group cards should be used
    const useGroupCards = selected_group && character;
    const groupCardsLazy = useGroupCards ? getGroupCharacterCardsLazy(selected_group, Number(currentChid)) : null;

    /** @type {Record<string, () => string|string[]>} */
    const resolvers = {
        persona: () => baseChatReplace(power_user.persona_description?.trim()),
        system: () => {
            if (!character) return '';
            const systemPrompt = chat_metadata.system_prompt || character.data?.system_prompt || '';
            return power_user.prefer_character_prompt ? baseChatReplace(systemPrompt.trim()) : '';
        },
        jailbreak: () => {
            if (!character) return '';
            return power_user.prefer_character_jailbreak ? baseChatReplace(character.data?.post_history_instructions?.trim()) : '';
        },
        version: () => character?.data?.character_version ?? '',
        charDepthPrompt: () => {
            if (!character) return '';
            return baseChatReplace(character.data?.extensions?.depth_prompt?.prompt?.trim());
        },
        creatorNotes: () => {
            if (!character) return '';
            return baseChatReplace(character.data?.creator_notes?.trim());
        },
        // These four fields may be overridden by group cards
        description: () => {
            // @ts-expect-error TS(2339) FIXME: Property 'description' does not exist on type '{}'... Remove this comment to see the full error message
            if (groupCardsLazy) return groupCardsLazy.description;
            if (!character) return '';
            return baseChatReplace(character.description?.trim());
        },
        personality: () => {
            // @ts-expect-error TS(2339) FIXME: Property 'personality' does not exist on type '{}'... Remove this comment to see the full error message
            if (groupCardsLazy) return groupCardsLazy.personality;
            if (!character) return '';
            return baseChatReplace(character.personality?.trim());
        },
        scenario: () => {
            // @ts-expect-error TS(2339) FIXME: Property 'scenario' does not exist on type '{}'.
            if (groupCardsLazy) return groupCardsLazy.scenario;
            if (!character) return '';
            const scenarioText = chat_metadata.scenario || character.scenario || '';
            return baseChatReplace(scenarioText.trim());
        },
        mesExamples: () => {
            // @ts-expect-error TS(2339) FIXME: Property 'mesExamples' does not exist on type '{}'... Remove this comment to see the full error message
            if (groupCardsLazy) return groupCardsLazy.mesExamples;
            if (!character) return '';
            const exampleDialog = chat_metadata.mes_example || character.mes_example || '';
            return baseChatReplace(exampleDialog.trim());
        },
        firstMessage: () => {
            if (!character) return '';
            const firstMes = character.first_mes?.trim() || '';
            return baseChatReplace(firstMes);
        },
        alternateGreetings: () => {
            if (!character) return [];
            const altGreetings = character.data?.alternate_greetings;
            if (!Array.isArray(altGreetings)) return [];
            return altGreetings.map(greeting => baseChatReplace(greeting?.trim()));
        },
    };

    return createLazyFields(resolvers);
}

/**
 * Returns the character card fields for the current character.
 * @param {object} [options]
 * @param {number} [options.chid] Optional character index
 * @returns {CharacterCardFields} Character card fields
 */
export function getCharacterCardFields({ chid = undefined } = {}) {
    const lazy = getCharacterCardFieldsLazy({ chid });

    // Resolve all lazy fields into a plain object
    return {
        // @ts-expect-error TS(2339) FIXME: Property 'system' does not exist on type '{}'.
        system: lazy.system,
        // @ts-expect-error TS(2339) FIXME: Property 'mesExamples' does not exist on type '{}'... Remove this comment to see the full error message
        mesExamples: lazy.mesExamples,
        // @ts-expect-error TS(2339) FIXME: Property 'description' does not exist on type '{}'... Remove this comment to see the full error message
        description: lazy.description,
        // @ts-expect-error TS(2339) FIXME: Property 'personality' does not exist on type '{}'... Remove this comment to see the full error message
        personality: lazy.personality,
        // @ts-expect-error TS(2339) FIXME: Property 'persona' does not exist on type '{}'.
        persona: lazy.persona,
        // @ts-expect-error TS(2339) FIXME: Property 'scenario' does not exist on type '{}'.
        scenario: lazy.scenario,
        // @ts-expect-error TS(2339) FIXME: Property 'jailbreak' does not exist on type '{}'.
        jailbreak: lazy.jailbreak,
        // @ts-expect-error TS(2339) FIXME: Property 'version' does not exist on type '{}'.
        version: lazy.version,
        // @ts-expect-error TS(2339) FIXME: Property 'charDepthPrompt' does not exist on type ... Remove this comment to see the full error message
        charDepthPrompt: lazy.charDepthPrompt,
        // @ts-expect-error TS(2339) FIXME: Property 'creatorNotes' does not exist on type '{}... Remove this comment to see the full error message
        creatorNotes: lazy.creatorNotes,
        // @ts-expect-error TS(2339) FIXME: Property 'firstMessage' does not exist on type '{}... Remove this comment to see the full error message
        firstMessage: lazy.firstMessage,
        // @ts-expect-error TS(2339) FIXME: Property 'alternateGreetings' does not exist on ty... Remove this comment to see the full error message
        alternateGreetings: lazy.alternateGreetings,
    };
}

/**
 * Parses an examples string.
 * @param {string} examplesStr
 * @param isInstruct
 * @returns {string[]} Examples array with block heading
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'examplesStr' implicitly has an 'any' ty... Remove this comment to see the full error message
export function parseMesExamples(examplesStr, isInstruct) {
    if (!examplesStr || examplesStr.length === 0 || examplesStr === '<START>') {
        return [];
    }

    if (!examplesStr.startsWith('<START>')) {
        examplesStr = '<START>\n' + examplesStr.trim();
    }

    const exampleSeparator = power_user.context.example_separator ? `${substituteParams(power_user.context.example_separator)}\n` : '';
    const blockHeading = (main_api === 'openai' || isInstruct) ? '<START>\n' : exampleSeparator;
    // @ts-expect-error TS(7006) FIXME: Parameter 'block' implicitly has an 'any' type.
    const splitExamples = examplesStr.split(/<START>/gi).slice(1).map(block => `${blockHeading}${block.trim()}\n`);

    return splitExamples;
}

/**
 *
 */
export function isStreamingEnabled() {
    return (
        (main_api == 'openai' &&
            oai_settings.stream_openai &&
            !(oai_settings.chat_completion_source == chat_completion_sources.OPENAI && ['o1-2024-12-17', 'o1'].includes(oai_settings.openai_model))
        )
        || (main_api == 'kobold' && kai_settings.streaming_kobold && kai_flags.can_use_streaming)
        || (main_api == 'novel' && nai_settings.streaming_novel)
        || (main_api == 'textgenerationwebui' && textgen_settings.streaming));
}

/**
 *
 */
function showStopButton() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#mes_stop').css({ 'display': 'flex' });
}

/**
 *
 */
function hideStopButton() {
    // prevent NOOP, because hideStopButton() gets called multiple times
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    if ($('#mes_stop').css('display') !== 'none') {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#mes_stop').css({ 'display': 'none' });
        eventSource.emit(event_types.GENERATION_ENDED, chat.length);
    }
}

class StreamingProcessor {
    abortController: AbortController;
    continueMessage: string;
    createdAt: Date;
    firstMessageText: string;
    force_name2: boolean;
    generator: AsyncGenerator;
    images: string[];
    isFinished: boolean;
    isStopped: boolean;
    messageDom: HTMLElement | null;
    messageId: number;
    // @ts-expect-error TS(2304) FIXME: Cannot find name 'TokenLogprobs'.
    messageLogprobs: TokenLogprobs[];
    messageTextDom: HTMLElement | null;
    messageTimerDom: HTMLElement | null;
    messageTokenCounterDom: HTMLElement | null;
    promptReasoning: PromptReasoning;
    reasoningHandler: ReasoningHandler;
    reasoningSignature: string | null;
    result: string;
    sendTextarea: HTMLTextAreaElement;
    // @ts-expect-error TS(2564) FIXME: Property 'stoppingStrings' has no initializer and ... Remove this comment to see the full error message
    stoppingStrings: string[];
    swipes: string[];
    timeStarted: Date;
    timeToFirstToken: number | null;
    toolCalls: unknown[];
    type: string;
    /**
     * Creates a new streaming processor.
     * @param {string} type Generation type
     * @param {boolean} forceName2 If true, force the use of name2
     * @param {Date} timeStarted Date when generation was started
     * @param {string} continueMessage Previous message if the type is 'continue'
     * @param {PromptReasoning} promptReasoning Prompt reasoning instance
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
    constructor(type, forceName2, timeStarted, continueMessage, promptReasoning) {
        this.result = '';
        this.messageId = -1;
        /** @type {HTMLElement} */
        this.messageDom = null;
        /** @type {HTMLElement} */
        this.messageTextDom = null;
        /** @type {HTMLElement} */
        this.messageTimerDom = null;
        /** @type {HTMLElement} */
        this.messageTokenCounterDom = null;
        /** @type {HTMLTextAreaElement} */
        // @ts-expect-error TS(2322) FIXME: Type 'HTMLTextAreaElement | null' is not assignabl... Remove this comment to see the full error message
        this.sendTextarea = document.querySelector('#send_textarea');
        this.type = type;
        this.force_name2 = forceName2;
        this.isStopped = false;
        this.isFinished = false;
        // @ts-expect-error TS(2322) FIXME: Type '() => AsyncGenerator<never, void, unknown>' ... Remove this comment to see the full error message
        this.generator = this.nullStreamingGeneration;
        this.abortController = new AbortController();
        this.firstMessageText = '...';
        this.timeStarted = timeStarted;
        /** @type {number?} */
        this.timeToFirstToken = null;
        this.createdAt = new Date();
        this.continueMessage = type === 'continue' ? continueMessage : '';
        this.swipes = [];
        /** @type {import('./scripts/logprobs.js').TokenLogprobs[]} */
        this.messageLogprobs = [];
        this.toolCalls = [];
        // Initialize reasoning in its own handler
        this.reasoningHandler = new ReasoningHandler(timeStarted);
        /** @type {PromptReasoning} */
        this.promptReasoning = promptReasoning;
        /** @type {string[]} */
        this.images = [];
        /** @type {string?} */
        this.reasoningSignature = null;
    }

    /**
     * Initializes DOM elements for the current message.
     * @param {number} messageId Current message ID
     * @param {boolean?} continueOnReasoning If continuing on reasoning
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'messageId' implicitly has an 'any' type... Remove this comment to see the full error message
    async #checkDomElements(messageId, continueOnReasoning = null) {
        if (this.messageDom === null || this.messageTextDom === null) {
            this.messageDom = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
            // @ts-expect-error TS(2322) FIXME: Type 'HTMLElement | null | undefined' is not assig... Remove this comment to see the full error message
            this.messageTextDom = this.messageDom?.querySelector('.mes_text');
            // @ts-expect-error TS(2322) FIXME: Type 'HTMLElement | null | undefined' is not assig... Remove this comment to see the full error message
            this.messageTimerDom = this.messageDom?.querySelector('.mes_timer');
            // @ts-expect-error TS(2322) FIXME: Type 'HTMLElement | null | undefined' is not assig... Remove this comment to see the full error message
            this.messageTokenCounterDom = this.messageDom?.querySelector('.tokenCounterDisplay');
        }
        if (continueOnReasoning) {
            await this.reasoningHandler.process(messageId, false, this.promptReasoning);
        }
        this.reasoningHandler.updateDom(messageId);
    }

    #updateMessageBlockVisibility() {
        if (this.messageDom instanceof HTMLElement && Array.isArray(this.toolCalls) && this.toolCalls.length > 0) {
            const shouldHide = ['', '...'].includes(this.result) && !this.reasoningHandler.reasoning;
            this.messageDom.classList.toggle('displayNone', shouldHide);
        }
    }

    markUIGenStarted() {
        deactivateSendButtons();
    }

    markUIGenStopped() {
        // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
        unblockGeneration();
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'text' implicitly has an 'any' type.
    async onStartStreaming(text) {
        const continueOnReasoning = !!(this.type === 'continue' && this.promptReasoning.prefixReasoning);
        if (continueOnReasoning) {
            this.reasoningHandler.initContinue(this.promptReasoning);
        }

        let messageId = -1;

        if (this.type == 'impersonate') {
            this.sendTextarea.value = '';
            this.sendTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            await saveReply({ type: this.type, getMessage: text, fromStreaming: true });
            messageId = chat.length - 1;
            // @ts-expect-error TS(2345) FIXME: Argument of type 'boolean' is not assignable to pa... Remove this comment to see the full error message
            await this.#checkDomElements(messageId, continueOnReasoning);
            this.markUIGenStarted();
        }
        hideSwipeButtons({ hideCounters: true });
        scrollChatToBottom({ waitForFrame: true });
        return messageId;
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'messageId' implicitly has an 'any' type... Remove this comment to see the full error message
    async onProgressStreaming(messageId, text, isFinal) {
        const isImpersonate = this.type == 'impersonate';
        const isContinue = this.type == 'continue';

        if (!isImpersonate && !isContinue && Array.isArray(this.swipes) && this.swipes.length > 0) {
            for (let i = 0; i < this.swipes.length; i++) {
                // @ts-expect-error TS(2322) FIXME: Type 'unknown' is not assignable to type 'string'.
                this.swipes[i] = cleanUpMessage({
                    getMessage: this.swipes[i],
                    isImpersonate: false,
                    isContinue: false,
                    displayIncompleteSentences: true,
                    stoppingStrings: this.stoppingStrings,
                });
            }
        }

        let processedText = cleanUpMessage({
            getMessage: text,
            isImpersonate: isImpersonate,
            isContinue: isContinue,
            displayIncompleteSentences: !isFinal,
            stoppingStrings: this.stoppingStrings,
        });

        const charsToBalance = ['*', '"', '```', '~~~'];
        for (const char of charsToBalance) {
            if (!isFinal && isOdd(countOccurrences(processedText, char))) {
                const separator = char.length > 1 ? '\n' : '';
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                processedText = processedText.trimEnd() + separator + char;
            }
        }

        if (isImpersonate) {
            // @ts-expect-error TS(2322) FIXME: Type 'unknown' is not assignable to type 'string'.
            this.sendTextarea.value = processedText;
            this.sendTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            const mesChanged = chat[messageId].mes !== processedText;
            await this.#checkDomElements(messageId);
            this.#updateMessageBlockVisibility();
            const currentTime = new Date();
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            chat[messageId].mes = processedText;
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            chat[messageId].gen_started = this.timeStarted;
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            chat[messageId].gen_finished = currentTime;
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            if (!chat[messageId].extra) {
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                chat[messageId].extra = {};
            }
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            chat[messageId].extra.time_to_first_token = this.timeToFirstToken;

            // Update reasoning
            await this.reasoningHandler.process(messageId, mesChanged, this.promptReasoning);
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            processedText = chat[messageId].mes;

            // Token count update.
            const tokenCountText = this.reasoningHandler.reasoning + processedText;
            // @ts-expect-error TS(2345) FIXME: Argument of type '0' is not assignable to paramete... Remove this comment to see the full error message
            const currentTokenCount = isFinal && power_user.message_token_count_enabled ? await getTokenCountAsync(tokenCountText, 0) : 0;
            if (currentTokenCount) {
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                chat[messageId].extra.token_count = currentTokenCount;
                if (this.messageTokenCounterDom instanceof HTMLElement) {
                    this.messageTokenCounterDom.textContent = `${currentTokenCount}t`;
                }
            }

            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            if ((this.type == 'swipe' || this.type === 'continue') && Array.isArray(chat[messageId].swipes)) {
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                chat[messageId].swipes[chat[messageId].swipe_id] = processedText;
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                chat[messageId].swipe_info[chat[messageId].swipe_id] = {
                    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                    'send_date': chat[messageId].send_date,
                    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                    'gen_started': chat[messageId].gen_started,
                    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                    'gen_finished': chat[messageId].gen_finished,
                    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                    'extra': structuredClone(chat[messageId].extra),
                };
            }

            const formattedText = messageFormatting(
                processedText,
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                chat[messageId].name,
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                chat[messageId].is_system,
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                chat[messageId].is_user,
                messageId,
                {},
                false,
            );
            if (this.messageTextDom instanceof HTMLElement) {
                if (power_user.stream_fade_in) {
                    applyStreamFadeIn(this.messageTextDom, formattedText);
                } else {
                    this.messageTextDom.innerHTML = formattedText;
                }
            }

            // @ts-expect-error TS(2345) FIXME: Argument of type 'number | null' is not assignable... Remove this comment to see the full error message
            const timePassed = formatGenerationTimer(this.timeStarted, currentTime, currentTokenCount, this.reasoningHandler.getDuration(), this.timeToFirstToken);
            if (this.messageTimerDom instanceof HTMLElement) {
                // @ts-expect-error TS(2322) FIXME: Type 'string | undefined' is not assignable to typ... Remove this comment to see the full error message
                this.messageTimerDom.textContent = timePassed.timerValue;
                // @ts-expect-error TS(2322) FIXME: Type 'string | undefined' is not assignable to typ... Remove this comment to see the full error message
                this.messageTimerDom.title = timePassed.timerTitle;
            }

            this.setFirstSwipe(messageId);
        }

        if (!scrollLock) {
            scrollChatToBottom({ waitForFrame: true });
        }
    }

    /**
     * Finalizes an intermediary message after generation is complete, or a tool call is performed.
     * Performs essential message processing (code blocks, reasoning, swipes, attachments, events)
     * without the heavier finish operations (UI unlock - optional, auto-swipe, sound, save chat).
     * @param {number} messageId - The message ID to finalize.
     * @param {string} text - The message text.
     * @param {object} options - Additional options for finalization.
     * @param {boolean} options.unlockUI - Whether to unlock the generation UI.
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'messageId' implicitly has an 'any' type... Remove this comment to see the full error message
    async finalizeIntermediaryMessage(messageId, text, { unlockUI = true }) {
        await this.onProgressStreaming(messageId, text, true);
        const messageElement = chatElement.find(`.mes[mesid="${messageId}"]`);
        const message = chat[messageId];
        addCopyToCodeBlocks(messageElement);

        await this.reasoningHandler.finish(messageId);

        if (Array.isArray(this.swipes) && this.swipes.length > 0) {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            const swipeInfoExtra = structuredClone(message.extra ?? {});
            delete swipeInfoExtra.token_count;
            delete swipeInfoExtra.reasoning;
            delete swipeInfoExtra.reasoning_duration;
            const swipeInfo = {
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                send_date: message.send_date,
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                gen_started: message.gen_started,
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                gen_finished: message.gen_finished,
                extra: swipeInfoExtra,
            };
            // @ts-expect-error TS(2554) FIXME: Expected 1-3 arguments, but got 0.
            const swipeInfoArray = Array(this.swipes.length).fill().map(() => structuredClone(swipeInfo));
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            parseReasoningInSwipes(this.swipes, swipeInfoArray, message.extra?.reasoning_duration);
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            message.swipes.push(...this.swipes);
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            message.swipe_info.push(...swipeInfoArray);
        }

        syncMesToSwipe(messageId);
        saveLogprobsForActiveMessage(this.messageLogprobs.filter(Boolean), this.continueMessage);

        if (Array.isArray(this.images) && this.images.length > 0) {
            await processImageAttachment(message, { imageUrls: this.images });
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            appendMediaToMessage(message, $(this.messageDom));
        }

        // Store reasoning signature for models that support multi-turn context
        if (this.reasoningSignature) {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            message.extra = message.extra || {};
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            message.extra.reasoning_signature = this.reasoningSignature;
        }

        if (unlockUI) {
            this.markUIGenStopped();
        }

        if (this.type !== 'impersonate') {
            await eventSource.emit(event_types.MESSAGE_RECEIVED, this.messageId, this.type);
            await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, this.messageId, this.type);
        } else {
            await eventSource.emit(event_types.IMPERSONATE_READY, text);
        }

        updateSwipeCounter(messageId, { message, messageElement });
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'messageId' implicitly has an 'any' type... Remove this comment to see the full error message
    async onFinishStreaming(messageId, text) {
        await this.finalizeIntermediaryMessage(messageId, text, { unlockUI: true });

        const isAborted = this.abortController.signal.aborted;
        if (!isAborted && power_user.auto_swipe && generatedTextFiltered(text)) {
            return await swipe(null, SWIPE_DIRECTION.RIGHT, { source: SWIPE_SOURCE.AUTO_SWIPE, repeated: true, forceMesId: chat.length - 1 });
        }
        await saveChatConditional();

        playMessageSound();
    }

    onErrorStreaming() {
        this.abortController.abort();
        this.isStopped = true;

        this.markUIGenStopped();

        const noEmitTypes = ['swipe', 'impersonate', 'continue'];
        if (!noEmitTypes.includes(this.type)) {
            eventSource.emit(event_types.MESSAGE_RECEIVED, this.messageId, this.type);
            eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, this.messageId, this.type);
        }
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'messageId' implicitly has an 'any' type... Remove this comment to see the full error message
    setFirstSwipe(messageId) {
        if (this.type !== 'swipe' && this.type !== 'impersonate') {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            if (Array.isArray(chat[messageId].swipes) && chat[messageId].swipes.length === 1 && chat[messageId].swipe_id === 0) {
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                chat[messageId].swipes[0] = chat[messageId].mes;
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                chat[messageId].swipe_info[0] = {
                    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                    'send_date': chat[messageId].send_date,
                    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                    'gen_started': chat[messageId].gen_started,
                    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                    'gen_finished': chat[messageId].gen_finished,
                    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                    'extra': structuredClone(chat[messageId].extra),
                };
            }
        }
    }

    onStopStreaming() {
        this.abortController.abort();
        this.isFinished = true;
    }

    /**
     * @returns {AsyncGenerator<{ text: string, swipes: string[], logprobs: import('./scripts/logprobs.js').TokenLogprobs, toolCalls: any[], state: any }, void, void>}
     */
    async* nullStreamingGeneration() {
        throw new Error('Generation function for streaming is not hooked up');
    }

    async generate() {
        if (this.messageId == -1) {
            this.messageId = await this.onStartStreaming(this.firstMessageText);
            await delay(1); // delay for message to be rendered
            scrollLock = false;
        }

        // Stopping strings are expensive to calculate, especially with macros enabled. To remove stopping strings
        // when streaming, we cache the result of getStoppingStrings instead of calling it once per token.
        const isImpersonate = this.type == 'impersonate';
        const isContinue = this.type == 'continue';
        this.stoppingStrings = getStoppingStrings(isImpersonate, isContinue, main_api);

        try {
            const sw = new Stopwatch(1000 / power_user.streaming_fps);
            const timestamps = [];
            // @ts-expect-error TS(2349) FIXME: This expression is not callable.
            for await (const { text, swipes, logprobs, toolCalls, state } of this.generator()) {
                const now = Date.now();
                timestamps.push(now);
                if (!this.timeToFirstToken) {
                    this.timeToFirstToken = now - this.createdAt.getTime();
                }
                if (this.isStopped || this.abortController.signal.aborted) {
                    return this.result;
                }

                this.toolCalls = toolCalls;
                this.result = text;
                this.swipes = Array.from(swipes ?? []);
                if (logprobs) {
                    this.messageLogprobs.push(...(Array.isArray(logprobs) ? logprobs : [logprobs]));
                }
                // Get the updated reasoning string into the handler
                this.reasoningHandler.updateReasoning(this.messageId, state?.reasoning);
                this.images = state?.images ?? [];
                this.reasoningSignature = state?.signature ?? null;
                await eventSource.emit(event_types.STREAM_TOKEN_RECEIVED, text);
                // @ts-expect-error TS(2554) FIXME: Expected 3 arguments, but got 2.
                await sw.tick(async () => await this.onProgressStreaming(this.messageId, this.continueMessage + text));
            }
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            const seconds = (timestamps[timestamps.length - 1] - timestamps[0]) / 1000;
            console.warn(`Stream stats: ${timestamps.length} tokens, ${seconds.toFixed(2)} seconds, rate: ${Number(timestamps.length / seconds).toFixed(2)} TPS`);
        } catch (err) {
            // in the case of a self-inflicted abort, we have already cleaned up
            if (!this.isFinished) {
                console.error(err);
                this.onErrorStreaming();
            }
            return this.result;
        }

        this.isFinished = true;
        return this.result;
    }
}

/**
 * Constructs a prompt to be used for either Text Completion or Chat Completion. Input is format-agnostic.
 * @param {string | object[]} prompt Input prompt. Can be a string or an array of chat-style messages, i.e. [{role: '', content: ''}, ...]
 * @param {string} api API to use.
 * @param {boolean} instructOverride true to override instruct mode, false to use the default value
 * @param {boolean} quietToLoud true to generate a message in system mode, false to generate a message in character mode
 * @param {string} [systemPrompt] System prompt to use.
 * @param {string} [prefill] Prefill for the prompt.
 * @returns {string | object[]} Prompt ready for use in generation. If using TC, this will be a string. If using CC, this will be an array of chat-style messages.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'prompt' implicitly has an 'any' type.
export function createRawPrompt(prompt, api, instructOverride, quietToLoud, systemPrompt, prefill) {
    const isInstruct = power_user.instruct.enabled && api !== 'openai' && api !== 'novel' && !instructOverride;

    // If the prompt was given as a string, convert to a message-style object assuming user role
    if (typeof prompt === 'string') {
        const message = { role: 'user', content: prompt.trim() };
        prompt = [message];
    } else {  // checks for message-style object
        if (prompt.length === 0 && !systemPrompt) throw Error('No messages provided');
    }

    // Substitute the prefill if provided
    prefill = substituteParams(prefill ?? '');

    // Format each message in the prompt, accounting for the provided roles
    for (const message of prompt) {
        let name = '';
        if (message.role === 'user') name = message.name ?? name1;
        if (message.role === 'assistant') name = message.name ?? name2;
        if (message.role === 'system') name = message.name ?? '';
        const prefix = isInstruct || api === 'openai' ? '' : (name ? `${name}: ` : '');
        message.content = prefix + substituteParams(message.content ?? '');
        if (isInstruct) {  // instruct formatting for text completion
            const isUser = message.role === 'user';
            const isNarrator = message.role === 'system';
            message.content = formatInstructModeChat(name, message.content, isUser, isNarrator, '', name1, name2, false);
        }
    }

    // prepend system prompt, if provided
    if (systemPrompt) {
        systemPrompt = substituteParams(systemPrompt);
        systemPrompt = isInstruct ? formatInstructModeStoryString(systemPrompt) : systemPrompt.trim();
        if (isInstruct && systemPrompt.length > 0 && !systemPrompt.endsWith('\n')) {
            if (power_user.instruct.wrap && !power_user.instruct.story_string_suffix) {
                systemPrompt += '\n';
            }
        }
        prompt.unshift({ role: 'system', content: systemPrompt });
    }

    // with Chat Completion, the prefill is an additional assistant message at the end.
    if (api === 'openai' && prefill) {
        prompt.push({ role: 'assistant', content: prefill });
    }

    // if text completion, convert to text prompt by concatenating all message contents and adding the prefill as a promptBias.
    if (api !== 'openai') {
        const joiner = isInstruct ? '' : '\n';
        // @ts-expect-error TS(7006) FIXME: Parameter 'message' implicitly has an 'any' type.
        prompt = prompt.map(message => message.content).join(joiner);
        prompt = api === 'novel' ? adjustNovelInstructionPrompt(prompt) : prompt;
        prompt = prompt + (isInstruct ? formatInstructModePrompt(name2, false, prefill, name1, name2, true, quietToLoud) : `\n${prefill}`);  // add last line
    }

    return prompt;
}

/**
 * @typedef {object} GenerateRawParams
 * @property {string | object[]} [prompt] Prompt to generate a message from. Can be a string or an array of chat-style messages, i.e. [{role: '', content: ''}, ...]
 * @property {string} [api] API to use. Main API is used if not specified.
 * @property {boolean} [instructOverride] true to override instruct mode, false to use the default value
 * @property {boolean} [quietToLoud] true to generate a message in system mode, false to generate a message in character mode
 * @property {string} [systemPrompt] System prompt to use.
 * @property {number} [responseLength] Maximum response length. If unset, the global default value is used.
 * @property {boolean} [trimNames] Whether to allow trimming "{{user}}:" and "{{char}}:" from the response.
 * @property {string} [prefill] An optional prefill for the prompt.
 * @property {JsonSchema} [jsonSchema] JSON schema to use for the structured generation. Usually requires a special instruction.
 * @property
 */

/**
 * Generates a raw data object using the provided prompt.
 * This used to be part of `generateRaw`, but separating it out allows extensions to access other data such as reasoning message.
 * @param {GenerateRawParams} params Parameters for generating a message
 * @returns {Promise<object | string>} Raw API response data, or a JSON string extracted from the response when `jsonSchema` is provided.
 */
export async function generateRawData({ prompt = '', api = null, instructOverride = false, quietToLoud = false, systemPrompt = '', responseLength = null, prefill = '', jsonSchema = null } = {}) {
    if (!api) {
        api = main_api;
    }

    const abortController = new AbortController();
    const responseLengthCustomized = typeof responseLength === 'number' && responseLength > 0;
    let eventHook = () => { };

    // construct final prompt from the input. Can either be a string or an array of chat-style messages.
    prompt = createRawPrompt(prompt, api, instructOverride, quietToLoud, systemPrompt, prefill);

    // Allow extensions to stop generation before it happens
    const eventAbortController = new AbortController();
    const abortHook = () => {
        abortController.abort(new Error('Cancelled by stop event'));
        eventAbortController.abort(new Error('Cancelled by extension'));
    };
    eventSource.on(event_types.GENERATION_STOPPED, abortHook);

    try {
        if (responseLengthCustomized) {
            TempResponseLength.save(api, responseLength);
        }
        /** @type {object|any[]} */
        let generateData = {};

        // Allow extensions to modify the prompt before generation
        // 1. for text completion
        if (typeof prompt === 'string') {
            const eventData = { prompt: prompt, dryRun: false };
            await eventSource.emit(event_types.GENERATE_AFTER_COMBINE_PROMPTS, eventData);
            prompt = eventData.prompt;
        }
        // 2. for chat completion
        if (Array.isArray(prompt)) {
            const eventData = { chat: prompt, dryRun: false };
            await eventSource.emit(event_types.CHAT_COMPLETION_PROMPT_READY, eventData);
            prompt = eventData.chat;
        }

        // Check if the generation was aborted during the event
        eventAbortController.signal.throwIfAborted();

        switch (api) {
            // @ts-expect-error TS(2678) FIXME: Type '"kobold"' is not comparable to type 'null'.
            case 'kobold':
            // @ts-expect-error TS(2678) FIXME: Type '"koboldhorde"' is not comparable to type 'nu... Remove this comment to see the full error message
            case 'koboldhorde':
                if (kai_settings.preset_settings === 'gui') {
                    generateData = { prompt: prompt, gui_settings: true, max_length: amount_gen, max_context_length: max_context, api_server: kai_settings.api_server };
                } else {
                    const isHorde = api === 'koboldhorde';
                    const koboldSettings = koboldai_settings[koboldai_setting_names[kai_settings.preset_settings]];
                    generateData = getKoboldGenerationData(prompt.toString(), koboldSettings, amount_gen, max_context, isHorde, 'quiet');
                }
                TempResponseLength.restore(api);
                break;
            // @ts-expect-error TS(2678) FIXME: Type '"novel"' is not comparable to type 'null'.
            case 'novel': {
                const novelSettings = novelai_settings[novelai_setting_names[nai_settings.preset_settings_novel]];
                generateData = getNovelGenerationData(prompt, novelSettings, amount_gen, false, false, null, 'quiet');
                TempResponseLength.restore(api);
                break;
            }
            // @ts-expect-error TS(2678) FIXME: Type '"textgenerationwebui"' is not comparable to ... Remove this comment to see the full error message
            case 'textgenerationwebui':
                generateData = await getTextGenGenerationData(prompt, amount_gen, false, false, null, 'quiet');
                TempResponseLength.restore(api);
                break;
            // @ts-expect-error TS(2678) FIXME: Type '"openai"' is not comparable to type 'null'.
            case 'openai': {
                generateData = prompt;  // generateData is just the chat message object
                eventHook = TempResponseLength.setupEventHook(api);
            } break;
        }

        let data = {};

        if (api === 'koboldhorde') {
            data = await generateHorde(prompt.toString(), generateData, abortController.signal, false);
        } else if (api === 'openai') {
            data = await sendOpenAIRequest('quiet', generateData, abortController.signal, { jsonSchema });
        } else {
            const generateUrl = getGenerateUrl(api);
            const response = await fetch(generateUrl, {
                method: 'POST',
                headers: getRequestHeaders(),
                cache: 'no-cache',
                body: JSON.stringify(generateData),
                signal: abortController.signal,
            });

            if (!response.ok) {
                throw await response.json();
            }

            data = await response.json();
        }

        // should only happen for text completions
        // other frontend paths do not return data if calling the backend fails,
        // they throw things instead
        // @ts-expect-error TS(2339) FIXME: Property 'error' does not exist on type '{}'.
        if (data.error) {
            // @ts-expect-error TS(2339) FIXME: Property 'response' does not exist on type '{}'.
            throw new Error(data.response);
        }

        if (jsonSchema) {
            // @ts-expect-error TS(2339) FIXME: Property 'returnInvalid' does not exist on type 'n... Remove this comment to see the full error message
            return extractJsonFromData(data, { mainApi: api, returnInvalidJson: jsonSchema.returnInvalid });
        }

        return data;
    } finally {
        eventSource.removeListener(event_types.GENERATION_STOPPED, abortHook);
        if (responseLengthCustomized && TempResponseLength.isCustomized()) {
            TempResponseLength.restore(api);
            TempResponseLength.removeEventHook(api, eventHook);
        }
    }
}

/**
 * Generates a message using the provided prompt.
 * If the prompt is an array of chat-style messages and not using chat completion, it will be converted to a text prompt.
 * @param {GenerateRawParams} params Parameters for generating a message
 * @param {...any} args
 * @returns {Promise<string>} Generated output: a cleaned-up message string when `jsonSchema` is not provided, or an extracted JSON string conforming to `jsonSchema` when it is.
 */
export async function generateRaw({ prompt = '', api = null, instructOverride = false, quietToLoud = false, systemPrompt = '', responseLength = null, trimNames = true, prefill = '', jsonSchema = null } = {}, ...args: unknown[]) {
    if (args.length > 0 && typeof args[0] !== 'object') {
        console.trace('generateRaw called with positional arguments. Please use an object instead.');
        // @ts-expect-error TS(2322) FIXME: Type 'unknown' is not assignable to type 'string'.
        [prompt, api, instructOverride, quietToLoud, systemPrompt, responseLength, trimNames, prefill, jsonSchema] = args;
    }

    const data = await generateRawData({ prompt, api, instructOverride, quietToLoud, systemPrompt, responseLength, prefill, jsonSchema });

    // JSON string (matching the provided schema) will already be extracted.
    if (jsonSchema) {
        return data;
    }

    // format result, exclude user prompt bias
    const message = cleanUpMessage({
        getMessage: extractMessageFromData(data, api),
        isImpersonate: false,
        isContinue: false,
        displayIncompleteSentences: true,
        includeUserPromptBias: false,
        trimNames: trimNames,
        trimWrongNames: trimNames,
    });

    if (!message) {
        throw new Error('No message generated');
    }

    return message;
}

class TempResponseLength {
    static #originalResponseLength = -1;
    static #lastApi = null;

    static isCustomized() {
        return this.#originalResponseLength > -1;
    }

    /**
     * Save the current response length for the specified API.
     * @param {string} api API identifier
     * @param {number} responseLength New response length
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'api' implicitly has an 'any' type.
    static save(api, responseLength) {
        if (api === 'openai') {
            this.#originalResponseLength = oai_settings.openai_max_tokens;
            oai_settings.openai_max_tokens = responseLength;
        } else {
            this.#originalResponseLength = amount_gen;
            amount_gen = responseLength;
        }

        this.#lastApi = api;
        console.log('[TempResponseLength] Saved original response length:', TempResponseLength.#originalResponseLength);
    }

    /**
     * Restore the original response length for the specified API.
     * @param {string|null} api API identifier
     * @returns {void}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'api' implicitly has an 'any' type.
    static restore(api) {
        if (this.#originalResponseLength === -1) {
            return;
        }
        if (!api && this.#lastApi) {
            api = this.#lastApi;
        }
        if (api === 'openai') {
            oai_settings.openai_max_tokens = this.#originalResponseLength;
        } else {
            amount_gen = this.#originalResponseLength;
        }

        console.log('[TempResponseLength] Restored original response length:', this.#originalResponseLength);
        this.#originalResponseLength = -1;
        this.#lastApi = null;
    }

    /**
     * Sets up an event hook to restore the original response length when the event is emitted.
     * @param {string} api API identifier
     * @returns {function(): void} Event hook function
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'api' implicitly has an 'any' type.
    static setupEventHook(api) {
        const eventHook = () => {
            if (this.isCustomized()) {
                this.restore(api);
            }
        };

        switch (api) {
            case 'openai':
                eventSource.once(event_types.CHAT_COMPLETION_SETTINGS_READY, eventHook);
                break;
            default:
                eventSource.once(event_types.GENERATE_AFTER_DATA, eventHook);
                break;
        }

        return eventHook;
    }

    /**
     * Removes the event hook for the specified API.
     * @param {string} api API identifier
     * @param {function(): void} eventHook Previously set up event hook
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'api' implicitly has an 'any' type.
    static removeEventHook(api, eventHook) {
        switch (api) {
            case 'openai':
                eventSource.removeListener(event_types.CHAT_COMPLETION_SETTINGS_READY, eventHook);
                break;
            default:
                eventSource.removeListener(event_types.GENERATE_AFTER_DATA, eventHook);
                break;
        }
    }
}

/**
 * Removes last message from the chat DOM.
 * @returns {Promise<void>} Resolves when the message is removed.
 */
function removeLastMessage() {
    return new Promise((resolve) => {
        const lastMes = chatElement.children('.mes').last();
        if (lastMes.length === 0) {
            // @ts-expect-error TS(2794) FIXME: Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
            return resolve();
        }
        lastMes.hide(animation_duration, function () {
            // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
            this.remove();
            // @ts-expect-error TS(2794) FIXME: Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
            resolve();
        });
    });
}

/**
 * @typedef {object} JsonSchema
 * @property {string} name Name of the schema.
 * @property {object} value JSON schema value.
 * @property {string} [description] Description of the schema.
 * @property {boolean} [strict] If true, the schema will be used in strict mode, meaning that only the fields defined in the schema will be allowed.
 * @property {boolean} [returnInvalid] If true, a string that can't be parsed as a JSON will be returned as is, instead of an empty object.
 * @typedef {object} GenerateOptions
 * @property {boolean} [automatic_trigger] If the generation was triggered automatically (e.g. group auto mode).
 * @property {boolean} [force_name2] If a char name should be forced to add to the prompt's last line (Text Completion, non-Instruct only).
 * @property {string} [quiet_prompt] A system instruction to use for the quiet prompt.
 * @property {boolean} [quietToLoud] Whether the system instruction should be sent in background (quiet) or a foreground (loud) mode.
 * @property {boolean} [skipWIAN] Skip adding World Info and Author's Note to the prompt.
 * @property {number} [force_chid] Force character ID to use for the generation. Only works in groups.
 * @property {AbortSignal} [signal] Abort signal to cancel the generation. If not provided, will create a new AbortController.
 * @property {string} [quietImage] Image URL to use for the quiet prompt (defaults to empty string)
 * @property {string} [quietName] Name to use for the quiet prompt (defaults to "System:")
 * @property {number} [depth] Recursion depth for the generation. Used to prevent infinite loops in tool calls.
 * @property {JsonSchema} [jsonSchema] JSON schema to use for the structured generation. Usually requires a special instruction.
 */

/**
 * MARK:Generate()
 * Runs a generation using the current chat context.
 * @param {string} type Generation type
 * @param {GenerateOptions} options Generation options
 * @param {boolean} dryRun Whether to actually generate a message or just assemble the prompt
 * @returns {Promise<any>} Returns a promise that resolves when the text is done generating.
 */
// @ts-expect-error TS(7023) FIXME: 'Generate' implicitly has return type 'any' becaus... Remove this comment to see the full error message
export async function Generate(type, {
    automatic_trigger,
    force_name2,
    quiet_prompt,
    quietToLoud,
    skipWIAN,
    force_chid,
    signal,
    quietImage,
    quietName,
    jsonSchema = null,
    depth = 0
}: Record<string, unknown> = {}, dryRun = false) {
    console.log('Generate entered');
    setGenerationProgress(0);
    generation_started = new Date();

    // Prevent generation from shallow characters
    await unshallowCharacter(this_chid);

    // Occurs every time, even if the generation is aborted due to slash commands execution
    await eventSource.emit(event_types.GENERATION_STARTED, type, { automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, force_chid, signal, quietImage }, dryRun);

    // Don't recreate abort controller if signal is passed
    if (!(abortController && signal)) {
        abortController = new AbortController();
    }

    // OpenAI doesn't need instruct mode. Use OAI main prompt instead.
    const isInstruct = power_user.instruct.enabled && main_api !== 'openai';
    const isImpersonate = type == 'impersonate';

    if (!(dryRun || depth || type == 'regenerate' || type == 'swipe' || type == 'quiet')) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const interruptedByCommand = await processCommands(String($('#send_textarea').val()));

        if (interruptedByCommand) {
            //$("#send_textarea").val('')[0].dispatchEvent(new Event('input', { bubbles:true }));
            unblockGeneration(type);
            return Promise.resolve();
        }
    }

    // Occurs only if the generation is not aborted due to slash commands execution
    await eventSource.emit(event_types.GENERATION_AFTER_COMMANDS, type, { automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, force_chid, signal, quietImage }, dryRun);

    if (main_api == 'kobold' && kai_settings.streaming_kobold && !kai_flags.can_use_streaming) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`Streaming is enabled, but the version of Kobold used does not support token streaming.`, undefined, { timeOut: 10000, preventDuplicates: true });
        unblockGeneration(type);
        return Promise.resolve();
    }

    if (isHordeGenerationNotAllowed()) {
        unblockGeneration(type);
        return Promise.resolve();
    }

    if (!dryRun) {
        // Ping server to make sure it is still alive
        const pingResult = await pingServer();

        if (!pingResult) {
            unblockGeneration(type);
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(t`Verify that the server is running and accessible.`, t`ST Server cannot be reached`);
            throw new Error('Server unreachable');
        }

        // Hide swipes if not in a dry run.
        hideSwipeButtons();
        // If generated any message, set the flag to indicate it can't be recreated again.
        chat_metadata.tainted = true;
    }

    if (selected_group && !is_group_generating) {
        if (!dryRun) {
            // Returns the promise that generateGroupWrapper returns; resolves when generation is done
            return generateGroupWrapper(false, type, { quiet_prompt, force_chid, signal: abortController.signal, quietImage, jsonSchema });
        }

        const characterIndexMap = new Map(characters.map((char, index) => [char.avatar, index]));
        const group = groups.find((x) => x.id === selected_group);
        if (!group) return;

        const enabledMembers = group.members.reduce((acc, member) => {
            if (!group.disabled_members.includes(member) && !acc.includes(member)) {
                acc.push(member);
            }
            return acc;
        }, [] as string[]);

        const memberIds = enabledMembers
            .map((member) => characterIndexMap.get(member))
            .filter((index) => index !== undefined && index !== null);

        if (memberIds.length > 0) {
            if (menu_type != 'character_edit') setCharacterId(memberIds[0]);
            setCharacterName('');
        } else {
            console.log('No enabled members found');
            unblockGeneration(type);
            return Promise.resolve();
        }
    }

    //#########QUIET PROMPT STUFF##############
    //this function just gives special care to novel quiet instruction prompts
    if (quiet_prompt) {
        quiet_prompt = substituteParams(quiet_prompt);
        quiet_prompt = main_api == 'novel' && !quietToLoud ? adjustNovelInstructionPrompt(quiet_prompt) : quiet_prompt;
    }

    const hasBackendConnection = online_status !== 'no_connection';

    // We can't do anything because we're not in a chat right now. (Unless it's a dry run, in which case we need to
    // assemble the prompt so we can count its tokens regardless of whether a chat is active.)
    if (!dryRun && !hasBackendConnection) {
        is_send_press = false;
        return Promise.resolve();
    }

    const lastMessage = chat[chat.length - 1];

    let textareaText;
    if (type !== 'regenerate' && type !== 'swipe' && type !== 'quiet' && !isImpersonate && !dryRun && !depth) {
        is_send_press = true;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        textareaText = String($('#send_textarea').val());
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#send_textarea').val('')[0].dispatchEvent(new Event('input', { bubbles: true }));
    } else {
        textareaText = '';
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        if (chat.length && lastMessage.is_user) {
            //do nothing? why does this check exist?
        } else if (type !== 'quiet' && type !== 'swipe' && !isImpersonate && !dryRun && !depth && chat.length) {
            deleteItemizedPromptForMessage(chat.length - 1);
            chat.length = chat.length - 1;
            await removeLastMessage();
            await eventSource.emit(event_types.MESSAGE_DELETED, chat.length);
        }
    }

    const isContinue = type == 'continue';

    // Rewrite the generation timer to account for the time passed for all the continuations.
    if (isContinue && chat.length) {
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        const prevFinished = lastMessage.gen_finished;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        const prevStarted = lastMessage.gen_started;

        if (prevFinished && prevStarted) {
            const timePassed = Number(prevFinished) - Number(prevStarted);
            generation_started = new Date(Date.now() - timePassed);
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            lastMessage.gen_started = generation_started;
        }
    }

    if (!dryRun) {
        deactivateSendButtons();
    }

    const { messageBias, promptBias, isUserPromptBias } = getBiasStrings(textareaText, type);

    //*********************************
    //PRE FORMATING STRING
    //*********************************

    // These generation types should not attach pending files to the chat
    const noAttachTypes = [
        'regenerate',
        'swipe',
        'impersonate',
        'quiet',
        'continue',
    ];
    //for normal messages sent from user..
    if ((textareaText != '' || (hasPendingFileAttachment() && !noAttachTypes.includes(type))) && !automatic_trigger && type !== 'quiet' && !dryRun && !depth) {
        // If user message contains no text other than bias - send as a system message
        if (messageBias && !removeMacros(textareaText)) {
            sendSystemMessage(system_message_types.GENERIC, ' ', { bias: messageBias });
        } else {
            await sendMessageAsUser(textareaText, messageBias);
        }
    } else if (textareaText == '' && !automatic_trigger && !dryRun && [undefined, 'normal'].includes(type) && main_api == 'openai' && oai_settings.send_if_empty.trim().length > 0 && !depth) {
        // Use send_if_empty if set and the user message is empty. Only when sending messages normally
        await sendMessageAsUser(oai_settings.send_if_empty.trim(), messageBias);
    }

    const characterFields = getCharacterCardFields();
    const {
        description,
        personality,
        persona,
        scenario,
        mesExamples,
        charDepthPrompt,
        creatorNotes,
    } = characterFields;
    let { system, jailbreak } = characterFields;

    // Depth prompt (character-specific A/N)
    removeDepthPrompts();
    const groupDepthPrompts = getGroupDepthPrompts(selected_group, Number(this_chid));

    if (selected_group && Array.isArray(groupDepthPrompts) && groupDepthPrompts.length > 0) {
        groupDepthPrompts.forEach((value, index) => {
            const role = getExtensionPromptRoleByName(value.role);
            // @ts-expect-error TS(2339) FIXME: Property 'allowWIScan' does not exist on type '{ d... Remove this comment to see the full error message
            setExtensionPrompt(inject_ids.DEPTH_PROMPT_INDEX(index), value.text, extension_prompt_types.IN_CHAT, value.depth, extension_settings.note.allowWIScan, role);
        });
    } else {
        const depthPromptText = charDepthPrompt || '';
        const depthPromptDepth = characters[this_chid]?.data?.extensions?.depth_prompt?.depth ?? depth_prompt_depth_default;
        const depthPromptRole = getExtensionPromptRoleByName(characters[this_chid]?.data?.extensions?.depth_prompt?.role ?? depth_prompt_role_default);
        // @ts-expect-error TS(2339) FIXME: Property 'allowWIScan' does not exist on type '{ d... Remove this comment to see the full error message
        setExtensionPrompt(inject_ids.DEPTH_PROMPT, depthPromptText, extension_prompt_types.IN_CHAT, depthPromptDepth, extension_settings.note.allowWIScan, depthPromptRole);
    }

    // First message in fresh 1-on-1 chat reacts to user/character settings changes
    if (chat.length) {
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        chat[0].mes = substituteParams(chat[0].mes);
    }

    // Collect messages with usable content
    const canUseTools = ToolManager.isToolCallingSupported();
    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
    const canPerformToolCalls = !dryRun && ToolManager.canPerformToolCalls(type) && depth < ToolManager.RECURSE_LIMIT;
    // @ts-expect-error TS(2339) FIXME: Property 'is_system' does not exist on type 'never... Remove this comment to see the full error message
    let coreChat: SillyTavern.ChatMessage[] = chat.filter(x => !x.is_system || (canUseTools && Array.isArray(x.extra?.tool_invocations)));
    if (type === 'swipe') {
        coreChat.pop();
    }

    coreChat = await Promise.all(coreChat.map(async (/** @type {ChatMessage} */ chatItem, index) => {
        const message = chatItem.mes;
        const regexType = chatItem.is_user ? regex_placement.USER_INPUT : regex_placement.AI_OUTPUT;
        const options = { isPrompt: true, depth: (coreChat.length - index - (isContinue ? 2 : 1)) };

        let regexedMessage = getRegexedString(message, regexType, options);
        regexedMessage = await appendFileContent(chatItem, regexedMessage);

        const titles = [];
        if (chatItem?.extra?.append_title && chatItem?.extra?.title) {
            titles.push(chatItem.extra.title);
        }
        if (Array.isArray(chatItem?.extra?.media)) {
            for (const mediaItem of chatItem.extra.media) {
                if (mediaItem?.title && mediaItem?.append_title) {
                    titles.push(mediaItem.title);
                }
            }
        }
        if (titles.length > 0) {
            regexedMessage = `${regexedMessage}\n\n${titles.join('\n\n')}`;
        }

        return {
            ...chatItem,
            mes: regexedMessage,
            index,
        };
    }));

    const promptReasoning = new PromptReasoning();
    for (let i = coreChat.length - 1; i >= 0; i--) {
        const depth = coreChat.length - i - (isContinue ? 2 : 1);
        const isPrefix = isContinue && i === coreChat.length - 1;

        // In group chats, only include reasoning from the currently generating character
        const isOtherGroupMember = selected_group && coreChat[i].name !== name2;

        coreChat[i] = {
            ...coreChat[i],
            mes: isOtherGroupMember
                ? coreChat[i].mes
                : promptReasoning.addToMessage(
                    coreChat[i].mes,
                    getRegexedString(
                        String(coreChat[i].extra?.reasoning ?? ''),
                        regex_placement.REASONING,
                        { isPrompt: true, depth: depth },
                    ),
                    isPrefix,
                    coreChat[i].extra?.reasoning_duration,
                ),
        };
        if (promptReasoning.isLimitReached()) {
            break;
        }
    }

    // Determine token limit
    let this_max_context = getMaxPromptTokens();

    if (!dryRun) {
        console.debug('Running extension interceptors');
        const aborted = await runGenerationInterceptors(coreChat, this_max_context, type);

        if (aborted) {
            console.debug('Generation aborted by extension interceptors');
            unblockGeneration(type);
            return Promise.resolve();
        }
    } else {
        console.debug('Skipping extension interceptors for dry run');
    }

    // Adjust token limit for Horde
    let adjustedParams;
    if (main_api == 'koboldhorde' && (horde_settings.auto_adjust_context_length || horde_settings.auto_adjust_response_length)) {
        try {
            adjustedParams = await adjustHordeGenerationParams(max_context, amount_gen);
        } catch {
            unblockGeneration(type);
            return Promise.resolve();
        }
        if (horde_settings.auto_adjust_context_length) {
            this_max_context = (adjustedParams.maxContextLength - adjustedParams.maxLength);
        }
    }

    // Fetches the combined prompt for both negative and positive prompts
    const cfgGuidanceScale = getGuidanceScale();
    const useCfgPrompt = cfgGuidanceScale && cfgGuidanceScale.value !== 1;

    // Adjust max context based on CFG prompt to prevent overfitting
    if (useCfgPrompt) {
        const negativePrompt = getCfgPrompt(cfgGuidanceScale, true, true)?.value || '';
        const positivePrompt = getCfgPrompt(cfgGuidanceScale, false, true)?.value || '';
        if (negativePrompt || positivePrompt) {
            const previousMaxContext = this_max_context;
            const [negativePromptTokenCount, positivePromptTokenCount] = await Promise.all([getTokenCountAsync(negativePrompt), getTokenCountAsync(positivePrompt)]);
            const decrement = Math.max(negativePromptTokenCount, positivePromptTokenCount);
            this_max_context -= decrement;
            console.log(`Max context reduced by ${decrement} tokens of CFG prompt (${previousMaxContext} -> ${this_max_context})`);
        }
    }

    console.log(`Core/all messages: ${coreChat.length}/${chat.length}`);

    if ((promptBias && !isUserPromptBias) || power_user.always_force_name2 || main_api == 'novel') {
        force_name2 = true;
    }

    if (isImpersonate) {
        force_name2 = false;
    }

    let mesExamplesArray = parseMesExamples(mesExamples, isInstruct);

    // Set non-WI AN
    setFloatingPrompt();

    // Add WI to prompt (and also inject WI to AN value via hijack)
    // Make quiet prompt available for WIAN
    setExtensionPrompt(inject_ids.QUIET_PROMPT, quiet_prompt || '', extension_prompt_types.IN_PROMPT, 0, true);
    const chatForWI = coreChat.map(x => world_info_include_names ? `${x.name}: ${x.mes}` : x.mes).reverse();
    /** @type {import('./scripts/world-info.js').WIGlobalScanData} */
    const globalScanData = {
        personaDescription: persona,
        characterDescription: description,
        characterPersonality: personality,
        characterDepthPrompt: charDepthPrompt,
        scenario: scenario,
        creatorNotes: creatorNotes,
        trigger: GENERATION_TYPE_TRIGGERS.includes(type) ? type : 'normal',
    };
    const { worldInfoString, worldInfoBefore, worldInfoAfter, worldInfoExamples, worldInfoDepth, outletEntries } = await getWorldInfoPrompt(chatForWI, this_max_context, dryRun, globalScanData);
    setExtensionPrompt(inject_ids.QUIET_PROMPT, '', extension_prompt_types.IN_PROMPT, 0, true);

    // Add message example WI
    for (const example of worldInfoExamples) {
        const exampleMessage = example.content;

        if (exampleMessage.length === 0) {
            continue;
        }

        const formattedExample = baseChatReplace(exampleMessage);
        const cleanedExample = parseMesExamples(formattedExample, isInstruct);

        // Insert depending on before or after position
        if (example.position === wi_anchor_position.before) {
            mesExamplesArray.unshift(...cleanedExample);
        } else {
            mesExamplesArray.push(...cleanedExample);
        }
    }

    // At this point, the raw message examples can be created
    const mesExamplesRawArray = [...mesExamplesArray];

    if (mesExamplesArray && isInstruct) {
        mesExamplesArray = formatInstructModeExamples(mesExamplesArray, name1, name2);
    }

    if (skipWIAN !== true) {
        console.log('skipWIAN not active, adding WIAN');
        // Add all depth WI entries to prompt
        flushWIInjections();
        if (Array.isArray(worldInfoDepth)) {
            worldInfoDepth.forEach((e) => {
                const joinedEntries = e.entries.join('\n');
                setExtensionPrompt(inject_ids.CUSTOM_WI_DEPTH_ROLE(e.depth, e.role), joinedEntries, extension_prompt_types.IN_CHAT, e.depth, false, e.role);
            });
        }
        if (outletEntries && typeof outletEntries === 'object' && Object.keys(outletEntries).length > 0) {
            Object.entries(outletEntries).forEach(([key, value]) => {
                setExtensionPrompt(inject_ids.CUSTOM_WI_OUTLET(key), value.join('\n'), extension_prompt_types.NONE, 0);
            });
        }
    } else {
        console.log('skipping WIAN');
    }

    // Add persona description to prompt
    addPersonaDescriptionExtensionPrompt();

    // Prepare the system prompt for Text Completion APIs
    if (main_api !== 'openai') {
        if (power_user.sysprompt.enabled) {
            system = power_user.prefer_character_prompt && system
                ? substituteParams(system, { original: power_user.sysprompt.content ?? '' })
                : baseChatReplace(power_user.sysprompt.content);
            system = isInstruct ? substituteParams(system, { original: power_user.sysprompt.content ?? '' }) : system;
        } else {
            // Nullify if it's not enabled
            system = '';
        }
    }

    // Collect before / after story string injections
    const beforeScenarioAnchor = await getExtensionPrompt(extension_prompt_types.BEFORE_PROMPT);
    const afterScenarioAnchor = await getExtensionPrompt(extension_prompt_types.IN_PROMPT);

    const storyStringParams = {
        description: description,
        personality: personality,
        persona: power_user.persona_description_position == persona_description_positions.IN_PROMPT ? persona : '',
        scenario: scenario,
        system: system,
        char: name2,
        user: name1,
        wiBefore: worldInfoBefore,
        wiAfter: worldInfoAfter,
        loreBefore: worldInfoBefore,
        loreAfter: worldInfoAfter,
        anchorBefore: beforeScenarioAnchor.trim(),
        anchorAfter: afterScenarioAnchor.trim(),
        mesExamples: mesExamplesArray.join(''),
        mesExamplesRaw: mesExamplesRawArray.join(''),
    };

    // Render the story string and combine with injections
    const storyString = renderStoryString(storyStringParams);
    let combinedStoryString = isInstruct ? formatInstructModeStoryString(storyString) : storyString;

    // Inject the story string as in-chat prompt (if needed)
    const applyStoryStringInject = main_api !== 'openai' && power_user.context.story_string_position === extension_prompt_types.IN_CHAT;
    if (applyStoryStringInject) {
        const depth = power_user.context.story_string_depth ?? 1;
        const role = power_user.context.story_string_role ?? extension_prompt_roles.SYSTEM;
        setExtensionPrompt(inject_ids.STORY_STRING, combinedStoryString, extension_prompt_types.IN_CHAT, depth, false, role);
        // Remove to prevent duplication
        combinedStoryString = '';
    } else {
        setExtensionPrompt(inject_ids.STORY_STRING, '', extension_prompt_types.IN_CHAT, 0);
    }

    // Story string rendered, safe to remove
    if (power_user.strip_examples) {
        mesExamplesArray = [];
    }

    // Inject all Depth prompts. Chat Completion does it separately
    // @ts-expect-error TS(7034) FIXME: Variable 'injectedIndices' implicitly has type 'an... Remove this comment to see the full error message
    let injectedIndices = [];
    if (main_api !== 'openai') {
        injectedIndices = await doChatInject(coreChat, isContinue);
    }

    if (main_api !== 'openai' && power_user.sysprompt.enabled) {
        jailbreak = power_user.prefer_character_jailbreak && jailbreak
            ? substituteParams(jailbreak, { original: power_user.sysprompt.post_history ?? '' })
            : baseChatReplace(power_user.sysprompt.post_history);

        // Only inject the jb if there is one
        if (jailbreak) {
            // When continuing generation of previous output, last user message precedes the message to continue
            if (isContinue) {
                coreChat.splice(coreChat.length - 1, 0, { mes: jailbreak, is_user: true });
            } else {
                // This operation will result in the injectedIndices indexes being off by one
                coreChat.push({ mes: jailbreak, is_user: true });
                // Add +1 to the elements to correct for the new PHI/Jailbreak message.
                injectedIndices.forEach(shiftUpByOne);
            }
        }
    }

    const chat2: string[] = [];
    let continue_mag = '';
    let userMessageIndices: number[] = [];
    const lastUserMessageIndex = coreChat.findLastIndex(x => x.is_user);

    for (let i = coreChat.length - 1, j = 0; i >= 0; i--, j++) {
        if (main_api == 'openai') {
            chat2[i] = coreChat[j].mes;
            if (i === 0 && isContinue) {
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                chat2[i] = chat2[i].slice(0, chat2[i].lastIndexOf(coreChat[j].mes) + coreChat[j].mes.length);
                continue_mag = coreChat[j].mes;
            }
            continue;
        }

        chat2[i] = formatMessageHistoryItem(coreChat[j], isInstruct, false);

        if (j === 0 && isInstruct) {
            // Reformat with the first output sequence (if any)
            chat2[i] = formatMessageHistoryItem(coreChat[j], isInstruct, force_output_sequence.FIRST);
        }

        if (lastUserMessageIndex >= 0 && j === lastUserMessageIndex && isInstruct && !isImpersonate) {
            // Reformat with the last input sequence (if any)
            chat2[i] = formatMessageHistoryItem(coreChat[j], isInstruct, force_output_sequence.LAST);
        }

        // Do not suffix the message for continuation
        if (i === 0 && isContinue) {
            // Pick something that's very unlikely to be in a message
            const FORMAT_TOKEN = '\u0000\ufffc\u0000\ufffd';

            if (isInstruct) {
                const originalMessage = String(coreChat[j].mes ?? '');
                coreChat[j].mes = originalMessage.replaceAll(FORMAT_TOKEN, '') + FORMAT_TOKEN;
                // Reformat with the last output sequence (if any)
                chat2[i] = formatMessageHistoryItem(coreChat[j], isInstruct, force_output_sequence.LAST);
                coreChat[j].mes = originalMessage;
            }

            chat2[i] = (chat2[i]?.includes(FORMAT_TOKEN) ?? false)
                ? chat2[i]?.slice(0, chat2[i]?.lastIndexOf(FORMAT_TOKEN) ?? 0) ?? ''
                : chat2[i]?.slice(0, (chat2[i]?.lastIndexOf(coreChat[j]?.mes ?? '') ?? 0) + (coreChat[j]?.mes?.length ?? 0)) ?? '';
            continue_mag = coreChat[j]?.mes;
        }

        if (coreChat[j].is_user) {
            userMessageIndices.push(i);
        }
    }

    const addUserAlignment = isInstruct && power_user.instruct.user_alignment_message;
    let userAlignmentMessage = '';

    if (addUserAlignment) {
        const alignmentMessage = {
            name: name1,
            mes: substituteParams(power_user.instruct.user_alignment_message),
            is_user: true,
        };
        userAlignmentMessage = formatMessageHistoryItem(alignmentMessage, isInstruct, force_output_sequence.FIRST);
    }

    // @ts-expect-error TS(7034) FIXME: Variable 'oaiMessages' implicitly has type 'any[]'... Remove this comment to see the full error message
    let oaiMessages = [];
    // @ts-expect-error TS(7034) FIXME: Variable 'oaiMessageExamples' implicitly has type ... Remove this comment to see the full error message
    let oaiMessageExamples = [];

    if (main_api === 'openai') {
        oaiMessages = setOpenAIMessages(coreChat);
        oaiMessageExamples = setOpenAIMessageExamples(mesExamplesArray);
    }

    // hack for regeneration of the first message
    if (chat2.length == 0) {
        chat2.push('');
    }

    let examplesString = '';
    let chatString = addChatsPreamble(addChatsSeparator(''));
    let cyclePrompt = '';

    /**
     *
     */
    async function getMessagesTokenCount() {
        const encodeString = [
            combinedStoryString,
            examplesString,
            userAlignmentMessage,
            chatString,
            modifyLastPromptLine(''),
            cyclePrompt,
        ].join('').replace(/\r/gm, '');
        // @ts-expect-error TS(2345) FIXME: Argument of type 'number' is not assignable to par... Remove this comment to see the full error message
        return getTokenCountAsync(encodeString, power_user.token_padding);
    }

    // Force pinned examples into the context
    // @ts-expect-error TS(7034) FIXME: Variable 'pinExmString' implicitly has type 'any' ... Remove this comment to see the full error message
    let pinExmString;
    if (power_user.pin_examples) {
        pinExmString = examplesString = mesExamplesArray.join('');
    }

    // Only add the chat in context if past the greeting message
    if (isContinue && (chat2.length > 1 || main_api === 'openai')) {
        cyclePrompt = chat2.shift() ?? '';
        // Adjust indices to account for the shift
        injectedIndices = injectedIndices.map(shiftDownByOne).filter(x => x >= 0);
        userMessageIndices = userMessageIndices.map(shiftDownByOne).filter(x => x >= 0);
    }

    // Collect enough messages to fill the context
    let arrMes = new Array(chat2.length);
    let tokenCount = await getMessagesTokenCount();
    let lastAddedIndex = 0;

    // Pre-allocate all injections first.
    // If it doesn't fit - user shot himself in the foot
    for (const index of injectedIndices) {
        // not needed for OAI prompting
        if (main_api == 'openai') {
            break;
        }

        const item = chat2[index];

        if (typeof item !== 'string') {
            continue;
        }

        tokenCount += await getTokenCountAsync(item.replace(/\r/gm, ''));
        if (tokenCount < this_max_context) {
            chatString = chatString + item;
            arrMes[index] = item;
            lastAddedIndex = Math.max(lastAddedIndex, index);
        } else {
            break;
        }
    }

    for (let i = 0; i < chat2.length; i++) {
        // not needed for OAI prompting
        if (main_api == 'openai') {
            break;
        }

        // Skip already injected messages
        if (arrMes[i] !== undefined) {
            continue;
        }

        const item = chat2[i];

        if (typeof item !== 'string') {
            continue;
        }

        tokenCount += await getTokenCountAsync(item.replace(/\r/gm, ''));
        if (tokenCount < this_max_context) {
            chatString = chatString + item;
            arrMes[i] = item;
            lastAddedIndex = Math.max(lastAddedIndex, i);
        } else {
            break;
        }
    }

    // Add user alignment message if last message is not a user message
    const stoppedAtUser = userMessageIndices.includes(lastAddedIndex);
    if (addUserAlignment && !stoppedAtUser) {
        tokenCount += await getTokenCountAsync(userAlignmentMessage.replace(/\r/gm, ''));
        chatString = userAlignmentMessage + chatString;
        arrMes.push(userAlignmentMessage);
        injectedIndices.push(arrMes.length - 1);
    }

    // Unsparse the array. Adjust injected indices
    const newArrMes = [];
    const newInjectedIndices = [];
    for (let i = 0; i < arrMes.length; i++) {
        if (arrMes[i] !== undefined) {
            newArrMes.push(arrMes[i]);
            if (injectedIndices.includes(i)) {
                newInjectedIndices.push(newArrMes.length - 1);
            }
        }
    }

    arrMes = newArrMes;
    injectedIndices = newInjectedIndices;

    if (main_api !== 'openai') {
        setInContextMessages(arrMes.length - injectedIndices.length, type);
    }

    // Estimate how many unpinned example messages fit in the context
    tokenCount = await getMessagesTokenCount();
    let count_exm_add = 0;
    if (!power_user.pin_examples) {
        for (const example of mesExamplesArray) {
            tokenCount += await getTokenCountAsync(example.replace(/\r/gm, ''));
            examplesString += example;
            if (tokenCount < this_max_context) {
                count_exm_add++;
            } else {
                break;
            }
        }
    }

    // @ts-expect-error TS(7034) FIXME: Variable 'mesSend' implicitly has type 'any[]' in ... Remove this comment to see the full error message
    const mesSend = [];
    console.debug('calling runGenerate');

    if (isContinue) {
        // Coping mechanism for OAI spacing
        if (main_api === 'openai' && !cyclePrompt.endsWith(' ')) {
            cyclePrompt += oai_settings.continue_postfix;
            continue_mag += oai_settings.continue_postfix;
        }
    }

    const originalType = type;

    if (!dryRun) {
        is_send_press = true;
    }

    const generatedPromptCache = cyclePrompt || '';
    if (generatedPromptCache.length == 0 || type === 'continue') {
        console.debug('generating prompt');
        chatString = '';
        arrMes = arrMes.reverse();
        arrMes.forEach(function (item, i, arr) {
            // OAI doesn't need all of this
            if (main_api === 'openai') {
                return;
            }

            // Cohee: This removes a newline from the end of the last message in the context
            // Last prompt line will add a newline if it's not a continuation
            // In instruct mode it only removes it if wrap is enabled and it's not a quiet generation
            if (i === arrMes.length - 1 && type !== 'continue') {
                if (!isInstruct || (power_user.instruct.wrap && type !== 'quiet')) {
                    item = item.replace(/\n?$/, '');
                }
            }

            mesSend[mesSend.length] = { message: item, extensionPrompts: [] };
        });
    }

    let mesExmString = '';

    /**
     *
     */
    function setPromptString() {
        if (main_api == 'openai') {
            return;
        }

        console.debug('--setting Prompt string');
        // @ts-expect-error TS(7005) FIXME: Variable 'pinExmString' implicitly has an 'any' ty... Remove this comment to see the full error message
        mesExmString = pinExmString ?? mesExamplesArray.slice(0, count_exm_add).join('');

        if (mesSend.length) {
            // @ts-expect-error TS(7005) FIXME: Variable 'mesSend' implicitly has an 'any[]' type.
            mesSend[mesSend.length - 1].message = modifyLastPromptLine(mesSend[mesSend.length - 1].message);
        }
    }

    /**
     *
     * @param lastMesString
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'lastMesString' implicitly has an 'any' ... Remove this comment to see the full error message
    function modifyLastPromptLine(lastMesString) {
        //#########QUIET PROMPT STUFF PT2##############

        // Add quiet generation prompt at depth 0
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        if (quiet_prompt && quiet_prompt.length) {
            // here name1 is forced for all quiet prompts..why?
            const name = name1;
            //checks if we are in instruct, if so, formats the chat as such, otherwise just adds the quiet prompt
            const quietAppend = isInstruct ? formatInstructModeChat(name, quiet_prompt, false, true, '', name1, name2, false) : `\n${quiet_prompt}`;

            //This begins to fix quietPrompts (particularly /sysgen) for instruct
            //previously instruct input sequence was being appended to the last chat message w/o '\n'
            //and no output sequence was added after the input's content.
            //TODO: respect output_sequence vs last_output_sequence settings
            //TODO: decide how to prompt this to clarify who is talking 'Narrator', 'System', etc.
            if (isInstruct) {
                lastMesString += quietAppend; // + power_user.instruct.output_sequence + '\n';
            } else {
                lastMesString += quietAppend;
            }


            // Ross: bailing out early prevents quiet prompts from respecting other instruct prompt toggles
            // for sysgen, SD, and summary this is desireable as it prevents the AI from responding as char..
            // but for idle prompting, we want the flexibility of the other prompt toggles, and to respect them as per settings in the extension
            // need a detection for what the quiet prompt is being asked for...

            // Bail out early?
            if (!isInstruct && !quietToLoud) {
                return lastMesString;
            }
        }


        // Get instruct mode line
        if (isInstruct && !isContinue) {
            const name = (quiet_prompt && !quietToLoud && !isImpersonate) ? (quietName ?? 'System') : (isImpersonate ? name1 : name2);
            const isQuiet = quiet_prompt && type == 'quiet';
            lastMesString += formatInstructModePrompt(name, isImpersonate, promptBias, name1, name2, isQuiet, quietToLoud);
        }

        // Get non-instruct impersonation line
        if (!isInstruct && isImpersonate && !isContinue) {
            const name = name1;
            if (!lastMesString.endsWith('\n')) {
                lastMesString += '\n';
            }
            lastMesString += name + ':';
        }

        // Add character's name
        // Force name append on continue (if not continuing on user message or first message)
        const isContinuingOnFirstMessage = chat.length === 1 && isContinue;
        if (!isInstruct && force_name2 && !isContinuingOnFirstMessage) {
            if (!lastMesString.endsWith('\n')) {
                lastMesString += '\n';
            }
            // @ts-expect-error TS(2339) FIXME: Property 'is_user' does not exist on type 'never'.
            if (!isContinue || !(chat[chat.length - 1]?.is_user)) {
                lastMesString += `${name2}:`;
            }
        }

        return lastMesString;
    }

    /**
     *
     */
    async function checkPromptSize() {
        console.debug('---checking Prompt size');
        setPromptString();
        // @ts-expect-error TS(7005) FIXME: Variable 'mesSend' implicitly has an 'any[]' type.
        const jointMessages = mesSend.map((e) => `${e.extensionPrompts.join('')}${e.message}`).join('');
        const prompt = [
            combinedStoryString,
            mesExmString,
            addChatsPreamble(addChatsSeparator(jointMessages)),
            '\n',
            modifyLastPromptLine(''),
            generatedPromptCache,
        ].join('').replace(/\r/gm, '');
        // @ts-expect-error TS(2345) FIXME: Argument of type 'number' is not assignable to par... Remove this comment to see the full error message
        const thisPromptContextSize = await getTokenCountAsync(prompt, power_user.token_padding);

        if (thisPromptContextSize > this_max_context) {        //if the prepared prompt is larger than the max context size...
            if (count_exm_add > 0) {                            // ..and we have example messages..
                count_exm_add--;                            // remove the example messages...
                await checkPromptSize();                            // and try agin...
            } else if (mesSend.length > 0) {                    // if the chat history is longer than 0
                // @ts-expect-error TS(7005) FIXME: Variable 'mesSend' implicitly has an 'any[]' type.
                mesSend.shift();                            // remove the first (oldest) chat entry..
                await checkPromptSize();                            // and check size again..
            } else {
                //end
                console.debug(`---mesSend.length = ${mesSend.length}`);
            }
        }
    }

    if (generatedPromptCache.length > 0 && main_api !== 'openai') {
        console.debug('---Generated Prompt Cache length: ' + generatedPromptCache.length);
        await checkPromptSize();
    } else {
        console.debug('---calling setPromptString ' + generatedPromptCache.length);
        setPromptString();
    }

    // For prompt bit itemization
    let mesSendString = '';

    /**
     *
     * @param isNegative
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'isNegative' implicitly has an 'any' typ... Remove this comment to see the full error message
    async function getCombinedPrompt(isNegative) {
        // Only return if the guidance scale doesn't exist or the value is 1
        // Also don't return if constructing the neutral prompt
        if (isNegative && !useCfgPrompt) {
            return;
        }

        // OAI has its own prompt manager. No need to do anything here
        if (main_api === 'openai') {
            return '';
        }

        // Deep clone
        // @ts-expect-error TS(7005) FIXME: Variable 'mesSend' implicitly has an 'any[]' type.
        const finalMesSend = structuredClone(mesSend);

        if (useCfgPrompt) {
            const cfgPrompt = getCfgPrompt(cfgGuidanceScale, isNegative);
            if (cfgPrompt.value) {
                if (cfgPrompt.depth === 0) {
                    finalMesSend[finalMesSend.length - 1].message +=
                        /\s/.test(finalMesSend[finalMesSend.length - 1].message.slice(-1))
                            ? cfgPrompt.value
                            : ` ${cfgPrompt.value}`;
                } else {
                    // TODO: Make all extension prompts use an array/splice method
                    const lengthDiff = mesSend.length - cfgPrompt.depth;
                    const cfgDepth = lengthDiff >= 0 ? lengthDiff : 0;
                    const cfgMessage = finalMesSend[cfgDepth];
                    if (cfgMessage) {
                        if (!Array.isArray(finalMesSend[cfgDepth].extensionPrompts)) {
                            finalMesSend[cfgDepth].extensionPrompts = [];
                        }
                        finalMesSend[cfgDepth].extensionPrompts.push(`${cfgPrompt.value}\n`);
                    }
                }
            }
        }

        // Add prompt bias after everything else
        // Always run with continue
        if (!isInstruct && !isImpersonate) {
            if (promptBias.trim().length !== 0) {
                finalMesSend[finalMesSend.length - 1].message +=
                    /\s/.test(finalMesSend[finalMesSend.length - 1].message.slice(-1))
                        ? promptBias.trimStart()
                        : ` ${promptBias.trimStart()}`;
            }
        }

        // Flattens the multiple prompt objects to a string.
        const combine = () => {
            // Right now, everything is suffixed with a newline
            mesSendString = finalMesSend.map((e) => `${e.extensionPrompts.join('')}${e.message}`).join('');

            // add a custom dingus (if defined)
            mesSendString = addChatsSeparator(mesSendString);

            // add chat preamble
            mesSendString = addChatsPreamble(mesSendString);

            let combinedPrompt = [
                combinedStoryString,
                mesExmString,
                mesSendString,
                generatedPromptCache,
            ].join('').replace(/\r/gm, '');

            if (power_user.collapse_newlines) {
                combinedPrompt = collapseNewlines(combinedPrompt);
            }

            return combinedPrompt;
        };

        finalMesSend.forEach((item, i) => {
            // @ts-expect-error TS(7005) FIXME: Variable 'injectedIndices' implicitly has an 'any[... Remove this comment to see the full error message
            item.injected = injectedIndices.includes(finalMesSend.length - i - 1);
        });

        const data = {
            api: main_api,
            combinedPrompt: null,
            description,
            personality,
            persona,
            scenario,
            char: name2,
            user: name1,
            worldInfoBefore,
            worldInfoAfter,
            beforeScenarioAnchor,
            afterScenarioAnchor,
            storyString,
            mesExmString,
            mesSendString,
            finalMesSend,
            generatedPromptCache,
            main: system,
            jailbreak,
            naiPreamble: nai_settings.preamble,
        };

        // Before returning the combined prompt, give available context related information to all subscribers.
        await eventSource.emit(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, data);

        // If one or multiple subscribers return a value, forfeit the responsibillity of flattening the context.
        return !data.combinedPrompt ? combine() : data.combinedPrompt;
    }

    let finalPrompt = await getCombinedPrompt(false);

    const eventData = { prompt: finalPrompt, dryRun: dryRun };
    await eventSource.emit(event_types.GENERATE_AFTER_COMBINE_PROMPTS, eventData);
    finalPrompt = eventData.prompt;

    let maxLength = Number(amount_gen); // how many tokens the AI will be requested to generate
    // @ts-expect-error TS(7034) FIXME: Variable 'thisPromptBits' implicitly has type 'any... Remove this comment to see the full error message
    const thisPromptBits = [];

    // @ts-expect-error TS(7034) FIXME: Variable 'generate_data' implicitly has type 'any'... Remove this comment to see the full error message
    let generate_data;
    switch (main_api) {
        case 'koboldhorde':
        case 'kobold':
            if (main_api == 'koboldhorde' && horde_settings.auto_adjust_response_length) {
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                maxLength = Math.min(maxLength, adjustedParams.maxLength);
                maxLength = Math.max(maxLength, MIN_LENGTH); // prevent validation errors
            }

            generate_data = {
                prompt: finalPrompt,
                gui_settings: true,
                max_length: maxLength,
                max_context_length: max_context,
                api_server: kai_settings.api_server,
            };

            if (kai_settings.preset_settings != 'gui') {
                const isHorde = main_api == 'koboldhorde';
                const presetSettings = koboldai_settings[koboldai_setting_names[kai_settings.preset_settings]];
                const maxContext = (adjustedParams && horde_settings.auto_adjust_context_length) ? adjustedParams.maxContextLength : max_context;
                generate_data = getKoboldGenerationData(finalPrompt, presetSettings, maxLength, maxContext, isHorde, type);
            }
            break;
        case 'textgenerationwebui': {
            const cfgValues = useCfgPrompt ? { guidanceScale: cfgGuidanceScale, negativePrompt: await getCombinedPrompt(true) } : null;
            generate_data = await getTextGenGenerationData(finalPrompt, maxLength, isImpersonate, isContinue, cfgValues, type);
            break;
        }
        case 'novel': {
            const cfgValues = useCfgPrompt ? { guidanceScale: cfgGuidanceScale } : null;
            const presetSettings = novelai_settings[novelai_setting_names[nai_settings.preset_settings_novel]];
            generate_data = getNovelGenerationData(finalPrompt, presetSettings, maxLength, isImpersonate, isContinue, cfgValues, type);
            break;
        }
        case 'openai': {
            const [prompt, counts] = await prepareOpenAIMessages({
                name2: name2,
                charDescription: description,
                charPersonality: personality,
                scenario: scenario,
                worldInfoBefore: worldInfoBefore,
                worldInfoAfter: worldInfoAfter,
                extensionPrompts: extension_prompts,
                bias: promptBias,
                type: type,
                quietPrompt: quiet_prompt,
                quietImage: quietImage,
                cyclePrompt: cyclePrompt,
                systemPromptOverride: system,
                jailbreakPromptOverride: jailbreak,
                // @ts-expect-error TS(7005) FIXME: Variable 'oaiMessages' implicitly has an 'any[]' t... Remove this comment to see the full error message
                messages: oaiMessages,
                // @ts-expect-error TS(7005) FIXME: Variable 'oaiMessageExamples' implicitly has an 'a... Remove this comment to see the full error message
                messageExamples: oaiMessageExamples,
            }, dryRun);
            generate_data = { prompt: prompt };

            // TODO: move these side-effects somewhere else, so this switch-case solely sets generate_data
            // counts will return false if the user has not enabled the token breakdown feature
            if (counts) {
                // @ts-expect-error TS(7005) FIXME: Variable 'thisPromptBits' implicitly has an 'any[]... Remove this comment to see the full error message
                parseTokenCounts(counts, thisPromptBits);
            }

            if (!dryRun) {
                setInContextMessages(openai_messages_count, type);
            }
            break;
        }
    }

    await eventSource.emit(event_types.GENERATE_AFTER_DATA, generate_data, dryRun);

    if (dryRun) {
        return Promise.resolve();
    }

    /**
     * Saves itemized prompt bits and calls streaming or non-streaming generation API.
     * @returns {Promise<void | * | Awaited<*> | string | {fromStream} | string | undefined | object>}
     * @throws {Error|object} Error with message text, or Error with response JSON (OAI/Horde), or the actual response JSON (novel|textgenerationwebui|kobold)
     */
    // @ts-expect-error TS(7023) FIXME: 'finishGenerating' implicitly has return type 'any... Remove this comment to see the full error message
    async function finishGenerating() {
        if (power_user.console_log_prompts) {
            // @ts-expect-error TS(7005) FIXME: Variable 'generate_data' implicitly has an 'any' t... Remove this comment to see the full error message
            console.log(generate_data.prompt);
        }

        console.debug('rungenerate calling API');

        showStopButton();

        //set array object for prompt token itemization of this message
        const currentArrayEntry = Number(thisPromptBits.length - 1);
        const additionalPromptStuff = {
            // @ts-expect-error TS(7005) FIXME: Variable 'thisPromptBits' implicitly has an 'any[]... Remove this comment to see the full error message
            ...thisPromptBits[currentArrayEntry],
            // @ts-expect-error TS(7005) FIXME: Variable 'generate_data' implicitly has an 'any' t... Remove this comment to see the full error message
            rawPrompt: generate_data.prompt || generate_data.input,
            mesId: getNextMessageId(type),
            allAnchors: await getAllExtensionPrompts(),
            // @ts-expect-error TS(7005) FIXME: Variable 'injectedIndices' implicitly has an 'any[... Remove this comment to see the full error message
            chatInjects: injectedIndices?.map(index => arrMes[arrMes.length - index - 1])?.join('') || '',
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            summarizeString: (extension_prompts['1_memory']?.value || ''),
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            authorsNoteString: (extension_prompts['2_floating_prompt']?.value || ''),
            // @ts-expect-error TS(2339) FIXME: Property 'chromadb' does not exist on type '{}'.
            smartContextString: (extension_prompts.chromadb?.value || ''),
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            chatVectorsString: (extension_prompts['3_vectors']?.value || ''),
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            dataBankVectorsString: (extension_prompts['4_vectors_data_bank']?.value || ''),
            worldInfoString: worldInfoString,
            storyString: storyString,
            beforeScenarioAnchor: beforeScenarioAnchor,
            afterScenarioAnchor: afterScenarioAnchor,
            examplesString: examplesString,
            mesSendString: mesSendString,
            generatedPromptCache: generatedPromptCache,
            promptBias: promptBias,
            finalPrompt: finalPrompt,
            charDescription: description,
            charPersonality: personality,
            scenarioText: scenario,
            this_max_context: this_max_context,
            padding: power_user.token_padding,
            main_api: main_api,
            instruction: main_api !== 'openai' && power_user.sysprompt.enabled ? substituteParams(power_user.prefer_character_prompt && system ? system : power_user.sysprompt.content) : '',
            userPersona: (power_user.persona_description_position == persona_description_positions.IN_PROMPT ? (persona || '') : ''),
            tokenizer: getFriendlyTokenizerName(main_api).tokenizerName || '',
            presetName: getPresetManager()?.getSelectedPresetName() || '',
            messagesCount: main_api !== 'openai' ? mesSend.length : oaiMessages.length,
            // @ts-expect-error TS(7005) FIXME: Variable 'pinExmString' implicitly has an 'any' ty... Remove this comment to see the full error message
            examplesCount: main_api !== 'openai' ? (pinExmString ? mesExamplesArray.length : count_exm_add) : oaiMessageExamples.length,
        };

        //console.log(additionalPromptStuff);
        // @ts-expect-error TS(2339) FIXME: Property 'mesId' does not exist on type 'never'.
        const itemizedIndex = itemizedPrompts.findIndex((item) => item.mesId === additionalPromptStuff.mesId);

        if (itemizedIndex !== -1) {
            // @ts-expect-error TS(2322) FIXME: Type 'any' is not assignable to type 'never'.
            itemizedPrompts[itemizedIndex] = additionalPromptStuff;
        } else {
            // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
            itemizedPrompts.push(additionalPromptStuff);
        }

        console.debug(`pushed prompt bits to itemizedPrompts array. Length is now: ${itemizedPrompts.length}`);

        if (isStreamingEnabled() && type !== 'quiet') {
            continue_mag = promptReasoning.removePrefix(continue_mag);
            // @ts-expect-error TS(2322) FIXME: Type 'StreamingProcessor' is not assignable to typ... Remove this comment to see the full error message
            streamingProcessor = new StreamingProcessor(type, force_name2, generation_started, continue_mag, promptReasoning);
            if (isContinue) {
                // Save reply does add cycle text to the prompt, so it's not needed here
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                streamingProcessor.firstMessageText = '';
            }

            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            streamingProcessor.generator = await sendStreamingRequest(type, generate_data, { jsonSchema });

            hideSwipeButtons();
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            let getMessage = await streamingProcessor.generate();
            const messageChunk = cleanUpMessage({
                getMessage: getMessage,
                isImpersonate: isImpersonate,
                isContinue: isContinue,
                displayIncompleteSentences: false,
            });

            if (isContinue) {
                getMessage = continue_mag + getMessage;
            }

            // @ts-expect-error TS(2339) FIXME: Property 'isStopped' does not exist on type 'never... Remove this comment to see the full error message
            const isStreamFinished = streamingProcessor && !streamingProcessor.isStopped && streamingProcessor.isFinished;
            // @ts-expect-error TS(2339) FIXME: Property 'toolCalls' does not exist on type 'never... Remove this comment to see the full error message
            const isStreamWithToolCalls = streamingProcessor && Array.isArray(streamingProcessor.toolCalls) && streamingProcessor.toolCalls.length;
            if (canPerformToolCalls && isStreamFinished && isStreamWithToolCalls) {
                const lastMessage = chat[chat.length - 1];
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                const hasToolCalls = ToolManager.hasToolCalls(streamingProcessor.toolCalls);
                // @ts-expect-error TS(2339) FIXME: Property 'mes' does not exist on type 'never'.
                const shouldDeleteMessage = type !== 'swipe' && ['', '...'].includes(lastMessage?.mes) && !lastMessage?.extra?.reasoning && ['', '...'].includes(streamingProcessor?.result);
                if (hasToolCalls && shouldDeleteMessage) await deleteLastMessage();
                if (hasToolCalls && !shouldDeleteMessage) {
                    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                    await streamingProcessor.finalizeIntermediaryMessage(streamingProcessor.messageId, getMessage, { unlockUI: false });
                }
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                const invocationResult = await ToolManager.invokeFunctionTools(streamingProcessor.toolCalls, {
                    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                    reasoningText: streamingProcessor.reasoningHandler.reasoning,
                });
                const shouldStopGeneration = (!invocationResult.invocations.length && shouldDeleteMessage) || invocationResult.stealthCalls.length;
                if (hasToolCalls) {
                    if (shouldStopGeneration) {
                        if (Array.isArray(invocationResult.errors) && invocationResult.errors.length) {
                            ToolManager.showToolCallError(invocationResult.errors);
                        }
                        unblockGeneration(type);
                        streamingProcessor = null;
                        return;
                    }

                    streamingProcessor = null;
                    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                    depth = depth + 1;
                    await ToolManager.saveFunctionToolInvocations(invocationResult.invocations);
                    return Generate('normal', { automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, force_chid, signal, quietImage, quietName, depth }, dryRun);
                }
            }

            if (isStreamFinished) {
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                await streamingProcessor.onFinishStreaming(streamingProcessor.messageId, getMessage);
                streamingProcessor = null;
                triggerAutoContinue(messageChunk, isImpersonate);
                return Object.defineProperties(new String(getMessage), {
                    'messageChunk': { value: messageChunk },
                    'fromStream': { value: true },
                });
            }
        } else {
            // @ts-expect-error TS(7005) FIXME: Variable 'generate_data' implicitly has an 'any' t... Remove this comment to see the full error message
            return await sendGenerationRequest(type, generate_data, { jsonSchema });
        }
    }

    return finishGenerating().then(onSuccess, onError);

    /**
     * Handles the successful response from the generation API.
     * @param data
     * @returns {Promise<string | {fromStream} | * | string | string | void | Awaited<*> | undefined>}
     * @throws {Error} Throws an error if the response data contains an error message
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
    async function onSuccess(data) {
        if (!data) return;

        if (data?.fromStream) {
            return data;
        }

        let messageChunk = '';

        // if an error was returned in data (textgenwebui), show it and throw it
        if (data.error) {
            unblockGeneration(type);

            if (data?.response) {
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.error(data.response, t`API Error`, { preventDuplicates: true });
            }
            throw new Error(data?.response);
        }

        if (jsonSchema) {
            unblockGeneration(type);
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            return extractJsonFromData(data, { returnInvalidJson: jsonSchema.returnInvalid ?? false });
        }

        //const getData = await response.json();
        let getMessage = extractMessageFromData(data);
        const title = extractTitleFromData(data);
        let reasoning = extractReasoningFromData(data);
        const imageUrls = extractImagesFromData(data);
        const reasoningSignature = extractReasoningSignatureFromData(data);
        kobold_horde_model = title;

        const swipes = extractMultiSwipes(data, type);

        // @ts-expect-error TS(2322) FIXME: Type 'unknown' is not assignable to type 'string'.
        messageChunk = cleanUpMessage({
            getMessage: getMessage,
            isImpersonate: isImpersonate,
            isContinue: isContinue,
            displayIncompleteSentences: false,
        });


        reasoning = getRegexedString(reasoning, regex_placement.REASONING);

        if (power_user.trim_spaces) {
            reasoning = reasoning.trim();
        }

        if (isContinue) {
            continue_mag = promptReasoning.removePrefix(continue_mag);
            getMessage = continue_mag + getMessage;
        }

        //Formating
        const displayIncomplete = type === 'quiet' && !quietToLoud;
        getMessage = cleanUpMessage({
            getMessage: getMessage,
            isImpersonate: isImpersonate,
            isContinue: isContinue,
            displayIncompleteSentences: displayIncomplete,
        });

        if (isImpersonate) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#send_textarea').val(getMessage)[0].dispatchEvent(new Event('input', { bubbles: true }));
            await eventSource.emit(event_types.IMPERSONATE_READY, getMessage);
        } else if (type == 'quiet') {
            unblockGeneration(type);
            return getMessage;
        } else {
            // Without streaming we'll be having a full message on continuation. Treat it as a last chunk.
            if (originalType !== 'continue') {
                // @ts-expect-error TS(2322) FIXME: Type 'any[]' is not assignable to type 'never[]'.
                ({ type, getMessage } = await saveReply({ type, getMessage, title, swipes, reasoning, imageUrls, reasoningSignature }));
            } else {
                // @ts-expect-error TS(2322) FIXME: Type 'any[]' is not assignable to type 'never[]'.
                ({ type, getMessage } = await saveReply({ type: 'appendFinal', getMessage, title, swipes, reasoning, imageUrls, reasoningSignature }));
            }

            // This relies on `saveReply` having been called to add the message to the chat, so it must be last.
            parseAndSaveLogprobs(data, continue_mag);
        }

        if (canPerformToolCalls) {
            const hasToolCalls = ToolManager.hasToolCalls(data);
            const shouldDeleteMessage = type !== 'swipe' && ['', '...'].includes(getMessage) && !reasoning;
            if (hasToolCalls && shouldDeleteMessage) await deleteLastMessage();
            const invocationResult = await ToolManager.invokeFunctionTools(data, { reasoningText: reasoning });
            const shouldStopGeneration = (!invocationResult.invocations.length && shouldDeleteMessage) || invocationResult.stealthCalls.length;
            if (hasToolCalls) {
                if (shouldStopGeneration) {
                    if (Array.isArray(invocationResult.errors) && invocationResult.errors.length) {
                        ToolManager.showToolCallError(invocationResult.errors);
                    }
                    unblockGeneration(type);
                    return;
                }

                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                depth = depth + 1;
                await ToolManager.saveFunctionToolInvocations(invocationResult.invocations);
                return Generate('normal', { automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, force_chid, signal, quietImage, quietName, depth }, dryRun);
            }
        }

        if (type !== 'quiet') {
            playMessageSound();
        }

        const isAborted = abortController && abortController.signal.aborted;
        if (!isAborted && power_user.auto_swipe && generatedTextFiltered(getMessage)) {
            is_send_press = false;
            return await swipe(null, SWIPE_DIRECTION.RIGHT, { source: SWIPE_SOURCE.AUTO_SWIPE, repeated: true, forceMesId: chat.length - 1 });
        }

        console.debug('/api/chats/save called by /Generate');
        await saveChatConditional();
        unblockGeneration(type);
        streamingProcessor = null;

        if (type !== 'quiet') {
            triggerAutoContinue(messageChunk, isImpersonate);
        }

        // Don't break the API chain that expects a single string in return
        return Object.defineProperty(new String(getMessage), 'messageChunk', { value: messageChunk });
    }

    /**
     * Exception handler for finishGenerating
     * @param {Error|object} exception Error or response JSON
     * @throws {Error|object} Re-throws the exception
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'exception' implicitly has an 'any' type... Remove this comment to see the full error message
    function onError(exception) {
        // if the response JSON was thrown (novel|textgenerationwebui|kobold), show the error message
        if (typeof exception?.error?.message === 'string') {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(exception.error.message, t`Text generation error`, { timeOut: 10000, extendedTimeOut: 20000 });
        }

        unblockGeneration(type);
        console.log(exception);
        streamingProcessor = null;
        throw exception;
    }
}
//MARK: Generate() ends

/**
 * Stops the generation and any streaming if it is currently running.
 */
export function stopGeneration() {
    let stopped = false;
    if (streamingProcessor) {
        // @ts-expect-error TS(2339) FIXME: Property 'onStopStreaming' does not exist on type ... Remove this comment to see the full error message
        streamingProcessor.onStopStreaming();
        stopped = true;
    }
    if (abortController) {
        abortController.abort('Clicked stop button');
        hideStopButton();
        stopped = true;
    }
    eventSource.emit(event_types.GENERATION_STOPPED);
    return stopped;
}

/**
 * Injects extension prompts into chat messages.
 * @param {object[]} messages Array of chat messages
 * @param {boolean} isContinue Whether the generation is a continuation. If true, the extension prompts of depth 0 are injected at position 1.
 * @returns {Promise<number[]>} Array of indices where the extension prompts were injected
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'messages' implicitly has an 'any' type.
async function doChatInject(messages, isContinue) {
    const injectedMessages = [];
    let totalInsertedMessages = 0;
    messages.reverse();

    const maxDepth = getExtensionPromptMaxDepth();
    for (let i = 0; i <= maxDepth; i++) {
        // Order of priority (most important go lower)
        const roles = [extension_prompt_roles.SYSTEM, extension_prompt_roles.USER, extension_prompt_roles.ASSISTANT];
        const names = {
            [extension_prompt_roles.SYSTEM]: '',
            [extension_prompt_roles.USER]: name1,
            [extension_prompt_roles.ASSISTANT]: name2,
        };
        const roleMessages = [];
        const separator = '\n';
        const wrap = false;

        for (const role of roles) {
            // @ts-expect-error TS(2345) FIXME: Argument of type 'number' is not assignable to par... Remove this comment to see the full error message
            const extensionPrompt = String(await getExtensionPrompt(extension_prompt_types.IN_CHAT, i, separator, role, wrap)).trimStart();
            const isNarrator = role === extension_prompt_roles.SYSTEM;
            const isUser = role === extension_prompt_roles.USER;
            const name = names[role];

            if (extensionPrompt) {
                roleMessages.push({
                    name: name,
                    is_user: isUser,
                    mes: extensionPrompt,
                    extra: {
                        type: isNarrator ? system_message_types.NARRATOR : null,
                    },
                });
            }
        }

        if (roleMessages.length) {
            const depth = isContinue && i === 0 ? 1 : i;
            const injectIdx = Math.min(depth + totalInsertedMessages, messages.length);
            messages.splice(injectIdx, 0, ...roleMessages);
            totalInsertedMessages += roleMessages.length;
            injectedMessages.push(...roleMessages);
        }
    }

    const injectedIndices = injectedMessages.map(msg => messages.indexOf(msg));
    messages.reverse();
    return injectedIndices;
}

/**
 *
 */
function flushWIInjections() {
    const depthPrefix = inject_ids.CUSTOM_WI_DEPTH;
    const outletPrefix = inject_ids.CUSTOM_WI_OUTLET('');

    for (const key of Object.keys(extension_prompts)) {
        if (key.startsWith(depthPrefix) || key.startsWith(outletPrefix)) {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            delete extension_prompts[key];
        }
    }
}

/**
 * Unblocks the UI after a generation is complete.
 * @param {string} [type] Generation type (optional)
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
function unblockGeneration(type) {
    // Don't unblock if a parallel stream is still running
    // @ts-expect-error TS(2339) FIXME: Property 'isFinished' does not exist on type 'neve... Remove this comment to see the full error message
    if (type === 'quiet' && streamingProcessor && !streamingProcessor.isFinished) {
        return;
    }

    is_send_press = false;
    activateSendButtons();
    setGenerationProgress(0);
    flushEphemeralStoppingStrings();
    flushWIInjections();
}

/**
 *
 * @param type
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
export function getNextMessageId(type) {
    return type == 'swipe' ? chat.length - 1 : chat.length;
}

/**
 * Determines if the message should be auto-continued.
 * @param {string} messageChunk Current message chunk
 * @param {boolean} isImpersonate Is the user impersonation
 * @returns {boolean} Whether the message should be auto-continued
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'messageChunk' implicitly has an 'any' t... Remove this comment to see the full error message
export function shouldAutoContinue(messageChunk, isImpersonate) {
    if (!power_user.auto_continue.enabled) {
        console.debug('Auto-continue is disabled by user.');
        return false;
    }

    if (typeof messageChunk !== 'string') {
        console.debug('Not triggering auto-continue because message chunk is not a string');
        return false;
    }

    if (isImpersonate) {
        console.log('Continue for impersonation is not implemented yet');
        return false;
    }

    if (is_send_press) {
        console.debug('Auto-continue is disabled because a message is currently being sent.');
        return false;
    }

    if (abortController && abortController.signal.aborted) {
        console.debug('Auto-continue is not triggered because the generation was stopped.');
        return false;
    }

    if (power_user.auto_continue.target_length <= 0) {
        console.log('Auto-continue target length is 0, not triggering auto-continue');
        return false;
    }

    if (main_api === 'openai' && !power_user.auto_continue.allow_chat_completions) {
        console.log('Auto-continue for OpenAI is disabled by user.');
        return false;
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const textareaText = String($('#send_textarea').val());
    const USABLE_LENGTH = 5;

    if (textareaText.length > 0) {
        console.log('Not triggering auto-continue because user input is not empty');
        return false;
    }

    if (messageChunk.trim().length > USABLE_LENGTH && chat.length) {
        const lastMessage = chat[chat.length - 1];
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        const messageLength = getTokenCount(lastMessage.mes);
        const shouldAutoContinue = messageLength < power_user.auto_continue.target_length;

        if (shouldAutoContinue) {
            console.log(`Triggering auto-continue. Message tokens: ${messageLength}. Target tokens: ${power_user.auto_continue.target_length}. Message chunk: ${messageChunk}`);
            return true;
        } else {
            console.log(`Not triggering auto-continue. Message tokens: ${messageLength}. Target tokens: ${power_user.auto_continue.target_length}`);
            return false;
        }
    } else {
        console.log('Last generated chunk was empty, not triggering auto-continue');
        return false;
    }
}

/**
 * Triggers auto-continue if the message meets the criteria.
 * @param {string} messageChunk Current message chunk
 * @param {boolean} isImpersonate Is the user impersonation
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'messageChunk' implicitly has an 'any' t... Remove this comment to see the full error message
export function triggerAutoContinue(messageChunk, isImpersonate) {
    if (selected_group) {
        console.debug('Auto-continue is disabled for group chat');
        return;
    }

    if (shouldAutoContinue(messageChunk, isImpersonate)) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#option_continue').trigger('click');
    }
}

/**
 *
 * @param textareaText
 * @param type
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'textareaText' implicitly has an 'any' t... Remove this comment to see the full error message
export function getBiasStrings(textareaText, type) {
    if (type == 'impersonate' || type == 'continue') {
        return { messageBias: '', promptBias: '', isUserPromptBias: false };
    }

    let promptBias = '';
    let messageBias = extractMessageBias(textareaText);

    // If user input is not provided, retrieve the bias of the most recent relevant message
    if (!textareaText) {
        for (let i = chat.length - 1; i >= 0; i--) {
            const mes = chat[i];
            if (type === 'swipe' && chat.length - 1 === i) {
                continue;
            }
            // @ts-expect-error TS(2339) FIXME: Property 'is_user' does not exist on type 'never'.
            if (mes && (mes.is_user || mes.is_system || mes.extra?.type === system_message_types.NARRATOR)) {
                // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
                if (mes.extra?.bias?.trim()?.length > 0) {
                    // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
                    promptBias = mes.extra.bias;
                }
                break;
            }
        }
    }

    promptBias = messageBias || promptBias || power_user.user_prompt_bias || '';
    const isUserPromptBias = promptBias === power_user.user_prompt_bias;

    // Substitute params for everything
    messageBias = substituteParams(messageBias);
    promptBias = substituteParams(promptBias);

    return { messageBias, promptBias, isUserPromptBias };
}

/**
 * @param {object} chatItem Message history item.
 * @param {boolean} isInstruct Whether instruct mode is enabled.
 * @param {boolean|number} forceOutputSequence Whether to force the first/last output sequence for instruct mode.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'chatItem' implicitly has an 'any' type.
function formatMessageHistoryItem(chatItem, isInstruct, forceOutputSequence) {
    const isNarratorType = chatItem?.extra?.type === system_message_types.NARRATOR;
    const characterName = chatItem?.name ? chatItem.name : name2;
    const itemName = chatItem.is_user ? chatItem.name : characterName;
    const shouldPrependName = !isNarratorType;

    // If this symbol flag is set, completely ignore the message.
    // This can be used to hide messages without affecting the number of messages in the chat.
    if (chatItem.extra?.[IGNORE_SYMBOL]) {
        return '';
    }

    // Don't include a name if it's empty
    let textResult = chatItem?.name && shouldPrependName ? `${itemName}: ${chatItem.mes}\n` : `${chatItem.mes}\n`;

    if (isInstruct) {
        textResult = formatInstructModeChat(itemName, chatItem.mes, chatItem.is_user, isNarratorType, chatItem.force_avatar, name1, name2, forceOutputSequence);
    }

    return textResult;
}

/**
 * Removes all {{macros}} from a string.
 * @param {string} str String to remove macros from.
 * @returns {string} String with macros removed.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'str' implicitly has an 'any' type.
export function removeMacros(str) {
    return (str ?? '').replace(/\{\{[\s\S]*?\}\}/gm, '').trim();
}

/**
 * Inserts a user message into the chat history.
 * @param {string} messageText Message text.
 * @param {string} messageBias Message bias.
 * @param {number} [insertAt] Optional index to insert the message at.
 * @param {boolean} [compact] Send as a compact display message.
 * @param {string} [name] Name of the user sending the message. Defaults to name1.
 * @param {string} [avatar] Avatar of the user sending the message. Defaults to user_avatar.
 * @returns {Promise<any>} A promise that resolves to the message when it is inserted.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'messageText' implicitly has an 'any' ty... Remove this comment to see the full error message
export async function sendMessageAsUser(messageText, messageBias, insertAt = null, compact = false, name = name1, avatar = user_avatar) {
    messageText = getRegexedString(messageText, regex_placement.USER_INPUT);

    const message = {
        name: name,
        is_user: true,
        is_system: false,
        send_date: getMessageTimeStamp(),
        mes: substituteParams(messageText),
        extra: {
            isSmallSys: compact,
        },
    };

    if (power_user.message_token_count_enabled) {
        // @ts-expect-error TS(2339) FIXME: Property 'token_count' does not exist on type '{ i... Remove this comment to see the full error message
        message.extra.token_count = await getTokenCountAsync(message.mes, 0);
    }

    // Lock user avatar to a persona.
    if (avatar in power_user.personas) {
        // @ts-expect-error TS(2339) FIXME: Property 'force_avatar' does not exist on type '{ ... Remove this comment to see the full error message
        message.force_avatar = getThumbnailUrl('persona', avatar);
    }

    if (messageBias) {
        // @ts-expect-error TS(2339) FIXME: Property 'bias' does not exist on type '{ isSmallS... Remove this comment to see the full error message
        message.extra.bias = messageBias;
        message.mes = removeMacros(message.mes);
    }

    await populateFileAttachment(message);
    statMesProcess(message, 'user', characters, this_chid, '');

    chat_metadata.tainted = true;

    if (typeof insertAt === 'number' && insertAt >= 0 && insertAt <= chat.length) {
        // @ts-expect-error TS(2345) FIXME: Argument of type '{ name: string; is_user: boolean... Remove this comment to see the full error message
        chat.splice(insertAt, 0, message);
        await saveChatConditional();
        await eventSource.emit(event_types.MESSAGE_SENT, insertAt);
        await reloadCurrentChat();
        await eventSource.emit(event_types.USER_MESSAGE_RENDERED, insertAt);
    } else {
        // @ts-expect-error TS(2345) FIXME: Argument of type '{ name: string; is_user: boolean... Remove this comment to see the full error message
        chat.push(message);
        await saveChatConditional();
        const chat_id = (chat.length - 1);
        await eventSource.emit(event_types.MESSAGE_SENT, chat_id);
        addOneMessage(message);
        await eventSource.emit(event_types.USER_MESSAGE_RENDERED, chat_id);
    }

    return message;
}

/**
 * Gets the maximum context token limit (the full context window size before subtracting response length).
 * @returns {number} The maximum context token limit for the current API.
 */
export function getMaxContextTokens() {
    if (main_api == 'kobold' || main_api == 'koboldhorde' || main_api == 'textgenerationwebui') {
        return max_context;
    }
    if (main_api == 'novel') {
        let this_max_context = Number(max_context);
        if (nai_settings.model_novel.includes('clio')) {
            this_max_context = Math.min(max_context, 8192);
        }
        if (nai_settings.model_novel.includes('kayra')) {
            this_max_context = Math.min(max_context, 8192);

            const subscriptionLimit = getKayraMaxContextTokens();
            if (typeof subscriptionLimit === 'number' && this_max_context > subscriptionLimit) {
                this_max_context = subscriptionLimit;
                console.log(`NovelAI subscription limit reached. Max context size is now ${this_max_context}`);
            }
        }
        if (nai_settings.model_novel.includes('erato')) {
            // subscriber limits coming soon
            this_max_context = Math.min(max_context, 8192);

            // Added special tokens and whatnot
            this_max_context -= 10;
        }
        return this_max_context;
    }
    if (main_api == 'openai') {
        return oai_settings.openai_max_context;
    }
    return 1487;
}

/**
 * Gets the maximum response token limit (the max generation/reply length).
 * @returns {number} The maximum response token limit for the current API.
 */
export function getMaxResponseTokens() {
    if (main_api == 'kobold' || main_api == 'koboldhorde' || main_api == 'textgenerationwebui' || main_api == 'novel') {
        return amount_gen;
    }
    if (main_api == 'openai') {
        return oai_settings.openai_max_tokens;
    }
    return 0;
}

/**
 * Gets the maximum usable prompt size for the current API.
 * @param {number|null} overrideResponseLength Optional override for the response length.
 * @returns {number} Maximum usable prompt size.
 */
export function getMaxPromptTokens(overrideResponseLength = null) {
    if (typeof overrideResponseLength !== 'number' || overrideResponseLength <= 0 || isNaN(overrideResponseLength)) {
        overrideResponseLength = null;
    }

    return getMaxContextTokens() - (overrideResponseLength || getMaxResponseTokens());
}

/**
 *
 * @param counts
 * @param thisPromptBits
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'counts' implicitly has an 'any' type.
function parseTokenCounts(counts, thisPromptBits) {
    /**
     * @param {any[]} numbers
     */
    // @ts-expect-error TS(7019) FIXME: Rest parameter 'numbers' implicitly has an 'any[]'... Remove this comment to see the full error message
    function getSum(...numbers) {
        return numbers.map(x => Number(x)).filter(x => !Number.isNaN(x)).reduce((acc, val) => acc + val, 0);
    }
    const total = getSum(Object.values(counts));

    thisPromptBits.push({
        oaiStartTokens: (counts?.start + counts?.controlPrompts) || 0,
        oaiPromptTokens: getSum(counts?.prompt, counts?.charDescription, counts?.charPersonality, counts?.scenario) || 0,
        oaiBiasTokens: counts?.bias || 0,
        oaiNudgeTokens: counts?.nudge || 0,
        oaiJailbreakTokens: counts?.jailbreak || 0,
        oaiImpersonateTokens: counts?.impersonate || 0,
        oaiExamplesTokens: (counts?.dialogueExamples + counts?.examples) || 0,
        oaiConversationTokens: (counts?.conversation + counts?.chatHistory) || 0,
        oaiNsfwTokens: counts?.nsfw || 0,
        oaiMainTokens: counts?.main || 0,
        oaiTotalTokens: total,
    });
}

/**
 *
 * @param mesSendString
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'mesSendString' implicitly has an 'any' ... Remove this comment to see the full error message
function addChatsPreamble(mesSendString) {
    return main_api === 'novel'
        ? substituteParams(nai_settings.preamble) + '\n' + mesSendString
        : mesSendString;
}

/**
 *
 * @param mesSendString
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'mesSendString' implicitly has an 'any' ... Remove this comment to see the full error message
function addChatsSeparator(mesSendString) {
    if (power_user.context.chat_start) {
        return substituteParams(power_user.context.chat_start + '\n') + mesSendString;
    } else {
        return mesSendString;
    }
}

/**
 * Duplicates a character.
 * @param {object} [options] - Options
 * @param {string} [options.avatar] - Avatar key of the character to duplicate. Uses current character if not provided.
 * @param {boolean} [options.silent] - Whether to skip the confirmation popup
 * @returns {Promise<string>} The avatar key of the duplicated character, or empty string if cancelled/failed
 */
export async function duplicateCharacter({ avatar = null, silent = false } = {}) {
    // Determine the character to duplicate
    let targetAvatar;
    if (avatar) {
        const character = characters.find(c => c.avatar === avatar);
        if (!character) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.warning(t`Character not found: ${avatar}`);
            return '';
        }
        targetAvatar = avatar;
    } else {
        if (this_chid === undefined || !characters[this_chid]) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.warning(t`You must first select a character to duplicate!`);
            return '';
        }
        targetAvatar = characters[this_chid].avatar;
    }

    // Show confirmation unless silent
    if (!silent) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const confirmMessage = $(await renderTemplateAsync('duplicateConfirm'));
        const confirm = await callGenericPopup(confirmMessage, POPUP_TYPE.CONFIRM);

        if (!confirm) {
            console.log('User cancelled duplication');
            return '';
        }
    }

    const body = { avatar_url: targetAvatar };
    const response = await fetch('/api/characters/duplicate', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`Failed to duplicate character`);
        return '';
    }

    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
    toastr.success(t`Character Duplicated`);
    const data = await response.json();
    await eventSource.emit(event_types.CHARACTER_DUPLICATED, { oldAvatar: targetAvatar, newAvatar: data.path });
    await getCharacters();

    return data.path;
}

/**
 *
 * @param msgInContextCount
 * @param type
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'msgInContextCount' implicitly has an 'a... Remove this comment to see the full error message
function setInContextMessages(msgInContextCount, type) {
    chatElement.find('.mes').removeClass('lastInContext');

    if (type === 'swipe' || type === 'regenerate' || type === 'continue') {
        msgInContextCount++;
    }

    const lastMessageBlock = chatElement.find('.mes:not([is_system="true"]), .mes.toolCall').eq(-msgInContextCount);
    lastMessageBlock.addClass('lastInContext');

    if (lastMessageBlock.length === 0) {
        const firstMessageId = getFirstDisplayedMessageId();
        chatElement.find(`.mes[mesid="${firstMessageId}"]`).addClass('lastInContext');
    }

    // Update last id to chat. No metadata save on purpose, gets hopefully saved via another call
    const lastMessageId = Math.max(0, chat.length - msgInContextCount);
    chat_metadata.lastInContextMessageId = lastMessageId;
}

/**
 * @typedef {object} AdditionalRequestOptions
 * @property {JsonSchema} [jsonSchema]
 */

/**
 * Sends a non-streaming request to the API.
 * @param {string} type Generation type
 * @param {object} data Generation data
 * @param {AdditionalRequestOptions} [options] Additional options for the generation request
 * @returns {Promise<object>} Response data from the API
 * @throws {Error|object}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
export async function sendGenerationRequest(type, data, options = {}) {
    if (main_api === 'openai') {
        return await sendOpenAIRequest(type, data.prompt, abortController.signal, options);
    }

    if (main_api === 'koboldhorde') {
        return await generateHorde(data.prompt, data, abortController.signal, true);
    }

    const response = await fetch(getGenerateUrl(main_api), {
        method: 'POST',
        headers: getRequestHeaders(),
        cache: 'no-cache',
        body: JSON.stringify(data),
        signal: abortController.signal,
    });

    if (!response.ok) {
        throw await response.json();
    }

    return await response.json();
}

/**
 * Sends a streaming request to the API.
 * @param {string} type Generation type
 * @param {object} data Generation data
 * @param {AdditionalRequestOptions} [options] Additional options for the generation request
 * @returns {Promise<any>} Streaming generator
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
export async function sendStreamingRequest(type, data, options = {}) {
    if (abortController?.signal?.aborted) {
        throw new Error('Generation was aborted.');
    }

    switch (main_api) {
        case 'openai':
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            return await sendOpenAIRequest(type, data.prompt, streamingProcessor.abortController.signal, options);
        case 'textgenerationwebui':
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            return await generateTextGenWithStreaming(data, streamingProcessor.abortController.signal);
        case 'novel':
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            return await generateNovelWithStreaming(data, streamingProcessor.abortController.signal);
        case 'kobold':
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            return await generateKoboldWithStreaming(data, streamingProcessor.abortController.signal);
        default:
            throw new Error('Streaming is enabled, but the current API does not support streaming.');
    }
}

/**
 * Gets the generation endpoint URL for the specified API.
 * @param {string} api API name
 * @returns {string} Generation URL
 * @throws {Error} If the API is unknown
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'api' implicitly has an 'any' type.
export function getGenerateUrl(api) {
    switch (api) {
        case 'kobold':
            return '/api/backends/kobold/generate';
        case 'koboldhorde':
            return '/api/backends/koboldhorde/generate';
        case 'textgenerationwebui':
            return '/api/backends/text-completions/generate';
        case 'novel':
            return '/api/novelai/generate';
        default:
            throw new Error(`Unknown API: ${api}`);
    }
}

/**
 *
 * @param data
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
function extractTitleFromData(data) {
    if (main_api == 'koboldhorde') {
        return data.workerName;
    }

    return undefined;
}

/**
 * Extracts the image from the response data.
 * @param {object} data Response data
 * @param {object} [options] Extraction options
 * @param {string} [options.mainApi] Main API to use
 * @param {string} [options.chatCompletionSource] Chat completion source
 * @returns {string[]} Extracted images or empty array
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
function extractImagesFromData(data, { mainApi = null, chatCompletionSource = null } = {}) {
    switch (mainApi ?? main_api) {
        case 'openai': {
            switch (chatCompletionSource ?? oai_settings.chat_completion_source) {
                case chat_completion_sources.VERTEXAI:
                case chat_completion_sources.MAKERSUITE: {
                    // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
                    const inlineData = data?.responseContent?.parts?.filter(x => x.inlineData && !x.thought)?.map(x => x.inlineData);
                    if (Array.isArray(inlineData) && inlineData.length > 0) {
                        return inlineData.map(x => `data:${x.mimeType};base64,${x.data}`).filter(isDataURL);
                    }
                } break;
                case chat_completion_sources.OPENROUTER: {
                    // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
                    const imageUrl = data?.choices[0]?.message?.images?.filter(x => x.type === 'image_url')?.map(x => x?.image_url?.url);
                    if (Array.isArray(imageUrl) && imageUrl.length > 0) {
                        return imageUrl.filter(isDataURL);
                    }
                    // TODO: Handle remote URLs
                }
            }
        } break;
    }

    return [];
}

/**
 * parseAndSaveLogprobs receives the full data response for a non-streaming
 * generation, parses logprobs for all tokens in the message, and saves them
 * to the currently active message.
 * @param {object} data - response data containing all tokens/logprobs
 * @param {string} continueFrom - for 'continue' generations, the prompt
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
function parseAndSaveLogprobs(data, continueFrom) {
    /** @type {import('./scripts/logprobs.js').TokenLogprobs[] | null} */
    let logprobs = null;

    switch (main_api) {
        case 'novel':
            // parser only handles one token/logprob pair at a time
            logprobs = data.logprobs?.map(parseNovelAILogprobs) || null;
            break;
        case 'openai':
            // OAI and other chat completion APIs must handle this earlier in
            // `sendOpenAIRequest`. `data` for these APIs is just a string with
            // the text of the generated message, logprobs are not included.
            return;
        case 'textgenerationwebui':
            switch (textgen_settings.type) {
                case textgen_types.LLAMACPP: {
                    // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
                    logprobs = data?.completion_probabilities?.map(x => parseTextgenLogprobs(x.content, [x])) || null;
                } break;
                case textgen_types.KOBOLDCPP:
                case textgen_types.VLLM:
                case textgen_types.INFERMATICAI:
                case textgen_types.APHRODITE:
                case textgen_types.MANCER:
                case textgen_types.TABBY: {
                    logprobs = parseTabbyLogprobs(data) || null;
                } break;
            } break;
        default:
            return;
    }

    saveLogprobsForActiveMessage(logprobs, continueFrom);
}

/**
 * Extracts the message from the response data.
 * @param {object} data Response data
 * @param {string} activeApi If it's set, ignores active API
 * @returns {string} Extracted message
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export function extractMessageFromData(data, activeApi = null) {
    /**
     *
     */
    function getResult() {
        if (typeof data === 'string') {
            return data;
        }

        switch (activeApi ?? main_api) {
            case 'kobold':
                return data.results[0].text;
            case 'koboldhorde':
                return data.text;
            case 'textgenerationwebui':
                return data.choices?.[0]?.text ?? data.choices?.[0]?.message?.content ?? data.content ?? data.response ?? data[0]?.content ?? '';
            case 'novel':
                return data.output;
            case 'openai':
                // @ts-expect-error TS(7006) FIXME: Parameter 'p' implicitly has an 'any' type.
                return data?.content?.filter(p => p.type === 'text')?.map(p => p.text)?.join('\n\n') ?? data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? data?.text ?? data?.message?.content?.[0]?.text ?? data?.message?.tool_plan ?? '';
            default:
                return '';
        }
    }

    const result = getResult();
    return Array.isArray(result) ? result.map(x => x.text).filter(x => x).join('') : result;
}

/**
 * Extracts JSON from the response data.
 * @param {object} data Response data
 * @param {object} [options] Extraction options
 * @param {string} [options.mainApi] Main API to use
 * @param {string} [options.chatCompletionSource] Chat completion source
 * @param {boolean} [options.returnInvalidJson] Whether to return the raw JSON string even if it fails to parse
 * @returns {string} Extracted JSON string from the response data
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export function extractJsonFromData(data, { mainApi = null, chatCompletionSource = null, returnInvalidJson = false } = {}) {
    mainApi = mainApi ?? main_api;
    // @ts-expect-error TS(2322) FIXME: Type 'string' is not assignable to type 'null'.
    chatCompletionSource = chatCompletionSource ?? oai_settings.chat_completion_source;

    // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
    const tryParse = (/** @type {string} */ value) => {
        try {
            return JSON.parse(value);
        } catch (e) {
            console.debug('Failed to parse content as JSON.', e);
        }
    };

    let result = {};

    switch (mainApi) {
        // @ts-expect-error TS(2678) FIXME: Type '"openai"' is not comparable to type 'null'.
        case 'openai': {
            const text = extractMessageFromData(data, mainApi);
            switch (chatCompletionSource) {
                // @ts-expect-error TS(2678) FIXME: Type 'string' is not comparable to type 'null'.
                case chat_completion_sources.CLAUDE:
                    // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
                    result = data?.content?.find(x => x.type === 'tool_use')?.input;
                    break;
                // @ts-expect-error TS(2678) FIXME: Type 'string' is not comparable to type 'null'.
                case chat_completion_sources.PERPLEXITY:
                    result = tryParse(removeReasoningFromString(text));
                    if (!result && returnInvalidJson) {
                        return text;
                    }
                    break;
                // @ts-expect-error TS(2678) FIXME: Type 'string' is not comparable to type 'null'.
                case chat_completion_sources.VERTEXAI:
                // @ts-expect-error TS(2678) FIXME: Type 'string' is not comparable to type 'null'.
                case chat_completion_sources.MAKERSUITE:
                // @ts-expect-error TS(2678) FIXME: Type 'string' is not comparable to type 'null'.
                case chat_completion_sources.DEEPSEEK:
                // @ts-expect-error TS(2678) FIXME: Type 'string' is not comparable to type 'null'.
                case chat_completion_sources.AI21:
                // @ts-expect-error TS(2678) FIXME: Type 'string' is not comparable to type 'null'.
                case chat_completion_sources.GROQ:
                // @ts-expect-error TS(2678) FIXME: Type 'string' is not comparable to type 'null'.
                case chat_completion_sources.POLLINATIONS:
                // @ts-expect-error TS(2678) FIXME: Type 'string' is not comparable to type 'null'.
                case chat_completion_sources.AIMLAPI:
                // @ts-expect-error TS(2678) FIXME: Type 'string' is not comparable to type 'null'.
                case chat_completion_sources.OPENAI:
                // @ts-expect-error TS(2678) FIXME: Type 'string' is not comparable to type 'null'.
                case chat_completion_sources.OPENROUTER:
                // @ts-expect-error TS(2678) FIXME: Type 'string' is not comparable to type 'null'.
                case chat_completion_sources.MISTRALAI:
                // @ts-expect-error TS(2678) FIXME: Type 'string' is not comparable to type 'null'.
                case chat_completion_sources.CUSTOM:
                // @ts-expect-error TS(2678) FIXME: Type 'string' is not comparable to type 'null'.
                case chat_completion_sources.COHERE:
                // @ts-expect-error TS(2678) FIXME: Type 'string' is not comparable to type 'null'.
                case chat_completion_sources.XAI:
                // @ts-expect-error TS(2678) FIXME: Type 'string' is not comparable to type 'null'.
                case chat_completion_sources.ELECTRONHUB:
                // @ts-expect-error TS(2678) FIXME: Type 'string' is not comparable to type 'null'.
                case chat_completion_sources.CHUTES:
                // @ts-expect-error TS(2678) FIXME: Type 'string' is not comparable to type 'null'.
                case chat_completion_sources.AZURE_OPENAI:
                // @ts-expect-error TS(2678) FIXME: Type 'string' is not comparable to type 'null'.
                case chat_completion_sources.ZAI:
                default:
                    result = tryParse(text);
                    if (!result && returnInvalidJson) {
                        return text;
                    }
                    break;
            }
        } break;
    }

    return JSON.stringify(result ?? {});
}

/**
 * Extracts multiswipe swipes from the response data.
 * @param {object} data Response data
 * @param {string} type Type of generation
 * @returns {string[]} Array of extra swipes
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
function extractMultiSwipes(data, type) {
    // @ts-expect-error TS(7034) FIXME: Variable 'swipes' implicitly has type 'any[]' in s... Remove this comment to see the full error message
    const swipes = [];

    if (!data) {
        // @ts-expect-error TS(7005) FIXME: Variable 'swipes' implicitly has an 'any[]' type.
        return swipes;
    }

    if (type === 'continue' || type === 'impersonate' || type === 'quiet') {
        // @ts-expect-error TS(7005) FIXME: Variable 'swipes' implicitly has an 'any[]' type.
        return swipes;
    }

    if (main_api === 'textgenerationwebui' && textgen_settings.type === textgen_types.LLAMACPP) {
        if (!Array.isArray(data)) {
            // @ts-expect-error TS(7005) FIXME: Variable 'swipes' implicitly has an 'any[]' type.
            return swipes;
        }

        const multiSwipeCount = data.length - 1;
        if (multiSwipeCount <= 0) {
            // @ts-expect-error TS(7005) FIXME: Variable 'swipes' implicitly has an 'any[]' type.
            return swipes;
        }

        for (let i = 1; i < data.length; i++) {
            const text = data?.[i]?.content ?? '';
            swipes.push(text);
        }
    }

    if (main_api === 'openai' || (main_api === 'textgenerationwebui' && [textgen_types.MANCER, textgen_types.VLLM, textgen_types.APHRODITE, textgen_types.TABBY, textgen_types.INFERMATICAI].includes(textgen_settings.type))) {
        if (!Array.isArray(data.choices)) {
            return swipes;
        }

        const multiSwipeCount = data.choices.length - 1;

        if (multiSwipeCount <= 0) {
            return swipes;
        }

        for (let i = 1; i < data.choices.length; i++) {
            const text = data?.choices[i]?.message?.content ?? data?.choices[i]?.text ?? '';
            swipes.push(text);
        }
    }

    const cleanedSwipes = swipes.map(text => cleanUpMessage({
        getMessage: text,
        isImpersonate: false,
        isContinue: false,
        displayIncompleteSentences: false,
    }));

    return cleanedSwipes;
}

/**
 * Formats a message according to user settings
 * @param {object} [options] - Additional options.
 * @param {string} [options.getMessage] The message to clean up
 * @param {boolean} [options.isImpersonate] Whether this is an impersonated message
 * @param {boolean} [options.isContinue] Whether this is a continued message
 * @param {boolean} [options.displayIncompleteSentences] Whether to keep incomplete sentences at the end.
 * @param {Array} [options.stoppingStrings] Array of stopping strings.
 * @param {boolean} [options.includeUserPromptBias] Whether to permit prepending the user prompt bias at the beginning.
 * @param {boolean} [options.trimNames] Whether to allow trimming "{{char}}:" or "{{user}}:" from the beginning.
 * @param {boolean} [options.trimWrongNames] Whether to allow deleting responses prefixed by the incorrect name, depending on isImpersonate
 * @param {...any} args
 * @returns {string} The formatted message
 */
export function cleanUpMessage({
    getMessage,
    isImpersonate,
    isContinue,
    displayIncompleteSentences = false,
    stoppingStrings = null,
    includeUserPromptBias = true,
    trimNames = true,
    trimWrongNames = true
}: Record<string, unknown> = {}, ...args: unknown[]) {
    if (args.length > 0 && typeof args[0] !== 'object') {
        console.trace('cleanUpMessage called with positional arguments. Please use an object instead.');
        [getMessage, isImpersonate, isContinue, displayIncompleteSentences, stoppingStrings, includeUserPromptBias, trimNames, trimWrongNames] = args;
    }

    if (!getMessage) {
        return '';
    }

    // Add the prompt bias before anything else
    if (
        includeUserPromptBias &&
        power_user.user_prompt_bias &&
        !isImpersonate &&
        !isContinue &&
        power_user.user_prompt_bias.length !== 0
    ) {
        getMessage = substituteParams(power_user.user_prompt_bias) + getMessage;
    }

    // Allow for caching of stopping strings. getStoppingStrings is an expensive function, especially with macros
    // enabled, so for streaming, we call it once and then pass it into each cleanUpMessage call.
    if (!stoppingStrings) {
        stoppingStrings = getStoppingStrings(isImpersonate, isContinue, main_api);
    }

    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
    for (const stoppingString of stoppingStrings) {
        if (stoppingString.length) {
            for (let j = stoppingString.length; j > 0; j--) {
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                if (getMessage.slice(-j) === stoppingString.slice(0, j)) {
                    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                    getMessage = getMessage.slice(0, -j);
                    break;
                }
            }
        }
    }

    // Regex uses vars, so add before formatting
    // @ts-expect-error TS(2345) FIXME: Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
    getMessage = getRegexedString(getMessage, isImpersonate ? regex_placement.USER_INPUT : regex_placement.AI_OUTPUT);

    if (power_user.collapse_newlines) {
        getMessage = collapseNewlines(getMessage);
    }

    // trailing invisible whitespace before every newlines, on a multiline string
    // "trailing whitespace on newlines       \nevery line of the string    \n?sample text" ->
    // "trailing whitespace on newlines\nevery line of the string\nsample text"
    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
    getMessage = getMessage.replace(/[^\S\r\n]+$/gm, '');

    if (trimWrongNames) {
        // If this is an impersonation, delete the entire response if it starts with "{{char}}:"
        // If this isn't an impersonation, delete the entire response if it starts with "{{user}}:"
        // Also delete any trailing text that starts with the wrong name.
        // This only occurs if the corresponding "power_user.allow_nameX_display" is false.

        const wrongName = isImpersonate
            ? (!power_user.allow_name2_display ? name2 : '')  // char
            : (!power_user.allow_name1_display ? name1 : '');  // user

        if (wrongName) {
            // If the message starts with the wrong name, delete the entire response
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            let startIndex = getMessage.indexOf(`${wrongName}:`);
            if (startIndex === 0) {
                getMessage = '';
                console.debug(`Message started with the wrong name: "${wrongName}" - response was deleted.`);
            }

            // If there is trailing text starting with the wrong name, trim it off.
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            startIndex = getMessage.indexOf(`\n${wrongName}:`);
            if (startIndex >= 0) {
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                getMessage = getMessage.substring(0, startIndex);
            }
        }
    }

    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
    if (getMessage.indexOf('<|endoftext|>') != -1) {
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        getMessage = getMessage.substring(0, getMessage.indexOf('<|endoftext|>'));
    }
    const isInstruct = power_user.instruct.enabled && main_api !== 'openai';
    // @ts-expect-error TS(7006) FIXME: Parameter 'str' implicitly has an 'any' type.
    const isNotEmpty = (str) => str && str.trim() !== '';
    if (isInstruct && power_user.instruct.stop_sequence) {
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        if (getMessage.indexOf(power_user.instruct.stop_sequence) != -1) {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            getMessage = getMessage.substring(0, getMessage.indexOf(power_user.instruct.stop_sequence));
        }
    }
    // Hana: Only use the first sequence (should be <|model|>)
    // of the prompt before <|user|> (as KoboldAI Lite does it).
    if (isInstruct && isNotEmpty(power_user.instruct.input_sequence)) {
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        if (getMessage.indexOf(power_user.instruct.input_sequence) != -1) {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            getMessage = getMessage.substring(0, getMessage.indexOf(power_user.instruct.input_sequence));
        }
    }

    // Remove instruct sequences leaking to the output
    if (isInstruct && power_user.instruct.sequences_as_stop_strings) {
        const sequences = [
            { value: power_user.instruct.input_sequence, apply: isImpersonate && isNotEmpty(power_user.instruct.input_sequence) },
            { value: power_user.instruct.output_sequence, apply: !isImpersonate && isNotEmpty(power_user.instruct.output_sequence) },
            { value: power_user.instruct.last_output_sequence, apply: !isImpersonate && isNotEmpty(power_user.instruct.last_output_sequence) },
        ];
        for (const seq of sequences.filter(s => s.apply)) {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            seq.value.split('\n').filter(line => line.trim() !== '').forEach(line => { getMessage = getMessage.replaceAll(line, ''); });
        }
    }

    // clean-up group message from excessive generations
    if (selected_group) {
        getMessage = cleanGroupMessage(getMessage);
    }

    if (!power_user.allow_name2_display) {
        const name2Escaped = escapeRegex(name2);
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        getMessage = getMessage.replace(new RegExp(`(^|\n)${name2Escaped}:\\s*`, 'g'), '$1');
    }

    if (isImpersonate) {
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        getMessage = getMessage.trim();
    }

    if (power_user.auto_fix_generated_markdown) {
        getMessage = fixMarkdown(getMessage, false);
    }

    if (trimNames) {
        // If this is an impersonation, trim "{{user}}:" from the beginning
        // If this isn't an impersonation, trim "{{char}}:" from the beginning.
        // Only applied when the corresponding "power_user.allow_nameX_display" is false.
        const nameToTrim2 = isImpersonate
            ? (!power_user.allow_name1_display ? name1 : '')  // user
            : (!power_user.allow_name2_display ? name2 : '');  // char

        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        if (nameToTrim2 && getMessage.startsWith(nameToTrim2 + ':')) {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            getMessage = getMessage.replace(nameToTrim2 + ':', '');
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            getMessage = getMessage.trimStart();
        }
    }

    if (isImpersonate) {
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        getMessage = getMessage.trim();
    }

    if (!displayIncompleteSentences && power_user.trim_sentences) {
        getMessage = trimToEndSentence(getMessage);
    }

    if (power_user.trim_spaces && !PromptReasoning.getLatestPrefix()) {
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        getMessage = getMessage.trim();
    }

    return getMessage;
}

/**
 * Adds an image to the message.
 * @param {object} message Message object
 * @param {object} sources Image sources
 * @param {string[]} [sources.imageUrls] Image URLs
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'message' implicitly has an 'any' type.
async function processImageAttachment(message, { imageUrls }) {
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
        return;
    }

    for (const [index, imageUrl] of imageUrls.filter(onlyUnique).entries()) {
        if (!imageUrl) {
            continue;
        }

        let url = imageUrl;
        if (isDataURL(url)) {
            const fileName = `inline_image_${Date.now().toString()}_${index}`;
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            const [mime, base64] = /^data:(.*?);base64,(.*)$/.exec(imageUrl).slice(1);
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            url = await saveBase64AsFile(base64, message.name, fileName, mime.split('/')[1]);
        }
        saveImageToMessage({ image: url, inline: true }, message);
    }
}

/**
 * Saves a resulting message to the chat.
 * @param {SaveReplyParams} params
 * @param {...any} args
 * @returns {Promise<SaveReplyResult>} Promise when the message is saved
 * @typedef {object} SaveReplyParams
 * @property {string} type Type of generation
 * @property {string} getMessage Generated message
 * @property {boolean} [fromStreaming] If the message is from streaming
 * @property {string} [title] Message tooltip
 * @property {string[]} [swipes] Extra swipes
 * @property {string} [reasoning] Message reasoning
 * @property {string[]} [imageUrls] Links to images
 * @property {string?} [reasoningSignature] Encrypted signature of the reasoning text
 * @typedef {object} SaveReplyResult
 * @property {string} type Type of generation
 * @property {string} getMessage Generated message
 */
// @ts-expect-error TS(7031) FIXME: Binding element 'type' implicitly has an 'any' typ... Remove this comment to see the full error message
export async function saveReply({ type, getMessage, fromStreaming = false, title = '', swipes = [], reasoning = '', imageUrls = [], reasoningSignature = null }, ...args: unknown[]) {
    // Backward compatibility
    if (args.length > 1 && typeof args[0] !== 'object') {
        console.trace('saveReply called with positional arguments. Please use an object instead.');
        // @ts-expect-error TS(2322) FIXME: Type 'unknown' is not assignable to type 'boolean'... Remove this comment to see the full error message
        [type, getMessage, fromStreaming, title, swipes, reasoning, imageUrls, reasoningSignature] = args;
    }

    const lastMessage = chat[chat.length - 1];

    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    if (type != 'append' && type != 'continue' && type != 'appendFinal' && chat.length && (lastMessage.swipe_id === undefined ||
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMessage.is_user)) {
        type = 'normal';
    }

    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    if (chat.length && (!lastMessage.extra || typeof lastMessage.extra !== 'object')) {
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMessage.extra = {};
    }

    // Coerce null/undefined to empty string
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    if (chat.length && !lastMessage.extra.reasoning) {
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMessage.extra.reasoning = '';
    }

    if (!reasoning) {
        reasoning = '';
    }

    let oldMessage = '';
    const generationFinished = new Date();
    if (type === 'swipe') {
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        oldMessage = lastMessage.mes;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMessage.swipes.length++;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        if (lastMessage.swipe_id === lastMessage.swipes.length - 1) {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            lastMessage.title = title;
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            lastMessage.mes = getMessage;
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            lastMessage.gen_started = generation_started;
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            lastMessage.gen_finished = generationFinished;
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            lastMessage.send_date = getMessageTimeStamp();
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            lastMessage.extra.api = getGeneratingApi();
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            lastMessage.extra.model = getGeneratingModel();
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            lastMessage.extra.reasoning = reasoning;
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            lastMessage.extra.reasoning_duration = null;
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            lastMessage.extra.reasoning_signature = reasoningSignature;
            await processImageAttachment(lastMessage, { imageUrls });
            if (power_user.message_token_count_enabled) {
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                const tokenCountText = (reasoning || '') + lastMessage.mes;
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                lastMessage.extra.token_count = await getTokenCountAsync(tokenCountText, 0);
            }
            const chat_id = (chat.length - 1);
            if (!fromStreaming) await eventSource.emit(event_types.MESSAGE_RECEIVED, chat_id, type);
            // @ts-expect-error TS(2322) FIXME: Type 'string' is not assignable to type 'undefined... Remove this comment to see the full error message
            addOneMessage(chat[chat_id], { type: 'swipe' });
            if (!fromStreaming) await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, chat_id, type);
        } else {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            lastMessage.mes = getMessage;
        }
    } else if (type === 'append' || type === 'continue') {
        console.debug('Trying to append.');
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        oldMessage = lastMessage.mes;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMessage.title = title;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMessage.mes += getMessage;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMessage.gen_started = generation_started;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMessage.gen_finished = generationFinished;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMessage.send_date = getMessageTimeStamp();
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMessage.extra.api = getGeneratingApi();
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMessage.extra.model = getGeneratingModel();
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMessage.extra.reasoning = reasoning;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMessage.extra.reasoning_duration = null;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMessage.extra.reasoning_signature = reasoningSignature;
        await processImageAttachment(lastMessage, { imageUrls });
        if (power_user.message_token_count_enabled) {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            const tokenCountText = (reasoning || '') + lastMessage.mes;
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            lastMessage.extra.token_count = await getTokenCountAsync(tokenCountText, 0);
        }
        const chat_id = (chat.length - 1);
        if (!fromStreaming) await eventSource.emit(event_types.MESSAGE_RECEIVED, chat_id, type);
        // @ts-expect-error TS(2322) FIXME: Type 'string' is not assignable to type 'undefined... Remove this comment to see the full error message
        addOneMessage(chat[chat_id], { type: 'swipe' });
        if (!fromStreaming) await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, chat_id, type);
    } else if (type === 'appendFinal') {
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        oldMessage = lastMessage.mes;
        console.debug('Trying to appendFinal.');
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMessage.title = title;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMessage.mes = getMessage;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMessage.gen_started = generation_started;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMessage.gen_finished = generationFinished;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMessage.send_date = getMessageTimeStamp();
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMessage.extra.api = getGeneratingApi();
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMessage.extra.model = getGeneratingModel();
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMessage.extra.reasoning += reasoning;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMessage.extra.reasoning_signature = reasoningSignature;
        await processImageAttachment(lastMessage, { imageUrls });
        // We don't know if the reasoning duration extended, so we don't update it here on purpose.
        if (power_user.message_token_count_enabled) {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            const tokenCountText = (reasoning || '') + lastMessage.mes;
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            lastMessage.extra.token_count = await getTokenCountAsync(tokenCountText, 0);
        }
        const chat_id = (chat.length - 1);
        if (!fromStreaming) await eventSource.emit(event_types.MESSAGE_RECEIVED, chat_id, type);
        // @ts-expect-error TS(2322) FIXME: Type 'string' is not assignable to type 'undefined... Remove this comment to see the full error message
        addOneMessage(chat[chat_id], { type: 'swipe' });
        if (!fromStreaming) await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, chat_id, type);
    } else {
        console.debug('entering chat update routine for non-swipe post');
        const newMessage = {};
        // @ts-expect-error TS(2345) FIXME: Argument of type '{}' is not assignable to paramet... Remove this comment to see the full error message
        chat.push(newMessage);
        // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type '{}'.
        newMessage.extra = {};
        // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type '{}'.
        newMessage.name = name2;
        // @ts-expect-error TS(2339) FIXME: Property 'is_user' does not exist on type '{}'.
        newMessage.is_user = false;
        // @ts-expect-error TS(2339) FIXME: Property 'send_date' does not exist on type '{}'.
        newMessage.send_date = getMessageTimeStamp();
        // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type '{}'.
        newMessage.extra.api = getGeneratingApi();
        // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type '{}'.
        newMessage.extra.model = getGeneratingModel();
        // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type '{}'.
        newMessage.extra.reasoning = reasoning;
        // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type '{}'.
        newMessage.extra.reasoning_duration = null;
        // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type '{}'.
        newMessage.extra.reasoning_signature = reasoningSignature;
        if (power_user.trim_spaces) {
            getMessage = getMessage.trim();
        }
        // @ts-expect-error TS(2339) FIXME: Property 'mes' does not exist on type '{}'.
        newMessage.mes = getMessage;
        // @ts-expect-error TS(2339) FIXME: Property 'title' does not exist on type '{}'.
        newMessage.title = title;
        // @ts-expect-error TS(2339) FIXME: Property 'gen_started' does not exist on type '{}'... Remove this comment to see the full error message
        newMessage.gen_started = generation_started;
        // @ts-expect-error TS(2339) FIXME: Property 'gen_finished' does not exist on type '{}... Remove this comment to see the full error message
        newMessage.gen_finished = generationFinished;

        if (power_user.message_token_count_enabled) {
            // @ts-expect-error TS(2339) FIXME: Property 'mes' does not exist on type '{}'.
            const tokenCountText = (reasoning || '') + newMessage.mes;
            // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type '{}'.
            newMessage.extra.token_count = await getTokenCountAsync(tokenCountText, 0);
        }

        if (selected_group) {
            console.debug('entering chat update for groups');
            let avatarImg = 'img/ai4.png';
            if (characters[this_chid].avatar != 'none') {
                avatarImg = getThumbnailUrl('avatar', characters[this_chid].avatar);
            }
            // @ts-expect-error TS(2339) FIXME: Property 'force_avatar' does not exist on type '{}... Remove this comment to see the full error message
            newMessage.force_avatar = avatarImg;
            // @ts-expect-error TS(2339) FIXME: Property 'original_avatar' does not exist on type ... Remove this comment to see the full error message
            newMessage.original_avatar = characters[this_chid].avatar;
            // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type '{}'.
            newMessage.extra.gen_id = group_generation_id;
        }

        await processImageAttachment(newMessage, { imageUrls });
        const chat_id = (chat.length - 1);

        if (!fromStreaming) await eventSource.emit(event_types.MESSAGE_RECEIVED, chat_id, type);
        addOneMessage(chat[chat_id]);
        if (!fromStreaming) await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, chat_id, type);
    }

    const item = chat[chat.length - 1];
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    if (item.swipe_info === undefined) {
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        item.swipe_info = [];
    }
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    if (item.swipe_id !== undefined) {
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        const swipeId = item.swipe_id;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        item.swipes[swipeId] = item.mes;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        item.swipe_info[swipeId] = {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            send_date: item.send_date,
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            gen_started: item.gen_started,
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            gen_finished: item.gen_finished,
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            extra: structuredClone(item.extra),
        };
    } else {
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        item.swipe_id = 0;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        item.swipes = [];
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        item.swipes[0] = item.mes;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        item.swipe_info[0] = {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            send_date: item.send_date,
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            gen_started: item.gen_started,
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            gen_finished: item.gen_finished,
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            extra: structuredClone(item.extra),
        };
    }

    if (Array.isArray(swipes) && swipes.length > 0) {
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        const swipeInfoExtra = structuredClone(item.extra ?? {});
        delete swipeInfoExtra.token_count;
        delete swipeInfoExtra.reasoning;
        delete swipeInfoExtra.reasoning_duration;
        const swipeInfo = {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            send_date: item.send_date,
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            gen_started: item.gen_started,
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            gen_finished: item.gen_finished,
            extra: swipeInfoExtra,
        };
        // @ts-expect-error TS(2554) FIXME: Expected 1-3 arguments, but got 0.
        const swipeInfoArray = Array(swipes.length).fill().map(() => structuredClone(swipeInfo));
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        parseReasoningInSwipes(swipes, swipeInfoArray, item.extra?.reasoning_duration);
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        item.swipes.push(...swipes);
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        item.swipe_info.push(...swipeInfoArray);
    }

    statMesProcess(item, type, characters, this_chid, oldMessage);
    return { type, getMessage };
}

/**
 * Creates a message's `swipes`, `swipe_id` and `swipe_info` if necessary.
 * @param {ChatMessage} message
 * @returns {boolean} true if the message was updated.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'message' implicitly has an 'any' type.
export function ensureSwipes(message) {
    let updated = false;

    if (!message || typeof message !== 'object') {
        console.trace(`[ensureSwipes] failed. '${message}' is not an object.`);
        return updated;
    }

    //Small system messages and user messages should not have swipes.
    if (message?.is_user || message?.extra?.isSmallSys) {
        return updated;
    }

    if (!Array.isArray(message.swipes)) {
        message.swipes = [message.mes ?? ''];
        updated = true;
    }

    if (typeof message.swipe_id !== 'number') {
        message.swipe_id = 0;
        updated = true;
    }

    /** @type {() => SwipeInfo} */
    const createSwipeInfo = () => ({
        send_date: message.send_date,
        gen_started: message.gen_started,
        gen_finished: message.gen_finished,
        extra: {},
    });

    if (!Array.isArray(message.swipe_info)) {
        // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
        message.swipe_info = message.swipes.map(_ => createSwipeInfo());
        updated = true;
    }

    for (let i = 0; i < message.swipes.length; i++) {
        if (typeof message.swipes[i] !== 'string') {
            updated = true;
            console.warn('The message had a swipe that is not a string. It has has been set to \'\'.', message);
            message.swipes[i] = '';
        }
        if (!message.swipe_info[i] || typeof message.swipe_info[i] !== 'object') {
            updated = true;
            console.warn('The message had missing or invalid swipe_info for a swipe. It has been backfilled.', message);
            message.swipe_info[i] = createSwipeInfo();
        }
    }

    return updated;
}

/**
 * Syncs the current message and all its data into the swipe data at the given message ID (or the last message if no ID is given).
 *
 * If the swipe data is invalid in some way, this function will exit out without doing anything.
 * @param {number?} [messageId] - The ID of the message to sync with the swipe data. If no ID is given, the last message is used.
 * @returns {boolean} Whether the message was successfully synced
 */
export function syncMesToSwipe(messageId = null) {
    if (!chat.length) {
        return false;
    }

    const targetMessageId = messageId ?? chat.length - 1;
    if (targetMessageId >= chat.length || targetMessageId < 0) {
        console.warn(`[syncMesToSwipe] Invalid message ID: ${messageId}`);
        return false;
    }

    const targetMessage = chat[targetMessageId];
    if (!targetMessage) {
        return false;
    }

    // No swipe data there yet, exit out
    // @ts-expect-error TS(2339) FIXME: Property 'swipe_id' does not exist on type 'never'... Remove this comment to see the full error message
    if (typeof targetMessage.swipe_id !== 'number') {
        return false;
    }
    // If swipes structure is invalid, exit out (for now?)
    // @ts-expect-error TS(2339) FIXME: Property 'swipe_info' does not exist on type 'neve... Remove this comment to see the full error message
    if (!Array.isArray(targetMessage.swipe_info) || !Array.isArray(targetMessage.swipes)) {
        return false;
    }
    // If the swipe is not present yet, exit out (will likely be copied later)
    // "" is falsy. An empty string is a valid message.
    // @ts-expect-error TS(2339) FIXME: Property 'swipes' does not exist on type 'never'.
    if (typeof targetMessage.swipes[targetMessage.swipe_id] !== 'string' || !targetMessage.swipe_info[targetMessage.swipe_id]) {
        return false;
    }

    // @ts-expect-error TS(2339) FIXME: Property 'swipe_info' does not exist on type 'neve... Remove this comment to see the full error message
    const targetSwipeInfo = targetMessage.swipe_info[targetMessage.swipe_id];
    if (typeof targetSwipeInfo !== 'object') {
        return false;
    }

    // Only sync swipes if the chat is not pristine, so that macros in the greeting can resolve again on swipe
    if (chat_metadata.tainted || chat.length > 1) {
        // @ts-expect-error TS(2339) FIXME: Property 'swipes' does not exist on type 'never'.
        targetMessage.swipes[targetMessage.swipe_id] = targetMessage.mes;
    }

    // @ts-expect-error TS(2339) FIXME: Property 'send_date' does not exist on type 'never... Remove this comment to see the full error message
    targetSwipeInfo.send_date = targetMessage.send_date;
    // @ts-expect-error TS(2339) FIXME: Property 'gen_started' does not exist on type 'nev... Remove this comment to see the full error message
    targetSwipeInfo.gen_started = targetMessage.gen_started;
    // @ts-expect-error TS(2339) FIXME: Property 'gen_finished' does not exist on type 'ne... Remove this comment to see the full error message
    targetSwipeInfo.gen_finished = targetMessage.gen_finished;
    // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
    targetSwipeInfo.extra = structuredClone(targetMessage.extra);

    return true;
}

/**
 * Syncs swipe data back to the message data at the given message ID (or the last message if no ID is given).
 * If the swipe ID is not provided, the current swipe ID in the message object is used.
 *
 * If the swipe data is invalid in some way, this function will exit out without doing anything.
 * @param {number?} [messageId] - The ID of the message to sync with the swipe data. If no ID is given, the last message is used.
 * @param {number?} [swipeId] - The ID of the swipe to sync. If no ID is given, the current swipe ID in the message object is used.
 * @param {ChatMessage?} [targetMessage] - The message object to sync instead of resolving one from `chat`.
 * @returns {boolean} Whether the swipe data was successfully synced to the message
 */
export function syncSwipeToMes(messageId = null, swipeId = null, targetMessage = null) {
    if (!targetMessage && !chat.length) {
        return false;
    }

    if (!targetMessage) {
        const targetMessageId = messageId ?? chat.length - 1;
        if (targetMessageId >= chat.length || targetMessageId < 0) {
            console.warn(`[syncSwipeToMes] Invalid message ID: ${messageId}`);
            return false;
        }

        // @ts-expect-error TS(2322) FIXME: Type 'undefined' is not assignable to type 'null'.
        targetMessage = chat[targetMessageId];
    }

    if (!targetMessage) {
        return false;
    }

    if (swipeId !== null) {
        if (isNaN(swipeId) || swipeId < 0) {
            console.warn(`[syncSwipeToMes] Invalid swipe ID: ${swipeId}`);
            return false;
        }
        // @ts-expect-error TS(2339) FIXME: Property 'swipe_id' does not exist on type 'never'... Remove this comment to see the full error message
        targetMessage.swipe_id = swipeId;
    }

    // No swipe data there yet, exit out
    // @ts-expect-error TS(2339) FIXME: Property 'swipe_id' does not exist on type 'never'... Remove this comment to see the full error message
    if (typeof targetMessage.swipe_id !== 'number') {
        return false;
    }
    // If swipes structure is invalid, exit out
    // @ts-expect-error TS(2339) FIXME: Property 'swipes' does not exist on type 'never'.
    if (!Array.isArray(targetMessage.swipes)) {
        return false;
    }

    // Backfill swipe_info if missing.
    // @ts-expect-error TS(2339) FIXME: Property 'swipe_info' does not exist on type 'neve... Remove this comment to see the full error message
    if (!Array.isArray(targetMessage.swipe_info)) {
        // @ts-expect-error TS(2339) FIXME: Property 'swipe_info' does not exist on type 'neve... Remove this comment to see the full error message
        targetMessage.swipe_info = targetMessage.swipes.map(_ => ({
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            send_date: targetMessage.send_date,
            gen_started: void 0,
            gen_finished: void 0,
            extra: {},
        }));
    }

    // @ts-expect-error TS(2339) FIXME: Property 'swipe_id' does not exist on type 'never'... Remove this comment to see the full error message
    const targetSwipeId = targetMessage.swipe_id;
    // @ts-expect-error TS(2339) FIXME: Property 'swipes' does not exist on type 'never'.
    if (typeof targetMessage.swipes[targetSwipeId] !== 'string') {
        console.warn(`[syncSwipeToMes] Invalid swipe ID: ${targetSwipeId}`);
        return false;
    }

    // @ts-expect-error TS(2339) FIXME: Property 'swipe_info' does not exist on type 'neve... Remove this comment to see the full error message
    const targetSwipeInfo = targetMessage?.swipe_info?.[targetSwipeId];
    if (typeof targetSwipeInfo !== 'object') {
        console.warn(`[syncSwipeToMes] Invalid swipe info: ${targetSwipeId}`);
    }

    // @ts-expect-error TS(2339) FIXME: Property 'mes' does not exist on type 'never'.
    targetMessage.mes = targetMessage.swipes[targetSwipeId];
    // @ts-expect-error TS(2339) FIXME: Property 'send_date' does not exist on type 'never... Remove this comment to see the full error message
    targetMessage.send_date = targetSwipeInfo?.send_date;
    // @ts-expect-error TS(2339) FIXME: Property 'gen_started' does not exist on type 'nev... Remove this comment to see the full error message
    targetMessage.gen_started = targetSwipeInfo?.gen_started;
    // @ts-expect-error TS(2339) FIXME: Property 'gen_finished' does not exist on type 'ne... Remove this comment to see the full error message
    targetMessage.gen_finished = targetSwipeInfo?.gen_finished;
    // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
    targetMessage.extra = structuredClone(targetSwipeInfo?.extra) ?? {};

    return true;
}

/**
 * Saves the image to the message object.
 * @param {ParsedImage} img Image object
 * @param {ChatMessage} mes Chat message object
 * @typedef {{ image?: string, title?: string, inline?: boolean }} ParsedImage
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'img' implicitly has an 'any' type.
function saveImageToMessage(img, mes) {
    if (mes && img.image) {
        if (!mes.extra || typeof mes.extra !== 'object') {
            mes.extra = {};
        }
        if (!Array.isArray(mes.extra.media)) {
            mes.extra.media = [];
        }
        mes.extra.media.push({ url: img.image, type: MEDIA_TYPE.IMAGE, title: img.title, source: MEDIA_SOURCE.API });
        mes.extra.inline_image = img.inline;
    }
}

/**
 *
 */
export function getGeneratingApi() {
    switch (main_api) {
        case 'openai':
            return oai_settings.chat_completion_source || 'openai';
        case 'textgenerationwebui':
            return textgen_settings.type === textgen_types.OOBA ? 'textgenerationwebui' : textgen_settings.type;
        default:
            return main_api;
    }
}

/**
 *
 * @param mes
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'mes' implicitly has an 'any' type.
export function getGeneratingModel(mes) {
    let model = '';
    switch (main_api) {
        case 'kobold':
            model = online_status;
            break;
        case 'novel':
            model = nai_settings.model_novel;
            break;
        case 'openai':
            model = getChatCompletionModel();
            break;
        case 'textgenerationwebui':
            model = online_status;
            break;
        case 'koboldhorde':
            model = kobold_horde_model;
            break;
    }
    return model;
}

/**
 * A function mainly used to switch 'generating' state - setting it to false and activating the buttons again
 */
export function activateSendButtons() {
    is_send_press = false;
    hideStopButton();
    showSwipeButtons();
    delete document.body.dataset.generating;
}

/**
 * A function mainly used to switch 'generating' state - setting it to true and deactivating the buttons
 */
export function deactivateSendButtons() {
    showStopButton();
    hideSwipeButtons();
    document.body.dataset.generating = 'true';
}

/**
 *
 */
export function resetChatState() {
    // replaces deleted charcter name with system user since it will be displayed next.
    name2 = (this_chid === undefined && neutralCharacterName) ? neutralCharacterName : systemUserName;
    //unsets expected chid before reloading (related to getCharacters/printCharacters from using old arrays)
    setCharacterId(undefined);
    // sets up system user to tell user about having deleted a character
    chat.splice(0, chat.length, ...SAFETY_CHAT);
    // resets chat metadata
    chat_metadata = {};
    // resets the characters array, forcing getcharacters to reset
    characters.length = 0;
}

/**
 *
 * @param {'characters' | 'character_edit' | 'create' | 'group_edit' | 'group_create'} value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
export function setMenuType(value) {
    menu_type = value;
    // Allow custom CSS to see which menu type is active
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    document.getElementById('right-nav-panel').dataset.menuType = menu_type;
}

/**
 *
 * @param controller
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'controller' implicitly has an 'any' typ... Remove this comment to see the full error message
export function setExternalAbortController(controller) {
    abortController = controller;
}

/**
 * Sets a character array index.
 * @param {number|string|undefined} value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
export function setCharacterId(value) {
    switch (typeof value) {
        case 'bigint':
        case 'number':
            this_chid = String(value);
            break;
        case 'string':
            this_chid = !isNaN(parseInt(value)) ? value : undefined;
            break;
        case 'object':
            this_chid = characters.indexOf(value) !== -1 ? String(characters.indexOf(value)) : undefined;
            break;
        case 'undefined':
            this_chid = undefined;
            break;
        default:
            console.error('Invalid character ID type:', value);
            break;
    }
}

/**
 *
 * @param value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
export function setCharacterName(value) {
    name2 = value;
}

/**
 * Sets the API connection status of the application
 * @param {string|'no_connection'} value Connection status value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
export function setOnlineStatus(value) {
    const previousStatus = online_status;
    online_status = value;
    displayOnlineStatus();
    if (previousStatus !== online_status) {
        eventSource.emitAndWait(event_types.ONLINE_STATUS_CHANGED, online_status);
    }
}

/**
 *
 * @param value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
export function setEditedMessageId(value) {
    this_edit_mes_id = value;
}

/**
 *
 * @param value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
export function setSendButtonState(value) {
    is_send_press = value;
}

/**
 * Renames the currently selected character, updating relevant references and optionally renaming past chats.
 *
 * If no name is provided, a popup prompts for a new name. If the new name matches the current name,
 * the renaming process is aborted. The function sends a request to the server to rename the character
 * and handles updates to other related fields such as tags, lore, and author notes.
 *
 * If the renaming is successful, the character list is reloaded and the renamed character is selected.
 * Optionally, past chats can be renamed to reflect the new character name.
 * @param {string?} [name=null] - The new name for the character. If not provided, a popup will prompt for it.
 * @param {object} [options] - Additional options.
 * @param {boolean} [options.silent=false] - If true, suppresses popups and warnings.
 * @param {boolean?} [options.renameChats=null] - If true, renames past chats to reflect the new character name.
 * @returns {Promise<boolean>} - Returns true if the character was successfully renamed, false otherwise.
 */

/**
 *
 * @param name
 * @param root0
 * @param root0.silent
 * @param root0.renameChats
 */
export async function renameCharacter(name = null, { silent = false, renameChats = null } = {}) {
    if (!name && silent) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning(t`No character name provided.`, t`Rename Character`);
        return false;
    }
    if (this_chid === undefined) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning(t`No character selected.`, t`Rename Character`);
        return false;
    }

    const oldAvatar = characters[this_chid].avatar;
    const newValue = name || (await callGenericPopup('<h3>' + t`New name:` + '</h3>', POPUP_TYPE.INPUT, characters[this_chid].name));

    if (!newValue) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning(t`No character name provided.`, t`Rename Character`);
        return false;
    }
    if (newValue === characters[this_chid].name) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info(t`Same character name provided, so name did not change.`, t`Rename Character`);
        return false;
    }

    const body = JSON.stringify({ avatar_url: oldAvatar, new_name: newValue });
    const response = await fetch('/api/characters/rename', {
        method: 'POST',
        headers: getRequestHeaders(),
        body,
    });

    try {
        if (response.ok) {
            const data = await response.json();
            const newAvatar = data.avatar;

            const oldName = getCharaFilename(null, { manualAvatarKey: oldAvatar });
            const newName = getCharaFilename(null, { manualAvatarKey: newAvatar });

            // Replace other auxiliary fields where was referenced by avatar key
            // Tag List
            renameTagKey(oldAvatar, newAvatar);

            // Additional lore books
            // @ts-expect-error TS(2339) FIXME: Property 'charLore' does not exist on type '{}'.
            const charLore = world_info.charLore?.find(x => x.name == oldName);
            if (charLore) {
                charLore.name = newName;
                saveSettingsDebounced();
            }

            // Char-bound Author's Notes
            // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
            const charNote = extension_settings.note.chara?.find(x => x.name == oldName);
            if (charNote) {
                // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
                charNote.name = newName;
                saveSettingsDebounced();
            }

            // Update active character, if the current one was the currently active one
            if (active_character === oldAvatar) {
                active_character = newAvatar;
                saveSettingsDebounced();
            }

            await eventSource.emit(event_types.CHARACTER_RENAMED, oldAvatar, newAvatar);

            // Unload current character
            setCharacterId(undefined);
            // Reload characters list
            await getCharacters();

            // Find newly renamed character
            const newChId = characters.findIndex(c => c.avatar == data.avatar);

            if (newChId !== -1) {
                // Select the character after the renaming
                await selectCharacterById(newChId);

                // Async delay to update UI
                await delay(1);

                if (this_chid === undefined) {
                    throw new Error('New character not selected');
                }

                // Also rename as a group member
                await renameGroupMember(oldAvatar, newAvatar, newValue.toString());
                const renamePastChatsConfirm = renameChats !== null
                    ? renameChats
                    : silent
                        ? false
                        : (await Popup.show.confirm(
                            t`Character renamed!`,
                            `<p>${t`Past chats will still contain the old character name. Would you like to update the character name in previous chats as well?`}</p>
                            <i><b>${t`Sprites folder (if any) should be renamed manually.`}</b></i>`,
                        )) == POPUP_RESULT.AFFIRMATIVE;

                if (renamePastChatsConfirm) {
                    await renamePastChats(oldAvatar, newAvatar, newValue);
                    await reloadCurrentChat();
                    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                    toastr.success(t`Character renamed and past chats updated!`, t`Rename Character`);
                } else {
                    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                    toastr.success(t`Character renamed!`, t`Rename Character`);
                }
            } else {
                throw new Error('Newly renamed character was lost?');
            }
        } else {
            throw new Error('Could not rename the character');
        }
    } catch (error) {
        // Reloading to prevent data corruption
        if (!silent) await Popup.show.text(t`Rename Character`, t`Something went wrong. The page will be reloaded.`);
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        else toastr.error(t`Something went wrong. The page will be reloaded.`, t`Rename Character`);

        console.log('Renaming character error:', error);
        location.reload();
        return false;
    }

    return true;
}

/**
 *
 * @param oldAvatar
 * @param newAvatar
 * @param newName
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'oldAvatar' implicitly has an 'any' type... Remove this comment to see the full error message
async function renamePastChats(oldAvatar, newAvatar, newName) {
    const pastChats = await getPastCharacterChats();

    // @ts-expect-error TS(2339) FIXME: Property 'file_name' does not exist on type 'unkno... Remove this comment to see the full error message
    for (const { file_name } of pastChats) {
        try {
            const fileNameWithoutExtension = file_name.replace('.jsonl', '');
            const getChatResponse = await fetch('/api/chats/get', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({
                    ch_name: newName,
                    file_name: fileNameWithoutExtension,
                    avatar_url: newAvatar,
                }),
                cache: 'no-cache',
            });

            if (getChatResponse.ok) {
                const currentChat = await getChatResponse.json();

                for (const message of currentChat) {
                    if (message.is_user || message.is_system || message.extra?.type == system_message_types.NARRATOR) {
                        continue;
                    }

                    if (message.name !== undefined) {
                        message.name = newName;
                    }
                }

                await eventSource.emit(event_types.CHARACTER_RENAMED_IN_PAST_CHAT, currentChat, oldAvatar, newAvatar);

                const saveChatRequest = await compressRequest({
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({
                        ch_name: newName,
                        file_name: fileNameWithoutExtension,
                        chat: currentChat,
                        avatar_url: newAvatar,
                    }),
                    cache: 'no-cache',
                });
                const saveChatResponse = await fetch('/api/chats/save', saveChatRequest);

                if (!saveChatResponse.ok) {
                    throw new Error('Could not save chat');
                }
            }
        } catch (error) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(t`Past chat could not be updated: ${file_name}`);
            console.error(error);
        }
    }
}

/**
 *
 */
export function saveChatDebounced() {
    const chid = this_chid;
    const selectedGroup = selected_group;

    cancelDebouncedChatSave();

    chatSaveTimeout = setTimeout(async () => {
        if (selectedGroup !== selected_group) {
            console.warn('Chat save timeout triggered, but group changed. Aborting.');
            return;
        }

        if (chid !== this_chid) {
            console.warn('Chat save timeout triggered, but chid changed. Aborting.');
            return;
        }

        console.debug('Chat save timeout triggered');
        await saveChatConditional();
        console.debug('Chat saved');
    }, DEFAULT_SAVE_EDIT_TIMEOUT);
}

/**
 * Saves the chat to the server.
 * @param {object} [options] - Additional options.
 * @param {string} [options.chatName] The name of the chat file to save to
 * @param {object} [options.withMetadata] Additional metadata to save with the chat
 * @param {number} [options.mesId] The message ID to save the chat up to
 * @param {boolean} [options.force] Force the saving despite the integrity check result
 * @param {ChatMessage[]} [options.chatData] Chat snapshot to save instead of the current in-memory chat
 * @param {...any} args
 * @returns {Promise<void>}
 */
export async function saveChat({
    chatName,
    withMetadata,
    mesId,
    force = false,
    chatData = undefined
}: Record<string, unknown> = {}, ...args: unknown[]) {
    if (selected_group) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`Operation was aborted to prevent data corruption.`, t`saveChat called for a group chat`);
        throw new Error('saveChat called for a group chat');
    }

    if (args.length > 0 && typeof args[0] !== 'object') {
        console.trace('saveChat called with positional arguments. Please use an object instead.');
        [chatName, withMetadata, mesId, force] = args;
    }

    const metadata = { ...chat_metadata, ...(withMetadata || {}) };
    const fileName = chatName ?? characters[this_chid]?.chat;

    if (!fileName && name2 === neutralCharacterName) {
        // TODO: Do something for a temporary chat with no character.
        return;
    }

    if (!fileName) {
        console.warn('saveChat called without chat_name and no chat file found');
        return;
    }

    characters[this_chid].date_last_chat = Date.now();

    const trimmedChat = Array.isArray(chatData)
        ? chatData
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        : (mesId !== undefined && mesId >= 0 && mesId < chat.length)
            ? chat.slice(0, Number(mesId) + 1)
            : chat.slice();

    /** @type {ChatHeader} */
    const chatHeader = {
        chat_metadata: metadata,
        user_name: 'unused',
        character_name: 'unused',
    };

    try {
        const saveChatRequest = await compressRequest({
            method: 'POST',
            cache: 'no-cache',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                ch_name: characters[this_chid].name,
                file_name: fileName,
                chat: [chatHeader, ...trimmedChat],
                avatar_url: characters[this_chid].avatar,
                force: force,
            }),
        });
        const result = await fetch('/api/chats/save', saveChatRequest);

        if (result.ok) {
            return;
        }

        const errorData = await result.json();
        const isIntegrityError = errorData?.error === 'integrity' && !force;
        if (!isIntegrityError) {
            throw new Error(result.statusText);
        }

        const popupResult = await Popup.show.input(
            t`ERROR: Chat integrity check failed while saving the file.`,
            t`<p>After you click OK, the page will be reloaded to prevent data corruption.</p>
              <p>To confirm an overwrite (and potentially <b>LOSE YOUR DATA</b>), enter <code>OVERWRITE</code> (in all caps) in the box below before clicking OK.</p>`,
            '',
            { okButton: 'OK', cancelButton: false },
        );

        const forceSaveConfirmed = popupResult === 'OVERWRITE';

        if (!forceSaveConfirmed) {
            console.warn('Chat integrity check failed, and user did not confirm the overwrite. Reloading the page.');
            window.location.reload();
            return;
        }

        await saveChat({ chatName, withMetadata, mesId, force: true });
    } catch (error) {
        console.error(error);
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`Check the server connection and reload the page to prevent data loss.`, t`Chat could not be saved`);
    }
}

/**
 * Processes the avatar image from the input element, allowing the user to crop it if necessary.
 * @param {HTMLInputElement} input - The input element containing the avatar file.
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'input' implicitly has an 'any' type.
async function read_avatar_load(input) {
    if (input.files && input.files[0]) {
        if (selected_button == 'create') {
            create_save.avatar = input.files;
        }

        crop_data = undefined;
        const file = input.files[0];
        const fileData = await getBase64Async(file);

        if (!power_user.never_resize_avatars) {
            // @ts-expect-error TS(2322) FIXME: Type 'unknown' is not assignable to type 'null | u... Remove this comment to see the full error message
            const dlg = new Popup('Set the crop position of the avatar image', POPUP_TYPE.CROP, '', { cropImage: fileData });
            const croppedImage = await dlg.show();

            if (!croppedImage) {
                return;
            }

            crop_data = dlg.cropData;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#avatar_load_preview').attr('src', String(croppedImage));
        } else {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#avatar_load_preview').attr('src', fileData);
        }

        if (menu_type == 'create') {
            return;
        }

        // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
        await createOrEditCharacter();

        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const formData = new FormData(/** @type {HTMLFormElement} */($('#form_create').get(0)));
        const avatarKey = formData.get('avatar_url')?.toString() ?? '';

        // Bust cache for the avatar thumbnail and character image
        const thumbnailUrl = getThumbnailUrl('avatar', avatarKey);
        await fetch(thumbnailUrl, { method: 'GET', cache: 'reload' });
        await fetch(`/characters/${avatarKey}`, { method: 'GET', cache: 'reload' });

        // Refresh all visible avatar images that use this thumbnail URL
        // This handles messages, character list, and any other place using the thumbnail
        const avatarImages = document.querySelectorAll(`img[src^="${thumbnailUrl}"]`);
        for (const img of avatarImages) {
            if (img instanceof HTMLImageElement) {
                const originalSrc = img.src;
                img.src = '';
                img.src = originalSrc;
            }
        }
        console.debug(`Refreshed ${avatarImages.length} avatar images for ${avatarKey}`);

        console.log('Avatar refreshed');
    }
}

/**
 * Gets the URL for a thumbnail of a specific type and file.
 * @param {import('../src/endpoints/thumbnails.js').ThumbnailType} type The type of the thumbnail to get
 * @param {string} file The file name or path for which to get the thumbnail URL
 * @param {boolean} [t] Whether to add a cache-busting timestamp to the URL
 * @returns {string} The URL for the thumbnail
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
export function getThumbnailUrl(type, file, t = false) {
    return `/thumbnail?type=${type}&file=${encodeURIComponent(file)}${t ? `&t=${Date.now()}` : ''}`;
}

/**
 *
 * @param block
 * @param entities
 * @param root0
 * @param root0.templateId
 * @param root0.empty
 * @param root0.interactable
 * @param root0.highlightFavs
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'block' implicitly has an 'any' type.
export function buildAvatarList(block, entities, { templateId = 'inline_avatar_template', empty = true, interactable = false, highlightFavs = true } = {}) {
    if (empty) {
        block[0].innerHTML = '';
    }

    for (const entity of entities) {
        const id = entity.id;

        // Populate the template
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const avatarTemplate = $(document.querySelector(`#${templateId} .avatar`).cloneNode(true));

        let this_avatar = default_avatar;
        if (entity.item.avatar !== undefined && entity.item.avatar != 'none') {
            this_avatar = getThumbnailUrl('avatar', entity.item.avatar);
        }

        avatarTemplate.attr('data-type', entity.type);
        avatarTemplate.attr('data-chid', id);
        avatarTemplate.find('img').attr('src', this_avatar).attr('alt', entity.item.name);
        avatarTemplate.attr('title', `[Character] ${entity.item.name}\nFile: ${entity.item.avatar}`);
        if (highlightFavs) {
            avatarTemplate.toggleClass('is_fav', entity.item.fav || entity.item.fav == 'true');
            avatarTemplate.find('.ch_fav').val(entity.item.fav);
        }

        // If this is a group, we need to hack slightly. We still want to keep most of the css classes and layout, but use a group avatar instead.
        if (entity.type === 'group') {
            const grpTemplate = getGroupAvatar(entity.item);

            // @ts-expect-error TS(2339) FIXME: Property 'attr' does not exist on type 'Node'.
            avatarTemplate.addClass(grpTemplate.attr('class'));
            avatarTemplate[0].innerHTML = '';
            // @ts-expect-error TS(2339) FIXME: Property 'children' does not exist on type 'Node'.
            avatarTemplate[0].append(...grpTemplate.children().toArray());
            avatarTemplate.attr({ 'data-grid': id, 'data-chid': null });
            avatarTemplate.attr('title', `[Group] ${entity.item.name}`);
        } else if (entity.type === 'persona') {
            avatarTemplate.attr({ 'data-pid': id, 'data-chid': null });
            avatarTemplate.find('img').attr('src', getThumbnailUrl('persona', entity.item.avatar));
            avatarTemplate.attr('title', `[Persona] ${entity.item.name}\nFile: ${entity.item.avatar}`);
        }

        if (interactable) {
            avatarTemplate.addClass(INTERACTABLE_CONTROL_CLASS);
            avatarTemplate.toggleClass('character_select', entity.type === 'character');
            avatarTemplate.toggleClass('group_select', entity.type === 'group');
        }

        block[0].append(avatarTemplate[0]);
    }
}

/**
 * Loads all the data of a shallow character.
 * @param {string|undefined} characterId Array index
 * @returns {Promise<void>} Promise that resolves when the character is unshallowed
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'characterId' implicitly has an 'any' ty... Remove this comment to see the full error message
export async function unshallowCharacter(characterId) {
    if (characterId === undefined) {
        console.debug('Undefined character cannot be unshallowed');
        return;
    }

    /** @type {Character} */
    const character = characters[characterId];
    if (!character) {
        console.debug('Character not found:', characterId);
        return;
    }

    // Character is not shallow
    if (!character.shallow) {
        return;
    }

    const avatar = character.avatar;
    if (!avatar) {
        console.debug('Character has no avatar field:', characterId);
        return;
    }

    await getOneCharacter(avatar);
}

/**
 *
 */
export async function getChat() {
    try {
        await unshallowCharacter(this_chid);

        const response = await fetch('/api/chats/get', {
            method: 'POST',
            headers: getRequestHeaders(),
            cache: 'no-cache',
            body: JSON.stringify({
                ch_name: characters[this_chid].name,
                file_name: characters[this_chid].chat,
                avatar_url: characters[this_chid].avatar,
            }),
        });

        if (!response.ok) {
            throw new Error('Chat could not be loaded');
        }

        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
            /** @type {ChatHeader} */
            const chatHeader = data.shift();
            chat_metadata = chatHeader?.chat_metadata ?? {};
            // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
            chat.splice(0, chat.length, ...data);
            chat.forEach(ensureMessageMediaIsArray);
        } else {
            // An empty/corrupted chat file
            chat.splice(0, chat.length);
            chat_metadata = {};
        }
        if (!chat_metadata.integrity) {
            chat_metadata.integrity = uuidv4();
        }
        await getChatResult();
        eventSource.emit(event_types.CHAT_LOADED, { detail: { id: this_chid, character: characters[this_chid] } });

        // Focus on the textarea if not already focused on a visible text input
        delay(debounce_timeout.short).then(() => {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            if ($(document.activeElement).is('input:visible, textarea:visible')) {
                return;
            }
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#send_textarea').trigger('click').trigger('focus');
        });
    } catch (error) {
        await getChatResult();
        console.log(error);
    }
}

/**
 *
 */
async function getChatResult() {
    name2 = characters[this_chid].name;
    let freshChat = false;
    if (chat.length === 0) {
        const message = getFirstMessage();
        if (message.mes) {
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ name: string; is_user: boolean... Remove this comment to see the full error message
            chat.push(message);
            freshChat = true;
        }
        // Make sure the chat appears on the server
        await saveChatConditional();
    }
    await loadItemizedPrompts(getCurrentChatId());
    await printMessages();
    select_selected_character(this_chid);

    await eventSource.emit(event_types.CHAT_CHANGED, (getCurrentChatId()));
    if (freshChat) await eventSource.emit(event_types.CHAT_CREATED);

    if (chat.length === 1) {
        const chat_id = (chat.length - 1);
        await eventSource.emit(event_types.MESSAGE_RECEIVED, chat_id, 'first_message');
        await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, chat_id, 'first_message');
    }
}

/**
 *
 */
function getFirstMessage() {
    const firstMes = characters[this_chid]?.first_mes || '';
    const alternateGreetings = characters[this_chid]?.data?.alternate_greetings;

    const message = {
        name: name2,
        is_user: false,
        is_system: false,
        send_date: getMessageTimeStamp(),
        mes: getRegexedString(firstMes, regex_placement.AI_OUTPUT),
        extra: {},
    };

    if (Array.isArray(alternateGreetings) && alternateGreetings.length > 0) {
        const swipes = [message.mes, ...(alternateGreetings.map(greeting => getRegexedString(greeting, regex_placement.AI_OUTPUT)))];

        if (!message.mes) {
            swipes.shift();
            // @ts-expect-error TS(2322) FIXME: Type 'string | undefined' is not assignable to typ... Remove this comment to see the full error message
            message.mes = swipes[0];
        }

        // @ts-expect-error TS(2339) FIXME: Property 'swipe_id' does not exist on type '{ name... Remove this comment to see the full error message
        message.swipe_id = 0;
        // @ts-expect-error TS(2339) FIXME: Property 'swipes' does not exist on type '{ name: ... Remove this comment to see the full error message
        message.swipes = swipes;
        // @ts-expect-error TS(2339) FIXME: Property 'swipe_info' does not exist on type '{ na... Remove this comment to see the full error message
        message.swipe_info = swipes.map(_ => ({
            send_date: message.send_date,
            gen_started: void 0,
            gen_finished: void 0,
            extra: {},
        }));
    }

    return message;
}

/**
 *
 * @param file_name
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'file_name' implicitly has an 'any' type... Remove this comment to see the full error message
export async function openCharacterChat(file_name) {
    await waitUntilCondition(() => !isChatSaving, debounce_timeout.extended, 10);
    await clearChat({ clearData: true });
    characters[this_chid].chat = file_name;
    chat_metadata = {};
    await getChat();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#selected_chat_pole').val(file_name);
    await createOrEditCharacter(new CustomEvent('newChat'));
}

////////// OPTIMZED MAIN API CHANGE FUNCTION ////////////

/**
 *
 * @param api
 */
export function changeMainAPI(api = null) {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const selectedVal = api ?? $('#main_api').val();
    //console.log(selectedVal);
    const apiElements = {
        'koboldhorde': {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiStreaming: $('#NULL_SELECTOR'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiSettings: $('#kobold_api-settings'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiConnector: $('#kobold_horde'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiPresets: $('#kobold_api-presets'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiRanges: $('#range_block'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            maxContextElem: $('#max_context_block'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            amountGenElem: $('#amount_gen_block'),
        },
        'kobold': {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiStreaming: $('#streaming_kobold_block'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiSettings: $('#kobold_api-settings'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiConnector: $('#kobold_api'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiPresets: $('#kobold_api-presets'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiRanges: $('#range_block'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            maxContextElem: $('#max_context_block'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            amountGenElem: $('#amount_gen_block'),
        },
        'textgenerationwebui': {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiStreaming: $('#streaming_textgenerationwebui_block'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiSettings: $('#textgenerationwebui_api-settings'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiConnector: $('#textgenerationwebui_api'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiPresets: $('#textgenerationwebui_api-presets'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiRanges: $('#range_block_textgenerationwebui'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            maxContextElem: $('#max_context_block'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            amountGenElem: $('#amount_gen_block'),
        },
        'novel': {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiStreaming: $('#streaming_novel_block'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiSettings: $('#novel_api-settings'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiConnector: $('#novel_api'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiPresets: $('#novel_api-presets'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiRanges: $('#range_block_novel'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            maxContextElem: $('#max_context_block'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            amountGenElem: $('#amount_gen_block'),
        },
        'openai': {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiStreaming: $('#NULL_SELECTOR'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiSettings: $('#openai_settings'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiConnector: $('#openai_api'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiPresets: $('#openai_api-presets'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            apiRanges: $('#range_block_openai'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            maxContextElem: $('#max_context_block'),
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            amountGenElem: $('#amount_gen_block'),
        },
    };
    //console.log('--- apiElements--- ');
    //console.log(apiElements);

    //first, disable everything so the old elements stop showing
    for (const apiName in apiElements) {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        const apiObj = apiElements[apiName];
        //do not hide items to then proceed to immediately show them.
        if (selectedVal === apiName) {
            continue;
        }
        apiObj.apiSettings.css('display', 'none');
        apiObj.apiConnector.css('display', 'none');
        apiObj.apiRanges.css('display', 'none');
        apiObj.apiPresets.css('display', 'none');
        apiObj.apiStreaming.css('display', 'none');
    }

    //then, find and enable the active item.
    //This is split out of the loop so that different apis can share settings divs
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    const activeItem = apiElements[selectedVal];

    activeItem.apiStreaming.css('display', 'block');
    activeItem.apiSettings.css('display', 'block');
    activeItem.apiConnector.css('display', 'block');
    activeItem.apiRanges.css('display', 'block');
    activeItem.apiPresets.css('display', 'block');

    if (selectedVal === 'openai') {
        activeItem.apiPresets.css('display', 'flex');
    }

    if (selectedVal === 'textgenerationwebui' || selectedVal === 'novel') {
        console.debug('enabling amount_gen for ooba/novel');
        activeItem.amountGenElem.find('input').prop('disabled', false);
        activeItem.amountGenElem.css('opacity', 1.0);
    }

    //custom because streaming has been moved up under response tokens, which exists inside common settings block
    if (selectedVal === 'novel') {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#ai_module_block_novel').css('display', 'block');
    } else {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#ai_module_block_novel').css('display', 'none');
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#prompt_cost_block').toggle(selectedVal === 'textgenerationwebui' && textgen_settings.type === textgen_types.OPENROUTER);

    // Hide common settings for OpenAI
    console.debug('value?', selectedVal);
    if (selectedVal == 'openai') {
        console.debug('hiding settings?');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#common-gen-settings-block').css('display', 'none');
    } else {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#common-gen-settings-block').css('display', 'block');
    }

    main_api = selectedVal;
    setOnlineStatus('no_connection');

    if (main_api == 'koboldhorde') {
        getStatusHorde();
        getHordeModels(true);
    }
    validateDisabledSamplers();
    setupChatCompletionPromptManager(oai_settings);
    forceCharacterEditorTokenize();
}

/**
 *
 * @param value
 * @param root0
 * @param root0.toastPersonaNameChange
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
export function setUserName(value, { toastPersonaNameChange = true } = {}) {
    name1 = value;
    if (name1 === undefined || name1 == '')
        name1 = default_user_name;
    console.log(`User name changed to ${name1}`);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#your_name').text(name1);
    if (toastPersonaNameChange && power_user.persona_show_notifications && !isPersonaPanelOpen()) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success(t`Your messages will now be sent as ${name1}`, t`Persona Changed`);
    }
    saveSettingsDebounced();
}

/**
 *
 * @param avatarId
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'avatarId' implicitly has an 'any' type.
async function doOnboarding(avatarId) {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const template = $('#onboarding_template .onboarding');
    // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
    let userName = await callGenericPopup(template, POPUP_TYPE.INPUT, currentUser?.name || name1, { wider: true, cancelButton: false });

    if (userName) {
        userName = String(userName).replace('\n', ' ');
        setUserName(userName);
        console.log(`Binding persona ${avatarId} to name ${userName}`);
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        power_user.personas[avatarId] = userName;
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        power_user.persona_descriptions[avatarId] = {
            description: '',
            position: persona_description_positions.IN_PROMPT,
        };
    }
}

/**
 *
 */
function reloadLoop() {
    const MAX_RELOADS = 5;
    let reloads = Number(sessionStorage.getItem('reloads') || 0);
    if (reloads < MAX_RELOADS) {
        reloads++;
        sessionStorage.setItem('reloads', String(reloads));
        window.location.reload();
    }
}

//MARK: getSettings()
///////////////////////////////////////////
/**
 *
 * @param initLoaderHandle
 */
export async function getSettings(initLoaderHandle = null) {
    const response = await fetch('/api/settings/get', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({}),
        cache: 'no-cache',
    });

    if (!response.ok) {
        reloadLoop();
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`Settings could not be loaded after multiple attempts. Please try again later.`);
        throw new Error('Error getting settings');
    }

    const data = await response.json();
    if (data.result != 'file not find' && data.settings) {
        settings = JSON.parse(data.settings);
        if (settings.username !== undefined && settings.username !== '') {
            name1 = settings.username;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#your_name').text(name1);
        }

        accountStorage.init(settings?.accountStorage);
        await setUserControls(data.enable_accounts);
        setRequestCompressionConfig(data.request_compression);

        // Allow subscribers to mutate settings
        await eventSource.emit(event_types.SETTINGS_LOADED_BEFORE, settings);

        //Load AI model config settings
        amount_gen = settings.amount_gen;
        if (settings.max_context !== undefined)
            max_context = parseInt(settings.max_context);

        swipes = settings.swipes !== undefined ? !!settings.swipes : true;  // enable swipes by default
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#swipes-checkbox').prop('checked', swipes); /// swipecode
        refreshSwipeButtons();

        // Kobold
        loadKoboldSettings(data, settings.kai_settings ?? settings, settings);

        // Novel
        loadNovelSettings(data, settings.nai_settings ?? settings);

        // TextGen
        await loadTextGenSettings(data, settings);

        // OpenAI
        loadOpenAISettings(data, settings.oai_settings ?? settings);

        // Horde
        loadHordeSettings(settings);

        // Load power user settings
        await loadPowerUserSettings(settings, data);

        // Apply theme toggles from power user settings
        applyPowerUserSettings();

        // Load character tags
        loadTagsSettings(settings);

        // Load background
        loadBackgroundSettings(settings);

        // Load proxy presets
        loadProxyPresets(settings);

        // Allow subscribers to mutate settings
        await eventSource.emit(event_types.SETTINGS_LOADED_AFTER, settings);

        // Set context size after loading power user (may override the max value)
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#max_context').val(max_context);
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#max_context_counter').val(max_context);

        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#amount_gen').val(amount_gen);
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#amount_gen_counter').val(amount_gen);

        //Load which API we are using
        if (settings.main_api == undefined) {
            settings.main_api = 'kobold';
        }

        if (settings.main_api == 'poe') {
            settings.main_api = 'openai';
        }

        main_api = settings.main_api;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#main_api').val(main_api);
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $(`#main_api option[value=${main_api}]`).attr('selected', 'true');
        changeMainAPI();

        //Load User's Name and Avatar
        initUserAvatar(settings.user_avatar);
        setPersonaDescription();

        //Load the active character and group
        active_character = settings.active_character;
        active_group = settings.active_group;

        setWorldInfoSettings(settings.world_info_settings ?? settings, data);

        selected_button = settings.selected_button;

        // TODO: Move me into firstLoadInit when experimental toggle is removed
        // power_user.experimental_macro_engine
        initMacros();

        if (data.enable_extensions) {
            const enableAutoUpdate = Boolean(data.enable_extensions_auto_update);
            const isVersionChanged = settings.currentVersion !== currentVersion;
            await loadExtensionSettings(settings, isVersionChanged, enableAutoUpdate);
            await eventSource.emit(event_types.EXTENSION_SETTINGS_LOADED);
        } else {
            Object.assign(extension_settings, (settings.extension_settings ?? {}));
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#third_party_extension_button').addClass('disabled');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#extensions_details').addClass('disabled');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#extensions_connect').addClass('disabled');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#extensions_notify_updates').attr('disabled', 'disabled');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#extensions_autoconnect').attr('disabled', 'disabled');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#extensions_url').attr('disabled', 'disabled');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#extensions_api_key').attr('disabled', 'disabled');
        }

        firstRun = !!settings.firstRun;

        if (firstRun) {
            // @ts-expect-error TS(2339) FIXME: Property 'hide' does not exist on type 'never'.
            await initLoaderHandle?.hide();
            await doOnboarding(user_avatar);
            firstRun = false;
        }
    }
    await validateDisabledSamplers();
    settingsReady = true;
    await eventSource.emit(event_types.SETTINGS_LOADED);
}

//MARK: saveSettings()
/**
 *
 * @param loopCounter
 */
export async function saveSettings(loopCounter = 0) {
    if (!settingsReady) {
        console.warn('Settings not ready, scheduling another save');
        saveSettingsDebounced();
        return;
    }

    const MAX_RETRIES = 3;
    if (TempResponseLength.isCustomized()) {
        if (loopCounter < MAX_RETRIES) {
            console.warn('Response length is currently being overridden, scheduling another save');
            saveSettingsDebounced(++loopCounter);
            return;
        }
        console.error('Response length is currently being overridden, but the save loop has reached the maximum number of retries');
        TempResponseLength.restore(null);
    }

    const payload = {
        firstRun: firstRun,
        accountStorage: accountStorage.getState(),
        currentVersion: currentVersion,
        username: name1,
        active_character: active_character,
        active_group: active_group,
        user_avatar: user_avatar,
        amount_gen: amount_gen,
        max_context: max_context,
        main_api: main_api,
        world_info_settings: getWorldInfoSettings(),
        textgenerationwebui_settings: textgen_settings,
        swipes: swipes,
        horde_settings: horde_settings,
        power_user: power_user,
        extension_settings: extension_settings,
        // @ts-expect-error TS(7005) FIXME: Variable 'tags' implicitly has an 'any[]' type.
        tags: tags,
        tag_map: tag_map,
        nai_settings: nai_settings,
        kai_settings: kai_settings,
        oai_settings: oai_settings,
        background: background_settings,
        proxies: proxies,
        selected_proxy: selected_proxy,
    };

    try {
        const saveSettingsRequest = await compressRequest({
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(payload),
            cache: 'no-cache',
        });
        const result = await fetch('/api/settings/save', saveSettingsRequest);

        if (!result.ok) {
            throw new Error(`Failed to save settings: ${result.statusText}`);
        }

        settings = payload;
        await eventSource.emit(event_types.SETTINGS_UPDATED);
    } catch (error) {
        console.error('Error saving settings:', error);
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`Check the server connection and reload the page to prevent data loss.`, t`Settings could not be saved`);
    }
}

/**
 * Sets the generation parameters from a preset object.
 * @param {{ genamt?: number, max_length?: number }} preset Preset object
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'preset' implicitly has an 'any' type.
export function setGenerationParamsFromPreset(preset) {
    const needsUnlock = (preset.max_length ?? max_context) > MAX_CONTEXT_DEFAULT || (preset.genamt ?? amount_gen) > MAX_RESPONSE_DEFAULT;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#max_context_unlocked').prop('checked', needsUnlock).trigger('change');

    if (preset.genamt !== undefined) {
        amount_gen = preset.genamt;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#amount_gen').val(amount_gen);
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#amount_gen_counter').val(amount_gen);
    }

    if (preset.max_length !== undefined) {
        max_context = preset.max_length;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#max_context').val(max_context);
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#max_context_counter').val(max_context);
    }
}

// Common code for message editor done and auto-save
/**
 *
 * @param div
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'div' implicitly has an 'any' type.
function updateMessage(div) {
    const mesBlock = div.closest('.mes_block');
    let text = mesBlock.find('.edit_textarea').val()
        ?? mesBlock.find('.mes_text').text();
    const mesElement = div.closest('.mes');
    const mes = chat[mesElement.attr('mesid')];

    // editing old messages
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    mes.extra ??= {};

    let regexPlacement;
    // @ts-expect-error TS(2339) FIXME: Property 'is_user' does not exist on type 'never'.
    if (mes?.is_user) {
        regexPlacement = regex_placement.USER_INPUT;
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    } else if (mes.extra?.type === 'narrator') {
        regexPlacement = regex_placement.SLASH_COMMAND;
    } else {
        regexPlacement = regex_placement.AI_OUTPUT;
    }

    // Ignore character override if sent as system
    text = getRegexedString(
        text,
        regexPlacement,
        {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            characterOverride: mes.extra?.type === 'narrator' ? undefined : mes.name,
            isEdit: true,
        },
    );


    if (power_user.trim_spaces) {
        text = text.trim();
    }

    const bias = substituteParams(extractMessageBias(text));
    text = substituteParams(text);
    if (bias) {
        text = removeMacros(text);
    }
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    mes.mes = text;
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    if (mes.swipe_id !== undefined) {
        ensureSwipes(mes);
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        mes.swipes[mes.swipe_id] = text;
    }

    // @ts-expect-error TS(2339) FIXME: Property 'is_system' does not exist on type 'never... Remove this comment to see the full error message
    if (mes?.is_system || mes?.is_user || mes.extra?.type === system_message_types.NARRATOR) {
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        mes.extra.bias = bias ?? null;
    } else {
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        mes.extra.bias = null;
    }

    chat_metadata.tainted = true;

    return { mesBlock, text, mes, bias };
}

/**
 *
 * @param fromSlashCommand
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'fromSlashCommand' implicitly has an 'an... Remove this comment to see the full error message
function openMessageDelete(fromSlashCommand) {
    closeMessageEditor();
    hideSwipeButtons();
    if (fromSlashCommand || (!is_send_press) || (selected_group && !is_group_generating)) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#dialogue_del_mes').css('display', 'block');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#send_form').css('display', 'none');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('.del_checkbox').each(function () {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(this).css('display', 'grid');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(this).parent().children('.for_checkbox').css('display', 'none');
        });
    } else {
        console.debug(`
            ERR -- could not enter del mode
            this_chid: ${this_chid}
            is_send_press: ${is_send_press}
            // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
            // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
            // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
            // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
            // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
            selected_group: ${selected_group as string | null}
            is_group_generating: ${is_group_generating}`);
    }
    this_del_mes = -1;
    is_delete_mode = true;
}

/**
 *
 * @param div
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'div' implicitly has an 'any' type.
function messageEditAuto(div) {
    const { mesBlock, text, mes, bias } = updateMessage(div);

    mesBlock.find('.mes_text').val('');
    mesBlock.find('.mes_text').val(messageFormatting(
        text,
        this_edit_mes_chname,
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        mes.is_system,
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        mes.is_user,
        // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
        this_edit_mes_id,
        {},
        false,
    ));
    mesBlock[0].querySelector('.mes_bias').innerHTML = '';
    mesBlock[0].querySelector('.mes_bias').insertAdjacentHTML('beforeend', messageFormatting(bias, '', false, false, -1, {}, false));
    saveChatDebounced();
}

/**
 * Create the message edit UI.
 * @param {number} editMessageId The ID of the message to edit
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'editMessageId' implicitly has an 'any' ... Remove this comment to see the full error message
export async function messageEdit(editMessageId) {
    const editMessage = chat[editMessageId];
    if (!editMessage) {
        console.warn(`Message with id ${editMessageId} not found in chat array.`);
        return;
    }

    const messageElement = chatElement.find(`.mes[mesid="${editMessageId}"]`);
    if (messageElement.length === 0) {
        console.warn(`Message element with id ${editMessageId} not found in DOM.`);
        return;
    }

    this_edit_mes_id = editMessageId;
    // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
    this_edit_mes_chname = editMessage.name || (editMessage.is_user ? name1 : name2);

    refreshSwipeButtons();

    const chatScrollPosition = chatElement.scrollTop();
    const messageBlock = messageElement.find('.mes_block');
    const messageText = messageBlock.find('.mes_text');

    messageText[0].innerHTML = '';
    messageBlock.find('.mes_buttons').css('display', 'none');
    messageBlock.find('.mes_edit_buttons').css('display', 'inline-flex');

    // Also edit reasoning, if it exists
    const reasoningEdit = messageBlock.find('.mes_reasoning_edit:visible');
    if (reasoningEdit.length > 0) {
        reasoningEdit.trigger('click');
    }

    const editTextArea = document.createElement('textarea');
    editTextArea.id = 'curEditTextarea';
    editTextArea.className = 'edit_textarea mdHotkeys';
    editTextArea.dataset.macros = '';
    messageText[0].append(editTextArea);

    // @ts-expect-error TS(2339) FIXME: Property 'mes' does not exist on type 'never'.
    const text = trimSpaces(editMessage.mes || '');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const $editTextArea = $(editTextArea);
    $editTextArea.val(text);

    const cssAutofit = CSS.supports('field-sizing', 'content');
    if (!cssAutofit) {
        $editTextArea.height(0);
        $editTextArea.height(editTextArea.scrollHeight);
    }

    $editTextArea.trigger('focus');

    // Sets the cursor at the end of the text
    editTextArea.setSelectionRange(text.length, text.length);

    if (Number(this_edit_mes_id) === chat.length - 1) {
        chatElement.scrollTop(chatScrollPosition);
    }

    updateEditArrowClasses();
}

/**
 * Close the open message editor.
 * This deletes the user's unsaved changes.
 * @param {number} [messageId]
 */
// @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
async function messageEditCancel(messageId = this_edit_mes_id) {
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    const text = chat[messageId].mes;
    let thisMesDiv;
    // If this is the button then select it's parent. Otherwise, select by messageId.
    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
    if (this?.classList?.contains('mes_edit_cancel')) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        thisMesDiv = $(this).closest('.mes');
    } else {
        thisMesDiv = chatElement.children('.mes').filter(`[mesid="${messageId}"]`);
    }

    const thisMesBlock = thisMesDiv.find('.mes_block');
    thisMesBlock[0].querySelector('.mes_text').innerHTML = '';
    thisMesDiv.find('.mes_edit_buttons').css('display', 'none');
    thisMesBlock.find('.mes_buttons').css('display', '');
    thisMesBlock[0].querySelector('.mes_text').insertAdjacentHTML('beforeend', messageFormatting(
            text,
            this_edit_mes_chname,
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            chat[messageId].is_system,
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            chat[messageId].is_user,
            messageId,
            {},
            false,
        ));
    appendMediaToMessage(chat[messageId], thisMesDiv);
    addCopyToCodeBlocks(thisMesDiv);

    const reasoningEditDone = thisMesBlock.find('.mes_reasoning_edit_cancel:visible');
    if (reasoningEditDone.length > 0) {
        reasoningEditDone.trigger('click');
    }

    await eventSource.emit(event_types.MESSAGE_UPDATED, messageId);
    // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
    if (messageId == this_edit_mes_id) {
        this_edit_mes_id = undefined;
    } else {
        // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
        console.warn(`The message editor was closed on message #${messageId} while #${this_edit_mes_id} is being edited.`);
    }

    showSwipeButtons();
}

/**
 * Swaps chat[sourceId] with chat[targetId]. They must be adjacent.
 * @param {number} sourceId Index of the message to move
 * @param {number} targetId Index of the target message
 * @returns {Promise<boolean>} True if the messages were moved, false otherwise
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'sourceId' implicitly has an 'any' type.
async function messageEditMove(sourceId, targetId) {
    if (is_send_press) {
        console.warn(`The message #${sourceId} was not moved to #${targetId} because a generation is in progress.`);
        return false;
    }

    if (Math.abs(sourceId - targetId) !== 1) {
        console.error(`Message #${sourceId} and #${targetId} are not adjacent.`);
        return false;
    }

    const targetMessageDiv = chatElement.find(`.mes[mesid="${targetId}"]`);
    const sourceMessageDiv = chatElement.find(`.mes[mesid="${sourceId}"]`);

    if (sourceMessageDiv.length === 0 || targetMessageDiv.length === 0) {
        console.error(`Message #${sourceId} or #${targetId} were not found.`);
        return false;
    }

    if (sourceId <= targetId) {
        targetMessageDiv[0].after(sourceMessageDiv[0]);
    } else {
        targetMessageDiv[0].before(sourceMessageDiv[0]);
    }

    //Swap Ids.
    targetMessageDiv.attr('mesid', sourceId);
    sourceMessageDiv.attr('mesid', targetId);

    // Swap chat array entries.
    // @ts-expect-error TS(2322) FIXME: Type 'undefined' is not assignable to type 'never'... Remove this comment to see the full error message
    [chat[sourceId], chat[targetId]] = [chat[targetId], chat[sourceId]];

    // Update edited message id
    // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
    if (this_edit_mes_id === sourceId) {
        this_edit_mes_id = targetId;
    }

    swapItemizedPrompts(sourceId, targetId);
    updateViewMessageIds();
    refreshSwipeButtons();
    await saveChatConditional();
    return true;
}

/**
 *
 * @param div
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'div' implicitly has an 'any' type.
async function messageEditDone(div) {
    // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
    if (!(this_edit_mes_id >= 0)) {
        console.trace('this_edit_mes_id cannot be blank when calling messageEditDone.');
        return;
    }

    const updateMsg = updateMessage(div);
    const { mesBlock, mes, bias } = updateMsg;
    let { text } = updateMsg;

    // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
    await eventSource.emit(event_types.MESSAGE_EDITED, this_edit_mes_id);
    // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
    text = chat[this_edit_mes_id]?.mes ?? text;
    mesBlock[0].querySelector('.mes_text').innerHTML = '';
    mesBlock.find('.mes_edit_buttons').css('display', 'none');
    mesBlock.find('.mes_buttons').css('display', '');
    mesBlock[0].querySelector('.mes_text').insertAdjacentHTML('beforeend',
        messageFormatting(
            text,
            this_edit_mes_chname,
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            mes.is_system,
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            mes.is_user,
            // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
            this_edit_mes_id,
            {},
            false,
        ),
    );
    mesBlock[0].querySelector('.mes_bias').innerHTML = '';
    mesBlock[0].querySelector('.mes_bias').insertAdjacentHTML('beforeend', messageFormatting(bias, '', false, false, -1, {}, false));
    appendMediaToMessage(mes, div.closest('.mes'));
    addCopyToCodeBlocks(div.closest('.mes'));

    const reasoningEditDone = mesBlock.find('.mes_reasoning_edit_done:visible');
    if (reasoningEditDone.length > 0) {
        reasoningEditDone.trigger('click');
    }

    // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
    await eventSource.emit(event_types.MESSAGE_UPDATED, this_edit_mes_id);
    this_edit_mes_id = undefined;
    await saveChatConditional();
    showSwipeButtons();
}

/**
 * Fetches the chat content for each chat file from the server and compiles them into a dictionary.
 * The function iterates over a provided list of chat metadata and requests the actual chat content
 * for each chat, either as an individual chat or a group chat based on the context.
 * @param {Array} data - An array containing metadata about each chat such as file_name.
 * @param {boolean} isGroupChat - A flag indicating if the chat is a group chat.
 * @returns {Promise<object>} chat_dict - A dictionary where each key is a file_name and the value is the
 * corresponding chat content fetched from the server.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export async function getChatsFromFiles(data, isGroupChat) {
    const context = getContext();
    const chat_dict = {};
    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
    const chat_list = Object.values(data).sort((a, b) => a.file_name.localeCompare(b.file_name)).reverse();

    // @ts-expect-error TS(2345) FIXME: Argument of type '({ file_name }: { file_name: any... Remove this comment to see the full error message
    const chat_promise = chat_list.map(({ file_name }) => {
        return new Promise(async (res, rej) => {
            try {
                const endpoint = isGroupChat ? '/api/chats/group/get' : '/api/chats/get';
                const requestBody = isGroupChat
                    ? JSON.stringify({ id: file_name })
                    : JSON.stringify({
                        ch_name: characters[context.characterId].name,
                        file_name: file_name.replace('.jsonl', ''),
                        avatar_url: characters[context.characterId].avatar,
                    });

                const chatResponse = await fetch(endpoint, {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: requestBody,
                    cache: 'no-cache',
                });

                if (!chatResponse.ok) {
                    // @ts-expect-error TS(2794) FIXME: Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
                    return res();
                    // continue;
                }

                const currentChat = await chatResponse.json();
                if (!isGroupChat) {
                    // remove the first message, which is metadata, only for individual chats
                    currentChat.shift();
                }
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                chat_dict[file_name] = currentChat;
            } catch (error) {
                console.error(error);
            }

            // @ts-expect-error TS(2794) FIXME: Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
            return res();
        });
    });

    await Promise.all(chat_promise);

    return chat_dict;
}

/**
 * Fetches the metadata of all past chats related to a specific character based on its avatar URL.
 * The function sends a POST request to the server to retrieve all chats for the character. It then
 * processes the received data, sorts it by the file name, and returns the sorted data.
 * @param {null|number} [characterId] - When set, the function will use this character id instead of this_chid.
 * @returns {Promise<Array>} - An array containing metadata of all past chats of the character, sorted
 * in descending order by file name. Returns an empty array if the fetch request is unsuccessful or the
 * response is an object with an `error` property set to `true`.
 */
export async function getPastCharacterChats(characterId = null) {
    // @ts-expect-error TS(2322) FIXME: Type 'number' is not assignable to type 'null'.
    characterId = characterId ?? parseInt(this_chid);
    // @ts-expect-error TS(2538) FIXME: Type 'null' cannot be used as an index type.
    if (!characters[characterId]) return [];

    const response = await fetch('/api/characters/chats', {
        method: 'POST',
        // @ts-expect-error TS(2538) FIXME: Type 'null' cannot be used as an index type.
        body: JSON.stringify({ avatar_url: characters[characterId].avatar }),
        headers: getRequestHeaders(),
    });

    if (!response.ok) {
        return [];
    }

    const data = await response.json();
    if (typeof data === 'object' && data.error === true) {
        return [];
    }

    const chats = Object.values(data);
    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
    return chats.sort((a, b) => a.file_name.localeCompare(b.file_name)).reverse();
}

/**
 * Helper for `displayPastChats`, to make the same info consistently available for other functions
 */
export function getCurrentChatDetails() {
    if (!characters[this_chid] && !selected_group) {
        return { sessionName: '', group: null, characterName: '', avatarImgURL: '' };
    }

    const group = selected_group ? groups.find(x => x.id === selected_group) : null;
    const currentChat = selected_group ? group?.chat_id : characters[this_chid].chat;
    const displayName = selected_group ? group?.name : characters[this_chid].name;
    const avatarImg = selected_group ? group?.avatar_url : getThumbnailUrl('avatar', characters[this_chid].avatar);
    return { sessionName: currentChat, group: group, characterName: displayName, avatarImgURL: avatarImg };
}

/**
 * Displays the past chats for a character or a group based on the selected context.
 * The function first fetches the chats, processes them, and then displays them in
 * the HTML. It also has a built-in search functionality that allows filtering the
 * displayed chats based on a search query.
 * @param {string[]} hightlightNames - An array of chat names to highlight
 */
export async function displayPastChats(hightlightNames = []) {
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    document.getElementById('select_chat_div').innerHTML = '';
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#select_chat_search').val('').off('input');

    const chatDetails = getCurrentChatDetails();
    const currentChat = chatDetails.sessionName;
    const displayName = chatDetails.characterName;
    const avatarImg = chatDetails.avatarImgURL;

    await displayChats('', currentChat, displayName, avatarImg, selected_group, hightlightNames);

    // @ts-expect-error TS(7006) FIXME: Parameter 'searchQuery' implicitly has an 'any' ty... Remove this comment to see the full error message
    const debouncedDisplay = debounce((searchQuery) => {
        displayChats(searchQuery, currentChat, displayName, avatarImg, selected_group, []);
    });

    // Define the search input listener
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#select_chat_search').off('input').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const searchQuery = $(this).val();
        debouncedDisplay(searchQuery);
    });

    // UX convenience: Focus the search field when the Manage Chat Files view opens.
    setTimeout(function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const textSearchElement = $('#select_chat_search');
        textSearchElement.trigger('click').trigger('focus').trigger('select');
    }, 200);

    addChatBackupsBrowser();
}

/**
 *
 * @param searchQuery
 * @param currentChat
 * @param displayName
 * @param avatarImg
 * @param selected_group
 * @param highlightNames
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'searchQuery' implicitly has an 'any' ty... Remove this comment to see the full error message
async function displayChats(searchQuery, currentChat, displayName, avatarImg, selected_group, highlightNames) {
    try {
        const response = await fetch('/api/chats/search', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                query: searchQuery,
                avatar_url: selected_group ? null : characters[this_chid].avatar,
                group_id: selected_group || null,
            }),
        });

        if (!response.ok) {
            throw new Error('Search failed');
        }

        const filteredData = await response.json();
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('select_chat_div').innerHTML = '';

        // @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
        filteredData.sort((a, b) => sortMoments(timestampToMoment(a.last_mes), timestampToMoment(b.last_mes)));

        for (const chat of filteredData) {
            const isSelected = currentChat === chat.file_name;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const template = $(document.querySelector('#past_chat_template .select_chat_block_wrapper').cloneNode(true));
            template.find('.select_chat_block').attr('file_name', chat.file_name);
            template.find('.avatar img').attr('src', avatarImg);
            template.find('.select_chat_block_filename').text(chat.file_name);
            template.find('.chat_file_size').text(`(${chat.file_size},`);
            template.find('.chat_messages_num').text(`${chat.message_count} 💬)`);
            template.find('.select_chat_block_mes').text(chat.preview_message);
            template.find('.PastChat_cross').attr('file_name', chat.file_name);
            template.find('.chat_messages_date').text(timestampToMoment(chat.last_mes).format('lll'));

            if (isSelected) {
                template.find('.select_chat_block').attr('highlight', String(true));
            }

            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            document.getElementById('select_chat_div').append(template[0]);

            if (Array.isArray(highlightNames) && highlightNames.includes(chat.file_name)) {
                const templateOffset = template.offset().top - template.parent().offset().top;
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#select_chat_div').scrollTop(templateOffset);
                flashHighlight(template, debounce_timeout.extended);
            }
        }
    } catch (error) {
        console.error('Error loading chats:', error);
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error('Could not load chat data. Try reloading the page.');
    }
}

/**
 *
 * @param selectedMenuId
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'selectedMenuId' implicitly has an 'any'... Remove this comment to see the full error message
export function selectRightMenuWithAnimation(selectedMenuId) {
    const displayModes = {
        'rm_group_chats_block': 'flex',
        'rm_api_block': 'grid',
        'rm_characters_block': 'flex',
    };
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#result_info').toggle(selectedMenuId === 'rm_ch_create_block');
    document.querySelectorAll('#right-nav-panel .right_menu').forEach((menu) => {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $(menu).css('display', 'none');

        if (selectedMenuId && selectedMenuId.replace('#', '') === menu.id) {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            const mode = displayModes[menu.id] ?? 'block';
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(menu).css('display', mode);
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(menu).css('opacity', 0.0);
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(menu).transition({
                opacity: 1.0,
                duration: animation_duration,
                easing: animation_easing,
                complete: function () { },
            });
        }
    });
}

/**
 *
 * @param type
 * @param charId
 * @param previousCharId
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
export function select_rm_info(type, charId, previousCharId = null) {
    if (!type) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`Invalid process (no 'type')`);
        return;
    }
    let displayName = '';
    if (type !== 'group_create') {
        displayName = String(charId).replace('.png', '');
    }

    if (type === 'char_delete') {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning(t`Character Deleted: ${displayName}`);
    }
    if (type === 'char_create') {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success(t`Character Created: ${displayName}`);
    }
    if (type === 'group_create') {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success(t`Group Created`);
    }
    if (type === 'group_delete') {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning(t`Group Deleted`);
    }

    if (type === 'char_import') {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success(t`Character Imported: ${displayName}`);
    }

    selectRightMenuWithAnimation('rm_characters_block');

    // Set a timeout so multiple flashes don't overlap
    // @ts-expect-error TS(7005) FIXME: Variable 'importFlashTimeout' implicitly has an 'a... Remove this comment to see the full error message
    clearTimeout(importFlashTimeout);
    importFlashTimeout = setTimeout(function () {
        if (type === 'char_import' || type === 'char_create' || type === 'char_import_no_toast') {
            // Find the page at which the character is located
            const avatarFileName = charId;
            const charData = getEntitiesList({ doFilter: true });
            const charIndex = charData.findIndex((x) => x?.item?.avatar?.startsWith(avatarFileName));

            if (charIndex === -1) {
                console.log(`Could not find character ${charId} in the list`);
                return;
            }

            try {
                const perPage = Number(accountStorage.getItem('Characters_PerPage')) || per_page_default;
                const page = Math.floor(charIndex / perPage) + 1;
                const selector = `#rm_print_characters_block [title*="${avatarFileName}"]`;
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#rm_print_characters_pagination').pagination('go', page);

                waitUntilCondition(() => document.querySelector(selector) !== null).then(() => {
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    const element = $(selector).parent();

                    if (element.length === 0) {
                        console.log(`Could not find element for character ${charId}`);
                        return;
                    }

                    const scrollOffset = element.offset().top - element.parent().offset().top;
                    element.parent().scrollTop(scrollOffset);
                    flashHighlight(element, 5000);
                });
            } catch (e) {
                console.error(e);
            }
        }

        if (type === 'group_create') {
            // Find the page at which the character is located
            const charData = getEntitiesList({ doFilter: true });
            const charIndex = charData.findIndex((x) => String(x?.item?.id) === String(charId));

            if (charIndex === -1) {
                console.log(`Could not find group ${charId} in the list`);
                return;
            }

            const perPage = Number(accountStorage.getItem('Characters_PerPage')) || per_page_default;
            const page = Math.floor(charIndex / perPage) + 1;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#rm_print_characters_pagination').pagination('go', page);
            const selector = `#rm_print_characters_block [grid="${charId}"]`;
            try {
                waitUntilCondition(() => document.querySelector(selector) !== null).then(() => {
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    const element = $(selector);
                    const scrollOffset = element.offset().top - element.parent().offset().top;
                    element.parent().scrollTop(scrollOffset);
                    flashHighlight(element, 5000);
                });
            } catch (e) {
                console.error(e);
            }
        }
    }, 250);

    if (previousCharId) {
        const newId = characters.findIndex((x) => x.avatar == previousCharId);
        if (newId >= 0) {
            setCharacterId(newId);
        }
    }
}

/**
 * Selects the right menu for displaying the character editor.
 * @param {string} chid Character array index
 * @param {object} [param1] Options for the switch
 * @param {boolean} [param1.switchMenu] Whether to switch the menu
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'chid' implicitly has an 'any' type.
export function select_selected_character(chid, { switchMenu = true } = {}) {
    //character select
    //console.log('select_selected_character() -- starting with input of -- ' + chid + ' (name:' + characters[chid].name + ')');
    select_rm_create({ switchMenu });
    if (switchMenu) setMenuType('character_edit');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#delete_button').css('display', 'flex');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#export_button').css('display', 'flex');

    //create text poles
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#rm_button_back').css('display', 'none');
    //$("#character_import_button").css("display", "none");
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#create_button').attr('value', 'Save');              // what is the use case for this?
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#dupe_button').show();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#create_button_label').css('display', 'none');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#char_connections_button').show();

    // Hide the chat scenario button if we're peeking the group member defs
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#set_chat_character_settings').toggle(!selected_group);

    // Don't update the navbar name if we're peeking the group member defs
    if (!selected_group) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#rm_button_selected_ch').children('h2').text(characters[chid].name);
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#add_avatar_button').val('');

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_popup-button-h3').text(characters[chid].name);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_name_pole').val(characters[chid].name);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#description_textarea').val(characters[chid].description);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_world').val(characters[chid].data?.extensions?.world || '');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#creator_notes_textarea').val(characters[chid].data?.creator_notes || characters[chid].creatorcomment);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#creator_notes_spoiler').html(formatCreatorNotes(characters[chid].data?.creator_notes || characters[chid].creatorcomment, characters[chid].avatar));
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_version_textarea').val(characters[chid].data?.character_version || '');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#system_prompt_textarea').val(characters[chid].data?.system_prompt || '');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#post_history_instructions_textarea').val(characters[chid].data?.post_history_instructions || '');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#tags_textarea').val(Array.isArray(characters[chid].data?.tags) ? characters[chid].data.tags.join(', ') : '');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#creator_textarea').val(characters[chid].data?.creator);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_version_textarea').val(characters[chid].data?.character_version || '');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#personality_textarea').val(characters[chid].personality);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#firstmessage_textarea').val(characters[chid].first_mes);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#scenario_pole').val(characters[chid].scenario);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#depth_prompt_prompt').val(characters[chid].data?.extensions?.depth_prompt?.prompt ?? '');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#depth_prompt_depth').val(characters[chid].data?.extensions?.depth_prompt?.depth ?? depth_prompt_depth_default);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#depth_prompt_role').val(characters[chid].data?.extensions?.depth_prompt?.role ?? depth_prompt_role_default);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#talkativeness_slider').val(characters[chid].talkativeness || talkativeness_default);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#mes_example_textarea').val(characters[chid].mes_example);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#selected_chat_pole').val(characters[chid].chat);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#create_date_pole').val(timestampToMoment(characters[chid].create_date).toISOString());
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#avatar_url_pole').val(characters[chid].avatar);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#chat_import_avatar_url').val(characters[chid].avatar);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#chat_import_character_name').val(characters[chid].name);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_json_data').val(characters[chid].json_data);

    updateFavButtonState(characters[chid].fav || characters[chid].fav == 'true');

    const avatarUrl = characters[chid].avatar != 'none' ? getThumbnailUrl('avatar', characters[chid].avatar) : default_avatar;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#avatar_load_preview').attr('src', avatarUrl);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('.open_alternate_greetings').data('chid', chid);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#set_character_world').data('chid', chid);
    setWorldInfoButtonClass(chid);
    checkEmbeddedWorld(chid);

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#name_div').removeClass('displayBlock');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#name_div').addClass('displayNone');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#renameCharButton').css('display', '');

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#form_create').attr('actiontype', 'editcharacter');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('.form_create_bottom_buttons_block .chat_lorebook_button').show();

    const externalMediaState = isExternalMediaAllowed();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_open_media_overrides').toggle(!selected_group);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_media_allowed_icon').toggle(externalMediaState);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_media_forbidden_icon').toggle(!externalMediaState);

    // Update some stuff about the char management dropdown
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_source').attr('disabled', !getCharacterSource(chid) ? '' : null);

    eventSource.emit(event_types.CHARACTER_EDITOR_OPENED, chid);

    saveSettingsDebounced();
}

/**
 * Selects the right menu for creating a new character.
 * @param {object} [options] Options for the switch
 * @param {boolean} [options.switchMenu] Whether to switch the menu
 */
function select_rm_create({ switchMenu = true } = {}) {
    if (switchMenu) setMenuType('create');

    //console.log('select_rm_Create() -- selected button: '+selected_button);
    if (selected_button == 'create' && create_save.avatar) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const addAvatarInput = /** @type {HTMLInputElement} */ ($('#add_avatar_button').get(0));
        addAvatarInput.files = create_save.avatar;
        read_avatar_load(addAvatarInput);
    }

    if (switchMenu) selectRightMenuWithAnimation('rm_ch_create_block');

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#set_chat_character_settings').hide();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#delete_button_div').css('display', 'none');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#delete_button').css('display', 'none');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#export_button').css('display', 'none');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#create_button_label').css('display', '');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#create_button').attr('value', 'Create');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#dupe_button').hide();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#char_connections_button').hide();

    //create text poles
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#rm_button_back').css('display', '');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_import_button').css('display', '');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_popup-button-h3').text('Create character');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_name_pole').val(create_save.name);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#description_textarea').val(create_save.description);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_world').val(create_save.world);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#creator_notes_textarea').val(create_save.creator_notes);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#creator_notes_spoiler').html(formatCreatorNotes(create_save.creator_notes, ''));
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#post_history_instructions_textarea').val(create_save.post_history_instructions);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#system_prompt_textarea').val(create_save.system_prompt);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#tags_textarea').val(create_save.tags);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#creator_textarea').val(create_save.creator);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_version_textarea').val(create_save.character_version);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#personality_textarea').val(create_save.personality);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#firstmessage_textarea').val(create_save.first_message);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#talkativeness_slider').val(create_save.talkativeness);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#scenario_pole').val(create_save.scenario);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#depth_prompt_prompt').val(create_save.depth_prompt_prompt);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#depth_prompt_depth').val(create_save.depth_prompt_depth);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#depth_prompt_role').val(create_save.depth_prompt_role);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#mes_example_textarea').val(create_save.mes_example);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_json_data').val('');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#avatar_div').css('display', 'flex');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#avatar_load_preview').attr('src', default_avatar);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#renameCharButton').css('display', 'none');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#name_div').removeClass('displayNone');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#name_div').addClass('displayBlock');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('.open_alternate_greetings').data('chid', -1);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#set_character_world').data('chid', -1);
    // @ts-expect-error TS(2345) FIXME: Argument of type 'boolean' is not assignable to pa... Remove this comment to see the full error message
    setWorldInfoButtonClass(undefined, !!create_save.world);
    updateFavButtonState(false);
    // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
    checkEmbeddedWorld();

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#form_create').attr('actiontype', 'createcharacter');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('.form_create_bottom_buttons_block .chat_lorebook_button').hide();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_open_media_overrides').hide();
}

/**
 *
 */
function select_rm_characters() {
    const doFullRefresh = menu_type === 'characters';
    setMenuType('characters');
    selectRightMenuWithAnimation('rm_characters_block');
    printCharacters(doFullRefresh);
}

/**
 * Sets a prompt injection to insert custom text into any outgoing prompt. For use in UI extensions.
 * @param {string} key Prompt injection id.
 * @param {string} value Prompt injection value.
 * @param {number} position Insertion position. 0 is after story string, 1 is in-chat with custom depth.
 * @param {number} depth Insertion depth. 0 represets the last message in context. Expected values up to MAX_INJECTION_DEPTH.
 * @param {number} role Extension prompt role. Defaults to SYSTEM.
 * @param {boolean} scan Should the prompt be included in the world info scan.
 * @param {(function(): Promise<boolean>|boolean)} filter Filter function to determine if the prompt should be injected.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'key' implicitly has an 'any' type.
export function setExtensionPrompt(key, value, position, depth, scan = false, role = extension_prompt_roles.SYSTEM, filter = null) {
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    extension_prompts[key] = {
        value: String(value),
        position: Number(position),
        depth: Number(depth),
        scan: !!scan,
        role: Number(role ?? extension_prompt_roles.SYSTEM),
        filter: filter,
    };
}

/**
 * Gets a enum value of the extension prompt role by its name.
 * @param {string} roleName The name of the extension prompt role.
 * @returns {number} The role id of the extension prompt.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'roleName' implicitly has an 'any' type.
export function getExtensionPromptRoleByName(roleName) {
    // If the role is already a valid number, return it
    if (typeof roleName === 'number' && Object.values(extension_prompt_roles).includes(roleName)) {
        return roleName;
    }

    switch (roleName) {
        case 'system':
            return extension_prompt_roles.SYSTEM;
        case 'user':
            return extension_prompt_roles.USER;
        case 'assistant':
            return extension_prompt_roles.ASSISTANT;
    }

    // Skill issue?
    return extension_prompt_roles.SYSTEM;
}

/**
 * Removes all char A/N prompt injections from the chat.
 * To clean up when switching from groups to solo and vice versa.
 */
export function removeDepthPrompts() {
    for (const key of Object.keys(extension_prompts)) {
        if (key.startsWith(inject_ids.DEPTH_PROMPT)) {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            delete extension_prompts[key];
        }
    }
}

/**
 * Adds or updates the metadata for the currently active chat.
 * @param {object} newValues An object with collection of new values to be added into the metadata.
 * @param {boolean} reset Should a metadata be reset by this call.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'newValues' implicitly has an 'any' type... Remove this comment to see the full error message
export function updateChatMetadata(newValues, reset) {
    chat_metadata = reset ? { ...newValues } : { ...chat_metadata, ...newValues };
}


/**
 * Updates the state of the favorite button based on the provided state.
 * @param {boolean} state Whether the favorite button should be on or off.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'state' implicitly has an 'any' type.
function updateFavButtonState(state) {
    // Update global state of the flag
    // TODO: This is bad and needs to be refactored.
    fav_ch_checked = state;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#fav_checkbox').prop('checked', state);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#favorite_button').toggleClass('fav_on', state);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#favorite_button').toggleClass('fav_off', !state);
}

/**
 *
 */
export async function setCharacterSettingsOverrides() {
    if (!selected_group && (this_chid === undefined || !characters[this_chid])) {
        console.warn('setCharacterSettingsOverrides() -- no selected group or character');
        return;
    }

    const scenarioOverrideValue = chat_metadata.scenario || '';
    const exampleMessagesValue = chat_metadata.mes_example || '';
    const systemPromptValue = chat_metadata.system_prompt || '';
    const isGroup = !!selected_group;

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const $template = $(await renderTemplateAsync('scenarioOverride'));
    $template.find('[data-group="true"]').toggle(isGroup);
    $template.find('[data-character="true"]').toggle(!isGroup);
    const pendingChanges = {
        scenario: scenarioOverrideValue,
        examples: exampleMessagesValue,
        system_prompt: systemPromptValue,
    };

    // Keep edits local until the popup is closed/confirmed
    const $scenario = $template.find('.chat_scenario');
    $scenario.val(scenarioOverrideValue).on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        pendingChanges.scenario = String($(this).val());
    });
    const $examples = $template.find('.chat_examples');
    $examples.val(exampleMessagesValue).on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        pendingChanges.examples = String($(this).val());
    });
    const $systemPrompt = $template.find('.chat_system_prompt');
    $systemPrompt.val(systemPromptValue).on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        pendingChanges.system_prompt = String($(this).val());
    });

    $template.find('.remove_scenario_override').on('click', async function () {
        const confirm = await Popup.show.confirm(t`Are you sure you want to remove all overrides?`, t`This action cannot be undone.`);
        if (!confirm) {
            return;
        }

        $scenario.val('');
        pendingChanges.scenario = '';
        $examples.val('');
        pendingChanges.examples = '';
        $systemPrompt.val('');
        pendingChanges.system_prompt = '';
    });

    // Wait for popup close/confirm.
    await callGenericPopup($template, POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
    });

    chat_metadata.scenario = pendingChanges.scenario;
    chat_metadata.mes_example = pendingChanges.examples;
    chat_metadata.system_prompt = pendingChanges.system_prompt;
    await saveMetadata();
}

/**
 * Displays a blocking popup with a given text and type.
 * @param {JQuery<HTMLElement>|string|Element} text - Text to display in the popup.
 * @param {string} type
 * @param {string} inputValue - Value to set the input to.
 * @param {PopupOptions} options - Options for the popup.
 * @typedef {{okButton?: string, rows?: number, wide?: boolean, wider?: boolean, large?: boolean, allowHorizontalScrolling?: boolean, allowVerticalScrolling?: boolean, cropAspect?: number }} PopupOptions - Options for the popup.
 * @returns {Promise<any>} A promise that resolves when the popup is closed.
 * @deprecated Use `callGenericPopup` instead.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'text' implicitly has an 'any' type.
export async function callPopup(text, type, inputValue = '', {
    okButton,
    rows,
    wide,
    wider,
    large,
    allowHorizontalScrolling,
    allowVerticalScrolling,
    cropAspect
}: Record<string, unknown> = {}) {
    try {
        /**
         *
         *
         */
    function getOkButtonText() {
        if (['text', 'char_not_selected'].includes(popup_type)) {
            $dialoguePopupCancel.css('display', 'none');
            return okButton ?? t`Ok`;
        } else if (['delete_extension'].includes(popup_type)) {
            return okButton ?? t`Ok`;
        } else if (['new_chat', 'confirm'].includes(popup_type)) {
            return okButton ?? t`Yes`;
        } else if (['input'].includes(popup_type)) {
            return okButton ?? t`Save`;
        }
        return okButton ?? t`Delete`;
    }

    dialogueCloseStop = true;
    if (type) {
        popup_type = type;
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const $dialoguePopup = $('#dialogue_popup');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const $dialoguePopupCancel = $('#dialogue_popup_cancel');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const $dialoguePopupOk = $('#dialogue_popup_ok');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const $dialoguePopupInput = $('#dialogue_popup_input');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const $dialoguePopupText = $('#dialogue_popup_text');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const $shadowPopup = $('#shadow_popup');

    $dialoguePopup.toggleClass('wide_dialogue_popup', !!wide)
        .toggleClass('wider_dialogue_popup', !!wider)
        .toggleClass('large_dialogue_popup', !!large)
        .toggleClass('horizontal_scrolling_dialogue_popup', !!allowHorizontalScrolling)
        .toggleClass('vertical_scrolling_dialogue_popup', !!allowVerticalScrolling);

    $dialoguePopupCancel.css('display', 'inline-block');
    $dialoguePopupOk.text(getOkButtonText());
    $dialoguePopupInput.toggle(popup_type === 'input').val(inputValue).attr('rows', rows ?? 1);
    const dpTextEl = $dialoguePopupText[0];
    dpTextEl.innerHTML = '';
    if (typeof text === 'string') {
        dpTextEl.insertAdjacentHTML('beforeend', text);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    } else if (text instanceof $) {
        dpTextEl.append(text[0]);
    } else {
        dpTextEl.append(text);
    }
    $shadowPopup.css('display', 'block');

    if (popup_type == 'input') {
        $dialoguePopupInput.trigger('focus');
    }

    $shadowPopup.transition({
        opacity: 1,
        duration: animation_duration,
        easing: animation_easing,
    });

    } catch (error) {
        console.error('Error in callPopup:', error);
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`An error occurred while opening the popup. Check console for details.`, t`Popup Error`);
        return Promise.resolve(null);
    }
}

/**
 * Update the swipe counter for mesId.
 * By default, the swipe counter's opacity will appear greyed out. The opacity is changed with CSS.
 * @param {number} mesId
 * @param {object} [options] Options
 * @param {ChatMessage} [options.message] Swipe numbers from this message will be used instead of mesId.
 * @param {JQuery<HTMLElement>} [options.messageElement] Target Element. Passing in the message's element will save a DOM query.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'mesId' implicitly has an 'any' type.
export async function updateSwipeCounter(mesId, { message = undefined, messageElement = undefined } = {}) {
    message ??= chat[mesId];
    messageElement ??= chatElement.children('.mes').filter(`[mesid="${mesId}"]`);

    //If the message does not have swipes, create them.
    if (ensureSwipes(message)) {
        syncMesToSwipe(mesId);
    }

    // @ts-expect-error TS(2339) FIXME: Property 'swipe_id' does not exist on type 'never'... Remove this comment to see the full error message
    const swipeCounterText = formatSwipeCounter((message?.swipe_id + 1), message?.swipes?.length);
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    const swipeCounter = messageElement.find('.swipes-counter');
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    const swipePickerButton = messageElement.find('.mes_swipe_picker');
    const canOpenSwipePicker = canOpenSwipePickerForMessage(mesId);
    const canJumpToSwipe = canJumpToSwipeForMessage(mesId);

    swipeCounter
        .text(swipeCounterText)
        .prop('hidden', false)
        .toggleClass('swipe-picker-enabled', canOpenSwipePicker)
        .toggleClass(INTERACTABLE_CONTROL_CLASS, canOpenSwipePicker)
        .attr('role', canOpenSwipePicker ? 'button' : null)
        .attr('title', canJumpToSwipe ? t`Click to jump to a swipe` : canOpenSwipePicker ? t`Click to view swipe history` : null);
    swipePickerButton.toggle(canOpenSwipePicker);

    if (!canOpenSwipePicker) {
        swipeCounter.removeAttr('tabindex');
    }
}

/**
 * Returns true if messages are generally swipeable.
 * @returns {boolean}
 */
export function isSwipingAllowed() {
    return (
        //Swipe cannot be called on an empty chat.
        chat.length !== 0 &&
        //The swipes setting must be enabled, and swipes can't be hidden.
        swipes && !swipesHidden &&
        //Cannot swipe while generating.
        !isGenerating() &&
        //If mid-swipe, the message cannot be swiped.
        swipeState === SWIPE_STATE.NONE
    );
}

/**
 * Returns true if the message is swipeable.
 * This does not check if messages are generally swipeable. See isSwipingAllowed().
 * This does not check if the swipes exist or are valid.
 * @param {number} messageId The message Id to check.
 * @param {ChatMessage} [message] If undefined, then the message checks will be skipped.
 * @returns {boolean}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'messageId' implicitly has an 'any' type... Remove this comment to see the full error message
export function isMessageSwipeable(messageId, message = undefined) {
    message ??= chat[messageId];

    //If the message does not have swipes, create them.
    if (ensureSwipes(message)) {
        syncMesToSwipe(messageId);
    }

    if (
        //Only messages below the currently edited message can be swiped, if it's not mid-swipe edit.
        // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
        ((messageId > (this_edit_mes_id ?? -1)) && (swipeState != SWIPE_STATE.EDITING)) &&

        //If the message is the last message, and it exists.
        (messageId == chat.length - 1) &&
        (message &&
            //Small system messages cannot be swiped.
            // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
            !(message?.extra?.isSmallSys) &&
            //Some messages, like the welcome screen, are not swipeable.
            // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
            !(message?.extra?.swipeable === false) &&
            //User messages are not swipeable.
            // @ts-expect-error TS(2339) FIXME: Property 'is_user' does not exist on type 'never'.
            !message.is_user
        )
    ) {
        // The message is swipeable.
        return true;
    } else {
        // The message is not swipeable.
        return false;
    }
}

/**
 * Returns the message's behavior when swiped past it's last branch.
 * This does not check if the message can currently be swiped. See isMessageSwipeable().
 * This does not check if messages are generally swipeable. See isSwipingAllowed().
 * This does not check if the swipes exist or are valid.
 * @param {number} messageId The message Id to check.
 * @param {ChatMessage} [message] If defined, this will be used instead of chat[messageId].
 * @returns {OVERSWIPE_BEHAVIOR}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'messageId' implicitly has an 'any' type... Remove this comment to see the full error message
export function getOverswipeBehavior(messageId, message = undefined) {
    message ??= chat[messageId];

    const isPristine = !chat_metadata?.tainted;
    const isGreeting = messageId === 0;

    //Do not override explicitly set overswipe_behavior.
    // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
    if (typeof message?.extra?.overswipe_behavior == 'string') return message.extra.overswipe_behavior;
    //Some messages, like the welcome screen, are not swipeable.
    // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
    else if (message?.extra?.swipeable === false) return OVERSWIPE_BEHAVIOR.NONE;
    //Small System messages can't be swiped.
    // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
    else if (message?.extra?.isSmallSys) return OVERSWIPE_BEHAVIOR.NONE;
    //The first message in a priistine chat will loop. It's chevrons will always be visible https://github.com/SillyTavern/SillyTavern/pull/4712#issuecomment-3557893373
    else if (isGreeting && isPristine) return OVERSWIPE_BEHAVIOR.PRISTINE_GREETING;
    //Non-user and non-prompt hidden messages will regenerate.
    // @ts-expect-error TS(2339) FIXME: Property 'is_user' does not exist on type 'never'.
    else if (!message?.is_user && !message?.is_system) return OVERSWIPE_BEHAVIOR.REGENERATE;
    //By default, all other messages will loop. Their swipe chevrons will only be shown if there is more than one swipe.
    else { return OVERSWIPE_BEHAVIOR.LOOP; }
}

/**
 * Refreshes all swipe buttons and updates their swipe counters.
 * This has been optimized for bulk updates by minimizing DOM queries.
 * @param {boolean} updateCounters When true, the swipe counters will also be updated. Typically redundant because addOneMessage updates the counters.
 * @param {boolean} fade By default, the chevrons fade in and out.
 * @returns
 */
export function refreshSwipeButtons(updateCounters = false, fade = true) {
    //Never show swipe buttons on an empty chat.
    if (chat?.length === 0) return false;

    //If swipes are disabled or hidden, hide all swipe buttons.
    if (!isSwipingAllowed()) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('body').addClass('hideAllSwipeButtons');
        return;
        //Don't hide all swipe buttons.
    } else {
        //CSS will hide all messages.
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('body').removeClass('hideAllSwipeButtons');
    }
    //Non-messages can appear in chat. '.mes' is required.
    const messageElements = chatElement.children('.mes[mesid]');

    const firstDisplayedMesId = Number(messageElements.first().attr('mesid'));

    //Group each message.
    // @ts-expect-error TS(7006) FIXME: Parameter 'index' implicitly has an 'any' type.
    messageElements.each((index, div) => {
        //This assumes the messages are in order and their Id's are accurate.
        const messageId = firstDisplayedMesId + index;
        //Number($(div).attr('mesid')); Would not misscount due to a missing div, but is much slower.

        const message = chat[messageId];

        //Chevrons should not fade-in during printMessages. //https://github.com/SillyTavern/SillyTavern/pull/4712#issuecomment-3539315919
        div.classList.toggle('fade', fade);

        if (isMessageSwipeable(messageId, message)) {
            //If a right swipe would trigger a generation or loop to the first swipe.
            // @ts-expect-error TS(2339) FIXME: Property 'swipes' does not exist on type 'never'.
            const isLastSwipe = (message?.swipes?.length ?? 1) - 1 <= (message?.swipe_id ?? 0);
            // @ts-expect-error TS(2339) FIXME: Property 'swipes' does not exist on type 'never'.
            const hasSwipes = (message?.swipes?.length > 1);
            const overswipe = getOverswipeBehavior(messageId, message);
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const swipePickerButton = $(div).find('.mes_swipe_picker');
            const canOpenSwipePicker = canOpenSwipePickerForMessage(messageId);

            // Chevrons should always be shown on pristine greetings: https://github.com/SillyTavern/SillyTavern/pull/4712#issuecomment-3557893373
            const pristineGreeting = overswipe == OVERSWIPE_BEHAVIOR.PRISTINE_GREETING;

            //The swipe button will be shown if an overswipe would trigger REGENERATE or EDIT_GENERATE.
            const isOverswipeable = isLastSwipe &&
                overswipe == OVERSWIPE_BEHAVIOR.REGENERATE ||
                overswipe == OVERSWIPE_BEHAVIOR.EDIT_GENERATE;

            div.classList.toggle('last_swipe', isOverswipeable);

            //If there's only one swipe, the left arrow should not be shown.
            div.classList.toggle('swipes_visible', hasSwipes || pristineGreeting);
            swipePickerButton.toggle(canOpenSwipePicker);

            //updateSwipeCounter does not need to be awaited, It can run a bit later.
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            if (updateCounters) updateSwipeCounter(messageId, { message, messageElement: $(div) });
        } else {
            //Hide all messages that are not swipeable.
            div.classList.remove('swipes_visible', 'last_swipe');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(div).find('.mes_swipe_picker').toggle(canOpenSwipePickerForMessage(messageId));
        }
    });
}
/**
 * This function is misleadingly named. It allows generation then refreshes the swipe buttons and counters.
 */
export function showSwipeButtons() {
    swipesHidden = false;
    refreshSwipeButtons();
}

/**
 * This function is misleadingly named. It blocks generation then refreshes the swipe buttons and counters.
 * @param {object} [options] Options
 * @param {boolean} [options.hideCounters] Also hide the swipes counter.
 */
export function hideSwipeButtons({ hideCounters = false } = {}) {
    swipesHidden = true;
    refreshSwipeButtons();

    if (hideCounters === true) {
        chatElement.find('.last_mes .swipes-counter').prop('hidden', true);
    }
}

/**
 * Deletes a swipe from the chat.
 * @param {number?} [swipeId] - The ID of the swipe to delete. If not provided, the current swipe will be deleted.
 * @param {number?} [messageId] - The ID of the message to delete from. If not provided, the last message will be targeted.
 * @returns {Promise<number>|undefined} - The ID of the new swipe after deletion.
 */
export async function deleteSwipe(swipeId = null, messageId = chat.length - 1) {
    if (swipeId != null) {
        // @ts-expect-error TS(2322) FIXME: Type 'number' is not assignable to type 'null'.
        swipeId = Number(swipeId);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (!Number.isInteger(swipeId) || swipeId < 0) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.warning(t`Invalid swipe ID.`);
            return;
        }
    }

    const message = chat[messageId];
    // @ts-expect-error TS(2339) FIXME: Property 'swipes' does not exist on type 'never'.
    if (!message || !Array.isArray(message.swipes) || !message.swipes.length) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning(t`No messages to delete swipes from.`);
        return;
    }

    // @ts-expect-error TS(2339) FIXME: Property 'swipes' does not exist on type 'never'.
    if (message.swipes.length <= 1) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning(t`Can't delete the last swipe.`);
        return;
    }

    // @ts-expect-error TS(2322) FIXME: Type 'number' is not assignable to type 'null'.
    swipeId = Number(swipeId ?? message.swipe_id);
    // @ts-expect-error TS(2339) FIXME: Property 'swipe_id' does not exist on type 'never'... Remove this comment to see the full error message
    const currentSwipeId = clamp(Number(message.swipe_id ?? 0), 0, message.swipes.length - 1);

    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    if (swipeId < 0 || swipeId >= message.swipes.length) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning(t`Invalid swipe ID: ${swipeId + 1}`);
        return;
    }

    // @ts-expect-error TS(2339) FIXME: Property 'swipes' does not exist on type 'never'.
    message.swipes.splice(swipeId, 1);

    // @ts-expect-error TS(2339) FIXME: Property 'swipe_info' does not exist on type 'neve... Remove this comment to see the full error message
    if (Array.isArray(message.swipe_info) && message.swipe_info.length) {
        // @ts-expect-error TS(2339) FIXME: Property 'swipe_info' does not exist on type 'neve... Remove this comment to see the full error message
        message.swipe_info.splice(swipeId, 1);
    }

    let newSwipeId;
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    if (swipeId < currentSwipeId) {
        newSwipeId = currentSwipeId - 1;
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    } else if (swipeId > currentSwipeId) {
        newSwipeId = currentSwipeId;
    } else {
        // Select the next swipe, or the one before if it was the last one.
        // @ts-expect-error TS(2345) FIXME: Argument of type 'null' is not assignable to param... Remove this comment to see the full error message
        newSwipeId = Math.min(swipeId, message.swipes.length - 1);
    }

    chat_metadata.tainted = true;

    messageId = Number(messageId);
    // @ts-expect-error TS(2322) FIXME: Type 'number' is not assignable to type 'null'.
    swipeId = Number(swipeId);
    // @ts-expect-error TS(2339) FIXME: Property 'swipe_id' does not exist on type 'never'... Remove this comment to see the full error message
    message.swipe_id = newSwipeId;
    await eventSource.emit(event_types.MESSAGE_SWIPE_DELETED, { messageId, swipeId, newSwipeId });

    if (swipeId === currentSwipeId) {
        const direction = (swipeId <= newSwipeId) ? SWIPE_DIRECTION.RIGHT : SWIPE_DIRECTION.LEFT;
        // Animate swipe and swap displayed message when the currently visible swipe was deleted.
        await swipe(null, direction, { source: SWIPE_SOURCE.DELETE, repeated: false, forceMesId: messageId, forceSwipeId: newSwipeId });
    } else {
        await updateSwipeCounter(messageId);
        if (messageId !== chat.length - 1) {
            await updateSwipeCounter(chat.length - 1);
        }
        refreshSwipeButtons();
        saveChatDebounced();
    }

    await saveChatConditional();

    return newSwipeId;
}

/**
 *
 */
export async function saveMetadata() {
    return await saveChatConditional();
}

/**
 *
 */
export async function saveChatConditional() {
    try {
        await waitUntilCondition(() => !isChatSaving, DEFAULT_SAVE_EDIT_TIMEOUT, 100);
    } catch {
        console.warn('Timeout waiting for chat to save');
        return;
    }

    try {
        cancelDebouncedChatSave();

        isChatSaving = true;

        if (selected_group) {
            await saveGroupChat(selected_group, true);
        } else {
            await saveChat();
        }

        // Save token and prompts cache to IndexedDB storage
        saveTokenCache();
        saveItemizedPrompts(getCurrentChatId());
    } catch (error) {
        console.error('Error saving chat', error);
    } finally {
        isChatSaving = false;
    }
}

/**
 * Saves the chat to the server.
 * @param {FormData} formData Form data to send to the server.
 * @param {object} [options] Options for the import
 * @param {boolean} [options.refresh] Whether to refresh the group chat list after import
 * @returns {Promise<string[]>} List of imported file names.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'formData' implicitly has an 'any' type.
export async function importCharacterChat(formData, { refresh = true } = {}) {
    const fetchResult = await fetch('/api/chats/import', {
        method: 'POST',
        body: formData,
        headers: getRequestHeaders({ omitContentType: true }),
        cache: 'no-cache',
    });

    if (fetchResult.ok) {
        const data = await fetchResult.json();
        if (data.res && refresh) {
            await displayPastChats();
        }
        return data?.fileNames || [];
    }

    return [];
}

/**
 *
 * @param startIndex
 */
export function updateViewMessageIds(startIndex = null) {
    const minId = startIndex ?? getFirstDisplayedMessageId();

    // @ts-expect-error TS(7006) FIXME: Parameter 'index' implicitly has an 'any' type.
    chatElement.find('.mes').each(function (index, element) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $(element).attr('mesid', minId + index);
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $(element).find('.mesIDDisplay').text(`#${minId + index}`);
    });

    chatElement.find('.mes').removeClass('last_mes');
    chatElement.find('.mes').last().addClass('last_mes');

    updateEditArrowClasses();
}

/**
 *
 */
export function getFirstDisplayedMessageId() {
    const allIds = Array.from(document.querySelectorAll('#chat .mes')).map(el => Number(el.getAttribute('mesid'))).filter(x => !isNaN(x));
    const minId = Math.min(...allIds);
    return minId;
}

/**
 *
 */
export function updateEditArrowClasses() {
    // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
    if (!(this_edit_mes_id >= 0)) {
        return;
    }

    // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
    const message = chatElement.children('.mes').filter(`.mes[mesid="${this_edit_mes_id}"]`);

    const downButton = message.find('.mes_edit_down');
    const upButton = message.find('.mes_edit_up');
    const copyButton = message.find('.mes_edit_copy');
    const deleteButton = message.find('.mes_edit_delete');
    const lastId = Number(chatElement.find('.mes').last().attr('mesid'));
    const firstId = Number(chatElement.find('.mes').first().attr('mesid'));

    copyButton.removeClass('disabled');
    deleteButton.removeClass('disabled');

    // The last message cannot be moved down.
    // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
    downButton.toggleClass('disabled', lastId === Number(this_edit_mes_id));
    // The first message cannot be moved up.
    // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
    upButton.toggleClass('disabled', firstId === Number(this_edit_mes_id));
}

/**
 * Closes the message editor.
 * @param {'message'|'reasoning'|'all'} what What to close. Default is 'all'.
 */
export function closeMessageEditor(what = 'all') {
    if (what === 'message' || what === 'all') {
        // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
        if (this_edit_mes_id >= 0) {
            // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
            chatElement.find(`.mes[mesid="${this_edit_mes_id}"] .mes_edit_cancel`).trigger('click');
        }
    }
    if (what === 'reasoning' || what === 'all') {
        document.querySelectorAll('.reasoning_edit_textarea').forEach((el) => {
            const cancelButton = el.closest('.mes')?.querySelector('.mes_reasoning_edit_cancel');
            if (cancelButton instanceof HTMLElement) {
                cancelButton.click();
            }
        });
    }
}

/**
 *
 * @param progress
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'progress' implicitly has an 'any' type.
export function setGenerationProgress(progress) {
    if (!progress) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#send_textarea').css({ 'background': '', 'transition': '' });
    } else {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#send_textarea').css({
            'background': `linear-gradient(90deg, #008000d6 ${progress}%, transparent ${progress}%)`,
            'transition': '0.25s ease-in-out',
        });
    }
}

/**
 *
 */
export function cancelTtsPlay() {
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
    }
}

/**
 *
 * @param root
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'root' implicitly has an 'any' type.
function updateAlternateGreetingsHintVisibility(root) {
    const numberOfGreetings = root.find('.alternate_greetings_list .alternate_greeting').length;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(root).find('.alternate_grettings_hint').toggle(numberOfGreetings == 0);
}

/**
 *
 */
async function openCharacterWorldPopup() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const chid = $('#set_character_world').data('chid');
    if (menu_type != 'create' && chid === undefined) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error('Does not have an Id for this character in world select menu.');
        return;
    }

    // TODO: Maybe make this utility function not use the window context?
    const fileName = getCharaFilename(chid);
    const charName = (menu_type == 'create' ? create_save.name : characters[chid]?.data?.name) || 'Nameless';
    const worldId = (menu_type == 'create' ? create_save.world : characters[chid]?.data?.extensions?.world) || '';
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const template = $(document.querySelector('#character_world_template .character_world').cloneNode(true));
    template.find('.character_name').text(charName);

    // --- Event Handlers ---
    /**
     *
     */
    async function handlePrimaryWorldSelect() {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const selectedValue = $(this).val();
        const worldIndex = selectedValue !== '' ? Number(selectedValue) : NaN;
        const name = !isNaN(worldIndex) ? world_names[worldIndex] : '';
        await charUpdatePrimaryWorld(name);
    }

    /**
     *
     * @param evt
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'evt' implicitly has an 'any' type.
    function handleExtrasWorldSelect(evt) {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const el = evt?.currentTarget ?? this;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const selectedValues = $(el).val();
        const selected = Array.isArray(selectedValues) ? selectedValues : [];
        const fileName = getCharaFilename(null, {});
        const nextList = selected.map(i => world_names[i]).filter(Boolean);
        charSetAuxWorlds(fileName, nextList);
    }

    // --- Populate Dropdowns ---
    // Append to primary dropdown.
    const primarySelect = template.find('.character_world_info_selector');
    // @ts-expect-error TS(7006) FIXME: Parameter 'item' implicitly has an 'any' type.
    world_names.forEach((item, i) => {
        primarySelect[0].append(new Option(item, String(i), item === worldId, item === worldId));
    });

    // Append to extras dropdown.
    const extrasSelect = template.find('.character_extra_world_info_selector');
    // @ts-expect-error TS(2339) FIXME: Property 'charLore' does not exist on type '{}'.
    const existingCharLore = world_info.charLore?.find((e) => e.name === fileName);
    // @ts-expect-error TS(7006) FIXME: Parameter 'item' implicitly has an 'any' type.
    world_names.forEach((item, i) => {
        const array = (menu_type == 'create' ? create_save.extra_books : existingCharLore?.extraBooks);
        const isSelected = !!array?.includes(item);
        extrasSelect[0].append(new Option(item, String(i), isSelected, isSelected));
    });

    const popup = new Popup(template, POPUP_TYPE.TEXT, '', {
        // @ts-expect-error TS(2322) FIXME: Type '(popup: any) => void' is not assignable to t... Remove this comment to see the full error message
        onOpen: function (popup) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const popupDialog = $(popup.dlg);

            primarySelect.on('change', handlePrimaryWorldSelect);
            extrasSelect.on('change', handleExtrasWorldSelect);

            // Not needed on mobile.
            if (!isMobile()) {
                extrasSelect.select2({
                    width: '100%',
                    placeholder: t`No auxiliary Lorebooks set. Click here to select.`,
                    allowClear: true,
                    closeOnSelect: false,
                    dropdownParent: popupDialog,
                });
            }
        },
    });

    await popup.show();
}

/**
 *
 */
function openAlternateGreetings() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const chid = $('.open_alternate_greetings').data('chid');

    if (menu_type != 'create' && chid === undefined) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error('Does not have an Id for this character in editor menu.');
        return;
    } else {
        // If the character does not have alternate greetings, create an empty array
        if (characters[chid] && !Array.isArray(characters[chid].data.alternate_greetings)) {
            characters[chid].data.alternate_greetings = [];
        }
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const template = $(document.querySelector('#alternate_greetings_template .alternate_grettings').cloneNode(true));
    const getArray = () => menu_type == 'create' ? create_save.alternate_greetings : characters[chid].data.alternate_greetings;
    const popup = new Popup(template, POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        // @ts-expect-error TS(2322) FIXME: Type '() => Promise<void>' is not assignable to ty... Remove this comment to see the full error message
        onClose: async () => {
            if (menu_type !== 'create') {
                // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
                await createOrEditCharacter();
            }
        },
    });

    for (let index = 0; index < getArray().length; index++) {
        addAlternateGreeting(template, getArray()[index], index, getArray, popup);
    }

    template.find('.add_alternate_greeting').on('click', function () {
        const array = getArray();
        const index = array.length;
        array.push('');
        addAlternateGreeting(template, '', index, getArray, popup);
        updateAlternateGreetingsHintVisibility(template);
        const list = template.find('.alternate_greetings_list');
        list.scrollTop(list.prop('scrollHeight'));
    });

    popup.show();
    updateAlternateGreetingsHintVisibility(template);
}

/**
 * Adds an alternate greeting to the template.
 * @param {JQuery<HTMLElement>} template
 * @param {string} greeting
 * @param {number} index
 * @param {() => any[]} getArray
 * @param {Popup} popup
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'template' implicitly has an 'any' type.
function addAlternateGreeting(template, greeting, index, getArray, popup) {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const greetingBlock = $(document.querySelector('#alternate_greeting_form_template .alternate_greeting').cloneNode(true));
    greetingBlock.attr('data-index', index);
    greetingBlock.find('.alternate_greeting_text')
        .attr('id', `alternate_greeting_${index}`)
        .on('input', async function () {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const value = $(this).val();
            const array = getArray();
            array[index] = value;
        }).val(greeting);
    greetingBlock.find('.editor_maximize').attr('data-for', `alternate_greeting_${index}`);
    greetingBlock.find('.greeting_index').text(index + 1);
    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    greetingBlock.find('.delete_alternate_greeting').on('click', async function (event) {
        event.preventDefault();
        event.stopPropagation();

        const confirm = await callGenericPopup(t`Are you sure you want to delete this alternate greeting?`, POPUP_TYPE.CONFIRM);
        if (!confirm) {
            return;
        }

        const array = getArray();
        array.splice(index, 1);

        // We need to reopen the popup to update the index numbers
        await popup.complete(POPUP_RESULT.AFFIRMATIVE);
        openAlternateGreetings();
    });
    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    greetingBlock.find('.move_up_alternate_greeting').on('click', function (event) {
        handleMoveAlternateGreeting(event, -1);
    });
    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    greetingBlock.find('.move_down_alternate_greeting').on('click', function (event) {
        handleMoveAlternateGreeting(event, 1);
    });

    /**
     * Handles moving an alternate greeting up or down in the list.
     * @param {JQuery.ClickEvent} event - The click event
     * @param {number} direction - Direction to move: -1 for up, 1 for down
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    function handleMoveAlternateGreeting(event, direction) {
        event.preventDefault();
        event.stopPropagation();

        const array = getArray();
        const index = Number(greetingBlock.attr('data-index'));
        const newIndex = index + direction;

        // Check bounds
        if (direction === -1 && index <= 0) {
            return;
        }
        if (direction === 1 && index >= array.length - 1) {
            return;
        }

        // Swap the greetings
        [array[index], array[newIndex]] = [array[newIndex], array[index]];

        // Update current greeting
        greetingBlock.find('.alternate_greeting_text').val(array[index]);

        // Update adjacent greeting
        const adjacentGreetingBlock = template.find(`.alternate_greeting[data-index="${newIndex}"]`);
        adjacentGreetingBlock.find('.alternate_greeting_text').val(array[newIndex]);
    }

    template[0].querySelector('.alternate_greetings_list').append(greetingBlock[0]);
}

/**
 * Creates or edits a character based on the form data.
 * @param {Event} [e] Event that triggered the function call.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
export async function createOrEditCharacter(e) {
    if (!settingsReady) {
        console.warn('Settings not ready, aborting character creation/editing.');
        return;
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#rm_info_avatar').html('');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const formData = new FormData(/** @type {HTMLFormElement} */($('#form_create').get(0)));
    formData.set('fav', String(fav_ch_checked));
    const isNewChat = e instanceof CustomEvent && e.type === 'newChat';

    const rawFile = formData.get('avatar');
    if (rawFile instanceof File) {
        const convertedFile = await ensureImageFormatSupported(rawFile);
        formData.set('avatar', convertedFile);
    }

    const headers = getRequestHeaders({ omitContentType: true });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    if ($('#form_create').attr('actiontype') == 'createcharacter') {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        if (String($('#character_name_pole').val()).length === 0) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(t`Name is required`);
            return;
        }
        if (is_group_generating || is_send_press) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(t`Cannot create characters while generating. Stop the request and try again.`, t`Creation aborted`);
            return;
        }
        try {
            //if the character name text area isn't empty (only posible when creating a new character)
            let url = '/api/characters/create';

            // @ts-expect-error TS(7005) FIXME: Variable 'crop_data' implicitly has an 'any' type.
            if (crop_data != undefined) {
                // @ts-expect-error TS(7005) FIXME: Variable 'crop_data' implicitly has an 'any' type.
                url += `?crop=${encodeURIComponent(JSON.stringify(crop_data))}`;
            }

            formData.delete('alternate_greetings');
            for (const value of create_save.alternate_greetings) {
                formData.append('alternate_greetings', value);
            }

            formData.append('extensions', JSON.stringify(create_save.extensions));

            const fetchResult = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: formData,
                cache: 'no-cache',
            });

            if (!fetchResult.ok) {
                throw new Error('Fetch result is not ok');
            }

            const avatarId = await fetchResult.text();

            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#character_cross').trigger('click'); //closes the advanced character editing popup
            const fields = [
                // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
                { id: '#character_name_pole', callback: value => create_save.name = value },
                // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
                { id: '#description_textarea', callback: value => create_save.description = value },
                // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
                { id: '#creator_notes_textarea', callback: value => create_save.creator_notes = value },
                // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
                { id: '#character_version_textarea', callback: value => create_save.character_version = value },
                // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
                { id: '#post_history_instructions_textarea', callback: value => create_save.post_history_instructions = value },
                // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
                { id: '#system_prompt_textarea', callback: value => create_save.system_prompt = value },
                // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
                { id: '#tags_textarea', callback: value => create_save.tags = value },
                // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
                { id: '#creator_textarea', callback: value => create_save.creator = value },
                // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
                { id: '#personality_textarea', callback: value => create_save.personality = value },
                // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
                { id: '#firstmessage_textarea', callback: value => create_save.first_message = value },
                // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
                { id: '#talkativeness_slider', callback: value => create_save.talkativeness = value, defaultValue: talkativeness_default },
                // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
                { id: '#scenario_pole', callback: value => create_save.scenario = value },
                // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
                { id: '#depth_prompt_prompt', callback: value => create_save.depth_prompt_prompt = value },
                // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
                { id: '#depth_prompt_depth', callback: value => create_save.depth_prompt_depth = value, defaultValue: depth_prompt_depth_default },
                // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
                { id: '#depth_prompt_role', callback: value => create_save.depth_prompt_role = value, defaultValue: depth_prompt_role_default },
                // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
                { id: '#mes_example_textarea', callback: value => create_save.mes_example = value },
                { id: '#character_json_data', callback: () => { } },
                // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
                { id: '#alternate_greetings_template', callback: value => create_save.alternate_greetings = value, defaultValue: [] },
                // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
                { id: '#character_world', callback: value => create_save.world = value },
                // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
                { id: '#_character_extensions_fake', callback: value => create_save.extensions = {} },
            ];

            fields.forEach(field => {
                const fieldValue = field.defaultValue !== undefined ? field.defaultValue : '';
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $(field.id).val(fieldValue);
                if (field.callback) field.callback(fieldValue);
            });

            if (Array.isArray(create_save.extra_books) && create_save.extra_books.length > 0) {
                // @ts-expect-error TS(2322) FIXME: Type 'string' is not assignable to type 'null | un... Remove this comment to see the full error message
                const fileName = getCharaFilename(null, { manualAvatarKey: avatarId });
                // @ts-expect-error TS(2339) FIXME: Property 'charLore' does not exist on type '{}'.
                const charLore = world_info.charLore ?? [];
                charLore.push({ name: fileName, extraBooks: create_save.extra_books });
                Object.assign(world_info, { charLore: charLore });
                saveSettingsDebounced();
            }
            create_save.extra_books = [];

            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#character_popup-button-h3').text('Create character');

            create_save.avatar = null;

            const oldAvatarBtn = document.getElementById('add_avatar_button');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            const newAvatarBtn = oldAvatarBtn.cloneNode(true);
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            oldAvatarBtn.parentNode.replaceChild(newAvatarBtn, oldAvatarBtn);

            let oldSelectedChar = null;
            if (this_chid !== undefined) {
                oldSelectedChar = characters[this_chid].avatar;
            }

            console.log(`new avatar id: ${avatarId}`);
            createTagMapFromList('#tagList', avatarId);
            await getCharacters();

            select_rm_info('char_create', avatarId, oldSelectedChar);

            crop_data = undefined;
        } catch (error) {
            console.error('Error creating character', error);
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(t`Failed to create character`);
        }
    } else {
        try {
            let url = '/api/characters/edit';

            // @ts-expect-error TS(7005) FIXME: Variable 'crop_data' implicitly has an 'any' type.
            if (crop_data != undefined) {
                // @ts-expect-error TS(7005) FIXME: Variable 'crop_data' implicitly has an 'any' type.
                url += `?crop=${encodeURIComponent(JSON.stringify(crop_data))}`;
            }

            formData.delete('alternate_greetings');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const chid = $('.open_alternate_greetings').data('chid');
            if (characters[chid] && Array.isArray(characters[chid]?.data?.alternate_greetings)) {
                for (const value of characters[chid].data.alternate_greetings) {
                    formData.append('alternate_greetings', value);
                }
            }

            const fetchResult = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: formData,
                cache: 'no-cache',
            });

            if (!fetchResult.ok) {
                throw new Error('Fetch result is not ok');
            }

            await getOneCharacter(formData.get('avatar_url'));
            favsToHotswap(); // Update fav state

            const oldAvatarBtn = document.getElementById('add_avatar_button');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            const newAvatarBtn = oldAvatarBtn.cloneNode(true);
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            oldAvatarBtn.parentNode.replaceChild(newAvatarBtn, oldAvatarBtn);
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#create_button').attr('value', 'Save');
            crop_data = undefined;
            await eventSource.emit(event_types.CHARACTER_EDITED, { detail: { id: this_chid, character: characters[this_chid] } });

            // Recreate the chat if it hasn't been used at least once (i.e. with continue).
            const message = getFirstMessage();
            const shouldRegenerateMessage =
                !isNewChat &&
                message.mes &&
                !selected_group &&
                !chat_metadata.tainted &&
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                (chat.length === 0 || (chat.length === 1 && !chat[0].is_user && !chat[0].is_system));

            if (shouldRegenerateMessage) {
                // @ts-expect-error TS(2345) FIXME: Argument of type '{ name: string; is_user: boolean... Remove this comment to see the full error message
                chat.splice(0, chat.length, message);
                const messageId = (chat.length - 1);
                await eventSource.emit(event_types.MESSAGE_RECEIVED, messageId, 'first_message');
                await clearChat();
                await printMessages();
                await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, messageId, 'first_message');
                await saveChatConditional();
            }
        } catch (error) {
            console.log(error);
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(t`Something went wrong while saving the character, or the image file provided was in an invalid format. Double check that the image is not a webp.`);
        }
    }
}

/**
 * Formats a counter for a swipe view.
 * @param {number} current The current number of items.
 * @param {number} total The total number of items.
 * @returns {string} The formatted counter.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'current' implicitly has an 'any' type.
function formatSwipeCounter(current, total) {
    if (isNaN(current) && isNaN(total)) {
        return '';
    }
    return `${!isNaN(current) ? current : '?'}\u200b/\u200b${!isNaN(total) ? total : '?'}`;
}

/**
 * Handles the swipe event.
 * @param {SwipeEvent} event Event.
 * @param {SWIPE_DIRECTION} direction The direction to swipe.
 * @param {object} params Additional parameters.
 * @param {import('./scripts/constants.js').SWIPE_SOURCE} [params.source]  The source of the swipe event.
 * @param {boolean} [params.repeated] Is the swipe event repeated.
 * @param {ChatMessage} [params.message] The chat message to swipe.
 * @param {number} [params.forceMesId] The message id to swipe.
 * @param {number} [params.forceSwipeId] The target swipe_id. When out of range, it will be looped or clamped.
 * @param {number} [params.forceDuration] Overwrites the default swipe duration.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
export async function swipe(event, direction, {
    source,
    repeated,
    message = chat[chat.length - 1],
    forceMesId,
    forceSwipeId,
    forceDuration
}: Record<string, unknown> = {}) {
    if (chat.length === 0) {
        console.warn('Swipe was called on an empty chat.');
        return;
    }

    let messageIndex;

    //Only set messageIndex if message exists because -1 is truthy.
    if (message) {
        // @ts-expect-error TS(2345) FIXME: Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
        messageIndex = chat.indexOf(message);
        if (messageIndex === -1 && typeof (forceMesId) != 'number') {
            console.error(`The message must exist in chat. ${message};`);
            return;
        }
    }

    const mesId = Number(forceMesId ?? event?.currentTarget?.closest('.mes')?.getAttribute('mesid') ?? messageIndex ?? chat.length - 1);

    // @ts-expect-error TS(2345) FIXME: Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
    if ([SWIPE_SOURCE.DELETE, SWIPE_SOURCE.BACK, SWIPE_SOURCE.AUTO_SWIPE, SWIPE_SOURCE.SLASH_COMMAND, SWIPE_SOURCE.SWIPE_PICKER].includes(source)) {
        console.info(`The ${direction} swipe source on message #${mesId} is ${source}, Most checks have been bypassed. `);
    } else {
        //Only show an error if swipes are not hidden and a message is generating.
        if (isGenerating() && (swipes && !swipesHidden && (swipeState === SWIPE_STATE.NONE))) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.warning(t`Cannot swipe while generating. Stop the request and try again.`, t`Swipe aborted`);
            return;
        }
        //Only allow one concurrent swipe.
        if (!isSwipingAllowed()) {
            console.info('The swipe has been ignored messages cannot currently be swiped.');
            return;
        }
        // @ts-expect-error TS(2345) FIXME: Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
        if (!isMessageSwipeable(mesId, message)) {
            console.info(`Message #${mesId} cannot be swiped. ${message}`);
            return;
        }
    }

    // Cancel pending save to prevent accidental swipe_id overwrites.
    cancelDebouncedChatSave();

    swipeState = SWIPE_STATE.SWIPING;
    // @ts-expect-error TS(7034) FIXME: Variable 'generation' implicitly has type 'any' in... Remove this comment to see the full error message
    let generation;

    const thisMesDiv = chatElement.children('.mes').filter(`[mesid="${mesId}"]`);
    const thisMesText = thisMesDiv.find('.mes_block .mes_text');
    const thisMesDivHeight = thisMesDiv[0]?.scrollHeight;
    const thisMesTextHeight = thisMesText[0]?.scrollHeight;
    if (![thisMesDiv.length, thisMesText.length].every(num => num > 0)) {
        console.error(`Message #${mesId}'s DOM element is not valid.`);
        return;
    }
    // @ts-expect-error TS(2339) FIXME: Property 'swipe_id' does not exist on type 'never'... Remove this comment to see the full error message
    const originalSwipeId = Number(chat[mesId]?.swipe_id ?? 0);
    let newSwipeId = Number(forceSwipeId ?? originalSwipeId);

    /**
     * Calculates the next swipe duration with how many swipes have been repeated.
     * @param {number} animation_duration
     * @returns {number} The adjusted swipe duration.
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'animation_duration' implicitly has an '... Remove this comment to see the full error message
    function getSwipeDuration(animation_duration) {
        const now = performance.now();
        const resetTime = animation_duration * 2 + 300;

        //Reset the counter if the last swipe was more than half a second ago.
        if (now - lastSwipeInfo.now >= resetTime || direction !== lastSwipeInfo.direction) recentSwipes = 0;
        recentSwipes++;
        lastSwipeInfo = { now, direction };

        //At 4 swipes, animation_duration will be halved.
        const sigmoid = 1 / (1 + Math.exp(recentSwipes - 4));

        return animation_duration * sigmoid;
    }

    const swipeDuration = forceDuration ?? getSwipeDuration(animation_duration);

    //The offscreen messages may be visible if the user resizes the viewport during a swipe.
    const thisMesDivWidth = thisMesDiv.width() + 30;
    const swipeRange = (direction === SWIPE_DIRECTION.RIGHT) ? -thisMesDivWidth : thisMesDivWidth;

    /**
     * Waits for the generation to end, reverts the swipe if swipe_id has not changed.
     * @param {boolean} revert Attept to revert the swipe without saving.
     */
    async function endSwipe(revert = false) {
        //Wait for the generation to end.
        try {
            //`mes_buttons` need to be hidden until the animation completes.
            // @ts-expect-error TS(7005) FIXME: Variable 'generation' implicitly has an 'any' type... Remove this comment to see the full error message
            if (generation) {
                document.body.dataset.swiping = 'true';
                await generation;
            }
        } catch (error) {
            console.warn(`Swipe failed, Swiping back. ${error}`);
        }

        //Clamp Id between swipes.
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        const clampedId = clamp(chat[mesId].swipe_id, 0, Math.max(0, chat[mesId].swipes.length - 1));

        await updateSwipeCounter(mesId);
        //Fallback.
        if (mesId != chat.length - 1) {
            await updateSwipeCounter(chat.length - 1);
        }

        // If swipe_id has not changed, give the user feedback.
        if (clampedId == originalSwipeId && source != SWIPE_SOURCE.DELETE) {
            try {
                //Shake 700/140=5px
                shakeElement(thisMesDiv, -swipeRange / 140, animation_duration, 'ease-in');
                //Flash red.
                const flashTime = Math.max(animation_duration * 2, 100);
                await Promise.race([thisMesDiv.find('.swipes-counter').animate({ color: 'red' }, flashTime).animate({ color: '' }).promise(), createTimeout(flashTime * 4, `The shake animation did not end within ${flashTime * 4}ms`)].filter(Boolean));
            } catch (error) {
                console.warn(error);
            }
        }

        //If the id is not within bounds, Swipe back.
        // @ts-expect-error TS(2339) FIXME: Property 'swipe_id' does not exist on type 'never'... Remove this comment to see the full error message
        if (chat[mesId]?.swipe_id !== clampedId || revert) {
            // Prevent recursion.
            if (source != SWIPE_SOURCE.BACK) {
                source = SWIPE_SOURCE.BACK;
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                chat[mesId].swipe_id = clampedId;

                //Update the chat.
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                await loadFromSwipeId(mesId, chat[mesId].swipe_id);
                await redisplayChat({ startIndex: mesId });
            } else {
                await Popup.show.confirm(
                    t`ERROR: <code>syncSwipeToMes</code> has failed to revert the failed ${direction} swipe on message #${mesId}.`,
                    t`<p>After you click OK, the chat will be reloaded to prevent data corruption.</p>`,
                    { okButton: 'OK', cancelButton: false },
                );
                console.trace(`Error! Recursion detected when reverting failed ${direction} swipe on message #${mesId}. Something has broken.`);
                await reloadCurrentChat();
            }
            //Out of bounds swipes should not be saved.
        } else if (source != SWIPE_SOURCE.BACK) {
            //Save the chat if swipe_id has changed.
            saveChatDebounced();
        }

        //Allow for another swipe.
        swipeState = SWIPE_STATE.NONE;
        delete document.body.dataset.swiping;
        showSwipeButtons();
    }

    /**
     *
     * @param newSwipeId
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'newSwipeId' implicitly has an 'any' typ... Remove this comment to see the full error message
    async function standardSwipe(newSwipeId) {
        //If swipe_id has changed, or the source is being deleted.
        if (newSwipeId !== originalSwipeId || source == SWIPE_SOURCE.DELETE || source == SWIPE_SOURCE.BACK) {
            //Update the chat.
            await loadFromSwipeId(mesId, newSwipeId);
            //Transition to the new chat.
            await animateSwipe();
        }
        await endSwipe();
    }

    /**
     * Removes a message's extra and gen times.
     * @param {ChatMessage} message
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'message' implicitly has an 'any' type.
    function clearMessageData(message) {
        if (message.extra && typeof message.extra === 'object') {
            delete message.extra.memory;
            delete message.extra.display_text;
            delete message.extra.media;
            delete message.extra.inline_image;
            delete message.extra.files;
            delete message.extra.fileLength;
            delete message.extra.generationType;
            delete message.extra.negative;
            delete message.extra.title;
            delete message.extra.append_title;
        }
        delete message.gen_started;
        delete message.gen_finished;
    }

    /**
     * Sets the message to the newSwipeId and loads it.
     * @param {number} mesId
     * @param {number} newSwipeId
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'mesId' implicitly has an 'any' type.
    async function loadFromSwipeId(mesId, newSwipeId) {
        //Update the swipe_id.
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        chat[mesId].swipe_id = newSwipeId;

        clearMessageData(chat[mesId]);

        //Load from swipes.
        if (syncSwipeToMes(mesId, newSwipeId) == false) {
            const errorMessage = t`When swiping ${direction} on message ${mesId}, syncSwipeToMes has returned false. Attempting to swipe back!`;
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(errorMessage);

            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            chat[mesId].swipe_id = originalSwipeId;
            await endSwipe(true);
        }
        return true;
    }

    /**
     * Animates a swipe for all messages >= mesId.
     * @param {number} mesId
     * @param {object} params
     * @param {string} [params.xStart]
     * @param {string} [params.xEnd]
     * @param {number} [params.duration]
     * @param {string} [params.classes] Additional CSS classes to target during the swipe.
     * @param {boolean} [params.freeze] When true, do not remove the class from the animation, leaving it stuck at xEnd.
     * @returns {Promise<boolean|Function>} endSlide unfreezes the messages from xEnd.
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'mesId' implicitly has an 'any' type.
    async function animateSwipeTransition(mesId, { xStart = '0px', xEnd = '0px', duration = animation_duration, classes = '', freeze = false } = {}) {
        // If the animation_duration is zero, the 'animationend' promise will never resolve.
        //Skip the animation if it's faster than 50ms.
        if (duration <= 50) return;

        //Select MAXIMUM_ANIMATED messages after mesId. Ideally, only visible messages would be animated.
        const MAXIMUM_ANIMATED = 100;

        const messages = chatElement.children('.mes');
        const firstDisplayedMesId = Number(messages.first().attr('mesid'));

        // @ts-expect-error TS(7006) FIXME: Parameter 'index' implicitly has an 'any' type.
        const swipedMessagesDiv = messages.filter((index, div) => {
            // const messageId = Number($(div).attr('mesid')); //Slower.
            //This assumes the messages are in order and their Id's are accurate.
            const divMessageId = firstDisplayedMesId + index;

            return (divMessageId < mesId + MAXIMUM_ANIMATED && divMessageId >= mesId);
        });
        if (swipedMessagesDiv.length > 0) {
            let swipeClasses = '.mes_block, .mesAvatarWrapper';
            swipeClasses += classes;

            //Select only the target classes.
            const swipedElementsDiv = swipedMessagesDiv.children(swipeClasses);
            if (swipedElementsDiv.length > 0) {
                //This is a global variable, only one swipe transition can occur concurrently.
                document.documentElement.style.setProperty('--slide-mes-x-start', xStart);
                document.documentElement.style.setProperty('--slide-mes-x-end', xEnd);
                document.documentElement.style.setProperty('--slide-mes-x-duration', `${duration}ms`);

                //The class must be removed to unfreze previous slides.
                swipedElementsDiv.removeClass('slide');
                //CSS starts the animation.
                void swipedElementsDiv[0].offsetWidth;
                swipedElementsDiv.addClass('slide');

                const endSlide = () => {
                    //Remove the style when done.
                    swipedElementsDiv.removeClass('slide');

                    document.documentElement.style.setProperty('--slide-mes-x-start', '');
                    document.documentElement.style.setProperty('--slide-mes-x-end', '');
                    document.documentElement.style.setProperty('--slide-mes-duration', '');
                    return true;
                };
                //Wait for the animation's end. https://developer.mozilla.org/en-US/docs/Web/API/Animation/finished
                const animations = swipedElementsDiv[0]?.getAnimations() ?? [];
                // @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
                const animation = animations.filter((a) => a instanceof globalThis.CSSAnimation && a.animationName == 'slide')[0];
                try {
                    await Promise.race([animation?.finished, createTimeout(duration * 2, `The ${duration}ms swipe animation has not ended after ${duration * 2}ms. It has been skipped.`)].filter(Boolean));
                } catch (error) {
                    console.warn(error);
                }

                //If not frozen, end the slide now.
                return freeze ? endSlide : endSlide();
            }
        }
        console.warn(`No animatable messages were found after message #${mesId}.`);
        return false;
    }

    /**
     *
     * @param thisMesDiv
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'thisMesDiv' implicitly has an 'any' typ... Remove this comment to see the full error message
    function getMessageBottomHeight(thisMesDiv) {
        const thisMesRect = thisMesDiv[0].getBoundingClientRect();
        //Scroll position + Chat height = Bottom of chat height.
        const chatBottom = chatElement.scrollTop() - chatElement.height();
        //Message offset from viewport top + height = Bottom of message offset.
        const messageBottom = thisMesRect.top + thisMesDiv.height();
        // Bottom of chat + Bottom of message offset = target scroll position.
        const scrollHeight = (chatBottom + messageBottom);
        return scrollHeight;
    }

    /**
     *
     * @param thisMesDiv
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'thisMesDiv' implicitly has an 'any' typ... Remove this comment to see the full error message
    function expandNewMessage(thisMesDiv) {
        //Only scroll if the view is not near the bottom.
        const is_animation_scroll = (chatElement.scrollTop() >= (chatElement.prop('scrollHeight') - chatElement.outerHeight()) - 10);

        let new_height = thisMesDivHeight - (thisMesTextHeight - thisMesText[0].scrollHeight);
        if (new_height < 103) new_height = 103;

        //Keep the swipe buttons at the same height when scrolling is finished.

        //Expand new message.
        thisMesDiv.animate({ height: new_height + 'px' }, {
            duration: 0, //used to be 100 //Disabled on Cohee's request. https://github.com/SillyTavern/SillyTavern/pull/4610/files#r2408731744
            queue: false,
            // @ts-expect-error TS(7006) FIXME: Parameter 'animation' implicitly has an 'any' type... Remove this comment to see the full error message
            progress: function (animation, progress, remainingMs) {
                if (is_animation_scroll) chatElement.scrollTop(getMessageBottomHeight(thisMesDiv));
            },
            complete: function () {
                thisMesDiv.css('height', 'auto');
                //Correct height auto offset.
                if (is_animation_scroll) chatElement.scrollTop(getMessageBottomHeight(thisMesDiv));
            },
        });
    }

    /**
     * Anime a swipe, optionally running a generation.
     * @param {boolean} run_generate
     * @param {boolean} [skipSwipeOut]
     */
    async function animateSwipe(run_generate = false, skipSwipeOut = false) {
        if (!skipSwipeOut) {
            //Swipe out.
            // @ts-expect-error TS(2322) FIXME: Type 'unknown' is not assignable to type 'number |... Remove this comment to see the full error message
            await animateSwipeTransition(mesId, { xEnd: `${swipeRange}px`, duration: swipeDuration });
        }


        if (run_generate) {
            await updateSwipeCounter(mesId);
            //shows "..." while generating
            thisMesDiv.find('.mes_text').html('...');
            // resets the timer
            thisMesDiv.find('.mes_timer').html('');
            thisMesDiv.find('.tokenCounterDisplay').text('');
            updateReasoningUI(thisMesDiv, { reset: true });
        } else {
            //console.log('showing previously generated swipe candidate, or "..."');
            //console.log('onclick right swipe calling addOneMessage');

            //Only scroll when swiping the last message.
            const scroll = (mesId == chat.length - 1);
            //The swipe buttons will be refreshed in endSwipe(), refreshing them now will cause flickering.
            // @ts-expect-error TS(2322) FIXME: Type 'string' is not assignable to type 'undefined... Remove this comment to see the full error message
            addOneMessage(chat[mesId], { type: 'swipe', forceId: mesId, scroll: scroll, showSwipes: false });

            if (power_user.message_token_count_enabled) {
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                if (!chat[mesId].extra) {
                    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                    chat[mesId].extra = {};
                }

                // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
                const tokenCountText = (chat[mesId]?.extra?.reasoning || '') + chat[mesId].mes;
                // @ts-expect-error TS(2345) FIXME: Argument of type '0' is not assignable to paramete... Remove this comment to see the full error message
                const tokenCount = await getTokenCountAsync(tokenCountText, 0);
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                chat[mesId].extra.token_count = tokenCount;
                thisMesDiv.find('.tokenCounterDisplay').text(`${tokenCount}t`);
            }
        }

        //Animate expanding to the new message height.
        thisMesDiv.css('height', thisMesDivHeight);
        expandNewMessage(thisMesDiv);

        if (run_generate) {
            appendMediaToMessage(chat[mesId], thisMesDiv);
        }

        await eventSource.emit(event_types.MESSAGE_SWIPED, (mesId));

        if (run_generate && !is_send_press) {
            is_send_press = true;
            generation = Generate('swipe');
        }

        //Swipe in from the opposite side.
        // @ts-expect-error TS(2322) FIXME: Type 'unknown' is not assignable to type 'number |... Remove this comment to see the full error message
        await animateSwipeTransition(mesId, { xStart: `${-swipeRange}px`, xEnd: `${0}px`, duration: swipeDuration });
    }

    // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
    if (mesId === Number(this_edit_mes_id)) {
        closeMessageEditor();
    }
    if (isStreamingEnabled() && streamingProcessor) {
        // @ts-expect-error TS(2339) FIXME: Property 'onStopStreaming' does not exist on type ... Remove this comment to see the full error message
        streamingProcessor.onStopStreaming();
    }

    if (isHordeGenerationNotAllowed()) {
        // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
        return unblockGeneration();
    }

    //If the swipe is not being deleted.
    if (source != SWIPE_SOURCE.DELETE && source != SWIPE_SOURCE.BACK) {
        // Make sure ad-hoc changes to extras are saved before swiping away
        // @ts-expect-error TS(2345) FIXME: Argument of type 'number' is not assignable to par... Remove this comment to see the full error message
        syncMesToSwipe(mesId);

        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        if (chat[mesId].swipe_id === undefined) {              // if there is no swipe-message in the last spot of the chat array
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            chat[mesId].swipe_id = 0;                        // set it to id 0
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            chat[mesId].swipes = [];                         // empty the array
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            chat[mesId].swipe_info = [];
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            chat[mesId].swipes[0] = chat[mesId].mes;  //assign swipe array with last chat[mesId] from chat
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            chat[mesId].swipe_info[0] = {
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                'send_date': chat[mesId].send_date,
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                'gen_started': chat[mesId].gen_started,
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                'gen_finished': chat[mesId].gen_finished,
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                'extra': structuredClone(chat[mesId].extra),
            };
        }
        // If the user is holding down the key and we're at the last or first swipe, don't do anything.
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        const isLastSwipe = (direction === SWIPE_DIRECTION.RIGHT) ? (chat[mesId].swipe_id === Math.max(0, chat[mesId].swipes.length - 1)) : chat[mesId].swipe_id === 0;
        if (source === SWIPE_SOURCE.KEYBOARD && repeated && isLastSwipe) {
            await endSwipe();
            return;
        }
    } else if (source == SWIPE_SOURCE.DELETE || source == SWIPE_SOURCE.BACK) {
        //If the swipe is being deleted or reverted.
        await standardSwipe(newSwipeId);
        return;
    }

    //If swiping left.
    if (direction === SWIPE_DIRECTION.LEFT) {
        if (forceSwipeId == null) newSwipeId--;
        //Loop to last swipe if negative.
        if (newSwipeId < 0) {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            newSwipeId = Math.max(0, chat[mesId].swipes.length - 1);
        }
        //Limit swipe_id to swipes.
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        if (newSwipeId > chat[mesId].swipes.length - 1) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.warning(`The swipe_id for message #${mesId} was ${newSwipeId}. It has been reset to ${chat[mesId].swipes.length - 1}.`);
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            chat[mesId].swipe_id = chat[mesId].swipes.length - 1;
            await endSwipe();
            return;
        }
        await standardSwipe(newSwipeId);
        return;
    } else if (direction === SWIPE_DIRECTION.RIGHT) {
        //If swiping right.
        // make new slot in array
        if (forceSwipeId == null) newSwipeId++;

        //Minimum of zero.
        if (newSwipeId < 0) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.warning(`The swipe_id for message #${mesId} was ${newSwipeId}. It has been reset to zero.`);
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            chat[mesId].swipe_id = 0;
            await endSwipe();
            return;
        }

        //If overswiping.
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        if (newSwipeId >= chat[mesId].swipes.length) {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            newSwipeId = chat[mesId].swipes.length;

            //Update the swipe_id.
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            chat[mesId].swipe_id = newSwipeId;

            const overswipe = getOverswipeBehavior(mesId);

            //Cancel the generation.
            if (overswipe == OVERSWIPE_BEHAVIOR.NONE) {
                //Cancel swipe.
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                chat[mesId].swipe_id = originalSwipeId;
                await endSwipe();
                return;
            } else if (overswipe == OVERSWIPE_BEHAVIOR.REGENERATE) {
                //Regenerate the message
                clearMessageData(chat[mesId]);
                const run_generate = true;
                //Generate.
                await animateSwipe(run_generate);
                await endSwipe();
                return;
            } else if (overswipe == OVERSWIPE_BEHAVIOR.LOOP || overswipe == OVERSWIPE_BEHAVIOR.PRISTINE_GREETING) {
                // Loop to the first swipe.
                newSwipeId = 0;
            }
        }
        await standardSwipe(newSwipeId);
        return;
    }
}

/**
 * @deprecated Use `swipe` instead.
 * Handles the swipe to the left event.
 * @param {SwipeEvent} [event] Event.
 * @param {object} params Additional parameters.
 * @param {import('./scripts/constants.js').SWIPE_SOURCE} [params.source]  The source of the swipe event.
 * @param {boolean} [params.repeated] Is the swipe event repeated.
 * @param {object} [params.message] The chat message to swipe.
 */
export async function swipe_left(event: Event, {
    source,
    repeated,
    message
}: { source?: string; repeated?: boolean; message?: string } = {}) {
    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
    await swipe.call(this, event, SWIPE_DIRECTION.LEFT, { source: source, repeated: repeated, message: message });
}

/**
 * @deprecated Use `swipe` instead.
 * Handles the swipe to the right event.
 * @param {SwipeEvent} [event] Event.
 * @param {object} params Additional parameters.
 * @param {import('./scripts/constants.js').SWIPE_SOURCE} [params.source] The source of the swipe event.
 * @param {boolean} [params.repeated] Is the swipe event repeated.
 * @param {object} [params.message] The chat message to swipe.
 */
//MARK: swipe_right
export async function swipe_right(event: Event | null = null, {
    source,
    repeated,
    message
}: { source?: string; repeated?: boolean; message?: string } = {}) {
    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
    await swipe.call(this, event, SWIPE_DIRECTION.RIGHT, { source: source, repeated: repeated, message: message });
}

/**
 * Imports supported files dropped into the app window.
 * @param {File[]} files Array of files to process
 * @param {Map<File, string>} [data] Extra data to pass to the import function
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'files' implicitly has an 'any' type.
export async function processDroppedFiles(files, data = new Map()) {
    const allowedMimeTypes = [
        'application/json',
        'image/png',
        'application/yaml',
        'application/x-yaml',
        'text/yaml',
        'text/x-yaml',
    ];

    const allowedExtensions = [
        'charx',
        'byaf',
    ];

    const avatarFileNames = [];
    for (const file of files) {
        const extension = file.name.split('.').pop().toLowerCase();
        if (allowedMimeTypes.some(x => file.type.startsWith(x)) || allowedExtensions.includes(extension)) {
            const preservedName = data instanceof Map && data.get(file);
            const avatarFileName = await importCharacter(file, { preserveFileName: preservedName });
            if (avatarFileName !== undefined) {
                avatarFileNames.push(avatarFileName);
            }
        } else {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.warning(t`Unsupported file type: ` + file.name);
        }
    }

    if (avatarFileNames.length > 0) {
        await importCharactersTags(avatarFileNames);
        selectImportedChar(avatarFileNames[avatarFileNames.length - 1]);
    }
}

/**
 * Imports tags for the given characters
 * @param {string[]} avatarFileNames character avatar filenames whose tags are to import
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'avatarFileNames' implicitly has an 'any... Remove this comment to see the full error message
async function importCharactersTags(avatarFileNames) {
    await getCharacters();
    for (let i = 0; i < avatarFileNames.length; i++) {
        if (power_user.tag_import_setting !== tag_import_setting.NONE) {
            const importedCharacter = characters.find(character => character.avatar === avatarFileNames[i]);
            await importTags(importedCharacter);
        }
    }
}

/**
 * Selects the given imported char
 * @param {string} charId char to select
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'charId' implicitly has an 'any' type.
function selectImportedChar(charId) {
    let oldSelectedChar = null;
    if (this_chid !== undefined) {
        oldSelectedChar = characters[this_chid].avatar;
    }
    select_rm_info('char_import_no_toast', charId, oldSelectedChar);
}

/**
 * Imports a character from a file.
 * @param {File} file File to import
 * @param {object} [options] - Options
 * @param {string} [options.preserveFileName] Whether to preserve original file name
 * @param {boolean} [options.importTags] Whether to import tags
 * @returns {Promise<string>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'file' implicitly has an 'any' type.
async function importCharacter(file, { preserveFileName = '', importTags = false } = {}) {
    if (is_group_generating || is_send_press) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`Cannot import characters while generating. Stop the request and try again.`, t`Import aborted`);
        throw new Error('Cannot import character while generating');
    }

    const ext = file.name.match(/\.(\w+)$/);
    if (!ext || !(['json', 'png', 'yaml', 'yml', 'charx', 'byaf'].includes(ext[1].toLowerCase()))) {
        return;
    }

    const exists = preserveFileName ? characters.find(character => character.avatar === preserveFileName) : undefined;

    const format = ext[1].toLowerCase();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_import_file_type').val(format);
    const formData = new FormData();
    formData.append('avatar', file);
    formData.append('file_type', format);
    formData.append('user_name', name1);
    if (preserveFileName) formData.append('preserved_name', preserveFileName);

    try {
        const result = await fetch('/api/characters/import', {
            method: 'POST',
            body: formData,
            headers: getRequestHeaders({ omitContentType: true }),
            cache: 'no-cache',
        });

        if (!result.ok) {
            throw new Error(`Failed to import character: ${result.statusText}`);
        }

        const data = await result.json();

        if (data.error) {
            throw new Error(`Server returned an error: ${data.error}`);
        }

        if (data.file_name !== undefined) {
            const avatarFileName = `${data.file_name}.png`;

            // Refresh existing thumbnail
            if (exists && this_chid !== undefined) {
                await fetch(getThumbnailUrl('avatar', avatarFileName), { cache: 'reload' });
            }

            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#character_search_bar').val('').trigger('input');

            if (exists) {
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.success(t`Character Replaced: ${String(data.file_name).replace('.png', '')}`);
            } else {
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.success(t`Character Created: ${String(data.file_name).replace('.png', '')}`);
            }
            if (importTags) {
                await importCharactersTags([avatarFileName]);
                selectImportedChar(data.file_name);
            }
            return avatarFileName;
        }
    } catch (error) {
        console.error('Error importing character', error);
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`The file is likely invalid or corrupted.`, t`Could not import character`);
    }
}

/**
 *
 * @param items
 * @param files
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'items' implicitly has an 'any' type.
async function importFromURL(items, files) {
    for (const item of items) {
        if (item.type === 'text/uri-list') {
            const uriList = await new Promise((resolve) => {
                // @ts-expect-error TS(7006) FIXME: Parameter 'uriList' implicitly has an 'any' type.
                item.getAsString((uriList) => { resolve(uriList); });
            });
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            const uris = uriList.split('\n').filter(uri => uri.trim() !== '');
            try {
                for (const uri of uris) {
                    const request = await fetch(uri);
                    const data = await request.blob();
                    const fileName = request.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || uri.split('/').pop() || 'file.png';
                    const file = new File([data], fileName, { type: data.type });
                    files.push(file);
                }
            } catch (error) {
                console.error('Failed to import from URL', error);
            }
        }
    }
}

/**
 *
 * @param root0
 * @param root0.deleteCurrentChat
 */
export async function doNewChat({ deleteCurrentChat = false } = {}) {
    //Make a new chat for selected character
    if ((!selected_group && this_chid == undefined) || menu_type == 'create') {
        return;
    }

    //Fix it; New chat doesn't create while open create character menu
    await waitUntilCondition(() => !isChatSaving, debounce_timeout.extended, 10);
    await clearChat({ clearData: true });

    chat_file_for_del = getCurrentChatDetails()?.sessionName;

    // Make it easier to find in backups
    if (deleteCurrentChat) {
        await saveChatConditional();
    }

    if (selected_group) {
        await createNewGroupChat(selected_group);
        if (deleteCurrentChat) await deleteGroupChat(selected_group, chat_file_for_del, { jumpToNewChat: false }); // don't jump, new chat was already created and jumped to above
    } else {
        //RossAscends: added character name to new chat filenames and replaced Date.now() with humanizedDateTime;
        chat_metadata = {};
        characters[this_chid].chat = `${name2} - ${humanizedDateTime()}`;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#selected_chat_pole').val(characters[this_chid].chat);
        await getChat();
        await createOrEditCharacter(new CustomEvent('newChat'));
        if (deleteCurrentChat) await delChat(chat_file_for_del + '.jsonl');
    }
}

/**
 * Renames a group or character chat.
 * @param {object} param Parameters for renaming chat
 * @param {string} [param.characterId] Character ID to rename chat for
 * @param {string} [param.groupId] Group ID to rename chat for
 * @param {string} param.oldFileName Old name of the chat (no JSONL extension)
 * @param {string} param.newFileName New name for the chat (no JSONL extension)
 * @param {boolean} [param.loader] Whether to show loader during the operation
 */
// @ts-expect-error TS(7031) FIXME: Binding element 'characterId' implicitly has an 'a... Remove this comment to see the full error message
export async function renameGroupOrCharacterChat({ characterId, groupId, oldFileName, newFileName, loader: showLoader }) {
    const currentChatId = getCurrentChatId();
    const body = {
        is_group: !!groupId,
        avatar_url: characters[characterId]?.avatar,
        original_file: `${oldFileName}.jsonl`,
        renamed_file: `${newFileName.trim()}.jsonl`,
    };

    if (body.original_file === body.renamed_file) {
        console.debug('Chat rename cancelled, old and new names are the same');
        return;
    }
    if (equalsIgnoreCaseAndAccents(body.original_file, body.renamed_file)) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning(t`Name not accepted, as it is the same as before (ignoring case and accents).`, t`Rename Chat`);
        return;
    }

    const loaderHandle = showLoader ? loader.show({
        slug: 'chat-rename',
        title: t`Rename Chat`,
        message: t`Renaming chat…`,
        toastMode: loader.ToastMode.STATIC,
    }) : null;

    try {
        const response = await fetch('/api/chats/rename', {
            method: 'POST',
            body: JSON.stringify(body),
            headers: getRequestHeaders(),
        });

        if (!response.ok) {
            throw new Error('Unsuccessful request.');
        }

        const data = await response.json();

        if (data.error) {
            throw new Error('Server returned an error.');
        }

        if (data.sanitizedFileName) {
            newFileName = data.sanitizedFileName;
        }

        if (groupId) {
            await renameGroupChat(groupId, oldFileName, newFileName);
        } else if (characterId !== undefined && String(characterId) === String(this_chid) && characters[characterId]?.chat === oldFileName) {
            characters[characterId].chat = newFileName;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#selected_chat_pole').val(characters[characterId].chat);
            // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
            await createOrEditCharacter();
        }

        if (currentChatId) {
            await reloadCurrentChat();
        }

        const eventData = { avatarId: body.avatar_url, groupId, oldFileName: body.original_file, newFileName: body.renamed_file };
        await eventSource.emit(event_types.CHAT_RENAMED, eventData);
    } catch {
        await delay(500);
        await callGenericPopup('An error has occurred. Chat was not renamed.', POPUP_TYPE.TEXT);
    } finally {
        await loaderHandle?.hide();
    }
}

/**
 * Renames the currently selected chat.
 * @param {string} oldFileName Old name of the chat (no JSONL extension)
 * @param {string} newName New name for the chat (no JSONL extension)
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'oldFileName' implicitly has an 'any' ty... Remove this comment to see the full error message
export async function renameChat(oldFileName, newName) {
    return await renameGroupOrCharacterChat({
        characterId: this_chid,
        groupId: selected_group,
        oldFileName: oldFileName,
        newFileName: newName,
        loader: true,
    });
}

/**
 * Closes the current chat, clearing all associated data and resetting the UI.
 * If a message generation is in progress, it prompts the user to stop it first.
 * @returns {Promise<boolean>} True if the chat was successfully closed, false otherwise.
 */
export async function closeCurrentChat() {
    if (is_send_press == false) {
        await waitUntilCondition(() => !isChatSaving, debounce_timeout.extended, 10);
        await clearChat({ clearData: true });
        resetSelectedGroup();
        setCharacterId(undefined);
        setCharacterName('');
        setActiveCharacter(null);
        setActiveGroup(null);
        this_edit_mes_id = undefined;
        chat_metadata = {};
        selected_button = 'characters';
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#rm_button_selected_ch').children('h2').text('');
        select_rm_characters();
        await eventSource.emit(event_types.CHAT_CHANGED, getCurrentChatId());
        return true;
    } else {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info(t`Please stop the message generation first.`);
        return false;
    }
}

/**
 * Forces the update of the chat name for a remote character.
 * @param {string|number} characterId Character ID to update chat name for
 * @param {string} newName New name for the chat
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'characterId' implicitly has an 'any' ty... Remove this comment to see the full error message
export async function updateRemoteChatName(characterId, newName) {
    const character = characters[characterId];
    if (!character) {
        console.warn(`Character not found for ID: ${characterId}`);
        return;
    }
    character.chat = newName;
    const mergeRequest = {
        avatar: character.avatar,
        chat: newName,
    };
    const mergeResponse = await fetch('/api/characters/merge-attributes', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(mergeRequest),
    });
    if (!mergeResponse.ok) {
        console.error('Failed to save extension field', mergeResponse.statusText);
    }
}


/**
 *
 */
function doCharListDisplaySwitch() {
    power_user.charListGrid = !power_user.charListGrid;
    document.body.classList.toggle('charListGrid', power_user.charListGrid);
    saveSettingsDebounced();
}

/**
 * Function to handle the deletion of a character, given a specific popup type and character ID.
 * If popup type equals "del_ch", it will proceed with deletion otherwise it will exit the function.
 * It fetches the delete character route, sending necessary parameters, and in case of success,
 * it proceeds to delete character from UI and saves settings.
 * In case of error during the fetch request, it logs the error details.
 * @param {string} this_chid - The character ID to be deleted.
 * @param {boolean} delete_chats - Whether to delete chats or not.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'this_chid' implicitly has an 'any' type... Remove this comment to see the full error message
export async function handleDeleteCharacter(this_chid, delete_chats) {
    if (!characters[this_chid]) {
        return;
    }

    await deleteCharacter(characters[this_chid].avatar, { deleteChats: delete_chats });
}

/**
 * Deletes a character completely, including associated chats if specified
 * @param {string|string[]} characterKey - The key (avatar) of the character to be deleted
 * @param {object} [options] - Optional parameters for the deletion
 * @param {boolean} [options.deleteChats] - Whether to delete associated chats or not
 * @returns {Promise<boolean>} - A promise that resolves when the character is successfully deleted
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'characterKey' implicitly has an 'any' t... Remove this comment to see the full error message
export async function deleteCharacter(characterKey, { deleteChats = true } = {}) {
    if (!Array.isArray(characterKey)) {
        characterKey = [characterKey];
    }

    const inTempChat = this_chid === undefined && name2 === neutralCharacterName;
    if (inTempChat) {
        const confirmClose = await Popup.show.confirm(
            t`You are currently in a temporary chat.`,
            t`Deleting this character will close the chat and you will lose any unsaved messages. Do you want to proceed?`,
        );
        if (!confirmClose) {
            return false;
        }
    }

    const closeChatResult = await closeCurrentChat();
    if (!closeChatResult) {
        return false;
    }

    let deleted = false;

    for (const key of characterKey) {
        const character = characters.find(x => x.avatar == key);
        if (!character) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.warning(t`Character ${key} not found. Skipping deletion.`);
            continue;
        }

        const chid = characters.indexOf(character);
        // @ts-expect-error TS(2345) FIXME: Argument of type 'number' is not assignable to par... Remove this comment to see the full error message
        const pastChats = await getPastCharacterChats(chid);

        const msg = { avatar_url: character.avatar, delete_chats: deleteChats };

        const response = await fetch('/api/characters/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(msg),
            cache: 'no-cache',
        });

        if (!response.ok) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(`${response.status} ${response.statusText}`, t`Failed to delete character`);
            continue;
        }

        accountStorage.removeItem(`AlertWI_${character.avatar}`);
        accountStorage.removeItem(`AlertRegex_${character.avatar}`);
        accountStorage.removeItem(`mediaWarningShown:${character.avatar}`);
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        delete tag_map[character.avatar];
        select_rm_info('char_delete', character.name);

        if (deleteChats) {
            for (const chat of pastChats) {
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                const name = chat.file_name.replace('.jsonl', '');
                await eventSource.emit(event_types.CHAT_DELETED, name);
            }
        }

        await eventSource.emit(event_types.CHARACTER_DELETED, { id: chid, character: character });
        deleted = true;
    }

    await removeCharacterFromUI();
    return deleted;
}

/**
 * Function to delete a character from UI after character deletion API success.
 * It manages necessary UI changes such as closing advanced editing popup, unsetting
 * character ID, resetting characters array and chat metadata, deselecting character's tab
 * panel, removing character name from navigation tabs, clearing chat, fetching updated list of characters.
 * It also ensures to save the settings after all the operations.
 */
async function removeCharacterFromUI() {
    preserveNeutralChat();
    await clearChat();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_cross').trigger('click');
    resetChatState();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document.getElementById('rm_button_selected_ch')).children('h2').text('');
    restoreNeutralChat();
    await getCharacters();
    await printMessages();
    saveSettingsDebounced();
    await eventSource.emit(event_types.CHAT_CHANGED, getCurrentChatId());
}

/**
 * Creates a new assistant chat.
 * @param {object} params - Parameters for the new assistant chat
 * @param {boolean} [params.temporary] I need a temporary secretary
 * @returns {Promise<void>} - A promise that resolves when the new assistant chat is created
 */
export async function newAssistantChat({ temporary = false } = {}) {
    await clearChat();
    if (!temporary) {
        return openPermanentAssistantChat();
    }
    chat.splice(0, chat.length);
    chat_metadata = {};
    setCharacterName(neutralCharacterName);
    // @ts-expect-error TS(2554) FIXME: Expected 2-3 arguments, but got 1.
    sendSystemMessage(system_message_types.ASSISTANT_NOTE);
}

/**
 * Event handler to open a navbar drawer when a drawer open button is clicked.
 * Handles click events on .drawer-opener elements.
 * Opens the drawer associated with the clicked button according to the data-target attribute.
 * @returns {void}
 */
function doDrawerOpenClick() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const targetDrawerID = $(this).attr('data-target');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const drawer = $(`#${targetDrawerID}`);
    const drawerToggle = drawer.find('.drawer-toggle');
    const drawerWasOpenAlready = drawerToggle.parent().find('.drawer-content').hasClass('openDrawer');
    if (drawerWasOpenAlready || drawer.hasClass('resizing')) { return; }
    doNavbarIconClick.call(drawerToggle);
}

/**
 * Event handler to open or close a navbar drawer when a navbar icon is clicked.
 * Handles click events on .drawer-toggle elements.
 * @returns {Promise<void>}
 */
export async function doNavbarIconClick() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const icon = $(this).find('.drawer-icon');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const drawer = $(this).parent().find('.drawer-content');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const drawerWasOpenAlready = $(this).parent().find('.drawer-content').hasClass('openDrawer');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const targetDrawerID = $(this).parent().find('.drawer-content').attr('id');

    if (!drawerWasOpenAlready) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const $openDrawers = $('.openDrawer:not(.pinnedOpen)');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const $openIcons = $('.openIcon:not(.drawerPinnedOpen)');
        for (const iconEl of $openIcons) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(iconEl).toggleClass('closedIcon openIcon');
        }
        for (const el of $openDrawers) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(el).toggleClass('closedDrawer openDrawer');
        }
        if ($openDrawers.length && animation_duration) {
            await delay(animation_duration);
        }
        icon.toggleClass('openIcon closedIcon');
        drawer.toggleClass('openDrawer closedDrawer');

        if (targetDrawerID === 'right-nav-panel') {
            favsToHotswap();
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#rm_print_characters_block').trigger('scroll');
        }

        // Set the height of "autoSetHeight" textareas within the drawer to their scroll height
        if (!CSS.supports('field-sizing', 'content')) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const textareas = $(this).closest('.drawer').find('.drawer-content textarea.autoSetHeight');
            for (const textarea of textareas) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                await resetScrollHeight($(textarea));
            }
        }
    } else if (drawerWasOpenAlready) {
        icon.toggleClass('closedIcon openIcon');
        drawer.toggleClass('closedDrawer openDrawer');
    }
}

/**
 *
 */
function addDebugFunctions() {
    const doBackfill = async () => {
        for (const message of chat) {
            // System messages are not counted
            // @ts-expect-error TS(2339) FIXME: Property 'is_system' does not exist on type 'never... Remove this comment to see the full error message
            if (message.is_system) {
                continue;
            }

            // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
            if (!message.extra) {
                // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
                message.extra = {};
            }

            // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
            const tokenCountText = (message?.extra?.reasoning || '') + message.mes;
            // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
            message.extra.token_count = await getTokenCountAsync(tokenCountText, 0);
        }

        await saveChatConditional();
        await reloadCurrentChat();
    };

    registerDebugFunction('forceOnboarding', 'Force onboarding', 'Forces the onboarding process to restart.', async () => {
        firstRun = true;
        await saveSettings();
        location.reload();
    });

    registerDebugFunction('backfillTokenCounts', 'Backfill token counters',
        `Recalculates token counts of all messages in the current chat to refresh the counters.
        Useful when you switch between models that have different tokenizers.
        This is a visual change only. Your chat will be reloaded.`, doBackfill);

    registerDebugFunction('generationTest', 'Send a generation request', 'Generates text using the currently selected API.', async () => {
        const text = prompt('Input text:', 'Hello');
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info('Working on it...');
        // @ts-expect-error TS(2322) FIXME: Type 'string | null' is not assignable to type 'st... Remove this comment to see the full error message
        const message = await generateRaw({ prompt: text });
        alert(message);
    });
    registerDebugFunction('toggleEventTracing', 'Toggle event tracing', 'Useful to see what triggered a certain event.', () => {
        localStorage.setItem('eventTracing', localStorage.getItem('eventTracing') === 'true' ? 'false' : 'true');
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info('Event tracing is now ' + (localStorage.getItem('eventTracing') === 'true' ? 'enabled' : 'disabled'));
    });

    registerDebugFunction('toggleRegenerateWarning', 'Toggle Ctrl+Enter regeneration confirmation', 'Toggle the warning when regenerating a message with a Ctrl+Enter hotkey.', () => {
        accountStorage.setItem('RegenerateWithCtrlEnter', accountStorage.getItem('RegenerateWithCtrlEnter') === 'true' ? 'false' : 'true');
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info('Regenerate warning is now ' + (accountStorage.getItem('RegenerateWithCtrlEnter') === 'true' ? 'disabled' : 'enabled'));
    });

    registerDebugFunction('copySetup', 'Copy ST setup to clipboard [WIP]', 'Useful data when reporting bugs', async () => {
        const getContextContents = getContext();
        const getSettingsContents = settings;
        //console.log(getSettingsContents);
        const logMessage = `
\`\`\`
API: ${getSettingsContents.main_api}
API Type: ${getSettingsContents[getSettingsContents.main_api + '_settings'].type}
API server: ${getSettingsContents.api_server}
Model: ${getContextContents.onlineStatus}
Context Template: ${power_user.context.preset}
Instruct Template: ${power_user.instruct.preset}
API Settings: ${JSON.stringify(getSettingsContents[getSettingsContents.main_api + '_settings'], null, 2)}
\`\`\`
    `;

        //console.log(getSettingsContents)
        //console.log(logMessage);

        try {
            await copyText(logMessage);
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.info('Your ST API setup data has been copied to the clipboard.');
        } catch (error) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error('Failed to copy ST Setup to clipboard:', error);
        }
    });
}

/**
 *
 */
function initCharacterSearch() {
    // @ts-expect-error TS(7006) FIXME: Parameter 'searchQuery' implicitly has an 'any' ty... Remove this comment to see the full error message
    const debouncedCharacterSearch = debounce((searchQuery) => {
        entitiesFilter.setFilterData(FILTER_TYPES.SEARCH, searchQuery);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const searchForm = $('#form_character_search_form');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const searchInput = $('#character_search_bar');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const searchButton = $('#rm_button_search');

    const storageKey = 'characterSearchFormVisible';

    searchInput.on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const searchQuery = String($(this).val());
        debouncedCharacterSearch(searchQuery);
    });

    searchButton.on('click', function () {
        const newVisibility = !searchForm.is(':visible');
        searchForm.toggle(newVisibility);
        searchButton.toggleClass('active', newVisibility);
        accountStorage.setItem(storageKey, String(newVisibility));
        if (newVisibility) {
            searchInput.trigger('focus');
        }
    });

    eventSource.on(event_types.APP_READY, () => {
        const isVisible = accountStorage.getItem(storageKey) === 'true';
        searchForm.toggle(isVisible);
        searchButton.toggleClass('active', isVisible);
    });
}

// MARK: DOM Handlers Start
// @ts-expect-error TS(2304) FIXME: Cannot find name 'jQuery'.
jQuery(async function () {
    setTimeout(function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#groupControlsToggle').trigger('click');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#groupCurrentMemberListToggle .inline-drawer-icon').trigger('click');
    }, 200);

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.api_loading', () => cancelStatusCheck('Canceled because connecting was manually canceled'));

    //////////INPUT BAR FOCUS-KEEPING LOGIC/////////////
    let S_TAPreviouslyFocused = false;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#send_textarea').on('focusin focus click', () => {
        S_TAPreviouslyFocused = true;
    });
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#send_but, #option_regenerate, #option_continue, #mes_continue, #mes_impersonate').on('click', () => {
        if (S_TAPreviouslyFocused) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#send_textarea').trigger('focus');
        }
    });
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', event => {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        if ($(':focus').attr('id') !== 'send_textarea') {
            const validIDs = ['options_button', 'send_but', 'mes_impersonate', 'mes_continue', 'send_textarea', 'option_regenerate', 'option_continue'];
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            if (!validIDs.includes($(event.target).attr('id'))) {
                S_TAPreviouslyFocused = false;
            }
        } else {
            S_TAPreviouslyFocused = true;
        }
    });

    /////////////////

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#swipes-checkbox').on('change', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        swipes = !!$('#swipes-checkbox').prop('checked');
        if (swipes) {
            //console.log('toggle change calling showswipebtns');
            showSwipeButtons();
        } else {
            hideSwipeButtons();
        }
        saveSettingsDebounced();
    });

    ///// SWIPE BUTTON CLICKS ///////

    //limit swiping to only last message clicks
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.last_mes .swipe_right', async (e, data) => await swipe(e, SWIPE_DIRECTION.RIGHT, data));
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.last_mes .swipe_left', async (e, data) => await swipe(e, SWIPE_DIRECTION.LEFT, data));

    initCharacterSearch();

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#mes_impersonate').on('click', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#option_impersonate').trigger('click');
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#mes_continue').on('click', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#option_continue').trigger('click');
    });

    const userInputGenerateMutex = new SimpleMutex(sendTextareaMessage);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#send_but').on('click', async function () {
        await userInputGenerateMutex.update();
    });

    //menu buttons setup

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#rm_button_settings').on('click', function () {
        selected_button = 'settings';
        selectRightMenuWithAnimation('rm_api_block');
    });
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#rm_button_characters').on('click', function () {
        selected_button = 'characters';
        select_rm_characters();
    });
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#rm_button_back').on('click', function () {
        selected_button = 'characters';
        select_rm_characters();
    });
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#rm_button_create').on('click', function () {
        selected_button = 'create';
        select_rm_create();
    });
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#rm_button_selected_ch').on('click', function () {
        if (selected_group) {
            select_group_chats(selected_group, false);
        } else {
            selected_button = 'character_edit';
            select_selected_character(this_chid);
        }
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#character_search_bar').val('').trigger('input');
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.character_select', async function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const id = Number($(this).attr('data-chid'));
        await selectCharacterById(id);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.bogus_folder_select', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const tagId = $(this).attr('tagid');
        console.debug('Bogus folder clicked', tagId);
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        chooseBogusFolder($(this), tagId);
    });

    const cssAutofit = CSS.supports('field-sizing', 'content');
    if (!cssAutofit) {
        /**
         * Sets the scroll height of the edit textarea to fit the content.
         * @param {HTMLTextAreaElement} e Textarea element to auto-fit
         */
        // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
        function autoFitEditTextArea(e) {
            const scrollTop = chatElement.scrollTop();
            e.style.height = '0px';
            const newHeight = e.scrollHeight + 4;
            e.style.height = `${newHeight}px`;
            chatElement.scrollTop(scrollTop);
        }
        const autoFitEditTextAreaDebounced = debounce(autoFitEditTextArea, debounce_timeout.short);
        document.addEventListener('input', e => {
            if (e.target instanceof HTMLTextAreaElement && e.target.classList.contains('edit_textarea')) {
                const scrollbarShown = e.target.clientWidth < e.target.offsetWidth && e.target.offsetHeight >= window.innerHeight * 0.75;
                const immediately = (e.target.scrollHeight > e.target.offsetHeight && !scrollbarShown) || e.target.value === '';
                if (immediately) autoFitEditTextArea(e.target);
                else autoFitEditTextAreaDebounced(e.target);
            }
        });
    }

    const chatElementScroll = document.getElementById('chat');
    const chatScrollHandler = function () {
        if (power_user.waifuMode) {
            scrollLock = true;
            return;
        }

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const scrollIsAtBottom = Math.abs(chatElementScroll.scrollHeight - chatElementScroll.clientHeight - chatElementScroll.scrollTop) < 5;

        // Resume autoscroll if the user scrolls to the bottom
        if (scrollLock && scrollIsAtBottom) {
            scrollLock = false;
        }

        // Cancel autoscroll if the user scrolls up
        if (!scrollLock && !scrollIsAtBottom) {
            scrollLock = true;
        }
    };
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    chatElementScroll.addEventListener('scroll', chatScrollHandler, { passive: true });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.mes', function () {
        //when a 'delete message' parent div is clicked
        // and we are in delete mode and del_checkbox is visible
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        if (!is_delete_mode || !$(this).children('.del_checkbox').is(':visible')) {
            return;
        }
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('.mes').children('.del_checkbox').each(function () {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(this).prop('checked', false);
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(this).parent().removeClass('selected');
        });
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $(this).addClass('selected'); //sets the bg of the mes selected for deletion
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        let i = Number($(this).attr('mesid')); //checks the message ID in the chat
        this_del_mes = i;
        //as long as the current message ID is less than the total chat length
        while (i < chat.length) {
            //sets the bg of the all msgs BELOW the selected .mes
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(`.mes[mesid="${i}"]`).addClass('selected');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(`.mes[mesid="${i}"]`).children('.del_checkbox').prop('checked', true);
            i++;
        }
    });

    /**
     * Handles the deletion of a chat file, including group chats.
     * @param {string} chatFile - The name of the chat file to delete.
     * @param {object} group - The group object if the chat is part of a group.
     * @param {boolean} [fromSlashCommand] - Whether the deletion was triggered from a slash command.
     * @returns {Promise<void>}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'chatFile' implicitly has an 'any' type.
    async function handleDeleteChat(chatFile, group, fromSlashCommand = false) {
        // Close past chat popup.
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#select_chat_cross').trigger('click');

        const loaderHandle = loader.show({
            slug: 'chat-delete',
            title: t`Delete Chat`,
            message: t`Deleting chat…`,
            toastMode: loader.ToastMode.STATIC,
        });

        try {
            if (group) {
                await deleteGroupChat(group, chatFile);
            } else {
                await delChat(`${chatFile}.jsonl`);
            }
        } catch (error) {
            loaderHandle.hide();
            throw error;
        }

        if (fromSlashCommand) {  // When called from `/delchat` command, don't re-open the history view.
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#options').hide();  // Hide option popup menu.
            await loaderHandle.hide();
        } else {  // Open the history view again after 2 seconds (delay to avoid edge cases for deleting last chat).
            setTimeout(async function () {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#option_select_chat').trigger('click');
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#options').hide();  // Hide option popup menu.
                await loaderHandle.hide();
            }, 2000);
        }
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.PastChat_cross', async function (e, { fromSlashCommand = false } = {}) {
        e.stopPropagation();
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const deleteFileName = $(this).attr('file_name');
        console.debug('detected cross click for' + deleteFileName);

        // Skip confirmation if called from a slash command.
        if (fromSlashCommand) {
            await handleDeleteChat(deleteFileName, selected_group, true);
            return;
        }

        const result = await callGenericPopup('<h3>' + t`Delete the Chat File?` + '</h3>', POPUP_TYPE.CONFIRM);
        if (result === POPUP_RESULT.AFFIRMATIVE) {
            await handleDeleteChat(deleteFileName, selected_group, false);
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#advanced_div').on('click', function () {
        if (!is_advanced_char_open) {
            is_advanced_char_open = true;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#character_popup').css({ 'display': 'flex', 'opacity': 0.0 }).addClass('open');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#character_popup').transition({
                opacity: 1.0,
                duration: animation_duration,
                easing: animation_easing,
            });
        } else {
            is_advanced_char_open = false;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#character_popup').css('display', 'none').removeClass('open');
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_cross').on('click', function () {
        is_advanced_char_open = false;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#character_popup').transition({
            opacity: 0,
            duration: animation_duration,
            easing: animation_easing,
        });
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        setTimeout(function () { $('#character_popup').css('display', 'none'); }, animation_duration);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_popup_ok').on('click', function () {
        is_advanced_char_open = false;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#character_popup').css('display', 'none');
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#dialogue_popup_ok').on('click', async function (_e) {
        dialogueCloseStop = false;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#shadow_popup').transition({
            opacity: 0,
            duration: animation_duration,
            easing: animation_easing,
        });
        setTimeout(function () {
            if (dialogueCloseStop) return;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#shadow_popup').css('display', 'none');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#dialogue_popup').removeClass('large_dialogue_popup');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#dialogue_popup').removeClass('wide_dialogue_popup');
        }, animation_duration);

        // @ts-expect-error TS(7005) FIXME: Variable 'dialogueResolve' implicitly has an 'any'... Remove this comment to see the full error message
        if (dialogueResolve) {
            if (popup_type == 'input') {
                // @ts-expect-error TS(7005) FIXME: Variable 'dialogueResolve' implicitly has an 'any'... Remove this comment to see the full error message
                dialogueResolve($('#dialogue_popup_input').val());
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#dialogue_popup_input').val('');
            } else {
                dialogueResolve(true);
            }

            dialogueResolve = null;
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#dialogue_popup_cancel').on('click', function (e) {
        dialogueCloseStop = false;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#shadow_popup').transition({
            opacity: 0,
            duration: animation_duration,
            easing: animation_easing,
        });
        setTimeout(function () {
            if (dialogueCloseStop) return;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#shadow_popup').css('display', 'none');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#dialogue_popup').removeClass('large_dialogue_popup');
        }, animation_duration);

        popup_type = '';

        // @ts-expect-error TS(7005) FIXME: Variable 'dialogueResolve' implicitly has an 'any'... Remove this comment to see the full error message
        if (dialogueResolve) {
            dialogueResolve(false);
            dialogueResolve = null;
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#add_avatar_button').on('change', function (this: HTMLInputElement) {
        read_avatar_load(this);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#form_create').on('submit', (e) => createOrEditCharacter(e.originalEvent));

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#delete_button').on('click', async function () {
        if (this_chid === undefined || !characters[this_chid]) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.warning('No character selected.');
            return;
        }

        let deleteChats = false;

        const confirm = await Popup.show.confirm(t`Delete the character?`, await renderTemplateAsync('deleteConfirm'), {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            onClose: () => { deleteChats = !!$('#del_char_checkbox').prop('checked'); },
        });
        if (!confirm) {
            return;
        }

        await deleteCharacter(characters[this_chid].avatar, { deleteChats: deleteChats });
    });

    //////// OPTIMIZED ALL CHAR CREATION/EDITING TEXTAREA LISTENERS ///////////////

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_name_pole').on('input', function () {
        if (menu_type == 'create') {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            create_save.name = String($('#character_name_pole').val());
        }
    });

    const elementsToUpdate = {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        '#description_textarea': function () { create_save.description = String($('#description_textarea').val()); },
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        '#creator_notes_textarea': function () { create_save.creator_notes = String($('#creator_notes_textarea').val()); },
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        '#character_version_textarea': function () { create_save.character_version = String($('#character_version_textarea').val()); },
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        '#system_prompt_textarea': function () { create_save.system_prompt = String($('#system_prompt_textarea').val()); },
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        '#post_history_instructions_textarea': function () { create_save.post_history_instructions = String($('#post_history_instructions_textarea').val()); },
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        '#creator_textarea': function () { create_save.creator = String($('#creator_textarea').val()); },
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        '#tags_textarea': function () { create_save.tags = String($('#tags_textarea').val()); },
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        '#personality_textarea': function () { create_save.personality = String($('#personality_textarea').val()); },
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        '#scenario_pole': function () { create_save.scenario = String($('#scenario_pole').val()); },
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        '#mes_example_textarea': function () { create_save.mes_example = String($('#mes_example_textarea').val()); },
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        '#firstmessage_textarea': function () { create_save.first_message = String($('#firstmessage_textarea').val()); },
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        '#talkativeness_slider': function () { create_save.talkativeness = Number($('#talkativeness_slider').val()); },
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        '#depth_prompt_prompt': function () { create_save.depth_prompt_prompt = String($('#depth_prompt_prompt').val()); },
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        '#depth_prompt_depth': function () { create_save.depth_prompt_depth = Number($('#depth_prompt_depth').val()); },
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        '#depth_prompt_role': function () { create_save.depth_prompt_role = String($('#depth_prompt_role').val()); },
    };

    Object.keys(elementsToUpdate).forEach(function (id) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $(id).on('input', function () {
            if (menu_type == 'create') {
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                elementsToUpdate[id]();
            } else {
                saveCharacterDebounced();
            }
        });
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#creator_notes_textarea').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const notes = String($('#creator_notes_textarea').val());
        const avatar = menu_type === 'create' ? '' : characters[this_chid]?.avatar;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#creator_notes_spoiler').html(formatCreatorNotes(notes, avatar));
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#favorite_button').on('click', function () {
        updateFavButtonState(!fav_ch_checked);
        if (menu_type != 'create') {
            saveCharacterDebounced();
        }
    });

    /* $("#renameCharButton").on('click', renameCharacter); */

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.renameChatButton', async function (e) {
        e.stopPropagation();
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const oldFileName = $(this).closest('.select_chat_block_wrapper').find('.select_chat_block_filename').text();

        const popupText = await renderTemplateAsync('chatRename');
        const newName = await callGenericPopup(popupText, POPUP_TYPE.INPUT, oldFileName);

        if (!newName || typeof newName !== 'string' || newName == oldFileName) {
            console.log('no new name found, aborting');
            return;
        }

        await renameChat(oldFileName, newName);

        await delay(250);
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#option_select_chat').trigger('click');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#options').hide();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.exportChatButton, .exportRawChatButton', async function (e) {
        e.stopPropagation();
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const format = $(this).data('format') || 'txt';
        await saveChatConditional();
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const filename = $(this).closest('.select_chat_block_wrapper').find('.select_chat_block_filename').text();
        console.log(`exporting ${filename} in ${format} format`);

        const body = {
            is_group: !!selected_group,
            avatar_url: characters[this_chid]?.avatar,
            file: `${filename}.jsonl`,
            exportfilename: `${filename}.${format}`,
            format: format,
        };
        console.log(body);
        try {
            const response = await fetch('/api/chats/export', {
                method: 'POST',
                body: JSON.stringify(body),
                headers: getRequestHeaders(),
            });
            const data = await response.json();
            if (!response.ok) {
                // display error message
                console.log(data.message);
                await delay(250);
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.error(`Error: ${data.message}`);
                return;
            } else {
                const mimeType = format == 'txt' ? 'text/plain' : 'application/octet-stream';
                // success, handle response data
                console.log(data);
                await delay(250);
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.success(data.message);
                download(data.result, body.exportfilename, mimeType);
            }
        } catch (error) {
            // display error message
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            console.log(`An error has occurred: ${error.message}`);
            await delay(250);
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(`Error: ${error.message}`);
        }
    });


    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const button = $('#options_button');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const menu = $('#options');
    /**
     *
     */
    function showMenu() {
        showBookmarksButtons();
        menu[0].showPopover();
    }

    /**
     *
     */
    function hideMenu() {
        menu[0].hidePopover();
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
    button.on('pointerdown mousedown', function (e) {
        e.stopPropagation();
    }).on('click', function () {
        if (menu[0].matches(':popover-open')) {
            hideMenu();
        } else {
            // Close the other popover before opening this one
            const extensionsMenu = document.getElementById('extensionsMenu');
            if (extensionsMenu?.matches(':popover-open')) {
                extensionsMenu.hidePopover();
            }
            showMenu();
        }
    });

    // Close #options or #extensionsMenu when clicking outside (manual popovers don't have light dismiss)
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('mousedown', function (e) {
        const target = e.target;
        const options = document.getElementById('options');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        if (options?.matches(':popover-open') && !$(target).closest('#options, #options_button').length) {
            options.hidePopover();
        }
        const extensionsMenu = document.getElementById('extensionsMenu');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        if (extensionsMenu?.matches(':popover-open') && !$(target).closest('#extensionsMenu, #extensionsMenuButton').length) {
            extensionsMenu.hidePopover();
        }
    });

    /* $('#set_chat_character_settings').on('click', setScenarioOverride); */

    ///////////// OPTIMIZED LISTENERS FOR LEFT SIDE OPTIONS POPUP MENU //////////////////////
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#options [id]').on('click', async function (event, customData) {
        const fromSlashCommand = customData?.fromSlashCommand || false;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const id = $(this).attr('id');

        // Check whether a custom prompt was provided via custom data (for example through a slash command)
        const additionalPrompt = customData?.additionalPrompt?.trim() || undefined;
        const buildOrFillAdditionalArgs = (args = {}) => ({
            ...args,
            ...(additionalPrompt !== undefined && { quiet_prompt: additionalPrompt, quietToLoud: true }),
        });

        if (id == 'option_select_chat') {
            if (this_chid === undefined && !is_send_press && !selected_group) {
                await openPermanentAssistantCard();
            }
            if ((selected_group && !is_group_generating) || (this_chid !== undefined && !is_send_press) || fromSlashCommand) {
                await displayPastChats();
                //this is just to avoid the shadow for past chat view when using /delchat
                //however, the dialog popup still gets one..
                if (!fromSlashCommand) {
                    console.log('displaying shadow');
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $('#shadow_select_chat_popup').css('display', 'block');
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $('#shadow_select_chat_popup').css('opacity', 0.0);
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $('#shadow_select_chat_popup').transition({
                        opacity: 1.0,
                        duration: animation_duration,
                        easing: animation_easing,
                    });
                }
            }
        } else if (id == 'option_start_new_chat') {
            if ((selected_group || this_chid !== undefined) && !is_send_press) {
                let deleteCurrentChat = false;
                const result = await Popup.show.confirm(t`Start new chat?`, await renderTemplateAsync('newChatConfirm'), {
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    onClose: () => { deleteCurrentChat = !!$('#del_chat_checkbox').prop('checked'); },
                });
                if (!result) {
                    return;
                }

                await doNewChat({ deleteCurrentChat: deleteCurrentChat });
            }
            if (!selected_group && this_chid === undefined && !is_send_press) {
                const alreadyInTempChat = this_chid === undefined && name2 === neutralCharacterName;
                await newAssistantChat({ temporary: alreadyInTempChat });
            }
        } else if (id == 'option_regenerate') {
            //Attempting to regenerate a user message will instead generate a new message.
            // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
            if (chat.length && chat.length - 1 === this_edit_mes_id && chat[this_edit_mes_id]?.is_user == false) {
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.warning(t`Finish the edit before starting a generation.`, t`You cannot regenerate the message you are editing.`);
                return;
            }
            if (is_send_press == false) {
                if (selected_group) {
                    regenerateGroup();
                } else {
                    is_send_press = true;
                    Generate('regenerate', buildOrFillAdditionalArgs());
                }
            }
        } else if (id == 'option_impersonate') {
            if (is_send_press == false || fromSlashCommand) {
                is_send_press = true;
                Generate('impersonate', buildOrFillAdditionalArgs());
            }
        } else if (id == 'option_continue') {
            if (swipeState == SWIPE_STATE.EDITING) {
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.warning(t`Confirm the edit to start a generation.`, t`You cannot send a message during a swipe-edit.`);
                return;
            }
            // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
            if (chat.length && chat.length - 1 === this_edit_mes_id) {
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.warning(t`Finish the edit before starting a generation.`, t`You cannot continue the message you are editing.`);
                return;
            }

            if (is_send_press == false || fromSlashCommand) {
                is_send_press = true;
                Generate('continue', buildOrFillAdditionalArgs());
            }
        } else if (id == 'option_delete_mes') {
            setTimeout(() => openMessageDelete(fromSlashCommand), animation_duration);
        } else if (id == 'option_close_chat') {
            await closeCurrentChat();
        } else if (id === 'option_settings') {
            //var checkBox = document.getElementById("waifuMode");
            const topBar = document.getElementById('top-bar');
            const topSettingsHolder = document.getElementById('top-settings-holder');
            const divchat = document.getElementById('chat');

            //if (checkBox.checked) {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            if (topBar.style.display === 'none') {
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                topBar.style.display = ''; // or "inline-block" if that's the original display value
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                topSettingsHolder.style.display = ''; // or "inline-block" if that's the original display value

                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                divchat.style.borderRadius = '';
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                divchat.style.backgroundColor = '';
            } else {
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                divchat.style.borderRadius = '10px'; // Adjust the value to control the roundness of the corners
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                divchat.style.backgroundColor = ''; // Set the background color to your preference

                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                topBar.style.display = 'none';
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                topSettingsHolder.style.display = 'none';
            }
            //}
        }
        menu[0].hidePopover();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#newChatFromManageScreenButton').on('click', async function () {
        await doNewChat({ deleteCurrentChat: false });
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#select_chat_cross').trigger('click');
    });

    //////////////////////////////////////////////////////////////////////////////////////////////

    //functionality for the cancel delete messages button, reverts to normal display of input form
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#dialogue_del_mes_cancel').on('click', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#dialogue_del_mes').css('display', 'none');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#send_form').css('display', css_send_form_display);
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('.del_checkbox').each(function () {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(this).css('display', 'none');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(this).parent().children('.for_checkbox').css('display', 'block');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(this).parent().removeClass('selected');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(this).prop('checked', false);
        });
        showSwipeButtons();
        this_del_mes = -1;
        is_delete_mode = false;
    });

    //confirms message deletion with the "ok" button
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#dialogue_del_mes_ok').on('click', async function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#dialogue_del_mes').css('display', 'none');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#send_form').css('display', css_send_form_display);
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('.del_checkbox').each(function () {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(this).css('display', 'none');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(this).parent().children('.for_checkbox').css('display', 'block');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(this).parent().removeClass('selected');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(this).prop('checked', false);
        });

        if (this_del_mes >= 0) {
            for (let i = (chat.length - 1); i >= this_del_mes; i--) {
                deleteItemizedPromptForMessage(i);
            }
            const mesEl = chatElement[0].querySelector(`.mes[mesid="${this_del_mes}"]`);
            if (mesEl) {
                let sibling = mesEl.nextElementSibling;
                while (sibling) {
                    const next = sibling.nextElementSibling;
                    if (sibling.tagName === 'DIV') sibling.remove();
                    sibling = next;
                }
                mesEl.remove();
            }
            chat.length = this_del_mes;
            chat_metadata.tainted = true;
            await saveChatConditional();
            chatElement.scrollTop(chatElement[0].scrollHeight);
            await eventSource.emit(event_types.MESSAGE_DELETED, chat.length);
            chatElement.find('.mes').removeClass('last_mes');
            chatElement.find('.mes').last().addClass('last_mes');
        } else {
            console.log('this_del_mes is not >= 0, not deleting');
        }

        showSwipeButtons();
        this_del_mes = -1;
        is_delete_mode = false;
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#main_api').on('change', async function () {
        cancelStatusCheck('Canceled because main api changed');
        changeMainAPI();
        saveSettingsDebounced();
        await eventSource.emit(event_types.MAIN_API_CHANGED, { apiId: main_api });
    });

    ////////////////// OPTIMIZED RANGE SLIDER LISTENERS////////////////

    let sliderLocked = true;
    let sliderTimer;

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('input[type=\'range\']').on('touchstart', function () {
        // Unlock the slider after 300ms
        setTimeout(function () {
            sliderLocked = false;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(this).css('background-color', 'var(--SmartThemeQuoteColor)');
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        }.bind(this), 300);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('input[type=\'range\']').on('touchend', function () {
        clearTimeout(sliderTimer);
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $(this).css('background-color', '');
        sliderLocked = true;
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('input[type=\'range\']').on('touchmove', function (event) {
        if (sliderLocked) {
            event.preventDefault();
        }
    });

    const sliders = [
        {
            sliderId: '#amount_gen',
            counterId: '#amount_gen_counter',
            // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
            format: (val) => `${val}`,
            // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
            setValue: (val) => { amount_gen = Number(val); },
        },
        {
            sliderId: '#max_context',
            counterId: '#max_context_counter',
            // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
            format: (val) => `${val}`,
            // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
            setValue: (val) => { max_context = Number(val); },
        },
    ];

    sliders.forEach(slider => {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $(document).on('input', slider.sliderId, function () {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const value = $(this).val();
            const formattedValue = slider.format(value);
            slider.setValue(value);
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(slider.counterId).val(formattedValue);
            saveSettingsDebounced();
        });
    });

    //////////////////////////////////////////////////////////////

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#select_chat_cross').on('click', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#shadow_select_chat_popup').transition({
            opacity: 0,
            duration: animation_duration,
            easing: animation_easing,
        });
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        setTimeout(function () { $('#shadow_select_chat_popup').css('display', 'none'); }, animation_duration);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('pointerup', '.mes_copy', async function () {
        if (this_chid !== undefined || selected_group || name2 === neutralCharacterName) {
            try {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                const messageId = $(this).closest('.mes').attr('mesid');
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                const text = chat[messageId].mes;
                await copyText(text);
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.info('Copied!', '', { timeOut: 2000 });
            } catch (err) {
                console.error('Failed to copy: ', err);
            }
        }
    });

    //********************
    //***Message Editor***
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.mes_edit', async function () {
        if (is_delete_mode) {
            return;
        }
        if (this_chid !== undefined || selected_group || name2 === neutralCharacterName) {
            // Previously system messages we're allowed to be edited
            /*const message = $(this).closest(".mes");

            if (message.data("isSystem")) {
                return;
            }*/

            // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
            if (this_edit_mes_id >= 0) {
                // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
                const mes_edited = chatElement.find(`[mesid="${this_edit_mes_id}"]`).find('.mes_edit_done');
                // @ts-expect-error TS(2448) FIXME: Block-scoped variable 'edit_mes_id' used before it... Remove this comment to see the full error message
                if (Number(edit_mes_id) == chat.length - 1) { //if the generating swipe (...)
                    let run_edit = true;
                    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                    if (chat[edit_mes_id].swipe_id !== undefined) {
                        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                        if (chat[edit_mes_id].swipes.length === chat[edit_mes_id].swipe_id) {
                            run_edit = false;
                        }
                    }
                    if (run_edit) {
                        hideSwipeButtons();
                    }
                }
                await messageEditDone(mes_edited);
            }
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const edit_mes_id = Number($(this).closest('.mes').attr('mesid'));

            await messageEdit(edit_mes_id);
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('input', '#curEditTextarea', function () {
        if (power_user.auto_save_msg_edits === true) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            messageEditAuto($(this));
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.extraMesButtonsHint', function (e) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const $hint = $(e.target);
        const $buttons = $hint.siblings('.extraMesButtons');

        $hint.transition({
            opacity: 0,
            duration: animation_duration,
            easing: animation_easing,
            complete: function () {
                $hint.hide();
                $buttons
                    .addClass('visible')
                    .css({
                        opacity: 0,
                        display: 'flex',
                    })
                    .transition({
                        opacity: 1,
                        duration: animation_duration,
                        easing: animation_easing,
                    });
            },
        });
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', function (e) {
        // Expanded options don't need to be closed
        if (power_user.expand_message_actions) {
            return;
        }

        // Check if the click was outside the relevant elements
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        if (!$(e.target).closest('.extraMesButtons, .extraMesButtonsHint').length) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const $visibleButtons = $('.extraMesButtons.visible');

            if (!$visibleButtons.length) {
                return;
            }

            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const $hiddenHints = $('.extraMesButtonsHint:hidden');

            // Transition out the .extraMesButtons first
            $visibleButtons.transition({
                opacity: 0,
                duration: animation_duration,
                easing: animation_easing,
                complete: function () {
                    // Hide the .extraMesButtons after the transition
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $(this)
                        .hide()
                        .removeClass('visible');

                    // Transition the .extraMesButtonsHint back in
                    $hiddenHints
                        .show()
                        .transition({
                            opacity: 0.3,
                            duration: animation_duration,
                            easing: animation_easing,
                            complete: function () {
                                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                                $(this).css('opacity', '');
                            },
                        });
                },
            });
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.mes_edit_cancel', async function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        await messageEditCancel.call(this, this_edit_mes_id);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.mes_edit_up', async function () {
        // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
        if (this_edit_mes_id <= 0) {
            return;
        }
        // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
        const targetId = Number(this_edit_mes_id) - 1;
        // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
        await messageEditMove(this_edit_mes_id, targetId);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.mes_edit_down', async function () {
        // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
        if (this_edit_mes_id >= chat.length - 1) {
            return;
        }

        // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
        const targetId = Number(this_edit_mes_id) + 1;
        // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
        await messageEditMove(this_edit_mes_id, targetId);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.mes_edit_copy', async function () {
        const confirmation = await callGenericPopup(t`Create a copy of this message?`, POPUP_TYPE.CONFIRM);
        if (!confirmation) {
            return;
        }

        hideSwipeButtons();
        const oldScroll = chatElement[0].scrollTop;
        // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
        const clone = structuredClone(chat[this_edit_mes_id]);
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        clone.send_date = Date.now();
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const this_edit_mes_element = $(this).closest('.mes');
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        clone.mes = this_edit_mes_element.find('.edit_textarea').val().toString();

        if (power_user.trim_spaces) {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            clone.mes = clone.mes.trim();
        }

        // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
        chat.splice(Number(this_edit_mes_id) + 1, 0, clone);
        const newMessageElement = updateMessageElement(clone);
        this_edit_mes_element[0].after(newMessageElement[0]);

        updateViewMessageIds();
        await saveChatConditional();
        chatElement[0].scrollTop = oldScroll;
        showSwipeButtons();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.mes_edit_delete', async function (event, customData) {
        const fromSlashCommand = customData?.fromSlashCommand || false;
        // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
        const message = chat[this_edit_mes_id];
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        const selectedSwipe = message.swipe_id ?? undefined;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        const swipesArray = Array.isArray(message.swipes) ? message.swipes : [];
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        const canDeleteSwipe = power_user.confirm_message_delete && !fromSlashCommand && !message.is_user && swipesArray.length > 1 && this_edit_mes_id === chat.length - 1 && selectedSwipe !== undefined;
        // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
        await deleteMessage(Number(this_edit_mes_id), canDeleteSwipe ? selectedSwipe : undefined, power_user.confirm_message_delete && fromSlashCommand !== true);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.mes_edit_done', async function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        await messageEditDone($(this));
    });

    //Select chat

    //**************************CHARACTER IMPORT EXPORT*************************//
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_import_button').on('click', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#character_import_file').trigger('click');
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_import_file').on('change', async function (e) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#rm_info_avatar').html('');

        if (!(e.target instanceof HTMLInputElement)) {
            return;
        }

        if (!e.target.files.length) {
            return;
        }

        const avatarFileNames = [];
        for (const file of e.target.files) {
            const avatarFileName = await importCharacter(file);
            if (avatarFileName !== undefined) {
                avatarFileNames.push(avatarFileName);
            }
        }

        if (avatarFileNames.length > 0) {
            await importCharactersTags(avatarFileNames);
            selectImportedChar(avatarFileNames[avatarFileNames.length - 1]);
        }

        // Clear the file input value to allow re-uploading the same file
        e.target.value = '';
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#export_button').on('pointerdown mousedown', function (e) {
        e.stopPropagation();
    }).on('click', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#export_format_popup')[0].togglePopover();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.export_format', async function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const format = $(this).data('format');

        if (!format) {
            return;
        }

        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#export_format_popup')[0].hidePopover();

        // Save before exporting
        // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
        await createOrEditCharacter();
        const body = { format, avatar_url: characters[this_chid].avatar };

        const response = await fetch('/api/characters/export', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(body),
        });

        if (response.ok) {
            const filename = characters[this_chid].avatar.replace('.png', `.${format}`);
            const blob = await response.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.setAttribute('download', filename);
            document.body.appendChild(a);
            a.click();
            URL.revokeObjectURL(a.href);
            document.body.removeChild(a);
        }
    });
    //**************************CHAT IMPORT EXPORT*************************//
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#chat_import_button').on('click', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#chat_import_file').trigger('click');
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#chat_import_file').on('change', async function (e) {
        const targetElement = e.target;
        const formElement = document.getElementById('form_import_chat');
        if (!(targetElement instanceof HTMLInputElement) || !(formElement instanceof HTMLFormElement)) {
            return;
        }

        const importedFileNames = [];

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        for (const file of targetElement.files) {
            const ext = file.name.match(/\.(\w+)$/);
            const format = ext?.[1]?.toLowerCase();

            // @ts-expect-error TS(2345) FIXME: Argument of type 'string | undefined' is not assig... Remove this comment to see the full error message
            if (!['json', 'jsonl'].includes(format)) {
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.warning(t`Only JSON and JSONL files are supported for chat imports.`);
                continue;
            }

            if (selected_group && format === 'json') {
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.warning(t`Only SillyTavern's own format is supported for group chat imports. Sorry!`);
                continue;
            }

            const formData = new FormData(formElement);
            formData.set('file_type', format as string);
            formData.set('avatar', file);
            formData.set('user_name', name1 as string);

            const importFn = selected_group ? importGroupChat : importCharacterChat;
            const result = await importFn(formData, { refresh: false });
            importedFileNames.push(...result);
        }

        if (importedFileNames.length > 0) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.success(t`Successfully imported ${importedFileNames.length} chat(s).`);
        }

        // @ts-expect-error TS(2345) FIXME: Argument of type 'any[]' is not assignable to para... Remove this comment to see the full error message
        await displayPastChats(importedFileNames);

        targetElement.value = '';
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#rm_button_group_chats').on('click', function () {
        selected_button = 'group_chats';
        select_group_chats(null, false);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#rm_button_back_from_group').on('click', function () {
        selected_button = 'characters';
        select_rm_characters();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#dupe_button').on('click', async function () {
        await duplicateCharacter();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.mes_stop', function () {
        stopGeneration();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '#form_sheld .stscript_continue', function () {
        pauseScriptExecution();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '#form_sheld .stscript_pause', function () {
        pauseScriptExecution();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '#form_sheld .stscript_stop', function () {
        stopScriptExecution();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.drawer-opener', doDrawerOpenClick);

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('.drawer-toggle').on('click', doNavbarIconClick);

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('html').on('touchstart mousedown', async function (e) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const clickTarget = $(e.target);

        const forbiddenTargets = [
            '#character_cross',
            '#avatar-and-name-block',
            '#shadow_popup',
            '.popup',
            '#world_popup',
            '.ui-widget',
            '.text_pole',
            '#toast-container',
            '.select2-results',
        ];

        for (const id of forbiddenTargets) {
            if (clickTarget.closest(id).length > 0) {
                return;
            }
        }

        // This autocloses open drawers that are not pinned if a click happens inside the app which does not target them.
        const targetParentHasOpenDrawer = clickTarget.parents('.openDrawer').length;
        if (!clickTarget.hasClass('drawer-icon') && !clickTarget.hasClass('openDrawer')) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const $openDrawers = $('.openDrawer').not('.pinnedOpen');
            if ($openDrawers.length && targetParentHasOpenDrawer === 0) {
                // Toggle icon and drawer classes
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('.openIcon').not('.drawerPinnedOpen').toggleClass('closedIcon openIcon');
                $openDrawers.toggleClass('closedDrawer openDrawer');
            }
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.inline-drawer-toggle', async function (e) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        if ($(e.target).hasClass('text_pole')) {
            return;
        }
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const drawer = $(this).closest('.inline-drawer');
        const icon = drawer.find('>.inline-drawer-header .inline-drawer-icon');
        const drawerContent = drawer.find('>.inline-drawer-content');
        icon.toggleClass('down up');
        icon.toggleClass('fa-circle-chevron-down fa-circle-chevron-up');
        drawer.trigger('inline-drawer-toggle');
        drawerContent.stop().slideToggle({
            complete: () => {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $(this).css('height', '');
            },
        });

        // Set the height of "autoSetHeight" textareas within the inline-drawer to their scroll height
        if (!CSS.supports('field-sizing', 'content')) {
            const textareas = drawerContent.find('textarea.autoSetHeight');
            for (const textarea of textareas) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                await resetScrollHeight($(textarea));
            }
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.inline-drawer-maximize', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const icon = $(this).find('.inline-drawer-icon, .floating_panel_maximize');
        icon.toggleClass('fa-window-maximize fa-window-restore');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const drawerContent = $(this).closest('.drawer-content');
        drawerContent.toggleClass('maximized');
        const drawerId = drawerContent.attr('id');
        resetMovableStyles(drawerId);
    });

    document.addEventListener('click', function (e) {
        if (!(e.target instanceof HTMLElement)) return;
        const avatar = e.target.closest('.avatar');
        if (!avatar) return;
        const messageElement = avatar.closest('.mes');
        if (!messageElement) return;
        const thumbURL = avatar.querySelector('img')?.getAttribute('src') ?? '';
        const charsPath = '/characters/';
        const targetAvatarImg = (() => {
            try {
                const url = new URL(thumbURL, window.location.origin);
                return url.searchParams.get('file') ?? thumbURL.substring(thumbURL.lastIndexOf('/') + 1);
            } catch {
                return thumbURL.substring(thumbURL.lastIndexOf('=') + 1);
            }
        })();
        const charname = targetAvatarImg.replace('.png', '');
        const isValidCharacter = characters.some(x => x.avatar === decodeURIComponent(targetAvatarImg));

        // Remove existing zoomed avatars for characters that are not the clicked character when moving UI is not enabled
        if (!power_user.movingUI) {
            document.querySelectorAll('.zoomed_avatar').forEach(function (el) {
                const currentForChar = el.getAttribute('forChar');
                if (currentForChar !== null && currentForChar !== charname) {
                    console.debug(`Removing zoomed avatar for character: ${currentForChar}`);
                    el.remove();
                }
            });
        }

        const avatarSrc = (isDataURL(thumbURL) || /^\/?img\/(?:.+)/.test(thumbURL)) ? thumbURL : charsPath + targetAvatarImg;
        const zoomedAvatarSelector = `.zoomed_avatar[forChar="${charname}"]`;
        const existingZoomedAvatar = document.querySelector(zoomedAvatarSelector);
        if (existingZoomedAvatar) {
            console.debug('removing container as it already existed');
            if (animation_duration > 0) {
                // @ts-expect-error TS(2339) FIXME: Property 'style' does not exist on type 'Element'.
                existingZoomedAvatar.style.transition = `opacity ${animation_duration}ms ease`;
                // @ts-expect-error TS(2339) FIXME: Property 'style' does not exist on type 'Element'.
                existingZoomedAvatar.style.opacity = '0';
                setTimeout(() => {
                    document.querySelectorAll(zoomedAvatarSelector).forEach(el => el.remove());
                }, animation_duration);
            } else {
                existingZoomedAvatar.remove();
            }
        } else {
            console.debug('making new container from template');
            const templateElement = document.getElementById('zoomed_avatar_template');
            let newElement = null;
            if (templateElement instanceof HTMLTemplateElement) {
                newElement = templateElement.content.firstElementChild?.cloneNode(true);
            } else if (templateElement) {
                newElement = templateElement.firstElementChild?.cloneNode(true);
            }
            if (!(newElement instanceof HTMLElement)) {
                console.error('Zoomed avatar template is empty');
                return;
            }
            newElement.setAttribute('forChar', charname);
            newElement.setAttribute('id', `zoomFor_${charname}`);
            newElement.classList.add('draggable');
            newElement.querySelector('.drag-grabber')?.setAttribute('id', `zoomFor_${charname}header`);
            document.body.append(newElement);

            if (animation_duration > 0) {
                newElement.style.opacity = '0';
                newElement.style.transition = `opacity ${animation_duration}ms ease`;
                void newElement.offsetHeight;
                newElement.style.opacity = '1';
            }

            const zoomedAvatarImgElement = newElement.querySelector('img');
            if (messageElement.getAttribute('is_user') == 'true' || (messageElement.getAttribute('is_system') == 'true' && !isValidCharacter)) {
                const isValidPersona = decodeURIComponent(targetAvatarImg) in power_user.personas;
                if (isValidPersona) {
                    const personaSrc = getUserAvatar(targetAvatarImg);
                    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                    zoomedAvatarImgElement.src = personaSrc;
                    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                    zoomedAvatarImgElement.setAttribute('data-izoomify-url', personaSrc);
                } else {
                    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                    zoomedAvatarImgElement.src = thumbURL;
                    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                    zoomedAvatarImgElement.setAttribute('data-izoomify-url', thumbURL);
                }
            } else if (messageElement.getAttribute('is_user') == 'false') {
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                zoomedAvatarImgElement.src = avatarSrc;
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                zoomedAvatarImgElement.setAttribute('data-izoomify-url', avatarSrc);
            }
            loadMovingUIState();
            newElement.style.display = 'flex';
            dragElement(newElement);

            if (power_user.zoomed_avatar_magnification) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('.zoomed_avatar_container').izoomify();
            }

            // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
            const closeHandler = function (e) {
                if (e.target.closest('.dragClose')) {
                    if (animation_duration > 0) {
                        newElement.style.transition = `opacity ${animation_duration}ms ease`;
                        newElement.style.opacity = '0';
                        setTimeout(() => {
                            document.querySelectorAll(zoomedAvatarSelector).forEach(el => el.remove());
                        }, animation_duration);
                    } else {
                        newElement.remove();
                    }
                }
            };
            newElement.addEventListener('click', closeHandler);
            newElement.addEventListener('touchend', closeHandler);

            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            zoomedAvatarImgElement.addEventListener('dragstart', (e) => {
                console.log('saw drag on avatar!');
                e.preventDefault();
                return false;
            });
        }
    });

    document.addEventListener('click', function (e) {
        if (!(e.target instanceof HTMLElement)) return;
        if (e.target.matches('#OpenAllWIEntries')) {
            document.querySelectorAll('#world_popup_entries_list .inline-drawer').forEach((/** @type {HTMLElement} */ drawer) => {
                delay(0).then(() => toggleDrawer(drawer, true));
            });
        } else if (e.target.matches('#CloseAllWIEntries')) {
            document.querySelectorAll('#world_popup_entries_list .inline-drawer').forEach((/** @type {HTMLElement} */ drawer) => {
                toggleDrawer(drawer, false);
            });
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.open_alternate_greetings', openAlternateGreetings);
    /* $('#set_character_world').on('click', openCharacterWorldPopup); */

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('focus', 'input.auto-select, textarea.auto-select', function () {
        if (!power_user.enable_auto_select_input) return;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const control = $(this)[0];
        if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
            control.select();
            console.debug('Auto-selecting content of input control', control);
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('keydown', function (e) {
        if (e.key === 'Escape' && !e.originalEvent.isComposing) {
            // Close manual popovers first
            const optionsEl = document.getElementById('options');
            if (optionsEl?.matches(':popover-open')) {
                optionsEl.hidePopover();
                return;
            }
            const extensionsMenuEl = document.getElementById('extensionsMenu');
            if (extensionsMenuEl?.matches(':popover-open')) {
                extensionsMenuEl.hidePopover();
                return;
            }
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const isEditVisible = $('#curEditTextarea').is(':visible') || $('.reasoning_edit_textarea').length > 0;
            if (isEditVisible && power_user.auto_save_msg_edits === false) {
                closeMessageEditor('all');
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#send_textarea').trigger('focus');
                return;
            }
            if (isEditVisible && power_user.auto_save_msg_edits === true) {
                // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
                chatElement.find(`.mes[mesid="${this_edit_mes_id}"] .mes_edit_done`).trigger('click');
                closeMessageEditor('reasoning');
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#send_textarea').trigger('focus');
                return;
            }
            // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
            if (this_edit_mes_id === undefined && $('#mes_stop').is(':visible')) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#mes_stop').trigger('click');
                if (chat.length === 0) return;
                const lastMessage = chat[chat.length - 1];
                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                if (Array.isArray(lastMessage.swipes) && lastMessage.swipe_id == lastMessage.swipes.length) {
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $('.last_mes .swipe_left').trigger('click');
                }
            }
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#char-management-dropdown').on('change', async (e) => {
        const targetElement = /** @type {HTMLSelectElement} */ (e.target);
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const target = $(targetElement.selectedOptions).attr('id');
        switch (target) {
            case 'set_character_world':
                await openCharacterWorldPopup();
                break;
            case 'set_chat_character_settings':
                await setCharacterSettingsOverrides();
                break;
            case 'renameCharButton':
                await renameCharacter();
                break;
            case 'import_character_info':
                await importEmbeddedWorldInfo();
                saveCharacterDebounced();
                break;
            case 'character_source': {
                const source = getCharacterSource(this_chid);
                if (source && isValidUrl(source)) {
                    const url = new URL(source);
                    const confirm = await Popup.show.confirm('Open Source', `<span>Do you want to open the link to ${url.hostname} in a new tab?</span><var>${url}</var>`);
                    if (confirm) {
                        window.open(source, '_blank');
                    }
                } else {
                    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                    toastr.info('This character doesn\'t seem to have a source.');
                }
            } break;
            case 'replace_update': {
                let onlineUrl = getCharacterSource(this_chid);

                const POPUP_RESULT_URL = POPUP_RESULT.CUSTOM1, POPUP_RESULT_FILE = POPUP_RESULT.CUSTOM2;
                const result = await Popup.show.confirm(t`Replace Character`,
                    `<p>${t`Choose a new character card to replace this character with.`}</p>` +
                    `<p>${t`You can also replace this character with the one from the online source.`}${onlineUrl ? `<br />This character was downloaded from: <var>${onlineUrl}</var>` : ''}</p>` +
                    `<p>${t`All chats, assets and group memberships will be preserved, but local changes to the character data will be lost.`}<br />${t`Proceed?`}</p>`,
                    {
                        okButton: false,
                        customButtons: [{
                            text: t`Replace with URL`,
                            result: POPUP_RESULT_URL,
                            classes: ['popup-button-ok'],
                        }, {
                            text: t`Replace with File`,
                            result: POPUP_RESULT_FILE,
                            classes: ['popup-button-ok'],
                        }],
                        defaultResult: onlineUrl ? POPUP_RESULT_URL : POPUP_RESULT_FILE,
                    });

                // Remember the chat currently selected, so we can reload it after the replacement
                const currentChatFile = characters[this_chid].chat;
                /**
                 *
                 */
                async function postReplace() {
                    await openCharacterChat(currentChatFile);
                }

                switch (result) {
                    case POPUP_RESULT_FILE: {
                        /**
                         *
                         * @param e
                         */
                        // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
                        async function uploadReplacementCard(e) {
                            const file = e.target.files[0];
                            if (!file) {
                                return;
                            }

                            try {
                                const data = new Map();
                                data.set(file, characters[this_chid].avatar);
                                await processDroppedFiles([file], data);
                                await postReplace();
                            } catch {
                                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                                toastr.error('Failed to replace the character card.', 'Something went wrong');
                            }
                        }
                        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                        $('#character_replace_file').off('change').on('change', uploadReplacementCard).trigger('click');
                        break;
                    }
                    case POPUP_RESULT_URL: {
                        const inputUrl = await Popup.show.input(t`Replace Character from URL`,
                            `<p>${t`Enter the URL of the character card to replace this character with.`}</p>` +
                            (onlineUrl ? `<p>${t`This character was downloaded from: <var>${onlineUrl}</var>`}</p>` : ''),
                            onlineUrl);
                        if (!inputUrl) {
                            break;
                        }
                        onlineUrl = inputUrl;
                        await importFromExternalUrl(onlineUrl, { preserveFileName: characters[this_chid].avatar });
                        await postReplace();
                        break;
                    }
                }
            } break;
            case 'import_tags': {
                // @ts-expect-error TS(2322) FIXME: Type 'number' is not assignable to type 'null | un... Remove this comment to see the full error message
                await importTags(characters[this_chid], { importSetting: tag_import_setting.ASK });
            } break;
            /*case 'delete_button':
                popup_type = "del_ch";
                callPopup(`
                        <h3>Delete the character?</h3>
                        <b>THIS IS PERMANENT!<br><br>
                        THIS WILL ALSO DELETE ALL<br>
                        OF THE CHARACTER'S CHAT FILES.<br><br></b>`
                );
                break;*/
            default:
                await eventSource.emit(event_types.CHARACTER_MANAGEMENT_DROPDOWN, target);
        }
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#char-management-dropdown').prop('selectedIndex', 0);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(window).on('beforeunload', () => {
        cancelTtsPlay();
        if (streamingProcessor) {
            console.log('Page reloaded. Aborting streaming...');
            // @ts-expect-error TS(2339) FIXME: Property 'onStopStreaming' does not exist on type ... Remove this comment to see the full error message
            streamingProcessor.onStopStreaming();
        }
    });


    let isManualInput = false;
    // @ts-expect-error TS(7034) FIXME: Variable 'valueBeforeManualInput' implicitly has t... Remove this comment to see the full error message
    let valueBeforeManualInput;

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('input', '.range-block-counter input, .neo-range-input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        valueBeforeManualInput = $(this).val();
        console.log(valueBeforeManualInput);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('change', '.range-block-counter input, .neo-range-input', function (e) {
        if (!(e.target instanceof HTMLElement)) {
            return;
        }
        e.target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('keydown', '.range-block-counter input, .neo-range-input', function (e) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const masterSelector = '#' + $(this).data('for');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const masterElement = $(masterSelector);
        if (e.key === 'Enter') {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const manualInput = Number($(this).val());
            if (isManualInput) {
                //disallow manual inputs outside acceptable range
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                if (manualInput >= Number($(this).attr('min')) && manualInput <= Number($(this).attr('max'))) {
                    //if value is ok, assign to slider and update handle text and position
                    //newSlider.val(manualInput)
                    //handleSlideEvent.call(newSlider, null, { value: parseFloat(manualInput) }, 'manual');
                    valueBeforeManualInput = manualInput;
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $(masterElement).val($(this).val()).trigger('input', { forced: true });
                } else {
                    //if value not ok, warn and reset to last known valid value
                    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                    toastr.warning(`Invalid value. Must be between ${$(this).attr('min')} and ${$(this).attr('max')}`);
                    //newSlider.val(valueBeforeManualInput)
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $(this).val(valueBeforeManualInput);
                }
            }
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('keyup', '.range-block-counter input, .neo-range-input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        valueBeforeManualInput = $(this).val();
        isManualInput = true;
    });

    //trigger slider changes when user clicks away
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('mouseup blur', '.range-block-counter input, .neo-range-input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const masterSelector = '#' + $(this).data('for');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const masterElement = $(masterSelector);
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const manualInput = Number($(this).val());
        if (isManualInput) {
            //if value is between correct range for the slider
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            if (manualInput >= Number($(this).attr('min')) && manualInput <= Number($(this).attr('max'))) {
                valueBeforeManualInput = manualInput;
                //set the slider value to input value
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $(masterElement).val($(this).val()).trigger('input', { forced: true });
            } else {
                //if value not ok, warn and reset to last known valid value
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.warning(`Invalid value. Must be between ${$(this).attr('min')} and ${$(this).attr('max')}`);
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $(this).val(valueBeforeManualInput);
            }
        }
        isManualInput = false;
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('.user_stats_button').on('click', function () {
        userStatsHandler();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.external_import_button, #external_import_button', async () => {
        const html = await renderTemplateAsync('importCharacters');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const input = await callGenericPopup(html, POPUP_TYPE.INPUT, '', { allowVerticalScrolling: true, wider: true, okButton: $('#popup_template').attr('popup-button-import'), rows: 4 });

        if (!input) {
            console.debug('Custom content import cancelled');
            return;
        }

        // break input into one input per line
        const inputs = String(input).split('\n').map(x => x.trim()).filter(x => x.length > 0);

        for (const url of inputs) {
            await importFromExternalUrl(url);
        }
    });

    // @ts-expect-error TS(2322) FIXME: Type 'DragAndDropHandler' is not assignable to typ... Remove this comment to see the full error message
    charDragDropHandler = new DragAndDropHandler('body', async (files, event) => {
        if (!files.length) {
            await importFromURL(event.dataTransfer?.items, files);
        }
        await processDroppedFiles(files);
    }, { noAnimation: true });

    // @ts-expect-error TS(2322) FIXME: Type 'DragAndDropHandler' is not assignable to typ... Remove this comment to see the full error message
    chatDragDropHandler = new DragAndDropHandler('#select_chat_popup', async (_, event) => {
        const importFile = document.getElementById('chat_import_file');
        if (importFile instanceof HTMLInputElement) {
            importFile.files = event.dataTransfer?.files ?? importFile.files;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(importFile).trigger('change');
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#charListGridToggle').on('click', async () => {
        doCharListDisplaySwitch();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#hideCharPanelAvatarButton').on('click', () => {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#avatar-and-name-block').slideToggle();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '#show_more_messages', async function (event) {
        event.stopPropagation();
        event.preventDefault();
        await showMoreMessages();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.open_characters_library', async function () {
        await getCharacters();
        await eventSource.emit(event_types.OPEN_CHARACTER_LIBRARY);
    });

    // Added here to prevent execution before script.js is loaded and get rid of quirky timeouts
    await firstLoadInit();

    window.addEventListener('beforeunload', (e) => {
        // @ts-expect-error TS(7005) FIXME: Variable 'this_edit_mes_id' implicitly has an 'any... Remove this comment to see the full error message
        if (isChatSaving || this_edit_mes_id >= 0) {
            e.preventDefault();
            e.returnValue = true;
        }
    });
});
