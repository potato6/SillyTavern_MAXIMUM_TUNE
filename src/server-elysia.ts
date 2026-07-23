/**
 * Pure Elysia server — Phase 7.
 *
 * Every Elysia router is mounted directly (no mountElysia bridge).
 * Streaming responses flow natively through Bun/Elysia's HTTP server.
 * Express remains only for the middleware adapter layer.
 */

import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { staticPlugin } from '@elysiajs/static';
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

import { serverDirectory } from './server-directory.js';
import { color, getVersion, getSeparator, removeColorFormatting, safeReadFileSync, setWindowTitle, getConfigValue, getHasIP, setupLogLevel, urlHostnameToIPv6 } from './util.js';
import { serverEvents, EVENT_NAMES } from './server.js';
import { UPLOADS_DIRECTORY } from './constants.js';
import { loadPlugins } from './plugin-loader.js';
import initRequestProxy from './request-proxy.js';
import initPrivateRequestFilter from './private-request-filter.js';

// ── Auth / user imports ───────────────────────────────────────────────────────

import {
    initUserStorage, ensurePublicDirectoriesExist, migrateUserData, migrateSystemPrompts,
    migratePublicOverrides, verifySecuritySettings, getUserDirectoriesList, cleanUploads,
    getCookieSecret, getCookieSessionName, getSessionCookieAge,
    setUserDataMiddleware, requireLoginMiddleware, shouldRedirectToLogin, loginPageMiddleware,
} from './users.js';

// ── Middleware imports (Express-based, adapted via Elysia hooks) ──────────────

import hostWhitelistMiddleware from './middleware/hostWhitelist.js';
import accessLoggerMiddleware, { getAccessLogPath, migrateAccessLog } from './middleware/accessLogWriter.js';
import basicAuthMiddleware from './middleware/basicAuth.js';
import getWhitelistMiddleware from './middleware/whitelist.js';
import corsProxyMiddleware from './middleware/corsProxy.js';
import getLibServeMiddleware from './middleware/lib-serve.js';
import userCssMiddleware from './middleware/userCss.js';
import cacheBuster from './middleware/cacheBuster.js';

// ── Elysia router imports ─────────────────────────────────────────────────────

import { router as userDataRouter } from './users.js';
import { router as usersPublicRouter } from './endpoints/users-public.js';
import { router as usersPrivateRouter } from './endpoints/users-private.js';
import { router as usersAdminRouter } from './endpoints/users-admin.js';
import { router as movingUIRouter } from './endpoints/moving-ui.js';
import { router as imagesRouter } from './endpoints/images.js';
import { router as quickRepliesRouter } from './endpoints/quick-replies.js';
import { router as avatarsRouter } from './endpoints/avatars.js';
import { router as themesRouter } from './endpoints/themes.js';
import { router as openAiRouter } from './endpoints/openai.js';
import { router as googleRouter } from './endpoints/google.js';
import { router as anthropicRouter } from './endpoints/anthropic.js';
import { router as tokenizersRouter } from './endpoints/tokenizers.js';
import { router as presetsRouter } from './endpoints/presets.js';
import { router as secretsRouter, migrateFlatSecrets } from './endpoints/secrets.js';
import { router as thumbnailRouter } from './endpoints/thumbnails.js';
import { router as novelAiRouter } from './endpoints/novelai.js';
import { router as extensionsRouter } from './endpoints/extensions.js';
import { router as assetsRouter } from './endpoints/assets.js';
import { router as filesRouter } from './endpoints/files.js';
import { router as charactersRouter, diskCache } from './endpoints/characters.js';
import { router as chatsRouter } from './endpoints/chats.js';
import { router as groupsRouter, migrateGroupChatsMetadataFormat } from './endpoints/groups.js';
import { router as worldInfoRouter } from './endpoints/worldinfo.js';
import { router as statsRouter, init as statsInit, onExit as statsOnExit } from './endpoints/stats.js';
import { router as contentManagerRouter, checkForNewContent } from './endpoints/content-manager.js';
import { router as settingsRouter, init as settingsInit } from './endpoints/settings.js';
import { router as backgroundsRouter } from './endpoints/backgrounds.js';
import { router as spritesRouter } from './endpoints/sprites.js';
import { router as stableDiffusionRouter } from './endpoints/stable-diffusion.js';
import { router as hordeRouter } from './endpoints/horde.js';
import { router as vectorsRouter } from './endpoints/vectors.js';
import { router as translateRouter } from './endpoints/translate.js';
import { router as searchRouter } from './endpoints/search.js';
import { router as openRouterRouter } from './endpoints/openrouter.js';
import { router as nanogptRouter } from './endpoints/nanogpt.js';
import { router as chatCompletionsRouter } from './endpoints/backends/chat-completions/index.js';
import { router as koboldRouter } from './endpoints/backends/kobold.js';
import { router as textCompletionsRouter } from './endpoints/backends/text-completions/index.js';
import { router as backendsKeysRouter } from './endpoints/backends/keys.js';
import { router as speechRouter } from './endpoints/speech.js';
import { router as azureRouter } from './endpoints/azure.js';
import { router as minimaxRouter } from './endpoints/minimax.js';
import { router as dataMaidRouter } from './endpoints/data-maid.js';
import { router as backupsRouter } from './endpoints/backups.js';
import { router as imageMetadataRouter } from './endpoints/image-metadata.js';
import { router as volcengineRouter } from './endpoints/volcengine.js';

