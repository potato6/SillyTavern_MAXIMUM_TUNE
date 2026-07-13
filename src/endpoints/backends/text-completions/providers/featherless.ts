import { TEXTGEN_TYPES, FEATHERLESS_KEYS } from '../../../../constants.js';
import { createOAITextProvider } from '../../common/openai-text-base.js';

export default createOAITextProvider({
    type: TEXTGEN_TYPES.FEATHERLESS,
    allowedKeys: FEATHERLESS_KEYS,
});
