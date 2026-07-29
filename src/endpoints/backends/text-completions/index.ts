import { Elysia } from 'elysia';

import { TEXTGEN_TYPES } from '../../../constants.js';
import { trimV1 } from '../../../util.js';
import { setAdditionalHeadersByType } from '../../../additional-headers.js';
import { getProvider, getRegisteredTypes } from './registry.js';
import { PROVIDER_ENDPOINTS } from './types.js';

export const router = new Elysia({ prefix: '/api/backends/text-completions', aot: false });

// Pre-warm all providers to avoid cold-start import compilation.
Promise.all(
    getRegisteredTypes().map((type) =>
        getProvider(type).catch(() => {
            /* provider may not be available */
        }),
    ),
);

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Abort KoboldCpp generation request.
 */
async function abortKoboldCppRequest(url: string, headers: Record<string, string>) {
    try {
        console.info('Aborting Kobold generation...');
        const abortResponse = await globalThis.fetch(`${url}/api/extra/abort`, {
            method: 'POST',
            headers,
        });
        if (!abortResponse.ok) {
            console.error(
                'Error sending abort request to Kobold:',
                abortResponse.status,
                abortResponse.statusText,
            );
        }
    } catch (error) {
        console.error(error);
    }
}

/**
 * Resolve the `user` object from the Elysia context (set by the resolve bridge).
 */
function getUser(context: Record<string, unknown>): Record<string, unknown> | null {
    return context.user as Record<string, unknown> | null;
}

/**
 * Build additional headers for a provider API call, mutating the passed object.
 */
function buildAdditionalHeaders(
    headers: Record<string, string>,
    apiType: string,
    server: string,
    context: unknown,
    secretId: string | null,
): void {
    const user = getUser(context as Record<string, unknown>);
    setAdditionalHeadersByType(
        headers,
        apiType,
        server,
        (user?.directories as any) ?? {},
        secretId,
    );
}

// ── Status ─────────────────────────────────────────────────────────────────────

