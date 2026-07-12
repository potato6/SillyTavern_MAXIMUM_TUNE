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
import { StructuredCloneMap } from './util/StructuredCloneMap.js';
import { renderTemplateAsync } from './templates.js';
import { t } from './i18n.js';
import { accountStorage } from './util/AccountStorage.js';
import { getOrCreatePersonaDescriptor, setPersonaDescription, user_avatar } from './personas.js';

export const world_info_insertion_strategy = {
    evenly: 0,
    character_first: 1,
    global_first: 2,
};

export const world_info_logic = {
    AND_ANY: 0,
    NOT_ALL: 1,
    NOT_ANY: 2,
    AND_ALL: 3,
};

/**
 * @enum {number} Possible states of the WI evaluation
 */
export const scan_state = {
    /**
     * The scan will be stopped.
     */
    NONE: 0,
    /**
     * Initial state.
     */
    INITIAL: 1,
    /**
     * The scan is triggered by a recursion step.
     */
    RECURSION: 2,
    /**
     * The scan is triggered by a min activations depth skew.
     */
    MIN_ACTIVATIONS: 3,
};

// @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
const WI_ENTRY_HEADER_TEMPLATE = /** @type {HTMLElement} */ (document.querySelector('#entry_edit_template .world_entry'));
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
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
const saveWorldDebounced = debounce(async (name, data) => await _save(name, data), debounce_timeout.relaxed);
const saveSettingsDebounced = debounce(() => {
    Object.assign(world_info, { globalSelect: selected_world_info });
    saveSettings();
}, debounce_timeout.relaxed);
// @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
const sortFn = (a, b) => b.order - a.order;
// @ts-expect-error TS(7006) FIXME: Parameter 'navigation' implicitly has an 'any' typ... Remove this comment to see the full error message
let updateEditor = (navigation, flashOnNav = true) => { console.debug('Triggered WI navigation', navigation, flashOnNav); };

// Do not optimize. updateEditor is a function that is updated by the displayWorldEntries with new data.
// @ts-expect-error TS(2554) FIXME: Expected 1-2 arguments, but got 0.
export const worldInfoFilter = new FilterHelper(() => updateEditor());
export const SORT_ORDER_KEY = 'world_info_sort_order';
export const METADATA_KEY = 'world_info';

export const DEFAULT_DEPTH = 4;
export const DEFAULT_WEIGHT = 100;
export const MAX_SCAN_DEPTH = 1000;
const MAX_COMMENT_LENGTH = 100;
const KNOWN_DECORATORS = ['@@activate', '@@dont_activate'];

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
const defaultGlobalScanData = Object.freeze({
    trigger: 'normal',
    personaDescription: '',
    characterDescription: '',
    characterPersonality: '',
    characterDepthPrompt: '',
    scenario: '',
    creatorNotes: '',
});

/**
 * Represents a scanning buffer for one evaluation of World Info.
 */
class WorldInfoBuffer {
    /**
     * @type {Map<string, object>} Map of entries that need to be activated no matter what
     */
    static externalActivations = new Map();

    /**
     * @type {WIGlobalScanData} Chat independent data to be scanned, such as persona and character descriptions
     */
    #globalScanData = null;

    /**
     * @type {string[]} Array of messages sorted by ascending depth
     */
    #depthBuffer = [];

    /**
     * @type {string[]} Array of strings added by recursive scanning
     */
    #recurseBuffer = [];

    /**
     * @type {string[]} Array of strings added by prompt injections that are valid for the current scan
     */
    #injectBuffer = [];

    /**
     * @type {number} The skew of the global scan depth. Used in "min activations"
     */
    #skew = 0;

    /**
     * @type {number} The starting depth of the global scan depth.
     */
    #startDepth = 0;

    /**
     * Initialize the buffer with the given messages.
     * @param {string[]} messages Array of messages to add to the buffer
     * @param {WIGlobalScanData} globalScanData Chat independent context to be scanned
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'messages' implicitly has an 'any' type.
    constructor(messages, globalScanData) {
        this.#initDepthBuffer(messages);
        this.#globalScanData = globalScanData;
    }

    /**
     * Populates the buffer with the given messages.
     * @param {string[]} messages Array of messages to add to the buffer
     * @returns {void} Hardly seen nothing down here
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'messages' implicitly has an 'any' type.
    #initDepthBuffer(messages) {
        for (let depth = 0; depth < MAX_SCAN_DEPTH; depth++) {
            if (messages[depth]) {
                // @ts-expect-error TS(2322) FIXME: Type 'any' is not assignable to type 'never'.
                this.#depthBuffer[depth] = messages[depth].trim();
            }
            // break if last message is reached
            if (depth === messages.length - 1) {
                break;
            }
        }
    }

    /**
     * Gets a string that respects the case sensitivity setting
     * @param {string} str The string to transform
     * @param {WIScanEntry} entry The entry that triggered the scan
     * @returns {string} The transformed string
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'str' implicitly has an 'any' type.
    #transformString(str, entry) {
        const caseSensitive = entry.caseSensitive ?? world_info_case_sensitive;
        return caseSensitive ? str : str.toLowerCase();
    }

    /**
     * Gets all messages up to the given depth + recursion buffer.
     * @param {WIScanEntry} entry The entry that triggered the scan
     * @param {number} scanState The state of the scan
     * @returns {string} A slice of buffer until the given depth (inclusive)
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
    get(entry, scanState) {
        let depth = entry.scanDepth ?? this.getDepth();
        if (depth <= this.#startDepth) {
            return '';
        }

        if (depth < 0) {
            console.error(`[WI] Invalid WI scan depth ${depth}. Must be >= 0`);
            return '';
        }

        if (depth > MAX_SCAN_DEPTH) {
            console.warn(`[WI] Invalid WI scan depth ${depth}. Truncating to ${MAX_SCAN_DEPTH}`);
            depth = MAX_SCAN_DEPTH;
        }

        const MATCHER = '\x01';
        const JOINER = '\n' + MATCHER;
        let result = MATCHER + this.#depthBuffer.slice(this.#startDepth, depth).join(JOINER);

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (entry.matchPersonaDescription && this.#globalScanData.personaDescription) {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            result += JOINER + this.#globalScanData.personaDescription;
        }
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (entry.matchCharacterDescription && this.#globalScanData.characterDescription) {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            result += JOINER + this.#globalScanData.characterDescription;
        }
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (entry.matchCharacterPersonality && this.#globalScanData.characterPersonality) {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            result += JOINER + this.#globalScanData.characterPersonality;
        }
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (entry.matchCharacterDepthPrompt && this.#globalScanData.characterDepthPrompt) {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            result += JOINER + this.#globalScanData.characterDepthPrompt;
        }
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (entry.matchScenario && this.#globalScanData.scenario) {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            result += JOINER + this.#globalScanData.scenario;
        }
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (entry.matchCreatorNotes && this.#globalScanData.creatorNotes) {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            result += JOINER + this.#globalScanData.creatorNotes;
        }

        if (this.#injectBuffer.length > 0) {
            result += JOINER + this.#injectBuffer.join(JOINER);
        }

        // Min activations should not include the recursion buffer
        if (this.#recurseBuffer.length > 0 && scanState !== scan_state.MIN_ACTIVATIONS) {
            result += JOINER + this.#recurseBuffer.join(JOINER);
        }

        return result;
    }

    /**
     * Matches the given string against the buffer.
     * @param {string} haystack The string to search in
     * @param {string} needle The string to search for
     * @param {WIScanEntry} entry The entry that triggered the scan
     * @returns {boolean} True if the string was found in the buffer
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'haystack' implicitly has an 'any' type.
    matchKeys(haystack, needle, entry) {
        // If the needle is a regex, we do regex pattern matching and override all the other options
        const keyRegex = parseRegexFromString(needle);
        if (keyRegex) {
            return keyRegex.test(haystack);
        }

        // Otherwise we do normal matching of plaintext with the chosen entry settings
        haystack = this.#transformString(haystack, entry);
        const transformedString = this.#transformString(needle, entry);
        const matchWholeWords = entry.matchWholeWords ?? world_info_match_whole_words;

        if (matchWholeWords) {
            const keyWords = transformedString.split(/\s+/);

            if (keyWords.length > 1) {
                return haystack.includes(transformedString);
            } else {
                // Use custom boundaries to include punctuation and other non-alphanumeric characters
                const regex = new RegExp(`(?:^|\\W)(${escapeRegex(transformedString)})(?:$|\\W)`);
                if (regex.test(haystack)) {
                    return true;
                }
            }
        } else {
            return haystack.includes(transformedString);
        }

        return false;
    }

    /**
     * Adds a message to the recursion buffer.
     * @param {string} message The message to add
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'message' implicitly has an 'any' type.
    addRecurse(message) {
        // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
        this.#recurseBuffer.push(message);
    }

    /**
     * Adds an injection to the buffer.
     * @param {string} message The injection to add
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'message' implicitly has an 'any' type.
    addInject(message) {
        // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
        this.#injectBuffer.push(message);
    }

    /**
     * Checks if the recursion buffer is not empty.
     * @returns {boolean} Returns true if the recursion buffer is not empty, otherwise false
     */
    hasRecurse() {
        return this.#recurseBuffer.length > 0;
    }

    /**
     * Increments skew to advance the scan range.
     */
    advanceScan() {
        this.#skew++;
    }

    /**
     * @returns {number} Settings' depth + current skew.
     */
    getDepth() {
        return world_info_depth + this.#skew;
    }

    /**
     * Get the externally activated version of the entry, if there is one.
     * @param {object} entry WI entry to check
     * @returns {object|undefined} the external version if the entry is forcefully activated, undefined otherwise
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
    getExternallyActivated(entry) {
        return WorldInfoBuffer.externalActivations.get(`${entry.world}.${entry.uid}`);
    }

    /**
     * Clean-up the external effects for entries.
     */
    resetExternalEffects() {
        WorldInfoBuffer.externalActivations = new Map();
    }

    /**
     * Gets the match score for the given entry.
     * @param {WIScanEntry} entry Entry to check
     * @param {number} scanState The state of the scan
     * @returns {number} The number of key activations for the given entry
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
    getScore(entry, scanState) {
        const bufferState = this.get(entry, scanState);
        let numberOfPrimaryKeys = 0;
        let numberOfSecondaryKeys = 0;
        let primaryScore = 0;
        let secondaryScore = 0;

        // Increment score for every key found in the buffer
        if (Array.isArray(entry.key)) {
            numberOfPrimaryKeys = entry.key.length;
            for (const key of entry.key) {
                if (this.matchKeys(bufferState, key, entry)) {
                    primaryScore++;
                }
            }
        }

        // Increment score for every secondary key found in the buffer
        if (Array.isArray(entry.keysecondary)) {
            numberOfSecondaryKeys = entry.keysecondary.length;
            for (const key of entry.keysecondary) {
                if (this.matchKeys(bufferState, key, entry)) {
                    secondaryScore++;
                }
            }
        }

        // No keys == no score
        if (!numberOfPrimaryKeys) {
            return 0;
        }

        // Only positive logic influences the score
        if (numberOfSecondaryKeys > 0) {
            switch (entry.selectiveLogic) {
                // AND_ANY: Add both scores
                case world_info_logic.AND_ANY:
                    return primaryScore + secondaryScore;
                // AND_ALL: Add both scores if all secondary keys are found, otherwise only primary score
                case world_info_logic.AND_ALL:
                    return secondaryScore === numberOfSecondaryKeys ? primaryScore + secondaryScore : primaryScore;
            }
        }

        return primaryScore;
    }
}

/**
 * Represents a timed effects manager for World Info.
 */
class WorldInfoTimedEffects {
    /**
     * Array of chat messages.
     * @type {string[]}
     */
    #chat = [];

    /**
     * Array of entries.
     * @type {WIScanEntry[]}
     */
    #entries = [];

    /**
     * Is this a dry run?
     * @type {boolean}
     */
    #isDryRun = false;

    /**
     * Buffer for active timed effects.
     * @type {Record<TimedEffectType, WIScanEntry[]>}
     */
    #buffer = {
        'sticky': [],
        'cooldown': [],
        'delay': [],
    };

    /**
     * Callbacks for effect types ending.
     * @type {Record<TimedEffectType, (entry: WIScanEntry) => void>}
     */
    #onEnded = {
        /**
         * Callback for when a sticky entry ends.
         * Sets an entry on cooldown immediately if it has a cooldown.
         * @param {WIScanEntry} entry Entry that ended sticky
         */
        // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
        'sticky': (entry) => {
            if (!entry.cooldown) {
                return;
            }

            const key = this.#getEntryKey(entry);
            const effect = this.#getEntryTimedEffect('cooldown', entry, true);
            chat_metadata.timedWorldInfo.cooldown[key] = effect;
            console.log(`[WI] Adding cooldown entry ${key} on ended sticky: start=${effect.start}, end=${effect.end}, protected=${effect.protected}`);
            // Set the cooldown immediately for this evaluation
            // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
            this.#buffer.cooldown.push(entry);
        },

        /**
         * Callback for when a cooldown entry ends.
         * No-op, essentially.
         * @param {WIScanEntry} entry Entry that ended cooldown
         */
        // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
        'cooldown': (entry) => {
            console.debug('[WI] Cooldown ended for entry', entry.uid);
        },

        'delay': () => { },
    };

    /**
     * Initialize the timed effects with the given messages.
     * @param {string[]} chat Array of chat messages
     * @param {WIScanEntry[]} entries Array of entries
     * @param {boolean} isDryRun Whether the operation is a dry run
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'chat' implicitly has an 'any' type.
    constructor(chat, entries, isDryRun = false) {
        this.#chat = chat;
        this.#entries = entries;
        this.#isDryRun = isDryRun;
        this.#ensureChatMetadata();
    }

    /**
     * Verify correct structure of chat metadata.
     */
    #ensureChatMetadata() {
        if (!chat_metadata.timedWorldInfo) {
            chat_metadata.timedWorldInfo = {};
        }

        ['sticky', 'cooldown'].forEach(type => {
            // Ensure the property exists and is an object
            if (!chat_metadata.timedWorldInfo[type] || typeof chat_metadata.timedWorldInfo[type] !== 'object') {
                chat_metadata.timedWorldInfo[type] = {};
            }

            // Clean up invalid entries
            Object.entries(chat_metadata.timedWorldInfo[type]).forEach(([key, value]) => {
                if (!value || typeof value !== 'object') {
                    delete chat_metadata.timedWorldInfo[type][key];
                }
            });
        });
    }

    /**
     * Gets a hash for a WI entry.
     * @param {WIScanEntry} entry WI entry
     * @returns {number} String hash
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
    #getEntryHash(entry) {
        return entry.hash;
    }

    /**
     * Gets a unique-ish key for a WI entry.
     * @param {WIScanEntry} entry WI entry
     * @returns {string} String key for the entry
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
    #getEntryKey(entry) {
        return `${entry.world}.${entry.uid}`;
    }

    /**
     * Gets a timed effect for a WI entry.
     * @param {TimedEffectType} type Type of timed effect
     * @param {WIScanEntry} entry WI entry
     * @param {boolean} isProtected If the effect should be protected
     * @returns {WITimedEffect} Timed effect for the entry
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
    #getEntryTimedEffect(type, entry, isProtected) {
        return {
            hash: this.#getEntryHash(entry),
            start: this.#chat.length,
            end: this.#chat.length + Number(entry[type]),
            protected: !!isProtected,
        };
    }

    /**
     * Processes entries for a given type of timed effect.
     * @param {TimedEffectType} type Identifier for the type of timed effect
     * @param {WIScanEntry[]} buffer Buffer to store the entries
     * @param {(entry: WIScanEntry) => void} onEnded Callback for when a timed effect ends
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
    #checkTimedEffectOfType(type, buffer, onEnded) {
        /** @type {[string, WITimedEffect][]} */
        const effects = Object.entries(chat_metadata.timedWorldInfo[type]);
        for (const [key, value] of effects) {
            console.log(`[WI] Processing ${type} entry ${key}`, value);
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            const entry = this.#entries.find(x => String(this.#getEntryHash(x)) === String(value.hash));

            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            if (this.#chat.length <= Number(value.start) && !value.protected) {
                console.log(`[WI] Removing ${type} entry ${key} from timedWorldInfo: chat not advanced`, value);
                delete chat_metadata.timedWorldInfo[type][key];
                continue;
            }

            // Missing entries (they could be from another character's lorebook)
            if (!entry) {
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                if (this.#chat.length >= Number(value.end)) {
                    console.log(`[WI] Removing ${type} entry from timedWorldInfo: entry not found and interval passed`, entry);
                    delete chat_metadata.timedWorldInfo[type][key];
                }
                continue;
            }

            // Ignore invalid entries (not configured for timed effects)
            if (!entry[type]) {
                console.log(`[WI] Removing ${type} entry from timedWorldInfo: entry not ${type}`, entry);
                delete chat_metadata.timedWorldInfo[type][key];
                continue;
            }

            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            if (this.#chat.length >= Number(value.end)) {
                console.log(`[WI] Removing ${type} entry from timedWorldInfo: ${type} interval passed`, entry);
                delete chat_metadata.timedWorldInfo[type][key];
                if (typeof onEnded === 'function') {
                    onEnded(entry);
                }
                continue;
            }

            buffer.push(entry);
            console.log(`[WI] Timed effect "${type}" applied to entry`, entry);
        }
    }

    /**
     * Processes entries for the "delay" timed effect.
     * @param {WIScanEntry[]} buffer Buffer to store the entries
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'buffer' implicitly has an 'any' type.
    #checkDelayEffect(buffer) {
        for (const entry of this.#entries) {
            // @ts-expect-error TS(2339) FIXME: Property 'delay' does not exist on type 'never'.
            if (!entry.delay) {
                continue;
            }

            // @ts-expect-error TS(2339) FIXME: Property 'delay' does not exist on type 'never'.
            if (this.#chat.length < entry.delay) {
                buffer.push(entry);
                console.log('[WI] Timed effect "delay" applied to entry', entry);
            }
        }
    }

    /**
     * Checks for timed effects on chat messages.
     */
    checkTimedEffects() {
        if (!this.#isDryRun) {
            this.#checkTimedEffectOfType('sticky', this.#buffer.sticky, this.#onEnded.sticky.bind(this));
            this.#checkTimedEffectOfType('cooldown', this.#buffer.cooldown, this.#onEnded.cooldown.bind(this));
        }
        this.#checkDelayEffect(this.#buffer.delay);
    }

    /**
     * Gets raw timed effect metadatum for a WI entry.
     * @param {TimedEffectType} type Type of timed effect
     * @param {WIScanEntry} entry WI entry
     * @returns {WITimedEffect} Timed effect for the entry
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
    getEffectMetadata(type, entry) {
        if (!this.isValidEffectType(type)) {
            return null;
        }

        const key = this.#getEntryKey(entry);
        return chat_metadata.timedWorldInfo[type][key];
    }

    /**
     * Sets a timed effect for a WI entry.
     * @param {TimedEffectType} type Type of timed effect
     * @param {WIScanEntry} entry WI entry to check
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
    #setTimedEffectOfType(type, entry) {
        // Skip if entry does not have the type (sticky or cooldown)
        if (!entry[type]) {
            return;
        }

        const key = this.#getEntryKey(entry);

        if (!chat_metadata.timedWorldInfo[type][key]) {
            const effect = this.#getEntryTimedEffect(type, entry, false);
            chat_metadata.timedWorldInfo[type][key] = effect;

            console.log(`[WI] Adding ${type} entry ${key}: start=${effect.start}, end=${effect.end}, protected=${effect.protected}`);
        }
    }

    /**
     * Sets timed effects on chat messages.
     * @param {WIScanEntry[]} activatedEntries Entries that were activated
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'activatedEntries' implicitly has an 'an... Remove this comment to see the full error message
    setTimedEffects(activatedEntries) {
        if (this.#isDryRun) return;
        for (const entry of activatedEntries) {
            this.#setTimedEffectOfType('sticky', entry);
            this.#setTimedEffectOfType('cooldown', entry);
        }
    }

    /**
     * Force set a timed effect for a WI entry.
     * @param {TimedEffectType} type Type of timed effect
     * @param {WIScanEntry} entry WI entry
     * @param {boolean} newState The state of the effect
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
    setTimedEffect(type, entry, newState) {
        if (!this.isValidEffectType(type)) {
            return;
        }
        if (this.#isDryRun && type !== 'delay') {
            return;
        }

        const key = this.#getEntryKey(entry);
        delete chat_metadata.timedWorldInfo[type][key];

        if (newState) {
            const effect = this.#getEntryTimedEffect(type, entry, false);
            chat_metadata.timedWorldInfo[type][key] = effect;
            console.log(`[WI] Adding ${type} entry ${key}: start=${effect.start}, end=${effect.end}, protected=${effect.protected}`);
        }
    }

    /**
     * Check if the string is a valid timed effect type.
     * @param {string} type Name of the timed effect
     * @returns {boolean} Is recognized type
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
    isValidEffectType(type) {
        return typeof type === 'string' && ['sticky', 'cooldown', 'delay'].includes(type.trim().toLowerCase());
    }

    /**
     * Check if the current entry is sticky activated.
     * @param {TimedEffectType} type Type of timed effect
     * @param {WIScanEntry} entry WI entry to check
     * @returns {boolean} True if the entry is active
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
    isEffectActive(type, entry) {
        if (!this.isValidEffectType(type)) {
            return false;
        }

        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        return this.#buffer[type]?.some(x => this.#getEntryHash(x) === this.#getEntryHash(entry)) ?? false;
    }

    /**
     * Clean-up previously set timed effects.
     */
    cleanUp() {
        for (const buffer of Object.values(this.#buffer)) {
            buffer.splice(0, buffer.length);
        }
    }
}

