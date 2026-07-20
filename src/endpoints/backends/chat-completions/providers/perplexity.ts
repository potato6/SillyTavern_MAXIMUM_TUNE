import { CHAT_COMPLETION_SOURCES } from '../../../../constants.js';
import { createOAIChatProvider } from '../../common/openai-provider-base.js';

/**
 * Perplexity AI chat completion provider.
 *
 * API docs: https://docs.perplexity.ai
 * Base URL: https://api.perplexity.ai
 */
export default createOAIChatProvider({
    source: CHAT_COMPLETION_SOURCES.PERPLEXITY,
    defaultBase: 'https://api.perplexity.ai',
    secretKey: { id: 'PERPLEXITY', label: 'Perplexity', category: 'chat-completion' },
    supportsReverseProxy: true,
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    supportsReasoning: true,
    extraBodyParams: (req) => ({
        tools: Array.isArray(req.body.tools) && req.body.tools.length > 0 ? req.body.tools : undefined,
        tool_choice: req.body.tool_choice || undefined,
        reasoning_effort: req.body.reasoning_effort || undefined,
    }),
    tokenizer: (model) => {
        if (model.includes('sonar-reasoning') || model.includes('r1-1776')) return 'deepseek';
        if (model.includes('llama-3') || model.includes('llama3')) return 'llama3';
        if (model.includes('llama')) return 'llama';
        if (model.includes('mistral') || model.includes('mixtral')) return 'mistral';
        return 'llama3';
    },
});
