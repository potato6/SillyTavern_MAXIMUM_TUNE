import express from 'express';
import { KeyAggregator, addProviderRegistry } from './common/key-aggregator.js';
import type { SecretKeyDescriptor } from './common/key-types.js';
import { getChatProvider, getRegisteredSources } from './chat-completions/registry.js';
import { getProvider, getRegisteredTypes } from './text-completions/registry.js';

export const router = express.Router();

/**
 * Non-provider key overrides (translate, TTS, etc.) that aren't
 * covered by chat-completion or text-completion registries.
 */
const KEY_OVERRIDES: SecretKeyDescriptor[] = [
    // Translation
    { id: 'DEEPL',           label: 'DeepL',                       category: 'translation', storageKey: 'deepl' },
    { id: 'LIBRE',           label: 'LibreTranslate',              category: 'translation', storageKey: 'libre' },
    { id: 'LIBRE_URL',       label: 'LibreTranslate Endpoint',     category: 'translation', storageKey: 'libre_url' },
    { id: 'LINGVA_URL',      label: 'Lingva Endpoint',             category: 'translation', storageKey: 'lingva_url' },
    { id: 'ONERING_URL',     label: 'OneRingTranslator Endpoint',  category: 'translation', storageKey: 'oneringtranslator_url' },
    { id: 'DEEPLX_URL',      label: 'DeepLX Endpoint',            category: 'translation', storageKey: 'deeplx_url' },
    // TTS
    { id: 'AZURE_TTS',       label: 'Azure TTS',                   category: 'tts' },
    { id: 'CUSTOM_OPENAI_TTS', label: 'Custom OpenAI TTS',         category: 'tts' },
    { id: 'ELEVENLABS',      label: 'ElevenLabs TTS',              category: 'tts' },
    // Image
    { id: 'STABILITY',       label: 'Stability AI',                category: 'image' },
    { id: 'BFL',             label: 'Black Forest Labs',           category: 'image' },
    { id: 'FALAI',           label: 'FAL.AI',                      category: 'image' },
    { id: 'COMFY_RUNPOD',    label: 'ComfyUI RunPod',              category: 'image' },
    // Search
    { id: 'SERPAPI',         label: 'SerpApi',                     category: 'search' },
    { id: 'SERPER',          label: 'Serper',                      category: 'search' },
    { id: 'TAVILY',          label: 'Tavily',                      category: 'search' },
    // Misc
    { id: 'HORDE',           label: 'AI Horde',                    category: 'misc' },
    { id: 'NOVEL',           label: 'NovelAI',                     category: 'misc' },
    { id: 'NOMICAI',         label: 'NomicAI',                     category: 'misc' },
    { id: 'VERTEXAI_SERVICE_ACCOUNT', label: 'Google Vertex AI (Service Account)', category: 'misc', storageKey: 'vertexai_service_account_json' },
    { id: 'MINIMAX_GROUP_ID', label: 'MiniMax Group ID',           category: 'misc', storageKey: 'minimax_group_id' },
    { id: 'VOLCENGINE_APP_ID', label: 'Volcengine App ID',         category: 'misc', storageKey: 'volcengine_app_id' },
    { id: 'VOLCENGINE_ACCESS_KEY', label: 'Volcengine Access Key', category: 'misc', storageKey: 'volcengine_access_key' },
];

/**
 * GET /api/backends/keys
 *
 * Returns all known SecretKeyDescriptors aggregated from:
 *   1. Chat-completion provider registry
 *   2. Text-completion provider registry
 *   3. Hardcoded KEY_OVERRIDES (translate, TTS, image, search, misc)
 *
 * The frontend fetches this once at startup to build SECRET_KEYS,
 * FRIENDLY_NAMES, and INPUT_MAP without any hardcoded lists.
 */
router.get('/', async (_req: express.Request, res: express.Response) => {
    try {
        const agg = new KeyAggregator();

        // Chat-completion providers
        addProviderRegistry(agg, getChatProvider, getRegisteredSources);

        // Text-completion providers
        addProviderRegistry(agg, getProvider, getRegisteredTypes);

        // Static overrides
        agg.addSource(() => KEY_OVERRIDES);

        const descriptors = await agg.getAll();

        // Deduplicate by id (providers shared across chat + text registries
        // like OPENROUTER should only appear once).
        const seen = new Set<string>();
        const unique = descriptors.filter(d => {
            if (seen.has(d.id)) return false;
            seen.add(d.id);
            return true;
        });

        res.json(unique);
    } catch (error) {
        console.error('Failed to aggregate key descriptors:', error);
        res.status(500).json({ error: true });
    }
});
