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
    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(event.target).val(ui.item.value).trigger('input').trigger('blur');

    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('[data-server-connect]').each(function () {
        // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const serverLabels = String($(this).data('server-connect')).split(',');

        if (serverLabels.includes(serverLabel)) {
            // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(this).trigger('click');
        }
    });
}

/**
 *
 */
function createServerAutocomplete() {
    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const inputElement = $(this);
    const serverLabel = inputElement.data('server-history');

    inputElement
        .autocomplete({
            source: (i, o) => findServers(i, o, serverLabel),
            select: (e, u) => selectServer(e, u, serverLabel),
            minLength: 0,
        })
        .on('focus', onInputFocus); // <== show tag list on click
}

/**
 *
 */
function onInputFocus() {
    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(this).autocomplete('search', $(this).val());
}

/**
 *
 */
function onServerConnectClick() {
    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const serverLabels = String($(this).data('server-connect')).split(',');

    serverLabels.forEach(serverLabel => {
        if (!power_user.servers) {
            power_user.servers = [];
        }

        // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const value = String($(`[data-server-history="${serverLabel}"]`).val()).toLowerCase().trim();

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
    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('[data-server-history]').each(createServerAutocomplete);
    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '[data-server-connect]', onServerConnectClick);
}
