import fs, { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import { CHAT_BACKUPS_PREFIX, getChatInfo } from './chats.js';

export const router = new Elysia({ prefix: '/api/backups' })
    .post('/chat/get', async (context) => {
        const { set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            const backupModels = [];
            const backupDir = directories?.backups ?? '';
            const backupFiles = await fsPromises
                .readdir(backupDir, { withFileTypes: true })
                .then((d) =>
                    d
                        .filter(
                            (d) =>
                                d.isFile() &&
                                path.extname(d.name) === '.jsonl' &&
                                d.name.startsWith(CHAT_BACKUPS_PREFIX),
                        )
                        .map((d) => d.name),
                );

            for (const name of backupFiles) {
                const filePath = path.join(backupDir, name);
                const info = await getChatInfo(filePath);
                if (!info || !(info as Record<string, unknown>).file_name) {
                    continue;
                }
                backupModels.push(info);
            }

            return backupModels;
        } catch (error) {
            console.error(error);
            set.status = 500;
            return;
        }
    })
    .post('/chat/delete', async (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const { name } = body as Record<string, unknown>;

        try {
            const filePath = path.join(directories?.backups ?? '', sanitize(name as string));

            if (!path.parse(filePath).base.startsWith(CHAT_BACKUPS_PREFIX)) {
                console.warn('Attempt to delete non-chat backup file:', name);
                set.status = 400;
                return;
            }

            if (!fs.existsSync(filePath)) {
                set.status = 404;
                return;
            }

            await fsPromises.unlink(filePath);
            set.status = 204;
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    })
    .post('/chat/download', async (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const { name } = body as Record<string, unknown>;

        try {
            const filePath = path.join(directories?.backups ?? '', sanitize(name as string));

            if (!path.parse(filePath).base.startsWith(CHAT_BACKUPS_PREFIX)) {
                console.warn('Attempt to download non-chat backup file:', name);
                set.status = 400;
                return;
            }

            if (!fs.existsSync(filePath)) {
                set.status = 404;
                return;
            }

            return new Response(Bun.file(filePath), {
                headers: {
                    'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`,
                },
            });
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    });
