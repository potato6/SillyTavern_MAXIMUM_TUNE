import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { Elysia } from 'elysia';

import { getConfigValue, mergeObjectWithYaml, excludeKeysByYaml, trimV1, delay } from '../util.js';
import { setAdditionalHeadersByType } from '../additional-headers.js';
import { readSecret, SECRET_KEYS } from './secrets.js';
import {
    AIMLAPI_HEADERS,
    OPENROUTER_HEADERS,
    SILICONFLOW_ENDPOINT,
    ZAI_ENDPOINT,
} from '../constants.js';

export const router: any = new Elysia({ prefix: '/api/openai' });

router.post('/caption-image', async (context: any) => {
    const { set } = context;
    const body = context.body as Record<string, unknown>;
    const user = (context as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
    > | null;
    const directories = user?.directories as Record<string, string> | undefined;

    try {
        let key = '';
        const headers: Record<string, unknown> = {};
        const bodyParams: Record<string, unknown> = {};

        if (body.api === 'openai' && !body.reverse_proxy) {
            key = await readSecret(directories as any, SECRET_KEYS.OPENAI);
        }

        if (body.api === 'xai' && !body.reverse_proxy) {
            key = await readSecret(directories as any, SECRET_KEYS.XAI);
        }

        if (body.api === 'mistral' && !body.reverse_proxy) {
            key = await readSecret(directories as any, SECRET_KEYS.MISTRALAI);
        }

        if (body.reverse_proxy && body.proxy_password) {
            key = body.proxy_password as string;
        }

        if (body.api === 'custom') {
            key = await readSecret(directories as any, SECRET_KEYS.CUSTOM);
            mergeObjectWithYaml(bodyParams, body.custom_include_body as string);
            mergeObjectWithYaml(headers, body.custom_include_headers as string);
        }

        if (body.api === 'openrouter') {
            key = await readSecret(directories as any, SECRET_KEYS.OPENROUTER);
        }

        if (body.api === 'ooba') {
            key = await readSecret(directories as any, SECRET_KEYS.OOBA);
            bodyParams.temperature = 0.1;
        }

        if (body.api === 'koboldcpp') {
            key = await readSecret(directories as any, SECRET_KEYS.KOBOLDCPP);
        }

        if (body.api === 'llamacpp') {
            key = await readSecret(directories as any, SECRET_KEYS.LLAMACPP);
        }

        if (body.api === 'vllm') {
            key = await readSecret(directories as any, SECRET_KEYS.VLLM);
        }

        if (body.api === 'aimlapi') {
            key = await readSecret(directories as any, SECRET_KEYS.AIMLAPI);
        }

        if (body.api === 'groq') {
            key = await readSecret(directories as any, SECRET_KEYS.GROQ);
        }

        if (body.api === 'cohere') {
            key = await readSecret(directories as any, SECRET_KEYS.COHERE);
        }

        if (body.api === 'moonshot' && !body.reverse_proxy) {
            key = await readSecret(directories as any, SECRET_KEYS.MOONSHOT);
        }

        if (body.api === 'nanogpt') {
            key = await readSecret(directories as any, SECRET_KEYS.NANOGPT);
        }

        if (body.api === 'chutes') {
            key = await readSecret(directories as any, SECRET_KEYS.CHUTES);
        }

        if (body.api === 'electronhub') {
            key = await readSecret(directories as any, SECRET_KEYS.ELECTRONHUB);
        }

        if (body.api === 'zai' && !body.reverse_proxy) {
            key = await readSecret(directories as any, SECRET_KEYS.ZAI);
        }

        if (body.api === 'zai') {
            bodyParams.max_tokens = 4096; // default is 1024
        }

        if (body.api === 'pollinations') {
            key = await readSecret(directories as any, SECRET_KEYS.POLLINATIONS);
            bodyParams.seed = Math.floor(Math.random() * Math.pow(2, 32));
        }

        if (body.api === 'workers_ai') {
            key = await readSecret(directories as any, SECRET_KEYS.WORKERS_AI);
        }

        const noKeyTypes = ['custom', 'ooba', 'koboldcpp', 'vllm', 'llamacpp'];
        if (!key && !body.reverse_proxy && !noKeyTypes.includes(body.api as string)) {
            console.warn('No key found for API', body.api);
            set.status = 400;
            return;
        }

        const captionBody: Record<string, unknown> = {
            model: body.model,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: body.prompt },
                        { type: 'image_url', image_url: { url: body.image } },
                    ],
                },
            ],
            ...bodyParams,
        };

        const captionSystemPrompt = getConfigValue('openai.captionSystemPrompt');
        if (captionSystemPrompt) {
            (captionBody.messages as Array<Record<string, unknown>>).unshift({
                role: 'system',
                content: captionSystemPrompt,
            });
        }

        if (body.api === 'custom') {
            excludeKeysByYaml(captionBody, body.custom_exclude_body as string);
        }

        let apiUrl = '';

        if (body.api === 'openrouter') {
            apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
            Object.assign(headers, OPENROUTER_HEADERS);
        }

        if (body.api === 'openai') {
            apiUrl = 'https://api.openai.com/v1/chat/completions';
        }

        if (body.reverse_proxy) {
            apiUrl = `${body.reverse_proxy as string}/chat/completions`;
        }

        if (body.api === 'custom') {
            apiUrl = `${body.server_url as string}/chat/completions`;
        }

        if (body.api === 'aimlapi') {
            apiUrl = 'https://api.aimlapi.com/v1/chat/completions';
            Object.assign(headers, AIMLAPI_HEADERS);
        }

        if (body.api === 'groq') {
            apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
            const messages = captionBody.messages as Array<Record<string, unknown>>;
            if (messages?.[0]?.role === 'system') {
                messages[0].role = 'user';
            }
        }

        if (body.api === 'mistral') {
            apiUrl = 'https://api.mistral.ai/v1/chat/completions';
        }

        if (body.api === 'cohere') {
            apiUrl = 'https://api.cohere.ai/v2/chat';
        }

        if (body.api === 'xai') {
            apiUrl = 'https://api.x.ai/v1/chat/completions';
        }

        if (body.api === 'pollinations') {
            apiUrl = 'https://gen.pollinations.ai/v1/chat/completions';
        }

        if (body.api === 'moonshot' && !body.reverse_proxy) {
            apiUrl = 'https://api.moonshot.ai/v1/chat/completions';
        }

        if (body.api === 'nanogpt') {
            apiUrl = 'https://nano-gpt.com/api/v1/chat/completions';
        }

        if (body.api === 'chutes') {
            apiUrl = 'https://llm.chutes.ai/v1/chat/completions';
        }

        if (body.api === 'electronhub') {
            apiUrl = 'https://api.electronhub.ai/v1/chat/completions';
        }

        if (body.api === 'zai' && !body.reverse_proxy) {
            apiUrl =
                body.zai_endpoint === ZAI_ENDPOINT.CODING
                    ? 'https://api.z.ai/api/coding/paas/v4/chat/completions'
                    : 'https://api.z.ai/api/paas/v4/chat/completions';
        }

        // Handle video inlining for Z.AI
        if (body.api === 'zai' && /data:video\/\w+;base64,/.test(body.image as string)) {
            const messages = captionBody.messages as Array<Record<string, unknown>>;
            const message = messages.find((msg) => Array.isArray(msg.content));
            if (message) {
                const content = message.content as Array<Record<string, unknown>>;
                const imgContent = content.find((c) => c.type === 'image_url');
                if (imgContent) {
                    imgContent.type = 'video_url';
                    imgContent.video_url = imgContent.image_url;
                    delete imgContent.image_url;
                }
            }
        }

        if (body.api === 'workers_ai') {
            const accountId = String(body.workers_ai_account_id || '').trim();
            if (!accountId) {
                set.status = 400;
                return { error: 'Cloudflare Workers AI Account ID is required' };
            }
            apiUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1/chat/completions`;
        }

        if (['koboldcpp', 'vllm', 'llamacpp', 'ooba'].includes(body.api as string)) {
            apiUrl = `${trimV1(body.server_url as string)}/v1/chat/completions`;
        }

        if (body.api === 'ooba') {
            const messages = captionBody.messages as Array<Record<string, unknown>>;
            const imgMessage = messages.pop();
            messages.push({
                role: 'user',
                content: (imgMessage?.content as Array<Record<string, unknown>>)?.[0]?.text,
            });
            messages.push({
                role: 'user',
                content: [],
                image_url: (
                    (imgMessage?.content as Array<Record<string, unknown>> | undefined)?.[1]
                        ?.image_url as { url?: string }
                )?.url,
            });
        }

        setAdditionalHeadersByType(
            headers,
            (body.api_type as string) || '',
            apiUrl,
            directories as any,
            body.secret_id as string | null,
        );
        console.debug('Multimodal captioning request', captionBody);

        const result = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `*** ${key}`,
                ...headers,
            } as Record<string, string>,
            body: JSON.stringify(captionBody),
        });

        if (!result.ok) {
            const text = await result.text();
            console.warn('Multimodal captioning request failed', result.statusText, text);
            set.status = 500;
            return text;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic OpenAI API response
        const data: any = await result.json();
        console.info('Multimodal captioning response', data);
        const caption = data?.choices?.[0]?.message?.content ?? data?.message?.content?.[0]?.text;

        if (!caption) {
            set.status = 500;
            return 'No caption found';
        }

        return { caption };
    } catch (error) {
        console.error(error);
        set.status = 500;
        return 'Internal server error';
    }
});

router.post('/generate-voice', async (context: any) => {
    const { set } = context;
    const body = context.body as Record<string, unknown>;
    const user = (context as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
    > | null;
    const directories = user?.directories as Record<string, string> | undefined;

    try {
        const key = await readSecret(directories as any, SECRET_KEYS.OPENAI);

        if (!key) {
            console.warn('No OpenAI key found');
            set.status = 400;
            return;
        }

        const requestBody: Record<string, unknown> = {
            input: body.text,
            response_format: 'mp3',
            voice: body.voice ?? 'alloy',
            speed: body.speed ?? 1,
            model: body.model ?? 'tts-1',
        };

        if (body.instructions) {
            requestBody.instructions = body.instructions;
        }

        console.debug('OpenAI TTS request', requestBody);

        const result = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `*** ${key}`,
            },
            body: JSON.stringify(requestBody),
        });

        if (!result.ok) {
            const text = await result.text();
            console.warn('OpenAI request failed', result.statusText, text);
            set.status = 500;
            return text;
        }

        const buffer = await result.arrayBuffer();
        return new Response(Buffer.from(buffer), {
            headers: {
                'Content-Type': 'audio/mpeg',
            },
        });
    } catch (error) {
        console.error('OpenAI TTS generation failed', error);
        set.status = 500;
        return 'Internal server error';
    }
});

// ElectronHub TTS proxy
router.post('/electronhub/generate-voice', async (context: any) => {
    const { set } = context;
    const body = context.body as Record<string, unknown>;
    const user = (context as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
    > | null;
    const directories = user?.directories as Record<string, string> | undefined;

    try {
        const key = await readSecret(directories as any, SECRET_KEYS.ELECTRONHUB);

        if (!key) {
            console.warn('No ElectronHub key found');
            set.status = 400;
            return;
        }

        const requestBody: Record<string, unknown> = {
            input: body.input,
            voice: body.voice,
            speed: body.speed ?? 1,
            temperature: body.temperature ?? undefined,
            model: body.model || 'tts-1',
            response_format: 'mp3',
        };

        // Optional provider-specific params
        if (body.instructions) requestBody.instructions = body.instructions;
        if (body.speaker_transcript) requestBody.speaker_transcript = body.speaker_transcript;
        if (Number.isFinite(body.cfg_scale)) requestBody.cfg_scale = Number(body.cfg_scale);
        if (Number.isFinite(body.cfg_filter_top_k))
            requestBody.cfg_filter_top_k = Number(body.cfg_filter_top_k);
        if (Number.isFinite(body.speech_rate)) requestBody.speech_rate = Number(body.speech_rate);
        if (Number.isFinite(body.pitch_adjustment))
            requestBody.pitch_adjustment = Number(body.pitch_adjustment);
        if (body.emotional_style) requestBody.emotional_style = body.emotional_style;

        // Handle dynamic parameters sent from the frontend
        const knownParams = new Set(Object.keys(requestBody));
        for (const key in body) {
            if (!knownParams.has(key) && body[key] !== undefined) {
                requestBody[key] = body[key];
            }
        }

        // Clean undefineds
        Object.keys(requestBody).forEach(
            (k) => requestBody[k] === undefined && delete requestBody[k],
        );

        console.debug('ElectronHub TTS request', requestBody);

        const result = await fetch('https://api.electronhub.ai/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `*** ${key}`,
            },
            body: JSON.stringify(requestBody),
        });

        if (!result.ok) {
            const text = await result.text();
            console.warn('ElectronHub TTS request failed', result.statusText, text);
            set.status = 500;
            return text;
        }

        const contentType = result.headers.get('content-type') || 'audio/mpeg';
        const buffer = await result.arrayBuffer();
        return new Response(Buffer.from(buffer), {
            headers: {
                'Content-Type': contentType,
            },
        });
    } catch (error) {
        console.error('ElectronHub TTS generation failed', error);
        set.status = 500;
        return 'Internal server error';
    }
});

// ElectronHub model list
router.post('/electronhub/models', async (context: any) => {
    const { set } = context;
    const user = (context as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
    > | null;
    const directories = user?.directories as Record<string, string> | undefined;

    try {
        const key = await readSecret(directories as any, SECRET_KEYS.ELECTRONHUB);

        if (!key) {
            console.warn('No ElectronHub key found');
            set.status = 400;
            return;
        }

        const result = await fetch('https://api.electronhub.ai/v1/models', {
            method: 'GET',
            headers: {
                Authorization: `*** ${key}`,
            },
        });

        if (!result.ok) {
            const text = await result.text();
            console.warn('ElectronHub models request failed', result.statusText, text);
            set.status = 500;
            return text;
        }
        const data = (await result.json()) as Record<string, unknown>;
        const models = data && Array.isArray(data.data) ? data.data : [];
        return models;
    } catch (error) {
        console.error('ElectronHub models fetch failed', error);
        set.status = 500;
        return 'Internal server error';
    }
});

// Chutes TTS
router.post('/chutes/generate-voice', async (context: any) => {
    const { set } = context;
    const body = context.body as Record<string, unknown>;
    const user = (context as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
    > | null;
    const directories = user?.directories as Record<string, string> | undefined;

    try {
        const key = await readSecret(directories as any, SECRET_KEYS.CHUTES);

        if (!key) {
            console.warn('No Chutes key found');
            set.status = 400;
            return;
        }

        const requestBody = {
            text: body.input,
            voice: body.voice || 'af_heart',
            speed: body.speed || 1,
        };

        console.debug('Chutes TTS request', requestBody);

        const result = await fetch('https://chutes-kokoro.chutes.ai/speak', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `*** ${key}`,
            },
            body: JSON.stringify(requestBody),
        });

        if (!result.ok) {
            const text = await result.text();
            console.warn('Chutes TTS request failed', result.statusText, text);
            set.status = 500;
            return text;
        }

        const contentType = result.headers.get('content-type') || 'audio/mpeg';
        const buffer = await result.arrayBuffer();
        return new Response(Buffer.from(buffer), {
            headers: {
                'Content-Type': contentType,
            },
        });
    } catch (error) {
        console.error('Chutes TTS generation failed', error);
        set.status = 500;
        return 'Internal server error';
    }
});

router.post('/chutes/models/embedding', async (context: any) => {
    const { set } = context;
    const user = (context as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
    > | null;
    const directories = user?.directories as Record<string, string> | undefined;

    try {
        const key = await readSecret(directories as any, SECRET_KEYS.CHUTES);

        if (!key) {
            console.warn('No Chutes key found');
            set.status = 400;
            return;
        }

        const result = await fetch(
            'https://api.chutes.ai/chutes/?template=embedding&include_public=true&limit=999',
            {
                method: 'GET',
                headers: {
                    Authorization: `*** ${key}`,
                },
            },
        );

        if (!result.ok) {
            const text = await result.text();
            console.warn('Chutes embedding models request failed', result.statusText, text);
            set.status = 500;
            return text;
        }

        const data = (await result.json()) as Record<string, unknown>;

        if (!Array.isArray(data?.items)) {
            console.warn('Chutes embedding models response invalid', data);
            set.status = 500;
            return;
        }
        return data.items;
    } catch (error) {
        console.error('Chutes embedding models fetch failed', error);
        set.status = 500;
    }
});

router.post('/nanogpt/models/embedding', async (context: any) => {
    const { set } = context;
    const user = (context as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
    > | null;
    const directories = user?.directories as Record<string, string> | undefined;

    try {
        const key = await readSecret(directories as any, SECRET_KEYS.NANOGPT);

        if (!key) {
            console.warn('No NanoGPT key found');
            set.status = 400;
            return;
        }

        const result = await fetch('https://nano-gpt.com/api/v1/embedding-models', {
            method: 'GET',
            headers: {
                Authorization: `*** ${key}`,
                'Accept-Encoding': 'identity',
            },
        });

        if (!result.ok) {
            const text = await result.text();
            console.warn('NanoGPT embedding models request failed', result.statusText, text);
            set.status = 500;
            return text;
        }

        const data = (await result.json()) as Record<string, unknown>;

        if (!Array.isArray(data?.data)) {
            console.warn('NanoGPT embedding models response invalid', data);
            set.status = 500;
            return;
        }
        return data.data;
    } catch (error) {
        console.error('NanoGPT embedding models fetch failed', error);
        set.status = 500;
    }
});

router.post('/siliconflow/models/embedding', async (context: any) => {
    const { set } = context;
    const body = context.body as Record<string, unknown>;
    const user = (context as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
    > | null;
    const directories = user?.directories as Record<string, string> | undefined;

    try {
        const key = await readSecret(directories as any, SECRET_KEYS.SILICONFLOW);

        if (!key) {
            console.warn('No SiliconFlow key found');
            set.status = 400;
            return;
        }

        const apiUrl =
            body.siliconflow_endpoint === SILICONFLOW_ENDPOINT.CN
                ? 'https://api.siliconflow.cn/v1/models?type=text&sub_type=embedding'
                : 'https://api.siliconflow.com/v1/models?type=text&sub_type=embedding';

        const result = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                Authorization: `*** ${key}`,
            },
        });

        if (!result.ok) {
            const text = await result.text();
            console.warn('SiliconFlow embedding models request failed', result.statusText, text);
            set.status = 500;
            return text;
        }

        const data = (await result.json()) as Record<string, unknown>;

        if (!Array.isArray(data?.data)) {
            console.warn('SiliconFlow embedding models response invalid', data);
            set.status = 500;
            return;
        }

        return data.data;
    } catch (error) {
        console.error('SiliconFlow embedding models fetch failed', error);
        set.status = 500;
    }
});

router.post('/workers-ai/models/embedding', async (context: any) => {
    const { set } = context;
    const body = context.body as Record<string, unknown>;
    const user = (context as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
    > | null;
    const directories = user?.directories as Record<string, string> | undefined;

    try {
        const key = await readSecret(directories as any, SECRET_KEYS.WORKERS_AI);

        if (!key) {
            console.warn('No Workers AI key found');
            set.status = 400;
            return;
        }

        const accountId = String(body.workers_ai_account_id || '').trim();
        if (!accountId) {
            console.warn('No Workers AI account ID found');
            set.status = 400;
            return;
        }

        const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search?task=Text+Embeddings&per_page=100`;
        const result = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                Authorization: `*** ${key}`,
            },
        });

        if (!result.ok) {
            const text = await result.text();
            console.warn('Workers AI embedding models request failed', result.statusText, text);
            set.status = 500;
            return text;
        }

        const data = (await result.json()) as Record<string, unknown>;

        if (!Array.isArray(data?.result)) {
            console.warn('Workers AI embedding models response invalid', data);
            set.status = 500;
            return;
        }

        return (data.result as Array<Record<string, unknown>>).map((m) => ({
            ...m,
            id: m.name,
        }));
    } catch (error) {
        console.error('Workers AI embedding models fetch failed', error);
        set.status = 500;
    }
});

