import { TEXTGEN_TYPES } from '../../../constants.js';
import type { BackendProvider } from './types.js';

/**
 * Lazy-loading provider map.
 *
 * A provider module is loaded **only** when its api_type is first requested.
 * This means a user running Ollama never pays the import cost for TogetherAI, etc.
 */
const providerLoader: Record<string, () => Promise<{ default: BackendProvider }>> = {
    [TEXTGEN_TYPES.GENERIC]:     () => import('./generic.js'),
    [TEXTGEN_TYPES.OOBA]:        () => import('./ooba.js'),
    [TEXTGEN_TYPES.VLLM]:        () => import('./vllm.js'),
    [TEXTGEN_TYPES.APHRODITE]:   () => import('./aphrodite.js'),
    [TEXTGEN_TYPES.KOBOLDCPP]:   () => import('./koboldcpp.js'),
    [TEXTGEN_TYPES.LLAMACPP]:    () => import('./llamacpp.js'),
    [TEXTGEN_TYPES.INFERMATICAI]: () => import('./infermaticai.js'),
    [TEXTGEN_TYPES.OPENROUTER]:  () => import('./openrouter.js'),
    [TEXTGEN_TYPES.FEATHERLESS]: () => import('./featherless.js'),
    [TEXTGEN_TYPES.TOGETHERAI]:  () => import('./togetherai.js'),
    [TEXTGEN_TYPES.DREAMGEN]:    () => import('./dreamgen.js'),
    [TEXTGEN_TYPES.MANCER]:      () => import('./mancer.js'),
    [TEXTGEN_TYPES.TABBY]:       () => import('./tabby.js'),
    [TEXTGEN_TYPES.OLLAMA]:      () => import('./ollama.js'),
    [TEXTGEN_TYPES.HUGGINGFACE]: () => import('./huggingface.js'),
};

const providerCache = new Map<string, BackendProvider>();

/**
 * Get (and lazily load) a backend provider by its api_type string.
 *
 * @throws If the type is unknown.
 */
export async function getProvider(type: string): Promise<BackendProvider> {
    const cached = providerCache.get(type);
    if (cached) return cached;

    const loader = providerLoader[type];
    if (!loader) {
        throw new Error(`Unknown backend provider type: "${type}"`);
    }

    const mod = await loader();
    providerCache.set(type, mod.default);
    return mod.default;
}

/**
 * Return all registered provider type strings (synchronous, no loading).
 */
export function getRegisteredTypes(): string[] {
    return Object.keys(providerLoader);
}
