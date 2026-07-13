import { TEXTGEN_TYPES, INFERMATICAI_KEYS } from '../../../../constants.js';
import { createOAITextProvider } from '../../common/oai-text-provider.js';

export default createOAITextProvider({
    type: TEXTGEN_TYPES.INFERMATICAI,
    allowedKeys: INFERMATICAI_KEYS,
    transformGenerateResponse(data: Record<string, unknown>): Record<string, unknown> {
        if (Array.isArray(data.choices)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data.choices = data.choices.map((choice: any) => ({
                text: choice?.message?.content ?? choice.text,
                logprobs: choice?.logprobs,
                index: choice?.index,
            }));
        }
        return data;
    },
});
