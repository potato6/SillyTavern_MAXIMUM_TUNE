import fs from 'node:fs';
import { Elysia } from 'elysia';

import { delay } from '../../util.js';
import { getOverrideHeaders, setAdditionalHeadersByType } from '../../additional-headers.js';
import { TEXTGEN_TYPES } from '../../constants.js';
import type { UserDirectoryList } from '../../users.js';

export const router = new Elysia({ prefix: '/api/backends/kobold', aot: false });

router.post('/generate', async (context) => {
    const body = context.body as Record<string, unknown> | null;
    if (!body) {
        context.set.status = 400;
        return;
    }

    const apiServer = (body.api_server as string) || '';
    if (apiServer.indexOf('localhost') != -1) {
        body.api_server = apiServer.replace('localhost', '127.0.0.1');
    }

    const request_prompt = body.prompt;
    const controller = new AbortController();

    // Listen for client disconnect — abort the upstream request on cancel
    context.request.signal.addEventListener('abort', async () => {
        if (body.can_abort) {
            try {
                console.info('Aborting Kobold generation...');
                const abortResponse = await fetch(`${body.api_server}/extra/abort`, {
                    method: 'POST',
                });
                if (!abortResponse.ok) {
                    console.error('Error sending abort request to Kobold:', abortResponse.status);
                }
            } catch (error) {
                console.error(error);
            }
        }
        controller.abort();
    });

    let this_settings: Record<string, unknown> = {
        prompt: request_prompt,
        use_story: false,
        use_memory: false,
        use_authors_note: false,
        use_world_info: false,
        max_context_length: body.max_context_length,
        max_length: body.max_length,
    };

    if (!body.gui_settings) {
        this_settings = {
            prompt: request_prompt,
            use_story: false,
            use_memory: false,
            use_authors_note: false,
            use_world_info: false,
            max_context_length: body.max_context_length,
            max_length: body.max_length,
            rep_pen: body.rep_pen,
            rep_pen_range: body.rep_pen_range,
            rep_pen_slope: body.rep_pen_slope,
            temperature: body.temperature,
            tfs: body.tfs,
            top_a: body.top_a,
            top_k: body.top_k,
            top_p: body.top_p,
            min_p: body.min_p,
            typical: body.typical,
            sampler_order: body.sampler_order,
            singleline: !!body.singleline,
            use_default_badwordsids: body.use_default_badwordsids,
            mirostat: body.mirostat,
            mirostat_eta: body.mirostat_eta,
            mirostat_tau: body.mirostat_tau,
            grammar: body.grammar,
            sampler_seed: body.sampler_seed,
        } as Record<string, unknown>;

        if (body.stop_sequence) {
            this_settings.stop_sequence = body.stop_sequence;
        }
    }

    console.debug(this_settings);

    const args = {
        body: JSON.stringify(this_settings),
        headers: Object.assign(
            { 'Content-Type': 'application/json' } as Record<string, string>,
            getOverrideHeaders(new URL(body.api_server as string)?.host as string),
        ),
        signal: controller.signal,
    };

    const MAX_RETRIES = 50;
    const delayAmount = 2500;

    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            const url = body.streaming
                ? `${body.api_server}/extra/generate/stream`
                : `${body.api_server}/v1/generate`;

            const response = await fetch(url, { method: 'POST', ...args });

            if (body.streaming) {
                // Pipe remote SSE stream through to the client
                let statusCode = response.status;
                if (statusCode === 401) {
                    statusCode = 400;
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    console.warn(
                        `Kobold returned error: ${response.status} ${response.statusText} ${errorText}`,
                    );
                    return new Response(errorText, { status: statusCode });
                }

                return new Response(response.body, {
                    status: statusCode,
                    headers: {
                        'Content-Type': response.headers.get('Content-Type') ?? 'text/event-stream',
                    },
                });
            }

            if (!response.ok) {
                const errorText = await response.text();
                console.warn(
                    `Kobold returned error: ${response.status} ${response.statusText} ${errorText}`,
                );

                try {
                    const errorJson = JSON.parse(errorText);
                    const message = errorJson?.detail?.msg || errorText;
                    context.set.status = 400;
                    return { error: { message } };
                } catch {
                    context.set.status = 400;
                    return { error: { message: errorText } };
                }
            }

            const data = (await response.json()) as Record<string, unknown>;
            console.debug('Endpoint response:', data);
            return data;
        } catch (error: unknown) {
            const err = error as Record<string, unknown>;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            switch (err?.status) {
                case 403:
                case 503:
                    // retry in case of temporary service issue, possibly caused by a queue failure
                    console.warn(`KoboldAI is busy. Retry attempt ${i + 1} of ${MAX_RETRIES}...`);
                    await delay(delayAmount);
                    break;
                default:
                    if (err && 'status' in err) {
                        console.error('Status Code from Kobold:', err.status);
                    }
                    return { error: true };
            }
        }
    }

    console.error('Max retries exceeded. Giving up.');
    return { error: true };
});

