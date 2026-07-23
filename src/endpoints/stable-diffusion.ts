import fs from 'node:fs';
import path from 'node:path';

import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import { unset } from 'es-toolkit/compat';
import mime from 'mime-types';

import { delay, getBasicAuthHeader, isValidUrl, tryParse } from '../util.js';
import { readSecret, SECRET_KEYS } from './secrets.js';
import { getFileNameValidationFunction } from '../middleware/validateFileName.js';
import { AIMLAPI_HEADERS } from '../constants.js';

/**
 * Gets the comfy workflows.
 * @param {import('../users.js').UserDirectoryList} directories - User directories
 * @returns {string[]} List of comfy workflows
 */
function getComfyWorkflows(directories: import('../users.js').UserDirectoryList) {
    return fs
        .readdirSync(directories.comfyWorkflows)
        .filter((file) => file[0] !== '.' && file.toLowerCase().endsWith('.json'))
        .toSorted(Intl.Collator().compare);
}

export const router = new Elysia({ prefix: '/api/sd' });

router.post('/ping', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const url = new URL((body.url as string));
        url.pathname = '/sdapi/v1/options';

        const result = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: getBasicAuthHeader(body.auth),
            },
        });

        if (!result.ok) {
            throw new Error('SD WebUI returned an error.');
        }

        set.status = 200;
        return;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

router.post('/upscalers', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        /**
         *
         */
        async function getUpscalerModels() {
            const url = new URL((body.url as string));
            url.pathname = '/sdapi/v1/upscalers';

            const result = await fetch(url, {
                method: 'GET',
                headers: {
                    Authorization: getBasicAuthHeader(body.auth),
                },
            });

            if (!result.ok) {
                throw new Error('SD WebUI returned an error.');
            }

            const data = (await result.json()) as { name: string }[];
            return data.map((x) => x.name);
        }

        /**
         *
         */
        async function getLatentUpscalers() {
            const url = new URL((body.url as string));
            url.pathname = '/sdapi/v1/latent-upscale-modes';

            const result = await fetch(url, {
                method: 'GET',
                headers: {
                    Authorization: getBasicAuthHeader(body.auth),
                },
            });

            if (!result.ok) {
                throw new Error('SD WebUI returned an error.');
            }

            const data = (await result.json()) as { name: string }[];
            return data.map((x) => x.name);
        }

        const [upscalers, latentUpscalers] = await Promise.all([
            getUpscalerModels(),
            getLatentUpscalers(),
        ]);

        // 0 = None, then Latent Upscalers, then Upscalers
        upscalers.splice(1, 0, ...latentUpscalers);

        return upscalers;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

router.post('/vaes', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const autoUrl = new URL((body.url as string));
        autoUrl.pathname = '/sdapi/v1/sd-vae';
        const forgeUrl = new URL((body.url as string));
        forgeUrl.pathname = '/sdapi/v1/sd-modules';

        const requestInit = {
            method: 'GET',
            headers: {
                Authorization: getBasicAuthHeader(body.auth),
            },
        };
        const results = await Promise.allSettled([
            fetch(autoUrl, requestInit).then((r) =>
                r.ok ? r.json() : Promise.reject(r.statusText),
            ),
            fetch(forgeUrl, requestInit).then((r) =>
                r.ok ? r.json() : Promise.reject(r.statusText),
            ),
        ]);

        const data = results.find((r) => r.status === 'fulfilled')?.value;

        if (!Array.isArray(data)) {
            throw new Error('SD WebUI returned an error.');
        }

        const names = data.map((x) => x.model_name);
        return names;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

router.post('/samplers', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const url = new URL((body.url as string));
        url.pathname = '/sdapi/v1/samplers';

        const result = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: getBasicAuthHeader(body.auth),
            },
        });

        if (!result.ok) {
            throw new Error('SD WebUI returned an error.');
        }

        const data = (await result.json()) as { name: string }[];
        const names = data.map((x) => x.name);
        return names;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

router.post('/schedulers', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const url = new URL((body.url as string));
        url.pathname = '/sdapi/v1/schedulers';

        const result = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: getBasicAuthHeader(body.auth),
            },
        });

        if (!result.ok) {
            throw new Error('SD WebUI returned an error.');
        }

        const data = (await result.json()) as { name: string }[];
        const names = data.map((x) => x.name);
        return names;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

router.post('/models', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const url = new URL((body.url as string));
        url.pathname = '/sdapi/v1/sd-models';

        const result = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: getBasicAuthHeader(body.auth),
            },
        });

        if (!result.ok) {
            throw new Error('SD WebUI returned an error.');
        }

        const data = (await result.json()) as { title: string }[];
        const models = data.map((x) => ({
            value: x.title,
            text: x.title,
        }));
        return models;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

router.post('/get-model', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const url = new URL((body.url as string));
        url.pathname = '/sdapi/v1/options';

        const result = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: getBasicAuthHeader(body.auth),
            },
        });
        const data = (await result.json()) as { sd_model_checkpoint: string };
        return data.sd_model_checkpoint;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

router.post('/set-model', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        /**
         *
         */
        async function getProgress() {
            const url = new URL((body.url as string));
            url.pathname = '/sdapi/v1/progress';

            const result = await fetch(url, {
                method: 'GET',
                headers: {
                    Authorization: getBasicAuthHeader(body.auth),
                },
            });
            return await result.json();
        }

        const url = new URL((body.url as string));
        url.pathname = '/sdapi/v1/options';

        const options = {
            sd_model_checkpoint: body.model,
        };

        const result = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(options),
            headers: {
                'Content-Type': 'application/json',
                Authorization: getBasicAuthHeader(body.auth),
            },
        });

        if (!result.ok) {
            throw new Error('SD WebUI returned an error.');
        }

        const MAX_ATTEMPTS = 10;
        const CHECK_INTERVAL = 2000;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const progressState = (await getProgress()) as {
                progress: number;
                state: { job_count: number };
            };

            const progress = progressState.progress;
            const jobCount = progressState.state.job_count;
            if (progress === 0.0 && jobCount === 0) {
                break;
            }

            console.info(
                `Waiting for SD WebUI to finish model loading... Progress: ${progress}; Job count: ${jobCount}`,
            );
            await delay(CHECK_INTERVAL);
        }

        set.status = 200;
        return;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