router.post('/status', async (context) => {
    const { set } = context;
    const body = context.body as Record<string, unknown> | undefined;

    if (!body) {
        set.status = 400;
        return;
    }

    try {
        if ((body.api_server as string).indexOf('localhost') !== -1) {
            body.api_server = (body.api_server as string).replace('localhost', '127.0.0.1');
        }

        console.debug('Trying to connect to API', body);
        const baseUrl = trimV1(body.api_server as string);
        const apiType = body.api_type as string;

        const args: { headers: Record<string, string> } = {
            headers: { 'Content-Type': 'application/json' },
        };
        buildAdditionalHeaders(
            args.headers,
            apiType,
            baseUrl,
            context,
            (body.secret_id as string) ?? null,
        );

        // URL from centralised config — no switch.
        const endpoints = PROVIDER_ENDPOINTS[apiType];
        if (!endpoints) {
            set.status = 400;
            return { result: 'no_connection', response: `Unknown API type: ${apiType}` };
        }
        const url = baseUrl + endpoints.status;

        const modelsReply = await globalThis.fetch(url, args);
        const isPossiblyLmStudio = modelsReply.headers.get('x-powered-by') === 'Express';

        if (!modelsReply.ok) {
            console.error(`Models endpoint returned HTTP ${modelsReply.status}`);
            set.status = 400;
            return {
                result: 'no_connection',
                response: `API returned an error: HTTP ${modelsReply.status}`,
            };
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic API shape
        let data = (await modelsReply.json()) as any;

        // Let the provider rewrap the status response (TogetherAI, Ollama, HuggingFace…).
        const provider = await getProvider(apiType);
        if (provider.buildStatusResponse) {
            data = provider.buildStatusResponse(data);
        }

        if (!data || !Array.isArray(data.data)) {
            console.error('Models response is not an array.');
            set.status = 400;
            return;
        }

        const modelIds = data.data.map((x: { id: string }) => x.id);
        console.info('Models available:', modelIds);

        let result = modelIds[0] || 'Valid';

        // Ooba: extra model info (skip LM Studio look-alike).
        if (apiType === TEXTGEN_TYPES.OOBA && !isPossiblyLmStudio && provider.getModelId) {
            const modelName = await provider.getModelId(baseUrl, args.headers);
            if (modelName) {
                result = modelName;
                set.headers = set.headers ?? {};
                set.headers['x-supports-tokenization'] = 'true';
            }
        }

        // Tabby: extra model info.
        if (apiType === TEXTGEN_TYPES.TABBY && provider.getModelId) {
            const modelName = await provider.getModelId(baseUrl, args.headers);
            if (modelName) {
                result = modelName;
            } else {
                // TabbyAPI returns a 400 when no model is loaded.
                result = 'None';
            }
        }

        return { result, data: data.data };
    } catch (error) {
        console.error(error);
        set.status = 500;
    }
});

// ── Props ──────────────────────────────────────────────────────────────────────

router.post('/props', async (context) => {
    const { set } = context;
    const body = context.body as Record<string, unknown> | undefined;

    if (!body?.api_server) {
        set.status = 400;
        return;
    }

    try {
        const baseUrl = trimV1(body.api_server as string);
        const apiType = body.api_type as string;

        const args: { headers: Record<string, string> } = { headers: {} };
        buildAdditionalHeaders(
            args.headers,
            apiType,
            baseUrl,
            context,
            (body.secret_id as string) ?? null,
        );

        let propsUrl = baseUrl + '/props';
        if (apiType === TEXTGEN_TYPES.LLAMACPP && body.model) {
            propsUrl += `?model=${encodeURIComponent(body.model as string)}`;
            console.debug(`Querying llama-server props with model parameter: ${body.model}`);
        }

        const propsReply = await globalThis.fetch(propsUrl, args);
        if (!propsReply.ok) {
            set.status = 400;
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const props = (await propsReply.json()) as any;

        // TEMPORARY: llama.cpp's /props endpoint has a bug — trailing \0.
        if (
            apiType === TEXTGEN_TYPES.LLAMACPP &&
            props.chat_template &&
            props.chat_template.endsWith('\u0000')
        ) {
            props.chat_template = props.chat_template.slice(0, -1) + '\n';
        }

        // Lazy-load crypto — only needed for this one hash.
        const { createHash } = await import('node:crypto');
        props.chat_template_hash = createHash('sha256').update(props.chat_template).digest('hex');
        console.debug(`Model properties: ${JSON.stringify(props)}`);
        return props;
    } catch (error) {
        console.error(error);
        set.status = 500;
    }
});

// ── Generate ───────────────────────────────────────────────────────────────────

router.post('/generate', async (context) => {
    const { set, request: contextRequest } = context;
    const body = context.body as Record<string, unknown> | undefined;

    if (!body) {
        set.status = 400;
        return;
    }

    try {
        if ((body.api_server as string).indexOf('localhost') !== -1) {
            body.api_server = (body.api_server as string).replace('localhost', '127.0.0.1');
        }

        const apiType = body.api_type as string;
        const baseUrl = body.api_server as string;
        console.debug(body);

        // Abort handling — use the incoming request's signal to detect disconnect.
        const controller = new AbortController();
        const onAbort = async function () {
            if (apiType === TEXTGEN_TYPES.KOBOLDCPP) {
                const abortHeaders: Record<string, string> = {};
                const user = getUser(context as Record<string, unknown>);
                setAdditionalHeadersByType(
                    abortHeaders,
                    apiType,
                    trimV1(baseUrl),
                    (user?.directories as any) ?? {},
                    (body as Record<string, unknown>).secret_id as string | null,
                );
                await abortKoboldCppRequest(trimV1(baseUrl), abortHeaders);
            }
            controller.abort();
        };
        contextRequest.signal.addEventListener('abort', onAbort, { once: true });

        // URL from centralised config — no switch.
        const endpoints = PROVIDER_ENDPOINTS[apiType];
        if (!endpoints) {
            set.status = 400;
            return { error: true, status: 'UNKNOWN', response: `Unknown API type: ${apiType}` };
        }

        const url = trimV1(baseUrl) + endpoints.generate;
        const provider = await getProvider(apiType);
        const generateBody = provider.buildGenerateBody
            ? provider.buildGenerateBody(body as Record<string, unknown>)
            : { ...body };

        const fetchArgs: RequestInit = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify(generateBody),
        };
        const extraHeaders: Record<string, string> = {};
        buildAdditionalHeaders(
            extraHeaders,
            apiType,
            baseUrl,
            context,
            (body.secret_id as string) ?? null,
        );
        Object.assign(fetchArgs.headers as Record<string, string>, extraHeaders);

        if (body.stream) {
            // Streaming — pipe the fetch response body through as a Web Response.
            // The mountElysia bridge writes this back to the Express response.
            const fetchResponse = await globalThis.fetch(url, fetchArgs);

            if (!fetchResponse.body) {
                set.status = 500;
                return {
                    error: true,
                    status: 'STREAM_ERROR',
                    response: 'No response body from upstream',
                };
            }

            return new Response(fetchResponse.body, {
                status: fetchResponse.status,
                statusText: fetchResponse.statusText,
                headers: fetchResponse.headers,
            });
        }

        // Non-streaming — read the full response and optionally transform.
        const reply = await globalThis.fetch(url, fetchArgs);

        if (reply.ok) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic API shape
            let data = (await reply.json()) as any;
            console.debug('Backend response:', data);

            if (provider.transformGenerateResponse) {
                data = provider.transformGenerateResponse(data);
            }

            return data;
        }

        const text = await reply.text();
        set.status = reply.status;
        return { error: true, status: reply.status, response: text };
    } catch (error: any) {
        const status = error?.status ?? error?.code ?? 'UNKNOWN';
        const text =
            error?.error ??
            error?.statusText ??
            error?.message ??
            'Unknown error on /generate endpoint';
        const value = { error: true, status, response: text };
        console.error('Endpoint error:', error);

        if (typeof status === 'number') {
            set.status = status;
        } else {
            set.status = 500;
        }
        return value;
    }
});

