// @ts-expect-error TS(1259) FIXME: Module '"node:path"' can only be default-imported ... Remove this comment to see the full error message
import path from 'node:path';
// @ts-expect-error TS(1192) FIXME: Module '"node:fs"' has no default export.
import fs from 'node:fs';

// @ts-expect-error TS(1259) FIXME: Module '"/mnt/DISCO/downloads/some_git_projects/Si... Remove this comment to see the full error message
import express from 'express';
// @ts-expect-error TS(2792) FIXME: Cannot find module 'sanitize-filename'. Did you me... Remove this comment to see the full error message
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { getImages, tryParse } from '../util.js';
import { getFileNameValidationFunction } from '../middleware/validateFileName.js';
import { applyAvatarCropResize } from './characters.js';
import { invalidateThumbnail } from './thumbnails.js';
import cacheBuster from '../middleware/cacheBuster.js';

export const router = express.Router();

// @ts-expect-error TS(7006) FIXME: Parameter 'request' implicitly has an 'any' type.
router.post('/get', function (request, response) {
    const images = getImages(request.user.directories.avatars);
    response.send(images);
});

// @ts-expect-error TS(7006) FIXME: Parameter 'request' implicitly has an 'any' type.
router.post('/delete', getFileNameValidationFunction('avatar'), function (request, response) {
    if (!request.body) return response.sendStatus(400);

    if (request.body.avatar !== sanitize(request.body.avatar)) {
        console.error('Malicious avatar name prevented');
        return response.sendStatus(403);
    }

    const fileName = path.join(request.user.directories.avatars, sanitize(request.body.avatar));

    if (fs.existsSync(fileName)) {
        fs.unlinkSync(fileName);
        invalidateThumbnail(request.user.directories, 'persona', sanitize(request.body.avatar));
        return response.send({ result: 'ok' });
    }

    return response.sendStatus(404);
});

// @ts-expect-error TS(7006) FIXME: Parameter 'request' implicitly has an 'any' type.
router.post('/upload', getFileNameValidationFunction('overwrite_name'), async (request, response) => {
    if (!request.file) return response.sendStatus(400);

    try {
        const pathToUpload = path.join(request.file.destination, request.file.filename);
        const crop = tryParse(request.query.crop);
        const fileBuffer = fs.readFileSync(pathToUpload);
        const image = await applyAvatarCropResize(fileBuffer, crop);

        // Remove previous thumbnail and bust cache if overwriting
        if (request.body.overwrite_name) {
            invalidateThumbnail(request.user.directories, 'persona', sanitize(request.body.overwrite_name));
            cacheBuster.bust(request, response);
        }

        const filename = sanitize(request.body.overwrite_name || `${Date.now()}.png`);
        const pathToNewFile = path.join(request.user.directories.avatars, filename);
        writeFileAtomicSync(pathToNewFile, image);
        fs.unlinkSync(pathToUpload);
        return response.send({ path: filename });
    } catch (err) {
        console.error('Error uploading user avatar:', err);
        return response.status(400).send('Is not a valid image');
    }
});
