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
export function onTagFilterClick(this: HTMLElement, listElement: string | HTMLElement) {
    const tagId = this.getAttribute('id')!;
    const existingTag = getTagById(tagId);
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
    setTimeout(
        () => (parent?.querySelector(`.tag[id="${tagId}"]`) as HTMLElement)?.focus(),
        DEFAULT_PRINT_TIMEOUT + 1,
    );

    updateTagFilterIndicator(listElement);
}

// ──────────────────────────────────────────────
// Update Tag Filter Indicator
// ──────────────────────────────────────────────

/**
 * Updates the tag filter indicator based on the selected/excluded tags in the given filter selector
 * @param {string|JQuery<HTMLElement>} filterSelector - The selector or jQuery element for the tag filter container
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cash = any;

/**
 *
 * @param filterSelector
 */
export function updateTagFilterIndicator(
    filterSelector: string | Element | Cash | null | undefined,
) {
    const selector = filterSelector || CHARACTER_FILTER_SELECTOR;
    const tagFilter = typeof selector === 'string' ? document.querySelector(selector) : selector;
    const tagFilterEl = tagFilter;
    const showTagListButton = tagFilterEl
        ?.closest('.rm_tag_controls')
        ?.querySelector('.showTagList');
    const filterTags = tagFilterEl?.querySelectorAll('.tag:not(.actionable)');
    const hasActiveTags = filterTags
        ? [...filterTags].some((el) => el.matches('.selected, .excluded'))
        : false;
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
    (
        actionTags.find((x: Record<string, unknown>) => x == ACTIONABLE_TAGS.FOLDER) as Record<
            string,
            unknown
        >
    ).name = power_user.bogus_folders
        ? 'Show only folders'
        : "Enable 'Tags as Folder'\n\nAllows characters to be grouped in folders by their assigned tags.\nTags have to be explicitly chosen as folder to show up.\n\nClick here to start";

    // For group contexts, filter actionable tags to only show relevant ones
    if (isGroupContext(type)) {
        actionTags = filterActionableTagsForGroupContext(actionTags) as typeof actionTags;
    }

    printTagList(filterSelectorEl as HTMLElement | null, {
        empty: false,
        sort: false,
        tags: actionTags,
        tagActionSelector: (tag: Record<string, unknown>) =>
            tag.action as ((...args: unknown[]) => unknown) | undefined,
        tagOptions: { isGeneralList: true },
    });

    const inListActionTags = Object.values(InListActionable);
    printTagList(filterSelectorEl as HTMLElement | null, {
        empty: false,
        sort: false,
        tags: inListActionTags as Record<string, unknown>[],
        tagActionSelector: (tag: Record<string, unknown>) =>
            tag.action as ((...args: unknown[]) => unknown) | undefined,
        tagOptions: { isGeneralList: true },
    });

    // Determine which character tags to display based on context
    let tagsToDisplay: Record<string, unknown>[] = [];
    let inactiveTags: string[] = [];

    if (isGroupContext(type)) {
        // For group contexts, show all tags but mark ones without presence in current context as inactive
        // CAUTION: when called by openGroupById, the selected_group variable might not yet be updated

        const currentGroup = selected_group ? groups.find((x) => x.id == selected_group) : null;
        const visibleAvatars = getVisibleAvatarsForGroupContext(
            type,
            currentGroup as { members: string[] } | null,
        );

        if (visibleAvatars.length > 0) {
            // Get tags that are assigned to at least one visible character
            const activeCharacterTagIds = new Set(
                visibleAvatars
                    .flatMap(
                        (avatar: string) =>
                            (tag_map as Record<string, string[] | undefined>)[avatar] || [],
                    )
                    .filter(onlyUnique),
            );

            // Show all tags that exist in the tag_map
            const allCharacterTagIds = new Set(Object.values(tag_map).flat().filter(onlyUnique));
            tagsToDisplay = (tags as Record<string, unknown>[])
                .filter((x: Record<string, unknown>) => allCharacterTagIds.has(x.id as string))
                .toSorted(compareTagsForSort);

            // Mark tags that are not in the active set as inactive
            inactiveTags = tagsToDisplay
                .filter((x: Record<string, unknown>) => !activeCharacterTagIds.has(x.id as string))
                .map((x: Record<string, unknown>) => x.id as string);
        } else {
            // No group selected, show no tags
            tagsToDisplay = [];
        }
    } else {
        // For main character list, show all tags as before
        const characterTagIds = new Set(Object.values(tag_map).flat());
        tagsToDisplay = (tags as Record<string, unknown>[])
            .filter((x: Record<string, unknown>) => characterTagIds.has(x.id as string))
            .toSorted(compareTagsForSort);
    }

    printTagList(filterSelectorEl as HTMLElement | null, {
        empty: false,
        tags: tagsToDisplay,
        tagOptions: { isFilter: true, isGeneralList: true },
        inactiveTags: inactiveTags,
    });

    // Print bogus folder navigation
    const parentEl = filterSelectorEl?.parentElement;
    const bogusDrilldownEl = parentEl?.querySelector(':scope > .rm_tag_bogus_drilldown');
    if (bogusDrilldownEl) bogusDrilldownEl.innerHTML = '';
    if (power_user.bogus_folders && bogusDrilldownEl) {
        const navigatedTags = getOpenBogusFolders();
        printTagList(bogusDrilldownEl as HTMLElement | null, {
            tags: navigatedTags,
            tagOptions: { removable: true },
        });
    }

    // Don't call runTagFilters here - it would overwrite the loaded filter states with the DOM state.
    // The visual state (CSS classes) already matches the filter helper state set by loadFilterStatesForContext.
    // runTagFilters is only needed when user clicks a tag (handled in onTagFilterClick).

    // Initialize the tag list visibility based on saved settings for this context
    const shouldShowTags = getTagFilterVisibility(type);
    const showTagListButton = document
        .querySelector(FILTER_SELECTOR)
        ?.closest('.rm_tag_controls')
        ?.querySelector('.showTagList');

    // Update button state to match the saved setting
    showTagListButton?.classList.toggle('selected', shouldShowTags);

    if (shouldShowTags) {
        document
            .querySelectorAll(`${FILTER_SELECTOR} .tag:not(.actionable)`)
            .forEach((el) => ((el as HTMLElement).style.display = ''));
    } else {
        document
            .querySelectorAll(`${FILTER_SELECTOR} .tag:not(.actionable)`)
            .forEach((el) => ((el as HTMLElement).style.display = 'none'));
    }

    updateTagFilterIndicator(FILTER_SELECTOR);
}

