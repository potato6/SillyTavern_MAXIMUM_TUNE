'use strict';

import {
    extension_prompt_types,
    name1,
    name2,
    online_status,
    saveSettingsDebounced,
    substituteParams,
} from '../script.js';
import { selected_group } from './group-chats.js';
import { parseExampleIntoIndividual } from './openai.js';
import { power_user, context_presets } from './power-user.js';
import { regexFromString, resetScrollHeight } from './utils.js';

/**
 * @type {InstructSettings[]} Instruct mode presets.
 */
export let instruct_presets = [];

export const names_behavior_types = {
    NONE: 'none',
    FORCE: 'force',
    ALWAYS: 'always',
};

const bindings = {
    instruct_enabled: 'enabled',
    instruct_wrap: 'wrap',
    instruct_macro: 'macro',
    instruct_story_string_prefix: 'story_string_prefix',
    instruct_story_string_suffix: 'story_string_suffix',
    instruct_input_sequence: 'input_sequence',
    instruct_input_suffix: 'input_suffix',
    instruct_output_sequence: 'output_sequence',
    instruct_output_suffix: 'output_suffix',
    instruct_system_sequence: 'system_sequence',
    instruct_system_suffix: 'system_suffix',
    instruct_last_system_sequence: 'last_system_sequence',
    instruct_user_alignment_message: 'user_alignment_message',
    instruct_stop_sequence: 'stop_sequence',
    instruct_first_output_sequence: 'first_output_sequence',
    instruct_last_output_sequence: 'last_output_sequence',
    instruct_first_input_sequence: 'first_input_sequence',
    instruct_last_input_sequence: 'last_input_sequence',
    instruct_activation_regex: 'activation_regex',
    instruct_bind_to_context: 'bind_to_context',
    instruct_skip_examples: 'skip_examples',
    instruct_names_behavior: 'names_behavior',
    instruct_system_same_as_user: 'system_same_as_user',
    instruct_sequences_as_stop_strings: 'sequences_as_stop_strings',
} as const;

// Hoist Regexes so they aren't compiled repeatedly inside hot paths
const NAME_REGEX = /{{name}}/gi;
const START_NEWLINE_REGEX = /<START>\n/i;
const START_REGEX = /<START>/i;
const CARRIAGE_RETURN_REGEX = /\r/gm;
const TRAILING_SPACE_REGEX = /\s$/;