router.post('/generate', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    const response = context as any;
    try {
        try {
            const optionsUrl = new URL((body.url as string));
            optionsUrl.pathname = '/sdapi/v1/options';
            const optionsResult = await fetch(optionsUrl, {
                headers: { Authorization: getBasicAuthHeader(body.auth) },
            });
            if (optionsResult.ok) {
                const optionsData = (await optionsResult.json()) as Record<string, unknown>;
                const isForge = 'forge_preset' in optionsData;

                if (!isForge) {
                    unset(body, 'override_settings.forge_additional_modules');
                }
            }
        } catch (error) {
            console.error('SD WebUI failed to get options:', error);
        }

        const controller = new AbortController();
        (req as any).socket.removeAllListeners('close');
        (req as any).socket.on('close', function () {
            if (!response.writableEnded) {
                const interruptUrl = new URL((body.url as string));
                interruptUrl.pathname = '/sdapi/v1/interrupt';
                fetch(interruptUrl, {
                    method: 'POST',
                    headers: { Authorization: getBasicAuthHeader(body.auth) },
                });
            }
            controller.abort();
        });

        console.debug('SD WebUI request:', body);
        const txt2imgUrl = new URL((body.url as string));
        txt2imgUrl.pathname = '/sdapi/v1/txt2img';
        const result = await fetch(txt2imgUrl, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: {
                'Content-Type': 'application/json',
                Authorization: getBasicAuthHeader(body.auth),
            },
            signal: controller.signal,
        });

        if (!result.ok) {
            const text = await result.text();
            throw new Error('SD WebUI returned an error.', { cause: text });
        }

        const data = await result.json();
        return data;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

router.post('/sd-next/upscalers', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const url = new URL((body.url as string));
        url.pathname = '/sdapi/v1/upscalers';

        const result = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: getBasicAuthHeader(body.auth),
            },
        });

        if (!result.ok) {
            throw new Error('SD WebUI returned an error.');
        }

        // Vlad doesn't provide Latent Upscalers in the API, so we have to hardcode them here
        const latentUpscalers = [
            'Latent',
            'Latent (antialiased)',
            'Latent (bicubic)',
            'Latent (bicubic antialiased)',
            'Latent (nearest)',
            'Latent (nearest-exact)',
        ];

        const data = (await result.json()) as { name: string }[];
        const names = data.map((x) => x.name);

        // 0 = None, then Latent Upscalers, then Upscalers
        names.splice(1, 0, ...latentUpscalers);

        return names;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

const comfy = new Elysia();

