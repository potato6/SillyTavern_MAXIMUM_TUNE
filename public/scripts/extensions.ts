

import { eventSource, event_types, saveSettings, saveSettingsDebounced, getRequestHeaders, CLIENT_VERSION } from '../script.js';
import { POPUP_RESULT, POPUP_TYPE, Popup } from './popup.js';
import { renderTemplate, renderTemplateAsync } from './templates.js';
import { delay, deleteValueByPath, equalsIgnoreCaseAndAccents, escapeHtml, isSubsetOf, sanitizeSelector, setValueByPath, versionCompare } from './utils.js';
import { getContext } from './st-context.js';
import { isAdmin } from './user.js';
import { addLocaleData, getCurrentLocale, t } from './i18n.js';
import { debounce_timeout } from './constants.js';
import { accountStorage } from './util/AccountStorage.js';
import { SimpleMutex } from './util/SimpleMutex.js';

export {
    getContext,
    getApiUrl,
    SimpleMutex as ModuleWorkerWrapper,
};

/** @type {string[]} */
export let extensionNames = [];

/**
 * Holds the type of each extension.
 * Don't use this directly, use getExtensionType instead!
 * @type {Record<string, string>}
 */
export let extensionTypes = {};

/**
 * A list of active modules provided by the Extras API.
 * @type {string[]}
 */
export let modules = [];

/**
 * A set of active extensions.
 * @type {Set<string>}
 */
const activeExtensions = new Set();

/**
 * Errors that occurred while loading extensions.
 * @type {Set<string>}
 */
const extensionLoadErrors = new Set();

const getApiUrl = () => extension_settings.apiUrl;
// @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
const sortManifestsByOrder = (a, b) => parseInt(a.loading_order) - parseInt(b.loading_order) || String(a.display_name).localeCompare(String(b.display_name));
// @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
const sortManifestsByName = (a, b) => String(a.display_name).localeCompare(String(b.display_name)) || parseInt(a.loading_order) - parseInt(b.loading_order);
let connectedToApi = false;

/**
 * Holds manifest data for each extension.
 * @type {Record<string, object>}
 */
let manifests = {};

/**
 * Default URL for the Extras API.
 */
const defaultUrl = 'http://localhost:5100';

/**
 * Checks if the extension is officially supported by its URL pattern.
 * @param {string} url URL to check
 * @returns {boolean} True if the URL matches the pattern, false otherwise (or not a valid URL)
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'url' implicitly has an 'any' type.
export const isOfficialExtension = (url) => {
    try {
        return /^https:\/\/github\.com\/SillyTavern\/(.+)$/i.test(new URL(url).href);
    } catch {
        return false;
    }
};

let requiresReload = false;
let stateChanged = false;
// @ts-expect-error TS(7034) FIXME: Variable 'saveMetadataTimeout' implicitly has type... Remove this comment to see the full error message
let saveMetadataTimeout = null;

/**
 *
 */
export function cancelDebouncedMetadataSave() {
    // @ts-expect-error TS(7005) FIXME: Variable 'saveMetadataTimeout' implicitly has an '... Remove this comment to see the full error message
    if (saveMetadataTimeout) {
        console.debug('Debounced metadata save cancelled');
        // @ts-expect-error TS(7005) FIXME: Variable 'saveMetadataTimeout' implicitly has an '... Remove this comment to see the full error message
        clearTimeout(saveMetadataTimeout);
        saveMetadataTimeout = null;
    }
}

/**
 *
 */
export function saveMetadataDebounced() {
    const context = getContext();
    const groupId = context.groupId;
    const characterId = context.characterId;

    cancelDebouncedMetadataSave();

    saveMetadataTimeout = setTimeout(async () => {
        const newContext = getContext();

        if (groupId !== newContext.groupId) {
            console.warn('Group changed, not saving metadata');
            return;
        }

        if (characterId !== newContext.characterId) {
            console.warn('Character changed, not saving metadata');
            return;
        }

        console.debug('Saving metadata...');
        await newContext.saveMetadata();
        console.debug('Saved metadata...');
    }, debounce_timeout.relaxed);
}

/**
 * Provides an ability for extensions to render HTML templates synchronously.
 * Templates sanitation and localization is forced.
 * @param {string} extensionName Extension name
 * @param {string} templateId Template ID
 * @param {object} templateData Additional data to pass to the template
 * @param sanitize
 * @param localize
 * @returns {string} Rendered HTML
 * @deprecated Use renderExtensionTemplateAsync instead.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'extensionName' implicitly has an 'any' ... Remove this comment to see the full error message
export function renderExtensionTemplate(extensionName, templateId, templateData = {}, sanitize = true, localize = true) {
    return renderTemplate(`scripts/extensions/${extensionName}/${templateId}.html`, templateData, sanitize, localize, true);
}

/**
 * Provides an ability for extensions to render HTML templates asynchronously.
 * Templates sanitation and localization is forced.
 * @param {string} extensionName Extension name
 * @param {string} templateId Template ID
 * @param {object} templateData Additional data to pass to the template
 * @param sanitize
 * @param localize
 * @returns {Promise<string>} Rendered HTML
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'extensionName' implicitly has an 'any' ... Remove this comment to see the full error message
export function renderExtensionTemplateAsync(extensionName, templateId, templateData = {}, sanitize = true, localize = true) {
    return renderTemplateAsync(`scripts/extensions/${extensionName}/${templateId}.html`, templateData, sanitize, localize, true);
}

export const extension_settings = {
    apiUrl: defaultUrl,
    apiKey: '',
    autoConnect: false,
    notifyUpdates: false,
    disabledExtensions: [],
    expressionOverrides: [],
    memory: {},
    note: {
        default: '',
        chara: [],
        wiAddition: [],
    },
    caption: {
        refine_mode: false,
    },
    expressions: {
        /** @type {number} see `EXPRESSION_API` */
        api: undefined,
        /** @type {string[]} */
        custom: [],
        showDefault: false,
        translate: false,
        /** @type {string} */
        fallback_expression: undefined,
        /** @type {string} */
        llmPrompt: undefined,
        allowMultiple: true,
        rerollIfSame: false,
        promptType: 'raw',
    },
    connectionManager: {
        selectedProfile: '',
        /** @type {import('./extensions/connection-manager/index.js').ConnectionProfile[]} */
        profiles: [],
    },
    dice: {},
    /** @type {import('./char-data.js').RegexScriptData[]} */
    regex: [],
    /** @type {import('./extensions/regex/index.js').RegexPreset[]} */
    regex_presets: [],
    /** @type {string[]} */
    character_allowed_regex: [],
    /** @type {Record<string, string[]>} */
    preset_allowed_regex: {},
    tts: {},
    sd: {
        prompts: {},
        character_prompts: {},
        character_negative_prompts: {},
    },
    chromadb: {},
    translate: {},
    objective: {},
    quickReply: {},
    randomizer: {
        controls: [],
        fluctuation: 0.1,
        enabled: false,
    },
    speech_recognition: {},
    rvc: {},
    hypebot: {},
    vectors: {},
    variables: {
        global: {},
    },
    /**
     * @type {import('./chats.js').FileAttachment[]}
     */
    attachments: [],
    /**
     * @type {Record<string, import('./chats.js').FileAttachment[]>}
     */
    character_attachments: {},
    /**
     * @type {string[]}
     */
    disabled_attachments: [],
    gallery: {
        /** @type {{[characterKey: string]: string}} */
        folders: {},
        /** @type {string} */
        sort: 'dateAsc',
    },
};

/**
 *
 */
function showHideExtensionsMenu() {
    // Get the number of menu items that are not hidden
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    const hasMenuItems = Array.from(document.getElementById('extensionsMenu').children).some(child => getComputedStyle(child).display !== 'none');

    // We have menu items, so we can stop checking
    if (hasMenuItems) {
        clearInterval(menuInterval);
    }

    // Show or hide the menu button
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extensionsMenuButton').toggle(hasMenuItems);
}

// Periodically check for new extensions
const menuInterval = setInterval(showHideExtensionsMenu, 1000);

/**
 * Gets the type of an extension based on its external ID.
 * @param {string} externalId External ID of the extension (excluding or including the leading 'third-party/')
 * @returns {string} Type of the extension (global, local, system, or empty string if not found)
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'externalId' implicitly has an 'any' typ... Remove this comment to see the full error message
function getExtensionType(externalId) {
    const id = Object.keys(extensionTypes).find(id => id === externalId || (id.startsWith('third-party') && id.endsWith(externalId)));
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    return id ? extensionTypes[id] : '';
}

/**
 * Performs a fetch of the Extras API.
 * @param {string|URL} endpoint Extras API endpoint
 * @param {RequestInit} args Request arguments
 * @returns {Promise<Response>} Response from the fetch
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'endpoint' implicitly has an 'any' type.
export async function doExtrasFetch(endpoint, args = {}) {
    if (!args) {
        args = {};
    }

    // @ts-expect-error TS(2339) FIXME: Property 'method' does not exist on type '{}'.
    if (!args.method) {
        Object.assign(args, { method: 'GET' });
    }

    // @ts-expect-error TS(2339) FIXME: Property 'headers' does not exist on type '{}'.
    if (!args.headers) {
        // @ts-expect-error TS(2339) FIXME: Property 'headers' does not exist on type '{}'.
        args.headers = {};
    }

    if (extension_settings.apiKey) {
        // @ts-expect-error TS(2339) FIXME: Property 'headers' does not exist on type '{}'.
        Object.assign(args.headers, {
            'Authorization': `Bearer ${extension_settings.apiKey}`,
        });
    }

    return await fetch(endpoint, args);
}

/**
 * Generates a CSS selector for an extension based on its name, allowing omission of a common prefix.
 * @param {string} name Name of the extension, with or without the "third-party" prefix
 * @param {object} [options] Optional parameters
 * @param {string} [options.prefix] Optional prefix to ignore when generating the selector (e.g. "third-party")
 * @returns {string} CSS selector for the extension, with the prefix removed if it was present and specified in options
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
function getNameSelector(name, { prefix = 'third-party' } = {}) {
    const nameWithoutPrefix = prefix && name.startsWith(prefix) ? name.slice(prefix.length) : name;
    return CSS.escape(nameWithoutPrefix);
}

/**
 * Discovers extensions from the API.
 * @returns {Promise<{name: string, type: string}[]>}
 */
