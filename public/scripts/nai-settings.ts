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

// @ts-expect-error TS(7005) FIXME: Variable 'novelai_settings' implicitly has an 'any... Remove this comment to see the full error message
export let novelai_settings;
// @ts-expect-error TS(7005) FIXME: Variable 'novelai_setting_names' implicitly has an... Remove this comment to see the full error message
export let novelai_setting_names;

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
    logit_bias: [],
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

// @ts-expect-error TS(7034) FIXME: Variable 'novel_data' implicitly has type 'any' in... Remove this comment to see the full error message
let novel_data = null;
const badWordsCache = {};
const BIAS_KEY = '#range_block_novel';

/**
 *
 * @param data
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export function setNovelData(data) {
    novel_data = data;
}

/**
 *
 */
export function getKayraMaxContextTokens() {
    // @ts-expect-error TS(7005) FIXME: Variable 'novel_data' implicitly has an 'any' type... Remove this comment to see the full error message
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
    // @ts-expect-error TS(7005) FIXME: Variable 'novel_data' implicitly has an 'any' type... Remove this comment to see the full error message
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
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export function convertNovelPreset(data) {
    if (!data || typeof data !== 'object' || data.presetVersion !== 3 || !data.parameters || typeof data.parameters !== 'object') {
        return data;
    }

    return {
        max_context: 8000,
        temperature: data.parameters.temperature,
        max_length: data.parameters.max_length,
        min_length: data.parameters.min_length,
        top_k: data.parameters.top_k,
        top_p: data.parameters.top_p,
        top_a: data.parameters.top_a,
        typical_p: data.parameters.typical_p,
        tail_free_sampling: data.parameters.tail_free_sampling,
        repetition_penalty: data.parameters.repetition_penalty,
        repetition_penalty_range: data.parameters.repetition_penalty_range,
        repetition_penalty_slope: data.parameters.repetition_penalty_slope,
        repetition_penalty_frequency: data.parameters.repetition_penalty_frequency,
        repetition_penalty_presence: data.parameters.repetition_penalty_presence,
        phrase_rep_pen: data.parameters.phrase_rep_pen,
        mirostat_lr: data.parameters.mirostat_lr,
        mirostat_tau: data.parameters.mirostat_tau,
        math1_temp: data.parameters.math1_temp,
        math1_quad: data.parameters.math1_quad,
        math1_quad_entropy_scale: data.parameters.math1_quad_entropy_scale,
        min_p: data.parameters.min_p,
        // @ts-expect-error TS(7006) FIXME: Parameter 's' implicitly has an 'any' type.
        order: Array.isArray(data.parameters.order) ? data.parameters.order.filter(s => s.enabled && Object.keys(samplers).includes(s.id)).map(s => samplers[s.id]) : default_order,
        extensions: {},
    };
}

/**
 *
 */
export function getNovelTier() {
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    return nai_tiers[novel_data?.tier] ?? 'no_connection';
}

/**
 *
 */
export function getNovelAnlas() {
    // @ts-expect-error TS(7005) FIXME: Variable 'novel_data' implicitly has an 'any' type... Remove this comment to see the full error message
    return novel_data?.trainingStepsLeft?.fixedTrainingStepsLeft ?? 0;
}

/**
 *
 */
export function getNovelUnlimitedImageGeneration() {
    // @ts-expect-error TS(7005) FIXME: Variable 'novel_data' implicitly has an 'any' type... Remove this comment to see the full error message
    return novel_data?.perks?.unlimitedImageGeneration ?? false;
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

export function loadNovelPreset(preset: NovelAIPreset) {
    if (preset.genamt === undefined) {
        const needsUnlock = preset.max_context > MAX_CONTEXT_DEFAULT || preset.max_length > MAX_RESPONSE_DEFAULT;
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

    nai_settings.temperature = preset.temperature;
    nai_settings.repetition_penalty = preset.repetition_penalty;
    nai_settings.repetition_penalty_range = preset.repetition_penalty_range;
    nai_settings.repetition_penalty_slope = preset.repetition_penalty_slope;
    nai_settings.repetition_penalty_frequency = preset.repetition_penalty_frequency;
    nai_settings.repetition_penalty_presence = preset.repetition_penalty_presence;
    nai_settings.tail_free_sampling = preset.tail_free_sampling;
    nai_settings.top_k = preset.top_k;
    nai_settings.top_p = preset.top_p;
    nai_settings.top_a = preset.top_a;
    nai_settings.typical_p = preset.typical_p;
    nai_settings.min_length = preset.min_length;
    // @ts-expect-error TS(2339) FIXME: Property 'phrase_rep_pen' does not exist on type '... Remove this comment to see the full error message
    nai_settings.phrase_rep_pen = preset.phrase_rep_pen;
    // @ts-expect-error TS(2339) FIXME: Property 'mirostat_lr' does not exist on type '{ t... Remove this comment to see the full error message
    nai_settings.mirostat_lr = preset.mirostat_lr;
    // @ts-expect-error TS(2339) FIXME: Property 'mirostat_tau' does not exist on type '{ ... Remove this comment to see the full error message
    nai_settings.mirostat_tau = preset.mirostat_tau;
    nai_settings.prefix = preset.prefix;
    nai_settings.banned_tokens = preset.banned_tokens || '';
    nai_settings.order = preset.order || default_order;
    nai_settings.logit_bias = preset.logit_bias || [];
    nai_settings.preamble = preset.preamble || default_preamble;
    nai_settings.min_p = preset.min_p || 0;
    nai_settings.math1_temp = preset.math1_temp || 1;
    nai_settings.math1_quad = preset.math1_quad || 0;
    nai_settings.math1_quad_entropy_scale = preset.math1_quad_entropy_scale || 0;
    nai_settings.extensions = preset.extensions || {};
    loadNovelSettingsUi(nai_settings);
}

/**
 *
 * @param data
 * @param settings
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export function loadNovelSettings(data, settings) {
    novelai_setting_names = data.novelai_setting_names;
    novelai_settings = data.novelai_settings;
    // @ts-expect-error TS(7006) FIXME: Parameter 'item' implicitly has an 'any' type.
    novelai_settings.forEach(function (item, i, arr) {
        novelai_settings[i] = JSON.parse(item);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('settings_preset_novel').innerHTML = '';
    const presetNames = {};
    // @ts-expect-error TS(7006) FIXME: Parameter 'item' implicitly has an 'any' type.
    novelai_setting_names.forEach(function (item, i, arr) {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        presetNames[item] = i;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        document.getElementById('settings_preset_novel').append(`<option value=${i}>${item}</option>`);
    });
    novelai_setting_names = presetNames;

    //load the rest of the Novel settings without any checks
    nai_settings.model_novel = settings.model_novel;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('model_novel_select').value = nai_settings.model_novel;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const selectedOption = document.querySelector(`#model_novel_select option[value="${nai_settings.model_novel}"]`);
    if (selectedOption instanceof HTMLOptionElement) selectedOption.selected = true;

    if (settings.nai_preamble !== undefined) {
        nai_settings.preamble = settings.nai_preamble;
        delete settings.nai_preamble;
    }
    nai_settings.preset_settings_novel = settings.preset_settings_novel;
    nai_settings.temperature = settings.temperature;
    nai_settings.repetition_penalty = settings.repetition_penalty;
    nai_settings.repetition_penalty_range = settings.repetition_penalty_range;
    nai_settings.repetition_penalty_slope = settings.repetition_penalty_slope;
    nai_settings.repetition_penalty_frequency = settings.repetition_penalty_frequency;
    nai_settings.repetition_penalty_presence = settings.repetition_penalty_presence;
    nai_settings.tail_free_sampling = settings.tail_free_sampling;
    nai_settings.top_k = settings.top_k;
    nai_settings.top_p = settings.top_p;
    nai_settings.top_a = settings.top_a;
    nai_settings.typical_p = settings.typical_p;
    nai_settings.min_length = settings.min_length;
    // @ts-expect-error TS(2339) FIXME: Property 'phrase_rep_pen' does not exist on type '... Remove this comment to see the full error message
    nai_settings.phrase_rep_pen = settings.phrase_rep_pen;
    // @ts-expect-error TS(2339) FIXME: Property 'mirostat_lr' does not exist on type '{ t... Remove this comment to see the full error message
    nai_settings.mirostat_lr = settings.mirostat_lr;
    // @ts-expect-error TS(2339) FIXME: Property 'mirostat_tau' does not exist on type '{ ... Remove this comment to see the full error message
    nai_settings.mirostat_tau = settings.mirostat_tau;
    nai_settings.streaming_novel = !!settings.streaming_novel;
    nai_settings.preamble = settings.preamble || default_preamble;
    nai_settings.prefix = settings.prefix;
    nai_settings.banned_tokens = settings.banned_tokens || '';
    nai_settings.order = settings.order || default_order;
    nai_settings.logit_bias = settings.logit_bias || [];
    nai_settings.min_p = settings.min_p || 0;
    nai_settings.math1_temp = settings.math1_temp || 1;
    nai_settings.math1_quad = settings.math1_quad || 0;
    nai_settings.math1_quad_entropy_scale = settings.math1_quad_entropy_scale || 0;
    nai_settings.extensions = settings.extensions || {};
    loadNovelSettingsUi(nai_settings);
}

/**
 *
 * @param ui_settings
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'ui_settings' implicitly has an 'any' ty... Remove this comment to see the full error message
function loadNovelSettingsUi(ui_settings) {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('temp_novel').value = ui_settings.temperature;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('temp_counter_novel').value = Number(ui_settings.temperature ?? 0).toFixed(2);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('rep_pen_novel').value = ui_settings.repetition_penalty;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('rep_pen_counter_novel').value = Number(ui_settings.repetition_penalty ?? 0).toFixed(3);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('rep_pen_size_novel').value = ui_settings.repetition_penalty_range;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('rep_pen_size_counter_novel').value = Number(ui_settings.repetition_penalty_range).toFixed(0);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('rep_pen_slope_novel').value = ui_settings.repetition_penalty_slope;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('rep_pen_slope_counter_novel').value = Number(ui_settings.repetition_penalty_slope).toFixed(2);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('rep_pen_freq_novel').value = ui_settings.repetition_penalty_frequency;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('rep_pen_freq_counter_novel').value = Number(ui_settings.repetition_penalty_frequency ?? 0).toFixed(3);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('rep_pen_presence_novel').value = ui_settings.repetition_penalty_presence;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('rep_pen_presence_counter_novel').value = Number(ui_settings.repetition_penalty_presence ?? 0).toFixed(3);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('tail_free_sampling_novel').value = ui_settings.tail_free_sampling;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('tail_free_sampling_counter_novel').value = Number(ui_settings.tail_free_sampling ?? 0).toFixed(3);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('top_k_novel').value = ui_settings.top_k;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('top_k_counter_novel').value = Number(ui_settings.top_k ?? 0).toFixed(0);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('top_p_novel').value = ui_settings.top_p;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('top_p_counter_novel').value = Number(ui_settings.top_p ?? 0).toFixed(3);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('top_a_novel').value = ui_settings.top_a;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('top_a_counter_novel').value = Number(ui_settings.top_a ?? 0).toFixed(3);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('typical_p_novel').value = ui_settings.typical_p;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('typical_p_counter_novel').value = Number(ui_settings.typical_p ?? 0).toFixed(3);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('phrase_rep_pen_novel').value = ui_settings.phrase_rep_pen || 'off';
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('mirostat_lr_novel').value = ui_settings.mirostat_lr;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('mirostat_lr_counter_novel').value = Number(ui_settings.mirostat_lr ?? 0).toFixed(2);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('mirostat_tau_novel').value = ui_settings.mirostat_tau;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('mirostat_tau_counter_novel').value = Number(ui_settings.mirostat_tau ?? 0).toFixed(2);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('min_length_novel').value = ui_settings.min_length;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('min_length_counter_novel').value = Number(ui_settings.min_length ?? 0).toFixed(0);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('nai_preamble_textarea').value = ui_settings.preamble;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('nai_prefix').value = ui_settings.prefix || 'vanilla';
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('nai_banned_tokens').value = ui_settings.banned_tokens || '';
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('min_p_novel').value = ui_settings.min_p;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('min_p_counter_novel').value = Number(ui_settings.min_p ?? 0).toFixed(3);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('math1_temp_novel').value = ui_settings.math1_temp;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('math1_temp_counter_novel').value = Number(ui_settings.math1_temp.toFixed(2));
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('math1_quad_novel').value = ui_settings.math1_quad;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('math1_quad_counter_novel').value = Number(ui_settings.math1_quad.toFixed(2));
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('math1_quad_entropy_scale_novel').value = ui_settings.math1_quad_entropy_scale;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('math1_quad_entropy_scale_counter_novel').value = Number(ui_settings.math1_quad_entropy_scale.toFixed(2));
        const selectedPresetOption = document.querySelector(`#settings_preset_novel option[value="${novelai_setting_names[nai_settings.preset_settings_novel]}"]`);
    if (selectedPresetOption instanceof HTMLOptionElement) selectedPresetOption.selected = true;

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const streamingNovelEl = document.getElementById('streaming_novel');
    if (streamingNovelEl) (streamingNovelEl as HTMLInputElement).checked = ui_settings.streaming_novel;
    sortItemsByOrder(ui_settings.order);
    displayLogitBias(ui_settings.logit_bias, BIAS_KEY);
}

const sliders = [
    {
        sliderId: '#temp_novel',
        counterId: '#temp_counter_novel',
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        format: (val) => Number(val).toFixed(2),
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        setValue: (val) => { nai_settings.temperature = Number(val); },
    },
    {
        sliderId: '#rep_pen_novel',
        counterId: '#rep_pen_counter_novel',
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        format: (val) => Number(val).toFixed(3),
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        setValue: (val) => { nai_settings.repetition_penalty = Number(val); },
    },
    {
        sliderId: '#rep_pen_size_novel',
        counterId: '#rep_pen_size_counter_novel',
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        format: (val) => `${val}`,
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        setValue: (val) => { nai_settings.repetition_penalty_range = Number(val); },
    },
    {
        sliderId: '#rep_pen_slope_novel',
        counterId: '#rep_pen_slope_counter_novel',
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        format: (val) => `${val}`,
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        setValue: (val) => { nai_settings.repetition_penalty_slope = Number(val); },
    },
    {
        sliderId: '#rep_pen_freq_novel',
        counterId: '#rep_pen_freq_counter_novel',
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        format: (val) => Number(val).toFixed(2),
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        setValue: (val) => { nai_settings.repetition_penalty_frequency = Number(val); },
    },
    {
        sliderId: '#rep_pen_presence_novel',
        counterId: '#rep_pen_presence_counter_novel',
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        format: (val) => `${val}`,
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        setValue: (val) => { nai_settings.repetition_penalty_presence = Number(val); },
    },
    {
        sliderId: '#tail_free_sampling_novel',
        counterId: '#tail_free_sampling_counter_novel',
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        format: (val) => `${val}`,
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        setValue: (val) => { nai_settings.tail_free_sampling = Number(val); },
    },
    {
        sliderId: '#top_k_novel',
        counterId: '#top_k_counter_novel',
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        format: (val) => `${val}`,
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        setValue: (val) => { nai_settings.top_k = Number(val); },
    },
    {
        sliderId: '#top_p_novel',
        counterId: '#top_p_counter_novel',
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        format: (val) => Number(val).toFixed(3),
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        setValue: (val) => { nai_settings.top_p = Number(val); },
    },
    {
        sliderId: '#top_a_novel',
        counterId: '#top_a_counter_novel',
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        format: (val) => Number(val).toFixed(2),
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        setValue: (val) => { nai_settings.top_a = Number(val); },
    },
    {
        sliderId: '#typical_p_novel',
        counterId: '#typical_p_counter_novel',
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        format: (val) => Number(val).toFixed(3),
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        setValue: (val) => { nai_settings.typical_p = Number(val); },
    },
    {
        sliderId: '#mirostat_tau_novel',
        counterId: '#mirostat_tau_counter_novel',
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        format: (val) => Number(val).toFixed(2),
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        setValue: (val) => { nai_settings.mirostat_tau = Number(val); },
    },
    {
        sliderId: '#mirostat_lr_novel',
        counterId: '#mirostat_lr_counter_novel',
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        format: (val) => Number(val).toFixed(2),
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        setValue: (val) => { nai_settings.mirostat_lr = Number(val); },
    },
    {
        sliderId: '#min_length_novel',
        counterId: '#min_length_counter_novel',
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        format: (val) => `${val}`,
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        setValue: (val) => { nai_settings.min_length = Number(val); },
    },
    {
        sliderId: '#nai_banned_tokens',
        counterId: '#nai_banned_tokens_counter',
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        format: (val) => val,
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        setValue: (val) => { nai_settings.banned_tokens = val; },
    },
    {
        sliderId: '#min_p_novel',
        counterId: '#min_p_counter_novel',
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        format: (val) => Number(val).toFixed(3),
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        setValue: (val) => { nai_settings.min_p = Number(val); },
    },
    {
        sliderId: '#math1_temp_novel',
        counterId: '#math1_temp_counter_novel',
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        format: (val) => Number(val).toFixed(2),
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        setValue: (val) => { nai_settings.math1_temp = Number(val); },
    },
    {
        sliderId: '#math1_quad_novel',
        counterId: '#math1_quad_counter_novel',
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        format: (val) => Number(val).toFixed(2),
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        setValue: (val) => { nai_settings.math1_quad = Number(val); },
    },
    {
        sliderId: '#math1_quad_entropy_scale_novel',
        counterId: '#math1_quad_entropy_scale_counter_novel',
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        format: (val) => Number(val).toFixed(2),
        // @ts-expect-error TS(7006) FIXME: Parameter 'val' implicitly has an 'any' type.
        setValue: (val) => { nai_settings.math1_quad_entropy_scale = Number(val); },
    },
];

/**
 *
 * @param banned_tokens
 * @param tokenizerType
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'banned_tokens' implicitly has an 'any' ... Remove this comment to see the full error message
function getBadWordIds(banned_tokens, tokenizerType) {
    if (tokenizerType === tokenizers.NONE) {
        return [];
    }

    const cacheKey = `${getStringHash(banned_tokens)}-${tokenizerType}`;

    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    if (cacheKey in badWordsCache && Array.isArray(badWordsCache[cacheKey])) {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        console.debug(`Bad words ids cache hit for "${banned_tokens}"`, badWordsCache[cacheKey]);
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        return badWordsCache[cacheKey];
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
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    badWordsCache[cacheKey] = result;

    return result;
}

/**
 *
 * @param text
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'text' implicitly has an 'any' type.
function getBadWordPermutations(text) {
    const result = [];

    // Original text
    result.push(text);
    // Original text + leading space
    result.push(` ${text}`);
    // First letter capitalized
    result.push(text[0].toUpperCase() + text.slice(1));
    // Ditto + leading space
    result.push(` ${text[0].toUpperCase() + text.slice(1)}`);
    // First letter lower cased
    result.push(text[0].toLowerCase() + text.slice(1));
    // Ditto + leading space
    result.push(` ${text[0].toLowerCase() + text.slice(1)}`);
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
// @ts-expect-error TS(7006) FIXME: Parameter 'finalPrompt' implicitly has an 'any' ty... Remove this comment to see the full error message
export function getNovelGenerationData(finalPrompt, settings, maxLength, isImpersonate, isContinue, _cfgValues, type) {
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
        // @ts-expect-error TS(2339) FIXME: Property 'mirostat_lr' does not exist on type '{ t... Remove this comment to see the full error message
        'mirostat_lr': Number(nai_settings.mirostat_lr),
        // @ts-expect-error TS(2339) FIXME: Property 'mirostat_tau' does not exist on type '{ ... Remove this comment to see the full error message
        'mirostat_tau': Number(nai_settings.mirostat_tau),
        // @ts-expect-error TS(2339) FIXME: Property 'phrase_rep_pen' does not exist on type '... Remove this comment to see the full error message
        'phrase_rep_pen': nai_settings.phrase_rep_pen,
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
// @ts-expect-error TS(7006) FIXME: Parameter 'selected_prefix' implicitly has an 'any... Remove this comment to see the full error message
function selectPrefix(selected_prefix, finalPrompt) {
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
// @ts-expect-error TS(7006) FIXME: Parameter 'model' implicitly has an 'any' type.
function getTokenizerTypeForModel(model) {
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
// @ts-expect-error TS(7006) FIXME: Parameter 'orderArray' implicitly has an 'any' typ... Remove this comment to see the full error message
function sortItemsByOrder(orderArray) {
    console.debug('Preset samplers order: ' + orderArray);
    const draggableItems = document.getElementById('novel_order');

    for (let i = 0; i < orderArray.length; i++) {
        const index = orderArray[i];
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const item = draggableItems.querySelector(`[data-id="${index}"]`);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        draggableItems.appendChild(item);
    }

    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    Array.from(draggableItems.children).forEach(function (child) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const isEnabled = orderArray.includes(parseInt(child.dataset.id));
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                child.classList.toggle('disabled', !isEnabled);

        if (!isEnabled) {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            draggableItems.appendChild(child);
        }
    });
}

/**
 *
 */
function saveSamplingOrder() {
    // @ts-expect-error TS(7034) FIXME: Variable 'order' implicitly has type 'any[]' in so... Remove this comment to see the full error message
    const order = [];
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    Array.from(document.getElementById('novel_order').children).forEach(function (child) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const isEnabled = !child.hasClass('disabled');
        if (isEnabled) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            order.push(child.dataset.id);
        }
    });
    // @ts-expect-error TS(7005) FIXME: Variable 'order' implicitly has an 'any[]' type.
    nai_settings.order = order;
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
    // @ts-expect-error TS(7006) FIXME: Parameter 'bias' implicitly has an 'any' type.
    function getBiasObject(bias, sequence) {
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
// @ts-expect-error TS(7006) FIXME: Parameter 'prompt' implicitly has an 'any' type.
export function adjustNovelInstructionPrompt(prompt) {
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
// @ts-expect-error TS(7006) FIXME: Parameter 'response' implicitly has an 'any' type.
function tryParseStreamingError(response, decoded) {
    try {
        const data = JSON.parse(decoded);

        if (!data) {
            return;
        }

        if (data.message || data.error) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.error(data.message || data.error?.message || response.statusText, 'NovelAI API');
            throw new Error(data);
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
// @ts-expect-error TS(7006) FIXME: Parameter 'generate_data' implicitly has an 'any' ... Remove this comment to see the full error message
export async function generateNovelWithStreaming(generate_data, signal) {
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
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    response.body.pipeThrough(eventStream);
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    const reader = eventStream.readable.getReader();

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
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export function parseNovelAILogprobs(data) {
    if (!data) {
        return null;
    }
    // @ts-expect-error TS(7031) FIXME: Binding element 'tokenId' implicitly has an 'any' ... Remove this comment to see the full error message
    const befores = data.before.map(([[tokenId], [before, _]]) => [tokenId, before]);
    // @ts-expect-error TS(7031) FIXME: Binding element 'tokenId' implicitly has an 'any' ... Remove this comment to see the full error message
    const afters = data.after.map(([[tokenId], [_, after]]) => [tokenId, after]);

    // Find any tokens in `befores` that are missing from `afters`. Then add
    // them with a logprob of -Infinity (0% probability)
    const notInAfter = befores
        // @ts-expect-error TS(7031) FIXME: Binding element 'id' implicitly has an 'any' type.
        .filter(([id]) => !afters.some(([aid]) => aid === id))
        // @ts-expect-error TS(7031) FIXME: Binding element 'id' implicitly has an 'any' type.
        .map(([id]) => [id, -Infinity]);
    const merged = afters.concat(notInAfter);

    // Add the chosen token to `merged` if it's not already there. This can
    // happen if the chosen token was not among the top 10 most likely ones.
     
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [[chosenId], [_, chosenAfter]] = data.chosen[0];
    // @ts-expect-error TS(7031) FIXME: Binding element 'id' implicitly has an 'any' type.
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

document.getElementById('nai_preamble_textarea')?.addEventListener('input', function () {
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    nai_settings.preamble = String(this.value);
    saveSettingsDebounced();
});

document.getElementById('nai_preamble_restore')?.addEventListener('click', function () {
    nai_settings.preamble = default_preamble;
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    document.getElementById('nai_preamble_textarea').value = nai_settings.preamble;
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
            if (counter) (counter as HTMLInputElement).value = formattedValue;
            saveSettingsDebounced();
        });
    });

    document.getElementById('api_button_novel')?.addEventListener('click', async function (e) {
        e.stopPropagation();
        const api_key_novel = String((document.getElementById('api_key_novel') as HTMLInputElement | null)?.value).trim();

        if (api_key_novel.length) {
            // @ts-expect-error TS(2554) FIXME: Expected 3-4 arguments, but got 2.
            await writeSecret(SECRET_KEYS.NOVEL, api_key_novel);
        }

        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        if (!secret_state[SECRET_KEYS.NOVEL]) {
            console.log('No secret key saved for NovelAI');
            return;
        }

        startStatusLoading();
        await getStatusNovel();
    });

    document.getElementById('settings_preset_novel')?.addEventListener('change', async function () {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        nai_settings.preset_settings_novel = this.options[this.selectedIndex].text;
        const preset = novelai_settings[novelai_setting_names[nai_settings.preset_settings_novel]];
        loadNovelPreset(preset);
        saveSettingsDebounced();
        await eventSource.emit(event_types.PRESET_CHANGED, { apiId: 'novel', name: nai_settings.preset_settings_novel });
    });

    document.getElementById('streaming_novel')?.addEventListener('input', function () {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const value = !!(this).checked;
        nai_settings.streaming_novel = value;
        saveSettingsDebounced();
    });

    document.getElementById('model_novel_select')?.addEventListener('change', function () {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        nai_settings.model_novel = String(this.options[this.selectedIndex].value);
        saveSettingsDebounced();

        // Update the selected preset to something appropriate
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        const default_preset = default_presets[nai_settings.model_novel];
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('settings_preset_novel').value = novelai_setting_names[default_preset];
        document.querySelector(`#settings_preset_novel option[value="${novelai_setting_names[default_preset]}"]`)?.setAttribute('selected', 'true');
        document.getElementById('settings_preset_novel')?.dispatchEvent(new Event('change'));
    });

    document.getElementById('nai_prefix')?.addEventListener('change', function () {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        nai_settings.prefix = String(this.options[this.selectedIndex].value);
        saveSettingsDebounced();
    });

    document.getElementById('phrase_rep_pen_novel')?.addEventListener('change', function () {
        // @ts-expect-error TS(2339) FIXME: Property 'phrase_rep_pen' does not exist on type '... Remove this comment to see the full error message
        nai_settings.phrase_rep_pen = String(document.getElementById('phrase_rep_pen_novel').options[document.getElementById('phrase_rep_pen_novel').selectedIndex].value);
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
