// @ts-expect-error TS(1259) FIXME: Module '"node:process"' can only be default-import... Remove this comment to see the full error message
import process from 'node:process';
// @ts-expect-error TS(1192) FIXME: Module '"node:http"' has no default export.
import http from 'node:http';
// @ts-expect-error TS(1192) FIXME: Module '"node:https"' has no default export.
import https from 'node:https';
// @ts-expect-error TS(2792) FIXME: Cannot find module 'proxy-agent'. Did you mean to ... Remove this comment to see the full error message
import { ProxyAgent } from 'proxy-agent';
import { isValidUrl, color } from './util.js';

const LOG_HEADER = '[Request Proxy]';

/**
 * Initialize request proxy.
 * @param {ProxySettings} settings Proxy settings.
 * @typedef {object} ProxySettings
 * @property {boolean} enabled Whether proxy is enabled.
 * @property {string} url Proxy URL.
 * @property {string[]} bypass List of URLs to bypass proxy.
 * @property {boolean} enableKeepAlive Enable HTTP/HTTPS keep-alive.
 * @property {boolean} privateRequestFilterEnabled Whether the private request filter is enabled.
 */
export default function initRequestProxy({
    enabled,
    url,
    bypass,
    enableKeepAlive,
    privateRequestFilterEnabled
}: {
    enabled: boolean;
    url: string;
    bypass: string[];
    enableKeepAlive: boolean;
    privateRequestFilterEnabled: boolean;
}) {
    try {
        // No proxy is enabled, so return
        if (!enabled) {
            return;
        }

        if (privateRequestFilterEnabled) {
            console.warn(color.yellow(LOG_HEADER), 'Warning: Request proxy is enabled while private request filter is also enabled. Only URLs that BYPASS the request proxy will be checked.');
            console.warn(color.yellow(LOG_HEADER), 'To ensure all requests are properly filtered, disable the request proxy.');
        }

        if (!url) {
            console.error(color.red(LOG_HEADER), 'No proxy URL provided');
            return;
        }

        if (!isValidUrl(url)) {
            console.error(color.red(LOG_HEADER), 'Invalid proxy URL provided');
            return;
        }

        // ProxyAgent uses proxy-from-env under the hood
        // Reference: https://github.com/Rob--W/proxy-from-env
        process.env.all_proxy = url;

        if (Array.isArray(bypass) && bypass.length > 0) {
            process.env.no_proxy = bypass.join(',');
        }

        const httpAgent = http.globalAgent;
        const httpsAgent = https.globalAgent;

        const proxyAgent = new ProxyAgent({ httpAgent, httpsAgent, keepAlive: enableKeepAlive });

        http.globalAgent = proxyAgent;
        https.globalAgent = proxyAgent;

        console.info();
        console.info(color.green(LOG_HEADER), 'Proxy URL is used:', color.blue(url));
        console.info();
    } catch (error) {
        console.error(color.red(LOG_HEADER), 'Failed to initialize request proxy:', error);
    }
}
