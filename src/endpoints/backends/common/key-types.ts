/**
 * Describes a secret API key that a provider or service uses.
 *
 * Every backend provider (chat-completion or text-completion) declares
 * one of these so the system can build SECRET_KEYS, FRIENDLY_NAMES, and
 * INPUT_MAP automatically — no more hardcoded lists in secrets.ts.
 *
 * Non-provider services (translate, TTS …) register their descriptors
 * separately via KEY_OVERRIDES.
 */
export interface SecretKeyDescriptor {
    /**
     * UPPER_SNAKE_CASE identifier, e.g. "OPENAI".
     * Must be unique across all registered keys.
     */
    readonly id: string;

    /**
     * Human-readable label for UI display, e.g. "OpenAI".
     */
    readonly label: string;

    /**
     * Raw storage key in secrets.json.
     *
     * Default: `api_key_${id.toLowerCase()}`.
     * Only set this for keys with non-standard names
     * (e.g. "deepl", "libre_url", "vertexai_service_account_json").
     */
    readonly storageKey?: string;

    /**
     * CSS selector for the API key <input> on the front-end settings page.
     * Optional — only needed when the front-end needs to bind an input.
     */
    readonly selector?: string;

    /**
     * Category for UI grouping / registry filtering.
     */
    readonly category?: 'chat-completion' | 'textgen' | 'translation' | 'tts' | 'image' | 'search' | 'misc';
}

/**
 * Derive the storage key for a given key descriptor.
 *
 * ```ts
 * deriveStorageKey({ id: 'OPENAI' })           // → "api_key_openai"
 * deriveStorageKey({ id: 'DEEPL', storageKey: 'deepl' })  // → "deepl"
 * ```
 */
export function deriveStorageKey(desc: Pick<SecretKeyDescriptor, 'id' | 'storageKey'>): string {
    return desc.storageKey ?? `api_key_${desc.id.toLowerCase()}`;
}
