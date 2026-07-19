/**
 * Tag import/export module.
 * Handles importing tags into character/group entities, backup, restore, and pruning.
 */

import { tags, tag_map, getTag, getTagById, newTag, getExistingTags, markDirty } from '../store/tagStore.js';
import { getOpenBogusFolders } from '../folders/bogusFolders.js';
import { printTagList } from '../ui/tagList.js';
import { tag_import_setting } from '../types.js';

import { characters } from '../../../script.js';
import { groups } from '../../group-chats.js';
import { power_user } from '../../power-user.js';
import { download, onlyUnique, parseJsonFile, escapeHtml, removeFromArray } from '../../utils.js';
import { POPUP_RESULT, POPUP_TYPE, Popup, callGenericPopup } from '../../popup.js';
import { renderTemplateAsync } from '../../templates.js';
import { DOMPurify } from '../../../lib.js';
import { t } from '../../i18n.js';

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

export const IMPORT_EXLCUDED_TAGS = ['ROOT', 'TAVERN'];

export const ANTI_TROLL_MAX_TAGS = 50;

// ──────────────────────────────────────────────
// Import Functions
// ──────────────────────────────────────────────

/**
 * Imports tags for a given character
 * @param character - The character
 * @param options - Options
 * @param character.avatar
 * @param character.name
 * @param character.tags
 * @param options.importSetting - Force a tag import setting
 * @returns Promise resolving to boolean indicating whether any tag was imported
 */
export async function importTags(character: { avatar: string; name: string; tags: string[] }, { importSetting = null }: { importSetting?: number | null } = {}): Promise<boolean> {
    const tagNamesToImport = await handleTagImport(character, { importSetting });
    if (!tagNamesToImport?.length) {
        console.debug('No tags to import');
        return false;
    }

    const tagsToImport = tagNamesToImport.map((tag: string) => getTag(tag, { createNew: true })).filter((x): x is Record<string, unknown> => !!x);
    const added = addTagsToEntity(tagsToImport as { id: string }[], character.avatar);
    const tagNames = tagsToImport.map((x: Record<string, unknown>) => escapeHtml(x.name as string)).join(', ');

    if (added) {
        notyf.success(t`Imported tags:` + `<br />${tagNames}`, t`Importing Tags`, { escapeHtml: false });
    } else {
        notyf.error(t`Couldn't import tags:` + `<br />${tagNames}`, t`Importing Tags`, { escapeHtml: false });
    }

    return added;
}

/**
 * Handles the import of tags for a given character and returns the resulting list of tags to add
 * @param character - The character
 * @param options - Options
 * @param character.avatar
 * @param character.name
 * @param character.tags
 * @param options.importSetting - Force a tag import setting
 * @returns Promise resolving to an array of strings representing the tags to import
 */
export async function handleTagImport(character: { avatar: string; name: string; tags: string[] }, { importSetting = null }: { importSetting?: number | null } = {}): Promise<string[]> {
    const alreadyAssignedTags: string[] = (tag_map as Record<string, string[] | undefined>)[character.avatar] ?? [];
    const importTagsList = character.tags.map((t: string) => t.trim()).filter((t: string) => t)
        .filter((t: string) => !IMPORT_EXLCUDED_TAGS.includes(t))
        .filter((t: string) => {
            const foundTag = getTag(t);
            return !foundTag || !alreadyAssignedTags.includes(foundTag.id as string);
        })
        .slice(0, ANTI_TROLL_MAX_TAGS);
    const existingTags = getExistingTags(importTagsList);
    const newTags = importTagsList.filter((t: string) => !existingTags.some((existingTag: Record<string, unknown>) => (existingTag.name as string).toLowerCase() === t.toLowerCase()))
        .map(newTag);
    const folderTags = getOpenBogusFolders();

    const setting = importSetting ? importSetting :
        Object.values(tag_import_setting).find((setting: number) => setting === power_user.tag_import_setting) ?? tag_import_setting.ASK;

    switch (setting) {
        case tag_import_setting.ALL:
            return [...existingTags, ...newTags, ...folderTags].map((t: Record<string, unknown>) => t.name as string);
        case tag_import_setting.ONLY_EXISTING:
            return [...existingTags, ...folderTags].map((t: Record<string, unknown>) => t.name as string);
        case tag_import_setting.ASK: {
            if (!existingTags.length && !newTags.length && !folderTags.length) {
                return [];
            }
            return await showTagImportPopup(character, existingTags as { id: string; name: string }[], newTags as { id: string; name: string }[], folderTags as { id: string; name: string }[]);
        }
        case tag_import_setting.NONE:
            return [];
        default: throw new Error(`Invalid tag import setting: ${setting}`);
    }
}

