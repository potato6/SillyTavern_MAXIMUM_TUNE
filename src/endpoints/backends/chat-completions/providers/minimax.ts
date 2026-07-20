import { CHAT_COMPLETION_SOURCES, MINIMAX_ENDPOINT } from '../../../../constants.js';
import { forwardFetchResponse, tryParse } from '../../../../util.js';
import { postProcessPrompt, PROMPT_PROCESSING_TYPE, getPromptNames } from '../../../../prompt-converters.js';
import { readSecret, SECRET_KEYS } from '../../../secrets.js';
import { createSocketAbortController } from '../../common/abort-controller.js';
import type { ChatProvider, ModelEntry } from '../types.js';

const API_MINIMAX = 'https://api.minimax.io/v1';
const API_MINIMAX_CN = 'https://api.minimaxi.com/v1';

const provider: ChatProvider = {
    source: CHAT_COMPLETION_SOURCES.MINIMAX,
    secretKey: { id: 'MINIMAX', label: 'MiniMax', category: 'chat-completion' },
    endpoints: { chat: '/chat/completions', models: '/models' },
    capabilities: {
        supportsStreaming: true,
        supportsVision: false,
        supportsTools: true,
        supportsReasoning: false,
    },

    async chat(req, res): Promise<void> {
        const apiUrl = req.body.minimax_endpoint === MINIMAX_ENDPOINT.CN ? API_MINIMAX_CN : API_MINIMAX;
        const apiKey = readSecret(req.user.directories, SECRET_KEYS.MINIMAX, req.body.secret_id);
        if (!apiKey) {
            console.warn('MiniMax key is missing.');
            res.status(400).send({ error: true });
            return;
        }

        const { signal } = createSocketAbortController(req.socket);

        // MiniMax does not allow consecutive messages with the same role.
        const messages = postProcessPrompt(req.body.messages, PROMPT_PROCESSING_TYPE.MERGE_TOOLS, getPromptNames(req));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bodyParams: Record<string, any> = {};

        if (Array.isArray(req.body.tools) && req.body.tools.length > 0) {
            bodyParams.tools = req.body.tools;
            bodyParams.tool_choice = req.body.tool_choice;
        }

        const requestBody = {
            messages,
            model: req.body.model,
            temperature: req.body.temperature,
            max_tokens: req.body.model === 'M2-her' ? Math.min(req.body.max_tokens, 2048) : req.body.max_tokens,
            stream: req.body.stream,
            top_p: req.body.top_p,
            stop: req.body.stop,
            ...bodyParams,
        };

        const config = {
            method: 'POST' as const,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey,
            },
            body: JSON.stringify(requestBody),
            signal,
        };

        console.debug('MiniMax request:', requestBody);

        const generateResponse = await globalThis.fetch(apiUrl + '/chat/completions', config);

        if (req.body.stream) {
            await forwardFetchResponse(generateResponse, res);
        } else {
            if (!generateResponse.ok) {
                const errorText = await generateResponse.text();
                console.warn('MiniMax returned error: ', errorText);
                const errorJson = tryParse(errorText) ?? { error: true };
                res.status(500).send(errorJson);
                return;
            }
            const json = await generateResponse.json() as Record<string, unknown>;
            console.debug('MiniMax response:', json);
            res.send(json);
        }
    },

    async listModels(req): Promise<ModelEntry[]> {
        const apiUrl = req.body.minimax_endpoint === MINIMAX_ENDPOINT.CN ? API_MINIMAX_CN : API_MINIMAX;
        const apiKey = readSecret(req.user.directories, SECRET_KEYS.MINIMAX, req.body.secret_id);
        if (!apiKey) return [];

        const response = await globalThis.fetch(`${apiUrl}/models`, {
            headers: { 'Authorization': 'Bearer ' + apiKey },
        });
        if (!response.ok) return [];
        const data = await response.json() as Record<string, unknown>;
        return (data.data as ModelEntry[]) || [];
    },
};

export default provider;
