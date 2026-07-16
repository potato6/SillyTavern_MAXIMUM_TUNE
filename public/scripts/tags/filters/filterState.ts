/**
 * Filter state module — manages tag filter state, three-state toggle logic,
 * actionable tags, and filter persistence across contexts.
 */

import {
    FILTER_TYPES,
    FILTER_STATES,
    DEFAULT_FILTER_STATE,
    isFilterState,
} from '../../filters.js';

import {
    entitiesFilter,
    saveSettingsDebounced,
    characters,
    DEFAULT_PRINT_TIMEOUT,
} from '../../../script.js';

import {
    groupCandidatesFilter,
    groupMembersFilter,
    groups,
    selected_group,
} from '../../group-chats.js';

import { tag_filter_type } from '../types.js';
import { tags, tag_map, getTagIdsFromDOM } from '../store/tagStore.js';
import { accountStorage } from '../../util/AccountStorage.js';
import { power_user } from '../../power-user.js';
import { flashHighlight, onlyUnique } from '../../utils.js';
import { getOpenBogusFolders, isBogusFolder } from '../folders/bogusFolders.js';
import { getFilterContext, getFilterHelper, isMainCharacterList, getFilterStorageKey } from './filterContext.js';

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const ACTIONABLE_FILTER_STORAGE_KEYS = Object.freeze({
    GROUP: 'TagFilterState_GROUP',
    FAV: 'TagFilterState_FAV',
    FOLDER: 'TagFilterState_FOLDER',
});

/**
 * A collection of global actionable tags for the filter panel.
 *
 * Tags with `filter_state` property (FAV, GROUP, FOLDER) maintain persistent state:
 * - Each context (character list, group candidates, group members) saves state independently
 * - Main character list also maintains tag.filter_state for backward compatibility
 *
 * Tags without `filter_state` (VIEW, HINT, UNFILTER) are action buttons only.
 */
const ACTIONABLE_TAGS: {
    [key: string]: {
        id: string;
        sort_order?: number;
        name: string;
        color?: string;
        filter_state?: undefined;
        action: ((...args: any[]) => void) | undefined;
        icon?: string;
        class?: string;
    };
    FAV: { id: string; sort_order: number; name: string; color: string; filter_state: undefined; action: ((...args: any[]) => void) | undefined; icon: string; class: string };
    GROUP: { id: string; sort_order: number; name: string; color: string; filter_state: undefined; action: ((...args: any[]) => void) | undefined; icon: string; class: string };
    FOLDER: { id: string; sort_order: number; name: string; color: string; filter_state: undefined; action: ((...args: any[]) => void) | undefined; icon: string; class: string };
    VIEW: { id: string; sort_order: number; name: string; color: string; action: ((...args: any[]) => void) | undefined; icon: string; class: string };
    HINT: { id: string; sort_order: number; name: string; color: string; action: ((...args: any[]) => void) | undefined; icon: string; class: string };
    UNFILTER: { id: string; sort_order: number; name: string; action: ((...args: any[]) => void) | undefined; icon: string; class: string };
} = {
    FAV: { id: '1', sort_order: 1, name: 'Show only favorites', color: 'rgba(255, 255, 0, 0.5)', filter_state: undefined, action: undefined, icon: 'fa-solid fa-star', class: 'filterByFavorites' },
    GROUP: { id: '0', sort_order: 2, name: 'Show only groups', color: 'rgba(100, 100, 100, 0.5)', filter_state: undefined, action: undefined, icon: 'fa-solid fa-users', class: 'filterByGroups' },
    FOLDER: { id: '4', sort_order: 3, name: 'Show only folders', color: 'rgba(120, 120, 120, 0.5)', filter_state: undefined, action: undefined, icon: 'fa-solid fa-folder-plus', class: 'filterByFolder' },
    VIEW: { id: '2', sort_order: 4, name: 'Manage tags', color: 'rgba(150, 100, 100, 0.5)', action: undefined, icon: 'fa-solid fa-gear', class: 'manageTags' },
    HINT: { id: '3', sort_order: 5, name: 'Show Tag List', color: 'rgba(150, 100, 100, 0.5)', action: undefined, icon: 'fa-solid fa-tags', class: 'showTagList' },
    UNFILTER: { id: '5', sort_order: 6, name: 'Clear all filters', action: undefined, icon: 'fa-solid fa-filter-circle-xmark', class: 'clearAllFilters' },
};

/**
 * Map of tag IDs to their corresponding filter types.
 * Used for actionable tags (Favorites, Groups, Folders).
 */
