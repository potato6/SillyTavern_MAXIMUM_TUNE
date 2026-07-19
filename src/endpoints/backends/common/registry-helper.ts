/**
 * Generic lazy-loading registry factory.
 *
 * Both chat-completions and text-completions registries follow the exact
 * same pattern: a map of string → () => import() with a cache.  This
 * eliminates the boilerplate so each registry is just a config map.
 */

export interface Registry<T> {
    get(type: string): Promise<T>;
    getTypes(): string[];
}

/**
 * Create a lazy-loading provider registry.
 * @param loaders  Map of type string → dynamic import returning { default: T }
 */
export function createRegistry<T>(
    loaders: Record<string, () => Promise<{ default: T }>>,
): Registry<T> {
    const cache = new Map<string, T>();

    return {
        async get(type: string): Promise<T> {
            const cached = cache.get(type);
            if (cached) return cached;

            const loader = loaders[type];
            if (!loader) {
                throw new Error(`Unknown provider type: "${type}"`);
            }

            const mod = await loader();
            cache.set(type, mod.default);
            return mod.default;
        },

        getTypes(): string[] {
            return Object.keys(loaders);
        },
    };
}