/**
 * Migrates instruct mode settings into the evergreen format.
 * @param {object} settings Instruct mode settings.
 * @returns {void}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'settings' implicitly has an 'any' type.
function migrateInstructModeSettings(settings) {
    // Separator sequence => Output suffix
    if (settings.separator_sequence !== undefined) {
        settings.output_suffix = settings.separator_sequence || '';
        delete settings.separator_sequence;
    }

    // names, names_force_groups => names_behavior
    if (settings.names !== undefined) {
        settings.names_behavior = settings.names
            ? names_behavior_types.ALWAYS
            : settings.names_force_groups
              ? names_behavior_types.FORCE
              : names_behavior_types.NONE;
    }

    // Direct property assignment is much faster than iterating an object via for...in
    settings.input_suffix ??= '';
    settings.system_sequence ??= '';
    settings.system_suffix ??= '';
    settings.user_alignment_message ??= '';
    settings.last_system_sequence ??= '';
    settings.first_input_sequence ??= '';
    settings.last_input_sequence ??= '';
    settings.skip_examples ??= false;
    settings.system_same_as_user ??= false;
    settings.names_behavior ??= names_behavior_types.FORCE;
    settings.sequences_as_stop_strings ??= true;
    settings.story_string_prefix ??= '';
    settings.story_string_suffix ??= '';

    // Remove obsolete fields directly
    delete settings.names;
    delete settings.names_force_groups;
    delete settings.system_sequence_prefix;
    delete settings.system_sequence_suffix;
}

/**
 * Loads instruct mode settings from the given data object.
 * @param {object} data Settings data object.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export async function loadInstructMode(data) {
    if (data.instruct !== undefined) {
        instruct_presets = data.instruct;
    }

    migrateInstructModeSettings(power_user.instruct);

    const instructEnabled = !!power_user.instruct.enabled;

    document
        .getElementById('instruct_enabled')
        ?.parentElement?.querySelector('i')
        ?.classList.toggle('toggleEnabled', instructEnabled);

    document
        .querySelectorAll('#instructSettingsBlock, #InstructSequencesColumn')
        .forEach((el) => el.classList.toggle('disabled', !instructEnabled));

    document
        .getElementById('instruct_derived')
        ?.parentElement?.querySelector('i')
        ?.classList.toggle('toggleEnabled', !!power_user.instruct_derived);

    document
        .getElementById('instruct_bind_to_context')
        ?.parentElement?.querySelector('i')
        ?.classList.toggle('toggleEnabled', !!power_user.instruct.bind_to_context);

    // Use Object.values directly if keys aren't strictly needed for the inner map,
    // but here we need both.
    const bindingsEntries = Object.entries(bindings);

    for (let i = 0; i < bindingsEntries.length; i++) {
        const [id, property] = bindingsEntries[i]!;
        const element = document.getElementById(id);
        if (!element) continue;

        if (element instanceof HTMLInputElement && element.type === 'checkbox') {
            element.checked = Boolean((power_user.instruct as Record<string, unknown>)[property]);
        } else if (
            element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLSelectElement
        ) {
            element.value = String(
                (power_user.instruct as Record<string, unknown>)[property] ?? '',
            );
        }

        element.addEventListener('input', async () => {
            if (element instanceof HTMLInputElement && element.type === 'checkbox') {
                (power_user.instruct as Record<string, unknown>)[property] = element.checked;
            } else if (
                element instanceof HTMLInputElement ||
                element instanceof HTMLTextAreaElement ||
                element instanceof HTMLSelectElement
            ) {
                (power_user.instruct as Record<string, unknown>)[property] = element.value;
            }
            if (
                !CSS.supports('field-sizing', 'content') &&
                element instanceof HTMLTextAreaElement
            ) {
                await resetScrollHeight(element);
            }
            saveSettingsDebounced();
        });
    }

    document.getElementById('instruct_system_same_as_user')?.dispatchEvent(new Event('input'));

    const instructPresetsEl = document.getElementById('instruct_presets');
    if (instructPresetsEl) {
        instruct_presets.forEach((preset) => {
            // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
            const name = preset.name;
            const option = document.createElement('option');
            option.value = name;
            option.innerText = name;
            option.selected = name === power_user.instruct.preset;
            instructPresetsEl.appendChild(option);
        });
    }
}

/**
 * Updates the bind model template state based on the current model, instruct and context preset.
 */
export function updateBindModelTemplatesState() {
    const bindModelTemplates =
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type.
        power_user.model_templates_mappings[online_status] ??
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type.
        power_user.model_templates_mappings[power_user.chat_template_hash];

    const bindingsMatch =
        (bindModelTemplates &&
            power_user.context.preset === bindModelTemplates.context &&
            (!power_user.instruct.enabled ||
                power_user.instruct.preset === bindModelTemplates.instruct)) ??
        false;

    const bmt = document.getElementById('bind_model_templates');
    if (bmt instanceof HTMLInputElement && bmt.checked !== bindingsMatch) {
        bmt.checked = bindingsMatch;
    }
}

