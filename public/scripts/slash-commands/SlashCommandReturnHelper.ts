import { DOMPurify } from '../../lib.js';
import { sendSystemMessage, system_message_types } from '../../script.js';
import { callGenericPopup, POPUP_TYPE } from '../popup.js';
import { escapeHtml } from '../utils.js';
import { enumIcons } from './SlashCommandCommonEnumsProvider.js';
import { enumTypes, SlashCommandEnumValue } from './SlashCommandEnumValue.js';

/** @typedef {'pipe'|'object'|'chat-html'|'chat-text'|'popup-html'|'popup-text'|'toast-html'|'toast-text'|'console'|'none'} SlashCommandReturnType */

export const slashCommandReturnHelper = {
    // Without this, VSCode formatter fucks up JS docs. Don't ask me why.
    _: false,

    /**
     * Gets/creates the enum list of types of return relevant for a slash command
     * @param {object} [options] Options
     * @param {boolean} [options.allowPipe] Allow option to pipe the return value
     * @param {boolean} [options.allowObject] Allow option to return the value as an object
     * @param {boolean} [options.allowChat] Allow option to return the value as a chat message
     * @param {boolean} [options.allowPopup] Allow option to return the value as a popup
     * @param {boolean}[options.allowTextVersion] Used in combination with chat/popup/toast, some of them do not make sense for text versions, e.g.if you are building a HTML string anyway
     * @returns {SlashCommandEnumValue[]} The enum list
     */
    enumList: ({ allowPipe = true, allowObject = false, allowChat = false, allowPopup = false, allowTextVersion = true } = {}) => [
        // @ts-expect-error TS(2345) FIXME: Argument of type '"Return to the pipe for the next... Remove this comment to see the full error message
        allowPipe && new SlashCommandEnumValue('pipe', 'Return to the pipe for the next command', enumTypes.name, '|'),
        // @ts-expect-error TS(2345) FIXME: Argument of type '"Return as an object (or array) ... Remove this comment to see the full error message
        allowObject && new SlashCommandEnumValue('object', 'Return as an object (or array) to the pipe for the next command', enumTypes.variable, enumIcons.dictionary),
        // @ts-expect-error TS(2345) FIXME: Argument of type '"Sending a chat message with the... Remove this comment to see the full error message
        allowChat && new SlashCommandEnumValue('chat-html', 'Sending a chat message with the return value - Can display HTML', enumTypes.command, enumIcons.message),
        // @ts-expect-error TS(2345) FIXME: Argument of type '"Sending a chat message with the... Remove this comment to see the full error message
        allowChat && allowTextVersion && new SlashCommandEnumValue('chat-text', 'Sending a chat message with the return value - Will only display as text', enumTypes.qr, enumIcons.message),
        // @ts-expect-error TS(2345) FIXME: Argument of type '"Showing as a popup with the ret... Remove this comment to see the full error message
        allowPopup && new SlashCommandEnumValue('popup-html', 'Showing as a popup with the return value - Can display HTML', enumTypes.command, enumIcons.popup),
        // @ts-expect-error TS(2345) FIXME: Argument of type '"Showing as a popup with the ret... Remove this comment to see the full error message
        allowPopup && allowTextVersion && new SlashCommandEnumValue('popup-text', 'Showing as a popup with the return value - Will only display as text', enumTypes.qr, enumIcons.popup),
        // @ts-expect-error TS(2345) FIXME: Argument of type '"Show the return value as a toas... Remove this comment to see the full error message
        new SlashCommandEnumValue('toast-html', 'Show the return value as a toast notification - Can display HTML', enumTypes.command, 'ℹ️'),
        // @ts-expect-error TS(2345) FIXME: Argument of type '"Show the return value as a toas... Remove this comment to see the full error message
        allowTextVersion && new SlashCommandEnumValue('toast-text', 'Show the return value as a toast notification - Will only display as text', enumTypes.qr, 'ℹ️'),
        // @ts-expect-error TS(2345) FIXME: Argument of type '"Log the return value (object, i... Remove this comment to see the full error message
        new SlashCommandEnumValue('console', 'Log the return value (object, if it can be one) to the console', enumTypes.enum, '>'),
        // @ts-expect-error TS(2345) FIXME: Argument of type '"No return value"' is not assign... Remove this comment to see the full error message
        new SlashCommandEnumValue('none', 'No return value'),
    ].filter(x => !!x),

    /**
     * Handles the return value based on the specified type
     * @param {SlashCommandReturnType} type The type of return
     * @param {object|number|string} value The value to return
     * @param {object} [options] Options
     * @param {(o: object) => string} [options.objectToStringFunc] Function to convert the object to a string, if object was provided and 'object' was not the chosen return type
     * @param {(o: object) => string} [options.objectToHtmlFunc] Analog to 'objectToStringFunc', which will be used here if not provided - but can do a different string layout if HTML is requested
     * @returns {Promise<*>} The processed return value
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
    async doReturn(type, value, { objectToStringFunc = o => o?.toString(), objectToHtmlFunc = null } = {}) {
        const shouldHtml = type.endsWith('html');
        const actualConverterFunc = shouldHtml && objectToHtmlFunc ? objectToHtmlFunc : objectToStringFunc;
        const stringValue = typeof value !== 'string' ? actualConverterFunc(value) : value;

        switch (type) {
            case 'popup-html':
            case 'popup-text':
            case 'chat-text':
            case 'chat-html':
            case 'toast-text':
            case 'toast-html': {
                const htmlOrNotHtml = shouldHtml ? DOMPurify.sanitize(Bun.markdown.html(stringValue)) : escapeHtml(stringValue);

                if (type.startsWith('popup')) await callGenericPopup(htmlOrNotHtml, POPUP_TYPE.TEXT, '', { allowVerticalScrolling: true, wide: true });
                if (type.startsWith('chat')) sendSystemMessage(system_message_types.GENERIC, htmlOrNotHtml);
                if (type.startsWith('toast')) notyf.info(htmlOrNotHtml, null, { escapeHtml: !shouldHtml });

                return '';
            }
            case 'pipe':
                return stringValue ?? '';
            case 'object':
                return JSON.stringify(value);
            case 'console':
                console.info(value);
                return '';
            case 'none':
                return '';
            default:
                throw new Error(`Unknown return type: ${type}`);
        }
    },
};
