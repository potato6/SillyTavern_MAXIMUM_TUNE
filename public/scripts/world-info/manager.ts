import { saveSettings } from '../../script.js';
import { debounce } from '../utils.js';
import { debounce_timeout } from '../constants.js';
import { world_info_insertion_strategy, originalWIDataKeyMap } from './constants.js';
import { FilterHelper } from '../filters.js';
import { FILTER_TYPES } from '../filters.js';
import { StructuredCloneMap } from '../util/StructuredCloneMap.js';
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
    depth = 2;
    minActivations = 0;
    minActivationsDepthMax = 0;
    budget = 25;
    includeNames = true;
    recursive = false;
    overflowAlert = false;
    caseSensitive = false;
    matchWholeWords = false;
    useGroupScoring = false;
    characterStrategy: number = world_info_insertion_strategy.character_first;
    budgetCap = 0;
    maxRecursionSteps = 0;

    // ── Data ──
    /** Raw world_info settings blob from the server */
    info: Record<string, any> = {};
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

    /** Filter helper that re-filters on every editor navigation */
    filter: FilterHelper;

    /**
     * Debounced save helpers.
     * Kept as arrow-properties so `this` is always the manager instance.
     */
    saveWorldDebounced = debounce(
        async (name: string, data: WorldInfoBook) => await this._saveWorld(name, data),
        debounce_timeout.relaxed,
    );

    saveSettingsDebounced = debounce(
        () => {
            Object.assign(this.info, { globalSelect: this.selectedWorlds });
            saveSettings();
        },
        debounce_timeout.relaxed,
    );

    // Sort helper — used by the scanner
    sortFn = (a: any, b: any) => b.order - a.order;

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
    getEntrySetting(entry: WorldInfoEntryData, key: string): any {
        const entryVal = (entry as any)[key];
        if (entryVal !== null && entryVal !== undefined) return entryVal;
        switch (key) {
            case 'caseSensitive': return this.caseSensitive;
            case 'matchWholeWords': return this.matchWholeWords;
            case 'useGroupScoring': return this.useGroupScoring;
            default: return entryVal;
        }
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

    /** Mark settings as needing persistence */
    saveSettings() {
        this.saveSettingsDebounced();
    }

    /** Mark a world-info file save */
    saveWorld(name: string, data: WorldInfoBook, immediately = false) {
        if (!name || !data) return;
        this.cache.set(name, data);
        if (immediately) {
            return this._saveWorld(name, data);
        }
        this.saveWorldDebounced(name, data);
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
