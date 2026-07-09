import { Fuse, Handlebars } from '../lib.js';

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
    setCharacterId,
    setEditedMessageId,
    chat,
    getFirstDisplayedMessageId,
    showMoreMessages,
    saveSettings,
    saveChatConditional,
    setAnimationDuration,
    ANIMATION_DURATION_DEFAULT,
    setActiveGroup,
    setActiveCharacter,
    entitiesFilter,
    doNewChat,
    online_status,
    messageFormatting,
    extension_prompt_types,
    extension_prompt_roles,
    deleteMessage,
    settingsReady,
} from '../script.js';
import { isMobile, initMovingUI, favsToHotswap } from './RossAscends-mods.js';
import {
    groups,
    resetSelectedGroup,
} from './group-chats.js';
import {
    instruct_presets,
    loadInstructMode,
    names_behavior_types,
    selectInstructPreset,
    updateBindModelTemplatesState,
} from './instruct-mode.js';

// @ts-expect-error TS(7034) FIXME: Variable 'tags' implicitly has type 'any[]' in som... Remove this comment to see the full error message
import { getTagsList, tag_import_setting, tag_map, tag_sort_mode, tags } from './tags.js';
import { tokenizers } from './tokenizers.js';
import { BIAS_CACHE } from './logit-bias.js';
import { renderTemplateAsync } from './templates.js';

import { countOccurrences, debounce, delay, download, getFileText, getSanitizedFilename, getStringHash, isOdd, isTrueBoolean, onlyUnique, resetScrollHeight, shuffle, sortMoments, stringToRange, timestampToMoment } from './utils.js';
import { FILTER_TYPES } from './filters.js';
import { PARSER_FLAG, SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from './slash-commands/SlashCommandArgument.js';
import { AUTOCOMPLETE_SELECT_KEY, AUTOCOMPLETE_STATE, AUTOCOMPLETE_WIDTH } from './autocomplete/AutoComplete.js';
import { SlashCommandEnumValue, enumTypes } from './slash-commands/SlashCommandEnumValue.js';
import { commonEnumProviders, enumIcons } from './slash-commands/SlashCommandCommonEnumsProvider.js';
import { POPUP_TYPE, callGenericPopup, fixToastrForDialogs } from './popup.js';
import { loadSystemPrompts } from './sysprompt.js';
import { fuzzySearchCategories } from './filters.js';
import { accountStorage } from './util/AccountStorage.js';
import { extractDominantColor, generateThemePalette, deriveBackgroundName } from './util/ThemeGenerator.js';
import { DEFAULT_REASONING_TEMPLATE, loadReasoningTemplates } from './reasoning.js';
import { bindModelTemplates } from './chat-templates.js';
import { IMAGE_OVERSWIPE, MEDIA_DISPLAY } from './constants.js';
import { t } from './i18n.js';
import { getBackgroundPath, isCustomBackgroundUrl } from './backgrounds.js';
import { persona_description_positions as _persona_description_positions } from './personas.js';

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
    sort_rule: null,
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
    auto_swipe_blacklist: [],
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

    personas: {},
    default_persona: null,
    persona_descriptions: {},

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
            flags: {},
        },
    },
    restore_user_input: true,
    reduced_motion: false,
    compact_input_area: true,
    show_swipe_num_all_messages: false,
    auto_connect: false,
    auto_load_chat: false,
    forbid_external_media: true,
    external_media_allowed_overrides: [],
    external_media_forbidden_overrides: [],
    pin_styles: true,
    click_to_edit: false,
    media_display: MEDIA_DISPLAY.LIST,
    image_overswipe: IMAGE_OVERSWIPE.GENERATE,
};

// @ts-expect-error TS(7034) FIXME: Variable 'themes' implicitly has type 'any[]' in s... Remove this comment to see the full error message
let themes = [];
// @ts-expect-error TS(7034) FIXME: Variable 'movingUIPresets' implicitly has type 'an... Remove this comment to see the full error message
let movingUIPresets = [];
/** @type {ContextSettings[]} */
export let context_presets = [];

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

let browser_has_focus = true;
// @ts-expect-error TS(7034) FIXME: Variable 'debug_functions' implicitly has type 'an... Remove this comment to see the full error message
const debug_functions = [];

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
// @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
export function collapseNewlines(x) {
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
// @ts-expect-error TS(7006) FIXME: Parameter 'text' implicitly has an 'any' type.
export function fixMarkdown(text, forDisplay) {
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
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        const matchText = matches[i][0];
        const replacementText = matchText.replace(/(\*|_)([\t \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]+)|([\t \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]+)(\*|_)/g, '$1$4');
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        newText = newText.slice(0, matches[i].index) + replacementText + newText.slice(matches[i].index + matchText.length);
    }

    // Don't auto-fix asterisks if this is a message clean-up procedure.
    // It botches the continue function. Apply this to display only.
    if (!forDisplay) {
        return newText;
    }

    const splitText = newText.split('\n');

    // Fix asterisks, and quotes that are not paired
    for (let index = 0; index < splitText.length; index++) {
        const line = splitText[index];
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
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#hotswapEnabled').prop('checked', power_user.hotswap_enabled);
}

/**
 *
 */
function switchTimer() {
    document.body.classList.toggle('no-timer', !power_user.timer_enabled);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#messageTimerEnabled').prop('checked', power_user.timer_enabled);
}

/**
 *
 */
function switchTimestamps() {
    document.body.classList.toggle('no-timestamps', !power_user.timestamps_enabled);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#messageTimestampsEnabled').prop('checked', power_user.timestamps_enabled);
}

/**
 *
 */
function switchIcons() {
    document.body.classList.toggle('no-modelIcons', !power_user.timestamp_model_icon);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#messageModelIconEnabled').prop('checked', power_user.timestamp_model_icon);
}

/**
 *
 */
function switchTokenCount() {
    document.body.classList.toggle('no-tokenCount', !power_user.message_token_count_enabled);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#messageTokensEnabled').prop('checked', power_user.message_token_count_enabled);
}

/**
 *
 */
function switchMesIDDisplay() {
    document.body.classList.toggle('no-mesIDDisplay', !power_user.mesIDDisplay_enabled);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#mesIDDisplayEnabled').prop('checked', power_user.mesIDDisplay_enabled);
}

/**
 *
 */
function switchHideChatAvatars() {
    document.body.classList.toggle('hideChatAvatars', power_user.hideChatAvatars_enabled);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#hideChatAvatarsEnabled').prop('checked', power_user.hideChatAvatars_enabled);
}

/**
 *
 */
function switchMessageActions() {
    document.body.classList.toggle('expandMessageActions', power_user.expand_message_actions);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#expandMessageActions').prop('checked', power_user.expand_message_actions);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('.extraMesButtons, .extraMesButtonsHint').removeAttr('style');
}

/**
 *
 */
function switchReducedMotion() {
    const osReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (osReduced) {
        power_user.reduced_motion = true;
    }
    // @ts-expect-error TS(2304) FIXME: Cannot find name 'jQuery'.
    jQuery.fx.off = power_user.reduced_motion;
    const overrideDuration = power_user.reduced_motion ? 0 : ANIMATION_DURATION_DEFAULT;
    // @ts-expect-error TS(2345) FIXME: Argument of type '0 | 125' is not assignable to pa... Remove this comment to see the full error message
    setAnimationDuration(overrideDuration);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#reduced_motion').prop('checked', power_user.reduced_motion);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#reduced_motion').prop('disabled', osReduced);
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
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    document.getElementById('send_form').classList.toggle('compact', power_user.compact_input_area);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#compact_input_area').prop('checked', power_user.compact_input_area);
}

/**
 *
 */
function switchSwipeNumAllMessages() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#show_swipe_num_all_messages').prop('checked', power_user.show_swipe_num_all_messages);
    document.body.classList.toggle('swipeAllMessages', !!power_user.show_swipe_num_all_messages);
}

// @ts-expect-error TS(7034) FIXME: Variable 'originalSliderValues' implicitly has typ... Remove this comment to see the full error message
const originalSliderValues = [];

/**
 *
 * @param root0
 * @param root0.noReset
 */
