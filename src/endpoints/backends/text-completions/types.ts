import { TEXTGEN_TYPES } from '../../../constants.js';

/**
 * Endpoint URL suffixes for each provider.
 */
export interface ProviderEndpoints {
    status: string;
    generate: string;
    props?: string;
}

/**
 * A text-completion backend provider.
 *
 * Each provider module exports a default object matching this interface.
 * Minimal providers (passthrough) only need `type` and `endpoints`.
 */
export interface BackendProvider {
    /** The TEXTGEN_TYPES value this provider handles. */
    type: string;

    /** Endpoint URL suffixes. */
    endpoints: ProviderEndpoints;

    /**
     * Transform the incoming request body into the provider's expected payload.
     * Default: identity (pass-through).
     */
    buildGenerateBody?(body: Record<string, unknown>): Record<string, unknown>;

    /**
     * Rewrap a provider-specific status response into OAI-compatible
     * `{ data: [{ id, ... }] }` shape.
     */
    buildStatusResponse?(data: unknown, baseUrl?: string): unknown;

    /**
     * Fetch extra model identification (e.g. Tabby, Ooba) after the main
     * status call succeeds. Returns a model id string or null.
     */
    getModelId?(baseUrl: string, headers: Record<string, string>): Promise<string | null>;

    /**
     * Transform the non-streaming generate response before sending to client.
     */
    transformGenerateResponse?(data: Record<string, unknown>): Record<string, unknown>;

    /**
     * Provider-specific streaming handler.
     * When present the router calls this instead of the default forwardFetchResponse
     * pipe-through.  Signature matches parseOllamaStream.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stream?(fetchResponse: any, request: import('express').Request, response: import('express').Response): Promise<void>;
}

/**
 * Centralised endpoint URL map — eliminates every switch statement in the router.
 *
 * Key = api_type value, value = URL path suffixes.
 */
export const PROVIDER_ENDPOINTS: Record<string, ProviderEndpoints> = {
    [TEXTGEN_TYPES.GENERIC]:     { status: '/v1/models', generate: '/v1/completions' },
    [TEXTGEN_TYPES.OOBA]:        { status: '/v1/models', generate: '/v1/completions' },
    [TEXTGEN_TYPES.VLLM]:        { status: '/v1/models', generate: '/v1/completions' },
    [TEXTGEN_TYPES.APHRODITE]:   { status: '/v1/models', generate: '/v1/completions' },
    [TEXTGEN_TYPES.KOBOLDCPP]:   { status: '/v1/models', generate: '/v1/completions' },
    [TEXTGEN_TYPES.LLAMACPP]:    { status: '/v1/models', generate: '/completion', props: '/props' },
    [TEXTGEN_TYPES.INFERMATICAI]: { status: '/v1/models', generate: '/v1/completions' },
    [TEXTGEN_TYPES.OPENROUTER]:  { status: '/v1/models', generate: '/v1/chat/completions' },
    [TEXTGEN_TYPES.FEATHERLESS]: { status: '/v1/models', generate: '/v1/completions' },
    [TEXTGEN_TYPES.TOGETHERAI]:  { status: '/api/models?&info', generate: '/v1/completions' },
    [TEXTGEN_TYPES.DREAMGEN]:    { status: '/api/openai/v1/models', generate: '/api/openai/v1/completions' },
    [TEXTGEN_TYPES.MANCER]:      { status: '/oai/v1/models', generate: '/oai/v1/completions' },
    [TEXTGEN_TYPES.TABBY]:       { status: '/v1/model/list', generate: '/v1/completions' },
    [TEXTGEN_TYPES.OLLAMA]:      { status: '/api/tags', generate: '/api/generate' },
    [TEXTGEN_TYPES.HUGGINGFACE]: { status: '/info', generate: '/v1/completions' },
};
