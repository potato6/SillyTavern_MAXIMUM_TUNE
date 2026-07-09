import { CONNECT_API_MAP, createModelIcon, getRequestHeaders } from '../../script.js';
import { extension_settings, openThirdPartyExtensionMenu } from '../extensions.js';
import { t } from '../i18n.js';
import { oai_settings, proxies, ZAI_ENDPOINT } from '../openai.js';
import { SECRET_KEYS, secret_state } from '../secrets.js';
import { textgen_types, textgenerationwebui_settings } from '../textgen-settings.js';
import { getTokenCountAsync } from '../tokenizers.js';
import { createThumbnail, isValidUrl } from '../utils.js';

/**
 * Generates a caption for an image using a multimodal model.
 * @param {string} base64Img Base64 encoded image
 * @param {string} prompt Prompt to use for captioning
 * @returns {Promise<string>} Generated caption
 */
export async function getMultimodalCaption(base64Img: string, prompt: string) {
    const captionSettings = extension_settings.caption as any;
    const captionServerUrls = textgenerationwebui_settings.server_urls as Record<string, string>;
    const useReverseProxy =
        (['openai', 'anthropic', 'google', 'mistral', 'vertexai', 'xai', 'zai', 'moonshot'].includes(captionSettings.multimodal_api))
        && captionSettings.allow_reverse_proxy
        && oai_settings.reverse_proxy
        && isValidUrl(oai_settings.reverse_proxy);

    throwIfInvalidModel(useReverseProxy);

    // OpenRouter has a payload limit of ~2MB. Google is 4MB, but we love democracy.
    // Ooba requires all images to be JPEGs. Koboldcpp just asked nicely.
    const isOllama = captionSettings.multimodal_api === 'ollama';
    const isLlamaCpp = captionSettings.multimodal_api === 'llamacpp';
    const isCustom = captionSettings.multimodal_api === 'custom';
    const isOoba = captionSettings.multimodal_api === 'ooba';
    const isKoboldCpp = captionSettings.multimodal_api === 'koboldcpp';
    const isVllm = captionSettings.multimodal_api === 'vllm';
    const base64Bytes = base64Img.length * 0.75;
    const compressionLimit = 2 * 1024 * 1024;
    const safeMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const mimeType = base64Img?.split(';')?.[0]?.split(':')?.[1] || 'image/jpeg';
    const isImage = mimeType.startsWith('image/');
    const thumbnailNeeded = ['google', 'openrouter', 'mistral', 'groq', 'vertexai'].includes(captionSettings.multimodal_api);
    if ((isImage && thumbnailNeeded && base64Bytes > compressionLimit) || isOoba || isKoboldCpp) {
        const maxSide = 2048;
        base64Img = await createThumbnail(base64Img, maxSide as any, maxSide as any) as string;
    } else if (isImage && !safeMimeTypes.includes(mimeType)) {
        base64Img = await createThumbnail(base64Img, null, null) as string;
    }
    if (isOllama && base64Img.startsWith('data:image/')) {
        base64Img = base64Img.split(',')[1] ?? '';
    }

    const proxyUrl = useReverseProxy ? oai_settings.reverse_proxy : '';
    const proxyPassword = useReverseProxy ? oai_settings.proxy_password : '';

    const requestBody: Record<string, any> = {
        image: base64Img,
        prompt: prompt,
        reverse_proxy: proxyUrl,
        proxy_password: proxyPassword,
        api: captionSettings.multimodal_api || 'openai',
        model: captionSettings.multimodal_model || 'gpt-4-turbo',
    };

    // Add Vertex AI specific parameters if using Vertex AI
    if (captionSettings.multimodal_api === 'vertexai') {
        requestBody.vertexai_auth_mode = oai_settings.vertexai_auth_mode;
        requestBody.vertexai_region = oai_settings.vertexai_region;
        requestBody.vertexai_express_project_id = oai_settings.vertexai_express_project_id;
    }

    if (isOllama) {
        if (captionSettings.multimodal_model === 'ollama_current') {
            requestBody.model = textgenerationwebui_settings.ollama_model;
        }

        if (captionSettings.multimodal_model === 'ollama_custom') {
            requestBody.model = captionSettings.ollama_custom_model;
        }

        requestBody.server_url = captionSettings.alt_endpoint_enabled
            ? captionSettings.alt_endpoint_url
            : captionServerUrls[textgen_types.OLLAMA];
    }

    if (isVllm) {
        if (captionSettings.multimodal_model === 'vllm_current') {
            requestBody.model = textgenerationwebui_settings.vllm_model;
        }

        requestBody.server_url = captionSettings.alt_endpoint_enabled
            ? captionSettings.alt_endpoint_url
            : captionServerUrls[textgen_types.VLLM];
    }

    if (isLlamaCpp) {
        requestBody.server_url = captionSettings.alt_endpoint_enabled
            ? captionSettings.alt_endpoint_url
            : captionServerUrls[textgen_types.LLAMACPP];
    }

    if (isOoba) {
        requestBody.server_url = captionSettings.alt_endpoint_enabled
            ? captionSettings.alt_endpoint_url
            : captionServerUrls[textgen_types.OOBA];
    }

    if (isKoboldCpp) {
        requestBody.server_url = captionSettings.alt_endpoint_enabled
            ? captionSettings.alt_endpoint_url
            : captionServerUrls[textgen_types.KOBOLDCPP];
    }

    if (isCustom) {
        if (captionSettings.multimodal_model === 'custom_current') {
            requestBody.model = oai_settings.custom_model || '';
        }

        if (captionSettings.multimodal_model === 'custom_custom') {
            requestBody.model = captionSettings.custom_model || '';
        }

        requestBody.server_url = oai_settings.custom_url;
        requestBody.custom_include_headers = oai_settings.custom_include_headers;
        requestBody.custom_include_body = oai_settings.custom_include_body;
        requestBody.custom_exclude_body = oai_settings.custom_exclude_body;
    }

    if (captionSettings.multimodal_api === 'zai') {
        requestBody.zai_endpoint = oai_settings.zai_endpoint || ZAI_ENDPOINT.COMMON;
    }

    if (captionSettings.multimodal_api === 'workers_ai') {
        requestBody.workers_ai_account_id = oai_settings.workers_ai_account_id;
    }

    function getEndpointUrl() {
        switch (captionSettings.multimodal_api) {
            case 'google':
            case 'vertexai':
                return '/api/google/caption-image';
            case 'anthropic':
                return '/api/anthropic/caption-image';
            case 'ollama':
                return '/api/backends/text-completions/ollama/caption-image';
            default:
                return '/api/openai/caption-image';
        }
    }

    const apiResult = await fetch(getEndpointUrl(), {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(requestBody),
    });

    if (!apiResult.ok) {
        throw new Error('Failed to caption image via Multimodal API.');
    }

    const { caption } = await apiResult.json();
    return String(caption).trim();
}

