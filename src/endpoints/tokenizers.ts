import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

import { Elysia } from 'elysia';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { Tokenizer } from '@agnai/web-tokenizers';
// @ts-expect-error TS(2792) FIXME: Cannot find module '@agnai/sentencepiece-js'. Did ... Remove this comment to see the full error message
import { SentencePieceProcessor } from '@agnai/sentencepiece-js';
import { encoding_for_model, type TiktokenModel } from 'tiktoken';

import { convertClaudePrompt } from '../prompt-converters.js';
import { TEXTGEN_TYPES } from '../constants.js';
import { setAdditionalHeaders } from '../additional-headers.js';
import { getConfigValue, isValidUrl } from '../util.js';
import { TEXT_COMPLETION_MODELS } from './text-completion-models.js';

const tokenizersCache = {};

const BYTES_PER_TOKEN = 3.35;
const IS_DOWNLOAD_ALLOWED = getConfigValue(
    'enableDownloadableTokenizers',
    true,
    'boolean' as const,
);
const gunzip = promisify(zlib.gunzip);

/**
 * Guesstimates the token count for a string.
 * @param {string} str String to tokenize.
 * @returns {number} Token count.
 */
function guesstimate(str: string) {
    const byteLength = Buffer.byteLength(str, 'utf8');
    return Math.ceil(byteLength / BYTES_PER_TOKEN);
}

/**
 * Gets a path to the tokenizer model. Downloads the model if it's a URL.
 * @param {string} model Model URL or path
 * @param {string|undefined} fallbackModel Fallback model path
 * @returns {Promise<string>} Path to the tokenizer model
 */
