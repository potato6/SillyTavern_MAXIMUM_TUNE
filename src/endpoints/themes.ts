import path from 'node:path';
import fsp from 'node:fs/promises';
import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import writeFileAtomic from 'write-file-atomic';

interface UserDirectories {
    themes?: string;
    [key: string]: unknown;
}

interface UserContext {
    directories?: UserDirectories;
    [key: string]: unknown;
}

export const router = new Elysia({ prefix: '/api/themes' })
    .post('/save', async (context: any) => {
        const { set } = context;

        const bodyAny = context.body as Record<string, unknown> | undefined;
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;

        const rawName = bodyAny?.name;
        if (typeof rawName !== 'string' || rawName.length === 0) {
            set.status = 400;
            return;
        }

        const name = sanitize(rawName);
        if (name.length === 0) {
            set.status = 400;
            return;
        }

        const themesDir = directories?.themes ?? '';
        const filename = path.join(themesDir, `${name}.json`);

        try {
            await writeFileAtomic(filename, JSON.stringify(context.body, null, 4), 'utf8');
            set.status = 204;
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    })
    .post('/delete', async (context: any) => {
        const { set } = context;

        const bodyAny = context.body as Record<string, unknown> | undefined;
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;

        const rawName = bodyAny?.name;
        if (typeof rawName !== 'string' || rawName.length === 0) {
            set.status = 400;
            return;
        }

        const name = sanitize(rawName);
        if (name.length === 0) {
            set.status = 400;
            return;
        }

        const themesDir = directories?.themes ?? '';
        const filename = path.join(themesDir, `${name}.json`);

        try {
            await fsp.unlink(filename);
            set.status = 204;
        } catch (error: any) {
            if (error?.code === 'ENOENT') {
                console.error('Theme file not found:', filename);
                set.status = 404;
                return;
            }
            console.error(error);
            set.status = 500;
        }
    });
