import { TEXTGEN_TYPES, OPENAI_KEYS } from '../../../../constants.js';
import { createOAITextProvider } from '../../common/oai-text-provider.js';

export default createOAITextProvider({
    type: TEXTGEN_TYPES.GENERIC,
    allowedKeys: OPENAI_KEYS,
    extraTransform(body: Record<string, unknown>) {
        if (Array.isArray(body.stop)) body.stop = body.stop.slice(0, 4);
    },
});
