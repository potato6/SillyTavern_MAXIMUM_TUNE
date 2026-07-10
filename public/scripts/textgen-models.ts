import { DOMPurify } from '../lib.js';
import { isMobile } from './RossAscends-mods.js';
import { amount_gen, eventSource, event_types, getRequestHeaders, max_context, online_status, setGenerationParamsFromPreset } from '../script.js';
import { textgenerationwebui_settings as textgen_settings, textgen_types } from './textgen-settings.js';
import { tokenizers } from './tokenizers.js';
import { renderTemplateAsync } from './templates.js';
import { POPUP_TYPE, callGenericPopup } from './popup.js';
import { t } from './i18n.js';
import { accountStorage } from './util/AccountStorage.js';
import { localizePagination, PAGINATION_TEMPLATE, textValueMatcher } from './utils.js';

// @ts-expect-error TS(7034) FIXME: Variable 'mancerModels' implicitly has type 'any[]... Remove this comment to see the full error message
let mancerModels = [];
// @ts-expect-error TS(7034) FIXME: Variable 'togetherModels' implicitly has type 'any... Remove this comment to see the full error message
let togetherModels = [];
// @ts-expect-error TS(7034) FIXME: Variable 'infermaticAIModels' implicitly has type ... Remove this comment to see the full error message
let infermaticAIModels = [];
// @ts-expect-error TS(7034) FIXME: Variable 'dreamGenModels' implicitly has type 'any... Remove this comment to see the full error message
let dreamGenModels = [];
// @ts-expect-error TS(7034) FIXME: Variable 'vllmModels' implicitly has type 'any[]' ... Remove this comment to see the full error message
let vllmModels = [];
// @ts-expect-error TS(7034) FIXME: Variable 'aphroditeModels' implicitly has type 'an... Remove this comment to see the full error message
let aphroditeModels = [];
// @ts-expect-error TS(7034) FIXME: Variable 'featherlessModels' implicitly has type '... Remove this comment to see the full error message
let featherlessModels = [];
let tabbyModels = [];
let llamacppModels = [];
export let openRouterModels = [];

/**
 * List of OpenRouter providers.
 * @type {string[]}
 */
const OPENROUTER_PROVIDERS = [
    // Providers endpoint: https://openrouter.ai/api/v1/providers
    // The list should resemble the sidebar from https://openrouter.ai/models
    // Their docs no longer displays the list, which had "super dead" ones at top, thankfully gone from /v1/providers
    'AI21',
    'AionLabs',
    'Alibaba',
    'AkashML',
    'Amazon Bedrock',
    'Amazon Nova',
    'Ambient',
    'Anthropic',
    'Arcee AI',
    'AtlasCloud',
    'Avian',
    'Azure',
    'Baidu',
    'BaseTen',
    'Black Forest Labs',
    'Cerebras',
    'Chutes',
    'Cirrascale',
    'Clarifai',
    'Cloudflare',
    'Cohere',
    'Crusoe',
    'DeepInfra',
    'DeepSeek',
    'DekaLLM',
    'FakeProvider',
    'Featherless',
    'Fireworks',
    'Friendli',
    'GMICloud',
    'Google',
    'Google AI Studio',
    'Groq',
    'Hyperbolic',
    'Inception',
    'Inceptron',
    'InferenceNet',
    'Infermatic',
    'Inflection',
    'Io Net',
    'Ionstream',
    'Liquid',
    'Mancer 2',
    'Mara',
    'Minimax',
    'Mistral',
    'ModelRun',
    'Modular',
    'Moonshot AI',
    'Morph',
    'NCompass',
    'Nebius',
    'NextBit',
    'Novita',
    'Nvidia',
    'OpenAI',
    'OpenInference',
    'Parasail',
    'Perplexity',
    'Phala',
    'Recraft',
    'Reka',
    'Relace',
    'SambaNova',
    'Seed',
    'SiliconFlow',
    'Sourceful',
    'Stealth',
    'StepFun',
    'StreamLake',
    'Switchpoint',
    'Together',
    'Upstage',
    'Venice',
    'WandB',
    'xAI',
    'Xiaomi',
    'Z.AI',
];

/**
 * List of NanoGPT providers.
 * Providers endpoint: https://nano-gpt.com/api/models/providers
 * @type {{id: string, label: string}[]}
 */
const NANOGPT_PROVIDERS = [
    {
        'id': 'akash',
        'label': 'Akash',
    },
    {
        'id': 'alibaba',
        'label': 'Alibaba',
    },
    {
        'id': 'ambient',
        'label': 'Ambient',
    },
    {
        'id': 'arliai',
        'label': 'ArliAI',
    },
    {
        'id': 'atlascloud',
        'label': 'AtlasCloud',
    },
    {
        'id': 'azure',
        'label': 'Azure',
    },
    {
        'id': 'awsbedrock',
        'label': 'Amazon Bedrock',
    },
    {
        'id': 'baidu',
        'label': 'Baidu',
    },
    {
        'id': 'baseten',
        'label': 'BaseTen',
    },
    {
        'id': 'cerebras',
        'label': 'Cerebras',
    },
    {
        'id': 'chutes',
        'label': 'Chutes',
    },
    {
        'id': 'clarifai',
        'label': 'Clarifai',
    },
    {
        'id': 'cloudflare',
        'label': 'Cloudflare',
    },
    {
        'id': 'crusoe',
        'label': 'Crusoe',
    },
    {
        'id': 'dekallm',
        'label': 'DekaLLM',
    },
    {
        'id': 'deepinfra',
        'label': 'DeepInfra',
    },
    {
        'id': 'deepseek',
        'label': 'DeepSeek',
    },
    {
        'id': 'fireworks',
        'label': 'Fireworks',
    },
    {
        'id': 'friendli',
        'label': 'Friendli',
    },
    {
        'id': 'gmicloud',
        'label': 'GMICloud',
    },
    {
        'id': 'lilac',
        'label': 'Lilac',
    },
    {
        'id': 'google',
        'label': 'Google',
    },
    {
        'id': 'groq',
        'label': 'Groq',
    },
    {
        'id': 'hyperbolic',
        'label': 'Hyperbolic',
    },
    {
        'id': 'ionet',
        'label': 'Io Net',
    },
    {
        'id': 'inceptron',
        'label': 'Inceptron',
    },
    {
        'id': 'mancer',
        'label': 'Mancer',
    },
    {
        'id': 'mara',
        'label': 'Mara',
    },
    {
        'id': 'meganova',
        'label': 'MegaNova',
    },
    {
        'id': 'minimax',
        'label': 'MiniMax',
    },
    {
        'id': 'modelrun',
        'label': 'ModelRun',
    },
    {
        'id': 'moonshot',
        'label': 'Moonshot',
    },
    {
        'id': 'morph',
        'label': 'Morph',
    },
    {
        'id': 'ncompass',
        'label': 'NCompass',
    },
    {
        'id': 'nebius',
        'label': 'Nebius',
    },
    {
        'id': 'neuralwatt',
        'label': 'Neuralwatt',
    },
    {
        'id': 'nextbit',
        'label': 'NextBit',
    },
    {
        'id': 'novita',
        'label': 'Novita',
    },
    {
        'id': 'parasail',
        'label': 'Parasail',
    },
    {
        'id': 'phala',
        'label': 'Phala',
    },
    {
        'id': 'redpill',
        'label': 'Redpill',
    },
    {
        'id': 'sambanova',
        'label': 'SambaNova',
    },
    {
        'id': 'sambanova-high-throughput',
        'label': 'SambaNova (High Throughput)',
    },
    {
        'id': 'siliconflow',
        'label': 'SiliconFlow',
    },
    {
        'id': 'streamlake',
        'label': 'StreamLake',
    },
    {
        'id': 'tinfoil',
        'label': 'Tinfoil',
    },
    {
        'id': 'together',
        'label': 'Together',
    },
    {
        'id': 'venice',
        'label': 'Venice',
    },
    {
        'id': 'wandb',
        'label': 'Weights & Biases',
    },
    {
        'id': 'zai',
        'label': 'Z.AI',
    },
];