/**
 * Select context template if not already selected.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'preset' implicitly has an 'any' type.
export function selectContextPreset(preset, { quiet = false, isAuto = false } = {}) {
    if (!context_presets.some((x) => x.name === preset)) {
        console.warn(`Context template "${preset}" not found`);
        return;
    }

    if (preset !== power_user.context.preset) {
        const cp = document.getElementById('context_presets');
        if (cp instanceof HTMLSelectElement) {
            cp.value = preset;
            cp.dispatchEvent(new Event('change'));
        }
        if (!quiet) notyf.info(`Context Template: "${preset}" ${isAuto ? 'auto-' : ''}selected`);
    }

    updateBindModelTemplatesState();
    saveSettingsDebounced();
}

/**
 * Select instruct preset if not already selected.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'preset' implicitly has an 'any' type.
export function selectInstructPreset(preset, { quiet = false, isAuto = false } = {}) {
    // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
    if (!instruct_presets.some((x) => x.name === preset)) {
        console.warn(`Instruct template "${preset}" not found`);
        return;
    }

    if (preset !== power_user.instruct.preset) {
        const ip = document.getElementById('instruct_presets');
        if (ip instanceof HTMLSelectElement) {
            ip.value = preset;
            ip.dispatchEvent(new Event('change'));
        }
        if (!quiet) notyf.info(`Instruct Template: "${preset}" ${isAuto ? 'auto-' : ''}selected`);
    }

    if (!power_user.instruct.enabled) {
        power_user.instruct.enabled = true;
        const ie = document.getElementById('instruct_enabled');
        if (ie instanceof HTMLInputElement) {
            ie.checked = true;
            ie.dispatchEvent(new Event('change'));
        }
        if (!quiet) notyf.info('Instruct Mode enabled');
    }

    updateBindModelTemplatesState();
    saveSettingsDebounced();
}

/**
 * Automatically select instruct preset based on model id.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'modelId' implicitly has an 'any' type.
export function autoSelectInstructPreset(modelId) {
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type
    const modelTemplatesMap = power_user.model_templates_mappings[modelId];

    if (modelTemplatesMap) {
        const { instruct, context } = modelTemplatesMap;
        if (instruct) selectInstructPreset(instruct, { isAuto: true });
        if (context) selectContextPreset(context, { isAuto: true });
        return true;
    }

    updateBindModelTemplatesState();

    if (!power_user.instruct.enabled) return false;

    let foundMatch = false;

    for (let i = 0; i < instruct_presets.length; i++) {
        const preset = instruct_presets[i];
        // @ts-expect-error TS(2339)
        if (preset.activation_regex) {
            try {
                // @ts-expect-error TS(2339)
                const regex = regexFromString(preset.activation_regex);
                if (regex instanceof RegExp && regex.test(modelId)) {
                    // @ts-expect-error TS(2339)
                    selectInstructPreset(preset.name, { isAuto: true });
                    foundMatch = true;
                    break;
                }
            } catch {
                // @ts-expect-error TS(2339)
                console.warn(`Invalid instruct activation regex in preset "${preset.name}"`);
            }
        }
    }

    if (!foundMatch && power_user.instruct.bind_to_context) {
        for (let i = 0; i < instruct_presets.length; i++) {
            // @ts-expect-error TS(2339)
            if (instruct_presets[i].name === power_user.context.preset) {
                // @ts-expect-error TS(2339)
                selectInstructPreset(instruct_presets[i].name, { isAuto: true });
                foundMatch = true;
                break;
            }
        }
    }

    return foundMatch;
}

/**
 * Converts instruct mode sequences to an array of stopping strings.
 */
