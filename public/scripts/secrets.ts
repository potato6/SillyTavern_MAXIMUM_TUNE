import { DOMPurify, moment, sha256 } from '../lib.js';
import { event_types, eventSource, getRequestHeaders, saveSettings } from '../script.js';
import { t } from './i18n.js';
import { chat_completion_sources } from './openai.js';
import { callGenericPopup, Popup, POPUP_RESULT, POPUP_TYPE } from './popup.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from './slash-commands/SlashCommandArgument.js';
import { enumIcons } from './slash-commands/SlashCommandCommonEnumsProvider.js';
import { enumTypes, SlashCommandEnumValue } from './slash-commands/SlashCommandEnumValue.js';
import { SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import { renderTemplateAsync } from './templates.js';
import { textgen_types } from './textgen-settings.js';
import { getCurrentUserHandle } from './user.js';
import { copyText, isTrueBoolean, uuidv4 } from './utils.js';
import { accountStorage } from './util/AccountStorage.js';

export const SECRET_KEYS = {
    HORDE: 'api_key_horde',
    MANCER: 'api_key_mancer',
    VLLM: 'api_key_vllm',
    APHRODITE: 'api_key_aphrodite',
    TABBY: 'api_key_tabby',
    OPENAI: 'api_key_openai',
    NOVEL: 'api_key_novel',
    CLAUDE: 'api_key_claude',
    DEEPL: 'deepl',
    LIBRE: 'libre',
    LIBRE_URL: 'libre_url',
    LINGVA_URL: 'lingva_url',
    OPENROUTER: 'api_key_openrouter',
    AI21: 'api_key_ai21',
    ONERING_URL: 'oneringtranslator_url',
    DEEPLX_URL: 'deeplx_url',
    MAKERSUITE: 'api_key_makersuite',
    VERTEXAI: 'api_key_vertexai',
    SERPAPI: 'api_key_serpapi',
    MISTRALAI: 'api_key_mistralai',
    TOGETHERAI: 'api_key_togetherai',
    INFERMATICAI: 'api_key_infermaticai',
    DREAMGEN: 'api_key_dreamgen',
    CUSTOM: 'api_key_custom',
    OOBA: 'api_key_ooba',
    NOMICAI: 'api_key_nomicai',
    KOBOLDCPP: 'api_key_koboldcpp',
    LLAMACPP: 'api_key_llamacpp',
    COHERE: 'api_key_cohere',
    PERPLEXITY: 'api_key_perplexity',
    GROQ: 'api_key_groq',
    AZURE_TTS: 'api_key_azure_tts',
    AZURE_OPENAI: 'api_key_azure_openai',
    FEATHERLESS: 'api_key_featherless',
    HUGGINGFACE: 'api_key_huggingface',
    STABILITY: 'api_key_stability',
    CUSTOM_OPENAI_TTS: 'api_key_custom_openai_tts',
    CHUTES: 'api_key_chutes',
    ELECTRONHUB: 'api_key_electronhub',
    NANOGPT: 'api_key_nanogpt',
    TAVILY: 'api_key_tavily',
    BFL: 'api_key_bfl',
    COMFY_RUNPOD: 'api_key_comfy_runpod',
    GENERIC: 'api_key_generic',
    DEEPSEEK: 'api_key_deepseek',
    SERPER: 'api_key_serper',
    AIMLAPI: 'api_key_aimlapi',
    FALAI: 'api_key_falai',
    XAI: 'api_key_xai',
    FIREWORKS: 'api_key_fireworks',
    VERTEXAI_SERVICE_ACCOUNT: 'vertexai_service_account_json',
    MINIMAX: 'api_key_minimax',
    MINIMAX_GROUP_ID: 'minimax_group_id',
    MOONSHOT: 'api_key_moonshot',
    COMETAPI: 'api_key_cometapi',
    ZAI: 'api_key_zai',
    SILICONFLOW: 'api_key_siliconflow',
    ELEVENLABS: 'api_key_elevenlabs',
    POLLINATIONS: 'api_key_pollinations',
    VOLCENGINE_APP_ID: 'volcengine_app_id',
    VOLCENGINE_ACCESS_KEY: 'volcengine_access_key',
    WORKERS_AI: 'api_key_workers_ai',
} as const;

const FRIENDLY_NAMES: Record<string, string> = {
    [SECRET_KEYS.HORDE]: 'AI Horde',
    [SECRET_KEYS.MANCER]: 'Mancer',
    [SECRET_KEYS.OPENAI]: 'OpenAI',
    [SECRET_KEYS.NOVEL]: 'NovelAI',
    [SECRET_KEYS.CLAUDE]: 'Claude',
    [SECRET_KEYS.OPENROUTER]: 'OpenRouter',
    [SECRET_KEYS.AI21]: 'AI21',
    [SECRET_KEYS.MAKERSUITE]: 'Google AI Studio',
    [SECRET_KEYS.VERTEXAI]: 'Google Vertex AI (Express Mode)',
    [SECRET_KEYS.VLLM]: 'vLLM',
    [SECRET_KEYS.APHRODITE]: 'Aphrodite',
    [SECRET_KEYS.TABBY]: 'TabbyAPI',
    [SECRET_KEYS.MISTRALAI]: 'MistralAI',
    [SECRET_KEYS.CUSTOM]: 'Custom (OpenAI-compatible)',
    [SECRET_KEYS.TOGETHERAI]: 'TogetherAI',
    [SECRET_KEYS.OOBA]: 'Text Generation WebUI',
    [SECRET_KEYS.INFERMATICAI]: 'InfermaticAI',
    [SECRET_KEYS.DREAMGEN]: 'DreamGen',
    [SECRET_KEYS.NOMICAI]: 'NomicAI',
    [SECRET_KEYS.KOBOLDCPP]: 'KoboldCpp',
    [SECRET_KEYS.LLAMACPP]: 'llama.cpp',
    [SECRET_KEYS.COHERE]: 'Cohere',
    [SECRET_KEYS.PERPLEXITY]: 'Perplexity',
    [SECRET_KEYS.GROQ]: 'Groq',
    [SECRET_KEYS.FEATHERLESS]: 'Featherless',
    [SECRET_KEYS.HUGGINGFACE]: 'HuggingFace',
    [SECRET_KEYS.CHUTES]: 'Chutes',
    [SECRET_KEYS.ELECTRONHUB]: 'Electron Hub',
    [SECRET_KEYS.NANOGPT]: 'NanoGPT',
    [SECRET_KEYS.GENERIC]: 'Generic (OpenAI-compatible)',
    [SECRET_KEYS.DEEPSEEK]: 'DeepSeek',
    [SECRET_KEYS.XAI]: 'xAI (Grok)',
    [SECRET_KEYS.VERTEXAI_SERVICE_ACCOUNT]: 'Google Vertex AI (Service Account)',
    [SECRET_KEYS.STABILITY]: 'Stability AI',
    [SECRET_KEYS.CUSTOM_OPENAI_TTS]: 'Custom OpenAI TTS',
    [SECRET_KEYS.TAVILY]: 'Tavily',
    [SECRET_KEYS.BFL]: 'Black Forest Labs',
    [SECRET_KEYS.COMFY_RUNPOD]: 'ComfyUI RunPod',
    [SECRET_KEYS.SERPAPI]: 'SerpApi',
    [SECRET_KEYS.SERPER]: 'Serper',
    [SECRET_KEYS.FALAI]: 'FAL.AI',
    [SECRET_KEYS.AZURE_TTS]: 'Azure TTS',
    [SECRET_KEYS.AIMLAPI]: 'AI/ML API',
    [SECRET_KEYS.FIREWORKS]: 'Fireworks AI',
    [SECRET_KEYS.DEEPL]: 'DeepL',
    [SECRET_KEYS.LIBRE]: 'LibreTranslate',
    [SECRET_KEYS.LIBRE_URL]: 'LibreTranslate Endpoint (e.g. http://127.0.0.1:5000/translate)',
    [SECRET_KEYS.LINGVA_URL]: 'Lingva Endpoint (e.g. https://lingva.ml/api/v1)',
    [SECRET_KEYS.ONERING_URL]: 'OneRingTranslator Endpoint (e.g. http://127.0.0.1:4990/translate)',
    [SECRET_KEYS.DEEPLX_URL]: 'DeepLX Endpoint (e.g. http://127.0.0.1:1188/translate)',
    [SECRET_KEYS.MINIMAX]: 'MiniMax',
    [SECRET_KEYS.MINIMAX_GROUP_ID]: 'MiniMax Group ID',
    [SECRET_KEYS.MOONSHOT]: 'Moonshot AI',
    [SECRET_KEYS.COMETAPI]: 'CometAPI',
    [SECRET_KEYS.AZURE_OPENAI]: 'Azure OpenAI',
    [SECRET_KEYS.ZAI]: 'Z.AI',
    [SECRET_KEYS.SILICONFLOW]: 'SiliconFlow',
    [SECRET_KEYS.ELEVENLABS]: 'ElevenLabs TTS',
    [SECRET_KEYS.POLLINATIONS]: 'Pollinations',
    [SECRET_KEYS.VOLCENGINE_APP_ID]: 'Volcengine App ID',
    [SECRET_KEYS.VOLCENGINE_ACCESS_KEY]: 'Volcengine Access Key',
    [SECRET_KEYS.WORKERS_AI]: 'Cloudflare Workers AI',
};

const INPUT_MAP: Record<string, string> = {
    [SECRET_KEYS.HORDE]: '#horde_api_key',
    [SECRET_KEYS.MANCER]: '#api_key_mancer',
    [SECRET_KEYS.OPENAI]: '#api_key_openai',
    [SECRET_KEYS.NOVEL]: '#api_key_novel',
    [SECRET_KEYS.CLAUDE]: '#api_key_claude',
    [SECRET_KEYS.OPENROUTER]: '.api_key_openrouter',
    [SECRET_KEYS.AI21]: '#api_key_ai21',
    [SECRET_KEYS.MAKERSUITE]: '#api_key_makersuite',
    [SECRET_KEYS.VERTEXAI]: '#api_key_vertexai',
    [SECRET_KEYS.VLLM]: '#api_key_vllm',
    [SECRET_KEYS.APHRODITE]: '#api_key_aphrodite',
    [SECRET_KEYS.TABBY]: '#api_key_tabby',
    [SECRET_KEYS.MISTRALAI]: '#api_key_mistralai',
    [SECRET_KEYS.CUSTOM]: '#api_key_custom',
    [SECRET_KEYS.TOGETHERAI]: '#api_key_togetherai',
    [SECRET_KEYS.OOBA]: '#api_key_ooba',
    [SECRET_KEYS.INFERMATICAI]: '#api_key_infermaticai',
    [SECRET_KEYS.DREAMGEN]: '#api_key_dreamgen',
    [SECRET_KEYS.KOBOLDCPP]: '#api_key_koboldcpp',
    [SECRET_KEYS.LLAMACPP]: '#api_key_llamacpp',
    [SECRET_KEYS.COHERE]: '#api_key_cohere',
    [SECRET_KEYS.PERPLEXITY]: '#api_key_perplexity',
    [SECRET_KEYS.GROQ]: '#api_key_groq',
    [SECRET_KEYS.FEATHERLESS]: '#api_key_featherless',
    [SECRET_KEYS.HUGGINGFACE]: '#api_key_huggingface',
    [SECRET_KEYS.CHUTES]: '#api_key_chutes',
    [SECRET_KEYS.ELECTRONHUB]: '#api_key_electronhub',
    [SECRET_KEYS.NANOGPT]: '#api_key_nanogpt',
    [SECRET_KEYS.GENERIC]: '#api_key_generic',
    [SECRET_KEYS.DEEPSEEK]: '#api_key_deepseek',
    [SECRET_KEYS.AIMLAPI]: '#api_key_aimlapi',
    [SECRET_KEYS.XAI]: '#api_key_xai',
    [SECRET_KEYS.VERTEXAI_SERVICE_ACCOUNT]: '#vertexai_service_account_json',
    [SECRET_KEYS.MOONSHOT]: '#api_key_moonshot',
    [SECRET_KEYS.FIREWORKS]: '#api_key_fireworks',
    [SECRET_KEYS.COMETAPI]: '#api_key_cometapi',
    [SECRET_KEYS.AZURE_OPENAI]: '#api_key_azure_openai',
    [SECRET_KEYS.ZAI]: '#api_key_zai',
    [SECRET_KEYS.SILICONFLOW]: '#api_key_siliconflow',
    [SECRET_KEYS.MINIMAX]: '#api_key_minimax',
    [SECRET_KEYS.POLLINATIONS]: '#api_key_pollinations',
    [SECRET_KEYS.WORKERS_AI]: '#api_key_workers_ai',
};

const getLabel = () => moment().format('L LT');

/**
 * Resolves the secret key based on the selected API, chat completion source, and text completion type.
 * @returns {string|null} The secret key corresponding to the selected API, or null if no key is found.
 */
export function resolveSecretKey() {
    const context = (SillyTavern as unknown as Record<string, unknown>).getContext as (...args: unknown[]) => unknown;
    const { mainApi, chatCompletionSettings, textCompletionSettings } = context as unknown as { mainApi: string; chatCompletionSettings: Record<string, unknown>; textCompletionSettings: Record<string, unknown> };
    const chatCompletionSource = chatCompletionSettings.chat_completion_source as string;
    const textCompletionType = textCompletionSettings.type as string;

    if (mainApi === 'koboldhorde') {
        return SECRET_KEYS.HORDE;
    }

    if (mainApi === 'novel') {
        return SECRET_KEYS.NOVEL;
    }

    if (mainApi === 'textgenerationwebui') {
        const [key] = Object.entries(textgen_types).find(([, value]) => value === textCompletionType) ?? [null];
        if (key && (SECRET_KEYS as Record<string, string | undefined>)[key as string]) {
            return (SECRET_KEYS as Record<string, string | undefined>)[key as string]!;
        }
    }

    if (mainApi === 'openai') {
        if (chatCompletionSource === chat_completion_sources.VERTEXAI) {
            switch ((chatCompletionSettings as Record<string, unknown>).vertexai_auth_mode as string) {
                case 'express':
                    return SECRET_KEYS.VERTEXAI;
                case 'full':
                    return SECRET_KEYS.VERTEXAI_SERVICE_ACCOUNT;
            }
        }

        const [key] = Object.entries(chat_completion_sources).find(([, value]) => value === chatCompletionSource) ?? [null];
        if (key && (SECRET_KEYS as Record<string, string | undefined>)[key as string]) {
            return (SECRET_KEYS as Record<string, string | undefined>)[key as string]!;
        }
    }

    return null;
}

/**
 * Gets the label of a secret by its ID.
 * @param {string} id The ID of the secret to find.
 * @returns {string} The label of the secret with the given ID, or an empty string if not found.
 */
export function getSecretLabelById(id: string) {
    for (const key of Object.values(SECRET_KEYS)) {
        const secrets = (secret_state as Record<string, unknown>)[key] as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(secrets)) {
            continue;
        }
        const secret = secrets.find(s => s.id === id);
        if (secret) {
            return `${secret.label as string} (${secret.value as string})`;
        }
    }
    return '';
}

