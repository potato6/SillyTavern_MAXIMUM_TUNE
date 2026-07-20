import { Fuse, Handlebars } from '../lib.js';

/* eslint-disable @typescript-eslint/no-unused-vars */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare let toastr: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const noUiSlider: any;
/* eslint-enable @typescript-eslint/no-unused-vars */
 
interface Notyf {
    success(msg: string, title?: string): void;
    error(msg: string, title?: string): void;
    warning(msg: string, title?: string, options?: Record<string, unknown>): void;
    info(msg: string, title?: string, options?: Record<string, unknown>): void;
    options: Record<string, unknown>;
}
declare let notyf: Notyf;

import {
    saveSettingsDebounced,
    scrollChatToBottom,
    characters,
    reloadMarkdownProcessor,
    reloadCurrentChat,
    getRequestHeaders,
    substituteParams,
    eventSource,
    event_types,
    getCurrentChatId,
    printCharactersDebounced,
    chat,
    getFirstDisplayedMessageId,
    saveSettings,
    saveChatConditional,
    setAnimationDuration,
    ANIMATION_DURATION_DEFAULT,
    entitiesFilter,

    online_status,
    messageFormatting,
    extension_prompt_types,
    extension_prompt_roles,
    settingsReady,
} from '../script.js';
import { isMobile, initMovingUI, favsToHotswap } from './RossAscends-mods.js';
import {
    groups,
} from './group-chats.js';
import {
    instruct_presets,
    loadInstructMode,
    names_behavior_types,
    selectInstructPreset,
    updateBindModelTemplatesState,
} from './instruct-mode.js';

import { getTagsList, tag_import_setting, tag_sort_mode, tags } from './tags.js';
import { tokenizers } from './tokenizers.js';
import { BIAS_CACHE } from './logit-bias.js';
import { renderTemplateAsync } from './templates.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const TomSelect: unknown;

import { countOccurrences, debounce, delay, download, getFileText, getSanitizedFilename, getStringHash, isOdd, onlyUnique, resetScrollHeight, shuffle, sortMoments, timestampToMoment } from './utils.js';
import { FILTER_TYPES } from './filters.js';
import { PARSER_FLAG } from './slash-commands/SlashCommandParser.js';
import { AUTOCOMPLETE_SELECT_KEY, AUTOCOMPLETE_STATE, AUTOCOMPLETE_WIDTH } from './autocomplete/AutoComplete.js';
import { POPUP_TYPE, callGenericPopup } from './popup.js';
import { loadSystemPrompts } from './sysprompt.js';
import { fuzzySearchCategories } from './filters.js';
import { accountStorage } from './util/AccountStorage.js';

import { DEFAULT_REASONING_TEMPLATE, loadReasoningTemplates } from './reasoning.js';
import { bindModelTemplates } from './chat-templates.js';
import { IMAGE_OVERSWIPE, MEDIA_DISPLAY } from './constants.js';
import { t } from './i18n.js';

import { persona_description_positions as _persona_description_positions } from './personas.js';

 
interface noUiSliderInstance {
    get(): string | string[];
    set(value: number | string | (number | string)[]): void;
    on(event: string, handler: (...args: unknown[]) => void): void;
    destroy(): void;
}

 
interface noUiSliderElement {
    noUiSlider?: noUiSliderInstance;
}

export const toastPositionClasses = [
    'toast-top-left',
    'toast-top-center',
    'toast-top-right',
    'toast-bottom-left',
    'toast-bottom-center',
    'toast-bottom-right',
];

export const MAX_CONTEXT_DEFAULT = 8192;
export const MAX_RESPONSE_DEFAULT = 2048;
const MAX_CONTEXT_UNLOCKED = 512 * 1024;
const MAX_RESPONSE_UNLOCKED = 64 * 1024;
const unlockedMaxContextStep = 512;
const maxContextMin = 512;
const maxContextStep = 64;

const defaultStoryString = '{{#if system}}{{system}}\n{{/if}}{{#if description}}{{description}}\n{{/if}}{{#if personality}}{{char}}\'s personality: {{personality}}\n{{/if}}{{#if scenario}}Scenario: {{scenario}}\n{{/if}}{{#if persona}}{{persona}}\n{{/if}}';
const defaultExampleSeparator = '***';
const defaultChatStart = '***';
const defaultToastPosition = 'toast-top-center';

const avatar_styles = {
    ROUND: 0,
    RECTANGULAR: 1,
    SQUARE: 2,
    ROUNDED: 3,
};

export const chat_styles = {
    DEFAULT: 0,
    BUBBLES: 1,
    DOCUMENT: 2,
};

export const send_on_enter_options = {
    DISABLED: -1,
    AUTO: 0,
    ENABLED: 1,
};

export const persona_description_positions = _persona_description_positions;

export const power_user = {
    charListGrid: false,
    tokenizer: tokenizers.BEST_MATCH,
    token_padding: 64,
    collapse_newlines: false,
    pin_examples: false,
    strip_examples: false,
    trim_sentences: false,
    always_force_name2: false,
    user_prompt_bias: '',
    show_user_prompt_bias: true,
    auto_continue: {
        enabled: false,
        allow_chat_completions: false,
        target_length: 400,
    },
    markdown_escape_strings: '',
    chat_truncation: 100,
    streaming_fps: 30,
    smooth_streaming: false,
    smooth_streaming_no_think: false,
    smooth_streaming_speed: 50,
    stream_fade_in: false,
    enable_code_execution: false,
    auto_run_code: false,

    fast_ui_mode: true,
    avatar_style: avatar_styles.ROUND,
    chat_display: chat_styles.DEFAULT,
    toastr_position: defaultToastPosition,
    chat_width: 50,
    never_resize_avatars: false,
    show_card_avatar_urls: false,
    play_message_sound: false,
    play_sound_unfocused: true,
    auto_save_msg_edits: false,
    confirm_message_delete: true,

    sort_field: 'name',
    sort_order: 'asc',
    sort_rule: null as string | null,
    font_scale: 1,
    blur_strength: 10,
    shadow_width: 2,

    main_text_color: `${getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeBodyColor').trim()}`,
    italics_text_color: `${getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeEmColor').trim()}`,
    underline_text_color: `${getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeUnderlineColor').trim()}`,
    quote_text_color: `${getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeQuoteColor').trim()}`,
    blur_tint_color: `${getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeBlurTintColor').trim()}`,
    chat_tint_color: `${getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeChatTintColor').trim()}`,
    user_mes_blur_tint_color: `${getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeUserMesBlurTintColor').trim()}`,
    bot_mes_blur_tint_color: `${getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeBotMesBlurTintColor').trim()}`,
    shadow_color: `${getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeShadowColor').trim()}`,
    border_color: `${getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeBorderColor').trim()}`,

    custom_css: '',

    waifuMode: false,
    movingUI: false,
    movingUIState: {},
    movingUIPreset: '',
    noShadows: false,
    theme: 'Default (Dark) 1.7.1',

    gestures: true,
    auto_swipe: false,
    auto_swipe_minimum_length: 0,
    auto_swipe_blacklist: [] as string[],
    auto_swipe_blacklist_threshold: 2,
    auto_scroll_chat_to_bottom: true,
    auto_fix_generated_markdown: true,
    send_on_enter: send_on_enter_options.AUTO,
    console_log_prompts: false,
    request_token_probabilities: false,
    show_group_chat_queue: false,
    allow_name1_display: false,
    allow_name2_display: false,
    hotswap_enabled: true,
    timer_enabled: true,
    timestamps_enabled: true,
    timestamp_model_icon: false,
    mesIDDisplay_enabled: false,
    hideChatAvatars_enabled: false,
    max_context_unlocked: false,
    message_token_count_enabled: false,
    expand_message_actions: false,
    enableZenSliders: false,
    enableLabMode: false,
    prefer_character_prompt: true,
    prefer_character_jailbreak: true,
    quick_continue: false,
    quick_impersonate: false,
    continue_on_send: false,
    trim_spaces: true,
    relaxed_api_urls: false,
    world_import_dialog: true,
    enable_auto_select_input: false,
    enable_md_hotkeys: false,
    tag_import_setting: tag_import_setting.ASK,
    tag_sort_mode: tag_sort_mode.MANUAL,
    disable_group_trimming: false,
    single_line: false,

    instruct: {
        enabled: false,
        preset: 'Alpaca',
        input_sequence: '### Instruction:',
        input_suffix: '',
        output_sequence: '### Response:',
        output_suffix: '',
        system_sequence: '',
        system_suffix: '',
        last_system_sequence: '',
        first_input_sequence: '',
        first_output_sequence: '',
        last_input_sequence: '',
        last_output_sequence: '',
        story_string_prefix: '',
        story_string_suffix: '',
        stop_sequence: '',
        wrap: true,
        macro: true,
        names_behavior: names_behavior_types.FORCE,
        activation_regex: '',
        bind_to_context: false,
        user_alignment_message: '',
        system_same_as_user: false,
        /** @deprecated Use output_suffix instead */
        separator_sequence: '',
        sequences_as_stop_strings: true,
    },

    context: {
        preset: 'Default',
        story_string: defaultStoryString,
        chat_start: defaultChatStart,
        example_separator: defaultExampleSeparator,
        use_stop_strings: true,
        names_as_stop_strings: true,
        story_string_position: extension_prompt_types.IN_PROMPT,
        story_string_role: extension_prompt_roles.SYSTEM,
        story_string_depth: 1,
    },

    instruct_derived: false,
    context_derived: false,
    context_size_derived: false,
    /** User-defined model identifier / chat template hash to instruct/context template mappings */
    model_templates_mappings: {},
    /** The chat template hash of the currently loaded model, if any; used when deriving mappings */
    chat_template_hash: '',

    sysprompt: {
        enabled: true,
        name: 'Neutral - Chat',
        content: 'Write {{char}}\'s next reply in a fictional chat between {{char}} and {{user}}.',
        post_history: '',
    },

    reasoning: {
        name: DEFAULT_REASONING_TEMPLATE,
        auto_parse: false,
        add_to_prompts: false,
        auto_expand: false,
        show_hidden: false,
        prefix: '<think>',
        suffix: '</think>',
        separator: '\n',
        max_additions: 1,
    },

    personas: {} as Record<string, string>,
    default_persona: null as string | null,
    persona_descriptions: {} as Record<string, Record<string, unknown>>,

    persona_description: '',
    persona_description_position: persona_description_positions.IN_PROMPT,
    persona_description_role: 0,
    persona_description_depth: 2,
    persona_description_lorebook: '',
    persona_show_notifications: true,
    persona_sort_order: 'asc',

    custom_stopping_strings: '',
    custom_stopping_strings_macro: true,
    fuzzy_search: false,
    encode_tags: false,
    experimental_macro_engine: true,
    servers: [],
    bogus_folders: false,
    zoomed_avatar_magnification: false,
    show_tag_filters: false,
    aux_field: 'character_version',
    stscript: {
        matching: 'fuzzy',
        autocomplete: {
            state: AUTOCOMPLETE_STATE.ALWAYS,
            autoHide: false,
            style: 'theme',
            font: {
                scale: 0.8,
            },
            width: {
                left: AUTOCOMPLETE_WIDTH.CHAT,
                right: AUTOCOMPLETE_WIDTH.CHAT,
            },
            select: AUTOCOMPLETE_SELECT_KEY.TAB + AUTOCOMPLETE_SELECT_KEY.ENTER,
            /** Whether to show macro autocomplete in all macro-enabled fields (not just expanded editors) */
            showInAllMacroFields: false,
        },
        parser: {
            /**@type {Object.<PARSER_FLAG,boolean>} */
            flags: {} as Record<string, boolean>,
        },
    },
    restore_user_input: true,
    reduced_motion: false,
    compact_input_area: true,
    show_swipe_num_all_messages: false,
    auto_connect: false,
    auto_load_chat: false,
    forbid_external_media: true,
    external_media_allowed_overrides: [] as string[],
    external_media_forbidden_overrides: [] as string[],
    pin_styles: true,
    click_to_edit: false,
    media_display: MEDIA_DISPLAY.LIST,
    image_overswipe: IMAGE_OVERSWIPE.GENERATE,

    // Legacy/optional properties that may come from saved settings
    spoiler_free_mode: false,
    import_card_tags: undefined as boolean | undefined,
    persona_allow_multi_connections: false,
    persona_auto_lock: false,
    /** @deprecated Use stscript.autocomplete.style instead */
    autocomplete_style: undefined as string | undefined,
};

interface Theme {
    name: string;
    blur_strength?: number;
    main_text_color?: string;
    italics_text_color?: string;
    underline_text_color?: string;
    quote_text_color?: string;
    blur_tint_color?: string;
    chat_tint_color?: string;
    user_mes_blur_tint_color?: string;
    bot_mes_blur_tint_color?: string;
    shadow_color?: string;
    shadow_width?: number;
    border_color?: string;
    font_scale?: number;
    fast_ui_mode?: boolean;
    waifuMode?: boolean;
    avatar_style?: number;
    chat_display?: number;
    toastr_position?: string;
    noShadows?: boolean;
    chat_width?: number;
    timer_enabled?: boolean;
    timestamps_enabled?: boolean;
    timestamp_model_icon?: boolean;
    mesIDDisplay_enabled?: boolean;
    hideChatAvatars_enabled?: boolean;
    message_token_count_enabled?: boolean;
    expand_message_actions?: boolean;
    enableZenSliders?: boolean;
    enableLabMode?: boolean;
    hotswap_enabled?: boolean;
    custom_css?: string;
    bogus_folders?: boolean;
    zoomed_avatar_magnification?: boolean;
    reduced_motion?: boolean;
    compact_input_area?: boolean;
    show_swipe_num_all_messages?: boolean;
    click_to_edit?: boolean;
    media_display?: string;
    [key: string]: unknown;
}

interface ContextSettings extends Record<string, unknown> {
    name?: string;
    preset: string;
    story_string: string;
    chat_start: string;
    example_separator: string;
    use_stop_strings: boolean;
    names_as_stop_strings: boolean;
    story_string_position: number;
    story_string_role: number;
    story_string_depth: number;
}

interface MovingUIPreset {
    name: string;
    movingUIState: Record<string, Record<string, string>>;
}

let themes: Theme[] = [];
let movingUIPresets: MovingUIPreset[] = [];
/** @type {ContextSettings[]} */
export let context_presets: ContextSettings[] = [];

const storage_keys = {
    storyStringValidationCache: 'StoryStringValidationCache',
};

const contextControls = [
    // Power user context scoped settings
    { id: 'context_story_string', property: 'story_string', isCheckbox: false, isGlobalSetting: false },
    { id: 'context_example_separator', property: 'example_separator', isCheckbox: false, isGlobalSetting: false },
    { id: 'context_chat_start', property: 'chat_start', isCheckbox: false, isGlobalSetting: false },
    { id: 'context_use_stop_strings', property: 'use_stop_strings', isCheckbox: true, isGlobalSetting: false, defaultValue: false },
    { id: 'context_names_as_stop_strings', property: 'names_as_stop_strings', isCheckbox: true, isGlobalSetting: false, defaultValue: true },
    { id: 'context_story_string_position', property: 'story_string_position', isCheckbox: false, isGlobalSetting: false, defaultValue: extension_prompt_types.IN_PROMPT, trigger: true },
    { id: 'context_story_string_depth', property: 'story_string_depth', isCheckbox: false, isGlobalSetting: false, defaultValue: 1 },
    { id: 'context_story_string_role', property: 'story_string_role', isCheckbox: false, isGlobalSetting: false, defaultValue: extension_prompt_roles.SYSTEM },

    // Existing power user settings
    { id: 'always-force-name2-checkbox', property: 'always_force_name2', isCheckbox: true, isGlobalSetting: true, defaultValue: true },
    { id: 'trim_sentences_checkbox', property: 'trim_sentences', isCheckbox: true, isGlobalSetting: true, defaultValue: false },
    { id: 'single_line', property: 'single_line', isCheckbox: true, isGlobalSetting: true, defaultValue: false },
];

const browser_has_focus = true;
const debug_functions: unknown[] = [];

const setHotswapsDebounced = debounce(favsToHotswap);

/**
 * Plays the message sound if enabled in power user settings.
 * Passes through the `force` parameter to override settings.
 * @param {object} [param] Arguments object.
 * @param {boolean} [param.force] Whether to force play the sound.
 * @returns {void}
 */
export function playMessageSound({
    force
}: { force?: boolean } = {}) {
    if (!power_user.play_message_sound && !force) {
        return;
    }

    if (power_user.play_sound_unfocused && browser_has_focus && !force) {
        return;
    }

    const audio = document.getElementById('audio_message_sound');
    if (audio instanceof HTMLAudioElement) {
        audio.volume = 0.8;
        audio.pause();
        audio.currentTime = 0;
        audio.play();
    }
}

/**
 * Replaces consecutive newlines with a single newline.
 * @param {string} x String to be processed.
 * @returns {string} Processed string.
 * @example
 * collapseNewlines("\n\n\n"); // "\n"
 */
export function collapseNewlines(x: string) {
    return x.replaceAll(/\n+/g, '\n');
}

/**
 * Fix formatting problems in markdown.
 * @param {string} text Text to be processed.
 * @param {boolean} forDisplay Whether the text is being processed for display.
 * @returns {string} Processed text.
 * @example
 * "^example * text*\n" // "^example *text*\n"
 *  "^*example * text\n"// "^*example* text\n"
 * "^example *text *\n" // "^example *text*\n"
 * "^* example * text\n" // "^*example* text\n"
 * // take note that the side you move the asterisk depends on where its pairing is
 * // i.e. both of the following strings have the same broken asterisk ' * ',
 * // but you move the first to the left and the second to the right, to match the non-broken asterisk
 * "^example * text*\n" // "^*example * text\n"
 * // and you HAVE to handle the cases where multiple pairs of asterisks exist in the same line
 * "^example * text* * harder problem *\n" // "^example *text* *harder problem*\n"
 */
export function fixMarkdown(text: string, forDisplay: boolean) {
    // Find pairs of formatting characters and capture the text in between them
    const format = /([*_]{1,2})([\s\S]*?)\1/gm;
    const matches = [];
    let match;
    while ((match = format.exec(text)) !== null) {
        matches.push(match);
    }

    // Iterate through the matches and replace adjacent spaces immediately beside formatting characters
    let newText = text;
    for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i]!;
        const matchText = match[0]!;
        const replacementText = matchText.replace(/(\*|_)([\t \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]+)|([\t \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]+)(\*|_)/g, '$1$4');
        newText = newText.slice(0, match.index) + replacementText + newText.slice(match.index + matchText.length);
    }

    // Don't auto-fix asterisks if this is a message clean-up procedure.
    // It botches the continue function. Apply this to display only.
    if (!forDisplay) {
        return newText;
    }

    const splitText = newText.split('\n');

    // Fix asterisks, and quotes that are not paired
    for (let index = 0; index < splitText.length; index++) {
        const line = splitText[index]!;
        const charsToCheck = ['*', '"'];
        for (const char of charsToCheck) {
            if (line.includes(char) && isOdd(countOccurrences(line, char))) {
                splitText[index] = line.trimEnd() + char;
            }
        }
    }

    newText = splitText.join('\n');

    return newText;
}

/**
 *
 */
function switchHotswap() {
    document.body.classList.toggle('no-hotswap', !power_user.hotswap_enabled);
    const el = document.getElementById('hotswapEnabled') as HTMLInputElement | null;
    if (el) el.checked = power_user.hotswap_enabled;
}

/**
 *
 */
function switchTimer() {
    document.body.classList.toggle('no-timer', !power_user.timer_enabled);
    const el = document.getElementById('messageTimerEnabled') as HTMLInputElement | null;
    if (el) el.checked = power_user.timer_enabled;
}

/**
 *
 */
function switchTimestamps() {
    document.body.classList.toggle('no-timestamps', !power_user.timestamps_enabled);
    const el = document.getElementById('messageTimestampsEnabled') as HTMLInputElement | null;
    if (el) el.checked = power_user.timestamps_enabled;
}

/**
 *
 */
function switchIcons() {
    document.body.classList.toggle('no-modelIcons', !power_user.timestamp_model_icon);
    const el = document.getElementById('messageModelIconEnabled') as HTMLInputElement | null;
    if (el) el.checked = power_user.timestamp_model_icon;
}

/**
 *
 */
function switchTokenCount() {
    document.body.classList.toggle('no-tokenCount', !power_user.message_token_count_enabled);
    const el = document.getElementById('messageTokensEnabled') as HTMLInputElement | null;
    if (el) el.checked = power_user.message_token_count_enabled;
}

/**
 *
 */
function switchMesIDDisplay() {
    document.body.classList.toggle('no-mesIDDisplay', !power_user.mesIDDisplay_enabled);
    const el = document.getElementById('mesIDDisplayEnabled') as HTMLInputElement | null;
    if (el) el.checked = power_user.mesIDDisplay_enabled;
}

/**
 *
 */
function switchHideChatAvatars() {
    document.body.classList.toggle('hideChatAvatars', power_user.hideChatAvatars_enabled);
    const el = document.getElementById('hideChatAvatarsEnabled') as HTMLInputElement | null;
    if (el) el.checked = power_user.hideChatAvatars_enabled;
}

/**
 *
 */
function switchMessageActions() {
    document.body.classList.toggle('expandMessageActions', power_user.expand_message_actions);
    const el = document.getElementById('expandMessageActions') as HTMLInputElement | null;
    if (el) el.checked = power_user.expand_message_actions;
    document.querySelectorAll('.extraMesButtons, .extraMesButtonsHint').forEach(el => el.removeAttribute('style'));
}

/**
 *
 */
function switchReducedMotion() {
    const osReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (osReduced) {
        power_user.reduced_motion = true;
    }
    document.documentElement.classList.toggle('reduce-motion', power_user.reduced_motion);
    const overrideDuration = power_user.reduced_motion ? 0 : ANIMATION_DURATION_DEFAULT;
    setAnimationDuration(overrideDuration as unknown as null);
    const rmEl = document.getElementById('reduced_motion') as HTMLInputElement | null;
    if (rmEl) rmEl.checked = power_user.reduced_motion;
    if (rmEl) rmEl.disabled = osReduced;
        document.getElementById('reduced_motion')?.closest('label')?.setAttribute('title',
            osReduced
                ? t`Controlled by your operating system's reduced motion setting`
                : t`Disable animations and transitions`,
        );
    document.body.classList.toggle('reduced-motion', power_user.reduced_motion);
}

/**
 *
 */
function switchCompactInputArea() {
    document.getElementById('send_form')?.classList.toggle('compact', power_user.compact_input_area);
    const el = document.getElementById('compact_input_area') as HTMLInputElement | null;
    if (el) el.checked = power_user.compact_input_area;
}

