import { localspace } from '../lib.js';
import {
    characters,
    event_types,
    eventSource,
    main_api,
    nai_settings,
    online_status,
    this_chid,
} from '../script.js';
import { power_user, registerDebugFunction } from './power-user.js';
import { chat_completion_sources, oai_settings } from './openai.js';
import { groups, selected_group } from './group-chats.js';
import { getStringHash } from './utils.js';
import { kai_flags, kai_settings } from './kai-settings.js';
import {
    textgen_types,
    textgenerationwebui_settings as textgen_settings,
    getTextGenServer,
    getTextGenModel,
} from './textgen-settings.js';
import {
    getCurrentDreamGenModelTokenizer,
    openRouterModels,
    OPENROUTER_TOKENIZER_MAP,
} from './textgen-models.js';

/** @type {string} */
let _csrfToken = '';

/**
 * Gets a CSRF token for API requests.
 * @returns {Promise<string>}
 */
async function getCsrfToken() {
    if (_csrfToken) return _csrfToken;
    try {
        const res = await fetch('/csrf-token');
        const data = await res.json();
        _csrfToken = data.token;
    } catch {
        _csrfToken = '';
    }
    return _csrfToken;
}

export { BYTES_PER_TOKEN as CHARACTERS_PER_TOKEN_RATIO };

export const BYTES_PER_TOKEN = 3.35;
export const TOKENIZER_WARNING_KEY = 'tokenizationWarningShown';
export const TOKENIZER_SUPPORTED_KEY = 'tokenizationSupported';

export const tokenizers = {
    NONE: 0,
    GPT2: 1,
    OPENAI: 2,
    LLAMA: 3,
    NERD: 4,
    NERD2: 5,
    API_CURRENT: 6,
    MISTRAL: 7,
    YI: 8,
    API_TEXTGENERATIONWEBUI: 9,
    API_KOBOLD: 10,
    CLAUDE: 11,
    LLAMA3: 12,
    GEMMA: 13,
    JAMBA: 14,
    QWEN2: 15,
    COMMAND_R: 16,
    NEMO: 17,
    DEEPSEEK: 18,
    COMMAND_A: 19,
    BEST_MATCH: 99,
};

// A list of local tokenizers that support encoding and decoding token ids.
// Populated at init from GET /api/tokenizers/map.
export const ENCODE_TOKENIZERS: number[] = [];

/**
 * A list of Text Completion sources that support remote tokenization.
 * Populated in initTokenziers due to circular dependencies.
 * @type {string[]}
 */
export const TEXTGEN_TOKENIZERS: string[] = [];

/** Base URL for generic tokenizer endpoints. */
const TOKENIZER_BASE = '/api/tokenizers';

/** Remote tokenizer endpoints (proxied to external APIs, not handled locally). */
const TOKENIZER_REMOTE_KOBOLD = `${TOKENIZER_BASE}/remote/kobold/count`;
const TOKENIZER_REMOTE_TEXTGEN = `${TOKENIZER_BASE}/remote/textgenerationwebui/encode`;

/** Maps numeric tokenizer IDs to their backend name strings. Populated at init. */
let _tokenizerNameById: Record<number, string> = {};

/**
 * Resolves a numeric tokenizer ID to a backend name, falling back to
 * getTokenizerModel() for dynamically-resolved OpenAI-compatible names.
 */
function resolveTokenizerName(id: number): string {
    return _tokenizerNameById[id] || getTokenizerModel();
}

const textEncoder = new TextEncoder();
const objectStore = localspace.createInstance({ name: 'SillyTavern_ChatCompletions' });

let tokenCache = {};

/**
 * Guesstimates the token count for a string.
 * @param {string} str String to tokenize.
 * @returns {number} Token count.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'str' implicitly has an 'any' type.
export function guesstimate(str) {
    const byteLength = textEncoder.encode(str).length;
    return Math.ceil(byteLength / BYTES_PER_TOKEN);
}

/**
 *
 */
