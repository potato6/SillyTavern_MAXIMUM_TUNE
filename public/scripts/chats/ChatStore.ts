import { EntityStore, IndexConfig } from '../storage-utils.js';
import { ChatEntity } from './types.js';

/**
 * Secondary indexes for chat lookups.
 */
const INDEXES: IndexConfig[] = [
    { name: 'characterId', keyPath: 'characterId' },
    { name: 'title', keyPath: 'title' },
    { name: 'modified', keyPath: 'modified' },
];

/**
 * Single source of truth for chat metadata.
 *
 * Owns all CRUD, IndexedDB persistence, indexes, events,
 * transactions, and undo/redo for ChatEntity objects.
 *
 * Everything else (ChatService, UI, rendering) calls into this
 * store instead of manipulating global arrays.
 */
export class ChatStore extends EntityStore<ChatEntity> {
    constructor() {
        super('SillyTavern', 'chats', 1);
    }

    // ── Lifecycle ──────────────────────────────────────────────

    /**
     * Open the database and create indexes.
     * Safe to call multiple times (no-op after first).
     */
    override async init(indexes: IndexConfig[] = INDEXES): Promise<void> {
        await super.init(indexes);
    }

    // ── Domain-specific queries ────────────────────────────────

    /**
     * Return every chat belonging to a character.
     */
    async findByCharacter(characterId: string): Promise<ChatEntity[]> {
        return this.by('characterId', characterId);
    }

    /**
     * Return every chat sorted by most-recently-modified first.
     *
     * Uses a cursor scan because IndexedDB only supports
     * forward-order iteration on indexes.
     */
    async findRecent(limit = 50): Promise<ChatEntity[]> {
        return this.query({
            sort: (a, b) => b.modified - a.modified,
            limit,
        });
    }

    /**
     * Rename a chat in-place.
     */
    async rename(id: string, title: string): Promise<boolean> {
        return this.update(id, { title, modified: Date.now() });
    }

    /**
     * Archive (soft-delete) a chat by clearing its characterId.
     * Archived chats are excluded from normal lookups but not deleted.
     */
    async archive(id: string): Promise<boolean> {
        const chat = await this.get(id);
        if (!chat) return false;
        return this.update(id, {
            characterId: '__archived__',
            modified: Date.now(),
        });
    }

    /**
     * Duplicate a chat with a new id.
     */
    async duplicate(id: string, newId: string, newTitle?: string): Promise<ChatEntity | undefined> {
        const source = await this.get(id);
        if (!source) return undefined;

        const clone: ChatEntity = {
            ...source,
            id: newId,
            title: newTitle ?? `${source.title} (copy)`,
            created: Date.now(),
            modified: Date.now(),
        };

        await this.add(clone);
        return clone;
    }

    /**
     * Replace the message array of a chat.
     */
    async setMessages(id: string, messages: ChatMessage[]): Promise<boolean> {
        return this.update(id, { messages, modified: Date.now() });
    }

    /**
     * Merge a metadata patch into a chat's metadata.
     */
    async patchMetadata(id: string, patch: Partial<ChatMetadata>): Promise<boolean> {
        const chat = await this.get(id);
        if (!chat) return false;
        return this.update(id, {
            metadata: { ...chat.metadata, ...patch },
            modified: Date.now(),
        });
    }

    /**
     * Export a chat as a plain JSON-compatible snapshot.
     */
    async export(id: string): Promise<ChatEntity | undefined> {
        return this.get(id);
    }

    /**
     * Import a previously exported snapshot.
     */
    async import(data: ChatEntity): Promise<void> {
        await this.add(data);
    }
}

/** Singleton instance used across the application. */
export const chatStore = new ChatStore();
