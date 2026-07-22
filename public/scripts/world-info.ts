
declare const TomSelect: unknown;

declare const Sortable: unknown;

import { saveSettings, getRequestHeaders, chat_metadata, this_chid, characters, saveCharacterDebounced, menu_type, eventSource, event_types, saveMetadata, getCurrentChatId, extension_prompt_roles, create_save, createOrEditCharacter, getOneCharacter, select_selected_character, setPersonaDescription } from '../script.js';
import { download, debounce, initScrollHeight, resetScrollHeight, getCharaFilename, getSortableDelay, navigation_option, waitUntilCondition, isTrueBoolean, flashHighlight, select2ModifyOptions, getSelect2OptionId, highlightRegex, select2ChoiceClickSubscribe, normalizeArray, addLongPressEvent, createPaginator } from './utils.js';
import { getContext } from './extensions.js';
import { isMobile } from './RossAscends-mods.js';
import { FILTER_TYPES, FilterHelper } from './filters.js';
import { getTokenCountAsync } from './tokenizers.js';
import { power_user } from './power-user.js';
import { debounce_timeout } from './constants.js';
import { callGenericPopup, Popup, POPUP_RESULT, POPUP_TYPE } from './popup.js';
import { renderTemplateAsync } from './templates.js';
import { t } from './i18n.js';
import { accountStorage } from './util/AccountStorage.js';
import type { WorldInfoEntryData, WorldInfoBook } from './world-info/types.js';

// ── Re-exported types & constants ──
export type {
    WIGlobalScanData,
    WIScanEntry,
    WITimedEffect,
    TimedEffectType,
    WIPromptResult,
    WIActivated,
    WIEntryFieldDefinition,
    WorldInfoSettings,
    WorldInfoEntryData,
    WorldInfoBook,
} from './world-info/types.js';

import {
    world_info_insertion_strategy,
    world_info_logic,
    world_info_position,
    MAX_SCAN_DEPTH,
    MAX_COMMENT_LENGTH,
    SORT_ORDER_KEY,
    METADATA_KEY,
    originalWIDataKeyMap,
} from './world-info/constants.js';

import { wiManager } from './world-info/manager.js';

// ── Engine imports ──
import {
    WorldInfoBuffer,
    isValidRegex,
    loadWorldInfo,
    getSortedEntries,
} from './world-info/engine.js';

// Re-export scanning pipeline functions for external consumers
export { worldInfoCache, getWorldInfoPrompt, loadWorldInfo, getSortedEntries, checkWorldInfo } from './world-info/engine.js';

// ── Editor imports ──
import {
    WI_ENTRY_HEADER_TEMPLATE,
    WI_ENTRY_EDIT_TEMPLATE,
    nullWorldInfo,
    updateWorldEntryKeyOptionsCache,
    clearEntryList,
    setWIOriginalDataValue,
    deleteWIOriginalDataValue,
} from './world-info/editor.js';

// ── Slash command registrations ──
import { registerWorldInfoSlashCommands } from './world-info/commands.js';

// ── Data layer imports ──
import {
    saveWorldInfo,
    saveSettingsNow,
    newWorldInfoEntryTemplate,
    createWorldInfoEntry,
    duplicateWorldInfoEntry,
    deleteWorldInfoEntry,
    renameWorldInfo,
    deleteWorldInfo,
    createNewWorldInfo,
    importEmbeddedWorldInfo,
    importWorldInfo,
    moveWorldInfoEntry,
} from './world-info/data.js';

// Re-export data layer for backward compatibility
export {
    saveWorldInfo,
    saveSettingsNow,
    getFreeWorldEntryUid,
    newWorldInfoEntryDefinition,
    newWorldInfoEntryTemplate,
    createWorldInfoEntry,
    duplicateWorldInfoEntry,
    deleteWorldInfoEntry,
    convertAgnaiMemoryBook,
    convertRisuLorebook,
    convertNovelLorebook,
    convertCharacterBook,
    renameWorldInfo,
    deleteWorldInfo,
    createNewWorldInfo,
    importEmbeddedWorldInfo,
    importWorldInfo,
    moveWorldInfoEntry,
} from './world-info/data.js';

export {
    world_info_insertion_strategy,
    world_info_logic,
    scan_state,
    world_info_position,
    wi_anchor_position,
    DEFAULT_DEPTH,
    DEFAULT_WEIGHT,
    MAX_SCAN_DEPTH,
    MAX_COMMENT_LENGTH,
    SORT_ORDER_KEY,
    METADATA_KEY,
    KNOWN_DECORATORS,
    defaultGlobalScanData,
    originalWIDataKeyMap,
} from './world-info/constants.js';



export const world_info = {};
export const selected_world_info = [];
/** @type {string[]} */
export let world_names: unknown;
export const world_info_depth = 2;
export const world_info_min_activations = 0; // if > 0, will continue seeking chat until minimum world infos are activated
export const world_info_min_activations_depth_max = 0; // used when (world_info_min_activations > 0)

export const world_info_budget = 25;
export const world_info_include_names = true;
export const world_info_recursive = false;
export const world_info_overflow_alert = false;
export const world_info_case_sensitive = false;
export const world_info_match_whole_words = false;
export const world_info_use_group_scoring = false;
export const world_info_character_strategy = world_info_insertion_strategy.character_first;
export const world_info_budget_cap = 0;
export const world_info_max_recursion_steps = 0;
let updateEditor: (navigation: unknown, flashOnNav?: boolean) => void = (navigation: unknown, flashOnNav = true) => { console.debug('Triggered WI navigation', navigation, flashOnNav); };

// Do not optimize. updateEditor is a function that is updated by the displayWorldEntries with new data.
export const worldInfoFilter: FilterHelper = new FilterHelper(() => { updateEditor(navigation_option.none); });

// Typedef area
/**
 * @typedef {object} WIGlobalScanData The chat-independent data to be scanned. Each of
 *     these fields can be enabled for scanning per entry.
 * @property {string} personaDescription User persona description
 * @property {string} characterDescription Character description
 * @property {string} characterPersonality Character personality
 * @property {string} characterDepthPrompt Character depth prompt (sometimes referred to as character notes)
 * @property {string} scenario Character defined scenario
 * @property {string} creatorNotes Character creator notes
 * @property {string} trigger The type that triggered the scan, e.g. 'normal', 'continue', etc.
 */

/**
 * @typedef {object} WIScanEntry The entry that triggered the scan
 * @property {number} [scanDepth] The depth of the scan
 * @property {boolean} [caseSensitive] If the scan is case sensitive
 * @property {boolean} [matchWholeWords] If the scan should match whole words
 * @property {boolean} [useGroupScoring] If the scan should use group scoring
 * @property {boolean} [matchPersonaDescription] If the scan should match against the persona description
 * @property {boolean} [matchCharacterDescription] If the scan should match against the character description
 * @property {boolean} [matchCharacterPersonality] If the scan should match against the character personality
 * @property {boolean} [matchCharacterDepthPrompt] If the scan should match against the character depth prompt
 * @property {boolean} [matchScenario] If the scan should match against the character scenario
 * @property {boolean} [matchCreatorNotes] If the scan should match against the creator notes
 * @property {number} [uid] The UID of the entry that triggered the scan
 * @property {string} [world] The world info book of origin of the entry
 * @property {string[]} [key] The primary keys to scan for
 * @property {string[]} [keysecondary] The secondary keys to scan for
 * @property {number} [selectiveLogic] The logic to use for selective activation
 * @property {number} [sticky] The sticky value of the entry
 * @property {number} [cooldown] The cooldown of the entry
 * @property {number} [delay] The delay of the entry
 * @property {string[]} [decorators] Array of decorators for the entry
 * @property {number} [hash] The hash of the entry
 */

/**
 * @typedef {object} WITimedEffect Timed effect for world info
 * @property {number} hash Hash of the entry that triggered the effect
 * @property {number} start The chat index where the effect starts
 * @property {number} end The chat index where the effect ends
 * @property {boolean} protected The protected effect can't be removed if the chat does not advance
 */

/**
 * @typedef TimedEffectType Type of timed effect
 * @type {'sticky'|'cooldown'|'delay'}
 */

/**
 * @typedef {object} WIPromptResult
 * @property {string} worldInfoString - Complete world info string
 * @property {string} worldInfoBefore - World info that goes before the prompt
 * @property {string} worldInfoAfter - World info that goes after the prompt
 * @property {Array} worldInfoExamples - Array of example entries
 * @property {Array} worldInfoDepth - Array of depth entries
 * @property {Array} anBefore - Array of entries before Author's Note
 * @property {Array} anAfter - Array of entries after Author's Note
 * @property {{[key: string]: string[]}} outletEntries - Array of entries to be added to an outlet
 */

/**
 * @typedef {object} WIActivated
 * @property {string} worldInfoBefore The world info before the chat.
 * @property {string} worldInfoAfter The world info after the chat.
 * @property {object[]} EMEntries The entries for examples.
 * @property {object[]} WIDepthEntries The depth entries.
 * @property {object[]} ANBeforeEntries The entries before Author's Note.
 * @property {object[]} ANAfterEntries The entries after Author's Note.
 * @property {{[key: string]: string[]}} outletEntries - Array of entries to be added to an outlet
 * @property {Set<object>} allActivatedEntries All entries.
 */

/**
 * @typedef {object} WIEntryFieldDefinition
 * @property {string|number|boolean|null} default - Default value for the field
 * @property {string} type - Type of the field, can be 'string', 'number', 'boolean', 'array', 'enum'
 * @property {boolean} [excludeFromTemplate=false] - Whether to exclude this field from the template
 * @property {(value: unknown) => boolean} [arrayFilter] - Optional filter function for array fields to filter out unwanted values
 */
// End typedef area

/** @type {Readonly<WIGlobalScanData>} */
// defaultGlobalScanData is imported from ./world-info/constants.js

/**
 * @returns {WorldInfoSettings} The current world info settings
 */
export function getWorldInfoSettings() {
    return {
        world_info: wiManager.info,
        world_info_depth: wiManager.depth,
        world_info_min_activations: wiManager.minActivations,
        world_info_min_activations_depth_max: wiManager.minActivationsDepthMax,
        world_info_budget: wiManager.budget,
        world_info_include_names: wiManager.includeNames,
        world_info_recursive: wiManager.recursive,
        world_info_overflow_alert: wiManager.overflowAlert,
        world_info_case_sensitive: wiManager.caseSensitive,
        world_info_match_whole_words: wiManager.matchWholeWords,
        world_info_character_strategy: wiManager.characterStrategy,
        world_info_budget_cap: wiManager.budgetCap,
        world_info_use_group_scoring: wiManager.useGroupScoring,
        world_info_max_recursion_steps: wiManager.maxRecursionSteps,
    };
}

/**
 * Updates the world info settings.
 * @param {WorldInfoSettings} settings - Settings object
 * @param {string[]} [activeWorldInfo] - Optional array of active world info names
 */
export function updateWorldInfoSettings(settings: Record<string, unknown>, activeWorldInfo: string[] | undefined) {
    console.debug('[WI] Updating world info settings', settings, activeWorldInfo);

    /** @type {Record<keyof WorldInfoSettings, (value: unknown) => void>} */
    const fields: Record<string, (value: unknown) => void> = {
        world_info_depth: (value: unknown) => wiManager.depth = Number(value),
        world_info_min_activations: (value: unknown) => wiManager.minActivations = Number(value),
        world_info_min_activations_depth_max: (value: unknown) => wiManager.minActivationsDepthMax = Number(value),
        world_info_budget: (value: unknown) => wiManager.budget = Number(value),
        world_info_include_names: (value: unknown) => wiManager.includeNames = Boolean(value),
        world_info_recursive: (value: unknown) => wiManager.recursive = Boolean(value),
        world_info_overflow_alert: (value: unknown) => wiManager.overflowAlert = Boolean(value),
        world_info_case_sensitive: (value: unknown) => wiManager.caseSensitive = Boolean(value),
        world_info_match_whole_words: (value: unknown) => wiManager.matchWholeWords = Boolean(value),
        world_info_character_strategy: (value: unknown) => wiManager.characterStrategy = Number(value),
        world_info_budget_cap: (value: unknown) => wiManager.budgetCap = Number(value),
        world_info_use_group_scoring: (value: unknown) => wiManager.useGroupScoring = Boolean(value),
        world_info_max_recursion_steps: (value: unknown) => wiManager.maxRecursionSteps = Number(value),
        // Unused
        world_info: (_value: unknown) => { },
    };

    for (const [key, setter] of Object.entries(fields)) {
        if (Object.hasOwn(settings, key)) {
            setter(settings[key]);
        }
    }

    if (Array.isArray(activeWorldInfo)) {
        delete settings.world_info;
        wiManager.selectedWorlds = activeWorldInfo as string[];
    }

    saveSettingsNow();
}

/**
 * @param {WorldInfoSettings} settings - Settings object
 * @param {object} data - Data object
 * @returns {void}
 */
export function setWorldInfoSettings(settings: Record<string, unknown>, data: Record<string, unknown>) {
    if (settings.world_info_depth !== undefined)
        wiManager.depth = Number(settings.world_info_depth);
    if (settings.world_info_min_activations !== undefined)
        wiManager.minActivations = Number(settings.world_info_min_activations);
    if (settings.world_info_min_activations_depth_max !== undefined)
        wiManager.minActivationsDepthMax = Number(settings.world_info_min_activations_depth_max);
    if (settings.world_info_budget !== undefined)
        wiManager.budget = Number(settings.world_info_budget);
    if (settings.world_info_include_names !== undefined)
        wiManager.includeNames = Boolean(settings.world_info_include_names);
    if (settings.world_info_recursive !== undefined)
        wiManager.recursive = Boolean(settings.world_info_recursive);
    if (settings.world_info_overflow_alert !== undefined)
        wiManager.overflowAlert = Boolean(settings.world_info_overflow_alert);
    if (settings.world_info_case_sensitive !== undefined)
        wiManager.caseSensitive = Boolean(settings.world_info_case_sensitive);
    if (settings.world_info_match_whole_words !== undefined)
        wiManager.matchWholeWords = Boolean(settings.world_info_match_whole_words);
    if (settings.world_info_character_strategy !== undefined)
        wiManager.characterStrategy = Number(settings.world_info_character_strategy);
    if (settings.world_info_budget_cap !== undefined)
        wiManager.budgetCap = Number(settings.world_info_budget_cap);
    if (settings.world_info_use_group_scoring !== undefined)
        wiManager.useGroupScoring = Boolean(settings.world_info_use_group_scoring);
    if (settings.world_info_max_recursion_steps !== undefined)
        wiManager.maxRecursionSteps = Number(settings.world_info_max_recursion_steps);

    // Migrate old settings
    if (wiManager.budget > 100) {
        wiManager.budget = 25;
    }

    if (wiManager.useGroupScoring === undefined) {
        wiManager.useGroupScoring = false;
    }

    // Reset selected world from old string and delete old keys
    // TODO: Remove next release
    const existingWorldInfo = settings.world_info;
    if (typeof existingWorldInfo === 'string') {
        delete settings.world_info;
        wiManager.selectedWorlds = [existingWorldInfo];
    } else if (Array.isArray(existingWorldInfo)) {
        delete settings.world_info;
        wiManager.selectedWorlds = existingWorldInfo;
    }

    wiManager.info = (settings.world_info ?? {}) as Record<string, unknown>;

    /**
     * Syncs an input or checkbox from the manager — collapses 11 nearly-identical blocks
     * @param id
     * @param value
     */
    function sync(id: string, value: string | boolean) {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (!el) return;
        if (typeof value === 'boolean') el.checked = value;
        else el.value = value;
    }

    sync('world_info_depth_counter', String(wiManager.depth));
    sync('world_info_depth', String(wiManager.depth));
    sync('world_info_min_activations_counter', String(wiManager.minActivations));
    sync('world_info_min_activations', String(wiManager.minActivations));
    sync('world_info_min_activations_depth_max_counter', String(wiManager.minActivationsDepthMax));
    sync('world_info_min_activations_depth_max', String(wiManager.minActivationsDepthMax));
    sync('world_info_budget_counter', String(wiManager.budget));
    sync('world_info_budget', String(wiManager.budget));
    sync('world_info_include_names', wiManager.includeNames);
    sync('world_info_recursive', wiManager.recursive);
    sync('world_info_overflow_alert', wiManager.overflowAlert);
    sync('world_info_case_sensitive', wiManager.caseSensitive);
    sync('world_info_match_whole_words', wiManager.matchWholeWords);
    sync('world_info_use_group_scoring', wiManager.useGroupScoring);
    sync('world_info_budget_cap', String(wiManager.budgetCap));
    sync('world_info_budget_cap_counter', String(wiManager.budgetCap));
    sync('world_info_max_recursion_steps', String(wiManager.maxRecursionSteps));
    sync('world_info_max_recursion_steps_counter', String(wiManager.maxRecursionSteps));

    const worldInfoCharStrategy = document.getElementById('world_info_character_strategy') as HTMLSelectElement | null;
    const strategyOption = worldInfoCharStrategy?.querySelector(`option[value='${wiManager.characterStrategy}']`) as HTMLOptionElement | null;
    if (strategyOption) strategyOption.selected = true;
    if (worldInfoCharStrategy) worldInfoCharStrategy.value = String(wiManager.characterStrategy);

    const worldInfoBudgetCap = document.getElementById('world_info_budget_cap') as HTMLInputElement | null;
    if (worldInfoBudgetCap) worldInfoBudgetCap.value = String(wiManager.budgetCap);
    const worldInfoBudgetCapCounter = document.getElementById('world_info_budget_cap_counter') as HTMLInputElement | null;
    if (worldInfoBudgetCapCounter) worldInfoBudgetCapCounter.value = String(wiManager.budgetCap);

    const worldInfoMaxRecursionSteps = document.getElementById('world_info_max_recursion_steps') as HTMLInputElement | null;
    if (worldInfoMaxRecursionSteps) worldInfoMaxRecursionSteps.value = String(wiManager.maxRecursionSteps);
    const worldInfoMaxRecursionStepsCounter = document.getElementById('world_info_max_recursion_steps_counter') as HTMLInputElement | null;
    if (worldInfoMaxRecursionStepsCounter) worldInfoMaxRecursionStepsCounter.value = String(wiManager.maxRecursionSteps);

    wiManager.worldNames = (data.world_names as string[])?.length ? data.world_names as string[] : [];

    // Add to existing selected WI if it exists
    wiManager.selectedWorlds = wiManager.selectedWorlds.concat(((settings.world_info as Record<string, unknown>)?.globalSelect as unknown[])?.filter((e: unknown) => wiManager.worldNames.includes(e as string)) as string[] ?? []);

    if (wiManager.worldNames.length > 0) {
        const worldInfoEl = document.getElementById('world_info');
        if (worldInfoEl) worldInfoEl.innerHTML = '';
    }

    wiManager.worldNames.forEach((item, i) => {
        const worldInfoEl = document.getElementById('world_info');
        if (worldInfoEl) worldInfoEl.insertAdjacentHTML('beforeend', `<option value='${i}'${wiManager.selectedWorlds.includes(item) ? ' selected' : ''}>${item}</option>`);
        const worldEditorSelect = document.getElementById('world_editor_select');
        if (worldEditorSelect) worldEditorSelect.insertAdjacentHTML('beforeend', `<option value='${i}'>${item}</option>`);
    });

    const worldInfoSortOrder = document.getElementById('world_info_sort_order') as HTMLSelectElement | null;
    if (worldInfoSortOrder) worldInfoSortOrder.value = accountStorage.getItem(SORT_ORDER_KEY) || '0';
    document.getElementById('world_info')!.dispatchEvent(new Event('change'));
    document.getElementById('world_editor_select')!.dispatchEvent(new Event('change'));

    eventSource.on(event_types.CHAT_CHANGED, async () => {
        // Pre-cache the world info data for the chat for quicker first prompt generation
        await getSortedEntries();
    });

    eventSource.on(event_types.WORLDINFO_FORCE_ACTIVATE, (entries: Record<string, unknown>[]) => {
        for (const entry of entries) {
            if (!Object.hasOwn(entry, 'world') || !Object.hasOwn(entry, 'uid')) {
                console.error('[WI] WORLDINFO_FORCE_ACTIVATE requires all entries to have both world and uid fields, entry IGNORED', entry);
            } else {
                WorldInfoBuffer.externalActivations.set(`${entry.world as string}.${entry.uid as string}`, entry);
                console.log('[WI] WORLDINFO_FORCE_ACTIVATE added entry', entry);
            }
        }
    });

    // Add slash commands
    registerWorldInfoSlashCommands({
        onWorldInfoChange,
        setWorldInfoButtonClass,
        charUpdateAddAuxWorld,
        charUpdatePrimaryWorld,
        reloadEditor,
        setPersonaDescription,
    });
}

