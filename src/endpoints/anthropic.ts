import { Elysia } from 'elysia';
import { readSecret, SECRET_KEYS } from './secrets.js';

export const router = new Elysia({ prefix: '/api/anthropic' }).post(
    '/caption-image',
    async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            const mimeType = (body.image as string)?.split(';')[0]?.split(':')[1] ?? 'image/jpeg';
            const base64Data = (body.image as string)?.split(',')[1] ?? '';
            const baseUrl = body.reverse_proxy
                ? (body.reverse_proxy as string)
                : 'https://api.anthropic.com/v1';
            const url = `${baseUrl}/messages`;
            const apiBody = {
                model: body.model,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: mimeType,
                                    data: base64Data,
                                },
                            },
                            { type: 'text', text: body.prompt },
                        ],
                    },
                ],
                max_tokens: 4096,
            };

            console.debug('Multimodal captioning request', apiBody);

            const apiKey = body.reverse_proxy
                ? (body.proxy_password as string)
                : directories
                  ? readSecret(directories as Parameters<typeof readSecret>[0], SECRET_KEYS.CLAUDE)
                  : '';
            const result = await fetch(url, {
                body: JSON.stringify(apiBody),
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'anthropic-version': '2023-06-01',
                    'x-api-key': apiKey,
                },
            });

            if (!result.ok) {
                const text = await result.text();
                console.warn(
                    `Claude API returned error: ${result.status} ${result.statusText}`,
                    text,
                );
                set.status = result.status;
                return { error: true };
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- API response shape unknown
            const generateResponseJson = (await result.json()) as any;
            const caption = generateResponseJson.content[0].text;
            console.debug('Claude response:', generateResponseJson);

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
    },
);
