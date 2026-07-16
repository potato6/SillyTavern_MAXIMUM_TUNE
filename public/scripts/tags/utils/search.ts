/**
 * Tag search utilities.
 * Functions for finding tags by name and character lookup.
 */

import { characters, this_chid, menu_type } from '../../../script.js';
import { groups, selected_group } from '../../group-chats.js';
import { equalsIgnoreCaseAndAccents, includesIgnoreCaseAndAccents, findChar } from '../../utils.js';
import { compareTagsForSort } from './sorting.js';
import { tags, getTagKeyForEntity, getTagIdsFromDOM } from '../store/tagStore.js';

/**
 * @param request
 * @param resolve
 * @param listSelector
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'request' implicitly has an 'any' type.
export function findTag(request, resolve, listSelector) {
    const $listEl = typeof listSelector === 'string' ? document.querySelector(listSelector) : listSelector;
    const skipIds = getTagIdsFromDOM($listEl);
    // @ts-expect-error TS(7005) FIXME: Variable 'tags' implicitly has an 'any[]' type.
    const haystack = tags.filter(t => !skipIds.includes(t.id)).sort(compareTagsForSort).map(t => t.name);
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
// @ts-expect-error TS(7006) FIXME: Parameter 'charName' implicitly has an 'any' type.
export function searchCharByName(charName, { suppressLogging = false } = {}) {
    const entity = charName

        ? (findChar({ name: charName }) || groups.find(x => equalsIgnoreCaseAndAccents(x.name, charName)))

        : (selected_group ? groups.find(x => x.id == selected_group) : characters[this_chid]);
    const key = getTagKeyForEntity(entity);
    if (!key) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        if (!suppressLogging) notyf.warning(`Character ${charName} not found.`);
        return null;
    }
    return key;
}
