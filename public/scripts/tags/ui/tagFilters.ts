/**
 * Tag filter UI — handles the filter bar above the character list.
 * Prints actionable tags, regular tag filters, and manages filter state interactions.
 */

import { tags, tag_map, getTagById, markDirty } from '../store/tagStore.js';
import {
    CHARACTER_FILTER_SELECTOR,
    GROUP_FILTER_SELECTOR,
    GROUP_MEMBERS_FILTER_SELECTOR,
    getFilterHelper,
    isGroupContext,
    getVisibleAvatarsForGroupContext,
    getFilterStorageKey,
    isMainCharacterList,
    getFilterContext,
} from '../filters/filterContext.js';
import {
    ACTIONABLE_TAGS,
    InListActionable,
    toggleTagThreeState,
    runTagFilters,
    filterActionableTagsForGroupContext,
    getTagFilterVisibility,
    setTagFilterVisibility,
    removeMissingTagFilters,
} from '../filters/filterState.js';
import { tag_filter_type } from '../types.js';
import { printTagList } from './tagList.js';
import { getOpenBogusFolders } from '../folders/bogusFolders.js';
import { FILTER_STATES, isFilterState } from '../../filters.js';
import { groups, selected_group } from '../../group-chats.js';
import { onlyUnique } from '../../utils.js';
import { power_user } from '../../power-user.js';
import { DEFAULT_PRINT_TIMEOUT } from '../../../script.js';
import { accountStorage } from '../../util/AccountStorage.js';
import { compareTagsForSort } from '../utils/sorting.js';

// ──────────────────────────────────────────────
// Tag Filter Click
// ──────────────────────────────────────────────

/**
 *
 * @param listElement
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'listElement' implicitly has an 'any' ty... Remove this comment to see the full error message
export function onTagFilterClick(listElement) {
    const tagId = this?.getAttribute('id');
    const existingTag = getTagById(tagId);
    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
    const parent = this.closest('.tags');

    const state = toggleTagThreeState(this);

    const filterHelper = getFilterHelper(listElement);

    // Update the tag's filter_state for the main character list (backward compatibility)
    if (existingTag && isMainCharacterList(filterHelper)) {
        existingTag.filter_state = state;
        markDirty();
    }

    // Persist to storage for all contexts
    const storagePrefix = getFilterStorageKey(filterHelper);
    if (storagePrefix && existingTag) {
        const storageKey = `${storagePrefix}_tag_${tagId}`;
        accountStorage.setItem(storageKey, state);
    }

    // Apply all tag filters by reading from DOM state (this triggers the filter helper update)
    runTagFilters(listElement);

    // Focus the tag again we were at, if possible. To improve keyboard navigation
    setTimeout(() => parent?.querySelector(`.tag[id="${tagId}"]`)?.focus(), DEFAULT_PRINT_TIMEOUT + 1);

    updateTagFilterIndicator(listElement);
}

// ──────────────────────────────────────────────
// Update Tag Filter Indicator
// ──────────────────────────────────────────────

/**
 * Updates the tag filter indicator based on the selected/excluded tags in the given filter selector
 * @param {string|JQuery<HTMLElement>} filterSelector - The selector or jQuery element for the tag filter container
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'filterSelector' implicitly has an 'any'... Remove this comment to see the full error message
export function updateTagFilterIndicator(filterSelector) {
    const selector = filterSelector || CHARACTER_FILTER_SELECTOR;
    const tagFilter = typeof selector === 'string' ? document.querySelector(selector) : selector;
    const tagFilterEl = tagFilter;
    const showTagListButton = tagFilterEl?.closest('.rm_tag_controls')?.querySelector('.showTagList');
    const filterTags = tagFilterEl?.querySelectorAll('.tag:not(.actionable)');
    const hasActiveTags = filterTags ? [...filterTags].some(el => el.matches('.selected, .excluded')) : false;
    showTagListButton?.classList.toggle('indicator', hasActiveTags);
}

// ──────────────────────────────────────────────
// Print Tag Filters
// ──────────────────────────────────────────────

/**
 *
 * @param type
 */
