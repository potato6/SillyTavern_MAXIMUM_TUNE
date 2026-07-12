import { TEXTGEN_TYPES, VLLM_KEYS } from '../../../constants.js';
import { pickBy } from 'es-toolkit/compat';
import type { BackendProvider } from './types.js';

const provider: BackendProvider = {
    type: TEXTGEN_TYPES.VLLM,
    endpoints: { status: '/v1/models', generate: '/v1/completions' },

    buildGenerateBody(body) {
        return pickBy(body, (_, key) => VLLM_KEYS.includes(key));
    },
};

export default provider;
