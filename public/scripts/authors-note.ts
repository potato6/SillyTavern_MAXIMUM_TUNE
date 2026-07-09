import {
    MAX_INJECTION_DEPTH,
    animation_duration,
    chat_metadata,
    eventSource,
    event_types,
    extension_prompt_roles,
    extension_prompt_types,
    saveSettingsDebounced,
    this_chid,
} from '../script.js';
import { selected_group } from './group-chats.js';
import { extension_settings, getContext, saveMetadataDebounced } from './extensions.js';
import { getCharaFilename, debounce, delay } from './utils.js';
import { getTokenCountAsync } from './tokenizers.js';
import { debounce_timeout } from './constants.js';
import { SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument } from './slash-commands/SlashCommandArgument.js';
export { MODULE_NAME as NOTE_MODULE_NAME };
import { t } from './i18n.js';
import { macros, MacroCategory } from './macros/macro-system.js';
import { MacrosParser } from './macros.js';
import { power_user } from './power-user.js';

const MODULE_NAME = '2_floating_prompt'; // <= Deliberate, for sorting lower than memory

export let shouldWIAddPrompt = false;

export const metadata_keys = {
    prompt: 'note_prompt',
    interval: 'note_interval',
    depth: 'note_depth',
    position: 'note_position',
    role: 'note_role',
};

const chara_note_position = {
    replace: 0,
    before: 1,
    after: 2,
};

/**
 * @param {string} _ Unused
 * @param {string} text Text to set as author's note
 * @returns {string} Current author's note text
 */
// @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
function setNoteTextCommand(_, text) {
    if (text) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#extension_floating_prompt').val(text).trigger('input');
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success(t`Author's Note text updated`);
    }
    return chat_metadata[metadata_keys.prompt];
}

/**
 * @param {string} _ Unused
 * @param {string} text Depth value to set
 * @returns {number|undefined} Current depth, or undefined if invalid
 */
// @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
function setNoteDepthCommand(_, text) {
    if (text) {
        const value = Number(text);

        if (Number.isNaN(value)) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(t`Not a valid number`);
            return;
        }

        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#extension_floating_depth').val(Math.abs(value)).trigger('input');
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success(t`Author's Note depth updated`);
    }
    return chat_metadata[metadata_keys.depth];
}

/**
 * @param {string} _ Unused
 * @param {string} text Interval value to set
 * @returns {number|undefined} Current interval, or undefined if invalid
 */
// @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
function setNoteIntervalCommand(_, text) {
    if (text) {
        const value = Number(text);

        if (Number.isNaN(value)) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(t`Not a valid number`);
            return;
        }

        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#extension_floating_interval').val(Math.abs(value)).trigger('input');
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success(t`Author's Note frequency updated`);
    }
    return chat_metadata[metadata_keys.interval];
}

/**
 * @param {string} _ Unused
 * @param {string} text Position value to set
 * @returns {string|undefined} Current position name, or undefined if invalid
 */
// @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
function setNotePositionCommand(_, text) {
    const validPositions = {
        'after': 0,
        'scenario': 0,
        'chat': 1,
        'before_scenario': 2,
        'before': 2,
    };

    if (text) {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        const position = validPositions[text?.trim()?.toLowerCase()];

        if (typeof position === 'undefined') {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(t`Not a valid position`);
            return;
        }

        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $(`input[name="extension_floating_position"][value="${position}"]`).prop('checked', true).trigger('input');
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info(t`Author's Note position updated`);
    }
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    return Object.keys(validPositions).find(key => validPositions[key] == chat_metadata[metadata_keys.position]);
}

/**
 * @param {string} _ Unused
 * @param {string} text Role value to set
 * @returns {string|undefined} Current role name, or undefined if invalid
 */
// @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
function setNoteRoleCommand(_, text) {
    const validRoles = {
        'system': 0,
        'user': 1,
        'assistant': 2,
    };

    if (text) {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        const role = validRoles[text?.trim()?.toLowerCase()];

        if (typeof role === 'undefined') {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(t`Not a valid role`);
            return;
        }

        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#extension_floating_role').val(Math.abs(role)).trigger('input');
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info(t`Author's Note role updated`);
    }
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    return Object.keys(validRoles).find(key => validRoles[key] == chat_metadata[metadata_keys.role]);
}

/**
 *
 */
function updateSettings() {
    saveSettingsDebounced();
    loadSettings();
    setFloatingPrompt();
}