const TAG_ID_TO_FILTER_TYPE = new Map([
    [ACTIONABLE_TAGS.FAV.id, FILTER_TYPES.FAV],
    [ACTIONABLE_TAGS.GROUP.id, FILTER_TYPES.GROUP],
    [ACTIONABLE_TAGS.FOLDER.id, FILTER_TYPES.FOLDER],
]);

/** @type {{[key: string]: Tag}} An optional list of actionables that can be utilized by extensions */
const InListActionable = {
};

// ──────────────────────────────────────────────
// Actionable tags initialization (breaks circular deps)
// ──────────────────────────────────────────────

// Forward declarations for action functions that will be set during init
let _filterByFav: (filterHelper: any) => void;
let _filterByGroups: (filterHelper: any) => void;
let _filterByFolder: (filterHelper: any) => void;
let _onViewTagsListClick: () => void;
let _onTagListHintClick: () => void;
let _onClearAllFiltersClick: (filterHelper: any) => void;

/**
 * Sets the action references on ACTIONABLE_TAGS to break circular dependencies.
 * Must be called from the coordinator after all action functions are defined.
 */
function initActionableTags() {
    _filterByFav = filterByFav;
    _filterByGroups = filterByGroups;
    _filterByFolder = filterByFolder;

    // These are defined elsewhere (UI layer) and injected here
    // They are expected to be set by the coordinator
    ACTIONABLE_TAGS.FAV.action = filterByFav;
    ACTIONABLE_TAGS.GROUP.action = filterByGroups;
    ACTIONABLE_TAGS.FOLDER.action = filterByFolder;
    ACTIONABLE_TAGS.VIEW.action = _onViewTagsListClick;
    ACTIONABLE_TAGS.HINT.action = _onTagListHintClick;
    ACTIONABLE_TAGS.UNFILTER.action = _onClearAllFiltersClick;
}

/**
 * Registers external action functions into the ACTIONABLE_TAGS object.
 * Called by the coordinator to wire up UI-layer functions without circular imports.
 */
function registerActionableTagActions(actions: {
    onViewTagsListClick: () => void;
    onTagListHintClick: () => void;
    onClearAllFiltersClick: (filterHelper: any) => void;
}) {
    _onViewTagsListClick = actions.onViewTagsListClick;
    _onTagListHintClick = actions.onTagListHintClick;
    _onClearAllFiltersClick = actions.onClearAllFiltersClick;

    ACTIONABLE_TAGS.VIEW.action = actions.onViewTagsListClick;
    ACTIONABLE_TAGS.HINT.action = actions.onTagListHintClick;
    ACTIONABLE_TAGS.UNFILTER.action = actions.onClearAllFiltersClick;
}

// ──────────────────────────────────────────────
// Filter visibility settings
// ──────────────────────────────────────────────

