import { DOMPurify, moment, sha256 } from '../lib.js';
import { event_types, eventSource, getRequestHeaders, saveSettings } from '../script.js';
import { t } from './i18n.js';
import { callGenericPopup, Popup, POPUP_RESULT, POPUP_TYPE } from './popup.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import {
    ARGUMENT_TYPE,
    SlashCommandArgument,
    SlashCommandNamedArgument,
} from './slash-commands/SlashCommandArgument.js';
import { enumIcons } from './slash-commands/SlashCommandCommonEnumsProvider.js';
import { enumTypes, SlashCommandEnumValue } from './slash-commands/SlashCommandEnumValue.js';
import { SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import { renderTemplateAsync } from './templates.js';
import { getCurrentUserHandle } from './user.js';
import { copyText, isTrueBoolean, uuidv4 } from './utils.js';
import { accountStorage } from './util/AccountStorage.js';

const KEY_OVERRIDES = {
    DEEPL: 'deepl',
    LIBRE: 'libre',
    LIBRE_URL: 'libre_url',
    LINGVA_URL: 'lingva_url',
    ONERING_URL: 'oneringtranslator_url',
    DEEPLX_URL: 'deeplx_url',
    VERTEXAI_SERVICE_ACCOUNT: 'vertexai_service_account_json',
    MINIMAX_GROUP_ID: 'minimax_group_id',
    VOLCENGINE_APP_ID: 'volcengine_app_id',
    VOLCENGINE_ACCESS_KEY: 'volcengine_access_key',
};

function deriveKey(name: string): string {
    return (KEY_OVERRIDES as Record<string, string>)[name] ?? `api_key_${name.toLowerCase()}`;
}

// ── Provide stable object shapes for Inline Caches (ICs) ──

interface ApiSecret {
    id: string;
    label?: string;
    value?: string;
    active?: boolean;
}

function getSecretsForKey(key: string): ApiSecret[] {
    const secrets = secret_state[key];
    return Array.isArray(secrets) ? (secrets as ApiSecret[]) : [];
}

/**
 * Single-pass loop to find a secret by ID, falling back to label, then active.
 * Avoids creating multiple closures and doing 3x .find() passes.
 */
function findSecretByPriority(secrets: ApiSecret[], id?: string): ApiSecret | undefined {
    if (!id) return secrets.find((s) => s.active);
    let labelMatch: ApiSecret | undefined;
    let activeMatch: ApiSecret | undefined;
    for (const s of secrets) {
        if (s.id === id) return s; // Highest priority, early exit
        if (!labelMatch && s.label === id) labelMatch = s;
        if (!activeMatch && s.active) activeMatch = s;
    }
    return labelMatch ?? activeMatch;
}

// ── Dynamic key registry (populated from /api/backends/keys) ────────────────

interface KeyDescriptor {
    id: string;
    label: string;
    storageKey?: string;
    selector?: string;
    category?: string;
}

let _keyDescriptors: KeyDescriptor[] = [];
const _friendlyNames: Record<string, string> = {};
const _inputMap: Record<string, string> = {};

/**
 * Fetch key descriptors from the backend provider registries.
 * Populates SECRET_KEYS, FRIENDLY_NAMES, and INPUT_MAP.
 */
async function initKeyRegistry(): Promise<void> {
    try {
        const response = await fetch('/api/backends/keys');
        if (!response.ok) {
            console.warn('Failed to load key registry, using fallback');
            return;
        }
        const descriptors: KeyDescriptor[] = await response.json();
        _keyDescriptors = descriptors;

        for (const d of descriptors) {
            const storageKey = d.storageKey ?? `api_key_${d.id.toLowerCase()}`;
            _keyStore[d.id] = storageKey;
            _friendlyNames[storageKey] = d.label;
            // Convention: #api_key_{id} for most, with known exceptions
            if (d.id === 'HORDE') {
                _inputMap[storageKey] = '#horde_api_key';
            } else if (d.id === 'OPENROUTER') {
                _inputMap[storageKey] = '.api_key_openrouter';
            } else if (d.id === 'VERTEXAI_SERVICE_ACCOUNT') {
                _inputMap[storageKey] = '#vertexai_service_account_json';
            } else if (d.selector) {
                _inputMap[storageKey] = d.selector;
            } else if (
                d.category &&
                (d.category === 'chat-completion' ||
                    d.category === 'textgen' ||
                    d.category === 'tts' ||
                    d.category === 'image' ||
                    d.category === 'misc')
            ) {
                _inputMap[storageKey] = `#api_key_${d.id.toLowerCase()}`;
            }
        }
    } catch (error) {
        console.error('Could not load key registry:', error);
    }
}

/** Internal mutable target for the SECRET_KEYS proxy. */
const _keyStore: Record<string, string> = { ...KEY_OVERRIDES };

/**
 * Map of provider name → storage key string.
 *
 * Lazily derived on first access; populated from the backend registry
 * when initKeyRegistry() runs. All 14+ consumers that reference
 * `SECRET_KEYS.OPENAI` continue to work synchronously.
 */
export const SECRET_KEYS = new Proxy(_keyStore, {
    get(target, prop: string) {
        if (prop in target) return target[prop];
        const derived = deriveKey(prop);
        target[prop] = derived;
        return derived;
    },
    has(target, prop: string) {
        return prop in target || KEY_OVERRIDES[prop as keyof typeof KEY_OVERRIDES] !== undefined;
    },
    ownKeys() {
        const known = new Set(Object.keys(_keyStore));
        for (const d of _keyDescriptors) known.add(d.id);
        return Array.from(known);
    },
    getOwnPropertyDescriptor(_target, prop: string) {
        if (
            typeof prop === 'string' &&
            (prop in _keyStore ||
                KEY_OVERRIDES[prop as keyof typeof KEY_OVERRIDES] !== undefined ||
                _keyDescriptors.some((d) => d.id === prop))
        ) {
            return {
                configurable: true,
                enumerable: true,
                writable: true,
                value: SECRET_KEYS[prop],
            };
        }
    },
}) as Record<string, string>;

/**
 * Friendly display names for secret keys (populated from registry).
 */
export function getSecretFriendlyName(storageKey: string): string | undefined {
    return _friendlyNames[storageKey];
}

export const FRIENDLY_NAMES: Record<string, string> = new Proxy({} as Record<string, string>, {
    get(_target, prop: string) {
        return _friendlyNames[prop] ?? prop;
    },
    ownKeys() {
        return Object.keys(_friendlyNames);
    },
    getOwnPropertyDescriptor(_target, prop: string) {
        if (prop in _friendlyNames) {
            return { configurable: true, enumerable: true, value: _friendlyNames[prop] };
        }
    },
});

export const INPUT_MAP: Record<string, string> = new Proxy({} as Record<string, string>, {
    get(_target, prop: string) {
        return _inputMap[prop];
    },
    ownKeys() {
        return Object.keys(_inputMap);
    },
    getOwnPropertyDescriptor(_target, prop: string) {
        if (prop in _inputMap) {
            return { configurable: true, enumerable: true, value: _inputMap[prop] };
        }
    },
});

const getLabel = () => moment().format('L LT');

/**
 * Resolves the secret key based on the selected API, chat completion source, and text completion type.
 * @returns {string|null} The secret key corresponding to the selected API, or null if no key is found.
 */
export function resolveSecretKey() {
    const context = (SillyTavern as unknown as Record<string, unknown>).getContext as (
        ...args: unknown[]
    ) => unknown;
    const { mainApi, chatCompletionSettings, textCompletionSettings } = context as unknown as {
        mainApi: string;
        chatCompletionSettings: Record<string, unknown>;
        textCompletionSettings: Record<string, unknown>;
    };
    const chatCompletionSource = chatCompletionSettings.chat_completion_source as string;
    const textCompletionType = textCompletionSettings.type as string;

    if (mainApi === 'koboldhorde') return SECRET_KEYS['HORDE'] as string;
    if (mainApi === 'novel') return SECRET_KEYS['NOVEL'] as string;

    if (mainApi === 'textgenerationwebui') {
        const textCompLower = textCompletionType?.toLowerCase();
        for (const d of _keyDescriptors) {
            if (d.category === 'textgen' && d.id.toLowerCase() === textCompLower)
                return SECRET_KEYS[d.id] as string;
        }
    }

    if (mainApi === 'openai') {
        if (chatCompletionSource === 'vertexai') {
            switch (chatCompletionSettings.vertexai_auth_mode as string) {
                case 'express':
                    return SECRET_KEYS['VERTEXAI'] as string;
                case 'full':
                    return SECRET_KEYS['VERTEXAI_SERVICE_ACCOUNT'] as string;
            }
        }

        const chatCompLower = chatCompletionSource?.toLowerCase();
        for (const d of _keyDescriptors) {
            if (d.category === 'chat-completion' && d.id.toLowerCase() === chatCompLower)
                return SECRET_KEYS[d.id] as string;
        }
    }

    return null;
}

/**
 * Gets the label of a secret by its ID.
 * @param {string} id The ID of the secret to find.
 * @returns {string} The label of the secret with the given ID, or an empty string if not found.
 */
export function getSecretLabelById(id: string) {
    const keys = Object.values(SECRET_KEYS);
    for (let i = 0; i < keys.length; i++) {
        const secrets = getSecretsForKey(keys[i]!);
        if (secrets.length === 0) continue;

        const secret = secrets.find((s) => s.id === id);
        if (secret) return `${secret.label} (${secret.value})`;
    }
    return '';
}

/**
 *
 */
export function updateSecretDisplay() {
    const keys = Object.keys(_inputMap);
    for (let i = 0; i < keys.length; i++) {
        const secret_key = keys[i]!;
        const input_selector = _inputMap[secret_key]!;

        const secrets = getSecretsForKey(secret_key);
        const validSecret = secrets.length > 0;

        const viewEl = document.getElementById('viewSecrets');
        const placeholder =
            viewEl?.getAttribute(validSecret ? 'key_saved_text' : 'missing_key_text') || '';

        let label = '';
        if (validSecret) {
            const activeSecret = secrets.find((x) => x.active);
            if (activeSecret) {
                label = activeSecret.label || activeSecret.value || t`[No label]`;
            }
        }

        const placeholderWithLabel = label ? `${placeholder} (${label})` : placeholder;
        const targetEl = document.querySelector(input_selector);
        if (targetEl) targetEl.setAttribute('placeholder', placeholderWithLabel);
    }
}

/**
 * Checks if secrets can be viewed based on server configuration.
 * @returns {Promise<boolean|null>} A boolean value, or null if the request fails.
 */
export async function canViewSecrets() {
    try {
        const response = await fetch('/api/secrets/settings', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (!response.ok) return null;

        const data = (await response.json()) as Record<string, unknown>;
        return data?.allowKeysExposure === true;
    } catch (error) {
        console.error('Error getting secrets settings:', error);
        return null;
    }
}

/**
 *
 */
async function viewSecrets() {
    const response = await fetch('/api/secrets/view', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
    });

    if (response.status == 403) {
        await Popup.show.text(
            t`Forbidden`,
            t`To view your API keys here, set the value of allowKeysExposure to true in config.yaml file and restart the SillyTavern server.`,
        );
        return;
    }

    if (!response.ok) return;

    const data = (await response.json()) as Record<string, string>;

    // Accumulating HTML string is vastly faster than appending Document nodes in a loop.
    let htmlContent = '<thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>';
    for (const [key, value] of Object.entries(data)) {
        htmlContent += `<tr><td>${DOMPurify.sanitize(key)}</td><td>${DOMPurify.sanitize(value)}</td></tr>`;
    }
    htmlContent += '</tbody>';

    const table = document.createElement('table');
    table.classList.add('responsiveTable');
    table.innerHTML = htmlContent;

    await callGenericPopup(table.outerHTML, POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
    });
}