/**
 * Reloads the editor with the specified world info file
 * @param {string} file - The file to load in the editor
 * @param {boolean} [loadIfNotSelected] - Indicates whether to load the file even if it's not currently selected
 */
export function reloadEditor(file: string, loadIfNotSelected = false) {
    const worldEditorSelect = document.getElementById('world_editor_select') as HTMLSelectElement | null;
    const currentIndex = Number(worldEditorSelect?.value);
    const selectedIndex = wiManager.worldNames.indexOf(file);
    if (selectedIndex !== -1 && (loadIfNotSelected || currentIndex === selectedIndex)) {
        if (worldEditorSelect) worldEditorSelect.value = String(selectedIndex);
        document.getElementById('world_editor_select')!.dispatchEvent(new Event('change'));
    }
}



/**
 * Loads the given world into the World Editor.
 * @param {string} name - The name of the world
 * @returns {Promise<void>} A promise that resolves when the world editor is loaded
 */
export async function showWorldEditor(name: string) {
    if (!name) {
        await hideWorldEditor();
        return;
    }

    const wiData = await loadWorldInfo(name) as WorldInfoBook;
    await displayWorldEntries(name, wiData);
}

/**
 *
 */
export async function updateWorldInfoList() {
    const result = await fetch('/api/settings/get', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({}),
    });

    if (result.ok) {
        const data = await result.json();
        const editorSelect = document.getElementById('world_editor_select') as HTMLSelectElement | null;
        const editorOption = editorSelect?.options[editorSelect.selectedIndex];
        const editorSelected = editorOption ? String(editorOption.text) : '';
        wiManager.worldNames = data.world_names?.length ? data.world_names : [];
        document.getElementById('world_info')!.querySelectorAll('option:not([value=""])').forEach(el => el.remove());
        document.getElementById('world_editor_select')!.querySelectorAll('option:not([value=""])').forEach(el => el.remove());

        wiManager.worldNames.forEach((item, i) => {
            const globalListOption = new Option(item, i.toString());
            globalListOption.selected = wiManager.selectedWorlds.includes(item);
            const editorListOption = new Option(item, i.toString());
            editorListOption.selected = editorSelected === item;
            const worldInfoEl = document.getElementById('world_info');
            if (worldInfoEl) worldInfoEl.appendChild(globalListOption);
            const worldEditorSelect = document.getElementById('world_editor_select');
            if (worldEditorSelect) worldEditorSelect.appendChild(editorListOption);
        });

        // Sync TomSelect instances with the updated options (they don't detect DOM changes automatically)
        const wiSelect = document.getElementById('world_info') as unknown as Record<string, unknown>;
        const wiTomSelect = wiSelect?.tomselect as Record<string, unknown> | undefined;
        if (wiTomSelect) {
            (wiTomSelect.clearOptions as () => void)();
            Array.from((wiSelect as Record<string, unknown>).options as unknown[]).forEach((o: unknown) => (wiTomSelect.addOption as (opt: Record<string, unknown>) => void)({ value: (o as Record<string, unknown>).value as string, text: (o as Record<string, unknown>).text as string }));
            (wiTomSelect.setValue as (v: string) => void)(Array.from((wiSelect as Record<string, unknown>).selectedOptions as unknown[]).map((o: unknown) => (o as Record<string, unknown>).value as string).join(','));
        }
        const editorTs = document.getElementById('world_editor_select') as unknown as Record<string, unknown>;
        const editorTsTs = editorTs?.tomselect as Record<string, unknown> | undefined;
        if (editorTsTs) {
            (editorTsTs.clearOptions as () => void)();
            Array.from((editorTs as Record<string, unknown>).options as unknown[]).forEach((o: unknown) => (editorTsTs.addOption as (opt: Record<string, unknown>) => void)({ value: (o as Record<string, unknown>).value as string, text: (o as Record<string, unknown>).text as string }));
            (editorTsTs.setValue as (v: string) => void)((editorTs.value as string) || '');
        }
    }
}

/**
 * @returns {Promise<void>}
 */
export async function hideWorldEditor() {
    await displayWorldEntries(null as unknown as string, null as unknown as WorldInfoBook);
}

/**
 * @param {string} name - World info name to find
 * @returns {JQuery<HTMLElement>} The matching element
 */
export function getWIElement(name: string) {
    const children = Array.from(document.getElementById('world_info')?.children ?? []);
    const wiElement = children.find(function (child) {
        return child.textContent?.toLowerCase() === (name as string).toLowerCase();
    });

    return wiElement;
}

/**
 * Adds missing fields to WI entries that are present in the entry template, but not in the data.
 * Additionally verify that array/object fields are of the expected type.
 * @param {object[]} data WI entries
 * @returns {object[]} Data with backfilled fields
 */
function addMissingWorldInfoFields(data: WorldInfoEntryData[]) {
    data.forEach((entry: WorldInfoEntryData) => {
        const entryRec = entry as unknown as Record<string, unknown>;
        // Add missing fields from the template
        Object.entries(newWorldInfoEntryTemplate).forEach(([key, value]) => {
            if (!Object.hasOwn(entryRec, key)) {
                entryRec[key] = structuredClone(value);
            }
        });

        // Ensure that the key is always an array
        if (!Array.isArray(entry.key)) {
            console.debug('[WI] Fixing invalid "key" field for entry', entry);
            (entry as unknown as Record<string, unknown>).key = [];
        }

        // Ensure that the keysecondary is always an array
        if (!Array.isArray(entry.keysecondary)) {
            console.debug('[WI] Fixing invalid "keysecondary" field for entry', entry);
            (entry as unknown as Record<string, unknown>).keysecondary = [];
        }

        // Ensure that the characterFilter is an object with the expected structure
        if (!entryRec.characterFilter || typeof entryRec.characterFilter !== 'object' || Array.isArray(entryRec.characterFilter)) {
            entryRec.characterFilter = {
                isExclude: false,
                names: [],
                tags: [],
            };
        }
    });

    return data;
}

/**
 * Sorts the given data based on the selected sort option
 * @param {object[]} data WI entries
 * @param {object} [options] - Optional arguments
 * @param {{sortField?: string, sortOrder?: string, sortRule?: string}} [options.customSort] - Custom sort options, instead of the chosen UI sort
 * @returns {object[]} Sorted data
 */
export function sortWorldInfoEntries(data: WorldInfoEntryData[], { customSort = null }: { customSort?: { sortField?: string; sortOrder?: string; sortRule?: string } | null } = {}) {
    const sortOrderEl = document.getElementById('world_info_sort_order') as HTMLSelectElement | null;
    const option = sortOrderEl?.options[sortOrderEl.selectedIndex];
    const sortField = customSort?.sortField ?? option?.dataset?.field;
    const sortOrder = customSort?.sortOrder ?? option?.dataset?.order;
    const sortRule = customSort?.sortRule ?? option?.dataset?.rule;
    const orderSign = sortOrder === 'asc' ? 1 : -1;

    if (!data.length) return data;

    /** @type {(a: object, b: object) => number} */
    let primarySort: unknown;

    // Secondary and tertiary it will always be sorted by Order descending, and last UID ascending
    // This is the most sensible approach for sorts where the primary sort has a lot of equal values
    const secondarySort = (a: WorldInfoEntryData, b: WorldInfoEntryData) => b.order - a.order;
    const tertiarySort = (a: WorldInfoEntryData, b: WorldInfoEntryData) => a.uid - b.uid;

    // If we have a search term for WI, we are sorting by weighting scores
    const castEntry = (e: WorldInfoEntryData) => e as unknown as Record<string, unknown>;
    if (sortRule === 'search') {
        primarySort = (a: WorldInfoEntryData, b: WorldInfoEntryData) => {
            const aScore = worldInfoFilter.getScore(FILTER_TYPES.WORLD_INFO_SEARCH, a.uid);
            const bScore = worldInfoFilter.getScore(FILTER_TYPES.WORLD_INFO_SEARCH, b.uid);
            return (aScore ?? 0) - (bScore ?? 0);
        };
    } else if (sortRule === 'custom') {
        // First by display index
        primarySort = (a: WorldInfoEntryData, b: WorldInfoEntryData) => {
            const aValue = a.displayIndex ?? 0;
            const bValue = b.displayIndex ?? 0;
            return aValue - bValue;
        };
    } else if (sortRule === 'priority') {
        // First constant, then normal, then disabled.
        primarySort = (a: WorldInfoEntryData, b: WorldInfoEntryData) => {
            const aValue = a.disable ? 2 : a.constant ? 0 : 1;
            const bValue = b.disable ? 2 : b.constant ? 0 : 1;
            return aValue - bValue;
        };
    } else {
        primarySort = (a: WorldInfoEntryData, b: WorldInfoEntryData) => {
            const aRec = castEntry(a);
            const bRec = castEntry(b);
            const aValue = aRec[sortField as string];
            const bValue = bRec[sortField as string];

            // Sort strings
            if (typeof aValue === 'string' && typeof bValue === 'string') {
                if (sortRule === 'length') {
                    // Sort by string length
                    return orderSign * (aValue.length - bValue.length);
                } else {
                    // Sort by A-Z ordinal
                    return orderSign * aValue.localeCompare(bValue);
                }
            }

            // Sort numbers
            return orderSign * (Number(aValue) - Number(bValue));
        };
    }

    data.sort((a, b) => {
        return (primarySort as (a: WorldInfoEntryData, b: WorldInfoEntryData) => number)(a, b) || secondarySort(a, b) || tertiarySort(a, b);
    });

    return data;
}

/**
 *
 */
//MARK: displayWorldEntries
/**
 * @param {string|null} name - World info name
 * @param {object|null} data - World info data
 * @param {number} [navigation] - Navigation option
 * @param {boolean} [flashOnNav] - Whether to flash highlight on navigation
 * @returns {Promise<void>}
 */
