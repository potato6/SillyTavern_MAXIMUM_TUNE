import { TEXTGEN_TYPES } from '../../../constants.js';
import type { BackendProvider } from './types.js';

const provider: BackendProvider = {
    type: TEXTGEN_TYPES.MANCER,
    endpoints: {
        status: '/oai/v1/models',
        generate: '/oai/v1/completions',
    },
};

export default provider;
