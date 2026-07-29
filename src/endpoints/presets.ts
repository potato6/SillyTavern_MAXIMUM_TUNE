import fsp from 'node:fs/promises';
import path from 'node:path';
import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import writeFileAtomic from 'write-file-atomic';

import { getDefaultPresetFile, getDefaultPresets } from './content-manager.js';

interface UserDirectories {
    koboldAI_Settings?: string;
    novelAI_Settings?: string;
    textGen_Settings?: string;
    openAI_Settings?: string;
    instruct?: string;
    context?: string;
    sysprompt?: string;
    reasoning?: string;
    [key: string]: unknown;
}

interface UserContext {
    directories?: UserDirectories;
    [key: string]: unknown;
}

interface PresetSettings {
    folder: string | null;
    extension: string | null;
}

/**
 * Gets the folder and extension for the preset settings based on the API source ID.
 */
function getPresetSettingsByAPI(
    apiId: string,
    directories: Record<string, string>,
): PresetSettings {
    switch (apiId) {
        case 'kobold':
        case 'koboldhorde':
            return { folder: directories.koboldAI_Settings ?? null, extension: '.json' };
        case 'novel':
            return { folder: directories.novelAI_Settings ?? null, extension: '.json' };
        case 'textgenerationwebui':
            return { folder: directories.textGen_Settings ?? null, extension: '.json' };
        case 'openai':
            return { folder: directories.openAI_Settings ?? null, extension: '.json' };
        case 'instruct':
            return { folder: directories.instruct ?? null, extension: '.json' };
        case 'context':
            return { folder: directories.context ?? null, extension: '.json' };
        case 'sysprompt':
            return { folder: directories.sysprompt ?? null, extension: '.json' };
        case 'reasoning':
            return { folder: directories.reasoning ?? null, extension: '.json' };
        default:
            return { folder: null, extension: null };
    }
}

export const router = new Elysia({ prefix: '/api/presets' })
    .post('/save', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const bodyAny = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

        if (!bodyAny || !bodyAny.preset) {
            set.status = 400;
            return;
        }

        const rawName = bodyAny.name;
        if (typeof rawName !== 'string' || rawName.length === 0) {
            set.status = 400;
            return;
        }

        const name = sanitize(rawName);
        if (name.length === 0) {
            set.status = 400;
            return;
        }

        const apiId = typeof bodyAny.apiId === 'string' ? bodyAny.apiId : '';
        const settings = getPresetSettingsByAPI(
            apiId,
            (directories ?? {}) as Record<string, string>,
        );

        if (!settings.folder || !settings.extension) {
            set.status = 400;
            return;
        }

        const filename = `${name}${settings.extension}`;
        const fullpath = path.join(settings.folder, filename);

        await writeFileAtomic(fullpath, JSON.stringify(bodyAny.preset, null, 4), 'utf-8');
        return { name };
    })
    .post('/delete', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const bodyAny = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

        if (!bodyAny) {
            set.status = 400;
            return;
        }

        const rawName = bodyAny.name;
        if (typeof rawName !== 'string' || rawName.length === 0) {
            set.status = 400;
            return;
        }

        const name = sanitize(rawName);
        if (name.length === 0) {
            set.status = 400;
            return;
        }

        const apiId = typeof bodyAny.apiId === 'string' ? bodyAny.apiId : '';
        const settings = getPresetSettingsByAPI(
            apiId,
            (directories ?? {}) as Record<string, string>,
        );

        if (!settings.folder || !settings.extension) {
            set.status = 400;
            return;
        }

        const filename = `${name}${settings.extension}`;
        const fullpath = path.join(settings.folder, filename);

        try {
            await fsp.unlink(fullpath);
            set.status = 204;
        } catch (err: any) {
            if (err?.code === 'ENOENT') {
                set.status = 404;
                return;
            }
            throw err;
        }
    })
    .post('/restore', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const bodyAny = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

        try {
            const apiId = typeof bodyAny?.apiId === 'string' ? bodyAny.apiId : '';
            const settings = getPresetSettingsByAPI(
                apiId,
                (directories ?? {}) as Record<string, string>,
            );

            const rawName = bodyAny?.name;
            const name = typeof rawName === 'string' ? sanitize(rawName) : '';

            const defaultPresets = getDefaultPresets(directories as any);
            let defaultPreset: Record<string, unknown> | undefined;

            const targetFolder = settings.folder;
            if (name.length > 0 && targetFolder) {
                for (let i = 0; i < defaultPresets.length; i++) {
                    const p = defaultPresets[i] as Record<string, unknown>;
                    if (p.name === name && p.folder === targetFolder) {
                        defaultPreset = p;
                        break;
                    }
                }
            }

            if (defaultPreset) {
                const presetFilename = defaultPreset.filename as string;
                const presetContent = (await getDefaultPresetFile(presetFilename)) || {};
                return { isDefault: true, preset: presetContent };
            }

            return { isDefault: false, preset: {} };
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    });
