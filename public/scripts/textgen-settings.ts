import {
    abortStatusCheck,
    eventSource,
    event_types,
    getRequestHeaders,
    getStoppingStrings,
    main_api,
    max_context,
    online_status,
    resultCheckStatus,
    saveSettingsDebounced,
    setGenerationParamsFromPreset,
    setOnlineStatus,
    startStatusLoading,
    substituteParams,
} from '../script.js';
import { deriveTemplatesFromChatTemplate } from './chat-templates.js';
import { t } from './i18n.js';
import {
    autoSelectInstructPreset,
    selectContextPreset,
    selectInstructPreset,
} from './instruct-mode.js';
import {
    BIAS_CACHE,
    createNewLogitBiasEntry,
    displayLogitBias,
    getLogitBiasListResult,
} from './logit-bias.js';

import { power_user, registerDebugFunction } from './power-user.js';
import {
    getActiveManualApiSamplers,
    loadApiSelectedSamplers,
    isSamplerManualPriorityEnabled,
} from './samplerSelect.js';
import { SECRET_KEYS, writeSecret } from './secrets.js';
import { getEventSourceStream } from './sse-stream.js';
import {
    getCurrentDreamGenModelTokenizer,
    getCurrentOpenRouterModelTokenizer,
    loadAphroditeModels,
    loadDreamGenModels,
    loadFeatherlessModels,
    loadGenericModels,
    loadInfermaticAIModels,
    loadLlamaCppModels,
    loadMancerModels,
    loadOllamaModels,
    loadOpenRouterModels,
    loadTabbyModels,
    loadTogetherAIModels,
    loadVllmModels,
    updateOpenRouterProvidersWarning,
    type ApiModel,
} from './textgen-models.js';
declare const Sortable: new (el: HTMLElement | null, options: Record<string, unknown>) => unknown;
import {
    ENCODE_TOKENIZERS,
    TEXTGEN_TOKENIZERS,
    TOKENIZER_SUPPORTED_KEY,
    getTextTokens,
    getTokenizerBestMatch,
    tokenizers,
} from './tokenizers.js';
import { AbortReason } from './util/AbortReason.js';
import { getSortableDelay, onlyUnique, arraysEqual, isObject } from './utils.js';

export const textgen_types = {
    OOBA: 'ooba',
    MANCER: 'mancer',
    VLLM: 'vllm',
    APHRODITE: 'aphrodite',
    TABBY: 'tabby',
    KOBOLDCPP: 'koboldcpp',
    TOGETHERAI: 'togetherai',
    LLAMACPP: 'llamacpp',
    OLLAMA: 'ollama',
    INFERMATICAI: 'infermaticai',
    DREAMGEN: 'dreamgen',
    OPENROUTER: 'openrouter',
    FEATHERLESS: 'featherless',
    HUGGINGFACE: 'huggingface',
    GENERIC: 'generic',
};

const {
    GENERIC,
    MANCER,
    VLLM,
    APHRODITE,
    TABBY,
    TOGETHERAI,
    OOBA,
    OLLAMA,
    LLAMACPP,
    INFERMATICAI,
    DREAMGEN,
    OPENROUTER,
    KOBOLDCPP,
    HUGGINGFACE,
    FEATHERLESS,
} = textgen_types;

const LLAMACPP_DEFAULT_ORDER = [
    'penalties',
    'dry',
    'top_n_sigma',
    'top_k',
    'typ_p',
    'top_p',
    'min_p',
    'xtc',
    'temperature',
    'adaptive_p',
];
const OOBA_DEFAULT_ORDER = [
    'repetition_penalty',
    'presence_penalty',
    'frequency_penalty',
    'dry',
    'temperature',
    'dynamic_temperature',
    'quadratic_sampling',
    'top_n_sigma',
    'top_k',
    'top_p',
    'typical_p',
    'epsilon_cutoff',
    'eta_cutoff',
    'tfs',
    'top_a',
    'min_p',
    'adaptive_p',
    'mirostat',
    'xtc',
    'encoder_repetition_penalty',
    'no_repeat_ngram',
];
export const APHRODITE_DEFAULT_ORDER = [
    'dry',
    'penalties',
    'no_repeat_ngram',
    'temperature',
    'top_nsigma',
    'top_p_top_k',
    'top_a',
    'min_p',
    'tfs',
    'eta_cutoff',
    'epsilon_cutoff',
    'typical_p',
    'quadratic',
    'xtc',
];
const BIAS_KEY = '#textgenerationwebui_api-settings';

// Maybe let it be configurable in the future?
// (7 days later) The future has come.
const MANCER_SERVER_KEY = 'mancer_server';
const MANCER_SERVER_DEFAULT = 'https://neuro.mancer.tech';
export let MANCER_SERVER = localStorage.getItem(MANCER_SERVER_KEY) ?? MANCER_SERVER_DEFAULT;
export const TOGETHERAI_SERVER = 'https://api.together.xyz';
export const INFERMATICAI_SERVER = 'https://api.totalgpt.ai';
export const DREAMGEN_SERVER = 'https://dreamgen.com';
export const OPENROUTER_SERVER = 'https://openrouter.ai/api';
export const FEATHERLESS_SERVER = 'https://api.featherless.ai/v1';

export const SERVER_INPUTS: Record<string, string> = {
    [textgen_types.OOBA]: '#textgenerationwebui_api_url_text',
    [textgen_types.VLLM]: '#vllm_api_url_text',
    [textgen_types.APHRODITE]: '#aphrodite_api_url_text',
    [textgen_types.TABBY]: '#tabby_api_url_text',
    [textgen_types.KOBOLDCPP]: '#koboldcpp_api_url_text',
    [textgen_types.LLAMACPP]: '#llamacpp_api_url_text',
    [textgen_types.OLLAMA]: '#ollama_api_url_text',
    [textgen_types.HUGGINGFACE]: '#huggingface_api_url_text',
    [textgen_types.GENERIC]: '#generic_api_url_text',
};

const KOBOLDCPP_ORDER = [6, 0, 1, 3, 4, 2, 5];
export const textgenerationwebui_settings: Record<string, unknown> = {
    temp: 0.7,
    temperature_last: true,
    top_p: 0.5,
    top_k: 40,
    top_a: 0,
    tfs: 1,
    epsilon_cutoff: 0,
    eta_cutoff: 0,
    typical_p: 1,
    min_p: 0,
    rep_pen: 1.2,
    rep_pen_range: 0,
    rep_pen_decay: 0,
    rep_pen_slope: 1,
    no_repeat_ngram_size: 0,
    penalty_alpha: 0,
    num_beams: 1,
    length_penalty: 1,
    min_length: 0,
    encoder_rep_pen: 1,
    freq_pen: 0,
    presence_pen: 0,
    skew: 0,
    do_sample: true,
    early_stopping: false,
    dynatemp: false,
    min_temp: 0,
    max_temp: 2.0,
    dynatemp_exponent: 1.0,
    smoothing_factor: 0.0,
    smoothing_curve: 1.0,
    dry_allowed_length: 2,
    dry_multiplier: 0.0,
    dry_base: 1.75,
    dry_sequence_breakers: '["\\n", ":", "\\"", "*"]',
    dry_penalty_last_n: 0,
    max_tokens_second: 0,
    seed: -1,
    preset: 'Default',
    add_bos_token: true,
    stopping_strings: [],
    //truncation_length: 2048,
    ban_eos_token: false,
    skip_special_tokens: true,
    include_reasoning: true,
    streaming: false,
    mirostat_mode: 0,
    mirostat_tau: 5,
    mirostat_eta: 0.1,
    guidance_scale: 1,
    negative_prompt: '',
    grammar_string: '',
    json_schema: null,
    json_schema_allow_empty: false,
    banned_tokens: '',
    global_banned_tokens: '',
    send_banned_tokens: true,
    sampler_priority: OOBA_DEFAULT_ORDER,
    samplers: LLAMACPP_DEFAULT_ORDER,
    samplers_priorities: APHRODITE_DEFAULT_ORDER,
    ignore_eos_token: false,
    spaces_between_special_tokens: true,
    speculative_ngram: false,
    type: textgen_types.OOBA,
    mancer_model: 'mytholite',
    togetherai_model: 'Gryphe/MythoMax-L2-13b',
    infermaticai_model: '',
    ollama_model: '',
    openrouter_model: 'openrouter/auto',
    openrouter_providers: [],
    openrouter_quantizations: [],
    vllm_model: '',
    aphrodite_model: '',
    dreamgen_model: 'lucid-v1-extra-large/text',
    tabby_model: '',
    llamacpp_model: '',
    sampler_order: KOBOLDCPP_ORDER,
    logit_bias: [],
    n: 1,
    server_urls: {},
    custom_model: '',
    bypass_status_check: false,
    openrouter_allow_fallbacks: true,
    xtc_threshold: 0.1,
    xtc_probability: 0,
    nsigma: 0.0,
    min_keep: 0,
    featherless_model: '',
    generic_model: '',
    extensions: {},
    adaptive_target: -0.01,
    adaptive_decay: 0.9,
};

export { showSamplerControls as showTGSamplerControls };

export let textgenerationwebui_banned_in_macros: string[] = [];

export let textgenerationwebui_presets: never[] = [];
export let textgenerationwebui_preset_names: string[] = [];

