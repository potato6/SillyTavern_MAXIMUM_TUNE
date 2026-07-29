import { Elysia } from 'elysia';
import { PassThrough, Readable } from 'node:stream';
import { CHAT_COMPLETION_SOURCES } from '../../../constants.js';
import {
    getTokenizerModel,
    getSentencepiceTokenizer,
    getTiktokenTokenizer,
    webTokenizers,
    sentencepieceTokenizers,
    getWebTokenizer,
} from '../../tokenizers.js';
import { readSecret, SECRET_KEYS } from '../../secrets.js';
import { getChatProvider, getRegisteredSources } from './registry.js';
import { getCachedModels, setCachedModels } from '../common/model-cache.js';

// Non-chained pattern for large files — type safety regained via explicit casts in each handler.
export const router: any = new Elysia({ prefix: '/api/backends/chat-completions', aot: false });

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Build a mock Express-like request object from the Elysia context.
 * Many providers and helpers (listModels, readSecret, getPromptNames)
 * access `req.body`, `req.user`, `req.user.directories`, `req.query`,
 * and `req.headers`.  The Elysia context has all of these at the same
 * structural paths, so we alias directly.
 */
function mockRequest(context: Record<string, unknown>): any {
    return context;
}

/**
 * Build a mock Express-like response backed by a PassThrough stream.
 * Writes go into the stream, which is then returned as a ReadableStream
 * body from the Elysia handler.  During bridge mode the stream is
 * buffered by mountElysia's `.text()` call, so clients receive the full
 * payload at once.  True streaming resumes in Phase 7 (standalone Elysia).
 */
function mockResponse(
    passThrough: PassThrough,
    set: Record<string, unknown>,
): Record<string, unknown> {
    let headersSent = false;

    const res = Object.assign(passThrough as unknown as Record<string, unknown>, {
        _headersSent: false,
        get headersSent() {
            return headersSent || this._headersSent;
        },
        set headersSent(v: boolean) {
            headersSent = v;
        },
        statusCode: 200,
        statusMessage: 'OK',
        status(code: number) {
            set.status = code;
            this.statusCode = code;
            return this;
        },
        send(data: unknown) {
            headersSent = true;
            if (typeof data === 'object') {
                passThrough.end(JSON.stringify(data));
            } else {
                passThrough.end(String(data));
            }
        },
        json(data: unknown) {
            headersSent = true;
            passThrough.end(JSON.stringify(data));
        },
        set(_field: string, _val: string) {
            // no-op – headers are set via context.set.headers or by the bridge
        },
        setHeader(_field: string, _val: string) {
            // no-op
        },
        writeHead(_statusCode: number, _statusMessage?: string) {
            headersSent = true;
        },
        flushHeaders() {
            // no-op
        },
        // Minimal socket stub — forwardFetchResponse checks `to.socket` before piping
        socket: {
            on(_event: string, _handler: (...args: unknown[]) => void) {
                // no-op; cleanup isn't needed since the stream ends with provider
            },
            removeAllListeners() {
                // no-op
            },
        },
    });

    return res;
}

// Pre-warm all providers to avoid cold-start import compilation
// in Bun's standalone binary.  First request then hits a warm cache.
Promise.all(
    getRegisteredSources().map((src) =>
        getChatProvider(src).catch(() => {
            /* provider may not be available */
        }),
    ),
);

// ── Status ─────────────────────────────────────────────────────────────────────

