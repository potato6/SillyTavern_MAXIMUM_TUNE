/**
 * Elysia context augmentation for SillyTavern.
 *
 * The main server (server-elysia.ts) adds `user`, `file`, and `session` to
 * every request context via `app.derive({ as: 'global' }, ...)`.  These
 * properties exist at runtime but TypeScript's `Context` type doesn't know
 * about them because Elysia's default `Singleton` generic is `{ derive: {} }`.
 *
 * Instead of fighting the generic defaults, we add the properties to the
 * global `Object` interface so they're available on all object types — but
 * effectively only used when accessing `context.user`/`context.file`/
 * `context.session` in Elysia handler callbacks.
 */

export {};

/* eslint-disable @typescript-eslint/no-unused-vars */
declare global {
    interface Object {
        /**
         * Authenticated user data set by the global derive in server-elysia.ts.
         * Null when no user is logged in.
         */
        user?: Record<string, unknown> | null;

        /**
         * Uploaded file data (Express bridge mode — multer writes the file to
         * disk and attaches destination/filename).
         */
        file?: { destination?: string; filename?: string } | null;

        /**
         * Session cookie data (decoded from signed cookie by the session plugin).
         */
        session?: Record<string, unknown>;
    }
}

