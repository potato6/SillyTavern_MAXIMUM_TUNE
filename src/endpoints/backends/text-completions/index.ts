import express from 'express';

import { TEXTGEN_TYPES } from '../../../constants.js';
import { trimV1 } from '../../../util.js';
import { setAdditionalHeaders } from '../../../additional-headers.js';
import { getProvider, getRegisteredTypes } from './registry.js';
import { PROVIDER_ENDPOINTS } from './types.js';
import { proxyRequest } from '../common/proxy.js';

export const router = express.Router();

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
 * @param request
 * @param url
 */
async function abortKoboldCppRequest(request: import('express').Request, url: string) {
    try {
        console.info('Aborting Kobold generation...');
        const args = { method: 'POST' as const, headers: {} as Record<string, string> };
        setAdditionalHeaders(request, args, url);
        const abortResponse = await globalThis.fetch(`${url}/api/extra/abort`, args);
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

// ── Status ─────────────────────────────────────────────────────────────────────

router.post('/status', async function (request, response) {
    if (!request.body) return response.sendStatus(400);

    try {
        if (request.body.api_server.indexOf('localhost') !== -1) {
            request.body.api_server = request.body.api_server.replace('localhost', '127.0.0.1');
        }

        console.debug('Trying to connect to API', request.body);
        const baseUrl = trimV1(request.body.api_server);
        const apiType = request.body.api_type;

        const args = { headers: { 'Content-Type': 'application/json' } as Record<string, string> };
        setAdditionalHeaders(request, args, baseUrl);

        // URL from centralised config — no switch.
        const endpoints = PROVIDER_ENDPOINTS[apiType];
        if (!endpoints) {
            return response
                .status(400)
                .send({ result: 'no_connection', response: `Unknown API type: ${apiType}` });
        }
        const url = baseUrl + endpoints.status;

        const modelsReply = await globalThis.fetch(url, args);
        const isPossiblyLmStudio = modelsReply.headers.get('x-powered-by') === 'Express';

        if (!modelsReply.ok) {
            console.error(`Models endpoint returned HTTP ${modelsReply.status}`);
            return response.status(400).json({
                result: 'no_connection',
                response: `API returned an error: HTTP ${modelsReply.status}`,
            });
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
            return response.sendStatus(400);
        }

        const modelIds = data.data.map((x: { id: string }) => x.id);
        console.info('Models available:', modelIds);

        let result = modelIds[0] || 'Valid';

        // Ooba: extra model info (skip LM Studio look-alike).
        if (apiType === TEXTGEN_TYPES.OOBA && !isPossiblyLmStudio && provider.getModelId) {
            const modelName = await provider.getModelId(baseUrl, args.headers);
            if (modelName) {
                result = modelName;
                response.setHeader('x-supports-tokenization', 'true');
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

        return response.send({ result, data: data.data });
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

// ── Props ──────────────────────────────────────────────────────────────────────

router.post('/props', async function (request, response) {
    if (!request.body.api_server) return response.sendStatus(400);

    try {
        const baseUrl = trimV1(request.body.api_server);
        const apiType = request.body.api_type;

        const args = { headers: {} as Record<string, string> };
        setAdditionalHeaders(request, args, baseUrl);

        let propsUrl = baseUrl + '/props';
        if (apiType === TEXTGEN_TYPES.LLAMACPP && request.body.model) {
            propsUrl += `?model=${encodeURIComponent(request.body.model)}`;
            console.debug(
                `Querying llama-server props with model parameter: ${request.body.model}`,
            );
        }

        const propsReply = await globalThis.fetch(propsUrl, args);
        if (!propsReply.ok) return response.sendStatus(400);

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
        return response.send(props);
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

// ── Generate ───────────────────────────────────────────────────────────────────

router.post('/generate', async function (request, response) {
    if (!request.body) return response.sendStatus(400);

    try {
        if (request.body.api_server.indexOf('localhost') !== -1) {
            request.body.api_server = request.body.api_server.replace('localhost', '127.0.0.1');
        }

        const apiType = request.body.api_type;
        const baseUrl = request.body.api_server;
        console.debug(request.body);

        // Abort handling.
        const controller = new AbortController();
        request.socket.removeAllListeners('close');
        request.socket.on('close', async function () {
            if (apiType === TEXTGEN_TYPES.KOBOLDCPP && !response.writableEnded) {
                await abortKoboldCppRequest(request, trimV1(baseUrl));
            }
            controller.abort();
        });

        // URL from centralised config — no switch.
        const endpoints = PROVIDER_ENDPOINTS[apiType];
        if (!endpoints) {
            return response
                .status(400)
                .send({ error: true, status: 'UNKNOWN', response: `Unknown API type: ${apiType}` });
        }

        const url = trimV1(baseUrl) + endpoints.generate;
        const provider = await getProvider(apiType);
        const body = provider.buildGenerateBody
            ? provider.buildGenerateBody(request.body)
            : { ...request.body };

        // Single proxy call — handles fetch, streaming, error mapping, response transforms.
        await proxyRequest({
            request,
            response,
            url,
            body: JSON.stringify(body),
            signal: controller.signal,
            stream: request.body.stream,
            streamHandler: provider.stream,
            transformResponse: provider.transformGenerateResponse,
        });
    } catch (error) {
        // @ts-expect-error TS(2571) — unknown catch
        const status = error?.status ?? error?.code ?? 'UNKNOWN';
        // @ts-expect-error TS(2571) — unknown catch
        const text =
            error?.error ??
            error?.statusText ??
            error?.message ??
            'Unknown error on /generate endpoint';
        const value = { error: true, status, response: text };
        console.error('Endpoint error:', error);

        return !response.headersSent ? response.send(value) : response.end();
    }
});

// ── Provider-specific sub-routers ─────────────────────────────────────────────
// These expose distinct endpoints (download, caption-image, slots, etc.) that are
// not covered by the generic BackendProvider interface.

const ollama = express.Router();

ollama.post('/download', async function (request, response) {
    try {
        if (!request.body.name || !request.body.api_server) return response.sendStatus(400);

        const name = request.body.name;
        const url = String(request.body.api_server).replace(/\/$/, '');
        console.debug('Pulling Ollama model:', name);

        const fetchResponse = await globalThis.fetch(`${url}/api/pull`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, stream: false }),
        });

        if (!fetchResponse.ok) {
            console.error('Download error:', fetchResponse.status, fetchResponse.statusText);
            return response.status(500).send({ error: true });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        console.debug('Ollama pull response:', (await fetchResponse.json()) as any);
        return response.send({ ok: true });
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

ollama.post('/caption-image', async function (request, response) {
    try {
        if (!request.body.server_url || !request.body.model) {
            return response.sendStatus(400);
        }

        console.debug('Ollama caption request:', request.body);
        const baseUrl = trimV1(request.body.server_url);

        const fetchResponse = await globalThis.fetch(`${baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: request.body.model,
                prompt: request.body.prompt,
                images: [request.body.image],
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
            return response.status(500).send({ error: true });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (await fetchResponse.json()) as any;
        console.debug('Ollama caption response:', data);

        const caption = data?.response || '';
        if (!caption) {
            console.error('Ollama caption is empty.');
            return response.status(500).send({ error: true });
        }

        return response.send({ caption });
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

const llamacpp = express.Router();

llamacpp.post('/props', async function (request, response) {
    try {
        if (!request.body.server_url) return response.sendStatus(400);

        console.debug('LlamaCpp props request:', request.body);
        const baseUrl = trimV1(request.body.server_url);

        const fetchResponse = await globalThis.fetch(`${baseUrl}/props`, { method: 'GET' });

        if (!fetchResponse.ok) {
            console.error('LlamaCpp props error:', fetchResponse.status, fetchResponse.statusText);
            return response.status(500).send({ error: true });
        }

        const data = (await fetchResponse.json()) as Record<string, unknown>;
        console.debug('LlamaCpp props response:', data);
        return response.send(data);
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

llamacpp.post('/slots', async function (request, response) {
    try {
        if (!request.body.server_url) return response.sendStatus(400);
        if (!/^(erase|info|restore|save)$/.test(request.body.action))
            return response.sendStatus(400);

        console.debug('LlamaCpp slots request:', request.body);
        const baseUrl = trimV1(request.body.server_url);

        let fetchResponse;
        if (request.body.action === 'info') {
            fetchResponse = await globalThis.fetch(`${baseUrl}/slots`, { method: 'GET' });
        } else {
            if (!/^\d+$/.test(request.body.id_slot)) return response.sendStatus(400);
            if (request.body.action !== 'erase' && !request.body.filename)
                return response.sendStatus(400);

            fetchResponse = await globalThis.fetch(
                `${baseUrl}/slots/${request.body.id_slot}?action=${request.body.action}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename:
                            request.body.action !== 'erase'
                                ? `${request.body.filename}`
                                : undefined,
                    }),
                },
            );
        }

        if (!fetchResponse.ok) {
            console.error('LlamaCpp slots error:', fetchResponse.status, fetchResponse.statusText);
            return response.status(500).send({ error: true });
        }

        const data = (await fetchResponse.json()) as Record<string, unknown>;
        console.debug('LlamaCpp slots response:', data);
        return response.send(data);
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

const tabby = express.Router();

tabby.post('/download', async function (request, response) {
    try {
        const baseUrl = String(request.body.api_server).replace(/\/$/, '');
        const args: Record<string, unknown> = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request.body),
        };

        setAdditionalHeaders(request, args, baseUrl);

        // Check key permissions.
        const permissionResponse = await globalThis.fetch(`${baseUrl}/v1/auth/permission`, {
            headers: args.headers as Record<string, string>,
        });

        if (permissionResponse.ok) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const permissionJson = (await permissionResponse.json()) as any;
            if (permissionJson.permission !== 'admin') {
                return response.status(403).send({ error: true });
            }
        } else {
            console.error(
                'API Permission error:',
                permissionResponse.status,
                permissionResponse.statusText,
            );
            return response.status(500).send({ error: true });
        }

        const fetchResponse = await globalThis.fetch(`${baseUrl}/v1/download`, args as RequestInit);
        if (!fetchResponse.ok) {
            console.error('Download error:', fetchResponse.status, fetchResponse.statusText);
            return response.status(500).send({ error: true });
        }

        return response.send({ ok: true });
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

router.use('/ollama', ollama);
router.use('/llamacpp', llamacpp);
router.use('/tabby', tabby);