/**
 * @returns {WorldInfoSettings} The current world info settings
 */
export function getWorldInfoSettings() {
    return {
        world_info,
        world_info_depth,
        world_info_min_activations,
        world_info_min_activations_depth_max,
        world_info_budget,
        world_info_include_names,
        world_info_recursive,
        world_info_overflow_alert,
        world_info_case_sensitive,
        world_info_match_whole_words,
        world_info_character_strategy,
        world_info_budget_cap,
        world_info_use_group_scoring,
        world_info_max_recursion_steps,
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
        world_info_depth: (value) => world_info_depth = Number(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_min_activations: (value) => world_info_min_activations = Number(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_min_activations_depth_max: (value) => world_info_min_activations_depth_max = Number(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_budget: (value) => world_info_budget = Number(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_include_names: (value) => world_info_include_names = Boolean(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_recursive: (value) => world_info_recursive = Boolean(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_overflow_alert: (value) => world_info_overflow_alert = Boolean(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_case_sensitive: (value) => world_info_case_sensitive = Boolean(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_match_whole_words: (value) => world_info_match_whole_words = Boolean(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_character_strategy: (value) => world_info_character_strategy = Number(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_budget_cap: (value) => world_info_budget_cap = Number(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_use_group_scoring: (value) => world_info_use_group_scoring = Boolean(value),
        // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
        world_info_max_recursion_steps: (value) => world_info_max_recursion_steps = Number(value),
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
        selected_world_info = activeWorldInfo;
    }

    saveSettingsDebounced();
}

export const world_info_position = {
    before: 0,
    after: 1,
    ANTop: 2,
    ANBottom: 3,
    atDepth: 4,
    EMTop: 5,
    EMBottom: 6,
    outlet: 7,
};

export const wi_anchor_position = {
    before: 0,
    after: 1,
};

/**
 * The cache of all world info data that was loaded from the backend.
 *
 * Calling `loadWorldInfo` will fill this cache and utilize this cache, so should be the preferred way to load any world info data.
 * Only use the cache directly if you need synchronous access.
 *
 * This will return a deep clone of the data, so no way to modify the data without actually saving it.
 * Should generally be only used for readonly access.
 * @type {StructuredCloneMap<string,object>}
 */
export const worldInfoCache = new StructuredCloneMap({ cloneOnGet: true, cloneOnSet: false });

/**
 * Gets the world info based on chat messages.
 * @param {string[]} chat - The chat messages to scan, in reverse order.
 * @param {number} maxContext - The maximum context size of the generation.
 * @param {boolean} isDryRun - If true, the function will not emit any events.
 * @param {WIGlobalScanData} globalScanData Chat independent context to be scanned
 * @returns {Promise<WIPromptResult>} The world info string and depth.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'chat' implicitly has an 'any' type.
export async function getWorldInfoPrompt(chat, maxContext, isDryRun, globalScanData) {
    let worldInfoString = '', worldInfoBefore = '', worldInfoAfter = '';

    const activatedWorldInfo = await checkWorldInfo(chat, maxContext, isDryRun, globalScanData);
    worldInfoBefore = activatedWorldInfo.worldInfoBefore;
    worldInfoAfter = activatedWorldInfo.worldInfoAfter;
    worldInfoString = worldInfoBefore + worldInfoAfter;

    if (!isDryRun && activatedWorldInfo.allActivatedEntries && activatedWorldInfo.allActivatedEntries.size > 0) {
        const arg = Array.from(activatedWorldInfo.allActivatedEntries.values());
        await eventSource.emit(event_types.WORLD_INFO_ACTIVATED, arg);
    }

    return {
        worldInfoString,
        worldInfoBefore,
        worldInfoAfter,
        worldInfoExamples: activatedWorldInfo.EMEntries ?? [],
        worldInfoDepth: activatedWorldInfo.WIDepthEntries ?? [],
        anBefore: activatedWorldInfo.ANBeforeEntries ?? [],
        anAfter: activatedWorldInfo.ANAfterEntries ?? [],
        outletEntries: activatedWorldInfo.outletEntries ?? {},
    };
}

/**
 * @param {WorldInfoSettings} settings - Settings object
 * @param {object} data - Data object
 * @returns {void}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'settings' implicitly has an 'any' type.
export function setWorldInfoSettings(settings, data) {
    if (settings.world_info_depth !== undefined)
        world_info_depth = Number(settings.world_info_depth);
    if (settings.world_info_min_activations !== undefined)
        world_info_min_activations = Number(settings.world_info_min_activations);
    if (settings.world_info_min_activations_depth_max !== undefined)
        world_info_min_activations_depth_max = Number(settings.world_info_min_activations_depth_max);
    if (settings.world_info_budget !== undefined)
        world_info_budget = Number(settings.world_info_budget);
    if (settings.world_info_include_names !== undefined)
        world_info_include_names = Boolean(settings.world_info_include_names);
    if (settings.world_info_recursive !== undefined)
        world_info_recursive = Boolean(settings.world_info_recursive);
    if (settings.world_info_overflow_alert !== undefined)
        world_info_overflow_alert = Boolean(settings.world_info_overflow_alert);
    if (settings.world_info_case_sensitive !== undefined)
        world_info_case_sensitive = Boolean(settings.world_info_case_sensitive);
    if (settings.world_info_match_whole_words !== undefined)
        world_info_match_whole_words = Boolean(settings.world_info_match_whole_words);
    if (settings.world_info_character_strategy !== undefined)
        world_info_character_strategy = Number(settings.world_info_character_strategy);
    if (settings.world_info_budget_cap !== undefined)
        world_info_budget_cap = Number(settings.world_info_budget_cap);
    if (settings.world_info_use_group_scoring !== undefined)
        world_info_use_group_scoring = Boolean(settings.world_info_use_group_scoring);
    if (settings.world_info_max_recursion_steps !== undefined)
        world_info_max_recursion_steps = Number(settings.world_info_max_recursion_steps);

    // Migrate old settings
    if (world_info_budget > 100) {
        world_info_budget = 25;
    }

    if (world_info_use_group_scoring === undefined) {
        world_info_use_group_scoring = false;
    }

    // Reset selected world from old string and delete old keys
    // TODO: Remove next release
    const existingWorldInfo = settings.world_info;
    if (typeof existingWorldInfo === 'string') {
        delete settings.world_info;
        // @ts-expect-error TS(2322) FIXME: Type 'string' is not assignable to type 'never'.
        selected_world_info = [existingWorldInfo];
    } else if (Array.isArray(existingWorldInfo)) {
        delete settings.world_info;
        // @ts-expect-error TS(2322) FIXME: Type 'any[]' is not assignable to type 'never[]'.
        selected_world_info = existingWorldInfo;
    }

    world_info = settings.world_info ?? {};

    const worldInfoDepthCounter = document.getElementById('world_info_depth_counter');
    if (worldInfoDepthCounter) worldInfoDepthCounter.value = String(world_info_depth);
    const worldInfoDepth = document.getElementById('world_info_depth');
    if (worldInfoDepth) worldInfoDepth.value = String(world_info_depth);

    const worldInfoMinActCounter = document.getElementById('world_info_min_activations_counter');
    if (worldInfoMinActCounter) worldInfoMinActCounter.value = String(world_info_min_activations);
    const worldInfoMinAct = document.getElementById('world_info_min_activations');
    if (worldInfoMinAct) worldInfoMinAct.value = String(world_info_min_activations);

    const worldInfoMinActDepthMaxCounter = document.getElementById('world_info_min_activations_depth_max_counter');
    if (worldInfoMinActDepthMaxCounter) worldInfoMinActDepthMaxCounter.value = String(world_info_min_activations_depth_max);
    const worldInfoMinActDepthMax = document.getElementById('world_info_min_activations_depth_max');
    if (worldInfoMinActDepthMax) worldInfoMinActDepthMax.value = String(world_info_min_activations_depth_max);

    const worldInfoBudgetCounter = document.getElementById('world_info_budget_counter');
    if (worldInfoBudgetCounter) worldInfoBudgetCounter.value = String(world_info_budget);
    const worldInfoBudget = document.getElementById('world_info_budget');
    if (worldInfoBudget) worldInfoBudget.value = String(world_info_budget);

    const worldInfoIncludeNames = document.getElementById('world_info_include_names');
    if (worldInfoIncludeNames) worldInfoIncludeNames.checked = world_info_include_names;
    const worldInfoRecursive = document.getElementById('world_info_recursive');
    if (worldInfoRecursive) worldInfoRecursive.checked = world_info_recursive;
    const worldInfoOverflowAlert = document.getElementById('world_info_overflow_alert');
    if (worldInfoOverflowAlert) worldInfoOverflowAlert.checked = world_info_overflow_alert;
    const worldInfoCaseSensitive = document.getElementById('world_info_case_sensitive');
    if (worldInfoCaseSensitive) worldInfoCaseSensitive.checked = world_info_case_sensitive;
    const worldInfoMatchWholeWords = document.getElementById('world_info_match_whole_words');
    if (worldInfoMatchWholeWords) worldInfoMatchWholeWords.checked = world_info_match_whole_words;
    const worldInfoUseGroupScoring = document.getElementById('world_info_use_group_scoring');
    if (worldInfoUseGroupScoring) worldInfoUseGroupScoring.checked = world_info_use_group_scoring;

    const worldInfoCharStrategy = document.getElementById('world_info_character_strategy');
    const strategyOption = worldInfoCharStrategy?.querySelector(`option[value='${world_info_character_strategy}']`);
    if (strategyOption) strategyOption.selected = true;
    if (worldInfoCharStrategy) worldInfoCharStrategy.value = String(world_info_character_strategy);

    const worldInfoBudgetCap = document.getElementById('world_info_budget_cap');
    if (worldInfoBudgetCap) worldInfoBudgetCap.value = String(world_info_budget_cap);
    const worldInfoBudgetCapCounter = document.getElementById('world_info_budget_cap_counter');
    if (worldInfoBudgetCapCounter) worldInfoBudgetCapCounter.value = String(world_info_budget_cap);

    const worldInfoMaxRecursionSteps = document.getElementById('world_info_max_recursion_steps');
    if (worldInfoMaxRecursionSteps) worldInfoMaxRecursionSteps.value = String(world_info_max_recursion_steps);
    const worldInfoMaxRecursionStepsCounter = document.getElementById('world_info_max_recursion_steps_counter');
    if (worldInfoMaxRecursionStepsCounter) worldInfoMaxRecursionStepsCounter.value = String(world_info_max_recursion_steps);

    world_names = data.world_names?.length ? data.world_names : [];

    // Add to existing selected WI if it exists
    // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
    selected_world_info = selected_world_info.concat(settings.world_info?.globalSelect?.filter((e) => world_names.includes(e)) ?? []);

    if (world_names.length > 0) {
        const worldInfoEl = document.getElementById('world_info');
        if (worldInfoEl) worldInfoEl.innerHTML = '';
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'item' implicitly has an 'any' type.
    world_names.forEach((item, i) => {
        const worldInfoEl = document.getElementById('world_info');
        if (worldInfoEl) worldInfoEl.insertAdjacentHTML('beforeend', `<option value='${i}'${selected_world_info.includes(item) ? ' selected' : ''}>${item}</option>`);
        const worldEditorSelect = document.getElementById('world_editor_select');
        if (worldEditorSelect) worldEditorSelect.insertAdjacentHTML('beforeend', `<option value='${i}'>${item}</option>`);
    });

    const worldInfoSortOrder = document.getElementById('world_info_sort_order');
    if (worldInfoSortOrder) worldInfoSortOrder.value = accountStorage.getItem(SORT_ORDER_KEY) || '0';
    document.getElementById('world_info')!.dispatchEvent(new Event('change'));
    document.getElementById('world_editor_select')!.dispatchEvent(new Event('change'));

    eventSource.on(event_types.CHAT_CHANGED, async () => {
        const hasWorldInfo = !!chat_metadata[METADATA_KEY] && world_names.includes(chat_metadata[METADATA_KEY]);
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
    const selectedIndex = world_names.indexOf(file);
    if (selectedIndex !== -1 && (loadIfNotSelected || currentIndex === selectedIndex)) {
        if (worldEditorSelect) worldEditorSelect.value = String(selectedIndex);
        document.getElementById('world_editor_select')!.dispatchEvent(new Event('change'));
    }
}


/**
 * @returns {void}
 */
function registerWorldInfoSlashCommands() {
    /**
     * Gets a *rough* approximation of the current chat context.
     * Normally, it is provided externally by the prompt builder.
     * Don't use for anything critical!
     * @returns {string[]} Array of chat messages
     */
    function getScanningChat() {
        // @ts-expect-error TS(2339) FIXME: Property 'is_system' does not exist on type 'never... Remove this comment to see the full error message
        return getContext().chat.filter(x => !x.is_system).map(x => x.mes);
    }

    /**
     * @param {string} file - World info file name
     * @param {object} root0 - Options object
     * @param {object} [root0.args] - Arguments
     * @param {unknown} [root0.unnamed] - Unnamed argument
     * @param {string} [root0.callbackName] - Callback name for logging
     * @returns {Promise<string|object[]>} Entries from file or empty string
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'file' implicitly has an 'any' type.
    async function getEntriesFromFile(file, { args = {}, unnamed = null, callbackName = 'getEntriesFromFile' } = {}) {
        if (!file || !world_names.includes(file)) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.warning(t`Valid World Info file name is required`);
            logSlashCommandWarn(`${callbackName}: Valid World Info file name is required`, args, unnamed);
            return '';
        }

        const data = await loadWorldInfo(file);

        if (!data || !('entries' in data)) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.warning(t`World Info file has an invalid format`);
            logSlashCommandWarn(`${callbackName}: World Info file has an invalid format`, args, unnamed);
            return '';
        }

        const entries = Object.values(data.entries);

        if (!entries || entries.length === 0) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.warning(t`World Info file has no entries`);
            logSlashCommandWarn(`${callbackName}: World Info file has no entries`, args, unnamed);
            return '';
        }

        return entries;
    }

    /**
     * Gets the name of the persona-bound lorebook.
     * @param {import('./slash-commands/SlashCommand.js').NamedArguments} args Named arguments
     * @param {string} _unnamedArg not used
     * @returns {Promise<string>} The name of the persona-bound lorebook
     */
    // @ts-expect-error TS(7031) FIXME: Binding element 'name' implicitly has an 'any' typ... Remove this comment to see the full error message
    async function getPersonaBookCallback({ name, create }, _unnamedArg) {
        const bookName = power_user.persona_description_lorebook || '';
        if (bookName) {
            return bookName;
        }

        if (isTrueBoolean(String(create))) {
            // @ts-expect-error TS(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
            const newName = await createWorldWithName(name, `Persona Book ${name1}`.replace(/[^a-z0-9 -]/gi, '_').replace(/_{2,}/g, '_').substring(0, 64));
            power_user.persona_description_lorebook = newName;
            setPersonaDescription();
            saveSettingsDebounced();
            return newName;
        }

        return '';
    }

    /**
     * Gets the name of the character-bound lorebook.
     * @param {import('./slash-commands/SlashCommand.js').NamedArguments} args Named arguments
     * @param {string} characterIdentifier Character name
     * @returns {Promise<string>} The name of the character-bound lorebook, a JSON string of the character's lorebooks, or an empty string
     */
    // @ts-expect-error TS(7031) FIXME: Binding element 'type' implicitly has an 'any' typ... Remove this comment to see the full error message
    async function getCharBookCallback({ type, name, create }, characterIdentifier) {
        const context = getContext();
        if (context.groupId && !characterIdentifier) throw new Error('This command is not available in groups without providing a character name');
        type = String(type ?? '').trim().toLowerCase() || 'primary';
        characterIdentifier = String(characterIdentifier ?? '') || context.characters[context.characterId]?.avatar || null;
        const character = findChar({ name: characterIdentifier });
        if (!character) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.error(t`Character not found.`);
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ characterIdentifier: any; }' i... Remove this comment to see the full error message
            logSlashCommandWarn('getCharBookCallback: Character not found', { type, name, create }, { characterIdentifier });
            return '';
        }
        const books = [];
        if (type === 'all' || type === 'primary' && character.data?.extensions?.world) {
            books.push(character.data.extensions.world);
        }
        if (type === 'all' || type === 'additional') {
            // @ts-expect-error TS(2345) FIXME: Argument of type 'number' is not assignable to par... Remove this comment to see the full error message
            const fileName = getCharaFilename(context.characters.indexOf(character));
            // @ts-expect-error TS(2339) FIXME: Property 'charLore' does not exist on type '{}'.
            const extraCharLore = world_info.charLore?.find((e) => e.name === fileName);
            if (extraCharLore && Array.isArray(extraCharLore.extraBooks)) {
                books.push(...extraCharLore.extraBooks.filter(onlyUnique).filter(Boolean));
            }
        }

        if (isTrueBoolean(String(create)) && books.length === 0) {
            // @ts-expect-error TS(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
            const newName = await createWorldWithName(name, `Character Book ${character.name}`.replace(/[^a-z0-9 -]/gi, '_').replace(/_{2,}/g, '_').substring(0, 64));
            // Also assign the book now - additional if requested, otherwise as primary
            if (type === 'additional') {
                await charUpdateAddAuxWorld(character.avatar, newName);
            } else {
                await charUpdatePrimaryWorld(newName);
            }
            // Refresh UI, if needed
            setWorldInfoButtonClass(this_chid);
            books.push(newName);
        }

        return type === 'primary' ? (books[0] ?? '') : JSON.stringify(books.filter(onlyUnique).filter(Boolean));
    }

    /**
     * Gets the name of the chat-bound lorebook. Creates a new one if it doesn't exist.
     * @param {import('./slash-commands/SlashCommand.js').NamedArguments} args Named arguments
     * @returns {Promise<string>} The name of the chat-bound lorebook
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
    async function getChatBookCallback(args) {
        const chatId = getCurrentChatId();

        if (!chatId) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.warning(t`Open a chat to get a name of the chat-bound lorebook`);
            logSlashCommandWarn('getChatBookCallback: Open a chat to get a name of the chat-bound lorebook', args);
            return '';
        }

        if (chat_metadata[METADATA_KEY] && world_names.includes(chat_metadata[METADATA_KEY])) {
            return chat_metadata[METADATA_KEY];
        }

        if (isFalseBoolean(String(args.create))) {
            return '';
        }

        // @ts-expect-error TS(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
        const name = await createWorldWithName(args.name, `Chat Book ${getCurrentChatId()}`.replace(/[^a-z0-9 -]/gi, '_').replace(/_{2,}/g, '_').substring(0, 64));

        chat_metadata[METADATA_KEY] = name;
        await saveMetadata();
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.querySelector('.chat_lorebook_button').classList.add('world_set');
        return name;
    }

    /**
     * @param {string} [possibleName] - Possible name for the world
     * @param {string} [fallbackName] - Fallback name if possible name is not provided
     * @returns {Promise<string>} The created world name
     */
    async function createWorldWithName(possibleName = undefined, fallbackName = undefined) {
        let newName = (() => {
            // Use the provided name if it's not in use
            if (typeof possibleName === 'string') {
                const name = String(possibleName);
                if (world_names.includes(name)) {
                    throw new Error('This World Info file name is already in use');
                }
                return name;
            }

            // Replace non-alphanumeric characters with underscores, cut to 64 characters
            return fallbackName ?? `Lorebook (${uuidv4()})`;
        })();

        // Make sure the name is unique
        newName = getUniqueName(newName, world_names.includes.bind(world_names));

        await createNewWorldInfo(newName);
        return newName;
    }

    /**
     * @param {object} args - Arguments object containing file and field
     * @param {string} value - Search value
     * @returns {Promise<string>} The matching entry UID or empty string
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
    async function findBookEntryCallback(args, value) {
        const file = args.file;
        const field = args.field || 'key';

        // @ts-expect-error TS(2322) FIXME: Type '{ value: any; }' is not assignable to type '... Remove this comment to see the full error message
        const entries = await getEntriesFromFile(file, { args, unnamed: { value }, callbackName: 'findBookEntryCallback' });

        if (!entries) {
            return '';
        }

        if (typeof newWorldInfoEntryTemplate[field] === 'boolean') {
            const isTrue = isTrueBoolean(value);
            const isFalse = isFalseBoolean(value);

            if (isTrue) {
                value = String(true);
            }

            if (isFalse) {
                value = String(false);
            }
        }

        const fuse = new Fuse(entries, {
            keys: [{ name: field, weight: 1 }],
            includeScore: true,
            threshold: 0.3,
        });

        const results = fuse.search(value);

        if (!results || results.length === 0) {
            return '';
        }

        // @ts-expect-error TS(2339) - results[0]?.item typed as {}
        const result = results[0]?.item?.uid;

        if (result === undefined) {
            return '';
        }

        return result;
    }

    /**
     * @param {object} args - Arguments object containing file and field
     * @param {string} uid - Entry UID
     * @returns {Promise<string>} The entry field value or empty string
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
    async function getEntryFieldCallback(args, uid) {
        const file = args.file;
        const field = args.field || 'content';
        const tags = getContext().tags;

        // @ts-expect-error TS(2322) FIXME: Type '{ uid: any; }' is not assignable to type 'nu... Remove this comment to see the full error message
        const entries = await getEntriesFromFile(file, { args, unnamed: { uid }, callbackName: 'getEntryFieldCallback' });

        if (!entries) {
            return '';
        }

        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        const entry = entries.find(x => String(x.uid) === String(uid));

        if (!entry) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.warning('Valid UID is required');
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ uid: any; }' is not assignable... Remove this comment to see the full error message
            logSlashCommandWarn('getEntryFieldCallback: Valid UID is required', args, { uid });
            console.warn();
            return '';
        }

        if (!Object.hasOwn(newWorldInfoEntryDefinition, field)) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.warning('Valid field name is required');
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ uid: any; }' is not assignable... Remove this comment to see the full error message
            logSlashCommandWarn('getEntryFieldCallback: Valid field name is required', args, { uid });
            return '';
        }

        // handle special cases, otherwise execute default logic
        let fieldValue;
        switch (field) {
            case 'characterFilterNames':
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                if (entry.characterFilter) {
                    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                    fieldValue = entry.characterFilter.names;
                }
                break;
            case 'characterFilterTags':
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                if (entry.characterFilter) {
                    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                    if (!entry.characterFilter.tags) {
                        return '';
                    }
                    //Find the tag objects corresponding to each ID in the array, then return the names
                    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                    fieldValue = tags.filter((tag) => entry.characterFilter.tags.includes(tag.id)).map((tag) => tag.name);
                }
                break;
            case 'characterFilterExclude':
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                if (entry.characterFilter) {
                    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                    fieldValue = entry.characterFilter.isExclude;
                }
                break;
            default:
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                fieldValue = entry[field] ?? newWorldInfoEntryDefinition[field]?.default;
        }

        if (fieldValue === undefined) {
            return '';
        }

        if (Array.isArray(fieldValue)) {
            return JSON.stringify(fieldValue.map(x => substituteParams(x)));
        }

        return substituteParams(String(fieldValue));
    }

    /**
     * @param {object} args - Arguments object containing file and key
     * @param {string} [content] - Entry content
     * @returns {Promise<string>} The created entry UID or empty string
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
    async function createEntryCallback(args, content) {
        const file = args.file;
        const key = args.key;

        const data = await loadWorldInfo(file);

        if (!data || !('entries' in data)) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.warning('Valid World Info file name is required');
            logSlashCommandWarn('createEntryCallback: Valid World Info file name is required', args);
            return '';
        }

        const entry = createWorldInfoEntry(file, data);

        if (key) {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            entry.key.push(key);
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            entry.addMemo = true;
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            entry.comment = key;
        }

        if (content) {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            entry.content = content;
        }

        await saveWorldInfo(file, data);
        reloadEditor(file);

        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        return String(entry.uid);
    }

    /**
     * @param {object} args - Arguments object containing file, uid, and field
     * @param {string} value - New field value
     * @returns {Promise<string>} Empty string on success
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
    async function setEntryFieldCallback(args, value) {
        const file = args.file;
        const uid = args.uid;
        const field = args.field || 'content';
        const tags = getContext().tags;

        // characterFilter is an object with internal fields we need to access, which may also may be null and need to be populated
        // @ts-expect-error TS(7006) FIXME: Parameter 'currentEntry' implicitly has an 'any' t... Remove this comment to see the full error message
        const createCharacterFilterFieldObjectIfNeeded = (currentEntry) => {
            if (!currentEntry.characterFilter) {
                Object.assign(
                    currentEntry,
                    {
                        characterFilter: {
                            isExclude: false,
                            names: [],
                            tags: [],
                        },
                    },
                );
            }
        };

        if (value === undefined) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.warning('Value is required');
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ value: any; }' is not assignab... Remove this comment to see the full error message
            logSlashCommandWarn('setEntryFieldCallback: Value is required', args, { value });
            return '';
        }

        value = value.replace(/\\([{}|])/g, '$1');

        const data = await loadWorldInfo(file);

        if (!data || !('entries' in data)) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.warning('Valid World Info file name is required');
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ value: any; }' is not assignab... Remove this comment to see the full error message
            logSlashCommandWarn('setEntryFieldCallback: Valid World Info file name is required', args, { value });
            return '';
        }

        const entry = data.entries[uid];

        if (!entry) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.warning('Valid UID is required');
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ value: any; }' is not assignab... Remove this comment to see the full error message
            logSlashCommandWarn('setEntryFieldCallback: Valid UID is required', args, { value });
            return '';
        }

        if (!Object.hasOwn(newWorldInfoEntryDefinition, field)) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.warning('Valid field name is required');
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ value: any; }' is not assignab... Remove this comment to see the full error message
            logSlashCommandWarn('setEntryFieldCallback: Valid field name is required', args, { value });
            return '';
        }

        // Init a default value for the field if it does not exist
        if (!Object.hasOwn(entry, field)) {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            entry[field] = newWorldInfoEntryDefinition[field].default;
        }

        // Use an array filter if it exists for the field
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        const arrayFilter = newWorldInfoEntryDefinition[field]?.arrayFilter || (() => true);

        // handle special cases, otherwise execute default logic
        // @ts-expect-error TS(7034) FIXME: Variable 'tagNames' implicitly has type 'any' in s... Remove this comment to see the full error message
        let tagNames;
        let charNames;
        switch (field) {
            case 'characterFilterNames':
                createCharacterFilterFieldObjectIfNeeded(entry);
                charNames = parseStringArray(value);
                entry.characterFilter.names = charNames
                    // @ts-expect-error TS(2322) FIXME: Type 'string' is not assignable to type 'null | un... Remove this comment to see the full error message
                    .map((name) => getCharaFilename(null, { manualAvatarKey: findChar({ name, allowAvatar: true, preferCurrentChar: false, quiet: true })?.avatar }))
                    .filter(Boolean)
                    .filter(onlyUnique);
                setWIOriginalDataValue(data, uid, 'character_filter', entry.characterFilter);
                break;
            case 'characterFilterTags':
                createCharacterFilterFieldObjectIfNeeded(entry);
                tagNames = parseStringArray(value);
                //Find the tag objects corresponding to each name in the user array, then return an array of the corresponding IDs
                // @ts-expect-error TS(7005) FIXME: Variable 'tagNames' implicitly has an 'any' type.
                entry.characterFilter.tags = tags.filter((tag) => tagNames.includes(tag.name)).map((tag) => tag.id);
                setWIOriginalDataValue(data, uid, 'character_filter', entry.characterFilter);
                break;
            case 'characterFilterExclude':
                createCharacterFilterFieldObjectIfNeeded(entry);
                entry.characterFilter.isExclude = isTrueBoolean(value);
                setWIOriginalDataValue(data, uid, 'character_filter', entry.characterFilter);
                break;
            default:
                if (Array.isArray(entry[field])) {
                    entry[field] = parseStringArray(value).filter(arrayFilter);
                } else if (typeof entry[field] === 'boolean') {
                    entry[field] = isTrueBoolean(value);
                } else if (typeof entry[field] === 'number') {
                    entry[field] = Number(value);
                } else {
                    entry[field] = value;
                }

                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                if (originalWIDataKeyMap[field]) {
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    setWIOriginalDataValue(data, uid, originalWIDataKeyMap[field], entry[field]);
                }
        }

        await saveWorldInfo(file, data);
        reloadEditor(file);
        return '';
    }

    /**
     * @param {object} args - Arguments object containing file and effect
     * @param {string} value - Entry UID
     * @returns {Promise<string>} Timed effect data or empty string
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
    async function getTimedEffectCallback(args, value) {
        if (!getCurrentChatId()) {
            throw new Error('This command can only be used in chat');
        }

        const file = args.file;
        const uid = value;
        const effect = args.effect;

        // @ts-expect-error TS(2322) FIXME: Type '{ uid: any; }' is not assignable to type 'nu... Remove this comment to see the full error message
        const entries = await getEntriesFromFile(file, { args, unnamed: { uid }, callbackName: 'getTimedEffectCallback' });

        if (!entries) {
            return '';
        }

        /** @type {WIScanEntry} */
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        const entry = structuredClone(entries.find(x => String(x.uid) === String(uid)));

        if (!entry) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.warning('Valid UID is required');
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ uid: any; }' is not assignable... Remove this comment to see the full error message
            logSlashCommandWarn('getTimedEffectCallback: Valid UID is required', args, { uid });
            return '';
        }

        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        entry.world = file; // Required by the timed effects manager
        const chat = getScanningChat();
        const timedEffects = new WorldInfoTimedEffects(chat, [entry]);

        if (!timedEffects.isValidEffectType(effect)) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.warning('Valid effect type is required');
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ uid: any; }' is not assignable... Remove this comment to see the full error message
            logSlashCommandWarn('getTimedEffectCallback: Valid effect type is required', args, { uid });
            return '';
        }

        const data = timedEffects.getEffectMetadata(effect, entry);

        if (String(args.format).trim().toLowerCase() === ARGUMENT_TYPE.NUMBER) {
            return String(data ? (data.end - chat.length) : 0);
        }

        return String(!!data);
    }

    /**
     * @param {object} args - Arguments object containing file, uid, and effect
     * @param {string} value - New effect state
     * @returns {Promise<string>} Empty string on success
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
    async function setTimedEffectCallback(args, value) {
        if (!getCurrentChatId()) {
            throw new Error('This command can only be used in chat');
        }

        const file = args.file;
        const uid = args.uid;
        const effect = args.effect;

        if (value === undefined) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.warning('New state is required');
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ value: any; }' is not assignab... Remove this comment to see the full error message
            logSlashCommandWarn('setTimedEffectCallback: New state is required', args, { value });
            return '';
        }

        // @ts-expect-error TS(2322) FIXME: Type '{ value: any; }' is not assignable to type '... Remove this comment to see the full error message
        const entries = await getEntriesFromFile(file, { args, unnamed: { value }, callbackName: 'setTimedEffectCallback' });

        if (!entries) {
            return '';
        }

        /** @type {WIScanEntry} */
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        const entry = structuredClone(entries.find(x => String(x.uid) === String(uid)));

        if (!entry) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.warning('Valid UID is required');
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ value: any; }' is not assignab... Remove this comment to see the full error message
            logSlashCommandWarn('setTimedEffectCallback: Valid UID is required', args, { value });
            return '';
        }

        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        entry.world = file; // Required by the timed effects manager
        const chat = getScanningChat();
        const timedEffects = new WorldInfoTimedEffects(chat, [entry]);

        if (!timedEffects.isValidEffectType(effect)) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.warning('Valid effect type is required');
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ value: any; }' is not assignab... Remove this comment to see the full error message
            logSlashCommandWarn('setTimedEffectCallback: Valid effect type is required', args, { value });
            return '';
        }

        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        if (!entry[effect]) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.warning('This entry does not have the selected effect. Configure it in the editor first.');
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ value: any; }' is not assignab... Remove this comment to see the full error message
            logSlashCommandWarn('setTimedEffectCallback: This entry does not have the selected effect', args, { value });
            return '';
        }

        const getNewEffectState = () => {
            const currentState = !!timedEffects.getEffectMetadata(effect, entry);

            if (['toggle', 't', ''].includes(value.trim().toLowerCase())) {
                return !currentState;
            }

            if (isTrueBoolean(value)) {
                return true;
            }

            if (isFalseBoolean(value)) {
                return false;
            }

            return currentState;
        };

        const newEffectState = getNewEffectState();
        timedEffects.setTimedEffect(effect, entry, newEffectState);

        await saveMetadata();
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        notyf.success(`Timed effect "${effect}" for entry ${entry.uid} is now ${newEffectState ? 'active' : 'inactive'}`);

        return '';
    }

    /** A collection of local enum providers for this context of world info */
    const localEnumProviders = {
        /**
         * All possible fields that can be set in a WI entry
         * @returns {SlashCommandEnumValue[]} Array of enum values for WI entry fields
         */
        wiEntryFields: () => Object.entries(newWorldInfoEntryDefinition).map(([key, value]) =>
            // @ts-expect-error TS(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
            new SlashCommandEnumValue(key, `[${value.type}] default: ${(typeof value.default === 'string' ? `'${value.default}'` : JSON.stringify(value.default))}`,
                enumTypes.enum, enumIcons.getDataTypeIcon(value.type))),

        /**
         * All existing UIDs based on the file argument as world name
         * @param {import('./slash-commands/SlashCommandExecutor.js').SlashCommandExecutor} executor - The slash command executor
         * @returns {SlashCommandEnumValue[]} Array of enum values for WI entry UIDs
         */
        // @ts-expect-error TS(7006) FIXME: Parameter 'executor' implicitly has an 'any' type.
        wiUids: (/** @type {import('./slash-commands/SlashCommandExecutor.js').SlashCommandExecutor} */ executor) => {
            // @ts-expect-error TS(7006) FIXME: Parameter 'it' implicitly has an 'any' type.
            const file = executor.namedArgumentList.find(it => it.name == 'file')?.value;
            if (file instanceof SlashCommandClosure) throw new Error('Argument \'file\' does not support closures');
            // Try find world from cache
            if (!worldInfoCache.has(file)) return [];
            const world = worldInfoCache.get(file);
            if (!world) return [];
            return Object.entries(world.entries).map(([uid, data]) =>
                // @ts-expect-error TS(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
                new SlashCommandEnumValue(uid, `${data.comment ? `${data.comment}: ` : ''}${data.key.join(', ')}${data.keysecondary?.length ? ` [${Object.entries(world_info_logic).find(([_, value]) => value == data.selectiveLogic)[0]}] ${data.keysecondary.join(', ')}` : ''} [${getWiPositionString(data)}]`,
                    enumTypes.enum, enumIcons.getWiStatusIcon(data)));
        },

        /**
         * @returns {SlashCommandEnumValue[]} Array of enum values for timed effects
         */
        timedEffects: () => [
            // @ts-expect-error TS(2345) FIXME: Argument of type '"Stays active for N messages"' i... Remove this comment to see the full error message
            new SlashCommandEnumValue('sticky', 'Stays active for N messages', enumTypes.enum, '📌'),
            // @ts-expect-error TS(2345) FIXME: Argument of type '"Cooldown for N messages"' is no... Remove this comment to see the full error message
            new SlashCommandEnumValue('cooldown', 'Cooldown for N messages', enumTypes.enum, '⌛'),
        ],
    };

    /**
     * @param {object} entry - WI entry object
     * @returns {string} Position string representation
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
    function getWiPositionString(entry) {
        switch (entry.position) {
            case world_info_position.before: return '↑Char';
            case world_info_position.after: return '↓Char';
            case world_info_position.EMTop: return '↑EM';
            case world_info_position.EMBottom: return '↓EM';
            case world_info_position.ANTop: return '↑AT';
            case world_info_position.ANBottom: return '↓AT';
            case world_info_position.atDepth: return `@D${enumIcons.getRoleIcon(entry.role)}`;
            default: return '<Unknown>';
        }
    }

    /**
     * @returns {Promise<string>} JSON string of selected global books
     */
    async function getGlobalBooksCallback() {
        if (!selected_world_info?.length) {
            return JSON.stringify([]);
        }

        const entries = selected_world_info.slice();

        console.debug(`[WI] Selected global world info has ${entries.length} entries`, selected_world_info);

        return JSON.stringify(entries);
    }

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'world',
        callback: onWorldInfoChange,
        namedArgumentList: [
            new SlashCommandNamedArgument(
                // @ts-expect-error TS(2345) FIXME: Argument of type 'SlashCommandEnumValue[]' is not ... Remove this comment to see the full error message
                'state', 'set world state', [ARGUMENT_TYPE.STRING], false, false, null, commonEnumProviders.boolean('onOffToggle')(),
            ),
            new SlashCommandNamedArgument(
                'silent', 'suppress toast messages', [ARGUMENT_TYPE.BOOLEAN], false,
            ),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'world name',
                typeList: [ARGUMENT_TYPE.STRING],
                enumProvider: commonEnumProviders.worlds,
            }),
        ],
        helpString: `
            <div>
                Sets active World, or unsets if no args provided, use <code>state=off</code> and <code>state=toggle</code> to deactivate or toggle a World, use <code>silent=true</code> to suppress toast messages.
            </div>
        `,
        aliases: [],
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'getchatbook',
        callback: getChatBookCallback,
        returns: 'lorebook name',
        helpString: 'Get a name of the chat-bound lorebook or create a new one if was unbound, and pass it down the pipe.',
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'name',
                description: 'lorebook name if creating a new one, will be auto-generated otherwise',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
                acceptsMultiple: false,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'create',
                description: 'create a new lorebook if it doesn\'t exist',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                isRequired: false,
                acceptsMultiple: false,
                enumList: commonEnumProviders.boolean('trueFalse')(),
                defaultValue: 'true',
            }),
        ],
        aliases: ['getchatlore', 'getchatwi'],
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'getglobalbooks',
        callback: getGlobalBooksCallback,
        returns: 'list of selected lorebook names',
        helpString: 'Get a list of names of the selected global lorebooks and pass it down the pipe.',
        aliases: ['getgloballore', 'getglobalwi'],
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'getpersonabook',
        callback: getPersonaBookCallback,
        returns: 'lorebook name',

        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'name',
                description: 'lorebook name if creating a new one, will be auto-generated otherwise',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
                acceptsMultiple: false,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'create',
                description: 'create a new lorebook if it doesn\'t exist',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                isRequired: false,
                acceptsMultiple: false,
                enumList: commonEnumProviders.boolean('trueFalse')(),
                defaultValue: 'false',
            }),
        ],
        helpString: 'Get a name of the current persona-bound lorebook and pass it down the pipe. Returns empty string if persona lorebook is not set.',
        aliases: ['getpersonalore', 'getpersonawi'],
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'getcharbook',
        callback: getCharBookCallback,
        returns: 'lorebook name or a list of lorebook names',
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'type',
                description: 'type of the lorebook to get, returns a list for "all" and "additional"',
                typeList: [ARGUMENT_TYPE.STRING],
                enumList: ['primary', 'additional', 'all'],
                defaultValue: 'primary',
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'name',
                description: 'lorebook name if creating a new one, will be auto-generated otherwise',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
                acceptsMultiple: false,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'create',
                description: 'create a new lorebook if it doesn\'t exist',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                isRequired: false,
                acceptsMultiple: false,
                enumList: commonEnumProviders.boolean('trueFalse')(),
                defaultValue: 'false',
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Character name - or unique character identifier (avatar key). If not provided, the current character is used.',
                typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.STRING],
                isRequired: false,
                enumProvider: commonEnumProviders.characters('character'),
            }),
        ],
        helpString: 'Get a name of the character-bound lorebook and pass it down the pipe. Returns empty string if character lorebook is not set. Does not work in group chats without providing a character avatar name.',
        aliases: ['getcharlore', 'getcharwi'],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'findentry',
        aliases: ['findlore', 'findwi'],
        returns: 'UID',
        callback: findBookEntryCallback,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'file',
                description: 'book name',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: commonEnumProviders.worlds,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'field',
                description: 'field value for fuzzy match (default: key)',
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'key',
                enumList: localEnumProviders.wiEntryFields(),
            }),
        ],
        unnamedArgumentList: [
            new SlashCommandArgument(
                'texts', ARGUMENT_TYPE.STRING, true, true,
            ),
        ],
        helpString: `
            <div>
                Find a UID of the record from the specified book using the fuzzy match of a field value (default: key) and pass it down the pipe.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/findentry file=chatLore field=key Shadowfang</code></pre>
                    </li>
                </ul>
            </div>
        `,
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'getentryfield',
        aliases: ['getlorefield', 'getwifield'],
        callback: getEntryFieldCallback,
        returns: 'field value',
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'file',
                description: 'book name',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: commonEnumProviders.worlds,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'field',
                description: 'field to retrieve (default: content)',
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'content',
                enumList: localEnumProviders.wiEntryFields(),
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'record UID',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: localEnumProviders.wiUids,
            }),
        ],
        helpString: `
            <div>
                Get a field value (default: content) of the record with the UID from the specified book and pass it down the pipe.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/getentryfield file=chatLore field=content 123</code></pre>
                    </li>
                </ul>
            </div>
        `,
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'createentry',
        callback: createEntryCallback,
        aliases: ['createlore', 'createwi'],
        returns: 'UID of the new record',
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'file',
                description: 'book name',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: commonEnumProviders.worlds,
            }),
            new SlashCommandNamedArgument(
                'key', 'record key', [ARGUMENT_TYPE.STRING], false,
            ),
        ],
        unnamedArgumentList: [
            new SlashCommandArgument(
                'content', [ARGUMENT_TYPE.STRING], false,
            ),
        ],
        helpString: `
            <div>
                Create a new record in the specified book with the key and content (both are optional) and pass the UID down the pipe.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/createentry file=chatLore key=Shadowfang The sword of the king</code></pre>
                    </li>
                </ul>
            </div>
        `,
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'setentryfield',
        callback: setEntryFieldCallback,
        aliases: ['setlorefield', 'setwifield'],
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'file',
                description: 'book name',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: commonEnumProviders.worlds,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'uid',
                description: 'record UID',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: localEnumProviders.wiUids,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'field',
                description: 'field name (default: content)',
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'content',
                enumList: localEnumProviders.wiEntryFields(),
            }),
        ],
        unnamedArgumentList: [
            new SlashCommandArgument(
                'value', [ARGUMENT_TYPE.STRING], true,
            ),
        ],
        helpString: `
            <div>
                Set a field value (default: content) of the record with the UID from the specified book. To set multiple values for key fields, use comma-delimited list as a value.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/setentryfield file=chatLore uid=123 field=key Shadowfang,sword,weapon</code></pre>
                    </li>
                </ul>
            </div>
        `,
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'wi-set-timed-effect',
        callback: setTimedEffectCallback,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'file',
                description: 'book name',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: commonEnumProviders.worlds,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'uid',
                description: 'record UID',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: localEnumProviders.wiUids,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'effect',
                description: 'effect name',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: localEnumProviders.timedEffects,
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'new state of the effect',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                acceptsMultiple: false,
                enumList: commonEnumProviders.boolean('onOffToggle')(),
            }),
        ],
        helpString: `
            <div>
                Set a timed effect for the record with the UID from the specified book. The duration must be set in the entry itself.
                Will only be applied for the current chat. Enabling an effect that was already active refreshes the duration.
                If the last chat message is swiped or deleted, the effect will be removed.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/wi-set-timed-effect file=chatLore uid=123 effect=sticky on</code></pre>
                    </li>
                </ul>
            </div>
        `,
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'wi-get-timed-effect',
        callback: getTimedEffectCallback,
        helpString: `
            <div>
                Get the current state of the timed effect for the record with the UID from the specified book.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <code>/wi-get-timed-effect file=chatLore format=bool effect=sticky 123</code> - returns true or false if the effect is active or not
                    </li>
                    <li>
                        <code>/wi-get-timed-effect file=chatLore format=number effect=sticky 123</code> - returns the remaining duration of the effect, or 0 if inactive
                    </li>
                </ul>
            </div>
        `,
        returns: 'state of the effect',
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'file',
                description: 'book name',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: commonEnumProviders.worlds,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'effect',
                description: 'effect name',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: localEnumProviders.timedEffects,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'format',
                description: 'output format',
                isRequired: false,
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: ARGUMENT_TYPE.BOOLEAN,
                enumList: [ARGUMENT_TYPE.BOOLEAN, ARGUMENT_TYPE.NUMBER],
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'record UID',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: localEnumProviders.wiUids,
            }),
        ],
    }));
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
 * Loads world info from the backend.
 *
 * This function will return from `worldInfoCache` if it has already been loaded before.
 * @param {string} name - The name of the world to load
 * @returns {Promise<object | null>} A promise that resolves to the loaded world information, or null if the request fails.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export async function loadWorldInfo(name) {
    if (!name) {
        return;
    }

    if (worldInfoCache.has(name)) {
        return worldInfoCache.get(name);
    }

    const response = await fetch('/api/worldinfo/get', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ name: name }),
        cache: 'no-cache',
    });

    if (response.ok) {
        const data = await response.json();
        worldInfoCache.set(name, data);
        return data;
    }

    return null;
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
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const editorSelected = String(document.getElementById('world_editor_select').options[document.getElementById('world_editor_select').selectedIndex].text);
        world_names = data.world_names?.length ? data.world_names : [];
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('world_info').querySelectorAll('option[value!=""]').forEach(el => el.remove());
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('world_editor_select').querySelectorAll('option[value!=""]').forEach(el => el.remove());

        // @ts-expect-error TS(7006) FIXME: Parameter 'item' implicitly has an 'any' type.
        world_names.forEach((item, i) => {
            const globalListOption = new Option(item, i.toString());
            // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
            globalListOption.selected = selected_world_info.includes(item);
            const editorListOption = new Option(item, i.toString());
            editorListOption.selected = editorSelected === item;
            const worldInfoEl = document.getElementById('world_info');
            if (worldInfoEl) worldInfoEl.appendChild(globalListOption);
            const worldEditorSelect = document.getElementById('world_editor_select');
            if (worldEditorSelect) worldEditorSelect.appendChild(editorListOption);
        });
    }
}