async function loadTokenCache() {
    try {
        console.debug('Chat Completions: loading token cache');
        tokenCache = (await objectStore.getItem('tokenCache')) || {};
    } catch (e) {
        console.log('Chat Completions: unable to load token cache, using default value', e);
        tokenCache = {};
    }
}

/**
 *
 */
export async function saveTokenCache() {
    try {
        console.debug('Chat Completions: saving token cache');
        await objectStore.setItem('tokenCache', tokenCache);
    } catch (e) {
        console.log('Chat Completions: unable to save token cache', e);
    }
}

/**
 *
 */
async function resetTokenCache() {
    try {
        console.debug('Chat Completions: resetting token cache');
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        Object.keys(tokenCache).forEach((key) => delete tokenCache[key]);
        await objectStore.removeItem('tokenCache');
        notyf.success('Token cache cleared. Please reload the chat to re-tokenize it.');
    } catch (e) {
        console.log('Chat Completions: unable to reset token cache', e);
    }
}

/**
 * @typedef {object} Tokenizer
 * @property {number} tokenizerId - The id of the tokenizer option
 * @property {string} tokenizerKey - Internal name/key of the tokenizer
 * @property {string} tokenizerName - Human-readable detailed name of the tokenizer (as displayed in the UI)
 */

/**
 * Gets all tokenizers available to the user.
 * @returns {Tokenizer[]} Tokenizer info.
 */
export function getAvailableTokenizers() {
    const tokenizerOptions = Array.from(document.querySelectorAll('#tokenizer option'));
    return tokenizerOptions.map((tokenizerOption) => ({
        tokenizerId: Number((tokenizerOption as HTMLOptionElement).value),
        tokenizerKey: Object.entries(tokenizers)
            .find(
                ([_, value]) => value === Number((tokenizerOption as HTMLOptionElement).value),
            )![0]
            .toLocaleLowerCase(),
        tokenizerName: (tokenizerOption as HTMLOptionElement).text,
    }));
}

