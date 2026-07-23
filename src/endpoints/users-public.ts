import crypto from 'node:crypto';

import storage from 'node-persist';
import { Elysia } from 'elysia';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { getIpAddress, retryAfter } from '../express-common.js';
import { color, getConfigValue } from '../util.js';
import {
    KEY_PREFIX,
    getUserAvatar,
    toKey,
    getPasswordHash,
    getPasswordSalt,
    getAccountVersion,
} from '../users.js';

const DISCREET_LOGIN = getConfigValue('enableDiscreetLogin', false, 'boolean');
const PREFER_REAL_IP_HEADER = getConfigValue('rateLimiting.preferRealIpHeader', false, 'boolean');
const LOGIN_POINTS = getConfigValue('rateLimiting.accountsLoginMaxAttempts', 5, 'number');
const RECOVER_POINTS = getConfigValue('rateLimiting.accountsRecoverMaxAttempts', 5, 'number');
const generateRecoveryCode = () =>
    Array.from({ length: 6 }, () => crypto.randomInt(0, 10)).join('');

export const router = new Elysia({ prefix: '/api/users' });
const loginLimiter = new RateLimiterMemory({
    points: LOGIN_POINTS > 0 ? LOGIN_POINTS : Number.MAX_SAFE_INTEGER,
    duration: 60,
});
const recoverLimiter = new RateLimiterMemory({
    points: RECOVER_POINTS > 0 ? RECOVER_POINTS : Number.MAX_SAFE_INTEGER,
    duration: 300,
});

router.post('/list', async (context: Record<string, unknown>) => {
    const set = context.set as Record<string, unknown>;
    try {
        if (DISCREET_LOGIN) {
            (set.set as (code: number) => void)?.(204);
            return;
        }

        const users = await storage.values((x: { key: string }) => x.key.startsWith(KEY_PREFIX));

        const viewModelPromises = users
            .filter((x: { enabled: boolean }) => x.enabled)
            .map(
                (user: { handle: string; name: string; created: number; password: string }) =>
                    new Promise(async (resolve) => {
                        getUserAvatar(user.handle).then((avatar: string) =>
                            resolve({
                                handle: user.handle,
                                name: user.name,
                                created: user.created,
                                avatar: avatar,
                                password: !!user.password,
                            }),
                        );
                    }),
            );

        const viewModels = await Promise.all(viewModelPromises);
        return viewModels;
    } catch (error) {
        console.error('User list fetch error', error);
        (set.set as (code: number) => void)?.(500);
        return [];
    }
});

router.post('/login', async (context: Record<string, unknown>) => {
    const set = context.set as Record<string, unknown>;
    const body = context.body as Record<string, unknown>;

    try {
        const ip = getIpAddress(context, PREFER_REAL_IP_HEADER);
        const handle = body.handle as string;
        const password = body.password as string;
        const rememberMe = body.rememberMe as boolean | undefined;

        if (!handle || !password) {
            (set.set as (code: number) => void)?.(400);
            return { error: 'Missing handle or password' };
        }

        const rateLimit = await loginLimiter.get(ip);
        if (rateLimit !== null && rateLimit.consumedPoints > loginLimiter.points) {
            return retryAfter(
                set,
                new RateLimiterRes(rateLimit.consumedPoints, rateLimit.msBeforeNext),
            );
        }

        const user = await storage.getItem(toKey(handle));
        if (!user) {
            await loginLimiter.consume(ip);
            (set.set as (code: number) => void)?.(401);
            return { error: 'Invalid handle or password' };
        }

        const userRecord = user as Record<string, unknown>;
        if (!userRecord.enabled) {
            (set.set as (code: number) => void)?.(403);
            return { error: 'Account is disabled' };
        }

        const passwordHash = getPasswordHash(password, userRecord.salt as string);
        if (userRecord.password !== passwordHash) {
            await loginLimiter.consume(ip);
            (set.set as (code: number) => void)?.(401);
            return { error: 'Invalid handle or password' };
        }

        const accountVersion = getAccountVersion(userRecord);
        const token = crypto.randomBytes(64).toString('hex');
        const mfaToken = crypto.randomBytes(64).toString('hex');

        // Store session token
        const sessionKey = `session:${token}`;
        await storage.setItem(sessionKey, {
            handle: userRecord.handle,
            created: Date.now(),
            rememberMe: !!rememberMe,
            mfaToken: mfaToken,
            passwordVersion: accountVersion,
        });

        // Set session TTL
        const ttl = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
        (storage as any).setTTL(sessionKey, ttl);

        await loginLimiter.delete(ip);

        const avatar = await getUserAvatar(userRecord.handle as string);
        return {
            token,
            mfaToken,
            handle: userRecord.handle,
            name: userRecord.name,
            avatar: avatar,
            mfaConfigured: !!userRecord.mfaSecret,
            mfaRequired: !rememberMe,
            passwordVersion: accountVersion,
        };
    } catch (error) {
        if (error instanceof RateLimiterRes) {
            return retryAfter(set, error);
        }
        console.error('Login error', error);
        (set.set as (code: number) => void)?.(500);
        return { error: 'Internal server error' };
    }
});