// ── Session plugin (Elysia-native replacement for bun-session) ─────────────────

const encoder = new TextEncoder();

function signSession(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('base64url');
}

function unsafeDecodeSession(value: string): { data: Record<string, unknown> | null; sig: string } | null {
    const dot = value.indexOf('.');
    if (dot === -1) return null;
    return {
        data: (() => {
            try { return JSON.parse(Buffer.from(value.slice(0, dot), 'base64url').toString('utf8')); }
            catch { return null; }
        })(),
        sig: value.slice(dot + 1),
    };
}

function sessionPlugin(config: { name: string; maxAge: number; secret: string; httpOnly?: boolean; sameSite?: string }) {
    const { name, maxAge, secret } = config;
    return (app: any) => {
        // Track dirty state per-request on a WeakMap
        const dirtyMap = new WeakMap<object, boolean>();
        const markDirty = (target: any) => dirtyMap.set(target, true);

        return app
            .derive({ as: 'global' }, ({ cookie, set }: any) => {
                let session: Record<string, unknown> = {};
                const raw = cookie[name]?.value as string | undefined;
                if (raw) {
                    const decoded = unsafeDecodeSession(raw);
                    if (decoded?.data && typeof decoded.sig === 'string') {
                        const expected = signSession(raw.slice(0, raw.indexOf('.')), secret);
                        const sigBuf = encoder.encode(decoded.sig);
                        const expBuf = encoder.encode(expected);
                        if (sigBuf.byteLength === expBuf.byteLength && timingSafeEqual(sigBuf, expBuf)) {
                            session = decoded.data;
                        }
                    }
                }
                const proxy = new Proxy(session, {
                    set(t, p, v) { markDirty(t); return Reflect.set(t, p, v); },
                    deleteProperty(t, p) { markDirty(t); return Reflect.deleteProperty(t, p); },
                });
                return { session: proxy };
            })
            .onAfterHandle({ as: 'global' }, ({ cookie, session, set }: any) => {
                if (!session) return;
                const isDirty = dirtyMap.has(session);
                if (!isDirty && !session.touch) return;
                const plain: Record<string, unknown> = {};
                for (const k of Object.keys(session)) {
                    if (k !== 'touch') plain[k] = session[k];
                }
                if (Object.keys(plain).length === 0 && !session.touch) return;
                const payload = Buffer.from(JSON.stringify(plain), 'utf8').toString('base64url');
                const sig = signSession(payload, secret);
                const maxAgeSeconds = Math.floor(maxAge / 1000);
                cookie[name] = { value: `${payload}.${sig}`, path: '/', httpOnly: true, sameSite: 'lax', maxAge: maxAgeSeconds };
            });
    };
}