function throwIfInvalidModel(useReverseProxy: boolean) {
    const captionSettings = extension_settings.caption as any;
    const captionServerUrls = textgenerationwebui_settings.server_urls as Record<string, string>;
    const secrets = secret_state as Record<string, any>;
    const altEndpointEnabled = captionSettings.alt_endpoint_enabled;
    const altEndpointUrl = captionSettings.alt_endpoint_url;
    const multimodalModel = captionSettings.multimodal_model;
    const multimodalApi = captionSettings.multimodal_api;

    if (altEndpointEnabled && ['llamacpp', 'ooba', 'koboldcpp', 'vllm', 'ollama'].includes(multimodalApi) && !altEndpointUrl) {
        throw new Error('Secondary endpoint URL is not set.');
    }

    if (multimodalApi === 'openai' && !secrets[SECRET_KEYS.OPENAI] && !useReverseProxy) {
        throw new Error('OpenAI API key is not set.');
    }

    if (multimodalApi === 'openrouter' && !secrets[SECRET_KEYS.OPENROUTER]) {
        throw new Error('OpenRouter API key is not set.');
    }

    if (multimodalApi === 'anthropic' && !secrets[SECRET_KEYS.CLAUDE] && !useReverseProxy) {
        throw new Error('Anthropic (Claude) API key is not set.');
    }

    if (multimodalApi === 'groq' && !secrets[SECRET_KEYS.GROQ]) {
        throw new Error('Groq API key is not set.');
    }

    if (multimodalApi === 'google' && !secrets[SECRET_KEYS.MAKERSUITE] && !useReverseProxy) {
        throw new Error('Google AI Studio API key is not set.');
    }

    if (multimodalApi === 'vertexai' && !useReverseProxy) {
        // Check based on authentication mode
        const authMode = oai_settings.vertexai_auth_mode || 'express';

        if (authMode === 'express') {
            // Express mode requires API key
            if (!secrets[SECRET_KEYS.VERTEXAI]) {
                throw new Error('Google Vertex AI API key is not set for Express mode.');
            }
        } else if (authMode === 'full') {
            // Full mode requires Service Account JSON and region settings
            if (!secrets[SECRET_KEYS.VERTEXAI_SERVICE_ACCOUNT]) {
                throw new Error('Service Account JSON is required for Vertex AI Full mode. Please validate and save your Service Account JSON.');
            }
            if (!oai_settings.vertexai_region) {
                throw new Error('Region is required for Vertex AI Full mode.');
            }
        }
    }

    if (multimodalApi === 'mistral' && !secrets[SECRET_KEYS.MISTRALAI] && !useReverseProxy) {
        throw new Error('Mistral AI API key is not set.');
    }

    if (multimodalApi === 'cohere' && !secrets[SECRET_KEYS.COHERE]) {
        throw new Error('Cohere API key is not set.');
    }

    if (multimodalApi === 'xai' && !secrets[SECRET_KEYS.XAI] && !useReverseProxy) {
        throw new Error('xAI API key is not set.');
    }

    if (multimodalApi === 'ollama' && !captionServerUrls[textgen_types.OLLAMA] && !altEndpointEnabled) {
        throw new Error('Ollama server URL is not set.');
    }

    if (multimodalApi === 'ollama' && multimodalModel === 'ollama_current' && !textgenerationwebui_settings.ollama_model) {
        throw new Error('Ollama model is not set.');
    }

    if (multimodalApi === 'ollama' && multimodalModel === 'ollama_custom' && !captionSettings.ollama_custom_model) {
        throw new Error('Ollama custom model tag is not set.');
    }

    if (multimodalApi === 'llamacpp' && !captionServerUrls[textgen_types.LLAMACPP] && !altEndpointEnabled) {
        throw new Error('LlamaCPP server URL is not set.');
    }

    if (multimodalApi === 'ooba' && !captionServerUrls[textgen_types.OOBA] && !altEndpointEnabled) {
        throw new Error('Text Generation WebUI server URL is not set.');
    }

    if (multimodalApi === 'koboldcpp' && !captionServerUrls[textgen_types.KOBOLDCPP] && !altEndpointEnabled) {
        throw new Error('KoboldCpp server URL is not set.');
    }

    if (multimodalApi === 'vllm' && !captionServerUrls[textgen_types.VLLM] && !altEndpointEnabled) {
        throw new Error('vLLM server URL is not set.');
    }

    if (multimodalApi === 'vllm' && multimodalModel === 'vllm_current' && !textgenerationwebui_settings.vllm_model) {
        throw new Error('vLLM model is not set.');
    }

    if (multimodalApi === 'custom' && !oai_settings.custom_url) {
        throw new Error('Custom API URL is not set.');
    }

    if (multimodalApi === 'custom' && multimodalModel === 'custom_custom' && !captionSettings.custom_model) {
        throw new Error('Custom OpenAI-compatible Model ID is not set.');
    }

    if (multimodalApi === 'aimlapi' && !secrets[SECRET_KEYS.AIMLAPI]) {
        throw new Error('AI/ML API key is not set.');
    }

    if (multimodalApi === 'moonshot' && !secrets[SECRET_KEYS.MOONSHOT]) {
        throw new Error('Moonshot AI API key is not set.');
    }

    if (multimodalApi === 'nanogpt' && !secrets[SECRET_KEYS.NANOGPT]) {
        throw new Error('NanoGPT API key is not set.');
    }

    if (multimodalApi === 'electronhub' && !secrets[SECRET_KEYS.ELECTRONHUB]) {
        throw new Error('Electron Hub API key is not set.');
    }

    if (multimodalApi === 'chutes' && !secrets[SECRET_KEYS.CHUTES]) {
        throw new Error('Chutes API key is not set.');
    }

    if (multimodalApi === 'zai' && !secrets[SECRET_KEYS.ZAI]) {
        throw new Error('Z.AI API key is not set.');
    }

    if (multimodalApi === 'pollinations' && !secrets[SECRET_KEYS.POLLINATIONS]) {
        throw new Error('Pollinations API key is not set.');
    }

    if (multimodalApi === 'workers_ai' && (!secrets[SECRET_KEYS.WORKERS_AI] || !oai_settings.workers_ai_account_id)) {
        throw new Error('Workers AI API key or account ID is not set.');
    }
}

