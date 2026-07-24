import { getPresetManager } from './preset-manager.js';
import {
    extractJsonFromData,
    extractMessageFromData,
    getGenerateUrl,
    getRequestHeaders,
    name1,
    name2,
} from '../script.js';
import {
    getTextGenServer,
    createTextGenGenerationData,
    setting_names,
    textgenerationwebui_settings,
} from './textgen-settings.js';
import { extractReasoningFromData } from './reasoning.js';
import {
    formatInstructModeChat,
    formatInstructModePrompt,
    getInstructStoppingSequences,
} from './instruct-mode.js';
import {
    getStreamingReply,
    tryParseStreamingError,
    createGenerationParameters,
    settingsToUpdate,
    oai_settings,
} from './openai.js';
import EventSourceStream from './sse-stream.js';

// #region Type Definitions
/**
 * @typedef {object} TextCompletionRequestBase
 * @property {boolean?} [stream=false] - Whether to stream the response
 * @property {number} max_tokens - Maximum number of tokens to generate
 * @property {string} [model] - Optional model name
 * @property {string} api_type - Type of API to use
 * @property {string} [api_server] - Optional API server URL
 * @property {number} [temperature] - Optional temperature parameter
 * @property {number} [min_p] - Optional min_p parameter
 */

/**
 * @typedef {object} TextCompletionPayloadBase
 * @property {boolean?} [stream=false] - Whether to stream the response
 * @property {string} prompt - The text prompt for completion
 * @property {number} max_tokens - Maximum number of tokens to generate
 * @property {number} max_new_tokens - Alias for max_tokens
 * @property {string} [model] - Optional model name
 * @property {string} api_type - Type of API to use
 * @property {string} api_server - API server URL
 * @property {number} [temperature] - Optional temperature parameter
 */

/** @typedef {Record<string, any> & TextCompletionPayloadBase} TextCompletionPayload */

/**
 * @typedef {object} ChatCompletionMessage
 * @property {string} [name] - The name of the message author (optional)
 * @property {string} role - The role of the message author (e.g., "user", "assistant", "system")
 * @property {string} content - The content of the message
 */

/**
 * @typedef {object} ChatCompletionPayloadBase
 * @property {boolean?} [stream=false] - Whether to stream the response
 * @property {ChatCompletionMessage[]} messages - Array of chat messages
 * @property {string} [model] - Optional model name to use for completion
 * @property {string} chat_completion_source - Source provider
 * @property {number} max_tokens - Maximum number of tokens to generate
 * @property {number} [temperature] - Optional temperature parameter for response randomness
 * @property {string} [custom_url] - Optional custom URL
 * @property {string} [reverse_proxy] - Optional reverse proxy URL
 * @property {string} [proxy_password] - Optional proxy password
 * @property {string} [custom_prompt_post_processing] - Optional custom prompt post-processing
 * @property {import('../script.js').JsonSchema} [json_schema] - Optional JSON schema for structured generation
 */

/** @typedef {Record<string, any> & ChatCompletionPayloadBase} ChatCompletionPayload */

/**
 * @typedef {object} ExtractedData
 * @property {string} content - Extracted content.
 * @property {string} reasoning - Extracted reasoning.
 */

/**
 * @typedef {object} StreamResponse
 * @property {string} text - Generated text.
 * @property {string[]} swipes - Generated swipes
 * @property {object} state - Generated state
 * @property {string?} [state.reasoning] - Generated reasoning
 * @property {string?} [state.image] - Generated image
 */

// #endregion

/**
 * Creates & sends a text completion request.
 */
export class TextCompletionService {
    static TYPE = 'textgenerationwebui';

