import { TEXTGEN_TYPES, INFERMATICAI_KEYS } from '../../../constants.js';
import { pickBy } from 'es-toolkit/compat';
import type { BackendProvider } from './types.js';

const provider: BackendProvider = {
    type: TEXTGEN_TYPES.INFERMATICAI,
    endpoints: { status: '/v1/models', generate: '/v1/completions' },

    buildGenerateBody(body) {
        return pickBy(body, (_, key) => INFERMATICAI_KEYS.includes(key));
    },

    transformGenerateResponse(data: Record<string, unknown>): Record<string, unknown> {
        // InfermaticAI returns chat-completion format; map to OAI completions.
        if (Array.isArray(data.choices)) {
            data.choices = data.choices.map((choice: Record<string, unknown>) => ({
                text: (choice?.message as Record<string, unknown>)?.content as string ?? (choice.text as string),
                logprobs: choice?.logprobs,
                index: choice?.index,
            }));
        }
        return data;
    },
};

export default provider;
