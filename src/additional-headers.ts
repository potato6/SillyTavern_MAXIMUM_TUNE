import { TEXTGEN_TYPES, OPENROUTER_HEADERS, FEATHERLESS_HEADERS } from './constants.js';
import { SECRET_KEYS, readSecret } from './endpoints/secrets.js';
import { getConfigValue } from './util.js';

/**
 * Gets the headers for the Mancer API.
 * @param {import('./users.js').UserDirectoryList} directories User directories
 * @param {string|null} secretId Secret ID for the request (optional, used to determine which secret to use)
 * @returns {object} Headers for the request
 */
function getMancerHeaders(directories: any, secretId = null) {
    const apiKey = readSecret(directories, SECRET_KEYS.MANCER, secretId);

    return apiKey ? ({
        'X-API-KEY': apiKey,
        'Authorization': `Bearer ${apiKey}`,
    }) : {};
}

/**
 * Gets the headers for the TogetherAI API.
 * @param {import('./users.js').UserDirectoryList} directories User directories
 * @param {string|null} secretId Secret ID for the request (optional, used to determine which secret to use)
 * @returns {object} Headers for the request
 */
function getTogetherAIHeaders(directories: any, secretId = null) {
    const apiKey = readSecret(directories, SECRET_KEYS.TOGETHERAI, secretId);

    return apiKey ? ({
        'Authorization': `Bearer ${apiKey}`,
    }) : {};
}

/**
 * Gets the headers for the InfermaticAI API.
 * @param {import('./users.js').UserDirectoryList} directories User directories
 * @param {string|null} secretId Secret ID for the request (optional, used to determine which secret to use)
 * @returns {object} Headers for the request
 */
function getInfermaticAIHeaders(directories: any, secretId = null) {
    const apiKey = readSecret(directories, SECRET_KEYS.INFERMATICAI, secretId);

    return apiKey ? ({
        'Authorization': `Bearer ${apiKey}`,
    }) : {};
}

/**
 * Gets the headers for the DreamGen API.
 * @param {import('./users.js').UserDirectoryList} directories User directories
 * @param {string|null} secretId Secret ID for the request (optional, used to determine which secret to use)
 * @returns {object} Headers for the request
 */
function getDreamGenHeaders(directories: any, secretId = null) {
    const apiKey = readSecret(directories, SECRET_KEYS.DREAMGEN, secretId);

    return apiKey ? ({
        'Authorization': `Bearer ${apiKey}`,
    }) : {};
}

/**
 * Gets the headers for the OpenRouter API.
 * @param {import('./users.js').UserDirectoryList} directories User directories
 * @param {string|null} secretId Secret ID for the request (optional, used to determine which secret to use)
 * @returns {object} Headers for the request
 */
function getOpenRouterHeaders(directories: any, secretId = null) {
    const apiKey = readSecret(directories, SECRET_KEYS.OPENROUTER, secretId);
    const baseHeaders = { ...OPENROUTER_HEADERS };

    return apiKey ? Object.assign(baseHeaders, { 'Authorization': `Bearer ${apiKey}` }) : baseHeaders;
}

/**
 * Gets the headers for the vLLM API.
 * @param {import('./users.js').UserDirectoryList} directories User directories
 * @param {string|null} secretId Secret ID for the request (optional, used to determine which secret to use)
 * @returns {object} Headers for the request
 */
function getVllmHeaders(directories: any, secretId = null) {
    const apiKey = readSecret(directories, SECRET_KEYS.VLLM, secretId);

    return apiKey ? ({
        'Authorization': `Bearer ${apiKey}`,
    }) : {};
}

/**
 * Gets the headers for the Aphrodite API.
 * @param {import('./users.js').UserDirectoryList} directories User directories
 * @param {string|null} secretId Secret ID for the request (optional, used to determine which secret to use)
 * @returns {object} Headers for the request
 */
function getAphroditeHeaders(directories: any, secretId = null) {
    const apiKey = readSecret(directories, SECRET_KEYS.APHRODITE, secretId);

    return apiKey ? ({
        'X-API-KEY': apiKey,
        'Authorization': `Bearer ${apiKey}`,
    }) : {};
}

/**
 * Gets the headers for the Tabby API.
 * @param {import('./users.js').UserDirectoryList} directories User directories
 * @param {string|null} secretId Secret ID for the request (optional, used to determine which secret to use)
 * @returns {object} Headers for the request
 */
function getTabbyHeaders(directories: any, secretId = null) {
    const apiKey = readSecret(directories, SECRET_KEYS.TABBY, secretId);

    return apiKey ? ({
        'x-api-key': apiKey,
        'Authorization': `Bearer ${apiKey}`,
    }) : {};
}

/**
 * Gets the headers for the LlamaCPP API.
 * @param {import('./users.js').UserDirectoryList} directories User directories
 * @param {string|null} secretId Secret ID for the request (optional, used to determine which secret to use)
 * @returns {object} Headers for the request
 */
function getLlamaCppHeaders(directories: any, secretId = null) {
    const apiKey = readSecret(directories, SECRET_KEYS.LLAMACPP, secretId);

    return apiKey ? ({
        'Authorization': `Bearer ${apiKey}`,
    }) : {};
}

/**
 * Gets the headers for the Ooba API.
 * @param {import('./users.js').UserDirectoryList} directories User directories
 * @param {string|null} secretId Secret ID for the request (optional, used to determine which secret to use)
 * @returns {object} Headers for the request
 */