/**
 * Selects tokenizer if not already selected.
 * @param {number} tokenizerId Tokenizer ID.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'tokenizerId' implicitly has an 'any' ty... Remove this comment to see the full error message
export function selectTokenizer(tokenizerId) {
    if (tokenizerId !== power_user.tokenizer) {
        const tokenizer = getAvailableTokenizers().find(
            (tokenizer) => tokenizer.tokenizerId === tokenizerId,
        );
        if (!tokenizer) {
            console.warn('Failed to find tokenizer with id', tokenizerId);
            return;
        }
        const tokenizerEl = document.getElementById('tokenizer');
        if (tokenizerEl instanceof HTMLSelectElement) {
            tokenizerEl.value = String(tokenizer.tokenizerId);
            tokenizerEl.dispatchEvent(new Event('change'));
        }
        notyf.info(`Tokenizer: "${tokenizer.tokenizerName}" selected`);
    }
}

/**
 * Gets the friendly name of the current tokenizer.
 * @param {string} forApi API to get the tokenizer for. Defaults to the main API.
 * @returns {Tokenizer} Tokenizer info
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'forApi' implicitly has an 'any' type.
export function getFriendlyTokenizerName(forApi) {
    if (!forApi) {
        forApi = main_api;
    }

    const tokenizerOption = document.querySelector('#tokenizer option:checked');
    // @ts-expect-error TS(2339) FIXME: Property 'value' does not exist on type 'Element'.
    let tokenizerId = Number(tokenizerOption?.value);
    let tokenizerName = tokenizerOption?.textContent;

    if (forApi !== 'openai' && tokenizerId === tokenizers.BEST_MATCH) {
        tokenizerId = getTokenizerBestMatch(forApi);

        switch (tokenizerId) {
            case tokenizers.API_KOBOLD:
                tokenizerName = 'API (KoboldAI Classic)';
                break;
            case tokenizers.API_TEXTGENERATIONWEBUI:
                tokenizerName = 'API (Text Completion)';
                break;
            default:
                tokenizerName =
                    document.querySelector(`#tokenizer option[value="${tokenizerId}"]`)
                        ?.textContent ?? '';
                break;
        }
    }

    tokenizerName = forApi == 'openai' ? getTokenizerModel() : tokenizerName;

    tokenizerId = forApi == 'openai' ? tokenizers.OPENAI : tokenizerId;

    const tokenizerKey =
        Object.entries(tokenizers)
            .find(([_, value]) => value === tokenizerId)?.[0]
            ?.toLocaleLowerCase() ?? '';

    return { tokenizerName, tokenizerKey, tokenizerId };
}

/**
 * Gets the best tokenizer for the current API.
 * @param {string} forApi API to get the tokenizer for. Defaults to the main API.
 * @returns {number} Tokenizer type.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'forApi' implicitly has an 'any' type.
export function getTokenizerBestMatch(forApi) {
    if (!forApi) {
        forApi = main_api;
    }

    if (forApi === 'novel') {
        if (nai_settings.model_novel.includes('clio')) {
            return tokenizers.NERD;
        }
        if (nai_settings.model_novel.includes('kayra')) {
            return tokenizers.NERD2;
        }
        if (nai_settings.model_novel.includes('erato')) {
            return tokenizers.LLAMA3;
        }
    }
    if (forApi === 'kobold' || forApi === 'textgenerationwebui' || forApi === 'koboldhorde') {
        // Try to use the API tokenizer if possible:
        // - API must be connected
        // - Kobold must pass a version check
        // - Tokenizer haven't reported an error previously
        const hasTokenizerError = sessionStorage.getItem(TOKENIZER_WARNING_KEY);
        const hasValidEndpoint = sessionStorage.getItem(TOKENIZER_SUPPORTED_KEY);
        const isConnected = online_status !== 'no_connection';
        const isTokenizerSupported =
            // @ts-expect-error TS(2345) FIXME: Type is not assignable.
            TEXTGEN_TOKENIZERS.includes(textgen_settings.type) &&
            (textgen_settings.type !== textgen_types.OOBA || hasValidEndpoint);

        if (!hasTokenizerError && isConnected) {
            if (forApi === 'kobold' && kai_flags.can_use_tokenization) {
                return tokenizers.API_KOBOLD;
            }

            if (forApi === 'textgenerationwebui' && isTokenizerSupported) {
                return tokenizers.API_TEXTGENERATIONWEBUI;
            }
            if (
                forApi === 'textgenerationwebui' &&
                textgen_settings.type === textgen_types.OPENROUTER
            ) {
                const modelId = String(textgen_settings.openrouter_model ?? '');
                if (modelId.includes('jamba')) return tokenizers.JAMBA;
                const model = openRouterModels.find((x) => x.id === modelId);
                const arch = model as { architecture?: { tokenizer?: string } } | undefined;
                const tokenizerName = arch?.architecture?.tokenizer;
                return (tokenizerName && OPENROUTER_TOKENIZER_MAP[tokenizerName]) ?? tokenizers.OPENAI;
            }
            if (
                forApi === 'textgenerationwebui' &&
                textgen_settings.type === textgen_types.DREAMGEN
            ) {
                return getCurrentDreamGenModelTokenizer();
            }
        }

        if (forApi === 'textgenerationwebui') {
            const model = String(getTextGenModel() || online_status).toLowerCase();
            if (model.includes('llama3') || model.includes('llama-3')) {
                return tokenizers.LLAMA3;
            }
            if (model.includes('mistral') || model.includes('mixtral')) {
                return tokenizers.MISTRAL;
            }
            if (model.includes('gemma')) {
                return tokenizers.GEMMA;
            }
            if (model.includes('nemo') || model.includes('pixtral')) {
                return tokenizers.NEMO;
            }
            if (model.includes('deepseek')) {
                return tokenizers.DEEPSEEK;
            }
            if (model.includes('yi')) {
                return tokenizers.YI;
            }
            if (model.includes('jamba')) {
                return tokenizers.JAMBA;
            }
            if (model.includes('command-r')) {
                return tokenizers.COMMAND_R;
            }
            if (model.includes('command-a')) {
                return tokenizers.COMMAND_A;
            }
            if (model.includes('qwen2')) {
                return tokenizers.QWEN2;
            }
        }

        return tokenizers.LLAMA;
    }

    return tokenizers.NONE;
}

// Get the current remote tokenizer API based on the current text generation API.
/**
 *
 */