async function discoverExtensions() {
    try {
        const response = await fetch('/api/extensions/discover');

        if (response.ok) {
            const extensions = await response.json();
            return extensions;
        } else {
            return [];
        }
    } catch (err) {
        console.error(err);
        return [];
    }
}

/**
 *
 */
function onDisableExtensionClick() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const name = $(this).data('name');
    disableExtension(name, false);
}

/**
 *
 */
function onEnableExtensionClick() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const name = $(this).data('name');
    enableExtension(name, false);
}

/**
 * Handles toggling all extensions on or off.
 * @param {object[]} extensionsToToggle
 * @param {JQuery<HTMLElement>} toggleContainer
 * @returns {object[]} Updated extensionsToToggle array
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'extensionsToToggle' implicitly has an '... Remove this comment to see the full error message
function onToggleAllExtensions(extensionsToToggle, toggleContainer) {
    const extensionNames = Object.keys(manifests);
    const thirdPartyExtensions = extensionNames.filter(name => ['local', 'global'].includes(getExtensionType(name)));

    // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
    const checkIfDisabled = (name) => {
        // @ts-expect-error TS(7006) FIXME: Parameter 'ext' implicitly has an 'any' type.
        const toggle = extensionsToToggle.find(ext => ext.name === name);
        return toggle
            ? !toggle.enable
            // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
            : extension_settings.disabledExtensions.includes(name);
    };

    if (thirdPartyExtensions.length === 0) return [];

    let enable = true;

    for (const name of thirdPartyExtensions) {
        const isEnabled = !checkIfDisabled(name);

        if (isEnabled) {
            enable = false;
            break;
        }
    }

    const toggleHandler = enable ? enableExtension : disableExtension;

    for (const name of thirdPartyExtensions) {
        const isDisabled = checkIfDisabled(name);
        const doToggleExtension = enable ? isDisabled : !isDisabled;

        if (doToggleExtension) {
            // @ts-expect-error TS(7006) FIXME: Parameter 'ext' implicitly has an 'any' type.
            const toggle = extensionsToToggle.find(ext => ext.name === name);

            if (toggle) {
                toggle.toggleHandler = toggleHandler;
                toggle.enable = enable;
            } else {
                extensionsToToggle.push({ name, toggleHandler, enable });
            }

            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(toggleContainer[0]?.querySelector(`.extension_block[data-name="${getNameSelector(name)}"] .extension_toggle input`))
                .prop('checked', enable)
                .toggleClass('toggle_enable', !enable)
                .toggleClass('toggle_disable', enable)
                .toggleClass('checkbox_disabled', !enable);
        }
    }

    return extensionsToToggle;
}

/**
 * Checks whether an extension has a specific hook defined in its manifest.
 * @param {string} name Extension name (with or without 'third-party' prefix)
 * @param {'install' | 'update' | 'delete' | 'clean' | 'enable' | 'disable' | 'activate'} hookName The hook to check
 * @returns {boolean}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
function hasExtensionHook(name, hookName) {
    const fullName = name.startsWith('third-party') ? name : `third-party${name}`;
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    const manifest = manifests[fullName];
    if (!manifest || !manifest.hooks || typeof manifest.hooks !== 'object') {
        return false;
    }
    const hookFunctionName = manifest.hooks[hookName];
    return typeof hookFunctionName === 'string' && hookFunctionName.length > 0;
}

/**
 * Calls a manifest hook for an extension.
 * Hooks are optional function names exported from the extension's JS entry point module.
 * The hook function can optionally return a Promise that will be awaited.
 * @param {string} name Extension name
 * @param {'install' | 'update' | 'delete' | 'clean' | 'enable' | 'disable' | 'activate'} hookName The hook to call
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
async function callExtensionHook(name, hookName) {
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    const manifest = manifests[name];

    if (!manifest) {
        console.debug(`callExtensionHook: Extension "${name}" has no manifest, skipping hook "${hookName}"`);
        return;
    }

    if (!manifest.hooks || typeof manifest.hooks !== 'object') {
        return;
    }

    if (!Object.hasOwn(manifest.hooks, hookName)) {
        return;
    }

    const hookFunctionName = manifest.hooks[hookName];

    if (typeof hookFunctionName !== 'string' || !hookFunctionName) {
        console.warn(`callExtensionHook: Extension "${name}" hook "${hookName}" is not a valid string`);
        return;
    }

    if (!manifest.js) {
        console.warn(`callExtensionHook: Extension "${name}" has hook "${hookName}" but no JS entry point defined in manifest`);
        return;
    }

    const url = `/scripts/extensions/${name}/${manifest.js}`;
    console.debug(`callExtensionHook: Calling hook "${hookName}" (function "${hookFunctionName}") for extension "${name}"`);

    try {
        // @ts-expect-error TS(1323) FIXME: Dynamic imports are only supported when the '--mod... Remove this comment to see the full error message
        const module = await import(url);

        if (typeof module[hookFunctionName] !== 'function') {
            console.warn(`callExtensionHook: Extension "${name}" hook "${hookName}" references "${hookFunctionName}" which is not an exported function`);
            return;
        }

        const hookCallResult = module[hookFunctionName]();

        const HOOK_TIMEOUT = 5000;
        const HOOK_RESULT = {
            OK: 'ok',
            TIMEOUT: 'timeout',
        };

        const result = await Promise.race([
            (hookCallResult instanceof Promise ? hookCallResult : Promise.resolve(hookCallResult)).then(() => HOOK_RESULT.OK),
            delay(HOOK_TIMEOUT).then(() => HOOK_RESULT.TIMEOUT),
        ]);

        if (result === HOOK_RESULT.TIMEOUT) {
            console.warn(`callExtensionHook: Hook "${hookName}" for extension "${name}" timed out after ${HOOK_TIMEOUT}ms`);
        } else {
            console.debug(`callExtensionHook: Hook "${hookName}" completed for extension "${name}"`);
        }
    } catch (error) {
        console.error(`callExtensionHook: Error calling hook "${hookName}" for extension "${name}":`, error);
    }
}

/**
 * Enables an extension by name.
 * @param {string} name Extension name
 * @param {boolean} [reload] If true, reload the page after enabling the extension
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export async function enableExtension(name, reload = true) {
    await callExtensionHook(name, 'enable');
    extension_settings.disabledExtensions = extension_settings.disabledExtensions.filter(x => x !== name);
    stateChanged = true;
    await saveSettings();
    if (reload) {
        location.reload();
    } else {
        requiresReload = true;
    }
}

/**
 * Disables an extension by name.
 * @param {string} name Extension name
 * @param {boolean} [reload] If true, reload the page after disabling the extension
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export async function disableExtension(name, reload = true) {
    await callExtensionHook(name, 'disable');
    // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
    extension_settings.disabledExtensions.push(name);
    stateChanged = true;
    await saveSettings();
    if (reload) {
        location.reload();
    } else {
        requiresReload = true;
    }
}

/**
 * Finds an extension by name, allowing omission of the "third-party/" prefix.
 * @param {string} name - The name of the extension to find
 * @returns {{name: string, enabled: boolean}|null} Object with name and enabled properties, or null if not found
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export function findExtension(name) {
    const internalExtensionName = extensionNames.find(extName => {
        return equalsIgnoreCaseAndAccents(extName, name) || equalsIgnoreCaseAndAccents(extName, `third-party/${name}`);
    });
    if (!internalExtensionName) return null;
    const isEnabled = !extension_settings.disabledExtensions.includes(internalExtensionName);
    return { name: internalExtensionName, enabled: isEnabled };
}

/**
 * Returns a deep clone of the manifest for the given extension name.
 * Accepts either the short name (e.g. `SillyTavern-MyExtension`) or the full internal key
 * (e.g. `third-party/SillyTavern-MyExtension`). Returns null if the extension is not found.
 * @param {string} name - Extension name or internal key
 * @returns {object|null} Cloned manifest object, or null if not found
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export function getExtensionManifest(name) {
    const found = extensionNames.find(extName =>
        equalsIgnoreCaseAndAccents(extName, name) || equalsIgnoreCaseAndAccents(extName, `third-party/${name}`),
    );
    const manifest = found ? manifests[found] : null;
    return manifest ? structuredClone(manifest) : null;
}

/**
 * Loads manifest.json files for extensions.
 * @param {string[]} names Array of extension names
 * @returns {Promise<Record<string, object>>} Object with extension names as keys and their manifests as values
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'names' implicitly has an 'any' type.
async function getManifests(names) {
    const obj = {};
    const promises = [];

    for (const name of names) {
        const promise = new Promise((resolve, reject) => {
            fetch(`/scripts/extensions/${name}/manifest.json`).then(async response => {
                if (response.ok) {
                    const json = await response.json();
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    obj[name] = json;
                    // @ts-expect-error TS(2794) FIXME: Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
                    resolve();
                } else {
                    reject();
                }
            }).catch(err => {
                reject();
                console.log('Could not load manifest.json for ' + name, err);
            });
        });

        promises.push(promise);
    }

    await Promise.allSettled(promises);
    return obj;
}

/**
 * Tries to activate all available extensions that are not already active.
 * @returns {Promise<void>}
 */
