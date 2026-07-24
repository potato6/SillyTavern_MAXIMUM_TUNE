import crypto from 'node:crypto';
import { DEFAULT_USER } from '../constants.js';
import { getConfigValue } from '../util.js';

/**
 * Sets the Clear-Site-Data header to bust the browser cache.
 *
 * Elysia-compatible: use {@link getClearSiteDataValue} with the Elysia context's
 * `user` and `request` to decide whether to bust, then apply the returned value
 * to the response headers.
 */
class CacheBuster {
    /** Handles/User-Agents that have already been busted. */
    #keys = new Set<string>();

    /** User agent regex to match against requests. */
    #userAgentRegex: RegExp | null = null;

    /** Whether the cache buster is enabled. */
    #isEnabled: boolean;

    constructor() {
        this.#isEnabled = !!getConfigValue('cacheBuster.enabled', false, 'boolean');
        const userAgentPattern = getConfigValue('cacheBuster.userAgentPattern', '');
        if (userAgentPattern) {
            try {
                this.#userAgentRegex = new RegExp(userAgentPattern, 'i');
            } catch {
                console.error('[Cache Buster] Invalid user agent pattern:', userAgentPattern);
            }
        }
    }

    /**
     * Returns the `Clear-Site-Data` header value (`'"cache"'`) if the cache should
     * be busted for this request, or `null` if it should be skipped (disabled,
     * already busted for this user-agent + handle combination, or UA doesn't match
     * the configured pattern).
     *
     * @param user       The authenticated user object from Elysia context (or null).
     * @param userAgent  The `User-Agent` header value from the request.
     * @returns `'"cache"'` to set as the `Clear-Site-Data` header, or `null`.
     */
    getClearSiteDataValue(user: any, userAgent: string): string | null {
        if (!this.#isEnabled) {
            return null;
        }

        if (this.#userAgentRegex && !this.#userAgentRegex.test(userAgent)) {
            return null;
        }

        const handle = user?.profile?.handle || DEFAULT_USER.handle;
        const hash = crypto.createHash('sha256').update(userAgent).digest('hex');
        const key = `${handle}-${hash}`;

        if (this.#keys.has(key)) {
            return null;
        }

        this.#keys.add(key);
        return '"cache"';
    }
}

// Export a single instance for the entire application
const instance = new CacheBuster();
export default instance;