/**
 * Check if the WebLLM extension is installed and supported.
 * @returns {boolean} Whether the extension is installed and supported
 */
export function isWebLlmSupported() {
    if (!('gpu' in navigator)) {
        const warningKey = 'webllm_browser_warning_shown';
        if (!sessionStorage.getItem(warningKey)) {
            (window as any).toastr.error('Your browser does not support the WebGPU API. Please use a different browser.', 'WebLLM', {
                preventDuplicates: true,
                timeOut: 0,
                extendedTimeOut: 0,
            });
            sessionStorage.setItem(warningKey, '1');
        }
        return false;
    }

    // @ts-expect-error TS(2304): Cannot find name 'SillyTavern'.
    if (!('llm' in SillyTavern)) {
        const warningKey = 'webllm_extension_warning_shown';
        if (!sessionStorage.getItem(warningKey)) {
            (window as any).toastr.error('WebLLM extension is not installed. Click here to install it.', 'WebLLM', {
                timeOut: 0,
                extendedTimeOut: 0,
                preventDuplicates: true,
                onclick: () => openThirdPartyExtensionMenu('https://github.com/SillyTavern/Extension-WebLLM'),
            });
            sessionStorage.setItem(warningKey, '1');
        }
        return false;
    }

    return true;
}

/**
 * Generates text in response to a chat prompt using WebLLM.
 * @param {any[]} messages Messages to use for generating
 * @param {object} params Additional parameters
 * @returns {Promise<string>} Generated response
 */
