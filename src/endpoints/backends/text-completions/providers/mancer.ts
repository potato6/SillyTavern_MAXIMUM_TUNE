import { TEXTGEN_TYPES } from '../../../../constants.js';
import type { BackendProvider } from '../types.js';

const provider: BackendProvider = {
    type: TEXTGEN_TYPES.MANCER,
    secretKey: { id: 'MANCER', label: 'Mancer', category: 'textgen' },
    endpoints: {
        status: '/oai/v1/models',
        generate: '/oai/v1/completions',
    },
};

export default provider;
