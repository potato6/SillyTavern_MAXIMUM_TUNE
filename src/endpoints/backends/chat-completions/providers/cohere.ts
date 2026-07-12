import { CHAT_COMPLETION_SOURCES } from '../../../../constants.js';
import { forwardFetchResponse, tryParse } from '../../../../util.js';
import { convertCohereMessages, getPromptNames } from '../../../../prompt-converters.js';
import { readSecret, SECRET_KEYS } from '../../../secrets.js';
import type { ChatProvider, ModelEntry } from '../types.js';

const API_COHERE_V2 = 'https://api.cohere.ai/v2';

const provider: ChatProvider = {
    source: CHAT_COMPLETION_SOURCES.COHERE,
    endpoints: { chat: '/chat', models: '/models' },
    capabilities: {
        supportsStreaming: true,
        supportsVision: false,
        supportsTools: true,
        supportsReasoning: false,
    },

    async chat(req, res): Promise<any> {
        const apiKey = readSecret(req.user.directories, SECRET_KEYS.COHERE, req.body.secret_id);
        if (!apiKey) {
            console.warn('Cohere API key is missing.');
            res.status(400).send({ error: true });
            return;
        }

        const controller = new AbortController();
        req.socket.removeAllListeners('close');
        req.socket.on('close', () => controller.abort());

        const convertedHistory = convertCohereMessages(req.body.messages, getPromptNames(req));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tools: any[] = [];
        if (Array.isArray(req.body.tools) && req.body.tools.length > 0) {
            tools.push(...req.body.tools);
            tools.forEach((tool: any) => {
                if (tool?.function?.parameters?.$schema) delete tool.function.parameters.$schema;
            });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const requestBody: Record<string, any> = {
            stream: Boolean(req.body.stream),
            model: req.body.model,
            messages: convertedHistory.chatHistory,
            temperature: req.body.temperature,
            max_tokens: req.body.max_tokens,
            k: req.body.top_k,
            p: req.body.top_p,
            seed: req.body.seed,
            stop_sequences: req.body.stop,
            frequency_penalty: req.body.frequency_penalty,
            presence_penalty: req.body.presence_penalty,
            documents: [],
            tools,
        };

        if (String(req.body.model).endsWith('08-2024')) {
            requestBody.safety_mode = 'OFF';
        }

        if (req.body.json_schema) {
            requestBody.response_format = {
                type: 'json_schema',
                schema: req.body.json_schema.value,
            };
        }

        console.debug('Cohere request:', requestBody);

        const config = {
            method: 'POST' as const,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey,
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
        };

        const apiUrl = API_COHERE_V2 + '/chat';

        if (req.body.stream) {
            const stream = await globalThis.fetch(apiUrl, config);
            // @ts-expect-error TS(2345)
            await forwardFetchResponse(stream, res);
        } else {
            const generateResponse = await globalThis.fetch(apiUrl, config);
            if (!generateResponse.ok) {
                const errorText = await generateResponse.text();
                console.warn(`Cohere API returned error: ${generateResponse.status} ${generateResponse.statusText} ${errorText}`);
                const errorJson = tryParse(errorText) ?? { error: true };
                res.status(500).send(errorJson);
                return;
            }
            const json = await generateResponse.json() as Record<string, unknown>;
            console.debug('Cohere response:', json);
            res.send(json);
        }
    },

    async listModels(req): Promise<ModelEntry[]> {
        const apiKey = readSecret(req.user.directories, SECRET_KEYS.COHERE, req.body.secret_id);
        if (!apiKey) return [];

        const response = await globalThis.fetch('https://api.cohere.ai/v1/models', {
            headers: { 'Authorization': 'Bearer ' + apiKey },
        });
        if (!response.ok) return [];
        const data = await response.json() as any;
        if (Array.isArray(data?.models)) {
            return data.models.map((m: any) => ({ id: m.name, ...m }));
        }
        return [];
    },
};

export default provider;
