/**
 * Tag orchestration — functions that touch both data (store) and UI.
 * Separated to avoid circular dependencies between store and UI modules.
 */

import {
    addTagToMap,
    removeTagFromMap,
    getInlineListSelector,
    markDirty,
} from './store/tagStore.js';
import { printTagList } from './ui/tagList.js';

/**
 * Adds one or more tags to a given entity
 * @param {Tag|Tag[]} tag - The tag or tags to add
 * @param {string|string[]} entityId - The entity or entities to add this tag to.
 * @param {object} [options] - Optional arguments
 * @param options.tagListSelector
 * @param options.tagListOptions
 * @returns {boolean} Whether at least one tag was added
 */
export function addTagsToEntity(
    tag: Record<string, unknown> | Record<string, unknown>[],
    entityId: string | string[] | null,
    {
        tagListSelector = null,
        tagListOptions = {},
    }: { tagListSelector?: string | null; tagListOptions?: Record<string, unknown> } = {},
): boolean {
    const _tags: Record<string, unknown>[] = Array.isArray(tag) ? tag : [tag];
    const entityIds = Array.isArray(entityId) ? entityId : [entityId];

    let result = false;

    // Add tags to the map
    entityIds.forEach((id: string | null) => {
        _tags.forEach((t: Record<string, unknown>) => {
            result = addTagToMap(t.id as string, id) || result;
        });
    });
    // Save and redraw
    markDirty();

    // We should manually add the selected tag to the print tag function
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
 * @param options.tagListSelector
 * @param options.tagElement
 * @returns {boolean} Whether at least one tag was removed
 */
export function removeTagFromEntity(
    tag: Record<string, unknown>,
    entityId: string | string[] | null | undefined,
    {
        tagListSelector = null,
        tagElement = null,
    }: { tagListSelector?: string | null; tagElement?: Element | null } = {},
): boolean {
    let result = false;
    // Remove tag from the map
    if (Array.isArray(entityId)) {
        entityId.forEach(
            (id: string) => (result = removeTagFromMap(tag.id as string, id) || result),
        );
    } else {
        result = removeTagFromMap(tag.id as string, entityId);
    }
    // Save and redraw
    markDirty();

    // We don't reprint the lists, we can just remove the html elements from them.
    if (tagListSelector) {
        const selectorEl =
            typeof tagListSelector === 'string'
                ? document.querySelector(tagListSelector)
                : tagListSelector;
        selectorEl?.querySelector(`.tag[id="${tag.id as string}"]`)?.remove();
    }
    if (tagElement) tagElement.remove();
    const inlineListSelector = getInlineListSelector();
    if (inlineListSelector) {
        document.querySelector(`${inlineListSelector} .tag[id="${tag.id as string}"]`)?.remove();
    }

    return result;
}
