import { TEXTGEN_TYPES } from '../../../constants.js';
import type { BackendProvider } from './types.js';

const provider: BackendProvider = {
    type: TEXTGEN_TYPES.TABBY,
    endpoints: { status: '/v1/model/list', generate: '/v1/completions' },

    async getModelId(baseUrl: string, headers: Record<string, string>) {
        const fetch = globalThis.fetch;
        try {
            const reply = await fetch(`${baseUrl}/v1/model`, { headers });
            if (!reply.ok) return null;
            const info = await reply.json() as Record<string, unknown>;
            return (info?.id as string) ?? null;
        } catch {
            return null;
        }
    },
};

export default provider;