/**
 * @type {import('../../src/endpoints/secrets.js').SecretStateMap}
 */
export let secret_state: Record<string, unknown> = {};

/**
 * Write a secret value to the server.
 * @param {string} key Secret key
 * @param {string} value Secret value to write
 * @param {string} [label] (Optional) Label for the key. If not provided, generated automatically.
 * @param {object} [options] Additional options
 * @param {boolean} [options.allowEmpty] Whether to allow writing empty values. If false and value is empty, the secret will be deleted.
 * @returns {Promise<string?>} The ID of the newly created secret key, or null if no value is provided.
 */
export async function writeSecret(
    key: string,
    value: string,
    label?: string,
    { allowEmpty }: { allowEmpty?: boolean } = {},
) {
    try {
        if (!value && !allowEmpty) {
            console.warn(
                `No value provided for ${key} in writeSecret, redirecting to deleteSecret`,
            );
            await deleteSecret(key);
            return null;
        }

        if (!label) {
            label = getLabel();
        }

        const response = await fetch('/api/secrets/write', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ key, value, label }),
        });

        if (!response.ok) return null;

        const { id } = (await response.json()) as { id: string };

        const inputSelector = _inputMap[key];
        const inputEl = inputSelector ? document.querySelector(inputSelector) : null;
        if (inputEl instanceof HTMLInputElement) {
            inputEl.value = '';
            inputEl.dispatchEvent(new Event('input'));
        }
        await readSecretState();
        await eventSource.emit(event_types.SECRET_WRITTEN, key);
        return id;
    } catch (error) {
        console.error(`Could not write secret value: ${key}`, error);
        return null;
    }
}