async function switchLabMode({ noReset = false } = {}) {
    /*     if (power_user.enableZenSliders && power_user.enableLabMode) {
            toastr.warning("Can't start Lab Mode while Zen Sliders are active")
            return
            //$("#enableZenSliders").trigger('click')
        }
     */
    await delay(100);
    document.body.classList.toggle('enableLabMode', power_user.enableLabMode);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#enableLabMode').prop('checked', power_user.enableLabMode);

    if (power_user.enableLabMode) {
        //save all original slider values into an array
        document.querySelectorAll('#advanced-ai-config-block input').forEach(el => {
            const id = el.id;
            const min = el.getAttribute('min');
            const max = el.getAttribute('max');
            const step = el.getAttribute('step');
            originalSliderValues.push({ id, min, max, step });
        });
        //console.log(originalSliderValues)
        //remove limits on all inputs and hide sliders
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#advanced-ai-config-block input')
            .attr('min', '-99999')
            .attr('max', '99999')
            .attr('step', '0.001');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('labModeWarning').classList.remove('displayNone');
        //$("#advanced-ai-config-block input[type='range']").hide()

        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#amount_gen_counter').attr('min', '1')
            .attr('max', '99999')
            .attr('step', '1');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#amount_gen').attr('min', '1')
            .attr('max', '99999')
            .attr('step', '1');
    } else if (!noReset) {
        //re apply the original sliders values to each input
        // @ts-expect-error TS(7005) FIXME: Variable 'originalSliderValues' implicitly has an ... Remove this comment to see the full error message
        originalSliderValues.forEach(function (slider) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#' + slider.id)
                .attr('min', slider.min)
                .attr('max', slider.max)
                .attr('step', slider.step)
                .trigger('input');
        });
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#advanced-ai-config-block input[type=\'range\']').show();
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('labModeWarning').classList.add('displayNone');

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
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#enableZenSliders').prop('checked', power_user.enableZenSliders);

    if (power_user.enableZenSliders) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#clickSlidersTips').hide();
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#pro-settings-block input[type=\'number\']').hide();
        //hide number inputs that are not 'seed' inputs
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $(`#textgenerationwebui_api-settings :input[type='number']:not([id^='seed']):not([id^='n_']),
            #kobold_api-settings :input[type='number']:not([id^='seed'])`).hide();
        //hide original sliders
        document.querySelectorAll(`#textgenerationwebui_api-settings input[type='range'],
            #kobold_api-settings input[type='range'],
            #pro-settings-block input[type='range']:not(#max_context)`).forEach(el => {
            // @ts-expect-error TS(2339) FIXME: Property 'style' does not exist on type 'Element'.
            el.style.display = 'none';
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            CreateZenSliders($(el));
        });
        //this is for when zensliders is toggled after pageload
        switchMaxContextSize();
    } else {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#clickSlidersTips').show();
        revertOriginalSliders();
    }

    /**
     *
     */
    function revertOriginalSliders() {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#pro-settings-block input[type=\'number\']').show();
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $(`#textgenerationwebui_api-settings input[type='number'],
            #kobold_api-settings input[type='number']`).show();
        document.querySelectorAll(`#textgenerationwebui_api-settings input[type='range'],
            #kobold_api-settings input[type='range'],
            #pro-settings-block input[type='range']`).forEach(el => {
            // @ts-expect-error TS(2339) FIXME: Property 'style' does not exist on type 'Element'.
            el.style.display = '';
        });
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('div[id$="_zenslider"]').remove();
    }
}
/**
 *
 * @param elmnt
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'elmnt' implicitly has an 'any' type.
async function CreateZenSliders(elmnt) {
    const originalSlider = elmnt;
    const sliderID = originalSlider.attr('id');
    let sliderMin = Number(originalSlider.attr('min'));
    let sliderMax = Number(originalSlider.attr('max'));
    let sliderValue = originalSlider.val();
    const sliderRange = sliderMax - sliderMin;
    let numSteps = 20;
    let decimals = 2;
    // @ts-expect-error TS(7034) FIXME: Variable 'offVal' implicitly has type 'any' in som... Remove this comment to see the full error message
    let offVal, allVal;
    // @ts-expect-error TS(7034) FIXME: Variable 'stepScale' implicitly has type 'any' in ... Remove this comment to see the full error message
    let stepScale;
    // @ts-expect-error TS(7034) FIXME: Variable 'steps' implicitly has type 'any' in some... Remove this comment to see the full error message
    let steps;
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
    }
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const newSlider = $('<div>')
        .attr('id', `${sliderID}_zenslider`)
        .css('width', '100%')
        .insertBefore(originalSlider);
    newSlider.slider({
        value: sliderValue,
        step: stepScale,
        min: sliderMin,
        max: sliderMax,
        create: async function () {
            await delay(100);
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const handle = $(this.querySelector('.ui-slider-handle'));
            let handleText, stepNumber, leftMargin;

            //handling creation of amt_gen
            if (newSlider.attr('id') == 'amount_gen_zenslider') {
                // @ts-expect-error TS(7005) FIXME: Variable 'steps' implicitly has an 'any' type.
                handleText = steps[sliderValue];
                stepNumber = sliderValue;
                leftMargin = ((stepNumber) / numSteps) * 50 * -1;
                handle.text(handleText)
                    .css('margin-left', `${leftMargin}px`);
                //console.log(`${newSlider.attr('id')} initial value:${handleText}, stepNum:${stepNumber}, numSteps:${numSteps}, left-margin:${leftMargin}`)
            } else if (newSlider.attr('id') == 'rep_pen_range_textgenerationwebui_zenslider') {
                //handling creation of rep_pen_range for ooba
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                if ($('#rep_pen_range_textgenerationwebui_zensliders').length !== 0) {
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $('#rep_pen_range_textgenerationwebui_zensliders').remove();
                }
                // @ts-expect-error TS(7005) FIXME: Variable 'steps' implicitly has an 'any' type.
                handleText = steps[sliderValue];
                stepNumber = sliderValue;
                leftMargin = ((stepNumber) / numSteps) * 50 * -1;
                // @ts-expect-error TS(7005) FIXME: Variable 'offVal' implicitly has an 'any' type.
                if (sliderValue === offVal) {
                    handleText = 'Off';
                    handle.css('color', 'rgba(128,128,128,0.5)');
                // @ts-expect-error TS(7005) FIXME: Variable 'allVal' implicitly has an 'any' type.
                } else if (sliderValue === allVal) { handleText = 'All'; } else { handle.css('color', ''); }
                handle.text(handleText)
                    .css('margin-left', `${leftMargin}px`);
                //console.log(sliderValue, handleText, offVal, allVal)
                //console.log(`${newSlider.attr('id')} sliderValue = ${sliderValue}, handleText:${handleText}, stepNum:${stepNumber}, numSteps:${numSteps}, left-margin:${leftMargin}`)
                // @ts-expect-error TS(7005) FIXME: Variable 'steps' implicitly has an 'any' type.
                originalSlider.val(steps[sliderValue]);
            } else {
                //create all other sliders
                const numVal = Number(sliderValue).toFixed(decimals);
                // @ts-expect-error TS(7005) FIXME: Variable 'offVal' implicitly has an 'any' type.
                offVal = Number(offVal).toFixed(decimals);
                if (numVal === offVal) {
                    handle.text('Off').css('color', 'rgba(128,128,128,0.5)');
                } else {
                    handle.text(numVal).css('color', '');
                }
                // @ts-expect-error TS(7005) FIXME: Variable 'stepScale' implicitly has an 'any' type.
                stepNumber = ((sliderValue - sliderMin) / stepScale);
                leftMargin = (stepNumber / numSteps) * 50 * -1;
                originalSlider.val(numVal)
                    .data('newSlider', newSlider);
                //console.log(`${newSlider.attr('id')} sliderValue = ${sliderValue}, handleText:${handleText, numVal}, stepNum:${stepNumber}, numSteps:${numSteps}, left-margin:${leftMargin}`)
                let isManualInput = false;
                // @ts-expect-error TS(7034) FIXME: Variable 'valueBeforeManualInput' implicitly has t... Remove this comment to see the full error message
                let valueBeforeManualInput;
                handle.css('margin-left', `${leftMargin}px`)

                    .attr('contenteditable', 'true')
                    //these sliders need listeners for manual inputs
                    .on('click', function () {
                        //this just selects all the text in the handle so user can overwrite easily
                        //needed because JQUery UI uses left/right arrow keys as well as home/end to move the slider..
                        valueBeforeManualInput = newSlider.val();
                        console.log(valueBeforeManualInput);
                        const handleElement = handle[0];
                        const range = document.createRange();
                        range.selectNodeContents(handleElement);
                        const selection = window.getSelection();
                        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                        selection.removeAllRanges();
                        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                        selection.addRange(range);
                    })
                    // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
                    .on('keyup', function (e) {
                        valueBeforeManualInput = numVal;
                        //console.log(valueBeforeManualInput, numVal, handleText);
                        isManualInput = true;
                        //allow enter to trigger slider update
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            handle.trigger('blur');
                        }
                    })
                    //trigger slider changes when user clicks away
                    .on('mouseup blur', function () {
                        const manualInput = parseFloat(parseFloat(handle.text()).toFixed(decimals));
                        if (isManualInput) {
                            //disallow manual inputs outside acceptable range
                            if (manualInput >= sliderMin && manualInput <= sliderMax) {
                                //if value is ok, assign to slider and update handle text and position
                                newSlider.val(manualInput);
                                handleSlideEvent.call(newSlider, null, { value: manualInput }, 'manual');
                                valueBeforeManualInput = manualInput;
                            } else {
                                //if value not ok, warn and reset to last known valid value
                                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                                toastr.warning(`Invalid value. Must be between ${sliderMin} and ${sliderMax}`);
                                // @ts-expect-error TS(7005) FIXME: Variable 'valueBeforeManualInput' implicitly has a... Remove this comment to see the full error message
                                console.log(valueBeforeManualInput);
                                // @ts-expect-error TS(7005) FIXME: Variable 'valueBeforeManualInput' implicitly has a... Remove this comment to see the full error message
                                newSlider.val(valueBeforeManualInput);
                                // @ts-expect-error TS(7005) FIXME: Variable 'valueBeforeManualInput' implicitly has a... Remove this comment to see the full error message
                                handle.text(valueBeforeManualInput);
                                // @ts-expect-error TS(7005) FIXME: Variable 'valueBeforeManualInput' implicitly has a... Remove this comment to see the full error message
                                handleSlideEvent.call(newSlider, null, { value: parseFloat(valueBeforeManualInput) }, 'manual');
                            }
                        }
                        isManualInput = false;
                    });
            }
            //zenSlider creation done, hide the original
            originalSlider.hide();
        },
        slide: handleSlideEvent,
    });

    /**
     *
     * @param event
     * @param ui
     * @param type
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    function handleSlideEvent(event, ui, type) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const handle = $(this.querySelector('.ui-slider-handle'));
        let numVal = parseFloat(Number(ui.value).toFixed(decimals));
        // @ts-expect-error TS(7005) FIXME: Variable 'offVal' implicitly has an 'any' type.
        offVal = parseFloat(Number(offVal).toFixed(decimals));
        // @ts-expect-error TS(7005) FIXME: Variable 'allVal' implicitly has an 'any' type.
        allVal = parseFloat(Number(allVal).toFixed(decimals));
        console.log(numVal, sliderMin, sliderMax, numVal > sliderMax, numVal < sliderMin);
        if (numVal > sliderMax) { numVal = sliderMax; }
        if (numVal < sliderMin) { numVal = sliderMin; }
        // @ts-expect-error TS(7005) FIXME: Variable 'stepScale' implicitly has an 'any' type.
        const stepNumber = parseFloat(((ui.value - sliderMin) / stepScale).toFixed(0));
        let handleText = (ui.value);
        const leftMargin = (stepNumber / numSteps) * 50 * -1;
        const perStepPercent = 1 / numSteps; //how far in % each step should be on the slider
        const leftPos = newSlider.width() * (stepNumber * perStepPercent); //how big of a left margin to give the slider for manual inputs
        /*         console.log(`
                numVal: ${numVal},
                sliderMax: ${sliderMax}
                sliderMin: ${sliderMin}
                sliderValRange: ${sliderValRange}
                stepScale: ${stepScale}
                Step: ${stepNumber} of ${numSteps}
                offVal: ${offVal}
                allVal = ${allVal}
                initial value: ${handleText}
                left-margin: ${leftMargin}
                width: ${newSlider.width()}
                percent of max: ${percentOfMax}
                left: ${leftPos}`) */
        if (newSlider.attr('id') == 'amount_gen_zenslider') {
            //special handling for response length slider, pulls text aliases for step values from an array
            // @ts-expect-error TS(7005) FIXME: Variable 'steps' implicitly has an 'any' type.
            handleText = steps[stepNumber];
            handle.text(handleText);
            newSlider.val(stepNumber);
            // @ts-expect-error TS(7005) FIXME: Variable 'steps' implicitly has an 'any' type.
            numVal = steps[stepNumber];
        } else if (newSlider.attr('id') == 'rep_pen_range_textgenerationwebui_zenslider') {
            //special handling for TextCompletion rep pen range slider, pulls text aliases for step values from an array
            // @ts-expect-error TS(7005) FIXME: Variable 'steps' implicitly has an 'any' type.
            handleText = steps[stepNumber];
            handle.text(handleText);
            newSlider.val(stepNumber);
            if (numVal === offVal) { handle.text('Off').css('color', 'rgba(128,128,128,0.5)'); } else if (numVal === allVal) { handle.text('All'); } else { handle.css('color', ''); }
            // @ts-expect-error TS(7005) FIXME: Variable 'steps' implicitly has an 'any' type.
            numVal = steps[stepNumber];
        } else {
            //everything else uses the flat slider value
            //also note: the above sliders are not custom inputtable due to the array aliasing
            //show 'off' if disabled value is set
            if (numVal === offVal) { handle.text('Off').css('color', 'rgba(128,128,128,0.5)'); } else { handle.text(ui.value.toFixed(decimals)).css('color', ''); }
            newSlider.val(handleText);
        }
        //for manually typed-in values we must adjust left position because JQUI doesn't do it for us
        handle.css('left', leftPos);
        //adjust a negative left margin to avoid overflowing right side of slider body
        handle.css('margin-left', `${leftMargin}px`);
        originalSlider.val(numVal);
        originalSlider.trigger('input');
        originalSlider.trigger('change');
    }
}
/**
 *
 */
function switchUiMode() {
    document.body.classList.toggle('no-blur', power_user.fast_ui_mode);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#fast_ui_mode').prop('checked', power_user.fast_ui_mode);
    if (power_user.fast_ui_mode) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#blur-strength-block').css('opacity', '0.2');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#blur_strength').prop('disabled', true);
    } else {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#blur-strength-block').css('opacity', '1');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#blur_strength').prop('disabled', false);
    }
}

/**
 *
 */
function toggleWaifu() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#waifuMode').trigger('click');
    return '';
}

/**
 *
 */
function switchWaifuMode() {
    document.body.classList.toggle('waifuMode', power_user.waifuMode);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#waifuMode').prop('checked', power_user.waifuMode);
    scrollChatToBottom();
}

/**
 *
 */
function switchSpoilerMode() {
    // @ts-expect-error TS(2339) FIXME: Property 'spoiler_free_mode' does not exist on typ... Remove this comment to see the full error message
    if (power_user.spoiler_free_mode) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#descriptionWrapper').hide();
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#firstMessageWrapper').hide();
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('spoiler_free_desc').classList.add('flex1');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#creators_note_desc_hidden').show();
    } else {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#descriptionWrapper').show();
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#firstMessageWrapper').show();
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('spoiler_free_desc').classList.remove('flex1');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#creators_note_desc_hidden').hide();
    }
}

/**
 *
 */
function peekSpoilerMode() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#descriptionWrapper').toggle();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#firstMessageWrapper').toggle();
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    document.getElementById('spoiler_free_desc').classList.toggle('flex1');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#creators_note_desc_hidden').toggle();
}

/**
 *
 */
function switchMovingUI() {
    document.querySelectorAll('.drawer-content.maximized').forEach(function (el) {
        // @ts-expect-error TS(2339) FIXME: Property 'click' does not exist on type 'Element'.
        el.querySelector('.inline-drawer-maximize')?.click();
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
            // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
            resetMovablePanels();
            saveSettingsDebounced();
        }
    }
}

/**
 *
 */
function applyNoShadows() {
    document.body.classList.toggle('noShadows', power_user.noShadows);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#noShadowsmode').prop('checked', power_user.noShadows);
    if (power_user.noShadows) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#shadow-width-block').css('opacity', '0.2');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#shadow_width').prop('disabled', true);
    } else {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#shadow-width-block').css('opacity', '1');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#shadow_width').prop('disabled', false);
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
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#avatar_style').val(power_user.avatar_style).prop('selected', true);
}

/**
 *
 */
function applyChatDisplay() {
    // @ts-expect-error TS(2345) FIXME: Argument of type 'number' is not assignable to par... Remove this comment to see the full error message
    if ([null, undefined].includes(power_user.chat_display)) {
        console.debug('applyChatDisplay: saw no chat display type defined');
        power_user.chat_display = chat_styles.DEFAULT;
    }
    console.debug(`poweruser.chat_display ${power_user.chat_display}`);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#chat_display').val(power_user.chat_display).prop('selected', true);

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

    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
    toastr.options.positionClass = power_user.toastr_position;
    fixToastrForDialogs();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#toastr_position').val(power_user.toastr_position);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(`#toastr_position option[value="${power_user.toastr_position}"]`).prop('selected', true);
}

/**
 *
 * @param type
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
function applyChatWidth(type) {
    if (type === 'forced') {
        const r = document.documentElement;
        r.style.setProperty('--sheldWidth', `${power_user.chat_width}vw`);
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#chat_width_slider').val(power_user.chat_width);
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

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#chat_width_slider_counter').val(power_user.chat_width);
}

/**
 *
 * @param type
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
function applyThemeColor(type) {
    if (type === 'main') {
        document.documentElement.style.setProperty('--SmartThemeBodyColor', power_user.main_text_color);
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        const color = power_user.main_text_color.split('(')[1].split(')')[0].split(',');
        // @ts-expect-error TS(2345) FIXME: Argument of type 'string | undefined' is not assig... Remove this comment to see the full error message
        document.documentElement.style.setProperty('--SmartThemeCheckboxBgColorR', color[0]);
        // @ts-expect-error TS(2345) FIXME: Argument of type 'string | undefined' is not assig... Remove this comment to see the full error message
        document.documentElement.style.setProperty('--SmartThemeCheckboxBgColorG', color[1]);
        // @ts-expect-error TS(2345) FIXME: Argument of type 'string | undefined' is not assig... Remove this comment to see the full error message
        document.documentElement.style.setProperty('--SmartThemeCheckboxBgColorB', color[2]);
        // @ts-expect-error TS(2345) FIXME: Argument of type 'string | undefined' is not assig... Remove this comment to see the full error message
        document.documentElement.style.setProperty('--SmartThemeCheckboxBgColorA', color[3]);
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
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        metaThemeColor.setAttribute('content', power_user.blur_tint_color);
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
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#customCSS').val(power_user.custom_css);
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
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#blur_strength_counter').val(power_user.blur_strength);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#blur_strength').val(power_user.blur_strength);
}

/**
 *
 */
function applyShadowWidth() {
    document.documentElement.style.setProperty('--shadowWidth', String(power_user.shadow_width));
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#shadow_width_counter').val(power_user.shadow_width);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#shadow_width').val(power_user.shadow_width);
}