    /**
     * @param {Record<string, any> & TextCompletionRequestBase & {prompt: string}} custom
     * @returns {TextCompletionPayload}
     */
    static createRequestData({
        stream = false,
        // @ts-expect-error TS(7031) FIXME: Parameter 'prompt' implicitly has an 'any' type.
        prompt,
        // @ts-expect-error TS(7031) FIXME: Parameter 'max_tokens' implicitly has an 'any' type.
        max_tokens,
        // @ts-expect-error TS(7031) FIXME: Parameter 'model' implicitly has an 'any' type.
        model,
        // @ts-expect-error TS(7031) FIXME: Parameter 'api_type' implicitly has an 'any' type.
        api_type,
        // @ts-expect-error TS(7031) FIXME: Parameter 'api_server' implicitly has an 'any' type.
        api_server,
        // @ts-expect-error TS(7031) FIXME: Parameter 'temperature' implicitly has an 'any' type.
        temperature,
        // @ts-expect-error TS(7031) FIXME: Parameter 'min_p' implicitly has an 'any' type.
        min_p,
        ...props
    }) {
        // Construct the object predictably.
        // JSON.stringify natively ignores undefined properties.
        // Avoiding 'delete' ensures V8 maintains a stable hidden class (Map) for payload objects.
        return {
            stream,
            prompt,
            max_tokens,
            max_new_tokens: max_tokens,
            model,
            api_type,
            api_server: api_server ?? getTextGenServer(api_type),
            temperature,
            min_p,
            ...props,
        };
    }

