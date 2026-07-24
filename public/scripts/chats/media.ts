/**
 * Media (image/video/audio) operations on messages.
 *
 * Handles expanding, deleting, swiping, and switching media display
 * for inline message media attachments.
 */

import {
    chat,
    saveChatConditional,
    appendMediaToMessage,
    getMediaIndex,
    getMediaDisplay,
    eventSource,
    event_types,
} from '../../script.js';
import { Popup, POPUP_RESULT, POPUP_TYPE, callGenericPopup } from '../popup.js';
import { t } from '../i18n.js';
import { SCROLL_BEHAVIOR, SWIPE_DIRECTION, MEDIA_DISPLAY } from '../constants.js';
import { clamp } from '../utils.js';
import { deleteMediaFromServer } from './attachment-store.js';

// ── DOM Helpers ────────────────────────────────────────────────

/**
 * Creates an image element for media expansion
 */
function createExpandedImageElement(url: string, title: string): HTMLImageElement {
    const img = document.createElement('img');
    img.src = url;
    if (title) img.alt = title;
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';
    return img;
}

/**
 * Creates a video element for media expansion
 */
function createExpandedVideoElement(url: string): HTMLVideoElement {
    const video = document.createElement('video');
    video.src = url;
    video.controls = true;
    video.style.maxWidth = '100%';
    video.style.maxHeight = '100%';
    return video;
}

/**
 * Routes to the correct media element factory based on type
 */
function createExpandedMediaElement(type: string, url: string, title: string): HTMLElement {
    if (type === 'video') {
        return createExpandedVideoElement(url);
    }
    // Default to image for 'image' or unknown types
    return createExpandedImageElement(url, title);
}

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

    const mediaElement = createExpandedMediaElement(mediaAttachment.type, mediaAttachment.url, title);
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
export async function deleteMessageMedia(
    messageId: number,
    mediaIndex: number,
    messageBlock: Element | null,
): Promise<void> {
    if (Number.isNaN(Number(messageId)) || Number.isNaN(Number(mediaIndex))) {
        console.warn('Invalid message ID or media index');
        return;
    }

    const deleteUrls: string[] = [];
    const deleteFromServerId = 'delete_media_files_checkbox';
    let deleteFromServer = true;

    const value = await Popup.show.confirm(
        t`Delete media from message?`,
        t`This action can't be undone.`,
        {
            okButton: t`Delete one`,
            cancelButton: false,
            customButtons: [
                { text: t`Delete all`, appendAtEnd: true, result: POPUP_RESULT.CUSTOM1 },
                { text: t`Cancel`, appendAtEnd: true, result: POPUP_RESULT.CANCELLED },
            ],
            customInputs: [
                {
                    type: 'checkbox',
                    label: t`Also delete files from server`,
                    id: deleteFromServerId,
                    defaultState: true,
                },
            ],
            onClose: (popup: Record<string, unknown>) => {
                deleteFromServer = Boolean(
                    (popup.inputResults as Map<string, unknown>)?.get(deleteFromServerId) ?? false,
                );
            },
        },
    );

    if (!value) return;

    const message = chat[messageId]!;
    if (!Array.isArray(message?.extra?.media)) {
        console.debug('Message has no media');
        return;
    }

    const mediaArr = message.extra.media;
    if (mediaIndex < 0 || mediaIndex >= mediaArr.length) {
        console.warn('Invalid media index for message');
        return;
    }

    deleteUrls.push(mediaArr[mediaIndex].url);
    mediaArr.splice(mediaIndex, 1);

    if (message.extra.media_index === mediaIndex) {
        const newIndex = mediaIndex > 0 ? mediaIndex - 1 : 0;
        message.extra.media_index = clamp(newIndex, 0, mediaArr.length - 1);
    }

    if (value === POPUP_RESULT.CUSTOM1) {
        for (let i = 0; i < mediaArr.length; i++) {
            deleteUrls.push(mediaArr[i].url);
        }

        // V8 shape optimization: Avoid `delete`, use `undefined` to preserve hidden classes
        message.extra.media = undefined;
        message.extra.inline_image = undefined;
        message.extra.title = undefined;
        message.extra.append_title = undefined;
    }

    if (deleteFromServer) {
        for (let i = 0; i < deleteUrls.length; i++) {
            const url = deleteUrls[i];
            if (url) {
                await deleteMediaFromServer(url, true);
            }
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
    if (Number.isNaN(Number(messageId))) {
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
export async function onImageSwiped(
    messageId: number,
    element: Element,
    direction: string,
): Promise<void> {
    const animationClass = 'fa-fade';

    // querySelector is O(1) allocation compared to querySelectorAll's NodeList mapping
    const messageMedia = element.querySelector('.mes_img, .mes_video');

    if (messageMedia && messageMedia.classList.contains(animationClass)) {
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

    const mediaLength = media.length;
    if (mediaLength === 1) {
        console.warn('Only one media item in the message, swiping is not applicable');
        return;
    }

    if (direction === SWIPE_DIRECTION.LEFT) {
        const newIndex = currentIndex === 0 ? mediaLength - 1 : currentIndex - 1;
        message.extra!.media_index = newIndex;
    }

    if (direction === SWIPE_DIRECTION.RIGHT) {
        const newIndex = currentIndex === mediaLength - 1 ? 0 : currentIndex + 1;
        message.extra!.media_index = newIndex >= mediaLength ? 0 : newIndex;
    }

    await saveChatConditional();
    appendMediaToMessage(message, element);
}