const OPENROUTER_PROVIDER_WARNING_SELECTORS = {
    '#openrouter_providers_text': {
        fallbackSelector: '#openrouter_allow_fallbacks_textgenerationwebui',
        warningSelector: '#openrouter_provider_warning_text',
    },
    '#openrouter_providers_chat': {
        fallbackSelector: '#openrouter_allow_fallbacks',
        warningSelector: '#openrouter_provider_warning_chat',
    },
};

/**
 *
 * @param providersSelector
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'providersSelector' implicitly has an 'a... Remove this comment to see the full error message
export function updateOpenRouterProvidersWarning(providersSelector) {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const $providers = $(providersSelector);

    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    const warningSelectors = OPENROUTER_PROVIDER_WARNING_SELECTORS[providersSelector];

    if ($providers.length === 0 || !warningSelectors) {
        return;
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const $fallback = $(warningSelectors.fallbackSelector);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const $warning = $(warningSelectors.warningSelector);

    const allowFallback = !!$fallback.prop('checked');
    const providersEl = $providers[0];
    const selectedCount = providersEl?.querySelectorAll('option:checked').length ?? 0;
    const applicableSelectedCount = providersEl?.querySelectorAll('option:checked:not([disabled])').length ?? 0;
    const showWarning = !allowFallback && selectedCount > 0 && applicableSelectedCount === 0;

    $warning.toggleClass('displayNone', !showWarning);
}

/**
 *
 * @param modelId
 * @param providersSelector
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'modelId' implicitly has an 'any' type.
export async function syncOpenRouterProvidersForModel(modelId, providersSelector) {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const $providers = $(providersSelector);

    const refreshWarningState = () => {
        updateOpenRouterProvidersWarning(providersSelector);
    };

    const providersEl = $providers[0];

    if (!modelId || !modelId.includes('/')) {
        // @ts-expect-error TS(7006) FIXME: Parameter 'el' implicitly has an 'any' type.
        providersEl?.querySelectorAll('option').forEach(el => el.disabled = false);
        $providers.trigger('change.select2');
        refreshWarningState();
        return;
    }

    try {
        const response = await fetch('/api/openrouter/models/providers', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ model: modelId }),
        });

        if (!response.ok) {
            refreshWarningState();
            return;
        }

        const providerNames = await response.json();

        if (!Array.isArray(providerNames) || providerNames.length === 0) {
            // @ts-expect-error TS(7006) FIXME: Parameter 'el' implicitly has an 'any' type.
            providersEl?.querySelectorAll('option').forEach(el => el.disabled = false);
            $providers.trigger('change.select2');
            refreshWarningState();
            return;
        }

        // @ts-expect-error TS(7006) FIXME: Parameter 'el' implicitly has an 'any' type.
        providersEl?.querySelectorAll('option').forEach(el => {
            const isAvailable = providerNames.includes(el.value);
            el.disabled = !isAvailable;
        });

        $providers.trigger('change.select2');
        refreshWarningState();
    } catch (error) {
        console.error('Failed to fetch OpenRouter providers for model', error);
        refreshWarningState();
    }
}

/**
 *
 * @param modelId
 * @param providersSelector
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'modelId' implicitly has an 'any' type.
export async function syncNanoGptProvidersForModel(modelId, providersSelector) {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const $providers = $(providersSelector);

    const refreshWarningState = () => {
        updateNanoGptProvidersWarning(providersSelector);
    };

    const providersEl = $providers[0];

    if (!modelId) {
        // @ts-expect-error TS(7006) FIXME: Parameter 'el' implicitly has an 'any' type.
        providersEl?.querySelectorAll('option').forEach(el => el.disabled = false);
        $providers.trigger('change.select2');
        refreshWarningState();
        return;
    }

    try {
        const response = await fetch('/api/nanogpt/models/providers', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ model: modelId }),
        });

        if (!response.ok) {
            refreshWarningState();
            return;
        }

        const data = await response.json();
        const providerIds = Array.isArray(data?.providers) ? data.providers : [];

        if (!data?.supportsProviderSelection || providerIds.length === 0) {
            // @ts-expect-error TS(7006) FIXME: Parameter 'el' implicitly has an 'any' type.
            providersEl?.querySelectorAll('option').forEach(el => {
                el.disabled = Boolean(el.value);
            });
            $providers[0]?.dispatchEvent(new Event('change'));
            $providers.trigger('change.select2');
            refreshWarningState();
            return;
        }

        // @ts-expect-error TS(7006) FIXME: Parameter 'el' implicitly has an 'any' type.
        providersEl?.querySelectorAll('option').forEach(el => {
            const value = el.value;
            const isAvailable = !value || providerIds.includes(value);
            el.disabled = !isAvailable;
        });

        $providers.trigger('change.select2');
        refreshWarningState();
    } catch (error) {
        console.error('Failed to fetch NanoGPT providers for model', error);
        refreshWarningState();
    }
}

/**
 *
 * @param providersSelector
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'providersSelector' implicitly has an 'a... Remove this comment to see the full error message
export function updateNanoGptProvidersWarning(providersSelector) {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const $providers = $(providersSelector);

    if ($providers.length === 0) {
        return;
    }

    const providersEl = $providers[0];
    const selectedCount = providersEl?.querySelectorAll('option:checked').length ?? 0;
    const applicableSelectedCount = providersEl?.querySelectorAll('option:checked:not([disabled])').length ?? 0;
    const showWarning = selectedCount > 0 && applicableSelectedCount === 0;

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#nanogpt_provider_warning').toggleClass('displayNone', !showWarning);
}

/**
 *
 * @param data
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export async function loadOllamaModels(data) {
    if (!Array.isArray(data)) {
        console.error('Invalid Ollama models data', data);
        return;
    }

    if (!data.find(x => x.id === textgen_settings.ollama_model)) {
        textgen_settings.ollama_model = data[0]?.id || '';
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#ollama_model').empty();
    for (const model of data) {
        const option = document.createElement('option');
        option.value = model.id;
        option.text = model.name;
        option.selected = model.id === textgen_settings.ollama_model;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#ollama_model').append(option);
    }
}

/**
 *
 * @param data
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export async function loadTabbyModels(data) {
    if (!Array.isArray(data)) {
        console.error('Invalid Tabby models data', data);
        return;
    }

    tabbyModels = data;
    tabbyModels.sort((a, b) => a.id.localeCompare(b.id));
    tabbyModels.unshift({ id: '' });

    if (!tabbyModels.find(x => x.id === textgen_settings.tabby_model)) {
        textgen_settings.tabby_model = tabbyModels[0]?.id || '';
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#tabby_model').empty();
    for (const model of tabbyModels) {
        const option = document.createElement('option');
        option.value = model.id;
        option.text = model.id;
        option.selected = model.id === textgen_settings.tabby_model;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#tabby_model').append(option);
    }
}

/**
 *
 * @param data
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export async function loadLlamaCppModels(data) {
    if (!Array.isArray(data)) {
        console.error('Invalid llama.cpp models data', data);
        return;
    }

    llamacppModels = data;
    llamacppModels.sort((a, b) => a.id.localeCompare(b.id));
    llamacppModels.unshift({ id: '' });

    if (!llamacppModels.find(x => x.id === textgen_settings.llamacpp_model)) {
        textgen_settings.llamacpp_model = llamacppModels[0]?.id || '';
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#llamacpp_model').empty();
    for (const model of llamacppModels) {
        const option = document.createElement('option');
        option.value = model.id;
        option.text = model.id;
        option.selected = model.id === textgen_settings.llamacpp_model;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#llamacpp_model').append(option);
    }
}

/**
 *
 * @param data
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export async function loadTogetherAIModels(data) {
    if (!Array.isArray(data)) {
        console.error('Invalid Together AI models data', data);
        return;
    }

    data.sort((a, b) => a.id.localeCompare(b.id));
    togetherModels = data;

    if (!data.find(x => x.id === textgen_settings.togetherai_model)) {
        textgen_settings.togetherai_model = data[0]?.id || '';
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#model_togetherai_select').empty();
    for (const model of data) {
        // Hey buddy, I think you've got the wrong door.
        if (model.type === 'image') {
            continue;
        }

        const option = document.createElement('option');
        option.value = model.id;
        option.text = model.display_name;
        option.selected = model.id === textgen_settings.togetherai_model;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#model_togetherai_select').append(option);
    }
}

/**
 *
 * @param data
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export async function loadInfermaticAIModels(data) {
    if (!Array.isArray(data)) {
        console.error('Invalid Infermatic AI models data', data);
        return;
    }

    data.sort((a, b) => a.id.localeCompare(b.id));
    infermaticAIModels = data;

    if (!data.find(x => x.id === textgen_settings.infermaticai_model)) {
        textgen_settings.infermaticai_model = data[0]?.id || '';
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#model_infermaticai_select').empty();
    for (const model of data) {
        if (model.display_type === 'image') {
            continue;
        }

        const option = document.createElement('option');
        option.value = model.id;
        option.text = model.id;
        option.selected = model.id === textgen_settings.infermaticai_model;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#model_infermaticai_select').append(option);
    }
}

/**
 *
 * @param data
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export function loadGenericModels(data) {
    if (!Array.isArray(data)) {
        console.error('Invalid Generic models data', data);
        return;
    }

    data.sort((a, b) => a.id.localeCompare(b.id));
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const dataList = $('#generic_model_fill');
    dataList.empty();

    for (const model of data) {
        const option = document.createElement('option');
        option.value = model.id;
        option.text = model.id;
        dataList.append(option);
    }
}

/**
 *
 * @param data
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export async function loadDreamGenModels(data) {
    if (!Array.isArray(data)) {
        console.error('Invalid DreamGen models data', data);
        return;
    }

    dreamGenModels = data;

    if (!data.find(x => x.id === textgen_settings.dreamgen_model)) {
        textgen_settings.dreamgen_model = data[0]?.id || '';
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#model_dreamgen_select').empty();
    for (const model of data) {
        if (model.display_type === 'image') {
            continue;
        }

        const option = document.createElement('option');
        option.value = model.id;
        option.text = model.id;
        option.selected = model.id === textgen_settings.dreamgen_model;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#model_dreamgen_select').append(option);
    }
}

/**
 *
 * @param data
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export async function loadMancerModels(data) {
    if (!Array.isArray(data)) {
        console.error('Invalid Mancer models data', data);
        return;
    }

    data.sort((a, b) => a.name.localeCompare(b.name));
    mancerModels = data;

    if (!data.find(x => x.id === textgen_settings.mancer_model)) {
        textgen_settings.mancer_model = data[0]?.id || '';
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#mancer_model').empty();
    for (const model of data) {
        const option = document.createElement('option');
        option.value = model.id;
        option.text = model.name;
        option.selected = model.id === textgen_settings.mancer_model;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#mancer_model').append(option);
    }
}

/**
 *
 * @param data
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export async function loadOpenRouterModels(data) {
    if (!Array.isArray(data)) {
        console.error('Invalid OpenRouter models data', data);
        return;
    }

    data.sort((a, b) => a.name.localeCompare(b.name));
    // @ts-expect-error TS(2322) FIXME: Type 'any[]' is not assignable to type 'never[]'.
    openRouterModels = data;

    if (!data.find(x => x.id === textgen_settings.openrouter_model)) {
        textgen_settings.openrouter_model = data[0]?.id || '';
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#openrouter_model').empty();
    for (const model of data) {
        const option = document.createElement('option');
        option.value = model.id;
        option.text = model.name;
        option.selected = model.id === textgen_settings.openrouter_model;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#openrouter_model').append(option);
    }

    // Calculate the cost of the selected model + update on settings change
    calculateOpenRouterCost();
    syncOpenRouterProvidersForModel(textgen_settings.openrouter_model, '#openrouter_providers_text');
}

/**
 *
 * @param data
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export async function loadVllmModels(data) {
    if (!Array.isArray(data)) {
        console.error('Invalid vLLM models data', data);
        return;
    }

    vllmModels = data;

    if (!data.find(x => x.id === textgen_settings.vllm_model)) {
        textgen_settings.vllm_model = data[0]?.id || '';
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#vllm_model').empty();
    for (const model of data) {
        const option = document.createElement('option');
        option.value = model.id;
        option.text = model.id;
        option.selected = model.id === textgen_settings.vllm_model;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#vllm_model').append(option);
    }
}

/**
 *
 * @param data
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export async function loadAphroditeModels(data) {
    if (!Array.isArray(data)) {
        console.error('Invalid Aphrodite models data', data);
        return;
    }

    aphroditeModels = data;

    if (!data.find(x => x.id === textgen_settings.aphrodite_model)) {
        textgen_settings.aphrodite_model = data[0]?.id || '';
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#aphrodite_model').empty();
    for (const model of data) {
        const option = document.createElement('option');
        option.value = model.id;
        option.text = model.id;
        option.selected = model.id === textgen_settings.aphrodite_model;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#aphrodite_model').append(option);
    }
}

let featherlessCurrentPage = 1;
/**
 *
 * @param data
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export async function loadFeatherlessModels(data) {
    const searchBar = document.getElementById('featherless_model_search_bar');
    const modelCardBlock = document.getElementById('featherless_model_card_block');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const paginationContainer = $('#featherless_model_pagination_container');
    const sortOrderSelect = document.getElementById('featherless_model_sort_order');
    const classSelect = document.getElementById('featherless_class_selection');
    const categoriesSelect = document.getElementById('featherless_category_selection');
    const storageKey = 'FeatherlessModels_PerPage';

    // Store the original models data for search and filtering
    // @ts-expect-error TS(7034) FIXME: Variable 'originalModels' implicitly has type 'any... Remove this comment to see the full error message
    let originalModels = [];

    if (!Array.isArray(data)) {
        console.error('Invalid Featherless models data', data);
        return;
    }

    originalModels = data;  // Store the original data for search
    featherlessModels = data;

    if (!data.find(x => x.id === textgen_settings.featherless_model)) {
        textgen_settings.featherless_model = data[0]?.id || '';
    }

    // Populate class select options with unique classes
    populateClassSelection(data);

    // Retrieve the stored number of items per page or default to 10
    const perPage = Number(accountStorage.getItem(storageKey)) || 10;

    // Initialize pagination
    applyFiltersAndSort();

    // Function to set up pagination (also used for filtered results)
    /**
     *
     * @param models
     * @param perPage
     * @param pageNumber
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'models' implicitly has an 'any' type.
    function setupPagination(models, perPage, pageNumber = featherlessCurrentPage) {
        paginationContainer.pagination({
            dataSource: models,
            pageSize: perPage,
            pageNumber: pageNumber,
            sizeChangerOptions: [6, 10, 26, 50, 100, 250, 500, 1000],
            pageRange: 1,
            showPageNumbers: true,
            showSizeChanger: false,
            prevText: '<',
            nextText: '>',
            formatNavigator: PAGINATION_TEMPLATE,
            showNavigator: true,
            // @ts-expect-error TS(7006) FIXME: Parameter 'modelsOnPage' implicitly has an 'any' t... Remove this comment to see the full error message
            callback: function (modelsOnPage, pagination) {
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                modelCardBlock.innerHTML = '';

                // @ts-expect-error TS(7006) FIXME: Parameter 'model' implicitly has an 'any' type.
                modelsOnPage.forEach(model => {
                    const card = document.createElement('div');
                    card.classList.add('model-card');

                    const modelNameContainer = document.createElement('div');
                    modelNameContainer.classList.add('model-name-container');

                    const modelTitle = document.createElement('div');
                    modelTitle.classList.add('model-title');
                    modelTitle.textContent = model.id.replace(/_/g, '_\u200B');
                    modelNameContainer.appendChild(modelTitle);

                    const detailsContainer = document.createElement('div');
                    detailsContainer.classList.add('details-container');

                    const modelClassDiv = document.createElement('div');
                    modelClassDiv.classList.add('model-class');
                    modelClassDiv.textContent = t`Class` + `: ${model.model_class || 'N/A'}`;

                    const contextLengthDiv = document.createElement('div');
                    contextLengthDiv.classList.add('model-context-length');
                    contextLengthDiv.textContent = t`Context Length` + `: ${model.context_length}`;

                    const dateAddedDiv = document.createElement('div');
                    dateAddedDiv.classList.add('model-date-added');
                    dateAddedDiv.textContent = t`Added On` + `: ${new Date(model.created * 1000).toLocaleDateString()}`;

                    detailsContainer.appendChild(modelClassDiv);
                    detailsContainer.appendChild(contextLengthDiv);
                    detailsContainer.appendChild(dateAddedDiv);

                    card.appendChild(modelNameContainer);
                    card.appendChild(detailsContainer);

                    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                    modelCardBlock.appendChild(card);

                    if (model.id === textgen_settings.featherless_model) {
                        card.classList.add('selected');
                    }

                    card.addEventListener('click', function () {
                        document.querySelectorAll('.model-card').forEach(c => c.classList.remove('selected'));
                        card.classList.add('selected');
                        onFeatherlessModelSelect(model.id);
                    });
                });

                // Update the current page value whenever the page changes
                featherlessCurrentPage = pagination.pageNumber;
                localizePagination(paginationContainer);
            },
            // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
            afterSizeSelectorChange: function (e) {
                const newPerPage = e.target.value;
                accountStorage.setItem(storageKey, newPerPage);
                setupPagination(models, Number(newPerPage), featherlessCurrentPage); // Use the stored current page number
            },
        });
    }

    // Unset previously added listeners
    searchBar?.removeEventListener('input', applyFiltersAndSort);
    sortOrderSelect?.removeEventListener('change', applyFiltersAndSort);
    classSelect?.removeEventListener('change', applyFiltersAndSort);
    categoriesSelect?.removeEventListener('change', applyFiltersAndSort);

    // Add event listener for input on the search bar
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    searchBar.addEventListener('input', applyFiltersAndSort);

    // Add event listener for the sort order select
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    sortOrderSelect.addEventListener('change', applyFiltersAndSort);

    // Add event listener for the class select
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    classSelect.addEventListener('change', applyFiltersAndSort);

    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    categoriesSelect.addEventListener('change', applyFiltersAndSort);

    // Function to populate class selection dropdown
    /**
     *
     * @param models
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'models' implicitly has an 'any' type.
    function populateClassSelection(models) {
        // @ts-expect-error TS(7006) FIXME: Parameter 'model' implicitly has an 'any' type.
        const uniqueClasses = [...new Set(models.map(model => model.model_class).filter(Boolean))];  // Get unique class names
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        uniqueClasses.sort((a, b) => a.localeCompare(b));
        uniqueClasses.forEach(className => {
            const option = document.createElement('option');
            // @ts-expect-error TS(2322) FIXME: Type 'unknown' is not assignable to type 'string'.
            option.value = className;
            // @ts-expect-error TS(2322) FIXME: Type 'unknown' is not assignable to type 'string |... Remove this comment to see the full error message
            option.textContent = className;
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            classSelect.appendChild(option);
        });
    }

    // Function to apply sorting and filtering based on user input
    /**
     *
     */
    async function applyFiltersAndSort() {
        if (!(searchBar instanceof HTMLInputElement) ||
            !(sortOrderSelect instanceof HTMLSelectElement) ||
            !(classSelect instanceof HTMLSelectElement) ||
            !(categoriesSelect instanceof HTMLSelectElement)) {
            return;
        }
        const searchQuery = searchBar.value.toLowerCase();
        const selectedSortOrder = sortOrderSelect.value;
        const selectedClass = classSelect.value;
        const selectedCategory = categoriesSelect.value;
        let featherlessTop = [];
        let featherlessNew = [];

        if (selectedCategory === 'Top') {
            featherlessTop = await fetchFeatherlessStats();
        }
        // @ts-expect-error TS(7006) FIXME: Parameter 'stat' implicitly has an 'any' type.
        const featherlessIds = featherlessTop.map(stat => stat.id);

        if (selectedCategory === 'New') {
            featherlessNew = await fetchFeatherlessNew();
        }
        // @ts-expect-error TS(7006) FIXME: Parameter 'stat' implicitly has an 'any' type.
        const featherlessNewIds = featherlessNew.map(stat => stat.id);

        // @ts-expect-error TS(7005) FIXME: Variable 'originalModels' implicitly has an 'any[]... Remove this comment to see the full error message
        const filteredModels = originalModels.filter(model => {
            const matchesSearch = model.id.toLowerCase().includes(searchQuery);
            const matchesClass = selectedClass ? model.model_class === selectedClass : true;
            const matchesTop = featherlessIds.includes(model.id);
            const matchesNew = featherlessNewIds.includes(model.id);

            if (selectedCategory === 'All') {
                return matchesSearch && matchesClass;
            } else if (selectedCategory === 'Top') {
                return matchesSearch && matchesClass && matchesTop;
            } else if (selectedCategory === 'New') {
                return matchesSearch && matchesClass && matchesNew;
            } else {
                return matchesSearch && matchesClass;
            }
        });

        if (selectedSortOrder === 'asc') {
            filteredModels.sort((a, b) => a.id.localeCompare(b.id));
        } else if (selectedSortOrder === 'desc') {
            filteredModels.sort((a, b) => b.id.localeCompare(a.id));
        } else if (selectedSortOrder === 'date_asc') {
            filteredModels.sort((a, b) => a.created - b.created);
        } else if (selectedSortOrder === 'date_desc') {
            filteredModels.sort((a, b) => b.created - a.created);
        }

        const currentModelIndex = filteredModels.findIndex(x => x.id === textgen_settings.featherless_model);
        featherlessCurrentPage = currentModelIndex >= 0 ? (currentModelIndex / perPage) + 1 : 1;

        setupPagination(filteredModels, Number(accountStorage.getItem(storageKey)) || perPage, featherlessCurrentPage);
    }

    // Required to keep the /model command function
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#featherless_model').empty();
    for (const model of data) {
        const option = document.createElement('option');
        option.value = model.id;
        option.text = model.id;
        option.selected = model.id === textgen_settings.featherless_model;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#featherless_model').append(option);
    }
}

