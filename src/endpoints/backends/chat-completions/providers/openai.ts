import {
    CHAT_COMPLETION_SOURCES,
    OPENAI_REASONING_EFFORT_MAP,
    OPENAI_REASONING_EFFORT_MODELS,
    OPENAI_FIXED_REASONING_EFFORT,
    OPENAI_VERBOSITY_MODELS,
} from '../../../../constants.js';
import { getConfigValue, uuidv4 } from '../../../../util.js';
import { readSecret, SECRET_KEYS } from '../../../secrets.js';
import { embedOpenRouterMedia } from '../../../../prompt-converters.js';
import { proxyRequest } from '../../common/proxy.js';
import { createSocketAbortController } from '../../common/abort-controller.js';
import type { ChatProvider, ModelEntry } from '../types.js';

const API_OPENAI = 'https://api.openai.com/v1';

const provider: ChatProvider = {
    source: CHAT_COMPLETION_SOURCES.OPENAI,
    secretKey: { id: 'OPENAI', label: 'OpenAI', category: 'chat-completion' },
    endpoints: { chat: '/chat/completions', models: '/models' },
    capabilities: {
        supportsStreaming: true,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: true,
    },

    resolveTokenizer: (model: string) => model,

    async chat(req, res): Promise<void> {
        const apiUrl = new URL(req.body.reverse_proxy || API_OPENAI).toString();
        const apiKey = req.body.reverse_proxy
            ? req.body.proxy_password
            : readSecret(req.user.directories, SECRET_KEYS.OPENAI, req.body.secret_id);

        if (!apiKey && !req.body.reverse_proxy) {
            console.warn('OpenAI API key is missing.');
            res.status(400).send({ error: true });
            return;
        }

        const { signal } = createSocketAbortController(req.socket);

        const isTextCompletion =
            Boolean(
                req.body.model &&
                (
                    (await import('../../../text-completion-models.js'))
                        .TEXT_COMPLETION_MODELS as string[]
                ).includes(req.body.model),
            ) || typeof req.body.messages === 'string';

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bodyParams: Record<string, any> = {
            logprobs: req.body.logprobs,
            top_logprobs: undefined,
        };

        // Adjust logprobs for chat completions API
        if (!isTextCompletion && bodyParams.logprobs > 0) {
            bodyParams.top_logprobs = bodyParams.logprobs;
            bodyParams.logprobs = true;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (getConfigValue('openai.randomizeUserId', false as any, 'boolean' as any)) {
            bodyParams.user = uuidv4() as any;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        embedOpenRouterMedia(req.body.messages, { audio: true, video: false } as any);

        if (req.body.reasoning_effort && OPENAI_REASONING_EFFORT_MODELS.includes(req.body.model)) {
            bodyParams.reasoning_effort =
                OPENAI_FIXED_REASONING_EFFORT[
                    req.body.model as keyof typeof OPENAI_FIXED_REASONING_EFFORT
                ] ??
                OPENAI_REASONING_EFFORT_MAP[
                    req.body.reasoning_effort as keyof typeof OPENAI_REASONING_EFFORT_MAP
                ] ??
                req.body.reasoning_effort;
        }

        if (req.body.verbosity && OPENAI_VERBOSITY_MODELS.test(req.body.model)) {
            bodyParams.verbosity = req.body.verbosity;
        }

        const requestBody: Record<string, unknown> = {
            messages: isTextCompletion ? undefined : req.body.messages,
            prompt: isTextCompletion ? req.body.messages : undefined,
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

        if (!isTextCompletion && Array.isArray(req.body.tools) && req.body.tools.length > 0) {
            requestBody.tools = req.body.tools;
            requestBody.tool_choice = req.body.tool_choice;
        }

        if (req.body.json_schema && !bodyParams.response_format) {
            requestBody.response_format = {
                type: 'json_schema',
                json_schema: {
                    name: req.body.json_schema.name,
                    strict: req.body.json_schema.strict ?? true,
                    schema: req.body.json_schema.value,
                },
            };
        }

        const endpointUrl = isTextCompletion
            ? `${apiUrl}/completions`
            : `${apiUrl}/chat/completions`;

        await proxyRequest({
            request: req,
            response: res,
            url: endpointUrl,
            body: JSON.stringify(requestBody),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            signal,
            stream: req.body.stream,
        });
    },

    async listModels(req): Promise<ModelEntry[]> {
        const apiUrl = new URL(req.body.reverse_proxy || API_OPENAI).toString();
        const apiKey = req.body.reverse_proxy
            ? req.body.proxy_password
            : readSecret(req.user.directories, SECRET_KEYS.OPENAI, req.body.secret_id);
        if (!apiKey && !req.body.reverse_proxy) return [];

        const response = await globalThis.fetch(`${apiUrl}/models`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!response.ok) return [];
        const data = (await response.json()) as Record<string, unknown>;
        return (data.data as ModelEntry[]) || [];
    },
};

export default provider;
