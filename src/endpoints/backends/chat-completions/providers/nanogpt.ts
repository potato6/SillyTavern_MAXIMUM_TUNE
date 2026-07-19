import { CHAT_COMPLETION_SOURCES, NANOGPT_REASONING_EFFORT_MAP } from '../../../../constants.js';
import { SECRET_KEYS } from '../../../secrets.js';
import { createOAIChatProvider } from '../../common/openai-provider-base.js';

export default createOAIChatProvider({
    source: CHAT_COMPLETION_SOURCES.NANOGPT,
    defaultBase: 'https://nano-gpt.com/api/v1',
    secretKey: SECRET_KEYS.NANOGPT,
    supportsReverseProxy: false,
    extraBodyParams: (req) => {
        const params: Record<string, unknown> = {};
        if (req.body.nanogpt_payg_override) {
            params.billing_mode = 'paygo';
        }
        if (req.body.min_p !== undefined) {
            params.min_p = req.body.min_p;
        }
        if (req.body.top_a !== undefined) {
            params.top_a = req.body.top_a;
        }
        if (req.body.repetition_penalty !== undefined) {
            params.repetition_penalty = req.body.repetition_penalty;
        }
        if (req.body.reasoning_effort) {
            const effort = NANOGPT_REASONING_EFFORT_MAP[req.body.reasoning_effort as keyof typeof NANOGPT_REASONING_EFFORT_MAP];
            if (effort) {
                params.reasoning = { effort };
            }
        }
        return params;
    },
    // NanoGPT uses ?detailed=true query param for model listing
    modelsPath: '/models?detailed=true',
    supportsReasoning: true,
});
