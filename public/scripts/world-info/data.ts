/**
 * World Info data layer — storage, CRUD, converters.
 *
 * Pure data operations (no DOM dependencies on world-info.ts).
 * Imported by world-info.ts and re-exported for backward compatibility.
 */

import {
    saveSettings,
    getRequestHeaders,
    eventSource,
    event_types,
    extension_prompt_roles,
    characters,
    menu_type,
    saveCharacterDebounced,
} from '../../script.js';
import {
    escapeHtml,
    equalsIgnoreCaseAndAccents,
    getSanitizedFilename,
    checkOverwriteExistingData,
    getFileBuffer,
    parseJsonFile,
    extractDataFromPng,
} from '../utils.js';
import { GENERATION_TYPE_TRIGGERS } from '../constants.js';
import { t } from '../i18n.js';
import { Popup } from '../popup.js';

import type { WorldInfoEntryData } from './types.js';

import { wiManager } from './manager.js';
import type { WorldInfoStore } from './store.js';
import {
    world_info_position,
    world_info_logic,
    DEFAULT_DEPTH,
    DEFAULT_WEIGHT,
} from './constants.js';
import { worldInfoCache } from './engine.js';
import { deleteWIOriginalDataValue } from './editor.js';

import { power_user } from '../power-user.js';
import { getOrCreatePersonaDescriptor, user_avatar } from '../personas.js';

import {
    updateWorldInfoList,
    setWorldInfoButtonClass,
    reloadEditor,
    checkEmbeddedWorld,
    hideWorldEditor,
    updateWorldInfoLinks,
    getWIElement,
} from '../world-info.js';

// ═══════════════════════════════════════════════════════════════
//  Internal helpers
// ═══════════════════════════════════════════════════════════════

/**
 * @param {string} name - World info name
 * @param {object} data - World info data to save
 * @returns {Promise<void>}
 */
async function _save(name: string, data: Record<string, unknown>) {
    await fetch('/api/worldinfo/edit', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ name: name, data: data }),
    });
    await eventSource.emit(event_types.WORLDINFO_UPDATED, name, data);
}

/** Immediately syncs the current selection to wiManager.info and saves all settings. */
export function saveSettingsNow() {
    Object.assign(wiManager.info, { globalSelect: wiManager.selectedWorlds });
    saveSettings();
}

// ═══════════════════════════════════════════════════════════════
//  Entry templates / definitions
// ═══════════════════════════════════════════════════════════════

/**
 * Definitions of types for new WI entries
 *
 * Use `newEntryTemplate` if you just need the template that contains default values
 * @type {{[key: string]: WIEntryFieldDefinition}}
 */
export const newWorldInfoEntryDefinition = {
    key: { default: [], type: 'array' },
    keysecondary: { default: [], type: 'array' },
    comment: { default: '', type: 'string' },
    content: { default: '', type: 'string' },
    constant: { default: false, type: 'boolean' },
    vectorized: { default: false, type: 'boolean' },
    selective: { default: true, type: 'boolean' },
    selectiveLogic: { default: world_info_logic.AND_ANY, type: 'enum' },
    addMemo: { default: false, type: 'boolean' },
    order: { default: 100, type: 'number' },
    position: { default: 0, type: 'number' },
    disable: { default: false, type: 'boolean' },
    ignoreBudget: { default: false, type: 'boolean' },
    excludeRecursion: { default: false, type: 'boolean' },
    preventRecursion: { default: false, type: 'boolean' },
    matchPersonaDescription: { default: false, type: 'boolean' },
    matchCharacterDescription: { default: false, type: 'boolean' },
    matchCharacterPersonality: { default: false, type: 'boolean' },
    matchCharacterDepthPrompt: { default: false, type: 'boolean' },
    matchScenario: { default: false, type: 'boolean' },
    matchCreatorNotes: { default: false, type: 'boolean' },
    delayUntilRecursion: { default: 0, type: 'number' },
    probability: { default: 100, type: 'number' },
    useProbability: { default: true, type: 'boolean' },
    depth: { default: DEFAULT_DEPTH, type: 'number' },
    outletName: { default: '', type: 'string' },
    group: { default: '', type: 'string' },
    groupOverride: { default: false, type: 'boolean' },
    groupWeight: { default: DEFAULT_WEIGHT, type: 'number' },
    scanDepth: { default: null, type: 'number?' },
    caseSensitive: { default: null, type: 'boolean?' },
    matchWholeWords: { default: null, type: 'boolean?' },
    useGroupScoring: { default: null, type: 'boolean?' },
    automationId: { default: '', type: 'string' },
    role: { default: 0, type: 'enum' },
    sticky: { default: null, type: 'number?' },
    cooldown: { default: null, type: 'number?' },
    delay: { default: null, type: 'number?' },
    characterFilterNames: { default: [], type: 'array', excludeFromTemplate: true },
    characterFilterTags: { default: [], type: 'array', excludeFromTemplate: true },
    characterFilterExclude: { default: false, type: 'boolean', excludeFromTemplate: true },
    triggers: {
        default: [],
        type: 'array',
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        arrayFilter: (value) => GENERATION_TYPE_TRIGGERS.includes(value),
    },
};

