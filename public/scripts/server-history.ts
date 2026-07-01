import { saveSettingsDebounced } from '../script.js';
import { power_user } from './power-user.js';
import { isValidUrl } from './utils.js';

/**
 * @param {{ term: string; }} request
 * @param {function} resolve
 * @param {string} serverLabel
 */
function findServers(request, resolve, serverLabel) {
    if (!power_user.servers) {
        power_user.servers = [];
    }

    const needle = request.term.toLowerCase();
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
function selectServer(event, ui, serverLabel) {
    // unfocus the input
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        event.target.value = ui.item.value;
        event.target.dispatchEvent(new Event('input', { bubbles: true }));
        event.target.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    document.querySelectorAll('[data-server-connect]').forEach(function (el) {
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
    const inputElement = $(this);
    const serverLabel = this.dataset.serverHistory;

    inputElement.autocomplete({
        source: (i, o) => findServers(i, o, serverLabel),
        select: (e, u) => selectServer(e, u, serverLabel),
        minLength: 0,
    });
    this.addEventListener('focus', onInputFocus);
}

/**
 *
 */
function onInputFocus() {
    $(this).autocomplete('search', this.value);
}

/**
 *
 */
function onServerConnectClick() {
    const serverLabels = String(this.dataset.serverConnect).split(',');

    serverLabels.forEach(serverLabel => {
        if (!power_user.servers) {
            power_user.servers = [];
        }

        const input = document.querySelector(`[data-server-history="${serverLabel}"]`);
        const value = String(input ? input.value : '').toLowerCase().trim();

        // Don't save empty values or invalid URLs
        if (!value || !isValidUrl(value)) {
            return;
        }

        const server = power_user.servers.find(x => x.url === value && x.label === serverLabel);

        if (!server) {
            power_user.servers.push({ label: serverLabel, url: value, lastConnection: Date.now() });
        } else {
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
        const target = event.target.closest('[data-server-connect]');
        if (target instanceof HTMLElement) {
            onServerConnectClick.call(target, event);
        }
    });
}