export async function generateWebLlmChatPrompt(messages: any[], params: Record<string, any> = {}) {
    if (!isWebLlmSupported()) {
        throw new Error('WebLLM extension is not installed.');
    }

    console.debug('WebLLM chat completion request:', messages, params);
    // @ts-expect-error TS(2304): Cannot find name 'SillyTavern'.
    const engine = SillyTavern.llm;
    const response = await engine.generateChatPrompt(messages, params);
    console.debug('WebLLM chat completion response:', response);
    return response;
}

/**
 * Counts the number of tokens in the provided text using WebLLM's default model.
 * Fallbacks to the current model's tokenizer if WebLLM token count fails.
 * @param {string} text Text to count tokens in
 * @returns {Promise<number>} Number of tokens in the text
 */
export async function countWebLlmTokens(text: string) {
    if (!isWebLlmSupported()) {
        throw new Error('WebLLM extension is not installed.');
    }

    try {
        // @ts-expect-error TS(2304): Cannot find name 'SillyTavern'.
        const engine = SillyTavern.llm;
        const response = await engine.countTokens(text);
        return response;
    } catch (error) {
        // Fallback to using current model's tokenizer
        return await getTokenCountAsync(text);
    }
}

/**
 * Gets the size of the context in the WebLLM's default model.
 * @returns {Promise<number>} Size of the context in the WebLLM model
 */
