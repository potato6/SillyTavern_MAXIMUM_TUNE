/**
 * Shared Elysia app factory.
 *
 * Replaces `const app = express()` + the full middleware chain in server.ts.
 * Each piece of Express middleware maps to an Elysia lifecycle hook or plugin:
 *
 *   helmet      → onBeforeHandle (security headers)
 *   compression → onAfterHandle  (gzip/deflate response bodies)
 *   response-time → onBeforeHandle + onAfterHandle (X-Response-Time header)
 *   express.json / urlencoded → Elysia native body parsing (set via onParse)
 *   cors        → @elysiajs/cors plugin
 *   static      → @elysiajs/static plugin
 *
 * In `bridgeMode` only the `resolve` plugin runs — CORS, compression, security
 * headers, static, etc. are handled by the still-active Express middleware.
 * This lets us incremental-migrate routers while keeping Express in front.
 *
 * In standalone mode (bridgeMode = false / omitted) the full middleware stack
 * is applied and the result replaces the Express app entirely.
 */

import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { staticPlugin } from '@elysiajs/static';

// ── Configuration ────────────────────────────────────────────────────────────

export interface ElysiaAppConfig {
    /** When true, only sets up the resolve bridge (no CORS/static/security/compression). */
    bridgeMode?: boolean;
    /** CORS settings (mirrors config.yaml cors.*).  null/undefined → disabled. */
    cors?: {
        enabled: boolean;
        origin: string;
        methods: string[];
        allowedHeaders: string[];
        exposedHeaders: string[];
        credentials: boolean;
        maxAge: number | null;
    } | null;
    /** Static file options forwarded to @elysiajs/static. */
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
    /** Maximum request body size (e.g. "500mb").  null → use Elysia default. */
    maxBodySize?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const responseTimers = new WeakMap<Request, number>();
const startTimeSym = Symbol('responseStart');

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a configured Elysia app with middleware that mirrors the current
 * Express setup.  Callers can then `.use()` routers and `.listen()`.
 *
 * @example
 *   const app = createElysiaApp({ cors: { enabled: true, origin: '*' } });
 *   app.use(usersRouter);
 *   app.listen(3000);
 */
export function createElysiaApp(config?: ElysiaAppConfig): Elysia {
    const { maxBodySize } = config ?? {};
    const bridgeMode = config?.bridgeMode ?? false;

    // Builder — we build the chain based on config.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let app: any = new Elysia({
        normalize: true,
    });

    // ── Resolve bridge (always runs) ───────────────────────────────────────
    // In bridge mode, mountElysia passes Express user/session via header.
    // In standalone mode, middleware plugins populate these later.
    app = app.resolve(({ request }: { request: Request }) => {
        const raw = request.headers.get('x-elysia-ctx');
        if (!raw) return {};
        try {
            const ctx = JSON.parse(raw) as Record<string, unknown>;
            return {
                user: ctx.user ?? null,
                session: ctx.session ?? null,
                file: ctx.file ?? null,
            };
        } catch {
            return {};
        }
    });

    if (bridgeMode) {
        return app as Elysia;
    }

    // ── 1.  Body size limit ────────────────────────────────────────────────
    if (maxBodySize) {
        const maxBytes = parseBytes(maxBodySize);
        app = app.onParse({ as: 'global' }, ({ request }: { request: Request }) => {
            const cl = request.headers.get('content-length');
            if (cl && Number(cl) > maxBytes) {
                return new Response('Request body too large', { status: 413 });
            }
        });
    }

    // ── 2.  Security headers ──────────────────────────────────────────────
    app = app.onBeforeHandle({ as: 'global' }, ({ set }: { set: Record<string, unknown> }) => {
        const headers = set.headers as Record<string, string>;
        headers['X-Content-Type-Options'] ??= 'nosniff';
        headers['X-Frame-Options'] ??= 'DENY';
        headers['X-XSS-Protection'] ??= '0';
        headers['Referrer-Policy'] ??= 'strict-origin-when-cross-origin';
        headers['Permissions-Policy'] ??= 'camera=(), microphone=(), geolocation=()';
    });

    // ── 3.  CORS ──────────────────────────────────────────────────────────
    const corsCfg = config?.cors;
    if (corsCfg?.enabled) {
        app = app.use(
            cors({
                origin: corsCfg.origin || '*',
                methods: corsCfg.methods?.length ? corsCfg.methods : ['OPTIONS'],
                allowedHeaders: corsCfg.allowedHeaders?.length ? corsCfg.allowedHeaders : undefined,
                exposeHeaders: corsCfg.exposedHeaders?.length ? corsCfg.exposedHeaders : undefined,
                credentials: corsCfg.credentials ?? false,
                maxAge: corsCfg.maxAge ?? 5,
            }),
        );
    }

    // ── 4.  Response time header ──────────────────────────────────────────
    app = app.onBeforeHandle({ as: 'global' }, ({ request }: { request: Request }) => {
        responseTimers.set(request, performance.now());
    });

    app = app.onAfterHandle(
        { as: 'global' },
        ({ request, set }: { request: Request; set: Record<string, unknown> }) => {
            const start = responseTimers.get(request);
            if (start !== undefined) {
                const headers = set.headers as Record<string, string>;
                headers['X-Response-Time'] = `${(performance.now() - start).toFixed(3)}ms`;
                responseTimers.delete(request);
            }
        },
    );

    // ── 5.  Response compression ──────────────────────────────────────────
    app = app.onAfterHandle(
        { as: 'global' },
        ({
            response,
            request,
            set,
        }: {
            response: unknown;
            request: Request;
            set: Record<string, unknown>;
        }) => {
            if (!response || typeof response !== 'object') return;
            const headers = set.headers as Record<string, string>;
            if (headers['Content-Encoding']) return;

            const accept = request.headers.get('accept-encoding') ?? '';
            if (!accept.includes('gzip') && !accept.includes('deflate')) return;

            const encoding: 'gzip' | 'deflate' = accept.includes('gzip') ? 'gzip' : 'deflate';
            const ct = headers['Content-Type'] ?? '';
            if (!/text|json|xml|javascript|css/.test(ct)) return;

            if (!(response instanceof Response)) return;
            const body = response.body;
            if (!body) return;

            const cl = response.headers.get('content-length');
            if (cl && Number(cl) < 1024) return;

            headers['Content-Encoding'] = encoding;
            headers['Vary'] = 'Accept-Encoding';

            const originalHeaders = new Headers(response.headers);
            originalHeaders.delete('content-length');

            const newBody = body.pipeThrough(new CompressionStream(encoding));

            return new Response(newBody, {
                status: response.status,
                statusText: response.statusText,
                headers: originalHeaders,
            });
        },
    );

    // ── 6.  Static file serving ───────────────────────────────────────────
    const staticCfg = config?.static;
    if (staticCfg?.assets ?? staticCfg?.prefix !== undefined) {
        app = app.use(
            staticPlugin({
                assets: staticCfg.assets ?? 'public/dist',
                prefix: staticCfg.prefix ?? '',
                indexHTML: staticCfg.indexHTML ?? false,
                alwaysStatic: staticCfg.alwaysStatic ?? false,
                staticLimit: staticCfg.staticLimit ?? 1024,
                ignorePatterns: staticCfg.ignorePatterns ?? [],
                headers: staticCfg.headers ?? {},
            }),
        );
    }

    return app as Elysia;
}

// ── Internal utilities ───────────────────────────────────────────────────────

function parseBytes(value: string): number {
    const match = value.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb)$/i);
    if (!match) return Number(value) || 0;

    const num = Number.parseFloat(match[1]!);
    const unit = match[2]!.toLowerCase();

    switch (unit) {
        case 'tb':
            return num * 1024 * 1024 * 1024 * 1024;
        case 'gb':
            return num * 1024 * 1024 * 1024;
        case 'mb':
            return num * 1024 * 1024;
        case 'kb':
            return num * 1024;
        default:
            return num;
    }
}
