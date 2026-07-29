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

function generateRecoveryCode(): string {
    return String(crypto.randomInt(100000, 1000000));
}

export const router = new Elysia({ prefix: '/api/users' });

const loginLimiter = new RateLimiterMemory({
    points: LOGIN_POINTS > 0 ? LOGIN_POINTS : Number.MAX_SAFE_INTEGER,
    duration: 60,
});

const recoverLimiter = new RateLimiterMemory({
    points: RECOVER_POINTS > 0 ? RECOVER_POINTS : Number.MAX_SAFE_INTEGER,
    duration: 300,
});

router.post('/list', async (context) => {
    const { set } = context;
    try {
        if (DISCREET_LOGIN) {
            set.status = 204;
            return;
        }

        const rawUsers = await storage.values((x: { key: string }) => x.key.startsWith(KEY_PREFIX));

        const enabledUsers: any[] = [];
        for (let i = 0; i < rawUsers.length; i++) {
            if (rawUsers[i] && rawUsers[i].enabled) {
                enabledUsers.push(rawUsers[i]);
            }
        }

        const promises: Array<Promise<unknown>> = [];

        for (let i = 0; i < enabledUsers.length; i++) {
            const user = enabledUsers[i];
            const handle = user.handle;
            promises.push(
                getUserAvatar(handle).then((avatar) => ({
                    handle,
                    name: user.name,
                    created: user.created,
                    avatar,
                    password: Boolean(user.password),
                })),
            );
        }

        const viewModels = await Promise.all(promises);
        return viewModels;
    } catch (error) {
        console.error('User list fetch error', error);
        set.status = 500;
        return [];
    }
});

router.post('/login', async (context) => {
    const { set } = context;

    const body = (context.body ?? {}) as Record<string, unknown>;

    try {
        const ip = getIpAddress(context as any, PREFER_REAL_IP_HEADER);
        const handle = body.handle;
        const password = body.password;
        const rememberMe = Boolean(body.rememberMe);

        if (typeof handle !== 'string' || typeof password !== 'string' || !handle || !password) {
            set.status = 400;
            return { error: 'Missing handle or password' };
        }

        const rateLimit = await loginLimiter.get(ip);
        if (rateLimit !== null && rateLimit.consumedPoints > loginLimiter.points) {
            return retryAfter(
                set,
                new RateLimiterRes(rateLimit.consumedPoints, rateLimit.msBeforeNext),
            );
        }

        const userKey = toKey(handle);
        const user = (await storage.getItem(userKey)) as Record<string, any> | null;

        if (!user) {
            await loginLimiter.consume(ip);
            set.status = 401;
            return { error: 'Invalid handle or password' };
        }

        if (!user.enabled) {
            set.status = 403;
            return { error: 'Account is disabled' };
        }

        const salt = user.salt ?? '';
        const passwordHash = getPasswordHash(password, salt);
        if (user.password !== passwordHash) {
            await loginLimiter.consume(ip);
            set.status = 401;
            return { error: 'Invalid handle or password' };
        }

        const accountVersion = getAccountVersion(user as any);
        const token = crypto.randomBytes(32).toString('hex');
        const mfaToken = crypto.randomBytes(32).toString('hex');

        const userHandle = user.handle as string;
        const sessionKey = `session:${token}`;

        await storage.setItem(sessionKey, {
            handle: userHandle,
            created: Date.now(),
            rememberMe,
            mfaToken,
            passwordVersion: accountVersion,
        });

        const ttl = rememberMe ? 2592000000 : 86400000;
        (storage as any).setTTL(sessionKey, ttl);

        await loginLimiter.delete(ip);

        const avatar = await getUserAvatar(userHandle);

        return {
            token,
            mfaToken,
            handle: userHandle,
            name: user.name,
            avatar,
            mfaConfigured: Boolean(user.mfaSecret),
            mfaRequired: !rememberMe,
            passwordVersion: accountVersion,
        };
    } catch (error) {
        if (error instanceof RateLimiterRes) {
            return retryAfter(set, error);
        }
        console.error('Login error', error);
        set.status = 500;
        return { error: 'Internal server error' };
    }
});

