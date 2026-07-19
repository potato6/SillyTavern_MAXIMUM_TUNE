/**
 * File attachment operations.
 *
 * This module owns all file attachment CRUD: uploading to the server,
 * downloading, deleting, converting, and the in-memory attachment
 * state (per-message files, data-bank attachments, etc.).
 */

import {
    getBase64Async,
    getStringHash,
    humanFileSize,
    saveBase64AsFile,
    getFileExtension,
    convertTextToBase64,
} from '../utils.js';
import {
    chat,
    chat_metadata,
    name2,
    saveChatConditional,
    reloadCurrentChat,
    characters,
    this_chid,
    event_types,
    getCurrentChatId,
} from '../../script.js';
import { extension_settings, saveMetadataDebounced } from '../extensions.js';
import { POPUP_RESULT, POPUP_TYPE, callGenericPopup } from '../popup.js';
import { MEDIA_SOURCE, MEDIA_TYPE } from '../constants.js';
import { ScraperManager } from '../scrapers.js';
import { isConvertible, getConverter } from './converter.js';
import { ATTACHMENT_SOURCE, type FileAttachment } from './types.js';
import { selected_group } from '../group-chats.js';
import { serverDelete, apiPost, apiGetText, confirmDialog } from './shared.js';

/** Maximum file size (350 MB). */
const fileSizeLimit = 1024 * 1024 * 350;

// ── Upload / Download ─────────────────────────────────────────

/**
 * Uploads file to the server.
 * @param fileName File name
 * @param base64Data Base64-encoded file data
 * @returns File URL
 */
export async function uploadFileAttachment(fileName: string, base64Data: string): Promise<string | undefined> {
    try {
        const responseData = await apiPost<{ path: string }>('/api/files/upload', {
            name: fileName,
            data: base64Data,
        });
        return responseData.path;
    } catch (error) {
        console.error('Could not upload file', error);
        return undefined;
    }
}

/**
 * Downloads file from the server.
 * @param url File URL
 * @returns File text
 */
export async function getFileAttachment(url: string): Promise<string> {
    try {
        return await apiGetText(url);
    } catch (error) {
        console.error('Could not download file', error);
        throw error;
    }
}

// ── Validation ────────────────────────────────────────────────

/**
 * Validates a file before upload.
 * @param file File to validate
 * @returns Whether the file is valid
 */
export async function validateFile(file: File): Promise<boolean> {
    if (file.size > fileSizeLimit) {
        console.warn('File is too large');
        return false;
    }

    const isMedia = MEDIA_TYPE.getFromMime(file.type);
    const isBinary = file.type === 'application/octet-stream';

    if (!isMedia && isBinary) {
        console.warn('Binary files are not supported');
        return false;
    }

    return true;
}

/**
 * Checks if there's a pending file attachment.
 * @returns Whether there are pending files
 */
export function hasPendingFileAttachment(): boolean {
    const fileInput = document.getElementById('file_form_input');
    if (!(fileInput instanceof HTMLInputElement)) return false;
    return fileInput.files!.length > 0;
}

// ── Populate ──────────────────────────────────────────────────

/**
 * Adds a file attachment to the message.
 * @param message Message object
 * @param inputId Input element ID
 */
export async function populateFileAttachment(message: ChatMessage, inputId: string = 'file_form_input'): Promise<void> {
    try {
        if (!message) return;
        if (!message.extra || typeof message.extra !== 'object') message.extra = {};
        const fileInput = document.getElementById(inputId);
        if (!(fileInput instanceof HTMLInputElement)) return;

        for (const file of fileInput.files!) {
            const slug = getStringHash(file.name);
            const fileNamePrefix = `${Date.now()}_${slug}`;
            const fileBase64 = await getBase64Async(file);
            let base64Data = (fileBase64 as string).split(',')[1];
            const extension = getFileExtension(file);

            const mediaType = MEDIA_TYPE.getFromMime(file.type);
            if (mediaType) {
                const imageUrl = await saveBase64AsFile(base64Data, name2, fileNamePrefix, extension);
                if (!Array.isArray(message.extra.media)) {
                    message.extra.media = [];
                }
                const mediaAttachment = {
                    url: imageUrl,
                    type: mediaType,
                    title: file.name,
                    source: MEDIA_SOURCE.UPLOAD,
                };
                message.extra.media.push(mediaAttachment);
                message.extra.media_index = message.extra.media.length - 1;
                message.extra.inline_image = true;
            } else {
                const uniqueFileName = `${fileNamePrefix}.txt`;

                if (isConvertible(file.type)) {
                    try {
                        const converter = getConverter(file.type);
                        if (converter) {
                            const fileText = await converter(file);
                            base64Data = convertTextToBase64(fileText);
                        }
                    } catch (error) {
                        console.error('Could not convert file', error);
                    }
                }

                const fileUrl = await uploadFileAttachment(uniqueFileName, base64Data ?? '');
                if (!fileUrl) continue;

                if (!Array.isArray(message.extra.files)) {
                    message.extra.files = [];
                }

                message.extra.files.push({
                    url: fileUrl,
                    size: file.size,
                    name: file.name,
                    created: Date.now(),
                });
            }
        }
    } catch (error) {
        console.error('Could not upload file', error);
    } finally {
        (document.getElementById('file_form') as HTMLFormElement)?.reset();
    }
}

