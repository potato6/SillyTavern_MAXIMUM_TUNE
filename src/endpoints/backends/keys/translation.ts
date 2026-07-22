import type { SecretKeyDescriptor } from '../common/key-types.js';

export const TRANSLATION_KEYS: SecretKeyDescriptor[] = [
    { id: 'DEEPL', label: 'DeepL', category: 'translation', storageKey: 'deepl' },
    { id: 'LIBRE', label: 'LibreTranslate', category: 'translation', storageKey: 'libre' },
    {
        id: 'LIBRE_URL',
        label: 'LibreTranslate Endpoint',
        category: 'translation',
        storageKey: 'libre_url',
    },
    {
        id: 'LINGVA_URL',
        label: 'Lingva Endpoint',
        category: 'translation',
        storageKey: 'lingva_url',
    },
    {
        id: 'ONERING_URL',
        label: 'OneRingTranslator Endpoint',
        category: 'translation',
        storageKey: 'oneringtranslator_url',
    },
    {
        id: 'DEEPLX_URL',
        label: 'DeepLX Endpoint',
        category: 'translation',
        storageKey: 'deeplx_url',
    },
];
