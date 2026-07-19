import type express from 'express';
import { CHAT_COMPLETION_SOURCES } from '../../../constants.js';
import type { ModelEntry } from '../common/model-cache.js';
export type { ModelEntry };

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Provider feature flags.
 */
export interface ProviderCapabilities {
    supportsStreaming: boolean;
    supportsVision: boolean;
    supportsTools: boolean;
    supportsReasoning: boolean;
}

/**
 * Endpoint paths relative to the base API URL.
 * Providers with custom URL patterns (Azure, Workers AI) override
 * buildChatUrl / buildModelsUrl instead.
 */
export interface ProviderEndpoints {
    chat: string;
    models: string;
}

/**
 * Every chat-completion backend implements this contract.
 *
 * The `chat()` method is the main entry point — it receives the full
 * Express req/res and must send the response.  For simple OAI-compatible
 * providers this delegates to the shared proxyRequest helper; for
 * providers with a different API shape (Claude, Gemini) it contains its
 * own implementation.
 */
export interface ChatProvider {
    /** CHAT_COMPLETION_SOURCES value this provider handles. */
    readonly source: string;

    /** Endpoint paths (used when buildChatUrl/buildModelsUrl aren't overridden). */
    readonly endpoints: ProviderEndpoints;

    /** Feature flags. */
    readonly capabilities: ProviderCapabilities;

    // ── Main API ─────────────────────────────────────────────────────────

    /**
     * Send a chat completion request and write the response.
     */
    chat(req: express.Request, res: express.Response): Promise<void>;

    /**
     * List available models.
     *
     * Default implementation fetches GET <base>/v1/models and extracts
     * the `data` array.  Override for providers with non-standard
     * model listing (Gemini, Azure, Workers AI, Pollinations …).
     */
    listModels(req: express.Request): Promise<ModelEntry[]>;

    // ── Hooks used by proxyRequest (OAI-compat providers) ─────────────────

    /**
     * Transform the incoming request body into the provider-specific payload.
     */
    prepareRequest?(body: Record<string, unknown>): Record<string, unknown>;

    /**
     * Build request headers (auth + content type + provider extras).
     */
    buildHeaders?(req: express.Request): Record<string, string>;

    /**
     * Build the full URL for the chat endpoint.
     * Override for providers with custom URL patterns.
     */
    buildChatUrl?(req: express.Request): string;

    /**
     * Build the full URL for the models endpoint.
     * Override for providers with custom model listing URLs.
     */
    buildModelsUrl?(req: express.Request): string;

    /**
     * Transform a non-streaming response before sending to the client
     * (e.g. wrap Claude's /v1/messages response to OAI format).
     */
    transformResponse?(data: Record<string, unknown>): Record<string, unknown>;

    /**
     * Custom streaming handler for providers whose stream format differs
     * from standard SSE (e.g. Ollama's NDJSON).
     */
    stream?(fetchResponse: unknown, req: express.Request, res: express.Response): Promise<void>;
}

// ── Default endpoint map ───────────────────────────────────────────────────────

/**
 * Standard endpoint paths for every chat-completion source.
 *
 * Providers with non-standard paths override via buildChatUrl / buildModelsUrl.
 */
export const PROVIDER_ENDPOINTS: Record<string, ProviderEndpoints> = {
    [CHAT_COMPLETION_SOURCES.OPENAI]:       { chat: '/chat/completions', models: '/models' },
    [CHAT_COMPLETION_SOURCES.OPENROUTER]:   { chat: '/chat/completions', models: '/models' },
    [CHAT_COMPLETION_SOURCES.PERPLEXITY]:   { chat: '/chat/completions', models: '/models' },
    [CHAT_COMPLETION_SOURCES.GROQ]:         { chat: '/chat/completions', models: '/models' },
    [CHAT_COMPLETION_SOURCES.MISTRALAI]:    { chat: '/chat/completions', models: '/models' },
    [CHAT_COMPLETION_SOURCES.DEEPSEEK]:     { chat: '/chat/completions', models: '/models' },
    [CHAT_COMPLETION_SOURCES.XAI]:          { chat: '/chat/completions', models: '/models' },
    [CHAT_COMPLETION_SOURCES.AIMLAPI]:      { chat: '/chat/completions', models: '/models' },
    [CHAT_COMPLETION_SOURCES.ELECTRONHUB]:  { chat: '/chat/completions', models: '/models' },
    [CHAT_COMPLETION_SOURCES.CHUTES]:       { chat: '/chat/completions', models: '/models' },
    [CHAT_COMPLETION_SOURCES.MOONSHOT]:     { chat: '/chat/completions', models: '/models' },
    [CHAT_COMPLETION_SOURCES.FIREWORKS]:    { chat: '/chat/completions', models: '/models' },
    [CHAT_COMPLETION_SOURCES.NANOGPT]:      { chat: '/chat/completions', models: '/models' },
    [CHAT_COMPLETION_SOURCES.POLLINATIONS]: { chat: '/chat/completions', models: '/models' },
    [CHAT_COMPLETION_SOURCES.ZAI]:          { chat: '/chat/completions', models: '/models' },
    [CHAT_COMPLETION_SOURCES.SILICONFLOW]:  { chat: '/chat/completions', models: '/models' },
    [CHAT_COMPLETION_SOURCES.WORKERS_AI]:   { chat: '/chat/completions', models: '/models' },
    [CHAT_COMPLETION_SOURCES.COMETAPI]:     { chat: '/chat/completions', models: '/models' },
    [CHAT_COMPLETION_SOURCES.CUSTOM]:       { chat: '/chat/completions', models: '/models' },
    [CHAT_COMPLETION_SOURCES.CLAUDE]:       { chat: '/messages', models: '/models' },
    [CHAT_COMPLETION_SOURCES.COHERE]:       { chat: '/chat', models: '/models' },
    [CHAT_COMPLETION_SOURCES.AI21]:         { chat: '/chat/completions', models: '/models' },
    [CHAT_COMPLETION_SOURCES.MINIMAX]:      { chat: '/chat/completions', models: '/models' },
    // Gemini/Vertex/Makersuite build their own URLs — endpoints here for reference
    [CHAT_COMPLETION_SOURCES.MAKERSUITE]:   { chat: '', models: '/models' },
    [CHAT_COMPLETION_SOURCES.VERTEXAI]:     { chat: '', models: '/models' },
    [CHAT_COMPLETION_SOURCES.AZURE_OPENAI]: { chat: '', models: '' },
};
