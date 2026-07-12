import { TEXTGEN_TYPES, OPENAI_KEYS } from '../../../../constants.js';
import { pickBy } from 'es-toolkit/compat';
import type { BackendProvider } from '../types.js';

const provider: BackendProvider = {
    type: TEXTGEN_TYPES.GENERIC,
    endpoints: { status: '/v1/models', generate: '/v1/completions' },

    buildGenerateBody(body) {
        const filtered = pickBy(body, (_, key) => OPENAI_KEYS.includes(key));
        if (Array.isArray(filtered.stop)) {
            filtered.stop = filtered.stop.slice(0, 4);
        }
        return filtered;
    },
};

export default provider;
