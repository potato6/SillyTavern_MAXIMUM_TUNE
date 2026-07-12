import express from 'express';
import { CHAT_COMPLETION_SOURCES } from '../../../constants.js';
import {
    getTokenizerModel,
    getSentencepiceTokenizer,
    getTiktokenTokenizer,
    webTokenizers,
    sentencepieceTokenizers,
    TEXT_COMPLETION_MODELS,
    getWebTokenizer,
} from '../../tokenizers.js';
import { readSecret, SECRET_KEYS } from '../../secrets.js';
import { getChatProvider } from './registry.js';
import { getCachedModels, setCachedModels } from '../common/model-cache.js';
import type { ModelEntry } from './types.js';

export const router = express.Router();

// ── Status ─────────────────────────────────────────────────────────────────────

router.post('/status', async function (request, response) {
    try {
        if (!request.body) return response.sendStatus(400);

        const source = request.body.chat_completion_source;

        // Special-case handling for sources that need extra context.
        if (source === CHAT_COMPLETION_SOURCES.MAKERSUITE || source === CHAT_COMPLETION_SOURCES.VERTEXAI) {
            // Delegate to the gemini provider's listModels.
            const provider = await getChatProvider(source);
            const models = await provider.listModels(request);
            return response.send({ data: models });
        }

        if (source === CHAT_COMPLETION_SOURCES.AZURE_OPENAI) {
            const provider = await getChatProvider(source);
            const models = await provider.listModels(request);
            return response.send({ data: models });
        }

        if (source === CHAT_COMPLETION_SOURCES.WORKERS_AI) {
            const provider = await getChatProvider(source);
            const models = await provider.listModels(request);
            return response.send({ data: models });
        }

        // Standard path: resolve provider source, check cache, fetch models.
        let apiUrl = '';
        let apiKey = '';

        switch (source) {
            case CHAT_COMPLETION_SOURCES.OPENAI:
                apiUrl = new URL(request.body.reverse_proxy || 'https://api.openai.com/v1').toString();
                apiKey = request.body.reverse_proxy ? request.body.proxy_password : readSecret(request.user.directories, SECRET_KEYS.OPENAI, request.body.secret_id);
                break;
            case CHAT_COMPLETION_SOURCES.OPENROUTER:
                apiUrl = 'https://openrouter.ai/api/v1';
                apiKey = readSecret(request.user.directories, SECRET_KEYS.OPENROUTER, request.body.secret_id);
                break;
            case CHAT_COMPLETION_SOURCES.MISTRALAI:
                apiUrl = new URL(request.body.reverse_proxy || 'https://api.mistral.ai/v1').toString();
                apiKey = request.body.reverse_proxy ? request.body.proxy_password : readSecret(request.user.directories, SECRET_KEYS.MISTRALAI, request.body.secret_id);
                break;
            case CHAT_COMPLETION_SOURCES.CUSTOM:
                apiUrl = request.body.custom_url;
                apiKey = readSecret(request.user.directories, SECRET_KEYS.CUSTOM, request.body.secret_id);
                break;
            case CHAT_COMPLETION_SOURCES.COHERE:
                apiUrl = 'https://api.cohere.ai/v1';
                apiKey = readSecret(request.user.directories, SECRET_KEYS.COHERE, request.body.secret_id);
                break;
            case CHAT_COMPLETION_SOURCES.CHUTES:
                apiUrl = 'https://llm.chutes.ai/v1';
                apiKey = readSecret(request.user.directories, SECRET_KEYS.CHUTES, request.body.secret_id);
                break;
            case CHAT_COMPLETION_SOURCES.ELECTRONHUB:
                apiUrl = 'https://api.electronhub.ai/v1';
                apiKey = readSecret(request.user.directories, SECRET_KEYS.ELECTRONHUB, request.body.secret_id);
                break;
            case CHAT_COMPLETION_SOURCES.NANOGPT:
                apiUrl = 'https://nano-gpt.com/api/v1';
                apiKey = readSecret(request.user.directories, SECRET_KEYS.NANOGPT, request.body.secret_id);
                break;
            case CHAT_COMPLETION_SOURCES.DEEPSEEK:
                apiUrl = new URL(request.body.reverse_proxy || 'https://api.deepseek.com').toString();
                apiKey = request.body.reverse_proxy ? request.body.proxy_password : readSecret(request.user.directories, SECRET_KEYS.DEEPSEEK, request.body.secret_id);
                break;
            case CHAT_COMPLETION_SOURCES.XAI:
                apiUrl = new URL(request.body.reverse_proxy || 'https://api.x.ai/v1').toString();
                apiKey = request.body.reverse_proxy ? request.body.proxy_password : readSecret(request.user.directories, SECRET_KEYS.XAI, request.body.secret_id);
                break;
            case CHAT_COMPLETION_SOURCES.AIMLAPI:
                apiUrl = 'https://api.aimlapi.com/v1';
                apiKey = readSecret(request.user.directories, SECRET_KEYS.AIMLAPI, request.body.secret_id);
                break;
            case CHAT_COMPLETION_SOURCES.POLLINATIONS:
                apiUrl = 'https://gen.pollinations.ai/text';
                apiKey = readSecret(request.user.directories, SECRET_KEYS.POLLINATIONS, request.body.secret_id);
                break;
            case CHAT_COMPLETION_SOURCES.GROQ:
                apiUrl = 'https://api.groq.com/openai/v1';
                apiKey = readSecret(request.user.directories, SECRET_KEYS.GROQ, request.body.secret_id);
                break;
            case CHAT_COMPLETION_SOURCES.COMETAPI:
                throw new Error('This provider is temporarily disabled.');
            case CHAT_COMPLETION_SOURCES.MOONSHOT:
                apiUrl = new URL(request.body.reverse_proxy || 'https://api.moonshot.ai/v1').toString();
                apiKey = request.body.reverse_proxy ? request.body.proxy_password : readSecret(request.user.directories, SECRET_KEYS.MOONSHOT, request.body.secret_id);
                break;
            case CHAT_COMPLETION_SOURCES.FIREWORKS:
                apiUrl = 'https://api.fireworks.ai/inference/v1';
                apiKey = readSecret(request.user.directories, SECRET_KEYS.FIREWORKS, request.body.secret_id);
                break;
            case CHAT_COMPLETION_SOURCES.SILICONFLOW: {
                const { SILICONFLOW_ENDPOINT } = await import('../../../constants.js');
                apiUrl = request.body.siliconflow_endpoint === SILICONFLOW_ENDPOINT.CN
                    ? 'https://api.siliconflow.cn/v1' : 'https://api.siliconflow.com/v1';
                apiKey = readSecret(request.user.directories, SECRET_KEYS.SILICONFLOW, request.body.secret_id);
                break;
            }
            case CHAT_COMPLETION_SOURCES.ZAI: {
                const { ZAI_ENDPOINT } = await import('../../../constants.js');
                apiUrl = new URL(request.body.reverse_proxy || (
                    request.body.zai_endpoint === ZAI_ENDPOINT.CODING
                        ? 'https://api.z.ai/api/coding/paas/v4'
                        : 'https://api.z.ai/api/paas/v4'
                )).toString();
                apiKey = request.body.reverse_proxy ? request.body.proxy_password : readSecret(request.user.directories, SECRET_KEYS.ZAI, request.body.secret_id);
                break;
            }
            case CHAT_COMPLETION_SOURCES.MINIMAX: {
                const { MINIMAX_ENDPOINT } = await import('../../../constants.js');
                apiUrl = request.body.minimax_endpoint === MINIMAX_ENDPOINT.CN
                    ? 'https://api.minimaxi.com/v1' : 'https://api.minimax.io/v1';
                apiKey = readSecret(request.user.directories, SECRET_KEYS.MINIMAX, request.body.secret_id);
                break;
            }
            case CHAT_COMPLETION_SOURCES.CLAUDE:
                apiUrl = new URL(request.body.reverse_proxy || 'https://api.anthropic.com/v1').toString();
                apiKey = readSecret(request.user.directories, SECRET_KEYS.CLAUDE, request.body.secret_id);
                break;
            case CHAT_COMPLETION_SOURCES.AI21:
                apiUrl = 'https://api.ai21.com/studio/v1';
                apiKey = readSecret(request.user.directories, SECRET_KEYS.AI21, request.body.secret_id);
                break;
            default: {
                // Try the provider registry — if the provider exists, use its listModels.
                try {
                    const provider = await getChatProvider(source);
                    const models = await provider.listModels(request);
                    return response.send({ data: models });
                } catch {
                    console.warn('Unsupported chat completion source:', source);
                    return response.status(400).send({ error: true });
                }
            }
        }

        if (!apiKey && !request.body.reverse_proxy && source !== CHAT_COMPLETION_SOURCES.CUSTOM) {
            console.warn('Chat Completion API key is missing.');
            return response.status(400).send({ error: true });
        }

        // Check cache first.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cacheKey = `${source}:${apiUrl}`;
        const cached = getCachedModels(source, apiUrl);
        if (cached) return response.send({ data: cached });

        const headers: Record<string, string> = {};
        if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
        if (source === CHAT_COMPLETION_SOURCES.OPENROUTER) {
            const { OPENROUTER_HEADERS } = await import('../../../constants.js');
            Object.assign(headers, OPENROUTER_HEADERS);
        }
        if (source === CHAT_COMPLETION_SOURCES.CUSTOM) {
            const { mergeObjectWithYaml } = await import('../../../util.js');
            mergeObjectWithYaml(headers, request.body.custom_include_headers);
        }

        const modelsUrl = new URL(apiUrl.replace(/\/+$/, '') + '/models');

        // NanoGPT uses detailed=true param for model capabilities.
        if (source === CHAT_COMPLETION_SOURCES.NANOGPT) modelsUrl.searchParams.set('detailed', 'true');
        if (source === CHAT_COMPLETION_SOURCES.SILICONFLOW) {
            modelsUrl.searchParams.set('type', 'text');
            modelsUrl.searchParams.set('sub_type', 'chat');
        }

        const modelsResponse = await globalThis.fetch(modelsUrl, { headers });

        if (modelsResponse.ok) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let data = await modelsResponse.json() as any;

            // Pollinations returns a plain array.
            if (source === CHAT_COMPLETION_SOURCES.POLLINATIONS && Array.isArray(data)) {
                data = { data: data.map((m: any) => ({ id: m.name, ...m })) };
            }

            // Chutes needs pricing transform.
            if (source === CHAT_COMPLETION_SOURCES.CHUTES && Array.isArray(data?.data)) {
                data.data = data.data
                    .filter((m: any) => m?.id)
                    .map((m: any) => {
                        if (m.pricing?.prompt !== undefined && m.pricing?.completion !== undefined) {
                            return { ...m, pricing: { ...m.pricing, input: m.pricing.prompt, output: m.pricing.completion } };
                        }
                        return m;
                    });
            }

            if (!data?.data && data?.models) {
                data.data = data.models.map((m: any) => ({ id: m.name, ...m }));
                delete data.models;
            }

            // Cohere returns { models: [...] } instead of { data: [...] }.
            if (source === CHAT_COMPLETION_SOURCES.COHERE && Array.isArray(data?.models)) {
                data.data = data.models.map((m: any) => ({ id: m.name, ...m }));
            }

            response.send(data);

            // Cache the model list.
            if (Array.isArray(data?.data)) {
                setCachedModels(source, apiUrl, data.data);
            }
        } else {
            console.error('Chat Completion status check failed.');
            response.send({ error: true, data: { data: [] } });
        }
    } catch (e) {
        console.error(e);
        if (!response.headersSent) response.send({ error: true });
        else response.end();
    }
});

