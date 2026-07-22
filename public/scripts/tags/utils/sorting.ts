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
export function compareTagsForSort(
    a: Record<string, unknown>,
    b: Record<string, unknown>,
    counts: Map<string, number> | null = null,
): number {
    // default sort: alphabetical, case insensitive
    const defaultSort = (a.name as string)
        .toLowerCase()
        .localeCompare((b.name as string).toLowerCase());

    // sort on number of entries
    if (power_user.tag_sort_mode === tag_sort_mode.BY_ENTRIES) {
        const aCount = counts instanceof Map ? counts.get(a.id as string) || 0 : 0;
        const bCount = counts instanceof Map ? counts.get(b.id as string) || 0 : 0;
        return bCount - aCount || defaultSort;
    }

    // alphabetical sort
    if (power_user.tag_sort_mode === tag_sort_mode.ALPHABETICAL) {
        return defaultSort;
    }

    // manual sort
    if (a.sort_order !== undefined && b.sort_order !== undefined) {
        return (a.sort_order as number) - (b.sort_order as number);
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
export function sortTags(
    tags: Record<string, unknown>[],
    counts: Map<string, number> | null = null,
): Record<string, unknown>[] {
    return tags
        .slice()
        .toSorted((a: Record<string, unknown>, b: Record<string, unknown>) =>
            compareTagsForSort(a, b, counts),
        );
}
