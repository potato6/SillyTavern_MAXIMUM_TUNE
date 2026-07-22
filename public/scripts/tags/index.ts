/**
 * Tags module coordinator.
 * Wires together store, filters, UI, and orchestration.
 * External consumers should import from here (or from tags.js which re-exports this).
 */

// ──────────────────────────────────────────────
// Re-exports from sub-modules
// ──────────────────────────────────────────────

// Types & constants
export {
    TAG_FOLDER_TYPES,
    TAG_FOLDER_DEFAULT_TYPE,
    tag_filter_type,
    tag_import_setting,
    tag_sort_mode,
} from './types.js';

// Store
export {
    tags,
    tag_map,
    loadTagsSettings,
    renameTagKey,
    createTagMapFromList,
} from './store/tagStore.js';
export { getTagsList, getTagKeyForEntity, getTagKeyForEntityElement } from './store/tagStore.js';
export {
    removeTagFromMap,
    getTag,
    createNewTag,
    newTag,
    getExistingTags,
    getInlineListSelector,
    getTagKey,
    copyTags,
} from './store/tagStore.js';
export {
    getTagById,
    getTagIdsForKey,
    resolveElement,
    tagStoreEvents,
    markDirty,
} from './store/tagStore.js';
export { getTagIdsFromDOM, getTagFromEvent, getFolderType } from './store/tagStore.js';
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
export {
    isBogusFolder,
    isBogusFolderOpen,
    chooseBogusFolder,
    getTagBlock,
} from './folders/bogusFolders.js';

// Message tags
export { applyCharacterTagsToMessageDivs } from './messageTags.js';

// Events (initTags, applyTagsOnCharacterSelect, applyTagsOnGroupSelect, createTagInput)
export {
    initTags,
    applyTagsOnCharacterSelect,
    applyTagsOnGroupSelect,
    createTagInput,
} from './events.js';

// ──────────────────────────────────────────────
// Imports for filterByTagState / selectTag
// ──────────────────────────────────────────────

import { entitiesFilter } from '../../script.js';
import { TAG_FOLDER_TYPES } from './types.js';
import { FILTER_TYPES } from '../filters.js';
import { getTag, createNewTag, getFolderType } from './store/tagStore.js';
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
 * @param param1.globalDisplayFilters
 * @param param1.subForEntity
 * @param param1.filterHidden
 * @returns The filtered list of entities
 */
export function filterByTagState(
    entities: Record<string, unknown>[],
    {
        globalDisplayFilters = false,
        subForEntity = undefined,
        filterHidden = true,
    }: {
        globalDisplayFilters?: boolean;
        subForEntity?: Record<string, unknown>;
        filterHidden?: boolean;
    } = {},
): Record<string, unknown>[] {
    const filterData = structuredClone(entitiesFilter.getFilterData(FILTER_TYPES.TAG)) as {
        excluded: string[];
        selected: string[];
    };

    entities = entities.filter((entity: Record<string, unknown>) => {
        if (entity.type === 'tag') {
            if (
                filterData.selected.includes(entity.id as string) ||
                filterData.excluded.includes(entity.id as string)
            ) {
                return false;
            }
        }
        return true;
    });

    if (globalDisplayFilters) {
        const closedFolders = entities.filter(
            (x: Record<string, unknown>) =>
                x.type === 'tag' &&
                (getFolderType(x.item as Record<string, unknown>) as Record<string, unknown>)
                    .class ===
                    (TAG_FOLDER_TYPES as Record<string, { class: string }>).CLOSED!.class,
        );

        entities = entities.filter((entity: Record<string, unknown>) => {
            if (
                filterHidden &&
                entity.type !== 'tag' &&
                closedFolders.some(
                    (f: Record<string, unknown>) =>
                        entitiesFilter.isElementTagged(entity, f.id as string) &&
                        !filterData.selected.includes(f.id as string),
                )
            ) {
                return false;
            }
            if (entity.type === 'tag') {
                return (
                    (entity.entities as unknown[]).length > 0 ||
                    entitiesFilter.getFilterData(FILTER_TYPES.SEARCH)
                );
            }
            return true;
        });
    }

    if (subForEntity !== undefined && subForEntity.type === 'tag') {
        entities = filterTagSubEntities(subForEntity.item as Record<string, unknown>, entities, {
            filterHidden: filterHidden,
        });
    }

    return entities;
}

/**
 * Filter entities based on a given tag, returning all entities that represent "sub entities"
 * @param tag
 * @param entities
 * @param root0
 * @param root0.filterHidden
 */
function filterTagSubEntities(
    tag: Record<string, unknown>,
    entities: Record<string, unknown>[],
    { filterHidden = true }: { filterHidden?: boolean } = {},
): Record<string, unknown>[] {
    const filterData = structuredClone(entitiesFilter.getFilterData(FILTER_TYPES.TAG)) as {
        excluded: string[];
        selected: string[];
    };

    const closedFolders = entities.filter(
        (x: Record<string, unknown>) =>
            x.type === 'tag' &&
            (getFolderType(x.item as Record<string, unknown>) as Record<string, unknown>).class ===
                (TAG_FOLDER_TYPES as Record<string, { class: string }>).CLOSED!.class,
    );

    entities = entities.filter((sub: Record<string, unknown>) => {
        if (sub.type === 'tag' || !entitiesFilter.isElementTagged(sub, tag.id as string)) {
            return false;
        }
        if (
            filterHidden &&
            sub.type !== 'tag' &&
            (getFolderType(tag) as Record<string, unknown>).class !==
                (TAG_FOLDER_TYPES as Record<string, { class: string }>).CLOSED!.class &&
            closedFolders.some(
                (f: Record<string, unknown>) =>
                    entitiesFilter.isElementTagged(sub, f.id as string) &&
                    !filterData.selected.includes(f.id as string),
            )
        ) {
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
 * @param event
 * @param ui
 * @param ui.item
 * @param ui.item.value
 * @param listSelector
 * @param root1
 * @param root1.tagListOptions
 */
export function selectTag(
    event: Event | HTMLElement,
    ui: { item: { value: string } },
    listSelector: string,
    { tagListOptions = {} }: { tagListOptions?: Record<string, unknown> } = {},
): boolean {
    const tagName = ui.item.value;
    let tag = getTag(tagName);

    if (!tag) {
        tag = createNewTag(tagName);
    }

    const evtTarget = (event as Event).target as HTMLElement;
    if (evtTarget instanceof HTMLInputElement) {
        evtTarget.value = '';
        evtTarget.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const characterData = (evtTarget.closest('#bulk_tags_div') as HTMLElement)?.dataset.characters;
    const characterIds = characterData ? JSON.parse(characterData).characterIds : null;

    addTagsToEntity(tag, characterIds, {
        tagListSelector: listSelector,
        tagListOptions: tagListOptions,
    });

    applyCharacterTagsToMessageDivs();

    return false;
}

// ──────────────────────────────────────────────
// Entity helpers (moved from script.ts)
// ──────────────────────────────────────────────

/**
 * Converts a tag to an entity format used by the entity list system.
 * @param tag
 */
export function tagToEntity(tag: Record<string, unknown>): {
    item: Record<string, unknown>;
    id: string;
    type: string;
    entities: unknown[];
} {
    return { item: structuredClone(tag), id: tag.id as string, type: 'tag', entities: [] };
}
