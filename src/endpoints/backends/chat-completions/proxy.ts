import { forwardFetchResponse } from '../../../util.js';
import { setAdditionalHeaders } from '../../../additional-headers.js';

/**
 * Options for the shared proxy request helper.
 */
export interface ProxyRequestOptions {
    request: import('express').Request;
    response: import('express').Response;
    url: string;
    body: string;
    headers: Record<string, string>;
    signal: AbortSignal;
    stream: boolean;
    streamHandler?: (
        fetchResponse: any,
        request: import('express').Request,
        response: import('express').Response,
    ) => Promise<void>;
    transformResponse?: (data: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Single-entry HTTP proxy for chat-completion backends.
 *
 * Builds request args, attaches additional headers, dispatches the fetch,
 * and handles streaming / non-streaming / error paths in one place.
 */
export async function proxyRequest(options: ProxyRequestOptions): Promise<void> {
    const { request, response, url, body, headers, signal, stream, streamHandler, transformResponse } = options;

    const args: Record<string, unknown> = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
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
            // @ts-expect-error TS(2345) — web Response vs node-fetch Response; works on Bun
            await forwardFetchResponse(fetchResponse, response);
        } else {
            const reply = await globalThis.fetch(url, args as RequestInit);

            if (reply.ok) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let data = await reply.json() as any;
                console.debug('Chat completion response:', data);

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
        const text = error?.error ?? error?.statusText ?? error?.message ?? 'Unknown error on proxy request';
        const value = { error: true, status, response: text };
        console.error('Request error:', error);

        if (!response.headersSent) {
            response.send(value);
        } else {
            response.end();
        }
    }
}