/**
 * Deletes a secret value from the server.
 * @param {string} key Secret key
 * @param {string} [id] (Optional) ID of the secret key to delete. If not provided, deletes an active key.
 */
export async function deleteSecret(key: string, id?: string) {
    try {
        const response = await fetch('/api/secrets/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ key, id }),
        });

        if (response.ok) {
            await readSecretState();
            document.getElementById('main_api')?.dispatchEvent(new Event('change'));
            await eventSource.emit(event_types.SECRET_DELETED, key);
        }
    } catch (error) {
        console.error(`Could not delete secret value: ${key}`, error);
    }
}

/**
 * Reads the current state of secrets from the server.
 * @returns {Promise<void>}
 */
export async function readSecretState() {
    try {
        const response = await fetch('/api/secrets/read', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (response.ok) {
            secret_state = (await response.json()) as Record<string, unknown>;
            updateSecretDisplay();
            updateInputDataLists();
        }
    } catch {
        console.error('Could not read secrets file');
    }
}

/**
 * Finds a secret value by key.
 * @param {string} key Secret key
 * @param {string} [id] ID of the secret to find. If not provided, will return the active secret.
 * @returns {Promise<string?>} Secret value, or null if keys are not exposed
 */
export async function findSecret(key: string, id?: string) {
    try {
        const response = await fetch('/api/secrets/find', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ key, id }),
        });

        if (!response.ok) return null;

        const data = (await response.json()) as Record<string, unknown>;
        return data.value as string;
    } catch {
        console.error('Could not find secret value: ', key);
        return null;
    }
}

/**
 * Changes the active value for a given secret key.
 * @param {string} key Secret key to rotate
 * @param {string} id ID of the secret to rotate
 */
export async function rotateSecret(key: string, id: string) {
    try {
        const response = await fetch('/api/secrets/rotate', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ key, id }),
        });

        if (response.ok) {
            await readSecretState();
            document.getElementById('main_api')?.dispatchEvent(new Event('change'));
            await eventSource.emit(event_types.SECRET_ROTATED, key);
        }
    } catch (error) {
        console.error(`Could not rotate secret value: ${key}`, error);
    }
}

/**
 * Renames a secret value on the server.
 * @param {string} key Secret key to rename
 * @param {string} id ID of the secret to rename
 * @param {string} label Label to rename the secret to
 */
export async function renameSecret(key: string, id: string, label: string) {
    try {
        const response = await fetch('/api/secrets/rename', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ key, id, label }),
        });

        if (response.ok) {
            await readSecretState();
            await eventSource.emit(event_types.SECRET_EDITED, key);
        }
    } catch (error) {
        console.error(`Could not rename secret value: ${key}`, error);
    }
}

const getVerifierKey = (source: string) => `${getCurrentUserHandle()}_${source}_code_verifier`;

// Hoist shared instance to module scope to avoid re-allocating inside hot/repeated functions.
const sharedTextEncoder = new TextEncoder();

/**
 * Generates a code challenge for PKCE authentication flows.
 * @param {string} input Input secret string to generate the code challenge from.
 * @returns {string} S256 code challenge generated from the input string, encoded in base64url format.
 */
