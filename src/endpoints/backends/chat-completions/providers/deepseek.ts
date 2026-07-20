import { CHAT_COMPLETION_SOURCES } from '../../../../constants.js';
import { createOAIChatProvider } from '../../common/openai-provider-base.js';

/**
 * DeepSeek chat completion provider.
 *
 * API docs: https://api-docs.deepseek.com
 * Base URL: https://api.deepseek.com/beta
 */
export default createOAIChatProvider({
    source: CHAT_COMPLETION_SOURCES.DEEPSEEK,
    defaultBase: 'https://api.deepseek.com/beta',
    secretKey: { id: 'DEEPSEEK', label: 'DeepSeek', category: 'chat-completion' },
    supportsReverseProxy: true,
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    supportsReasoning: true,
    extraBodyParams: (req) => ({
        tools: Array.isArray(req.body.tools) && req.body.tools.length > 0 ? req.body.tools : undefined,
        tool_choice: req.body.tool_choice || undefined,
        reasoning_effort: req.body.reasoning_effort || undefined,
        ...(req.body.logprobs > 0 ? { top_logprobs: req.body.logprobs, logprobs: true } : {}),
    }),
});
