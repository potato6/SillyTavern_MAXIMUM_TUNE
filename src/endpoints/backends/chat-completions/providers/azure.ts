import { CHAT_COMPLETION_SOURCES, AZURE_OPENAI_KEYS, OPENAI_REASONING_EFFORT_MAP, OPENAI_REASONING_EFFORT_MODELS, OPENAI_FIXED_REASONING_EFFORT } from '../../../../constants.js';
import { forwardFetchResponse, color, tryParse } from '../../../../util.js';
import { readSecret, SECRET_KEYS } from '../../../secrets.js';
import type { ChatProvider, ModelEntry } from '../types.js';

const provider: ChatProvider = {
    source: CHAT_COMPLETION_SOURCES.AZURE_OPENAI,
    endpoints: { chat: '', models: '' },
    capabilities: {
        supportsStreaming: true,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: true,
    },

    async chat(req, res): Promise<void> {
        const { azure_base_url, azure_deployment_name, azure_api_version } = req.body;
        const apiKey = readSecret(req.user.directories, SECRET_KEYS.AZURE_OPENAI, req.body.secret_id);
        if (!azure_base_url || !azure_deployment_name || !azure_api_version || !apiKey) {
            return res.status(400).send({
                error: { message: 'Azure OpenAI configuration is incomplete.' },
            });
        }

        const url = new URL(`/openai/deployments/${azure_deployment_name}/chat/completions`, azure_base_url);
        url.searchParams.set('api-version', azure_api_version);
        const endpointUrl = url.toString();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const apiRequestBody: Record<string, any> = {};
        for (const key of AZURE_OPENAI_KEYS) {
            if (Object.hasOwn(req.body, key)) apiRequestBody[key] = req.body[key];
        }

        if (req.body.json_schema) {
            apiRequestBody.response_format = {
                type: 'json_schema',
                json_schema: {
                    name: req.body.json_schema.name,
                    strict: req.body.json_schema.strict ?? true,
                    schema: req.body.json_schema.value,
                },
            };
        }

        if (typeof apiRequestBody.logprobs === 'number' && apiRequestBody.logprobs > 0) {
            apiRequestBody.top_logprobs = apiRequestBody.logprobs;
            apiRequestBody.logprobs = true;
        }

        apiRequestBody.reasoning_effort = OPENAI_REASONING_EFFORT_MODELS.includes(req.body.model)
            ? OPENAI_FIXED_REASONING_EFFORT[req.body.model as keyof typeof OPENAI_FIXED_REASONING_EFFORT]
                ?? OPENAI_REASONING_EFFORT_MAP[req.body.reasoning_effort as keyof typeof OPENAI_REASONING_EFFORT_MAP]
                ?? req.body.reasoning_effort
            : undefined;

        const controller = new AbortController();
        req.socket.removeAllListeners('close');
        req.socket.on('close', () => controller.abort());

        const config = {
            method: 'POST' as const,
            headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
            body: JSON.stringify(apiRequestBody),
            signal: controller.signal,
        };

        console.info(`Sending request to Azure OpenAI: ${endpointUrl}`);
        console.debug('Azure OpenAI Request Body:', apiRequestBody);

        try {
            const fetchResponse = await globalThis.fetch(endpointUrl, config);

            if (req.body.stream) {
                // @ts-expect-error TS(2345)
                return await forwardFetchResponse(fetchResponse, res);
            }

            if (fetchResponse.ok) {
                const json = await fetchResponse.json() as Record<string, unknown>;
                console.debug('Azure OpenAI response:', json);
                return res.send(json);
            }

            const text = await fetchResponse.text();
            const data = tryParse(text) || { error: { message: fetchResponse.statusText || 'Unknown error' } };
            return res.status(500).send(data);
        } catch (error: unknown) {
            const message = error.name === 'AbortError'
                ? 'Request was aborted by the client.'
                : (error.message || 'An unknown network error occurred.');
            return res.status(500).send({ error: { message, ...error } });
        }
    },

    async listModels(req): Promise<ModelEntry[]> {
        const { azure_base_url, azure_deployment_name, azure_api_version } = req.body;
        const apiKey = readSecret(req.user.directories, SECRET_KEYS.AZURE_OPENAI, req.body.secret_id);
        if (!apiKey || !azure_base_url || !azure_deployment_name || !azure_api_version) return [];

        const azureStatusErrorMap: Record<number, string> = {
            400: 'API version may be invalid for this resource.',
            401: 'Invalid API key or insufficient permissions.',
            403: 'Invalid API key or insufficient permissions.',
            404: 'Endpoint URL appears incorrect (404).',
        };

        try {
            const modelsUrl = new URL('/openai/models', azure_base_url);
            modelsUrl.searchParams.set('api-version', azure_api_version);

            const apiConfigTest = await globalThis.fetch(modelsUrl, {
                method: 'GET',
                headers: { 'api-key': apiKey, 'Accept': 'application/json' },
            });

            if (!apiConfigTest.ok) {
                const defaultMessage = `Azure Models endpoint error: ${apiConfigTest.statusText}`;
                const message = azureStatusErrorMap[apiConfigTest.status] ?? defaultMessage;
                console.warn('Azure OpenAI GET /models failed:', apiConfigTest.status, message);
                return [];
            }

            const chatUrl = new URL(`/openai/deployments/${azure_deployment_name}/chat/completions`, azure_base_url);
            chatUrl.searchParams.set('api-version', azure_api_version);

            const modelPayload = {
                messages: [{ role: 'user', content: 'Say word Hi' }],
                stream: false,
                max_completion_tokens: 5,
            };

            const modelRequest = await globalThis.fetch(chatUrl, {
                method: 'POST',
                headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify(modelPayload),
            });

            let modelResponse: Record<string, unknown>;
                try { modelResponse = await modelRequest.json() as Record<string, unknown>; } catch { modelResponse = {}; }

            const modelId = modelResponse?.model as string;
            if (!modelId) {
                console.warn('Azure status check could not find model ID.');
                return [];
            }

            console.info(color.green('Azure OpenAI connection successful. Detected model:'), modelId);
            return [{ id: modelId }];
        } catch (error) {
            console.error('Azure OpenAI status check error:', error);
            return [];
        }
    },
};

export default provider;
