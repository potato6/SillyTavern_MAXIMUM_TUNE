/**
 * Tag sorting utilities.
 * Handles manual, alphabetical, and entry-count sorting modes.
 */

import { power_user } from '../../power-user.js';
import { tag_sort_mode } from '../types.js';

/**
 * Compares two given tags and returns the compare result.
 * @param {object} a - First tag
 * @param {object} b - Second tag
 * @param {Map<string, number>} [counts] - Optional map of tag ID to usage count
 * @returns {number} The compare result
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
export function compareTagsForSort(a, b, counts = null) {
    // default sort: alphabetical, case insensitive
    const defaultSort = a.name.toLowerCase().localeCompare(b.name.toLowerCase());

    // sort on number of entries
    if (power_user.tag_sort_mode === tag_sort_mode.BY_ENTRIES) {
        // @ts-expect-error TS(2358) FIXME: The left-hand side of an 'instanceof' expression m...
        const aCount = counts instanceof Map ? (counts.get(a.id) || 0) : 0;
        // @ts-expect-error TS(2358) FIXME: The left-hand side of an 'instanceof' expression m...
        const bCount = counts instanceof Map ? (counts.get(b.id) || 0) : 0;
        return (bCount - aCount) || defaultSort;
    }

    // alphabetical sort
    if (power_user.tag_sort_mode === tag_sort_mode.ALPHABETICAL) {
        return defaultSort;
    }

    // manual sort
    if (a.sort_order !== undefined && b.sort_order !== undefined) {
        return a.sort_order - b.sort_order;
    } else if (a.sort_order !== undefined) {
        return -1;
    } else if (b.sort_order !== undefined) {
        return 1;
    } else {
        return defaultSort;
    }
}

/**
 * Sorts the given tags, returning a shallow copy of it.
 * @param {object[]} tags - The tags
 * @param {Map<string, number>} [counts] - Optional map of tag ID to usage count
 * @returns {object[]} The sorted tags
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'tags' implicitly has an 'any' type.
export function sortTags(tags, counts = null) {
    // @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
    return tags.slice().sort((a, b) => compareTagsForSort(a, b, counts));
}