/**
 *
 */
export function updateSecretDisplay() {
    for (const [secret_key, input_selector] of Object.entries(INPUT_MAP)) {
        const validSecret = !!((secret_state as Record<string, unknown>)[secret_key]);
        const placeholder = document.getElementById('viewSecrets')?.getAttribute(validSecret ? 'key_saved_text' : 'missing_key_text');
        const label = getActiveSecretLabel(secret_key);
        const placeholderWithLabel = label ? `${placeholder} (${label})` : placeholder;
        document.querySelector(input_selector)?.setAttribute('placeholder', placeholderWithLabel ?? '');
    }
}

/**
 * Gets the active secret label for a given key.
 * @param {string} key Gets the active secret label for a given key.
 * @returns {string} The label of the active secret, or '[No label]' if none is active.
 */
function getActiveSecretLabel(key: string) {
    const selectedSecret = (secret_state as Record<string, unknown>)[key] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(selectedSecret)) {
        const activeSecret = selectedSecret.find(x => x.active);
        if (!activeSecret) {
            return '';
        }
        return (activeSecret.label as string) || (activeSecret.value as string) || t`[No label]`;
    }
    return '';
}

/**
 * Checks if secrets can be viewed based on server configuration.
 * @returns {Promise<boolean|null>} A boolean value, or null if the request fails.
 */
