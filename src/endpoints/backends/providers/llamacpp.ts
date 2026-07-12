import { TEXTGEN_TYPES } from '../../../constants.js';
import type { BackendProvider } from './types.js';

const provider: BackendProvider = {
    type: TEXTGEN_TYPES.LLAMACPP,
    endpoints: { status: '/v1/models', generate: '/completion', props: '/props' },
};

export default provider;
