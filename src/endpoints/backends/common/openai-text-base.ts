/**
 * Factory for OpenAI-compatible text-completion providers.
 *
 * vllm, featherless, generic, togetherai, and infermaticai all follow the
 * same pattern: filter request body keys with `pickBy`, optionally transform
 * the status response, and optionally transform the generate response.
 *
 * This factory reduces 5 providers from ~93 total lines to ~25.
 */

import { pickBy } from 'es-toolkit/compat';
import type { BackendProvider } from '../text-completions/types.js';
import { PROVIDER_ENDPOINTS } from '../text-completions/types.js';
import type { SecretKeyDescriptor } from './key-types.js';

export interface OAITextProviderConfig {
    /** TEXTGEN_TYPES value. */
    type: string;
    /** Secret key descriptor for API authentication. */
    secretKey: SecretKeyDescriptor;
    /** Allowed key whitelist. */
    allowedKeys: string[];
    /** Extra body mutations applied after key filtering. */
    extraTransform?: (body: Record<string, unknown>) => void;
    /** Rewrap a provider-specific status response into OAI shape. */
    buildStatusResponse?: (data: unknown) => unknown;
    /** Transform the generate response before sending to client. */
    transformGenerateResponse?: (data: Record<string, unknown>) => Record<string, unknown>;
    /** Fetch extra model identification (e.g. Ooba, Tabby). */
    getModelId?: (baseUrl: string, headers: Record<string, string>) => Promise<string | null>;
}

/**
 * Create a minimal BackendProvider for an OpenAI-compatible text endpoint.
 * @param cfg
 */
export function createOAITextProvider(cfg: OAITextProviderConfig): BackendProvider {
    const {
        type,
        secretKey,
        allowedKeys,
        extraTransform,
        buildStatusResponse,
        transformGenerateResponse,
        getModelId,
    } = cfg;

    const provider: BackendProvider = {
        type,
        secretKey,
        endpoints: PROVIDER_ENDPOINTS[type] ?? { status: '/v1/models', generate: '/v1/completions' },

        buildGenerateBody(body: Record<string, unknown>): Record<string, unknown> {
            const filtered = pickBy(body, (_, key) => allowedKeys.includes(key));
            if (extraTransform) extraTransform(filtered);
            return filtered;
        },
    };

    if (buildStatusResponse) provider.buildStatusResponse = buildStatusResponse;
    if (transformGenerateResponse) provider.transformGenerateResponse = transformGenerateResponse;
    if (getModelId) provider.getModelId = getModelId;

    return provider;
}
