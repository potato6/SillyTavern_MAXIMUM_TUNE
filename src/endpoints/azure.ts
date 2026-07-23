import { Elysia } from 'elysia';
import { readSecret, SECRET_KEYS } from './secrets.js';

export const router = new Elysia({ prefix: '/api/azure' })
    .post('/list', async (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const bodyAny = body as Record<string, unknown>;

        try {
            const key = directories ? readSecret(directories as any, SECRET_KEYS.AZURE_TTS) : '';

            if (!key) {
                console.warn('Azure TTS API Key not set');
                set.status = 403;
                return;
            }

            const region = bodyAny.region as string;
            if (!region) {
                console.warn('Azure TTS region not set');
                set.status = 400;
                return;
            }

            const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`;

            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Ocp-Apim-Subscription-Key': key },
            });

            if (!response.ok) {
                console.warn('Azure Request failed', response.status, response.statusText);
                set.status = 500;
                return;
            }

            return await response.json();
        } catch (error) {
            console.error('Azure Request failed', error);
            set.status = 500;
        }
    })
    .post('/generate', async (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const bodyAny = body as Record<string, unknown>;

        try {
            const key = directories ? readSecret(directories as any, SECRET_KEYS.AZURE_TTS) : '';

            if (!key) {
                console.warn('Azure TTS API Key not set');
                set.status = 403;
                return;
            }

            const text = bodyAny.text as string;
            const voice = bodyAny.voice as string;
            const region = bodyAny.region as string;
            if (!text || !voice || !region) {
                console.warn('Missing required parameters');
                set.status = 400;
                return;
            }

            const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
            const lang = String(voice).split('-').slice(0, 2).join('-');
            const escapedText = String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'><voice xml:lang='${lang}' name='${voice}'>${escapedText}</voice></speak>`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Ocp-Apim-Subscription-Key': key,
                    'Content-Type': 'application/ssml+xml',
                    'X-Microsoft-OutputFormat': 'webm-24khz-16bit-mono-opus',
                },
                body: ssml,
            });

            if (!response.ok) {
                console.warn('Azure Request failed', response.status, response.statusText);
                set.status = 500;
                return;
            }

            // Return raw audio with correct content type
            const audio = await response.arrayBuffer();
            return new Response(audio, { headers: { 'Content-Type': 'audio/ogg' } });
        } catch (error) {
            console.error('Azure Request failed', error);
            set.status = 500;
        }
    });
