/**
 * Tag system event handlers and initialization.
 * Wires up all DOM events and the initTags() entry point.
 */

import {
    this_chid,
    menu_type,
    eventSource,
    event_types,
} from '../../script.js';
import { selected_group } from '../group-chats.js';

// Store imports
import {
    tags, getTag, createNewTag,
    getTagById,
    copyTags,
} from './store/tagStore.js';

// Orchestrator imports (addTagsToEntity, removeTagFromEntity — separate to avoid circular deps)
import { addTagsToEntity, removeTagFromEntity } from './orchestrator.js';

// UI imports
import { printTagList } from './ui/tagList.js';
import { printTagFilters } from './ui/tagFilters.js';
import { onViewTagsListClick, onTagDeleteClick, onTagCreateClick, onTagAsFolderClick, onTagRenameInput } from './ui/tagEditor.js';
import { onTagsBackupClick, onBackupRestoreClick, onTagsPruneClick } from './import/importer.js';

import { tag_filter_type } from './types.js';
import { applyCharacterTagsToMessageDivs } from './messageTags.js';
import { restoreSavedTagFilters } from './filters/filterState.js';
import { registerTagsSlashCommands } from './commands/slashCommands.js';
import { chooseBogusFolder } from './folders/bogusFolders.js';

// TomSelect declaration
declare class TomSelect {
    constructor(el: Element, options: Record<string, unknown>);
    open(): void;
    destroy(): void;
}

// ──────────────────────────────────────────────
// Tag Input Helpers
// ──────────────────────────────────────────────

/**
 * @param event
 */
function onTagRemoveClick(this: HTMLElement, event: Event) {
    event.stopPropagation();
    const tagElement = this.closest('.tag');
    const tagId = tagElement?.getAttribute('id');

    // If we have a custom remove action, we are not executing anything here in the default handler
    if (tagElement?.getAttribute('custom-remove-action')) {
        console.debug('Custom remove action', tagId);
        return;
    }

    // Check if we are inside the drilldown. If so, we call remove on the bogus folder
    if (this.closest('.rm_tag_bogus_drilldown')) {
        console.debug('Bogus drilldown remove', tagId);
        chooseBogusFolder(this, tagId, true);
        return;
    }

    const tag = getTagById(tagId!);
    if (!tag) return;

    // Optional, check for multiple character ids being present.
    const characterData = ((event.target as Element).closest('#bulk_tags_div') as HTMLElement)?.dataset.characters;
    const characterIds = characterData ? JSON.parse(characterData).characterIds : null;

    removeTagFromEntity(tag, characterIds, { tagElement: tagElement as HTMLElement | null });

    applyCharacterTagsToMessageDivs();
}

/**
 * @param event
 */
function onTagInput(this: HTMLInputElement, event: Event) {
    const val = (this instanceof HTMLInputElement) ? this.value : '';
    if (getTag(String(val))) return;
    if ((this as unknown as { tomSelect?: { open: () => void } }).tomSelect) {
        (this as unknown as { tomSelect?: { open: () => void } }).tomSelect!.open();
    }
}

/**
 */
function onTagInputFocus(this: HTMLInputElement) {
    if ((this as unknown as { tomSelect?: { open: () => void } }).tomSelect) {
        (this as unknown as { tomSelect?: { open: () => void } }).tomSelect!.open();
    }
}

/**
 */
function onCharacterCreateClick() {
    const tagList = document.getElementById('tagList');
    if (tagList) tagList.innerHTML = '';
}

/**
 */
function onGroupCreateClick() {
    const groupTagList = document.getElementById('groupTagList');
    if (groupTagList) groupTagList.innerHTML = '';
}

// ──────────────────────────────────────────────
// Tag Input (TomSelect)
// ──────────────────────────────────────────────

/**
 *
 * @param inputSelector
 * @param listSelector
 * @param tagListOptions
 */