export const newWorldInfoEntryTemplate = Object.fromEntries(
    Object.entries(newWorldInfoEntryDefinition)
        // @ts-expect-error TS(2339) FIXME: Property 'filter' does not exist on type.
        .filter(([_, value]) => !value.excludeFromTemplate)
        .map(([key, value]) => [key, value.default]),
);

// ═══════════════════════════════════════════════════════════════
//  Entry CRUD
// ═══════════════════════════════════════════════════════════════

/**
 * Creates a new world info entry via the EntityStore.
 * @param {import('./store.js').WorldInfoStore} store - The store for the target book
 * @returns {Promise<object|undefined>} New entry object or undefined if failed
 */
export async function createWorldInfoEntry(store: WorldInfoStore) {
    const newUid = await store.getFreeUid();

    if (!Number.isInteger(newUid)) {
        console.error("Couldn't assign UID to a new entry");
        return;
    }

    const newEntry = {
        uid: newUid as number,
        ...structuredClone(newWorldInfoEntryTemplate),
    } as WorldInfoEntryData;
    await store.addEntry(newEntry);

    return newEntry;
}

/**
 * Duplicates a WI entry via the EntityStore.
 * @param {import('./store.js').WorldInfoStore} store - The store for the target book
 * @param {number} uid - The uid of the entry to copy
 * @returns {Promise<object|undefined>} The duplicated entry
 */
export async function duplicateWorldInfoEntry(store: WorldInfoStore, uid: number) {
    const original = await store.getEntry(uid);
    if (!original) return;

    // Clone and strip identifiers so createWorldInfoEntry assigns new ones
    const clone = structuredClone(original) as unknown as Record<string, unknown>;
    delete clone.id;
    delete clone.uid;

    const newUid = await store.getFreeUid();
    if (!Number.isInteger(newUid)) {
        console.error("Couldn't assign UID to duplicated entry");
        return;
    }

    clone.uid = newUid as number;
    await store.addEntry(clone as unknown as WorldInfoEntryData);
    return clone;
}

/**
 * Deletes a WI entry from the store, with a user confirmation dialog.
 * @param {import('./store.js').WorldInfoStore} store - The store for the target book
 * @param {number} uid - The uid of the entry to delete
 * @param {object} [options] - Optional arguments
 * @param {boolean} [options.silent] - Whether to prompt the user for deletion or just do it
 * @returns {Promise<boolean>} Whether the entry deletion was successful
 */
export async function deleteWorldInfoEntry(
    store: WorldInfoStore,
    uid: number,
    { silent = false } = {},
) {
    const entry = await store.getEntry(uid);
    if (!entry) return false;

    let previewText = '';
    if (entry.comment && entry.comment.trim()) {
        previewText = entry.comment.trim();
    } else if (entry.content) {
        const lines = entry.content.split(/\r?\n/).filter((line: string) => line.trim());
        previewText = lines.slice(0, 2).join('\n');
    }

    const popupHeader = t`Delete world info entry with UID: ${uid}?`;
    const popupText = previewText
        ? `<strong>${t`Entry`}:</strong><br>${escapeHtml(previewText).replace(/\n/g, '<br>')}<br><br>${t`This action is irreversible!`}`
        : t`This action is irreversible!`;

    const confirmation = silent || (await Popup.show.confirm(popupHeader, popupText));
    if (!confirmation) return false;

    return store.removeEntry(uid);
}

// ═══════════════════════════════════════════════════════════════
//  Book-level storage
// ═══════════════════════════════════════════════════════════════

