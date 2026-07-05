import fs from 'node:fs';
// @ts-expect-error TS(2792): Cannot find module 'yaml'. Did you mean to set the... Remove this comment to see the full error message
import yaml from 'yaml';
import storage from 'node-persist';
import {
    initUserStorage,
    getPasswordSalt,
    getPasswordHash,
    toKey,
} from './users.js';

/**
 * Initializes the storage with the data root specified in the config file.
 * @param {string} configPath - The path to the config file.
 */
async function initStorage(configPath: string) {
    const config = yaml.parse(fs.readFileSync(configPath, 'utf8'));
    const dataRoot = config.dataRoot;

    if (!dataRoot) {
        console.error('No "dataRoot" setting found in config.yaml file.');
        process.exit(1);
    }

    await initUserStorage(dataRoot);
}

/**
 * Recovers a user account by enabling it and optionally setting a new password.
 * @param {string} configPath - The path to the config file.
 * @param {string} userAccount - The username of the account to recover.
 * @param {string} [userPassword] - The new password for the account. If not provided, sets an empty password.
 */
export async function recoverPassword(configPath: string, userAccount: string, userPassword?: string) {
    await initStorage(configPath);

    /**
     * @type {import('./users').User}
     */
    const user = await storage.get(toKey(userAccount));

    if (!user) {
        console.error(`User "${userAccount}" not found.`);
        process.exit(1);
    }

    if (!user.enabled) {
        console.log('User is disabled. Enabling...');
        user.enabled = true;
    }

    if (userPassword) {
        console.log('Setting new password...');
        const salt = getPasswordSalt();
        const passwordHash = getPasswordHash(userPassword, salt);
        user.password = passwordHash;
        user.salt = salt;
    } else {
        console.log('Setting an empty password...');
        user.password = '';
        user.salt = '';
    }

    await storage.setItem(toKey(userAccount), user);
    console.log('User recovered. A program will exit now.');
}