/**
 *
 */
async function fetchFeatherlessStats() {
    const response = await fetch('https://api.featherless.ai/feather/popular');
    const data = await response.json();
    return data.popular;
}

/**
 *
 */
async function fetchFeatherlessNew() {
    const response = await fetch('https://api.featherless.ai/feather/models?sort=-created_at&perPage=20');
    const data = await response.json();
    return data.items;
}

/**
 *
 * @param modelId
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'modelId' implicitly has an 'any' type.
function onFeatherlessModelSelect(modelId) {
    // @ts-expect-error TS(7005) FIXME: Variable 'featherlessModels' implicitly has an 'an... Remove this comment to see the full error message
    const model = featherlessModels.find(x => x.id === modelId);
    textgen_settings.featherless_model = modelId;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#featherless_model').val(modelId);
    document.getElementById('api_button_textgenerationwebui')?.click();
    setGenerationParamsFromPreset({ max_length: model.context_length });
}
let featherlessIsGridView = false;  // Default state set to grid view

// Ensure the correct initial view is applied when the page loads
document.addEventListener('DOMContentLoaded', function () {
    const modelCardBlock = document.getElementById('featherless_model_card_block');
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    modelCardBlock.classList.add('list-view');

    const toggleButton = document.getElementById('featherless_model_grid_toggle');
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    toggleButton.addEventListener('click', function () {
        // Toggle between grid and list view
        if (featherlessIsGridView) {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            modelCardBlock.classList.remove('grid-view');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            modelCardBlock.classList.add('list-view');
            this.title = 'Toggle to grid view';
        } else {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            modelCardBlock.classList.remove('list-view');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            modelCardBlock.classList.add('grid-view');
            this.title = 'Toggle to list view';
        }

        featherlessIsGridView = !featherlessIsGridView;
    });
});
/**
 *
 */
