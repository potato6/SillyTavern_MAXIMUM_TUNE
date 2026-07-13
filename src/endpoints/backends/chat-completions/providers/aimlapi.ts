import { AIMLAPI_HEADERS, CHAT_COMPLETION_SOURCES } from '../../../../constants.js';
import { SECRET_KEYS } from '../../../secrets.js';
import { createOAIChatProvider } from '../../common/openai-provider-base.js';

/**
 * AI/ML API chat completion provider.
 *
 * API docs: https://docs.aimlapi.com
 * Base URL: https://api.aimlapi.com/v1
 */
export default createOAIChatProvider({
    source: CHAT_COMPLETION_SOURCES.AIMLAPI,
    defaultBase: 'https://api.aimlapi.com/v1',
    secretKey: SECRET_KEYS.AIMLAPI,
    supportsReverseProxy: false,
    extraHeaders: AIMLAPI_HEADERS,
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
