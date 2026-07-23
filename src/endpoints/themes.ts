import path from 'node:path';
import fs from 'node:fs';
import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

export const router = new Elysia({ prefix: '/api/themes' })
    .post('/save', (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const bodyAny = body as Record<string, unknown> | null;

        if (!bodyAny?.name) {
            set.status = 400;
            return;
        }

        const filename = path.join(
            directories?.themes ?? '',
            sanitize(`${bodyAny.name}.json`),
        );
        writeFileAtomicSync(filename, JSON.stringify(body, null, 4), 'utf8');

        set.status = 204;
    })
    .post('/delete', (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const bodyAny = body as Record<string, unknown> | null;

        if (!bodyAny?.name) {
            set.status = 400;
            return;
        }

        try {
            const filename = path.join(
                directories?.themes ?? '',
                sanitize(`${bodyAny.name}.json`),
            );
            if (!fs.existsSync(filename)) {
                console.error('Theme file not found:', filename);
                set.status = 404;
                return;
            }
            fs.unlinkSync(filename);
            set.status = 204;
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    });
