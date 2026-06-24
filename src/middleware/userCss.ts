import path from 'node:path';
import fs from 'node:fs';

/**
 * Provides an Express middleware function that serves a user-defined CSS file from the data directory if it exists.
 * @type {import('express').Handler}
 */
export function userCssMiddleware(req: any, res: any, next: any) {
    if (req.method === 'GET' && req.path === '/css/user.css') {
        // @ts-expect-error TS(7017): Element implicitly has an 'any' type because type ... Remove this comment to see the full error message
        const userCssPath = path.resolve(path.join(globalThis.DATA_ROOT, '_css', 'user.css'));
        if (fs.existsSync(userCssPath)) {
            res.sendFile(userCssPath);
            return;
        }
    }
    next();
}

export default userCssMiddleware;
