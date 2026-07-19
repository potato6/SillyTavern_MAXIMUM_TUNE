import { chatStore } from './ChatStore.js';
import type { ChatEntity, CreateChatOptions, DuplicateChatOptions } from './types.js';

/**
 * High-level chat operations.
 *
 * ChatService is the public API consumed by the UI layer.
 * It coordinates across the store, transaction boundaries,
 * and any cross-cutting concerns (validation, logging, etc.)
 * without the caller needing to know about IndexedDB or EntityStore.
 */
export class ChatService {
    // ── Lifecycle ──────────────────────────────────────────────

    /**
     * Initialize the underlying store.
     * Safe to call more than once.
     */
    async init(): Promise<void> {
        await chatStore.init();
    }

    // ── Queries ────────────────────────────────────────────────

    /**
     * Get a single chat by id.
     * @param id
     */
    async get(id: string): Promise<ChatEntity | undefined> {
        return chatStore.get(id);
    }

    /**
     * List all chats for a character.
     * @param characterId
     */
    async findByCharacter(characterId: string): Promise<ChatEntity[]> {
        return chatStore.findByCharacter(characterId);
    }

    /**
     * List the most recently modified chats.
     * @param limit
     */
    async findRecent(limit = 50): Promise<ChatEntity[]> {
        return chatStore.findRecent(limit);
    }

    /**
     * Check whether a chat exists.
     * @param id
     */
    async exists(id: string): Promise<boolean> {
        return chatStore.has(id);
    }

    /**
     * Return the total number of stored chats.
     */
    async count(): Promise<number> {
        return chatStore.size();
    }

    // ── Mutations (transactional) ──────────────────────────────

    /**
     * Create a new chat and return its id.
     * @param opts
     */
    async create(opts: CreateChatOptions): Promise<string> {
        const now = Date.now();
        const id = crypto.randomUUID();

        const chat: ChatEntity = {
            id,
            characterId: opts.characterId,
            title: opts.title ?? `Chat ${new Date(now).toLocaleString()}`,
            messages: opts.messages ?? [],
            metadata: opts.metadata ?? {},
            created: now,
            modified: now,
        };

        await chatStore.add(chat);
        return id;
    }

    /**
     * Delete a chat (permanent).
     * @param id
     */
    async delete(id: string): Promise<boolean> {
        return chatStore.remove(id);
    }

    /**
     * Rename a chat.
     * @param id
     * @param title
     */
    async rename(id: string, title: string): Promise<boolean> {
        return chatStore.rename(id, title);
    }

    /**
     * Archive a chat (soft-delete).
     * @param id
     */
    async archive(id: string): Promise<boolean> {
        return chatStore.archive(id);
    }

    /**
     * Duplicate a chat.
     * @param id
     * @param opts
     */
    async duplicate(id: string, opts: DuplicateChatOptions = {}): Promise<ChatEntity | undefined> {
        const newId = crypto.randomUUID();
        const source = await chatStore.get(id);
        if (!source) return undefined;

        return chatStore.duplicate(id, newId, opts.newTitle);
    }

    /**
     * Update a chat's title and/or metadata atomically.
     * @param id
     * @param patch
     */
    async update(id: string, patch: Partial<Pick<ChatEntity, 'title' | 'metadata'>>): Promise<boolean> {
        return chatStore.update(id, { ...patch, modified: Date.now() });
    }

    /**
     * Replace the messages array of a chat.
     * @param id
     * @param messages
     */
    async setMessages(id: string, messages: ChatMessage[]): Promise<boolean> {
        return chatStore.setMessages(id, messages);
    }

    // ── Import / Export ────────────────────────────────────────

    /**
     * Serialise a chat to a plain object.
     * @param id
     */
    async export(id: string): Promise<ChatEntity | undefined> {
        return chatStore.export(id);
    }

    /**
     * Deserialise and persist a previously exported chat.
     * @param data
     */
    async import(data: ChatEntity): Promise<void> {
        return chatStore.import(data);
    }

    // ── Search ─────────────────────────────────────────────────

    /**
     * Full-text search across chat titles (case-insensitive).
     *
     * Returns chats whose title contains the query string.
     * A proper search index can replace this when needed.
     * @param query
     */
    async search(query: string): Promise<ChatEntity[]> {
        if (!query.trim()) return [];

        const q = query.toLowerCase();
        const all = await chatStore.getAll();
        return all.filter((c) => c.title.toLowerCase().includes(q));
    }

    // ── Transactions ───────────────────────────────────────────

    /**
     * Run a batch of operations inside a single IndexedDB
     * transaction so the entire group succeeds or fails
     * atomically and produces a single undo entry.
     * @param fn
     */
    async transaction(fn: () => Promise<void>): Promise<void> {
        await chatStore.transaction(fn);
    }

    // ── Events ─────────────────────────────────────────────────

    /**
     * Subscribe to store-level events.
     * @param event
     * @param callback
     */
    on<K extends keyof ChatServiceEventMap>(
        event: K,
        callback: (data: ChatServiceEventMap[K]) => void,
    ): void {
        chatStore.on(event as never, callback as never);
    }

    /**
     * Unsubscribe.
     * @param event
     * @param callback
     */
    off<K extends keyof ChatServiceEventMap>(
        event: K,
        callback: (data: ChatServiceEventMap[K]) => void,
    ): void {
        chatStore.off(event as never, callback as never);
    }

    // ── Undo / Redo ────────────────────────────────────────────

    async undo(): Promise<boolean> {
        return chatStore.undo();
    }

    async redo(): Promise<boolean> {
        return chatStore.redo();
    }

    get canUndo(): boolean {
        return chatStore.canUndo;
    }

    get canRedo(): boolean {
        return chatStore.canRedo;
    }
}

/**
 * Strongly-typed event map for ChatService subscribers.
 */
export interface ChatServiceEventMap {
    added: ChatEntity;
    removed: ChatEntity;
    changed: ChatEntity;
    cleared: null;
    loaded: ChatEntity[] | null;
}

/** Singleton service instance. */
export const chatService = new ChatService();
