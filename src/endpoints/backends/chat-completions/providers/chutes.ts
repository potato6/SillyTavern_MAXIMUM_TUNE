import { CHAT_COMPLETION_SOURCES } from '../../../../constants.js';
import { SECRET_KEYS } from '../../../secrets.js';
import { createOAIChatProvider } from '../../common/openai-provider-base.js';

export default createOAIChatProvider({
    source: CHAT_COMPLETION_SOURCES.CHUTES,
    defaultBase: 'https://llm.chutes.ai/v1',
    secretKey: SECRET_KEYS.CHUTES,
    supportsReverseProxy: false,
    extraBodyParams: (req) => {
        const params: Record<string, unknown> = {};
        if (Array.isArray(req.body.tools) && req.body.tools.length > 0) {
            params['tools'] = req.body.tools;
            params['tool_choice'] = req.body.tool_choice;
        }
        if (req.body.logprobs > 0) {
            params['top_logprobs'] = req.body.logprobs;
            params['logprobs'] = true;
        }
        if (req.body.repetition_penalty !== undefined) {
            params['repetition_penalty'] = req.body.repetition_penalty;
        }
        if (req.body.min_p !== undefined) {
            params['min_p'] = req.body.min_p;
        }
        if (req.body.reasoning_effort) {
            params['reasoning_effort'] = req.body.reasoning_effort;
        }
        return params;
    },
    supportsReasoning: true,
});
