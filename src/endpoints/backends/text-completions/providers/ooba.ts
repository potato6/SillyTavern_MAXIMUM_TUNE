import { TEXTGEN_TYPES } from '../../../../constants.js';
import type { BackendProvider } from '../types.js';

const provider: BackendProvider = {
    type: TEXTGEN_TYPES.OOBA,
    secretKey: { id: 'OOBA', label: 'Text Generation WebUI', category: 'textgen' },
    endpoints: { status: '/v1/models', generate: '/v1/completions' },

    async getModelId(baseUrl: string, headers: Record<string, string>) {
        const fetch = globalThis.fetch;
        try {
            const reply = await fetch(`${baseUrl}/v1/internal/model/info`, { headers });
            if (!reply.ok) return null;
            const info = (await reply.json()) as Record<string, unknown>;
            return (info?.model_name as string) ?? null;
        } catch {
            return null;
        }
    },
};

export default provider;