async function displayWorldEntries(name: unknown, data: WorldInfoBook, navigation: unknown = navigation_option.none, flashOnNav = true) {
    updateEditor = async (navigation: unknown, flashOnNav = true) => await displayWorldEntries(name, data, navigation, flashOnNav);

    const worldEntriesList = document.getElementById('world_popup_entries_list');
    if (worldEntriesList) clearEntryList(worldEntriesList);
    if (worldEntriesList) worldEntriesList.style.display = '';

    // Purge stale listeners by cloning buttons — displayWorldEntries is called on
    // every editor navigation, and each call adds new listeners without removing old ones.
    // Without this, clicking a button fires N handlers, each with a stale `name` closure.
    const purgeButton = (id: string) => {
        const el = document.getElementById(id);
        if (el && el.parentNode) {
            const clone = el.cloneNode(true);
            el.parentNode.replaceChild(clone, el);
        }
    };
    purgeButton('world_popup_delete');
    purgeButton('world_popup_new');
    purgeButton('world_popup_name_button');
    purgeButton('world_popup_export');
    purgeButton('world_duplicate');

    if (!data || !('entries' in data)) {
        document.getElementById('world_popup_new')!.addEventListener('click', nullWorldInfo);
        document.getElementById('world_popup_name_button')!.addEventListener('click', nullWorldInfo);
        document.getElementById('world_popup_export')!.addEventListener('click', nullWorldInfo);
        document.getElementById('world_popup_delete')!.addEventListener('click', nullWorldInfo);
        document.getElementById('world_duplicate')!.addEventListener('click', nullWorldInfo);
        if (worldEntriesList) worldEntriesList.style.display = 'none';

        const pagEl = document.getElementById('world_info_pagination');
        if (pagEl) pagEl.innerHTML = '';
        return;
    }

    // Initialize the store for this book
    const store = wiManager.getStore(name as string);
    await store.init();

    // Hydrate the store from the loaded book data if it's empty
    // (store is not populated until the first save or explicit load)
    if (data.entries && Object.keys(data.entries).length > 0) {
        const count = await store.entryCount();
        if (count === 0) {
            const entryList = Object.values(data.entries).filter(Boolean);
            if (entryList.length > 0) {
                await store.replaceAllEntries(entryList as WorldInfoEntryData[]);
            }
        }
    }

    // Regardless of whether success is displayed or not. Make sure the delete button is available.
    // Do not put this code behind.
    document.getElementById('world_popup_delete')!.addEventListener('click', async () => {
        const confirmation = await Popup.show.confirm(`Delete the World/Lorebook: "${name}"?`, 'This action is irreversible!');
        if (!confirmation) {
            return;
        }

        const infoCharLore = (wiManager.info as Record<string, unknown>).charLore as Record<string, unknown>[] | undefined;
        if (infoCharLore) {
            infoCharLore.forEach((charLore: Record<string, unknown>, index: number) => {
                const extraBooks = charLore.extraBooks as string[] | undefined;
                if (extraBooks?.includes(name as string)) {
                    const tempCharLore = extraBooks.filter((e: string) => e !== name);
                    if (tempCharLore.length === 0) {
                        infoCharLore.splice(index, 1);
                    } else {
                        charLore.extraBooks = tempCharLore;
                    }
                }
            });

            saveSettingsNow();
        }

        // Selected world_info automatically refreshes
        await deleteWorldInfo(name);
    });

    // Before printing the WI, we check if we should enable/disable search sorting
    verifyWorldInfoSearchSortRule();

    /**
     * @param {(entries: object[]) => void} callback - Callback to process the entries array
     * @returns {object[]} Array of entry objects
     */
    function getDataArray(callback?: unknown) {
        // Convert the data.entries object into an array
        if (!data.entries) return [];
        let entriesArray = Object.keys(data.entries).map(uid => {
            const entry = data.entries[uid]!;
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                return null;
            }
            entry.displayIndex = entry.displayIndex ?? entry.uid;
            return entry;
        }).filter(entry => entry !== null) as WorldInfoEntryData[];

        // Apply the filter and do the chosen sorting
        entriesArray = addMissingWorldInfoFields(entriesArray);
        entriesArray = (worldInfoFilter as FilterHelper).applyFilters(entriesArray) as WorldInfoEntryData[];
        entriesArray = sortWorldInfoEntries(entriesArray);

        // Cache keys
        const keys = entriesArray.flatMap(entry => [...entry.key, ...entry.keysecondary]);
        updateWorldEntryKeyOptionsCache(keys, { reset: true });

        // Run the callback for printing this
        if (typeof callback === 'function') callback(entriesArray);
        return entriesArray;
    }

    const storageKey = 'WI_PerPage';
    const perPageDefault = 25;
    let startPage = 1;
    let wiPaginator: null | { getCurrentPage(): number; go(page: number | string): void; destroy(): void } = null;

    const pagEl = document.getElementById('world_info_pagination');

    if (navigation === navigation_option.previous) {
        startPage = (wiPaginator as unknown as { getCurrentPage: () => number }).getCurrentPage();
    }

    if (typeof navigation === 'number' && Number(navigation) >= 0) {
        const data = getDataArray();
        const uidIndex = data.findIndex(x => x.uid === navigation);
        const perPage = Number(accountStorage.getItem(storageKey)) || perPageDefault;
        startPage = Math.floor(uidIndex / perPage) + 1;
    }

    if (pagEl) {
        const storageKey = 'WI_PerPage';
        const perPage = Number(accountStorage.getItem(storageKey)) || perPageDefault;
        wiPaginator = createPaginator(pagEl, {
            dataSource: () => getDataArray(),
            pageSize: perPage,
            pageNumber: startPage,
            showSizeChanger: true,
            sizeChangerOptions: [10, 25, 50, 100, 500, 1000],
            showNavigator: true,
            prevText: '<',
            nextText: '>',
            callback: async function (entries: WorldInfoEntryData[]) {
                try {
                    if (worldEntriesList) clearEntryList(worldEntriesList);

                    const keywordHeaders = await renderTemplateAsync('worldInfoKeywordHeaders');
                    const blocks: HTMLElement[] = [];

                    for (const entry of entries) {
                        try {
                            const block = await getWorldEntry(name, data, entry as unknown as Record<string, unknown>);
                            if (block) {
                                blocks.push(block);
                            }
                        } catch (error) {
                            console.error(`Error while processing entry ${String(entry.uid)}:`, error);
                        }
                    }

                    const isCustomOrder = (document.getElementById('world_info_sort_order') as HTMLSelectElement).options[(document.getElementById('world_info_sort_order') as HTMLSelectElement).selectedIndex]?.getAttribute('data-rule') === 'custom';
                    if (!isCustomOrder) {
                        blocks.forEach((block: HTMLElement) => {
                            block.querySelectorAll('.drag-handle').forEach((el: Element) => el.remove());
                        });
                    }

                    if (worldEntriesList) {
                        worldEntriesList.insertAdjacentHTML('beforeend', keywordHeaders);
                        worldEntriesList.append(...blocks);
                    }
                } catch (error) {
                    console.error('Error while rendering WI entries:', error);
                }
            },
            onPageSizeChange: function (this: HTMLElement, e: Event) {
                accountStorage.setItem(storageKey, (e.target as HTMLInputElement).value);
            },
            afterPaging: function () {
                document.querySelectorAll('#world_popup_entries_list textarea[name="comment"]').forEach(function (el: Element) {
                                initScrollHeight(el as HTMLElement);
                });
            },
        });

        if (typeof navigation === 'number' && Number(navigation) >= 0) {
            wiPaginator!.go(startPage);
        }
    }

    if (typeof navigation === 'number' && Number(navigation) >= 0) {
        const selector = `#world_popup_entries_list [uid="${navigation}"]`;
        waitUntilCondition(() => document.querySelector(selector) !== null).finally(() => {
            const element = document.querySelector(selector);

            if (!element) {
                console.log(`Could not find element for uid ${navigation}`);
                return;
            }

            const elementRect = element.getBoundingClientRect();
            const parentElement = element.parentElement;
            const parentRect = parentElement?.getBoundingClientRect();
            const scrollOffset = (elementRect?.top ?? 0) - (parentRect?.top ?? 0);
            const worldInfoEl = document.getElementById('WorldInfo');
            if (worldInfoEl) worldInfoEl.scrollTop = scrollOffset;
            if (flashOnNav) flashHighlight(element);
        });
    }

    document.getElementById('world_popup_new')!.addEventListener('click', async () => {
        const entry = await createWorldInfoEntry(store);
        if (entry) {
            data.entries[entry.uid] = entry as WorldInfoEntryData;
            await saveWorldInfo(name as string, data);
            updateEditor(entry.uid);
        }
    });

    document.getElementById('world_popup_name_button')!.addEventListener('click', async () => {
        await renameWorldInfo(name as string, data);
    });

    document.getElementById('world_backfill_memos')!.addEventListener('click', async () => {
        let counter = 0;
        const backfillEntries = Object.values(data.entries as Record<string, unknown>);
        for (const entry of backfillEntries) {
            const entryRec = entry as unknown as Record<string, unknown>;
            if (!entryRec.comment && Array.isArray(entryRec.key) && (entryRec.key as unknown[]).length > 0) {
                entryRec.comment = (entryRec.key as string[]).join(', ').slice(0, MAX_COMMENT_LENGTH);
                setWIOriginalDataValue(data, entryRec.uid as string, 'comment', entryRec.comment);
                counter++;
            }
        }

        if (counter > 0) {
            notyf.info(`Backfilled ${counter} titles`);
            await saveWorldInfo(name as string, data);
            updateEditor(navigation_option.previous);
        }
    });

    document.getElementById('world_apply_current_sorting')!.addEventListener('click', async () => {
        const entryCount = Object.keys(data.entries as Record<string, unknown>).length;
        const moreThan100 = entryCount > 100;

        let content = '<span>' + t`Apply your current sorting to the "Order" field. The Order values will go down from the chosen number.` + '</span>';
        if (moreThan100) {
            content += '<div class="m-t-1"><i class="fa-solid fa-triangle-exclamation" style="color: #FFD43B;"></i> ' + t`More than 100 entries in this world. If you don't choose a number higher than that, the lower entries will default to 0.<br />(Usual default: 100)<br />Minimum: ${entryCount}` + '</div>';
        }

        const result = await Popup.show.input(t`Apply Current Sorting`, content, '100', { okButton: t`Apply`, cancelButton: 'Cancel' });
        if (!result) return;

        const start = Number(result);
        if (isNaN(start) || start < 0) {
            notyf.error(t`Invalid number: ${result}`, t`Apply Current Sorting`);
            return;
        }
        if (start < entryCount) {
            notyf.warning(t`A number lower than the entry count has been chosen. All entries below that will default to 0.`, t`Apply Current Sorting`);
        }

        // We need to sort the entries here, as the data source isn't sorted
        const entries = Object.values(data.entries as Record<string, WorldInfoEntryData>);
        sortWorldInfoEntries(entries);

        let updated = 0, current = start;
        for (const entry of entries) {
            const entryRec = entry as unknown as Record<string, unknown>;
            const newOrder = Math.max(current--, 0);
            if (entryRec.order === newOrder) continue;

            entryRec.order = newOrder;
            setWIOriginalDataValue(data, String(entryRec.uid), 'order', entryRec.order);
            updated++;
        }

        if (updated > 0) {
            notyf.info(`Updated ${updated} Order values`, 'Apply Custom Sorting');
            await saveWorldInfo(name as string, data, true);
            updateEditor(navigation_option.previous);
        } else {
            notyf.info('All values up to date', 'Apply Custom Sorting');
        }
    });

    document.getElementById('world_popup_export')!.addEventListener('click', () => {
        if (name && data) {
            const jsonValue = JSON.stringify(data);
            const fileName = `${name}.json`;
            download(jsonValue, fileName, 'application/json');
        }
    });

    document.getElementById('world_duplicate')!.addEventListener('click', async () => {
        // Use the current name as default input, then ask user for the name
        const finalName = await Popup.show.input('Create a new World Info?', 'Enter a name for the new file:', undefined);

        if (finalName) {
            await saveWorldInfo(finalName as string, data, true);
            await updateWorldInfoList();

            const selectedIndex = wiManager.worldNames.indexOf(finalName as string);
            const worldEditorSelect = document.getElementById('world_editor_select') as HTMLSelectElement | null;
            if (worldEditorSelect) {
                worldEditorSelect.value = String(selectedIndex);
                worldEditorSelect.dispatchEvent(new Event('change'));
            } else {
                await hideWorldEditor();
            }
        }
    });

    // Check if a sortable instance exists
    const worldEntriesListEl = worldEntriesList as unknown as Record<string, unknown> | null;
    if (worldEntriesListEl?.sortableInstance) {
        (worldEntriesListEl.sortableInstance as { destroy: () => void }).destroy();
    }

    if (worldEntriesListEl) {
        worldEntriesListEl.sortableInstance = new (Sortable as unknown as new (el: HTMLElement, opts: Record<string, unknown>) => Record<string, unknown>)(worldEntriesListEl as unknown as HTMLElement, {
            delay: getSortableDelay(),
            handle: '.drag-handle',
            onEnd: async function () {
                const firstEntryUid = (document.querySelector('#world_popup_entries_list .world_entry') as HTMLElement)?.dataset?.uid;
            const minDisplayIndex = firstEntryUid ? (data.entries[firstEntryUid]?.displayIndex ?? 0) : 0;
            document.querySelectorAll('#world_popup_entries_list .world_entry').forEach(function (el, index) {
                const uid = (el as HTMLElement).dataset.uid;

                // Update the display index in the data array
                const item = uid ? data.entries[uid] : undefined;

                if (!item) {
                    console.debug(`Could not find entry with uid ${uid}`);
                    return;
                }
                if (uid) {
                    item.displayIndex = minDisplayIndex + index;
                    setWIOriginalDataValue(data, uid, 'extensions.display_index', item.displayIndex);
                }
            });

            console.table(Object.keys(data.entries).map(uid => data.entries[uid]).map(x => ({ uid: x!.uid, key: x!.key.join(','), displayIndex: x!.displayIndex })));

            await saveWorldInfo(name as string, data);
        },
    });
    }

    //$("#world_popup_entries_list").disableSelection();
}

/** Checks the state of the current search, and adds/removes the search sorting option accordingly */
function verifyWorldInfoSearchSortRule() {
    const searchTerm = worldInfoFilter.getFilterData(FILTER_TYPES.WORLD_INFO_SEARCH);
    const searchOption = document.querySelector('#world_info_sort_order option[data-rule="search"]');
    const selector = document.getElementById('world_info_sort_order') as HTMLSelectElement | null;
    const isHidden = searchOption?.hasAttribute('hidden') ?? true;

    // If we have a search term, we are displaying the sorting option for it
    if (searchTerm && isHidden) {
        searchOption?.removeAttribute('hidden');
        if (selector) selector.value = searchOption?.getAttribute('value') || '0';
        if (selector) flashHighlight(selector);
    }
    // If search got cleared, we make sure to hide the option and go back to the one before
    if (!searchTerm && !isHidden) {
        searchOption?.setAttribute('hidden', '');
        if (selector) selector.value = accountStorage.getItem(SORT_ORDER_KEY) || '0';
    }
}

/**
 * Sets the value of a specific key in the original data entry corresponding to the given uid
 * This needs to be called whenever you update JSON data fields.
 * Use `originalWIDataKeyMap` to find the correct value to be set.
 * @param {object} data - The data object containing the original data entries.
 * @param {number} uid - The unique identifier of the data entry.
 * @param {string} key - The key of the value to be set.
 * @param {unknown} value - The value to be set.
 */

/**
 * Splits a given input string that contains one or more keywords or regexes, separated by commas.
 *
 * Each part can be a valid regex following the pattern `/myregex/flags` with optional flags. Commas inside the regex are allowed, slashes have to be escaped like this: `\/`
 * If a regex doesn't stand alone, it is not treated as a regex.
 * @param {string} input - One or multiple keywords or regexes, separated by commas
 * @returns {string[]} An array of keywords and regexes
 */
function splitKeywordsAndRegexes(input: string) {
    const keywordsAndRegexes: string[] = [];

    const addFindCallback = (item: Record<string, unknown>) => {
        keywordsAndRegexes.push(item.text as string);
    };

    const { term } = customTokenizer({ _type: 'custom_call', term: input }, undefined, addFindCallback);
    const finalTerm = (term as string).trim();
    if (finalTerm) {
        addFindCallback({ id: getSelect2OptionId(finalTerm), text: finalTerm });
    }

    return keywordsAndRegexes;
}

/**
 * Tokenizer parsing input and splitting it into keywords and regexes
 * @param {{_type: string, term: string}} input - The typed input
 * @param {{options: object}} _selection - The selection even object (?)
 * @param {function(Select2Option):void} callback - The original callback function to call if an item should be inserted
 * @returns {{term: string}} - The remaining part that is untokenized in the textbox
 */
function customTokenizer(input: Record<string, unknown>, _selection: unknown, callback: (opt: Record<string, unknown>) => void) {
    let current = input.term as string;

    let insideRegex = false, regexClosed = false;

    // Go over the input and check the current state, if we can get a token
    for (let i = 0; i < current.length; i++) {
        const char = current[i];

        // If we find an unascaped slash, set the current regex state
        if (char === '/' && (i === 0 || current[i - 1] !== '\\')) {
            if (!insideRegex) insideRegex = true;
            else if (!regexClosed) regexClosed = true;
        }

        // If a comma is typed, we tokenize the input.
        // unless we are inside a possible regex, which would allow commas inside
        if (char === ',') {
            // We take everything up till now and consider this a token
            const token = current.slice(0, i).trim();

            // Now how we test if this is a regex? And not a finished one, but a half-finished one?
            // We use the state remembered from above to check whether the delimiter was opened but not closed yet.
            // We don't check validity here if we are inside a regex, because it might only get valid after its finished. (Closing brackets, etc)
            // Validity will be finally checked when the next comma is typed.
            if (insideRegex && !regexClosed) {
                continue;
            }

            // So now the comma really means the token is done.
            // We take the token up till now, and insert it. Empty will be skipped.
            if (token) {
                const isRegex = isValidRegex(token);

                // Last chance to check for valid regex again. Because it might have been valid while typing, but now is not valid anymore and contains commas we need to split.
                if (token.startsWith('/') && !isRegex) {
                    const tokens = token.split(',').map((x: string) => x.trim());
                        tokens.forEach((x: string) => callback({ id: getSelect2OptionId(x), text: x }));
                    } else {
                        callback({ id: getSelect2OptionId(token), text: token });
                }
            }

            // Now remove the token from the current input, and the comma too
            current = current.slice(i + 1);
            insideRegex = false;
            regexClosed = false;
            i = 0;
        }
    }

    // At the end, just return the left-over input
    return { term: current };
}

/**
 * Enables the input helper for keys in a World Info entry.
 * @param {object} params - Parameters for enabling the keys input helper.
 * @param {JQuery<HTMLElement>} params.template - The template element containing the input.
 * @param {object} params.entry - The entry object containing the keys.
 * @param {string} params.entryPropName - The property name of the entry that holds the keys.
 * @param {string} params.originalDataValueName - The name of the original data value to be set.
 * @param {string} params.name - The name of the world info entry.
 * @param {object} params.data - The data object containing entries.
 * @returns {void}
 */