router.post('/generate-image', async (context: any) => {
    const { set } = context;
    const body = context.body as Record<string, unknown>;
    const user = (context as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
    > | null;
    const directories = user?.directories as Record<string, string> | undefined;

    try {
        const key = await readSecret(directories as any, SECRET_KEYS.OPENAI);

        if (!key) {
            console.warn('No OpenAI key found');
            set.status = 400;
            return;
        }

        console.debug('OpenAI request', body);

        const result = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `*** ${key}`,
            },
            body: JSON.stringify(body),
        });

        if (!result.ok) {
            const text = await result.text();
            console.warn('OpenAI request failed', result.statusText, text);
            set.status = 500;
            return text;
        }

        const data = (await result.json()) as Record<string, unknown>;
        return data;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return 'Internal server error';
    }
});

router.post('/generate-video', async (context: any) => {
    const { set } = context;
    const body = context.body as Record<string, unknown>;
    const user = (context as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
    > | null;
    const directories = user?.directories as Record<string, string> | undefined;

    try {
        const controller = new AbortController();
        const signal = context.request.signal;
        if (signal) {
            signal.addEventListener('abort', () => controller.abort(), { once: true });
        }

        const key = await readSecret(directories as any, SECRET_KEYS.OPENAI);

        if (!key) {
            console.warn('No OpenAI key found');
            set.status = 400;
            return;
        }

        console.debug('OpenAI video generation request', body);

        const videoJobResponse = await fetch('https://api.openai.com/v1/videos', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `*** ${key}`,
            },
            body: JSON.stringify({
                prompt: body.prompt,
                model: body.model || 'sora-2',
                size: body.size || '720x1280',
                seconds: body.seconds || '8',
            }),
        });

        if (!videoJobResponse.ok) {
            const text = await videoJobResponse.text();
            console.warn(
                'OpenAI video generation request failed',
                videoJobResponse.statusText,
                text,
            );
            set.status = 500;
            return text;
        }

        const videoJob = (await videoJobResponse.json()) as Record<string, unknown>;

        if (!videoJob || !videoJob.id) {
            console.warn('OpenAI video generation returned no job ID', videoJob);
            set.status = 500;
            return 'No video job ID returned';
        }

        // Poll for video generation completion
        for (let attempt = 0; attempt < 30; attempt++) {
            if (controller.signal.aborted) {
                console.info('OpenAI video generation aborted by client');
                set.status = 500;
                return 'Video generation aborted by client';
            }

            await delay(5000 + attempt * 1000);
            console.debug(
                `Polling OpenAI video job ${String(videoJob.id)}, attempt ${attempt + 1}`,
            );

            const pollResponse = await fetch(
                `https://api.openai.com/v1/videos/${String(videoJob.id)}`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `*** ${key}`,
                    },
                },
            );

            if (!pollResponse.ok) {
                const text = await pollResponse.text();
                console.warn('OpenAI video job polling failed', pollResponse.statusText, text);
                set.status = 500;
                return text;
            }

            const pollResult = (await pollResponse.json()) as Record<string, unknown>;
            console.debug(
                `OpenAI video job status: ${String(pollResult.status)}, progress: ${String(pollResult.progress)}`,
            );

            if (pollResult.status === 'failed') {
                console.warn('OpenAI video generation failed', pollResult);
                set.status = 500;
                return 'Video generation failed';
            }

            if (pollResult.status === 'completed') {
                const contentResponse = await fetch(
                    `https://api.openai.com/v1/videos/${String(videoJob.id)}/content`,
                    {
                        method: 'GET',
                        headers: {
                            Authorization: `*** ${key}`,
                        },
                    },
                );

                if (!contentResponse.ok) {
                    const text = await contentResponse.text();
                    console.warn(
                        'OpenAI video content fetch failed',
                        contentResponse.statusText,
                        text,
                    );
                    set.status = 500;
                    return text;
                }

                const contentBuffer = await contentResponse.arrayBuffer();
                return {
                    format: 'mp4',
                    data: Buffer.from(contentBuffer).toString('base64'),
                };
            }
        }
    } catch (error) {
        console.error('OpenAI video generation failed', error);
        set.status = 500;
        return 'Internal server error';
    }
});

