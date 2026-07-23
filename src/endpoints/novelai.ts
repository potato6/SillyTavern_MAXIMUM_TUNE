import util from 'node:util';

import { Elysia } from 'elysia';

import { readSecret, SECRET_KEYS } from './secrets.js';
import { extractFileFromZipBuffer } from '../util.js';

const API_NOVELAI = 'https://api.novelai.net';
const TEXT_NOVELAI = 'https://text.novelai.net';
const IMAGE_NOVELAI = 'https://image.novelai.net';

// Constants for skip_cfg_above_sigma (Variety+) calculation
const REFERENCE_PIXEL_COUNT = 1011712; // 832 * 1216 reference image size
const SIGMA_MAGIC_NUMBER = 19; // Base sigma multiplier for V3 and V4 models
const SIGMA_MAGIC_NUMBER_V4_5 = 58; // Base sigma multiplier for V4.5 models

// Ban bracket generation, plus defaults
const badWordsList = [
    [3],
    [49356],
    [1431],
    [31715],
    [34387],
    [20765],
    [30702],
    [10691],
    [49333],
    [1266],
    [19438],
    [43145],
    [26523],
    [41471],
    [2936],
    [85, 85],
    [49332],
    [7286],
    [1115],
    [24],
];

const eratoBadWordsList = [
    [16067],
    [933, 11144],
    [25106, 11144],
    [58, 106901, 16073, 33710, 25, 109933],
    [933, 58, 11144],
    [128030],
    [58, 30591, 33503, 17663, 100204, 25, 11144],
];

const hypeBotBadWordsList = [
    [58],
    [60],
    [90],
    [92],
    [685],
    [1391],
    [1782],
    [2361],
    [3693],
    [4083],
    [4357],
    [4895],
    [5512],
    [5974],
    [7131],
    [8183],
    [8351],
    [8762],
    [8964],
    [8973],
    [9063],
    [11208],
    [11709],
    [11907],
    [11919],
    [12878],
    [12962],
    [13018],
    [13412],
    [14631],
    [14692],
    [14980],
    [15090],
    [15437],
    [16151],
    [16410],
    [16589],
    [17241],
    [17414],
    [17635],
    [17816],
    [17912],
    [18083],
    [18161],
    [18477],
    [19629],
    [19779],
    [19953],
    [20520],
    [20598],
    [20662],
    [20740],
    [21476],
    [21737],
    [22133],
    [22241],
    [22345],
    [22935],
    [23330],
    [23785],
    [23834],
    [23884],
    [25295],
    [25597],
    [25719],
    [25787],
    [25915],
    [26076],
    [26358],
    [26398],
    [26894],
    [26933],
    [27007],
    [27422],
    [28013],
    [29164],
    [29225],
    [29342],
    [29565],
    [29795],
    [30072],
    [30109],
    [30138],
    [30866],
    [31161],
    [31478],
    [32092],
    [32239],
    [32509],
    [33116],
    [33250],
    [33761],
    [34171],
    [34758],
    [34949],
    [35944],
    [36338],
    [36463],
    [36563],
    [36786],
    [36796],
    [36937],
    [37250],
    [37913],
    [37981],
    [38165],
    [38362],
    [38381],
    [38430],
    [38892],
    [39850],
    [39893],
    [41832],
    [41888],
    [42535],
    [42669],
    [42785],
    [42924],
    [43839],
    [44438],
    [44587],
    [44926],
    [45144],
    [45297],
    [46110],
    [46570],
    [46581],
    [46956],
    [47175],
    [47182],
    [47527],
    [47715],
    [48600],
    [48683],
    [48688],
    [48874],
    [48999],
    [49074],
    [49082],
    [49146],
    [49946],
    [10221],
    [4841],
    [1427],
    [2602, 834],
    [29343],
    [37405],
    [35780],
    [2602],
    [50256],
];

// Used for phrase repetition penalty
const repPenaltyAllowList = [
    [
        49256, 49264, 49231, 49230, 49287, 85, 49255, 49399, 49262, 336, 333, 432, 363, 468, 492,
        745, 401, 426, 623, 794, 1096, 2919, 2072, 7379, 1259, 2110, 620, 526, 487, 16562, 603, 805,
        761, 2681, 942, 8917, 653, 3513, 506, 5301, 562, 5010, 614, 10942, 539, 2976, 462, 5189,
        567, 2032, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 588, 803, 1040, 49209, 4, 5, 6,
        7, 8, 9, 10, 11, 12,
    ],
];