export function getInstructStoppingSequences({
    customInstruct = null,
    useStopStrings = null,
} = {}) {
    // V8 Performance: structuredClone is wildly slow on hot paths.
    // Read directly from the fallback since we don't mutate this object inside the function.
    const instruct = customInstruct || power_user.instruct;
    const result = [];
    const macroEnabled = instruct.macro;
    const wrapEnabled = instruct.wrap;

    /** @param {string} sequence */
    // @ts-expect-error TS(7006)
    function addInstructSequence(sequence) {
        const trimmed = sequence.trim();
        if (trimmed.length > 0) {
            const wrappedSequence = wrapEnabled ? '\n' + sequence : sequence;
            result.push(macroEnabled ? substituteParams(wrappedSequence) : wrappedSequence);
        }
    }

    if (customInstruct || instruct.enabled) {
        const stop_sequence = instruct.stop_sequence || '';
        const input_sequence = instruct.input_sequence?.replace(NAME_REGEX, name1) || '';
        const output_sequence = instruct.output_sequence?.replace(NAME_REGEX, name2) || '';
        const first_output_sequence =
            instruct.first_output_sequence?.replace(NAME_REGEX, name2) || '';
        const last_output_sequence =
            instruct.last_output_sequence?.replace(NAME_REGEX, name2) || '';
        const system_sequence = instruct.system_sequence?.replace(NAME_REGEX, 'System') || '';
        const last_system_sequence =
            instruct.last_system_sequence?.replace(NAME_REGEX, 'System') || '';

        const rawSequences = [stop_sequence];
        if (instruct.sequences_as_stop_strings) {
            rawSequences.push(
                input_sequence,
                output_sequence,
                first_output_sequence,
                last_output_sequence,
                system_sequence,
                last_system_sequence,
            );
        }

        // allocations with a direct $O(N)$ Set and split logic overhead block
        const seen = new Set();
        for (let i = 0; i < rawSequences.length; i++) {
            const seq = rawSequences[i];
            if (!seq) continue;

            const lines = seq.split('\n');
            for (let j = 0; j < lines.length; j++) {
                const line = lines[j];
                if (!seen.has(line)) {
                    seen.add(line);
                    addInstructSequence(line);
                }
            }
        }
    }

    if (useStopStrings ?? power_user.context.use_stop_strings) {
        if (power_user.context.chat_start) {
            result.push(`\n${substituteParams(power_user.context.chat_start)}`);
        }
        if (power_user.context.example_separator) {
            result.push(`\n${substituteParams(power_user.context.example_separator)}`);
        }
    }

    return result;
}

export const force_output_sequence = {
    FIRST: 1,
    LAST: 2,
};

/**
 * Formats instruct mode chat message.
 */
export function formatInstructModeChat(
    // @ts-expect-error TS(7006)
    name,
    // @ts-expect-error TS(7006)
    mes,
    // @ts-expect-error TS(7006)
    isUser,
    // @ts-expect-error TS(7006)
    isNarrator,
    // @ts-expect-error TS(7006)
    forceAvatar,
    // @ts-expect-error TS(7006)
    name1,
    // @ts-expect-error TS(7006)
    name2,
    // @ts-expect-error TS(7006)
    forceOutputSequence,
    customInstruct = null,
) {
    // No structuredClone! (Saving ~100x operation cost over frequent calls)
    const instruct = customInstruct || power_user.instruct;
    let includeNames = isNarrator ? false : instruct.names_behavior === names_behavior_types.ALWAYS;

    if (
        !isNarrator &&
        instruct.names_behavior === names_behavior_types.FORCE &&
        ((selected_group && name !== name1) || (forceAvatar && name !== name1))
    ) {
        includeNames = true;
    }

    function getPrefix() {
        if (isNarrator) {
            return instruct.system_same_as_user
                ? instruct.input_sequence
                : instruct.system_sequence;
        }
        if (isUser) {
            if (forceOutputSequence === force_output_sequence.FIRST)
                return instruct.first_input_sequence || instruct.input_sequence;
            if (forceOutputSequence === force_output_sequence.LAST)
                return instruct.last_input_sequence || instruct.input_sequence;
            return instruct.input_sequence;
        }
        if (forceOutputSequence === force_output_sequence.FIRST)
            return instruct.first_output_sequence || instruct.output_sequence;
        if (forceOutputSequence === force_output_sequence.LAST)
            return instruct.last_output_sequence || instruct.output_sequence;
        return instruct.output_sequence;
    }

    function getSuffix() {
        if (isNarrator) {
            return instruct.system_same_as_user ? instruct.input_suffix : instruct.system_suffix;
        }
        if (isUser) return instruct.input_suffix;
        return instruct.output_suffix;
    }

    let prefix = getPrefix() || '';
    let suffix = getSuffix() || '';

    if (instruct.macro) {
        prefix = substituteParams(prefix, { name1Override: name1, name2Override: name2 });
        prefix = prefix.replace(NAME_REGEX, name || 'System');

        suffix = substituteParams(suffix, { name1Override: name1, name2Override: name2 });
        suffix = suffix.replace(NAME_REGEX, name || 'System');
    }

    if (!suffix && instruct.wrap) {
        suffix = '\n';
    }

    const separator = instruct.wrap ? '\n' : '';

    // String logic bypasses allocating and filtering arrays in heap
    const messageContent = includeNames && name ? `${name}: ${mes}${suffix}` : `${mes}${suffix}`;
    return prefix ? prefix + separator + messageContent : messageContent;
}