export const setting_names: string[] = [
    'temp',
    'temperature_last',
    'rep_pen',
    'rep_pen_range',
    'rep_pen_decay',
    'rep_pen_slope',
    'no_repeat_ngram_size',
    'top_k',
    'top_p',
    'top_a',
    'tfs',
    'epsilon_cutoff',
    'eta_cutoff',
    'typical_p',
    'min_p',
    'penalty_alpha',
    'num_beams',
    'length_penalty',
    'min_length',
    'dynatemp',
    'min_temp',
    'max_temp',
    'dynatemp_exponent',
    'smoothing_factor',
    'smoothing_curve',
    'dry_allowed_length',
    'dry_multiplier',
    'dry_base',
    'dry_sequence_breakers',
    'dry_penalty_last_n',
    'max_tokens_second',
    'encoder_rep_pen',
    'freq_pen',
    'presence_pen',
    'skew',
    'do_sample',
    'early_stopping',
    'seed',
    'add_bos_token',
    'ban_eos_token',
    'skip_special_tokens',
    'include_reasoning',
    'streaming',
    'mirostat_mode',
    'mirostat_tau',
    'mirostat_eta',
    'guidance_scale',
    'negative_prompt',
    'grammar_string',
    'json_schema',
    'banned_tokens',
    'global_banned_tokens',
    'send_banned_tokens',
    'ignore_eos_token',
    'spaces_between_special_tokens',
    'speculative_ngram',
    'sampler_order',
    'sampler_priority',
    'samplers',
    'samplers_priorities',
    'n',
    'logit_bias',
    'custom_model',
    'bypass_status_check',
    'openrouter_allow_fallbacks',
    'xtc_threshold',
    'xtc_probability',
    'nsigma',
    'min_keep',
    'generic_model',
    'extensions',
    'json_schema_allow_empty',
    'adaptive_target',
    'adaptive_decay',
];

const DYNATEMP_BLOCK = document.getElementById('dynatemp_block_ooba');

/**
 *
 */
export function validateTextGenUrl() {
    const selector = SERVER_INPUTS[textgenerationwebui_settings.type as string];

    if (!selector) {
        return;
    }

    const control = document.querySelector(selector) as HTMLInputElement | null;
    if (!control) return;

    const url = control.value.trim();
    const formattedUrl = formatTextGenURL(url);

    if (!formattedUrl) {
        notyf.error(t`Enter a valid API URL`, 'Text Completion API');
        return;
    }

    control.value = formattedUrl;
}

/**
 * Gets the API URL for the selected text generation type.
 * @param {string} type If it's set, ignores active type
 * @returns {string} API URL
 */
export function getTextGenServer(type: string | null = null) {
    const selectedType = type ?? (textgenerationwebui_settings.type as string);
    switch (selectedType) {
        case FEATHERLESS:
            return FEATHERLESS_SERVER;
        case MANCER:
            return MANCER_SERVER;
        case TOGETHERAI:
            return TOGETHERAI_SERVER;
        case INFERMATICAI:
            return INFERMATICAI_SERVER;
        case DREAMGEN:
            return DREAMGEN_SERVER;
        case OPENROUTER:
            return OPENROUTER_SERVER;
        default:
            return (
                (textgenerationwebui_settings.server_urls as Record<string, string>)[
                    selectedType
                ] ?? ''
            );
    }
}

/**
 *
 * @param name
 */
async function selectPreset(name: string) {
    const preset = textgenerationwebui_presets[textgenerationwebui_preset_names.indexOf(name)];

    if (!preset) {
        return;
    }

    textgenerationwebui_settings.preset = name;
    for (const name of setting_names) {
        const value = (preset as Record<string, unknown>)[name];
        setSettingByName(name, value, true);
    }
    setGenerationParamsFromPreset(preset);
    BIAS_CACHE.delete(BIAS_KEY);
    displayLogitBias((preset as Record<string, unknown>).logit_bias as never[], BIAS_KEY);
    saveSettingsDebounced();
}

/**
 *
 * @param value
 */
export function formatTextGenURL(value: string) {
    try {
        const noFormatTypes = [MANCER, TOGETHERAI, INFERMATICAI, DREAMGEN, OPENROUTER];
        if (noFormatTypes.includes(textgenerationwebui_settings.type as string)) {
            return value;
        }

        const url = new URL(value);
        return url.toString();
    } catch {
        // Just using URL as a validation check
    }
    return null;
}

/**
 *
 * @param presets
 */
function convertPresets(presets: string[]) {
    return Array.isArray(presets) ? presets.map((p) => JSON.parse(p)) : [];
}

/**
 *
 */
function getTokenizerForTokenIds() {
    const bestMatchTokenizer = getTokenizerBestMatch('textgenerationwebui');
    if (bestMatchTokenizer === tokenizers.API_TEXTGENERATIONWEBUI) {
        return tokenizers.API_CURRENT;
    }

    if (
        power_user.tokenizer === tokenizers.API_CURRENT &&
        TEXTGEN_TOKENIZERS.includes(textgenerationwebui_settings.type as string)
    ) {
        return tokenizers.API_CURRENT;
    }

    if (ENCODE_TOKENIZERS.includes(power_user.tokenizer)) {
        return power_user.tokenizer;
    }

    if (textgenerationwebui_settings.type === OPENROUTER) {
        return getCurrentOpenRouterModelTokenizer();
    }

    if (textgenerationwebui_settings.type === DREAMGEN) {
        return getCurrentDreamGenModelTokenizer();
    }

    return tokenizers.LLAMA;
}

/**
 * Gets the custom token bans from settings and macros.
 * @param {TextCompletionSettings} settings Text completion settings to use
 * @typedef {{banned_tokens: string, banned_strings: string[]}} TokenBanResult
 * @returns {TokenBanResult} String with comma-separated banned token IDs
 */
function getCustomTokenBans(settings: Record<string, unknown> | null = null) {
    settings = settings ?? textgenerationwebui_settings;
    if (
        !settings.send_banned_tokens ||
        (!settings.banned_tokens &&
            !settings.global_banned_tokens &&
            !textgenerationwebui_banned_in_macros.length)
    ) {
        return {
            banned_tokens: '',
            banned_strings: [],
        };
    }

    const tokenizer = getTokenizerForTokenIds();
    const banned_tokens: number[] = [];
    const banned_strings: string[] = [];
    const sequences: string[] = ([] as string[])
        .concat(((settings.banned_tokens as string) || '').split('\n'))
        .concat(((settings.global_banned_tokens as string) || '').split('\n'))
        .concat(textgenerationwebui_banned_in_macros)
        .filter((x: string) => x.length > 0)
        .filter(onlyUnique)
        .map((x) => substituteParams(x));

    //debug
    if (textgenerationwebui_banned_in_macros.length) {
        console.log(
            '=== Found banned word sequences in the macros:',
            textgenerationwebui_banned_in_macros,
            'Resulting array of banned sequences (will be used this generation turn):',
            sequences,
        );
    }

    //clean old temporary bans found in macros before, for the next generation turn.
    textgenerationwebui_banned_in_macros = [];

    for (const line of sequences) {
        // Raw token ids, JSON serialized
        if (line.startsWith('[') && line.endsWith(']')) {
            try {
                const tokens = JSON.parse(line);

                if (Array.isArray(tokens) && tokens.every((t: unknown) => Number.isInteger(t))) {
                    banned_tokens.push(...tokens);
                } else {
                    throw new Error('Not an array of integers');
                }
            } catch (err) {
                console.log(`Failed to parse bad word token list: ${line}`, err);
            }
        } else if (line.startsWith('"') && line.endsWith('"')) {
            // Remove the enclosing quotes

            banned_strings.push(line.slice(1, -1));
        } else {
            try {
                const tokens: number[] = getTextTokens(tokenizer, line) as unknown as number[];
                banned_tokens.push(...tokens);
            } catch {
                console.log(`Could not tokenize raw text: ${line}`);
            }
        }
    }

    return {
        banned_tokens: banned_tokens
            .filter(onlyUnique)
            .map((x) => String(x))
            .join(','),
        banned_strings: banned_strings,
    };
}

/**
 * Sets the banned strings kill switch toggle.
 * @param {boolean} isEnabled Kill switch state
 * @param {string} title Label title
 */
function toggleBannedStringsKillSwitch(isEnabled: boolean, title: string) {
    const bannedTokensEl = document.getElementById(
        'send_banned_tokens_textgenerationwebui',
    ) as HTMLInputElement | null;
    if (bannedTokensEl) bannedTokensEl.checked = isEnabled;
    const menuButton = document.querySelector(
        '#send_banned_tokens_label .menu_button',
    ) as HTMLElement | null;
    if (menuButton instanceof HTMLElement) {
        menuButton.classList.toggle('toggleEnabled', isEnabled);
        menuButton.setAttribute('title', title);
    }
    textgenerationwebui_settings.send_banned_tokens = isEnabled;
    saveSettingsDebounced();
}

/**
 * Calculates logit bias object from the logit bias list.
 * @param {TextCompletionSettings} settings Text completion settings
 * @returns {object} Logit bias object
 */
function calculateLogitBias(settings: Record<string, unknown> | null = null) {
    settings = settings ?? textgenerationwebui_settings;

    if (!Array.isArray(settings.logit_bias) || (settings.logit_bias as unknown[]).length === 0) {
        return {};
    }

    const tokenizer = getTokenizerForTokenIds();
    const result: Record<string, unknown> = {};

    /**
     * Adds bias to the logit bias object.
     * @param {number} bias
     * @param {number[]} sequence
     * @returns {object} Accumulated logit bias object
     */
    function addBias(bias: number, sequence: number[]) {
        if (sequence.length === 0) {
            return;
        }

        for (const logit of sequence) {
            const key = String(logit);
            result[key] = bias;
        }

        return result;
    }

    getLogitBiasListResult(settings.logit_bias as never[], tokenizer, addBias);

    return result;
}

/**
 *
 * @param data
 * @param loadedSettings
 */
