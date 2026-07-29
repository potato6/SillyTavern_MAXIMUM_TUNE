import fsp from 'node:fs/promises';
import path from 'node:path';

import { Elysia } from 'elysia';
import writeFileAtomic from 'write-file-atomic';
import { color, getConfigValue, uuidv4 } from '../util.js';

export const SECRETS_FILE = 'secrets.json';
import { CHAT_COMPLETION_SOURCES, TEXTGEN_TYPES } from '../constants.js';
import type { UserDirectoryList } from '../users.js';

interface UserDirectories {
    root: string;
    backups: string;
    [key: string]: unknown;
}

interface UserContext {
    directories?: UserDirectories;
    [key: string]: unknown;
}

const KEY_OVERRIDES = {
    _MIGRATED: '_migrated',
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

const STANDARD_EXTRAS = [
    'HORDE',
    'NOVEL',
    'SERPAPI',
    'STABILITY',
    'AZURE_TTS',
    'CUSTOM_OPENAI_TTS',
    'TAVILY',
    'BFL',
    'COMFY_RUNPOD',
    'FALAI',
    'SERPER',
    'ELEVENLABS',
    'NOMICAI',
] as const;

type ChatSourceKey = keyof typeof CHAT_COMPLETION_SOURCES;
type TextgenKey = keyof typeof TEXTGEN_TYPES;
type OverrideKey = keyof typeof KEY_OVERRIDES;
type ExtraKey = (typeof STANDARD_EXTRAS)[number];
type SecretKeyName = ChatSourceKey | TextgenKey | OverrideKey | ExtraKey;

export const SECRET_KEYS = Object.fromEntries(
    [
        ...new Set([
            ...(Object.keys(CHAT_COMPLETION_SOURCES) as ChatSourceKey[]),
            ...(Object.keys(TEXTGEN_TYPES) as TextgenKey[]),
            ...(Object.keys(KEY_OVERRIDES) as OverrideKey[]),
            ...(STANDARD_EXTRAS as unknown as ExtraKey[]),
        ]),
    ].map((name) => [name as string, deriveKey(name as string)]),
) as { [K in SecretKeyName]: string } & Record<string, string>;

/**
 * @typedef {object} SecretValue
 * @property {string} id The unique identifier for the secret
 * @property {string} value The secret value
 * @property {string} label The label for the secret
 * @property {boolean} active Whether the secret is currently active
 */
interface SecretValue {
    id: string;
    value: string;
    label: string;
    active: boolean;
}

/**
 * @typedef {object} SecretState
 * @property {string} id The unique identifier for the secret
 * @property {string} value The secret value, masked for security
 * @property {string} label The label for the secret
 * @property {boolean} active Whether the secret is currently active
 */

/**
 * @typedef {Record<string, SecretState[]|null>} SecretStateMap
 */

/**
 * @typedef {{[key: string]: SecretValue[]}} SecretKeys
 * @typedef {{[key: string]: string}} FlatSecretKeys
 */
type SecretKeys = Record<string, SecretValue[]>;
type FlatSecretKeys = Record<string, string>;

// These are the keys that are safe to expose, even if allowKeysExposure is false
const EXPORTABLE_KEYS = new Set([
    SECRET_KEYS.LIBRE_URL,
    SECRET_KEYS.LINGVA_URL,
    SECRET_KEYS.ONERING_URL,
    SECRET_KEYS.DEEPLX_URL,
]);

export const allowKeysExposure = !!getConfigValue('allowKeysExposure', false, 'boolean');

const MASK_THRESHOLD = 10;
const MASK_EXPOSED_CHARS = 3;
const MASK_FULL_PLACEHOLDER = '**********';
const MASK_PREFIX_PLACEHOLDER = '*******';

/**
 * SecretManager class to handle all secret operations
 */
export class SecretManager {
    defaultSecrets: Record<string, never>;
    directories: UserDirectoryList;
    filePath: string;

    /**
     * @param {UserDirectoryList} directories User directories
     */
    constructor(directories: UserDirectoryList) {
        this.directories = directories;
        this.filePath = path.join(directories.root, SECRETS_FILE);
        this.defaultSecrets = {};
    }

    /**
     * Ensures the secrets file exists, creating an empty one if necessary
     * @private
     */
    async _ensureSecretsFile() {
        try {
            await fsp.access(this.filePath);
        } catch {
            await writeFileAtomic(this.filePath, JSON.stringify(this.defaultSecrets), 'utf-8');
        }
    }

    /**
     * Reads and parses the secrets file
     * @private
     * @returns {Promise<SecretKeys>} The parsed secrets from the file
     */
    async _readSecretsFile(): Promise<SecretKeys> {
        await this._ensureSecretsFile();
        try {
            const fileContents = await fsp.readFile(this.filePath, 'utf-8');
            return JSON.parse(fileContents);
        } catch {
            return {};
        }
    }

    /**
     * Writes secrets to the file atomically
     * @private
     * @param {SecretKeys} secrets The secrets object to write
     */
    async _writeSecretsFile(secrets: SecretKeys) {
        await writeFileAtomic(this.filePath, JSON.stringify(secrets, null, 4), 'utf-8');
    }

    /**
     * Deactivates all secrets for a given key
     * @private
     * @param {SecretValue[]} secretArray Array of secrets to deactivate
     */
    _deactivateAllSecrets(secretArray: SecretValue[]) {
        for (let i = 0; i < secretArray.length; i++) {
            secretArray[i]!.active = false;
        }
    }

    /**
     * Validates that the secret key exists and has valid structure
     * @private
     * @param {SecretKeys} secrets The secrets object
     * @param {string} key The secret key to validate
     * @returns {boolean} Whether the key exists and has a valid secret array
     */
    _validateSecretKey(secrets: SecretKeys, key: string) {
        return Array.isArray(secrets[key]);
    }

    /**
     * Masks a secret value with asterisks in the middle
     * @param {string} value The secret value to mask
     * @param {string} key The secret key
     * @returns {string} A masked version of the value for peeking
     */
    getMaskedValue(value: string, key: string) {
        if (allowKeysExposure || EXPORTABLE_KEYS.has(key)) {
            return value;
        }

        if (value.length <= MASK_THRESHOLD) {
            return MASK_FULL_PLACEHOLDER;
        }

        const visibleEnd = value.slice(-MASK_EXPOSED_CHARS);
        return `${MASK_PREFIX_PLACEHOLDER}${visibleEnd}`;
    }

    /**
     * Writes a secret to the secrets file
     * @param {string} key Secret key
     * @param {string} value Secret value
     * @param {string} label Label for the secret
     * @returns {Promise<string>} The ID of the newly created secret
     */
    async writeSecret(key: string, value: string, label = 'Unlabeled') {
        const secrets = await this._readSecretsFile();

        if (!Array.isArray(secrets[key])) {
            secrets[key] = [];
        }

        this._deactivateAllSecrets(secrets[key]);

        const secret: SecretValue = {
            id: uuidv4(),
            value,
            label,
            active: true,
        };
        secrets[key].push(secret);

        await this._writeSecretsFile(secrets);
        return secret.id;
    }

    /**
     * Deletes a secret from the secrets file by its ID
     * @param {string} key Secret key
     * @param {string?} id Secret ID to delete
     */
    async deleteSecret(key: string, id: string | null) {
        const secrets = await this._readSecretsFile();

        if (!this._validateSecretKey(secrets, key)) {
            return;
        }

        const secretArray = secrets[key];

        if (!secretArray) {
            return;
        }

        let targetIndex = -1;

        for (let i = 0; i < secretArray.length; i++) {
            const s = secretArray[i]!;
            if (id ? s.id === id : s.active) {
                targetIndex = i;
                break;
            }
        }

        if (targetIndex !== -1) {
            secretArray.splice(targetIndex, 1);
        }

        let hasActive = false;
        for (let i = 0; i < secretArray.length; i++) {
            if (secretArray[i]!.active) {
                hasActive = true;
                break;
            }
        }

        if (secretArray.length > 0 && !hasActive) {
            secretArray[0]!.active = true;
        }

        if (secretArray.length === 0) {
            delete secrets[key];
        }

        await this._writeSecretsFile(secrets);
    }

    /**
     * Reads the active secret value for a given key
     * @param {string} key Secret key
     * @param {string?} id ID of the secret to read (optional)
     * @returns {Promise<string>} Secret value or empty string if not found
     */
    async readSecret(key: string, id: string | null = null): Promise<string> {
        const secrets = await this._readSecretsFile();
        const secretArray = secrets[key];

        if (Array.isArray(secretArray) && secretArray.length > 0) {
            for (let i = 0; i < secretArray.length; i++) {
                const s = secretArray[i]!;
                if (id ? s.id === id : s.active) {
                    return s.value || '';
                }
            }
        }

        return '';
    }

    /**
     * Activates a specific secret by ID for a given key
     * @param {string} key Secret key to rotate
     * @param {string} id ID of the secret to activate
     */
    async rotateSecret(key: string, id: string) {
        const secrets = await this._readSecretsFile();

        if (!this._validateSecretKey(secrets, key)) {
            return;
        }

        const secretArray = secrets[key];

        if (!secretArray) {
            return;
        }

        let targetIndex = -1;

        for (let i = 0; i < secretArray.length; i++) {
            if (secretArray[i]!.id === id) {
                targetIndex = i;
                break;
            }
        }

        if (targetIndex === -1) {
            console.warn(`Secret with ID ${id} not found for key ${key}`);
            return;
        }

        this._deactivateAllSecrets(secretArray);
        secretArray[targetIndex]!.active = true;

        await this._writeSecretsFile(secrets);
    }

    /**
     * Renames a secret by its ID
     * @param {string} key Secret key to rename
     * @param {string} id ID of the secret to rename
     * @param {string} label New label for the secret
     */
    async renameSecret(key: string, id: string, label: string) {
        const secrets = await this._readSecretsFile();

        if (!this._validateSecretKey(secrets, key)) {
            return;
        }

        const secretArray = secrets[key];

        if (!secretArray) {
            return;
        }

        let targetIndex = -1;

        for (let i = 0; i < secretArray.length; i++) {
            if (secretArray[i]!.id === id) {
                targetIndex = i;
                break;
            }
        }

        if (targetIndex === -1) {
            console.warn(`Secret with ID ${id} not found for key ${key}`);
            return;
        }

        secretArray[targetIndex]!.label = label;
        await this._writeSecretsFile(secrets);
    }

    /**
     * Gets the state of all secrets (whether they exist or not)
     * @returns {Promise<Record<string, any>>} Secret state
     */
    async getSecretState() {
        const secrets = await this._readSecretsFile();
        const state: Record<string, any> = {};
        const secretKeyValues = Object.values(SECRET_KEYS);
        const count = secretKeyValues.length;

        for (let i = 0; i < count; i++) {
            const key = secretKeyValues[i]!;
            if (key === SECRET_KEYS._MIGRATED) {
                continue;
            }
            const value = secrets[key];
            if (Array.isArray(value) && value.length > 0) {
                const valCount = value.length;
                const mapped = Array(valCount);
                for (let j = 0; j < valCount; j++) {
                    const secret = value[j]!;
                    mapped[j] = {
                        id: secret.id,
                        value: this.getMaskedValue(secret.value, key),
                        label: secret.label,
                        active: secret.active,
                    };
                }
                state[key] = mapped;
            } else {
                state[key] = null;
            }
        }

        return state;
    }

    /**
     * Gets all secrets (for admin viewing)
     * @returns {Promise<SecretKeys>} All secrets
     */
    async getAllSecrets() {
        return await this._readSecretsFile();
    }

    /**
     * Migrates legacy flat secrets format to new format
     */
    async migrateFlatSecrets() {
        try {
            await fsp.access(this.filePath);
        } catch {
            return;
        }

        const fileContents = await fsp.readFile(this.filePath, 'utf8');
        const secrets = (JSON.parse(fileContents) || {}) as FlatSecretKeys;
        const values = Object.values(secrets);

        if (
            secrets[SECRET_KEYS._MIGRATED] ||
            values.length === 0 ||
            values.some((v) => Array.isArray(v))
        ) {
            return;
        }

        const migratedSecrets: SecretKeys = {};
        const entries = Object.entries(secrets);

        for (let i = 0; i < entries.length; i++) {
            const [key, value] = entries[i]!;
            if (typeof value === 'string' && value.trim()) {
                migratedSecrets[key] = [
                    {
                        id: uuidv4(),
                        value,
                        label: key,
                        active: true,
                    },
                ];
            }
        }

        migratedSecrets[SECRET_KEYS._MIGRATED] = [];

        const backupFilePath = path.join(
            this.directories.backups,
            `secrets_migration_${Date.now()}.json`,
        );

        try {
            await fsp.cp(this.filePath, backupFilePath);
        } catch {
            // Backup copy fallback
        }

        await this._writeSecretsFile(migratedSecrets);
        console.info(
            color.green('Secrets migrated successfully, old secrets backed up to:'),
            backupFilePath,
        );
    }
}

//#region Backwards compatibility
/**
 * Writes a secret to the secrets file
 * @param {UserDirectoryList} directories User directories
 * @param {string} key Secret key
 * @param {string} value Secret value
 * @returns {Promise<string>} The ID of the newly created secret
 */
export async function writeSecret(directories: UserDirectoryList, key: string, value: string) {
    return await new SecretManager(directories).writeSecret(key, value);
}

/**
 * Deletes a secret from the secrets file
 * @param {UserDirectoryList} directories User directories
 * @param {string} key Secret key
 * @returns {Promise<void>}
 */
export async function deleteSecret(directories: UserDirectoryList, key: string) {
    return await new SecretManager(directories).deleteSecret(key, null);
}

/**
 * Reads a secret from the secrets file
 * @param {UserDirectoryList} directories User directories
 * @param {string} key Secret key
 * @param {string?} id Secret ID (optional)
 * @returns {Promise<string>} Secret value
 */
export async function readSecret(directories: UserDirectoryList, key: string, id: string | null = null) {
    return await new SecretManager(directories).readSecret(key, id);
}

/**
 * Reads the secret state from the secrets file
 * @param {UserDirectoryList} directories User directories
 * @returns {Promise<Record<string, boolean>>} Secret state
 */
export async function readSecretState(directories: UserDirectoryList) {
    const state = await new SecretManager(directories).getSecretState();
    const result: Record<string, boolean> = {};
    const keys = Object.values(SECRET_KEYS);

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i]!;
        if (key === SECRET_KEYS._MIGRATED) {
            continue;
        }
        result[key] = Array.isArray(state[key]) && state[key]!.length > 0;
    }

    return result;
}