export async function getWebLlmContextSize() {
    if (!isWebLlmSupported()) {
        throw new Error('WebLLM extension is not installed.');
    }

    // @ts-expect-error TS(2304): Cannot find name 'SillyTavern'.
    const engine = SillyTavern.llm;
    await engine.loadModel();
    const model = await engine.getCurrentModelInfo();
    return model?.context_size;
}

/**
 * It uses the profiles to send a generate request to the API.
 */
export class ConnectionManagerRequestService {
    static defaultSendRequestParams = {
        stream: false,
        signal: null,
        extractData: true,
        includePreset: true,
        includeInstruct: true,
        instructSettings: {},
    };

    static getAllowedTypes() {
        return {
            openai: t`Chat Completion`,
            textgenerationwebui: t`Text Completion`,
        };
    }

    /**
     * @param {string} profileId
     * @param {string | (import('../custom-request.js').ChatCompletionMessage & {ignoreInstruct?: boolean})[]} prompt
     * @param {number} maxTokens
     * @param {Object} custom
     * @param {boolean?} [custom.stream=false]
     * @param {AbortSignal?} [custom.signal]
     * @param {boolean?} [custom.extractData=true]
     * @param {boolean?} [custom.includePreset=true]
     * @param {boolean?} [custom.includeInstruct=true]
     * @param {Partial<InstructSettings>?} [custom.instructSettings] Override instruct settings
     * @param {Record<string, any>} [overridePayload] - Override payload for the request
     * @returns {Promise<import('../custom-request.js').ExtractedData | (() => AsyncGenerator<import('../custom-request.js').StreamResponse>)>} If not streaming, returns extracted data; if streaming, returns a function that creates an AsyncGenerator
     */
    static async sendRequest(profileId: string, prompt: string | any[], maxTokens: number, custom: Record<string, any> = this.defaultSendRequestParams, overridePayload: Record<string, any> = {}) {
        const { stream, signal, extractData, includePreset, includeInstruct, instructSettings } = { ...this.defaultSendRequestParams, ...custom };

        // @ts-expect-error TS(2304): Cannot find name 'SillyTavern'.
        const context = (SillyTavern.getContext() as any);
        if (context.extensionSettings.disabledExtensions.includes('connection-manager')) {
            throw new Error('Connection Manager is not available');
        }

        const profile = this.getProfile(profileId);
        const selectedApiMap = this.validateProfile(profile);

        try {
            switch (selectedApiMap.selected) {
                case 'openai': {
                    if (!selectedApiMap.source) {
                        throw new Error(`API type ${selectedApiMap.selected} does not support chat completions`);
                    }

                    const proxyPreset = proxies.find((p) => p.name === profile.proxy);

                    const messages = Array.isArray(prompt) ? prompt : [{ role: 'user', content: prompt }];
                    return await context.ChatCompletionService.processRequest({
                        stream,
                        messages,
                        max_tokens: maxTokens,
                        model: profile.model,
                        chat_completion_source: selectedApiMap.source,
                        secret_id: profile['secret-id'],
                        custom_url: profile['api-url'],
                        vertexai_region: profile['api-url'],
                        zai_endpoint: profile['api-url'],
                        siliconflow_endpoint: profile['api-url'],
                        minimax_endpoint: profile['api-url'],
                        reverse_proxy: proxyPreset?.url,
                        proxy_password: proxyPreset?.password,
                        custom_prompt_post_processing: profile['prompt-post-processing'],
                        ...overridePayload,
                    }, {
                        presetName: includePreset ? profile.preset : undefined,
                    }, extractData, signal);
                }
                case 'textgenerationwebui': {
                    if (!selectedApiMap.type) {
                        throw new Error(`API type ${selectedApiMap.selected} does not support text completions`);
                    }

                    return await context.TextCompletionService.processRequest({
                        stream,
                        prompt,
                        max_tokens: maxTokens,
                        model: profile.model,
                        api_type: selectedApiMap.type,
                        api_server: profile['api-url'],
                        secret_id: profile['secret-id'],
                        ...overridePayload,
                    }, {
                        instructName: includeInstruct ? profile.instruct : undefined,
                        presetName: includePreset ? profile.preset : undefined,
                        instructSettings: includeInstruct ? instructSettings : undefined,
                    }, extractData, signal);
                }
                default: {
                    throw new Error(`Unknown API type ${selectedApiMap.selected}`);
                }
            }
        } catch (error) {
            // @ts-expect-error TS(2769): No overload matches this call.
            throw new Error('API request failed', { cause: error });
        }
    }

