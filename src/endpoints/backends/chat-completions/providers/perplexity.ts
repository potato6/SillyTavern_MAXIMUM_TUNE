import { CHAT_COMPLETION_SOURCES } from '../../../../constants.js';
import { SECRET_KEYS } from '../../../secrets.js';
import { createOAIChatProvider } from './oai-compat.js';

/**
 * Perplexity AI chat completion provider.
 *
 * API docs: https://docs.perplexity.ai
 * Base URL: https://api.perplexity.ai
 */
export default createOAIChatProvider({
    source: CHAT_COMPLETION_SOURCES.PERPLEXITY,
    defaultBase: 'https://api.perplexity.ai',
    secretKey: SECRET_KEYS.PERPLEXITY,
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
});
