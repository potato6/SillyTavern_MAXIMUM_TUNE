// Move chat functions here from script.js (eventually)

import { css, DOMPurify } from '../lib.js';
import {
    addCopyToCodeBlocks,
    appendMediaToMessage,
    characters,
    chat,
    eventSource,
    event_types,
    getCurrentChatId,
    getRequestHeaders,
    name2,
    reloadCurrentChat,
    saveSettingsDebounced,
    this_chid,
    saveChatConditional,
    chat_metadata,
    neutralCharacterName,
    updateChatMetadata,
    system_message_types,
    converter,
    substituteParams,
    getSystemMessageByType,
    printMessages,
    clearChat,
    refreshSwipeButtons,
    getMediaIndex,
    getMediaDisplay,
    chatElement,
} from '../script.js';
// @ts-expect-error TS(7034) FIXME: Variable 'selected_group' implicitly has type 'any... Remove this comment to see the full error message
import { selected_group } from './group-chats.js';
import { power_user } from './power-user.js';
import {
    extractTextFromHTML,
    extractTextFromMarkdown,
    extractTextFromPDF,
    extractTextFromEpub,
    getBase64Async,
    getStringHash,
    humanFileSize,
    saveBase64AsFile,
    extractTextFromOffice,
    download,
    getFileText,
    getFileExtension,
    convertTextToBase64,
    isSameFile,
    clamp,
} from './utils.js';
import { extension_settings, renderExtensionTemplateAsync, saveMetadataDebounced } from './extensions.js';
import { POPUP_RESULT, POPUP_TYPE, Popup, callGenericPopup } from './popup.js';
import { ScraperManager } from './scrapers.js';
import { DragAndDropHandler } from './dragdrop.js';
import { renderTemplateAsync } from './templates.js';
import { t } from './i18n.js';
import { humanizedDateTime } from './RossAscends-mods.js';
import { accountStorage } from './util/AccountStorage.js';
import { MEDIA_DISPLAY, MEDIA_SOURCE, MEDIA_TYPE, SCROLL_BEHAVIOR, SWIPE_DIRECTION } from './constants.js';

/**
 * @typedef {object} FileAttachment
 * @property {string} url File URL
 * @property {number} size File size
 * @property {string} name File name
 * @property {number} created Timestamp
 * @property {string} [text] File text
 */

/**
 * @typedef {function} ConverterFunction
 * @param {File} file File object
 * @returns {Promise<string>} Converted file text
 */

const fileSizeLimit = 1024 * 1024 * 350; // 350 MB
const ATTACHMENT_SOURCE = {
    GLOBAL: 'global',
    CHARACTER: 'character',
    CHAT: 'chat',
};

/**
 * @type {Record<string, ConverterFunction>} File converters
 */
const converters = {
    'application/pdf': extractTextFromPDF,
    'text/html': extractTextFromHTML,
    'text/markdown': extractTextFromMarkdown,
    'application/epub+zip': extractTextFromEpub,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': extractTextFromOffice,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': extractTextFromOffice,
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': extractTextFromOffice,
    'application/vnd.oasis.opendocument.text': extractTextFromOffice,
    'application/vnd.oasis.opendocument.presentation': extractTextFromOffice,
    'application/vnd.oasis.opendocument.spreadsheet': extractTextFromOffice,
};

/**
 * Finds a matching key in the converters object.
 * @param {string} type MIME type
 * @returns {string} Matching key
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
function findConverterKey(type) {
    return Object.keys(converters).find((key) => {
        // Match exact type
        if (type === key) {
            return true;
        }

        // Match wildcards
        if (key.endsWith('*')) {
            return type.startsWith(key.substring(0, key.length - 1));
        }

        return false;
    });
}

/**
 * Determines if the file type has a converter function.
 * @param {string} type MIME type
 * @returns {boolean} True if the file type is convertible, false otherwise.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
function isConvertible(type) {
    return Boolean(findConverterKey(type));
}

/**
 * Gets the converter function for a file type.
 * @param {string} type MIME type
 * @returns {ConverterFunction} Converter function
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
function getConverter(type) {
    const key = findConverterKey(type);
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    return key && converters[key];
}

/**
 * Mark a range of messages as hidden ("is_system") or not.
 * @param {number} start Starting message ID
 * @param {number} end Ending message ID (inclusive)
 * @param {boolean} unhide If true, unhide the messages instead.
 * @param {string} nameFitler Optional name filter
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'start' implicitly has an 'any' type.
export async function hideChatMessageRange(start, end, unhide, nameFitler = null) {
    if (isNaN(start)) return;
    if (!end) end = start;
    const hide = !unhide;

    for (let messageId = start; messageId <= end; messageId++) {
        const message = chat[messageId];
        if (!message) continue;
        // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
        if (nameFitler && message.name !== nameFitler) continue;

        // @ts-expect-error TS(2339) FIXME: Property 'is_system' does not exist on type 'never... Remove this comment to see the full error message
        message.is_system = hide;

        // Also toggle "hidden" state for all visible messages
        const messageBlock = document.querySelector(`.mes[mesid="${messageId}"]`);
        if (!messageBlock) continue;
        messageBlock.setAttribute('is_system', String(hide));
    }

    // Reload swipes. Useful when a last message is hidden.
    refreshSwipeButtons();

    await saveChatConditional();
}

/**
 * Mark message as hidden (system message).
 * @deprecated Use hideChatMessageRange.
 * @param {number} messageId Message ID
 * @param {JQuery<Element>} _messageBlock Unused
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'messageId' implicitly has an 'any' type... Remove this comment to see the full error message
export async function hideChatMessage(messageId, _messageBlock) {
    return hideChatMessageRange(messageId, messageId, false);
}

/**
 * Mark message as visible (non-system message).
 * @deprecated Use hideChatMessageRange.
 * @param {number} messageId Message ID
 * @param {JQuery<Element>} _messageBlock Unused
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'messageId' implicitly has an 'any' type... Remove this comment to see the full error message
export async function unhideChatMessage(messageId, _messageBlock) {
    return hideChatMessageRange(messageId, messageId, true);
}

/**
 * Adds a file attachment to the message.
 * @param {ChatMessage} message Message object
 * @param inputId
 * @returns {Promise<void>} A promise that resolves when file is uploaded.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'message' implicitly has an 'any' type.
export async function populateFileAttachment(message, inputId = 'file_form_input') {
    try {
        if (!message) return;
        if (!message.extra || typeof message.extra !== 'object') message.extra = {};
        const fileInput = document.getElementById(inputId);
        if (!(fileInput instanceof HTMLInputElement)) return;

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        for (const file of fileInput.files) {
            const slug = getStringHash(file.name);
            const fileNamePrefix = `${Date.now()}_${slug}`;
            const fileBase64 = await getBase64Async(file);
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            let base64Data = fileBase64.split(',')[1];
            const extension = getFileExtension(file);

            const mediaType = MEDIA_TYPE.getFromMime(file.type);
            if (mediaType) {
                const imageUrl = await saveBase64AsFile(base64Data, name2, fileNamePrefix, extension);
                if (!Array.isArray(message.extra.media)) {
                    message.extra.media = [];
                }
                /** @type {MediaAttachment} */
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
                        const fileText = await converter(file);
                        base64Data = convertTextToBase64(fileText);
                    } catch (error) {
                        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                        toastr.error(String(error), t`Could not convert file`);
                        console.error('Could not convert file', error);
                    }
                }

                const fileUrl = await uploadFileAttachment(uniqueFileName, base64Data);

                if (!fileUrl) {
                    continue;
                }

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
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`Either the file is corrupted or its format is not supported.`, t`Could not upload the file`);
    } finally {
        // @ts-expect-error TS(2339) FIXME: Property 'reset' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        document.getElementById('file_form')?.reset();
    }
}

/**
 * Uploads file to the server.
 * @param {string} fileName
 * @param {string} base64Data
 * @returns {Promise<string>} File URL
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'fileName' implicitly has an 'any' type.
export async function uploadFileAttachment(fileName, base64Data) {
    try {
        const result = await fetch('/api/files/upload', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                name: fileName,
                data: base64Data,
            }),
        });

        if (!result.ok) {
            const error = await result.text();
            throw new Error(error);
        }

        const responseData = await result.json();
        return responseData.path;
    } catch (error) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(String(error), t`Could not upload file`);
        console.error('Could not upload file', error);
    }
}

/**
 * Downloads file from the server.
 * @param {string} url File URL
 * @returns {Promise<string>} File text
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'url' implicitly has an 'any' type.
export async function getFileAttachment(url) {
    try {
        const result = await fetch(url, {
            method: 'GET',
            cache: 'force-cache',
            headers: getRequestHeaders(),
        });

        if (!result.ok) {
            const error = await result.text();
            throw new Error(error);
        }

        const text = await result.text();
        return text;
    } catch (error) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(error, t`Could not download file`);
        console.error('Could not download file', error);
    }
}

/**
 * Validates file to make sure it is not binary or not image.
 * @param {File} file File object
 * @returns {Promise<boolean>} True if file is valid, false otherwise.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'file' implicitly has an 'any' type.
async function validateFile(file) {
    const fileText = await file.text();
    const isMedia = file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/');
    const isBinary = /^[\x00-\x08\x0E-\x1F\x7F-\xFF]*$/.test(fileText);

    if (!isMedia && file.size > fileSizeLimit) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`File is too big. Maximum size is ${humanFileSize(fileSizeLimit)}.`);
        return false;
    }

    // If file is binary
    if (isBinary && !isMedia && !isConvertible(file.type)) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`Binary files are not supported. Select a text file or image.`);
        return false;
    }

    return true;
}

/**
 *
 */
export function hasPendingFileAttachment() {
    const fileInput = document.getElementById('file_form_input');
    if (!(fileInput instanceof HTMLInputElement)) return false;
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    return fileInput.files.length > 0;
}