export function createTagInput(inputSelector: string, listSelector: string, tagListOptions: Record<string, unknown> = {}) {
    const el = document.querySelector(inputSelector);
    if (!el) return;

    // Lazy import to avoid circular dep
    import('./utils/search.js').then(({ findTag }) => {
        (el as unknown as Record<string, unknown>).tomSelect = new TomSelect(el as HTMLInputElement, {
            maxItems: null,
            create: false,
            minLength: 0,
            valueField: 'value',
            labelField: 'label',
            searchField: ['label'],
            load: function (query: string, loadCallback: (results: { value: string; label: string }[]) => void) {
                findTag({ term: query }, function (results: string[]) {
                    loadCallback(results.map((s: string) => ({ value: s, label: s })));
                }, listSelector);
            },
            onItemAdd: function (value: string) {
                let tag = getTag(value);
                if (!tag) {
                    tag = createNewTag(value);
                }
                const characterData = ((el as Element).closest('#bulk_tags_div') as HTMLElement)?.dataset.characters;
                const characterIds = characterData ? JSON.parse(characterData).characterIds : null;
                addTagsToEntity(tag, characterIds, { tagListSelector: listSelector, tagListOptions: tagListOptions });
                applyCharacterTagsToMessageDivs();
            },
        });

        el.addEventListener('focus', onTagInputFocus);
    });
}

// ──────────────────────────────────────────────
// Character/Group Selection
// ──────────────────────────────────────────────

/**
 * @param chid
 */
export function applyTagsOnCharacterSelect(chid: string | number | null = null) {
    // If we are in create window, we cannot simply redraw
    if (menu_type === 'create') {
        const tagListEl = document.querySelector('#tagList');
        const tagEls = tagListEl?.querySelectorAll('.tag') ?? [];
        const currentTagIds = Array.from(tagEls, (el: Element) => el.getAttribute('id'));
        const currentTags = (tags as Record<string, unknown>[]).filter((x: Record<string, unknown>) => currentTagIds.includes(x.id as string));
        printTagList(document.getElementById('tagList'), { forEntityOrKey: undefined, tags: currentTags, tagOptions: { removable: true } });
        return;
    }

    chid = chid ?? (this_chid !== undefined ? String(this_chid) : null);
    printTagList(document.getElementById('tagList'), { forEntityOrKey: chid, tagOptions: { removable: true } });
}

/**
 * @param groupId
 */
export function applyTagsOnGroupSelect(groupId: string | number | null = null) {
    // If we are in create window, we explicitly have to tell the system to print for the new group
    if (menu_type === 'group_create') {
        const tagListEl = document.querySelector('#groupTagList');
        const tagEls = tagListEl?.querySelectorAll('.tag') ?? [];
        const currentTagIds = Array.from(tagEls, (el: Element) => el.getAttribute('id'));
        const currentTags = (tags as Record<string, unknown>[]).filter((x: Record<string, unknown>) => currentTagIds.includes(x.id as string));
        printTagList(document.getElementById('groupTagList'), { forEntityOrKey: undefined, tags: currentTags, tagOptions: { removable: true } });
        return;
    }

    groupId = groupId ?? (selected_group ? String(selected_group) : null);
    printTagList(document.getElementById('groupTagList'), { forEntityOrKey: groupId, tagOptions: { removable: true } });
    printTagFilters(tag_filter_type.group_candidates_list);
    printTagFilters(tag_filter_type.group_members_list);
}

// ──────────────────────────────────────────────
// Event Delegation
// ──────────────────────────────────────────────

/**
 * Initialize the tag system. Sets up all event listeners.
 */