/**
 * Shows a popup to import tags for a given character and returns the resulting list of tags to add
 * @param character - The character
 * @param character.name
 * @param existingTags - List of existing tags
 * @param newTags - List of new tags
 * @param folderTags - List of tags in the current folder
 * @returns Promise resolving to an array of strings representing the tags to import
 */
export async function showTagImportPopup(character: { name: string }, existingTags: { id: string; name: string }[], newTags: { id: string; name: string }[], folderTags: { id: string; name: string }[]): Promise<string[]> {
    const importButtons = {
        NONE: { result: 2, text: 'Import None' },
        ALL: { result: 3, text: 'Import All' },
        EXISTING: { result: 4, text: 'Import Existing' },
    } as const;
    const buttonSettingsMap: Record<number, number> = {
        [POPUP_RESULT.AFFIRMATIVE]: tag_import_setting.ASK,
        [importButtons.NONE.result]: tag_import_setting.NONE,
        [importButtons.ALL.result]: tag_import_setting.ALL,
        [importButtons.EXISTING.result]: tag_import_setting.ONLY_EXISTING,
    };

    const popupContent = document.createElement('div');
    popupContent.innerHTML = await renderTemplateAsync('charTagImport', { charName: character.name });
    const popupEl = popupContent;

    // Print tags after popup is shown, so that events can be added
    printTagList(popupEl?.querySelector('#import_existing_tags_list'), { tags: existingTags, tagOptions: { removable: true, removeAction: (tag: { id: string; name: string }) => removeFromArray(existingTags, tag) } });
    printTagList(popupEl?.querySelector('#import_new_tags_list'), { tags: newTags, tagOptions: { removable: true, removeAction: (tag: { id: string; name: string }) => removeFromArray(newTags, tag) } });
    printTagList(popupEl?.querySelector('#import_folder_tags_list'), { tags: folderTags, tagOptions: { removable: true, removeAction: (tag: { id: string; name: string }) => removeFromArray(folderTags, tag) } });

    if (folderTags.length === 0) {
        const folderTagsBlock = popupEl?.querySelector('#folder_tags_block') as HTMLElement | null;
        if (folderTagsBlock) folderTagsBlock.style.display = 'none';
    }

    /**
     *
     * @param popup
     * @param popup.result
     * @param popup.inputResults
     */
    function onCloseRemember(popup: { result: number; inputResults: Map<string, unknown> }) {
        if (popup.result && popup.inputResults.get('import_remember_option')) {
            const setting = buttonSettingsMap[popup.result];
            if (!setting) return;
            power_user.tag_import_setting = setting;
            const tagImportSetting = document.getElementById('tag_import_setting');
            if (tagImportSetting instanceof HTMLSelectElement) {
                tagImportSetting.value = String(power_user.tag_import_setting);
            }
            markDirty();
            console.log('Remembered tag import setting:', Object.entries(tag_import_setting).find((x: [string, number]) => x[1] === setting)?.[0], setting);
        }
    }

    const result = await callGenericPopup(popupContent, POPUP_TYPE.TEXT, undefined, {
        wider: true, okButton: 'Import', cancelButton: true,
        customButtons: Object.values(importButtons),
        customInputs: [{ id: 'import_remember_option', label: 'Remember my choice', tooltip: 'Remember the chosen import option\nIf anything besides \'Cancel\' is selected, this dialog will not show up anymore.\nTo change this, go to the settings and modify "Tag Import Option".\n\nIf the "Import" option is chosen, the global setting will stay on "Ask".' }],
        onClose: onCloseRemember,
    });
    if (!result) {
        return [];
    }

    switch (result) {
        case POPUP_RESULT.AFFIRMATIVE:
        case importButtons.ALL.result:
            return [...existingTags, ...newTags, ...folderTags].map((t: { name: string }) => t.name);
        case importButtons.EXISTING.result:
            return [...existingTags, ...folderTags].map((t: { name: string }) => t.name);
        case importButtons.NONE.result:
        default:
            return [];
    }
}

