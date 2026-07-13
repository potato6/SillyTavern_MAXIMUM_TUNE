import { CHAT_COMPLETION_SOURCES } from '../../../../constants.js';
import { SECRET_KEYS } from '../../../secrets.js';
import { createOAIChatProvider } from '../../common/openai-provider-base.js';

const provider = createOAIChatProvider({
    source: CHAT_COMPLETION_SOURCES.COMETAPI,
    defaultBase: 'https://api.cometapi.com/v1',
    secretKey: SECRET_KEYS.COMETAPI,
    supportsReverseProxy: false,
    extraBodyParams: (req) => ({
        ...(req.body.reasoning_effort ? { reasoning_effort: req.body.reasoning_effort } : {}),
    }),
});

export default provider;