    /**
    * If using text completion, return a formatted prompt string given an array of messages, a given profile ID, and optional instruct settings.
    * If using chat completion, simply return the given prompt as-is.
    * @param {ChatCompletionMessage[]} prompt An array of prompt messages.
    * @param {string} profileId ID of a given connection profile (from which to infer a completion preset).
    * @param {InstructSettings} instructSettings optional instruct settings
    */
    static constructPrompt(prompt: any[], profileId: string, instructSettings: any = null) {
        // @ts-expect-error TS(2304): Cannot find name 'SillyTavern'.
        const context = (SillyTavern.getContext() as any);
        const profile = this.getProfile(profileId);
        const selectedApiMap = this.validateProfile(profile);
        const instructName = profile.instruct;

        switch (selectedApiMap.selected) {
            case 'openai': {
                if (!selectedApiMap.source) {
                    throw new Error(`API type ${selectedApiMap.selected} does not support chat completions`);
                }
                return prompt;
            }
            case 'textgenerationwebui': {
                if (!selectedApiMap.type) {
                    throw new Error(`API type ${selectedApiMap.selected} does not support text completions`);
                }
                return context.TextCompletionService.constructPrompt(prompt, instructName, instructSettings);
            }
            default: {
                throw new Error(`Unknown API type ${selectedApiMap.selected}`);
            }
        }
    }

    /**
     * Respects allowed types.
     * @returns {import('./connection-manager/index.js').ConnectionProfile[]}
     */
    static getSupportedProfiles() {
        // @ts-expect-error TS(2304): Cannot find name 'SillyTavern'.
        const context = (SillyTavern.getContext() as any);
        if (context.extensionSettings.disabledExtensions.includes('connection-manager')) {
            throw new Error('Connection Manager is not available');
        }

        const profiles = context.extensionSettings.connectionManager.profiles;
        return profiles.filter((p: any) => this.isProfileSupported(p));
    }

    /**
     * Return profile data given the profile ID
     * @param {string} profileId
     * @returns {import('./connection-manager/index.js').ConnectionProfile?} [profile]
     * @throws {Error}
     */
    static getProfile(profileId: string) {
        // @ts-expect-error TS(2304): Cannot find name 'SillyTavern'.
        const profile = (SillyTavern.getContext() as any).extensionSettings.connectionManager.profiles.find((p: any) => p.id === profileId);
        if (!profile) throw new Error(`Profile not found (ID: ${profileId})`);
        return profile;
    }

    /**
     * Creates a model icon Image element for the given profile (or the currently selected profile).
     * Returns null if the profile is not found, has no API, or Connection Manager is unavailable.
     * @param {string} [profileId] - Profile ID. If omitted, uses the currently selected profile.
     * @returns {HTMLImageElement | null}
     */
    static getProfileIcon(profileId?: string) {
        // @ts-expect-error TS(2304): Cannot find name 'SillyTavern'.
        if (((SillyTavern.getContext() as any)).extensionSettings.disabledExtensions.includes('connection-manager')) {
            return null;
        }

        // @ts-expect-error TS(2304): Cannot find name 'SillyTavern'.
        const id = profileId ?? ((SillyTavern.getContext() as any)).extensionSettings.connectionManager.selectedProfile;
        if (!id) return null;

        try {
            const profile = this.getProfile(id);
            if (!profile?.api) return null;
            return createModelIcon(profile.api, profile.model);
        } catch {
            return null;
        }
    }

