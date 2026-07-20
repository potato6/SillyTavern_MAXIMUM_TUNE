import {
    abortStatusCheck,
    event_types,
    eventSource,
    getRequestHeaders,
    getStoppingStrings,
    resultCheckStatus,
    saveSettingsDebounced,
    setGenerationParamsFromPreset,
    setOnlineStatus,
    startStatusLoading,
} from '../script.js';
import { MAX_CONTEXT_DEFAULT, MAX_RESPONSE_DEFAULT, power_user } from './power-user.js';
import { getTextTokens, tokenizers } from './tokenizers.js';
import { getEventSourceStream } from './sse-stream.js';
import {
    getSortableDelay,
    getStringHash,
    onlyUnique,
} from './utils.js';

declare const Sortable: new (el: HTMLElement, options: Record<string, unknown>) => unknown;
import { BIAS_CACHE, createNewLogitBiasEntry, displayLogitBias, getLogitBiasListResult } from './logit-bias.js';
import { SECRET_KEYS, secret_state, writeSecret } from './secrets.js';

const default_preamble = '[ Style: chat, complex, sensory, visceral ]';
const default_order = [1, 5, 0, 2, 3, 4];
const maximum_output_length = 150;
const default_presets = {
    'clio-v1': 'Talker-Chat-Clio',
    'kayra-v1': 'Carefree-Kayra',
    'llama-3-erato-v1': 'Erato-Dragonfruit',
};

export let novelai_settings: unknown[] = [];
export let novelai_setting_names: Record<string, number> = {};

export const nai_settings = {
    temperature: 1.5,
    repetition_penalty: 2.25,
    repetition_penalty_range: 2048,
    repetition_penalty_slope: 0.09,
    repetition_penalty_frequency: 0,
    repetition_penalty_presence: 0.005,
    tail_free_sampling: 0.975,
    top_k: 10,
    top_p: 0.75,
    top_a: 0.08,
    typical_p: 0.975,
    min_p: 0,
    math1_temp: 1,
    math1_quad: 0,
    math1_quad_entropy_scale: 0,
    min_length: 1,
    model_novel: 'clio-v1',
    preset_settings_novel: 'Talker-Chat-Clio',
    streaming_novel: false,
    preamble: default_preamble,
    prefix: '',
    banned_tokens: '',
    order: default_order,
    logit_bias: [] as number[],
    extensions: {},
};

const nai_tiers = {
    0: 'Paper',
    1: 'Tablet',
    2: 'Scroll',
    3: 'Opus',
};

const samplers = {
    temperature: 0,
    top_k: 1,
    top_p: 2,
    tfs: 3,
    top_a: 4,
    typical_p: 5,
    // removed samplers were here
    mirostat: 8,
    math1: 9,
    min_p: 10,
};

let novel_data: Record<string, unknown> | null = null;
const badWordsCache: Record<string, unknown> = {};
const BIAS_KEY = '#range_block_novel';

/**
 *
 * @param data
 */
export function setNovelData(data: Record<string, unknown>) {
    novel_data = data;
}

/**
 *
 */
export function getKayraMaxContextTokens() {
    switch (novel_data?.tier) {
        case 1:
            return 4096;
        case 2:
            return 8192;
        case 3:
            return 8192;
    }

    return null;
}

/**
 *
 */
export function getNovelMaxResponseTokens() {
    switch (novel_data?.tier) {
        case 1:
            return 150;
        case 2:
            return 150;
        case 3:
            return 250;
    }

    return maximum_output_length;
}

/**
 *
 * @param data
 */
export function convertNovelPreset(data: Record<string, unknown>) {
    if (!data || typeof data !== 'object' || (data as Record<string, unknown>).presetVersion !== 3 || !(data as Record<string, unknown>).parameters || typeof (data as Record<string, unknown>).parameters !== 'object') {
        return data;
    }

    const params = data.parameters as Record<string, unknown>;
    return {
        max_context: 8000,
        temperature: params.temperature,
        max_length: params.max_length,
        min_length: params.min_length,
        top_k: params.top_k,
        top_p: params.top_p,
        top_a: params.top_a,
        typical_p: params.typical_p,
        tail_free_sampling: params.tail_free_sampling,
        repetition_penalty: params.repetition_penalty,
        repetition_penalty_range: params.repetition_penalty_range,
        repetition_penalty_slope: params.repetition_penalty_slope,
        repetition_penalty_frequency: params.repetition_penalty_frequency,
        repetition_penalty_presence: params.repetition_penalty_presence,
        phrase_rep_pen: params.phrase_rep_pen,
        mirostat_lr: params.mirostat_lr,
        mirostat_tau: params.mirostat_tau,
        math1_temp: params.math1_temp,
        math1_quad: params.math1_quad,
        math1_quad_entropy_scale: params.math1_quad_entropy_scale,
        min_p: params.min_p,
        order: Array.isArray(params.order) ? (params.order as { enabled: boolean; id: string }[]).filter(s => s.enabled && Object.keys(samplers).includes(s.id)).map(s => (samplers as Record<string, number>)[s.id]) : default_order,
        extensions: {},
    };
}

/**
 *
 */
export function getNovelTier() {
    return (nai_tiers as Record<string, string>)[String(novel_data?.tier)] ?? 'no_connection';
}

/**
 *
 */
export function getNovelAnlas() {
    return ((novel_data as Record<string, unknown>)?.trainingStepsLeft as Record<string, unknown>)?.fixedTrainingStepsLeft ?? 0;
}

