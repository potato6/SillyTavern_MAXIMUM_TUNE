import { CHAT_COMPLETION_SOURCES } from '../../../../constants.js';
import { SECRET_KEYS } from '../../../secrets.js';
import { createOAIChatProvider } from './oai-compat.js';

export default createOAIChatProvider({
    source: CHAT_COMPLETION_SOURCES.ELECTRONHUB,
    defaultBase: 'https://api.electronhub.ai/v1',
    secretKey: SECRET_KEYS.ELECTRONHUB,
    supportsReverseProxy: false,
    extraBodyParams: (req) => {
        const params: Record<string, unknown> = {};
        if (req.body.enable_web_search) {
            params['web_search'] = true;
        }
        if (Array.isArray(req.body.tools) && req.body.tools.length > 0) {
            params['tools'] = req.body.tools;
            params['tool_choice'] = req.body.tool_choice;
        }
        if (req.body.reasoning_effort) {
            params['reasoning_effort'] = req.body.reasoning_effort;
        }
        return params;
    },
    supportsReasoning: true,
});
