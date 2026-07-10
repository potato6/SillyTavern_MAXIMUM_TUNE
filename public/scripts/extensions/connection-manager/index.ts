import { DOMPurify, Fuse } from '../../../lib.js';
declare const $: any; declare const toastr: any;

import { activateSendButtons, deactivateSendButtons, event_types, eventSource, main_api, online_status, saveSettingsDebounced } from '../../../script.js';
import { extension_settings, getContext, renderExtensionTemplateAsync } from '../../extensions.js';
import { callGenericPopup, Popup, POPUP_RESULT, POPUP_TYPE } from '../../popup.js';
import { SlashCommand } from '../../slash-commands/SlashCommand.js';
import { SlashCommandAbortController } from '../../slash-commands/SlashCommandAbortController.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../slash-commands/SlashCommandArgument.js';
import { commonEnumProviders, enumIcons } from '../../slash-commands/SlashCommandCommonEnumsProvider.js';
import { SlashCommandDebugController } from '../../slash-commands/SlashCommandDebugController.js';
import { enumTypes, SlashCommandEnumValue } from '../../slash-commands/SlashCommandEnumValue.js';
import { SlashCommandClosure } from '../../slash-commands/SlashCommandClosure.js';
import { SlashCommandParser } from '../../slash-commands/SlashCommandParser.js';
import { SlashCommandScope } from '../../slash-commands/SlashCommandScope.js';
import { collapseSpaces, getUniqueName, isFalseBoolean, isTrueBoolean, uuidv4, waitUntilCondition } from '../../utils.js';
import { t } from '../../i18n.js';
import { getSecretLabelById } from '../../secrets.js';
// @ts-expect-error TS(2792): Cannot find module '/scripts/power-user.js'. Did y... Remove this comment to see the full error message
import { performFuzzySearch } from '/scripts/power-user.js';
// @ts-expect-error TS(2792): Cannot find module '/scripts/streaming-display.js'... Remove this comment to see the full error message
import { StreamingDisplay } from '/scripts/streaming-display.js';
import { ConnectionManagerRequestService } from '../shared.js';
// @ts-expect-error TS(2792): Cannot find module '/scripts/reasoning.js'. Did yo... Remove this comment to see the full error message
import { formatReasoning } from '/scripts/reasoning.js';

const MODULE_NAME = 'connection-manager';
const NONE = '<None>';
const EMPTY = '<Empty>';

const DEFAULT_SETTINGS = {
    profiles: [],
    selectedProfile: null,
};

// Commands that can record an empty value into the profile
const ALLOW_EMPTY = [
    'stop-strings',
    'start-reply-with',
];

const CC_COMMANDS = [
    'api',
    'preset',
    // Do not fix; CC needs to set the API twice because it could be overridden by the preset
    'api',
    'api-url',
    'model',
    'proxy',
    'stop-strings',
    'start-reply-with',
    'reasoning-template',
    'prompt-post-processing',
    'secret-id',
    'regex-preset',
];

const TC_COMMANDS = [
    'api',
    'preset',
    'api-url',
    'model',
    'sysprompt',
    'sysprompt-state',
    'instruct',
    'context',
    'instruct-state',
    'tokenizer',
    'stop-strings',
    'start-reply-with',
    'reasoning-template',
    'secret-id',
    'regex-preset',
];

const FANCY_NAMES = {
    'api': 'API',
    'api-url': 'Server URL',
    'preset': 'Settings Preset',
    'model': 'Model',
    'proxy': 'Proxy Preset',
    'sysprompt-state': 'Use System Prompt',
    'sysprompt': 'System Prompt Name',
    'instruct-state': 'Instruct Mode',
    'instruct': 'Instruct Template',
    'context': 'Context Template',
    'tokenizer': 'Tokenizer',
    'stop-strings': 'Custom Stopping Strings',
    'start-reply-with': 'Start Reply With',
    'reasoning-template': 'Reasoning Template',
    'prompt-post-processing': 'Prompt Post-Processing',
    'secret-id': 'Secret',
    'regex-preset': 'Regex Preset',
};

/**
 * A wrapper for the connection manager spinner.
 */
class ConnectionManagerSpinner {
    /**
     * @type {AbortController[]}
     */
    static abortControllers = [];

    /** @type {HTMLElement} */
    spinnerElement;

    /** @type {AbortController} */
    abortController = new AbortController();

    constructor() {
        // @ts-ignore
        this.spinnerElement = document.getElementById('connection_profile_spinner');
        this.abortController = new AbortController();
    }

    start() {
        // @ts-expect-error TS(2345): Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
        ConnectionManagerSpinner.abortControllers.push(this.abortController);
        // @ts-expect-error TS(2531): Object is possibly 'null'.
        this.spinnerElement.classList.remove('hidden');
    }

    stop() {
        // @ts-expect-error TS(2531): Object is possibly 'null'.
        this.spinnerElement.classList.add('hidden');
    }

    isAborted() {
        return this.abortController.signal.aborted;
    }

    static abort() {
        for (const controller of ConnectionManagerSpinner.abortControllers) {
            // @ts-expect-error TS(2339): Property 'abort' does not exist on type 'never'.
            controller.abort();
        }
        ConnectionManagerSpinner.abortControllers = [];
    }
}

/**
 * Get named arguments for the command callback.
 * @param {object} [args] Additional named arguments
 * @param {string} [args.force] Whether to force setting the value
 * @returns {object} Named arguments
 */
