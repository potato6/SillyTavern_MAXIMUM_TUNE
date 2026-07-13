import { TEXTGEN_TYPES, VLLM_KEYS } from '../../../../constants.js';
import { createOAITextProvider } from '../../common/oai-text-provider.js';

export default createOAITextProvider({
    type: TEXTGEN_TYPES.VLLM,
    allowedKeys: VLLM_KEYS,
});
