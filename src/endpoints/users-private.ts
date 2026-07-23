import path from 'node:path';
import { promises as fsPromises, createWriteStream } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';

import storage from 'node-persist';
import { Elysia } from 'elysia';
import { Archiver } from 'archiver';

import {
    getUserAvatar,
    toKey,
    getPasswordHash,
    getPasswordSalt,
    ensurePublicDirectoriesExist,
    toAvatarKey,
    getAccountVersion,
    getUserDirectories,
} from '../users.js';
import { SETTINGS_FILE } from '../constants.js';
import { checkForNewContent, CONTENT_TYPES } from './content-manager.js';
import { color, Cache, getConfigValue, generateTimestamp } from '../util.js';

const RESET_CACHE = new Cache(5 * 60 * 1000);

export const router = new Elysia({ prefix: '/api/users' })
    .post('/logout', (context) => {
        const { set } = context;
        const session = (context as unknown as Record<string, unknown>).session as Record<
            string,
            unknown
        > | null;

        try {
            if (!session) {
                console.error('Session not available');
                set.status = 500;
                return;
            }

            session.handle = null;
            session.csrfToken = null;
            session.version = null;
            set.status = 204;
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    })
    .get('/me', async (context) => {
        const { set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;

        try {
            if (!user) {
                set.status = 403;
                return;
            }

            const profile = user.profile as Record<string, unknown>;
            const viewModel = {
                handle: profile.handle,
                name: profile.name,
                avatar: await getUserAvatar(profile.handle as string),
                admin: profile.admin,
                password: !!profile.password,
                created: profile.created,
            };

            return viewModel;
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    })
    .post('/change-avatar', async (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const bodyAny = body as Record<string, unknown> | null;

        try {
            if (!bodyAny?.handle) {
                console.warn('Change avatar failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            const profile = user?.profile as Record<string, unknown> | undefined;
            if (bodyAny.handle !== profile?.handle && !profile?.admin) {
                console.error('Change avatar failed: Unauthorized');
                set.status = 403;
                return { error: 'Unauthorized' };
            }

            // Avatar is not a data URL or not an empty string
            const avatar = bodyAny.avatar as string;
            if (!avatar.startsWith('data:image/') && avatar !== '') {
                console.warn('Change avatar failed: Invalid data URL');
                set.status = 400;
                return { error: 'Invalid data URL' };
            }

            /** @type {import('../users.js').User} */
            const existingUser = (await storage.getItem(toKey(bodyAny.handle as string))) as Record<
                string,
                unknown
            > | null;

            if (!existingUser) {
                console.error('Change avatar failed: User not found');
                set.status = 404;
                return { error: 'User not found' };
            }

            await storage.setItem(toAvatarKey(bodyAny.handle as string), avatar);
            set.status = 204;
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    })
    .post('/change-password', async (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const session = (context as unknown as Record<string, unknown>).session as Record<
            string,
            unknown
        > | null;
        const bodyAny = body as Record<string, unknown> | null;

        try {
            if (!bodyAny?.handle) {
                console.warn('Change password failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            const profile = user?.profile as Record<string, unknown> | undefined;
            if (bodyAny.handle !== profile?.handle && !profile?.admin) {
                console.error('Change password failed: Unauthorized');
                set.status = 403;
                return { error: 'Unauthorized' };
            }

            /** @type {import('../users.js').User} */
            const existingUser = (await storage.getItem(toKey(bodyAny.handle as string))) as Record<
                string,
                unknown
            > | null;

            if (!existingUser) {
                console.error('Change password failed: User not found');
                set.status = 404;
                return { error: 'User not found' };
            }

            if (!existingUser.enabled) {
                console.error('Change password failed: User is disabled');
                set.status = 403;
                return { error: 'User is disabled' };
            }

            if (
                !profile?.admin &&
                existingUser.password &&
                existingUser.password !==
                    getPasswordHash(bodyAny.oldPassword as string, existingUser.salt as string)
            ) {
                console.error('Change password failed: Incorrect password');
                set.status = 403;
                return { error: 'Incorrect password' };
            }

            if (bodyAny.newPassword) {
                const salt = getPasswordSalt();
                existingUser.password = getPasswordHash(bodyAny.newPassword as string, salt);
                existingUser.salt = salt;
            } else {
                existingUser.password = '';
                existingUser.salt = '';
            }

            await storage.setItem(toKey(bodyAny.handle as string), existingUser);

            // Update session version to keep the current session valid after password change
            if (session && session.handle === existingUser.handle) {
                session.version = getAccountVersion(existingUser as any);
            }

            set.status = 204;
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    })
    .post('/backup', async (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;

        try {
            const allowFullDataBackup = !!getConfigValue(
                'backups.allowFullDataBackup',
                true,
                'boolean' as const,
            );

            if (!allowFullDataBackup) {
                console.warn('Backup failed: Full data backup is disabled in configuration');
                set.status = 403;
                return { error: 'Full data backup is disabled' };
            }

            const bodyAny = body as Record<string, unknown> | null;
            const handle = bodyAny?.handle as string;

            if (!handle) {
                console.warn('Backup failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            const profile = user?.profile as Record<string, unknown> | undefined;
            if (handle !== profile?.handle && !profile?.admin) {
                console.error('Backup failed: Unauthorized');
                set.status = 403;
                return { error: 'Unauthorized' };
            }

            // Create the backup archive to a temporary file instead of piping to Express response
            const directories = getUserDirectories(handle);
            const timestamp = generateTimestamp();
            const tempFilePath = path.join(os.tmpdir(), `${handle}-${timestamp}.zip`);

            // @ts-expect-error FIXME: Archiver constructor overload mismatch
            const archive = new Archiver('zip');
            const output = createWriteStream(tempFilePath);

            await new Promise<void>((resolve, reject) => {
                output.on('close', resolve);
                output.on('error', reject);
                archive.on('error', reject);

                archive.pipe(output);

                archive.on('error', function (err: Error) {
                    console.error('Archive error:', err.message);
                });

                archive.glob('**/*', {
                    cwd: directories.root,
                    follow: false,
                    dot: true,
                });

                archive.finalize();
            });

            console.info('Archive wrote %d bytes', archive.pointer());

            return new Response(Bun.file(tempFilePath), {
                headers: {
                    'Content-Disposition': `attachment; filename="${path.basename(tempFilePath)}"`,
                    'Content-Type': 'application/zip',
                },
            });
        } catch (error) {
            console.error('Backup failed', error);
            set.status = 500;
        }
    })
    .post('/reset-settings', async (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const bodyAny = body as Record<string, unknown> | null;

        try {
            const profile = user?.profile as Record<string, unknown> | undefined;
            const password = bodyAny?.password as string;

            if (
                profile?.password &&
                profile.password !== getPasswordHash(password, profile.salt as string)
            ) {
                console.warn('Reset settings failed: Incorrect password');
                set.status = 403;
                return { error: 'Incorrect password' };
            }

            const directories = user?.directories as Record<string, string> | undefined;
            const pathToFile = path.join(directories?.root ?? '', SETTINGS_FILE);
            await fsPromises.rm(pathToFile, { force: true });

            const userDirs = user?.directories as
                | import('../users.js').UserDirectoryList
                | undefined;
            await checkForNewContent(userDirs ? [userDirs] : [], [CONTENT_TYPES.SETTINGS]);

            set.status = 204;
        } catch (error) {
            console.error('Reset settings failed', error);
            set.status = 500;
        }
    })
    .post('/change-name', async (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const bodyAny = body as Record<string, unknown> | null;

        try {
            if (!bodyAny?.name || !bodyAny?.handle) {
                console.warn('Change name failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            const profile = user?.profile as Record<string, unknown> | undefined;
            if (bodyAny.handle !== profile?.handle && !profile?.admin) {
                console.error('Change name failed: Unauthorized');
                set.status = 403;
                return { error: 'Unauthorized' };
            }

            /** @type {import('../users.js').User} */
            const existingUser = (await storage.getItem(toKey(bodyAny.handle as string))) as Record<
                string,
                unknown
            > | null;

            if (!existingUser) {
                console.warn('Change name failed: User not found');
                set.status = 404;
                return { error: 'User not found' };
            }

            existingUser.name = bodyAny.name;
            await storage.setItem(toKey(bodyAny.handle as string), existingUser);

            set.status = 204;
        } catch (error) {
            console.error('Change name failed', error);
            set.status = 500;
        }
    })
    .post('/reset-step1', async (context) => {
        const { set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const profile = user?.profile as Record<string, unknown> | undefined;

        try {
            const resetCode = String(crypto.randomInt(1000, 9999));
            console.log();
            console.log(
                color.magenta(
                    `${(profile?.name as string) ?? 'User'}, your account reset code is: `,
                ) + color.red(resetCode),
            );
            console.log();
            RESET_CACHE.set(profile?.handle as string, resetCode);
            set.status = 204;
        } catch (error) {
            console.error('Recover step 1 failed:', error);
            set.status = 500;
        }
    })
    .post('/reset-step2', async (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const profile = user?.profile as Record<string, unknown> | undefined;
        const bodyAny = body as Record<string, unknown> | null;

        try {
            if (!bodyAny?.code) {
                console.warn('Recover step 2 failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            if (
                profile?.password &&
                profile.password !==
                    getPasswordHash(bodyAny.password as string, profile.salt as string)
            ) {
                console.warn('Recover step 2 failed: Incorrect password');
                set.status = 400;
                return { error: 'Incorrect password' };
            }

            const code = RESET_CACHE.get(profile?.handle as string);

            if (!code || code !== bodyAny.code) {
                console.warn('Recover step 2 failed: Incorrect code');
                set.status = 400;
                return { error: 'Incorrect code' };
            }

            console.info('Resetting account data:', profile?.handle);

            const directories = user?.directories as Record<string, string> | undefined;
            await fsPromises.rm(directories?.root ?? '', { recursive: true, force: true });

            await ensurePublicDirectoriesExist();

            const userDirs = user?.directories as
                | import('../users.js').UserDirectoryList
                | undefined;
            await checkForNewContent(userDirs ? [userDirs] : []);

            RESET_CACHE.remove(profile?.handle as string);
            set.status = 204;
        } catch (error) {
            console.error('Recover step 2 failed:', error);
            set.status = 500;
        }
    });
