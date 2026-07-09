// @ts-expect-error TS(1259) FIXME: Module '"node:path"' can only be default-imported ... Remove this comment to see the full error message
import path from 'node:path';
// @ts-expect-error TS(1192) FIXME: Module '"node:fs"' has no default export.
import fs from 'node:fs';
import type { Request, Response, NextFunction } from 'express';

/**
 * Provides an Express middleware function that serves a user-defined CSS file from the data directory if it exists.
 * @type {import('express').Handler}
 */
export function userCssMiddleware(req: Request, res: Response, next: NextFunction) {
    if (req.method === 'GET' && req.path === '/css/user.css') {
        const userCssPath = path.resolve(path.join(globalThis.DATA_ROOT, '_css', 'user.css'));
        if (fs.existsSync(userCssPath)) {
            res.sendFile(userCssPath);
            return;
        }
    }
    next();
}

export default userCssMiddleware;