// ──────────────────────────────────────────────
// Backup & Restore Functions
// ──────────────────────────────────────────────

/**
 * Creates a backup JSON file of all tags and tag_map data
 */
export function onTagsBackupClick() {
    const timestamp = new Date().toISOString().split('T')[0]?.replace(/-/g, '');
    const filename = `tags_${timestamp}.json`;
    const data = {
        tags: tags,
        tag_map: tag_map,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    download(blob, filename, 'application/json');
}

/**
 * Triggers a file input click to initiate tag restore
 */
export function onBackupRestoreClick() {
    const input = document.getElementById('tag_view_restore_input');
    if (!input) return;
    input.addEventListener('change', onTagRestoreFileSelect);
    input.dispatchEvent(new Event('click'));
}

/**
 * Handles the file restore process when a user selects a backup file
 * @param e - The file input change event
 */
export async function onTagRestoreFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
        console.log('Tag restore: No file selected.');
        return;
    }

    const data = await parseJsonFile(file);

    if (!data) {
        notyf.warning('Empty file data', 'Tag Restore');
        console.log('Tag restore: File data empty.');
        return;
    }

    const importData = data as Record<string, unknown>;
    if (!importData.tags || !importData.tag_map || !Array.isArray(importData.tags) || typeof importData.tag_map !== 'object') {
        notyf.warning('Invalid file format', 'Tag Restore');
        console.log('Tag restore: Invalid file format.');
        return;
    }

    let overwrite = false;
    if (tags.length > 0) {
        const result = await Popup.show.confirm('Tag Restore', 'You have existing tags. If the backup contains any of those tags, do you want the backup to overwrite their settings (Name, color, folder state, etc)?',
            { okButton: 'Overwrite', cancelButton: 'Keep Existing' });
        overwrite = result === POPUP_RESULT.AFFIRMATIVE;
    }

    const warnings: string[] = [];
    const idToActualTagIdMap = new Map<string, string>();

    for (const tag of importData.tags as Array<Record<string, unknown>>) {
        if (!tag.id || !tag.name) {
            warnings.push(`Tag object is invalid: ${JSON.stringify(tag)}.`);
            continue;
        }

        let existingTag: Record<string, unknown> | undefined = getTagById(tag.id as string);
        if (existingTag && !overwrite) {
            warnings.push(`Tag '${String(tag.name)}' with id ${String(tag.id)} already exists.`);
            continue;
        }
        existingTag = getTag(tag.name as string);
        if (existingTag && !overwrite) {
            warnings.push(`Tag with name '${String(tag.name)}' already exists.`);
            idToActualTagIdMap.set(tag.id as string, existingTag.id as string);
            continue;
        }

        if (existingTag) {
            if (existingTag.id !== tag.id) {
                idToActualTagIdMap.set(existingTag.id as string, tag.id as string);
            }
        }
    }

    const tagMap = importData.tag_map as Record<string, unknown>;
    for (const key of Object.keys(tagMap)) {
        const tagIds = tagMap[key];

        if (!Array.isArray(tagIds)) {
            warnings.push(`Tag map for key ${key} is invalid: ${JSON.stringify(tagIds)}.`);
            continue;
        }

        const characterExists = characters.some((x: { avatar: string }) => String(x.avatar) === String(key));
        const groupExists = groups.some((x: { id: string }) => String(x.id) === String(key));

        if (!characterExists && !groupExists) {
            warnings.push(`Tag map key ${key} does not exist as character or group.`);
            continue;
        }

        const existingTagIds: string[] = (tag_map as Record<string, string[] | undefined>)[key] || [];

        const combinedTags = existingTagIds.concat(tagIds)
            .map((tagId: string) => (idToActualTagIdMap.has(tagId)) ? idToActualTagIdMap.get(tagId)! : tagId)
            .filter(onlyUnique);

        (tag_map as Record<string, string[] | undefined>)[key] = combinedTags.filter((tagId: string) => tags.some((y: { id: string }) => String(y.id) === String(tagId)));
    }

    if (warnings.length) {
        notyf.warning('Tags restored with warnings. Check console or click on this message for details.', 'Tag Restore', {
            onclick: () => Popup.show.text('Tag Restore Warnings', `<samp class="justifyLeft">${DOMPurify.sanitize(warnings.join('\n'))}</samp>`, { allowVerticalScrolling: true }),
        });
        console.warn(`TAG RESTORE REPORT\n====================\n${warnings.join('\n')}`);
    } else {
        notyf.success('Tags restored successfully.', 'Tag Restore');
    }

    document.getElementById('tag_view_restore_input')?.setAttribute('value', '');
    markDirty();

    import('../ui/tagList.js').then(({ printViewTagList }) => {
        printViewTagList(document.querySelector('#tag_view_list .tag_view_list_tags') as HTMLElement | null);
    });
}