    /**
     * @param {import('./connection-manager/index.js').ConnectionProfile?} [profile]
     * @returns {boolean}
     */
    static isProfileSupported(profile?: any) {
        if (!profile || !profile.api) {
            return false;
        }

        const apiMap = (CONNECT_API_MAP as any)[profile.api];
        if (!Object.hasOwn(this.getAllowedTypes(), apiMap.selected)) {
            return false;
        }

        // Some providers not need model, like koboldcpp. But I don't want to check by provider.
        switch (apiMap.selected) {
            case 'openai':
                return !!apiMap.source;
            case 'textgenerationwebui':
                return !!apiMap.type;
        }

        return false;
    }

    /**
     * @param {import('./connection-manager/index.js').ConnectionProfile?} [profile]
     * @return {import('../slash-commands.js').ConnectAPIMap}
     * @throws {Error}
     */
    static validateProfile(profile?: any) {
        if (!profile) {
            throw new Error('Could not find profile.');
        }
        if (!profile.api) {
            throw new Error('Select a connection profile that has an API');
        }

        // @ts-expect-error TS(2304): Cannot find name 'SillyTavern'.
        const context = (SillyTavern.getContext() as any);
        const selectedApiMap = context.CONNECT_API_MAP[profile.api];
        if (!selectedApiMap) {
            throw new Error(`Unknown API type ${profile.api}`);
        }
        if (!Object.hasOwn(this.getAllowedTypes(), selectedApiMap.selected)) {
            throw new Error(`API type ${selectedApiMap.selected} is not supported. Supported types: ${Object.values(this.getAllowedTypes()).join(', ')}`);
        }

        return selectedApiMap;
    }

    /**
     * Create profiles dropdown and updates select element accordingly. Use onChange, onCreate, unUpdate, onDelete callbacks for custom behaviour. e.g updating extension settings.
     * @param {string} selector
     * @param {string} initialSelectedProfileId
     * @param {(profile?: import('./connection-manager/index.js').ConnectionProfile) => Promise<void> | void} onChange - 3 cases. 1- When user selects new profile. 2- When user deletes selected profile. 3- When user updates selected profile.
     * @param {(profile: import('./connection-manager/index.js').ConnectionProfile) => Promise<void> | void} onCreate
     * @param {(oldProfile: import('./connection-manager/index.js').ConnectionProfile, newProfile: import('./connection-manager/index.js').ConnectionProfile) => Promise<void> | void} unUpdate
     * @param {(profile: import('./connection-manager/index.js').ConnectionProfile) => Promise<void> | void} onDelete
     */
    static handleDropdown(
        selector: string,
        initialSelectedProfileId: string,
        onChange: (profile?: any) => Promise<void> | void = () => {},
        onCreate: (profile: any) => Promise<void> | void = () => {},
        unUpdate: (oldProfile: any, newProfile: any) => Promise<void> | void = () => {},
        onDelete: (profile: any) => Promise<void> | void = () => {},
    ) {
        // @ts-expect-error TS(2304): Cannot find name 'SillyTavern'.
        const context = (SillyTavern.getContext() as any);
        if (context.extensionSettings.disabledExtensions.includes('connection-manager')) {
            throw new Error('Connection Manager is not available');
        }

        const dropdown = document.querySelector(selector) as HTMLSelectElement;

        if (!dropdown) {
            throw new Error(`Could not find dropdown with selector ${selector}`);
        }

        dropdown.innerHTML = '';

        // Create default option using document.createElement
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select a Connection Profile';
        defaultOption.dataset.i18n = 'Select a Connection Profile';
        dropdown.append(defaultOption);

        const profiles = context.extensionSettings.connectionManager.profiles;

        // Create optgroups using document.createElement
        const groups: Record<string, any> = {};
        for (const [apiType, groupLabel] of Object.entries(this.getAllowedTypes())) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = groupLabel;
            groups[apiType] = optgroup;
        }