/**
 * Saves the world info by serializing from the EntityStore.
 *
 * The store is the authoritative source for entries.
 * `bookData` is additional book metadata (originalData, etc.) merged into the payload.
 * Updates `worldInfoCache` with the full book object after serializing.
 * @param {string} name - The name of the world info
 * @param {object} [bookData] - Additional book metadata (originalData, etc.)
 * @param {boolean} [immediately] - Whether to save immediately or use debouncing
 * @returns {Promise<void>}
 */
export async function saveWorldInfo(name: string, bookData = {}, immediately = false) {
    if (!name) return;

    const store = wiManager.getStore(name);
    await store.init();

    // Sync in-memory entries to the store before serializing.
    // This ensures edits made to data.entries (by inline editors like
    // bindEntryField) are captured, even though the store was already
    // populated when the book was opened.
    if (bookData && typeof bookData === 'object' && 'entries' in bookData) {
        // @ts-expect-error TS(2571) entries is dynamic at runtime
        const entryList = Object.values(bookData.entries).filter(Boolean) as WorldInfoEntryData[];
        if (entryList.length > 0) {
            await store.replaceAllEntries(entryList);
        }
    }

    const entries = await store.toObject();
    const data = { ...bookData, entries };

    // Update cache
    worldInfoCache.set(name, data);

    // Always save immediately. Debouncing caused data loss when the page
    // was refreshed before the debounced fetch could fire.
    return await _save(name, data);
}

// ═══════════════════════════════════════════════════════════════
//  UID / name utilities
// ═══════════════════════════════════════════════════════════════

/**
 * Finds the smallest unused UID from the store.
 * @param {import('./store.js').WorldInfoStore} store - The store for the target book
 * @returns {Promise<number|null>} A free UID or null if none available
 */
export async function getFreeWorldEntryUid(store: WorldInfoStore) {
    return store.getFreeUid();
}

/**
 * Generates a free world name based on the given input name.
 * If the input name is null, a default name is used.
 * If the input name already exists, a numbered suffix is added.
 * @param {string|null} worldName - The name to base the new world name on. If null, a default name is used.
 * @param {object} [options] - Optional parameters.
 * @param {boolean} [options.stripIndex] - Whether to strip any numbered suffix from the input name before generating the new name.
 * @returns {string|undefined} The generated free world name, or undefined if no free name could be found after trying 100,000 times.
 */
export function getFreeWorldName(worldName = null, { stripIndex = true } = {}) {
    worldName ??= t`New World`;
    if (stripIndex) {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        worldName = worldName.replace(/\s*\(\d+\)$/, '');
    }
    const MAX_FREE_NAME = 100_000;
    for (let index = 1; index < MAX_FREE_NAME; index++) {
        const newName = `${worldName} (${index})`;
        if (wiManager.worldNames.includes(newName)) {
            continue;
        }
        return newName;
    }

    return undefined;
}

// ═══════════════════════════════════════════════════════════════
//  Converters
// ═══════════════════════════════════════════════════════════════

