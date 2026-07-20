import { fuzzySearchCharacters, fuzzySearchGroups, fuzzySearchPersonas, fuzzySearchTags, fuzzySearchWorldInfo, power_user } from './power-user.js';
import { tag_map } from './tags.js';
import { includesIgnoreCaseAndAccents } from './utils.js';


/**
 * @typedef FilterType The filter type possible for this filter helper
 * @type {'search'|'tag'|'folder'|'fav'|'group'|'world_info_search'|'persona_search'}
 */

/**
 * The filter types
 * @type {{ SEARCH: 'search', TAG: 'tag', FOLDER: 'folder', FAV: 'fav', GROUP: 'group', WORLD_INFO_SEARCH: 'world_info_search', PERSONA_SEARCH: 'persona_search'}}
 */
export const FILTER_TYPES = {
    SEARCH: 'search',
    TAG: 'tag',
    FOLDER: 'folder',
    FAV: 'fav',
    GROUP: 'group',
    WORLD_INFO_SEARCH: 'world_info_search',
    PERSONA_SEARCH: 'persona_search',
};

/**
 * @typedef FilterState One of the filter states
 * @property {string} key - The key of the state
 * @property {string} class - The css class for this state
 */

/**
 * The filter states
 * @type {{ SELECTED: FilterState, EXCLUDED: FilterState, UNDEFINED: FilterState, [key: string]: FilterState }}
 */
export const FILTER_STATES = {
    SELECTED: { key: 'SELECTED', class: 'selected' },
    EXCLUDED: { key: 'EXCLUDED', class: 'excluded' },
    UNDEFINED: { key: 'UNDEFINED', class: 'undefined' },
};
/** @type {string} the default filter state of `FILTER_STATES` */
export const DEFAULT_FILTER_STATE = FILTER_STATES.UNDEFINED.key;

/**
 * Robust check if one state equals the other. It does not care whether it's the state key or the state value object.
 * @param {unknown} a First state
 * @param {unknown} b Second state
 * @returns {boolean}
 */
export function isFilterState(a: unknown, b: unknown) {
    // V8 Optimization: Avoid Object.keys, .includes, and .find in hot paths
    const aKey = typeof a === 'string' ? a : (a as { key?: string })?.key;
    const bKey = typeof b === 'string' ? b : (b as { key?: string })?.key;
    return aKey === bKey && aKey !== undefined;
}

/**
 * The fuzzy search categories
 * @type {{ characters: string, worldInfo: string, personas: string, tags: string, groups: string }}
 */
export const fuzzySearchCategories = Object.freeze({
    characters: 'characters',
    worldInfo: 'worldInfo',
    personas: 'personas',
    tags: 'tags',
    groups: 'groups',
});

/**
 * Helper class for filtering data.
 */
export class FilterHelper {
    onDataChanged: () => void;
    scoreCache: Map<string, Map<string | number, number>>;
    fuzzySearchCaches: Record<string, { resultMap: Map<string, unknown> }>;
    filterData: Record<string, unknown>;
    filterFunctionsList: ((data: unknown[]) => unknown[])[];

    /**
     * Creates a new FilterHelper
     * @param {() => void} onDataChanged Callback to trigger when the filter data changes
     */
    constructor(onDataChanged: () => void) {
        this.onDataChanged = onDataChanged;
        this.scoreCache = new Map();

        // V8: Pre-initialize object shapes for hidden class predictability
        this.fuzzySearchCaches = {
            [fuzzySearchCategories.characters]: { resultMap: new Map() },
            [fuzzySearchCategories.worldInfo]: { resultMap: new Map() },
            [fuzzySearchCategories.personas]: { resultMap: new Map() },
            [fuzzySearchCategories.tags]: { resultMap: new Map() },
            [fuzzySearchCategories.groups]: { resultMap: new Map() },
        };

        this.filterData = {
            [FILTER_TYPES.SEARCH]: '',
            [FILTER_TYPES.FAV]: false,
            [FILTER_TYPES.GROUP]: false,
            [FILTER_TYPES.FOLDER]: false,
            [FILTER_TYPES.TAG]: { excluded: [], selected: [] },
            [FILTER_TYPES.WORLD_INFO_SEARCH]: '',
            [FILTER_TYPES.PERSONA_SEARCH]: '',
        };

        // V8: Bound functions array avoids dynamically extracting values and lambda allocations on every execution
        this.filterFunctionsList = [
            this.searchFilter.bind(this),
            this.favFilter.bind(this),
            this.groupFilter.bind(this),
            this.folderFilter.bind(this),
            this.tagFilter.bind(this),
            this.wiSearchFilter.bind(this),
            this.personaSearchFilter.bind(this)
        ];
    }