// ── Provider-specific sub-routers ─────────────────────────────────────────────
// These expose distinct endpoints (download, caption-image, slots, etc.) that are
// not covered by the generic BackendProvider interface.

const ollama = new Elysia({ prefix: '/ollama', aot: false })
    .post('/download', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;

        try {
            if (!body?.name || !body?.api_server) {
                set.status = 400;
                return;
            }

            const name = body.name as string;
            const url = String(body.api_server).replace(/\/$/, '');
            console.debug('Pulling Ollama model:', name);

            const fetchResponse = await globalThis.fetch(`${url}/api/pull`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, stream: false }),
            });

            if (!fetchResponse.ok) {
                console.error('Download error:', fetchResponse.status, fetchResponse.statusText);
                set.status = 500;
                return { error: true };
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            console.debug('Ollama pull response:', (await fetchResponse.json()) as any);
            return { ok: true };
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    })
    .post('/caption-image', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;

        try {
            if (!body?.server_url || !body?.model) {
                set.status = 400;
                return;
            }

            console.debug('Ollama caption request:', body);
            const baseUrl = trimV1(body.server_url as string);

            const fetchResponse = await globalThis.fetch(`${baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: body.model,
                    prompt: body.prompt,
                    images: [body.image],
                    stream: false,
                }),
            });

            if (!fetchResponse.ok) {
                const errorText = await fetchResponse.text();
                console.error(
                    'Ollama caption error:',
                    fetchResponse.status,
                    fetchResponse.statusText,
                    errorText,
                );
                set.status = 500;
                return { error: true };
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = (await fetchResponse.json()) as any;
            console.debug('Ollama caption response:', data);

            const caption = data?.response || '';
            if (!caption) {
                console.error('Ollama caption is empty.');
                set.status = 500;
                return { error: true };
            }

            return { caption };
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    });

const llamacpp = new Elysia({ prefix: '/llamacpp', aot: false })
    .post('/props', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;

        try {
            if (!body?.server_url) {
                set.status = 400;
                return;
            }

            console.debug('LlamaCpp props request:', body);
            const baseUrl = trimV1(body.server_url as string);

            const fetchResponse = await globalThis.fetch(`${baseUrl}/props`, { method: 'GET' });

            if (!fetchResponse.ok) {
                console.error(
                    'LlamaCpp props error:',
                    fetchResponse.status,
                    fetchResponse.statusText,
                );
                set.status = 500;
                return { error: true };
            }

            const data = (await fetchResponse.json()) as Record<string, unknown>;
            console.debug('LlamaCpp props response:', data);
            return data;
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    })
    .post('/slots', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | undefined;

        try {
            if (!body?.server_url) {
                set.status = 400;
                return;
            }
            if (!/^(erase|info|restore|save)$/.test(body.action as string)) {
                set.status = 400;
                return;
            }

            console.debug('LlamaCpp slots request:', body);
            const baseUrl = trimV1(body.server_url as string);

            let fetchResponse;
            if (body.action === 'info') {
                fetchResponse = await globalThis.fetch(`${baseUrl}/slots`, { method: 'GET' });
            } else {
                if (!/^\d+$/.test(body.id_slot as string)) {
                    set.status = 400;
                    return;
                }
                if (body.action !== 'erase' && !body.filename) {
                    set.status = 400;
                    return;
                }

                fetchResponse = await globalThis.fetch(
                    `${baseUrl}/slots/${body.id_slot}?action=${body.action}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            filename:
                                body.action !== 'erase' ? `${body.filename as string}` : undefined,
                        }),
                    },
                );
            }

            if (!fetchResponse.ok) {
                console.error(
                    'LlamaCpp slots error:',
                    fetchResponse.status,
                    fetchResponse.statusText,
                );
                set.status = 500;
                return { error: true };
            }

            const data = (await fetchResponse.json()) as Record<string, unknown>;
            console.debug('LlamaCpp slots response:', data);
            return data;
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    });

