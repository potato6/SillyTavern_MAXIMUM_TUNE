/**
 * Simple in-memory model cache with TTL.
 *
 * Keyed by `<source>:<baseUrl>` so switching endpoints or providers
 * invalidates automatically.  All model lists are fetched from the
 * provider's /v1/models endpoint — no hardcoded model names anywhere.
 */

export interface ModelEntry {
    id: string;
    [key: string]: unknown;
}

interface CacheEntry {
    models: ModelEntry[];
    timestamp: number;
}

const DEFAULT_TTL_MS = 60_000; // 60 seconds
const store = new Map<string, CacheEntry>();

/**
 *
 * @param source
 * @param baseUrl
 */
function cacheKey(source: string, baseUrl: string): string {
    return `${source}:${baseUrl}`;
}

/**
 * Check freshness without returning data.
 * @param source
 * @param baseUrl
 */
export function isFresh(source: string, baseUrl: string): boolean {
    const entry = store.get(cacheKey(source, baseUrl));
    return !!entry && (Date.now() - entry.timestamp) < DEFAULT_TTL_MS;
}

/**
 * Get cached models (or null if absent / stale).
 * @param source
 * @param baseUrl
 */
export function getCachedModels(source: string, baseUrl: string): ModelEntry[] | null {
    const entry = store.get(cacheKey(source, baseUrl));
    if (!entry) return null;
    if ((Date.now() - entry.timestamp) >= DEFAULT_TTL_MS) {
        store.delete(cacheKey(source, baseUrl));
        return null;
    }
    return entry.models;
}

/**
 * Store models in the cache.
 * @param source
 * @param baseUrl
 * @param models
 */
export function setCachedModels(source: string, baseUrl: string, models: ModelEntry[]): void {
    store.set(cacheKey(source, baseUrl), {
        models,
        timestamp: Date.now(),
    });
}

/**
 * Invalidate cache for a specific provider/baseUrl combo.
 * @param source
 * @param baseUrl
 */
export function invalidateCache(source: string, baseUrl: string): void {
    store.delete(cacheKey(source, baseUrl));
}

/**
 * Invalidate all cached model lists (e.g. when connection settings change).
 */
export function clearAllCaches(): void {
    store.clear();
}
