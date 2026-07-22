import { CHAT_COMPLETION_SOURCES } from '../../../../constants.js';
import { createOAIChatProvider } from '../../common/openai-provider-base.js';

/**
 * xAI (Grok) chat completion provider.
 *
 * API docs: https://docs.x.ai
 * Base URL: https://api.x.ai/v1
 */
export default createOAIChatProvider({
    source: CHAT_COMPLETION_SOURCES.XAI,
    defaultBase: 'https://api.x.ai/v1',
    secretKey: { id: 'XAI', label: 'xAI (Grok)', category: 'chat-completion' },
    supportsReverseProxy: true,
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    supportsReasoning: true,
    extraBodyParams: (req) => ({
        tools:
            Array.isArray(req.body.tools) && req.body.tools.length > 0 ? req.body.tools : undefined,
        tool_choice: req.body.tool_choice || undefined,
        reasoning_effort: req.body.reasoning_effort
            ? req.body.reasoning_effort === 'high'
                ? 'high'
                : 'low'
            : undefined,
        ...(req.body.logprobs > 0 ? { top_logprobs: req.body.logprobs, logprobs: true } : {}),
    }),
});
