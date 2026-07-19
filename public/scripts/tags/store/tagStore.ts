/**
 * Tag store — manages tags[], tag_map{}, and all CRUD operations.
 * Pure data management. No UI code.
 */

import {
    characters,
    saveSettings,
    this_chid,
    menu_type,
} from '../../../script.js';
import { groups, selected_group } from '../../group-chats.js';
import { onlyUnique, uuidv4, equalsIgnoreCaseAndAccents, escapeHtml } from '../../utils.js';
import { TAG_FOLDER_TYPES, TAG_FOLDER_DEFAULT_TYPE } from '../types.js';
import { FILTER_STATES } from '../../filters.js';
import { compareTagsForSort } from '../utils/sorting.js';

const DEFAULT_FILTER_STATE = FILTER_STATES.UNDEFINED.key;

// ──────────────────────────────────────────────
// State
// ──────────────────────────────────────────────

/** @type {Tag[]} A list of default tags */
const DEFAULT_TAGS = [
    { id: uuidv4(), name: 'Plain Text', create_date: Date.now() },
    { id: uuidv4(), name: 'OpenAI', create_date: Date.now() },
    { id: uuidv4(), name: 'W++', create_date: Date.now() },
    { id: uuidv4(), name: 'Boostyle', create_date: Date.now() },
    { id: uuidv4(), name: 'PList', create_date: Date.now() },
    { id: uuidv4(), name: 'AliChat', create_date: Date.now() },
];

/**
 * An list of all tags that are available
 * @type {Tag[]}
 */
// @ts-expect-error TS(7034) FIXME: Variable 'tags' implicitly has type 'any[]' in som...
export let tags = [];

/**
 * A map representing the key of an entity with a corresponding array of tags.
 * @type {{[identifier: string]: string[]?}}
 */
export let tag_map = {};

// ──────────────────────────────────────────────
// Load / Save
// ──────────────────────────────────────────────

// @ts-expect-error TS(7006) FIXME: Parameter 'settings' implicitly has an 'any' type.
export function loadTagsSettings(settings) {
    tags = settings.tags !== undefined ? settings.tags : DEFAULT_TAGS;
    tag_map = settings.tag_map !== undefined ? settings.tag_map : Object.create(null);
}

// @ts-expect-error TS(7006) FIXME: Parameter 'oldKey' implicitly has an 'any' type.
export function renameTagKey(oldKey, newKey) {
    // @ts-expect-error TS(7053)
    const value = tag_map[oldKey];
    // @ts-expect-error TS(7053)
    tag_map[newKey] = value || [];
    // @ts-expect-error TS(7053)
    delete tag_map[oldKey];
    markDirty();
}

// @ts-expect-error TS(7006) FIXME: Parameter 'listElement' implicitly has an 'any' ty...
export function createTagMapFromList(listElement, key) {
    const $listEl = typeof listElement === 'string' ? document.querySelector(listElement) : listElement;
    const tagIds = getTagIdsFromDOM($listEl);
    // @ts-expect-error TS(7053)
    tag_map[key] = tagIds;
    markDirty();
}

// ──────────────────────────────────────────────
// Tag Key Resolution
// ──────────────────────────────────────────────

export function getTagKey() {
    if (selected_group && menu_type === 'group_edit') {
        return selected_group;
    }
    if (this_chid !== undefined && menu_type === 'character_edit') {
        return characters[this_chid].avatar;
    }
    return null;
}

export function getInlineListSelector() {
    if (selected_group && menu_type === 'group_edit') {
        return `.group_select[grid="${selected_group}"] .tags`;
    }
    if (this_chid !== undefined && menu_type === 'character_edit') {
        return `.character_select[chid="${this_chid}"] .tags`;
    }
    return null;
}

// @ts-expect-error TS(7006) FIXME: Parameter 'entityOrKey' implicitly has an 'any' ty...
export function getTagKeyForEntity(entityOrKey) {
    let x = entityOrKey;

    if (typeof x === 'object' && x !== null && 'id' in x) {
        x = x.id;
    }

    let character;
    if (!character && characters.indexOf(x) >= 0) character = x;
    if (!character && !isNaN(parseInt(entityOrKey))) character = characters[x];
    if (!character) character = characters.find(y => y.avatar === x);

    if (character) {
        x = character.avatar;
    }

    if (character && !(x in tag_map)) {
        // @ts-expect-error TS(7053)
        tag_map[x] = [];
        return x;
    }

    if (x in tag_map) {
        return x;
    }

    return undefined;
}