/**
 *
 */
export function getNovelUnlimitedImageGeneration() {
    return ((novel_data as Record<string, unknown>)?.perks as Record<string, unknown>)?.unlimitedImageGeneration ?? false;
}

/**
 *
 */
export async function loadNovelSubscriptionData() {
    const result = await fetch('/api/novelai/status', {
        method: 'POST',
        headers: getRequestHeaders(),
        signal: abortStatusCheck.signal,
    });

    if (result.ok) {
        const data = await result.json();
        setNovelData(data);
    }

    return result.ok;
}

/**
 *
 * @param preset
 */
interface NovelAIPreset {
    genamt?: unknown;
    max_context?: number;
    max_length?: number;
    temperature?: number;
    repetition_penalty?: number;
    repetition_penalty_range?: number;
    repetition_penalty_slope?: number;
    repetition_penalty_frequency?: number;
    repetition_penalty_presence?: number;
    tail_free_sampling?: unknown;
    top_k?: number;
    top_p?: number;
    top_a?: number;
    typical_p?: number;
    min_length?: number;
    phrase_rep_pen?: unknown;
    mirostat_lr?: unknown;
    mirostat_tau?: unknown;
    prefix?: string;
    banned_tokens?: string;
    order?: unknown[];
    logit_bias?: unknown[];
    preamble?: string;
    min_p?: number;
    math1_temp?: number;
    math1_quad?: number;
    math1_quad_entropy_scale?: number;
    extensions?: Record<string, unknown>;
}

/**
 *
 * @param preset
 */
export function loadNovelPreset(preset: NovelAIPreset) {
    if (preset.genamt === undefined) {
        const needsUnlock = (preset.max_context ?? 0) > MAX_CONTEXT_DEFAULT || (preset.max_length ?? 0) > MAX_RESPONSE_DEFAULT;
        const amountGen = document.getElementById('amount_gen') as HTMLInputElement | null;
        if (amountGen) {
            amountGen.value = String(preset.max_length);
            amountGen.dispatchEvent(new Event('input'));
        }
        const maxContextUnlocked = document.getElementById('max_context_unlocked') as HTMLInputElement | null;
        if (maxContextUnlocked) {
            maxContextUnlocked.checked = needsUnlock;
            maxContextUnlocked.dispatchEvent(new Event('change'));
        }
        const maxContext = document.getElementById('max_context') as HTMLInputElement | null;
        if (maxContext) {
            maxContext.value = String(preset.max_context);
            maxContext.dispatchEvent(new Event('input'));
        }
    } else {
        setGenerationParamsFromPreset(preset);
    }

    nai_settings.temperature = preset.temperature ?? 0;
    nai_settings.repetition_penalty = preset.repetition_penalty ?? 0;
    nai_settings.repetition_penalty_range = preset.repetition_penalty_range ?? 0;
    nai_settings.repetition_penalty_slope = preset.repetition_penalty_slope ?? 0;
    nai_settings.repetition_penalty_frequency = preset.repetition_penalty_frequency ?? 0;
    nai_settings.repetition_penalty_presence = preset.repetition_penalty_presence ?? 0;
    nai_settings.tail_free_sampling = (preset.tail_free_sampling ?? 0) as number;
    nai_settings.top_k = preset.top_k ?? 0;
    nai_settings.top_p = preset.top_p ?? 0;
    nai_settings.top_a = preset.top_a ?? 0;
    nai_settings.typical_p = preset.typical_p ?? 0;
    nai_settings.min_length = preset.min_length ?? 0;
    (nai_settings as Record<string, unknown>).phrase_rep_pen = preset.phrase_rep_pen;
    (nai_settings as Record<string, unknown>).mirostat_lr = preset.mirostat_lr;
    (nai_settings as Record<string, unknown>).mirostat_tau = preset.mirostat_tau;
    nai_settings.prefix = preset.prefix ?? '';
    nai_settings.banned_tokens = preset.banned_tokens || '';
    nai_settings.order = (preset.order || default_order) as number[];
    nai_settings.logit_bias = (preset.logit_bias || []) as unknown as number[];
    nai_settings.preamble = preset.preamble || default_preamble;
    nai_settings.min_p = preset.min_p ?? 0;
    nai_settings.math1_temp = preset.math1_temp ?? 1;
    nai_settings.math1_quad = preset.math1_quad ?? 0;
    nai_settings.math1_quad_entropy_scale = preset.math1_quad_entropy_scale ?? 0;
    nai_settings.extensions = preset.extensions || {};
    loadNovelSettingsUi(nai_settings);
}

/**
 *
 * @param data
 * @param settings
 */
