/**
 * Tags module — public API coordinator.
 * All implementation is split into focused sub-modules under tags/.
 * This file re-exports the public API for backward compatibility.
 *
 * Sub-module structure:
 *   tags/
 *   ├── index.ts          (coordinator, filterByTagState, selectTag)
 *   ├── types.ts          (enums, type definitions)
 *   ├── orchestrator.ts   (addTagsToEntity, removeTagFromEntity)
 *   ├── events.ts         (initTags, event handlers, tag input)
 *   ├── messageTags.ts    (applyCharacterTagsToMessageDivs)
 *   ├── store/
 *   │   └── tagStore.ts   (tags[], tag_map{}, CRUD, key resolution)
 *   ├── utils/
 *   │   ├── sorting.ts    (sortTags, compareTagsForSort)
 *   │   └── search.ts     (findTag, searchCharByName)
 *   ├── filters/
 *   │   ├── filterContext.ts  (getFilterHelper, getFilterContext, etc.)
 *   │   └── filterState.ts   (ACTIONABLE_TAGS, toggleTagThreeState, etc.)
 *   ├── folders/
 *   │   └── bogusFolders.ts  (isBogusFolder, chooseBogusFolder, etc.)
 *   ├── ui/
 *   │   ├── tagList.ts       (printTagList, appendTagToList)
 *   │   ├── tagFilters.ts    (printTagFilters, filter UI)
 *   │   └── tagEditor.ts     (tag management dialog)
 *   ├── import/
 *   │   └── importer.ts      (import/export/backup/restore/prune)
 *   └── commands/
 *       └── slashCommands.ts (tag-add, tag-remove, etc.)
 */

export {
    // Types & constants
    TAG_FOLDER_TYPES,
    TAG_FOLDER_DEFAULT_TYPE,
    tag_filter_type,
    tag_import_setting,
    tag_sort_mode,

    // Store
    tags,
    tag_map,
    loadTagsSettings,
    renameTagKey,
    createTagMapFromList,
    getTagsList,
    getTagKeyForEntity,
    getTagKeyForEntityElement,
    removeTagFromMap,
    getTagById,
    getTagIdsForKey,
    resolveElement,
    tagStoreEvents,
    markDirty,
    tagToEntity,
    getTag,
    createNewTag,
    newTag,
    getExistingTags,
    getInlineListSelector,
    getTagKey,
    copyTags,

    // Sorting
    sortTags,
    compareTagsForSort,

    // Orchestrator
    addTagsToEntity,
    removeTagFromEntity,

    // UI
    printTagList,
    appendTagToList,
    printTagFilters,

    // Import
    importTags,

    // Search
    searchCharByName,

    // Folders
    isBogusFolder,
    isBogusFolderOpen,
    chooseBogusFolder,
    getTagBlock,

    // Message tags
    applyCharacterTagsToMessageDivs,

    // Events
    initTags,
    applyTagsOnCharacterSelect,
    applyTagsOnGroupSelect,
    createTagInput,

    // Filter logic
    filterByTagState,
    selectTag,
} from './tags/index.js';