export async function loadTextGenSettings(
    data: Record<string, unknown>,
    loadedSettings: Record<string, unknown>,
) {
    await loadApiSelectedSamplers();
    textgenerationwebui_presets = convertPresets(
        data.textgenerationwebui_presets as string[],
    ) as never[];
    textgenerationwebui_preset_names = (data.textgenerationwebui_preset_names as string[]) ?? [];
    Object.assign(
        textgenerationwebui_settings,
        (loadedSettings.textgenerationwebui_settings as Record<string, unknown>) ?? {},
    );

    if (loadedSettings.api_server_textgenerationwebui) {
        for (const type of Object.keys(SERVER_INPUTS)) {
            (textgenerationwebui_settings.server_urls as Record<string, string>)[type] =
                loadedSettings.api_server_textgenerationwebui as string;
        }
        delete loadedSettings.api_server_textgenerationwebui;
    }

    for (const [type, selector] of Object.entries(SERVER_INPUTS)) {
        const control = document.querySelector(selector);
        if (control) {
            (control as HTMLInputElement).value =
                (textgenerationwebui_settings.server_urls as Record<string, string>)[type] ?? '';
            control.addEventListener('input', function (this: HTMLInputElement) {
                (textgenerationwebui_settings.server_urls as Record<string, string>)[type] = String(
                    this.value,
                ).trim();
                saveSettingsDebounced();
            });
        }
    }

    if (loadedSettings.api_use_mancer_webui) {
        textgenerationwebui_settings.type = MANCER;
    }

    for (const name of textgenerationwebui_preset_names) {
        const option = document.createElement('option');
        option.value = name;
        option.innerText = name;
        document.getElementById('settings_preset_textgenerationwebui')?.append(option);
    }

    if (textgenerationwebui_settings.preset) {
        (document.getElementById(
            'settings_preset_textgenerationwebui',
        ) as HTMLSelectElement | null)!.value = textgenerationwebui_settings.preset as string;
    }

    for (const i of setting_names) {
        const value = textgenerationwebui_settings[i];
        setSettingByName(i, value, true);
    }

    (document.getElementById('textgen_type') as HTMLSelectElement | null)!.value =
        textgenerationwebui_settings.type as string;
    const orProviders = document.getElementById('openrouter_providers_text');
    if (orProviders) {
        (orProviders as HTMLInputElement).value = String(
            textgenerationwebui_settings.openrouter_providers ?? '',
        );
        orProviders.dispatchEvent(new Event('change'));
    }
    const orQuant = document.getElementById('openrouter_quantizations_text');
    if (orQuant) {
        (orQuant as HTMLInputElement).value = String(
            textgenerationwebui_settings.openrouter_quantizations ?? '',
        );
        orQuant.dispatchEvent(new Event('change'));
    }
    showSamplerControls(textgenerationwebui_settings.type as string);
    BIAS_CACHE.delete(BIAS_KEY);
    displayLogitBias(textgenerationwebui_settings.logit_bias as never[], BIAS_KEY);

    registerDebugFunction(
        'change-mancer-url',
        'Change Mancer base URL',
        'Change Mancer API server base URL',
        () => {
            const result = prompt(
                `Enter Mancer base URL\nDefault: ${MANCER_SERVER_DEFAULT}`,
                MANCER_SERVER,
            );

            if (result) {
                localStorage.setItem(MANCER_SERVER_KEY, result);
                MANCER_SERVER = result;
            }
        },
    );
}

/**
 * Sorts the sampler items by the given order.
 * @param {any[]} orderArray Sampler order array.
 */
function sortKoboldItemsByOrder(orderArray: number[]) {
    console.debug('Preset samplers order: ' + orderArray);
    const $draggableItems = document.getElementById('koboldcpp_order');
    if (!$draggableItems) return;

    for (let i = 0; i < orderArray.length; i++) {
        const index = orderArray[i];
        if (index === undefined) continue;
        const $item = $draggableItems.querySelector(`[data-id="${index}"]`);
        if ($item) {
            $draggableItems.appendChild($item);
        }
    }
}

/**
 *
 * @param orderArray
 */
function sortLlamacppItemsByOrder(orderArray: string[]) {
    console.debug('Preset samplers order: ', orderArray);
    const $container = document.getElementById('llamacpp_samplers_sortable');
    if (!$container) return;

    orderArray.forEach((name) => {
        const $item = $container.querySelector(`[data-name="${name}"]`);
        if ($item) $container.appendChild($item);
    });
}

/**
 *
 * @param orderArray
 */
function sortOobaItemsByOrder(orderArray: string[]) {
    console.debug('Preset samplers order: ', orderArray);
    const $container = document.getElementById('sampler_priority_container');
    if (!$container) return;

    orderArray.forEach((name) => {
        const $item = $container.querySelector(`[data-name="${name}"]`);
        if ($item) $container.appendChild($item);
    });
}

/**
 * Sorts the Aphrodite sampler items by the given order.
 * @param {string[]} orderArray Sampler order array.
 */
function sortAphroditeItemsByOrder(orderArray: string[]) {
    console.debug('Preset samplers order: ', orderArray);
    const $container = document.getElementById('sampler_priority_container_aphrodite');
    if (!$container) return;

    orderArray.forEach((name) => {
        const $item = $container.querySelector(`[data-name="${name}"]`);
        if ($item) $container.appendChild($item);
    });
}

/**
 *
 */
async function getStatusTextgen() {
    const url = '/api/backends/text-completions/status';

    const endpoint = getTextGenServer();

    if (!endpoint) {
        console.warn('No endpoint for status check');
        setOnlineStatus('no_connection');
        return resultCheckStatus();
    }

    // Clear logit bias cache
    BIAS_CACHE.delete(BIAS_KEY);

    if (
        [textgen_types.GENERIC, textgen_types.OOBA].includes(
            textgenerationwebui_settings.type as string,
        ) &&
        textgenerationwebui_settings.bypass_status_check
    ) {
        setOnlineStatus(t`Status check bypassed`);
        return resultCheckStatus();
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                api_server: endpoint,
                api_type: textgenerationwebui_settings.type,
            }),
            signal: abortStatusCheck.signal,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = (await response.json()) as Record<string, unknown>;
        if (textgenerationwebui_settings.type === textgen_types.MANCER) {
            loadMancerModels(data?.data as ApiModel[]);
            setOnlineStatus(textgenerationwebui_settings.mancer_model as string);
        } else if (textgenerationwebui_settings.type === textgen_types.TOGETHERAI) {
            loadTogetherAIModels(data?.data as ApiModel[]);
            setOnlineStatus(textgenerationwebui_settings.togetherai_model as string);
        } else if (textgenerationwebui_settings.type === textgen_types.OLLAMA) {
            loadOllamaModels(data?.data as ApiModel[]);
            setOnlineStatus((textgenerationwebui_settings.ollama_model as string) || t`Connected`);
        } else if (textgenerationwebui_settings.type === textgen_types.INFERMATICAI) {
            loadInfermaticAIModels(data?.data as ApiModel[]);
            setOnlineStatus(textgenerationwebui_settings.infermaticai_model as string);
        } else if (textgenerationwebui_settings.type === textgen_types.DREAMGEN) {
            loadDreamGenModels(data?.data as ApiModel[]);
            setOnlineStatus(textgenerationwebui_settings.dreamgen_model as string);
        } else if (textgenerationwebui_settings.type === textgen_types.OPENROUTER) {
            loadOpenRouterModels(data?.data as ApiModel[]);
            setOnlineStatus(textgenerationwebui_settings.openrouter_model as string);
        } else if (textgenerationwebui_settings.type === textgen_types.VLLM) {
            loadVllmModels(data?.data as ApiModel[]);
            setOnlineStatus(textgenerationwebui_settings.vllm_model as string);
        } else if (textgenerationwebui_settings.type === textgen_types.APHRODITE) {
            loadAphroditeModels(data?.data as ApiModel[]);
            setOnlineStatus(textgenerationwebui_settings.aphrodite_model as string);
        } else if (textgenerationwebui_settings.type === textgen_types.FEATHERLESS) {
            loadFeatherlessModels(data?.data as ApiModel[]);
            setOnlineStatus(textgenerationwebui_settings.featherless_model as string);
        } else if (textgenerationwebui_settings.type === textgen_types.TABBY) {
            loadTabbyModels(data?.data as ApiModel[]);
            setOnlineStatus(
                (textgenerationwebui_settings.tabby_model as string) || (data?.result as string),
            );
        } else if (textgenerationwebui_settings.type === textgen_types.LLAMACPP) {
            loadLlamaCppModels(data?.data as ApiModel[]);
            setOnlineStatus(
                (textgenerationwebui_settings.llamacpp_model as string) ||
                    (data?.result as string) ||
                    t`Connected`,
            );
        } else if (textgenerationwebui_settings.type === textgen_types.GENERIC) {
            loadGenericModels(data?.data as ApiModel[]);
            setOnlineStatus(
                (textgenerationwebui_settings.generic_model as string) ||
                    (data?.result as string) ||
                    t`Connected`,
            );
        } else {
            setOnlineStatus(data?.result as string);
        }

        if (!online_status) {
            setOnlineStatus('no_connection');
        }

        power_user.chat_template_hash = '';

        // Determine instruct mode preset
        const autoSelected = autoSelectInstructPreset(online_status);

        const supportsTokenization = response.headers.get('x-supports-tokenization') === 'true';
        if (supportsTokenization) {
            sessionStorage.setItem(TOKENIZER_SUPPORTED_KEY, 'true');
        } else {
            sessionStorage.removeItem(TOKENIZER_SUPPORTED_KEY);
        }

        const wantsInstructDerivation =
            !autoSelected && power_user.instruct.enabled && power_user.instruct_derived;
        const wantsContextDerivation = !autoSelected && power_user.context_derived;
        const wantsContextSize = power_user.context_size_derived;
        const supportsChatTemplate = [textgen_types.KOBOLDCPP, textgen_types.LLAMACPP].includes(
            textgenerationwebui_settings.type as string,
        );

        if (
            supportsChatTemplate &&
            (wantsInstructDerivation || wantsContextDerivation || wantsContextSize)
        ) {
            const model =
                textgenerationwebui_settings.type === textgen_types.LLAMACPP
                    ? (textgenerationwebui_settings.llamacpp_model as string)
                    : undefined;

            const response = await fetch('/api/backends/text-completions/props', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({
                    api_server: endpoint,
                    api_type: textgenerationwebui_settings.type,
                    model: model,
                }),
            });

            if (response.ok) {
                const data = (await response.json()) as Record<string, unknown>;
                if (data) {
                    const { chat_template, chat_template_hash } = data as {
                        chat_template: string;
                        chat_template_hash: string;
                    };
                    power_user.chat_template_hash = chat_template_hash;

                    if (wantsContextSize && 'default_generation_settings' in data) {
                        const backend_max_context = (
                            data.default_generation_settings as Record<string, unknown>
                        ).n_ctx as number | undefined;
                        if (backend_max_context && typeof backend_max_context === 'number') {
                            const old_value = max_context;
                            if (max_context !== backend_max_context) {
                                setGenerationParamsFromPreset({ max_length: backend_max_context });
                            }
                            if (old_value !== max_context) {
                                console.log(
                                    `Auto-switched max context from ${old_value} to ${max_context}`,
                                );
                                notyf.info(`${old_value} ⇒ ${max_context}`, 'Context Size Changed');
                            }
                        }
                    }
                    console.log(`We have chat template ${chat_template.split('\n')[0]}...`);
                    const savedTemplate = (
                        power_user.model_templates_mappings as Record<string, unknown>
                    )[chat_template_hash] as Record<string, unknown> | undefined;
                    const derivedTemplate = await deriveTemplatesFromChatTemplate(
                        chat_template,
                        chat_template_hash,
                    );
                    const { context, instruct } = (savedTemplate ?? derivedTemplate) as {
                        context?: string;
                        instruct?: string;
                    };

                    if (wantsContextDerivation && context) {
                        selectContextPreset(context, { isAuto: true });
                    }
                    if (wantsInstructDerivation && power_user.instruct.enabled && instruct) {
                        selectInstructPreset(instruct, { isAuto: true });
                    }
                }
            }
        }

        // We didn't get a 200 status code, but the endpoint has an explanation. Which means it DID connect, but I digress.
        if (online_status === 'no_connection' && (data as Record<string, unknown>).response) {
            notyf.error((data as Record<string, unknown>).response as string, t`API Error`, {
                timeOut: 5000,
                preventDuplicates: true,
            });
        }
    } catch (err) {
        if (err instanceof AbortReason) {
            console.info('Status check aborted.', (err as AbortReason).reason);
        } else {
            console.error('Error getting status', err);
        }
        setOnlineStatus('no_connection');
    }

    return resultCheckStatus();
}