export function loadNovelSettings(data: Record<string, unknown>, settings: Record<string, unknown>) {
    novelai_setting_names = data.novelai_setting_names as unknown as Record<string, number>;
    novelai_settings = data.novelai_settings as unknown[];
    novelai_settings.forEach(function (item: unknown, i: number) {
        novelai_settings[i] = JSON.parse(item as string);
    });

    const settingsPresetNovel = document.getElementById('settings_preset_novel')!;
    settingsPresetNovel.innerHTML = '';
    const presetNames: Record<string, number> = {};
    Object.keys(novelai_setting_names).forEach(function (item: string, i: number) {
        presetNames[item] = i;
        settingsPresetNovel.insertAdjacentHTML('beforeend', `<option value=${i}>${item}</option>`);
    });
    novelai_setting_names = presetNames;

    //load the rest of the Novel settings without any checks
    nai_settings.model_novel = settings.model_novel as string;
    (document.getElementById('model_novel_select') as HTMLSelectElement | null)!.value = nai_settings.model_novel;
        const selectedOption = document.querySelector(`#model_novel_select option[value="${nai_settings.model_novel}"]`);
    if (selectedOption instanceof HTMLOptionElement) selectedOption.selected = true;

    if (settings.nai_preamble !== undefined) {
        nai_settings.preamble = settings.nai_preamble as string;
        delete settings.nai_preamble;
    }
    nai_settings.preset_settings_novel = (settings.preset_settings_novel ?? '') as string;
    nai_settings.temperature = (settings.temperature ?? 0) as number;
    nai_settings.repetition_penalty = (settings.repetition_penalty ?? 0) as number;
    nai_settings.repetition_penalty_range = (settings.repetition_penalty_range ?? 0) as number;
    nai_settings.repetition_penalty_slope = (settings.repetition_penalty_slope ?? 0) as number;
    nai_settings.repetition_penalty_frequency = (settings.repetition_penalty_frequency ?? 0) as number;
    nai_settings.repetition_penalty_presence = (settings.repetition_penalty_presence ?? 0) as number;
    nai_settings.tail_free_sampling = (settings.tail_free_sampling ?? 0) as number;
    nai_settings.top_k = (settings.top_k ?? 0) as number;
    nai_settings.top_p = (settings.top_p ?? 0) as number;
    nai_settings.top_a = (settings.top_a ?? 0) as number;
    nai_settings.typical_p = (settings.typical_p ?? 0) as number;
    nai_settings.min_length = (settings.min_length ?? 0) as number;
    (nai_settings as Record<string, unknown>).phrase_rep_pen = settings.phrase_rep_pen;
    (nai_settings as Record<string, unknown>).mirostat_lr = settings.mirostat_lr;
    (nai_settings as Record<string, unknown>).mirostat_tau = settings.mirostat_tau;
    nai_settings.streaming_novel = !!settings.streaming_novel;
    nai_settings.preamble = (settings.preamble || default_preamble) as string;
    nai_settings.prefix = (settings.prefix ?? '') as string;
    nai_settings.banned_tokens = (settings.banned_tokens || '') as string;
    nai_settings.order = (settings.order || default_order) as number[];
    nai_settings.logit_bias = (settings.logit_bias || []) as never[];
    nai_settings.min_p = (settings.min_p ?? 0) as number;
    nai_settings.math1_temp = (settings.math1_temp ?? 1) as number;
    nai_settings.math1_quad = (settings.math1_quad ?? 0) as number;
    nai_settings.math1_quad_entropy_scale = (settings.math1_quad_entropy_scale ?? 0) as number;
    nai_settings.extensions = (settings.extensions || {}) as Record<string, unknown>;
    loadNovelSettingsUi(nai_settings);
}

/**
 *
 * @param ui_settings
 */
function loadNovelSettingsUi(ui_settings: Record<string, unknown>) {
    const setVal = (id: string, val: unknown) => {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (el) el.value = String(val ?? '');
    };
    setVal('temp_novel', ui_settings.temperature);
    setVal('temp_counter_novel', Number(ui_settings.temperature ?? 0).toFixed(2));
    setVal('rep_pen_novel', ui_settings.repetition_penalty);
    setVal('rep_pen_counter_novel', Number(ui_settings.repetition_penalty ?? 0).toFixed(3));
    setVal('rep_pen_size_novel', ui_settings.repetition_penalty_range);
    setVal('rep_pen_size_counter_novel', Number(ui_settings.repetition_penalty_range).toFixed(0));
    setVal('rep_pen_slope_novel', ui_settings.repetition_penalty_slope);
    setVal('rep_pen_slope_counter_novel', Number(ui_settings.repetition_penalty_slope).toFixed(2));
    setVal('rep_pen_freq_novel', ui_settings.repetition_penalty_frequency);
    setVal('rep_pen_freq_counter_novel', Number(ui_settings.repetition_penalty_frequency ?? 0).toFixed(3));
    setVal('rep_pen_presence_novel', ui_settings.repetition_penalty_presence);
    setVal('rep_pen_presence_counter_novel', Number(ui_settings.repetition_penalty_presence ?? 0).toFixed(3));
    setVal('tail_free_sampling_novel', ui_settings.tail_free_sampling);
    setVal('tail_free_sampling_counter_novel', Number(ui_settings.tail_free_sampling ?? 0).toFixed(3));
    setVal('top_k_novel', ui_settings.top_k);
    setVal('top_k_counter_novel', Number(ui_settings.top_k ?? 0).toFixed(0));
    setVal('top_p_novel', ui_settings.top_p);
    setVal('top_p_counter_novel', Number(ui_settings.top_p ?? 0).toFixed(3));
    setVal('top_a_novel', ui_settings.top_a);
    setVal('top_a_counter_novel', Number(ui_settings.top_a ?? 0).toFixed(3));
    setVal('typical_p_novel', ui_settings.typical_p);
    setVal('typical_p_counter_novel', Number(ui_settings.typical_p ?? 0).toFixed(3));
    setVal('phrase_rep_pen_novel', ui_settings.phrase_rep_pen || 'off');
    setVal('mirostat_lr_novel', ui_settings.mirostat_lr);
    setVal('mirostat_lr_counter_novel', Number(ui_settings.mirostat_lr ?? 0).toFixed(2));
    setVal('mirostat_tau_novel', ui_settings.mirostat_tau);
    setVal('mirostat_tau_counter_novel', Number(ui_settings.mirostat_tau ?? 0).toFixed(2));
    setVal('min_length_novel', ui_settings.min_length);
    setVal('min_length_counter_novel', Number(ui_settings.min_length ?? 0).toFixed(0));
    setVal('nai_preamble_textarea', ui_settings.preamble);
    setVal('nai_prefix', ui_settings.prefix || 'vanilla');
    setVal('nai_banned_tokens', ui_settings.banned_tokens || '');
    setVal('min_p_novel', ui_settings.min_p);
    setVal('min_p_counter_novel', Number(ui_settings.min_p ?? 0).toFixed(3));
    setVal('math1_temp_novel', ui_settings.math1_temp);
    setVal('math1_temp_counter_novel', Number(Number(ui_settings.math1_temp).toFixed(2)));
    setVal('math1_quad_novel', ui_settings.math1_quad);
    setVal('math1_quad_counter_novel', Number(Number(ui_settings.math1_quad).toFixed(2)));
    setVal('math1_quad_entropy_scale_novel', ui_settings.math1_quad_entropy_scale);
    setVal('math1_quad_entropy_scale_counter_novel', Number(Number(ui_settings.math1_quad_entropy_scale).toFixed(2)));
        const selectedPresetOption = document.querySelector(`#settings_preset_novel option[value="${(novelai_setting_names as Record<string, number>)[nai_settings.preset_settings_novel]}"]`);
    if (selectedPresetOption instanceof HTMLOptionElement) selectedPresetOption.selected = true;

    const streamingNovelEl = document.getElementById('streaming_novel');
    if (streamingNovelEl) (streamingNovelEl as HTMLInputElement).checked = !!ui_settings.streaming_novel;
    sortItemsByOrder(ui_settings.order as number[]);
    displayLogitBias(ui_settings.logit_bias as unknown[], BIAS_KEY);
}

