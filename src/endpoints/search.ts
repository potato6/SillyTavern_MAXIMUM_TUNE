import { Elysia } from 'elysia';
import ipRegex from 'ip-regex';
import { decode } from 'html-entities';

import { readSecret, SECRET_KEYS } from './secrets.js';
import { trimV1 } from '../util.js';
import { setAdditionalHeadersByType } from '../additional-headers.js';

export const router = new Elysia({ prefix: '/api/search' });

// Cosplay as browser
const visitHeaders = {
    'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
};

const RE_XML_TRANSCRIPT = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
const CLIENT_CSS_REGEX = /href="(\/client.+\.css)"/;
const IPV4_REGEX = ipRegex.v4({ exact: true });
const IPV6_REGEX = ipRegex.v6({ exact: true });

interface UserDirectories {
    [key: string]: unknown;
}

interface UserContext {
    directories?: UserDirectories;
    [key: string]: unknown;
}

function getUserDirectories(ctx: Record<string, unknown>): UserDirectories | undefined {
    const user = ctx.user as UserContext | undefined;
    return user?.directories;
}

/**
 * Extract the transcript of a YouTube video
 * @param {string} videoPageBody HTML of the video page
 * @param {string} lang Language code
 * @returns {Promise<string>} Transcript text
 */
async function extractTranscript(videoPageBody: string, lang: string) {
    const captionsIdx = videoPageBody.indexOf('"captions":');

    if (captionsIdx === -1) {
        if (videoPageBody.includes('class="g-recaptcha"')) {
            throw new Error('Too many requests');
        }
        if (!videoPageBody.includes('"playabilityStatus":')) {
            throw new Error('Video is not available');
        }
        throw new Error('Transcript not available');
    }

    const startIdx = captionsIdx + 11;
    const endIdx = videoPageBody.indexOf(',"videoDetails', startIdx);
    const jsonChunk =
        endIdx !== -1
            ? videoPageBody.slice(startIdx, endIdx)
            : videoPageBody.slice(startIdx);

    let parsedCaptions: any;
    try {
        parsedCaptions = JSON.parse(jsonChunk.replace('\\n', ''));
    } catch {
        parsedCaptions = undefined;
    }

    const captions = parsedCaptions?.playerCaptionsTracklistRenderer;

    if (!captions) {
        throw new Error('Transcript disabled');
    }

    const tracks = captions.captionTracks;
    if (!Array.isArray(tracks) || tracks.length === 0) {
        throw new Error('Transcript not available');
    }

    let selectedTrack: { languageCode: string; baseUrl: string } | undefined;

    if (lang) {
        for (const track of tracks) {
            if (track.languageCode === lang) {
                selectedTrack = track;
                break;
            }
        }
        if (!selectedTrack) {
            throw new Error('Transcript not available in this language');
        }
    } else {
        selectedTrack = tracks[0];
    }

    const transcriptURL = selectedTrack!.baseUrl;
    const headers: Record<string, string> = {
        'User-Agent': visitHeaders['User-Agent'],
    };
    if (lang) {
        headers['Accept-Language'] = lang;
    }

    const transcriptResponse = await fetch(transcriptURL, { headers });

    if (!transcriptResponse.ok) {
        throw new Error('Transcript request failed');
    }

    const transcriptBody = await transcriptResponse.text();
    RE_XML_TRANSCRIPT.lastIndex = 0;

    let match: RegExpExecArray | null;
    const textPieces: string[] = [];

    while ((match = RE_XML_TRANSCRIPT.exec(transcriptBody)) !== null) {
        const rawText = match[3];
        if (rawText) {
            textPieces.push(decode(decode(rawText)));
        }
    }

    return textPieces.join(' ');
}

