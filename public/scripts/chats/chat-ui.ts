/**
 * Chat UI initialization and event wiring.
 *
 * This module handles all DOM event delegation for the chat panel:
 * clicking hide/unhide buttons, file/media actions, editor maximize,
 * paste handling, and drag-and-drop.
 */

import {
    chat,
    chatElement,
    chat_metadata,
    reloadCurrentChat,
    printMessages,
    clearChat,
    system_message_types,
    getSystemMessageByType,
    updateChatMetadata,
    saveSettingsDebounced,
    eventSource,
    event_types,
    this_chid,
    neutralCharacterName,
    name2,
} from '../../script.js';
import { selected_group } from '../group-chats.js';
import { power_user } from '../power-user.js';
import { download, getFileText } from '../utils.js';

import { humanizedDateTime } from '../RossAscends-mods.js';
import { DragAndDropHandler } from '../dragdrop.js';
import { MEDIA_DISPLAY, SWIPE_DIRECTION } from '../constants.js';

import { hideChatMessageRange } from './hide-message.js';
import { checkForCreatorNotesStyles, openExternalMediaOverridesDialog, openGlobalStylesPreferenceDialog } from './styles.js';
import { openAttachmentManager } from './attachment-manager.js';
import { deleteMessageFile, viewMessageFile, embedMessageFile, onFileAttach } from './attachment-store.js';
import { expandMessageMedia, deleteMessageMedia, switchMessageMediaDisplay, onImageSwiped } from './media.js';
import { getCurrentEntityId } from '../chats.js';
import { mergeFilesIntoDataTransfer } from './shared.js';

// ── Neutral Chat ──────────────────────────────────────────────

const NEUTRAL_CHAT_KEY = 'SillyTavern_NeutralChat';

/**
 * Preserves the neutral chat in session storage.
 */
export function preserveNeutralChat(): void {
    if (this_chid !== undefined || selected_group || name2 !== neutralCharacterName) {
        return;
    }

    sessionStorage.setItem(NEUTRAL_CHAT_KEY, JSON.stringify({ chat: chat.slice(), chat_metadata: { ...chat_metadata } }));
}

/**
 * Restores the neutral chat from session storage.
 */
export function restoreNeutralChat(): void {
    const neutralChat = sessionStorage.getItem(NEUTRAL_CHAT_KEY);
    if (!neutralChat) return;

    const { chat: neutralChatData, chat_metadata: neutralChatMetadata } = JSON.parse(neutralChat);
    chat.splice(0, chat.length, ...neutralChatData);
    Object.assign(chat_metadata, neutralChatMetadata);
}

// ── Init ──────────────────────────────────────────────────────

/**
 * Initializes all chat utility event listeners.
 */