/**
 *
 * @param type
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
function applyFontScale(type) {
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

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#font_scale_counter').val(power_user.font_scale);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#font_scale').val(power_user.font_scale);
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
    const hasUnprocessedMediaMessages = chat.some((message, index) => {
        // Skip messages that are not currently displayed
        if (index < firstDisplayedIndex) {
            return false;
        }
        // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
        const hasMediaAttachments = Array.isArray(message?.extra?.media) && message.extra.media.length > 0;
        // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
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
    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
    toastr.info(
        t`Reload the chat to apply the changes. Click here to reload.`,
        t`Media Style changed`,
        { onclick: () => void reloadCurrentChat() },
    );
}

/**
 *
 * @param name
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
function applyTheme(name) {
    // @ts-expect-error TS(7005) FIXME: Variable 'themes' implicitly has an 'any[]' type.
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
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#bogus_folders').prop('checked', power_user.bogus_folders);
                printCharactersDebounced();
            },
        },
        {
            key: 'zoomed_avatar_magnification',
            action: () => {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#zoomed_avatar_magnification').prop('checked', power_user.zoomed_avatar_magnification);
                printCharactersDebounced();
            },
        },
        {
            key: 'reduced_motion',
            action: () => {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#reduced_motion').prop('checked', power_user.reduced_motion);
                switchReducedMotion();
            },
        },
        {
            key: 'compact_input_area',
            action: () => {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#compact_input_area').prop('checked', power_user.compact_input_area);
                switchCompactInputArea();
            },
        },
        {
            key: 'show_swipe_num_all_messages',
            action: () => {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#show_swipe_num_all_messages').prop('checked', power_user.show_swipe_num_all_messages);
                switchSwipeNumAllMessages();
            },
        },
        {
            key: 'click_to_edit',
            action: () => {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#click_to_edit').prop('checked', power_user.click_to_edit);
            },
        },
        {
            key: 'media_display',
            // @ts-expect-error TS(7006) FIXME: Parameter 'oldValue' implicitly has an 'any' type.
            action: (oldValue, newValue) => {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $('#media_display').val(power_user.media_display);
                if (oldValue !== newValue) {
                    showMediaDisplayReloadPrompt();
                }
            },
        },
    ];

    for (const { key, selector, type, action } of themeProperties) {
        if (theme[key] !== undefined) {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            const oldValue = power_user[key];
            const newValue = theme[key];
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            power_user[key] = newValue;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            if (selector) $(selector).attr('color', newValue);
            if (type) applyThemeColor(type);
            if (action) action(oldValue, newValue);
        } else {
            console.debug(`Empty theme key: ${key}`);
        }
    }

    console.log('theme applied: ' + name);
}

/**
 *
 * @param name
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
async function applyMovingUIPreset(name) {
    await resetMovablePanels('quiet');
    // @ts-expect-error TS(7005) FIXME: Variable 'movingUIPresets' implicitly has an 'any[... Remove this comment to see the full error message
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
// @ts-expect-error TS(7006) FIXME: Parameter 'functionId' implicitly has an 'any' typ... Remove this comment to see the full error message
export function registerDebugFunction(functionId, name, description, func) {
    debug_functions.push({ functionId, name, description, func });
}

/**
 *
 */
async function showDebugMenu() {
    // @ts-expect-error TS(7005) FIXME: Variable 'debug_functions' implicitly has an 'any[... Remove this comment to see the full error message
    const template = await renderTemplateAsync('debug', { functions: debug_functions });
    callGenericPopup(template, POPUP_TYPE.TEXT, '', { wide: true, large: true, allowVerticalScrolling: true });
}

/**
 *
 */
export function applyPowerUserSettings() {
    switchUiMode();
    applyFontScale('forced');
    // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
    applyThemeColor();
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

        // @ts-expect-error TS(2339) FIXME: Property 'mes' does not exist on type 'never'.
        const formattedMessage = messageFormatting(firstMessage.mes, firstMessage.name, firstMessage.is_system, firstMessage.is_user, 0, {}, false);
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
// @ts-expect-error TS(7006) FIXME: Parameter 'settings' implicitly has an 'any' type.
export async function loadPowerUserSettings(settings, data) {
    const defaultStscript = JSON.parse(JSON.stringify(power_user.stscript));
    // Load from settings.json
    if (settings.power_user !== undefined) {
        // Migrate old preference to a new setting
        if (settings.power_user.click_to_edit === undefined && settings.power_user.chat_display === chat_styles.DOCUMENT) {
            settings.power_user.click_to_edit = true;
        }
        if (Object.hasOwn(settings.power_user, 'auto_sort_tags') && !Object.hasOwn(settings.power_user, 'tag_sort_mode')) {
            settings.power_user.tag_sort_mode = settings.power_user.auto_sort_tags ? tag_sort_mode.ALPHABETICAL : tag_sort_mode.MANUAL;
            delete settings.power_user.auto_sort_tags;
        }
        Object.assign(power_user, settings.power_user);
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
                // @ts-expect-error TS(2339) FIXME: Property 'autocomplete_style' does not exist on ty... Remove this comment to see the full error message
                power_user.stscript.autocomplete.style = power_user.stscript.autocomplete_style || defaultStscript.autocomplete.style;
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
        // @ts-expect-error TS(2339) FIXME: Property 'autocomplete_style' does not exist on ty... Remove this comment to see the full error message
        delete power_user.stscript.autocomplete_style;
    }

    if (data.themes !== undefined) {
        themes = data.themes;
    }

    if (data.movingUIPresets !== undefined) {
        movingUIPresets = data.movingUIPresets;
    }


    if (data.context !== undefined) {
        context_presets = data.context;
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

    // @ts-expect-error TS(2339) FIXME: Property 'LEGACY' does not exist on type '{ NONE: ... Remove this comment to see the full error message
    if (power_user.tokenizer === tokenizers.LEGACY) {
        power_user.tokenizer = tokenizers.GPT2;
    }

    // Clean up old/legacy settings
    // @ts-expect-error TS(2339) FIXME: Property 'import_card_tags' does not exist on type... Remove this comment to see the full error message
    if (power_user.import_card_tags !== undefined) {
        // @ts-expect-error TS(2339) FIXME: Property 'import_card_tags' does not exist on type... Remove this comment to see the full error message
        power_user.tag_import_setting = power_user.import_card_tags ? tag_import_setting.ASK : tag_import_setting.NONE;
        // @ts-expect-error TS(2339) FIXME: Property 'import_card_tags' does not exist on type... Remove this comment to see the full error message
        delete power_user.import_card_tags;
    }

    // @ts-expect-error TS(2339) FIXME: Property 'derived' does not exist on type '{ enabl... Remove this comment to see the full error message
    if (power_user?.instruct?.derived === true) {
        power_user.instruct_derived = true;
        // @ts-expect-error TS(2339) FIXME: Property 'derived' does not exist on type '{ enabl... Remove this comment to see the full error message
        delete power_user.instruct.derived;
    }

    // Reset the saved chat template hash
    power_user.chat_template_hash = '';

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#single_line').prop('checked', power_user.single_line);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#relaxed_api_urls').prop('checked', power_user.relaxed_api_urls);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#world_import_dialog').prop('checked', power_user.world_import_dialog);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#enable_auto_select_input').prop('checked', power_user.enable_auto_select_input);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#enable_md_hotkeys').prop('checked', power_user.enable_md_hotkeys);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#trim_spaces').prop('checked', power_user.trim_spaces);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#continue_on_send').prop('checked', power_user.continue_on_send);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#quick_continue').prop('checked', power_user.quick_continue);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#quick_impersonate').prop('checked', power_user.quick_continue);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#mes_continue').css('display', power_user.quick_continue ? '' : 'none');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#mes_impersonate').css('display', power_user.quick_impersonate ? '' : 'none');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#gestures-checkbox').prop('checked', power_user.gestures);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto_swipe').prop('checked', power_user.auto_swipe);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto_swipe_minimum_length').val(power_user.auto_swipe_minimum_length);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto_swipe_blacklist').val(power_user.auto_swipe_blacklist.join(', '));
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto_swipe_blacklist_threshold').val(power_user.auto_swipe_blacklist_threshold);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#custom_stopping_strings').text(power_user.custom_stopping_strings);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#custom_stopping_strings_macro').prop('checked', power_user.custom_stopping_strings_macro);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#fuzzy_search_checkbox').prop('checked', power_user.fuzzy_search);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#persona_show_notifications').prop('checked', power_user.persona_show_notifications);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#persona_allow_multi_connections').prop('checked', power_user.persona_allow_multi_connections);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#persona_auto_lock').prop('checked', power_user.persona_auto_lock);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#encode_tags').prop('checked', power_user.encode_tags);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#experimental_macro_engine').prop('checked', power_user.experimental_macro_engine);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#example_messages_behavior').val(getExampleMessagesBehavior());
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(`#example_messages_behavior option[value="${getExampleMessagesBehavior()}"]`).prop('selected', true);
    document.getElementById('instruct_derived')?.parentElement?.querySelector('i')?.classList.toggle('toggleEnabled', !!power_user.instruct_derived);
    document.getElementById('context_derived')?.parentElement?.querySelector('i')?.classList.toggle('toggleEnabled', !!power_user.context_derived);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#context_size_derived').prop('checked', !!power_user.context_size_derived);

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#console_log_prompts').prop('checked', power_user.console_log_prompts);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#request_token_probabilities').prop('checked', power_user.request_token_probabilities);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#show_group_chat_queue').prop('checked', power_user.show_group_chat_queue);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto_fix_generated_markdown').prop('checked', power_user.auto_fix_generated_markdown);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto_scroll_chat_to_bottom').prop('checked', power_user.auto_scroll_chat_to_bottom);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bogus_folders').prop('checked', power_user.bogus_folders);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#zoomed_avatar_magnification').prop('checked', power_user.zoomed_avatar_magnification);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(`#tokenizer option[value="${power_user.tokenizer}"]`).prop('selected', true);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(`#send_on_enter option[value=${power_user.send_on_enter}]`).prop('selected', true);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#confirm_message_delete').prop('checked', power_user.confirm_message_delete !== undefined ? !!power_user.confirm_message_delete : true);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#spoiler_free_mode').prop('checked', power_user.spoiler_free_mode);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#collapse-newlines-checkbox').prop('checked', power_user.collapse_newlines);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#always-force-name2-checkbox').prop('checked', power_user.always_force_name2);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#trim_sentences_checkbox').prop('checked', power_user.trim_sentences);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#disable_group_trimming').prop('checked', power_user.disable_group_trimming);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#markdown_escape_strings').val(power_user.markdown_escape_strings);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#fast_ui_mode').prop('checked', power_user.fast_ui_mode);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#waifuMode').prop('checked', power_user.waifuMode);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#movingUImode').prop('checked', power_user.movingUI);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#noShadowsmode').prop('checked', power_user.noShadows);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#start_reply_with').text(power_user.user_prompt_bias);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#chat-show-reply-prefix-checkbox').prop('checked', power_user.show_user_prompt_bias);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto_continue_enabled').prop('checked', power_user.auto_continue.enabled);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto_continue_allow_chat_completions').prop('checked', power_user.auto_continue.allow_chat_completions);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto_continue_target_length').val(power_user.auto_continue.target_length);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#play_message_sound').prop('checked', power_user.play_message_sound);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#play_sound_unfocused').prop('checked', power_user.play_sound_unfocused);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#never_resize_avatars').prop('checked', power_user.never_resize_avatars);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#show_card_avatar_urls').prop('checked', power_user.show_card_avatar_urls);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto_save_msg_edits').prop('checked', power_user.auto_save_msg_edits);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#allow_name1_display').prop('checked', power_user.allow_name1_display);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#allow_name2_display').prop('checked', power_user.allow_name2_display);
    //$("#removeXML").prop("checked", power_user.removeXML);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#hotswapEnabled').prop('checked', power_user.hotswap_enabled);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#messageTimerEnabled').prop('checked', power_user.timer_enabled);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#messageTimestampsEnabled').prop('checked', power_user.timestamps_enabled);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#messageModelIconEnabled').prop('checked', power_user.timestamp_model_icon);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#mesIDDisplayEnabled').prop('checked', power_user.mesIDDisplay_enabled);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#hideChatAvatarsEnabled').prop('checked', power_user.hideChatAvatars_enabled);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#prefer_character_prompt').prop('checked', power_user.prefer_character_prompt);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#prefer_character_jailbreak').prop('checked', power_user.prefer_character_jailbreak);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#enableZenSliders').prop('checked', power_user.enableZenSliders).trigger('input');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#enableLabMode').prop('checked', power_user.enableLabMode).trigger('input', { fromInit: true });
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(`input[name="avatar_style"][value="${power_user.avatar_style}"]`).prop('checked', true);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(`#chat_display option[value=${power_user.chat_display}]`).prop('selected', true).trigger('change');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(`#toastr_position option[value=${power_user.toastr_position}]`).prop('selected', true).trigger('change');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#chat_width_slider').val(power_user.chat_width);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#token_padding').val(power_user.token_padding);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#aux_field').val(power_user.aux_field);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#tag_import_setting').val(power_user.tag_import_setting);

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_autocomplete_state').val(power_user.stscript.autocomplete.state).trigger('input');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_autocomplete_autoHide').prop('checked', power_user.stscript.autocomplete.autoHide ?? false).trigger('input');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_autocomplete_showInAllMacroFields').prop('checked', power_user.stscript.autocomplete.showInAllMacroFields ?? false).trigger('input');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_matching').val(power_user.stscript.matching ?? 'fuzzy');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_autocomplete_style').val(power_user.stscript.autocomplete.style ?? 'theme');
    document.body.setAttribute('data-stscript-style', power_user.stscript.autocomplete.style);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_autocomplete_select').val(power_user.stscript.autocomplete.select ?? (AUTOCOMPLETE_SELECT_KEY.TAB + AUTOCOMPLETE_SELECT_KEY.ENTER));
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_parser_flag_strict_escaping').prop('checked', power_user.stscript.parser.flags[PARSER_FLAG.STRICT_ESCAPING] ?? false);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_parser_flag_replace_getvar').prop('checked', power_user.stscript.parser.flags[PARSER_FLAG.REPLACE_GETVAR] ?? false);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_autocomplete_font_scale').val(power_user.stscript.autocomplete.font.scale ?? defaultStscript.autocomplete.font.scale);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_autocomplete_font_scale_counter').val(power_user.stscript.autocomplete.font.scale ?? defaultStscript.autocomplete.font.scale);
    // @ts-expect-error TS(2345) FIXME: Argument of type 'number' is not assignable to par... Remove this comment to see the full error message
    document.body.style.setProperty('--ac-font-scale', power_user.stscript.autocomplete.font.scale ?? defaultStscript.autocomplete.font.scale.toString());
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_autocomplete_width_left').val(power_user.stscript.autocomplete.width.left ?? AUTOCOMPLETE_WIDTH.CHAT);
    document.querySelector('#stscript_autocomplete_width_left')?.dispatchEvent(new Event('input', { bubbles: true }));
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_autocomplete_width_right').val(power_user.stscript.autocomplete.width.right ?? AUTOCOMPLETE_WIDTH.CHAT);
    document.querySelector('#stscript_autocomplete_width_right')?.dispatchEvent(new Event('input', { bubbles: true }));

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#restore_user_input').prop('checked', power_user.restore_user_input);

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#chat_truncation').val(power_user.chat_truncation);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#chat_truncation_counter').val(power_user.chat_truncation);

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#streaming_fps').val(power_user.streaming_fps);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#streaming_fps_counter').val(power_user.streaming_fps);

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#smooth_streaming').prop('checked', power_user.smooth_streaming);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#smooth_streaming_no_think').prop('checked', power_user.smooth_streaming_no_think);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#smooth_streaming_speed').val(power_user.smooth_streaming_speed);

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stream_fade_in').prop('checked', power_user.stream_fade_in);

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#font_scale').val(power_user.font_scale);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#font_scale_counter').val(power_user.font_scale);

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#blur_strength').val(power_user.blur_strength);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#blur_strength_counter').val(power_user.blur_strength);

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#shadow_width').val(power_user.shadow_width);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#shadow_width_counter').val(power_user.shadow_width);

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#main-text-color-picker').attr('color', power_user.main_text_color);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#italics-color-picker').attr('color', power_user.italics_text_color);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#underline-color-picker').attr('color', power_user.underline_text_color);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#quote-color-picker').attr('color', power_user.quote_text_color);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#blur-tint-color-picker').attr('color', power_user.blur_tint_color);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#chat-tint-color-picker').attr('color', power_user.chat_tint_color);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#user-mes-blur-tint-color-picker').attr('color', power_user.user_mes_blur_tint_color);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bot-mes-blur-tint-color-picker').attr('color', power_user.bot_mes_blur_tint_color);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#shadow-color-picker').attr('color', power_user.shadow_color);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#border-color-picker').attr('color', power_user.border_color);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#reduced_motion').prop('checked', power_user.reduced_motion);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto-connect-checkbox').prop('checked', power_user.auto_connect);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto-load-chat-checkbox').prop('checked', power_user.auto_load_chat);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#forbid_external_media').prop('checked', power_user.forbid_external_media);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#pin_styles').prop('checked', power_user.pin_styles);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#click_to_edit').prop('checked', power_user.click_to_edit);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#media_display').val(power_user.media_display);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#image_overswipe').val(power_user.image_overswipe);

    // @ts-expect-error TS(7005) FIXME: Variable 'themes' implicitly has an 'any[]' type.
    for (const theme of themes) {
        const option = document.createElement('option');
        option.value = theme.name;
        option.innerText = theme.name;
        option.selected = theme.name == power_user.theme;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#themes').append(option);
    }

    // @ts-expect-error TS(7005) FIXME: Variable 'movingUIPresets' implicitly has an 'any[... Remove this comment to see the full error message
    for (const movingUIPreset of movingUIPresets) {
        const option = document.createElement('option');
        option.value = movingUIPreset.name;
        option.innerText = movingUIPreset.name;
        option.selected = movingUIPreset.name == power_user.movingUIPreset;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#movingUIPresets').append(option);
    }


    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(`#character_sort_order option[data-order="${power_user.sort_order}"][data-field="${power_user.sort_field}"]`).prop('selected', true);
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
}

