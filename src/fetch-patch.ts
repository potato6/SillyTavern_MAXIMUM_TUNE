// @ts-expect-error TS(1192) FIXME: Module '"node:fs"' has no default export.
import fs from 'node:fs';
// @ts-expect-error TS(1259) FIXME: Module '"node:path"' can only be default-imported ... Remove this comment to see the full error message
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error TS(1192) FIXME: Module '"/mnt/DISCO/downloads/some_git_projects/Si... Remove this comment to see the full error message
import mime from 'mime-types';
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
            'Content-Type': mime.lookup(fileName) || 'application/octet-stream',
            'Content-Length': buffer.length.toString(),
        },
    });
    return response;
};
