import { eventSource, event_types, saveSettings, saveSettingsDebounced, getRequestHeaders, CLIENT_VERSION } from '../script.js';
import { POPUP_RESULT, POPUP_TYPE, Popup } from './popup.js';
import { renderTemplateAsync } from './templates.js';
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
export let extensionNames: string[] = [];

/**
 * Holds the type of each extension.
 * Don't use this directly, use getExtensionType instead!
 * @type {Record<string, string>}
 */
export let extensionTypes: Record<string, string> = {};

/**
 * A list of active modules provided by the Extras API.
 * @type {string[]}
 */
export let modules: string[] = [];

/**
 * A set of active extensions.
 * @type {Set<string>}
 */
const activeExtensions = new Set<string>();

/**
 * Errors that occurred while loading extensions.
 * @type {Set<string>}
 */
const extensionLoadErrors = new Set<string>();

const getApiUrl = () => extension_settings.apiUrl;
const sortManifestsByOrder = (a: Record<string, unknown>, b: Record<string, unknown>) => parseInt(a.loading_order as string) - parseInt(b.loading_order as string) || String(a.display_name).localeCompare(String(b.display_name));
const sortManifestsByName = (a: Record<string, unknown>, b: Record<string, unknown>) => String(a.display_name).localeCompare(String(b.display_name)) || parseInt(a.loading_order as string) - parseInt(b.loading_order as string);
let connectedToApi = false;

/**
 * Holds manifest data for each extension.
 * @type {Record<string, object>}
 */
let manifests: Record<string, Record<string, unknown>> = {};

/**
 * Default URL for the Extras API.
 */
const defaultUrl = 'http://localhost:5100';

/**
 * Checks if the extension is officially supported by its URL pattern.
 * @param {string} url URL to check
 * @returns {boolean} True if the URL matches the pattern, false otherwise (or not a valid URL)
 */
export const isOfficialExtension = (url: string): boolean => {
    try {
        return /^https:\/\/github\.com\/SillyTavern\/(.+)$/i.test(new URL(url).href);
    } catch {
        return false;
    }
};

let requiresReload = false;
let stateChanged = false;
let saveMetadataTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 *
 */
export function cancelDebouncedMetadataSave(): void {
    if (saveMetadataTimeout) {
        console.debug('Debounced metadata save cancelled');
        clearTimeout(saveMetadataTimeout);
        saveMetadataTimeout = null;
    }
}

/**
 *
 */
