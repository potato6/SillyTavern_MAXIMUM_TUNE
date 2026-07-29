import { promises as fsPromises } from 'node:fs';

import storage from 'node-persist';
import { Elysia } from 'elysia';
import { deburr } from 'es-toolkit/compat';
import { checkForNewContent, CONTENT_TYPES } from './content-manager.js';
import {
    KEY_PREFIX,
    toKey,
    getUserAvatar,
    getAllUserHandles,
    getPasswordSalt,
    getPasswordHash,
    getUserDirectories,
    ensurePublicDirectoriesExist,
} from '../users.js';
import { DEFAULT_USER } from '../constants.js';

const NON_ALPHANUMERIC_REGEX = /[^a-z0-9]+/g;
const TRIM_HYPHENS_REGEX = /^-+|-+$/g;

interface UserProfile {
    admin?: boolean;
    handle?: string;
    name?: string;
    [key: string]: unknown;
}

interface UserContext {
    profile?: UserProfile;
    [key: string]: unknown;
}

/**
 * Slugifies a given text string.
 * - Converts to lowercase
 * - Trims whitespace
 * - Replaces spaces and special characters with hyphens
 * - Removes leading and trailing hyphens
 * - Uses es-toolkit deburr to remove diacritical marks
 * @param {string} text Text to slugify
 * @returns {string} Slugified text
 */
function slugify(text: string): string {
    if (!text) return '';
    const deburred = deburr(text.toLowerCase().trim());
    return deburred.replace(NON_ALPHANUMERIC_REGEX, '-').replace(TRIM_HYPHENS_REGEX, '');
}

function requireAdmin(context: Record<string, unknown>): boolean {
    const user = context.user as UserContext | undefined;
    return Boolean(user?.profile?.admin);
}

