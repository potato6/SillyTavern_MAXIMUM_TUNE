import { Elysia } from 'elysia';
import { readSecret, SECRET_KEYS } from './secrets.js';

export const router = new Elysia({ prefix: '/api/minimax' });

// Audio format MIME type mapping
const getAudioMimeType = (format: string) => {
    const mimeTypes: Record<string, string> = {
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        pcm: 'audio/pcm',
        flac: 'audio/flac',
        aac: 'audio/aac',
    };
    return mimeTypes[format] || 'audio/mpeg';
};

router.post('/generate-voice', async (context) => {
    const { set } = context;
    const body = context.body as Record<string, unknown>;
    const user = context.user as Record<string, unknown> | null;
    const directories = user?.directories as Record<string, string> | undefined;

    try {
        const {
            text,
            voiceId,
            apiHost = 'https://api.minimax.io',
            model = 'speech-02-hd',
            speed = 1.0,
            volume = 1.0,
            pitch = 1.0,
            audioSampleRate = 32000,
            bitrate = 128000,
            format = 'mp3',
            language,
        } = body as Record<string, unknown>;

        const apiKey = directories ? readSecret(directories as any, SECRET_KEYS.MINIMAX) : '';
        const groupId = directories
            ? readSecret(directories as any, SECRET_KEYS.MINIMAX_GROUP_ID)
            : '';

        if (!text || !voiceId || !apiKey || !groupId) {
            console.warn('MiniMax TTS: Missing required parameters');
            set.status = 400;
            return {
                error: 'Missing required parameters: text, voiceId, apiKey, and groupId are required',
            };
        }

        const requestBody: Record<string, unknown> = {
            model: model,
            text: text,
            stream: false,
            voice_setting: {
                voice_id: voiceId,
                speed: Number(speed),
                vol: Number(volume),
                pitch: Number(pitch),
            },
            audio_setting: {
                sample_rate: Number(audioSampleRate),
                bitrate: Number(bitrate),
                format: format,
                channel: 1,
            },
        };

        if (language) {
            requestBody.lang = language;
        }

        const apiUrl = `${apiHost}/v1/t2a_v2?GroupId=${groupId}`;

        console.debug('MiniMax TTS Request:', {
            url: apiUrl,
            body: {
                ...requestBody,
                voice_setting: {
                    ...(requestBody.voice_setting as Record<string, unknown>),
                    voice_id: '[REDACTED]',
                },
            },
        });

        const apiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'MM-API-Source': 'SillyTavern-TTS',
            },
            body: JSON.stringify(requestBody),
        });

        if (!apiResponse.ok) {
            let errorMessage = `HTTP ${apiResponse.status}`;

            try {
                const errorData: any = await apiResponse.json();
                console.error('MiniMax TTS API error (JSON):', errorData);
                const baseResp = errorData?.base_resp;
                if (baseResp && baseResp.status_code !== 0) {
                    if (baseResp.status_code === 1004) {
                        errorMessage =
                            'Authentication failed - Please check your API key and API host';
                    } else {
                        errorMessage = `API Error: ${baseResp.status_msg}`;
                    }
                } else {
                    errorMessage =
                        errorData.error?.message ||
                        errorData.message ||
                        errorData.detail ||
                        `HTTP ${apiResponse.status}`;
                }
            } catch {
                try {
                    const errorText = await apiResponse.text();
                    console.error('MiniMax TTS API error (Text):', errorText);
                    if (errorText && errorText.length > 500) {
                        errorMessage = `HTTP ${apiResponse.status}: Response too large (${errorText.length} characters)`;
                    } else {
                        errorMessage = errorText || `HTTP ${apiResponse.status}`;
                    }
                } catch (textError) {
                    console.error('MiniMax TTS: Failed to read error response:', textError);
                    errorMessage = `HTTP ${apiResponse.status}: Unable to read error details`;
                }
            }

            console.error('MiniMax TTS API request failed:', errorMessage);
            set.status = 500;
            return { error: errorMessage };
        }

        let responseData: any;
        try {
            responseData = await apiResponse.json();
            console.debug('MiniMax TTS Response received');
        } catch (jsonError) {
            console.error('MiniMax TTS: Failed to parse response as JSON:', jsonError);
            set.status = 500;
            return { error: 'Invalid response format from MiniMax API' };
        }

        const baseResp = responseData?.base_resp;
        if (baseResp && baseResp.status_code !== 0) {
            let errorMessage: string;
            if (baseResp.status_code === 1004) {
                errorMessage = 'Authentication failed - Please check your API key and API host';
            } else {
                errorMessage = `API Error: ${baseResp.status_msg}`;
            }
            console.error('MiniMax TTS API error:', baseResp);
            set.status = 500;
            return { error: errorMessage };
        }

        // Handle audio data
        if (responseData.data?.audio) {
            const hexAudio = responseData.data.audio as string;

            if (!hexAudio || typeof hexAudio !== 'string') {
                console.error('MiniMax TTS: Invalid audio data format');
                set.status = 500;
                return { error: 'Invalid audio data format' };
            }

            const cleanHex = hexAudio.replace(/^0x/, '').replace(/\s/g, '');

            if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
                console.error('MiniMax TTS: Invalid hex string format');
                set.status = 500;
                return { error: 'Invalid audio data format' };
            }

            const paddedHex = cleanHex.length % 2 === 0 ? cleanHex : '0' + cleanHex;

            try {
                const hexMatches = paddedHex.match(/.{1,2}/g);
                if (!hexMatches) {
                    console.error('MiniMax TTS: Failed to parse hex string');
                    set.status = 500;
                    return { error: 'Invalid hex string format' };
                }
                const audioBytes = new Uint8Array(hexMatches.map((byte) => parseInt(byte, 16)));

                if (audioBytes.length === 0) {
                    console.error('MiniMax TTS: Audio conversion resulted in empty array');
                    set.status = 500;
                    return { error: 'Audio data conversion failed' };
                }

                console.debug(
                    `MiniMax TTS: Converted ${paddedHex.length} hex characters to ${audioBytes.length} bytes`,
                );

                const mimeType = getAudioMimeType(format as string);
                return new Response(audioBytes, {
                    headers: {
                        'Content-Type': mimeType,
                        'Content-Length': String(audioBytes.length),
                    },
                });
            } catch (conversionError) {
                console.error('MiniMax TTS: Audio conversion error:', conversionError);
                set.status = 500;
                return {
                    error: `Audio data conversion failed: ${(conversionError as Error).message}`,
                };
            }
        } else if (responseData.data?.url) {
            const audioUrl = responseData.data.url as string;
            console.debug('MiniMax TTS: Received audio URL:', audioUrl);

            try {
                const audioResponse = await fetch(audioUrl);
                if (!audioResponse.ok) {
                    console.error(
                        'MiniMax TTS: Failed to fetch audio from URL:',
                        audioResponse.status,
                    );
                    set.status = 500;
                    return { error: `Failed to fetch audio from URL: ${audioResponse.status}` };
                }

                const audioBuffer = await audioResponse.arrayBuffer();
                const mimeType = getAudioMimeType(format as string);

                return new Response(audioBuffer, {
                    headers: {
                        'Content-Type': mimeType,
                        'Content-Length': String(audioBuffer.byteLength),
                    },
                });
            } catch (urlError) {
                console.error('MiniMax TTS: Error fetching audio from URL:', urlError);
                const errMsg = (urlError as Error).message || 'Unknown error';
                set.status = 500;
                return { error: `Failed to fetch audio: ${errMsg}` };
            }
        } else {
            const errorMessage =
                responseData.base_resp?.status_msg ||
                responseData.error?.message ||
                'Unknown error';
            console.error('MiniMax TTS: No valid audio data in response:', responseData);
            set.status = 500;
            return { error: `API Error: ${errorMessage}` };
        }
    } catch (error) {
        console.error('MiniMax TTS generation failed:', error);
        set.status = 500;
        return { error: 'Internal server error' };
    }
});