/**
 * @returns {Promise<void>}
 */
async function hideWorldEditor() {
    await displayWorldEntries(null, null);
}

/**
 * @param {string} name - World info name to find
 * @returns {JQuery<HTMLElement>} The matching element
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
function getWIElement(name) {
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
function nullWorldInfo() {
    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
    notyf.info('Create or import a new World Info file first.', 'World Info is not set', { timeOut: 10000, preventDuplicates: true });
}

/** @type {Select2Option[]} Cache all keys as selectable dropdown option */
// @ts-expect-error TS(7034) FIXME: Variable 'worldEntryKeyOptionsCache' implicitly ha... Remove this comment to see the full error message
const worldEntryKeyOptionsCache = [];

/**
 * Update the cache and all select options for the keys with new values to display
 * @param {string[]|Select2Option[]} keyOptions - An array of options to update
 * @param {object} options - Optional arguments
 * @param {boolean?} [options.remove] - Whether the option was removed, so the count should be reduced - otherwise it'll be increased
 * @param {boolean?} [options.reset] - Whether the cache should be reset. Reset will also not trigger update of the controls, as we expect them to be redrawn anyway
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'keyOptions' implicitly has an 'any' typ... Remove this comment to see the full error message
function updateWorldEntryKeyOptionsCache(keyOptions, { remove = false, reset = false } = {}) {
    if (!keyOptions.length) return;
    /** @type {Select2Option[]} */
    // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
    const options = keyOptions.map(x => typeof x === 'string' ? { id: getSelect2OptionId(x), text: x } : x);
    if (reset) worldEntryKeyOptionsCache.length = 0;
    // @ts-expect-error TS(7006) FIXME: Parameter 'option' implicitly has an 'any' type.
    options.forEach(option => {
        // Update the cache list
        // @ts-expect-error TS(7005) FIXME: Variable 'worldEntryKeyOptionsCache' implicitly ha... Remove this comment to see the full error message
        let cachedEntry = worldEntryKeyOptionsCache.find(x => x.id == option.id);
        if (cachedEntry) {
            cachedEntry.count += !remove ? 1 : -1;
        } else if (!remove) {
            worldEntryKeyOptionsCache.push(option);
            cachedEntry = option;
            cachedEntry.count = 1;
        }
    });

    // Sort by count DESC and then alphabetically
    // @ts-expect-error TS(7005) FIXME: Variable 'worldEntryKeyOptionsCache' implicitly ha... Remove this comment to see the full error message
    worldEntryKeyOptionsCache.sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
}