/**
 * Gets the power_user setting key for tag filter visibility for a given context.
 * @param {number} type - The tag_filter_type
 * @returns {string} The power_user setting key
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
function getTagFilterVisibilitySetting(type) {
    switch (type) {
        case tag_filter_type.character:
            return 'show_tag_filters';
        case tag_filter_type.group_candidates_list:
            return 'show_tag_filters_group_candidates';
        case tag_filter_type.group_members_list:
            return 'show_tag_filters_group_members';
        default:
            return 'show_tag_filters';
    }
}

/**
 * Gets the tag filter visibility state for a given context.
 * @param {number} type - The tag_filter_type
 * @returns {boolean} Whether tag filters should be shown
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
function getTagFilterVisibility(type) {
    const settingKey = getTagFilterVisibilitySetting(type);
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    return power_user[settingKey] ?? false;
}

/**
 * Sets the tag filter visibility state for a given context.
 * @param {number} type - The tag_filter_type
 * @param {boolean} visible - Whether tag filters should be shown
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
function setTagFilterVisibility(type, visible) {
    const settingKey = getTagFilterVisibilitySetting(type);
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    power_user[settingKey] = visible;
    saveSettingsDebounced();
}

// ──────────────────────────────────────────────
// Filter state helpers
// ──────────────────────────────────────────────

/**
 * Determines the filter state for a tag based on context.
 * For actionable tags: reads from persisted state via filter helper.
 * For regular tags: reads from the filter helper's TAG filter data.
 * @param {FilterHelper} filterHelper - The filter helper for the current context
 * @param {object} tag - The tag object
 * @param {boolean} isFilterActionable - Whether the tag is an actionable filter tag
 * @returns {string} The filter state
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'filterHelper' implicitly has an 'any' t... Remove this comment to see the full error message
function determineTagFilterState(filterHelper, tag, isFilterActionable) {
    if (isFilterActionable) {
        // For actionable tags: read from filter helper (which is loaded from storage)
        const filterType = TAG_ID_TO_FILTER_TYPE.get(tag.id) || null;
        if (filterType) {
            return filterHelper.getFilterData(filterType) || DEFAULT_FILTER_STATE;
        }
    } else {
        // For regular tags: read from the filter helper's TAG filter data
        const tagFilterData = filterHelper.getFilterData(FILTER_TYPES.TAG);
        if (tagFilterData.excluded.includes(tag.id)) {
            return 'EXCLUDED';
        }
        if (tagFilterData.selected.includes(tag.id)) {
            return 'SELECTED';
        }
    }

    return DEFAULT_FILTER_STATE;
}

/**
 * Toggle the filter state of a given tag element
 * @param {JQuery<HTMLElement>} element - The jquery element representing the tag for which the state should be toggled
 * @param {object} param1 - Optional parameters
 * @param {import('../../filters.js').FilterState|string} [param1.stateOverride] - Optional state override to which the state should be toggled to. If not set, the state will move to the next one in the chain.
 * @param {boolean} [param1.simulateClick] - Optionally specify that the state should not just be set on the html element, but actually achieved via triggering the "click" on it, which follows up with the general click handlers and reprinting
 * @returns {string} The string representing the new state
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'element' implicitly has an 'any' type.
function toggleTagThreeState(element, { stateOverride = undefined, simulateClick = false } = {}) {
    const states = Object.keys(FILTER_STATES);

    // Make it clear we're getting indexes and handling the 'not found' case in one place
    /**
     *
     * @param key
     * @param fallback
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'key' implicitly has an 'any' type.
    function getStateIndex(key, fallback) {
        const index = states.indexOf(key);
        return index !== -1 ? index : states.indexOf(fallback);
    }

    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    const overrideKey = typeof stateOverride == 'string' && states.includes(stateOverride) ? stateOverride : Object.keys(FILTER_STATES).find(key => FILTER_STATES[key] === stateOverride);

    const currentStateIndex = getStateIndex(element?.getAttribute('data-toggle-state'), DEFAULT_FILTER_STATE);
    const targetStateIndex = overrideKey !== undefined ? getStateIndex(overrideKey, DEFAULT_FILTER_STATE) : (currentStateIndex + 1) % states.length;

    if (simulateClick) {
        // Calculate how many clicks are needed to go from the current state to the target state
        let clickCount = 0;
        if (targetStateIndex >= currentStateIndex) {
            clickCount = targetStateIndex - currentStateIndex;
        } else {
            clickCount = (states.length - currentStateIndex) + targetStateIndex;
        }

        for (let i = 0; i < clickCount; i++) {
            element?.dispatchEvent(new Event('click'));
        }

        console.debug('manually click-toggle three-way filter from', states[currentStateIndex], 'to', states[targetStateIndex], 'on', element);
    } else {
        element?.setAttribute('data-toggle-state', states[targetStateIndex]);

        // Update css class and remove all others
        states.forEach(state => {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            element?.classList.toggle(FILTER_STATES[state].class, state === states[targetStateIndex]);
        });

        if (states[currentStateIndex] !== states[targetStateIndex]) {
            console.debug('toggle three-way filter from', states[currentStateIndex], 'to', states[targetStateIndex], 'on', element);
        }
    }


    return states[targetStateIndex];
}

// ──────────────────────────────────────────────
// Actionable filter functions
// ──────────────────────────────────────────────

/**
 * Common logic for applying actionable tag filters (Favorites, Groups, Folders).
 * Persists state to storage for all filter contexts.
 * @param {FilterHelper} filterHelper - Instance of FilterHelper class
 * @param {object} tag - The actionable tag object
 * @param {string} filterType - The filter type constant
 * @param {string} storageKey - The storage key base for persistence
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'filterHelper' implicitly has an 'any' t... Remove this comment to see the full error message
function applyActionableTagFilter(filterHelper, tag, filterType, storageKey) {
    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does not have a type annotation.
    const state = toggleTagThreeState(this);

    // Persist to storage for all contexts
    const storagePrefix = getFilterStorageKey(filterHelper);
    if (storagePrefix) {
        const contextStorageKey = `${storagePrefix}_${storageKey}`;
        accountStorage.setItem(contextStorageKey, state);
    }

    // Also update global state for main character list (backward compatibility)
    if (isMainCharacterList(filterHelper)) {
        tag.filter_state = state;
    }

    // Update the filter helper for the current context
    filterHelper.setFilterData(filterType, state);
}

/**
 * Applies the favorite filter to the character list.
 * @param {FilterHelper} filterHelper Instance of FilterHelper class.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'filterHelper' implicitly has an 'any' t... Remove this comment to see the full error message
function filterByFav(filterHelper) {
    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
    applyActionableTagFilter.call(this, filterHelper, ACTIONABLE_TAGS.FAV, FILTER_TYPES.FAV, ACTIONABLE_FILTER_STORAGE_KEYS.FAV);
}

/**
 * Applies the "is group" filter to the character list.
 * @param {FilterHelper} filterHelper Instance of FilterHelper class.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'filterHelper' implicitly has an 'any' t... Remove this comment to see the full error message
function filterByGroups(filterHelper) {
    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
    applyActionableTagFilter.call(this, filterHelper, ACTIONABLE_TAGS.GROUP, FILTER_TYPES.GROUP, ACTIONABLE_FILTER_STORAGE_KEYS.GROUP);
}

/**
 * Applies the "only folder" filter to the character list.
 * @param {FilterHelper} filterHelper Instance of FilterHelper class.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'filterHelper' implicitly has an 'any' t... Remove this comment to see the full error message
function filterByFolder(filterHelper) {
    if (!power_user.bogus_folders) {
        const bogusFolders = document.getElementById('bogus_folders');
        if (bogusFolders) {
            (bogusFolders as HTMLInputElement).checked = true;
            bogusFolders.dispatchEvent(new Event('input', { bubbles: true }));
        }
        _onViewTagsListClick();
        flashHighlight(document.querySelector('#tag_view_list .tag_as_folder, #tag_view_list .tag_folder_indicator'));
        return;
    }

    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
    applyActionableTagFilter.call(this, filterHelper, ACTIONABLE_TAGS.FOLDER, FILTER_TYPES.FOLDER, ACTIONABLE_FILTER_STORAGE_KEYS.FOLDER);
}

// ──────────────────────────────────────────────
// Filter execution
// ──────────────────────────────────────────────

/**
 *
 * @param listElement
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'listElement' implicitly has an 'any' ty... Remove this comment to see the full error message
function runTagFilters(listElement) {
    const $listEl = typeof listElement === 'string' ? document.querySelector(listElement) : listElement;
    const tagIds = getTagIdsFromDOM($listEl, '.tag.selected:not(.actionable)');
    const excludedTagIds = getTagIdsFromDOM($listEl, '.tag.excluded:not(.actionable)');
    const filterHelper = getFilterHelper(listElement);
    filterHelper.setFilterData(FILTER_TYPES.TAG, { excluded: excludedTagIds, selected: tagIds });
}

// ──────────────────────────────────────────────
// Filter persistence
// ──────────────────────────────────────────────

/**
 * Loads persisted filter states for a given filter context.
 * @param {FilterHelper} filterHelper - The filter helper instance
 * @param {string} storagePrefix - The storage key prefix for this context
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'filterHelper' implicitly has an 'any' t... Remove this comment to see the full error message
function loadFilterStatesForContext(filterHelper, storagePrefix) {
    const validStates = new Set(Object.keys(FILTER_STATES));
    // @ts-expect-error TS(7006) FIXME: Parameter 'storageKey' implicitly has an 'any' typ... Remove this comment to see the full error message
    const readState = (/** @type {string} */ storageKey) => {
        const v = accountStorage.getItem(storageKey);
        return v && validStates.has(v) ? v : null;
    };

    // Load actionable tag states (Favorites, Groups, Folders)
    const favState = readState(`${storagePrefix}_${ACTIONABLE_FILTER_STORAGE_KEYS.FAV}`);
    if (favState) {
        filterHelper.setFilterData(FILTER_TYPES.FAV, favState, true);
    }

    const groupState = readState(`${storagePrefix}_${ACTIONABLE_FILTER_STORAGE_KEYS.GROUP}`);
    if (groupState) {
        filterHelper.setFilterData(FILTER_TYPES.GROUP, groupState, true);
    }

    const folderState = readState(`${storagePrefix}_${ACTIONABLE_FILTER_STORAGE_KEYS.FOLDER}`);
    if (folderState) {
        filterHelper.setFilterData(FILTER_TYPES.FOLDER, folderState, true);
    }

    // Load regular tag filter states
    const tagFilterData = filterHelper.getFilterData(FILTER_TYPES.TAG);
    for (const tag of tags as any[]) {
        const storageKey = `${storagePrefix}_tag_${tag.id}`;
        const state = readState(storageKey);

        if (state) {
            if (state === 'SELECTED') {
                if (!tagFilterData.selected.includes(tag.id)) {
                    tagFilterData.selected.push(tag.id);
                }
            } else if (state === 'EXCLUDED') {
                if (!tagFilterData.excluded.includes(tag.id)) {
                    tagFilterData.excluded.push(tag.id);
                }
            }
        }
    }
    filterHelper.setFilterData(FILTER_TYPES.TAG, tagFilterData, true);
}

