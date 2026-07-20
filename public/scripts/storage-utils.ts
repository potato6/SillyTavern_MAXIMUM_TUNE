/**
 * ============================================================================
 * QUICK USAGE SUMMARY
 * ============================================================================
 *
 * // 1. Define your entity (must have an `id` property)
 * interface User {
 *   id: string;
 *   email: string;
 *   role: 'admin' | 'user';
 *   age: number;
 * }
 *
 * // 2. Instantiate the store
 * const userStore = new EntityStore<User>('MyAppDB', 'users_store');
 *
 * // 3. Initialize the database and define native B-Tree indices (Crucial for performance)
 * await userStore.init([
 *   { name: 'by_role', keyPath: 'role' },
 *   { name: 'by_email', keyPath: 'email', options: { unique: true } }
 * ]);
 *
 * // --- Basic CRUD ---
 * await userStore.add({ id: 'u1', email: 'alice@x.com', role: 'admin', age: 28 });
 * const user = await userStore.get('u1');
 * await userStore.update('u1', { age: 29 });
 *
 * // --- Native Index Lookups (🔥 FAST PATH - O(log n)) ---
 * // Use `.by()` to leverage the native IDB indices configured during `init()`
 * const admins = await userStore.by('by_role', 'admin');
 *
 * // --- Custom JS Queries (🐢 SLOW PATH - Iterates cursor) ---
 * // Fallback when you need complex logic that a native index cannot handle
 * const youngAdmins = await userStore.query({
 *   where: (u) => u.role === 'admin' && u.age < 30,
 *   sort: (a, b) => a.age - b.age,
 *   limit: 10
 * });
 *
 * // --- High-Performance Bulk Operations ---
 * // Automatically wraps all operations in a single atomic transaction
 * await userStore.bulkAdd(largeArrayOfUsers);
 *
 * // --- History Tracking (Undo / Redo) ---
 * // Tracks adds, updates, and removes automatically
 * if (userStore.canUndo) await userStore.undo();
 * if (userStore.canRedo) await userStore.redo();
 *
 * // --- Events ---
 * userStore.on('added', (user) => console.log('New user:', user));
 * ============================================================================
 */

// ──────────────────────────────────────────────
// Types & Interfaces
// ──────────────────────────────────────────────

export type StoreEvent = 'added' | 'removed' | 'changed' | 'cleared' | 'loaded';

export interface QueryOptions<T> {
    where?: ((item: T) => boolean) | null;
    sort?: ((a: T, b: T) => number) | null;
    limit?: number | null;
}

export interface IndexConfig {
    name: string;
    keyPath: string | string[];
    options?: IDBIndexParameters;
}

export interface HistoryAction<T> {
    type: 'add' | 'remove' | 'update';
    item: T;
    // strictly define oldItem so the Object Shape (Hidden Class)
    // never splits between { type, item } and { type, item, oldItem }.
    oldItem: T | null;
}

export interface HistoryEntry<T> {
    actions: HistoryAction<T>[];
}

// ──────────────────────────────────────────────
// EntityStore Class
// ──────────────────────────────────────────────

export class EntityStore<T extends { id: string | number }> {
    // All properties declared and initialized explicitly in the constructor
    // to guarantee exactly ONE Hidden Class (Map) for all instances of EntityStore.
    protected db: IDBDatabase | null;
    protected currentTxn: IDBTransaction | null;

    protected pendingEvents: Array<{ event: StoreEvent; data: unknown }>;

    // Replaced dynamic `Map` with a fixed-shape object.
    // V8 creates highly optimized monomorphic Inline Caches (ICs) for fixed keys.
    protected listeners: Record<StoreEvent, Set<(data: unknown) => void>>;

    protected undoStack: HistoryEntry<T>[];
    protected redoStack: HistoryEntry<T>[];
    protected currentHistoryEntry: HistoryEntry<T>;

    protected maxHistory: number;
    protected isUndoRedoInProgress: boolean;
    public onTransactionComplete: (() => void) | null;

    constructor(
        protected dbName: string,
        protected storeName: string,
        protected dbVersion: number = 1
    ) {
        // Pre-initialize everything in fixed order
        this.db = null;
        this.currentTxn = null;

        // Arrays start as PACKED_ELEMENTS and should stay hole-free
        this.pendingEvents = [];
        this.undoStack = [];
        this.redoStack = [];

        // Pre-allocate first history entry so it never transitions to `null`
        this.currentHistoryEntry = { actions: [] };

        this.maxHistory = 50;
        this.isUndoRedoInProgress = false;
        this.onTransactionComplete = null;

        this.listeners = {
            added: new Set(),
            removed: new Set(),
            changed: new Set(),
            cleared: new Set(),
            loaded: new Set(),
        };
    }

    // ── Database Initialization ──────────────────────────────────────────

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

