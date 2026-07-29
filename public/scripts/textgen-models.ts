import { DOMPurify } from '../lib.js';
import { isMobile } from './RossAscends-mods.js';
import {
    amount_gen,
    eventSource,
    event_types,
    getRequestHeaders,
    max_context,
    online_status,
    setGenerationParamsFromPreset,
} from '../script.js';
import {
    textgenerationwebui_settings as textgen_settings,
    textgen_types,
} from './textgen-settings.js';
import { tokenizers } from './tokenizers.js';
import { renderTemplateAsync } from './templates.js';
import { POPUP_TYPE, callGenericPopup } from './popup.js';
import { t } from './i18n.js';
import { accountStorage } from './util/AccountStorage.js';
import { createPaginator } from './utils.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const TomSelect: any;

export interface ApiModel {
    id: string;
    name?: string;
    display_name?: string;
    type?: string;
    display_type?: string;
    context_length?: number;
    description?: string;
    model_class?: string;
    created?: number;
    pricing?: {
        prompt?: number;
        completion?: number;
    };
    limits?: {
        context?: number;
        completion?: number;
    };
}

let mancerModels: ApiModel[] = [];
let togetherModels: ApiModel[] = [];
let infermaticAIModels: ApiModel[] = [];
let dreamGenModels: ApiModel[] = [];
let vllmModels: ApiModel[] = [];
let aphroditeModels: ApiModel[] = [];
let featherlessModels: ApiModel[] = [];
let tabbyModels: ApiModel[] = [];
let llamacppModels: ApiModel[] = [];
export let openRouterModels: ApiModel[] = [];

/**
 * OpenRouter providers list, fetched from the backend on init.
 * @type {string[]}
 */
export let openRouterProviders: string[] = [];

/**
 * NanoGPT providers list, fetched from the backend on init.
 * @type {{id: string, label: string}[]}
 */
export let nanoGptProviders: { id: string; label: string }[] = [];

/**
 * Fetches the full OpenRouter provider list from the backend.
 */
export async function loadOpenRouterProviders(): Promise<void> {
    try {
        const res = await fetch('/api/openrouter/providers');
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) openRouterProviders = data;
        }
    } catch (e) {
        console.warn('Failed to load OpenRouter providers', e);
    }
}

/**
 * Fetches the full NanoGPT provider list from the backend.
 */
export async function loadNanoGptProviders(): Promise<void> {
    try {
        const res = await fetch('/api/nanogpt/providers');
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) nanoGptProviders = data;
        }
    } catch (e) {
        console.warn('Failed to load NanoGPT providers', e);
    }
}

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
export function updateOpenRouterProvidersWarning(providersSelector: string) {
    const providersEl = document.querySelector(providersSelector);

    const warningSelectors =
        OPENROUTER_PROVIDER_WARNING_SELECTORS[
            providersSelector as keyof typeof OPENROUTER_PROVIDER_WARNING_SELECTORS
        ];

    if (!providersEl || !warningSelectors) {
        return;
    }

    const fallbackEl = document.querySelector(warningSelectors.fallbackSelector);
    const warningEl = document.querySelector(warningSelectors.warningSelector);

    const allowFallback = !!(fallbackEl instanceof HTMLInputElement && fallbackEl.checked);
    const selectedCount = providersEl.querySelectorAll('option:checked').length ?? 0;
    const applicableSelectedCount =
        providersEl.querySelectorAll('option:checked:not([disabled])').length ?? 0;
    const showWarning = !allowFallback && selectedCount > 0 && applicableSelectedCount === 0;

    warningEl?.classList.toggle('displayNone', !showWarning);
}

/**
 *
 * @param modelId
 * @param providersSelector
 */
