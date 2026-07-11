'use strict';

import { DOMPurify } from '../lib.js';

import { event_types, eventSource, is_send_press, main_api, substituteParams } from '../script.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Sortable: any;
import { is_group_generating } from './group-chats.js';
import { Message, TokenHandler } from './openai.js';
import { power_user } from './power-user.js';
import { debounce, waitUntilCondition, escapeHtml, uuidv4 } from './utils.js';
import { debounce_timeout } from './constants.js';
import { renderTemplateAsync } from './templates.js';
import { Popup } from './popup.js';
import { t } from './i18n.js';
import { isMobile } from './RossAscends-mods.js';

/**
 *
 * @param func
 * @param delay
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'func' implicitly has an 'any' type.
function debouncePromise(func, delay) {
    // @ts-expect-error TS(7034) FIXME: Variable 'timeoutId' implicitly has type 'any' in ... Remove this comment to see the full error message
    let timeoutId;

    // @ts-expect-error TS(7019) FIXME: Rest parameter 'args' implicitly has an 'any[]' ty... Remove this comment to see the full error message
    return (...args) => {
        // @ts-expect-error TS(7005) FIXME: Variable 'timeoutId' implicitly has an 'any' type.
        clearTimeout(timeoutId);

        return new Promise((resolve) => {
            timeoutId = setTimeout(() => {
                const result = func(...args);
                resolve(result);
            }, delay);
        });
    };
}

const DEFAULT_DEPTH = 4;
const DEFAULT_ORDER = 100;

/**
 * @enum {number}
 */
export const INJECTION_POSITION = {
    RELATIVE: 0,
    ABSOLUTE: 1,
};

/**
 * Register migrations for the prompt manager when settings are loaded or an Open AI preset is loaded.
 */
const registerPromptManagerMigration = () => {
    // @ts-expect-error TS(7006) FIXME: Parameter 'settings' implicitly has an 'any' type.
    const migrate = (settings, savePreset = null, presetName = null) => {
        if ('Default' === presetName) return;

        if (settings.main_prompt || settings.nsfw_prompt || settings.jailbreak_prompt) {
            console.log('Running prompt manager configuration migration');
            if (settings.prompts === undefined || settings.prompts.length === 0) settings.prompts = structuredClone(chatCompletionDefaultPrompts.prompts);

            // @ts-expect-error TS(7006) FIXME: Parameter 'identifier' implicitly has an 'any' typ... Remove this comment to see the full error message
            const findPrompt = (identifier) => settings.prompts.find(prompt => identifier === prompt.identifier);
            if (settings.main_prompt) {
                findPrompt('main').content = settings.main_prompt;
                delete settings.main_prompt;
            }

            if (settings.nsfw_prompt) {
                findPrompt('nsfw').content = settings.nsfw_prompt;
                delete settings.nsfw_prompt;
            }

            if (settings.jailbreak_prompt) {
                findPrompt('jailbreak').content = settings.jailbreak_prompt;
                delete settings.jailbreak_prompt;
            }

            // @ts-expect-error TS(2349) FIXME: This expression is not callable.
            if (savePreset && presetName) savePreset(presetName, settings, false);
        }
    };

    // @ts-expect-error TS(7006) FIXME: Parameter 'settings' implicitly has an 'any' type.
    eventSource.on(event_types.SETTINGS_LOADED_BEFORE, settings => migrate(settings));
    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    eventSource.on(event_types.OAI_PRESET_CHANGED_BEFORE, event => migrate(event.preset, event.savePreset, event.presetName));
};

/**
 * Represents a prompt.
 */
class Prompt {
    /**
     * Indicates if the prompt is enabled.
     * @type {boolean}
     */
    // @ts-expect-error TS(7008) FIXME: Member 'enabled' implicitly has an 'any' type.
    enabled;

    /**
     * Unique identifier for the prompt.
     * @type {string}
     */
    identifier;

    /**
     * Role of the prompt, e.g., 'system', 'user', etc.
     * @type {string}
     */
    role;

    /**
     * Content of the prompt.
     * @type {string}
     */
    content;

    /**
     * Display name of the prompt.
     * @type {string}
     */
    name;

    /**
     * Indicates if the prompt is a system prompt.
     * @type {boolean}
     */
    system_prompt;

    /**
     * Position of the prompt in the prompt list.
     * @type {string|number}
     */
    position;

    /**
     * Inject position of the prompt (relative = 0 or in-chat = 1)
     * @type {number}
     */
    injection_position;

    /**
     * Depth of the prompt in the chat.
     * @type {number}
     */
    injection_depth;

    /**
     * Order of the prompt in the chat.
     * @type {number}
     */
    injection_order;

    /**
     * Indicates if the prompt should not be overridden.
     * @type {boolean}
     */
    forbid_overrides;

    /**
     * Prompt is added by an extension.
     * @type {boolean}
     */
    extension;

    /**
     * A list of generation type triggers for the prompt injection.
     * @type {string[]}
     */
    injection_trigger;

    /**
     * Indicates if the prompt is a marker prompt.
     * @type {boolean}
     */
    // @ts-expect-error TS(7008) FIXME: Member 'marker' implicitly has an 'any' type.
    marker;

    /**
     * Create a new Prompt instance.
     * @param {object} [param0] - Object containing the properties of the prompt.
     * @param {string} [param0.identifier] - The unique identifier of the prompt.
     * @param {string} [param0.role] - The role associated with the prompt.
     * @param {string} [param0.content] - The content of the prompt.
     * @param {string} [param0.name] - The name of the prompt.
     * @param {boolean} [param0.system_prompt] - Indicates if the prompt is a system prompt.
     * @param {string|number} [param0.position] - The position of the prompt in the prompt list.
     * @param {number} [param0.injection_position] - The insert position of the prompt.
     * @param {number} [param0.injection_depth] - The depth of the prompt in the chat.
     * @param {number} [param0.injection_order] - The order of the prompt in the chat.
     * @param {string[]} [param0.injection_trigger] - The generation type trigger for the prompt injection.
     * @param {boolean} [param0.forbid_overrides] - Indicates if the prompt should not be overridden.
     * @param {boolean} [param0.extension] - Prompt is added by an extension.
     */
    /**
     * @typedef {object} PromptConstructorParams
     * @property {string} [identifier]
     * @property {string} [role]
     * @property {string} [content]
     * @property {string} [name]
     * @property {boolean} [system_prompt]
     * @property {string|number} [position]
     * @property {number} [injection_position]
     * @property {number} [injection_depth]
     * @property {number} [injection_order]
     * @property {string[]} [injection_trigger]
     * @property {boolean} [forbid_overrides]
     * @property {boolean} [extension]
     */

    constructor({
        identifier,
        role,
        content,
        name,
        system_prompt,
        position,
        injection_depth,
        injection_position,
        forbid_overrides,
        extension,
        injection_order,
        injection_trigger
    // @ts-expect-error TS(2304) FIXME: Cannot find name 'PromptConstructorParams'.
    }: PromptConstructorParams = {}) {
        this.identifier = identifier;
        this.role = role;
        this.content = content;
        this.name = name;
        this.system_prompt = system_prompt;
        this.position = position;
        this.injection_depth = injection_depth;
        this.injection_position = injection_position;
        this.forbid_overrides = forbid_overrides;
        this.extension = extension ?? false;
        this.injection_order = injection_order ?? DEFAULT_ORDER;
        this.injection_trigger = injection_trigger ?? [];
    }
}

/**
 * Representing a collection of prompts.
 */
export class PromptCollection {
    /**
     * List of Prompts in the collection.
     * @type {Prompt[]}
     */
    collection = [];

    /**
     * List of identifiers of prompts that have been overridden.
     * @type {string[]}
     */
    overriddenPrompts = [];

    /**
     * Create a new PromptCollection instance.
     * @param {...Prompt} prompts - An array of Prompt instances.
     */
    // @ts-expect-error TS(7019) FIXME: Rest parameter 'prompts' implicitly has an 'any[]'... Remove this comment to see the full error message
    constructor(...prompts) {
        this.add(...prompts);
    }

    /**
     * Checks if the provided instances are of the Prompt class.
     * @param {...Prompt} prompts - Instances to check.
     * @throws Will throw an error if one or more instances are not of the Prompt class.
     */
    // @ts-expect-error TS(7019) FIXME: Rest parameter 'prompts' implicitly has an 'any[]'... Remove this comment to see the full error message
    checkPromptInstance(...prompts) {
        for (const prompt of prompts) {
            if (!(prompt instanceof Prompt)) {
                throw new Error('Only Prompt instances can be added to PromptCollection');
            }
        }
    }

    /**
     * Adds new Prompt instances to the collection.
     * @param {...Prompt} prompts - An array of Prompt instances.
     */
    // @ts-expect-error TS(7019) FIXME: Rest parameter 'prompts' implicitly has an 'any[]'... Remove this comment to see the full error message
    add(...prompts) {
        this.checkPromptInstance(...prompts);
        // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
        this.collection.push(...prompts);
    }

