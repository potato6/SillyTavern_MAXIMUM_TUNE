import { CHAT_COMPLETION_SOURCES, OPENAI_REASONING_EFFORT_MAP, OPENAI_REASONING_EFFORT_MODELS, OPENAI_FIXED_REASONING_EFFORT, OPENAI_VERBOSITY_MODELS } from '../../../../constants.js';
import { readSecret, SECRET_KEYS } from '../../../secrets.js';
import { proxyRequest } from '../../common/proxy.js';
import type { ChatProvider, ModelEntry } from '../types.js';

const provider: ChatProvider = {
    source: CHAT_COMPLETION_SOURCES.CUSTOM,
    endpoints: { chat: '/chat/completions', models: '/models' },
    capabilities: {
        supportsStreaming: true,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: true,
    },

    async chat(req, res): Promise<any> {
        const apiUrl = req.body.custom_url;
        const apiKey = readSecret(req.user.directories, SECRET_KEYS.CUSTOM, req.body.secret_id);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bodyParams: Record<string, any> = {
            logprobs: req.body.logprobs,
            top_logprobs: undefined,
        };

        const isTextCompletion = Boolean(req.body.model && (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (await import('../../../tokenizers.js')).TEXT_COMPLETION_MODELS as any as string[]
        ).includes(req.body.model)) || typeof req.body.messages === 'string';

        if (!isTextCompletion && bodyParams.logprobs > 0) {
            bodyParams.top_logprobs = bodyParams.logprobs;
            bodyParams.logprobs = true;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { embedOpenRouterMedia } = await import('../../../../prompt-converters.js');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        embedOpenRouterMedia(req.body.messages, { audio: true, video: false } as any);

        if (req.body.json_schema) {
            bodyParams.response_format = {
                type: 'json_schema',
                json_schema: {
                    name: req.body.json_schema.name,
                    strict: req.body.json_schema.strict ?? true,
                    schema: req.body.json_schema.value,
                },
            };
        }

        if (Array.isArray(req.body.tools) && req.body.tools.length > 0) {
            bodyParams.tools = req.body.tools;
            bodyParams.tool_choice = req.body.tool_choice;
        }

        if (req.body.reasoning_effort) {
            if (OPENAI_REASONING_EFFORT_MODELS.includes(req.body.model)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                bodyParams['reasoning_effort'] = (OPENAI_FIXED_REASONING_EFFORT as any)[req.body.model]
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ?? (OPENAI_REASONING_EFFORT_MAP as any)[req.body.reasoning_effort]
                    ?? req.body.reasoning_effort;
            }
            if (/^koboldcpp\/(.+)$/.test(req.body.model)) {
                bodyParams['reasoning_effort'] = req.body.reasoning_effort;
            }
        }

        if (req.body.verbosity && OPENAI_VERBOSITY_MODELS.test(req.body.model)) {
            bodyParams['verbosity'] = req.body.verbosity;
        }

        if (Array.isArray(req.body.stop) && req.body.stop.length > 0) {
            bodyParams['stop'] = req.body.stop;
        }

        const textPrompt = isTextCompletion
            ? (await import('../../../../prompt-converters.js')).convertTextCompletionPrompt(req.body.messages)
            : '';

        const endpointUrl = isTextCompletion
            ? `${apiUrl}/completions`
            : `${apiUrl}/chat/completions`;

        const controller = new AbortController();
        req.socket.removeAllListeners('close');
        req.socket.on('close', () => controller.abort());

        const requestBody: Record<string, unknown> = {
            messages: isTextCompletion ? undefined : req.body.messages,
            prompt: isTextCompletion ? textPrompt : undefined,
            model: req.body.model,
            temperature: req.body.temperature,
            max_tokens: req.body.max_tokens,
            max_completion_tokens: req.body.max_completion_tokens,
            stream: req.body.stream,
            presence_penalty: req.body.presence_penalty,
            frequency_penalty: req.body.frequency_penalty,
            top_p: req.body.top_p,
            top_k: req.body.top_k,
            stop: isTextCompletion ? undefined : req.body.stop,
            logit_bias: req.body.logit_bias,
            seed: req.body.seed,
            n: req.body.n,
            ...bodyParams,
        };

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'Authorization': 'Bearer ' + apiKey } : {}),
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { mergeObjectWithYaml, excludeKeysByYaml } = await import('../../../../util.js');
        mergeObjectWithYaml(bodyParams, req.body.custom_include_body);
        mergeObjectWithYaml(headers, req.body.custom_include_headers);
        excludeKeysByYaml(requestBody, req.body.custom_exclude_body);

        await proxyRequest({
            request: req,
            response: res,
            url: endpointUrl,
            body: JSON.stringify(requestBody),
            headers,
            signal: controller.signal,
            stream: req.body.stream,
        });
    },

    async listModels(req): Promise<ModelEntry[]> {
        const apiUrl = req.body.custom_url;
        const apiKey = readSecret(req.user.directories, SECRET_KEYS.CUSTOM, req.body.secret_id);

        const response = await globalThis.fetch(`${apiUrl}/models`, {
            headers: { ...(apiKey ? { 'Authorization': 'Bearer ' + apiKey } : {}) },
        });
        if (!response.ok) return [];
        const data = await response.json() as any;
        return data.data || [];
    },
};

export default provider;
