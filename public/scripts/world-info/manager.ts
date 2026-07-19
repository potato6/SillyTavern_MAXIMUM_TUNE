import { saveSettings } from '../../script.js';
import { world_info_insertion_strategy } from './constants.js';
import { FilterHelper } from '../filters.js';
import { StructuredCloneMap } from '../util/StructuredCloneMap.js';
import { WorldInfoStore } from './store.js';
import type { WorldInfoEntryData, WorldInfoBook } from './types.js';

/**
 * Centralised state for the World Info system.
 *
 * Replaces the 15+ module-level `export let` globals that were previously
 * scattered through world-info.ts.  External code continues to access the
 * legacy re-exports from world-info.ts; internally every consumer goes
 * through this manager.
 */
class WorldInfoManager {
    // ── Settings ──
    depth: number = 2;
    minActivations: number = 0;
    minActivationsDepthMax: number = 0;
    budget: number = 25;
    includeNames: boolean = true;
    recursive: boolean = false;
    overflowAlert: boolean = false;
    caseSensitive: boolean = false;
    matchWholeWords: boolean = false;
    useGroupScoring: boolean = false;
    characterStrategy: number = world_info_insertion_strategy.character_first;
    budgetCap: number = 0;
    maxRecursionSteps: number = 0;

    // ── Data ──
    /** Raw world_info settings blob from the server */
    info: Record<string, unknown> = {};
    /** Currently-selected global lorebook names */
    selectedWorlds: string[] = [];
    /** All known lorebook filenames */
    worldNames: string[] = [];

    // ── Cache ──
    /** In-memory cache of loaded WI books (deep-clones on get, stores ref on set) */
    cache = new StructuredCloneMap({ cloneOnGet: true, cloneOnSet: false });

    // ── Editor state ──
    /** Current sort order key (persisted to accountStorage) */
    sortOrderKey = 'world_info_sort_order';
    /** Metadata key stored in chat_metadata */
    metadataKey = 'world_info';

    // ── EntityStore instances (one per book) ──
    /** Lazy-initialized per-book WorldInfoStore instances */
    private stores = new Map<string, WorldInfoStore>();

    /** Filter helper that re-filters on every editor navigation */
    filter: FilterHelper;

    /**
     * Save helpers.
     * Kept as arrow-properties so `this` is always the manager instance.
     */
    saveWorldNow = async (name: string, data: WorldInfoBook) => {
        return await this._saveWorld(name, data);
    };

    saveSettingsNow = () => {
        Object.assign(this.info, { globalSelect: this.selectedWorlds });
        saveSettings();
    };

    // Sort helper — used by the scanner
    sortFn = (a: { order: number }, b: { order: number }) => b.order - a.order;

    /** Mutable reference — displayWorldEntries replaces this each navigation */
    onDataChanged: () => void = () => {};

    constructor() {
        this.filter = new FilterHelper(() => this.onDataChanged());
    }

    // ── Settings helpers ──

    setUpdateEditor(fn: () => void) {
        this.onDataChanged = fn;
    }

    /** Bulk-apply settings */
    applySettings(settings: Partial<{
        depth: number;
        minActivations: number;
        minActivationsDepthMax: number;
        budget: number;
        includeNames: boolean;
        recursive: boolean;
        overflowAlert: boolean;
        caseSensitive: boolean;
        matchWholeWords: boolean;
        characterStrategy: number;
        budgetCap: number;
        useGroupScoring: boolean;
        maxRecursionSteps: number;
    }>) {
        if (settings.depth !== undefined) this.depth = Number(settings.depth);
        if (settings.minActivations !== undefined) this.minActivations = Number(settings.minActivations);
        if (settings.minActivationsDepthMax !== undefined) this.minActivationsDepthMax = Number(settings.minActivationsDepthMax);
        if (settings.budget !== undefined) this.budget = Number(settings.budget);
        if (settings.includeNames !== undefined) this.includeNames = Boolean(settings.includeNames);
        if (settings.recursive !== undefined) this.recursive = Boolean(settings.recursive);
        if (settings.overflowAlert !== undefined) this.overflowAlert = Boolean(settings.overflowAlert);
        if (settings.caseSensitive !== undefined) this.caseSensitive = Boolean(settings.caseSensitive);
        if (settings.matchWholeWords !== undefined) this.matchWholeWords = Boolean(settings.matchWholeWords);
        if (settings.characterStrategy !== undefined) this.characterStrategy = Number(settings.characterStrategy);
        if (settings.budgetCap !== undefined) this.budgetCap = Number(settings.budgetCap);
        if (settings.useGroupScoring !== undefined) this.useGroupScoring = Boolean(settings.useGroupScoring);
        if (settings.maxRecursionSteps !== undefined) this.maxRecursionSteps = Number(settings.maxRecursionSteps);
    }