const eratoRepPenWhitelist = [
    6, 1, 11, 13, 25, 198, 12, 9, 8, 279, 264, 459, 323, 477, 539, 912, 374, 574, 1051, 1550, 1587,
    4536, 5828, 15058, 3287, 3250, 1461, 1077, 813, 11074, 872, 1202, 1436, 7846, 1288, 13434, 1053,
    8434, 617, 9167, 1047, 19117, 706, 12775, 649, 4250, 527, 7784, 690, 2834, 15, 16, 17, 18, 19,
    20, 21, 22, 23, 24, 1210, 1359, 608, 220, 596, 956, 3077, 44886, 4265, 3358, 2351, 2846, 311,
    389, 315, 304, 520, 505, 430,
];

// Ban the dinkus and asterism
const logitBiasExp = [
    { sequence: [23], bias: -0.08, ensure_sequence_finish: false, generate_once: false },
    { sequence: [21], bias: -0.08, ensure_sequence_finish: false, generate_once: false },
];

const eratoLogitBiasExp = [
    { sequence: [12488], bias: -0.08, ensure_sequence_finish: false, generate_once: false },
    { sequence: [128041], bias: -0.08, ensure_sequence_finish: false, generate_once: false },
];

/**
 * Returns the bad words list for the given model
 * @param {string} model Model name
 * @returns {number[][]} List of bad word token sequences
 */
function getBadWordsList(model: string): number[][] {
    if (model.includes('hypebot')) {
        return hypeBotBadWordsList.slice();
    }

    if (model.includes('clio') || model.includes('kayra')) {
        return badWordsList.slice();
    }

    if (model.includes('erato')) {
        return eratoBadWordsList.slice();
    }

    return [];
}

/**
 * Returns the logit bias list for the given model
 * @param {string} model Model name
 * @returns {Array<{sequence: number[], bias: number, ensure_sequence_finish: boolean, generate_once: boolean}>} List of logit bias expressions
 */
function getLogitBiasList(model: string) {
    if (model.includes('erato')) {
        return eratoLogitBiasExp.slice();
    }

    if (model.includes('clio') || model.includes('kayra')) {
        return logitBiasExp.slice();
    }

    return [];
}

/**
 * Returns the repetition penalty whitelist for the given model
 * @param {string} model Model name
 * @returns {number[] | null} Whitelist of token IDs or null
 */
function getRepPenaltyWhitelist(model: string): number[] | null {
    if (model.includes('clio') || model.includes('kayra')) {
        return repPenaltyAllowList.flat();
    }

    if (model.includes('erato')) {
        return eratoRepPenWhitelist.flat();
    }

    return null;
}

/**
 * Calculates the skip_cfg_above_sigma value for variety boost
 * @param {number} width Image width
 * @param {number} height Image height
 * @param {string} modelName Model name
 * @returns {number} The calculated sigma value
 */
function calculateSkipCfgAboveSigma(width: number, height: number, modelName: string): number {
    const magicConstant = modelName?.includes('nai-diffusion-4-5')
        ? SIGMA_MAGIC_NUMBER_V4_5
        : SIGMA_MAGIC_NUMBER;

    const pixelCount = width * height;
    const ratio = pixelCount / REFERENCE_PIXEL_COUNT;

    return Math.pow(ratio, 0.5) * magicConstant;
}