// ──────────────────────────────────────────────
// Tag List Hint Click (Show/Hide)
// ──────────────────────────────────────────────

/**
 *
 */
export function onTagListHintClick(this: HTMLElement) {
    this.classList.toggle('selected');

    const siblingTags = [
        ...(this.parentElement as HTMLElement).querySelectorAll(':scope > .tag:not(.actionable)'),
    ] as HTMLElement[];

    if (this.classList.contains('selected')) {
        siblingTags.forEach((el) => (el.style.display = ''));
    } else {
        siblingTags.forEach((el) => (el.style.display = 'none'));
    }

    const innerSiblings = [
        ...(this.parentElement as HTMLElement).querySelectorAll(':scope > .innerActionable'),
    ];
    innerSiblings.forEach((el) => el.classList.toggle('hidden'));

    // Determine which context this button belongs to and save the setting
    let filterType = tag_filter_type.character;

    // Check which section we're in by looking at the sibling header
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
 * @param filterHelper.selector
 * @param filterHelper.searchInput
 */
export function onClearAllFiltersClick(filterHelper: { selector: string; searchInput: string }) {
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
        if (
            toggleState !== undefined &&
            !isFilterState(toggleState ?? FILTER_STATES.UNDEFINED, FILTER_STATES.UNDEFINED)
        ) {
            toggleTagThreeState(tag as HTMLElement, {
                stateOverride: FILTER_STATES.UNDEFINED.key,
                simulateClick: true,
            });
        }
    }

    // Reset search input for this context
    const searchInputEl = document.querySelector(context.searchInput);
    if (searchInputEl) {
        (searchInputEl as HTMLInputElement).value = '';
        searchInputEl.dispatchEvent(new Event('input'));
    }
}
