import type { SecretKeyDescriptor } from '../common/key-types.js';

export const TTS_KEYS: SecretKeyDescriptor[] = [
    { id: 'AZURE_TTS',         label: 'Azure TTS',           category: 'tts' },
    { id: 'CUSTOM_OPENAI_TTS', label: 'Custom OpenAI TTS',   category: 'tts' },
    { id: 'ELEVENLABS',        label: 'ElevenLabs TTS',      category: 'tts' },
];