const generateChallenge = (input: string) => {
    const data = sharedTextEncoder.encode(input);
    const hashBytes = sha256.array(data);
    return btoa(String.fromCharCode(...hashBytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
};

/**
 * Redirects the user to authorize OpenRouter.
 */
async function authorizeOpenRouter() {
    if (getSecretsForKey(SECRET_KEYS.OPENROUTER as string).length > 0) {
        const confirmed = await Popup.show.confirm(
            t`OpenRouter API key already exists`,
            t`Do you really wish to create a new OpenRouter key? Your existing key will not be deleted.`,
        );
        if (!confirmed) return;
    }

    const codeVerifier = uuidv4() + uuidv4();
    const codeChallenge = generateChallenge(codeVerifier);
    accountStorage.setItem(getVerifierKey('openrouter'), codeVerifier);
    await saveSettings();

    const redirectUrl = new URL('/callback/openrouter', window.location.origin);
    const openRouterUrl = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(redirectUrl.toString())}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
    location.href = openRouterUrl;
}

/**
 * Checks if the OpenRouter authorization code is present in the URL, and if so, exchanges it for an API key.
 * @returns {Promise<void>}
 */
export async function checkOpenRouterAuth() {
    const params = new URLSearchParams(location.search);
    const source = params.get('source');
    if (source === 'openrouter') {
        const query = new URLSearchParams(params.get('query') ?? '');
        try {
            const code = query.get('code');
            if (!code) throw new Error('OpenRouter authorization code not found in URL');

            const codeVerifier = accountStorage.getItem(getVerifierKey('openrouter'));
            if (!codeVerifier)
                throw new Error('OpenRouter code verifier not found in accountStorage');

            const response = await fetch('https://openrouter.ai/api/v1/auth/keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: code,
                    code_verifier: codeVerifier,
                    code_challenge_method: 'S256',
                }),
            });

            if (!response.ok) throw new Error('OpenRouter exchange error');

            const data = (await response.json()) as Record<string, unknown>;
            if (!data || !data.key) throw new Error('OpenRouter invalid response');

            await writeSecret(SECRET_KEYS.OPENROUTER!, data.key as string);

            if (getSecretsForKey(SECRET_KEYS.OPENROUTER as string).length > 0) {
                notyf.success('OpenRouter token saved');
            } else {
                throw new Error('OpenRouter token not saved');
            }
        } catch (err) {
            notyf.error('Could not verify OpenRouter token. Please try again.');
            console.error('OpenRouter OAuth error:', err);
        } finally {
            const currentUrl = window.location.href;
            const urlWithoutSearchParams = currentUrl.split('?')[0];
            window.history.pushState({}, '', urlWithoutSearchParams);
        }
    }

    accountStorage.removeItem(getVerifierKey('openrouter'));
}

/**
 * Updates the input data lists for secret keys for autocomplete functionality.
 */
function updateInputDataLists() {
    let container = document.getElementById('secrets_datalists');
    if (!container) {
        container = document.createElement('div');
        container.id = 'secrets_datalists';
        container.style.display = 'none';
        document.body.appendChild(container);
    }

    const keys = Object.keys(_inputMap);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i]!;
        const inputSelector = _inputMap[key]!;
        const inputElements = document.querySelectorAll(inputSelector);
        if (inputElements.length === 0) continue;

        const secrets = getSecretsForKey(key);
        if (secrets.length === 0) continue;

        const dataListId = `${key}_datalist`;
        let dataList = document.getElementById(dataListId);
        if (!dataList) {
            dataList = document.createElement('datalist');
            dataList.id = dataListId;
            container.appendChild(dataList);
        }

        dataList.innerHTML = '';

        // Batch DOM operations using DocumentFragment
        const fragment = document.createDocumentFragment();
        for (const secret of secrets) {
            const option = document.createElement('option');
            option.value = secret.id;
            option.textContent = `${secret.label} (${secret.value})`;
            fragment.appendChild(option);
        }
        dataList.appendChild(fragment);

        inputElements.forEach((element) => {
            element.setAttribute('list', dataListId);
        });
    }
}

/**
 * Opens the key manager dialog for a specific key.
 * @param {string} key Key for which to open the key manager dialog.
 */