    /**
     * Sets a Prompt instance at a specific position in the collection.
     * @param {Prompt} prompt - The Prompt instance to set.
     * @param {number} position - The position in the collection to set the Prompt instance.
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'prompt' implicitly has an 'any' type.
    set(prompt, position) {
        this.checkPromptInstance(prompt);
        // @ts-expect-error TS(2322) FIXME: Type 'any' is not assignable to type 'never'.
        this.collection[position] = prompt;
    }

    /**
     * Retrieves a Prompt instance from the collection by its identifier.
     * @param {string} identifier - The identifier of the Prompt instance to retrieve.
     * @returns {Prompt} The Prompt instance with the provided identifier, or undefined if not found.
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'identifier' implicitly has an 'any' typ... Remove this comment to see the full error message
    get(identifier) {
        // @ts-expect-error TS(2339) FIXME: Property 'identifier' does not exist on type 'neve... Remove this comment to see the full error message
        return this.collection.find(prompt => prompt.identifier === identifier);
    }

    /**
     * Retrieves the index of a Prompt instance in the collection by its identifier.
     * @param {string} identifier - The identifier of the Prompt instance to find.
     * @returns {number} The index of the Prompt instance in the collection, or -1 if not found.
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'identifier' implicitly has an 'any' typ... Remove this comment to see the full error message
    index(identifier) {
        // @ts-expect-error TS(2339) FIXME: Property 'identifier' does not exist on type 'neve... Remove this comment to see the full error message
        return this.collection.findIndex(prompt => prompt.identifier === identifier);
    }

    /**
     * Checks if a Prompt instance exists in the collection by its identifier.
     * @param {string} identifier - The identifier of the Prompt instance to check.
     * @returns {boolean} true if the Prompt instance exists in the collection, false otherwise.
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'identifier' implicitly has an 'any' typ... Remove this comment to see the full error message
    has(identifier) {
        return this.index(identifier) !== -1;
    }

    /**
     * Overrides a prompt at a specific position in the collection.
     * @param {Prompt} prompt - The Prompt instance to override.
     * @param {number} position - The position in the collection to override the Prompt instance.
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'prompt' implicitly has an 'any' type.
    override(prompt, position) {
        this.set(prompt, position);
        // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
        this.overriddenPrompts.push(prompt.identifier);
    }
}

class PromptManager {
    activeCharacter: object | null;
    configuration: Record<string, unknown>;
    containerElement: HTMLElement | null;
    error: string | null;
    handleAppendPrompt: () => void;
    handleCharacterExport: () => void;
    handleCharacterReset: () => void;
    handleDeletePrompt: (promptId: string) => void;
    handleDetach: () => void;
    handleEdit: (promptId: string) => void;
    handleFullExport: () => void;
    handleImport: () => void;
    handleInspect: () => void;
    handleNewPrompt: () => void;
    handleResetPrompt: () => void;
    handleSavePrompt: () => void;
    handleToggle: (promptId: string) => void;
    listElement: HTMLElement | null;
    messages: object | null;
    overridablePrompts: string[];
    overriddenPrompts: string[];
    renderDebounced: ReturnType<typeof debounce>;
    saveServiceSettings: () => Promise<void>;
    serviceSettings: object | null;
    systemPrompts: string[];
    tokenHandler: object | null;
    tokenUsage: number;
    tryGenerate: () => Promise<void>;
    get promptSources() {
        return {
            charDescription: t`Character Description`,
            charPersonality: t`Character Personality`,
            scenario: t`Character Scenario`,
            personaDescription: t`Persona Description`,
            worldInfoBefore: t`World Info (↑Char)`,
            worldInfoAfter: t`World Info (↓Char)`,
        };
    }

    constructor() {
        this.systemPrompts = [
            'main',
            'nsfw',
            'jailbreak',
            'enhanceDefinitions',
        ];

        this.overridablePrompts = [
            'main',
            'jailbreak',
        ];

        this.overriddenPrompts = [];

        this.configuration = {
            version: 1,
            prefix: '',
            containerIdentifier: '',
            listIdentifier: '',
            listItemTemplateIdentifier: '',
            toggleDisabled: [],
            promptOrder: {
                strategy: 'global',
                dummyId: 100000,
            },
            sortableDelay: 30,
            warningTokenThreshold: 1500,
            dangerTokenThreshold: 500,
            defaultPrompts: {
                main: '',
                nsfw: '',
                jailbreak: '',
                enhanceDefinitions: '',
            },
        };

        // Chatcompletion configuration object
        this.serviceSettings = null;

        // DOM element containing the prompt manager
        this.containerElement = null;

        // DOM element containing the prompt list
        this.listElement = null;

        // Currently selected character
        this.activeCharacter = null;

        // Message collection of the most recent chatcompletion
        this.messages = null;

        // The current token handler instance
        this.tokenHandler = null;

        // Token usage of last dry run
        this.tokenUsage = 0;

        // Error state, contains error message.
        this.error = null;

        /** Dry-run for generate, must return a promise  */
        this.tryGenerate = async () => { };

        /** Called to persist the configuration, must return a promise */
        this.saveServiceSettings = () => { return Promise.resolve(); };

        /** Toggle prompt button click */
        this.handleToggle = () => { };

        /** Prompt name click */
        this.handleInspect = () => { };

        /** Edit prompt button click */
        this.handleEdit = () => { };

        /** Detach prompt button click */
        this.handleDetach = () => { };

        /** Save prompt button click */
        this.handleSavePrompt = () => { };

        /** Reset prompt button click */
        this.handleResetPrompt = () => { };

        /** New prompt button click */
        this.handleNewPrompt = () => { };

        /** Delete prompt button click */
        this.handleDeletePrompt = () => { };

        /** Append prompt button click */
        this.handleAppendPrompt = () => { };

        /** Import button click */
        this.handleImport = () => { };

        /** Full export click */
        this.handleFullExport = () => { };

        /** Character export click */
        this.handleCharacterExport = () => { };

        /** Character reset button click*/
        this.handleCharacterReset = () => { };

