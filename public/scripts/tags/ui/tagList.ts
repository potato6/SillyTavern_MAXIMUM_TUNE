/**
 * UI tag list rendering module.
 * Pure rendering functions for tag lists.
 */

import {
    tags,
    tag_map,
    getTagsList,
    getTagKey,
    getTagKeyForEntity,
    getTagKeyForEntityElement,
    getTagById,
    resolveElement,
    markDirty,
    getTagIdsFromDOM,
} from '../store/tagStore.js';
import { isBogusFolder } from '../folders/bogusFolders.js';
import {
    getFilterHelper,
    isMainCharacterList,
    getFilterStorageKey,
} from '../filters/filterContext.js';
import { determineTagFilterState, toggleTagThreeState } from '../filters/filterState.js';
import { FILTER_TYPES, FILTER_STATES, isFilterState } from '../../filters.js';
import { uuidv4, debounce } from '../../utils.js';
import { t, translate } from '../../i18n.js';
import { INTERACTABLE_CONTROL_CLASS } from '../../keyboard.js';
import { compareTagsForSort, sortTags } from '../utils/sorting.js';
import { power_user } from '../../power-user.js';
import { DEFAULT_PRINT_TIMEOUT } from '../../../script.js';
import { debounce_timeout } from '../../constants.js';
import { accountStorage } from '../../util/AccountStorage.js';

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const TAG_TEMPLATE = document.querySelector('#tag_template .tag') as HTMLElement | null;
const FOLDER_TEMPLATE = document.querySelector('#bogus_folder_template .bogus_folder_select');
const VIEW_TAG_TEMPLATE = document.querySelector(
    '#tag_view_template .tag_view_item',
) as HTMLElement | null;

/**
 * A cache of all cut-off tag lists that got expanded until the last reload. They will be printed expanded again.
 * It contains the key of the entity.
 * @type {string[]} ids
 */
const expanded_tags_cache: string[] = [];

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

/**
 * Runs tag filters for a given list element.
 * @param {JQuery<HTMLElement>|string} listElement - The list element or selector
 */
function runTagFilters(listElement: string | HTMLElement | null) {
    const $listEl = resolveElement(listElement);
    const tagIds = getTagIdsFromDOM($listEl, '.tag.selected:not(.actionable)');
    const excludedTagIds = getTagIdsFromDOM($listEl, '.tag.excluded:not(.actionable)');
    const filterHelper = getFilterHelper(listElement) as {
        setFilterData: (type: string, data: Record<string, unknown>) => void;
        getFilterData: (type: string) => unknown;
    };
    filterHelper.setFilterData(FILTER_TYPES.TAG, { excluded: excludedTagIds, selected: tagIds });
}

/**
 * Handles the click event on a tag filter.
 * Toggles the three-state filter and persists the selection.
 * @this {HTMLElement} The tag element that was clicked
 * @param {JQuery<HTMLElement>|string} listElement - The list element containing this tag
 */
function onTagFilterClick(this: HTMLElement, listElement: string | HTMLElement | null) {
    const tagId = this.getAttribute('id')!;
    const existingTag = getTagById(tagId);
    const parent = this.closest('.tags');

    const state = toggleTagThreeState(this);

    const filterHelper = getFilterHelper(listElement);

    // Update the tag's filter_state for the main character list (backward compatibility)
    if (existingTag && isMainCharacterList(filterHelper)) {
        existingTag.filter_state = state;
        markDirty();
    }

    // Persist to storage for all contexts
    const storagePrefix = getFilterStorageKey(filterHelper);
    if (storagePrefix && existingTag) {
        const storageKey = `${storagePrefix}_tag_${tagId}`;
        accountStorage.setItem(storageKey, state);
    }

    // Apply all tag filters by reading from DOM state (this triggers the filter helper update)
    runTagFilters(listElement);

    // Focus the tag again we were at, if possible. To improve keyboard navigation
    setTimeout(
        () => (parent?.querySelector(`.tag[id="${tagId}"]`) as HTMLElement)?.focus(),
        DEFAULT_PRINT_TIMEOUT + 1,
    );
}