/**
 *
 */
function toggleMDHotkeyIconDisplay() {
    if (power_user.enable_md_hotkeys) {
        document.querySelectorAll('.mdhotkey_location').forEach(function (el) {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            el.parentElement.insertAdjacentHTML('beforeend', '<i class="fa-brands fa-markdown mdhotkey_icon"></i>');
        });
    } else {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('.mdhotkey_icon').remove();
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
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            const elmntState = power_user.movingUIState[elmntName];
            try {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                const elmnt = $('#' + $.escapeSelector(elmntName));
                if (elmnt.length) {
                    console.debug(`loading state for ${elmntName}`);
                    for (const [prop, value] of Object.entries(elmntState)) {
                        elmnt[0].style.setProperty(prop, value, 'important');
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
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#max_context_unlocked').prop('checked', power_user.max_context_unlocked);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#max_context_unlocked').on('change', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.max_context_unlocked = !!$(this).prop('checked');
        switchMaxContextSize();
        saveSettingsDebounced();
    });
    switchMaxContextSize();
}

/**
 *
 */
function switchMaxContextSize() {
    const elements = [
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#max_context'),
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#max_context_counter'),
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#rep_pen_range'),
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#rep_pen_range_counter'),
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#rep_pen_range_textgenerationwebui'),
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#rep_pen_range_counter_textgenerationwebui'),
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#dry_penalty_last_n_textgenerationwebui'),
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#dry_penalty_last_n_counter_textgenerationwebui'),
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#rep_pen_decay_textgenerationwebui'),
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#rep_pen_decay_counter_textgenerationwebui'),
    ];
    const maxValue = power_user.max_context_unlocked ? MAX_CONTEXT_UNLOCKED : MAX_CONTEXT_DEFAULT;
    const minValue = power_user.max_context_unlocked ? maxContextMin : maxContextMin;
    const steps = power_user.max_context_unlocked ? unlockedMaxContextStep : maxContextStep;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#rep_pen_range_textgenerationwebui_zenslider').remove(); //unsure why, but this is necessary.
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#dry_penalty_last_n_textgenerationwebui_zenslider').remove();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#rep_pen_decay_textgenerationwebui_zenslider').remove();
    for (const element of elements) {
        const id = element.attr('id');
        element.attr('max', maxValue);

        if (typeof id === 'string' && id?.indexOf('max_context') !== -1) {
            element.attr('min', minValue);
            element.attr('step', steps); //only change setps for max context, because rep pen range needs step of 1 due to important values of -1 and 0
        }
        const value = Number(element.val());

        if (value >= maxValue) {
            element.val(maxValue).trigger('input');
        }
    }

    const maxAmountGen = power_user.max_context_unlocked ? MAX_RESPONSE_UNLOCKED : MAX_RESPONSE_DEFAULT;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#amount_gen').attr('max', maxAmountGen);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#amount_gen_counter').attr('max', maxAmountGen);

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    if (Number($('#amount_gen').val()) >= maxAmountGen) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#amount_gen').val(maxAmountGen).trigger('input');
    }

    if (power_user.enableZenSliders) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#max_context_zenslider').remove();
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        CreateZenSliders($('#max_context'));
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#rep_pen_range_textgenerationwebui_zenslider').remove();
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        CreateZenSliders($('#rep_pen_range_textgenerationwebui'));
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#dry_penalty_last_n_textgenerationwebui_zenslider').remove();
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        CreateZenSliders($('#dry_penalty_last_n_textgenerationwebui'));
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#rep_pen_decay_textgenerationwebui_zenslider').remove();
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        CreateZenSliders($('#rep_pen_decay_textgenerationwebui'));
    }
}

// Fetch a compiled object of all preset settings
/**
 *
 */
