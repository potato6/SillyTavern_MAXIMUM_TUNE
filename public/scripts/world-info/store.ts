/**
 * World Info EntityStore bridge.
 *
 * Provides an IndexedDB-backed store for world info entries, wrapping EntityStore.
 * Each lorebook gets its own store instance (separate IndexedDB database).
 * Maps `uid` -> `id` to satisfy EntityStore's key constraint.
 */

import { EntityStore } from '../storage-utils.js';
import type { WorldInfoEntryData } from './types.js';

/**
 * Internal entry type used by WorldInfoStore.
 * EntityStore requires `{ id: string | number }`, so we add `id` alongside `uid`.
 * Both hold the same numeric value.
 */
export type WorldInfoStoreEntry = WorldInfoEntryData & { id: number };

/**
 * Per-book IndexedDB store for world info entries.
 *
 * - All CRUD operations are async.
 * - Entries are stored with `id = uid` for EntityStore compatibility.
 * - Provides helpers for bulk load/save and server serialization.
 */
export class WorldInfoStore extends EntityStore<WorldInfoStoreEntry> {
    public readonly bookName: string;

    constructor(bookName: string) {
        // Unique DB per book so books are isolated in IndexedDB
        super(`SillyTavern_WI_${bookName}`, 'entries', 1);
        this.bookName = bookName;
    }

    // ── Entry CRUD ──────────────────────────────────────────────────────

    /**
     * Add an entry. Sets `entry.id = entry.uid` automatically.
     * @param entry
     */
    async addEntry(entry: WorldInfoEntryData): Promise<void> {
        const storeEntry = entry as WorldInfoStoreEntry;
        storeEntry.id = entry.uid;
        await this.add(storeEntry);
    }

    /**
     * Remove an entry by uid.
     * @param uid
     */
    async removeEntry(uid: number): Promise<boolean> {
        return this.remove(uid);
    }

    /**
     * Partially update an entry by uid.
     * @param uid
     * @param patch
     */
    async updateEntry(uid: number, patch: Partial<WorldInfoEntryData>): Promise<boolean> {
        return this.update(uid, patch as Partial<WorldInfoStoreEntry>);
    }

    /**
     * Get a single entry by uid.
     * @param uid
     */
    async getEntry(uid: number): Promise<WorldInfoEntryData | undefined> {
        return this.get(uid);
    }

    /**
     * Get all entries.
     */
    async getAllEntries(): Promise<WorldInfoEntryData[]> {
        return this.getAll();
    }

    /**
     * Check if an entry exists.
     * @param uid
     */
    async hasEntry(uid: number): Promise<boolean> {
        return this.has(uid);
    }

    /**
     * Return the total number of entries.
     */
    async entryCount(): Promise<number> {
        return this.size();
    }

    // ── UID management ─────────────────────────────────────────────────

    /**
     * Find the smallest unused UID.
     * O(n) scan of all entries but keeps UIDs dense.
     */
    async getFreeUid(): Promise<number | null> {
        const MAX_UID = 1_000_000;
        const entries = await this.getAll();
        const usedIds = new Set(entries.map((e) => e.uid));
        for (let uid = 0; uid < MAX_UID; uid++) {
            if (!usedIds.has(uid)) return uid;
        }
        return null;
    }

    // ── Bulk / lifecycle ────────────────────────────────────────────────

    /**
     * Replace all entries atomically (used when loading from server).
     * Clears history since it's a fresh load.
     * @param entries
     */
    async replaceAllEntries(entries: WorldInfoEntryData[]): Promise<void> {
        const storeEntries = entries.map((e) => {
            const se = e as WorldInfoStoreEntry;
            se.id = e.uid;
            return se;
        });
        await this.replaceAll(storeEntries);
    }

    /**
     * Serialize entries into the Record<uid, entry> format expected by the server API.
     */
    async toObject(): Promise<Record<string, WorldInfoEntryData>> {
        const entries = await this.getAll();
        const map: Record<string, WorldInfoEntryData> = {};
        for (const entry of entries) {
            map[String(entry.uid)] = entry;
        }
        return map;
    }

    /**
     * Remove all entries (history is wiped as a side effect).
     */
    async clearAll(): Promise<void> {
        await this.clear();
    }

    /**
     * Permanently delete the IndexedDB database for this book.
     * Call when the book itself is deleted (not just entries cleared).
     */
    async deleteDatabase(): Promise<void> {
        this.db?.close();
        this.db = null;
        await new Promise<void>((resolve, reject) => {
            const request = indexedDB.deleteDatabase(this.dbName);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
            request.onblocked = () => {
                console.warn(`[WorldInfoStore] DB deletion blocked for ${this.dbName}`);
                resolve(); // don't hang
            };
        });
    }

    /**
     * Query entries with optional filter, sort, and limit.
     * @param opts
     * @param opts.where
     * @param opts.sort
     * @param opts.limit
     */
    async queryEntries(
        opts: {
            where?: (entry: WorldInfoEntryData) => boolean;
            sort?: (a: WorldInfoEntryData, b: WorldInfoEntryData) => number;
            limit?: number;
        } = {},
    ): Promise<WorldInfoEntryData[]> {
        return this.query(opts);
    }
}
