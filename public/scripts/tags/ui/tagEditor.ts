/**
 * Tag editor — manages the tag management popup dialog.
 * Handles creating, deleting, renaming, colorizing, and folder-typing of tags.
 */

interface TomSelectOptions {
    maxItems?: number;
    placeholder?: string;
    allowEmptyOption?: boolean;
}

declare const TomSelect: new (el: Element | null, opts: TomSelectOptions) => void;

interface SortableOptions {
    delay?: number;
    onEnd?: () => void;
    handle?: string;
}

declare const Sortable: new (el: Element, opts: SortableOptions) => void;

import { tags as _rawTags, tag_map, createNewTag, getTagById, markDirty, getTagFromEvent, getFolderType } from '../store/tagStore.js';
import { TAG_FOLDER_TYPES } from '../types.js';
import { tag_sort_mode } from '../types.js';
import { appendTagToList } from './tagList.js';

import { power_user } from '../../power-user.js';
import { renderTemplateAsync } from '../../templates.js';
import { POPUP_RESULT, POPUP_TYPE, callGenericPopup } from '../../popup.js';
import { isMobile } from '../../RossAscends-mods.js';
import { getSortableDelay, flashHighlight, debounce, getFreeName } from '../../utils.js';
import { t } from '../../i18n.js';
import { debounce_timeout } from '../../constants.js';
import { applyCharacterTagsToMessageDivs } from '../messageTags.js';
import { sortTags } from '../utils/sorting.js';

// tags is exported as `let tags = []` (never[]) from the store.
// Cast once so all downstream usage is untyped.
interface Tag {
    id: string;
    name: string;
    color?: string;
    color2?: string;
    sort_order?: number;
    is_hidden_on_character_card?: boolean;
    folder_type?: string;
    [key: string]: unknown;
}

const tags: Tag[] = _rawTags as Tag[];

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const VIEW_TAG_TEMPLATE = document.querySelector('#tag_view_template .tag_view_item');

// ──────────────────────────────────────────────
// Local helpers (not exported)
// ──────────────────────────────────────────────

/**
 * Appends a single tag to the view tag list inside the management popup.
 * @param {Element | null} list - The container list element
 * @param {object} tag - The tag object
 * @param {number} count - How many characters/groups use this tag
 */