/**
 *
 */
export function initTextGenSettings() {
    document
        .getElementById('send_banned_tokens_textgenerationwebui')
        ?.addEventListener('change', function (this: HTMLInputElement) {
            const checked = !!this.checked;
            toggleBannedStringsKillSwitch(
                checked,
                checked
                    ? t`Banned tokens/strings are being sent in the request.`
                    : t`Banned tokens/strings are NOT being sent in the request.`,
            );
        });

    new Sortable(document.getElementById('koboldcpp_order'), {
        delay: getSortableDelay(),
        onEnd: function () {
            const order: (string | undefined)[] = [];
            document
                .querySelectorAll('#koboldcpp_order > *')
                .forEach((el) => order.push((el as HTMLElement).dataset.id));
            textgenerationwebui_settings.sampler_order = order;
            console.log('Samplers reordered:', textgenerationwebui_settings.sampler_order);
            saveSettingsDebounced();
        },
    });

    document.getElementById('koboldcpp_default_order')?.addEventListener('click', function () {
        textgenerationwebui_settings.sampler_order = KOBOLDCPP_ORDER;
        sortKoboldItemsByOrder(textgenerationwebui_settings.sampler_order as number[]);
        saveSettingsDebounced();
    });

    new Sortable(document.getElementById('llamacpp_samplers_sortable'), {
        delay: getSortableDelay(),
        onEnd: function () {
            const order: (string | undefined)[] = [];
            document
                .querySelectorAll('#llamacpp_samplers_sortable > *')
                .forEach((el) => order.push((el as HTMLElement).dataset.name));
            textgenerationwebui_settings.samplers = order;
            console.log('Samplers reordered:', textgenerationwebui_settings.samplers);
            saveSettingsDebounced();
        },
    });

    document
        .getElementById('llamacpp_samplers_default_order')
        ?.addEventListener('click', function () {
            sortLlamacppItemsByOrder(LLAMACPP_DEFAULT_ORDER);
            textgenerationwebui_settings.samplers = LLAMACPP_DEFAULT_ORDER;
            console.log('Default samplers order loaded:', textgenerationwebui_settings.samplers);
            saveSettingsDebounced();
        });

    new Sortable(document.getElementById('sampler_priority_container'), {
        delay: getSortableDelay(),
        onEnd: function () {
            const order: (string | undefined)[] = [];
            document
                .querySelectorAll('#sampler_priority_container > *')
                .forEach((el) => order.push((el as HTMLElement).dataset.name));
            textgenerationwebui_settings.sampler_priority = order;
            console.log('Samplers reordered:', textgenerationwebui_settings.sampler_priority);
            saveSettingsDebounced();
        },
    });

    new Sortable(document.getElementById('sampler_priority_container_aphrodite'), {
        delay: getSortableDelay(),
        onEnd: function () {
            const order: (string | undefined)[] = [];
            document
                .querySelectorAll('#sampler_priority_container_aphrodite > *')
                .forEach((el) => order.push((el as HTMLElement).dataset.name));
            textgenerationwebui_settings.samplers_priorities = order;
            console.log('Samplers reordered:', textgenerationwebui_settings.samplers_priorities);
            saveSettingsDebounced();
        },
    });

    document
        .getElementById('tabby_json_schema')
        ?.addEventListener('input', function (this: HTMLTextAreaElement) {
            const json_schema_string = String(this.value);

            if (json_schema_string) {
                try {
                    textgenerationwebui_settings.json_schema = JSON.parse(json_schema_string);
                } catch {
                    textgenerationwebui_settings.json_schema = null;
                }
            } else {
                textgenerationwebui_settings.json_schema = null;
            }

            saveSettingsDebounced();
        });

    document
        .getElementById('textgenerationwebui_default_order')
        ?.addEventListener('click', function () {
            sortOobaItemsByOrder(OOBA_DEFAULT_ORDER);
            textgenerationwebui_settings.sampler_priority = OOBA_DEFAULT_ORDER;
            console.log(
                'Default samplers order loaded:',
                textgenerationwebui_settings.sampler_priority,
            );
            saveSettingsDebounced();
        });

    document.getElementById('aphrodite_default_order')?.addEventListener('click', function () {
        sortAphroditeItemsByOrder(APHRODITE_DEFAULT_ORDER);
        textgenerationwebui_settings.samplers_priorities = APHRODITE_DEFAULT_ORDER;
        console.log(
            'Default samplers order loaded:',
            textgenerationwebui_settings.samplers_priorities,
        );
        saveSettingsDebounced();
    });

    document
        .getElementById('textgen_type')
        ?.addEventListener('change', function (this: HTMLSelectElement) {
            const type = String(this.value);
            textgenerationwebui_settings.type = type;

            if (
                [VLLM, APHRODITE, INFERMATICAI].includes(
                    textgenerationwebui_settings.type as string,
                )
            ) {
                document
                    .getElementById('mirostat_mode_textgenerationwebui')
                    ?.setAttribute('step', '2');
                const doSampleEl = document.getElementById(
                    'do_sample_textgenerationwebui',
                ) as HTMLInputElement | null;
                if (doSampleEl) doSampleEl.checked = true;
                const banEosEl = document.getElementById(
                    'ban_eos_token_textgenerationwebui',
                ) as HTMLInputElement | null;
                if (banEosEl) banEosEl.checked = false;
                document.getElementById('top_k_textgenerationwebui')?.setAttribute('min', '-1');
                const topK = document.getElementById(
                    'top_k_textgenerationwebui',
                ) as HTMLInputElement | null;
                if (topK?.value === '0' || textgenerationwebui_settings.top_k === 0) {
                    textgenerationwebui_settings.top_k = -1;
                    if (topK) topK.value = '-1';
                    if (topK) topK.dispatchEvent(new Event('input'));
                }
            } else {
                document
                    .getElementById('mirostat_mode_textgenerationwebui')
                    ?.setAttribute('step', '1');
                document.getElementById('top_k_textgenerationwebui')?.setAttribute('min', '0');
                const topK = document.getElementById(
                    'top_k_textgenerationwebui',
                ) as HTMLInputElement | null;
                if (topK?.value === '-1' || textgenerationwebui_settings.top_k === -1) {
                    textgenerationwebui_settings.top_k = 0;
                    if (topK) topK.value = '0';
                    if (topK) topK.dispatchEvent(new Event('input'));
                }
            }

            showSamplerControls(type);
            setOnlineStatus('no_connection');
            BIAS_CACHE.delete(BIAS_KEY);

            document.getElementById('main_api')?.dispatchEvent(new Event('change'));

            if (
                !SERVER_INPUTS[type] ||
                (textgenerationwebui_settings.server_urls as Record<string, string>)[type]
            ) {
                document.getElementById('api_button_textgenerationwebui')?.click();
            }

            saveSettingsDebounced();
        });

    document
        .getElementById('settings_preset_textgenerationwebui')
        ?.addEventListener('change', async function (this: HTMLSelectElement) {
            const presetName = this.value;
            await selectPreset(presetName);
            await eventSource.emit(event_types.PRESET_CHANGED, {
                apiId: 'textgenerationwebui',
                name: presetName,
            });
        });

    const samplerResetButton = document.getElementById('samplerResetButton');
    if (samplerResetButton) {
        samplerResetButton.addEventListener('click', function () {
            const inputs: Record<string, unknown> = {
                temp_textgenerationwebui: 1,
                top_k_textgenerationwebui: [INFERMATICAI, APHRODITE, VLLM].includes(
                    textgenerationwebui_settings.type as string,
                )
                    ? -1
                    : 0,
                top_p_textgenerationwebui: 1,
                min_p_textgenerationwebui: 0,
                rep_pen_textgenerationwebui: 1,
                rep_pen_range_textgenerationwebui: 0,
                rep_pen_decay_textgenerationwebui: 0,
                dynatemp_textgenerationwebui: false,
                seed_textgenerationwebui: -1,
                ban_eos_token_textgenerationwebui: false,
                do_sample_textgenerationwebui: true,
                add_bos_token_textgenerationwebui: true,
                temperature_last_textgenerationwebui: true,
                skip_special_tokens_textgenerationwebui: true,
                include_reasoning_textgenerationwebui: true,
                top_a_textgenerationwebui: 0,
                top_a_counter_textgenerationwebui: 0,
                mirostat_mode_textgenerationwebui: 0,
                mirostat_tau_textgenerationwebui: 5,
                mirostat_eta_textgenerationwebui: 0.1,
                tfs_textgenerationwebui: 1,
                epsilon_cutoff_textgenerationwebui: 0,
                eta_cutoff_textgenerationwebui: 0,
                encoder_rep_pen_textgenerationwebui: 1,
                freq_pen_textgenerationwebui: 0,
                presence_pen_textgenerationwebui: 0,
                skew_textgenerationwebui: 0,
                no_repeat_ngram_size_textgenerationwebui: 0,
                speculative_ngram_textgenerationwebui: false,
                min_length_textgenerationwebui: 0,
                num_beams_textgenerationwebui: 1,
                length_penalty_textgenerationwebui: 1,
                penalty_alpha_textgenerationwebui: 0,
                typical_p_textgenerationwebui: 1,
                guidance_scale_textgenerationwebui: 1,
                smoothing_factor_textgenerationwebui: 0,
                smoothing_curve_textgenerationwebui: 1,
                dry_allowed_length_textgenerationwebui: 2,
                dry_multiplier_textgenerationwebui: 0,
                dry_base_textgenerationwebui: 1.75,
                dry_penalty_last_n_textgenerationwebui: 0,
                xtc_threshold_textgenerationwebui: 0.1,
                xtc_probability_textgenerationwebui: 0,
                nsigma_textgenerationwebui: 0,
                min_keep_textgenerationwebui: 0,
                adaptive_target_textgenerationwebui: -0.01,
                adaptive_decay_textgenerationwebui: 0.9,
            };

            for (const [id, value] of Object.entries(inputs)) {
                const inputElement = document.getElementById(id);
                if (!inputElement) continue;
                const valueToSet = typeof value === 'boolean' ? String(value) : value;
                if (inputElement.getAttribute('type') === 'checkbox') {
                    if (inputElement instanceof HTMLInputElement)
                        inputElement.checked = Boolean(value);
                    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                } else if (inputElement.getAttribute('type') === 'number') {
                    if (inputElement instanceof HTMLInputElement)
                        inputElement.value = String(valueToSet);
                    inputElement.dispatchEvent(new Event('input'));
                } else {
                    if (
                        inputElement instanceof HTMLInputElement ||
                        inputElement instanceof HTMLTextAreaElement
                    )
                        inputElement.value = String(valueToSet);
                    inputElement.dispatchEvent(new Event('input'));
                    if (power_user.enableZenSliders) {
                        const masterElementID = inputElement.id;
                        console.log(masterElementID);
                        const zenEl = document.getElementById(`${masterElementID}_zenslider`);
                        if ((zenEl as unknown as Record<string, unknown>)?.noUiSlider) {
                            (
                                (zenEl as unknown as Record<string, unknown>).noUiSlider as {
                                    set: (v: number | number[]) => void;
                                }
                            ).set?.(value as number);
                        }
                    }
                }
            }
        });
    }

    for (const i of setting_names) {
        const settingEl = document.getElementById(`${i}_textgenerationwebui`);
        if (settingEl) settingEl.setAttribute('x-setting-id', i);
        document.addEventListener('input', function (e: Event) {
            const target =
                e.target instanceof Element ? e.target.closest(`#${i}_textgenerationwebui`) : null;
            if (!target) return;
            const isCheckbox = target.getAttribute('type') == 'checkbox';
            const isText =
                target.getAttribute('type') == 'text' ||
                target instanceof HTMLTextAreaElement ||
                target?.tagName === 'TEXTAREA';
            const id = target.getAttribute('x-setting-id');

            if (isCheckbox) {
                const value = target instanceof HTMLInputElement ? target.checked : false;
                if (id) textgenerationwebui_settings[id] = value;
            } else if (isText) {
                const value =
                    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
                        ? target.value
                        : '';
                if (id) textgenerationwebui_settings[id] = value;
            } else {
                const value =
                    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
                        ? Number(target.value)
                        : 0;
                const counterEl = document.getElementById(
                    `${id}_counter_textgenerationwebui`,
                ) as HTMLInputElement | null;
                if (counterEl instanceof HTMLInputElement) counterEl.value = String(value);
                if (id) textgenerationwebui_settings[id] = value;
                //special handling for vLLM/Aphrodite using -1 as disabled instead of 0
                if (
                    target.getAttribute('id') === 'top_k_textgenerationwebui' &&
                    [INFERMATICAI, APHRODITE, VLLM].includes(
                        textgenerationwebui_settings.type as string,
                    ) &&
                    value === 0
                ) {
                    if (id) textgenerationwebui_settings[id] = -1;
                    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
                        target.value = '-1';
                }
            }
            saveSettingsDebounced();
        });
    }

    document
        .getElementById('textgen_logit_bias_new_entry')
        ?.addEventListener('click', () =>
            createNewLogitBiasEntry(textgenerationwebui_settings.logit_bias as never[], BIAS_KEY),
        );

    document
        .getElementById('openrouter_providers_text')
        ?.addEventListener('change', function (this: HTMLSelectElement) {
            const selectedProviders = this.value;

            // Not a multiple select?
            if (!Array.isArray(selectedProviders)) {
                return;
            }

            textgenerationwebui_settings.openrouter_providers = selectedProviders;

            updateOpenRouterProvidersWarning('#openrouter_providers_text');
            saveSettingsDebounced();
        });

    document
        .getElementById('openrouter_allow_fallbacks_textgenerationwebui')
        ?.addEventListener('input', function () {
            updateOpenRouterProvidersWarning('#openrouter_providers_text');
        });

    document
        .getElementById('openrouter_quantizations_text')
        ?.addEventListener('change', function (this: HTMLSelectElement) {
            const selectedQuantizations = this.value;

            // Not a multiple select?
            if (!Array.isArray(selectedQuantizations)) {
                return;
            }

            textgenerationwebui_settings.openrouter_quantizations = selectedQuantizations;

            saveSettingsDebounced();
        });

    document
        .getElementById('api_button_textgenerationwebui')
        ?.addEventListener('click', async function () {
            const keys = [
                { id: 'api_key_mancer', secret: SECRET_KEYS.MANCER },
                { id: 'api_key_vllm', secret: SECRET_KEYS.VLLM },
                { id: 'api_key_aphrodite', secret: SECRET_KEYS.APHRODITE },
                { id: 'api_key_tabby', secret: SECRET_KEYS.TABBY },
                { id: 'api_key_togetherai', secret: SECRET_KEYS.TOGETHERAI },
                { id: 'api_key_ooba', secret: SECRET_KEYS.OOBA },
                { id: 'api_key_infermaticai', secret: SECRET_KEYS.INFERMATICAI },
                { id: 'api_key_dreamgen', secret: SECRET_KEYS.DREAMGEN },
                { id: 'api_key_openrouter-tg', secret: SECRET_KEYS.OPENROUTER },
                { id: 'api_key_koboldcpp', secret: SECRET_KEYS.KOBOLDCPP },
                { id: 'api_key_llamacpp', secret: SECRET_KEYS.LLAMACPP },
                { id: 'api_key_featherless', secret: SECRET_KEYS.FEATHERLESS },
                { id: 'api_key_huggingface', secret: SECRET_KEYS.HUGGINGFACE },
                { id: 'api_key_generic', secret: SECRET_KEYS.GENERIC },
            ];

            for (const key of keys) {
                const keyValue = String(
                    document.getElementById(key.id) instanceof HTMLInputElement
                        ? (document.getElementById(key.id) as HTMLInputElement).value
                        : '',
                ).trim();
                if (keyValue.length) {
                    await writeSecret(key.secret!, keyValue, '');
                }
            }

            validateTextGenUrl();
            startStatusLoading();
            saveSettingsDebounced();
            getStatusTextgen();
        });
}

