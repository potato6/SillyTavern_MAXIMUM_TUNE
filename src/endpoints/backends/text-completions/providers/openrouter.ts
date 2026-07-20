import { TEXTGEN_TYPES, OPENROUTER_KEYS } from '../../../../constants.js';
import { pickBy } from 'es-toolkit/compat';
import { buildProviderConfig } from '../../common/provider-routing.js';
import type { BackendProvider } from '../types.js';

const provider: BackendProvider = {
    type: TEXTGEN_TYPES.OPENROUTER,
    secretKey: { id: 'OPENROUTER', label: 'OpenRouter', category: 'textgen' },
    endpoints: { status: '/v1/models', generate: '/v1/chat/completions' },

    buildGenerateBody(body: Record<string, unknown>): Record<string, unknown> {
        // Clone to avoid mutating the original request body.
        const out = { ...body };

        // Provider routing / ordering + quantization — shared impl.
        const providerConfig = buildProviderConfig(out);
        if (providerConfig) {
            out.provider = providerConfig;
        } else {
            delete out.provider;
        }

        // Filter to allowed keys only.
        return pickBy(out, (_, key) => OPENROUTER_KEYS.includes(key));
    },
};

export default provider;