export function getContextSettings() {
    const compiledSettings = {};

    contextControls.forEach((control) => {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        let value = control.isGlobalSetting ? power_user[control.property] : power_user.context[control.property];

        // Force to a boolean if the setting is a checkbox
        if (control.isCheckbox) {
            value = !!value;
        }

        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
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
    // @ts-expect-error TS(7006) FIXME: Parameter 'contextSettings' implicitly has an 'any... Remove this comment to see the full error message
    function autoFixStoryString(contextSettings) {
        // Already migrated, no need to fix
        if (!contextSettings || Object.hasOwn(contextSettings, 'story_string_position')) {
            return;
        }

        let storyString = contextSettings.story_string || '';

        /**
         * @param {string} field Missing field name
         * @param {'start'|'end'} position Position of auto-fix
         */
        // @ts-expect-error TS(7006) FIXME: Parameter 'field' implicitly has an 'any' type.
        function autoFixMissingField(field, position) {
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

        contextSettings.story_string = storyString;
    }

    // Migrate story string to add missing fields
    autoFixStoryString(power_user.context);

    contextControls.forEach(control => {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const $element = $(`#${control.id}`);

        if (control.isGlobalSetting) {
            return;
        }

        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        if (control.defaultValue !== undefined && power_user.context[control.property] === undefined) {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            power_user.context[control.property] = control.defaultValue;
        }

        if (control.isCheckbox) {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            $element.prop('checked', power_user.context[control.property]);
        } else {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            $element.val(power_user.context[control.property]);
        }
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        console.debug(`Setting ${$element.prop('id')} to ${power_user.context[control.property]}`);

        // If the setting already exists, no need to duplicate it
        // TODO: Maybe check the power_user object for the setting instead of a flag?
        $element.on('input', async function () {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            let value = control.isCheckbox ? !!$(this).prop('checked') : $(this).val();
            if (typeof control.defaultValue === 'number') {
                value = Number(value);
            }
            if (control.isGlobalSetting) {
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                power_user[control.property] = value;
            } else {
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                power_user.context[control.property] = value;
            }
            console.debug(`Setting ${$element.prop('id')} to ${value}`);
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            if (!CSS.supports('field-sizing', 'content') && $(this).is('textarea')) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                await resetScrollHeight($(this));
            }
            saveSettingsDebounced();
        });

        if (control.trigger) {
            $element.trigger('input');
        }
    });

    context_presets.forEach((preset) => {
        // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
        const name = preset.name;
        const option = document.createElement('option');
        option.value = name;
        option.innerText = name;
        option.selected = name === power_user.context.preset;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#context_presets').append(option);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#context_presets').on('change', function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const name = String(this.options[this.selectedIndex]?.textContent || '');
        // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
        const preset = context_presets.find(x => x.name === name);

        if (!preset) {
            return;
        }

        // Migrate story string to add missing fields
        autoFixStoryString(preset);

        power_user.context.preset = name;

        contextControls.forEach(control => {
            const presetValue = preset[control.property] ?? control.defaultValue;

            if (presetValue !== undefined) {
                if (control.isGlobalSetting) {
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    power_user[control.property] = presetValue;
                } else {
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    power_user.context[control.property] = presetValue;
                }

                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                const $element = $(`#${control.id}`);

                if (control.isCheckbox) {
                    $element
                        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                        .prop('checked', control.isGlobalSetting ? power_user[control.property] : power_user.context[control.property])
                        .trigger('input');
                } else {
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    $element.val(control.isGlobalSetting ? power_user[control.property] : power_user.context[control.property]);
                    $element.trigger('input');
                }
            }
        });

        if (power_user.instruct.bind_to_context) {
            // Select matching instruct preset
            for (const instruct_preset of instruct_presets) {
                // If instruct preset matches the context template
                // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
                if (instruct_preset.name === name) {
                    // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
                    selectInstructPreset(instruct_preset.name, { isAuto: true });
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
// @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
export function performFuzzySearch(type, data, keys, searchValue, fuzzySearchCaches = null) {
    // Check cache if provided
    if (fuzzySearchCaches) {
        const cache = fuzzySearchCaches[type];
        // @ts-expect-error TS(2339) FIXME: Property 'resultMap' does not exist on type 'never... Remove this comment to see the full error message
        if (cache?.resultMap.has(searchValue)) {
            // @ts-expect-error TS(2339) FIXME: Property 'resultMap' does not exist on type 'never... Remove this comment to see the full error message
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
        // @ts-expect-error TS(2339) FIXME: Property 'resultMap' does not exist on type 'never... Remove this comment to see the full error message
        fuzzySearchCaches[type].resultMap.set(searchValue, results);
    }
    return results;
}

/**
 * Fuzzy search characters by a search term
 * @param {string} searchValue - The search term
 * @param {Object.<string, { resultMap: Map<string, any> }>} [fuzzySearchCaches] - Optional fuzzy search caches
 * @returns {import('fuse.js').FuseResult<any>[]} Results as items with their score
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'searchValue' implicitly has an 'any' ty... Remove this comment to see the full error message
export function fuzzySearchCharacters(searchValue, fuzzySearchCaches = null) {
    const keys = [
        { name: 'data.name', weight: 20 },
        // @ts-expect-error TS(7006) FIXME: Parameter 'character' implicitly has an 'any' type... Remove this comment to see the full error message
        { name: '#tags', weight: 10, getFn: (character) => getTagsList(character.avatar).map(x => x.name).join('||') },
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

    return performFuzzySearch(fuzzySearchCategories.characters, characters, keys, searchValue, fuzzySearchCaches);
}

/**
 * Fuzzy search world info entries by a search term
 * @param {*[]} data - WI items data array
 * @param {string} searchValue - The search term
 * @param {Object.<string, { resultMap: Map<string, any> }>} [fuzzySearchCaches] - Optional fuzzy search caches
 * @returns {import('fuse.js').FuseResult<any>[]} Results as items with their score
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export function fuzzySearchWorldInfo(data, searchValue, fuzzySearchCaches = null) {
    const keys = [
        { name: 'key', weight: 20 },
        { name: 'group', weight: 15 },
        { name: 'comment', weight: 10 },
        { name: 'keysecondary', weight: 10 },
        { name: 'content', weight: 3 },
        { name: 'uid', weight: 1 },
        { name: 'automationId', weight: 1 },
    ];

    return performFuzzySearch(fuzzySearchCategories.worldInfo, data, keys, searchValue, fuzzySearchCaches);
}

/**
 * Fuzzy search persona entries by a search term
 * @param {*[]} data - persona data array
 * @param {string} searchValue - The search term
 * @param {Object.<string, { resultMap: Map<string, any> }>} [fuzzySearchCaches] - Optional fuzzy search caches
 * @returns {import('fuse.js').FuseResult<any>[]} Results as items with their score
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export function fuzzySearchPersonas(data, searchValue, fuzzySearchCaches = null) {
    // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
    const mappedData = data.map(x => ({
        key: x,
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        name: power_user.personas[x] ?? '',
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        description: power_user.persona_descriptions[x]?.description ?? '',
    }));

    const keys = [
        { name: 'name', weight: 20 },
        { name: 'description', weight: 3 },
    ];

    return performFuzzySearch(fuzzySearchCategories.personas, mappedData, keys, searchValue, fuzzySearchCaches);
}

/**
 * Fuzzy search tags by a search term
 * @param {string} searchValue - The search term
 * @param {Object.<string, { resultMap: Map<string, any> }>} [fuzzySearchCaches] - Optional fuzzy search caches
 * @returns {import('fuse.js').FuseResult<any>[]} Results as items with their score
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'searchValue' implicitly has an 'any' ty... Remove this comment to see the full error message
export function fuzzySearchTags(searchValue, fuzzySearchCaches = null) {
    const keys = [
        { name: 'name', weight: 1 },
    ];

    // @ts-expect-error TS(7005) FIXME: Variable 'tags' implicitly has an 'any[]' type.
    return performFuzzySearch(fuzzySearchCategories.tags, tags, keys, searchValue, fuzzySearchCaches);
}

/**
 * Fuzzy search groups by a search term
 * @param {string} searchValue - The search term
 * @param {Object.<string, { resultMap: Map<string, any> }>} [fuzzySearchCaches] - Optional fuzzy search caches
 * @returns {import('fuse.js').FuseResult<any>[]} Results as items with their score
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'searchValue' implicitly has an 'any' ty... Remove this comment to see the full error message
export function fuzzySearchGroups(searchValue, fuzzySearchCaches = null) {
    const keys = [
        { name: 'name', weight: 20 },
        { name: 'members', weight: 15 },
        // @ts-expect-error TS(7006) FIXME: Parameter 'group' implicitly has an 'any' type.
        { name: '#tags', weight: 10, getFn: (group) => getTagsList(group.id).map(x => x.name).join('||') },
        { name: 'id', weight: 1 },
    ];

    return performFuzzySearch(fuzzySearchCategories.groups, groups, keys, searchValue, fuzzySearchCaches);
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
// @ts-expect-error TS(7006) FIXME: Parameter 'params' implicitly has an 'any' type.
export function renderStoryString(params, { customStoryString = null, customInstructSettings = null, customContextSettings = null } = {}) {
    try {
        const instructSettings = structuredClone(customInstructSettings ?? power_user.instruct);
        const contextSettings = structuredClone(customContextSettings ?? power_user.context);
        const storyString = customStoryString ?? contextSettings.story_string;
        const storyStringPosition = contextSettings.story_string_position ?? extension_prompt_types.IN_PROMPT;

        // Validate and log possible warnings/errors
        validateStoryString(storyString, params);

        // compile the story string template into a function, with no HTML escaping
        const compiledTemplate = Handlebars.compile(storyString, { noEscape: true });

        // render the story string template with the given params
        let output = compiledTemplate(params);

        // substitute {{macro}} params that are not defined in the story string
        // @ts-expect-error TS(2554) FIXME: Expected 1-2 arguments, but got 3.
        output = substituteParams(output, params.user, params.char);

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
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error('Check the story string template for validity', 'Error rendering story string');
        console.error('Error rendering story string', e);
        throw e; // rethrow the error
    }
}

/**
 * Validate the story string for possible warnings or issues
 * @param {string} storyString - The story string
 * @param {object} params - The story string parameters
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'storyString' implicitly has an 'any' ty... Remove this comment to see the full error message
function validateStoryString(storyString, params) {
    /** @type {{hashCache: {[hash: string]: {fieldsWarned: {[key: string]: boolean}}}}} */
    // @ts-expect-error TS(2345) FIXME: Argument of type 'string | null' is not assignable... Remove this comment to see the full error message
    const cache = JSON.parse(accountStorage.getItem(storage_keys.storyStringValidationCache)) ?? { hashCache: {} };

    const hash = getStringHash(storyString);

    // Initialize the cache for the current hash if it doesn't exist
    if (!cache.hashCache[hash]) {
        cache.hashCache[hash] = { fieldsWarned: {} };
    }

    const currentCache = cache.hashCache[hash];
    // @ts-expect-error TS(7034) FIXME: Variable 'fieldsToWarn' implicitly has type 'any[]... Remove this comment to see the full error message
    const fieldsToWarn = [];

    /**
     *
     * @param field
     * @param fallbackLegacyField
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'field' implicitly has an 'any' type.
    function validateMissingField(field, fallbackLegacyField = null) {
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
    // @ts-expect-error TS(2345) FIXME: Argument of type '"loreBefore"' is not assignable ... Remove this comment to see the full error message
    validateMissingField('wiBefore', 'loreBefore');
    // @ts-expect-error TS(2345) FIXME: Argument of type '"loreAfter"' is not assignable t... Remove this comment to see the full error message
    validateMissingField('wiAfter', 'loreAfter');

    if (fieldsToWarn.length > 0) {
        // @ts-expect-error TS(7005) FIXME: Variable 'fieldsToWarn' implicitly has an 'any[]' ... Remove this comment to see the full error message
        const fieldsList = fieldsToWarn.map(field => `{{${field}}}`).join(', ');
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning(`The story string does not contain the following fields, but they would contain content: ${fieldsList}`, 'Story String Validation');
    }

    accountStorage.setItem(storage_keys.storyStringValidationCache, JSON.stringify(cache));
}


// @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
const sortFunc = (a, b) => power_user.sort_order == 'asc' ? compareFunc(a, b) : compareFunc(b, a);
// @ts-expect-error TS(7006) FIXME: Parameter 'first' implicitly has an 'any' type.
const compareFunc = (first, second) => {
    const a = first[power_user.sort_field];
    const b = second[power_user.sort_field];

    if (power_user.sort_field === 'create_date') {
        return sortMoments(timestampToMoment(b), timestampToMoment(a));
    }

    switch (power_user.sort_rule) {
        // @ts-expect-error TS(2678) FIXME: Type '"boolean"' is not comparable to type 'null'.
        case 'boolean':
            if (a === true || a === 'true') return 1;  // Prioritize 'true' or true
            if (b === true || b === 'true') return -1; // Prioritize 'true' or true
            if (a && !b) return -1;        // Move truthy values to the end
            if (!a && b) return 1;         // Move falsy values to the beginning
            if (a === b) return 0;         // Sort equal values normally
            return a < b ? -1 : 1;         // Sort non-boolean values normally
        default:
            return typeof a == 'string'
                ? a.localeCompare(b)
                : a - b;
    }
};

/**
 * Sorts an array of entities based on the current sort settings
 * @param {any[]} entities An array of objects with an `item` property
 * @param {boolean} forceSearch Whether to force search sorting
 * @param {import('./filters.js').FilterHelper} [filterHelper] Filter helper to use
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'entities' implicitly has an 'any' type.
export function sortEntitiesList(entities, forceSearch, filterHelper = null) {
    // @ts-expect-error TS(2322) FIXME: Type 'FilterHelper' is not assignable to type 'nul... Remove this comment to see the full error message
    filterHelper = filterHelper ?? entitiesFilter;
    if (power_user.sort_field == undefined || entities.length === 0) {
        return;
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const isSearch = forceSearch || $('#character_sort_order option[data-field="search"]').is(':selected');

    if (!isSearch && power_user.sort_order === 'random') {
        shuffle(entities);
        return;
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
    entities.sort((a, b) => {
        // Sort tags/folders will always be at the top. Their original sorting will be kept, to respect manual tag sorting.
        if (a.type === 'tag' || b.type === 'tag') {
            // The one that is a tag will be at the top
            return (a.type === 'tag' ? -1 : 1) - (b.type === 'tag' ? -1 : 1);
        }

        // If we have search sorting, we take scores and use those
        if (isSearch) {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            const aScore = filterHelper.getScore(FILTER_TYPES.SEARCH, `${a.type}.${a.id}`);
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            const bScore = filterHelper.getScore(FILTER_TYPES.SEARCH, `${b.type}.${b.id}`);
            return (aScore - bScore);
        }

        return sortFunc(a.item, b.item);
    });
}

/**
 * Updates the current UI theme file.
 */
async function updateTheme() {
    // @ts-expect-error TS(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
    await saveTheme(power_user.theme);
    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
    toastr.success('Theme saved.');
}

/**
 *
 */
async function deleteTheme() {
    const themeName = power_user.theme;

    if (!themeName) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info('No theme selected.');
        return;
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const template = $(await renderTemplateAsync('themeDelete', { themeName }));
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
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error('Failed to delete theme. Check the console for more information.');
        return;
    }

    // @ts-expect-error TS(7005) FIXME: Variable 'themes' implicitly has an 'any[]' type.
    const themeIndex = themes.findIndex(x => x.name == themeName);

    if (themeIndex !== -1) {
        // @ts-expect-error TS(7005) FIXME: Variable 'themes' implicitly has an 'any[]' type.
        themes.splice(themeIndex, 1);
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $(`#themes option[value="${themeName}"]`).remove();
        // @ts-expect-error TS(7005) FIXME: Variable 'themes' implicitly has an 'any[]' type.
        power_user.theme = themes[0]?.name;
        saveSettingsDebounced();
        if (power_user.theme) {
            applyTheme(power_user.theme);
        }
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success('Theme deleted.');
    }
}

/**
 * Exports the current theme to a file.
 */
async function exportTheme() {
    // @ts-expect-error TS(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
    const themeFile = await saveTheme(power_user.theme);
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    const fileName = `${themeFile.name}.json`;
    download(JSON.stringify(themeFile, null, 4), fileName, 'application/json');
}

/**
 * Imports a theme from a file.
 * @param {File} file File to import.
 * @returns {Promise<void>} A promise that resolves when the theme is imported.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'file' implicitly has an 'any' type.
async function importTheme(file) {
    if (!file) {
        return;
    }

    const fileText = await getFileText(file);
    // @ts-expect-error TS(2345) FIXME: Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
    const parsed = JSON.parse(fileText);

    if (!parsed.name) {
        throw new Error('Missing name');
    }

    // @ts-expect-error TS(7005) FIXME: Variable 'themes' implicitly has an 'any[]' type.
    if (themes.some(t => t.name === parsed.name)) {
        throw new Error('Theme with that name already exists');
    }

    if (typeof parsed.custom_css === 'string' && parsed.custom_css.includes('@import')) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const template = $(await renderTemplateAsync('themeImportWarning'));
        const confirm = await callGenericPopup(template, POPUP_TYPE.CONFIRM);
        if (!confirm) {
            throw new Error('Theme contains @import lines');
        }
    }

    themes.push(parsed);
    // @ts-expect-error TS(2345) FIXME: Argument of type '{ name: any; blur_strength: numb... Remove this comment to see the full error message
    await saveTheme(parsed.name, getNewTheme(parsed));
    const option = document.createElement('option');
    option.selected = false;
    option.value = parsed.name;
    option.innerText = parsed.name;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#themes').append(option);
    saveSettingsDebounced();
    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
    toastr.success(parsed.name, 'Theme imported');
}

/**
 * Saves the current theme to the server.
 * @param {string|undefined} name Theme name. If undefined, a popup will be shown to enter a name.
 * @param {object|undefined} theme Theme object. If undefined, the current theme will be saved.
 * @returns {Promise<object>} A promise that resolves when the theme is saved.
 */
async function saveTheme(name = undefined, theme = undefined) {
    if (typeof name !== 'string') {
        const newName = await callGenericPopup('Enter a theme preset name:', POPUP_TYPE.INPUT, power_user.theme);

        if (!newName) {
            return;
        }

        name = await getSanitizedFilename(String(newName));
    }

    if (typeof theme !== 'object') {
        // @ts-expect-error TS(2322) FIXME: Type '{ name: any; blur_strength: number; main_tex... Remove this comment to see the full error message
        theme = getThemeObject(name);
    }

    const response = await fetch('/api/themes/save', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(theme),
    });

    if (!response.ok) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error('Check the server connection and reload the page to prevent data loss.', 'Theme could not be saved');
        console.error('Theme could not be saved', response);
        throw new Error('Theme could not be saved');
    }

    // @ts-expect-error TS(7005) FIXME: Variable 'themes' implicitly has an 'any[]' type.
    const themeIndex = themes.findIndex(x => x.name == name);

    if (themeIndex == -1) {
        themes.push(theme);
        const option = document.createElement('option');
        option.selected = true;
        // @ts-expect-error TS(2322) FIXME: Type 'undefined' is not assignable to type 'string... Remove this comment to see the full error message
        option.value = name;
        // @ts-expect-error TS(2322) FIXME: Type 'undefined' is not assignable to type 'string... Remove this comment to see the full error message
        option.innerText = name;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#themes').append(option);
    } else {
        themes[themeIndex] = theme;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $(`#themes option[value="${name}"]`).prop('selected', true);
    }

    // @ts-expect-error TS(2322) FIXME: Type 'undefined' is not assignable to type 'string... Remove this comment to see the full error message
    power_user.theme = name;
    saveSettingsDebounced();

    return theme;
}

/**
 * Gets a snapshot of the current theme settings.
 * @param {string} name Name of the theme
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export function getThemeObject(name) {
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
// @ts-expect-error TS(7006) FIXME: Parameter 'parsed' implicitly has an 'any' type.
function getNewTheme(parsed) {
    const theme = getThemeObject(parsed.name);
    for (const key in parsed) {
        if (Object.hasOwn(theme, key)) {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            theme[key] = parsed[key];
        }
    }
    return theme;
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
        // @ts-expect-error TS(7005) FIXME: Variable 'movingUIPresets' implicitly has an 'any[... Remove this comment to see the full error message
        const movingUIPresetIndex = movingUIPresets.findIndex(x => x.name == name);

        if (movingUIPresetIndex == -1) {
            movingUIPresets.push(movingUIPreset);
            const option = document.createElement('option');
            option.selected = true;
            option.value = name;
            option.innerText = name;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#movingUIPresets').append(option);
        } else {
            movingUIPresets[movingUIPresetIndex] = movingUIPreset;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(`#movingUIPresets option[value="${name}"]`).prop('selected', true);
        }

        power_user.movingUIPreset = name;
        saveSettingsDebounced();
    } else {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error('Failed to save MovingUI state.');
        console.error('MovingUI could not be saved', response);
    }
}

/**
 * Resets the movable styles of the given element to their unset values.
 * @param {string} id Element ID
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'id' implicitly has an 'any' type.
export function resetMovableStyles(id) {
    const panelStyles = ['top', 'left', 'right', 'bottom', 'height', 'width', 'margin'];

    const panel = document.getElementById(id);

    if (panel) {
        panelStyles.forEach((style) => {
            // @ts-expect-error TS(7015) FIXME: Element implicitly has an 'any' type because index... Remove this comment to see the full error message
            panel.style[style] = '';
        });
    }
}

/**
 *
 * @param type
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
async function resetMovablePanels(type) {
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
    const draggedElements = Array.from(document.querySelectorAll('[data-dragged]'));
    // @ts-expect-error TS(2769) FIXME: No overload matches this call.
    const allDraggable = panelIds.map(id => document.getElementById(id)).concat(draggedElements).filter(onlyUnique);

    const panelStyles = ['top', 'left', 'right', 'bottom', 'height', 'width', 'margin'];
    allDraggable.forEach((panel) => {
        if (panel) {
            panel.classList.add('resizing');
            panelStyles.forEach((style) => {
                // @ts-expect-error TS(7015) FIXME: Element implicitly has an 'any' type because index... Remove this comment to see the full error message
                panel.style[style] = '';
            });
        }
    });

    /**
     * @type {HTMLElement[]} Zoomed avatars that are currently being resized
     */
    const zoomedAvatars = Array.from(document.querySelectorAll('.zoomed_avatar'));
    if (zoomedAvatars.length > 0) {
        zoomedAvatars.forEach((avatar) => {
            avatar.classList.add('resizing');
            panelStyles.forEach((style) => {
                // @ts-expect-error TS(2339) FIXME: Property 'style' does not exist on type 'Element'.
                avatar.style[style] = '';
            });
        });
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('[data-dragged="true"]').removeAttr('data-dragged');
    await delay(50);

    power_user.movingUIState = {};

    //if user manually resets panels, deselect the current preset
    if (type !== 'quiet' && type !== 'resize') {
        power_user.movingUIPreset = 'Default';
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#movingUIPresets option[value="Default"]').prop('selected', true);
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
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.warning('Panel positions reset due to zoom/resize');
            //if happening due to manual button press
        } else {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.success('Panel positions reset');
        }
    });
}

/**
 * Finds the ID of the tag with the given name.
 * @param {string} name
 * @returns {string} The ID of the tag with the given name.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
function findTagIdByName(name) {
    const matchTypes = [
        // @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
        (a, b) => a === b,
        // @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
        (a, b) => a.startsWith(b),
        // @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
        (a, b) => a.includes(b),
    ];

    // Only get tags that contain at least one record in the tag_map
    const liveTagIds = new Set(Object.values(tag_map).flat());
    // @ts-expect-error TS(7005) FIXME: Variable 'tags' implicitly has an 'any[]' type.
    const liveTags = tags.filter(x => liveTagIds.has(x.id));

    const exactNameMatchIndex = liveTags.map(x => x.name.toLowerCase()).indexOf(name.toLowerCase());

    if (exactNameMatchIndex !== -1) {
        return liveTags[exactNameMatchIndex].id;
    }

    for (const matchType of matchTypes) {
        const index = liveTags.findIndex(x => matchType(x.name.toLowerCase(), name.toLowerCase()));
        if (index !== -1) {
            return liveTags[index].id;
        }
    }
}

/**
 *
 * @param _
 * @param tagName
 */
// @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
async function doRandomChat(_, tagName) {
    /**
     * Gets the ID of a random character.
     * @returns {string} The order index of the randomly selected character.
     */
    function getRandomCharacterId() {
        if (!tagName) {
            return Math.floor(Math.random() * characters.length).toString();
        }

        const tagId = findTagIdByName(tagName);
        const taggedCharacters = Object.entries(tag_map)
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            .filter(x => x[1].includes(tagId)) // Get only records that include the tag
            .map(x => x[0]) // Map the character avatar
            .filter(x => characters.find(y => y.avatar === x)); // Filter out characters that don't exist
        const randomCharacter = taggedCharacters[Math.floor(Math.random() * taggedCharacters.length)];
        const randomIndex = characters.findIndex(x => x.avatar === randomCharacter);
        if (randomIndex === -1) {
            return;
        }
        return randomIndex.toString();
    }

    resetSelectedGroup();
    const characterId = getRandomCharacterId();
    if (!characterId) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error('No characters found');
        return;
    }
    setCharacterId(characterId);
    // @ts-expect-error TS(7015) FIXME: Element implicitly has an 'any' type because index... Remove this comment to see the full error message
    setActiveCharacter(characters[characterId]?.avatar);
    setActiveGroup(null);
    await delay(1);
    await reloadCurrentChat();
    // @ts-expect-error TS(7015) FIXME: Element implicitly has an 'any' type because index... Remove this comment to see the full error message
    return characters[characterId]?.name;
}

/**
 * Loads the chat until the given message ID is displayed.
 * @param {number} mesId
 * @returns JQuery<HTMLElement>
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'mesId' implicitly has an 'any' type.
async function loadUntilMesId(mesId) {
    let target;

    while (getFirstDisplayedMessageId() > mesId && getFirstDisplayedMessageId() !== 0) {
        await showMoreMessages();
        await delay(1);
        target = document.querySelector(`#chat .mes[mesid="${mesId}"]`);

        if (target) {
            break;
        }
    }

    if (!target) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(`Could not find message with ID: ${mesId}`);
        return target;
    }

    return target;
}

/**
 *
 * @param _
 * @param text
 */
// @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
async function doMesCut(_, text) {
    console.debug(`was asked to cut message id #${text}`);
    const range = stringToRange(text, 0, chat.length - 1);

    //reject invalid args or no args
    if (!range) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning('Must provide a Message ID or a range to cut.');
        return;
    }

    const totalMesToCut = (range.end - range.start) + 1;
    const mesIDToCut = range.start;
    let cutText = '';

    for (let i = 0; i < totalMesToCut; i++) {
        // @ts-expect-error TS(2339) FIXME: Property 'mes' does not exist on type 'never'.
        cutText += (chat[mesIDToCut]?.mes || '') + '\n';
        let mesToCut = document.querySelector(`#chat .mes[mesid="${mesIDToCut}"]`);

        if (!mesToCut) {
            // @ts-expect-error TS(2322) FIXME: Type 'Element | null | undefined' is not assignabl... Remove this comment to see the full error message
            mesToCut = await loadUntilMesId(mesIDToCut);

            if (!mesToCut) {
                return;
            }
        }

        setEditedMessageId(mesIDToCut);
        // @ts-expect-error TS(2345) FIXME: Argument of type 'null' is not assignable to param... Remove this comment to see the full error message
        await deleteMessage(mesIDToCut, null, false);
    }

    await saveChatConditional();

    return cutText;
}

/**
 *
 * @param _
 * @param text
 */
// @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
async function doDelMode(_, text) {
    //reject invalid args
    if (text && isNaN(text)) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning('Must enter a number or nothing.');
        return '';
    }

    // Just enter the delete mode.
    if (!text) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#option_delete_mes').trigger('click', { fromSlashCommand: true });
        return '';
    }

    const count = Number(text);

    // Nothing to delete.
    if (count < 1) {
        return '';
    }

    if (count > chat.length) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning(`Cannot delete more than ${chat.length} messages.`);
        return '';
    }

    const range = `${chat.length - count}-${chat.length - 1}`;
    return doMesCut(_, range);
}