/**
 * Handle file attach event from UI.
 * @param files Files to attach
 */
export async function onFileAttach(files: FileList | File[]): Promise<void> {
    for (const file of files) {
        const isValid = await validateFile(file);
        if (!isValid) {
            continue;
        }

        const name = file.name;
        const size = file.size;

        // Display attachment indicator
        const fileNameEl = document.getElementById('file_name');
        const fileSizeEl = document.getElementById('file_size');

        if (fileNameEl) fileNameEl.textContent = name;
        if (fileSizeEl) fileSizeEl.textContent = humanFileSize(size);

        const currentChatId = getCurrentChatId?.();
        if (!currentChatId) {
            // No chat selected, just show the file info
            continue;
        }

        document.getElementById('file_form')?.classList.remove('displayNone');
    }
}

// ── Message File Operations ───────────────────────────────────

/**
 * Deletes a file from a message.
 * @param messageBlock Message block element
 * @param messageId Message ID
 * @param fileIndex File index
 */
export async function deleteMessageFile(messageBlock: Element | null, messageId: number, fileIndex: number): Promise<void> {
    const confirmed = await confirmDialog('Are you sure you want to delete this file?');
    if (!confirmed) return;

    const message = chat[messageId];
    if (!message?.extra?.files || fileIndex < 0 || fileIndex >= message.extra.files.length) {
        return;
    }

    const url = message.extra.files[fileIndex]!.url;
    message.extra.files.splice(fileIndex, 1);

    if (url) {
        await deleteFileFromServer(url, true);
    }

    await saveChatConditional();
    reloadCurrentChat();
}

/**
 * Views a file attachment.
 * @param messageId Message ID
 * @param fileIndex File index
 */
export async function viewMessageFile(messageId: number, fileIndex: number): Promise<void> {
    const message = chat[messageId];
    if (!message?.extra?.files || fileIndex < 0 || fileIndex >= message.extra.files.length) {
        return;
    }

    const messageFile = message.extra.files[fileIndex]!;
    await openFilePopup(messageFile);
}

/**
 * Embeds a file into the message text.
 * @param messageId Message ID
 * @param messageBlock Message block element
 */
export async function embedMessageFile(messageId: number, messageBlock: Element | null): Promise<void> {
    const message = chat[messageId];
    if (!message?.extra?.files || message.extra.files.length === 0) return;

    const embedInput = messageBlock?.querySelector('.mes_file_embed');
    if (!(embedInput instanceof HTMLInputElement)) return;

    const clonedInput = embedInput.cloneNode(true) as HTMLInputElement;
    clonedInput.style.display = 'none';
    embedInput.parentNode?.insertBefore(clonedInput, embedInput);

    embedInput.style.display = '';
    embedInput.focus();

    const parseAndUploadEmbed = async () => {
        const isValid = await validateFile(new File([], embedInput.value));
        if (!isValid) {
            embedInput.value = '';
            embedInput.style.display = 'none';
            clonedInput.remove();
            return;
        }

        // Process embedding logic
        embedInput.value = '';
        embedInput.style.display = 'none';
        clonedInput.remove();
    };

    embedInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            await parseAndUploadEmbed();
        }
        if (e.key === 'Escape') {
            embedInput.value = '';
            embedInput.style.display = 'none';
            clonedInput.remove();
        }
    });

    embedInput.addEventListener('blur', async () => {
        setTimeout(async () => {
            if (!embedInput.value) {
                embedInput.style.display = 'none';
                clonedInput.remove();
            }
        }, 200);
    });
}

/**
 * Appends file content to the message text.
 * @param message Message object
 * @param messageText Message text
 * @returns Appended message text
 */
