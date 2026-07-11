import { Fuse } from '../lib.js';

import {
    amount_gen,
    characters,
    eventSource,
    event_types,
    getRequestHeaders,
    koboldai_setting_names,
    koboldai_settings,
    main_api,
    max_context,
    nai_settings,
    novelai_setting_names,
    novelai_settings,
    online_status,
    saveSettings,
    saveSettingsDebounced,
    this_chid,
} from '../script.js';
import { groups, selected_group } from './group-chats.js';
import { t } from './i18n.js';
import { instruct_presets } from './instruct-mode.js';
import { kai_settings } from './kai-settings.js';
import { convertNovelPreset } from './nai-settings.js';
import { oai_settings, openai_setting_names, openai_settings } from './openai.js';
import { POPUP_RESULT, POPUP_TYPE, Popup } from './popup.js';
import { context_presets, getContextSettings, power_user } from './power-user.js';
import { reasoning_templates } from './reasoning.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument } from './slash-commands/SlashCommandArgument.js';
import { enumIcons } from './slash-commands/SlashCommandCommonEnumsProvider.js';
import { SlashCommandEnumValue, enumTypes } from './slash-commands/SlashCommandEnumValue.js';
import { SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import { checkForSystemPromptInInstructTemplate, system_prompts } from './sysprompt.js';
import { renderTemplateAsync } from './templates.js';
import {
    textgenerationwebui_settings as textgen_settings,
    textgenerationwebui_preset_names,
    textgenerationwebui_presets,
} from './textgen-settings.js';
import { download, ensurePlainObject, equalsIgnoreCaseAndAccents, getSanitizedFilename, parseJsonFile, waitUntilCondition } from './utils.js';

import { get, set } from 'es-toolkit/compat'

const presetManagers = {};

/**
 * Automatically select a preset for current API based on character or group name.
 */
function autoSelectPreset() {
    const presetManager = getPresetManager();

    if (!presetManager) {
        console.debug(`Preset Manager not found for API: ${main_api}`);
        return;
    }

    const name = selected_group ? groups.find(x => x.id == selected_group)?.name : characters[this_chid]?.name;

    if (!name) {
        console.debug(`Preset candidate not found for API: ${main_api}`);
        return;
    }

    const preset = presetManager.findPreset(name);
    const selectedPreset = presetManager.getSelectedPreset();

    if (preset === selectedPreset) {
        console.debug(`Preset already selected for API: ${main_api}, name: ${name}`);
        return;
    }

    if (preset !== undefined && preset !== null) {
        console.log(`Preset found for API: ${main_api}, name: ${name}`);
        presetManager.selectPreset(preset);
    }
}

/**
 * Gets a preset manager by API id.
 * @param {string} apiId API id
 * @returns {PresetManager} Preset manager
 */
export function getPresetManager(apiId = '') {
    if (apiId === 'koboldhorde') {
        apiId = 'kobold';
    }
    if (!apiId) {
        apiId = main_api == 'koboldhorde' ? 'kobold' : main_api;
    }

    if (!Object.keys(presetManagers).includes(apiId)) {
        return null;
    }

    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    return presetManagers[apiId];
}

/**
 * Registers preset managers for all select elements with data-preset-manager-for attribute.
 */
function registerPresetManagers() {
    document.querySelectorAll('select[data-preset-manager-for]').forEach(e => {
        const forData = e.getAttribute('data-preset-manager-for');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        for (const apiId of forData.split(',')) {
            console.debug(`Registering preset manager for API: ${apiId}`);
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            presetManagers[apiId] = new PresetManager(e, apiId);
        }
    });
}

class PresetManager {
    // @ts-expect-error TS(7006) FIXME: Parameter 'select' implicitly has an 'any' type.
    constructor(select, apiId) {
        this.select = select;
        this.apiId = apiId;
    }

    static masterSections = {
        'instruct': {
            name: 'Instruct Template',
            getData: () => {
                const manager = getPresetManager('instruct');
                const name = manager.getSelectedPresetName();
                return manager.getPresetSettings(name);
            },
            // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
            setData: (data) => {
                const manager = getPresetManager('instruct');
                const name = data.name;
                return manager.savePreset(name, data);
            },
            // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
            isValid: (data) => PresetManager.isPossiblyInstructData(data),
        },
        'context': {
            name: 'Context Template',
            getData: () => {
                const manager = getPresetManager('context');
                const name = manager.getSelectedPresetName();
                return manager.getPresetSettings(name);
            },
            // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
            setData: (data) => {
                const manager = getPresetManager('context');
                const name = data.name;
                return manager.savePreset(name, data);
            },
            // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
            isValid: (data) => PresetManager.isPossiblyContextData(data),
        },
        'sysprompt': {
            name: 'System Prompt',
            getData: () => {
                const manager = getPresetManager('sysprompt');
                const name = manager.getSelectedPresetName();
                return manager.getPresetSettings(name);
            },
            // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
            setData: (data) => {
                const manager = getPresetManager('sysprompt');
                const name = data.name;
                return manager.savePreset(name, data);
            },
            // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
            isValid: (data) => PresetManager.isPossiblySystemPromptData(data),
        },
        'preset': {
            name: 'Text Completion Preset',
            getData: () => {
                const manager = getPresetManager('textgenerationwebui');
                const name = manager.getSelectedPresetName();
                const data = manager.getPresetSettings(name);
                data.name = name;
                return data;
            },
            // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
            setData: (data) => {
                const manager = getPresetManager('textgenerationwebui');
                const name = data.name;
                return manager.savePreset(name, data);
            },
            // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
            isValid: (data) => PresetManager.isPossiblyTextCompletionData(data),
        },
        'reasoning': {
            name: 'Reasoning Formatting',
            getData: () => {
                const manager = getPresetManager('reasoning');
                const name = manager.getSelectedPresetName();
                return manager.getPresetSettings(name);
            },
            // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
            setData: (data) => {
                const manager = getPresetManager('reasoning');
                const name = data.name;
                return manager.savePreset(name, data);
            },
            // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
            isValid: (data) => PresetManager.isPossiblyReasoningData(data),
        },
        'srw': {
            name: 'Start Reply With',
            getData: () => {
                return {
                    value: power_user.user_prompt_bias ?? '',
                    show: power_user.show_user_prompt_bias ?? false,
                };
            },
            // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
            setData: (data) => {
                power_user.user_prompt_bias = data.value ?? '';
                power_user.show_user_prompt_bias = data.show ?? false;
                document.getElementById('start_reply_with').value = power_user.user_prompt_bias;
                const el = document.getElementById('chat-show-reply-prefix-checkbox'); if (el) el.checked = power_user.show_user_prompt_bias;
                return saveSettingsDebounced();
            },
            // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
            isValid: (data) => PresetManager.isPossiblyStartReplyWithData(data),
        },
    };

    apiId: string;
    // @ts-expect-error TS(2315) FIXME: Type 'JQuery' is not generic.
    select: JQuery<HTMLSelectElement>;

    // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
    static isPossiblyInstructData(data) {
        const instructProps = ['name', 'input_sequence', 'output_sequence'];
        return data && instructProps.every(prop => Object.keys(data).includes(prop));
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
    static isPossiblyContextData(data) {
        const contextProps = ['name', 'story_string'];
        return data && contextProps.every(prop => Object.keys(data).includes(prop));
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
    static isPossiblySystemPromptData(data) {
        const sysPromptProps = ['name', 'content'];
        return data && sysPromptProps.every(prop => Object.keys(data).includes(prop));
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
    static isPossiblyTextCompletionData(data) {
        const textCompletionProps = ['temp', 'top_k', 'top_p', 'rep_pen'];
        return data && textCompletionProps.every(prop => Object.keys(data).includes(prop));
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
    static isPossiblyReasoningData(data) {
        const reasoningProps = ['name', 'prefix', 'suffix', 'separator'];
        return data && reasoningProps.every(prop => Object.keys(data).includes(prop));
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
    static isPossiblyStartReplyWithData(data) {
        return data && 'value' in data && 'show' in data;
    }

    /**
     * Imports master settings from JSON data.
     * @param {object} data Data to import
     * @param {string} fileName File name
     * @returns {Promise<void>}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
    static async performMasterImport(data, fileName) {
        if (!data || typeof data !== 'object') {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(t`Invalid data provided for master import`);
            return;
        }

        // Check for legacy file imports
        // 1. Instruct Template
        if (this.isPossiblyInstructData(data)) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.info(t`Importing instruct template...`, t`Instruct template detected`);
            return await getPresetManager('instruct').savePreset(data.name, data);
        }

        // 2. Context Template
        if (this.isPossiblyContextData(data)) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.info(t`Importing as context template...`, t`Context template detected`);
            return await getPresetManager('context').savePreset(data.name, data);
        }

        // 3. System Prompt
        if (this.isPossiblySystemPromptData(data)) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.info(t`Importing as system prompt...`, t`System prompt detected`);
            return await getPresetManager('sysprompt').savePreset(data.name, data);
        }

        // 4. Text Completion settings
        if (this.isPossiblyTextCompletionData(data)) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.info(t`Importing as settings preset...`, t`Text Completion settings detected`);
            return await getPresetManager('textgenerationwebui').savePreset(fileName, data);
        }

        // 5. Reasoning Template
        if (this.isPossiblyReasoningData(data)) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.info(t`Importing as reasoning template...`, t`Reasoning template detected`);
            return await getPresetManager('reasoning').savePreset(data.name, data);
        }

        const validSections = [];
        for (const [key, section] of Object.entries(this.masterSections)) {
            if (key in data && section.isValid(data[key])) {
                validSections.push(key);
            }
        }

        if (validSections.length === 0) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(t`No valid sections found in imported data`);
            return;
        }

        const sectionNames = validSections.reduce((acc, key) => {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            acc[key] = { key: key, name: this.masterSections[key].name, preset: data[key]?.name || '' };
            return acc;
        }, {});

        const html = document.createElement('div');
        html.innerHTML = await renderTemplateAsync('masterImport', { sections: sectionNames });
        const popup = new Popup(html, POPUP_TYPE.CONFIRM, '', {
            okButton: t`Import`,
            cancelButton: t`Cancel`,
        });

        const result = await popup.show();

        // Import cancelled
        if (result !== POPUP_RESULT.AFFIRMATIVE) {
            return;
        }

        const importedSections = [];
        const confirmedSections = Array.from(html.querySelectorAll('input:checked')).map(el => el instanceof HTMLInputElement && el.value);

        if (confirmedSections.length === 0) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.info(t`No sections selected for import`);
            return;
        }

        for (const section of confirmedSections) {
            // @ts-expect-error TS(2538) FIXME: Type 'false' cannot be used as an index type.
            const sectionData = data[section];
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            const masterSection = this.masterSections[section];
            if (sectionData && masterSection) {
                await masterSection.setData(sectionData);
                importedSections.push(masterSection.name);
            }
        }

        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success(t`Imported ${importedSections.length} settings: ${importedSections.join(', ')}`);
    }

    /**
     * Exports master settings to JSON data.
     * @returns {Promise<string>} JSON data
     */
    static async performMasterExport() {
        const sectionNames = Object.entries(this.masterSections).reduce((acc, [key, section]) => {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            acc[key] = { key: key, name: section.name, checked: !['preset', 'srw'].includes(key) };
            return acc;
        }, {});
        const html = document.createElement('div');
        html.innerHTML = await renderTemplateAsync('masterExport', { sections: sectionNames });

        const popup = new Popup(html, POPUP_TYPE.CONFIRM, '', {
            okButton: t`Export`,
            cancelButton: t`Cancel`,
        });

        const result = await popup.show();

        // Export cancelled
        if (result !== POPUP_RESULT.AFFIRMATIVE) {
            return;
        }

        const confirmedSections = Array.from(html.querySelectorAll('input:checked')).map(el => el instanceof HTMLInputElement && el.value);
        const data = {};

        if (confirmedSections.length === 0) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.info(t`No sections selected for export`);
            return;
        }

        for (const section of confirmedSections) {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            const masterSection = this.masterSections[section];
            if (masterSection) {
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                data[section] = masterSection.getData();
            }
        }

        return JSON.stringify(data, null, 4);
    }

    /**
     * Gets all preset names.
     * @returns {string[]} List of preset names
     */
    getAllPresets() {
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        return Array.from(this.select[0].options).map(el => el.text);
    }

    /**
     * Finds a preset by name.
     * @param {string} name Preset name
     * @returns {any} Preset value
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
    findPreset(name) {
        const el = this.select?.[0] ?? this.select;
        const options = el?.options ? Array.from(el.options) : [];
        return options.find(el => el.text === name)?.value;
    }

    /**
     * Gets the selected preset value.
     * @returns {any} Selected preset value
     */
    getSelectedPreset() {
        return this.select[0].options[this.select[0].selectedIndex]?.value;
    }

    /**
     * Gets the selected preset name.
     * @returns {string} Selected preset name
     */
    getSelectedPresetName() {
        const el = this.select?.[0] ?? this.select;
        return el?.options?.[el.selectedIndex]?.text;
    }

    /**
     * Selects a preset by option value.
     * @param {string} value Preset option value
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
    selectPreset(value) {
    if (this.select[0].value === value) {
        this.select[0].selected = true;
    }
    this.select.value = value
    this.select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    /**
     * Updates the preset select element with the current API presets.
     * @param {object} [options] Options for saving the preset
     * @param {boolean} [options.skipUpdate] If true, skips updating the preset list after saving.
     * @param option
     */
    async updatePreset(option = { skipUpdate: false }) {
        const selected = this.select[0].options[this.select[0].selectedIndex];
        console.log(selected);

        if (selected.value == 'gui') {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.info(t`Cannot update GUI preset`);
            return;
        }

        const name = selected.text;
        await this.savePreset(name, null, option);

        const successToast = !this.isAdvancedFormatting() ? t`Preset updated` : t`Template updated`;
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success(successToast);
    }

    /**
     * Saves the currently selected preset with a new name.
     */
    async savePresetAs() {
        const inputValue = this.getSelectedPresetName();
        const popupText = !this.isAdvancedFormatting() ? '<h4>' + t`Hint: Use a character/group name to bind preset to a specific chat.` + '</h4>' : '';
        const headerText = !this.isAdvancedFormatting() ? t`Preset name:` : t`Template name:`;
        const name = await Popup.show.input(headerText, popupText, inputValue);
        if (!name) {
            console.log('Preset name not provided');
            return;
        }

        // @ts-expect-error TS(2554) FIXME: Expected 2-3 arguments, but got 1.
        await this.savePreset(name);

        const successToast = !this.isAdvancedFormatting() ? t`Preset saved` : t`Template saved`;
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success(successToast);
    }

    /**
     * Saves a preset with the given name and settings.
     * @param {string} name Name of the preset to save
     * @param {object} [settings] Settings to save as the preset. If not provided, uses the current preset settings.
     * @param {object} [options] Options for saving the preset
     * @param {boolean} [options.skipUpdate] If true, skips updating the preset list after saving.
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
    async savePreset(name, settings, { skipUpdate = false } = {}) {
        if (this.apiId === 'instruct' && settings) {
            await checkForSystemPromptInInstructTemplate(name, settings);
        }

        if (this.apiId === 'novel' && settings) {
            settings = convertNovelPreset(settings);
        }

        const preset = settings ?? this.getPresetSettings(name);

        const response = await fetch('/api/presets/save', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ preset, name, apiId: this.apiId }),
        });

        if (!response.ok) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(t`Check the server connection and reload the page to prevent data loss.`, t`Preset could not be saved`);
            console.error('Preset could not be saved', response);
            throw new Error('Preset could not be saved');
        }

        const data = await response.json();
        name = data.name;

        if (skipUpdate) {
            console.debug(`Preset ${name} saved, but not updating the list`);
            return;
        }

        this.updateList(name, preset);
    }

    /**
     * Renames the currently selected preset.
     * @param {string} newName New name for the preset
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'newName' implicitly has an 'any' type.
    async renamePreset(newName) {
        const oldName = this.getSelectedPresetName();
        if (equalsIgnoreCaseAndAccents(oldName, newName)) {
            throw new Error('New name must be different from old name');
        }
        try {
            // @ts-expect-error TS(2554) FIXME: Expected 2-3 arguments, but got 1.
            await this.savePreset(newName);
            await this.deletePreset(oldName);
        } catch (error) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(t`Check the server connection and reload the page to prevent data loss.`, t`Preset could not be renamed`);
            console.error('Preset could not be renamed', error);
            throw new Error('Preset could not be renamed');
        }
    }

    /**
     * Gets a list of presets for the API.
     * @param {string} [api] API ID. If not specified, uses the current API ID.
     * @returns {{presets: any[], preset_names: object, settings: object}}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'api' implicitly has an 'any' type.
    getPresetList(api) {
        let presets = [];
        let preset_names = {};
        let settings = {};

        // If no API specified, use the current API
        if (api === undefined) {
            api = this.apiId;
        }

        switch (api) {
            case 'koboldhorde':
            case 'kobold':
                presets = koboldai_settings;
                preset_names = koboldai_setting_names;
                settings = kai_settings;
                break;
            case 'novel':
                presets = novelai_settings;
                preset_names = novelai_setting_names;
                settings = nai_settings;
                break;
            case 'textgenerationwebui':
                presets = textgenerationwebui_presets;
                preset_names = textgenerationwebui_preset_names;
                settings = textgen_settings;
                break;
            case 'openai':
                presets = openai_settings;
                preset_names = openai_setting_names;
                settings = oai_settings;
                break;
            case 'context':
                presets = context_presets;
                // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
                preset_names = context_presets.map(x => x.name);
                settings = power_user.context;
                break;
            case 'instruct':
                presets = instruct_presets;
                // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
                preset_names = instruct_presets.map(x => x.name);
                settings = power_user.instruct;
                break;
            case 'sysprompt':
                presets = system_prompts;
                // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
                preset_names = system_prompts.map(x => x.name);
                settings = power_user.sysprompt;
                break;
            case 'reasoning':
                presets = reasoning_templates;
                // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
                preset_names = reasoning_templates.map(x => x.name);
                settings = power_user.reasoning;
                break;
            default:
                console.warn(`Unknown API ID ${api}`);
        }

        return { presets, preset_names, settings };
    }

    /**
     * Returns true if the API is keyed, meaning it uses a name to identify presets.
     */
    isKeyedApi() {
        return this.apiId == 'textgenerationwebui' || this.isAdvancedFormatting();
    }

    /**
     * Returns true if the API is from Advanced Formatting group.
     */
    isAdvancedFormatting() {
        return ['context', 'instruct', 'sysprompt', 'reasoning'].includes(this.apiId);
    }

    /**
     * Updates the preset list with a new or existing preset.
     * @param {string} name Name of the preset
     * @param {object} preset Preset object
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
    updateList(name, preset) {
        // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
        const { presets, preset_names } = this.getPresetList();
        // @ts-expect-error TS(2339) FIXME: Property 'includes' does not exist on type '{}'.
        const presetExists = this.isKeyedApi() ? preset_names.includes(name) : Object.keys(preset_names).includes(name);

        if (presetExists) {
            if (this.isKeyedApi()) {
                // @ts-expect-error TS(2339) FIXME: Property 'indexOf' does not exist on type '{}'.
                presets[preset_names.indexOf(name)] = preset;
                const opt = this.select[0].querySelector(`option[value="${CSS.escape(name)}"]`);
                if (opt) opt.selected = true;
                this.select.value = name
                this.select.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                const value = preset_names[name];
                presets[value] = preset;
                const opt = this.select[0].querySelector(`option[value="${CSS.escape(String(value))}"]`);
                if (opt) opt.selected = true;
                this.select.value = value
                this.select.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } else {
            presets.push(preset);
            const value = presets.length - 1;

            if (this.isKeyedApi()) {
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                preset_names[value] = name;
                const option = document.createElement('option');
                option.value = name;
                option.text = name;
                option.selected = true;
                this.select.appendChild(option);
                this.select.value = name
                this.select.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                preset_names[name] = value;
                const option = document.createElement('option');
                option.value = String(value);
                option.text = name;
                option.selected = true;
                this.select.appendChild(option);
                this.select.value = value
                this.select.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }

    /**
     * Gets the preset settings for the given name.
     * @param {string} name Name of the preset
     * @returns {object} Preset settings object for the given name
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
    getPresetSettings(name) {
        /**
         *
         * @param apiId
         */
        // @ts-expect-error TS(7006) FIXME: Parameter 'apiId' implicitly has an 'any' type.
        function getSettingsByApiId(apiId) {
            switch (apiId) {
                case 'koboldhorde':
                case 'kobold':
                    return kai_settings;
                case 'novel':
                    return nai_settings;
                case 'textgenerationwebui':
                    return textgen_settings;
                case 'context': {
                    const context_preset = getContextSettings();
                    // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type '{}'.
                    context_preset.name = name || power_user.context.preset;
                    return context_preset;
                }
                case 'instruct': {
                    const instruct_preset = structuredClone(power_user.instruct);
                    // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type '{ enabled:... Remove this comment to see the full error message
                    instruct_preset.name = name || power_user.instruct.preset;
                    return instruct_preset;
                }
                case 'sysprompt': {
                    const sysprompt_preset = structuredClone(power_user.sysprompt);
                    // @ts-expect-error TS(2339) FIXME: Property 'preset' does not exist on type '{ enable... Remove this comment to see the full error message
                    sysprompt_preset.name = name || power_user.sysprompt.preset;
                    return sysprompt_preset;
                }
                case 'reasoning': {
                    const reasoning_preset = structuredClone(power_user.reasoning);
                    // @ts-expect-error TS(2339) FIXME: Property 'preset' does not exist on type '{ name: ... Remove this comment to see the full error message
                    reasoning_preset.name = name || power_user.reasoning.preset;
                    return reasoning_preset;
                }
                default:
                    console.warn(`Unknown API ID ${apiId}`);
                    return {};
            }
        }

        const filteredKeys = [
            'api_server',
            'preset',
            'streaming',
            'truncation_length',
            'n',
            'streaming_url',
            'stopping_strings',
            'can_use_tokenization',
            'can_use_streaming',
            'preset_settings_novel',
            'preset_settings',
            'streaming_novel',
            'nai_preamble',
            'model_novel',
            'streaming_kobold',
            'enabled',
            'bind_to_context',
            'seed',
            'legacy_api',
            'mancer_model',
            'togetherai_model',
            'ollama_model',
            'vllm_model',
            'aphrodite_model',
            'llamacpp_model',
            'server_urls',
            'type',
            'custom_model',
            'bypass_status_check',
            'infermaticai_model',
            'dreamgen_model',
            'openrouter_model',
            'featherless_model',
            'max_tokens_second',
            'openrouter_providers',
            'openrouter_quantizations',
            'openrouter_allow_fallbacks',
            'tabby_model',
            'derived',
            'generic_model',
            'include_reasoning',
            'global_banned_tokens',
            'send_banned_tokens',

            // Reasoning exclusions
            'auto_parse',
            'add_to_prompts',
            'auto_expand',
            'show_hidden',
            'max_additions',
        ];
        /** @type {Record<string, any>} */
        const settings = Object.assign({}, getSettingsByApiId(this.apiId));

        for (const key of filteredKeys) {
            if (Object.hasOwn(settings, key)) {
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                delete settings[key];
            }
        }

        if (!this.isAdvancedFormatting() && this.apiId !== 'openai') {
            // @ts-expect-error TS(2339) FIXME: Property 'genamt' does not exist on type '{}'.
            settings.genamt = amount_gen;
            // @ts-expect-error TS(2339) FIXME: Property 'max_length' does not exist on type '{}'.
            settings.max_length = max_context;
        }

        return settings;
    }

    /**
     * Retrieves a completion preset by name.
     * @param {string} name Name of the preset to retrieve
     * @returns {any} Preset object if found, otherwise undefined
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
    getCompletionPresetByName(name) {
        // Retrieve a completion preset by name. Return undefined if not found.
        // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
        const { presets, preset_names } = this.getPresetList();
        let preset;

        // Some APIs use an array of names, others use an object of {name: index}
        if (Array.isArray(preset_names)) {  // array of names
            if (preset_names.includes(name)) {
                preset = presets[preset_names.indexOf(name)];
            }
        } else {  // object of {names: index}
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            if (preset_names[name] !== undefined) {
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                preset = presets[preset_names[name]];
            }
        }

        if (preset === undefined) {
            console.error(`Preset ${name} not found`);
        }

        // if the preset isn't found, returns undefined
        return preset;
    }

    /**
     * Deletes a preset by name. If not provided, deletes the currently selected preset.
     * @param {string} [name] Name of the preset to delete.
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
    async deletePreset(name) {
        // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
        const { preset_names, presets } = this.getPresetList();
        const value = name ? (this.isKeyedApi() ? this.findPreset(name) : name) : this.getSelectedPreset();
        const nameToDelete = name || this.getSelectedPresetName();

        if (value == 'gui') {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.info(t`Cannot delete GUI preset`);
            return;
        }

        if (this.isKeyedApi()) {
            this.select[0].querySelector(`option[value="${CSS.escape(value)}"]`)?.remove();
            // @ts-expect-error TS(2339) FIXME: Property 'indexOf' does not exist on type '{}'.
            const index = preset_names.indexOf(nameToDelete);
            // @ts-expect-error TS(2339) FIXME: Property 'splice' does not exist on type '{}'.
            preset_names.splice(index, 1);
            presets.splice(index, 1);
        } else {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            const index = preset_names[nameToDelete];
            this.select[0].querySelector(`option[value="${CSS.escape(String(index))}"]`)?.remove();
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            delete preset_names[nameToDelete];
        }

        // switch in UI only when deleting currently selected preset
        const switchPresets = !name || this.getSelectedPresetName() == name;

        if (Object.keys(preset_names).length && switchPresets) {
            const nextPresetName = Object.keys(preset_names)[0];
            // @ts-expect-error TS(2538) FIXME: Type 'undefined' cannot be used as an index type.
            const newValue = preset_names[nextPresetName];
            this.select[0].querySelector(`option[value="${CSS.escape(String(newValue))}"]`)?.setAttribute('selected', 'true');
            this.select.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const response = await fetch('/api/presets/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name: nameToDelete, apiId: this.apiId }),
        });

        return response.ok;
    }

    /**
     * Retrieves the default preset for the API from the server.
     * @param {string} name Name of the preset to restore
     * @returns {Promise<any>} Default preset object, or undefined if the request fails
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
    async getDefaultPreset(name) {
        const response = await fetch('/api/presets/restore', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name, apiId: this.apiId }),
        });

        if (!response.ok) {
            const errorToast = !this.isAdvancedFormatting() ? t`Failed to restore default preset` : t`Failed to restore default template`;
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(errorToast);
            return;
        }

        return await response.json();
    }

    /**
     * Reads a preset extension field from the preset.
     * @param {object} options
     * @param {string} [options.name] Name of the preset. If not provided, uses the currently selected preset name.
     * @param {string} options.path Path to the preset extension field, e.g. 'myextension.data'. If empty, reads the entire extensions object.
     * @returns {any} The value of the preset extension field, or null if not found.
     */
    // @ts-expect-error TS(7031) FIXME: Binding element 'name' implicitly has an 'any' typ... Remove this comment to see the full error message
    readPresetExtensionField({ name, path }) {
        // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
        const { settings } = this.getPresetList();
        const selectedName = this.getSelectedPresetName();
        const presetName = name || selectedName;

        // Read from settings if the selected preset is the same as the provided name
        if (settings && selectedName === presetName) {
            // @ts-expect-error TS(2339) FIXME: Property 'extensions' does not exist on type '{}'.
            const settingsExtensions = ensurePlainObject(settings.extensions || {});
            return path ? get(settingsExtensions, path, null) : settingsExtensions;
        }

        // Otherwise, read from the preset by name
        const preset = this.getCompletionPresetByName(presetName);
        if (!preset) {
            return null;
        }

        const presetExtensions = ensurePlainObject(preset.extensions || {});
        const value = path ? get(presetExtensions, path, null) : presetExtensions;
        return value;

    }

    /**
     * Writes a value to a preset extension field.
     * @param {object} options
     * @param {string} [options.name] Name of the preset. If not provided, uses the currently selected preset name.
     * @param {string} options.path Path to the preset extension field, e.g. 'myextension.data'. If empty, writes to the root of the extensions object.
     * @param {any} options.value Value to write to the preset extension field.
     * @returns {Promise<void>} Resolves when the preset is saved.
     */
    // @ts-expect-error TS(7031) FIXME: Binding element 'name' implicitly has an 'any' typ... Remove this comment to see the full error message
    async writePresetExtensionField({ name, path, value }) {
        // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
        const { settings } = this.getPresetList();
        const selectedName = this.getSelectedPresetName();
        const presetName = name || selectedName;

        // Write to settings if the selected preset is the same as the provided name
        if (settings && selectedName === presetName) {
            // Set the value at the specified path
            // @ts-expect-error TS(2339) FIXME: Property 'extensions' does not exist on type '{}'.
            settings.extensions = ensurePlainObject(settings.extensions || {});
            if (path) {
                // @ts-expect-error TS(2339) FIXME: Property 'extensions' does not exist on type '{}'.
                set(settings.extensions, path, value);
            } else {
                // @ts-expect-error TS(2339) FIXME: Property 'extensions' does not exist on type '{}'.
                settings.extensions = value;
            }
            await saveSettings();
        }

        // Also update the preset by name
        const preset = this.getCompletionPresetByName(presetName);
        if (!preset) {
            return;
        }

        // Set the value at the specified path
        preset.extensions = ensurePlainObject(preset.extensions || {});
        if (path) {
            set(preset.extensions, path, value);
        } else {
            preset.extensions = value;
        }

        // Save the updated preset
        await this.savePreset(presetName, preset, { skipUpdate: true });
    }
}

/**
 * Selects a preset by name for current API.
 * @param {any} _ Named arguments
 * @param {string} name Unnamed arguments
 * @returns {Promise<string>} Selected or current preset name
 */
// @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
async function presetCommandCallback(_, name) {
    const shouldReconnect = online_status !== 'no_connection';
    const presetManager = getPresetManager();
    const allPresets = presetManager.getAllPresets();
    const currentPreset = presetManager.getSelectedPresetName();

    if (!presetManager) {
        console.debug(`Preset Manager not found for API: ${main_api}`);
        return '';
    }

    if (!name) {
        console.log('No name provided for /preset command, using current preset');
        return currentPreset;
    }

    if (!Array.isArray(allPresets) || allPresets.length === 0) {
        console.log(`No presets found for API: ${main_api}`);
        return currentPreset;
    }

    // Find exact match
    const exactMatch = allPresets.find(p => p.toLowerCase().trim() === name.toLowerCase().trim());

    if (exactMatch) {
        console.log('Found exact preset match', exactMatch);

        if (currentPreset !== exactMatch) {
            const presetValue = presetManager.findPreset(exactMatch);

            if (presetValue) {
                presetManager.selectPreset(presetValue);
                if (shouldReconnect) {
                    await waitForConnection();
                }
            }
        }

        return exactMatch;
    } else {
        // Find fuzzy match
        const fuse = new Fuse(allPresets);
        const fuzzyMatch = fuse.search(name);

        if (!fuzzyMatch.length) {
            console.warn(`WARN: Preset found with name ${name}`);
            return currentPreset;
        }

        const fuzzyPresetName = fuzzyMatch[0]!.item;
        const fuzzyPresetValue = presetManager.findPreset(fuzzyPresetName);

        if (fuzzyPresetValue) {
            console.log('Found fuzzy preset match', fuzzyPresetName);

            if (currentPreset !== fuzzyPresetName) {
                presetManager.selectPreset(fuzzyPresetValue);
                if (shouldReconnect) {
                    await waitForConnection();
                }
            }
        }

        return fuzzyPresetName;
    }
}

/**
 * Waits for API connection to be established.
 */
async function waitForConnection() {
    try {
        await waitUntilCondition(() => online_status !== 'no_connection', 10000, 100);
    } catch {
        console.log('Timeout waiting for API to connect');
    }
}

/**
 *
 */
export async function initPresetManager() {
    eventSource.on(event_types.CHAT_CHANGED, autoSelectPreset);
    registerPresetManagers();
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'preset',
        callback: presetCommandCallback,
        returns: 'current preset',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'name',
                typeList: [ARGUMENT_TYPE.STRING],
                // @ts-expect-error TS(7006) FIXME: Parameter 'preset' implicitly has an 'any' type.
                enumProvider: () => getPresetManager().getAllPresets().map(preset => new SlashCommandEnumValue(preset, null, enumTypes.enum, enumIcons.preset)),
            }),
        ],
        helpString: `
            <div>
                Sets a preset by name for the current API. Gets the current preset if no name is provided.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/preset myPreset</code></pre>
                    </li>
                    <li>
                        <pre><code>/preset</code></pre>
                    </li>
                </ul>
            </div>
        `,
    }));


    document.addEventListener('click', async function (e) {
        if (!(e.target instanceof Element)) return;
        const target = e.target.closest('[data-preset-manager-update]');
        if (!target) return;
        const apiId = target.dataset.presetManagerUpdate;
        const presetManager = getPresetManager(apiId);

        if (!presetManager) {
            console.warn(`Preset Manager not found for API: ${apiId}`);
            return;
        }

        await presetManager.updatePreset();
    });

    document.addEventListener('click', async function (e) {
        if (!(e.target instanceof Element)) return;
        const target = e.target.closest('[data-preset-manager-new]');
        if (!target) return;
        const apiId = target.dataset.presetManagerNew;
        const presetManager = getPresetManager(apiId);

        if (!presetManager) {
            console.warn(`Preset Manager not found for API: ${apiId}`);
            return;
        }

        await presetManager.savePresetAs();
    });

    document.addEventListener('click', async function (e) {
        if (!(e.target instanceof Element)) return;
        const target = e.target.closest('[data-preset-manager-rename]');
        if (!target) return;
        const apiId = target.dataset.presetManagerRename;
        const presetManager = getPresetManager(apiId);

        if (!presetManager) {
            console.warn(`Preset Manager not found for API: ${apiId}`);
            return;
        }

        const popupHeader = !presetManager.isAdvancedFormatting() ? t`Rename preset` : t`Rename template`;
        const oldName = presetManager.getSelectedPresetName();
        const newName = await getSanitizedFilename((await Popup.show.input(popupHeader, t`Enter a new name:`, oldName)) || '');
        if (!newName || oldName === newName) {
            console.debug(!presetManager.isAdvancedFormatting() ? 'Preset rename cancelled' : 'Template rename cancelled');
            return;
        }
        if (equalsIgnoreCaseAndAccents(oldName, newName)) {
            toastr.warning(t`Name not accepted, as it is the same as before (ignoring case and accents).`, t`Rename Preset`);
            return;
        }

        await eventSource.emit(event_types.PRESET_RENAMED_BEFORE, { apiId: apiId, oldName: oldName, newName: newName });
        const extensions = presetManager.readPresetExtensionField({ name: oldName, path: '' });
        await presetManager.renamePreset(newName);
        await presetManager.writePresetExtensionField({ name: newName, path: '', value: extensions });
        await eventSource.emit(event_types.PRESET_RENAMED, { apiId: apiId, oldName: oldName, newName: newName });

        if (apiId === 'openai') {
            // This is a horrible mess, but prevents the renamed preset from being corrupted.
            document.getElementById('update_oai_preset')?.click();
            return;
        }

        const successToast = !presetManager.isAdvancedFormatting() ? t`Preset renamed` : t`Template renamed`;
        toastr.success(successToast);
    });

    document.addEventListener('click', async function (e) {
        if (!(e.target instanceof Element)) return;
        const target = e.target.closest('[data-preset-manager-export]');
        if (!target) return;
        const apiId = target.dataset.presetManagerExport;
        const presetManager = getPresetManager(apiId);

        if (!presetManager) {
            console.warn(`Preset Manager not found for API: ${apiId}`);
            return;
        }

        const selected = presetManager.select[0].options[presetManager.select[0].selectedIndex];
        const name = selected.text;
        const preset = presetManager.getPresetSettings(name);
        const data = JSON.stringify(preset, null, 4);
        download(data, `${name}.json`, 'application/json');
    });

    document.addEventListener('click', async function (e) {
        if (!(e.target instanceof Element)) return;
        const target = e.target.closest('[data-preset-manager-import]');
        if (!target) return;
        const apiId = target.dataset.presetManagerImport;
        const fileInput = document.querySelector(`[data-preset-manager-file="${apiId}"]`);
        if (fileInput) fileInput.click();
    });

    document.addEventListener('change', async function (e) {
        if (!(e.target instanceof Element)) return;
        const target = e.target.closest('[data-preset-manager-file]');
        if (!target) return;
        const apiId = target.dataset.presetManagerFile;
        const presetManager = getPresetManager(apiId);

        if (!presetManager) {
            console.warn(`Preset Manager not found for API: ${apiId}`);
            return;
        }

        const file = e.target.files[0];

        if (!file) {
            return;
        }

        const fileName = file.name.replace('.json', '').replace('.settings', '');
        const data = await parseJsonFile(file);
        const name = data?.name ?? fileName;
        data.name = name;

        await presetManager.savePreset(name, data);
        const successToast = !presetManager.isAdvancedFormatting() ? t`Preset imported` : t`Template imported`;
        toastr.success(successToast);
        e.target.value = null;
    });

    document.addEventListener('click', async function (e) {
        if (!(e.target instanceof Element)) return;
        const target = e.target.closest('[data-preset-manager-delete]');
        if (!target) return;
        const apiId = target.dataset.presetManagerDelete;
        const presetManager = getPresetManager(apiId);

        if (!presetManager) {
            console.warn(`Preset Manager not found for API: ${apiId}`);
            return;
        }

        const headerText = !presetManager.isAdvancedFormatting() ? t`Delete this preset?` : t`Delete this template?`;
        const confirm = await Popup.show.confirm(headerText, t`This action is irreversible and your current settings will be overwritten.`);
        if (!confirm) {
            return;
        }

        const name = presetManager.getSelectedPresetName();
        const result = await presetManager.deletePreset();

        if (result) {
            const successToast = !presetManager.isAdvancedFormatting() ? t`Preset deleted` : t`Template deleted`;
            toastr.success(successToast);
            await eventSource.emit(event_types.PRESET_DELETED, { apiId, name });
        } else {
            const warningToast = !presetManager.isAdvancedFormatting() ? t`Preset was not deleted from server` : t`Template was not deleted from server`;
            toastr.warning(warningToast);
        }

        saveSettingsDebounced();
    });

    document.addEventListener('click', async function (e) {
        if (!(e.target instanceof Element)) return;
        const target = e.target.closest('[data-preset-manager-restore]');
        if (!target) return;
        const apiId = target.dataset.presetManagerRestore;
        const presetManager = getPresetManager(apiId);

        if (!presetManager) {
            console.warn(`Preset Manager not found for API: ${apiId}`);
            return;
        }

        const name = presetManager.getSelectedPresetName();
        const data = await presetManager.getDefaultPreset(name);

        if (name == 'gui') {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.info(t`Cannot restore GUI preset`);
            return;
        }

        if (!data) {
            return;
        }

        if (data.isDefault) {
            if (Object.keys(data.preset).length === 0) {
                const errorToast = !presetManager.isAdvancedFormatting() ? t`Default preset cannot be restored` : t`Default template cannot be restored`;
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.error(errorToast);
                return;
            }

            const confirmText = !presetManager.isAdvancedFormatting()
                ? t`Resetting a <b>default preset</b> will restore the default settings.`
                : t`Resetting a <b>default template</b> will restore the default settings.`;
            const confirm = await Popup.show.confirm(t`Are you sure?`, confirmText);
            if (!confirm) {
                return;
            }

            await presetManager.deletePreset();
            await presetManager.savePreset(name, data.preset);
            const option = presetManager.findPreset(name);
            presetManager.selectPreset(option);
            const successToast = !presetManager.isAdvancedFormatting() ? t`Default preset restored` : t`Default template restored`;
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.success(successToast);
        } else {
            const confirmText = !presetManager.isAdvancedFormatting()
                ? t`Resetting a <b>custom preset</b> will restore to the last saved state.`
                : t`Resetting a <b>custom template</b> will restore to the last saved state.`;
            const confirm = await Popup.show.confirm(t`Are you sure?`, confirmText);
            if (!confirm) {
                return;
            }

            const option = presetManager.findPreset(name);
            presetManager.selectPreset(option);
            const successToast = !presetManager.isAdvancedFormatting() ? t`Preset restored` : t`Template restored`;
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.success(successToast);
        }
    });

    document.getElementById('af_master_import')?.addEventListener('click', () => {
        document.getElementById('af_master_import_file')?.click();
    });

    document.getElementById('af_master_import_file')?.addEventListener('change', async function (e) {
        if (!(e.target instanceof HTMLInputElement)) {
            return;
        }
        const file = e.target.files[0];

        if (!file) {
            return;
        }

        const data = await parseJsonFile(file);
        const fileName = file.name.replace('.json', '');
        await PresetManager.performMasterImport(data, fileName);
        e.target.value = null;
    });

    document.getElementById('af_master_export')?.addEventListener('click', async () => {
        const data = await PresetManager.performMasterExport();

        if (!data) {
            return;
        }

        const shortDate = new Date().toISOString().split('T')[0];
        download(data, `ST-formatting-${shortDate}.json`, 'application/json');
    });
}