const debouncedTagColoring = debounce((tagId: string, cssProperty: string, newColor: string) => {
    document
        .querySelectorAll(`.tag[id="${tagId}"]`)
        .forEach((el) => (el as HTMLElement).style.setProperty(cssProperty, newColor));
    document
        .querySelectorAll(`.bogus_folder_select[tagid="${tagId}"] .avatar`)
        .forEach((el) => (el as HTMLElement).style.setProperty(cssProperty, newColor));
}, debounce_timeout.quick);

/**
 * Handles the colorize event for a tag in the view tags popup.
 * @param {Event} evt - The change event from the color picker
 * @param {function(Tag, string): void} setColor - Function to set the color on the tag
 * @param {string} cssProperty - The CSS property to update ('background-color' or 'color')
 */
function onTagColorize(
    evt: Event,
    setColor: (tag: Record<string, unknown>, color: string) => void,
    cssProperty: string,
) {
    const isDefaultColor =
        (evt.target as HTMLElement).dataset?.defaultColor === (evt as CustomEvent).detail.rgba;
    const colorPickerEl = (evt.target as Element).closest('.tag_view_color_picker');
    const linkIcon = colorPickerEl?.querySelector('.link_icon');
    if (linkIcon) (linkIcon as HTMLElement).style.display = isDefaultColor ? 'none' : '';

    const tagViewItem = (evt.target as Element).closest('.tag_view_item');
    const id = tagViewItem?.getAttribute('id');
    let newColor = (evt as CustomEvent).detail.rgba;
    if (isDefaultColor) newColor = '';

    const tagViewName = tagViewItem?.querySelector('.tag_view_name');
    if (tagViewName) (tagViewName as HTMLElement).style.setProperty(cssProperty, newColor);
    const tag = getTagById(id!);
    setColor(tag!, newColor);
    markDirty();

    // Debounce redrawing color of the tag in other elements
    debouncedTagColoring(tag!.id, cssProperty, newColor);
}

// ──────────────────────────────────────────────
// Tag list rendering
// ──────────────────────────────────────────────

/**
 * Prints the list of tags
 * @param {JQuery<HTMLElement>|string} element - The container element where the tags are to be printed. (Optionally can also be a string selector for the element, which will then be resolved)
 * @param {PrintTagListOptions} [options] - Optional parameters for printing the tag list.
 */