interface SliderDef {
    sliderId: string;
    counterId: string;
    format: (val: unknown) => string | number;
    setValue: (val: unknown) => void;
}

const sliders: SliderDef[] = [
    {
        sliderId: '#temp_novel',
        counterId: '#temp_counter_novel',
        format: (val: unknown) => Number(val).toFixed(2),
        setValue: (val: unknown) => { nai_settings.temperature = Number(val); },
    },
    {
        sliderId: '#rep_pen_novel',
        counterId: '#rep_pen_counter_novel',
        format: (val: unknown) => Number(val).toFixed(3),
        setValue: (val: unknown) => { nai_settings.repetition_penalty = Number(val); },
    },
    {
        sliderId: '#rep_pen_size_novel',
        counterId: '#rep_pen_size_counter_novel',
        format: (val: unknown) => `${val}`,
        setValue: (val: unknown) => { nai_settings.repetition_penalty_range = Number(val); },
    },
    {
        sliderId: '#rep_pen_slope_novel',
        counterId: '#rep_pen_slope_counter_novel',
        format: (val: unknown) => `${val}`,
        setValue: (val: unknown) => { nai_settings.repetition_penalty_slope = Number(val); },
    },
    {
        sliderId: '#rep_pen_freq_novel',
        counterId: '#rep_pen_freq_counter_novel',
        format: (val: unknown) => Number(val).toFixed(2),
        setValue: (val: unknown) => { nai_settings.repetition_penalty_frequency = Number(val); },
    },
    {
        sliderId: '#rep_pen_presence_novel',
        counterId: '#rep_pen_presence_counter_novel',
        format: (val: unknown) => `${val}`,
        setValue: (val: unknown) => { nai_settings.repetition_penalty_presence = Number(val); },
    },
    {
        sliderId: '#tail_free_sampling_novel',
        counterId: '#tail_free_sampling_counter_novel',
        format: (val: unknown) => `${val}`,
        setValue: (val: unknown) => { nai_settings.tail_free_sampling = Number(val); },
    },
    {
        sliderId: '#top_k_novel',
        counterId: '#top_k_counter_novel',
        format: (val: unknown) => `${val}`,
        setValue: (val: unknown) => { nai_settings.top_k = Number(val); },
    },
    {
        sliderId: '#top_p_novel',
        counterId: '#top_p_counter_novel',
        format: (val: unknown) => Number(val).toFixed(3),
        setValue: (val: unknown) => { nai_settings.top_p = Number(val); },
    },
    {
        sliderId: '#top_a_novel',
        counterId: '#top_a_counter_novel',
        format: (val: unknown) => Number(val).toFixed(2),
        setValue: (val: unknown) => { nai_settings.top_a = Number(val); },
    },
    {
        sliderId: '#typical_p_novel',
        counterId: '#typical_p_counter_novel',
        format: (val: unknown) => Number(val).toFixed(3),
        setValue: (val: unknown) => { nai_settings.typical_p = Number(val); },
    },
    {
        sliderId: '#mirostat_tau_novel',
        counterId: '#mirostat_tau_counter_novel',
        format: (val: unknown) => Number(val).toFixed(2),
        setValue: (val: unknown) => { (nai_settings as Record<string, unknown>).mirostat_tau = Number(val); },
    },
    {
        sliderId: '#mirostat_lr_novel',
        counterId: '#mirostat_lr_counter_novel',
        format: (val: unknown) => Number(val).toFixed(2),
        setValue: (val: unknown) => { (nai_settings as Record<string, unknown>).mirostat_lr = Number(val); },
    },
    {
        sliderId: '#min_length_novel',
        counterId: '#min_length_counter_novel',
        format: (val: unknown) => `${val}`,
        setValue: (val: unknown) => { nai_settings.min_length = Number(val); },
    },
    {
        sliderId: '#nai_banned_tokens',
        counterId: '#nai_banned_tokens_counter',
        format: (val: unknown) => String(val),
        setValue: (val: unknown) => { nai_settings.banned_tokens = String(val); },
    },
    {
        sliderId: '#min_p_novel',
        counterId: '#min_p_counter_novel',
        format: (val: unknown) => Number(val).toFixed(3),
        setValue: (val: unknown) => { nai_settings.min_p = Number(val); },
    },
    {
        sliderId: '#math1_temp_novel',
        counterId: '#math1_temp_counter_novel',
        format: (val: unknown) => Number(val).toFixed(2),
        setValue: (val: unknown) => { nai_settings.math1_temp = Number(val); },
    },
    {
        sliderId: '#math1_quad_novel',
        counterId: '#math1_quad_counter_novel',
        format: (val: unknown) => Number(val).toFixed(2),
        setValue: (val: unknown) => { nai_settings.math1_quad = Number(val); },
    },
    {
        sliderId: '#math1_quad_entropy_scale_novel',
        counterId: '#math1_quad_entropy_scale_counter_novel',
        format: (val: unknown) => Number(val).toFixed(2),
        setValue: (val: unknown) => { nai_settings.math1_quad_entropy_scale = Number(val); },
    },
];

