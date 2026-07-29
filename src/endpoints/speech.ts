import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import { Elysia } from 'elysia';
import mime from 'mime-types';
import { readSecret, SECRET_KEYS } from './secrets.js';

export const router = new Elysia({ prefix: '/api/speech' })
    .use(
        new Elysia({ prefix: '/pollinations' })
            .post('/voices', async () => {
                try {
                    const model = 'openai-audio';

                    const response = await fetch('https://gen.pollinations.ai/text/models');

                    if (!response.ok) {
                        throw new Error('Failed to fetch Pollinations models');
                    }

                    const data = (await response.json()) as Record<string, unknown>;

                    if (!Array.isArray(data)) {
                        throw new Error('Invalid data format received from Pollinations');
                    }

                    const audioModelData = data.find((m) => m.name === model);
                    if (!audioModelData || !Array.isArray(audioModelData.voices)) {
                        throw new Error('No voices found for the specified model');
                    }

                    const voices = audioModelData.voices;
                    return voices;
                } catch (error) {
                    console.error(error);
                    return new Response(null, { status: 500 });
                }
            })
            .post('/generate', async (context) => {
                const { set } = context;
                const body = context.body as Record<string, unknown>;
                const user = context.user as Record<string, unknown> | null;
                const directories = user?.directories as Record<string, string> | undefined;

                try {
                    const key = directories
                        ? await readSecret(directories as any, SECRET_KEYS.POLLINATIONS)
                        : '';
                    if (!key) {
                        console.warn('No API key saved for Pollinations TTS.');
                        set.status = 400;
                        return;
                    }

                    const text = body.text as string;
                    const model = (body.model as string) || 'openai-audio';
                    const voice = (body.voice as string) || 'alloy';

                    console.debug('Pollinations TTS request', { text, model, voice });

                    const response = await fetch(
                        'https://gen.pollinations.ai/v1/chat/completions',
                        {
                            method: 'POST',
                            headers: {
                                Authorization: `Bearer ${key}`,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                model: model,
                                stream: false,
                                modalities: ['text', 'audio'],
                                seed: Math.floor(Math.random() * Math.pow(2, 32)),
                                audio: {
                                    format: 'mp3',
                                    voice: voice,
                                },
                                messages: [
                                    {
                                        role: 'user',
                                        content: text,
                                    },
                                ],
                            }),
                        },
                    );

                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Failed to generate audio from Pollinations: ${text}`);
                    }

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic Pollinations API response shape
                    const data: any = await response.json();
                    const audioData = data?.choices?.[0]?.message?.audio?.data;

                    if (!audioData) {
                        console.warn('Pollinations TTS audio data is missing from the response');
                        set.status = 500;
                        return;
                    }

                    return new Response(Buffer.from(audioData, 'base64'), {
                        headers: {
                            'Content-Type': 'audio/mpeg',
                        },
                    });
                } catch (error) {
                    console.error(error);
                    set.status = 500;
                }
            }),
    )
    .use(
        new Elysia({ prefix: '/elevenlabs' })
            .post('/voices', async (context) => {
                const { set } = context;
                const user = context.user as Record<string, unknown> | null;
                const directories = user?.directories as Record<string, string> | undefined;

                try {
                    const apiKey = directories
                        ? await readSecret(directories as any, SECRET_KEYS.ELEVENLABS)
                        : '';
                    if (!apiKey) {
                        console.warn('ElevenLabs API key not found');
                        set.status = 400;
                        return;
                    }

                    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
                        headers: {
                            'xi-api-key': apiKey,
                        },
                    });

                    if (!response.ok) {
                        const text = await response.text();
                        console.warn(
                            `ElevenLabs voices fetch failed: HTTP ${response.status} - ${text}`,
                        );
                        set.status = 500;
                        return;
                    }

                    const responseJson = (await response.json()) as Record<string, unknown>;
                    return responseJson;
                } catch (error) {
                    console.error(error);
                    set.status = 500;
                }
            })
            .post('/voice-settings', async (context) => {
                const { set } = context;
                const user = context.user as Record<string, unknown> | null;
                const directories = user?.directories as Record<string, string> | undefined;

                try {
                    const apiKey = directories
                        ? await readSecret(directories as any, SECRET_KEYS.ELEVENLABS)
                        : '';
                    if (!apiKey) {
                        console.warn('ElevenLabs API key not found');
                        set.status = 400;
                        return;
                    }

                    const response = await fetch(
                        'https://api.elevenlabs.io/v1/voices/settings/default',
                        {
                            headers: {
                                'xi-api-key': apiKey,
                            },
                        },
                    );

                    if (!response.ok) {
                        const text = await response.text();
                        console.warn(
                            `ElevenLabs voice settings fetch failed: HTTP ${response.status} - ${text}`,
                        );
                        set.status = 500;
                        return;
                    }
                    const responseJson = (await response.json()) as Record<string, unknown>;
                    return responseJson;
                } catch (error) {
                    console.error(error);
                    set.status = 500;
                }
            })
            .post('/synthesize', async (context) => {
                const { set } = context;
                const body = context.body as Record<string, unknown>;
                const user = context.user as Record<string, unknown> | null;
                const directories = user?.directories as Record<string, string> | undefined;

                try {
                    const apiKey = directories
                        ? await readSecret(directories as any, SECRET_KEYS.ELEVENLABS)
                        : '';
                    if (!apiKey) {
                        console.warn('ElevenLabs API key not found');
                        set.status = 400;
                        return;
                    }

                    const voiceId = body.voiceId as string;
                    const request = body.request as Record<string, unknown>;

                    if (!voiceId || !request) {
                        console.warn(
                            'ElevenLabs synthesis request missing voiceId or request body',
                        );
                        set.status = 400;
                        return;
                    }

                    console.debug('ElevenLabs TTS request:', request);

                    const response = await fetch(
                        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
                        {
                            method: 'POST',
                            headers: {
                                'xi-api-key': apiKey,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(request),
                        },
                    );

                    if (!response.ok) {
                        const text = await response.text();
                        console.warn(
                            `ElevenLabs synthesis failed: HTTP ${response.status} - ${text}`,
                        );
                        set.status = 500;
                        return;
                    }

                    return response;
                } catch (error) {
                    console.error(error);
                    set.status = 500;
                }
            })
            .post('/history', async (context) => {
                const { set } = context;
                const user = context.user as Record<string, unknown> | null;
                const directories = user?.directories as Record<string, string> | undefined;

                try {
                    const apiKey = directories
                        ? await readSecret(directories as any, SECRET_KEYS.ELEVENLABS)
                        : '';
                    if (!apiKey) {
                        console.warn('ElevenLabs API key not found');
                        set.status = 400;
                        return;
                    }

                    const response = await fetch('https://api.elevenlabs.io/v1/history', {
                        headers: {
                            'xi-api-key': apiKey,
                        },
                    });

                    if (!response.ok) {
                        const text = await response.text();
                        console.warn(
                            `ElevenLabs history fetch failed: HTTP ${response.status} - ${text}`,
                        );
                        set.status = 500;
                        return;
                    }

                    const responseJson = (await response.json()) as Record<string, unknown>;
                    return responseJson;
                } catch (error) {
                    console.error(error);
                    set.status = 500;
                }
            })
            .post('/history-audio', async (context) => {
                const { set } = context;
                const body = context.body as Record<string, unknown>;
                const user = context.user as Record<string, unknown> | null;
                const directories = user?.directories as Record<string, string> | undefined;

                try {
                    const apiKey = directories
                        ? await readSecret(directories as any, SECRET_KEYS.ELEVENLABS)
                        : '';
                    if (!apiKey) {
                        console.warn('ElevenLabs API key not found');
                        set.status = 400;
                        return;
                    }

                    const historyItemId = body.historyItemId as string;
                    if (!historyItemId) {
                        console.warn('ElevenLabs history audio request missing historyItemId');
                        set.status = 400;
                        return;
                    }

                    console.debug('ElevenLabs history audio request for ID:', historyItemId);

                    const response = await fetch(
                        `https://api.elevenlabs.io/v1/history/${historyItemId}/audio`,
                        {
                            headers: {
                                'xi-api-key': apiKey,
                            },
                        },
                    );

                    if (!response.ok) {
                        const text = await response.text();
                        console.warn(
                            `ElevenLabs history audio fetch failed: HTTP ${response.status} - ${text}`,
                        );
                        set.status = 500;
                        return;
                    }

                    return response;
                } catch (error) {
                    console.error(error);
                    set.status = 500;
                }
            })
            .post('/voices/add', async (context) => {
                const { set } = context;
                const body = context.body as Record<string, unknown>;
                const user = context.user as Record<string, unknown> | null;
                const directories = user?.directories as Record<string, string> | undefined;

                try {
                    const apiKey = directories
                        ? await readSecret(directories as any, SECRET_KEYS.ELEVENLABS)
                        : '';
                    if (!apiKey) {
                        console.warn('ElevenLabs API key not found');
                        set.status = 400;
                        return;
                    }

                    const name = body.name as string;
                    const description = body.description as string;
                    const labels = body.labels as string;
                    const files = body.files as string[];

                    const formData = new FormData();
                    formData.append('name', name || 'Custom Voice');
                    formData.append('description', description || 'Uploaded via SillyTavern');
                    formData.append('labels', labels || '');

                    for (const fileData of files || []) {
                        const [mimeType, base64Data] =
                            /^data:(.+);base64,(.+)$/.exec(fileData)?.slice(1) || [];
                        if (!mimeType || !base64Data) {
                            console.warn(
                                'Invalid audio file data provided for ElevenLabs voice upload',
                            );
                            continue;
                        }
                        const buffer = Buffer.from(base64Data, 'base64');
                        formData.append(
                            'files',
                            new Blob([buffer], { type: mimeType }),
                            `audio.${mime.extension(mimeType) || 'wav'}`,
                        );
                    }

                    console.debug('ElevenLabs voice upload request:', {
                        name,
                        description,
                        labels,
                        files: files?.length || 0,
                    });

                    const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
                        method: 'POST',
                        headers: {
                            'xi-api-key': apiKey,
                        },
                        body: formData,
                    });

                    if (!response.ok) {
                        const text = await response.text();
                        console.warn(
                            `ElevenLabs voice upload failed: HTTP ${response.status} - ${text}`,
                        );
                        set.status = 500;
                        return;
                    }

                    const responseJson = (await response.json()) as Record<string, unknown>;
                    return responseJson;
                } catch (error) {
                    console.error(error);
                    set.status = 500;
                }
            })
            .post('/recognize', async (context) => {
                const { set } = context;
                const body = context.body as Record<string, unknown>;
                const user = context.user as Record<string, unknown> | null;
                const directories = user?.directories as Record<string, string> | undefined;
                const file = context.file as Record<string, unknown> | null;

                try {
                    const apiKey = directories
                        ? await readSecret(directories as any, SECRET_KEYS.ELEVENLABS)
                        : '';
                    if (!apiKey) {
                        console.warn('ElevenLabs API key not found');
                        set.status = 400;
                        return;
                    }

                    if (!file || !file.path) {
                        console.warn('No audio file found');
                        set.status = 400;
                        return;
                    }

                    console.info('Processing audio file with ElevenLabs', file.path);
                    const fileBuffer = fs.readFileSync(file.path as string);
                    const formData = new FormData();
                    formData.append(
                        'file',
                        new Blob([fileBuffer], { type: 'audio/wav' }),
                        'audio.wav',
                    );
                    formData.append('model_id', (body.model as string) || '');

                    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
                        method: 'POST',
                        headers: {
                            'xi-api-key': apiKey,
                        },
                        body: formData,
                    });

                    if (!response.ok) {
                        const text = await response.text();
                        console.warn(
                            `ElevenLabs speech recognition failed: HTTP ${response.status} - ${text}`,
                        );
                        set.status = 500;
                        return;
                    }

                    fs.unlinkSync(file.path as string);
                    const responseJson = (await response.json()) as Record<string, unknown>;
                    console.debug('ElevenLabs speech recognition response:', responseJson);
                    return responseJson;
                } catch (error) {
                    console.error(error);
                    set.status = 500;
                }
            }),
    );