/**
 * Displays file information in the message sending form.
 * @param {FileList} fileList File object
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'fileList' implicitly has an 'any' type.
async function onFileAttach(fileList) {
    if (!fileList || fileList.length === 0) return;

    for (const file of fileList) {
        const isValid = await validateFile(file);

        // If file is binary
        if (!isValid) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.warning(t`File ${file.name} is not supported.`);
            // @ts-expect-error TS(2339) FIXME: Property 'reset' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            document.getElementById('file_form')?.reset();
            return;
        }
    }

    const name = fileList.length === 1 ? fileList[0].name : t`${fileList.length} files selected`;
    const size = [...fileList].reduce((acc, file) => acc + file.size, 0);
    const title = [...fileList].map(x => x.name).join('\n');
    
    const fileNameEl = document.querySelector('#file_form .file_name');
    if (fileNameEl) {
        fileNameEl.textContent = name;
        // @ts-expect-error TS(2339) FIXME: Property 'title' does not exist on type 'Element'.
        fileNameEl.title = title;
    }
    const fileSizeEl = document.querySelector('#file_form .file_size');
    if (fileSizeEl) {
        fileSizeEl.textContent = humanFileSize(size);
        // @ts-expect-error TS(2339) FIXME: Property 'title' does not exist on type 'Element'.
        fileSizeEl.title = size;
    }
    document.getElementById('file_form')?.classList.remove('displayNone');

    // Reset form on chat change (if not on a welcome screen)
    const currentChatId = getCurrentChatId();
    if (currentChatId) {
        eventSource.once(event_types.CHAT_CHANGED, () => {
            // @ts-expect-error TS(2339) FIXME: Property 'reset' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            document.getElementById('file_form')?.reset();
        });
    }
}

/**
 * Deletes file from a message.
 * @param {JQuery<HTMLElement>} messageBlock Message block element
 * @param {number} messageId Message ID
 * @param {number} fileIndex File index
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'messageBlock' implicitly has an 'any' t... Remove this comment to see the full error message
async function deleteMessageFile(messageBlock, messageId, fileIndex) {
    if (isNaN(messageId) || isNaN(fileIndex)) {
        console.warn('Invalid message ID or file index');
        return;
    }

    const confirm = await callGenericPopup('Are you sure you want to delete this file?', POPUP_TYPE.CONFIRM);

    if (confirm !== POPUP_RESULT.AFFIRMATIVE) {
        console.debug('Delete file cancelled');
        return;
    }

    const message = chat[messageId];

    // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
    if (!Array.isArray(message?.extra?.files)) {
        console.debug('Message has no files');
        return;
    }

    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    if (fileIndex < 0 || fileIndex >= message.extra.files.length) {
        console.warn('Invalid file index for message');
        return;
    }

    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    const url = message.extra.files[fileIndex]?.url;
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    message.extra.files.splice(fileIndex, 1);

    await saveChatConditional();
    await deleteFileFromServer(url);

    appendMediaToMessage(message, messageBlock, SCROLL_BEHAVIOR.KEEP);
}

/**
 * Opens file from message in a modal.
 * @param {number} messageId Message ID
 * @param {number} fileIndex File index
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'messageId' implicitly has an 'any' type... Remove this comment to see the full error message
async function viewMessageFile(messageId, fileIndex) {
    if (isNaN(messageId) || isNaN(fileIndex)) {
        console.warn('Invalid message ID or file index');
        return;
    }

    const message = chat[messageId];

    // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
    if (!Array.isArray(message?.extra?.files)) {
        console.debug('Message has no files');
        return;
    }

    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    if (fileIndex < 0 || fileIndex >= message.extra.files.length) {
        console.warn('Invalid file index for message');
        return;
    }

    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    const messageFile = message.extra.files[fileIndex];

    if (!messageFile) {
        console.debug('Message has no file or it is empty');
        return;
    }

    await openFilePopup(messageFile);
}

/**
 * Inserts a file embed into the message.
 * @param {number} messageId
 * @param {JQuery<HTMLElement>} messageBlock
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'messageId' implicitly has an 'any' type... Remove this comment to see the full error message
function embedMessageFile(messageId, messageBlock) {
    const message = chat[messageId];

    if (!message) {
        console.warn('Failed to find message with id', messageId);
        return;
    }

    const embedInput = document.getElementById('embed_file_input');
    if (embedInput instanceof HTMLInputElement) {
        const clonedInput = embedInput.cloneNode(true);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        embedInput.parentNode.replaceChild(clonedInput, embedInput);
        clonedInput.addEventListener('change', parseAndUploadEmbed);
        // @ts-expect-error TS(2339) FIXME: Property 'click' does not exist on type 'Node'.
        clonedInput.click();
    }

    /**
     *
     * @param e
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
    async function parseAndUploadEmbed(/** @type {JQuery.ChangeEvent} */ e) {
        if (!(e.target instanceof HTMLInputElement)) return;
        if (!e.target.files.length) return;

        for (const file of e.target.files) {
            const isValid = await validateFile(file);

            if (!isValid) {
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.warning(t`File ${file.name} is not supported.`);
                // @ts-expect-error TS(2339) FIXME: Property 'reset' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
                document.getElementById('file_form')?.reset();
                return;
            }
        }

        await populateFileAttachment(message, 'embed_file_input');
        await eventSource.emit(event_types.MESSAGE_FILE_EMBEDDED, messageId);
        appendMediaToMessage(message, messageBlock, SCROLL_BEHAVIOR.KEEP);
        await saveChatConditional();
    }
}

/**
 * Appends file content to the message text.
 * @param {ChatMessage} message Message object
 * @param {string} messageText Message text
 * @returns {Promise<string>} Message text with file content appended.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'message' implicitly has an 'any' type.
export async function appendFileContent(message, messageText) {
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
        const mergedFileTexts = fileTexts.join('\n\n') + '\n\n';
        message.extra.fileLength = mergedFileTexts.length;
        return mergedFileTexts + messageText;
    }
    return messageText;
}

/**
 * Replaces style tags in the message text with custom tags with encoded content.
 * @param {string} text
 * @returns {string} Encoded message text
 * @copyright https://github.com/kwaroran/risuAI
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'text' implicitly has an 'any' type.
export function encodeStyleTags(text) {
    const styleRegex = /<style>(.+?)<\/style>/gims;
    // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
    return text.replaceAll(styleRegex, (_, match) => {
        return `<custom-style>${encodeURIComponent(match)}</custom-style>`;
    });
}

/**
 * Sanitizes custom style tags in the message text to prevent DOM pollution.
 * @param {string} text Message text
 * @param {object} options Options object
 * @param {string} options.prefix Prefix the selectors with this value
 * @returns {string} Sanitized message text
 * @copyright https://github.com/kwaroran/risuAI
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'text' implicitly has an 'any' type.
export function decodeStyleTags(text, { prefix } = { prefix: '.mes_text ' }) {
    const styleDecodeRegex = /<custom-style>(.+?)<\/custom-style>/gms;
    const mediaAllowed = isExternalMediaAllowed();

    /**
     *
     * @param rule
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'rule' implicitly has an 'any' type.
    function sanitizeRule(rule) {
        if (Array.isArray(rule.selectors)) {
            for (let i = 0; i < rule.selectors.length; i++) {
                const selector = rule.selectors[i];
                if (selector) {
                    rule.selectors[i] = prefix + sanitizeSelector(selector);
                }
            }
        }
        if (!mediaAllowed && Array.isArray(rule.declarations) && rule.declarations.length > 0) {
            // @ts-expect-error TS(7006) FIXME: Parameter 'declaration' implicitly has an 'any' ty... Remove this comment to see the full error message
            rule.declarations = rule.declarations.filter(declaration => !declaration.value.includes('://'));
        }
    }

    /**
     *
     * @param selector
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'selector' implicitly has an 'any' type.
    function sanitizeSelector(selector) {
        // Handle pseudo-classes that can contain nested selectors
        const pseudoClasses = ['has', 'not', 'where', 'is', 'matches', 'any'];
        const pseudoRegex = new RegExp(`:(${pseudoClasses.join('|')})\\(([^)]+)\\)`, 'g');

        // First, sanitize any nested selectors within pseudo-classes
        // @ts-expect-error TS(7006) FIXME: Parameter 'match' implicitly has an 'any' type.
        selector = selector.replace(pseudoRegex, (match, pseudoClass, content) => {
            // Recursively sanitize the content within the pseudo-class
            const sanitizedContent = sanitizeSimpleSelector(content);
            return `:${pseudoClass}(${sanitizedContent})`;
        });

        // Then sanitize the main selector parts
        return sanitizeSimpleSelector(selector);
    }

    /**
     *
     * @param selector
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'selector' implicitly has an 'any' type.
    function sanitizeSimpleSelector(selector) {
        // Split by spaces but preserve complex selectors
        // @ts-expect-error TS(7006) FIXME: Parameter 'part' implicitly has an 'any' type.
        return selector.split(/\s+/).map((part) => {
            // Handle class selectors, but preserve pseudo-classes and other complex parts
            // @ts-expect-error TS(7006) FIXME: Parameter 'match' implicitly has an 'any' type.
            return part.replace(/\.([\w-]+)/g, (match, className) => {
                // Don't modify if it's already prefixed with 'custom-'
                if (className.startsWith('custom-')) {
                    return match;
                }
                return `.custom-${className}`;
            });
        }).join(' ');
    }

    /**
     *
     * @param ruleSet
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'ruleSet' implicitly has an 'any' type.
    function sanitizeRuleSet(ruleSet) {
        if (Array.isArray(ruleSet.selectors) || Array.isArray(ruleSet.declarations)) {
            sanitizeRule(ruleSet);
        }

        if (Array.isArray(ruleSet.rules)) {
            // @ts-expect-error TS(7006) FIXME: Parameter 'rule' implicitly has an 'any' type.
            ruleSet.rules = ruleSet.rules.filter(rule => rule.type !== 'import');

            for (const mediaRule of ruleSet.rules) {
                sanitizeRuleSet(mediaRule);
            }
        }
    }

    // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
    return text.replaceAll(styleDecodeRegex, (_, style) => {
        try {
            const styleCleaned = decodeURIComponent(style).replaceAll(/<br\/>/g, '');
            const ast = css.parse(styleCleaned);
            const sheet = ast?.stylesheet;
            if (sheet) {
                sanitizeRuleSet(ast.stylesheet);
            }
            return `<style>${css.stringify(ast)}</style>`;
        } catch (error) {
            return `CSS ERROR: ${error}`;
        }
    });
}

/**
 * Class to manage style preferences for characters.
 */
class StylesPreference {
    avatarId: string | null;
    /**
     * Creates a new StylesPreference instance.
     * @param {string|null} avatarId - The avatar ID of the character
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'avatarId' implicitly has an 'any' type.
    constructor(avatarId) {
        this.avatarId = avatarId;
    }

    /**
     * Gets the account storage key for the style preference.
     */
    get key() {
        return `AllowGlobalStyles-${this.avatarId}`;
    }

    /**
     * Checks if a preference exists for this character.
     * @returns {boolean} True if preference exists, false otherwise
     */
    exists() {
        return this.avatarId
            ? accountStorage.getItem(this.key) !== null
            : true; // No character == assume preference is set
    }

    /**
     * Gets the current style preference.
     * @returns {boolean} True if global styles are allowed, false otherwise
     */
    get() {
        return this.avatarId
            ? accountStorage.getItem(this.key) === 'true'
            : false; // Always disabled when creating a new character
    }

    /**
     * Sets the global styles preference.
     * @param {boolean} allowed - Whether global styles are allowed
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'allowed' implicitly has an 'any' type.
    set(allowed) {
        if (this.avatarId) {
            accountStorage.setItem(this.key, String(allowed));
        }
    }
}

/**
 * Formats creator notes in the message text.
 * @param {string} text Raw Markdown text
 * @param {string} avatarId Avatar ID
 * @returns {string} Formatted HTML text
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'text' implicitly has an 'any' type.
export function formatCreatorNotes(text, avatarId) {
    const preference = new StylesPreference(avatarId);
    const sanitizeStyles = !preference.get();
    const decodeStyleParam = { prefix: sanitizeStyles ? '#creator_notes_spoiler ' : '' };
    /** @type {DOMPurify.Config} */
    const config = {
        RETURN_DOM: false,
        RETURN_DOM_FRAGMENT: false,
        RETURN_TRUSTED_TYPE: false,
        MESSAGE_SANITIZE: true,
        ADD_TAGS: ['custom-style'],
    };

    let html = converter.render(substituteParams(text));
    html = encodeStyleTags(html);
    html = DOMPurify.sanitize(html, config);
    html = decodeStyleTags(html, decodeStyleParam);

