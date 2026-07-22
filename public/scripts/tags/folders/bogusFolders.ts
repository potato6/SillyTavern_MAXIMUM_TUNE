/**
 * Bogus folder logic for the tag system.
 * Handles bogus folder detection, open state, drill-down navigation, and rendering.
 */

import { TAG_FOLDER_DEFAULT_TYPE } from '../types.js';
import { FILTER_STATES, FILTER_TYPES, DEFAULT_FILTER_STATE } from '../../filters.js';
import { entitiesFilter, buildAvatarList } from '../../../script.js';
import { getTagById } from '../store/tagStore.js';
import { getFolderType } from '../store/tagStore.js';
import { toggleTagThreeState } from '../filters/filterState.js';
import { t } from '../../i18n.js';

const FOLDER_TEMPLATE = document.querySelector('#bogus_folder_template .bogus_folder_select');

/**
 * Indicates whether a given tag is defined as a folder. Meaning it's neither undefined nor 'NONE'.
 * @param {Tag} tag - The tag to check
 * @returns {boolean} Whether it's a tag folder
 */
export function isBogusFolder(tag: Record<string, unknown> | undefined | null): boolean {
    return tag?.folder_type !== undefined && tag.folder_type !== TAG_FOLDER_DEFAULT_TYPE;
}

/**
 * Retrieves all currently open bogus folders
 * @returns {Tag[]} An array of open bogus folders
 */
export function getOpenBogusFolders(): Record<string, unknown>[] {
    const filterData = entitiesFilter.getFilterData(FILTER_TYPES.TAG) as
        | { selected?: string[] }
        | undefined;
    return (
        (filterData?.selected ?? [])
            .map((tagId: string) => getTagById(tagId))
            .filter(
                (tag): tag is NonNullable<typeof tag> => tag !== undefined && isBogusFolder(tag),
            ) ?? []
    );
}

/**
 * Indicates whether a user is currently in a bogus folder
 * @returns {boolean} If currently viewing a folder
 */
export function isBogusFolderOpen() {
    return getOpenBogusFolders().length > 0;
}

/**
 * Function to be called when a specific tag/folder is chosen to "drill down".
 * @param {*} source The jQuery element clicked when choosing the folder
 * @param {string} tagId The tag id that is behind the chosen folder
 * @param {boolean} remove Whether the given tag should be removed (otherwise it is added/chosen)
 */
export function chooseBogusFolder(
    source: Element,
    tagId: string | null | undefined,
    remove = false,
) {
    // If we are here via the 'back' action, we implicitly take the last filtered folder as one to remove
    const isBack = tagId === 'back';
    if (isBack) {
        const drilldown = source
            .closest('#rm_characters_block')
            ?.querySelector('.rm_tag_bogus_drilldown');
        const drilldownTags = drilldown?.querySelectorAll('.tag');
        const lastTag = drilldownTags?.[drilldownTags.length - 1];
        tagId = lastTag?.getAttribute('id');
        remove = true;
    }

    // Instead of manually updating the filter conditions, we just "click" on the filter tag
    // We search inside which filter block we are located in and use that one
    const FILTER_SELECTOR = (
        source.closest('#rm_characters_block') ?? source.closest('#rm_group_chats_block')
    )?.querySelector('.rm_tag_filter');
    const tagElement = FILTER_SELECTOR?.querySelector(`.tag[id=${tagId}]`) as HTMLElement | null;

    toggleTagThreeState(tagElement, {
        stateOverride: !remove ? FILTER_STATES.SELECTED.key : DEFAULT_FILTER_STATE,
        simulateClick: true,
    });
}

/**
 * Builds the tag block for the specified item.
 * @param {Tag} tag The tag item
 * @param {any[]} entities The list ob sub items for this tag
 * @param {number} hidden A count of how many sub items are hidden
 * @param {boolean} isUseless Whether the tag is useless (should be displayed greyed out)
 * @returns The html for the tag block
 */
export function getTagBlock(
    tag: Record<string, unknown>,
    entities: unknown[],
    hidden = 0,
    isUseless = false,
): Node {
    const count = entities.length;

    const tagFolder = getFolderType(tag);

    const template = FOLDER_TEMPLATE!.cloneNode(true) as HTMLElement;
    template.classList.add(tagFolder?.class ?? '');
    template.setAttribute('tagid', String(tag.id));
    template.setAttribute('id', `BogusFolder${tag.id}`);
    const avatar = template.querySelector('.avatar');
    if (avatar) {
        (avatar as HTMLElement).style.backgroundColor = tag.color as string;
        (avatar as HTMLElement).style.color = tag.color2 as string;
        avatar.setAttribute('title', `[Folder] ${tag.name as string}`);
    }
    const chName = template.querySelector('.ch_name');
    if (chName) {
        chName.textContent = tag.name as string;
        chName.setAttribute('title', `[Folder] ${tag.name as string}`);
    }
    const hiddenCounter = template.querySelector('.bogus_folder_hidden_counter');
    if (hiddenCounter) hiddenCounter.textContent = hidden > 0 ? `${hidden} hidden` : '';
    const counter = template.querySelector('.bogus_folder_counter');
    if (counter) counter.textContent = `${count} ` + (count != 1 ? t`characters` : t`character`);
    const icon = template.querySelector('.bogus_folder_icon');
    if (icon && tagFolder) icon.classList.add(tagFolder.fa_icon!);
    if (isUseless) template.classList.add('useless');

    // Fill inline character images
    const avatarsBlock = template.querySelector('.bogus_folder_avatars_block');
    if (avatarsBlock) buildAvatarList(avatarsBlock, entities);

    return template;
}