function onMancerModelSelect() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const modelId = String($('#mancer_model').val());
    textgen_settings.mancer_model = modelId;
    document.getElementById('api_button_textgenerationwebui')?.click();

    // @ts-expect-error TS(7005) FIXME: Variable 'mancerModels' implicitly has an 'any[]' ... Remove this comment to see the full error message
    const limits = mancerModels.find(x => x.id === modelId)?.limits;
    setGenerationParamsFromPreset({ max_length: limits.context });
}

/**
 *
 */
function onTogetherModelSelect() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const modelName = String($('#model_togetherai_select').val());
    textgen_settings.togetherai_model = modelName;
    document.getElementById('api_button_textgenerationwebui')?.click();
    // @ts-expect-error TS(7005) FIXME: Variable 'togetherModels' implicitly has an 'any[]... Remove this comment to see the full error message
    const model = togetherModels.find(x => x.id === modelName);
    setGenerationParamsFromPreset({ max_length: model.context_length });
}

/**
 *
 */
function onInfermaticAIModelSelect() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const modelName = String($('#model_infermaticai_select').val());
    textgen_settings.infermaticai_model = modelName;
    document.getElementById('api_button_textgenerationwebui')?.click();
    // @ts-expect-error TS(7005) FIXME: Variable 'infermaticAIModels' implicitly has an 'a... Remove this comment to see the full error message
    const model = infermaticAIModels.find(x => x.id === modelName);
    setGenerationParamsFromPreset({ max_length: model.context_length });
}