// @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
const setMainPromptTokenCounterDebounced = debounce(async (value) => $('#extension_floating_prompt_token_counter').text(await getTokenCountAsync(value)), debounce_timeout.relaxed);
// @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
const setCharaPromptTokenCounterDebounced = debounce(async (value) => $('#extension_floating_chara_token_counter').text(await getTokenCountAsync(value)), debounce_timeout.relaxed);
// @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
const setDefaultPromptTokenCounterDebounced = debounce(async (value) => $('#extension_floating_default_token_counter').text(await getTokenCountAsync(value)), debounce_timeout.relaxed);

/**
 *
 */
async function onExtensionFloatingPromptInput() {
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    chat_metadata[metadata_keys.prompt] = $(this).val();
    setMainPromptTokenCounterDebounced(chat_metadata[metadata_keys.prompt]);
    updateSettings();
    saveMetadataDebounced();
}

/**
 *
 */
async function onExtensionFloatingIntervalInput() {
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    chat_metadata[metadata_keys.interval] = Number($(this).val());
    updateSettings();
    saveMetadataDebounced();
}

/**
 *
 */
async function onExtensionFloatingDepthInput() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    let value = Number($(this).val());

    if (value < 0) {
        value = Math.abs(value);
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $(this).val(value);
    }

    chat_metadata[metadata_keys.depth] = value;
    updateSettings();
    saveMetadataDebounced();
}

/**
 * @param {Event} e Input event
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
async function onExtensionFloatingPositionInput(e) {
    chat_metadata[metadata_keys.position] = Number(e.target.value);
    updateSettings();
    saveMetadataDebounced();
}

/**
 * @param {Event} e Input event
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
async function onDefaultPositionInput(e) {
    // @ts-expect-error TS(2339) FIXME: Property 'defaultPosition' does not exist on type ... Remove this comment to see the full error message
    extension_settings.note.defaultPosition = Number(e.target.value);
    saveSettingsDebounced();
}

/**
 *
 */
async function onDefaultDepthInput() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    let value = Number($(this).val());

    if (value < 0) {
        value = Math.abs(value);
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $(this).val(value);
    }

    // @ts-expect-error TS(2339) FIXME: Property 'defaultDepth' does not exist on type '{ ... Remove this comment to see the full error message
    extension_settings.note.defaultDepth = value;
    saveSettingsDebounced();
}

/**
 *
 */
async function onDefaultIntervalInput() {
    // @ts-expect-error TS(2339) FIXME: Property 'defaultInterval' does not exist on type ... Remove this comment to see the full error message
    extension_settings.note.defaultInterval = Number($(this).val());
    saveSettingsDebounced();
}

/**
 * @param {Event} e Input event
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
function onExtensionFloatingRoleInput(e) {
    chat_metadata[metadata_keys.role] = Number(e.target.value);
    updateSettings();
}

/**
 * @param {Event} e Input event
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
function onExtensionDefaultRoleInput(e) {
    // @ts-expect-error TS(2339) FIXME: Property 'defaultRole' does not exist on type '{ d... Remove this comment to see the full error message
    extension_settings.note.defaultRole = Number(e.target.value);
    saveSettingsDebounced();
}

/**
 * @param {Event} e Input event
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
async function onExtensionFloatingCharPositionInput(e) {
    const value = e.target.value;
    // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
    const charaNote = extension_settings.note.chara.find((e) => e.name === getCharaFilename());

    if (charaNote) {
        // @ts-expect-error TS(2339) FIXME: Property 'position' does not exist on type 'never'... Remove this comment to see the full error message
        charaNote.position = Number(value);
        updateSettings();
    }
}

/**
 *
 */