function getOobaHeaders(directories: any, secretId = null) {
    const apiKey = readSecret(directories, SECRET_KEYS.OOBA, secretId);

    return apiKey ? ({
        'Authorization': `Bearer ${apiKey}`,
    }) : {};
}

/**
 * Gets the headers for the KoboldCpp API.
 * @param {import('./users.js').UserDirectoryList} directories
 * @param {string|null} secretId Secret ID for the request (optional, used to determine which secret to use)
 * @returns {object} Headers for the request
 */
function getKoboldCppHeaders(directories: any, secretId = null) {
    const apiKey = readSecret(directories, SECRET_KEYS.KOBOLDCPP, secretId);

    return apiKey ? ({
        'Authorization': `Bearer ${apiKey}`,
    }) : {};
}

/**
 * Gets the headers for the Featherless API.
 * @param {import('./users.js').UserDirectoryList} directories
 * @param {string|null} secretId Secret ID for the request (optional, used to determine which secret to use)
 * @returns {object} Headers for the request
 */
function getFeatherlessHeaders(directories: any, secretId = null) {
    const apiKey = readSecret(directories, SECRET_KEYS.FEATHERLESS, secretId);
    const baseHeaders = { ...FEATHERLESS_HEADERS };

    return apiKey ? Object.assign(baseHeaders, { 'Authorization': `Bearer ${apiKey}` }) : baseHeaders;
}

/**
 * Gets the headers for the HuggingFace API.
 * @param {import('./users.js').UserDirectoryList} directories
 * @param {string|null} secretId Secret ID for the request (optional, used to determine which secret to use)
 * @returns {object} Headers for the request
 */
function getHuggingFaceHeaders(directories: any, secretId = null) {
    const apiKey = readSecret(directories, SECRET_KEYS.HUGGINGFACE, secretId);

    return apiKey ? ({
        'Authorization': `Bearer ${apiKey}`,
    }) : {};
}

/**
 * Gets the headers for the Generic text completion API.
 * @param {import('./users.js').UserDirectoryList} directories
 * @param {string|null} secretId Secret ID for the request (optional, used to determine which secret to use)
 * @returns {object} Headers for the request
 */
function getGenericHeaders(directories: any, secretId = null) {
    const apiKey = readSecret(directories, SECRET_KEYS.GENERIC, secretId);

    return apiKey ? ({
        'Authorization': `Bearer ${apiKey}`,
    }) : {};
}

export function getOverrideHeaders(urlHost: any) {
    // @ts-expect-error TS(2345): Argument of type 'never[]' is not assignable to pa... Remove this comment to see the full error message
    const requestOverrides = getConfigValue('requestOverrides', []);
    const overrideHeaders = requestOverrides?.find((e: any) => e.hosts?.includes(urlHost))?.headers;
    if (overrideHeaders && urlHost) {
        return overrideHeaders;
    } else {
        return {};
    }
}

/**
 * Sets additional headers for the request.
 * @param {import('express').Request} request Original request body
 * @param {object} args New request arguments
 * @param {string|null} server API server for new request
 */
export function setAdditionalHeaders(request: any, args: any, server: any) {
    setAdditionalHeadersByType(args.headers, request.body.api_type, server, request.user.directories, request.body.secret_id);
}

/**
 *
 * @param {object} requestHeaders Request headers
 * @param {string} type API type
 * @param {string|null} server API server for new request
 * @param {import('./users.js').UserDirectoryList} directories User directories
 * @param {string|null} secretId Secret ID for the request (optional, used for some API types to determine which secret to use)
 */
export function setAdditionalHeadersByType(requestHeaders: any, type: any, server: any, directories: any, secretId = null) {
    const headerGetters = {
        [TEXTGEN_TYPES.MANCER]: getMancerHeaders,
        [TEXTGEN_TYPES.VLLM]: getVllmHeaders,
        [TEXTGEN_TYPES.APHRODITE]: getAphroditeHeaders,
        [TEXTGEN_TYPES.TABBY]: getTabbyHeaders,
        [TEXTGEN_TYPES.TOGETHERAI]: getTogetherAIHeaders,
        [TEXTGEN_TYPES.OOBA]: getOobaHeaders,
        [TEXTGEN_TYPES.INFERMATICAI]: getInfermaticAIHeaders,
        [TEXTGEN_TYPES.DREAMGEN]: getDreamGenHeaders,
        [TEXTGEN_TYPES.OPENROUTER]: getOpenRouterHeaders,
        [TEXTGEN_TYPES.KOBOLDCPP]: getKoboldCppHeaders,
        [TEXTGEN_TYPES.LLAMACPP]: getLlamaCppHeaders,
        [TEXTGEN_TYPES.FEATHERLESS]: getFeatherlessHeaders,
        [TEXTGEN_TYPES.HUGGINGFACE]: getHuggingFaceHeaders,
        [TEXTGEN_TYPES.GENERIC]: getGenericHeaders,
    };

    const getHeaders = headerGetters[type];
    const headers = getHeaders ? getHeaders(directories, secretId) : {};

    if (typeof server === 'string' && server.length > 0) {
        try {
            const url = new URL(server);
            const overrideHeaders = getOverrideHeaders(url.host);

            if (overrideHeaders && Object.keys(overrideHeaders).length > 0) {
                Object.assign(headers, overrideHeaders);
            }
        } catch {
            // Do nothing
        }
    }

    Object.assign(requestHeaders, headers);
}