export const router = new Elysia({ prefix: '/api/users' })
    .post('/get', async (context) => {
        const { set } = context;

        try {
            if (!requireAdmin(context)) {
                set.status = 403;
                return;
            }

            const users = (await storage.values((x: { key: string }) =>
                x.key.startsWith(KEY_PREFIX),
            )) as any[];

            const count = users.length;
            const promises: Promise<{
                handle: string;
                name: string;
                avatar: string;
                admin: boolean;
                enabled: boolean;
                created: number;
                password: boolean;
            }>[] = Array.from({ length: count });

            for (let i = 0; i < count; i++) {
                const user = users[i];
                const handle = user.handle;
                promises[i] = getUserAvatar(handle).then((avatar) => ({
                    handle,
                    name: user.name,
                    avatar,
                    admin: Boolean(user.admin),
                    enabled: Boolean(user.enabled),
                    created: Number(user.created || 0),
                    password: Boolean(user.password),
                }));
            }

            const viewModels = await Promise.all(promises);
            viewModels.sort((a, b) => a.created - b.created);

            return viewModels;
        } catch (error) {
            console.error('User list failed:', error);
            set.status = 500;
        }
    })
    .post('/disable', async (context) => {
        const { set } = context;

        const body = (context.body ?? {}) as Record<string, unknown>;
        const ctxUser = context.user as UserContext | undefined;

        try {
            if (!requireAdmin(context)) {
                set.status = 403;
                return;
            }

            const handle = body.handle;
            if (typeof handle !== 'string' || handle.length === 0) {
                console.warn('Disable user failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            if (handle === ctxUser?.profile?.handle) {
                console.warn('Disable user failed: Cannot disable yourself');
                set.status = 400;
                return { error: 'Cannot disable yourself' };
            }

            const userKey = toKey(handle);
            const user = (await storage.getItem(userKey)) as Record<string, any> | null;

            if (!user) {
                console.error('Disable user failed: User not found');
                set.status = 404;
                return { error: 'User not found' };
            }

            user.enabled = false;
            await storage.setItem(userKey, user);
            set.status = 204;
        } catch (error) {
            console.error('User disable failed:', error);
            set.status = 500;
        }
    })
    .post('/enable', async (context) => {
        const { set } = context;

        const body = (context.body ?? {}) as Record<string, unknown>;

        try {
            if (!requireAdmin(context)) {
                set.status = 403;
                return;
            }

            const handle = body.handle;
            if (typeof handle !== 'string' || handle.length === 0) {
                console.warn('Enable user failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            const userKey = toKey(handle);
            const user = (await storage.getItem(userKey)) as Record<string, any> | null;

            if (!user) {
                console.error('Enable user failed: User not found');
                set.status = 404;
                return { error: 'User not found' };
            }

            user.enabled = true;
            await storage.setItem(userKey, user);
            set.status = 204;
        } catch (error) {
            console.error('User enable failed:', error);
            set.status = 500;
        }
    })
    .post('/promote', async (context) => {
        const { set } = context;

        const body = (context.body ?? {}) as Record<string, unknown>;

        try {
            if (!requireAdmin(context)) {
                set.status = 403;
                return;
            }

            const handle = body.handle;
            if (typeof handle !== 'string' || handle.length === 0) {
                console.warn('Promote user failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            const userKey = toKey(handle);
            const user = (await storage.getItem(userKey)) as Record<string, any> | null;

            if (!user) {
                console.error('Promote user failed: User not found');
                set.status = 404;
                return { error: 'User not found' };
            }

            user.admin = true;
            await storage.setItem(userKey, user);
            set.status = 204;
        } catch (error) {
            console.error('User promote failed:', error);
            set.status = 500;
        }
    })
    .post('/demote', async (context) => {
        const { set } = context;

        const body = (context.body ?? {}) as Record<string, unknown>;
        const ctxUser = context.user as UserContext | undefined;

        try {
            if (!requireAdmin(context)) {
                set.status = 403;
                return;
            }

            const handle = body.handle;
            if (typeof handle !== 'string' || handle.length === 0) {
                console.warn('Demote user failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            if (handle === ctxUser?.profile?.handle) {
                console.warn('Demote user failed: Cannot demote yourself');
                set.status = 400;
                return { error: 'Cannot demote yourself' };
            }

            const userKey = toKey(handle);
            const user = (await storage.getItem(userKey)) as Record<string, any> | null;

            if (!user) {
                console.error('Demote user failed: User not found');
                set.status = 404;
                return { error: 'User not found' };
            }

            user.admin = false;
            await storage.setItem(userKey, user);
            set.status = 204;
        } catch (error) {
            console.error('User demote failed:', error);
            set.status = 500;
        }
    })
    .post('/create', async (context) => {
        const { set } = context;

        const body = (context.body ?? {}) as Record<string, unknown>;

        try {
            if (!requireAdmin(context)) {
                set.status = 403;
                return;
            }

            const rawHandle = body.handle;
            const bodyName = body.name;

            if (
                typeof rawHandle !== 'string' ||
                typeof bodyName !== 'string' ||
                !rawHandle ||
                !bodyName
            ) {
                console.warn('Create user failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            const handles = await getAllUserHandles();
            const handle = slugify(rawHandle);

            if (!handle) {
                console.warn('Create user failed: Invalid handle');
                set.status = 400;
                return { error: 'Invalid handle' };
            }

            if (handles.includes(handle)) {
                console.warn('Create user failed: User with that handle already exists');
                set.status = 409;
                return { error: 'User already exists' };
            }

            const salt = getPasswordSalt();
            const password = body.password ? getPasswordHash(body.password as string, salt) : '';

            const newUser = {
                handle,
                name: bodyName,
                created: Date.now(),
                password,
                salt,
                admin: Boolean(body.admin),
                enabled: true,
            };

            await storage.setItem(toKey(handle), newUser);

            // Create user directories
            console.info('Creating data directories for', newUser.handle);
            await ensurePublicDirectoriesExist();
            const directories = getUserDirectories(newUser.handle);
            await checkForNewContent([directories], [CONTENT_TYPES.SETTINGS]);

            return { handle: newUser.handle };
        } catch (error) {
            console.error('User create failed:', error);
            set.status = 500;
        }
    })
    .post('/delete', async (context) => {
        const { set } = context;

        const body = (context.body ?? {}) as Record<string, unknown>;
        const ctxUser = context.user as UserContext | undefined;

        try {
            if (!requireAdmin(context)) {
                set.status = 403;
                return;
            }

            const handle = body.handle;
            if (typeof handle !== 'string' || handle.length === 0) {
                console.warn('Delete user failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            if (handle === ctxUser?.profile?.handle) {
                console.warn('Delete user failed: Cannot delete yourself');
                set.status = 400;
                return { error: 'Cannot delete yourself' };
            }

            if (handle === DEFAULT_USER.handle) {
                console.warn('Delete user failed: Cannot delete default user');
                set.status = 400;
                return {
                    error: 'Sorry, but the default user cannot be deleted. It is required as a fallback.',
                };
            }

            await storage.removeItem(toKey(handle));

            if (body.purge) {
                const directories = getUserDirectories(handle);
                console.info('Deleting data directories for', handle);
                await fsPromises.rm(directories.root, { recursive: true, force: true });
            }

            set.status = 204;
        } catch (error) {
            console.error('User delete failed:', error);
            set.status = 500;
        }
    })
    .post('/slugify', async (context) => {
        const { set } = context;

        const body = (context.body ?? {}) as Record<string, unknown>;

        try {
            if (!requireAdmin(context)) {
                set.status = 403;
                return;
            }

            const reqText = body.text;
            if (typeof reqText !== 'string' || reqText.length === 0) {
                console.warn('Slugify failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            const text = slugify(reqText);
            return text;
        } catch (error) {
            console.error('Slugify failed:', error);
            set.status = 500;
        }
    });