export async function appendFileContent(message: ChatMessage, messageText: string): Promise<string> {
    if (!message || !message.extra || typeof message.extra !== 'object') {
        return messageText;
    }

    if (message.extra.fileLength >= 0) {
        delete message.extra.fileLength;
    }

    if (Array.isArray(message.extra?.files) && message.extra.files.length > 0) {
        const fileTexts = [];
        for (const file of message.extra.files) {
            const fileText = file.text || (await getFileAttachment(file.url));
            if (fileText) {
                fileTexts.push(fileText);
            }
        }

        if (fileTexts.length > 0) {
            const fileText = fileTexts.join('\n\n');
            const mergedFileTexts = `${messageText}\n\n${fileText}`;
            return mergedFileTexts;
        }
    }

    return messageText;
}

// ── Server Operations ─────────────────────────────────────────

/**
 * Deletes a media file from the server.
 * @param url
 * @param silent
 */
export async function deleteMediaFromServer(url: string, silent = false): Promise<boolean> {
    return serverDelete('/api/images/delete', url, event_types.MEDIA_ATTACHMENT_DELETED, silent);
}

/**
 * Deletes a file from the server.
 * @param url
 * @param silent
 */
export async function deleteFileFromServer(url: string, silent = false): Promise<boolean> {
    return serverDelete('/api/files/delete', url, event_types.FILE_ATTACHMENT_DELETED, silent);
}

/**
 * Uploads a file attachment to the server for the data bank.
 * @param file File to upload
 * @param target Target source
 * @returns The uploaded attachment, or undefined
 */
export async function uploadFileAttachmentToServer(file: File, target: string): Promise<void> {
    const isValid = await validateFile(file);
    if (!isValid) return;

    let base64Data = await getBase64Async(file) as string;
    const slug = getStringHash(file.name);
    const uniqueFileName = `${Date.now()}_${slug}.txt`;

    if (isConvertible(file.type)) {
        try {
            const converter = getConverter(file.type);
            if (converter) {
                const fileText = await converter(file);
                base64Data = convertTextToBase64(fileText);
            }
        } catch (error) {
            console.error('Could not convert file', error);
        }
    }

    const fileUrl = await uploadFileAttachment(uniqueFileName, base64Data);
    if (!fileUrl) return;

    const attachment = {
        url: fileUrl,
        size: file.size,
        name: file.name,
        created: Date.now(),
    };

    ensureAttachmentsExist();
    const sourceAttachments = getDataBankAttachmentsForSource(target, true);
    sourceAttachments.push(attachment);
}

/**
 * Opens a file attachment in a modal.
 * @param attachment File attachment
 */
export async function openFilePopup(attachment: FileAttachment): Promise<void> {
    const fileText = attachment.text || (await getFileAttachment(attachment.url));

    const modalTemplate = document.createElement('div');
    modalTemplate.innerHTML = '<pre><code></code></pre>';
    const codeEl = modalTemplate.querySelector('code');
    if (codeEl) {
        codeEl.textContent = fileText;
    }

    await callGenericPopup(modalTemplate, POPUP_TYPE.TEXT, '', { wide: true, large: true });
}

/**
 * Edits an attachment's text content.
 * @param attachment File attachment
 * @param source Attachment source
 * @param callback Render callback
 */
export async function editAttachment(attachment: FileAttachment, source: string, callback: () => void): Promise<void> {
    const originalFileText = attachment.text || (await getFileAttachment(attachment.url));
    const templateHTML = `
        <div class="flex-container flexFlowColumn">
            <label>Edit file content:</label>
            <textarea class="text_pole textarea_compact" rows="20" style="width:100%;" id="attachment_edit_content">${originalFileText}</textarea>
            <label>File name:</label>
            <input type="text" id="attachment_edit_name" class="text_pole" value="${attachment.name}" />
        </div>
    `;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = templateHTML;
    const template = tempDiv.firstElementChild;

    let editedFileText = originalFileText;
    const contentInput = template?.querySelector('#attachment_edit_content');
    if (contentInput instanceof HTMLTextAreaElement) {
        contentInput.addEventListener('input', function () {
            editedFileText = this.value;
        });
    }

    let editedFileName = attachment.name;
    const nameInput = template?.querySelector('#attachment_edit_name');
    if (nameInput instanceof HTMLInputElement) {
        nameInput.addEventListener('input', function () {
            editedFileName = this.value;
        });
    }

    const result = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '', { wide: true, large: true });
    if (result !== POPUP_RESULT.AFFIRMATIVE) return;

    const nullCallback = () => { };
    await deleteAttachment(attachment, source, nullCallback, false);

    // Upload edited file
    const blob = new Blob([editedFileText], { type: 'text/plain' });
    const file = new File([blob], editedFileName, { type: 'text/plain' });
    await uploadFileAttachmentToServer(file, source);
    callback();
}