function onExtensionFloatingCharaPromptInput() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const tempPrompt = $(this).val();
    const avatarName = getCharaFilename();
    const tempCharaNote = {
        name: avatarName,
        prompt: tempPrompt,
    };

    setCharaPromptTokenCounterDebounced(tempPrompt);

    let existingCharaNoteIndex;
    let existingCharaNote;

    if (extension_settings.note.chara) {
        // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
        existingCharaNoteIndex = extension_settings.note.chara.findIndex((e) => e.name === avatarName);
        existingCharaNote = extension_settings.note.chara[existingCharaNoteIndex];
    }

    if (tempPrompt.length === 0 &&
        extension_settings.note.chara &&
        existingCharaNote &&
        // @ts-expect-error TS(2339) FIXME: Property 'useChara' does not exist on type 'never'... Remove this comment to see the full error message
        !existingCharaNote.useChara
    ) {
        // @ts-expect-error TS(2769) FIXME: No overload matches this call.
        extension_settings.note.chara.splice(existingCharaNoteIndex, 1);
    } else if (extension_settings.note.chara && existingCharaNote) {
        Object.assign(existingCharaNote, tempCharaNote);
    } else if (avatarName && tempPrompt.length > 0) {
        if (!extension_settings.note.chara) {
            extension_settings.note.chara = [];
        }
        Object.assign(tempCharaNote, { useChara: false, position: chara_note_position.replace });

        // @ts-expect-error TS(2345) FIXME: Argument of type '{ name: any; prompt: any; }' is ... Remove this comment to see the full error message
        extension_settings.note.chara.push(tempCharaNote);
    } else {
        console.log('Character author\'s note error: No avatar name key could be found.');
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`Something went wrong. Could not save character's author's note.`);

        // Don't save settings if something went wrong
        return;
    }

    updateSettings();
}

/**
 *
 */
function onExtensionFloatingCharaCheckboxChanged() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const value = !!$(this).prop('checked');
    // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
    const charaNote = extension_settings.note.chara.find((e) => e.name === getCharaFilename());

    if (charaNote) {
        // @ts-expect-error TS(2339) FIXME: Property 'useChara' does not exist on type 'never'... Remove this comment to see the full error message
        charaNote.useChara = value;

        updateSettings();
    }
}

/**
 *
 */
function onExtensionFloatingDefaultInput() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    extension_settings.note.default = $(this).val();
    setDefaultPromptTokenCounterDebounced(extension_settings.note.default);
    updateSettings();
}

/**
 *
 */
function loadSettings() {
    const DEFAULT_DEPTH = 4;
    const DEFAULT_POSITION = 1;
    const DEFAULT_INTERVAL = 1;
    const DEFAULT_ROLE = extension_prompt_roles.SYSTEM;

    // @ts-expect-error TS(2339) FIXME: Property 'defaultPosition' does not exist on type ... Remove this comment to see the full error message
    if (extension_settings.note.defaultPosition === undefined) {
        // @ts-expect-error TS(2339) FIXME: Property 'defaultPosition' does not exist on type ... Remove this comment to see the full error message
        extension_settings.note.defaultPosition = DEFAULT_POSITION;
    }

    // @ts-expect-error TS(2339) FIXME: Property 'defaultDepth' does not exist on type '{ ... Remove this comment to see the full error message
    if (extension_settings.note.defaultDepth === undefined) {
        // @ts-expect-error TS(2339) FIXME: Property 'defaultDepth' does not exist on type '{ ... Remove this comment to see the full error message
        extension_settings.note.defaultDepth = DEFAULT_DEPTH;
    }

    // @ts-expect-error TS(2339) FIXME: Property 'defaultInterval' does not exist on type ... Remove this comment to see the full error message
    if (extension_settings.note.defaultInterval === undefined) {
        // @ts-expect-error TS(2339) FIXME: Property 'defaultInterval' does not exist on type ... Remove this comment to see the full error message
        extension_settings.note.defaultInterval = DEFAULT_INTERVAL;
    }

    // @ts-expect-error TS(2339) FIXME: Property 'defaultRole' does not exist on type '{ d... Remove this comment to see the full error message
    if (extension_settings.note.defaultRole === undefined) {
        // @ts-expect-error TS(2339) FIXME: Property 'defaultRole' does not exist on type '{ d... Remove this comment to see the full error message
        extension_settings.note.defaultRole = DEFAULT_ROLE;
    }

    chat_metadata[metadata_keys.prompt] = chat_metadata[metadata_keys.prompt] ?? extension_settings.note.default ?? '';
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    chat_metadata[metadata_keys.interval] = chat_metadata[metadata_keys.interval] ?? extension_settings.note.defaultInterval ?? DEFAULT_INTERVAL;
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    chat_metadata[metadata_keys.position] = chat_metadata[metadata_keys.position] ?? extension_settings.note.defaultPosition ?? DEFAULT_POSITION;
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    chat_metadata[metadata_keys.depth] = chat_metadata[metadata_keys.depth] ?? extension_settings.note.defaultDepth ?? DEFAULT_DEPTH;
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    chat_metadata[metadata_keys.role] = chat_metadata[metadata_keys.role] ?? extension_settings.note.defaultRole ?? DEFAULT_ROLE;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_floating_prompt').val(chat_metadata[metadata_keys.prompt]);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_floating_interval').val(chat_metadata[metadata_keys.interval]);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_floating_allow_wi_scan').prop('checked', extension_settings.note.allowWIScan ?? false);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_floating_depth').val(chat_metadata[metadata_keys.depth]);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_floating_role').val(chat_metadata[metadata_keys.role]);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(`input[name="extension_floating_position"][value="${chat_metadata[metadata_keys.position]}"]`).prop('checked', true);

    if (extension_settings.note.chara && getContext().characterId !== undefined) {
        // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
        const charaNote = extension_settings.note.chara.find((e) => e.name === getCharaFilename());

        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#extension_floating_chara').val(charaNote ? charaNote.prompt : '');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#extension_use_floating_chara').prop('checked', charaNote ? charaNote.useChara : false);
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $(`input[name="extension_floating_char_position"][value="${charaNote?.position ?? chara_note_position.replace}"]`).prop('checked', true);
    } else {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#extension_floating_chara').val('');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#extension_use_floating_chara').prop('checked', false);
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $(`input[name="extension_floating_char_position"][value="${chara_note_position.replace}"]`).prop('checked', true);
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_floating_default').val(extension_settings.note.default);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_default_depth').val(extension_settings.note.defaultDepth);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_default_interval').val(extension_settings.note.defaultInterval);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_default_role').val(extension_settings.note.defaultRole);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(`input[name="extension_default_position"][value="${extension_settings.note.defaultPosition}"]`).prop('checked', true);
}