// ── Generate ───────────────────────────────────────────────────────────────────

router.post('/generate', async function (request, response) {
    try {
        if (!request.body) return response.status(400).send({ error: true });

        const source = request.body.chat_completion_source;
        const provider = await getChatProvider(source);

        // Apply common pre-processing before delegating to the provider.
        const { postProcessPrompt, getPromptNames } = await import('../../../prompt-converters.js');
        const { flattenSchema } = await import('../../../util.js');

        const postProcessingType = request.body.custom_prompt_post_processing;
        if (Array.isArray(request.body.messages) && postProcessingType) {
            console.info('Applying custom prompt post-processing of type', postProcessingType);
            request.body.messages = postProcessPrompt(
                request.body.messages,
                postProcessingType,
                getPromptNames(request));
        }

        if (request.body.json_schema?.value) {
            request.body.json_schema.value = flattenSchema(
                request.body.json_schema.value,
                request.body.chat_completion_source);
        }

        // Reasoning effort for OpenAI/Custom sources.
        if (request.body.reasoning_effort) {
            switch (source) {
                case 'openai':
                case 'custom': {
                    const { OPENAI_REASONING_EFFORT_MODELS, OPENAI_FIXED_REASONING_EFFORT, OPENAI_REASONING_EFFORT_MAP } = await import('../../../constants.js');
                    if (OPENAI_REASONING_EFFORT_MODELS.includes(request.body.model)) {
                        request.body.reasoning_effort =
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            (OPENAI_FIXED_REASONING_EFFORT as any)[request.body.model]
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            ?? (OPENAI_REASONING_EFFORT_MAP as any)[request.body.reasoning_effort]
                            ?? request.body.reasoning_effort;
                    }
                    break;
                }
            }
        }

        await provider.chat(request, response);
    } catch (error) {
        console.error('Generation failed', error);
        // @ts-expect-error TS(2571)
        const message = error.code === 'ECONNREFUSED'
            // @ts-expect-error TS(2571)
            ? `Connection refused: ${error.message}`
            // @ts-expect-error TS(2571)
            : error.message || 'Unknown error occurred';

        if (!response.headersSent) {
            // @ts-expect-error TS(2698)
            response.status(502).send({ error: { message, ...error } });
        } else {
            response.end();
        }
    }
});