router.post('/status', async (context: Record<string, unknown>) => {
    const body = context.body as Record<string, unknown> | undefined;
    const set = context.set as Record<string, unknown>;

    try {
        if (!body) {
            set.status = 400;
            return;
        }

        const source = body.chat_completion_source as string;

        // Special-case handling for sources that need extra context.
        if (
            source === CHAT_COMPLETION_SOURCES.MAKERSUITE ||
            source === CHAT_COMPLETION_SOURCES.VERTEXAI
        ) {
            // Delegate to the gemini provider's listModels.
            const provider = await getChatProvider(source);
            const models = await provider.listModels(mockRequest(context));
            return { data: models };
        }

        if (source === CHAT_COMPLETION_SOURCES.AZURE_OPENAI) {
            const provider = await getChatProvider(source);
            const models = await provider.listModels(mockRequest(context));
            return { data: models };
        }

        if (source === CHAT_COMPLETION_SOURCES.WORKERS_AI) {
            const provider = await getChatProvider(source);
            const models = await provider.listModels(mockRequest(context));
            return { data: models };
        }

        // Standard path: resolve provider source, check cache, fetch models.
        let apiUrl = '';
        let apiKey = '';

        switch (source) {
            case CHAT_COMPLETION_SOURCES.OPENAI:
                apiUrl = new URL(
                    (body.reverse_proxy as string) || 'https://api.openai.com/v1',
                ).toString();
                apiKey = body.reverse_proxy
                    ? (body.proxy_password as string)
                    : await readSecret(
                          (context.user as Record<string, unknown>)?.directories as any,
                          SECRET_KEYS.OPENAI,
                          body.secret_id as string,
                      );
                break;
            case CHAT_COMPLETION_SOURCES.OPENROUTER:
                apiUrl = 'https://openrouter.ai/api/v1';
                apiKey = await readSecret(
                    (context.user as Record<string, unknown>)?.directories as any,
                    SECRET_KEYS.OPENROUTER,
                    body.secret_id as string,
                );
                break;
            case CHAT_COMPLETION_SOURCES.MISTRALAI:
                apiUrl = new URL(
                    (body.reverse_proxy as string) || 'https://api.mistral.ai/v1',
                ).toString();
                apiKey = body.reverse_proxy
                    ? (body.proxy_password as string)
                    : await readSecret(
                          (context.user as Record<string, unknown>)?.directories as any,
                          SECRET_KEYS.MISTRALAI,
                          body.secret_id as string,
                      );
                break;
            case CHAT_COMPLETION_SOURCES.CUSTOM:
                apiUrl = body.custom_url as string;
                apiKey = await readSecret(
                    (context.user as Record<string, unknown>)?.directories as any,
                    SECRET_KEYS.CUSTOM,
                    body.secret_id as string,
                );
                break;
            case CHAT_COMPLETION_SOURCES.COHERE:
                apiUrl = 'https://api.cohere.ai/v1';
                apiKey = await readSecret(
                    (context.user as Record<string, unknown>)?.directories as any,
                    SECRET_KEYS.COHERE,
                    body.secret_id as string,
                );
                break;
            case CHAT_COMPLETION_SOURCES.CHUTES:
                apiUrl = 'https://llm.chutes.ai/v1';
                apiKey = await readSecret(
                    (context.user as Record<string, unknown>)?.directories as any,
                    SECRET_KEYS.CHUTES,
                    body.secret_id as string,
                );
                break;
            case CHAT_COMPLETION_SOURCES.ELECTRONHUB:
                apiUrl = 'https://api.electronhub.ai/v1';
                apiKey = await readSecret(
                    (context.user as Record<string, unknown>)?.directories as any,
                    SECRET_KEYS.ELECTRONHUB,
                    body.secret_id as string,
                );
                break;
            case CHAT_COMPLETION_SOURCES.NANOGPT:
                apiUrl = 'https://nano-gpt.com/api/v1';
                apiKey = await readSecret(
                    (context.user as Record<string, unknown>)?.directories as any,
                    SECRET_KEYS.NANOGPT,
                    body.secret_id as string,
                );
                break;
            case CHAT_COMPLETION_SOURCES.DEEPSEEK:
                apiUrl = new URL(
                    (body.reverse_proxy as string) || 'https://api.deepseek.com',
                ).toString();
                apiKey = body.reverse_proxy
                    ? (body.proxy_password as string)
                    : await readSecret(
                          (context.user as Record<string, unknown>)?.directories as any,
                          SECRET_KEYS.DEEPSEEK,
                          body.secret_id as string,
                      );
                break;
            case CHAT_COMPLETION_SOURCES.XAI:
                apiUrl = new URL(
                    (body.reverse_proxy as string) || 'https://api.x.ai/v1',
                ).toString();
                apiKey = body.reverse_proxy
                    ? (body.proxy_password as string)
                    : await readSecret(
                          (context.user as Record<string, unknown>)?.directories as any,
                          SECRET_KEYS.XAI,
                          body.secret_id as string,
                      );
                break;
            case CHAT_COMPLETION_SOURCES.AIMLAPI:
                apiUrl = 'https://api.aimlapi.com/v1';
                apiKey = await readSecret(
                    (context.user as Record<string, unknown>)?.directories as any,
                    SECRET_KEYS.AIMLAPI,
                    body.secret_id as string,
                );
                break;
            case CHAT_COMPLETION_SOURCES.POLLINATIONS:
                apiUrl = 'https://gen.pollinations.ai/text';
                apiKey = await readSecret(
                    (context.user as Record<string, unknown>)?.directories as any,
                    SECRET_KEYS.POLLINATIONS,
                    body.secret_id as string,
                );
                break;
            case CHAT_COMPLETION_SOURCES.GROQ:
                apiUrl = 'https://api.groq.com/openai/v1';
                apiKey = await readSecret(
                    (context.user as Record<string, unknown>)?.directories as any,
                    SECRET_KEYS.GROQ,
                    body.secret_id as string,
                );
                break;
            case CHAT_COMPLETION_SOURCES.COMETAPI:
                throw new Error('This provider is temporarily disabled.');
            case CHAT_COMPLETION_SOURCES.MOONSHOT:
                apiUrl = new URL(
                    (body.reverse_proxy as string) || 'https://api.moonshot.ai/v1',
                ).toString();
                apiKey = body.reverse_proxy
                    ? (body.proxy_password as string)
                    : await readSecret(
                          (context.user as Record<string, unknown>)?.directories as any,
                          SECRET_KEYS.MOONSHOT,
                          body.secret_id as string,
                      );
                break;
            case CHAT_COMPLETION_SOURCES.FIREWORKS:
                apiUrl = 'https://api.fireworks.ai/inference/v1';
                apiKey = await readSecret(
                    (context.user as Record<string, unknown>)?.directories as any,
                    SECRET_KEYS.FIREWORKS,
                    body.secret_id as string,
                );
                break;
            case CHAT_COMPLETION_SOURCES.SILICONFLOW: {
                const { SILICONFLOW_ENDPOINT } = await import('../../../constants.js');
                apiUrl =
                    body.siliconflow_endpoint === SILICONFLOW_ENDPOINT.CN
                        ? 'https://api.siliconflow.cn/v1'
                        : 'https://api.siliconflow.com/v1';
                apiKey = await readSecret(
                    (context.user as Record<string, unknown>)?.directories as any,
                    SECRET_KEYS.SILICONFLOW,
                    body.secret_id as string,
                );
                break;
            }
            case CHAT_COMPLETION_SOURCES.ZAI: {
                const { ZAI_ENDPOINT } = await import('../../../constants.js');
                apiUrl = new URL(
                    (body.reverse_proxy as string) ||
                        (body.zai_endpoint === ZAI_ENDPOINT.CODING
                            ? 'https://api.z.ai/api/coding/paas/v4'
                            : 'https://api.z.ai/api/paas/v4'),
                ).toString();
                apiKey = body.reverse_proxy
                    ? (body.proxy_password as string)
                    : await readSecret(
                          (context.user as Record<string, unknown>)?.directories as any,
                          SECRET_KEYS.ZAI,
                          body.secret_id as string,
                      );
                break;
            }
            case CHAT_COMPLETION_SOURCES.MINIMAX: {
                const { MINIMAX_ENDPOINT } = await import('../../../constants.js');
                apiUrl =
                    body.minimax_endpoint === MINIMAX_ENDPOINT.CN
                        ? 'https://api.minimaxi.com/v1'
                        : 'https://api.minimax.io/v1';
                apiKey = await readSecret(
                    (context.user as Record<string, unknown>)?.directories as any,
                    SECRET_KEYS.MINIMAX,
                    body.secret_id as string,
                );
                break;
            }
            case CHAT_COMPLETION_SOURCES.CLAUDE:
                apiUrl = new URL(
                    (body.reverse_proxy as string) || 'https://api.anthropic.com/v1',
                ).toString();
                apiKey = await readSecret(
                    (context.user as Record<string, unknown>)?.directories as any,
                    SECRET_KEYS.CLAUDE,
                    body.secret_id as string,
                );
                break;
            case CHAT_COMPLETION_SOURCES.AI21:
                apiUrl = 'https://api.ai21.com/studio/v1';
                apiKey = await readSecret(
                    (context.user as Record<string, unknown>)?.directories as any,
                    SECRET_KEYS.AI21,
                    body.secret_id as string,
                );
                break;
            default: {
                // Try the provider registry — if the provider exists, use its listModels.
                try {
                    const provider = await getChatProvider(source);
                    const models = await provider.listModels(mockRequest(context));
                    return { data: models };
                } catch {
                    console.warn('Unsupported chat completion source:', source);
                    set.status = 400;
                    return { error: true };
                }
            }
        }

        if (!apiKey && !body.reverse_proxy && source !== CHAT_COMPLETION_SOURCES.CUSTOM) {
            console.warn('Chat Completion API key is missing.');
            set.status = 400;
            return { error: true };
        }

        // Check cache first.
        const cached = getCachedModels(source, apiUrl);
        if (cached) return { data: cached };

        const headers: Record<string, string> = {};
        if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
        if (source === CHAT_COMPLETION_SOURCES.OPENROUTER) {
            const { OPENROUTER_HEADERS } = await import('../../../constants.js');
            Object.assign(headers, OPENROUTER_HEADERS);
        }
        if (source === CHAT_COMPLETION_SOURCES.CUSTOM) {
            const { mergeObjectWithYaml } = await import('../../../util.js');
            mergeObjectWithYaml(headers, body.custom_include_headers as string);
        }

        const modelsUrl = new URL(apiUrl.replace(/\/+$/, '') + '/models');

        // NanoGPT uses detailed=true param for model capabilities.
        if (source === CHAT_COMPLETION_SOURCES.NANOGPT)
            modelsUrl.searchParams.set('detailed', 'true');
        if (source === CHAT_COMPLETION_SOURCES.SILICONFLOW) {
            modelsUrl.searchParams.set('type', 'text');
            modelsUrl.searchParams.set('sub_type', 'chat');
        }

        const modelsResponse = await globalThis.fetch(modelsUrl, { headers });

        if (modelsResponse.ok) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let data = (await modelsResponse.json()) as any;

            // Pollinations returns a plain array.
            if (source === CHAT_COMPLETION_SOURCES.POLLINATIONS && Array.isArray(data)) {
                data = {
                    data: data.map((m: { name?: string; [key: string]: unknown }) => ({
                        id: m.name,
                        ...m,
                    })),
                };
            }

            const dataRecord = data as Record<string, unknown>;
            // Chutes needs pricing transform.
            if (source === CHAT_COMPLETION_SOURCES.CHUTES && Array.isArray(dataRecord?.data)) {
                dataRecord.data = dataRecord.data
                    .filter((m: { id?: string }) => m?.id)
                    .map((m: Record<string, unknown>) => {
                        const pricing = m.pricing as Record<string, unknown>;
                        if (pricing?.prompt !== undefined && pricing?.completion !== undefined) {
                            return {
                                ...m,
                                pricing: {
                                    ...pricing,
                                    input: pricing.prompt,
                                    output: pricing.completion,
                                },
                            };
                        }
                        return m;
                    });
            }

            if (!dataRecord?.data && (dataRecord as unknown as Record<string, unknown>)?.models) {
                dataRecord.data = (
                    (dataRecord as unknown as Record<string, unknown>).models as {
                        name?: string;
                        [key: string]: unknown;
                    }[]
                ).map((m: { name?: string; [key: string]: unknown }) => ({ id: m.name, ...m }));
                delete (dataRecord as unknown as Record<string, unknown>).models;
            }

            // Cohere returns { models: [...] } instead of { data: [...] }.
            if (source === CHAT_COMPLETION_SOURCES.COHERE && Array.isArray(data?.models)) {
                data.data = data.models.map((m: { name?: string; [key: string]: unknown }) => ({
                    id: m.name,
                    ...m,
                }));
            }

            // Cache the model list.
            if (Array.isArray(data?.data)) {
                setCachedModels(source, apiUrl, data.data);
            }

            return data;
        } else {
            console.error('Chat Completion status check failed.');
            return { error: true, data: { data: [] } };
        }
    } catch (e) {
        console.error(e);
        if (!(set as any).headersSent) return { error: true };
        // If headers already sent, there's nothing to return — the stream is closed.
        return;
    }
});

