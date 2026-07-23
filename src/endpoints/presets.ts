import fs from 'node:fs';
import path from 'node:path';
import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { getDefaultPresetFile, getDefaultPresets } from './content-manager.js';

/**
 * Gets the folder and extension for the preset settings based on the API source ID.
 */
function getPresetSettingsByAPI(apiId: string, directories: Record<string, string>) {
    switch (apiId) {
        case 'kobold':
        case 'koboldhorde':
            return { folder: directories.koboldAI_Settings, extension: '.json' };
        case 'novel':
            return { folder: directories.novelAI_Settings, extension: '.json' };
        case 'textgenerationwebui':
            return { folder: directories.textGen_Settings, extension: '.json' };
        case 'openai':
            return { folder: directories.openAI_Settings, extension: '.json' };
        case 'instruct':
            return { folder: directories.instruct, extension: '.json' };
        case 'context':
            return { folder: directories.context, extension: '.json' };
        case 'sysprompt':
            return { folder: directories.sysprompt, extension: '.json' };
        case 'reasoning':
            return { folder: directories.reasoning, extension: '.json' };
        default:
            return { folder: null, extension: null };
    }
}

export const router = new Elysia({ prefix: '/api/presets' })
    .post('/save', (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const bodyAny = body as Record<string, unknown> | null;

        const name = sanitize(bodyAny?.name as string);
        if (!bodyAny?.preset || !name) {
            set.status = 400;
            return;
        }

        const settings = getPresetSettingsByAPI(bodyAny.apiId as string, directories ?? {});
        const filename = name + settings.extension;

        if (!settings.folder) {
            set.status = 400;
            return;
        }

        const fullpath = path.join(settings.folder, filename);
        writeFileAtomicSync(fullpath, JSON.stringify(bodyAny.preset, null, 4), 'utf-8');
        return { name };
    })
    .post('/delete', (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const bodyAny = body as Record<string, unknown> | null;

        const name = sanitize(bodyAny?.name as string);
        if (!name) {
            set.status = 400;
            return;
        }

        const settings = getPresetSettingsByAPI(bodyAny?.apiId as string, directories ?? {});
        const filename = name + settings.extension;

        if (!settings.folder) {
            set.status = 400;
            return;
        }

        const fullpath = path.join(settings.folder, filename);

        if (fs.existsSync(fullpath)) {
            fs.unlinkSync(fullpath);
            set.status = 204;
        } else {
            set.status = 404;
        }
    })
    .post('/restore', (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<string, unknown> | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const bodyAny = body as Record<string, unknown> | null;

        try {
            const settings = getPresetSettingsByAPI(bodyAny?.apiId as string, directories ?? {});
            const name = sanitize(bodyAny?.name as string);
            const defaultPresets = getDefaultPresets(directories as any);

            const defaultPreset = defaultPresets.find(
                (p: Record<string, unknown>) => p.name === name && p.folder === settings.folder,
            );

            const result: Record<string, unknown> = { isDefault: false, preset: {} };

            if (defaultPreset) {
                result.isDefault = true;
                result.preset = getDefaultPresetFile((defaultPreset as Record<string, unknown>).filename as string) || {};
            }

            return result;
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    });
