/**
 * Pure Elysia server — Phase 7.
 *
 * Every Elysia router is mounted directly (no mountElysia bridge).
 * Streaming responses flow natively through Bun/Elysia's HTTP server.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import EventEmitter from 'node:events';
import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { staticPlugin } from '@elysiajs/static';

import { serverDirectory } from './server-directory.js';
import { safeReadFileSync, getConfigValue, setupLogLevel, getVersion } from './util.js';
import { loadPlugins } from './plugin-loader.js';

import hostWhitelistMiddleware from './middleware/hostWhitelist.js';
import basicAuthMiddleware from './middleware/basicAuth.js';
import accessLoggerMiddleware, { migrateAccessLog } from './middleware/accessLogWriter.js';
import cacheBuster from './middleware/cacheBuster.js';

import {
    initUserStorage,
    ensurePublicDirectoriesExist,
    migrateUserData,
    migrateSystemPrompts,
    migratePublicOverrides,
    verifySecuritySettings,
    getUserDirectoriesList,
    cleanUploads,
    getCookieSecret,
    getCookieSessionName,
    getSessionCookieAge,
    setUserDataMiddleware,
    shouldRedirectToLogin,
    loginPageMiddleware,
    router as userDataRouter,
} from './users.js';
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
import {
    router as statsRouter,
    init as statsInit,
    onExit as statsOnExit,
} from './endpoints/stats.js';
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

// ── Server events (local copy, avoids importing from server.ts which boots Express) ──

export const serverEvents = new EventEmitter();
process.serverEvents = serverEvents;
export default serverEvents;

export const EVENT_NAMES = Object.freeze({
    SERVER_STARTED: 'server-started',
});

// ── Generic Express-to-Elysia middleware adapter ───────────────────────────────
// Wraps `(req, res, next) => void` middleware into an Elysia onBeforeHandle hook.
// Used for middleware that decides pass/fail and doesn't render responses inline.

function adaptMiddleware(mw: (req: any, res: any, next: any) => void) {
    return async ({ request, set, ...rest }: any) => {
        const url = new URL(request.url);
        const mockReq: any = {
            session: rest.session,
            headers: Object.fromEntries(request.headers),
            path: url.pathname,
            method: request.method,
            url: request.url,
            originalUrl: request.url,
            ip:
                request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                request.headers.get('x-real-ip') ||
                '127.0.0.1',
            query: Object.fromEntries(url.searchParams),
        };
        const mockRes: any = {
            status(code: number) {
                set.status = code;
                return this;
            },
            send() {},
            json() {},
            sendStatus(code: number) {
                set.status = code;
            },
            setHeader() {},
            getHeaders() {
                return {};
            },
            end() {},
        };
        return new Promise<void>((resolve, reject) => {
            mw(mockReq, mockRes, (err?: any) => (err ? reject(err) : resolve()));
        });
    };
}

// ── Session plugin ────────────────────────────────────────────────────────────

const encoder = new TextEncoder();

function signSession(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('base64url');
}

function unsafeDecodeSession(
    value: string,
): { data: Record<string, unknown> | null; sig: string } | null {
    const dot = value.indexOf('.');
    if (dot === -1) return null;
    return {
        data: (() => {
            try {
                return JSON.parse(Buffer.from(value.slice(0, dot), 'base64url').toString('utf8'));
            } catch {
                return null;
            }
        })(),
        sig: value.slice(dot + 1),
    };
}

function sessionPlugin(config: { name: string; maxAge: number; secret: string }) {
    const { name, maxAge, secret } = config;
    return (app: any) => {
        const dirtyMap = new WeakMap<object, boolean>();
        const markDirty = (target: any) => dirtyMap.set(target, true);

        return app
            .derive({ as: 'global' }, ({ cookie }: any) => {
                let session: Record<string, unknown> = {};
                const raw = cookie[name]?.value as string | undefined;
                if (raw) {
                    const decoded = unsafeDecodeSession(raw);
                    if (decoded?.data && typeof decoded.sig === 'string') {
                        const expected = signSession(raw.slice(0, raw.indexOf('.')), secret);
                        if (
                            timingSafeEqual(encoder.encode(decoded.sig), encoder.encode(expected))
                        ) {
                            session = decoded.data;
                        }
                    }
                }
                const proxy = new Proxy(session, {
                    set(t, p, v) {
                        markDirty(t);
                        return Reflect.set(t, p, v);
                    },
                    deleteProperty(t, p) {
                        markDirty(t);
                        return Reflect.deleteProperty(t, p);
                    },
                });
                return { session: proxy };
            })
            .onAfterHandle({ as: 'global' }, ({ cookie, session }: any) => {
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
                cookie[name] = {
                    value: `${payload}.${sig}`,
                    path: '/',
                    httpOnly: true,
                    sameSite: 'lax',
                    maxAge: maxAgeSeconds,
                };
            });
    };
}

// ── App factory ────────────────────────────────────────────────────────────────

export function buildApp() {
    const cliArgs = globalThis.COMMAND_LINE_ARGS;
    const app = new Elysia({ aot: false });

    // 404 handler
    app.onError(({ code, set }) => {
        if (code === 'NOT_FOUND') {
            const notFound =
                safeReadFileSync(
                    path.join(globalThis.DATA_ROOT, '_errors', 'url-not-found.html'),
                ) ?? '';
            set.status = 404;
            return new Response(notFound, {
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
        }
    });

    // Security headers
    app.onBeforeHandle({ as: 'global' }, ({ set }) => {
        const h = set.headers as Record<string, string>;
        h['X-Content-Type-Options'] ??= 'nosniff';
        h['X-Frame-Options'] ??= 'DENY';
        h['X-XSS-Protection'] ??= '0';
        h['Referrer-Policy'] ??= 'strict-origin-when-cross-origin';
        h['Permissions-Policy'] ??= 'camera=(), microphone=(), geolocation=()';
    });

    // CORS
    const corsEnabled = getConfigValue('cors.enabled', true, 'boolean' as any);
    if (corsEnabled) {
        const corsOrigin = String(getConfigValue('cors.origin', '*', 'string' as any) ?? '*');
        const corsMethods = getConfigValue(
            'cors.methods',
            ['OPTIONS'] as any,
            'object' as any,
        ) as string[];
        const corsAllowedHeaders = getConfigValue(
            'cors.allowedHeaders',
            [] as any,
            'object' as any,
        ) as string[];
        const corsExposedHeaders = getConfigValue(
            'cors.exposedHeaders',
            [] as any,
            'object' as any,
        ) as string[];
        const corsCredentials = getConfigValue(
            'cors.credentials',
            false as any,
            'boolean' as any,
        ) as boolean;
        const corsMaxAge = getConfigValue('cors.maxAge', null as any, 'number' as any) as
            | number
            | null;
        const opts: any = {
            origin: corsOrigin,
            methods: corsMethods,
            credentials: corsCredentials,
        };
        if (corsAllowedHeaders.length) opts.allowedHeaders = corsAllowedHeaders;
        if (corsExposedHeaders.length) opts.exposeHeaders = corsExposedHeaders;
        if (corsMaxAge !== null) opts.maxAge = corsMaxAge;
        app.use(cors(opts));
    }

    // Host whitelist
    app.onBeforeHandle({ as: 'global' }, adaptMiddleware(hostWhitelistMiddleware));

    // Basic auth
    if (cliArgs?.listen && cliArgs?.basicAuthMode) {
        app.onBeforeHandle({ as: 'global' }, adaptMiddleware(basicAuthMiddleware));
    }

    // Access logger
    if (cliArgs?.listen) {
        app.onBeforeHandle({ as: 'global' }, adaptMiddleware(accessLoggerMiddleware()));
    }

    // Response time
    app.onBeforeHandle({ as: 'global' }, ({ request }: any) => {
        (request as any).__startTime = performance.now();
    });
    app.onAfterHandle({ as: 'global' }, ({ request, set }: any) => {
        const start = (request as any).__startTime;
        if (start) {
            (set.headers as Record<string, string>)['X-Response-Time'] =
                `${(performance.now() - start).toFixed(3)}ms`;
        }
    });

    // Session
    app.use(
        sessionPlugin({
            name: getCookieSessionName(),
            maxAge: getSessionCookieAge() ?? 400 * 24 * 60 * 60 * 1000,
            secret: getCookieSecret(globalThis.DATA_ROOT),
        }),
    );

    // User data
    app.derive({ as: 'global' }, async ({ session, request }: any) => {
        const ip =
            request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            request.headers.get('x-real-ip') ||
            '127.0.0.1';
        const url = new URL(request.url);
        const mockReq: any = {
            session,
            ip,
            headers: Object.fromEntries(request.headers),
            path: url.pathname,
            method: request.method,
            originalUrl: request.url,
        };
        await new Promise<void>((resolve, reject) => {
            setUserDataMiddleware(mockReq, null as any, (err?: any) =>
                err ? reject(err) : resolve(),
            );
        });
        return { user: mockReq.user ?? null };
    });

    // CSRF
    if (!cliArgs?.disableCsrf) {
        const CSRF_SECRET = process.env['CSRF_SECRET'] || randomBytes(64).toString('hex');
        app.get('/csrf-token', ({ request }: any) => {
            const ip =
                request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                request.headers.get('x-real-ip') ||
                'anonymous';
            return {
                token: Bun.CSRF.generate(CSRF_SECRET, {
                    sessionId: ip,
                    expiresIn: 86400000,
                } as any),
            };
        });
        app.onBeforeHandle({ as: 'global' }, ({ request, set }: any) => {
            if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
            if (request.url?.includes('/proxy/')) return;
            const token = request.headers.get('x-csrf-token');
            const ip =
                request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                request.headers.get('x-real-ip') ||
                'anonymous';
            if (!token || !Bun.CSRF.verify(token, { secret: CSRF_SECRET, sessionId: ip } as any)) {
                set.status = 403;
                return { error: 'Invalid CSRF token. Please refresh the page and try again.' };
            }
        });
    } else {
        console.warn('\nCSRF protection is disabled.\n');
        app.get('/csrf-token', () => ({ token: 'disabled' }));
    }

    // User CSS
    app.get('/css/user.css', async ({ set }: any) => {
        const userCssPath = path.resolve(path.join(globalThis.DATA_ROOT, '_css', 'user.css'));
        if (fs.existsSync(userCssPath))
            return new Response(Bun.file(userCssPath), {
                headers: { 'Content-Type': 'text/css; charset=utf-8' },
            });
        set.status = 404;
    });

    // Lib file serving (replaces Express webpack-dev-middleware)
    app.get('/lib.js', async ({ set }: any) => {
        const appVersion = await getVersion();
        const webpackRoot = path.resolve(globalThis.DATA_ROOT || process.cwd(), '_bun');
        const cacheSeed = JSON.stringify([appVersion.pkgVersion, appVersion.gitRevision, 'bun']);
        const cacheVersion = Bun.hash(cacheSeed).toString(16);
        const outputPath = path.join(webpackRoot, cacheVersion, 'output');
        const filePath = path.join(outputPath, 'lib.js');
        if (fs.existsSync(filePath)) {
            return new Response(Bun.file(filePath), {
                headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
            });
        }
        set.status = 404;
    });

    // Static files — @elysiajs/static handles Content-Type automatically
    app.use(
        staticPlugin({
            assets: path.join(serverDirectory, 'public/dist'),
            prefix: '/',
            indexHTML: false,
            alwaysStatic: true,
        }),
    );

    // Route handlers
    app.get('/', async ({ request, set, user }: any) => {
        // Cache busting — set Clear-Site-Data before any response
        const bustCache = cacheBuster.getClearSiteDataValue(
            user,
            request.headers.get('user-agent') || '',
        );

        if (shouldRedirectToLogin(request)) {
            const q = request.url.split('?')[1];
            set.redirect = q ? `/login?${q}` : '/login';
            set.status = 302;
            return;
        }

        const headers: Record<string, string> = { 'Content-Type': 'text/html; charset=utf-8' };
        if (bustCache) {
            headers['Clear-Site-Data'] = bustCache;
        }

        const indexHtml = await fs.promises.readFile(
            path.join(serverDirectory, 'public/dist', 'index.html'),
            'utf-8',
        );
        return new Response(indexHtml, { headers });
    });

    app.get('/callback{/:source}', ({ params, request, set }: any) => {
        const q = request.url?.split('?')[1];
        const sp = new URLSearchParams();
        if (params?.source) sp.set('source', params.source);
        if (q) sp.set('query', q);
        set.redirect = `/?${sp.toString()}`;
        set.status = 307;
    });

    app.get('/login', adaptMiddleware(loginPageMiddleware as any));

    // Public API
    app.use(usersPublicRouter as any);

    // Auth gate
    app.guard({}, (g: any) =>
        g.onBeforeHandle({ as: 'global' }, ({ user, set }: any) => {
            if (!user) {
                set.status = 401;
                return { error: 'Not authenticated' };
            }
        }),
    );

    // Ping
    app.post('/api/ping', ({ request, session, set }: any) => {
        if (request.query?.extend && session) session.touch = Date.now();
        set.status = 204;
    });

    // Version
    app.get('/version', async () => {
        const v = await getVersion();
        return v;
    });

    // Mount all routers
    const routers = [
        userDataRouter,
        usersPrivateRouter,
        usersAdminRouter,
        movingUIRouter,
        imagesRouter,
        quickRepliesRouter,
        avatarsRouter,
        themesRouter,
        openAiRouter,
        googleRouter,
        anthropicRouter,
        tokenizersRouter,
        presetsRouter,
        secretsRouter,
        thumbnailRouter,
        novelAiRouter,
        extensionsRouter,
        assetsRouter,
        filesRouter,
        charactersRouter,
        chatsRouter,
        groupsRouter,
        worldInfoRouter,
        statsRouter,
        backgroundsRouter,
        spritesRouter,
        contentManagerRouter,
        settingsRouter,
        stableDiffusionRouter,
        hordeRouter,
        vectorsRouter,
        translateRouter,
        searchRouter,
        textCompletionsRouter,
        openRouterRouter,
        nanogptRouter,
        koboldRouter,
        chatCompletionsRouter,
        backendsKeysRouter,
        speechRouter,
        azureRouter,
        volcengineRouter,
        minimaxRouter,
        dataMaidRouter,
        backupsRouter,
        imageMetadataRouter,
    ];
    for (const r of routers) app.use(r as any);

    return app;
}

// ── Boot ─────────────────────────────────────────────────────────────────────

const cliArgs = globalThis.COMMAND_LINE_ARGS;

async function buildLibBundle() {
    console.log();
    console.log('Compiling frontend libraries with Bun...');
    const appVersion = await getVersion();
    const webpackRoot = path.resolve(globalThis.DATA_ROOT || process.cwd(), '_bun');
    const cacheSeed = JSON.stringify([appVersion.pkgVersion, appVersion.gitRevision, 'bun']);
    const cacheVersion = Bun.hash(cacheSeed).toString(16);
    const outdir = path.join(webpackRoot, cacheVersion, 'output');
    const result = await Bun.build({
        entrypoints: ['./public/lib.js'],
        outdir,
        format: 'esm',
    });
    if (!result.success) {
        console.error('Build failed');
        for (const message of result.logs) console.error(message);
        throw new Error('Frontend build failed');
    }
    console.log(`Successfully built to ${outdir}`);
    console.log();
}

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
    await buildLibBundle();

    const pluginsDirectory = path.join(serverDirectory, 'plugins');
    const cleanupPlugins = await loadPlugins(app as any, pluginsDirectory);

    const listenUrl = cliArgs.getIPv4ListenUrl();
    const port = Number(listenUrl.port) || 8000;
    const host = cliArgs.listen
        ? listenUrl.hostname
        : cliArgs.enableIPv6 !== false
          ? '::1'
          : '127.0.0.1';

    const serverOptions: any = { port, hostname: host, reusePort: true };

    if (cliArgs.ssl && cliArgs.certPath && cliArgs.keyPath) {
        if (fs.existsSync(cliArgs.certPath) && fs.existsSync(cliArgs.keyPath)) {
            serverOptions.tls = {
                cert: fs.readFileSync(cliArgs.certPath),
                key: fs.readFileSync(cliArgs.keyPath),
                passphrase: cliArgs.keyPassphrase ?? '',
            };
        } else {
            console.error('SSL cert/key not found. Starting without SSL.');
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

    const hostname = cliArgs.listen ? `0.0.0.0:${port}` : `localhost:${port}`;
    console.log(`\n${'='.repeat(hostname.length + 10)}`);
    console.log(`Go to: http://${hostname}/ to open SillyTavern`);
    console.log(`${'='.repeat(hostname.length + 10)}\n`);
    setupLogLevel();
    serverEvents.emit(EVENT_NAMES.SERVER_STARTED, { url: new URL(`http://${hostname}/`) });
}

start().catch((err: any) => {
    console.error('Startup failed:', err);
    process.exit(1);
});