/**
 * @param {HTMLElement} listElement - The list element to clear
 * @returns {void}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'listElement' implicitly has an 'any' type.
function clearEntryList(listElement) {
    console.time('clearEntryList');

    if (!listElement.children.length) {
        console.timeEnd('clearEntryList');
        return;
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    listElement.querySelectorAll('.inline-drawer').forEach(function (el) {
        el.removeEventListener('inline-drawer-toggle', nullWorldInfo);
    });

    // @ts-expect-error TS(7006) FIXME: Parameter 'option' implicitly has an 'any' type.
    listElement.querySelectorAll('option').forEach(function (option) {
        option.remove();
    });

    // @ts-expect-error TS(7006) FIXME: Parameter 'select' implicitly has an 'any' type.
    listElement.querySelectorAll('select').forEach(function (select) {
        const tomSelect = select.tomSelect;
        if (tomSelect) {
            try {
                tomSelect.destroy();
            } catch (e) {
                console.debug('TomSelect destroy failed:', e);
            }
        }
        const container = select.parentElement;
        if (container) {
            container.querySelectorAll('*').forEach(function (el) {
                // No-op: removing the container handles cleanup
            });
            container.remove();
        }
        select.remove();
    });

    // @ts-expect-error TS(7006) FIXME: Parameter 'elem' implicitly has an 'any' type.
    listElement.querySelectorAll('div, span, input').forEach(function (elem) {
        elem.remove();
    });

    const totalElementsOfAnyKindLeftInList = listElement.children.length;

    // Final cleanup
    if (totalElementsOfAnyKindLeftInList) {
        console.time('empty');
        listElement.innerHTML = '';
        console.timeEnd('empty');
    }

    console.timeEnd('clearEntryList');
}

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

    // Regardless of whether success is displayed or not. Make sure the delete button is available.
    // Do not put this code behind.
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('world_popup_delete').addEventListener('click', async () => {
        const confirmation = await Popup.show.confirm(`Delete the World/Lorebook: "${name}"?`, 'This action is irreversible!');
        if (!confirmation) {
            return;
        }

        // @ts-expect-error TS(2339) FIXME: Property 'charLore' does not exist on type '{}'.
        if (world_info.charLore) {
            // @ts-expect-error TS(2339) FIXME: Property 'charLore' does not exist on type '{}'.
            world_info.charLore.forEach((charLore, index) => {
                if (charLore.extraBooks?.includes(name)) {
                    // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
                    const tempCharLore = charLore.extraBooks.filter((e) => e !== name);
                    if (tempCharLore.length === 0) {
                        // @ts-expect-error TS(2339) FIXME: Property 'charLore' does not exist on type '{}'.
                        world_info.charLore.splice(index, 1);
                    } else {
                        charLore.extraBooks = tempCharLore;
                    }
                }
            });

            saveSettingsDebounced();
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
    document.getElementById('world_popup_new').addEventListener('click', () => {
        const entry = createWorldInfoEntry(name, data);
        if (entry) updateEditor(entry.uid);
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
        const worldName = world_names[selectedIndex] || null;

        // Use the current name as default input, then ask user for the name
        const tempName = getFreeWorldName(worldName);
        const finalName = await Popup.show.input('Create a new World Info?', 'Enter a name for the new file:', tempName);

        if (finalName) {
            await saveWorldInfo(finalName, data, true);
            await updateWorldInfoList();

            const selectedIndex = world_names.indexOf(finalName);
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

export const originalWIDataKeyMap = {
    'displayIndex': 'extensions.display_index',
    'excludeRecursion': 'extensions.exclude_recursion',
    'preventRecursion': 'extensions.prevent_recursion',
    'delayUntilRecursion': 'extensions.delay_until_recursion',
    'selectiveLogic': 'selectiveLogic',
    'comment': 'comment',
    'constant': 'constant',
    'order': 'insertion_order',
    'depth': 'extensions.depth',
    'probability': 'extensions.probability',
    'position': 'extensions.position',
    'role': 'extensions.role',
    'content': 'content',
    'enabled': 'enabled',
    'key': 'keys',
    'keysecondary': 'secondary_keys',
    'selective': 'selective',
    'matchWholeWords': 'extensions.match_whole_words',
    'useGroupScoring': 'extensions.use_group_scoring',
    'caseSensitive': 'extensions.case_sensitive',
    'matchPersonaDescription': 'extensions.match_persona_description',
    'matchCharacterDescription': 'extensions.match_character_description',
    'matchCharacterPersonality': 'extensions.match_character_personality',
    'matchCharacterDepthPrompt': 'extensions.match_character_depth_prompt',
    'matchScenario': 'extensions.match_scenario',
    'matchCreatorNotes': 'extensions.match_creator_notes',
    'scanDepth': 'extensions.scan_depth',
    'automationId': 'extensions.automation_id',
    'vectorized': 'extensions.vectorized',
    'groupOverride': 'extensions.group_override',
    'groupWeight': 'extensions.group_weight',
    'sticky': 'extensions.sticky',
    'cooldown': 'extensions.cooldown',
    'delay': 'extensions.delay',
    'triggers': 'extensions.triggers',
    'ignoreBudget': 'extensions.ignore_budget',
};

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
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export function setWIOriginalDataValue(data, uid, key, value) {
    if (data.originalData && Array.isArray(data.originalData.entries)) {
        // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
        const originalEntry = data.originalData.entries.find(x => x.uid === uid);

        if (!originalEntry) {
            return;
        }

        setValueByPath(originalEntry, key, value);
    }
}

/**
 * Deletes the original data entry corresponding to the given uid from the provided data object
 * @param {object} data - The data object containing the original data entries
 * @param {string} uid - The unique identifier of the data entry to be deleted
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export function deleteWIOriginalDataValue(data, uid) {
    if (data.originalData && Array.isArray(data.originalData.entries)) {
        // Non-strict equality is used here to allow for both string and number comparisons
        // @eslint-disable-next-line eqeqeq
        // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
        const originalIndex = data.originalData.entries.findIndex(x => x.uid == uid);

        if (originalIndex >= 0) {
            data.originalData.entries.splice(originalIndex, 1);
        }
    }
}

/** @typedef {import('./utils.js').Select2Option} Select2Option */

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
 * Validates if a string is a valid slash-delimited regex, that can be parsed and executed
 *
 * This is a wrapper around `parseRegexFromString`
 * @param {string} input - A delimited regex string
 * @returns {boolean} Whether this would be a valid regex that can be parsed and executed
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'input' implicitly has an 'any' type.
function isValidRegex(input) {
    return parseRegexFromString(input) !== null;
}