    return html;
}

/**
 *
 */
async function openGlobalStylesPreferenceDialog() {
    // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
    if (selected_group) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info(t`To change the global styles preference, please select a character individually.`);
        return;
    }

    const entityId = getCurrentEntityId();
    const preference = new StylesPreference(entityId);
    const currentValue = preference.get();

    const templateHTML = await renderTemplateAsync('globalStylesPreference');
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = templateHTML;
    const template = tempDiv.firstElementChild;

    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    const allowedRadio = template.querySelector('#global_styles_allowed');
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    const forbiddenRadio = template.querySelector('#global_styles_forbidden');

    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    allowedRadio.addEventListener('change', () => {
        preference.set(true);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        allowedRadio.checked = true;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        forbiddenRadio.checked = false;
    });

    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    forbiddenRadio.addEventListener('change', () => {
        preference.set(false);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        allowedRadio.checked = false;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        forbiddenRadio.checked = true;
    });

    const currentPreferenceRadio = currentValue ? allowedRadio : forbiddenRadio;
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    currentPreferenceRadio.checked = true;

    await callGenericPopup(template, POPUP_TYPE.TEXT, '', { wide: false, large: false });

    // Re-render the notes if the preference changed
    const newValue = preference.get();
    if (newValue !== currentValue) {
        document.getElementById('rm_button_selected_ch')?.click();
        setGlobalStylesButtonClass(newValue);
    }
}

/**
 *
 */
async function checkForCreatorNotesStyles() {
    // Don't do anything if in group chat or not in a chat
    // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
    if (selected_group || this_chid === undefined) {
        return;
    }

    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    const notes = characters[this_chid].data?.creator_notes || characters[this_chid].creatorcomment;
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    const avatarId = characters[this_chid].avatar;
    const styleContents = getStyleContentsFromMarkdown(notes);

    if (!styleContents) {
        setGlobalStylesButtonClass(null);
        return;
    }

    const preference = new StylesPreference(avatarId);
    const hasPreference = preference.exists();
    if (!hasPreference) {
        const templateHTML = await renderTemplateAsync('globalStylesPopup');
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = templateHTML;
        const template = tempDiv.firstElementChild;
        
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const textarea = template.querySelector('textarea');
        if (textarea) textarea.value = styleContents;

        const confirmResult = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '', {
            wide: false,
            large: false,
            okButton: t`Just to Creator's Notes`,
            cancelButton: t`Apply to the entire app`,
        });

        switch (confirmResult) {
            case POPUP_RESULT.AFFIRMATIVE:
                preference.set(false);
                break;
            case POPUP_RESULT.NEGATIVE:
                preference.set(true);
                break;
            case POPUP_RESULT.CANCELLED:
                preference.set(false);
                break;
        }

        document.getElementById('rm_button_selected_ch')?.click();
    }

    const currentPreference = preference.get();
    setGlobalStylesButtonClass(currentPreference);
}

/**
 * Sets the class of the global styles button based on the state.
 * @param {boolean|null} state State of the button
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'state' implicitly has an 'any' type.
function setGlobalStylesButtonClass(state) {
    const button = document.getElementById('creators_note_styles_button');
    button?.classList.toggle('empty', state === null);
    button?.classList.toggle('allowed', state === true);
    button?.classList.toggle('forbidden', state === false);
}

/**
 * Extracts the contents of all style elements from the Markdown text.
 * @param {string} text Markdown text
 * @returns {string} The joined contents of all style elements
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'text' implicitly has an 'any' type.
function getStyleContentsFromMarkdown(text) {
    if (!text) {
        return '';
    }

    const html = converter.render(substituteParams(text));
    const parsedDocument = new DOMParser().parseFromString(html, 'text/html');
    const styleElements = Array.from(parsedDocument.querySelectorAll('style'));
    return styleElements
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        .filter(s => s.textContent.trim().length > 0)
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        .map(s => s.textContent.trim())
        .join('\n\n');
}

/**
 *
 */
async function openExternalMediaOverridesDialog() {
    const entityId = getCurrentEntityId();

    if (!entityId) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info(t`No character or group selected`);
        return;
    }

    const templateHTML = await renderTemplateAsync('forbidMedia');
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = templateHTML;
    const template = tempDiv.firstElementChild;

    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    const forbiddenEl = template.querySelector('.forbid_media_global_state_forbidden');
    // @ts-expect-error TS(2339) FIXME: Property 'style' does not exist on type 'Element'.
    if (forbiddenEl) forbiddenEl.style.display = power_user.forbid_external_media ? 'block' : 'none';
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    const allowedEl = template.querySelector('.forbid_media_global_state_allowed');
    // @ts-expect-error TS(2339) FIXME: Property 'style' does not exist on type 'Element'.
    if (allowedEl) allowedEl.style.display = !power_user.forbid_external_media ? 'block' : 'none';

    // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
    if (power_user.external_media_allowed_overrides.includes(entityId)) {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const overrideAllowed = template.querySelector('#forbid_media_override_allowed');
        // @ts-expect-error TS(2339) FIXME: Property 'checked' does not exist on type 'Element... Remove this comment to see the full error message
        if (overrideAllowed) overrideAllowed.checked = true;
    // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
    } else if (power_user.external_media_forbidden_overrides.includes(entityId)) {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const overrideForbidden = template.querySelector('#forbid_media_override_forbidden');
        // @ts-expect-error TS(2339) FIXME: Property 'checked' does not exist on type 'Element... Remove this comment to see the full error message
        if (overrideForbidden) overrideForbidden.checked = true;
    } else {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const overrideGlobal = template.querySelector('#forbid_media_override_global');
        // @ts-expect-error TS(2339) FIXME: Property 'checked' does not exist on type 'Element... Remove this comment to see the full error message
        if (overrideGlobal) overrideGlobal.checked = true;
    }

    callGenericPopup(template, POPUP_TYPE.TEXT, '', { wide: false, large: false });
}

/**
 *
 */
export function getCurrentEntityId() {
    // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
    if (selected_group) {
        // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
        return String(selected_group);
    }

    // @ts-expect-error TS(2339) FIXME: Property 'avatar' does not exist on type 'never'.
    return characters[this_chid]?.avatar ?? null;
}

/**
 *
 */
export function isExternalMediaAllowed() {
    const entityId = getCurrentEntityId();
    if (!entityId) {
        return !power_user.forbid_external_media;
    }

    // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
    if (power_user.external_media_allowed_overrides.includes(entityId)) {
        return true;
    }

    // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
    if (power_user.external_media_forbidden_overrides.includes(entityId)) {
        return false;
    }

    return !power_user.forbid_external_media;
}

/**
 * Expands the message media attachment.
 * @param {number} messageId Message ID
 * @param {number} mediaIndex Media index
 * @returns {HTMLElement} Enlarged media element
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'messageId' implicitly has an 'any' type... Remove this comment to see the full error message
function expandMessageMedia(messageId, mediaIndex) {
    if (isNaN(messageId) || isNaN(mediaIndex)) {
        console.warn('Invalid message ID or media index');
        return;
    }

    /** @type {ChatMessage} */
    const message = chat[messageId];

    // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
    if (!Array.isArray(message?.extra?.media) || message.extra.media.length === 0) {
        console.warn('Message has no media to expand');
        return;
    }

    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    const mediaAttachment = message.extra.media[mediaIndex];
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    const title = mediaAttachment.title || message.extra.title || '';

    if (!mediaAttachment) {
        return;
    }

    if (mediaAttachment.type === MEDIA_TYPE.AUDIO) {
        console.warn('Audio media cannot be expanded');
        return;
    }

    /**
     * Gets the media element based on its type.
     * @returns {HTMLElement} Media element
     */
    function getMediaElement() {
        /**
         *
         */
        function getImageElement() {
            const img = document.createElement('img');
            img.src = mediaAttachment.url;
            img.classList.add('img_enlarged');
            return img;
        }

        /**
         *
         */
        function getVideoElement() {
            const video = document.createElement('video');
            video.src = mediaAttachment.url;
            video.classList.add('img_enlarged');
            video.controls = true;
            video.autoplay = true;
            return video;
        }

        switch (mediaAttachment.type) {
            case MEDIA_TYPE.IMAGE:
                return getImageElement();
            case MEDIA_TYPE.VIDEO:
                return getVideoElement();
        }

        console.warn('Unsupported media type for enlargement:', mediaAttachment.type);
        return getImageElement();
    }

    const mediaElement = getMediaElement();
    const mediaHolder = document.createElement('div');
    mediaHolder.classList.add('img_enlarged_holder');
    mediaHolder.append(mediaElement);
    const mediaContainer = document.createElement('div');
    mediaContainer.classList.add('img_enlarged_container');
    mediaContainer.append(mediaHolder);

    mediaElement.addEventListener('click', event => {
        const shouldZoom = !mediaElement.classList.contains('zoomed') && mediaElement.nodeName === 'IMG';
        mediaElement.classList.toggle('zoomed', shouldZoom);
        event.stopPropagation();
    });

    if (title.trim().length > 0) {
        const mediaTitlePre = document.createElement('pre');
        const mediaTitleCode = document.createElement('code');
        mediaTitleCode.classList.add('img_enlarged_title', 'txt');
        mediaTitleCode.textContent = title;
        mediaTitlePre.append(mediaTitleCode);
        mediaTitleCode.addEventListener('click', event => {
            event.stopPropagation();
        });
        mediaContainer.append(mediaTitlePre);
        addCopyToCodeBlocks(mediaContainer);
    }

    const popup = new Popup(mediaContainer, POPUP_TYPE.DISPLAY, '', { large: true, transparent: true });

    popup.dlg.style.width = 'unset';
    popup.dlg.style.height = 'unset';
    popup.dlg.addEventListener('click', () => {
        popup.completeCancelled();
    });

    popup.show();
    return mediaElement;
}