// ── App factory ────────────────────────────────────────────────────────────────

export function buildApp() {
    const cliArgs = globalThis.COMMAND_LINE_ARGS;
    const app = new Elysia();

    // ── Global error handler / 404 ──────────────────────────────────────────
    app.onError(({ code, error, set }) => {
        if (code === 'NOT_FOUND') {
            const notFound = safeReadFileSync(path.join(globalThis.DATA_ROOT, '_errors', 'url-not-found.html')) ?? '';
            set.status = 404;
            return new Response(notFound, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
    });

    // ── Security headers ────────────────────────────────────────────────────
    app.onBeforeHandle({ as: 'global' }, ({ set }) => {
        const h = set.headers as Record<string, string>;
        h['X-Content-Type-Options'] ??= 'nosniff';
        h['X-Frame-Options'] ??= 'DENY';
        h['X-XSS-Protection'] ??= '0';
        h['Referrer-Policy'] ??= 'strict-origin-when-cross-origin';
        h['Permissions-Policy'] ??= 'camera=(), microphone=(), geolocation=()';
    });

    // ── CORS ────────────────────────────────────────────────────────────────
    const corsEnabled = getConfigValue('cors.enabled', true, 'boolean' as any);
    if (corsEnabled) {
        const corsOrigin = String(getConfigValue('cors.origin', '*', 'string' as any) ?? '*');
        const corsMethods = getConfigValue('cors.methods', ['OPTIONS'] as any, 'object' as any) as string[];
        const corsAllowedHeaders = getConfigValue('cors.allowedHeaders', [] as any, 'object' as any) as string[];
        const corsExposedHeaders = getConfigValue('cors.exposedHeaders', [] as any, 'object' as any) as string[];
        const corsCredentials = getConfigValue('cors.credentials', false as any, 'boolean' as any) as boolean;
        const corsMaxAge = getConfigValue('cors.maxAge', null as any, 'number' as any) as number | null;
        const opts: any = { origin: corsOrigin, methods: corsMethods, credentials: corsCredentials };
        if (corsAllowedHeaders.length) opts.allowedHeaders = corsAllowedHeaders;
        if (corsExposedHeaders.length) opts.exposeHeaders = corsExposedHeaders;
        if (corsMaxAge !== null) opts.maxAge = corsMaxAge;
        app.use(cors(opts));
    }

    // ── Host whitelist ──────────────────────────────────────────────────────
    app.onBeforeHandle({ as: 'global' }, hostWhitelistMiddleware as any);

    // ── Basic auth ───────────────────────────────────────────────────────────
    if (cliArgs?.listen && cliArgs?.basicAuthMode) {
        app.onBeforeHandle({ as: 'global' }, basicAuthMiddleware as any);
    }

    // ── Access logger ────────────────────────────────────────────────────────
    if (cliArgs?.listen) {
        const logger = accessLoggerMiddleware();
        app.onBeforeHandle({ as: 'global' }, logger as any);
    }

    // ── Session ──────────────────────────────────────────────────────────────
    app.use(sessionPlugin({
        name: getCookieSessionName(),
        maxAge: getSessionCookieAge() ?? 400 * 24 * 60 * 60 * 1000,
        secret: getCookieSecret(globalThis.DATA_ROOT),
    }));

    // ── User data ────────────────────────────────────────────────────────────
    // Adapt setUserDataMiddleware (Express-based) to Elysia's derive
    app.derive({ as: 'global' }, async ({ session, request }: any) => {
        // Build an Express-compatible mock request for the middleware
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || request.headers.get('x-forwarded-host')
            || '127.0.0.1';
        const mockReq: Record<string, any> = {
            session,
            ip,
            headers: {},
            originalUrl: request.url,
            path: new URL(request.url).pathname,
            method: request.method,
        };
        // Copy headers from the Web Request
        request.headers.forEach((v: string, k: string) => { mockReq.headers[k] = v; });

        // Run the Express middleware inline
        // (It sets mockReq.user based on session data)
        try {
            await new Promise<void>((resolve, reject) => {
                setUserDataMiddleware(mockReq as any, null as any, (err?: any) => err ? reject(err) : resolve());
            });
        } catch (err) {
            console.error('setUserDataMiddleware error:', err);
        }

        return { user: mockReq.user ?? null };
    });

    // ── CSRF ──────────────────────────────────────────────────────────────────
    if (!cliArgs?.disableCsrf) {
        const CSRF_SECRET = process.env['CSRF_SECRET'] || randomBytes(64).toString('hex');
        app.get('/csrf-token', ({ request }: any) => {
            const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
                || request.headers.get('x-real-ip')
                || 'anonymous';
            return { token: Bun.CSRF.generate(CSRF_SECRET, { sessionId: ip, expiresIn: 86400000 } as any) };
        });
        app.guard({}, (g: any) => g.onBeforeHandle({ as: 'global' }, ({ request, set }: any) => {
            if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
            if (request.url?.includes('/proxy/')) return;
            const token = request.headers.get('x-csrf-token');
            const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
                || request.headers.get('x-real-ip')
                || 'anonymous';
            if (!token || !Bun.CSRF.verify(token, { secret: CSRF_SECRET, sessionId: ip } as any)) {
                set.status = 403;
                return { error: 'Invalid CSRF token. Please refresh the page and try again.' };
            }
        }));
    } else {
        console.warn('\nCSRF protection is disabled.\n');
        app.get('/csrf-token', () => ({ token: 'disabled' }));
    }

    // ── Static files ────────────────────────────────────────────────────────
    const libMiddleware = getLibServeMiddleware();
    app.use(libMiddleware as any);
    app.use(userCssMiddleware as any);
    app.use(staticPlugin({
        assets: path.join(serverDirectory, 'public/dist'),
        prefix: '/',
        alwaysStatic: true,
        indexHTML: false,
        staticLimit: 0,
    }));

    // ── Index + public routes ───────────────────────────────────────────────
    app.get('/', ({ request, set }: any) => {
        if (shouldRedirectToLogin(request)) {
            const q = request.url.split('?')[1];
            set.redirect = q ? `/login?${q}` : '/login';
            return;
        }
        return new Response(Bun.file(path.join(serverDirectory, 'public/dist', 'index.html')));
    });

    app.get('/callback{/:source}', ({ params, request, set }: any) => {
        const source = params?.source;
        const q = request.url?.split('?')[1];
        const sp = new URLSearchParams();
        if (source) sp.set('source', source);
        if (q) sp.set('query', q);
        set.redirect = `/?${sp.toString()}`;
        set.status = 307;
    });

    app.get('/login', loginPageMiddleware as any);

    // ── Public API (before auth gate) ───────────────────────────────────────
    app.use(usersPublicRouter as any);

    // ── Auth gate ────────────────────────────────────────────────────────────
    app.guard({}, (g: any) => g.onBeforeHandle({ as: 'global' }, ({ user, set }: any) => {
        if (!user) {
            set.status = 401;
            return { error: 'Not authenticated' };
        }
    }));

    // ── Ping, CORS proxy, multer ─────────────────────────────────────────────
    app.post('/api/ping', ({ request, session, set }: any) => {
        if (request.query?.extend && session) session.touch = Date.now();
        set.status = 204;
    });

    if (cliArgs?.enableCorsProxy) {
        // CORS proxy — mounted on /proxy
        // TODO: mount corsProxyMiddleware properly
    }

    // ── Version endpoint ─────────────────────────────────────────────────────
    app.get('/version', async () => {
        const v = await getVersion();
        return v;
    });

    // ── Mount all routers ────────────────────────────────────────────────────
    const routers = [
        userDataRouter, usersPrivateRouter, usersAdminRouter,
        movingUIRouter, imagesRouter, quickRepliesRouter, avatarsRouter,
        themesRouter, openAiRouter, googleRouter, anthropicRouter,
        tokenizersRouter, presetsRouter, secretsRouter, thumbnailRouter,
        novelAiRouter, extensionsRouter, assetsRouter, filesRouter,
        charactersRouter, chatsRouter, groupsRouter, worldInfoRouter,
        statsRouter, backgroundsRouter, spritesRouter, contentManagerRouter,
        settingsRouter, stableDiffusionRouter, hordeRouter, vectorsRouter,
        translateRouter, searchRouter, textCompletionsRouter, openRouterRouter,
        nanogptRouter, koboldRouter, chatCompletionsRouter, backendsKeysRouter,
        speechRouter, azureRouter, volcengineRouter, minimaxRouter,
        dataMaidRouter, backupsRouter, imageMetadataRouter,
    ];
    for (const r of routers) {
        app.use(r as any);
    }

    return app;
}

// ── Boot ─────────────────────────────────────────────────────────────────────

const cliArgs = globalThis.COMMAND_LINE_ARGS;

async function start() {
    await initUserStorage(globalThis.DATA_ROOT);
    ensurePublicDirectoriesExist();
    await migrateUserData();
    await migrateSystemPrompts();
    await migratePublicOverrides();
    verifySecuritySettings();

    const app = buildApp();
    const directories = await getUserDirectoriesList();
    await migrateGroupChatsMetadataFormat(directories);
    await checkForNewContent(directories);
    await diskCache.verify(directories);
    migrateFlatSecrets(directories);
    cleanUploads();
    migrateAccessLog();
    await settingsInit();
    await statsInit();

    const pluginsDirectory = path.join(serverDirectory, 'plugins');
    const cleanupPlugins = await loadPlugins(app as any, pluginsDirectory);

    // Elysia-native HTTP server — no Express, no bridge
    const listenUrl = cliArgs.getIPv4ListenUrl();
    const port = Number(listenUrl.port) || 8000;

    // Determine listen host
    let host: string | undefined;
    if (cliArgs.listen) {
        host = listenUrl.hostname;
    } else {
        const ipv6 = cliArgs.enableIPv6 !== false;
        host = ipv6 ? '::1' : '127.0.0.1';
    }

    const serverOptions: any = {
        port,
        hostname: host,
        reusePort: true,
    };

    // SSL
    if (cliArgs.ssl) {
        const certPath = cliArgs.certPath;
        const keyPath = cliArgs.keyPath;
        if (certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
            serverOptions.tls = {
                cert: fs.readFileSync(certPath),
                key: fs.readFileSync(keyPath),
                passphrase: cliArgs.keyPassphrase ?? '',
            };
        } else {
            console.error('SSL certificate or key not found. Starting without SSL.');
        }
    }

    const server = app.listen(serverOptions);

    process.on('SIGINT', async () => {
        await statsOnExit();
        if (typeof cleanupPlugins === 'function') await cleanupPlugins();
        diskCache.dispose();
        server.stop();
        process.exit();
    });
    process.on('SIGTERM', async () => {
        await statsOnExit();
        if (typeof cleanupPlugins === 'function') await cleanupPlugins();
        diskCache.dispose();
        server.stop();
        process.exit();
    });

    // Log startup
    const hostname = cliArgs.listen ? `0.0.0.0:${port}` : `localhost:${port}`;
    console.log(`\n${'='.repeat(hostname.length + 10)}`);
    console.log(`Go to: http://${hostname}/ to open SillyTavern`);
    console.log(`${'='.repeat(hostname.length + 10)}\n`);
    setupLogLevel();
    serverEvents.emit(EVENT_NAMES.SERVER_STARTED, { url: new URL(`http://${hostname}/`) });
}

start().catch((err: any) => { console.error('Startup failed:', err); process.exit(1); });