// ── Generate ──────────────────────────────────────────────────────────────────

router.post('/generate', async (context: Record<string, unknown>) => {
    const body = context.body as Record<string, unknown> | undefined;
    const set = context.set as Record<string, unknown>;

    try {
        if (!body) {
            set.status = 400;
            return { error: true };
        }

        const source = body.chat_completion_source as string;
        const provider = await getChatProvider(source);

        // Apply common pre-processing before delegating to the provider.
        const { postProcessPrompt, getPromptNames } = await import('../../../prompt-converters.js');
        const { flattenSchema } = await import('../../../util.js');

        const postProcessingType = body.custom_prompt_post_processing as string;
        if (Array.isArray(body.messages) && postProcessingType) {
            console.info('Applying custom prompt post-processing of type', postProcessingType);
            body.messages = postProcessPrompt(
                body.messages,
                postProcessingType,
                // getPromptNames accesses req.body.* — pass context cast as any
                getPromptNames(context as any),
            );
        }

        if (body.json_schema && (body.json_schema as Record<string, unknown>)?.value) {
            (body.json_schema as Record<string, unknown>).value = flattenSchema(
                (body.json_schema as Record<string, unknown>).value as any,
                body.chat_completion_source as string,
            );
        }

        // Reasoning effort for OpenAI/Custom sources.
        if (body.reasoning_effort) {
            switch (source) {
                case 'openai':
                case 'custom': {
                    const {
                        OPENAI_REASONING_EFFORT_MODELS,
                        OPENAI_FIXED_REASONING_EFFORT,
                        OPENAI_REASONING_EFFORT_MAP,
                    } = await import('../../../constants.js');
                    if (OPENAI_REASONING_EFFORT_MODELS.includes(body.model as string)) {
                        body.reasoning_effort =
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            (OPENAI_FIXED_REASONING_EFFORT as any)[body.model as string] ??
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            (OPENAI_REASONING_EFFORT_MAP as any)[body.reasoning_effort as string] ??
                            body.reasoning_effort;
                    }
                    break;
                }
            }
        }

        // ── Bridge to Express-based providers ─────────────────────────────
        // The provider's `chat()` method expects Express req/res objects.
        // We create mock objects backed by a PassThrough stream so writes
        // (SSE chunks, JSON bodies) are captured and returned as the Elysia
        // Response body.
        //
        // Unlike the original Express code, we do NOT await the provider
        // call — we fire it and return the stream immediately so chunks
        // flow to the client in real time.  Error handling is done via
        // the catch handler below.
        const passThrough = new PassThrough();
        const mockReq = mockRequest(context);
        const mockRes = mockResponse(passThrough, set);

        // Fire provider — chunks will be written to passThrough as they arrive.
        (provider.chat as any)(mockReq, mockRes).catch((error: any) => {
            console.error('Generation failed', error);
            if (!passThrough.destroyed) {
                const message =
                    error.code === 'ECONNREFUSED'
                        ? `Connection refused: ${error.message}`
                        : error.message || 'Unknown error occurred';
                passThrough.destroy(new Error(message));
            }
        });

        // Convert the Node.js PassThrough to a Web ReadableStream for Elysia.
        const webStream = Readable.toWeb(passThrough) as unknown as ReadableStream<Uint8Array>;
        return new Response(webStream, {
            headers: { 'Content-Type': 'text/event-stream' },
        });
    } catch (error: any) {
        console.error('Generation failed', error);
        const message =
            error.code === 'ECONNREFUSED'
                ? `Connection refused: ${error.message}`
                : error.message || 'Unknown error occurred';

        if (!(set as any).headersSent) {
            set.status = 502;
            return { error: { message, ...error } };
        }
        // If headers already sent, nothing to return — the stream is closed.
        return;
    }
});