export function saveMetadataDebounced(): void {
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
 * Provides an ability for extensions to render HTML templates asynchronously.
 * Templates sanitation and localization is forced.
 * @param {string} extensionName Extension name
 * @param {string} templateId Template ID
 * @param {object} templateData Additional data to pass to the template
 * @param sanitize
 * @param localize
 * @returns {Promise<string>} Rendered HTML
 */
export function renderExtensionTemplateAsync(extensionName: string, templateId: string, templateData: Record<string, unknown> = {}, sanitize = true, localize = true): Promise<string> {
    return renderTemplateAsync(`scripts/extensions/${extensionName}/${templateId}.html`, templateData, sanitize, localize, true);
}

export const extension_settings: Record<string, unknown> = {
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
function showHideExtensionsMenu(): void {
    // Get the number of menu items that are not hidden
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return;
    const hasMenuItems = Array.from(menu.children).some(child => getComputedStyle(child).display !== 'none');

    // We have menu items, so we can stop checking
    if (hasMenuItems) {
        clearInterval(menuInterval);
    }

    // Show or hide the menu button
    const menuButton = document.getElementById('extensionsMenuButton');
    if (menuButton) menuButton.style.display = hasMenuItems ? '' : 'none';
}

// Periodically check for new extensions
const menuInterval = setInterval(showHideExtensionsMenu, 1000);

/**
 * Gets the type of an extension based on its external ID.
 * @param {string} externalId External ID of the extension (excluding or including the leading 'third-party/')
 * @returns {string} Type of the extension (global, local, system, or empty string if not found)
 */
function getExtensionType(externalId: string): string {
    const id = Object.keys(extensionTypes).find(id => id === externalId || (id.startsWith('third-party') && id.endsWith(externalId)));
    return id ? extensionTypes[id]! : '';
}

/**
 * Performs a fetch of the Extras API.
 * @param {string|URL} endpoint Extras API endpoint
 * @param {RequestInit} args Request arguments
 * @returns {Promise<Response>} Response from the fetch
 */
export async function doExtrasFetch(endpoint: string | URL, args: Record<string, unknown> = {}): Promise<Response> {
    if (!args) {
        args = {};
    }

    if (!args.method) {
        Object.assign(args, { method: 'GET' });
    }

    if (!args.headers) {
        args.headers = {};
    }

    if (extension_settings.apiKey) {
        Object.assign(args.headers as Record<string, string>, {
            'Authorization': `Bearer ${extension_settings.apiKey}`,
        });
    }

    return await fetch(endpoint, args as RequestInit);
}

/**
 * Generates a CSS selector for an extension based on its name, allowing omission of a common prefix.
 * @param {string} name Name of the extension, with or without the "third-party" prefix
 * @param {object} [options] Optional parameters
 * @param {string} [options.prefix] Optional prefix to ignore when generating the selector (e.g. "third-party")
 * @returns {string} CSS selector for the extension, with the prefix removed if it was present and specified in options
 */
function getNameSelector(name: string, { prefix = 'third-party' }: { prefix?: string } = {}): string {
    const nameWithoutPrefix = prefix && name.startsWith(prefix) ? name.slice(prefix.length) : name;
    return CSS.escape(nameWithoutPrefix);
}

/**
 * Discovers extensions from the API.
 * @returns {Promise<{name: string, type: string}[]>}
 */
async function discoverExtensions(): Promise<Array<{ name: string; type: string }>> {
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
function onDisableExtensionClick(this: HTMLElement): void {
    const name = this.dataset.name;
    if (name) disableExtension(name, false);
}

/**
 *
 */
function onEnableExtensionClick(this: HTMLElement): void {
    const name = this.dataset.name;
    if (name) enableExtension(name, false);
}

/**
 * Handles toggling all extensions on or off.
 * @param {object[]} extensionsToToggle
 * @param {JQuery<HTMLElement>} toggleContainer
 * @returns {object[]} Updated extensionsToToggle array
 */
function onToggleAllExtensions(extensionsToToggle: Array<{ name: string; toggleHandler?: (...args: unknown[]) => unknown; enable?: boolean }>, toggleContainer: HTMLElement): Array<{ name: string; toggleHandler?: (...args: unknown[]) => unknown; enable?: boolean }> {
    const extensionNames = Object.keys(manifests);
    const thirdPartyExtensions = extensionNames.filter(name => ['local', 'global'].includes(getExtensionType(name)));

    const checkIfDisabled = (name: string): boolean => {
        const toggle = extensionsToToggle.find(ext => ext.name === name);
        return toggle
            ? !toggle.enable
            : (extension_settings.disabledExtensions as string[]).includes(name);
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
            const toggle = extensionsToToggle.find(ext => ext.name === name);

            if (toggle) {
                toggle.toggleHandler = toggleHandler as (...args: unknown[]) => unknown;
                toggle.enable = enable;
            } else {
                extensionsToToggle.push({ name, toggleHandler: toggleHandler as (...args: unknown[]) => unknown, enable });
            }

            const toggleEl = toggleContainer.querySelector(`.extension_block[data-name="${getNameSelector(name)}"] .extension_toggle input`) as HTMLInputElement | null;
            if (toggleEl) {
                toggleEl.checked = enable;
                toggleEl.classList.toggle('toggle_enable', !enable);
                toggleEl.classList.toggle('toggle_disable', enable);
                toggleEl.classList.toggle('checkbox_disabled', !enable);
            }
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
function hasExtensionHook(name: string, hookName: string): boolean {
    const fullName = name.startsWith('third-party') ? name : `third-party${name}`;
    const manifest = manifests[fullName];
    if (!manifest || !manifest.hooks || typeof manifest.hooks !== 'object') {
        return false;
    }
    const hookFunctionName = (manifest.hooks as Record<string, string>)[hookName];
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
async function callExtensionHook(name: string, hookName: string): Promise<void> {
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

    const hookFunctionName = (manifest.hooks as Record<string, string>)[hookName];

    if (typeof hookFunctionName !== 'string' || !hookFunctionName) {
        console.warn(`callExtensionHook: Extension "${name}" hook "${hookName}" is not a valid string`);
        return;
    }

    if (!manifest.js) {
        console.warn(`callExtensionHook: Extension "${name}" has hook "${hookName}" but no JS entry point defined in manifest`);
        return;
    }

    const url = `/scripts/extensions/${name}/${manifest.js as string}`;
    console.debug(`callExtensionHook: Calling hook "${hookName}" (function "${hookFunctionName}") for extension "${name}"`);

    try {
        const module = await import(url) as Record<string, (...args: unknown[]) => unknown>;

        if (typeof module[hookFunctionName] !== 'function') {
            console.warn(`callExtensionHook: Extension "${name}" hook "${hookName}" references "${hookFunctionName}" which is not an exported function`);
            return;
        }

        const hookCallResult = module[hookFunctionName]();

        const HOOK_TIMEOUT = 5000;
        const HOOK_RESULT = {
            OK: 'ok' as const,
            TIMEOUT: 'timeout' as const,
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
export async function enableExtension(name: string, reload = true): Promise<void> {
    await callExtensionHook(name, 'enable');
    extension_settings.disabledExtensions = (extension_settings.disabledExtensions as string[]).filter(x => x !== name);
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
export async function disableExtension(name: string, reload = true): Promise<void> {
    await callExtensionHook(name, 'disable');
    (extension_settings.disabledExtensions as string[]).push(name);
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
export function findExtension(name: string): { name: string; enabled: boolean } | null {
    const internalExtensionName = extensionNames.find(extName => {
        return equalsIgnoreCaseAndAccents(extName, name) || equalsIgnoreCaseAndAccents(extName, `third-party/${name}`);
    });
    if (!internalExtensionName) return null;
    const isEnabled = !(extension_settings.disabledExtensions as string[]).includes(internalExtensionName);
    return { name: internalExtensionName, enabled: isEnabled };
}

/**
 * Returns a deep clone of the manifest for the given extension name.
 * Accepts either the short name (e.g. `SillyTavern-MyExtension`) or the full internal key
 * (e.g. `third-party/SillyTavern-MyExtension`). Returns null if the extension is not found.
 * @param {string} name - Extension name or internal key
 * @returns {object|null} Cloned manifest object, or null if not found
 */
export function getExtensionManifest(name: string): Record<string, unknown> | null {
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
async function getManifests(names: string[]): Promise<Record<string, Record<string, unknown>>> {
    const obj: Record<string, Record<string, unknown>> = {};
    const promises: Promise<void>[] = [];

    for (const name of names) {
        const promise = new Promise<void>((resolve, reject) => {
            fetch(`/scripts/extensions/${name}/manifest.json`).then(async response => {
                if (response.ok) {
                    const json = await response.json();
                    obj[name] = json;
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
async function activateExtensions(): Promise<void> {
    extensionLoadErrors.clear();
    const clientVersion = CLIENT_VERSION.split(':')[1]!;
    const extensions = Object.entries(manifests).sort((a, b) => sortManifestsByOrder(a[1], b[1]));
    const extensionNames = extensions.map(x => x[0]!);
    const promises: Promise<unknown>[] = [];

    for (const entry of extensions) {
        const name = entry[0]!;
        const manifest = entry[1]!;
        const extrasRequirements = manifest.requires;
        const extensionDependencies = manifest.dependencies;
        const minClientVersion = manifest.minimum_client_version as string | undefined;
        const displayName = (manifest.display_name as string) || name;

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
        let missingModules: string[] = [];
        if (extrasRequirements !== undefined) {
            if (Array.isArray(extrasRequirements)) {
                meetsModuleRequirements = isSubsetOf(modules, extrasRequirements as string[]);
                missingModules = (extrasRequirements as string[]).filter(req => !modules.includes(req));
            } else {
                console.warn(`Extension ${name}: manifest.json 'requires' field is not an array. Loading allowed, but any intended requirements were not verified to exist.`);
            }
        }

        // Extension dependencies: pass if 'dependencies' is undefined or not an array; check subset and disabled status if it's an array
        let meetsExtensionDeps = true;
        let missingDependencies: string[] = [];
        let disabledDependencies: string[] = [];
        if (extensionDependencies !== undefined) {
            if (Array.isArray(extensionDependencies)) {
                // Check if all dependencies exist
                meetsExtensionDeps = isSubsetOf(extensionNames, extensionDependencies as string[]);
                missingDependencies = (extensionDependencies as string[]).filter(dep => !extensionNames.includes(dep));
                // Check for disabled dependencies
                if (meetsExtensionDeps) {
                    disabledDependencies = (extensionDependencies as string[]).filter(dep => (extension_settings.disabledExtensions as string[]).includes(dep));
                    if (disabledDependencies.length > 0) {
                        // Fail if any dependencies are disabled
                        meetsExtensionDeps = false;
                    }
                }
            } else {
                console.warn(`Extension ${name}: manifest.json 'dependencies' field is not an array. Loading allowed, but any intended requirements were not verified to exist.`);
            }
        }

        const isDisabled = (extension_settings.disabledExtensions as string[]).includes(name);

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
    document.getElementById('extensions_details')?.classList.toggle('warning', extensionLoadErrors.size > 0);
}

/**
 *
 */
async function connectClickHandler(): Promise<void> {
    const baseUrl = String((document.getElementById('extensions_url') as HTMLInputElement)?.value ?? '');
    extension_settings.apiUrl = baseUrl;
    const testApiKey = (document.getElementById('extensions_api_key') as HTMLInputElement)?.value ?? '';
    extension_settings.apiKey = String(testApiKey);
    saveSettingsDebounced();
    await connectToApi(baseUrl);
}

/**
 *
 */
function autoConnectInputHandler(this: HTMLInputElement): void {
    const value = this.checked;
    extension_settings.autoConnect = !!value;

    if (value && !connectedToApi) {
        document.getElementById('extensions_connect')?.click();
    }

    saveSettingsDebounced();
}

/**
 *
 */
async function addExtensionsButtonAndMenu(): Promise<void> {
    const buttonHTML = await renderTemplateAsync('wandButton');
    const extensionsMenuHTML = await renderTemplateAsync('wandMenu');

    document.body.insertAdjacentHTML('beforeend', extensionsMenuHTML);
    document.getElementById('leftSendForm')?.insertAdjacentHTML('beforeend', buttonHTML);

    const button = document.getElementById('extensionsMenuButton');
    const dropdown = document.getElementById('extensionsMenu');
    if (button && dropdown) {
        button.addEventListener('pointerdown', function (e: Event) {
            e.stopPropagation();
        });
        button.addEventListener('mousedown', function (e: Event) {
            e.stopPropagation();
        });
        button.addEventListener('click', function () {
            if (dropdown.matches(':popover-open')) {
                dropdown.hidePopover();
            } else {
                // Close the other popover before opening this one
                const options = document.getElementById('options');
                if (options?.matches(':popover-open')) {
                    options.hidePopover();
                }
                dropdown.showPopover();
            }
        });
    }
    // Close extensions menu when clicking interactive items inside it
    if (dropdown) {
        dropdown.addEventListener('click', function (e: Event) {
            if (!(e.target instanceof Element)) return;
            const el = e.target.closest('.interactable, .menu_button, button, a, [data-i18n]');
            if (!el) return;
            dropdown.hidePopover();
        });
    }
}

/**
 *
 */
function notifyUpdatesInputHandler(): void {
    extension_settings.notifyUpdates = !!((document.getElementById('extensions_notify_updates') as HTMLInputElement)?.checked ?? false);
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
async function connectToApi(baseUrl: string): Promise<void> {
    if (!baseUrl) {
        return;
    }

    const url = new URL(baseUrl);
    url.pathname = '/api/modules';

    try {
        const getExtensionsResult = await doExtrasFetch(url);

        if (getExtensionsResult.ok) {
            const data = await getExtensionsResult.json() as Record<string, unknown>;
            modules = data.modules as string[];
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
function updateStatus(success: boolean): void {
    connectedToApi = success;
    const _text = success ? t`Connected to API` : t`Could not connect to API`;
    const _class = success ? 'success' : 'failure';
    const statusEl = document.getElementById('extensions_status');
    if (statusEl) {
        statusEl.textContent = _text;
        statusEl.className = _class;
    }
}

/**
 * Adds a CSS file for an extension.
 * @param {string} name Extension name
 * @param {object} manifest Extension manifest
 * @returns {Promise<void>} When the CSS is loaded
 */
function addExtensionStyle(name: string, manifest: Record<string, unknown>): Promise<void> {
    if (!manifest.css) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const url = `/scripts/extensions/${name}/${manifest.css as string}`;
        const id = sanitizeSelector(`${name}-css`);

        if (!document.querySelector(`link[id="${id}"]`)) {
            const link = document.createElement('link');
            link.id = id;
            link.rel = 'stylesheet';
            link.type = 'text/css';
            link.href = url;
            link.onload = function () {
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
function addExtensionScript(name: string, manifest: Record<string, unknown>): Promise<void> {
    if (!manifest.js) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const url = `/scripts/extensions/${name}/${manifest.js as string}`;
        const id = sanitizeSelector(`${name}-js`);
        let ready = false;

        if (!document.querySelector(`script[id="${id}"]`)) {
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
function addExtensionLocale(name: string, manifest: Record<string, unknown>): Promise<void> {
    // No i18n data in the manifest
    if (!manifest.i18n || typeof manifest.i18n !== 'object') {
        return Promise.resolve();
    }

    const currentLocale = getCurrentLocale();
    const localeFile = (manifest.i18n as Record<string, string>)[currentLocale];

    // Manifest doesn't provide a locale file for the current locale
    if (!localeFile) {
        return Promise.resolve();
    }

    return fetch(`/scripts/extensions/${name}/${localeFile}`)
        .then(async response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json() as Record<string, unknown>;

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
function generateExtensionElement(name: string, manifest: Record<string, unknown>, isActive: boolean, isDisabled: boolean, isExternal: boolean, checkboxClass: string): HTMLElement {
    /**
     *
     */
    function getExtensionIcon(): HTMLElement {
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
    const displayName = manifest.display_name as string;
    const displayVersion = (manifest.version as string) || '';
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
        const optional = new Set(manifest.optional as string[]);
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
        const requirements = new Set(manifest.requires as string[]);
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
    function makeActionButton(cls: string, dataName: string, title: string, iconClasses: string): HTMLButtonElement {
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
        actionsDiv.appendChild(makeActionButton('btn_clean', externalId, t`Clean extension data`, 'fa-fw fa-solid fa-broom'));
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
function getExtensionData(extension: [string, Record<string, unknown>]): { isExternal: boolean; extensionElement: HTMLElement } {
    const name = extension[0]!;
    const manifest = extension[1]!;
    const isActive = activeExtensions.has(name);
    const isDisabled = (extension_settings.disabledExtensions as string[]).includes(name);
    const isExternal = name.startsWith('third-party');

    const checkboxClass = isDisabled ? 'checkbox_disabled' : '';
    const extensionElement = generateExtensionElement(name, manifest, isActive, isDisabled, isExternal, checkboxClass);

    return { isExternal, extensionElement };
}


/**
 * Gets the module information to be displayed.
 * @returns {HTMLElement} - The element containing the module information.
 */
function getModuleInformation(): HTMLElement {
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
function getExtensionLoadErrors(): HTMLElement {
    if (extensionLoadErrors.size === 0) {
        return document.createElement('div');
    }

    const container = document.createElement('div');
    container.classList.add('info-block', 'error');

    for (const error of extensionLoadErrors) {
        const errorElement = document.createElement('div');
        errorElement.textContent = error;
        container.appendChild(errorElement);
    }

    return container;
}

/**
 * Generates the HTML strings for all extensions and displays them in a popup.
 */
async function showExtensionsDetails(): Promise<void> {
    const abortController = new AbortController();
    let popupPromise: Promise<unknown> | undefined;
    try {
        // If we are updating an extension, the "old" popup is still active. We should close that.
        let initialScrollTop = 0;
        const oldPopup = (Popup.util.popups as Array<Record<string, unknown>>).find(popup => (popup.content as HTMLElement).querySelector('.extensions_info'));
        if (oldPopup) {
            initialScrollTop = (oldPopup.content as HTMLElement).scrollTop;
            await (oldPopup.completeCancelled as () => void)();
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
        let extensionsToToggle: Array<{ name: string; toggleHandler?: (...args: unknown[]) => unknown; enable?: boolean }> = [];

        extensions.forEach(value => {
            const { isExternal, extensionElement } = value;
            const container = isExternal ? externalContainer : defaultContainer;
            container.appendChild(extensionElement);
        });

        const extensionsMenu = document.createElement('div');
        extensionsMenu.classList.add('extensions_info');
        extensionsMenu.append(errors, defaultContainer, externalContainer, getModuleInformation());

        {
            const updateAction = async (force: boolean): Promise<void> => {
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
                extensionsToToggle = onToggleAllExtensions(extensionsToToggle, externalContainer);

                for (const extension of extensionsToToggle) {
                    const { name } = extension;

                    const toggleInput = externalContainer.querySelector(`.extension_block[data-name="${getNameSelector(name)}"] .extension_toggle input`);
                    toggleInput?.addEventListener('click', () => {
                        extensionsToToggle = extensionsToToggle.filter(ext => ext.name !== name);
                    }, { once: true });
                }

                const restoreButtonHandler = extensionsToToggle.length > 0 ? 'remove' : 'add';

                restoreBulkToggledExtensionsButton.classList[restoreButtonHandler]('displayNone');
            });

            restoreBulkToggledExtensionsButton.addEventListener('click', () => {
                for (const extension of extensionsToToggle) {
                    const { name } = extension;
                    const isDisabled = (extension_settings.disabledExtensions as string[]).includes(name);

                    const toggleInput = externalContainer.querySelector(`.extension_block[data-name="${getNameSelector(name)}"] .extension_toggle input`) as HTMLInputElement | null;
                    if (toggleInput) {
                        toggleInput.checked = !isDisabled;
                        toggleInput.classList.toggle('toggle_enable', isDisabled);
                        toggleInput.classList.toggle('toggle_disable', !isDisabled);
                        toggleInput.classList.toggle('checkbox_disabled', isDisabled);
                    }
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
            customButtons: undefined,
            allowVerticalScrolling: true,
            onClosing: (async () => {
                if (waitingForSave) {
                    return false;
                }

                for (const extension of extensionsToToggle) {
                    const { name, toggleHandler, enable } = extension;
                    const isDisabled = (extension_settings.disabledExtensions as string[]).includes(name);

                    try {
                        if (isDisabled && !enable) continue;
                        if (!isDisabled && enable) continue;

                        requiresReload = true;

                        if (toggleHandler) await toggleHandler(name, false);
                    } catch (error) {
                        console.error(`Could not toggle extension ${name}:`, error);
                        notyf.error(t`Could not toggle extension ${name}. See console for details.`);
                    }
                }

                if (stateChanged) {
                    waitingForSave = true;
                    const toast = notyf.info(t`The page will be reloaded shortly...`, t`Extensions state changed`);
                    await saveSettings();
                    notyf.dismiss(toast!);
                    waitingForSave = false;
                    requiresReload = true;
                }

                return true;
            }) as unknown as () => Promise<boolean>,
        });
        popupPromise = popup.show();
        popup.content.scrollTop = initialScrollTop;
        checkForUpdatesManual(sortFn, abortController.signal).finally(() => loadingEl.remove());
    } catch (error) {
        notyf.error(t`Error loading extensions. See browser console for details.`);
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
async function onUpdateClick(this: HTMLElement): Promise<void> {
    const isCurrentUserAdmin = isAdmin();
    const extensionName = this.dataset.name;
    if (!extensionName) return;
    const isGlobal = getExtensionType(extensionName) === 'global';
    if (isGlobal && !isCurrentUserAdmin) {
        notyf.error(t`You don't have permission to update global extensions.`);
        return;
    }

    const icon = this.querySelector('i');
    icon?.classList.add('fa-spin');
    await updateExtension(extensionName, false);
    // updateExtension eats the error, but we can at least stop the spinner
    icon?.classList.remove('fa-spin');
}

/**
 * Updates a third-party extension via the API.
 * @param {string} extensionName Extension folder name
 * @param {boolean} quiet If true, don't show a success message
 * @param {number?} timeout Timeout in milliseconds to wait for the update to complete. If null, no timeout is set.
 */
async function updateExtension(extensionName: string, quiet: boolean, timeout: number | null = null): Promise<void> {
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
            notyf.error(text || response.statusText, t`Extension update failed`, { timeOut: 5000 });
            console.error('Extension update failed', response.status, response.statusText, text);
            return;
        }

        const data = await response.json() as Record<string, unknown>;

        if (!quiet) {
            void showExtensionsDetails();
        }

        if (data.isUpToDate) {
            if (!quiet) {
                notyf.success('Extension is already up to date');
            }
        } else {
            const fullExtensionName = extensionName.startsWith('third-party') ? extensionName : `third-party${extensionName}`;
            await callExtensionHook(fullExtensionName, 'update');
            notyf.success(t`Extension ${extensionName} updated to ${data.shortCommitHash as string}`, t`Reload the page to apply updates`);
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
async function onDeleteClick(this: HTMLElement): Promise<void> {
    const extensionName = this.dataset.name;
    if (!extensionName) return;
    const isCurrentUserAdmin = isAdmin();
    const isGlobal = getExtensionType(extensionName) === 'global';
    if (isGlobal && !isCurrentUserAdmin) {
        notyf.error(t`You don't have permission to delete global extensions.`);
        return;
    }

    const hasCleanHook = hasExtensionHook(extensionName, 'clean');

    /** @type {import('./popup.js').CustomPopupInput[]} */
    const customInputs = hasCleanHook ? [{ id: 'extension_delete_cleanup', label: t`Also clean up extension data`, defaultState: false }] : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const popup = new Popup(t`Are you sure you want to delete ${escapeHtml(extensionName)}?`, POPUP_TYPE.CONFIRM, '', { customInputs: customInputs as null | undefined });
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
async function onCleanClick(this: HTMLElement): Promise<void> {
    const extensionName = this.dataset.name;
    if (!extensionName) return;

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
async function cleanExtension(extensionName: string): Promise<void> {
    const fullExtensionName = extensionName.startsWith('third-party') ? extensionName : `third-party${extensionName}`;
    await callExtensionHook(fullExtensionName, 'clean');

    // Clean might have updated settings, which could race with the page reload, so we'll force save here
    await saveSettings();

    notyf.success(t`Extension ${extensionName} data cleaned`);
    delay(1000).then(() => location.reload());
}

/**
 *
 */
async function onBranchClick(this: HTMLElement): Promise<void> {
    const extensionName = this.dataset.name;
    if (!extensionName) return;
    const isCurrentUserAdmin = isAdmin();
    const isGlobal = getExtensionType(extensionName) === 'global';
    if (isGlobal && !isCurrentUserAdmin) {
        notyf.error(t`You don't have permission to switch branch.`);
        return;
    }

    let newBranch = '';

    const branches = await getExtensionBranches(extensionName, isGlobal) as Array<{ name: string; commit: string; current: boolean; label: string }>;
    const selectElement = document.createElement('select');
    selectElement.classList.add('text_pole', 'wide100p');
    selectElement.addEventListener('change', function (this: HTMLSelectElement) {
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
async function onMoveClick(this: HTMLElement): Promise<void> {
    const extensionName = this.dataset.name;
    if (!extensionName) return;
    const isCurrentUserAdmin = isAdmin();
    const isGlobal = getExtensionType(extensionName) === 'global';
    if (isGlobal && !isCurrentUserAdmin) {
        notyf.error(t`You don't have permission to move extensions.`);
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

    this.querySelector('i')?.classList.add('fa-spin');
    await moveExtension(extensionName, source, destination);
}

/**
 * Moves an extension via the API.
 * @param {string} extensionName Extension name
 * @param {string} source Source type
 * @param {string} destination Destination type
 * @returns {Promise<void>}
 */
async function moveExtension(extensionName: string, source: string, destination: string): Promise<void> {
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
            notyf.error(text || result.statusText, t`Extension move failed`, { timeOut: 5000 });
            console.error('Extension move failed', result.status, result.statusText, text);
            return;
        }

        notyf.success(t`Extension ${extensionName} moved.`);
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
export async function deleteExtension(extensionName: string, shouldClean = false): Promise<void> {
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

    notyf.success(t`Extension ${extensionName} deleted`);
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
async function getExtensionVersion(extensionName: string, abortSignal?: AbortSignal): Promise<Record<string, unknown> | undefined> {
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

        const data = await response.json() as Record<string, unknown>;
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
async function getExtensionBranches(extensionName: string, isGlobal: boolean): Promise<Array<{ name: string; commit: string; current: boolean; label: string }>> {
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
            notyf.error(text || response.statusText, t`Extension branches fetch failed`);
            console.error('Extension branches fetch failed', response.status, response.statusText, text);
            return [];
        }

        return await response.json() as Array<{ name: string; commit: string; current: boolean; label: string }>;
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
async function switchExtensionBranch(extensionName: string, isGlobal: boolean, branch: string): Promise<void> {
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
            notyf.error(text || response.statusText, t`Extension branch switch failed`);
            console.error('Extension branch switch failed', response.status, response.statusText, text);
            return;
        }

        notyf.success(t`Extension ${extensionName} switched to ${branch}`, t`Reload the page to apply updates`);
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
export async function installExtension(url: string, global: boolean, branch = ''): Promise<boolean> {
    try {
        const parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            throw new Error('Invalid URL protocol');
        }

        // Normalize the URL (resolve relative paths, remove redundant segments, etc.)
        url = parsedUrl.href;
    } catch (error) {
        console.error('Invalid URL:', error);
        notyf.error(t`Only valid HTTP and HTTPS URLs are allowed.`, t`Invalid URL`);
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
                    onClose: (popup: Record<string, unknown>) => {
                        if (!popup.result) {
                            return;
                        }
                        dismissWarning = Boolean((popup.inputResults as Map<string, unknown>)?.get('dontAskAgain') ?? false);
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

    notyf.info(t`Please wait...`, t`Installing extension`);

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
        notyf.warning(text || request.statusText, t`Extension installation failed`, { timeOut: 5000 });
        console.error('Extension installation failed', request.status, request.statusText, text);
        return false;
    }

    const response = await request.json() as Record<string, unknown>;
    notyf.success(t`Extension '${response.display_name as string}' has been installed successfully!`, t`Extension installation successful`);
    console.debug(`Extension "${response.display_name}" has been installed successfully at ${response.extensionPath}`);
    await loadExtensionSettings({}, false, false);
    await eventSource.emit(event_types.EXTENSION_SETTINGS_LOADED, response);

    if (response.folderName) {
        const extensionName = `third-party/${response.folderName as string}`;
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
export async function loadExtensionSettings(settings: Record<string, unknown>, versionChanged: boolean, enableAutoUpdate: boolean): Promise<void> {
    if (settings.extension_settings) {
        Object.assign(extension_settings, settings.extension_settings);
    }

    const elUrl = document.getElementById('extensions_url') as HTMLInputElement | null;
    if (elUrl) elUrl.value = extension_settings.apiUrl as string;
    const elKey = document.getElementById('extensions_api_key') as HTMLInputElement | null;
    if (elKey) elKey.value = extension_settings.apiKey as string;
    const elAuto = document.getElementById('extensions_autoconnect') as HTMLInputElement | null;
    if (elAuto) elAuto.checked = extension_settings.autoConnect as boolean;
    const elNotify = document.getElementById('extensions_notify_updates') as HTMLInputElement | null;
    if (elNotify) elNotify.checked = extension_settings.notifyUpdates as boolean;

    // Activate offline extensions
    await eventSource.emit(event_types.EXTENSIONS_FIRST_LOAD);
    const extensions = await discoverExtensions();
    extensionNames = extensions.map((x: { name: string }) => x.name);
    extensionTypes = Object.fromEntries(extensions.map((x: { name: string; type: string }) => [x.name, x.type]));
    manifests = await getManifests(extensionNames) as Record<string, Record<string, unknown>>;

    if (versionChanged && enableAutoUpdate) {
        await autoUpdateExtensions(false);
    }

    await activateExtensions();
    if (extension_settings.autoConnect && extension_settings.apiUrl) {
        connectToApi(extension_settings.apiUrl as string);
    }
}

/**
 *
 */
export function doDailyExtensionUpdatesCheck(): void {
    setTimeout(() => {
        if (extension_settings.notifyUpdates) {
            checkForExtensionUpdates(false);
        }
    }, 1);
}

const concurrencyLimit = 5;
let activeRequestsCount = 0;
const versionCheckQueue: Array<() => Promise<unknown>> = [];

/**
 *
 * @param fn
 */
function enqueueVersionCheck(fn: () => Promise<unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
        versionCheckQueue.push(() => fn().then(resolve).catch(reject));
        processVersionCheckQueue();
    });
}

/**
 *
 */
function processVersionCheckQueue(): void {
    if (activeRequestsCount >= concurrencyLimit || versionCheckQueue.length === 0) {
        return;
    }
    activeRequestsCount++;
    const fn = versionCheckQueue.shift()!;
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
async function checkForUpdatesManual(sortFn: (a: Record<string, unknown>, b: Record<string, unknown>) => number, abortSignal: AbortSignal): Promise<PromiseSettledResult<unknown>[]> {
    const promises: Promise<unknown>[] = [];
    for (const id of Object.keys(manifests).filter(x => x.startsWith('third-party')).sort((a, b) => sortFn(manifests[a]!, manifests[b]!))) {
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
                    const branch = data.currentBranchName as string;
                    const commitHash = data.currentCommitHash as string;
                    const origin = data.remoteUrl as string;

                    const originLink = extensionBlock.querySelector('a') as HTMLAnchorElement | null;
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
async function checkForExtensionUpdates(force: boolean): Promise<void> {
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
    const updatesAvailable: string[] = [];
    const promises: Promise<unknown>[] = [];

    for (const [id, manifest] of Object.entries(manifests)) {
        const isDisabled = (extension_settings.disabledExtensions as string[]).includes(id);
        if (isDisabled) {
            console.debug(`Skipping extension: ${manifest.display_name as string} (${id}) for non-admin user`);
            continue;
        }
        const isGlobal = getExtensionType(id) === 'global';
        if (isGlobal && !isCurrentUserAdmin) {
            console.debug(`Skipping global extension: ${manifest.display_name as string} (${id}) for non-admin user`);
            continue;
        }

        if (manifest.auto_update && id.startsWith('third-party')) {
            const promise = enqueueVersionCheck(async () => {
                try {
                    const data = await getExtensionVersion(id.replace('third-party', ''));
                    if (!data) {
                        return;
                    }
                    if (!data.isUpToDate) {
                        updatesAvailable.push(manifest.display_name as string);
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
        notyf.info(`${updatesAvailable.map(x => `• ${x}`).join('\n')}`, t`Extension updates available`);
    }
}

/**
 * Updates all enabled 3rd-party extensions that have auto-update enabled.
 * @param {boolean} forceAll Include disabled and not auto-updating
 * @returns {Promise<void>}
 */
async function autoUpdateExtensions(forceAll: boolean): Promise<void> {
    if (!Object.values(manifests).some(x => x.auto_update)) {
        return;
    }

    const banner = notyf.info(t`Auto-updating extensions. This may take several minutes.`, t`Please wait...`, { timeOut: 10000, extendedTimeOut: 10000 });
    const isCurrentUserAdmin = isAdmin();
    const promises: Promise<void>[] = [];
    const autoUpdateTimeout = 60 * 1000;
    for (const [id, manifest] of Object.entries(manifests)) {
        const isDisabled = (extension_settings.disabledExtensions as string[]).includes(id);
        if (!forceAll && isDisabled) {
            console.debug(`Skipping extension: ${manifest.display_name as string} (${id}) for non-admin user`);
            continue;
        }
        const isGlobal = getExtensionType(id) === 'global';
        if (isGlobal && !isCurrentUserAdmin) {
            console.debug(`Skipping global extension: ${manifest.display_name as string} (${id}) for non-admin user`);
            continue;
        }
        if ((forceAll || manifest.auto_update) && id.startsWith('third-party')) {
            console.debug(`Auto-updating 3rd-party extension: ${manifest.display_name as string} (${id})`);
            promises.push(updateExtension(id.replace('third-party', ''), true, autoUpdateTimeout));
        }
    }
    await Promise.allSettled(promises);
    notyf.dismiss(banner!);
}

/**
 * Runs the generate interceptors for all extensions.
 * @param {any[]} chat Chat array
 * @param {number} contextSize Context size
 * @param {string} type Generation type
 * @returns {Promise<boolean>} True if generation should be aborted
 */
export async function runGenerationInterceptors(chat: unknown[], contextSize: number, type: string): Promise<boolean> {
    let aborted = false;
    let exitImmediately = false;

    const abort = (immediately: boolean): void => {
        aborted = true;
        exitImmediately = immediately;
    };

    for (const manifest of Object.values(manifests).filter(x => x.generate_interceptor).sort((a, b) => sortManifestsByOrder(a, b))) {
        const interceptorKey = manifest.generate_interceptor as string;
        if (typeof (globalThis as Record<string, unknown>)[interceptorKey] === 'function') {
            try {
                await (globalThis as unknown as Record<string, (...args: unknown[]) => unknown>)[interceptorKey]?.(chat, contextSize, abort, type);
            } catch (e) {
                console.error(`Failed running interceptor for ${manifest.display_name as string}`, e);
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
export async function writeExtensionField(characterId: number | string, key: string, value: unknown): Promise<void> {
    const context = getContext();
    const character = context.characters[characterId as number];
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
    if (character.json_data) {
        const jsonData = JSON.parse(character.json_data);
        if (isUnset) {
            deleteValueByPath(jsonData, extensionPath);
        } else {
            setValueByPath(jsonData, extensionPath, value);
        }
        character.json_data = JSON.stringify(jsonData);

        // Make sure the data doesn't get lost when saving the current character
        if (Number(characterId) === Number(context.characterId)) {
            const charJsonEl = document.getElementById('character_json_data') as HTMLInputElement | null;
            if (charJsonEl) charJsonEl.value = character.json_data;
        }
    }

    // Save data to the server
    const saveDataRequest: Record<string, unknown> = {
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
export async function writeExtensionFieldBulk(avatars: string[] | null, key: string, value: unknown, {
    filterPath
}: { filterPath?: string } = {}): Promise<{ updated: string[]; skipped: string[]; failed: string[] }> {
    const context = getContext();
    const extensionPath = `data.extensions.${key}`;
    const isUnset = value === UNSET_VALUE;

    // Build the server request
    const requestBody: Record<string, unknown> = {
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
    const result = await mergeResponse.json() as { updated: string[]; skipped: string[]; failed: string[] };

    // Sync in-memory character objects for successfully updated characters
    const updatedSet = new Set(result.updated);
    for (const character of context.characters) {
        if (!character || !updatedSet.has(character.avatar)) continue;

        if (isUnset) {
            deleteValueByPath(character, extensionPath);
        } else {
            setValueByPath(character, extensionPath, value);
        }

        // Keep json_data in sync
        if (character.json_data) {
            const jsonData = JSON.parse(character.json_data);
            if (isUnset) {
                deleteValueByPath(jsonData, extensionPath);
            } else {
                setValueByPath(jsonData, extensionPath, value);
            }
            character.json_data = JSON.stringify(jsonData);
        }
    }

    // If the currently active character was updated, sync the hidden input
    if (context.characterId !== undefined) {
        const activeChar = context.characters[context.characterId as number];
        if (activeChar && updatedSet.has(activeChar.avatar) && activeChar.json_data) {
            const charJsonEl = document.getElementById('character_json_data') as HTMLInputElement | null;
            if (charJsonEl) charJsonEl.value = activeChar.json_data;
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
export async function openThirdPartyExtensionMenu(suggestUrl = ''): Promise<void> {
    const isCurrentUserAdmin = isAdmin();
    const html = await renderTemplateAsync('installExtension', { isCurrentUserAdmin });
    const okButton = isCurrentUserAdmin ? t`Install just for me` : t`Install`;

    let global = false;
    const installForAllButton: { text: string; appendAtEnd: boolean; action: () => Promise<void> } = {
        text: t`Install for all users`,
        appendAtEnd: false,
        action: async () => {
            global = true;
            await popup.complete(POPUP_RESULT.AFFIRMATIVE);
        },
    };
    /** @type {import('./popup.js').CustomPopupInput} */
    const branchNameInput: { id: string; label: string; type: string; tooltip: string } = {
        id: 'extension_branch_name',
        label: t`Branch or tag name (optional)`,
        type: 'text',
        tooltip: 'e.g. main, dev, v1.0.0',
    };

    const customButtons = isCurrentUserAdmin ? [installForAllButton] : [];
    const customInputs = [branchNameInput];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const popup = new Popup(html, POPUP_TYPE.INPUT, suggestUrl ?? '', { okButton, customButtons, customInputs } as Record<string, unknown>);
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
export function getAuthorFromUrl(url: string): { name: string; url: string } {
    const result: { name: string; url: string } = structuredClone(EMPTY_AUTHOR);

    try {
        const parsedUrl = new URL(url);
        const pathSegments = parsedUrl.pathname.split('/').filter(s => s.length > 0);

        // TODO: Handle non-GitHub URLs if needed
        if (parsedUrl.host === 'github.com' && pathSegments.length >= 2) {
            result.name = pathSegments[0]!;
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
export async function initExtensions(): Promise<void> {
    await addExtensionsButtonAndMenu();
    const menuButton = document.getElementById('extensionsMenuButton');
    if (menuButton) menuButton.style.display = 'flex';

    document.getElementById('extensions_connect')?.addEventListener('click', connectClickHandler);
    (document.getElementById('extensions_autoconnect') as HTMLInputElement | null)?.addEventListener('input', autoConnectInputHandler);
    document.getElementById('extensions_details')?.addEventListener('click', showExtensionsDetails);
    (document.getElementById('extensions_notify_updates') as HTMLInputElement | null)?.addEventListener('input', notifyUpdatesInputHandler);
    document.addEventListener('click', function (this: void, event: Event) {
        if (!(event.target instanceof Element)) return;
        const el = event.target.closest('.extensions_info .extension_block .toggle_disable');
        if (el) onDisableExtensionClick.call(el as HTMLElement);
    });
    document.addEventListener('click', function (this: void, event: Event) {
        if (!(event.target instanceof Element)) return;
        const el = event.target.closest('.extensions_info .extension_block .toggle_enable');
        if (el) onEnableExtensionClick.call(el as HTMLElement);
    });
    document.addEventListener('click', function (this: void, event: Event) {
        if (!(event.target instanceof Element)) return;
        const el = event.target.closest('.extensions_info .extension_block .btn_update');
        if (el) onUpdateClick.call(el as HTMLElement);
    });
    document.addEventListener('click', function (this: void, event: Event) {
        if (!(event.target instanceof Element)) return;
        const el = event.target.closest('.extensions_info .extension_block .btn_delete');
        if (el) onDeleteClick.call(el as HTMLElement);
    });
    document.addEventListener('click', function (this: void, event: Event) {
        if (!(event.target instanceof Element)) return;
        const el = event.target.closest('.extensions_info .extension_block .btn_clean');
        if (el) onCleanClick.call(el as HTMLElement);
    });
    document.addEventListener('click', function (this: void, event: Event) {
        if (!(event.target instanceof Element)) return;
        const el = event.target.closest('.extensions_info .extension_block .btn_move');
        if (el) onMoveClick.call(el as HTMLElement);
    });
    document.addEventListener('click', function (this: void, event: Event) {
        if (!(event.target instanceof Element)) return;
        const el = event.target.closest('.extensions_info .extension_block .btn_branch');
        if (el) onBranchClick.call(el as HTMLElement);
    });

    /**
     * Handles the click event for the third-party extension import button.
     * @listens #third_party_extension_button#click - The click event of the '#third_party_extension_button' element.
     */
    document.getElementById('third_party_extension_button')?.addEventListener('click', () => openThirdPartyExtensionMenu());
}