/**
 *
 */
function onDreamGenModelSelect() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const modelName = String($('#model_dreamgen_select').val());
    textgen_settings.dreamgen_model = modelName;
    document.getElementById('api_button_textgenerationwebui')?.click();
    // TODO(DreamGen): Consider retuning max_tokens from API and setting it here.
}

/**
 *
 */
function onOllamaModelSelect() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const modelId = String($('#ollama_model').val());
    textgen_settings.ollama_model = modelId;
    document.getElementById('api_button_textgenerationwebui')?.click();
}

/**
 *
 */
function onTabbyModelSelect() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const modelId = String($('#tabby_model').val());
    textgen_settings.tabby_model = modelId;
    document.getElementById('api_button_textgenerationwebui')?.click();
}

/**
 *
 */
function onLlamaCppModelSelect() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const modelId = String($('#llamacpp_model').val());
    textgen_settings.llamacpp_model = modelId;
    document.getElementById('api_button_textgenerationwebui')?.click();
}

/**
 *
 */
function onOpenRouterModelSelect() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const modelId = String($('#openrouter_model').val());
    textgen_settings.openrouter_model = modelId;
    document.getElementById('api_button_textgenerationwebui')?.click();
    // @ts-expect-error TS(2339) FIXME: Property 'id' does not exist on type 'never'.
    const model = openRouterModels.find(x => x.id === modelId);
    syncOpenRouterProvidersForModel(modelId, '#openrouter_providers_text');
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    setGenerationParamsFromPreset({ max_length: model.context_length });
}

