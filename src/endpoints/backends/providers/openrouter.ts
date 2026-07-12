import { TEXTGEN_TYPES, OPENROUTER_KEYS } from '../../../constants.js';
import { pickBy } from 'es-toolkit/compat';
import type { BackendProvider } from './types.js';

const provider: BackendProvider = {
    type: TEXTGEN_TYPES.OPENROUTER,
    endpoints: { status: '/v1/models', generate: '/v1/chat/completions' },

    buildGenerateBody(body: Record<string, unknown>): Record<string, unknown> {
        // Clone to avoid mutating the original request body.
        const out = { ...body };

        // Provider routing / ordering.
        if (Array.isArray(out.provider) && (out.provider as unknown[]).length > 0) {
            out.provider = {
                allow_fallbacks: (out.allow_fallbacks as boolean) ?? true,
                order: out.provider,
            };
        } else {
            delete out.provider;
        }

        // Quantization preferences.
        if (Array.isArray(out.quantizations) && (out.quantizations as unknown[]).length > 0) {
            (out.provider as Record<string, unknown>) ??= {};
            (out.provider as Record<string, unknown>).quantizations = out.quantizations;
        }

        // Filter to allowed keys only.
        return pickBy(out, (_, key) => OPENROUTER_KEYS.includes(key));
    },
};

export default provider;