    /**
     * Checks if the filter data has any values.
     * @returns {boolean} Whether the filter data has any values
     */
    hasAnyFilter() {
        // V8: Replaced heavy generic recursive object iteration with fast property checks
        const fd = this.filterData as Record<string, unknown>;
        if (fd[FILTER_TYPES.SEARCH] !== '') return true;
        if (fd[FILTER_TYPES.WORLD_INFO_SEARCH] !== '') return true;
        if (fd[FILTER_TYPES.PERSONA_SEARCH] !== '') return true;
        if (fd[FILTER_TYPES.FAV] !== false) return true;
        if (fd[FILTER_TYPES.GROUP] !== false) return true;
        if (fd[FILTER_TYPES.FOLDER] !== false) return true;

        const tags = fd[FILTER_TYPES.TAG] as { selected: unknown[]; excluded: unknown[] };
        if ((tags.selected as unknown[]).length > 0 || (tags.excluded as unknown[]).length > 0) return true;

        return false;
    }

    /**
     * Applies a fuzzy search filter to the World Info data.
     * @param {unknown[]} data The data to filter. Must have a uid property.
     * @returns {unknown[]} The filtered data.
     */
    wiSearchFilter(data: unknown[]) {
        const term = this.filterData[FILTER_TYPES.WORLD_INFO_SEARCH] as string | undefined;
        if (!term) return data;

        const fuzzySearchResults: unknown = fuzzySearchWorldInfo(data, term, this.fuzzySearchCaches);
        const resultsArr = fuzzySearchResults as { item?: { uid: unknown }; score: number }[];

        const typeScores = this.scoreCache.get(FILTER_TYPES.WORLD_INFO_SEARCH) || new Map();
        const validItems = new Set();

        for (let i = 0; i < resultsArr.length; i++) {
            const res = resultsArr[i]!;
            if (res.item) {
                typeScores.set(res.item.uid, res.score);
                validItems.add(res.item);
            }
        }
        this.scoreCache.set(FILTER_TYPES.WORLD_INFO_SEARCH, typeScores);

        // V8: Avoid O(N*M) lookups inside `.filter` with a standard O(1) Set check
        const result: unknown[] = [];
        for (let i = 0; i < data.length; i++) {
            if (validItems.has(data[i])) {
                result.push(data[i]);
            }
        }
        return result;
    }

    /**
     * Applies a search filter to Persona data.
     * @param {string[]} data The data to filter.
     * @returns {string[]} The filtered data.
     */
    personaSearchFilter(data: string[]) {
        const term = this.filterData[FILTER_TYPES.PERSONA_SEARCH] as string | undefined;
        if (!term) return data;

        const fuzzySearchResults: unknown = fuzzySearchPersonas(data, term, this.fuzzySearchCaches);
        const resultsArr = fuzzySearchResults as { item?: { key: string }; score: number }[];

        const typeScores = this.scoreCache.get(FILTER_TYPES.PERSONA_SEARCH) || new Map();
        const validKeys = new Set();

        for (let i = 0; i < resultsArr.length; i++) {
            const res = resultsArr[i]!;
            if (res.item) {
                typeScores.set(res.item.key, res.score);
                validKeys.add(res.item.key);
            }
        }
        this.scoreCache.set(FILTER_TYPES.PERSONA_SEARCH, typeScores);

        const result: string[] = [];
        for (let i = 0; i < data.length; i++) {
            if (validKeys.has(data[i]!)) {
                result.push(data[i]!);
            }
        }
        return result;
    }

