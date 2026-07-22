/**
 * Tag store — manages tags[], tag_map{}, and all CRUD operations.
 * Pure data management. No UI code.
 */

import { characters, saveSettings, this_chid, menu_type } from '../../../script.js';
import { selected_group } from '../../group-chats.js';
import { onlyUnique, uuidv4, equalsIgnoreCaseAndAccents, escapeHtml } from '../../utils.js';
import { TAG_FOLDER_TYPES, TAG_FOLDER_DEFAULT_TYPE } from '../types.js';
import { FILTER_STATES } from '../../filters.js';
import { compareTagsForSort } from '../utils/sorting.js';

declare const notyf: {
    warning: (msg: string, ...args: unknown[]) => void;
    success: (msg: string, ...args: unknown[]) => void;
    error: (msg: string, ...args: unknown[]) => void;
    info: (msg: string, ...args: unknown[]) => void;
};

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
export let tags: {
    id: string;
    name: string;
    folder_type?: string;
    filter_state?: string;
    sort_order?: number;
    is_hidden_on_character_card?: boolean;
    color?: string;
    color2?: string;
    create_date?: number;
    action?: (...args: unknown[]) => unknown;
    class?: string;
    icon?: string;
    title?: string;
}[] = [];

/**
 * A map representing the key of an entity with a corresponding array of tags.
 * @type {{[identifier: string]: string[]?}}
 */
export let tag_map = {};

// ──────────────────────────────────────────────
// Load / Save
// ──────────────────────────────────────────────

/**
 *
 * @param settings
 * @param settings.tags
 * @param settings.tag_map
 */
export function loadTagsSettings(settings: { tags?: typeof tags; tag_map?: typeof tag_map }) {
    tags = settings.tags !== undefined ? settings.tags : DEFAULT_TAGS;
    tag_map = settings.tag_map !== undefined ? settings.tag_map : Object.create(null);
}

/**
 *
 * @param oldKey
 * @param newKey
 */
export function renameTagKey(oldKey: string, newKey: string) {
    const typedMap = tag_map as Record<string, string[] | undefined>;
    const value = typedMap[oldKey];
    typedMap[newKey] = value || [];
    delete typedMap[oldKey];
    markDirty();
}

/**
 *
 * @param listElement
 * @param key
 */
export function createTagMapFromList(listElement: string | HTMLElement | null, key: string) {
    const $listEl =
        typeof listElement === 'string' ? document.querySelector(listElement) : listElement;
    const tagIds = getTagIdsFromDOM($listEl as HTMLElement | null);
    (tag_map as Record<string, string[]>)[key] = tagIds;
    markDirty();
}

// ──────────────────────────────────────────────
// Tag Key Resolution
// ──────────────────────────────────────────────

/**
 *
 */
export function getTagKey() {
    if (selected_group && menu_type === 'group_edit') {
        return selected_group;
    }
    if (this_chid !== undefined && menu_type === 'character_edit') {
        return characters[this_chid].avatar;
    }
    return null;
}

/**
 *
 */
export function getInlineListSelector() {
    if (selected_group && menu_type === 'group_edit') {
        return `.group_select[grid="${selected_group}"] .tags`;
    }
    if (this_chid !== undefined && menu_type === 'character_edit') {
        return `.character_select[chid="${this_chid}"] .tags`;
    }
    return null;
}

/**
 *
 * @param entityOrKey
 */