/**
 *
 */
function onVllmModelSelect() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const modelId = String($('#vllm_model').val());
    textgen_settings.vllm_model = modelId;
    document.getElementById('api_button_textgenerationwebui')?.click();
}

/**
 *
 */
function onAphroditeModelSelect() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const modelId = String($('#aphrodite_model').val());
    textgen_settings.aphrodite_model = modelId;
    document.getElementById('api_button_textgenerationwebui')?.click();
}

/**
 *
 * @param option
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'option' implicitly has an 'any' type.
function getMancerModelTemplate(option) {
    // @ts-expect-error TS(7005) FIXME: Variable 'mancerModels' implicitly has an 'any[]' ... Remove this comment to see the full error message
    const model = mancerModels.find(x => x.id === option?.element?.value);

    if (!option.id || !model) {
        return option.text;
    }

    const creditsPerPrompt = (model.limits?.context - model.limits?.completion) * model.pricing?.prompt;
    const creditsPerCompletion = model.limits?.completion * model.pricing?.completion;
    const creditsTotal = Math.round(creditsPerPrompt + creditsPerCompletion).toFixed(0);

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    return $((`
        <div class="flex-container flexFlowColumn">
            <div><strong>${DOMPurify.sanitize(model.name)}</strong> | <span>${model.limits?.context} ctx</span> / <span>${model.limits?.completion} res</span> | <small>Credits per request (max): ${creditsTotal}</small></div>
        </div>
    `));
}

/**
 *
 * @param option
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'option' implicitly has an 'any' type.
function getTogetherModelTemplate(option) {
    // @ts-expect-error TS(7005) FIXME: Variable 'togetherModels' implicitly has an 'any[]... Remove this comment to see the full error message
    const model = togetherModels.find(x => x.id === option?.element?.value);

    if (!option.id || !model) {
        return option.text;
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    return $((`
        <div class="flex-container flexFlowColumn">
            <div><strong>${DOMPurify.sanitize(model.id)}</strong> | <span>${model.context_length || '???'} tokens</span></div>
            <div><small>${DOMPurify.sanitize(model.description)}</small></div>
        </div>
    `));
}

/**
 *
 * @param option
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'option' implicitly has an 'any' type.
function getInfermaticAIModelTemplate(option) {
    // @ts-expect-error TS(7005) FIXME: Variable 'infermaticAIModels' implicitly has an 'a... Remove this comment to see the full error message
    const model = infermaticAIModels.find(x => x.id === option?.element?.value);

    if (!option.id || !model) {
        return option.text;
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    return $((`
        <div class="flex-container flexFlowColumn">
            <div><strong>${DOMPurify.sanitize(model.id)}</strong></div>
        </div>
    `));
}

/**
 *
 * @param option
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'option' implicitly has an 'any' type.
function getDreamGenModelTemplate(option) {
    // @ts-expect-error TS(7005) FIXME: Variable 'dreamGenModels' implicitly has an 'any[]... Remove this comment to see the full error message
    const model = dreamGenModels.find(x => x.id === option?.element?.value);

    if (!option.id || !model) {
        return option.text;
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    return $((`
        <div class="flex-container flexFlowColumn">
            <div><strong>${DOMPurify.sanitize(model.id)}</strong></div>
        </div>
    `));
}

/**
 *
 * @param option
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'option' implicitly has an 'any' type.
function getOpenRouterModelTemplate(option) {
    // @ts-expect-error TS(2339) FIXME: Property 'id' does not exist on type 'never'.
    const model = openRouterModels.find(x => x.id === option?.element?.value);

    if (!option.id || !model) {
        return option.text;
    }

    // @ts-expect-error TS(2339) FIXME: Property 'pricing' does not exist on type 'never'.
    const tokens_dollar = Number(1 / (1000 * model.pricing?.prompt));
    const tokens_rounded = (Math.round(tokens_dollar * 1000) / 1000).toFixed(0);

    // @ts-expect-error TS(2339) FIXME: Property 'pricing' does not exist on type 'never'.
    const price = 0 === Number(model.pricing?.prompt) ? 'Free' : `${tokens_rounded}k t/$ `;

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    return $((`
        <div class="flex-container flexFlowColumn" title="${DOMPurify.sanitize((model as Record<string, unknown>).id as string)}">
            <div><strong>${DOMPurify.sanitize((model as Record<string, unknown>).name as string)}</strong> | ${String((model as Record<string, unknown>).context_length ?? '')} ctx | <small>${price}</small></div>
        </div>
    `));
}

/**
 *
 * @param option
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'option' implicitly has an 'any' type.
function getVllmModelTemplate(option) {
    // @ts-expect-error TS(7005) FIXME: Variable 'vllmModels' implicitly has an 'any[]' ty... Remove this comment to see the full error message
    const model = vllmModels.find(x => x.id === option?.element?.value);

    if (!option.id || !model) {
        return option.text;
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    return $((`
        <div class="flex-container flexFlowColumn">
            <div><strong>${DOMPurify.sanitize(model.id)}</strong></div>
        </div>
    `));
}

/**
 *
 * @param option
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'option' implicitly has an 'any' type.
function getAphroditeModelTemplate(option) {
    // @ts-expect-error TS(7005) FIXME: Variable 'aphroditeModels' implicitly has an 'any[... Remove this comment to see the full error message
    const model = aphroditeModels.find(x => x.id === option?.element?.value);

    if (!option.id || !model) {
        return option.text;
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    return $((`
        <div class="flex-container flexFlowColumn">
            <div><strong>${DOMPurify.sanitize(model.id)}</strong></div>
        </div>
    `));
}

/**
 *
 */