/**
 * Deletes an image from a message.
 * @param {number} messageId Message ID
 * @param {number} mediaIndex Image index
 * @param {JQuery<HTMLElement>} messageBlock Message block element
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'messageId' implicitly has an 'any' type... Remove this comment to see the full error message
async function deleteMessageMedia(messageId, mediaIndex, messageBlock) {
    if (isNaN(messageId) || isNaN(mediaIndex)) {
        console.warn('Invalid message ID or media index');
        return;
    }

    const deleteUrls = [];
    const deleteFromServerId = 'delete_media_files_checkbox';
    let deleteFromServer = true;

    const value = await Popup.show.confirm(t`Delete media from message?`, t`This action can't be undone.`, {
        okButton: t`Delete one`,
        cancelButton: false,
        customButtons: [
            {
                text: t`Delete all`,
                appendAtEnd: true,
                result: POPUP_RESULT.CUSTOM1,
            },
            {
                text: t`Cancel`,
                appendAtEnd: true,
                result: POPUP_RESULT.CANCELLED,
            },
        ],
        customInputs: [
            {
                type: 'checkbox',
                label: t`Also delete files from server`,
                id: deleteFromServerId,
                defaultState: true,
            },
        ],
        // @ts-expect-error TS(7006) FIXME: Parameter 'popup' implicitly has an 'any' type.
        onClose: (popup) => {
            deleteFromServer = Boolean(popup.inputResults.get(deleteFromServerId) ?? false);
        },
    });

    if (!value) {
        return;
    }

    /** @type {ChatMessage} */
    const message = chat[messageId];

    // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
    if (!Array.isArray(message?.extra?.media)) {
        console.debug('Message has no media');
        return;
    }

    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    if (mediaIndex < 0 || mediaIndex >= message.extra.media.length) {
        console.warn('Invalid media index for message');
        return;
    }

    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    deleteUrls.push(message.extra.media[mediaIndex].url);
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    message.extra.media.splice(mediaIndex, 1);

    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    if (message.extra.media_index === mediaIndex) {
        const newIndex = mediaIndex > 0 ? mediaIndex - 1 : 0;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        message.extra.media_index = clamp(newIndex, 0, message.extra.media.length - 1);
    }

    if (value === POPUP_RESULT.CUSTOM1) {
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        for (const media of message.extra.media) {
            deleteUrls.push(media.url);
        }
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        delete message.extra.media;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        delete message.extra.inline_image;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        delete message.extra.title;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
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

/**
 * Switches the media display mode for a message.
 * @param {number} messageId Message ID
 * @param {JQuery<HTMLElement>} messageBlock Message block element
 * @param {MEDIA_DISPLAY} targetDisplay Target display mode
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'messageId' implicitly has an 'any' type... Remove this comment to see the full error message
async function switchMessageMediaDisplay(messageId, messageBlock, targetDisplay) {
    if (isNaN(messageId)) {
        console.warn('Invalid message ID');
        return;
    }

    /** @type {ChatMessage} */
    const message = chat[messageId];

    if (!message) {
        console.warn('Message not found for ID', messageId);
        return;
    }

    // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
    if (!message.extra || typeof message.extra !== 'object') {
        // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
        message.extra = {};
    }

    // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
    message.extra.media_display = targetDisplay;
    await saveChatConditional();
    appendMediaToMessage(message, messageBlock, SCROLL_BEHAVIOR.KEEP);
}

/**
 * Deletes media file from the server.
 * @param {string} url Path to the media file on the server
 * @param {boolean} [silent] If true, do not show error messages
 * @returns {Promise<boolean>} True if media file was deleted, false otherwise.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'url' implicitly has an 'any' type.
export async function deleteMediaFromServer(url, silent = false) {
    try {
        const result = await fetch('/api/images/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ path: url }),
        });

        if (!result.ok) {
            if (!silent) {
                const error = await result.text();
                throw new Error(error);
            }
            return false;
        }

        await eventSource.emit(event_types.MEDIA_ATTACHMENT_DELETED, url);
        return true;
    } catch (error) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(String(error), t`Could not delete image`);
        console.error('Could not delete image', error);
        return false;
    }
}

/**
 * Deletes file from the server.
 * @param {string} url Path to the file on the server
 * @param {boolean} [silent] If true, do not show error messages
 * @returns {Promise<boolean>} True if file was deleted, false otherwise.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'url' implicitly has an 'any' type.
export async function deleteFileFromServer(url, silent = false) {
    try {
        const result = await fetch('/api/files/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ path: url }),
        });

        if (!result.ok) {
            if (!silent) {
                const error = await result.text();
                throw new Error(error);
            }
            return false;
        }

        await eventSource.emit(event_types.FILE_ATTACHMENT_DELETED, url);
        return true;
    } catch (error) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(String(error), t`Could not delete file`);
        console.error('Could not delete file', error);
        return false;
    }
}

/**
 * Opens file attachment in a modal.
 * @param {FileAttachment} attachment File attachment
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'attachment' implicitly has an 'any' typ... Remove this comment to see the full error message
async function openFilePopup(attachment) {
    const fileText = attachment.text || (await getFileAttachment(attachment.url));

    const modalTemplate = document.createElement('div');
    modalTemplate.innerHTML = '<pre><code></code></pre>';
    const codeEl = modalTemplate.querySelector('code');
    if (codeEl) {
        codeEl.classList.add('txt');
        codeEl.textContent = fileText;
    }
    modalTemplate.classList.add('file_modal', 'textarea_compact', 'fontsize90p');
    addCopyToCodeBlocks(modalTemplate);

    callGenericPopup(modalTemplate, POPUP_TYPE.TEXT, '', { wide: true, large: true });
}

/**
 * Edit a file attachment in a notepad-like modal.
 * @param {FileAttachment} attachment Attachment to edit
 * @param {string} source Attachment source
 * @param {function} callback Callback function
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'attachment' implicitly has an 'any' typ... Remove this comment to see the full error message
async function editAttachment(attachment, source, callback) {
    const originalFileText = attachment.text || (await getFileAttachment(attachment.url));
    const templateHTML = await renderExtensionTemplateAsync('attachments', 'notepad');
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = templateHTML;
    const template = tempDiv.firstElementChild;

    let editedFileText = originalFileText;
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    const contentInput = template.querySelector('[name="notepadFileContent"]');
    if (contentInput instanceof HTMLInputElement || contentInput instanceof HTMLTextAreaElement) {
        contentInput.value = editedFileText;
        contentInput.addEventListener('input', function () {
            // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
            editedFileText = String(this.value);
        });
    }

    let editedFileName = attachment.name;
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    const nameInput = template.querySelector('[name="notepadFileName"]');
    if (nameInput instanceof HTMLInputElement) {
        nameInput.value = editedFileName;
        nameInput.addEventListener('input', function () {
            editedFileName = String(this.value);
        });
    }

    const result = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '', { wide: true, large: true, okButton: 'Save', cancelButton: 'Cancel' });

    if (result !== POPUP_RESULT.AFFIRMATIVE) {
        return;
    }

    if (editedFileText === originalFileText && editedFileName === attachment.name) {
        return;
    }

    const nullCallback = () => { };
    await deleteAttachment(attachment, source, nullCallback, false);
    const file = new File([editedFileText], editedFileName, { type: 'text/plain' });
    await uploadFileAttachmentToServer(file, source);

    callback();
}

/**
 * Downloads an attachment to the user's device.
 * @param {FileAttachment} attachment Attachment to download
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'attachment' implicitly has an 'any' typ... Remove this comment to see the full error message
async function downloadAttachment(attachment) {
    const fileText = attachment.text || (await getFileAttachment(attachment.url));
    const blob = new Blob([fileText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = attachment.name;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Removes an attachment from the disabled list.
 * @param {FileAttachment} attachment Attachment to enable
 * @param {function} callback Success callback
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'attachment' implicitly has an 'any' typ... Remove this comment to see the full error message
function enableAttachment(attachment, callback) {
    ensureAttachmentsExist();
    extension_settings.disabled_attachments = extension_settings.disabled_attachments.filter(url => url !== attachment.url);
    saveSettingsDebounced();
    callback();
}

/**
 * Adds an attachment to the disabled list.
 * @param {FileAttachment} attachment Attachment to disable
 * @param {function} callback Success callback
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'attachment' implicitly has an 'any' typ... Remove this comment to see the full error message
function disableAttachment(attachment, callback) {
    ensureAttachmentsExist();
    // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
    extension_settings.disabled_attachments.push(attachment.url);
    saveSettingsDebounced();
    callback();
}

/**
 * Moves a file attachment to a different source.
 * @param {FileAttachment} attachment Attachment to moves
 * @param {string} source Source of the attachment
 * @param {function} callback Success callback
 * @returns {Promise<void>} A promise that resolves when the attachment is moved.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'attachment' implicitly has an 'any' typ... Remove this comment to see the full error message
async function moveAttachment(attachment, source, callback) {
    let selectedTarget = source;
    const targets = getAvailableTargets();
    const templateHTML = await renderExtensionTemplateAsync('attachments', 'move-attachment', { name: attachment.name, targets });
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = templateHTML;
    const template = tempDiv.firstElementChild;

    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    const targetInput = template.querySelector('.moveAttachmentTarget');
    if (targetInput instanceof HTMLInputElement) {
        targetInput.value = source;
        targetInput.addEventListener('input', function () {
            selectedTarget = String(this.value);
        });
    }

    const result = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '', { wide: false, large: false, okButton: 'Move', cancelButton: 'Cancel' });

    if (result !== POPUP_RESULT.AFFIRMATIVE) {
        console.debug('Move attachment cancelled');
        return;
    }

    if (selectedTarget === source) {
        console.debug('Move attachment cancelled: same source and target');
        return;
    }

    const content = await getFileAttachment(attachment.url);
    const file = new File([content], attachment.name, { type: 'text/plain' });
    await deleteAttachment(attachment, source, () => { }, false);
    await uploadFileAttachmentToServer(file, selectedTarget);
    callback();
}

/**
 * Deletes an attachment from the server and the chat.
 * @param {FileAttachment} attachment Attachment to delete
 * @param {string} source Source of the attachment
 * @param {function} callback Callback function
 * @param {boolean} [confirm] If true, show a confirmation dialog
 * @returns {Promise<void>} A promise that resolves when the attachment is deleted.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'attachment' implicitly has an 'any' typ... Remove this comment to see the full error message
export async function deleteAttachment(attachment, source, callback, confirm = true) {
    if (confirm) {
        const result = await callGenericPopup('Are you sure you want to delete this attachment?', POPUP_TYPE.CONFIRM);

        if (result !== POPUP_RESULT.AFFIRMATIVE) {
            return;
        }
    }

    ensureAttachmentsExist();

    switch (source) {
        case 'global':
            // @ts-expect-error TS(2339) FIXME: Property 'url' does not exist on type 'never'.
            extension_settings.attachments = extension_settings.attachments.filter((a) => a.url !== attachment.url);
            saveSettingsDebounced();
            break;
        case 'chat':
            // @ts-expect-error TS(2339) FIXME: Property 'attachments' does not exist on type '{}'... Remove this comment to see the full error message
            chat_metadata.attachments = chat_metadata.attachments.filter((a) => a.url !== attachment.url);
            saveMetadataDebounced();
            break;
        case 'character':
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            extension_settings.character_attachments[characters[this_chid]?.avatar] = extension_settings.character_attachments[characters[this_chid]?.avatar].filter((a) => a.url !== attachment.url);
            break;
    }

    // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
    if (Array.isArray(extension_settings.disabled_attachments) && extension_settings.disabled_attachments.includes(attachment.url)) {
        extension_settings.disabled_attachments = extension_settings.disabled_attachments.filter(url => url !== attachment.url);
        saveSettingsDebounced();
    }

    const silent = confirm === false;
    await deleteFileFromServer(attachment.url, silent);
    callback();
}

/**
 * Determines if the attachment is disabled.
 * @param {FileAttachment} attachment Attachment to check
 * @returns {boolean} True if attachment is disabled, false otherwise.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'attachment' implicitly has an 'any' typ... Remove this comment to see the full error message
function isAttachmentDisabled(attachment) {
    return extension_settings.disabled_attachments.some(url => url === attachment?.url);
}

/**
 * Opens the attachment manager.
 */
