import { TEXTGEN_TYPES, TOGETHERAI_KEYS } from '../../../../constants.js';
import { createOAITextProvider } from '../../common/openai-text-base.js';

export default createOAITextProvider({
    type: TEXTGEN_TYPES.TOGETHERAI,
    allowedKeys: TOGETHERAI_KEYS,
    buildStatusResponse(data: unknown) {
        if (Array.isArray(data)) {
            return { data: data.map((x: Record<string, unknown>) => ({ id: x.name, ...x })) };
        }
        return data;
    },
});
