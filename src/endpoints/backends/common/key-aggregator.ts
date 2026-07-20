import type { SecretKeyDescriptor } from './key-types.js';

/**
 * Aggregates SecretKeyDescriptors from multiple registries.
 *
 * Used to build a consolidated key map for the `/api/backends/keys` endpoint
 * without each consumer needing to import every registry individually.
 */
export class KeyAggregator {
    private sources: Array<() => SecretKeyDescriptor[] | Promise<SecretKeyDescriptor[]>> = [];

    /** Register a sync or async source of descriptors. */
    addSource(fn: () => SecretKeyDescriptor[] | Promise<SecretKeyDescriptor[]>): void {
        this.sources.push(fn);
    }

    /** Collect all descriptors from all registered sources. */
    async getAll(): Promise<SecretKeyDescriptor[]> {
        const results: SecretKeyDescriptor[] = [];
        for (const source of this.sources) {
            const descriptors = await source();
            results.push(...descriptors);
        }
        return results;
    }
}

/**
 * Build a descriptor collector from a lazy Registry<T> where each provider
 * has a `secretKey` property.
 *
 * ```ts
 * const agg = new KeyAggregator();
 * agg.addProviderRegistry(getChatProvider, getRegisteredSources);
 * agg.addProviderRegistry(getProvider, getRegisteredTypes);
 * ```
 */
export function addProviderRegistry<T extends { secretKey: SecretKeyDescriptor }>(
    agg: KeyAggregator,
    getProvider: (type: string) => Promise<T>,
    getTypes: () => string[],
): void {
    agg.addSource(async () => {
        const types = getTypes();
        const descriptors: SecretKeyDescriptor[] = [];
        for (const type of types) {
            try {
                const provider = await getProvider(type);
                if (provider.secretKey) {
                    descriptors.push(provider.secretKey);
                }
            } catch {
                // Provider might fail to load — skip gracefully
            }
        }
        return descriptors;
    });
}