async function openAttachmentManager() {
    /**
     * Renders a list of attachments.
     * @param {FileAttachment[]} attachments List of attachments
     * @param {string} source Source of the attachments
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'attachments' implicitly has an 'any' ty... Remove this comment to see the full error message
    async function renderList(attachments, source) {
        /**
         * Sorts attachments by sortField and sortOrder.
         * @param {FileAttachment} a First attachment
         * @param {FileAttachment} b Second attachment
         * @returns {number} Sort order
         */
        // @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
        function sortFn(a, b) {
            const sortValueA = a[sortField];
            const sortValueB = b[sortField];
            if (typeof sortValueA === 'string' && typeof sortValueB === 'string') {
                return sortValueA.localeCompare(sortValueB) * (sortOrder === 'asc' ? 1 : -1);
            }
            return (sortValueA - sortValueB) * (sortOrder === 'asc' ? 1 : -1);
        }

        /**
         * Filters attachments by name.
         * @param {FileAttachment} a Attachment
         * @returns {boolean} True if attachment matches the filter, false otherwise.
         */
        // @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
        function filterFn(a) {
            if (!filterString) {
                return true;
            }

            return a.name.toLowerCase().includes(filterString.toLowerCase());
        }
        const sources = {
            [ATTACHMENT_SOURCE.GLOBAL]: '.globalAttachmentsList',
            [ATTACHMENT_SOURCE.CHARACTER]: '.characterAttachmentsList',
            [ATTACHMENT_SOURCE.CHAT]: '.chatAttachmentsList',
        };

        // @ts-expect-error TS(2769) FIXME: No overload matches this call.
        const containerEl = template.querySelector(sources[source]);
        const selected = Array.from(containerEl?.querySelectorAll('.attachmentListItemCheckbox:checked') ?? [])
            .map(el => el.closest('.attachmentListItem')?.getAttribute('data-attachment-url'));

        // @ts-expect-error TS(2769) FIXME: No overload matches this call.
        const sourceContainer = template.querySelector(sources[source]);
        if (sourceContainer) sourceContainer.innerHTML = '';

        // Sort attachments by sortField and sortOrder, and apply filter
        const sortedAttachmentList = attachments.slice().filter(filterFn).sort(sortFn);

        for (const attachment of sortedAttachmentList) {
            const isDisabled = isAttachmentDisabled(attachment);
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            const attachmentTemplate = template.querySelector('.attachmentListItemTemplate .attachmentListItem').cloneNode(true);
            // @ts-expect-error TS(2339) FIXME: Property 'classList' does not exist on type 'Node'... Remove this comment to see the full error message
            attachmentTemplate.classList.toggle('disabled', isDisabled);
            // @ts-expect-error TS(2339) FIXME: Property 'setAttribute' does not exist on type 'No... Remove this comment to see the full error message
            attachmentTemplate.setAttribute('data-attachment-url', attachment.url);
            // @ts-expect-error TS(2339) FIXME: Property 'setAttribute' does not exist on type 'No... Remove this comment to see the full error message
            attachmentTemplate.setAttribute('data-attachment-source', source);
            
            // @ts-expect-error TS(2339) FIXME: Property 'querySelector' does not exist on type 'N... Remove this comment to see the full error message
            const fileIcon = attachmentTemplate.querySelector('.attachmentFileIcon');
            if (fileIcon) fileIcon.setAttribute('title', attachment.url);
            
            // @ts-expect-error TS(2339) FIXME: Property 'querySelector' does not exist on type 'N... Remove this comment to see the full error message
            const listItemName = attachmentTemplate.querySelector('.attachmentListItemName');
            if (listItemName) listItemName.textContent = attachment.name;
            // @ts-expect-error TS(2339) FIXME: Property 'querySelector' does not exist on type 'N... Remove this comment to see the full error message
            const sizeEl = attachmentTemplate.querySelector('.attachmentListItemSize');
            if (sizeEl) sizeEl.textContent = humanFileSize(attachment.size);
            // @ts-expect-error TS(2339) FIXME: Property 'querySelector' does not exist on type 'N... Remove this comment to see the full error message
            const createdEl = attachmentTemplate.querySelector('.attachmentListItemCreated');
            if (createdEl) createdEl.textContent = new Date(attachment.created).toLocaleString();
            // @ts-expect-error TS(2339) FIXME: Property 'querySelector' does not exist on type 'N... Remove this comment to see the full error message
            attachmentTemplate.querySelector('.viewAttachmentButton')?.addEventListener('click', () => openFilePopup(attachment));
            // @ts-expect-error TS(2339) FIXME: Property 'querySelector' does not exist on type 'N... Remove this comment to see the full error message
            attachmentTemplate.querySelector('.editAttachmentButton')?.addEventListener('click', () => editAttachment(attachment, source, renderAttachments));
            // @ts-expect-error TS(2339) FIXME: Property 'querySelector' does not exist on type 'N... Remove this comment to see the full error message
            attachmentTemplate.querySelector('.deleteAttachmentButton')?.addEventListener('click', () => deleteAttachment(attachment, source, renderAttachments));
            // @ts-expect-error TS(2339) FIXME: Property 'querySelector' does not exist on type 'N... Remove this comment to see the full error message
            attachmentTemplate.querySelector('.downloadAttachmentButton')?.addEventListener('click', () => downloadAttachment(attachment));
            // @ts-expect-error TS(2339) FIXME: Property 'querySelector' does not exist on type 'N... Remove this comment to see the full error message
            attachmentTemplate.querySelector('.moveAttachmentButton')?.addEventListener('click', () => moveAttachment(attachment, source, renderAttachments));
            // @ts-expect-error TS(2339) FIXME: Property 'querySelector' does not exist on type 'N... Remove this comment to see the full error message
            const enableBtn = attachmentTemplate.querySelector('.enableAttachmentButton');
            if (enableBtn) {
                enableBtn.style.display = isDisabled ? '' : 'none';
                enableBtn.addEventListener('click', () => enableAttachment(attachment, renderAttachments));
            }
            // @ts-expect-error TS(2339) FIXME: Property 'querySelector' does not exist on type 'N... Remove this comment to see the full error message
            const disableBtn = attachmentTemplate.querySelector('.disableAttachmentButton');
            if (disableBtn) {
                disableBtn.style.display = !isDisabled ? '' : 'none';
                disableBtn.addEventListener('click', () => disableAttachment(attachment, renderAttachments));
            }
            // @ts-expect-error TS(2769) FIXME: No overload matches this call.
            const sourceContainer = template.querySelector(sources[source]);
            if (sourceContainer) sourceContainer.appendChild(attachmentTemplate);

            if (selected.includes(attachment.url)) {
                // @ts-expect-error TS(2339) FIXME: Property 'querySelector' does not exist on type 'N... Remove this comment to see the full error message
                const checkbox = attachmentTemplate.querySelector('.attachmentListItemCheckbox');
                if (checkbox instanceof HTMLInputElement) {
                    checkbox.checked = true;
                }
            }
        }
    }

    /**
     * Renders buttons for the attachment manager.
     */
    async function renderButtons() {
        const sources = {
            [ATTACHMENT_SOURCE.GLOBAL]: '.globalAttachmentsTitle',
            [ATTACHMENT_SOURCE.CHARACTER]: '.characterAttachmentsTitle',
            [ATTACHMENT_SOURCE.CHAT]: '.chatAttachmentsTitle',
        };

        const modal = template.querySelector('.actionButtonsModal');
        const scrapers = ScraperManager.getDataBankScrapers();

        for (const scraper of scrapers) {
            const isAvailable = await ScraperManager.isScraperAvailable(scraper.id);
            if (!isAvailable) {
                continue;
            }

            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            const buttonTemplate = template.querySelector('.actionButtonTemplate .actionButton').cloneNode(true);
            if (scraper.iconAvailable) {
                // @ts-expect-error TS(2339) FIXME: Property 'querySelector' does not exist on type 'N... Remove this comment to see the full error message
                buttonTemplate.querySelector('.actionButtonIcon')?.classList.add(...scraper.iconClass.split(' '));
                // @ts-expect-error TS(2339) FIXME: Property 'querySelector' does not exist on type 'N... Remove this comment to see the full error message
                buttonTemplate.querySelector('.actionButtonImg')?.remove();
            } else {
                // @ts-expect-error TS(2339) FIXME: Property 'querySelector' does not exist on type 'N... Remove this comment to see the full error message
                buttonTemplate.querySelector('.actionButtonImg')?.setAttribute('src', scraper.iconClass);
                // @ts-expect-error TS(2339) FIXME: Property 'querySelector' does not exist on type 'N... Remove this comment to see the full error message
                buttonTemplate.querySelector('.actionButtonIcon')?.remove();
            }
            // @ts-expect-error TS(2339) FIXME: Property 'querySelector' does not exist on type 'N... Remove this comment to see the full error message
            const textEl = buttonTemplate.querySelector('.actionButtonText');
            if (textEl) textEl.textContent = scraper.name;
            // @ts-expect-error TS(2339) FIXME: Property 'setAttribute' does not exist on type 'No... Remove this comment to see the full error message
            buttonTemplate.setAttribute('title', scraper.description);
            buttonTemplate.addEventListener('click', () => {
                const target = modal?.getAttribute('data-attachment-manager-target');
                runScraper(scraper.id, target, renderAttachments);
            });
            modal?.append(buttonTemplate);
        }

        Object.entries(sources).forEach(entry => {
            const [source, selector] = entry;
            const button = template?.querySelector(`${selector} .openActionModalButton`);

            if (!button) {
                return;
            }

            button.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
            button.addEventListener('mousedown', (e) => { e.stopPropagation(); });
            button.addEventListener('click', () => {
                modal?.setAttribute('data-attachment-manager-target', source);
                // @ts-expect-error TS(2339) FIXME: Property 'style' does not exist on type 'Element'.
                button.style.setProperty('anchor-name', '--action-btn');
                // @ts-expect-error TS(2339) FIXME: Property 'togglePopover' does not exist on type 'E... Remove this comment to see the full error message
                modal?.togglePopover();
            });

            return;
        // @ts-expect-error TS(2339) FIXME: Property 'filter' does not exist on type 'void'.
        }).filter(Boolean);

        return () => {
            modal?.remove();
        };
    }

    /**
     *
     */
    async function renderAttachments() {
        /** @type {FileAttachment[]} */
        const globalAttachments = extension_settings.attachments ?? [];
        /** @type {FileAttachment[]} */
        // @ts-expect-error TS(2339) FIXME: Property 'attachments' does not exist on type '{}'... Remove this comment to see the full error message
        const chatAttachments = chat_metadata.attachments ?? [];
        /** @type {FileAttachment[]} */
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        const characterAttachments = extension_settings.character_attachments?.[characters[this_chid]?.avatar] ?? [];

        await renderList(globalAttachments, ATTACHMENT_SOURCE.GLOBAL);
        await renderList(chatAttachments, ATTACHMENT_SOURCE.CHAT);
        await renderList(characterAttachments, ATTACHMENT_SOURCE.CHARACTER);

        // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
        const isNotCharacter = this_chid === undefined || selected_group;
        const isNotInChat = getCurrentChatId() === undefined;
        const charBlock = template.querySelector('.characterAttachmentsBlock');
        // @ts-expect-error TS(2339) FIXME: Property 'style' does not exist on type 'Element'.
        if (charBlock) charBlock.style.display = isNotCharacter ? 'none' : '';
        const chatBlock = template.querySelector('.chatAttachmentsBlock');
        // @ts-expect-error TS(2339) FIXME: Property 'style' does not exist on type 'Element'.
        if (chatBlock) chatBlock.style.display = isNotInChat ? 'none' : '';

        // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
        const characterName = characters[this_chid]?.name || 'Anonymous';
        const charNameEl = template.querySelector('.characterAttachmentsName');
        if (charNameEl) charNameEl.textContent = characterName;

        const chatName = getCurrentChatId() || 'Unnamed chat';
        const chatNameEl = template.querySelector('.chatAttachmentsName');
        if (chatNameEl) chatNameEl.textContent = chatName;
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'files' implicitly has an 'any' type.
    const dragDropHandler = new DragAndDropHandler('.popup', async (files, event) => {
        let selectedTarget = ATTACHMENT_SOURCE.GLOBAL;
        const targets = getAvailableTargets();

        const targetTemplateHtml = await renderExtensionTemplateAsync('attachments', 'files-dropped', { count: files.length, targets: targets });
        const targetSelectTemplate = document.createElement('div');
        targetSelectTemplate.innerHTML = targetTemplateHtml;
        const targetInput = targetSelectTemplate.querySelector('.droppedFilesTarget');
        if (targetInput instanceof HTMLInputElement) {
            targetInput.addEventListener('input', function () {
                selectedTarget = String(this.value);
            });
        }
        const result = await callGenericPopup(targetSelectTemplate, POPUP_TYPE.CONFIRM, '', { wide: false, large: false, okButton: 'Upload', cancelButton: 'Cancel' });
        if (result !== POPUP_RESULT.AFFIRMATIVE) {
            console.log('File upload cancelled');
            return;
        }
        for (const file of files) {
            await uploadFileAttachmentToServer(file, selectedTarget);
        }
        renderAttachments();
    });

    let sortField = accountStorage.getItem('DataBank_sortField') || 'created';
    let sortOrder = accountStorage.getItem('DataBank_sortOrder') || 'desc';
    let filterString = '';

    const templateHtml = await renderExtensionTemplateAsync('attachments', 'manager', {});
    const template = document.createElement('div');
    template.innerHTML = templateHtml;

    template.querySelector('.attachmentSearch')?.addEventListener('input', function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        if (this instanceof HTMLInputElement) {
            // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
            filterString = String(this.value);
        }
        renderAttachments();
    });
    template.querySelector('.attachmentSort')?.addEventListener('change', function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        if (!(this instanceof HTMLSelectElement) || this.selectedOptions.length === 0) {
            return;
        }

        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        sortField = this.selectedOptions[0].dataset.sortField;
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        sortOrder = this.selectedOptions[0].dataset.sortOrder;
        accountStorage.setItem('DataBank_sortField', sortField);
        accountStorage.setItem('DataBank_sortOrder', sortOrder);
        renderAttachments();
    });
    /**
     *
     * @param action
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'action' implicitly has an 'any' type.
    function handleBulkAction(action) {
        return async () => {
            const selectedAttachments = document.querySelectorAll('.attachmentListItemCheckboxContainer .attachmentListItemCheckbox:checked');

            if (selectedAttachments.length === 0) {
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.info(t`No attachments selected.`, t`Data Bank`);
                return;
            }

            if (action.confirmMessage) {
                const confirm = await callGenericPopup(action.confirmMessage, POPUP_TYPE.CONFIRM);
                if (confirm !== POPUP_RESULT.AFFIRMATIVE) {
                    return;
                }
            }

            const includeDisabled = true;
            const attachments = getDataBankAttachments(includeDisabled);
            selectedAttachments.forEach(async (checkbox) => {
                const listItem = checkbox.closest('.attachmentListItem');
                if (!(listItem instanceof HTMLElement)) {
                    return;
                }
                const url = listItem.dataset.attachmentUrl;
                const source = listItem.dataset.attachmentSource;
                const attachment = attachments.find(a => a.url === url);
                if (!attachment) {
                    return;
                }
                await action.perform(attachment, source);
            });

            document.querySelectorAll('.attachmentListItemCheckbox, .attachmentsBulkEditCheckbox').forEach(checkbox => {
                if (checkbox instanceof HTMLInputElement) {
                    checkbox.checked = false;
                }
            });

            await renderAttachments();
        };
    }

    template.querySelector('.bulkActionDisable')?.addEventListener('click', handleBulkAction({
        // @ts-expect-error TS(7006) FIXME: Parameter 'attachment' implicitly has an 'any' typ... Remove this comment to see the full error message
        perform: (attachment) => disableAttachment(attachment, () => { }),
    }));

    template.querySelector('.bulkActionEnable')?.addEventListener('click', handleBulkAction({
        // @ts-expect-error TS(7006) FIXME: Parameter 'attachment' implicitly has an 'any' typ... Remove this comment to see the full error message
        perform: (attachment) => enableAttachment(attachment, () => { }),
    }));

    template.querySelector('.bulkActionDelete')?.addEventListener('click', handleBulkAction({
        confirmMessage: 'Are you sure you want to delete the selected attachments?',
        // @ts-expect-error TS(7006) FIXME: Parameter 'attachment' implicitly has an 'any' typ... Remove this comment to see the full error message
        perform: async (attachment, source) => await deleteAttachment(attachment, source, () => { }, false),
    }));

    template.querySelector('.bulkActionSelectAll')?.addEventListener('click', () => {
        document.querySelectorAll('.attachmentListItemCheckbox:visible').forEach(checkbox => {
            if (checkbox instanceof HTMLInputElement) {
                checkbox.checked = true;
            }
        });
    });
    template.querySelector('.bulkActionSelectNone')?.addEventListener('click', () => {
        document.querySelectorAll('.attachmentListItemCheckbox:visible').forEach(checkbox => {
            if (checkbox instanceof HTMLInputElement) {
                checkbox.checked = false;
            }
        });
    });

    const cleanupFn = await renderButtons();
    await verifyAttachments();
    await renderAttachments();
    await callGenericPopup(template, POPUP_TYPE.TEXT, '', { wide: true, large: true, okButton: 'Close', allowVerticalScrolling: true });

    cleanupFn();
    dragDropHandler.destroy();
}

/**
 * Gets a list of available targets for attachments.
 * @returns {string[]} List of available targets
 */