function printTagList(
    element: string | HTMLElement | null,
    {
        tags: tagsParam = undefined,
        addTag = undefined,
        forEntityOrKey = undefined,
        empty = true,
        sort = true,
        tagActionSelector = undefined,
        tagOptions = {},
        inactiveTags = [],
    }: {
        tags?: Record<string, unknown>[] | (() => Record<string, unknown>[]) | undefined;
        addTag?: Record<string, unknown> | Record<string, unknown>[] | undefined;
        forEntityOrKey?: unknown;
        empty?: boolean | string;
        sort?: boolean;
        tagActionSelector?:
            | ((tag: Record<string, unknown>) => ((...args: unknown[]) => unknown) | undefined)
            | undefined;
        tagOptions?: Record<string, unknown>;
        inactiveTags?: string[];
    } = {},
) {
    const listElement = resolveElement(element);
    const key = forEntityOrKey !== undefined ? getTagKeyForEntity(forEntityOrKey) : getTagKey();
    let printableTags: Record<string, unknown>[] = tagsParam
        ? typeof tagsParam === 'function'
            ? tagsParam()
            : tagsParam
        : getTagsList(key, sort);

    if (tagOptions.isCharacterList) {
        printableTags = printableTags.filter(
            (tag: Record<string, unknown>) => !tag.is_hidden_on_character_card,
        );
    }

    if (empty === 'always' || (empty && (printableTags?.length > 0 || key))) {
        if (listElement) listElement.innerHTML = '';
    }

    if (addTag) {
        const addTags: Record<string, unknown>[] = Array.isArray(addTag) ? addTag : [addTag];
        printableTags = printableTags.concat(
            addTags.filter(
                (tag: Record<string, unknown>) =>
                    tagOptions.skipExistsCheck || !printableTags.some((t) => t.id === tag.id),
            ),
        );
    }

    // one last sort, because we might have modified the tag list or manually retrieved it from a function
    if (sort) printableTags = printableTags.toSorted(compareTagsForSort);

    const customAction:
        | ((tag: Record<string, unknown>) => ((...args: unknown[]) => unknown) | undefined)
        | null = typeof tagActionSelector === 'function' ? tagActionSelector : null;

    // Well, lets check if the tag list was expanded. Based on either a css class, or when any expand was clicked yet, then we search whether this element id matches
    const expanded =
        listElement?.classList.contains('tags-expanded') ||
        (expanded_tags_cache.length &&
            expanded_tags_cache.indexOf(key ?? getTagKeyForEntityElement(element) ?? '') >= 0);

    // We prepare some stuff. No matter which list we have, there is a maximum value of tags we are going to display
    // Constants to define tag printing limits
    const DEFAULT_TAGS_LIMIT = 50;
    const tagsDisplayLimit = expanded ? Number.MAX_SAFE_INTEGER : DEFAULT_TAGS_LIMIT;

    // Functions to determine tag properties
    const isFilterActive = (tag: Record<string, unknown>) =>
        tag.filter_state && !isFilterState(tag.filter_state as string, FILTER_STATES.UNDEFINED);
    const shouldPrintTag = (tag: Record<string, unknown>) =>
        isBogusFolder(tag) || isFilterActive(tag);

    // Calculating the number of tags to print
    const mandatoryPrintTagsCount = printableTags.filter(shouldPrintTag).length;
    const availableSlotsForAdditionalTags = Math.max(tagsDisplayLimit - mandatoryPrintTagsCount, 0);

    // Counters for printed and hidden tags
    let additionalTagsPrinted = 0;
    let tagsSkipped = 0;

    for (const tag of printableTags) {
        // If we have a custom action selector, we override that tag options for each tag
        if (customAction) {
            const action = customAction(tag);
            if (action && typeof action !== 'function') {
                console.error('The action parameter must return a function for tag.', tag);
            } else {
                tagOptions.action = action;
            }
        }

        // Check if we should print this tag
        if (shouldPrintTag(tag) || additionalTagsPrinted++ < availableSlotsForAdditionalTags) {
            // Check if this tag is in the inactive list
            const isInactive = inactiveTags.includes(tag.id as string);
            appendTagToList(listElement, tag, { ...tagOptions, isInactive });
        } else {
            tagsSkipped++;
        }
    }

    // After the loop, check if we need to add the placeholder.
    // The placehold if clicked expands the tags and remembers either via class or cache array which was expanded, so it'll stay expanded until the next reload.
    if (tagsSkipped > 0) {
        const id = 'placeholder_' + uuidv4();

        // Add click event
        const showHiddenTags = (_: unknown, event: Event) => {
            const elementKey = key ?? getTagKeyForEntityElement(listElement) ?? '';
            console.log(`Hidden tags shown for element ${elementKey}`);

            // Mark the current char/group as expanded if we were in any. This will be kept in memory until reload
            listElement?.classList.add('tags-expanded');
            expanded_tags_cache.push(elementKey);

            // Do not bubble further, we are just expanding
            event.stopPropagation();
            printTagList(listElement, {
                tags: tags as Record<string, unknown>[],
                addTag: addTag as Record<string, unknown> | Record<string, unknown>[] | undefined,
                forEntityOrKey: forEntityOrKey,
                empty: empty,
                tagActionSelector: tagActionSelector as
                    | ((
                          tag: Record<string, unknown>,
                      ) => ((...args: unknown[]) => unknown) | undefined)
                    | undefined,
                tagOptions: tagOptions,
                inactiveTags: inactiveTags,
            });
        };

        // Print the placeholder object with its styling and action to show the remaining tags
        /** @type {Tag} */
        const placeholderTag = {
            id: id,
            name: '...',
            title: `${tagsSkipped} tags not displayed.\n\nClick to expand remaining tags.`,
            color: 'transparent',
            action: showHiddenTags,
            class: 'placeholder-expander',
        };
        // It should never be marked as a removable tag, because it's just an expander action
        /** @type {TagOptions} */
        const placeholderTagOptions = { ...tagOptions, removable: false };
        appendTagToList(listElement, placeholderTag, placeholderTagOptions);
    }
}