async function openKeyManagerDialog(key: string) {
    const name = _friendlyNames[key] || key;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = await renderTemplateAsync('secretKeyManager', { name, key });
    const template = wrapper;

    const addSecretBtn = template.querySelector(
        'button[data-action="add-secret"]',
    ) as HTMLElement | null;
    if (addSecretBtn)
        addSecretBtn.addEventListener('click', async function () {
            let label = '';
            let result = POPUP_RESULT.CANCELLED;
            const value = await Popup.show.input(
                t`Add Secret`,
                t`Secret value (can be empty):`,
                '',
                {
                    customInputs: [
                        { id: 'newSecretLabel', type: 'text', label: t`Label (optional):` },
                    ],
                    onClose: (popup: Record<string, unknown>) => {
                        if (popup.result) {
                            label = String(
                                (popup.inputResults as Map<string, unknown>)?.get(
                                    'newSecretLabel',
                                ) ?? '',
                            ).trim();
                            result = popup.result as unknown as typeof POPUP_RESULT.CANCELLED;
                        }
                    },
                },
            );
            if (!value) {
                if (result !== POPUP_RESULT.AFFIRMATIVE) return;
                const allowEmpty = await Popup.show.confirm(
                    t`No value entered`,
                    t`No value was entered for the secret. Do you want to add an empty secret?`,
                );
                if (!allowEmpty) return;
            }
            await writeSecret(key, value ?? '', label, { allowEmpty: true });
            await renderSecretsList();
        });

    await renderSecretsList();
    await callGenericPopup(template, POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        onOpen: scrollToActive,
    });

    async function renderSecretsList() {
        const secrets = getSecretsForKey(key);
        const list = template.querySelector('.secretKeyManagerList') as HTMLElement | null;
        const previousScrollTop = list?.scrollTop ?? 0;

        const emptyMessage = template.querySelector(
            '.secretKeyManagerListEmpty',
        ) as HTMLElement | null;
        if (emptyMessage instanceof HTMLElement) {
            emptyMessage.style.display = secrets.length === 0 ? '' : 'none';
        }

        const fragment = document.createDocumentFragment();
        for (const secret of secrets) {
            const itemWrapper = document.createElement('div');
            itemWrapper.innerHTML = await renderTemplateAsync('secretKeyManagerListItem', secret);
            const itemTemplate = itemWrapper;

            const copyIdBtn = itemTemplate.querySelector(
                'button[data-action="copy-id"]',
            ) as HTMLElement | null;
            if (copyIdBtn)
                copyIdBtn.addEventListener('click', async function () {
                    await copyText(secret.id);
                    notyf.info(t`Secret ID copied to clipboard.`);
                });
            const rotateSecretBtn = itemTemplate.querySelector(
                'button[data-action="rotate-secret"]',
            ) as HTMLElement | null;
            if (rotateSecretBtn)
                rotateSecretBtn.addEventListener('click', async function () {
                    await rotateSecret(key, secret.id);
                    await renderSecretsList();
                });
            const copySecretBtn = itemTemplate.querySelector(
                'button[data-action="copy-secret"]',
            ) as HTMLElement | null;
            if (copySecretBtn)
                copySecretBtn.addEventListener('click', async function () {
                    const secretValue = await findSecret(key, secret.id);
                    if (secretValue === null) {
                        notyf.error(
                            t`The key exposure might be disabled by the server config.`,
                            t`Failed to copy secret value`,
                        );
                        return;
                    }
                    await copyText(secretValue);
                    notyf.info(t`Secret value copied to clipboard.`);
                });
            const renameSecretBtn = itemTemplate.querySelector(
                'button[data-action="rename-secret"]',
            ) as HTMLElement | null;
            if (renameSecretBtn)
                renameSecretBtn.addEventListener('click', async function () {
                    const label = await Popup.show.input(
                        t`Rename Secret`,
                        t`Enter new label for the secret:`,
                        secret.label || getLabel(),
                    );
                    if (!label) return;

                    await renameSecret(key, secret.id, label);
                    await renderSecretsList();
                });
            const deleteSecretBtn = itemTemplate.querySelector(
                'button[data-action="delete-secret"]',
            ) as HTMLElement | null;
            if (deleteSecretBtn)
                deleteSecretBtn.addEventListener('click', async function () {
                    const confirm = await Popup.show.confirm(
                        t`Delete Secret: ${secret.label}`,
                        t`Are you sure you want to delete this secret? This action cannot be undone.`,
                    );
                    if (!confirm) return;

                    await deleteSecret(key, secret.id);
                    await renderSecretsList();
                });
            fragment.appendChild(itemTemplate);
        }

        if (list) {
            list.innerHTML = '';
            list.appendChild(fragment);
            list.scrollTop = previousScrollTop;
        }
    }

    function scrollToActive() {
        const list = template.querySelector('.secretKeyManagerList') as HTMLElement | null;
        const activeKey = list?.querySelector('.active');
        if (activeKey instanceof HTMLElement && list instanceof HTMLElement) {
            list.scrollTop = activeKey.offsetTop + list.scrollTop - list.clientHeight / 2;
        }
    }
}

/**
 *
 */
