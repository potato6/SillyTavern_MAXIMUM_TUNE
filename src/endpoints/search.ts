import { Elysia } from 'elysia';
import ipRegex from 'ip-regex';

import { decode } from 'html-entities';
import { readSecret, SECRET_KEYS } from './secrets.js';
import { trimV1 } from '../util.js';
import { setAdditionalHeadersByType } from '../additional-headers.js';

export const router = new Elysia({ prefix: '/api/search' });

// Cosplay as Chrome
const visitHeaders = {
    Accept: 'text/html',
    'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    TE: 'trailers',
    DNT: '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
};

/**
 * Extract the transcript of a YouTube video
 * @param {string} videoPageBody HTML of the video page
 * @param {string} lang Language code
 * @returns {Promise<string>} Transcript text
 */
async function extractTranscript(videoPageBody: string, lang: string) {
    const RE_XML_TRANSCRIPT = /<text start=\"([^\"]*)\" dur=\"([^\"]*)\">([^<]*)<\/text>/g;
    const splittedHTML = videoPageBody.split('\"captions\":');

    if (splittedHTML.length <= 1) {
        if (videoPageBody.includes('class=\"g-recaptcha\"')) {
            throw new Error('Too many requests');
        }
        if (!videoPageBody.includes('\"playabilityStatus\":')) {
            throw new Error('Video is not available');
        }
        throw new Error('Transcript not available');
    }

    const captions = (() => {
        try {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            return JSON.parse(splittedHTML[1].split(',\"videoDetails')[0].replace('\\n', ''));
        } catch {
            return undefined;
        }
    })()?.playerCaptionsTracklistRenderer;

    if (!captions) {
        throw new Error('Transcript disabled');
    }

    if (!('captionTracks' in captions)) {
        throw new Error('Transcript not available');
    }

    if (
        lang &&
        !captions.captionTracks.some(
            (track: { languageCode: string }) => track.languageCode === lang,
        )
    ) {
        throw new Error('Transcript not available in this language');
    }

    const transcriptURL = (
        lang
            ? captions.captionTracks.find(
                  (track: { languageCode: string }) => track.languageCode === lang,
              )
            : captions.captionTracks[0]
    ).baseUrl;
    const transcriptResponse = await fetch(transcriptURL, {
        headers: {
            ...(lang && { 'Accept-Language': lang }),
            'User-Agent': visitHeaders['User-Agent'],
        },
    });

    if (!transcriptResponse.ok) {
        throw new Error('Transcript request failed');
    }

    const transcriptBody = await transcriptResponse.text();
    const results = [...transcriptBody.matchAll(RE_XML_TRANSCRIPT)];
    const transcript = results.map((result) => ({
        text: result[3],
        // @ts-expect-error TS(2345) FIXME: Argument of type 'string | undefined' is not assig... Remove this comment to see the full error message
        duration: parseFloat(result[2]),
        // @ts-expect-error TS(2345) FIXME: Argument of type 'string | undefined' is not assig... Remove this comment to see the full error message
        offset: parseFloat(result[1]),
        lang: lang ?? captions.captionTracks[0].languageCode,
    }));
    // The text is double-encoded
    const transcriptText = transcript.map((line) => decode(decode(line.text))).join(' ');
    return transcriptText;
}