async function activateExtensions() {
    extensionLoadErrors.clear();
    const clientVersion = CLIENT_VERSION.split(':')[1];
    const extensions = Object.entries(manifests).sort((a, b) => sortManifestsByOrder(a[1], b[1]));
    const extensionNames = extensions.map(x => x[0]);
    const promises = [];

    for (const entry of extensions) {
        const name = entry[0];
        const manifest = entry[1];
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        const extrasRequirements = manifest.requires;
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        const extensionDependencies = manifest.dependencies;
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        const minClientVersion = manifest.minimum_client_version;
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        const displayName = manifest.display_name || name;

        if (activeExtensions.has(name)) {
            continue;
        }
        // Client version requirement: pass if 'minimum_client_version' is undefined or null.
        let meetsClientMinimumVersion = true;
        if (minClientVersion !== undefined) {
            meetsClientMinimumVersion = versionCompare(clientVersion, minClientVersion);
        }

        // Module requirements: pass if 'requires' is undefined, null, or not an array; check subset if it's an array
        let meetsModuleRequirements = true;
        let missingModules = [];
        if (extrasRequirements !== undefined) {
            if (Array.isArray(extrasRequirements)) {
                meetsModuleRequirements = isSubsetOf(modules, extrasRequirements);
                // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
                missingModules = extrasRequirements.filter(req => !modules.includes(req));
            } else {
                console.warn(`Extension ${name}: manifest.json 'requires' field is not an array. Loading allowed, but any intended requirements were not verified to exist.`);
            }
        }

        // Extension dependencies: pass if 'dependencies' is undefined or not an array; check subset and disabled status if it's an array
        let meetsExtensionDeps = true;
        let missingDependencies = [];
        let disabledDependencies = [];
        if (extensionDependencies !== undefined) {
            if (Array.isArray(extensionDependencies)) {
                // Check if all dependencies exist
                meetsExtensionDeps = isSubsetOf(extensionNames, extensionDependencies);
                missingDependencies = extensionDependencies.filter(dep => !extensionNames.includes(dep));
                // Check for disabled dependencies
                if (meetsExtensionDeps) {
                    // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
                    disabledDependencies = extensionDependencies.filter(dep => extension_settings.disabledExtensions.includes(dep));
                    if (disabledDependencies.length > 0) {
                        // Fail if any dependencies are disabled
                        meetsExtensionDeps = false;
                    }
                }
            } else {
                console.warn(`Extension ${name}: manifest.json 'dependencies' field is not an array. Loading allowed, but any intended requirements were not verified to exist.`);
            }
        }

        // @ts-expect-error TS(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
        const isDisabled = extension_settings.disabledExtensions.includes(name);

        if (meetsModuleRequirements && meetsExtensionDeps && meetsClientMinimumVersion && !isDisabled) {
            try {
                console.debug('Activating extension', name);
                const promise = addExtensionLocale(name, manifest).finally(() =>
                    Promise.all([addExtensionScript(name, manifest), addExtensionStyle(name, manifest)]),
                );
                await promise
                    .then(() => {
                        activeExtensions.add(name);
                        return callExtensionHook(name, 'activate');
                    })
                    .catch(err => {
                        console.log('Could not activate extension', name, err);
                        extensionLoadErrors.add(t`Extension "${displayName}" failed to load: ${err}`);
                    });
                promises.push(promise);
            } catch (error) {
                console.error('Could not activate extension', name, error);
            }
        } else if (!meetsModuleRequirements && !isDisabled) {
            console.warn(t`Extension "${name}" did not load. Missing required Extras module(s): "${missingModules.join(', ')}"`);
            extensionLoadErrors.add(t`Extension "${displayName}" did not load. Missing required Extras module(s): "${missingModules.join(', ')}"`);
        } else if (!meetsExtensionDeps && !isDisabled) {
            if (disabledDependencies.length > 0) {
                console.warn(t`Extension "${name}" did not load. Required extensions exist but are disabled: "${disabledDependencies.join(', ')}". Enable them first, then reload.`);
                extensionLoadErrors.add(t`Extension "${displayName}" did not load. Required extensions exist but are disabled: "${disabledDependencies.join(', ')}". Enable them first, then reload.`);
            } else {
                console.warn(t`Extension "${name}" did not load. Missing required extensions: "${missingDependencies.join(', ')}"`);
                extensionLoadErrors.add(t`Extension "${displayName}" did not load. Missing required extensions: "${missingDependencies.join(', ')}"`);
            }
        } else if (!meetsClientMinimumVersion && !isDisabled) {
            console.warn(t`Extension "${name}" did not load. Requires ST client version ${minClientVersion}, but current version is ${clientVersion}.`);
            extensionLoadErrors.add(t`Extension "${displayName}" did not load. Requires ST client version ${minClientVersion}, but current version is ${clientVersion}.`);
        }
    }

    await Promise.allSettled(promises);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extensions_details').toggleClass('warning', extensionLoadErrors.size > 0);
}

/**
 *
 */
async function connectClickHandler() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const baseUrl = String($('#extensions_url').val());
    extension_settings.apiUrl = baseUrl;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const testApiKey = $('#extensions_api_key').val();
    extension_settings.apiKey = String(testApiKey);
    saveSettingsDebounced();
    await connectToApi(baseUrl);
}

/**
 *
 */
function autoConnectInputHandler() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const value = $(this).prop('checked');
    extension_settings.autoConnect = !!value;

    if (value && !connectedToApi) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#extensions_connect').trigger('click');
    }

    saveSettingsDebounced();
}

/**
 *
 */
async function addExtensionsButtonAndMenu() {
    const buttonHTML = await renderTemplateAsync('wandButton');
    const extensionsMenuHTML = await renderTemplateAsync('wandMenu');

    document.body.insertAdjacentHTML('beforeend', extensionsMenuHTML);
    document.getElementById('leftSendForm')?.insertAdjacentHTML('beforeend', buttonHTML);

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const button = $('#extensionsMenuButton');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const dropdown = $('#extensionsMenu');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(button).on('pointerdown mousedown', function (e) {
        e.stopPropagation();
    }).on('click', function () {
        if (dropdown[0].matches(':popover-open')) {
            dropdown[0].hidePopover();
        } else {
            // Close the other popover before opening this one
            const options = document.getElementById('options');
            if (options?.matches(':popover-open')) {
                // @ts-expect-error TS(2339) FIXME: Property 'hidePopover' does not exist on type 'HTM... Remove this comment to see the full error message
                options.hidePopover();
            }
            dropdown[0].showPopover();
        }
    });
    // Close extensions menu when clicking interactive items inside it
    dropdown.on('click', '.interactable, .menu_button, button, a, [data-i18n]', function () {
        dropdown[0].hidePopover();
    });
}

/**
 *
 */
function notifyUpdatesInputHandler() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    extension_settings.notifyUpdates = !!$('#extensions_notify_updates').prop('checked');
    saveSettingsDebounced();

    if (extension_settings.notifyUpdates) {
        checkForExtensionUpdates(true);
    }
}

