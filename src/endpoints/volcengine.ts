import { Buffer } from 'node:buffer';
import { Elysia } from 'elysia';
import { readSecret, SECRET_KEYS } from './secrets.js';

export const router = new Elysia({ prefix: '/api/volcengine' });

router.post('/generate-voice', async (context) => {
    const { set } = context;
    const body = context.body as Record<string, unknown>;
    const user = (context as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
    > | null;
    const directories = user?.directories as Record<string, string> | undefined;

    try {
        let provider_endpoint = body.provider_endpoint as string | undefined;
        if (!provider_endpoint) {
            console.warn('Volcengine endpoint not set, use default endpoint instead');
            provider_endpoint = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';
        }

        const appId = directories
            ? readSecret(directories as any, SECRET_KEYS.VOLCENGINE_APP_ID)
            : '';
        const accessKey = directories
            ? readSecret(directories as any, SECRET_KEYS.VOLCENGINE_ACCESS_KEY)
            : '';

        if (!appId || !accessKey) {
            console.warn(
                'Volcengine generate-voice request missing required parameters appId or accessKey',
            );
            set.status = 403;
            return;
        }

        const resourceId = body.resource_id as string;
        const text = body.text as string;
        const voice_speaker = body.voice_speaker as string;

        if (!resourceId || !text || !voice_speaker) {
            console.warn(
                'Volcengine generate-voice request missing required parameters resourceId or text or voice_speaker',
            );
            set.status = 400;
            return;
        }

        const response = await fetch(provider_endpoint, {
            method: 'POST',
            headers: {
                'X-Api-App-Id': appId || '',
                'X-Api-Access-Key': accessKey || '',
                'X-Api-Resource-Id': resourceId || '',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                req_params: {
                    text: text,
                    speaker: voice_speaker,
                    audio_params: {
                        format: 'mp3',
                        speech_rate: Number.parseInt((body.speed as string) || '0'),
                    },
                    additions: JSON.stringify({
                        mute_cut_threshold: '400',
                        mute_cut_remain_ms: '1',
                        explicit_language: 'crosslingual',
                        enable_language_detector: true,
                        disable_markdown_filter: true,
                        cache_config: {
                            use_cache: true,
                            text_type: 1,
                        },
                    }),
                },
            }),
        });

        if (!response.ok) {
            const logid = response.headers.get('X-Tt-Logid') || '';
            console.warn('Volcengine Request failed', response.status, response.statusText, logid);
            set.status = 500;
            set.headers['X-Tt-Logid'] = logid;
            return `TTS Generation Failed: ${response.statusText}`;
        }

        const decoder = new TextDecoder();
        const audioChunks: Buffer[] = [];
        let buffer = '';
        const reader = response.body?.getReader();
        if (!reader) {
            set.status = 500;
            return 'No response body';
        }

        // Read the stream manually
        let done = false;
        while (!done) {
            const result = await reader.read();
            done = result.done;
            if (result.value) {
                buffer += decoder.decode(result.value, { stream: !done });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const parsed = JSON.parse(line);
                        const { data, code, message } = parsed;
                        if (code !== 0 && code !== 20000000) {
                            throw new Error(`Volcengine TTS stream line code ${code}, ${message}`);
                        }
                        if (data) {
                            const audioData = Buffer.from(data as string, 'base64');
                            audioChunks.push(audioData);
                        }
                    } catch (e) {
                        if (e instanceof SyntaxError) {
                            // individual JSON parse error, continue
                        } else {
                            throw e;
                        }
                    }
                }
            }
        }

        // Process remaining buffer
        if (buffer.trim()) {
            try {
                const { code, data, message } = JSON.parse(buffer);
                if (code !== 0 && code !== 20000000) {
                    throw new Error(`Volcengine TTS stream line code ${code}, ${message}`);
                }
                if (data) {
                    const audioData = Buffer.from(data as string, 'base64');
                    audioChunks.push(audioData);
                }
            } catch (e) {
                if (!(e instanceof SyntaxError)) {
                    console.error('Error parsing final Volcengine TTS stream line:', e);
                }
            }
        }

        const finalAudioData = Buffer.concat(audioChunks);
        return new Response(finalAudioData, {
            headers: { 'Content-Type': 'audio/mpeg' },
        });
    } catch (error) {
        console.error('Volcengine generate-voice fetch failed', error);
        set.status = 500;
        return `TTS Generation Failed: ${error}`;
    }
});