// ── Bias / token encoding ─────────────────────────────────────────────────────

router.post('/bias', async (context: Record<string, unknown>) => {
    const body = context.body as Record<string, unknown> | undefined;
    const set = context.set as Record<string, unknown>;

    if (!body || !Array.isArray(body)) {
        set.status = 400;
        return;
    }

    try {
        const result: Record<string, number> = {};
        const model = getTokenizerModel(
            String((context.query as Record<string, unknown>)?.model || ''),
        );

        if (model === 'claude') return result;

        let encodeFunction: (text: string) => Uint32Array;

        if (sentencepieceTokenizers.includes(model)) {
            const tokenizer = getSentencepiceTokenizer(model);
            const instance = await tokenizer?.get();
            if (!instance) {
                console.error('Tokenizer not initialized:', model);
                return {};
            }
            encodeFunction = (text: string) => new Uint32Array(instance.encodeIds(text));
        } else if (webTokenizers.includes(model)) {
            const tokenizer = getWebTokenizer(model);
            const instance = await tokenizer?.get();
            if (!instance) {
                console.warn('Tokenizer not initialized:', model);
                return {};
            }
            encodeFunction = (text: string) => new Uint32Array(instance.encode(text));
        } else {
            const tokenizer = getTiktokenTokenizer(model);
            encodeFunction = tokenizer.encode.bind(tokenizer);
        }

        for (const entry of body as unknown as Array<Record<string, unknown>>) {
            if (!entry || !entry.text) continue;
            try {
                const tokens = getEntryTokens(entry.text as string, encodeFunction);
                for (const token of tokens) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (result as any)[token] = entry.value;
                }
            } catch {
                console.warn('Tokenizer failed to encode:', entry.text);
            }
        }

        return result;
    } catch (error) {
        console.error(error);
        return {};
    }
});

