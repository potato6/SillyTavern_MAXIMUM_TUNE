/**
 * Shared OpenRouter utilities.
 *
 * Both text-completions and chat-completions need the same provider routing
 * and quantization handling.  This extracts the duplication so a bug fix
 * in one place fixes both.
 */

import { OPENROUTER_HEADERS } from '../../../constants.js';

/**
 * Normalise the OpenRouter provider routing from the incoming request body.
 *
 * The frontend sends `provider` as an array of provider names (strings).
 * OpenRouter expects an object with `order` and `allow_fallbacks`.
 * @param body
 */
export function normaliseProviderRouting(body: Record<string, unknown>): Record<string, unknown> | undefined {
    if (Array.isArray(body.provider) && (body.provider as unknown[]).length > 0) {
        return {
            allow_fallbacks: (body.allow_fallbacks as boolean) ?? true,
            order: body.provider,
        };
    }
    return undefined;
}

/**
 * Normalise quantization preferences.
 *
 * The frontend sends `quantizations` as an array of strings.
 * These need to be attached to the `provider` object when present.
 * @param providerObj
 * @param quantizations
 */
export function attachQuantizations(providerObj: Record<string, unknown> | undefined, quantizations: unknown): void {
    if (!Array.isArray(quantizations) || (quantizations as unknown[]).length === 0) return;
    const target = providerObj ?? {};
    target.quantizations = quantizations;
    // If we had to create the object, the caller needs to know
    if (!providerObj) {
        // This is used via: provider.quantizations = [...]
        // The caller must handle the assignment
    }
}

/**
 * Build the complete provider config for OpenRouter.
 *
 * Handles both provider routing and quantization in one call.
 * Returns undefined when neither is set.
 * @param body
 */
export function buildProviderConfig(body: Record<string, unknown>): Record<string, unknown> | undefined {
    const routing = normaliseProviderRouting(body);
    const hasQuantizations = Array.isArray(body.quantizations) && (body.quantizations as unknown[]).length > 0;

    if (!routing && !hasQuantizations) return undefined;

    const config = routing ?? {};
    if (hasQuantizations) {
        config.quantizations = body.quantizations;
    }
    return config;
}

export { OPENROUTER_HEADERS };
