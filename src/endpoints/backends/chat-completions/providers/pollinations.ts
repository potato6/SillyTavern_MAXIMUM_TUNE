import { CHAT_COMPLETION_SOURCES } from '../../../../constants.js';
import { createOAIChatProvider } from '../../common/openai-provider-base.js';

export default createOAIChatProvider({
    source: CHAT_COMPLETION_SOURCES.POLLINATIONS,
    defaultBase: 'https://gen.pollinations.ai/v1',
    secretKey: { id: 'POLLINATIONS', label: 'Pollinations', category: 'chat-completion' },
    supportsReverseProxy: false,
    extraBodyParams: (req) => {
        const params: Record<string, unknown> = {};
        if (req.body.reasoning_effort) {
            params.reasoning_effort = req.body.reasoning_effort;
        }
        params.seed = req.body.seed ?? Math.floor(Math.random() * 99999999);
        return params;
    },
    supportsReasoning: true,
});