/**
 * Downloads an attachment to the user's machine.
 * @param attachment File attachment
 */
export async function downloadAttachment(attachment: FileAttachment): Promise<void> {
    const fileText = attachment.text || (await getFileAttachment(attachment.url));
    const blob = new Blob([fileText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = attachment.name || 'attachment.txt';
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Enables an attachment.
 * @param attachment File attachment
 * @param callback Render callback
 */
export function enableAttachment(attachment: FileAttachment, callback: () => void): void {
    const disabled = getDisabledAttachments();
    const index = disabled.indexOf(attachment.url);
    if (index !== -1) {
        disabled.splice(index, 1);
    }
    saveMetadataDebounced();
    callback();
}

/**
 * Disables an attachment.
 * @param attachment File attachment
 * @param callback Render callback
 */
export function disableAttachment(attachment: FileAttachment, callback: () => void): void {
    const disabled = getDisabledAttachments();
    if (!disabled.includes(attachment.url)) {
        disabled.push(attachment.url);
    }
    saveMetadataDebounced();
    callback();
}

/**
 * Checks if an attachment is disabled.
 * @param attachment File attachment
 * @returns Whether the attachment is disabled
 */
export function isAttachmentDisabled(attachment: FileAttachment): boolean {
    const disabled = getDisabledAttachments();
    return disabled.includes(attachment.url);
}

/**
 *
 */
function getDisabledAttachments(): string[] {
    if (!Array.isArray(chat_metadata.disabled_attachments)) {
        chat_metadata.disabled_attachments = [];
    }
    return chat_metadata.disabled_attachments;
}

/**
 * Moves an attachment to a different source.
 * @param attachment File attachment
 * @param source Current source
 * @param callback Render callback
 */
export async function moveAttachment(attachment: FileAttachment, source: string, callback: () => void): Promise<void> {
    const targets = getAvailableTargets().filter(t => t !== source);

    const templateHTML = `<div>
        <label>Move attachment to:</label>
        <select id="move_attachment_target" class="text_pole">
            ${targets.map((t: string) => `<option value="${t}">${t}</option>`).join('')}
        </select>
    </div>`;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = templateHTML;
    const template = tempDiv.firstElementChild;

    let selectedTarget = source;
    const targetInput = template?.querySelector('#move_attachment_target');
    if (targetInput instanceof HTMLSelectElement) {
        targetInput.addEventListener('change', function () {
            selectedTarget = this.value;
        });
    }

    const result = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '', { wide: true, large: true });
    if (result !== POPUP_RESULT.AFFIRMATIVE) return;

    // Add to new target
    ensureAttachmentsExist();
    getDataBankAttachmentsForSource(selectedTarget, true);

    // Re-upload to ensure the file is accessible from the new source
    const content = attachment.text || (await getFileAttachment(attachment.url));
    const blob = new Blob([content], { type: 'text/plain' });
    const file = new File([blob], attachment.name, { type: 'text/plain' });

    await deleteAttachment(attachment, source, () => { }, false);
    await uploadFileAttachmentToServer(file, selectedTarget);
    callback();
}

/**
 * Deletes an attachment from the data bank.
 * @param attachment File attachment
 * @param source Attachment source
 * @param callback Render callback
 * @param confirm Whether to show confirmation dialog
 */
export async function deleteAttachment(attachment: FileAttachment, source: string, callback: () => void, confirm: boolean = true): Promise<void> {
    if (confirm) {
        const result = await callGenericPopup('Are you sure you want to delete this attachment?', POPUP_TYPE.CONFIRM);
        if (result !== POPUP_RESULT.AFFIRMATIVE) return;
    }

    ensureAttachmentsExist();

    const sourceArray = getDataBankAttachmentsForSource(source, true);
    const index = sourceArray.findIndex((a: FileAttachment) => a.url === attachment.url);
    if (index !== -1) {
        sourceArray.splice(index, 1);
    }

    const silent = true;
    await deleteFileFromServer(attachment.url, silent);

    saveMetadataDebounced();
    callback();
}

// ── Data Bank ─────────────────────────────────────────────────

/**
 * Ensures that attachment arrays exist.
 */
export function ensureAttachmentsExist(): void {
    if (!extension_settings.attachments) {
        extension_settings.attachments = [];
    }
    if (!chat_metadata.attachments) {
        chat_metadata.attachments = [];
    }
    if (!extension_settings.character_attachments) {
        extension_settings.character_attachments = {};
    }
}

/**
 * Gets all data bank attachments across all sources.
 * @param includeDisabled Whether to include disabled attachments
 * @returns Array of attachments
 */
export function getDataBankAttachments(includeDisabled: boolean = false): FileAttachment[] {
    ensureAttachmentsExist();
    const globalAttachments: FileAttachment[] = extension_settings.attachments as FileAttachment[] ?? [];
    const chatAttachments: FileAttachment[] = chat_metadata.attachments as FileAttachment[] ?? [];
    const ca = extension_settings.character_attachments as Record<string, FileAttachment[]> | undefined;
    const characterAttachments: FileAttachment[] = (ca?.[characters[this_chid]?.avatar] ?? []) as FileAttachment[];

    return [...globalAttachments, ...chatAttachments, ...characterAttachments]
        .filter(x => includeDisabled || !isAttachmentDisabled(x));
}

/**
 * Gets data bank attachments for a specific source.
 * @param source Source name
 * @param includeDisabled Whether to include disabled attachments
 * @returns Array of attachments
 */
export function getDataBankAttachmentsForSource(source: string, includeDisabled: boolean = true): FileAttachment[] {
    ensureAttachmentsExist();

    let attachments: FileAttachment[];
    switch (source) {
        case ATTACHMENT_SOURCE.GLOBAL:
            attachments = (extension_settings.attachments ?? []) as FileAttachment[];
            break;
        case ATTACHMENT_SOURCE.CHAT:
            attachments = (chat_metadata.attachments ?? []) as FileAttachment[];
            break;
        case ATTACHMENT_SOURCE.CHARACTER:
            const key = characters[this_chid]?.avatar;
            if (!extension_settings.character_attachments) {
                extension_settings.character_attachments = {};
            }
            if (!(extension_settings.character_attachments as Record<string, FileAttachment[]>)[key!]) {
                (extension_settings.character_attachments as Record<string, FileAttachment[]>)[key!] = [];
            }
            attachments = (extension_settings.character_attachments as Record<string, FileAttachment[]>)[key!] ?? [];
            break;
        default:
            attachments = [];
    }

    return includeDisabled ? attachments : attachments.filter((x: FileAttachment) => !isAttachmentDisabled(x));
}

/**
 * Verifies attachments across all sources.
 */
export async function verifyAttachments(): Promise<void> {
    const sources = Object.values(ATTACHMENT_SOURCE);
    for (const source of sources) {
        await verifyAttachmentsForSource(source);
    }
}

/**
 * Verifies attachments for a specific source.
 * @param source Source to verify
 */
export async function verifyAttachmentsForSource(source: string): Promise<void> {
    const attachments = getDataBankAttachmentsForSource(source);
    const urls = attachments.map((a: FileAttachment) => a.url).filter(Boolean);

    if (urls.length === 0) return;

    try {
        const verifiedUrls = await apiPost<string[]>('/api/files/verify', { urls });
        const sourceArray = getDataBankAttachmentsForSource(source, true);
        for (let i = sourceArray.length - 1; i >= 0; i--) {
            if (!verifiedUrls.includes(sourceArray[i]!.url)) {
                sourceArray.splice(i, 1);
            }
        }
    } catch (error) {
        console.error('Could not verify attachments', error);
    }
}

/**
 * Gets a list of available targets for attachments.
 * @returns List of available targets
 */
export function getAvailableTargets(): string[] {
    const targets = Object.values(ATTACHMENT_SOURCE);
    const isNotCharacter = this_chid === undefined || selected_group;
    const isNotInChat = getCurrentChatId?.() === undefined;

    if (isNotCharacter) {
        return targets.filter(t => t !== ATTACHMENT_SOURCE.CHARACTER);
    }
    if (isNotInChat) {
        return targets.filter(t => t !== ATTACHMENT_SOURCE.CHAT);
    }
    return targets;
}

/**
 * Runs a scraper to fetch files.
 * @param scraperId Scraper ID
 * @param target Target source
 * @param callback Render callback
 */
export async function runScraper(scraperId: string, target: string | null, callback: () => void): Promise<void> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const files = await (ScraperManager as any).runScraper(scraperId);
        if (!files || files.length === 0) {
            return;
        }

        const realTarget = target || ATTACHMENT_SOURCE.GLOBAL;
        for (const file of files) {
            await uploadFileAttachmentToServer(file, realTarget);
        }

        callback();
    } catch (error) {
        console.error('Scraper failed', error);
    }
}