/**
 *
 * @param banned_tokens
 * @param tokenizerType
 */
function getBadWordIds(banned_tokens: string, tokenizerType: number) {
    if (tokenizerType === tokenizers.NONE) {
        return [];
    }

    const cacheKey = `${getStringHash(banned_tokens)}-${tokenizerType}`;

    if (cacheKey in badWordsCache && Array.isArray(badWordsCache[cacheKey])) {
        console.debug(`Bad words ids cache hit for "${banned_tokens}"`, badWordsCache[cacheKey]);
        return badWordsCache[cacheKey] as number[][];
    }

    const result = [];
    const sequence = banned_tokens.split('\n');

    for (const token of sequence) {
        const trimmed = token.trim();

        // Skip empty lines
        if (trimmed.length === 0) {
            continue;
        }

        // Verbatim text
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            const tokens = getTextTokens(tokenizerType, trimmed.slice(1, -1));
            result.push(tokens);
        } else if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            // Raw token ids, JSON serialized
            try {
                const tokens = JSON.parse(trimmed);

                if (Array.isArray(tokens) && tokens.every(t => Number.isInteger(t))) {
                    result.push(tokens);
                } else {
                    throw new Error('Not an array of integers');
                }
            } catch (err) {
                console.log(`Failed to parse bad word token list: ${trimmed}`, err);
            }
        } else {
            // Apply permutations
            const permutations = getBadWordPermutations(trimmed).map(t => getTextTokens(tokenizerType, t));
            result.push(...permutations);
        }
    }

    // Cache the result
    console.debug(`Bad words ids for "${banned_tokens}"`, result);
    badWordsCache[cacheKey] = result;

    return result;
}

/**
 *
 * @param text
 */
function getBadWordPermutations(text: string): string[] {
    const result: string[] = [];

    // Original text
    result.push(text);
    // Original text + leading space
    result.push(` ${text}`);
    // First letter capitalized
    result.push((text[0] ?? '').toUpperCase() + text.slice(1));
    // Ditto + leading space
    result.push(` ${(text[0] ?? '').toUpperCase() + text.slice(1)}`);
    // First letter lower cased
    result.push((text[0] ?? '').toLowerCase() + text.slice(1));
    // Ditto + leading space
    result.push(` ${(text[0] ?? '').toLowerCase() + text.slice(1)}`);
    // Original all upper cased
    result.push(text.toUpperCase());
    // Ditto + leading space
    result.push(` ${text.toUpperCase()}`);
    // Original all lower cased
    result.push(text.toLowerCase());
    // Ditto + leading space
    result.push(` ${text.toLowerCase()}`);

    return result.filter(onlyUnique);
}

/**
 *
 * @param finalPrompt
 * @param settings
 * @param maxLength
 * @param isImpersonate
 * @param isContinue
 * @param _cfgValues
 * @param type
 */
