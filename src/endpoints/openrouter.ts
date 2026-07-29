import { Elysia } from 'elysia';
import mime from 'mime-types';
import { readSecret, SECRET_KEYS } from './secrets.js';
import { OPENROUTER_HEADERS } from '../constants.js';

export const router = new Elysia({ prefix: '/api/openrouter', aot: false });
const API_OPENROUTER = 'https://openrouter.ai/api/v1';

/**
 * Fetches the full list of available OpenRouter providers.
 * Cached in-memory with a 1-hour TTL.
 */
let _providersCache: string[] | null = null;
let _providersCacheTime = 0;

router.get('/providers', async () => {
    try {
        if (_providersCache && Date.now() - _providersCacheTime < 3600_000) {
            return _providersCache;
        }
        const response = await fetch(`${API_OPENROUTER}/providers`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) return _providersCache ?? [];
        const data = (await response.json()) as { data?: string[] };
        _providersCache = data?.data ?? [];
        _providersCacheTime = Date.now();
        return _providersCache;
    } catch (error) {
        console.error(error);
        return _providersCache ?? [];
    }
});

router.post('/models/providers', async (context) => {
    const body = context.body as Record<string, unknown>;
    try {
        const { model } = body as { model: string };
        const response = await fetch(`${API_OPENROUTER}/models/${model}/endpoints`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            return [];
        }

        const data: any = await response.json();
        const endpoints = data?.data?.endpoints || [];
        const providerNames = endpoints.map((e: { provider_name: string }) => e.provider_name);

        return providerNames;
    } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
    }
});

/**
 * Fetches and filters models from OpenRouter API based on modality criteria.
 */
async function fetchModelsByModality(
    endpoint: string,
    inputModality: string,
    outputModality: string,
    mapFn: ((model: Record<string, unknown>) => unknown) | null = null,
) {
    const response = await fetch(
        `${API_OPENROUTER}${endpoint}?output_modalities=${encodeURIComponent(outputModality)}`,
        {
            method: 'GET',
            headers: { Accept: 'application/json' },
        },
    );

    if (!response.ok) {
        console.warn('OpenRouter API request failed', response.statusText);
        return [];
    }

    const data = (await response.json()) as Record<string, unknown>;

    if (!Array.isArray(data?.data)) {
        console.warn('OpenRouter API response was not an array');
        return [];
    }

    const filtered = (data.data as Array<Record<string, unknown>>)
        .filter((m) =>
            Array.isArray(
                (m?.architecture as Record<string, unknown> | undefined)?.input_modalities,
            ),
        )
        .filter(
            (m) =>
                (
                    m.architecture as Record<string, string[]> | undefined
                )?.input_modalities?.includes(inputModality) ?? false,
        )
        .filter((m) =>
            Array.isArray(
                (m?.architecture as Record<string, unknown> | undefined)?.output_modalities,
            ),
        )
        .filter(
            (m) =>
                (
                    m.architecture as Record<string, string[]> | undefined
                )?.output_modalities?.includes(outputModality) ?? false,
        )
        .toSorted((a, b) => (a.id as string)?.localeCompare(b.id as string) || 0);

    return typeof mapFn === 'function' ? filtered.map(mapFn) : filtered;
}

router.post('/models/multimodal', async () => {
    try {
        const models = await fetchModelsByModality(
            '/models',
            'image',
            'text',
            (m: Record<string, unknown>) => m.id,
        );
        return models;
    } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
    }
});

router.post('/models/embedding', async () => {
    try {
        const models = await fetchModelsByModality(
            '/models',
            'text',
            'embeddings',
            (m: Record<string, unknown>) => ({ id: m.id, name: m.name }),
        );
        return models;
    } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
    }
});

router.post('/models/image', async () => {
    try {
        const models = await fetchModelsByModality(
            '/models',
            'text',
            'image',
            (m: Record<string, unknown>) => ({ value: m.id, text: m.name || m.id }),
        );
        return models;
    } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
    }
});

router.post('/credits', async (context) => {
    const { set } = context;
    const user = context.user as Record<string, unknown> | null;
    const directories = user?.directories as Record<string, string> | undefined;

    try {
        const key = directories ? readSecret(directories as any, SECRET_KEYS.OPENROUTER) : '';

        if (!key) {
            console.warn('OpenRouter API key not found');
            set.status = 400;
            return;
        }

        const response = await fetch(`${API_OPENROUTER}/credits`, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${key}`,
            },
        });

        if (!response.ok) {
            console.warn('OpenRouter credits request failed', response.statusText);
            set.status = 500;
            return;
        }

        const data: any = await response.json();
        const totalCredits = data.data?.total_credits ?? 0;
        const totalUsage = data.data?.total_usage ?? 0;
        const remaining = totalCredits - totalUsage;

        return { remaining, total_credits: totalCredits, total_usage: totalUsage };
    } catch (error) {
        console.error(error);
        set.status = 500;
    }
});

router.post('/image/generate', async (context) => {
    const { body, set } = context;
    const bodyAny = body as Record<string, unknown>;
    const user = context.user as Record<string, unknown> | null;
    const directories = user?.directories as Record<string, string> | undefined;

    try {
        const key = directories ? readSecret(directories as any, SECRET_KEYS.OPENROUTER) : '';

        if (!key) {
            console.warn('OpenRouter API key not found');
            set.status = 400;
            return { error: 'OpenRouter API key not found' };
        }

        console.debug('OpenRouter image generation request', body);

        const { model, prompt } = bodyAny as { model: string; prompt: string };

        if (!model || !prompt) {
            set.status = 400;
            return { error: 'Model and prompt are required' };
        }

        const response = await fetch(`${API_OPENROUTER}/chat/completions`, {
            method: 'POST',
            headers: {
                ...OPENROUTER_HEADERS,
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                modalities: ['image'],
                image_config: {
                    aspect_ratio: (bodyAny.aspect_ratio as string) || '1:1',
                },
            }),
        });

        if (!response.ok) {
            console.warn('OpenRouter image generation failed', await response.text());
            set.status = 500;
            return;
        }

        const data: any = await response.json();

        const imageUrl = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;

        if (!imageUrl) {
            console.warn('No image URL found in OpenRouter response', data);
            set.status = 500;
            return;
        }

        const [, mimeType, base64Data] = /^data:(.*);base64,(.*)$/.exec(imageUrl)?.slice(1) || [];

        if (!mimeType || !base64Data) {
            console.warn('Invalid image data format', imageUrl);
            set.status = 500;
            return;
        }

        return {
            format: mime.extension(mimeType) || 'png',
            image: base64Data,
        };
    } catch (error) {
        console.error(error);
        set.status = 500;
    }
});