    /**
     * Sends a text completion request to the specified server
     * @param {TextCompletionPayload} data Request data
     * @param {boolean?} extractData Extract message from the response. Default true
     * @param {AbortSignal?} signal
     * @returns {Promise<ExtractedData | (() => AsyncGenerator<StreamResponse>)>} If not streaming, returns extracted data; if streaming, returns a function that creates an AsyncGenerator
     * @throws {Error}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
    static async sendRequest(data, extractData = true, signal = null) {
        if (!data.stream) {
            const response = await fetch(getGenerateUrl(this.TYPE), {
                method: 'POST',
                headers: getRequestHeaders(),
                cache: 'no-cache',
                body: JSON.stringify(data),
                signal: signal ?? new AbortController().signal,
            });

            const json = await response.json();
            if (!response.ok || json.error) {
                throw new Error(String(json.error?.message || 'Response not OK'));
            }

            if (!extractData) {
                return json;
            }

            return {
                // @ts-expect-error TS(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
                content: extractMessageFromData(json, this.TYPE),
                reasoning: extractReasoningFromData(json, {
                    // @ts-expect-error TS(2322) FIXME: Type 'string' is not assignable to type 'null | un... Remove this comment to see the full error message
                    mainApi: this.TYPE,
                    textGenType: data.api_type,
                    ignoreShowThoughts: true,
                }),
            };
        }

        const response = await fetch('/api/backends/text-completions/generate', {
            method: 'POST',
            headers: getRequestHeaders(),
            cache: 'no-cache',
            body: JSON.stringify(data),
            signal: signal ?? new AbortController().signal,
        });

        if (!response.ok) {
            const text = await response.text();
            tryParseStreamingError(response, text, { quiet: true });
            throw new Error(`Got response status ${response.status}`);
        }

        const eventStream = new EventSourceStream();
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        response.body.pipeThrough(eventStream);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const reader = eventStream.readable.getReader();

        return async function* streamData() {
            let text = '';
            const swipes: string[] = [];
            const state = { reasoning: '' };

            while (true) {
                const { done, value } = await reader.read();
                if (done) return;
                if (value.data === '[DONE]') return;

                tryParseStreamingError(response, value.data, { quiet: true });

                const data = JSON.parse(value.data);

                if (data?.choices?.[0]?.index > 0) {
                    const swipeIndex = data.choices[0].index - 1;
                    // Direct assignment to prevent '||' truthiness evaluation on every chunk
                    if (swipes[swipeIndex] === undefined) {
                        swipes[swipeIndex] = '';
                    }
                    swipes[swipeIndex] += data.choices[0].text;
                } else {
                    const newText = data?.choices?.[0]?.text || data?.content || '';
                    text += newText;
                    state.reasoning += data?.choices?.[0]?.reasoning ?? '';
                }

                yield { text, swipes, state };
            }
        };
    }

    /**
     * Return a formatted prompt string given an array of messages, a chosen instruct preset, and instruct settings.
     * @param {(ChatCompletionMessage & {ignoreInstruct?: boolean})[]} prompt An array of messages
     * @param {InstructSettings|string} instructPreset Either the name of an instruct preset or the instruct preset object itself.
     * @param {Partial<InstructSettings>} instructSettings Optional instruct settings
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'prompt' implicitly has an 'any' type.
    static constructPrompt(prompt, instructPreset, instructSettings) {
        if (typeof instructPreset === 'string') {
            const instructPresetManager = getPresetManager('instruct');
            instructPreset = instructPresetManager?.getCompletionPresetByName(instructPreset);
        }

        instructPreset = structuredClone(instructPreset);
        if (instructSettings) {
            Object.assign(instructPreset, instructSettings);
        }

        if (typeof instructPreset === 'string') {
            return;
        }

        // Sequential string concatenation is highly optimized via V8 ConsString
        let formattedPrompt = '';
        const promptLength = prompt.length;
        const prefillActive =
            promptLength > 0 ? prompt[promptLength - 1].role === 'assistant' : false;

        for (let i = 0; i < promptLength; i++) {
            const message = prompt[i];
            let messageContent = message.content;

            if (!message.ignoreInstruct) {
                const isLastMessage = i === promptLength - 1;

                if (!isLastMessage || !prefillActive) {
                    messageContent = formatInstructModeChat(
                        message.name ?? message.role,
                        message.content,
                        message.role === 'user',
                        message.role === 'system',
                        undefined,
                        name1,
                        name2,
                        undefined,
                        instructPreset,
                    );
                }

                if (isLastMessage) {
                    let last_line = formatInstructModePrompt(
                        'assistant',
                        false,
                        prefillActive ? message.content : undefined,
                        name1,
                        name2,
                        true,
                        false,
                        instructPreset,
                    );

                    if (prefillActive) {
                        if (last_line.endsWith('\n') && !message.content.endsWith('\n')) {
                            last_line = last_line.slice(0, -1);
                        }
                        messageContent = last_line;
                    } else {
                        messageContent += last_line;
                    }
                }
            }
            formattedPrompt += messageContent;
        }
        return formattedPrompt;
    }

    /**
     * Process and send a text completion request with optional preset & instruct
     * @param {TextCompletionPayload} requestData
     * @param {object} options - Configuration options
     * @param {string?} [options.presetName] - Name of the preset to use for generation settings
     * @param {string?} [options.instructName] - Name of instruct preset for message formatting
     * @param {Partial<InstructSettings>?} [options.instructSettings] - Override instruct settings
     * @param {boolean} extractData - Whether to extract structured data from response
     * @param {AbortSignal?} [signal]
     * @returns {Promise<ExtractedData | (() => AsyncGenerator<StreamResponse>)>} If not streaming, returns extracted data; if streaming, returns a function that creates an AsyncGenerator
     * @throws {Error}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'requestData' implicitly has an 'any' ty... Remove this comment to see the full error message
    static async processRequest(requestData, options = {}, extractData = true, signal = null) {
        // @ts-expect-error TS(2339) FIXME: Property 'presetName' does not exist on type '{}'.
        const { presetName, instructName } = options;

        requestData = this.createRequestData(requestData);

        /** @type {InstructSettings | undefined} */
        let instructPreset;
        const prompt = requestData.prompt;

        if (Array.isArray(prompt)) {
            if (instructName) {
                const instructPresetManager = getPresetManager('instruct');
                instructPreset = instructPresetManager?.getCompletionPresetByName(instructName);
                if (instructPreset) {
                    requestData.prompt = this.constructPrompt(
                        prompt,
                        instructPreset,
                        // @ts-expect-error TS(2339) FIXME: Property 'instructSettings' does not exist on type.
                        options.instructSettings,
                    );
                    const stoppingStrings = getInstructStoppingSequences({
                        // @ts-expect-error TS(2322) FIXME: Type is not assignable.
                        customInstruct: instructPreset,
                        // @ts-expect-error TS(2322) FIXME: Type is not assignable.
                        useStopStrings: false,
                    });
                    requestData.stop = stoppingStrings;
                    requestData.stopping_strings = stoppingStrings;
                } else {
                    console.warn(
                        `Instruct preset "${instructName}" not found, using basic formatting`,
                    );

                    let flatPrompt = '';
                    for (let i = 0; i < prompt.length; i++) {
                        flatPrompt += prompt[i].content;
                        if (i < prompt.length - 1) flatPrompt += '\n\n';
                    }
                    requestData.prompt = flatPrompt;
                }
            } else {
                let flatPrompt = '';
                for (let i = 0; i < prompt.length; i++) {
                    flatPrompt += prompt[i].content;
                    if (i < prompt.length - 1) flatPrompt += '\n\n';
                }
                requestData.prompt = flatPrompt;
            }
        } else if (typeof prompt === 'string') {
            requestData.prompt = prompt;
        }