/**
 *
 */
export function setFloatingPrompt() {
    const context = getContext();
    if (!context.groupId && context.characterId === undefined) {
        console.debug('setFloatingPrompt: Not in a chat. Skipping.');
        shouldWIAddPrompt = false;
        return;
    }

    // take the count of messages
    // @ts-expect-error TS(2339) FIXME: Property 'is_user' does not exist on type 'never'.
    let lastMessageNumber = Array.isArray(context.chat) && context.chat.length ? context.chat.filter(m => m.is_user).length : 0;

    console.debug(`
    setFloatingPrompt entered
    ------
    lastMessageNumber = ${lastMessageNumber}
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    metadata_keys.interval = ${chat_metadata[metadata_keys.interval]}
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    metadata_keys.position = ${chat_metadata[metadata_keys.position]}
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    metadata_keys.depth = ${chat_metadata[metadata_keys.depth]}
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    metadata_keys.role = ${chat_metadata[metadata_keys.role]}
    ------
    `);

    // interval 1 should be inserted no matter what
    if (chat_metadata[metadata_keys.interval] === 1) {
        lastMessageNumber = 1;
    }

    if (lastMessageNumber <= 0 || chat_metadata[metadata_keys.interval] <= 0) {
        context.setExtensionPrompt(MODULE_NAME, '', extension_prompt_types.NONE, MAX_INJECTION_DEPTH);
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#extension_floating_counter').text('(disabled)');
        shouldWIAddPrompt = false;
        return;
    }

    const messagesTillInsertion = lastMessageNumber >= chat_metadata[metadata_keys.interval]
        ? (lastMessageNumber % chat_metadata[metadata_keys.interval])
        : (chat_metadata[metadata_keys.interval] - lastMessageNumber);
    const shouldAddPrompt = messagesTillInsertion == 0;
    shouldWIAddPrompt = shouldAddPrompt;

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    let prompt = shouldAddPrompt ? $('#extension_floating_prompt').val() : '';
    if (shouldAddPrompt && extension_settings.note.chara && getContext().characterId !== undefined) {
        // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
        const charaNote = extension_settings.note.chara.find((e) => e.name === getCharaFilename());

        // Only replace with the chara note if the user checked the box
        // @ts-expect-error TS(2339) FIXME: Property 'useChara' does not exist on type 'never'... Remove this comment to see the full error message
        if (charaNote && charaNote.useChara) {
            // @ts-expect-error TS(2339) FIXME: Property 'position' does not exist on type 'never'... Remove this comment to see the full error message
            switch (charaNote.position) {
                case chara_note_position.before:
                    // @ts-expect-error TS(2339) FIXME: Property 'prompt' does not exist on type 'never'.
                    prompt = charaNote.prompt + '\n' + prompt;
                    break;
                case chara_note_position.after:
                    // @ts-expect-error TS(2339) FIXME: Property 'prompt' does not exist on type 'never'.
                    prompt = prompt + '\n' + charaNote.prompt;
                    break;
                default:
                    // @ts-expect-error TS(2339) FIXME: Property 'prompt' does not exist on type 'never'.
                    prompt = charaNote.prompt;
                    break;
            }
        }
    }
    context.setExtensionPrompt(
        MODULE_NAME,
        String(prompt),
        chat_metadata[metadata_keys.position],
        chat_metadata[metadata_keys.depth],
        // @ts-expect-error TS(2339) FIXME: Property 'allowWIScan' does not exist on type '{ d... Remove this comment to see the full error message
        extension_settings.note.allowWIScan,
        chat_metadata[metadata_keys.role],
    );
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_floating_counter').text(shouldAddPrompt ? '0' : messagesTillInsertion);
}

