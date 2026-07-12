import { CHAT_COMPLETION_SOURCES } from '../../../../constants.js';
import { SECRET_KEYS } from '../../../secrets.js';
import { createOAIChatProvider } from './oai-compat.js';

export default createOAIChatProvider({
    source: CHAT_COMPLETION_SOURCES.POLLINATIONS,
    defaultBase: 'https://gen.pollinations.ai/v1',
    secretKey: SECRET_KEYS.POLLINATIONS,
    supportsReverseProxy: false,
    extraBodyParams: (req) => {
        const params: Record<string, unknown> = {};
        if (req.body.reasoning_effort) {
            params['reasoning_effort'] = req.body.reasoning_effort;
        }
        params['seed'] = req.body.seed ?? Math.floor(Math.random() * 99999999);
        return params;
    },
    supportsReasoning: true,
});
