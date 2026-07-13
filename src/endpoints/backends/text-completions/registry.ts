import { TEXTGEN_TYPES } from '../../../constants.js';
import type { BackendProvider } from './types.js';
import { createRegistry } from '../common/registry-helper.js';

const registry = createRegistry<BackendProvider>({
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
});

export const getProvider = registry.get;
export const getRegisteredTypes = registry.getTypes;