// ── Bias / token encoding ──────────────────────────────────────────────────────

router.post('/bias', async function (request, response) {
    if (!request.body || !Array.isArray(request.body))
        return response.sendStatus(400);

    try {
        const result: Record<string, number> = {};
        const model = getTokenizerModel(String(request.query.model || ''));

        if (model === 'claude') return response.send(result);

        let encodeFunction: (text: string) => Uint32Array;

        if (sentencepieceTokenizers.includes(model)) {
            const tokenizer = getSentencepiceTokenizer(model);
            const instance = await tokenizer?.get();
            if (!instance) {
                console.error('Tokenizer not initialized:', model);
                return response.send({});
            }
            encodeFunction = (text: string) => new Uint32Array(instance.encodeIds(text));
        } else if (webTokenizers.includes(model)) {
            const tokenizer = getWebTokenizer(model);
            const instance = await tokenizer?.get();
            if (!instance) {
                console.warn('Tokenizer not initialized:', model);
                return response.send({});
            }
            encodeFunction = (text: string) => new Uint32Array(instance.encode(text));
        } else {
            const tokenizer = getTiktokenTokenizer(model);
            encodeFunction = (tokenizer.encode.bind(tokenizer));
        }

        for (const entry of request.body) {
            if (!entry || !entry.text) continue;
            try {
                const tokens = getEntryTokens(entry.text, encodeFunction);
                for (const token of tokens) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (result as any)[token] = entry.value;
                }
            } catch {
                console.warn('Tokenizer failed to encode:', entry.text);
            }
        }

        return response.send(result);
    } catch (error) {
        console.error(error);
        return response.send({});
    }

    function getEntryTokens(text: string, encode: (text: string) => Uint32Array): Uint32Array {
        if (text.trim().startsWith('[') && text.trim().endsWith(']')) {
            try {
                const json = JSON.parse(text);
                if (Array.isArray(json) && json.every((x: unknown) => typeof x === 'number')) {
                    return new Uint32Array(json);
                }
            } catch { /* ignore */ }
        }
        return encode(text);
    }
});

