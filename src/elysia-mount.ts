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
 *   3. A parent Elysia instance with a `resolve` plugin extracts them into context.
 *   4. Handlers access `user` / `session` directly in their context.
 *
 * When Elysia returns 404 (route not matched), we call `next()` so other
 * Express middleware (or unconverted routers) get a chance to handle it.
 *
 * Once ALL routes and middleware are converted (Phase 7) this file is deleted
 * and `server.ts` uses Elysia natively.
 */

import type { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
import { Elysia } from 'elysia';

// Resolve plugin used by every bridged router to extract user/session/file
// from the x-elysia-ctx header that mountElysia sets.
const bridgeResolve = new Elysia({ name: 'mount-elysia-bridge' })
    .resolve(({ request }) => {
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

/**
 * Wrap an Elysia instance so it can be used as Express middleware.
 *
 * Mount at `/` because each Elysia router carries its own prefix.
 * The bridge 404-passthrough ensures only matching routes are handled.
 */
export function mountElysia(elysiaApp: { fetch: (req: Request) => Response | Promise<Response> }) {
    // Wrap the router in a parent that has the resolve plugin.
    // This ensures user/session/file are available in EVERY router's context.
    const wrapped = new Elysia().use(bridgeResolve).use(elysiaApp as any);

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

            // Pass Express augmentations (user, session, file) to Elysia via header.
            const reqAny = req as unknown as Record<string, unknown>;
            const user = reqAny.user as Record<string, unknown> | null;
            const session = reqAny.session as Record<string, unknown> | null;
            const file = reqAny.file as Record<string, unknown> | null;
            const ctx: Record<string, unknown> = {};
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
            if (Object.keys(ctx).length > 0) {
                headers.set('x-elysia-ctx', JSON.stringify(ctx));
            }

            const webReq = new Request(url, {
                method: req.method,
                headers,
                body,
            });

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

            const bodyText = await webRes.text();
            res.send(bodyText || undefined);
        } catch (err) {
            next(err);
        }
    };
}