function getNamedArguments(args = {}) {
    // None of the commands here use underscored args, but better safe than sorry
    return {
        // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
        _scope: new SlashCommandScope(),
        _abortController: new SlashCommandAbortController(),
        _debugController: new SlashCommandDebugController(),
        _parserFlags: {},
        _hasUnnamedArgument: false,
        quiet: 'true',
        ...args,
    };
}

/** @type {() => SlashCommandEnumValue[]} */
const profilesProvider = () => [
    new SlashCommandEnumValue(NONE),
    // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
    ...extension_settings.connectionManager.profiles.map(p => new SlashCommandEnumValue(p.name, null, enumTypes.name, enumIcons.server)),
];

/**
 * @typedef {Object} ConnectionProfile
 * @property {string} id Unique identifier
 * @property {string} mode Mode of the connection profile
 * @property {string} [name] Name of the connection profile
 * @property {string} [api] API
 * @property {string} [preset] Settings Preset
 * @property {string} [model] Model
 * @property {string} [proxy] Proxy Preset
 * @property {string} [instruct] Instruct Template
 * @property {string} [context] Context Template
 * @property {string} [instruct-state] Instruct Mode
 * @property {string} [tokenizer] Tokenizer
 * @property {string} [stop-strings] Custom Stopping Strings
 * @property {string} [start-reply-with] Start Reply With
 * @property {string} [reasoning-template] Reasoning Template
 * @property {string} [prompt-post-processing] Prompt Post-Processing
 * @property {string} [sysprompt] System Prompt Name
 * @property {string} [sysprompt-state] Use System Prompt
 * @property {string} [api-url] Server URL
 * @property {string} [secret-id] Secret ID
 * @property {string} [regex-preset] Regex Preset ID
 * @property {string[]} [exclude] Commands to exclude
 */

/**
 * Finds the best match for the search value.
 * @param {string} value Search value
 * @returns {ConnectionProfile|null} Best match or null
 */
function findProfileByName(value: any) {
    // Try to find exact match
    // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
    const profile = extension_settings.connectionManager.profiles.find(p => p.name === value);

    if (profile) {
        return profile;
    }

    // Try to find fuzzy match
    const fuse = new Fuse(extension_settings.connectionManager.profiles, { keys: ['name'] });
    const results = fuse.search(value);

    if (results.length === 0) {
        return null;
    }

    const bestMatch = results[0];
    return bestMatch?.item;
}

/**
 * Reads the connection profile from the commands.
 * @param {string} mode Mode of the connection profile
 * @param {ConnectionProfile} profile Connection profile
 * @param {boolean} [cleanUp] Whether to clean up the profile
 */
async function readProfileFromCommands(mode: any, profile: any, cleanUp = false) {
    const commands = mode === 'cc' ? CC_COMMANDS : TC_COMMANDS;
    const opposingCommands = mode === 'cc' ? TC_COMMANDS : CC_COMMANDS;
    const excludeList = Array.isArray(profile.exclude) ? profile.exclude : [];
    for (const command of commands) {
        try {
            if (excludeList.includes(command)) {
                continue;
            }

            const allowEmpty = ALLOW_EMPTY.includes(command);
            const args = getNamedArguments();
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            const result = await SlashCommandParser.commands[command].callback(args, '');
            if (result || (allowEmpty && result === '')) {
                profile[command] = result;
                continue;
            }
        } catch (error) {
            console.error(`Failed to execute command: ${command}`, error);
        }
    }

    if (cleanUp) {
        for (const command of commands) {
            if (command.endsWith('-state') && profile[command] === 'false') {
                delete profile[command.replace('-state', '')];
            }
        }
        for (const command of opposingCommands) {
            if (commands.includes(command)) {
                continue;
            }

            delete profile[command];
        }
    }
}

/**
 * Creates a new connection profile.
 * @param {string} [forceName] Name of the connection profile
 * @returns {Promise<ConnectionProfile>} Created connection profile
 */
async function createConnectionProfile(forceName = null) {
    const mode = main_api === 'openai' ? 'cc' : 'tc';
    const id = uuidv4();
    /** @type {ConnectionProfile} */
    const profile = {
        id,
        mode,
        exclude: [],
    };

    await readProfileFromCommands(mode, profile);

    const profileForDisplay = makeFancyProfile(profile);
    const template = $(await renderExtensionTemplateAsync(MODULE_NAME, 'profile', { profile: profileForDisplay }));
    template.find('input[name="exclude"]').on('input', function(this: any) {
        const fancyName = String($(this).val());
        const keyName = Object.entries(FANCY_NAMES).find(x => x[1] === fancyName)?.[0];
        if (!keyName) {
            console.warn('Key not found for fancy name:', fancyName);
            return;
        }

        if (!Array.isArray(profile.exclude)) {
            profile.exclude = [];
        }

        const excludeState = !$(this).prop('checked');
        if (excludeState) {
            // @ts-expect-error TS(2345): Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
            profile.exclude.push(keyName);
        } else {
            // @ts-expect-error TS(2345): Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
            const index = profile.exclude.indexOf(keyName);
            index !== -1 && profile.exclude.splice(index, 1);
        }
    });
    // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
    const isNameTaken = (n: any) => extension_settings.connectionManager.profiles.some(p => p.name === n);
    // @ts-expect-error TS(2339): Property 'api' does not exist on type '{ id: strin... Remove this comment to see the full error message
    const suggestedName = getUniqueName(collapseSpaces(`${profile.api ?? ''} ${profile.model ?? ''} - ${profile.preset ?? ''}`), isNameTaken);
    let name = forceName ?? (await callGenericPopup(template, POPUP_TYPE.INPUT, suggestedName));
    // If it's cancelled, it will be false
    if (!name) {
        return null;
    }
    name = DOMPurify.sanitize(String(name));
    if (!name) {
        toastr.error('Name cannot be empty.');
        return null;
    }

    if (isNameTaken(name) || name === NONE) {
        toastr.error('A profile with the same name already exists.');
        return null;
    }

    if (Array.isArray(profile.exclude)) {
        for (const command of profile.exclude) {
            delete profile[command];
        }
    }

    // @ts-expect-error TS(2339): Property 'name' does not exist on type '{ id: stri... Remove this comment to see the full error message
    profile.name = String(name);
    return profile;
}

