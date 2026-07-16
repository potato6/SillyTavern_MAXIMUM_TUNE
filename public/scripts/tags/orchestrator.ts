/**
 * Tag orchestration — functions that touch both data (store) and UI.
 * Separated to avoid circular dependencies between store and UI modules.
 */

import { addTagToMap, removeTagFromMap, getInlineListSelector, markDirty } from './store/tagStore.js';
import { printTagList } from './ui/tagList.js';

/**
 * Adds one or more tags to a given entity
 * @param {Tag|Tag[]} tag - The tag or tags to add
 * @param {string|string[]} entityId - The entity or entities to add this tag to.
 * @param {object} [options] - Optional arguments
 * @returns {boolean} Whether at least one tag was added
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'tag' implicitly has an 'any' type.
export function addTagsToEntity(tag, entityId, { tagListSelector = null, tagListOptions = {} } = {}) {
    // @ts-expect-error TS(7006)
    const _tags = Array.isArray(tag) ? tag : [tag];
    const entityIds = Array.isArray(entityId) ? entityId : [entityId];

    let result = false;

    // Add tags to the map
    entityIds.forEach((id) => {
        _tags.forEach((t) => {
            result = addTagToMap(t.id, id) || result;
        });
    });
    // Save and redraw
    markDirty();

    // We should manually add the selected tag to the print tag function
    // @ts-expect-error TS(2339) FIXME: Property 'addTag' does not exist on type '{}'.
    tagListOptions.addTag = _tags;

    // add tag to the UI and internal map
    if (tagListSelector) printTagList(tagListSelector, tagListOptions);
    const inlineSelector = getInlineListSelector();
    if (inlineSelector) {
        printTagList(document.querySelector(inlineSelector), tagListOptions);
    }

    return result;
}

/**
 * Removes a tag from a given entity
 * @param {Tag} tag - The tag to remove
 * @param {string|string[]} entityId - The entity to remove this tag from.
 * @param {object} [options] - Optional arguments
 * @returns {boolean} Whether at least one tag was removed
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'tag' implicitly has an 'any' type.
export function removeTagFromEntity(tag, entityId, { tagListSelector = null, tagElement = null } = {}) {
    let result = false;
    // Remove tag from the map
    if (Array.isArray(entityId)) {
        entityId.forEach((id) => result = removeTagFromMap(tag.id, id) || result);
    } else {
        result = removeTagFromMap(tag.id, entityId);
    }
    // Save and redraw
    markDirty();

    // We don't reprint the lists, we can just remove the html elements from them.
    if (tagListSelector) {
        const selectorEl = (typeof tagListSelector === 'string') ? document.querySelector(tagListSelector) : tagListSelector;
        selectorEl?.querySelector(`.tag[id="${tag.id}"]`)?.remove();
    }
    // @ts-expect-error TS(2339)
    if (tagElement) tagElement.remove();
    const inlineListSelector = getInlineListSelector();
    if (inlineListSelector) {
        document.querySelector(`${inlineListSelector} .tag[id="${tag.id}"]`)?.remove();
    }

    return result;
}
