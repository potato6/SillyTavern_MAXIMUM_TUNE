import { CHAT_COMPLETION_SOURCES } from '../../../../constants.js';
import { SECRET_KEYS } from '../../../secrets.js';
import { createOAIChatProvider } from './oai-compat.js';

/**
 * Groq chat completion provider.
 *
 * API docs: https://console.groq.com/docs
 * Base URL: https://api.groq.com/openai/v1
 */
export default createOAIChatProvider({
    source: CHAT_COMPLETION_SOURCES.GROQ,
    defaultBase: 'https://api.groq.com/openai/v1',
    secretKey: SECRET_KEYS.GROQ,
    supportsReverseProxy: true,
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    supportsReasoning: false,
    extraBodyParams: (req) => ({
        tools: Array.isArray(req.body.tools) && req.body.tools.length > 0 ? req.body.tools : undefined,
        tool_choice: req.body.tool_choice || undefined,
    }),
});
