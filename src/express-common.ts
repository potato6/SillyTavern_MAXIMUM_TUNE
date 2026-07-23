import ipaddr from 'ipaddr.js';
import ipMatching from 'ip-matching';
import { RateLimiterRes } from 'rate-limiter-flexible';
import { getConfigValue } from './util.js';

/**
 * Gets the IP address of the client from the request object.
 */
export function getIpFromRequest(req: Record<string, unknown>) {
    let clientIp = (req.socket as Record<string, unknown> | undefined)?.remoteAddress as
        | string
        | undefined;
    if (!clientIp) {
        return 'unknown';
    }
    const ip = ipaddr.parse(clientIp);
    if (ip.kind() === 'ipv6' && ip instanceof ipaddr.IPv6 && ip.isIPv4MappedAddress()) {
        const ipv4 = ip.toIPv4Address().toString();
        clientIp = ipv4;
    } else {
        clientIp = ip.toString();
    }
    return clientIp;
}

/**
 * Get the client IP address from the request headers.
 */
export function getRealOrForwardedIp(req: Record<string, unknown>) {
    const xRealIpEnabled = !!getConfigValue('forwardedHeaders.xRealIp', true, 'boolean' as const);
    const cfConnectingIpEnabled = !!getConfigValue(
        'forwardedHeaders.cfConnectingIp',
        false,
        'boolean' as const,
    );
    const xForwardedForEnabled = !!getConfigValue(
        'forwardedHeaders.xForwardedFor',
        true,
        'boolean' as const,
    );

    const headers = req.headers as Record<string, string | undefined>;

    if (headers['x-real-ip'] && xRealIpEnabled) {
        return headers['x-real-ip'];
    }

    if (headers['cf-connecting-ip'] && cfConnectingIpEnabled) {
        return headers['cf-connecting-ip'];
    }

    if (headers['x-forwarded-for'] && xForwardedForEnabled) {
        const ipList = headers['x-forwarded-for']!.toString()
            .split(',')
            .map((ip: string) => ip.trim());
        return ipList[0];
    }

    return undefined;
}

/**
 * Gets the IP address of the client, optionally including the real/forwarded IP from headers.
 */
export function getIpAddress(request: Record<string, unknown>, includeHeaderIp: boolean) {
    const socketIp = getIpFromRequest(request);
    const forwardedIp = includeHeaderIp && getRealOrForwardedIp(request);
    return forwardedIp ? `${socketIp} (forwarded: ${forwardedIp})` : socketIp;
}

/**
 * Checks if the request is coming from a Firefox browser.
 */
export { isFirefox } from './util.js';

/**
 * Filters and validates IP patterns.
 */
export function filterValidIpPatterns(
    entries: string[],
    formatLog: (entry: string, message: string) => string,
) {
    const validEntries: string[] = [];

    if (!Array.isArray(entries)) {
        return validEntries;
    }

    for (const entry of entries) {
        try {
            ipMatching.getMatch(entry);
            validEntries.push(entry);
        } catch (e) {
            if (typeof formatLog === 'function') {
                console.warn(formatLog(entry, (e as Error)?.message || 'Unknown error'));
            }
        }
    }

    return validEntries;
}

/**
 * Sets the Retry-After header on the response based on the rate limit information.
 */
export function retryAfter(response: Record<string, unknown>, rateLimit: RateLimiterRes) {
    if (response.headersSent || !(rateLimit instanceof RateLimiterRes)) {
        return response;
    }
    const retryAfterMs = Math.ceil(rateLimit.msBeforeNext / 1000);
    const set = response.set as ((key: string, value: string) => void) | undefined;
    if (set) {
        set('Retry-After', retryAfterMs.toString());
    } else {
        const setHeader = response.setHeader as ((key: string, value: string) => void) | undefined;
        if (setHeader) {
            setHeader('Retry-After', retryAfterMs.toString());
        }
    }
    return response;
}