/**
 *
 */
function doResetPanels() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#movingUIreset').trigger('click');
    return '';
}

/**
 *
 * @param args
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
async function setAvgBG(args) {
    const nameOverride = args?.name ? String(args.name).trim() : '';
    const bgOverride = args?.bg ? String(args.bg).trim() : '';
    const force = isTrueBoolean(args?.force?.toString());

    let bgUrl;

    if (bgOverride) {
        // Use the specified background file
        const isCustom = isCustomBackgroundUrl(bgOverride);
        bgUrl = isCustom ? bgOverride : getBackgroundPath(bgOverride);
    } else {
        // Use the currently active background
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        bgUrl = $('#bg1')
            .css('background-image')
            .replace(/^url\(['"]?/, '')
            .replace(/['"]?\)$/, '');
    }

    if (!bgUrl || bgUrl === 'none') {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning('No background image set.');
        return '';
    }

    // Build theme name from background filename or use override
    const bgName = deriveBackgroundName(bgUrl);
    const themeName = nameOverride || `bgcol - ${bgName}`;

    // Check if a theme with the same name already exists
    // @ts-expect-error TS(7005) FIXME: Variable 'themes' implicitly has an 'any[]' type.
    if (themes.some(t => t.name === themeName) && !force) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning('Pass "force=true" to overwrite.', `A theme named "${themeName}" already exists.`);
        return '';
    }

    const bgimg = new Image();
    bgimg.crossOrigin = 'anonymous';
    bgimg.src = bgUrl;

    await new Promise((resolve, reject) => {
        bgimg.onload = resolve;
        bgimg.onerror = () => reject(new Error('Failed to load background image'));
    });

    // Extract dominant vivid color using Oklch-weighted sampling
    const dominantRgb = extractDominantColor(bgimg);

    // Generate a full theme palette from the dominant color
    const palette = generateThemePalette(dominantRgb);

    // Create theme object from current settings, then override colors
    const theme = getThemeObject(themeName);
    Object.assign(theme, palette);

    // Save as a new theme
    // @ts-expect-error TS(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
    await saveTheme(themeName, theme);
    applyTheme(themeName);

    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
    toastr.success(`Theme "${themeName}" generated and applied.`);
    return '';
}

/**
 *
 * @param _
 * @param themeName
 */
// @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
async function setThemeCallback(_, themeName) {
    if (!themeName) {
        // allow reporting of the theme name if called without args
        // for use in ST Scripts via pipe
        return power_user.theme;
    }

    // @ts-expect-error TS(7005) FIXME: Variable 'themes' implicitly has an 'any[]' type.
    const fuse = new Fuse(themes, {
        keys: [
            { name: 'name', weight: 1 },
        ],
    });

    const results = fuse.search(themeName);
    console.debug('Theme fuzzy search results for ' + themeName, results);
    const theme = results[0]?.item;

    if (!theme) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning(`Could not find theme with name: ${themeName}`);
        return;
    }

    power_user.theme = theme.name;
    applyTheme(theme.name);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#themes').val(theme.name);
    saveSettingsDebounced();
    return '';
}

/**
 *
 * @param _
 * @param text
 */
// @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
async function setmovingUIPreset(_, text) {
    // @ts-expect-error TS(7005) FIXME: Variable 'movingUIPresets' implicitly has an 'any[... Remove this comment to see the full error message
    const fuse = new Fuse(movingUIPresets, {
        keys: [
            { name: 'name', weight: 1 },
        ],
    });

    const results = fuse.search(text);
    console.debug('movingUI preset fuzzy search results for ' + text, results);
    const preset = results[0]?.item;

    if (!preset) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning(`Could not find preset with name: ${text}`);
        return;
    }

    power_user.movingUIPreset = preset.name;
    applyMovingUIPreset(preset.name);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#movingUIPresets').val(preset.name);
    saveSettingsDebounced();
    return '';
}

// @ts-expect-error TS(7034) FIXME: Variable 'EPHEMERAL_STOPPING_STRINGS' implicitly h... Remove this comment to see the full error message
const EPHEMERAL_STOPPING_STRINGS = [];

/**
 * Adds a stopping string to the list of stopping strings that are only used for the next generation.
 * @param {string} value The stopping string to add
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
export function addEphemeralStoppingString(value) {
    // @ts-expect-error TS(7005) FIXME: Variable 'EPHEMERAL_STOPPING_STRINGS' implicitly h... Remove this comment to see the full error message
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

    // @ts-expect-error TS(7005) FIXME: Variable 'EPHEMERAL_STOPPING_STRINGS' implicitly h... Remove this comment to see the full error message
    console.debug('Flushing ephemeral stopping strings:', EPHEMERAL_STOPPING_STRINGS);
    // @ts-expect-error TS(7005) FIXME: Variable 'EPHEMERAL_STOPPING_STRINGS' implicitly h... Remove this comment to see the full error message
    EPHEMERAL_STOPPING_STRINGS.splice(0, EPHEMERAL_STOPPING_STRINGS.length);
}

/**
 * Checks if the generated text should be filtered based on the auto-swipe settings.
 * @param {string} text The text to check
 * @returns {boolean} If the generated text should be filtered
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'text' implicitly has an 'any' type.
export function generatedTextFiltered(text) {
    /**
     * Checks if the given text contains any of the blacklisted words.
     * @param {string} text The text to check
     * @param {string[]} blacklist The list of blacklisted words
     * @param {number} threshold The number of blacklisted words that need to be present to trigger the check
     * @returns {boolean} Whether the text contains blacklisted words
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'text' implicitly has an 'any' type.
    function containsBlacklistedWords(text, blacklist, threshold) {
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
            let strings = JSON.parse(power_user.custom_stopping_strings);

            // Make sure it's an array
            if (!Array.isArray(strings)) {
                return [];
            }

            // Make sure all the elements are strings and non-empty.
            strings = strings.filter(s => typeof s === 'string' && s.length > 0);

            // Substitute params if necessary
            if (power_user.custom_stopping_strings_macro) {
                // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
                strings = strings.map(x => substituteParams(x));
            }

            return strings;
        } catch (error) {
            // If there's an error, return an empty array
            console.warn('Error parsing custom stopping strings:', error);
            return [];
        }
    }

    const permanent = getPermanent();
    // @ts-expect-error TS(7005) FIXME: Variable 'EPHEMERAL_STOPPING_STRINGS' implicitly h... Remove this comment to see the full error message
    const ephemeral = EPHEMERAL_STOPPING_STRINGS;
    const strings = [...permanent, ...ephemeral];

    // Apply the limit. If limit is 0, return all strings.
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    if (limit > 0) {
        return strings.slice(0, limit);
    }

    return strings;
}

/**
 *
 */
export function forceCharacterEditorTokenize() {
    document.querySelectorAll('[data-token-counter]').forEach(el => {
        // @ts-expect-error TS(2339) FIXME: Property 'dataset' does not exist on type 'Element... Remove this comment to see the full error message
        const targetEl = document.getElementById(el.dataset.tokenCounter);
        if (targetEl) targetEl.dataset.lastValueHash = '';
    });
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#rm_ch_create_block').trigger('input');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_popup').trigger('input');
}