async function getPathToTokenizer(model: string, fallbackModel: string | undefined) {
    if (!isValidUrl(model)) {
        return model;
    }

    try {
        const url = new URL(model);

        if (!['https:', 'http:'].includes(url.protocol)) {
            throw new Error('Invalid URL protocol');
        }

        const fileName = url.pathname.split('/').pop();

        if (!fileName) {
            throw new Error('Failed to extract the file name from the URL');
        }

        const CACHE_PATH = path.join(globalThis.DATA_ROOT, '_cache');
        if (!fs.existsSync(CACHE_PATH)) {
            fs.mkdirSync(CACHE_PATH, { recursive: true });
        }

        // If an uncompressed version exists, return it
        const isCompressed = path.extname(fileName) === '.gz';
        const uncompressedName = path.basename(fileName, '.gz');
        const uncompressedPath = path.join(CACHE_PATH, uncompressedName);
        if (isCompressed && fs.existsSync(uncompressedPath)) {
            return uncompressedPath;
        }

        const cachedFile = path.join(CACHE_PATH, fileName);
        if (fs.existsSync(cachedFile)) {
            // If the file was downloaded manually
            if (isCompressed) {
                const compressedBuffer = await fs.promises.readFile(cachedFile);
                const decompressedBuffer = await gunzip(compressedBuffer);
                writeFileAtomicSync(uncompressedPath, decompressedBuffer);
                await fs.promises.unlink(cachedFile);
                return uncompressedPath;
            }
            return cachedFile;
        }

        if (!IS_DOWNLOAD_ALLOWED) {
            throw new Error('Downloading tokenizers is disabled, the model is not cached');
        }

        console.info('Downloading tokenizer model:', model);
        const response = await fetch(model);
        if (!response.ok) {
            throw new Error(`Failed to fetch the model: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        if (isCompressed) {
            const decompressedBuffer = await gunzip(arrayBuffer);
            writeFileAtomicSync(uncompressedPath, decompressedBuffer);
            return uncompressedPath;
        }

        writeFileAtomicSync(cachedFile, Buffer.from(arrayBuffer));
        return cachedFile;
    } catch (error) {
        const getLastSegment = (str: string) => str?.split('/')?.pop() || '';
        if (fallbackModel) {
            console.error(
                `Could not get a tokenizer from ${getLastSegment(model)}. Reason: ${(error as any).message}. Using a fallback model: ${getLastSegment(fallbackModel)}.`,
            );
            return fallbackModel;
        }

        throw new Error(
            `Failed to instantiate a tokenizer and fallback is not provided. Reason: ${(error as any).message}`,
            { cause: error },
        );
    }
}

/**
 * Sentencepiece tokenizer for tokenizing text.
 */
class SentencePieceTokenizer {
    /**
     * @type {import('@agnai/sentencepiece-js').SentencePieceProcessor} Sentencepiece tokenizer instance
     */
    // @ts-expect-error TS(7008) FIXME: Member '#instance' implicitly has an 'any' type.
    #instance;
    /**
     * @type {string} Path to the tokenizer model
     */
    #model;
    /**
     * @type {string|undefined} Path to the fallback model
     */
    #fallbackModel;

    /**
     * Creates a new Sentencepiece tokenizer.
     * @param {string} model Path to the tokenizer model
     * @param {string} [fallbackModel] Path to the fallback model
     */
    constructor(model: string, fallbackModel?: string) {
        this.#model = model;
        this.#fallbackModel = fallbackModel;
    }

    /**
     * Gets the Sentencepiece tokenizer instance.
     * @returns {Promise<import('@agnai/sentencepiece-js').SentencePieceProcessor|null>} Sentencepiece tokenizer instance
     */
    async get() {
        if (this.#instance) {
            return this.#instance;
        }

        try {
            const pathToModel = await getPathToTokenizer(this.#model, this.#fallbackModel);
            this.#instance = new SentencePieceProcessor();
            await this.#instance.load(pathToModel);
            console.info('Instantiated the tokenizer for', path.parse(pathToModel).name);
            return this.#instance;
        } catch (error) {
            console.error('Sentencepiece tokenizer failed to load: ' + this.#model, error);
            return null;
        }
    }
}

/**
 * Web tokenizer for tokenizing text.
 */
class WebTokenizer {
    /**
     * @type {Tokenizer} Web tokenizer instance
     */
    // @ts-expect-error TS(7008) FIXME: Member '#instance' implicitly has an 'any' type.
    #instance;
    /**
     * @type {string} Path to the tokenizer model
     */
    #model;
    /**
     * @type {string|undefined} Path to the fallback model
     */
    #fallbackModel;

    /**
     * Creates a new Web tokenizer.
     * @param {string} model Path to the tokenizer model
     * @param {string} [fallbackModel] Path to the fallback model
     */
    constructor(model: string, fallbackModel?: string) {
        this.#model = model;
        this.#fallbackModel = fallbackModel;
    }

    /**
     * Gets the Web tokenizer instance.
     * @returns {Promise<Tokenizer|null>} Web tokenizer instance
     */
    async get() {
        if (this.#instance) {
            return this.#instance;
        }

        try {
            const pathToModel = await getPathToTokenizer(this.#model, this.#fallbackModel);
            const fileBuffer = await fs.promises.readFile(pathToModel);
            this.#instance = await Tokenizer.fromJSON(
                fileBuffer.buffer.slice(
                    fileBuffer.byteOffset,
                    fileBuffer.byteOffset + fileBuffer.byteLength,
                ),
            );
            console.info('Instantiated the tokenizer for', path.parse(pathToModel).name);
            return this.#instance;
        } catch (error) {
            console.error('Web tokenizer failed to load: ' + this.#model, error);
            return null;
        }
    }
}

const spp_llama = new SentencePieceTokenizer('src/tokenizers/llama.model');
const spp_nerd = new SentencePieceTokenizer('src/tokenizers/nerdstash.model');
const spp_nerd_v2 = new SentencePieceTokenizer('src/tokenizers/nerdstash_v2.model');
const spp_mistral = new SentencePieceTokenizer('src/tokenizers/mistral.model');
const spp_yi = new SentencePieceTokenizer('src/tokenizers/yi.model');
const spp_gemma = new SentencePieceTokenizer('src/tokenizers/gemma.model');
const spp_jamba = new SentencePieceTokenizer('src/tokenizers/jamba.model');
const claude_tokenizer = new WebTokenizer('src/tokenizers/claude.json');
const llama3_tokenizer = new WebTokenizer('src/tokenizers/llama3.json');
const commandRTokenizer = new WebTokenizer(
    'https://github.com/SillyTavern/SillyTavern-Tokenizers/raw/main/command-r.json.gz',
    'src/tokenizers/llama3.json',
);
const commandATokenizer = new WebTokenizer(
    'https://github.com/SillyTavern/SillyTavern-Tokenizers/raw/main/command-a.json.gz',
    'src/tokenizers/llama3.json',
);
const qwen2Tokenizer = new WebTokenizer(
    'https://github.com/SillyTavern/SillyTavern-Tokenizers/raw/main/qwen2.json.gz',
    'src/tokenizers/llama3.json',
);
const nemoTokenizer = new WebTokenizer(
    'https://github.com/SillyTavern/SillyTavern-Tokenizers/raw/main/nemo.json.gz',
    'src/tokenizers/llama3.json',
);
const deepseekTokenizer = new WebTokenizer(
    'https://github.com/SillyTavern/SillyTavern-Tokenizers/raw/main/deepseek.json.gz',
    'src/tokenizers/llama3.json',
);

export const sentencepieceTokenizers = [
    'llama',
    'nerdstash',
    'nerdstash_v2',
    'mistral',
    'yi',
    'gemma',
    'jamba',
];

export const webTokenizers = [
    'claude',
    'llama3',
    'command-r',
    'command-a',
    'qwen2',
    'nemo',
    'deepseek',
];

/**
 * Gets the Sentencepiece tokenizer by the model name.
 * @param {string} model Sentencepiece model name
 * @returns {SentencePieceTokenizer|null} Sentencepiece tokenizer
 */
export function getSentencepiceTokenizer(model: string) {
    if (model.includes('llama')) {
        return spp_llama;
    }

    if (model.includes('nerdstash')) {
        return spp_nerd;
    }

    if (model.includes('mistral')) {
        return spp_mistral;
    }

    if (model.includes('nerdstash_v2')) {
        return spp_nerd_v2;
    }

    if (model.includes('yi')) {
        return spp_yi;
    }

    if (model.includes('gemma')) {
        return spp_gemma;
    }

    if (model.includes('jamba')) {
        return spp_jamba;
    }

    return null;
}

/**
 * Gets the Web tokenizer by the model name.
 * @param {string} model Web tokenizer model name
 * @returns {WebTokenizer|null} Web tokenizer
 */
export function getWebTokenizer(model: string) {
    if (model.includes('llama3')) {
        return llama3_tokenizer;
    }

    if (model.includes('claude')) {
        return claude_tokenizer;
    }

    if (model.includes('command-r')) {
        return commandRTokenizer;
    }

    if (model.includes('command-a')) {
        return commandATokenizer;
    }

    if (model.includes('qwen2')) {
        return qwen2Tokenizer;
    }

    if (model.includes('nemo')) {
        return nemoTokenizer;
    }

    if (model.includes('deepseek')) {
        return deepseekTokenizer;
    }

    return null;
}

/**
 * Counts the token ids for the given text using the Sentencepiece tokenizer.
 * @param {SentencePieceTokenizer} tokenizer Sentencepiece tokenizer
 * @param {string} text Text to tokenize
 * @returns { Promise<{ids: number[], count: number}> } Tokenization result
 */
async function countSentencepieceTokens(tokenizer: SentencePieceTokenizer, text: string) {
    const instance = await tokenizer?.get();

    // Fallback to strlen estimation
    if (!instance) {
        return {
            ids: [],
            count: guesstimate(text),
        };
    }

    const cleaned = text; // cleanText(text); <-- cleaning text can result in an incorrect tokenization

    const ids = instance.encodeIds(cleaned);
    return {
        ids,
        count: ids.length,
    };
}

/* Counts the tokens in the given array of objects using the Sentencepiece tokenizer.
 * @param {SentencePieceTokenizer} tokenizer Sentencepiece tokenizer instance
 * @param {object[]} array Array of objects to tokenize
 * @returns {Promise<number>} Number of tokens
 */
/**
 *
 * @param tokenizer
 * @param array
 */
async function countSentencepieceArrayTokens(tokenizer: SentencePieceTokenizer, array: object[]) {
    // @ts-expect-error TS(2345) FIXME: Argument of type '(x: Record<string, unknown>) => ... Remove this comment to see the full error message
    const jsonBody = array.flatMap((x: Record<string, unknown>) => Object.values(x)).join('\n\n');
    const result = await countSentencepieceTokens(tokenizer, jsonBody);
    const num_tokens = result.count;
    return num_tokens;
}

/**
 * Gets the token chunks for the given token IDs using the Tiktoken tokenizer.
 * @param {import('tiktoken').Tiktoken} tokenizer Tiktoken tokenizer instance
 * @param {number[]} ids Token IDs
 * @returns {Promise<string[]>} Token chunks
 */
async function getTiktokenChunks(tokenizer: import('tiktoken').Tiktoken, ids: number[]) {
    const decoder = new TextDecoder();
    const chunks = [];

    for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        // @ts-expect-error TS(2769) FIXME: No overload matches this call.
        const chunkTextBytes = await tokenizer.decode(new Uint32Array([id]));
        const chunkText = decoder.decode(chunkTextBytes);
        chunks.push(chunkText);
    }

    return chunks;
}

/**
 * Gets the token chunks for the given token IDs using the Web tokenizer.
 * @param {Tokenizer} tokenizer Web tokenizer instance
 * @param {number[]} ids Token IDs
 * @returns {string[]} Token chunks
 */
function getWebTokenizersChunks(tokenizer: Tokenizer, ids: number[]) {
    const chunks = [];

    for (let i = 0, lastProcessed = 0; i < ids.length; i++) {
        const chunkIds = ids.slice(lastProcessed, i + 1);
        const chunkText = tokenizer.decode(new Int32Array(chunkIds));
        if (chunkText === '�') {
            continue;
        }
        chunks.push(chunkText);
        lastProcessed = i + 1;
    }

    return chunks;
}

/**
 * Gets the tokenizer model by the model name.
 * @param {string} requestModel Models to use for tokenization
 * @returns {string} Tokenizer model to use
 */
export function getTokenizerModel(requestModel: string) {
    if (
        requestModel === 'o1' ||
        requestModel.includes('o1-preview') ||
        requestModel.includes('o1-mini') ||
        requestModel.includes('o3-mini')
    ) {
        return 'o1';
    }

    if (
        requestModel.includes('gpt-5') ||
        requestModel.includes('o3') ||
        requestModel.includes('o4-mini')
    ) {
        return 'o1';
    }

    if (requestModel.includes('gpt-4o') || requestModel.includes('chatgpt-4o-latest')) {
        return 'gpt-4o';
    }

    if (requestModel.includes('gpt-4.1') || requestModel.includes('gpt-4.5')) {
        return 'gpt-4o';
    }

    if (requestModel.includes('gpt-4-32k')) {
        return 'gpt-4-32k';
    }

    if (requestModel.includes('gpt-4')) {
        return 'gpt-4';
    }

    if (requestModel.includes('gpt-3.5-turbo-0301')) {
        return 'gpt-3.5-turbo-0301';
    }

    if (requestModel.includes('gpt-3.5-turbo')) {
        return 'gpt-3.5-turbo';
    }

    if (TEXT_COMPLETION_MODELS.includes(requestModel)) {
        return requestModel;
    }

    if (requestModel.includes('claude')) {
        return 'claude';
    }

    if (requestModel.includes('llama3') || requestModel.includes('llama-3')) {
        return 'llama3';
    }

    if (requestModel.includes('llama')) {
        return 'llama';
    }

    if (requestModel.includes('mistral')) {
        return 'mistral';
    }

    if (requestModel.includes('yi')) {
        return 'yi';
    }

    if (requestModel.includes('deepseek')) {
        return 'deepseek';
    }

    if (
        requestModel.includes('gemma') ||
        requestModel.includes('gemini') ||
        requestModel.includes('learnlm')
    ) {
        return 'gemma';
    }

    if (requestModel.includes('jamba')) {
        return 'jamba';
    }

    if (requestModel.includes('qwen2')) {
        return 'qwen2';
    }

    if (requestModel.includes('command-r')) {
        return 'command-r';
    }

    if (requestModel.includes('command-a')) {
        return 'command-a';
    }

    if (requestModel.includes('nemo')) {
        return 'nemo';
    }

    // default
    return 'gpt-3.5-turbo';
}

/**
 * Gets a Tiktoken tokenizer by model name, using a cache.
 * @param {string} model Tiktoken model name
 * @returns {import('tiktoken').Tiktoken} Tiktoken tokenizer
 */
export function getTiktokenTokenizer(model: string) {
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    if (tokenizersCache[model]) {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        return tokenizersCache[model];
    }

    const tokenizer = encoding_for_model(model as TiktokenModel);
    console.info('Instantiated the tokenizer for', model);
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    tokenizersCache[model] = tokenizer;
    return tokenizer;
}

/**
 * Counts the tokens for the given messages using the WebTokenizer and Claude prompt conversion.
 * @param {Tokenizer} tokenizer Web tokenizer
 * @param {object[]} messages Array of messages
 * @returns {number} Number of tokens
 */
export function countWebTokenizerTokens(tokenizer: Tokenizer | null, messages: object[]) {
    // Should be fine if we use the old conversion method instead of the messages API one i think?
    const convertedPrompt = convertClaudePrompt(messages, false, '', false, false, '', false);

    // Fallback to strlen estimation
    if (!tokenizer) {
        return guesstimate(convertedPrompt);
    }

    const count = tokenizer.encode(convertedPrompt).length;
    return count;
}

/**
 * Creates an API handler for encoding Sentencepiece tokens.
 * @param {SentencePieceTokenizer} tokenizer Sentencepiece tokenizer
 * @returns {TokenizationHandler} Handler function
 */
function createSentencepieceEncodingHandler(tokenizer: SentencePieceTokenizer): any {
    return async function ({ body, set }: { body: any; set: any }) {
        try {
            if (!body) {
                set.status = 400;
                return;
            }

            const text = body.text || '';
            const instance = await tokenizer?.get();
            const { ids, count } = await countSentencepieceTokens(tokenizer, text);
            const chunks = instance?.encodePieces(text);
            return { ids, count, chunks };
        } catch (error) {
            console.error(error);
            return { ids: [], count: 0, chunks: [] };
        }
    };
}

/**
 * Creates an API handler for decoding Sentencepiece tokens.
 * @param {SentencePieceTokenizer} tokenizer Sentencepiece tokenizer
 * @returns {TokenizationHandler} Handler function
 */
function createSentencepieceDecodingHandler(tokenizer: SentencePieceTokenizer): any {
    return async function ({ body, set }: { body: any; set: any }) {
        try {
            if (!body) {
                set.status = 400;
                return;
            }

            const ids = body.ids || [];
            const instance = await tokenizer?.get();
            if (!instance) throw new Error('Failed to load the Sentencepiece tokenizer');
            const ops = ids.map((id: unknown) => instance.decodeIds([id]));
            const chunks = await Promise.all(ops);
            const text = chunks.join('');
            return { text, chunks };
        } catch (error) {
            console.error(error);
            return { text: '', chunks: [] };
        }
    };
}

/**
 * Creates an API handler for encoding Tiktoken tokens.
 * @param {string} modelId Tiktoken model ID
 * @returns {TokenizationHandler} Handler function
 */
function createTiktokenEncodingHandler(modelId: string): any {
    return async function ({ body, set }: { body: any; set: any }) {
        try {
            if (!body) {
                set.status = 400;
                return;
            }

            const text = body.text || '';
            const tokenizer = getTiktokenTokenizer(modelId);
            const tokens = Object.values(tokenizer.encode(text));
            const chunks = await getTiktokenChunks(tokenizer, tokens as number[]);
            return { ids: tokens, count: tokens.length, chunks };
        } catch (error) {
            console.error(error);
            return { ids: [], count: 0, chunks: [] };
        }
    };
}

/**
 * Creates an API handler for decoding Tiktoken tokens.
 * @param {string} modelId Tiktoken model ID
 * @returns {TokenizationHandler} Handler function
 */
function createTiktokenDecodingHandler(modelId: string): any {
    return async function ({ body, set }: { body: any; set: any }) {
        try {
            if (!body) {
                set.status = 400;
                return;
            }

            const ids = body.ids || [];
            const tokenizer = getTiktokenTokenizer(modelId);
            const textBytes = tokenizer.decode(new Uint32Array(ids));
            const text = new TextDecoder().decode(textBytes);
            return { text };
        } catch (error) {
            console.error(error);
            return { text: '' };
        }
    };
}

/**
 * Creates an API handler for encoding WebTokenizer tokens.
 * @param {WebTokenizer} tokenizer WebTokenizer instance
 * @returns {TokenizationHandler} Handler function
 */
function createWebTokenizerEncodingHandler(tokenizer: WebTokenizer): any {
    return async function ({ body, set }: { body: any; set: any }) {
        try {
            if (!body) {
                set.status = 400;
                return;
            }

            const text = body.text || '';
            const instance = await tokenizer?.get();
            if (!instance) throw new Error('Failed to load the Web tokenizer');
            const tokens = Array.from(instance.encode(text));
            const chunks = getWebTokenizersChunks(instance, tokens as number[]);
            return { ids: tokens, count: tokens.length, chunks };
        } catch (error) {
            console.error(error);
            return { ids: [], count: 0, chunks: [] };
        }
    };
}

/**
 * Creates an API handler for decoding WebTokenizer tokens.
 * @param {WebTokenizer} tokenizer WebTokenizer instance
 * @returns {TokenizationHandler} Handler function
 */
function createWebTokenizerDecodingHandler(tokenizer: WebTokenizer): any {
    return async function ({ body, set }: { body: any; set: any }) {
        try {
            if (!body) {
                set.status = 400;
                return;
            }

            const ids = body.ids || [];
            const instance = await tokenizer?.get();
            if (!instance) throw new Error('Failed to load the Web tokenizer');
            const chunks = getWebTokenizersChunks(instance, ids);
            const text = instance.decode(new Int32Array(ids));
            return { text, chunks };
        } catch (error) {
            console.error(error);
            return { text: '', chunks: [] };
        }
    };
}

export const router = new Elysia({ prefix: '/api/tokenizers' });

// ── Generic tokenizer endpoints (replaces per-tokenizer routes) ──────────────

/**
 * Encode text to token IDs using the tokenizer named in the request body.
 *
 * POST /api/tokenizers/encode
 * Body: { text: string, tokenizer: string }
 * Response: { ids: number[], count: number, chunks?: string[] }
 */
router.post('/encode', async (context: Record<string, unknown>) => {
    try {
        const body = context.body as Record<string, unknown>;
        const text: string = (body.text as string) || '';
        const tokenizerName: string = (body.tokenizer as string) || 'gpt-3.5-turbo';

        // SentencePiece tokenizers
        if (sentencepieceTokenizers.includes(tokenizerName)) {
            const tokenizer = getSentencepiceTokenizer(tokenizerName);
            const instance = await tokenizer?.get();
            if (!instance) {
                return { ids: [], count: guesstimate(text), chunks: [] };
            }
            const ids = instance.encodeIds(text);
            const chunks = instance.encodePieces(text);
            return { ids, count: ids.length, chunks };
        }

        // Web tokenizers
        if (webTokenizers.includes(tokenizerName)) {
            const tokenizer = getWebTokenizer(tokenizerName);
            const instance = await tokenizer?.get();
            if (!instance) {
                return { ids: [], count: guesstimate(text), chunks: [] };
            }
            const ids = Array.from(instance.encode(text));
            return { ids, count: ids.length };
        }

        // Tiktoken (OpenAI-compatible)
        const tiktokenTokenizer = getTiktokenTokenizer(tokenizerName);
        const ids = Array.from(tiktokenTokenizer.encode(text));
        return { ids, count: ids.length };
    } catch (error) {
        console.error('Generic encode error:', error);
        const body = context.body as Record<string, unknown>;
        return { ids: [], count: guesstimate((body.text as string) || '') };
    }
});

/**
 * Decode token IDs to text using the tokenizer named in the request body.
 *
 * POST /api/tokenizers/decode
 * Body: { ids: number[], tokenizer: string }
 * Response: { text: string, chunks?: string[] }
 */
router.post('/decode', async (context: Record<string, unknown>) => {
    try {
        const body = context.body as Record<string, unknown>;
        const ids: number[] = (body.ids as number[]) || [];
        const tokenizerName: string = (body.tokenizer as string) || 'gpt-3.5-turbo';

        // SentencePiece tokenizers
        if (sentencepieceTokenizers.includes(tokenizerName)) {
            const tokenizer = getSentencepiceTokenizer(tokenizerName);
            const instance = await tokenizer?.get();
            if (!instance) return { text: '', chunks: [] };
            const ops = ids.map((id: number) => instance.decodeIds([id]));
            const chunks = await Promise.all(ops);
            return { text: chunks.join(''), chunks };
        }

        // Web tokenizers
        if (webTokenizers.includes(tokenizerName)) {
            const tokenizer = getWebTokenizer(tokenizerName);
            const instance = await tokenizer?.get();
            if (!instance) return { text: '', chunks: [] };
            const text = instance.decode(new Int32Array(ids));
            return { text };
        }

        // Tiktoken
        const tiktokenTokenizer = getTiktokenTokenizer(tokenizerName);
        const decoder = new TextDecoder();
        const bytes = tiktokenTokenizer.decode(new Uint32Array(ids));
        return { text: decoder.decode(bytes) };
    } catch (error) {
        console.error('Generic decode error:', error);
        return { text: '', chunks: [] };
    }
});

/**
 * Count tokens using the tokenizer named in the request body.
 *
 * POST /api/tokenizers/count
 * Body: { text: string, tokenizer: string }
 * Response: { count: number }
 */
router.post('/count', async (context: Record<string, unknown>) => {
    try {
        const body = context.body as Record<string, unknown>;
        const text: string = (body.text as string) || '';
        const tokenizerName: string = (body.tokenizer as string) || 'gpt-3.5-turbo';

        // SentencePiece
        if (sentencepieceTokenizers.includes(tokenizerName)) {
            const tokenizer = getSentencepiceTokenizer(tokenizerName);
            if (!tokenizer) return { count: guesstimate(text) };
            const { count } = await countSentencepieceTokens(tokenizer, text);
            return { count };
        }

        // Web tokenizers
        if (webTokenizers.includes(tokenizerName)) {
            const tokenizer = getWebTokenizer(tokenizerName);
            const instance = await tokenizer?.get();
            if (!instance) return { count: guesstimate(text) };
            return { count: instance.encode(text).length };
        }

        // Tiktoken
        const tiktokenTokenizer = getTiktokenTokenizer(tokenizerName);
        return { count: tiktokenTokenizer.encode(text).length };
    } catch (error) {
        console.error('Generic count error:', error);
        const body = context.body as Record<string, unknown>;
        return { count: guesstimate((body.text as string) || '') };
    }
});

// ── Tokenizer map endpoint ────────────────────────────────────────────────────

/**
 * Returns metadata about all known tokenizers so the frontend can build
 * its lookup tables (TOKENIZER_NAME_BY_ID, ENCODE_TOKENIZERS, etc.) at
 * runtime without hardcoded lists.
 *
 * GET /api/tokenizers/map
 * Response: { tokenizers: { id: number, name: string, supportsEncode: boolean, supportsDecode: boolean }[] }
 */
router.get('/map', function (_context: Record<string, unknown>) {
    const nameToId: Record<string, number> = {
        gpt2: 1,
        llama: 3,
        nerdstash: 4,
        nerdstash_v2: 5,
        mistral: 7,
        yi: 8,
        claude: 11,
        llama3: 12,
        gemma: 13,
        jamba: 14,
        qwen2: 15,
        'command-r': 16,
        nemo: 17,
        deepseek: 18,
        'command-a': 19,
    };

    const tokenizers: {
        id: number;
        name: string;
        supportsEncode: boolean;
        supportsDecode: boolean;
    }[] = [];

    for (const name of sentencepieceTokenizers) {
        tokenizers.push({
            id: nameToId[name] ?? -1,
            name,
            supportsEncode: true,
            supportsDecode: true,
        });
    }
    for (const name of webTokenizers) {
        tokenizers.push({
            id: nameToId[name] ?? -1,
            name,
            supportsEncode: true,
            supportsDecode: true,
        });
    }
    // Tiktoken-compatible — gpt2 maps to id 1, everything else uses the openai id (2)
    tokenizers.push({ id: 1, name: 'gpt2', supportsEncode: true, supportsDecode: true });
    tokenizers.push({ id: 2, name: 'gpt-3.5-turbo', supportsEncode: true, supportsDecode: true });

    return { tokenizers };
});

// ── Legacy per-tokenizer routes (kept for backward compatibility) ────────────

router.post('/llama/encode', createSentencepieceEncodingHandler(spp_llama) as any);
router.post('/nerdstash/encode', createSentencepieceEncodingHandler(spp_nerd) as any);
router.post('/nerdstash_v2/encode', createSentencepieceEncodingHandler(spp_nerd_v2) as any);
router.post('/mistral/encode', createSentencepieceEncodingHandler(spp_mistral) as any);
router.post('/yi/encode', createSentencepieceEncodingHandler(spp_yi) as any);
router.post('/gemma/encode', createSentencepieceEncodingHandler(spp_gemma) as any);
router.post('/jamba/encode', createSentencepieceEncodingHandler(spp_jamba) as any);
router.post('/gpt2/encode', createTiktokenEncodingHandler('gpt2') as any);
router.post('/claude/encode', createWebTokenizerEncodingHandler(claude_tokenizer) as any);
router.post('/llama3/encode', createWebTokenizerEncodingHandler(llama3_tokenizer) as any);
router.post('/qwen2/encode', createWebTokenizerEncodingHandler(qwen2Tokenizer) as any);
router.post('/command-r/encode', createWebTokenizerEncodingHandler(commandRTokenizer) as any);
router.post('/command-a/encode', createWebTokenizerEncodingHandler(commandATokenizer) as any);
router.post('/nemo/encode', createWebTokenizerEncodingHandler(nemoTokenizer) as any);
router.post('/deepseek/encode', createWebTokenizerEncodingHandler(deepseekTokenizer) as any);
router.post('/llama/decode', createSentencepieceDecodingHandler(spp_llama) as any);
router.post('/nerdstash/decode', createSentencepieceDecodingHandler(spp_nerd) as any);
router.post('/nerdstash_v2/decode', createSentencepieceDecodingHandler(spp_nerd_v2) as any);
router.post('/mistral/decode', createSentencepieceDecodingHandler(spp_mistral) as any);
router.post('/yi/decode', createSentencepieceDecodingHandler(spp_yi) as any);
router.post('/gemma/decode', createSentencepieceDecodingHandler(spp_gemma) as any);
router.post('/jamba/decode', createSentencepieceDecodingHandler(spp_jamba) as any);
router.post('/gpt2/decode', createTiktokenDecodingHandler('gpt2') as any);
router.post('/claude/decode', createWebTokenizerDecodingHandler(claude_tokenizer) as any);
router.post('/llama3/decode', createWebTokenizerDecodingHandler(llama3_tokenizer) as any);
router.post('/qwen2/decode', createWebTokenizerDecodingHandler(qwen2Tokenizer) as any);
router.post('/command-r/decode', createWebTokenizerDecodingHandler(commandRTokenizer) as any);
router.post('/command-a/decode', createWebTokenizerDecodingHandler(commandATokenizer) as any);
router.post('/nemo/decode', createWebTokenizerDecodingHandler(nemoTokenizer) as any);
router.post('/deepseek/decode', createWebTokenizerDecodingHandler(deepseekTokenizer) as any);

router.post('/openai/encode', async (context: Record<string, unknown>) => {
    try {
        const query = context.query as Record<string, unknown>;
        const queryModel = String(query.model || '');

        if (queryModel.includes('llama3') || queryModel.includes('llama-3')) {
            const handler = createWebTokenizerEncodingHandler(llama3_tokenizer);
            return handler(context);
        }

        if (queryModel.includes('llama')) {
            const handler = createSentencepieceEncodingHandler(spp_llama);
            return handler(context);
        }

        if (queryModel.includes('mistral')) {
            const handler = createSentencepieceEncodingHandler(spp_mistral);
            return handler(context);
        }

        if (queryModel.includes('yi')) {
            const handler = createSentencepieceEncodingHandler(spp_yi);
            return handler(context);
        }

        if (queryModel.includes('claude')) {
            const handler = createWebTokenizerEncodingHandler(claude_tokenizer);
            return handler(context);
        }

        if (queryModel.includes('gemma') || queryModel.includes('gemini')) {
            const handler = createSentencepieceEncodingHandler(spp_gemma);
            return handler(context);
        }

        if (queryModel.includes('jamba')) {
            const handler = createSentencepieceEncodingHandler(spp_jamba);
            return handler(context);
        }

        if (queryModel.includes('qwen2')) {
            const handler = createWebTokenizerEncodingHandler(qwen2Tokenizer);
            return handler(context);
        }

        if (queryModel.includes('command-r')) {
            const handler = createWebTokenizerEncodingHandler(commandRTokenizer);
            return handler(context);
        }

        if (queryModel.includes('command-a')) {
            const handler = createWebTokenizerEncodingHandler(commandATokenizer);
            return handler(context);
        }

        if (queryModel.includes('nemo')) {
            const handler = createWebTokenizerEncodingHandler(nemoTokenizer);
            return handler(context);
        }

        if (queryModel.includes('deepseek')) {
            const handler = createWebTokenizerEncodingHandler(deepseekTokenizer);
            return handler(context);
        }

        const model = getTokenizerModel(queryModel);
        const handler = createTiktokenEncodingHandler(model);
        return handler(context);
    } catch (error) {
        console.error(error);
        return { ids: [], count: 0, chunks: [] };
    }
});

router.post('/openai/decode', async (context: Record<string, unknown>) => {
    try {
        const query = context.query as Record<string, unknown>;
        const queryModel = String(query.model || '');

        if (queryModel.includes('llama3') || queryModel.includes('llama-3')) {
            const handler = createWebTokenizerDecodingHandler(llama3_tokenizer);
            return handler(context);
        }

        if (queryModel.includes('llama')) {
            const handler = createSentencepieceDecodingHandler(spp_llama);
            return handler(context);
        }

        if (queryModel.includes('mistral')) {
            const handler = createSentencepieceDecodingHandler(spp_mistral);
            return handler(context);
        }

        if (queryModel.includes('yi')) {
            const handler = createSentencepieceDecodingHandler(spp_yi);
            return handler(context);
        }

        if (queryModel.includes('claude')) {
            const handler = createWebTokenizerDecodingHandler(claude_tokenizer);
            return handler(context);
        }

        if (queryModel.includes('gemma') || queryModel.includes('gemini')) {
            const handler = createSentencepieceDecodingHandler(spp_gemma);
            return handler(context);
        }

        if (queryModel.includes('jamba')) {
            const handler = createSentencepieceDecodingHandler(spp_jamba);
            return handler(context);
        }

        if (queryModel.includes('qwen2')) {
            const handler = createWebTokenizerDecodingHandler(qwen2Tokenizer);
            return handler(context);
        }

        if (queryModel.includes('command-r')) {
            const handler = createWebTokenizerDecodingHandler(commandRTokenizer);
            return handler(context);
        }

        if (queryModel.includes('command-a')) {
            const handler = createWebTokenizerDecodingHandler(commandATokenizer);
            return handler(context);
        }

        if (queryModel.includes('nemo')) {
            const handler = createWebTokenizerDecodingHandler(nemoTokenizer);
            return handler(context);
        }

        if (queryModel.includes('deepseek')) {
            const handler = createWebTokenizerDecodingHandler(deepseekTokenizer);
            return handler(context);
        }

        const model = getTokenizerModel(queryModel);
        const handler = createTiktokenDecodingHandler(model);
        return handler(context);
    } catch (error) {
        console.error(error);
        return { text: '' };
    }
});

router.post('/openai/count', async (context: Record<string, unknown>) => {
    try {
        const body = context.body as Record<string, unknown>;
        const set = context.set as Record<string, unknown>;
        if (!body) {
            set.status = 400;
            return;
        }

        let num_tokens = 0;
        const query = context.query as Record<string, unknown>;
        const queryModel = String(query.model || '');
        const model = getTokenizerModel(queryModel);

        if (model === 'claude') {
            const instance = await claude_tokenizer.get();
            if (!instance) throw new Error('Failed to load the Claude tokenizer');
            num_tokens = countWebTokenizerTokens(instance, body as unknown as object[]);
            return { token_count: num_tokens };
        }

        if (model === 'llama3' || model === 'llama-3') {
            const instance = await llama3_tokenizer.get();
            if (!instance) throw new Error('Failed to load the Llama3 tokenizer');
            num_tokens = countWebTokenizerTokens(instance, body as unknown as object[]);
            return { token_count: num_tokens };
        }

        if (model === 'llama') {
            num_tokens = await countSentencepieceArrayTokens(spp_llama, body as unknown as object[]);
            return { token_count: num_tokens };
        }

        if (model === 'mistral') {
            num_tokens = await countSentencepieceArrayTokens(spp_mistral, body as unknown as object[]);
            return { token_count: num_tokens };
        }

        if (model === 'yi') {
            num_tokens = await countSentencepieceArrayTokens(spp_yi, body as unknown as object[]);
            return { token_count: num_tokens };
        }

        if (model === 'gemma' || model === 'gemini') {
            num_tokens = await countSentencepieceArrayTokens(spp_gemma, body as unknown as object[]);
            return { token_count: num_tokens };
        }

        if (model === 'jamba') {
            num_tokens = await countSentencepieceArrayTokens(spp_jamba, body as unknown as object[]);
            return { token_count: num_tokens };
        }

        if (model === 'qwen2') {
            const instance = await qwen2Tokenizer.get();
            if (!instance) throw new Error('Failed to load the Qwen2 tokenizer');
            num_tokens = countWebTokenizerTokens(instance, body as unknown as object[]);
            return { token_count: num_tokens };
        }

        if (model === 'command-r') {
            const instance = await commandRTokenizer.get();
            if (!instance) throw new Error('Failed to load the Command-R tokenizer');
            num_tokens = countWebTokenizerTokens(instance, body as unknown as object[]);
            return { token_count: num_tokens };
        }

        if (model === 'command-a') {
            const instance = await commandATokenizer.get();
            if (!instance) throw new Error('Failed to load the Command-A tokenizer');
            num_tokens = countWebTokenizerTokens(instance, body as unknown as object[]);
            return { token_count: num_tokens };
        }

        if (model === 'nemo') {
            const instance = await nemoTokenizer.get();
            if (!instance) throw new Error('Failed to load the Nemo tokenizer');
            num_tokens = countWebTokenizerTokens(instance, body as unknown as object[]);
            return { token_count: num_tokens };
        }

        if (model === 'deepseek') {
            const instance = await deepseekTokenizer.get();
            if (!instance) throw new Error('Failed to load the DeepSeek tokenizer');
            num_tokens = countWebTokenizerTokens(instance, body as unknown as object[]);
            return { token_count: num_tokens };
        }

        const tokensPerName = queryModel.includes('gpt-3.5-turbo-0301') ? -1 : 1;
        const tokensPerMessage = queryModel.includes('gpt-3.5-turbo-0301') ? 4 : 3;
        const tokensPadding = 3;

        const tokenizer = getTiktokenTokenizer(model);

        for (const msg of body as unknown as object[]) {
            try {
                num_tokens += tokensPerMessage;
                for (const [key, value] of Object.entries(msg)) {
                    num_tokens += tokenizer.encode(value as string).length;
                    if (key == 'name') {
                        num_tokens += tokensPerName;
                    }
                }
            } catch {
                console.warn('Error tokenizing message:', msg);
            }
        }
        num_tokens += tokensPadding;

        // NB: Since 2023-10-14, the GPT-3.5 Turbo 0301 model shoves in 7-9 extra tokens to every message.
        // More details: https://community.openai.com/t/gpt-3-5-turbo-0301-showing-different-behavior-suddenly/431326/14
        if (queryModel.includes('gpt-3.5-turbo-0301')) {
            num_tokens += 9;
        }

        // not needed for cached tokenizers
        //tokenizer.free();

        return { token_count: num_tokens };
    } catch (error) {
        console.error('An error counting tokens, using fallback estimation method', error);
        const jsonBody = JSON.stringify(context.body);
        const num_tokens = guesstimate(jsonBody);
        return { token_count: num_tokens };
    }
});

// ── Tokenizer resolution ───────────────────────────────────────────────────────

/**
 * Resolves the tokenizer model name for a given chat-completion source and AI model.
 * Delegates to the provider's resolveTokenizer() when available;
 * otherwise falls back to the generic model-name heuristic.
 */
router.post('/resolve', async (context: Record<string, unknown>) => {
    try {
        const body = context.body as Record<string, unknown>;
        const set = context.set as Record<string, unknown>;
        const { source, model } = body as Record<string, string>;
        if (!source || !model) {
            set.status = 400;
            return { error: 'source and model are required' };
        }

        // Try the chat-completion provider first
        try {
            const { getChatProvider } = await import('./backends/chat-completions/registry.js');
            const provider = await getChatProvider(source);
            if (provider?.resolveTokenizer) {
                const tokenizer = provider.resolveTokenizer(model);
                return { tokenizer };
            }
        } catch {
            // Provider doesn't exist for this source — fall through
        }

        // Fall back to the generic model-name heuristic
        return { tokenizer: getTokenizerModel(model) };
    } catch (error) {
        console.error('Tokenizer resolution error:', error);
        const body = context.body as Record<string, unknown>;
        return { tokenizer: getTokenizerModel((body?.model as string) || '') };
    }
});

router.post('/remote/kobold/count', async (context: Record<string, unknown>) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set as Record<string, unknown>;
    if (!body) {
        set.status = 400;
        return;
    }
    const text = String(body.text) || '';
    const baseUrl = String(body.url);

    try {
        const args = {
            method: 'POST',
            body: JSON.stringify({ prompt: text }),
            headers: { 'Content-Type': 'application/json' },
        };

        let url = String(baseUrl).replace(/\/$/, '');
        url += '/extra/tokencount';

        const result = await fetch(url, args);

        if (!result.ok) {
            console.warn(`API returned error: ${result.status} ${result.statusText}`);
            return { error: true };
        }

        const data = (await result.json()) as { value: unknown; ids: unknown };
        const count = data.value;
        const ids = data.ids ?? [];
        return { count, ids };
    } catch (error) {
        console.error(error);
        return { error: true };
    }
});

router.post('/remote/textgenerationwebui/encode', async (context: Record<string, unknown>) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set as Record<string, unknown>;
    if (!body) {
        set.status = 400;
        return;
    }
    const text = String(body.text) || '';
    const baseUrl = String(body.url);
    const model = String(body.model) || '';

    try {
        const args: Record<string, unknown> = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        };

        setAdditionalHeaders(context as any, args, baseUrl);

        // Convert to string + remove trailing slash + /v1 suffix
        let url = String(baseUrl).replace(/\/$/, '').replace(/\/v1$/, '');

        switch (body.api_type) {
            case TEXTGEN_TYPES.TABBY:
                url += '/v1/token/encode';
                args.body = JSON.stringify({
                    text: text,
                    add_bos_token: false,
                    encode_special_tokens: false,
                });
                break;
            case TEXTGEN_TYPES.KOBOLDCPP:
                url += '/api/extra/tokencount';
                args.body = JSON.stringify({ prompt: text, special: false });
                break;
            case TEXTGEN_TYPES.LLAMACPP:
                url += '/tokenize';
                args.body = JSON.stringify({ model: model, content: text });
                break;
            case TEXTGEN_TYPES.VLLM:
                url += '/tokenize';
                args.body = JSON.stringify({ model: model, prompt: text });
                break;
            case TEXTGEN_TYPES.APHRODITE:
                url += '/v1/tokenize';
                args.body = JSON.stringify({ model: model, prompt: text });
                break;
            default:
                url += '/v1/internal/encode';
                args.body = JSON.stringify({ text: text });
                break;
        }

        const result = await fetch(url, args as RequestInit);

        if (!result.ok) {
            console.warn(`API returned error: ${result.status} ${result.statusText}`);
            return { error: true };
        }

        const data = (await result.json()) as {
            length?: number;
            count?: number;
            value?: number;
            tokens?: { length?: number };
            ids?: unknown[];
        };
        const count = data?.length ?? data?.count ?? data?.value ?? data?.tokens?.length;
        const ids = data?.tokens ?? data?.ids ?? [];

        return { count, ids };
    } catch (error) {
        console.error(error);
        return { error: true };
    }
});