function currentRemoteTokenizerAPI() {
    switch (main_api) {
        case 'kobold':
            return tokenizers.API_KOBOLD;
        case 'textgenerationwebui':
            return tokenizers.API_TEXTGENERATIONWEBUI;
        default:
            return tokenizers.NONE;
    }
}

/**
 * Calls the underlying tokenizer model to the token count for a string.
 * Calls the underlying tokenizer model to the token count for a string.
 * @param {number} type Tokenizer type.
 * @param {string} str String to tokenize.
 * @returns {Promise<number>} Token count.
 */
// @ts-expect-error TS(7023) FIXME: 'callTokenizerAsync' implicitly has return type 'a... Remove this comment to see the full error message
function callTokenizerAsync(type, str) {
    return new Promise((resolve) => {
        if (type === tokenizers.NONE) {
            return resolve(guesstimate(str));
        }

        switch (type) {
            case tokenizers.API_CURRENT:
                return callTokenizerAsync(currentRemoteTokenizerAPI(), str).then(resolve);
            case tokenizers.API_KOBOLD:
                return countTokensFromKoboldAPI(str, resolve);
            case tokenizers.API_TEXTGENERATIONWEBUI:
                return countTokensFromTextgenAPI(str, resolve);
            default: {
                const tokenizerName = resolveTokenizerName(type);
                return genericCountTokens(tokenizerName, str, resolve);
            }
        }
    });
}

/**
 * Gets the token count for a string using the current model tokenizer.
 * @param {string} str String to tokenize
 * @param {number | undefined} padding Optional padding tokens. Defaults to 0.
 * @returns {Promise<number>} Token count.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'str' implicitly has an 'any' type.
export async function getTokenCountAsync(str, padding = undefined) {
    if (typeof str !== 'string' || !str?.length) {
        return 0;
    }

    let tokenizerType = power_user.tokenizer;
    let modelHash = '';

    if (main_api === 'openai') {
        if (padding === power_user.token_padding) {
            // For main "shadow" prompt building
            tokenizerType = tokenizers.NONE;
        } else {
            // For extensions and WI
            return counterWrapperOpenAIAsync(str);
        }
    }

    if (tokenizerType === tokenizers.BEST_MATCH) {
        tokenizerType = getTokenizerBestMatch(main_api);
    }

    if (tokenizerType === tokenizers.API_TEXTGENERATIONWEBUI) {
        modelHash = getStringHash(getTextGenModel() || online_status).toString();
    }

    if (padding === undefined) {
        // @ts-expect-error TS(2322) FIXME: Type '0' is not assignable to type 'undefined'.
        padding = 0;
    }

    const cacheObject = getTokenCacheObject();
    const hash = getStringHash(str);
    const cacheKey = `${tokenizerType}-${hash}${modelHash}+${padding}`;

    if (typeof cacheObject[cacheKey] === 'number') {
        return cacheObject[cacheKey];
    }

    const result = ((await callTokenizerAsync(tokenizerType, str)) as number) + (padding ?? 0);

    if (isNaN(result)) {
        console.warn('Token count calculation returned NaN');
        return 0;
    }

    cacheObject[cacheKey] = result;
    return result;
}

/**
 * Gets the token count for a string using the OpenAI tokenizer.
 * @param {string} text Text to tokenize.
 * @returns {Promise<number>} Token count.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'text' implicitly has an 'any' type.
function counterWrapperOpenAIAsync(text) {
    const message = { role: 'system', content: text };
    return countTokensOpenAIAsync(message, true);
}

/**
 *
 */
