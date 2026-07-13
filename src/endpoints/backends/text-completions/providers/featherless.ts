import { TEXTGEN_TYPES, FEATHERLESS_KEYS } from '../../../../constants.js';
import { createOAITextProvider } from '../../common/oai-text-provider.js';

export default createOAITextProvider({
    type: TEXTGEN_TYPES.FEATHERLESS,
    allowedKeys: FEATHERLESS_KEYS,
});
