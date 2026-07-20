import { CHAT_COMPLETION_SOURCES } from '../../../../constants.js';
import { createOAIChatProvider } from '../../common/openai-provider-base.js';

export default createOAIChatProvider({
    source: CHAT_COMPLETION_SOURCES.ELECTRONHUB,
    defaultBase: 'https://api.electronhub.ai/v1',
    secretKey: { id: 'ELECTRONHUB', label: 'Electron Hub', category: 'chat-completion' },
    supportsReverseProxy: false,
    extraBodyParams: (req) => {
        const params: Record<string, unknown> = {};
        if (req.body.enable_web_search) {
            params.web_search = true;
        }
        if (Array.isArray(req.body.tools) && req.body.tools.length > 0) {
            params.tools = req.body.tools;
            params.tool_choice = req.body.tool_choice;
        }
        if (req.body.reasoning_effort) {
            params.reasoning_effort = req.body.reasoning_effort;
        }
        return params;
    },
    supportsReasoning: true,
});