// ── Process messages ──────────────────────────────────────────────────────────

router.post('/process', async function (request, response) {
    try {
        if (!Array.isArray(request.body.messages)) {
            return response.status(400).send({ error: 'Invalid messages format' });
        }

        const { postProcessPrompt, PROMPT_PROCESSING_TYPE, getPromptNames } = await import('../../../prompt-converters.js');

        if (!Object.values(PROMPT_PROCESSING_TYPE).includes(request.body.type)) {
            return response.status(400).send({ error: 'Unknown processing type' });
        }

        const messages = postProcessPrompt(request.body.messages, request.body.type, getPromptNames(request));
        return response.send({ messages });
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

// ── Multimodal models sub-router ──────────────────────────────────────────────

const multimodalModels = express.Router();

async function fetchModels(url: string, headers?: Record<string, string>): Promise<any> {
    const response = await globalThis.fetch(url, { headers });
    if (!response.ok) return [];
    return response.json();
}

multimodalModels.post('/pollinations', async (_req, res) => {
    try {
        const data = await fetchModels('https://gen.pollinations.ai/models');
        if (!Array.isArray(data)) return res.json([]);
        const models = data
            .filter((m: any) => Array.isArray(m?.input_modalities) && (m.input_modalities as string[]).includes('image'))
            .map((m: any) => m.name);
        return res.json(models);
    } catch (error) {
        console.error(error);
        return res.sendStatus(500);
    }
});

multimodalModels.post('/aimlapi', async (_req, res) => {
    try {
        const data = await fetchModels('https://api.aimlapi.com/v1/models');
        if (!Array.isArray(data?.data)) return res.json([]);
        const models = data.data
            .filter((m: any) => (m.features as string[])?.includes('openai/chat-completion.vision'))
            .map((m: any) => m.id);
        return res.json(models);
    } catch (error) {
        console.error(error);
        return res.sendStatus(500);
    }
});

multimodalModels.post('/nanogpt', async (_req, res) => {
    try {
        const data = await fetchModels('https://nano-gpt.com/api/v1/models?detailed=true');
        if (!Array.isArray(data?.data)) return res.json([]);
        const models = data.data.filter((m: any) => (m.capabilities as Record<string, unknown>)?.vision).map((m: any) => m.id);
        return res.json(models);
    } catch (error) {
        console.error(error);
        return res.sendStatus(500);
    }
});

multimodalModels.post('/electronhub', async (_req, res) => {
    try {
        const data = await fetchModels('https://api.electronhub.ai/v1/models');
        const models = (data.data as any[] || []).filter((m: any) => (m.metadata as Record<string, unknown>)?.vision).map((m: any) => m.id);
        return res.json(models);
    } catch (error) {
        console.error(error);
        return res.sendStatus(500);
    }
});

multimodalModels.post('/chutes', async (req, res) => {
    try {
        const key = readSecret(req.user.directories, SECRET_KEYS.CHUTES);
        if (!key) return res.json([]);
        const data = await fetchModels('https://llm.chutes.ai/v1/models', { Authorization: `Bearer ${key}` });
        const models = (data.data as any[] || [])
            .filter((m: any) => m.input_modalities?.includes('image'))
            .map((m: any) => m.id);
        return res.json(models);
    } catch (error) {
        console.error(error);
        return res.sendStatus(500);
    }
});

multimodalModels.post('/mistral', async (req, res) => {
    try {
        const key = readSecret(req.user.directories, SECRET_KEYS.MISTRALAI);
        if (!key) return res.json([]);
        const data = await fetchModels('https://api.mistral.ai/v1/models', { Authorization: `Bearer ${key}` });
        const models = (data.data as any[] || []).filter((m: any) => (m.capabilities as Record<string, unknown>)?.vision).map((m: any) => m.id);
        return res.json(models);
    } catch (error) {
        console.error(error);
        return res.sendStatus(500);
    }
});

multimodalModels.post('/xai', async (req, res) => {
    try {
        const key = readSecret(req.user.directories, SECRET_KEYS.XAI);
        if (!key) return res.json([]);
        const data = await fetchModels('https://api.x.ai/v1/language-models', { Authorization: `Bearer ${key}` });
        const models = (data.models as any[] || [])
            .filter((m: any) => (m.input_modalities as string[])?.includes('image'))
            .map((m: any) => m.id);
        if (!models.includes('grok-4-0709')) models.push('grok-4-0709');
        return res.json(models);
    } catch (error) {
        console.error(error);
        return res.sendStatus(500);
    }
});

multimodalModels.post('/moonshot', async (req, res) => {
    try {
        const key = readSecret(req.user.directories, SECRET_KEYS.MOONSHOT);
        if (!key) return res.json([]);
        const data = await fetchModels('https://api.moonshot.ai/v1/models', { Authorization: `Bearer ${key}` });
        const models = (data.data as any[] || []).filter((m: any) => m.supports_image_in).map((m: any) => m.id);
        return res.json(models);
    } catch (error) {
        console.error(error);
        return res.sendStatus(500);
    }
});

multimodalModels.post('/workers_ai', async (req, res) => {
    try {
        const key = readSecret(req.user.directories, SECRET_KEYS.WORKERS_AI);
        const accountId = String(req.body.workers_ai_account_id || '').trim();
        if (!key || !accountId) return res.json([]);
        const data = await fetchModels(
            `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search?task=Text+Generation&per_page=1000`,
            { Authorization: 'Bearer ' + key },
        );
        const models = Array.isArray(data?.result)
            ? (data.result as any[])
                .filter((m: any) => Array.isArray(m.properties) && m.properties.some((p: any) => p.property_id === 'vision' && p.value === 'true'))
                .map((m: any) => m.name)
            : [];
        return res.json(models);
    } catch (error) {
        console.error(error);
        return res.sendStatus(500);
    }
});

router.use('/multimodal-models', multimodalModels);