router.post('/serpapi', async (context) => {
    const { set } = context;
    const body = context.body as Record<string, unknown>;
    const user = (context as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
    > | null;
    const directories = user?.directories as Record<string, string> | undefined;

    try {
        const key = directories ? readSecret(directories as any, SECRET_KEYS.SERPAPI) : '';

        if (!key) {
            console.error('No SerpApi key found');
            set.status = 400;
            return;
        }

        const query = body.query as string;
        const result = await fetch(
            `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${key}`,
        );

        console.debug('SerpApi query', query);

        if (!result.ok) {
            const text = await result.text();
            console.error('SerpApi request failed', result.statusText, text);
            set.status = 500;
            return text;
        }

        const data = await result.json();
        console.debug('SerpApi response', data);
        return data;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

/**
 * Get the transcript of a YouTube video
 * @copyright https://github.com/Kakulukian/youtube-transcript (MIT License)
 */
router.post('/transcript', async (context) => {
    const { set } = context;
    const body = context.body as Record<string, unknown>;

    try {
        const id = body.id as string;
        const lang = body.lang as string;
        const json = body.json as boolean;

        if (!id) {
            console.error('Id is required for /transcript');
            set.status = 400;
            return;
        }

        const videoPageResponse = await fetch(`https://www.youtube.com/watch?v=${id}`, {
            headers: {
                ...(lang && { 'Accept-Language': lang }),
                'User-Agent': visitHeaders['User-Agent'],
            },
        });

        const videoPageBody = await videoPageResponse.text();

        try {
            const transcriptText = await extractTranscript(videoPageBody, lang);
            return json ? { transcript: transcriptText, html: videoPageBody } : transcriptText;
        } catch (error) {
            if (json) {
                return { html: videoPageBody, transcript: '' };
            }
            throw error;
        }
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

router.post('/searxng', async (context) => {
    const { set } = context;
    const body = context.body as Record<string, unknown>;

    try {
        const baseUrl = body.baseUrl as string;
        const query = body.query as string;
        const preferences = body.preferences as string;
        const categories = body.categories as string;

        if (!baseUrl || !query) {
            console.error('Missing required parameters for /searxng');
            set.status = 400;
            return;
        }

        console.debug('SearXNG query', baseUrl, query);

        const mainPageUrl = new URL(baseUrl);
        const mainPageRequest = await fetch(mainPageUrl, { headers: visitHeaders });

        if (!mainPageRequest.ok) {
            console.error('SearXNG request failed', mainPageRequest.statusText);
            set.status = 500;
            return;
        }

        const mainPageText = await mainPageRequest.text();
        const clientHref = mainPageText.match(/href=\"(\/client.+\.css)\"/)?.[1];

        if (clientHref) {
            const clientUrl = new URL(clientHref, baseUrl);
            await fetch(clientUrl, { headers: visitHeaders });
        }

        const searchUrl = new URL('/search', baseUrl);
        const searchParams = new URLSearchParams();
        searchParams.append('q', query);
        if (preferences) {
            searchParams.append('preferences', preferences);
        }
        if (categories) {
            searchParams.append('categories', categories);
        }
        searchUrl.search = searchParams.toString();

        const searchResult = await fetch(searchUrl, { headers: visitHeaders });

        if (!searchResult.ok) {
            const text = await searchResult.text();
            console.error('SearXNG request failed', searchResult.statusText, text);
            set.status = 500;
            return text;
        }

        const data = await searchResult.text();
        return data;
    } catch (error) {
        console.error('SearXNG request failed', error);
        set.status = 500;
        return;
    }
});

router.post('/tavily', async (context) => {
    const { set } = context;
    const body = context.body as Record<string, unknown>;
    const user = (context as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
    > | null;
    const directories = user?.directories as Record<string, string> | undefined;

    try {
        const apiKey = directories ? readSecret(directories as any, SECRET_KEYS.TAVILY) : '';

        if (!apiKey) {
            console.error('No Tavily key found');
            set.status = 400;
            return;
        }

        const query = body.query as string;
        const include_images = body.include_images as boolean;
        const requestBody = {
            query: query,
            api_key: apiKey,
            search_depth: 'basic',
            topic: 'general',
            include_answer: true,
            include_raw_content: false,
            include_images: !!include_images,
            include_image_descriptions: false,
            include_domains: [],
            max_results: 10,
        };

        const result = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        console.debug('Tavily query', query);

        if (!result.ok) {
            const text = await result.text();
            console.error('Tavily request failed', result.statusText, text);
            set.status = 500;
            return text;
        }

        const data = await result.json();
        console.debug('Tavily response', data);
        return data;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

router.post('/koboldcpp', async (context) => {
    const { set } = context;
    const body = context.body as Record<string, unknown>;
    const user = (context as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
    > | null;
    const directories = user?.directories as Record<string, string> | undefined;

    try {
        const query = body.query as string;
        const url = body.url as string;

        if (!url) {
            console.error('No URL provided for KoboldCpp search');
            set.status = 400;
            return;
        }

        console.debug('KoboldCpp search query', query);

        const baseUrl = trimV1(url);
        const args: Record<string, unknown> = {
            method: 'POST',
            headers: {},
            body: JSON.stringify({ q: query }),
        };

        setAdditionalHeadersByType(
            args.headers as Record<string, unknown>,
            body.api_type as string,
            baseUrl,
            directories as any,
            body.secret_id as any,
        );

        const result = await fetch(`${baseUrl}/api/extra/websearch`, args as RequestInit);

        if (!result.ok) {
            const text = await result.text();
            console.error('KoboldCpp request failed', result.statusText, text);
            set.status = 500;
            return text;
        }

        const data = await result.json();
        console.debug('KoboldCpp search response', data);
        return data;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

router.post('/serper', async (context) => {
    const { set } = context;
    const body = context.body as Record<string, unknown>;
    const user = (context as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
    > | null;
    const directories = user?.directories as Record<string, string> | undefined;

    try {
        const key = directories ? readSecret(directories as any, SECRET_KEYS.SERPER) : '';

        if (!key) {
            console.error('No Serper key found');
            set.status = 400;
            return;
        }

        const query = body.query as string;
        const images = body.images as boolean;

        const url = images
            ? 'https://google.serper.dev/images'
            : 'https://google.serper.dev/search';

        const result = await fetch(url, {
            method: 'POST',
            headers: {
                'X-API-KEY': key,
                'Content-Type': 'application/json',
            },
            redirect: 'follow',
            body: JSON.stringify({ q: query }),
        });

        console.debug('Serper query', query);

        if (!result.ok) {
            const text = await result.text();
            console.warn('Serper request failed', result.statusText, text);
            set.status = 500;
            return text;
        }

        const data = await result.json();
        console.debug('Serper response', data);
        return data;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

router.post('/zai', async (context) => {
    const { set } = context;
    const body = context.body as Record<string, unknown>;
    const user = (context as unknown as Record<string, unknown>).user as Record<
        string,
        unknown
    > | null;
    const directories = user?.directories as Record<string, string> | undefined;

    try {
        const key = directories ? readSecret(directories as any, SECRET_KEYS.ZAI) : '';

        if (!key) {
            console.error('No Z.AI key found');
            set.status = 400;
            return;
        }

        const query = body.query as string;

        if (!query) {
            console.error('No query provided for /zai');
            set.status = 400;
            return;
        }

        console.debug('Z.AI web search query', query);

        const result = await fetch('https://api.z.ai/api/paas/v4/web_search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
                // TODO: There's only one engine option for now
                search_engine: 'search-prime',
                search_query: query,
            }),
        });

        if (!result.ok) {
            const text = await result.text();
            console.error('Z.AI request failed', result.statusText, text);
            set.status = 500;
            return text;
        }

        const data = await result.json();
        console.debug('Z.AI web search response', data);
        return data;
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});

router.post('/visit', async (context) => {
    const { set } = context;
    const body = context.body as Record<string, unknown>;

    try {
        const url = body.url as string;
        const html = Boolean(body.html ?? true);

        if (!url) {
            console.error('No url provided for /visit');
            set.status = 400;
            return;
        }

        try {
            const urlObj = new URL(url);

            // Reject relative URLs
            if (urlObj.protocol === null || urlObj.host === null) {
                throw new Error('Invalid URL format');
            }

            // Reject non-HTTP URLs
            if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
                throw new Error('Invalid protocol');
            }

            // Reject URLs with a non-standard port
            if (urlObj.port !== '') {
                throw new Error('Invalid port');
            }

            // Reject IP addresses
            if (
                ipRegex.v4({ exact: true }).test(urlObj.hostname) ||
                ipRegex.v6({ exact: true }).test(urlObj.hostname)
            ) {
                throw new Error('Invalid hostname');
            }
        } catch {
            console.error('Invalid url provided for /visit', url);
            set.status = 400;
            return;
        }

        console.info('Visiting web URL', url);

        const result = await fetch(url, { headers: visitHeaders });

        if (!result.ok) {
            console.error(`Visit failed ${result.status} ${result.statusText}`);
            set.status = 500;
            return;
        }

        const contentType = String(result.headers.get('content-type'));

        if (html) {
            if (!contentType.includes('text/html')) {
                console.error(`Visit failed, content-type is ${contentType}, expected text/html`);
                set.status = 500;
                return;
            }

            const text = await result.text();
            return text;
        }

        set.headers['Content-Type'] = contentType;
        const buffer = await result.arrayBuffer();
        return new Response(buffer);
    } catch (error) {
        console.error(error);
        set.status = 500;
        return;
    }
});
