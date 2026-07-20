import { TEXTGEN_TYPES } from '../../../../constants.js';
import type { BackendProvider } from '../types.js';

const provider: BackendProvider = {
    type: TEXTGEN_TYPES.DREAMGEN,
    secretKey: { id: 'DREAMGEN', label: 'DreamGen', category: 'textgen' },
    endpoints: {
        status: '/api/openai/v1/models',
        generate: '/api/openai/v1/completions',
    },
    buildGenerateBody(body) {
        // DreamGen passes the body through as-is.
        return { ...body };
    },
};

export default provider;