export function getNovelGenerationData(finalPrompt: string, settings: Record<string, unknown>, maxLength: number, isImpersonate: boolean, isContinue: boolean, _cfgValues: unknown, type: string) {
    console.debug('NovelAI generation data for', type);
    const isKayra = nai_settings.model_novel.includes('kayra');
    const isErato = nai_settings.model_novel.includes('erato');

    const tokenizerType = getTokenizerTypeForModel(nai_settings.model_novel);
    const stoppingStrings = getStoppingStrings(isImpersonate, isContinue);

    // Llama 3 tokenizer, huh?
    if (isErato) {
        const additionalStopStrings = [];
        for (const stoppingString of stoppingStrings) {
            if (stoppingString.startsWith('\n')) {
                additionalStopStrings.push('.' + stoppingString);
                additionalStopStrings.push('!' + stoppingString);
                additionalStopStrings.push('?' + stoppingString);
                additionalStopStrings.push('*' + stoppingString);
                additionalStopStrings.push('"' + stoppingString);
                additionalStopStrings.push('_' + stoppingString);
                additionalStopStrings.push('...' + stoppingString);
                additionalStopStrings.push('."' + stoppingString);
                additionalStopStrings.push('?"' + stoppingString);
                additionalStopStrings.push('!"' + stoppingString);
                additionalStopStrings.push('.*' + stoppingString);
                additionalStopStrings.push(')' + stoppingString);
            }
        }
        stoppingStrings.push(...additionalStopStrings);
    }

    const MAX_STOP_SEQUENCES = 1024;
    const stopSequences = (tokenizerType !== tokenizers.NONE)
        ? stoppingStrings.slice(0, MAX_STOP_SEQUENCES).map(t => getTextTokens(tokenizerType, t))
        : undefined;

    const badWordIds = (tokenizerType !== tokenizers.NONE)
        ? getBadWordIds(nai_settings.banned_tokens, tokenizerType)
        : undefined;

    const prefix = selectPrefix(nai_settings.prefix, finalPrompt);

    let logitBias = [];
    if (tokenizerType !== tokenizers.NONE && Array.isArray(nai_settings.logit_bias) && nai_settings.logit_bias.length) {
        logitBias = BIAS_CACHE.get(BIAS_KEY) || calculateLogitBias();
        BIAS_CACHE.set(BIAS_KEY, logitBias);
    }

    if (power_user.console_log_prompts) {
        console.log(finalPrompt);
    }


    if (isErato) {
        finalPrompt = '<|startoftext|><|reserved_special_token81|>' + finalPrompt;
    }

    const adjustedMaxLength = (isKayra || isErato) ? getNovelMaxResponseTokens() : maximum_output_length;

    return {
        'input': finalPrompt,
        'model': nai_settings.model_novel,
        'use_string': true,
        'temperature': Number(nai_settings.temperature),
        'max_length': maxLength < adjustedMaxLength ? maxLength : adjustedMaxLength,
        'min_length': Number(nai_settings.min_length),
        'tail_free_sampling': Number(nai_settings.tail_free_sampling),
        'repetition_penalty': Number(nai_settings.repetition_penalty),
        'repetition_penalty_range': Number(nai_settings.repetition_penalty_range),
        'repetition_penalty_slope': Number(nai_settings.repetition_penalty_slope),
        'repetition_penalty_frequency': Number(nai_settings.repetition_penalty_frequency),
        'repetition_penalty_presence': Number(nai_settings.repetition_penalty_presence),
        'top_a': Number(nai_settings.top_a),
        'top_p': Number(nai_settings.top_p),
        'top_k': Number(nai_settings.top_k),
        'min_p': Number(nai_settings.min_p),
        'math1_temp': Number(nai_settings.math1_temp),
        'math1_quad': Number(nai_settings.math1_quad),
        'math1_quad_entropy_scale': Number(nai_settings.math1_quad_entropy_scale),
        'typical_p': Number(nai_settings.typical_p),
        'mirostat_lr': Number((nai_settings as Record<string, unknown>).mirostat_lr ?? 0),
        'mirostat_tau': Number((nai_settings as Record<string, unknown>).mirostat_tau ?? 0),
        'phrase_rep_pen': (nai_settings as Record<string, unknown>).phrase_rep_pen ?? 'off',
        'stop_sequences': stopSequences,
        'bad_words_ids': badWordIds,
        'logit_bias_exp': logitBias,
        'generate_until_sentence': true,
        'use_cache': false,
        'return_full_text': false,
        'prefix': prefix,
        'order': nai_settings.order || settings.order || default_order,
        'num_logprobs': power_user.request_token_probabilities ? 10 : undefined,
    };
}

// Check if the prefix needs to be overridden to use instruct mode
/**
 *
 * @param selected_prefix
 * @param finalPrompt
 */
function selectPrefix(selected_prefix: string, finalPrompt: string) {
    let useInstruct = false;
    const clio = nai_settings.model_novel.includes('clio');
    const kayra = nai_settings.model_novel.includes('kayra');
    const erato = nai_settings.model_novel.includes('erato');
    const isNewModel = clio || kayra || erato;

    if (isNewModel) {
        // NovelAI claims they scan backwards 1000 characters (not tokens!) to look for instruct brackets. That's really short.
        const tail = finalPrompt.slice(-1500);
        useInstruct = tail.includes('}');
        return useInstruct ? 'special_instruct' : selected_prefix;
    }

    return 'vanilla';
}

/**
 *
 * @param model
 */
function getTokenizerTypeForModel(model: string) {
    if (model.includes('clio')) {
        return tokenizers.NERD;
    }
    if (model.includes('kayra')) {
        return tokenizers.NERD2;
    }
    if (model.includes('erato')) {
        return tokenizers.LLAMA3;
    }
    return tokenizers.NONE;
}

// Sort the samplers by the order array
/**
 *
 * @param orderArray
 */
function sortItemsByOrder(orderArray: number[]) {
    console.debug('Preset samplers order: ' + orderArray);
    const draggableItems = document.getElementById('novel_order');

    for (let i = 0; i < orderArray.length; i++) {
        const index = orderArray[i];
        const item = draggableItems!.querySelector(`[data-id="${index}"]`);
        if (item) draggableItems!.appendChild(item);
    }

    Array.from(draggableItems!.children).forEach(function (child) {
        const isEnabled = orderArray.includes(parseInt((child as HTMLElement).dataset.id!));
        (child as HTMLElement).classList.toggle('disabled', !isEnabled);

        if (!isEnabled) {
            draggableItems!.appendChild(child);
        }
    });
}

/**
 *
 */