/** In-memory cache for backend-resolved tokenizer models (source:model → tokenizer name). */
const _tokenizerResolveCache = new Map<string, string>();

/** Pending resolution promises to avoid duplicate requests. */
const _tokenizerPendingFetches = new Map<string, Promise<string>>();

/**
 * Asynchronously resolves the tokenizer model name from the backend.
 * Populates the sync cache so subsequent getTokenizerModel() calls return the resolved value.
 */
export async function resolveTokenizerModel(source: string, model: string): Promise<string> {
    if (!source || !model) return 'gpt-3.5-turbo';
    const cacheKey = `${source}:${model}`;
    const cached = _tokenizerResolveCache.get(cacheKey);
    if (cached) return cached;

    const pending = _tokenizerPendingFetches.get(cacheKey);
    if (pending) return pending;

    const promise = (async () => {
        try {
            const res = await fetch('/api/tokenizers/resolve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': await getCsrfToken(),
                },
                body: JSON.stringify({ source, model }),
            });
            if (res.ok) {
                const data = await res.json();
                const tokenizer = data?.tokenizer || 'gpt-3.5-turbo';
                _tokenizerResolveCache.set(cacheKey, tokenizer);
                return tokenizer;
            }
        } catch {
            /* network error — use default */
        }
        _tokenizerResolveCache.set(cacheKey, 'gpt-3.5-turbo');
        return 'gpt-3.5-turbo';
    })();

    _tokenizerPendingFetches.set(cacheKey, promise);
    promise.finally(() => _tokenizerPendingFetches.delete(cacheKey));
    return promise;
}

/**
 * Gets the tokenizer model name for the current chat-completion source and model.
 * Returns cached backend resolution, or defaults to 'gpt-3.5-turbo' while async fetch is in-flight.
 */
export function getTokenizerModel(): string {
    // OpenAI models directly pass through for tiktoken
    if (oai_settings.chat_completion_source == chat_completion_sources.OPENAI) {
        return oai_settings.openai_model || 'gpt-3.5-turbo';
    }

    // Custom/OpenAI-compatible pass through
    if (oai_settings.chat_completion_source == chat_completion_sources.CUSTOM) {
        return oai_settings.custom_model || 'gpt-3.5-turbo';
    }

    const source = oai_settings.chat_completion_source;

    // Dynamic property access: most sources follow `oai_settings.{source}_model`
    // with two exceptions that alias to `google_model`.
    const model =
        source === 'makersuite' || source === 'vertexai'
            ? oai_settings.google_model || ''
            : (oai_settings as unknown as Record<string, string>)[`${source}_model`] || '';

    if (!model) return 'gpt-3.5-turbo';

    const cacheKey = `${source}:${model}`;
    if (_tokenizerResolveCache.has(cacheKey)) {
        return _tokenizerResolveCache.get(cacheKey)!;
    }

    // Fire async resolution for next call, return default now
    resolveTokenizerModel(source, model);

    return 'gpt-3.5-turbo';
}

/** Pre-warm the tokenizer cache for the current source+model at init time. */
function preWarmTokenizerCache(): void {
    const source = oai_settings.chat_completion_source;
    if (source === chat_completion_sources.OPENAI || source === chat_completion_sources.CUSTOM)
        return;

    const model =
        source === 'makersuite' || source === 'vertexai'
            ? oai_settings.google_model || ''
            : (oai_settings as unknown as Record<string, string>)[`${source}_model`] || '';

    if (model) resolveTokenizerModel(source, model);
}

