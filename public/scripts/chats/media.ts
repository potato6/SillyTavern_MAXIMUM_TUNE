/**
 * Media (image/video/audio) operations on messages.
 *
 * Handles expanding, deleting, swiping, and switching media display
 * for inline message media attachments.
 */

import { chat, saveChatConditional, appendMediaToMessage, getMediaIndex, getMediaDisplay, eventSource, event_types } from '../../script.js';
import { Popup, POPUP_RESULT, POPUP_TYPE, callGenericPopup } from '../popup.js';
import { t } from '../i18n.js';
import { SCROLL_BEHAVIOR, SWIPE_DIRECTION, MEDIA_DISPLAY } from '../constants.js';
import { clamp } from '../utils.js';
import { deleteMediaFromServer } from './attachment-store.js';

// ── Expand ────────────────────────────────────────────────────

/**
 * Expands a media attachment in a message.
 * @param messageId Message ID
 * @param mediaIndex Media index
 * @returns The media element, or null
 */
export function expandMessageMedia(messageId: number, mediaIndex: number): HTMLElement | null {
    const message = chat[messageId];
    if (!message?.extra?.media || mediaIndex < 0 || mediaIndex >= message.extra.media.length) {
        return null;
    }

    const mediaAttachment = message.extra.media[mediaIndex]!;
    const title = mediaAttachment.title || '';

    /**
     *
     */
    function getMediaElement(): HTMLElement | null {
        /**
         *
         */
        function getImageElement(): HTMLImageElement {
            const img = document.createElement('img');
            img.src = mediaAttachment.url;
            img.alt = title;
            img.style.maxWidth = '100%';
            img.style.maxHeight = '100%';
            return img;
        }

        /**
         *
         */
        function getVideoElement(): HTMLVideoElement {
            const video = document.createElement('video');
            video.src = mediaAttachment.url;
            video.controls = true;
            video.style.maxWidth = '100%';
            video.style.maxHeight = '100%';
            return video;
        }

        switch (mediaAttachment.type) {
            case 'image':
                return getImageElement();
            case 'video':
                return getVideoElement();
            default:
                return getImageElement();
        }
    }

    const mediaElement = getMediaElement();
    if (!mediaElement) return null;

    const mediaHolder = document.createElement('div');
    mediaHolder.style.textAlign = 'center';
    mediaHolder.appendChild(mediaElement);

    // Title bar
    if (title) {
        const mediaTitlePre = document.createElement('pre');
        mediaTitlePre.style.whiteSpace = 'pre-wrap';
        mediaTitlePre.style.wordBreak = 'break-all';
        const mediaTitleCode = document.createElement('code');
        mediaTitleCode.textContent = title;
        mediaTitlePre.appendChild(mediaTitleCode);
        mediaHolder.prepend(mediaTitlePre);
    }

    const mediaContainer = document.createElement('div');
    mediaContainer.appendChild(mediaHolder);

    const shouldZoom = mediaAttachment.type === 'image';
    callGenericPopup(mediaContainer, POPUP_TYPE.TEXT, '', {
        large: true,
        transparent: shouldZoom,
    });

    return mediaElement;
}

// ── Delete ─────────────────────────────────────────────────────

/**
 * Deletes media from a message.
 * @param messageId Message ID
 * @param mediaIndex Media index
 * @param messageBlock Message block element
 */
