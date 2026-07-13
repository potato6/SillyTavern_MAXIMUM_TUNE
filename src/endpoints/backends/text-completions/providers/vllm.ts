import { TEXTGEN_TYPES, VLLM_KEYS } from '../../../../constants.js';
import { createOAITextProvider } from '../../common/openai-text-base.js';

export default createOAITextProvider({
    type: TEXTGEN_TYPES.VLLM,
    allowedKeys: VLLM_KEYS,
});
