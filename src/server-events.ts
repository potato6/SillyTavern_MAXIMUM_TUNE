// @ts-expect-error TS(1259) FIXME: Module '"node:events"' can only be default-importe... Remove this comment to see the full error message
import EventEmitter from 'node:events';
// @ts-expect-error TS(1259) FIXME: Module '"node:process"' can only be default-import... Remove this comment to see the full error message
import process from 'node:process';

/**
 * @typedef {import('../index').ServerEventMap} ServerEventMap
 * @type {EventEmitter<ServerEventMap>} The default event source.
 */
export const serverEvents = new EventEmitter();
process.serverEvents = serverEvents;
export default serverEvents;

/**
 * @enum {string}
 * @readonly
 */
export const EVENT_NAMES = Object.freeze({
    /**
     * Emitted when the server has started.
     */
    SERVER_STARTED: 'server-started',
});
