import { Elysia } from 'elysia';
import { translate as bingTranslate } from 'bing-translate-api';
import { Translator } from 'google-translate-api-x';

import { readSecret, SECRET_KEYS } from './secrets.js';
import { getConfigValue, uuidv4 } from '../util.js';

const DEEPLX_URL_DEFAULT = 'http://127.0.0.1:1188/translate';
const ONERING_URL_DEFAULT = 'http://127.0.0.1:4990/translate';
const LINGVA_DEFAULT = 'https://lingva.ml/api/v1';

export const router = new Elysia({ prefix: '/api/translate' });

// ── helpers ──────────────────────────────────────────────────────────────────

function getDirs(context: Record<string, unknown>) {
    const user = context.user as Record<string, unknown> | null;
    return user?.directories as Record<string, string> | undefined;
}

function getBody(context: Record<string, unknown>) {
    return context.body as Record<string, unknown>;
}

// ── LibreTranslate ───────────────────────────────────────────────────────────

router.post('/libre', async (context) => {
    const { set } = context;
    const directories = getDirs(context);
    const body = getBody(context);

    try {
        const key = directories ? await readSecret(directories as any, SECRET_KEYS.LIBRE) : '';
        const url = directories ? await readSecret(directories as any, SECRET_KEYS.LIBRE_URL) : '';

        if (!url) {
            console.warn('LibreTranslate URL is not configured.');
            set.status = 400;
            return;
        }

        let lang = body.lang as string;
        if (lang === 'zh-CN') lang = 'zh';
        if (lang === 'zh-TW') lang = 'zt';
        if (lang === 'pt-BR' || lang === 'pt-PT') lang = 'pt';

        const text = body.text as string;

        if (!text || !lang) {
            set.status = 400;
            return;
        }

        console.debug('Input text: ' + text);

        const result = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({
                q: text,
                source: 'auto',
                target: lang,
                format: 'text',
                api_key: key,
            }),
            headers: { 'Content-Type': 'application/json' },
        });

        if (!result.ok) {
            const error = await result.text();
            console.warn('LibreTranslate error: ', result.statusText, error);
            set.status = 500;
            return;
        }

        const json = (await result.json()) as Record<string, unknown>;
        console.debug('Translated text: ' + json.translatedText);
        return json.translatedText as string;
    } catch (error) {
        console.error('Translation error: ' + (error as Error).message);
        set.status = 500;
    }
});

// ── Google ───────────────────────────────────────────────────────────────────