/**
 *
 */
function switchSwipeNumAllMessages() {
    const el = document.getElementById('show_swipe_num_all_messages') as HTMLInputElement | null;
    if (el) el.checked = power_user.show_swipe_num_all_messages;
    document.body.classList.toggle('swipeAllMessages', !!power_user.show_swipe_num_all_messages);
}

const originalSliderValues: { id: string; min: string | null; max: string | null; step: string | null }[] = [];

/**
 *
 * @param root0
 * @param root0.noReset
 */
async function switchLabMode({ noReset = false }: { noReset?: boolean } = {}) {
    /*     if (power_user.enableZenSliders && power_user.enableLabMode) {
            notyf.warning("Can't start Lab Mode while Zen Sliders are active")
            return
            //$("#enableZenSliders").dispatchEvent(new Event('click', { bubbles: true }))
        }
     */
    await delay(100);
    document.body.classList.toggle('enableLabMode', power_user.enableLabMode);
    const labModeEl = document.getElementById('enableLabMode') as HTMLInputElement | null;
    if (labModeEl) labModeEl.checked = power_user.enableLabMode;

    if (power_user.enableLabMode) {
        //save all original slider values into an array
        document.querySelectorAll('#advanced-ai-config-block input').forEach((el: Element) => {
            const id = el.id;
            const min = el.getAttribute('min');
            const max = el.getAttribute('max');
            const step = el.getAttribute('step');
            originalSliderValues.push({ id, min, max, step });
        });
        //console.log(originalSliderValues)
        //remove limits on all inputs and hide sliders
        document.querySelectorAll('#advanced-ai-config-block input').forEach((el: Element) => {
            el.setAttribute('min', '-99999');
            el.setAttribute('max', '99999');
            el.setAttribute('step', '0.001');
        });
        document.getElementById('labModeWarning')?.classList.remove('displayNone');
        //$("#advanced-ai-config-block input[type='range']").style.display = 'none'

        const agcEl = document.getElementById('amount_gen_counter');
        if (agcEl) { agcEl.setAttribute('min', '1'); agcEl.setAttribute('max', '99999'); agcEl.setAttribute('step', '1'); }
        const agEl = document.getElementById('amount_gen');
        if (agEl) { agEl.setAttribute('min', '1'); agEl.setAttribute('max', '99999'); agEl.setAttribute('step', '1'); }
    } else if (!noReset) {
        //re apply the original sliders values to each input
        originalSliderValues.forEach(function (slider) {
            const el = document.getElementById(slider.id);
            if (el) {
                el.setAttribute('min', slider.min ?? '');
                el.setAttribute('max', slider.max ?? '');
                el.setAttribute('step', slider.step ?? '');
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        document.querySelectorAll("#advanced-ai-config-block input[type='range']").forEach((el: Element) => (el as HTMLElement).style.display = '');
        document.getElementById('labModeWarning')?.classList.add('displayNone');

        // To set the correct amount_gen back, we just call the function calculating it correctly
        switchMaxContextSize();
    }
}

/**
 *
 */
async function switchZenSliders() {
    await delay(100);
    document.body.classList.toggle('enableZenSliders', power_user.enableZenSliders);
    const zenEl = document.getElementById('enableZenSliders') as HTMLInputElement | null;
    if (zenEl) zenEl.checked = power_user.enableZenSliders;

    if (power_user.enableZenSliders) {
        const clickSlidersTips = document.getElementById('clickSlidersTips');
        if (clickSlidersTips) clickSlidersTips.style.display = 'none';
        document.querySelectorAll("#pro-settings-block input[type=number]").forEach((el: Element) => (el as HTMLElement).style.display = 'none');
        //hide number inputs that are not 'seed' inputs
        document.querySelectorAll(`#textgenerationwebui_api-settings input[type=number]:not([id^='seed']):not([id^='n_']),
            #kobold_api-settings input[type=number]:not([id^='seed'])`).forEach((el: Element) => (el as HTMLElement).style.display = 'none');
        //hide original sliders
        document.querySelectorAll(`#textgenerationwebui_api-settings input[type='range'],
            #kobold_api-settings input[type='range'],
            #pro-settings-block input[type='range']:not(#max_context)`).forEach((el: Element) => {
            (el as HTMLElement).style.display = 'none';
            CreateZenSliders(el);
        });
        //this is for when zensliders is toggled after pageload
        switchMaxContextSize();
    } else {
        { const el = document.getElementById('clickSlidersTips'); if (el) el.style.display = ''; }
        revertOriginalSliders();
    }

    /**
     *
     */
    function revertOriginalSliders() {
        document.querySelectorAll("#pro-settings-block input[type=number]").forEach((el: Element) => (el as HTMLElement).style.display = '');
        document.querySelectorAll(`#textgenerationwebui_api-settings input[type='number'],
            #kobold_api-settings input[type='number']`).forEach((el: Element) => (el as HTMLElement).style.display = '');
        document.querySelectorAll(`#textgenerationwebui_api-settings input[type='range'],
            #kobold_api-settings input[type='range'],
            #pro-settings-block input[type='range']`).forEach((el: Element) => {
            (el as HTMLElement).style.display = '';
        });
        document.querySelectorAll('div[id$="_zenslider"]').forEach((el: Element) => {
            if ((el as HTMLElement & { noUiSlider?: { destroy: () => void } }).noUiSlider) (el as HTMLElement & { noUiSlider?: { destroy: () => void } }).noUiSlider!.destroy();
            el.remove();
        });
    }
}
/**
 *
 * @param elmnt
 */
async function CreateZenSliders(elmnt: Element) {
    const originalSlider = elmnt as HTMLInputElement;
    const sliderID = originalSlider.id;
    let sliderMin = Number(originalSlider.min);
    let sliderMax = Number(originalSlider.max);
    let sliderValue = Number(originalSlider.value);
    const sliderRange = sliderMax - sliderMin;
    let numSteps = 20;
    let decimals = 2;
    let offVal: number | undefined;
    let allVal: number | undefined;
    let stepScale: number;
    let steps: number[] | undefined;
    if (sliderID == 'amount_gen') {
        decimals = 0;
        steps = [16, 50, 100, 150, 200, 256, 300, 400, 512, 1024];
        sliderMin = 0;
        sliderMax = steps.length - 1;
        stepScale = 1;
        numSteps = 10;
        sliderValue = steps.indexOf(Number(sliderValue));
        if (sliderValue === -1) { sliderValue = 4; } // default to '200' if origSlider has value we can't use
    }
    if (sliderID == 'rep_pen_range_textgenerationwebui') {
        if (power_user.max_context_unlocked) {
            steps = [0, 256, 512, 768, 1024, 2048, 4096, 8192, 16355, 24576, 32768, 49152, 65536, -1];
            numSteps = 13;
            allVal = 13;
        } else {
            steps = [0, 256, 512, 768, 1024, 2048, 4096, 8192, -1];
            numSteps = 8;
            allVal = 8;
        }
        decimals = 0;
        offVal = 0;
        sliderMin = 0;
        sliderMax = steps.length - 1;
        stepScale = 1;
        sliderValue = steps.indexOf(Number(sliderValue));
        if (sliderValue === -1) { sliderValue = allVal; } // default to allValue if origSlider has value we can't use
    }
    //customize decimals
    if (sliderID == 'max_context' ||
        sliderID == 'mirostat_mode_textgenerationwebui' ||
        sliderID == 'mirostat_tau_textgenerationwebui' ||
        sliderID == 'top_k_textgenerationwebui' ||
        sliderID == 'num_beams_textgenerationwebui' ||
        sliderID == 'no_repeat_ngram_size_textgenerationwebui' ||
        sliderID == 'min_length_textgenerationwebui' ||
        sliderID == 'top_k' ||
        sliderID == 'mirostat_mode_kobold' ||
        sliderID == 'rep_pen_range' ||
        sliderID == 'dry_allowed_length_textgenerationwebui' ||
        sliderID == 'rep_pen_decay_textgenerationwebui' ||
        sliderID == 'dry_penalty_last_n_textgenerationwebui' ||
        sliderID == 'max_tokens_second_textgenerationwebui') {
        decimals = 0;
    }
    if (sliderID == 'min_temp_textgenerationwebui' ||
        sliderID == 'max_temp_textgenerationwebui' ||
        sliderID == 'smoothing_curve_textgenerationwebui' ||
        sliderID == 'smoothing_factor_textgenerationwebui' ||
        sliderID == 'dry_multiplier_textgenerationwebui' ||
        sliderID == 'dry_base_textgenerationwebui') {
        decimals = 2;
    }
    if (sliderID == 'eta_cutoff_textgenerationwebui' ||
        sliderID == 'epsilon_cutoff_textgenerationwebui') {
        numSteps = 50;
        decimals = 1;
    }
    if (sliderID == 'nsigma') {
        numSteps = 50;
        decimals = 1;
    }
    //customize steps
    if (sliderID == 'mirostat_mode_textgenerationwebui' ||
        sliderID == 'mirostat_mode_kobold') {
        numSteps = 2;
    }
    if (sliderID == 'encoder_rep_pen_textgenerationwebui') {
        numSteps = 14;
    }
    if (sliderID == 'max_context') {
        numSteps = 15;
    }
    if (sliderID == 'mirostat_tau_textgenerationwebui' ||
        sliderID == 'top_k_textgenerationwebui' ||
        sliderID == 'num_beams_textgenerationwebui' ||
        sliderID == 'no_repeat_ngram_size_textgenerationwebui' ||
        sliderID == 'epsilon_cutoff_textgenerationwebui' ||
        sliderID == 'tfs_textgenerationwebui' ||
        sliderID == 'min_p_textgenerationwebui' ||
        sliderID == 'temp_textgenerationwebui' ||
        sliderID == 'temp') {
        numSteps = 20;
    }
    if (sliderID == 'mirostat_eta_textgenerationwebui' ||
        sliderID == 'penalty_alpha_textgenerationwebui' ||
        sliderID == 'length_penalty_textgenerationwebui' ||
        sliderID == 'min_temp_textgenerationwebui' ||
        sliderID == 'max_temp_textgenerationwebui') {
        numSteps = 50;
    }
    //customize off values
    if (sliderID == 'presence_pen_textgenerationwebui' ||
        sliderID == 'freq_pen_textgenerationwebui' ||
        sliderID == 'mirostat_mode_textgenerationwebui' ||
        sliderID == 'mirostat_mode_kobold' ||
        sliderID == 'mirostat_tau_textgenerationwebui' ||
        sliderID == 'mirostat_tau_kobold' ||
        sliderID == 'mirostat_eta_textgenerationwebui' ||
        sliderID == 'mirostat_eta_kobold' ||
        sliderID == 'min_p_textgenerationwebui' ||
        sliderID == 'min_p' ||
        sliderID == 'no_repeat_ngram_size_textgenerationwebui' ||
        sliderID == 'penalty_alpha_textgenerationwebui' ||
        sliderID == 'length_penalty_textgenerationwebui' ||
        sliderID == 'epsilon_cutoff_textgenerationwebui' ||
        sliderID == 'nsigma' ||
        sliderID == 'rep_pen_range' ||
        sliderID == 'eta_cutoff_textgenerationwebui' ||
        sliderID == 'top_a_textgenerationwebui' ||
        sliderID == 'top_a' ||
        sliderID == 'top_k_textgenerationwebui' ||
        sliderID == 'top_k' ||
        sliderID == 'rep_pen_slope' ||
        sliderID == 'smoothing_factor_textgenerationwebui' ||
        sliderID == 'smoothing_curve_textgenerationwebui' ||
        sliderID == 'skew_textgenerationwebui' ||
        sliderID == 'dry_multiplier_textgenerationwebui' ||
        sliderID == 'min_length_textgenerationwebui') {
        offVal = 0;
    }
    if (sliderID == 'rep_pen_textgenerationwebui' ||
        sliderID == 'rep_pen' ||
        sliderID == 'tfs_textgenerationwebui' ||
        sliderID == 'tfs' ||
        sliderID == 'top_p_textgenerationwebui' ||
        sliderID == 'top_p' ||
        sliderID == 'typical_p_textgenerationwebui' ||
        sliderID == 'typical_p' ||
        sliderID == 'encoder_rep_pen_textgenerationwebui' ||
        sliderID == 'temp_textgenerationwebui' ||
        sliderID == 'temp' ||
        sliderID == 'min_temp_textgenerationwebui' ||
        sliderID == 'max_temp_textgenerationwebui' ||
        sliderID == 'dynatemp_exponent_textgenerationwebui' ||
        sliderID == 'guidance_scale_textgenerationwebui' ||
        sliderID == 'rep_pen_slope_textgenerationwebui' ||
        sliderID == 'guidance_scale') {
        offVal = 1;
    }
    if (sliderID == 'guidance_scale_textgenerationwebui') {
        numSteps = 78;
    }
    if (sliderID == 'top_k_textgenerationwebui') {
        sliderMin = 0;
    }
    //customize amt gen steps
    if (sliderID !== 'amount_gen' && sliderID !== 'rep_pen_range_textgenerationwebui') {
        stepScale = sliderRange / numSteps;
    } else {
        stepScale = 1;
    }

    const newSlider = document.createElement('div');
    newSlider.id = `${sliderID}_zenslider`;
    newSlider.style.width = '100%';
    originalSlider.parentNode!.insertBefore(newSlider, originalSlider);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (noUiSlider as any).create(newSlider, {
        start: [sliderValue],
        step: stepScale,
        range: {
            'min': sliderMin,
            'max': sliderMax,
        },
        tooltips: {
            to: function (value: number) {
                const stepNumber = Math.round((value - sliderMin) / stepScale);
                if (sliderID === 'amount_gen') {
                    return steps ? String(steps[stepNumber] ?? steps[steps.length - 1]) : String(Math.round(value));
                } else if (sliderID === 'rep_pen_range_textgenerationwebui') {
                    if (offVal !== undefined && value === offVal) return 'Off';
                    if (allVal !== undefined && value === allVal) return 'All';
                    return steps ? String(steps[stepNumber] ?? steps[steps.length - 1]) : String(Math.round(value));
                } else {
                    const numStr = Number(value).toFixed(decimals);
                    if (offVal !== undefined && value === offVal) {
                        return 'Off';
                    }
                    return numStr;
                }
            },
            from: function (value: string) {
                if (typeof value === 'string') {
                    if (value === 'Off') return offVal;
                    if (value === 'All') return allVal;
                    return Number(value);
                }
                return Number(value);
            },
        },
    });

    await delay(100);

    const tooltip = newSlider.querySelector('.noUi-tooltip') as HTMLElement | null;

    if (sliderID !== 'amount_gen' && sliderID !== 'rep_pen_range_textgenerationwebui') {
        // Make tooltip contenteditable for manual input
        if (tooltip) {
            tooltip.setAttribute('contenteditable', 'true');

            let isManualInput = false;
            let valueBeforeManualInput = sliderValue;

            tooltip.addEventListener('mousedown', function (this: HTMLElement, e: MouseEvent) {
                e.stopPropagation();
                valueBeforeManualInput = parseFloat((newSlider as unknown as noUiSliderElement).noUiSlider!.get() as string);
                const range = document.createRange();
                range.selectNodeContents(this);
                const selection = window.getSelection();
                if (selection) {
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            });

            tooltip.addEventListener('keyup', function (this: HTMLElement, e: KeyboardEvent) {
                isManualInput = true;
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.blur();
                }
            });

            tooltip.addEventListener('blur', function (this: HTMLElement) {
                const manualInput = parseFloat(parseFloat(this.textContent ?? '0').toFixed(decimals));
                if (isManualInput) {
                    if (manualInput >= sliderMin && manualInput <= sliderMax) {
                        (newSlider as unknown as noUiSliderElement).noUiSlider!.set(manualInput);
                        valueBeforeManualInput = manualInput;
                    } else {
                        notyf.warning(`Invalid value. Must be between ${sliderMin} and ${sliderMax}`);
                        (newSlider as unknown as noUiSliderElement).noUiSlider!.set(valueBeforeManualInput);
                    }
                }
                isManualInput = false;
            });
        }
    }

    // Hide original slider
    originalSlider.style.display = 'none';

    // Sync hidden input on slider changes
    (newSlider as unknown as noUiSliderElement).noUiSlider!.on('update', function (values: unknown, handle: unknown) {
        const rawValue = parseFloat((values as string[])[handle as number]!);
        const stepNumber = Math.round((rawValue - sliderMin) / stepScale);
        let numVal: number;

        if (sliderID === 'amount_gen') {
            const idx = Math.min(stepNumber, (steps ?? []).length - 1);
            numVal = (steps ?? [])[idx]!;
        } else if (sliderID === 'rep_pen_range_textgenerationwebui') {
            const idx = Math.min(stepNumber, (steps ?? []).length - 1);
            numVal = (steps ?? [])[idx]!;
        } else {
            numVal = rawValue;
        }

        originalSlider.value = String(numVal);
        originalSlider.dispatchEvent(new Event('input', { bubbles: true }));
        originalSlider.dispatchEvent(new Event('change', { bubbles: true }));
    });
}
/**
 *
 */
function switchUiMode() {
    document.body.classList.toggle('no-blur', power_user.fast_ui_mode);
    const uiModeEl = document.getElementById('fast_ui_mode') as HTMLInputElement | null;
    if (uiModeEl) uiModeEl.checked = power_user.fast_ui_mode;
    if (power_user.fast_ui_mode) {
        const block = document.getElementById('blur-strength-block');
        if (block) block.style.opacity = '0.2';
        const bsEl = document.getElementById('blur_strength') as HTMLInputElement | null;
        if (bsEl) bsEl.disabled = true;
    } else {
        const block = document.getElementById('blur-strength-block');
        if (block) block.style.opacity = '1';
        const bsEl = document.getElementById('blur_strength') as HTMLInputElement | null;
        if (bsEl) bsEl.disabled = false;
    }
}

/**
 *
 */
function switchWaifuMode() {
    document.body.classList.toggle('waifuMode', power_user.waifuMode);
    const waifuEl = document.getElementById('waifuMode') as HTMLInputElement | null;
    if (waifuEl) waifuEl.checked = power_user.waifuMode;
    scrollChatToBottom();
}

/**
 *
 */
function switchSpoilerMode() {
    if (power_user.spoiler_free_mode) {
        { const el = document.getElementById('descriptionWrapper'); if (el) el.style.display = 'none'; }
        { const el = document.getElementById('firstMessageWrapper'); if (el) el.style.display = 'none'; }
        document.getElementById('spoiler_free_desc')?.classList.add('flex1');
        { const el = document.getElementById('creators_note_desc_hidden'); if (el) el.style.display = ''; }
    } else {
        { const el = document.getElementById('descriptionWrapper'); if (el) el.style.display = ''; }
        { const el = document.getElementById('firstMessageWrapper'); if (el) el.style.display = ''; }
        document.getElementById('spoiler_free_desc')?.classList.remove('flex1');
        { const el = document.getElementById('creators_note_desc_hidden'); if (el) el.style.display = 'none'; }
    }
}

/**
 *
 */
function peekSpoilerMode() {
    const toggleEl = (id: string) => { const el = document.getElementById(id); if (el) el.style.display = el.style.display === 'none' ? '' : 'none'; };
    toggleEl('descriptionWrapper');
    toggleEl('firstMessageWrapper');
    toggleEl('creators_note_desc_hidden');
    document.getElementById('spoiler_free_desc')?.classList.toggle('flex1');
}

/**
 *
 */
function switchMovingUI() {
    document.querySelectorAll('.drawer-content.maximized').forEach(function (el: Element) {
        el.querySelector('.inline-drawer-maximize')?.dispatchEvent(new Event('click'));
    });
    document.body.classList.toggle('movingUI', power_user.movingUI);
    if (power_user.movingUI === true) {
        initMovingUI();
        if (power_user.movingUIState) {
            loadMovingUIState();
        }
    } else {
        if (Object.keys(power_user.movingUIState).length !== 0) {
            power_user.movingUIState = {};
            resetMovablePanels('');
            saveSettingsDebounced();
        }
    }
}

/**
 *
 */
function applyNoShadows() {
    document.body.classList.toggle('noShadows', power_user.noShadows);
    const nsEl = document.getElementById('noShadowsmode') as HTMLInputElement | null;
    if (nsEl) nsEl.checked = power_user.noShadows;
    if (power_user.noShadows) {
        const block = document.getElementById('shadow-width-block');
        if (block) block.style.opacity = '0.2';
        const swEl = document.getElementById('shadow_width') as HTMLInputElement | null;
        if (swEl) swEl.disabled = true;
    } else {
        const block = document.getElementById('shadow-width-block');
        if (block) block.style.opacity = '1';
        const swEl = document.getElementById('shadow_width') as HTMLInputElement | null;
        if (swEl) swEl.disabled = false;
    }
    scrollChatToBottom();
}

/**
 *
 */
function applyAvatarStyle() {
    document.body.classList.toggle('big-avatars', power_user.avatar_style === avatar_styles.RECTANGULAR);
    document.body.classList.toggle('square-avatars', power_user.avatar_style === avatar_styles.SQUARE);
    document.body.classList.toggle('rounded-avatars', power_user.avatar_style === avatar_styles.ROUNDED);
    const avEl = document.getElementById('avatar_style') as HTMLSelectElement | null;
    if (avEl) { avEl.value = String(power_user.avatar_style); }
}
/**
 *
 */
function applyChatDisplay() {
    if (power_user.chat_display === null || power_user.chat_display === undefined) {
        console.debug('applyChatDisplay: saw no chat display type defined');
        power_user.chat_display = chat_styles.DEFAULT;
    }
    console.debug(`poweruser.chat_display ${power_user.chat_display}`);
    const cdEl = document.getElementById('chat_display') as HTMLSelectElement | null;
    if (cdEl) { cdEl.value = String(power_user.chat_display); }

    switch (power_user.chat_display) {
        case 0: {
            console.debug('applying default chat');
            document.body.classList.remove('bubblechat');
            document.body.classList.remove('documentstyle');
            break;
        }
        case 1: {
            console.debug('applying bubblechat');
            document.body.classList.add('bubblechat');
            document.body.classList.remove('documentstyle');
            break;
        }
        case 2: {
            console.debug('applying document style');
            document.body.classList.remove('bubblechat');
            document.body.classList.add('documentstyle');
            break;
        }
    }
}

/**
 *
 */
function applyToastrPosition() {
    if (!toastPositionClasses.includes(power_user.toastr_position)) {
        power_user.toastr_position = defaultToastPosition;
        console.warn(`applyToastrPosition: invalid toastr position, defaulting to ${defaultToastPosition}`);
    }

    // Update notyf position dynamically
    const _posMap: Record<string, {x: string; y: string}> = {
        'toast-top-center': { x: 'center', y: 'top' },
        'toast-top-left': { x: 'left', y: 'top' },
        'toast-top-right': { x: 'right', y: 'top' },
        'toast-bottom-center': { x: 'center', y: 'bottom' },
        'toast-bottom-left': { x: 'left', y: 'bottom' },
        'toast-bottom-right': { x: 'right', y: 'bottom' },
    };
    if (notyf && _posMap[power_user.toastr_position]) {
        notyf.options.position = _posMap[power_user.toastr_position];
    }
    const tpEl = document.getElementById('toastr_position') as HTMLSelectElement | null;
    if (tpEl) tpEl.value = power_user.toastr_position;
    const tpOpt = document.querySelector(`#toastr_position option[value="${power_user.toastr_position}"]`) as HTMLOptionElement | null;
    if (tpOpt) tpOpt.selected = true;
}

/**
 *
 * @param type
 */
function applyChatWidth(type: string) {
    if (type === 'forced') {
        const r = document.documentElement;
        r.style.setProperty('--sheldWidth', `${power_user.chat_width}vw`);
        const cwsEl = document.getElementById('chat_width_slider') as HTMLInputElement | null;
        if (cwsEl) cwsEl.value = String(power_user.chat_width);
        //document.documentElement.style.setProperty('--sheldWidth', power_user.chat_width);
    } else {
        //this is to prevent the slider from updating page in real time
        const chatWidthSlider = document.getElementById('chat_width_slider');
        if (chatWidthSlider) {
            chatWidthSlider.addEventListener('mouseup', async () => {
                // This is a hack for Firefox to let it render before applying the block width.
                // Otherwise it takes the incorrect slider position with the new value AFTER the resizing.
                await delay(1);
                document.documentElement.style.setProperty('--sheldWidth', `${power_user.chat_width}vw`);
                await delay(1);
            });
            chatWidthSlider.addEventListener('touchend', async () => {
                await delay(1);
                document.documentElement.style.setProperty('--sheldWidth', `${power_user.chat_width}vw`);
                await delay(1);
            });
        }
    }

    const cwscEl = document.getElementById('chat_width_slider_counter') as HTMLInputElement | null;
    if (cwscEl) cwscEl.value = String(power_user.chat_width);
}

/**
 *
 * @param type
 */
function applyThemeColor(type: string) {
    if (type === 'main') {
        document.documentElement.style.setProperty('--SmartThemeBodyColor', power_user.main_text_color);
        const color = power_user.main_text_color.split('(')[1]!.split(')')[0]!.split(',');
        document.documentElement.style.setProperty('--SmartThemeCheckboxBgColorR', color[0] ?? '');
        document.documentElement.style.setProperty('--SmartThemeCheckboxBgColorG', color[1] ?? '');
        document.documentElement.style.setProperty('--SmartThemeCheckboxBgColorB', color[2] ?? '');
        document.documentElement.style.setProperty('--SmartThemeCheckboxBgColorA', color[3] ?? '');
    }
    if (type === 'italics') {
        document.documentElement.style.setProperty('--SmartThemeEmColor', power_user.italics_text_color);
    }
    if (type === 'underline') {
        document.documentElement.style.setProperty('--SmartThemeUnderlineColor', power_user.underline_text_color);
    }
    if (type === 'quote') {
        document.documentElement.style.setProperty('--SmartThemeQuoteColor', power_user.quote_text_color);
    }
    /*     if (type === 'fastUIBG') {
            document.documentElement.style.setProperty('--SmartThemeFastUIBGColor', power_user.fastui_bg_color);
        } */
    if (type === 'blurTint') {
        const metaThemeColor = document.querySelector('meta[name=theme-color]');
            document.documentElement.style.setProperty('--SmartThemeBlurTintColor', power_user.blur_tint_color);
            if (metaThemeColor) metaThemeColor.setAttribute('content', power_user.blur_tint_color);
    }
    if (type === 'chatTint') {
        document.documentElement.style.setProperty('--SmartThemeChatTintColor', power_user.chat_tint_color);
    }
    if (type === 'userMesBlurTint') {
        document.documentElement.style.setProperty('--SmartThemeUserMesBlurTintColor', power_user.user_mes_blur_tint_color);
    }
    if (type === 'botMesBlurTint') {
        document.documentElement.style.setProperty('--SmartThemeBotMesBlurTintColor', power_user.bot_mes_blur_tint_color);
    }
    if (type === 'shadow') {
        document.documentElement.style.setProperty('--SmartThemeShadowColor', power_user.shadow_color);
    }
    if (type === 'border') {
        document.documentElement.style.setProperty('--SmartThemeBorderColor', power_user.border_color);
    }
}

/**
 *
 */
function applyCustomCSS() {
    const customCssEl = document.getElementById('customCSS') as HTMLTextAreaElement | null;
    if (customCssEl) customCssEl.value = power_user.custom_css;
    const styleId = 'custom-style';
    let style = document.getElementById(styleId);
    if (!style) {
        style = document.createElement('style');
        style.setAttribute('type', 'text/css');
        style.setAttribute('id', styleId);
        document.head.appendChild(style);
    }
    style.innerHTML = power_user.custom_css;
}

/**
 *
 */
function applyBlurStrength() {
    document.documentElement.style.setProperty('--blurStrength', String(power_user.blur_strength));
    const bscEl = document.getElementById('blur_strength_counter') as HTMLInputElement | null;
    if (bscEl) bscEl.value = String(power_user.blur_strength);
    const bsEl = document.getElementById('blur_strength') as HTMLInputElement | null;
    if (bsEl) bsEl.value = String(power_user.blur_strength);
}

/**
 *
 */
function applyShadowWidth() {
    document.documentElement.style.setProperty('--shadowWidth', String(power_user.shadow_width));
    const swcEl = document.getElementById('shadow_width_counter') as HTMLInputElement | null;
    if (swcEl) swcEl.value = String(power_user.shadow_width);
    const swEl = document.getElementById('shadow_width') as HTMLInputElement | null;
    if (swEl) swEl.value = String(power_user.shadow_width);
}

/**
 *
 * @param type
 */
function applyFontScale(type: string) {
    //this is to allow forced setting on page load, theme swap, etc
    if (type === 'forced') {
        document.documentElement.style.setProperty('--fontScale', String(power_user.font_scale));
    } else {
        //this is to prevent the slider from updating page in real time
        const fontScaleSlider = document.getElementById('font_scale');
        if (fontScaleSlider) {
            fontScaleSlider.addEventListener('mouseup', () => {
                document.documentElement.style.setProperty('--fontScale', String(power_user.font_scale));
            });
            fontScaleSlider.addEventListener('touchend', () => {
                document.documentElement.style.setProperty('--fontScale', String(power_user.font_scale));
            });
        }
    }

    const fscEl = document.getElementById('font_scale_counter') as HTMLInputElement | null;
    if (fscEl) fscEl.value = String(power_user.font_scale);
    const fsEl = document.getElementById('font_scale') as HTMLInputElement | null;
    if (fsEl) fsEl.value = String(power_user.font_scale);
}

/**
 * Checks if the chat needs to be reloaded to apply media display settings.
 * @returns {boolean} True if the chat needs reload to apply media display settings
 */
function isMediaDisplayReloadNeeded() {
    // A user is not currently in a chat.
    const chatId = getCurrentChatId();
    if (!chatId) {
        return false;
    }

    const firstDisplayedIndex = getFirstDisplayedMessageId();
    const hasUnprocessedMediaMessages = (chat as { extra?: { media?: unknown[]; media_display?: unknown } }[]).some((message, index) => {
        // Skip messages that are not currently displayed
        if (index < firstDisplayedIndex) {
            return false;
        }
        const hasMediaAttachments = Array.isArray(message?.extra?.media) && message.extra.media.length > 0;
        const lacksMediaDisplay = !message?.extra?.media_display;
        return hasMediaAttachments && lacksMediaDisplay;
    });

    return hasUnprocessedMediaMessages;
}

/**
 * Shows a toast notification prompting the user to reload the chat if media display settings have changed
 * and there are messages with media attachments that haven't been processed with the new display format.
 */
function showMediaDisplayReloadPrompt() {
    if (!isMediaDisplayReloadNeeded()) {
        return;
    }
    notyf.info(
        t`Reload the chat to apply the changes. Click here to reload.`,
        t`Media Style changed`,
        { onclick: () => void reloadCurrentChat() },
    );
}

/**
 *
 * @param name
 */
function applyTheme(name: string) {
    const theme = themes.find(x => x.name == name);

    if (!theme) {
        return;
    }

    const themeProperties = [
        { key: 'main_text_color', selector: '#main-text-color-picker', type: 'main' },
        { key: 'italics_text_color', selector: '#italics-color-picker', type: 'italics' },
        { key: 'underline_text_color', selector: '#underline-color-picker', type: 'underline' },
        { key: 'quote_text_color', selector: '#quote-color-picker', type: 'quote' },
        { key: 'blur_tint_color', selector: '#blur-tint-color-picker', type: 'blurTint' },
        { key: 'chat_tint_color', selector: '#chat-tint-color-picker', type: 'chatTint' },
        { key: 'user_mes_blur_tint_color', selector: '#user-mes-blur-tint-color-picker', type: 'userMesBlurTint' },
        { key: 'bot_mes_blur_tint_color', selector: '#bot-mes-blur-tint-color-picker', type: 'botMesBlurTint' },
        { key: 'shadow_color', selector: '#shadow-color-picker', type: 'shadow' },
        { key: 'border_color', selector: '#border-color-picker', type: 'border' },
        {
            key: 'blur_strength',
            action: () => {
                applyBlurStrength();
            },
        },
        {
            key: 'custom_css',
            action: () => {
                applyCustomCSS();
            },
        },
        {
            key: 'shadow_width',
            action: () => {
                applyShadowWidth();
            },
        },
        {
            key: 'font_scale',
            action: () => {
                applyFontScale('forced');
            },
        },
        {
            key: 'fast_ui_mode',
            action: () => {
                switchUiMode();
            },
        },
        {
            key: 'waifuMode',
            action: () => {
                switchWaifuMode();
            },
        },
        {
            key: 'chat_display',
            action: () => {
                applyChatDisplay();
            },
        },
        {
            key: 'toastr_position',
            action: () => {
                applyToastrPosition();
            },
        },
        {
            key: 'avatar_style',
            action: () => {
                applyAvatarStyle();
            },
        },
        {
            key: 'noShadows',
            action: () => {
                applyNoShadows();
            },
        },
        {
            key: 'chat_width',
            action: () => {
                // If chat width is not set, set it to 50
                if (!power_user.chat_width) {
                    power_user.chat_width = 50;
                }
                applyChatWidth('forced');
            },
        },
        {
            key: 'timer_enabled',
            action: () => {
                switchTimer();
            },
        },
        {
            key: 'timestamps_enabled',
            action: () => {
                switchTimestamps();
            },
        },
        {
            key: 'timestamp_model_icon',
            action: () => {
                switchIcons();
            },
        },
        {
            key: 'message_token_count_enabled',
            action: () => {
                switchTokenCount();
            },
        },
        {
            key: 'mesIDDisplay_enabled',
            action: () => {
                switchMesIDDisplay();
            },
        },
        {
            key: 'hideChatAvatars_enabled',
            action: () => {
                switchHideChatAvatars();
            },
        },
        {
            key: 'expand_message_actions',
            action: () => {
                switchMessageActions();
            },
        },
        {
            key: 'enableZenSliders',
            action: () => {
                switchMessageActions();
            },
        },
        {
            key: 'enableLabMode',
            action: () => {
                switchMessageActions();
            },
        },
        {
            key: 'hotswap_enabled',
            action: () => {
                switchHotswap();
            },
        },
        {
            key: 'bogus_folders',
            action: () => {
                const el = document.getElementById('bogus_folders') as HTMLInputElement | null;
                if (el) el.checked = power_user.bogus_folders;
                printCharactersDebounced();
            },
            },
            {
            key: 'zoomed_avatar_magnification',
            action: () => {
                const el = document.getElementById('zoomed_avatar_magnification') as HTMLInputElement | null;
                if (el) el.checked = power_user.zoomed_avatar_magnification;
                printCharactersDebounced();
            },
            },
            {
            key: 'reduced_motion',
            action: () => {
                const el = document.getElementById('reduced_motion') as HTMLInputElement | null;
                if (el) el.checked = power_user.reduced_motion;
                switchReducedMotion();
            },
            },
            {
            key: 'compact_input_area',
            action: () => {
                const el = document.getElementById('compact_input_area') as HTMLInputElement | null;
                if (el) el.checked = power_user.compact_input_area;
                switchCompactInputArea();
            },
            },
            {
            key: 'show_swipe_num_all_messages',
            action: () => {
                const el = document.getElementById('show_swipe_num_all_messages') as HTMLInputElement | null;
                if (el) el.checked = power_user.show_swipe_num_all_messages;
                switchSwipeNumAllMessages();
            },
            },
            {
            key: 'click_to_edit',
            action: () => {
                const el = document.getElementById('click_to_edit') as HTMLInputElement | null;
                if (el) el.checked = power_user.click_to_edit;
            },
            },
            {
            key: 'media_display',
            action: (oldValue: unknown, newValue: unknown) => {
                const el = document.getElementById('media_display') as HTMLSelectElement | null;
                if (el) el.value = power_user.media_display;
                if (oldValue !== newValue) {
                    showMediaDisplayReloadPrompt();
                }
            },
        },
    ];

    for (const { key, selector, type, action } of themeProperties) {
        if ((theme as Record<string, unknown>)[key] !== undefined) {
            const oldValue = (power_user as Record<string, unknown>)[key];
            const newValue = (theme as Record<string, unknown>)[key];
            (power_user as Record<string, unknown>)[key] = newValue;
            if (selector) {
                const colorEl = document.querySelector(selector);
                if (colorEl) colorEl.setAttribute('color', String(newValue));
            }
            try {
                if (type) applyThemeColor(type);
                if (action) action(oldValue, newValue);
            } catch (e) {
                console.error(`Error applying theme property "${key}":`, e);
            }
        } else {
            console.debug(`Empty theme key: ${key}`);
        }
    }

    console.log('theme applied: ' + name);
}

/**
 * Registers (or re-registers) the change handler on the themes dropdown.
 * Called after the DOM is ready and again after settings are loaded,
 * because the settings panel DOM may be replaced during initialization
 * which would orphan event listeners registered on earlier elements.
 */
function registerThemeChangeHandler() {
    const el = document.getElementById('themes');
    if (!el) return;
    // Avoid duplicate listeners when called multiple times
    if (el.dataset.themeHandlerRegistered) return;
    el.dataset.themeHandlerRegistered = '1';
    el.addEventListener('change', function () {
        const themeSelected = String((this as HTMLInputElement).value);
        power_user.theme = themeSelected;
        applyTheme(themeSelected);
        saveSettingsDebounced();
    });
}

/**
 *
 *
 * @param name
 */
async function applyMovingUIPreset(name: string) {
    await resetMovablePanels('quiet');
    const movingUIPreset = movingUIPresets.find(x => x.name == name);

    if (!movingUIPreset) {
        return;
    }

    power_user.movingUIState = movingUIPreset.movingUIState;


    console.log('MovingUI Preset applied: ' + name);
    loadMovingUIState();
    saveSettingsDebounced();
}

/**
 * Register a function to be executed when the debug menu is opened.
 * @param {string} functionId Unique ID for the function.
 * @param {string} name Name of the function.
 * @param {string} description Description of the function.
 * @param {function} func Function to be executed.
 */
export function registerDebugFunction(functionId: string, name: string, description: string, func: () => void) {
    debug_functions.push({ functionId, name, description, func });
}

/**
 *
 */
async function showDebugMenu() {
    const template = await renderTemplateAsync('debug', { functions: debug_functions });
    callGenericPopup(template, POPUP_TYPE.TEXT, '', { wide: true, large: true, allowVerticalScrolling: true });
}

/**
 *
 */
export function applyPowerUserSettings() {
    switchUiMode();
    applyFontScale('forced');
    applyThemeColor('');
    // Apply the saved theme CSS on initial load — applyThemeColor() with no args does nothing
    if (power_user.theme && themes.length > 0) {
        applyTheme(power_user.theme);
    }
    applyChatWidth('forced');
    applyAvatarStyle();
    applyBlurStrength();
    applyShadowWidth();
    applyCustomCSS();
    switchMovingUI();
    applyNoShadows();
    switchHotswap();
    switchTimer();
    switchTimestamps();
    switchIcons();
    switchMesIDDisplay();
    switchHideChatAvatars();
    switchTokenCount();
    switchMessageActions();
    switchSwipeNumAllMessages();
}

/**
 *
 */
export function applyStylePins() {
    try {
        const existingPins = document.querySelector('#chat > .style-pins');
        if (existingPins) {
            existingPins.remove();
        }

        if (!power_user.pin_styles) {
            return;
        }

        const firstDisplayed = getFirstDisplayedMessageId();
        if (firstDisplayed === 0 || !isFinite(firstDisplayed)) {
            return;
        }

        const chatElement = document.getElementById('chat');
        if (!chatElement) {
            return;
        }

        const firstMessage = chat[0];
        if (!firstMessage) {
            return;
        }

        const formattedMessage = messageFormatting((firstMessage as Record<string, unknown>).mes as string, (firstMessage as Record<string, unknown>).name as string, (firstMessage as Record<string, unknown>).is_system as boolean, (firstMessage as Record<string, unknown>).is_user as boolean, 0, {}, false);
        const htmlElement = document.createElement('div');
        htmlElement.innerHTML = formattedMessage;

        const styleTags = htmlElement.querySelectorAll('style');
        if (styleTags.length === 0) {
            return;
        }

        const pinsElement = document.createElement('div');
        pinsElement.classList.add('style-pins');
        pinsElement.append(...Array.from(styleTags));
        chatElement.prepend(pinsElement);
    } catch (error) {
        console.error('Error applying style pins:', error);
    }
}

/**
 *
 */
function getExampleMessagesBehavior() {
    if (power_user.strip_examples) {
        return 'strip';
    }

    if (power_user.pin_examples) {
        return 'keep';
    }

    return 'normal';
}

//MARK: loadPowerUser
/**
 *
 * @param settings
 * @param data
 */
export async function loadPowerUserSettings(settings: Record<string, unknown>, data: Record<string, unknown>) {
    const defaultStscript = JSON.parse(JSON.stringify(power_user.stscript));
    // Load from settings.json
    const pu = settings.power_user as Record<string, unknown> | undefined;
    if (pu !== undefined) {
        // Migrate old preference to a new setting
        if (pu.click_to_edit === undefined && pu.chat_display === chat_styles.DOCUMENT) {
            pu.click_to_edit = true;
        }
        if (Object.hasOwn(pu, 'auto_sort_tags') && !Object.hasOwn(pu, 'tag_sort_mode')) {
            pu.tag_sort_mode = pu.auto_sort_tags ? tag_sort_mode.ALPHABETICAL : tag_sort_mode.MANUAL;
            delete pu.auto_sort_tags;
        }
        Object.assign(power_user, pu);
    }

    if (power_user.stscript === undefined) {
        power_user.stscript = defaultStscript;
    } else {
        if (power_user.stscript.autocomplete === undefined) {
            power_user.stscript.autocomplete = defaultStscript.autocomplete;
        } else {
            if (power_user.stscript.autocomplete.state === undefined) {
                power_user.stscript.autocomplete.state = defaultStscript.autocomplete.state;
            }
            if (power_user.stscript.autocomplete.width === undefined) {
                power_user.stscript.autocomplete.width = defaultStscript.autocomplete.width;
            }
            if (power_user.stscript.autocomplete.font === undefined) {
                power_user.stscript.autocomplete.font = defaultStscript.autocomplete.font;
            }
            if (power_user.stscript.autocomplete.style === undefined) {
                power_user.stscript.autocomplete.style = (power_user.stscript as Record<string, unknown>).autocomplete_style as string || defaultStscript.autocomplete.style;
            }
            if (power_user.stscript.autocomplete.select === undefined) {
                power_user.stscript.autocomplete.select = defaultStscript.autocomplete.select;
            }
            if (power_user.stscript.autocomplete.showInAllMacroFields === undefined) {
                power_user.stscript.autocomplete.showInAllMacroFields = defaultStscript.autocomplete.showInAllMacroFields;
            }
        }
        if (power_user.stscript.parser === undefined) {
            power_user.stscript.parser = defaultStscript.parser;
        } else if (power_user.stscript.parser.flags === undefined) {
            power_user.stscript.parser.flags = defaultStscript.parser.flags;
        }

        // Cleanup old flags
        delete (power_user.stscript as Record<string, unknown>).autocomplete_style;
    }

    if (data.themes !== undefined) {
        themes = data.themes as Theme[];
    }

    if (data.movingUIPresets !== undefined) {
        movingUIPresets = data.movingUIPresets as MovingUIPreset[];
    }


    if (data.context !== undefined) {
        context_presets = data.context as ContextSettings[];
    }

    if (typeof power_user.chat_display !== 'number') {
        power_user.chat_display = chat_styles.DEFAULT;
    }

    if (typeof power_user.waifuMode !== 'boolean') {
        power_user.waifuMode = false;
    }

    if (typeof power_user.chat_width !== 'number') {
        power_user.chat_width = 50;
    }

    if ((power_user as Record<string, unknown>).tokenizer === 0) {
        power_user.tokenizer = tokenizers.GPT2;
    }

    // Clean up old/legacy settings
    if (power_user.import_card_tags !== undefined) {
        power_user.tag_import_setting = power_user.import_card_tags ? tag_import_setting.ASK : tag_import_setting.NONE;
        delete power_user.import_card_tags;
    }

    if ((power_user.instruct as Record<string, unknown>).derived === true) {
        power_user.instruct_derived = true;
        delete (power_user.instruct as Record<string, unknown>).derived;
    }

    // Reset the saved chat template hash
    power_user.chat_template_hash = '';

    const singleLineEl = document.getElementById('single_line') as HTMLInputElement | null;
    if (singleLineEl) singleLineEl.checked = power_user.single_line;
    const relaxedApiUrlsEl = document.getElementById('relaxed_api_urls') as HTMLInputElement | null;
    if (relaxedApiUrlsEl) relaxedApiUrlsEl.checked = power_user.relaxed_api_urls;
    const worldImportDialogEl = document.getElementById('world_import_dialog') as HTMLInputElement | null;
    if (worldImportDialogEl) worldImportDialogEl.checked = power_user.world_import_dialog;
    const enableAutoSelectInputEl = document.getElementById('enable_auto_select_input') as HTMLInputElement | null;
    if (enableAutoSelectInputEl) enableAutoSelectInputEl.checked = power_user.enable_auto_select_input;
    const enableMdHotkeysEl = document.getElementById('enable_md_hotkeys') as HTMLInputElement | null;
    if (enableMdHotkeysEl) enableMdHotkeysEl.checked = power_user.enable_md_hotkeys;
    const trimSpacesEl = document.getElementById('trim_spaces') as HTMLInputElement | null;
    if (trimSpacesEl) trimSpacesEl.checked = power_user.trim_spaces;
    const continueOnSendEl = document.getElementById('continue_on_send') as HTMLInputElement | null;
    if (continueOnSendEl) continueOnSendEl.checked = power_user.continue_on_send;
    const quickContinueEl = document.getElementById('quick_continue') as HTMLInputElement | null;
    if (quickContinueEl) quickContinueEl.checked = power_user.quick_continue;
    const quickImpersonateEl = document.getElementById('quick_impersonate') as HTMLInputElement | null;
    if (quickImpersonateEl) quickImpersonateEl.checked = power_user.quick_continue;
    const mcEl = document.getElementById('mes_continue');
    if (mcEl) mcEl.style.display = power_user.quick_continue ? '' : 'none';
    const miEl = document.getElementById('mes_impersonate');
    if (miEl) miEl.style.display = power_user.quick_impersonate ? '' : 'none';
    const gesturesCheckboxEl = document.getElementById('gestures-checkbox') as HTMLInputElement | null;
    if (gesturesCheckboxEl) gesturesCheckboxEl.checked = power_user.gestures;
    const autoSwipeEl = document.getElementById('auto_swipe') as HTMLInputElement | null;
    if (autoSwipeEl) autoSwipeEl.checked = power_user.auto_swipe;
    (document.getElementById('auto_swipe_minimum_length') as HTMLInputElement).value = String(power_user.auto_swipe_minimum_length);
    (document.getElementById('auto_swipe_blacklist') as HTMLInputElement).value = power_user.auto_swipe_blacklist.join(', ');
    (document.getElementById('auto_swipe_blacklist_threshold') as HTMLInputElement).value = String(power_user.auto_swipe_blacklist_threshold);
    (document.getElementById('custom_stopping_strings') as HTMLTextAreaElement).textContent = power_user.custom_stopping_strings;
    const customStoppingStringsMacroEl = document.getElementById('custom_stopping_strings_macro') as HTMLInputElement | null;
    if (customStoppingStringsMacroEl) customStoppingStringsMacroEl.checked = power_user.custom_stopping_strings_macro;
    const fuzzySearchCheckboxEl = document.getElementById('fuzzy_search_checkbox') as HTMLInputElement | null;
    if (fuzzySearchCheckboxEl) fuzzySearchCheckboxEl.checked = power_user.fuzzy_search;
    const personaShowNotificationsEl = document.getElementById('persona_show_notifications') as HTMLInputElement | null;
    if (personaShowNotificationsEl) personaShowNotificationsEl.checked = power_user.persona_show_notifications;
    const personaAllowMultiConnectionsEl = document.getElementById('persona_allow_multi_connections') as HTMLInputElement | null;
    if (personaAllowMultiConnectionsEl) personaAllowMultiConnectionsEl.checked = power_user.persona_allow_multi_connections;
    const personaAutoLockEl = document.getElementById('persona_auto_lock') as HTMLInputElement | null;
    if (personaAutoLockEl) personaAutoLockEl.checked = power_user.persona_auto_lock;
    const encodeTagsEl = document.getElementById('encode_tags') as HTMLInputElement | null;
    if (encodeTagsEl) encodeTagsEl.checked = power_user.encode_tags;
    const experimentalMacroEngineEl = document.getElementById('experimental_macro_engine') as HTMLInputElement | null;
    if (experimentalMacroEngineEl) experimentalMacroEngineEl.checked = power_user.experimental_macro_engine;
    (document.getElementById('example_messages_behavior') as HTMLSelectElement).value = getExampleMessagesBehavior();
    const embOpt = document.querySelector(`#example_messages_behavior option[value="${getExampleMessagesBehavior()}"]`) as HTMLOptionElement | null;
    if (embOpt) embOpt.selected = true;
    document.getElementById('instruct_derived')?.parentElement?.querySelector('i')?.classList.toggle('toggleEnabled', !!power_user.instruct_derived);
    document.getElementById('context_derived')?.parentElement?.querySelector('i')?.classList.toggle('toggleEnabled', !!power_user.context_derived);
    const contextSizeDerivedEl = document.getElementById('context_size_derived') as HTMLInputElement | null;
    if (contextSizeDerivedEl) contextSizeDerivedEl.checked = !!power_user.context_size_derived;
    const consoleLogPromptsEl = document.getElementById('console_log_prompts') as HTMLInputElement | null;
    if (consoleLogPromptsEl) consoleLogPromptsEl.checked = power_user.console_log_prompts;
    const requestTokenProbabilitiesEl = document.getElementById('request_token_probabilities') as HTMLInputElement | null;
    if (requestTokenProbabilitiesEl) requestTokenProbabilitiesEl.checked = power_user.request_token_probabilities;
    const showGroupChatQueueEl = document.getElementById('show_group_chat_queue') as HTMLInputElement | null;
    if (showGroupChatQueueEl) showGroupChatQueueEl.checked = power_user.show_group_chat_queue;
    const autoFixGeneratedMarkdownEl = document.getElementById('auto_fix_generated_markdown') as HTMLInputElement | null;
    if (autoFixGeneratedMarkdownEl) autoFixGeneratedMarkdownEl.checked = power_user.auto_fix_generated_markdown;
    const autoScrollChatToBottomEl = document.getElementById('auto_scroll_chat_to_bottom') as HTMLInputElement | null;
    if (autoScrollChatToBottomEl) autoScrollChatToBottomEl.checked = power_user.auto_scroll_chat_to_bottom;
    const bogusFoldersEl = document.getElementById('bogus_folders') as HTMLInputElement | null;
    if (bogusFoldersEl) bogusFoldersEl.checked = power_user.bogus_folders;
    const zoomedAvatarMagnificationEl = document.getElementById('zoomed_avatar_magnification') as HTMLInputElement | null;
    if (zoomedAvatarMagnificationEl) zoomedAvatarMagnificationEl.checked = power_user.zoomed_avatar_magnification;
    const tokOpt = document.querySelector(`#tokenizer option[value="${power_user.tokenizer}"]`) as HTMLOptionElement | null;
    if (tokOpt) tokOpt.selected = true;
    const sendOpt = document.querySelector(`#send_on_enter option[value="${power_user.send_on_enter}"]`) as HTMLOptionElement | null;
    if (sendOpt) sendOpt.selected = true;
    const confirmMessageDeleteEl = document.getElementById('confirm_message_delete') as HTMLInputElement | null;
    if (confirmMessageDeleteEl) confirmMessageDeleteEl.checked = power_user.confirm_message_delete !== undefined ? !!power_user.confirm_message_delete : true;
    const spoilerFreeModeEl = document.getElementById('spoiler_free_mode') as HTMLInputElement | null;
    if (spoilerFreeModeEl) spoilerFreeModeEl.checked = power_user.spoiler_free_mode;
    const collapseNewlinesCheckboxEl = document.getElementById('collapse-newlines-checkbox') as HTMLInputElement | null;
    if (collapseNewlinesCheckboxEl) collapseNewlinesCheckboxEl.checked = power_user.collapse_newlines;
    const alwaysForceName2CheckboxEl = document.getElementById('always-force-name2-checkbox') as HTMLInputElement | null;
    if (alwaysForceName2CheckboxEl) alwaysForceName2CheckboxEl.checked = power_user.always_force_name2;
    const trimSentencesCheckboxEl = document.getElementById('trim_sentences_checkbox') as HTMLInputElement | null;
    if (trimSentencesCheckboxEl) trimSentencesCheckboxEl.checked = power_user.trim_sentences;
    const disableGroupTrimmingEl = document.getElementById('disable_group_trimming') as HTMLInputElement | null;
    if (disableGroupTrimmingEl) disableGroupTrimmingEl.checked = power_user.disable_group_trimming;
    (document.getElementById('markdown_escape_strings') as HTMLInputElement).value = power_user.markdown_escape_strings;
    const fastUiModeEl = document.getElementById('fast_ui_mode') as HTMLInputElement | null;
    if (fastUiModeEl) fastUiModeEl.checked = power_user.fast_ui_mode;
    const waifuModeEl = document.getElementById('waifuMode') as HTMLInputElement | null;
    if (waifuModeEl) waifuModeEl.checked = power_user.waifuMode;
    const movingUImodeEl = document.getElementById('movingUImode') as HTMLInputElement | null;
    if (movingUImodeEl) movingUImodeEl.checked = power_user.movingUI;
    const noShadowsmodeEl = document.getElementById('noShadowsmode') as HTMLInputElement | null;
    if (noShadowsmodeEl) noShadowsmodeEl.checked = power_user.noShadows;
    (document.getElementById('start_reply_with') as HTMLTextAreaElement).textContent = power_user.user_prompt_bias;
    const chatShowReplyPrefixCheckboxEl = document.getElementById('chat-show-reply-prefix-checkbox') as HTMLInputElement | null;
    if (chatShowReplyPrefixCheckboxEl) chatShowReplyPrefixCheckboxEl.checked = power_user.show_user_prompt_bias;
    const autoContinueEnabledEl = document.getElementById('auto_continue_enabled') as HTMLInputElement | null;
    if (autoContinueEnabledEl) autoContinueEnabledEl.checked = power_user.auto_continue.enabled;
    const autoContinueAllowChatCompletionsEl = document.getElementById('auto_continue_allow_chat_completions') as HTMLInputElement | null;
    if (autoContinueAllowChatCompletionsEl) autoContinueAllowChatCompletionsEl.checked = power_user.auto_continue.allow_chat_completions;
    (document.getElementById('auto_continue_target_length') as HTMLInputElement).value = String(power_user.auto_continue.target_length);
    const playMessageSoundEl = document.getElementById('play_message_sound') as HTMLInputElement | null;
    if (playMessageSoundEl) playMessageSoundEl.checked = power_user.play_message_sound;
    const playSoundUnfocusedEl = document.getElementById('play_sound_unfocused') as HTMLInputElement | null;
    if (playSoundUnfocusedEl) playSoundUnfocusedEl.checked = power_user.play_sound_unfocused;
    const neverResizeAvatarsEl = document.getElementById('never_resize_avatars') as HTMLInputElement | null;
    if (neverResizeAvatarsEl) neverResizeAvatarsEl.checked = power_user.never_resize_avatars;
    const showCardAvatarUrlsEl = document.getElementById('show_card_avatar_urls') as HTMLInputElement | null;
    if (showCardAvatarUrlsEl) showCardAvatarUrlsEl.checked = power_user.show_card_avatar_urls;
    const autoSaveMsgEditsEl = document.getElementById('auto_save_msg_edits') as HTMLInputElement | null;
    if (autoSaveMsgEditsEl) autoSaveMsgEditsEl.checked = power_user.auto_save_msg_edits;
    const allowName1DisplayEl = document.getElementById('allow_name1_display') as HTMLInputElement | null;
    if (allowName1DisplayEl) allowName1DisplayEl.checked = power_user.allow_name1_display;
    const allowName2DisplayEl = document.getElementById('allow_name2_display') as HTMLInputElement | null;
    if (allowName2DisplayEl) allowName2DisplayEl.checked = power_user.allow_name2_display;
    //document.getElementById('removeXML')?.checked = power_user.removeXML;
    const hotswapEnabledEl = document.getElementById('hotswapEnabled') as HTMLInputElement | null;
    if (hotswapEnabledEl) hotswapEnabledEl.checked = power_user.hotswap_enabled;
    const messageTimerEnabledEl = document.getElementById('messageTimerEnabled') as HTMLInputElement | null;
    if (messageTimerEnabledEl) messageTimerEnabledEl.checked = power_user.timer_enabled;
    const messageTimestampsEnabledEl = document.getElementById('messageTimestampsEnabled') as HTMLInputElement | null;
    if (messageTimestampsEnabledEl) messageTimestampsEnabledEl.checked = power_user.timestamps_enabled;
    const messageModelIconEnabledEl = document.getElementById('messageModelIconEnabled') as HTMLInputElement | null;
    if (messageModelIconEnabledEl) messageModelIconEnabledEl.checked = power_user.timestamp_model_icon;
    const mesIDDisplayEnabledEl = document.getElementById('mesIDDisplayEnabled') as HTMLInputElement | null;
    if (mesIDDisplayEnabledEl) mesIDDisplayEnabledEl.checked = power_user.mesIDDisplay_enabled;
    const hideChatAvatarsEnabledEl = document.getElementById('hideChatAvatarsEnabled') as HTMLInputElement | null;
    if (hideChatAvatarsEnabledEl) hideChatAvatarsEnabledEl.checked = power_user.hideChatAvatars_enabled;
    const preferCharacterPromptEl = document.getElementById('prefer_character_prompt') as HTMLInputElement | null;
    if (preferCharacterPromptEl) preferCharacterPromptEl.checked = power_user.prefer_character_prompt;
    const preferCharacterJailbreakEl = document.getElementById('prefer_character_jailbreak') as HTMLInputElement | null;
    if (preferCharacterJailbreakEl) preferCharacterJailbreakEl.checked = power_user.prefer_character_jailbreak;
    const enableZenSlidersEl = document.getElementById('enableZenSliders') as HTMLInputElement | null;
    if (enableZenSlidersEl) enableZenSlidersEl.checked = power_user.enableZenSliders;
    (document.getElementById('enableZenSliders') as HTMLInputElement | null)?.dispatchEvent(new Event('input', { bubbles: true }));
    const enableLabModeEl = document.getElementById('enableLabMode') as HTMLInputElement | null;
    if (enableLabModeEl) enableLabModeEl.checked = power_user.enableLabMode;
    (document.getElementById('enableLabMode') as HTMLInputElement | null)?.dispatchEvent(new Event('input', { bubbles: true }));
    const avStyle = document.querySelector(`input[name="avatar_style"][value="${power_user.avatar_style}"]`) as HTMLInputElement | null;
    if (avStyle) avStyle.checked = true;
    const cdOpt = document.querySelector(`#chat_display option[value="${power_user.chat_display}"]`) as HTMLOptionElement | null;
    if (cdOpt) { cdOpt.selected = true; cdOpt.dispatchEvent(new Event('change', { bubbles: true })); }
    const tpOpt2 = document.querySelector(`#toastr_position option[value="${power_user.toastr_position}"]`) as HTMLOptionElement | null;
    if (tpOpt2) { tpOpt2.selected = true; tpOpt2.dispatchEvent(new Event('change', { bubbles: true })); }
    (document.getElementById('chat_width_slider') as HTMLInputElement).value = String(power_user.chat_width);
    (document.getElementById('token_padding') as HTMLInputElement).value = String(power_user.token_padding);
    (document.getElementById('aux_field') as HTMLInputElement).value = power_user.aux_field;
    (document.getElementById('tag_import_setting') as HTMLSelectElement).value = String(power_user.tag_import_setting);
    (document.getElementById('stscript_autocomplete_state') as HTMLInputElement).value = String(power_user.stscript.autocomplete.state);
    (document.getElementById('stscript_autocomplete_state') as HTMLInputElement | null)?.dispatchEvent(new Event('input', { bubbles: true }));
    const stscriptAutocompleteAutoHideEl = document.getElementById('stscript_autocomplete_autoHide') as HTMLInputElement | null;
    if (stscriptAutocompleteAutoHideEl) stscriptAutocompleteAutoHideEl.checked = power_user.stscript.autocomplete.autoHide ?? false;
    (document.getElementById('stscript_autocomplete_autoHide') as HTMLInputElement | null)?.dispatchEvent(new Event('input', { bubbles: true }));
    const stscriptAutocompleteShowInAllMacroFieldsEl = document.getElementById('stscript_autocomplete_showInAllMacroFields') as HTMLInputElement | null;
    if (stscriptAutocompleteShowInAllMacroFieldsEl) stscriptAutocompleteShowInAllMacroFieldsEl.checked = power_user.stscript.autocomplete.showInAllMacroFields ?? false;
    (document.getElementById('stscript_autocomplete_showInAllMacroFields') as HTMLInputElement | null)?.dispatchEvent(new Event('input', { bubbles: true }));
    (document.getElementById('stscript_matching') as HTMLSelectElement).value = String(power_user.stscript.matching ?? 'fuzzy');
    (document.getElementById('stscript_autocomplete_style') as HTMLSelectElement).value = String(power_user.stscript.autocomplete.style ?? 'theme');
    document.body.setAttribute('data-stscript-style', power_user.stscript.autocomplete.style);
    (document.getElementById('stscript_autocomplete_select') as HTMLSelectElement).value = String(power_user.stscript.autocomplete.select ?? (AUTOCOMPLETE_SELECT_KEY.TAB + AUTOCOMPLETE_SELECT_KEY.ENTER));
    const stscriptParserFlagStrictEscapingEl = document.getElementById('stscript_parser_flag_strict_escaping') as HTMLInputElement | null;
    if (stscriptParserFlagStrictEscapingEl) stscriptParserFlagStrictEscapingEl.checked = power_user.stscript.parser.flags[PARSER_FLAG.STRICT_ESCAPING] ?? false;
    const stscriptParserFlagReplaceGetvarEl = document.getElementById('stscript_parser_flag_replace_getvar') as HTMLInputElement | null;
    if (stscriptParserFlagReplaceGetvarEl) stscriptParserFlagReplaceGetvarEl.checked = power_user.stscript.parser.flags[PARSER_FLAG.REPLACE_GETVAR] ?? false;
    const fontScale = power_user.stscript.autocomplete.font.scale ?? defaultStscript.autocomplete.font.scale;
    (document.getElementById('stscript_autocomplete_font_scale') as HTMLInputElement).value = String(fontScale);
    (document.getElementById('stscript_autocomplete_font_scale_counter') as HTMLInputElement).value = String(fontScale);
    document.body.style.setProperty('--ac-font-scale', String(fontScale));
    (document.getElementById('stscript_autocomplete_width_left') as HTMLInputElement).value = String(power_user.stscript.autocomplete.width.left ?? AUTOCOMPLETE_WIDTH.CHAT);
    document.querySelector('#stscript_autocomplete_width_left')?.dispatchEvent(new Event('input', { bubbles: true }));
    (document.getElementById('stscript_autocomplete_width_right') as HTMLInputElement).value = String(power_user.stscript.autocomplete.width.right ?? AUTOCOMPLETE_WIDTH.CHAT);
    document.querySelector('#stscript_autocomplete_width_right')?.dispatchEvent(new Event('input', { bubbles: true }));

    const restoreUserInputEl = document.getElementById('restore_user_input') as HTMLInputElement | null;
    if (restoreUserInputEl) restoreUserInputEl.checked = power_user.restore_user_input;
    (document.getElementById('chat_truncation') as HTMLInputElement).value = String(power_user.chat_truncation);
    (document.getElementById('chat_truncation_counter') as HTMLInputElement).value = String(power_user.chat_truncation);
    (document.getElementById('streaming_fps') as HTMLInputElement).value = String(power_user.streaming_fps);
    (document.getElementById('streaming_fps_counter') as HTMLInputElement).value = String(power_user.streaming_fps);
    const smoothStreamingEl = document.getElementById('smooth_streaming') as HTMLInputElement | null;
    if (smoothStreamingEl) smoothStreamingEl.checked = power_user.smooth_streaming;
    const smoothStreamingNoThinkEl = document.getElementById('smooth_streaming_no_think') as HTMLInputElement | null;
    if (smoothStreamingNoThinkEl) smoothStreamingNoThinkEl.checked = power_user.smooth_streaming_no_think;
    (document.getElementById('smooth_streaming_speed') as HTMLInputElement).value = String(power_user.smooth_streaming_speed);
    const streamFadeInEl = document.getElementById('stream_fade_in') as HTMLInputElement | null;
    if (streamFadeInEl) streamFadeInEl.checked = power_user.stream_fade_in;
    const enableCodeExecutionEl = document.getElementById('enable_code_execution') as HTMLInputElement | null;
    if (enableCodeExecutionEl) enableCodeExecutionEl.checked = power_user.enable_code_execution;
    const autoRunCodeEl = document.getElementById('auto_run_code') as HTMLInputElement | null;
    if (autoRunCodeEl) autoRunCodeEl.checked = power_user.auto_run_code;
    (document.getElementById('font_scale') as HTMLInputElement).value = String(power_user.font_scale);
    (document.getElementById('font_scale_counter') as HTMLInputElement).value = String(power_user.font_scale);
    (document.getElementById('blur_strength') as HTMLInputElement).value = String(power_user.blur_strength);
    (document.getElementById('blur_strength_counter') as HTMLInputElement).value = String(power_user.blur_strength);
    (document.getElementById('shadow_width') as HTMLInputElement).value = String(power_user.shadow_width);
    (document.getElementById('shadow_width_counter') as HTMLInputElement).value = String(power_user.shadow_width);
    const pickerIds = ['main-text-color-picker', 'italics-color-picker', 'underline-color-picker', 'quote-color-picker',
        'blur-tint-color-picker', 'chat-tint-color-picker', 'user-mes-blur-tint-color-picker',
        'bot-mes-blur-tint-color-picker', 'shadow-color-picker', 'border-color-picker'];
    const pickerValues = [power_user.main_text_color, power_user.italics_text_color, power_user.underline_text_color,
        power_user.quote_text_color, power_user.blur_tint_color, power_user.chat_tint_color,
        power_user.user_mes_blur_tint_color, power_user.bot_mes_blur_tint_color, power_user.shadow_color,
        power_user.border_color];
    pickerIds.forEach((id, i) => {
        const el = document.getElementById(id);
        if (el && pickerValues[i] !== undefined) el.setAttribute('color', pickerValues[i]!);
    });
    const reducedMotionEl = document.getElementById('reduced_motion') as HTMLInputElement | null;
    if (reducedMotionEl) reducedMotionEl.checked = power_user.reduced_motion;
    const autoConnectCheckboxEl = document.getElementById('auto-connect-checkbox') as HTMLInputElement | null;
    if (autoConnectCheckboxEl) autoConnectCheckboxEl.checked = power_user.auto_connect;
    const autoLoadChatCheckboxEl = document.getElementById('auto-load-chat-checkbox') as HTMLInputElement | null;
    if (autoLoadChatCheckboxEl) autoLoadChatCheckboxEl.checked = power_user.auto_load_chat;
    const forbidExternalMediaEl = document.getElementById('forbid_external_media') as HTMLInputElement | null;
    if (forbidExternalMediaEl) forbidExternalMediaEl.checked = power_user.forbid_external_media;
    const pinStylesEl = document.getElementById('pin_styles') as HTMLInputElement | null;
    if (pinStylesEl) pinStylesEl.checked = power_user.pin_styles;
    const clickToEditEl = document.getElementById('click_to_edit') as HTMLInputElement | null;
    if (clickToEditEl) clickToEditEl.checked = power_user.click_to_edit;
    (document.getElementById('media_display') as HTMLSelectElement).value = power_user.media_display;
    (document.getElementById('image_overswipe') as HTMLSelectElement).value = power_user.image_overswipe;

    for (const theme of themes) {
        const option = document.createElement('option');
        option.value = theme.name;
        option.innerText = theme.name;
        option.selected = theme.name == power_user.theme;
        document.getElementById('themes')?.appendChild(option);
    }

    for (const movingUIPreset of movingUIPresets) {
        const option = document.createElement('option');
        option.value = movingUIPreset.name;
        option.innerText = movingUIPreset.name;
        option.selected = movingUIPreset.name == power_user.movingUIPreset;
        document.getElementById('movingUIPresets')?.appendChild(option);
    }


    const sortOpt = document.querySelector(`#character_sort_order option[data-order="${power_user.sort_order}"][data-field="${power_user.sort_field}"]`) as HTMLOptionElement | null;
    if (sortOpt) sortOpt.selected = true;
    switchReducedMotion();
    switchCompactInputArea();
    reloadMarkdownProcessor();
    await loadInstructMode(data);
    await loadContextSettings();
    await loadSystemPrompts(data);
    await loadReasoningTemplates(data);
    loadMaxContextUnlocked();
    switchWaifuMode();
    switchSpoilerMode();
    loadMovingUIState();
    loadCharListState();
    toggleMDHotkeyIconDisplay();
    applyToastrPosition();
    // Re-attach settings panel handlers — DOM may have been replaced during init
    registerSettingsPanelHandlers();
    // Re-attach theme change handler — settings panel DOM may have been replaced during init
    registerThemeChangeHandler();
}

/**
 *
 */
function toggleMDHotkeyIconDisplay() {
    if (power_user.enable_md_hotkeys) {
        document.querySelectorAll('.mdhotkey_location').forEach(function (el: Element) {
            (el.parentElement ?? el).insertAdjacentHTML('beforeend', '<i class="fa-brands fa-markdown mdhotkey_icon"></i>');
        });
    } else {
        document.querySelectorAll('.mdhotkey_icon').forEach(el => el.remove());
    }
}

/**
 *
 */
function loadCharListState() {
    document.body.classList.toggle('charListGrid', power_user.charListGrid);
}

/**
 *
 */
export function loadMovingUIState() {
    if (!isMobile()
        && power_user.movingUIState
        && power_user.movingUI === true) {
        console.debug('loading movingUI state');
        for (const elmntName of Object.keys(power_user.movingUIState)) {
                const elmntState = (power_user.movingUIState as Record<string, Record<string, string>>)[elmntName]!;
                try {
                    const elmnt = document.getElementById(elmntName);
                    if (elmnt) {
                        console.debug(`loading state for ${elmntName}`);
                        for (const [prop, value] of Object.entries(elmntState)) {
                            (elmnt as HTMLElement).style.setProperty(prop, value, 'important');
                        }
                } else {
                    console.debug(`skipping ${elmntName} because it doesn't exist in the DOM`);
                }
            } catch (err) {
                console.debug(`error occurred while processing ${elmntName}: ${err}`);
            }
        }
    } else {
        console.debug('skipping movingUI state load');
        return;
    }
}

/**
 *
 */
function loadMaxContextUnlocked() {
    const maxContextUnlocked = document.getElementById('max_context_unlocked') as HTMLInputElement | null;
    if (maxContextUnlocked) {
        maxContextUnlocked.checked = power_user.max_context_unlocked;
        maxContextUnlocked.addEventListener('change', function (this: HTMLInputElement) {
            power_user.max_context_unlocked = !!(this as HTMLInputElement).checked;
            switchMaxContextSize();
            saveSettingsDebounced();
        });
    }
    switchMaxContextSize();
}

/**
 *
 */
function switchMaxContextSize() {
    const elements = [
        document.getElementById('max_context'),
        document.getElementById('max_context_counter'),
        document.getElementById('rep_pen_range'),
        document.getElementById('rep_pen_range_counter'),
        document.getElementById('rep_pen_range_textgenerationwebui'),
        document.getElementById('rep_pen_range_counter_textgenerationwebui'),
        document.getElementById('dry_penalty_last_n_textgenerationwebui'),
        document.getElementById('dry_penalty_last_n_counter_textgenerationwebui'),
        document.getElementById('rep_pen_decay_textgenerationwebui'),
        document.getElementById('rep_pen_decay_counter_textgenerationwebui'),
    ];
    const maxValue = power_user.max_context_unlocked ? MAX_CONTEXT_UNLOCKED : MAX_CONTEXT_DEFAULT;
    const minValue = power_user.max_context_unlocked ? maxContextMin : maxContextMin;
    const steps = power_user.max_context_unlocked ? unlockedMaxContextStep : maxContextStep;
    document.getElementById('rep_pen_range_textgenerationwebui_zenslider')?.remove(); //unsure why, but this is necessary.
    document.getElementById('dry_penalty_last_n_textgenerationwebui_zenslider')?.remove();
    document.getElementById('rep_pen_decay_textgenerationwebui_zenslider')?.remove();
    for (const element of elements) {
        if (!element) continue;
        const el = element as HTMLInputElement;
        const id = el.id;
        el.setAttribute('max', String(maxValue));

        if (typeof id === 'string' && id?.indexOf('max_context') !== -1) {
            el.setAttribute('min', String(minValue));
            el.setAttribute('step', String(steps));
        }
        const value = Number(el.value);

        if (value >= maxValue) {
            el.value = String(maxValue);
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    const maxAmountGen = power_user.max_context_unlocked ? MAX_RESPONSE_UNLOCKED : MAX_RESPONSE_DEFAULT;
    document.getElementById('amount_gen')?.setAttribute('max', String(maxAmountGen));
    document.getElementById('amount_gen_counter')?.setAttribute('max', String(maxAmountGen));

    const amountGenEl = document.getElementById('amount_gen') as HTMLInputElement | null;
    if (amountGenEl && Number(amountGenEl.value) >= maxAmountGen) {
        amountGenEl.value = String(maxAmountGen);
        amountGenEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (power_user.enableZenSliders) {
        const zensToRecreate = [
            'max_context',
            'rep_pen_range_textgenerationwebui',
            'dry_penalty_last_n_textgenerationwebui',
            'rep_pen_decay_textgenerationwebui',
        ];
        for (const id of zensToRecreate) {
            const z = document.getElementById(`${id}_zenslider`) as HTMLElement | null;
            if (z) { if ((z as unknown as noUiSliderElement).noUiSlider) (z as unknown as noUiSliderElement).noUiSlider!.destroy(); z.remove(); }
            const orig = document.getElementById(id);
            if (orig) CreateZenSliders(orig);
        }
    }
}

// Fetch a compiled object of all preset settings
/**
 *
 */
export function getContextSettings() {
    const compiledSettings: Record<string, unknown> = {};

    contextControls.forEach((control) => {
        let value: unknown = control.isGlobalSetting
            ? (power_user as Record<string, unknown>)[control.property]
            : (power_user.context as Record<string, unknown>)[control.property];

        // Force to a boolean if the setting is a checkbox
        if (control.isCheckbox) {
            value = !!value;
        }

        compiledSettings[control.property] = value;
    });

    return compiledSettings;
}

// TODO: Maybe add a refresh button to reset settings to preset
// TODO: Add "global state" if a preset doesn't set the power_user checkboxes
/**
 *
 */
async function loadContextSettings() {
    /**
     * Auto-fix missing fields in the story string
     * @param {ContextSettings} contextSettings Context settings instance
     */
    function autoFixStoryString(contextSettings: Record<string, unknown>) {
        // Already migrated, no need to fix
        if (!contextSettings || Object.hasOwn(contextSettings, 'story_string_position')) {
            return;
        }

        let storyString = (contextSettings.story_string as string) || '';

        /**
         * @param {string} field Missing field name
         * @param {'start'|'end'} position Position of auto-fix
         */
        function autoFixMissingField(field: string, position: 'start' | 'end') {
            if (storyString.includes(`{{${field}}}`)) {
                return;
            }

            console.warn(`[Story String Validation] Story String is missing a field: ${field}. Adding it at the ${position}.`);
            const fieldTemplate = `{{#if ${field}}}{{${field}}}\n{{/if}}`;
            const firstCurlyPosition = storyString.includes('{{') ? storyString.indexOf('{{') : 0;
            const lastCurlyPosition = storyString.includes('}}') ? storyString.lastIndexOf('}}') + '}}'.length : storyString.length;
            const lastTrimPosition = storyString.includes('{{trim}}') ? storyString.lastIndexOf('{{trim}}') : storyString.length;
            const endPosition = Math.min(lastTrimPosition, lastCurlyPosition);
            storyString = position === 'start'
                ? storyString.substring(0, firstCurlyPosition) + fieldTemplate + storyString.substring(firstCurlyPosition)
                : storyString.substring(0, endPosition) + fieldTemplate + storyString.substring(endPosition);
        }

        autoFixMissingField('anchorBefore', 'start');
        autoFixMissingField('anchorAfter', 'end');

        contextSettings.story_string = storyString as unknown as string;
    }

    // Migrate story string to add missing fields
    autoFixStoryString(power_user.context as unknown as Record<string, unknown>);

    contextControls.forEach(control => {
        const element = document.getElementById(control.id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;

        if (control.isGlobalSetting) {
            return;
        }

        const ctx = power_user.context as Record<string, unknown>;
        if (control.defaultValue !== undefined && ctx[control.property] === undefined) {
            ctx[control.property] = control.defaultValue;
        }

        if (control.isCheckbox) {
            if (element) (element as HTMLInputElement).checked = ctx[control.property] as boolean;
        } else if (element) {
            (element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = String(ctx[control.property] ?? '');
        }
        console.debug(`Setting ${element?.id} to ${ctx[control.property]}`);

        if (element) {
            element.addEventListener('input', async function (this: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
                let value: string | boolean | number = control.isCheckbox ? !!(this as HTMLInputElement).checked : (this as HTMLInputElement).value;
                if (typeof control.defaultValue === 'number') {
                    value = Number(value);
                }
                if (control.isGlobalSetting) {
                    (power_user as Record<string, unknown>)[control.property] = value;
                } else {
                    (power_user.context as Record<string, unknown>)[control.property] = value;
                }
                console.debug(`Setting ${this.id} to ${value}`);
                if (!CSS.supports('field-sizing', 'content') && this.matches('textarea')) {
                    await resetScrollHeight(this);
                }
                saveSettingsDebounced();
            });

            if (control.trigger) {
                element.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    });

    context_presets.forEach((preset: Record<string, unknown>) => {
        const name = preset.name as string;
        const option = document.createElement('option');
        option.value = name;
        option.innerText = name;
        option.selected = name === power_user.context.preset;
        document.getElementById('context_presets')?.appendChild(option);
    });

    document.getElementById('context_presets')?.addEventListener('change', function (this: HTMLSelectElement) {
        const name = String((this as HTMLSelectElement).options[(this as HTMLSelectElement).selectedIndex]?.textContent || '');
        const preset = context_presets.find((x: Record<string, unknown>) => x.name === name) as Record<string, unknown> | undefined;

        if (!preset) {
            return;
        }

        // Migrate story string to add missing fields
        autoFixStoryString(preset);

        power_user.context.preset = name;

        contextControls.forEach(control => {
            const presetValue = (preset as Record<string, unknown>)[control.property] ?? control.defaultValue;

            if (presetValue !== undefined) {
                if (control.isGlobalSetting) {
                    (power_user as Record<string, unknown>)[control.property] = presetValue;
                } else {
                    (power_user.context as Record<string, unknown>)[control.property] = presetValue;
                }

                const element = document.getElementById(control.id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;

                if (control.isCheckbox) {
                    if (element) (element as HTMLInputElement).checked = control.isGlobalSetting
                        ? (power_user as Record<string, unknown>)[control.property] as boolean
                        : (power_user.context as Record<string, unknown>)[control.property] as boolean;
                    element?.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                    if (element) (element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = String(control.isGlobalSetting
                        ? (power_user as Record<string, unknown>)[control.property]
                        : (power_user.context as Record<string, unknown>)[control.property] ?? '');
                    element?.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        });

        if (power_user.instruct.bind_to_context) {
            // Select matching instruct preset
            for (const instruct_preset of instruct_presets) {
                // If instruct preset matches the context template
                if ((instruct_preset as Record<string, unknown>).name === name) {
                    selectInstructPreset((instruct_preset as Record<string, unknown>).name as string, { isAuto: true });
                    break;
                }
            }
        }

        updateBindModelTemplatesState();

        saveSettingsDebounced();
    });
}


/**
 * Common function to perform fuzzy search with optional caching
 * @template T
 * @param {string} type - Type of search from fuzzySearchCategories
 * @param {T[]} data - Data array to search in
 * @param {Array<{name: string, weight: number, getFn?: (obj: T) => string}>} keys - Fuse.js keys configuration
 * @param {string} searchValue - The search term
 * @param {Object.<string, { resultMap: Map<string, any> }>} [fuzzySearchCaches] - Optional fuzzy search caches
 * @returns {import('fuse.js').FuseResult<T>[]} Results as items with their score
 */
export function performFuzzySearch(type: string, data: unknown[], keys: { name: string; weight: number; getFn?: (...args: unknown[]) => string }[], searchValue: string, fuzzySearchCaches: Record<string, { resultMap: Map<string, unknown> }> | null = null) {
    // Check cache if provided
    if (fuzzySearchCaches) {
        const cache = fuzzySearchCaches[type]!;
        if (cache?.resultMap.has(searchValue)) {
            return cache.resultMap.get(searchValue);
        }
    }

    const fuse = new Fuse(data, {
        keys: keys,
        includeScore: true,
        ignoreLocation: true,
        useExtendedSearch: true,
        threshold: 0.2,
    });

    const results = fuse.search(searchValue);

    // Store in cache if provided
    if (fuzzySearchCaches) {
        fuzzySearchCaches[type]!.resultMap.set(searchValue, results);
    }
    return results;
}

/**
 * Fuzzy search characters by a search term
 * @param {string} searchValue - The search term
 * @param {Object.<string, { resultMap: Map<string, any> }>} [fuzzySearchCaches] - Optional fuzzy search caches
 * @returns {import('fuse.js').FuseResult<any>[]} Results as items with their score
 */
export function fuzzySearchCharacters(searchValue: string, fuzzySearchCaches: Record<string, { resultMap: Map<string, unknown> }> | null = null) {
    const keys = [
        { name: 'data.name', weight: 20 },
        { name: '#tags', weight: 10, getFn: (character: Record<string, unknown>) => (getTagsList(String((character as Record<string, unknown>).avatar ?? '')) as unknown as { name: string }[]).map((x: { name: string }) => x.name).join('||') },
        { name: 'data.description', weight: 3 },
        { name: 'data.mes_example', weight: 3 },
        { name: 'data.scenario', weight: 2 },
        { name: 'data.personality', weight: 2 },
        { name: 'data.first_mes', weight: 2 },
        { name: 'data.creator_notes', weight: 2 },
        { name: 'data.creator', weight: 1 },
        { name: 'data.tags', weight: 1 },
        { name: 'data.alternate_greetings', weight: 1 },
    ];

    return performFuzzySearch(fuzzySearchCategories.characters, characters, keys as { name: string; weight: number; getFn?: (...args: unknown[]) => string }[], searchValue, fuzzySearchCaches);
}

/**
 * Fuzzy search world info entries by a search term
 * @param {*[]} data - WI items data array
 * @param {string} searchValue - The search term
 * @param {Object.<string, { resultMap: Map<string, any> }>} [fuzzySearchCaches] - Optional fuzzy search caches
 * @returns {import('fuse.js').FuseResult<any>[]} Results as items with their score
 */
export function fuzzySearchWorldInfo(data: unknown[], searchValue: string, fuzzySearchCaches: Record<string, { resultMap: Map<string, unknown> }> | null = null) {
    const keys = [
        { name: 'key', weight: 20 },
        { name: 'group', weight: 15 },
        { name: 'comment', weight: 10 },
        { name: 'keysecondary', weight: 10 },
        { name: 'content', weight: 3 },
        { name: 'uid', weight: 1 },
        { name: 'automationId', weight: 1 },
    ];

    return performFuzzySearch(fuzzySearchCategories.worldInfo, data, keys as { name: string; weight: number; getFn?: (...args: unknown[]) => string }[], searchValue, fuzzySearchCaches);
}

/**
 * Fuzzy search persona entries by a search term
 * @param {*[]} data - persona data array
 * @param {string} searchValue - The search term
 * @param {Object.<string, { resultMap: Map<string, any> }>} [fuzzySearchCaches] - Optional fuzzy search caches
 * @returns {import('fuse.js').FuseResult<any>[]} Results as items with their score
 */
export function fuzzySearchPersonas(data: string[], searchValue: string, fuzzySearchCaches: Record<string, { resultMap: Map<string, unknown> }> | null = null) {
    const mappedData = data.map((x: string) => ({
        key: x,
        name: (power_user.personas as Record<string, string>)[x] ?? '',
        description: ((power_user.persona_descriptions as Record<string, Record<string, unknown>>)[x]?.description as string) ?? '',
    }));

    const keys = [
        { name: 'name', weight: 20 },
        { name: 'description', weight: 3 },
    ];

    return performFuzzySearch(fuzzySearchCategories.personas, mappedData, keys as { name: string; weight: number; getFn?: (...args: unknown[]) => string }[], searchValue, fuzzySearchCaches);
}

/**
 * Fuzzy search tags by a search term
 * @param {string} searchValue - The search term
 * @param {Object.<string, { resultMap: Map<string, any> }>} [fuzzySearchCaches] - Optional fuzzy search caches
 * @returns {import('fuse.js').FuseResult<any>[]} Results as items with their score
 */
export function fuzzySearchTags(searchValue: string, fuzzySearchCaches: Record<string, { resultMap: Map<string, unknown> }> | null = null) {
    const keys = [
        { name: 'name', weight: 1 },
    ];

    return performFuzzySearch(fuzzySearchCategories.tags, tags, keys as { name: string; weight: number; getFn?: (...args: unknown[]) => string }[], searchValue, fuzzySearchCaches);
}

/**
 * Fuzzy search groups by a search term
 * @param {string} searchValue - The search term
 * @param {Object.<string, { resultMap: Map<string, any> }>} [fuzzySearchCaches] - Optional fuzzy search caches
 * @returns {import('fuse.js').FuseResult<any>[]} Results as items with their score
 */
export function fuzzySearchGroups(searchValue: string, fuzzySearchCaches: Record<string, { resultMap: Map<string, unknown> }> | null = null) {
    const keys = [
        { name: 'name', weight: 20 },
        { name: 'members', weight: 15 },
        { name: '#tags', weight: 10, getFn: (group: Record<string, unknown>) => (getTagsList(String(group.id ?? '')) as unknown as { name: string }[]).map((x: { name: string }) => x.name).join('||') },
        { name: 'id', weight: 1 },
    ];

    return performFuzzySearch(fuzzySearchCategories.groups, groups, keys as { name: string; weight: number; getFn?: (...args: unknown[]) => string }[], searchValue, fuzzySearchCaches);
}

/**
 * Renders a story string template with the given parameters.
 * @param {object} params Template parameters.
 * @param {object} [options] Additional options.
 * @param {string} [options.customStoryString] Custom story string template.
 * @param {InstructSettings} [options.customInstructSettings] Custom instruct settings.
 * @param {ContextSettings} [options.customContextSettings] Custom context settings.
 * @returns {string} The rendered story string.
 */
export function renderStoryString(params: Record<string, unknown>, { customStoryString = null, customInstructSettings = null, customContextSettings = null }: { customStoryString?: string | null; customInstructSettings?: Record<string, unknown> | null; customContextSettings?: Record<string, unknown> | null } = {}) {
    try {
        const instructSettings = structuredClone(customInstructSettings ?? power_user.instruct);
        const contextSettings = structuredClone(customContextSettings ?? power_user.context);
        const storyString = customStoryString ?? (contextSettings.story_string as string);
        const storyStringPosition = (contextSettings.story_string_position as number) ?? extension_prompt_types.IN_PROMPT;

        // Validate and log possible warnings/errors
        validateStoryString(storyString, params);

        // compile the story string template into a function, with no HTML escaping
        const compiledTemplate = Handlebars.compile(storyString, { noEscape: true });

        // render the story string template with the given params
        let output = compiledTemplate(params);

        // substitute {{macro}} params that are not defined in the story string
        output = substituteParams(output, { user: params.user as string, char: params.char as string } as unknown as string);

        // remove leading newlines
        output = output.replace(/^\n+/, '');

        // add a newline to the end of the story string if it doesn't have one
        if (output.length > 0 && !output.endsWith('\n') && storyStringPosition !== extension_prompt_types.IN_CHAT) {
            if (!instructSettings.enabled || (instructSettings.wrap && !instructSettings.story_string_suffix)) {
                output += '\n';
            }
        }

        return output;
    } catch (e) {
        notyf.error('Check the story string template for validity', 'Error rendering story string');
        console.error('Error rendering story string', e);
        throw e; // rethrow the error
    }
}

/**
 * Validate the story string for possible warnings or issues
 * @param {string} storyString - The story string
 * @param {object} params - The story string parameters
 */
function validateStoryString(storyString: string, params: Record<string, unknown>) {
    const cache: { hashCache: Record<string, { fieldsWarned: Record<string, boolean> }> } = JSON.parse(accountStorage.getItem(storage_keys.storyStringValidationCache) ?? 'null') ?? { hashCache: {} };

    const hash = getStringHash(storyString);

    // Initialize the cache for the current hash if it doesn't exist
    if (!cache.hashCache[hash]) {
        cache.hashCache[hash] = { fieldsWarned: {} };
    }

    const currentCache = cache.hashCache[hash]!;
    const fieldsToWarn: string[] = [];

    /**
     *
     * @param field
     * @param fallbackLegacyField
     */
    function validateMissingField(field: string, fallbackLegacyField: string | null = null) {
        const contains = storyString.includes(`{{${field}}}`) || (!!fallbackLegacyField && storyString.includes(`{{${fallbackLegacyField}}}`));
        if (!contains && params[field]) {
            const wasLogged = currentCache.fieldsWarned[field];
            if (!wasLogged) {
                fieldsToWarn.push(field);
                currentCache.fieldsWarned[field] = true;
            }
            console.warn(`The story string does not contain {{${field}}}, but it would contain content:\n`, params[field]);
        }
    }

    validateMissingField('description');
    validateMissingField('personality');
    validateMissingField('persona');
    validateMissingField('scenario');
    // validateMissingField('system');
    validateMissingField('wiBefore', 'loreBefore');
    validateMissingField('wiAfter', 'loreAfter');

    if (fieldsToWarn.length > 0) {
        const fieldsList = fieldsToWarn.map(field => `{{${field}}}`).join(', ');
        notyf.warning(`The story string does not contain the following fields, but they would contain content: ${fieldsList}`, 'Story String Validation');
    }

    accountStorage.setItem(storage_keys.storyStringValidationCache, JSON.stringify(cache));
}


const sortFunc = (a: Record<string, unknown>, b: Record<string, unknown>) => power_user.sort_order == 'asc' ? compareFunc(a, b) : compareFunc(b, a);
const compareFunc = (first: Record<string, unknown>, second: Record<string, unknown>) => {
    const a = first[power_user.sort_field];
    const b = second[power_user.sort_field];

    if (power_user.sort_field === 'create_date') {
        return sortMoments(timestampToMoment(b as string), timestampToMoment(a as string));
    }

    switch (power_user.sort_rule) {
        case 'boolean':
            if (a === true || a === 'true') return 1;  // Prioritize 'true' or true
            if (b === true || b === 'true') return -1; // Prioritize 'true' or true
            if (a && !b) return -1;        // Move truthy values to the end
            if (!a && b) return 1;         // Move falsy values to the beginning
            if (a === b) return 0;         // Sort equal values normally
            return (a as number) < (b as number) ? -1 : 1;         // Sort non-boolean values normally
        default:
            return typeof a == 'string'
                ? (a as string).localeCompare(b as string)
                : (a as number) - (b as number);
    }
};

/**
 * Sorts an array of entities based on the current sort settings
 * @param {any[]} entities An array of objects with an `item` property
 * @param {boolean} forceSearch Whether to force search sorting
 * @param {import('./filters.js').FilterHelper} [filterHelper] Filter helper to use
 */
export function sortEntitiesList(entities: { type?: string; id?: string; item?: Record<string, unknown> }[], forceSearch: boolean, filterHelper: { getScore: (type: string, id: string | number) => number | undefined } | null = null) {
    filterHelper = filterHelper ?? entitiesFilter;
    if (power_user.sort_field == undefined || entities.length === 0) {
        return;
    }

    const isSearch = forceSearch || document.querySelector('#character_sort_order option[data-field="search"]') ? (document.querySelector('#character_sort_order option[data-field="search"]') as HTMLOptionElement)?.selected : false;

    if (!isSearch && power_user.sort_order === 'random') {
        shuffle(entities);
        return;
    }

    entities.sort((a, b) => {
        // Sort tags/folders will always be at the top. Their original sorting will be kept, to respect manual tag sorting.
        if (a.type === 'tag' || b.type === 'tag') {
            // The one that is a tag will be at the top
            return (a.type === 'tag' ? -1 : 1) - (b.type === 'tag' ? -1 : 1);
        }

        // If we have search sorting, we take scores and use those
        if (isSearch) {
            const aScore = filterHelper.getScore(FILTER_TYPES.SEARCH, `${a.type}.${a.id}`);
            const bScore = filterHelper.getScore(FILTER_TYPES.SEARCH, `${b.type}.${b.id}`);
            return (aScore ?? 0) - (bScore ?? 0);
        }

        return sortFunc(a.item ?? {}, b.item ?? {});
    });
}

/**
 * Updates the current UI theme file.
 */
async function updateTheme() {
    await saveTheme(power_user.theme);
    notyf.success('Theme saved.');
}

/**
 *
 */
async function deleteTheme() {
    const themeName = power_user.theme;

    if (!themeName) {
        notyf.info('No theme selected.');
        return;
    }

    const template = document.createElement('div');
    template.innerHTML = await renderTemplateAsync('themeDelete', { themeName });
    const confirm = await callGenericPopup(template, POPUP_TYPE.CONFIRM);

    if (!confirm) {
        return;
    }

    const response = await fetch('/api/themes/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ name: themeName }),
    });

    if (!response.ok) {
        notyf.error('Failed to delete theme. Check the console for more information.');
        return;
    }

    const themeIndex = themes.findIndex(x => x.name == themeName);

    if (themeIndex !== -1) {
        themes.splice(themeIndex, 1);
        document.querySelector(`#themes option[value="${themeName}"]`)?.remove();
        power_user.theme = themes[0]?.name ?? '';
        saveSettingsDebounced();
        if (power_user.theme) {
            applyTheme(power_user.theme);
        }
        notyf.success('Theme deleted.');
    }
}

/**
 * Exports the current theme to a file.
 */
async function exportTheme() {
    const themeFile = await saveTheme(power_user.theme);
    if (!themeFile) return;
    const fileName = `${(themeFile as Record<string, unknown>).name as string}.json`;
    download(JSON.stringify(themeFile, null, 4), fileName, 'application/json');
}

/**
 * Imports a theme from a file.
 * @param {File} file File to import.
 * @returns {Promise<void>} A promise that resolves when the theme is imported.
 */
async function importTheme(file: File | undefined) {
    if (!file) {
        return;
    }

    const fileText = await (getFileText as (file: string | Blob) => Promise<string>)(file!);
    const parsed = JSON.parse(fileText);

    if (!parsed.name) {
        throw new Error('Missing name');
    }

    if (themes.some((t: Theme) => t.name === parsed.name)) {
        throw new Error('Theme with that name already exists');
    }

    if (typeof (parsed as Record<string, unknown>).custom_css === 'string' && ((parsed as Record<string, unknown>).custom_css as string).includes('@import')) {
        const template = document.createElement('div');
        template.innerHTML = await renderTemplateAsync('themeImportWarning');
        const confirm = await callGenericPopup(template, POPUP_TYPE.CONFIRM);
        if (!confirm) {
            throw new Error('Theme contains @import lines');
        }
    }

    const parsedName = (parsed as Record<string, string>).name ?? '';
    themes.push(parsed as Theme);
    await saveTheme(parsedName, getNewTheme(parsed));
    const option = document.createElement('option');
    option.value = parsedName;
    option.innerText = parsedName;
    document.getElementById('themes')?.appendChild(option);
    saveSettingsDebounced();
    notyf.success(parsedName, 'Theme imported');
}

/**
 * Saves the current theme to the server.
 * @param {string|undefined} name Theme name. If undefined, a popup will be shown to enter a name.
 * @param {object|undefined} theme Theme object. If undefined, the current theme will be saved.
 * @param themeArg
 * @returns {Promise<object>} A promise that resolves when the theme is saved.
 */
async function saveTheme(name: string | undefined = undefined, themeArg?: Theme): Promise<Theme | undefined> {
    let theme = themeArg;
    let themeName: string;
    if (typeof name !== 'string') {
        const newName = await callGenericPopup('Enter a theme preset name:', POPUP_TYPE.INPUT, power_user.theme);

        if (!newName) {
            return undefined;
        }

        const sanitized = await getSanitizedFilename(String(newName));
        if (!sanitized) return undefined;
        themeName = sanitized;
    } else {
        themeName = name;
    }

    if (theme === undefined) {
        theme = getThemeObject(themeName);
    }

    const response = await fetch('/api/themes/save', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(theme),
    });

    if (!response.ok) {
        notyf.error('Check the server connection and reload the page to prevent data loss.', 'Theme could not be saved');
        console.error('Theme could not be saved', response);
        throw new Error('Theme could not be saved');
    }

    const themeIndex = themes.findIndex(x => x.name == themeName);

    if (themeIndex == -1) {
        themes.push(theme!);
        const option = document.createElement('option');
        option.selected = true;
        option.value = themeName;
        option.innerText = themeName;
        document.getElementById('themes')?.appendChild(option);
    } else {
        themes[themeIndex] = theme!;
        const themeOpt = document.querySelector(`#themes option[value="${themeName}"]`) as HTMLOptionElement | null;
        if (themeOpt) themeOpt.selected = true;
    }

    power_user.theme = themeName;
    saveSettingsDebounced();

    return theme;
}

/**
 * Gets a snapshot of the current theme settings.
 * @param {string} name Name of the theme
 */
export function getThemeObject(name: string): Theme {
    return {
        name,
        blur_strength: power_user.blur_strength,
        main_text_color: power_user.main_text_color,
        italics_text_color: power_user.italics_text_color,
        underline_text_color: power_user.underline_text_color,
        quote_text_color: power_user.quote_text_color,
        blur_tint_color: power_user.blur_tint_color,
        chat_tint_color: power_user.chat_tint_color,
        user_mes_blur_tint_color: power_user.user_mes_blur_tint_color,
        bot_mes_blur_tint_color: power_user.bot_mes_blur_tint_color,
        shadow_color: power_user.shadow_color,
        shadow_width: power_user.shadow_width,
        border_color: power_user.border_color,
        font_scale: power_user.font_scale,
        fast_ui_mode: power_user.fast_ui_mode,
        waifuMode: power_user.waifuMode,
        avatar_style: power_user.avatar_style,
        chat_display: power_user.chat_display,
        toastr_position: power_user.toastr_position,
        noShadows: power_user.noShadows,
        chat_width: power_user.chat_width,
        timer_enabled: power_user.timer_enabled,
        timestamps_enabled: power_user.timestamps_enabled,
        timestamp_model_icon: power_user.timestamp_model_icon,

        mesIDDisplay_enabled: power_user.mesIDDisplay_enabled,
        hideChatAvatars_enabled: power_user.hideChatAvatars_enabled,
        message_token_count_enabled: power_user.message_token_count_enabled,
        expand_message_actions: power_user.expand_message_actions,
        enableZenSliders: power_user.enableZenSliders,
        enableLabMode: power_user.enableLabMode,
        hotswap_enabled: power_user.hotswap_enabled,
        custom_css: power_user.custom_css,
        bogus_folders: power_user.bogus_folders,
        zoomed_avatar_magnification: power_user.zoomed_avatar_magnification,
        reduced_motion: power_user.reduced_motion,
        compact_input_area: power_user.compact_input_area,
        show_swipe_num_all_messages: power_user.show_swipe_num_all_messages,
        click_to_edit: power_user.click_to_edit,
        media_display: power_user.media_display,
    };
}

/**
 * Applies imported theme properties to the theme object.
 * @param {object} parsed Parsed object to get the theme from.
 * @returns {Theme} Theme assigned to the parsed object.
 */
function getNewTheme(parsed: Record<string, unknown>) {
    const theme = getThemeObject(parsed.name as string) as Record<string, unknown>;
    for (const key in parsed) {
        if (Object.hasOwn(theme, key)) {
            theme[key] = parsed[key];
        }
    }
    return theme as Theme;
}

/**
 *
 */
async function saveMovingUI() {
    const popupResult = await callGenericPopup('Enter a name for the MovingUI Preset:', POPUP_TYPE.INPUT);

    if (!popupResult) {
        return;
    }

    const name = await getSanitizedFilename(String(popupResult));

    const movingUIPreset = {
        name,
        movingUIState: power_user.movingUIState,
    };
    console.log(movingUIPreset);

    const response = await fetch('/api/moving-ui/save', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(movingUIPreset),
    });

    if (response.ok) {
        const movingUIPresetIndex = movingUIPresets.findIndex((x: MovingUIPreset) => x.name == name);

        if (movingUIPresetIndex == -1) {
            movingUIPresets.push(movingUIPreset);
            const option = document.createElement('option');
            option.selected = true;
            option.value = name;
            option.innerText = name;
            document.getElementById('movingUIPresets')?.appendChild(option);
        } else {
            movingUIPresets[movingUIPresetIndex] = movingUIPreset;
            const muiOpt = document.querySelector(`#movingUIPresets option[value="${name}"]`) as HTMLOptionElement | null;
            if (muiOpt) muiOpt.selected = true;
        }

        power_user.movingUIPreset = name;
        saveSettingsDebounced();
    } else {
        notyf.error('Failed to save MovingUI state.');
        console.error('MovingUI could not be saved', response);
    }
}

/**
 * Resets the movable styles of the given element to their unset values.
 * @param {string} id Element ID
 */
export function resetMovableStyles(id: string) {
    const panelStyles: string[] = ['top', 'left', 'right', 'bottom', 'height', 'width', 'margin'];

    const panel = document.getElementById(id);

    if (panel) {
        const panelEl = panel as HTMLElement;
        panelStyles.forEach((style) => {
            (panelEl.style as unknown as Record<string, string>)[style] = '';
        });
    }
}

/**
 *
 * @param type
 */
async function resetMovablePanels(type: string) {
    const panelIds = [
        'sheld',
        'left-nav-panel',
        'right-nav-panel',
        'WorldInfo',
        'floatingPrompt',
        'expression-holder',
        'groupMemberListPopout',
        'summaryExtensionPopout',
        'gallery',
        'logprobsViewer',
        'cfgConfig',
    ];

    /**
     * @type {HTMLElement[]} Generic panels that don't have a known ID
     */
    const draggedElements = Array.from(document.querySelectorAll('[data-dragged]')) as HTMLElement[];
    const allDraggable = (panelIds.map(id => document.getElementById(id)).concat(draggedElements)).filter(onlyUnique) as HTMLElement[];

    const panelStyles: string[] = ['top', 'left', 'right', 'bottom', 'height', 'width', 'margin'];
    allDraggable.forEach((panel) => {
        if (panel) {
            panel.classList.add('resizing');
            panelStyles.forEach((style) => {
                (panel.style as unknown as Record<string, string>)[style] = '';
            });
        }
    });

    /**
     * @type {HTMLElement[]} Zoomed avatars that are currently being resized
     */
    const zoomedAvatars = Array.from(document.querySelectorAll('.zoomed_avatar')) as HTMLElement[];
    if (zoomedAvatars.length > 0) {
        zoomedAvatars.forEach((avatar) => {
            avatar.classList.add('resizing');
            panelStyles.forEach((style) => {
                (avatar.style as unknown as Record<string, string>)[style] = '';
            });
        });
    }

    document.querySelectorAll('[data-dragged="true"]').forEach(el => el.removeAttribute('data-dragged'));
    await delay(50);

    power_user.movingUIState = {};

    //if user manually resets panels, deselect the current preset
    if (type !== 'quiet' && type !== 'resize') {
        power_user.movingUIPreset = 'Default';
        const defOpt = document.querySelector('#movingUIPresets option[value="Default"]') as HTMLOptionElement | null;
        if (defOpt) defOpt.selected = true;
    }

    saveSettingsDebounced();
    await eventSource.emit(event_types.MOVABLE_PANELS_RESET);

    eventSource.once(event_types.SETTINGS_UPDATED, () => {
        document.querySelectorAll('.resizing').forEach(el => el.classList.remove('resizing'));
        //if happening as part of preset application, do it quietly.
        if (type === 'quiet') {
            return;
            //if happening due to resize, tell user.
        } else if (type === 'resize') {
            notyf.warning('Panel positions reset due to zoom/resize');
            //if happening due to manual button press
        } else {
            notyf.success('Panel positions reset');
        }
    });
}

/**
 * Finds the ID of the tag with the given name.
 * @param {string} name
 * @returns {string} The ID of the tag with the given name.
 */
/**
 * Loads the chat until the given message ID is displayed.
 * @param {number} mesId
 * @returns JQuery<HTMLElement>
 */
const EPHEMERAL_STOPPING_STRINGS: string[] = [];

/**
 * Adds a stopping string to the list of stopping strings that are only used for the next generation.
 * @param {string} value The stopping string to add
 */
export function addEphemeralStoppingString(value: string) {
    if (!EPHEMERAL_STOPPING_STRINGS.includes(value)) {
        console.debug('Adding ephemeral stopping string:', value);
        EPHEMERAL_STOPPING_STRINGS.push(value);
    }
}

/**
 *
 */
export function flushEphemeralStoppingStrings() {
    if (EPHEMERAL_STOPPING_STRINGS.length === 0) {
        return;
    }

    console.debug('Flushing ephemeral stopping strings:', EPHEMERAL_STOPPING_STRINGS);
    EPHEMERAL_STOPPING_STRINGS.splice(0, EPHEMERAL_STOPPING_STRINGS.length);
}

/**
 * Checks if the generated text should be filtered based on the auto-swipe settings.
 * @param {string} text The text to check
 * @returns {boolean} If the generated text should be filtered
 */
export function generatedTextFiltered(text: string) {
    /**
     * Checks if the given text contains any of the blacklisted words.
     * @param {string} text The text to check
     * @param {string[]} blacklist The list of blacklisted words
     * @param {number} threshold The number of blacklisted words that need to be present to trigger the check
     * @returns {boolean} Whether the text contains blacklisted words
     */
    function containsBlacklistedWords(text: string, blacklist: string[], threshold: number) {
        const regex = new RegExp(`\\b(${blacklist.join('|')})\\b`, 'gi');
        const matches = text.match(regex) || [];
        return matches.length >= threshold;
    }

    // Make sure a generated text is non-empty
    // Otherwise we might get in a loop with a broken API
    text = text.trim();
    if (text.length > 0) {
        if (power_user.auto_swipe_minimum_length) {
            if (text.length < power_user.auto_swipe_minimum_length) {
                console.log('Generated text size too small');
                return true;
            }
        }
        if (power_user.auto_swipe_blacklist.length && power_user.auto_swipe_blacklist_threshold) {
            if (containsBlacklistedWords(text, power_user.auto_swipe_blacklist, power_user.auto_swipe_blacklist_threshold)) {
                console.log('Generated text has blacklisted words');
                return true;
            }
        }
    }

    return false;
}

/**
 * Gets the custom stopping strings from the power user settings.
 * @param {number | undefined} limit Number of strings to return. If 0 or undefined, returns all strings.
 * @returns {string[]} An array of custom stopping strings
 */
export function getCustomStoppingStrings(limit = undefined) {
    /**
     *
     */
    function getPermanent() {
        try {
            // If there's no custom stopping strings, return an empty array
            if (!power_user.custom_stopping_strings) {
                return [];
            }

            // Parse the JSON string
            const parsed = JSON.parse(power_user.custom_stopping_strings);

            // Make sure it's an array
            if (!Array.isArray(parsed)) {
                return [];
            }

            // Make sure all the elements are strings and non-empty.
            let strings: string[] = parsed.filter((s: unknown) => typeof s === 'string' && (s as string).length > 0);

            // Substitute params if necessary
            if (power_user.custom_stopping_strings_macro) {
                strings = strings.map((x: string) => substituteParams(x));
            }

            return strings;
        } catch (error) {
            // If there's an error, return an empty array
            console.warn('Error parsing custom stopping strings:', error);
            return [];
        }
    }

    const permanent = getPermanent();
    const ephemeral = EPHEMERAL_STOPPING_STRINGS;
    const strings = [...permanent, ...ephemeral];

    // Apply the limit. If limit is 0, return all strings.
    if (limit !== undefined && limit > 0) {
        return strings.slice(0, limit);
    }

    return strings;
}

/**
 *
 */
export function forceCharacterEditorTokenize() {
    document.querySelectorAll('[data-token-counter]').forEach((el: Element) => {
        const targetEl = document.getElementById((el as HTMLElement).dataset.tokenCounter ?? '');
        if (targetEl) targetEl.dataset.lastValueHash = '';
    });
}

/**
 * Registers all settings panel event handlers on the live DOM elements.
 * Must be called after DOM is ready AND again after settings panel DOM
 * may have been replaced (e.g. from loadPowerUserSettings).
 */
function registerSettingsPanelHandlers() {
    const guard = (el: HTMLElement | null | undefined): el is HTMLElement => {
        if (!el || el.dataset.stRegistered) return false;
        el.dataset.stRegistered = '1';
        return true;
    };

    const h = (id: string) => document.getElementById(id);
    const guardEl = (id: string): HTMLElement | null => { const el = h(id); return el && guard(el) ? el : null; };

    // Collapse newlines
    const collapseEl = guardEl('collapse-newlines-checkbox');
    if (collapseEl) collapseEl.addEventListener('change', function () {
        power_user.collapse_newlines = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Trim sentences
    const trimEl = guardEl('trim_sentences_checkbox');
    if (trimEl) trimEl.addEventListener('change', function () {
        power_user.trim_sentences = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Single line
    const singleEl = guardEl('single_line');
    if (singleEl) singleEl.addEventListener('input', function () {
        power_user.single_line = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Context derived
    const ctxDerivedEl = guardEl('context_derived');
    if (ctxDerivedEl) {
        ctxDerivedEl.addEventListener('input', function () {
            power_user.context_derived = !!(this instanceof HTMLInputElement && this.checked);
            saveSettingsDebounced();
        });
        ctxDerivedEl.addEventListener('change', function () {
            this.parentElement?.querySelector('i')?.classList.toggle('toggleEnabled', !!power_user.context_derived);
        });
    }

    // Instruct derived
    const instDerivedEl = guardEl('instruct_derived');
    if (instDerivedEl) {
        instDerivedEl.addEventListener('input', function () {
            power_user.instruct_derived = !!(this instanceof HTMLInputElement && this.checked);
            saveSettingsDebounced();
        });
        instDerivedEl.addEventListener('change', function () {
            this.parentElement?.querySelector('i')?.classList.toggle('toggleEnabled', !!power_user.instruct_derived);
        });
    }

    // Context size derived
    const ctxSizeDerivedEl = guardEl('context_size_derived');
    if (ctxSizeDerivedEl) {
        ctxSizeDerivedEl.addEventListener('input', function () {
            power_user.context_size_derived = !!(this instanceof HTMLInputElement && this.checked);
            saveSettingsDebounced();
        });
        ctxSizeDerivedEl.addEventListener('change', function () {
            const el = document.getElementById('context_size_derived') as HTMLInputElement | null;
            if (el) el.checked = !!power_user.context_size_derived;
        });
    }

    // Context story string position
    const ctxStoryPosEl = guardEl('context_story_string_position');
    if (ctxStoryPosEl) ctxStoryPosEl.addEventListener('input', function () {
        const value = Number((this instanceof HTMLInputElement && this.value) || 0);
        document.getElementById('context_story_string_inject_settings')?.toggleAttribute('hidden', value !== extension_prompt_types.IN_CHAT);
    });

    // Bind model templates
    const bindEl = guardEl('bind_model_templates');
    if (bindEl) {
        bindEl.addEventListener('input', async function () {
            const result = await bindModelTemplates(power_user, online_status);
            if (result) saveSettingsDebounced();
        });
        bindEl.addEventListener('change', updateBindModelTemplatesState);
    }

    // Always force name2
    const forceName2El = guardEl('always-force-name2-checkbox');
    if (forceName2El) forceName2El.addEventListener('change', function () {
        power_user.always_force_name2 = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Markdown escape strings
    const mdEscapeEl = guardEl('markdown_escape_strings');
    if (mdEscapeEl) mdEscapeEl.addEventListener('input', function () {
        power_user.markdown_escape_strings = String((this instanceof HTMLInputElement && this.value) || '');
        saveSettingsDebounced();
        reloadMarkdownProcessor();
    });

    // Start reply with
    const startReplyEl = guardEl('start_reply_with');
    if (startReplyEl) startReplyEl.addEventListener('input', function () {
        power_user.user_prompt_bias = String((this instanceof HTMLInputElement && this.value) || '');
        saveSettingsDebounced();
    });

    // Chat show reply prefix
    const showPrefixEl = guardEl('chat-show-reply-prefix-checkbox');
    if (showPrefixEl) showPrefixEl.addEventListener('change', function () {
        power_user.show_user_prompt_bias = !!(this instanceof HTMLInputElement && this.checked);
        reloadCurrentChat();
        saveSettingsDebounced();
    });

    // Auto continue
    const autoContEl = guardEl('auto_continue_enabled');
    if (autoContEl) autoContEl.addEventListener('change', function () {
        power_user.auto_continue.enabled = this instanceof HTMLInputElement && this.checked;
        saveSettingsDebounced();
    });
    const autoContAllowEl = guardEl('auto_continue_allow_chat_completions');
    if (autoContAllowEl) autoContAllowEl.addEventListener('change', function () {
        power_user.auto_continue.allow_chat_completions = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });
    const autoContTargetEl = guardEl('auto_continue_target_length');
    if (autoContTargetEl) autoContTargetEl.addEventListener('input', function () {
        power_user.auto_continue.target_length = Number((this instanceof HTMLInputElement && this.value) || 0);
        saveSettingsDebounced();
    });

    // Example messages behavior
    const exampleBehaviorEl = guardEl('example_messages_behavior');
    if (exampleBehaviorEl) exampleBehaviorEl.addEventListener('change', function () {
        const selectedOption = String((this instanceof HTMLInputElement && this.value) || '');
        switch (selectedOption) {
            case 'normal': power_user.pin_examples = false; power_user.strip_examples = false; break;
            case 'keep':   power_user.pin_examples = true;  power_user.strip_examples = false; break;
            case 'strip':  power_user.pin_examples = false; power_user.strip_examples = true;  break;
        }
        saveSettingsDebounced();
    });

    // Fast UI mode
    const fastUiEl = guardEl('fast_ui_mode');
    if (fastUiEl) fastUiEl.addEventListener('change', function () {
        power_user.fast_ui_mode = this instanceof HTMLInputElement && this.checked;
        switchUiMode();
        saveSettingsDebounced();
    });

    // Waifu mode
    const waifuEl = guardEl('waifuMode');
    if (waifuEl) waifuEl.addEventListener('change', () => {
        const wfEl = h('waifuMode') as HTMLInputElement | null;
        power_user.waifuMode = !!(wfEl?.checked);
        switchWaifuMode();
        saveSettingsDebounced();
    });

    // Custom CSS
    const cssEl = guardEl('customCSS') as HTMLTextAreaElement | null;
    if (cssEl) cssEl.addEventListener('input', () => {
        power_user.custom_css = cssEl.value;
        saveSettingsDebounced();
        applyCustomCSS();
    });

    // Moving UI mode
    const muiEl = guardEl('movingUImode');
    if (muiEl) muiEl.addEventListener('change', function () {
        power_user.movingUI = this instanceof HTMLInputElement && this.checked;
        switchMovingUI();
        saveSettingsDebounced();
    });

    // No shadows (no blur)
    const nsEl = guardEl('noShadowsmode');
    if (nsEl) nsEl.addEventListener('change', function () {
        power_user.noShadows = this instanceof HTMLInputElement && this.checked;
        applyNoShadows();
        saveSettingsDebounced();
    });

    // Moving UI reset
    const muiResetEl = guardEl('movingUIreset');
    if (muiResetEl) muiResetEl.addEventListener('click', () => resetMovablePanels(''));

    // Avatar style
    const avatarStyleEl = guardEl('avatar_style');
    if (avatarStyleEl) avatarStyleEl.addEventListener('change', function () {
        power_user.avatar_style = Number((this instanceof HTMLInputElement && this.value) || 0);
        applyAvatarStyle();
        saveSettingsDebounced();
    });

    // Chat display
    const chatDisplayEl = guardEl('chat_display');
    if (chatDisplayEl) chatDisplayEl.addEventListener('change', function () {
        power_user.chat_display = Number((this instanceof HTMLInputElement && this.value) || 0);
        applyChatDisplay();
        saveSettingsDebounced();
    });

    // Toastr position
    const toastrEl = guardEl('toastr_position');
    if (toastrEl) toastrEl.addEventListener('change', function () {
        power_user.toastr_position = String((this instanceof HTMLInputElement && this.value) || '');
        applyToastrPosition();
        saveSettingsDebounced();
    });

    // Chat width slider
    const chatWidthEl = guardEl('chat_width_slider');
    if (chatWidthEl) chatWidthEl.addEventListener('input', function (e: Event) {
        const applyMode = (e as unknown as Record<string, boolean>).forced ? 'forced' : 'normal';
        power_user.chat_width = Number((this instanceof HTMLInputElement && this.value) || 0);
        applyChatWidth(applyMode);
        saveSettingsDebounced();
        setHotswapsDebounced();
    });

    // Chat truncation
    const chatTruncEl = guardEl('chat_truncation');
    if (chatTruncEl) chatTruncEl.addEventListener('input', function () {
        const ctEl = h('chat_truncation') as HTMLInputElement | null;
        power_user.chat_truncation = Number(ctEl?.value || 0);
        const counter = h('chat_truncation_counter') as HTMLInputElement | null;
        if (counter) counter.value = String(power_user.chat_truncation);
        saveSettingsDebounced();
    });

    // Streaming FPS
    const fpsEl = guardEl('streaming_fps');
    if (fpsEl) fpsEl.addEventListener('input', function () {
        const sfEl = h('streaming_fps') as HTMLInputElement | null;
        power_user.streaming_fps = Number(sfEl?.value || 0);
        const counter = h('streaming_fps_counter') as HTMLInputElement | null;
        if (counter) counter.value = String(power_user.streaming_fps);
        saveSettingsDebounced();
    });

    // Smooth streaming
    const smoothEl = guardEl('smooth_streaming');
    if (smoothEl) smoothEl.addEventListener('input', function () {
        power_user.smooth_streaming = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Smooth streaming no think
    const smoothNoThinkEl = guardEl('smooth_streaming_no_think');
    if (smoothNoThinkEl) smoothNoThinkEl.addEventListener('input', function () {
        power_user.smooth_streaming_no_think = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Smooth streaming speed
    const smoothSpeedEl = guardEl('smooth_streaming_speed');
    if (smoothSpeedEl) smoothSpeedEl.addEventListener('input', function () {
        const sssEl = h('smooth_streaming_speed') as HTMLInputElement | null;
        power_user.smooth_streaming_speed = Number(sssEl?.value || 0);
        saveSettingsDebounced();
    });

    // Stream fade in
    const fadeInEl = guardEl('stream_fade_in');
    if (fadeInEl) fadeInEl.addEventListener('input', function () {
        power_user.stream_fade_in = !!(this instanceof HTMLInputElement && this.checked);
    });
    const enableCodeExecutionEl = guardEl('enable_code_execution') as HTMLInputElement | null;
    if (enableCodeExecutionEl) enableCodeExecutionEl.addEventListener('change', async function (this: HTMLElement) {
        power_user.enable_code_execution = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
        // Dynamically update code-runner buttons without page reload
        const codeRunner = await import('../scripts/code-runner.js');
        if (power_user.enable_code_execution) {
            codeRunner.addExecuteButtonToCodeBlocks();
        } else {
            codeRunner.removeExecuteButtons();
        }
    });
    const autoRunCodeEl = guardEl('auto_run_code') as HTMLInputElement | null;
    if (autoRunCodeEl) autoRunCodeEl.addEventListener('change', function (this: HTMLElement) {
        power_user.auto_run_code = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Font scale
    const fontScaleEl = document.querySelector('input[name="font_scale"]') as HTMLElement | null;
    if (fontScaleEl && guard(fontScaleEl)) {
        fontScaleEl.addEventListener('input', async function (this: HTMLInputElement, e: Event) {
            const applyMode = (e as unknown as Record<string, boolean>).forced ? 'forced' : 'normal';
            power_user.font_scale = Number(this.value || 0);
            const counter = h('font_scale_counter');
            if (counter instanceof HTMLInputElement) counter.value = String(power_user.font_scale);
            applyFontScale(applyMode);
            saveSettingsDebounced();
        });
    }

    // Blur strength
    const blurEl = document.querySelector('input[name="blur_strength"]') as HTMLElement | null;
    if (blurEl && guard(blurEl)) {
        blurEl.addEventListener('input', async function (this: HTMLInputElement) {
            power_user.blur_strength = Number(this.value || 0);
            const counter = h('blur_strength_counter');
            if (counter instanceof HTMLInputElement) counter.value = String(power_user.blur_strength);
            applyBlurStrength();
            saveSettingsDebounced();
        });
    }

    // Shadow width
    const shadowEl = document.querySelector('input[name="shadow_width"]') as HTMLElement | null;
    if (shadowEl && guard(shadowEl)) {
        shadowEl.addEventListener('input', async function (this: HTMLInputElement) {
            power_user.shadow_width = Number(this.value || 0);
            const counter = h('shadow_width_counter');
            if (counter instanceof HTMLInputElement) counter.value = String(power_user.shadow_width);
            applyShadowWidth();
            saveSettingsDebounced();
        });
    }

    // Color pickers
    const cp = (id: string, key: string, themeType: string) => {
        const el = guardEl(id);
        if (el) el.addEventListener('change', (evt: Event) => {
            (power_user as Record<string, unknown>)[key] = (evt as unknown as { detail: { rgba: string } }).detail.rgba;
            applyThemeColor(themeType);
            saveSettingsDebounced();
        });
    };
    cp('main-text-color-picker', 'main_text_color', 'main');
    cp('italics-color-picker', 'italics_text_color', 'italics');
    cp('underline-color-picker', 'underline_text_color', 'underline');
    cp('quote-color-picker', 'quote_text_color', 'quote');
    cp('blur-tint-color-picker', 'blur_tint_color', 'blurTint');
    cp('chat-tint-color-picker', 'chat_tint_color', 'chatTint');
    cp('user-mes-blur-tint-color-picker', 'user_mes_blur_tint_color', 'userMesBlurTint');
    cp('bot-mes-blur-tint-color-picker', 'bot_mes_blur_tint_color', 'botMesBlurTint');
    cp('shadow-color-picker', 'shadow_color', 'shadow');
    cp('border-color-picker', 'border_color', 'border');

    // Reduced motion
    const rmEl = guardEl('reduced_motion');
    if (rmEl) rmEl.addEventListener('input', function () {
        power_user.reduced_motion = !!(this instanceof HTMLInputElement && this.checked);
        switchReducedMotion();
        saveSettingsDebounced();
    });

    // Auto-connect to last server
    const autoConnectEl = guardEl('auto-connect-checkbox');
    if (autoConnectEl) autoConnectEl.addEventListener('input', function () {
        power_user.auto_connect = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Theme selector
    const themesEl = guardEl('themes');
    if (themesEl) themesEl.addEventListener('change', function () {
        const themeSelected = String((this instanceof HTMLInputElement && this.value) || '');
        power_user.theme = themeSelected;
        applyTheme(themeSelected);
        saveSettingsDebounced();
    });

    // Moving UI presets
    const muiPresetsEl = guardEl('movingUIPresets');
    if (muiPresetsEl) muiPresetsEl.addEventListener('change', async function () {
        console.log('saw MUI preset change');
        const movingUIPresetSelected = String((this instanceof HTMLInputElement && this.value) || '');
        power_user.movingUIPreset = movingUIPresetSelected;
        applyMovingUIPreset(movingUIPresetSelected);
        saveSettingsDebounced();
    });

    // UI preset buttons
    const uiSaveEl = guardEl('ui-preset-save-button');
    if (uiSaveEl) uiSaveEl.addEventListener('click', () => saveTheme());
    const uiUpdateEl = guardEl('ui-preset-update-button');
    if (uiUpdateEl) uiUpdateEl.addEventListener('click', () => updateTheme());
    const uiDeleteEl = guardEl('ui-preset-delete-button');
    if (uiDeleteEl) uiDeleteEl.addEventListener('click', () => deleteTheme());

    // Moving UI preset save
    const muiSaveEl = guardEl('movingui-preset-save-button');
    if (muiSaveEl) muiSaveEl.addEventListener('click', saveMovingUI);

    // Never resize avatars
    const neverResizeEl = guardEl('never_resize_avatars');
    if (neverResizeEl) neverResizeEl.addEventListener('input', function () {
        power_user.never_resize_avatars = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Show card avatar URLs
    const showAvatarUrlsEl = guardEl('show_card_avatar_urls');
    if (showAvatarUrlsEl) showAvatarUrlsEl.addEventListener('input', function () {
        power_user.show_card_avatar_urls = !!(this instanceof HTMLInputElement && this.checked);
        printCharactersDebounced();
        saveSettingsDebounced();
    });

    // Play message sound
    const playSoundEl = guardEl('play_message_sound');
    if (playSoundEl) playSoundEl.addEventListener('input', function () {
        power_user.play_message_sound = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Play sound unfocused
    const playSoundUnfocusedEl = guardEl('play_sound_unfocused');
    if (playSoundUnfocusedEl) playSoundUnfocusedEl.addEventListener('input', function () {
        power_user.play_sound_unfocused = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Auto-save message edits
    const autoSaveEditsEl = guardEl('auto_save_msg_edits');
    if (autoSaveEditsEl) autoSaveEditsEl.addEventListener('input', function () {
        power_user.auto_save_msg_edits = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Character sort order
    const sortOrderEl = guardEl('character_sort_order');
    if (sortOrderEl) sortOrderEl.addEventListener('change', function () {
        if (this instanceof HTMLSelectElement) {
            const selectedOption = this.options[this.selectedIndex];
            if (!selectedOption) return;
            const field = String(selectedOption.dataset.field ?? '');
            if (field !== 'search') {
                power_user.sort_field = field;
                power_user.sort_order = selectedOption.dataset.order ?? '';
                power_user.sort_rule = selectedOption.dataset.rule ?? '';
            }
        }
        printCharactersDebounced();
        saveSettingsDebounced();
    });

    // Gestures checkbox
    const gesturesEl = guardEl('gestures-checkbox');
    if (gesturesEl) gesturesEl.addEventListener('change', function () {
        const gEl = h('gestures-checkbox') as HTMLInputElement | null;
        power_user.gestures = !!(gEl?.checked);
        saveSettingsDebounced();
    });

    // Auto swipe
    const autoSwipeEl = guardEl('auto_swipe');
    if (autoSwipeEl) autoSwipeEl.addEventListener('input', function () {
        power_user.auto_swipe = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Auto swipe blacklist
    const autoSwipeBlacklistEl = guardEl('auto_swipe_blacklist');
    if (autoSwipeBlacklistEl) autoSwipeBlacklistEl.addEventListener('input', function () {
        power_user.auto_swipe_blacklist = String((this instanceof HTMLInputElement && this.value) || '')
            .split(',')
            .map(str => str.trim())
            .filter(str => str);
        saveSettingsDebounced();
    });

    // Auto swipe minimum length
    const autoSwipeMinLenEl = guardEl('auto_swipe_minimum_length');
    if (autoSwipeMinLenEl) autoSwipeMinLenEl.addEventListener('input', function () {
        const number = Number((this instanceof HTMLInputElement && this.value) || 0);
        if (!isNaN(number)) {
            power_user.auto_swipe_minimum_length = number;
            saveSettingsDebounced();
        }
    });

    // Auto swipe blacklist threshold
    const autoSwipeBlacklistThreshEl = guardEl('auto_swipe_blacklist_threshold');
    if (autoSwipeBlacklistThreshEl) autoSwipeBlacklistThreshEl.addEventListener('input', function () {
        const number = Number((this instanceof HTMLInputElement && this.value) || 0);
        if (!isNaN(number)) {
            power_user.auto_swipe_blacklist_threshold = number;
            saveSettingsDebounced();
        }
    });

    // Auto-fix generated markdown
    const autoFixMdEl = guardEl('auto_fix_generated_markdown');
    if (autoFixMdEl) autoFixMdEl.addEventListener('input', function () {
        power_user.auto_fix_generated_markdown = !!(this instanceof HTMLInputElement && this.checked);
        reloadCurrentChat();
        saveSettingsDebounced();
    });

    // Console log prompts
    const consoleLogEl = guardEl('console_log_prompts');
    if (consoleLogEl) consoleLogEl.addEventListener('input', function () {
        power_user.console_log_prompts = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Request token probabilities
    const reqTokenProbsEl = guardEl('request_token_probabilities');
    if (reqTokenProbsEl) reqTokenProbsEl.addEventListener('input', function () {
        power_user.request_token_probabilities = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Show group chat queue
    const showGroupQueueEl = guardEl('show_group_chat_queue');
    if (showGroupQueueEl) showGroupQueueEl.addEventListener('input', function () {
        power_user.show_group_chat_queue = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Auto-scroll chat to bottom
    const autoScrollEl = guardEl('auto_scroll_chat_to_bottom');
    if (autoScrollEl) autoScrollEl.addEventListener('input', function () {
        power_user.auto_scroll_chat_to_bottom = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Tokenizer
    const tokenizerEl = guardEl('tokenizer');
    if (tokenizerEl) tokenizerEl.addEventListener('change', function () {
        const value = Number((this instanceof HTMLInputElement && this.value) || 0);
        power_user.tokenizer = value;
        BIAS_CACHE.clear();
        saveSettingsDebounced();
        forceCharacterEditorTokenize();
    });

    // Send on enter
    const sendOnEnterEl = guardEl('send_on_enter');
    if (sendOnEnterEl) sendOnEnterEl.addEventListener('change', function () {
        const value = Number((this instanceof HTMLInputElement && this.value) || 0);
        power_user.send_on_enter = value;
        saveSettingsDebounced();
    });

    // Confirm message delete
    const confirmDelEl = guardEl('confirm_message_delete');
    if (confirmDelEl) confirmDelEl.addEventListener('input', function () {
        power_user.confirm_message_delete = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Reload chat button
    const reloadChatEl = guardEl('reload_chat');
    if (reloadChatEl) reloadChatEl.addEventListener('click', async function () {
        const currentChatId = getCurrentChatId();
        if (currentChatId !== undefined && currentChatId !== null) {
            await saveSettings();
            await saveChatConditional();
            await reloadCurrentChat();
        }
    });

    // Allow name1 display
    const allowName1El = guardEl('allow_name1_display');
    if (allowName1El) allowName1El.addEventListener('input', function () {
        power_user.allow_name1_display = !!(this instanceof HTMLInputElement && this.checked);
        reloadCurrentChat();
        saveSettingsDebounced();
    });

    // Allow name2 display
    const allowName2El = guardEl('allow_name2_display');
    if (allowName2El) allowName2El.addEventListener('input', function () {
        power_user.allow_name2_display = !!(this instanceof HTMLInputElement && this.checked);
        reloadCurrentChat();
        saveSettingsDebounced();
    });

    // Token padding
    const tokenPaddingEl = guardEl('token_padding');
    if (tokenPaddingEl) tokenPaddingEl.addEventListener('input', function () {
        power_user.token_padding = Number((this instanceof HTMLInputElement && this.value) || 0);
        saveSettingsDebounced();
    });

    // Message timer
    const msgTimerEl = guardEl('messageTimerEnabled');
    if (msgTimerEl) msgTimerEl.addEventListener('input', function () {
        const value = !!(this instanceof HTMLInputElement && this.checked);
        power_user.timer_enabled = value;
        switchTimer();
        saveSettingsDebounced();
    });

    // Message timestamps
    const msgTimestampsEl = guardEl('messageTimestampsEnabled');
    if (msgTimestampsEl) msgTimestampsEl.addEventListener('input', function () {
        const value = !!(this instanceof HTMLInputElement && this.checked);
        power_user.timestamps_enabled = value;
        switchTimestamps();
        saveSettingsDebounced();
    });

    // Message model icon
    const msgModelIconEl = guardEl('messageModelIconEnabled');
    if (msgModelIconEl) msgModelIconEl.addEventListener('input', function () {
        const value = !!(this instanceof HTMLInputElement && this.checked);
        power_user.timestamp_model_icon = value;
        switchIcons();
        saveSettingsDebounced();
    });

    // Message tokens
    const msgTokensEl = guardEl('messageTokensEnabled');
    if (msgTokensEl) msgTokensEl.addEventListener('input', function () {
        const value = !!(this instanceof HTMLInputElement && this.checked);
        power_user.message_token_count_enabled = value;
        switchTokenCount();
        saveSettingsDebounced();
    });

    // Expand message actions
    const expandMsgActionsEl = guardEl('expandMessageActions');
    if (expandMsgActionsEl) expandMsgActionsEl.addEventListener('input', function () {
        const value = !!(this instanceof HTMLInputElement && this.checked);
        power_user.expand_message_actions = value;
        switchMessageActions();
        saveSettingsDebounced();
    });

    // Enable Zen Sliders
    const zenSlidersEl = guardEl('enableZenSliders');
    if (zenSlidersEl) zenSlidersEl.addEventListener('input', function () {
        const value = !!(this instanceof HTMLInputElement && this.checked);
        if (power_user.enableLabMode === true && value === true) {
            notyf.warning('Disable Mad Lab Mode before enabling Zen Sliders');
            if (this instanceof HTMLInputElement) this.checked = false;
            this.dispatchEvent(new Event('input'));
            return;
        }
        power_user.enableZenSliders = value;
        switchZenSliders();
        saveSettingsDebounced();
    });

    // Enable Lab Mode
    const labModeEl = guardEl('enableLabMode');
    if (labModeEl) labModeEl.addEventListener('input', function (event) {
        const value = !!(this instanceof HTMLInputElement && this.checked);
        if (power_user.enableZenSliders === true && value === true) {
            notyf.warning('Disable Zen Sliders before enabling Mad Lab Mode');
            if (this instanceof HTMLInputElement) this.checked = false;
            this.dispatchEvent(new Event('input'));
            return;
        }
        power_user.enableLabMode = value;
        switchLabMode({ noReset: false });
        saveSettingsDebounced();
    });

    // Message ID display
    const mesIDDisplayEl = guardEl('mesIDDisplayEnabled');
    if (mesIDDisplayEl) mesIDDisplayEl.addEventListener('input', function () {
        const value = !!(this instanceof HTMLInputElement && this.checked);
        power_user.mesIDDisplay_enabled = value;
        switchMesIDDisplay();
        saveSettingsDebounced();
    });

    // Hide chat avatars
    const hideChatAvatarsEl = guardEl('hideChatAvatarsEnabled');
    if (hideChatAvatarsEl) hideChatAvatarsEl.addEventListener('input', function () {
        const value = !!(this instanceof HTMLInputElement && this.checked);
        power_user.hideChatAvatars_enabled = value;
        switchHideChatAvatars();
        saveSettingsDebounced();
    });

    // Hotswap enabled
    const hotswapEl = guardEl('hotswapEnabled');
    if (hotswapEl) hotswapEl.addEventListener('input', function () {
        const value = !!(this instanceof HTMLInputElement && this.checked);
        power_user.hotswap_enabled = value;
        switchHotswap();
        saveSettingsDebounced();
    });

    // Prefer character prompt
    const prefCharPromptEl = guardEl('prefer_character_prompt');
    if (prefCharPromptEl) prefCharPromptEl.addEventListener('input', function () {
        const value = !!(this instanceof HTMLInputElement && this.checked);
        power_user.prefer_character_prompt = value;
        saveSettingsDebounced();
    });

    // Prefer character jailbreak
    const prefCharJailbreakEl = guardEl('prefer_character_jailbreak');
    if (prefCharJailbreakEl) prefCharJailbreakEl.addEventListener('input', function () {
        const value = !!(this instanceof HTMLInputElement && this.checked);
        power_user.prefer_character_jailbreak = value;
        saveSettingsDebounced();
    });

    // Continue on send
    const continueOnSendEl = guardEl('continue_on_send');
    if (continueOnSendEl) continueOnSendEl.addEventListener('input', function () {
        const value = !!(this instanceof HTMLInputElement && this.checked);
        power_user.continue_on_send = value;
        saveSettingsDebounced();
    });

    // Quick continue
    const quickContinueEl = guardEl('quick_continue');
    if (quickContinueEl) quickContinueEl.addEventListener('input', function () {
        const value = !!(this instanceof HTMLInputElement && this.checked);
        power_user.quick_continue = value;
        const mesContinue = h('mes_continue');
        if (mesContinue) mesContinue.style.display = value ? '' : 'none';
        saveSettingsDebounced();
    });

    // Quick impersonate
    const quickImpersonateEl = guardEl('quick_impersonate');
    if (quickImpersonateEl) quickImpersonateEl.addEventListener('input', function () {
        const value = !!(this instanceof HTMLInputElement && this.checked);
        power_user.quick_impersonate = value;
        const mesImpersonate = h('mes_impersonate');
        if (mesImpersonate) mesImpersonate.style.display = value ? '' : 'none';
        saveSettingsDebounced();
    });

    // Trim spaces
    const trimSpacesEl = guardEl('trim_spaces');
    if (trimSpacesEl) trimSpacesEl.addEventListener('input', function () {
        const value = !!(this instanceof HTMLInputElement && this.checked);
        power_user.trim_spaces = value;
        saveSettingsDebounced();
    });

    // Relaxed API URLs
    const relaxedApiEl = guardEl('relaxed_api_urls');
    if (relaxedApiEl) relaxedApiEl.addEventListener('input', function () {
        const value = !!(this instanceof HTMLInputElement && this.checked);
        power_user.relaxed_api_urls = value;
        saveSettingsDebounced();
    });

    // World import dialog
    const worldImportEl = guardEl('world_import_dialog');
    if (worldImportEl) worldImportEl.addEventListener('input', function () {
        const value = !!(this instanceof HTMLInputElement && this.checked);
        power_user.world_import_dialog = value;
        saveSettingsDebounced();
    });

    // Enable auto-select input
    const autoSelectInputEl = guardEl('enable_auto_select_input');
    if (autoSelectInputEl) autoSelectInputEl.addEventListener('input', function () {
        const value = !!(this instanceof HTMLInputElement && this.checked);
        power_user.enable_auto_select_input = value;
        saveSettingsDebounced();
    });

    // Enable MD hotkeys
    const mdHotkeysEl = guardEl('enable_md_hotkeys');
    if (mdHotkeysEl) mdHotkeysEl.addEventListener('input', function () {
        const value = !!(this instanceof HTMLInputElement && this.checked);
        power_user.enable_md_hotkeys = value;
        toggleMDHotkeyIconDisplay();
        saveSettingsDebounced();
    });

    // Spoiler-free mode
    const spoilerFreeEl = guardEl('spoiler_free_mode');
    if (spoilerFreeEl) spoilerFreeEl.addEventListener('input', function () {
        power_user.spoiler_free_mode = !!(this instanceof HTMLInputElement && this.checked);
        switchSpoilerMode();
        saveSettingsDebounced();
    });

    // Spoiler-free description button
    const spoilerDescBtnEl = guardEl('spoiler_free_desc_button');
    if (spoilerDescBtnEl) spoilerDescBtnEl.addEventListener('click', function (e) {
        e.stopPropagation();
        peekSpoilerMode();
        this.classList.toggle('fa-eye');
        this.classList.toggle('fa-eye-slash');
    });

    // Custom stopping strings
    const customStopStringsEl = guardEl('custom_stopping_strings');
    if (customStopStringsEl) customStopStringsEl.addEventListener('input', function () {
        power_user.custom_stopping_strings = String((this instanceof HTMLInputElement && this.value) || '').trim();
        saveSettingsDebounced();
    });

    // Custom stopping strings macro
    const customStopMacroEl = guardEl('custom_stopping_strings_macro');
    if (customStopMacroEl) customStopMacroEl.addEventListener('change', function () {
        power_user.custom_stopping_strings_macro = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Fuzzy search
    const fuzzySearchEl = guardEl('fuzzy_search_checkbox');
    if (fuzzySearchEl) fuzzySearchEl.addEventListener('input', function () {
        power_user.fuzzy_search = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Persona show notifications
    const personaNotifEl = guardEl('persona_show_notifications');
    if (personaNotifEl) personaNotifEl.addEventListener('input', function () {
        power_user.persona_show_notifications = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Persona allow multi connections
    const personaMultiConnEl = guardEl('persona_allow_multi_connections');
    if (personaMultiConnEl) personaMultiConnEl.addEventListener('input', function () {
        power_user.persona_allow_multi_connections = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Persona auto lock
    const personaAutoLockEl = guardEl('persona_auto_lock');
    if (personaAutoLockEl) personaAutoLockEl.addEventListener('input', function () {
        power_user.persona_auto_lock = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Encode tags
    const encodeTagsEl = guardEl('encode_tags');
    if (encodeTagsEl) encodeTagsEl.addEventListener('input', async function () {
        power_user.encode_tags = !!(this instanceof HTMLInputElement && this.checked);
        await reloadCurrentChat();
        saveSettingsDebounced();
    });

    // Experimental macro engine
    const expMacroEl = guardEl('experimental_macro_engine');
    if (expMacroEl) expMacroEl.addEventListener('input', function () {
        power_user.experimental_macro_engine = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
        if (!settingsReady) return;
        eventSource.once(event_types.SETTINGS_UPDATED, function () {
            notyf.warning(
                'Click here to reload.',
                'Toggling the Experimental Macro Engine requires a reload.',
                {
                    onclick: () => window.location.reload(),
                    timeOut: 10000,
                    preventDuplicates: true,
                },
            );
        });
    });

    // Disable group trimming
    const disableGroupTrimEl = guardEl('disable_group_trimming');
    if (disableGroupTrimEl) disableGroupTrimEl.addEventListener('input', function () {
        power_user.disable_group_trimming = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Debug menu
    const debugMenuEl = guardEl('debug_menu');
    if (debugMenuEl) debugMenuEl.addEventListener('click', function () {
        showDebugMenu();
    });

    // Bogus folders
    const bogusFoldersEl = guardEl('bogus_folders');
    if (bogusFoldersEl) bogusFoldersEl.addEventListener('input', function () {
        power_user.bogus_folders = !!(this instanceof HTMLInputElement && this.checked);
        printCharactersDebounced();
        saveSettingsDebounced();
    });

    // Zoomed avatar magnification
    const zoomedAvatarEl = guardEl('zoomed_avatar_magnification');
    if (zoomedAvatarEl) zoomedAvatarEl.addEventListener('input', function () {
        power_user.zoomed_avatar_magnification = !!(this instanceof HTMLInputElement && this.checked);
        printCharactersDebounced();
        saveSettingsDebounced();
    });

    // Aux field
    const auxFieldEl = guardEl('aux_field');
    if (auxFieldEl) auxFieldEl.addEventListener('change', function () {
        const value = String((this instanceof HTMLInputElement && this.value) || '');
        power_user.aux_field = value;
        printCharactersDebounced();
        saveSettingsDebounced();
    });

    // Tag import setting
    const tagImportEl = guardEl('tag_import_setting');
    if (tagImportEl) tagImportEl.addEventListener('change', function () {
        const value = Number((this instanceof HTMLInputElement && this.value) || 0);
        power_user.tag_import_setting = value;
        saveSettingsDebounced();
    });

    // STscript autocomplete state
    const stsAutoStateEl = guardEl('stscript_autocomplete_state');
    if (stsAutoStateEl) stsAutoStateEl.addEventListener('input', function () {
        power_user.stscript.autocomplete.state = Number((this instanceof HTMLInputElement && this.value) || 0);
        saveSettingsDebounced();
    });

    // STscript autocomplete auto-hide
    const stsAutoHideEl = guardEl('stscript_autocomplete_autoHide');
    if (stsAutoHideEl) stsAutoHideEl.addEventListener('input', function () {
        power_user.stscript.autocomplete.autoHide = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // STscript autocomplete show in all macro fields
    const stsAutoShowAllEl = guardEl('stscript_autocomplete_showInAllMacroFields');
    if (stsAutoShowAllEl) stsAutoShowAllEl.addEventListener('input', function () {
        power_user.stscript.autocomplete.showInAllMacroFields = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // STscript matching
    const stsMatchingEl = guardEl('stscript_matching');
    if (stsMatchingEl) stsMatchingEl.addEventListener('change', function () {
        const value = String((this instanceof HTMLInputElement && this.value) || '');
        power_user.stscript.matching = value;
        saveSettingsDebounced();
    });

    // STscript autocomplete style
    const stsAutoStyleEl = guardEl('stscript_autocomplete_style');
    if (stsAutoStyleEl) stsAutoStyleEl.addEventListener('change', function () {
        const value = String((this instanceof HTMLInputElement && this.value) || '');
        power_user.stscript.autocomplete.style = value;
        document.body.setAttribute('data-stscript-style', power_user.stscript.autocomplete.style);
        saveSettingsDebounced();
    });

    // STscript autocomplete select
    const stsAutoSelectEl = guardEl('stscript_autocomplete_select');
    if (stsAutoSelectEl) stsAutoSelectEl.addEventListener('change', function () {
        const value = String((this instanceof HTMLInputElement && this.value) || '');
        power_user.stscript.autocomplete.select = parseInt(value);
        saveSettingsDebounced();
    });

    // STscript autocomplete font scale
    const stsAutoFontScaleEl = guardEl('stscript_autocomplete_font_scale');
    if (stsAutoFontScaleEl) stsAutoFontScaleEl.addEventListener('input', function () {
        const value = String((this instanceof HTMLInputElement && this.value) || '');
        const counter = h('stscript_autocomplete_font_scale_counter');
        if (counter instanceof HTMLInputElement) counter.value = value;
        power_user.stscript.autocomplete.font.scale = Number(value);
        document.body.style.setProperty('--ac-font-scale', value.toString());
        window.dispatchEvent(new Event('resize', { bubbles: true }));
        saveSettingsDebounced();
    });

    // STscript autocomplete font scale counter
    const stsAutoFontScaleCounterEl = guardEl('stscript_autocomplete_font_scale_counter');
    if (stsAutoFontScaleCounterEl) stsAutoFontScaleCounterEl.addEventListener('input', function () {
        const value = String((this instanceof HTMLInputElement && this.value) || '');
        const slider = h('stscript_autocomplete_font_scale');
        if (slider instanceof HTMLInputElement) slider.value = value;
        power_user.stscript.autocomplete.font.scale = Number(value);
        document.body.style.setProperty('--ac-font-scale', value.toString());
        window.dispatchEvent(new Event('resize', { bubbles: true }));
        saveSettingsDebounced();
    });

    // STscript autocomplete width left
    const stsAutoWidthLeftEl = guardEl('stscript_autocomplete_width_left');
    if (stsAutoWidthLeftEl) stsAutoWidthLeftEl.addEventListener('input', function () {
        const value = Number((this instanceof HTMLInputElement && this.value) || 0);
        power_user.stscript.autocomplete.width.left = value;
        const container = this.closest('.doubleRangeInputContainer');
        if (container instanceof HTMLElement) container.style.setProperty('--value', value.toString());
        window.dispatchEvent(new Event('resize', { bubbles: true }));
        saveSettingsDebounced();
    });

    // STscript autocomplete width right
    const stsAutoWidthRightEl = guardEl('stscript_autocomplete_width_right');
    if (stsAutoWidthRightEl) stsAutoWidthRightEl.addEventListener('input', function () {
        const value = Number((this instanceof HTMLInputElement && this.value) || 0);
        power_user.stscript.autocomplete.width.right = value;
        const container = this.closest('.doubleRangeInputContainer');
        if (container instanceof HTMLElement) container.style.setProperty('--value', value.toString());
        window.dispatchEvent(new Event('resize', { bubbles: true }));
        saveSettingsDebounced();
    });

    // STscript parser flag strict escaping
    const stsStrictEscEl = guardEl('stscript_parser_flag_strict_escaping');
    if (stsStrictEscEl) stsStrictEscEl.addEventListener('click', function () {
        const value = this instanceof HTMLInputElement && this.checked;
        power_user.stscript.parser.flags[PARSER_FLAG.STRICT_ESCAPING] = value;
        saveSettingsDebounced();
    });

    // STscript parser flag replace getvar
    const stsReplaceGetvarEl = guardEl('stscript_parser_flag_replace_getvar');
    if (stsReplaceGetvarEl) stsReplaceGetvarEl.addEventListener('click', function () {
        const value = this instanceof HTMLInputElement && this.checked;
        power_user.stscript.parser.flags[PARSER_FLAG.REPLACE_GETVAR] = value;
        saveSettingsDebounced();
    });

    // Restore user input
    const restoreUserInputEl = guardEl('restore_user_input');
    if (restoreUserInputEl) restoreUserInputEl.addEventListener('input', function () {
        power_user.restore_user_input = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Compact input area
    const compactInputAreaEl = guardEl('compact_input_area');
    if (compactInputAreaEl) compactInputAreaEl.addEventListener('input', function () {
        power_user.compact_input_area = !!(this instanceof HTMLInputElement && this.checked);
        switchCompactInputArea();
        saveSettingsDebounced();
    });

    // Show swipe number for all messages
    const showSwipeNumEl = guardEl('show_swipe_num_all_messages');
    if (showSwipeNumEl) showSwipeNumEl.addEventListener('input', function () {
        power_user.show_swipe_num_all_messages = !!(this instanceof HTMLInputElement && this.checked);
        switchSwipeNumAllMessages();
        saveSettingsDebounced();
    });

    // Auto-load last chat
    const autoLoadChatEl = guardEl('auto-load-chat-checkbox');
    if (autoLoadChatEl) autoLoadChatEl.addEventListener('input', function () {
        power_user.auto_load_chat = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // Forbid external media
    const forbidExtMediaEl = guardEl('forbid_external_media');
    if (forbidExtMediaEl) forbidExtMediaEl.addEventListener('input', function () {
        power_user.forbid_external_media = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
        reloadCurrentChat();
    });

    // Pin styles
    const pinStylesEl = guardEl('pin_styles');
    if (pinStylesEl) pinStylesEl.addEventListener('input', function () {
        power_user.pin_styles = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
        applyStylePins();
    });

    // Click to edit
    const clickToEditEl = guardEl('click_to_edit');
    if (clickToEditEl) clickToEditEl.addEventListener('input', function () {
        power_user.click_to_edit = !!(this instanceof HTMLInputElement && this.checked);
        saveSettingsDebounced();
    });

    // UI preset import button
    const uiImportBtnEl = guardEl('ui_preset_import_button');
    if (uiImportBtnEl) uiImportBtnEl.addEventListener('click', function () {
        h('ui_preset_import_file')?.click();
    });

    // UI preset import file
    const uiImportFileEl = guardEl('ui_preset_import_file');
    if (uiImportFileEl) uiImportFileEl.addEventListener('change', async function () {
        try {
            const file = (this instanceof HTMLInputElement && this.files?.[0]) || undefined;
            await importTheme(file);
        } catch (error) {
            console.error('Error importing UI theme', error);
            notyf.error(String(error), 'Failed to import UI theme');
        } finally {
            if (this instanceof HTMLInputElement) this.value = '';
        }
    });

    // UI preset export button
    const uiExportBtnEl = guardEl('ui_preset_export_button');
    if (uiExportBtnEl) uiExportBtnEl.addEventListener('click', async function () {
        await exportTheme();
    });

    // Media display
    const mediaDisplayEl = guardEl('media_display');
    if (mediaDisplayEl) mediaDisplayEl.addEventListener('input', async function () {
        power_user.media_display = String((this instanceof HTMLInputElement && this.value) || '');
        saveSettingsDebounced();
        if (isMediaDisplayReloadNeeded()) {
            await reloadCurrentChat();
        }
    });

    // Image overswipe
    const imageOverswipeEl = guardEl('image_overswipe');
    if (imageOverswipeEl) imageOverswipeEl.addEventListener('input', function () {
        power_user.image_overswipe = String((this instanceof HTMLInputElement && this.value) || '');
        saveSettingsDebounced();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    registerSettingsPanelHandlers();
    document.getElementById('rm_ch_create_block')?.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('character_popup')?.dispatchEvent(new Event('input', { bubbles: true }));
});

/**
 * Executes a function when DOM is ready.
 * Works whether this runs before or after DOMContentLoaded has fired.
 * @param fn
 */
function onDomReady(fn: () => void) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
    } else {
        fn();
    }
}

onDomReady(() => {
    const adjustAutocompleteDebounced = debounce(() => {
        document.querySelectorAll('.ui-autocomplete-input').forEach(function (el) {
            // @ts-expect-error TS(2339) FIXME: Property 'tomSelect' does not exist on type 'Element'.
            if (el.tomSelect) {
                // @ts-expect-error TS(2339) FIXME: Property 'tomSelect' does not exist on type 'Element'.
                if (el.tomSelect.wrapper.classList.contains('dropdown-active')) {
                    // @ts-expect-error TS(2339) FIXME: Property 'tomSelect' does not exist on type 'Element'.
                    el.tomSelect.open();
                }
            } else {
                const jqEl = el as unknown as { autocomplete: (...args: string[]) => unknown };
                if (el && typeof jqEl.autocomplete === 'function') {
                    const widget = jqEl.autocomplete('widget') as unknown as HTMLElement[];
                    if (widget[0] && widget[0].style.display !== 'none') {
                        jqEl.autocomplete('search');
                    }
                }
            }
        });
    });

    const reportZoomLevelDebounced = debounce(() => {
        const zoomLevel = parseFloat(Number(window.devicePixelRatio).toFixed(2)) || 1;
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;
        const originalWidth = winWidth * zoomLevel;
        const originalHeight = winHeight * zoomLevel;
        console.debug(`Window resize: ${coreTruthWinWidth}x${coreTruthWinHeight} -> ${window.innerWidth}x${window.innerHeight}`);
        console.debug(`Zoom: ${zoomLevel}, X:${winWidth}, Y:${winHeight}, original: ${originalWidth}x${originalHeight} `);
        return zoomLevel;
    });

    let coreTruthWinWidth = window.innerWidth;
    let coreTruthWinHeight = window.innerHeight;

    window.addEventListener('resize', async () => {
        adjustAutocompleteDebounced();
        setHotswapsDebounced();

        if (isMobile()) {
            return;
        }

        reportZoomLevelDebounced();

        //attempt to scale movingUI elements naturally across window resizing/zooms
        //this will still break if the zoom level causes mobile styles to come into play.
        const scaleY = parseFloat(Number(window.innerHeight / coreTruthWinHeight).toFixed(4));
        const scaleX = parseFloat(Number(window.innerWidth / coreTruthWinWidth).toFixed(4));

        const movingUIStateRec = power_user.movingUIState as Record<string, Record<string, string>>;
        if (Object.keys(movingUIStateRec).length > 0) {
            for (const elmntName of Object.keys(movingUIStateRec)) {
                const elmntState = movingUIStateRec[elmntName]!;
                const oldHeight = Number(elmntState.height ?? 0);
                const oldWidth = Number(elmntState.width ?? 0);
                const oldLeft = Number(elmntState.left ?? 0);
                const oldTop = Number(elmntState.top ?? 0);
                const oldBottom = Number(elmntState.bottom ?? 0);
                const oldRight = Number(elmntState.right ?? 0);
                const newHeight = Number(oldHeight * scaleY).toFixed(0);
                const newWidth = Number(oldWidth * scaleX).toFixed(0);
                const newLeft = Number(oldLeft * scaleX).toFixed(0);
                const newTop = Number(oldTop * scaleY).toFixed(0);
                const newBottom = Number(oldBottom * scaleY).toFixed(0);
                const newRight = Number(oldRight * scaleX).toFixed(0);
                try {
                    const elmnt = document.getElementById(elmntName);
                    if (elmnt) {
                        console.log(`scaling ${elmntName} by ${scaleX}x${scaleY} to ${newWidth}x${newHeight}`);
                        (elmnt as HTMLElement).style.height = newHeight;
                        (elmnt as HTMLElement).style.width = newWidth;
                        (elmnt as HTMLElement).style.inset = `${newTop}px ${newRight}px ${newBottom}px ${newLeft}px`;
                        movingUIStateRec[elmntName]!.height = newHeight;
                        movingUIStateRec[elmntName]!.width = newWidth;
                        movingUIStateRec[elmntName]!.top = newTop;
                        movingUIStateRec[elmntName]!.bottom = newBottom;
                        movingUIStateRec[elmntName]!.left = newLeft;
                        movingUIStateRec[elmntName]!.right = newRight;
                    } else {
                        console.log(`skipping ${elmntName} because it doesn't exist in the DOM`);
                    }
                } catch (err) {
                    console.log(`error occurred while processing ${elmntName}: ${err}`);
                }
            }
        } else {
            console.debug('aborting MUI reset', Object.keys(power_user.movingUIState).length);
        }
        saveSettingsDebounced();
        coreTruthWinWidth = window.innerWidth;
        coreTruthWinHeight = window.innerHeight;
    });


});
