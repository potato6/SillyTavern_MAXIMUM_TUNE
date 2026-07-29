import path from 'node:path';
import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

export const router = new Elysia({ prefix: '/api/moving-ui' }).post('/save', (context) => {
    const { body, set } = context;
    const user = context.user as Record<string, unknown> | null;
    const bodyAny = body as Record<string, unknown> | null;
    if (!bodyAny?.name) {
        set.status = 400;
        return;
    }

    const directories = user?.directories as Record<string, string> | undefined;

    const filename = path.join(directories?.movingUI ?? '', sanitize(`${bodyAny.name}.json`));
    writeFileAtomicSync(filename, JSON.stringify(body, null, 4), 'utf8');

    set.status = 204;
    return;
});
