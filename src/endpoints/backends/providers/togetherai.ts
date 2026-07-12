import { TEXTGEN_TYPES, TOGETHERAI_KEYS } from '../../../constants.js';
import { pickBy } from 'es-toolkit/compat';
import type { BackendProvider } from './types.js';

const provider: BackendProvider = {
    type: TEXTGEN_TYPES.TOGETHERAI,
    endpoints: { status: '/api/models?&info', generate: '/v1/completions' },

    buildGenerateBody(body) {
        return pickBy(body, (_, key) => TOGETHERAI_KEYS.includes(key));
    },

    buildStatusResponse(data: unknown) {
        if (Array.isArray(data)) {
            return { data: data.map((x: Record<string, unknown>) => ({ id: x.name, ...x })) };
        }
        return data;
    },
};

export default provider;