function enableKeysInputHelper({ template, entry, entryPropName, originalDataValueName, name, data }: { template: HTMLElement | null; entry: Record<string, unknown>; entryPropName: string; originalDataValueName: string; name: string; data: WorldInfoBook; }) {
    const isFancyInput = !isMobile() && !(power_user as Record<string, unknown>).wi_key_input_plaintext;
    const input = isFancyInput ?
        template?.querySelector(`select[name="${entryPropName}"]`) :
        template?.querySelector(`textarea[name="${entryPropName}"]`);
    if (!input) return { isFancy: false, control: null };
    (input as HTMLElement).dataset.uid = String(entry.uid);
    (input as HTMLElement).dataset.macros = ''; // active
    // Toggle visibility between select (fancy) and textarea (plaintext)
    const selectEl = template?.querySelector(`select[name="${entryPropName}"]`);
    const textareaEl = template?.querySelector(`textarea[name="${entryPropName}"]`);
    if (isFancyInput) {
        if (selectEl) (selectEl as HTMLElement).style.display = '';
        if (textareaEl) (textareaEl as HTMLElement).style.display = 'none';
    } else {
        if (selectEl) (selectEl as HTMLElement).style.display = 'none';
        if (textareaEl) (textareaEl as HTMLElement).style.display = '';
    }
    (input as HTMLElement).addEventListener('click', function (event: Event) {
        event.stopPropagation();
    });

    /**
     * @param {object} item - The select2 item object
     * @param {object} root0 - Options object
     * @param {boolean} [root0.searchStyle] - Whether to apply search style
     * @returns {JQuery<HTMLElement>|Element} The styled element
     */
    function templateStyling(item: Record<string, unknown>, { searchStyle = false } = {}) {
        const content = document.createElement('span');
        content.classList.add('item');
        content.textContent = item.text as string;
        content.title = `${item.text as string}\n\nClick to edit`;
        const isRegex = isValidRegex(item.text as string);
        if (isRegex) {
            content.innerHTML = highlightRegex(item.text as string);
            content.classList.add('regex_item');
            const regexIcon = document.createElement('span');
            regexIcon.classList.add('regex_icon');
            regexIcon.textContent = '•*';
            regexIcon.title = 'Regex';
            content.prepend(regexIcon);
        }
        if (searchStyle && item.count) {
            const wrapper = document.createElement('span');
            wrapper.classList.add('result_block');
            wrapper.append(content);
            const itemCount = document.createElement('span');
            itemCount.classList.add('item_count');
            itemCount.textContent = item.count as string;
            itemCount.title = `Used as a key ${item.count as string} ${item.count != 1 ? 'times' : 'time'} in this lorebook`;
            wrapper.append(itemCount);
            return wrapper;
        }
        return content;
    }

    if (isFancyInput) {
        select2ModifyOptions(input, entry[entryPropName] as string[], { select: true, changeEventArgs: { skipReset: true, noSave: true } as unknown as null | undefined });
        new (TomSelect as unknown as new (el: Record<string, unknown>, opts: Record<string, unknown>) => Record<string, unknown>)(input as unknown as Record<string, unknown>, {
            maxItems: null,
            plugins: ['remove_button'],
            create: true,
            createFilter: null,
            placeholder: input.getAttribute('placeholder'),
            valueField: 'id',
            labelField: 'text',
            searchField: ['text'],
            render: {
                option: (item: Record<string, unknown>) => templateStyling(item, { searchStyle: true }),
                item: (item: Record<string, unknown>) => templateStyling(item),
            },
            onItemAdd: function (this: Record<string, unknown>, value: string) {
                const options = this.options as Record<string, unknown>;
                const option = options[value] as Record<string, unknown> | undefined;
                if (option) updateWorldEntryKeyOptionsCache([option as unknown as string]);
            },
            onItemRemove: function (this: Record<string, unknown>, value: string) {
                const options = this.options as Record<string, unknown>;
                const option = options[value] as Record<string, unknown> | undefined;
                if (option) updateWorldEntryKeyOptionsCache([option as unknown as string], { remove: true });
            },
        });

        // TypeScript-safe event handler
        /**
         * @param {Event} _event
         * @param {{ skipReset?: boolean, noSave?: boolean }} [arg]
         */
        input.addEventListener('change', async function (this: HTMLElement, _event: Event, arg?: Record<string, unknown>) {
            const uid = this.dataset.uid;
            const thisRec = this as unknown as Record<string, unknown>;
            const tomSelect = thisRec.tomSelect as Record<string, unknown> | undefined;
            const keys = tomSelect ? (tomSelect.items as string[]).map((id: string) => ((tomSelect.options as Record<string, unknown>)[id] as Record<string, unknown>)?.text || id) : [];
            const skipReset = (arg?.skipReset as boolean) ?? false;
            const noSave = (arg?.noSave as boolean) ?? false;
            if (!skipReset) await resetScrollHeight(this);
            if (!noSave) {
                if (uid) (data.entries[uid] as unknown as Record<string, unknown>)[entryPropName] = keys;
                    if (uid) setWIOriginalDataValue(data, uid, originalDataValueName, (data.entries[uid] as unknown as Record<string, unknown>)[entryPropName]);
                    await saveWorldInfo(name as string, data);
                }
                if (uid) this.classList.toggle('empty', !((data.entries[uid] as unknown as Record<string, unknown>)[entryPropName] as unknown[])?.length);
                // Update the commentInput's placeholder for primary keys
                if (entryPropName === 'key' && uid) {
                    const commentInput = (_event.currentTarget as HTMLElement)?.closest('.world_entry_form')?.querySelector('textarea[name="comment"]');
                    setCommentPlaceholder(((data.entries[uid] as unknown as Record<string, unknown>)[entryPropName] as string[]).join(', '), commentInput as HTMLElement);
                }
            });

            input.classList.toggle('empty', !((entry as unknown as Record<string, unknown>)[entryPropName] as unknown[])?.length);

        select2ChoiceClickSubscribe(input as HTMLElement, (target: Element) => {
            const key = target.closest('.regex-highlight, .item')?.textContent || '';
            const inputRec = input as unknown as Record<string, unknown>;
            const tomSelect = inputRec.tomSelect as Record<string, unknown> | undefined;
            if (!tomSelect) return;
            const getVal = tomSelect.getValue as () => string;
            const values = getVal() ? getVal().split(',') : [];
            const id = getSelect2OptionId(key);
            const index = values.indexOf(id);
            if (index > -1) {
                values.splice(index, 1);
                (tomSelect.setValue as (v: string) => void)(values.join(','));
            }
            updateWorldEntryKeyOptionsCache([key], { remove: true });
            // Set the search input value to allow re-adding
            const tsInput = (input as HTMLElement).closest('.ts-wrapper')?.querySelector('.ts-control input') as HTMLInputElement | null;
            if (tsInput) {
                tsInput.value = key;
                tsInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }, { openDrawer: true });
    } else {
const selEl = (template as HTMLElement | null)?.querySelector(`select[name="${entryPropName}"]`); if (selEl) (selEl as HTMLElement).style.display = 'none';
        if (input) (input as HTMLElement).style.display = '';
        input.addEventListener('input', async function (this: HTMLElement, _event: Event) {
            const uid = this.dataset.uid;
            const value = String((this as HTMLTextAreaElement).value);
            const detail = _event instanceof CustomEvent ? _event.detail : {};
            const skipReset = (detail as Record<string, unknown>)?.skipReset ?? false;
            const noSave = (detail as Record<string, unknown>)?.noSave ?? false;
            if (!skipReset) await resetScrollHeight(this);
            if (!noSave) {
                if (uid) (data.entries[uid] as unknown as Record<string, unknown>)[entryPropName] = splitKeywordsAndRegexes(value);
                    if (uid) setWIOriginalDataValue(data, uid, originalDataValueName, (data.entries[uid] as unknown as Record<string, unknown>)[entryPropName]);
                    await saveWorldInfo(name, data);
                    if (uid) this.classList.toggle('empty', !((data.entries[uid] as unknown as Record<string, unknown>)[entryPropName] as unknown[])?.length);
            }
            // Update the commentInput's placeholder for primary keys
            if (entryPropName === 'key') {
                const commentInput = this.closest('.world_entry_form')?.querySelector('textarea[name="comment"]');
                setCommentPlaceholder(value, commentInput as HTMLElement | null);
            }
        });
        (input as HTMLTextAreaElement).value = ((entry as unknown as Record<string, unknown>)[entryPropName] as string[])?.join(', ');
        input.dispatchEvent(new CustomEvent('input', { detail: { skipReset: true } }));
    }
    return { isFancy: isFancyInput, control: input };
}

/**
 * Helper to handle match checkboxes for WI entries.
 * @param {object} params - Parameters for handling match checkboxes.
 * @param {JQuery<HTMLElement>} params.template - The template element containing the checkbox.
 * @param {object} params.entry - The entry object containing the checkbox state.
 * @param {string} params.fieldName - The name of the checkbox field.
 * @param {object} params.data - The data object containing entries.
 * @param {string} params.name - The name of the world info to save changes to.
 */
/**
 * Generic field binder for WI entry editors.
 *
 * Wires an input/select element so changes flow:
 *   element → data.entries[uid] → originalData → saveWorldInfo
 * @param el         - The DOM element (input, select, checkbox).
 * @param entry      - The WI entry object.
 * @param fieldName  - Property name on the entry (e.g. 'constant', 'depth').
 * @param data       - The WI book data object.
 * @param name       - The WI book name (for saveWorldInfo).
 * @param opts       - Optional overrides.
 * @param opts.read  - (el) => value  — how to read the current value (default: el.value).
 * @param opts.write - (el, value) => void — how to set the initial value (default: el.value = value).
 * @param opts.keyPath - Override the originalWIDataKeyMap lookup.
 * @param opts.init  - Initial value override.
 * @param opts.transform - (raw) => stored — transform before saving.
 * @param opts.onSave - (uid, value) => void — extra side-effect before save.
 */
function bindEntryField(
    el: HTMLElement,
    entry: Record<string, unknown>,
    fieldName: string,
    data: WorldInfoBook,
    name: string,
    opts: {
        read?: (el: unknown) => unknown;
        write?: (el: unknown, v: unknown) => void;
        keyPath?: string;
        init?: unknown;
        transform?: (v: unknown) => unknown;
        onSave?: (uid: string, value: unknown) => void;
    } = {},
) {
    const keyPath = opts.keyPath ?? originalWIDataKeyMap[fieldName] ?? fieldName;
    const read = opts.read ?? ((el: unknown) => (el as HTMLInputElement).value);
    const write = opts.write ?? ((el: unknown, v: unknown) => { (el as HTMLInputElement).value = v as string; });
    const transform = opts.transform ?? ((v: unknown) => v);

    el.dataset.uid = String(entry.uid);
    // bindEntryField handler
    el.addEventListener('input', async function (this: HTMLElement, e: Event) {
        const uid = this.dataset.uid;
        if (!uid) return;
        const raw = read(this);
        const value = transform(raw);
        const noSave = e instanceof CustomEvent ? (e as CustomEvent).detail?.noSave : false;
        data.entries[uid]![fieldName as keyof WorldInfoEntryData] = value as never;
        setWIOriginalDataValue(data, uid, keyPath, value);
        if (opts.onSave) opts.onSave(uid, value);
        if (!noSave) await saveWorldInfo(name, data);
    });
    write(el, opts.init ?? (entry[fieldName] ?? ''));
    el.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
}

/**
 * Helper to handle match checkboxes for WI entries.
 * @param root0
 * @param root0.template
 * @param root0.entry
 * @param root0.fieldName
 * @param root0.data
 * @param root0.name
 */
function handleMatchCheckboxHelper({ template, entry, fieldName, data, name }: { template: HTMLElement | null; entry: Record<string, unknown>; fieldName: string; data: WorldInfoBook; name: string; }) {
    const el = template!.querySelector(`input[type="checkbox"][name="${fieldName}"]`) as HTMLElement | null;
    if (!el) return;
    bindEntryField(el, entry, fieldName, data, name, {
        read: (el: unknown) => (el as HTMLInputElement).checked,
        write: (el: unknown, v: unknown) => { (el as HTMLInputElement).checked = !!v; },
    });
}

/**
 * Helper to update position/order display.
 * @param {object} params - Parameters for updating position/order display.
 * @param {JQuery<HTMLElement>} params.template - The template element containing the display.
 * @param {object} params.data - The data object containing entries.
 * @param {string} params.uid - The unique identifier of the entry to update.
 */
function updatePosOrdDisplayHelper({ template, data, uid }: { template: HTMLElement | null; data: WorldInfoBook; uid: string | number; }) {
    const entry = data.entries[uid]!;
    if (!entry) return;
    let posText: string | number = entry.position;
    switch (entry.position) {
        case 0: posText = '↑CD'; break;
        case 1: posText = 'CD↓'; break;
        case 2: posText = '↑AN'; break;
        case 3: posText = 'AN↓'; break;
        case 4: posText = `@D${entry.depth}`;
    }
    const posEl = template?.querySelector('.world_entry_form_position_value');
    if (posEl) posEl.textContent = `(${posText} ${entry.order})`;
}

/**
 * Helper to initialize character filter select2.
 * @param {JQuery<HTMLElement>} characterFilter - The select element for character filter.
 */
function initCharacterFilterSelect2Helper(characterFilter: HTMLElement | null) {
    if (!isMobile()) {
        new (TomSelect as unknown as new (el: HTMLElement | null, opts: Record<string, unknown>) => Record<string, unknown>)(characterFilter, {
            maxItems: null,
            placeholder: t`Tie this entry to specific characters or characters with specific tags`,
            allowEmptyOption: true,
            plugins: ['remove_button'],
        });
    }
}

/**
 * Helper to fill character and tag options for character filter.
 * @param {object} params - Parameters for filling options.
 * @param {JQuery<HTMLElement>} params.characterFilter - The select element to fill with options.
 * @param {object} params.entry - The entry object containing character filter data.
 */
function fillCharacterAndTagOptionsHelper({ characterFilter, entry }: { characterFilter: HTMLElement | null; entry: Record<string, unknown>; }) {
    const characters = getContext().characters;
    characters.forEach((character: Record<string, unknown>) => {
        const option = document.createElement('option');
        const name = (character.avatar as string).replace(/\.[^/.]+$/, '') ?? character.name as string;
        option.innerText = name;
        option.selected = ((entry.characterFilter as Record<string, unknown>)?.names as string[])?.includes(name);
        option.setAttribute('data-type', 'character');
        characterFilter!.append(option);
    });
    const tags = getContext().tags;
    tags.forEach((tag: Record<string, unknown>) => {
        const option = document.createElement('option');
        option.innerText = `[Tag] ${tag.name as string}`;
        option.selected = ((entry.characterFilter as Record<string, unknown>)?.tags as string[])?.includes(tag.id as string);
        option.value = tag.id as string;
        option.setAttribute('data-type', 'tag');
        characterFilter!.append(option);
    });
}

/**
 * Helper to handle character filter changes.
 * @param {object} params - Parameters for handling character filter changes.
 * @param {JQuery<HTMLElement>} params.characterFilter - The select element for character filter.
 * @param {object} params.data - The data object containing entries.
 * @param {object} params.entry - The entry object to update.
 * @param {string} params.name - The name of the world info to save changes to.
 */
function handleCharacterFilterChangeHelper({ characterFilter, data, entry, name }: { characterFilter: HTMLElement | null; data: WorldInfoBook; entry: Record<string, unknown>; name: string; }) {
    if (!characterFilter) return;
    const entries = data.entries;

    /**
     *
     * @param uid
     * @param selectedOptions
     */
    async function saveFilterSelection(uid: string, selectedOptions: HTMLOptionsCollection | undefined) {
    const entryRec = entries[uid];
    if (!entryRec) return;
    if ((!selectedOptions || selectedOptions?.length === 0) && !(entryRec.characterFilter as Record<string, unknown>)?.isExclude) {
        delete entryRec.characterFilter;
    } else {
        const names = Array.from(selectedOptions ?? []).filter((o: Element) => o.matches('[data-type="character"]')).map((o: Element) => o instanceof HTMLOptionElement && o.innerText);
        const tags = Array.from(selectedOptions ?? []).filter((o: Element) => o.matches('[data-type="tag"]')).map((o: Element) => o instanceof HTMLOptionElement && o.value);
        Object.assign(entryRec, {
            characterFilter: {
                isExclude: (entryRec.characterFilter as Record<string, unknown>)?.isExclude ?? false,
                names: names,
                tags: tags,
            },
        });
    }
    setWIOriginalDataValue(data, uid, 'character_filter', entryRec.characterFilter);
    await saveWorldInfo(name, data);
}

    characterFilter.addEventListener('mousedown', async function (this: HTMLSelectElement, e: Event) {
        if (wiManager.worldNames.length === 0) { e.preventDefault(); return; }
        await saveFilterSelection(this.dataset.uid ?? '', this.selectedOptions as unknown as HTMLOptionsCollection);
    });
    characterFilter.addEventListener('change', async function (this: HTMLSelectElement) {
        if (wiManager.worldNames.length === 0) return;
        await saveFilterSelection(this.dataset.uid ?? '', this.selectedOptions as unknown as HTMLOptionsCollection);
    });
}

/**
 * Helper to handle probability input.
 * @param {object} params - Parameters for handling probability input.
 * @param {JQuery<HTMLElement>} params.probabilityInput - The input element for probability.
 * @param {object} params.data - The data object containing entries.
 * @param {object} params.entry - The entry object to update.
 * @param {string} params.name - The name of the world info to save changes to.
 */
function handleProbabilityInputHelper({ probabilityInput, data, entry, name }: { probabilityInput: NodeListOf<HTMLInputElement>; data: WorldInfoBook; entry: Record<string, unknown>; name: string; }) {
    bindEntryField(probabilityInput[0]!, entry, 'probability', data, name, {
        read: (el: unknown) => Number((el as HTMLInputElement).value),
        write: (el: unknown, v: unknown) => { (el as HTMLInputElement).value = v as string ?? ''; },
        transform: (v: unknown) => isNaN(v as number) ? null : Math.min(100, Math.max(0, v as number)),
        onSave: (uid, value) => {
            if (value !== null && value !== Number(probabilityInput[0]!.value)) {
                probabilityInput[0]!.value = String(value);
            }
        },
    });
    probabilityInput[0]!.style.width = 'calc(3em + 15px)';
}

/**
 * Helper to handle probability toggle.
 * @param {object} params - Parameters for handling probability toggle.
 * @param {JQuery<HTMLElement>} params.probabilityToggle - The toggle element for probability.
 * @param {object} params.data - The data object containing entries.
 * @param {object} params.entry - The entry object to update.
 * @param {string} params.name - The name of the world info to save changes to.
 * @param {JQuery<HTMLElement>} params.probabilityInput - The input element for probability.
 */
function handleProbabilityToggleHelper({ probabilityToggle, data, entry, name, probabilityInput }: { probabilityToggle: NodeListOf<HTMLInputElement>; data: WorldInfoBook; entry: Record<string, unknown>; name: string; probabilityInput: NodeListOf<HTMLInputElement>; }) {
    probabilityToggle[0]!.dataset.uid = String(entry.uid);
    const entries = data.entries;
    probabilityToggle[0]!.addEventListener('input', async function (this: HTMLInputElement, e: Event) {
        const uid = this.dataset.uid;
        const value = this.checked;
        const data_noSave = e instanceof CustomEvent ? e.detail?.noSave : false;
        if (!uid) return;
        entries[uid]!.useProbability = value;
        const probabilityContainer = this.closest('.world_entry')?.querySelector('.probabilityContainer');
        if (!data_noSave) await saveWorldInfo(name as string, data);
        if (value && probabilityContainer) (probabilityContainer as HTMLElement).style.display = ''; else if (probabilityContainer) (probabilityContainer as HTMLElement).style.display = 'none';
        if (value && entries[uid]!.probability === null) {
            entries[uid]!.probability = 100;
        }
        if (!value) {
            entries[uid]!.probability = null;
        }
        probabilityInput[0]!.value = String(entries[uid]!.probability ?? '');
        probabilityInput[0]!.dispatchEvent(new CustomEvent('input', { detail: { noSave: data_noSave } }));
    });
    probabilityToggle[0]!.checked = true;
    probabilityToggle[0]!.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
    if (probabilityToggle[0]?.parentElement) probabilityToggle[0]!.parentElement!.style.display = 'none';
}

/**
 * Helper to handle select2 dropdowns for boolean selects.
 * @param {object} params - Parameters for handling boolean selects.
 * @param {JQuery<HTMLElement>} params.selectElem - The select element for boolean values.
 * @param {object} params.entry - The entry object containing the boolean value.
 * @param {string} params.entryKey - The key in the entry object for the boolean value.
 * @param {object} params.data - The data object containing entries.
 * @param {string} params.name - The name of the world info to save changes to.
 */
function handleBooleanSelectHelper({ selectElem, entry, entryKey, data, name }: { selectElem: NodeListOf<HTMLSelectElement>; entry: Record<string, unknown>; entryKey: string; data: WorldInfoBook; name: string; }) {
    bindEntryField(selectElem[0]!, entry, entryKey, data, name, {
        read: (el: unknown) => (el as HTMLInputElement).value === 'null' ? null : (el as HTMLInputElement).value === 'true',
        write: (el: unknown, v: unknown) => {
            (el as HTMLInputElement).value = (v === null || v === undefined) ? 'null' : v ? 'true' : 'false';
        },
        transform: (v: unknown) => v,
    });
}

/**
 * Helper to handle input fields for numbers.
 * @param {object} params - Parameters for handling number inputs.
 * @param {JQuery<HTMLElement>} params.inputElem - The input element for the number.
 * @param {object} params.entry - The entry object containing the number value.
 * @param {string} params.entryKey - The key in the entry object for the number value.
 * @param {object} params.data - The data object containing entries.
 * @param {string} params.name - The name of the world info to save changes to.
 * @param {number} params.min - The minimum value for the number input.
 * @param {number} params.max - The maximum value for the number input.
 * @param {boolean} [params.clamp] - Whether to clamp the value within the min and max range.
 */
function handleNumberInputHelper({ inputElem, entry, entryKey, data, name, min, max, clamp = false }: { inputElem: NodeListOf<HTMLInputElement>; entry: Record<string, unknown>; entryKey: string; data: WorldInfoBook; name: string; min: number; max: number; clamp?: boolean; }) {
    bindEntryField(inputElem[0]!, entry, entryKey, data, name, {
        read: (el: unknown) => !isNaN(Number((el as HTMLInputElement).value)) ? Number((el as HTMLInputElement).value) : null,
        write: (el: unknown, v: unknown) => { (el as HTMLInputElement).value = String((v as unknown) ?? (clamp ? min : '')); },
        transform: (v: unknown) => {
            const vn = v as number | null;
            if (vn === null || isNaN(vn)) return null;
            if (clamp) {
                if (vn < min) return min;
                if (vn > max) return max;
            }
            return vn;
        },
        onSave: (uid: string, value: unknown) => {
            const vn = value as number | null;
            if (clamp && vn !== null) {
                if (vn < min) { inputElem[0]!.value = String(min); }
                if (vn > max) { inputElem[0]!.value = String(max); }
            }
        },
    });
}

/**
 * Helper to handle tri-state selector for constant/normal/vectorized.
 * @param {object} params - Parameters for handling the entry state selector.
 * @param {JQuery<HTMLElement>} params.entryStateSelector - The select element for entry state.
 * @param {object} params.entry - The entry object containing the state.
 * @param {object} params.data - The data object containing entries.
 * @param {string} params.name - The name of the world info to save changes to.
 */
function handleEntryStateSelectorHelper({ entryStateSelector, entry, data, name }: { entryStateSelector: NodeListOf<HTMLSelectElement>; entry: Record<string, unknown>; data: WorldInfoBook; name: string; }) {
    entryStateSelector[0]!.dataset.uid = String(entry.uid);
    const entries = data.entries;
    entryStateSelector[0]!.addEventListener('click', function (this: HTMLElement, event: Event) {
        event.stopPropagation();
    });
    entryStateSelector[0]!.addEventListener('input', async function (this: HTMLSelectElement, e: Event) {
        const uid = entry.uid as string;
        const value = this.value;
        const data_noSave = e instanceof CustomEvent ? e.detail?.noSave : false;
        switch (value) {
            case 'constant':
                entries[uid]!.constant = true;
                entries[uid]!.vectorized = false;
                setWIOriginalDataValue(data, uid, 'constant', true);
                setWIOriginalDataValue(data, uid, 'extensions.vectorized', false);
                break;
            case 'normal':
                entries[uid]!.constant = false;
                entries[uid]!.vectorized = false;
                setWIOriginalDataValue(data, uid, 'constant', false);
                setWIOriginalDataValue(data, uid, 'extensions.vectorized', false);
                break;
            case 'vectorized':
                entries[uid]!.constant = false;
                entries[uid]!.vectorized = true;
                setWIOriginalDataValue(data, uid, 'constant', false);
                setWIOriginalDataValue(data, uid, 'extensions.vectorized', true);
                break;
        }
        if (!data_noSave) await saveWorldInfo(name, data);
    });
    const entryState = () => entry.constant === true ? 'constant' : entry.vectorized === true ? 'vectorized' : 'normal';
    const entryStateValue = entryState();
    const option = entryStateSelector[0]!.querySelector(`option[value="${String(entryStateValue)}"]`);
    if (option) (option as HTMLOptionElement).selected = true;
    entryStateSelector[0]!.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
}

/**
 * Helper to handle kill switch toggle.
 * @param {object} params - Parameters for handling the kill switch toggle.
 * @param {JQuery<HTMLElement>} params.entryKillSwitch - The toggle element for the kill switch.
 * @param {object} params.entry - The entry object containing the state.
 * @param {object} params.data - The data object containing entries.
 * @param {string} params.name - The name of the world info to save changes to.
 * @param {JQuery<HTMLElement>} params.template - The template element for the entry.
 */
function handleEntryKillSwitchHelper({ entryKillSwitch, entry, data, name, template }: { entryKillSwitch: NodeListOf<HTMLElement>; entry: Record<string, unknown>; data: WorldInfoBook; name: string; template: HTMLElement | null; }) {
    entryKillSwitch[0]!.dataset.uid = String(entry.uid);
    const entries = data.entries;
    entryKillSwitch[0]!.addEventListener('click', async function () {
        const uid = entry.uid as string;
        if (!uid) return;
        entries[uid]!.disable = !entries[uid]!.disable;
        const isActive = !entries[uid]!.disable;
        setWIOriginalDataValue(data, uid, 'enabled', isActive as unknown);
        template?.classList.toggle('disabledWIEntry', !isActive);
        entryKillSwitch[0]!.classList.toggle('fa-toggle-off', !isActive);
        entryKillSwitch[0]!.classList.toggle('fa-toggle-on', isActive);
        await saveWorldInfo(name as string, data);
    });
    const isActive = !entry.disable;
    if (template) template.classList.toggle('disabledWIEntry', !isActive);
    entryKillSwitch[0]!.classList.toggle('fa-toggle-off', !isActive);
    entryKillSwitch[0]!.classList.toggle('fa-toggle-on', isActive);
}

/**
 * Update commentInput's placeholder.
 * @param {string} keys Text to display in commentInput's placeholder.
 * @param {JQuery<HTMLElement>} commentInput The comment input element.
 */
function setCommentPlaceholder(keys: string, commentInput: HTMLElement | null) {
    // Limit placeholder text to avoid performance issues.
    keys = (keys as string).slice(0, MAX_COMMENT_LENGTH);
    if (commentInput) (commentInput as HTMLTextAreaElement).placeholder = ((keys as string) || t`Entry Title/Memo`);
}

/**
 * Main function to build the WI entry editor template.
 * @param {string} name - The name of the world info file.
 * @param {object} data - The world info data object.
 * @param {object} entry - The entry object to be edited.
 * @returns {Promise<JQuery<HTMLElement>>} The entry header template element
 */
export async function getWorldEntry(name: unknown, data: WorldInfoBook, entry: Record<string, unknown>) {
    if (!data.entries[String(entry.uid)]) return;

    // Initialize store for this book
    const store = wiManager.getStore(name as string);
    await store.init();

    // Hydrate the store from the loaded book data if it's empty
    // (store is not populated until the first save or explicit load)
    const entriesData = data.entries;
    if (Object.keys(entriesData).length > 0) {
        const count = await store.entryCount();
        if (count === 0) {
            const entryList = Object.values(entriesData).filter(Boolean);
            if (entryList.length > 0) {
                await store.replaceAllEntries(entryList as unknown as WorldInfoEntryData[]);
            }
        }
    }

    const headerTemplate = WI_ENTRY_HEADER_TEMPLATE?.cloneNode(true) as HTMLElement | null;
    if (headerTemplate) {
        headerTemplate.dataset.uid = String(entry.uid);
        headerTemplate.setAttribute('uid', String(entry.uid));
    }

    if (typeof (power_user as Record<string, unknown>).wi_key_input_plaintext === 'undefined') (power_user as Record<string, unknown>).wi_key_input_plaintext = true;

    // Comment
    const commentInput = headerTemplate?.querySelector('textarea[name=comment]') as HTMLTextAreaElement | null;

    //Update the commentInput's placeholder.
    const keys = (entry.key as string[]).join(', ');
    setCommentPlaceholder(keys, commentInput);

    if (commentInput) commentInput.dataset.uid = String(entry.uid);
    commentInput?.addEventListener('input', async function (this: HTMLElement, e: Event) {
        const uid = this.dataset.uid;
        const value = (this as HTMLTextAreaElement).value;
        const detail = e instanceof CustomEvent ? e.detail : {};
        const skipReset = detail.skipReset ?? false;
        const data_noSave = detail.noSave ?? false;
        if (!skipReset) await resetScrollHeight(this);
        if (uid) data.entries[uid]!.comment = value;
        if (uid) setWIOriginalDataValue(data, uid, 'comment', data.entries[uid]!.comment);
        if (!data_noSave) await saveWorldInfo(name as string, data);
    });
    if (commentInput) {
        commentInput.value = entry.comment as string;
        commentInput.dispatchEvent(new CustomEvent('input', { detail: { skipReset: true, noSave: true } }));
    }

    // Order
    if (!headerTemplate) return null;
    const orderInput = headerTemplate.querySelectorAll('input[name="order"]') as NodeListOf<HTMLInputElement>;
    const orderEl = orderInput[0];
    if (!orderEl) return null;
    orderEl.dataset.uid = String(entry.uid);
    orderEl.addEventListener('input', async function (this: HTMLElement, e: Event) {
        const uid = this.dataset.uid;
        const value = Number((this as HTMLInputElement).value);
        const data_noSave = e instanceof CustomEvent ? e.detail?.noSave : false;
        if (!uid) return;
        data.entries[uid]!.order = !isNaN(value) ? value : 0;
        updatePosOrdDisplayHelper({ template: headerTemplate, data, uid });
        setWIOriginalDataValue(data, uid, 'insertion_order', data.entries[uid]!.order);
        if (!data_noSave) await saveWorldInfo(name as string, data);
    });
    orderEl.value = entry.order as string;
    orderEl.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
    orderEl.style.width = 'calc(3em + 15px)';

    // Probability
    handleProbabilityInputHelper({ probabilityInput: headerTemplate.querySelectorAll('input[name="probability"]'), data, entry, name: name as string });

    // Depth
    handleNumberInputHelper({
        inputElem: headerTemplate.querySelectorAll('input[name="depth"]'),
        entry, entryKey: 'depth', data, name: name as string, min: 0, max: MAX_SCAN_DEPTH, clamp: false,
    });
    (headerTemplate.querySelector('input[name="depth"]') as HTMLElement)!.style.width = 'calc(3em + 15px)';

    // Position
    if (entry.position === undefined) entry.position = 0;
    const positionInput = headerTemplate.querySelectorAll('select[name="position"]') as NodeListOf<HTMLSelectElement>;
    const posEl = positionInput[0];
    if (!posEl) return null;
    posEl.dataset.uid = String(entry.uid);
    posEl.addEventListener('click', (e: Event) => e.stopPropagation());
    posEl.addEventListener('input', async function (this: HTMLSelectElement, e: Event) {
        const uid = this.dataset.uid;
        const value = Number(this.value);
        const data_noSave = e instanceof CustomEvent ? e.detail?.noSave : false;
        if (uid) data.entries[uid]!.position = !isNaN(value) ? value : 0;
        const depthInput = headerTemplate?.querySelector('input[name="depth"]') as HTMLInputElement | null;
        if (value === world_info_position.atDepth) {
            if (depthInput) depthInput.disabled = false;
            if (depthInput) depthInput.style.visibility = 'visible';
            const role = Number(this.options[this.selectedIndex]?.getAttribute('data-role'));
            if (uid) data.entries[uid]!.role = role;
        } else {
            if (depthInput) depthInput.disabled = true;
            if (depthInput) depthInput.style.visibility = 'hidden';
            if (uid) (data.entries[uid] as unknown as Record<string, unknown>).role = null;
        }
        if (uid) updatePosOrdDisplayHelper({ template: headerTemplate, data, uid });
        if (uid) setWIOriginalDataValue(data, uid, 'position', data.entries[uid]!.position == 0 ? 'before_char' : 'after_char');
        if (uid) setWIOriginalDataValue(data, uid, 'extensions.position', data.entries[uid]!.position);
        if (uid) setWIOriginalDataValue(data, uid, 'extensions.role', data.entries[uid]!.role);
        if (!data_noSave) await saveWorldInfo(name as string, data);
    });
    const roleValue = entry.position === world_info_position.atDepth ? String((entry.role as number | undefined) ?? extension_prompt_roles.SYSTEM) : '';
    const posOption = headerTemplate?.querySelector(`select[name="position"] option[value="${entry.position}"][data-role="${roleValue}"]`);
    if (posOption instanceof HTMLOptionElement) posOption.selected = true;
    posEl.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));

    // Tri-state selector
    handleEntryStateSelectorHelper({
        entryStateSelector: headerTemplate.querySelectorAll('select[name="entryStateSelector"]'),
        entry, data, name: name as string,
    });

    // Kill switch
    handleEntryKillSwitchHelper({
        entryKillSwitch: headerTemplate.querySelectorAll('div[name="entryKillSwitch"]'),
        entry, data, name: name as string, template: headerTemplate,
    });

    // Duplicate/delete/move buttons
    const duplicateBtn = headerTemplate.querySelectorAll('.duplicate_entry_button') as NodeListOf<HTMLElement>;
    const dupEl = duplicateBtn[0];
    if (!dupEl) return null;
    dupEl.dataset.uid = String(entry.uid);
    dupEl.addEventListener('click', async function (this: HTMLElement) {
        const uid = this.dataset.uid;
        const entryDup = await duplicateWorldInfoEntry(store, Number(uid));
            if (entryDup) {
                const dupEntry = entryDup as unknown as WorldInfoEntryData;
                data.entries[dupEntry.uid] = dupEntry;
                await saveWorldInfo(name as string, data);
                updateEditor((entryDup as unknown as Record<string, unknown>).uid);
        }
    });
    const deleteBtn = headerTemplate.querySelectorAll('.delete_entry_button') as NodeListOf<HTMLElement>;
    const delEl = deleteBtn[0];
    if (!delEl) return null;
    delEl.dataset.uid = String(entry.uid);
    delEl.addEventListener('click', async function (this: HTMLElement, e: Event) {
        e.stopPropagation();
        const uid = this.dataset.uid;
        const deleted = await deleteWorldInfoEntry(store, Number(uid));
        if (!deleted) return;
        delete data.entries[uid as string];
        deleteWIOriginalDataValue(data, uid as string);
        await saveWorldInfo(name as string, data);
        updateEditor(navigation_option.previous);
    });
    const moveBtn = headerTemplate.querySelectorAll('.move_entry_button') as NodeListOf<HTMLElement>;
    const moveEl = moveBtn[0];
    if (!moveEl) return null;
    moveEl.setAttribute('data-uid', String(entry.uid));
    moveEl.setAttribute('data-current-world', name as string);
    moveEl.addEventListener('click', async function (this: HTMLElement, e: Event) {
        e.stopPropagation();
        const sourceUid = this.getAttribute('data-uid');
        const sourceWorld = this.getAttribute('data-current-world');
        const sourceWorldInfo = await loadWorldInfo(sourceWorld);
        if (!sourceWorldInfo) return;
        const sourceName = (sourceWorldInfo.entries as Record<string, Record<string, unknown>>)?.[sourceUid as string]?.comment as string | undefined;
        if (sourceName === undefined) return;
        const select = document.createElement('select');
        select.id = 'move_entry_target_select';
        select.classList.add('text_pole', 'wide100p', 'marginTop10');
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = `-- ${t`Select Target Lorebook`} --`;
        select.appendChild(defaultOption);
        let selectableWorldCount = 0;
        wiManager.worldNames.forEach((worldName: unknown) => {
            if (worldName !== sourceWorld) {
                const option = document.createElement('option');
                option.value = wiManager.worldNames.indexOf(worldName as string).toString();
                option.textContent = worldName as string;
                select.appendChild(option);
                selectableWorldCount++;
            }
        });
        if (selectableWorldCount === 0) {
            notyf.warning(t`There are no other lorebooks to move to.`);
            return;
        }
        const wrapper = document.createElement('div');
        wrapper.textContent = t`Move/Copy '${sourceName}' to:`;
        const container = document.createElement('div');
        container.appendChild(wrapper);
        container.appendChild(select);
        let selectedWorldIndex = -1;
        select.addEventListener('change', function () {
            selectedWorldIndex = this.value === '' ? -1 : Number(this.value);
        });
    const popup = new Popup(container, POPUP_TYPE.CONFIRM, '', {
            cancelButton: t`Cancel`,
            customButtons: [
                { text: t`Move`, result: POPUP_RESULT.CUSTOM1 },
                { text: t`Copy`, result: POPUP_RESULT.CUSTOM2 },
            ],
        } as Record<string, unknown>);
        popup.okButton.style.display = 'none'; // Hide the default OK button
        const popupConfirm = await popup.show();
        if (!popupConfirm) return;
        if (selectedWorldIndex === -1) return;
        const selectedValue = wiManager.worldNames[selectedWorldIndex];
        if (!selectedValue) {
            notyf.warning(t`Please select a target lorebook.`);
            return;
        }
        const deleteOriginal = popupConfirm === POPUP_RESULT.CUSTOM1;
        await moveWorldInfoEntry(sourceWorld, selectedValue, sourceUid, { deleteOriginal });
    });

    let drawerInitialized = false;
    let drawerDestroyTimeout: ReturnType<typeof setTimeout> | null = null;
    headerTemplate.querySelectorAll('.inline-drawer').forEach(el => (el as HTMLElement).addEventListener('inline-drawer-toggle', function () {
        if (drawerDestroyTimeout) {
            clearTimeout(drawerDestroyTimeout);
            drawerDestroyTimeout = null;
        }
        if (drawerInitialized) {
            drawerDestroyTimeout = setTimeout(() => {
                // Drawer was reopened, so we don't destroy it
                if (editOutlet && (editOutlet as HTMLElement).offsetParent !== null) {
                    return;
                }
                drawerInitialized = false;
                clearEntryList(editOutlet as HTMLElement);
                drawerDestroyTimeout = null;
            }, debounce_timeout.relaxed);
        } else {
            drawerInitialized = true;
            addEditorDrawerContent();
        }
    }));

    const editOutlet = headerTemplate?.querySelector('.inline-drawer-outlet');

    /**
     *
     */
    function addEditorDrawerContent() {
        const editTemplate = WI_ENTRY_EDIT_TEMPLATE?.cloneNode(true) as HTMLElement | null;
        if (!editTemplate) return;

        // UID display
        const uidEl = editTemplate.querySelector('.world_entry_form_uid_value');
        if (uidEl) uidEl.textContent = `(UID: ${entry.uid})`;

        // Key inputs
        const keyInput = enableKeysInputHelper({ template: editTemplate, entry, entryPropName: 'key', originalDataValueName: 'keys', name: name as string, data });
        const keySecondaryInput = enableKeysInputHelper({ template: editTemplate, entry, entryPropName: 'keysecondary', originalDataValueName: 'secondary_keys', name: name as string, data });
        if (!keyInput.isFancy) initScrollHeight(keyInput.control);
        if (!keySecondaryInput.isFancy) initScrollHeight(keySecondaryInput.control);

        // Key input switch
        editTemplate.querySelectorAll('.switch_input_type_icon').forEach((el: Element) => el.addEventListener('click', function (this: HTMLElement) {
            (power_user as Record<string, unknown>).wi_key_input_plaintext = !(power_user as Record<string, unknown>).wi_key_input_plaintext;
            saveSettingsNow();
            const uid = (this.closest('.world_entry') as HTMLElement | null)?.dataset?.uid;
            updateEditor(uid as string | number, false);
            const inlineDrawerIcon = document.querySelector(`.world_entry[uid="${uid as string}"] .inline-drawer-icon`);
            if (inlineDrawerIcon) (inlineDrawerIcon as HTMLElement).click();
        }));
        editTemplate.querySelectorAll('.switch_input_type_icon').forEach((icon: Element) => {
            const pu = power_user as Record<string, unknown>;
            const tooltipKey = (pu.wi_key_input_plaintext ? 'tooltip-on' : 'tooltip-off') as string;
            const iconKey = (pu.wi_key_input_plaintext ? 'icon-on' : 'icon-off') as string;
            const iconEl = icon as HTMLElement;
            iconEl.setAttribute('title', (iconEl.dataset as Record<string, string>)[tooltipKey] ?? '');
            iconEl.textContent = (iconEl.dataset as Record<string, string>)[iconKey] ?? '';
        });

        // Probability toggle
        handleProbabilityToggleHelper({
                probabilityToggle: editTemplate.querySelectorAll('input[name="useProbability"]'),
                data, entry, name: name as string,
                probabilityInput: headerTemplate!.querySelectorAll('input[name="probability"]'),
            });

        // Comment toggle
        const commentToggle = editTemplate.querySelectorAll('input[name="addMemo"]') as NodeListOf<HTMLInputElement>;
        const commentToggleEl = commentToggle[0];
        if (!commentToggleEl) return;
        commentToggleEl.dataset.uid = String(entry.uid);
        commentToggleEl.addEventListener('input', async function (this: HTMLInputElement, e: Event) {
            const uid = this.dataset.uid;
            const value = this.checked;
            const data_noSave = e instanceof CustomEvent ? e.detail?.noSave : false;
            const commentContainer = this.closest('.world_entry')?.querySelector('.commentContainer');
            if (uid && data.entries[uid]) data.entries[uid]!.addMemo = value;
            if (!data_noSave) await saveWorldInfo(name as string, data);
            if (value && commentContainer) (commentContainer as HTMLElement).style.display = ''; else if (commentContainer) (commentContainer as HTMLElement).style.display = 'none';
        });
        commentToggleEl.checked = true;
        commentToggleEl.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
        if (commentToggleEl?.parentElement) commentToggleEl.parentElement.style.display = 'none';

        // Logic AND/NOT
        const selectiveLogicDropdown = editTemplate.querySelectorAll('select[name="entryLogicType"]') as NodeListOf<HTMLSelectElement>;
        const logicEl = selectiveLogicDropdown[0];
        if (!logicEl) return;
        logicEl.dataset.uid = String(entry.uid);
        logicEl.addEventListener('click', (e: Event) => e.stopPropagation());
        logicEl.addEventListener('input', async function (this: HTMLSelectElement, e: Event) {
                const uid = this.dataset.uid;
                const value = Number(this.value);
            const data_noSave = e instanceof CustomEvent ? e.detail?.noSave : false;
            if (!uid) return;
            if (data.entries[uid]) data.entries[uid]!.selectiveLogic = !isNaN(value) ? value : world_info_logic.AND_ANY;
            setWIOriginalDataValue(data, uid, 'selectiveLogic', data.entries[uid]!.selectiveLogic);
            if (!data_noSave) await saveWorldInfo(name as string, data);
        });
        const logicOption = editTemplate?.querySelector(`select[name="entryLogicType"] option[value="${String(entry.selectiveLogic)}"]`);
        if (logicOption instanceof HTMLOptionElement) logicOption.selected = true;
        logicEl.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));

        // Selective
        const selectiveInput = editTemplate.querySelectorAll('input[name="selective"]') as NodeListOf<HTMLInputElement>;
        const selectiveEl = selectiveInput[0];
        if (!selectiveEl) return;
        selectiveEl.dataset.uid = String(entry.uid);
        selectiveEl.addEventListener('input', async function (this: HTMLInputElement, e: Event) {
                const uid = this.dataset.uid;
                const value = this.checked;
            const data_noSave = e instanceof CustomEvent ? e.detail?.noSave : false;
            if (!uid) return;
            if (data.entries[uid]) data.entries[uid]!.selective = value;
            setWIOriginalDataValue(data, uid, 'selective', data.entries[uid]!.selective);
            if (!data_noSave) await saveWorldInfo(name as string, data);
            const keysecondary = this.closest('.world_entry')?.querySelector('.keysecondary');
            const keysecondarytextpole = this.closest('.world_entry')?.querySelector('.keysecondarytextpole');
            const keyprimaryselect = this.closest('.world_entry')?.querySelector('.keyprimaryselect') as HTMLElement | null;
            const keyprimaryHeight = keyprimaryselect?.offsetHeight ?? 0;
            if (keysecondarytextpole) (keysecondarytextpole as HTMLElement).style.height = keyprimaryHeight + 'px';
            if (keysecondary) (keysecondary as HTMLElement).style.display = value ? '' : 'none';
        });
        selectiveEl.checked = true;
        selectiveEl.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
        if (selectiveEl?.parentElement) selectiveEl.parentElement.style.display = 'none';

        // Character filter
        const characterFilterLabel = editTemplate?.querySelector('label[for="characterFilter"] > small');
        if (characterFilterLabel) {
            characterFilterLabel.textContent = String((entry.characterFilter as Record<string, unknown>)?.isExclude === true ? 'Exclude Character(s)' : 'Filter to Character(s)');
        }
        const characterExclusionInput = editTemplate.querySelectorAll('input[name="character_exclusion"]') as NodeListOf<HTMLInputElement>;
        const exclEl = characterExclusionInput[0];
        if (!exclEl) return;
        exclEl.dataset.uid = String(entry.uid);
        exclEl.addEventListener('input', async function (this: HTMLInputElement, e: Event) {
                const uid = this.dataset.uid;
                const value = this.checked;
            const data_noSave = e instanceof CustomEvent ? e.detail?.noSave : false;
            if (!uid || !data.entries[uid]) return;
            const entryData = data.entries[uid]!;
            if (characterFilterLabel) characterFilterLabel.textContent = value ? 'Exclude Character(s)' : 'Filter to Character(s)';
            if (entryData.characterFilter) {
                if (!value && entryData.characterFilter.names.length === 0 && entryData.characterFilter.tags.length === 0) {
                    delete entryData.characterFilter;
                } else {
                    entryData.characterFilter.isExclude = value;
                }
            } else if (value) {
                Object.assign(entryData, { characterFilter: { isExclude: true, names: [], tags: [] } });
            }
            if (entryData.characterFilter?.names?.length ? entryData.characterFilter.names.length > 0 : false) {
                for (const name of [...(entryData.characterFilter?.names ?? [])]) {
                    if (!getContext().characters.find((x: Record<string, unknown>) => (x.avatar as string).replace(/\.[^/.]+$/, '') === name)) {
                        if (entryData.characterFilter) {
                            entryData.characterFilter.names = entryData.characterFilter.names.filter((x: string) => x !== name);
                        }
                    }
                }
            }
            setWIOriginalDataValue(data, uid, 'character_filter', entryData.characterFilter);
            if (!data_noSave) await saveWorldInfo(name as string, data);
        });
        exclEl.checked = !!((entry.characterFilter as Record<string, unknown>)?.isExclude);
        exclEl.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));

        // Character filter
        const characterFilter = editTemplate.querySelector('select[name="characterFilter"]') as HTMLSelectElement | null;
        if (characterFilter) {
            characterFilter.dataset.uid = String(entry.uid);
            initCharacterFilterSelect2Helper(characterFilter);
            fillCharacterAndTagOptionsHelper({ characterFilter, entry });
            handleCharacterFilterChangeHelper({ characterFilter, data, entry, name: name as string });
        }

        // Content
        const counter = editTemplate.querySelectorAll('.world_entry_form_token_counter') as NodeListOf<HTMLElement>;
        const countTokensDebounced = debounce(async function (counter: HTMLElement, value: string) {
            const numberOfTokens = await getTokenCountAsync(value);
            counter.textContent = String(numberOfTokens);
        }, debounce_timeout.relaxed);
        const contentInputId = `world_entry_content_${String(entry.uid)}`;
        const contentInput = editTemplate?.querySelector('textarea[name="content"]') as HTMLTextAreaElement | null;
        if (contentInput) {
            contentInput.dataset.uid = String(entry.uid);
            contentInput.id = contentInputId;
            contentInput.dataset.macros = ''; // active
            contentInput.addEventListener('input', async function (this: HTMLTextAreaElement, e: Event) {
                    const detail = (e instanceof CustomEvent) ? e.detail : {};
                    const skipCount = (detail as Record<string, unknown>).skipCount ?? false;
                    const noSave = (detail as Record<string, unknown>).noSave ?? false;
                    const uid = this.dataset.uid;
                    const value = this.value;
                    if (uid && data.entries[uid]) data.entries[uid]!.content = value;
                    if (uid) setWIOriginalDataValue(data, uid, 'content', data.entries[uid]!.content);
                    if (!noSave) await saveWorldInfo(name as string, data);
                    if (!skipCount) countTokensDebounced(counter, value);
                });
                contentInput.value = entry.content as string;
            contentInput.dispatchEvent(new CustomEvent('input', { detail: { skipCount: true, noSave: true } }));
        }
        editTemplate?.querySelector('.editor_maximize')?.setAttribute('data-for', contentInputId);

        // Outlet name
        const outletNameInput = editTemplate?.querySelector('input[name="outletName"]') as HTMLInputElement | null;
        if (outletNameInput) {
            outletNameInput.dataset.uid = String(entry.uid);
            outletNameInput.addEventListener('input', async function (this: HTMLInputElement, e: Event) {
                    const noSave = (e instanceof CustomEvent && (e as CustomEvent).detail?.noSave) ?? false;
                    const uid = this.dataset.uid;
                    const value = this.value;
                    if (!uid) return;
                    if (data.entries[uid]) data.entries[uid]!.automationId = value;
                    setWIOriginalDataValue(data, uid, 'extensions.automation_id', data.entries[uid]!.automationId);
                    if (!noSave) await saveWorldInfo(name as string, data);
                });
                outletNameInput.value = (entry.outletName ?? '') as string;
            outletNameInput.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
        }
        if (outletNameInput) setTimeout(() => createEntryInputAutocomplete(outletNameInput as unknown as Record<string, unknown>, getOutletNameCallback(data), { allowMultiple: true }), 1);

        // Scan depth
        const scanDepthInput = editTemplate?.querySelector('input[name="scanDepth"]') as HTMLInputElement | null;
        if (scanDepthInput) {
            scanDepthInput.dataset.uid = String(entry.uid);
            scanDepthInput.addEventListener('input', async function (this: HTMLInputElement, e: Event) {
                const noSave = (e instanceof CustomEvent && (e as CustomEvent).detail?.noSave) ?? false;
                const uid = this.dataset.uid;
                const isEmpty = this.value === '';
                const value = Number(this.value);
            if (!uid) return;
            if (value < 0) {
                this.value = '0';
                this.dispatchEvent(new Event('input', { bubbles: true }));
                notyf.warning('Scan depth cannot be negative');
                return;
            }
            if (value > MAX_SCAN_DEPTH) {
                this.value = String(MAX_SCAN_DEPTH);
                this.dispatchEvent(new Event('input', { bubbles: true }));
                notyf.warning(`Scan depth cannot exceed ${MAX_SCAN_DEPTH}`);
                return;
            }
            if (data.entries[uid]) data.entries[uid]!.scanDepth = !isEmpty && !isNaN(value) && value >= 0 && value <= MAX_SCAN_DEPTH ? Math.floor(value) : null;
            setWIOriginalDataValue(data, uid, 'extensions.scan_depth', data.entries[uid]!.scanDepth);
            if (!noSave) await saveWorldInfo(name as string, data);
            });
            scanDepthInput.value = (entry.scanDepth ?? '') as string;
            scanDepthInput.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
        }

        // Group
        const groupInput = editTemplate?.querySelector('input[name="group"]') as HTMLInputElement | null;
        if (groupInput) {
            groupInput.dataset.uid = String(entry.uid);
            groupInput.addEventListener('input', async function (this: HTMLInputElement, e: Event) {
                const detail = (e instanceof CustomEvent) ? e.detail : {};
                const noSave = (detail as Record<string, unknown>).noSave ?? false;
                const uid = this.dataset.uid;
                if (!uid) return;
                const value = String(this.value).trim();
                if (data.entries[uid]) data.entries[uid]!.group = value;
                setWIOriginalDataValue(data, uid, 'extensions.group', data.entries[uid]!.group);
                if (!noSave) await saveWorldInfo(name as string, data);
            });
            groupInput.value = (entry.group ?? '') as string;
            groupInput.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
        }
        setTimeout(() => createEntryInputAutocomplete(groupInput as unknown as Record<string, unknown>, getInclusionGroupCallback(data), { allowMultiple: true }), 1);

        // Inclusion priority
        const groupOverrideInput = editTemplate?.querySelector('input[name="groupOverride"]') as HTMLInputElement | null;
        if (groupOverrideInput) {
            groupOverrideInput.dataset.uid = String(entry.uid);
            groupOverrideInput.addEventListener('input', async function (this: HTMLInputElement, e: Event) {
                const detail = (e instanceof CustomEvent) ? e.detail : {};
                const noSave = detail.noSave ?? false;
                const uid = this.dataset.uid;
                if (!uid) return;
                const value = this.checked;
                if (data.entries[uid]) data.entries[uid]!.groupOverride = value;
                setWIOriginalDataValue(data, uid, 'extensions.group_override', data.entries[uid]!.groupOverride);
                if (!noSave) await saveWorldInfo(name as string, data);
            });
            groupOverrideInput.checked = !!entry.groupOverride;
            groupOverrideInput.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
        }

        // Group weight
        handleNumberInputHelper({
            inputElem: editTemplate.querySelectorAll('input[name="groupWeight"]'),
            entry, entryKey: 'groupWeight', data, name: name as string, min: 1, max: 10000, clamp: true,
        });

        // Sticky, cooldown, delay
        handleNumberInputHelper({
            inputElem: editTemplate.querySelectorAll('input[name="sticky"]'),
            entry, entryKey: 'sticky', data, name: name as string, min: 1, max: 10000, clamp: false,
        });
        handleNumberInputHelper({
            inputElem: editTemplate.querySelectorAll('input[name="cooldown"]'),
            entry, entryKey: 'cooldown', data, name: name as string, min: 1, max: 10000, clamp: false,
        });
        handleNumberInputHelper({
            inputElem: editTemplate.querySelectorAll('input[name="delay"]'),
            entry, entryKey: 'delay', data, name: name as string, min: 1, max: 10000, clamp: false,
        });

        // Exclude/prevent recursion
        handleMatchCheckboxHelper({ template: editTemplate, entry, fieldName: 'excludeRecursion', data, name: name as string });
        handleMatchCheckboxHelper({ template: editTemplate, entry, fieldName: 'preventRecursion', data, name: name as string });

        // Delay until recursion
        const delayUntilRecursionInput = editTemplate?.querySelector('input[name="delay_until_recursion"]') as HTMLInputElement | null;
        const delayUntilRecursionLevelInput = editTemplate?.querySelector('input[name="delayUntilRecursionLevel"]') as HTMLInputElement | null;
        if (delayUntilRecursionInput) {
            delayUntilRecursionInput.dataset.uid = String(entry.uid);
            delayUntilRecursionInput.addEventListener('input', async function (this: HTMLInputElement, e: Event) {
                const detail = (e instanceof CustomEvent) ? e.detail : {};
                const noSave = detail.noSave ?? false;
                const uid = this.dataset.uid;
                if (!uid) return;
                const toggled = this.checked;
                const value = toggled ? (data.entries[uid]!.delayUntilRecursion || true) : false;
                if (!toggled && delayUntilRecursionLevelInput) delayUntilRecursionLevelInput.value = '';
                if (data.entries[uid]) data.entries[uid]!.delayUntilRecursion = value;
                setWIOriginalDataValue(data, uid, 'extensions.delay_until_recursion', data.entries[uid]!.delayUntilRecursion);
                if (!noSave) await saveWorldInfo(name as string, data);
            });
            delayUntilRecursionInput.checked = !!entry.delayUntilRecursion;
            delayUntilRecursionInput.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
        }
        if (delayUntilRecursionLevelInput) {
            delayUntilRecursionLevelInput.dataset.uid = String(entry.uid);
            delayUntilRecursionLevelInput.addEventListener('input', async function (this: HTMLInputElement, e: Event) {
                const detail = (e instanceof CustomEvent) ? e.detail : {};
                const noSave = detail.noSave ?? false;
                const uid = this.dataset.uid;
                if (!uid) return;
                const content = this.value;
                const entryDelay = data.entries[uid]!.delayUntilRecursion;
                const value = content === '' ? (typeof entryDelay === 'boolean' ? entryDelay : true)
                    : content === '1' ? true
                        : !isNaN(Number(content)) ? Number(content)
                            : false;
                if (data.entries[uid]) data.entries[uid]!.delayUntilRecursion = value;
                setWIOriginalDataValue(data, uid, 'extensions.delay_until_recursion', data.entries[uid]!.delayUntilRecursion);
                if (!noSave) await saveWorldInfo(name as string, data);
            });
            const val = ['number', 'string'].includes(typeof entry.delayUntilRecursion) ? String(entry.delayUntilRecursion) : '';
            delayUntilRecursionLevelInput.value = val;
            delayUntilRecursionLevelInput.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
        }

        // Boolean selects
        handleBooleanSelectHelper({ selectElem: editTemplate.querySelectorAll('select[name="caseSensitive"]'), entry, entryKey: 'caseSensitive', data, name: name as string });
        handleBooleanSelectHelper({ selectElem: editTemplate.querySelectorAll('select[name="matchWholeWords"]'), entry, entryKey: 'matchWholeWords', data, name: name as string });
        handleBooleanSelectHelper({ selectElem: editTemplate.querySelectorAll('select[name="useGroupScoring"]'), entry, entryKey: 'useGroupScoring', data, name: name as string });

        // Match checkboxes
        handleMatchCheckboxHelper({ template: editTemplate, entry, fieldName: 'matchPersonaDescription', data, name: name as string });
        handleMatchCheckboxHelper({ template: editTemplate, entry, fieldName: 'matchCharacterDescription', data, name: name as string });
        handleMatchCheckboxHelper({ template: editTemplate, entry, fieldName: 'matchCharacterPersonality', data, name: name as string });
        handleMatchCheckboxHelper({ template: editTemplate, entry, fieldName: 'matchCharacterDepthPrompt', data, name: name as string });
        handleMatchCheckboxHelper({ template: editTemplate, entry, fieldName: 'matchScenario', data, name: name as string });
        handleMatchCheckboxHelper({ template: editTemplate, entry, fieldName: 'matchCreatorNotes', data, name: name as string });

        // Automation ID
        const automationIdInput = editTemplate?.querySelector('input[name="automationId"]') as HTMLInputElement | null;
        if (automationIdInput) {
            automationIdInput.dataset.uid = String(entry.uid);
            automationIdInput.addEventListener('input', async function (this: HTMLInputElement, e: Event) {
                const detail = (e instanceof CustomEvent) ? e.detail : {};
                const noSave = (detail as Record<string, unknown>).noSave ?? false;
                const uid = this.dataset.uid;
                if (!uid) return;
                const value = this.value;
                if (data.entries[uid]) data.entries[uid]!.automationId = value;
                setWIOriginalDataValue(data, uid, 'extensions.automation_id', data.entries[uid]!.automationId);
                if (!noSave) await saveWorldInfo(name as string, data);
            });
            automationIdInput.value = (entry.automationId ?? '') as string;
            automationIdInput.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
        }
        setTimeout(() => createEntryInputAutocomplete(automationIdInput as unknown as Record<string, unknown>, getAutomationIdCallback(data)), 1);

        // Generation Type Triggers
        const generationTypeTriggers = editTemplate?.querySelector('select[name="triggers"]') as HTMLSelectElement | null;
        if (generationTypeTriggers) {
            generationTypeTriggers.dataset.uid = String(entry.uid);
            generationTypeTriggers.addEventListener('input', async function (this: HTMLSelectElement, e: Event) {
                const detail = (e instanceof CustomEvent) ? e.detail : {};
                const noSave = (detail as Record<string, unknown>).noSave ?? false;
                const uid = this.dataset.uid;
                if (!uid) return;
                const value = this.value;
                if (data.entries[uid]) data.entries[uid]!.triggers = Array.isArray(value) ? value as unknown as string[] : [];
                setWIOriginalDataValue(data, uid, 'extensions.triggers', data.entries[uid]!.triggers);
                if (!noSave) await saveWorldInfo(name as string, data);
            });
            if (!isMobile()) {
                new (TomSelect as unknown as new (el: HTMLSelectElement | null, opts: Record<string, unknown>) => Record<string, unknown>)(generationTypeTriggers, {
                    maxItems: null,
                    placeholder: t`All types (default)`,
                    allowEmptyOption: true,
                    plugins: ['remove_button'],
                });
            }
            generationTypeTriggers.value = Array.isArray(entry.triggers) ? (entry.triggers as unknown as string[]).join(',') : '';
            generationTypeTriggers.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
            generationTypeTriggers.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Ignore budget
        const ignoreBudgetInput = editTemplate?.querySelector('input[name="ignoreBudget"]') as HTMLInputElement | null;
        if (ignoreBudgetInput) {
            ignoreBudgetInput.dataset.uid = String(entry.uid);
            ignoreBudgetInput.addEventListener('input', async function (this: HTMLInputElement, e: Event) {
                const detail = (e instanceof CustomEvent) ? e.detail : {};
                const noSave = detail.noSave ?? false;
                const uid = this.dataset.uid;
                if (!uid) return;
                const value = this.checked;
                if (data.entries[uid]) data.entries[uid]!.ignoreBudget = value;
                setWIOriginalDataValue(data, uid, 'extensions.ignore_budget', data.entries[uid]!.ignoreBudget);
                if (!noSave) await saveWorldInfo(name as string, data);
            });
            ignoreBudgetInput.checked = !!(entry.ignoreBudget ?? false);
            ignoreBudgetInput.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
        }

        countTokensDebounced(counter, contentInput?.value ?? '');

        const editContent = editTemplate?.querySelector('.inline-drawer-content');
        if (editContent instanceof HTMLElement) editContent.style.display = 'none';
        if (editTemplate && editOutlet instanceof HTMLElement) editOutlet.append(editTemplate);
    }

    const headerContent = headerTemplate?.querySelector('.inline-drawer-content');
    if (headerContent instanceof HTMLElement) headerContent.style.display = 'none';

    return headerTemplate;
}