router.post('/recover-step1', async (context: Record<string, unknown>) => {
    const set = context.set as Record<string, unknown>;
    const body = context.body as Record<string, unknown>;

    try {
        const ip = getIpAddress(context, PREFER_REAL_IP_HEADER);
        const handle = body.handle as string;

        if (!handle) {
            (set.set as (code: number) => void)?.(400);
            return { error: 'Missing handle' };
        }

        const rateLimit = await recoverLimiter.get(ip);
        if (rateLimit !== null && rateLimit.consumedPoints > recoverLimiter.points) {
            return retryAfter(
                set,
                new RateLimiterRes(rateLimit.consumedPoints, rateLimit.msBeforeNext),
            );
        }

        const user = await storage.getItem(toKey(handle));
        if (!user) {
            await recoverLimiter.consume(ip);
            (set.set as (code: number) => void)?.(404);
            return { error: 'User not found' };
        }

        const userRecord = user as Record<string, unknown>;
        if (!userRecord.enabled) {
            (set.set as (code: number) => void)?.(403);
            return { error: 'Account is disabled' };
        }

        const recoveryCode = generateRecoveryCode();
        const recoveryHash = crypto.createHash('sha256').update(recoveryCode).digest('hex');

        // Store recovery code
        const recoveryKey = `recovery:${handle}`;
        await storage.setItem(recoveryKey, {
            code: recoveryHash,
            created: Date.now(),
        });
        (storage as any).setTTL(recoveryKey, 10 * 60 * 1000); // 10 min TTL

        console.log(color.yellow(`Recovery code for ${handle}: ${recoveryCode}`));

        return { message: 'Recovery code generated. Check server console.' };
    } catch (error) {
        if (error instanceof RateLimiterRes) {
            return retryAfter(set, error);
        }
        console.error('Recovery step 1 error', error);
        (set.set as (code: number) => void)?.(500);
        return { error: 'Internal server error' };
    }
});

router.post('/recover-step2', async (context: Record<string, unknown>) => {
    const set = context.set as Record<string, unknown>;
    const body = context.body as Record<string, unknown>;

    try {
        const ip = getIpAddress(context, PREFER_REAL_IP_HEADER);
        const handle = body.handle as string;
        const code = body.code as string;
        const newPassword = body.newPassword as string;

        if (!handle || !code || !newPassword) {
            (set.set as (code: number) => void)?.(400);
            return { error: 'Missing handle, code, or new password' };
        }

        const rateLimit = await recoverLimiter.get(ip);
        if (rateLimit !== null && rateLimit.consumedPoints > recoverLimiter.points) {
            return retryAfter(
                set,
                new RateLimiterRes(rateLimit.consumedPoints, rateLimit.msBeforeNext),
            );
        }

        // Verify recovery code
        const recoveryKey = `recovery:${handle}`;
        const recoveryData = (await storage.getItem(recoveryKey)) as Record<string, unknown> | null;

        if (!recoveryData) {
            (set.set as (code: number) => void)?.(400);
            return { error: 'No recovery code found or expired' };
        }

        const codeHash = crypto.createHash('sha256').update(code).digest('hex');
        if (recoveryData.code !== codeHash) {
            await recoverLimiter.consume(ip);
            (set.set as (code: number) => void)?.(400);
            return { error: 'Invalid recovery code' };
        }

        // Update password
        const user = (await storage.getItem(toKey(handle))) as Record<string, unknown>;
        if (!user) {
            (set.set as (code: number) => void)?.(404);
            return { error: 'User not found' };
        }

        const salt = getPasswordSalt();
        const passwordHash = getPasswordHash(newPassword, salt);
        user.password = passwordHash;
        user.salt = salt;
        await storage.setItem(toKey(handle), user);

        // Clean up recovery code
        await storage.removeItem(recoveryKey);
        await recoverLimiter.delete(ip);

        return { message: 'Password updated successfully' };
    } catch (error) {
        if (error instanceof RateLimiterRes) {
            return retryAfter(set, error);
        }
        console.error('Recovery step 2 error', error);
        (set.set as (code: number) => void)?.(500);
        return { error: 'Internal server error' };
    }
});
