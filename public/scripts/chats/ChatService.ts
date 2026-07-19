import { chatStore } from './ChatStore.js';
import { ChatEntity, CreateChatOptions, DuplicateChatOptions } from './types.js';

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
     */
    async get(id: string): Promise<ChatEntity | undefined> {
        return chatStore.get(id);
    }

    /**
     * List all chats for a character.
     */
    async findByCharacter(characterId: string): Promise<ChatEntity[]> {
        return chatStore.findByCharacter(characterId);
    }

    /**
     * List the most recently modified chats.
     */
    async findRecent(limit = 50): Promise<ChatEntity[]> {
        return chatStore.findRecent(limit);
    }

    /**
     * Check whether a chat exists.
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
     */
    async delete(id: string): Promise<boolean> {
        return chatStore.remove(id);
    }

    /**
     * Rename a chat.
     */
    async rename(id: string, title: string): Promise<boolean> {
        return chatStore.rename(id, title);
    }

    /**
     * Archive a chat (soft-delete).
     */
    async archive(id: string): Promise<boolean> {
        return chatStore.archive(id);
    }

    /**
     * Duplicate a chat.
     */
    async duplicate(id: string, opts: DuplicateChatOptions = {}): Promise<ChatEntity | undefined> {
        const newId = crypto.randomUUID();
        const source = await chatStore.get(id);
        if (!source) return undefined;

        return chatStore.duplicate(id, newId, opts.newTitle);
    }

    /**
     * Update a chat's title and/or metadata atomically.
     */
    async update(id: string, patch: Partial<Pick<ChatEntity, 'title' | 'metadata'>>): Promise<boolean> {
        return chatStore.update(id, { ...patch, modified: Date.now() });
    }

    /**
     * Replace the messages array of a chat.
     */
    async setMessages(id: string, messages: ChatMessage[]): Promise<boolean> {
        return chatStore.setMessages(id, messages);
    }

    // ── Import / Export ────────────────────────────────────────

    /**
     * Serialise a chat to a plain object.
     */
    async export(id: string): Promise<ChatEntity | undefined> {
        return chatStore.export(id);
    }

    /**
     * Deserialise and persist a previously exported chat.
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
     */
    async transaction(fn: () => Promise<void>): Promise<void> {
        await chatStore.transaction(fn);
    }

    // ── Events ─────────────────────────────────────────────────

    /**
     * Subscribe to store-level events.
     */
    on<K extends keyof ChatServiceEventMap>(
        event: K,
        callback: (data: ChatServiceEventMap[K]) => void,
    ): void {
        chatStore.on(event as never, callback as never);
    }

    /**
     * Unsubscribe.
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
