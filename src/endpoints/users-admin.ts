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
function slugify(text: string) {
    return deburr(
        String(text ?? '')
            .toLowerCase()
            .trim(),
    )
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function requireAdmin(context: Record<string, unknown>): boolean {
    const user = (context as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
    > | null;
    if (!user) return false;
    const profile = user.profile as Record<string, unknown> | null;
    return !!profile?.admin;
}

export const router = new Elysia({ prefix: '/api/users' })
    .post('/get', async (context) => {
        const { set } = context;
        try {
            if (!requireAdmin(context)) {
                set.status = 403;
                return;
            }

            /** @type {import('../users.js').User[]} */
            const users = await storage.values((x: { key: string }) =>
                x.key.startsWith(KEY_PREFIX),
            );

            /** @type {Promise<import('../users.js').UserViewModel>[]} */
            const viewModelPromises = users.map(
                (user: {
                    handle: string;
                    name: string;
                    admin: boolean;
                    enabled: boolean;
                    created: number;
                    password: string;
                }) =>
                    new Promise((resolve) => {
                        getUserAvatar(user.handle).then((avatar: string) =>
                            resolve({
                                handle: user.handle,
                                name: user.name,
                                avatar: avatar,
                                admin: user.admin,
                                enabled: user.enabled,
                                created: user.created,
                                password: !!user.password,
                            }),
                        );
                    }),
            );

            const viewModels = await Promise.all(viewModelPromises);
            // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
            viewModels.sort(
                (x: { created: number }, y: { created: number }) =>
                    (x.created ?? 0) - (y.created ?? 0),
            );
            return viewModels;
        } catch (error) {
            console.error('User list failed:', error);
            return new Response(null, { status: 500 });
        }
    })
    .post('/disable', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const ctxUser = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        try {
            if (!requireAdmin(context)) {
                set.status = 403;
                return;
            }

            if (!body.handle) {
                console.warn('Disable user failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            if (body.handle === (ctxUser?.profile as Record<string, unknown> | undefined)?.handle) {
                console.warn('Disable user failed: Cannot disable yourself');
                set.status = 400;
                return { error: 'Cannot disable yourself' };
            }

            /** @type {import('../users.js').User} */
            const user = await storage.getItem(toKey(body.handle as string));

            if (!user) {
                console.error('Disable user failed: User not found');
                set.status = 404;
                return { error: 'User not found' };
            }

            (user as Record<string, unknown>).enabled = false;
            await storage.setItem(toKey(body.handle as string), user);
            set.status = 204;
        } catch (error) {
            console.error('User disable failed:', error);
            return new Response(null, { status: 500 });
        }
    })
    .post('/enable', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        try {
            if (!requireAdmin(context)) {
                set.status = 403;
                return;
            }

            if (!body.handle) {
                console.warn('Enable user failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            /** @type {import('../users.js').User} */
            const user = await storage.getItem(toKey(body.handle as string));

            if (!user) {
                console.error('Enable user failed: User not found');
                set.status = 404;
                return { error: 'User not found' };
            }

            (user as Record<string, unknown>).enabled = true;
            await storage.setItem(toKey(body.handle as string), user);
            set.status = 204;
        } catch (error) {
            console.error('User enable failed:', error);
            return new Response(null, { status: 500 });
        }
    })
    .post('/promote', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        try {
            if (!requireAdmin(context)) {
                set.status = 403;
                return;
            }

            if (!body.handle) {
                console.warn('Promote user failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            /** @type {import('../users.js').User} */
            const user = await storage.getItem(toKey(body.handle as string));

            if (!user) {
                console.error('Promote user failed: User not found');
                set.status = 404;
                return { error: 'User not found' };
            }

            (user as Record<string, unknown>).admin = true;
            await storage.setItem(toKey(body.handle as string), user);
            set.status = 204;
        } catch (error) {
            console.error('User promote failed:', error);
            return new Response(null, { status: 500 });
        }
    })
    .post('/demote', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const ctxUser = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        try {
            if (!requireAdmin(context)) {
                set.status = 403;
                return;
            }

            if (!body.handle) {
                console.warn('Demote user failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            if (body.handle === (ctxUser?.profile as Record<string, unknown> | undefined)?.handle) {
                console.warn('Demote user failed: Cannot demote yourself');
                set.status = 400;
                return { error: 'Cannot demote yourself' };
            }

            /** @type {import('../users.js').User} */
            const user = await storage.getItem(toKey(body.handle as string));

            if (!user) {
                console.error('Demote user failed: User not found');
                set.status = 404;
                return { error: 'User not found' };
            }

            (user as Record<string, unknown>).admin = false;
            await storage.setItem(toKey(body.handle as string), user);
            set.status = 204;
        } catch (error) {
            console.error('User demote failed:', error);
            return new Response(null, { status: 500 });
        }
    })
    .post('/create', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        try {
            if (!requireAdmin(context)) {
                set.status = 403;
                return;
            }

            if (!body.handle || !body.name) {
                console.warn('Create user failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            const handles = await getAllUserHandles();
            const handle = slugify(body.handle as string);

            if (!handle) {
                console.warn('Create user failed: Invalid handle');
                set.status = 400;
                return { error: 'Invalid handle' };
            }

            if (handles.some((x) => x === handle)) {
                console.warn('Create user failed: User with that handle already exists');
                set.status = 409;
                return { error: 'User already exists' };
            }

            const salt = getPasswordSalt();
            const password = body.password ? getPasswordHash(body.password as string, salt) : '';

            const newUser = {
                handle: handle,
                name: body.name || 'Anonymous',
                created: Date.now(),
                password: password,
                salt: salt,
                admin: !!body.admin,
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
            return new Response(null, { status: 500 });
        }
    })
    .post('/delete', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const ctxUser = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        try {
            if (!requireAdmin(context)) {
                set.status = 403;
                return;
            }

            if (!body.handle) {
                console.warn('Delete user failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            if (body.handle === (ctxUser?.profile as Record<string, unknown> | undefined)?.handle) {
                console.warn('Delete user failed: Cannot delete yourself');
                set.status = 400;
                return { error: 'Cannot delete yourself' };
            }

            if (body.handle === DEFAULT_USER.handle) {
                console.warn('Delete user failed: Cannot delete default user');
                set.status = 400;
                return {
                    error: 'Sorry, but the default user cannot be deleted. It is required as a fallback.',
                };
            }

            await storage.removeItem(toKey(body.handle as string));

            if (body.purge) {
                const directories = getUserDirectories(body.handle as string);
                console.info('Deleting data directories for', body.handle);
                await fsPromises.rm(directories.root, { recursive: true, force: true });
            }

            set.status = 204;
        } catch (error) {
            console.error('User delete failed:', error);
            return new Response(null, { status: 500 });
        }
    })
    .post('/slugify', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        try {
            if (!requireAdmin(context)) {
                set.status = 403;
                return;
            }

            if (!body.text) {
                console.warn('Slugify failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            const text = slugify(body.text as string);

            return new Response(text);
        } catch (error) {
            console.error('Slugify failed:', error);
            return new Response(null, { status: 500 });
        }
    });
