import { saveSettingsDebounced } from '../script.js';
import { power_user } from './power-user.js';
import { isValidUrl } from './utils.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const TomSelect: any;

/**
 * @param {{ term: string; }} request
 * @param {function} resolve
 * @param {string} serverLabel
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'request' implicitly has an 'any' type.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function findServers(request, resolve, serverLabel) {
    if (!power_user.servers) {
        power_user.servers = [];
    }

    const needle = request.term.toLowerCase();
    // @ts-expect-error TS(2339) FIXME: Property 'label' does not exist on type 'never'.
    const result = power_user.servers.filter(x => x.label == serverLabel).sort((a, b) => b.lastConnection - a.lastConnection).map(x => x.url).slice(0, 5);
    const hasExactMatch = result.findIndex(x => x.toLowerCase() == needle) !== -1;

    if (request.term && !hasExactMatch) {
        result.unshift(request.term);
    }

    resolve(result);
}

/**
 *
 * @param event
 * @param ui
 * @param serverLabel
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function selectServer(event, ui, serverLabel) {
    // unfocus the input
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        event.target.value = ui.item.value;
        event.target.dispatchEvent(new Event('input', { bubbles: true }));
        event.target.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    document.querySelectorAll('[data-server-connect]').forEach(function (el) {
        // @ts-expect-error TS(2339) FIXME: Property 'dataset' does not exist on type 'Element... Remove this comment to see the full error message
        const serverLabels = String(el.dataset.serverConnect).split(',');

        if (serverLabels.includes(serverLabel)) {
            el.dispatchEvent(new Event('click', { bubbles: true }));
        }
    });
}

/**
 *
 */
function createServerAutocomplete() {
    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
     
    const serverLabel = this.dataset.serverHistory;
    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const input = this;

    if (input) {
        input.tomSelectInstance = new TomSelect(input, {
            maxItems: 1,
            create: false,
            valueField: 'url',
            labelField: 'url',
            searchField: ['url'],
            // @ts-expect-error TS(7006) FIXME: Parameter implicit any
            load: function (query, callback) {
                if (!power_user.servers) {
                    power_user.servers = [];
                }
                const needle = query.toLowerCase();
                const result = power_user.servers
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .filter((x: any) => x.label == serverLabel)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .sort((a: any, b: any) => b.lastConnection - a.lastConnection)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .map((x: any) => ({ url: x.url }))
                    .slice(0, 5);
                const hasExactMatch = result.findIndex((// eslint-disable-next-line @typescript-eslint/no-explicit-any
                    x: any) => x.url.toLowerCase() == needle) !== -1;
                if (query && !hasExactMatch) {
                    result.unshift({ url: query });
                }
                callback(result);
            },
            // @ts-expect-error TS(7006) FIXME: Parameter implicit any
            onChange: function (value) {
                if (value) {
                    input.value = value;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('blur', { bubbles: true }));
                }
            },
        });
    }
}

/**
 *
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function onInputFocus() {
}

/**
 *
 */
function onServerConnectClick() {
    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
    const serverLabels = String(this.dataset.serverConnect).split(',');

    serverLabels.forEach(serverLabel => {
        if (!power_user.servers) {
            power_user.servers = [];
        }

        const input = document.querySelector(`[data-server-history="${serverLabel}"]`);
        // @ts-expect-error TS(2339) FIXME: Property 'value' does not exist on type 'Element'.
        const value = String(input ? input.value : '').toLowerCase().trim();

        // Don't save empty values or invalid URLs
        if (!value || !isValidUrl(value)) {
            return;
        }

        // @ts-expect-error TS(2339) FIXME: Property 'url' does not exist on type 'never'.
        const server = power_user.servers.find(x => x.url === value && x.label === serverLabel);

        if (!server) {
            // @ts-expect-error TS(2322) FIXME: Type 'string' is not assignable to type 'never'.
            power_user.servers.push({ label: serverLabel, url: value, lastConnection: Date.now() });
        } else {
            // @ts-expect-error TS(2339) FIXME: Property 'lastConnection' does not exist on type '... Remove this comment to see the full error message
            server.lastConnection = Date.now();
        }

        saveSettingsDebounced();
    });
}

/**
 *
 */
export function initServerHistory() {
    document.querySelectorAll('[data-server-history]').forEach(el => createServerAutocomplete.call(el));
    document.addEventListener('click', function (event) {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const target = event.target.closest('[data-server-connect]');
        if (target instanceof HTMLElement) {
            // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 2.
            onServerConnectClick.call(target, event);
        }
    });
}