/**
 * Connects to the Extras API.
 * @param {string} baseUrl Extras API base URL
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'baseUrl' implicitly has an 'any' type.
async function connectToApi(baseUrl) {
    if (!baseUrl) {
        return;
    }

    const url = new URL(baseUrl);
    url.pathname = '/api/modules';

    try {
        const getExtensionsResult = await doExtrasFetch(url);

        if (getExtensionsResult.ok) {
            const data = await getExtensionsResult.json();
            modules = data.modules;
            await activateExtensions();
            await eventSource.emit(event_types.EXTRAS_CONNECTED, modules);
        }

        updateStatus(getExtensionsResult.ok);
    } catch {
        updateStatus(false);
    }
}

/**
 * Updates the status of Extras API connection.
 * @param {boolean} success Whether the connection was successful
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'success' implicitly has an 'any' type.
function updateStatus(success) {
    connectedToApi = success;
    const _text = success ? t`Connected to API` : t`Could not connect to API`;
    const _class = success ? 'success' : 'failure';
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extensions_status').text(_text);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extensions_status').attr('class', _class);
}

/**
 * Adds a CSS file for an extension.
 * @param {string} name Extension name
 * @param {object} manifest Extension manifest
 * @returns {Promise<void>} When the CSS is loaded
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
function addExtensionStyle(name, manifest) {
    if (!manifest.css) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const url = `/scripts/extensions/${name}/${manifest.css}`;
        const id = sanitizeSelector(`${name}-css`);

        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        if ($(`link[id="${id}"]`).length === 0) {
            const link = document.createElement('link');
            link.id = id;
            link.rel = 'stylesheet';
            link.type = 'text/css';
            link.href = url;
            link.onload = function () {
                // @ts-expect-error TS(2794) FIXME: Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
                resolve();
            };
            link.onerror = function (e) {
                reject(e);
            };
            document.head.appendChild(link);
        }
    });
}

/**
 * Loads a JS file for an extension.
 * @param {string} name Extension name
 * @param {object} manifest Extension manifest
 * @returns {Promise<void>} When the script is loaded
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
function addExtensionScript(name, manifest) {
    if (!manifest.js) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const url = `/scripts/extensions/${name}/${manifest.js}`;
        const id = sanitizeSelector(`${name}-js`);
        let ready = false;

        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        if ($(`script[id="${id}"]`).length === 0) {
            const script = document.createElement('script');
            script.id = id;
            script.type = 'module';
            script.src = url;
            script.async = true;
            script.onerror = function (err) {
                reject(err);
            };
            script.onload = function () {
                if (!ready) {
                    ready = true;
                    // @ts-expect-error TS(2794) FIXME: Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
                    resolve();
                }
            };
            document.body.appendChild(script);
        }
    });
}

/**
 * Adds a localization data for an extension.
 * @param {string} name Extension name
 * @param {object} manifest Manifest object
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
function addExtensionLocale(name, manifest) {
    // No i18n data in the manifest
    if (!manifest.i18n || typeof manifest.i18n !== 'object') {
        return Promise.resolve();
    }

    const currentLocale = getCurrentLocale();
    const localeFile = manifest.i18n[currentLocale];

    // Manifest doesn't provide a locale file for the current locale
    if (!localeFile) {
        return Promise.resolve();
    }

    return fetch(`/scripts/extensions/${name}/${localeFile}`)
        .then(async response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data && typeof data === 'object') {
                addLocaleData(currentLocale, data);
            }
        })
        .catch(err => {
            console.log('Could not load extension locale data for ' + name, err);
        });
}

/**
 * Generates an element for displaying an extension in the UI.
 * @param {string} name - The name of the extension.
 * @param {object} manifest - The manifest of the extension.
 * @param {boolean} isActive - Whether the extension is active or not.
 * @param {boolean} isDisabled - Whether the extension is disabled or not.
 * @param {boolean} isExternal - Whether the extension is external or not.
 * @param {string} checkboxClass - The class for the checkbox HTML element.
 * @returns {HTMLElement} - The element that represents the extension.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
function generateExtensionElement(name, manifest, isActive, isDisabled, isExternal, checkboxClass) {
    /**
     *
     */
    function getExtensionIcon() {
        const type = getExtensionType(name);
        const icon = document.createElement('i');
        icon.classList.add('fa-sm', 'fa-fw', 'fa-solid');
        switch (type) {
            case 'global':
                icon.classList.add('fa-server');
                icon.title = t`This is a global extension, available for all users.`;
                break;
            case 'local':
                icon.classList.add('fa-user');
                icon.title = t`This is a local extension, available only for you.`;
                break;
            case 'system':
                icon.classList.add('fa-cog');
                icon.title = t`This is a built-in extension. It cannot be deleted and updates with the app.`;
                break;
            default:
                icon.classList.add('fa-question');
                icon.title = t`Unknown extension type.`;
                break;
        }
        return icon;
    }

    const isUserAdmin = isAdmin();
    const displayName = manifest.display_name;
    const displayVersion = manifest.version || '';
    const externalId = name.replace('third-party', '');

    // Root block
    const block = document.createElement('div');
    block.classList.add('extension_block');
    block.dataset.name = externalId;

    // Toggle
    const toggleDiv = document.createElement('div');
    toggleDiv.classList.add('extension_toggle');
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.dataset.name = name;
    if (isActive || isDisabled) {
        toggle.title = t`Click to toggle`;
        toggle.classList.add(isActive ? 'toggle_disable' : 'toggle_enable');
        if (checkboxClass) toggle.classList.add(checkboxClass);
        toggle.checked = isActive;
    } else {
        toggle.title = t`Cannot enable extension`;
        toggle.classList.add('extension_missing');
        if (checkboxClass) toggle.classList.add(checkboxClass);
        toggle.disabled = true;
    }
    toggleDiv.appendChild(toggle);
    block.appendChild(toggleDiv);

    // Icon
    const iconDiv = document.createElement('div');
    iconDiv.classList.add('extension_icon');
    iconDiv.appendChild(getExtensionIcon());
    block.appendChild(iconDiv);

    // Text block
    const textBlock = document.createElement('div');
    textBlock.classList.add('flexGrow', 'extension_text_block');

    const statusSpan = document.createElement('span');
    statusSpan.className = isActive ? 'extension_enabled' : isDisabled ? 'extension_disabled' : 'extension_missing';

    const nameSpan = document.createElement('span');
    nameSpan.classList.add('extension_name');
    nameSpan.textContent = displayName;

    const authorSpan = document.createElement('span');
    authorSpan.classList.add('extension_author');

    const versionSpan = document.createElement('span');
    versionSpan.classList.add('extension_version');
    versionSpan.textContent = displayVersion;

    statusSpan.append(nameSpan, authorSpan, versionSpan);

    if (isActive && Array.isArray(manifest.optional)) {
        const optional = new Set(manifest.optional);
        modules.forEach(x => optional.delete(x));
        if (optional.size > 0) {
            const modulesDiv = document.createElement('div');
            modulesDiv.classList.add('extension_modules');
            const optionalSpan = document.createElement('span');
            optionalSpan.classList.add('optional');
            optionalSpan.textContent = [...optional].join(', ');
            modulesDiv.append(t`Optional modules:`, ' ', optionalSpan);
            statusSpan.appendChild(modulesDiv);
        }
    } else if (!isDisabled) {
        // Neither active nor disabled
        const requirements = new Set(manifest.requires);
        modules.forEach(x => requirements.delete(x));
        if (requirements.size > 0) {
            const modulesDiv = document.createElement('div');
            modulesDiv.classList.add('extension_modules');
            const failureSpan = document.createElement('span');
            failureSpan.classList.add('failure');
            failureSpan.textContent = [...requirements].join(', ');
            modulesDiv.append(t`Missing modules:`, ' ', failureSpan);
            statusSpan.appendChild(modulesDiv);
        }
    }

    // if external, wrap the name in a link to the repo
    if (isExternal) {
        const originLink = document.createElement('a');
        originLink.appendChild(statusSpan);
        textBlock.appendChild(originLink);
    } else {
        textBlock.appendChild(statusSpan);
    }

    block.appendChild(textBlock);

    // Actions
    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('extension_actions', 'flex-container', 'alignItemsCenter');

    /**
     * Helper function to create an action button for an extension.
     * @param {string} cls Class name
     * @param {string} dataName Name of the extension
     * @param {string} title Title of the button
     * @param {string} iconClasses Classes for the icon
     * @returns {HTMLButtonElement} The created button element
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'cls' implicitly has an 'any' type.
    function makeActionButton(cls, dataName, title, iconClasses) {
        const btn = document.createElement('button');
        btn.classList.add(cls, 'menu_button');
        btn.dataset.name = dataName;
        btn.title = title;
        const icon = document.createElement('i');
        icon.classList.add(...iconClasses.split(' '));
        btn.appendChild(icon);
        return btn;
    }

    if (isExternal) {
        const updateBtn = makeActionButton('btn_update', externalId, t`Update available`, 'fa-solid fa-download fa-fw');
        updateBtn.classList.add('displayNone');
        actionsDiv.appendChild(updateBtn);
    }

    if (isExternal && hasExtensionHook(externalId, 'clean')) {
        actionsDiv.appendChild(makeActionButton('btn_clean', externalId,  t`Clean extension data`, 'fa-fw fa-solid fa-broom'));
    }

    if (isExternal && isUserAdmin) {
        actionsDiv.appendChild(makeActionButton('btn_branch', externalId, t`Switch branch`, 'fa-solid fa-code-branch fa-fw'));
        actionsDiv.appendChild(makeActionButton('btn_move', externalId, t`Move`, 'fa-solid fa-folder-tree fa-fw'));
    }

    if (isExternal) {
        actionsDiv.appendChild(makeActionButton('btn_delete', externalId, t`Delete`, 'fa-fw fa-solid fa-trash-can'));
    }

    block.appendChild(actionsDiv);

    return block;
}

/**
 * Gets extension data and generates the corresponding element for displaying the extension.
 * @param {Array} extension - An array where the first element is the extension name and the second element is the extension manifest.
 * @returns {{isExternal: boolean, extensionElement: HTMLElement}} - An object with 'isExternal' indicating whether the extension is external, and 'extensionElement' for the extension's HTML element.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'extension' implicitly has an 'any' type... Remove this comment to see the full error message
function getExtensionData(extension) {
    const name = extension[0];
    const manifest = extension[1];
    const isActive = activeExtensions.has(name);
    // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
    const isDisabled = extension_settings.disabledExtensions.includes(name);
    const isExternal = name.startsWith('third-party');

    const checkboxClass = isDisabled ? 'checkbox_disabled' : '';
    const extensionElement = generateExtensionElement(name, manifest, isActive, isDisabled, isExternal, checkboxClass);

    return { isExternal, extensionElement };
}


/**
 * Gets the module information to be displayed.
 * @returns {HTMLElement} - The element containing the module information.
 */
function getModuleInformation() {
    const container = document.createElement('div');

    const heading = document.createElement('h3');
    heading.textContent = t`Modules provided by your Extras API:`;
    container.appendChild(heading);

    const moduleInfo = document.createElement('p');
    if (modules.length) {
        moduleInfo.textContent = modules.join(', ');
    } else {
        moduleInfo.classList.add('failure');
        moduleInfo.textContent = t`Not connected to the API!`;
    }
    container.appendChild(moduleInfo);

    return container;
}

/**
 * Generates HTMLElement for the extension load errors.
 * @returns {HTMLElement} - The element containing the extension load errors.
 */
function getExtensionLoadErrors() {
    if (extensionLoadErrors.size === 0) {
        return document.createElement('div');
    }

    const container = document.createElement('div');
    container.classList.add('info-block', 'error');

    for (const error of extensionLoadErrors) {
        const errorElement = document.createElement('div');
        // @ts-expect-error TS(2322) FIXME: Type 'unknown' is not assignable to type 'string |... Remove this comment to see the full error message
        errorElement.textContent = error;
        container.appendChild(errorElement);
    }

    return container;
}

/**
 * Generates the HTML strings for all extensions and displays them in a popup.
 */