    /** Get a resolved entry setting, falling back to the global default */
    getEntrySetting(entry: WorldInfoEntryData, key: string): unknown {
        const entryVal = (entry as unknown as Record<string, unknown>)[key];
        if (entryVal !== null && entryVal !== undefined) return entryVal;
        switch (key) {
            case 'caseSensitive': return this.caseSensitive;
            case 'matchWholeWords': return this.matchWholeWords;
            case 'useGroupScoring': return this.useGroupScoring;
            default: return entryVal;
        }
    }

    // ── Store management ──

    /**
     * Get or create a WorldInfoStore for the given book.
     * Stores are lazily initialized on first access.
     */
    getStore(bookName: string): WorldInfoStore {
        if (!this.stores.has(bookName)) {
            this.stores.set(bookName, new WorldInfoStore(bookName));
        }
        return this.stores.get(bookName)!;
    }

    /**
     * Load a book's entries from the server into its store.
     * Replaces all existing entries in the store.
     */
    async loadBookIntoStore(name: string): Promise<WorldInfoBook | null> {
        const book = await this.loadWorld(name);
        if (book) {
            const store = this.getStore(name);
            await store.init();
            const entries = Object.values(book.entries ?? {});
            if (entries.length > 0) {
                await store.replaceAllEntries(entries);
            }
        }
        return book;
    }

    /**
     * Serialize a store's entries back into a book object and persist to server.
     */
    async saveStoreToServer(name: string, metadata: Partial<WorldInfoBook> = {}): Promise<void> {
        const store = this.getStore(name);
        const entries = await store.toObject();
        const book: WorldInfoBook = { ...metadata, entries };
        await this.saveWorld(name, book);
    }

    /**
     * Release a store (e.g. when a book is deleted).
     */
    releaseStore(name: string): void {
        this.stores.delete(name);
    }

    // ── Persistence ──

    private async _saveWorld(name: string, data: WorldInfoBook) {
        const { getRequestHeaders } = await import('../../script.js');
        await fetch('/api/worldinfo/edit', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name, data }),
        });
    }

    /** Mark settings as needing persistence (immediate, not debounced) */
    saveSettings() {
        this.saveSettingsNow();
    }

    /** Mark a world-info file save (saves immediately, no debounce) */
    async saveWorld(name: string, data: WorldInfoBook) {
        if (!name || !data) return;
        this.cache.set(name, data);
        return await this._saveWorld(name, data);
    }

    /** Load a WI book, using cache if available */
    async loadWorld(name: string): Promise<WorldInfoBook | null> {
        if (!name) return null;
        if (this.cache.has(name)) return this.cache.get(name) as WorldInfoBook;
        const { getRequestHeaders } = await import('../../script.js');
        const response = await fetch('/api/worldinfo/get', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name }),
            cache: 'no-cache',
        });
        if (response.ok) {
            const data = await response.json() as WorldInfoBook;
            this.cache.set(name, data);
            return data;
        }
        return null;
    }
}

/** Singleton instance */
export const wiManager = new WorldInfoManager();