/**
 * Gets a real regex object from a slash-delimited regex string
 *
 * This function works with `/` as delimiter, and each occurance of it inside the regex has to be escaped.
 * Flags are optional, but can only be valid flags supported by JavaScript's `RegExp` (`g`, `i`, `m`, `s`, `u`, `y`).
 * @param {string} input - A delimited regex string
 * @returns {RegExp|null} The regex object, or null if not a valid regex
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'input' implicitly has an 'any' type.
export function parseRegexFromString(input) {
    // Extracting the regex pattern and flags
    const match = input.match(/^\/([\w\W]+?)\/([gimsuy]*)$/);
    if (!match) {
        return null; // Not a valid regex format
    }

    const [, rawPattern, flags] = match;
    let pattern = rawPattern;

    // If we find any unescaped slash delimiter, we also exit out.
    // JS doesn't care about delimiters inside regex patterns, but for this to be a valid regex outside of our implementation,
    // we have to make sure that our delimiter is correctly escaped. Or every other engine would fail.
    if (pattern.match(/(^|[^\\])\//)) {
        return null;
    }

    // Now we need to actually unescape the slash delimiters, because JS doesn't care about delimiters
    pattern = pattern.replace('\\/', '/');

    // Then we return the regex. If it fails, it was invalid syntax.
    try {
        return new RegExp(pattern, flags);
    } catch {
        return null;
    }
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
    input.dataset.macros = ''; // active
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
                const commentInput = this.closest('.world_entry_form').querySelector('textarea[name="comment"]');
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
function handleMatchCheckboxHelper({ template, entry, fieldName, data, name }) {
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    const key = originalWIDataKeyMap[fieldName];
    const checkBoxElem = template.querySelector(`input[type="checkbox"][name="${fieldName}"]`);
    checkBoxElem.setAttribute('data-uid', entry.uid);
    checkBoxElem.addEventListener('input', async function (this: any, e: Event) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const uid = this.dataset.uid;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = this.checked;
        const data_noSave = e instanceof CustomEvent ? e.detail?.noSave : false;
        data.entries[uid][fieldName] = value;
        setWIOriginalDataValue(data, uid, key, data.entries[uid][fieldName]);
        if (!data_noSave) await saveWorldInfo(name, data);
    });
    checkBoxElem.checked = !!entry[fieldName];
    checkBoxElem.dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
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
    characterFilter[0].addEventListener('mousedown', async function (this: any, e: Event) {
        if (world_names.length === 0) {
            e.preventDefault();
            return;
        }
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const uid = this.dataset.uid;
        const selectedOptions = this.selectedOptions;
        if ((!selectedOptions || selectedOptions?.length === 0) && !data.entries[uid].characterFilter?.isExclude) {
            delete data.entries[uid].characterFilter;
        } else {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            const names = Array.from(selectedOptions).filter(o => o.matches('[data-type="character"]')).map(o => o instanceof HTMLOptionElement && o.innerText);
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            const tags = Array.from(selectedOptions).filter(o => o.matches('[data-type="tag"]')).map(o => o instanceof HTMLOptionElement && o.value);
            Object.assign(
                data.entries[uid],
                {
                    characterFilter: {
                        isExclude: data.entries[uid].characterFilter?.isExclude ?? false,
                        names: names,
                        tags: tags,
                    },
                },
            );
        }
        setWIOriginalDataValue(data, uid, 'character_filter', data.entries[uid].characterFilter);
        await saveWorldInfo(name, data);
    });
    characterFilter[0].addEventListener('change', async function (this: any) {
        if (world_names.length === 0) {
            return;
        }
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const uid = this.dataset.uid;
        const selectedOptions = this.selectedOptions;
        if ((!selectedOptions || selectedOptions?.length === 0) && !data.entries[uid].characterFilter?.isExclude) {
            delete data.entries[uid].characterFilter;
        } else {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            const names = Array.from(selectedOptions).filter(o => o.matches('[data-type="character"]')).map(o => o instanceof HTMLOptionElement && o.innerText);
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            const tags = Array.from(selectedOptions).filter(o => o.matches('[data-type="tag"]')).map(o => o instanceof HTMLOptionElement && o.value);
            Object.assign(
                data.entries[uid],
                {
                    characterFilter: {
                        isExclude: data.entries[uid].characterFilter?.isExclude ?? false,
                        names: names,
                        tags: tags,
                    },
                },
            );
        }
        setWIOriginalDataValue(data, uid, 'character_filter', data.entries[uid].characterFilter);
        await saveWorldInfo(name, data);
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
    probabilityInput[0].dataset.uid = String(entry.uid);
    probabilityInput[0].addEventListener('input', async function (this: any, e: Event) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const uid = this.dataset.uid;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = Number(this.value);
        const data_noSave = e instanceof CustomEvent ? e.detail?.noSave : false;
        data.entries[uid].probability = !isNaN(value) ? value : null;
        if (data.entries[uid].probability !== null) {
            data.entries[uid].probability = Math.min(100, Math.max(0, data.entries[uid].probability));
            if (data.entries[uid].probability !== value) {
                this.value = data.entries[uid].probability;
            }
        }
        setWIOriginalDataValue(data, uid, 'extensions.probability', data.entries[uid].probability);
        if (!data_noSave) await saveWorldInfo(name, data);
    });
    probabilityInput[0].value = entry.probability;
    probabilityInput[0].dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
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
    selectElem[0].dataset.uid = String(entry.uid);
    selectElem[0].addEventListener('input', async function (this: any, e: Event) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const uid = this.dataset.uid;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = this.value;
        const data_noSave = e instanceof CustomEvent ? e.detail?.noSave : false;
        data.entries[uid][entryKey] = value === 'null' ? null : value === 'true';
        // @ts-expect-error TS(7006) FIXME: Parameter 'm' implicitly has an 'any' type.
        setWIOriginalDataValue(data, uid, `extensions.${entryKey.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`)}`, data.entries[uid][entryKey]);
        if (!data_noSave) await saveWorldInfo(name, data);
    });
    selectElem[0].value = (entry[entryKey] === null || entry[entryKey] === undefined) ? 'null' : entry[entryKey] ? 'true' : 'false';
    selectElem[0].dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
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
    inputElem[0].dataset.uid = String(entry.uid);
    inputElem[0].addEventListener('input', async function (this: any, e: Event) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const uid = this.dataset.uid;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        let value = Number(this.value);
        const data_noSave = e instanceof CustomEvent ? e.detail?.noSave : false;
        if (clamp) {
            if (value < min) {
                value = min;
                this.value = min;
            } else if (value > max) {
                value = max;
                this.value = max;
            }
        }
        data.entries[uid][entryKey] = !isNaN(value) ? value : null;
        // @ts-expect-error TS(7006) FIXME: Parameter 'm' implicitly has an 'any' type.
        setWIOriginalDataValue(data, uid, `extensions.${entryKey.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`)}`, data.entries[uid][entryKey]);
        if (!data_noSave) await saveWorldInfo(name, data);
    });
    inputElem[0].value = entry[entryKey] ?? (clamp ? min : '');
    inputElem[0].dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
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
        const entryDup = duplicateWorldInfoEntry(data, uid);
        if (entryDup) {
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
        const deleted = await deleteWorldInfoEntry(data, uid);
        if (!deleted) return;
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
        world_names.forEach(worldName => {
            if (worldName !== sourceWorld) {
                const option = document.createElement('option');
                option.value = world_names.indexOf(worldName).toString();
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
        const selectedValue = world_names[selectedWorldIndex];
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
                if (editOutlet.offsetParent !== null) {
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

    const editOutlet = headerTemplate.querySelectorAll('.inline-drawer-outlet');

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
            saveSettingsDebounced();
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
        const logicOption = editTemplate?.querySelector(`select[name="entryLogicType"] option[value=${entry.selectiveLogic}]`);
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
            const keysecondarytextpole = this.closest('.world_entry').querySelector('.keysecondarytextpole');
            const keyprimaryselect = this.closest('.world_entry').querySelector('.keyprimaryselect');
            const keyprimaryHeight = keyprimaryselect?.offsetHeight ?? 0;
            if (keysecondarytextpole) keysecondarytextpole.style.height = keyprimaryHeight + 'px';
            if (keysecondary) keysecondary.style.display = value ? '' : 'none';
        });
        selectiveInput[0].checked = true;
        selectiveInput[0].dispatchEvent(new CustomEvent('input', { detail: { noSave: true } }));
        if (selectiveInput[0]?.parentElement) selectiveInput[0].parentElement.style.display = 'none';

        // Character filter
        const characterFilterLabel = editTemplate.querySelectorAll('label[for="characterFilter"] > small');
        characterFilterLabel.textContent = entry.characterFilter?.isExclude ? 'Exclude Character(s)' : 'Filter to Character(s)';
        const characterExclusionInput = editTemplate.querySelectorAll('input[name="character_exclusion"]');
        characterExclusionInput[0].dataset.uid = String(entry.uid);
        characterExclusionInput[0].addEventListener('input', async function (this: any, e: Event) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const uid = this.dataset.uid;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const value = this.checked;
            const data_noSave = e instanceof CustomEvent ? e.detail?.noSave : false;
            characterFilterLabel.textContent = value ? 'Exclude Character(s)' : 'Filter to Character(s)';
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

        const characterFilter = editTemplate.querySelectorAll('select[name="characterFilter"]');
        characterFilter.setAttribute('data-uid', entry.uid);
        initCharacterFilterSelect2Helper(characterFilter);
        fillCharacterAndTagOptionsHelper({ characterFilter, entry });
        handleCharacterFilterChangeHelper({ characterFilter, data, entry, name });

        // Content
        const counter = editTemplate.querySelectorAll('.world_entry_form_token_counter');
        // @ts-expect-error TS(7006) FIXME: Parameter 'counter' implicitly has an 'any' type.
        const countTokensDebounced = debounce(async function (counter, value) {
            const numberOfTokens = await getTokenCountAsync(value);
            counter.textContent = String(numberOfTokens);
        }, debounce_timeout.relaxed);
        const contentInputId = `world_entry_content_${entry.uid}`;
        const contentInput = editTemplate.querySelectorAll('textarea[name="content"]');
        contentInput.setAttribute('data-uid', entry.uid);
        contentInput.setAttribute('id', contentInputId);
        contentInput[0].dataset.macros = ''; // active
        // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
        contentInput.on('input', async function (_, {
            skipCount,
            noSave
        }: { skipCount?: boolean; noSave?: boolean } = {}) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const uid = this.dataset.uid;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const value = this.value;
            data.entries[uid].content = value;
            setWIOriginalDataValue(data, uid, 'content', data.entries[uid].content);
            if (!noSave) await saveWorldInfo(name, data);
            if (!skipCount) countTokensDebounced(counter, value);
        });
        contentInput.value = entry.content.trigger('input', { skipCount: true, noSave: true });
        editTemplate.querySelectorAll('.editor_maximize').attr('data-for', contentInputId);

        // Outlet name
        const outletNameInput = editTemplate.querySelectorAll('input[name="outletName"]');
        outletNameInput.setAttribute('data-uid', entry.uid);
        // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
        outletNameInput.on('input', async function (_, { noSave = false } = {}) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const uid = this.dataset.uid;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const value = this.value;
            data.entries[uid].outletName = value;
            setWIOriginalDataValue(data, uid, 'extensions.outlet_name', data.entries[uid].outletName);
            if (!noSave) await saveWorldInfo(name, data);
        });
        outletNameInput.value = entry.outletName ?? ''.trigger('input', { noSave: true });
        setTimeout(() => createEntryInputAutocomplete(outletNameInput, getOutletNameCallback(data), { allowMultiple: true }), 1);

        // Scan depth
        const scanDepthInput = editTemplate.querySelectorAll('input[name="scanDepth"]');
        scanDepthInput.setAttribute('data-uid', entry.uid);
        // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
        scanDepthInput.on('input', async function (_, { noSave = false } = {}) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
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
        scanDepthInput.value = entry.scanDepth ?? null.trigger('input', { noSave: true });

        // Group
        const groupInput = editTemplate.querySelectorAll('input[name="group"]');
        groupInput.setAttribute('data-uid', entry.uid);
        // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
        groupInput.on('input', async function (_, { noSave = false } = {}) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const uid = this.dataset.uid;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const value = String(this.value).trim();
            data.entries[uid].group = value;
            setWIOriginalDataValue(data, uid, 'extensions.group', data.entries[uid].group);
            if (!noSave) await saveWorldInfo(name, data);
        });
        groupInput.value = entry.group ?? ''.trigger('input', { noSave: true });
        setTimeout(() => createEntryInputAutocomplete(groupInput, getInclusionGroupCallback(data), { allowMultiple: true }), 1);

        // Inclusion priority
        const groupOverrideInput = editTemplate.querySelectorAll('input[name="groupOverride"]');
        groupOverrideInput.setAttribute('data-uid', entry.uid);
        // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
        groupOverrideInput.on('input', async function (_, { noSave = false } = {}) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const uid = this.dataset.uid;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const value = this.checked;
            data.entries[uid].groupOverride = value;
            setWIOriginalDataValue(data, uid, 'extensions.group_override', data.entries[uid].groupOverride);
            if (!noSave) await saveWorldInfo(name, data);
        });
        groupOverrideInput.checked = entry.groupOverride.trigger('input', { noSave: true });

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
        const delayUntilRecursionInput = editTemplate.querySelectorAll('input[name="delay_until_recursion"]');
        delayUntilRecursionInput.setAttribute('data-uid', entry.uid);
        const delayUntilRecursionLevelInput = editTemplate.querySelectorAll('input[name="delayUntilRecursionLevel"]');
        delayUntilRecursionLevelInput.setAttribute('data-uid', entry.uid);
        // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
        delayUntilRecursionInput.on('input', async function (_, { noSave = false } = {}) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const uid = this.dataset.uid;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const toggled = this.checked;
            const value = toggled ? data.entries[uid].delayUntilRecursion || true : false;
            if (!toggled) delayUntilRecursionLevelInput.value = '';
            data.entries[uid].delayUntilRecursion = value;
            setWIOriginalDataValue(data, uid, 'extensions.delay_until_recursion', data.entries[uid].delayUntilRecursion);
            if (!noSave) await saveWorldInfo(name, data);
        });
        delayUntilRecursionInput.checked = entry.delayUntilRecursion.trigger('input', { noSave: true });
        // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
        delayUntilRecursionLevelInput.on('input', async function (_, { noSave = false } = {}) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const uid = this.dataset.uid;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const content = this.value;
            const value = content === '' ? (typeof data.entries[uid].delayUntilRecursion === 'boolean' ? data.entries[uid].delayUntilRecursion : true)
                : content === 1 ? true
                    : !isNaN(Number(content)) ? Number(content)
                        : false;
            data.entries[uid].delayUntilRecursion = value;
            setWIOriginalDataValue(data, uid, 'extensions.delay_until_recursion', data.entries[uid].delayUntilRecursion);
            if (!noSave) await saveWorldInfo(name, data);
        });
        delayUntilRecursionLevelInput.value = ['number', 'string'].includes(typeof entry.delayUntilRecursion ? entry.delayUntilRecursion : '').trigger('input', { noSave: true });

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
        const automationIdInput = editTemplate.querySelectorAll('input[name="automationId"]');
        automationIdInput.setAttribute('data-uid', entry.uid);
        // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
        automationIdInput.on('input', async function (_, { noSave = false } = {}) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const uid = this.dataset.uid;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const value = this.value;
            data.entries[uid].automationId = value;
            setWIOriginalDataValue(data, uid, 'extensions.automation_id', data.entries[uid].automationId);
            if (!noSave) await saveWorldInfo(name, data);
        });
        automationIdInput.value = entry.automationId ?? ''.trigger('input', { noSave: true });
        setTimeout(() => createEntryInputAutocomplete(automationIdInput, getAutomationIdCallback(data)), 1);

        // Generation Type Triggers
        const generationTypeTriggers = editTemplate.querySelectorAll('select[name="triggers"]');
        generationTypeTriggers.setAttribute('data-uid', entry.uid);
        // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
        generationTypeTriggers.on('input', async function (_, { noSave = false } = {}) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const uid = this.dataset.uid;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const value = this.value;
            data.entries[uid].triggers = Array.isArray(value) ? value : [];
            setWIOriginalDataValue(data, uid, 'extensions.triggers', data.entries[uid].triggers);
            if (!noSave) await saveWorldInfo(name, data);
        });
        if (!isMobile()) {
            new TomSelect(generationTypeTriggers[0], {
                maxItems: null,
                placeholder: t`All types (default)`,
                allowEmptyOption: true,
                plugins: ['remove_button'],
            });
        }
        generationTypeTriggers
            .val(Array.isArray(entry.triggers) ? entry.triggers : [])
            .trigger('input', { noSave: true })
            .dispatchEvent(new Event('change', { bubbles: true }));

        // Ignore budget
        const ignoreBudgetInput = editTemplate.querySelectorAll('input[name="ignoreBudget"]');
        ignoreBudgetInput.setAttribute('data-uid', entry.uid);
        // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
        ignoreBudgetInput.on('input', async function (_, { noSave = false } = {}) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const uid = this.dataset.uid;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const value = this.checked;
            data.entries[uid].ignoreBudget = value;
            setWIOriginalDataValue(data, uid, 'extensions.ignore_budget', data.entries[uid].ignoreBudget);
            if (!noSave) await saveWorldInfo(name, data);
        });
        ignoreBudgetInput.checked = entry.ignoreBudget ?? false.trigger('input', { noSave: true });

        countTokensDebounced(counter, contentInput.value);

        const editContent = editTemplate?.querySelector('.inline-drawer-content');
    if (editContent instanceof HTMLElement) editContent.style.display = 'none';
        editOutlet.append(editTemplate);
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
 * Duplicate a WI entry by copying all of its properties and assigning a new uid
 * @param {object} data - The data of the book
 * @param {number} uid - The uid of the entry to copy in this book
 * @returns {object|undefined} The new WI duplicated entry
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export function duplicateWorldInfoEntry(data, uid) {
    if (!data || !('entries' in data) || !data.entries[uid]) {
        return;
    }

    // Exclude uid and gather the rest of the properties
    const originalData = structuredClone(data.entries[uid]);
    delete originalData.uid;

    // Create new entry and copy over data
    const entry = createWorldInfoEntry(data.name, data);
    // @ts-expect-error TS(2769) FIXME: No overload matches this call.
    Object.assign(entry, originalData);

    return entry;
}

/**
 * Deletes a WI entry, with a user confirmation dialog
 * @param {object} data - The data of the book
 * @param {number} uid - The uid of the entry to copy in this book
 * @param {object} [options] - Optional arguments
 * @param {boolean} [options.silent] - Whether to prompt the user for deletion or just do it
 * @returns {Promise<boolean>} Whether the entry deletion was successful
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export async function deleteWorldInfoEntry(data, uid, { silent = false } = {}) {
    if (!data || !('entries' in data)) {
        return;
    }

    const entry = data.entries[uid];
    if (!entry) {
        return false;
    }

    let previewText = '';
    if (entry.comment && entry.comment.trim()) {
        previewText = entry.comment.trim();
    } else if (entry.content) {
        // @ts-expect-error TS(7006) FIXME: Parameter 'line' implicitly has an 'any' type.
        const lines = entry.content.split(/\r?\n/).filter(line => line.trim());
        previewText = lines.slice(0, 2).join('\n');
    }

    const popupHeader = t`Delete world info entry with UID: ${uid}?`;
    const popupText = previewText
        ? `<strong>${t`Entry`}:</strong><br>${escapeHtml(previewText).replace(/\n/g, '<br>')}<br><br>${t`This action is irreversible!`}`
        : t`This action is irreversible!`;

    const confirmation = silent || (await Popup.show.confirm(popupHeader, popupText));
    if (!confirmation) {
        return false;
    }

    delete data.entries[uid];
    return true;
}

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
    // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
    triggers: { default: [], type: 'array', arrayFilter: (value) => GENERATION_TYPE_TRIGGERS.includes(value) },
};

export const newWorldInfoEntryTemplate = Object.fromEntries(
    // @ts-expect-error TS(2339) FIXME: Property 'excludeFromTemplate' does not exist on t... Remove this comment to see the full error message
    Object.entries(newWorldInfoEntryDefinition).filter(([_, value]) => !value.excludeFromTemplate).map(([key, value]) => [key, value.default]),
);

/**
 * Creates a new world info entry from template.
 * @param {string} _name Name of the WI (unused)
 * @param {object} data WI data
 * @returns {object | undefined} New entry object or undefined if failed
 */
// @ts-expect-error TS(7006) FIXME: Parameter '_name' implicitly has an 'any' type.
export function createWorldInfoEntry(_name, data) {
    const newUid = getFreeWorldEntryUid(data);

    if (!Number.isInteger(newUid)) {
        console.error('Couldn\'t assign UID to a new entry');
        return;
    }

    const newEntry = { uid: newUid, ...structuredClone(newWorldInfoEntryTemplate) };
    // @ts-expect-error TS(2538) FIXME: Type 'null' cannot be used as an index type.
    data.entries[newUid] = newEntry;

    return newEntry;
}

/**
 * @param {string} name - World info name
 * @param {object} data - World info data to save
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
async function _save(name, data) {
    // Prevent double saving if both immediate and debounced save are called
    cancelDebounce(saveWorldDebounced);

    await fetch('/api/worldinfo/edit', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ name: name, data: data }),
    });
    await eventSource.emit(event_types.WORLDINFO_UPDATED, name, data);
}


/**
 * Saves the world info
 *
 * This will also refresh the `worldInfoCache`.
 * Note, for performance reasons the saved cache will not make a deep clone of the data.
 * It is your responsibility to not modify the saved data object after calling this function, or there will be data inconsistencies.
 * Call `loadWorldInfoData` or query directly from cache if you need the object again.
 * @param {string} name - The name of the world info
 * @param {object} data - The data to be saved
 * @param {boolean} [immediately] - Whether to save immediately or use debouncing
 * @returns {Promise<void>} A promise that resolves when the world info is saved
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export async function saveWorldInfo(name, data, immediately = false) {
    if (!name || !data) {
        return;
    }

    // Update cache immediately, so any future call can pull from this
    worldInfoCache.set(name, data);

    if (immediately) {
        return await _save(name, data);
    }

    saveWorldDebounced(name, data);
}

/**
 * @param {string} name - Current world info name
 * @param {object} data - World info data
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
async function renameWorldInfo(name, data) {
    const oldName = name;
    const newName = await Popup.show.input('Rename World Info', 'Enter a new name:', oldName);

    if (oldName === newName || !newName) {
        console.debug('World info rename cancelled');
        return;
    }
    if (equalsIgnoreCaseAndAccents(oldName, newName)) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        notyf.warning(t`Name not accepted, as it is the same as before (ignoring case and accents).`, t`Rename World Info`);
        return;
    }

    const entryPreviouslySelected = selected_world_info.findIndex((e) => e === oldName);

    await saveWorldInfo(newName, data, true);
    await deleteWorldInfo(oldName);

    await updateWorldInfoLinks(oldName, newName);

    if (entryPreviouslySelected !== -1) {
        const wiElement = getWIElement(newName);
        if (wiElement instanceof HTMLOptionElement) wiElement.selected = true;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        document.getElementById('world_info')?.dispatchEvent(new Event('change', {bubbles: true}));
    }

    const selectedIndex = world_names.indexOf(newName);
    if (selectedIndex !== -1) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        document.getElementById('world_editor_select').value = String(selectedIndex);
        document.getElementById('world_editor_select')!.dispatchEvent(new Event('change'));
    }
}

/**
 * Retargets all character lore links from an old world info name to a new one, with an optional confirmation for primary lorebook links
 * @param {string} oldName Previous WI file name
 * @param {string} newName New WI file name
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'oldName' implicitly has an 'any' type.
async function updateWorldInfoLinks(oldName, newName) {
    // @ts-expect-error TS(2339) FIXME: Property 'charLore' does not exist on type '{}'.
    const existingCharLores = world_info.charLore?.filter((e) => e.extraBooks.includes(oldName));
    if (existingCharLores && existingCharLores.length > 0) {
        // @ts-expect-error TS(7006) FIXME: Parameter 'charLore' implicitly has an 'any' type.
        existingCharLores.forEach((charLore) => {
            // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
            const tempCharLore = charLore.extraBooks.filter((e) => e !== oldName);
            tempCharLore.push(newName);
            charLore.extraBooks = tempCharLore;
        });
        saveSettingsDebounced();
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
 * Deletes a world info with the given name
 * @param {string} worldInfoName - The name of the world info to delete
 * @returns {Promise<boolean>} A promise that resolves to true if the world info was successfully deleted, false otherwise
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'worldInfoName' implicitly has an 'any' ... Remove this comment to see the full error message
export async function deleteWorldInfo(worldInfoName) {
    if (!world_names.includes(worldInfoName)) {
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

    const existingWorldIndex = selected_world_info.findIndex((e) => e === worldInfoName);
    if (existingWorldIndex !== -1) {
        selected_world_info.splice(existingWorldIndex, 1);
        saveSettingsDebounced();
    }

    await updateWorldInfoList();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('world_editor_select')?.dispatchEvent(new Event('change', {bubbles: true}));

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    if (document.getElementById('character_world').value === worldInfoName) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        document.getElementById('character_world').value = '';
    document.getElementById('character_world')?.dispatchEvent(new Event('change', { bubbles: true }));
        // @ts-expect-error TS(2345) FIXME: Argument of type 'false' is not assignable to para... Remove this comment to see the full error message
        setWorldInfoButtonClass(undefined, false);
        if (menu_type != 'create') {
            saveCharacterDebounced();
        }
    }

    if (power_user.persona_description_lorebook === worldInfoName) {
        power_user.persona_description_lorebook = '';
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        if (power_user.personas[user_avatar]) {
            const object = getOrCreatePersonaDescriptor();
            object.lorebook = '';
        }
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('persona_lore_button').classList.toggle('world_set', false);
        saveSettingsDebounced();
    }

    return true;
}

/**
 * @param {object} data - World info data containing entries
 * @returns {number|null} A free UID or null if none available
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export function getFreeWorldEntryUid(data) {
    if (!data || !('entries' in data)) {
        return null;
    }

    const MAX_UID = 1_000_000; // <- should be safe enough :)
    for (let uid = 0; uid < MAX_UID; uid++) {
        if (uid in data.entries) {
            continue;
        }
        return uid;
    }

    return null;
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
        if (world_names.includes(newName)) {
            continue;
        }
        return newName;
    }

    return undefined;
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
    const worldInfoTemplate = { entries: {} };

    if (!worldName) {
        return false;
    }

    const sanitizedWorldName = await getSanitizedFilename(worldName);

    // @ts-expect-error TS(2322) FIXME: Type '(existingName: any) => Promise<boolean>' is ... Remove this comment to see the full error message
    const allowed = await checkOverwriteExistingData('World Info', world_names, sanitizedWorldName, { interactive: interactive, actionName: 'Create', deleteAction: (existingName) => deleteWorldInfo(existingName) });
    if (!allowed) {
        return false;
    }

    await saveWorldInfo(worldName, worldInfoTemplate, true);
    await updateWorldInfoList();

    const selectedIndex = world_names.indexOf(worldName);
    if (selectedIndex !== -1) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        document.getElementById('world_editor_select').value = String(selectedIndex);
    document.getElementById('world_editor_select')?.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
        await hideWorldEditor();
    }

    return true;
}

/**
 * @returns {Promise<object[]>} Array of character lore entries
 */