function saveSamplingOrder() {
    const order: string[] = [];
    Array.from(document.getElementById('novel_order')!.children).forEach(function (child) {
        const el = child as HTMLElement;
        const isEnabled = !el.classList.contains('disabled');
        if (isEnabled) {
            order.push(el.dataset.id!);
        }
    });
    nai_settings.order = order as unknown as number[];
    console.log('Samplers reordered:', nai_settings.order);
    saveSettingsDebounced();
}

/**
 * Calculates logit bias for Novel AI
 * @returns {object[]} Array of logit bias objects
 */
function calculateLogitBias() {
    const biasPreset = nai_settings.logit_bias;

    if (!Array.isArray(biasPreset) || biasPreset.length === 0) {
        return [];
    }

    const tokenizerType = getTokenizerTypeForModel(nai_settings.model_novel);

    /**
     * Creates a bias object for Novel AI
     * @param {number} bias Bias value
     * @param {number[]} sequence Sequence of token ids
     */
    function getBiasObject(bias: number, sequence: number[]) {
        return {
            bias: bias,
            ensure_sequence_finish: false,
            generate_once: false,
            sequence: sequence,
        };
    }

    const result = getLogitBiasListResult(biasPreset, tokenizerType, getBiasObject);
    return result;
}

/**
 * Transforms instruction into compatible format for Novel AI if Novel AI instruct format not already detected.
 * 1. Instruction must begin and end with curly braces followed and preceded by a space.
 * 2. Instruction must not contain square brackets as it serves different purpose in NAI.
 * @param {string} prompt Original instruction prompt
 * @returns Processed prompt
 */
export function adjustNovelInstructionPrompt(prompt: string) {
    const stripedPrompt = prompt.replace(/[[\]]/g, '').trim();
    if (!stripedPrompt.includes('{ ')) {
        return `{ ${stripedPrompt} }`;
    }
    return stripedPrompt;
}

/**
 *
 * @param response
 * @param decoded
 */
function tryParseStreamingError(response: Response, decoded: string) {
    try {
        const data = JSON.parse(decoded);

        if (!data) {
            return;
        }

        if (data.message || data.error) {
            notyf.error(data.message || data.error?.message || response.statusText, 'NovelAI API');
            throw new Error(String(data));
        }
    } catch {
        // No JSON. Do nothing.
    }
}

/**
 *
 * @param generate_data
 * @param signal
 */
export async function generateNovelWithStreaming(generate_data: Record<string, unknown>, signal: AbortSignal) {
    generate_data.streaming = nai_settings.streaming_novel;

    const response = await fetch('/api/novelai/generate', {
        headers: getRequestHeaders(),
        body: JSON.stringify(generate_data),
        method: 'POST',
        signal: signal,
    });
    if (!response.ok) {
        tryParseStreamingError(response, await response.text());
        throw new Error(`Got response status ${response.status}`);
    }
    const eventStream = getEventSourceStream();
    response.body!.pipeThrough(eventStream as unknown as TransformStream<Uint8Array, Uint8Array>);
    const reader = eventStream.readable!.getReader();

    return async function* streamData() {
        let text = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) return;

            const data = JSON.parse(value.data);

            if (data.token) {
                text += data.token;
            }

            yield { text, swipes: [], logprobs: parseNovelAILogprobs(data.logprobs), toolCalls: [], state: {} };
        }
    };
}

/**
 * A single token's ID.
 * @typedef {[number]} TokenIdEntry
 */
/**
 * A single token's log probabilities. The first element is before repetition
 * penalties and samplers are applied, the second is after.
 * @typedef {[number, number]} LogprobsEntry
 */
/**
 * Combination of token ID and its corresponding log probabilities.
 * @typedef {[TokenIdEntry, LogprobsEntry]} TokenLogprobTuple
 */
/**
 * Represents all logprob data for a single token, including its
 * before, after, and the ultimately selected token.
 * @typedef {object} NAITokenLogprobs
 * @property {TokenLogprobTuple[]} chosen - always length 1
 * @property {TokenLogprobTuple[]} before - always `top_logprobs` length
 * @property {TokenLogprobTuple[]} after - maybe less than `top_logprobs` length
 */
/**
 * parseNovelAILogprobs converts a logprobs object returned from the NovelAI API
 * for a single token into a TokenLogprobs object used by the Token Probabilities
 * feature.
 * @param {NAITokenLogprobs} data - NAI logprobs object for one token
 * @returns {import('./logprobs.js').TokenLogprobs | null} converted logprobs
 */
export function parseNovelAILogprobs(data: {
    before: [[number], [number, number]][];
    after: [[number], [number, number]][];
    chosen: [[number], [number, number]][];
} | null) {
    if (!data) {
        return null;
    }
    const befores: [number, number][] = data.before.map(([[tokenId], [before, _]]) => [tokenId, before]);
    const afters: [number, number][] = data.after.map(([[tokenId], [_, after]]) => [tokenId, after]);

    // Find any tokens in `befores` that are missing from `afters`. Then add
    // them with a logprob of -Infinity (0% probability)
    const notInAfter: [number, number][] = befores
        .filter(([id]) => !afters.some(([aid]) => aid === id))
        .map(([id]): [number, number] => [id, -Infinity]);
    const merged = afters.concat(notInAfter);

    // Add the chosen token to `merged` if it's not already there. This can
    // happen if the chosen token was not among the top 10 most likely ones.
     
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [[chosenId], [_, chosenAfter]] = data.chosen[0]!;
    if (!merged.some(([id]) => id === chosenId)) {
        merged.push([chosenId, chosenAfter]);
    }

    // nb: returned logprobs are provided alongside token IDs, not decoded text.
    // We don't want to send an API call for every streaming tick to decode the
    // text so we will use the IDs instead and bulk decode them in
    // StreamingProcessor. JSDoc typechecking may complain about this, but it's
    // intentional.
    return { token: chosenId, topLogprobs: merged };
}

