import { CHAT_COMPLETION_SOURCES } from '../../../../constants.js';
import { createOAIChatProvider } from '../../common/openai-provider-base.js';

export default createOAIChatProvider({
    source: CHAT_COMPLETION_SOURCES.CHUTES,
    defaultBase: 'https://llm.chutes.ai/v1',
    secretKey: { id: 'CHUTES', label: 'Chutes', category: 'chat-completion' },
    supportsReverseProxy: false,
    extraBodyParams: (req) => {
        const params: Record<string, unknown> = {};
        if (Array.isArray(req.body.tools) && req.body.tools.length > 0) {
            params.tools = req.body.tools;
            params.tool_choice = req.body.tool_choice;
        }
        if (req.body.logprobs > 0) {
            params.top_logprobs = req.body.logprobs;
            params.logprobs = true;
        }
        if (req.body.repetition_penalty !== undefined) {
            params.repetition_penalty = req.body.repetition_penalty;
        }
        if (req.body.min_p !== undefined) {
            params.min_p = req.body.min_p;
        }
        if (req.body.reasoning_effort) {
            params.reasoning_effort = req.body.reasoning_effort;
        }
        return params;
    },
    supportsReasoning: true,
    tokenizer: (model) => {
        const m = model.toLowerCase();
        if (m.includes('deepseek') || m.includes('mai-ds')) return 'deepseek';
        if (m.includes('qwen') || m.includes('qwq') || m.includes('tongyi') || m.includes('kimi')) return 'qwen2';
        if (m.includes('llama') || m.includes('longcat') || m.includes('hermes')) return 'llama3';
        if (m.includes('gemma')) return 'gemma';
        if (m.includes('nemo')) return 'nemo';
        if (m.includes('mistral')) return 'mistral';
        if (m.includes('gpt-oss')) return 'gpt-4o';
        return 'llama3';
    },
});