        const sortedProfilesByGroup: Record<string, any[]> = {};
        for (const apiType of Object.keys(this.getAllowedTypes())) {
            sortedProfilesByGroup[apiType] = [];
        }

        for (const profile of profiles) {
            if (this.isProfileSupported(profile)) {
                const apiMap = (CONNECT_API_MAP as any)[profile.api];
                const groupList = sortedProfilesByGroup[apiMap.selected];
                if (groupList) {
                    groupList.push(profile);
                }
            }
        }

        // Sort each group alphabetically and add to dropdown
        for (const [apiType, groupProfiles] of Object.entries(sortedProfilesByGroup)) {
            if (groupProfiles.length === 0) continue;

            groupProfiles.sort((a, b) => a.name.localeCompare(b.name));

            const group = groups[apiType];
            for (const profile of groupProfiles) {
                const option = document.createElement('option');
                option.value = profile.id;
                option.textContent = profile.name;
                group.appendChild(option);
            }
        }

        for (const group of Object.values(groups)) {
            if (group.children.length > 0) {
                dropdown.append(group);
            }
        }

        const selectedProfile = profiles.find((p: any) => p.id === initialSelectedProfileId);
        if (selectedProfile) {
            dropdown.value = selectedProfile.id;
        }

        context.eventSource.on(context.eventTypes.CONNECTION_PROFILE_CREATED, async (profile: any) => {
            const isSupported = this.isProfileSupported(profile);
            if (!isSupported) {
                return;
            }

            const group = groups[(CONNECT_API_MAP as any)[profile.api].selected];
            const option = document.createElement('option');
            option.value = profile.id;
            option.textContent = profile.name;
            group.appendChild(option);

            await onCreate(profile);
        });

        context.eventSource.on(context.eventTypes.CONNECTION_PROFILE_UPDATED, async (oldProfile: any, newProfile: any) => {
            const currentSelected = dropdown.value;
            const isSelectedProfile = currentSelected === oldProfile.id;
            await unUpdate(oldProfile, newProfile);

            if (!this.isProfileSupported(newProfile)) {
                if (isSelectedProfile) {
                    dropdown.value = '';
                    dropdown.dispatchEvent(new Event('change'));
                }
                return;
            }

            const group = groups[(CONNECT_API_MAP as any)[newProfile.api].selected];
            const oldOption = group.querySelector(`option[value="${oldProfile.id}"]`);
            if (oldOption) {
                oldOption.remove();
            }

            const option = document.createElement('option');
            option.value = newProfile.id;
            option.textContent = newProfile.name;
            group.appendChild(option);

            if (isSelectedProfile) {
                // Ackchyually, we don't need to reselect but what if id changes? It is not possible for now I couldn't stop myself.
                dropdown.value = newProfile.id;
                dropdown.dispatchEvent(new Event('change'));
            }
        });

        context.eventSource.on(context.eventTypes.CONNECTION_PROFILE_DELETED, async (profile: any) => {
            const currentSelected = dropdown.value;
            const isSelectedProfile = currentSelected === profile.id;
            if (!this.isProfileSupported(profile)) {
                return;
            }

            const group = groups[(CONNECT_API_MAP as any)[profile.api].selected];
            const optionToRemove = group.querySelector(`option[value="${profile.id}"]`);
            if (optionToRemove) {
                optionToRemove.remove();
            }

            if (isSelectedProfile) {
                dropdown.value = '';
                dropdown.dispatchEvent(new Event('change'));
            }

            await onDelete(profile);
        });

        dropdown.addEventListener('change', async () => {
            const profileId = dropdown.value;
            const profile = context.extensionSettings.connectionManager.profiles.find((p: any) => p.id === profileId);
            await onChange(profile);
        });
    }
}