export const router = new Elysia({ prefix: '/api/novelai' })

    .post('/status', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | null;
        if (!body) {
            set.status = 400;
            return;
        }

        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const api_key_novel = directories ? readSecret(directories as any, SECRET_KEYS.NOVEL) : '';

        if (!api_key_novel) {
            console.warn('NovelAI Access Token is missing.');
            set.status = 400;
            return;
        }

        try {
            const response = await fetch(API_NOVELAI + '/user/subscription', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + api_key_novel,
                },
            });

            if (response.ok) {
                const data = (await response.json()) as Record<string, unknown>;
                return data;
            } else if (response.status == 401) {
                console.error('NovelAI Access Token is incorrect.');
                return { error: true };
            } else {
                console.warn('NovelAI returned an error:', response.statusText);
                return { error: true };
            }
        } catch (error) {
            console.error(error);
            return { error: true };
        }
    })

    .post('/generate', async (context) => {
        const { request, set } = context;
        const body = context.body as Record<string, unknown> | null;
        if (!body) {
            set.status = 400;
            return;
        }

        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const api_key_novel = directories ? readSecret(directories as any, SECRET_KEYS.NOVEL) : '';

        if (!api_key_novel) {
            console.warn('NovelAI Access Token is missing.');
            set.status = 400;
            return;
        }

        // Use the request signal for abort on client disconnect
        const signal = request.signal;

        // Add customized bad words for Clio, Kayra, and Erato
        const badWordsList = getBadWordsList(body.model as string);

        if (Array.isArray(badWordsList) && Array.isArray(body.bad_words_ids)) {
            for (const badWord of body.bad_words_ids as number[][]) {
                if (Array.isArray(badWord) && badWord.every((x) => Number.isInteger(x))) {
                    badWordsList.push(badWord);
                }
            }
        }

        // Remove empty arrays from bad words list
        for (const badWord of badWordsList) {
            if (badWord.length === 0) {
                badWordsList.splice(badWordsList.indexOf(badWord), 1);
            }
        }

        // Add default biases for dinkus and asterism
        const logitBiasList = getLogitBiasList(body.model as string);

        if (Array.isArray(logitBiasList) && Array.isArray(body.logit_bias_exp)) {
            logitBiasList.push(...(body.logit_bias_exp as any[]));
        }

        const repPenWhitelist = getRepPenaltyWhitelist(body.model as string);

        const data = {
            input: body.input,
            model: body.model,
            parameters: {
                use_string: body.use_string ?? true,
                temperature: body.temperature,
                max_length: body.max_length,
                min_length: body.min_length,
                tail_free_sampling: body.tail_free_sampling,
                repetition_penalty: body.repetition_penalty,
                repetition_penalty_range: body.repetition_penalty_range,
                repetition_penalty_slope: body.repetition_penalty_slope,
                repetition_penalty_frequency: body.repetition_penalty_frequency,
                repetition_penalty_presence: body.repetition_penalty_presence,
                repetition_penalty_whitelist: repPenWhitelist,
                top_a: body.top_a,
                top_p: body.top_p,
                top_k: body.top_k,
                typical_p: body.typical_p,
                mirostat_lr: body.mirostat_lr,
                mirostat_tau: body.mirostat_tau,
                phrase_rep_pen: body.phrase_rep_pen,
                stop_sequences: body.stop_sequences,
                bad_words_ids: badWordsList.length ? badWordsList : null,
                logit_bias_exp: logitBiasList,
                generate_until_sentence: body.generate_until_sentence,
                use_cache: body.use_cache,
                return_full_text: body.return_full_text,
                prefix: body.prefix,
                order: body.order,
                num_logprobs: body.num_logprobs,
                min_p: body.min_p,
                math1_temp: body.math1_temp,
                math1_quad: body.math1_quad,
                math1_quad_entropy_scale: body.math1_quad_entropy_scale,
            },
        };

        // Tells the model to stop generation at '>'
        if ('theme_textadventure' === body.prefix) {
            if (
                (body.model as string).includes('clio') ||
                (body.model as string).includes('kayra')
            ) {
                (data.parameters as Record<string, unknown>).eos_token_id = 49405;
            }
            if ((body.model as string).includes('erato')) {
                (data.parameters as Record<string, unknown>).eos_token_id = 29;
            }
        }

        console.debug(util.inspect(data, { depth: 4 }));

        const args = {
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + api_key_novel,
            },
            signal,
        };

        try {
            const baseURL =
                (body.model as string).includes('kayra') || (body.model as string).includes('erato')
                    ? TEXT_NOVELAI
                    : API_NOVELAI;
            const url = body.streaming ? `${baseURL}/ai/generate-stream` : `${baseURL}/ai/generate`;
            const response = await fetch(url, { method: 'POST', ...args });

            if (body.streaming) {
                // Forward the streaming response body as a ReadableStream
                if (!response.ok) {
                    const text = await response.text();
                    let message = text;
                    console.warn(
                        `Novel API returned error: ${response.status} ${response.statusText} ${text}`,
                    );

                    try {
                        const errData = JSON.parse(text);
                        message = errData.message;
                    } catch {
                        // ignore
                    }

                    set.status = 500;
                    return { error: { message } };
                }

                // Avoid sending 401 responses as they reset the client Basic auth
                return new Response(response.body, {
                    status: response.status === 401 ? 400 : response.status,
                });
            } else {
                if (!response.ok) {
                    const text = await response.text();
                    let message = text;
                    console.warn(
                        `Novel API returned error: ${response.status} ${response.statusText} ${text}`,
                    );

                    try {
                        const errData = JSON.parse(text);
                        message = errData.message;
                    } catch {
                        // ignore
                    }

                    set.status = 500;
                    return { error: { message } };
                }

                const responseData = (await response.json()) as Record<string, unknown>;
                console.info('NovelAI Output', responseData?.output);
                return responseData;
            }
        } catch {
            return { error: true };
        }
    })

    .post('/generate-image', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | null;
        if (!body) {
            set.status = 400;
            return;
        }

        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const key = directories ? readSecret(directories as any, SECRET_KEYS.NOVEL) : '';

        if (!key) {
            console.warn('NovelAI Access Token is missing.');
            set.status = 400;
            return;
        }

        try {
            console.debug('NAI Diffusion request:', body);
            const generateUrl = `${IMAGE_NOVELAI}/ai/generate-image`;
            const generateResult = await fetch(generateUrl, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${key}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'generate',
                    input: body.prompt ?? '',
                    model: body.model ?? 'nai-diffusion',
                    parameters: {
                        params_version: 3,
                        prefer_brownian: true,
                        negative_prompt: body.negative_prompt ?? '',
                        height: body.height ?? 512,
                        width: body.width ?? 512,
                        scale: body.scale ?? 9,
                        seed:
                            (body.seed as number) >= 0
                                ? body.seed
                                : Math.floor(Math.random() * 9999999999),
                        sampler: body.sampler ?? 'k_dpmpp_2m',
                        noise_schedule: body.scheduler ?? 'karras',
                        steps: body.steps ?? 28,
                        n_samples: 1,
                        // NAI handholding for prompts
                        ucPreset: 0,
                        qualityToggle: false,
                        add_original_image: false,
                        controlnet_strength: 1,
                        deliberate_euler_ancestral_bug: false,
                        dynamic_thresholding: body.decrisper ?? false,
                        legacy: false,
                        legacy_v3_extend: false,
                        sm: body.sm ?? false,
                        sm_dyn: body.sm_dyn ?? false,
                        uncond_scale: 1,
                        skip_cfg_above_sigma: body.variety_boost
                            ? calculateSkipCfgAboveSigma(
                                  (body.width as number) ?? 512,
                                  (body.height as number) ?? 512,
                                  (body.model as string) ?? 'nai-diffusion',
                              )
                            : null,
                        use_coords: false,
                        characterPrompts: [],
                        reference_image_multiple: [],
                        reference_information_extracted_multiple: [],
                        reference_strength_multiple: [],
                        v4_negative_prompt: {
                            caption: {
                                base_caption: body.negative_prompt ?? '',
                                char_captions: [],
                            },
                        },
                        v4_prompt: {
                            caption: {
                                base_caption: body.prompt ?? '',
                                char_captions: [],
                            },
                            use_coords: false,
                            use_order: true,
                        },
                    },
                }),
            });

            if (!generateResult.ok) {
                const text = await generateResult.text();
                console.warn('NovelAI returned an error.', generateResult.statusText, text);
                set.status = 500;
                return;
            }

            const archiveBuffer = await generateResult.arrayBuffer();
            const imageBuffer = await extractFileFromZipBuffer(archiveBuffer, '.png');

            if (!imageBuffer) {
                console.error('NovelAI generated an image, but the PNG file was not found.');
                set.status = 500;
                return;
            }

            const originalBase64 = imageBuffer.toString('base64');

            // No upscaling
            if (isNaN(body.upscale_ratio as number) || (body.upscale_ratio as number) <= 1) {
                return originalBase64;
            }

            try {
                console.info('Upscaling image...');
                const upscaleUrl = `${API_NOVELAI}/ai/upscale`;
                const upscaleResult = await fetch(upscaleUrl, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${key}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        image: originalBase64,
                        height: body.height,
                        width: body.width,
                        scale: body.upscale_ratio,
                    }),
                });

                if (!upscaleResult.ok) {
                    const text = await upscaleResult.text();
                    throw new Error('NovelAI returned an error.', { cause: text });
                }

                const upscaledArchiveBuffer = await upscaleResult.arrayBuffer();
                const upscaledImageBuffer = await extractFileFromZipBuffer(
                    upscaledArchiveBuffer,
                    '.png',
                );

                if (!upscaledImageBuffer) {
                    throw new Error('NovelAI upscaled an image, but the PNG file was not found.');
                }

                const upscaledBase64 = upscaledImageBuffer.toString('base64');

                return upscaledBase64;
            } catch (error) {
                console.warn(
                    'NovelAI generated an image, but upscaling failed. Returning original image.',
                    error,
                );
                return originalBase64;
            }
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    })

    .post('/generate-voice', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown> | null;

        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const token = directories ? readSecret(directories as any, SECRET_KEYS.NOVEL) : '';

        if (!token) {
            console.error('NovelAI Access Token is missing.');
            set.status = 400;
            return;
        }

        const text = body?.text as string | undefined;
        const voice = body?.voice as string | undefined;

        if (!text || !voice) {
            set.status = 400;
            return;
        }

        try {
            const url = `${API_NOVELAI}/ai/generate-voice?text=${encodeURIComponent(text)}&voice=-1&seed=${encodeURIComponent(voice)}&opus=false&version=v2`;
            const result = await fetch(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'audio/mpeg',
                },
            });

            if (!result.ok) {
                const errorText = await result.text();
                console.error('NovelAI returned an error.', result.statusText, errorText);
                set.status = 500;
                return;
            }

            const audioBuffer = await result.arrayBuffer();
            return new Response(audioBuffer, {
                headers: { 'Content-Type': 'audio/mpeg' },
            });
        } catch (error) {
            console.error(error);
            set.status = 500;
        }
    });