document.getElementById('nai_preamble_textarea')?.addEventListener('input', function (this: HTMLTextAreaElement) {
    nai_settings.preamble = String(this.value);
    saveSettingsDebounced();
});

document.getElementById('nai_preamble_restore')?.addEventListener('click', function () {
    nai_settings.preamble = default_preamble;
    const el = document.getElementById('nai_preamble_textarea') as HTMLTextAreaElement | null;
    if (el) el.value = nai_settings.preamble;
    saveSettingsDebounced();
});

/**
 *
 */
export async function getStatusNovel() {
    try {
        const result = await loadNovelSubscriptionData();

        if (!result) {
            throw new Error('Could not load subscription data');
        }

        setOnlineStatus(getNovelTier());
    } catch {
        setOnlineStatus('no_connection');
    }

    return resultCheckStatus();
}

/**
 *
 */
export function initNovelAISettings() {
    sliders.forEach(slider => {
        document.addEventListener('input', function (event) {
            if (!(event.target instanceof Element)) return;
            const el = event.target.closest(slider.sliderId);
            if (!el) return;
            const value = (el as HTMLInputElement).value;
            const formattedValue = slider.format(value);
            slider.setValue(value);
            const counter = document.querySelector(slider.counterId);
            if (counter) (counter as HTMLInputElement).value = String(formattedValue);
            saveSettingsDebounced();
        });
    });

    document.getElementById('api_button_novel')?.addEventListener('click', async function (e: Event) {
        e.stopPropagation();
        const api_key_novel = String((document.getElementById('api_key_novel') as HTMLInputElement | null)?.value).trim();

        if (api_key_novel.length) {
            await writeSecret(SECRET_KEYS.NOVEL!, api_key_novel, '', undefined);
        }

        if (!(secret_state as Record<string, unknown>)[SECRET_KEYS.NOVEL as string]) {
            console.log('No secret key saved for NovelAI');
            return;
        }

        startStatusLoading();
        await getStatusNovel();
    });

    document.getElementById('settings_preset_novel')?.addEventListener('change', async function (this: HTMLSelectElement) {
        nai_settings.preset_settings_novel = this.options[this.selectedIndex]!.text;
        const preset = novelai_settings[novelai_setting_names[nai_settings.preset_settings_novel] ?? 0] as unknown as NovelAIPreset;
        loadNovelPreset(preset);
        saveSettingsDebounced();
        await eventSource.emit(event_types.PRESET_CHANGED, { apiId: 'novel', name: nai_settings.preset_settings_novel });
    });

    document.getElementById('streaming_novel')?.addEventListener('input', function (this: HTMLInputElement) {
        const value = !!(this).checked;
        nai_settings.streaming_novel = value;
        saveSettingsDebounced();
    });

    document.getElementById('model_novel_select')?.addEventListener('change', function (this: HTMLSelectElement) {
        nai_settings.model_novel = String(this.options[this.selectedIndex]!.value);
        saveSettingsDebounced();

        // Update the selected preset to something appropriate
        const default_preset = (default_presets as Record<string, string>)[nai_settings.model_novel];
        const settingsPresetNovel = document.getElementById('settings_preset_novel') as HTMLSelectElement | null;
        if (settingsPresetNovel && default_preset) {
            settingsPresetNovel.value = String((novelai_setting_names as Record<string, number>)[default_preset]);
        }
        document.querySelector(`#settings_preset_novel option[value="${novelai_setting_names[default_preset ?? '']}"]`)?.setAttribute('selected', 'true');
        document.getElementById('settings_preset_novel')?.dispatchEvent(new Event('change'));
    });

    document.getElementById('nai_prefix')?.addEventListener('change', function (this: HTMLSelectElement) {
        nai_settings.prefix = String(this.options[this.selectedIndex]!.value);
        saveSettingsDebounced();
    });

    document.getElementById('phrase_rep_pen_novel')?.addEventListener('change', function () {
        const el = document.getElementById('phrase_rep_pen_novel') as HTMLSelectElement | null;
        (nai_settings as Record<string, unknown>).phrase_rep_pen = String(el?.options[el?.selectedIndex ?? 0]?.value ?? '');
        saveSettingsDebounced();
    });

    const novelOrderEl = document.getElementById('novel_order') as HTMLElement & { sortableInstance?: unknown };
    if (novelOrderEl) {
        novelOrderEl.sortableInstance = new Sortable(novelOrderEl, {
            delay: getSortableDelay(),
            onEnd: saveSamplingOrder,
        });
    }

    document.addEventListener('click', function (event) {
        if (!(event.target instanceof Element)) return;
        const el = event.target.closest('#novel_order .toggle_button');
        if (!el) return;
        const item = el.closest('[data-id]');
        if (!item) return;
        const isEnabled = !item.classList.contains('disabled');
        item.classList.toggle('disabled', isEnabled);
        console.log('Sampler toggled:', item.getAttribute('data-id'), !isEnabled);
        saveSamplingOrder();
    });

    document.getElementById('novelai_logit_bias_new_entry')?.addEventListener('click', () => createNewLogitBiasEntry(nai_settings.logit_bias, BIAS_KEY));
}
