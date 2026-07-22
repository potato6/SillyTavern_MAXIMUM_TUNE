import { CHAT_COMPLETION_SOURCES } from '../../../constants.js';
import type { ChatProvider } from './types.js';
import { createRegistry } from '../common/registry-helper.js';

const registry = createRegistry<ChatProvider>({
    [CHAT_COMPLETION_SOURCES.OPENAI]: () => import('./providers/openai.js'),
    [CHAT_COMPLETION_SOURCES.OPENROUTER]: () => import('./providers/openrouter.js'),
    [CHAT_COMPLETION_SOURCES.CLAUDE]: () => import('./providers/claude.js'),
    [CHAT_COMPLETION_SOURCES.MAKERSUITE]: () => import('./providers/gemini.js'),
    [CHAT_COMPLETION_SOURCES.VERTEXAI]: () => import('./providers/gemini.js'),
    [CHAT_COMPLETION_SOURCES.AZURE_OPENAI]: () => import('./providers/azure.js'),
    [CHAT_COMPLETION_SOURCES.MISTRALAI]: () => import('./providers/mistral.js'),
    [CHAT_COMPLETION_SOURCES.COHERE]: () => import('./providers/cohere.js'),
    [CHAT_COMPLETION_SOURCES.AI21]: () => import('./providers/ai21.js'),
    [CHAT_COMPLETION_SOURCES.DEEPSEEK]: () => import('./providers/deepseek.js'),
    [CHAT_COMPLETION_SOURCES.XAI]: () => import('./providers/xai.js'),
    [CHAT_COMPLETION_SOURCES.AIMLAPI]: () => import('./providers/aimlapi.js'),
    [CHAT_COMPLETION_SOURCES.ELECTRONHUB]: () => import('./providers/electronhub.js'),
    [CHAT_COMPLETION_SOURCES.CHUTES]: () => import('./providers/chutes.js'),
    [CHAT_COMPLETION_SOURCES.MINIMAX]: () => import('./providers/minimax.js'),
    [CHAT_COMPLETION_SOURCES.PERPLEXITY]: () => import('./providers/perplexity.js'),
    [CHAT_COMPLETION_SOURCES.GROQ]: () => import('./providers/groq.js'),
    [CHAT_COMPLETION_SOURCES.NANOGPT]: () => import('./providers/nanogpt.js'),
    [CHAT_COMPLETION_SOURCES.POLLINATIONS]: () => import('./providers/pollinations.js'),
    [CHAT_COMPLETION_SOURCES.MOONSHOT]: () => import('./providers/moonshot.js'),
    [CHAT_COMPLETION_SOURCES.FIREWORKS]: () => import('./providers/fireworks.js'),
    [CHAT_COMPLETION_SOURCES.COMETAPI]: () => import('./providers/cometapi.js'),
    [CHAT_COMPLETION_SOURCES.ZAI]: () => import('./providers/zai.js'),
    [CHAT_COMPLETION_SOURCES.SILICONFLOW]: () => import('./providers/siliconflow.js'),
    [CHAT_COMPLETION_SOURCES.WORKERS_AI]: () => import('./providers/workers-ai.js'),
    [CHAT_COMPLETION_SOURCES.CUSTOM]: () => import('./providers/custom.js'),
});

export const getChatProvider = registry.get;
export const getRegisteredSources = registry.getTypes;
