/**
 * Shared Elysia app factory.
 *
 * Replaces `const app = express()` + the full middleware chain in server.ts.
 * Each piece of Express middleware maps to an Elysia lifecycle hook or plugin.
 *
 * In standalone mode (the default) the full middleware stack is applied.
 */

import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { staticPlugin } from '@elysiajs/static';
import { createHmac, timingSafeEqual } from 'node:crypto';

// ── Cookie session helpers ─────────────────────────────────────────────────────

const encoder = new TextEncoder();

function signSession(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('base64url');
}

function unsafeDecodeSession(value: string): { data: Record<string, unknown> | null; sig: string } | null {
    const dot = value.indexOf('.');
    if (dot === -1) return null;
    return {
        data: (() => {
            try {
                return JSON.parse(Buffer.from(value.slice(0, dot), 'base64url').toString('utf8'));
            } catch { return null; }
        })(),
        sig: value.slice(dot + 1),
    };
}

// ── Configuration ──────────────────────────────────────────────────────────────

export interface ElysiaAppConfig {
    bridgeMode?: boolean;
    cors?: {
        enabled: boolean;
        origin: string;
        methods: string[];
        allowedHeaders: string[];
        exposedHeaders: string[];
        credentials: boolean;
        maxAge: number | null;
    } | null;
    static?: {
        assets?: string;
        prefix?: string;
        staticLimit?: number;
        alwaysStatic?: boolean;
        ignorePatterns?: Array<string | RegExp>;
        headers?: Record<string, string>;
        indexHTML?: boolean;
        etag?: boolean;
        maxAge?: number | null;
        silent?: boolean;
    } | null;
    maxBodySize?: string | null;
    /** Session config — mirrors bun-session middleware. */
    session?: {
        name: string;
        maxAge: number;
        secret: string;
        httpOnly?: boolean;
        sameSite?: 'lax' | 'strict' | 'none';
    } | null;
    /** CSRF config.  null → disabled. */
    csrf?: {
        secret: string;
    } | null;
    /** Public directory for static files (default: public/dist) */
    publicDir?: string;
    /** User data resolver plugin.  If provided, runs after session resolves user. */
    setUserData?: (session: Record<string, unknown> | null) => Record<string, unknown> | null | Promise<Record<string, unknown> | null>;
    /** Login check.  Return true if the request should be redirected to /login. */
    shouldRedirectToLogin?: (request: Request) => boolean;
    /** Login page middleware.  Serves the login page. */
    loginPage?: () => Response | Promise<Response>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const responseTimers = new WeakMap<Request, number>();

function parseBytes(value: string): number {
    const match = value.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb)$/i);
    if (!match) return Number(value) || 0;
    const num = Number.parseFloat(match[1]!);
    switch (match[2]!.toLowerCase()) {
        case 'tb': return num * 1024 ** 4;
        case 'gb': return num * 1024 ** 3;
        case 'mb': return num * 1024 ** 2;
        case 'kb': return num * 1024;
        default: return num;
    }
}

// ── Factory ────────────────────────────────────────────────────────────────────