/**
    }

    if (!full) token_count -= 2;

    return token_count;
}

/**
 * Returns the token count for a message using the OpenAI tokenizer.
 * @param {object[]|object} messages
 * @param {boolean} full
 * @returns {Promise<number>} Token count.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'messages' implicitly has an 'any' type.
export async function countTokensOpenAIAsync(messages, full = false) {
    const tokenizerEndpoint = `/api/tokenizers/openai/count?model=${getTokenizerModel()}`;
    const cacheObject = getTokenCacheObject();

    if (!Array.isArray(messages)) {
        messages = [messages];
    }

    let token_count = -1;

    for (const message of messages) {
        const model = getTokenizerModel();

        if (model === 'claude') {
            full = true;
        }

        const hash = getStringHash(JSON.stringify(message));
        const cacheKey = `${model}-${hash}`;
        const cachedCount = cacheObject[cacheKey];

        if (typeof cachedCount === 'number') {
            token_count += cachedCount;
        } else {
            const response = await fetch(tokenizerEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': await getCsrfToken(),
                },
                body: JSON.stringify([message]),
            });
            const data = await response.json();

            token_count += Number(data.token_count);
            cacheObject[cacheKey] = Number(data.token_count);
        }
    }

    if (!full) token_count -= 2;

    return token_count;
}

/**
 * Gets the token cache object for the current chat.
 * @returns {object} Token cache object for the current chat.
 */
function getTokenCacheObject() {
    let chatId = 'undefined';

    try {
        if (selected_group) {
            // @ts-expect-error TS(7005) FIXME: Variable 'groups' implicitly has an 'any[]' type.
            chatId = groups.find((x) => x.id == selected_group)?.chat_id;
        } else if (this_chid !== undefined) {
            chatId = characters[this_chid].chat;
        }
    } catch {
        console.log('No character / group selected. Using default cache item');
    }

    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    if (typeof tokenCache[chatId] !== 'object') {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        tokenCache[chatId] = {};
    }

    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    return tokenCache[String(chatId)];
}

/**
 * Count tokens using the AI provider's API.
 * @param {string} str String to tokenize.
 * @param {function} [resolve] Promise resolve function.
 * @returns {number} Token count.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'str' implicitly has an 'any' type.
async function countTokensFromKoboldAPI(str, resolve) {
    const isAsync = typeof resolve === 'function';
    let tokenCount = 0;

    const response = await fetch(TOKENIZER_REMOTE_KOBOLD, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            text: str,
            url: kai_settings.api_server,
        }),
    });
    const data = await response.json();
    if (typeof data.count === 'number') {
        tokenCount = data.count;
    } else {
        tokenCount = apiFailureTokenCount(str);
    }

    if (isAsync) resolve(tokenCount);

    return tokenCount;
}

/**
 *
 *
 *
 * @param str
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'str' implicitly has an 'any' type.
function getTextgenAPITokenizationParams(str) {
    return {
        text: str,
        api_type: textgen_settings.type,
        url: getTextGenServer(),
        model: getTextGenModel(),
    };
}

/**
 * Count tokens using the AI provider's API.
 * @param {string} str String to tokenize.
 * @param {function} [resolve] Promise resolve function.
 * @returns {number} Token count.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'str' implicitly has an 'any' type.
async function countTokensFromTextgenAPI(str, resolve) {
    const isAsync = typeof resolve === 'function';
    let tokenCount = 0;

    const response = await fetch(TOKENIZER_REMOTE_TEXTGEN, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': await getCsrfToken(),
        },
        body: JSON.stringify(getTextgenAPITokenizationParams(str)),
    });
    const data = await response.json();
    if (typeof data.count === 'number') {
        tokenCount = data.count;
    } else {
        tokenCount = apiFailureTokenCount(str);
    }

    if (isAsync) resolve(tokenCount);

    return tokenCount;
}

/**
 *
 * @param str
 */
// @ts-expect-error TS(7023) FIXME: 'apiFailureTokenCount' implicitly has return type ... Remove this comment to see the full error message
function apiFailureTokenCount(str) {
    console.error('Error counting tokens');
    let shouldTryAgain = false;

    if (!sessionStorage.getItem(TOKENIZER_WARNING_KEY)) {
        const bestMatchBefore = getTokenizerBestMatch(main_api);
        sessionStorage.setItem(TOKENIZER_WARNING_KEY, String(true));
        const bestMatchAfter = getTokenizerBestMatch(main_api);
        if (
            [tokenizers.API_TEXTGENERATIONWEBUI, tokenizers.API_KOBOLD].includes(bestMatchBefore) &&
            bestMatchBefore !== bestMatchAfter
        ) {
            shouldTryAgain = true;
        }
    }

    // Only try again if we guarantee not to be looped by the same error
    if (shouldTryAgain && power_user.tokenizer === tokenizers.BEST_MATCH) {
        return guesstimate(str);
    }

    return guesstimate(str);
}

