import { TEXTGEN_TYPES } from '../../../../constants.js';
import type { BackendProvider } from '../types.js';

const provider: BackendProvider = {
    type: TEXTGEN_TYPES.HUGGINGFACE,
    secretKey: { id: 'HUGGINGFACE', label: 'Hugging Face', category: 'textgen' },
    endpoints: { status: '/info', generate: '/v1/completions' },

    buildStatusResponse() {
        // HuggingFace inference endpoints don't expose a model list.
        return { data: [] };
    },
};

export default provider;
