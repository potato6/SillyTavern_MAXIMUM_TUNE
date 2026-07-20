import { CHAT_COMPLETION_SOURCES } from '../../../../constants.js';
import { createOAIChatProvider } from '../../common/openai-provider-base.js';

/**
 * Groq chat completion provider.
 *
 * API docs: https://console.groq.com/docs
 * Base URL: https://api.groq.com/openai/v1
 */
export default createOAIChatProvider({
    source: CHAT_COMPLETION_SOURCES.GROQ,
    defaultBase: 'https://api.groq.com/openai/v1',
    secretKey: { id: 'GROQ', label: 'Groq', category: 'chat-completion' },
    supportsReverseProxy: true,
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    supportsReasoning: false,
    extraBodyParams: (req) => ({
        tools: Array.isArray(req.body.tools) && req.body.tools.length > 0 ? req.body.tools : undefined,
        tool_choice: req.body.tool_choice || undefined,
    }),
    tokenizer: (model) => {
        if (model.includes('qwen')) return 'qwen2';
        if (model.includes('llama-3') || model.includes('llama3')) return 'llama3';
        if (model.includes('mistral') || model.includes('mixtral')) return 'mistral';
        if (model.includes('gemma')) return 'gemma';
        return 'llama3';
    },
});