/**
 *
 */
function onANMenuItemClick() {
    if (!selected_group && this_chid === undefined) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning(t`Select a character before trying to use Author's Note`, '', { timeOut: 2000 });
        return;
    }

    //show AN if it's hidden
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const $ANcontainer = $('#floatingPrompt');
    if ($ANcontainer.css('display') !== 'flex') {
        $ANcontainer.addClass('resizing');
        $ANcontainer.css('display', 'flex');
        $ANcontainer.css('opacity', 0.0);
        $ANcontainer.transition({
            opacity: 1.0,
            duration: animation_duration,
        }, async function () {
            await delay(50);
            $ANcontainer.removeClass('resizing');
        });

        //auto-open the main AN inline drawer
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        if ($('#ANBlockToggle')
            .siblings('.inline-drawer-content')
            .css('display') !== 'block') {
            $ANcontainer.addClass('resizing');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#ANBlockToggle').trigger('click');
        }
    } else {
        //hide AN if it's already displayed
        $ANcontainer.addClass('resizing');
        $ANcontainer.transition({
            opacity: 0.0,
            duration: animation_duration,
        }, async function () {
            await delay(50);
            $ANcontainer.removeClass('resizing');
        });
        setTimeout(function () {
            $ANcontainer.hide();
        }, animation_duration);
    }

    //duplicate options menu close handler from script.js
    //because this listener takes priority
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#options').stop().fadeOut(animation_duration);
}

/**
 *
 */