// ── Process messages ──────────────────────────────────────────────────────────

router.post('/process', async (context: Record<string, unknown>) => {
    const body = context.body as Record<string, unknown> | undefined;
    const set = context.set as Record<string, unknown>;

    try {
        if (!Array.isArray(body?.messages)) {
            set.status = 400;
            return { error: 'Invalid messages format' };
        }

        const { postProcessPrompt, PROMPT_PROCESSING_TYPE, getPromptNames } =
            await import('../../../prompt-converters.js');

        if (!Object.values(PROMPT_PROCESSING_TYPE).includes(body.type as string)) {
            set.status = 400;
            return { error: 'Unknown processing type' };
        }

        const messages = postProcessPrompt(
            body.messages,
            body.type as string,
            getPromptNames(context as any),
        );
        return { messages };
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

// ── Multimodal models sub-router ──────────────────────────────────────────────

const multimodalModels = new Elysia({ prefix: '/multimodal-models', aot: false });

/**
 * @param url
 * @param headers
 */
async function fetchModels(url: string, headers?: Record<string, string>): Promise<unknown> {
    const response = await globalThis.fetch(url, { headers });
    if (!response.ok) return [];
    return response.json();
}

multimodalModels.post('/pollinations', async (_context: Record<string, unknown>) => {
    try {
        const data = await fetchModels('https://gen.pollinations.ai/models');
        if (!Array.isArray(data)) return [];
        const models = data
            .filter(
                (m: { input_modalities?: string[] }) =>
                    Array.isArray(m?.input_modalities) && m.input_modalities.includes('image'),
            )
            .map((m: { name?: string }) => m.name);
        return models;
    } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
    }
});

multimodalModels.post('/aimlapi', async (_context: Record<string, unknown>) => {
    try {
        const data = (await fetchModels('https://api.aimlapi.com/v1/models')) as Record<
            string,
            unknown
        >;
        if (!Array.isArray(data?.data)) return [];
        const models = (data.data as Array<Record<string, unknown>>)
            .filter((m: { features?: string[] }) =>
                m.features?.includes('openai/chat-completion.vision'),
            )
            .map((m: { id?: string }) => m.id);
        return models;
    } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
    }
});

multimodalModels.post('/nanogpt', async (_context: Record<string, unknown>) => {
    try {
        const data = (await fetchModels(
            'https://nano-gpt.com/api/v1/models?detailed=true',
        )) as Record<string, unknown>;
        if (!Array.isArray(data?.data)) return [];
        const models = (data.data as Array<Record<string, unknown>>)
            .filter((m: { capabilities?: Record<string, unknown> }) => m.capabilities?.vision)
            .map((m: { id?: string }) => m.id);
        return models;
    } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
    }
});