/**
 * Builds a jQuery UI autocomplete callback: (control, request, response) => void
 * @param {object} [opt] - Optional arguments
 * @param {{entries: Record<string, unknown>}} [opt.data]   - Your WI data
 * @param {(entry:unknown)=>string|string[]|null|undefined} [opt.collectValues] - Extract values from one entry
 * @param {() => Iterable<string>} [opt.includeExtras] - Optional global extras to include
 * @param {(ctx:{result:string[], control:JQuery, input:unknown, haystack:string[]})=>string[]} [opt.postFilter] - Optional final filter step (for special rules like your "group" de-dupe logic)
 * @returns {(control: JQuery<HTMLElement>, input: {term: string}, output: (data: string[]) => void) => void} Autocomplete callback
 */
function buildAutocompleteCallback({
    data,
    collectValues,
    includeExtras = () => [],
    postFilter
}: {
    data?: WorldInfoBook;
    collectValues?: (entry: WorldInfoEntryData) => string | string[] | null | undefined;
    includeExtras?: () => Iterable<string>;
    postFilter?: (ctx: { result: string[]; control: Record<string, unknown>; input: { term: unknown }; haystack: string[] }) => string[];
} = {}) {
    return function (control: Record<string, unknown>, input: { term: unknown }, output: (data: string[]) => void) {
        const uidObj = control.dataset as Record<string, string> | undefined;
        const uid = uidObj?.uid;

        // Collect unique values from all *other* entries
        const values = new Set<string>();
        for (const entry of Object.values(data?.entries ?? {})) {
            if (entry?.uid === Number(uid)) continue;
            const raw = collectValues?.(entry);
            if (raw == null) continue;
            const arr = Array.isArray(raw) ? raw : [raw];
            for (const v of arr) {
                const s = String(v).trim();
                if (s) values.add(s);
            }
        }

        // Add optional global extras
        for (const v of includeExtras()) {
            const s = String(v).trim();
            if (s) values.add(s);
        }

        // Sort stable & locale-aware
        const haystack = Array.from(values).sort((a, b) => a.localeCompare(b));

        // Case-insensitive contains
        const needle = String(input.term ?? '').toLowerCase();
        let result = haystack.filter((x: string) => x.toLowerCase().includes(needle));

        // Optional final-pass semantics
        if (postFilter) {
            result = postFilter({ result, control, input, haystack });
        }

        output(result);
    };
}