    /**
     * Checks if the given entity is tagged with the given tag ID.
     * @param {unknown} entity Searchable entity
     * @param {string} tagId Tag ID to check
     * @returns {boolean} Whether the entity is tagged with the given tag ID
     */
    isElementTagged(entity: unknown, tagId: string) {
        const ent = entity as { type: string; item?: { avatar?: string }; id?: string | number };
        const isCharacter = ent.type === 'character';
        const lookupValue = isCharacter ? ent.item?.avatar : String(ent.id);
        const tags = (tag_map as Record<string, string[] | undefined>)[lookupValue ?? ''];

        if (Array.isArray(tags)) {
            // V8: Native loop allows faster short-circuiting on hot property scans
            for (let i = 0; i < tags.length; i++) {
                if (tags[i] === tagId) return true;
            }
        }
        return false;
    }

    /**
     * Applies a tag filter to the data.
     * @param {unknown[]} data The data to filter.
     * @returns {unknown[]} The filtered data.
     */
    tagFilter(data: unknown[]) {
        const TAG_LOGIC_AND = true; // switch to false to use OR logic for combining tags
        const tagsData = this.filterData[FILTER_TYPES.TAG] as { selected: string[]; excluded: string[] };
        const selected = tagsData.selected;
        const excluded = tagsData.excluded;

        if (selected.length === 0 && excluded.length === 0) {
            return data;
        }

        // V8: Zero inner-closure/array allocations mapping arrays inside the evaluation loop
        const result: unknown[] = [];
        for (let i = 0; i < data.length; i++) {
            const entity = data[i];

            if ((entity as { type: string }).type === 'tag') {
                result.push(entity);
                continue;
            }

            let isExcluded = false;
            for (let j = 0; j < excluded.length; j++) {
                if (this.isElementTagged(entity, excluded[j]!)) {
                    isExcluded = true;
                    break;
                }
            }
            if (isExcluded) continue;

            if (selected.length > 0) {
                let isTagged = TAG_LOGIC_AND;
                if (TAG_LOGIC_AND) {
                    for (let j = 0; j < selected.length; j++) {
                        if (!this.isElementTagged(entity, selected[j]!)) {
                            isTagged = false;
                            break;
                        }
                    }
                } else {
                    for (let j = 0; j < selected.length; j++) {
                        if (this.isElementTagged(entity, selected[j]!)) {
                            isTagged = true;
                            break;
                        }
                    }
                }
                if (!isTagged) continue;
            }
            result.push(entity);
        }
        return result;
    }

    /**
     * Applies a favorite filter to the data.
     * @param {unknown[]} data The data to filter.
     * @returns {unknown[]} The filtered data.
     */
    favFilter(data: unknown[]) {
        const state = this.filterData[FILTER_TYPES.FAV];
        if (!isFilterState(state, FILTER_STATES.SELECTED) && !isFilterState(state, FILTER_STATES.EXCLUDED)) {
            return data;
        }

        const isSelected = isFilterState(state, FILTER_STATES.SELECTED);
        const result: unknown[] = [];

        for (let i = 0; i < data.length; i++) {
            const entity = data[i] as { type: string; item?: { fav?: boolean | string } };
            if (entity.type === 'tag') {
                result.push(entity);
                continue;
            }

            const isFav = entity.item?.fav === true || entity.item?.fav === 'true';
            if (isSelected ? isFav : !isFav) {
                result.push(entity);
            }
        }
        return result;
    }