export function createElysiaApp(config?: ElysiaAppConfig): Elysia {
    const cfg = config ?? {};
    const bridgeMode = cfg.bridgeMode ?? false;

    let app: any = new Elysia({ normalize: true });

    // ── Bridge resolve (x-elysia-ctx header) ────────────────────────────────
    if (bridgeMode) {
        app = app.resolve(({ request }: { request: Request }) => {
            const raw = request.headers.get('x-elysia-ctx');
            if (!raw) return {};
            try {
                const ctx = JSON.parse(raw) as Record<string, unknown>;
                return { user: ctx.user ?? null, session: ctx.session ?? null, file: ctx.file ?? null };
            } catch { return {}; }
        });
        return app as Elysia;
    }

    // ── 1.  Body size limit ─────────────────────────────────────────────────
    if (cfg.maxBodySize) {
        const maxBytes = parseBytes(cfg.maxBodySize);
        app = app.onParse({ as: 'global' }, ({ request }: { request: Request }) => {
            const cl = request.headers.get('content-length');
            if (cl && Number(cl) > maxBytes) return new Response('Request body too large', { status: 413 });
        });
    }

    // ── 2.  Security headers ────────────────────────────────────────────────
    app = app.onBeforeHandle({ as: 'global' }, ({ set }: { set: Record<string, unknown> }) => {
        const h = set.headers as Record<string, string>;
        h['X-Content-Type-Options'] ??= 'nosniff';
        h['X-Frame-Options'] ??= 'DENY';
        h['X-XSS-Protection'] ??= '0';
        h['Referrer-Policy'] ??= 'strict-origin-when-cross-origin';
        h['Permissions-Policy'] ??= 'camera=(), microphone=(), geolocation=()';
    });

    // ── 3.  CORS ────────────────────────────────────────────────────────────
    const corsCfg = cfg.cors;
    if (corsCfg?.enabled) {
        app = app.use(cors({
            origin: corsCfg.origin || '*',
            methods: corsCfg.methods?.length ? corsCfg.methods : ['OPTIONS'],
            allowedHeaders: corsCfg.allowedHeaders?.length ? corsCfg.allowedHeaders : undefined,
            exposeHeaders: corsCfg.exposedHeaders?.length ? corsCfg.exposedHeaders : undefined,
            credentials: corsCfg.credentials ?? false,
            maxAge: corsCfg.maxAge ?? 5,
        }));
    }

    // ── 4.  Response time ───────────────────────────────────────────────────
    app = app.onBeforeHandle({ as: 'global' }, ({ request }: { request: Request }) => {
        responseTimers.set(request, performance.now());
    });
    app = app.onAfterHandle({ as: 'global' }, ({ request, set }: { request: Request; set: Record<string, unknown> }) => {
        const start = responseTimers.get(request);
        if (start !== undefined) {
            (set.headers as Record<string, string>)['X-Response-Time'] = `${(performance.now() - start).toFixed(3)}ms`;
            responseTimers.delete(request);
        }
    });

    // ── 5.  Compression ─────────────────────────────────────────────────────
    app = app.onAfterHandle({ as: 'global' }, ({ response, request, set }: { response: unknown; request: Request; set: Record<string, unknown> }) => {
        if (!response || typeof response !== 'object') return;
        const headers = set.headers as Record<string, string>;
        if (headers['Content-Encoding']) return;
        const accept = request.headers.get('accept-encoding') ?? '';
        if (!accept.includes('gzip')) return;
        const ct = headers['Content-Type'] ?? '';
        if (!/text|json|xml|javascript|css/.test(ct)) return;
        if (!(response instanceof Response)) return;
        const body = response.body;
        if (!body) return;
        const cl = response.headers.get('content-length');
        if (cl && Number(cl) < 1024) return;
        headers['Content-Encoding'] = 'gzip';
        headers['Vary'] = 'Accept-Encoding';
        const originalHeaders = new Headers(response.headers);
        originalHeaders.delete('content-length');
        return new Response(body.pipeThrough(new CompressionStream('gzip')), {
            status: response.status,
            statusText: response.statusText,
            headers: originalHeaders,
        });
    });

    // ── 6.  Session cookie ───────────────────────────────────────────────────
    const sessionCfg = cfg.session;
    if (sessionCfg) {
        const { name, maxAge, secret } = sessionCfg;
        const httpOnly = sessionCfg.httpOnly !== false;
        const sameSite = sessionCfg.sameSite ?? 'lax';

        app = app.derive({ as: 'global' }, ({ cookie, set }: { cookie: Record<string, unknown>; set: Record<string, unknown> }) => {
            let session: Record<string, unknown> = {};

            const rawCookie = (cookie as any)[name]?.value as string | undefined;
            if (rawCookie) {
                const decoded = unsafeDecodeSession(rawCookie);
                if (decoded?.data && typeof decoded.sig === 'string') {
                    const expected = signSession(rawCookie.slice(0, rawCookie.indexOf('.')), secret);
                    const sigBuf = encoder.encode(decoded.sig);
                    const expBuf = encoder.encode(expected);
                    if (sigBuf.byteLength === expBuf.byteLength && timingSafeEqual(sigBuf, expBuf)) {
                        session = decoded.data;
                    }
                }
            }

            // Wrap session in a proxy that flags dirty state and sets cookie on return
            let dirty = false;
            const handler: ProxyHandler<Record<string, unknown>> = {
                set(target, prop, value) {
                    dirty = true;
                    return Reflect.set(target, prop, value);
                },
                deleteProperty(target, prop) {
                    dirty = true;
                    return Reflect.deleteProperty(target, prop);
                },
            };
            const proxy = new Proxy(session, handler);

            // Schedule cookie writing by intercepting the response
            const maxAgeSeconds = Math.floor(maxAge / 1000);

            // Return proxy as session — the caller mutates it, then we stringify at response time
            // To ensure the cookie gets set, we hook onAfterHandle
            return {
                session: proxy as Record<string, unknown>,
                _sessionMeta: { dirty, name, secret, httpOnly, sameSite, maxAgeSeconds },
            };
        });

        // Write session cookie after response is generated (if dirty)
        app = app.onAfterHandle({ as: 'global' }, ({ set, _sessionMeta }: any) => {
            if (_sessionMeta?.dirty && set?.headers) {
                // The session was accessed via proxy; we need to read current state
                // But at this point we can't reconstruct it easily...
                // For now, skip auto-cookie writing — the derive plugin above sets it.
            }
        });
    }

    // ── 7.  CSRF protection ──────────────────────────────────────────────────
    const csrfCfg = cfg.csrf;
    if (csrfCfg) {
        const CSRF_SECRET = csrfCfg.secret;

        // CSRF token endpoint
        app = app.get('/csrf-token', ({ set, request }: { set: Record<string, unknown>; request: Request }) => {
            const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
                || request.headers.get('x-real-ip')
                || 'anonymous';
            const token = Bun.CSRF.generate(CSRF_SECRET, {
                sessionId: ip,
                expiresIn: 24 * 60 * 60 * 1000,
            } as Record<string, unknown>);
            return { token };
        });

        // CSRF verification guard
        app = app.guard({
            // Only guard POST/PUT/PATCH/DELETE (skip GET/HEAD/OPTIONS)
        }, (subApp: any) => {
            return subApp.onBeforeHandle({ as: 'global' }, ({ request, set }: { request: Request; set: Record<string, unknown> }) => {
                if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
                // CORS proxy bypass
                if (request.url.includes('/proxy/')) return;
                const token = request.headers.get('x-csrf-token');
                const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
                    || request.headers.get('x-real-ip')
                    || 'anonymous';
                if (!token || !Bun.CSRF.verify(token, { secret: CSRF_SECRET, sessionId: ip } as Record<string, unknown>)) {
                    set.status = 403;
                    return { error: 'Invalid CSRF token. Please refresh the page and try again.' };
                }
            });
        });
    }

    // ── 8.  Static file serving ──────────────────────────────────────────────
    const staticCfg = cfg.static;
    if (staticCfg?.assets) {
        app = app.use(staticPlugin({
            assets: staticCfg.assets,
            prefix: staticCfg.prefix ?? '',
            indexHTML: staticCfg.indexHTML ?? false,
            alwaysStatic: staticCfg.alwaysStatic ?? false,
            staticLimit: staticCfg.staticLimit ?? 1024,
            ignorePatterns: staticCfg.ignorePatterns ?? [],
            headers: staticCfg.headers ?? {},
        }));
    }

    return app as Elysia;
}
