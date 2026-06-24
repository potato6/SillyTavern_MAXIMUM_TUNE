import path from 'node:path';
import { color, getConfigValue, safeReadFileSync } from '../util.js';
import { isHostAllowed, hostValidationMiddleware } from 'host-validation-middleware';

const knownHosts = new Set();
const maxKnownHosts = 1000;

// @ts-expect-error TS(2345): Argument of type 'false' is not assignable to para... Remove this comment to see the full error message
const hostWhitelistEnabled = !!getConfigValue('hostWhitelist.enabled', false);
// @ts-expect-error TS(2345): Argument of type 'never[]' is not assignable to pa... Remove this comment to see the full error message
const hostWhitelist = Object.freeze(getConfigValue('hostWhitelist.hosts', []));
// @ts-expect-error TS(2345): Argument of type 'false' is not assignable to para... Remove this comment to see the full error message
const hostWhitelistScan = !!getConfigValue('hostWhitelist.scan', false, 'boolean');

const validationMiddleware = hostValidationMiddleware({
    allowedHosts: hostWhitelist,
    // @ts-expect-error TS(7017): Element implicitly has an 'any' type because type ... Remove this comment to see the full error message
    generateErrorMessage: () => safeReadFileSync(path.join(globalThis.DATA_ROOT, '_errors', 'host-not-allowed.html'))?.toString() ?? '',
    errorResponseContentType: 'text/html',
});

/**
 * Middleware to validate remote hosts.
 * Useful to protect against DNS rebinding attacks.
 * @param {import('express').Request} req Request
 * @param {import('express').Response} res Response
 * @param {import('express').NextFunction} next Next middleware
 */
export default function hostWhitelistMiddleware(req: any, res: any, next: any) {
    const hostValue = req.headers.host;
    if (hostWhitelistScan && !isHostAllowed(hostValue, hostWhitelist) && !knownHosts.has(hostValue) && knownHosts.size < maxKnownHosts) {
        const isFirstWarning = knownHosts.size === 0;
        console.warn(color.red('Request from untrusted host:'), hostValue);
        console.warn(`If you trust this host, you can add it to ${color.yellow('hostWhitelist.hosts')} in config.yaml`);
        if (!hostWhitelistEnabled && isFirstWarning) {
            console.warn(`To protect against host spoofing, consider setting ${color.yellow('hostWhitelist.enabled')} to true`);
        }
        if (isFirstWarning) {
            console.warn(`To disable this warning, set ${color.yellow('hostWhitelist.scan')} to false`);
        }
        knownHosts.add(hostValue);
    }

    if (!hostWhitelistEnabled) {
        return next();
    }

    return validationMiddleware(req, res, next);
}