/**
 * Splits a string into an array of strings, separated by commas and trimmed
 * @param {string} s - The string to split
 * @returns {string[]} An array of strings, separated by commas and trimmed
 */
const splitCsv = (s: unknown) => String(s ?? '').split(/,\s*/).filter(Boolean);

/**
 * Get the inclusion groups for the autocomplete.
 * @param {object} data WI data
 * @returns {(input: {term: string}, output: (data: string[]) => void) => void} Callback function for the autocomplete
 */
function getInclusionGroupCallback(data: WorldInfoBook) {
    return buildAutocompleteCallback({
        data,
        collectValues: (entry: WorldInfoEntryData) => entry.group ? splitCsv(entry.group) : [],
        postFilter: ({ result, control, input, haystack }: { result: string[]; control: Record<string, unknown>; input: { term: unknown }; haystack: string[] }) => {
            const thisGroups = splitCsv(String((control as Record<string, unknown>).value));
            const needle = String(input.term ?? '').toLowerCase();
            const hasExactMatch = haystack.some((x: string) => x.toLowerCase() === needle);

                    // include suggestion if it contains the needle AND
                    // (not already present OR (exact match typed && appears only once))
                    return result.filter((x: string) =>
                !thisGroups.includes(x) ||
                (hasExactMatch && thisGroups.filter(g => g === x).length === 1),
            );
        },
    });
}