async function getCharacterLore() {
    const character = characters[this_chid];
    const name = character?.name;
    /** @type {Set<string>} */
    let worldsToSearch = new Set();

    const baseWorldName = character?.data?.extensions?.world;
    if (baseWorldName) {
        worldsToSearch.add(baseWorldName);
    }

    // TODO: Maybe make the utility function not use the window context?
    const fileName = getCharaFilename(this_chid);
    // @ts-expect-error TS(2339) FIXME: Property 'charLore' does not exist on type '{}'.
    const extraCharLore = world_info.charLore?.find((e) => e.name === fileName);
    if (extraCharLore) {
        worldsToSearch = new Set([...worldsToSearch, ...extraCharLore.extraBooks]);
    }

    if (!worldsToSearch.size) {
        return [];
    }

    // @ts-expect-error TS(7034) FIXME: Variable 'entries' implicitly has type 'any[]' in ... Remove this comment to see the full error message
    let entries = [];
    for (const worldName of worldsToSearch) {
        // @ts-expect-error TS(2345) FIXME: Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
        if (selected_world_info.includes(worldName)) {
            console.debug(`[WI] Character ${name}'s world ${worldName} is already activated in global world info! Skipping...`);
            continue;
        }

        if (chat_metadata[METADATA_KEY] === worldName) {
            console.debug(`[WI] Character ${name}'s world ${worldName} is already activated in chat lore! Skipping...`);
            continue;
        }

        if (power_user.persona_description_lorebook === worldName) {
            console.debug(`[WI] Character ${name}'s world ${worldName} is already activated in persona lore! Skipping...`);
            continue;
        }

        const data = await loadWorldInfo(worldName);
        const newEntries = data ? Object.keys(data.entries).map((x) => data.entries[x]).map(({ uid, ...rest }) => ({ uid, world: worldName, ...rest })) : [];
        // @ts-expect-error TS(7005) FIXME: Variable 'entries' implicitly has an 'any[]' type.
        entries = entries.concat(newEntries);

        if (!newEntries.length) {
            console.debug(`[WI] Character ${name}'s world ${worldName} could not be found or is empty`);
        }
    }

    console.debug(`[WI] Character ${name}'s lore has ${entries.length} world info entries`, [...worldsToSearch]);
    return entries;
}

/**
 * @returns {Promise<object[]>} Array of global lore entries
 */
async function getGlobalLore() {
    if (!selected_world_info?.length) {
        return [];
    }

    // @ts-expect-error TS(7034) FIXME: Variable 'entries' implicitly has type 'any[]' in ... Remove this comment to see the full error message
    let entries = [];
    for (const worldName of selected_world_info) {
        const data = await loadWorldInfo(worldName);
        const newEntries = data ? Object.keys(data.entries).map((x) => data.entries[x]).map(({ uid, ...rest }) => ({ uid, world: worldName, ...rest })) : [];
        // @ts-expect-error TS(7005) FIXME: Variable 'entries' implicitly has an 'any[]' type.
        entries = entries.concat(newEntries);
    }

    console.debug(`[WI] Global world info has ${entries.length} entries`, selected_world_info);

    return entries;
}

/**
 * @returns {Promise<object[]>} Array of chat lore entries
 */
async function getChatLore() {
    const chatWorld = chat_metadata[METADATA_KEY];

    if (!chatWorld) {
        return [];
    }

    // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
    if (selected_world_info.includes(chatWorld)) {
        console.debug(`[WI] Chat world ${chatWorld} is already activated in global world info! Skipping...`);
        return [];
    }

    const data = await loadWorldInfo(chatWorld);
    const entries = data ? Object.keys(data.entries).map((x) => data.entries[x]).map(({ uid, ...rest }) => ({ uid, world: chatWorld, ...rest })) : [];

    console.debug(`[WI] Chat lore has ${entries.length} entries`, [chatWorld]);

    return entries;
}

/**
 * @returns {Promise<object[]>} Array of persona lore entries
 */
async function getPersonaLore() {
    const chatWorld = chat_metadata[METADATA_KEY];
    const personaWorld = power_user.persona_description_lorebook;

    if (!personaWorld) {
        return [];
    }

    if (chatWorld === personaWorld) {
        console.debug(`[WI] Persona world ${personaWorld} is already activated in chat world! Skipping...`);
        return [];
    }

    // @ts-expect-error TS(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
    if (selected_world_info.includes(personaWorld)) {
        console.debug(`[WI] Persona world ${personaWorld} is already activated in global world info! Skipping...`);
        return [];
    }

    const data = await loadWorldInfo(personaWorld);
    const entries = data ? Object.keys(data.entries).map((x) => data.entries[x]).map(({ uid, ...rest }) => ({ uid, world: personaWorld, ...rest })) : [];

    console.debug(`[WI] Persona lore has ${entries.length} entries`, [personaWorld]);

    return entries;
}

/**
 * @returns {Promise<object[]>} Sorted array of all lore entries
 */
export async function getSortedEntries() {
    try {
        const [
            globalLore,
            characterLore,
            chatLore,
            personaLore,
        ] = await Promise.all([
            getGlobalLore(),
            getCharacterLore(),
            getChatLore(),
            getPersonaLore(),
        ]);

        await eventSource.emit(event_types.WORLDINFO_ENTRIES_LOADED, { globalLore, characterLore, chatLore, personaLore });

        let entries;

        switch (Number(world_info_character_strategy)) {
            case world_info_insertion_strategy.evenly:
                entries = [...globalLore, ...characterLore].sort(sortFn);
                break;
            case world_info_insertion_strategy.character_first:
                entries = [...characterLore.sort(sortFn), ...globalLore.sort(sortFn)];
                break;
            case world_info_insertion_strategy.global_first:
                entries = [...globalLore.sort(sortFn), ...characterLore.sort(sortFn)];
                break;
            default:
                console.error('[WI] Unknown WI insertion strategy:', world_info_character_strategy, 'defaulting to evenly');
                entries = [...globalLore, ...characterLore].sort(sortFn);
                break;
        }

        // Chat lore always goes first, then persona lore, then the rest
        entries = [...chatLore.sort(sortFn), ...personaLore.sort(sortFn), ...entries];

        // Calculate hash and parse decorators. Split maps to preserve old hashes.
        entries = entries.map((entry) => {
            const [decorators, content] = parseDecorators(entry.content || '');
            return { ...entry, decorators, content };
        }).map((entry) => {
            const hash = getStringHash(JSON.stringify(entry));
            return { ...entry, hash };
        });

        console.debug(`[WI] Found ${entries.length} world lore entries. Sorted by strategy`, Object.entries(world_info_insertion_strategy).find((x) => x[1] === world_info_character_strategy));

        // Need to deep clone the entries to avoid modifying the cached data
        return structuredClone(entries);
    } catch (e) {
        console.error(e);
        return [];
    }
}


/**
 * Parse decorators from worldinfo content
 * @param {string} content The content to parse
 * @returns {[string[],string]} The decorators found in the content and the content without decorators
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'content' implicitly has an 'any' type.
function parseDecorators(content) {
    /**
     * Check if the decorator is known
     * @param {string} data string to check
     * @returns {boolean} true if the decorator is known
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
    const isKnownDecorator = (data) => {
        if (data.startsWith('@@@')) {
            data = data.substring(1);
        }

        for (let i = 0; i < KNOWN_DECORATORS.length; i++) {
            if (data.startsWith(KNOWN_DECORATORS[i])) {
                return true;
            }
        }
        return false;
    };

    if (content.startsWith('@@')) {
        let newContent = content;
        const splited = content.split('\n');
        const decorators = [];
        let fallbacked = false;

        for (let i = 0; i < splited.length; i++) {
            if (splited[i].startsWith('@@')) {
                if (splited[i].startsWith('@@@') && !fallbacked) {
                    continue;
                }

                if (isKnownDecorator(splited[i])) {
                    decorators.push(splited[i].startsWith('@@@') ? splited[i].substring(1) : splited[i]);
                    fallbacked = false;
                } else {
                    fallbacked = true;
                }
            } else {
                newContent = splited.slice(i).join('\n');
                break;
            }
        }
        return [decorators, newContent];
    }

    return [[], content];
}

/**
 * Performs a scan on the chat and returns the world info activated.
 * @param {string[]} chat The chat messages to scan, in reverse order.
 * @param {number} maxContext The maximum context size of the generation.
 * @param {boolean} isDryRun Whether to perform a dry run.
 * @param {WIGlobalScanData} globalScanData Chat independent context to be scanned
 * @returns {Promise<WIActivated>} The world info activated.
 */