/**
 *
 */
function restoreSavedTagFilters() {
    try {
        // Load persisted filter states for all contexts (including character list)
        loadFilterStatesForContext(entitiesFilter, 'CharacterList');
        loadFilterStatesForContext(groupCandidatesFilter, 'GroupCandidates');
        loadFilterStatesForContext(groupMembersFilter, 'GroupMembers');
    } catch (e) {
        console.warn('Failed to restore actionable filter states from account storage', e);
    }
}

/**
 *
 */
function removeMissingTagFilters() {
    // @ts-expect-error TS(7005) FIXME: Variable 'tags' implicitly has an 'any[]' type.
    const tagIds = new Set(tags.map(tag => tag.id));
    const assignedTagIds = new Set(Object.values(tag_map).flat());
    // @ts-expect-error TS(7006) FIXME: Parameter 'tag' implicitly has an 'any' type.
    const openBogusFolderIds = new Set(getOpenBogusFolders().map(tag => tag.id));
    // @ts-expect-error TS(7006) FIXME: Parameter 'tagId' implicitly has an 'any' type.
    const isEmptyOpenBogusFolder = (tagId) => openBogusFolderIds.has(tagId) && !assignedTagIds.has(tagId);

    for (const helper of [groupCandidatesFilter, groupMembersFilter, entitiesFilter]) {
        const { selected, excluded } = helper.getFilterData(FILTER_TYPES.TAG);
        let anyRemoved = false;

        if (Array.isArray(selected)) {
            for (let i = selected.length - 1; i >= 0; i--) {
                if (!tagIds.has(selected[i]) || isEmptyOpenBogusFolder(selected[i])) {
                    selected.splice(i, 1);
                    anyRemoved = true;
                }
            }
        }

        if (Array.isArray(excluded)) {
            for (let i = excluded.length - 1; i >= 0; i--) {
                if (!tagIds.has(excluded[i]) || isEmptyOpenBogusFolder(excluded[i])) {
                    excluded.splice(i, 1);
                    anyRemoved = true;
                }
            }
        }

        if (anyRemoved) {
            helper.setFilterData(FILTER_TYPES.TAG, { selected, excluded });
        }
    }
}