/**
 * Calls the generic /api/tokenizers/count endpoint.
 * @param {string} tokenizerName Tokenizer name (e.g. 'llama', 'claude', 'gpt-4o')
 * @param {string} str String to tokenize.
 * @param {function} [resolve] Promise resolve function.
 * @returns {Promise<number>} Token count.
 */
// @ts-expect-error TS(7006) — dynamic args for legacy sync/async dual mode
async function genericCountTokens(tokenizerName, str, resolve) {
    const isAsync = typeof resolve === 'function';
    let tokenCount = 0;
    try {
        const response = await fetch(`${TOKENIZER_BASE}/count`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': await getCsrfToken(),
            },
            body: JSON.stringify({ text: str, tokenizer: tokenizerName }),
        });
        const data = await response.json();
        tokenCount = typeof data.count === 'number' ? data.count : guesstimate(str);
    } catch {
        tokenCount = apiFailureTokenCount(str);
    }
    if (isAsync) resolve(tokenCount);
    return tokenCount;
}

/**
 * Calls the generic /api/tokenizers/encode endpoint.
 */
// @ts-expect-error TS(7006) — dynamic args for legacy compatibility
async function genericGetTextTokens(tokenizerName, str) {
    let ids = [];
    try {
        const response = await fetch(`${TOKENIZER_BASE}/encode`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': await getCsrfToken(),
            },
            body: JSON.stringify({ text: str, tokenizer: tokenizerName }),
        });
        const data = await response.json();
        ids = data.ids || [];
        if (Array.isArray(data.chunks)) {
            Object.defineProperty(ids, 'chunks', { value: data.chunks });
        }
    } catch {
        /* return empty */
    }
    return ids;
}

/**
 * Calls the generic /api/tokenizers/decode endpoint.
 */