//MARK: checkWorldInfo
// @ts-expect-error TS(7006) FIXME: Parameter 'chat' implicitly has an 'any' type.
export async function checkWorldInfo(chat, maxContext, isDryRun, globalScanData = defaultGlobalScanData) {
    const context = getContext();
    const buffer = new WorldInfoBuffer(chat, globalScanData);

    console.debug(`[WI] --- START WI SCAN (on ${chat.length} messages, trigger = ${globalScanData.trigger})${isDryRun ? ' (DRY RUN)' : ''} ---`);

    // Combine the chat

    // Add the depth or AN if enabled
    // Put this code here since otherwise, the chat reference is modified
    for (const key of Object.keys(context.extensionPrompts)) {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        if (context.extensionPrompts[key]?.scan) {
            const prompt = await getExtensionPromptByName(key);
            if (prompt) {
                buffer.addInject(prompt);
            }
        }
    }

    /** @type {scan_state} */
    let scanState = scan_state.INITIAL;
    let token_budget_overflowed = false;
    let count = 0;
    const allActivatedEntries = new Map();
    const failedProbabilityChecks = new Set();
    let allActivatedText = '';

    let budget = Math.round(world_info_budget * maxContext / 100) || 1;

    if (world_info_budget_cap > 0 && budget > world_info_budget_cap) {
        console.debug(`[WI] Budget ${budget} exceeds cap ${world_info_budget_cap}, using cap`);
        budget = world_info_budget_cap;
    }

    console.debug(`[WI] Context size: ${maxContext}; WI budget: ${budget} (max% = ${world_info_budget}%, cap = ${world_info_budget_cap})`);
    const sortedEntries = await getSortedEntries();
    const timedEffects = new WorldInfoTimedEffects(chat, sortedEntries, isDryRun);

    timedEffects.checkTimedEffects();

    if (sortedEntries.length === 0) {
        return { worldInfoBefore: '', worldInfoAfter: '', WIDepthEntries: [], EMEntries: [], ANBeforeEntries: [], ANAfterEntries: [], outletEntries: {}, allActivatedEntries: new Set() };
    }

    /** @type {number[]} Represents the delay levels for entries that are delayed until recursion */
    const availableRecursionDelayLevels = [...new Set(sortedEntries
        .filter(entry => entry.delayUntilRecursion)
        .map(entry => entry.delayUntilRecursion === true ? 1 : entry.delayUntilRecursion),
    )].sort((a, b) => a - b);
    // Already preset with the first level
    let currentRecursionDelayLevel = availableRecursionDelayLevels.shift() ?? 0;
    if (currentRecursionDelayLevel > 0 && availableRecursionDelayLevels.length) {
        console.debug('[WI] Preparing first delayed recursion level', currentRecursionDelayLevel, '. Still delayed:', availableRecursionDelayLevels);
    }

    console.debug(`[WI] --- SEARCHING ENTRIES (on ${sortedEntries.length} entries) ---`);

    while (scanState) {
        //if world_info_max_recursion_steps is non-zero min activations are disabled, and vice versa
        if (world_info_max_recursion_steps && world_info_max_recursion_steps <= count) {
            console.debug('[WI] Search stopped by reaching max recursion steps', world_info_max_recursion_steps);
            break;
        }

        // Track how many times the loop has run. May be useful for debugging.
        count++;

        console.debug(`[WI] --- LOOP #${count} START ---`);
        console.debug('[WI] Scan state', Object.entries(scan_state).find(x => x[1] === scanState));

        // Until decided otherwise, we set the loop to stop scanning after this
        let nextScanState = scan_state.NONE;

        // Loop and find all entries that can activate here
        const activatedNow = new Set();

        for (const entry of sortedEntries) {
            // Logging preparation
            let headerLogged = false;
            /**
             * @param {...unknown} args - Arguments to log
             * @returns {void}
             */
            // @ts-expect-error TS(7019) FIXME: Rest parameter 'args' implicitly has an 'any[]' ty... Remove this comment to see the full error message
            function log(...args) {
                if (!headerLogged) {
                    console.debug(`[WI] Entry ${entry.uid}`, `from '${entry.world}' processing`, entry);
                    headerLogged = true;
                }
                console.debug(`[WI] Entry ${entry.uid}`, ...args);
            }

            // Already processed, considered and then skipped entries should still be skipped
            if (failedProbabilityChecks.has(entry) || allActivatedEntries.has(`${entry.world}.${entry.uid}`)) {
                continue;
            }

            if (entry.disable == true) {
                log('disabled');
                continue;
            }

            // Check for generation type trigger filter
            if (Array.isArray(entry.triggers) && entry.triggers.length > 0) {
                const isTriggered = entry.triggers.includes(globalScanData.trigger);
                if (!isTriggered) {
                    log(`skipped by generation type trigger filter (${globalScanData.trigger} ∉ ${entry.triggers})`);
                    continue;
                }
            }

            // Check if this entry applies to the character or if it's excluded
            if (entry.characterFilter && entry.characterFilter?.names?.length > 0) {
                const nameIncluded = entry.characterFilter.names.includes(getCharaFilename());
                const filtered = entry.characterFilter.isExclude ? nameIncluded : !nameIncluded;

                if (filtered) {
                    log('filtered out by character');
                    continue;
                }
            }

            if (entry.characterFilter && entry.characterFilter?.tags?.length > 0) {
                const tagKey = getTagKeyForEntity(this_chid);

                if (tagKey) {
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    const tagMapEntry = context.tagMap[tagKey];

                    if (Array.isArray(tagMapEntry)) {
                        // If tag map intersects with the tag exclusion list, skip
                        const includesTag = tagMapEntry.some((tag) => entry.characterFilter.tags.includes(tag));
                        const filtered = entry.characterFilter.isExclude ? includesTag : !includesTag;

                        if (filtered) {
                            log('filtered out by tag');
                            continue;
                        }
                    }
                }
            }

            const isSticky = timedEffects.isEffectActive('sticky', entry);
            const isCooldown = timedEffects.isEffectActive('cooldown', entry);
            const isDelay = timedEffects.isEffectActive('delay', entry);

            if (isDelay) {
                log('suppressed by delay');
                continue;
            }

            if (isCooldown && !isSticky) {
                log('suppressed by cooldown');
                continue;
            }

            // Only use checks for recursion flags if the scan step was activated by recursion
            if (scanState !== scan_state.RECURSION && entry.delayUntilRecursion && !isSticky) {
                log('suppressed by delay until recursion');
                continue;
            }

            if (scanState === scan_state.RECURSION && entry.delayUntilRecursion && entry.delayUntilRecursion > currentRecursionDelayLevel && !isSticky) {
                log('suppressed by delay until recursion level', entry.delayUntilRecursion, '. Currently', currentRecursionDelayLevel);
                continue;
            }

            if (scanState === scan_state.RECURSION && world_info_recursive && entry.excludeRecursion && !isSticky) {
                log('suppressed by exclude recursion');
                continue;
            }

            if (entry.decorators.includes('@@activate')) {
                log('activated by @@activate decorator');
                activatedNow.add(entry);
                continue;
            }

            if (entry.decorators.includes('@@dont_activate')) {
                log('suppressed by @@dont_activate decorator');
                continue;
            }

            if (buffer.getExternallyActivated(entry)) {
                log('externally activated');
                activatedNow.add(buffer.getExternallyActivated(entry));
                continue;
            }

            // Now do checks for immediate activations
            if (entry.constant) {
                log('activated because of constant');
                activatedNow.add(entry);
                continue;
            }

            if (isSticky) {
                log('activated because active sticky');
                activatedNow.add(entry);
                continue;
            }

            if (!Array.isArray(entry.key) || !entry.key.length) {
                log('has no keys defined, skipped');
                continue;
            }

            // Cache the text to scan before the loop, it won't change its content
            const textToScan = buffer.get(entry, scanState);

            // PRIMARY KEYWORDS
            // @ts-expect-error TS(7006) FIXME: Parameter 'key' implicitly has an 'any' type.
            const primaryKeyMatch = entry.key.find(key => {
                const substituted = substituteParams(key);
                return substituted && buffer.matchKeys(textToScan, substituted.trim(), entry);
            });

            if (!primaryKeyMatch) {
                // Don't write logs for simple no-matches
                continue;
            }

            const hasSecondaryKeywords = (
                entry.selective && //all entries are selective now
                Array.isArray(entry.keysecondary) && //always true
                entry.keysecondary.length //ignore empties
            );

            if (!hasSecondaryKeywords) {
                // Handle cases where secondary is empty
                log('activated by primary key match', primaryKeyMatch);
                activatedNow.add(entry);
                continue;
            }


            // SECONDARY KEYWORDS
            const selectiveLogic = entry.selectiveLogic ?? 0; // If selectiveLogic isn't found, assume it's AND, only do this once per entry
            log('Entry with primary key match', primaryKeyMatch, 'has secondary keywords. Checking with logic logic', Object.entries(world_info_logic).find(x => x[1] === entry.selectiveLogic));

            /** @type {() => boolean} */
            function matchSecondaryKeys() {
                let hasAnyMatch = false;
                let hasAllMatch = true;
                for (const keysecondary of entry.keysecondary) {
                    const secondarySubstituted = substituteParams(keysecondary);
                    const hasSecondaryMatch = secondarySubstituted && buffer.matchKeys(textToScan, secondarySubstituted.trim(), entry);

                    if (hasSecondaryMatch) hasAnyMatch = true;
                    if (!hasSecondaryMatch) hasAllMatch = false;

                    // Simplified AND ANY / NOT ALL if statement. (Proper fix for PR#1356 by Bronya)
                    // If AND ANY logic and the main checks pass OR if NOT ALL logic and the main checks do not pass
                    if (selectiveLogic === world_info_logic.AND_ANY && hasSecondaryMatch) {
                        log('activated. (AND ANY) Found match secondary keyword', secondarySubstituted);
                        return true;
                    }
                    if (selectiveLogic === world_info_logic.NOT_ALL && !hasSecondaryMatch) {
                        log('activated. (NOT ALL) Found not matching secondary keyword', secondarySubstituted);
                        return true;
                    }
                }

                // Handle NOT ANY logic
                if (selectiveLogic === world_info_logic.NOT_ANY && !hasAnyMatch) {
                    log('activated. (NOT ANY) No secondary keywords found', entry.keysecondary);
                    return true;
                }

                // Handle AND ALL logic
                if (selectiveLogic === world_info_logic.AND_ALL && hasAllMatch) {
                    log('activated. (AND ALL) All secondary keywords found', entry.keysecondary);
                    return true;
                }

                return false;
            }

            const matched = matchSecondaryKeys();
            if (!matched) {
                log('skipped. Secondary keywords not satisfied', entry.keysecondary);
                continue;
            }

            // Success logging was already done inside the function, so just add the entry
            activatedNow.add(entry);
            continue;
        }

        console.debug(`[WI] Search done. Found ${activatedNow.size} possible entries.`);

        // Sort the entries for the probability and the budget limit checks
        const newEntries = [...activatedNow]
            .sort((a, b) => {
                const isASticky = timedEffects.isEffectActive('sticky', a) ? 1 : 0;
                const isBSticky = timedEffects.isEffectActive('sticky', b) ? 1 : 0;
                return isBSticky - isASticky || sortedEntries.indexOf(a) - sortedEntries.indexOf(b);
            });


        let newContent = '';
        const textToScanTokens = await getTokenCountAsync(allActivatedText);

        filterByInclusionGroups(newEntries, allActivatedEntries, buffer, scanState, timedEffects);

        console.debug('[WI] --- PROBABILITY CHECKS ---');
        if (!newEntries.length) console.debug('[WI] No probability checks to do');

        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        let ignoresBudget = newEntries.filter(e => e.ignoreBudget).length;

        for (const entry of newEntries) {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            ignoresBudget -= (entry.ignoreBudget ? 1 : 0);
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            if (token_budget_overflowed && !entry.ignoreBudget) {
                if (ignoresBudget > 0) {
                    continue;
                }
                break;
            }

            /**
             * @returns {boolean} Whether the probability check passes
             */
            function verifyProbability() {
                // If we don't need to roll, it's always true
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                if (!entry.useProbability || entry.probability === 100) {
                    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                    console.debug(`WI entry ${entry.uid} does not use probability`);
                    return true;
                }

                const isSticky = timedEffects.isEffectActive('sticky', entry);
                if (isSticky) {
                    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                    console.debug(`WI entry ${entry.uid} is sticky, does not need to re-roll probability`);
                    return true;
                }

                const rollValue = Math.random() * 100;
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                if (rollValue <= entry.probability) {
                    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                    console.debug(`WI entry ${entry.uid} passed probability check of ${entry.probability}%`);
                    return true;
                }

                failedProbabilityChecks.add(entry);
                return false;
            }

            const success = verifyProbability();
            if (!success) {
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                console.debug(`WI entry ${entry.uid} failed probability check, removing from activated entries`, entry);
                continue;
            }

            // Substitute macros inline, for both this checking and also future processing
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            entry.content = substituteParams(entry.content);
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            newContent += `${entry.content}\n`;

            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            if (!entry.ignoreBudget && (textToScanTokens + (await getTokenCountAsync(newContent))) >= budget) {
                if (!token_budget_overflowed) {
                    console.debug('[WI] --- BUDGET OVERFLOW CHECK ---');
                    if (world_info_overflow_alert) {
                        console.warn(`[WI] budget of ${budget} reached, stopping after ${allActivatedEntries.size} entries`);
                        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                        notyf.warning(`World info budget reached after ${allActivatedEntries.size} entries.`, 'World Info');
                    } else {
                        console.debug(`[WI] budget of ${budget} reached, stopping after ${allActivatedEntries.size} entries`);
                    }
                    token_budget_overflowed = true;
                }
                continue;
            }

            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            allActivatedEntries.set(`${entry.world}.${entry.uid}`, entry);
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            console.debug(`[WI] Entry ${entry.uid} activation successful, adding to prompt`, entry);
        }

        const successfulNewEntries = newEntries.filter(x => !failedProbabilityChecks.has(x));
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        const successfulNewEntriesForRecursion = successfulNewEntries.filter(x => !x.preventRecursion);

        console.debug(`[WI] --- LOOP #${count} RESULT ---`);
        if (!newEntries.length) {
            console.debug('[WI] No new entries activated.');
        } else if (!successfulNewEntries.length) {
            console.debug('[WI] Probability checks failed for all activated entries. No new entries activated.');
        } else {
            console.debug(`[WI] Successfully activated ${successfulNewEntries.length} new entries to prompt. ${allActivatedEntries.size} total entries activated.`, successfulNewEntries);
        }

        /**
         * @param {...unknown} args - Arguments to log
         * @returns {void}
         */
        // @ts-expect-error TS(7019) FIXME: Rest parameter 'args' implicitly has an 'any[]' ty... Remove this comment to see the full error message
        function logNextState(...args) {
            if (args.length) console.debug(args.shift(), ...args);
            console.debug('[WI] Setting scan state', Object.entries(scan_state).find(x => x[1] === scanState));
        }

        // After processing and rolling entries is done, see if we should continue with normal recursion
        if (world_info_recursive && !token_budget_overflowed && successfulNewEntriesForRecursion.length) {
            nextScanState = scan_state.RECURSION;
            logNextState('[WI] Found', successfulNewEntriesForRecursion.length, 'new entries for recursion');
        }

        // If we are inside min activations scan, and we have recursive buffer, we should do a recursive scan before increasing the buffer again
        // There might be recurse-trigger-able entries that match the buffer, so we need to check that
        if (world_info_recursive && !token_budget_overflowed && scanState === scan_state.MIN_ACTIVATIONS && buffer.hasRecurse()) {
            nextScanState = scan_state.RECURSION;
            logNextState('[WI] Min Activations run done, whill will always be followed by a recursive scan');
        }

        // If scanning is planned to stop, but min activations is set and not satisfied, check if we should continue
        const minActivationsNotSatisfied = world_info_min_activations > 0 && (allActivatedEntries.size < world_info_min_activations);
        if (!nextScanState && !token_budget_overflowed && minActivationsNotSatisfied) {
            console.debug('[WI] --- MIN ACTIVATIONS CHECK ---');

            const over_max = (
                world_info_min_activations_depth_max > 0 &&
                buffer.getDepth() > world_info_min_activations_depth_max
            ) || (buffer.getDepth() > chat.length);

            if (!over_max) {
                nextScanState = scan_state.MIN_ACTIVATIONS; // loop
                logNextState(`[WI] Min activations not reached (${allActivatedEntries.size}/${world_info_min_activations}), advancing depth to ${buffer.getDepth() + 1}, starting another scan`);
                buffer.advanceScan();
            } else {
                console.debug(`[WI] Min activations not reached (${allActivatedEntries.size}/${world_info_min_activations}), but reached on of depth. Stopping`);
            }
        }

        // If the scan is done, but we still have open "delay until recursion" levels, we should continue with the next one
        if (nextScanState === scan_state.NONE && availableRecursionDelayLevels.length) {
            nextScanState = scan_state.RECURSION;
            currentRecursionDelayLevel = availableRecursionDelayLevels.shift();
            logNextState('[WI] Open delayed recursion levels left. Preparing next delayed recursion level', currentRecursionDelayLevel, '. Still delayed:', availableRecursionDelayLevels);
        }

        // Final check if we should really continue scan, and extend the current WI recurse buffer
        const curScanState = scanState;
        scanState = nextScanState;
        if (scanState) {
            const text = successfulNewEntriesForRecursion
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                .map(x => x.content).join('\n');
            if (text) {
                buffer.addRecurse(text);
                allActivatedText = (text + '\n' + allActivatedText);
            }
        } else {
            logNextState('[WI] Scan done. No new entries to prompt. Stopping.');
        }

        // Fire an event after each scan loop, so extensions can hook into the current scanning state
        // @ts-expect-error TS(7022) FIXME: 'args' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const args = {
            state: {
                current: curScanState,
                next: scanState,
                loopCount: count,
            },
            new: {
                all: newEntries,
                successful: successfulNewEntries,
            },
            activated: {
                entries: allActivatedEntries,
                text: allActivatedText,
            },
            sortedEntries,
            recursionDelay: {
                availableLevels: availableRecursionDelayLevels,
                currentLevel: currentRecursionDelayLevel,
            },
            budget: {
                current: budget,
                overflowed: token_budget_overflowed,
            },
            timedEffects,
        };
        await eventSource.emit(event_types.WORLDINFO_SCAN_DONE, args);

        // Some fields are allowed to be changed by listeners, those will be handled here manually. They can be updated via changed the args from the listeners.
        // Any array provided directly can be modified by updating it's elements, adding or removing elements. This has to be done consistently.
        if (args.state.next !== scanState) {
            logNextState('[WI] Scan state changed from', scanState, 'to', args.state.next);
            scanState = args.state.next;
        }
        allActivatedText = args.activated.text;
        currentRecursionDelayLevel = args.recursionDelay.currentLevel;
        budget = args.budget.current;
        token_budget_overflowed = args.budget.overflowed;
    }

    console.debug('[WI] --- BUILDING PROMPT ---');

    // Forward-sorted list of entries for joining
    // @ts-expect-error TS(7034) FIXME: Variable 'WIBeforeEntries' implicitly has type 'an... Remove this comment to see the full error message
    const WIBeforeEntries = [];
    // @ts-expect-error TS(7034) FIXME: Variable 'WIAfterEntries' implicitly has type 'any... Remove this comment to see the full error message
    const WIAfterEntries = [];
    // @ts-expect-error TS(7034) FIXME: Variable 'EMEntries' implicitly has type 'any[]' i... Remove this comment to see the full error message
    const EMEntries = [];
    // @ts-expect-error TS(7034) FIXME: Variable 'ANTopEntries' implicitly has type 'any[]... Remove this comment to see the full error message
    const ANTopEntries = [];
    // @ts-expect-error TS(7034) FIXME: Variable 'ANBottomEntries' implicitly has type 'an... Remove this comment to see the full error message
    const ANBottomEntries = [];
    // @ts-expect-error TS(7034) FIXME: Variable 'WIDepthEntries' implicitly has type 'any... Remove this comment to see the full error message
    const WIDepthEntries = [];
    /** @type {{[key: string]: string[]}} */
    const WIOutletEntries = {};

    // Appends from insertion order 999 to 1. Use unshift for this purpose
    // TODO (kingbri): Change to use WI Anchor positioning instead of separate top/bottom arrays
    [...allActivatedEntries.values()].sort(sortFn).forEach((entry) => {
        const regexDepth = entry.position === world_info_position.atDepth ? (entry.depth ?? DEFAULT_DEPTH) : null;
        const content = getRegexedString(entry.content, regex_placement.WORLD_INFO, { depth: regexDepth, isMarkdown: false, isPrompt: true });

        if (!content) {
            console.debug(`[WI] Entry ${entry.uid}`, 'skipped adding to prompt due to empty content', entry);
            return;
        }

        switch (entry.position) {
            case world_info_position.before:
                WIBeforeEntries.unshift(content);
                break;
            case world_info_position.after:
                WIAfterEntries.unshift(content);
                break;
            case world_info_position.EMTop:
                EMEntries.unshift(
                    { position: wi_anchor_position.before, content: content },
                );
                break;
            case world_info_position.EMBottom:
                EMEntries.unshift(
                    { position: wi_anchor_position.after, content: content },
                );
                break;
            case world_info_position.ANTop:
                ANTopEntries.unshift(content);
                break;
            case world_info_position.ANBottom:
                ANBottomEntries.unshift(content);
                break;
            case world_info_position.atDepth: {
                // @ts-expect-error TS(7005) FIXME: Variable 'WIDepthEntries' implicitly has an 'any[]... Remove this comment to see the full error message
                const existingDepthIndex = WIDepthEntries.findIndex((e) => e.depth === (entry.depth ?? DEFAULT_DEPTH) && e.role === (entry.role ?? extension_prompt_roles.SYSTEM));
                if (existingDepthIndex !== -1) {
                    // @ts-expect-error TS(7005) FIXME: Variable 'WIDepthEntries' implicitly has an 'any[]... Remove this comment to see the full error message
                    WIDepthEntries[existingDepthIndex].entries.unshift(content);
                } else {
                    WIDepthEntries.push({
                        depth: entry.depth,
                        entries: [content],
                        role: entry.role ?? extension_prompt_roles.SYSTEM,
                    });
                }
                break;
            }
            case world_info_position.outlet: {
                if (!entry.outletName) {
                    console.warn(`[WI] Entry ${entry.uid} has position 'outlet' but no outlet name. Skipping.`);
                    break;
                }
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                if (Array.isArray(WIOutletEntries[entry.outletName])) {
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    WIOutletEntries[entry.outletName].push(content);
                } else {
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    WIOutletEntries[entry.outletName] = [content];
                }
                break;
            }
            default:
                break;
        }
    });

    // @ts-expect-error TS(7005) FIXME: Variable 'WIBeforeEntries' implicitly has an 'any[... Remove this comment to see the full error message
    const worldInfoBefore = WIBeforeEntries.length ? WIBeforeEntries.join('\n') : '';
    // @ts-expect-error TS(7005) FIXME: Variable 'WIAfterEntries' implicitly has an 'any[]... Remove this comment to see the full error message
    const worldInfoAfter = WIAfterEntries.length ? WIAfterEntries.join('\n') : '';

    if (shouldWIAddPrompt) {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        const originalAN = context.extensionPrompts[NOTE_MODULE_NAME].value;
        // @ts-expect-error TS(7005) FIXME: Variable 'ANTopEntries' implicitly has an 'any[]' ... Remove this comment to see the full error message
        const ANWithWI = `${ANTopEntries.join('\n')}\n${originalAN}\n${ANBottomEntries.join('\n')}`.replace(/(^\n)|(\n$)/g, '');
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        context.setExtensionPrompt(NOTE_MODULE_NAME, ANWithWI, chat_metadata[metadata_keys.position], chat_metadata[metadata_keys.depth], extension_settings.note.allowWIScan, chat_metadata[metadata_keys.role]);
    }

    timedEffects.setTimedEffects(Array.from(allActivatedEntries.values()));
    buffer.resetExternalEffects();
    timedEffects.cleanUp();

    console.log(`[WI] ${isDryRun ? 'Hypothetically adding' : 'Adding'} ${allActivatedEntries.size} entries to prompt`, Array.from(allActivatedEntries.values()));
    console.debug(`[WI] --- DONE${isDryRun ? ' (DRY RUN)' : ''} ---`);

    // @ts-expect-error TS(7005) FIXME: Variable 'EMEntries' implicitly has an 'any[]' typ... Remove this comment to see the full error message
    return { worldInfoBefore, worldInfoAfter, EMEntries, WIDepthEntries, ANBeforeEntries: ANTopEntries, ANAfterEntries: ANBottomEntries, outletEntries: WIOutletEntries, allActivatedEntries: new Set(allActivatedEntries.values()) };
}

/**
 * Only leaves entries with the highest key matching score in each group.
 * @param {Record<string, WIScanEntry[]>} groups The groups to filter
 * @param {WorldInfoBuffer} buffer The buffer to use for scoring
 * @param {(entry: WIScanEntry) => void} removeEntry The function to remove an entry
 * @param {number} scanState The current scan state
 * @param {Map<string, boolean>} hasStickyMap The sticky entries map
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'groups' implicitly has an 'any' type.
function filterGroupsByScoring(groups, buffer, removeEntry, scanState, hasStickyMap) {
    for (const [key, group] of Object.entries(groups)) {
        // Group scoring is disabled both globally and for the group entries
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        if (!world_info_use_group_scoring && !group.some(x => x.useGroupScoring)) {
            console.debug(`[WI] Skipping group scoring for group '${key}'`);
            continue;
        }

        // If the group has any sticky entries, the rest are already removed by the timed effects filter
        const hasAnySticky = hasStickyMap.get(key);
        if (hasAnySticky) {
            console.debug(`[WI] Skipping group scoring check, group '${key}' has sticky entries`);
            continue;
        }

        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        const scores = group.map(entry => buffer.getScore(entry, scanState));
        const maxScore = Math.max(...scores);
        console.debug(`[WI] Group '${key}' max score:`, maxScore);
        //console.table(group.map((entry, i) => ({ uid: entry.uid, key: JSON.stringify(entry.key), score: scores[i] })));

        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        for (let i = 0; i < group.length; i++) {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            const isScored = group[i].useGroupScoring ?? world_info_use_group_scoring;

            if (!isScored) {
                continue;
            }

            if (scores[i] < maxScore) {
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                console.debug(`[WI] Entry ${group[i].uid}`, `removed as score loser from inclusion group '${key}'`, group[i]);
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                removeEntry(group[i]);
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                group.splice(i, 1);
                scores.splice(i, 1);
                i--;
            }
        }
    }
}

/**
 * Removes entries on cooldown and forces sticky entries as winners.
 * @param {Record<string, WIScanEntry[]>} groups The groups to filter
 * @param {WorldInfoTimedEffects} timedEffects The timed effects to use
 * @param {(entry: WIScanEntry) => void} removeEntry The function to remove an entry
 * @returns {Map<string, boolean>} If any sticky entries were found
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'groups' implicitly has an 'any' type.
function filterGroupsByTimedEffects(groups, timedEffects, removeEntry) {
    /** @type {Map<string, boolean>} */
    const hasStickyMap = new Map();

    for (const [key, group] of Object.entries(groups)) {
        hasStickyMap.set(key, false);

        // If the group has any sticky entries, leave only the sticky entries
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        const stickyEntries = group.filter(x => timedEffects.isEffectActive('sticky', x));
        if (stickyEntries.length) {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            for (const entry of group) {
                if (stickyEntries.includes(entry)) {
                    continue;
                }

                console.debug(`[WI] Entry ${entry.uid}`, `removed as a non-sticky loser from inclusion group '${key}'`, entry);
                removeEntry(entry);
            }

            hasStickyMap.set(key, true);
        }

        // It should not be possible for an entry on cooldown/delay to event get into the grouping phase but @Wolfsblvt told me to leave it here.
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        const cooldownEntries = group.filter(x => timedEffects.isEffectActive('cooldown', x));
        if (cooldownEntries.length) {
            console.debug(`[WI] Inclusion group '${key}' has entries on cooldown. They will be removed.`, cooldownEntries);
            for (const entry of cooldownEntries) {
                removeEntry(entry);
            }
        }

        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        const delayEntries = group.filter(x => timedEffects.isEffectActive('delay', x));
        if (delayEntries.length) {
            console.debug(`[WI] Inclusion group '${key}' has entries with delay. They will be removed.`, delayEntries);
            for (const entry of delayEntries) {
                removeEntry(entry);
            }
        }
    }

    return hasStickyMap;
}