export async function canViewSecrets() {
    try {
        const response = await fetch('/api/secrets/settings', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json() as Record<string, unknown>;
        return data?.allowKeysExposure === true;
    } catch (error) {
        console.error('Error getting secrets settings:', error);
        return null;
    }
}

/**
 *
 */
async function viewSecrets() {
    const response = await fetch('/api/secrets/view', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
    });

    if (response.status == 403) {
        await Popup.show.text(t`Forbidden`, t`To view your API keys here, set the value of allowKeysExposure to true in config.yaml file and restart the SillyTavern server.`);
        return;
    }

    if (!response.ok) {
        return;
    }

    const data = await response.json() as Record<string, string>;

    const table = document.createElement('table');
    table.classList.add('responsiveTable');
    table.innerHTML = '<thead><th>Key</th><th>Value</th></thead>';

    for (const [key, value] of Object.entries(data)) {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${DOMPurify.sanitize(key)}</td><td>${DOMPurify.sanitize(value)}</td>`;
        table.appendChild(row);
    }

    await callGenericPopup(table.outerHTML, POPUP_TYPE.TEXT, '', { wide: true, large: true, allowVerticalScrolling: true });
}

/**
 * @type {import('../../src/endpoints/secrets.js').SecretStateMap}
 */
export let secret_state: Record<string, unknown> = {};

/**
 * Write a secret value to the server.
 * @param {string} key Secret key
 * @param {string} value Secret value to write
 * @param {string} [label] (Optional) Label for the key. If not provided, generated automatically.
 * @param {object} [options] Additional options
 * @param {boolean} [options.allowEmpty] Whether to allow writing empty values. If false and value is empty, the secret will be deleted.
 * @returns {Promise<string?>} The ID of the newly created secret key, or null if no value is provided.
 */
export async function writeSecret(key: string, value: string, label?: string, {
    allowEmpty
}: { allowEmpty?: boolean } = {}) {
    try {
        if (!value && !allowEmpty) {
            console.warn(`No value provided for ${key} in writeSecret, redirecting to deleteSecret`);
            await deleteSecret(key);
            return null;
        }

        if (!label) {
            label = getLabel();
        }

        const response = await fetch('/api/secrets/write', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ key, value, label }),
        });

        if (!response.ok) {
            return null;
        }

        const { id } = await response.json() as { id: string };
        // Clear the input field
        const inputSelector = INPUT_MAP[key];
        const inputEl = inputSelector ? document.querySelector(inputSelector) : null;
        if (inputEl instanceof HTMLInputElement) {
            inputEl.value = '';
            inputEl.dispatchEvent(new Event('input'));
        }
        await readSecretState();
        await eventSource.emit(event_types.SECRET_WRITTEN, key);
        return id;
    } catch (error) {
        console.error(`Could not write secret value: ${key}`, error);
        return null;
    }
}

/**
 * Deletes a secret value from the server.
 * @param {string} key Secret key
 * @param {string} [id] (Optional) ID of the secret key to delete. If not provided, deletes an active key.
 */
export async function deleteSecret(key: string, id?: string) {
    try {
        const response = await fetch('/api/secrets/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ key, id }),
        });

        if (response.ok) {
            await readSecretState();
            // Force reconnection to the API with the new key
            document.getElementById('main_api')?.dispatchEvent(new Event('change'));
            await eventSource.emit(event_types.SECRET_DELETED, key);
        }
    } catch (error) {
        console.error(`Could not delete secret value: ${key}`, error);
    }
}

/**
 * Reads the current state of secrets from the server.
 * @returns {Promise<void>}
 */
export async function readSecretState() {
    try {
        const response = await fetch('/api/secrets/read', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (response.ok) {
            secret_state = await response.json() as Record<string, unknown>;
            updateSecretDisplay();
            updateInputDataLists();
        }
    } catch {
        console.error('Could not read secrets file');
    }
}

/**
 * Finds a secret value by key.
 * @param {string} key Secret key
 * @param {string} [id] ID of the secret to find. If not provided, will return the active secret.
 * @returns {Promise<string?>} Secret value, or null if keys are not exposed
 */
export async function findSecret(key: string, id?: string) {
    try {
        const response = await fetch('/api/secrets/find', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ key, id }),
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json() as Record<string, unknown>;
        return data.value as string;
    } catch {
        console.error('Could not find secret value: ', key);
        return null;
    }
}

/**
 * Changes the active value for a given secret key.
 * @param {string} key Secret key to rotate
 * @param {string} id ID of the secret to rotate
 */
export async function rotateSecret(key: string, id: string) {
    try {
        const response = await fetch('/api/secrets/rotate', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ key, id }),
        });

        if (response.ok) {
            await readSecretState();
            // Force reconnection to the API with the new key
            document.getElementById('main_api')?.dispatchEvent(new Event('change'));
            await eventSource.emit(event_types.SECRET_ROTATED, key);
        }
    } catch (error) {
        console.error(`Could not rotate secret value: ${key}`, error);
    }
}

/**
 * Renames a secret value on the server.
 * @param {string} key Secret key to rename
 * @param {string} id ID of the secret to rename
 * @param {string} label Label to rename the secret to
 */
export async function renameSecret(key: string, id: string, label: string) {
    try {
        const response = await fetch('/api/secrets/rename', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ key, id, label }),
        });

        if (response.ok) {
            await readSecretState();
            await eventSource.emit(event_types.SECRET_EDITED, key);
        }
    } catch (error) {
        console.error(`Could not rename secret value: ${key}`, error);
    }
}

/**
 * Generates a storage key for the PKCE code verifier for a given source.
 * @param {string} source Source for which to generate the storage key (e.g. 'openrouter')
 * @returns {string} The storage key for the PKCE code verifier for a given source.
 */
const getVerifierKey = (source: string) => `${getCurrentUserHandle()}_${source}_code_verifier`;

/**
 * Generates a code challenge for PKCE authentication flows.
 * @param {string} input Input secret string to generate the code challenge from.
 * @returns {string} S256 code challenge generated from the input string, encoded in base64url format.
 */
const generateChallenge = (input: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBytes = sha256.array(data);
    return btoa(String.fromCharCode(...hashBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * Redirects the user to authorize OpenRouter.
 */
async function authorizeOpenRouter() {
    if ((secret_state as Record<string, unknown>)[SECRET_KEYS.OPENROUTER]) {
        const confirmed = await Popup.show.confirm(t`OpenRouter API key already exists`, t`Do you really wish to create a new OpenRouter key? Your existing key will not be deleted.`);
        if (!confirmed) {
            return;
        }
    }

    // Generate a PKCE code verifier and code challenge
    const codeVerifier = uuidv4() + uuidv4();
    const codeChallenge = generateChallenge(codeVerifier);
    accountStorage.setItem(getVerifierKey('openrouter'), codeVerifier);
    await saveSettings();

    // Redirect to OpenRouter authorization URL with the code challenge and callback URL
    const redirectUrl = new URL('/callback/openrouter', window.location.origin);
    const openRouterUrl = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(redirectUrl.toString())}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
    location.href = openRouterUrl;
}

/**
 * Checks if the OpenRouter authorization code is present in the URL, and if so, exchanges it for an API key.
 * @returns {Promise<void>}
 */
export async function checkOpenRouterAuth() {
    const params = new URLSearchParams(location.search);
    const source = params.get('source');
    if (source === 'openrouter') {
        const query = new URLSearchParams(params.get('query') ?? '');
        try {
            const code = query.get('code');
            if (!code) {
                throw new Error('OpenRouter authorization code not found in URL');
            }

            const codeVerifier = accountStorage.getItem(getVerifierKey('openrouter'));
            if (!codeVerifier) {
                throw new Error('OpenRouter code verifier not found in accountStorage');
            }

            const response = await fetch('https://openrouter.ai/api/v1/auth/keys', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    code: code,
                    code_verifier: codeVerifier,
                    code_challenge_method: 'S256',
                }),
            });

            if (!response.ok) {
                throw new Error('OpenRouter exchange error');
            }

            const data = await response.json() as Record<string, unknown>;
            if (!data || !data.key) {
                throw new Error('OpenRouter invalid response');
            }

            await writeSecret(SECRET_KEYS.OPENROUTER, data.key as string);

            if ((secret_state as Record<string, unknown>)[SECRET_KEYS.OPENROUTER]) {
                notyf.success('OpenRouter token saved');
            } else {
                throw new Error('OpenRouter token not saved');
            }
        } catch (err) {
            notyf.error('Could not verify OpenRouter token. Please try again.');
            console.error('OpenRouter OAuth error:', err);
        } finally {
            // Remove the code from the URL
            const currentUrl = window.location.href;
            const urlWithoutSearchParams = currentUrl.split('?')[0];
            window.history.pushState({}, '', urlWithoutSearchParams);
        }
    }

    // Clean-up any code verifiers that might be left in accountStorage from abandoned auth flows
    accountStorage.removeItem(getVerifierKey('openrouter'));
}

/**
 * Updates the input data lists for secret keys for autocomplete functionality.
 */
function updateInputDataLists() {
    let container = document.getElementById('secrets_datalists');
    if (!container) {
        container = document.createElement('div');
        container.id = 'secrets_datalists';
        container.style.display = 'none';
        document.body.appendChild(container);
    }

    for (const [key, inputSelector] of Object.entries(INPUT_MAP)) {
        const inputElements = document.querySelectorAll(inputSelector);
        if (inputElements.length === 0) {
            console.warn(`No input elements found for key: ${key}`);
            continue;
        }

        const dataListId = `${key}_datalist`;
        let dataList = document.getElementById(dataListId);
        if (!dataList) {
            dataList = document.createElement('datalist');
            dataList.id = dataListId;
            container.appendChild(dataList);
        }

        // Clear existing options
        dataList.innerHTML = '';

        const secrets = (secret_state as Record<string, unknown>)[key] as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(secrets)) {
            continue;
        }

        for (const secret of secrets) {
            const option = document.createElement('option');
            option.value = secret.id as string;
            option.textContent = `${secret.label as string} (${secret.value as string})`;
            dataList.appendChild(option);
        }

        // Set the input element to use the datalist
        inputElements.forEach(element => {
            element.setAttribute('list', dataListId);
        });
    }
}

/**
 * Opens the key manager dialog for a specific key.
 * @param {string} key Key for which to open the key manager dialog.
 */
async function openKeyManagerDialog(key: string) {
    const name = FRIENDLY_NAMES[key] || key;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = await renderTemplateAsync('secretKeyManager', { name, key });
    const template = wrapper;
    const addSecretBtn = template.querySelector('button[data-action="add-secret"]') as HTMLElement | null;
    if (addSecretBtn) addSecretBtn.addEventListener('click', async function () {
        let label = '';
        let result = POPUP_RESULT.CANCELLED;
        const value = await Popup.show.input(t`Add Secret`, t`Secret value (can be empty):`, '', {
            customInputs: [{
                id: 'newSecretLabel',
                type: 'text',
                label: t`Label (optional):`,
            }],
            onClose: (popup: Record<string, unknown>) => {
                if (popup.result) {
                    label = String((popup.inputResults as Map<string, unknown>)?.get('newSecretLabel') ?? '').trim();
                    result = popup.result as unknown as typeof POPUP_RESULT.CANCELLED;
                }
            },
        });
        if (!value) {
            if (result !== POPUP_RESULT.AFFIRMATIVE) {
                return;
            }
            const allowEmpty = await Popup.show.confirm(t`No value entered`, t`No value was entered for the secret. Do you want to add an empty secret?`);
            if (!allowEmpty) {
                return;
            }
        }
        await writeSecret(key, value ?? '', label, { allowEmpty: true });
        await renderSecretsList();
    });

    await renderSecretsList();
    await callGenericPopup(template, POPUP_TYPE.TEXT, '', { wide: true, large: true, onOpen: scrollToActive });

    /**
     *
     */
    async function renderSecretsList() {
        const secrets = ((secret_state as Record<string, unknown>)[key] ?? []) as Array<Record<string, unknown>>;
        const list = template.querySelector('.secretKeyManagerList') as HTMLElement | null;
        const previousScrollTop = list?.scrollTop ?? 0;

        const emptyMessage = template.querySelector('.secretKeyManagerListEmpty') as HTMLElement | null;
        if (emptyMessage instanceof HTMLElement) {
            emptyMessage.style.display = secrets.length === 0 ? '' : 'none';
        }

        const itemBlocks: HTMLElement[] = [];
        for (const secret of secrets) {
            const itemWrapper = document.createElement('div');
            itemWrapper.innerHTML = await renderTemplateAsync('secretKeyManagerListItem', secret);
            const itemTemplate = itemWrapper;
            const copyIdBtn = itemTemplate.querySelector('button[data-action="copy-id"]') as HTMLElement | null;
            if (copyIdBtn) copyIdBtn.addEventListener('click', async function () {
                await copyText(secret.id as string);
                notyf.info(t`Secret ID copied to clipboard.`);
            });
            const rotateSecretBtn = itemTemplate.querySelector('button[data-action="rotate-secret"]') as HTMLElement | null;
            if (rotateSecretBtn) rotateSecretBtn.addEventListener('click', async function () {
                await rotateSecret(key, secret.id as string);
                await renderSecretsList();
            });
            const copySecretBtn = itemTemplate.querySelector('button[data-action="copy-secret"]') as HTMLElement | null;
            if (copySecretBtn) copySecretBtn.addEventListener('click', async function () {
                const secretValue = await findSecret(key, secret.id as string);
                if (secretValue === null) {
                    notyf.error(t`The key exposure might be disabled by the server config.`, t`Failed to copy secret value`);
                    return;
                }
                await copyText(secretValue);
                notyf.info(t`Secret value copied to clipboard.`);
            });
            const renameSecretBtn = itemTemplate.querySelector('button[data-action="rename-secret"]') as HTMLElement | null;
            if (renameSecretBtn) renameSecretBtn.addEventListener('click', async function () {
                const label = await Popup.show.input(t`Rename Secret`, t`Enter new label for the secret:`, (secret as Record<string, unknown>)?.label as string || getLabel());
                if (!label) {
                    return;
                }
                await renameSecret(key, secret.id as string, label);
                await renderSecretsList();
            });
            const deleteSecretBtn = itemTemplate.querySelector('button[data-action="delete-secret"]') as HTMLElement | null;
            if (deleteSecretBtn) deleteSecretBtn.addEventListener('click', async function () {
                const confirm = await Popup.show.confirm(t`Delete Secret: ${(secret as Record<string, unknown>)?.label as string}`, t`Are you sure you want to delete this secret? This action cannot be undone.`);
                if (!confirm) {
                    return;
                }
                await deleteSecret(key, secret.id as string);
                await renderSecretsList();
            });
            itemBlocks.push(itemTemplate);
        }

        if (list) {
            list.innerHTML = '';
            for (const block of itemBlocks) {
                list.appendChild(block);
            }
            list.scrollTop = previousScrollTop;
        }
    }

    /**
     *
     */
    function scrollToActive() {
        const list = template.querySelector('.secretKeyManagerList') as HTMLElement | null;
        const activeKey = list?.querySelector('.active');
        if (activeKey instanceof HTMLElement && list instanceof HTMLElement) {
            const activeKeyScrollTop = activeKey.offsetTop + list.scrollTop - list.clientHeight / 2;
            list.scrollTop = activeKeyScrollTop;
        }
    }
}

/**
 *
 */
function registerSecretSlashCommands() {
    const secretKeyEnumProvider = () => Object.values(SECRET_KEYS).map(key => new SlashCommandEnumValue(key, (FRIENDLY_NAMES[key] || key), enumTypes.name, enumIcons.key));
    const secretIdEnumProvider = (executor: Record<string, unknown> | undefined, _scope: unknown) => {
        const key = (executor?.namedArgumentList as Array<Record<string, unknown>> | undefined)?.find(x => x.name === 'key')?.value?.toString() || resolveSecretKey();
        if (!key || !(secret_state as Record<string, unknown>)[key] || !Array.isArray((secret_state as Record<string, unknown>)[key]) || ((secret_state as Record<string, unknown>)[key] as unknown[]).length === 0) {
            return [];
        }

        return ((secret_state as Record<string, unknown>)[key] as Array<Record<string, unknown>>).map(secret => {
            return new SlashCommandEnumValue(secret.id as string, `${secret.label as string} (${secret.value as string})`, enumTypes.name, enumIcons.key);
        });
    };

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'secret-id',
        aliases: ['secret-rotate'],
        helpString: t`Sets the ID of a currently active secret key. Gets the ID of the secret key if no value is provided.`,
        returns: t`The ID of the secret key that is now active.`,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'quiet',
                description: t`Suppress toast message notifications.`,
                isRequired: false,
                defaultValue: String(false),
                typeList: [ARGUMENT_TYPE.BOOLEAN],
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'key',
                description: t`The key to get the secret ID for. If not provided, will use the currently active API secrets.`,
                isRequired: false,
                typeList: [ARGUMENT_TYPE.STRING],
                enumProvider: secretKeyEnumProvider,
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: t`The ID or a label of the secret key to set as active. If not provided, will return the currently active secret ID.`,
                isRequired: true,
                typeList: [ARGUMENT_TYPE.STRING],
                enumProvider: secretIdEnumProvider,
            }),
        ],
        callback: async (args: Record<string, unknown>, value: string) => {
            const quiet = isTrueBoolean(args?.quiet?.toString());
            const id = value?.toString()?.trim();
            const key = args?.key?.toString()?.trim() || resolveSecretKey();

            if (!key) {
                if (!quiet) {
                    notyf.error(t`No secret key provided, and the key can't be resolved for the currently selected API type.`);
                }
                return '';
            }

            const secrets = (secret_state as Record<string, unknown>)[key] as Array<Record<string, unknown>> | undefined;
            if (!Array.isArray(secrets) || secrets.length === 0) {
                if (!quiet) {
                    notyf.error(t`No saved secrets found for the key: ${key}`);
                }
                return '';
            }

            if (!id) {
                const activeSecret = secrets.find(s => s.active);
                if (!activeSecret) {
                    if (!quiet) {
                        notyf.error(t`No active secret found for the key: ${key}`);
                    }
                    return '';
                }
                return activeSecret.id as string;
            }

            const savedSecret = secrets.find(s => s.id === id) ?? secrets.find(s => s.label === id);
            if (!savedSecret) {
                if (!quiet) {
                    notyf.error(t`No secret found with ID: ${id} for the key: ${key}`);
                }
                return '';
            }

            // Set the secret as active
            await rotateSecret(key, savedSecret.id as string);
            if (!quiet) {
                notyf.success(t`Secret with ID: ${id} is now active for the key: ${key}`);
            }

            return savedSecret.id as string;
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'secret-delete',
        helpString: t`Deletes a secret key by ID.`,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'quiet',
                description: t`Suppress toast message notifications.`,
                isRequired: false,
                defaultValue: String(false),
                typeList: [ARGUMENT_TYPE.BOOLEAN],
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'key',
                description: t`The key to delete the secret from. If not provided, will use the currently active API secrets.`,
                isRequired: false,
                typeList: [ARGUMENT_TYPE.STRING],
                enumProvider: secretKeyEnumProvider,
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: t`The ID or a label of the secret key to delete. If not provided, will delete the active secret.`,
                isRequired: true,
                typeList: [ARGUMENT_TYPE.STRING],
                enumProvider: secretIdEnumProvider,
            }),
        ],
        callback: async (args: Record<string, unknown>, value: string) => {
            const quiet = isTrueBoolean(args?.quiet?.toString());
            const id = value?.toString()?.trim();
            const key = args?.key?.toString()?.trim() || resolveSecretKey();

            if (!key) {
                if (!quiet) {
                    notyf.error(t`No secret key provided, and the key can't be resolved for the currently selected API type.`);
                }
                return '';
            }

            const secrets = (secret_state as Record<string, unknown>)[key] as Array<Record<string, unknown>> | undefined;
            if (!Array.isArray(secrets) || secrets.length === 0) {
                if (!quiet) {
                    notyf.error(t`No saved secrets found for the key: ${key}`);
                }
                return '';
            }

            const savedSecret = secrets.find(s => s.id === id) ?? secrets.find(s => s.label === id) ?? secrets.find(s => s.active);
            if (!savedSecret) {
                if (!quiet) {
                    notyf.error(t`No secret found with ID: ${id} for the key: ${key}`);
                }
                return '';
            }

            // Delete the secret
            await deleteSecret(key, savedSecret.id as string);
            if (!quiet) {
                notyf.success(t`Secret with ID: ${id} has been deleted for the key: ${key}`);
            }

            return savedSecret.id as string;
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'secret-write',
        helpString: t`Writes a secret key with a value and an optional label.`,
        returns: t`The ID of the newly created secret key.`,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'quiet',
                description: t`Suppress toast message notifications.`,
                isRequired: false,
                defaultValue: String(false),
                typeList: [ARGUMENT_TYPE.BOOLEAN],
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'key',
                description: t`The key to write the secret to. If not provided, will use the currently active API secrets.`,
                isRequired: false,
                typeList: [ARGUMENT_TYPE.STRING],
                enumProvider: secretKeyEnumProvider,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'label',
                description: t`The label for the secret key. If not provided, will use the current date and time.`,
                isRequired: false,
                typeList: [ARGUMENT_TYPE.STRING],
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'empty',
                description: t`Whether to allow empty values.`,
                isRequired: false,
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: String(false),
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: t`The value of the secret key to write.`,
                isRequired: true,
                typeList: [ARGUMENT_TYPE.STRING],
            }),
        ],
        callback: async (args: Record<string, unknown>, value: string) => {
            const quiet = isTrueBoolean(args?.quiet?.toString());
            const allowEmpty = isTrueBoolean(args?.empty?.toString());
            const key = args?.key?.toString()?.trim() || resolveSecretKey();

            if (!key) {
                if (!quiet) {
                    notyf.error(t`No secret key provided, and the key can't be resolved for the currently selected API type.`);
                }
                return '';
            }

            const secrets = (secret_state as Record<string, unknown>)[key] as Array<Record<string, unknown>> | undefined;
            if (!Array.isArray(secrets) || secrets.length === 0) {
                if (!quiet) {
                    notyf.error(t`No saved secrets found for the key: ${key}`);
                }
                return '';
            }

            const valueStr = value?.toString()?.trim();
            if (!valueStr && !allowEmpty) {
                if (!quiet) {
                    notyf.error(t`No value provided for the secret key: ${key}`);
                }
                return '';
            }

            const label = args?.label?.toString()?.trim() || getLabel();
            const id = await writeSecret(key, valueStr, label, { allowEmpty });

            if (!quiet) {
                notyf.success(t`Secret has been written for the key: ${key}`);
            }

            return id || '';
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'secret-rename',
        helpString: t`Renames a secret key by ID.`,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'quiet',
                description: t`Suppress toast message notifications.`,
                isRequired: false,
                defaultValue: String(false),
                typeList: [ARGUMENT_TYPE.BOOLEAN],
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'key',
                description: t`The key to rename the secret in. If not provided, will use the currently active API secrets.`,
                isRequired: false,
                typeList: [ARGUMENT_TYPE.STRING],
                enumProvider: secretKeyEnumProvider,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'id',
                description: t`The ID of the secret to rename. If not provided, will rename the active secret.`,
                isRequired: true,
                typeList: [ARGUMENT_TYPE.STRING],
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: t`The new label for the secret key.`,
                isRequired: true,
                typeList: [ARGUMENT_TYPE.STRING],
            }),
        ],
        callback: async (args: Record<string, unknown>, value: string) => {
            const quiet = isTrueBoolean(args?.quiet?.toString());
            const key = args?.key?.toString()?.trim() || resolveSecretKey();
            const id = args?.id?.toString()?.trim();

            if (!key) {
                if (!quiet) {
                    notyf.error(t`No secret key provided, and the key can't be resolved for the currently selected API type.`);
                }
                return '';
            }

            const secrets = (secret_state as Record<string, unknown>)[key] as Array<Record<string, unknown>> | undefined;
            if (!Array.isArray(secrets) || secrets.length === 0) {
                if (!quiet) {
                    notyf.error(t`No saved secrets found for the key: ${key}`);
                }
                return '';
            }

            const newLabel = value?.toString()?.trim();
            if (!newLabel) {
                if (!quiet) {
                    notyf.error(t`No new label provided for the secret key: ${key}`);
                }
                return '';
            }

            const savedSecret = secrets.find(s => s.id === id) ?? secrets.find(s => s.label === id) ?? secrets.find(s => s.active);
            if (!savedSecret) {
                if (!quiet) {
                    notyf.error(t`No secret found with ID: ${id} for the key: ${key}`);
                }
                return '';
            }

            // Rename the secret
            await renameSecret(key, savedSecret.id as string, newLabel);
            if (!quiet) {
                notyf.success(t`Secret with ID: ${id} has been renamed to "${newLabel}" for the key: ${key}`);
            }

            return savedSecret.id as string;
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'secret-read',
        aliases: ['secret-find', 'secret-get'],
        helpString: t`Reads a secret key by ID. If key exposure is disabled, this command will not work!`,
        returns: t`The value of the secret key.`,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'quiet',
                description: t`Suppress toast message notifications.`,
                isRequired: false,
                defaultValue: String(false),
                typeList: [ARGUMENT_TYPE.BOOLEAN],
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'key',
                description: t`The key to read the secret from. If not provided, will use the currently active API secrets.`,
                isRequired: false,
                typeList: [ARGUMENT_TYPE.STRING],
                enumProvider: secretKeyEnumProvider,
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: t`The ID or a label of the secret key to read. If not provided, will return the currently active secret value.`,
                isRequired: true,
                typeList: [ARGUMENT_TYPE.STRING],
                enumProvider: secretIdEnumProvider,
            }),
        ],
        callback: async (args: Record<string, unknown>, value: string) => {
            const quiet = isTrueBoolean(args?.quiet?.toString());
            const key = args?.key?.toString()?.trim() || resolveSecretKey();
            const id = value?.toString()?.trim();

            if (!key) {
                if (!quiet) {
                    notyf.error(t`No secret key provided, and the key can't be resolved for the currently selected API type.`);
                }
                return '';
            }

            const secrets = (secret_state as Record<string, unknown>)[key] as Array<Record<string, unknown>> | undefined;
            if (!Array.isArray(secrets) || secrets.length === 0) {
                if (!quiet) {
                    notyf.error(t`No saved secrets found for the key: ${key}`);
                }
                return '';
            }

            const savedSecret = secrets.find(s => s.id === id) ?? secrets.find(s => s.label === id) ?? secrets.find(s => s.active);
            if (!savedSecret) {
                if (!quiet) {
                    notyf.error(t`No secret found with ID: ${id} for the key: ${key}`);
                }
                return '';
            }

            const secretValue = await findSecret(key, savedSecret.id as string);
            if (secretValue === null) {
                if (!quiet) {
                    notyf.error(t`Could not retrieve the secret value for key: ${key}. Key exposure might be disabled.`);
                }
                return '';
            }

            return secretValue;
        },
    }));
}

