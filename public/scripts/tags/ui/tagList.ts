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
    newTag,
    getTagById,
    resolveElement,
    markDirty,
} from '../store/tagStore.js';
import { isBogusFolder } from '../folders/bogusFolders.js';
import { getFilterHelper, isMainCharacterList, getFilterStorageKey } from '../filters/filterContext.js';
import { determineTagFilterState, toggleTagThreeState } from '../filters/filterState.js';
import { FILTER_TYPES, FILTER_STATES, DEFAULT_FILTER_STATE, isFilterState } from '../../filters.js';
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

const TAG_TEMPLATE = document.querySelector('#tag_template .tag');
const FOLDER_TEMPLATE = document.querySelector('#bogus_folder_template .bogus_folder_select');
const VIEW_TAG_TEMPLATE = document.querySelector('#tag_view_template .tag_view_item');

/**
 * A cache of all cut-off tag lists that got expanded until the last reload. They will be printed expanded again.
 * It contains the key of the entity.
 * @type {string[]} ids
 */
// @ts-expect-error TS(7034) FIXME: Variable 'expanded_tags_cache' implicitly has type... Remove this comment to see the full error message
const expanded_tags_cache = [];

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

/**
 * Runs tag filters for a given list element.
 * @param {JQuery<HTMLElement>|string} listElement - The list element or selector
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'listElement' implicitly has an 'any' ty... Remove this comment to see the full error message
function runTagFilters(listElement) {
    const $listEl = resolveElement(listElement);
    const tagIds = Array.from($listEl?.querySelectorAll('.tag.selected:not(.actionable)') ?? [], el => el.getAttribute('id'));
    const excludedTagIds = Array.from($listEl?.querySelectorAll('.tag.excluded:not(.actionable)') ?? [], el => el.getAttribute('id'));
    const filterHelper = getFilterHelper(listElement);
    filterHelper.setFilterData(FILTER_TYPES.TAG, { excluded: excludedTagIds, selected: tagIds });
}

/**
 * Handles the click event on a tag filter.
 * Toggles the three-state filter and persists the selection.
 * @this {HTMLElement} The tag element that was clicked
 * @param {JQuery<HTMLElement>|string} listElement - The list element containing this tag
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'listElement' implicitly has an 'any' ty... Remove this comment to see the full error message
function onTagFilterClick(listElement) {
    const tagId = this?.getAttribute('id');
    const existingTag = getTagById(tagId);
    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
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
    setTimeout(() => parent?.querySelector(`.tag[id="${tagId}"]`)?.focus(), DEFAULT_PRINT_TIMEOUT + 1);
}

// @ts-expect-error TS(7006) FIXME: Parameter 'tagId' implicitly has an 'any' type.
const debouncedTagColoring = debounce((tagId, cssProperty, newColor) => {
    document.querySelectorAll(`.tag[id="${tagId}"]`).forEach(el => el.style.setProperty(cssProperty, newColor));
    document.querySelectorAll(`.bogus_folder_select[tagid="${tagId}"] .avatar`).forEach(el => el.style.setProperty(cssProperty, newColor));
}, debounce_timeout.quick);

/**
 * Handles the colorize event for a tag in the view tags popup.
 * @param {Event} evt - The change event from the color picker
 * @param {function(Tag, string): void} setColor - Function to set the color on the tag
 * @param {string} cssProperty - The CSS property to update ('background-color' or 'color')
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'evt' implicitly has an 'any' type.
function onTagColorize(evt, setColor, cssProperty) {
    const isDefaultColor = evt.target.dataset?.defaultColor === evt.detail.rgba;
    const colorPickerEl = evt.target.closest('.tag_view_color_picker');
    const linkIcon = colorPickerEl?.querySelector('.link_icon');
    if (linkIcon) linkIcon.style.display = isDefaultColor ? 'none' : '';

    const tagViewItem = evt.target.closest('.tag_view_item');
    const id = tagViewItem?.getAttribute('id');
    let newColor = evt.detail.rgba;
    if (isDefaultColor) newColor = '';

    const tagViewName = tagViewItem?.querySelector('.tag_view_name');
    if (tagViewName) tagViewName.style.setProperty(cssProperty, newColor);
    const tag = getTagById(id);
    setColor(tag, newColor);
    markDirty();

    // Debounce redrawing color of the tag in other elements
    debouncedTagColoring(tag.id, cssProperty, newColor);
}

// ──────────────────────────────────────────────
// Tag list rendering
// ──────────────────────────────────────────────

/**
 * Prints the list of tags
 * @param {JQuery<HTMLElement>|string} element - The container element where the tags are to be printed. (Optionally can also be a string selector for the element, which will then be resolved)
 * @param {PrintTagListOptions} [options] - Optional parameters for printing the tag list.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'element' implicitly has an 'any' type.
function printTagList(element, { tags = undefined, addTag = undefined, forEntityOrKey = undefined, empty = true, sort = true, tagActionSelector = undefined, tagOptions = {}, inactiveTags = [] } = {}) {
    const listElement = resolveElement(element);
    const key = forEntityOrKey !== undefined ? getTagKeyForEntity(forEntityOrKey) : getTagKey();
    // @ts-expect-error TS(2349) FIXME: This expression is not callable.
    let printableTags = tags ? (typeof tags === 'function' ? tags() : tags) : getTagsList(key, sort);

    // @ts-expect-error TS(2339) FIXME: Property 'isCharacterList' does not exist on type ... Remove this comment to see the full error message
    if (tagOptions.isCharacterList) {
        // @ts-expect-error TS(7006) FIXME: Parameter 'tag' implicitly has an 'any' type.
        printableTags = printableTags.filter(tag => !tag.is_hidden_on_character_card);
    }

    // @ts-expect-error TS(2367) FIXME: This condition will always return 'false' since th... Remove this comment to see the full error message
    if (empty === 'always' || (empty && (printableTags?.length > 0 || key))) {
        if (listElement) listElement.innerHTML = '';
    }

    if (addTag) {
        const addTags = Array.isArray(addTag) ? addTag : [addTag];
        // @ts-expect-error TS(2339) FIXME: Property 'skipExistsCheck' does not exist on type ... Remove this comment to see the full error message
        printableTags = printableTags.concat(addTags.filter(tag => tagOptions.skipExistsCheck || !printableTags.some(t => t.id === tag.id)));
    }

    // one last sort, because we might have modified the tag list or manually retrieved it from a function
    if (sort) printableTags = printableTags.sort(compareTagsForSort);

    const customAction = typeof tagActionSelector === 'function' ? tagActionSelector : null;

    // Well, lets check if the tag list was expanded. Based on either a css class, or when any expand was clicked yet, then we search whether this element id matches
    // @ts-expect-error TS(7005) FIXME: Variable 'expanded_tags_cache' implicitly has an '... Remove this comment to see the full error message
    const expanded = listElement?.classList.contains('tags-expanded') || (expanded_tags_cache.length && expanded_tags_cache.indexOf(key ?? getTagKeyForEntityElement(element)) >= 0);

    // We prepare some stuff. No matter which list we have, there is a maximum value of tags we are going to display
    // Constants to define tag printing limits
    const DEFAULT_TAGS_LIMIT = 50;
    const tagsDisplayLimit = expanded ? Number.MAX_SAFE_INTEGER : DEFAULT_TAGS_LIMIT;

    // Functions to determine tag properties
    // @ts-expect-error TS(7006) FIXME: Parameter 'tag' implicitly has an 'any' type.
    const isFilterActive = (/** @type {Tag} */ tag) => tag.filter_state && !isFilterState(tag.filter_state, FILTER_STATES.UNDEFINED);
    // @ts-expect-error TS(7006) FIXME: Parameter 'tag' implicitly has an 'any' type.
    const shouldPrintTag = (/** @type {Tag} */ tag) => isBogusFolder(tag) || isFilterActive(tag);

    // Calculating the number of tags to print
    const mandatoryPrintTagsCount = printableTags.filter(shouldPrintTag).length;
    const availableSlotsForAdditionalTags = Math.max(tagsDisplayLimit - mandatoryPrintTagsCount, 0);

    // Counters for printed and hidden tags
    let additionalTagsPrinted = 0;
    let tagsSkipped = 0;

    for (const tag of printableTags) {
        // If we have a custom action selector, we override that tag options for each tag
        if (customAction) {
            // @ts-expect-error TS(2349) FIXME: This expression is not callable.
            const action = customAction(tag);
            if (action && typeof action !== 'function') {
                console.error('The action parameter must return a function for tag.', tag);
            } else {
                // @ts-expect-error TS(2339) FIXME: Property 'action' does not exist on type '{}'.
                tagOptions.action = action;
            }
        }

        // Check if we should print this tag
        if (shouldPrintTag(tag) || additionalTagsPrinted++ < availableSlotsForAdditionalTags) {
            // Check if this tag is in the inactive list
            // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
            const isInactive = inactiveTags.includes(tag.id);
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
        // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
        const showHiddenTags = (_, event) => {
            const elementKey = key ?? getTagKeyForEntityElement(listElement);
            console.log(`Hidden tags shown for element ${elementKey}`);

            // Mark the current char/group as expanded if we were in any. This will be kept in memory until reload
            listElement?.classList.add('tags-expanded');
            expanded_tags_cache.push(elementKey);

            // Do not bubble further, we are just expanding
            event.stopPropagation();
            printTagList(listElement, { tags: tags, addTag: addTag, forEntityOrKey: forEntityOrKey, empty: empty, tagActionSelector: tagActionSelector, tagOptions: tagOptions, inactiveTags: inactiveTags });
        };

        // Print the placeholder object with its styling and action to show the remaining tags
        /** @type {Tag} */
        const placeholderTag = { id: id, name: '...', title: `${tagsSkipped} tags not displayed.\n\nClick to expand remaining tags.`, color: 'transparent', action: showHiddenTags, class: 'placeholder-expander' };
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
// @ts-expect-error TS(7006) FIXME: Parameter 'listElement' implicitly has an 'any' ty... Remove this comment to see the full error message
function appendTagToList(listElement, tag, { removable = false, isFilter = false, action = undefined, removeAction = undefined, isGeneralList = false, skipExistsCheck = false, isInactive = false } = {}) {
    if (!listElement) {
        return;
    }
    if (!skipExistsCheck && listElement.querySelector(`.tag[id="${tag.id}"]`)) {
        return;
    }

    const tagElement = TAG_TEMPLATE.cloneNode(true);
    const tagEl = tagElement;
    tagElement.setAttribute('id', tag.id);

    //tagElement.style.color ('var(--SmartThemeBodyColor)');
    tagElement.style.backgroundColor = tag.color;
    tagElement.style.color = tag.color2;

    const tagNameEl = tagEl?.querySelector('.tag_name');
    if (tagNameEl) tagNameEl.textContent = tag.name;
    const removeButton = tagEl?.querySelector('.tag_remove') as HTMLElement | null;
    if (removable) { if (removeButton) removeButton.style.display = ''; } else { if (removeButton) removeButton.style.display = 'none'; }
    if (removable && removeAction) {
        tagElement.setAttribute('custom-remove-action', String(true));
        removeButton?.addEventListener('click', () => {
            // @ts-expect-error TS(2349) FIXME: This expression is not callable.
            const result = removeAction(tag);
            if (result !== false) tagElement.remove();
        });
    }

    if (tag.class) {
        tagElement.classList.add(tag.class);
    }
    if (tag.title) {
        tagElement.setAttribute('title', tag.title);
    }
    if (tag.icon) {
        if (tagNameEl) {
            tagNameEl.textContent = '';
            tagNameEl.setAttribute('title', `${translate(tag.name)} ${tag.title || ''}`.trim());
            tagNameEl.classList.add(tag.icon);
        }
        tagElement.classList.add('actionable');
    }
    if (isInactive) {
        tagElement.classList.add('tag-absent');
    }

    // We could have multiple ways of actions passed in. The manual arguments have precendence in front of a specified tag action
    const clickableAction = action ?? tag.action;

    // If this is a tag for a general list and its either a filter or actionable, lets mark its current state
    if ((isFilter || clickableAction) && isGeneralList) {
        const filterHelper = getFilterHelper(listElement);
        const isFilterActionable = clickableAction && 'filter_state' in tag;

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
        // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
        tagElement?.addEventListener('click', (e) => clickableAction.call(tagElement, filter, e));
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
// @ts-expect-error TS(7006) FIXME: Parameter 'list' implicitly has an 'any' type.
function appendViewTagToList(list, tag, count) {
    const template = VIEW_TAG_TEMPLATE.cloneNode(true);
    const templateEl = template;
    template.setAttribute('id', tag.id);
    const counterValue = templateEl?.querySelector('.tag_view_counter_value');
    if (counterValue) counterValue.textContent = count;
    const tagViewName = templateEl?.querySelector('.tag_view_name');
    if (tagViewName) {
        tagViewName.textContent = tag.name;
        tagViewName.classList.add('tag');
        tagViewName.style.backgroundColor = tag.color;
        tagViewName.style.color = tag.color2;
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
    primaryColorPicker.setAttribute('color', tag.color || 'rgba(0, 0, 0, 0.5)');
    primaryColorPicker.setAttribute('data-default-color', 'rgba(0, 0, 0, 0.5)');

    const secondaryColorPicker = document.createElement('toolcool-color-picker');
    secondaryColorPicker.classList.add('tag-color2');
    secondaryColorPicker.setAttribute('id', colorPicker2Id);
    secondaryColorPicker.setAttribute('color', tag.color2 || power_user.main_text_color);
    secondaryColorPicker.setAttribute('data-default-color', power_user.main_text_color);

    const colorPickerContainer1 = templateEl?.querySelector('.tag_view_color_picker[data-value="color"]');
    if (colorPickerContainer1) {
        colorPickerContainer1.appendChild(primaryColorPicker);
        const linkIcon1 = document.createElement('div');
        linkIcon1.className = 'fas fa-link fa-xs link_icon right_menu_button';
        linkIcon1.setAttribute('title', 'Link to theme color');
        colorPickerContainer1.appendChild(linkIcon1);
    }
    const colorPickerContainer2 = templateEl?.querySelector('.tag_view_color_picker[data-value="color2"]');
    if (colorPickerContainer2) {
        colorPickerContainer2.appendChild(secondaryColorPicker);
        const linkIcon2 = document.createElement('div');
        linkIcon2.className = 'fas fa-link fa-xs link_icon right_menu_button';
        linkIcon2.setAttribute('title', 'Link to theme color');
        colorPickerContainer2.appendChild(linkIcon2);
    }

    const tagAsFolderEl = templateEl?.querySelector('.tag_as_folder');
    tagAsFolderEl?.setAttribute('id', tagAsFolderId);

    // @ts-expect-error TS(7006) FIXME: Parameter 'evt' implicitly has an 'any' type.
    primaryColorPicker.addEventListener('change', (evt) => onTagColorize(evt, (tag, color) => tag.color = color, 'background-color'));
    // @ts-expect-error TS(7006) FIXME: Parameter 'evt' implicitly has an 'any' type.
    secondaryColorPicker.addEventListener('change', (evt) => onTagColorize(evt, (tag, color) => tag.color2 = color, 'color'));
    templateEl?.querySelector('.tag_view_color_picker .link_icon')?.addEventListener('click', (evt) => {
        const colorPickerEl = evt.target.closest('.tag_view_color_picker')?.querySelector('toolcool-color-picker');
        const defaultColor = colorPickerEl?.getAttribute('data-default-color');
        if (colorPickerEl) colorPickerEl.color = defaultColor;
    });

    const getHideTooltip = () => tag.is_hidden_on_character_card ? t`Hide on character card` : t`Show on character card`;
    const hideToggle = templateEl?.querySelector('.eye-toggle');
    if (hideToggle) {
        hideToggle.classList.toggle('fa-eye-slash', tag.is_hidden_on_character_card);
        hideToggle.classList.toggle('fa-eye', !tag.is_hidden_on_character_card);
        hideToggle.setAttribute('title', getHideTooltip());
    }

    hideToggle?.addEventListener('click', () => {
        tag.is_hidden_on_character_card = !tag.is_hidden_on_character_card;
        hideToggle?.classList.toggle('fa-eye-slash', tag.is_hidden_on_character_card);
        hideToggle?.classList.toggle('fa-eye', !tag.is_hidden_on_character_card);
        hideToggle?.setAttribute('title', getHideTooltip());
        markDirty();
    });

    list?.appendChild(template);

    // We prevent the popup from auto-close on Escape press on the color pickups. If the user really wants to, he can hit it again
    // Not the "cleanest" way, that would be actually using and observer, remembering whether the popup was open just before, but eh
    // Not gonna invest too much time into this small control here
    let lastHit = 0;
    // @ts-expect-error TS(7006) FIXME: Parameter 'evt' implicitly has an 'any' type.
    template?.addEventListener('keydown', (evt) => {
        if (evt.key === 'Escape') {
            if (evt.target === primaryColorPicker || evt.target === secondaryColorPicker) {
                if (Date.now() - lastHit < 5000) // If user hits it twice in five seconds
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
 * @param {boolean} [empty=true] - Whether to empty the container before printing
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'tagContainer' implicitly has an 'any' t... Remove this comment to see the full error message
function printViewTagList(tagContainer, empty = true) {
    if (empty) tagContainer.innerHTML = '';
    const everything = Object.values(tag_map).flat();
    // @ts-expect-error TS(7005) FIXME: Variable 'tags' implicitly has an 'any[]' type.
    const counts = new Map(tags.map(tag => [tag.id, everything.filter(x => x === tag.id).length]));
    // @ts-expect-error TS(7005) FIXME: Variable 'tags' implicitly has an 'any[]' type.
    const sortedTags = sortTags(tags, counts);
    for (const tag of sortedTags) {
        const count = counts.get(tag.id) || 0;
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