/**
 * Filters entries by inclusion groups.
 * @param {object[]} newEntries Entries activated on current recursion level
 * @param {Map<string, object>} allActivatedEntries Map of all activated entries
 * @param {WorldInfoBuffer} buffer The buffer to use for scanning
 * @param {number} scanState The current scan state
 * @param {WorldInfoTimedEffects} timedEffects The timed effects currently active
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'newEntries' implicitly has an 'any' typ... Remove this comment to see the full error message
function filterByInclusionGroups(newEntries, allActivatedEntries, buffer, scanState, timedEffects) {
    console.debug('[WI] --- INCLUSION GROUP CHECKS ---');

    // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
    const grouped = newEntries.filter(x => x.group).reduce((acc, item) => {
        // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
        item.group.split(/,\s*/).filter(x => x).forEach(group => {
            if (!acc[group]) {
                acc[group] = [];
            }
            acc[group].push(item);
        });
        return acc;
    }, {});

    if (Object.keys(grouped).length === 0) {
        console.debug('[WI] No inclusion groups found');
        return;
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
    const removeEntry = (entry) => newEntries.splice(newEntries.indexOf(entry), 1);
    /**
     * @param {object[]} group - Array of entries in the group
     * @param {object} chosen - The chosen entry to keep
     * @param {boolean} [logging] - Whether to log removed entries
     * @returns {void}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'group' implicitly has an 'any' type.
    function removeAllBut(group, chosen, logging = true) {
        for (const entry of group) {
            if (entry === chosen) {
                continue;
            }

            if (logging) console.debug(`[WI] Entry ${entry.uid}`, `removed as loser from inclusion group '${entry.group}'`, entry);
            removeEntry(entry);
        }
    }

    const hasStickyMap = filterGroupsByTimedEffects(grouped, timedEffects, removeEntry);
    filterGroupsByScoring(grouped, buffer, removeEntry, scanState, hasStickyMap);

    for (const [key, group] of Object.entries(grouped)) {
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        console.debug(`[WI] Checking inclusion group '${key}' with ${group.length} entries`, group);

        // If the group has any sticky entries, the rest are already removed by the timed effects filter
        const hasAnySticky = hasStickyMap.get(key);
        if (hasAnySticky) {
            console.debug(`[WI] Skipping inclusion group check, group '${key}' has sticky entries`);
            continue;
        }

        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        if (Array.from(allActivatedEntries.values()).some(x => x.group === key)) {
            console.debug(`[WI] Skipping inclusion group check, group '${key}' was already activated`);
            // We need to forcefully deactivate all other entries in the group
            removeAllBut(group, null, false);
            continue;
        }

        if (!Array.isArray(group) || group.length <= 1) {
            console.debug('[WI] Skipping inclusion group check, only one entry');
            continue;
        }

        // Check for group prio
        const prios = group.filter(x => x.groupOverride).sort(sortFn);
        if (prios.length) {
            console.debug(`[WI] Entry ${prios[0].uid}`, `activated as prio winner from inclusion group '${key}'`, prios[0]);
            removeAllBut(group, prios[0]);
            continue;
        }

        // Do weighted random using entry's weight
        const totalWeight = group.reduce((acc, item) => acc + (item.groupWeight ?? DEFAULT_WEIGHT), 0);
        const rollValue = Math.random() * totalWeight;
        let currentWeight = 0;
        let winner = null;

        for (const entry of group) {
            currentWeight += (entry.groupWeight ?? DEFAULT_WEIGHT);

            if (rollValue <= currentWeight) {
                console.debug(`[WI] Entry ${entry.uid}`, `activated as roll winner from inclusion group '${key}'`, entry);
                winner = entry;
                break;
            }
        }

        if (!winner) {
            console.debug(`[WI] Failed to activate inclusion group '${key}', no winner found`);
            continue;
        }

        // Remove every group item from newEntries but the winner
        removeAllBut(group, winner);
    }
}

/**
 * @param {object} inputObj - Agnai memory book data
 * @returns {{entries: Record<string, object>}} Converted WI entries
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'inputObj' implicitly has an 'any' type.
function convertAgnaiMemoryBook(inputObj) {
    const outputObj = { entries: {} };

    // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
    inputObj.entries.forEach((entry, index) => {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
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
function convertRisuLorebook(inputObj) {
    const outputObj = { entries: {} };

    // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
    inputObj.data.forEach((entry, index) => {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        outputObj.entries[index] = {
            ...newWorldInfoEntryTemplate,
            uid: index,
            // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
            key: entry.key.split(',').map(x => x.trim()),
            // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
            keysecondary: entry.secondkey ? entry.secondkey.split(',').map(x => x.trim()) : [],
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
function convertNovelLorebook(inputObj) {
    const outputObj = {
        entries: {},
    };

    // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
    inputObj.entries.forEach((entry, index) => {
        const displayName = entry.displayName;
        const addMemo = displayName !== undefined && displayName.trim() !== '';

        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
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
// @ts-expect-error TS(7006) FIXME: Parameter 'characterBook' implicitly has an 'any' ... Remove this comment to see the full error message
export function convertCharacterBook(characterBook) {
    const result = { entries: {}, originalData: characterBook };

    // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
    characterBook.entries.forEach((entry, index) => {
        // Not in the spec, but this is needed to find the entry in the original data
        if (entry.id === undefined) {
            entry.id = index;
        }

        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
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
            position: entry.extensions?.position ?? (entry.position === 'before_char' ? world_info_position.before : world_info_position.after),
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
    const worldSet = Boolean(world && world_names.includes(world));
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
        if (!accountStorage.getItem(checkKey) && (!worldName || !world_names.includes(worldName))) {
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
 * @param {boolean} [skipPopup] - Whether to skip the confirmation popup
 * @returns {Promise<void>}
 */
export async function importEmbeddedWorldInfo(skipPopup = false) {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const chid = document.getElementById('import_character_info').dataset.chid;

    if (chid === undefined || chid === -1) {
        return;
    }

    const hasEmbed = checkEmbeddedWorld(chid);

    if (!hasEmbed) {
        return;
    }

    const bookName = characters[chid]?.data?.character_book?.name || `${characters[chid]?.name}'s Lorebook`;

    if (!skipPopup) {
        const confirmation = await Popup.show.confirm(t`Are you sure you want to import '${bookName}'?`, world_names.includes(bookName) ? t`It will overwrite the World/Lorebook with the same name.` : '');
        if (!confirmation) {
            return;
        }
    }

    const convertedBook = convertCharacterBook(characters[chid].data.character_book);

    await saveWorldInfo(bookName, convertedBook, true);
    await updateWorldInfoList();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('character_world').value = bookName;
    document.getElementById('character_world')?.dispatchEvent(new Event('change', { bubbles: true }));

    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
    notyf.success(t`The world '${bookName}' has been imported and linked to the character successfully.`, t`World/Lorebook imported`);

    const newIndex = world_names.indexOf(bookName);
    if (newIndex >= 0) {
        //show&draw the WI panel before..
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        document.getElementById('WIDrawerIcon').dispatchEvent(new Event('click', { bubbles: true }));
        //..auto-opening the new imported WI
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        document.getElementById('world_editor_select').value = String(newIndex);
    document.getElementById('world_editor_select')?.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // @ts-expect-error TS(2345) FIXME: Argument of type 'true' is not assignable to param... Remove this comment to see the full error message
    setWorldInfoButtonClass(chid, true);
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
                            if (selected_world_info.includes(name)) {
                                // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
                                selected_world_info.splice(selected_world_info.indexOf(name), 1);
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
                            if (selected_world_info.includes(name)) {
                                // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
                                selected_world_info.splice(selected_world_info.indexOf(name), 1);
                                wiElement.selected = false;
                                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                                if (!silent) notyf.success(t`Deactivated world: ${name}`);
                            } else {
                                // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
                                selected_world_info.push(name);
                                wiElement.selected = true;
                                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                                if (!silent) notyf.success(t`Activated world: ${name}`);
                            }
                            break;
                        }
                        case 'on':
                        default: {
                            // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
                            selected_world_info.push(name);
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
            selected_world_info = [];
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            document.getElementById('world_info').value = null.dispatchEvent(new Event('change', { bubbles: true }));
        }
    } else { //if it's a pointer selection
        // @ts-expect-error TS(7034) FIXME: Variable 'tempWorldInfo' implicitly has type 'any[... Remove this comment to see the full error message
        const tempWorldInfo = [];
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const val = document.getElementById('world_info').value;
        const selectedWorlds = (Array.isArray(val) ? val : [val]).map((e) => Number(e)).filter((e) => !isNaN(e));
        if (selectedWorlds.length > 0) {
            selectedWorlds.forEach((worldIndex) => {
                const existingWorldName = world_names[worldIndex];
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
        selected_world_info = tempWorldInfo;
    }

    saveSettingsDebounced();
    eventSource.emit(event_types.WORLDINFO_SETTINGS_UPDATED);
    return '';
}

/**
 * Imports world info from a file.
 * @param {File} file File to import
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
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
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
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        notyf.error(`Error parsing file: ${error}`);
        return;
    }

    const worldName = file.name.substr(0, file.name.lastIndexOf('.'));
    const sanitizedWorldName = await getSanitizedFilename(worldName);
    // @ts-expect-error TS(2322) FIXME: Type '(existingName: any) => Promise<boolean>' is ... Remove this comment to see the full error message
    const allowed = await checkOverwriteExistingData('World Info', world_names, sanitizedWorldName, { interactive: true, actionName: 'Import', deleteAction: (existingName) => deleteWorldInfo(existingName) });
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

            const newIndex = world_names.indexOf(data.name);
            if (newIndex >= 0) {
                // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                document.getElementById('world_editor_select').value = String(newIndex);
    document.getElementById('world_editor_select')?.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.success(t`World Info "${data.name}" imported successfully!`);
        }
    } catch (error) {
        console.error('Error importing world info:', error);
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        notyf.error(t`Failed to import World Info`);
    }
}

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
    const index = world_names.indexOf(worldName);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('world_editor_select').value = String(index);
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

    for (const worldName of world_names) {
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
 * Moves a World Info entry from a source lorebook to a target lorebook.
 * @param {string} sourceName - The name of the source lorebook file.
 * @param {string} targetName - The name of the target lorebook file.
 * @param {string|number} uid - The UID of the entry to move from the source lorebook.
 * @param {object} options - Additional options for the move operation.
 * @param {boolean} [options.deleteOriginal] - Whether to delete the original entry from the source lorebook after moving it.
 * @returns {Promise<boolean>} True if the move was successful, false otherwise.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'sourceName' implicitly has an 'any' typ... Remove this comment to see the full error message
export async function moveWorldInfoEntry(sourceName, targetName, uid, { deleteOriginal = true } = {}) {
    if (sourceName === targetName) {
        return false;
    }

    if (!world_names.includes(sourceName)) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        notyf.error(t`Source lorebook '${sourceName}' not found.`);
        console.error(`[WI Move] Source lorebook '${sourceName}' does not exist.`);
        return false;
    }

    if (!world_names.includes(targetName)) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        notyf.error(t`Target lorebook '${targetName}' not found.`);
        console.error(`[WI Move] Target lorebook '${targetName}' does not exist.`);
        return false;
    }

    const entryUidString = String(uid);

    try {
        const sourceData = await loadWorldInfo(sourceName);
        const targetData = await loadWorldInfo(targetName);

        if (!sourceData || !sourceData.entries) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.error(t`Failed to load data for source lorebook '${sourceName}'.`);
            console.error(`[WI Move] Could not load source data for '${sourceName}'.`);
            return false;
        }
        if (!targetData || !targetData.entries) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.error(t`Failed to load data for target lorebook '${targetName}'.`);
            console.error(`[WI Move] Could not load target data for '${targetName}'.`);
            return false;
        }

        if (!sourceData.entries[entryUidString]) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.error(t`Entry not found in source lorebook '${sourceName}'.`);
            console.error(`[WI Move] Entry UID ${entryUidString} not found in '${sourceName}'.`);
            return false;
        }

        const entryToMove = structuredClone(sourceData.entries[entryUidString]);

        const newUid = getFreeWorldEntryUid(targetData);
        if (newUid === null) {
            console.error(`[WI Move] Failed to get a free UID in '${targetName}'.`);
            return false;
        }

        entryToMove.uid = newUid;
        // Place the entry at the end of the target lorebook
        // @ts-expect-error TS(2345) FIXME: Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
        const maxDisplayIndex = Object.values(targetData.entries).reduce((max, entry) => Math.max(max, entry.displayIndex ?? -1), -1);
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        entryToMove.displayIndex = maxDisplayIndex + 1;

        targetData.entries[newUid] = entryToMove;

        if (deleteOriginal) {
            delete sourceData.entries[entryUidString];
            // Remove from originalData if it exists
            deleteWIOriginalDataValue(sourceData, entryUidString);
            // TODO: setWIOriginalDataValue
            console.debug(`[WI Move] Removed entry UID ${entryUidString} from source '${sourceName}'.`);
        }

        await saveWorldInfo(targetName, targetData, true);
        console.debug(`[WI Move] Saved target lorebook '${targetName}'.`);
        await saveWorldInfo(sourceName, sourceData, true);
        console.debug(`[WI Move] Saved source lorebook '${sourceName}'.`);

        console.log(`[WI Move] ${entryToMove.comment} ${deleteOriginal ? 'moved' : 'copied'} successfully to '${targetName}'.`);

        // Check if the currently viewed book in the editor is the source or target and reload it
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const currentEditorBookIndex = Number(document.getElementById('world_editor_select').value = String());
        if (!isNaN(currentEditorBookIndex)) {
            const currentEditorBookName = world_names[currentEditorBookIndex];
            if (currentEditorBookName === sourceName || currentEditorBookName === targetName) {
                reloadEditor(currentEditorBookName);
            }
        }

        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        notyf.success(deleteOriginal
            ? t`Entry moved successfully from '${sourceName}' to '${targetName}'.`
            : t`Entry copied successfully to '${targetName}'.`);

        return true;
    } catch (error) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        notyf.error(t`An unexpected error occurred while moving the entry: ${error.message}`);
        console.error('[WI Move] Unexpected error:', error);
        return false;
    }
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
    const charLore = world_info.charLore ?? [];
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
    saveSettingsDebounced();
}

/**
 *
 */
export function initWorldInfo() {
    (document.getElementById('world_info') as HTMLSelectElement).addEventListener('mousedown', async function (e) {
        // If there's no world names, don't do anything
        if (world_names.length === 0) {
            e.preventDefault();
            return;
        }

        // @ts-expect-error TS(2554) FIXME: Expected 2 arguments, but got 1.
        onWorldInfoChange('__notSlashCommand__');
    });
    (document.getElementById('world_info') as HTMLSelectElement).addEventListener('change', async function () {
        // If there's no world names, don't do anything
        if (world_names.length === 0) {
            return;
        }

        // @ts-expect-error TS(2554) FIXME: Expected 2 arguments, but got 1.
        onWorldInfoChange('__notSlashCommand__');
    });

    //**************************WORLD INFO IMPORT EXPORT*************************//
    (document.getElementById('world_import_button') as HTMLElement).addEventListener('click', function () {
        (document.getElementById('world_import_file') as HTMLInputElement).dispatchEvent(new Event('click'));
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
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const selectedIndex = String(document.getElementById('world_editor_select').options[document.getElementById('world_editor_select').selectedIndex].value);

        if (selectedIndex === '') {
            await hideWorldEditor();
        } else {
            const worldName = world_names[selectedIndex];
            showWorldEditor(worldName);
        }
    });

    const saveSettings = () => {
        saveSettingsDebounced();
        eventSource.emit(event_types.WORLDINFO_SETTINGS_UPDATED);
    };

    (document.getElementById('world_info_depth') as HTMLInputElement).addEventListener('input', function () {
        world_info_depth = Number(this.value);
        const counter = document.getElementById('world_info_depth_counter') as HTMLInputElement | null;
        if (counter) counter.value = this.value;
        saveSettings();
    });

    (document.getElementById('world_info_min_activations') as HTMLInputElement).addEventListener('input', function () {
        world_info_min_activations = Number(this.value);
        const counter = document.getElementById('world_info_min_activations_counter') as HTMLInputElement | null;
        if (counter) counter.value = String(world_info_min_activations);

        if (world_info_min_activations !== 0 && world_info_max_recursion_steps !== 0) {
            const maxRecursionEl = document.getElementById('world_info_max_recursion_steps') as HTMLInputElement | null;
            if (maxRecursionEl) {
                maxRecursionEl.value = '0';
                maxRecursionEl.dispatchEvent(new Event('input'));
            }
            const minActEl = document.getElementById('world_info_min_activations') as HTMLInputElement | null;
            flashHighlight(minActEl?.parentElement);
            console.info('[WI] Max recursion steps set to 0, as min activations is set to', world_info_min_activations);
        } else {
            saveSettings();
        }
    });

    (document.getElementById('world_info_min_activations_depth_max') as HTMLInputElement).addEventListener('input', function () {
        world_info_min_activations_depth_max = Number(this.value);
        const counter = document.getElementById('world_info_min_activations_depth_max_counter') as HTMLInputElement | null;
        if (counter) counter.value = this.value;
        saveSettings();
    });

    (document.getElementById('world_info_budget') as HTMLInputElement).addEventListener('input', function () {
        world_info_budget = Number(this.value);
        const counter = document.getElementById('world_info_budget_counter') as HTMLInputElement | null;
        if (counter) counter.value = this.value;
        saveSettings();
    });

    (document.getElementById('world_info_include_names') as HTMLInputElement).addEventListener('input', function () {
        world_info_include_names = !!this.checked;
        saveSettings();
    });

    (document.getElementById('world_info_recursive') as HTMLInputElement).addEventListener('input', function () {
        world_info_recursive = !!this.checked;
        saveSettings();
    });

    (document.getElementById('world_info_case_sensitive') as HTMLInputElement).addEventListener('input', function () {
        world_info_case_sensitive = !!this.checked;
        saveSettings();
    });

    (document.getElementById('world_info_match_whole_words') as HTMLInputElement).addEventListener('input', function () {
        world_info_match_whole_words = !!this.checked;
        saveSettings();
    });

    (document.getElementById('world_info_character_strategy') as HTMLSelectElement).addEventListener('change', function () {
        world_info_character_strategy = Number(this.value);
        saveSettings();
    });

    (document.getElementById('world_info_overflow_alert') as HTMLInputElement).addEventListener('change', function () {
        world_info_overflow_alert = !!this.checked;
        saveSettingsDebounced();
    });

    (document.getElementById('world_info_use_group_scoring') as HTMLInputElement).addEventListener('change', function () {
        world_info_use_group_scoring = !!this.checked;
        saveSettingsDebounced();
    });

    (document.getElementById('world_info_budget_cap') as HTMLInputElement).addEventListener('input', function () {
        world_info_budget_cap = Number(this.value);
        const counter = document.getElementById('world_info_budget_cap_counter') as HTMLInputElement | null;
        if (counter) counter.value = String(world_info_budget_cap);
        saveSettings();
    });

    (document.getElementById('world_info_max_recursion_steps') as HTMLInputElement).addEventListener('input', function () {
        world_info_max_recursion_steps = Number(this.value);
        const counter = document.getElementById('world_info_max_recursion_steps_counter') as HTMLInputElement | null;
        if (counter) counter.value = String(world_info_max_recursion_steps);
        if (world_info_max_recursion_steps !== 0 && world_info_min_activations !== 0) {
            const minActivationsEl = document.getElementById('world_info_min_activations') as HTMLInputElement | null;
            if (minActivationsEl) {
                minActivationsEl.value = '0';
                minActivationsEl.dispatchEvent(new Event('input'));
            }
            const maxRecEl = document.getElementById('world_info_max_recursion_steps') as HTMLInputElement | null;
            flashHighlight(maxRecEl?.parentElement); // flash the other control to show it has changed
            console.info('[WI] Min activations set to 0, as max recursion steps is set to', world_info_max_recursion_steps);
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
        if (worldName && world_names.includes(worldName) && !event.shiftKey && !event.altKey) {
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
        });

        new TomSelect(document.getElementById('world_info'), {
            maxItems: null,
            placeholder: t`No Worlds active. Click here to select.`,
            allowEmptyOption: true,
            plugins: ['remove_button'],
        });

        // Subscribe world loading to the TomSelect multiselect items (We need to target the specific ts-control)
        select2ChoiceClickSubscribe(document.getElementById('world_info'), target => {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const name = target.textContent;
            const selectedIndex = world_names.indexOf(name);
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