const custom = new Elysia({ prefix: '/custom' });

custom.post('/generate-voice', async (context) => {
    const { set } = context;
    const body = context.body as Record<string, unknown>;
    const user = (context as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
    > | null;
    const directories = user?.directories as Record<string, string> | undefined;

    try {
        const key = await readSecret(directories as any, SECRET_KEYS.CUSTOM_OPENAI_TTS);
        const { input, provider_endpoint, response_format, voice, speed, model } = body;

        if (!provider_endpoint) {
            console.warn('No OpenAI-compatible TTS provider endpoint provided');
            set.status = 400;
            return;
        }

        const result = await fetch(provider_endpoint as string, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `*** ${key ?? ''}`,
            },
            body: JSON.stringify({
                input: input ?? '',
                response_format: response_format ?? 'mp3',
                voice: voice ?? 'alloy',
                speed: speed ?? 1,
                model: model ?? 'tts-1',
            }),
        });

        if (!result.ok) {
            const text = await result.text();
            console.warn('OpenAI request failed', result.statusText, text);
            set.status = 500;
            return text;
        }

        const buffer = await result.arrayBuffer();
        return new Response(Buffer.from(buffer), {
            headers: {
                'Content-Type': 'audio/mpeg',
            },
        });
    } catch (error) {
        console.error('OpenAI TTS generation failed', error);
        set.status = 500;
        return 'Internal server error';
    }
});

