import { CHAT_COMPLETION_SOURCES } from '../../../constants.js';
import type { ChatProvider } from './types.js';

/**
 * Lazy-loading provider map.
 *
 * A provider module is loaded **only** when its source is first requested.
 */
const providerLoader: Record<string, () => Promise<{ default: ChatProvider }>> = {
    [CHAT_COMPLETION_SOURCES.OPENAI]:       () => import('./providers/openai.js'),
    [CHAT_COMPLETION_SOURCES.OPENROUTER]:   () => import('./providers/openrouter.js'),
    [CHAT_COMPLETION_SOURCES.CLAUDE]:       () => import('./providers/claude.js'),
    [CHAT_COMPLETION_SOURCES.MAKERSUITE]:   () => import('./providers/gemini.js'),
    [CHAT_COMPLETION_SOURCES.VERTEXAI]:     () => import('./providers/gemini.js'),
    [CHAT_COMPLETION_SOURCES.AZURE_OPENAI]: () => import('./providers/azure.js'),
    [CHAT_COMPLETION_SOURCES.MISTRALAI]:    () => import('./providers/mistral.js'),
    [CHAT_COMPLETION_SOURCES.COHERE]:       () => import('./providers/cohere.js'),
    [CHAT_COMPLETION_SOURCES.AI21]:         () => import('./providers/ai21.js'),
    [CHAT_COMPLETION_SOURCES.DEEPSEEK]:     () => import('./providers/deepseek.js'),
    [CHAT_COMPLETION_SOURCES.XAI]:          () => import('./providers/xai.js'),
    [CHAT_COMPLETION_SOURCES.AIMLAPI]:      () => import('./providers/aimlapi.js'),
    [CHAT_COMPLETION_SOURCES.ELECTRONHUB]:  () => import('./providers/electronhub.js'),
    [CHAT_COMPLETION_SOURCES.CHUTES]:       () => import('./providers/chutes.js'),
    [CHAT_COMPLETION_SOURCES.MINIMAX]:      () => import('./providers/minimax.js'),
    [CHAT_COMPLETION_SOURCES.PERPLEXITY]:   () => import('./providers/perplexity.js'),
    [CHAT_COMPLETION_SOURCES.GROQ]:         () => import('./providers/groq.js'),
    [CHAT_COMPLETION_SOURCES.NANOGPT]:      () => import('./providers/nanogpt.js'),
    [CHAT_COMPLETION_SOURCES.POLLINATIONS]: () => import('./providers/pollinations.js'),
    [CHAT_COMPLETION_SOURCES.MOONSHOT]:     () => import('./providers/moonshot.js'),
    [CHAT_COMPLETION_SOURCES.FIREWORKS]:    () => import('./providers/fireworks.js'),
    [CHAT_COMPLETION_SOURCES.COMETAPI]:     () => import('./providers/cometapi.js'),
    [CHAT_COMPLETION_SOURCES.ZAI]:          () => import('./providers/zai.js'),
    [CHAT_COMPLETION_SOURCES.SILICONFLOW]:  () => import('./providers/siliconflow.js'),
    [CHAT_COMPLETION_SOURCES.WORKERS_AI]:   () => import('./providers/workers-ai.js'),
    [CHAT_COMPLETION_SOURCES.CUSTOM]:       () => import('./providers/custom.js'),
};

const providerCache = new Map<string, ChatProvider>();

/**
 * Get (and lazily load) a chat provider by its source string.
 *
 * Both MAKERSUITE and VERTEXAI map to the same gemini provider module,
 * but the provider detects which via `req.body.chat_completion_source`.
 *
 * @throws If the source is unknown.
 */
export async function getChatProvider(source: string): Promise<ChatProvider> {
    const cached = providerCache.get(source);
    if (cached) return cached;

    const loader = providerLoader[source];
    if (!loader) {
        throw new Error(`Unknown chat completion source: "${source}"`);
    }

    const mod = await loader();
    providerCache.set(source, mod.default);
    return mod.default;
}

/**
 * Return all registered provider source strings.
 */
export function getRegisteredSources(): string[] {
    return Object.keys(providerLoader);
}
