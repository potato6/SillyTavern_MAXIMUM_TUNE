// ──────────────────────────────────────────────
// Types & Interfaces
// ──────────────────────────────────────────────

export type StoreEvent = 'added' | 'removed' | 'changed' | 'cleared' | 'loaded';

export interface QueryOptions<T> {
    /** Custom filter function. Warning: requires iterating via cursor. */
    where?: (item: T) => boolean;
    /** Sorting function applied after filtering. */
    sort?: (a: T, b: T) => number;
    /** Maximum number of results to return. */
    limit?: number;
}

export interface IndexConfig {
    name: string;
    keyPath: string | string[];
    options?: IDBIndexParameters;
}

export interface HistoryAction<T> {
    type: 'add' | 'remove' | 'update';
    /** The state of the item AFTER an add/update, or BEFORE a remove. */
    item: T;
    /** The state of the item BEFORE an update. */
    oldItem?: T;
}

export interface HistoryEntry<T> {
    actions: HistoryAction<T>[];
}

// ──────────────────────────────────────────────
// EntityStore Class
// ──────────────────────────────────────────────

/**
 * A highly optimized, atomic, and transactional IndexedDB wrapper.
 * Provides advanced history tracking (undo/redo), event observation,
 * and high-performance querying capabilities.
 */
export class EntityStore<T extends { id: string | number }> {
    protected db: IDBDatabase | null = null;
    protected currentTxn: IDBTransaction | null = null;

    protected pendingEvents: Array<{ event: StoreEvent; data: unknown }> = [];
    protected listeners = new Map<StoreEvent, Set<(data: unknown) => void>>();

    protected undoStack: HistoryEntry<T>[] = [];
    protected redoStack: HistoryEntry<T>[] = [];
    protected currentHistoryEntry: HistoryEntry<T> | null = null;

    /** History limit to prevent memory bloat. */
    protected maxHistory = 50;

    /** Guard to prevent undo/redo operations from recording their own history. */
    protected isUndoRedoInProgress = false;

    /** Hook for subclasses to execute logic after a transaction successfully commits. */
    public onTransactionComplete?: () => void;

    constructor(
        protected dbName: string,
        protected storeName: string,
        protected dbVersion: number = 1
    ) {}

    // ── Database Initialization ──────────────────────────────────────────

    /**
     * Initializes the DB connection and applies schema upgrades if necessary.
     * @param indexes Configuration for native IndexedDB indices to optimize lookups.
     */
    public async init(indexes: IndexConfig[] = []): Promise<void> {
        if (this.db) return;

        this.db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                let store: IDBObjectStore;

                if (!db.objectStoreNames.contains(this.storeName)) {
                    store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                } else {
                    store = (request.transaction as IDBTransaction).objectStore(this.storeName);
                }

                // Synchronize indexes
                for (const idx of indexes) {
                    if (!store.indexNames.contains(idx.name)) {
                        store.createIndex(idx.name, idx.keyPath, idx.options);
                    }
                }
            };

