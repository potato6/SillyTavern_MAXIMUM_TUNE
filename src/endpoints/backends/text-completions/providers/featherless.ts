import { TEXTGEN_TYPES, FEATHERLESS_KEYS } from '../../../../constants.js';
import { createOAITextProvider } from '../../common/openai-text-base.js';

export default createOAITextProvider({
    type: TEXTGEN_TYPES.FEATHERLESS,
    secretKey: { id: 'FEATHERLESS', label: 'Featherless', category: 'textgen' },
    allowedKeys: FEATHERLESS_KEYS,
});
