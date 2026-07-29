import path from 'node:path';
import { promises as fsPromises, createWriteStream } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';

import storage from 'node-persist';
import { Elysia } from 'elysia';
import { ZipArchive } from 'archiver';

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

interface UserDirectories {
    root?: string;
    [key: string]: unknown;
}

interface UserProfile {
    handle?: string;
    name?: string;
    admin?: boolean;
    password?: string;
    salt?: string;
    created?: unknown;
    [key: string]: unknown;
}

interface UserSession {
    handle?: string | null;
    csrfToken?: string | null;
    version?: string | number | null;
    [key: string]: unknown;
}

interface UserContext {
    directories?: UserDirectories;
    profile?: UserProfile;
    [key: string]: unknown;
}

export const router = new Elysia({ prefix: '/api/users' })
    .post('/logout', (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const session = ctx.session as UserSession | undefined;

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
        const ctx = context as Record<string, unknown>;
        const user = ctx.user as UserContext | undefined;

        try {
            if (!user || !user.profile) {
                set.status = 403;
                return;
            }

            const profile = user.profile;
            const handle = profile.handle ?? '';

            return {
                handle,
                name: profile.name,
                avatar: await getUserAvatar(handle),
                admin: profile.admin,
                password: Boolean(profile.password),
                created: profile.created,
            };
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    })
    .post('/change-avatar', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const bodyAny = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;

        try {
            const handle = bodyAny?.handle;
            if (typeof handle !== 'string' || handle.length === 0) {
                console.warn('Change avatar failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            const profile = user?.profile;
            if (handle !== profile?.handle && !profile?.admin) {
                console.error('Change avatar failed: Unauthorized');
                set.status = 403;
                return { error: 'Unauthorized' };
            }

            const avatar = bodyAny?.avatar;
            if (
                typeof avatar !== 'string' ||
                (!avatar.startsWith('data:image/') && avatar !== '')
            ) {
                console.warn('Change avatar failed: Invalid data URL');
                set.status = 400;
                return { error: 'Invalid data URL' };
            }

            const userKey = toKey(handle);
            const existingUser = await storage.getItem(userKey);

            if (!existingUser) {
                console.error('Change avatar failed: User not found');
                set.status = 404;
                return { error: 'User not found' };
            }

            await storage.setItem(toAvatarKey(handle), avatar);
            set.status = 204;
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    })
    .post('/change-password', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const bodyAny = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const session = ctx.session as UserSession | undefined;

        try {
            const handle = bodyAny?.handle;
            if (typeof handle !== 'string' || handle.length === 0) {
                console.warn('Change password failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            const profile = user?.profile;
            if (handle !== profile?.handle && !profile?.admin) {
                console.error('Change password failed: Unauthorized');
                set.status = 403;
                return { error: 'Unauthorized' };
            }

            const userKey = toKey(handle);
            const existingUser = (await storage.getItem(userKey)) as Record<string, any> | null;

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

            const oldPassword = bodyAny?.oldPassword;
            if (
                !profile?.admin &&
                existingUser.password &&
                existingUser.password !==
                    getPasswordHash(
                        typeof oldPassword === 'string' ? oldPassword : '',
                        existingUser.salt,
                    )
            ) {
                console.error('Change password failed: Incorrect password');
                set.status = 403;
                return { error: 'Incorrect password' };
            }

            const newPassword = bodyAny?.newPassword;
            if (typeof newPassword === 'string' && newPassword.length > 0) {
                const salt = getPasswordSalt();
                existingUser.password = getPasswordHash(newPassword, salt);
                existingUser.salt = salt;
            } else {
                existingUser.password = '';
                existingUser.salt = '';
            }

            await storage.setItem(userKey, existingUser);

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
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const bodyAny = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;

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

            const handle = bodyAny?.handle;
            if (typeof handle !== 'string' || handle.length === 0) {
                console.warn('Backup failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            const profile = user?.profile;
            if (handle !== profile?.handle && !profile?.admin) {
                console.error('Backup failed: Unauthorized');
                set.status = 403;
                return { error: 'Unauthorized' };
            }

            const directories = getUserDirectories(handle);
            const timestamp = generateTimestamp();
            const archiveName = `${handle}-${timestamp}.zip`;
            const tempFilePath = path.join(os.tmpdir(), archiveName);

            const archive = new ZipArchive();
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
                    'Content-Disposition': `attachment; filename="${archiveName}"`,
                    'Content-Type': 'application/zip',
                },
            });
        } catch (error) {
            console.error('Backup failed', error);
            set.status = 500;
        }
    })
    .post('/reset-settings', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const bodyAny = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;

        try {
            const profile = user?.profile;
            const password = typeof bodyAny?.password === 'string' ? bodyAny.password : '';

            if (
                profile?.password &&
                profile.password !== getPasswordHash(password, profile.salt ?? '')
            ) {
                console.warn('Reset settings failed: Incorrect password');
                set.status = 403;
                return { error: 'Incorrect password' };
            }

            const directories = user?.directories;
            const rootDir = directories?.root ?? '';
            const pathToFile = path.join(rootDir, SETTINGS_FILE);
            await fsPromises.rm(pathToFile, { force: true });

            const userDirs = directories as import('../users.js').UserDirectoryList | undefined;
            await checkForNewContent(userDirs ? [userDirs] : [], [CONTENT_TYPES.SETTINGS]);

            set.status = 204;
        } catch (error) {
            console.error('Reset settings failed', error);
            set.status = 500;
        }
    })
    .post('/change-name', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const bodyAny = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;

        try {
            const name = bodyAny?.name;
            const handle = bodyAny?.handle;

            if (typeof name !== 'string' || typeof handle !== 'string' || !name || !handle) {
                console.warn('Change name failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            const profile = user?.profile;
            if (handle !== profile?.handle && !profile?.admin) {
                console.error('Change name failed: Unauthorized');
                set.status = 403;
                return { error: 'Unauthorized' };
            }

            const userKey = toKey(handle);
            const existingUser = (await storage.getItem(userKey)) as Record<string, any> | null;

            if (!existingUser) {
                console.warn('Change name failed: User not found');
                set.status = 404;
                return { error: 'User not found' };
            }

            existingUser.name = name;
            await storage.setItem(userKey, existingUser);

            set.status = 204;
        } catch (error) {
            console.error('Change name failed', error);
            set.status = 500;
        }
    })
    .post('/reset-step1', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const user = ctx.user as UserContext | undefined;
        const profile = user?.profile;

        try {
            const handle = profile?.handle ?? '';
            const resetCode = String(crypto.randomInt(1000, 9999));
            console.log();
            console.log(
                color.magenta(`${profile?.name ?? 'User'}, your account reset code is: `) +
                    color.red(resetCode),
            );
            console.log();

            RESET_CACHE.set(handle, resetCode);
            set.status = 204;
        } catch (error) {
            console.error('Recover step 1 failed:', error);
            set.status = 500;
        }
    })
    .post('/reset-step2', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const bodyAny = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const profile = user?.profile;

        try {
            const reqCode = bodyAny?.code;
            if (typeof reqCode !== 'string' || reqCode.length === 0) {
                console.warn('Recover step 2 failed: Missing required fields');
                set.status = 400;
                return { error: 'Missing required fields' };
            }

            const reqPassword = typeof bodyAny?.password === 'string' ? bodyAny.password : '';
            if (
                profile?.password &&
                profile.password !== getPasswordHash(reqPassword, profile.salt ?? '')
            ) {
                console.warn('Recover step 2 failed: Incorrect password');
                set.status = 400;
                return { error: 'Incorrect password' };
            }

            const handle = profile?.handle ?? '';
            const code = RESET_CACHE.get(handle);

            if (!code || code !== reqCode) {
                console.warn('Recover step 2 failed: Incorrect code');
                set.status = 400;
                return { error: 'Incorrect code' };
            }

            console.info('Resetting account data:', handle);

            const directories = user?.directories;
            const rootDir = directories?.root ?? '';
            await fsPromises.rm(rootDir, { recursive: true, force: true });

            await ensurePublicDirectoriesExist();

            const userDirs = directories as import('../users.js').UserDirectoryList | undefined;
            await checkForNewContent(userDirs ? [userDirs] : []);

            RESET_CACHE.remove(handle);
            set.status = 204;
        } catch (error) {
            console.error('Recover step 2 failed:', error);
            set.status = 500;
        }
    });
