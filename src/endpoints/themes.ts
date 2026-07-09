// @ts-expect-error TS(1259) FIXME: Module '"node:path"' can only be default-imported ... Remove this comment to see the full error message
import path from 'node:path';
// @ts-expect-error TS(1192) FIXME: Module '"node:fs"' has no default export.
import fs from 'node:fs';

// @ts-expect-error TS(1259) FIXME: Module '"/mnt/DISCO/downloads/some_git_projects/Si... Remove this comment to see the full error message
import express from 'express';
// @ts-expect-error TS(2792) FIXME: Cannot find module 'sanitize-filename'. Did you me... Remove this comment to see the full error message
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

export const router = express.Router();

// @ts-expect-error TS(7006) FIXME: Parameter 'request' implicitly has an 'any' type.
router.post('/save', (request, response) => {
    if (!request.body || !request.body.name) {
        return response.sendStatus(400);
    }

    const filename = path.join(request.user.directories.themes, sanitize(`${request.body.name}.json`));
    writeFileAtomicSync(filename, JSON.stringify(request.body, null, 4), 'utf8');

    return response.sendStatus(200);
});

// @ts-expect-error TS(7006) FIXME: Parameter 'request' implicitly has an 'any' type.
router.post('/delete', (request, response) => {
    if (!request.body || !request.body.name) {
        return response.sendStatus(400);
    }

    try {
        const filename = path.join(request.user.directories.themes, sanitize(`${request.body.name}.json`));
        if (!fs.existsSync(filename)) {
            console.error('Theme file not found:', filename);
            return response.sendStatus(404);
        }
        fs.unlinkSync(filename);
        return response.sendStatus(200);
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});
