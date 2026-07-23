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
 * Middleware that depends on Express-specific req/res (basicAuth, session, CSRF,
 * request-filter, whitelist, access-log) will be converted to Elysia plugins
 * in later phases.  For now the factory provides the hooks they need.
 */

import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { staticPlugin } from '@elysiajs/static';

// ── Configuration ────────────────────────────────────────────────────────────

export interface ElysiaAppConfig {
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

    const app = new Elysia({
        // Let Elysia normalise request / response types automatically.
        normalize: true,
    });

    // ── 1.  Body size limit ────────────────────────────────────────────────
    // Elysia does not expose a built-in body-size cap, so we enforce it via
    // the onParse hook.  We let Elysia's default parsers run but abort early
    // when Content-Length exceeds the limit.
    if (maxBodySize) {
        const maxBytes = parseBytes(maxBodySize);
        app.onParse({ as: 'global' }, ({ request }) => {
            const cl = request.headers.get('content-length');
            if (cl && Number(cl) > maxBytes) {
                return new Response('Request body too large', { status: 413 });
            }
        });
    }

    // ── 2.  Security headers (replaces `helmet({ contentSecurityPolicy: false })`) ─
    app.onBeforeHandle({ as: 'global' }, ({ set }) => {
        set.headers['X-Content-Type-Options'] ??= 'nosniff';
        set.headers['X-Frame-Options'] ??= 'DENY';
        set.headers['X-XSS-Protection'] ??= '0';
        set.headers['Referrer-Policy'] ??= 'strict-origin-when-cross-origin';
        set.headers['Permissions-Policy'] ??=
            'camera=(), microphone=(), geolocation=()';
    });

    // ── 3.  CORS (replaces npm `cors`) ─────────────────────────────────────
    const corsCfg = config?.cors;
    if (corsCfg?.enabled) {
        app.use(
            cors({
                origin: corsCfg.origin || '*',
                methods: corsCfg.methods?.length
                    ? corsCfg.methods
                    : ['OPTIONS'],
                allowedHeaders:
                    corsCfg.allowedHeaders?.length
                        ? corsCfg.allowedHeaders
                        : undefined,
                exposeHeaders:
                    corsCfg.exposedHeaders?.length
                        ? corsCfg.exposedHeaders
                        : undefined,
                credentials: corsCfg.credentials ?? false,
                maxAge: corsCfg.maxAge ?? 5,
            }),
        );
    }

    // ── 4.  Response time header (replaces npm `response-time`) ────────────
    app.onBeforeHandle({ as: 'global' }, ({ request }) => {
        responseTimers.set(request, performance.now());
    });

    app.onAfterHandle({ as: 'global' }, ({ request, set }) => {
        const start = responseTimers.get(request);
        if (start !== undefined) {
            const elapsed = performance.now() - start;
            set.headers['X-Response-Time'] = `${elapsed.toFixed(3)}ms`;
            responseTimers.delete(request);
        }
    });

    // ── 5.  Response compression (replaces npm `compression`) ──────────────
    // Compress text-like responses when the client advertises gzip/deflate.
    // Uses the Web CompressionStream API available in Bun.
    app.onAfterHandle({ as: 'global' }, ({ response, request, set }) => {
        if (!response || typeof response !== 'object') return;
        if (set.headers['Content-Encoding']?.toString()) return; // already compressed

        const accept = request.headers.get('accept-encoding') ?? '';
        if (!accept.includes('gzip') && !accept.includes('deflate')) return;

        const encoding = accept.includes('gzip') ? 'gzip' as const : 'deflate' as const;

        // Only compress text-like content types.
        const ct = (set.headers['Content-Type'] ?? '').toString();
        if (!/text|json|xml|javascript|css/.test(ct)) return;

        // If the handler returned a plain value, Elysia wraps it lazily and
        // `response` here will be a Response.  We need a Response to pipe.
        if (!(response instanceof Response)) return;

        const body = response.body;
        if (!body) return;

        // Skip if the response is already small (not worth compressing).
        const cl = response.headers.get('content-length');
        if (cl && Number(cl) < 1024) return;

        set.headers['Content-Encoding'] = encoding as string;
        set.headers['Vary'] = 'Accept-Encoding';

        // Strip content-length since it changes after compression.
        const originalHeaders = new Headers(response.headers);
        originalHeaders.delete('content-length');

        const newBody = body.pipeThrough(new CompressionStream(encoding));

        return new Response(newBody, {
            status: response.status,
            statusText: response.statusText,
            headers: originalHeaders,
        });
    });

    // ── 6.  Static file serving (replaces express.static) ──────────────────
    const staticCfg = config?.static;
    if (staticCfg?.assets ?? staticCfg?.prefix !== undefined) {
        app.use(staticPlugin({
            assets: staticCfg.assets ?? 'public/dist',
            prefix: staticCfg.prefix ?? '',
            indexHTML: staticCfg.indexHTML ?? false,
            alwaysStatic: staticCfg.alwaysStatic ?? false,
            staticLimit: staticCfg.staticLimit ?? 1024,
            ignorePatterns: staticCfg.ignorePatterns ?? [],
            headers: staticCfg.headers ?? {},
        }));
    }

    // ── 7.  Error handler ──────────────────────────────────────────────────
    app.onError({ as: 'global' }, ({ code, error, set }) => {
        if (code === 'NOT_FOUND') {
            set.status = 404;
            return 'Not Found';
        }

        if (code === 'VALIDATION') {
            set.status = 400;
            return { error: 'Validation Error', details: (error as Error).message };
        }

        console.error('Unhandled error:', error);
        set.status = 500;
        return 'Internal Server Error';
    });

    return app;
}

// ── Internal utilities ───────────────────────────────────────────────────────

/**
 * Parse a human-readable byte string ("500mb", "1gb", "10kb") to a number.
 */
function parseBytes(value: string): number {
    const match = value.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb)$/i);
    if (!match) return Number(value) || 0;

    const num = Number.parseFloat(match[1]!);
    const unit = match[2]!.toLowerCase();

    switch (unit) {
        case 'tb': return num * 1024 * 1024 * 1024 * 1024;
        case 'gb': return num * 1024 * 1024 * 1024;
        case 'mb': return num * 1024 * 1024;
        case 'kb': return num * 1024;
        default: return num;
    }
}