    /**
     * Applies a group type filter to the data.
     * @param {unknown[]} data The data to filter.
     * @returns {unknown[]} The filtered data.
     */
    groupFilter(data: unknown[]) {
        const state = this.filterData[FILTER_TYPES.GROUP];
        if (!isFilterState(state, FILTER_STATES.SELECTED) && !isFilterState(state, FILTER_STATES.EXCLUDED)) {
            return data;
        }

        const isSelected = isFilterState(state, FILTER_STATES.SELECTED);
        const result: unknown[] = [];

        for (let i = 0; i < data.length; i++) {
            const entity = data[i] as { type: string };
            if (entity.type === 'tag') {
                result.push(entity);
                continue;
            }
            const isGroup = entity.type === 'group';
            if (isSelected ? isGroup : !isGroup) {
                result.push(entity);
            }
        }
        return result;
    }

    /**
     * Applies a "folder" filter to the data.
     * @param {unknown[]} data The data to filter.
     * @returns {unknown[]} The filtered data.
     */
    folderFilter(data: unknown[]) {
        const state = this.filterData[FILTER_TYPES.FOLDER];
        if (!isFilterState(state, FILTER_STATES.SELECTED) && !isFilterState(state, FILTER_STATES.EXCLUDED)) {
            return data;
        }

        const isSelected = isFilterState(state, FILTER_STATES.SELECTED);
        const result: unknown[] = [];

        for (let i = 0; i < data.length; i++) {
            const entity = data[i] as { type: string };
            const isFolder = entity.type === 'tag';
            if (isSelected ? isFolder : !isFolder) {
                result.push(entity);
            }
        }
        return result;
    }

    /**
     * Applies a search filter to the data. Uses fuzzy search if enabled.
     * @param {unknown[]} data The data to filter.
     * @returns {unknown[]} The filtered data.
     */
    searchFilter(data: unknown[]) {
        const searchValue = this.filterData[FILTER_TYPES.SEARCH] as string | undefined;
        if (!searchValue) return data;

        const useFuzzy = power_user.fuzzy_search;
        let typeScores: Map<string | number, number> | undefined;

        if (useFuzzy) {
            const fuzzySearchCharactersResults: unknown = fuzzySearchCharacters(searchValue, this.fuzzySearchCaches);
            const fuzzySearchGroupsResults: unknown = fuzzySearchGroups(searchValue, this.fuzzySearchCaches);
            const fuzzySearchTagsResult: unknown = fuzzySearchTags(searchValue, this.fuzzySearchCaches);

            const charResults = fuzzySearchCharactersResults as { refIndex: number; score: number }[];
            const groupResults = fuzzySearchGroupsResults as { item: { id: string | number }; score: number }[];
            const tagResults = fuzzySearchTagsResult as { item: { id: string | number }; score: number }[];

            typeScores = this.scoreCache.get(FILTER_TYPES.SEARCH) || new Map();

            for (let i = 0; i < charResults.length; i++) {
                typeScores.set(`character.${charResults[i]!.refIndex}`, charResults[i]!.score);
            }
            for (let i = 0; i < groupResults.length; i++) {
                typeScores.set(`group.${groupResults[i]!.item.id}`, groupResults[i]!.score);
            }
            for (let i = 0; i < tagResults.length; i++) {
                typeScores.set(`tag.${tagResults[i]!.item.id}`, tagResults[i]!.score);
            }
            this.scoreCache.set(FILTER_TYPES.SEARCH, typeScores);
        }

        const result: unknown[] = [];
        for (let i = 0; i < data.length; i++) {
            const entity = data[i] as { type: string; id?: string | number; item?: { name?: string } };
            if (useFuzzy) {
                if (typeScores && typeScores.has(`${entity.type}.${entity.id}`)) {
                    result.push(entity);
                }
            } else {
                if (includesIgnoreCaseAndAccents(entity.item?.name, searchValue as string)) {
                    result.push(entity);
                }
            }
        }
        return result;
    }

