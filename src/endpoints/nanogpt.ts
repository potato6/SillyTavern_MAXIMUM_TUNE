import { Elysia } from 'elysia';
import { readSecret, SECRET_KEYS } from './secrets.js';

export const router = new Elysia({ prefix: '/api/nanogpt' });
const API_NANOGPT = 'https://nano-gpt.com/api';

/**
 * Fetches the full list of available NanoGPT providers.
 * Cached in-memory with a 1-hour TTL.
 */
let _providersCache: { id: string; label: string }[] | null = null;
let _providersCacheTime = 0;

router.get('/providers', async () => {
    try {
        if (_providersCache && Date.now() - _providersCacheTime < 3600_000) {
            return _providersCache;
        }
        const response = await fetch(`${API_NANOGPT}/models/providers`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) return _providersCache ?? [];
        const data = (await response.json()) as { providers?: { id: string; label: string }[] };
        _providersCache = data?.providers ?? [];
        _providersCacheTime = Date.now();
        return _providersCache;
    } catch (error) {
        console.error(error);
        return _providersCache ?? [];
    }
});

/**
 * Parses a numeric API value, returning 0 for missing or invalid values.
 */
function parseNumber(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

/**
 * Normalizes a NanoGPT usage bucket.
 */
function normalizeUsage(usage: Record<string, unknown>) {
    if (!usage || typeof usage !== 'object') {
        return null;
    }

    return {
        used: parseNumber(usage.used),
        remaining: parseNumber(usage.remaining),
        percentUsed: parseNumber(usage.percentUsed),
        resetAt: parseNumber(usage.resetAt),
    };
}

router.post('/credits', async (context) => {
    const { set } = context;
    const user = context.user as Record<string, unknown> | null;
    const directories = user?.directories as Record<string, string> | undefined;

    try {
        const key = directories ? await readSecret(directories as any, SECRET_KEYS.NANOGPT) : '';

        if (!key) {
            console.warn('NanoGPT API key not found');
            set.status = 400;
            return;
        }

        const headers = {
            Accept: 'application/json',
            'x-api-key': key,
        };

        // Fetch both Pay-As-You-Go balance and subscription usage at the same time.
        const [balanceReq, subReq] = await Promise.allSettled([
            fetch(`${API_NANOGPT}/check-balance`, { method: 'POST', headers }),
            fetch(`${API_NANOGPT}/subscription/v1/usage`, { method: 'GET', headers }),
        ]);

        if (balanceReq.status !== 'fulfilled' || !balanceReq.value.ok) {
            console.warn(
                'NanoGPT balance request failed',
                balanceReq.status === 'fulfilled' ? balanceReq.value.statusText : balanceReq.reason,
            );
            set.status = 500;
            return;
        }

        const balanceData = (await balanceReq.value.json()) as Record<string, unknown>;
        const result: Record<string, unknown> = {
            usd_balance: parseNumber(balanceData.usd_balance),
            nano_balance: parseNumber(balanceData.nano_balance),
            subscription: null,
        };

        if (subReq.status === 'fulfilled' && subReq.value.ok) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic NanoGPT subscription API
            const subData: any = await subReq.value.json();
            if (subData.active) {
                result.subscription = {
                    active: true,
                    state: String(subData.state || ''),
                    allowOverage: Boolean(subData.allowOverage),
                    period: {
                        currentPeriodEnd: String(subData.period?.currentPeriodEnd || ''),
                    },
                    limits: {
                        weeklyInputTokens: parseNumber(subData.limits?.weeklyInputTokens),
                        dailyInputTokens: parseNumber(subData.limits?.dailyInputTokens),
                        dailyImages: parseNumber(subData.limits?.dailyImages),
                    },
                    weekly_tokens: normalizeUsage(subData.weeklyInputTokens),
                    daily_tokens: normalizeUsage(subData.dailyInputTokens),
                    daily_images: normalizeUsage(subData.dailyImages),
                };
            }
        } else if (subReq.status === 'fulfilled') {
            console.warn('NanoGPT subscription usage request failed', subReq.value.statusText);
        } else {
            console.warn('NanoGPT subscription usage request failed', subReq.reason);
        }

        return result;
    } catch (error) {
        console.error(error);
        set.status = 500;
    }
});

router.post('/models/providers', async (context) => {
    const body = context.body as Record<string, unknown>;

    try {
        const model = body.model as string;

        if (!model) {
            return { supportsProviderSelection: false, providers: [] };
        }

        const encodedModel = encodeURIComponent(model);
        const response = await fetch(`${API_NANOGPT}/models/${encodedModel}/providers`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            return { supportsProviderSelection: false, providers: [] };
        }

        const data = (await response.json()) as Record<string, unknown>;
        const providers = Array.isArray(data?.providers)
            ? data.providers
                  .filter((p: Record<string, unknown>) => p?.available !== false)
                  .map((p: Record<string, unknown>) => p.provider)
                  .filter(Boolean)
            : [];

        return {
            supportsProviderSelection: Boolean(data?.supportsProviderSelection),
            providers,
        };
    } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
    }
});