export function printTagFilters(type = tag_filter_type.character) {
    removeMissingTagFilters();

    let FILTER_SELECTOR;
    switch (type) {
        case tag_filter_type.character:
            FILTER_SELECTOR = CHARACTER_FILTER_SELECTOR;
            break;
        case tag_filter_type.group_candidates_list:
            FILTER_SELECTOR = GROUP_FILTER_SELECTOR;
            break;
        case tag_filter_type.group_members_list:
            FILTER_SELECTOR = GROUP_MEMBERS_FILTER_SELECTOR;
            break;
        default:
            FILTER_SELECTOR = CHARACTER_FILTER_SELECTOR;
            break;
    }

    const filterSelectorEl = document.querySelector(FILTER_SELECTOR);
    if (filterSelectorEl) filterSelectorEl.innerHTML = '';

    // Print all action tags. (Rework 'Folder' button to some kind of onboarding if no folders are enabled yet)
    let actionTags = Object.values(ACTIONABLE_TAGS);
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    actionTags.find(x => x == ACTIONABLE_TAGS.FOLDER).name = power_user.bogus_folders ? 'Show only folders' : 'Enable \'Tags as Folder\'\n\nAllows characters to be grouped in folders by their assigned tags.\nTags have to be explicitly chosen as folder to show up.\n\nClick here to start';

    // For group contexts, filter actionable tags to only show relevant ones
    if (isGroupContext(type)) {
        actionTags = filterActionableTagsForGroupContext(actionTags);
    }

    printTagList(filterSelectorEl, { empty: false, sort: false, tags: actionTags, tagActionSelector: tag => tag.action, tagOptions: { isGeneralList: true } });

    const inListActionTags = Object.values(InListActionable);
    printTagList(filterSelectorEl, { empty: false, sort: false, tags: inListActionTags, tagActionSelector: tag => tag.action, tagOptions: { isGeneralList: true } });

    // Determine which character tags to display based on context
    let tagsToDisplay;
    let inactiveTags = [];

    if (isGroupContext(type)) {
        // For group contexts, show all tags but mark ones without presence in current context as inactive
        // CAUTION: when called by openGroupById, the selected_group variable might not yet be updated

        const currentGroup = selected_group ? groups.find(x => x.id == selected_group) : null;
        const visibleAvatars = getVisibleAvatarsForGroupContext(type, currentGroup);

        if (visibleAvatars.length > 0) {
            // Get tags that are assigned to at least one visible character
            const activeCharacterTagIds = visibleAvatars
                // @ts-expect-error TS(7006) FIXME: Parameter 'avatar' implicitly has an 'any' type.
                .map(avatar => tag_map[avatar] || [])
                .flat()
                .filter(onlyUnique);

            // Show all tags that exist in the tag_map
            const allCharacterTagIds = Object.values(tag_map).flat().filter(onlyUnique);
            // @ts-expect-error TS(7005) FIXME: Variable 'tags' implicitly has an 'any[]' type.
            tagsToDisplay = tags.filter(x => allCharacterTagIds.includes(x.id)).sort(compareTagsForSort);

            // Mark tags that are not in the active set as inactive
            inactiveTags = tagsToDisplay
                .filter(x => !activeCharacterTagIds.includes(x.id))
                .map(x => x.id);
        } else {
            // No group selected, show no tags
            tagsToDisplay = [];
        }
    } else {
        // For main character list, show all tags as before
        const characterTagIds = Object.values(tag_map).flat();
        // @ts-expect-error TS(7005) FIXME: Variable 'tags' implicitly has an 'any[]' type.
        tagsToDisplay = tags.filter(x => characterTagIds.includes(x.id)).sort(compareTagsForSort);
    }

    printTagList(filterSelectorEl, { empty: false, tags: tagsToDisplay, tagOptions: { isFilter: true, isGeneralList: true }, inactiveTags: inactiveTags });


    // Print bogus folder navigation
    const parentEl = filterSelectorEl?.parentElement;
    const bogusDrilldownEl = parentEl?.querySelector(':scope > .rm_tag_bogus_drilldown');
    if (bogusDrilldownEl) bogusDrilldownEl.innerHTML = '';
    if (power_user.bogus_folders && bogusDrilldownEl) {
        const navigatedTags = getOpenBogusFolders();
        printTagList(bogusDrilldownEl, { tags: navigatedTags, tagOptions: { removable: true } });
    }

    // Don't call runTagFilters here - it would overwrite the loaded filter states with the DOM state.
    // The visual state (CSS classes) already matches the filter helper state set by loadFilterStatesForContext.
    // runTagFilters is only needed when user clicks a tag (handled in onTagFilterClick).

    // Initialize the tag list visibility based on saved settings for this context
    const shouldShowTags = getTagFilterVisibility(type);
    const showTagListButton = document.querySelector(FILTER_SELECTOR)?.closest('.rm_tag_controls')?.querySelector('.showTagList');

    // Update button state to match the saved setting
    showTagListButton?.classList.toggle('selected', shouldShowTags);

    if (shouldShowTags) {
        document.querySelectorAll(`${FILTER_SELECTOR} .tag:not(.actionable)`).forEach(el => (el as HTMLElement).style.display = '');
    } else {
        document.querySelectorAll(`${FILTER_SELECTOR} .tag:not(.actionable)`).forEach(el => (el as HTMLElement).style.display = 'none');
    }

    updateTagFilterIndicator(FILTER_SELECTOR);
}

