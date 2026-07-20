import type { SecretKeyDescriptor } from '../common/key-types.js';

export const IMAGE_KEYS: SecretKeyDescriptor[] = [
    { id: 'STABILITY',    label: 'Stability AI',   category: 'image' },
    { id: 'BFL',          label: 'Black Forest Labs', category: 'image' },
    { id: 'FALAI',        label: 'FAL.AI',          category: 'image' },
    { id: 'COMFY_RUNPOD', label: 'ComfyUI RunPod',  category: 'image' },
];
