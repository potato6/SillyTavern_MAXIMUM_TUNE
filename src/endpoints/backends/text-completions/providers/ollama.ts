import { Readable } from 'node:stream';
import { TEXTGEN_TYPES, OLLAMA_KEYS } from '../../../../constants.js';
import { pickBy } from 'es-toolkit/compat';
import { getConfigValue } from '../../../../util.js';
import type { BackendProvider } from '../types.js';

const provider: BackendProvider = {
    type: TEXTGEN_TYPES.OLLAMA,
    endpoints: { status: '/api/tags', generate: '/api/generate' },

    buildGenerateBody(body: Record<string, unknown>): Record<string, unknown> {
        // @ts-expect-error TS(2345) — getConfigValue signature accepts null|undefined for default
        const keepAlive = Number(getConfigValue('ollama.keepAlive', -1, 'number'));
        // @ts-expect-error TS(2345) — getConfigValue signature accepts null|undefined for default
        const numBatch = Number(getConfigValue('ollama.batchSize', -1, 'number'));
        const options = pickBy(body, (_, key) => OLLAMA_KEYS.includes(key)) as Record<string, unknown>;

        if (numBatch > 0) {
            options.num_batch = numBatch;
        }

        return {
            model: body.model as string,
            prompt: body.prompt as string,
            stream: body.stream ?? false,
            keep_alive: keepAlive,
            raw: true,
            options,
        };
    },

    buildStatusResponse(data: unknown) {
        // Ollama returns { models: [...] } — rewrap to OAI { data: [...] }
        const obj = data as Record<string, unknown> | null;
        if (obj && Array.isArray(obj.models)) {
            return {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data: (obj.models as any[]).map((x) => ({
                    id: x.name,
                    ...x,
                })),
            };
        }
        return data;
    },

    stream: parseOllamaStream,
};

/**
 * Parse Ollama's NDJSON stream into SSE chunks the client expects.
 * Ollama sends one JSON object per line (not `data: ...`-prefixed SSE).
 */
export async function parseOllamaStream(
    jsonStream: { body: import('node:stream').Readable | ReadableStream | null },
    request: import('express').Request,
    response: import('express').Response,
): Promise<void> {
    try {
        if (!jsonStream.body) {
            throw new Error('No body in the response');
        }

        // Bun: Response.body is a Web ReadableStream without .on('data').
        const body: Readable = typeof (jsonStream.body as any).on === 'function'
            ? jsonStream.body as unknown as Readable
            : (Readable.fromWeb as any)(jsonStream.body);

        let partialData = '';
        body.on('data', (data: Buffer) => {
            const chunk = data.toString();
            partialData += chunk;
            while (true) {
                let json;
                try {
                    json = JSON.parse(partialData);
                } catch {
                    break;
                }
                const text = json.response || '';
                const thinking = json.thinking || '';
                const out = { choices: [{ text, thinking }] };
                response.write(`data: ${JSON.stringify(out)}\n\n`);
                partialData = '';
            }
        });

        request.socket.on('close', function () {
            if (body instanceof Readable) body.destroy();
            response.end();
        });

        body.on('end', () => {
            console.info('Streaming request finished');
            response.write('data: [DONE]\n\n');
            response.end();
        });
    } catch (error) {
        console.error('Error forwarding streaming response:', error);
        if (!response.headersSent) {
            response.status(500).send({ error: true });
        } else {
            response.end();
        }
    }
}

export default provider;