/**
 * Formats instruct mode story string.
 */
export function formatInstructModeStoryString(
    // @ts-expect-error TS(7006)
    storyString,
    { customContext = null, customInstruct = null } = {},
) {
    if (!storyString) return '';

    // Avoided structuredClone
    const instructSettings = customInstruct || power_user.instruct;
    const contextSettings = customContext || power_user.context;

    const storyStringPosition =
        contextSettings.story_string_position ?? extension_prompt_types.IN_PROMPT;
    const applySequences = storyStringPosition !== extension_prompt_types.IN_CHAT;

    if (applySequences) {
        if (instructSettings.story_string_prefix) {
            const prefix = substituteParams(instructSettings.story_string_prefix).replace(
                NAME_REGEX,
                'System',
            );
            const separator = instructSettings.wrap ? '\n' : '';
            storyString = prefix + separator + storyString;
        }
        if (instructSettings.story_string_suffix) {
            storyString += substituteParams(instructSettings.story_string_suffix);
        }
    }

    return storyString;
}

/**
 * Formats example messages according to instruct mode settings.
 */
// @ts-expect-error TS(7006)
export function formatInstructModeExamples(mesExamplesArray, name1, name2) {
    const blockHeading = power_user.context.example_separator
        ? `${substituteParams(power_user.context.example_separator)}\n`
        : '';

    if (power_user.instruct.skip_examples) {
        // @ts-expect-error TS(7006)
        return mesExamplesArray.map((x) => x.replace(START_NEWLINE_REGEX, blockHeading));
    }

    const includeNames = power_user.instruct.names_behavior === names_behavior_types.ALWAYS;
    const includeGroupNames =
        selected_group &&
        [names_behavior_types.ALWAYS, names_behavior_types.FORCE].includes(
            power_user.instruct.names_behavior,
        );

    let inputPrefix = power_user.instruct.input_sequence || '';
    let outputPrefix = power_user.instruct.output_sequence || '';
    let inputSuffix = power_user.instruct.input_suffix || '';
    let outputSuffix = power_user.instruct.output_suffix || '';

    if (power_user.instruct.macro) {
        inputPrefix = substituteParams(inputPrefix, {
            name1Override: name1,
            name2Override: name2,
        }).replace(NAME_REGEX, name1);
        outputPrefix = substituteParams(outputPrefix, {
            name1Override: name1,
            name2Override: name2,
        }).replace(NAME_REGEX, name2);
        inputSuffix = substituteParams(inputSuffix, {
            name1Override: name1,
            name2Override: name2,
        }).replace(NAME_REGEX, name1);
        outputSuffix = substituteParams(outputSuffix, {
            name1Override: name1,
            name2Override: name2,
        }).replace(NAME_REGEX, name2);

        if (!inputSuffix && power_user.instruct.wrap) inputSuffix = '\n';
        if (!outputSuffix && power_user.instruct.wrap) outputSuffix = '\n';
    }

    const separator = power_user.instruct.wrap ? '\n' : '';
    const formattedExamples = [];

    for (let i = 0; i < mesExamplesArray.length; i++) {
        const item = mesExamplesArray[i];
        const cleanedItem = item
            .replace(START_REGEX, '{Example Dialogue:}')
            .replace(CARRIAGE_RETURN_REGEX, '');
        const blockExamples = parseExampleIntoIndividual(
            cleanedItem,
            includeGroupNames as boolean | undefined,
        );

        if (blockExamples.length === 0) continue;
        if (blockHeading) formattedExamples.push(blockHeading);

        for (let j = 0; j < blockExamples.length; j++) {
            const example = blockExamples[j]!;
            const isUser = example.name === 'example_user';

            const includeThisName =
                !includeGroupNames &&
                (includeNames ||
                    (power_user.instruct.names_behavior === names_behavior_types.FORCE && isUser));

            const prefix = isUser ? inputPrefix : outputPrefix;
            const suffix = isUser ? inputSuffix : outputSuffix;
            const name = isUser ? name1 : name2;

            const messageContent = includeThisName
                ? `${name}: ${example.content}${suffix}`
                : `${example.content}${suffix}`;

            // V8 Performance: No `.filter().join()` array allocations
            if (prefix && messageContent) {
                formattedExamples.push(prefix + separator + messageContent);
            } else if (prefix || messageContent) {
                formattedExamples.push(prefix || messageContent);
            }
        }
    }

    if (formattedExamples.length === 0) {
        // @ts-expect-error TS(7006)
        return mesExamplesArray.map((x) => x.replace(START_NEWLINE_REGEX, blockHeading));
    }
    return formattedExamples;
}