comfy.post('/ping', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const url = new URL((body.url as string).replace(/\/+$/, '') + '/system_stats');

        const result = await fetch(url);
        if (!result.ok) {
            throw new Error('ComfyUI returned an error.');
        }

        set.status = 200;
        return;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

comfy.post('/samplers', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const url = new URL((body.url as string).replace(/\/+$/, '') + '/object_info');

        const result = await fetch(url);
        if (!result.ok) {
            throw new Error('ComfyUI returned an error.');
        }

        const data = (await result.json()) as {
            KSampler: { input: { required: { sampler_name: [string[]] } } };
        };
        return data.KSampler.input.required.sampler_name[0];
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

comfy.post('/models', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const url = new URL((body.url as string).replace(/\/+$/, '') + '/object_info');

        const result = await fetch(url);
        if (!result.ok) {
            throw new Error('ComfyUI returned an error.');
        }
        const data = (await result.json()) as {
            CheckpointLoaderSimple: { input: { required: { ckpt_name: [string[]] } } };
            UNETLoader: { input: { required: { unet_name: [string[]] } } };
            UnetLoaderGGUF?: { input: { required: { unet_name: [string[]] } } };
        };

        const ckpts =
            data.CheckpointLoaderSimple.input.required.ckpt_name[0].map((it) => ({
                value: it,
                text: it,
            })) || [];
        const unets =
            data.UNETLoader.input.required.unet_name[0].map((it) => ({
                value: it,
                text: `UNet: ${it}`,
            })) || [];

        // load list of GGUF unets from diffusion_models if the loader node is available
        const ggufs =
            data.UnetLoaderGGUF?.input.required.unet_name[0].map((it) => ({
                value: it,
                text: `GGUF: ${it}`,
            })) || [];
        const models = [...ckpts, ...unets, ...ggufs];

        // make the display names of the models somewhat presentable
        models.forEach((it) => (it.text = it.text.replace(/\.[^.]*$/, '').replace(/_/g, ' ')));

        return models;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

comfy.post('/schedulers', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const url = new URL((body.url as string).replace(/\/+$/, '') + '/object_info');

        const result = await fetch(url);
        if (!result.ok) {
            throw new Error('ComfyUI returned an error.');
        }

        const data = (await result.json()) as {
            KSampler: { input: { required: { scheduler: [string[]] } } };
        };
        return data.KSampler.input.required.scheduler[0];
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

comfy.post('/vaes', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const url = new URL((body.url as string).replace(/\/+$/, '') + '/object_info');

        const result = await fetch(url);
        if (!result.ok) {
            throw new Error('ComfyUI returned an error.');
        }

        const data = (await result.json()) as {
            VAELoader: { input: { required: { vae_name: [string[]] } } };
        };
        return data.VAELoader.input.required.vae_name[0];
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

comfy.post('/workflows', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const data = getComfyWorkflows(user.directories);
        return data;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

comfy.post('/workflow', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        let filePath = path.join(user.directories.comfyWorkflows, sanitize(String(body.file_name)));
        if (!fs.existsSync(filePath)) {
            filePath = path.join(user.directories.comfyWorkflows, 'Default_Comfy_Workflow.json');
        }
        const data = fs.readFileSync(filePath, { encoding: 'utf-8' });
        return JSON.stringify(data);
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

comfy.post('/save-workflow', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const filePath = path.join(
            user.directories.comfyWorkflows,
            sanitize(String(body.file_name)),
        );
        writeFileAtomicSync(filePath, body.workflow as string, 'utf8');
        const data = getComfyWorkflows(user.directories);
        return data;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

comfy.post('/delete-workflow', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const filePath = path.join(
            user.directories.comfyWorkflows,
            sanitize(String(body.file_name)),
        );
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        set.status = 200;
        return;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

comfy.post(
    '/rename-workflow',
    async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
        try {
            const oldName = sanitize(String(body.old_name));
            const newName = sanitize(String(body.new_name));

            if (
                path.extname(oldName).toLowerCase() !== '.json' ||
                path.extname(newName).toLowerCase() !== '.json'
            ) {
                set.status = 400; return 'Only JSON workflow files are allowed';
            }

            const oldPath = path.join(user.directories.comfyWorkflows, oldName);
            const newPath = path.join(user.directories.comfyWorkflows, newName);

            if (!fs.existsSync(oldPath)) {
                set.status = 404; return 'Workflow not found';
            }

            if (fs.existsSync(newPath)) {
                set.status = 409; return 'A workflow with that name already exists';
            }

            fs.renameSync(oldPath, newPath);
            set.status = 204; return;
        } catch (error) {
            console.error('ComfyUI workflow rename failed', error);
            set.status = 500;
            return;
        }
    },
    {
        beforeHandle: [
            (ctx: any) => {
                const fn = getFileNameValidationFunction('old_name');
                const req = ctx as any;
                req.body = ctx.body;
                return fn(ctx as any, {} as any, () => {});
            },
            (ctx: any) => {
                const fn = getFileNameValidationFunction('new_name');
                const req = ctx as any;
                req.body = ctx.body;
                return fn(ctx as any, {} as any, () => {});
            },
        ],
    },
);

interface ComfyHistoryItem {
    status: {
        status_str: string;
        messages?: Array<
            [
                string,
                {
                    node_type: string;
                    node_id: string;
                    exception_type: string;
                    exception_message: string;
                },
            ]
        >;
    };
    outputs: Record<
        string,
        {
            images?: Array<{ filename: string; subfolder: string; type: string }>;
            gifs?: Array<{ filename: string; subfolder: string; type: string }>;
        }
    >;
}

comfy.post('/generate', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    const response = context as any;
    try {
        let item: ComfyHistoryItem | undefined;
        const url = new URL((body.url as string).replace(/\/+$/, '') + '/prompt');

        const controller = new AbortController();
        (req as any).socket.removeAllListeners('close');
        (req as any).socket.on('close', function () {
            if (!response.writableEnded && !item) {
                const interruptUrl = new URL((body.url as string).replace(/\/+$/, '') + '/interrupt');
                fetch(interruptUrl, {
                    method: 'POST',
                    headers: { Authorization: getBasicAuthHeader(body.auth) },
                });
            }
            controller.abort();
        });

        const promptResult = await fetch(url, {
            method: 'POST',
            body: body.prompt as unknown as string,
        });
        if (!promptResult.ok) {
            const text = await promptResult.text();
            throw new Error('ComfyUI returned an error.', { cause: tryParse(text) });
        }

        const data = (await promptResult.json()) as { prompt_id: string };
        const id = data.prompt_id;
        const historyUrl = new URL((body.url as string).replace(/\/+$/, '') + '/history');
        while (true) {
            const result = await fetch(historyUrl);
            if (!result.ok) {
                throw new Error('ComfyUI returned an error.');
            }
            const history = (await result.json()) as Record<string, ComfyHistoryItem>;
            item = history[id];
            if (item) {
                break;
            }
            await delay(100);
        }
        if (item.status.status_str === 'error') {
            // Report node tracebacks if available
            const errorMessages =
                item.status?.messages
                    ?.filter((it: [string, unknown]) => it[0] === 'execution_error')
                    .map(
                        (
                            it: [
                                string,
                                {
                                    node_type: string;
                                    node_id: string;
                                    exception_type: string;
                                    exception_message: string;
                                },
                            ],
                        ) => it[1],
                    )
                    .map(
                        (it) =>
                            `${it.node_type} [${it.node_id}] ${it.exception_type}: ${it.exception_message}`,
                    )
                    .join('\n') || '';
            throw new Error(`ComfyUI generation did not succeed.\n\n${errorMessages}`.trim());
        }
        const outputs = Object.keys(item.outputs).map((it) => item.outputs[it]);
        console.debug('ComfyUI outputs:', outputs);
        const imgInfo =
            outputs.flatMap((it: any) => it.images)[0] ?? outputs.flatMap((it: any) => it.gifs)[0];
        if (!imgInfo) {
            throw new Error('ComfyUI did not return any recognizable outputs.');
        }
        const imgUrl = new URL((body.url as string).replace(/\/+$/, '') + '/view');
        imgUrl.search = `?filename=${imgInfo.filename}&subfolder=${imgInfo.subfolder}&type=${imgInfo.type}`;
        const imgResponse = await fetch(imgUrl);
        if (!imgResponse.ok) {
            throw new Error('ComfyUI returned an error.');
        }
        const format = path.extname(imgInfo.filename).slice(1).toLowerCase() || 'png';
        const imgBuffer = await imgResponse.arrayBuffer();
        return { format: format, data: Buffer.from(imgBuffer).toString('base64') };
    } catch (error) {
        console.error('ComfyUI error:', error);
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        set.status = 500; return error.message;
    }
});

const comfyRunPod = new Elysia();

comfyRunPod.post('/ping', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const key = readSecret(user.directories, SECRET_KEYS.COMFY_RUNPOD);

        if (!key) {
            console.warn('RunPod key not found.');
            set.status = 400;
            return;
        }

        const url = new URL((body.url as string).replace(/\/+$/, '') + '/health');

        const result = await fetch(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${key}` },
        });
        if (!result.ok) {
            throw new Error('ComfyUI returned an error.');
        }
        const data = (await result.json()) as { workers: { ready: number } };
        if (data.workers.ready <= 0) {
            console.warn(`No workers reported as ready. ${result}`);
        }

        set.status = 200;
        return;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

comfyRunPod.post('/generate', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    const response = context as any;
    try {
        const key = readSecret(user.directories, SECRET_KEYS.COMFY_RUNPOD);

        if (!key) {
            console.warn('RunPod key not found.');
            set.status = 400;
            return;
        }

        // eslint-disable-next-line prefer-const
        let jobId: string | undefined;
        let item: { filename: string; data: string } | undefined;
        const url = new URL((body.url as string).replace(/\/+$/, '') + '/run');

        const controller = new AbortController();
        (req as any).socket.removeAllListeners('close');
        (req as any).socket.on('close', function () {
            if (!response.writableEnded && !item) {
                const interruptUrl = new URL((body.url as string).replace(/\/+$/, '') + `/cancel/${jobId}`);
                fetch(interruptUrl, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${key}` },
                });
            }
            controller.abort();
        });
        const workflow = JSON.parse((body.prompt as string)).prompt;
        const wrappedWorkflow = workflow?.input?.workflow
            ? workflow
            : { input: { workflow: workflow } };
        const runpodPrompt = JSON.stringify(wrappedWorkflow);

        console.debug('ComfyUI RunPod request:', wrappedWorkflow);

        const promptResult = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}` },
            body: runpodPrompt,
        });
        if (!promptResult.ok) {
            const text = await promptResult.text();
            throw new Error('ComfyUI returned an error.', { cause: tryParse(text) });
        }

        const data = (await promptResult.json()) as { id: string };
        jobId = data.id;
        const statusUrl = new URL((body.url as string).replace(/\/+$/, '') + `/status/${jobId}`);
        while (true) {
            const result = await fetch(statusUrl, {
                method: 'GET',
                headers: { Authorization: `Bearer ${key}` },
            });
            if (!result.ok) {
                throw new Error('ComfyUI returned an error.');
            }
            const status = (await result.json()) as {
                output?: { images: Array<{ filename: string; data: string }> };
            };
            if (status.output) {
                item = status.output.images[0];
            }
            if (item) {
                break;
            }
            await delay(500);
        }
        const format = path.extname(item.filename).slice(1).toLowerCase() || 'png';
        return { format: format, data: item.data };
    } catch (error) {
        console.error('ComfyUI error:', error);
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        set.status = 500; return error.message;
    }
});

const together = new Elysia();

together.post('/models', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const key = readSecret(user.directories, SECRET_KEYS.TOGETHERAI);

        if (!key) {
            console.warn('TogetherAI key not found.');
            set.status = 400;
            return;
        }

        const modelsResponse = await fetch('https://api.together.xyz/api/models', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${key}`,
            },
        });

        if (!modelsResponse.ok) {
            console.warn('TogetherAI returned an error.');
            set.status = 500;
            return;
        }

        const data = await modelsResponse.json();

        if (!Array.isArray(data)) {
            console.warn('TogetherAI returned invalid data.');
            set.status = 500;
            return;
        }

        const models = data
            .filter((x) => x.type === 'image')
            .map((x) => ({ value: x.id, text: x.display_name }));

        return models;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