/**
 * @param {object} data - WI data
 * @returns {(input: {term: string}, output: (data: string[]) => void) => void} Autocomplete callback
 */
function getAutomationIdCallback(data: WorldInfoBook) {
    return buildAutocompleteCallback({
        data,
        collectValues: (entry: WorldInfoEntryData) => entry.automationId != null ? [String(entry.automationId)] : [],
        includeExtras: () => {
            const g = globalThis as Record<string, unknown>;
            const qrApi = g.quickReplyApi as Record<string, unknown> | undefined;
            return (qrApi && typeof qrApi.listAutomationIds === 'function')
                ? (qrApi.listAutomationIds as () => string[])()
                : [];
        },
    });
}

/**
 * @param {object} data - WI data
 * @returns {(input: {term: string}, output: (data: string[]) => void) => void} Autocomplete callback
 */
function getOutletNameCallback(data: WorldInfoBook) {
    return buildAutocompleteCallback({
        data,
        collectValues: (entry: WorldInfoEntryData) => entry.position === world_info_position.outlet && entry.outletName ? [entry.outletName] : [],
    });
}

/**
 * Create an autocomplete for an input element.
 * @param {JQuery<HTMLElement>} input - Input element to attach the autocomplete to
 * @param {(control: JQuery<HTMLElement>, input: {term: string}, output: (data: string[]) => void) => void} callback - Source data callbacks
 * @param {object} [options] - Optional arguments
 * @param {boolean} [options.allowMultiple] - Whether to allow multiple comma-separated values
 */
function createEntryInputAutocomplete(input: Record<string, unknown>, callback: (control: Record<string, unknown>, query: { term: unknown }, cb: (results: string[]) => void) => void, { allowMultiple = false } = {}) {
    const onValueChange = () => {
        const ts = (input as Record<string, unknown>).tomSelect as Record<string, unknown> | undefined;
        const value = (ts?.getValue as (() => string) | undefined)?.() ?? '';
        if (!allowMultiple) {
            input.value = value;
            (input as unknown as HTMLElement).dispatchEvent(new Event('input', { bubbles: true }));
            (input as unknown as HTMLElement).dispatchEvent(new Event('blur', { bubbles: true }));
        } else {
            input.value = Array.isArray(value) ? value.join(', ') : '';
            (input as unknown as HTMLElement).dispatchEvent(new Event('input', { bubbles: true }));
            (input as unknown as HTMLElement).dispatchEvent(new Event('blur', { bubbles: true }));
        }
    };

    input.tomSelect = new (TomSelect as unknown as new (...args: unknown[]) => Record<string, unknown>)(input, {
        maxItems: allowMultiple ? null : 1,
        create: false,
        minLength: 0,
        valueField: 'value',
        labelField: 'label',
        searchField: ['label'],
        load: function (this: Record<string, unknown>, query: unknown, loadCallback: (items: { value: string; label: string }[]) => void) {
            callback(input, { term: query }, function (results: string[]) {
                loadCallback(results.map((s: string) => ({ value: s, label: s })));
            });
        },
        onChange: function () {
            onValueChange();
        },
        onItemRemove: function () {
            if (allowMultiple) {
                onValueChange();
            }
        },
    });

    (input as unknown as HTMLElement).addEventListener('focus', function () {
        const ts = (input as Record<string, unknown>).tomSelect as Record<string, unknown> | undefined;
        (ts?.open as (() => void) | undefined)?.();
    });
    (input as unknown as HTMLElement).addEventListener('click', function () {
        const ts = (input as Record<string, unknown>).tomSelect as Record<string, unknown> | undefined;
        (ts?.open as (() => void) | undefined)?.();
    });
}







/**
 * Retargets all character lore links from an old world info name to a new one, with an optional confirmation for primary lorebook links
 * @param {string} oldName Previous WI file name
 * @param {string} newName New WI file name
 * @returns {Promise<void>}
 */
export async function updateWorldInfoLinks(oldName: unknown, newName: unknown) {
    const existingCharLores = ((wiManager.info as Record<string, unknown>).charLore as Record<string, unknown>[])?.filter((e: Record<string, unknown>) => ((e.extraBooks as string[]) || []).includes(oldName as string));
    if (existingCharLores && existingCharLores.length > 0) {
        existingCharLores.forEach((charLore: Record<string, unknown>) => {
            const tempCharLore = ((charLore.extraBooks as string[]) || []).filter((e: string) => e !== oldName);
            tempCharLore.push(newName as string);
            charLore.extraBooks = tempCharLore;
        });
        saveSettingsNow();
    }

    const linkedChIDs: number[] = [];
    characters.forEach((character, chid) => {
        if (character.data?.extensions?.world === oldName) {
            linkedChIDs.push(chid);
        }
    });

    if (!linkedChIDs.length) {
        return;
    }

    // Trigger the confirmation popup
    const updatePastLinksConfirm = (await Popup.show.confirm(
        t`World/Lorebook renamed!`,
        `<p>${t`Auxiliary Lorebook links have been updated. Would you like to update primary lorebook links for ${linkedChIDs.length} character(s) as well?`}</p>`,
    )) == POPUP_RESULT.AFFIRMATIVE;

    if (updatePastLinksConfirm) {
        let activeCharacterUpdated = false;

        for (const chid of linkedChIDs) {
            const character = characters[chid];

            try {
                // /merge-attributes API call to update the file on the backend silently
                const response = await fetch('/api/characters/merge-attributes', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({
                        avatar: character.avatar,
                        data: {
                            extensions: {
                                world: newName,
                            },
                        },
                    }),
                });

                if (!response.ok) {
                    throw new Error(`Merge API returned ${response.status}`);
                }

                // used to update the data in the browser's memory
                await getOneCharacter(character.avatar);

                // Flag if the currently open character was affected
                if (String(chid) === String(this_chid)) {
                    activeCharacterUpdated = true;
                }

                notyf.success(`Successfully updated link for ${character.name}.`);
            } catch (e) {
                notyf.error(`Failed to update link for ${character.name}.`);
                console.error(`Backend update for character ${character.name} failed:`, e);
            }
        }

        // update the UI fields
        // only required if the currently selected character was changed
        if (activeCharacterUpdated) {
            select_selected_character(this_chid, { switchMenu: false });
            setWorldInfoButtonClass(this_chid, true);
        }
    }
}



/**
 * @param {number} [chid] - Character ID

/**
 * @param {number} [chid] - Character ID
 * @param {boolean} [forceValue] - Force a specific state
 * @returns {void}
 */
export function setWorldInfoButtonClass(chid: unknown, forceValue: unknown = undefined) {
    if (forceValue !== undefined) {
        document.querySelectorAll('#set_character_world, #world_button').forEach(el => el.classList.toggle('world_set', forceValue as boolean | undefined));
        return;
    }

    if (chid === undefined) {
        return;
    }

    const world = characters[chid as number]?.data?.extensions?.world;
    const worldSet = Boolean(world && wiManager.worldNames.includes(world as string));
    document.querySelectorAll('#set_character_world, #world_button').forEach(el => el.classList.toggle('world_set', worldSet));
}

/**
 * @param {number|undefined} chid - Character ID
 * @returns {boolean} Whether the character has an embedded world
 */
export function checkEmbeddedWorld(chid: unknown) {
    const importInfoEl = document.getElementById('import_character_info');
    if (importInfoEl) importInfoEl.style.display = 'none';

    if (chid === undefined) {
        return false;
    }

    if (characters[chid as number]?.data?.character_book) {
        if (importInfoEl) {
            importInfoEl.dataset.chid = String(chid);
            importInfoEl.style.display = '';
        }

        // Only show the alert once per character
        const checkKey = `AlertWI_${characters[chid as number].avatar}`;
        const worldName = characters[chid as number]?.data?.extensions?.world;
        if (!accountStorage.getItem(checkKey) && (!worldName || !wiManager.worldNames.includes(worldName as string))) {
            accountStorage.setItem(checkKey, 'true');

            if (power_user.world_import_dialog) {
                const html = `<h3>This character has an embedded World/Lorebook.</h3>
                <h3>Would you like to import it now?</h3>
                <div class="m-b-1">If you want to import it later, select "Import Card Lore" in the "More..." dropdown menu on the character panel.</div>`;
                const checkResult = (result: unknown) => {
                    if (result) {
                        importEmbeddedWorldInfo(true);
                    }
                };
                callGenericPopup(html, POPUP_TYPE.CONFIRM, '', { okButton: 'Yes' }).then(checkResult);
                } else {
                    notyf.info(
                        'To import and use it, select "Import Card Lore" in the "More..." dropdown menu on the character panel.',
                        `${characters[chid as number].name} has an embedded World/Lorebook`,
                    { timeOut: 5000, extendedTimeOut: 10000 },
                );
            }
        }
        return true;
    }

    return false;
}


/**
 * @param {object|string} args - Arguments object or '__notSlashCommand__' string
 * @param {string} [text] - World info names to toggle
 * @returns {string} Empty string
 */
export function onWorldInfoChange(args: Record<string, unknown> | string, text: string) {
    if (args !== '__notSlashCommand__' && typeof args === 'object') { // if it's a slash command
        const silent = isTrueBoolean((args as Record<string, unknown>).silent as string);
        if (text.trim() !== '') { // and args are provided
            const slashInputSplitText = text.trim().toLowerCase().split(',');

            slashInputSplitText.forEach((worldName: string) => {
                const wiElement = getWIElement(worldName);
                if (wiElement instanceof HTMLOptionElement) {
                    const name = wiElement.textContent;
                    switch ((args as Record<string, unknown>).state as string) {
                        case 'off': {
                            if ((wiManager.selectedWorlds as string[]).includes(name as string)) {
                                (wiManager.selectedWorlds as string[]).splice((wiManager.selectedWorlds as string[]).indexOf(name as string), 1);
                                wiElement.selected = false;
                                if (!silent) notyf.success(t`Deactivated world: ${name}`);
                            } else {
                                if (!silent) notyf.error(t`World was not active: ${name}`);
                            }
                            break;
                        }
                        case 'toggle': {
                            if ((wiManager.selectedWorlds as string[]).includes(name as string)) {
                                (wiManager.selectedWorlds as string[]).splice((wiManager.selectedWorlds as string[]).indexOf(name as string), 1);
                                wiElement.selected = false;
                                if (!silent) notyf.success(t`Deactivated world: ${name}`);
                            } else {
                                (wiManager.selectedWorlds as string[]).push(name as string);
                                wiElement.selected = true;
                                if (!silent) notyf.success(t`Activated world: ${name}`);
                            }
                            break;
                        }
                        case 'on':
                        default: {
                            (wiManager.selectedWorlds as string[]).push(name as string);
                            wiElement.selected = true;
                            if (!silent) notyf.success(t`Activated world: ${name}`);
                        }
                    }
                } else {
                    if (!silent) notyf.error(t`No world found named: ${worldName}`);
                }
            });
            (document.getElementById('world_info') as HTMLSelectElement).dispatchEvent(new Event('change', {bubbles: true}));
                } else { // if no args, unset all worlds
            if (!silent) notyf.success(t`Deactivated all worlds`);
            wiManager.selectedWorlds = [];
            (document.getElementById('world_info') as HTMLSelectElement).value = null as unknown as string;
            document.getElementById('world_info')!.dispatchEvent(new Event('change', { bubbles: true }));
        }
    } else { //if it's a pointer selection
        const tempWorldInfo: string[] = [];
        const selectEl = document.getElementById('world_info') as HTMLSelectElement | null;
        const selectedOptions = selectEl?.selectedOptions;
        const selectedWorlds = Array.from(selectedOptions ?? []).map((o: HTMLOptionElement) => Number(o.value)).filter((e: number) => !isNaN(e));
        if (selectedWorlds.length > 0) {
            selectedWorlds.forEach((worldIndex) => {
                const existingWorldName = wiManager.worldNames[worldIndex];
                if (existingWorldName) {
                    tempWorldInfo.push(existingWorldName);
                } else {
                    const wiElement = getWIElement(existingWorldName as string);
                    if (wiElement instanceof HTMLOptionElement) wiElement.selected = false;
                    notyf.error(t`The world with ${String(existingWorldName)} is invalid or corrupted.`);
                }
            });
        }
            wiManager.selectedWorlds = tempWorldInfo;
        }

        // Save immediately — not debounced — so toggling a book's active state
        // survives an immediate page refresh.
        Object.assign(wiManager.info, { globalSelect: wiManager.selectedWorlds });
        saveSettings();
        eventSource.emit(event_types.WORLDINFO_SETTINGS_UPDATED);
        return '';
}

