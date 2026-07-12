import { TEXTGEN_TYPES } from '../../../../constants.js';
import type { BackendProvider } from '../types.js';

const provider: BackendProvider = {
    type: TEXTGEN_TYPES.KOBOLDCPP,
    endpoints: { status: '/v1/models', generate: '/v1/completions' },
};

export default provider;