        if (presetName) {
            const presetManager = getPresetManager(this.TYPE);
            if (presetManager) {
                const preset = presetManager.getCompletionPresetByName(presetName);
                if (preset) {
                    requestData = this.presetToGeneratePayload(preset, {}, requestData);
                } else {
                    console.warn(
                        `Preset "${presetName}" not found, continuing with default settings`,
                    );
                }
            } else {
                console.warn('Preset manager not found, continuing with default settings');
            }
        }

        const response = await this.sendRequest(requestData, extractData, signal);

        if (!requestData.stream && extractData) {
            /** @type {ExtractedData} */
            const extractedData = response;
            let message = extractedData.content;

            message = message.replace(/[^\S\r\n]+$/gm, '');

            if (requestData.stopping_strings) {
                for (let i = 0; i < requestData.stopping_strings.length; i++) {
                    const stoppingString = requestData.stopping_strings[i];
                    if (stoppingString.length) {
                        for (let j = stoppingString.length; j > 0; j--) {
                            if (message.endsWith(stoppingString.slice(0, j))) {
                                message = message.slice(0, -j);
                                break;
                            }
                        }
                    }
                }
            }

            if (instructPreset) {
                const seqArr = [
                    instructPreset.stop_sequence,
                    instructPreset.input_sequence,
                ] as string[];
                for (let i = 0; i < seqArr.length; i++) {
                    const sequence = seqArr[i];
                    if (sequence?.trim()) {
                        const index = message.indexOf(sequence);
                        if (index !== -1) {
                            message = message.substring(0, index);
                        }
                    }
                }

                const outSeqArr = [
                    instructPreset.output_sequence,
                    instructPreset.last_output_sequence,
                ] as string[];
                for (let i = 0; i < outSeqArr.length; i++) {
                    const sequences = outSeqArr[i]!;
                    if (sequences) {
                        const lines = sequences.split('\n');
                        for (let j = 0; j < lines.length; j++) {
                            const line = lines[j]!.trim();
                            if (line !== '') {
                                message = message.replaceAll(line, '');
                            }
                        }
                    }
                }
            }

            extractedData.content = message;
        }

        return response;
    }

    /**
     * Converts a preset to a valid text completion payload.
     * Only supports temperature.
     * @param {object} preset - The preset configuration
     * @param {object} overridePreset - Additional parameters to override preset values
     * @param {object} overridePayload - Additional parameters to override payload values
     * @returns {object} - Formatted payload for text completion API
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'preset' implicitly has an 'any' type.
    static presetToGeneratePayload(preset, overridePreset = {}, overridePayload = {}) {
        if (!preset || typeof preset !== 'object') {
            throw new Error('Invalid preset: must be an object');
        }

        preset = { ...preset, ...overridePreset };

        const settings = structuredClone(textgenerationwebui_settings);
        const presetKeys = Object.keys(preset);

        // Basic for-loop avoids allocating the extra [key, value] tuple arrays created by Object.entries
        for (let i = 0; i < presetKeys.length; i++) {
            const key = presetKeys[i]!;
            if (setting_names.includes(key)) {
                settings[key] = preset[key];
            }
        }

        const payload = createTextGenGenerationData(
            settings,
            // @ts-expect-error TS(2339) FIXME: Property 'model' does not exist on type.
            overridePayload.model,
            // @ts-expect-error TS(2339) FIXME: Property 'prompt' does not exist on type.
            overridePayload.prompt,
            preset.genamt,
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this.createRequestData({ ...payload, ...overridePayload } as any);
    }
}

/**
 * Creates & sends a chat completion request.
 */