export async function syncOpenRouterProvidersForModel(modelId: string, providersSelector: string) {
    const providersEl = document.querySelector(providersSelector);

    const refreshWarningState = () => {
        updateOpenRouterProvidersWarning(providersSelector);
    };

    if (!modelId || !modelId.includes('/')) {
        enableAllOptions(providersEl);
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
            enableAllOptions(providersEl);
            refreshWarningState();
            return;
        }

        providersEl?.querySelectorAll('option').forEach((el: HTMLOptionElement) => {
            const isAvailable = providerNames.includes(el.value);
            el.disabled = !isAvailable;
        });

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
export async function syncNanoGptProvidersForModel(modelId: string, providersSelector: string) {
    const providersEl = document.querySelector(providersSelector);

    const refreshWarningState = () => {
        updateNanoGptProvidersWarning(providersSelector);
    };

    if (!modelId) {
        enableAllOptions(providersEl);
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
            disableAllOptions(providersEl, true);
            providersEl?.dispatchEvent(new Event('change'));
            refreshWarningState();
            return;
        }

        providersEl?.querySelectorAll('option').forEach((el: HTMLOptionElement) => {
            const value = el.value;
            const isAvailable = !value || providerIds.includes(value);
            el.disabled = !isAvailable;
        });

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
export function updateNanoGptProvidersWarning(providersSelector: string) {
    const providersEl = document.querySelector(providersSelector);

    if (!providersEl) {
        return;
    }

    const selectedCount = providersEl.querySelectorAll('option:checked').length ?? 0;
    const applicableSelectedCount =
        providersEl.querySelectorAll('option:checked:not([disabled])').length ?? 0;
    const showWarning = selectedCount > 0 && applicableSelectedCount === 0;

    document
        .getElementById('nanogpt_provider_warning')
        ?.classList.toggle('displayNone', !showWarning);
}

// ─── Helpers to reduce code duplication ────────────────────────────────────────

/**
 * Batch-populate a &lt;select&gt; (or &lt;datalist&gt;) with model &lt;option&gt; elements.
 * Uses a DocumentFragment for a single reflow and caches the element reference.
 *
 * @param selectEl  The target select or datalist element.
 * @param models    Array of models to render.
 * @param currentValue  Currently selected model id (matched against model.id).
 * @param options
 * @param options.labelFn   Display label. Default: `m.id`.
 * @param options.filterFn  Skip models that don't match. Default: all pass.
 */
function populateModelSelect(
    selectEl: HTMLElement | null,
    models: ApiModel[],
    currentValue: unknown,
    options?: {
        labelFn?: (model: ApiModel) => string;
        filterFn?: (model: ApiModel) => boolean;
    },
): void {
    if (!selectEl) return;

    const { labelFn = (m: ApiModel) => m.id, filterFn = () => true } = options ?? {};
    const selectedId = String(currentValue ?? '');

    selectEl.innerHTML = '';
    const frag = document.createDocumentFragment();

    for (const model of models) {
        if (!filterFn(model)) continue;
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = labelFn(model);
        option.selected = model.id === selectedId;
        frag.appendChild(option);
    }

    selectEl.appendChild(frag);
}

/**
 * Enable every &lt;option&gt; inside a provider select.
 */
function enableAllOptions(selectEl: Element | null): void {
    selectEl?.querySelectorAll('option').forEach((el) => {
        (el as HTMLOptionElement).disabled = false;
    });
}

/**
 * Disable every &lt;option&gt; inside a provider select.
 * @param selectEl  The select element.
 * @param skipEmpty  If true, options with an empty value are left enabled.
 */
function disableAllOptions(selectEl: Element | null, skipEmpty?: boolean): void {
    selectEl?.querySelectorAll('option').forEach((el) => {
        const opt = el as HTMLOptionElement;
        if (skipEmpty && !opt.value) return;
        opt.disabled = true;
    });
}

/**
 * @param data
 */
export async function loadOllamaModels(data: ApiModel[]) {
    if (!Array.isArray(data)) {
        console.error('Invalid Ollama models data', data);
        return;
    }

    if (!data.find((x) => x.id === textgen_settings.ollama_model)) {
        textgen_settings.ollama_model = data[0]?.id || '';
    }

    const ollamaSelect = document.getElementById('ollama_model');
    if (!ollamaSelect) return;

    // Populate native select options
    ollamaSelect.innerHTML = '';
    for (const model of data) {
        const option = document.createElement('option');
        option.value = model.id;
        option.text = model.name ?? model.id;
        option.selected = model.id === textgen_settings.ollama_model;
        ollamaSelect.appendChild(option);
    }

    const ollamaSelectAny = ollamaSelect as unknown as Record<string, unknown>;
    console.debug(
        '[Ollama] Populated',
        ((ollamaSelectAny as Record<string, unknown>).options as Record<string, unknown>[])
            ?.length ?? 'unknown',
        'options, tomSelect:',
        !!(ollamaSelectAny as Record<string, unknown>).tomSelect,
        'tomselect:',
        !!(ollamaSelectAny as Record<string, unknown>).tomselect,
    );
    const existingTs = ollamaSelectAny.tomSelect || ollamaSelectAny.tomselect;
    if (existingTs) {
        (existingTs as { sync: () => void }).sync();
        console.debug('[Ollama] sync() called');
    } else {
        // TomSelect not initialized — create it now
        ollamaSelectAny.tomSelect = new TomSelect(ollamaSelect, {
            maxItems: 1,
            placeholder: t`Select a model`,
        });
        console.debug('[Ollama] TomSelect created on demand');
    }
}

/**
 * @param data
 */
export async function loadTabbyModels(data: ApiModel[]) {
    if (!Array.isArray(data)) {
        console.error('Invalid Tabby models data', data);
        return;
    }

    tabbyModels = data;
    tabbyModels.sort((a, b) => a.id.localeCompare(b.id));
    tabbyModels.unshift({ id: '' });

    if (!tabbyModels.find((x) => x.id === textgen_settings.tabby_model)) {
        textgen_settings.tabby_model = tabbyModels[0]?.id || '';
    }

    populateModelSelect(
        document.getElementById('tabby_model'),
        tabbyModels,
        textgen_settings.tabby_model,
    );
}

/**
 *
 * @param data
 */
export async function loadLlamaCppModels(data: ApiModel[]) {
    if (!Array.isArray(data)) {
        console.error('Invalid llama.cpp models data', data);
        return;
    }

    llamacppModels = data;
    llamacppModels.sort((a, b) => a.id.localeCompare(b.id));
    llamacppModels.unshift({ id: '' });

    if (!llamacppModels.find((x) => x.id === textgen_settings.llamacpp_model)) {
        textgen_settings.llamacpp_model = llamacppModels[0]?.id || '';
    }

    populateModelSelect(
        document.getElementById('llamacpp_model'),
        llamacppModels,
        textgen_settings.llamacpp_model,
    );
}

/**
 *
 * @param data
 */
export async function loadTogetherAIModels(data: ApiModel[]) {
    if (!Array.isArray(data)) {
        console.error('Invalid Together AI models data', data);
        return;
    }

    data.sort((a, b) => a.id.localeCompare(b.id));
    togetherModels = data;

    if (!data.find((x) => x.id === textgen_settings.togetherai_model)) {
        textgen_settings.togetherai_model = data[0]?.id || '';
    }

    populateModelSelect(
        document.getElementById('model_togetherai_select'),
        data,
        textgen_settings.togetherai_model,
        {
            labelFn: (m) => m.display_name ?? m.id,
            filterFn: (m) => m.type !== 'image',
        },
    );
}

/**
 *
 * @param data
 */
export async function loadInfermaticAIModels(data: ApiModel[]) {
    if (!Array.isArray(data)) {
        console.error('Invalid Infermatic AI models data', data);
        return;
    }

    data.sort((a, b) => a.id.localeCompare(b.id));
    infermaticAIModels = data;

    if (!data.find((x) => x.id === textgen_settings.infermaticai_model)) {
        textgen_settings.infermaticai_model = data[0]?.id || '';
    }

    populateModelSelect(
        document.getElementById('model_infermaticai_select'),
        data,
        textgen_settings.infermaticai_model,
        {
            filterFn: (m) => m.display_type !== 'image',
        },
    );
}

/**
 *
 * @param data
 */
export function loadGenericModels(data: ApiModel[]) {
    if (!Array.isArray(data)) {
        console.error('Invalid Generic models data', data);
        return;
    }

    data.sort((a, b) => a.id.localeCompare(b.id));

    populateModelSelect(document.getElementById('generic_model_fill'), data, '');
}

/**
 *
 * @param data
 */
export async function loadDreamGenModels(data: ApiModel[]) {
    if (!Array.isArray(data)) {
        console.error('Invalid DreamGen models data', data);
        return;
    }

    dreamGenModels = data;

    if (!data.find((x) => x.id === textgen_settings.dreamgen_model)) {
        textgen_settings.dreamgen_model = data[0]?.id || '';
    }

    populateModelSelect(
        document.getElementById('model_dreamgen_select'),
        data,
        textgen_settings.dreamgen_model,
        {
            filterFn: (m) => m.display_type !== 'image',
        },
    );
}

/**
 *
 * @param data
 */
export async function loadMancerModels(data: ApiModel[]) {
    if (!Array.isArray(data)) {
        console.error('Invalid Mancer models data', data);
        return;
    }

    data.sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
    mancerModels = data;

    if (!data.find((x) => x.id === textgen_settings.mancer_model)) {
        textgen_settings.mancer_model = data[0]?.id || '';
    }

    populateModelSelect(
        document.getElementById('mancer_model'),
        data,
        textgen_settings.mancer_model,
        {
            labelFn: (m) => m.name ?? m.id,
        },
    );
}

/**
 *
 * @param data
 */
export async function loadOpenRouterModels(data: ApiModel[]) {
    if (!Array.isArray(data)) {
        console.error('Invalid OpenRouter models data', data);
        return;
    }

    data.sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
    openRouterModels = data;

    if (!data.find((x) => x.id === textgen_settings.openrouter_model)) {
        textgen_settings.openrouter_model = data[0]?.id || '';
    }

    populateModelSelect(
        document.getElementById('openrouter_model'),
        data,
        textgen_settings.openrouter_model,
        {
            labelFn: (m) => m.name ?? m.id,
        },
    );

    // Calculate the cost of the selected model + update on settings change
    calculateOpenRouterCost();
    syncOpenRouterProvidersForModel(
        textgen_settings.openrouter_model as string,
        '#openrouter_providers_text',
    );
}

/**
 *
 * @param data
 */
export async function loadVllmModels(data: ApiModel[]) {
    if (!Array.isArray(data)) {
        console.error('Invalid vLLM models data', data);
        return;
    }

    vllmModels = data;

    if (!data.find((x) => x.id === textgen_settings.vllm_model)) {
        textgen_settings.vllm_model = data[0]?.id || '';
    }

    populateModelSelect(document.getElementById('vllm_model'), data, textgen_settings.vllm_model);
}

/**
 *
 * @param data
 */
export async function loadAphroditeModels(data: ApiModel[]) {
    if (!Array.isArray(data)) {
        console.error('Invalid Aphrodite models data', data);
        return;
    }

    aphroditeModels = data;

    if (!data.find((x) => x.id === textgen_settings.aphrodite_model)) {
        textgen_settings.aphrodite_model = data[0]?.id || '';
    }

    populateModelSelect(
        document.getElementById('aphrodite_model'),
        data,
        textgen_settings.aphrodite_model,
    );
}
let featherlessCurrentPage = 1;

/**
 *
 * @param data
 */
export async function loadFeatherlessModels(data: ApiModel[]) {
    const searchBar = document.getElementById('featherless_model_search_bar');
    const modelCardBlock = document.getElementById('featherless_model_card_block');
    const paginationContainer = document.getElementById('featherless_model_pagination_container');
    const sortOrderSelect = document.getElementById('featherless_model_sort_order');
    const classSelect = document.getElementById('featherless_class_selection');
    const categoriesSelect = document.getElementById('featherless_category_selection');
    const storageKey = 'FeatherlessModels_PerPage';

    // Store the original models data for search and filtering
    let originalModels: ApiModel[] = [];

    if (!Array.isArray(data)) {
        console.error('Invalid Featherless models data', data);
        return;
    }

    originalModels = data; // Store the original data for search
    featherlessModels = data;

    if (!data.find((x) => x.id === textgen_settings.featherless_model)) {
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
    function setupPagination(
        models: ApiModel[],
        perPage: number,
        pageNumber: number = featherlessCurrentPage,
    ) {
        if (!paginationContainer) return;
        createPaginator(paginationContainer, {
            dataSource: models,
            pageSize: perPage,
            pageNumber: pageNumber,
            sizeChangerOptions: [6, 10, 26, 50, 100, 250, 500, 1000],
            showSizeChanger: false,
            showNavigator: true,
            prevText: '<',
            nextText: '>',
            callback: function (modelsOnPage: ApiModel[]) {
                if (modelCardBlock) modelCardBlock.innerHTML = '';

                modelsOnPage.forEach((model: ApiModel) => {
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
                    dateAddedDiv.textContent =
                        t`Added On` +
                        `: ${new Date((model.created ?? 0) * 1000).toLocaleDateString()}`;

                    detailsContainer.appendChild(modelClassDiv);
                    detailsContainer.appendChild(contextLengthDiv);
                    detailsContainer.appendChild(dateAddedDiv);

                    card.appendChild(modelNameContainer);
                    card.appendChild(detailsContainer);

                    modelCardBlock?.appendChild(card);

                    if (model.id === textgen_settings.featherless_model) {
                        card.classList.add('selected');
                    }

                    card.addEventListener('click', function () {
                        document
                            .querySelectorAll('.model-card')
                            .forEach((c) => c.classList.remove('selected'));
                        card.classList.add('selected');
                        onFeatherlessModelSelect(model.id);
                    });
                });
            },
        });
    }

    // Unset previously added listeners
    searchBar?.removeEventListener('input', applyFiltersAndSort);
    sortOrderSelect?.removeEventListener('change', applyFiltersAndSort);
    classSelect?.removeEventListener('change', applyFiltersAndSort);
    categoriesSelect?.removeEventListener('change', applyFiltersAndSort);

    // Add event listener for input on the search bar
    searchBar?.addEventListener('input', applyFiltersAndSort);

    // Add event listener for the sort order select
    sortOrderSelect?.addEventListener('change', applyFiltersAndSort);

    // Add event listener for the class select
    classSelect?.addEventListener('change', applyFiltersAndSort);

    categoriesSelect?.addEventListener('change', applyFiltersAndSort);

    // Function to populate class selection dropdown
    /**
     *
     * @param models
     */
    function populateClassSelection(models: ApiModel[]) {
        const uniqueClasses = [
            ...new Set(models.map((model) => model.model_class).filter(Boolean)),
        ] as string[]; // Get unique class names
        uniqueClasses.sort((a, b) => a.localeCompare(b));
        uniqueClasses.forEach((className) => {
            const option = document.createElement('option');
            option.value = className;
            option.textContent = className;
            classSelect?.appendChild(option);
        });
    }

    // Function to apply sorting and filtering based on user input
    /**
     *
     */
    async function applyFiltersAndSort() {
        if (
            !(searchBar instanceof HTMLInputElement) ||
            !(sortOrderSelect instanceof HTMLSelectElement) ||
            !(classSelect instanceof HTMLSelectElement) ||
            !(categoriesSelect instanceof HTMLSelectElement)
        ) {
            return;
        }
        const searchQuery = searchBar.value.toLowerCase();
        const selectedSortOrder = sortOrderSelect.value;
        const selectedClass = classSelect.value;
        const selectedCategory = categoriesSelect.value;
        let featherlessTop: { id: string }[] = [];
        let featherlessNew: { id: string }[] = [];

        if (selectedCategory === 'Top') {
            featherlessTop = await fetchFeatherlessStats();
        }
        const featherlessIds = new Set(featherlessTop.map((stat: { id: string }) => stat.id));

        if (selectedCategory === 'New') {
            featherlessNew = await fetchFeatherlessNew();
        }
        const featherlessNewIds = new Set(featherlessNew.map((stat: { id: string }) => stat.id));

        const filteredModels = originalModels.filter((model) => {
            const matchesSearch = model.id.toLowerCase().includes(searchQuery);
            const matchesClass = selectedClass ? model.model_class === selectedClass : true;
            const matchesTop = featherlessIds.has(model.id);
            const matchesNew = featherlessNewIds.has(model.id);

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
            filteredModels.sort((a, b) => (a.created ?? 0) - (b.created ?? 0));
        } else if (selectedSortOrder === 'date_desc') {
            filteredModels.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
        }

        const currentModelIndex = filteredModels.findIndex(
            (x) => x.id === textgen_settings.featherless_model,
        );
        featherlessCurrentPage = currentModelIndex >= 0 ? currentModelIndex / perPage + 1 : 1;

        setupPagination(
            filteredModels,
            Number(accountStorage.getItem(storageKey)) || perPage,
            featherlessCurrentPage,
        );
    }

    // Required to keep the /model command function
    populateModelSelect(
        document.getElementById('featherless_model'),
        data,
        textgen_settings.featherless_model,
    );
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
    const response = await fetch(
        'https://api.featherless.ai/feather/models?sort=-created_at&perPage=20',
    );
    const data = await response.json();
    return data.items;
}

/**
 *
 * @param modelId
 */
function onFeatherlessModelSelect(modelId: string) {
    const model = featherlessModels.find((x) => x.id === modelId);
    textgen_settings.featherless_model = modelId;
    (document.getElementById('featherless_model') as HTMLSelectElement | null)!.value = modelId;
    document.getElementById('api_button_textgenerationwebui')?.click();
    if (model) setGenerationParamsFromPreset({ max_length: model.context_length });
}
let featherlessIsGridView = false; // Default state set to grid view

// Ensure the correct initial view is applied when the page loads
document.addEventListener('DOMContentLoaded', function () {
    const modelCardBlock = document.getElementById('featherless_model_card_block');
    modelCardBlock?.classList.add('list-view');

    const toggleButton = document.getElementById('featherless_model_grid_toggle');
    toggleButton?.addEventListener('click', function (this: HTMLElement) {
        // Toggle between grid and list view
        if (featherlessIsGridView) {
            modelCardBlock?.classList.remove('grid-view');
            modelCardBlock?.classList.add('list-view');
            this.title = 'Toggle to grid view';
        } else {
            modelCardBlock?.classList.remove('list-view');
            modelCardBlock?.classList.add('grid-view');
            this.title = 'Toggle to list view';
        }

        featherlessIsGridView = !featherlessIsGridView;
    });
});
/**
 *
 */
function onMancerModelSelect() {
    const modelId =
        (document.getElementById('mancer_model') as HTMLSelectElement | null)?.value ?? '';
    textgen_settings.mancer_model = modelId;
    document.getElementById('api_button_textgenerationwebui')?.click();

    const limits = mancerModels.find((x) => x.id === modelId)?.limits;
    setGenerationParamsFromPreset({ max_length: limits?.context ?? 0 });
}

/**
 *
 */
function onTogetherModelSelect() {
    const modelName =
        (document.getElementById('model_togetherai_select') as HTMLSelectElement | null)?.value ??
        '';
    textgen_settings.togetherai_model = modelName;
    document.getElementById('api_button_textgenerationwebui')?.click();
    const model = togetherModels.find((x) => x.id === modelName);
    setGenerationParamsFromPreset({ max_length: model?.context_length ?? 0 });
}

/** */
function onInfermaticAIModelSelect() {
    const modelName =
        (document.getElementById('model_infermaticai_select') as HTMLSelectElement | null)?.value ??
        '';
    textgen_settings.infermaticai_model = modelName;
    document.getElementById('api_button_textgenerationwebui')?.click();
    const model = infermaticAIModels.find((x) => x.id === modelName);
    setGenerationParamsFromPreset({ max_length: model?.context_length ?? 0 });
}

/** */
function onDreamGenModelSelect() {
    const modelName =
        (document.getElementById('model_dreamgen_select') as HTMLSelectElement | null)?.value ?? '';
    textgen_settings.dreamgen_model = modelName;
    document.getElementById('api_button_textgenerationwebui')?.click();
    // TODO(DreamGen): Consider retuning max_tokens from API and setting it here.
}

/**
 *
 */
function onOllamaModelSelect() {
    const modelId =
        (document.getElementById('ollama_model') as HTMLSelectElement | null)?.value ?? '';
    textgen_settings.ollama_model = modelId;
    document.getElementById('api_button_textgenerationwebui')?.click();
}

/**
 *
 */
function onTabbyModelSelect() {
    const modelId =
        (document.getElementById('tabby_model') as HTMLSelectElement | null)?.value ?? '';
    textgen_settings.tabby_model = modelId;
    document.getElementById('api_button_textgenerationwebui')?.click();
}

/**
 *
 */
function onLlamaCppModelSelect() {
    const modelId =
        (document.getElementById('llamacpp_model') as HTMLSelectElement | null)?.value ?? '';
    textgen_settings.llamacpp_model = modelId;
    document.getElementById('api_button_textgenerationwebui')?.click();
}

/**
 *
 */
function onOpenRouterModelSelect() {
    const modelId =
        (document.getElementById('openrouter_model') as HTMLSelectElement | null)?.value ?? '';
    textgen_settings.openrouter_model = modelId;
    document.getElementById('api_button_textgenerationwebui')?.click();
    const model = openRouterModels.find((x) => x.id === modelId);
    syncOpenRouterProvidersForModel(modelId, '#openrouter_providers_text');
    setGenerationParamsFromPreset({ max_length: model?.context_length ?? 0 });
}

/**
 *
 */
function onVllmModelSelect() {
    const modelId =
        (document.getElementById('vllm_model') as HTMLSelectElement | null)?.value ?? '';
    textgen_settings.vllm_model = modelId;
    document.getElementById('api_button_textgenerationwebui')?.click();
}

/**
 *
 */
function onAphroditeModelSelect() {
    const modelId =
        (document.getElementById('aphrodite_model') as HTMLSelectElement | null)?.value ?? '';
    textgen_settings.aphrodite_model = modelId;
    document.getElementById('api_button_textgenerationwebui')?.click();
}

/**
 *
 * @param option
 */
function getMancerModelTemplate(option: Record<string, unknown>) {
    const model = mancerModels.find(
        (x) =>
            x.id ===
            ((option?.element as Record<string, unknown> | undefined)?.value as string | undefined),
    );

    if (!option.id || !model) {
        return option.text as string;
    }

    const creditsPerPrompt =
        ((model.limits?.context ?? 0) - (model.limits?.completion ?? 0)) *
        (model.pricing?.prompt ?? 0);
    const creditsPerCompletion = (model.limits?.completion ?? 0) * (model.pricing?.completion ?? 0);
    const creditsTotal = Math.round(creditsPerPrompt + creditsPerCompletion).toFixed(0);

    return `
        <div class="flex-container flexFlowColumn">
            <div><strong>${DOMPurify.sanitize(model.name ?? '')}</strong> | <span>${model.limits?.context ?? '?'} ctx</span> / <span>${model.limits?.completion ?? '?'} res</span> | <small>Credits per request (max): ${creditsTotal}</small></div>
        </div>
    `;
}

/**
 *
 * @param option
 */
function getTogetherModelTemplate(option: Record<string, unknown>) {
    const model = togetherModels.find(
        (x) =>
            x.id ===
            ((option?.element as Record<string, unknown> | undefined)?.value as string | undefined),
    );

    if (!option.id || !model) {
        return option.text as string;
    }

    return `
        <div class="flex-container flexFlowColumn">
            <div><strong>${DOMPurify.sanitize(model.id)}</strong> | <span>${model.context_length ?? '???'} tokens</span></div>
            <div><small>${DOMPurify.sanitize(model.description ?? '')}</small></div>
        </div>
    `;
}

/**
 *
 * @param option
 */
function getInfermaticAIModelTemplate(option: Record<string, unknown>) {
    const model = infermaticAIModels.find(
        (x) =>
            x.id ===
            ((option?.element as Record<string, unknown> | undefined)?.value as string | undefined),
    );

    if (!option.id || !model) {
        return option.text as string;
    }

    return `
        <div class="flex-container flexFlowColumn">
            <div><strong>${DOMPurify.sanitize(model.id)}</strong></div>
        </div>
    `;
}

/**
 *
 * @param option
 */
function getDreamGenModelTemplate(option: Record<string, unknown>) {
    const model = dreamGenModels.find(
        (x) =>
            x.id ===
            ((option?.element as Record<string, unknown> | undefined)?.value as string | undefined),
    );

    if (!option.id || !model) {
        return option.text as string;
    }

    return `
        <div class="flex-container flexFlowColumn">
            <div><strong>${DOMPurify.sanitize(model.id)}</strong></div>
        </div>
    `;
}

/**
 *
 * @param option
 */
function getOpenRouterModelTemplate(option: Record<string, unknown>) {
    const model = openRouterModels.find(
        (x) =>
            x.id ===
            ((option?.element as Record<string, unknown> | undefined)?.value as string | undefined),
    );

    if (!option.id || !model) {
        return option.text as string;
    }

    const tokens_dollar = Number(1 / (1000 * (model.pricing?.prompt ?? 1)));
    const tokens_rounded = (Math.round(tokens_dollar * 1000) / 1000).toFixed(0);

    const price = 0 === Number(model.pricing?.prompt) ? 'Free' : `${tokens_rounded}k t/$ `;

    return `
        <div class="flex-container flexFlowColumn" title="${DOMPurify.sanitize(model.id)}">
            <div><strong>${DOMPurify.sanitize(model.name ?? model.id)}</strong> | ${String(model.context_length ?? '')} ctx | <small>${price}</small></div>
        </div>
    `;
}

/**
 *
 * @param option
 */
function getVllmModelTemplate(option: Record<string, unknown>) {
    const model = vllmModels.find(
        (x) =>
            x.id ===
            ((option?.element as Record<string, unknown> | undefined)?.value as string | undefined),
    );

    if (!option.id || !model) {
        return option.text as string;
    }

    return `
        <div class="flex-container flexFlowColumn">
            <div><strong>${DOMPurify.sanitize(model.id)}</strong></div>
        </div>
    `;
}

/**
 *
 * @param option
 */
function getAphroditeModelTemplate(option: Record<string, unknown>) {
    const model = aphroditeModels.find(
        (x) =>
            x.id ===
            ((option?.element as Record<string, unknown> | undefined)?.value as string | undefined),
    );

    if (!option.id || !model) {
        return option.text as string;
    }

    return `
        <div class="flex-container flexFlowColumn">
            <div><strong>${DOMPurify.sanitize(model.id)}</strong></div>
        </div>
    `;
}

/**
 *
 */
async function downloadOllamaModel() {
    try {
        const serverUrl = (textgen_settings.server_urls as Record<string, string> | undefined)?.[
            textgen_types.OLLAMA as string
        ];

        if (!serverUrl) {
            notyf.info('Please connect to an Ollama server first.');
            return;
        }

        const html = `Enter a model tag, for example <code>llama2:latest</code>.<br>
        See <a target="_blank" href="https://ollama.ai/library">Library</a> for available models.`;
        const name = await callGenericPopup(html, POPUP_TYPE.INPUT, '', { okButton: 'Download' });

        if (!name) {
            return;
        }

        notyf.info('Download may take a while, please wait...', 'Working on it');

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
        notyf.success('Download complete. Please select the model from the dropdown.');
        document.getElementById('api_button_textgenerationwebui')?.click();
    } catch (err) {
        console.error(err);
        notyf.error('Failed to download Ollama model. Please try again.');
    }
}

/**
 *
 */
async function downloadTabbyModel() {
    try {
        const serverUrl = (textgen_settings.server_urls as Record<string, string> | undefined)?.[
            textgen_types.TABBY as string
        ];

        if (online_status === 'no_connection' || !serverUrl) {
            notyf.info('Please connect to a TabbyAPI server first.');
            return;
        }

        const downloadWrapper = document.createElement('div');
        downloadWrapper.innerHTML = await renderTemplateAsync('tabbyDownloader');
        const downloadHtml = downloadWrapper;
        const popupResult = await callGenericPopup(downloadHtml, POPUP_TYPE.CONFIRM, '', {
            okButton: 'Download',
            cancelButton: 'Cancel',
        });

        // User cancelled the download
        if (!popupResult) {
            return;
        }

        const repoId = String(
            (downloadHtml.querySelector('input[name="hf_repo_id"]') as HTMLInputElement | null)
                ?.value ?? '',
        );
        if (!repoId) {
            notyf.error('A HuggingFace repo ID must be provided. Skipping Download.');
            return;
        }

        if (repoId.split('/').length !== 2) {
            notyf.error(
                'A HuggingFace repo ID must be formatted as Author/Name. Please try again.',
            );
            return;
        }

        const params: Record<string, unknown> = {
            repo_id: repoId,
            folder_name:
                (downloadHtml.querySelector('input[name="folder_name"]') as HTMLInputElement | null)
                    ?.value || undefined,
            revision:
                (downloadHtml.querySelector('input[name="revision"]') as HTMLInputElement | null)
                    ?.value || undefined,
            token:
                (downloadHtml.querySelector('input[name="hf_token"]') as HTMLInputElement | null)
                    ?.value || undefined,
        };

        for (const suffix of ['include', 'exclude']) {
            const patterns = String(
                (
                    downloadHtml.querySelector(
                        `textarea[name="tabby_download_${suffix}"]`,
                    ) as HTMLTextAreaElement | null
                )?.value ?? '',
            );
            if (patterns) {
                params[suffix] = patterns.split('\n');
            }
        }

        // Params for the server side of ST
        params.api_server = serverUrl;
        params.api_type = textgen_settings.type;

        notyf.info('Downloading. Check the Tabby console for progress reports.');

        const response = await fetch('/api/backends/text-completions/tabby/download', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(params),
        });

        if (response.status === 403) {
            notyf.error(
                'The provided key has invalid permissions. Please use an admin key for downloading.',
            );
            return;
        } else if (!response.ok) {
            throw new Error(response.statusText);
        }

        notyf.success('Download complete.');
    } catch (err) {
        console.error(err);
        notyf.error('Failed to download HuggingFace model in TabbyAPI. Please try again.');
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
    const model = openRouterModels.find((x) => x.id === textgen_settings.openrouter_model);

    if (model?.pricing) {
        const completionCost = Number(model.pricing.completion);
        const promptCost = Number(model.pricing.prompt);
        const completionTokens = amount_gen;
        const promptTokens = max_context - completionTokens;
        const totalCost = completionCost * completionTokens + promptCost * promptTokens;
        if (!isNaN(totalCost)) {
            cost = '$' + totalCost.toFixed(3);
        }
    }

    const orPromptCost = document.getElementById('or_prompt_cost');
    if (orPromptCost) orPromptCost.textContent = cost;

    // Schedule an update when settings change
    eventSource.removeListener(event_types.SETTINGS_UPDATED, calculateOpenRouterCost);
    eventSource.once(event_types.SETTINGS_UPDATED, calculateOpenRouterCost);
}

/**
 *
 */
export function getCurrentDreamGenModelTokenizer() {
    const modelId = textgen_settings.dreamgen_model;
    const model = dreamGenModels.find((x) => x.id === modelId);
    if (!model) return tokenizers.MISTRAL;
    if (model.id.startsWith('lucid-v1-medium') || model.id.startsWith('lucid-v1-base')) {
        return tokenizers.MISTRAL;
    } else if (model.id.startsWith('lucid-v1-extra-large') || model.id.startsWith('lucid-v1-max')) {
        return tokenizers.LLAMA3;
    } else {
        return tokenizers.MISTRAL;
    }
}

let _initTextGenModelsDone = false;

/**
 *
 */
export function initTextGenModels() {
    if (_initTextGenModelsDone) return;
    _initTextGenModelsDone = true;
    document.getElementById('mancer_model')?.addEventListener('change', onMancerModelSelect);
    document
        .getElementById('model_togetherai_select')
        ?.addEventListener('change', onTogetherModelSelect);
    document
        .getElementById('model_infermaticai_select')
        ?.addEventListener('change', onInfermaticAIModelSelect);
    document
        .getElementById('model_dreamgen_select')
        ?.addEventListener('change', onDreamGenModelSelect);
    document.getElementById('ollama_model')?.addEventListener('change', onOllamaModelSelect);
    document
        .getElementById('openrouter_model')
        ?.addEventListener('change', onOpenRouterModelSelect);
    document
        .getElementById('ollama_download_model')
        ?.addEventListener('click', downloadOllamaModel);
    document.getElementById('vllm_model')?.addEventListener('change', onVllmModelSelect);
    document.getElementById('aphrodite_model')?.addEventListener('change', onAphroditeModelSelect);
    document.getElementById('tabby_download_model')?.addEventListener('click', downloadTabbyModel);
    document.getElementById('tabby_model')?.addEventListener('change', onTabbyModelSelect);
    document.getElementById('llamacpp_model')?.addEventListener('change', onLlamaCppModelSelect);
    document.getElementById('featherless_model')?.addEventListener('change', function () {
        onFeatherlessModelSelect((this as HTMLSelectElement).value);
    });

    // ── Provider select population ────────────────────────────────────────
    // Provider lists are fetched from the backend asynchronously;
    // populate selects from pre-loaded arrays, and re-populate if they arrive later.

    const providersSelect = document.querySelector('.openrouter_providers');
    const populateOpenRouterProviders = () => {
        if (!providersSelect || !openRouterProviders.length) return;
        if (providersSelect.querySelectorAll('option').length > 0) return;
        const frag = document.createDocumentFragment();
        for (const provider of openRouterProviders) {
            const option = document.createElement('option');
            option.value =
                typeof provider === 'string'
                    ? provider
                    : (provider as { name?: string }).name || '';
            option.textContent =
                typeof provider === 'string'
                    ? provider
                    : (provider as { name?: string }).name || '';
            frag.appendChild(option);
        }
        providersSelect.appendChild(frag);
    };
    populateOpenRouterProviders();

    const nanoGptProvidersSelect = document.getElementById('nanogpt_provider');
    const populateNanoGptProviders = () => {
        if (!nanoGptProvidersSelect || !nanoGptProviders.length) return;
        if (nanoGptProvidersSelect.querySelectorAll('option').length > 0) return;
        const frag = document.createDocumentFragment();
        for (const provider of nanoGptProviders) {
            const option = document.createElement('option');
            option.value = provider.id;
            option.textContent = provider.label;
            frag.appendChild(option);
        }
        nanoGptProvidersSelect.appendChild(frag);
    };
    populateNanoGptProviders();

    // Fire async loads — when they complete, re-populate the selects
    loadOpenRouterProviders().then(populateOpenRouterProviders);
    loadNanoGptProviders().then(populateNanoGptProviders);

    // ── TomSelect initialization ──────────────────────────────────────────
    if (!isMobile()) {
        const modelSelects: Array<{
            id: string;
            placeholder: string;
            renderFn?: (option: Record<string, unknown>, _escape: (t: string) => string) => string;
        }> = [
            {
                id: 'mancer_model',
                placeholder: t`Select a model`,
                renderFn: getMancerModelTemplate,
            },
            {
                id: 'model_togetherai_select',
                placeholder: t`Select a model`,
                renderFn: getTogetherModelTemplate,
            },
            { id: 'ollama_model', placeholder: t`Select a model` },
            { id: 'tabby_model', placeholder: t`[Currently loaded]` },
            { id: 'llamacpp_model', placeholder: t`[Currently loaded]` },
            {
                id: 'model_infermaticai_select',
                placeholder: t`Select a model`,
                renderFn: getInfermaticAIModelTemplate,
            },
            {
                id: 'model_dreamgen_select',
                placeholder: t`Select a model`,
                renderFn: getDreamGenModelTemplate,
            },
            {
                id: 'openrouter_model',
                placeholder: t`Select a model`,
                renderFn: getOpenRouterModelTemplate,
            },
            { id: 'vllm_model', placeholder: t`Select a model`, renderFn: getVllmModelTemplate },
            {
                id: 'aphrodite_model',
                placeholder: t`Select a model`,
                renderFn: getAphroditeModelTemplate,
            },
        ];

        for (const { id, placeholder, renderFn } of modelSelects) {
            const el = document.getElementById(id);
            if (!el) continue;
            const config: Record<string, unknown> = { maxItems: 1, placeholder };
            if (renderFn) {
                config.render = { option: renderFn };
            }
            new TomSelect(el, config);
        }

        new TomSelect(document.querySelector('.openrouter_quantizations'), {
            maxItems: null,
            plugins: ['remove_button'],
            placeholder: t`Select quantizations. No selection = all quantizations.`,
        });
        if (providersSelect) {
            new TomSelect(providersSelect, {
                maxItems: null,
                plugins: ['remove_button'],
                placeholder: t`Select providers. No selection = all providers.`,
            });
            providersSelect.addEventListener('change', function (this: HTMLSelectElement) {
                const selectedOptions = Array.from(this.selectedOptions);
                for (const option of selectedOptions) {
                    this.appendChild(option);
                }
            });
        }
        if (nanoGptProvidersSelect) {
            new TomSelect(nanoGptProvidersSelect, {
                maxItems: null,
                plugins: ['remove_button'],
                placeholder: t`Select providers. No selection = all providers.`,
            });
        }
    }
}