function registerSecretSlashCommands() {
    const secretKeyEnumProvider = () =>
        Object.values(SECRET_KEYS).map(
            (key) =>
                new SlashCommandEnumValue(
                    key,
                    _friendlyNames[key] || key,
                    enumTypes.name,
                    enumIcons.key,
                ),
        );
    const secretIdEnumProvider = (
        executor: Record<string, unknown> | undefined,
        _scope: unknown,
    ) => {
        const key =
            (executor?.namedArgumentList as Array<Record<string, unknown>> | undefined)
                ?.find((x) => x.name === 'key')
                ?.value?.toString() || resolveSecretKey();
        if (!key) return [];

        const secrets = getSecretsForKey(key);
        if (secrets.length === 0) return [];

        return secrets.map((secret) => {
            return new SlashCommandEnumValue(
                secret.id,
                `${secret.label} (${secret.value})`,
                enumTypes.name,
                enumIcons.key,
            );
        });
    };

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'secret-id',
            aliases: ['secret-rotate'],
            helpString: t`Sets the ID of a currently active secret key. Gets the ID of the secret key if no value is provided.`,
            returns: t`The ID of the secret key that is now active.`,
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'quiet',
                    description: t`Suppress toast message notifications.`,
                    isRequired: false,
                    defaultValue: String(false),
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description: t`The key to get the secret ID for. If not provided, will use the currently active API secrets.`,
                    isRequired: false,
                    typeList: [ARGUMENT_TYPE.STRING],
                    enumProvider: secretKeyEnumProvider,
                }),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: t`The ID or a label of the secret key to set as active. If not provided, will return the currently active secret ID.`,
                    isRequired: true,
                    typeList: [ARGUMENT_TYPE.STRING],
                    enumProvider: secretIdEnumProvider,
                }),
            ],
            callback: async (args: Record<string, unknown>, value: string) => {
                const quiet = isTrueBoolean(args?.quiet?.toString());
                const id = value?.toString()?.trim();
                const key = args?.key?.toString()?.trim() || resolveSecretKey();

                if (!key) {
                    if (!quiet)
                        notyf.error(
                            t`No secret key provided, and the key can't be resolved for the currently selected API type.`,
                        );
                    return '';
                }

                const secrets = getSecretsForKey(key);
                if (secrets.length === 0) {
                    if (!quiet) notyf.error(t`No saved secrets found for the key: ${key}`);
                    return '';
                }

                const targetSecret = findSecretByPriority(secrets, id);

                if (!targetSecret) {
                    if (!quiet)
                        notyf.error(
                            id
                                ? t`No secret found with ID: ${id} for the key: ${key}`
                                : t`No active secret found for the key: ${key}`,
                        );
                    return '';
                }

                if (id) {
                    await rotateSecret(key, targetSecret.id);
                    if (!quiet)
                        notyf.success(t`Secret with ID: ${id} is now active for the key: ${key}`);
                }

                return targetSecret.id;
            },
        }),
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'secret-delete',
            helpString: t`Deletes a secret key by ID.`,
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'quiet',
                    description: t`Suppress toast message notifications.`,
                    isRequired: false,
                    defaultValue: String(false),
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description: t`The key to delete the secret from. If not provided, will use the currently active API secrets.`,
                    isRequired: false,
                    typeList: [ARGUMENT_TYPE.STRING],
                    enumProvider: secretKeyEnumProvider,
                }),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: t`The ID or a label of the secret key to delete. If not provided, will delete the active secret.`,
                    isRequired: true,
                    typeList: [ARGUMENT_TYPE.STRING],
                    enumProvider: secretIdEnumProvider,
                }),
            ],
            callback: async (args: Record<string, unknown>, value: string) => {
                const quiet = isTrueBoolean(args?.quiet?.toString());
                const id = value?.toString()?.trim();
                const key = args?.key?.toString()?.trim() || resolveSecretKey();

                if (!key) {
                    if (!quiet)
                        notyf.error(
                            t`No secret key provided, and the key can't be resolved for the currently selected API type.`,
                        );
                    return '';
                }

                const secrets = getSecretsForKey(key);
                if (secrets.length === 0) {
                    if (!quiet) notyf.error(t`No saved secrets found for the key: ${key}`);
                    return '';
                }

                const savedSecret = findSecretByPriority(secrets, id);
                if (!savedSecret) {
                    if (!quiet) notyf.error(t`No secret found with ID: ${id} for the key: ${key}`);
                    return '';
                }

                await deleteSecret(key, savedSecret.id);
                if (!quiet)
                    notyf.success(t`Secret with ID: ${id} has been deleted for the key: ${key}`);

                return savedSecret.id;
            },
        }),
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'secret-write',
            helpString: t`Writes a secret key with a value and an optional label.`,
            returns: t`The ID of the newly created secret key.`,
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'quiet',
                    description: t`Suppress toast message notifications.`,
                    isRequired: false,
                    defaultValue: String(false),
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description: t`The key to write the secret to. If not provided, will use the currently active API secrets.`,
                    isRequired: false,
                    typeList: [ARGUMENT_TYPE.STRING],
                    enumProvider: secretKeyEnumProvider,
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'label',
                    description: t`The label for the secret key. If not provided, will use the current date and time.`,
                    isRequired: false,
                    typeList: [ARGUMENT_TYPE.STRING],
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'empty',
                    description: t`Whether to allow empty values.`,
                    isRequired: false,
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                    defaultValue: String(false),
                }),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: t`The value of the secret key to write.`,
                    isRequired: true,
                    typeList: [ARGUMENT_TYPE.STRING],
                }),
            ],
            callback: async (args: Record<string, unknown>, value: string) => {
                const quiet = isTrueBoolean(args?.quiet?.toString());
                const allowEmpty = isTrueBoolean(args?.empty?.toString());
                const key = args?.key?.toString()?.trim() || resolveSecretKey();

                if (!key) {
                    if (!quiet)
                        notyf.error(
                            t`No secret key provided, and the key can't be resolved for the currently selected API type.`,
                        );
                    return '';
                }

                const secrets = getSecretsForKey(key);
                if (secrets.length === 0) {
                    if (!quiet) notyf.error(t`No saved secrets found for the key: ${key}`);
                    return '';
                }

                const valueStr = value?.toString()?.trim();
                if (!valueStr && !allowEmpty) {
                    if (!quiet) notyf.error(t`No value provided for the secret key: ${key}`);
                    return '';
                }

                const label = args?.label?.toString()?.trim() || getLabel();
                const id = await writeSecret(key, valueStr, label, { allowEmpty });

                if (!quiet) notyf.success(t`Secret has been written for the key: ${key}`);

                return id || '';
            },
        }),
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'secret-rename',
            helpString: t`Renames a secret key by ID.`,
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'quiet',
                    description: t`Suppress toast message notifications.`,
                    isRequired: false,
                    defaultValue: String(false),
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description: t`The key to rename the secret in. If not provided, will use the currently active API secrets.`,
                    isRequired: false,
                    typeList: [ARGUMENT_TYPE.STRING],
                    enumProvider: secretKeyEnumProvider,
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'id',
                    description: t`The ID of the secret to rename. If not provided, will rename the active secret.`,
                    isRequired: true,
                    typeList: [ARGUMENT_TYPE.STRING],
                }),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: t`The new label for the secret key.`,
                    isRequired: true,
                    typeList: [ARGUMENT_TYPE.STRING],
                }),
            ],
            callback: async (args: Record<string, unknown>, value: string) => {
                const quiet = isTrueBoolean(args?.quiet?.toString());
                const key = args?.key?.toString()?.trim() || resolveSecretKey();
                const id = args?.id?.toString()?.trim();

                if (!key) {
                    if (!quiet)
                        notyf.error(
                            t`No secret key provided, and the key can't be resolved for the currently selected API type.`,
                        );
                    return '';
                }

                const secrets = getSecretsForKey(key);
                if (secrets.length === 0) {
                    if (!quiet) notyf.error(t`No saved secrets found for the key: ${key}`);
                    return '';
                }

                const newLabel = value?.toString()?.trim();
                if (!newLabel) {
                    if (!quiet) notyf.error(t`No new label provided for the secret key: ${key}`);
                    return '';
                }

                const savedSecret = findSecretByPriority(secrets, id);
                if (!savedSecret) {
                    if (!quiet) notyf.error(t`No secret found with ID: ${id} for the key: ${key}`);
                    return '';
                }

                await renameSecret(key, savedSecret.id, newLabel);
                if (!quiet)
                    notyf.success(
                        t`Secret with ID: ${id} has been renamed to "${newLabel}" for the key: ${key}`,
                    );

                return savedSecret.id;
            },
        }),
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'secret-read',
            aliases: ['secret-find', 'secret-get'],
            helpString: t`Reads a secret key by ID. If key exposure is disabled, this command will not work!`,
            returns: t`The value of the secret key.`,
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'quiet',
                    description: t`Suppress toast message notifications.`,
                    isRequired: false,
                    defaultValue: String(false),
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description: t`The key to read the secret from. If not provided, will use the currently active API secrets.`,
                    isRequired: false,
                    typeList: [ARGUMENT_TYPE.STRING],
                    enumProvider: secretKeyEnumProvider,
                }),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: t`The ID or a label of the secret key to read. If not provided, will return the currently active secret value.`,
                    isRequired: true,
                    typeList: [ARGUMENT_TYPE.STRING],
                    enumProvider: secretIdEnumProvider,
                }),
            ],
            callback: async (args: Record<string, unknown>, value: string) => {
                const quiet = isTrueBoolean(args?.quiet?.toString());
                const key = args?.key?.toString()?.trim() || resolveSecretKey();
                const id = value?.toString()?.trim();

                if (!key) {
                    if (!quiet)
                        notyf.error(
                            t`No secret key provided, and the key can't be resolved for the currently selected API type.`,
                        );
                    return '';
                }

                const secrets = getSecretsForKey(key);
                if (secrets.length === 0) {
                    if (!quiet) notyf.error(t`No saved secrets found for the key: ${key}`);
                    return '';
                }

                const savedSecret = findSecretByPriority(secrets, id);
                if (!savedSecret) {
                    if (!quiet) notyf.error(t`No secret found with ID: ${id} for the key: ${key}`);
                    return '';
                }

                const secretValue = await findSecret(key, savedSecret.id);
                if (secretValue === null) {
                    if (!quiet)
                        notyf.error(
                            t`Could not retrieve the secret value for key: ${key}. Key exposure might be disabled.`,
                        );
                    return '';
                }

                return secretValue;
            },
        }),
    );
}