/**
 * Hides and shows preset samplers from the left panel.
 * @param {string?} apiType API Type selected in API Connections - Currently selected one by default
 * @returns void
 */
function showSamplerControls(apiType: string | null = null) {
    document
        .querySelectorAll(
            '#textgenerationwebui_api-settings [data-tg-samplers], #textgenerationwebui_api [data-tg-samplers]',
        )
        .forEach((el) => {
            const typeSpecificControlled = (el as HTMLElement).dataset.tgType !== undefined;
            if (!typeSpecificControlled) (el as HTMLElement).style.display = '';
        });

    showTypeSpecificControls(apiType ?? (textgenerationwebui_settings.type as string));

    const prioritizeManualSamplerSelect = isSamplerManualPriorityEnabled(
        apiType ?? (textgenerationwebui_settings.type as string),
    );
    const samplersActivatedManually = getActiveManualApiSamplers(
        apiType ?? (textgenerationwebui_settings.type as string),
    );

    if (!samplersActivatedManually?.length || !prioritizeManualSamplerSelect) return;

    document
        .querySelectorAll(
            '#textgenerationwebui_api-settings [data-tg-samplers], #textgenerationwebui_api [data-tg-samplers]',
        )
        .forEach((el) => {
            const tgSamplersRaw = el.getAttribute('data-tg-samplers');
            if (!tgSamplersRaw) return;
            const tgSamplers = tgSamplersRaw
                .split(',')
                .map((x) => x.trim())
                .filter((str) => str !== '');

            for (const tgSampler of tgSamplers) {
                if (samplersActivatedManually.includes(tgSampler)) {
                    (el as HTMLElement).style.display = '';
                    return;
                } else {
                    (el as HTMLElement).style.display = 'none';
                }
            }
        });
}

/**
 *
 * @param apiType
 */
