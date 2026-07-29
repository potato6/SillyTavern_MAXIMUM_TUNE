import { CHAT_COMPLETION_SOURCES } from '../../../../constants.js';

import { convertMistralMessages, getPromptNames } from '../../../../prompt-converters.js';
import { readSecret, SECRET_KEYS } from '../../../secrets.js';
import { proxyRequest } from '../../common/proxy.js';
import { createSocketAbortController } from '../../common/abort-controller.js';
import type { ChatProvider, ModelEntry } from '../types.js';

const API_MISTRAL = 'https://api.mistral.ai/v1';

const provider: ChatProvider = {
    source: CHAT_COMPLETION_SOURCES.MISTRALAI,
    secretKey: { id: 'MISTRALAI', label: 'Mistral AI', category: 'chat-completion' },
    endpoints: { chat: '/chat/completions', models: '/models' },
    capabilities: {
        supportsStreaming: true,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: false,
    },

    async chat(req, res): Promise<void> {
        const apiUrl = new URL(req.body.reverse_proxy || API_MISTRAL).toString();
        const apiKey = req.body.reverse_proxy
            ? req.body.proxy_password
            : await readSecret(req.user.directories, SECRET_KEYS.MISTRALAI, req.body.secret_id);

        if (!apiKey) {
            console.warn('MistralAI API key is missing.');
            res.status(400).send({ error: true });
            return;
        }

        const messages = convertMistralMessages(req.body.messages, getPromptNames(req));
        const { signal } = createSocketAbortController(req.socket);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const requestBody: Record<string, any> = {
            model: req.body.model,
            messages,
            temperature: req.body.temperature,
            top_p: req.body.top_p,
            frequency_penalty: req.body.frequency_penalty,
            presence_penalty: req.body.presence_penalty,
            max_tokens: req.body.max_tokens,
            stream: req.body.stream,
            safe_prompt: req.body.safe_prompt,
            random_seed: req.body.seed === -1 ? undefined : req.body.seed,
            stop:
                Array.isArray(req.body.stop) && req.body.stop.length > 0
                    ? req.body.stop
                    : undefined,
        };

        if (Array.isArray(req.body.tools) && req.body.tools.length > 0) {
            requestBody.tools = req.body.tools;
            requestBody.tool_choice = req.body.tool_choice;
        }

        if (req.body.json_schema) {
            requestBody.response_format = {
                type: 'json_schema',
                json_schema: {
                    name: req.body.json_schema.name,
                    description: req.body.json_schema.description,
                    schema: req.body.json_schema.value,
                    strict: req.body.json_schema.strict ?? true,
                },
            };
        }

        console.debug('MistralAI request:', requestBody);

        await proxyRequest({
            request: req,
            response: res,
            url: apiUrl + '/chat/completions',
            body: JSON.stringify(requestBody),
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
            signal,
            stream: req.body.stream,
        });
    },

    async listModels(req): Promise<ModelEntry[]> {
        const apiUrl = new URL(req.body.reverse_proxy || API_MISTRAL).toString();
        const apiKey = req.body.reverse_proxy
            ? req.body.proxy_password
            : await readSecret(req.user.directories, SECRET_KEYS.MISTRALAI, req.body.secret_id);
        if (!apiKey) return [];

        const response = await globalThis.fetch(`${apiUrl}/models`, {
            headers: { Authorization: 'Bearer ' + apiKey },
        });
        if (!response.ok) return [];
        const data = (await response.json()) as Record<string, unknown>;
        return (data.data || []) as ModelEntry[];
    },
    resolveTokenizer: (model) =>
        model.includes('nemo') || model.includes('pixtral') ? 'nemo' : 'mistral',
};

export default provider;