async function showExtensionsDetails() {
    const abortController = new AbortController();
    let popupPromise;
    try {
        // If we are updating an extension, the "old" popup is still active. We should close that.
        let initialScrollTop = 0;
        // @ts-expect-error TS(2339) FIXME: Property 'content' does not exist on type 'never'.
        const oldPopup = Popup.util.popups.find(popup => popup.content.querySelector('.extensions_info'));
        if (oldPopup) {
            // @ts-expect-error TS(2339) FIXME: Property 'content' does not exist on type 'never'.
            initialScrollTop = oldPopup.content.scrollTop;
            // @ts-expect-error TS(2339) FIXME: Property 'completeCancelled' does not exist on typ... Remove this comment to see the full error message
            await oldPopup.completeCancelled();
        }
        const errors = getExtensionLoadErrors();

        const defaultContainer = document.createElement('div');
        defaultContainer.classList.add('marginBot10');
        const defaultHeading = document.createElement('h3');
        defaultHeading.textContent = t`Built-in Extensions:`;
        defaultContainer.appendChild(defaultHeading);

        const externalContainer = document.createElement('div');
        externalContainer.classList.add('marginBot10');
        const externalHeader = document.createElement('div');
        externalHeader.classList.add('flex-container', 'alignitemscenter', 'spaceBetween', 'flexnowrap', 'marginBot10');
        const externalHeading = document.createElement('h3');
        externalHeading.classList.add('margin0');
        externalHeading.textContent = t`Installed Extensions:`;
        const thirdPartyToolbar = document.createElement('div');
        thirdPartyToolbar.classList.add('flex-container', 'third_party_toolbar');
        externalHeader.append(externalHeading, thirdPartyToolbar);
        externalContainer.appendChild(externalHeader);

        const loadingEl = document.createElement('div');
        loadingEl.classList.add('flex-container', 'alignItemsCenter', 'justifyCenter', 'marginTop10', 'marginBot5');
        const loadingIcon = document.createElement('i');
        loadingIcon.classList.add('fa-solid', 'fa-spinner', 'fa-spin');
        const loadingSpan = document.createElement('span');
        loadingSpan.textContent = t`Loading third-party extensions... Please wait...`;
        loadingEl.append(loadingIcon, loadingSpan);

        externalContainer.appendChild(loadingEl);

        const sortOrderKey = 'extensions_sortByName';
        const sortByName = accountStorage.getItem(sortOrderKey) === 'true';
        const sortFn = sortByName ? sortManifestsByName : sortManifestsByOrder;
        const extensions = Object.entries(manifests).sort((a, b) => sortFn(a[1], b[1])).map(getExtensionData);
        // @ts-expect-error TS(7034) FIXME: Variable 'extensionsToToggle' implicitly has type ... Remove this comment to see the full error message
        let extensionsToToggle = [];

        extensions.forEach(value => {
            const { isExternal, extensionElement } = value;
            const container = isExternal ? externalContainer : defaultContainer;
            container.appendChild(extensionElement);
        });

        const extensionsMenu = document.createElement('div');
        extensionsMenu.classList.add('extensions_info');
        extensionsMenu.append(errors, defaultContainer, externalContainer, getModuleInformation());

        {
            // @ts-expect-error TS(7006) FIXME: Parameter 'force' implicitly has an 'any' type.
            const updateAction = async (force) => {
                requiresReload = true;
                await autoUpdateExtensions(force);
                await popup.complete(POPUP_RESULT.AFFIRMATIVE);
            };

            const toolbar = document.createElement('div');
            toolbar.classList.add('extensions_toolbar');

            const updateAllButton = document.createElement('button');
            updateAllButton.classList.add('menu_button', 'menu_button_icon');
            updateAllButton.textContent = t`Update all`;
            updateAllButton.addEventListener('click', () => updateAction(true));

            const updateEnabledOnlyButton = document.createElement('button');
            updateEnabledOnlyButton.classList.add('menu_button', 'menu_button_icon');
            updateEnabledOnlyButton.textContent = t`Update enabled`;
            updateEnabledOnlyButton.addEventListener('click', () => updateAction(false));

            const toggleAllExtensionsButton = document.createElement('div');
            toggleAllExtensionsButton.classList.add('menu_button', 'menu_button_icon');
            toggleAllExtensionsButton.title = t`Bulk toggle third-party extensions.`;
            const toggleAllLabel = document.createElement('span');
            toggleAllLabel.textContent = t`Toggle extensions`;
            const toggleAllIcon = document.createElement('div');
            toggleAllIcon.classList.add('fa-solid', 'fa-circle-info', 'opacity50p');
            toggleAllExtensionsButton.append(toggleAllLabel, toggleAllIcon);

            const restoreBulkToggledExtensionsButton = document.createElement('div');
            restoreBulkToggledExtensionsButton.classList.add('menu_button', 'menu_button_icon', 'fa-solid', 'fa-arrow-right-rotate', 'displayNone');
            restoreBulkToggledExtensionsButton.title = t`Restore toggled extensions.\n\nIt does not restore extensions toggled individually.`;

            toggleAllExtensionsButton.addEventListener('click', () => {
                // @ts-expect-error TS(7005) FIXME: Variable 'extensionsToToggle' implicitly has an 'a... Remove this comment to see the full error message
                extensionsToToggle = onToggleAllExtensions(extensionsToToggle, $(externalContainer));

                for (const extension of extensionsToToggle) {
                    const { name } = extension;

                    const toggleInput = externalContainer.querySelector(`.extension_block[data-name="${getNameSelector(name)}"] .extension_toggle input`);
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $(toggleInput)
                        .off('click')
                        .one('click', () => {
                            // @ts-expect-error TS(7005) FIXME: Variable 'extensionsToToggle' implicitly has an 'a... Remove this comment to see the full error message
                            extensionsToToggle = extensionsToToggle.filter(ext => ext.name !== name);
                        });
                }

                const restoreButtonHandler = extensionsToToggle.length > 0 ? 'remove' : 'add';

                restoreBulkToggledExtensionsButton.classList[restoreButtonHandler]('displayNone');
            });

            restoreBulkToggledExtensionsButton.addEventListener('click', () => {
                // @ts-expect-error TS(7005) FIXME: Variable 'extensionsToToggle' implicitly has an 'a... Remove this comment to see the full error message
                for (const extension of extensionsToToggle) {
                    const { name } = extension;
                    // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
                    const isDisabled = extension_settings.disabledExtensions.includes(name);

                    const toggleInput = externalContainer.querySelector(`.extension_block[data-name="${getNameSelector(name)}"] .extension_toggle input`);
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $(toggleInput)
                        .prop('checked', !isDisabled)
                        .toggleClass('toggle_enable', isDisabled)
                        .toggleClass('toggle_disable', !isDisabled)
                        .toggleClass('checkbox_disabled', isDisabled);
                }

                extensionsToToggle = [];
                restoreBulkToggledExtensionsButton.classList.add('displayNone');
            });

            const flexExpander = document.createElement('div');
            flexExpander.classList.add('expander');

            const sortOrderButton = document.createElement('button');
            sortOrderButton.classList.add('menu_button', 'menu_button_icon');
            sortOrderButton.textContent = sortByName ? t`Sort: Display Name` : t`Sort: Loading Order`;
            sortOrderButton.addEventListener('click', async () => {
                abortController.abort();
                accountStorage.setItem(sortOrderKey, sortByName ? 'false' : 'true');
                await showExtensionsDetails();
            });

            toolbar.append(updateAllButton, updateEnabledOnlyButton, flexExpander, sortOrderButton);
            thirdPartyToolbar.append(restoreBulkToggledExtensionsButton, toggleAllExtensionsButton);
            extensionsMenu.prepend(toolbar);
        }

        let waitingForSave = false;

        const popup = new Popup(extensionsMenu, POPUP_TYPE.TEXT, '', {
            okButton: t`Close`,
            wide: true,
            large: true,
            // @ts-expect-error TS(2322) FIXME: Type 'never[]' is not assignable to type 'null | u... Remove this comment to see the full error message
            customButtons: [],
            allowVerticalScrolling: true,
            // @ts-expect-error TS(2322) FIXME: Type '() => Promise<boolean>' is not assignable to... Remove this comment to see the full error message
            onClosing: async () => {
                if (waitingForSave) {
                    return false;
                }

                // @ts-expect-error TS(7005) FIXME: Variable 'extensionsToToggle' implicitly has an 'a... Remove this comment to see the full error message
                for (const extension of extensionsToToggle) {
                    const { name, toggleHandler, enable } = extension;
                    // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
                    const isDisabled = extension_settings.disabledExtensions.includes(name);

                    try {
                        if (isDisabled && !enable) continue;
                        if (!isDisabled && enable) continue;

                        requiresReload = true;

                        await toggleHandler(name, false);
                    } catch (error) {
                        console.error(`Could not toggle extension ${name}:`, error);
                        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                        toastr.error(t`Could not toggle extension ${name}. See console for details.`);
                    }
                }

                if (stateChanged) {
                    waitingForSave = true;
                    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                    const toast = toastr.info(t`The page will be reloaded shortly...`, t`Extensions state changed`);
                    await saveSettings();
                    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                    toastr.clear(toast);
                    waitingForSave = false;
                    requiresReload = true;
                }

                return true;
            },
        });
        popupPromise = popup.show();
        popup.content.scrollTop = initialScrollTop;
        checkForUpdatesManual(sortFn, abortController.signal).finally(() => loadingEl.remove());
    } catch (error) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`Error loading extensions. See browser console for details.`);
        console.error(error);
    }
    if (popupPromise) {
        await popupPromise;
        abortController.abort();
    }
    if (requiresReload) {
        location.reload();
    }
}

/**
 * Handles the click event for the update button of an extension.
 * This function makes a POST request to '/api/extensions/update' with the extension's name.
 * If the extension is already up to date, it displays a success message.
 * If the extension is not up to date, it updates the extension and displays a success message with the new commit hash.
 */
async function onUpdateClick() {
    const isCurrentUserAdmin = isAdmin();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const extensionName = $(this).data('name');
    const isGlobal = getExtensionType(extensionName) === 'global';
    if (isGlobal && !isCurrentUserAdmin) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`You don't have permission to update global extensions.`);
        return;
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const icon = $(this.querySelector('i'));
    icon.addClass('fa-spin');
    await updateExtension(extensionName, false);
    // updateExtension eats the error, but we can at least stop the spinner
    icon.removeClass('fa-spin');
}

/**
 * Updates a third-party extension via the API.
 * @param {string} extensionName Extension folder name
 * @param {boolean} quiet If true, don't show a success message
 * @param {number?} timeout Timeout in milliseconds to wait for the update to complete. If null, no timeout is set.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'extensionName' implicitly has an 'any' ... Remove this comment to see the full error message
async function updateExtension(extensionName, quiet, timeout = null) {
    try {
        const signal = timeout ? AbortSignal.timeout(timeout) : undefined;
        const response = await fetch('/api/extensions/update', {
            method: 'POST',
            signal: signal,
            headers: getRequestHeaders(),
            body: JSON.stringify({
                extensionName,
                global: getExtensionType(extensionName) === 'global',
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(text || response.statusText, t`Extension update failed`, { timeOut: 5000 });
            console.error('Extension update failed', response.status, response.statusText, text);
            return;
        }

        const data = await response.json();

        if (!quiet) {
            void showExtensionsDetails();
        }

        if (data.isUpToDate) {
            if (!quiet) {
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.success('Extension is already up to date');
            }
        } else {
            const fullExtensionName = extensionName.startsWith('third-party') ? extensionName : `third-party${extensionName}`;
            await callExtensionHook(fullExtensionName, 'update');
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.success(t`Extension ${extensionName} updated to ${data.shortCommitHash}`, t`Reload the page to apply updates`);
        }
    } catch (error) {
        console.error('Extension update error:', error);
    }
}

/**
 * Handles the click event for the delete button of an extension.
 * This function makes a POST request to '/api/extensions/delete' with the extension's name.
 * If the extension is deleted, it displays a success message.
 * Creates a popup for the user to confirm before delete.
 * If the extension has a 'clean' hook, an optional checkbox to also run the cleanup is shown.
 */
async function onDeleteClick() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const extensionName = $(this).data('name');
    const isCurrentUserAdmin = isAdmin();
    const isGlobal = getExtensionType(extensionName) === 'global';
    if (isGlobal && !isCurrentUserAdmin) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`You don't have permission to delete global extensions.`);
        return;
    }

    const hasCleanHook = hasExtensionHook(extensionName, 'clean');

    /** @type {import('./popup.js').CustomPopupInput[]} */
    const customInputs = hasCleanHook ? [{ id: 'extension_delete_cleanup', label: t`Also clean up extension data`, defaultState: false }] : null;

    // @ts-expect-error TS(2322) FIXME: Type '{ id: string; label: any; defaultState: bool... Remove this comment to see the full error message
    const popup = new Popup(t`Are you sure you want to delete ${escapeHtml(extensionName)}?`, POPUP_TYPE.CONFIRM, '', { customInputs });
    const confirmation = await popup.show();
    if (confirmation === POPUP_RESULT.AFFIRMATIVE) {
        const shouldClean = hasCleanHook && Boolean(popup.inputResults?.get('extension_delete_cleanup'));
        await deleteExtension(extensionName, shouldClean);
    }
}

/**
 * Handles the click event for the clean button of an extension.
 * Runs the extension's 'clean' hook after user confirmation, then reloads the page.
 */
async function onCleanClick() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const extensionName = $(this).data('name');

    const confirmation = await Popup.show.confirm(t`Clean extension data`, t`Are you sure you want to clean up data for ${escapeHtml(extensionName)}? This action cannot be undone.`);
    if (!confirmation) {
        return;
    }

    await cleanExtension(extensionName);
}