together.post('/generate', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const key = readSecret(user.directories, SECRET_KEYS.TOGETHERAI);

        if (!key) {
            console.warn('TogetherAI key not found.');
            set.status = 400;
            return;
        }

        console.debug('TogetherAI request:', body);

        const result = await fetch('https://api.together.xyz/v1/images/generations', {
            method: 'POST',
            body: JSON.stringify({
                prompt: body.prompt,
                negative_prompt: body.negative_prompt,
                height: body.height,
                width: body.width,
                model: body.model,
                steps: body.steps,
                n: 1,
                // Limited to 10000 on playground, works fine with more.
                seed: (body.seed as number) >= 0 ? (body.seed as number) : Math.floor(Math.random() * 10_000_000),
            }),
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
            },
        });

        if (!result.ok) {
            console.warn('TogetherAI returned an error.', { body: await result.text() });
            set.status = 500;
            return;
        }

        const data = (await result.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
        console.debug('TogetherAI response:', data);

        const choice = data?.data?.[0];
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        let b64_json = choice.b64_json;

        if (!b64_json) {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            const buffer = await (await fetch(choice.url)).arrayBuffer();
            b64_json = Buffer.from(buffer).toString('base64');
        }

        return { format: 'jpg', data: b64_json };
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

const sdcpp = new Elysia();

sdcpp.post('/ping', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const url = new URL((body.url as string).replace(/\/+$/, '') + '/v1/images/generations');

        const result = await fetch(url, { method: 'OPTIONS' });
        if (!result.ok) {
            throw new Error('stable-diffusion.cpp server returned an error.');
        }

        set.status = 200;
        return;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

sdcpp.post('/models', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const url = new URL((body.url as string).replace(/\/+$/, '') + '/v1/models');

        const result = await fetch(url);
        if (!result.ok) {
            throw new Error('stable-diffusion.cpp server returned an error.');
        }

        const data = await result.json();
        return data;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

sdcpp.post('/generate', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const url = new URL((body.url as string).replace(/\/+$/, '') + '/sdapi/v1/txt2img');

        const payload = {
            model: body.model,
            prompt: body.prompt,
            negative_prompt: body.negative_prompt,
            width: body.width,
            height: body.height,
            steps: body.steps,
            cfg_scale: body.cfg_scale,
            seed: body.seed,
            batch_size: body.batch_size,
            sampler_name: body.sampler_name,
            scheduler: body.scheduler,
            // sd.cpp produces blank images when clip_skip is 1, which is the
            // default (no skipping). Only send clip_skip when it's > 1.
            clip_skip: (body.clip_skip as number) > 1 ? (body.clip_skip as number) : undefined,
        };

        for (const [key, value] of Object.entries(payload)) {
            if (value === undefined || value === null || value === '') {
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                delete payload[key];
            }
        }

        console.debug('stable-diffusion.cpp request:', payload);

        const result = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!result.ok) {
            const text = await result.text();
            throw new Error('stable-diffusion.cpp server returned an error.', { cause: text });
        }

        const data = await result.json();
        return data;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

const drawthings = new Elysia();

drawthings.post('/ping', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const url = new URL((body.url as string));
        url.pathname = '/';

        const result = await fetch(url, {
            method: 'HEAD',
        });

        if (!result.ok) {
            throw new Error('SD DrawThings API returned an error.');
        }

        set.status = 200;
        return;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

drawthings.post('/get-model', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const url = new URL((body.url as string));
        url.pathname = '/';

        const result = await fetch(url, {
            method: 'GET',
        });

        const data = (await result.json()) as { model: string };

        return data.model;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

drawthings.post('/get-upscaler', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const url = new URL((body.url as string));
        url.pathname = '/';

        const result = await fetch(url, {
            method: 'GET',
        });

        const data = (await result.json()) as { upscaler: string };

        return data.upscaler;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

drawthings.post('/generate', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        console.debug('SD DrawThings API request:', body);

        const url = new URL((body.url as string));
        url.pathname = '/sdapi/v1/txt2img';

        const requestBody = { ...body };
        const auth = getBasicAuthHeader(requestBody.auth);
        delete requestBody.url;
        delete requestBody.auth;

        const result = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(requestBody),
            headers: {
                'Content-Type': 'application/json',
                Authorization: auth,
            },
        });

        if (!result.ok) {
            const text = await result.text();
            throw new Error('SD DrawThings API returned an error.', { cause: text });
        }

        const data = await result.json();
        return data;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

const pollinations = new Elysia();

pollinations.post('/models', async ({ set }) => {
    try {
        const modelsUrl = new URL('https://gen.pollinations.ai/image/models');
        const result = await fetch(modelsUrl);

        if (!result.ok) {
            console.warn('Pollinations returned an error.', result.status, result.statusText);
            throw new Error('Pollinations request failed.');
        }

        const data = await result.json();

        if (!Array.isArray(data)) {
            console.warn('Pollinations returned invalid data.');
            throw new Error('Pollinations request failed.');
        }

        const models = data.map((x) => ({ value: x.name, text: x.name }));
        return models;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

pollinations.post('/generate', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const key = readSecret(user.directories, SECRET_KEYS.POLLINATIONS);
        if (!key) {
            console.warn('Pollinations API key not found.');
            set.status = 400;
            return;
        }

        const promptUrl = new URL(
            `https://gen.pollinations.ai/image/${encodeURIComponent((body.prompt as string))}`,
        );
        const params = new URLSearchParams({
            model: String(body.model),
            negative_prompt: String(body.negative_prompt),
            seed: String((body.seed as number) >= 0 ? (body.seed as number) : Math.floor(Math.random() * 10_000_000)),
            width: String(body.width ?? 1024),
            height: String(body.height ?? 1024),
        });
        if (body.enhance) {
            params.set('enhance', String(true));
        }
        promptUrl.search = params.toString();

        console.info('Pollinations request URL:', promptUrl.toString());

        const result = await fetch(promptUrl, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${key}`,
            },
        });

        if (!result.ok) {
            const text = await result.text();
            console.warn('Pollinations returned an error.', text);
            throw new Error('Pollinations request failed.');
        }

        const format = result.headers.get('Content-Type')?.toString() || 'image/jpeg';
        const buffer = await result.arrayBuffer();
        return {
            image: Buffer.from(buffer).toString('base64'),
            format: mime.extension(format) || 'jpg',
        };
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

const stability = new Elysia();

stability.post('/generate', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const key = readSecret(user.directories, SECRET_KEYS.STABILITY);

        if (!key) {
            console.warn('Stability AI key not found.');
            set.status = 400;
            return;
        }

        const payload = body.payload as Record<string, unknown>;
        const model = body.model as string;

        console.debug('Stability AI request:', model, payload);

        const formData = new FormData();
        for (const [key, value] of Object.entries(payload)) {
            if (value !== undefined) {
                formData.append(key, String(value));
            }
        }

        let apiUrl;
        switch (model) {
            case 'stable-image-ultra':
                apiUrl = 'https://api.stability.ai/v2beta/stable-image/generate/ultra';
                break;
            case 'stable-image-core':
                apiUrl = 'https://api.stability.ai/v2beta/stable-image/generate/core';
                break;
            case 'stable-diffusion-3':
                apiUrl = 'https://api.stability.ai/v2beta/stable-image/generate/sd3';
                break;
            default:
                throw new Error('Invalid Stability AI model selected');
        }

        const result = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${key}`,
                Accept: 'image/*',
            },
            body: formData,
        });

        if (!result.ok) {
            const text = await result.text();
            console.warn('Stability AI returned an error.', result.status, result.statusText, text);
            set.status = 500;
            return;
        }

        const buffer = await result.arrayBuffer();
        return Buffer.from(buffer).toString('base64');
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

const huggingface = new Elysia();

huggingface.post('/generate', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const key = readSecret(user.directories, SECRET_KEYS.HUGGINGFACE);

        if (!key) {
            console.warn('Hugging Face key not found.');
            set.status = 400;
            return;
        }

        console.debug('Hugging Face request:', body);

        const result = await fetch(`https://api-inference.huggingface.co/models/${body.model}`, {
            method: 'POST',
            body: JSON.stringify({
                inputs: body.prompt,
            }),
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
            },
        });

        if (!result.ok) {
            console.warn('Hugging Face returned an error.');
            set.status = 500;
            return;
        }

        const buffer = await result.arrayBuffer();
        return {
            image: Buffer.from(buffer).toString('base64'),
        };
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

const electronhub = new Elysia();

electronhub.post('/models', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const key = readSecret(user.directories, SECRET_KEYS.ELECTRONHUB);

        if (!key) {
            console.warn('Electron Hub key not found.');
            set.status = 400;
            return;
        }

        const modelsResponse = await fetch('https://api.electronhub.ai/v1/models', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
        });

        if (!modelsResponse.ok) {
            console.warn('Electron Hub returned an error.');
            set.status = 500;
            return;
        }

        const data = (await modelsResponse.json()) as {
            data?: Array<{ id: string; name: string; endpoints: string[] }>;
        };

        if (!Array.isArray(data?.data)) {
            console.warn('Electron Hub returned invalid data.');
            set.status = 500;
            return;
        }

        const models = data.data
            .filter(
                (x) =>
                    x &&
                    Array.isArray(x.endpoints) &&
                    x.endpoints.includes('/v1/images/generations'),
            )
            .map((x) => ({
                ...x,
                value: x.id,
                text: x.name,
            }));
        return models;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

electronhub.post('/generate', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const key = readSecret(user.directories, SECRET_KEYS.ELECTRONHUB);

        if (!key) {
            console.warn('Electron Hub key not found.');
            set.status = 400;
            return;
        }

        const bodyParams = {
            model: body.model,
            prompt: body.prompt,
            response_format: 'b64_json',
        };

        if (body.size) {
            // @ts-expect-error TS(2339) FIXME: Property 'size' does not exist on type '{ model: a... Remove this comment to see the full error message
            bodyParams.size = body.size;
        }

        if (body.quality) {
            // @ts-expect-error TS(2339) FIXME: Property 'quality' does not exist on type '{ model... Remove this comment to see the full error message
            bodyParams.quality = body.quality;
        }

        console.debug('Electron Hub request:', bodyParams);

        const result = await fetch('https://api.electronhub.ai/v1/images/generations', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ...bodyParams,
            }),
        });

        if (!result.ok) {
            const errorText = await result.text();
            console.warn(
                'Electron Hub returned an error.',
                result.status,
                result.statusText,
                errorText,
            );
            set.status = 500;
            return;
        }

        const data = (await result.json()) as { data?: Array<{ b64_json?: string }> };
        const image = data?.data?.[0]?.b64_json;

        if (!image) {
            console.warn('Electron Hub returned invalid data.');
            set.status = 500;
            return;
        }

        return { image };
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

electronhub.post('/sizes', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    const result = await fetch(`https://api.electronhub.ai/v1/models/${body.model}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    if (!result.ok) {
        console.warn('Electron Hub returned an error.');
        set.status = 500;
        return;
    }

    const data = (await result.json()) as { sizes?: unknown };
    const sizes = data.sizes;

    if (!sizes) {
        console.warn('Electron Hub returned invalid data.');
        set.status = 500;
        return;
    }

    return { sizes };
});

const chutes = new Elysia();

chutes.post('/models', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const key = readSecret(user.directories, SECRET_KEYS.CHUTES);

        if (!key) {
            console.warn('Chutes key not found.');
            set.status = 400;
            return;
        }

        const modelsResponse = await fetch(
            'https://api.chutes.ai/chutes/?template=diffusion&include_public=true&limit=999',
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${key}`,
                    'Content-Type': 'application/json',
                },
            },
        );

        if (!modelsResponse.ok) {
            console.warn('Chutes returned an error.');
            set.status = 500;
            return;
        }

        const data = (await modelsResponse.json()) as { items: Array<{ name: string }> };
        const models = data.items
            .map((x) => ({
                value: x.name,
                text: x.name,
            }))
            .toSorted((a, b) => a?.text?.localeCompare(b?.text));
        return models;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

chutes.post('/generate', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const key = readSecret(user.directories, SECRET_KEYS.CHUTES);

        if (!key) {
            console.warn('Chutes key not found.');
            set.status = 400;
            return;
        }

        const bodyParams = {
            model: body.model,
            prompt: body.prompt,
            negative_prompt: body.negative_prompt,
            guidance_scale: body.guidance_scale || 7.0,
            width: body.width || 1024,
            height: body.height || 1024,
            num_inference_steps: body.steps || 10,
        };

        console.debug('Chutes request:', bodyParams);

        const result = await fetch('https://image.chutes.ai/generate', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(bodyParams),
        });

        if (!result.ok) {
            const text = await result.text();
            console.warn('Chutes returned an error:', text);
            set.status = 500;
            return;
        }

        const buffer = await result.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');

        return { image: base64 };
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

const nanogpt = new Elysia();

nanogpt.post('/models', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const key = readSecret(user.directories, SECRET_KEYS.NANOGPT);

        if (!key) {
            console.warn('NanoGPT key not found.');
            set.status = 400;
            return;
        }

        const modelsResponse = await fetch('https://nano-gpt.com/api/models', {
            method: 'GET',
            headers: {
                'x-api-key': key,
                'Content-Type': 'application/json',
            },
        });

        if (!modelsResponse.ok) {
            console.warn('NanoGPT returned an error.');
            set.status = 500;
            return;
        }

        const data = (await modelsResponse.json()) as {
            models?: { image?: Record<string, { model: string; name: string }> };
        };
        const imageModels = data?.models?.image;

        if (!imageModels || typeof imageModels !== 'object') {
            console.warn('NanoGPT returned invalid data.');
            set.status = 500;
            return;
        }

        const models = Object.values(imageModels).map((x) => ({ value: x.model, text: x.name }));
        return models;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

nanogpt.post('/generate', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const key = readSecret(user.directories, SECRET_KEYS.NANOGPT);

        if (!key) {
            console.warn('NanoGPT key not found.');
            set.status = 400;
            return;
        }

        console.debug('NanoGPT request:', body);

        const result = await fetch('https://nano-gpt.com/api/generate-image', {
            method: 'POST',
            body: JSON.stringify(body),
            headers: {
                'x-api-key': key,
                'Content-Type': 'application/json',
            },
        });

        if (!result.ok) {
            console.warn('NanoGPT returned an error.');
            set.status = 500;
            return;
        }

        const data = (await result.json()) as { data?: Array<{ b64_json?: string }> };

        const image = data?.data?.[0]?.b64_json;
        if (!image) {
            console.warn('NanoGPT returned invalid data.');
            set.status = 500;
            return;
        }

        return { image };
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

const bfl = new Elysia();

bfl.post('/generate', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const key = readSecret(user.directories, SECRET_KEYS.BFL);

        if (!key) {
            console.warn('BFL key not found.');
            set.status = 400;
            return;
        }

        const requestBody = {
            prompt: body.prompt,
            steps: body.steps,
            guidance: body.guidance,
            width: body.width,
            height: body.height,
            prompt_upsampling: body.prompt_upsampling,
            seed: body.seed ?? null,
            safety_tolerance: 6, // being least strict
            output_format: 'jpeg',
        };

        /**
         * Returns the closest aspect ratio string within valid bounds.
         * @param width - Image width in pixels
         * @param height - Image height in pixels
         * @returns Aspect ratio string
         */
        function getClosestAspectRatio(width: number, height: number) {
            const minAspect = 9 / 21;
            const maxAspect = 21 / 9;
            const currentAspect = width / height;

            const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
            const simplifyRatio = (w: number, h: number) => {
                const divisor = gcd(w, h);
                return `${w / divisor}:${h / divisor}`;
            };

            if (currentAspect < minAspect) {
                const adjustedHeight = Math.round(width / minAspect);
                return simplifyRatio(width, adjustedHeight);
            } else if (currentAspect > maxAspect) {
                const adjustedWidth = Math.round(height * maxAspect);
                return simplifyRatio(adjustedWidth, height);
            } else {
                return simplifyRatio(width, height);
            }
        }

        if (String(body.model).endsWith('-ultra')) {
            // @ts-expect-error TS(2339) FIXME: Property 'aspect_ratio' does not exist on type '{ ... Remove this comment to see the full error message
            requestBody.aspect_ratio = getClosestAspectRatio(body.width, body.height);
            delete requestBody.steps;
            delete requestBody.guidance;
            delete requestBody.width;
            delete requestBody.height;
            delete requestBody.prompt_upsampling;
        }

        if (String(body.model).endsWith('-pro-1.1')) {
            delete requestBody.steps;
            delete requestBody.guidance;
        }

        console.debug('BFL request:', requestBody);

        const result = await fetch(`https://api.bfl.ml/v1/${body.model}`, {
            method: 'POST',
            body: JSON.stringify(requestBody),
            headers: {
                'Content-Type': 'application/json',
                'x-key': key,
            },
        });

        if (!result.ok) {
            console.warn('BFL returned an error.');
            set.status = 500;
            return;
        }

        const taskData = (await result.json()) as { id: string };
        const { id } = taskData;

        const MAX_ATTEMPTS = 100;
        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            await delay(2500);

            const statusResult = await fetch(`https://api.bfl.ml/v1/get_result?id=${id}`);

            if (!statusResult.ok) {
                const text = await statusResult.text();
                console.warn('BFL returned an error.', text);
                set.status = 500;
                return;
            }

            const statusData = (await statusResult.json()) as {
                status?: string;
                result?: { sample: string };
            };

            if (statusData?.status === 'Pending') {
                continue;
            }

            if (statusData?.status === 'Ready') {
                // @ts-expect-error TS(2339) FIXME: Property 'sample' does not exist on type '{ sample... Remove this comment to see the full error message
                const { sample } = statusData.result;
                const fetchResult = await fetch(sample);
                const fetchData = await fetchResult.arrayBuffer();
                const image = Buffer.from(fetchData).toString('base64');
                return { image: image };
            }

            throw new Error('BFL failed to generate image.', { cause: statusData });
        }
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

const falai = new Elysia();

falai.post('/models', async ({ set }) => {
    try {
        const modelsUrl = new URL('https://fal.ai/api/models?categories=text-to-image');
        let page = 1;
        let modelsResponse: {
            items?: Array<{ title: string; modelUrl: string }>;
            page?: number;
            pages?: number;
        };
        let models: Array<{ title: string; modelUrl: string }> = [];

        do {
            modelsUrl.searchParams.set('page', page.toString());
            const result = await fetch(modelsUrl);

            if (!result.ok) {
                console.warn('FAL.AI returned an error.', result.status, result.statusText);
                throw new Error('FAL.AI request failed.');
            }

            modelsResponse = (await result.json()) as {
                items: Array<{ title: string; modelUrl: string }>;
                page: number;
                pages: number;
            };
            if (!('items' in modelsResponse) || !Array.isArray(modelsResponse.items)) {
                console.warn('FAL.AI returned invalid data.');
                throw new Error('FAL.AI request failed.');
            }

            models = models.concat(
                modelsResponse.items.filter(
                    (x) =>
                        !x.title.toLowerCase().includes('inpainting') &&
                        !x.title.toLowerCase().includes('control') &&
                        !x.title.toLowerCase().includes('upscale') &&
                        !x.title.toLowerCase().includes('lora'),
                ),
            );

            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            page = modelsResponse.page + 1;
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        } while (modelsResponse != null && page < modelsResponse.pages);

        const modelOptions = models
            .toSorted((a, b) => a.title.localeCompare(b.title))
            .map((x) => ({ value: x.modelUrl.split('fal-ai/')[1], text: x.title }))
            .map((x) => ({ ...x, text: `${x.text} (${x.value})` }));
        return modelOptions;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

falai.post('/generate', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const key = readSecret(user.directories, SECRET_KEYS.FALAI);

        if (!key) {
            console.warn('FAL.AI key not found.');
            set.status = 400;
            return;
        }

        const requestBody = {
            prompt: body.prompt,
            image_size: { width: body.width, height: body.height },
            num_inference_steps: body.steps,
            seed: body.seed ?? null,
            guidance_scale: body.guidance,
            enable_safety_checker: false, // Disable general safety checks
            safety_tolerance: 6, // Make Flux the least strict
        };

        console.debug('FAL.AI request:', requestBody);

        const result = await fetch(`https://queue.fal.run/fal-ai/${body.model}`, {
            method: 'POST',
            body: JSON.stringify(requestBody),
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Key ${key}`,
            },
        });

        if (!result.ok) {
            console.warn('FAL.AI returned an error.');
            set.status = 500;
            return;
        }

        const taskData = (await result.json()) as { status_url: string };
        const { status_url } = taskData;

        const MAX_ATTEMPTS = 100;
        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            await delay(2500);

            const statusResult = await fetch(status_url, {
                headers: {
                    Authorization: `Key ${key}`,
                },
            });

            if (!statusResult.ok) {
                const text = await statusResult.text();
                console.warn('FAL.AI returned an error.', text);
                set.status = 500;
                return;
            }

            const statusData = (await statusResult.json()) as {
                status?: string;
                response_url?: string;
            };

            if (statusData?.status === 'IN_QUEUE' || statusData?.status === 'IN_PROGRESS') {
                continue;
            }

            if (statusData?.status === 'COMPLETED') {
                const resultFetch = await fetch(statusData?.response_url as string, {
                    method: 'GET',
                    headers: {
                        Authorization: `Key ${key}`,
                    },
                });
                const resultData = (await resultFetch.json()) as {
                    detail?: Array<{ loc: [string, string]; msg: string }>;
                    images: Array<{ url: string }>;
                };

                if (resultData.detail !== null && resultData.detail !== undefined) {
                    throw new Error('FAL.AI failed to generate image.', {
                        cause: `${resultData.detail![0]!.loc[1]}: ${resultData.detail![0]!.msg}`,
                    });
                }

                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                const imageFetch = await fetch(resultData?.images[0].url, {
                    headers: {
                        Authorization: `Key ${key}`,
                    },
                });

                const fetchData = await imageFetch.arrayBuffer();
                const image = Buffer.from(fetchData).toString('base64');
                return { image: image };
            }

            throw new Error('FAL.AI failed to generate image.', { cause: statusData });
        }
    } catch (error) {
        console.error(error);
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        set.status = 500; return error.cause || error.message;
    }
});

const xai = new Elysia();

xai.post('/generate', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const key = readSecret(user.directories, SECRET_KEYS.XAI);

        if (!key) {
            console.warn('xAI key not found.');
            set.status = 400;
            return;
        }

        const requestBody = {
            prompt: body.prompt,
            model: body.model,
            aspect_ratio: body.aspect_ratio,
            resolution: body.resolution,
            response_format: 'b64_json',
        };

        console.debug('xAI request:', requestBody);

        const result = await fetch('https://api.x.ai/v1/images/generations', {
            method: 'POST',
            body: JSON.stringify(requestBody),
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
            },
        });

        if (!result.ok) {
            const text = await result.text();
            console.warn('xAI returned an error.', text);
            set.status = 500;
            return;
        }

        const data = (await result.json()) as { data?: Array<{ b64_json?: string }> };

        // Can either be a base64 buffer (always JPEG) or a data URL (with MIME type)
        const encodedImage = String(data?.data?.[0]?.b64_json || '');
        if (!encodedImage) {
            console.warn('xAI returned invalid data.');
            set.status = 500;
            return;
        }

        const dataUrlMatch = encodedImage.match(/^data:(.+);base64,(.+)$/);
        const mimeType = dataUrlMatch?.[1] || 'image/jpeg';
        const format = mime.extension(mimeType) || 'jpg';
        const image = dataUrlMatch?.[2] || encodedImage;

        return { image, format };
    } catch (error) {
        console.error('Error communicating with xAI', error);
        set.status = 500;
        return;
    }
});

const aimlapi = new Elysia();

aimlapi.post('/models', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const key = readSecret(user.directories, SECRET_KEYS.AIMLAPI);

        if (!key) {
            console.warn('AI/ML API key not found.');
            set.status = 400;
            return;
        }

        const modelsResponse = await fetch('https://api.aimlapi.com/v1/models', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${key}`,
            },
        });

        if (!modelsResponse.ok) {
            console.warn('AI/ML API returned an error.');
            set.status = 500;
            return;
        }

        const data = (await modelsResponse.json()) as {
            data: Array<{ id: string; type: string; info?: { name?: string } }>;
        };
        const models = (data.data || [])
            .filter(
                (model) =>
                    model.type === 'image' &&
                    model.id !== 'triposr' &&
                    model.id !== 'flux/dev/image-to-image',
            )
            .map((model) => ({
                value: model.id,
                text: model.info?.name || model.id,
            }));

        return { data: models };
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

aimlapi.post('/generate-image', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const key = readSecret(user.directories, SECRET_KEYS.AIMLAPI);
        if (!key) { set.status = 400; return; }

        console.debug('AI/ML API image request:', body);

        const apiRes = await fetch('https://api.aimlapi.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
                ...AIMLAPI_HEADERS,
            },
            body: JSON.stringify(body),
        });
        if (!apiRes.ok) {
            const err = await apiRes.text();
            set.status = 500; return err;
        }
        const data = (await apiRes.json()) as {
            images?: Array<{ b64_json?: string; base64?: string; url?: string }>;
            data?: Array<{ b64_json?: string; base64?: string; url?: string }>;
        };

        const imgObj = Array.isArray(data.images) ? data.images[0] : data.data?.[0];
        if (!imgObj) { set.status = 500; return 'No image returned'; }

        let base64;
        if (imgObj.b64_json || imgObj.base64) {
            base64 = imgObj.b64_json || imgObj.base64;
        } else if (imgObj.url) {
            const blobRes = await fetch(imgObj.url);
            if (!blobRes.ok) throw new Error('Failed to fetch image URL');
            const buffer = await blobRes.arrayBuffer();
            base64 = Buffer.from(buffer).toString('base64');
        } else {
            throw new Error('Unsupported image format');
        }

        return { format: 'png', data: base64 };
    } catch (e) {
        console.error(e);
        set.status = 500; return 'Internal error';
    }
});

const zai = new Elysia();

zai.post('/generate', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const key = readSecret(user.directories, SECRET_KEYS.ZAI);

        if (!key) {
            console.warn('Z.AI key not found.');
            set.status = 400;
            return;
        }

        console.debug('Z.AI image request:', body);

        // Always use Common API for image generation (Coding API has stricter rate limits)
        const generateResponse = await fetch('https://api.z.ai/api/paas/v4/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
                prompt: body.prompt,
                model: body.model,
                quality: body.quality,
                size: body.size,
            }),
        });

        if (!generateResponse.ok) {
            const text = await generateResponse.text();
            console.warn('Z.AI returned an error.', text);
            set.status = 500;
            return;
        }

        const data = (await generateResponse.json()) as {
            data?: Array<{ url?: string }>;
            id?: string;
        };
        console.debug('Z.AI image response:', data);

        const urlString = String(data?.data?.[0]?.url ?? '');
        if (!urlString || !isValidUrl(urlString)) {
            console.warn('Z.AI returned an invalid image URL.');
            set.status = 500;
            return;
        }

        const url = new URL(urlString);
        if (!url.hostname.endsWith('.z.ai') && !url.hostname.endsWith('.ufileos.com')) {
            console.warn('Z.AI returned a URL with an unrecognized hostname.');
            set.status = 500;
            return;
        }

        for (let attempt = 0; attempt < 5; attempt++) {
            const imageResponse = await fetch(url);
            if (!imageResponse.ok) {
                // Sometimes the URL is valid but the image isn't immediately available
                if (imageResponse.status === 404) {
                    console.info('Z.AI image not found yet, retrying...', { attempt: attempt + 1 });
                    await delay(1000);
                    continue;
                }

                console.warn(
                    'Z.AI image fetch returned an error. Status:',
                    imageResponse.status,
                    imageResponse.statusText,
                );
                set.status = 500;
                return;
            }

            const buffer = await imageResponse.arrayBuffer();
            const image = Buffer.from(buffer).toString('base64');
            const format = path.extname(url.pathname).substring(1).toLowerCase() || 'png';

            return { image, format };
        }

        console.warn('Z.AI image was not available after multiple attempts.');
        set.status = 500;
        return;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

zai.post('/generate-video', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const controller = new AbortController();
        (req as any).socket.removeAllListeners('close');
        (req as any).socket.on('close', function () {
            controller.abort();
        });

        const key = readSecret(user.directories, SECRET_KEYS.ZAI);

        if (!key) {
            console.warn('Z.AI key not found.');
            set.status = 400;
            return;
        }

        console.debug('Z.AI video request:', body);

        const generateResponse = await fetch('https://api.z.ai/api/paas/v4/videos/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
                prompt: body.prompt,
                model: body.model,
                quality: body.quality,
                size: body.size,
                aspect_ratio: body.aspect_ratio,
            }),
            signal: controller.signal,
        });

        if (!generateResponse.ok) {
            const text = await generateResponse.text();
            console.warn('Z.AI returned an error.', text);
            set.status = 500;
            return;
        }

        const data = (await generateResponse.json()) as { id?: string };
        console.debug('Z.AI video response:', data);

        // Poll for video generation completion
        for (let attempt = 0; attempt < 30; attempt++) {
            if (controller.signal.aborted) {
                console.info('Z.AI video generation aborted by client');
                set.status = 500; return 'Video generation aborted by client';
            }

            await delay(5000 + attempt * 1000);
            console.debug(`Polling Z.AI video job ${data.id}, attempt ${attempt + 1}`);

            const pollResponse = await fetch(
                `https://api.z.ai/api/paas/v4/async-result/${data.id}`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${key}`,
                    },
                },
            );

            if (!pollResponse.ok) {
                const text = await pollResponse.text();
                console.warn('Z.AI video job polling failed', pollResponse.statusText, text);
                set.status = 500; return text;
            }

            const pollResult = (await pollResponse.json()) as {
                task_status?: string;
                video_result?: Array<{ url?: string }>;
            };
            console.debug(`Z.AI video job status: ${pollResult.task_status}`);

            if (pollResult.task_status === 'FAIL') {
                console.warn('Z.AI video generation failed', pollResult);
                set.status = 500; return 'Video generation failed';
            }

            if (pollResult.task_status === 'SUCCESS') {
                console.debug('Z.AI video generation succeeded', pollResult);
                const url = pollResult?.video_result?.[0]?.url;

                if (!url || !isValidUrl(url)) {
                    console.warn('Z.AI returned an invalid video URL.');
                    set.status = 500;
                    return;
                }

                const contentResponse = await fetch(url);
                if (!contentResponse.ok) {
                    const text = await contentResponse.text();
                    console.warn(
                        'Z.AI video content fetch failed',
                        contentResponse.statusText,
                        text,
                    );
                    set.status = 500; return text;
                }

                const contentBuffer = await contentResponse.arrayBuffer();
                return {
                    format: 'mp4',
                    video: Buffer.from(contentBuffer).toString('base64'),
                };
            }
        }
        console.warn('Z.AI video was not available after multiple attempts.');
        set.status = 500;
        return;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

const workersai = new Elysia();

workersai.post('/models', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const key = readSecret(user.directories, SECRET_KEYS.WORKERS_AI);

        if (!key) {
            console.warn('Cloudflare Workers AI API key not found.');
            set.status = 400;
            return;
        }

        const accountId = String(body.account_id || '').trim();
        if (!accountId) {
            console.warn('Cloudflare Workers AI Account ID not found.');
            set.status = 400;
            return;
        }

        const apiUrl = new URL(
            `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search`,
        );
        apiUrl.searchParams.set('task', 'Text-to-Image');
        apiUrl.searchParams.set('per_page', '1000');
        const result = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${key}`,
            },
        });

        if (!result.ok) {
            console.warn('Cloudflare Workers AI returned an error.', result.statusText);
            set.status = 500;
            return;
        }

        const data = (await result.json()) as { success: boolean; result: Array<{ name: string }> };

        if (!data.success || !Array.isArray(data.result)) {
            console.warn('Cloudflare Workers AI returned invalid data.');
            set.status = 500;
            return;
        }

        const models = data.result.map((x) => ({
            value: x.name,
            text: x.name,
        }));
        return models;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