multimodalModels.post('/electronhub', async (_context: Record<string, unknown>) => {
    try {
        const data = (await fetchModels('https://api.electronhub.ai/v1/models')) as Record<
            string,
            unknown
        >;
        const models = ((data.data as Array<Record<string, unknown>>) || [])
            .filter((m: { metadata?: Record<string, unknown> }) => m.metadata?.vision)
            .map((m: { id?: string }) => m.id);
        return models;
    } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
    }
});

multimodalModels.post('/chutes', async (context: Record<string, unknown>) => {
    try {
        const user = context.user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const key = directories ? await readSecret(directories as any, SECRET_KEYS.CHUTES) : '';
        if (!key) return [];
        const data = (await fetchModels('https://llm.chutes.ai/v1/models', {
            Authorization: 'Bearer ' + key,
        })) as Record<string, unknown>;
        const models = ((data.data as Array<Record<string, unknown>>) || [])
            .filter((m: { input_modalities?: string[] }) => m.input_modalities?.includes('image'))
            .map((m: { id?: string }) => m.id);
        return models;
    } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
    }
});

multimodalModels.post('/mistral', async (context: Record<string, unknown>) => {
    try {
        const user = context.user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const key = directories ? await readSecret(directories as any, SECRET_KEYS.MISTRALAI) : '';
        if (!key) return [];
        const data = (await fetchModels('https://api.mistral.ai/v1/models', {
            Authorization: 'Bearer ' + key,
        })) as Record<string, unknown>;
        const models = ((data.data as Array<Record<string, unknown>>) || [])
            .filter((m: { capabilities?: Record<string, unknown> }) => m.capabilities?.vision)
            .map((m: { id?: string }) => m.id);
        return models;
    } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
    }
});