function getAvailableTargets() {
    const targets = Object.values(ATTACHMENT_SOURCE);

    // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
    const isNotCharacter = this_chid === undefined || selected_group;
    const isNotInChat = getCurrentChatId() === undefined;

    if (isNotCharacter) {
        targets.splice(targets.indexOf(ATTACHMENT_SOURCE.CHARACTER), 1);
    }

    if (isNotInChat) {
        targets.splice(targets.indexOf(ATTACHMENT_SOURCE.CHAT), 1);
    }

    return targets;
}

/**
 * Runs a known scraper on a source and saves the result as an attachment.
 * @param {string} scraperId Id of the scraper
 * @param {string} target Target for the attachment
 * @param {function} callback Callback function
 * @returns {Promise<void>} A promise that resolves when the source is scraped.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'scraperId' implicitly has an 'any' type... Remove this comment to see the full error message
async function runScraper(scraperId, target, callback) {
    try {
        console.log(`Running scraper ${scraperId} for ${target}`);
        const files = await ScraperManager.runDataBankScraper(scraperId);

        if (!Array.isArray(files)) {
            console.warn('Scraping returned nothing');
            return;
        }

        if (files.length === 0) {
            console.warn('Scraping returned no files');
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.info(t`No files were scraped.`, t`Data Bank`);
            return;
        }

        for (const file of files) {
            await uploadFileAttachmentToServer(file, target);
        }

        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success(t`Scraped ${files.length} files from ${scraperId} to ${target}.`, t`Data Bank`);
        callback();
    } catch (error) {
        console.error('Scraping failed', error);
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`Check browser console for details.`, t`Scraping failed`);
    }
}

/**
 * Uploads a file attachment to the server.
 * @param {File} file File to upload
 * @param {string} target Target for the attachment
 * @returns {Promise<string>} Path to the uploaded file
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'file' implicitly has an 'any' type.
export async function uploadFileAttachmentToServer(file, target) {
    const isValid = await validateFile(file);

    if (!isValid) {
        return;
    }

    let base64Data = await getBase64Async(file);
    const slug = getStringHash(file.name);
    const uniqueFileName = `${Date.now()}_${slug}.txt`;

    if (isConvertible(file.type)) {
        try {
            const converter = getConverter(file.type);
            const fileText = await converter(file);
            base64Data = convertTextToBase64(fileText);
        } catch (error) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(String(error), t`Could not convert file`);
            console.error('Could not convert file', error);
        }
    } else {
        const fileText = await file.text();
        base64Data = convertTextToBase64(fileText);
    }

    const fileUrl = await uploadFileAttachment(uniqueFileName, base64Data);
    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
    const convertedSize = Math.round(base64Data.length * 0.75);

    if (!fileUrl) {
        return;
    }

    const attachment = {
        url: fileUrl,
        size: convertedSize,
        name: file.name,
        created: Date.now(),
    };

    ensureAttachmentsExist();

    switch (target) {
        case ATTACHMENT_SOURCE.GLOBAL:
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ url: any; size: number; name: ... Remove this comment to see the full error message
            extension_settings.attachments.push(attachment);
            saveSettingsDebounced();
            break;
        case ATTACHMENT_SOURCE.CHAT:
            // @ts-expect-error TS(2339) FIXME: Property 'attachments' does not exist on type '{}'... Remove this comment to see the full error message
            chat_metadata.attachments.push(attachment);
            saveMetadataDebounced();
            break;
        case ATTACHMENT_SOURCE.CHARACTER:
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            extension_settings.character_attachments[characters[this_chid]?.avatar].push(attachment);
            saveSettingsDebounced();
            break;
    }

    return fileUrl;
}

/**
 *
 */
function ensureAttachmentsExist() {
    if (!Array.isArray(extension_settings.disabled_attachments)) {
        extension_settings.disabled_attachments = [];
    }

    if (!Array.isArray(extension_settings.attachments)) {
        extension_settings.attachments = [];
    }

    // @ts-expect-error TS(2339) FIXME: Property 'attachments' does not exist on type '{}'... Remove this comment to see the full error message
    if (!Array.isArray(chat_metadata.attachments)) {
        // @ts-expect-error TS(2339) FIXME: Property 'attachments' does not exist on type '{}'... Remove this comment to see the full error message
        chat_metadata.attachments = [];
    }

    if (this_chid !== undefined && characters[this_chid]) {
        if (!extension_settings.character_attachments) {
            extension_settings.character_attachments = {};
        }

        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        if (!Array.isArray(extension_settings.character_attachments[characters[this_chid].avatar])) {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            extension_settings.character_attachments[characters[this_chid].avatar] = [];
        }
    }
}

/**
 * Gets all currently available attachments. Ignores disabled attachments by default.
 * @param {boolean} [includeDisabled] If true, include disabled attachments
 * @returns {FileAttachment[]} List of attachments
 */
export function getDataBankAttachments(includeDisabled = false) {
    ensureAttachmentsExist();
    const globalAttachments = extension_settings.attachments ?? [];
    // @ts-expect-error TS(2339) FIXME: Property 'attachments' does not exist on type '{}'... Remove this comment to see the full error message
    const chatAttachments = chat_metadata.attachments ?? [];
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    const characterAttachments = extension_settings.character_attachments?.[characters[this_chid]?.avatar] ?? [];

    return [...globalAttachments, ...chatAttachments, ...characterAttachments].filter(x => includeDisabled || !isAttachmentDisabled(x));
}