/**
 * Runs the 'clean' hook for an extension and reloads the page.
 * @param {string} extensionName Extension name (without 'third-party' prefix)
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'extensionName' implicitly has an 'any' ... Remove this comment to see the full error message
async function cleanExtension(extensionName) {
    const fullExtensionName = extensionName.startsWith('third-party') ? extensionName : `third-party${extensionName}`;
    await callExtensionHook(fullExtensionName, 'clean');

    // Clean might have updated settings, which could race with the page reload, so we'll force save here
    await saveSettings();

    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
    toastr.success(t`Extension ${extensionName} data cleaned`);
    delay(1000).then(() => location.reload());
}

/**
 *
 */
async function onBranchClick() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const extensionName = $(this).data('name');
    const isCurrentUserAdmin = isAdmin();
    const isGlobal = getExtensionType(extensionName) === 'global';
    if (isGlobal && !isCurrentUserAdmin) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`You don't have permission to switch branch.`);
        return;
    }

    let newBranch = '';

    const branches = await getExtensionBranches(extensionName, isGlobal);
    const selectElement = document.createElement('select');
    selectElement.classList.add('text_pole', 'wide100p');
    selectElement.addEventListener('change', function () {
        newBranch = this.value;
    });
    for (const branch of branches) {
        const option = document.createElement('option');
        option.value = branch.name;
        option.textContent = `${branch.name} (${branch.commit}) [${branch.label}]`;
        option.selected = branch.current;
        selectElement.appendChild(option);
    }

    const popup = new Popup(selectElement, POPUP_TYPE.CONFIRM, '', {
        okButton: t`Switch`,
        cancelButton: t`Cancel`,
    });
    const popupResult = await popup.show();

    if (!popupResult || !newBranch) {
        return;
    }

    await switchExtensionBranch(extensionName, isGlobal, newBranch);
}

/**
 *
 */
async function onMoveClick() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const extensionName = $(this).data('name');
    const isCurrentUserAdmin = isAdmin();
    const isGlobal = getExtensionType(extensionName) === 'global';
    if (isGlobal && !isCurrentUserAdmin) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`You don't have permission to move extensions.`);
        return;
    }

    const source = getExtensionType(extensionName);
    const destination = source === 'global' ? 'local' : 'global';

    const confirmationHeader = t`Move extension`;
    const confirmationText = source == 'global'
        ? t`Are you sure you want to move ${escapeHtml(extensionName)} to your local extensions? This will make it available only for you.`
        : t`Are you sure you want to move ${escapeHtml(extensionName)} to the global extensions? This will make it available for all users.`;

    const confirmation = await Popup.show.confirm(confirmationHeader, confirmationText);

    if (!confirmation) {
        return;
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(this.querySelector('i')).addClass('fa-spin');
    await moveExtension(extensionName, source, destination);
}

/**
 * Moves an extension via the API.
 * @param {string} extensionName Extension name
 * @param {string} source Source type
 * @param {string} destination Destination type
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'extensionName' implicitly has an 'any' ... Remove this comment to see the full error message
async function moveExtension(extensionName, source, destination) {
    try {
        const result = await fetch('/api/extensions/move', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                extensionName,
                source,
                destination,
            }),
        });

        if (!result.ok) {
            const text = await result.text();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(text || result.statusText, t`Extension move failed`, { timeOut: 5000 });
            console.error('Extension move failed', result.status, result.statusText, text);
            return;
        }

        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success(t`Extension ${extensionName} moved.`);
        await loadExtensionSettings({}, false, false);
        void showExtensionsDetails();
    } catch (error) {
        console.error('Error:', error);
    }
}

/**
 * Deletes an extension via the API.
 * @param {string} extensionName Extension name to delete
 * @param {boolean} [shouldClean] Whether to also run the 'clean' hook before deleting
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'extensionName' implicitly has an 'any' ... Remove this comment to see the full error message
export async function deleteExtension(extensionName, shouldClean = false) {
    const fullExtensionName = extensionName.startsWith('third-party') ? extensionName : `third-party${extensionName}`;

    if (shouldClean) {
        await callExtensionHook(fullExtensionName, 'clean');
    }

    await callExtensionHook(fullExtensionName, 'delete');

    try {
        await fetch('/api/extensions/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                extensionName,
                global: getExtensionType(extensionName) === 'global',
            }),
        });
    } catch (error) {
        console.error('Error:', error);
    }

    // Delete or clean might have updated settings, which could race with the page reload, so we'll force save here
    await saveSettings();

    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
    toastr.success(t`Extension ${extensionName} deleted`);
    delay(1000).then(() => location.reload());
}

/**
 * Fetches the version details of a specific extension.
 * @param {string} extensionName - The name of the extension.
 * @param {AbortSignal} [abortSignal] - The signal to abort the operation.
 * @returns {Promise<object>} - An object containing the extension's version details.
 * This object includes the currentBranchName, currentCommitHash, isUpToDate, and remoteUrl.
 * @throws {error} - If there is an error during the fetch operation, it logs the error to the console.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'extensionName' implicitly has an 'any' ... Remove this comment to see the full error message
async function getExtensionVersion(extensionName, abortSignal) {
    try {
        const response = await fetch('/api/extensions/version', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                extensionName,
                global: getExtensionType(extensionName) === 'global',
            }),
            signal: abortSignal,
        });

        const data = await response.json();
        return data;
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            return;
        }
        console.error('Error:', error);
    }
}

/**
 * Gets the list of branches for a specific extension.
 * @param {string} extensionName The name of the extension
 * @param {boolean} isGlobal Whether the extension is global or not
 * @returns {Promise<ExtensionBranch[]>} List of branches for the extension
 * @typedef {object} ExtensionBranch
 * @property {string} name The name of the branch
 * @property {string} commit The commit hash of the branch
 * @property {boolean} current Whether this branch is the current one
 * @property {string} label The commit label of the branch
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'extensionName' implicitly has an 'any' ... Remove this comment to see the full error message
async function getExtensionBranches(extensionName, isGlobal) {
    try {
        const response = await fetch('/api/extensions/branches', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                extensionName,
                global: isGlobal,
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(text || response.statusText, t`Extension branches fetch failed`);
            console.error('Extension branches fetch failed', response.status, response.statusText, text);
            return [];
        }

        return await response.json();
    } catch (error) {
        console.error('Error:', error);
        return [];
    }
}

/**
 * Switches the branch of an extension.
 * @param {string} extensionName The name of the extension
 * @param {boolean} isGlobal If the extension is global
 * @param {string} branch Branch name to switch to
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'extensionName' implicitly has an 'any' ... Remove this comment to see the full error message
async function switchExtensionBranch(extensionName, isGlobal, branch) {
    try {
        const response = await fetch('/api/extensions/switch', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                extensionName,
                branch,
                global: isGlobal,
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(text || response.statusText, t`Extension branch switch failed`);
            console.error('Extension branch switch failed', response.status, response.statusText, text);
            return;
        }

        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success(t`Extension ${extensionName} switched to ${branch}`, t`Reload the page to apply updates`);
        await loadExtensionSettings({}, false, false);
        void showExtensionsDetails();
    } catch (error) {
        console.error('Error:', error);
    }
}

/**
 * Installs a third-party extension via the API.
 * @param {string} url Extension repository URL
 * @param {boolean} global Is the extension global?
 * @param {string} [branch] Optional branch to install, if not provided the default branch will be used
 * @returns {Promise<boolean>} True if the extension was installed successfully, false otherwise
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'url' implicitly has an 'any' type.
export async function installExtension(url, global, branch = '') {
    try {
        const parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            throw new Error('Invalid URL protocol');
        }

        // Normalize the URL (resolve relative paths, remove redundant segments, etc.)
        url = parsedUrl.href;
    } catch (error) {
        console.error('Invalid URL:', error);
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`Only valid HTTP and HTTPS URLs are allowed.`, t`Invalid URL`);
        return false;
    }

    if (!isOfficialExtension(url)) {
        const extensionInstallationWarningKey = 'extensionInstallationWarningShown';
        if (accountStorage.getItem(extensionInstallationWarningKey)) {
            console.debug('Bypassed URL check for third-party extension (account preference).', url);
        } else {
            let dismissWarning = false;
            const confirmation = await Popup.show.confirm(
                t`Install a third-party extension?`,
                await renderTemplateAsync('thirdPartyExtensionWarning'),
                {
                    customInputs: [{ id: 'dontAskAgain', type: 'checkbox', label: t`Don't show this warning again`, defaultState: false }],
                    // @ts-expect-error TS(7006) FIXME: Parameter 'popup' implicitly has an 'any' type.
                    onClose: (popup) => {
                        if (!popup.result) {
                            return;
                        }
                        dismissWarning = Boolean(popup.inputResults?.get('dontAskAgain') ?? false);
                    },
                    okButton: t`Yes, install it`,
                    cancelButton: t`No, cancel`,
                });
            if (!confirmation) {
                return false;
            }
            if (dismissWarning) {
                accountStorage.setItem(extensionInstallationWarningKey, '1');
            }
        }
    }

    console.debug('Extension installation started', url);

    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
    toastr.info(t`Please wait...`, t`Installing extension`);

    const request = await fetch('/api/extensions/install', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            url,
            global,
            branch,
        }),
    });

    if (!request.ok) {
        const text = await request.text();
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning(text || request.statusText, t`Extension installation failed`, { timeOut: 5000 });
        console.error('Extension installation failed', request.status, request.statusText, text);
        return false;
    }

    const response = await request.json();
    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
    toastr.success(t`Extension '${response.display_name}' has been installed successfully!`, t`Extension installation successful`);
    console.debug(`Extension "${response.display_name}" has been installed successfully at ${response.extensionPath}`);
    await loadExtensionSettings({}, false, false);
    await eventSource.emit(event_types.EXTENSION_SETTINGS_LOADED, response);

    if (response.folderName) {
        const extensionName = `third-party/${response.folderName}`;
        await callExtensionHook(extensionName, 'install');
    }

    return true;
}

/**
 * Loads extension settings from the app settings.
 * @param {object} settings App Settings
 * @param {boolean} versionChanged Is this a version change?
 * @param {boolean} enableAutoUpdate Enable auto-update
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'settings' implicitly has an 'any' type.
export async function loadExtensionSettings(settings, versionChanged, enableAutoUpdate) {
    if (settings.extension_settings) {
        Object.assign(extension_settings, settings.extension_settings);
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extensions_url').val(extension_settings.apiUrl);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extensions_api_key').val(extension_settings.apiKey);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extensions_autoconnect').prop('checked', extension_settings.autoConnect);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extensions_notify_updates').prop('checked', extension_settings.notifyUpdates);

    // Activate offline extensions
    await eventSource.emit(event_types.EXTENSIONS_FIRST_LOAD);
    const extensions = await discoverExtensions();
    // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
    extensionNames = extensions.map(x => x.name);
    // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
    extensionTypes = Object.fromEntries(extensions.map(x => [x.name, x.type]));
    manifests = await getManifests(extensionNames);

    if (versionChanged && enableAutoUpdate) {
        await autoUpdateExtensions(false);
    }

    await activateExtensions();
    if (extension_settings.autoConnect && extension_settings.apiUrl) {
        connectToApi(extension_settings.apiUrl);
    }
}

/**
 *
 */
