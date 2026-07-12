import { TEXTGEN_TYPES } from '../../../constants.js';
import type { BackendProvider } from './types.js';

/**
 * Lazy-loading provider map.
 *
 * A provider module is loaded **only** when its api_type is first requested.
 * This means a user running Ollama never pays the import cost for TogetherAI, etc.
 */
const providerLoader: Record<string, () => Promise<{ default: BackendProvider }>> = {
    [TEXTGEN_TYPES.GENERIC]:      () => import('./providers/generic.js'),
    [TEXTGEN_TYPES.OOBA]:         () => import('./providers/ooba.js'),
    [TEXTGEN_TYPES.VLLM]:         () => import('./providers/vllm.js'),
    [TEXTGEN_TYPES.APHRODITE]:    () => import('./providers/aphrodite.js'),
    [TEXTGEN_TYPES.KOBOLDCPP]:    () => import('./providers/koboldcpp.js'),
    [TEXTGEN_TYPES.LLAMACPP]:     () => import('./providers/llamacpp.js'),
    [TEXTGEN_TYPES.INFERMATICAI]: () => import('./providers/infermaticai.js'),
    [TEXTGEN_TYPES.OPENROUTER]:   () => import('./providers/openrouter.js'),
    [TEXTGEN_TYPES.FEATHERLESS]:  () => import('./providers/featherless.js'),
    [TEXTGEN_TYPES.TOGETHERAI]:   () => import('./providers/togetherai.js'),
    [TEXTGEN_TYPES.DREAMGEN]:     () => import('./providers/dreamgen.js'),
    [TEXTGEN_TYPES.MANCER]:       () => import('./providers/mancer.js'),
    [TEXTGEN_TYPES.TABBY]:        () => import('./providers/tabby.js'),
    [TEXTGEN_TYPES.OLLAMA]:       () => import('./providers/ollama.js'),
    [TEXTGEN_TYPES.HUGGINGFACE]:  () => import('./providers/huggingface.js'),
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