async function downloadOllamaModel() {
    try {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        const serverUrl = textgen_settings.server_urls[textgen_types.OLLAMA];

        if (!serverUrl) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.info('Please connect to an Ollama server first.');
            return;
        }

        const html = `Enter a model tag, for example <code>llama2:latest</code>.<br>
        See <a target="_blank" href="https://ollama.ai/library">Library</a> for available models.`;
        const name = await callGenericPopup(html, POPUP_TYPE.INPUT, '', { okButton: 'Download' });

        if (!name) {
            return;
        }

        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info('Download may take a while, please wait...', 'Working on it');

        const response = await fetch('/api/backends/text-completions/ollama/download', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                name: name,
                api_server: serverUrl,
            }),
        });

        if (!response.ok) {
            throw new Error(response.statusText);
        }

        // Force refresh the model list
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success('Download complete. Please select the model from the dropdown.');
        document.getElementById('api_button_textgenerationwebui')?.click();
    } catch (err) {
        console.error(err);
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error('Failed to download Ollama model. Please try again.');
    }
}

/**
 *
 */
async function downloadTabbyModel() {
    try {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        const serverUrl = textgen_settings.server_urls[textgen_types.TABBY];

        if (online_status === 'no_connection' || !serverUrl) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.info('Please connect to a TabbyAPI server first.');
            return;
        }

        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const downloadHtml = $(await renderTemplateAsync('tabbyDownloader'));
        const popupResult = await callGenericPopup(downloadHtml, POPUP_TYPE.CONFIRM, '', { okButton: 'Download', cancelButton: 'Cancel' });

        // User cancelled the download
        if (!popupResult) {
            return;
        }

        const repoId = String(downloadHtml[0].querySelector('input[name="hf_repo_id"]')?.value ?? '');
        if (!repoId) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error('A HuggingFace repo ID must be provided. Skipping Download.');
            return;
        }

        if (repoId.split('/').length !== 2) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error('A HuggingFace repo ID must be formatted as Author/Name. Please try again.');
            return;
        }

        const params = {
            repo_id: repoId,
            folder_name: downloadHtml[0].querySelector('input[name="folder_name"]')?.value || undefined,
            revision: downloadHtml[0].querySelector('input[name="revision"]')?.value || undefined,
            token: downloadHtml[0].querySelector('input[name="hf_token"]')?.value || undefined,
        };

        for (const suffix of ['include', 'exclude']) {
            const patterns = String(downloadHtml[0].querySelector(`textarea[name="tabby_download_${suffix}"]`)?.value ?? '');
            if (patterns) {
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                params[suffix] = patterns.split('\n');
            }
        }

        // Params for the server side of ST
        // @ts-expect-error TS(2339) FIXME: Property 'api_server' does not exist on type '{ re... Remove this comment to see the full error message
        params.api_server = serverUrl;
        // @ts-expect-error TS(2339) FIXME: Property 'api_type' does not exist on type '{ repo... Remove this comment to see the full error message
        params.api_type = textgen_settings.type;

        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info('Downloading. Check the Tabby console for progress reports.');

        const response = await fetch('/api/backends/text-completions/tabby/download', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(params),
        });

        if (response.status === 403) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error('The provided key has invalid permissions. Please use an admin key for downloading.');
            return;
        } else if (!response.ok) {
            throw new Error(response.statusText);
        }

        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success('Download complete.');
    } catch (err) {
        console.error(err);
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error('Failed to download HuggingFace model in TabbyAPI. Please try again.');
    }
}

/**
 *
 */