export async function deleteMessageMedia(messageId: number, mediaIndex: number, messageBlock: Element | null): Promise<void> {
    if (isNaN(messageId) || isNaN(mediaIndex)) {
        console.warn('Invalid message ID or media index');
        return;
    }

    const deleteUrls: string[] = [];
    const deleteFromServerId = 'delete_media_files_checkbox';
    let deleteFromServer = true;

    const value = await Popup.show.confirm(t`Delete media from message?`, t`This action can't be undone.`, {
        okButton: t`Delete one`,
        cancelButton: false,
        customButtons: [
            { text: t`Delete all`, appendAtEnd: true, result: POPUP_RESULT.CUSTOM1 },
            { text: t`Cancel`, appendAtEnd: true, result: POPUP_RESULT.CANCELLED },
        ],
        customInputs: [
            { type: 'checkbox', label: t`Also delete files from server`, id: deleteFromServerId, defaultState: true },
        ],
        onClose: (popup: Record<string, unknown>) => {
            deleteFromServer = Boolean((popup.inputResults as Map<string, unknown>)?.get(deleteFromServerId) ?? false);
        },
    });

    if (!value) return;

    const message = chat[messageId]!;
    if (!Array.isArray(message?.extra?.media)) {
        console.debug('Message has no media');
        return;
    }

    if (mediaIndex < 0 || mediaIndex >= message.extra.media.length) {
        console.warn('Invalid media index for message');
        return;
    }

    deleteUrls.push(message.extra.media[mediaIndex].url);
    message.extra.media.splice(mediaIndex, 1);

    if (message.extra.media_index === mediaIndex) {
        const newIndex = mediaIndex > 0 ? mediaIndex - 1 : 0;
        message.extra.media_index = clamp(newIndex, 0, message.extra.media.length - 1);
    }

    if (value === POPUP_RESULT.CUSTOM1) {
        for (const media of message.extra.media) {
            deleteUrls.push(media.url);
        }
        delete message.extra.media;
        delete message.extra.inline_image;
        delete message.extra.title;
        delete message.extra.append_title;
    }

    if (deleteFromServer) {
        for (const url of deleteUrls) {
            if (!url) continue;
            await deleteMediaFromServer(url, true);
        }
    }

    await saveChatConditional();
    appendMediaToMessage(message, messageBlock, SCROLL_BEHAVIOR.KEEP);
}

// ── Display Switching ─────────────────────────────────────────

/**
 * Switches the media display mode for a message.
 * @param messageId Message ID
 * @param messageBlock Message block element
 * @param targetDisplay Target display mode
 */
export async function switchMessageMediaDisplay(
    messageId: number,
    messageBlock: Element | null,
    targetDisplay: string,
): Promise<void> {
    if (isNaN(messageId)) {
        console.warn('Invalid message ID');
        return;
    }

    const message = chat[messageId];
    if (!message) {
        console.warn('Message not found for ID', messageId);
        return;
    }

    if (!message.extra || typeof message.extra !== 'object') {
        message.extra = {};
    }

    message.extra.media_display = targetDisplay;
    await saveChatConditional();
    appendMediaToMessage(message, messageBlock, SCROLL_BEHAVIOR.KEEP);
}

// ── Swiping ────────────────────────────────────────────────────

/**
 * Switches an image to the next or previous one in the swipe list.
 * @param messageId Message ID
 * @param element Message element
 * @param direction Swipe direction
 */
export async function onImageSwiped(messageId: number, element: Element, direction: string): Promise<void> {
    const animationClass = 'fa-fade';
    const messageMedia = element.querySelectorAll('.mes_img, .mes_video');

    if (messageMedia.length > 0 && messageMedia[0]!.classList.contains(animationClass)) {
        return;
    }

    const message = chat[messageId];
    const media = message?.extra?.media;

    if (!message || !Array.isArray(media) || media.length === 0) {
        console.warn('No media found in the message');
        return;
    }

    const currentIndex = getMediaIndex(message);
    const mediaDisplay = getMediaDisplay(message);

    if (mediaDisplay !== MEDIA_DISPLAY.GALLERY) {
        console.warn('Image swiping is only supported for gallery media display');
        return;
    }

    await eventSource.emit(event_types.IMAGE_SWIPED, { message, element, direction });

    if (media.length === 1) {
        console.warn('Only one media item in the message, swiping is not applicable');
        return;
    }

    if (direction === SWIPE_DIRECTION.LEFT) {
        const newIndex = currentIndex === 0 ? media.length - 1 : currentIndex - 1;
        message.extra!.media_index = newIndex;
    }

    if (direction === SWIPE_DIRECTION.RIGHT) {
        const newIndex = currentIndex === media.length - 1 ? 0 : currentIndex + 1;
        message.extra!.media_index = newIndex >= media.length ? 0 : newIndex;
    }

    await saveChatConditional();
    appendMediaToMessage(message, element);
}