// @ts-expect-error TS(7006) — dynamic args for legacy compatibility
async function genericDecodeTokens(tokenizerName, ids) {
    let text = '';
    let chunks: string[] = [];
    try {
        const response = await fetch(`${TOKENIZER_BASE}/decode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, tokenizer: tokenizerName }),
        });
        const data = await response.json();
        text = data.text || '';
        chunks = data.chunks || [];
    } catch {
        /* return empty */
    }
    return { text, chunks };
}

/**
 * Calls the AI provider's tokenize API to encode a string to tokens.
 * @param {string} str String to tokenize.
 * @param {function} [resolve] Promise resolve function.
 * @returns {number[]} Array of token ids.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'str' implicitly has an 'any' type.
async function getTextTokensFromTextgenAPI(str, resolve) {
    const isAsync = typeof resolve === 'function';
    let ids = [];
    const response = await fetch(TOKENIZER_REMOTE_TEXTGEN, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': await getCsrfToken(),
        },
        body: JSON.stringify(getTextgenAPITokenizationParams(str)),
    });
    const data = await response.json();
    ids = data.ids;
    if (isAsync) resolve(ids);

    return ids;
}

/**
 * Calls the AI provider's tokenize API to encode a string to tokens.
 * @param {string} str String to tokenize.
 * @param {function} [resolve] Promise resolve function.
 * @returns {number[]} Array of token ids.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'str' implicitly has an 'any' type.
async function getTextTokensFromKoboldAPI(str, resolve) {
    const isAsync = typeof resolve === 'function';
    let ids = [];

    const response = await fetch(TOKENIZER_REMOTE_KOBOLD, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            text: str,
            url: kai_settings.api_server,
        }),
    });
    const data = await response.json();
    ids = data.ids;
    if (isAsync) resolve(ids);

    return ids;
}

/**
 * Encodes a string to tokens using the server API.
 * @param {number} tokenizerType Tokenizer type.
 * @param {string} str String to tokenize.
 * @returns {number[]} Array of token ids.
 */
// @ts-expect-error TS(7023) FIXME: 'getTextTokens' implicitly has return type 'any' b... Remove this comment to see the full error message
export function getTextTokens(tokenizerType, str) {
    switch (tokenizerType) {
        case tokenizers.API_CURRENT:
            return getTextTokens(currentRemoteTokenizerAPI(), str);
        case tokenizers.API_TEXTGENERATIONWEBUI:
            // @ts-expect-error TS(2554) FIXME: Expected 2 arguments, but got 1.
            return getTextTokensFromTextgenAPI(str);
        case tokenizers.API_KOBOLD:
            // @ts-expect-error TS(2554) FIXME: Expected 2 arguments, but got 1.
            return getTextTokensFromKoboldAPI(str);
        default: {
            const tokenizerName = resolveTokenizerName(tokenizerType);
            return genericGetTextTokens(tokenizerName, str);
        }
    }
}

/**
 * Decodes token ids to text using the server API.
 * @param {number} tokenizerType Tokenizer type.
 * @param {number[]} ids Array of token ids
 * @returns {({ text: string, chunks?: string[] })} Decoded token text as a single string and individual chunks (if available).
 */
// @ts-expect-error TS(7023) FIXME: 'decodeTextTokens' implicitly has return type 'any... Remove this comment to see the full error message
export function decodeTextTokens(tokenizerType, ids) {
    // Currently, neither remote API can decode, but this may change in the future. Put this guard here to be safe
    if (tokenizerType === tokenizers.API_CURRENT) {
        return decodeTextTokens(tokenizers.NONE, ids);
    }
    const tokenizerName = resolveTokenizerName(tokenizerType);
    return genericDecodeTokens(tokenizerName, ids);
}

/**
 * Fetches the tokenizer map from the backend and populates the local
 * lookup tables (ENCODE_TOKENIZERS, _tokenizerNameById).
 */
async function loadTokenizerMap(): Promise<void> {
    try {
        const res = await fetch(`${TOKENIZER_BASE}/map`);
        if (!res.ok) return;
        const data = await res.json();
        const list: { id: number; name: string; supportsEncode: boolean }[] =
            data?.tokenizers || [];
        const nameById: Record<number, string> = {};
        for (const t of list) {
            if (t.id >= 0) nameById[t.id] = t.name;
            if (t.supportsEncode && t.id >= 0) {
                (ENCODE_TOKENIZERS as number[]).push(t.id);
            }
        }
        _tokenizerNameById = nameById;
    } catch (e) {
        console.warn('Failed to load tokenizer map from backend', e);
    }
}

/**
 *
 */
export async function initTokenizers() {
    await loadTokenizerMap();
    TEXTGEN_TOKENIZERS.push(
        textgen_types.OOBA,
        textgen_types.TABBY,
        textgen_types.KOBOLDCPP,
        textgen_types.LLAMACPP,
        textgen_types.VLLM,
        textgen_types.APHRODITE,
    );
    eventSource.on(event_types.ONLINE_STATUS_CHANGED, async () => {
        // Clear tokenizer warning when (re)connecting to an LLM backend that supports tokenization
        if (
            main_api === 'textgenerationwebui' &&
            // @ts-expect-error TS(2345) FIXME: Type is not assignable.
            TEXTGEN_TOKENIZERS.includes(textgen_settings.type)
        ) {
            sessionStorage.removeItem(TOKENIZER_WARNING_KEY);
        }
    });
    await loadTokenCache();
    preWarmTokenizerCache();
    registerDebugFunction(
        'resetTokenCache',
        'Reset token cache',
        'Purges the calculated token counts. Use this if you want to force a full re-tokenization of all chats or suspect the token counts are wrong.',
        resetTokenCache,
    );
}