export function getTagKeyForEntity(entityOrKey: unknown) {
    let x: unknown = entityOrKey;

    if (typeof x === 'object' && x !== null && 'id' in x) {
        x = (x as Record<string, unknown>).id;
    }

    let character: unknown;
    if (!character && characters.indexOf(x as unknown as Character) >= 0) character = x;
    if (!character && !isNaN(parseInt(entityOrKey as string)))
        character = characters[x as unknown as number];
    if (!character) character = characters.find((y) => y.avatar === x);

    if (character) {
        x = (character as Record<string, unknown>).avatar;
    }

    if (character && !((x as string) in tag_map)) {
        (tag_map as Record<string, string[]>)[x as string] = [];
        return x as string;
    }

    if ((x as string) in tag_map) {
        return x as string;
    }

    return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cash = any;

/**
 *
 * @param element
 */
export function getTagKeyForEntityElement(element: string | HTMLElement | Cash | null | undefined) {
    let el =
        typeof element === 'string'
            ? document.querySelector(element)
            : element?.[0] instanceof Node
              ? element[0]
              : element;
    while (el instanceof Element && el.getAttribute) {
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

/**
 *
 * @param key
 * @param sort
 */
export function getTagsList(key: string | null | undefined, sort = true) {
    if (key === null || key === undefined) {
        return [];
    }
    const typedMap = tag_map as Record<string, string[] | undefined>;
    if (!Array.isArray(typedMap[key])) {
        typedMap[key] = [];
        return [];
    }
    const list = typedMap[key]!.map((x) => getTagById(x)).filter(
        (x): x is NonNullable<typeof x> => x !== undefined,
    );
    if (sort) list.sort(compareTagsForSort);
    return list;
}

/**
 *
 * @param tagName
 * @param root0
 * @param root0.createNew
 */
export function getTag(
    tagName: string,
    { createNew = false }: { createNew?: boolean } = {},
): Record<string, unknown> | undefined {
    let tag: Record<string, unknown> | undefined =
        tags.find((t) => equalsIgnoreCaseAndAccents(t.name, tagName)) ?? undefined;
    if (!tag && createNew) {
        tag = createNewTag(tagName);
    }
    return tag;
}

/**
 *
 * @param tagName
 */
export function newTag(tagName: string): Record<string, unknown> {
    return {
        id: uuidv4(),
        name: tagName,
        folder_type: TAG_FOLDER_DEFAULT_TYPE,
        filter_state: DEFAULT_FILTER_STATE,
        sort_order:
            Math.max(
                0,
                ...tags.map((t: Record<string, unknown>) => (t.sort_order as number) || 0),
            ) + 1,
        is_hidden_on_character_card: false,
        color: '',
        color2: '',
        create_date: Date.now(),
    };
}

/**
 *
 * @param tagName
 */
export function createNewTag(tagName: string): Record<string, unknown> {
    const existing = getTag(tagName);
    if (existing) {
        notyf.warning(
            `Cannot create new tag. A tag with the name already exists:<br />${escapeHtml(existing.name as string)}`,
            'Creating Tag',
            { escapeHtml: false },
        );
        return existing;
    }
    const tag = newTag(tagName);
    tags.push(tag as (typeof tags)[number]);
    console.debug('Created new tag', tag.name, 'with id', tag.id);
    return tag;
}

/**
 *
 * @param newTags
 */
export function getExistingTags(newTags: string[]): Record<string, unknown>[] {
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

/**
 *
 * @param tagId
 * @param characterId
 */
export function addTagToMap(tagId: string, characterId: string | null = null) {
    const key =
        characterId !== null && characterId !== undefined
            ? getTagKeyForEntity(characterId)
            : getTagKey();
    if (!key) {
        return false;
    }
    const typedMap = tag_map as Record<string, string[] | undefined>;
    if (!Array.isArray(typedMap[key])) {
        typedMap[key] = [tagId];
        return true;
    } else {
        if (typedMap[key]!.includes(tagId)) return false;
        typedMap[key]!.push(tagId);
        typedMap[key] = typedMap[key]!.filter(onlyUnique);
        return true;
    }
}

/**
 *
 * @param tagId
 * @param characterId
 */
export function removeTagFromMap(tagId: string, characterId: string | null = null) {
    const key =
        characterId !== null && characterId !== undefined
            ? getTagKeyForEntity(characterId)
            : getTagKey();
    if (!key) {
        return false;
    }
    const typedMap = tag_map as Record<string, string[] | undefined>;
    if (!Array.isArray(typedMap[key])) {
        typedMap[key] = [];
        return false;
    } else {
        const indexOf = typedMap[key]!.indexOf(tagId);
        typedMap[key]!.splice(indexOf, 1);
        return indexOf !== -1;
    }
}

/**
 *
 * @param data
 * @param data.oldAvatar
 * @param data.newAvatar
 */
export function copyTags(data: { oldAvatar: string; newAvatar: string }) {
    const typedMap = tag_map as Record<string, string[] | undefined>;
    const prevTagMap = typedMap[data.oldAvatar] || [];
    const newTagMap = typedMap[data.newAvatar] || [];
    typedMap[data.newAvatar] = Array.from(new Set([...prevTagMap, ...newTagMap]));
}

// ──────────────────────────────────────────────
// Utility Helpers (reduce repeated patterns)
// ──────────────────────────────────────────────

/**
 * Find a tag by its id. Replaces 22× tags.find(t => t.id === x) across modules.
 * @param {string} id - The tag id
 * @returns {Tag|undefined} The tag or undefined
 */
export function getTagById(id: string) {
    return tags.find((t) => t.id === id);
}

/**
 * Get tag IDs assigned to an entity key. Replaces repeated tag_map[key] access patterns.
 * @param {string} key - The entity key
 * @returns {string[]} Array of tag IDs (empty if none)
 */
export function getTagIdsForKey(key: string): string[] {
    const typedMap = tag_map as Record<string, string[] | undefined>;
    return Array.isArray(typedMap[key]) ? typedMap[key]! : [];
}

/**
 * Resolve a selector string or element to an HTMLElement.
 * Replaces 6× typeof x === 'string' ? document.querySelector(x) : x patterns.
 * @param {string|HTMLElement|null} selector - String selector or element
 * @returns {HTMLElement|null} The resolved element
 */
export function resolveElement(
    selector: string | HTMLElement | null | undefined,
): HTMLElement | null {
    if (!selector) return null;
    if (typeof selector === 'string') return document.querySelector(selector);
    return selector;
}

// ──────────────────────────────────────────────
// Event System (replaces manual saveSettings/printCharacters)
// ──────────────────────────────────────────────

type TagStoreEvent = 'added' | 'removed' | 'changed' | 'loaded';
const tagListeners = new Map<TagStoreEvent, Set<(...args: unknown[]) => void>>();

/**
 * Subscribe to tag store events.
 * Replaces scattered saveSettingsDebounced() + printCharactersDebounced() calls.
 * @example tagStoreEvents.on('changed', () => { ... });
 */
export const tagStoreEvents = {
    on(event: TagStoreEvent, callback: (...args: unknown[]) => void) {
        let set = tagListeners.get(event);
        if (!set) {
            set = new Set();
            tagListeners.set(event, set);
        }
        set.add(callback);
    },
    off(event: TagStoreEvent, callback: (...args: unknown[]) => void) {
        tagListeners.get(event)?.delete(callback);
    },
    emit(event: TagStoreEvent, data: unknown) {
        tagListeners.get(event)?.forEach((cb) => {
            try {
                cb(data);
            } catch (e) {
                console.error('TagStore event error:', e);
            }
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
export function getTagIdsFromDOM(
    container: string | HTMLElement | null | undefined,
    selector = '.tag',
): string[] {
    const el = resolveElement(container);
    return Array.from(el?.querySelectorAll(selector) ?? [], (x: Element) =>
        x.getAttribute('id'),
    ).filter((x): x is string => x !== null);
}

/**
 * Get tag ID and tag object from a DOM event's closest ancestor. Replaces 6× closest('.tag_view_item') + getTagById patterns.
 * @param {Event|HTMLElement} eventOrElement - The event or element to search from
 * @param {string} ancestorSelector - CSS selector for the ancestor (default: '.tag_view_item')
 * @returns {{id: string, tag: Tag}|null} The tag ID and tag object, or null
 */
export function getTagFromEvent(
    eventOrElement: Event | HTMLElement,
    ancestorSelector = '.tag_view_item',
): { id: string; tag: Record<string, unknown> } | null {
    const el = eventOrElement instanceof Event ? eventOrElement.target : eventOrElement;
    const ancestor = (el as Element | null)?.closest?.(ancestorSelector);
    const id = ancestor?.getAttribute?.('id');
    if (!id) return null;
    const tag = getTagById(id);
    return tag ? { id, tag } : null;
}

/**
 * Get the folder type config for a tag. Replaces 6× TAG_FOLDER_TYPES[tag.folder_type] patterns.
 * @param {object} tag - Tag with folder_type property
 * @returns {object} The folder type config
 */
export function getFolderType(tag: Record<string, unknown> | undefined) {
    const typedTypes = TAG_FOLDER_TYPES as Record<
        string,
        {
            icon: string;
            class: string;
            fa_icon?: string;
            tooltip?: string;
            color?: string;
            size?: string;
        }
    >;
    return typedTypes[tag?.folder_type as string] || typedTypes[TAG_FOLDER_DEFAULT_TYPE];
}

/**
 * Mark the store as dirty (needs save). Call after mutations.
 * Saves immediately (not debounced) so changes survive page refresh.
 */
export function markDirty() {
    saveSettings();
    tagStoreEvents.emit('changed', null);
}