/**
 * Gets all attachments for a specific source. Includes disabled attachments by default.
 * @param {string} source Attachment source
 * @param {boolean} [includeDisabled] If true, include disabled attachments
 * @returns {FileAttachment[]} List of attachments
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'source' implicitly has an 'any' type.
export function getDataBankAttachmentsForSource(source, includeDisabled = true) {
    ensureAttachmentsExist();

    /**
     *
     */
    function getBySource() {
        switch (source) {
            case ATTACHMENT_SOURCE.GLOBAL:
                return extension_settings.attachments ?? [];
            case ATTACHMENT_SOURCE.CHAT:
                // @ts-expect-error TS(2339) FIXME: Property 'attachments' does not exist on type '{}'... Remove this comment to see the full error message
                return chat_metadata.attachments ?? [];
            case ATTACHMENT_SOURCE.CHARACTER:
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                return extension_settings.character_attachments?.[characters[this_chid]?.avatar] ?? [];
        }

        return [];
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
    return getBySource().filter(x => includeDisabled || !isAttachmentDisabled(x));
}

/**
 * Verifies all attachments in the Data Bank.
 * @returns {Promise<void>} A promise that resolves when attachments are verified.
 */
async function verifyAttachments() {
    for (const source of Object.values(ATTACHMENT_SOURCE)) {
        await verifyAttachmentsForSource(source);
    }
}

/**
 * Verifies all attachments for a specific source.
 * @param {string} source Attachment source
 * @returns {Promise<void>} A promise that resolves when attachments are verified.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'source' implicitly has an 'any' type.
async function verifyAttachmentsForSource(source) {
    try {
        const attachments = getDataBankAttachmentsForSource(source);
        // @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
        const urls = attachments.map(a => a.url);
        const response = await fetch('/api/files/verify', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ urls }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(error);
        }

        const verifiedUrls = await response.json();
        for (const attachment of attachments) {
            if (verifiedUrls[attachment.url] === false) {
                console.log('Deleting orphaned attachment', attachment);
                await deleteAttachment(attachment, source, () => { }, false);
            }
        }
    } catch (error) {
        console.error('Attachment verification failed', error);
    }
}

const NEUTRAL_CHAT_KEY = 'neutralChat';

/**
 *
 */
export function preserveNeutralChat() {
    // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
    if (this_chid !== undefined || selected_group || name2 !== neutralCharacterName) {
        return;
    }

    sessionStorage.setItem(NEUTRAL_CHAT_KEY, JSON.stringify({ chat, chat_metadata }));
}

/**
 *
 */
export function restoreNeutralChat() {
    // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
    if (this_chid !== undefined || selected_group || name2 !== neutralCharacterName) {
        return;
    }

    const neutralChat = sessionStorage.getItem(NEUTRAL_CHAT_KEY);
    if (!neutralChat) {
        return;
    }

    const { chat: neutralChatData, chat_metadata: neutralChatMetadata } = JSON.parse(neutralChat);
    // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
    chat.splice(0, chat.length, ...neutralChatData);
    updateChatMetadata(neutralChatMetadata, true);
    sessionStorage.removeItem(NEUTRAL_CHAT_KEY);
}

/**
 * Registers a file converter function.
 * @param {string} mimeType MIME type
 * @param {ConverterFunction} converter Function to convert file
 * @returns {void}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'mimeType' implicitly has an 'any' type.
export function registerFileConverter(mimeType, converter) {
    if (typeof mimeType !== 'string' || typeof converter !== 'function') {
        console.error('Invalid converter registration');
        return;
    }

    if (Object.keys(converters).includes(mimeType)) {
        console.error('Converter already registered');
        return;
    }

    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    converters[mimeType] = converter;
}

/**
 *
 */
export function addDOMPurifyHooks() {
    // Allow target="_blank" in links
    // @ts-expect-error TS(7006) FIXME: Parameter 'node' implicitly has an 'any' type.
    DOMPurify.addHook('afterSanitizeAttributes', function (node) {
        if ('target' in node) {
            node.setAttribute('target', '_blank');
            node.setAttribute('rel', 'noopener');
        }
    });

    // @ts-expect-error TS(7006) FIXME: Parameter 'node' implicitly has an 'any' type.
    DOMPurify.addHook('uponSanitizeAttribute', (node, data, config) => {
        if (!config.MESSAGE_SANITIZE) {
            return;
        }

        /* Retain the classes on UI elements of messages that interact with the main UI */
        const permittedNodeTypes = ['BUTTON', 'DIV'];
        if (config.MESSAGE_ALLOW_SYSTEM_UI && node.classList.contains('menu_button') && permittedNodeTypes.includes(node.nodeName)) {
            return;
        }

        switch (data.attrName) {
            case 'class': {
                if (data.attrValue) {
                    // @ts-expect-error TS(7006) FIXME: Parameter 'v' implicitly has an 'any' type.
                    data.attrValue = data.attrValue.split(' ').map((v) => {
                        if (v.startsWith('fa-') || v.startsWith('note-') || v === 'monospace') {
                            return v;
                        }

                        return 'custom-' + v;
                    }).join(' ');
                }
                break;
            }
        }
    });

    // @ts-expect-error TS(7006) FIXME: Parameter 'node' implicitly has an 'any' type.
    DOMPurify.addHook('uponSanitizeElement', (node, _, config) => {
        if (!config.MESSAGE_SANITIZE) {
            return;
        }

        // Replace line breaks with <br> in unknown elements
        if (node instanceof HTMLUnknownElement) {
            node.innerHTML = node.innerHTML.trim();

            /** @type {Text[]} */
            const candidates = [];
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                const textNode = /** @type {Text} */ (walker.currentNode);
                // @ts-expect-error TS(2339) FIXME: Property 'data' does not exist on type 'Node'.
                if (!textNode.data.includes('\n')) continue;

                // Skip if this text node is within a <pre> (any ancestor)
                if (textNode.parentElement && textNode.parentElement.closest('pre')) continue;

                candidates.push(textNode);
            }

            for (const textNode of candidates) {
                // @ts-expect-error TS(2339) FIXME: Property 'data' does not exist on type 'Node'.
                const parts = textNode.data.split('\n');
                const frag = document.createDocumentFragment();
                // @ts-expect-error TS(7006) FIXME: Parameter 'part' implicitly has an 'any' type.
                parts.forEach((part, idx) => {
                    if (part.length) {
                        frag.appendChild(document.createTextNode(part));
                    }
                    if (idx < parts.length - 1) {
                        frag.appendChild(document.createElement('br'));
                    }
                });
                // @ts-expect-error TS(2339) FIXME: Property 'replaceWith' does not exist on type 'Nod... Remove this comment to see the full error message
                textNode.replaceWith(frag);
            }
        }

        const isMediaAllowed = isExternalMediaAllowed();
        if (isMediaAllowed) {
            return;
        }

        if (!(node instanceof Element)) {
            return;
        }

        let mediaBlocked = false;

        switch (node.tagName) {
            case 'AUDIO':
            case 'VIDEO':
            case 'SOURCE':
            case 'TRACK':
            case 'EMBED':
            case 'OBJECT':
            case 'IMG': {
                // @ts-expect-error TS(7006) FIXME: Parameter 'url' implicitly has an 'any' type.
                const isExternalUrl = (url) => (url.indexOf('://') > 0 || url.indexOf('//') === 0) && !url.startsWith(window.location.origin);
                const src = node.getAttribute('src');
                const data = node.getAttribute('data');
                const srcset = node.getAttribute('srcset');

                if (srcset) {
                    const srcsetUrls = srcset.split(',');

                    for (const srcsetUrl of srcsetUrls) {
                        const [url] = srcsetUrl.trim().split(' ');

                        if (isExternalUrl(url)) {
                            console.warn('External media blocked', url);
                            node.remove();
                            mediaBlocked = true;
                            break;
                        }
                    }
                }

                if (src && isExternalUrl(src)) {
                    console.warn('External media blocked', src);
                    mediaBlocked = true;
                    node.remove();
                }

                if (data && isExternalUrl(data)) {
                    console.warn('External media blocked', data);
                    mediaBlocked = true;
                    node.remove();
                }

                if (mediaBlocked && (node instanceof HTMLMediaElement)) {
                    node.autoplay = false;
                    node.pause();
                }
            }
                break;
        }

        if (mediaBlocked) {
            const entityId = getCurrentEntityId();
            const warningShownKey = `mediaWarningShown:${entityId}`;

            if (accountStorage.getItem(warningShownKey) === null) {
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                const warningToast = toastr.warning(
                    t`Use the 'Ext. Media' button to allow it. Click on this message to dismiss.`,
                    t`External media has been blocked`,
                    {
                        timeOut: 0,
                        preventDuplicates: true,
                        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                        onclick: () => toastr.clear(warningToast),
                    },
                );

                accountStorage.setItem(warningShownKey, 'true');
            }
        }
    });
}

/**
 * Switches an image to the next or previous one in the swipe list.
 * @param {number} messageId Message ID
 * @param {JQuery<HTMLElement>} element Message element
 * @param {string} direction Swipe direction
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'messageId' implicitly has an 'any' type... Remove this comment to see the full error message
async function onImageSwiped(messageId, element, direction) {
    const animationClass = 'fa-fade';
    const messageMedia = element.find('.mes_img, .mes_video');

    // Current image is already animating
    if (messageMedia.hasClass(animationClass)) {
        return;
    }

    const message = chat[messageId];
    // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
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

    // Switch to previous image or wrap around if at the beginning
    if (direction === SWIPE_DIRECTION.LEFT) {
        const newIndex = currentIndex === 0 ? media.length - 1 : currentIndex - 1;
        // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
        message.extra.media_index = newIndex;
    }

    // Switch to next image or generate a new one if at the end
    if (direction === SWIPE_DIRECTION.RIGHT) {
        const newIndex = currentIndex === media.length - 1 ? 0 : currentIndex + 1;
        // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
        message.extra.media_index = newIndex >= media.length ? 0 : newIndex;
    }

    await saveChatConditional();
    appendMediaToMessage(message, element);
}

/**
 *
 */
