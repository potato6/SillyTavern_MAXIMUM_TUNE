// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type StoreEvent = 'added' | 'removed' | 'changed' | 'cleared' | 'loaded';

export interface QueryOptions<T> {
    where?: (item: T) => boolean;
    sort?: (a: T, b: T) => number;
    limit?: number;
}

export interface IndexConfig {
    name: string;
    keyPath: string;
    options?: IDBIndexParameters;
}

interface HistoryAction<T> {
    type: 'add' | 'remove' | 'update';
    item: T;
    oldItem?: T;
}

interface HistoryEntry<T> {
    actions: HistoryAction<T>[];
}

// ──────────────────────────────────────────────
// EntityStore
// ──────────────────────────────────────────────

export class EntityStore<T extends { id: string | number }> {
    protected db: IDBDatabase | null = null;
    protected currentTxn: IDBTransaction | null = null;
    protected pendingEvents: Array<{ event: StoreEvent; data: unknown }> = [];
    protected currentHistoryEntry: HistoryEntry<T> | null = null;

    protected undoStack: HistoryEntry<T>[] = [];
    protected redoStack: HistoryEntry<T>[] = [];
    protected maxHistory = 50;

    // Guard to prevent undo/redo from recording their own history
    protected isUndoRedoInProgress = false;

    /** Hook for subclasses to run after a transaction completes (e.g. auto-save). */
    protected onTransactionComplete?: () => void;

    protected listeners = new Map<StoreEvent, Set<(data: unknown) => void>>();

    constructor(
        protected dbName: string,
        protected storeName: string,
        protected dbVersion: number = 1
    ) {}

    // ── IndexedDB Setup ───────────────────────