// ──────────────────────────────────────────────
// Tag List Hint Click (Show/Hide)
// ──────────────────────────────────────────────

/**
 *
 */
export function onTagListHintClick() {
    this.classList.toggle('selected');

    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
    const siblingTags = [...this.parentElement.querySelectorAll(':scope > .tag:not(.actionable)')] as HTMLElement[];

    if (this.classList.contains('selected')) {
        siblingTags.forEach(el => el.style.display = '');
    } else {
        siblingTags.forEach(el => el.style.display = 'none');
    }

    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
    const innerSiblings = [...this.parentElement.querySelectorAll(':scope > .innerActionable')];
    innerSiblings.forEach(el => el.classList.toggle('hidden'));

    // Determine which context this button belongs to and save the setting
    let filterType = tag_filter_type.character;

    // Check which section we're in by looking at the sibling header
    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
    const tagControls = this.closest('.rm_tag_controls');
    const prevSibling = tagControls?.previousElementSibling;
    if (prevSibling?.id === 'rm_group_add_members_header') {
        filterType = tag_filter_type.group_candidates_list;
    } else if (prevSibling?.id === 'rm_group_members_header') {
        filterType = tag_filter_type.group_members_list;
    }

    const isSelected = this.classList.contains('selected');
    setTagFilterVisibility(filterType, isSelected);
    console.debug('show_tag_filters for type', filterType, ':', isSelected);
}

// ──────────────────────────────────────────────
// Clear All Filters Click
// ──────────────────────────────────────────────

/**
 * Clears all filters for the current list context.
 * @param {FilterHelper} filterHelper - The filter helper for the current context
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'filterHelper' implicitly has an 'any' t... Remove this comment to see the full error message
export function onClearAllFiltersClick(filterHelper) {
    console.debug('clear all filters clicked');

    const context = getFilterContext(filterHelper);
    if (!context) {
        console.warn('Unknown filter helper in onClearAllFiltersClick');
        return;
    }

    // We have to manually go through the elements and unfilter by clicking...
    // Thankfully nearly all filter controls are three-state-toggles
    const filterTags = document.querySelectorAll(`${context.selector} .tag`);
    for (const tag of filterTags) {
        const toggleState = tag.getAttribute('data-toggle-state');
        if (toggleState !== undefined && !isFilterState(toggleState ?? FILTER_STATES.UNDEFINED, FILTER_STATES.UNDEFINED)) {
            toggleTagThreeState(tag, { stateOverride: FILTER_STATES.UNDEFINED, simulateClick: true });
        }
    }

    // Reset search input for this context
    const searchInputEl = document.querySelector(context.searchInput);
    if (searchInputEl) {
        searchInputEl.value = '';
        searchInputEl.dispatchEvent(new Event('input'));
    }
}