/**
 * Deletes the selected connection profile.
 * @returns {Promise<void>}
 */
async function deleteConnectionProfile() {
    const selectedProfile = extension_settings.connectionManager.selectedProfile;
    if (!selectedProfile) {
        return;
    }

    // @ts-expect-error TS(2339): Property 'id' does not exist on type 'never'.
    const index = extension_settings.connectionManager.profiles.findIndex(p => p.id === selectedProfile);
    if (index === -1) {
        return;
    }

    const profile = extension_settings.connectionManager.profiles[index];
    // @ts-expect-error TS(2532): Object is possibly 'undefined'.
    const name = profile.name;
    const confirm = await Popup.show.confirm(t`Are you sure you want to delete the selected profile?`, name);

    if (!confirm) {
        return;
    }

    extension_settings.connectionManager.profiles.splice(index, 1);
    // @ts-expect-error TS(2322): Type 'null' is not assignable to type 'string'.
    extension_settings.connectionManager.selectedProfile = null;
    saveSettingsDebounced();

    await eventSource.emit(event_types.CONNECTION_PROFILE_DELETED, profile);
}

/**
 * Formats the connection profile for display.
 * @param {ConnectionProfile} profile Connection profile
 * @returns {Object} Fancy profile
 */
function makeFancyProfile(profile: any) {
    return Object.entries(FANCY_NAMES).reduce((acc, [key, value]) => {
        const allowEmpty = ALLOW_EMPTY.includes(key);
        if (!profile[key]) {
            if (profile[key] === '' && allowEmpty) {
                // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                acc[value] = EMPTY;
            }
            return acc;
        }

        // UUID is not very useful in the UI, so we replace it with a label (if available)
        if (key === 'secret-id') {
            const label = getSecretLabelById(profile[key]);
            if (label) {
                // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                acc[value] = label;
                return acc;
            }
        }

        if (key === 'regex-preset') {
            // @ts-expect-error TS(2339): Property 'id' does not exist on type 'never'.
            const label = extension_settings.regex_presets?.find(p => p.id === profile[key])?.name;
            if (label) {
                // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                acc[value] = label;
                return acc;
            }
        }

        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        acc[value] = profile[key];
        return acc;
    }, {});
}

/**
 * Applies the connection profile.
 * @param {ConnectionProfile} profile Connection profile
 * @returns {Promise<void>}
 */
async function applyConnectionProfile(profile: any) {
    if (!profile) {
        return;
    }

    // Abort any ongoing profile application
    ConnectionManagerSpinner.abort();

    const mode = profile.mode;
    const commands = mode === 'cc' ? CC_COMMANDS : TC_COMMANDS;
    const spinner = new ConnectionManagerSpinner();
    spinner.start();

    for (const command of commands) {
        if (spinner.isAborted()) {
            throw new Error('Profile application aborted');
        }

        const argument = profile[command];
        const allowEmpty = ALLOW_EMPTY.includes(command);
        if (!argument && !(allowEmpty && argument === '')) {
            continue;
        }
        try {
            const args = getNamedArguments(allowEmpty ? { force: 'true' } : {});
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            await SlashCommandParser.commands[command].callback(args, argument);
        } catch (error) {
            console.error(`Failed to execute command: ${command} ${argument}`, error);
        }
    }

    spinner.stop();
}

/**
 * Updates the selected connection profile.
 * @param {ConnectionProfile} profile Connection profile
 * @returns {Promise<void>}
 */
async function updateConnectionProfile(profile: any) {
    profile.mode = main_api === 'openai' ? 'cc' : 'tc';
    await readProfileFromCommands(profile.mode, profile, true);
}

/**
 * Renders the connection profile details.
 * @param {HTMLSelectElement} profiles Select element containing connection profiles
 */
function renderConnectionProfiles(profiles: any) {
    profiles.innerHTML = '';
    const noneOption = document.createElement('option');

    noneOption.value = '';
    noneOption.textContent = NONE;
    noneOption.selected = !extension_settings.connectionManager.selectedProfile;
    profiles.appendChild(noneOption);

    // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
    for (const profile of extension_settings.connectionManager.profiles.sort((a, b) => a.name.localeCompare(b.name))) {
        const option = document.createElement('option');
        // @ts-expect-error TS(2339): Property 'id' does not exist on type 'never'.
        option.value = profile.id;
        // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
        option.textContent = profile.name;
        // @ts-expect-error TS(2339): Property 'id' does not exist on type 'never'.
        option.selected = profile.id === extension_settings.connectionManager.selectedProfile;
        profiles.appendChild(option);
    }
}

/**
 * Renders the content of the details element.
 * @param {HTMLElement} detailsContent Content element of the details
 */
