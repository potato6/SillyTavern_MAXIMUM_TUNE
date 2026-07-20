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
    tokenizer: (model) => {
        const m = model.toLowerCase();
        if (m.includes('gpt-5') || m.includes('gpt-4o') || m.includes('gpt-4.1') || m.includes('gpt-4.5')) return 'gpt-4o';
        if (m.includes('gpt-4')) return 'gpt-4';
        if (m.includes('gpt-3.5-turbo')) return 'gpt-3.5-turbo';
        if (m.includes('claude')) return 'claude';
        if (m.includes('jamba')) return 'jamba';
        if (m.includes('deepseek') || m.includes('sonar-reasoning') || m.includes('r1')) return 'deepseek';
        if (m.includes('qwen')) return 'qwen2';
        if (m.includes('gemma')) return 'gemma';
        if (m.includes('mistral')) return 'mistral';
        if (m.includes('yi')) return 'yi';
        if (m.includes('llama3') || m.includes('llama-3') || m.startsWith('l3')) return 'llama3';
        if (m.includes('llama')) return 'llama';
        if (m.includes('command-a')) return 'command-a';
        if (m.includes('command-r')) return 'command-r';
        if (m.includes('nemo')) return 'nemo';
        return 'llama3';
    },
});