multimodalModels.post('/xai', async (context: Record<string, unknown>) => {
    try {
        const user = context.user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const key = directories ? await readSecret(directories as any, SECRET_KEYS.XAI) : '';
        if (!key) return [];
        const data = (await fetchModels('https://api.x.ai/v1/language-models', {
            Authorization: 'Bearer ' + key,
        })) as Record<string, unknown>;
        const models = ((data.models as Array<Record<string, unknown>>) || [])
            .filter((m: { input_modalities?: string[] }) => m.input_modalities?.includes('image'))
            .map((m: { id?: string }) => m.id);
        if (!models.includes('grok-4-0709')) models.push('grok-4-0709');
        return models;
    } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
    }
});

multimodalModels.post('/moonshot', async (context: Record<string, unknown>) => {
    try {
        const user = context.user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const key = directories ? await readSecret(directories as any, SECRET_KEYS.MOONSHOT) : '';
        if (!key) return [];
        const data = (await fetchModels('https://api.moonshot.ai/v1/models', {
            Authorization: 'Bearer ' + key,
        })) as Record<string, unknown>;
        const models = ((data.data as Array<Record<string, unknown>>) || [])
            .filter((m: { supports_image_in?: boolean }) => m.supports_image_in)
            .map((m: { id?: string }) => m.id);
        return models;
    } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
    }
});

multimodalModels.post('/workers_ai', async (context: Record<string, unknown>) => {
    try {
        const user = context.user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const body = context.body as Record<string, unknown> | undefined;
        const key = directories ? await readSecret(directories as any, SECRET_KEYS.WORKERS_AI) : '';
        const accountId = String((body?.workers_ai_account_id as string) || '').trim();
        if (!key || !accountId) return [];
        const data = (await fetchModels(
            `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search?task=Text+Generation&per_page=1000`,
            { Authorization: 'Bearer ' + key },
        )) as Record<string, unknown>;
        const models = Array.isArray(data?.result)
            ? (data.result as Array<Record<string, unknown>>)
                  .filter(
                      (m: { properties?: Array<{ property_id?: string; value?: string }> }) =>
                          Array.isArray(m.properties) &&
                          m.properties.some(
                              (p) => p.property_id === 'vision' && p.value === 'true',
                          ),
                  )
                  .map((m: { name?: string }) => m.name)
            : [];
        return models;
    } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
    }
});

// Mount multimodal sub-router
router.use(multimodalModels);

// ── Token encoding helper (used by /bias) ──────────────────────────────────────

/**
 * @param text
 * @param encode
 */
function getEntryTokens(text: string, encode: (text: string) => Uint32Array): Uint32Array {
    if (text.trim().startsWith('[') && text.trim().endsWith(']')) {
        try {
            const json = JSON.parse(text);
            if (Array.isArray(json) && json.every((x: unknown) => typeof x === 'number')) {
                return new Uint32Array(json);
            }
        } catch {
            /* ignore */
        }
    }
    return encode(text);
}