export function doDailyExtensionUpdatesCheck() {
    setTimeout(() => {
        if (extension_settings.notifyUpdates) {
            checkForExtensionUpdates(false);
        }
    }, 1);
}

const concurrencyLimit = 5;
let activeRequestsCount = 0;
// @ts-expect-error TS(7034) FIXME: Variable 'versionCheckQueue' implicitly has type '... Remove this comment to see the full error message
const versionCheckQueue = [];

/**
 *
 * @param fn
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'fn' implicitly has an 'any' type.
function enqueueVersionCheck(fn) {
    return new Promise((resolve, reject) => {
        versionCheckQueue.push(() => fn().then(resolve).catch(reject));
        processVersionCheckQueue();
    });
}

/**
 *
 */
function processVersionCheckQueue() {
    if (activeRequestsCount >= concurrencyLimit || versionCheckQueue.length === 0) {
        return;
    }
    activeRequestsCount++;
    // @ts-expect-error TS(7005) FIXME: Variable 'versionCheckQueue' implicitly has an 'an... Remove this comment to see the full error message
    const fn = versionCheckQueue.shift();
    fn().finally(() => {
        activeRequestsCount--;
        processVersionCheckQueue();
    });
}

/**
 * Performs a manual check for updates on all 3rd-party extensions.
 * @param {function} sortFn Sort function
 * @param {AbortSignal} abortSignal Signal to abort the operation
 * @returns {Promise<any[]>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'sortFn' implicitly has an 'any' type.
async function checkForUpdatesManual(sortFn, abortSignal) {
    const promises = [];
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    for (const id of Object.keys(manifests).filter(x => x.startsWith('third-party')).sort((a, b) => sortFn(manifests[a], manifests[b]))) {
        const externalId = id.replace('third-party', '');
        const promise = enqueueVersionCheck(async () => {
            try {
                const data = await getExtensionVersion(externalId, abortSignal);
                if (!data) {
                    return;
                }
                const selector = getNameSelector(externalId, { prefix: '' });
                const extensionBlock = document.querySelector(`.extension_block[data-name="${selector}"]`);
                if (extensionBlock && data) {
                    if (data.isUpToDate === false) {
                        const buttonElement = extensionBlock.querySelector('.btn_update');
                        if (buttonElement) {
                            buttonElement.classList.remove('displayNone');
                        }
                        const nameElement = extensionBlock.querySelector('.extension_name');
                        if (nameElement) {
                            nameElement.classList.add('update_available');
                        }
                    }
                    const branch = data.currentBranchName;
                    const commitHash = data.currentCommitHash;
                    const origin = data.remoteUrl;

                    const originLink = extensionBlock.querySelector('a');
                    if (originLink) {
                        try {
                            const url = new URL(origin);
                            if (!['https:', 'http:'].includes(url.protocol)) {
                                throw new Error('Invalid protocol');
                            }
                            originLink.href = url.href;
                            originLink.target = '_blank';
                            originLink.rel = 'noopener noreferrer';
                        } catch (error) {
                            console.log('Error setting origin link', originLink, error);
                        }
                    }

                    const authorElement = extensionBlock.querySelector('.extension_author');
                    if (authorElement) {
                        const author = getAuthorFromUrl(origin) || EMPTY_AUTHOR;
                        if (author.name) {
                            const icon = document.createElement('i');
                            icon.classList.add('fa-solid', 'fa-at', 'fa-xs');
                            const name = document.createElement('span');
                            name.textContent = author.name;
                            authorElement.append(icon, name);
                        }
                    }

                    const versionElement = extensionBlock.querySelector('.extension_version');
                    if (versionElement) {
                        versionElement.textContent += ` (${branch}-${commitHash.substring(0, 7)})`;
                    }
                }
            } catch (error) {
                console.error('Error checking for extension updates', error);
            }
        });
        promises.push(promise);
    }
    return Promise.allSettled(promises);
}

/**
 * Checks if there are updates available for enabled 3rd-party extensions.
 * @param {boolean} force Skip nag check
 * @returns {Promise<any>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'force' implicitly has an 'any' type.
async function checkForExtensionUpdates(force) {
    if (!force) {
        const STORAGE_NAG_KEY = 'extension_update_nag';
        const currentDate = new Date().toDateString();

        // Don't nag more than once a day
        if (accountStorage.getItem(STORAGE_NAG_KEY) === currentDate) {
            return;
        }

        accountStorage.setItem(STORAGE_NAG_KEY, currentDate);
    }

    const isCurrentUserAdmin = isAdmin();
    // @ts-expect-error TS(7034) FIXME: Variable 'updatesAvailable' implicitly has type 'a... Remove this comment to see the full error message
    const updatesAvailable = [];
    const promises = [];

    for (const [id, manifest] of Object.entries(manifests)) {
        // @ts-expect-error TS(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
        const isDisabled = extension_settings.disabledExtensions.includes(id);
        if (isDisabled) {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            console.debug(`Skipping extension: ${manifest.display_name} (${id}) for non-admin user`);
            continue;
        }
        const isGlobal = getExtensionType(id) === 'global';
        if (isGlobal && !isCurrentUserAdmin) {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            console.debug(`Skipping global extension: ${manifest.display_name} (${id}) for non-admin user`);
            continue;
        }

        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        if (manifest.auto_update && id.startsWith('third-party')) {
            const promise = enqueueVersionCheck(async () => {
                try {
                    // @ts-expect-error TS(2554) FIXME: Expected 2 arguments, but got 1.
                    const data = await getExtensionVersion(id.replace('third-party', ''));
                    if (!data) {
                        return;
                    }
                    if (!data.isUpToDate) {
                        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                        updatesAvailable.push(manifest.display_name);
                    }
                } catch (error) {
                    console.error('Error checking for extension updates', error);
                }
            });
            promises.push(promise);
        }
    }

    await Promise.allSettled(promises);

    if (updatesAvailable.length > 0) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info(`${updatesAvailable.map(x => `• ${x}`).join('\n')}`, t`Extension updates available`);
    }
}

/**
 * Updates all enabled 3rd-party extensions that have auto-update enabled.
 * @param {boolean} forceAll Include disabled and not auto-updating
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'forceAll' implicitly has an 'any' type.
async function autoUpdateExtensions(forceAll) {
    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
    if (!Object.values(manifests).some(x => x.auto_update)) {
        return;
    }

    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
    const banner = toastr.info(t`Auto-updating extensions. This may take several minutes.`, t`Please wait...`, { timeOut: 10000, extendedTimeOut: 10000 });
    const isCurrentUserAdmin = isAdmin();
    const promises = [];
    const autoUpdateTimeout = 60 * 1000;
    for (const [id, manifest] of Object.entries(manifests)) {
        // @ts-expect-error TS(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
        const isDisabled = extension_settings.disabledExtensions.includes(id);
        if (!forceAll && isDisabled) {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            console.debug(`Skipping extension: ${manifest.display_name} (${id}) for non-admin user`);
            continue;
        }
        const isGlobal = getExtensionType(id) === 'global';
        if (isGlobal && !isCurrentUserAdmin) {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            console.debug(`Skipping global extension: ${manifest.display_name} (${id}) for non-admin user`);
            continue;
        }
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        if ((forceAll || manifest.auto_update) && id.startsWith('third-party')) {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            console.debug(`Auto-updating 3rd-party extension: ${manifest.display_name} (${id})`);
            // @ts-expect-error TS(2345) FIXME: Argument of type 'number' is not assignable to par... Remove this comment to see the full error message
            promises.push(updateExtension(id.replace('third-party', ''), true, autoUpdateTimeout));
        }
    }
    await Promise.allSettled(promises);
    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
    toastr.clear(banner);
}

/**
 * Runs the generate interceptors for all extensions.
 * @param {any[]} chat Chat array
 * @param {number} contextSize Context size
 * @param {string} type Generation type
 * @returns {Promise<boolean>} True if generation should be aborted
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'chat' implicitly has an 'any' type.
export async function runGenerationInterceptors(chat, contextSize, type) {
    let aborted = false;
    let exitImmediately = false;

    // @ts-expect-error TS(7006) FIXME: Parameter 'immediately' implicitly has an 'any' ty... Remove this comment to see the full error message
    const abort = (/** @type {boolean} */ immediately) => {
        aborted = true;
        exitImmediately = immediately;
    };

    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
    for (const manifest of Object.values(manifests).filter(x => x.generate_interceptor).sort((a, b) => sortManifestsByOrder(a, b))) {
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        const interceptorKey = manifest.generate_interceptor;
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        if (typeof globalThis[interceptorKey] === 'function') {
            try {
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                await globalThis[interceptorKey](chat, contextSize, abort, type);
            } catch (e) {
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                console.error(`Failed running interceptor for ${manifest.display_name}`, e);
            }
        }

        if (exitImmediately) {
            break;
        }
    }

    return aborted;
}

/**
 * Sentinel value that signals a field should be completely removed (unset)
 * from the character card rather than being set to any value. Pass this as
 * the `value` argument to {@link writeExtensionField} or
 * {@link writeExtensionFieldBulk} to delete the key entirely.
 *
 * Using `null` as a value will set the field to `null` (the key remains).
 * Using this sentinel will delete the key from the character card.
 * @type {string}
 */
export const UNSET_VALUE = '__@@UNSET@@__';

