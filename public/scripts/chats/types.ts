/**
 * Shared types for the chat domain.
 *
 * These types align with the global types declared in global.d.ts
 * but are reified here so the store and service layers have
 * first-class, importable definitions.
 */

// ── Re-export global types for convenience ─────────────────────
// The global declarations (ChatMessage, ChatMetadata, etc.) live
// in global.d.ts as ambient types.  We re-export them here so
// store modules can import them explicitly.

/**
 * File attachment attached to a message.
 * Mirrors the JSDoc typedef in chats.ts.
 */
export interface FileAttachment {
    url: string;
    size: number;
    name: string;
    created: number;
    text?: string;
}

/**
 * Media (image/video/audio) attached to a message.
 */
export interface MediaAttachment {
    url: string;
    title?: string;
    type: string;
    source?: string;
    generation_type?: number;
    negative?: string;
    width?: number;
    height?: number;
    append_title?: boolean;
    captioned?: boolean;
}

/**
 * Source categories for data bank attachments.
 */
export const ATTACHMENT_SOURCE = {
    GLOBAL: 'global',
    CHARACTER: 'character',
    CHAT: 'chat',
} as const;

export type AttachmentSource = (typeof ATTACHMENT_SOURCE)[keyof typeof ATTACHMENT_SOURCE];

/**
 * A chat entity stored in IndexedDB via ChatStore.
 *
 * This wraps the historical "chat file" concept (messages + metadata)
 * into a single entity with an id so EntityStore can manage it.
 */
export interface ChatEntity {
    id: string;
    characterId: string;
    title: string;
    messages: ChatMessage[];
    metadata: ChatMetadata;
    created: number;
    modified: number;
}

/**
 * Snapshot used for import/export and undo history.
 */
export interface ChatSnapshot {
    id: string;
    characterId: string;
    title: string;
    messages: ChatMessage[];
    metadata: ChatMetadata;
    created: number;
    modified: number;
}

/**
 * Options passed when creating a new chat.
 */
export interface CreateChatOptions {
    characterId: string;
    title?: string;
    messages?: ChatMessage[];
    metadata?: ChatMetadata;
}

/**
 * Options passed when duplicating a chat.
 */
export interface DuplicateChatOptions {
    includeMessages?: boolean;
    newTitle?: string;
}
