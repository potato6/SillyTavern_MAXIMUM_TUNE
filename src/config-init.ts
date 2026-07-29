import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import color from 'chalk';
import { serverDirectory } from './server-directory.js';
import { keyToEnv, setConfigFilePath } from './util.js';

// Import from es-toolkit
import { difference } from 'es-toolkit/array';
import { get, set, has, unset, defaultsDeep } from 'es-toolkit/compat';

type MigrationMap = {
    oldKey: string;
    newKey: string;
    migrate: (value: unknown) => unknown;
    remove?: boolean;
};

const keyMigrationMap: MigrationMap[] = [
    {
        oldKey: 'disableThumbnails',
        newKey: 'thumbnails.enabled',
        migrate: (value: unknown) => !value,
    },
    {
        oldKey: 'thumbnailsQuality',
        newKey: 'thumbnails.quality',
        migrate: (value: unknown) => value,
    },
    {
        oldKey: 'avatarThumbnailsPng',
        newKey: 'thumbnails.format',
        migrate: (value: unknown) => (value ? 'png' : 'jpg'),
    },
    {
        oldKey: 'disableChatBackup',
        newKey: 'backups.chat.enabled',
        migrate: (value: unknown) => !value,
    },
    {
        oldKey: 'numberOfBackups',
        newKey: 'backups.common.numberOfBackups',
        migrate: (value: unknown) => value,
    },
    {
        oldKey: 'maxTotalChatBackups',
        newKey: 'backups.chat.maxTotalBackups',
        migrate: (value: unknown) => value,
    },
    {
        oldKey: 'chatBackupThrottleInterval',
        newKey: 'backups.chat.throttleInterval',
        migrate: (value: unknown) => value,
    },
    {
        oldKey: 'enableExtensions',
        newKey: 'extensions.enabled',
        migrate: (value: unknown) => value,
    },
    {
        oldKey: 'enableExtensionsAutoUpdate',
        newKey: 'extensions.autoUpdate',
        migrate: (value: unknown) => value,
    },
    {
        oldKey: 'extras.disableAutoDownload',
        newKey: 'extensions.models.autoDownload',
        migrate: (value: unknown) => !value,
    },
    {
        oldKey: 'extras.classificationModel',
        newKey: 'extensions.models.classification',
        migrate: (value: unknown) => value,
    },
    {
        oldKey: 'extras.captioningModel',
        newKey: 'extensions.models.captioning',
        migrate: (value: unknown) => value,
    },
    {
        oldKey: 'extras.embeddingModel',
        newKey: 'extensions.models.embedding',
        migrate: (value: unknown) => value,
    },
    {
        oldKey: 'extras.speechToTextModel',
        newKey: 'extensions.models.speechToText',
        migrate: (value: unknown) => value,
    },
    {
        oldKey: 'extras.textToSpeechModel',
        newKey: 'extensions.models.textToSpeech',
        migrate: (value: unknown) => value,
    },
    {
        oldKey: 'minLogLevel',
        newKey: 'logging.minLogLevel',
        migrate: (value: unknown) => value,
    },
    {
        oldKey: 'cardsCacheCapacity',
        newKey: 'performance.memoryCacheCapacity',
        migrate: (value: unknown) => `${String(value)}mb`,
    },
    {
        oldKey: 'cookieSecret',
        newKey: 'cookieSecret',
        migrate: () => void 0,
        remove: true,
    },
    {
        oldKey: 'autorun',
        newKey: 'browserLaunch.enabled',
        migrate: (value: unknown) => value,
    },
    {
        oldKey: 'autorunHostname',
        newKey: 'browserLaunch.hostname',
        migrate: (value: unknown) => value,
    },
    {
        oldKey: 'autorunPortOverride',
        newKey: 'browserLaunch.port',
        migrate: (value: unknown) => value,
    },
    {
        oldKey: 'avoidLocalhost',
        newKey: 'browserLaunch.avoidLocalhost',
        migrate: (value: unknown) => value,
    },
    {
        oldKey: 'extras.promptExpansionModel',
        newKey: 'extras.promptExpansionModel',
        migrate: () => void 0,
        remove: true,
    },
    {
        oldKey: 'autheliaAuth',
        newKey: 'sso.autheliaAuth',
        migrate: (value: unknown) => value,
    },
    {
        oldKey: 'authentikAuth',
        newKey: 'sso.authentikAuth',
        migrate: (value: unknown) => value,
    },
];

