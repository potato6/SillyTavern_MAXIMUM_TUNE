/**
 * Temporary bridge to mount Elysia router instances as Express middleware.
 *
 * During the incremental migration each converted endpoint file exports an
 * Elysia instance (with its own prefix).  This adapter wraps it so it still
 * satisfies Express's `app.use()` chain while the integration is in flight.
 *
 * At runtime:
 *   1. Express middleware chain sets `req.user` / `req.session` as usual.
 *   2. This bridge captures them and attaches directly to the Web Request
 *      via a Symbol property, bypassing JSON serialization issues.
 *   3. An Elysia resolve plugin extracts them into the handler context.
 *   4. Handlers access `user` / `session` / `file` directly.
 *
 * When Elysia returns 404 (route not matched), we call `next()` so other
 * Express middleware (or unconverted routers) get a chance to handle it.
 *
 * Once ALL routes and middleware are converted (Phase 7) this file is deleted
 * and `server.ts` uses Elysia natively.
 */

import type { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
import { Elysia } from 'elysia';

/** Symbol key for storing Express context on the Web Request object. */
const CTX_SYM = Symbol('elysia-ctx');

/**
 * Wrap an Elysia instance so it can be used as Express middleware.
 *
 * Mount at `/` because each Elysia router carries its own prefix.
 * The bridge 404-passthrough ensures only matching routes are handled.
 */
export function mountElysia(elysiaApp: { fetch: (req: Request) => Response | Promise<Response> }) {
    const wrapped = new Elysia()
        .resolve(({ request }) => {
            return (request as unknown as Record<symbol, unknown>)[CTX_SYM] as Record<string, unknown> ?? {};
        })
        .use(elysiaApp as any);

    return async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
        try {
            // Build a Web Request from the Express request.
            const protocol = req.protocol ?? 'http';
            const host = req.headers.host ?? 'localhost';
            const url = new URL(req.originalUrl ?? req.url, `${protocol}://${host}`);

            let body: BodyInit | null = null;
            const contentType = (req.headers['content-type'] as string) || '';
            if (req.method !== 'GET' && req.method !== 'HEAD') {
                if (typeof req.body === 'object' && !(req.body instanceof Buffer)) {
                    body = JSON.stringify(req.body);
                } else if (typeof req.body === 'string') {
                    body = req.body;
                }
            }

            const headers = new Headers(req.headers as Record<string, string>);

            // If multer parsed the body into a JSON object, the Content-Type
            // no longer matches (was multipart/form-data). Update it so Elysia
            // can parse the body correctly.
            if (body && typeof body === 'string' && contentType.includes('multipart/form-data')) {
                headers.set('Content-Type', 'application/json');
            }
            const webReq = new Request(url, { method: req.method, headers, body });

            // Attach Express user/session/file directly to the Web Request object
            // using a Symbol key — no JSON serialization needed.
            const reqAny = req as unknown as Record<string, unknown>;
            const ctx: Record<string, unknown> = {};
            const user = reqAny.user as Record<string, unknown> | null;
            const session = reqAny.session as Record<string, unknown> | null;
            const file = reqAny.file as Record<string, unknown> | null;
            if (user) ctx.user = user;
            if (session) ctx.session = session;
            if (file) {
                ctx.file = {
                    fieldname: file.fieldname,
                    originalname: file.originalname,
                    encoding: file.encoding,
                    mimetype: file.mimetype,
                    destination: file.destination,
                    filename: file.filename,
                    path: file.path,
                    size: file.size,
                };
            }
            (webReq as unknown as Record<symbol, unknown>)[CTX_SYM] = ctx;

            // Dispatch to wrapped Elysia (has resolve plugin + user router).
            const webRes = await wrapped.fetch(webReq);

            // 404 = Elysia didn't match → let unconverted middleware handle it.
            if (webRes.status === 404) {
                return next();
            }

            // Write Elysia Response back to Express.
            if (res.headersSent) return;

            res.status(webRes.status);
            webRes.headers.forEach((value, key) => {
                if (!key.startsWith('x-node-')) {
                    res.set(key, value);
                }
            });

            // Use arrayBuffer for binary content types to avoid UTF-8 corruption
            const ct = webRes.headers.get('content-type') ?? '';
            if (ct.startsWith('text/') || ct.includes('json') || ct.includes('xml') || ct.includes('javascript') || ct.includes('svg')) {
                const bodyText = await webRes.text();
                res.send(bodyText || undefined);
            } else {
                const bodyBuffer = await webRes.arrayBuffer();
                res.send(new Uint8Array(bodyBuffer));
            }
        } catch (err) {
            next(err);
        }
    };
}