/**
 * Reads all secrets from the secrets file
 * @param {UserDirectoryList} directories User directories
 * @returns {Promise<Record<string, string>>} Secrets
 */
export async function getAllSecrets(directories: UserDirectoryList) {
    const secrets = await new SecretManager(directories).getAllSecrets();
    const result: Record<string, string> = {};
    const entries = Object.entries(secrets);

    for (let i = 0; i < entries.length; i++) {
        const [key, values] = entries[i]!;
        if (key === SECRET_KEYS._MIGRATED) {
            continue;
        }
        if (Array.isArray(values) && values.length > 0) {
            let activeSecret: SecretValue | undefined;
            for (let j = 0; j < values.length; j++) {
                if (values[j]!.active) {
                    activeSecret = values[j]!;
                    break;
                }
            }
            if (activeSecret) {
                result[key] = activeSecret.value;
            }
        }
    }
    return result;
}
//#endregion

/**
 * Migrates legacy flat secrets format to the new format for all user directories
 * @param {UserDirectoryList[]} directoriesList User directories
 */
export async function migrateFlatSecrets(directoriesList: UserDirectoryList[]) {
    for (let i = 0; i < directoriesList.length; i++) {
        const directories = directoriesList[i]!;
        try {
            const manager = new SecretManager(directories);
            await manager.migrateFlatSecrets();
        } catch (error) {
            console.warn(color.red(`Failed to migrate secrets for ${directories.root}:`), error);
        }
    }
}