export function initChatUtilities() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.mes_hide', async function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const messageBlock = this.closest('.mes');
        const messageId = Number(messageBlock?.getAttribute('mesid'));
        await hideChatMessageRange(messageId, messageId, false);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.mes_unhide', async function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const messageBlock = this.closest('.mes');
        const messageId = Number(messageBlock?.getAttribute('mesid'));
        await hideChatMessageRange(messageId, messageId, true);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.mes_file_delete', async function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const messageBlock = this.closest('.mes');
        const messageId = Number(messageBlock?.getAttribute('mesid'));
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const fileBlock = this.closest('.mes_file_container');
        const fileIndex = Number(fileBlock?.getAttribute('data-index'));
        await deleteMessageFile(messageBlock, messageId, fileIndex);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.mes_file_open', async function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const messageBlock = this.closest('.mes');
        const messageId = Number(messageBlock?.getAttribute('mesid'));
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const fileBlock = this.closest('.mes_file_container');
        const fileIndex = Number(fileBlock?.getAttribute('data-index'));
        await viewMessageFile(messageId, fileIndex);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.assistant_note_export', async function (_e) {
        /** @type {ChatHeader} */
        const chatHeader = {
            chat_metadata: chat_metadata,
            user_name: 'unused',
            character_name: 'unused',
        };
        const chatToSave = [
            chatHeader,
            // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
            ...chat.filter(x => x?.extra?.type !== system_message_types.ASSISTANT_NOTE),
        ];

        download(chatToSave.map((m) => JSON.stringify(m)).join('\n'), `Assistant - ${humanizedDateTime()}.jsonl`, 'application/json');
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.assistant_note_import', async function () {
        const importFile = async () => {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            const file = fileInput.files[0];
            if (!file) {
                return;
            }

            try {
                const text = await getFileText(file);
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                const lines = text.split('\n').filter(line => line.trim() !== '');
                // @ts-expect-error TS(7006) FIXME: Parameter 'line' implicitly has an 'any' type.
                const messages = lines.map(line => JSON.parse(line));
                const metadata = messages.shift()?.chat_metadata || {};
                // @ts-expect-error TS(2554) FIXME: Expected 2-3 arguments, but got 1.
                messages.unshift(getSystemMessageByType(system_message_types.ASSISTANT_NOTE));
                await clearChat();
                // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
                chat.splice(0, chat.length, ...messages);
                updateChatMetadata(metadata, true);
                await printMessages();
            } catch (error) {
                console.error('Error importing assistant chat:', error);
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.error(t`It's either corrupted or not a valid JSONL file.`, t`Failed to import chat`);
            }
        };
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.jsonl';
        fileInput.addEventListener('change', importFile);
        fileInput.click();
    });

    const fileInput = document.getElementById('file_form_input');

    // Do not change. #attachFile is added by extension.
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '#attachFile', function () {
        if (!(fileInput instanceof HTMLInputElement)) return;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const $fileInput = $(fileInput);

        // Preserve existing files in DataTransfer
        const dataTransfer = new DataTransfer();
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        for (const file of fileInput.files) {
            dataTransfer.items.add(file);
        }

        $fileInput.off('change').on('change', async () => {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            for (const file of fileInput.files) {
                if (!Array.from(dataTransfer.files).some(f => isSameFile(f, file))) {
                    dataTransfer.items.add(file);
                }
            }

            fileInput.files = dataTransfer.files;
            await onFileAttach(fileInput.files);
        });

        $fileInput.trigger('click');
    });

    // Do not change. #manageAttachments is added by extension.
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '#manageAttachments', function () {
        openAttachmentManager();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.mes_embed', function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const messageBlock = this.closest('.mes');
        const messageId = Number(messageBlock?.getAttribute('mesid'));
        embedMessageFile(messageId, messageBlock);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.editor_maximize', async function (e) {
        e.preventDefault();
        e.stopPropagation();

        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const broId = $(this).attr('data-for');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const bro = $(`#${broId}`);
        const contentEditable = bro.is('[contenteditable]');
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const withTab = $(this).attr('data-tab');

        if (!bro.length) {
            console.error('Could not find editor with id', broId);
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.classList.add('height100p', 'wide100p', 'flex-container');
        wrapper.classList.add('flexFlowColumn', 'justifyCenter', 'alignitemscenter');
        const textarea = document.createElement('textarea');
        textarea.dataset.for = broId;
        if (bro[0].dataset.macros !== undefined) {
            textarea.dataset.macros = bro[0].dataset.macros;
            textarea.dataset.macrosAutocomplete = 'always'; // Always show autocomplete in expanded editor
            textarea.dataset.macrosAutocompleteStyle = 'expanded'; // Use expanded autocomplete style
        }
        textarea.value = String(contentEditable ? bro[0].innerText : bro.val());
        textarea.classList.add('height100p', 'wide100p', 'maximized_textarea');
        if (bro.hasClass('monospace')) textarea.classList.add('monospace');
        if (bro.hasClass('mdHotkeys')) textarea.classList.add('mdHotkeys');
        textarea.addEventListener('input', function () {
            if (contentEditable) {
                bro[0].innerText = textarea.value;
                bro.trigger('input');
            } else {
                bro.val(textarea.value).trigger('input');
            }
        });
        wrapper.appendChild(textarea);

        if (withTab) {
            textarea.addEventListener('keydown', (evt) => {
                if (evt.key == 'Tab' && !evt.shiftKey && !evt.ctrlKey && !evt.altKey) {
                    evt.preventDefault();
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;
                    if (end - start > 0 && textarea.value.substring(start, end).includes('\n')) {
                        const lineStart = textarea.value.lastIndexOf('\n', start);
                        const count = textarea.value.substring(lineStart, end).split('\n').length - 1;
                        textarea.value = `${textarea.value.substring(0, lineStart)}${textarea.value.substring(lineStart, end).replace(/\n/g, '\n\t')}${textarea.value.substring(end)}`;
                        textarea.selectionStart = start + 1;
                        textarea.selectionEnd = end + count;
                    } else {
                        textarea.value = `${textarea.value.substring(0, start)}\t${textarea.value.substring(end)}`;
                        textarea.selectionStart = start + 1;
                        textarea.selectionEnd = end + 1;
                    }
                } else if (evt.key == 'Tab' && evt.shiftKey && !evt.ctrlKey && !evt.altKey) {
                    evt.preventDefault();
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;
                    const lineStart = textarea.value.lastIndexOf('\n', start);
                    const count = textarea.value.substring(lineStart, end).split('\n\t').length - 1;
                    textarea.value = `${textarea.value.substring(0, lineStart)}${textarea.value.substring(lineStart, end).replace(/\n\t/g, '\n')}${textarea.value.substring(end)}`;
                    textarea.selectionStart = start - 1;
                    textarea.selectionEnd = end - count;
                }
            });
        }

        await callGenericPopup(wrapper, POPUP_TYPE.TEXT, '', { wide: true, large: true });
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', 'body .mes .mes_text, body .mes .mes_reasoning', function (event) {
        if (!power_user.click_to_edit) return;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (window.getSelection().toString()) return;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        if ($('.edit_textarea').length) return;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $(this.closest('.mes')?.querySelector('.mes_edit')).trigger('click');
        if (event.target.closest('.mes_reasoning')) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('.reasoning_edit_textarea').trigger('focus');
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.open_media_overrides', openExternalMediaOverridesDialog);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('input', '#forbid_media_override_allowed', function () {
        const entityId = getCurrentEntityId();
        if (!entityId) return;
        // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
        power_user.external_media_allowed_overrides.push(entityId);
        power_user.external_media_forbidden_overrides = power_user.external_media_forbidden_overrides.filter((v) => v !== entityId);
        saveSettingsDebounced();
        reloadCurrentChat();
    });
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('input', '#forbid_media_override_forbidden', function () {
        const entityId = getCurrentEntityId();
        if (!entityId) return;
        // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
        power_user.external_media_forbidden_overrides.push(entityId);
        power_user.external_media_allowed_overrides = power_user.external_media_allowed_overrides.filter((v) => v !== entityId);
        saveSettingsDebounced();
        reloadCurrentChat();
    });
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('input', '#forbid_media_override_global', function () {
        const entityId = getCurrentEntityId();
        if (!entityId) return;
        power_user.external_media_allowed_overrides = power_user.external_media_allowed_overrides.filter((v) => v !== entityId);
        power_user.external_media_forbidden_overrides = power_user.external_media_forbidden_overrides.filter((v) => v !== entityId);
        saveSettingsDebounced();
        reloadCurrentChat();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#creators_note_styles_button').on('click', function (e) {
        e.stopPropagation();
        openGlobalStylesPreferenceDialog();
    });

    /**
     * Returns information about the closest media container.
     * @param containerClass
     * @returns {MediaContainerInfo} Information about the media container
     * @typedef {object} MediaContainerInfo
     * @property {JQuery<HTMLElement>} messageBlock The closest message block
     * @property {number} messageId The message ID
     * @property {JQuery<HTMLElement>} mediaBlock The closest media container block
     * @property {number} mediaIndex The media index within the message
     */
    function getMediaContainerInfo(containerClass = '.mes_media_container') {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const messageBlock = $(this.closest('.mes'));
        const messageId = Number(messageBlock.attr('mesid'));
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const mediaBlock = $(this.closest(containerClass));
        const mediaIndex = Number(mediaBlock.attr('data-index'));
        return { messageBlock, messageId, mediaBlock, mediaIndex };
    }
    chatElement.on('click', '.mes_img', async function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const { messageId, mediaIndex } = getMediaContainerInfo.call(this);
        expandMessageMedia(messageId, mediaIndex);
    });
    chatElement.on('click', '.mes_media_enlarge', async function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const { messageId, mediaIndex } = getMediaContainerInfo.call(this);
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        expandMessageMedia(messageId, mediaIndex).click();
    });
    chatElement.on('click', '.mes_media_delete', async function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const { messageId, mediaIndex, messageBlock } = getMediaContainerInfo.call(this);
        await deleteMessageMedia(messageId, mediaIndex, messageBlock);
    });
    chatElement.on('click', '.mes_media_list', async function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const { messageId, messageBlock } = getMediaContainerInfo.call(this);
        await switchMessageMediaDisplay(messageId, messageBlock, MEDIA_DISPLAY.GALLERY);
    });
    chatElement.on('click', '.mes_media_gallery', async function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const { messageId, messageBlock } = getMediaContainerInfo.call(this);
        await switchMessageMediaDisplay(messageId, messageBlock, MEDIA_DISPLAY.LIST);
    });
    chatElement.on('click', '.mes_img_swipe_left', async function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const { messageId, messageBlock } = getMediaContainerInfo.call(this);
        await onImageSwiped(messageId, messageBlock, SWIPE_DIRECTION.LEFT);
    });
    chatElement.on('click', '.mes_img_swipe_right', async function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const { messageId, messageBlock } = getMediaContainerInfo.call(this);
        await onImageSwiped(messageId, messageBlock, SWIPE_DIRECTION.RIGHT);
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#file_form').on('reset', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#file_form').addClass('displayNone');
    });

    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    document.getElementById('send_textarea').addEventListener('paste', async function (event) {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (event.clipboardData.files.length === 0) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        await handleFileAttach(Array.from(event.clipboardData.files));
    });

    // @ts-expect-error TS(7006) FIXME: Parameter 'files' implicitly has an 'any' type.
    new DragAndDropHandler('#form_sheld', async (files) => {
        await handleFileAttach(files);
    });

    /**
     * Common handler for file attachments.
     * @param {File[]} files Files to attach
     * @returns {Promise<void>}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'files' implicitly has an 'any' type.
    async function handleFileAttach(files) {
        if (!(fileInput instanceof HTMLInputElement)) return;

        // Workaround for Firefox: Use a DataTransfer object to indirectly set fileInput.files
        const dataTransfer = new DataTransfer();
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        for (const file of fileInput.files) {
            dataTransfer.items.add(file);
        }

        // Preserve existing non-duplicate files in the input
        for (const file of files) {
            if (!Array.from(dataTransfer.files).some(f => isSameFile(f, file))) {
                dataTransfer.items.add(file);
            }
        }

        fileInput.files = dataTransfer.files;
        await onFileAttach(fileInput.files);
    }

    eventSource.on(event_types.CHAT_CHANGED, checkForCreatorNotesStyles);
}
