import express from 'express';
import fs, { promises as fsPromises } from 'node:fs';
import path from 'node:path';
// @ts-expect-error TS(2792): Cannot find module 'sanitize-filename'. Did you me... Remove this comment to see the full error message
import sanitize from 'sanitize-filename';
import { CHAT_BACKUPS_PREFIX, getChatInfo } from './chats.js';

export const router = express.Router();

router.post('/chat/get', async (request, response) => {
    try {
        const backupModels = [];
        const backupFiles = await fsPromises
            .readdir(request.user.directories.backups, { withFileTypes: true })
            .then(d => d.filter(d => d.isFile() && path.extname(d.name) === '.jsonl' && d.name.startsWith(CHAT_BACKUPS_PREFIX)).map(d => d.name));

        for (const name of backupFiles) {
            const filePath = path.join(request.user.directories.backups, name);
            const info = await getChatInfo(filePath);
            // @ts-expect-error TS(2339): Property 'file_name' does not exist on type 'unkno... Remove this comment to see the full error message
            if (!info || !info.file_name) {
                continue;
            }
            backupModels.push(info);
        }

        return response.json(backupModels);
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

router.post('/chat/delete', async (request, response) => {
    try {
        const { name } = request.body;
        const filePath = path.join(request.user.directories.backups, sanitize(name));

        if (!path.parse(filePath).base.startsWith(CHAT_BACKUPS_PREFIX)) {
            console.warn('Attempt to delete non-chat backup file:', name);
            return response.sendStatus(400);
        }

        if (!fs.existsSync(filePath)) {
            return response.sendStatus(404);
        }

        await fsPromises.unlink(filePath);
        return response.sendStatus(200);
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

router.post('/chat/download', async (request, response) => {
    try {
        const { name } = request.body;
        const filePath = path.join(request.user.directories.backups, sanitize(name));

        if (!path.parse(filePath).base.startsWith(CHAT_BACKUPS_PREFIX)) {
            console.warn('Attempt to download non-chat backup file:', name);
            return response.sendStatus(400);
        }

        if (!fs.existsSync(filePath)) {
            return response.sendStatus(404);
        }

        return response.download(filePath);
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});
