import { Elysia } from 'elysia';
import { KeyAggregator, addProviderRegistry } from './common/key-aggregator.js';
import { getChatProvider, getRegisteredSources } from './chat-completions/registry.js';
import { getProvider, getRegisteredTypes } from './text-completions/registry.js';
import { TRANSLATION_KEYS } from './keys/translation.js';
import { TTS_KEYS } from './keys/tts.js';
import { IMAGE_KEYS } from './keys/image.js';
import { SEARCH_KEYS } from './keys/search.js';
import { MISC_KEYS } from './keys/misc.js';

export const router = new Elysia({ prefix: '/api/backends/keys' })
    /**
     * GET /
     *
     * Returns all known SecretKeyDescriptors aggregated from:
     *   1. Chat-completion provider registry
     *   2. Text-completion provider registry
     *   3. Non-provider key registries (translation, TTS, image, search, misc)
     *
     * The frontend fetches this once at startup to build SECRET_KEYS,
     * FRIENDLY_NAMES, and INPUT_MAP without any hardcoded lists.
     */
    .get('/', async () => {
        try {
            const agg = new KeyAggregator();

            // Chat-completion providers
            addProviderRegistry(agg, getChatProvider, getRegisteredSources);

            // Text-completion providers
            addProviderRegistry(agg, getProvider, getRegisteredTypes);

            // Non-provider keys — imported from per-category modules
            agg.addSource(() => [
                ...TRANSLATION_KEYS,
                ...TTS_KEYS,
                ...IMAGE_KEYS,
                ...SEARCH_KEYS,
                ...MISC_KEYS,
            ]);

            const descriptors = await agg.getAll();

            // Deduplicate by id (providers shared across chat + text registries
            // like OPENROUTER should only appear once).
            const seen = new Set<string>();
            const unique = descriptors.filter((d) => {
                if (seen.has(d.id)) return false;
                seen.add(d.id);
                return true;
            });

            return unique;
        } catch (error) {
            console.error('Failed to aggregate key descriptors:', error);
            return new Response(JSON.stringify({ error: true }), { status: 500 });
        }
    });