/**
 * @param {object} inputObj - Agnai memory book data
 * @returns {{entries: Record<string, object>}} Converted WI entries
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'inputObj' implicitly has an 'any' type.
export function convertAgnaiMemoryBook(inputObj) {
    const outputObj = { entries: {} };

    // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
    inputObj.entries.forEach((entry, index) => {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre...
        outputObj.entries[index] = {
            ...newWorldInfoEntryTemplate,
            uid: index,
            key: entry.keywords,
            keysecondary: [],
            comment: entry.name,
            content: entry.entry,
            constant: false,
            selective: false,
            vectorized: false,
            selectiveLogic: world_info_logic.AND_ANY,
            order: entry.weight,
            position: 0,
            disable: !entry.enabled,
            addMemo: !!entry.name,
            excludeRecursion: false,
            delayUntilRecursion: false,
            displayIndex: index,
            probability: 100,
            useProbability: true,
            outletName: '',
            group: '',
            groupOverride: false,
            groupWeight: DEFAULT_WEIGHT,
            scanDepth: null,
            caseSensitive: null,
            matchWholeWords: null,
            useGroupScoring: null,
            automationId: '',
            role: extension_prompt_roles.SYSTEM,
            sticky: null,
            cooldown: null,
            delay: null,
            triggers: [],
            ignoreBudget: false,
        };
    });

    return outputObj;
}

/**
 * @param {object} inputObj - Risu lorebook data
 * @returns {{entries: Record<string, object>}} Converted WI entries
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'inputObj' implicitly has an 'any' type.
export function convertRisuLorebook(inputObj) {
    const outputObj = { entries: {} };

    // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
    inputObj.data.forEach((entry, index) => {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre...
        outputObj.entries[index] = {
            ...newWorldInfoEntryTemplate,
            uid: index,
            // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
            key: entry.key.split(',').map((x) => x.trim()),
            // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
            keysecondary: entry.secondkey ? entry.secondkey.split(',').map((x) => x.trim()) : [],
            comment: entry.comment,
            content: entry.content,
            constant: entry.alwaysActive,
            selective: entry.selective,
            vectorized: false,
            selectiveLogic: world_info_logic.AND_ANY,
            order: entry.insertorder,
            position: world_info_position.before,
            disable: false,
            addMemo: true,
            excludeRecursion: false,
            delayUntilRecursion: false,
            displayIndex: index,
            probability: entry.activationPercent ?? 100,
            useProbability: entry.activationPercent ?? true,
            outletName: '',
            group: '',
            groupOverride: false,
            groupWeight: DEFAULT_WEIGHT,
            scanDepth: null,
            caseSensitive: null,
            matchWholeWords: null,
            useGroupScoring: null,
            automationId: '',
            role: extension_prompt_roles.SYSTEM,
            sticky: null,
            cooldown: null,
            delay: null,
            triggers: [],
            ignoreBudget: false,
        };
    });

    return outputObj;
}

/**
 * @param {object} inputObj - Novel lorebook data
 * @returns {{entries: Record<string, object>}} Converted WI entries
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'inputObj' implicitly has an 'any' type.
export function convertNovelLorebook(inputObj) {
    const outputObj = {
        entries: {},
    };

    // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
    inputObj.entries.forEach((entry, index) => {
        const displayName = entry.displayName;
        const addMemo = displayName !== undefined && displayName.trim() !== '';

        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre...
        outputObj.entries[index] = {
            ...newWorldInfoEntryTemplate,
            uid: index,
            key: entry.keys,
            keysecondary: [],
            comment: displayName || '',
            content: entry.text,
            constant: false,
            selective: false,
            vectorized: false,
            selectiveLogic: world_info_logic.AND_ANY,
            order: entry.contextConfig?.budgetPriority ?? 0,
            position: 0,
            disable: !entry.enabled,
            addMemo: addMemo,
            excludeRecursion: false,
            delayUntilRecursion: false,
            displayIndex: index,
            probability: 100,
            useProbability: true,
            outletName: '',
            group: '',
            groupOverride: false,
            groupWeight: DEFAULT_WEIGHT,
            scanDepth: null,
            caseSensitive: null,
            matchWholeWords: null,
            useGroupScoring: null,
            automationId: '',
            role: extension_prompt_roles.SYSTEM,
            sticky: null,
            cooldown: null,
            delay: null,
            triggers: [],
            ignoreBudget: false,
        };
    });

    return outputObj;
}

/**
 * @param {object} characterBook - Character book data
 * @returns {{entries: Record<string, object>, originalData: object}} Converted WI data
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'characterBook' implicitly has an 'any' ...
export function convertCharacterBook(characterBook) {
    const result = { entries: {}, originalData: characterBook };

    // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
    characterBook.entries.forEach((entry, index) => {
        // Not in the spec, but this is needed to find the entry in the original data
        if (entry.id === undefined) {
            entry.id = index;
        }

        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre...
        result.entries[entry.id] = {
            ...newWorldInfoEntryTemplate,
            uid: entry.id,
            key: entry.keys,
            keysecondary: entry.secondary_keys || [],
            comment: entry.comment || '',
            content: entry.content,
            constant: entry.constant || false,
            selective: entry.selective || false,
            order: entry.insertion_order,
            position:
                entry.extensions?.position ??
                (entry.position === 'before_char'
                    ? world_info_position.before
                    : world_info_position.after),
            excludeRecursion: entry.extensions?.exclude_recursion ?? false,
            preventRecursion: entry.extensions?.prevent_recursion ?? false,
            delayUntilRecursion: entry.extensions?.delay_until_recursion ?? false,
            disable: !entry.enabled,
            addMemo: !!entry.comment,
            displayIndex: entry.extensions?.display_index ?? index,
            probability: entry.extensions?.probability ?? 100,
            useProbability: entry.extensions?.useProbability ?? true,
            depth: entry.extensions?.depth ?? DEFAULT_DEPTH,
            selectiveLogic: entry.extensions?.selectiveLogic ?? world_info_logic.AND_ANY,
            outletName: entry.extensions?.outlet_name ?? '',
            group: entry.extensions?.group ?? '',
            groupOverride: entry.extensions?.group_override ?? false,
            groupWeight: entry.extensions?.group_weight ?? DEFAULT_WEIGHT,
            scanDepth: entry.extensions?.scan_depth ?? null,
            caseSensitive: entry.extensions?.case_sensitive ?? null,
            matchWholeWords: entry.extensions?.match_whole_words ?? null,
            useGroupScoring: entry.extensions?.use_group_scoring ?? null,
            automationId: entry.extensions?.automation_id ?? '',
            role: entry.extensions?.role ?? extension_prompt_roles.SYSTEM,
            vectorized: entry.extensions?.vectorized ?? false,
            sticky: entry.extensions?.sticky ?? null,
            cooldown: entry.extensions?.cooldown ?? null,
            delay: entry.extensions?.delay ?? null,
            matchPersonaDescription: entry.extensions?.match_persona_description ?? false,
            matchCharacterDescription: entry.extensions?.match_character_description ?? false,
            matchCharacterPersonality: entry.extensions?.match_character_personality ?? false,
            matchCharacterDepthPrompt: entry.extensions?.match_character_depth_prompt ?? false,
            matchScenario: entry.extensions?.match_scenario ?? false,
            matchCreatorNotes: entry.extensions?.match_creator_notes ?? false,
            extensions: entry.extensions ?? {},
            triggers: entry.extensions?.triggers || [],
            ignoreBudget: entry.extensions?.ignore_budget ?? false,
        };
    });

    return result;
}

// ═══════════════════════════════════════════════════════════════
//  Book-level CRUD (moved from world-info.ts)
// ═══════════════════════════════════════════════════════════════

/**
 * @param {string} name - Current world info name
 * @param {object} data - World info data
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export async function renameWorldInfo(name, data) {
    const oldName = name;
    const newName = await Popup.show.input('Rename World Info', 'Enter a new name:', oldName);

    if (oldName === newName || !newName) {
        console.debug('World info rename cancelled');
        return;
    }
    if (equalsIgnoreCaseAndAccents(oldName, newName)) {
        notyf.warning(
            t`Name not accepted, as it is the same as before (ignoring case and accents).`,
            t`Rename World Info`,
        );
        return;
    }

    const entryPreviouslySelected = wiManager.selectedWorlds.findIndex((e) => e === oldName);

    // Migrate entries from old store to new store
    const oldStore = wiManager.getStore(oldName);
    await oldStore.init();
    const allEntries = await oldStore.getAllEntries();

    const newStore = wiManager.getStore(newName);
    await newStore.init();
    if (allEntries.length > 0) {
        await newStore.replaceAllEntries(allEntries);
    }

    // Save under new name and delete old
    await saveWorldInfo(newName, data, true);
    await deleteWorldInfo(oldName);

    // Release old store
    wiManager.releaseStore(oldName);

    await updateWorldInfoLinks(oldName, newName);

    if (entryPreviouslySelected !== -1) {
        const wiElement = getWIElement(newName);
        if (wiElement instanceof HTMLOptionElement) wiElement.selected = true;
        document
            .getElementById('world_info')
            ?.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const selectedIndex = wiManager.worldNames.indexOf(newName);
    if (selectedIndex !== -1) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        document.getElementById('world_editor_select').value = String(selectedIndex);
        document.getElementById('world_editor_select')!.dispatchEvent(new Event('change'));
    }
}

/**
 * Deletes a world info with the given name
 * @param {string} worldInfoName - The name of the world info to delete
 * @returns {Promise<boolean>} A promise that resolves to true if the world info was successfully deleted, false otherwise
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'worldInfoName' implicitly has an 'any' ... Remove this comment to see the full error message
export async function deleteWorldInfo(worldInfoName) {
    if (!wiManager.worldNames.includes(worldInfoName)) {
        return false;
    }

    const response = await fetch('/api/worldinfo/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ name: worldInfoName }),
    });

    if (!response.ok) {
        return false;
    }

    if (worldInfoCache.has(worldInfoName)) {
        worldInfoCache.delete(worldInfoName);
    }

    // Delete the IndexedDB database for this book, then release the store
    try {
        const store = wiManager.getStore(worldInfoName);
        await store.deleteDatabase();
    } catch (e) {
        console.debug('[WI] Failed to delete IndexedDB database for', worldInfoName, e);
    }
    wiManager.releaseStore(worldInfoName);

    const existingWorldIndex = wiManager.selectedWorlds.findIndex((e) => e === worldInfoName);
    if (existingWorldIndex !== -1) {
        wiManager.selectedWorlds.splice(existingWorldIndex, 1);
        saveSettingsNow();
    }

    await updateWorldInfoList();
    document
        .getElementById('world_editor_select')
        ?.dispatchEvent(new Event('change', { bubbles: true }));

    const charWorldEl = document.getElementById('character_world') as HTMLSelectElement | null;
    if (charWorldEl && charWorldEl.value === worldInfoName) {
        charWorldEl.value = '';
        document
            .getElementById('character_world')
            ?.dispatchEvent(new Event('change', { bubbles: true }));
        setWorldInfoButtonClass(undefined, false);
        if (menu_type != 'create') {
            saveCharacterDebounced();
        }
    }

    if (power_user.persona_description_lorebook === worldInfoName) {
        power_user.persona_description_lorebook = '';
        if (power_user.personas[user_avatar]) {
            const object = getOrCreatePersonaDescriptor();
            object.lorebook = '';
        }
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('persona_lore_button').classList.toggle('world_set', false);
        saveSettingsNow();
    }

    return true;
}

/**
 * Creates a new world info/lorebook with the given name.
 * Checks if a world with the same name already exists, providing a warning or optionally a user confirmation dialog.
 * @param {string} worldName - The name of the new world info
 * @param {object} options - Optional parameters
 * @param {boolean} [options.interactive] - Whether to show a confirmation dialog when overwriting an existing world
 * @returns {Promise<boolean>} - True if the world info was successfully created, false otherwise
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'worldName' implicitly has an 'any' type... Remove this comment to see the full error message
export async function createNewWorldInfo(worldName, { interactive = false } = {}) {
    if (!worldName) {
        return false;
    }

    const sanitizedWorldName = await getSanitizedFilename(worldName);

    const allowed = await checkOverwriteExistingData(
        'World Info',
        wiManager.worldNames,
        sanitizedWorldName,
        {
            interactive: interactive,
            actionName: 'Create',
            // @ts-expect-error TS(2322) FIXME: Type is not assignable.
            deleteAction: (existingName) => deleteWorldInfo(existingName),
        },
    );
    if (!allowed) {
        return false;
    }

    // Save directly to server — no IndexedDB needed for an empty book.
    // The store will be lazily created on first edit.
    await _save(worldName, { entries: {} });
    worldInfoCache.set(worldName, { entries: {} });
    await updateWorldInfoList();

    const selectedIndex = wiManager.worldNames.indexOf(worldName);
    if (selectedIndex !== -1) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        document.getElementById('world_editor_select').value = String(selectedIndex);
        // Sync the TomSelect display with the programmatic value change
        // @ts-expect-error TS(2339) FIXME: Property 'tomselect' does not exist on type 'HTMLElement'.
        document.getElementById('world_editor_select')?.tomselect?.setValue(String(selectedIndex));
        document
            .getElementById('world_editor_select')
            ?.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
        await hideWorldEditor();
    }

    return true;
}

/**
 * @param {boolean} [skipPopup] - Whether to skip the confirmation popup
 * @returns {Promise<void>}
 */