export function initChatUtilities(): void {
    // ── Hide/Unhide messages ──────────────────────────────────
    delegateClick('.mes_hide', (el) => {
        hideChatMessageRange(Number(el.closest('.mes')?.getAttribute('mesid')), null, false);
    });

    delegateClick('.mes_unhide', (el) => {
        hideChatMessageRange(Number(el.closest('.mes')?.getAttribute('mesid')), null, true);
    });

    // ── File operations ──────────────────────────────────────
    delegateClick('.mes_file_delete', (el) => {
        const messageBlock = el.closest('.mes');
        const messageId = Number(messageBlock?.getAttribute('mesid'));
        const fileBlock = el.closest('.mes_file_container');
        const fileIndex = Number(fileBlock?.getAttribute('data-index'));
        deleteMessageFile(messageBlock, messageId, fileIndex);
    });

    delegateClick('.mes_file_open', (el) => {
        const messageBlock = el.closest('.mes');
        const messageId = Number(messageBlock?.getAttribute('mesid'));
        const fileBlock = el.closest('.mes_file_container');
        const fileIndex = Number(fileBlock?.getAttribute('data-index'));
        viewMessageFile(messageId, fileIndex);
    });

    delegateClick('.mes_embed', (el) => {
        const messageBlock = el.closest('.mes');
        const messageId = Number(messageBlock?.getAttribute('mesid'));
        embedMessageFile(messageId, messageBlock);
    });

    // ── Assistant note export/import ──────────────────────────
    delegateClick('.assistant_note_export', () => {
        const chatHeader = {
            chat_metadata: chat_metadata,
            user_name: 'unused',
            character_name: 'unused',
        };
        const chatToSave = [
            chatHeader,
            ...chat.filter((x: ChatMessage) => x?.extra?.type !== system_message_types.ASSISTANT_NOTE),
        ];
        download(chatToSave.map((m) => JSON.stringify(m)).join('\n'), `Assistant - ${humanizedDateTime()}.jsonl`, 'application/json');
    });

    delegateClick('.assistant_note_import', () => {
        const importFile = async () => {
            const file = fileInput.files?.[0];
            if (!file) return;

            try {
                const text = await getFileText(file) as string;
                const lines = text.split('\n').filter((line: string) => line.trim() !== '');
                const messages = lines.map((line: string) => JSON.parse(line));
                const metadata = messages.shift()?.chat_metadata || {};
                messages.unshift(getSystemMessageByType(system_message_types.ASSISTANT_NOTE, ''));
                await clearChat();
                chat.splice(0, chat.length, ...messages);
                updateChatMetadata(metadata, true);
                await printMessages();
            } catch (error) {
                console.error('Error importing assistant chat:', error);
            }
        };
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.jsonl';
        fileInput.addEventListener('change', importFile);
        fileInput.click();
    });

    // ── Attach file button ───────────────────────────────────
    const fileInput = document.getElementById('file_form_input');

    delegateClick('#attachFile', () => {
        if (!(fileInput instanceof HTMLInputElement)) return;

        const dt = mergeFilesIntoDataTransfer(fileInput.files!, []);

        const onChangeHandler = async () => {
            const merged = mergeFilesIntoDataTransfer(dt.files, Array.from(fileInput.files!));
            fileInput.files = merged.files;
            await onFileAttach(fileInput.files!);
        };

        fileInput.addEventListener('change', onChangeHandler);
        fileInput.click();
    });

    // ── Manage attachments ────────────────────────────────────
    delegateClick('#manageAttachments', () => openAttachmentManager());

    // ── Editor maximize ───────────────────────────────────────
    delegateClick('.editor_maximize', async (el, e) => {
        e.preventDefault();
        e.stopPropagation();

        const broId = el.getAttribute('data-for');
        if (!broId) return;
        const broEl = document.getElementById(broId);
        if (!broEl) return;

        const contentEditable = broEl.hasAttribute('contenteditable');

        const { openMarkdownEditor } = await import('../rich-editor.js');
        await openMarkdownEditor(broEl, { contentEditable });
    });

    // ── Click-to-edit messages ────────────────────────────────
    delegateClick('.mes .mes_text, .mes .mes_reasoning', (el, event) => {
        if (!power_user.click_to_edit) return;
        if (window.getSelection()?.toString()) return;
        if (document.querySelector('.edit_textarea')) return;

        (el.closest('.mes')?.querySelector('.mes_edit') as HTMLElement)?.click();
        if (el.closest('.mes_reasoning')) {
            (document.querySelector('.reasoning_edit_textarea') as HTMLElement)?.focus();
        }
    }, true);

    // ── Media overrides ──────────────────────────────────────
    delegateClick('.open_media_overrides', () => openExternalMediaOverridesDialog());

    document.addEventListener('input', function (e) {
        if (!(e.target instanceof Element)) return;
        const el = e.target.closest('#forbid_media_override_allowed');
        if (!el) return;
        const entityId = getCurrentEntityId();
        if (!entityId) return;
        power_user.external_media_allowed_overrides.push(entityId);
        power_user.external_media_forbidden_overrides = power_user.external_media_forbidden_overrides.filter((v: string) => v !== entityId);
        saveSettingsDebounced();
        reloadCurrentChat();
    });

    document.addEventListener('input', function (e) {
        if (!(e.target instanceof Element)) return;
        const el = e.target.closest('#forbid_media_override_forbidden');
        if (!el) return;
        const entityId = getCurrentEntityId();
        if (!entityId) return;
        power_user.external_media_forbidden_overrides.push(entityId);
        power_user.external_media_allowed_overrides = power_user.external_media_allowed_overrides.filter((v: string) => v !== entityId);
        saveSettingsDebounced();
        reloadCurrentChat();
    });

    document.addEventListener('input', function (e) {
        if (!(e.target instanceof Element)) return;
        const el = e.target.closest('#forbid_media_override_global');
        if (!el) return;
        const entityId = getCurrentEntityId();
        if (!entityId) return;
        power_user.external_media_allowed_overrides = power_user.external_media_allowed_overrides.filter((v: string) => v !== entityId);
        power_user.external_media_forbidden_overrides = power_user.external_media_forbidden_overrides.filter((v: string) => v !== entityId);
        saveSettingsDebounced();
        reloadCurrentChat();
    });

    // ── Styles button ─────────────────────────────────────────
    document.getElementById('creators_note_styles_button')?.addEventListener('click', function (e) {
        e.stopPropagation();
        openGlobalStylesPreferenceDialog();
    });

    // ── Media container actions ──────────────────────────────
    /**
     *
     * @param containerClass
     */
    function getMediaContainerInfo(this: Element, containerClass = '.mes_media_container') {
        const messageBlock = this.closest('.mes');
        const messageId = Number(messageBlock?.getAttribute('mesid'));
        const mediaBlock = this.closest(containerClass);
        const mediaIndex = Number(mediaBlock?.getAttribute('data-index'));
        return { messageBlock, messageId, mediaBlock, mediaIndex };
    }

    /**
     * Register a click handler on a media container child selector.
     * @param selector
     * @param handler
     */
    function onMediaClick(
        selector: string,
        handler: (info: ReturnType<typeof getMediaContainerInfo>) => void | Promise<void>,
    ): void {
        chatElement[0]?.addEventListener('click', async function (this: Element, e: Event) {
            if (!(e.target instanceof Element)) return;
            const el = (e.target as Element).closest(selector);
            if (el) {
                await handler(getMediaContainerInfo.call(el));
            }
        });
    }

    onMediaClick('.mes_img', ({ messageId, mediaIndex }) => { expandMessageMedia(messageId, mediaIndex); });
    onMediaClick('.mes_media_enlarge', ({ messageId, mediaIndex }) => { expandMessageMedia(messageId, mediaIndex); });
    onMediaClick('.mes_media_delete', async ({ messageId, mediaIndex, messageBlock }) => {
        await deleteMessageMedia(messageId, mediaIndex, messageBlock);
    });
    onMediaClick('.mes_media_list', ({ messageId, messageBlock }) => switchMessageMediaDisplay(messageId, messageBlock, MEDIA_DISPLAY.GALLERY));
    onMediaClick('.mes_media_gallery', ({ messageId, messageBlock }) => switchMessageMediaDisplay(messageId, messageBlock, MEDIA_DISPLAY.LIST));
    onMediaClick('.mes_img_swipe_left', ({ messageId, messageBlock }) => { if (messageBlock) return onImageSwiped(messageId, messageBlock, SWIPE_DIRECTION.LEFT); });
    onMediaClick('.mes_img_swipe_right', ({ messageId, messageBlock }) => { if (messageBlock) return onImageSwiped(messageId, messageBlock, SWIPE_DIRECTION.RIGHT); });

    // ── File form reset ──────────────────────────────────────
    document.getElementById('file_form')?.addEventListener('reset', function () {
        document.getElementById('file_form')?.classList.add('displayNone');
    });

    // ── Paste handler ────────────────────────────────────────
    document.getElementById('send_textarea')?.addEventListener('paste', async function (this: HTMLElement, event: Event) {
        const clipboardEvent = event as ClipboardEvent;
        if (!clipboardEvent.clipboardData || clipboardEvent.clipboardData.files.length === 0) return;

        event.preventDefault();
        event.stopPropagation();
        await handleFileAttach(Array.from(clipboardEvent.clipboardData.files));
    });

    // ── Drag and drop ────────────────────────────────────────
    new DragAndDropHandler('#form_sheld', async (files: File[]) => {
        await handleFileAttach(files);
    });

    /**
     *
     * @param files
     */
    async function handleFileAttach(files: File[]) {
        if (!(fileInput instanceof HTMLInputElement)) return;
        const merged = mergeFilesIntoDataTransfer(fileInput.files!, files);
        fileInput.files = merged.files;
        await onFileAttach(fileInput.files!);
    }

    // ── Chat changed event ──────────────────────────────────
    eventSource.on(event_types.CHAT_CHANGED, checkForCreatorNotesStyles);
}

// ── Helper ─────────────────────────────────────────────────────

/**
 * Register a delegated click handler with the standard guard pattern.
 * @param selector
 * @param handler
 * @param useCapture
 */
function delegateClick(
    selector: string,
    handler: (el: Element, event: MouseEvent) => void,
    useCapture = false,
): void {
    document.addEventListener('click', function (this: void, e: Event) {
        if (!(e.target instanceof Element)) return;
        const el = e.target.closest(selector);
        if (el) handler(el, e as MouseEvent);
    }, useCapture);
}
