import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import { CHAT_BACKUPS_PREFIX, getChatInfo } from './chats.js';

interface UserDirectories {
    backups?: string;
    [key: string]: unknown;
}

interface UserContext {
    directories?: UserDirectories;
    [key: string]: unknown;
}

export const router = new Elysia({ prefix: '/api/backups' })
    .post('/chat/get', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const user = ctx.user as UserContext | undefined;
        const backupDir = user?.directories?.backups ?? '';

        try {
            const dirents = await fsPromises.readdir(backupDir, { withFileTypes: true });
            const backupModels: unknown[] = [];

            for (const dirent of dirents) {
                const fileName = dirent.name;

                if (
                    dirent.isFile() &&
                    fileName.endsWith('.jsonl') &&
                    fileName.startsWith(CHAT_BACKUPS_PREFIX)
                ) {
                    const filePath = path.join(backupDir, fileName);
                    const info = await getChatInfo(filePath);

                    if (info && (info as Record<string, unknown>).file_name) {
                        backupModels.push(info);
                    }
                }
            }

            return backupModels;
        } catch (error) {
            console.error(error);
            set.status = 500;
            return;
        }
    })
    .post('/chat/delete', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const body = ctx.body as Record<string, unknown> | undefined;
        const name = body?.name;

        if (typeof name !== 'string') {
            set.status = 400;
            return;
        }

        try {
            const sanitizedName = sanitize(name);

            if (!sanitizedName.startsWith(CHAT_BACKUPS_PREFIX)) {
                console.warn('Attempt to delete non-chat backup file:', name);
                set.status = 400;
                return;
            }

            const user = ctx.user as UserContext | undefined;
            const backupDir = user?.directories?.backups ?? '';
            const filePath = path.join(backupDir, sanitizedName);

            try {
                await fsPromises.unlink(filePath);
                set.status = 204;
            } catch (err: any) {
                if (err?.code === 'ENOENT') {
                    set.status = 404;
                    return;
                }
                throw err;
            }
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    })
    .post('/chat/download', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const body = ctx.body as Record<string, unknown> | undefined;
        const name = body?.name;

        if (typeof name !== 'string') {
            set.status = 400;
            return;
        }

        try {
            const sanitizedName = sanitize(name);

            if (!sanitizedName.startsWith(CHAT_BACKUPS_PREFIX)) {
                console.warn('Attempt to download non-chat backup file:', name);
                set.status = 400;
                return;
            }

            const user = ctx.user as UserContext | undefined;
            const backupDir = user?.directories?.backups ?? '';
            const filePath = path.join(backupDir, sanitizedName);

            const file = Bun.file(filePath);
            if (!(await file.exists())) {
                set.status = 404;
                return;
            }

            return new Response(file, {
                headers: {
                    'Content-Disposition': `attachment; filename="${sanitizedName}"`,
                },
            });
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    });
