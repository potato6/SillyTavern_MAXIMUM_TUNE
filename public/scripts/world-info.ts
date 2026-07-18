declare const $: any;
declare const TomSelect: any;
declare const Sortable: any;

import { Fuse } from '../lib.js';

import { saveSettings, substituteParams, getRequestHeaders, chat_metadata, this_chid, characters, saveCharacterDebounced, menu_type, eventSource, event_types, getExtensionPromptByName, saveMetadata, getCurrentChatId, extension_prompt_roles, create_save, createOrEditCharacter, name1, getOneCharacter, select_selected_character } from '../script.js';
import { download, debounce, initScrollHeight, resetScrollHeight, parseJsonFile, extractDataFromPng, getFileBuffer, getCharaFilename, getSortableDelay, escapeRegex, PAGINATION_TEMPLATE, navigation_option, waitUntilCondition, isTrueBoolean, setValueByPath, flashHighlight, select2ModifyOptions, getSelect2OptionId, dynamicSelect2DataViaAjax, highlightRegex, select2ChoiceClickSubscribe, isFalseBoolean, getSanitizedFilename, checkOverwriteExistingData, getStringHash, parseStringArray, cancelDebounce, findChar, onlyUnique, equalsIgnoreCaseAndAccents, uuidv4, normalizeArray, getUniqueName, logSlashCommandWarn, addLongPressEvent, escapeHtml, createPaginator } from './utils.js';
import { extension_settings, getContext } from './extensions.js';
import { NOTE_MODULE_NAME, metadata_keys, shouldWIAddPrompt } from './authors-note.js';
import { isMobile } from './RossAscends-mods.js';
import { FILTER_TYPES, FilterHelper } from './filters.js';
import { getTokenCountAsync } from './tokenizers.js';
import { power_user } from './power-user.js';
import { getTagKeyForEntity } from './tags.js';
import { debounce_timeout, GENERATION_TYPE_TRIGGERS } from './constants.js';
import { getRegexedString, regex_placement } from './extensions/regex/engine.js';
import { SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from './slash-commands/SlashCommandArgument.js';
import { SlashCommandEnumValue, enumTypes } from './slash-commands/SlashCommandEnumValue.js';
import { commonEnumProviders, enumIcons } from './slash-commands/SlashCommandCommonEnumsProvider.js';
import { SlashCommandClosure } from './slash-commands/SlashCommandClosure.js';
import { callGenericPopup, Popup, POPUP_RESULT, POPUP_TYPE } from './popup.js';
import { renderTemplateAsync } from './templates.js';
import { t } from './i18n.js';
import { accountStorage } from './util/AccountStorage.js';
import { getOrCreatePersonaDescriptor, setPersonaDescription, user_avatar } from './personas.js';

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

import { wiManager } from './world-info/manager.js';

// ── Engine imports ──
import {
    WorldInfoBuffer,
    WorldInfoTimedEffects,
    parseRegexFromString,
    isValidRegex,
    filterByInclusionGroups,
    worldInfoCache,
    getWorldInfoPrompt,
    loadWorldInfo,
    getSortedEntries,
    checkWorldInfo,
} from './world-info/engine.js';

// Re-export scanning pipeline functions for external consumers
export { worldInfoCache, getWorldInfoPrompt, loadWorldInfo, getSortedEntries, checkWorldInfo } from './world-info/engine.js';

// ── Editor imports ──
import {
    WI_ENTRY_HEADER_TEMPLATE,
    WI_ENTRY_EDIT_TEMPLATE,
    nullWorldInfo,
    worldEntryKeyOptionsCache,
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
    getFreeWorldEntryUid,
    getFreeWorldName,
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

// Re-export data layer for backward compatibility
export {
    saveWorldInfo,
    saveSettingsNow,
    getFreeWorldEntryUid,
    getFreeWorldName,
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

// @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
const WI_ENTRY_EDIT_TEMPLATE = /** @type {HTMLElement} */ (document.querySelector('#entry_edit_template .world_entry_edit'));

export let world_info = {};
export let selected_world_info = [];
/** @type {string[]} */
// @ts-expect-error TS(7005) FIXME: Variable 'world_names' implicitly has an 'any' typ... Remove this comment to see the full error message
export let world_names;
export let world_info_depth = 2;
export let world_info_min_activations = 0; // if > 0, will continue seeking chat until minimum world infos are activated
export let world_info_min_activations_depth_max = 0; // used when (world_info_min_activations > 0)

export let world_info_budget = 25;
export let world_info_include_names = true;
export let world_info_recursive = false;
export let world_info_overflow_alert = false;
export let world_info_case_sensitive = false;
export let world_info_match_whole_words = false;
export let world_info_use_group_scoring = false;
export let world_info_character_strategy = world_info_insertion_strategy.character_first;
export let world_info_budget_cap = 0;
export let world_info_max_recursion_steps = 0;
// @ts-expect-error TS(7006) FIXME: Parameter 'navigation' implicitly has an 'any' typ... Remove this comment to see the full error message
let updateEditor = (navigation, flashOnNav = true) => { console.debug('Triggered WI navigation', navigation, flashOnNav); };

// Do not optimize. updateEditor is a function that is updated by the displayWorldEntries with new data.
// @ts-expect-error TS(2554) FIXME: Expected 1-2 arguments, but got 0.
export const worldInfoFilter = new FilterHelper(() => updateEditor());

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
// @ts-expect-error TS(7006) FIXME: Parameter 'settings' implicitly has an 'any' type.
export function updateWorldInfoSettings(settings, activeWorldInfo) {
    console.debug('[WI] Updating world info settings', settings, activeWorldInfo);

    /** @type {Record<keyof WorldInfoSettings, (value: unknown) => void>} */
    const fields = {
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_depth: (value) => wiManager.depth = Number(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_min_activations: (value) => wiManager.minActivations = Number(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_min_activations_depth_max: (value) => wiManager.minActivationsDepthMax = Number(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_budget: (value) => wiManager.budget = Number(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_include_names: (value) => wiManager.includeNames = Boolean(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_recursive: (value) => wiManager.recursive = Boolean(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_overflow_alert: (value) => wiManager.overflowAlert = Boolean(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_case_sensitive: (value) => wiManager.caseSensitive = Boolean(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_match_whole_words: (value) => wiManager.matchWholeWords = Boolean(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_character_strategy: (value) => wiManager.characterStrategy = Number(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_budget_cap: (value) => wiManager.budgetCap = Number(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_use_group_scoring: (value) => wiManager.useGroupScoring = Boolean(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_max_recursion_steps: (value) => wiManager.maxRecursionSteps = Number(value),
        // Unused
        // @ts-expect-error TS(7006) FIXME: Parameter '_value' implicitly has an 'any' type.
        world_info: (_value) => { },
    };

    for (const [key, setter] of Object.entries(fields)) {
        if (Object.hasOwn(settings, key)) {
            setter(settings[key]);
        }
    }

    if (Array.isArray(activeWorldInfo)) {
        delete settings.world_info;
        // @ts-expect-error TS(2322) FIXME: Type 'any[]' is not assignable to type 'never[]'.
        wiManager.selectedWorlds = activeWorldInfo;
    }

    saveSettingsNow();
}

/**
 * @param {WorldInfoSettings} settings - Settings object
 * @param {object} data - Data object
 * @returns {void}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'settings' implicitly has an 'any' type.
export function setWorldInfoSettings(settings, data) {
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
        // @ts-expect-error TS(2322) FIXME: Type 'string' is not assignable to type 'never'.
        wiManager.selectedWorlds = [existingWorldInfo];
    } else if (Array.isArray(existingWorldInfo)) {
        delete settings.world_info;
        // @ts-expect-error TS(2322) FIXME: Type 'any[]' is not assignable to type 'never[]'.
        wiManager.selectedWorlds = existingWorldInfo;
    }

    wiManager.info = settings.world_info ?? {};

    /** Syncs an input or checkbox from the manager — collapses 11 nearly-identical blocks */
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

    const worldInfoCharStrategy = document.getElementById('world_info_character_strategy');
    const strategyOption = worldInfoCharStrategy?.querySelector(`option[value='${wiManager.characterStrategy}']`);
    if (strategyOption) strategyOption.selected = true;
    if (worldInfoCharStrategy) worldInfoCharStrategy.value = String(wiManager.characterStrategy);

    const worldInfoBudgetCap = document.getElementById('world_info_budget_cap');
    if (worldInfoBudgetCap) worldInfoBudgetCap.value = String(wiManager.budgetCap);
    const worldInfoBudgetCapCounter = document.getElementById('world_info_budget_cap_counter');
    if (worldInfoBudgetCapCounter) worldInfoBudgetCapCounter.value = String(wiManager.budgetCap);

    const worldInfoMaxRecursionSteps = document.getElementById('world_info_max_recursion_steps');
    if (worldInfoMaxRecursionSteps) worldInfoMaxRecursionSteps.value = String(wiManager.maxRecursionSteps);
    const worldInfoMaxRecursionStepsCounter = document.getElementById('world_info_max_recursion_steps_counter');
    if (worldInfoMaxRecursionStepsCounter) worldInfoMaxRecursionStepsCounter.value = String(wiManager.maxRecursionSteps);

    wiManager.worldNames = data.world_names?.length ? data.world_names : [];

    // Add to existing selected WI if it exists
    // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
    wiManager.selectedWorlds = wiManager.selectedWorlds.concat(settings.world_info?.globalSelect?.filter((e) => wiManager.worldNames.includes(e)) ?? []);

    if (wiManager.worldNames.length > 0) {
        const worldInfoEl = document.getElementById('world_info');
        if (worldInfoEl) worldInfoEl.innerHTML = '';
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'item' implicitly has an 'any' type.
    wiManager.worldNames.forEach((item, i) => {
        const worldInfoEl = document.getElementById('world_info');
        if (worldInfoEl) worldInfoEl.insertAdjacentHTML('beforeend', `<option value='${i}'${wiManager.selectedWorlds.includes(item) ? ' selected' : ''}>${item}</option>`);
        const worldEditorSelect = document.getElementById('world_editor_select');
        if (worldEditorSelect) worldEditorSelect.insertAdjacentHTML('beforeend', `<option value='${i}'>${item}</option>`);
    });

    const worldInfoSortOrder = document.getElementById('world_info_sort_order');
    if (worldInfoSortOrder) worldInfoSortOrder.value = accountStorage.getItem(SORT_ORDER_KEY) || '0';
    document.getElementById('world_info')!.dispatchEvent(new Event('change'));
    document.getElementById('world_editor_select')!.dispatchEvent(new Event('change'));

    eventSource.on(event_types.CHAT_CHANGED, async () => {
        const hasWorldInfo = !!chat_metadata[METADATA_KEY] && wiManager.worldNames.includes(chat_metadata[METADATA_KEY]);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.querySelector('.chat_lorebook_button').classList.toggle('world_set', hasWorldInfo);
        // Pre-cache the world info data for the chat for quicker first prompt generation
        await getSortedEntries();
    });

    // @ts-expect-error TS(7006) FIXME: Parameter 'entries' implicitly has an 'any' type.
    eventSource.on(event_types.WORLDINFO_FORCE_ACTIVATE, (entries) => {
        for (const entry of entries) {
            if (!Object.hasOwn(entry, 'world') || !Object.hasOwn(entry, 'uid')) {
                console.error('[WI] WORLDINFO_FORCE_ACTIVATE requires all entries to have both world and uid fields, entry IGNORED', entry);
            } else {
                WorldInfoBuffer.externalActivations.set(`${entry.world}.${entry.uid}`, entry);
                console.log('[WI] WORLDINFO_FORCE_ACTIVATE added entry', entry);
            }
        }
    });

    // Add slash commands
    registerWorldInfoSlashCommands();
}

/**
 * Reloads the editor with the specified world info file
 * @param {string} file - The file to load in the editor
 * @param {boolean} [loadIfNotSelected] - Indicates whether to load the file even if it's not currently selected
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'file' implicitly has an 'any' type.
export function reloadEditor(file, loadIfNotSelected = false) {
    const worldEditorSelect = document.getElementById('world_editor_select');
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
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export async function showWorldEditor(name) {
    if (!name) {
        await hideWorldEditor();
        return;
    }

    const wiData = await loadWorldInfo(name);
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
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('world_info').querySelectorAll('option:not([value=""])').forEach(el => el.remove());
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('world_editor_select').querySelectorAll('option:not([value=""])').forEach(el => el.remove());

        // @ts-expect-error TS(7006) FIXME: Parameter 'item' implicitly has an 'any' type.
        wiManager.worldNames.forEach((item, i) => {
            const globalListOption = new Option(item, i.toString());
            // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
            globalListOption.selected = wiManager.selectedWorlds.includes(item);
            const editorListOption = new Option(item, i.toString());
            editorListOption.selected = editorSelected === item;
            const worldInfoEl = document.getElementById('world_info');
            if (worldInfoEl) worldInfoEl.appendChild(globalListOption);
            const worldEditorSelect = document.getElementById('world_editor_select');
            if (worldEditorSelect) worldEditorSelect.appendChild(editorListOption);
        });

        // Sync TomSelect instances with the updated options (they don't detect DOM changes automatically)
        const wiSelect = /** @type {HTMLSelectElement} */ (document.getElementById('world_info'));
        // @ts-expect-error TS(2339) FIXME: Property 'tomselect' does not exist on type 'HTMLSelectElement'.
        if (wiSelect?.tomselect) {
            // @ts-expect-error TS(2339) FIXME: Property 'tomselect' does not exist on type 'HTMLSelectElement'.
            wiSelect.tomselect.clearOptions();
            // @ts-expect-error TS(2339) FIXME: Property 'tomselect' does not exist on type 'HTMLSelectElement'.
            Array.from(wiSelect.options).forEach(o => wiSelect.tomselect.addOption({ value: o.value, text: o.text }));
            // @ts-expect-error TS(2339) FIXME: Property 'tomselect' does not exist on type 'HTMLSelectElement'.
            wiSelect.tomselect.setValue(Array.from(wiSelect.selectedOptions).map(o => o.value));
        }
        const editorTs = /** @type {HTMLSelectElement} */ (document.getElementById('world_editor_select'));
        // @ts-expect-error TS(2339) FIXME: Property 'tomselect' does not exist on type 'HTMLSelectElement'.
        if (editorTs?.tomselect) {
            // @ts-expect-error TS(2339) FIXME: Property 'tomselect' does not exist on type 'HTMLSelectElement'.
            editorTs.tomselect.clearOptions();
            // @ts-expect-error TS(2339) FIXME: Property 'tomselect' does not exist on type 'HTMLSelectElement'.
            Array.from(editorTs.options).forEach(o => editorTs.tomselect.addOption({ value: o.value, text: o.text }));
            // @ts-expect-error TS(2339) FIXME: Property 'tomselect' does not exist on type 'HTMLSelectElement'.
            editorTs.tomselect.setValue(editorTs.value || '');
        }
    }
}

/**
 * @returns {Promise<void>}
 */
export async function hideWorldEditor() {
    await displayWorldEntries(null, null);
}

/**
 * @param {string} name - World info name to find
 * @returns {JQuery<HTMLElement>} The matching element
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export function getWIElement(name) {
    const children = Array.from(document.getElementById('world_info')?.children ?? []);
    const wiElement = children.find(function (child) {
        return child.textContent?.toLowerCase() === name.toLowerCase();
    });

    return wiElement;
}

/**
 * Adds missing fields to WI entries that are present in the entry template, but not in the data.
 * Additionally verify that array/object fields are of the expected type.
 * @param {object[]} data WI entries
 * @returns {object[]} Data with backfilled fields
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
function addMissingWorldInfoFields(data) {
    // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
    data.forEach((entry) => {
        // Add missing fields from the template
        Object.entries(newWorldInfoEntryTemplate).forEach(([key, value]) => {
            if (!Object.hasOwn(entry, key)) {
                entry[key] = structuredClone(value);
            }
        });

        // Ensure that the key is always an array
        if (!Array.isArray(entry.key)) {
            console.debug('[WI] Fixing invalid "key" field for entry', entry);
            entry.key = [];
        }

        // Ensure that the keysecondary is always an array
        if (!Array.isArray(entry.keysecondary)) {
            console.debug('[WI] Fixing invalid "keysecondary" field for entry', entry);
            entry.keysecondary = [];
        }

        // Ensure that the characterFilter is an object with the expected structure
        if (!entry.characterFilter || typeof entry.characterFilter !== 'object' || Array.isArray(entry.characterFilter)) {
            entry.characterFilter = {
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
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export function sortWorldInfoEntries(data, { customSort = null } = {}) {
    const sortOrderEl = document.getElementById('world_info_sort_order');
    const option = sortOrderEl?.options[sortOrderEl.selectedIndex];
    // @ts-expect-error TS(2339) FIXME: Property 'sortField' does not exist on type 'never... Remove this comment to see the full error message
    const sortField = customSort?.sortField ?? option?.dataset?.field;
    // @ts-expect-error TS(2339) FIXME: Property 'sortOrder' does not exist on type 'never... Remove this comment to see the full error message
    const sortOrder = customSort?.sortOrder ?? option?.dataset?.order;
    // @ts-expect-error TS(2339) FIXME: Property 'sortRule' does not exist on type 'never'... Remove this comment to see the full error message
    const sortRule = customSort?.sortRule ?? option?.dataset?.rule;
    const orderSign = sortOrder === 'asc' ? 1 : -1;

    if (!data.length) return data;

    /** @type {(a: object, b: object) => number} */
    let primarySort;

    // Secondary and tertiary it will always be sorted by Order descending, and last UID ascending
    // This is the most sensible approach for sorts where the primary sort has a lot of equal values
    // @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
    const secondarySort = (a, b) => b.order - a.order;
    // @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
    const tertiarySort = (a, b) => a.uid - b.uid;

    // If we have a search term for WI, we are sorting by weighting scores
    if (sortRule === 'search') {
        // @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
        primarySort = (a, b) => {
            const aScore = worldInfoFilter.getScore(FILTER_TYPES.WORLD_INFO_SEARCH, a.uid);
            const bScore = worldInfoFilter.getScore(FILTER_TYPES.WORLD_INFO_SEARCH, b.uid);
            return aScore - bScore;
        };
    } else if (sortRule === 'custom') {
        // First by display index
        // @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
        primarySort = (a, b) => {
            const aValue = a.displayIndex;
            const bValue = b.displayIndex;
            return aValue - bValue;
        };
    } else if (sortRule === 'priority') {
        // First constant, then normal, then disabled.
        // @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
        primarySort = (a, b) => {
            const aValue = a.disable ? 2 : a.constant ? 0 : 1;
            const bValue = b.disable ? 2 : b.constant ? 0 : 1;
            return aValue - bValue;
        };
    } else {
        // @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
        primarySort = (a, b) => {
            const aValue = a[sortField];
            const bValue = b[sortField];

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

    // @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
    data.sort((a, b) => {
        return primarySort(a, b) || secondarySort(a, b) || tertiarySort(a, b);
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
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
async function displayWorldEntries(name, data, navigation = navigation_option.none, flashOnNav = true) {
    updateEditor = async (navigation, flashOnNav = true) => await displayWorldEntries(name, data, navigation, flashOnNav);

    const worldEntriesList = document.getElementById('world_popup_entries_list');
    clearEntryList(worldEntriesList);
    if (worldEntriesList) worldEntriesList.style.display = '';

    // Purge stale listeners by cloning buttons — displayWorldEntries is called on
    // every editor navigation, and each call adds new listeners without removing old ones.
    // Without this, clicking a button fires N handlers, each with a stale `name` closure.
    const purgeButton = (id) => {
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
    const store = wiManager.getStore(name);
    await store.init();

    // Hydrate the store from the loaded book data if it's empty
    // (store is not populated until the first save or explicit load)
    if (data.entries) {
        const count = await store.entryCount();
        if (count === 0) {
            const entryList = Object.values(data.entries).filter(Boolean);
            if (entryList.length > 0) {
                await store.replaceAllEntries(entryList);
            }
        }
    }

    // Regardless of whether success is displayed or not. Make sure the delete button is available.
    // Do not put this code behind.
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('world_popup_delete').addEventListener('click', async () => {
        const confirmation = await Popup.show.confirm(`Delete the World/Lorebook: "${name}"?`, 'This action is irreversible!');
        if (!confirmation) {
            return;
        }

        // @ts-expect-error TS(2339) FIXME: Property 'charLore' does not exist on type '{}'.
        if (wiManager.info.charLore) {
            // @ts-expect-error TS(2339) FIXME: Property 'charLore' does not exist on type '{}'.
            wiManager.info.charLore.forEach((charLore, index) => {
                if (charLore.extraBooks?.includes(name)) {
                    // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
                    const tempCharLore = charLore.extraBooks.filter((e) => e !== name);
                    if (tempCharLore.length === 0) {
                        // @ts-expect-error TS(2339) FIXME: Property 'charLore' does not exist on type '{}'.
                        wiManager.info.charLore.splice(index, 1);
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
    // @ts-expect-error TS(7006) FIXME: Parameter 'callback' implicitly has an 'any' type.
    function getDataArray(callback) {
        // Convert the data.entries object into an array
        let entriesArray = Object.keys(data.entries).map(uid => {
            const entry = data.entries[uid];
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                return null;
            }
            entry.displayIndex = entry.displayIndex ?? entry.uid;
            return entry;
        }).filter(entry => entry !== null);

        // Apply the filter and do the chosen sorting
        entriesArray = addMissingWorldInfoFields(entriesArray);
        entriesArray = worldInfoFilter.applyFilters(entriesArray);
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
    /** @type {{ getCurrentPage: () => number, go: (page: number) => void } | null} */
    let wiPaginator = null;

    const pagEl = document.getElementById('world_info_pagination');

    if (navigation === navigation_option.previous && wiPaginator) {
        startPage = wiPaginator.getCurrentPage();
    }

    if (typeof navigation === 'number' && Number(navigation) >= 0) {
        // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
        const data = getDataArray();
        const uidIndex = data.findIndex(x => x.uid === navigation);
        const perPage = Number(accountStorage.getItem(storageKey)) || perPageDefault;
        startPage = Math.floor(uidIndex / perPage) + 1;
    }

    if (pagEl) {
        const storageKey = 'WI_PerPage';
        const perPage = Number(accountStorage.getItem(storageKey)) || perPageDefault;
        wiPaginator = createPaginator(pagEl, {
            dataSource: getDataArray,
            pageSize: perPage,
            pageNumber: startPage,
            showSizeChanger: true,
            sizeChangerOptions: [10, 25, 50, 100, 500, 1000],
            showNavigator: true,
            prevText: '<',
            nextText: '>',
            callback: async function (/** @type {object[]} */ page) {
                try {
                    clearEntryList(worldEntriesList);

                    const keywordHeaders = await renderTemplateAsync('worldInfoKeywordHeaders');
                    const blocks = [];

                    for (const entry of page) {
                        try {
                            const block = await getWorldEntry(name, data, entry);
                            if (block) {
                                blocks.push(block);
                            }
                        } catch (error) {
                            console.error(`Error while processing entry ${entry.uid}:`, error);
                        }
                    }

                    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                    const isCustomOrder = document.getElementById('world_info_sort_order').options[document.getElementById('world_info_sort_order').selectedIndex]?.getAttribute('data-rule') === 'custom';
                    if (!isCustomOrder) {
                        blocks.forEach(block => {
                            block.querySelectorAll('.drag-handle').forEach(el => el.remove());
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
            onPageSizeChange: function (e) {
                accountStorage.setItem(storageKey, e.target.value);
            },
            afterPaging: function () {
                document.querySelectorAll('#world_popup_entries_list textarea[name="comment"]').forEach(function (el) {
                    initScrollHeight(/** @type {HTMLElement} */(el));
                });
            },
        });

        if (typeof navigation === 'number' && Number(navigation) >= 0) {
            wiPaginator.go(startPage);
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

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('world_popup_new').addEventListener('click', async () => {
        const entry = await createWorldInfoEntry(store);
        if (entry) {
            data.entries[entry.uid] = entry;
            await saveWorldInfo(name, data);
            updateEditor(entry.uid);
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('world_popup_name_button').addEventListener('click', async () => {
        await renameWorldInfo(name, data);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('world_backfill_memos').addEventListener('click', async () => {
        let counter = 0;
        for (const entry of Object.values(data.entries)) {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            if (!entry.comment && Array.isArray(entry.key) && entry.key.length > 0) {
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                entry.comment = entry.key.join(', ').slice(0, MAX_COMMENT_LENGTH);
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                setWIOriginalDataValue(data, entry.uid, 'comment', entry.comment);
                counter++;
            }
        }

        if (counter > 0) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.info(`Backfilled ${counter} titles`);
            await saveWorldInfo(name, data);
            updateEditor(navigation_option.previous);
        }
    });

    document.getElementById('world_apply_current_sorting')!.addEventListener('click', async () => {
        const entryCount = Object.keys(data.entries).length;
        const moreThan100 = entryCount > 100;

        let content = '<span>' + t`Apply your current sorting to the "Order" field. The Order values will go down from the chosen number.` + '</span>';
        if (moreThan100) {
            content += '<div class="m-t-1"><i class="fa-solid fa-triangle-exclamation" style="color: #FFD43B;"></i> ' + t`More than 100 entries in this world. If you don't choose a number higher than that, the lower entries will default to 0.<br />(Usual default: 100)<br />Minimum: ${entryCount}` + '</div>';
        }

        const result = await Popup.show.input(t`Apply Current Sorting`, content, '100', { okButton: t`Apply`, cancelButton: 'Cancel' });
        if (!result) return;

        const start = Number(result);
        if (isNaN(start) || start < 0) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.error(t`Invalid number: ${result}`, t`Apply Current Sorting`);
            return;
        }
        if (start < entryCount) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.warning(t`A number lower than the entry count has been chosen. All entries below that will default to 0.`, t`Apply Current Sorting`);
        }

        // We need to sort the entries here, as the data source isn't sorted
        const entries = Object.values(data.entries);
        sortWorldInfoEntries(entries);

        let updated = 0, current = start;
        for (const entry of entries) {
            const newOrder = Math.max(current--, 0);
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            if (entry.order === newOrder) continue;

            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            entry.order = newOrder;
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            setWIOriginalDataValue(data, entry.order, 'order', entry.order);
            updated++;
        }

        if (updated > 0) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.info(`Updated ${updated} Order values`, 'Apply Custom Sorting');
            await saveWorldInfo(name, data, true);
            updateEditor(navigation_option.previous);
        } else {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
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
        // Find current name for the world selected
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const selectedIndex = String(document.getElementById('world_editor_select').options[document.getElementById('world_editor_select').selectedIndex].value);
        const worldName = wiManager.worldNames[selectedIndex] || null;

        // Use the current name as default input, then ask user for the name
        const tempName = getFreeWorldName(worldName);
        const finalName = await Popup.show.input('Create a new World Info?', 'Enter a name for the new file:', tempName);

        if (finalName) {
            await saveWorldInfo(finalName, data, true);
            await updateWorldInfoList();

            const selectedIndex = wiManager.worldNames.indexOf(finalName);
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
    const worldEntriesListAny = worldEntriesList as any;
    if (worldEntriesListAny?.sortableInstance) {
        // Destroy the instance
        worldEntriesListAny.sortableInstance.destroy();
    }

    if (worldEntriesListAny) {
        // @ts-expect-error TS(7006) FIXME: Parameter '_event' implicitly has an 'any' type.
        worldEntriesListAny.sortableInstance = new Sortable(worldEntriesListAny, {
            delay: getSortableDelay(),
            handle: '.drag-handle',
            // @ts-expect-error TS(7006) FIXME: Parameter '_event' implicitly has an 'any' type.
            onEnd: async function () {
                // @ts-expect-error TS(2339) FIXME: Property 'dataset' does not exist on type 'Element... Remove this comment to see the full error message
                const firstEntryUid = document.querySelector('#world_popup_entries_list .world_entry')?.dataset.uid;
            const minDisplayIndex = data?.entries[firstEntryUid]?.displayIndex ?? 0;
            document.querySelectorAll('#world_popup_entries_list .world_entry').forEach(function (el, index) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                const uid = /** @type {HTMLElement} */(el).dataset.uid;

                // Update the display index in the data array
                const item = data.entries[uid];

                if (!item) {
                    console.debug(`Could not find entry with uid ${uid}`);
                    return;
                }

                item.displayIndex = minDisplayIndex + index;
                setWIOriginalDataValue(data, uid, 'extensions.display_index', item.displayIndex);
            });

            console.table(Object.keys(data.entries).map(uid => data.entries[uid]).map(x => ({ uid: x.uid, key: x.key.join(','), displayIndex: x.displayIndex })));

            await saveWorldInfo(name, data);
        },
    });
    }

    //$("#world_popup_entries_list").disableSelection();
}

/** Checks the state of the current search, and adds/removes the search sorting option accordingly */
function verifyWorldInfoSearchSortRule() {
    const searchTerm = worldInfoFilter.getFilterData(FILTER_TYPES.WORLD_INFO_SEARCH);
    const searchOption = document.querySelector('#world_info_sort_order option[data-rule="search"]');
    const selector = document.getElementById('world_info_sort_order');
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
// @ts-expect-error TS(7006) FIXME: Parameter 'input' implicitly has an 'any' type.
export function splitKeywordsAndRegexes(input) {
    /** @type {string[]} */
    // @ts-expect-error TS(7034) FIXME: Variable 'keywordsAndRegexes' implicitly has type ... Remove this comment to see the full error message
    const keywordsAndRegexes = [];

    // We can make this easy. Instead of writing another function to find and parse regexes,
    // we gonna utilize the custom tokenizer that also handles the input.
    // No need for validation here
    // @ts-expect-error TS(7006) FIXME: Parameter 'item' implicitly has an 'any' type.
    const addFindCallback = (/** @type {Select2Option} */ item) => {
        keywordsAndRegexes.push(item.text);
    };

    const { term } = customTokenizer({ _type: 'custom_call', term: input }, undefined, addFindCallback);
    const finalTerm = term.trim();
    if (finalTerm) {
        addFindCallback({ id: getSelect2OptionId(finalTerm), text: finalTerm });
    }

    // @ts-expect-error TS(7005) FIXME: Variable 'keywordsAndRegexes' implicitly has an 'a... Remove this comment to see the full error message
    return keywordsAndRegexes;
}

/**
 * Tokenizer parsing input and splitting it into keywords and regexes
 * @param {{_type: string, term: string}} input - The typed input
 * @param {{options: object}} _selection - The selection even object (?)
 * @param {function(Select2Option):void} callback - The original callback function to call if an item should be inserted
 * @returns {{term: string}} - The remaining part that is untokenized in the textbox
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'input' implicitly has an 'any' type.
function customTokenizer(input, _selection, callback) {
    let current = input.term;

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
                    // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
                    const tokens = token.split(',').map(x => x.trim());
                    // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
                    tokens.forEach(x => callback({ id: getSelect2OptionId(x), text: x }));
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
// @ts-expect-error TS(7031) FIXME: Binding element 'template' implicitly has an 'any'... Remove this comment to see the full error message
function enableKeysInputHelper({ template, entry, entryPropName, originalDataValueName, name, data }) {
    // @ts-expect-error TS(2339) FIXME: Property 'wi_key_input_plaintext' does not exist o... Remove this comment to see the full error message
    const isFancyInput = !isMobile() && !power_user.wi_key_input_plaintext;
    const input = isFancyInput ?
        template?.querySelector(`select[name="${entryPropName}"]`) :
        template?.querySelector(`textarea[name="${entryPropName}"]`);
    if (!input) return { isFancy: false, control: null };
    input.dataset.uid = String(entry.uid);
    input.dataset.macros = ''; // active
    // Toggle visibility between select (fancy) and textarea (plaintext)
    const selectEl = template?.querySelector(`select[name="${entryPropName}"]`);
    const textareaEl = template?.querySelector(`textarea[name="${entryPropName}"]`);
    if (isFancyInput) {
        if (selectEl) selectEl.style.display = '';
        if (textareaEl) textareaEl.style.display = 'none';
    } else {
        if (selectEl) selectEl.style.display = 'none';
        if (textareaEl) textareaEl.style.display = '';
    }
    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    input.addEventListener('click', function (event) {
        event.stopPropagation();
    });

    /**
     * @param {object} item - The select2 item object
     * @param {object} root0 - Options object
     * @param {boolean} [root0.searchStyle] - Whether to apply search style
     * @returns {JQuery<HTMLElement>|Element} The styled element
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'item' implicitly has an 'any' type.
    function templateStyling(item, { searchStyle = false } = {}) {
        const content = document.createElement('span');
        content.classList.add('item');
        content.textContent = item.text;
        content.title = `${item.text}\n\nClick to edit`;
        const isRegex = isValidRegex(item.text);
        if (isRegex) {
            content.innerHTML = highlightRegex(item.text);
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
            itemCount.textContent = item.count;
            itemCount.title = `Used as a key ${item.count} ${item.count != 1 ? 'times' : 'time'} in this lorebook`;
            wrapper.append(itemCount);
            return wrapper;
        }
        return content;
    }

    if (isFancyInput) {
        // @ts-expect-error TS(2322) FIXME: Type '{ skipReset: true; noSave: true; }' is not a... Remove this comment to see the full error message
        select2ModifyOptions(input, entry[entryPropName], { select: true, changeEventArgs: { skipReset: true, noSave: true } });
        new TomSelect(input, {
            maxItems: null,
            plugins: ['remove_button'],
            create: true,
            createFilter: null,
            placeholder: input.getAttribute('placeholder'),
            valueField: 'id',
            labelField: 'text',
            searchField: ['text'],
            render: {
                // @ts-expect-error TS(7006) FIXME: Parameter 'item' implicitly has an 'any' type.
                option: item => templateStyling(item, { searchStyle: true }),
                // @ts-expect-error TS(7006) FIXME: Parameter 'item' implicitly has an 'any' type.
                item: item => templateStyling(item),
            },
            onItemAdd: function (value) {
                const option = this.options[value];
                if (option) updateWorldEntryKeyOptionsCache([option]);
            },
            onItemRemove: function (value) {
                const option = this.options[value];
                if (option) updateWorldEntryKeyOptionsCache([option], { remove: true });
            },
        });

        // TypeScript-safe event handler
        /**
         * @param {Event} _event
         * @param {{ skipReset?: boolean, noSave?: boolean }} [arg]
         */
        // @ts-expect-error TS(7006) FIXME: Parameter '_event' implicitly has an 'any' type.
        input.addEventListener('change', async function (_event, arg) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const uid = this.dataset.uid;
            const tomSelect = this.tomSelect;
            const keys = tomSelect ? tomSelect.items.map(id => tomSelect.options[id]?.text || id) : [];
            const skipReset = arg?.skipReset ?? false;
            const noSave = arg?.noSave ?? false;
            // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
            if (!skipReset) await resetScrollHeight(this);
            if (!noSave) {
                data.entries[uid][entryPropName] = keys;
                setWIOriginalDataValue(data, uid, originalDataValueName, data.entries[uid][entryPropName]);
                await saveWorldInfo(name, data);
            }
            // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
            this.classList.toggle('empty', !data.entries[uid][entryPropName].length);
            // Update the commentInput's placeholder for primary keys
            if (entryPropName === 'key') {
                const commentInput = /** @type {HTMLElement} */(_event.currentTarget.closest('.world_entry_form')?.querySelector('textarea[name="comment"]'));
                setCommentPlaceholder(data.entries[uid][entryPropName].join(', '), commentInput);
            }
        });

        input.classList.toggle('empty', !entry[entryPropName].length);

        // @ts-expect-error TS(7006) FIXME: Parameter 'target' implicitly has an 'any' type.
        select2ChoiceClickSubscribe(input, target => {
            const key = target.closest('.regex-highlight, .item')?.textContent || '';
            const tomSelect = input.tomSelect;
            if (!tomSelect) return;
            const values = tomSelect.getValue() ? tomSelect.getValue().split(',') : [];
            const id = getSelect2OptionId(key);
            const index = values.indexOf(id);
            if (index > -1) {
                values.splice(index, 1);
                tomSelect.setValue(values.join(','));
            }
            updateWorldEntryKeyOptionsCache([key], { remove: true });
            // Set the search input value to allow re-adding
            const tsInput = input.closest('.ts-wrapper')?.querySelector('.ts-control input');
            if (tsInput) {
                tsInput.value = key;
                tsInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }, { openDrawer: true });
    } else {
const selEl = template[0]?.querySelector(`select[name="${entryPropName}"]`); if (selEl) selEl.style.display = 'none';
        if (input) input.style.display = '';
        /**
         * @param {Event} _event
         * @param {{ skipReset?: boolean, noSave?: boolean }} [arg]
         */
        input.addEventListener('input', async function (this: any, _event: Event) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const uid = this.dataset.uid;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const value = String(this.value);
            const detail = _event instanceof CustomEvent ? _event.detail : {};
            const skipReset = detail.skipReset ?? false;
            const noSave = detail.noSave ?? false;
            if (!skipReset) await resetScrollHeight(this);
            if (!noSave) {
                data.entries[uid][entryPropName] = splitKeywordsAndRegexes(value);
                setWIOriginalDataValue(data, uid, originalDataValueName, data.entries[uid][entryPropName]);
                await saveWorldInfo(name, data);
                this.classList.toggle('empty', !data.entries[uid][entryPropName].length);
            }
            // Update the commentInput's placeholder for primary keys
            if (entryPropName === 'key') {
                const commentInput = this.closest('.world_entry_form')?.querySelector('textarea[name="comment"]');
                setCommentPlaceholder(value, commentInput);
            }
        });
        input.value = entry[entryPropName].join(', ');
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
// @ts-expect-error TS(7031) FIXME: Binding element 'template' implicitly has an 'any'... Remove this comment to see the full error message
/**
 * Generic field binder for WI entry editors.
 *
 * Wires an input/select element so changes flow:
 *   element → data.entries[uid] → originalData → saveWorldInfo
 *
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
    entry: any,
    fieldName: string,
    data: any,
    name: string,
    opts: {
        read?: (el: any) => any;
        write?: (el: any, v: any) => void;
        keyPath?: string;
        init?: any;
        transform?: (v: any) => any;
        onSave?: (uid: string, value: any) => void;
    } = {},
) {
    const keyPath = opts.keyPath ?? originalWIDataKeyMap[fieldName] ?? fieldName;
    const read = opts.read ?? ((el: any) => el.value);
    const write = opts.write ?? ((el: any, v: any) => { el.value = v; });
    const transform = opts.transform ?? ((v: any) => v);

    el.dataset.uid = String(entry.uid);
    el.addEventListener('input', async function (this: any, e: Event) {
        const uid = this.dataset.uid;
        const raw = read(this);
        const value = transform(raw);
        const noSave = e instanceof CustomEvent ? (e as CustomEvent).detail?.noSave : false;
        data.entries[uid][fieldName] = value;
        setWIOriginalDataValue(data, uid, keyPath, value);
        if (opts.onSave) opts.onSave(uid, value);
        if (!noSave) await saveWorldInfo(name, data);
    });
    write(el, opts.init ?? (entry[fieldName] ?? ''));
    el.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
}

/**
 * Helper to handle match checkboxes for WI entries.
 */
function handleMatchCheckboxHelper({ template, entry, fieldName, data, name }) {
    const el = template.querySelector(`input[type="checkbox"][name="${fieldName}"]`);
    if (!el) return;
    bindEntryField(el, entry, fieldName, data, name, {
        read: (el: any) => el.checked,
        write: (el: any, v: any) => { el.checked = !!v; },
    });
}

/**
 * Helper to update position/order display.
 * @param {object} params - Parameters for updating position/order display.
 * @param {JQuery<HTMLElement>} params.template - The template element containing the display.
 * @param {object} params.data - The data object containing entries.
 * @param {string} params.uid - The unique identifier of the entry to update.
 */
// @ts-expect-error TS(7031) FIXME: Binding element 'template' implicitly has an 'any'... Remove this comment to see the full error message
function updatePosOrdDisplayHelper({ template, data, uid }) {
    const entry = data.entries[uid];
    let posText = entry.position;
    switch (entry.position) {
        case 0: posText = '↑CD'; break;
        case 1: posText = 'CD↓'; break;
        case 2: posText = '↑AN'; break;
        case 3: posText = 'AN↓'; break;
        case 4: posText = `@D${entry.depth}`; break;
    }
    const posEl = template?.querySelector('.world_entry_form_position_value');
    if (posEl) posEl.textContent = `(${posText} ${entry.order})`;
}

/**
 * Helper to initialize character filter select2.
 * @param {JQuery<HTMLElement>} characterFilter - The select element for character filter.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'characterFilter' implicitly has an 'any... Remove this comment to see the full error message
function initCharacterFilterSelect2Helper(characterFilter) {
    if (!isMobile()) {
        new TomSelect(characterFilter, {
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
// @ts-expect-error TS(7031) FIXME: Binding element 'characterFilter' implicitly has a... Remove this comment to see the full error message
function fillCharacterAndTagOptionsHelper({ characterFilter, entry }) {
    const characters = getContext().characters;
    characters.forEach((character) => {
        const option = document.createElement('option');
        const name = character.avatar.replace(/\.[^/.]+$/, '') ?? character.name;
        option.innerText = name;
        option.selected = entry.characterFilter?.names?.includes(name);
        option.setAttribute('data-type', 'character');
        characterFilter.append(option);
    });
    const tags = getContext().tags;
    tags.forEach((tag) => {
        const option = document.createElement('option');
        option.innerText = `[Tag] ${tag.name}`;
        option.selected = entry.characterFilter?.tags?.includes(tag.id);
        option.value = tag.id;
        option.setAttribute('data-type', 'tag');
        characterFilter.append(option);
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
// @ts-expect-error TS(7031) FIXME: Binding element 'characterFilter' implicitly has a... Remove this comment to see the full error message
function handleCharacterFilterChangeHelper({ characterFilter, data, entry, name }) {
    if (!characterFilter) return;

    /** Shared: reads the selected options and writes them into data.entries[uid] */
    async function saveFilterSelection(uid, selectedOptions) {
        if ((!selectedOptions || selectedOptions?.length === 0) && !data.entries[uid].characterFilter?.isExclude) {
            delete data.entries[uid].characterFilter;
        } else {
            const names = Array.from(selectedOptions).filter(o => o.matches('[data-type="character"]')).map(o => o instanceof HTMLOptionElement && o.innerText);
            const tags = Array.from(selectedOptions).filter(o => o.matches('[data-type="tag"]')).map(o => o instanceof HTMLOptionElement && o.value);
            Object.assign(data.entries[uid], {
                characterFilter: {
                    isExclude: data.entries[uid].characterFilter?.isExclude ?? false,
                    names: names,
                    tags: tags,
                },
            });
        }
        setWIOriginalDataValue(data, uid, 'character_filter', data.entries[uid].characterFilter);
        await saveWorldInfo(name, data);
    }

    characterFilter.addEventListener('mousedown', async function (this: any, e: Event) {
        if (wiManager.worldNames.length === 0) { e.preventDefault(); return; }
        await saveFilterSelection(this.dataset.uid, this.selectedOptions);
    });
    characterFilter.addEventListener('change', async function (this: any) {
        if (wiManager.worldNames.length === 0) return;
        await saveFilterSelection(this.dataset.uid, this.selectedOptions);
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
// @ts-expect-error TS(7031) FIXME: Binding element 'probabilityInput' implicitly has ... Remove this comment to see the full error message
function handleProbabilityInputHelper({ probabilityInput, data, entry, name }) {
    bindEntryField(probabilityInput[0], entry, 'probability', data, name, {
        read: (el: any) => Number(el.value),
        write: (el: any, v: any) => { el.value = v ?? ''; },
        transform: (v: any) => isNaN(v) ? null : Math.min(100, Math.max(0, v)),
        onSave: (uid, value) => {
            if (value !== null && value !== Number(probabilityInput[0].value)) {
                probabilityInput[0].value = value;
            }
        },
    });
    probabilityInput[0].style.width = 'calc(3em + 15px)';
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
// @ts-expect-error TS(7031) FIXME: Binding element 'probabilityToggle' implicitly has... Remove this comment to see the full error message
function handleProbabilityToggleHelper({ probabilityToggle, data, entry, name, probabilityInput }) {
    probabilityToggle[0].dataset.uid = String(entry.uid);
    probabilityToggle[0].addEventListener('input', async function (this: any, e: Event) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const uid = this.dataset.uid;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = this.checked;
        const data_noSave = e instanceof CustomEvent ? e.detail?.noSave : false;
        data.entries[uid].useProbability = value;
        const probabilityContainer = this.closest('.world_entry')?.querySelector('.probabilityContainer');
        if (!data_noSave) await saveWorldInfo(name, data);
        if (value && probabilityContainer) probabilityContainer.style.display = ''; else if (probabilityContainer) probabilityContainer.style.display = 'none';
        if (value && data.entries[uid].probability === null) {
            data.entries[uid].probability = 100;
        }
        if (!value) {
            data.entries[uid].probability = null;
        }
        probabilityInput[0].value = data.entries[uid].probability;
        probabilityInput[0].dispatchEvent(new CustomEvent('input', { detail: { noSave: data_noSave } }));
    });
    probabilityToggle[0].checked = true;
    probabilityToggle[0].dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
    if (probabilityToggle[0]?.parentElement) probabilityToggle[0].parentElement.style.display = 'none';
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
// @ts-expect-error TS(7031) FIXME: Binding element 'selectElem' implicitly has an 'an... Remove this comment to see the full error message
function handleBooleanSelectHelper({ selectElem, entry, entryKey, data, name }) {
    bindEntryField(selectElem[0], entry, entryKey, data, name, {
        read: (el: any) => el.value === 'null' ? null : el.value === 'true',
        write: (el: any, v: any) => {
            el.value = (v === null || v === undefined) ? 'null' : v ? 'true' : 'false';
        },
        transform: (v: any) => v,
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
// @ts-expect-error TS(7031) FIXME: Binding element 'inputElem' implicitly has an 'any... Remove this comment to see the full error message
function handleNumberInputHelper({ inputElem, entry, entryKey, data, name, min, max, clamp = false }) {
    bindEntryField(inputElem[0], entry, entryKey, data, name, {
        read: (el: any) => !isNaN(Number(el.value)) ? Number(el.value) : null,
        write: (el: any, v: any) => { el.value = v ?? (clamp ? min : ''); },
        transform: (v: any) => {
            if (v === null || isNaN(v)) return null;
            if (clamp) {
                if (v < min) return min;
                if (v > max) return max;
            }
            return v;
        },
        onSave: (uid, value) => {
            if (clamp && value !== null) {
                if (value < min) { inputElem[0].value = min; }
                if (value > max) { inputElem[0].value = max; }
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
// @ts-expect-error TS(7031) FIXME: Binding element 'entryStateSelector' implicitly ha... Remove this comment to see the full error message
function handleEntryStateSelectorHelper({ entryStateSelector, entry, data, name }) {
    entryStateSelector[0].dataset.uid = String(entry.uid);
    entryStateSelector[0].addEventListener('click', function (this: any, event: Event) {
        event.stopPropagation();
    });
    entryStateSelector[0].addEventListener('input', async function (this: any, e: Event) {
        const uid = entry.uid;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = this.value;
        const data_noSave = e instanceof CustomEvent ? e.detail?.noSave : false;
        switch (value) {
            case 'constant':
                data.entries[uid].constant = true;
                data.entries[uid].vectorized = false;
                setWIOriginalDataValue(data, uid, 'constant', true);
                setWIOriginalDataValue(data, uid, 'extensions.vectorized', false);
                break;
            case 'normal':
                data.entries[uid].constant = false;
                data.entries[uid].vectorized = false;
                setWIOriginalDataValue(data, uid, 'constant', false);
                setWIOriginalDataValue(data, uid, 'extensions.vectorized', false);
                break;
            case 'vectorized':
                data.entries[uid].constant = false;
                data.entries[uid].vectorized = true;
                setWIOriginalDataValue(data, uid, 'constant', false);
                setWIOriginalDataValue(data, uid, 'extensions.vectorized', true);
                break;
        }
        if (!data_noSave) await saveWorldInfo(name, data);
    });
    const entryState = () => entry.constant === true ? 'constant' : entry.vectorized === true ? 'vectorized' : 'normal';
    const option = entryStateSelector[0].querySelector(`option[value="${entryState()}"]`);
    if (option) option.selected = true;
    entryStateSelector[0].dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
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
// @ts-expect-error TS(7031) FIXME: Binding element 'entryKillSwitch' implicitly has a... Remove this comment to see the full error message
function handleEntryKillSwitchHelper({ entryKillSwitch, entry, data, name, template }) {
    entryKillSwitch[0].dataset.uid = String(entry.uid);
    entryKillSwitch[0].addEventListener('click', async function () {
        const uid = entry.uid;
        data.entries[uid].disable = !data.entries[uid].disable;
        const isActive = !data.entries[uid].disable;
        setWIOriginalDataValue(data, uid, 'enabled', isActive);
        template[0].classList.toggle('disabledWIEntry', !isActive);
        entryKillSwitch[0].classList.toggle('fa-toggle-off', !isActive);
        entryKillSwitch[0].classList.toggle('fa-toggle-on', isActive);
        await saveWorldInfo(name, data);
    });
    const isActive = !entry.disable;
    if (template) template.classList.toggle('disabledWIEntry', !isActive);
    entryKillSwitch[0].classList.toggle('fa-toggle-off', !isActive);
    entryKillSwitch[0].classList.toggle('fa-toggle-on', isActive);
}

/**
 * Update commentInput's placeholder.
 * @param {string} keys Text to display in commentInput's placeholder.
 * @param {JQuery<HTMLElement>} commentInput The comment input element.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'keys' implicitly has an 'any' type.
function setCommentPlaceholder(keys, commentInput) {
    // Limit placeholder text to avoid performance issues.
    keys = keys.slice(0, MAX_COMMENT_LENGTH);
    if (commentInput) commentInput.placeholder = (keys || t`Entry Title/Memo`);
}

/**
 * Main function to build the WI entry editor template.
 * @param {string} name - The name of the world info file.
 * @param {object} data - The world info data object.
 * @param {object} entry - The entry object to be edited.
 * @returns {Promise<JQuery<HTMLElement>>} The entry header template element
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export async function getWorldEntry(name, data, entry) {
    if (!data.entries[entry.uid]) return;

    // Initialize store for this book
    const store = wiManager.getStore(name);
    await store.init();

    // Hydrate store if empty (covers standalone usage outside displayWorldEntries)
    if (data.entries) {
        const count = await store.entryCount();
        if (count === 0) {
            const entryList = Object.values(data.entries).filter(Boolean);
            if (entryList.length > 0) {
                await store.replaceAllEntries(entryList);
            }
        }
    }

    const headerTemplate = WI_ENTRY_HEADER_TEMPLATE?.cloneNode(true) as HTMLElement | null;
    if (headerTemplate) {
        headerTemplate.dataset.uid = String(entry.uid);
        headerTemplate.setAttribute('uid', String(entry.uid));
    }

    // @ts-expect-error TS(2339) FIXME: Property 'wi_key_input_plaintext' does not exist o... Remove this comment to see the full error message
    if (typeof power_user.wi_key_input_plaintext === 'undefined') power_user.wi_key_input_plaintext = true;

    // Comment
    const commentInput = headerTemplate?.querySelector('textarea[name="comment"]');

    //Update the commentInput's placeholder.
    const keys = entry.key.join(', ');
    setCommentPlaceholder(keys, commentInput);

    if (commentInput) commentInput.dataset.uid = String(entry.uid);
    commentInput?.addEventListener('input', async function (this: any, e: Event) {
        const uid = this.dataset.uid;
        const value = this.value;
        const detail = e instanceof CustomEvent ? e.detail : {};
        const skipReset = detail.skipReset ?? false;
        const data_noSave = detail.noSave ?? false;
        if (!skipReset) await resetScrollHeight(this);
        data.entries[uid].comment = value;
        setWIOriginalDataValue(data, uid, 'comment', data.entries[uid].comment);
        if (!data_noSave) await saveWorldInfo(name, data);
    });
    if (commentInput) {
        commentInput.value = entry.comment;
        commentInput.dispatchEvent(new CustomEvent('input', { detail: { skipReset: true, noSave: true } }));
    }

    // Order
    const orderInput = headerTemplate.querySelectorAll('input[name="order"]');
    orderInput[0].dataset.uid = String(entry.uid);
    // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
    orderInput[0].addEventListener('input', async function (e) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const uid = this.dataset.uid;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = Number(this.value);
        const data_noSave = e instanceof CustomEvent ? e.detail?.noSave : false;
        data.entries[uid].order = !isNaN(value) ? value : 0;
        updatePosOrdDisplayHelper({ template: headerTemplate, data, uid });
        setWIOriginalDataValue(data, uid, 'insertion_order', data.entries[uid].order);
        if (!data_noSave) await saveWorldInfo(name, data);
    });
    orderInput[0].value = entry.order;
    orderInput[0].dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
    orderInput[0].style.width = 'calc(3em + 15px)';

    // Probability
    handleProbabilityInputHelper({ probabilityInput: headerTemplate.querySelectorAll('input[name="probability"]'), data, entry, name });

    // Depth
    handleNumberInputHelper({
        inputElem: headerTemplate.querySelectorAll('input[name="depth"]'),
        entry, entryKey: 'depth', data, name, min: 0, max: MAX_SCAN_DEPTH, clamp: false,
    });
    headerTemplate.querySelector('input[name="depth"]').style.width = 'calc(3em + 15px)';

    // Position
    if (entry.position === undefined) entry.position = 0;
    const positionInput = headerTemplate.querySelectorAll('select[name="position"]');
    positionInput[0].dataset.uid = String(entry.uid);
    positionInput[0].addEventListener('click', (e: Event) => e.stopPropagation());
    positionInput[0].addEventListener('input', async function (this: any, e: Event) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const uid = this.dataset.uid;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = Number(this.value);
        const data_noSave = e instanceof CustomEvent ? e.detail?.noSave : false;
        data.entries[uid].position = !isNaN(value) ? value : 0;
        const depthInput = headerTemplate?.querySelector('input[name="depth"]');
        if (value === world_info_position.atDepth) {
            if (depthInput) depthInput.disabled = false;
            if (depthInput) depthInput.style.visibility = 'visible';
            const role = Number(this.options[this.selectedIndex]?.getAttribute('data-role'));
            data.entries[uid].role = role;
        } else {
            if (depthInput) depthInput.disabled = true;
            if (depthInput) depthInput.style.visibility = 'hidden';
            data.entries[uid].role = null;
        }
        updatePosOrdDisplayHelper({ template: headerTemplate, data, uid });
        setWIOriginalDataValue(data, uid, 'position', data.entries[uid].position == 0 ? 'before_char' : 'after_char');
        setWIOriginalDataValue(data, uid, 'extensions.position', data.entries[uid].position);
        setWIOriginalDataValue(data, uid, 'extensions.role', data.entries[uid].role);
        if (!data_noSave) await saveWorldInfo(name, data);
    });
    const roleValue = entry.position === world_info_position.atDepth ? String(entry.role ?? extension_prompt_roles.SYSTEM) : '';
    const posOption = headerTemplate?.querySelector(`select[name="position"] option[value="${entry.position}"][data-role="${roleValue}"]`);
    if (posOption instanceof HTMLOptionElement) posOption.selected = true;
    positionInput[0].dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));

    // Tri-state selector
    handleEntryStateSelectorHelper({
        entryStateSelector: headerTemplate.querySelectorAll('select[name="entryStateSelector"]'),
        entry, data, name,
    });

    // Kill switch
    handleEntryKillSwitchHelper({
        entryKillSwitch: headerTemplate.querySelectorAll('div[name="entryKillSwitch"]'),
        entry, data, name, template: headerTemplate,
    });

    // Duplicate/delete/move buttons
    const duplicateBtn = headerTemplate.querySelectorAll('.duplicate_entry_button');
    duplicateBtn[0].dataset.uid = String(entry.uid);
    duplicateBtn[0].addEventListener('click', async function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const uid = this.dataset.uid;
        const entryDup = await duplicateWorldInfoEntry(store, Number(uid));
        if (entryDup) {
            data.entries[entryDup.uid] = entryDup;
            await saveWorldInfo(name, data);
            updateEditor(entryDup.uid);
        }
    });
    const deleteBtn = headerTemplate.querySelectorAll('.delete_entry_button');
    deleteBtn[0].dataset.uid = String(entry.uid);
    deleteBtn[0].addEventListener('click', async function (this: any, e: Event) {
        e.stopPropagation();
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const uid = this.dataset.uid;
        const deleted = await deleteWorldInfoEntry(store, Number(uid));
        if (!deleted) return;
        delete data.entries[uid];
        deleteWIOriginalDataValue(data, uid);
        await saveWorldInfo(name, data);
        updateEditor(navigation_option.previous);
    });
    const moveBtn = headerTemplate.querySelectorAll('.move_entry_button');
    moveBtn[0].setAttribute('data-uid', String(entry.uid));
    moveBtn[0].setAttribute('data-current-world', name);
    moveBtn[0].addEventListener('click', async function (this: any, e: Event) {
        e.stopPropagation();
        const sourceUid = this.getAttribute('data-uid');
        const sourceWorld = this.getAttribute('data-current-world');
        const sourceWorldInfo = await loadWorldInfo(sourceWorld);
        if (!sourceWorldInfo) return;
        const sourceName = sourceWorldInfo.entries[sourceUid]?.comment;
        if (sourceName === undefined) return;
        const select = document.createElement('select');
        select.id = 'move_entry_target_select';
        select.classList.add('text_pole', 'wide100p', 'marginTop10');
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = `-- ${t`Select Target Lorebook`} --`;
        select.appendChild(defaultOption);
        let selectableWorldCount = 0;
        // @ts-expect-error TS(7006) FIXME: Parameter 'worldName' implicitly has an 'any' type... Remove this comment to see the full error message
        wiManager.worldNames.forEach(worldName => {
            if (worldName !== sourceWorld) {
                const option = document.createElement('option');
                option.value = wiManager.worldNames.indexOf(worldName).toString();
                option.textContent = worldName;
                select.appendChild(option);
                selectableWorldCount++;
            }
        });
        if (selectableWorldCount === 0) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
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
            // @ts-expect-error TS(2322) FIXME: Type '{ text: any; result: number; }[]' is not ass... Remove this comment to see the full error message
            customButtons: [
                { text: t`Move`, result: POPUP_RESULT.CUSTOM1 },
                { text: t`Copy`, result: POPUP_RESULT.CUSTOM2 },
            ],
        });
        popup.okButton.style.display = 'none'; // Hide the default OK button
        const popupConfirm = await popup.show();
        if (!popupConfirm) return;
        if (selectedWorldIndex === -1) return;
        const selectedValue = wiManager.worldNames[selectedWorldIndex];
        if (!selectedValue) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.warning(t`Please select a target lorebook.`);
            return;
        }
        const deleteOriginal = popupConfirm === POPUP_RESULT.CUSTOM1;
        await moveWorldInfoEntry(sourceWorld, selectedValue, sourceUid, { deleteOriginal });
    });

    let drawerInitialized = false;
    // @ts-expect-error TS(7034) FIXME: Variable 'drawerDestroyTimeout' implicitly has typ... Remove this comment to see the full error message
    let drawerDestroyTimeout = null;
    headerTemplate.querySelectorAll('.inline-drawer').forEach(el => el.addEventListener('inline-drawer-toggle', function () {
        // @ts-expect-error TS(7005) FIXME: Variable 'drawerDestroyTimeout' implicitly has an ... Remove this comment to see the full error message
        if (drawerDestroyTimeout) {
            clearTimeout(drawerDestroyTimeout);
            drawerDestroyTimeout = null;
        }
        if (drawerInitialized) {
            drawerDestroyTimeout = setTimeout(() => {
                // Drawer was reopened, so we don't destroy it
                if (editOutlet?.offsetParent !== null) {
                    return;
                }
                drawerInitialized = false;
                clearEntryList(editOutlet);
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
        const editTemplate = WI_ENTRY_EDIT_TEMPLATE?.cloneNode(true);

        // UID display
        const uidEl = editTemplate?.querySelector('.world_entry_form_uid_value');
        if (uidEl) uidEl.textContent = `(UID: ${entry.uid})`;

        // Key inputs
        const keyInput = enableKeysInputHelper({ template: editTemplate, entry, entryPropName: 'key', originalDataValueName: 'keys', name, data });
        const keySecondaryInput = enableKeysInputHelper({ template: editTemplate, entry, entryPropName: 'keysecondary', originalDataValueName: 'secondary_keys', name, data });
        if (!keyInput.isFancy) initScrollHeight(keyInput.control);
        if (!keySecondaryInput.isFancy) initScrollHeight(keySecondaryInput.control);

        // Key input switch
        editTemplate.querySelectorAll('.switch_input_type_icon').forEach(el => el.addEventListener('click', function () {
            // @ts-expect-error TS(2339) FIXME: Property 'wi_key_input_plaintext' does not exist o... Remove this comment to see the full error message
            power_user.wi_key_input_plaintext = !power_user.wi_key_input_plaintext;
            saveSettingsNow();
            const uid = this.closest('.world_entry').dataset.uid;
            updateEditor(uid, false);
            const inlineDrawerIcon = document.querySelector(`.world_entry[uid="${uid}"] .inline-drawer-icon`);
            if (inlineDrawerIcon) inlineDrawerIcon.click();
        }));
        editTemplate.querySelectorAll('.switch_input_type_icon').forEach((icon) => {
            const tooltipKey = power_user.wi_key_input_plaintext ? 'tooltip-on' : 'tooltip-off';
            const iconKey = power_user.wi_key_input_plaintext ? 'icon-on' : 'icon-off';
            icon.setAttribute('title', icon.dataset[tooltipKey]);
            icon.textContent = icon.dataset[iconKey];
        });

        // Probability toggle
        handleProbabilityToggleHelper({
            probabilityToggle: editTemplate.querySelectorAll('input[name="useProbability"]'),
            data, entry, name,
            probabilityInput: headerTemplate.querySelectorAll('input[name="probability"]'),
        });

        // Comment toggle
        const commentToggle = editTemplate.querySelectorAll('input[name="addMemo"]');
        commentToggle[0].dataset.uid = String(entry.uid);
        commentToggle[0].addEventListener('input', async function (this: any, e: Event) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const uid = this.dataset.uid;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const value = this.checked;
            const data_noSave = e instanceof CustomEvent ? e.detail?.noSave : false;
            const commentContainer = this.closest('.world_entry')?.querySelector('.commentContainer');
            data.entries[uid].addMemo = value;
            if (!data_noSave) await saveWorldInfo(name, data);
            if (value && commentContainer) commentContainer.style.display = ''; else if (commentContainer) commentContainer.style.display = 'none';
        });
        commentToggle[0].checked = true;
        commentToggle[0].dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
        if (commentToggle[0]?.parentElement) commentToggle[0].parentElement.style.display = 'none';

        // Logic AND/NOT
        const selectiveLogicDropdown = editTemplate.querySelectorAll('select[name="entryLogicType"]');
        selectiveLogicDropdown[0].dataset.uid = String(entry.uid);
        selectiveLogicDropdown[0].addEventListener('click', (e: Event) => e.stopPropagation());
        selectiveLogicDropdown[0].addEventListener('input', async function (this: any, e: Event) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const uid = this.dataset.uid;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const value = Number(this.value);
            const data_noSave = e instanceof CustomEvent ? e.detail?.noSave : false;
            data.entries[uid].selectiveLogic = !isNaN(value) ? value : world_info_logic.AND_ANY;
            setWIOriginalDataValue(data, uid, 'selectiveLogic', data.entries[uid].selectiveLogic);
            if (!data_noSave) await saveWorldInfo(name, data);
        });
        const logicOption = editTemplate?.querySelector(`select[name="entryLogicType"] option[value="${entry.selectiveLogic}"]`);
        if (logicOption instanceof HTMLOptionElement) logicOption.selected = true;
        selectiveLogicDropdown[0].dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));

        // Selective
        const selectiveInput = editTemplate.querySelectorAll('input[name="selective"]');
        selectiveInput[0].dataset.uid = String(entry.uid);
        selectiveInput[0].addEventListener('input', async function (this: any, e: Event) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const uid = this.dataset.uid;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const value = this.checked;
            const data_noSave = e instanceof CustomEvent ? e.detail?.noSave : false;
            data.entries[uid].selective = value;
            setWIOriginalDataValue(data, uid, 'selective', data.entries[uid].selective);
            if (!data_noSave) await saveWorldInfo(name, data);
            const keysecondary = this.closest('.world_entry')?.querySelector('.keysecondary');
            const keysecondarytextpole = this.closest('.world_entry')?.querySelector('.keysecondarytextpole');
            const keyprimaryselect = this.closest('.world_entry')?.querySelector('.keyprimaryselect');
            const keyprimaryHeight = keyprimaryselect?.offsetHeight ?? 0;
            if (keysecondarytextpole) keysecondarytextpole.style.height = keyprimaryHeight + 'px';
            if (keysecondary) keysecondary.style.display = value ? '' : 'none';
        });
        selectiveInput[0].checked = true;
        selectiveInput[0].dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
        if (selectiveInput[0]?.parentElement) selectiveInput[0].parentElement.style.display = 'none';

        // Character filter
        const characterFilterLabel = editTemplate?.querySelector('label[for="characterFilter"] > small');
        if (characterFilterLabel) {
            characterFilterLabel.textContent = entry.characterFilter?.isExclude ? 'Exclude Character(s)' : 'Filter to Character(s)';
        }
        const characterExclusionInput = editTemplate.querySelectorAll('input[name="character_exclusion"]');
        characterExclusionInput[0].dataset.uid = String(entry.uid);
        characterExclusionInput[0].addEventListener('input', async function (this: any, e: Event) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const uid = this.dataset.uid;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const value = this.checked;
            const data_noSave = e instanceof CustomEvent ? e.detail?.noSave : false;
            if (characterFilterLabel) characterFilterLabel.textContent = value ? 'Exclude Character(s)' : 'Filter to Character(s)';
            if (data.entries[uid].characterFilter) {
                if (!value && data.entries[uid].characterFilter.names.length === 0 && data.entries[uid].characterFilter.tags.length === 0) {
                    delete data.entries[uid].characterFilter;
                } else {
                    data.entries[uid].characterFilter.isExclude = value;
                }
            } else if (value) {
                Object.assign(data.entries[uid], { characterFilter: { isExclude: true, names: [], tags: [] } });
            }
            if (data.entries[uid]?.characterFilter?.names?.length > 0) {
                for (const name of [...data.entries[uid].characterFilter.names]) {
                    if (!getContext().characters.find(x => x.avatar.replace(/\.[^/.]+$/, '') === name)) {
                        // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
                        data.entries[uid].characterFilter.names = data.entries[uid].characterFilter.names.filter(x => x !== name);
                    }
                }
            }
            setWIOriginalDataValue(data, uid, 'character_filter', data.entries[uid].characterFilter);
            if (!data_noSave) await saveWorldInfo(name, data);
        });
        characterExclusionInput[0].checked = entry.characterFilter?.isExclude ?? false;
        characterExclusionInput[0].dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));

        const characterFilter = editTemplate.querySelector('select[name="characterFilter"]');
        if (characterFilter) {
            characterFilter.dataset.uid = String(entry.uid);
            initCharacterFilterSelect2Helper(characterFilter);
            fillCharacterAndTagOptionsHelper({ characterFilter, entry });
            handleCharacterFilterChangeHelper({ characterFilter, data, entry, name });
        }

        // Content
        const counter = editTemplate.querySelectorAll('.world_entry_form_token_counter');
        // @ts-expect-error TS(7006) FIXME: Parameter 'counter' implicitly has an 'any' type.
        const countTokensDebounced = debounce(async function (counter, value) {
            const numberOfTokens = await getTokenCountAsync(value);
            counter.textContent = String(numberOfTokens);
        }, debounce_timeout.relaxed);
        const contentInputId = `world_entry_content_${entry.uid}`;
        const contentInput = editTemplate?.querySelector('textarea[name="content"]');
        if (contentInput) {
            contentInput.dataset.uid = String(entry.uid);
            contentInput.id = contentInputId;
            contentInput.dataset.macros = ''; // active
            contentInput.addEventListener('input', async function (this: any, { skipCount = false, noSave = false } = {}) {
                const uid = this.dataset.uid;
                const value = this.value;
                data.entries[uid].content = value;
                setWIOriginalDataValue(data, uid, 'content', data.entries[uid].content);
                if (!noSave) await saveWorldInfo(name, data);
                if (!skipCount) countTokensDebounced(counter, value);
            });
            contentInput.value = entry.content;
            contentInput.dispatchEvent(new CustomEvent('input', { detail: { skipCount: true, noSave: true } }));
        }
        editTemplate?.querySelector('.editor_maximize')?.setAttribute('data-for', contentInputId);

        // Outlet name
        const outletNameInput = editTemplate?.querySelector('input[name="outletName"]');
        if (outletNameInput) {
            outletNameInput.dataset.uid = String(entry.uid);
            outletNameInput.addEventListener('input', async function (this: any, { noSave = false } = {}) {
                const uid = this.dataset.uid;
                const value = this.value;
                data.entries[uid].outletName = value;
                setWIOriginalDataValue(data, uid, 'extensions.outlet_name', data.entries[uid].outletName);
                if (!noSave) await saveWorldInfo(name, data);
            });
            outletNameInput.value = entry.outletName ?? '';
            outletNameInput.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
        }
        if (outletNameInput) setTimeout(() => createEntryInputAutocomplete(outletNameInput, getOutletNameCallback(data), { allowMultiple: true }), 1);

        // Scan depth
        const scanDepthInput = editTemplate?.querySelector('input[name="scanDepth"]');
        if (scanDepthInput) {
            scanDepthInput.dataset.uid = String(entry.uid);
            scanDepthInput.addEventListener('input', async function (this: any, { noSave = false } = {}) {
                const uid = this.dataset.uid;
                const isEmpty = this.value === '';
                const value = Number(this.value);
            if (value < 0) {
                this.value = '0';
                this.dispatchEvent(new Event('input', { bubbles: true }));
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                notyf.warning('Scan depth cannot be negative');
                return;
            }
            if (value > MAX_SCAN_DEPTH) {
                this.value = String(MAX_SCAN_DEPTH);
                this.dispatchEvent(new Event('input', { bubbles: true }));
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                notyf.warning(`Scan depth cannot exceed ${MAX_SCAN_DEPTH}`);
                return;
            }
            data.entries[uid].scanDepth = !isEmpty && !isNaN(value) && value >= 0 && value <= MAX_SCAN_DEPTH ? Math.floor(value) : null;
            setWIOriginalDataValue(data, uid, 'extensions.scan_depth', data.entries[uid].scanDepth);
            if (!noSave) await saveWorldInfo(name, data);
            });
            scanDepthInput.value = entry.scanDepth ?? '';
            scanDepthInput.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
        }

        // Group
        const groupInput = editTemplate?.querySelector('input[name="group"]');
        if (groupInput) {
            groupInput.dataset.uid = String(entry.uid);
            groupInput.addEventListener('input', async function (this: HTMLInputElement, e: Event) {
                const detail = (e instanceof CustomEvent) ? e.detail : {};
                const noSave = detail.noSave ?? false;
                const uid = this.dataset.uid;
                const value = String(this.value).trim();
                data.entries[uid].group = value;
                setWIOriginalDataValue(data, uid, 'extensions.group', data.entries[uid].group);
                if (!noSave) await saveWorldInfo(name, data);
            });
            groupInput.value = entry.group ?? '';
            groupInput.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
        }
        setTimeout(() => createEntryInputAutocomplete(groupInput, getInclusionGroupCallback(data), { allowMultiple: true }), 1);

        // Inclusion priority
        const groupOverrideInput = editTemplate?.querySelector('input[name="groupOverride"]');
        if (groupOverrideInput) {
            groupOverrideInput.dataset.uid = String(entry.uid);
            groupOverrideInput.addEventListener('input', async function (this: HTMLInputElement, e: Event) {
                const detail = (e instanceof CustomEvent) ? e.detail : {};
                const noSave = detail.noSave ?? false;
                const uid = this.dataset.uid;
                const value = this.checked;
                data.entries[uid].groupOverride = value;
                setWIOriginalDataValue(data, uid, 'extensions.group_override', data.entries[uid].groupOverride);
                if (!noSave) await saveWorldInfo(name, data);
            });
            groupOverrideInput.checked = !!entry.groupOverride;
            groupOverrideInput.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
        }

        // Group weight
        handleNumberInputHelper({
            inputElem: editTemplate.querySelectorAll('input[name="groupWeight"]'),
            entry, entryKey: 'groupWeight', data, name, min: 1, max: 10000, clamp: true,
        });

        // Sticky, cooldown, delay
        handleNumberInputHelper({
            inputElem: editTemplate.querySelectorAll('input[name="sticky"]'),
            entry, entryKey: 'sticky', data, name, min: 1, max: 10000, clamp: false,
        });
        handleNumberInputHelper({
            inputElem: editTemplate.querySelectorAll('input[name="cooldown"]'),
            entry, entryKey: 'cooldown', data, name, min: 1, max: 10000, clamp: false,
        });
        handleNumberInputHelper({
            inputElem: editTemplate.querySelectorAll('input[name="delay"]'),
            entry, entryKey: 'delay', data, name, min: 1, max: 10000, clamp: false,
        });

        // Exclude/prevent recursion
        handleMatchCheckboxHelper({ template: editTemplate, entry, fieldName: 'excludeRecursion', data, name });
        handleMatchCheckboxHelper({ template: editTemplate, entry, fieldName: 'preventRecursion', data, name });

        // Delay until recursion
        const delayUntilRecursionInput = editTemplate?.querySelector('input[name="delay_until_recursion"]');
        const delayUntilRecursionLevelInput = editTemplate?.querySelector('input[name="delayUntilRecursionLevel"]');
        if (delayUntilRecursionInput) {
            delayUntilRecursionInput.dataset.uid = String(entry.uid);
            delayUntilRecursionInput.addEventListener('input', async function (this: HTMLInputElement, e: Event) {
                const detail = (e instanceof CustomEvent) ? e.detail : {};
                const noSave = detail.noSave ?? false;
                const uid = this.dataset.uid;
                const toggled = this.checked;
                const value = toggled ? data.entries[uid].delayUntilRecursion || true : false;
                if (!toggled && delayUntilRecursionLevelInput) delayUntilRecursionLevelInput.value = '';
                data.entries[uid].delayUntilRecursion = value;
                setWIOriginalDataValue(data, uid, 'extensions.delay_until_recursion', data.entries[uid].delayUntilRecursion);
                if (!noSave) await saveWorldInfo(name, data);
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
                const content = this.value;
                const value = content === '' ? (typeof data.entries[uid].delayUntilRecursion === 'boolean' ? data.entries[uid].delayUntilRecursion : true)
                    : content === '1' ? true
                        : !isNaN(Number(content)) ? Number(content)
                            : false;
                data.entries[uid].delayUntilRecursion = value;
                setWIOriginalDataValue(data, uid, 'extensions.delay_until_recursion', data.entries[uid].delayUntilRecursion);
                if (!noSave) await saveWorldInfo(name, data);
            });
            const val = ['number', 'string'].includes(typeof entry.delayUntilRecursion) ? entry.delayUntilRecursion : '';
            delayUntilRecursionLevelInput.value = val;
            delayUntilRecursionLevelInput.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
        }

        // Boolean selects
        handleBooleanSelectHelper({ selectElem: editTemplate.querySelectorAll('select[name="caseSensitive"]'), entry, entryKey: 'caseSensitive', data, name });
        handleBooleanSelectHelper({ selectElem: editTemplate.querySelectorAll('select[name="matchWholeWords"]'), entry, entryKey: 'matchWholeWords', data, name });
        handleBooleanSelectHelper({ selectElem: editTemplate.querySelectorAll('select[name="useGroupScoring"]'), entry, entryKey: 'useGroupScoring', data, name });

        // Match checkboxes
        handleMatchCheckboxHelper({ template: editTemplate, entry, fieldName: 'matchPersonaDescription', data, name });
        handleMatchCheckboxHelper({ template: editTemplate, entry, fieldName: 'matchCharacterDescription', data, name });
        handleMatchCheckboxHelper({ template: editTemplate, entry, fieldName: 'matchCharacterPersonality', data, name });
        handleMatchCheckboxHelper({ template: editTemplate, entry, fieldName: 'matchCharacterDepthPrompt', data, name });
        handleMatchCheckboxHelper({ template: editTemplate, entry, fieldName: 'matchScenario', data, name });
        handleMatchCheckboxHelper({ template: editTemplate, entry, fieldName: 'matchCreatorNotes', data, name });

        // Automation ID
        const automationIdInput = editTemplate?.querySelector('input[name="automationId"]');
        if (automationIdInput) {
            automationIdInput.dataset.uid = String(entry.uid);
            automationIdInput.addEventListener('input', async function (this: HTMLInputElement, e: Event) {
                const detail = (e instanceof CustomEvent) ? e.detail : {};
                const noSave = detail.noSave ?? false;
                const uid = this.dataset.uid;
                const value = this.value;
                data.entries[uid].automationId = value;
                setWIOriginalDataValue(data, uid, 'extensions.automation_id', data.entries[uid].automationId);
                if (!noSave) await saveWorldInfo(name, data);
            });
            automationIdInput.value = entry.automationId ?? '';
            automationIdInput.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
        }
        setTimeout(() => createEntryInputAutocomplete(automationIdInput, getAutomationIdCallback(data)), 1);

        // Generation Type Triggers
        const generationTypeTriggers = editTemplate?.querySelector('select[name="triggers"]');
        if (generationTypeTriggers) {
            generationTypeTriggers.dataset.uid = String(entry.uid);
            generationTypeTriggers.addEventListener('input', async function (this: HTMLSelectElement, e: Event) {
                const detail = (e instanceof CustomEvent) ? e.detail : {};
                const noSave = detail.noSave ?? false;
                const uid = this.dataset.uid;
                const value = this.value;
                data.entries[uid].triggers = Array.isArray(value) ? value : [];
                setWIOriginalDataValue(data, uid, 'extensions.triggers', data.entries[uid].triggers);
                if (!noSave) await saveWorldInfo(name, data);
            });
            if (!isMobile()) {
                new TomSelect(generationTypeTriggers, {
                    maxItems: null,
                    placeholder: t`All types (default)`,
                    allowEmptyOption: true,
                    plugins: ['remove_button'],
                });
            }
            generationTypeTriggers.value = Array.isArray(entry.triggers) ? entry.triggers : [];
            generationTypeTriggers.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
            generationTypeTriggers.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Ignore budget
        const ignoreBudgetInput = editTemplate?.querySelector('input[name="ignoreBudget"]');
        if (ignoreBudgetInput) {
            ignoreBudgetInput.dataset.uid = String(entry.uid);
            ignoreBudgetInput.addEventListener('input', async function (this: HTMLInputElement, e: Event) {
                const detail = (e instanceof CustomEvent) ? e.detail : {};
                const noSave = detail.noSave ?? false;
                const uid = this.dataset.uid;
                const value = this.checked;
                data.entries[uid].ignoreBudget = value;
                setWIOriginalDataValue(data, uid, 'extensions.ignore_budget', data.entries[uid].ignoreBudget);
                if (!noSave) await saveWorldInfo(name, data);
            });
            ignoreBudgetInput.checked = entry.ignoreBudget ?? false;
            ignoreBudgetInput.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
        }

        countTokensDebounced(counter, contentInput.value);

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
// @ts-expect-error TS(2315) FIXME: Type 'JQuery' is not generic.
}: { data?: { entries: Record<string, unknown> }; collectValues?: (entry: unknown) => string | string[] | null | undefined; includeExtras?: () => Iterable<string>; postFilter?: (ctx: { result: string[]; control: JQuery<HTMLElement>; input: unknown; haystack: string[] }) => string[] } = {}) {
    // @ts-expect-error TS(7006) FIXME: Parameter 'control' implicitly has an 'any' type.
    return function (control, input, output) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const uid = control.dataset.uid;

        // Collect unique values from all *other* entries
        const values = new Set();
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        for (const entry of Object.values(data.entries ?? {})) {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            if (entry?.uid == uid) continue;
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            const raw = collectValues(entry);
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
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        const haystack = Array.from(values).sort((a, b) => a.localeCompare(b));

        // Case-insensitive contains
        const needle = String(input.term ?? '').toLowerCase();
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        let result = haystack.filter(x => x.toLowerCase().includes(needle));

        // Optional final-pass semantics
        if (postFilter) {
            // @ts-expect-error TS(2322) FIXME: Type 'unknown[]' is not assignable to type 'string... Remove this comment to see the full error message
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
// @ts-expect-error TS(7006) FIXME: Parameter 's' implicitly has an 'any' type.
const splitCsv = s => String(s ?? '').split(/,\s*/).filter(Boolean);

/**
 * Get the inclusion groups for the autocomplete.
 * @param {object} data WI data
 * @returns {(input: {term: string}, output: (data: string[]) => void) => void} Callback function for the autocomplete
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
function getInclusionGroupCallback(data) {
    return buildAutocompleteCallback({
        data,
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        collectValues: entry => entry.group ? splitCsv(entry.group) : [],
        postFilter: ({ result, control, input, haystack }) => {
            const thisGroups = splitCsv(String(control.value));
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            const needle = String(input.term ?? '').toLowerCase();
            const hasExactMatch = haystack.some(x => x.toLowerCase() === needle);

            // include suggestion if it contains the needle AND
            // (not already present OR (exact match typed && appears only once))
            return result.filter(x =>
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
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
function getAutomationIdCallback(data) {
    return buildAutocompleteCallback({
        data,
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        collectValues: entry => entry.automationId != null ? [String(entry.automationId)] : [],
        includeExtras: () =>
            ('quickReplyApi' in globalThis && globalThis.quickReplyApi?.listAutomationIds)
                ? globalThis.quickReplyApi.listAutomationIds()
                : [],
    });
}

/**
 * @param {object} data - WI data
 * @returns {(input: {term: string}, output: (data: string[]) => void) => void} Autocomplete callback
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
function getOutletNameCallback(data) {
    return buildAutocompleteCallback({
        data,
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        collectValues: entry => entry.position === world_info_position.outlet && entry.outletName ? [entry.outletName] : [],
    });
}

/**
 * Create an autocomplete for an input element.
 * @param {JQuery<HTMLElement>} input - Input element to attach the autocomplete to
 * @param {(control: JQuery<HTMLElement>, input: {term: string}, output: (data: string[]) => void) => void} callback - Source data callbacks
 * @param {object} [options] - Optional arguments
 * @param {boolean} [options.allowMultiple] - Whether to allow multiple comma-separated values
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'input' implicitly has an 'any' type.
function createEntryInputAutocomplete(input, callback, { allowMultiple = false } = {}) {
    const onValueChange = () => {
        const value = input.tomSelect.getValue();
        if (!allowMultiple) {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('blur', { bubbles: true }));
        } else {
            input.value = Array.isArray(value) ? value.join(', ') : '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('blur', { bubbles: true }));
        }
    };

    input.tomSelect = new TomSelect(input, {
        maxItems: allowMultiple ? null : 1,
        create: false,
        minLength: 0,
        valueField: 'value',
        labelField: 'label',
        searchField: ['label'],
        // @ts-expect-error TS(7006) FIXME: Parameter 'query' implicitly has an 'any' type.
        load: function (query, loadCallback) {
            // @ts-expect-error TS(7006) FIXME: Parameter 'results' implicitly has an 'any' type.
            callback(input, { term: query }, function (results) {
                // @ts-expect-error TS(7006) FIXME: Parameter 's' implicitly has an 'any' type.
                loadCallback(results.map(s => ({ value: s, label: s })));
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

    input.addEventListener('focus', function () {
        input.tomSelect.open();
    });
    input.addEventListener('click', function () {
        input.tomSelect.open();
    });
}







/**
 * Retargets all character lore links from an old world info name to a new one, with an optional confirmation for primary lorebook links
 * @param {string} oldName Previous WI file name
 * @param {string} newName New WI file name
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'oldName' implicitly has an 'any' type.
export async function updateWorldInfoLinks(oldName, newName) {
    // @ts-expect-error TS(2339) FIXME: Property 'charLore' does not exist on type '{}'.
    const existingCharLores = wiManager.info.charLore?.filter((e) => e.extraBooks.includes(oldName));
    if (existingCharLores && existingCharLores.length > 0) {
        // @ts-expect-error TS(7006) FIXME: Parameter 'charLore' implicitly has an 'any' type.
        existingCharLores.forEach((charLore) => {
            // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
            const tempCharLore = charLore.extraBooks.filter((e) => e !== oldName);
            tempCharLore.push(newName);
            charLore.extraBooks = tempCharLore;
        });
        saveSettingsNow();
    }

    // find all characters using the old lorebook name as their primary world
    // @ts-expect-error TS(7034) FIXME: Variable 'linkedChIDs' implicitly has type 'any[]'... Remove this comment to see the full error message
    const linkedChIDs = [];
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

        // @ts-expect-error TS(7005) FIXME: Variable 'linkedChIDs' implicitly has an 'any[]' t... Remove this comment to see the full error message
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

                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                notyf.success(`Successfully updated link for ${character.name}.`);
            } catch (e) {
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                notyf.error(`Failed to update link for ${character.name}.`);
                console.error(`Backend update for character ${character.name} failed:`, e);
            }
        }

        // update the UI fields
        // only required if the currently selected character was changed
        if (activeCharacterUpdated) {
            select_selected_character(this_chid, { switchMenu: false });
            // @ts-expect-error TS(2345) FIXME: Argument of type 'true' is not assignable to param... Remove this comment to see the full error message
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
// @ts-expect-error TS(7006) FIXME: Parameter 'chid' implicitly has an 'any' type.
export function setWorldInfoButtonClass(chid, forceValue = undefined) {
    if (forceValue !== undefined) {
        document.querySelectorAll('#set_character_world, #world_button').forEach(el => el.classList.toggle('world_set', forceValue));
        return;
    }

    if (chid === undefined) {
        return;
    }

    const world = characters[chid]?.data?.extensions?.world;
    const worldSet = Boolean(world && wiManager.worldNames.includes(world));
    document.querySelectorAll('#set_character_world, #world_button').forEach(el => el.classList.toggle('world_set', worldSet));
}

/**
 * @param {number|undefined} chid - Character ID
 * @returns {boolean} Whether the character has an embedded world
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'chid' implicitly has an 'any' type.
export function checkEmbeddedWorld(chid) {
    const importInfoEl = document.getElementById('import_character_info');
    if (importInfoEl) importInfoEl.style.display = 'none';

    if (chid === undefined) {
        return false;
    }

    if (characters[chid]?.data?.character_book) {
        if (importInfoEl) {
            importInfoEl.dataset.chid = String(chid);
            importInfoEl.style.display = '';
        }

        // Only show the alert once per character
        const checkKey = `AlertWI_${characters[chid].avatar}`;
        const worldName = characters[chid]?.data?.extensions?.world;
        if (!accountStorage.getItem(checkKey) && (!worldName || !wiManager.worldNames.includes(worldName))) {
            accountStorage.setItem(checkKey, 'true');

            if (power_user.world_import_dialog) {
                const html = `<h3>This character has an embedded World/Lorebook.</h3>
                <h3>Would you like to import it now?</h3>
                <div class="m-b-1">If you want to import it later, select "Import Card Lore" in the "More..." dropdown menu on the character panel.</div>`;
                // @ts-expect-error TS(7006) FIXME: Parameter 'result' implicitly has an 'any' type.
                const checkResult = (result) => {
                    if (result) {
                        importEmbeddedWorldInfo(true);
                    }
                };
                callGenericPopup(html, POPUP_TYPE.CONFIRM, '', { okButton: 'Yes' }).then(checkResult);
            } else {
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                notyf.info(
                    'To import and use it, select "Import Card Lore" in the "More..." dropdown menu on the character panel.',
                    `${characters[chid].name} has an embedded World/Lorebook`,
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
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
export function onWorldInfoChange(args, text) {
    if (args !== '__notSlashCommand__') { // if it's a slash command
        const silent = isTrueBoolean(args.silent);
        if (text.trim() !== '') { // and args are provided
            const slashInputSplitText = text.trim().toLowerCase().split(',');

            // @ts-expect-error TS(7006) FIXME: Parameter 'worldName' implicitly has an 'any' type... Remove this comment to see the full error message
            slashInputSplitText.forEach((worldName) => {
                const wiElement = getWIElement(worldName);
                if (wiElement instanceof HTMLOptionElement) {
                    const name = wiElement.textContent;
                    switch (args.state) {
                        case 'off': {
                            // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
                            if (wiManager.selectedWorlds.includes(name)) {
                                // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
                                wiManager.selectedWorlds.splice(wiManager.selectedWorlds.indexOf(name), 1);
                                wiElement.selected = false;
                                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                                if (!silent) notyf.success(t`Deactivated world: ${name}`);
                            } else {
                                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                                if (!silent) notyf.error(t`World was not active: ${name}`);
                            }
                            break;
                        }
                        case 'toggle': {
                            // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
                            if (wiManager.selectedWorlds.includes(name)) {
                                // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
                                wiManager.selectedWorlds.splice(wiManager.selectedWorlds.indexOf(name), 1);
                                wiElement.selected = false;
                                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                                if (!silent) notyf.success(t`Deactivated world: ${name}`);
                            } else {
                                // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
                                wiManager.selectedWorlds.push(name);
                                wiElement.selected = true;
                                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                                if (!silent) notyf.success(t`Activated world: ${name}`);
                            }
                            break;
                        }
                        case 'on':
                        default: {
                            // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
                            wiManager.selectedWorlds.push(name);
                            wiElement.selected = true;
                            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                            if (!silent) notyf.success(t`Activated world: ${name}`);
                        }
                    }
                } else {
                    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                    if (!silent) notyf.error(t`No world found named: ${worldName}`);
                }
            });
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            document.getElementById('world_info')?.dispatchEvent(new Event('change', {bubbles: true}));
        } else { // if no args, unset all worlds
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            if (!silent) notyf.success(t`Deactivated all worlds`);
            wiManager.selectedWorlds = [];
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            document.getElementById('world_info').value = null.dispatchEvent(new Event('change', { bubbles: true }));
        }
    } else { //if it's a pointer selection
        // @ts-expect-error TS(7034) FIXME: Variable 'tempWorldInfo' implicitly has type 'any[... Remove this comment to see the full error message
        const tempWorldInfo = [];
        // @ts-expect-error TS(2339) FIXME: Property 'selectedOptions' does not exist on type 'HTMLElement'.
        const selectEl = document.getElementById('world_info');
        // @ts-expect-error TS(2339) FIXME: Property 'selectedOptions' does not exist on type 'HTMLElement'.
        const selectedOptions = selectEl?.selectedOptions;
        const selectedWorlds = Array.from(selectedOptions ?? []).map((/** @type {HTMLOptionElement} */ o) => Number(o.value)).filter((e) => !isNaN(e));
        if (selectedWorlds.length > 0) {
            selectedWorlds.forEach((worldIndex) => {
                const existingWorldName = wiManager.worldNames[worldIndex];
                if (existingWorldName) {
                    tempWorldInfo.push(existingWorldName);
                } else {
                    const wiElement = getWIElement(existingWorldName);
                    if (wiElement instanceof HTMLOptionElement) wiElement.selected = false;
                    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                    notyf.error(t`The world with ${existingWorldName} is invalid or corrupted.`);
                }
            });
        }
        // @ts-expect-error TS(2322) FIXME: Type 'any[]' is not assignable to type 'never[]'.
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
// @ts-expect-error TS(7006) FIXME: Parameter 'file' implicitly has an 'any' type.

/**
 * Forces the world info editor to open on a specific world.
 * @param {string} worldName The name of the world to open
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'worldName' implicitly has an 'any' type... Remove this comment to see the full error message
export function openWorldInfoEditor(worldName) {
    console.log(`Opening lorebook for ${worldName}`);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    if (!document.getElementById('WorldInfo').offsetParent !== null) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        document.getElementById('WIDrawerIcon').dispatchEvent(new Event('click', { bubbles: true }));
    }
    const index = wiManager.worldNames.indexOf(worldName);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('world_editor_select').value = String(index);
    // Sync the TomSelect display with the programmatic value change
    // @ts-expect-error TS(2339) FIXME: Property 'tomselect' does not exist on type 'HTMLElement'.
    document.getElementById('world_editor_select')?.tomselect?.setValue(String(index));
    document.getElementById('world_editor_select')?.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Assigns a lorebook to the current chat.
 * @param {Pick<JQuery.ClickEvent, 'shiftKey' | 'altKey'>} event Click event
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7031) FIXME: Binding element 'shiftKey' implicitly has an 'any'... Remove this comment to see the full error message
export async function assignLorebookToChat({ shiftKey, altKey }) {
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
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            document.querySelector('.chat_lorebook_button').classList.add('world_set');
        } else {
            delete chat_metadata[METADATA_KEY];
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            document.querySelector('.chat_lorebook_button').classList.remove('world_set');
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
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export async function charUpdatePrimaryWorld(name) {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const previousValue = document.getElementById('character_world').value;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('character_world').value = name;

    console.debug('Character world selected:', name);

    if (menu_type == 'create') {
        create_save.world = name;
        return;
    }

    if (previousValue && !name) {
        try {
            // Dirty hack to remove embedded lorebook from character JSON data.
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const data = JSON.parse(String(document.getElementById('character_json_data').value));

            if (data?.data?.character_book) {
                data.data.character_book = undefined;
            }

            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            document.getElementById('character_json_data').value = JSON.stringify(data);
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.info(t`Embedded lorebook will be removed from this character.`);
        } catch {
            console.error('Failed to parse character JSON data.');
        }
    }

    // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
    await createOrEditCharacter();

    // @ts-expect-error TS(2345) FIXME: Argument of type 'boolean' is not assignable to pa... Remove this comment to see the full error message
    setWorldInfoButtonClass(undefined, !!name);
}

/**
 * Adds one or more auxiliary world books to a character.
 * @param {string} characterKey - The key of the character to add auxiliary world books to
 * @param {string|string[]} nameOrNames - The name or names of the auxiliary world books to add
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'characterKey' implicitly has an 'any' t... Remove this comment to see the full error message
export async function charUpdateAddAuxWorld(characterKey, nameOrNames) {
    const fileName = getCharaFilename(null, { manualAvatarKey: characterKey });
    const toAdd = Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames];
    // @ts-expect-error TS(7006) FIXME: Parameter 'curr' implicitly has an 'any' type.
    updateAuxBooks(fileName, curr => [...curr, ...toAdd]);
}

/**
 * Replaces the entire list of auxiliary world books for a character.
 * @param {string} fileName - The filename of the character to update
 * @param {string[]} books - The new list of auxiliary world books to replace the existing list with
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'fileName' implicitly has an 'any' type.
export function charSetAuxWorlds(fileName, books) {
    // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
    updateAuxBooks(fileName, _ => Array.isArray(books) ? books : []);
}

/**
 * @param {string} fileName - Character filename
 * @param {(books: string[]) => string[]} computeNext - Function to compute the next list of books
 * @returns {void}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'fileName' implicitly has an 'any' type.
function updateAuxBooks(fileName, computeNext) {
    if (!fileName) return;

    if (menu_type === 'create') {
        const current = create_save.extra_books ?? [];
        // @ts-expect-error TS(2322) FIXME: Type 'unknown[]' is not assignable to type 'never[... Remove this comment to see the full error message
        create_save.extra_books = normalizeArray(computeNext(current));
        return; // no debounced save in create flow
    }

    // @ts-expect-error TS(2339) FIXME: Property 'charLore' does not exist on type '{}'.
    const charLore = wiManager.info.charLore ?? [];
    // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
    const idx = charLore.findIndex(e => e.name === fileName);
    const current = idx !== -1 ? (charLore[idx].extraBooks ?? []) : [];
    const next = normalizeArray(computeNext(current));

    if (next.length === 0) {
        if (idx !== -1) charLore.splice(idx, 1);
    } else if (idx === -1) {
        charLore.push({ name: fileName, extraBooks: next });
    } else {
        charLore[idx] = { ...charLore[idx], extraBooks: next };
    }

    Object.assign(world_info, { charLore });
    saveSettingsNow();
}

/**
 * Initializes the world info module.
 *
 */
export function initWorldInfo() {
    (document.getElementById('world_info') as HTMLSelectElement).addEventListener('mousedown', async function (e) {
        // If there's no world names, don't do anything
        if (wiManager.worldNames.length === 0) {
            e.preventDefault();
            return;
        }

        // @ts-expect-error TS(2554) FIXME: Expected 2 arguments, but got 1.
        onWorldInfoChange('__notSlashCommand__');
    });
    (document.getElementById('world_info') as HTMLSelectElement).addEventListener('change', async function () {
        // If there's no world names, don't do anything
        if (wiManager.worldNames.length === 0) {
            return;
        }

        // @ts-expect-error TS(2554) FIXME: Expected 2 arguments, but got 1.
        onWorldInfoChange('__notSlashCommand__');
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
        const tempName = getFreeWorldName();
        const finalName = await Popup.show.input(t`Create a new World Info`, t`Enter a name for the new file:`, tempName);

        if (finalName) {
            await createNewWorldInfo(finalName, { interactive: true });
        }
    });

    (document.getElementById('world_editor_select') as HTMLSelectElement).addEventListener('change', async () => {
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
            const worldName = wiManager.worldNames[selectedIndex];
            showWorldEditor(worldName);
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

    (document.getElementById('world_button') as HTMLElement).addEventListener('click', async function (event) {
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

        const worldName = characters[chid]?.data?.extensions?.world;
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
        if (el) assignLorebookToChat(e);
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
        new TomSelect(document.getElementById('world_editor_select'), {
            maxItems: 1,
            placeholder: t`--- Pick to Edit ---`,
            dropdownParent: 'body',
        });

        new TomSelect(document.getElementById('world_info'), {
            maxItems: null,
            placeholder: t`No Worlds active. Click here to select.`,
            allowEmptyOption: true,
            plugins: ['remove_button'],
            dropdownParent: 'body',
        });

        // Subscribe world loading to the TomSelect multiselect items (We need to target the specific ts-control)
        select2ChoiceClickSubscribe(document.getElementById('world_info'), target => {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const name = target.textContent;
            const selectedIndex = wiManager.worldNames.indexOf(name);
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const alreadySelectedInEditor = document.querySelector('#world_editor_select option:checked')?.textContent === name;
            if (selectedIndex !== -1 && !alreadySelectedInEditor) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                document.getElementById('world_editor_select').value = String(selectedIndex);
    document.getElementById('world_editor_select')?.dispatchEvent(new Event('change', { bubbles: true }));
                console.log('Quick selection of world', name);
            } else {
                console.warn('lets not reload an already loaded list yes?');
            }
        }, { buttonStyle: true, closeDrawer: true });
    }

    (document.getElementById('WorldInfo') as HTMLElement).addEventListener('scroll', () => {
        document.querySelectorAll('.world_entry input[name="group"], .world_entry input[name="automationId"]').forEach(el => {
            // @ts-expect-error TS(2339) FIXME: Property 'tomSelect' does not exist on type 'Element'.
            if (el.tomSelect) {
                // @ts-expect-error TS(2339) FIXME: Property 'tomSelect' does not exist on type 'Element'.
                el.tomSelect.close();
            }
        });
    });
}
