import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

// Augment Express Request to include our session
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            session?: Record<string, unknown> | null;
        }
    }
}

const encoder = new TextEncoder();

function sign(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('base64url');
}

function unsafeDecode(value: string): { data: Record<string, unknown> | null; sig: string } | null {
    const dot = value.indexOf('.');
    if (dot === -1) return null;
    return {
        data: (() => {
            try {
                const raw = Buffer.from(value.slice(0, dot), 'base64url').toString('utf8');
                return JSON.parse(raw);
            } catch {
                return null;
            }
        })(),
        sig: value.slice(dot + 1),
    };
}

/**
 * Express middleware that replaces cookie-session with Bun-native cookies.
 *
 * The entire session is serialized to JSON, signed with HMAC-SHA256, and
 * stored in a single cookie. No server-side storage.
 *
 * - `req.session` is a plain object — mutate it freely
 * - Set `req.session = null` to destroy the session (clears the cookie)
 * - Setting any property triggers a cookie re-sign on response
 * - `req.session.touch = Date.now()` refreshes the cookie expiry
 */
export default function bunSessionMiddleware(opts: {
    name: string;
    maxAge: number;
    secret: string;
    httpOnly?: boolean;
    sameSite?: 'lax' | 'strict' | 'none';
}) {
    const { name, maxAge, secret } = opts;
    const httpOnly = opts.httpOnly !== false;
    const sameSite = opts.sameSite ?? 'lax';

    return (req: Request, res: Response, next: NextFunction) => {
        const rawHeader = req.headers.cookie ?? '';
        const rawCookie = (() => {
            // Manual cookie parse to find our named cookie
            const parts = rawHeader.split(/;\s*/);
            for (const part of parts) {
                const eq = part.indexOf('=');
                if (eq === -1) continue;
                const key = part.slice(0, eq).trim();
                if (key === name) return decodeURIComponent(part.slice(eq + 1));
            }
            return null;
        })();

        let session: Record<string, unknown> = {};
        let dirty = false;

        if (rawCookie) {
            const decoded = unsafeDecode(rawCookie);
            if (decoded && decoded.data && typeof decoded.sig === 'string') {
                const expected = sign(rawCookie.slice(0, rawCookie.indexOf('.')), secret);
                const sigBuf = encoder.encode(decoded.sig);
                const expBuf = encoder.encode(expected);
                if (sigBuf.byteLength === expBuf.byteLength && timingSafeEqual(sigBuf, expBuf)) {
                    session = decoded.data;
                }
            }
        }

        const handler: ProxyHandler<Record<string, unknown>> = {
            set(target, prop, value) {
                if (typeof prop !== 'string') return Reflect.set(target, prop, value);
                // Setting touch just flags dirty; actual value doesn't matter
                if (prop === 'touch' && value != null) {
                    dirty = true;
                    return true;
                }
                dirty = true;
                return Reflect.set(target, prop, value);
            },
            deleteProperty(target, prop) {
                dirty = true;
                return Reflect.deleteProperty(target, prop);
            },
        };

        let proxy = new Proxy(session, handler);

        Object.defineProperty(req, 'session', {
            get() {
                return proxy;
            },
            set(val: Record<string, unknown> | null) {
                // Setting to null destroys the session
                // Setting to a new object replaces it
                if (val === null) {
                    proxy = null as unknown as Record<string, unknown>;
                    dirty = true;
                } else {
                    const newHandler: ProxyHandler<Record<string, unknown>> = {
                        set(t, prop, value) {
                            if (typeof prop === 'string' && prop !== 'touch') dirty = true;
                            return Reflect.set(t, prop, value);
                        },
                        deleteProperty(t, prop) {
                            dirty = true;
                            return Reflect.deleteProperty(t, prop);
                        },
                    };
                    proxy = new Proxy(val, newHandler);
                    dirty = true;
                }
            },
            configurable: true,
        });

        // Store reference to the original end to avoid issues
        const originalEnd = res.end.bind(res);


        const setSessionCookie = () => {
            // Read current session value through the proxy
            const currentProxy = req.session;
            if (currentProxy === null || currentProxy === undefined) {
                res.setHeader('Set-Cookie',
                    `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=${sameSite}`);
                return;
            }

            const plain: Record<string, unknown> = {};
            for (const key of Object.keys(currentProxy)) {
                // Don't serialize internal/touch-only props
                if (key === 'touch') continue;
                plain[key] = currentProxy[key];
            }

            if (Object.keys(plain).length === 0 && !currentProxy.touch) {
                // Empty session with no touch — skip setting cookie entirely
                return;
            }

            const payload = Buffer.from(JSON.stringify(plain), 'utf8').toString('base64url');
            const sig = sign(payload, secret);
            const maxAgeSeconds = Math.floor(maxAge / 1000);

            const cookie = new Bun.Cookie(name, `${payload}.${sig}`, {
                httpOnly,
                sameSite,
                path: '/',
                maxAge: maxAgeSeconds,
            });

            res.setHeader('Set-Cookie', cookie.toString());
        };

        const finish = (...args: unknown[]) => {
            if (dirty) setSessionCookie();
            return originalEnd(args[0], args[1]);
        };

        res.end = finish as unknown as typeof res.end;

        next();
    };
}
