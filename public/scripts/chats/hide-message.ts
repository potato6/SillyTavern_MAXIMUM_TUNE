/**
 * Hide / unhide message range operations.
 */

import { chat } from '../../script.js';

/**
 * Hides or unhides a range of messages.
 * @param start Start message ID
 * @param end End message ID (inclusive)
 * @param unhide Whether to unhide instead of hide
 * @param nameFilter Optional name filter
 */
export async function hideChatMessageRange(
    start: number,
    end: number | null,
    unhide: boolean,
    nameFilter: string | null = null,
): Promise<void> {
    if (isNaN(start)) return;
    if (!end) end = start;
    const hide = !unhide;

    for (let messageId = start; messageId <= end; messageId++) {
        const message = chat[messageId];
        if (!message) continue;
        if (nameFilter && (message as Record<string, unknown>).name !== nameFilter) continue;

        if (hide) {
            (message as Record<string, unknown>).is_system = true;
        } else {
            delete (message as Record<string, unknown>).is_system;
        }
    }
}

/**
 * Hides a single message.
 * @param messageId Message ID
 * @param _messageBlock
 */
export async function hideChatMessage(messageId: number, _messageBlock?: unknown): Promise<void> {
    return hideChatMessageRange(messageId, messageId, false);
}

/**
 * Unhides a single message.
 * @param messageId Message ID
 * @param _messageBlock
 */
export async function unhideChatMessage(messageId: number, _messageBlock?: unknown): Promise<void> {
    return hideChatMessageRange(messageId, messageId, true);
}