            request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
            request.onerror = (event) => reject(new Error(`IndexedDB Init Error: ${(event.target as IDBOpenDBRequest).error?.message}`));
        });

        this.emit('loaded', null);
    }

    /**
     * Core execution engine. Reuses active transactions if present to maintain atomicity.
     * OPTIMIZATION: Resolves readonly queries immediately on success rather than waiting for txn completion.
     * @param mode
     * @param fn
     */
    protected async execute<R>(
        mode: IDBTransactionMode,
        fn: (store: IDBObjectStore) => IDBRequest<R>
    ): Promise<R> {
        if (!this.db) throw new Error(`[EntityStore:${this.storeName}] Database not initialized. Call init() first.`);

        // 1. Utilize existing transaction if available
        if (this.currentTxn) {
            const store = this.currentTxn.objectStore(this.storeName);
            return new Promise<R>((resolve, reject) => {
                const req = fn(store);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }

        // 2. Create isolated transaction
        return new Promise<R>((resolve, reject) => {
            const txn = this.db!.transaction(this.storeName, mode);
            const store = txn.objectStore(this.storeName);
            const req = fn(store);

            let result: R;

            req.onsuccess = () => {
                result = req.result;
                // Opt: Reads are safe to resolve immediately without waiting for transaction closure.
                if (mode === 'readonly') resolve(result);
            };
            req.onerror = () => reject(req.error);

            txn.oncomplete = () => {
                // Ensure writes fully commit before resolving
                if (mode === 'readwrite') resolve(result);
            };
            txn.onerror = () => reject(txn.error);
            txn.onabort = () => reject(txn.error);
        });
    }

    // ── CRUD Operations ──────────────────────────────────────────────────

    public async get(id: string | number): Promise<T | undefined> {
        return this.execute<T | undefined>('readonly', store => store.get(id));
    }

    /**
     * Uses store.count() which avoids deserializing the object, making it exceptionally fast.
     * @param id
     */
    public async has(id: string | number): Promise<boolean> {
        const count = await this.execute<number>('readonly', store => store.count(id));
        return count > 0;
    }

    public async getAll(): Promise<T[]> {
        return this.execute<T[]>('readonly', store => store.getAll());
    }

    public async add(item: T): Promise<void> {
        if (item.id == null) throw new Error("Entity must contain a valid 'id' property.");

        await this.execute('readwrite', store => store.add(item));
        this.recordHistory({ type: 'add', item });
        this.emit('added', item);
    }

    public async remove(id: string | number): Promise<boolean> {
        const item = await this.get(id);
        if (!item) return false;

        await this.execute('readwrite', store => store.delete(id));
        this.recordHistory({ type: 'remove', item });
        this.emit('removed', item);
        return true;
    }

    public async update(id: string | number, patch: Partial<T>): Promise<boolean> {
        const oldItem = await this.get(id);
        if (!oldItem) return false;

        const newItem = { ...oldItem, ...patch, id }; // ensure ID is never overwritten maliciously
        await this.execute('readwrite', store => store.put(newItem));

        this.recordHistory({ type: 'update', item: newItem, oldItem });
        this.emit('changed', newItem);
        return true;
    }

    public async clear(): Promise<void> {
        await this.execute('readwrite', store => store.clear());

        // Complete data annihilation breaks undo continuity
        this.undoStack = [];
        this.redoStack = [];
        this.emit('cleared', null);
    }

    // ── High Performance Bulk Operations ─────────────────────────────────

    /**
     * Bypasses individual promises to flood the transaction synchronously.
     * Exponentially faster than looping 'await this.add(item)'.
     * @param items
     */
    public async bulkAdd(items: T[]): Promise<void> {
        if (!items.length) return;

        await this.transaction(() => {
            const store = this.currentTxn!.objectStore(this.storeName);
            for (const item of items) {
                store.add(item);
                this.recordHistory({ type: 'add', item });
                this.emit('added', item);
            }
        });
    }

    /**
     * Replaces the entire store contents. Optimized for importing state.
     * @param items
     */
    public async replaceAll(items: T[]): Promise<void> {
        await this.transaction(() => {
            const store = this.currentTxn!.objectStore(this.storeName);
            store.clear();
            for (const item of items) {
                store.add(item);
            }
        });

        // Wiping out the store invalidates history context
        this.undoStack = [];
        this.redoStack = [];
        this.emit('loaded', items);
    }

    // ── Indexing & Highly Optimized Querying ─────────────────────────────

    public async size(): Promise<number> {
        return this.execute<number>('readonly', store => store.count());
    }

    /**
     * O(log n) lookup utilizing native IndexedDB B-Tree indices.
     * @param indexName
     * @param value
     */
    public async by(indexName: string, value: string | number): Promise<T[]> {
        return this.execute<T[]>('readonly', store => store.index(indexName).getAll(value));
    }

    /**
     * Flexible querying engine with built-in fast paths.
     * @param opts
     */
    public async query(opts: QueryOptions<T> = {}): Promise<T[]> {
        if (!this.db) throw new Error("Database not initialized");

        // FAST-PATH: If there are no JS-level filters or sorting, rely purely on native IDB implementation
        if (!opts.where && !opts.sort) {
            return this.execute<T[]>('readonly', store => store.getAll(undefined, opts.limit));
        }

        // SLOW-PATH: Need iteration to evaluate custom 'where' functions and full sorting
        return new Promise((resolve, reject) => {
            const txn = this.currentTxn ?? this.db!.transaction(this.storeName, 'readonly');
            const store = txn.objectStore(this.storeName);
            const request = store.openCursor();

            const results: T[] = [];
            const limit = opts.limit ?? Infinity;
            const requiresSort = typeof opts.sort === 'function';

            request.onsuccess = () => {
                const cursor = request.result;

                if (!cursor) return completeRequest(); // End of DB

                const item = cursor.value as T;
                if (!opts.where || opts.where(item)) {
                    results.push(item);
                }

                // Break early OPTIMIZATION: Only safe if NO custom sorting is applied
                if (!requiresSort && results.length >= limit) {
                    return completeRequest();
                }

                cursor.continue();
            };

            request.onerror = () => reject(request.error);

            /**
             *
             */
            function completeRequest() {
                if (requiresSort && opts.sort) {
                    results.sort(opts.sort);
                }
                // Finally slice down to limit (in case sort forced us to grab the entire matching dataset)
                resolve(results.slice(0, limit));
            }
        });
    }

    // ── Transaction Management ───────────────────────────────────────────

    /**
     * Enforces atomicity. Batches multiple interactions into one native transaction.
     * Automatically rolls back memory state and aborts IDB on failure.
     * @param fn
     */
    public async transaction(fn: () => Promise<void> | void): Promise<void> {
        if (!this.db) throw new Error("Database not initialized");

        // Support nested transaction boundaries transparently
        if (this.currentTxn) {
            await fn();
            return;
        }

        return new Promise<void>(async (resolve, reject) => {
            const txn = this.db!.transaction(this.storeName, 'readwrite');
            this.currentTxn = txn;
            this.currentHistoryEntry = { actions: [] };

            txn.oncomplete = () => {
                if (this.currentHistoryEntry && this.currentHistoryEntry.actions.length > 0) {
                    this.undoStack.push(this.currentHistoryEntry);
                    if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
                    this.redoStack = []; // Break future redo continuity
                }

                this.flushPendingEvents();
                this.cleanupTransactionContext();
                this.onTransactionComplete?.();
                resolve();
            };

            txn.onerror = () => rejectTransaction(txn.error);
            txn.onabort = () => rejectTransaction(new Error("Transaction aborted"));

            const rejectTransaction = (error: unknown) => {
                console.error(`[EntityStore:${this.storeName}] Transaction Failed:`, error);
                this.pendingEvents = []; // Dump events; state rolled back
                this.cleanupTransactionContext();
                reject(error);
            };

            try {
                await fn();
            } catch (error) {
                txn.abort(); // Native rollback
                rejectTransaction(error);
            }
        });
    }

    private cleanupTransactionContext(): void {
        this.currentTxn = null;
        this.currentHistoryEntry = null;
    }

    // ── History Tracking (Undo / Redo) ───────────────────────────────────

    protected recordHistory(action: HistoryAction<T>): void {
        if (this.isUndoRedoInProgress) return;

        if (this.currentHistoryEntry) {
            this.currentHistoryEntry.actions.push(action);
        } else {
            this.undoStack.push({ actions: [action] });
            if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
            this.redoStack = [];
        }
    }

    public async undo(): Promise<boolean> {
        if (!this.canUndo) return false;

        const entry = this.undoStack.pop()!;
        this.isUndoRedoInProgress = true;

        try {
            // Apply undo atomically within a transaction
            await this.transaction(async () => {
                // Must reverse actions in inverted order they were applied
                for (let i = entry.actions.length - 1; i >= 0; i--) {
                    await this.reverseAction(entry.actions[i]!);
                }
            });
            this.redoStack.push(entry);
            return true;
        } finally {
            this.isUndoRedoInProgress = false;
        }
    }

    public async redo(): Promise<boolean> {
        if (!this.canRedo) return false;

        const entry = this.redoStack.pop()!;
        this.isUndoRedoInProgress = true;

        try {
            await this.transaction(async () => {
                for (const action of entry.actions) {
                    await this.applyAction(action);
                }
            });
            this.undoStack.push(entry);
            return true;
        } finally {
            this.isUndoRedoInProgress = false;
        }
    }

    private async applyAction(action: HistoryAction<T>): Promise<void> {
        switch (action.type) {
            case 'add':
                await this.add(action.item);
                break;
            case 'remove':
                await this.remove(action.item.id);
                break;
            case 'update':
                // Redo needs the NEW state, which is stored in action.item
                await this.update(action.item.id, action.item);
                break;
        }
    }

    private async reverseAction(action: HistoryAction<T>): Promise<void> {
        switch (action.type) {
            case 'add':
                await this.remove(action.item.id);
                break;
            case 'remove':
                await this.add(action.item);
                break;
            case 'update':
                // Undo requires reverting to the PREVIOUS state
                if (action.oldItem) {
                    await this.update(action.item.id, action.oldItem);
                }
                break;
        }
    }

    public get canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    public get canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    // ── Event Emitter ────────────────────────────────────────────────────

    public on(event: StoreEvent, callback: (data: unknown) => void): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(callback);
    }

    public off(event: StoreEvent, callback: (data: unknown) => void): void {
        this.listeners.get(event)?.delete(callback);
    }

    protected emit(event: StoreEvent, data: unknown): void {
        // If in transaction, defer events until commit is fully verified
        if (this.currentTxn) {
            this.pendingEvents.push({ event, data });
            return;
        }
        this.dispatchEvent(event, data);
    }

    protected dispatchEvent(event: StoreEvent, data: unknown): void {
        const cbs = this.listeners.get(event);
        if (!cbs) return;

        for (const cb of cbs) {
            try {
                cb(data);
            } catch (error) {
                console.error(`[EntityStore:${this.storeName}] Event "${event}" handler crashed:`, error);
            }
        }
    }

    private flushPendingEvents(): void {
        if (!this.pendingEvents.length) return;

        const events = this.pendingEvents.splice(0, this.pendingEvents.length);
        for (const { event, data } of events) {
            this.dispatchEvent(event, data);
        }
    }
}
