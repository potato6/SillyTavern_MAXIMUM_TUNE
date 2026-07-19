/**
 * ChatSession — live reference to the currently active chat state.
 *
 * Rather than each module importing `chat`, `chat_metadata`, and `this_chid`
 * from script.ts independently, ChatSession provides a single entry point
 * that the UI layer consults for "what chat is open right now?"
 *
 * The session retains live references to the global arrays so that
 * existing code (which still mutates those globals directly) stays
 * in sync without a migration.
 *
 * ── Migration path ─────────────────────────────────────────────
 *
 * New code should depend only on ChatSession + ChatStore/ChatService.
 * Over time the mutable globals in script.ts can be replaced by
 * session-managed state.
 */

import {
    chat,
    chat_metadata,
    this_chid,
    characters,
    getCurrentChatId,
} from '../../script.js';
import { selected_group } from '../group-chats.js';

export type SessionEvent = 'chat-changed' | 'message-added' | 'message-removed' | 'message-edited' | 'metadata-changed';

type SessionCallback = (data: unknown) => void;

/**
 * Lightweight session object that reflects the current in-memory state.
 *
 * Because this reads live bindings from `script.ts`, it is always
 * consistent with the global arrays.  Consumers that call into
 * `ChatService` or `MessageService` get a unified view without
 * touching the globals themselves.
 */
class ChatSession {
    private listeners = new Map<SessionEvent, Set<SessionCallback>>();

    // ── Read-only accessors ─────────────────────────────────

    /**
     * The active chat ID, or null when no chat is loaded.
     */
    get currentChatId(): string | null {
        return getCurrentChatId() ?? null;
    }

    /**
     * Whether a chat is currently loaded.
     */
    get hasChat(): boolean {
        return this.currentChatId !== null;
    }

    /**
     * The character avatar id of the currently viewed chat,
     * or undefined when viewing a group or no chat.
     */
    get characterId(): string | undefined {
        if (selected_group) return undefined;
        return characters[this_chid]?.avatar;
    }

    /**
     * Whether the current chat belongs to a group.
     */
    get isGroup(): boolean {
        return !!selected_group;
    }

    /**
     * The live messages array (reference to the global `chat`).
     */
    get messages(): ChatMessage[] {
        return chat;
    }

    /**
     * The live chat metadata object.
     */
    get metadata(): ChatMetadata {
        return chat_metadata;
    }

    /**
     * The index of the last message in the array.
     */
    get lastMessageIndex(): number {
        return chat.length - 1;
    }

    /**
     * Retrieve a message by its array index.
     * @param index
     */
    getMessage(index: number): ChatMessage | undefined {
        return chat[index];
    }

    /**
     * The total number of messages in the current chat.
     */
    get messageCount(): number {
        return chat.length;
    }

    // ── Event helpers ───────────────────────────────────────

    on(event: SessionEvent, cb: SessionCallback): void {
        let set = this.listeners.get(event);
        if (!set) {
            set = new Set();
            this.listeners.set(event, set);
        }
        set.add(cb);
    }

    off(event: SessionEvent, cb: SessionCallback): void {
        this.listeners.get(event)?.delete(cb);
    }

    /**
     * @param event
     * @param data
     * @internal
     */
    emit(event: SessionEvent, data: unknown): void {
        this.listeners.get(event)?.forEach((cb) => {
            try {
                cb(data);
            } catch (e) {
                console.error(`ChatSession event "${event}" handler error:`, e);
            }
        });
    }
}

/** Singleton session instance. */
export const chatSession = new ChatSession();
