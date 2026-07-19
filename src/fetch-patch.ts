import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serverDirectory } from './server-directory.js';
import { getRequestURL, isFileURL, isPathUnderParent } from './util.js';

const originalFetch = globalThis.fetch;

const ALLOWED_EXTENSIONS = [
    '.wasm',
];

// Patched fetch function that handles file URLs
// @ts-expect-error TS(2741) FIXME: Property 'preconnect' is missing in type '(request... Remove this comment to see the full error message
globalThis.fetch = async (/** @type {string | URL | Request} */ request, /** @type {RequestInit | undefined} */ options) => {
    if (!isFileURL(request)) {
        return originalFetch(request, options);
    }
    const url = getRequestURL(request);
    const filePath = path.resolve(fileURLToPath(url));
    const isUnderServerDirectory = isPathUnderParent(serverDirectory, filePath);
    if (!isUnderServerDirectory) {
        throw new Error('Requested file path is outside of the server directory.');
    }
    const parsedPath = path.parse(filePath);
    if (!ALLOWED_EXTENSIONS.includes(parsedPath.ext)) {
        throw new Error('Unsupported file extension.');
    }
    const fileName = parsedPath.base;
    const buffer = await fs.promises.readFile(filePath);
    const response = new Response(buffer, {
        status: 200,
        statusText: 'OK',
        headers: {
            'Content-Type': Bun.file(fileName).type || 'application/octet-stream',
            'Content-Length': buffer.length.toString(),
        },
    });
    return response;
};