/**
 * Imports world info from a file.
 * @param {File} file File to import
 * @returns {Promise<void>}
 */

/**
 * Forces the world info editor to open on a specific world.
 * @param {string} worldName The name of the world to open
 */
export function openWorldInfoEditor(worldName: string) {
    console.log(`Opening lorebook for ${worldName}`);
    if ((document.getElementById('WorldInfo') as HTMLElement).offsetParent !== null) {
        (document.getElementById('WIDrawerIcon') as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }));
    }
    const index = wiManager.worldNames.indexOf(worldName);
    (document.getElementById('world_editor_select') as HTMLSelectElement).value = String(index);
    const editorSelect = document.getElementById('world_editor_select') as unknown as Record<string, unknown>;
    const tsObj = editorSelect?.tomselect as Record<string, unknown> | undefined;
    (tsObj?.setValue as (v: string) => void)?.(String(index));
    document.getElementById('world_editor_select')?.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Assigns a lorebook to the current chat.
 * @param {Pick<JQuery.ClickEvent, 'shiftKey' | 'altKey'>} event Click event
 * @returns {Promise<void>}
 */
export async function assignLorebookToChat({ shiftKey, altKey }: { shiftKey?: boolean; altKey?: boolean }) {
    const selectedName = chat_metadata[METADATA_KEY];

    if (selectedName && !shiftKey && !altKey) {
        openWorldInfoEditor(selectedName);
        return;
    }

    const html = await renderTemplateAsync('chatLorebook');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;

    const worldSelect = wrapper.querySelector('select');
    const chatName = wrapper.querySelector('.chat_name');
    if (chatName) chatName.textContent = getCurrentChatId();

    for (const worldName of wiManager.worldNames) {
        const option = document.createElement('option');
        option.value = worldName;
        option.innerText = worldName;
        option.selected = selectedName === worldName;
        worldSelect?.appendChild(option);
    }

    worldSelect?.addEventListener('change', function () {
        const worldName = this.value;

        if (worldName) {
            chat_metadata[METADATA_KEY] = worldName;
            document.querySelector('.chat_lorebook_button')?.classList.add('world_set');
        } else {
            delete chat_metadata[METADATA_KEY];
            document.querySelector('.chat_lorebook_button')?.classList.remove('world_set');
        }

        saveMetadata();
    });

    await callGenericPopup(wrapper, POPUP_TYPE.TEXT);
}



/**
 * Updates the primary world info linked to a character.
 * Can also unset it to null.
 * @param {string} name - The name of the world info to link to the character.
 */
export async function charUpdatePrimaryWorld(name: string) {
    const previousValue = (document.getElementById('character_world') as HTMLSelectElement).value;
    (document.getElementById('character_world') as HTMLSelectElement).value = name;

    console.debug('Character world selected:', name);

    if (menu_type == 'create') {
        create_save.world = name;
        return;
    }

    if (previousValue && !name) {
        try {
            const data = JSON.parse(String((document.getElementById('character_json_data') as HTMLInputElement).value));

            if (data?.data?.character_book) {
                data.data.character_book = undefined;
            }

            (document.getElementById('character_json_data') as HTMLInputElement).value = JSON.stringify(data);
            notyf.info(t`Embedded lorebook will be removed from this character.`);
        } catch {
            console.error('Failed to parse character JSON data.');
        }
    }

    await createOrEditCharacter(undefined);

    setWorldInfoButtonClass(undefined, !!name);
}

/**
 * Adds one or more auxiliary world books to a character.
 * @param {string} characterKey - The key of the character to add auxiliary world books to
 * @param {string|string[]} nameOrNames - The name or names of the auxiliary world books to add
 */
export async function charUpdateAddAuxWorld(characterKey: unknown, nameOrNames: unknown) {
    const fileName = getCharaFilename(null, { manualAvatarKey: characterKey as unknown as null | undefined });
    const toAdd = Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames];
    updateAuxBooks(fileName as string, (curr: string[]) => [...curr, ...toAdd as string[]]);
}

/**
 * Replaces the entire list of auxiliary world books for a character.
 * @param {string} fileName - The filename of the character to update
 * @param {string[]} books - The new list of auxiliary world books to replace the existing list with
 */
export function charSetAuxWorlds(fileName: unknown, books: unknown) {
    updateAuxBooks(fileName as string, (_: string[]) => Array.isArray(books) ? books as string[] : []);
}

/**
 * @param {string} fileName - Character filename
 * @param {(books: string[]) => string[]} computeNext - Function to compute the next list of books
 * @returns {void}
 */
function updateAuxBooks(fileName: string, computeNext: (curr: string[]) => string[]) {
    if (!fileName) return;

    if (menu_type === 'create') {
        const current = create_save.extra_books ?? [];
        const extraBooks = normalizeArray(computeNext(current as string[]));
        create_save.extra_books = extraBooks as never[];
        return; // no debounced save in create flow
    }

    const charLore = ((wiManager.info as Record<string, unknown>).charLore ?? []) as Record<string, unknown>[];
    const idx = charLore.findIndex((e: Record<string, unknown>) => e.name === fileName);
    const current = idx !== -1 ? ((charLore[idx] as Record<string, unknown>).extraBooks as string[] ?? []) : [];
    const next = normalizeArray(computeNext(current));

    if (next.length === 0) {
        if (idx !== -1) charLore.splice(idx, 1);
    } else if (idx === -1) {
        charLore.push({ name: fileName, extraBooks: next });
    } else {
        charLore[idx] = { ...(charLore[idx] as Record<string, unknown>), extraBooks: next };
    }

    Object.assign(world_info, { charLore });
    saveSettingsNow();
}

/**
 * Initializes the world info module.
 *
 */
export function initWorldInfo() {
    (document.getElementById('world_info') as HTMLSelectElement).addEventListener('mousedown', async function (this: HTMLElement, e: Event) {
        // If there's no world names, don't do anything
        if (wiManager.worldNames.length === 0) {
            e.preventDefault();
            return;
        }

        onWorldInfoChange('__notSlashCommand__', '');
    });
    (document.getElementById('world_info') as HTMLSelectElement).addEventListener('change', async function (this: HTMLElement) {
        // If there's no world names, don't do anything
        if (wiManager.worldNames.length === 0) {
            return;
        }

        onWorldInfoChange('__notSlashCommand__', '');
    });

    //**************************WORLD INFO IMPORT EXPORT*************************//
    (document.getElementById('world_import_button') as HTMLElement).addEventListener('click', function () {
        (document.getElementById('world_import_file') as HTMLInputElement).click();
    });

    (document.getElementById('world_import_file') as HTMLInputElement).addEventListener('change', async function (e) {
        if (!(e.target instanceof HTMLInputElement)) {
            return;
        }

        const file = e.target.files?.[0];

        await importWorldInfo(file);

        // Will allow to select the same file twice in a row
        e.target.value = '';
    });

    (document.getElementById('world_create_button') as HTMLElement).addEventListener('click', async () => {
        const finalName = await Popup.show.input(t`Create a new World Info`, t`Enter a name for the new file:`, undefined as string | undefined);

            if (finalName) {
                await createNewWorldInfo(finalName as string, { interactive: true });
            }
        });

        (document.getElementById('world_editor_select') as HTMLSelectElement).addEventListener('change', async function (this: HTMLElement) {
        const worldInfoSearchElement = document.getElementById('world_info_search');
        if (worldInfoSearchElement) (worldInfoSearchElement as HTMLInputElement).value = '';
        worldInfoFilter.setFilterData(FILTER_TYPES.WORLD_INFO_SEARCH, '', true);
        const select = document.getElementById('world_editor_select') as HTMLSelectElement;
        const option = select.options[select.selectedIndex];
        if (!option) {
            await hideWorldEditor();
            return;
        }
        const selectedIndex = String(option.value);

        if (selectedIndex === '') {
            await hideWorldEditor();
        } else {
            const worldName = wiManager.worldNames[Number(selectedIndex)];
                if (worldName) void showWorldEditor(worldName);
        }
    });

    const saveSettings = () => {
        saveSettingsNow();
        eventSource.emit(event_types.WORLDINFO_SETTINGS_UPDATED);
    };

    (document.getElementById('world_info_depth') as HTMLInputElement).addEventListener('input', function () {
        wiManager.depth = Number(this.value);
        const counter = document.getElementById('world_info_depth_counter') as HTMLInputElement | null;
        if (counter) counter.value = this.value;
        saveSettings();
    });

    (document.getElementById('world_info_min_activations') as HTMLInputElement).addEventListener('input', function () {
        wiManager.minActivations = Number(this.value);
        const counter = document.getElementById('world_info_min_activations_counter') as HTMLInputElement | null;
        if (counter) counter.value = String(wiManager.minActivations);

        if (wiManager.minActivations !== 0 && wiManager.maxRecursionSteps !== 0) {
            const maxRecursionEl = document.getElementById('world_info_max_recursion_steps') as HTMLInputElement | null;
            if (maxRecursionEl) {
                maxRecursionEl.value = '0';
                maxRecursionEl.dispatchEvent(new Event('input'));
            }
            const minActEl = document.getElementById('world_info_min_activations') as HTMLInputElement | null;
            flashHighlight(minActEl?.parentElement);
            console.info('[WI] Max recursion steps set to 0, as min activations is set to', wiManager.minActivations);
        } else {
            saveSettings();
        }
    });

    (document.getElementById('world_info_min_activations_depth_max') as HTMLInputElement).addEventListener('input', function () {
        wiManager.minActivationsDepthMax = Number(this.value);
        const counter = document.getElementById('world_info_min_activations_depth_max_counter') as HTMLInputElement | null;
        if (counter) counter.value = this.value;
        saveSettings();
    });

    (document.getElementById('world_info_budget') as HTMLInputElement).addEventListener('input', function () {
        wiManager.budget = Number(this.value);
        const counter = document.getElementById('world_info_budget_counter') as HTMLInputElement | null;
        if (counter) counter.value = this.value;
        saveSettings();
    });

    (document.getElementById('world_info_include_names') as HTMLInputElement).addEventListener('input', function () {
        wiManager.includeNames = !!this.checked;
        saveSettings();
    });

    (document.getElementById('world_info_recursive') as HTMLInputElement).addEventListener('input', function () {
        wiManager.recursive = !!this.checked;
        saveSettings();
    });

    (document.getElementById('world_info_case_sensitive') as HTMLInputElement).addEventListener('input', function () {
        wiManager.caseSensitive = !!this.checked;
        saveSettings();
    });

    (document.getElementById('world_info_match_whole_words') as HTMLInputElement).addEventListener('input', function () {
        wiManager.matchWholeWords = !!this.checked;
        saveSettings();
    });

    (document.getElementById('world_info_character_strategy') as HTMLSelectElement).addEventListener('change', function () {
        wiManager.characterStrategy = Number(this.value);
        saveSettings();
    });

    (document.getElementById('world_info_overflow_alert') as HTMLInputElement).addEventListener('change', function () {
        wiManager.overflowAlert = !!this.checked;
        saveSettings();
    });

    (document.getElementById('world_info_use_group_scoring') as HTMLInputElement).addEventListener('change', function () {
        wiManager.useGroupScoring = !!this.checked;
        saveSettings();
    });

    (document.getElementById('world_info_budget_cap') as HTMLInputElement).addEventListener('input', function () {
        wiManager.budgetCap = Number(this.value);
        const counter = document.getElementById('world_info_budget_cap_counter') as HTMLInputElement | null;
        if (counter) counter.value = String(wiManager.budgetCap);
        saveSettings();
    });

    (document.getElementById('world_info_max_recursion_steps') as HTMLInputElement).addEventListener('input', function () {
        wiManager.maxRecursionSteps = Number(this.value);
        const counter = document.getElementById('world_info_max_recursion_steps_counter') as HTMLInputElement | null;
        if (counter) counter.value = String(wiManager.maxRecursionSteps);
        if (wiManager.maxRecursionSteps !== 0 && wiManager.minActivations !== 0) {
            const minActivationsEl = document.getElementById('world_info_min_activations') as HTMLInputElement | null;
            if (minActivationsEl) {
                minActivationsEl.value = '0';
                minActivationsEl.dispatchEvent(new Event('input'));
            }
            const maxRecEl = document.getElementById('world_info_max_recursion_steps') as HTMLInputElement | null;
            flashHighlight(maxRecEl?.parentElement); // flash the other control to show it has changed
            console.info('[WI] Min activations set to 0, as max recursion steps is set to', wiManager.maxRecursionSteps);
        } else {
            saveSettings();
        }
    });

    (document.getElementById('world_button') as HTMLElement).addEventListener('click', async function (event: MouseEvent) {
        const openSetWorldMenu = () => {
            const charManagementDropdown = document.getElementById('char-management-dropdown') as HTMLSelectElement | null;
            const setCharWorld = document.getElementById('set_character_world') as HTMLSelectElement | null;
            if (charManagementDropdown && setCharWorld) {
                charManagementDropdown.value = setCharWorld.value;
                charManagementDropdown.dispatchEvent(new Event('change'));
            }
        };
        const setCharWorld = document.getElementById('set_character_world') as HTMLSelectElement | null;
        const chid = setCharWorld ? Number(setCharWorld.getAttribute('data-chid')) : -1;

        if (chid === -1) {
            openSetWorldMenu();
            return;
        }

        const worldName = characters[chid as number]?.data?.extensions?.world;
        const hasEmbed = checkEmbeddedWorld(chid);
        if (worldName && wiManager.worldNames.includes(worldName) && !event.shiftKey && !event.altKey) {
            openWorldInfoEditor(worldName);
        } else if (hasEmbed && !event.shiftKey && !event.altKey) {
            await importEmbeddedWorldInfo();
            saveCharacterDebounced();
        } else {
            openSetWorldMenu();
        }
    });
    addLongPressEvent('#world_button', function (this: HTMLElement) {
        const clickEvent = new MouseEvent('click', { shiftKey: true });
        this.dispatchEvent(clickEvent);
    });

    const debouncedWorldInfoSearch = debounce((searchQuery: string) => {
        worldInfoFilter.setFilterData(FILTER_TYPES.WORLD_INFO_SEARCH, searchQuery);
    });
    (document.getElementById('world_info_search') as HTMLInputElement).addEventListener('input', function () {
        const searchQuery = this.value;
        debouncedWorldInfoSearch(searchQuery);
    });

    (document.getElementById('world_refresh') as HTMLElement).addEventListener('click', () => {
        updateEditor(navigation_option.previous);
    });

    (document.getElementById('world_info_sort_order') as HTMLSelectElement).addEventListener('change', function () {
        const value = String(this.options[this.selectedIndex]?.value ?? '');
        // Save sort order, but do not save search sorting, as this is a temporary sorting option
        if (value !== 'search') accountStorage.setItem(SORT_ORDER_KEY, value);
        updateEditor(navigation_option.none);
    });

    document.addEventListener('click', function (e: MouseEvent) {
        if (!(e.target instanceof Element)) return;
        const el = e.target.closest('.chat_lorebook_button');
        if (el) assignLorebookToChat({ shiftKey: e.shiftKey, altKey: e.altKey });
    });
    addLongPressEvent('.chat_lorebook_button', function () {
        assignLorebookToChat({ shiftKey: true, altKey: false });
    });

    (document.getElementById('group-chat-lorebook-dropdown') as HTMLSelectElement).addEventListener('change', async function () {
        this.selectedIndex = 0;
        await assignLorebookToChat({ shiftKey: true, altKey: false });
    });

    // Not needed on mobile
    if (!isMobile()) {
        new (TomSelect as unknown as new (el: HTMLElement | null, opts: Record<string, unknown>) => Record<string, unknown>)(document.getElementById('world_editor_select'), {
            maxItems: 1,
            placeholder: t`--- Pick to Edit ---`,
            dropdownParent: 'body',
        });

        new (TomSelect as unknown as new (el: HTMLElement | null, opts: Record<string, unknown>) => Record<string, unknown>)(document.getElementById('world_info'), {
            maxItems: null,
            placeholder: t`No Worlds active. Click here to select.`,
            allowEmptyOption: true,
            plugins: ['remove_button'],
            dropdownParent: 'body',
        });

        // Subscribe world loading to the TomSelect multiselect items (We need to target the specific ts-control)
        select2ChoiceClickSubscribe(document.getElementById('world_info') as unknown as HTMLElement, (target: Element) => {
            const name = target.textContent;
            const selectedIndex = wiManager.worldNames.indexOf(name);
            const alreadySelectedInEditor = document.querySelector('#world_editor_select option:checked')?.textContent === name;
            if (selectedIndex !== -1 && !alreadySelectedInEditor) {
                (document.getElementById('world_editor_select') as HTMLSelectElement).value = String(selectedIndex);
    document.getElementById('world_editor_select')?.dispatchEvent(new Event('change', { bubbles: true }));
                console.log('Quick selection of world', name);
            } else {
                console.warn('lets not reload an already loaded list yes?');
            }
        }, { buttonStyle: true, closeDrawer: true });
    }

    (document.getElementById('WorldInfo') as HTMLElement).addEventListener('scroll', () => {
        document.querySelectorAll('.world_entry input[name="group"], .world_entry input[name="automationId"]').forEach((el: Element) => {
            const elRec = el as unknown as Record<string, unknown>;
            if (elRec.tomSelect) {
                ((elRec.tomSelect as Record<string, unknown>).close as () => void)();
            }
        });
    });
}
