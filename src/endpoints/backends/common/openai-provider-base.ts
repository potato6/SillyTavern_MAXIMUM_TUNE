/**
 * Factory for OpenAI-compatible chat completion providers.
 *
 * ~15 providers (Perplexity, Groq, DeepSeek, xAI, AimlAPI, Chutes,
 * ElectronHub, Fireworks, NanoGPT, Pollinations, Moonshot, ZAI,
 * SiliconFlow, Workers AI, CometAPI) share the same pattern:
 *
 *   GET /v1/models
 *   POST /v1/chat/completions   (Authorization: Bearer <key>)
 *
 * with minor extras (reasoning effort, JSON schema, custom headers, …).
 * This factory eliminates ~200 lines of nearly identical code.
 */

import type { ChatProvider, ModelEntry } from '../chat-completions/types.js';
import { proxyRequest } from './proxy.js';

export interface OAIConfig {
    /** CHAT_COMPLETION_SOURCES value. */
    source: string;
    /** Default base URL (overridable via reverse_proxy). */
    defaultBase: string;
    /** SECRET_KEYS entry to read the API key from. */
    secretKey: string;
    /** Whether the provider supports reverse_proxy. */
    supportsReverseProxy?: boolean;
    /** Extra headers to include on every request. */
    extraHeaders?: Record<string, string>;
    /** Function to derive extra body params from the Express request. */
    extraBodyParams?: (req: import('express').Request) => Record<string, unknown>;
    /** Custom transform for the model list response. */
    transformModelList?: (data: unknown) => ModelEntry[];
    /** Whether this provider has a non-standard models endpoint. */
    modelsPath?: string;
    /** Whether streaming is supported. */
    supportsStreaming?: boolean;
    supportsVision?: boolean;
    supportsTools?: boolean;
    supportsReasoning?: boolean;
}

/**
 * Create an OAI-compatible ChatProvider from the given config.
 */
export function createOAIChatProvider(cfg: OAIConfig): ChatProvider {
    const {
        source, defaultBase, secretKey,
        supportsReverseProxy = true,
        extraHeaders = {},
        extraBodyParams,
        transformModelList,
        modelsPath = '/models',
        supportsStreaming = true,
        supportsVision = false,
        supportsTools = true,
        supportsReasoning = false,
    } = cfg;

    return {
        source,
        endpoints: { chat: '/chat/completions', models: modelsPath },
        capabilities: { supportsStreaming, supportsVision, supportsTools, supportsReasoning },

        async chat(req, res) {
            const baseUrl = supportsReverseProxy && req.body.reverse_proxy
                ? new URL(req.body.reverse_proxy).toString().replace(/\/+$/, '')
                : defaultBase.replace(/\/+$/, '');

            const apiKey = supportsReverseProxy && req.body.reverse_proxy
                ? req.body.proxy_password
                : (await import('../../secrets.js')).readSecret(
                    req.user.directories, secretKey, req.body.secret_id);

            if (!apiKey && !req.body.reverse_proxy) {
                console.warn(`${source} API key is missing.`);
                res.status(400).send({ error: true });
                return;
            }

            const controller = new AbortController();
            req.socket.removeAllListeners('close');
            req.socket.on('close', () => controller.abort());

            const body: Record<string, unknown> = {
                messages: req.body.messages,
                model: req.body.model,
                temperature: req.body.temperature,
                max_tokens: req.body.max_tokens,
                max_completion_tokens: req.body.max_completion_tokens,
                stream: req.body.stream,
                presence_penalty: req.body.presence_penalty,
                frequency_penalty: req.body.frequency_penalty,
                top_p: req.body.top_p,
                top_k: req.body.top_k,
                stop: req.body.stop,
                logit_bias: req.body.logit_bias,
                seed: req.body.seed,
                n: req.body.n,
                ...(extraBodyParams ? extraBodyParams(req) : {}),
                ...(req.body.json_schema ? {
                    response_format: {
                        type: 'json_schema',
                        json_schema: {
                            name: req.body.json_schema.name,
                            description: req.body.json_schema.description,
                            schema: req.body.json_schema.value,
                            strict: req.body.json_schema.strict ?? true,
                        },
                    },
                } : {}),
            };

            const url = `${baseUrl}/chat/completions`;
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                ...extraHeaders,
            };

            await proxyRequest({
                request: req,
                response: res,
                url,
                body: JSON.stringify(body),
                headers,
                signal: controller.signal,
                stream: req.body.stream,
            });
        },

        async listModels(req): Promise<ModelEntry[]> {
            const baseUrl = supportsReverseProxy && req.body.reverse_proxy
                ? new URL(req.body.reverse_proxy).toString().replace(/\/+$/, '')
                : defaultBase.replace(/\/+$/, '');
            const apiKey = supportsReverseProxy && req.body.reverse_proxy
                ? req.body.proxy_password
                : (await import('../../secrets.js')).readSecret(
                    req.user.directories, secretKey, req.body.secret_id);

            if (!apiKey && !req.body.reverse_proxy) return [];

            const response = await globalThis.fetch(`${baseUrl}${modelsPath}`, {
                headers: { 'Authorization': `Bearer ${apiKey}`, ...extraHeaders },
            });
            if (!response.ok) return [];

            const data = await response.json() as Record<string, unknown>;
            if (transformModelList) return transformModelList(data);
            if (Array.isArray(data?.data)) return data.data as ModelEntry[];
            if (Array.isArray(data?.models)) return data.models.map((m: Record<string, unknown>) => ({ id: m.name as string, ...m })) as ModelEntry[];
            return [];
        },
    };
}