export function initTags() {
    createTagInput('#tagInput', '#tagList', { tagOptions: { removable: true } });
    createTagInput('#groupTagInput', '#groupTagList', { tagOptions: { removable: true } });

    document.getElementById('rm_button_create')?.addEventListener('click', onCharacterCreateClick);
    document.getElementById('rm_button_group_chats')?.addEventListener('click', onGroupCreateClick);
    document.addEventListener('click', function (event) {
        if (!(event.target instanceof Element)) return;
        const el = event.target.closest('.tag_remove') as HTMLElement;
        if (el) onTagRemoveClick.call(el, event);
    });
    document.addEventListener('input', function (event) {
        if (!(event.target instanceof Element)) return;
        const el = event.target.closest('.tag_input') as HTMLInputElement;
        if (el) onTagInput.call(el, event);
    });
    document.addEventListener('click', function (event) {
        if (!(event.target instanceof Element)) return;
        const el = event.target.closest('.tags_view') as HTMLElement;
        if (el) {
            event.preventDefault();
            onViewTagsListClick();
        }
    });
    document.addEventListener('click', function (event) {
        if (!(event.target instanceof Element)) return;
        const el = event.target.closest('.tag_delete') as HTMLElement;
        if (el) onTagDeleteClick.call(el);
    });
    document.addEventListener('click', function (event) {
        if (!(event.target instanceof Element)) return;
        const el = event.target.closest('.tag_as_folder') as HTMLElement;
        if (el) onTagAsFolderClick.call(el);
    });
    document.addEventListener('input', function (event) {
        if (!(event.target instanceof Element)) return;
        const el = event.target.closest('.tag_view_name') as HTMLElement;
        if (el) onTagRenameInput.call(el);
    });
    document.addEventListener('click', function (event) {
        if (!(event.target instanceof Element)) return;
        const el = event.target.closest('.tag_view_create');
        if (el) onTagCreateClick.call(el);
    });
    document.addEventListener('click', function (event) {
        if (!(event.target instanceof Element)) return;
        const el = event.target.closest('.tag_view_backup');
        if (el) onTagsBackupClick.call(el);
    });
    document.addEventListener('click', function (event) {
        if (!(event.target instanceof Element)) return;
        const el = event.target.closest('.tag_view_restore');
        if (el) onBackupRestoreClick.call(el);
    });
    document.addEventListener('click', function (event) {
        if (!(event.target instanceof Element)) return;
        const el = event.target.closest('.tag_view_prune');
        if (el) onTagsPruneClick.call(el);
    });
    eventSource.on(event_types.CHARACTER_DUPLICATED, copyTags);

    eventSource.makeFirst(event_types.CHAT_CHANGED, () => selected_group ? applyTagsOnGroupSelect() : applyTagsOnCharacterSelect());

    document.addEventListener('focusout', function (event) {
        if (!(event.target instanceof Element)) return;
        const el = event.target.closest('#tag_view_list .tag_view_name');
        if (!el) return;
        if (!el.hasAttribute('dirty')) return;

        const tagId = el.closest('.tag_view_item')?.getAttribute('id');
        const tagViewItems = document.querySelectorAll('#tag_view_list .tag_view_item');
        const oldOrder = Array.from(tagViewItems, el => el.id);

        import('./ui/tagEditor.js').then((mod: Record<string, unknown>) => { const printViewTagList = mod.printViewTagList as (el: Element | null) => void;
            printViewTagList(document.querySelector('#tag_view_list .tag_view_list_tags'));

            if (event.relatedTarget instanceof HTMLElement && event.relatedTarget.closest('#tag_view_list')) {
                (document.querySelector(`#tag_view_list .tag_view_item[id="${tagId}"] .tag_view_name`) as HTMLElement)?.focus();
            }

            const newTagViewItems = document.querySelectorAll('#tag_view_list .tag_view_item');
            const newOrder = Array.from(newTagViewItems, el => el.id);
            const orderChanged = !oldOrder.every((id, index) => id === newOrder[index]);
            if (orderChanged) {
                import('../utils.js').then(({ flashHighlight }) => {
                    flashHighlight(document.querySelector(`#tag_view_list .tag_view_item[id="${tagId}"]`));
                });
            }
        });
    });

    registerTagsSlashCommands();
    restoreSavedTagFilters();
}
