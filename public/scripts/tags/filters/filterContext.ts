/**
 * Filter context resolution module.
 * Determines which filter helper to use based on DOM context.
 */

import { entitiesFilter, characters } from '../../../script.js';

import { groupCandidatesFilter, groupMembersFilter } from '../../group-chats.js';

import { tag_filter_type } from '../types.js';

export const CHARACTER_FILTER_SELECTOR = '#rm_characters_block .rm_tag_filter';
export const GROUP_FILTER_SELECTOR =
    '#rm_group_add_members_header ~ .rm_tag_controls .rm_tag_filter';
export const GROUP_MEMBERS_FILTER_SELECTOR =
    '#rm_group_members_header ~ .rm_tag_controls .rm_tag_filter';

/**
 * Gets the context information (selector and search input) for a filter helper.
 * Used to reduce code duplication when working with different filter contexts.
 * @param {FilterHelper} filterHelper - The filter helper instance
 * @returns {{selector: string, searchInput: string}|null} Context info or null if unknown
 */
export function getFilterContext(
    filterHelper: unknown,
): { selector: string; searchInput: string } | null {
    if (filterHelper === entitiesFilter) {
        return {
            selector: CHARACTER_FILTER_SELECTOR,
            searchInput: '#character_search_bar',
        };
    } else if (filterHelper === groupCandidatesFilter) {
        return {
            selector: GROUP_FILTER_SELECTOR,
            searchInput: '#rm_group_filter',
        };
    } else if (filterHelper === groupMembersFilter) {
        return {
            selector: GROUP_MEMBERS_FILTER_SELECTOR,
            searchInput: '#rm_group_members_filter',
        };
    }
    return null;
}

/**
 * Get the filter helper for a given list selector.
 * @param {string|JQuery<HTMLElement>} listSelector - jQuery selector for the list
 * @returns {FilterHelper} The appropriate filter helper instance
 */
export function getFilterHelper(listSelector: string | HTMLElement | null): unknown {
    const $element =
        typeof listSelector === 'string' ? document.querySelector(listSelector) : listSelector;

    // Check if this filter is in the group members section
    if ($element?.closest('#currentGroupMembers')) {
        return groupMembersFilter;
    }

    // Check if this filter is in the group candidates (add members) section
    if ($element?.closest('#unaddedCharList')) {
        return groupCandidatesFilter;
    }

    // Default to character list filter
    return entitiesFilter;
}

/**
 * Checks if the given type is a group context.
 * @param {tag_filter_type} type - The filter type to check
 * @returns {boolean} True if this is a group context
 */
export function isGroupContext(type: number): boolean {
    return [tag_filter_type.group_candidates_list, tag_filter_type.group_members_list].includes(
        type,
    );
}

/**
 * Gets visible character avatars for a group context.
 * @param {tag_filter_type} type - The filter type
 * @param {object} currentGroup - The current group object
 * @returns {string[]} Array of visible character avatars
 */
export function getVisibleAvatarsForGroupContext(
    type: number,
    currentGroup: { members: string[] } | null,
): string[] {
    if (!currentGroup || !Array.isArray(currentGroup.members)) {
        return [];
    }

    switch (type) {
        case tag_filter_type.group_members_list:
            return currentGroup.members;
        case tag_filter_type.group_candidates_list:
            return characters
                .filter((c) => !currentGroup.members.includes(c.avatar))
                .map((c) => c.avatar);
        default:
            console.warn(
                'getVisibleAvatarsForGroupContext got invalid type, expected 1 or 2, got ',
                type,
            );
            return [];
    }
}

/**
 * Checks if the given filter helper is the main character list filter.
 * @param {FilterHelper} filterHelper - The filter helper to check
 * @returns {boolean} True if this is the main character list
 */
export function isMainCharacterList(filterHelper: unknown): boolean {
    return filterHelper === entitiesFilter;
}

/**
 * Gets the storage key prefix for a filter helper to enable persistence.
 * @param {FilterHelper} filterHelper - The filter helper to check
 * @returns {string|null} Storage key prefix or null if no persistence
 */
export function getFilterStorageKey(filterHelper: unknown): string | null {
    if (filterHelper === entitiesFilter) {
        return 'CharacterList';
    } else if (filterHelper === groupCandidatesFilter) {
        return 'GroupCandidates';
    } else if (filterHelper === groupMembersFilter) {
        return 'GroupMembers';
    }
    return null;
}
