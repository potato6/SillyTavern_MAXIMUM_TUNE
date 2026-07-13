import { CHAT_COMPLETION_SOURCES } from '../../../../constants.js';
import { SECRET_KEYS } from '../../../secrets.js';
import { createOAIChatProvider } from '../../common/openai-provider-base.js';

export default createOAIChatProvider({
    source: CHAT_COMPLETION_SOURCES.FIREWORKS,
    defaultBase: 'https://api.fireworks.ai/inference/v1',
    secretKey: SECRET_KEYS.FIREWORKS,
    supportsReverseProxy: false,
});
