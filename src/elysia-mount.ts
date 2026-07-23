/**
 * Temporary bridge to mount Elysia router instances as Express middleware.
 *
 * During the incremental migration each converted endpoint file exports an
 * Elysia instance (with its own prefix).  This adapter wraps it so it still
 * satisfies Express's `app.use()` chain while the integration is in flight.
 *
 * At runtime:
 *   1. Express middleware chain sets `req.user` / `req.session` as usual.
 *   2. This bridge captures them and passes via `x-elysia-ctx` header.
 *   3. The Elysia app's global `resolve` plugin extracts them into context.
 *   4. Handlers access `user` / `session` directly in their context.
 *
 * When Elysia returns 404 (route not matched), we call `next()` so other
 * Express middleware (or unconverted routers) get a chance to handle it.
 *
 * Once ALL routes and middleware are converted (Phase 7) this file is deleted
 * and `server.ts` uses Elysia natively.
 */

import type { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';

/**
 * Wrap an Elysia instance so it can be used as Express middleware.
 *
 * Mount at `/` because each Elysia router carries its own prefix.
 * The bridge 404-passthrough ensures only matching routes are handled.
 */
export function mountElysia(elysiaApp: { fetch: (req: Request) => Response | Promise<Response> }) {
    return async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
        try {
            // Build a Web Request from the Express request.
            const protocol = req.protocol ?? 'http';
            const host = req.headers.host ?? 'localhost';
            const url = new URL(req.originalUrl ?? req.url, `${protocol}://${host}`);

            let body: BodyInit | null = null;
            if (req.method !== 'GET' && req.method !== 'HEAD') {
                if (typeof req.body === 'object') {
                    body = JSON.stringify(req.body);
                } else if (typeof req.body === 'string') {
                    body = req.body;
                }
            }

            const headers = new Headers(req.headers as Record<string, string>);

            // Pass Express augmentations (user, session) to Elysia via header.
            const reqAny = req as unknown as Record<string, unknown>;
            const user = reqAny.user as Record<string, unknown> | null;
            const session = reqAny.session as Record<string, unknown> | null;
            if (user || session) {
                headers.set('x-elysia-ctx', JSON.stringify({ user, session }));
            }

            const webReq = new Request(url, {
                method: req.method,
                headers,
                body,
            });

            // Dispatch to Elysia.
            const webRes = await elysiaApp.fetch(webReq);

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

            const bodyText = await webRes.text();
            res.send(bodyText || undefined);
        } catch (err) {
            next(err);
        }
    };
}