router.post('/status', async (context) => {
    const body = context.body as Record<string, unknown> | null;
    if (!body) {
        context.set.status = 400;
        return;
    }

    let api_server = body.api_server as string;
    if (api_server.indexOf('localhost') != -1) {
        api_server = api_server.replace('localhost', '127.0.0.1');
    }

    const user = context.user as Record<string, unknown> | null;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    setAdditionalHeadersByType(
        headers,
        (body.api_type as string) || '',
        api_server,
        (user?.directories as UserDirectoryList) || null,
        body.secret_id as string | null,
    );

    const result: Record<string, unknown> = {};

    const [koboldUnitedResponse, koboldExtraResponse, koboldModelResponse] = await Promise.all([
        // Kobold United API version
        fetch(`${api_server}/v1/info/version`)
            .then((response) => {
                if (!response.ok)
                    throw new Error(`Kobold API error: ${(response.status, response.statusText)}`);
                return response.json();
            })
            .catch(() => ({ result: '0.0.0' })),

        // KoboldCpp version
        fetch(`${api_server}/extra/version`)
            .then((response) => {
                if (!response.ok)
                    throw new Error(`Kobold API error: ${(response.status, response.statusText)}`);
                return response.json();
            })
            .catch(() => ({ version: '0.0' })),

        // Current model
        fetch(`${api_server}/v1/model`)
            .then((response) => {
                if (!response.ok)
                    throw new Error(`Kobold API error: ${(response.status, response.statusText)}`);
                return response.json();
            })
            .catch(() => null),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    result.koboldUnitedVersion = (koboldUnitedResponse as Record<string, unknown>).result;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    result.koboldCppVersion = (koboldExtraResponse as Record<string, unknown>).result;
    result.model =
        !koboldModelResponse ||
        (koboldModelResponse as Record<string, unknown>).result === 'ReadOnly'
            ? 'no_connection'
            : (koboldModelResponse as Record<string, unknown>).result;

    return result;
});

router.post('/transcribe-audio', async (context) => {
    try {
        const body = context.body as Record<string, unknown>;
        const server = body.server as string | undefined;

        if (!server) {
            console.error('Server is not set');
            context.set.status = 400;
            return;
        }

        const file = context.file as Record<string, unknown> | null;

        if (!file) {
            console.error('No audio file found');
            context.set.status = 400;
            return;
        }

        console.debug('Transcribing audio with KoboldCpp', server);

        const fileBuffer = await Bun.file(file.path as string).arrayBuffer();
        const fileBase64 = Buffer.from(fileBuffer).toString('base64');
        fs.unlinkSync(file.path as string);

        const headers: Record<string, string> = {};
        const user = context.user as Record<string, unknown> | null;
        setAdditionalHeadersByType(
            headers,
            TEXTGEN_TYPES.KOBOLDCPP,
            server,
            (user?.directories as UserDirectoryList) || null,
        );

        const url = new URL(server);
        url.pathname = '/api/extra/transcribe';

        const result = await fetch(url, {
            method: 'POST',
            headers: {
                ...headers,
            },
            body: JSON.stringify({
                prompt: '',
                audio_data: fileBase64,
            }),
        });

        if (!result.ok) {
            const text = await result.text();
            console.error('KoboldCpp request failed', result.statusText, text);
            context.set.status = 500;
            return text;
        }

        const data = (await result.json()) as Record<string, unknown>;
        console.debug('KoboldCpp transcription response', data);
        return data;
    } catch (error) {
        console.error('KoboldCpp transcription failed', error);
        context.set.status = 500;
        return 'Internal server error';
    }
});

router.post('/embed', async (context) => {
    try {
        const body = context.body as Record<string, unknown>;
        const server = body.server as string | undefined;
        const items = body.items;

        if (!server) {
            console.warn('KoboldCpp URL is not set');
            context.set.status = 400;
            return;
        }

        const headers: Record<string, string> = {};
        const user = context.user as Record<string, unknown> | null;
        setAdditionalHeadersByType(
            headers,
            TEXTGEN_TYPES.KOBOLDCPP,
            server,
            (user?.directories as UserDirectoryList) || null,
        );

        const embeddingsUrl = new URL(server);
        embeddingsUrl.pathname = '/api/extra/embeddings';

        const embeddingsResult = await fetch(embeddingsUrl, {
            method: 'POST',
            headers: {
                ...headers,
            },
            body: JSON.stringify({
                input: items,
            }),
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- API response shape unknown, needs dynamic access
        const data = (await embeddingsResult.json()) as any;

        if (!Array.isArray(data?.data)) {
            console.warn('KoboldCpp API response was not an array');
            context.set.status = 500;
            return;
        }

        const model = data.model || 'unknown';
        const embeddings = data.data
            .map((x: unknown) => (Array.isArray(x) ? x[0] : x))
            .toSorted((a: { index: number }, b: { index: number }) => a.index - b.index)
            .map((x: { embedding: unknown }) => x.embedding);
        return { model, embeddings };
    } catch (error) {
        console.error('KoboldCpp embedding failed', error);
        context.set.status = 500;
        return 'Internal server error';
    }
});