/**
 * Writes a field to the character's data extensions object.
 * @param {number|string} characterId Index in the character array
 * @param {string} key Field name
 * @param {any} value Field value
 * @returns {Promise<void>} When the field is written
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'characterId' implicitly has an 'any' ty... Remove this comment to see the full error message
export async function writeExtensionField(characterId, key, value) {
    const context = getContext();
    const character = context.characters[characterId];
    if (!character) {
        console.warn('Character not found', characterId);
        return;
    }
    const extensionPath = `data.extensions.${key}`;
    const isUnset = value === UNSET_VALUE;

    if (isUnset) {
        deleteValueByPath(character, extensionPath);
    } else {
        setValueByPath(character, extensionPath, value);
    }

    // Process JSON data
    // @ts-expect-error TS(2339) FIXME: Property 'json_data' does not exist on type 'never... Remove this comment to see the full error message
    if (character.json_data) {
        // @ts-expect-error TS(2339) FIXME: Property 'json_data' does not exist on type 'never... Remove this comment to see the full error message
        const jsonData = JSON.parse(character.json_data);
        if (isUnset) {
            deleteValueByPath(jsonData, extensionPath);
        } else {
            setValueByPath(jsonData, extensionPath, value);
        }
        // @ts-expect-error TS(2339) FIXME: Property 'json_data' does not exist on type 'never... Remove this comment to see the full error message
        character.json_data = JSON.stringify(jsonData);

        // Make sure the data doesn't get lost when saving the current character
        if (Number(characterId) === Number(context.characterId)) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#character_json_data').val(character.json_data);
        }
    }

    // Save data to the server
    const saveDataRequest = {
        // @ts-expect-error TS(2339) FIXME: Property 'avatar' does not exist on type 'never'.
        avatar: character.avatar,
        data: {
            extensions: {
                [key]: value,
            },
        },
    };
    const mergeResponse = await fetch('/api/characters/merge-attributes', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(saveDataRequest),
    });

    if (!mergeResponse.ok) {
        console.error('Failed to save extension field', mergeResponse.statusText);
    }
}

/**
 * @typedef {object} BulkExtensionFieldResult
 * @property {string[]} updated  Avatar filenames that were successfully updated
 * @property {string[]} skipped  Avatar filenames skipped (filter didn't match or unreadable)
 * @property {string[]} failed   Avatar filenames where the update failed
 */

/**
 * Writes (or deletes) an extension field for multiple characters in a single
 * bulk request. Unlike {@link writeExtensionField}, this sends one API call
 * for all characters, and the server processes them in parallel.
 *
 * When `value` is {@link UNSET_VALUE} the extension key is **deleted** from
 * each matching character card. Passing `null` sets the field to `null`
 * (the key is preserved).
 * @param {string[]|null} avatars Avatar filenames to update. Pass `null` or an
 *   empty array to target **all** characters in the user's character directory.
 * @param {string} key Extension field name (e.g. "greeting_tools")
 * @param {any} value Field value, `null` to set null, or
 *   {@link UNSET_VALUE} to delete the key entirely
 * @param {object} [options] Optional settings
 * @param {string} [options.filterPath] Dot-path filter — the server will only
 *   update characters where this path is present and not `undefined`;
 *   `null` still counts as a match. Useful when the frontend has shallow
 *   character data and cannot pre-filter.
 *   Defaults to `data.extensions.<key>` when unsetting, so deletion requests
 *   automatically skip characters where the field is missing/`undefined`.
 * @returns {Promise<BulkExtensionFieldResult>} Summary of the bulk operation
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'avatars' implicitly has an 'any' type.
export async function writeExtensionFieldBulk(avatars, key, value, {
    filterPath
}: { filterPath?: string } = {}) {
    const context = getContext();
    const extensionPath = `data.extensions.${key}`;
    const isUnset = value === UNSET_VALUE;

    // Build the server request
    const requestBody = {
        avatars: Array.isArray(avatars) && avatars.length > 0 ? avatars : [],
        data: {
            data: {
                extensions: {
                    [key]: value,
                },
            },
        },
    };

    // Default filter: when unsetting, only touch characters that have the field
    const resolvedFilterPath = filterPath ?? (isUnset ? extensionPath : undefined);
    if (resolvedFilterPath) {
        // @ts-expect-error TS(2339) FIXME: Property 'filter' does not exist on type '{ avatar... Remove this comment to see the full error message
        requestBody.filter = { path: resolvedFilterPath };
    }

    const mergeResponse = await fetch('/api/characters/merge-attributes', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(requestBody),
    });

    if (!mergeResponse.ok) {
        console.error('Bulk extension field update failed', mergeResponse.statusText);
        return { updated: [], skipped: [], failed: [] };
    }

    /** @type {BulkExtensionFieldResult} */
    const result = await mergeResponse.json();

    // Sync in-memory character objects for successfully updated characters
    const updatedSet = new Set(result.updated);
    for (const character of context.characters) {
        // @ts-expect-error TS(2339) FIXME: Property 'avatar' does not exist on type 'never'.
        if (!character || !updatedSet.has(character.avatar)) continue;

        if (isUnset) {
            deleteValueByPath(character, extensionPath);
        } else {
            setValueByPath(character, extensionPath, value);
        }

        // Keep json_data in sync
        // @ts-expect-error TS(2339) FIXME: Property 'json_data' does not exist on type 'never... Remove this comment to see the full error message
        if (character.json_data) {
            // @ts-expect-error TS(2339) FIXME: Property 'json_data' does not exist on type 'never... Remove this comment to see the full error message
            const jsonData = JSON.parse(character.json_data);
            if (isUnset) {
                deleteValueByPath(jsonData, extensionPath);
            } else {
                setValueByPath(jsonData, extensionPath, value);
            }
            // @ts-expect-error TS(2339) FIXME: Property 'json_data' does not exist on type 'never... Remove this comment to see the full error message
            character.json_data = JSON.stringify(jsonData);
        }
    }

    // If the currently active character was updated, sync the hidden input
    if (context.characterId !== undefined) {
        const activeChar = context.characters[context.characterId];
        // @ts-expect-error TS(2339) FIXME: Property 'avatar' does not exist on type 'never'.
        if (activeChar && updatedSet.has(activeChar.avatar) && activeChar.json_data) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#character_json_data').val(activeChar.json_data);
        }
    }

    return result;
}

/**
 * Prompts the user to enter the Git URL of the extension to import.
 * After obtaining the Git URL, makes a POST request to '/api/extensions/install' to import the extension.
 * If the extension is imported successfully, a success message is displayed.
 * If the extension import fails, an error message is displayed and the error is logged to the console.
 * After successfully importing the extension, the extension settings are reloaded and a 'EXTENSION_SETTINGS_LOADED' event is emitted.
 * @param {string} [suggestUrl] Suggested URL to install
 * @returns {Promise<void>}
 */
export async function openThirdPartyExtensionMenu(suggestUrl = '') {
    const isCurrentUserAdmin = isAdmin();
    const html = await renderTemplateAsync('installExtension', { isCurrentUserAdmin });
    const okButton = isCurrentUserAdmin ? t`Install just for me` : t`Install`;

    let global = false;
    const installForAllButton = {
        text: t`Install for all users`,
        appendAtEnd: false,
        action: async () => {
            global = true;
            await popup.complete(POPUP_RESULT.AFFIRMATIVE);
        },
    };
    /** @type {import('./popup.js').CustomPopupInput} */
    const branchNameInput = {
        id: 'extension_branch_name',
        label: t`Branch or tag name (optional)`,
        type: 'text',
        tooltip: 'e.g. main, dev, v1.0.0',
    };

    const customButtons = isCurrentUserAdmin ? [installForAllButton] : [];
    const customInputs = [branchNameInput];
    // @ts-expect-error TS(2322) FIXME: Type '{ text: any; appendAtEnd: boolean; action: (... Remove this comment to see the full error message
    const popup = new Popup(html, POPUP_TYPE.INPUT, suggestUrl ?? '', { okButton, customButtons, customInputs });
    const input = await popup.show();

    if (!input) {
        console.debug('Extension install cancelled');
        return;
    }

    const url = String(input).trim();
    const branchName = String(popup.inputResults.get('extension_branch_name') ?? '').trim();
    await installExtension(url, global, branchName);
}

/**
 * Sentinel value representing an empty author, used when author information cannot be extracted from a URL.
 * @type {{name: string, url: string}}
 */
export const EMPTY_AUTHOR = Object.freeze({
    name: '',
    url: '',
});

/**
 * Extracts the repository author from a given URL.
 * @param {string} url - The URL of the repository.
 * @returns {{name: string, url: string}} Object containing the author's name and URL, or empty strings if not found.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'url' implicitly has an 'any' type.
export function getAuthorFromUrl(url) {
    const result = structuredClone(EMPTY_AUTHOR);

    try {
        const parsedUrl = new URL(url);
        // @ts-expect-error TS(7006) FIXME: Parameter 's' implicitly has an 'any' type.
        const pathSegments = parsedUrl.pathname.split('/').filter(s => s.length > 0);

        // TODO: Handle non-GitHub URLs if needed
        if (parsedUrl.host === 'github.com' && pathSegments.length >= 2) {
            // @ts-expect-error TS(2540) FIXME: Cannot assign to 'name' because it is a read-only ... Remove this comment to see the full error message
            result.name = pathSegments[0];
            // @ts-expect-error TS(2540) FIXME: Cannot assign to 'url' because it is a read-only p... Remove this comment to see the full error message
            result.url = `${parsedUrl.protocol}//${parsedUrl.hostname}/${result.name}`;
        }
    } catch (error) {
        console.debug('Error parsing URL:', error);
    }

    return result;
}

/**
 *
 */
export async function initExtensions() {
    await addExtensionsButtonAndMenu();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extensionsMenuButton').css('display', 'flex');

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extensions_connect').on('click', connectClickHandler);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extensions_autoconnect').on('input', autoConnectInputHandler);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extensions_details').on('click', showExtensionsDetails);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#extensions_notify_updates').on('input', notifyUpdatesInputHandler);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.extensions_info .extension_block .toggle_disable', onDisableExtensionClick);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.extensions_info .extension_block .toggle_enable', onEnableExtensionClick);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.extensions_info .extension_block .btn_update', onUpdateClick);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.extensions_info .extension_block .btn_delete', onDeleteClick);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.extensions_info .extension_block .btn_clean', onCleanClick);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.extensions_info .extension_block .btn_move', onMoveClick);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.extensions_info .extension_block .btn_branch', onBranchClick);

    /**
     * Handles the click event for the third-party extension import button.
     * @listens #third_party_extension_button#click - The click event of the '#third_party_extension_button' element.
     */
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#third_party_extension_button').on('click', () => openThirdPartyExtensionMenu());
}