function calculateOpenRouterCost() {
    if (textgen_settings.type !== textgen_types.OPENROUTER) {
        return;
    }

    let cost = 'Unknown';
    // @ts-expect-error TS(2339) FIXME: Property 'id' does not exist on type 'never'.
    const model = openRouterModels.find(x => x.id === textgen_settings.openrouter_model);

    // @ts-expect-error TS(2339) FIXME: Property 'pricing' does not exist on type 'never'.
    if (model?.pricing) {
        // @ts-expect-error TS(2339) FIXME: Property 'pricing' does not exist on type 'never'.
        const completionCost = Number(model.pricing.completion);
        // @ts-expect-error TS(2339) FIXME: Property 'pricing' does not exist on type 'never'.
        const promptCost = Number(model.pricing.prompt);
        const completionTokens = amount_gen;
        const promptTokens = (max_context - completionTokens);
        const totalCost = (completionCost * completionTokens) + (promptCost * promptTokens);
        if (!isNaN(totalCost)) {
            cost = '$' + totalCost.toFixed(3);
        }
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#or_prompt_cost').text(cost);

    // Schedule an update when settings change
    eventSource.removeListener(event_types.SETTINGS_UPDATED, calculateOpenRouterCost);
    eventSource.once(event_types.SETTINGS_UPDATED, calculateOpenRouterCost);
}

/**
 *
 */
export function getCurrentOpenRouterModelTokenizer() {
    const modelId = textgen_settings.openrouter_model;
    // @ts-expect-error TS(2339) FIXME: Property 'id' does not exist on type 'never'.
    const model = openRouterModels.find(x => x.id === modelId);
    if (modelId?.includes('jamba')) {
        return tokenizers.JAMBA;
    }
    // @ts-expect-error TS(2339) FIXME: Property 'architecture' does not exist on type 'ne... Remove this comment to see the full error message
    switch (model?.architecture?.tokenizer) {
        case 'Llama2':
            return tokenizers.LLAMA;
        case 'Llama3':
            return tokenizers.LLAMA3;
        case 'Yi':
            return tokenizers.YI;
        case 'Mistral':
            return tokenizers.MISTRAL;
        case 'Gemini':
            return tokenizers.GEMMA;
        case 'Claude':
            return tokenizers.CLAUDE;
        case 'Cohere':
            return tokenizers.COMMAND_R;
        case 'Qwen':
            return tokenizers.QWEN2;
        default:
            return tokenizers.OPENAI;
    }
}

/**
 *
 */
export function getCurrentDreamGenModelTokenizer() {
    const modelId = textgen_settings.dreamgen_model;
    // @ts-expect-error TS(7005) FIXME: Variable 'dreamGenModels' implicitly has an 'any[]... Remove this comment to see the full error message
    const model = dreamGenModels.find(x => x.id === modelId);
    if (model.id.startsWith('lucid-v1-medium') || model.id.startsWith('lucid-v1-base')) {
        return tokenizers.MISTRAL;
    } else if (model.id.startsWith('lucid-v1-extra-large') || model.id.startsWith('lucid-v1-max')) {
        return tokenizers.LLAMA3;
    } else {
        return tokenizers.MISTRAL;
    }
}

/**
 *
 */
export function initTextGenModels() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#mancer_model').on('change', onMancerModelSelect);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#model_togetherai_select').on('change', onTogetherModelSelect);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#model_infermaticai_select').on('change', onInfermaticAIModelSelect);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#model_dreamgen_select').on('change', onDreamGenModelSelect);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#ollama_model').on('change', onOllamaModelSelect);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#openrouter_model').on('change', onOpenRouterModelSelect);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#ollama_download_model').on('click', downloadOllamaModel);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#vllm_model').on('change', onVllmModelSelect);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#aphrodite_model').on('change', onAphroditeModelSelect);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#tabby_download_model').on('click', downloadTabbyModel);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#tabby_model').on('change', onTabbyModelSelect);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#llamacpp_model').on('change', onLlamaCppModelSelect);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#featherless_model').on('change', () => onFeatherlessModelSelect(String($('#featherless_model').val())));

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const providersSelect = $('.openrouter_providers');
    for (const provider of OPENROUTER_PROVIDERS) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        providersSelect.append($('<option>', {
            value: provider,
            text: provider,
        }));
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const nanoGptProvidersSelect = $('#nanogpt_provider');
    for (const provider of NANOGPT_PROVIDERS) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        nanoGptProvidersSelect.append($('<option>', {
            value: provider.id,
            text: provider.label,
        }));
    }

    if (!isMobile()) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#mancer_model').select2({
            placeholder: t`Select a model`,
            searchInputPlaceholder: t`Search models...`,
            searchInputCssClass: 'text_pole',
            width: '100%',
            templateResult: getMancerModelTemplate,
        });
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#model_togetherai_select').select2({
            placeholder: t`Select a model`,
            searchInputPlaceholder: t`Search models...`,
            searchInputCssClass: 'text_pole',
            width: '100%',
            templateResult: getTogetherModelTemplate,
        });
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#ollama_model').select2({
            placeholder: t`Select a model`,
            searchInputPlaceholder: t`Search models...`,
            searchInputCssClass: 'text_pole',
            width: '100%',
        });
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#tabby_model').select2({
            placeholder: t`[Currently loaded]`,
            searchInputPlaceholder: t`Search models...`,
            searchInputCssClass: 'text_pole',
            width: '100%',
            allowClear: true,
        });
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#llamacpp_model').select2({
            placeholder: t`[Currently loaded]`,
            searchInputPlaceholder: t`Search models...`,
            searchInputCssClass: 'text_pole',
            width: '100%',
            allowClear: true,
        });
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#model_infermaticai_select').select2({
            placeholder: t`Select a model`,
            searchInputPlaceholder: t`Search models...`,
            searchInputCssClass: 'text_pole',
            width: '100%',
            templateResult: getInfermaticAIModelTemplate,
        });
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#model_dreamgen_select').select2({
            placeholder: t`Select a model`,
            searchInputPlaceholder: t`Search models...`,
            searchInputCssClass: 'text_pole',
            width: '100%',
            templateResult: getDreamGenModelTemplate,
        });
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#openrouter_model').select2({
            placeholder: t`Select a model`,
            searchInputPlaceholder: t`Search models...`,
            searchInputCssClass: 'text_pole',
            width: '100%',
            templateResult: getOpenRouterModelTemplate,
            matcher: textValueMatcher,
        });
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#vllm_model').select2({
            placeholder: t`Select a model`,
            searchInputPlaceholder: t`Search models...`,
            searchInputCssClass: 'text_pole',
            width: '100%',
            templateResult: getVllmModelTemplate,
        });
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#aphrodite_model').select2({
            placeholder: t`Select a model`,
            searchInputPlaceholder: t`Search models...`,
            searchInputCssClass: 'text_pole',
            width: '100%',
            templateResult: getAphroditeModelTemplate,
        });
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('.openrouter_quantizations').select2({
            closeOnSelect: false,
            placeholder: t`Select quantizations. No selection = all quantizations.`,
            searchInputCssClass: 'text_pole',
            searchInputPlaceholder: t`Search quantizations...`,
            width: '100%',
        });
        providersSelect.select2({
            // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
            sorter: data => data.sort((a, b) => a.text.localeCompare(b.text)),
            placeholder: t`Select providers. No selection = all providers.`,
            searchInputPlaceholder: t`Search providers...`,
            searchInputCssClass: 'text_pole',
            width: '100%',
            closeOnSelect: false,
        });
        providersSelect.on('select2:select', function (this: any, evt: any) {
            const element = evt.params.data.element;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const $element = $(element);

            $element.detach();
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(this).append($element);
            (this as HTMLSelectElement).dispatchEvent(new Event('change'));
        });
        nanoGptProvidersSelect.select2({
            // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
            sorter: data => data.sort((a, b) => a.text.localeCompare(b.text)),
            placeholder: t`Select providers. No selection = all providers.`,
            searchInputPlaceholder: t`Search providers...`,
            searchInputCssClass: 'text_pole',
            width: '100%',
            allowClear: true,
        });
    }
}