/**
 * Appends a tag to the list element
 * @param {JQuery<HTMLElement>} listElement - List element
 * @param {Tag} tag - Tag object to append
 * @param {TagOptions} [options] - Options for tag behavior
 * @returns {void}
 */
function appendTagToList(
    listElement: HTMLElement | null,
    tag: Record<string, unknown>,
    {
        removable = false,
        isFilter = false,
        action = undefined,
        removeAction = undefined,
        isGeneralList = false,
        skipExistsCheck = false,
        isInactive = false,
    }: {
        removable?: boolean;
        isFilter?: boolean;
        action?: (...args: unknown[]) => unknown | undefined;
        removeAction?: ((tag: Record<string, unknown>) => boolean | undefined) | undefined;
        isGeneralList?: boolean;
        skipExistsCheck?: boolean;
        isInactive?: boolean;
    } = {},
) {
    if (!listElement) {
        return;
    }
    if (!skipExistsCheck && listElement.querySelector(`.tag[id="${tag.id as string}"]`)) {
        return;
    }

    const tagElement = TAG_TEMPLATE!.cloneNode(true) as HTMLElement;
    const tagEl = tagElement;
    tagElement.setAttribute('id', tag.id as string);

    //tagElement.style.color ('var(--SmartThemeBodyColor)');
    tagElement.style.backgroundColor = tag.color as string;
    tagElement.style.color = tag.color2 as string;

    const tagNameEl = tagEl?.querySelector('.tag_name');
    if (tagNameEl) tagNameEl.textContent = tag.name as string;
    const removeButton = tagEl?.querySelector('.tag_remove') as HTMLElement | null;
    if (removable) {
        if (removeButton) removeButton.style.display = '';
    } else {
        if (removeButton) removeButton.style.display = 'none';
    }
    if (removable && removeAction) {
        tagElement.setAttribute('custom-remove-action', String(true));
        removeButton?.addEventListener('click', () => {
            const result = removeAction!(tag);
            if (result !== false) tagElement.remove();
        });
    }

    if (tag.class) {
        tagElement.classList.add(tag.class as string);
    }
    if (tag.title) {
        tagElement.setAttribute('title', tag.title as string);
    }
    if (tag.icon) {
        if (tagNameEl) {
            tagNameEl.textContent = '';
            tagNameEl.setAttribute(
                'title',
                `${translate(tag.name as string)} ${(tag.title as string) || ''}`.trim(),
            );
            tagNameEl.classList.add(tag.icon as string);
        }
        tagElement.classList.add('actionable');
    }
    if (isInactive) {
        tagElement.classList.add('tag-absent');
    }

    // We could have multiple ways of actions passed in. The manual arguments have precendence in front of a specified tag action
    const clickableAction = action ?? (tag.action as ((...args: unknown[]) => unknown) | undefined);

    // If this is a tag for a general list and its either a filter or actionable, lets mark its current state
    if ((isFilter || clickableAction) && isGeneralList) {
        const filterHelper = getFilterHelper(listElement) as {
            getFilterData: (type: string) => string | { excluded: string[]; selected: string[] };
        };
        const isFilterActionable = !!(clickableAction && 'filter_state' in tag);

        if (isFilter || isFilterActionable) {
            const filterState = determineTagFilterState(filterHelper, tag, isFilterActionable);
            toggleTagThreeState(tagElement, { stateOverride: filterState });
        }
    }

    if (isFilter) {
        tagElement?.addEventListener('click', () => onTagFilterClick.call(tagElement, listElement));
        tagElement.classList.add(INTERACTABLE_CONTROL_CLASS);
    }

    if (clickableAction) {
        const filter = getFilterHelper(listElement);
        tagElement?.addEventListener('click', (e: Event) =>
            clickableAction.call(tagElement, filter, e),
        );
        tagElement.classList.add('clickable-action', INTERACTABLE_CONTROL_CLASS);
    }

    listElement?.appendChild(tagElement);
}