router.post('/google', async (context) => {
    const { set } = context;
    const body = getBody(context);

    try {
        let lang = body.lang as string;
        if (lang === 'pt-BR') lang = 'pt';

        const text = String(body.text ?? '');
        if (!text || !lang) {
            set.status = 400;
            return;
        }

        console.debug('Input text: ' + text);

        const translator = new Translator({ to: lang, requestFunction: fetch });
        const translatedText = await translator.translate(text).then((r) => r.text);

        console.debug('Translated text: ' + translatedText);
        return new Response(translatedText, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    } catch (error) {
        console.error('Translation error', error);
        set.status = 500;
    }
});

// ── Yandex ───────────────────────────────────────────────────────────────────

router.post('/yandex', async (context) => {
    const { set } = context;
    const body = getBody(context);

    try {
        let lang = body.lang as string;
        if (lang === 'pt-PT') lang = 'pt';
        if (lang === 'zh-CN' || lang === 'zh-TW') lang = 'zh';

        const chunks = body.chunks as string[];
        const textLang = body.lang as string;

        if (!chunks || !textLang) {
            set.status = 400;
            return;
        }

        let inputText = '';
        const params = new URLSearchParams();
        for (const chunk of chunks) {
            params.append('text', chunk);
            inputText += chunk;
        }
        params.append('lang', textLang);
        const ucid = uuidv4().replaceAll('-', '');

        console.debug('Input text: ' + inputText);

        const result = await fetch(
            `https://translate.yandex.net/api/v1/tr.json/translate?ucid=${ucid}&srv=android&format=text`,
            {
                method: 'POST',
                body: params,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            },
        );

        if (!result.ok) {
            const error = await result.text();
            console.warn('Yandex error: ', result.statusText, error);
            set.status = 500;
            return;
        }

        const json = (await result.json()) as Record<string, unknown>;
        const translated = (json.text as string[]).join();
        console.debug('Translated text: ' + translated);
        return translated;
    } catch (error) {
        console.error('Translation error: ' + (error as Error).message);
        set.status = 500;
    }
});

// ── Lingva ───────────────────────────────────────────────────────────────────

router.post('/lingva', async (context) => {
    const { set } = context;
    const directories = getDirs(context);
    const body = getBody(context);

    try {
        const secretUrl = directories
            ? await readSecret(directories as any, SECRET_KEYS.LINGVA_URL)
            : '';
        const baseUrl = secretUrl || LINGVA_DEFAULT;

        if (!secretUrl && baseUrl === LINGVA_DEFAULT) {
            console.warn('Lingva URL is using default value.', LINGVA_DEFAULT);
        }

        let lang = body.lang as string;
        if (lang === 'zh-CN' || lang === 'zh-TW') lang = 'zh';
        if (lang === 'pt-BR' || lang === 'pt-PT') lang = 'pt';

        const text = body.text as string;
        if (!text || !lang) {
            set.status = 400;
            return;
        }

        console.debug('Input text: ' + text);

        const url = new URL(['auto', lang, encodeURIComponent(text)].join('/'), baseUrl + '/');
        const result = await fetch(url);

        if (!result.ok) {
            const error = await result.text();
            console.warn('Lingva error: ', result.statusText, error);
        }

        const data = (await result.json()) as Record<string, unknown>;
        console.debug('Translated text: ' + data.translation);
        return data.translation as string;
    } catch (error) {
        console.error('Translation error', error);
        set.status = 500;
    }
});

// ── DeepL ────────────────────────────────────────────────────────────────────

router.post('/deepl', async (context) => {
    const { set } = context;
    const directories = getDirs(context);
    const body = getBody(context);

    try {
        const key = directories ? await readSecret(directories as any, SECRET_KEYS.DEEPL) : '';

        if (!key) {
            console.warn('DeepL key is not configured.');
            set.status = 400;
            return;
        }

        let lang = body.lang as string;
        if (lang === 'zh-CN' || lang === 'zh-TW') lang = 'ZH';

        const text = body.text as string;
        const formality = getConfigValue('deepl.formality', 'default');

        if (!text || !lang) {
            set.status = 400;
            return;
        }

        console.debug('Input text: ' + text);

        const params = new URLSearchParams();
        params.append('text', text);
        params.append('target_lang', lang);

        if (['de', 'fr', 'it', 'es', 'nl', 'ja', 'ru', 'pt-BR', 'pt-PT'].includes(lang)) {
            params.append('formality', formality as string);
        }

        const endpoint =
            body.endpoint === 'pro'
                ? 'https://api.deepl.com/v2/translate'
                : 'https://api-free.deepl.com/v2/translate';

        const result = await fetch(endpoint, {
            method: 'POST',
            body: params,
            headers: {
                Accept: 'application/json',
                Authorization: `DeepL-Auth-Key ${key}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        if (!result.ok) {
            const error = await result.text();
            console.warn('DeepL error: ', result.statusText, error);
            set.status = 500;
            return;
        }

        const json = (await result.json()) as Record<string, unknown>;
        const translations = json.translations as Array<Record<string, string>>;
        console.debug('Translated text: ' + translations[0]!.text);
        return translations[0]!.text;
    } catch (error) {
        console.error('Translation error: ' + (error as Error).message);
        set.status = 500;
    }
});

// ── OneRing ──────────────────────────────────────────────────────────────────

router.post('/onering', async (context) => {
    const { set } = context;
    const directories = getDirs(context);
    const body = getBody(context);

    try {
        const secretUrl = directories
            ? await readSecret(directories as any, SECRET_KEYS.ONERING_URL)
            : '';
        const url = secretUrl || ONERING_URL_DEFAULT;

        if (!url) {
            console.warn('OneRing URL is not configured.');
            set.status = 400;
            return;
        }

        let lang = body.lang as string;
        if (lang === 'pt-BR' || lang === 'pt-PT') lang = 'pt';

        const text = body.text as string;
        const from_lang = body.from_lang as string;
        const to_lang = body.to_lang as string;

        if (!text || !from_lang || !to_lang) {
            set.status = 400;
            return;
        }

        const params = new URLSearchParams();
        params.append('text', text);
        params.append('from_lang', from_lang);
        params.append('to_lang', to_lang);

        console.debug('Input text: ' + text);

        const fetchUrl = new URL(url);
        fetchUrl.search = params.toString();

        const result = await fetch(fetchUrl, { method: 'GET' });

        if (!result.ok) {
            const error = await result.text();
            console.warn('OneRing error: ', result.statusText, error);
            set.status = 500;
            return;
        }

        const data = (await result.json()) as Record<string, unknown>;
        console.debug('Translated text: ' + data.result);
        return data.result as string;
    } catch (error) {
        console.error('Translation error: ' + (error as Error).message);
        set.status = 500;
    }
});

// ── DeepLX ───────────────────────────────────────────────────────────────────

router.post('/deeplx', async (context) => {
    const { set } = context;
    const directories = getDirs(context);
    const body = getBody(context);

    try {
        const secretUrl = directories
            ? await readSecret(directories as any, SECRET_KEYS.DEEPLX_URL)
            : '';
        const url = secretUrl || DEEPLX_URL_DEFAULT;

        if (!url) {
            console.warn('DeepLX URL is not configured.');
            set.status = 400;
            return;
        }

        let lang = body.lang as string;
        if (lang === 'zh-CN' || lang === 'zh-TW') lang = 'ZH';

        const text = body.text as string;
        if (!text || !lang) {
            set.status = 400;
            return;
        }

        console.debug('Input text: ' + text);

        const result = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ text, source_lang: 'auto', target_lang: lang }),
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        });

        if (!result.ok) {
            const error = await result.text();
            console.warn('DeepLX error: ', result.statusText, error);
            set.status = 500;
            return;
        }

        const json = (await result.json()) as Record<string, unknown>;
        console.debug('Translated text: ' + json.data);
        return json.data as string;
    } catch (error) {
        console.error('DeepLX translation error: ' + (error as Error).message);
        set.status = 500;
    }
});

// ── Bing ─────────────────────────────────────────────────────────────────────

router.post('/bing', async (context) => {
    const { set } = context;
    const body = getBody(context);

    try {
        let lang = body.lang as string;
        if (lang === 'zh-CN') lang = 'zh-Hans';
        if (lang === 'zh-TW') lang = 'zh-Hant';
        if (lang === 'pt-BR') lang = 'pt';

        const text = body.text as string;
        if (!text || !lang) {
            set.status = 400;
            return;
        }

        console.debug('Input text: ' + text);

        const result = await bingTranslate(text, null, lang);
        const translatedText = result?.translation;
        console.debug('Translated text: ' + translatedText);
        return translatedText;
    } catch (error) {
        console.error('Translation error', error);
        set.status = 500;
    }
});
