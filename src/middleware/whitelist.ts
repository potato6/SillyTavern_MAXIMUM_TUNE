// @ts-expect-error TS(1259) FIXME: Module '"node:path"' can only be default-imported ... Remove this comment to see the full error message
import path from 'node:path';
// @ts-expect-error TS(1192) FIXME: Module '"node:fs"' has no default export.
import fs from 'node:fs';
// @ts-expect-error TS(1259) FIXME: Module '"node:process"' can only be default-import... Remove this comment to see the full error message
import process from 'node:process';
// @ts-expect-error TS(1192) FIXME: Module '"node:dns"' has no default export.
import dns from 'node:dns';
// @ts-expect-error TS(2792) FIXME: Cannot find module 'handlebars'. Did you mean to s... Remove this comment to see the full error message
import Handlebars from 'handlebars';
// @ts-expect-error TS(2792) FIXME: Cannot find module 'ip-matching'. Did you mean to ... Remove this comment to see the full error message
import ipMatching from 'ip-matching';
// @ts-expect-error TS(2792) FIXME: Cannot find module 'is-docker'. Did you mean to se... Remove this comment to see the full error message
import isDocker from 'is-docker';
// @ts-expect-error TS(1259) FIXME: Module '"/mnt/DISCO/downloads/some_git_projects/Si... Remove this comment to see the full error message
import express from 'express';

import { filterValidIpPatterns, getIpFromRequest, getRealOrForwardedIp } from '../express-common.js';
import { color, getConfigValue, safeReadFileSync } from '../util.js';

const whitelistPath = path.join(process.cwd(), './whitelist.txt');
// @ts-expect-error TS(2345) FIXME: Argument of type 'false' is not assignable to para... Remove this comment to see the full error message
const enableForwardedWhitelist = !!getConfigValue('enableForwardedWhitelist', false, 'boolean');
// @ts-expect-error TS(2345) FIXME: Argument of type 'true' is not assignable to param... Remove this comment to see the full error message
const whitelistDockerHosts = !!getConfigValue('whitelistDockerHosts', true, 'boolean');
/** @type {string[]} */
// @ts-expect-error TS(2345) FIXME: Argument of type 'never[]' is not assignable to pa... Remove this comment to see the full error message
let whitelist = getConfigValue('whitelist', []);

if (fs.existsSync(whitelistPath)) {
    console.warn(color.yellow('whitelist.txt is deprecated and will be removed in a future release.'));
    console.warn(color.yellow('Please migrate its contents to the whitelist field in config.yaml. See the documentation for more details.'));
    try {
        const whitelistTxt = fs.readFileSync(whitelistPath, 'utf-8');
        // @ts-expect-error TS(7006) FIXME: Parameter 'ip' implicitly has an 'any' type.
        whitelist = whitelistTxt.split('\n').filter(ip => ip).map(ip => ip.trim());
    } catch {
        // Ignore errors that may occur when reading the whitelist (e.g. permissions)
    }
}

whitelist = filterValidIpPatterns(whitelist, (entry: string, message: string) => `${color.red('Warning')}: Ignoring invalid whitelist entry ${color.yellow(entry)} - ${message}`);

/**
 * Resolves the IP addresses of Docker hostnames and adds them to the whitelist.
 * @returns {Promise<void>} Promise that resolves when the Docker hostnames are resolved
 */
async function addDockerHostsToWhitelist() {
    if (!whitelistDockerHosts || !isDocker()) {
        return;
    }

    const whitelistHosts = ['host.docker.internal', 'gateway.docker.internal'];

    for (const entry of whitelistHosts) {
        try {
            const result = await dns.promises.lookup(entry);
            console.info(`Resolved whitelist hostname ${color.green(entry)} to IPv${result.family} address ${color.green(result.address)}`);
            whitelist.push(result.address);
    } catch {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'e'.
            console.warn(`Failed to resolve whitelist hostname ${color.red(entry)}: ${e.message}`);
        }
    }
}

/**
 * Returns a middleware function that checks if the client IP is in the whitelist.
 * @returns {Promise<import('express').RequestHandler>} Promise that resolves to the middleware function
 */
export default async function getWhitelistMiddleware() {
    const forbiddenWebpage = Handlebars.compile(
        safeReadFileSync(path.join(globalThis.DATA_ROOT, '_errors', 'forbidden-by-whitelist.html')) ?? '',
    );

    const noLogPaths = [
        '/favicon.ico',
    ];

    await addDockerHostsToWhitelist();

    return function (req: express.Request, res: express.Response, next: express.NextFunction) {
        const clientIp = getIpFromRequest(req);
        const forwardedIp = enableForwardedWhitelist && getRealOrForwardedIp(req);
        const userAgent = req.headers['user-agent'];

        /**
         * Checks if an IP address matches any entry in the whitelist.
         * @param {string[]} whitelist - The list of whitelisted IPs/CIDRs
         * @param {string} ip - The IP address to check
         * @returns {boolean} True if the IP matches any whitelist entry
         */
        function isIPInWhitelist(whitelist: string[], ip: string) {
            return whitelist.some((x: string) => ipMatching.matches(ip, ipMatching.getMatch(x)));
        }

        //clientIp = req.connection.remoteAddress.split(':').pop();
        if (!isIPInWhitelist(whitelist, clientIp)
            || (forwardedIp && !isIPInWhitelist(whitelist, forwardedIp))
        ) {
            // Log the connection attempt with real IP address
            const ipDetails = forwardedIp
                ? `${clientIp} (forwarded from ${forwardedIp})`
                : clientIp;

            if (!noLogPaths.includes(req.path)) {
                console.warn(
                    color.red(
                        `Blocked connection from ${ipDetails}; User Agent: ${userAgent}\n\tTo allow this connection, add its IP address to the whitelist or disable whitelist mode by editing config.yaml in the root directory of your SillyTavern installation.\n`,
                    ),
                );
            }

            return res.status(403).send(forbiddenWebpage({ ipDetails }));
        }
        next();
    };
}