export async function importEmbeddedWorldInfo(skipPopup = false) {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const chid = document.getElementById('import_character_info').dataset.chid;

    if (chid === undefined || Number(chid) === -1) {
        return;
    }

    const hasEmbed = checkEmbeddedWorld(chid);

    if (!hasEmbed) {
        return;
    }

    const bookName =
        characters[Number(chid)]?.data?.character_book?.name ||
        `${characters[Number(chid)]?.name}'s Lorebook`;

    if (!skipPopup) {
        const confirmation = await Popup.show.confirm(
            t`Are you sure you want to import '${bookName}'?`,
            wiManager.worldNames.includes(bookName)
                ? t`It will overwrite the World/Lorebook with the same name.`
                : '',
        );
        if (!confirmation) {
            return;
        }
    }

    const convertedBook = convertCharacterBook(characters[Number(chid)].data.character_book);

    // Populate store with the imported entries
    const store = wiManager.getStore(bookName);
    await store.init();
    const entryList = Object.values(convertedBook.entries ?? {}) as WorldInfoEntryData[];
    if (entryList.length > 0) {
        await store.replaceAllEntries(entryList);
    }
    await saveWorldInfo(bookName, convertedBook, true);
    await updateWorldInfoList();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('character_world').value = bookName;
    document
        .getElementById('character_world')
        ?.dispatchEvent(new Event('change', { bubbles: true }));

    notyf.success(
        t`The world '${bookName}' has been imported and linked to the character successfully.`,
        t`World/Lorebook imported`,
    );

    const newIndex = wiManager.worldNames.indexOf(bookName);
    if (newIndex >= 0) {
        //show&draw the WI panel before..
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        document
            .getElementById('WIDrawerIcon')
            .dispatchEvent(new Event('click', { bubbles: true }));
        //..auto-opening the new imported WI
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        document.getElementById('world_editor_select').value = String(newIndex);
        document
            .getElementById('world_editor_select')
            ?.dispatchEvent(new Event('change', { bubbles: true }));
    }

    setWorldInfoButtonClass(chid, true);
}