/**
 * Formats instruct mode last prompt line.
 */
export function formatInstructModePrompt(
    // @ts-expect-error TS(7006)
    name,
    // @ts-expect-error TS(7006)
    isImpersonate,
    // @ts-expect-error TS(7006)
    promptBias,
    // @ts-expect-error TS(7006)
    name1,
    // @ts-expect-error TS(7006)
    name2,
    // @ts-expect-error TS(7006)
    isQuiet,
    // @ts-expect-error TS(7006)
    isQuietToLoud,
    customInstruct = null,
) {
    // V8 Performance: Removing structuredClone
    const instruct = customInstruct || power_user.instruct;
    const includeNames =
        name &&
        (instruct.names_behavior === names_behavior_types.ALWAYS ||
            (!!selected_group && instruct.names_behavior === names_behavior_types.FORCE)) &&
        !(isQuiet && !isQuietToLoud);

    function getSequence() {
        if (isImpersonate) return instruct.last_input_sequence || instruct.input_sequence;
        if (isQuiet && !isQuietToLoud)
            return instruct.last_system_sequence || instruct.output_sequence;
        if (isQuiet && isQuietToLoud)
            return instruct.last_output_sequence || instruct.output_sequence;
        return instruct.last_output_sequence || instruct.output_sequence;
    }

    let sequence = getSequence() || '';
    let nameFiller = '';

    if (
        includeNames &&
        instruct.last_output_sequence &&
        instruct.output_sequence &&
        sequence === instruct.last_output_sequence &&
        TRAILING_SPACE_REGEX.test(instruct.output_sequence) &&
        !TRAILING_SPACE_REGEX.test(instruct.last_output_sequence)
    ) {
        nameFiller = instruct.output_sequence.slice(-1);
    }

    if (instruct.macro) {
        sequence = substituteParams(sequence, {
            name1Override: name1,
            name2Override: name2,
        }).replace(NAME_REGEX, name || 'System');
    }

    const separator = instruct.wrap ? '\n' : '';
    let text = includeNames
        ? separator + sequence + separator + nameFiller + `${name}:`
        : separator + sequence;

    if (isQuiet && separator) {
        text = text.slice(separator.length);
    }

    if (!isImpersonate && promptBias) {
        text += includeNames ? promptBias : separator + promptBias.trimStart();
    }

    return (instruct.wrap ? text.trimEnd() : text) + (includeNames ? '' : separator);
}

