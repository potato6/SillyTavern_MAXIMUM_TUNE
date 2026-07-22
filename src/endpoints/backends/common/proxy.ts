import { forwardFetchResponse } from '../../../util.js';
import { setAdditionalHeaders } from '../../../additional-headers.js';

/**
 * Options for the shared proxy request helper.
 */
export interface ProxyRequestOptions {
    /** Original Express request — used for additional headers and abort events. */
    request: import('express').Request;
    /** Express response to write to. */
    response: import('express').Response;
    /** Full URL (base + endpoint path). */
    url: string;
    /** Pre-serialised JSON body string. */
    body: string;
    /** Abort signal (from the outer controller). */
    signal: AbortSignal;
    /** Whether the upstream expects a streaming response. */
    stream: boolean;
    /** Extra request headers (merged with Content-Type). */
    headers?: Record<string, string>;
    /**
     * Provider-specific stream handler (e.g. Ollama's NDJSON → SSE parser).
     * When absent the raw fetch body is piped via forwardFetchResponse.
     */
    streamHandler?: (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchResponse: any,
        request: import('express').Request,
        response: import('express').Response,
    ) => Promise<void>;
    /** Optional response transform for non-streaming replies. */
    transformResponse?: (data: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Single-entry HTTP proxy for backend providers.
 *
 * Builds request args, attaches additional headers, dispatches the fetch,
 * and handles streaming / non-streaming / error paths in one place.
 * @param options
 */
export async function proxyRequest(options: ProxyRequestOptions): Promise<void> {
    const { request, response, url, body, signal, stream, streamHandler, transformResponse } =
        options;
    const extraHeaders = options.headers ?? {};

    const args: Record<string, unknown> = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...extraHeaders },
        signal,
        body,
    };

    setAdditionalHeaders(request, args, request.body.api_server);

    try {
        if (stream && streamHandler) {
            const fetchResponse = await globalThis.fetch(url, args as RequestInit);
            await streamHandler(fetchResponse, request, response);
        } else if (stream) {
            const fetchResponse = await globalThis.fetch(url, args as RequestInit);
            await forwardFetchResponse(fetchResponse, response);
        } else {
            const reply = await globalThis.fetch(url, args as RequestInit);

            if (reply.ok) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let data = (await reply.json()) as any;
                console.debug('Backend response:', data);

                if (transformResponse) {
                    data = transformResponse(data);
                }

                if (!response.headersSent) {
                    response.send(data);
                }
            } else {
                const text = await reply.text();
                const errorBody = { error: true, status: reply.status, response: text };
                if (!response.headersSent) {
                    response.send(errorBody);
                } else {
                    response.end();
                }
            }
        }
    } catch (error) {
        // @ts-expect-error TS(2571) — unknown catch
        const status = error?.status ?? error?.code ?? 'UNKNOWN';
        // @ts-expect-error TS(2571) — unknown catch
        const text =
            error?.error ?? error?.statusText ?? error?.message ?? 'Unknown error on proxy request';
        const value = { error: true, status, response: text };
        console.error('Request error:', error);

        if (!response.headersSent) {
            response.send(value);
        } else {
            response.end();
        }
    }
}
