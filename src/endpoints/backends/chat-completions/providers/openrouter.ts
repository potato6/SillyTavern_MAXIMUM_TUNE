import {
    CHAT_COMPLETION_SOURCES,
    GEMINI_SAFETY,
} from '../../../../constants.js';
import {
    getConfigValue,
} from '../../../../util.js';
import {
    embedOpenRouterMedia,
    addOpenRouterSignatures,
    cachingSystemPromptForOpenRouter,
    cachingAtDepthForOpenRouterClaude,
} from '../../../../prompt-converters.js';
import { readSecret, SECRET_KEYS } from '../../../secrets.js';
import { proxyRequest } from '../../common/proxy.js';
import { buildProviderConfig, OPENROUTER_HEADERS } from '../../common/provider-routing.js';
import { createSocketAbortController } from '../../common/abort-controller.js';
import type { ChatProvider, ModelEntry } from '../types.js';

const API_OPENROUTER = 'https://openrouter.ai/api/v1';

/* eslint-disable @typescript-eslint/no-explicit-any */
const cacheTTL: any = getConfigValue('claude.extendedTTL', false as any, 'boolean' as any) ? '1h' : '5m';
const enableSystemPromptCache: any = getConfigValue('claude.enableSystemPromptCache', false as any, 'boolean' as any);
const cachingAtDepth = (() => {
    const value: any = getConfigValue('claude.cachingAtDepth', -1 as any, 'number' as any);
    return Number.isInteger(value) && value >= 0 ? value : -1;
})();

const openRouterCacheableModels: string[] = [];

async function isOpenRouterModelCacheable(modelId: string): Promise<boolean> {
    if (openRouterCacheableModels.includes(modelId)) return true;
    try {
        const response = await globalThis.fetch(`${API_OPENROUTER}/models`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return false;
        const data = await response.json() as any;
        if (!Array.isArray(data?.data)) return false;
        const model = data.data.find((m: any) => m.id === modelId);
        const supportsCache = model?.pricing?.input_cache_write != null;
        if (supportsCache) openRouterCacheableModels.push(modelId);
        return supportsCache;
    } catch { return false; }
}

const provider: ChatProvider = {
    source: CHAT_COMPLETION_SOURCES.OPENROUTER,
    endpoints: { chat: '/chat/completions', models: '/models' },
    capabilities: {
        supportsStreaming: true,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: true,
    },

    async chat(req, res): Promise<any> {
        const apiKey = readSecret(req.user.directories, SECRET_KEYS.OPENROUTER, req.body.secret_id);
        if (!apiKey) {
            console.warn('OpenRouter API key is missing.');
            res.status(400).send({ error: true });
            return;
        }

        const { signal } = createSocketAbortController(req.socket);

        const bodyParams: Record<string, unknown> = {
            transforms: undefined as any,
            plugins: [] as any[],
            reasoning: { exclude: !Boolean(req.body.include_reasoning) },
        };

        switch (req.body.middleout) {
            case 'on': bodyParams.transforms = ['middle-out']; break;
            case 'off': bodyParams.transforms = []; break;
            case 'auto': break;
        }

        if (req.body.enable_web_search) (bodyParams.plugins as any[]).push({ id: 'web' });

        for (const key of ['min_p', 'top_a', 'repetition_penalty'] as const) {
            if (req.body[key] !== undefined) bodyParams[key] = req.body[key];
        }

        // Provider routing / ordering + quantization — shared impl.
        const providerConfig = buildProviderConfig(req.body);
        if (providerConfig) bodyParams['provider'] = providerConfig;
        if (req.body.use_fallback) bodyParams['route'] = 'fallback';
        if (req.body.reasoning_effort) (bodyParams['reasoning'] as any).effort = req.body.reasoning_effort;
        if (req.body.verbosity) bodyParams['verbosity'] = req.body.verbosity;

        if (req.body.json_schema) {
            bodyParams['response_format'] = {
                type: 'json_schema',
                json_schema: {
                    name: req.body.json_schema.name,
                    strict: req.body.json_schema.strict ?? true,
                    schema: req.body.json_schema.value,
                },
            };
        }

        const isClaude = /^anthropic\/claude/.test(req.body.model);
        const isGemini = /google\/gemini/.test(req.body.model);

        if (Array.isArray(req.body.messages)) {
            embedOpenRouterMedia(req.body.messages, { audio: true, video: true });
            addOpenRouterSignatures(req.body.messages, req.body.model);

            if (isClaude && enableSystemPromptCache) {
                cachingSystemPromptForOpenRouter(req.body.messages, cacheTTL);
                if (cachingAtDepth !== -1) cachingAtDepthForOpenRouterClaude(req.body.messages, cachingAtDepth, cacheTTL);
            }

            const isCacheableGemini = isGemini && (await isOpenRouterModelCacheable(req.body.model));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const enableGeminiSystemPromptCache: any = getConfigValue('gemini.enableSystemPromptCache', false as any, 'boolean' as any);
            if (isCacheableGemini && enableGeminiSystemPromptCache) {
                cachingSystemPromptForOpenRouter(req.body.messages);
            }
        }

        if (isGemini) bodyParams['safety_settings'] = GEMINI_SAFETY;

        const requestBody: Record<string, unknown> = {
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
            logit_bias: req.body.logit_bias,
            seed: req.body.seed,
            n: req.body.n,
            ...bodyParams,
        };

        const url = `${API_OPENROUTER}/chat/completions`;

        console.debug('OpenRouter request:', requestBody);

        await proxyRequest({
            request: req,
            response: res,
            url,
            body: JSON.stringify(requestBody),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                ...OPENROUTER_HEADERS,
            },
            signal,
            stream: req.body.stream,
        });
    },

    async listModels(req): Promise<ModelEntry[]> {
        const apiKey = readSecret(req.user.directories, SECRET_KEYS.OPENROUTER, req.body.secret_id);
        if (!apiKey) return [];

        const response = await globalThis.fetch(`${API_OPENROUTER}/models`, {
            headers: { 'Authorization': `Bearer ${apiKey}`, ...OPENROUTER_HEADERS },
        });
        if (!response.ok) return [];
        const data = await response.json() as any;
        if (Array.isArray(data?.data)) {
            const models: Record<string, any> = {};
            data.data.forEach((model: any) => {
                const tokens_dollar = Number(1 / (1000 * model.pricing?.prompt));
                const tokens_rounded = (Math.round(tokens_dollar * 1000) / 1000).toFixed(0);
                models[model.id] = {
                    tokens_per_dollar: tokens_rounded + 'k',
                    context_length: model.context_length,
                };
            });
            console.info('Available OpenRouter models:', models);
            return data.data;
        }
        return [];
    },
};

export default provider;