    /**
     * Sets the filter data for the given filter type.
     * @param {string} filterType The filter type to set data for.
     * @param {unknown} data The data to set.
     * @param {boolean} suppressDataChanged Whether to suppress the data changed callback.
     */
    setFilterData(filterType: string, data: unknown, suppressDataChanged = false) {
        const oldData = this.filterData[filterType];
        this.filterData[filterType] = data;

        // V8: Reference check first. `JSON.stringify` on objects is slower
        if (!suppressDataChanged && oldData !== data && JSON.stringify(oldData) !== JSON.stringify(data)) {
            this.onDataChanged();
        }
    }

    /**
     * Gets the filter data for the given filter type.
     * @param {FilterType} filterType The filter type to get data for.
     */
    getFilterData(filterType: string) {
        return this.filterData[filterType];
    }

    /**
     * Applies all filters to the given data.
     * @param {unknown[]} data - The data to filter.
     * @param {object} options - Optional call parameters
     * @param {boolean} [options.clearScoreCache] - Whether the score cache should be cleared.
     * @param {Object.<string, unknown>} [options.tempOverrides] - Temporarily override specific filters for this filter application
     * @param {boolean} [options.clearFuzzySearchCaches] - Whether the fuzzy search caches should be cleared.
     * @returns {unknown[]} The filtered data.
     */
    applyFilters(data: unknown[], options?: { clearScoreCache?: boolean; tempOverrides?: Record<string, unknown>; clearFuzzySearchCaches?: boolean }) {
        const clearScoreCache = options?.clearScoreCache !== false;
        const tempOverrides = options?.tempOverrides;
        const clearFuzzySearchCaches = options?.clearFuzzySearchCaches !== false;

        if (clearScoreCache) this.clearScoreCache();
        if (clearFuzzySearchCaches) this.clearFuzzySearchCaches();

        const originalStates: Record<string, unknown> = {};
        if (tempOverrides) {
            for (const key in tempOverrides) {
                originalStates[key] = this.filterData[key];
                this.filterData[key] = tempOverrides[key];
            }
        }

        try {
            // V8: Array iteration replaces Array.prototype.reduce, limiting closure allocations
            let result: unknown[] = data;
            for (let i = 0; i < this.filterFunctionsList.length; i++) {
                result = this.filterFunctionsList[i]!(result);
            }

            if (tempOverrides) {
                for (const key in originalStates) {
                    this.filterData[key] = originalStates[key];
                }
            }

            return result;
        } catch (error) {
            if (tempOverrides) {
                for (const key in originalStates) {
                    this.filterData[key] = originalStates[key];
                }
            }
            throw error;
        }
    }

    /**
     * Cache scores for a specific filter type
     * @param {string} type - The type of data being cached
     * @param {Iterable<[string|number, number]>} results - The search results containing mapped item identifiers and their scores
     */
    cacheScores(type: string, results: Iterable<[string | number, number]>) {
        const typeScores = this.scoreCache.get(type) || new Map();
        for (const [uid, score] of results) {
            typeScores.set(uid, score);
        }
        this.scoreCache.set(type, typeScores);
        console.debug('search scores cached', type, typeScores);
    }

    /**
     * Get the cached score for an item by type and its identifier
     * @param {string} type The type of data
     * @param {string|number} uid The unique identifier for an item
     * @returns {number|undefined} The cached score, or `undefined` if no score is present
     */
    getScore(type: string, uid: string | number) {
        return this.scoreCache.get(type)?.get(uid) ?? undefined;
    }

    /**
     * Clear the score cache for a specific type, or completely if no type is specified
     * @param {string} [type] The type of data to clear scores for. Clears all if unspecified.
     */
    clearScoreCache(type?: string) {
        if (type) {
            this.scoreCache.set(type, new Map());
        } else {
            this.scoreCache.clear();
        }
    }

    /**
     * Clears fuzzy search caches
     */
    clearFuzzySearchCaches() {
        // V8: Direct access avoids creating an array with Object.values()
        const caches = this.fuzzySearchCaches;
        caches.characters!.resultMap.clear();
        caches.worldInfo!.resultMap.clear();
        caches.personas!.resultMap.clear();
        caches.tags!.resultMap.clear();
        caches.groups!.resultMap.clear();
    }
}
