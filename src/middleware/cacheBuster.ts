// @ts-expect-error TS(1192) FIXME: Module '"node:crypto"' has no default export.
import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { DEFAULT_USER } from '../constants.js';
import { getConfigValue } from '../util.js';

/**
 * Sets the Clear-Site-Data header to bust the browser cache.
 */
class CacheBuster {
    /**
     * Handles/User-Agents that have already been busted.
     * @type {Set<string>}
     */
    #keys = new Set();

    /**
     * User agent regex to match against requests.
     * @type {RegExp | null}
     */
    #userAgentRegex = null;

    /**
     * Whether the cache buster is enabled.
     * @type {boolean | null}
     */
    #isEnabled = null;

    constructor() {
        // @ts-expect-error TS(2322) FIXME: Type 'boolean' is not assignable to type 'null'.
        this.#isEnabled = !!getConfigValue('cacheBuster.enabled', false, 'boolean');
        // @ts-expect-error TS(2345) FIXME: Argument of type '""' is not assignable to paramet... Remove this comment to see the full error message
        const userAgentPattern = getConfigValue('cacheBuster.userAgentPattern', '');
        if (userAgentPattern) {
            try {
                // @ts-expect-error TS(2322) FIXME: Type 'RegExp' is not assignable to type 'null'.
                this.#userAgentRegex = new RegExp(userAgentPattern, 'i');
            } catch {
                console.error('[Cache Buster] Invalid user agent pattern:', userAgentPattern);
            }
        }
    }

    /**
     * Check if the cache should be busted for the given request.
     * @param {import('express').Request} request Express request object.
     * @param {import('express').Response} response Express response object.
     * @returns {boolean} Whether the cache should be busted.
     */
    shouldBust(request: Request, response: Response) {
        // If disabled with config, don't do anything
        if (!this.#isEnabled) {
            return false;
        }

        // If response headers are already sent or response is ended
        if (response.headersSent || response.writableEnded) {
            console.warn('[Cache Buster] Response ended or headers already sent');
            return false;
        }

        // Check if the user agent matches the configured pattern
        const userAgent = request.headers['user-agent'] || '';

        // Bust cache for all requests if no pattern is set
        if (!this.#userAgentRegex) {
            return true;
        }

        // @ts-expect-error TS(2339) FIXME: Property 'test' does not exist on type 'never'.
        return this.#userAgentRegex.test(userAgent);
    }

    /**
     * Middleware to bust the browser cache for the current user.
     * @type {import('express').RequestHandler}
     */
    #middleware(request: Request, response: Response, next: NextFunction) {
        const handle = request.user?.profile?.handle || DEFAULT_USER.handle;
        const userAgent = request.headers['user-agent'] || '';
        const hash = crypto.createHash('sha256').update(userAgent).digest('hex');
        const key = `${handle}-${hash}`;

        if (this.#keys.has(key)) {
            return next();
        }

        this.#keys.add(key);
        this.bust(request, response);
        next();
    }

    /**
     * Middleware to bust the browser cache for the current user.
     * @returns {import('express').RequestHandler} The middleware function.
     */
    get middleware() {
        return this.#middleware.bind(this);
    }

    /**
     * Bust the cache for the given response.
     * @param {import('express').Request} request Express request object.
     * @param {import('express').Response} response Express response object.
     * @returns {void}
     */
    bust(request: Request, response: Response) {
        if (this.shouldBust(request, response)) {
            response.setHeader('Clear-Site-Data', '"cache"');
        }
    }
}

// Export a single instance for the entire application
const instance = new CacheBuster();
export default instance;