router.post('/serpapi', async (context) => {
    const { set } = context;
    const ctx = context as Record<string, unknown>;
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const directories = getUserDirectories(ctx);

    try {
        const key = directories ? readSecret(directories as any, SECRET_KEYS.SERPAPI) : '';

        if (!key) {
            console.error('No SerpApi key found');
            set.status = 400;
            return;
        }

        const query = typeof body.query === 'string' ? body.query : '';
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
    const ctx = context as Record<string, unknown>;
    const body = (ctx.body ?? {}) as Record<string, unknown>;

    try {
        const id = body.id as string;
        const lang = (body.lang as string) ?? '';
        const json = Boolean(body.json);

        if (typeof id !== 'string' || id.length === 0) {
            console.error('Id is required for /transcript');
            set.status = 400;
            return;
        }

        const headers: Record<string, string> = {
            'User-Agent': visitHeaders['User-Agent'],
        };
        if (lang) {
            headers['Accept-Language'] = lang;
        }

        const videoPageResponse = await fetch(
            `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
            { headers },
        );

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
    const ctx = context as Record<string, unknown>;
    const body = (ctx.body ?? {}) as Record<string, unknown>;

    try {
        const baseUrl = body.baseUrl as string;
        const query = body.query as string;
        const preferences = body.preferences as string | undefined;
        const categories = body.categories as string | undefined;

        if (typeof baseUrl !== 'string' || typeof query !== 'string' || !baseUrl || !query) {
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
        const clientMatch = CLIENT_CSS_REGEX.exec(mainPageText);
        const clientHref = clientMatch ? clientMatch[1] : undefined;

        if (clientHref) {
            const clientUrl = new URL(clientHref, baseUrl);
            await fetch(clientUrl, { headers: visitHeaders });
        }

        const searchUrl = new URL('/search', baseUrl);
        const searchParams = searchUrl.searchParams;
        searchParams.append('q', query);
        if (preferences) {
            searchParams.append('preferences', preferences);
        }
        if (categories) {
            searchParams.append('categories', categories);
        }

        const searchResult = await fetch(searchUrl, { headers: visitHeaders });

        if (!searchResult.ok) {
            const text = await searchResult.text();
            console.error('SearXNG request failed', searchResult.statusText, text);
            set.status = 500;
            return text;
        }

        return await searchResult.text();
    } catch (error) {
        console.error('SearXNG request failed', error);
        set.status = 500;
        return;
    }
});

router.post('/tavily', async (context) => {
    const { set } = context;
    const ctx = context as Record<string, unknown>;
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const directories = getUserDirectories(ctx);

    try {
        const apiKey = directories ? readSecret(directories as any, SECRET_KEYS.TAVILY) : '';

        if (!apiKey) {
            console.error('No Tavily key found');
            set.status = 400;
            return;
        }

        const query = typeof body.query === 'string' ? body.query : '';
        const include_images = Boolean(body.include_images);

        const requestBody = {
            query,
            api_key: apiKey,
            search_depth: 'basic',
            topic: 'general',
            include_answer: true,
            include_raw_content: false,
            include_images,
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
    const ctx = context as Record<string, unknown>;
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const directories = getUserDirectories(ctx);

    try {
        const query = body.query as string;
        const url = body.url as string;

        if (typeof url !== 'string' || url.length === 0) {
            console.error('No URL provided for KoboldCpp search');
            set.status = 400;
            return;
        }

        console.debug('KoboldCpp search query', query);

        const baseUrl = trimV1(url);
        const headers: Record<string, string> = {};
        const args = {
            method: 'POST',
            headers,
            body: JSON.stringify({ q: query }),
        };

        setAdditionalHeadersByType(
            headers,
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
    const ctx = context as Record<string, unknown>;
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const directories = getUserDirectories(ctx);

    try {
        const key = directories ? await readSecret(directories as any, SECRET_KEYS.SERPER) : '';

        if (!key) {
            console.error('No Serper key found');
            set.status = 400;
            return;
        }

        const query = typeof body.query === 'string' ? body.query : '';
        const images = Boolean(body.images);

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
    const ctx = context as Record<string, unknown>;
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const directories = getUserDirectories(ctx);

    try {
        const key = directories ? readSecret(directories as any, SECRET_KEYS.ZAI) : '';

        if (!key) {
            console.error('No Z.AI key found');
            set.status = 400;
            return;
        }

        const query = body.query as string;

        if (typeof query !== 'string' || query.length === 0) {
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
    const ctx = context as Record<string, unknown>;
    const body = (ctx.body ?? {}) as Record<string, unknown>;

    try {
        const url = body.url as string;
        const html = Boolean(body.html ?? true);

        if (typeof url !== 'string' || url.length === 0) {
            console.error('No url provided for /visit');
            set.status = 400;
            return;
        }

        try {
            const urlObj = new URL(url);
            const protocol = urlObj.protocol;
            const hostname = urlObj.hostname;

            if (!protocol || !urlObj.host) {
                throw new Error('Invalid URL format');
            }

            if (protocol !== 'http:' && protocol !== 'https:') {
                throw new Error('Invalid protocol');
            }

            if (urlObj.port !== '') {
                throw new Error('Invalid port');
            }

            if (IPV4_REGEX.test(hostname) || IPV6_REGEX.test(hostname)) {
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

        const contentType = result.headers.get('content-type') || '';

        if (html) {
            if (!contentType.includes('text/html')) {
                console.error(`Visit failed, content-type is ${contentType}, expected text/html`);
                set.status = 500;
                return;
            }

            return await result.text();
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
