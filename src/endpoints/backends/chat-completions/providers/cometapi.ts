import { CHAT_COMPLETION_SOURCES } from '../../../../constants.js';
import { createOAIChatProvider } from '../../common/openai-provider-base.js';

const provider = createOAIChatProvider({
    source: CHAT_COMPLETION_SOURCES.COMETAPI,
    defaultBase: 'https://api.cometapi.com/v1',
    secretKey: { id: 'COMETAPI', label: 'CometAPI', category: 'chat-completion' },
    supportsReverseProxy: false,
    extraBodyParams: (req) => ({
        ...(req.body.reasoning_effort ? { reasoning_effort: req.body.reasoning_effort } : {}),
    }),
});

export default provider;