function appendViewTagToList(list: Element | null, tag: Tag, count: number): void {
    if (!VIEW_TAG_TEMPLATE || !list) return;
    const template = VIEW_TAG_TEMPLATE.cloneNode(true) as HTMLElement;
    template.setAttribute('id', tag.id);

    const counterValue = template.querySelector('.tag_view_counter_value');
    if (counterValue) counterValue.textContent = String(count);

    const tagViewName = template.querySelector('.tag_view_name') as HTMLElement | null;
    if (tagViewName) {
        tagViewName.textContent = tag.name;
        tagViewName.classList.add('tag');
        tagViewName.style.backgroundColor = tag.color ?? 'rgba(0, 0, 0, 0.5)';
        tagViewName.style.color = tag.color2 ?? '';
    }

    const tagAsFolderId = tag.id + '-tag-folder';
    const colorPickerId = tag.id + '-tag-color';
    const colorPicker2Id = tag.id + '-tag-color2';

    if (!power_user.bogus_folders) {
        const tagAsFolder = template.querySelector('.tag_as_folder') as HTMLElement | null;
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

    const colorPickerContainer1 = template.querySelector('.tag_view_color_picker[data-value="color"]');
    if (colorPickerContainer1) {
        colorPickerContainer1.appendChild(primaryColorPicker);
        const linkIcon1 = document.createElement('div');
        linkIcon1.className = 'fas fa-link fa-xs link_icon right_menu_button';
        linkIcon1.setAttribute('title', 'Link to theme color');
        colorPickerContainer1.appendChild(linkIcon1);
    }

    const colorPickerContainer2 = template.querySelector('.tag_view_color_picker[data-value="color2"]');
    if (colorPickerContainer2) {
        colorPickerContainer2.appendChild(secondaryColorPicker);
        const linkIcon2 = document.createElement('div');
        linkIcon2.className = 'fas fa-link fa-xs link_icon right_menu_button';
        linkIcon2.setAttribute('title', 'Link to theme color');
        colorPickerContainer2.appendChild(linkIcon2);
    }

    const tagAsFolderEl = template.querySelector('.tag_as_folder');
    tagAsFolderEl?.setAttribute('id', tagAsFolderId);

    primaryColorPicker.addEventListener('change', (evt: Event) => onTagColorize(evt as CustomEvent, (tag: Tag, color: string) => tag.color = color, 'background-color'));
    secondaryColorPicker.addEventListener('change', (evt: Event) => onTagColorize(evt as CustomEvent, (tag: Tag, color: string) => tag.color2 = color, 'color'));
    template.querySelector('.tag_view_color_picker .link_icon')?.addEventListener('click', (evt: Event) => {
        const target = evt.target as HTMLElement;
        const colorPickerEl = target.closest('.tag_view_color_picker')?.querySelector('toolcool-color-picker') as (HTMLElement & { color: string }) | null;
        const defaultColor = colorPickerEl?.getAttribute('data-default-color') ?? '';
        if (colorPickerEl) colorPickerEl.color = defaultColor;
    });

    const getHideTooltip = () => tag.is_hidden_on_character_card ? t`Hide on character card` : t`Show on character card`;
    const hideToggle = template.querySelector('.eye-toggle') as HTMLElement | null;
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

    list.appendChild(template);

    // Prevent the popup from auto-close on Escape press on the color pickers.
    let lastHit = 0;
    template.addEventListener('keydown', (evt: KeyboardEvent) => {
        if (evt.key === 'Escape') {
            if (evt.target === primaryColorPicker || evt.target === secondaryColorPicker) {
                if (Date.now() - lastHit < 5000) return;
                lastHit = Date.now();
                evt.stopPropagation();
                evt.preventDefault();
            }
        }
    });

    updateDrawTagFolder(template, tag);
}

/**
 * Prints the full tag list in the tag management popup.
 * @param {Element | null} tagContainer - Container element to print into
 * @param {boolean} empty - Whether to clear the container before printing
 */
function printViewTagList(tagContainer: Element | null, empty = true): void {
    if (!tagContainer) return;
    if (empty) tagContainer.innerHTML = '';

    const everything = Object.values(tag_map).flat() as string[];
    const counts = new Map<string, number>(tags.map((tag: Tag) => [tag.id, everything.filter((x: string) => x === tag.id).length]));
    const sortedTags = sortTags(tags as Record<string, unknown>[], counts);
    for (const tag of sortedTags) {
        const count = counts.get(tag.id as string) || 0;
        appendViewTagToList(tagContainer, tag as Tag, count);
    }
}

// ──────────────────────────────────────────────
// Exported functions
// ──────────────────────────────────────────────

/**
 * Opens the tag management popup dialog.
 * Shows all tags with controls for sorting, creating, deleting, renaming,
 * colorizing, and toggling folder types.
 */
export async function onViewTagsListClick(): Promise<void> {
    const html = document.createElement('div');
    html.setAttribute('id', 'tag_view_list');
    html.innerHTML = await renderTemplateAsync('tagManagement', { bogus_folders: power_user.bogus_folders });

    const tagContainer = document.createElement('div');
    tagContainer.className = 'tag_view_list_tags ui-sortable';
    html.appendChild(tagContainer);

    const sortModeSelect = html.querySelector('#tag_sort_mode_select');
    if (sortModeSelect instanceof HTMLSelectElement) {
        sortModeSelect.value = power_user.tag_sort_mode;
    }
    html.querySelector('#tag_sort_mode_select')?.addEventListener('change', function (this: HTMLSelectElement) {
        const newMode = this.value;
        power_user.tag_sort_mode = newMode;
        markDirty();
        printViewTagList(tagContainer);
    });

    printViewTagList(tagContainer);
    makeTagListDraggable(tagContainer);

    await callGenericPopup(html, POPUP_TYPE.TEXT, undefined, { allowVerticalScrolling: true, wide: true, large: true });
}

/**
 * Makes the tag list drag-sortable using Sortable.
 * When tags are reordered, updates their sort_order and switches to manual sort mode.
 * @param {Element} tagContainer - The container element holding tag view items
 */
export function makeTagListDraggable(tagContainer: Element): void {
    const onTagsSort = () => {
        tagContainer?.querySelectorAll('.tag_view_item').forEach(function (tagElement: Element, i: number) {
            const id = tagElement.getAttribute('id');
            const tag = getTagById(id!) as Tag;
            if (tag) tag.sort_order = i;
        });

        // If tags were dragged manually, disable auto sorting
        if (power_user.tag_sort_mode !== tag_sort_mode.MANUAL) {
            power_user.tag_sort_mode = tag_sort_mode.MANUAL;
            const sortModeSelect = document.getElementById('tag_sort_mode_select');
            if (sortModeSelect instanceof HTMLSelectElement) {
                sortModeSelect.value = tag_sort_mode.MANUAL;
            }
            notyf.info('Switched to Manual sorting mode.');
        }

        // Redraw some UI elements debounced so it doesn't block dragging
        markDirty();
    };

    const tagContainerEl = tagContainer as Element & { sortableInstance?: unknown };
    new Sortable(tagContainerEl, {
        delay: getSortableDelay(),
        onEnd: () => onTagsSort(),
        handle: '.drag-handle',
    });
}

/**
 * Handles tag deletion with an option to merge into another tag.
 * Shows a popup to confirm deletion and optionally select a merge target.
 * Uses `this` context — intended to be called as an event handler or via .call().
 */
export async function onTagDeleteClick(this: HTMLElement): Promise<void> {
    const tagResult = getTagFromEvent(this);
    const tag = tagResult?.tag;
    const id = tagResult?.id;
    const otherTags = sortTags(tags.filter((x: Tag) => x.id !== id).map((x: Tag) => ({ id: x.id, name: x.name })) as Record<string, unknown>[]);

    const popupContent = document.createElement('div');
    popupContent.innerHTML = await renderTemplateAsync('deleteTag', { otherTags });

    const tagToDeleteEl = popupContent.querySelector('#tag_to_delete') as HTMLElement | null;
    if (tagToDeleteEl) {
        appendTagToList(tagToDeleteEl, tag as Tag);
    }

    // Make the select control more fancy on non-mobile
    if (!isMobile()) {
        popupContent.querySelector('#merge_tag_select option[value=""]')?.remove();
        new TomSelect(popupContent?.querySelector('#merge_tag_select'), {
            maxItems: 1,
            placeholder: 'Select tag to merge into',
            allowEmptyOption: true,
        });
    }

    const result = await callGenericPopup(popupContent, POPUP_TYPE.CONFIRM);
    if (result !== POPUP_RESULT.AFFIRMATIVE) {
        return;
    }

    const mergeTagSelect = popupContent.querySelector('#merge_tag_select') as HTMLSelectElement | null;
    const mergeTagId = mergeTagSelect?.value ? String(mergeTagSelect.value) : null;

    // Remove the tag from all entities that use it.
    // If we have a replacement tag, add that one instead.
    const typedTagMap = tag_map as Record<string, string[] | undefined>;
    for (const key of Object.keys(tag_map)) {
        if (typedTagMap[key]?.includes(id as string)) {
            typedTagMap[key] = typedTagMap[key]!.filter((x: string) => x !== id);
            if (mergeTagId) typedTagMap[key]!.push(mergeTagId);
        }
    }

    const index = tags.indexOf(getTagById(id!) as Tag);
    tags.splice(index, 1);
    document.querySelectorAll(`.tag[id="${id}"]`).forEach(el => el.remove());
    document.querySelectorAll(`.tag_view_item[id="${id}"]`).forEach(el => el.remove());

    notyf.success(`'${tag?.name}' deleted${mergeTagId ? ` and merged into '${(getTagById(mergeTagId) as Tag)?.name}'` : ''}`, 'Delete Tag');

    markDirty();

    applyCharacterTagsToMessageDivs();
}

/**
 * Creates a new tag with an auto-generated unique name.
 * Scrolls to and highlights the newly created tag in the management popup.
 */
export function onTagCreateClick(): void {
    const tagName = getFreeName('New Tag', tags.map((x: Tag) => x.name));
    const tag = createNewTag(tagName);
    printViewTagList(document.querySelector('#tag_view_list .tag_view_list_tags'));

    const tagContainer = document.querySelector('#tag_view_list .tag_view_list_tags');
    const tagElement = tagContainer?.querySelector(`.tag_view_item[id="${tag.id}"]`);
    tagElement?.scrollIntoView();
    flashHighlight(tagElement);

    markDirty();

    notyf.success('Tag created', 'Create Tag');
}

/**
 * Cycles through folder types (NONE → OPEN → CLOSED → NONE) for a tag.
 * Uses `this` context — intended to be called as an event handler or via .call().
 */
export function onTagAsFolderClick(this: HTMLElement): void {
    const result = getTagFromEvent(this);
    const tag = result?.tag;
    const element = this.closest('.tag_view_item');

    // Cycle through folder types
    const types = Object.keys(TAG_FOLDER_TYPES);
    const currentTypeIndex = types.indexOf(String(tag?.folder_type ?? ''));
    if (tag) tag.folder_type = types[(currentTypeIndex + 1) % types.length];

    if (tag) updateDrawTagFolder(element, tag as Tag);

    // If folder display has changed, redraw the character list
    markDirty();
}

/**
 * Updates the visual folder type indicator on a tag view element.
 * Sets the appropriate CSS class, tooltip, icon, and color for the folder type.
 * @param {Element | null} element - The tag view item element
 * @param {object} tag - The tag object with folder_type
 */
export function updateDrawTagFolder(element: Element | null, tag: Tag): void {
    const tagFolder = getFolderType(tag)!;
    const folderElement = element?.querySelector('.tag_as_folder');

    // Update css class and remove all others
    Object.keys(TAG_FOLDER_TYPES).forEach(x => {
        const folderTypes = TAG_FOLDER_TYPES as Record<string, { class: string; icon: string; tooltip?: string; color?: string; size?: string }>;
        folderElement?.classList.toggle(folderTypes[x]?.class ?? '', folderTypes[x] === tagFolder);
    });

    // Draw/update css attributes for this class
    folderElement?.setAttribute('title', tagFolder.tooltip ?? '');
    folderElement?.setAttribute('data-i18n', '[title]' + (tagFolder.tooltip ?? ''));
    const indicator = folderElement?.querySelector('.tag_folder_indicator') as HTMLElement | null;
    if (indicator) indicator.textContent = tagFolder.icon;
    if (indicator) indicator.style.color = tagFolder.color ?? '';
    if (indicator) indicator.style.fontSize = `calc(var(--mainFontSize) * ${tagFolder.size ?? '1'})`;
}

/**
 * Handles tag rename from an inline contenteditable input.
 * Updates the tag name in the data store and all DOM references.
 * Uses `this` context — intended to be called as an event handler or via .call().
 */
export function onTagRenameInput(this: HTMLElement): void {
    const result = getTagFromEvent(this);
    const tag = result?.tag;
    const id = result?.id;
    const newName = this.textContent;
    if (tag) tag.name = newName;
    this.setAttribute('dirty', '');
    document.querySelectorAll(`.tag[id="${id}"] .tag_name`).forEach(el => el.textContent = newName);
    markDirty();

    applyCharacterTagsToMessageDivs();
}

/**
 * Handles color picker changes for a tag's primary or secondary color.
 * Updates the tag's color property and the preview in the management popup.
 * @param {Event} evt - The custom colorize event object (from toolcool-color-picker)
 * @param {(tag: Tag, color: string) => void} setColor - A function that sets the color on the tag object
 * @param {string} cssProperty - The CSS property to apply the color to ('background-color' or 'color')
 */
export function onTagColorize(evt: Event, setColor: (tag: Tag, color: string) => void, cssProperty: string): void {
    const target = evt.target as HTMLElement;
    const detail = (evt as CustomEvent).detail as Record<string, string>;
    const isDefaultColor = target.dataset?.defaultColor === detail.rgba;
    const colorPickerEl = target.closest('.tag_view_color_picker');
    const linkIcon = colorPickerEl?.querySelector('.link_icon') as HTMLElement | null;
    if (linkIcon) linkIcon.style.display = isDefaultColor ? 'none' : '';

    const tagViewItem = target.closest('.tag_view_item');
    const result = getTagFromEvent(target);
    const tag = result?.tag;
    let newColor = detail.rgba;
    if (isDefaultColor) newColor = '';

    const tagViewName = tagViewItem?.querySelector('.tag_view_name') as HTMLElement | null;
    if (tagViewName) tagViewName.style.setProperty(cssProperty, newColor ?? null);
    if (tag) setColor(tag as Tag, newColor ?? '');
    markDirty();

    // Debounce redrawing color of the tag in other elements
    if (tag) debouncedTagColoring(tag.id as string, cssProperty, newColor);
}

/**
 * Debounced function that updates tag color across all DOM elements
 * that reference this tag (inline tags, bogus folder selectors).
 */
export const debouncedTagColoring = debounce((tagId: string, cssProperty: string, newColor: string) => {
    document.querySelectorAll(`.tag[id="${tagId}"]`).forEach(el => (el as HTMLElement).style.setProperty(cssProperty, newColor));
    document.querySelectorAll(`.bogus_folder_select[tagid="${tagId}"] .avatar`).forEach(el => (el as HTMLElement).style.setProperty(cssProperty, newColor));
}, debounce_timeout.quick);
