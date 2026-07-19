/**
 * Tag search utilities.
 * Functions for finding tags by name and character lookup.
 */

import { characters, this_chid } from '../../../script.js';
import { groups, selected_group } from '../../group-chats.js';
import { equalsIgnoreCaseAndAccents, includesIgnoreCaseAndAccents, findChar } from '../../utils.js';
import { compareTagsForSort } from './sorting.js';
import { tags, getTagKeyForEntity, getTagIdsFromDOM } from '../store/tagStore.js';

declare const notyf: {
    warning: (msg: string, ...args: unknown[]) => void;
    success: (msg: string, ...args: unknown[]) => void;
    error: (msg: string, ...args: unknown[]) => void;
    info: (msg: string, ...args: unknown[]) => void;
};

/**
 * @param request
 * @param request.term
 * @param resolve
 * @param listSelector
 */
export function findTag(request: { term: string }, resolve: (results: string[]) => void, listSelector: string | HTMLElement | null) {
    const $listEl: HTMLElement | null = typeof listSelector === 'string' ? document.querySelector(listSelector) : listSelector as HTMLElement | null;
    const skipIds = getTagIdsFromDOM($listEl);
    const haystack = tags.filter((t: { id: string; name: string }) => !skipIds.includes(t.id)).sort(compareTagsForSort).map(t => t.name);
    const needle = request.term;
    const hasExactMatch = haystack.findIndex(x => equalsIgnoreCaseAndAccents(x, needle)) !== -1;
    const result = haystack.filter(x => includesIgnoreCaseAndAccents(x, needle));

    if (request.term && !hasExactMatch) {
        result.unshift(request.term);
    }

    resolve(result);
}

/**
 * Gets the key for char/group by searching based on the name or avatar.
 * This function is mostly used in slash commands.
 * @param {string?} [charName] The optionally provided char name
 * @param {object} [options] - Optional arguments
 * @param {boolean} [options.suppressLogging] - Whether to suppress the toastr warning
 * @returns {string?} - The char/group key, or null if none found
 */
export function searchCharByName(charName: string | undefined, { suppressLogging = false }: { suppressLogging?: boolean } = {}) {
    const entity = charName

        ? (findChar({ name: charName as unknown as null }) || groups.find(x => equalsIgnoreCaseAndAccents(x.name, charName as string)))

        : (selected_group ? groups.find(x => x.id == selected_group) : characters[this_chid!]);
    const key = getTagKeyForEntity(entity);
    if (!key) {
        if (!suppressLogging) notyf.warning(`Character ${charName} not found.`);
        return null;
    }
    return key;
}