                for (let i = 0; i < indexes.length; i++) {
                    const idx = indexes[i]!;
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

    protected async execute<R>(
        mode: IDBTransactionMode,
        fn: (store: IDBObjectStore) => IDBRequest<R>
    ): Promise<R> {
        if (!this.db) throw new Error("Database not initialized");

        if (this.currentTxn) {
            const store = this.currentTxn.objectStore(this.storeName);
            return new Promise<R>((resolve, reject) => {
                const req = fn(store);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }

        return new Promise<R>((resolve, reject) => {
            const txn = this.db!.transaction(this.storeName, mode);
            const store = txn.objectStore(this.storeName);
            const req = fn(store);

            let result: R;

            req.onsuccess = () => {
                result = req.result;
                if (mode === 'readonly') resolve(result); // Fast path for reads
            };
            req.onerror = () => reject(req.error);

            txn.oncomplete = () => {
                if (mode === 'readwrite') resolve(result); // Commit wait for writes
            };
            txn.onerror = () => reject(txn.error);
            txn.onabort = () => reject(txn.error);
        });
    }

    // ── CRUD Operations ──────────────────────────────────────────────────

    public async get(id: string | number): Promise<T | undefined> {
        return this.execute<T | undefined>('readonly', store => store.get(id));
    }

    public async has(id: string | number): Promise<boolean> {
        const count = await this.execute<number>('readonly', store => store.count(id));
        return count > 0;
    }

    public async getAll(): Promise<T[]> {
        return this.execute<T[]>('readonly', store => store.getAll());
    }

    public async add(item: T): Promise<void> {
        if (item.id == null) throw new Error("Entity requires 'id'");

        await this.execute('readwrite', store => store.add(item));
        this.recordHistory({ type: 'add', item, oldItem: null });
        this.emit('added', item);
    }

    public async remove(id: string | number): Promise<boolean> {
        const item = await this.get(id);
        if (!item) return false;

        await this.execute('readwrite', store => store.delete(id));
        this.recordHistory({ type: 'remove', item, oldItem: null });
        this.emit('removed', item);
        return true;
    }

    public async update(id: string | number, patch: Partial<T>): Promise<boolean> {
        const oldItem = await this.get(id);
        if (!oldItem) return false;

        const newItem = { ...oldItem, ...patch, id };
        await this.execute('readwrite', store => store.put(newItem));

        this.recordHistory({ type: 'update', item: newItem, oldItem });
        this.emit('changed', newItem);
        return true;
    }

    public async clear(): Promise<void> {
        await this.execute('readwrite', store => store.clear());

        // Re-assign empty arrays instead of mutating to preserve PACKED status
        this.undoStack = [];
        this.redoStack = [];
        this.emit('cleared', null);
    }

    // ── High Performance Bulk Operations ─────────────────────────────────

    public async bulkAdd(items: T[]): Promise<void> {
        const len = items.length;
        if (len === 0) return;

        await this.transaction(() => {
            const store = this.currentTxn!.objectStore(this.storeName);
            // OPTIMIZATION: `for` loops avoid allocating an iterator (HeapObject), keeping the index purely Smi.
            for (let i = 0; i < len; i++) {
                const item = items[i]!;
                store.add(item);
                this.recordHistory({ type: 'add', item, oldItem: null });
                this.emit('added', item);
            }
        });
    }

    public async replaceAll(items: T[]): Promise<void> {
        const len = items.length;
        await this.transaction(() => {
            const store = this.currentTxn!.objectStore(this.storeName);
            store.clear();
            for (let i = 0; i < len; i++) {
                store.add(items[i]);
            }
        });

        this.undoStack = [];
        this.redoStack = [];
        this.emit('loaded', items);
    }

    // ── Indexing & Highly Optimized Querying ─────────────────────────────

    public async size(): Promise<number> {
        return this.execute<number>('readonly', store => store.count());
    }

    public async by(indexName: string, value: string | number): Promise<T[]> {
        return this.execute<T[]>('readonly', store => store.index(indexName).getAll(value));
    }

    public async query(opts: QueryOptions<T> = {}): Promise<T[]> {
        if (!this.db) throw new Error("Database not initialized");

        // Resolve variables upfront. Passing missing properties into V8 loops
        // triggers deoptimization (undefined vs value).
        const limit = opts.limit ?? Infinity;
        const where = opts.where ?? null;
        const sort = opts.sort ?? null;

        // FAST-PATH: Native implementation
        if (where === null && sort === null) {
            return this.execute<T[]>('readonly', store =>
                store.getAll(undefined, limit === Infinity ? undefined : limit)
            );
        }

        // SLOW-PATH: Extracted logic to keep closure flat
        return new Promise((resolve, reject) => {
            const txn = this.currentTxn ?? this.db!.transaction(this.storeName, 'readonly');
            const request = txn.objectStore(this.storeName).openCursor();
            const results: T[] = [];
            const requiresSort = sort !== null;

            request.onsuccess = () => {
                const cursor = request.result;

                if (!cursor) {
                    if (requiresSort) results.sort(sort);
                    return resolve(limit !== Infinity ? results.slice(0, limit) : results);
                }

                const item = cursor.value as T;
                if (where === null || where(item)) {
                    results.push(item);
                }

                if (!requiresSort && results.length >= limit) {
                    return resolve(results);
                }

                cursor.continue();
            };

            request.onerror = () => reject(request.error);
        });
    }

    // ── Transaction Management ───────────────────────────────────────────

    public async transaction(fn: () => Promise<void> | void): Promise<void> {
        if (!this.db) throw new Error("Database not initialized");

        if (this.currentTxn) {
            await fn();
            return;
        }

        return new Promise<void>(async (resolve, reject) => {
            const txn = this.db!.transaction(this.storeName, 'readwrite');
            this.currentTxn = txn;

            // Reuse object shape
            this.currentHistoryEntry.actions = [];

            txn.oncomplete = () => {
                if (this.currentHistoryEntry.actions.length > 0) {
                    this.undoStack.push(this.currentHistoryEntry);
                    if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
                    this.redoStack = [];
                }

                // Allocate a fresh object for the next transaction to not mutate the historic one
                this.currentHistoryEntry = { actions: [] };

                this.flushPendingEvents();
                this.cleanupTransactionContext();

                if (this.onTransactionComplete) {
                    this.onTransactionComplete();
                }

                resolve();
            };

            txn.onerror = () => rejectTransaction(txn.error);
            txn.onabort = () => rejectTransaction(new Error("Transaction aborted"));

            const rejectTransaction = (error: unknown) => {
                console.error(`[EntityStore:${this.storeName}] Transaction Failed:`, error);
                this.pendingEvents = [];
                this.cleanupTransactionContext();
                reject(error);
            };

            try {
                await fn();
            } catch (error) {
                txn.abort();
                rejectTransaction(error);
            }
        });
    }

    private cleanupTransactionContext(): void {
        this.currentTxn = null;
        // Do NOT nullify this.currentHistoryEntry to keep property types strictly monomorphic
        this.currentHistoryEntry.actions = [];
    }

    // ── History Tracking (Undo / Redo) ───────────────────────────────────

    protected recordHistory(action: HistoryAction<T>): void {
        if (this.isUndoRedoInProgress) return;

        if (this.currentTxn) {
            this.currentHistoryEntry.actions.push(action);
        } else {
            this.undoStack.push({ actions: [action] });
            if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
            this.redoStack = [];
        }
    }

    public async undo(): Promise<boolean> {
        if (this.undoStack.length === 0) return false;

        const entry = this.undoStack.pop()!;
        this.isUndoRedoInProgress = true;

        try {
            await this.transaction(async () => {
                const actions = entry.actions;
                for (let i = actions.length - 1; i >= 0; i--) {
                    await this.reverseAction(actions[i]!);
                }
            });
            this.redoStack.push(entry);
            return true;
        } finally {
            this.isUndoRedoInProgress = false;
        }
    }

    public async redo(): Promise<boolean> {
        if (this.redoStack.length === 0) return false;

        const entry = this.redoStack.pop()!;
        this.isUndoRedoInProgress = true;

        try {
            await this.transaction(async () => {
                const actions = entry.actions;
                for (let i = 0; i < actions.length; i++) {
                    await this.applyAction(actions[i]!);
                }
            });
            this.undoStack.push(entry);
            return true;
        } finally {
            this.isUndoRedoInProgress = false;
        }
    }

    private async applyAction(action: HistoryAction<T>): Promise<void> {
        // V8 Sparkplug/TurboFan highly optimize simple switch statements into jump tables.
        switch (action.type) {
            case 'add':
                await this.add(action.item);
                break;
            case 'remove':
                await this.remove(action.item.id);
                break;
            case 'update':
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
                if (action.oldItem !== null) {
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
        this.listeners[event].add(callback);
    }

    public off(event: StoreEvent, callback: (data: unknown) => void): void {
        this.listeners[event].delete(callback);
    }

    protected emit(event: StoreEvent, data: unknown): void {
        if (this.currentTxn) {
            this.pendingEvents.push({ event, data });
            return;
        }
        this.dispatchEvent(event, data);
    }

    protected dispatchEvent(event: StoreEvent, data: unknown): void {
        const cbs = this.listeners[event];
        if (cbs.size === 0) return;

        // Sets iterators are fast and un-indexable
        for (const cb of cbs) {
            try {
                cb(data);
            } catch (error) {
                console.error(`[EntityStore:${this.storeName}] Event "${event}" handler crashed:`, error);
            }
        }
    }

    private flushPendingEvents(): void {
        const events = this.pendingEvents;
        const len = events.length;
        if (len === 0) return;

        // Replacing with an empty array drops the old memory instantly for GC
        // and avoids the performance hit / array-kind shifting penalty of .splice() or .length=0
        this.pendingEvents = [];

        for (let i = 0; i < len; i++) {
            const { event, data } = events[i]!;
            this.dispatchEvent(event, data);
        }
    }
}