/**
 * Gets all keys from an object recursively.
 * @param {object} obj Object to get all keys from
 * @param {string} prefix Prefix to prepend to all keys
 * @returns {string[]} Array of all keys in the object
 */
function getAllKeys(obj: Record<string, unknown>, prefix = ''): string[] {
    return Object.keys(obj).flatMap((key) => {
        const newPrefix = prefix ? `${prefix}.${key}` : key;
        const value = obj[key];
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            return getAllKeys(value as Record<string, unknown>, newPrefix);
        } else {
            return [newPrefix];
        }
    });
}

/**
 * Compares the current config.yaml with the default config.yaml and adds any missing values.
 * @param {string} configPath Path to config.yaml
 */
export async function addMissingConfigValues(configPath: string) {
    try {
        const defaultConfig = yaml.parse(
            await Bun.file(path.join(serverDirectory, './default/config.yaml')).text(),
        );

        if (!(await Bun.file(configPath).exists())) {
            console.warn(
                color.yellow(
                    `Warning: config.yaml not found at ${configPath}. Creating a new one with default values.`,
                ),
            );
            fs.writeFileSync(configPath, yaml.stringify(defaultConfig));
            return;
        }

        let config = yaml.parse(await Bun.file(configPath).text());

        // Migrate old keys to new keys
        const migratedKeys = [];
        for (const { oldKey, newKey, migrate, remove } of keyMigrationMap) {
            // Migrate environment variables
            const oldEnvKey = keyToEnv(oldKey);
            const newEnvKey = keyToEnv(newKey);
            if (process.env[oldEnvKey] && !process.env[newEnvKey]) {
                const oldValue = process.env[oldEnvKey];
                const newValue = migrate(oldValue);
                // @ts-expect-error TS(2322) FIXME: Type 'unknown' is not assignable to type 'string |... Remove this comment to see the full error message
                process.env[newEnvKey] = newValue;
                delete process.env[oldEnvKey];
                console.warn(
                    color.yellow(
                        `Warning: Using a deprecated environment variable: ${oldEnvKey}. Please use ${newEnvKey} instead.`,
                    ),
                );
                console.log(
                    `Redirecting ${color.blue(oldEnvKey)}=${oldValue} -> ${color.blue(newEnvKey)}=${newValue}`,
                );
            }

            if (has(config, oldKey)) {
                if (remove) {
                    unset(config, oldKey);
                    migratedKeys.push({
                        oldKey,
                        newValue: void 0,
                    });
                    continue;
                }

                const oldValue = get(config, oldKey);
                const newValue = migrate(oldValue);
                set(config, newKey, newValue);
                unset(config, oldKey);

                migratedKeys.push({
                    oldKey,
                    newKey,
                    oldValue,
                    newValue,
                });
            }
        }

        // Get all keys from the original config
        const originalKeys = getAllKeys(config);

        // Use es-toolkit's compat logic to recursively apply default properties
        config = defaultsDeep(config, defaultConfig);

        // Get all keys from the updated config
        const updatedKeys = getAllKeys(config);

        // Find the keys that were added
        const addedKeys = difference(updatedKeys, originalKeys);

        if (addedKeys.length === 0 && migratedKeys.length === 0) {
            return;
        }

        if (addedKeys.length > 0) {
            console.log('Adding missing config values to config.yaml:', addedKeys);
        }

        if (migratedKeys.length > 0) {
            console.log('Migrating config values in config.yaml:', migratedKeys);
        }

        fs.writeFileSync(configPath, yaml.stringify(config));
    } catch (error) {
        console.warn(color.yellow('Could not add missing config values to config.yaml'), error);
    }
}

/**
 * Performs early initialization tasks before the server starts.
 * @param {string} configPath Path to config.yaml
 */
export async function initConfig(configPath: string) {
    console.log('Using config path:', color.green(configPath));
    setConfigFilePath(configPath);
    await addMissingConfigValues(configPath);
}
