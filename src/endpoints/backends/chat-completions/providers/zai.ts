import { CHAT_COMPLETION_SOURCES, ZAI_ENDPOINT } from '../../../../constants.js';
import { createOAIChatProvider } from '../../common/openai-provider-base.js';
import type { ModelEntry } from '../types.js';

const API_ZAI_COMMON = 'https://api.z.ai/api/paas/v4';
const API_ZAI_CODING = 'https://api.z.ai/api/coding/paas/v4';

const base = createOAIChatProvider({
    source: CHAT_COMPLETION_SOURCES.ZAI,
    defaultBase: API_ZAI_COMMON,
    secretKey: { id: 'ZAI', label: 'Z.AI', category: 'chat-completion' },
    supportsReverseProxy: true,
    extraHeaders: {
        'Accept-Language': 'en-US,en',
    },
    extraBodyParams: (req) => ({
        ...(req.body.include_reasoning !== undefined
            ? { thinking: { type: req.body.include_reasoning ? 'enabled' : 'disabled' } }
            : {}),
    }),
});

/**
 * ZAI has two endpoints: common (reasoning) and coding.
 * Route to the right base URL depending on req.body.zai_endpoint.
 */
export default {
    ...base,

    async chat(req: import('express').Request, res: import('express').Response) {
        const target = req.body.reverse_proxy || (
            req.body.zai_endpoint === ZAI_ENDPOINT.CODING ? API_ZAI_CODING : API_ZAI_COMMON
        );
        req.body.reverse_proxy = target;
        return base.chat(req, res);
    },

    async listModels(req: import('express').Request): Promise<ModelEntry[]> {
        const target = req.body.reverse_proxy || (
            req.body.zai_endpoint === ZAI_ENDPOINT.CODING ? API_ZAI_CODING : API_ZAI_COMMON
        );
        req.body.reverse_proxy = target;
        return base.listModels(req);
    },
};