// ──────────────────────────────────────────────
// Prune Function
// ──────────────────────────────────────────────

/**
 * Removes unused tags and references to deleted characters/groups
 */
export async function onTagsPruneClick() {
    const allTagsInTagMaps = new Set(Object.values(tag_map).flat());
    const tagsToPrune = tags.filter((tag: { id: string }) => !allTagsInTagMaps.has(tag.id));

    const allEntityKeys = new Set([...characters.map((c: { avatar: string }) => String(c.avatar)), ...groups.map((g: { id: string }) => String(g.id))]);
    const tagMapsToPrune = Object.keys(tag_map).filter((key: string) => !allEntityKeys.has(key));

    if (!tagsToPrune.length && !tagMapsToPrune.length) {
        notyf.info(t`No unused tags or references found.`);
        return;
    }

    const confirm = await Popup.show.confirm(t`Prune ${tagsToPrune.length} tags and ${tagMapsToPrune.length} references`, t`Are you sure you want to remove all unused tags and references to missing or deleted characters and groups?`);

    if (!confirm) {
        return;
    }

    for (const tag of tagsToPrune) {
        tags.splice(tags.indexOf(tag), 1);
    }

    for (const key of tagMapsToPrune) {
        delete (tag_map as Record<string, string[] | undefined>)[key];
    }

    markDirty();

    import('../ui/tagList.js').then(({ printViewTagList }) => {
        const tagContainer = document.querySelector('#tag_view_list .tag_view_list_tags') as HTMLElement | null;
        printViewTagList(tagContainer);
    });
}

// ──────────────────────────────────────────────
// Internal Helper
// ──────────────────────────────────────────────

/**
 * Adds tags to an entity (character or group)
 * @param tag - Tag or array of tags to add
 * @param entityId - The entity key to add tags to
 * @returns Whether at least one tag was added
 */
function addTagsToEntity(tag: { id: string } | { id: string }[], entityId: string | string[]): boolean {
    const tagArray = Array.isArray(tag) ? tag : [tag];
    const entityIds = Array.isArray(entityId) ? entityId : [entityId];

    let result = false;

    entityIds.forEach((id: string) => {
        tagArray.forEach((t: { id: string }) => {
            if (!(tag_map as Record<string, string[] | undefined>)[id]) {
                (tag_map as Record<string, string[] | undefined>)[id] = [];
            }
            if (!(tag_map as Record<string, string[] | undefined>)[id]!.includes(t.id)) {
                (tag_map as Record<string, string[] | undefined>)[id]!.push(t.id);
                result = true;
            }
        });
    });

    markDirty();

    return result;
}
