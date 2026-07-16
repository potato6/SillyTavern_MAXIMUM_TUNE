/**
 * Tags module coordinator.
 * Wires together store, filters, UI, and orchestration.
 * External consumers should import from here (or from tags.js which re-exports this).
 */

// ──────────────────────────────────────────────
// Re-exports from sub-modules
// ──────────────────────────────────────────────

// Types & constants
export { TAG_FOLDER_TYPES, TAG_FOLDER_DEFAULT_TYPE, tag_filter_type, tag_import_setting, tag_sort_mode } from './types.js';

// Store
export { tags, tag_map, loadTagsSettings, renameTagKey, createTagMapFromList } from './store/tagStore.js';
export { getTagsList, getTagKeyForEntity, getTagKeyForEntityElement } from './store/tagStore.js';
export { removeTagFromMap, getTag, createNewTag, newTag, getExistingTags, getInlineListSelector, getTagKey, copyTags } from './store/tagStore.js';
export { getTagById, getTagIdsForKey, resolveElement, tagStoreEvents, markDirty } from './store/tagStore.js';
export { sortTags, compareTagsForSort } from './utils/sorting.js';

// Orchestrator (addTagsToEntity, removeTagFromEntity)
export { addTagsToEntity, removeTagFromEntity } from './orchestrator.js';

// UI
export { printTagList, appendTagToList } from './ui/tagList.js';
export { printTagFilters } from './ui/tagFilters.js';

// Import
export { importTags } from './import/importer.js';

// Search
export { searchCharByName } from './utils/search.js';

// Folders
export { isBogusFolder, isBogusFolderOpen, chooseBogusFolder, getTagBlock } from './folders/bogusFolders.js';

// Message tags
export { applyCharacterTagsToMessageDivs } from './messageTags.js';

// Events (initTags, applyTagsOnCharacterSelect, applyTagsOnGroupSelect, createTagInput)
export { initTags, applyTagsOnCharacterSelect, applyTagsOnGroupSelect, createTagInput } from './events.js';

// ──────────────────────────────────────────────
// Imports for filterByTagState / selectTag
// ──────────────────────────────────────────────

import { entitiesFilter } from '../../script.js';
import { TAG_FOLDER_TYPES } from './types.js';
import { FILTER_TYPES } from '../filters.js';
import { getTag, createNewTag } from './store/tagStore.js';
import { applyCharacterTagsToMessageDivs } from './messageTags.js';
import { addTagsToEntity } from './orchestrator.js';

// ──────────────────────────────────────────────
// filterByTagState — filter logic that operates
// on entity lists (used by group-chats.js etc.)
// ──────────────────────────────────────────────

/**
 * Applies the basic filter for the current state of the tags and their selection on an entity list.
 * @param {Array<object>} entities List of entities for display
 * @param {object} param1 Optional parameters
 * @returns The filtered list of entities
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'entities' implicitly has an 'any' type.
export function filterByTagState(entities, { globalDisplayFilters = false, subForEntity = undefined, filterHidden = true } = {}) {
    const filterData = structuredClone(entitiesFilter.getFilterData(FILTER_TYPES.TAG));

    // @ts-expect-error TS(7006)
    entities = entities.filter(entity => {
        if (entity.type === 'tag') {
            // @ts-expect-error TS(2532)
            if (filterData.selected.includes(entity.id) || filterData.excluded.includes(entity.id)) {
                return false;
            }
        }
        return true;
    });

    if (globalDisplayFilters) {
        // @ts-expect-error TS(7006)
        const closedFolders = entities.filter(x => x.type === 'tag' && TAG_FOLDER_TYPES[x.item.folder_type] === TAG_FOLDER_TYPES.CLOSED);

        // @ts-expect-error TS(7006)
        entities = entities.filter(entity => {
            // @ts-expect-error TS(7006)
            if (filterHidden && entity.type !== 'tag' && closedFolders.some(f => entitiesFilter.isElementTagged(entity, f.id) && !filterData.selected.includes(f.id))) {
                return false;
            }
            if (entity.type === 'tag') {
                return entity.entities.length > 0 || entitiesFilter.getFilterData(FILTER_TYPES.SEARCH);
            }
            return true;
        });
    }

    // @ts-expect-error TS(2339)
    if (subForEntity !== undefined && subForEntity.type === 'tag') {
        // @ts-expect-error TS(2339)
        entities = filterTagSubEntities(subForEntity.item, entities, { filterHidden: filterHidden });
    }

    return entities;
}

/**
 * Filter entities based on a given tag, returning all entities that represent "sub entities"
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'tag' implicitly has an 'any' type.
function filterTagSubEntities(tag, entities, { filterHidden = true } = {}) {
    const filterData = structuredClone(entitiesFilter.getFilterData(FILTER_TYPES.TAG));

    // @ts-expect-error TS(7006)
    const closedFolders = entities.filter(x => x.type === 'tag' && TAG_FOLDER_TYPES[x.item.folder_type] === TAG_FOLDER_TYPES.CLOSED);

    // @ts-expect-error TS(7006)
    entities = entities.filter(sub => {
        if (sub.type === 'tag' || !entitiesFilter.isElementTagged(sub, tag.id)) {
            return false;
        }
        // @ts-expect-error TS(7053)
        if (filterHidden && sub.type !== 'tag' && TAG_FOLDER_TYPES[tag.folder_type] !== TAG_FOLDER_TYPES.CLOSED && closedFolders.some(f => entitiesFilter.isElementTagged(sub, f.id) && !filterData.selected.includes(f.id))) {
            return false;
        }
        return true;
    });

    return entities;
}

// ──────────────────────────────────────────────
// selectTag — select from autocomplete and add
// ──────────────────────────────────────────────

/**
 * Select a tag from autocomplete and add to list
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
export function selectTag(event, ui, listSelector, { tagListOptions = {} } = {}) {
    const tagName = ui.item.value;
    let tag = getTag(tagName);

    if (!tag) {
        tag = createNewTag(tagName);
    }

    if (event.target instanceof HTMLInputElement) {
        event.target.value = '';
        event.target.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const characterData = event.target.closest('#bulk_tags_div')?.dataset.characters;
    const characterIds = characterData ? JSON.parse(characterData).characterIds : null;

    addTagsToEntity(tag, characterIds, { tagListSelector: listSelector, tagListOptions: tagListOptions });

    applyCharacterTagsToMessageDivs();

    return false;
}