/**
 *
 */
export async function initSecrets() {
    await initKeyRegistry();
    document.getElementById('viewSecrets')?.addEventListener('click', viewSecrets);

    document.addEventListener('click', async function (e: Event) {
        if (!(e.target instanceof Element)) return;
        const manageBtn = e.target.closest('.manage-api-keys') as HTMLElement | null;
        if (!manageBtn) return;
        const key = manageBtn.getAttribute('data-key');
        if (!key || !Object.values(SECRET_KEYS).includes(key)) {
            console.error('Invalid key for manage-api-keys:', key);
            return;
        }
        await openKeyManagerDialog(key);
    });

    document.addEventListener('input', function (this: HTMLElement, e: Event) {
        if (!(e.target instanceof HTMLInputElement)) return;
        const target = e.target;
        const value = target.value;
        const id = target.getAttribute('id');

        // V8 Optimization: Skip DOM checks completely if the field is empty,
        // and stop iterating selectors as soon as one is matched.
        if (value.length > 0) {
            const keys = Object.keys(_inputMap);
            for (const key of keys) {
                const inputSelector = _inputMap[key]!;

                if (target.matches(inputSelector)) {
                    const secrets = getSecretsForKey(key);
                    const secretMatch = secrets.find((secret) => secret.id === value);
                    if (secretMatch) {
                        target.value = '';
                        rotateSecret(key, secretMatch.id!);
                        return;
                    }
                    break;
                }
            }
        }

        const warningElement = document.querySelector(`[data-for="${id}"]`);
        if (warningElement) {
            warningElement.classList.toggle('hidden', value.length === 0);
        }
    });

    document.querySelector('.openrouter_authorize')?.addEventListener('click', authorizeOpenRouter);

    document.addEventListener('click', async function (e: Event) {
        const creditsBtn =
            e.target instanceof Element
                ? (e.target.closest('.openrouter_view_credits') as HTMLElement | null)
                : null;
        if (!creditsBtn) return;
        e.preventDefault();
        const display = creditsBtn.parentElement?.querySelector(
            '.openrouter_credits_display',
        ) as HTMLElement | null;
        if (!display) return;
        display.textContent = t`Loading…`;
        try {
            const response = await fetch('/api/openrouter/credits', {
                method: 'POST',
                headers: getRequestHeaders(),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = (await response.json()) as Record<string, unknown>;
            if (typeof data.remaining !== 'number') throw new Error('Invalid response');

            display.textContent = `$${(data.remaining as number).toFixed(2)}`;
        } catch (error) {
            console.error('Failed to fetch OpenRouter credits:', error);
            display.textContent = '';
            notyf.error(t`Could not fetch OpenRouter credits. Please try again.`);
        }
    });

    const formatNanoGptNumber = (num: unknown, decimals: number | null = null) => {
        const number = Number(num);
        if (!Number.isFinite(number)) return decimals === null ? '0' : (0).toFixed(decimals);
        if (decimals !== null) return number.toFixed(decimals);
        if (number >= 1000000) return (number / 1000000).toFixed(1) + 'M';
        if (number >= 1000) return (number / 1000).toFixed(1) + 'K';
        return number.toString();
    };

    const createNanoGptCreditsPopup = (credits: Record<string, unknown>) => {
        const root = document.createElement('div');
        root.className = 'nanogpt-credits-popup';
        const heading = document.createElement('h3');
        heading.textContent = t`NanoGPT Credits & Usage`;
        root.appendChild(heading);

        const rows: Array<[string, string]> = [
            [t`USD`, `$${formatNanoGptNumber(credits.usdBalance as number, 2)}`],
            [t`NANO`, formatNanoGptNumber(credits.nanoBalance as number, 3)],
        ];

        const addUsage = (
            label: string,
            usage: Record<string, unknown> | undefined,
            limit: number | undefined,
        ) => {
            if (usage) {
                rows.push([
                    label,
                    t`${formatNanoGptNumber(usage.used)} / ${formatNanoGptNumber(limit ?? 0)} (${formatNanoGptNumber(usage.remaining)} left)`,
                ]);
            }
        };

        if ((credits.subscription as Record<string, unknown>)?.active) {
            const sub = credits.subscription as Record<string, unknown>;
            const subEndDate = (sub.period as Record<string, unknown>)?.currentPeriodEnd
                ? moment((sub.period as Record<string, unknown>).currentPeriodEnd as string).format(
                      'LL',
                  )
                : t`Unknown`;
            rows.push([t`Sub`, t`Active (until ${subEndDate})`]);
            addUsage(
                t`Tokens/wk`,
                sub.weekly_tokens as Record<string, unknown>,
                (sub.limits as Record<string, unknown>)?.weeklyInputTokens as number,
            );
            addUsage(
                t`Tokens/day`,
                sub.daily_tokens as Record<string, unknown>,
                (sub.limits as Record<string, unknown>)?.dailyInputTokens as number,
            );
            addUsage(
                t`Images/day`,
                sub.daily_images as Record<string, unknown>,
                (sub.limits as Record<string, unknown>)?.dailyImages as number,
            );
        }

        // Batch these appends with a DocumentFragment.
        // Reduces style recalculation checks when building UI dynamically.
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < rows.length; i++) {
            const [label, value] = rows[i]!;
            const labelDiv = document.createElement('div');
            labelDiv.textContent = label;
            fragment.appendChild(labelDiv);
            const valueDiv = document.createElement('div');
            valueDiv.textContent = value;
            fragment.appendChild(valueDiv);
        }
        root.appendChild(fragment);

        return root;
    };

    document.addEventListener('click', async function (event: Event) {
        const target =
            event.target instanceof Element
                ? (event.target.closest('.nanogpt_view_credits') as HTMLElement | null)
                : null;
        if (!target) return;
        event.preventDefault();
        const display = target.parentElement?.querySelector(
            '.nanogpt_credits_display',
        ) as HTMLElement | null;
        if (!display) return;
        display.textContent = t`Loading…`;

        try {
            const response = await fetch('/api/nanogpt/credits', {
                method: 'POST',
                headers: getRequestHeaders(),
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = (await response.json()) as Record<string, unknown>;

            const usdBalance = Number(data.usd_balance);
            const nanoBalance = Number(data.nano_balance);
            if (!Number.isFinite(usdBalance) || !Number.isFinite(nanoBalance)) {
                throw new Error('Invalid response');
            }

            const balances = [`$${formatNanoGptNumber(usdBalance, 2)}`];
            if (nanoBalance > 0) {
                balances.push(`${formatNanoGptNumber(nanoBalance, 3)} NANO`);
            }
            let shortInlineText = balances.join(' | ');

            if ((data.subscription as Record<string, unknown>)?.active) {
                shortInlineText += ` | ${t`Sub Active`}`;
            }

            display.textContent = shortInlineText + ' ';

            const infoBtn = document.createElement('i');
            infoBtn.className = 'fa-solid fa-circle-info cursor-pointer nanogpt_info_btn';
            infoBtn.title = t`View details`;
            (infoBtn as unknown as Record<string, unknown>).__creditsData = {
                usdBalance,
                nanoBalance,
                subscription: data.subscription,
            };
            display.appendChild(infoBtn);
        } catch (error) {
            console.error('Failed to fetch NanoGPT credits:', error);
            if (display) display.textContent = '';
            notyf.error(t`Could not fetch NanoGPT credits. Please try again.`);
        }
    });

    document.addEventListener('click', async function (e: Event) {
        const target =
            e.target instanceof Element
                ? (e.target.closest('.nanogpt_info_btn') as HTMLElement | null)
                : null;
        if (!target) return;
        const credits = (target as unknown as Record<string, unknown>).__creditsData as
            | Record<string, unknown>
            | undefined;
        if (credits) {
            await callGenericPopup(createNanoGptCreditsPopup(credits), POPUP_TYPE.TEXT);
        }
    });
    registerSecretSlashCommands();
}
