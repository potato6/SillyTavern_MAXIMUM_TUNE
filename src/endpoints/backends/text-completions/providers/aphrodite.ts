import { TEXTGEN_TYPES } from '../../../../constants.js';
import type { BackendProvider } from '../types.js';

const provider: BackendProvider = {
    type: TEXTGEN_TYPES.APHRODITE,
    secretKey: { id: 'APHRODITE', label: 'Aphrodite', category: 'textgen' },
    endpoints: { status: '/v1/models', generate: '/v1/completions' },
};

export default provider;
