import { MacroRegistry, MacroCategory, MacroValueType } from '../engine/MacroRegistry.js';
import { chat, chat_metadata } from '../../../script.js';

/**
 * Registers macros that inspect the current chat log and swipe state
 * (message texts, indices, swipes, and context boundaries).
 */
export function registerChatMacros() {
    MacroRegistry.registerMacro('lastMessage', {
        category: MacroCategory.CHAT,
        description: 'Last message in the chat.',
        returns: 'Last message in the chat.',
        handler: () => String(getLastMessage() ?? ''),
    });

    MacroRegistry.registerMacro('lastMessageId', {
        category: MacroCategory.CHAT,
        description: 'Index of the last message in the chat.',
        returns: 'Index of the last message in the chat.',
        returnType: MacroValueType.INTEGER,
        handler: () => String(getLastMessageId() ?? ''),
    });

    MacroRegistry.registerMacro('lastUserMessage', {
        category: MacroCategory.CHAT,
        description: 'Last user message in the chat.',
        returns: 'Last user message in the chat.',
        handler: () => String(getLastUserMessage() ?? ''),
    });

    MacroRegistry.registerMacro('lastCharMessage', {
        category: MacroCategory.CHAT,
        description: 'Last character/bot message in the chat.',
        returns: 'Last character/bot message in the chat.',
        handler: () => String(getLastCharMessage() ?? ''),
    });

    MacroRegistry.registerMacro('firstIncludedMessageId', {
        category: MacroCategory.CHAT,
        description: 'Index of the first message included in the current context.',
        returns: 'Index of the first message included in the context.',
        returnType: MacroValueType.INTEGER,
        handler: () => String(getFirstIncludedMessageId() ?? ''),
    });

    MacroRegistry.registerMacro('firstDisplayedMessageId', {
        category: MacroCategory.CHAT,
        description: 'Index of the first displayed message in the chat.',
        returns: 'Index of the first displayed message in the chat.',
        returnType: MacroValueType.INTEGER,
        handler: () => String(getFirstDisplayedMessageId() ?? ''),
    });

    MacroRegistry.registerMacro('lastSwipeId', {
        category: MacroCategory.CHAT,
        description: '1-based index of the last swipe for the last message.',
        returns: '1-based index of the last swipe.',
        returnType: MacroValueType.INTEGER,
        handler: () => String(getLastSwipeId() ?? ''),
    });

    MacroRegistry.registerMacro('currentSwipeId', {
        category: MacroCategory.CHAT,
        description: '1-based index of the current swipe.',
        returns: '1-based index of the current swipe.',
        returnType: MacroValueType.INTEGER,
        handler: () => String(getCurrentSwipeId() ?? ''),
    });

    MacroRegistry.registerMacro('allChatRange', {
        category: MacroCategory.CHAT,
        description: 'Range of all message IDs in the chat (e.g. "0-10"). Empty string if the chat is empty.',
        returns: 'Range string from 0 to last message ID, or empty string.',
        handler: () => {
            if (!Array.isArray(chat) || chat.length === 0) {
                return '';
            }
            return `0-${chat.length - 1}`;
        },
    });
}

/**
 *
 * @param root0
 * @param root0.exclude_swipe_in_propress
 * @param root0.filter
 */
function getLastMessageId({ exclude_swipe_in_propress = true, filter = null } = {}) {
    if (!Array.isArray(chat) || chat.length === 0) {
        return null;
    }

    for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];

        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        if (exclude_swipe_in_propress && message.swipes && message.swipe_id >= message.swipes.length) {
            continue;
        }

        // @ts-expect-error TS(2349) FIXME: This expression is not callable.
        if (!filter || filter(message)) {
            return i;
        }
    }

    return null;
}

/**
 *
 */
function getLastMessage() {
    const mid = getLastMessageId();
    // @ts-expect-error TS(2339) FIXME: Property 'mes' does not exist on type 'never'.
    return typeof mid === 'number' ? (chat[mid]?.mes ?? '') : '';
}

/**
 *
 */
function getLastUserMessage() {
    // @ts-expect-error TS(2322) FIXME: Type '(m: any) => any' is not assignable to type '... Remove this comment to see the full error message
    const mid = getLastMessageId({ filter: m => m.is_user && !m.is_system });
    // @ts-expect-error TS(2339) FIXME: Property 'mes' does not exist on type 'never'.
    return typeof mid === 'number' ? (chat[mid]?.mes ?? '') : '';
}

/**
 *
 */
function getLastCharMessage() {
    // @ts-expect-error TS(2322) FIXME: Type '(m: any) => boolean' is not assignable to ty... Remove this comment to see the full error message
    const mid = getLastMessageId({ filter: m => !m.is_user && !m.is_system });
    // @ts-expect-error TS(2339) FIXME: Property 'mes' does not exist on type 'never'.
    return typeof mid === 'number' ? (chat[mid]?.mes ?? '') : '';
}

/**
 *
 */
function getFirstIncludedMessageId() {
    const value = chat_metadata.lastInContextMessageId;
    return typeof value === 'number' ? value : null;
}

/**
 *
 */
function getFirstDisplayedMessageId() {
    const mesElement = document.querySelector('#chat .mes');
    const mesId = Number(mesElement?.getAttribute('mesid'));
    if (!Number.isNaN(mesId) && mesId >= 0) {
        return mesId;
    }
    return null;
}

/**
 *
 */
function getLastSwipeId() {
    const mid = getLastMessageId({ exclude_swipe_in_propress: false });
    if (typeof mid !== 'number') {
        return null;
    }
    // @ts-expect-error TS(2339) FIXME: Property 'swipes' does not exist on type 'never'.
    const swipes = chat[mid]?.swipes;
    return Array.isArray(swipes) ? swipes.length : null;
}

/**
 *
 */
function getCurrentSwipeId() {
    const mid = getLastMessageId({ exclude_swipe_in_propress: false });
    if (typeof mid !== 'number') {
        return null;
    }
    // @ts-expect-error TS(2339) FIXME: Property 'swipe_id' does not exist on type 'never'... Remove this comment to see the full error message
    const swipeId = chat[mid]?.swipe_id;
    return typeof swipeId === 'number' ? swipeId + 1 : null;
}