/**
 * Select context template matching instruct preset.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
function selectMatchingContextTemplate(name) {
    for (let i = 0; i < context_presets.length; i++) {
        if (context_presets[i]!.name === name) {
            selectContextPreset(context_presets[i]!.name, { isAuto: true });
            break;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // V8 DOM Cached Elements
    const seq = document.getElementById('instruct_system_sequence');
    const suf = document.getElementById('instruct_system_suffix');
    const seqBlock = document.getElementById('instruct_system_sequence_block');
    const sufBlock = document.getElementById('instruct_system_suffix_block');

    document.getElementById('instruct_system_same_as_user')?.addEventListener('input', function () {
        // @ts-expect-error TS(2339)
        const state = !!this.checked;
        seqBlock?.classList.toggle('disabled', state);
        sufBlock?.classList.toggle('disabled', state);

        if (seq instanceof HTMLInputElement || seq instanceof HTMLTextAreaElement)
            seq.readOnly = state;
        if (suf instanceof HTMLInputElement || suf instanceof HTMLTextAreaElement)
            suf.readOnly = state;
    });

    document.getElementById('instruct_enabled')?.addEventListener('change', function () {
        const instructEnabled = !!power_user.instruct.enabled;

        document
            .getElementById('instruct_enabled')
            ?.parentElement?.querySelector('i')
            ?.classList.toggle('toggleEnabled', instructEnabled);

        document
            .querySelectorAll('#instructSettingsBlock, #InstructSequencesColumn')
            .forEach((el) => el.classList.toggle('disabled', !instructEnabled));

        if (power_user.instruct.bind_to_context && instructEnabled) {
            selectMatchingContextTemplate(power_user.instruct.preset);
        }
    });

    document.getElementById('instruct_derived')?.addEventListener('change', function () {
        document
            .getElementById('instruct_derived')
            ?.parentElement?.querySelector('i')
            ?.classList.toggle('toggleEnabled', !!power_user.instruct_derived);
    });

    document.getElementById('instruct_bind_to_context')?.addEventListener('change', function () {
        document
            .getElementById('instruct_bind_to_context')
            ?.parentElement?.querySelector('i')
            ?.classList.toggle('toggleEnabled', !!power_user.instruct.bind_to_context);
    });

    document.getElementById('instruct_presets')?.addEventListener('change', function () {
        // @ts-expect-error TS(2339)
        const name = String(this.value);
        // @ts-expect-error TS(2339)
        const preset = instruct_presets.find((x) => x.name === name);

        if (!preset) return;

        migrateInstructModeSettings(preset);
        power_user.instruct.preset = String(name);

        const bindingsEntries = Object.entries(bindings);
        for (let i = 0; i < bindingsEntries.length; i++) {
            const [id, property] = bindingsEntries[i]!;
            const presetValue = (preset as Record<string, unknown>)[property];
            if (presetValue === undefined) continue;

            (power_user.instruct as Record<string, unknown>)[property] = presetValue;
            const element = document.getElementById(id);
            if (!element) continue;

            if (element instanceof HTMLInputElement && element.type === 'checkbox') {
                element.checked = Boolean(presetValue);
            } else if (
                element instanceof HTMLInputElement ||
                element instanceof HTMLTextAreaElement ||
                element instanceof HTMLSelectElement
            ) {
                element.value = String(presetValue ?? '');
            }
            element.dispatchEvent(new Event('input'));
        }

        if (power_user.instruct.bind_to_context) {
            selectMatchingContextTemplate(name);
        }

        updateBindModelTemplatesState();
    });

    if (!CSS.supports('field-sizing', 'content')) {
        const detailsElems = document.querySelectorAll('#InstructSequencesColumn details');
        for (let i = 0; i < detailsElems.length; i++) {
            detailsElems[i]!.addEventListener('toggle', function () {
                // @ts-expect-error TS(2683)
                if (this.open) {
                    // @ts-expect-error TS(2683)
                    resetScrollHeight(this.querySelector('textarea'));
                }
            });
        }
    }
});