export class ChatCompletionService {
    static TYPE = 'openai';

    /**
     * @param {ChatCompletionPayload} custom
     * @returns {ChatCompletionPayload}
     */
    static createRequestData({
        stream = false,
        // @ts-expect-error TS(7031) FIXME: Parameter 'messages' implicitly has an 'any' type.
        messages,
        // @ts-expect-error TS(7031) FIXME: Parameter 'model' implicitly has an 'any' type.
        model,
        // @ts-expect-error TS(7031) FIXME: Parameter 'chat_completion_source' implicitly has an 'any' type.
        chat_completion_source,
        // @ts-expect-error TS(7031) FIXME: Parameter 'max_tokens' implicitly has an 'any' type.
        max_tokens,
        // @ts-expect-error TS(7031) FIXME: Parameter 'temperature' implicitly has an 'any' type.
        temperature,
        // @ts-expect-error TS(7031) FIXME: Parameter 'custom_url' implicitly has an 'any' type.
        custom_url,
        // @ts-expect-error TS(7031) FIXME: Parameter 'reverse_proxy' implicitly has an 'any' type.
        reverse_proxy,
        // @ts-expect-error TS(7031) FIXME: Parameter 'proxy_password' implicitly has an 'any' type.
        proxy_password,
        // @ts-expect-error TS(7031) FIXME: Parameter 'custom_prompt_post_processing' implicitly has an 'any' type.
        custom_prompt_post_processing,
        ...props
    }) {
        // Avoiding 'delete payload[key]' to maintain stable shapes. JSON.stringify ignores undefined values.
        return {
            stream,
            messages,
            model,
            chat_completion_source,
            max_tokens,
            temperature,
            custom_url,
            reverse_proxy,
            proxy_password,
            custom_prompt_post_processing,
            use_sysprompt: true,
            ...props,
        };
    }