/**
 * @param {object|string} file - File object to import
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'file' implicitly has an 'any' type.
export async function importWorldInfo(file) {
    if (!file) {
        return;
    }

    const formData = new FormData();
    formData.append('avatar', file);

    try {
        let jsonData;

        if (file.name.endsWith('.png')) {
            // @ts-expect-error TS(2769) FIXME: No overload matches this call.
            const buffer = new Uint8Array(await getFileBuffer(file));
            jsonData = extractDataFromPng(buffer, 'naidata');
        } else {
            // File should be a JSON file
            jsonData = await parseJsonFile(file);
        }

        if (jsonData === undefined || jsonData === null) {
            notyf.error(t`File is not valid: ${file.name}`);
            return;
        }

        // Convert Novel Lorebook
        if (jsonData.lorebookVersion !== undefined) {
            console.log('Converting Novel Lorebook');
            formData.append('convertedData', JSON.stringify(convertNovelLorebook(jsonData)));
        }

        // Convert Agnai Memory Book
        if (jsonData.kind === 'memory') {
            console.log('Converting Agnai Memory Book');
            formData.append('convertedData', JSON.stringify(convertAgnaiMemoryBook(jsonData)));
        }

        // Convert Risu Lorebook
        if (jsonData.type === 'risu') {
            console.log('Converting Risu Lorebook');
            formData.append('convertedData', JSON.stringify(convertRisuLorebook(jsonData)));
        }
    } catch (error) {
        notyf.error(`Error parsing file: ${error}`);
        return;
    }

    const worldName = file.name.substr(0, file.name.lastIndexOf('.'));
    const sanitizedWorldName = await getSanitizedFilename(worldName);
    const allowed = await checkOverwriteExistingData(
        'World Info',
        wiManager.worldNames,
        sanitizedWorldName,
        {
            interactive: true,
            actionName: 'Import',
            // @ts-expect-error TS(2322) FIXME: Type is not assignable.
            deleteAction: (existingName) => deleteWorldInfo(existingName),
        },
    );
    if (!allowed) {
        return false;
    }

    try {
        const result = await fetch('/api/worldinfo/import', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
            body: formData,
            cache: 'no-cache',
        });

        if (!result.ok) {
            throw new Error(`Failed to import world info: ${result.statusText}`);
        }

        const data = await result.json();

        if (data.name) {
            await updateWorldInfoList();

            const newIndex = wiManager.worldNames.indexOf(data.name);
            if (newIndex >= 0) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                document.getElementById('world_editor_select').value = String(newIndex);
                // Sync the TomSelect display with the programmatic value change
                document
                    .getElementById('world_editor_select')
                    // @ts-expect-error TS(2551) FIXME: Property does not exist.
                    ?.tomselect?.setValue(String(newIndex));
                document
                    .getElementById('world_editor_select')
                    ?.dispatchEvent(new Event('change', { bubbles: true }));
            }

            notyf.success(t`World Info "${data.name}" imported successfully!`);
        }
    } catch (error) {
        console.error('Error importing world info:', error);
        notyf.error(t`Failed to import World Info`);
    }
}

/**
 * Moves a World Info entry from a source lorebook to a target lorebook.
 * @param {string} sourceName - The name of the source lorebook file.
 * @param {string} targetName - The name of the target lorebook file.
 * @param {string|number} uid - The UID of the entry to move from the source lorebook.
 * @param {object} options - Additional options for the move operation.
 * @param {boolean} [options.deleteOriginal] - Whether to delete the original entry from the source lorebook after moving it.
 * @returns {Promise<boolean>} True if the move was successful, false otherwise.
 */
