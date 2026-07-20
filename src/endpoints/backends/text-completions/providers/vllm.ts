import { TEXTGEN_TYPES, VLLM_KEYS } from '../../../../constants.js';
import { createOAITextProvider } from '../../common/openai-text-base.js';

export default createOAITextProvider({
    type: TEXTGEN_TYPES.VLLM,
    secretKey: { id: 'VLLM', label: 'vLLM', category: 'textgen' },
    allowedKeys: VLLM_KEYS,
});