    /**
     * Sends a chat completion request
     * @param {ChatCompletionPayload} data Request data
     * @param {boolean?} extractData Extract message from the response. Default true
     * @param {AbortSignal?} signal Abort signal
     * @returns {Promise<ExtractedData | (() => AsyncGenerator<StreamResponse>)>} If not streaming, returns extracted data; if streaming, returns a function that creates an AsyncGenerator
     * @throws {Error}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
    static async sendRequest(data, extractData = true, signal = null) {
        const response = await fetch('/api/backends/chat-completions/generate', {
            method: 'POST',
            headers: getRequestHeaders(),
            cache: 'no-cache',
            body: JSON.stringify(data),
            signal: signal ?? new AbortController().signal,
        });

        if (!data.stream) {
            const json = await response.json();
            if (!response.ok || json.error) {
                throw new Error(String(json.error?.message || 'Response not OK'));
            }

            if (!extractData) {
                return json;
            }

            const result = {
                // @ts-expect-error TS(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
                content: extractMessageFromData(json, this.TYPE),
                reasoning: extractReasoningFromData(json, {
                    // @ts-expect-error TS(2322) FIXME: Type 'string' is not assignable to type 'null | un... Remove this comment to see the full error message
                    mainApi: this.TYPE,
                    textGenType: data.chat_completion_source,
                    ignoreShowThoughts: true,
                }),
            };

            if (data.json_schema) {
                result.content = JSON.parse(
                    extractJsonFromData(json, {
                        // @ts-expect-error TS(2322) FIXME: Type is not assignable.
                        mainApi: this.TYPE,
                        chatCompletionSource: data.chat_completion_source,
                    }),
                );
            }
            return result;
        }

        if (!response.ok) {
            const text = await response.text();
            tryParseStreamingError(response, text, { quiet: true });
            throw new Error(`Got response status ${response.status}`);
        }

        const eventStream = new EventSourceStream();
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        response.body.pipeThrough(eventStream);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const reader = eventStream.readable.getReader();

        return async function* streamData() {
            let text = '';
            const swipes: string[] = [];
            const state = { reasoning: '', images: [], signature: '', toolSignatures: {} };

            while (true) {
                const { done, value } = await reader.read();
                if (done) return;

                const rawData = value.data;
                if (rawData === '[DONE]') return;

                tryParseStreamingError(response, rawData, { quiet: true });
                const parsed = JSON.parse(rawData);

                const reply = getStreamingReply(parsed, state, {
                    chatCompletionSource: data.chat_completion_source,
                    overrideShowThoughts: true as unknown as null | undefined,
                });

                if (Array.isArray(parsed?.choices) && parsed?.choices?.[0]?.index > 0) {
                    const swipeIndex = parsed.choices[0].index - 1;
                    if (swipes[swipeIndex] === undefined) {
                        swipes[swipeIndex] = '';
                    }
                    swipes[swipeIndex] += reply;
                } else {
                    text += reply;
                }

                yield { text, swipes, state };
            }
        };
    }

    /**
     * Process and send a chat completion request with optional preset
     * @param {ChatCompletionPayload} requestData - payload data, overriding preset if given
     * @param {object} options - Configuration options
     * @param {string?} [options.presetName] - Name of the preset to use for generation settings
     * @param {boolean} [extractData] - Whether to extract structured data from response
     * @param {AbortSignal?} [signal] - Abort signal
     * @returns {Promise<ExtractedData | (() => AsyncGenerator<StreamResponse>)>} If not streaming, returns extracted data; if streaming, returns a function that creates an AsyncGenerator
     * @throws {Error}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'requestData' implicitly has an 'any' ty... Remove this comment to see the full error message
    static async processRequest(requestData, options, extractData = true, signal = null) {
        const { presetName } = options;
        requestData = this.createRequestData(requestData);

        if (presetName) {
            const presetManager = getPresetManager(this.TYPE);
            if (presetManager) {
                const preset = presetManager.getCompletionPresetByName(presetName);
                if (preset) {
                    requestData = await this.presetToGeneratePayload(preset, {}, requestData);
                } else {
                    console.warn(
                        `Preset "${presetName}" not found, continuing with default settings`,
                    );
                }
            } else {
                console.warn('Preset manager not found, continuing with default settings');
            }
        }

        return await this.sendRequest(requestData, extractData, signal);
    }

    /**
     * Converts a preset to a valid chat completion payload
     * Only supports temperature.
     * @param {object} preset - The preset configuration
     * @param {object} overridePreset - Additional parameters to override preset values
     * @param {object} overridePayload - Additional parameters to override payload values
     * @returns {Promise<any>} - Formatted payload for chat completion API
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'preset' implicitly has an 'any' type.
    static async presetToGeneratePayload(preset, overridePreset = {}, overridePayload = {}) {
        if (!preset || typeof preset !== 'object') {
            throw new Error('Invalid preset: must be an object');
        }

        preset = { ...preset, ...overridePreset };

        preset.bias_preset_selected =
            preset.bias_presets !== undefined ? preset.bias_preset_selected : undefined;

        const settings = structuredClone(oai_settings);
        const presetKeys = Object.keys(preset);

        for (let i = 0; i < presetKeys.length; i++) {
            const key = presetKeys[i];
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            const settingToUpdate = settingsToUpdate[key];
            if (settingToUpdate) {
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                settings[settingToUpdate[1]] = preset[key];
            }
        }

        const endpointFields = [
            'custom_url',
            'vertexai_region',
            'zai_endpoint',
            'siliconflow_endpoint',
            'minimax_endpoint',
        ];

        for (let i = 0; i < endpointFields.length; i++) {
            const field = endpointFields[i];
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            overridePayload[field] =
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type.
                overridePayload[field] || settings[field] || oai_settings[field];
        }

        const data = await createGenerationParameters(
            settings,
            // @ts-expect-error TS(2339) FIXME: Property 'model' does not exist on type.
            overridePayload.model,
            'quiet',
            // @ts-expect-error TS(2339) FIXME: Property 'messages' does not exist on type.
            overridePayload.messages,
        );
        const payload = data.generate_data;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this.createRequestData({ ...payload, ...overridePayload } as any);
    }
}