export async function moveWorldInfoEntry(
    // @ts-expect-error TS(7006) FIXME: Parameter 'sourceName' implicitly has an 'any' type.
    sourceName,
    // @ts-expect-error TS(7006) FIXME: Parameter 'targetName' implicitly has an 'any' type.
    targetName,
    // @ts-expect-error TS(7006) FIXME: Parameter 'uid' implicitly has an 'any' type.
    uid,
    { deleteOriginal = true } = {},
) {
    if (sourceName === targetName) {
        return false;
    }

    if (!wiManager.worldNames.includes(sourceName)) {
        notyf.error(t`Source lorebook '${sourceName}' not found.`);
        console.error(`[WI Move] Source lorebook '${sourceName}' does not exist.`);
        return false;
    }

    if (!wiManager.worldNames.includes(targetName)) {
        notyf.error(t`Target lorebook '${targetName}' not found.`);
        console.error(`[WI Move] Target lorebook '${targetName}' does not exist.`);
        return false;
    }

    const entryUidString = String(uid);

    try {
        // Load both books into their stores
        const sourceBook = await wiManager.loadBookIntoStore(sourceName);
        const targetBook = await wiManager.loadBookIntoStore(targetName);

        if (!sourceBook || !sourceBook.entries) {
            notyf.error(t`Failed to load data for source lorebook '${sourceName}'.`);
            console.error(`[WI Move] Could not load source data for '${sourceName}'.`);
            return false;
        }
        if (!targetBook || !targetBook.entries) {
            notyf.error(t`Failed to load data for target lorebook '${targetName}'.`);
            console.error(`[WI Move] Could not load target data for '${targetName}'.`);
            return false;
        }

        const sourceStore = wiManager.getStore(sourceName);
        const targetStore = wiManager.getStore(targetName);

        const sourceEntry = await sourceStore.getEntry(Number(uid));
        if (!sourceEntry) {
            notyf.error(t`Entry not found in source lorebook '${sourceName}'.`);
            console.error(`[WI Move] Entry UID ${entryUidString} not found in '${sourceName}'.`);
            return false;
        }

        const entryToMove = structuredClone(sourceEntry);

        const newUid = await targetStore.getFreeUid();
        if (newUid === null) {
            console.error(`[WI Move] Failed to get a free UID in '${targetName}'.`);
            return false;
        }

        entryToMove.uid = newUid;
        // Place the entry at the end of the target lorebook
        const allTarget = await targetStore.getAllEntries();
        const maxDisplayIndex = allTarget.reduce(
            (max, entry) => Math.max(max, entry.displayIndex ?? -1),
            -1,
        );
        entryToMove.displayIndex = maxDisplayIndex + 1;

        await targetStore.addEntry(entryToMove);
        targetBook.entries[newUid] = entryToMove;

        if (deleteOriginal) {
            await sourceStore.removeEntry(Number(uid));
            delete sourceBook.entries[entryUidString];
            // Remove from originalData if it exists
            deleteWIOriginalDataValue(sourceBook, entryUidString);
            console.debug(
                `[WI Move] Removed entry UID ${entryUidString} from source '${sourceName}'.`,
            );
        }

        // Persist both books via their stores
        await saveWorldInfo(targetName, targetBook, true);
        console.debug(`[WI Move] Saved target lorebook '${targetName}'.`);
        await saveWorldInfo(sourceName, sourceBook, true);
        console.debug(`[WI Move] Saved source lorebook '${sourceName}'.`);

        console.log(
            `[WI Move] ${entryToMove.comment} ${deleteOriginal ? 'moved' : 'copied'} successfully to '${targetName}'.`,
        );

        // Check if the currently viewed book in the editor is the source or target and reload it
        const currentEditorBookIndex = Number(
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null' or 'undefined'.
            (document.getElementById('world_editor_select').value = String()),
        );
        if (!isNaN(currentEditorBookIndex)) {
            const currentEditorBookName = wiManager.worldNames[currentEditorBookIndex];
            if (
                currentEditorBookName &&
                (currentEditorBookName === sourceName || currentEditorBookName === targetName)
            ) {
                reloadEditor(currentEditorBookName);
            }
        }

        notyf.success(
            deleteOriginal
                ? t`Entry moved successfully from '${sourceName}' to '${targetName}'.`
                : t`Entry copied successfully to '${targetName}'.`,
        );

        return true;
    } catch (error) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        notyf.error(t`An unexpected error occurred while moving the entry: ${error.message}`);
        console.error('[WI Move] Unexpected error:', error);
        return false;
    }
}