    /**
     * Initializes the DB and creates native indexes.
     * @param indexes Define native IDB indexes for efficient lookups.
     */
    async init(indexes: IndexConfig[] = []): Promise<void> {
        if (this.db) return;

        this.db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    for (const idx of indexes) {
                        store.createIndex(idx.name, idx.keyPath, idx.options);
                    }
                }
            };

            request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
            request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
        });

        this.emit('loaded', null);
    }

    /** Helper to execute requests either in the current transaction or a new isolated one */
    protected async execute<R>(
        mode: IDBTransactionMode,
        fn: (store: IDBObjectStore) => IDBRequest<R>
    ): Promise<R> {
        if (!this.db) throw new Error("DB not initialized. Call init() first.");

        if (this.currentTxn) {
            const store = this.currentTxn.objectStore(this.storeName);
            return new Promise<R>((resolve, reject) => {
                const req = fn(store);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }

        // Isolated transaction
        const txn = this.db.transaction(this.storeName, mode);
        const store = txn.objectStore(this.storeName);
        const req = fn(store);

        const result = await new Promise<R>((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        // Wait for isolated transaction to commit before resolving
        await new Promise<void>((resolve, reject) => {
            txn.oncomplete = () => resolve();
            txn.onerror = () => reject(txn.error);
            txn.onabort = () => reject(txn.error);
        });

        return result;
    }

    // ── CRUD ──────────────────────────────────

    async get(id: string | number): Promise<T | undefined> {
        return this.execute<T>('readonly', store => store.get(id));
    }

    async has(id: string | number): Promise<boolean> {
        const count = await this.execute<number>('readonly', store => store.count(id));
        return count > 0;
    }

    async getAll(): Promise<T[]> {
        return this.execute<T[]>('readonly', store => store.getAll());
    }

    async add(item: T): Promise<void> {
        await this.execute('readwrite', store => store.add(item));
        this.recordHistory({ type: 'add', item });
        this.emit('added', item);
    }

    async remove(id: string | number): Promise<boolean> {
        const item = await this.get(id);
        if (!item) return false;

        await this.execute('readwrite', store => store.delete(id));
        this.recordHistory({ type: 'remove', item });
        this.emit('removed', item);
        return true;
    }

    async update(id: string | number, patch: Partial<T>): Promise<boolean> {
        const oldItem = await this.get(id);
        if (!oldItem) return false;

        const newItem = { ...oldItem, ...patch };
        await this.execute('readwrite', store => store.put(newItem));

        this.recordHistory({ type: 'update', item: newItem, oldItem });
        this.emit('changed', newItem);
        return true;
    }

    async clear(): Promise<void> {
        await this.execute('readwrite', store => store.clear());

        // Clearing breaks undo/redo continuity
        this.undoStack = [];
        this.redoStack = [];
        this.emit('cleared', null);
    }

    // ── Bulk Operations ─────────────────────

    /**
     * Replace all items at once (e.g. after load from settings).
     * Wraps in a transaction and emits 'loaded'.
     */
    async replaceAll(items: T[]): Promise<void> {
        await this.transaction(async () => {
            await this.execute('readwrite', store => store.clear());
            for (const item of items) {
                await this.execute('readwrite', store => store.add(item));
            }
        });
        this.emit('loaded', items);
    }

    // ── Size ─────────────────────────────────

    async size(): Promise<number> {
        return this.execute<number>('readonly', store => store.count());
    }

    // ── Indexing & Querying ───────────────────

    /**
     * O(log n) lookup using a native IndexedDB index.
     * @example store.by("name", "foo")
     */
    async by(indexName: string, value: string | number): Promise<T[]> {
        return this.execute<T[]>('readonly', store => {
            const index = store.index(indexName);
            return index.getAll(value);
        });
    }

    /**
     * Flexible query. Uses IDB Cursors for memory efficiency.
     * If `sort` is omitted and `limit` is provided, it stops fetching early.
     */
    async query(opts: QueryOptions<T> = {}): Promise<T[]> {
        if (!this.db) throw new Error("DB not initialized");

        return new Promise((resolve, reject) => {
            const txn = (this.currentTxn ?? this.db!.transaction(this.storeName, 'readonly'));
            const store = txn.objectStore(this.storeName);
            const request = store.openCursor();

            const results: T[] = [];
            const limit = opts.limit ?? Infinity;

            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor || results.length >= limit) {
                    // Done fetching
                    if (opts.sort) results.sort(opts.sort);
                    if (opts.limit !== undefined) {
                        resolve(results.slice(0, opts.limit));
                    } else {
                        resolve(results);
                    }
                    return;
                }

                const item = cursor.value as T;
                if (!opts.where || opts.where(item)) {
                    results.push(item);
                }

                // If no sorting is requested, we can optimize by breaking early if limit is hit.
                // If sorting IS requested, we must fetch all matching items anyway.
                if (opts.limit !== undefined && !opts.sort && results.length >= limit) {
                    // Break early
                } else {
                    cursor.continue();
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    // ── Events ────────────────────────────────

    on(event: StoreEvent, callback: (data: unknown) => void): void {
        let set = this.listeners.get(event);
        if (!set) {
            set = new Set();
            this.listeners.set(event, set);
        }
        set.add(callback);
    }

    off(event: StoreEvent, callback: (data: unknown) => void): void {
        this.listeners.get(event)?.delete(callback);
    }

    protected emit(event: StoreEvent, data: unknown): void {
        if (this.currentTxn) {
            this.pendingEvents.push({ event, data });
            return;
        }
        this.dispatchEvent(event, data);
    }

    protected dispatchEvent(event: StoreEvent, data: unknown): void {
        this.listeners.get(event)?.forEach(cb => {
            try { cb(data); } catch (e) { console.error(`EntityStore event "${event}" handler error:`, e); }
        });
    }

    private flushPendingEvents(): void {
        const events = this.pendingEvents.splice(0);
        for (const { event, data } of events) {
            this.dispatchEvent(event, data);
        }
    }

    // ── Transactions ──────────────────────────

    /**
     * Batches operations into a single native IndexedDB transaction.
     * If any operation fails, the entire transaction aborts.
     */
    async transaction(fn: () => Promise<void> | void): Promise<void> {
        if (!this.db) throw new Error("DB not initialized");
        if (this.currentTxn) {
            // Nested transaction call; just run the function.
            // IDB handles isolation via the same transaction instance.
            return fn();
        }

        const txn = this.db.transaction(this.storeName, 'readwrite');
        this.currentTxn = txn;
        this.currentHistoryEntry = { actions: [] };

        try {
            await fn();

            await new Promise<void>((resolve, reject) => {
                txn.oncomplete = () => resolve();
                txn.onerror = () => reject(txn.error);
                txn.onabort = () => reject(txn.error);
            });

            // Transaction committed successfully
            if (this.currentHistoryEntry.actions.length > 0) {
                this.undoStack.push(this.currentHistoryEntry);
                if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
                this.redoStack = []; // New action invalidates redo history
            }
            this.flushPendingEvents();
            this.onTransactionComplete?.();

        } catch (error) {
            // Transaction aborted or failed
            console.error("Transaction failed, rolling back memory state:", error);
            this.pendingEvents = [];
        } finally {
            this.currentTxn = null;
            this.currentHistoryEntry = null;
        }
    }

    // ── History (Undo/Redo) ───────────────────

    protected recordHistory(action: HistoryAction<T>): void {
        // Don't record history during undo/redo — that would create infinite loops
        if (this.isUndoRedoInProgress) return;

        if (this.currentHistoryEntry) {
            this.currentHistoryEntry.actions.push(action);
        } else {
            this.undoStack.push({ actions: [action] });
            if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
            this.redoStack = [];
        }
    }

    async undo(): Promise<boolean> {
        if (this.undoStack.length === 0) return false;
        const entry = this.undoStack.pop()!;

        this.isUndoRedoInProgress = true;
        try {
        // Reverse operations in reverse order
        for (let i = entry.actions.length - 1; i >= 0; i--) {
            const action = entry.actions[i]!;
            await this.reverseAction(action);
        }
        } finally {
            this.isUndoRedoInProgress = false;
        }

        this.redoStack.push(entry);
        return true;
    }

    async redo(): Promise<boolean> {
        if (this.redoStack.length === 0) return false;
        const entry = this.redoStack.pop()!;

        this.isUndoRedoInProgress = true;
        try {
        for (const action of entry.actions) {
            await this.applyAction(action);
        }
        } finally {
            this.isUndoRedoInProgress = false;
        }

        this.undoStack.push(entry);
        return true;
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
                if (action.oldItem) await this.update(action.item.id, action.oldItem);
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
                if (action.oldItem) await this.update(action.item.id, action.oldItem);
                break;
        }
    }

    get canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    get canRedo(): boolean {
        return this.redoStack.length > 0;
    }
}