workersai.post('/generate', async (context: any) => {
    const body = context.body as Record<string, unknown>;
    const set = context.set;
    const req = context.request;
    const user = (context as any).user;
    const headers = context.headers;
    try {
        const key = readSecret(user.directories, SECRET_KEYS.WORKERS_AI);

        if (!key) {
            console.warn('Cloudflare Workers AI API key not found.');
            set.status = 400;
            return;
        }

        const accountId = String(body.account_id || '').trim();
        if (!accountId) {
            console.warn('Cloudflare Workers AI Account ID not found.');
            set.status = 400;
            return;
        }

        const model = String(body.model || '').trim();
        if (!model) {
            console.warn('Cloudflare Workers AI model not specified.');
            set.status = 400;
            return;
        }

        const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`;

        const requestBody = {
            prompt: body.prompt,
            negative_prompt: body.negative_prompt || undefined,
            width: body.width ? Number(body.width) : undefined,
            height: body.height ? Number(body.height) : undefined,
            num_steps: body.steps ? Number(body.steps) : undefined,
            guidance: body.scale ? Number(body.scale) : undefined,
            seed: (body.seed as number) >= 0 ? Number((body.seed as number)) : undefined,
        };

        // Remove undefined values
        for (const prop of Object.keys(requestBody)) {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ prompt: any; negative_prompt: any; width: any; height: any; num_steps: any; guidance: any; seed: any; }'.
            if (requestBody[prop] === undefined) {
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ prompt: any; negative_prompt: any; width: any; height: any; num_steps: any; guidance: any; seed: any; }'.
                delete requestBody[prop];
            }
        }

        console.debug('Cloudflare Workers AI request:', model, requestBody);

        /** @type {RequestInit} */
        const apiRequest = {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${key}`,
            },
        };

        if (/flux-2/.test(model)) {
            const formData = new FormData();
            for (const [key, value] of Object.entries(requestBody)) {
                formData.append(key, String(value));
            }
            // @ts-expect-error TS(2339) FIXME: Property 'body' does not exist on type '{ method: ... Remove this comment to see the full error message
            apiRequest.body = formData;
        } else {
            // @ts-expect-error TS(2322) FIXME: Type '{ 'Content-Type': string; Authorization: str... Remove this comment to see the full error message
            apiRequest.headers = { ...apiRequest.headers, 'Content-Type': 'application/json' };
            // @ts-expect-error TS(2339) FIXME: Property 'body' does not exist on type '{ method: ... Remove this comment to see the full error message
            apiRequest.body = JSON.stringify(requestBody);
        }

        const result = await fetch(apiUrl, apiRequest);
        if (!result.ok) {
            const text = await result.text();
            console.warn(
                'Cloudflare Workers AI returned an error.',
                result.status,
                result.statusText,
                text,
            );
            set.status = 500; return text;
        }

        const contentType = result.headers.get('content-type') || '';

        // Partner models return JSON with base64 image
        if (contentType.includes('application/json')) {
            const data = (await result.json()) as { result?: { image?: string }; image?: string };
            const image = data?.result?.image || data?.image;
            if (!image) {
                console.warn('Cloudflare Workers AI returned JSON without image data.');
                set.status = 500;
                return;
            }
            return { format: 'png', image: image };
        }

        // Non-partner models return raw binary image data
        const buffer = await result.arrayBuffer();
        return { format: 'png', image: Buffer.from(buffer).toString('base64') };
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

(router as any).use('/comfy', comfy);
(router as any).use('/comfyrunpod', comfyRunPod);
(router as any).use('/together', together);
(router as any).use('/sdcpp', sdcpp);
(router as any).use('/drawthings', drawthings);
(router as any).use('/pollinations', pollinations);
(router as any).use('/stability', stability);
(router as any).use('/huggingface', huggingface);
(router as any).use('/chutes', chutes);
(router as any).use('/electronhub', electronhub);
(router as any).use('/nanogpt', nanogpt);
(router as any).use('/bfl', bfl);
(router as any).use('/falai', falai);
(router as any).use('/xai', xai);
(router as any).use('/aimlapi', aimlapi);
(router as any).use('/zai', zai);
(router as any).use('/workersai', workersai);
