/**
 * MessageService — high-level message operations.
 *
 * Provides a clean, async API for message CRUD (add, delete, edit,
 * insert) that is independent of the mutable global arrays.
 *
 * Currently backed by the global `chat` array (via ChatSession)
 * so it can coexist with legacy code.  Future versions will route
 * through ChatStore when the migration is complete.
 */

import { chatSession } from '../chats/ChatSession.js';
import { saveChatConditional, eventSource, event_types } from '../../script.js';

export interface AddMessageOptions {
    /** Insert after this message index (default: append to end). */
    insertAfter?: number;
    /** Scroll to the new message after adding. */
    scroll?: boolean;
    /** Whether to refresh swipe buttons. */
    showSwipes?: boolean;
    /** Force a specific message id. */
    forceId?: number;
}

export interface EditMessageOptions {
    /** New message text. */
    text?: string;
    /** New message name. */
    name?: string;
    /** Patch extra fields. */
    extra?: Partial<ChatMessageExtra>;
    /** Save after editing. */
    save?: boolean;
}

export interface DeleteMessageOptions {
    /** Delete all messages from this index to the end. */
    untilEnd?: boolean;
    /** Suppress confirmation dialogs. */
    silent?: boolean;
}

/**
 * Result of a message operation.
 */
export interface MessageResult {
    success: boolean;
    index: number;
    message?: ChatMessage;
}

/**
 * Service for message-level operations within the current chat.
 */
class MessageService {
    // ── Read ──────────────────────────────────────────────────

    /**
     * Get a message by its index in the current chat array.
     */
    get(index: number): ChatMessage | undefined {
        return chatSession.getMessage(index);
    }

    /**
     * Get the last N messages, optionally filtered.
     */
    getRecent(count: number, filter?: (m: ChatMessage) => boolean): ChatMessage[] {
        const msgs = chatSession.messages;
        const result: ChatMessage[] = [];
        for (let i = msgs.length - 1; i >= 0 && result.length < count; i--) {
            if (!filter || filter(msgs[i])) {
                result.unshift(msgs[i]);
            }
        }
        return result;
    }

    /**
     * Find the index of a message matching a predicate.
     */
    findIndex(predicate: (m: ChatMessage) => boolean): number {
        return chatSession.messages.findIndex(predicate);
    }

    /**
     * Find all messages matching a predicate.
     */
    find(predicate: (m: ChatMessage) => boolean): ChatMessage[] {
        return chatSession.messages.filter(predicate);
    }

    /**
     * Current message count.
     */
    get count(): number {
        return chatSession.messageCount;
    }

    // ── Add ───────────────────────────────────────────────────

    /**
     * Add a message to the chat.
     *
     * By default appends to the end.  Pass `insertAfter` to place
     * the message after a specific index.
     */
    async add(message: ChatMessage, options?: AddMessageOptions): Promise<MessageResult> {
        const msgs = chatSession.messages;
        const index = options?.insertAfter !== undefined
            ? options.insertAfter + 1
            : msgs.length;

        msgs.splice(index, 0, message);

        await this.persist();

        chatSession.emit('message-added', { message, index });
        return { success: true, index, message };
    }

    // ── Delete ────────────────────────────────────────────────

    /**
     * Delete a message by index.
     */
    async delete(index: number, options?: DeleteMessageOptions): Promise<MessageResult> {
        const msgs = chatSession.messages;
        if (index < 0 || index >= msgs.length) {
            return { success: false, index };
        }

        if (options?.untilEnd) {
            const removed = msgs.splice(index);
            await this.persist();
            chatSession.emit('message-removed', { messages: removed, startIndex: index });
            return { success: true, index };
        }

        const [removed] = msgs.splice(index, 1);
        await this.persist();
        chatSession.emit('message-removed', { message: removed, index });
        return { success: true, index, message: removed };
    }

    /**
     * Delete the last N messages.
     */
    async deleteLast(count = 1): Promise<MessageResult> {
        const msgs = chatSession.messages;
        const startIndex = Math.max(0, msgs.length - count);
        return this.delete(startIndex, { untilEnd: true });
    }

    /**
     * Clear all messages.
     */
    async clear(): Promise<void> {
        chatSession.messages.splice(0);
        await this.persist();
        chatSession.emit('message-removed', { messages: [], startIndex: 0 });
    }

    // ── Edit ──────────────────────────────────────────────────

    /**
     * Edit an existing message.
     */
    async edit(index: number, patch: EditMessageOptions): Promise<MessageResult> {
        const message = chatSession.getMessage(index);
        if (!message) {
            return { success: false, index };
        }

        if (patch.text !== undefined) message.mes = patch.text;
        if (patch.name !== undefined) message.name = patch.name;
        if (patch.extra) {
            if (!message.extra || typeof message.extra !== 'object') {
                message.extra = {} as ChatMessageExtra;
            }
            Object.assign(message.extra, patch.extra);
        }

        if (patch.save !== false) {
            await this.persist();
        }

        chatSession.emit('message-edited', { message, index });
        return { success: true, index, message };
    }

    // ── Move / Reorder ────────────────────────────────────────

    /**
     * Move a message from one index to another.
     */
    async move(fromIndex: number, toIndex: number): Promise<MessageResult> {
        const msgs = chatSession.messages;
        if (fromIndex < 0 || fromIndex >= msgs.length || toIndex < 0 || toIndex >= msgs.length) {
            return { success: false, index: fromIndex };
        }

        const [message] = msgs.splice(fromIndex, 1);
        msgs.splice(toIndex, 0, message);

        await this.persist();
        chatSession.emit('message-edited', { message, index: toIndex });
        return { success: true, index: toIndex, message };
    }

    // ── Persistence ───────────────────────────────────────────

    /**
     * Persist the current chat state.
     *
     * Calls through to `saveChatConditional` which handles
     * debounced saves.  Override in subclasses if a different
     * persistence strategy is needed.
     */
    async persist(): Promise<void> {
        await saveChatConditional();
    }
}

/** Singleton service instance. */
export const messageService = new MessageService();