async function onChatChanged() {
    loadSettings();
    setFloatingPrompt();
    const context = getContext();

    // Disable the chara note if in a group
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_floating_chara').prop('disabled', !!context.groupId);

    const tokenCounter1 = chat_metadata[metadata_keys.prompt] ? await getTokenCountAsync(chat_metadata[metadata_keys.prompt]) : 0;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_floating_prompt_token_counter').text(tokenCounter1);

    let tokenCounter2;
    if (extension_settings.note.chara && context.characterId !== undefined) {
        // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
        const charaNote = extension_settings.note.chara.find((e) => e.name === getCharaFilename());

        if (charaNote) {
            // @ts-expect-error TS(2339) FIXME: Property 'prompt' does not exist on type 'never'.
            tokenCounter2 = await getTokenCountAsync(charaNote.prompt);
        }
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_floating_chara_token_counter').text(tokenCounter2 || 0);

    const tokenCounter3 = extension_settings.note.default ? await getTokenCountAsync(extension_settings.note.default) : 0;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_floating_default_token_counter').text(tokenCounter3);
}

/**
 *
 */
function onAllowWIScanCheckboxChanged() {
    // @ts-expect-error TS(2339) FIXME: Property 'allowWIScan' does not exist on type '{ d... Remove this comment to see the full error message
    extension_settings.note.allowWIScan = !!$(this).prop('checked');
    updateSettings();
}

/**
 * Inject author's note options and setup event listeners.
 */
// Inserts the extension first since it's statically imported
export function initAuthorsNote() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_floating_prompt').on('input', onExtensionFloatingPromptInput);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_floating_interval').on('input', onExtensionFloatingIntervalInput);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_floating_depth').on('input', onExtensionFloatingDepthInput);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_floating_chara').on('input', onExtensionFloatingCharaPromptInput);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_use_floating_chara').on('input', onExtensionFloatingCharaCheckboxChanged);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_floating_default').on('input', onExtensionFloatingDefaultInput);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_default_depth').on('input', onDefaultDepthInput);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_default_interval').on('input', onDefaultIntervalInput);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_floating_allow_wi_scan').on('input', onAllowWIScanCheckboxChanged);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_floating_role').on('input', onExtensionFloatingRoleInput);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extension_default_role').on('input', onExtensionDefaultRoleInput);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('input[name="extension_floating_position"]').on('change', onExtensionFloatingPositionInput);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('input[name="extension_default_position"]').on('change', onDefaultPositionInput);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('input[name="extension_floating_char_position"]').on('change', onExtensionFloatingCharPositionInput);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#ANClose').on('click', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#floatingPrompt').transition({
            opacity: 0,
            duration: animation_duration,
            easing: 'ease-in-out',
        });
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        setTimeout(function () { $('#floatingPrompt').hide(); }, animation_duration);
    });
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#option_toggle_AN').on('click', onANMenuItemClick);

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'note',
        callback: setNoteTextCommand,
        returns: 'current author\'s note',
        unnamedArgumentList: [
            new SlashCommandArgument(
                'text', [ARGUMENT_TYPE.STRING], false,
            ),
        ],
        helpString: `
            <div>
                Sets an author's note for the currently selected chat if specified and returns the current note.
            </div>
        `,
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'note-depth',
        aliases: ['depth'],
        callback: setNoteDepthCommand,
        returns: 'current author\'s note depth',
        unnamedArgumentList: [
            new SlashCommandArgument(
                'number', [ARGUMENT_TYPE.NUMBER], false,
            ),
        ],
        helpString: `
            <div>
                Sets an author's note depth for in-chat positioning if specified and returns the current depth.
            </div>
        `,
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'note-frequency',
        aliases: ['freq', 'note-freq'],
        callback: setNoteIntervalCommand,
        returns: 'current author\'s note insertion frequency',
        namedArgumentList: [],
        unnamedArgumentList: [
            new SlashCommandArgument(
                'number', [ARGUMENT_TYPE.NUMBER], false,
            ),
        ],
        helpString: `
            <div>
                Sets an author's note insertion frequency if specified and returns the current frequency.
            </div>
        `,
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'note-position',
        callback: setNotePositionCommand,
        aliases: ['pos', 'note-pos'],
        returns: 'current author\'s note insertion position',
        namedArgumentList: [],
        unnamedArgumentList: [
            new SlashCommandArgument(
                // @ts-expect-error TS(2322) FIXME: Type 'string' is not assignable to type 'never'.
                'position', [ARGUMENT_TYPE.STRING], false, false, null, ['before', 'after', 'chat'],
            ),
        ],
        helpString: `
            <div>
                Sets an author's note position if specified and returns the current position.
            </div>
        `,
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'note-role',
        callback: setNoteRoleCommand,
        returns: 'current author\'s note chat insertion role',
        namedArgumentList: [],
        unnamedArgumentList: [
            new SlashCommandArgument(
                // @ts-expect-error TS(2322) FIXME: Type 'string' is not assignable to type 'never'.
                'role', [ARGUMENT_TYPE.STRING], false, false, null, ['system', 'user', 'assistant'],
            ),
        ],
        helpString: `
            <div>
                Sets an author's note chat insertion role if specified and returns the current role.
            </div>
        `,
    }));
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);

    registerAuthorsNoteMacros();
}

/**
 *
 */
function registerAuthorsNoteMacros() {
    if (power_user.experimental_macro_engine) {
        macros.register('authorsNote', {
            category: MacroCategory.PROMPTS,
            description: t`The contents of the Author's Note`,
            handler: () => chat_metadata[metadata_keys.prompt] ?? '',
        });
        macros.register('charAuthorsNote', {
            category: MacroCategory.PROMPTS,
            description: t`The contents of the Character Author's Note`,
            // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
            handler: () => this_chid !== undefined ? (extension_settings.note.chara.find((e) => e.name === getCharaFilename())?.prompt ?? '') : '',
        });
        macros.register('defaultAuthorsNote', {
            category: MacroCategory.PROMPTS,
            description: t`The contents of the Default Author's Note`,
            handler: () => extension_settings.note.default ?? '',
        });
    } else {
        // TODO: Remove this when the experimental macro engine is replacing the old macro engine
        MacrosParser.registerMacro('authorsNote',
            () => chat_metadata[metadata_keys.prompt] ?? '',
            t`The contents of the Author's Note`,
        );
        MacrosParser.registerMacro('charAuthorsNote',
            // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
            () => this_chid !== undefined ? (extension_settings.note.chara.find((e) => e.name === getCharaFilename())?.prompt ?? '') : '',
            t`The contents of the Character Author's Note`,
        );
        MacrosParser.registerMacro('defaultAuthorsNote',
            () => extension_settings.note.default ?? '',
            t`The contents of the Default Author's Note`,
        );
    }
}
