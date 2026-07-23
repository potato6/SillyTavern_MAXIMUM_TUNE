import fs from 'node:fs';
import path from 'node:path';
import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import { tryParse } from '../util.js';

export function readWorldInfoFile(
    directories: Record<string, string>,
    worldInfoName: string,
    allowDummy: boolean,
) {
    const dummyObject = allowDummy ? { entries: {} } : null;

    if (!worldInfoName) {
        return dummyObject;
    }

    const filename = sanitize(`${worldInfoName}.json`);
    const pathToWorldInfo = path.join(directories.worlds!, filename);

    if (!fs.existsSync(pathToWorldInfo)) {
        console.error(`World info file ${filename} doesn't exist.`);
        return dummyObject;
    }

    const worldInfoText = fs.readFileSync(pathToWorldInfo, 'utf8');
    const worldInfo = JSON.parse(worldInfoText);
    return worldInfo;
}

export const router = new Elysia({ prefix: '/api/worldinfo' })
    .post('/list', async (context) => {
        const user = (context as unknown as Record<string, unknown>).user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            const data: Array<Record<string, unknown>> = [];
            const jsonFiles = (
                await fs.promises.readdir(directories?.worlds ?? '', { withFileTypes: true })
            )
                .filter((file) => file.isFile() && path.extname(file.name).toLowerCase() === '.json')
                .toSorted((a, b) => a.name.localeCompare(b.name));

            for (const file of jsonFiles) {
                try {
                    const filePath = path.join(directories?.worlds ?? '', file.name);
                    const fileContents = await fs.promises.readFile(filePath, 'utf8');
                    const fileContentsParsed = tryParse(fileContents) || {};
                    const fileExtensions = (fileContentsParsed as Record<string, unknown>)?.extensions || {};
                    const fileNameWithoutExt = path.parse(file.name).name;
                    const fileData = {
                        file_id: fileNameWithoutExt,
                        name: (fileContentsParsed as Record<string, unknown>)?.name || fileNameWithoutExt,
                        extensions:
                            typeof fileExtensions === 'object' && fileExtensions !== null
                                ? fileExtensions
                                : {},
                    };
                    data.push(fileData);
                } catch (error) {
                    console.warn(`Error reading or parsing World Info file ${file.name}:`, error);
                }
            }

            return data;
        } catch (error) {
            console.error('Error reading World Info directory:', error);
            return new Response(null, { status: 500 });
        }
    })
    .post('/get', (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const bodyAny = body as Record<string, unknown>;

        if (!bodyAny?.name) {
            set.status = 400;
            return;
        }

        const file = readWorldInfoFile(directories ?? {}, bodyAny.name as string, true);
        return file;
    })
    .post('/delete', (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const bodyAny = body as Record<string, unknown>;

        if (!bodyAny?.name) {
            set.status = 400;
            return;
        }

        const worldInfoName = bodyAny.name as string;
        const filename = sanitize(`${worldInfoName}.json`);
        const pathToWorldInfo = path.join(directories?.worlds ?? '', filename);

        if (!fs.existsSync(pathToWorldInfo)) {
            throw new Error(`World info file ${filename} doesn't exist.`);
        }

        fs.unlinkSync(pathToWorldInfo);
        set.status = 204;
    })
    .post('/import', (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const file = (context as unknown as Record<string, unknown>).file as Record<string, unknown> | null;

        if (!file) {
            set.status = 400;
            return;
        }

        const filename = `${path.parse(sanitize(file.originalname as string)).name}.json`;

        let fileContents: string | null = null;

        if (body.convertedData) {
            fileContents = body.convertedData as string;
        } else {
            const pathToUpload = path.join(file.destination as string, file.filename as string);
            fileContents = fs.readFileSync(pathToUpload, 'utf8');
            fs.unlinkSync(pathToUpload);
        }

        try {
            const worldContent = JSON.parse(fileContents);
            if (!('entries' in worldContent)) {
                throw new Error('File must contain a world info entries list');
            }
        } catch {
            set.status = 400;
            return 'Is not a valid world info file';
        }

        const pathToNewFile = path.join(directories?.worlds ?? '', filename);
        const worldName = path.parse(pathToNewFile).name;

        if (!worldName) {
            set.status = 400;
            return 'World file must have a name';
        }

        writeFileAtomicSync(pathToNewFile, fileContents);
        return { name: worldName };
    })
    .post('/edit', (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const bodyAny = body as Record<string, unknown>;

        if (!bodyAny) {
            set.status = 400;
            return;
        }

        if (!bodyAny.name) {
            set.status = 400;
            return 'World file must have a name';
        }

        try {
            if (!('entries' in (bodyAny.data as Record<string, unknown>))) {
                throw new Error('World info must contain an entries list');
            }
        } catch {
            set.status = 400;
            return 'Is not a valid world info file';
        }

        const filename = sanitize(`${bodyAny.name as string}.json`);
        const pathToFile = path.join(directories?.worlds ?? '', filename);

        writeFileAtomicSync(pathToFile, JSON.stringify(bodyAny.data, null, 4));
        return { ok: true };
    });