export const router = new Elysia({ prefix: '/api/secrets' })
    .post('/write', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

        try {
            const body = ctx.body as Record<string, unknown> | undefined;
            const key = body?.key as string;
            const value = body?.value;
            const label = (body?.label as string) ?? 'Unlabeled';

            if (!key || typeof value !== 'string') {
                set.status = 400;
                return 'Invalid key or value';
            }

            const manager = new SecretManager(directories as any);
            const id = await manager.writeSecret(key, value, label);

            return { id };
        } catch (error) {
            console.error('Error writing secret:', error);
            set.status = 500;
        }
    })
    .post('/read', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

        if (!directories) {
            set.status = 401;
            return { error: 'Not authenticated' };
        }
        try {
            const manager = new SecretManager(directories as any);
            const state = await manager.getSecretState();
            return state;
        } catch (error) {
            console.error('Error reading secret state:', error);
            return {};
        }
    })
    .post('/view', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

        try {
            if (!allowKeysExposure) {
                console.error(
                    'secrets.json could not be viewed unless allowKeysExposure in config.yaml is set to true',
                );
                set.status = 403;
                return;
            }

            const secrets = await getAllSecrets(directories as any);

            if (!secrets) {
                set.status = 404;
                return;
            }

            return secrets;
        } catch (error) {
            console.error('Error viewing secrets:', error);
            set.status = 500;
        }
    })
    .post('/find', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const body = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

        try {
            const key = body?.key as string;
            const id = body?.id as string;

            if (!key) {
                set.status = 400;
                return 'Key is required';
            }

            if (!allowKeysExposure && !EXPORTABLE_KEYS.has(key)) {
                console.error(
                    'Cannot fetch secrets unless allowKeysExposure in config.yaml is set to true',
                );
                set.status = 403;
                return;
            }

            const manager = new SecretManager(directories as any);
            const state = await manager.getSecretState();

            if (!state[key]) {
                set.status = 404;
                return;
            }

            const secretValue = await manager.readSecret(key, id);
            return { value: secretValue };
        } catch (error) {
            console.error('Error finding secret:', error);
            set.status = 500;
        }
    })
    .post('/delete', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const body = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

        try {
            const key = body?.key as string;
            const id = body?.id as string;

            if (!key) {
                set.status = 400;
                return 'Key and ID are required';
            }

            const manager = new SecretManager(directories as any);
            await manager.deleteSecret(key, id);

            set.status = 204;
            return;
        } catch (error) {
            console.error('Error deleting secret:', error);
            set.status = 500;
        }
    })
    .post('/rotate', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const body = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

        try {
            const key = body?.key as string;
            const id = body?.id as string;

            if (!key || !id) {
                set.status = 400;
                return 'Key and ID are required';
            }

            const manager = new SecretManager(directories as any);
            await manager.rotateSecret(key, id);

            set.status = 204;
            return;
        } catch (error) {
            console.error('Error rotating secret:', error);
            set.status = 500;
        }
    })
    .post('/rename', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const body = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

        try {
            const key = body?.key as string;
            const id = body?.id as string;
            const label = body?.label as string;

            if (!key || !id || !label) {
                set.status = 400;
                return 'Key, ID, and label are required';
            }

            const manager = new SecretManager(directories as any);
            await manager.renameSecret(key, id, label);

            set.status = 204;
            return;
        } catch (error) {
            console.error('Error renaming secret:', error);
            set.status = 500;
        }
    })
    .post('/settings', async () => {
        return { allowKeysExposure };
    });
