/**
 * Chat domain — coordinator module.
 *
 * ── Purpose ─────────────────────────────────────────────────────
 * This file is the public entry point for the chat domain.
 * It re-exports from the sub-modules so that consumers
 * (primarily `script.ts` and extensions) keep working without
 * changing their imports.
 *
 * Over time, consumers should import directly from the
 * sub-modules (e.g. `./chats/ChatService.js`) instead of
 * going through this barrel.
 *
 * ── Architecture ────────────────────────────────────────────────
 * chats.ts            ← coordinator (this file)
 * chats/types.ts      ← data model types
 * chats/ChatStore.ts  ← IndexedDB-backed entity store
 * chats/ChatService.ts← high-level chat operations
 * chats/chat-ui.ts    ← DOM event wiring, initChatUtilities
 * chats/hide-message.ts ← hide/unhide message operations
 * chats/styles.ts     ← style preferences, DOMPurify hooks, dialogs
 * chats/converter.ts  ← file type converters
 * chats/attachment-store.ts ← file attachment CRUD
 * chats/media.ts      ← media attachment operations
 * chats/attachment-manager.ts ← Data Bank UI dialog
 * chats/ChatSession.ts     ← current-chat state wrapper
 *
 * messages/MessageService.ts← message CRUD (add, delete, edit, move)
 * messages/SwipeService.ts  ← swipe navigation & mutation
 * messages/BranchService.ts ← conversation forking
 *
 * ── Upcoming (future PRs) ───────────────────────────────────────
 * messages/editing.ts      — inline message editing
 * messages/formatting.ts    — message formatting & rendering
 * ui/ChatRenderer.ts        — chat panel rendering
 * ui/ChatList.ts            — chat list sidebar
 * ui/MessageRenderer.ts     — individual message rendering
 * search/ChatSearch.ts      — full-text chat search
 * metadata/metadata.ts      — chat metadata management
 * metadata/statistics.ts    — chat statistics
 * import/importer.ts        — chat import
 * import/exporter.ts        — chat export
 */

import { characters, this_chid } from '../script.js';
import { selected_group } from './group-chats.js';
import { power_user } from './power-user.js';

// ── Entity ID helpers (inlined to avoid circular chunk issues) ─

/**
 * Returns the current entity id (character avatar or group id) or null.
 */
export function getCurrentEntityId(): string | null {
    if (selected_group) {
        return String(selected_group);
    }
    return characters[this_chid]?.avatar ?? null;
}

/**
 * Checks if external media is allowed for the current entity.
 */
export function isExternalMediaAllowed(): boolean {
    const entityId = getCurrentEntityId();
    if (!entityId) {
        return !power_user.forbid_external_media;
    }
    if (power_user.external_media_allowed_overrides.includes(entityId)) {
        return true;
    }
    if (power_user.external_media_forbidden_overrides.includes(entityId)) {
        return false;
    }
    return !power_user.forbid_external_media;
}

// ── Re-export types ──────────────────────────────────────────
export type {
    FileAttachment,
    MediaAttachment,
    AttachmentSource,
    ChatEntity,
    CreateChatOptions,
    DuplicateChatOptions,
    ChatSnapshot,
} from './chats/types.js';
export { ATTACHMENT_SOURCE } from './chats/types.js';

// ── Re-export store & service ────────────────────────────────
export { ChatStore, chatStore } from './chats/ChatStore.js';
export { ChatService, chatService } from './chats/ChatService.js';

// ── Re-export style functions ───────────────────────────────
export {
    encodeStyleTags,
    decodeStyleTags,
    formatCreatorNotes,
    addDOMPurifyHooks,
    StylesPreference,
    openGlobalStylesPreferenceDialog,
    checkForCreatorNotesStyles,
    setGlobalStylesButtonClass,
    getStyleContentsFromMarkdown,
    openExternalMediaOverridesDialog,
} from './chats/styles.js';

// ── Re-export attachment functions ───────────────────────────
export {
    populateFileAttachment,
    uploadFileAttachment,
    getFileAttachment,
    validateFile,
    hasPendingFileAttachment,
    onFileAttach,
    deleteMessageFile,
    viewMessageFile,
    embedMessageFile,
    appendFileContent,
    deleteMediaFromServer,
    deleteFileFromServer,
    uploadFileAttachmentToServer,
    openFilePopup,
    editAttachment,
    downloadAttachment,
    enableAttachment,
    disableAttachment,
    isAttachmentDisabled,
    moveAttachment,
    deleteAttachment,
    ensureAttachmentsExist,
    getDataBankAttachments,
    getDataBankAttachmentsForSource,
    verifyAttachments,
    verifyAttachmentsForSource,
    getAvailableTargets,
    runScraper,
} from './chats/attachment-store.js';

// ── Re-export media functions ────────────────────────────────
export {
    expandMessageMedia,
    deleteMessageMedia,
    switchMessageMediaDisplay,
    onImageSwiped,
} from './chats/media.js';

// ── Re-export converter functions ────────────────────────────
export {
    findConverterKey,
    isConvertible,
    getConverter,
    registerFileConverter,
} from './chats/converter.js';

// ── Re-export hide-message functions ─────────────────────────
export { hideChatMessageRange, hideChatMessage, unhideChatMessage } from './chats/hide-message.js';

// ── Re-export UI functions ───────────────────────────────────
export { initChatUtilities, preserveNeutralChat, restoreNeutralChat } from './chats/chat-ui.js';

// ── Re-export attachment manager ─────────────────────────────
export { openAttachmentManager } from './chats/attachment-manager.js';

// ── Re-export session & services ────────────────────────────
export { chatSession } from './chats/ChatSession.js';
export { messageService } from './messages/MessageService.js';
export { swipeService } from './messages/SwipeService.js';
export { branchService } from './messages/BranchService.js';