router.use(custom);

/**
 * Creates a transcribe-audio endpoint handler for a given provider.
 * @param {object} config - Provider configuration
 * @param {string} config.secretKey - The SECRET_KEYS enum value for the provider
 * @param {string} config.apiUrl - The transcription API endpoint URL
 * @param {string} config.providerName - Display name for logging
 * @returns {Function} Elysia request handler
 */
function createTranscribeHandler({
    secretKey,
    apiUrl,
    providerName,
}: {
    secretKey: string;
    apiUrl: string;
    providerName: string;
}) {
    return async (context: any) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const file = (context as unknown as Record<string, unknown>).file as Record<
            string,
            unknown
        > | null;

        try {
            const key = await readSecret(directories as any, secretKey);

            if (!key) {
                console.warn(`No ${providerName} key found`);
                set.status = 400;
                return;
            }

            if (!file) {
                console.warn('No audio file found');
                set.status = 400;
                return;
            }

            console.info(`Processing audio file with ${providerName}`, file.path);
            const fileBuffer = fs.readFileSync(file.path as string);
            const formData = new FormData();
            formData.append('file', new Blob([fileBuffer], { type: 'audio/wav' }), 'audio.wav');
            formData.append('model', body.model as string);

            if (body.language) {
                formData.append('language', body.language as string);
            }

            const result = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    Authorization: `*** ${key}`,
                },
                body: formData,
            });

            if (!result.ok) {
                const text = await result.text();
                console.warn(`${providerName} request failed`, result.statusText, text);
                set.status = 500;
                return text;
            }

            fs.unlinkSync(file.path as string);
            const data = (await result.json()) as Record<string, unknown>;
            console.debug(`${providerName} transcription response`, data);
            return data;
        } catch (error) {
            console.error(`${providerName} transcription failed`, error);
            set.status = 500;
            return 'Internal server error';
        }
    };
}

