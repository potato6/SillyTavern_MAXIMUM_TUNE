import { Handlebars } from '../lib.js';
import { chat, substituteParams } from '../script.js';

// Register any macro that you want to leave in the compiled story string
Handlebars.registerHelper('trim', () => '{{trim}}');
// Catch-all helper for any macro that is not defined for story strings
Handlebars.registerHelper('helperMissing', function (...args: unknown[]) {
    const options = args[args.length - 1];
    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
    const macroName = options.name;
    return substituteParams(`{{${macroName}}}`);
});

/**
 * Returns the ID of the last message in the chat
 *
 * Optionally can only choose specific messages, if a filter is provided.
 * @param {object} param0 - Optional arguments
 * @param {boolean} [param0.exclude_swipe_in_propress] - Whether a message that is currently being swiped should be ignored
 * @param {function(object):boolean} [param0.filter] - A filter applied to the search, ignoring all messages that don't match the criteria. For example to only find user messages, etc.
 * @returns {number|null} The message id, or null if none was found
 */
export function getLastMessageId({ exclude_swipe_in_propress = true, filter = null } = {}) {
    for (let i = chat?.length - 1; i >= 0; i--) {
        const message = chat[i];

        // If ignoring swipes and the message is being swiped, continue
        // We can check if a message is being swiped by checking whether the current swipe id is not in the list of finished swipes yet
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        if (exclude_swipe_in_propress && message.swipes && message.swipe_id >= message.swipes.length) {
            continue;
        }

        // Check if no filter is provided, or if the message passes the filter
        // @ts-expect-error TS(2349) FIXME: This expression is not callable.
        if (!filter || filter(message)) {
            return i;
        }
    }

    return null;
}