async function renderDetailsContent(detailsContent: any) {
    detailsContent.innerHTML = '';
    if (detailsContent.classList.contains('hidden')) {
        return;
    }
    const selectedProfile = extension_settings.connectionManager.selectedProfile;
    // @ts-expect-error TS(2339): Property 'id' does not exist on type 'never'.
    const profile = extension_settings.connectionManager.profiles.find(p => p.id === selectedProfile);
    if (profile) {
        const profileForDisplay = makeFancyProfile(profile);
        const templateParams = { profile: profileForDisplay };
        // @ts-expect-error TS(2339): Property 'exclude' does not exist on type 'never'.
        if (Array.isArray(profile.exclude) && profile.exclude.length > 0) {
            // @ts-expect-error TS(2339): Property 'omitted' does not exist on type '{ profi... Remove this comment to see the full error message
            templateParams.omitted = profile.exclude.map((e: any) => FANCY_NAMES[e]).join(', ');
        }
        const template = await renderExtensionTemplateAsync(MODULE_NAME, 'view', templateParams);
        detailsContent.innerHTML = template;
    } else {
        detailsContent.textContent = t`No profile selected`;
    }
}

/**
 * Callback for the /profile-genstream command
 * Generates text using Connection Manager with streaming display support.
 * @param {object} args Named arguments
 * @param {string} value Unnamed argument (the prompt)
 * @returns {Promise<string>} The generated text, optionally with formatted reasoning
 */
async function generateStreamCallback(args: any, value: any) {
    if (!value) {
        console.warn('WARN: No argument provided for /profile-genstream command');
        return '';
    }

    // Check if Connection Manager is available
    const context = getContext();
    // @ts-expect-error TS(2345): Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
    if (context.extensionSettings.disabledExtensions.includes('connection-manager')) {
        toastr.error(t`Connection Manager is required for /profile-genstream. Use /gen or /genraw instead.`);
        return '';
    }

    const profileIdOrName = args?.profile;
    const includeReasoning = isTrueBoolean(args?.reasoning);
    const systemPrompt = typeof args?.system == 'string' ? args.system : '';
    const maxTokens = Number(args?.length ?? 2048) || 2048;
    const lock = isTrueBoolean(args?.lock);
    const generatingLabel = typeof args?.generating === 'string' ? args.generating : 'Generating...';
    const completedLabel = typeof args?.completed === 'string' ? args.completed : 'Generated';
    const enableStop = !isFalseBoolean(args?.stop);
    const onStopClosure = args?.onStop instanceof SlashCommandClosure ? args.onStop : null;
    const onCompleteClosure = args?.onComplete instanceof SlashCommandClosure ? args.onComplete : null;

    // Parse delay: 'infinite' or negative = null (stay open), number = delay in ms
    let completeDelay = 3000; // Default 3 seconds
    if (args?.delay !== undefined) {
        if (typeof args.delay === 'string' && args.delay.toLowerCase() === 'infinite') {
            // @ts-expect-error TS(2322): Type 'null' is not assignable to type 'number'.
            completeDelay = null; // Stay until user closes
        } else {
            const parsed = Number(args.delay);
            if (!isNaN(parsed) && parsed >= 0) {
                completeDelay = parsed;
            } else if (!isNaN(parsed) && parsed < 0) {
                // @ts-expect-error TS(2322): Type 'null' is not assignable to type 'number'.
                completeDelay = null; // Negative = infinite
            }
        }
    }

    // Create abort controller for stop functionality (when stop is enabled)
    const abortController = enableStop ? new AbortController() : null;

    // Compose the stop handler: abort the request + optionally invoke user closure
    const onStopHandler = enableStop ? async () => {
        abortController?.abort();
        if (onStopClosure) {
            try {
                const localClosure = onStopClosure.getCopy();
                localClosure.onProgress = () => { };
                await localClosure.execute();
            } catch (e) {
                console.error('[GenStream] Error executing onStop closure', e);
            }
        }
    } : null;

    try {
        if (lock) {
            deactivateSendButtons();
        }

        // Determine which profile to use
        // Use the currently selected profile if no profile specified
        let effectiveProfileId = context.extensionSettings.connectionManager.selectedProfile;

        const profiles = context.extensionSettings.connectionManager.profiles;

        if (profileIdOrName) {
            // Use try to find profile by id first, then fuse search
            // @ts-expect-error TS(2339): Property 'id' does not exist on type 'never'.
            const profile = profiles.find(p => p.id === profileIdOrName);
            if (profile) {
                // @ts-expect-error TS(2339): Property 'id' does not exist on type 'never'.
                effectiveProfileId = profile.id;
            } else {
                const keys = [
                    { name: 'name', weight: 10 },
                ];
                const fuseResults = performFuzzySearch('profile', profiles, keys, profileIdOrName);
                if (fuseResults.length > 0) {
                    effectiveProfileId = fuseResults[0].item.id;
                } else {
                    toastr.warning(t`Connection profile not found: ${profileIdOrName}`);
                    return '';
                }
            }
        }

        if (!effectiveProfileId) {
            toastr.error(t`No connection profile specified or selected. Use profile= argument or select a profile in Connection Manager.`);
            return '';
        }

        // Create streaming display
        const display = new StreamingDisplay();
        display.show({
            label: generatingLabel,
            icon: ConnectionManagerRequestService.getProfileIcon(effectiveProfileId),
            onStop: onStopHandler,
        });

        const messages = [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: value },
        ];

        let finalText = '';
        let finalReasoning = '';

        /** Gets the final (if requested, formatted) text to return for this command @returns {string} */
        function buildResultText() {
            // Format output with reasoning if requested
            if (includeReasoning && finalReasoning) {
                const { formatted } = formatReasoning(finalReasoning, finalText);
                return formatted;
            }

            return finalText;
        }

        try {
            // Attempt streaming first
            const streamResponse = await ConnectionManagerRequestService.sendRequest(
                effectiveProfileId,
                messages,
                maxTokens,
                { extractData: true, includePreset: true, stream: true, signal: abortController?.signal ?? undefined },
            );

            if (typeof streamResponse === 'function') {
                const generator = streamResponse();
                for await (const chunk of generator) {
                    finalText = chunk.text;
                    finalReasoning = chunk.state?.reasoning || '';
                    display.updateReasoning(finalReasoning);
                    display.updateContent(finalText);
                }
            } else {
                // Non-streaming fallback within the try block
                const extracted = streamResponse;
                finalText = extracted?.content || '';
                finalReasoning = extracted?.reasoning || '';
                if (finalReasoning) {
                    display.updateReasoning(finalReasoning);
                }
                display.updateContent(finalText);
            }
        } catch (error) {
            // If the user clicked stop, don't retry — show stopped state and return empty
            if (abortController?.signal?.aborted) {
                display.markStopped({ label: `${generatingLabel} [Stopped]` });
                return buildResultText();
            }

            console.warn('[Slash Commands] Streaming failed, falling back to non-streaming:', error);
            display.hide({ instant: true });

            // Retry with non-streaming
            const response = await ConnectionManagerRequestService.sendRequest(
                effectiveProfileId,
                messages,
                maxTokens,
                { extractData: true, includePreset: true, stream: false },
            );

            const extracted = /** @type {import('../../custom-request.js').ExtractedData} */ (response);
            finalText = extracted?.content || '';
            finalReasoning = extracted?.reasoning || '';

            // Show quick non-streaming display
            display.show({
                label: generatingLabel,
                icon: ConnectionManagerRequestService.getProfileIcon(effectiveProfileId),
            });
            if (finalReasoning) {
                display.updateReasoning(finalReasoning);
            }
            display.updateContent(finalText);
        }

        // Mark as complete with delay (null = stay open until user closes)
        display.complete({ label: completedLabel, delay: completeDelay });

        // Invoke onComplete closure if provided
        if (onCompleteClosure) {
            try {
                const localClosure = onCompleteClosure.getCopy();
                localClosure.onProgress = () => { };
                await localClosure.execute();
            } catch (e) {
                console.error('[GenStream] Error executing onComplete closure', e);
            }
        }

        if (!finalText) {
            toastr.warning(t`Generation returned empty result`);
            return '';
        }

        return buildResultText();
    } catch (err) {
        console.error('Error on /genstream generation', err);
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        toastr.error(err.message, t`API Error`, { preventDuplicates: true });
        return '';
    } finally {
        if (lock) {
            activateSendButtons();
        }
    }
}