/**
 *
 */
export async function initSecrets() {
    document.getElementById('viewSecrets')?.addEventListener('click', viewSecrets);
    document.addEventListener('click', async function (e: Event) {
        if (!(e.target instanceof Element)) return;
        const manageBtn = e.target.closest('.manage-api-keys') as HTMLElement | null;
        if (!manageBtn) return;
        const key = manageBtn.getAttribute('data-key');
        if (!key || !(Object.values(SECRET_KEYS) as string[]).includes(key)) {
            console.error('Invalid key for manage-api-keys:', key);
            return;
        }
        await openKeyManagerDialog(key);
    });
    document.addEventListener('input', function (this: HTMLElement, e: Event) {
        if (!(e.target instanceof Element)) return;
        const id = e.target.getAttribute('id');
        const value = (e.target as HTMLInputElement).value;

        // Find the key based on the entered value
        for (const [key, inputSelector] of Object.entries(INPUT_MAP)) {
            if (!value || !e.target.matches(inputSelector)) {
                continue;
            }
            const secrets = (secret_state as Record<string, unknown>)[key] as Array<Record<string, unknown>> | undefined;
            if (!Array.isArray(secrets)) {
                continue;
            }
            const secretMatch = secrets.find(secret => secret.id === value);
            if (secretMatch) {
                (e.target as HTMLInputElement).value = '';
                return rotateSecret(key, secretMatch.id as string);
            }
        }

        const warningElement = document.querySelector(`[data-for="${id}"]`);
        if (warningElement) {
            warningElement.classList.toggle('hidden', !(value.length > 0));
        }
    });
    document.querySelector('.openrouter_authorize')?.addEventListener('click', authorizeOpenRouter);
    document.addEventListener('click', async function (e: Event) {
        const creditsBtn = e.target instanceof Element ? e.target.closest('.openrouter_view_credits') as HTMLElement | null : null;
        if (!creditsBtn) return;
        e.preventDefault();
        const display = creditsBtn.parentElement?.querySelector('.openrouter_credits_display') as HTMLElement | null;
        if (!display) return;
        display.textContent = t`Loading…`;
        try {
            const response = await fetch('/api/openrouter/credits', {
                method: 'POST',
                headers: getRequestHeaders(),
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json() as Record<string, unknown>;
            if (typeof data.remaining !== 'number') {
                throw new Error('Invalid response');
            }
            display.textContent = `$${(data.remaining as number).toFixed(2)}`;
        } catch (error) {
            console.error('Failed to fetch OpenRouter credits:', error);
            display.textContent = '';
            notyf.error(t`Could not fetch OpenRouter credits. Please try again.`);
        }
    });

    const formatNanoGptNumber = (num: unknown, decimals: number | null = null) => {
        const number = Number(num);
        if (!Number.isFinite(number)) return decimals === null ? '0' : (0).toFixed(decimals);
        if (decimals !== null) return number.toFixed(decimals);
        if (number >= 1000000) return (number / 1000000).toFixed(1) + 'M';
        if (number >= 1000) return (number / 1000).toFixed(1) + 'K';
        return number.toString();
    };

    const createNanoGptCreditsPopup = (credits: Record<string, unknown>) => {
        const root = document.createElement('div');
        root.className = 'nanogpt-credits-popup';
        const heading = document.createElement('h3');
        heading.textContent = t`NanoGPT Credits & Usage`;
        root.appendChild(heading);

        const rows: Array<[string, string]> = [
            [t`USD`, `$${formatNanoGptNumber(credits.usdBalance as number, 2)}`],
            [t`NANO`, formatNanoGptNumber(credits.nanoBalance as number, 3)],
        ];

        const addUsage = (label: string, usage: Record<string, unknown> | undefined, limit: number | undefined) => {
            if (usage) {
                rows.push([label, t`${formatNanoGptNumber(usage.used)} / ${formatNanoGptNumber(limit ?? 0)} (${formatNanoGptNumber(usage.remaining)} left)`]);
            }
        };

        if ((credits.subscription as Record<string, unknown>)?.active) {
            const sub = credits.subscription as Record<string, unknown>;
            const subEndDate = (sub.period as Record<string, unknown>)?.currentPeriodEnd ? moment((sub.period as Record<string, unknown>).currentPeriodEnd as string).format('LL') : t`Unknown`;
            rows.push([t`Sub`, t`Active (until ${subEndDate})`]);
            addUsage(t`Tokens/wk`, sub.weekly_tokens as Record<string, unknown>, (sub.limits as Record<string, unknown>)?.weeklyInputTokens as number);
            addUsage(t`Tokens/day`, sub.daily_tokens as Record<string, unknown>, (sub.limits as Record<string, unknown>)?.dailyInputTokens as number);
            addUsage(t`Images/day`, sub.daily_images as Record<string, unknown>, (sub.limits as Record<string, unknown>)?.dailyImages as number);
        }

        for (const [label, value] of rows) {
            const labelDiv = document.createElement('div');
            labelDiv.textContent = label;
            root.appendChild(labelDiv);
            const valueDiv = document.createElement('div');
            valueDiv.textContent = value;
            root.appendChild(valueDiv);
        }

        return root;
    };

    document.addEventListener('click', async function (event: Event) {
        const target = event.target instanceof Element ? event.target.closest('.nanogpt_view_credits') as HTMLElement | null : null;
        if (!target) return;
        event.preventDefault();
        const display = target.parentElement?.querySelector('.nanogpt_credits_display') as HTMLElement | null;
        if (!display) return;
        display.textContent = t`Loading…`;

        try {
            const response = await fetch('/api/nanogpt/credits', {
                method: 'POST',
                headers: getRequestHeaders(),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json() as Record<string, unknown>;

            const usdBalance = Number(data.usd_balance);
            const nanoBalance = Number(data.nano_balance);
            if (!Number.isFinite(usdBalance) || !Number.isFinite(nanoBalance)) {
                throw new Error('Invalid response');
            }

            const balances = [`$${formatNanoGptNumber(usdBalance, 2)}`];
            if (nanoBalance > 0) {
                balances.push(`${formatNanoGptNumber(nanoBalance, 3)} NANO`);
            }
            let shortInlineText = balances.join(' | ');

            if ((data.subscription as Record<string, unknown>)?.active) {
                shortInlineText += ` | ${t`Sub Active`}`;
            }

            display.textContent = shortInlineText + ' ';

            const infoBtn = document.createElement('i');
            infoBtn.className = 'fa-solid fa-circle-info cursor-pointer nanogpt_info_btn';
            infoBtn.title = t`View details`;
            (infoBtn as unknown as Record<string, unknown>).__creditsData = {
                usdBalance,
                nanoBalance,
                subscription: data.subscription,
            };
            display.appendChild(infoBtn);
        } catch (error) {
            console.error('Failed to fetch NanoGPT credits:', error);
            if (display) display.textContent = '';
            notyf.error(t`Could not fetch NanoGPT credits. Please try again.`);
        }
    });

    document.addEventListener('click', async function (e: Event) {
        const target = e.target instanceof Element ? e.target.closest('.nanogpt_info_btn') as HTMLElement | null : null;
        if (!target) return;
        const credits = (target as unknown as Record<string, unknown>).__creditsData as Record<string, unknown> | undefined;
        if (credits) {
            await callGenericPopup(createNanoGptCreditsPopup(credits), POPUP_TYPE.TEXT);
        }
    });
    registerSecretSlashCommands();
}
