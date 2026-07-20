import { CHAT_COMPLETION_SOURCES } from '../../../../constants.js';
import { forwardFetchResponse, tryParse } from '../../../../util.js';
import { convertAI21Messages, getPromptNames } from '../../../../prompt-converters.js';
import { readSecret, SECRET_KEYS } from '../../../secrets.js';
import { createSocketAbortController } from '../../common/abort-controller.js';
import type { ChatProvider, ModelEntry } from '../types.js';

const API_AI21 = 'https://api.ai21.com/studio/v1';

const provider: ChatProvider = {
    source: CHAT_COMPLETION_SOURCES.AI21,
    secretKey: { id: 'AI21', label: 'AI21', category: 'chat-completion' },
    endpoints: { chat: '/chat/completions', models: '/models' },
    capabilities: {
        supportsStreaming: true,
        supportsVision: false,
        supportsTools: true,
        supportsReasoning: false,
    },

    async chat(req, res): Promise<void> {
        if (!req.body) { res.sendStatus(400); return; }

        const apiKey = readSecret(req.user.directories, SECRET_KEYS.AI21, req.body.secret_id);
        if (!apiKey) {
            console.warn('AI21 API key is missing.');
            res.status(400).send({ error: true });
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bodyParams: Record<string, any> = {};
        const { signal } = createSocketAbortController(req.socket);

        if (req.body.json_schema) {
            bodyParams.response_format = { type: 'json_object' };
            req.body.messages.push({
                role: 'user',
                content: `JSON schema for the response:\n${JSON.stringify(req.body.json_schema.value, null, 4)}`,
            });
        }

        const convertedPrompt = convertAI21Messages(req.body.messages, getPromptNames(req));
        const body = {
            messages: convertedPrompt,
            model: req.body.model,
            max_tokens: req.body.max_tokens,
            temperature: req.body.temperature,
            top_p: req.body.top_p,
            stop: req.body.stop,
            stream: req.body.stream,
            tools: req.body.tools,
            ...bodyParams,
        };

        const options = {
            method: 'POST' as const,
            headers: {
                accept: 'application/json',
                'content-type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
            signal,
        };

        console.debug('AI21 request:', body);

        try {
            const generateResponse = await globalThis.fetch(API_AI21 + '/chat/completions', options);
            if (req.body.stream) {
                await forwardFetchResponse(generateResponse, res);
            } else {
                if (!generateResponse.ok) {
                    const errorText = await generateResponse.text();
                    console.warn(`AI21 API returned error: ${generateResponse.status} ${generateResponse.statusText} ${errorText}`);
                    const errorJson = tryParse(errorText) ?? { error: true };
                    res.status(500).send(errorJson);
                    return;
                }
                const json = await generateResponse.json() as Record<string, unknown>;
                console.debug('AI21 response:', json);
                res.send(json);
            }
        } catch (error) {
            console.error('Error communicating with AI21 API:', error);
            if (!res.headersSent) res.send({ error: true });
            else res.end();
        }
    },

    async listModels(req): Promise<ModelEntry[]> {
        const apiKey = readSecret(req.user.directories, SECRET_KEYS.AI21, req.body.secret_id);
        if (!apiKey) return [];
        const response = await globalThis.fetch(API_AI21 + '/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!response.ok) return [];
        const data = await response.json() as Record<string, unknown>;
        return (data.data as ModelEntry[]) || [];
    },
    resolveTokenizer: () => 'jamba',
};

export default provider;
