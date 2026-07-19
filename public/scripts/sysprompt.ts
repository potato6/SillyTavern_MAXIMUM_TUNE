import { Fuse } from '../lib.js';

import { saveSettingsDebounced } from '../script.js';
import { callGenericPopup, POPUP_TYPE } from './popup.js';
import { power_user } from './power-user.js';
import { getPresetManager } from './preset-manager.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from './slash-commands/SlashCommandArgument.js';
import { commonEnumProviders, enumIcons } from './slash-commands/SlashCommandCommonEnumsProvider.js';
import { enumTypes, SlashCommandEnumValue } from './slash-commands/SlashCommandEnumValue.js';
import { SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import { renderTemplateAsync } from './templates.js';
import { isTrueBoolean, resetScrollHeight } from './utils.js';

export let system_prompts = [];

const $enabled = document.getElementById('sysprompt_enabled') as HTMLInputElement;
const $select = document.getElementById('sysprompt_select') as HTMLSelectElement;
const $content = document.getElementById('sysprompt_content') as HTMLTextAreaElement;
const $postHistory = document.getElementById('sysprompt_post_history') as HTMLTextAreaElement;
const $contentBlock = document.getElementById('SystemPromptBlock') as HTMLElement;

/**
 *
 */
async function migrateSystemPromptFromInstructMode() {
    if ('system_prompt' in power_user.instruct) {
        const prompt = String(power_user.instruct.system_prompt);
        delete power_user.instruct.system_prompt;
        power_user.sysprompt.enabled = power_user.instruct.enabled;
        power_user.sysprompt.content = prompt;
        power_user.sysprompt.post_history = '';

        // @ts-expect-error TS(2339) FIXME: Property 'content' does not exist on type 'never'.
        const existingPromptName = system_prompts.find(x => x.content === prompt)?.name;

        if (existingPromptName) {
            power_user.sysprompt.name = existingPromptName;
        } else {
            const data = { name: `[Migrated] ${power_user.instruct.preset}`, content: prompt };
            await getPresetManager('sysprompt')?.savePreset(data.name, data);
            power_user.sysprompt.name = data.name;
        }

        saveSettingsDebounced();
        notyf.info('System prompt settings have been moved from the Instruct Mode.', 'Migration notice', { timeOut: 5000 });
    }
}

/**
 * Loads sysprompt settings from the given data object.
 * @param {object} data Settings data object.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
export async function loadSystemPrompts(data) {
    if (data.sysprompt !== undefined) {
        system_prompts = data.sysprompt;
    }

    await migrateSystemPromptFromInstructMode();
    toggleSystemPromptDisabledControls();

    for (const prompt of system_prompts) {
        const option = document.createElement('option');
        // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
        option.value = prompt.name;
        // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
        option.textContent = prompt.name;
        $select.appendChild(option);
    }

    $enabled.checked = power_user.sysprompt.enabled;
    $select.value = power_user.sysprompt.name;
    $content.value = power_user.sysprompt.content || '';
    $postHistory.value = power_user.sysprompt.post_history || '';
    if (!CSS.supports('field-sizing', 'content')) {
        await resetScrollHeight($content);
    }
}

/**
 * Checks if the instruct template has a system prompt and prompts the user to save it as a system prompt.
 * @param {string} name Name of the instruct template
 * @param {object} template Instruct template object
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export async function checkForSystemPromptInInstructTemplate(name, template) {
    if (!template || !name || typeof name !== 'string' || typeof template !== 'object') {
        return;
    }
    if ('system_prompt' in template && template.system_prompt) {
        // @ts-expect-error TS(2339) FIXME: Property 'content' does not exist on type 'never'.
        const existingName = system_prompts.find(x => x.content === template.system_prompt)?.name;
        const html = await renderTemplateAsync('migrateInstructPrompt', { prompt: template.system_prompt, existing: existingName });
        const confirm = await callGenericPopup(html, POPUP_TYPE.CONFIRM);
        if (confirm) {
            const migratedName = `[Migrated] ${name}`;
            const prompt = { name: migratedName, content: template.system_prompt };
            const presetManager = getPresetManager('sysprompt')!;
            await presetManager.savePreset(migratedName, prompt);
            notyf.success(`System prompt "${migratedName}" has been saved.`);
        } else {
            notyf.info('System prompt has been discarded.');
        }

        delete template.system_prompt;
    }
}

/**
 *
 */
function toggleSystemPromptDisabledControls() {
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    document.getElementById('sysprompt_enabled').parentElement.querySelector('i').classList.toggle('toggleEnabled', !!power_user.sysprompt.enabled);
    $contentBlock.classList.toggle('disabled', !power_user.sysprompt.enabled);
}

/**
 * Sets the system prompt state.
 * @param {boolean} state System prompt state
 * @returns {string} Empty string
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'state' implicitly has an 'any' type.
function setSystemPromptStateCallback(state) {
    power_user.sysprompt.enabled = state;
    $enabled.checked = state;
    toggleSystemPromptDisabledControls();
    saveSettingsDebounced();
    return '';
}

/**
 *
 * @param _args
 * @param state
 */
// @ts-expect-error TS(7006) FIXME: Parameter '_args' implicitly has an 'any' type.
function toggleSystemPromptCallback(_args, state) {
    if (!state || typeof state !== 'string') {
        return String(power_user.sysprompt.enabled);
    }

    const newState = isTrueBoolean(state);
    setSystemPromptStateCallback(newState);
    return String(power_user.sysprompt.enabled);
}

/**
 *
 * @param args
 * @param name
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
function selectSystemPromptCallback(args, name) {
    if (!power_user.sysprompt.enabled && !isTrueBoolean(args.forceGet)) {
        return '';
    }

    if (!name) {
        return power_user.sysprompt.name ?? '';
    }

    const quiet = isTrueBoolean(args?.quiet);
    // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
    const systemPromptNames = system_prompts.map(preset => preset.name);
    let foundName = systemPromptNames.find(x => x.toLowerCase() === name.toLowerCase());

    if (!foundName) {
        const fuse = new Fuse(systemPromptNames);
        const result = fuse.search(name);

        if (result.length === 0) {
            if (!quiet) notyf.warning(`System prompt "${name}" not found`);
            return '';
        }

        foundName = result[0]!.item;
    }

    $select.value = foundName;
    $select.dispatchEvent(new Event('change', {bubbles: true}));
    if (!quiet) notyf.success(`System prompt "${foundName}" selected`);
    return foundName;
}

/**
 *
 */
export function initSystemPrompts() {
    $enabled.addEventListener('input', function () {
        power_user.sysprompt.enabled = this.checked;
        toggleSystemPromptDisabledControls();
        saveSettingsDebounced();
    });

    $select.addEventListener('change', async function () {
        if (!power_user.sysprompt.enabled) {
            $enabled.checked = true;
            $enabled.dispatchEvent(new Event('input', {bubbles: true}));
        }

        const name = String(this.value);
        // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
        const prompt = system_prompts.find(p => p.name === name);
        if (prompt) {
            // @ts-expect-error TS(2339) FIXME: Property 'content' does not exist on type 'never'.
            $content.value = prompt.content || '';
            // @ts-expect-error TS(2339) FIXME: Property 'post_history' does not exist on type 'ne... Remove this comment to see the full error message
            $postHistory.value = prompt.post_history || '';

            if (!CSS.supports('field-sizing', 'content')) {
                await resetScrollHeight($content);
                await resetScrollHeight($postHistory);
            }

            power_user.sysprompt.name = name;
            // @ts-expect-error TS(2339) FIXME: Property 'content' does not exist on type 'never'.
            power_user.sysprompt.content = prompt.content || '';
            // @ts-expect-error TS(2339) FIXME: Property 'post_history' does not exist on type 'ne... Remove this comment to see the full error message
            power_user.sysprompt.post_history = prompt.post_history || '';
        }
        saveSettingsDebounced();
    });

    $content.addEventListener('input', function () {
        power_user.sysprompt.content = String(this.value);
        saveSettingsDebounced();
    });

    $postHistory.addEventListener('input', function () {
        power_user.sysprompt.post_history = String(this.value);
        saveSettingsDebounced();
    });

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'sysprompt',
        aliases: ['system-prompt'],
        callback: selectSystemPromptCallback,
        returns: 'current prompt name',
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'quiet',
                description: 'Suppress the toast message on prompt change',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
                enumList: commonEnumProviders.boolean('trueFalse')(),
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'forceGet',
                description: 'Force getting a name even if system prompt is disabled',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
                enumList: commonEnumProviders.boolean('trueFalse')(),
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'system prompt name',
                typeList: [ARGUMENT_TYPE.STRING],
                // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
                enumProvider: () => system_prompts.map(x => new SlashCommandEnumValue(x.name, null, enumTypes.enum, enumIcons.preset)),
            }),
        ],
        helpString: `
            <div>
                Selects a system prompt by name, using fuzzy search to find the closest match.
                Gets the current system prompt if no name is provided and sysprompt is enabled or <code>forceGet=true</code> is passed.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/sysprompt </code></pre>
                    </li>
                </ul>
            </div>
        `,
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'sysprompt-on',
        aliases: ['sysprompt-enable'],
        callback: () => setSystemPromptStateCallback(true),
        helpString: 'Enables system prompt.',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'sysprompt-off',
        aliases: ['sysprompt-disable'],
        callback: () => setSystemPromptStateCallback(false),
        helpString: 'Disables system prompt',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'sysprompt-state',
        aliases: ['sysprompt-toggle'],
        helpString: 'Gets the current system prompt state. If an argument is provided, it will set the system prompt state.',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'system prompt state',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                enumList: commonEnumProviders.boolean('trueFalse')(),
            }),
        ],
        callback: toggleSystemPromptCallback,
    }));
}