        /** Debounced version of render */
        this.renderDebounced = debounce(this.render.bind(this), debounce_timeout.relaxed);
    }


    /**
     * Initializes the PromptManager with provided configuration and service settings.
     *
     * Sets up various handlers for user interactions, event listeners and initial rendering of prompts.
     * It is also responsible for preparing prompt edit form buttons, managing popup form close and clear actions.
     * @param {object} moduleConfiguration - Configuration object for the PromptManager.
     * @param {object} serviceSettings - Service settings object for the PromptManager.
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'moduleConfiguration' implicitly has an ... Remove this comment to see the full error message
    init(moduleConfiguration, serviceSettings) {
        this.configuration = Object.assign(this.configuration, moduleConfiguration);
        this.tokenHandler = this.tokenHandler || new TokenHandler(() => { throw new Error('Token handler not set'); });
        this.serviceSettings = serviceSettings;
        // @ts-expect-error TS(2345) FIXME: Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
        this.containerElement = document.getElementById(this.configuration.containerIdentifier);

        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        if ('global' === this.configuration.promptOrder.strategy) this.activeCharacter = { id: this.configuration.promptOrder.dummyId };

        this.sanitizeServiceSettings();

        // Enable and disable prompts
        this.handleToggle = (event) => {
            // @ts-expect-error TS(2339) FIXME: Property 'target' does not exist on type 'string'.
            const promptID = event.target.closest('.' + this.configuration.prefix + 'prompt_manager_prompt').dataset.pmIdentifier;
            const promptOrderEntry = this.getPromptOrderEntry(this.activeCharacter, promptID);
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            const counts = this.tokenHandler.getCounts();

            counts[promptID] = null;
            promptOrderEntry.enabled = !promptOrderEntry.enabled;
            this.render();
            this.saveServiceSettings();
        };

        // Open edit form and load selected prompt
        this.handleEdit = (event) => {
            this.clearEditForm();
            this.clearInspectForm();

            // @ts-expect-error TS(2339) FIXME: Property 'target' does not exist on type 'string'.
            const promptID = event.target.closest('.' + this.configuration.prefix + 'prompt_manager_prompt').dataset.pmIdentifier;
            const prompt = this.getPromptById(promptID);

            this.loadPromptIntoEditForm(prompt);

            this.showPopup();
        };

        // Open edit form and load selected prompt
        // @ts-expect-error TS(2322) FIXME: Type '(event: any) => void' is not assignable to t... Remove this comment to see the full error message
        this.handleInspect = (event) => {
            this.clearEditForm();
            this.clearInspectForm();

            const promptID = event.target.closest('.' + this.configuration.prefix + 'prompt_manager_prompt').dataset.pmIdentifier;
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            if (true === this.messages.hasItemWithIdentifier(promptID)) {
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                const messages = this.messages.getItemByIdentifier(promptID);

                this.loadMessagesIntoInspectForm(messages);

                this.showPopup('inspect');
            }
        };

        // Detach selected prompt from list form and close edit form
        // @ts-expect-error TS(2322) FIXME: Type '(event: any) => void' is not assignable to t... Remove this comment to see the full error message
        this.handleDetach = (event) => {
            if (null === this.activeCharacter) return;
            const promptID = event.target.closest('.' + this.configuration.prefix + 'prompt_manager_prompt').dataset.pmIdentifier;
            const prompt = this.getPromptById(promptID);

            this.detachPrompt(prompt, this.activeCharacter);
            this.hidePopup();
            this.clearEditForm();
            this.render();
            this.saveServiceSettings();
        };

        // Save prompt edit form to settings and close form.
        // @ts-expect-error TS(2322) FIXME: Type '(event: any) => void' is not assignable to t... Remove this comment to see the full error message
        this.handleSavePrompt = (event) => {
            const promptId = event.target.dataset.pmPrompt;
            const prompt = this.getPromptById(promptId);

            if (null === prompt) {
                const newPrompt = {};
                this.updatePromptWithPromptEditForm(newPrompt);
                this.addPrompt(newPrompt, promptId);
            } else {
                this.updatePromptWithPromptEditForm(prompt);
            }

            if ('main' === promptId) this.updateQuickEdit('main', prompt);
            if ('nsfw' === promptId) this.updateQuickEdit('nsfw', prompt);
            if ('jailbreak' === promptId) this.updateQuickEdit('jailbreak', prompt);

            this.log('Saved prompt: ' + promptId);

            this.hidePopup();
            this.clearEditForm();
            this.render();
            this.saveServiceSettings();
        };

        // Reset prompt should it be a system prompt
        // @ts-expect-error TS(2322) FIXME: Type '(event: any) => void' is not assignable to t... Remove this comment to see the full error message
        this.handleResetPrompt = (event) => {
            const promptId = event.target.dataset.pmPrompt;
            const prompt = this.getPromptById(promptId);
            const isPulledPrompt = Object.keys(this.promptSources).includes(promptId);

            switch (promptId) {
                case 'main':
                    prompt.name = 'Main Prompt';
                    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                    prompt.content = this.configuration.defaultPrompts.main;
                    prompt.forbid_overrides = false;
                    break;
                case 'nsfw':
                    prompt.name = 'Nsfw Prompt';
                    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                    prompt.content = this.configuration.defaultPrompts.nsfw;
                    break;
                case 'jailbreak':
                    prompt.name = 'Jailbreak Prompt';
                    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                    prompt.content = this.configuration.defaultPrompts.jailbreak;
                    prompt.forbid_overrides = false;
                    break;
                case 'enhanceDefinitions':
                    prompt.name = 'Enhance Definitions';
                    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                    prompt.content = this.configuration.defaultPrompts.enhanceDefinitions;
                    break;
            }

            const nameField = /** @type {HTMLInputElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_name'));
            const roleField = /** @type {HTMLSelectElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_role'));
            const promptField = /** @type {HTMLTextAreaElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_prompt'));
            const injectionPositionField = /** @type {HTMLSelectElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_injection_position'));
            const injectionDepthField = /** @type {HTMLInputElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_injection_depth'));
            const injectionOrderField = /** @type {HTMLInputElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_injection_order'));
            const injectionTriggerField = /** @type {HTMLSelectElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_injection_trigger'));
            const depthBlock = /** @type {HTMLDivElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_depth_block'));
            const orderBlock = /** @type {HTMLDivElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_order_block'));
            const forbidOverridesField = /** @type {HTMLInputElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_forbid_overrides'));
            const forbidOverridesBlock = /** @type {HTMLDivElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_forbid_overrides_block'));
            const entrySourceBlock = /** @type {HTMLDivElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_source_block'));
            const entrySource = /** @type {HTMLSpanElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_source'));

            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            nameField.value = prompt.name;
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            roleField.value = 'system';
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            promptField.value = prompt.content ?? '';
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            injectionPositionField.value = (prompt.injection_position ?? 0).toString();
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            injectionDepthField.value = (prompt.injection_depth ?? DEFAULT_DEPTH).toString();
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            injectionOrderField.value = (prompt.injection_order ?? DEFAULT_ORDER).toString();
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            Array.from(injectionTriggerField.options).forEach(option => {
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                option.selected = false;
            });
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            injectionTriggerField.dispatchEvent(new Event('change', { bubbles: true }));
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            depthBlock.style.visibility = prompt.injection_position === INJECTION_POSITION.ABSOLUTE ? 'visible' : 'hidden';
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            orderBlock.style.visibility = prompt.injection_position === INJECTION_POSITION.ABSOLUTE ? 'visible' : 'hidden';
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            forbidOverridesField.checked = prompt.forbid_overrides ?? false;
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            forbidOverridesBlock.style.visibility = this.overridablePrompts.includes(prompt.identifier) ? 'visible' : 'hidden';
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            promptField.disabled = prompt.marker ?? false;
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            entrySourceBlock.style.display = isPulledPrompt ? '' : 'none';

            if (isPulledPrompt) {
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                const sourceName = this.promptSources[promptId];
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                entrySource.textContent = sourceName;
            }
        };

        // Append prompt to selected character
        // @ts-expect-error TS(2322) FIXME: Type '(event: any) => void' is not assignable to t... Remove this comment to see the full error message
        this.handleAppendPrompt = (event) => {
            const appendPromptFooter = /** @type {HTMLSelectElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_footer_append_prompt'));
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            const promptID = appendPromptFooter.value;
            const prompt = this.getPromptById(promptID);

            if (prompt) {
                this.appendPrompt(prompt, this.activeCharacter);
                this.render();
                this.saveServiceSettings();
            }
        };

        // Delete selected prompt from list form and close edit form
        this.handleDeletePrompt = async (event) => {
            Popup.show.confirm(t`Are you sure you want to delete this prompt?`, null).then((userChoice) => {
                if (!userChoice) return;
                const appendPromptFooter = /** @type {HTMLSelectElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_footer_append_prompt'));
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                const promptID = appendPromptFooter.value;
                const prompt = this.getPromptById(promptID);

                if (prompt && true === this.isPromptDeletionAllowed(prompt)) {
                    const promptIndex = this.getPromptIndexById(promptID);
                    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                    this.serviceSettings.prompts.splice(Number(promptIndex), 1);

                    this.log('Deleted prompt: ' + prompt.identifier);

                    this.hidePopup();
                    this.clearEditForm();
                    this.render();
                    this.saveServiceSettings();
                }
            });
        };

        // Create new prompt, then save it to settings and close form.
        // @ts-expect-error TS(2322) FIXME: Type '(event: any) => void' is not assignable to t... Remove this comment to see the full error message
        this.handleNewPrompt = (event) => {
            const prompt = {
                identifier: this.getUuidv4(),
                name: '',
                role: 'system',
                content: '',
            };

            this.loadPromptIntoEditForm(prompt);
            this.showPopup();
        };

        // Export all user prompts
        this.handleFullExport = () => {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            const prompts = this.serviceSettings.prompts.reduce((userPrompts, prompt) => {
                if (false === prompt.system_prompt && false === prompt.marker) userPrompts.push(prompt);
                return userPrompts;
            }, []);

            let promptOrder = [];
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            if ('global' === this.configuration.promptOrder.strategy) {
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                promptOrder = this.getPromptOrderForCharacter({ id: this.configuration.promptOrder.dummyId });
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            } else if ('character' === this.configuration.promptOrder.strategy) {
                promptOrder = [];
            } else {
                throw new Error('Prompt order strategy not supported.');
            }

            const exportPrompts = {
                prompts: prompts,
                prompt_order: promptOrder,
            };

            this.export(exportPrompts, 'full', 'st-prompts');
        };

        // Export user prompts and order for this character
        this.handleCharacterExport = () => {
            // @ts-expect-error TS(7006) FIXME: Parameter 'userPrompts' implicitly has an 'any' ty... Remove this comment to see the full error message
            const characterPrompts = this.getPromptsForCharacter(this.activeCharacter).reduce((userPrompts, prompt) => {
                if (false === prompt.system_prompt && !prompt.marker) userPrompts.push(prompt);
                return userPrompts;
            }, []);

            const characterList = this.getPromptOrderForCharacter(this.activeCharacter);

            const exportPrompts = {
                prompts: characterPrompts,
                prompt_order: characterList,
            };

            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            const name = this.activeCharacter.name + '-prompts';
            this.export(exportPrompts, 'character', name);
        };

        // Import prompts for the selected character
        this.handleImport = () => {
            Popup.show.confirm(t`Existing prompts with the same ID will be overridden. Do you want to proceed?`, null)
                .then(userChoice => {
                    if (!userChoice) return;

                    const fileOpener = document.createElement('input');
                    fileOpener.type = 'file';
                    fileOpener.accept = '.json';

                    fileOpener.addEventListener('change', (event) => {
                        if (!(event.target instanceof HTMLInputElement)) return;
                        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                        const file = event.target.files[0];
                        if (!file) return;

                        const reader = new FileReader();

                        reader.onload = (event) => {
                            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                            const fileContent = event.target.result;

                            try {
                                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                                const data = JSON.parse(fileContent.toString());
                                this.import(data);
                            } catch (err) {
                                notyf.error(t`An error occurred while importing prompts. More info available in console.`);
                                console.log('An error occurred while importing prompts');
                                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                                console.log(err.toString());
                            }
                        };

                        reader.readAsText(file);
                    });

                    fileOpener.click();
                });
        };

        // Restore default state of a characters prompt order
        this.handleCharacterReset = () => {
            Popup.show.confirm(t`This will reset the prompt order for this character. You will not lose any prompts.`, null)
                .then(userChoice => {
                    if (!userChoice) return;

                    this.removePromptOrderForCharacter(this.activeCharacter);
                    this.addPromptOrderForCharacter(this.activeCharacter, promptManagerDefaultPromptOrder);

                    this.render();
                    this.saveServiceSettings();
                });
        };

        // Fill quick edit fields for the first time
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        if ('global' === this.configuration.promptOrder.strategy) {
            // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
            const handleQuickEditSave = (event) => {
                const promptId = event.target.dataset.pmPrompt;
                const prompt = this.getPromptById(promptId);

                prompt.content = event.target.value;

                // Update edit form if present
                // @see https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/offsetParent
                const popupEditFormPrompt = /** @type {HTMLTextAreaElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_prompt'));
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                if (popupEditFormPrompt.offsetParent) {
                    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                    popupEditFormPrompt.value = prompt.content;
                }

                this.log('Saved prompt: ' + promptId);
                this.saveServiceSettings().then(() => this.render());
            };

            const mainPrompt = this.getPromptById('main');
            const mainElementId = this.updateQuickEdit('main', mainPrompt);
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            document.getElementById(mainElementId).addEventListener('blur', handleQuickEditSave);

            const nsfwPrompt = this.getPromptById('nsfw');
            const nsfwElementId = this.updateQuickEdit('nsfw', nsfwPrompt);
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            document.getElementById(nsfwElementId).addEventListener('blur', handleQuickEditSave);

            const jailbreakPrompt = this.getPromptById('jailbreak');
            const jailbreakElementId = this.updateQuickEdit('jailbreak', jailbreakPrompt);
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            document.getElementById(jailbreakElementId).addEventListener('blur', handleQuickEditSave);
        }

        // Re-render when chat history changes.
        eventSource.on(event_types.MESSAGE_DELETED, () => this.renderDebounced());
        eventSource.on(event_types.MESSAGE_EDITED, () => this.renderDebounced());
        eventSource.on(event_types.MESSAGE_RECEIVED, () => this.renderDebounced());

        // Re-render when chatcompletion settings change
        eventSource.on(event_types.CHATCOMPLETION_SOURCE_CHANGED, () => this.renderDebounced());

        eventSource.on(event_types.CHATCOMPLETION_MODEL_CHANGED, () => this.renderDebounced());

        // Re-render when the character changes.
        // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
        eventSource.on(event_types.CHAT_LOADED, (event) => {
            this.handleCharacterSelected(event);
            this.saveServiceSettings().then(() => this.renderDebounced());
        });

        // Re-render when the character gets edited.
        // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
        eventSource.on(event_types.CHARACTER_EDITED, (event) => {
            this.handleCharacterUpdated(event);
            this.saveServiceSettings().then(() => this.renderDebounced());
        });

        // Re-render when the group changes.
        // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
        eventSource.on('groupSelected', (event) => {
            this.handleGroupSelected(event);
            this.saveServiceSettings().then(() => this.renderDebounced());
        });

        // Sanitize settings after character has been deleted.
        // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
        eventSource.on(event_types.CHARACTER_DELETED, (event) => {
            this.handleCharacterDeleted(event);
            this.saveServiceSettings().then(() => this.renderDebounced());
        });

        // Trigger re-render when token settings are changed
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('openai_max_context').addEventListener('change', (event) => {
            if (!(event.target instanceof HTMLInputElement)) return;
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            this.serviceSettings.openai_max_context = event.target.value;
            if (this.activeCharacter) this.renderDebounced();
        });

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('openai_max_tokens').addEventListener('change', (event) => {
            if (this.activeCharacter) this.renderDebounced();
        });

        // Prepare prompt edit form buttons
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_save').addEventListener('click', this.handleSavePrompt);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_reset').addEventListener('click', this.handleResetPrompt);

        const closeAndClearPopup = () => {
            this.hidePopup();
            this.clearEditForm();
            this.clearInspectForm();
        };

        // Clear forms on closing the popup
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_close').addEventListener('click', closeAndClearPopup);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById(this.configuration.prefix + 'prompt_manager_popup_close_button').addEventListener('click', closeAndClearPopup);
        closeAndClearPopup();

        // Re-render prompt manager on openai preset change
        eventSource.on(event_types.OAI_PRESET_CHANGED_AFTER, () => {
            this.sanitizeServiceSettings();
            const mainPrompt = this.getPromptById('main');
            this.updateQuickEdit('main', mainPrompt);

            const nsfwPrompt = this.getPromptById('nsfw');
            this.updateQuickEdit('nsfw', nsfwPrompt);

            const jailbreakPrompt = this.getPromptById('jailbreak');
            this.updateQuickEdit('jailbreak', jailbreakPrompt);

            this.hidePopup();
            this.clearEditForm();
            this.renderDebounced();
        });

        // Re-render prompt manager on world settings update
        eventSource.on(event_types.WORLDINFO_SETTINGS_UPDATED, () => this.renderDebounced());

        this.log('Initialized');
    }

    /**
     * Get the scroll position of the prompt manager
     * @returns {number} - Scroll position of the prompt manager
     */
    #getScrollPosition() {
        return document.getElementById(this.configuration.prefix + 'prompt_manager')?.closest('.scrollableInner')?.scrollTop;
    }

    /**
     * Set the scroll position of the prompt manager
     * @param {number} scrollPosition - The scroll position to set
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'scrollPosition' implicitly has an 'any'... Remove this comment to see the full error message
    #setScrollPosition(scrollPosition) {
        if (scrollPosition === undefined || scrollPosition === null) return;
        document.getElementById(this.configuration.prefix + 'prompt_manager')?.closest('.scrollableInner')?.scrollTo(0, scrollPosition);
    }

    /**
     * Main rendering function
     * @param afterTryGenerate - Whether a dry run should be attempted before rendering
     */
    render(afterTryGenerate = true) {
        if (main_api !== 'openai') return;

        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        if ('character' === this.configuration.promptOrder.strategy && null === this.activeCharacter) return;
        this.error = null;

        waitUntilCondition(() => !is_send_press && !is_group_generating, 1024 * 1024, 100).then(async () => {
            if (true === afterTryGenerate) {
                // Executed during dry-run for determining context composition
                this.profileStart('filling context');
                this.tryGenerate().finally(async () => {
                    this.profileEnd('filling context');
                    this.profileStart('render');
                    const scrollPosition = this.#getScrollPosition();
                    await this.renderPromptManager();
                    await this.renderPromptManagerListItems();
                    this.makeDraggable();
                    this.#setScrollPosition(scrollPosition);
                    this.profileEnd('render');
                });
            } else {
                // Executed during live communication
                this.profileStart('render');
                const scrollPosition = this.#getScrollPosition();
                await this.renderPromptManager();
                await this.renderPromptManagerListItems();
                this.makeDraggable();
                this.#setScrollPosition(scrollPosition);
                this.profileEnd('render');
            }
        }).catch(() => {
            console.log('Timeout while waiting for send press to be false');
        });
    }

    /**
     * Update a prompt with the values from the HTML form.
     * @param {Partial<Prompt>} prompt - The prompt to be updated.
     * @returns {void}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'prompt' implicitly has an 'any' type.
    updatePromptWithPromptEditForm(prompt) {
        const nameField = /** @type {HTMLInputElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_name'));
        const roleField = /** @type {HTMLSelectElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_role'));
        const promptField = /** @type {HTMLTextAreaElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_prompt'));
        const injectionPositionField = /** @type {HTMLSelectElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_injection_position'));
        const injectionDepthField = /** @type {HTMLInputElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_injection_depth'));
        const injectionOrderField = /** @type {HTMLInputElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_injection_order'));
        const injectionTriggerField = /** @type {HTMLSelectElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_injection_trigger'));
        const forbidOverridesField = /** @type {HTMLInputElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_forbid_overrides'));

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        prompt.name = nameField.value;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        prompt.role = roleField.value;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        prompt.content = promptField.value;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        prompt.injection_position = Number(injectionPositionField.value);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        prompt.injection_depth = Number(injectionDepthField.value);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        prompt.injection_order = Number(injectionOrderField.value);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        prompt.injection_trigger = Array.from(injectionTriggerField.selectedOptions).map(option => option.value);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        prompt.forbid_overrides = forbidOverridesField.checked;
    }

    /**
     * Find a prompt by its identifier and update it with the provided object.
     * @param {string} identifier - The identifier of the prompt.
     * @param {Prompt} updatePrompt - An object with properties to be updated in the prompt.
     * @returns {void}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'identifier' implicitly has an 'any' typ... Remove this comment to see the full error message
    updatePromptByIdentifier(identifier, updatePrompt) {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        let prompt = this.serviceSettings.prompts.find((item) => identifier === item.identifier);
        if (prompt) prompt = Object.assign(prompt, updatePrompt);
    }

    /**
     * Iterate over an array of prompts, find each one by its identifier, and update them with the provided data.
     * @param {Prompt[]} prompts - An array of prompt updates.
     * @returns {void}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'prompts' implicitly has an 'any' type.
    updatePrompts(prompts) {
        // @ts-expect-error TS(7006) FIXME: Parameter 'update' implicitly has an 'any' type.
        prompts.forEach((update) => {
            const prompt = this.getPromptById(update.identifier);
            if (prompt) Object.assign(prompt, update);
        });
    }

    getTokenHandler() {
        return this.tokenHandler;
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'identifier' implicitly has an 'any' typ... Remove this comment to see the full error message
    isPromptDisabledForActiveCharacter(identifier) {
        const promptOrderEntry = this.getPromptOrderEntry(this.activeCharacter, identifier);
        if (promptOrderEntry) return !promptOrderEntry.enabled;
        return false;
    }

    /**
     * Add a prompt to the current character's prompt list.
     * @param {Prompt} prompt - The prompt to be added.
     * @param {object} character - The character whose prompt list will be updated.
     * @returns {void}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'prompt' implicitly has an 'any' type.
    appendPrompt(prompt, character) {
        const promptOrder = this.getPromptOrderForCharacter(character);
        // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
        const index = promptOrder.findIndex(entry => entry.identifier === prompt.identifier);

        if (-1 === index) promptOrder.unshift({ identifier: prompt.identifier, enabled: false });
    }

    /**
     * Remove a prompt from the current character's prompt list.
     * @param {Prompt} prompt - The prompt to be removed.
     * @param {object} character - The character whose prompt list will be updated.
     * @returns {void}
     */
    // Remove a prompt from the current characters prompt list
    // @ts-expect-error TS(7006) FIXME: Parameter 'prompt' implicitly has an 'any' type.
    detachPrompt(prompt, character) {
        const promptOrder = this.getPromptOrderForCharacter(character);
        // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
        const index = promptOrder.findIndex(entry => entry.identifier === prompt.identifier);
        if (-1 === index) return;
        promptOrder.splice(index, 1);
    }

    /**
     * Create a new prompt and add it to the list of prompts.
     * @param {Partial<Prompt>} prompt - The prompt to be added.
     * @param {string} identifier - The identifier for the new prompt.
     * @returns {void}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'prompt' implicitly has an 'any' type.
    addPrompt(prompt, identifier) {
        if (typeof prompt !== 'object' || prompt === null) throw new Error('Object is not a prompt');

        const newPrompt = {
            identifier: identifier,
            system_prompt: false,
            enabled: false,
            marker: false,
            ...prompt,
        };

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.serviceSettings.prompts.push(newPrompt);
    }

    /**
     * Sanitize the service settings, ensuring each prompt has a unique identifier.
     * @returns {void}
     */
    sanitizeServiceSettings() {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.serviceSettings.prompts = this.serviceSettings.prompts ?? [];
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.serviceSettings.prompt_order = this.serviceSettings.prompt_order ?? [];

        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        if ('global' === this.configuration.promptOrder.strategy) {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            const dummyCharacter = { id: this.configuration.promptOrder.dummyId };
            const promptOrder = this.getPromptOrderForCharacter(dummyCharacter);

            if (0 === promptOrder.length) this.addPromptOrderForCharacter(dummyCharacter, promptManagerDefaultPromptOrder);
        }

        // Check whether the referenced prompts are present.
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (this.serviceSettings.prompts.length === 0) {
            this.setPrompts(chatCompletionDefaultPrompts.prompts);
        } else {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            this.checkForMissingPrompts(this.serviceSettings.prompts);
        }

        // Add identifiers if there are none assigned to a prompt
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.serviceSettings.prompts.forEach(prompt => prompt && (prompt.identifier = prompt.identifier ?? this.getUuidv4()));

        if (this.activeCharacter) {
            const promptReferences = this.getPromptOrderForCharacter(this.activeCharacter);
            for (let i = promptReferences.length - 1; i >= 0; i--) {
                const reference = promptReferences[i];
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                if (reference && -1 === this.serviceSettings.prompts.findIndex(prompt => prompt.identifier === reference.identifier)) {
                    promptReferences.splice(i, 1);
                    this.log('Removed unused reference: ' + reference.identifier);
                }
            }
        }
    }

    /**
     * Checks whether entries of a characters prompt order are orphaned
     * and if all mandatory system prompts for a character are present.
     * @param prompts
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'prompts' implicitly has an 'any' type.
    checkForMissingPrompts(prompts) {
        // @ts-expect-error TS(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
        const defaultPromptIdentifiers = chatCompletionDefaultPrompts.prompts.reduce((list, prompt) => { list.push(prompt.identifier); return list; }, []);

        const missingIdentifiers = defaultPromptIdentifiers.filter(identifier =>
            // @ts-expect-error TS(7006) FIXME: Parameter 'prompt' implicitly has an 'any' type.
            !prompts.some(prompt => prompt.identifier === identifier),
        );

        missingIdentifiers.forEach(identifier => {
            const defaultPrompt = chatCompletionDefaultPrompts.prompts.find(prompt => prompt?.identifier === identifier);
            if (defaultPrompt) {
                prompts.push(defaultPrompt);
                this.log(`Missing system prompt: ${defaultPrompt.identifier}. Added default.`);
            }
        });
    }

    /**
     * Check whether a prompt can be inspected.
     * @param {Prompt} prompt - The prompt to check.
     * @returns {boolean} True if the prompt is a marker, false otherwise.
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'prompt' implicitly has an 'any' type.
    isPromptInspectionAllowed(prompt) {
        return true;
    }

    /**
     * Check whether a prompt can be deleted. System prompts cannot be deleted.
     * @param {Prompt} prompt - The prompt to check.
     * @returns {boolean} True if the prompt can be deleted, false otherwise.
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'prompt' implicitly has an 'any' type.
    isPromptDeletionAllowed(prompt) {
        return false === prompt.system_prompt;
    }

    /**
     * Check whether a prompt can be edited.
     * @param {Prompt} prompt - The prompt to check.
     * @returns {boolean} True if the prompt can be edited, false otherwise.
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'prompt' implicitly has an 'any' type.
    isPromptEditAllowed(prompt) {
        const forceEditPrompts = [
            'charDescription',
            'charPersonality',
            'scenario',
            'personaDescription',
            'worldInfoBefore',
            'worldInfoAfter',
        ];
        return forceEditPrompts.includes(prompt.identifier) || !prompt.marker;
    }

    /**
     * Check whether a prompt can be toggled on or off.
     * @param {Prompt} prompt - The prompt to check.
     * @returns {boolean} True if the prompt can be deleted, false otherwise.
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'prompt' implicitly has an 'any' type.
    isPromptToggleAllowed(prompt) {
        const forceTogglePrompts = [
            'charDescription',
            'charPersonality',
            'scenario',
            'personaDescription',
            'worldInfoBefore',
            'worldInfoAfter',
            'main',
            'chatHistory',
            'dialogueExamples',
        ];
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        return prompt.marker && !forceTogglePrompts.includes(prompt.identifier) ? false : !this.configuration.toggleDisabled.includes(prompt.identifier);
    }

    /**
     * Handle the deletion of a character by removing their prompt list and nullifying the active character if it was the one deleted.
     * @param {object} event - The event object containing the character's ID.
     * @returns void
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    handleCharacterDeleted(event) {
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        if ('global' === this.configuration.promptOrder.strategy) return;
        this.removePromptOrderForCharacter(this.activeCharacter);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (this.activeCharacter.id === event.detail.id) this.activeCharacter = null;
    }

    /**
     * Handle the selection of a character by setting them as the active character and setting up their prompt list if necessary.
     * @param {object} event - The event object containing the character's ID and character data.
     * @returns {void}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    handleCharacterSelected(event) {
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        if ('global' === this.configuration.promptOrder.strategy) {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            this.activeCharacter = { id: this.configuration.promptOrder.dummyId };
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        } else if ('character' === this.configuration.promptOrder.strategy) {
            console.log('FOO');
            this.activeCharacter = { id: event.detail.id, ...event.detail.character };
            const promptOrder = this.getPromptOrderForCharacter(this.activeCharacter);

            // ToDo: These should be passed as parameter or attached to the manager as a set of default options.
            // Set default prompts and order for character.
            if (0 === promptOrder.length) this.addPromptOrderForCharacter(this.activeCharacter, promptManagerDefaultPromptOrder);
        } else {
            throw new Error('Unsupported prompt order mode.');
        }
    }

    /**
     * Set the most recently selected character
     * @param event
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    handleCharacterUpdated(event) {
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        if ('global' === this.configuration.promptOrder.strategy) {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            this.activeCharacter = { id: this.configuration.promptOrder.dummyId };
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        } else if ('character' === this.configuration.promptOrder.strategy) {
            this.activeCharacter = { id: event.detail.id, ...event.detail.character };
        } else {
            throw new Error('Prompt order strategy not supported.');
        }
    }

    /**
     * Set the most recently selected character group
     * @param event
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    handleGroupSelected(event) {
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        if ('global' === this.configuration.promptOrder.strategy) {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            this.activeCharacter = { id: this.configuration.promptOrder.dummyId };
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        } else if ('character' === this.configuration.promptOrder.strategy) {
            const characterDummy = { id: event.detail.id, group: event.detail.group };
            this.activeCharacter = characterDummy;
            const promptOrder = this.getPromptOrderForCharacter(characterDummy);

            if (0 === promptOrder.length) this.addPromptOrderForCharacter(characterDummy, promptManagerDefaultPromptOrder);
        } else {
            throw new Error('Prompt order strategy not supported.');
        }
    }

    /**
     * Get a list of group characters, regardless of whether they are active or not.
     * @returns {string[]}
     */
    getActiveGroupCharacters() {
        // ToDo: Ideally, this should return the actual characters.
        // @ts-expect-error TS(2339) FIXME: Property 'group' does not exist on type 'object'.
        return (this.activeCharacter?.group?.members || []).map(member => member && member.substring(0, member.lastIndexOf('.')));
    }

    /**
     * Get the prompts for a specific character. Can be filtered to only include enabled prompts.
     * @returns {Prompt[]} The prompts for the character.
     * @param character
     * @param onlyEnabled
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'character' implicitly has an 'any' type... Remove this comment to see the full error message
    getPromptsForCharacter(character, onlyEnabled = false) {
        return this.getPromptOrderForCharacter(character)
            // @ts-expect-error TS(7006) FIXME: Parameter 'item' implicitly has an 'any' type.
            .map(item => true === onlyEnabled ? (true === item.enabled ? this.getPromptById(item.identifier) : null) : this.getPromptById(item.identifier))
            // @ts-expect-error TS(7006) FIXME: Parameter 'prompt' implicitly has an 'any' type.
            .filter(prompt => null !== prompt);
    }

    /**
     * Get the order of prompts for a specific character. If no character is specified or the character doesn't have a prompt list, an empty array is returned.
     * @param {object|null} character - The character to get the prompt list for.
     * @returns {Partial<Prompt>[]} The prompt list for the character, or an empty array.
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'character' implicitly has an 'any' type... Remove this comment to see the full error message
    getPromptOrderForCharacter(character) {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        return !character ? [] : (this.serviceSettings.prompt_order.find(list => String(list.character_id) === String(character.id))?.order ?? []);
    }

    /**
     * Set the prompts for the manager.
     * @param {Partial<Prompt>[]} prompts - The prompts to be set.
     * @returns {void}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'prompts' implicitly has an 'any' type.
    setPrompts(prompts) {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.serviceSettings.prompts = prompts;
    }

    /**
     * Remove the prompt list for a specific character.
     * @param {object} character - The character whose prompt list will be removed.
     * @returns {void}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'character' implicitly has an 'any' type... Remove this comment to see the full error message
    removePromptOrderForCharacter(character) {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const index = this.serviceSettings.prompt_order.findIndex(list => String(list.character_id) === String(character.id));
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (-1 !== index) this.serviceSettings.prompt_order.splice(index, 1);
    }

    /**
     * Adds a new prompt list for a specific character.
     * @param {object} character - Object with at least an `id` property
     * @param {Array<object>} promptOrder - Array of prompt objects
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'character' implicitly has an 'any' type... Remove this comment to see the full error message
    addPromptOrderForCharacter(character, promptOrder) {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.serviceSettings.prompt_order.push({
            character_id: character.id,
            order: JSON.parse(JSON.stringify(promptOrder)),
        });
    }

    /**
     * Searches for a prompt list entry for a given character and identifier.
     * @param {object} character - Character object
     * @param {string} identifier - Identifier of the prompt list entry
     * @returns {object | null} The prompt list entry object, or null if not found
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'character' implicitly has an 'any' type... Remove this comment to see the full error message
    getPromptOrderEntry(character, identifier) {
        // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
        return this.getPromptOrderForCharacter(character).find(entry => entry.identifier === identifier) ?? null;
    }

    /**
     * Finds and returns a prompt by its identifier.
     * @param {string} identifier - Identifier of the prompt
     * @returns {Prompt|null} The prompt object, or null if not found
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'identifier' implicitly has an 'any' typ... Remove this comment to see the full error message
    getPromptById(identifier) {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        return this.serviceSettings.prompts.find(item => item && item.identifier === identifier) ?? null;
    }

    /**
     * Finds and returns the index of a prompt by its identifier.
     * @param {string} identifier - Identifier of the prompt
     * @returns {number|null} Index of the prompt, or null if not found
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'identifier' implicitly has an 'any' typ... Remove this comment to see the full error message
    getPromptIndexById(identifier) {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        return this.serviceSettings.prompts.findIndex(item => item.identifier === identifier) ?? null;
    }

    /**
     * Enriches a generic object, creating a new prompt object in the process
     * @param {Partial<Prompt>} prompt - Prompt object
     * @param original
     * @returns {Prompt} An object with "role" and "content" properties
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'prompt' implicitly has an 'any' type.
    preparePrompt(prompt, original = null) {
        const groupMembers = this.getActiveGroupCharacters();
        const preparedPrompt = new Prompt(prompt);

        if (typeof original === 'string') {
            if (0 < groupMembers.length) preparedPrompt.content = substituteParams(prompt.content ?? '', { original, groupOverride: groupMembers.join(', ') });
            else preparedPrompt.content = substituteParams(prompt.content, { original });
        } else {
            if (0 < groupMembers.length) preparedPrompt.content = substituteParams(prompt.content ?? '', { groupOverride: groupMembers.join(', ') });
            else preparedPrompt.content = substituteParams(prompt.content);
        }

        return preparedPrompt;
    }

    /**
     * Factory function for creating a QuickEdit object associated with a prompt element.
     *
     * The QuickEdit object provides methods to synchronize an input element's value with a prompt's content
     * and handle input events to update the prompt content.
     * @param identifier
     * @param title
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'identifier' implicitly has an 'any' typ... Remove this comment to see the full error message
    createQuickEdit(identifier, title) {
        const prompt = this.getPromptById(identifier);
        const textareaIdentifier = `${identifier}_prompt_quick_edit_textarea`;
        const html = `<div class="range-block m-t-1">
                        <div class="justifyLeft">${title}</div>
                        <div class="wide100p">
                            <textarea id="${textareaIdentifier}" class="text_pole textarea_compact" rows="6" placeholder="">${prompt.content}</textarea>
                        </div>
                    </div>`;

        const quickEditContainer = document.getElementById('quick-edit-container');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        quickEditContainer.insertAdjacentHTML('afterbegin', html);

        const debouncedSaveServiceSettings = debouncePromise(() => this.saveServiceSettings(), 300);

        const textarea = /** @type {HTMLTextAreaElement} */(document.getElementById(textareaIdentifier));
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        textarea.addEventListener('blur', () => {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            prompt.content = textarea.value;
            this.updatePromptByIdentifier(identifier, prompt);
            debouncedSaveServiceSettings().then(() => this.render());
        });
    }

    /**
     * Updates the quick edit textarea for a specific prompt.
     * @param {string} identifier - The identifier of the prompt.
     * @param {Prompt} prompt - The updated prompt object.
     * @returns {string} The ID of the updated textarea element.
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'identifier' implicitly has an 'any' typ... Remove this comment to see the full error message
    updateQuickEdit(identifier, prompt) {
        const elementId = `${identifier}_prompt_quick_edit_textarea`;
        const textarea = /** @type {HTMLTextAreaElement} */(document.getElementById(elementId));
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        textarea.value = prompt.content;

        return elementId;
    }

    /**
     * Checks if a given name is accepted by OpenAi API
     * @link https://platform.openai.com/docs/api-reference/chat/create
     * @param name
     * @returns {boolean}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
    isValidName(name) {
        const regex = /^[a-zA-Z0-9_]{1,64}$/;

        return regex.test(name);
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
    sanitizeName(name) {
        return name.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 64);
    }

    /**
     * Loads a given prompt into the edit form fields.
     * @param {Partial<Prompt>} prompt - Prompt object with properties 'name', 'role', 'content', and 'system_prompt'
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'prompt' implicitly has an 'any' type.
    loadPromptIntoEditForm(prompt) {
        const nameField = /** @type {HTMLInputElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_name'));
        const roleField = /** @type {HTMLSelectElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_role'));
        const promptField = /** @type {HTMLTextAreaElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_prompt'));
        const injectionPositionField = /** @type {HTMLSelectElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_injection_position'));
        const injectionDepthField = /** @type {HTMLInputElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_injection_depth'));
        const injectionOrderField = /** @type {HTMLInputElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_injection_order'));
        const injectionTriggerField = /** @type {HTMLSelectElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_injection_trigger'));
        const injectionDepthBlock = /** @type {HTMLDivElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_depth_block'));
        const injectionOrderBlock = /** @type {HTMLDivElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_order_block'));
        const forbidOverridesField = /** @type {HTMLInputElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_forbid_overrides'));
        const forbidOverridesBlock = /** @type {HTMLDivElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_forbid_overrides_block'));
        const entrySourceBlock = /** @type {HTMLDivElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_source_block'));
        const entrySource = /** @type {HTMLSpanElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_source'));
        const isPulledPrompt = Object.keys(this.promptSources).includes(prompt.identifier);

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        nameField.value = prompt.name ?? '';
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        roleField.value = prompt.role || 'system';
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        promptField.value = prompt.content ?? '';
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        promptField.disabled = prompt.marker ?? false;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        injectionPositionField.value = (prompt.injection_position ?? INJECTION_POSITION.RELATIVE).toString();
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        injectionDepthField.value = (prompt.injection_depth ?? DEFAULT_DEPTH).toString();
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        injectionOrderField.value = (prompt.injection_order ?? DEFAULT_ORDER).toString();
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        Array.from(injectionTriggerField.options).forEach(option => {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            option.selected = Array.isArray(prompt.injection_trigger) && prompt.injection_trigger.includes(option.value);
        });
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        injectionTriggerField.dispatchEvent(new Event('change', { bubbles: true }));
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        injectionDepthBlock.style.visibility = prompt.injection_position === INJECTION_POSITION.ABSOLUTE ? 'visible' : 'hidden';
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        injectionOrderBlock.style.visibility = prompt.injection_position === INJECTION_POSITION.ABSOLUTE ? 'visible' : 'hidden';
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        injectionPositionField.removeAttribute('disabled');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        forbidOverridesField.checked = prompt.forbid_overrides ?? false;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        forbidOverridesBlock.style.visibility = this.overridablePrompts.includes(prompt.identifier) ? 'visible' : 'hidden';
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        entrySourceBlock.style.display = isPulledPrompt ? '' : 'none';

        if (isPulledPrompt) {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            const sourceName = this.promptSources[prompt.identifier];
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            entrySource.textContent = sourceName;
        }

        const resetPromptButton = document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_reset');
        if (true === prompt.system_prompt) {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            resetPromptButton.style.display = 'block';
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            resetPromptButton.dataset.pmPrompt = prompt.identifier;
        } else {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            resetPromptButton.style.display = 'none';
        }

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        injectionPositionField.removeEventListener('change', (e) => this.handleInjectionPositionChange(e));
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        injectionPositionField.addEventListener('change', (e) => this.handleInjectionPositionChange(e));

        const savePromptButton = document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_save');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        savePromptButton.dataset.pmPrompt = prompt.identifier;
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    handleInjectionPositionChange(event) {
        const injectionDepthBlock = document.getElementById(this.configuration.prefix + 'prompt_manager_depth_block');
        const injectionOrderBlock = document.getElementById(this.configuration.prefix + 'prompt_manager_order_block');
        const injectionPosition = Number(event.target.value);
        if (injectionPosition === INJECTION_POSITION.ABSOLUTE) {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            injectionDepthBlock.style.visibility = 'visible';
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            injectionOrderBlock.style.visibility = 'visible';
        } else {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            injectionDepthBlock.style.visibility = 'hidden';
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            injectionOrderBlock.style.visibility = 'hidden';
        }
    }

    /**
     * Loads a given prompt into the inspect form
     * @param {MessageCollection} messages - Prompt object with properties 'name', 'role', 'content', and 'system_prompt'
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'messages' implicitly has an 'any' type.
    loadMessagesIntoInspectForm(messages) {
        if (!messages) return;

        // @ts-expect-error TS(7006) FIXME: Parameter 'message' implicitly has an 'any' type.
        const createInlineDrawer = (message) => {
            const truncatedTitle = message.content.length > 32 ? message.content.slice(0, 32) + '...' : message.content;
            const title = message.identifier || truncatedTitle;
            const role = message.role;
            const content = message.content || 'No Content';
            const tokens = message.getTokens();

            const drawerHTML = `
        <div class="inline-drawer ${this.configuration.prefix}prompt_manager_prompt">
            <div class="inline-drawer-toggle inline-drawer-header">
                <span>Name: ${escapeHtml(title)}, Role: ${role}, Tokens: ${tokens}</span>
                <div class="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
            </div>
            <div class="inline-drawer-content" style="white-space: pre-wrap;">${escapeHtml(content)}</div>
        </div>
        `;

            const template = document.createElement('template');
            template.innerHTML = drawerHTML.trim();
            return template.content.firstChild;
        };

        const messageList = document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_inspect_list');

        const messagesCollection = messages instanceof Message ? [messages] : messages.getCollection();

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (0 === messagesCollection.length) messageList.innerHTML = '<span>This marker does not contain any prompts.</span>';

        // @ts-expect-error TS(7006) FIXME: Parameter 'message' implicitly has an 'any' type.
        messagesCollection.forEach(message => {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            messageList.append(createInlineDrawer(message));
        });
    }

    /**
     * Clears all input fields in the edit form.
     */
    clearEditForm() {
        const editArea = document.getElementById(this.configuration.prefix + 'prompt_manager_popup_edit');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        editArea.style.display = 'none';

        const nameField = /** @type {HTMLInputElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_name'));
        const roleField = /** @type {HTMLSelectElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_role'));
        const promptField = /** @type {HTMLTextAreaElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_prompt'));
        const injectionPositionField = /** @type {HTMLSelectElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_injection_position'));
        const injectionDepthField = /** @type {HTMLInputElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_injection_depth'));
        const injectionDepthBlock = /** @type {HTMLDivElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_depth_block'));
        const injectionOrderBlock = /** @type {HTMLDivElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_order_block'));
        const injectionOrderField = /** @type {HTMLInputElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_injection_order'));
        const injectionTriggerField = /** @type {HTMLSelectElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_injection_trigger'));
        const forbidOverridesField = /** @type {HTMLInputElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_forbid_overrides'));
        const forbidOverridesBlock = /** @type {HTMLDivElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_forbid_overrides_block'));
        const entrySourceBlock = /** @type {HTMLDivElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_source_block'));
        const entrySource = /** @type {HTMLSpanElement} */(document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_source'));

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        nameField.value = '';
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        roleField.selectedIndex = 0;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        promptField.value = '';
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        promptField.disabled = false;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        injectionPositionField.selectedIndex = 0;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        injectionPositionField.removeAttribute('disabled');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        injectionDepthField.value = DEFAULT_DEPTH.toString();
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        injectionOrderField.value = DEFAULT_ORDER.toString();
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        injectionTriggerField.value = '';
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        injectionDepthBlock.style.visibility = 'unset';
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        injectionOrderBlock.style.visibility = 'unset';
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        forbidOverridesBlock.style.visibility = 'unset';
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        forbidOverridesField.checked = false;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        entrySourceBlock.style.display = 'none';
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        entrySource.textContent = '';

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        roleField.disabled = false;
    }

    clearInspectForm() {
        const inspectArea = document.getElementById(this.configuration.prefix + 'prompt_manager_popup_inspect');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        inspectArea.style.display = 'none';
        const messageList = document.getElementById(this.configuration.prefix + 'prompt_manager_popup_entry_form_inspect_list');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        messageList.innerHTML = '';
    }

    /**
     * Returns a full list of prompts whose content markers have been substituted.
     * @param {string} generationType - The type of generation, e.g., 'continue' or 'quiet'.
     * @returns {PromptCollection} A PromptCollection object
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'generationType' implicitly has an 'any'... Remove this comment to see the full error message
    getPromptCollection(generationType) {
        generationType = String(generationType || 'normal').toLowerCase().trim();
        const promptCollection = new PromptCollection();
        const promptOrder = this.getPromptOrderForCharacter(this.activeCharacter);

        // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
        promptOrder.forEach(entry => {
            const prompt = this.getPromptById(entry.identifier);
            const allowedTrigger = entry.enabled && this.shouldTrigger(prompt, generationType);

            if (!prompt) {
                return;
            }

            if (allowedTrigger) {
                promptCollection.add(this.preparePrompt(prompt));
            } else if (entry.identifier === 'main') {
                // Some extensions require main prompt to be present for relative inserts.
                // So we make a GMO-free vegan replacement.
                const replacementPrompt = structuredClone(prompt);
                replacementPrompt.content = '';
                promptCollection.add(this.preparePrompt(replacementPrompt));
            }
        });

        return promptCollection;
    }

    /**
     * Checks if a prompt should be triggered based on its injection triggers.
     * @param {Prompt} prompt - The prompt to check.
     * @param {string} generationType - The type of generation to check against.
     * @returns {boolean} True if the prompt should be triggered, false otherwise.
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'prompt' implicitly has an 'any' type.
    shouldTrigger(prompt, generationType) {
        if (!Array.isArray(prompt?.injection_trigger)) return true;
        if (!prompt.injection_trigger.length) return true;
        return prompt.injection_trigger.includes(generationType);
    }

    /**
     * Setter for messages property
     * @param {import('./openai.js').MessageCollection} messages
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'messages' implicitly has an 'any' type.
    setMessages(messages) {
        this.messages = messages;
    }

    /**
     * Set and process a finished chat completion object
     * @param {import('./openai.js').ChatCompletion} chatCompletion
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'chatCompletion' implicitly has an 'any'... Remove this comment to see the full error message
    setChatCompletion(chatCompletion) {
        const messages = chatCompletion.getMessages();

        this.setMessages(messages);
        this.populateTokenCounts(messages);
        this.overriddenPrompts = chatCompletion.getOverriddenPrompts();
    }

    /**
     * Populates the token handler
     * @param {import('./openai.js').MessageCollection} messages
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'messages' implicitly has an 'any' type.
    populateTokenCounts(messages) {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.tokenHandler.resetCounts();
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const counts = this.tokenHandler.getCounts();
        // @ts-expect-error TS(7006) FIXME: Parameter 'message' implicitly has an 'any' type.
        messages.getCollection().forEach(message => {
            counts[message.identifier] = message.getTokens();
        });

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.tokenUsage = this.tokenHandler.getTotal();

        this.log('Updated token usage with ' + this.tokenUsage);
    }

    /**
     * Empties, then re-assembles the container containing the prompt list.
     */
    async renderPromptManager() {
        let selectedPromptIndex = 0;
        const existingAppendSelect = document.getElementById(`${this.configuration.prefix}prompt_manager_footer_append_prompt`);
        if (existingAppendSelect instanceof HTMLSelectElement) {
            selectedPromptIndex = existingAppendSelect.selectedIndex;
        }
        const promptManagerDiv = this.containerElement;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        promptManagerDiv.innerHTML = '';

        const errorDiv = this.error ? `
                <div class="${this.configuration.prefix}prompt_manager_error">
                    <span class="fa-solid tooltip fa-triangle-exclamation text_danger"></span> ${DOMPurify.sanitize(this.error)}
                </div>
        ` : '';

        const totalActiveTokens = this.tokenUsage;

        const headerHtml = await renderTemplateAsync('promptManagerHeader', { error: this.error, errorDiv, prefix: this.configuration.prefix, totalActiveTokens });
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        promptManagerDiv.insertAdjacentHTML('beforeend', headerHtml);

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.listElement = promptManagerDiv.querySelector(`#${this.configuration.prefix}prompt_manager_list`);

        if (null !== this.activeCharacter) {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            const prompts = [...this.serviceSettings.prompts]
                .filter(prompt => prompt && !prompt?.system_prompt)
                .sort((promptA, promptB) => promptA.name.localeCompare(promptB.name));
            const promptsHtml = prompts.reduce((acc, prompt) => acc + `<option value="${prompt.identifier}">${escapeHtml(prompt.name)}</option>`, '');

            if (selectedPromptIndex > 0) {
                selectedPromptIndex = Math.min(selectedPromptIndex, prompts.length - 1);
            }

            if (selectedPromptIndex === -1 && prompts.length) {
                selectedPromptIndex = 0;
            }

            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            const rangeBlockDiv = promptManagerDiv.querySelector('.range-block');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            const headerDiv = promptManagerDiv.querySelector('.completion_prompt_manager_header');
            const footerHtml = await renderTemplateAsync('promptManagerFooter', { promptsHtml, prefix: this.configuration.prefix });
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            headerDiv.insertAdjacentHTML('afterend', footerHtml);
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            rangeBlockDiv.querySelector('#prompt-manager-reset-character').addEventListener('click', this.handleCharacterReset);

            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            const footerDiv = rangeBlockDiv.querySelector(`.${this.configuration.prefix}prompt_manager_footer`);
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            footerDiv.querySelector('.menu_button:nth-child(2)').addEventListener('click', this.handleAppendPrompt);
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            footerDiv.querySelector('.caution').addEventListener('click', this.handleDeletePrompt);
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            footerDiv.querySelector('.menu_button:last-child').addEventListener('click', this.handleNewPrompt);
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            footerDiv.querySelector('select').selectedIndex = selectedPromptIndex;

            // Add prompt export dialogue and options
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            footerDiv.querySelector('#prompt-manager-import').addEventListener('click', this.handleImport);
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            footerDiv.querySelector('#prompt-manager-export').addEventListener('click', this.handleFullExport);
        }
    }

    /**
     * Empties, then re-assembles the prompt list
     */
    async renderPromptManagerListItems() {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (!this.serviceSettings.prompts) return;

        const promptManagerList = this.listElement;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        promptManagerList.innerHTML = '';

        const { prefix } = this.configuration;

        let listItemHtml = await renderTemplateAsync('promptManagerListHeader', { prefix });

        // @ts-expect-error TS(7006) FIXME: Parameter 'prompt' implicitly has an 'any' type.
        this.getPromptsForCharacter(this.activeCharacter).forEach(prompt => {
            if (!prompt) return;

            const listEntry = this.getPromptOrderEntry(this.activeCharacter, prompt.identifier);
            const enabledClass = listEntry.enabled ? '' : `${prefix}prompt_manager_prompt_disabled`;
            const draggableClass = `${prefix}prompt_manager_prompt_draggable`;
            const markerClass = prompt.marker ? `${prefix}prompt_manager_marker` : '';
            // @ts-expect-error TS(2339) FIXME: Property 'getCounts' does not exist on type 'objec... Remove this comment to see the full error message
            const tokens = this.tokenHandler?.getCounts()[prompt.identifier] ?? 0;

            // Warn the user if the chat history goes below certain token thresholds.
            let warningClass = '';
            let warningTitle = '';

            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            const tokenBudget = this.serviceSettings.openai_max_context - this.serviceSettings.openai_max_tokens;
            if (this.tokenUsage > tokenBudget * 0.8 &&
                'chatHistory' === prompt.identifier) {
                const warningThreshold = this.configuration.warningTokenThreshold;
                const dangerThreshold = this.configuration.dangerTokenThreshold;

                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                if (tokens <= dangerThreshold) {
                    warningClass = 'fa-solid tooltip fa-triangle-exclamation text_danger';
                    warningTitle = 'Very little of your chat history is being sent, consider deactivating some other prompts.';
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                } else if (tokens <= warningThreshold) {
                    warningClass = 'fa-solid tooltip fa-triangle-exclamation text_warning';
                    warningTitle = 'Only a few messages worth chat history are being sent.';
                }
            }

            const calculatedTokens = tokens ? tokens : '-';

            let detachSpanHtml = '';
            if (this.isPromptDeletionAllowed(prompt)) {
                detachSpanHtml = `
                    <span title="Remove" class="prompt-manager-detach-action caution fa-solid fa-chain-broken fa-xs"></span>
                `;
            } else {
                detachSpanHtml = '<span class="fa-solid"></span>';
            }

            let editSpanHtml = '';
            if (this.isPromptEditAllowed(prompt)) {
                editSpanHtml = `
                    <span title="edit" class="prompt-manager-edit-action fa-solid fa-pencil fa-xs"></span>
                `;
            } else {
                editSpanHtml = '<span class="fa-solid"></span>';
            }

            let toggleSpanHtml = '';
            if (this.isPromptToggleAllowed(prompt)) {
                toggleSpanHtml = `
                    <span class="prompt-manager-toggle-action ${listEntry.enabled ? 'fa-solid fa-toggle-on' : 'fa-solid fa-toggle-off'}"></span>
                `;
            } else {
                toggleSpanHtml = '<span class="fa-solid"></span>';
            }

            const encodedName = escapeHtml(prompt.name);
            const isMarkerPrompt = prompt.marker && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE;
            const isSystemPrompt = !prompt.marker && prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE && !prompt.forbid_overrides;
            const isImportantPrompt = !prompt.marker && prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE && prompt.forbid_overrides;
            const isUserPrompt = !prompt.marker && !prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE;
            const isInjectionPrompt = prompt.injection_position === INJECTION_POSITION.ABSOLUTE;
            const isOverriddenPrompt = Array.isArray(this.overriddenPrompts) && this.overriddenPrompts.includes(prompt.identifier);
            const importantClass = isImportantPrompt ? `${prefix}prompt_manager_important` : '';
            const iconLookup = prompt.role === 'system' && (prompt.marker || prompt.system_prompt) ? '' : prompt.role;

            //add role icons to the right of prompt name
            const promptRoles = {
                assistant: { roleIcon: 'fa-robot', roleTitle: 'Prompt will be sent as Assistant' },
                user: { roleIcon: 'fa-user', roleTitle: 'Prompt will be sent as User' },
            };
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            const roleIcon = promptRoles[iconLookup]?.roleIcon || '';
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            const roleTitle = promptRoles[iconLookup]?.roleTitle || '';

            listItemHtml += `
                <li class="${prefix}prompt_manager_prompt ${draggableClass} ${enabledClass} ${markerClass} ${importantClass}" data-pm-identifier="${escapeHtml(prompt.identifier)}">
                    <span class="drag-handle">☰</span>
                    <span class="${prefix}prompt_manager_prompt_name" data-pm-name="${encodedName}">
                        ${isMarkerPrompt ? '<span class="fa-fw fa-solid fa-thumb-tack" title="Marker"></span>' : ''}
                        ${isSystemPrompt ? '<span class="fa-fw fa-solid fa-square-poll-horizontal" title="Global Prompt"></span>' : ''}
                        ${isImportantPrompt ? '<span class="fa-fw fa-solid fa-star" title="Important Prompt"></span>' : ''}
                        ${isUserPrompt ? '<span class="fa-fw fa-solid fa-asterisk" title="Preset Prompt"></span>' : ''}
                        ${isInjectionPrompt ? '<span class="fa-fw fa-solid fa-syringe" title="In-Chat Injection"></span>' : ''}
                        ${this.isPromptInspectionAllowed(prompt) ? `<a title="${encodedName}" class="prompt-manager-inspect-action">${encodedName}</a>` : `<span title="${encodedName}">${encodedName}</span>`}
                        ${roleIcon ? `<span data-role="${escapeHtml(prompt.role)}" class="fa-xs fa-solid ${roleIcon}" title="${roleTitle}"></span>` : ''}
                        ${isInjectionPrompt ? `<small class="prompt-manager-injection-depth">@ ${escapeHtml(prompt.injection_depth.toString())}</small>` : ''}
                        ${isOverriddenPrompt ? '<small class="fa-solid fa-address-card prompt-manager-overridden" title="Pulled from a character card"></small>' : ''}
                    </span>
                    <span>
                            <span class="prompt_manager_prompt_controls">
                                ${detachSpanHtml}
                                ${editSpanHtml}
                                ${toggleSpanHtml}
                            </span>
                    </span>

                    <span class="prompt_manager_prompt_tokens" data-pm-tokens="${calculatedTokens}"><span class="${warningClass}" title="${warningTitle}"> </span>${calculatedTokens}</span>
                </li>
            `;
        });

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        promptManagerList.insertAdjacentHTML('beforeend', listItemHtml);

        // Now that the new elements are in the DOM, you can add the event listeners.
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        Array.from(promptManagerList.getElementsByClassName('prompt-manager-detach-action')).forEach(el => {
            el.addEventListener('click', this.handleDetach);
        });

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        Array.from(promptManagerList.getElementsByClassName('prompt-manager-inspect-action')).forEach(el => {
            el.addEventListener('click', this.handleInspect);
        });

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        Array.from(promptManagerList.getElementsByClassName('prompt-manager-edit-action')).forEach(el => {
            // @ts-expect-error TS(2769) FIXME: No overload matches this call.
            el.addEventListener('click', this.handleEdit);
        });

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        Array.from(promptManagerList.querySelectorAll('.prompt-manager-toggle-action')).forEach(el => {
            // @ts-expect-error TS(2769) FIXME: No overload matches this call.
            el.addEventListener('click', this.handleToggle);
        });
    }

    /**
     * Writes the passed data to a json file
     * @param data
     * @param type
     * @param name
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
    export(data, type, name = 'export') {
        const promptExport = {
            version: this.configuration.version,
            type: type,
            data: data,
        };

        const serializedObject = JSON.stringify(promptExport, null, 4);
        const blob = new Blob([serializedObject], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;

        const dateString = this.getFormattedDate();
        downloadLink.download = `${name}-${dateString}.json`;

        downloadLink.click();

        URL.revokeObjectURL(url);
    }

    /**
     * Imports a json file with prompts and an optional prompt list for the active character
     * @param importData
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'importData' implicitly has an 'any' typ... Remove this comment to see the full error message
    import(importData) {
        // @ts-expect-error TS(7006) FIXME: Parameter 'prompts' implicitly has an 'any' type.
        const mergeKeepNewer = (prompts, newPrompts) => {
            let merged = [...prompts, ...newPrompts];

            const map = new Map();
            for (const obj of merged) {
                map.set(obj.identifier, obj);
            }

            merged = Array.from(map.values());

            return merged;
        };

        const controlObj = {
            version: 1,
            type: '',
            data: {
                prompts: [],
                prompt_order: null,
            },
        };

        if (false === this.validateObject(controlObj, importData)) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            notyf.warning(t`Could not import prompts. Export failed validation.`);
            return;
        }

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const prompts = mergeKeepNewer(this.serviceSettings.prompts, importData.data.prompts);

        this.setPrompts(prompts);
        this.log('Prompt import succeeded');

        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        if ('global' === this.configuration.promptOrder.strategy) {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            const promptOrder = this.getPromptOrderForCharacter({ id: this.configuration.promptOrder.dummyId });
            Object.assign(promptOrder, importData.data.prompt_order);
            this.log('Prompt order import succeeded');
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        } else if ('character' === this.configuration.promptOrder.strategy) {
            if ('character' === importData.type) {
                const promptOrder = this.getPromptOrderForCharacter(this.activeCharacter);
                Object.assign(promptOrder, importData.data.prompt_order);
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                this.log(`Prompt order import for character ${this.activeCharacter.name} succeeded`);
            }
        } else {
            throw new Error('Prompt order strategy not supported.');
        }

        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        notyf.success(t`Prompt import complete.`);
        this.saveServiceSettings().then(() => this.render());
    }

    /**
     * Helper function to check whether the structure of object matches controlObj
     * @param controlObj
     * @param object
     * @returns {boolean}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'controlObj' implicitly has an 'any' typ... Remove this comment to see the full error message
    validateObject(controlObj, object) {
        for (const key in controlObj) {
            if (!Object.hasOwn(object, key)) {
                if (controlObj[key] === null) continue;
                else return false;
            }

            if (typeof controlObj[key] === 'object' && controlObj[key] !== null) {
                if (typeof object[key] !== 'object') return false;
                if (!this.validateObject(controlObj[key], object[key])) return false;
            } else {
                if (typeof object[key] !== typeof controlObj[key]) return false;
            }
        }

        return true;
    }

    /**
     * Get current date as mm/dd/YYYY
     * @returns {`${string}_${string}_${string}`}
     */
    getFormattedDate() {
        const date = new Date();
        let month = String(date.getMonth() + 1);
        let day = String(date.getDate());
        const year = String(date.getFullYear());

        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;

        return `${month}_${day}_${year}`;
    }

    /**
     * Makes the prompt list draggable and handles swapping of two entries in the list.
     * @typedef {object} Entry
     * @property {string} identifier
     * @returns {void}
     */
    makeDraggable() {
        const listEl = document.getElementById(`${this.configuration.prefix}prompt_manager_list`);
        if (!listEl) return;
        const sortableInstance = new Sortable(listEl, {
            delay: this.configuration.sortableDelay,
            handle: isMobile() ? '.drag-handle' : undefined,
            dataIdAttr: 'data-pm-identifier',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onUpdate: (event: any, ui: any) => {
                const promptOrder = this.getPromptOrderForCharacter(this.activeCharacter);
                const promptListElement = sortableInstance;
                // @ts-expect-error TS(7006) FIXME: Parameter 'prompt' implicitly has an 'any' type.
                const idToObjectMap = new Map(promptOrder.map(prompt => [prompt.identifier, prompt]));
                // @ts-expect-error TS(7006) FIXME: Parameter 'identifier' implicitly has an 'any' typ... Remove this comment to see the full error message
                const updatedPromptOrder = promptListElement.map(identifier => idToObjectMap.get(identifier));

                this.removePromptOrderForCharacter(this.activeCharacter);
                this.addPromptOrderForCharacter(this.activeCharacter, updatedPromptOrder);

                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                this.log(`Prompt order updated for ${this.activeCharacter.name}.`);

                this.saveServiceSettings();
            },
        });
    }

    /**
     * Slides down the edit form and adds the class 'openDrawer' to the first element of '#openai_prompt_manager_popup'.
     * @param area
     * @returns {void}
     */
    showPopup(area = 'edit') {
        const areaElement = document.getElementById(this.configuration.prefix + 'prompt_manager_popup_' + area);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        areaElement.style.display = 'flex';

        const popupEl = document.getElementById(this.configuration.prefix + 'prompt_manager_popup');
        if (popupEl) {
            popupEl.style.maxHeight = popupEl.scrollHeight + 'px';
            popupEl.style.opacity = '1';
            popupEl.classList.add('openDrawer');
        }
    }

    /**
     * Slides up the edit form and removes the class 'openDrawer' from the first element of '#openai_prompt_manager_popup'.
     * @returns {void}
     */
    hidePopup() {
        const popupEl = document.getElementById(this.configuration.prefix + 'prompt_manager_popup');
        if (popupEl) {
            popupEl.style.maxHeight = '0';
            popupEl.style.opacity = '0';
            popupEl.classList.remove('openDrawer');
        }
    }

    /**
     * Quick uuid4 implementation
     * @returns {string} A string representation of an uuid4
     */
    getUuidv4() {
        return uuidv4();
    }

    /**
     * Write to console with prefix
     * @param output
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'output' implicitly has an 'any' type.
    log(output) {
        if (power_user.console_log_prompts) console.log('[PromptManager] ' + output);
    }

    /**
     * Start a profiling task
     * @param identifier
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'identifier' implicitly has an 'any' typ... Remove this comment to see the full error message
    profileStart(identifier) {
        if (power_user.console_log_prompts) console.time(identifier);
    }

    /**
     * End a profiling task
     * @param identifier
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'identifier' implicitly has an 'any' typ... Remove this comment to see the full error message
    profileEnd(identifier) {
        if (power_user.console_log_prompts) {
            this.log('Profiling of "' + identifier + '" finished. Result below.');
            console.timeEnd(identifier);
        }
    }
}

const chatCompletionDefaultPrompts = {
    'prompts': [
        {
            'name': 'Main Prompt',
            'system_prompt': true,
            'role': 'system',
            'content': 'Write {{char}}\'s next reply in a fictional chat between {{charIfNotGroup}} and {{user}}.',
            'identifier': 'main',
        },
        {
            'name': 'Auxiliary Prompt',
            'system_prompt': true,
            'role': 'system',
            'content': '',
            'identifier': 'nsfw',
        },
        {
            'identifier': 'dialogueExamples',
            'name': 'Chat Examples',
            'system_prompt': true,
            'marker': true,
        },
        {
            'name': 'Post-History Instructions',
            'system_prompt': true,
            'role': 'system',
            'content': '',
            'identifier': 'jailbreak',
        },
        {
            'identifier': 'chatHistory',
            'name': 'Chat History',
            'system_prompt': true,
            'marker': true,
        },
        {
            'identifier': 'worldInfoAfter',
            'name': 'World Info (after)',
            'system_prompt': true,
            'marker': true,
        },
        {
            'identifier': 'worldInfoBefore',
            'name': 'World Info (before)',
            'system_prompt': true,
            'marker': true,
        },
        {
            'identifier': 'enhanceDefinitions',
            'role': 'system',
            'name': 'Enhance Definitions',
            'content': 'If you have more knowledge of {{char}}, add to the character\'s lore and personality to enhance them but keep the Character Sheet\'s definitions absolute.',
            'system_prompt': true,
            'marker': false,
        },
        {
            'identifier': 'charDescription',
            'name': 'Char Description',
            'system_prompt': true,
            'marker': true,
        },
        {
            'identifier': 'charPersonality',
            'name': 'Char Personality',
            'system_prompt': true,
            'marker': true,
        },
        {
            'identifier': 'scenario',
            'name': 'Scenario',
            'system_prompt': true,
            'marker': true,
        },
        {
            'identifier': 'personaDescription',
            'name': 'Persona Description',
            'system_prompt': true,
            'marker': true,
        },
    ],
};

const promptManagerDefaultPromptOrders = {
    'prompt_order': [],
};

const promptManagerDefaultPromptOrder = [
    {
        'identifier': 'main',
        'enabled': true,
    },
    {
        'identifier': 'worldInfoBefore',
        'enabled': true,
    },
    {
        'identifier': 'personaDescription',
        'enabled': true,
    },
    {
        'identifier': 'charDescription',
        'enabled': true,
    },
    {
        'identifier': 'charPersonality',
        'enabled': true,
    },
    {
        'identifier': 'scenario',
        'enabled': true,
    },
    {
        'identifier': 'enhanceDefinitions',
        'enabled': false,
    },
    {
        'identifier': 'nsfw',
        'enabled': true,
    },
    {
        'identifier': 'worldInfoAfter',
        'enabled': true,
    },
    {
        'identifier': 'dialogueExamples',
        'enabled': true,
    },
    {
        'identifier': 'chatHistory',
        'enabled': true,
    },
    {
        'identifier': 'jailbreak',
        'enabled': true,
    },
];

export {
    PromptManager,
    registerPromptManagerMigration,
    chatCompletionDefaultPrompts,
    promptManagerDefaultPromptOrders,
    Prompt,
};