function showTypeSpecificControls(apiType: string) {
    document.querySelectorAll('[data-tg-type]').forEach((el) => {
        const mode = String(el.getAttribute('data-tg-type-mode') ?? '')
            .toLowerCase()
            .trim();
        const tgTypesRaw = el.getAttribute('data-tg-type');
        if (!tgTypesRaw) return;
        const tgTypes = tgTypesRaw.split(',').map((x) => x.trim());

        if (mode === 'except') {
            (el as HTMLElement).style.display = tgTypes.includes(apiType) ? 'none' : '';
            return;
        }

        for (const tgType of tgTypes) {
            if (tgType === apiType || tgType == 'all') {
                (el as HTMLElement).style.display = '';
                return;
            } else {
                (el as HTMLElement).style.display = 'none';
            }
        }
    });
}

/**
 * Inserts missing items from the source array into the target array.
 * @param {any[]} source - Source array
 * @param {any[]} target - Target array
 * @returns {void}
 */
function insertMissingArrayItems(source: unknown[], target: unknown[]) {
    if (source === target || !Array.isArray(source) || !Array.isArray(target)) {
        return;
    }

    for (const item of source) {
        if (!target.includes(item)) {
            const index = source.indexOf(item);
            target.splice(index, 0, item);
        }
    }
}

/**
 *
 * @param setting
 * @param value
 * @param trigger
 */