// ──────────────────────────────────────────────
// Group context filtering
// ──────────────────────────────────────────────

/**
 * Filters actionable tags for group contexts.
 * In group contexts, hide GROUP and FOLDER filters but keep Favorites and utility buttons.
 * @param {object[]} actionTags - Array of actionable tag objects
 * @returns {object[]} Filtered array of actionable tags
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'actionTags' implicitly has an 'any' typ... Remove this comment to see the full error message
function filterActionableTagsForGroupContext(actionTags) {
    // @ts-expect-error TS(7006) FIXME: Parameter 'tag' implicitly has an 'any' type.
    return actionTags.filter(tag => {
        // Always show Favorites
        if (tag.id === ACTIONABLE_TAGS.FAV.id) {
            return true;
        }
        // Hide GROUP and FOLDER filters in group contexts (not relevant)
        if (tag.id === ACTIONABLE_TAGS.GROUP.id || tag.id === ACTIONABLE_TAGS.FOLDER.id) {
            return false;
        }
        // Show utility buttons (VIEW, HINT, UNFILTER)
        return true;
    });
}

// ──────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────

export {
    ACTIONABLE_FILTER_STORAGE_KEYS,
    ACTIONABLE_TAGS,
    TAG_ID_TO_FILTER_TYPE,
    InListActionable,
    initActionableTags,
    registerActionableTagActions,
    filterByFav,
    filterByGroups,
    filterByFolder,
    applyActionableTagFilter,
    determineTagFilterState,
    toggleTagThreeState,
    runTagFilters,
    loadFilterStatesForContext,
    restoreSavedTagFilters,
    removeMissingTagFilters,
    filterActionableTagsForGroupContext,
    getTagFilterVisibilitySetting,
    getTagFilterVisibility,
    setTagFilterVisibility,
};