// @ts-expect-error TS(7006) FIXME: Parameter 'element' implicitly has an 'any' type.
export function getTagKeyForEntityElement(element) {
    let el = typeof element === 'string'
        ? document.querySelector(element)
        : (element?.[0] instanceof Node ? element[0] : element);
    while (el?.getAttribute) {
        const grid = el.getAttribute('data-grid');
        const chid = el.getAttribute('data-chid');
        if (grid || chid) {
            return getTagKeyForEntity(grid || chid);
        }
        el = el.parentElement;
    }
    return undefined;
}

// ──────────────────────────────────────────────
// Tag CRUD (data-only)
// ──────────────────────────────────────────────

// @ts-expect-error TS(7006) FIXME: Parameter 'key' implicitly has an 'any' type.
export function getTagsList(key, sort = true) {
    if (key === null || key === undefined) {
        return [];
    }
    // @ts-expect-error TS(7053)
    if (!Array.isArray(tag_map[key])) {
        // @ts-expect-error TS(7053)
        tag_map[key] = [];
        return [];
    }
    // @ts-expect-error TS(7053)
    const list = tag_map[key]
        .map(x => getTagById(x))
        .filter(x => x);
    if (sort) list.sort(compareTagsForSort);
    return list;
}

// @ts-expect-error TS(7006) FIXME: Parameter 'tagName' implicitly has an 'any' type.
export function getTag(tagName, { createNew = false } = {}) {
    let tag = tags.find(t => equalsIgnoreCaseAndAccents(t.name, tagName)) ?? undefined;
    if (!tag && createNew) {
        tag = createNewTag(tagName);
    }
    return tag;
}

// @ts-expect-error TS(7006) FIXME: Parameter 'tagName' implicitly has an 'any' type.
export function newTag(tagName) {
    return {
        id: uuidv4(),
        name: tagName,
        folder_type: TAG_FOLDER_DEFAULT_TYPE,
        filter_state: DEFAULT_FILTER_STATE,
        // @ts-expect-error TS(7005)
        sort_order: Math.max(0, ...tags.map(t => t.sort_order)) + 1,
        is_hidden_on_character_card: false,
        color: '',
        color2: '',
        create_date: Date.now(),
    };
}

// @ts-expect-error TS(7006) FIXME: Parameter 'tagName' implicitly has an 'any' type.
export function createNewTag(tagName) {
    const existing = getTag(tagName);
    if (existing) {
        // @ts-expect-error TS(2304) Cannot find name 'notyf'
        notyf.warning(`Cannot create new tag. A tag with the name already exists:<br />${escapeHtml(existing.name)}`, 'Creating Tag', { escapeHtml: false });
        return existing;
    }
    const tag = newTag(tagName);
    tags.push(tag);
    console.debug('Created new tag', tag.name, 'with id', tag.id);
    return tag;
}

// @ts-expect-error TS(7006) FIXME: Parameter 'newTags' implicitly has an 'any' type.
export function getExistingTags(newTags) {
    const existingTags = [];
    for (const tagName of newTags) {
        const foundTag = getTag(tagName);
        if (foundTag) {
            existingTags.push(foundTag);
        }
    }
    return existingTags;
}

// ──────────────────────────────────────────────
// Tag Map Operations (low-level)
// ──────────────────────────────────────────────

// @ts-expect-error TS(7006) FIXME: Parameter 'tagId' implicitly has an 'any' type.
export function addTagToMap(tagId, characterId = null) {
    const key = characterId !== null && characterId !== undefined ? getTagKeyForEntity(characterId) : getTagKey();
    if (!key) {
        return false;
    }
    // @ts-expect-error TS(7053)
    if (!Array.isArray(tag_map[key])) {
        // @ts-expect-error TS(7053)
        tag_map[key] = [tagId];
        return true;
    } else {
        // @ts-expect-error TS(7053)
        if (tag_map[key].includes(tagId)) return false;
        // @ts-expect-error TS(7053)
        tag_map[key].push(tagId);
        // @ts-expect-error TS(7053)
        tag_map[key] = tag_map[key].filter(onlyUnique);
        return true;
    }
}

// @ts-expect-error TS(7006) FIXME: Parameter 'tagId' implicitly has an 'any' type.
export function removeTagFromMap(tagId, characterId = null) {
    const key = characterId !== null && characterId !== undefined ? getTagKeyForEntity(characterId) : getTagKey();
    if (!key) {
        return false;
    }
    // @ts-expect-error TS(7053)
    if (!Array.isArray(tag_map[key])) {
        // @ts-expect-error TS(7053)
        tag_map[key] = [];
        return false;
    } else {
        // @ts-expect-error TS(7053)
        const indexOf = tag_map[key].indexOf(tagId);
        // @ts-expect-error TS(7053)
        tag_map[key].splice(indexOf, 1);
        return indexOf !== -1;
    }
}

// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export function copyTags(data) {
    // @ts-expect-error TS(7053)
    const prevTagMap = tag_map[data.oldAvatar] || [];
    // @ts-expect-error TS(7053)
    const newTagMap = tag_map[data.newAvatar] || [];
    // @ts-expect-error TS(7053)
    tag_map[data.newAvatar] = Array.from(new Set([...prevTagMap, ...newTagMap]));
}

// ──────────────────────────────────────────────
// Utility Helpers (reduce repeated patterns)
// ──────────────────────────────────────────────

/**
 * Find a tag by its id. Replaces 22× tags.find(t => t.id === x) across modules.
 * @param {string} id - The tag id
 * @returns {Tag|undefined} The tag or undefined
 */
export function getTagById(id) {
    return tags.find(t => t.id === id);
}

/**
 * Get tag IDs assigned to an entity key. Replaces repeated tag_map[key] access patterns.
 * @param {string} key - The entity key
 * @returns {string[]} Array of tag IDs (empty if none)
 */
export function getTagIdsForKey(key) {
    // @ts-expect-error TS(7053)
    return Array.isArray(tag_map[key]) ? tag_map[key] : [];
}

/**
 * Resolve a selector string or element to an HTMLElement.
 * Replaces 6× typeof x === 'string' ? document.querySelector(x) : x patterns.
 * @param {string|HTMLElement|null} selector - String selector or element
 * @returns {HTMLElement|null} The resolved element
 */
export function resolveElement(selector) {
    if (!selector) return null;
    if (typeof selector === 'string') return document.querySelector(selector);
    return selector;
}

// ──────────────────────────────────────────────
// Event System (replaces manual saveSettings/printCharacters)
// ──────────────────────────────────────────────

type TagStoreEvent = 'added' | 'removed' | 'changed' | 'loaded';
const tagListeners = new Map();

/**
 * Subscribe to tag store events.
 * Replaces scattered saveSettingsDebounced() + printCharactersDebounced() calls.
 * @example tagStoreEvents.on('changed', () => { ... });
 */
export const tagStoreEvents = {
    on(event, callback) {
        let set = tagListeners.get(event);
        if (!set) { set = new Set(); tagListeners.set(event, set); }
        set.add(callback);
    },
    off(event, callback) {
        tagListeners.get(event)?.delete(callback);
    },
    emit(event, data) {
        tagListeners.get(event)?.forEach(cb => {
            try { cb(data); } catch(e) { console.error('TagStore event error:', e); }
        });
    },
};

// ──────────────────────────────────────────────
// DOM Helpers (reduce repeated query patterns)
// ──────────────────────────────────────────────

/**
 * Extract tag IDs from DOM elements. Replaces 6× Array.from(querySelectorAll(...), el => el.getAttribute('id')) patterns.
 * @param {HTMLElement|string} container - Container element or selector
* @param {string} selector - CSS selector for tag elements
 * @returns {string[]} Array of tag ID strings
 */
export function getTagIdsFromDOM(container, selector = '.tag') {
    const el = resolveElement(container);
    return Array.from(el?.querySelectorAll(selector) ?? [], x => x.getAttribute('id')).filter(Boolean);
}

/**
 * Get tag ID and tag object from a DOM event's closest ancestor. Replaces 6× closest('.tag_view_item') + getTagById patterns.
 * @param {Event|HTMLElement} eventOrElement - The event or element to search from
 * @param {string} ancestorSelector - CSS selector for the ancestor (default: '.tag_view_item')
 * @returns {{id: string, tag: Tag}|null} The tag ID and tag object, or null
 */
export function getTagFromEvent(eventOrElement: any, ancestorSelector = '.tag_view_item'): { id: string, tag: any } | null {
    const el = eventOrElement instanceof Event ? eventOrElement.target : eventOrElement;
    const ancestor = el?.closest?.(ancestorSelector);
    const id = ancestor?.getAttribute?.('id');
    if (!id) return null;
    const tag = getTagById(id) as any;
    return tag ? { id, tag } : null;
}

/**
 * Get the folder type config for a tag. Replaces 6× TAG_FOLDER_TYPES[tag.folder_type] patterns.
 * @param {object} tag - Tag with folder_type property
 * @returns {object} The folder type config
 */
export function getFolderType(tag) {
    // @ts-expect-error TS(7053)
    return TAG_FOLDER_TYPES[tag?.folder_type] || TAG_FOLDER_TYPES[TAG_FOLDER_DEFAULT_TYPE];
}

/**
 * Mark the store as dirty (needs save). Call after mutations.
 * Saves immediately (not debounced) so changes survive page refresh.
 */
export function markDirty() {
    saveSettings();
    tagStoreEvents.emit('changed', null);
}