const tabby = new Elysia({ prefix: '/tabby', aot: false }).post('/download', async (context) => {
    const { set } = context;
    const body = context.body as Record<string, unknown> | undefined;

    try {
        const baseUrl = String(body?.api_server).replace(/\/$/, '');
        const args: Record<string, unknown> = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        };

        buildAdditionalHeaders(
            args.headers as Record<string, string>,
            body?.api_type as string,
            baseUrl,
            context,
            (body?.secret_id as string) ?? null,
        );

        // Check key permissions.
        const permissionResponse = await globalThis.fetch(`${baseUrl}/v1/auth/permission`, {
            headers: args.headers as Record<string, string>,
        });

        if (permissionResponse.ok) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const permissionJson = (await permissionResponse.json()) as any;
            if (permissionJson.permission !== 'admin') {
                set.status = 403;
                return { error: true };
            }
        } else {
            console.error(
                'API Permission error:',
                permissionResponse.status,
                permissionResponse.statusText,
            );
            set.status = 500;
            return { error: true };
        }

        const fetchResponse = await globalThis.fetch(`${baseUrl}/v1/download`, args as RequestInit);
        if (!fetchResponse.ok) {
            console.error('Download error:', fetchResponse.status, fetchResponse.statusText);
            set.status = 500;
            return { error: true };
        }

        return { ok: true };
    } catch (error) {
        console.error(error);
        set.status = 500;
    }
});

router.use(ollama);
router.use(llamacpp);
router.use(tabby);