router.post(
    '/transcribe-audio',
    createTranscribeHandler({
        secretKey: SECRET_KEYS.OPENAI,
        apiUrl: 'https://api.openai.com/v1/audio/transcriptions',
        providerName: 'OpenAI',
    }),
);

router.post(
    '/groq/transcribe-audio',
    createTranscribeHandler({
        secretKey: SECRET_KEYS.GROQ,
        apiUrl: 'https://api.groq.com/openai/v1/audio/transcriptions',
        providerName: 'Groq',
    }),
);

router.post(
    '/mistral/transcribe-audio',
    createTranscribeHandler({
        secretKey: SECRET_KEYS.MISTRALAI,
        apiUrl: 'https://api.mistral.ai/v1/audio/transcriptions',
        providerName: 'MistralAI',
    }),
);

router.post(
    '/zai/transcribe-audio',
    createTranscribeHandler({
        secretKey: SECRET_KEYS.ZAI,
        apiUrl: 'https://api.z.ai/api/paas/v4/audio/transcriptions',
        providerName: 'Z.AI',
    }),
);

router.post('/chutes/transcribe-audio', async (context: any) => {
    const { set } = context;
    const body = context.body as Record<string, unknown>;
    const user = (context as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
    > | null;
    const directories = user?.directories as Record<string, string> | undefined;
    const file = (context as unknown as Record<string, unknown>).file as Record<
        string,
        unknown
    > | null;

    try {
        const key = await readSecret(directories as any, SECRET_KEYS.CHUTES);

        if (!key) {
            console.warn('No Chutes key found');
            set.status = 400;
            return;
        }

        if (!file) {
            console.warn('No audio file found');
            set.status = 400;
            return;
        }

        console.info('Processing audio file with Chutes', file.path);
        const audioBase64 = fs.readFileSync(file.path as string).toString('base64');

        const result = await fetch(`https://${String(body.model)}.chutes.ai/transcribe`, {
            method: 'POST',
            headers: {
                Authorization: `*** ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                audio_b64: audioBase64,
            }),
        });

        if (!result.ok) {
            const text = await result.text();
            console.warn('Chutes request failed', result.statusText, text);
            set.status = 500;
            return text;
        }

        fs.unlinkSync(file.path as string);
        const data = (await result.json()) as Array<Record<string, unknown>>;
        console.debug('Chutes transcription response', data);

        if (!Array.isArray(data)) {
            console.warn('Chutes transcription response invalid', data);
            set.status = 500;
            return;
        }

        const fullText = data
            .map((chunk) => String(chunk.text || ''))
            .join('')
            .trim();
        return { text: fullText };
    } catch (error) {
        console.error('Chutes transcription failed', error);
        set.status = 500;
        return 'Internal server error';
    }
});