// @ts-expect-error TS(2304) FIXME: Cannot find name 'jQuery'.
jQuery(() => {
    const adjustAutocompleteDebounced = debounce(() => {
        document.querySelectorAll('.ui-autocomplete-input').forEach(function (el) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const isOpen = $(el).autocomplete('widget')[0].style.display !== 'none';
            if (isOpen) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                $(el).autocomplete('search');
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

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(window).on('resize', async () => {
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

        if (Object.keys(power_user.movingUIState).length > 0) {
            for (const elmntName of Object.keys(power_user.movingUIState)) {
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                const elmntState = power_user.movingUIState[elmntName];
                const oldHeight = elmntState.height;
                const oldWidth = elmntState.width;
                const oldLeft = elmntState.left;
                const oldTop = elmntState.top;
                const oldBottom = elmntState.bottom;
                const oldRight = elmntState.right;
                const newHeight = Number(oldHeight * scaleY).toFixed(0);
                const newWidth = Number(oldWidth * scaleX).toFixed(0);
                const newLeft = Number(oldLeft * scaleX).toFixed(0);
                const newTop = Number(oldTop * scaleY).toFixed(0);
                const newBottom = Number(oldBottom * scaleY).toFixed(0);
                const newRight = Number(oldRight * scaleX).toFixed(0);
                try {
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    const elmnt = $('#' + $.escapeSelector(elmntName));
                    if (elmnt.length) {
                        console.log(`scaling ${elmntName} by ${scaleX}x${scaleY} to ${newWidth}x${newHeight}`);
                        elmnt.css('height', newHeight);
                        elmnt.css('width', newWidth);
                        elmnt.css('inset', `${newTop}px ${newRight}px ${newBottom}px ${newLeft}px`);
                        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                        power_user.movingUIState[elmntName].height = newHeight;
                        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                        power_user.movingUIState[elmntName].width = newWidth;
                        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                        power_user.movingUIState[elmntName].top = newTop;
                        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                        power_user.movingUIState[elmntName].bottom = newBottom;
                        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                        power_user.movingUIState[elmntName].left = newLeft;
                        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                        power_user.movingUIState[elmntName].right = newRight;
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

    // Settings that go to settings.json
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#collapse-newlines-checkbox').on('change', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.collapse_newlines = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // include newline is the child of trim sentences
    // if include newline is checked, trim sentences must be checked
    // if trim sentences is unchecked, include newline must be unchecked
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#trim_sentences_checkbox').on('change', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.trim_sentences = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#single_line').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        power_user.single_line = value;
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#context_derived').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        power_user.context_derived = value;
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#context_derived').on('change', function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        this.parentElement.querySelector('i').classList.toggle('toggleEnabled', !!power_user.context_derived);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#instruct_derived').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        power_user.instruct_derived = value;
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#instruct_derived').on('change', function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        this.parentElement.querySelector('i').classList.toggle('toggleEnabled', !!power_user.instruct_derived);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#context_size_derived').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        power_user.context_size_derived = value;
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#context_size_derived').on('change', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#context_size_derived').prop('checked', !!power_user.context_size_derived);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#context_story_string_position').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = Number($(this).val());
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#context_story_string_inject_settings').toggle(value === extension_prompt_types.IN_CHAT);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bind_model_templates').on('input', function () {
        // @ts-expect-error TS(2801) FIXME: This condition will always return true since this ... Remove this comment to see the full error message
        if (bindModelTemplates(power_user, online_status)) {
            saveSettingsDebounced();
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bind_model_templates').on('change', updateBindModelTemplatesState);

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#always-force-name2-checkbox').on('change', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.always_force_name2 = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#markdown_escape_strings').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.markdown_escape_strings = String($(this).val());
        saveSettingsDebounced();
        reloadMarkdownProcessor();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#start_reply_with').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.user_prompt_bias = String($(this).val());
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#chat-show-reply-prefix-checkbox').on('change', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.show_user_prompt_bias = !!$(this).prop('checked');
        reloadCurrentChat();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto_continue_enabled').on('change', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.auto_continue.enabled = $(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto_continue_allow_chat_completions').on('change', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.auto_continue.allow_chat_completions = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto_continue_target_length').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.auto_continue.target_length = Number($(this).val());
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#example_messages_behavior').on('change', function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const selectedOption = String(this.value);
        console.log('Setting example messages behavior to', selectedOption);

        switch (selectedOption) {
            case 'normal':
                power_user.pin_examples = false;
                power_user.strip_examples = false;
                break;
            case 'keep':
                power_user.pin_examples = true;
                power_user.strip_examples = false;
                break;
            case 'strip':
                power_user.pin_examples = false;
                power_user.strip_examples = true;
                break;
        }

        console.debug('power_user.pin_examples', power_user.pin_examples);
        console.debug('power_user.strip_examples', power_user.strip_examples);

        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#fast_ui_mode').on('change', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.fast_ui_mode = $(this).prop('checked');
        switchUiMode();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#waifuMode').on('change', () => {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.waifuMode = !!$('#waifuMode').prop('checked');
        switchWaifuMode();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#customCSS').on('input', () => {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.custom_css = String($('#customCSS').val());
        saveSettingsDebounced();
        applyCustomCSS();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#movingUImode').on('change', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.movingUI = $(this).prop('checked');
        switchMovingUI();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#noShadowsmode').on('change', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.noShadows = $(this).prop('checked');
        applyNoShadows();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#movingUIreset').on('click', resetMovablePanels);

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#avatar_style').on('change', function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const value = this.value;
        power_user.avatar_style = Number(value);
        applyAvatarStyle();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#chat_display').on('change', function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const value = this.value;
        power_user.chat_display = Number(value);
        applyChatDisplay();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#toastr_position').on('change', function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const value = this.value;
        power_user.toastr_position = String(value);
        applyToastrPosition();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#chat_width_slider').on('input', function (e, data) {
        const applyMode = data?.forced ? 'forced' : 'normal';
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.chat_width = Number($(this).val());
        applyChatWidth(applyMode);
        saveSettingsDebounced();
        setHotswapsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#chat_truncation').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.chat_truncation = Number($('#chat_truncation').val());
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#chat_truncation_counter').val(power_user.chat_truncation);
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#streaming_fps').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.streaming_fps = Number($('#streaming_fps').val());
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#streaming_fps_counter').val(power_user.streaming_fps);
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#smooth_streaming').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.smooth_streaming = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#smooth_streaming_no_think').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.smooth_streaming_no_think = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#smooth_streaming_speed').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.smooth_streaming_speed = Number($('#smooth_streaming_speed').val());
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stream_fade_in').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.stream_fade_in = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('input[name="font_scale"]').on('input', async function (e, data) {
        const applyMode = data?.forced ? 'forced' : 'normal';
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.font_scale = Number($(this).val());
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#font_scale_counter').val(power_user.font_scale);
        applyFontScale(applyMode);
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('input[name="blur_strength"]').on('input', async function (e) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.blur_strength = Number($(this).val());
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#blur_strength_counter').val(power_user.blur_strength);
        applyBlurStrength();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('input[name="shadow_width"]').on('input', async function (e) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.shadow_width = Number($(this).val());
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#shadow_width_counter').val(power_user.shadow_width);
        applyShadowWidth();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#main-text-color-picker').on('change', (/** @type {ColorPickerEvent} */ evt) => {
        power_user.main_text_color = evt.detail.rgba;
        applyThemeColor('main');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#italics-color-picker').on('change', (/** @type {ColorPickerEvent} */ evt) => {
        power_user.italics_text_color = evt.detail.rgba;
        applyThemeColor('italics');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#underline-color-picker').on('change', (/** @type {ColorPickerEvent} */ evt) => {
        power_user.underline_text_color = evt.detail.rgba;
        applyThemeColor('underline');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#quote-color-picker').on('change', (/** @type {ColorPickerEvent} */ evt) => {
        power_user.quote_text_color = evt.detail.rgba;
        applyThemeColor('quote');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#blur-tint-color-picker').on('change', (/** @type {ColorPickerEvent} */ evt) => {
        power_user.blur_tint_color = evt.detail.rgba;
        applyThemeColor('blurTint');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#chat-tint-color-picker').on('change', (/** @type {ColorPickerEvent} */ evt) => {
        power_user.chat_tint_color = evt.detail.rgba;
        applyThemeColor('chatTint');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#user-mes-blur-tint-color-picker').on('change', (/** @type {ColorPickerEvent} */ evt) => {
        power_user.user_mes_blur_tint_color = evt.detail.rgba;
        applyThemeColor('userMesBlurTint');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bot-mes-blur-tint-color-picker').on('change', (/** @type {ColorPickerEvent} */ evt) => {
        power_user.bot_mes_blur_tint_color = evt.detail.rgba;
        applyThemeColor('botMesBlurTint');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#shadow-color-picker').on('change', (/** @type {ColorPickerEvent} */ evt) => {
        power_user.shadow_color = evt.detail.rgba;
        applyThemeColor('shadow');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#border-color-picker').on('change', (/** @type {ColorPickerEvent} */ evt) => {
        power_user.border_color = evt.detail.rgba;
        applyThemeColor('border');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#themes').on('change', function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const themeSelected = String(this.value);
        power_user.theme = themeSelected;
        applyTheme(themeSelected);
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#movingUIPresets').on('change', async function () {
        console.log('saw MUI preset change');
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const movingUIPresetSelected = String(this.value);
        power_user.movingUIPreset = movingUIPresetSelected;
        applyMovingUIPreset(movingUIPresetSelected);
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#ui-preset-save-button').on('click', () => saveTheme());
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#ui-preset-update-button').on('click', () => updateTheme());
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#ui-preset-delete-button').on('click', () => deleteTheme());
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#movingui-preset-save-button').on('click', saveMovingUI);

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#never_resize_avatars').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.never_resize_avatars = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#show_card_avatar_urls').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.show_card_avatar_urls = !!$(this).prop('checked');
        printCharactersDebounced();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#play_message_sound').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.play_message_sound = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#play_sound_unfocused').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.play_sound_unfocused = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto_save_msg_edits').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.auto_save_msg_edits = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#character_sort_order').on('change', function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const selectedOption = this.options[this.selectedIndex];
        const field = String(selectedOption?.dataset.field ?? '');
        // Save sort order, but do not save search sorting, as this is a temporary sorting option
        if (field !== 'search') {
            power_user.sort_field = field;
            power_user.sort_order = selectedOption?.dataset.order ?? '';
            power_user.sort_rule = selectedOption?.dataset.rule ?? '';
        }
        printCharactersDebounced();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#gestures-checkbox').on('change', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.gestures = !!$('#gestures-checkbox').prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto_swipe').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.auto_swipe = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto_swipe_blacklist').on('input', function () {
        // @ts-expect-error TS(2322) FIXME: Type 'string[]' is not assignable to type 'never[]... Remove this comment to see the full error message
        power_user.auto_swipe_blacklist = String($(this).val())
            .split(',')
            .map(str => str.trim())
            .filter(str => str);
        console.log('power_user.auto_swipe_blacklist', power_user.auto_swipe_blacklist);
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto_swipe_minimum_length').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const number = Number($(this).val());
        if (!isNaN(number)) {
            power_user.auto_swipe_minimum_length = number;
            saveSettingsDebounced();
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto_swipe_blacklist_threshold').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const number = Number($(this).val());
        if (!isNaN(number)) {
            power_user.auto_swipe_blacklist_threshold = number;
            saveSettingsDebounced();
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto_fix_generated_markdown').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.auto_fix_generated_markdown = !!$(this).prop('checked');
        reloadCurrentChat();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#console_log_prompts').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.console_log_prompts = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#request_token_probabilities').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.request_token_probabilities = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#show_group_chat_queue').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.show_group_chat_queue = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto_scroll_chat_to_bottom').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.auto_scroll_chat_to_bottom = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#tokenizer').on('change', function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const value = this.value;
        power_user.tokenizer = Number(value);
        BIAS_CACHE.clear();
        saveSettingsDebounced();

        // Trigger character editor re-tokenize
        forceCharacterEditorTokenize();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#send_on_enter').on('change', function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const value = this.value;
        power_user.send_on_enter = Number(value);
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#confirm_message_delete').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.confirm_message_delete = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#reload_chat').on('click', async function () {
        const currentChatId = getCurrentChatId();
        if (currentChatId !== undefined && currentChatId !== null) {
            await saveSettings();
            await saveChatConditional();
            await reloadCurrentChat();
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#allow_name1_display').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.allow_name1_display = !!$(this).prop('checked');
        reloadCurrentChat();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#allow_name2_display').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.allow_name2_display = !!$(this).prop('checked');
        reloadCurrentChat();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#token_padding').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.token_padding = Number($(this).val());
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#messageTimerEnabled').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        power_user.timer_enabled = value;
        switchTimer();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#messageTimestampsEnabled').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        power_user.timestamps_enabled = value;
        switchTimestamps();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#messageModelIconEnabled').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        power_user.timestamp_model_icon = value;
        switchIcons();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#messageTokensEnabled').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        power_user.message_token_count_enabled = value;
        switchTokenCount();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#expandMessageActions').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        power_user.expand_message_actions = value;
        switchMessageActions();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#enableZenSliders').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        if (power_user.enableLabMode === true && value === true) {
            //disallow zenSliders while Lab Mode is active
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.warning('Disable Mad Lab Mode before enabling Zen Sliders');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(this).prop('checked', false).trigger('input');
            return;
        }
        power_user.enableZenSliders = value;
        switchZenSliders();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#enableLabMode').on('input', function (event, { fromInit = false } = {}) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        if (power_user.enableZenSliders === true && value === true) {
            //disallow Lab Mode if ZenSliders are active
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.warning('Disable Zen Sliders before enabling Mad Lab Mode');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(this).prop('checked', false).trigger('input');
            return;
        }

        power_user.enableLabMode = value;
        switchLabMode({ noReset: fromInit });
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#mesIDDisplayEnabled').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        power_user.mesIDDisplay_enabled = value;
        switchMesIDDisplay();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#hideChatAvatarsEnabled').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        power_user.hideChatAvatars_enabled = value;
        switchHideChatAvatars();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#hotswapEnabled').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        power_user.hotswap_enabled = value;
        switchHotswap();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#prefer_character_prompt').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        power_user.prefer_character_prompt = value;
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#prefer_character_jailbreak').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        power_user.prefer_character_jailbreak = value;
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#continue_on_send').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        power_user.continue_on_send = value;
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#quick_continue').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        power_user.quick_continue = value;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#mes_continue').css('display', value ? '' : 'none');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#quick_impersonate').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        power_user.quick_impersonate = value;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#mes_impersonate').css('display', value ? '' : 'none');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#trim_spaces').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        power_user.trim_spaces = value;
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#relaxed_api_urls').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        power_user.relaxed_api_urls = value;
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#world_import_dialog').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        power_user.world_import_dialog = value;
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#enable_auto_select_input').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        power_user.enable_auto_select_input = value;
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#enable_md_hotkeys').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = !!$(this).prop('checked');
        power_user.enable_md_hotkeys = value;
        toggleMDHotkeyIconDisplay();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#spoiler_free_mode').on('input', function () {
        // @ts-expect-error TS(2339) FIXME: Property 'spoiler_free_mode' does not exist on typ... Remove this comment to see the full error message
        power_user.spoiler_free_mode = !!$(this).prop('checked');
        switchSpoilerMode();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#spoiler_free_desc_button').on('click', function (e) {
        e.stopPropagation();
        peekSpoilerMode();
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        this.classList.toggle('fa-eye');
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        this.classList.toggle('fa-eye-slash');
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#custom_stopping_strings').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.custom_stopping_strings = String($(this).val()).trim();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#custom_stopping_strings_macro').on('change', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.custom_stopping_strings_macro = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#fuzzy_search_checkbox').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.fuzzy_search = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#persona_show_notifications').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.persona_show_notifications = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#persona_allow_multi_connections').on('input', function () {
        // @ts-expect-error TS(2339) FIXME: Property 'persona_allow_multi_connections' does no... Remove this comment to see the full error message
        power_user.persona_allow_multi_connections = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#persona_auto_lock').on('input', function () {
        // @ts-expect-error TS(2339) FIXME: Property 'persona_auto_lock' does not exist on typ... Remove this comment to see the full error message
        power_user.persona_auto_lock = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#encode_tags').on('input', async function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.encode_tags = !!$(this).prop('checked');
        await reloadCurrentChat();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#experimental_macro_engine').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.experimental_macro_engine = !!$(this).prop('checked');
        saveSettingsDebounced();

        // Check if the app is ready before showing the toast
        if (!settingsReady) {
            return;
        }

        eventSource.once(event_types.SETTINGS_UPDATED, function () {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.warning(
                t`Click here to reload.`,
                t`Toggling the Experimental Macro Engine requires a reload.`,
                {
                    onclick: () => window.location.reload(),
                    timeOut: 10000,
                    preventDuplicates: true,
                },
            );
        });
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#disable_group_trimming').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.disable_group_trimming = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#debug_menu').on('click', function () {
        showDebugMenu();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bogus_folders').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.bogus_folders = !!$(this).prop('checked');
        printCharactersDebounced();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#zoomed_avatar_magnification').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.zoomed_avatar_magnification = !!$(this).prop('checked');
        printCharactersDebounced();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#aux_field').on('change', function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const value = this.value;
        power_user.aux_field = String(value);
        printCharactersDebounced();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#tag_import_setting').on('change', function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const value = this.value;
        power_user.tag_import_setting = Number(value);
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_autocomplete_state').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.stscript.autocomplete.state = Number($(this).val());
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_autocomplete_autoHide').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.stscript.autocomplete.autoHide = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_autocomplete_showInAllMacroFields').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.stscript.autocomplete.showInAllMacroFields = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_matching').on('change', function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const value = this.value;
        power_user.stscript.matching = String(value);
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_autocomplete_style').on('change', function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const value = this.value;
        power_user.stscript.autocomplete.style = String(value);
        document.body.setAttribute('data-stscript-style', power_user.stscript.autocomplete.style);
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_autocomplete_select').on('change', function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const value = this.value;
        power_user.stscript.autocomplete.select = parseInt(String(value));
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_autocomplete_font_scale').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = $(this).val();
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#stscript_autocomplete_font_scale_counter').val(value);
        power_user.stscript.autocomplete.font.scale = Number(value);
        document.body.style.setProperty('--ac-font-scale', value.toString());
        window.dispatchEvent(new Event('resize', { bubbles: true }));
        saveSettingsDebounced();
    });
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_autocomplete_font_scale_counter').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = $(this).val();
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#stscript_autocomplete_font_scale').val(value);
        power_user.stscript.autocomplete.font.scale = Number(value);
        document.body.style.setProperty('--ac-font-scale', value.toString());
        window.dispatchEvent(new Event('resize', { bubbles: true }));
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_autocomplete_width_left').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = $(this).val();
        power_user.stscript.autocomplete.width.left = Number(value);
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        /**@type {HTMLElement}*/(this.closest('.doubleRangeInputContainer')).style.setProperty('--value', value.toString());
        window.dispatchEvent(new Event('resize', { bubbles: true }));
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_autocomplete_width_right').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = $(this).val();
        power_user.stscript.autocomplete.width.right = Number(value);
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        /**@type {HTMLElement}*/(this.closest('.doubleRangeInputContainer')).style.setProperty('--value', value.toString());
        window.dispatchEvent(new Event('resize', { bubbles: true }));
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_parser_flag_strict_escaping').on('click', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = $(this).prop('checked');
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        power_user.stscript.parser.flags[PARSER_FLAG.STRICT_ESCAPING] = value;
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#stscript_parser_flag_replace_getvar').on('click', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = $(this).prop('checked');
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        power_user.stscript.parser.flags[PARSER_FLAG.REPLACE_GETVAR] = value;
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#restore_user_input').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.restore_user_input = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#reduced_motion').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.reduced_motion = !!$(this).prop('checked');
        switchReducedMotion();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#compact_input_area').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.compact_input_area = !!$(this).prop('checked');
        switchCompactInputArea();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#show_swipe_num_all_messages').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.show_swipe_num_all_messages = !!$(this).prop('checked');
        switchSwipeNumAllMessages();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto-connect-checkbox').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.auto_connect = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto-load-chat-checkbox').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.auto_load_chat = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#forbid_external_media').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.forbid_external_media = !!$(this).prop('checked');
        saveSettingsDebounced();
        reloadCurrentChat();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#pin_styles').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.pin_styles = !!$(this).prop('checked');
        saveSettingsDebounced();
        applyStylePins();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#click_to_edit').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.click_to_edit = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#ui_preset_import_button').on('click', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#ui_preset_import_file').trigger('click');
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#ui_preset_import_file').on('change', async function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const inputElement = this instanceof HTMLInputElement && this;

        try {
            const file = inputElement?.files?.[0];
            await importTheme(file);
        } catch (error) {
            console.error('Error importing UI theme', error);
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(String(error), 'Failed to import UI theme');
        } finally {
            if (inputElement) {
                inputElement.value = null;
            }
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#ui_preset_export_button').on('click', async function () {
        await exportTheme();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#media_display').on('input', async function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.media_display = $(this).val().toString();
        saveSettingsDebounced();
        if (isMediaDisplayReloadNeeded()) {
            await reloadCurrentChat();
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#image_overswipe').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        power_user.image_overswipe = $(this).val().toString();
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '#debug_table [data-debug-function]', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const functionId = $(this).data('debug-function');
        // @ts-expect-error TS(7005) FIXME: Variable 'debug_functions' implicitly has an 'any[... Remove this comment to see the full error message
        const functionRecord = debug_functions.find(f => f.functionId === functionId);

        if (functionRecord) {
            functionRecord.func();
        } else {
            console.warn(`Debug function ${functionId} not found`);
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(window).on('focus', function () {
        browser_has_focus = true;
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(window).on('blur', function () {
        browser_has_focus = false;
    });

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'vn',
        callback: toggleWaifu,
        helpString: 'Swaps Visual Novel Mode On/Off',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'newchat',
        /** @type {(args: { delete: string?}, string) => Promise<''>} */
        // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
        callback: async (args, _) => {
            await doNewChat({ deleteCurrentChat: isTrueBoolean(args.delete) });
            return '';
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'delete',
                description: 'delete the current chat',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
                enumList: commonEnumProviders.boolean('trueFalse')(),
            }),
        ],
        helpString: 'Start a new chat with the current character',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'random',
        callback: doRandomChat,
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'optional tag name',
                typeList: [ARGUMENT_TYPE.STRING],
                // @ts-expect-error TS(7005) FIXME: Variable 'tags' implicitly has an 'any[]' type.
                enumProvider: () => tags.filter(tag => Object.values(tag_map).some(x => x.includes(tag.id))).map(tag => new SlashCommandEnumValue(tag.name, null, enumTypes.enum, enumIcons.tag)),
            }),
        ],
        helpString: 'Start a new chat with a random character. If an argument is provided, only considers characters that have the specified tag.',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'del',
        callback: doDelMode,
        aliases: ['delete', 'delmode'],
        unnamedArgumentList: [
            new SlashCommandArgument(
                'optional number', [ARGUMENT_TYPE.NUMBER], false,
            ),
        ],
        helpString: 'Enter message deletion mode, and auto-deletes last N messages if numeric argument is provided.',
        returns: 'The text of the deleted messages.',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'cut',
        callback: doMesCut,
        returns: 'the text of cut messages separated by a newline',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'number or range',
                typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.RANGE],
                isRequired: true,
                acceptsMultiple: true,
                enumProvider: commonEnumProviders.messages(),
            }),
        ],
        helpString: `
            <div>
                Cuts the specified message or continuous chunk from the chat.
            </div>
            <div>
                Ranges are inclusive!
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/cut 0-10</code></pre>
                    </li>
                </ul>
            </div>
        `,
        aliases: [],
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'resetpanels',
        callback: doResetPanels,
        helpString: 'resets UI panels to original state',
        aliases: ['resetui'],
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'bgcol',
        callback: setAvgBG,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'force',
                description: 'force generation even if a theme with the same name already exists',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
                enumList: commonEnumProviders.boolean('trueFalse')(),
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'name',
                description: 'override the generated theme name',
                typeList: [ARGUMENT_TYPE.STRING],
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'bg',
                description: 'background image filename to use instead of the current one',
                typeList: [ARGUMENT_TYPE.STRING],
                enumProvider: commonEnumProviders.backgrounds,
            }),
        ],
        helpString: 'Generates a new theme based on a dominant color of the specified background image. Saves as "bgcol - background name".',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'theme',
        callback: setThemeCallback,
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'theme name',
                typeList: [ARGUMENT_TYPE.STRING],
                // @ts-expect-error TS(7005) FIXME: Variable 'themes' implicitly has an 'any[]' type.
                enumProvider: () => themes.map(theme => new SlashCommandEnumValue(theme.name)),
            }),
        ],
        helpString: `
        <div>
            Sets a UI theme by name.
        </div>
        <div>
            If no theme name is is provided, this will return the currently active theme.
        </div>
        <div>
            <strong>Example:</strong>
            <ul>
                <li>
                    <pre><code>/theme Cappuccino</code></pre>
                </li>
                <li>
                    <pre><code>/theme</code></pre>
                </li>
            </ul>
        </div>
    `,
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'css-var',
        /**
         * @param {{to: string, varname: string }} args @param {string} value @returns {string}
         * @param value
         */
        // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
        callback: (args, value) => {
            // Map enum to target selector
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            const targetSelector = {
                chat: '#chat',
                background: '#bg1',
                gallery: '#gallery',
                zoomedAvatar: 'div.zoomed_avatar',
            }[args.to || 'chat'];

            if (!targetSelector) {
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.error(`Invalid target: ${args.to}`);
                return;
            }

            if (!args.varname) {
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.error('CSS variable name is required');
                return;
            }
            if (!args.varname.startsWith('--')) {
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.error('CSS variable names must start with "--"');
                return;
            }

            const elements = document.querySelectorAll(targetSelector);
            if (elements.length === 0) {
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.error(`No elements found for ${args.to ?? 'chat'} with selector "${targetSelector}"`);
                return;
            }

            elements.forEach(element => {
                element.style.setProperty(args.varname, value);
            });

            console.info(`Set CSS variable "${args.varname}" to "${value}" on "${targetSelector}"`);
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'varname',
                description: 'CSS variable name (starting with double dashes)',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'to',
                description: 'The target element to which the CSS variable will be applied',
                typeList: [ARGUMENT_TYPE.STRING],
                enumList: [
                    new SlashCommandEnumValue('chat', null, enumTypes.enum, enumIcons.message),
                    new SlashCommandEnumValue('background', null, enumTypes.enum, enumIcons.image),
                    new SlashCommandEnumValue('zoomedAvatar', null, enumTypes.enum, enumIcons.character),
                    new SlashCommandEnumValue('gallery', null, enumTypes.enum, enumIcons.image),
                ],
                defaultValue: 'chat',
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'CSS variable value',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
            }),
        ],
        helpString: `
            <div>
                Sets a CSS variable to a specified value on a target element.
                <br />
                Only setting of variable names is supported. They have to be prefixed with double dashes ("--exampleVar").
                Setting actual CSS properties is not supported. Custom CSS in the theme settings can be used for that.
                <br /><br />
                <b>This value will be gone after a page reload!</b>
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/css-var varname="--SmartThemeBodyColor" #ff0000</code></pre>
                        Sets the text color of the chat to red
                    </li>
                    <li>
                        <pre><code>/css-var to=zoomedAvatar varname="--SmartThemeBlurStrength" 0</code></pre>
                        Remove the blur from the zoomed avatar
                    </li>
                </ul>
            </div>
        `,
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'movingui',
        callback: setmovingUIPreset,
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'name',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                // @ts-expect-error TS(7005) FIXME: Variable 'movingUIPresets' implicitly has an 'any[... Remove this comment to see the full error message
                enumProvider: () => movingUIPresets.map(preset => new SlashCommandEnumValue(preset.name)),
            }),
        ],
        helpString: 'activates a movingUI preset by name',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'stop-strings',
        aliases: ['stopping-strings', 'custom-stopping-strings', 'custom-stop-strings'],
        helpString: `
            <div>
                Sets a list of custom stopping strings. Gets the list if no value is provided.
                Use a "force" argument to force set an empty value.
            </div>
            <div>
                <strong>Examples:</strong>
            </div>
            <ul>
                <li>Force set an empty value: <pre><code class="language-stscript">/stop-strings force="true" {{noop}}</code></pre></li>
                <li>Value must be a JSON-serialized array: <pre><code class="language-stscript">/stop-strings ["goodbye", "farewell"]</code></pre></li>
                <li>Pipe characters must be escaped with a backslash: <pre><code class="language-stscript">/stop-strings ["left\\|right"]</code></pre></li>
            </ul>
        `,
        returns: ARGUMENT_TYPE.LIST,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'force',
                description: 'force set a value if empty',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
                enumList: commonEnumProviders.boolean('trueFalse')(),
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'list of strings',
                typeList: [ARGUMENT_TYPE.LIST],
                acceptsMultiple: false,
                isRequired: false,
            }),
        ],
        // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
        callback: (args, value) => {
            const force = isTrueBoolean(String(args?.force ?? false));
            value = String(value ?? '').trim();

            // Skip processing if no value and not forced
            if (!force && !value) {
                return power_user.custom_stopping_strings;
            }

            // Use empty array for forced empty value
            if (force && !value) {
                value = JSON.stringify([]);
            }

            const parsedValue = ((x) => { try { return JSON.parse(x.toString()); } catch { return null; } })(value);
            if (!parsedValue || !Array.isArray(parsedValue)) {
                throw new Error('Invalid list format. The value must be a JSON-serialized array of strings.');
            }
            parsedValue.forEach((item, index) => {
                parsedValue[index] = String(item);
            });
            power_user.custom_stopping_strings = JSON.stringify(parsedValue);
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#custom_stopping_strings').val(power_user.custom_stopping_strings);
            saveSettingsDebounced();

            return power_user.custom_stopping_strings;
        },
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'start-reply-with',
        helpString: `
            <div>
                Sets a "Start Reply With". Gets the current value if no value is provided.
                Use a "force" argument to force set an empty value.
            </div>
            <div>
                <strong>Examples:</strong>
            </div>
            <ul>
                <li>Set the field value: <pre><code class="language-stscript">/start-reply-with Sure!</code></pre></li>
                <li>Force set an empty value: <pre><code class="language-stscript">/start-reply-with force="true" {{noop}}</code></pre></li>
            </ul>
        `,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'force',
                description: 'force set a value if empty',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
                enumList: commonEnumProviders.boolean('trueFalse')(),
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'value',
                typeList: [ARGUMENT_TYPE.STRING],
                acceptsMultiple: false,
                isRequired: false,
            }),
        ],
        // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
        callback: (args, value) => {
            const force = isTrueBoolean(String(args?.force ?? false));

            // Skip processing if no value and not forced
            if (!force && !value) {
                return power_user.user_prompt_bias;
            }

            power_user.user_prompt_bias = String(value ?? '');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#start_reply_with').val(power_user.user_prompt_bias);
            saveSettingsDebounced();

            return power_user.user_prompt_bias;
        },
    }));
});