router.post('/recover-step1', async (context) => {
    const { set } = context;

    const body = (context.body ?? {}) as Record<string, unknown>;

    try {
        const ip = getIpAddress(context as any, PREFER_REAL_IP_HEADER);
        const handle = body.handle;

        if (typeof handle !== 'string' || handle.length === 0) {
            set.status = 400;
            return { error: 'Missing handle' };
        }

        const rateLimit = await recoverLimiter.get(ip);
        if (rateLimit !== null && rateLimit.consumedPoints > recoverLimiter.points) {
            return retryAfter(
                set,
                new RateLimiterRes(rateLimit.consumedPoints, rateLimit.msBeforeNext),
            );
        }

        const userKey = toKey(handle);
        const user = (await storage.getItem(userKey)) as Record<string, any> | null;

        if (!user) {
            await recoverLimiter.consume(ip);
            set.status = 404;
            return { error: 'User not found' };
        }

        if (!user.enabled) {
            set.status = 403;
            return { error: 'Account is disabled' };
        }

        const recoveryCode = generateRecoveryCode();
        const recoveryHash = crypto.createHash('sha256').update(recoveryCode).digest('hex');

        const recoveryKey = `recovery:${handle}`;
        await storage.setItem(recoveryKey, {
            code: recoveryHash,
            created: Date.now(),
        });
        (storage as any).setTTL(recoveryKey, 600000);

        console.log(color.yellow(`Recovery code for ${handle}: ${recoveryCode}`));

        return { message: 'Recovery code generated. Check server console.' };
    } catch (error) {
        if (error instanceof RateLimiterRes) {
            return retryAfter(set, error);
        }
        console.error('Recovery step 1 error', error);
        set.status = 500;
        return { error: 'Internal server error' };
    }
});

router.post('/recover-step2', async (context) => {
    const { set } = context;

    const body = (context.body ?? {}) as Record<string, unknown>;

    try {
        const ip = getIpAddress(context as any, PREFER_REAL_IP_HEADER);
        const handle = body.handle;
        const code = body.code;
        const newPassword = body.newPassword;

        if (
            typeof handle !== 'string' ||
            typeof code !== 'string' ||
            typeof newPassword !== 'string' ||
            !handle ||
            !code ||
            !newPassword
        ) {
            set.status = 400;
            return { error: 'Missing handle, code, or new password' };
        }

        const rateLimit = await recoverLimiter.get(ip);
        if (rateLimit !== null && rateLimit.consumedPoints > recoverLimiter.points) {
            return retryAfter(
                set,
                new RateLimiterRes(rateLimit.consumedPoints, rateLimit.msBeforeNext),
            );
        }

        const recoveryKey = `recovery:${handle}`;
        const recoveryData = (await storage.getItem(recoveryKey)) as Record<string, any> | null;

        if (!recoveryData) {
            set.status = 400;
            return { error: 'No recovery code found or expired' };
        }

        const codeHash = crypto.createHash('sha256').update(code).digest('hex');
        if (recoveryData.code !== codeHash) {
            await recoverLimiter.consume(ip);
            set.status = 400;
            return { error: 'Invalid recovery code' };
        }

        const userKey = toKey(handle);
        const user = (await storage.getItem(userKey)) as Record<string, any> | null;
        if (!user) {
            set.status = 404;
            return { error: 'User not found' };
        }

        const salt = getPasswordSalt();
        const passwordHash = getPasswordHash(newPassword, salt);
        user.password = passwordHash;
        user.salt = salt;
        await storage.setItem(userKey, user);

        await storage.removeItem(recoveryKey);
        await recoverLimiter.delete(ip);

        return { message: 'Password updated successfully' };
    } catch (error) {
        if (error instanceof RateLimiterRes) {
            return retryAfter(set, error);
        }
        console.error('Recovery step 2 error', error);
        set.status = 500;
        return { error: 'Internal server error' };
    }
});