// ──────────────────────────────────────────────
// Tag management view rendering
// ──────────────────────────────────────────────

/**
 * Appends a tag to the management view list with color pickers and controls.
 * @param {JQuery<HTMLElement>} list - The list container element
 * @param {Tag} tag - The tag to append
 * @param {string} count - The count of characters/groups using this tag
 */
function appendViewTagToList(
    list: HTMLElement | null,
    tag: Record<string, unknown>,
    count: number,
) {
    const template = VIEW_TAG_TEMPLATE!.cloneNode(true) as HTMLElement;
    const templateEl = template;
    template.setAttribute('id', tag.id as string);
    const counterValue = templateEl?.querySelector('.tag_view_counter_value');
    if (counterValue) counterValue.textContent = String(count);
    const tagViewName = templateEl?.querySelector('.tag_view_name');
    if (tagViewName) {
        tagViewName.textContent = tag.name as string;
        tagViewName.classList.add('tag');
        (tagViewName as HTMLElement).style.backgroundColor = tag.color as string;
        (tagViewName as HTMLElement).style.color = tag.color2 as string;
    }

    const tagAsFolderId = tag.id + '-tag-folder';
    const colorPickerId = tag.id + '-tag-color';
    const colorPicker2Id = tag.id + '-tag-color2';

    if (!power_user.bogus_folders) {
        const tagAsFolder = templateEl?.querySelector('.tag_as_folder') as HTMLElement | null;
        if (tagAsFolder) tagAsFolder.style.display = 'none';
    }

    const primaryColorPicker = document.createElement('toolcool-color-picker');
    primaryColorPicker.classList.add('tag-color');
    primaryColorPicker.setAttribute('id', colorPickerId);
    primaryColorPicker.setAttribute('color', (tag.color as string) || 'rgba(0, 0, 0, 0.5)');
    primaryColorPicker.setAttribute('data-default-color', 'rgba(0, 0, 0, 0.5)');

    const secondaryColorPicker = document.createElement('toolcool-color-picker');
    secondaryColorPicker.classList.add('tag-color2');
    secondaryColorPicker.setAttribute('id', colorPicker2Id);
    secondaryColorPicker.setAttribute(
        'color',
        (tag.color2 as string) || power_user.main_text_color,
    );
    secondaryColorPicker.setAttribute('data-default-color', power_user.main_text_color);

    const colorPickerContainer1 = templateEl?.querySelector(
        '.tag_view_color_picker[data-value="color"]',
    );
    if (colorPickerContainer1) {
        colorPickerContainer1.appendChild(primaryColorPicker);
        const linkIcon1 = document.createElement('div');
        linkIcon1.className = 'fas fa-link fa-xs link_icon right_menu_button';
        linkIcon1.setAttribute('title', 'Link to theme color');
        colorPickerContainer1.appendChild(linkIcon1);
    }
    const colorPickerContainer2 = templateEl?.querySelector(
        '.tag_view_color_picker[data-value="color2"]',
    );
    if (colorPickerContainer2) {
        colorPickerContainer2.appendChild(secondaryColorPicker);
        const linkIcon2 = document.createElement('div');
        linkIcon2.className = 'fas fa-link fa-xs link_icon right_menu_button';
        linkIcon2.setAttribute('title', 'Link to theme color');
        colorPickerContainer2.appendChild(linkIcon2);
    }

    const tagAsFolderEl = templateEl?.querySelector('.tag_as_folder');
    tagAsFolderEl?.setAttribute('id', tagAsFolderId);

    primaryColorPicker.addEventListener('change', (evt: Event) =>
        onTagColorize(
            evt,
            (tag: Record<string, unknown>, color: string) => (tag.color = color),
            'background-color',
        ),
    );
    secondaryColorPicker.addEventListener('change', (evt: Event) =>
        onTagColorize(
            evt,
            (tag: Record<string, unknown>, color: string) => (tag.color2 = color),
            'color',
        ),
    );
    templateEl
        ?.querySelector('.tag_view_color_picker .link_icon')
        ?.addEventListener('click', (evt) => {
            const colorPickerEl = (evt.target as Element)
                .closest('.tag_view_color_picker')
                ?.querySelector('toolcool-color-picker');
            const defaultColor = colorPickerEl?.getAttribute('data-default-color');
            if (colorPickerEl)
                (colorPickerEl as unknown as Record<string, unknown>).color = defaultColor;
        });

    const getHideTooltip = () =>
        (tag.is_hidden_on_character_card as boolean)
            ? t`Hide on character card`
            : t`Show on character card`;
    const hideToggle = templateEl?.querySelector('.eye-toggle');
    if (hideToggle) {
        hideToggle.classList.toggle('fa-eye-slash', tag.is_hidden_on_character_card as boolean);
        hideToggle.classList.toggle('fa-eye', !(tag.is_hidden_on_character_card as boolean));
        hideToggle.setAttribute('title', getHideTooltip());
    }

    hideToggle?.addEventListener('click', () => {
        tag.is_hidden_on_character_card = !(tag.is_hidden_on_character_card as boolean);
        hideToggle?.classList.toggle('fa-eye-slash', tag.is_hidden_on_character_card as boolean);
        hideToggle?.classList.toggle('fa-eye', !(tag.is_hidden_on_character_card as boolean));
        hideToggle?.setAttribute('title', getHideTooltip());
        markDirty();
    });

    list?.appendChild(template);

    // We prevent the popup from auto-close on Escape press on the color pickups. If the user really wants to, he can hit it again
    // Not the "cleanest" way, that would be actually using and observer, remembering whether the popup was open just before, but eh
    // Not gonna invest too much time into this small control here
    let lastHit = 0;
    template?.addEventListener('keydown', (evt: KeyboardEvent) => {
        if (evt.key === 'Escape') {
            if (evt.target === primaryColorPicker || evt.target === secondaryColorPicker) {
                if (Date.now() - lastHit < 5000)
                    // If user hits it twice in five seconds
                    return;
                lastHit = Date.now();
                evt.stopPropagation();
                evt.preventDefault();
            }
        }
    });
}

/**
 * Prints the tag list in the management view.
 * @param {JQuery<HTMLElement>} tagContainer - Container element
 * @param {boolean} [empty] - Whether to empty the container before printing
 */
function printViewTagList(tagContainer: HTMLElement | null, empty = true) {
    if (!tagContainer) return;
    if (empty) tagContainer.innerHTML = '';
    const everything = Object.values(tag_map).flat();
    const counts = new Map<string, number>(
        (tags as Record<string, unknown>[]).map((tag: Record<string, unknown>) => [
            tag.id as string,
            (everything as string[]).filter((x: string) => x === tag.id).length,
        ]),
    );
    const sortedTags = sortTags(tags as Record<string, unknown>[], counts) as Record<
        string,
        unknown
    >[];
    for (const tag of sortedTags) {
        const count = counts.get(tag.id as string) || 0;
        appendViewTagToList(tagContainer, tag, count);
    }
}

// ──────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────

export {
    TAG_TEMPLATE,
    FOLDER_TEMPLATE,
    VIEW_TAG_TEMPLATE,
    printTagList,
    appendTagToList,
    printViewTagList,
    appendViewTagToList,
};