export async function init() {
    extension_settings.connectionManager = extension_settings.connectionManager || structuredClone(DEFAULT_SETTINGS);

    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        if (extension_settings.connectionManager[key] === undefined) {
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            extension_settings.connectionManager[key] = DEFAULT_SETTINGS[key];
        }
    }

    const container = document.getElementById('rm_api_block');
    const settings = await renderExtensionTemplateAsync(MODULE_NAME, 'settings');
    // @ts-expect-error TS(2531): Object is possibly 'null'.
    container.insertAdjacentHTML('afterbegin', settings);

    /** @type {HTMLSelectElement} */
    // @ts-ignore
    const profiles = document.getElementById('connection_profiles');
    renderConnectionProfiles(profiles);

    function toggleProfileSpecificButtons() {
        const profileId = extension_settings.connectionManager.selectedProfile;
        const profileSpecificButtons = ['update_connection_profile', 'reload_connection_profile', 'delete_connection_profile'];
        // @ts-expect-error TS(2531): Object is possibly 'null'.
        profileSpecificButtons.forEach(id => document.getElementById(id).classList.toggle('disabled', !profileId));
    }
    toggleProfileSpecificButtons();

    // @ts-expect-error TS(2531): Object is possibly 'null'.
    profiles.addEventListener('change', async function () {
        // @ts-expect-error TS(2531): Object is possibly 'null'.
        const selectedProfile = profiles.selectedOptions[0];
        if (!selectedProfile) {
            // Safety net for preventing the command getting stuck
            await eventSource.emit(event_types.CONNECTION_PROFILE_LOADED, NONE);
            return;
        }

        const profileId = selectedProfile.value;
        extension_settings.connectionManager.selectedProfile = profileId;
        saveSettingsDebounced();
        await renderDetailsContent(detailsContent);

        toggleProfileSpecificButtons();

        // None option selected
        if (!profileId) {
            await eventSource.emit(event_types.CONNECTION_PROFILE_LOADED, NONE);
            return;
        }

        // @ts-expect-error TS(2339): Property 'id' does not exist on type 'never'.
        const profile = extension_settings.connectionManager.profiles.find(p => p.id === profileId);

        if (!profile) {
            console.log(`Profile not found: ${profileId}`);
            return;
        }

        await applyConnectionProfile(profile);
        // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
        await eventSource.emit(event_types.CONNECTION_PROFILE_LOADED, profile.name);
    });

    const reloadButton = document.getElementById('reload_connection_profile');
    // @ts-expect-error TS(2531): Object is possibly 'null'.
    reloadButton.addEventListener('click', async () => {
        const selectedProfile = extension_settings.connectionManager.selectedProfile;
        // @ts-expect-error TS(2339): Property 'id' does not exist on type 'never'.
        const profile = extension_settings.connectionManager.profiles.find(p => p.id === selectedProfile);
        if (!profile) {
            console.log('No profile selected');
            return;
        }
        await applyConnectionProfile(profile);
        await renderDetailsContent(detailsContent);
        // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
        await eventSource.emit(event_types.CONNECTION_PROFILE_LOADED, profile.name);
        toastr.success('Connection profile reloaded', '', { timeOut: 1500 });
    });

    const createButton = document.getElementById('create_connection_profile');
    // @ts-expect-error TS(2531): Object is possibly 'null'.
    createButton.addEventListener('click', async () => {
        const profile = await createConnectionProfile();
        if (!profile) {
            return;
        }
        // @ts-expect-error TS(2345): Argument of type '{ id: string; mode: string; excl... Remove this comment to see the full error message
        extension_settings.connectionManager.profiles.push(profile);
        extension_settings.connectionManager.selectedProfile = profile.id;
        saveSettingsDebounced();
        renderConnectionProfiles(profiles);
        await renderDetailsContent(detailsContent);
        await eventSource.emit(event_types.CONNECTION_PROFILE_CREATED, profile);
        // @ts-expect-error TS(2339): Property 'name' does not exist on type '{ id: stri... Remove this comment to see the full error message
        await eventSource.emit(event_types.CONNECTION_PROFILE_LOADED, profile.name);
    });

    const updateButton = document.getElementById('update_connection_profile');
    // @ts-expect-error TS(2531): Object is possibly 'null'.
    updateButton.addEventListener('click', async () => {
        const selectedProfile = extension_settings.connectionManager.selectedProfile;
        // @ts-expect-error TS(2339): Property 'id' does not exist on type 'never'.
        const profile = extension_settings.connectionManager.profiles.find(p => p.id === selectedProfile);
        if (!profile) {
            console.log('No profile selected');
            return;
        }
        const oldProfile = structuredClone(profile);
        await updateConnectionProfile(profile);
        await renderDetailsContent(detailsContent);
        saveSettingsDebounced();
        await eventSource.emit(event_types.CONNECTION_PROFILE_UPDATED, oldProfile, profile);
        // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
        await eventSource.emit(event_types.CONNECTION_PROFILE_LOADED, profile.name);
        toastr.success('Connection profile updated', '', { timeOut: 1500 });
    });

    const deleteButton = document.getElementById('delete_connection_profile');
    // @ts-expect-error TS(2531): Object is possibly 'null'.
    deleteButton.addEventListener('click', async () => {
        await deleteConnectionProfile();
        renderConnectionProfiles(profiles);
        await renderDetailsContent(detailsContent);
        await eventSource.emit(event_types.CONNECTION_PROFILE_LOADED, NONE);
    });

    const editButton = document.getElementById('edit_connection_profile');
    // @ts-expect-error TS(2531): Object is possibly 'null'.
    editButton.addEventListener('click', async () => {
        const selectedProfile = extension_settings.connectionManager.selectedProfile;
        // @ts-expect-error TS(2339): Property 'id' does not exist on type 'never'.
        const profile = extension_settings.connectionManager.profiles.find(p => p.id === selectedProfile);
        if (!profile) {
            console.log('No profile selected');
            return;
        }
        // @ts-expect-error TS(2339): Property 'exclude' does not exist on type 'never'.
        if (!Array.isArray(profile.exclude)) {
            // @ts-expect-error TS(2339): Property 'exclude' does not exist on type 'never'.
            profile.exclude = [];
        }

        let saveChanges = false;
        const sortByViewOrder = (a: any, b: any) => Object.keys(FANCY_NAMES).indexOf(a) - Object.keys(FANCY_NAMES).indexOf(b);
        // @ts-expect-error TS(2339): Property 'mode' does not exist on type 'never'.
        const commands = profile.mode === 'cc' ? CC_COMMANDS : TC_COMMANDS;
        const settings = commands.slice().sort(sortByViewOrder).reduce((acc, command) => {
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            const fancyName = FANCY_NAMES[command];
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            acc[fancyName] = !profile.exclude.includes(command);
            return acc;
        }, {});
        // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
        const template = $(await renderExtensionTemplateAsync(MODULE_NAME, 'edit', { name: profile.name, settings }));
        // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
        let newName = await callGenericPopup(template, POPUP_TYPE.INPUT, profile.name, {
            customButtons: [{
                text: t`Save and Update`,
                classes: ['popup-button-ok'],
                result: POPUP_RESULT.AFFIRMATIVE,
                action: () => {
                    saveChanges = true;
                },
            }],
        });

        // If it's cancelled, it will be false
        if (!newName) {
            return;
        }
        newName = DOMPurify.sanitize(String(newName));
        if (!newName) {
            toastr.error('Name cannot be empty.');
            return;
        }

        // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
        if (profile.name !== newName && extension_settings.connectionManager.profiles.some(p => p.name === newName)) {
            toastr.error('A profile with the same name already exists.');
            return;
        }

        const newExcludeList = template.find('input[name="exclude"]:not(:checked)').map(function(this: any) {
            return Object.entries(FANCY_NAMES).find(x => x[1] === String($(this).val()))?.[0];
        }).get();

        const oldProfile = structuredClone(profile);
        // @ts-expect-error TS(2339): Property 'exclude' does not exist on type 'never'.
        if (newExcludeList.length !== profile.exclude.length || !newExcludeList.every((e: any) => profile.exclude.includes(e))) {
            // @ts-expect-error TS(2339): Property 'exclude' does not exist on type 'never'.
            profile.exclude = newExcludeList;
            for (const command of newExcludeList) {
                delete profile[command];
            }
            if (saveChanges) {
                await updateConnectionProfile(profile);
            } else {
                toastr.info('Press "Update" to record them into the profile.', 'Included settings list updated');
            }
        }

        // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
        if (profile.name !== newName) {
            toastr.success('Connection profile renamed.');
            // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
            profile.name = newName;
        }

        saveSettingsDebounced();
        await eventSource.emit(event_types.CONNECTION_PROFILE_UPDATED, oldProfile, profile);
        renderConnectionProfiles(profiles);
        await renderDetailsContent(detailsContent);
    });

    /** @type {HTMLElement} */
    const viewDetails = document.getElementById('view_connection_profile');
    const detailsContent = document.getElementById('connection_profile_details_content');
    // @ts-expect-error TS(2531): Object is possibly 'null'.
    viewDetails.addEventListener('click', async () => {
        // @ts-expect-error TS(2531): Object is possibly 'null'.
        viewDetails.classList.toggle('active');
        // @ts-expect-error TS(2531): Object is possibly 'null'.
        detailsContent.classList.toggle('hidden');
        await renderDetailsContent(detailsContent);
    });

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'profile',
        helpString: 'Switch to a connection profile or return the name of the current profile in no argument is provided. Use <code>&lt;None&gt;</code> to switch to no profile.',
        returns: 'name of the profile',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Name of the connection profile',
                enumProvider: profilesProvider,
                isRequired: false,
            }),
        ],
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'await',
                description: 'Wait for the connection profile to be applied before returning.',
                isRequired: false,
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'true',
                enumList: commonEnumProviders.boolean('trueFalse')(),
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'timeout',
                description: 'Maximum time to wait for the API connection to be established, in milliseconds. Set to 0 to disable. Only applies when await=true.',
                isRequired: false,
                typeList: [ARGUMENT_TYPE.NUMBER],
                defaultValue: '2000',
            }),
        ],
        callback: async (args: any, value: any) => {
            if (!value || typeof value !== 'string') {
                const selectedProfile = extension_settings.connectionManager.selectedProfile;
                // @ts-expect-error TS(2339): Property 'id' does not exist on type 'never'.
                const profile = extension_settings.connectionManager.profiles.find(p => p.id === selectedProfile);
                if (!profile) {
                    return NONE;
                }
                // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
                return profile.name;
            }

            if (value === NONE) {
                // @ts-expect-error TS(2531): Object is possibly 'null'.
                profiles.selectedIndex = 0;
                // @ts-expect-error TS(2531): Object is possibly 'null'.
                profiles.dispatchEvent(new Event('change'));
                return NONE;
            }

            const profile = findProfileByName(value);

            if (!profile) {
                return '';
            }

            const shouldAwait = !isFalseBoolean(String(args?.await));
            const awaitPromise = new Promise((resolve) => eventSource.once(event_types.CONNECTION_PROFILE_LOADED, resolve));

            // @ts-expect-error TS(2531): Object is possibly 'null'.
            profiles.selectedIndex = Array.from(profiles.options).findIndex(o => o.value === profile.id);
            // @ts-expect-error TS(2531): Object is possibly 'null'.
            profiles.dispatchEvent(new Event('change'));

            if (shouldAwait) {
                await awaitPromise;

                // We should also await the connection to be established
                const parsedTimeout = parseInt(args?.timeout?.toString());
                const timeout = !isNaN(parsedTimeout) ? Math.max(0, parsedTimeout) : 2000;
                if (timeout > 0) {
                    await waitUntilCondition(() => online_status !== 'no_connection', timeout, 100, { rejectOnTimeout: false });
                }
            }

            return (profile as any).name;
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'profile-list',
        helpString: 'List all connection profile names.',
        returns: 'list of profile names',
        // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
        callback: () => JSON.stringify(extension_settings.connectionManager.profiles.map(p => p.name)),
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'profile-create',
        returns: 'name of the new profile',
        helpString: 'Create a new connection profile using the current settings.',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'name of the new connection profile',
                isRequired: true,
                typeList: [ARGUMENT_TYPE.STRING],
            }),
        ],
        callback: async (_args: any, name: any) => {
            if (!name || typeof name !== 'string') {
                toastr.warning('Please provide a name for the new connection profile.');
                return '';
            }
            // @ts-expect-error TS(2345): Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
            const profile = await createConnectionProfile(name);
            if (!profile) {
                return '';
            }
            // @ts-expect-error TS(2345): Argument of type '{ id: string; mode: string; excl... Remove this comment to see the full error message
            extension_settings.connectionManager.profiles.push(profile);
            extension_settings.connectionManager.selectedProfile = profile.id;
            saveSettingsDebounced();
            renderConnectionProfiles(profiles);
            await renderDetailsContent(detailsContent);
            await eventSource.emit(event_types.CONNECTION_PROFILE_CREATED, profile);
            // @ts-expect-error TS(2339): Property 'name' does not exist on type '{ id: stri... Remove this comment to see the full error message
            return profile.name;
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'profile-update',
        helpString: 'Update the selected connection profile.',
        callback: async () => {
            const selectedProfile = extension_settings.connectionManager.selectedProfile;
            // @ts-expect-error TS(2339): Property 'id' does not exist on type 'never'.
            const profile = extension_settings.connectionManager.profiles.find(p => p.id === selectedProfile);
            if (!profile) {
                toastr.warning('No profile selected.');
                return '';
            }
            const oldProfile = structuredClone(profile);
            await updateConnectionProfile(profile);
            await renderDetailsContent(detailsContent);
            saveSettingsDebounced();
            await eventSource.emit(event_types.CONNECTION_PROFILE_UPDATED, oldProfile, profile);
            // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
            return profile.name;
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'profile-get',
        helpString: 'Get the details of the connection profile. Returns the selected profile if no argument is provided.',
        returns: 'object of the selected profile',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Name of the connection profile',
                enumProvider: profilesProvider,
                isRequired: false,
            }),
        ],
        callback: async (_args: any, value: any) => {
            if (!value || typeof value !== 'string') {
                const selectedProfile = extension_settings.connectionManager.selectedProfile;
                // @ts-expect-error TS(2339): Property 'id' does not exist on type 'never'.
                const profile = extension_settings.connectionManager.profiles.find(p => p.id === selectedProfile);
                if (!profile) {
                    return '';
                }
                return JSON.stringify(profile);
            }

            const profile = findProfileByName(value);
            if (!profile) {
                return '';
            }
            return JSON.stringify(profile);
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'profile-genstream',
        callback: generateStreamCallback,
        returns: t`generated text`,
        namedArgumentList: [
            new SlashCommandNamedArgument(
                // @ts-expect-error TS(2345): Argument of type '"off"' is not assignable to para... Remove this comment to see the full error message
                'lock', t`lock user input during generation`, [ARGUMENT_TYPE.BOOLEAN], false, false, 'off', commonEnumProviders.boolean('onOff')(),
            ),
            SlashCommandNamedArgument.fromProps({
                name: 'profile',
                description: t`connection profile ID to use for generation`,
                typeList: [ARGUMENT_TYPE.STRING],
                enumProvider: commonEnumProviders.connectionProfiles(),
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'reasoning',
                description: t`include formatted reasoning in the output`,
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
                enumProvider: commonEnumProviders.boolean('trueFalse'),
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'system',
                description: t`system prompt at the start`,
                typeList: [ARGUMENT_TYPE.STRING],
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'length',
                description: t`API response length in tokens`,
                typeList: [ARGUMENT_TYPE.NUMBER],
                defaultValue: '2048',
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'generating',
                description: t`label/title for the generation display`,
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'Generating...',
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'completed',
                description: t`updated label/title for when generation completes`,
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'Generated',
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'delay',
                description: t`auto-hide delay in ms after generation completes. Use "infinite" or negative to keep until manually closed`,
                typeList: [ARGUMENT_TYPE.NUMBER],
                defaultValue: '3000',
                enumList: [
                    // @ts-expect-error TS(2345): Argument of type '"Keep the streaming display open... Remove this comment to see the full error message
                    new SlashCommandEnumValue('infinite', 'Keep the streaming display open until manually closed', 'command', '♾️'),
                    // @ts-expect-error TS(2345): Argument of type '() => boolean' is not assignable... Remove this comment to see the full error message
                    new SlashCommandEnumValue('any delay in seconds', null, 'number', '⌚', () => true, (input: any) => input),
                ],
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'stop',
                description: t`show a stop button on the streaming display that aborts generation when clicked`,
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'true',
                enumProvider: commonEnumProviders.boolean('trueFalse'),
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'onStop',
                description: t`closure to execute when the stop button is clicked (in addition to aborting the request)`,
                typeList: [ARGUMENT_TYPE.CLOSURE],
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'onComplete',
                description: t`closure to execute after generation completes successfully`,
                typeList: [ARGUMENT_TYPE.CLOSURE],
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'prompt',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
            }),
        ],
        helpString: `
            <div>
                ${t`Generates text using Connection Manager with streaming display. Shows live generation progress including reasoning (thinking) and content.`}
            </div>
            <div>
                ${t`Requires Connection Manager extension. Uses the currently selected profile or the specified profile= argument.`}
            </div>
            <div>
                ${t`Use reasoning=true to include formatted reasoning in the output (using the defined reasoning template). This can be parsed later with /reasoning-parse.`}
            </div>
            <div>
                ${t`Use delay to control auto-hide behavior: number (ms), "infinite", or negative to keep the display open until manually closed. The display shows a green LED when complete.`}
            </div>
            <div>
                ${t`A stop button is shown by default (stop=true). Click it to abort generation and return whatever was streamed so far. Use stop=false to hide the stop button.`}
            </div>
            <div>
                ${t`Use onStop and onComplete closures for custom behavior when generation is stopped or completes.`}
            </div>
            <div>
                ${t`Example: <pre><code>/profile-genstream profile=my-profile-id reasoning=true Summarize the following text</code></pre>`}
            </div>
            <div>
                ${t`Example with infinite display: <pre><code>/profile-genstream delay=infinite Tell me a story</code></pre>`}
            </div>
            <div>
                ${t`Example with custom stop handler: <pre><code>/profile-genstream onStop={: /echo "Generation stopped!" :} Tell me a story</code></pre>`}
            </div>
        `,
    }));
}