function setSettingByName(setting: string, value: unknown, trigger?: boolean) {
    if ('extensions' === setting) {
        value = value || {};
        textgenerationwebui_settings.extensions = value;
        return;
    }

    if ('json_schema' === setting) {
        textgenerationwebui_settings.json_schema = value ?? null;
        const tabbyEl = document.getElementById('tabby_json_schema') as HTMLInputElement | null;
        if (tabbyEl)
            tabbyEl.value = value
                ? JSON.stringify(textgenerationwebui_settings.json_schema, null, 2)
                : '';
        return;
    }

    if (value === null || value === undefined) {
        return;
    }

    if ('sampler_order' === setting) {
        value = Array.isArray(value) ? value : KOBOLDCPP_ORDER;
        sortKoboldItemsByOrder(value as number[]);
        textgenerationwebui_settings.sampler_order = value;
        return;
    }

    if ('sampler_priority' === setting) {
        value = Array.isArray(value) ? value : OOBA_DEFAULT_ORDER;
        insertMissingArrayItems(OOBA_DEFAULT_ORDER, value as string[]);
        sortOobaItemsByOrder(value as string[]);
        textgenerationwebui_settings.sampler_priority = value;
        return;
    }

    if ('samplers_priorities' === setting) {
        value = Array.isArray(value) ? value : APHRODITE_DEFAULT_ORDER;
        insertMissingArrayItems(APHRODITE_DEFAULT_ORDER, value as string[]);
        sortAphroditeItemsByOrder(value as string[]);
        textgenerationwebui_settings.samplers_priorities = value;
        return;
    }

    if ('samplers' === setting) {
        value = Array.isArray(value) ? value : LLAMACPP_DEFAULT_ORDER;
        insertMissingArrayItems(LLAMACPP_DEFAULT_ORDER, value as string[]);
        sortLlamacppItemsByOrder(value as string[]);
        textgenerationwebui_settings.samplers = value;
        return;
    }

    if ('logit_bias' === setting) {
        textgenerationwebui_settings.logit_bias = Array.isArray(value) ? value : [];
        return;
    }

    const checkboxEl = document.getElementById(`${setting}_textgenerationwebui`);
    if (!checkboxEl) return;
    const isCheckbox = checkboxEl.getAttribute('type') == 'checkbox';
    const isText = checkboxEl.getAttribute('type') == 'text' || checkboxEl?.tagName === 'TEXTAREA';
    if (isCheckbox) {
        const val = Boolean(value);
        if (checkboxEl instanceof HTMLInputElement) checkboxEl.checked = val;

        if ('send_banned_tokens' === setting) {
            checkboxEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
    } else if (isText) {
        if (checkboxEl instanceof HTMLInputElement || checkboxEl instanceof HTMLTextAreaElement)
            checkboxEl.value = String(value);
    } else {
        const val = Number(value);
        if (checkboxEl instanceof HTMLInputElement) checkboxEl.value = String(val);
        const counterNumEl = document.getElementById(
            `${setting}_counter_textgenerationwebui`,
        ) as HTMLInputElement | null;
        if (counterNumEl instanceof HTMLInputElement) counterNumEl.value = String(val);
        if (power_user.enableZenSliders) {
            const zenEl = document.getElementById(`${setting}_textgenerationwebui_zenslider`);
            if ((zenEl as unknown as Record<string, unknown>)?.noUiSlider) {
                (
                    (zenEl as unknown as Record<string, unknown>).noUiSlider as {
                        set: (v: number | number[]) => void;
                    }
                ).set?.(val);
            }
        }
    }

    if (trigger) {
        checkboxEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

/**
 * Sends a streaming request for textgenerationwebui.
 * @param {object} generate_data
 * @param {AbortSignal} signal
 * @returns {Promise<(function(): AsyncGenerator<{swipes: [], text: string, toolCalls: [], logprobs: {token: string, topLogprobs: Candidate[]}|null}, void, *>)|*>}
 * @throws {Error} - If the response status is not OK, or from within the generator
 */
export async function generateTextGenWithStreaming(
    generate_data: Record<string, unknown>,
    signal: AbortSignal,
) {
    generate_data.stream = true;

    const response = await fetch('/api/backends/text-completions/generate', {
        headers: {
            ...getRequestHeaders(),
        },
        body: JSON.stringify(generate_data),
        method: 'POST',
        signal: signal,
    });

    if (!response.ok) {
        tryParseStreamingError(response, await response.text());
        throw new Error(`Got response status ${response.status}`);
    }

    const eventStream = getEventSourceStream();
    if (!response.body) throw new Error('Response body is null');
    response.body.pipeThrough(eventStream as unknown as TransformStream<Uint8Array, Uint8Array>);
    const reader = eventStream.readable!.getReader() as ReadableStreamDefaultReader<{
        data: string;
    }>;

    return async function* streamData() {
        let text = '';
        /** @type {import('./logprobs.js').TokenLogprobs | null} */
        let logprobs: unknown = null;
        const swipes: string[] = [];
        const toolCalls: unknown[] = [];
        const state: Record<string, string> = { reasoning: '' };
        while (true) {
            const { done, value } = await reader.read();
            if (done) return;
            if (value.data === '[DONE]') return;

            tryParseStreamingError(response, value.data);

            const data = JSON.parse(value.data) as Record<string, unknown>;

            const choices = data?.choices as Record<string, unknown>[] | undefined;
            if ((choices?.[0]?.index as number) > 0) {
                const swipeIndex = (choices![0]!.index as number) - 1;
                swipes[swipeIndex] =
                    (swipes[swipeIndex] || '') + (choices![0]!.text as string) || '';
            } else if ((data?.index as number) > 0) {
                // llama.cpp streaming swipe
                const swipeIndex = (data.index as number) - 1;
                swipes[swipeIndex] = (swipes[swipeIndex] || '') + (data.content as string) || '';
            } else {
                const newText = (choices?.[0]?.text as string) || (data?.content as string) || '';
                text += newText;
                logprobs = parseTextgenLogprobs(
                    newText,
                    (data.choices as Record<string, unknown>[] | undefined)?.[0]?.logprobs ||
                        data?.completion_probabilities,
                );
                state.reasoning +=
                    ((data?.choices as Record<string, unknown>[] | undefined)?.[0]
                        ?.reasoning as string) ??
                    ((data?.choices as Record<string, unknown>[] | undefined)?.[0]
                        ?.thinking as string) ??
                    '';
            }

            yield { text, swipes, logprobs, toolCalls, state };
        }
    };
}

/**
 * parseTextgenLogprobs converts a logprobs object returned from a textgen API
 * for a single token into a TokenLogprobs object used by the Token
 * Probabilities feature.
 * @param {string} token - the text of the token that the logprobs are for
 * @param {object} logprobs - logprobs object returned from the API
 * @returns {import('./logprobs.js').TokenLogprobs | null} - converted logprobs
 */
export function parseTextgenLogprobs(token: string, logprobs: unknown) {
    if (!logprobs) {
        return null;
    }

    switch (textgenerationwebui_settings.type as string) {
        case KOBOLDCPP:
        case TABBY:
        case VLLM:
        case APHRODITE:
        case MANCER:
        case INFERMATICAI:
        case OOBA: {
            /** @type {Record<string, number>[]} */
            const topLogprobs = (logprobs as Record<string, unknown>).top_logprobs as
                | Record<string, number>[]
                | undefined;
            if (!topLogprobs?.length) {
                return null;
            }
            const candidates = Object.entries(topLogprobs[0]!);
            return { token, topLogprobs: candidates };
        }
        case LLAMACPP: {
            const lpArray = logprobs as Record<string, unknown>[] | undefined;
            if (!lpArray?.length) {
                return null;
            }

            if (lpArray?.[0]?.probs) {
                const candidates = (
                    lpArray?.[0]?.probs as Array<Record<string, unknown>> | undefined
                )?.map((x) => [x.tok_str, x.prob]);
                if (!candidates) {
                    return null;
                }
                return { token, topLogprobs: candidates };
            } else if (lpArray?.[0]?.top_logprobs) {
                const candidates = (
                    lpArray?.[0]?.top_logprobs as Array<Record<string, unknown>> | undefined
                )?.map((x) => [x.token, Math.exp(x.logprob as number)]);
                if (!candidates) {
                    return null;
                }
                return { token, topLogprobs: candidates };
            }
            return null;
        }
        default:
            return null;
    }
}

/**
 *
 * @param data
 */
export function parseTabbyLogprobs(data: Record<string, unknown>) {
    const choices = data?.choices as Record<string, unknown>[] | undefined;
    const text = choices?.[0]?.text as string | undefined;
    const logprobsContainer = choices?.[0]?.logprobs as Record<string, unknown> | undefined;
    const offsets = logprobsContainer?.text_offset as number[] | undefined;

    if (!text || !offsets) {
        return null;
    }

    // Convert string offsets list to tokens
    const tokens = offsets?.map((_offset: number, index: number) => {
        const nextOffset = offsets[index + 1] || text.length;
        return text.substring(offsets[index]!, nextOffset);
    });

    const topLogprobs = (
        (logprobsContainer as unknown as Record<string, unknown>)?.top_logprobs as Record<
            string,
            unknown
        >[]
    )?.map((x: Record<string, unknown>) => ({ top_logprobs: [x] }));
    return (
        tokens?.map((token: string, index: number) =>
            parseTextgenLogprobs(token, topLogprobs?.[index]),
        ) || null
    );
}

/**
 * Parses errors in streaming responses and displays them in toastr.
 * @param {Response} response - Response from the server.
 * @param {string} decoded - Decoded response body.
 * @returns {void} Nothing.
 * @throws {Error} If the response contains an error message, throws Error with the message.
 */
function tryParseStreamingError(response: Response, decoded: string) {
    let data: Record<string, unknown> = {};

    try {
        data = JSON.parse(decoded);
    } catch {
        // No JSON. Do nothing.
    }

    const d = data as Record<string, unknown>;
    const message =
        ((d?.error as Record<string, unknown>)?.message as string) ||
        (d?.error as string) ||
        (d?.message as string) ||
        (d?.detail as string);

    if (message) {
        notyf.error(message as string, 'Text Completion API');
        throw new Error(message as string);
    }
}

/**
 * Converts a string of comma-separated integers to an array of integers.
 * @param {string} string Input string
 * @returns {number[]} Array of integers
 */
function toIntArray(string: string) {
    if (!string) {
        return [];
    }

    return string
        .split(',')
        .map((x) => parseInt(x))
        .filter((x) => !isNaN(x));
}

/**
 * Gets the text generation model specified by the given text completion settings
 * @param {TextCompletionSettings} settings Text completion settings to use
 * @returns {string} model name
 */
export function getTextGenModel(settings: Record<string, unknown> | null = null) {
    settings = settings ?? textgenerationwebui_settings;
    switch (settings.type as string) {
        case OOBA:
            if (settings.custom_model as string) {
                return settings.custom_model as string;
            }
            break;
        case GENERIC:
            if (settings.generic_model as string) {
                return settings.generic_model as string;
            }
            break;
        case MANCER:
            return settings.mancer_model as string;
        case TOGETHERAI:
            return settings.togetherai_model as string;
        case INFERMATICAI:
            return settings.infermaticai_model as string;
        case DREAMGEN:
            return settings.dreamgen_model as string;
        case OPENROUTER:
            return settings.openrouter_model as string;
        case VLLM:
            return settings.vllm_model as string;
        case APHRODITE:
            return settings.aphrodite_model as string;
        case OLLAMA:
            if (!settings.ollama_model) {
                notyf.error(t`No Ollama model selected.`, 'Text Completion API');
                throw new Error('No Ollama model selected');
            }
            return settings.ollama_model as string;
        case FEATHERLESS:
            return settings.featherless_model as string;
        case HUGGINGFACE:
            return 'tgi';
        case TABBY:
            if (settings.tabby_model as string) {
                return settings.tabby_model as string;
            }
            break;
        case LLAMACPP:
            if (settings.llamacpp_model as string) {
                return settings.llamacpp_model as string;
            }
            break;
        default:
            return undefined as unknown as string;
    }

    return undefined as unknown as string;
}

/**
 *
 */
export function isJsonSchemaSupported() {
    return (
        [TABBY, LLAMACPP].includes(textgenerationwebui_settings.type as string) &&
        main_api === 'textgenerationwebui'
    );
}

/**
 * Returns whether dynamic temperature is supported by the given text completion settings
 * @param {TextCompletionSettings} settings Text completion settings to use
 * @returns {boolean} Whether dynamic temperature supported
 */
function isDynamicTemperatureSupported(settings: Record<string, unknown> | null = null) {
    settings = settings ?? textgenerationwebui_settings;
    return (
        (settings.dynatemp as boolean) &&
        (DYNATEMP_BLOCK?.dataset?.tgType?.includes(settings.type as string) ?? false)
    );
}

/**
 * Gets the number of logprobs to request based on the selected type.
 * @param {string} type If it's set, ignores active type
 * @returns {number} Number of logprobs to request
 */
export function getLogprobsNumber(type: string | null = null) {
    const selectedType = type ?? (textgenerationwebui_settings.type as string);
    if (selectedType === VLLM || selectedType === INFERMATICAI) {
        return 5;
    }

    return 10;
}

/**
 * Replaces {{macro}} in a comma-separated or serialized JSON array string.
 * @param {string} str Input string
 * @returns {string} Output string
 */
export function replaceMacrosInList(str: string) {
    if (!str || typeof str !== 'string') {
        return str;
    }

    try {
        const array = JSON.parse(str);
        if (!Array.isArray(array)) {
            throw new Error('Not an array');
        }
        for (let i = 0; i < array.length; i++) {
            array[i] = substituteParams(array[i]);
        }
        return JSON.stringify(array);
    } catch {
        const array = str.split(',');
        for (let i = 0; i < array.length; i++) {
            array[i] = substituteParams(array[i]);
        }
        return array.join(',');
    }
}

/**
 * Build the generation parameter object for an text completion request
 * @param {TextCompletionSettings} settings Text completion settings to use
 * @param {string} model Model to use
 * @param {string} finalPrompt The final prompt to send
 * @param {number} maxTokens Max allowed generation tokens
 * @param {boolean} isImpersonate Whether this is for an impersonation
 * @param {boolean} isContinue Whether this is for a continue
 * @param {object} cfgValues Additional parameters (guidanceScale, negativePrompt)
 * @param {string} type Request type (impersonate, quiet, continue, etc)
 * @returns {object} Final generation parameters object appropriate for the text completion source
 */
export function createTextGenGenerationData(
    settings: Record<string, unknown>,
    model: string,
    finalPrompt: string | null = null,
    maxTokens: number | null = null,
    isImpersonate = false,
    isContinue = false,
    cfgValues: Record<string, unknown> | null = null,
    type: string = 'quiet',
) {
    settings = settings ?? textgenerationwebui_settings;
    model = model ?? getTextGenModel(settings);

    const canMultiSwipe = !isContinue && !isImpersonate && type !== 'quiet';
    const dynatemp = isDynamicTemperatureSupported(settings);
    const { banned_tokens, banned_strings } = getCustomTokenBans(settings);
    const jsonSchema = isObject(settings.json_schema)
        ? settings.json_schema_allow_empty
            ? settings.json_schema
            : Object.keys(settings.json_schema as Record<string, unknown>).length > 0
              ? settings.json_schema
              : undefined
        : undefined;

    const params: Record<string, unknown> = {
        prompt: finalPrompt,
        model: model,
        max_new_tokens: maxTokens,
        max_tokens: maxTokens,
        logprobs: power_user.request_token_probabilities
            ? getLogprobsNumber(settings.type as string)
            : undefined,
        temperature: dynatemp
            ? ((settings.min_temp as number) + (settings.max_temp as number)) / 2
            : settings.temp,
        top_p: settings.top_p,
        typical_p: settings.typical_p,
        typical: settings.typical_p,
        sampler_seed: (settings.seed as number) >= 0 ? settings.seed : undefined,
        min_p: settings.min_p,
        repetition_penalty: settings.rep_pen,
        frequency_penalty: settings.freq_pen,
        presence_penalty: settings.presence_pen,
        top_k: settings.top_k,
        skew: settings.skew,
        min_length: settings.type === OOBA ? settings.min_length : undefined,
        minimum_message_content_tokens:
            settings.type === DREAMGEN ? settings.min_length : undefined,
        min_tokens: settings.min_length,
        num_beams: settings.type === OOBA ? settings.num_beams : undefined,
        length_penalty: settings.type === OOBA ? settings.length_penalty : undefined,
        early_stopping: settings.type === OOBA ? settings.early_stopping : undefined,
        add_bos_token: settings.add_bos_token,
        dynamic_temperature: dynatemp ? true : undefined,
        dynatemp_low: dynatemp ? settings.min_temp : undefined,
        dynatemp_high: dynatemp ? settings.max_temp : undefined,
        dynatemp_range: dynatemp
            ? ((settings.max_temp as number) - (settings.min_temp as number)) / 2
            : undefined,
        dynatemp_exponent: dynatemp ? settings.dynatemp_exponent : undefined,
        smoothing_factor: settings.smoothing_factor,
        smoothing_curve: settings.smoothing_curve,
        dry_allowed_length: settings.dry_allowed_length,
        dry_multiplier: settings.dry_multiplier,
        dry_base: settings.dry_base,
        dry_sequence_breakers: replaceMacrosInList(settings.dry_sequence_breakers as string),
        dry_penalty_last_n: settings.dry_penalty_last_n,
        max_tokens_second: settings.max_tokens_second,
        sampler_priority: settings.type === OOBA ? settings.sampler_priority : undefined,
        samplers: settings.type === LLAMACPP ? settings.samplers : undefined,
        stopping_strings: getStoppingStrings(isImpersonate, isContinue),
        stop: getStoppingStrings(isImpersonate, isContinue),
        truncation_length: max_context,
        ban_eos_token: settings.ban_eos_token,
        skip_special_tokens: settings.skip_special_tokens,
        include_reasoning: settings.include_reasoning,
        top_a: settings.top_a,
        tfs: settings.tfs,
        epsilon_cutoff: [OOBA, MANCER].includes(settings.type as string)
            ? settings.epsilon_cutoff
            : undefined,
        eta_cutoff: [OOBA, MANCER].includes(settings.type as string)
            ? settings.eta_cutoff
            : undefined,
        mirostat_mode: settings.mirostat_mode,
        mirostat_tau: settings.mirostat_tau,
        mirostat_eta: settings.mirostat_eta,
        custom_token_bans: [APHRODITE, MANCER].includes(settings.type as string)
            ? toIntArray(banned_tokens)
            : banned_tokens,
        banned_strings: banned_strings,
        api_type: settings.type,
        api_server: getTextGenServer(settings.type as string),
        sampler_order:
            settings.type === textgen_types.KOBOLDCPP ? settings.sampler_order : undefined,
        xtc_threshold: settings.xtc_threshold,
        xtc_probability: settings.xtc_probability,
        nsigma: settings.nsigma,
        top_n_sigma: settings.nsigma,
        min_keep: settings.min_keep,
        adaptive_target: settings.adaptive_target,
        adaptive_decay: settings.adaptive_decay,
        parseSequenceBreakers: function (this: Record<string, unknown>) {
            try {
                return JSON.parse(this.dry_sequence_breakers as string);
            } catch {
                if (typeof this.dry_sequence_breakers === 'string') {
                    return (this.dry_sequence_breakers as string).split(',');
                }
                return undefined;
            }
        },
    };
    const nonAphroditeParams: Record<string, unknown> = {
        rep_pen: settings.rep_pen,
        rep_pen_range: settings.rep_pen_range,
        repetition_decay: settings.type === TABBY ? settings.rep_pen_decay : undefined,
        repetition_penalty_range: settings.rep_pen_range,
        encoder_repetition_penalty: settings.type === OOBA ? settings.encoder_rep_pen : undefined,
        no_repeat_ngram_size: settings.type === OOBA ? settings.no_repeat_ngram_size : undefined,
        penalty_alpha: settings.type === OOBA ? settings.penalty_alpha : undefined,
        temperature_last:
            settings.type === OOBA || settings.type === APHRODITE || settings.type == TABBY
                ? settings.temperature_last
                : undefined,
        speculative_ngram: settings.type === TABBY ? settings.speculative_ngram : undefined,
        do_sample: settings.type === OOBA ? settings.do_sample : undefined,
        seed: (settings.seed as number) >= 0 ? settings.seed : undefined,
        guidance_scale:
            ((cfgValues?.guidanceScale as Record<string, unknown> | undefined)?.value as number) ??
            (settings.guidance_scale as number) ??
            1,
        negative_prompt:
            (cfgValues?.negativePrompt as string) ??
            substituteParams(settings.negative_prompt as string) ??
            '',
        grammar_string: settings.grammar_string || undefined,
        json_schema: [TABBY, LLAMACPP].includes(settings.type as string) ? jsonSchema : undefined,
        // llama.cpp aliases. In case someone wants to use LM Studio as Text Completion API
        repeat_penalty: settings.rep_pen,
        repeat_last_n: settings.rep_pen_range,
        n_predict: maxTokens,
        num_predict: maxTokens,
        num_ctx: max_context,
        mirostat: settings.mirostat_mode,
        ignore_eos: settings.ban_eos_token,
        n_probs: power_user.request_token_probabilities ? 10 : undefined,
        rep_pen_slope: settings.rep_pen_slope,
    };
    const vllmParams: Record<string, unknown> = {
        n: canMultiSwipe ? settings.n : 1,
        ignore_eos: settings.ignore_eos_token,
        spaces_between_special_tokens: settings.spaces_between_special_tokens,
        seed: (settings.seed as number) >= 0 ? settings.seed : undefined,
    };
    const aphroditeParams: Record<string, unknown> = {
        n: canMultiSwipe ? settings.n : 1,
        frequency_penalty: settings.freq_pen,
        presence_penalty: settings.presence_pen,
        repetition_penalty: settings.rep_pen,
        seed: (settings.seed as number) >= 0 ? settings.seed : undefined,
        stop: getStoppingStrings(isImpersonate, isContinue),
        temperature: dynatemp
            ? ((settings.min_temp as number) + (settings.max_temp as number)) / 2
            : settings.temp,
        temperature_last: settings.temperature_last,
        top_p: settings.top_p,
        top_k: settings.top_k,
        top_a: settings.top_a,
        min_p: settings.min_p,
        tfs: settings.tfs,
        eta_cutoff: settings.eta_cutoff,
        epsilon_cutoff: settings.epsilon_cutoff,
        typical_p: settings.typical_p,
        smoothing_factor: settings.smoothing_factor,
        smoothing_curve: settings.smoothing_curve,
        ignore_eos: settings.ignore_eos_token,
        min_tokens: settings.min_length,
        skip_special_tokens: settings.skip_special_tokens,
        spaces_between_special_tokens: settings.spaces_between_special_tokens,
        guided_grammar: settings.grammar_string || undefined,
        guided_json: jsonSchema || undefined,
        early_stopping: false, // hacks
        include_stop_str_in_output: false,
        dynatemp_min: dynatemp ? settings.min_temp : undefined,
        dynatemp_max: dynatemp ? settings.max_temp : undefined,
        dynatemp_exponent: dynatemp ? settings.dynatemp_exponent : undefined,
        xtc_threshold: settings.xtc_threshold,
        xtc_probability: settings.xtc_probability,
        nsigma: settings.nsigma,
        custom_token_bans: toIntArray(banned_tokens),
        no_repeat_ngram_size: settings.no_repeat_ngram_size,
        sampler_priority:
            settings.type === APHRODITE &&
            !arraysEqual(settings.samplers_priorities as string[], APHRODITE_DEFAULT_ORDER)
                ? settings.samplers_priorities
                : undefined,
    };

    if (settings.type === OPENROUTER) {
        params.provider = settings.openrouter_providers;
        params.quantizations = settings.openrouter_quantizations;
        params.allow_fallbacks = settings.openrouter_allow_fallbacks;
    }

    if (settings.type === KOBOLDCPP) {
        params.grammar = settings.grammar_string || undefined;
        params.grammar_retain_state = settings.grammar_string && !!isContinue ? true : undefined;
        params.trim_stop = true;
        params.dry_sequence_breakers = (params.parseSequenceBreakers as () => unknown)();
    }

    if (settings.type === HUGGINGFACE) {
        params.top_p = Math.min(Math.max(Number(params.top_p), 0.0), 0.999);
        params.stop = Array.isArray(params.stop) ? (params.stop as unknown[]).slice(0, 4) : [];
        nonAphroditeParams.seed =
            (settings.seed as number) >= 0
                ? settings.seed
                : Math.floor(Math.random() * Math.pow(2, 32));
    }

    if (settings.type === MANCER) {
        params.n = canMultiSwipe ? settings.n : 1;
        params.epsilon_cutoff = (params.epsilon_cutoff as number) / 1000;
        params.eta_cutoff = (params.eta_cutoff as number) / 1000;
        params.dynatemp_mode = params.dynamic_temperature ? 1 : 0;
        params.dynatemp_min = params.dynatemp_low;
        params.dynatemp_max = params.dynatemp_high;
        delete params.dynatemp_low;
        delete params.dynatemp_high;
        params.dry_sequence_breakers = (params.parseSequenceBreakers as () => unknown)();
    }

    if (settings.type === TABBY || settings.type === LLAMACPP) {
        params.n = canMultiSwipe ? settings.n : 1;
    }

    switch (settings.type as string) {
        case VLLM:
        case INFERMATICAI:
            Object.assign(params, vllmParams);
            break;

        case APHRODITE:
            // set params to aphroditeParams
            Object.assign(params, aphroditeParams);
            break;

        default:
            Object.assign(params, nonAphroditeParams);
            break;
    }

    if (Array.isArray(settings.logit_bias) && (settings.logit_bias as unknown[]).length) {
        const logitBias = BIAS_CACHE.get(BIAS_KEY) || calculateLogitBias(settings);
        BIAS_CACHE.set(BIAS_KEY, logitBias);
        params.logit_bias = logitBias;
    }

    if (settings.type === LLAMACPP || settings.type === OLLAMA) {
        // Convert bias and token bans to array of arrays
        const logitBiasArray: Array<[number, unknown]> =
            params.logit_bias &&
            typeof params.logit_bias === 'object' &&
            Object.keys(params.logit_bias as Record<string, unknown>).length > 0
                ? Object.entries(params.logit_bias as Record<string, unknown>).map(
                      ([key, value]) => [Number(key), value],
                  )
                : [];
        const tokenBans = toIntArray(banned_tokens);
        logitBiasArray.push(...tokenBans.map((x) => [Number(x), false] as [number, boolean]));
        const sequenceBreakers = (params.parseSequenceBreakers as () => unknown)();
        const llamaCppParams: Record<string, unknown> = {
            logit_bias: logitBiasArray,
            // Conflicts with ooba's grammar_string
            grammar: settings.grammar_string,
            cache_prompt: true,
            dry_sequence_breakers: sequenceBreakers,
        };
        Object.assign(params, llamaCppParams);
        if (!Array.isArray(sequenceBreakers) || (sequenceBreakers as unknown[]).length === 0) {
            delete params.dry_sequence_breakers;
        }
    }

    // Grammar conflicts with with json_schema
    if ([LLAMACPP, APHRODITE].includes(settings.type as string)) {
        if (jsonSchema) {
            delete params.grammar_string;
            delete params.grammar;
            delete params.guided_grammar;
        } else {
            delete params.json_schema;
            delete params.guided_json;
        }
    }
    return params;
}

/**
 *
 * @param finalPrompt
 * @param maxTokens
 * @param isImpersonate
 * @param isContinue
 * @param cfgValues
 * @param type
 */
export async function getTextGenGenerationData(
    finalPrompt: string,
    maxTokens: number,
    isImpersonate: boolean,
    isContinue: boolean,
    cfgValues: Record<string, unknown>,
    type: string,
) {
    const model = getTextGenModel(textgenerationwebui_settings);
    const params = createTextGenGenerationData(
        textgenerationwebui_settings,
        model,
        finalPrompt,
        maxTokens,
        isImpersonate,
        isContinue,
        cfgValues,
        type,
    );
    await eventSource.emit(event_types.TEXT_COMPLETION_SETTINGS_READY, params);
    return params;
}
