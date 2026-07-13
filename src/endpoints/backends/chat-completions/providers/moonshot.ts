import { CHAT_COMPLETION_SOURCES } from '../../../../constants.js';
import { SECRET_KEYS } from '../../../secrets.js';
import { createOAIChatProvider } from '../../common/openai-provider-base.js';

const provider = createOAIChatProvider({
    source: CHAT_COMPLETION_SOURCES.MOONSHOT,
    defaultBase: 'https://api.moonshot.ai/v1',
    secretKey: SECRET_KEYS.MOONSHOT,
    supportsVision: true,
    extraBodyParams: (req) => ({
        ...(req.body.include_reasoning ? { thinking: { type: 'enabled' } } : {}),
    }),
});

export default provider;
