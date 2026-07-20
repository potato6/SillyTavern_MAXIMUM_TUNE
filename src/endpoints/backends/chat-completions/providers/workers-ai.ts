import { CHAT_COMPLETION_SOURCES } from '../../../../constants.js';
import { readSecret, SECRET_KEYS } from '../../../secrets.js';
import { proxyRequest } from '../../common/proxy.js';
import { createSocketAbortController } from '../../common/abort-controller.js';
import type { ChatProvider, ModelEntry } from '../types.js';

const API_WORKERS_AI = 'https://api.cloudflare.com/client/v4/accounts';

/**
 * Cloudflare Workers AI uses a custom URL pattern where the account ID
 * is embedded in the path: /accounts/{account_id}/ai/v1/…
 *
 * The standard OAI factory cannot handle this, so we wrap it with
 * account-aware URL construction.
 */
const provider: ChatProvider = {
    source: CHAT_COMPLETION_SOURCES.WORKERS_AI,
    secretKey: { id: 'WORKERS_AI', label: 'Cloudflare Workers AI', category: 'chat-completion' },
    endpoints: { chat: '/chat/completions', models: '/models' },
    capabilities: {
        supportsStreaming: true,
        supportsVision: true,
        supportsTools: false,
        supportsReasoning: false,
    },

    async chat(req, res) {
        const apiKey = readSecret(req.user.directories, SECRET_KEYS.WORKERS_AI, req.body.secret_id);
        const accountId = String(req.body.workers_ai_account_id || '').trim();

        if (!apiKey) {
            console.warn('Cloudflare Workers AI API key is missing.');
            res.status(400).send({ error: true });
            return;
        }

        if (!accountId) {
            console.warn('Cloudflare Workers AI Account ID is missing.');
            res.status(400).send({ error: true });
            return;
        }

        const baseUrl = `${API_WORKERS_AI}/${encodeURIComponent(accountId)}/ai/v1`;
        const { signal } = createSocketAbortController(req.socket);

        const body: Record<string, unknown> = {
            messages: req.body.messages,
            model: req.body.model,
            temperature: req.body.temperature,
            max_tokens: req.body.max_tokens,
            stream: req.body.stream,
            presence_penalty: req.body.presence_penalty,
            frequency_penalty: req.body.frequency_penalty,
            top_p: req.body.top_p,
            top_k: req.body.top_k,
            stop: req.body.stop,
            seed: req.body.seed,
            n: req.body.n,
            repetition_penalty: req.body.repetition_penalty,
            ...(req.body.json_schema ? {
                response_format: {
                    type: 'json_schema',
                    json_schema: req.body.json_schema.value,
                },
            } : {}),
        };

        const url = `${baseUrl}/chat/completions`;
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        };

        await proxyRequest({
            request: req,
            response: res,
            url,
            body: JSON.stringify(body),
            headers,
            signal,
            stream: req.body.stream,
        });
    },

    async listModels(req): Promise<ModelEntry[]> {
        const apiKey = readSecret(req.user.directories, SECRET_KEYS.WORKERS_AI, req.body.secret_id);
        const accountId = String(req.body.workers_ai_account_id || '').trim();

        if (!apiKey || !accountId) return [];

        const modelsUrl = new URL(`${API_WORKERS_AI}/${encodeURIComponent(accountId)}/ai/models/search`);
        modelsUrl.searchParams.set('task', 'Text Generation');
        modelsUrl.searchParams.set('per_page', '1000');

        const response = await globalThis.fetch(modelsUrl, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
        });

        if (!response.ok) return [];

        const data = await response.json() as Record<string, unknown>;
        if (Array.isArray(data?.result)) {
            return data.result.map((m: Record<string, unknown>) => ({ id: m.name as string, ...m })) as ModelEntry[];
        }

        return [];
    },
};

export default provider;
