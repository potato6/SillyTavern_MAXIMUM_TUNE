import { Fuse, localspace } from '../lib.js';
import { characters, chat_metadata, eventSource, event_types, generateQuietPrompt, getCurrentChatId, getRequestHeaders, getThumbnailUrl, saveMetadata, saveSettingsDebounced, this_chid } from '../script.js';
import { openThirdPartyExtensionMenu, saveMetadataDebounced } from './extensions.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import { SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import { createThumbnail, flashHighlight, getBase64Async, stringFormat, debounce, setupScrollToTop, saveBase64AsFile, getFileExtension, sortIgnoreCaseAndAccents } from './utils.js';
import { debounce_timeout } from './constants.js';
import { t } from './i18n.js';
import { callGenericPopup, Popup, POPUP_TYPE } from './popup.js';
import { groups, selected_group } from './group-chats.js';
import { humanizedDateTime } from './RossAscends-mods.js';
import { deleteMediaFromServer } from './chats.js';

const BG_METADATA_KEY = 'custom_background';
const LIST_METADATA_KEY = 'chat_backgrounds';

/** @type {Array<{id: string, name: string, thumbnailFile: string}>} */
// @ts-expect-error TS(7034) FIXME: Variable 'folderList' implicitly has type 'any[]' ... Remove this comment to see the full error message
let folderList = [];
/** @type {Object.<string, string[]>} filename → folderIds */
let imageFolderMap = {};
/** @type {string|null} Currently active folder drill-in, or null for root */
// @ts-expect-error TS(7034) FIXME: Variable 'activeFolderId' implicitly has type 'any... Remove this comment to see the full error message
let activeFolderId = null;
/** @type {Set<string>} Selected system backgrounds for group folder actions */
const selectedSystemBackgroundFiles = new Set();
/** @type {boolean} Whether click-to-select mode is active for system backgrounds */
let isBackgroundSelectionMode = false;

// A single transparent PNG pixel used as a placeholder for errored backgrounds
const PNG_PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const PNG_PIXEL_BLOB = new Blob([Uint8Array.from(atob(PNG_PIXEL), c => c.charCodeAt(0))], { type: 'image/png' });
const PLACEHOLDER_IMAGE = `url('data:image/png;base64,${PNG_PIXEL}')`;

const THUMBNAIL_COLUMNS_MIN = 2;
const THUMBNAIL_COLUMNS_MAX = 8;
const THUMBNAIL_COLUMNS_DEFAULT_DESKTOP = 5;
const THUMBNAIL_COLUMNS_DEFAULT_MOBILE = 3;

/**
 * Storage for frontend-generated background thumbnails.
 * This is used to store thumbnails for backgrounds that cannot be generated on the server.
 */
const THUMBNAIL_STORAGE = localspace.createInstance({ name: 'SillyTavern_Thumbnails' });

/**
 * Cache for thumbnail blob URLs.
 * @type {Map<string, string>}
 */
const THUMBNAIL_BLOBS = new Map();

const THUMBNAIL_CONFIG = {
    width: 160,
    height: 90,
};

const ANIMATED_BACKGROUND_EXTENSIONS = ['mp4', 'webp', 'gif', 'apng'];

/**
 * Cache for image metadata.
 * @type {Map<string, import('../../src/endpoints/image-metadata.js').ImageMetadata>}
 */
const METADATA_CACHE = new Map();

/**
 * Background source types.
 * @readonly
 * @enum {number}
 */
const BG_SOURCES = {
    GLOBAL: 0,
    CHAT: 1,
};

/**
 * Background sorting options.
 * @readonly
 * @enum {string}
 */
const BG_SORT_OPTIONS = {
    AZ: 'az',
    ZA: 'za',
    NEWEST: 'newest',
    OLDEST: 'oldest',
};

/**
 * Mapping of background sources to their corresponding tab IDs.
 * @readonly
 * @type {Record<string, string>}
 */
const BG_TABS = Object.freeze({
    [BG_SOURCES.GLOBAL]: 'bg_global_tab',
    [BG_SOURCES.CHAT]: 'bg_chat_tab',
});

/**
 * Global IntersectionObserver instance for lazy loading backgrounds
 * @type {IntersectionObserver|null}
 */
let lazyLoadObserver: IntersectionObserver | null = null;

/**
 * Cache for the current list of system background filenames.
 * Used to re-sort backgrounds without refetching from the server.
 * @type {Array<{filename: string, isAnimated: boolean}>}
 */
// @ts-expect-error TS(7034) FIXME: Variable 'cachedSystemBackgrounds' implicitly has ... Remove this comment to see the full error message
let cachedSystemBackgrounds = [];

export const background_settings = {
    name: '__transparent.png',
    url: generateUrlParameter('__transparent.png', false),
    fitting: 'classic',
    animation: false,
    sortOrder: BG_SORT_OPTIONS.AZ,
};

/**
 * Sorts an array of background filenames based on the current sort order.
 * @param {string[]} backgrounds - Array of background filenames
 * @param {boolean} isCustom - Whether these are custom (chat) backgrounds
 * @returns {string[]} Sorted array of background filenames
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'backgrounds' implicitly has an 'any' ty... Remove this comment to see the full error message
function sortBackgrounds(backgrounds, isCustom = false) {
    const sortOrder = background_settings.sortOrder || BG_SORT_OPTIONS.AZ;

    return [...backgrounds].sort((a, b) => {
        switch (sortOrder) {
            case BG_SORT_OPTIONS.AZ:
                return sortIgnoreCaseAndAccents(a, b);
            case BG_SORT_OPTIONS.ZA:
                return sortIgnoreCaseAndAccents(b, a);
            case BG_SORT_OPTIONS.NEWEST:
            case BG_SORT_OPTIONS.OLDEST: {
                const keyA = isCustom ? a : `backgrounds/${a}`;
                const keyB = isCustom ? b : `backgrounds/${b}`;
                const metaA = METADATA_CACHE.get(keyA);
                const metaB = METADATA_CACHE.get(keyB);
                const timestampA = metaA?.addedTimestamp ?? 0;
                const timestampB = metaB?.addedTimestamp ?? 0;
                // Newest first (descending) or oldest first (ascending)
                return sortOrder === BG_SORT_OPTIONS.NEWEST
                    ? timestampB - timestampA
                    : timestampA - timestampB;
            }
            default:
                return 0;
        }
    });
}

/**
 * Creates a single thumbnail DOM element. The CSS now handles all sizing.
 * @param {object} imageData - Data for the image (filename, isCustom, isAnimated).
 * @returns {HTMLElement} The created thumbnail element.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'imageData' implicitly has an 'any' type... Remove this comment to see the full error message
function createThumbnailElement(imageData) {
    const bg = imageData.filename;
    const isCustom = imageData.isCustom;
    const isAnimated = imageData.isAnimated ?? false;

    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    const thumbnail = document.querySelector('#background_template .bg_example').cloneNode(true);

    const clipper = document.createElement('div');
    clipper.className = 'thumbnail-clipper lazy-load-background';
    clipper.style.backgroundImage = PLACEHOLDER_IMAGE;

    // Apply dominant color and aspect ratio as placeholder if available
    const metadataKey = isCustom ? bg : `backgrounds/${bg}`;
    const metadata = METADATA_CACHE.get(metadataKey);
    if (metadata) {
        if (metadata.dominantColor) {
            clipper.style.backgroundColor = metadata.dominantColor;
        }
        if (metadata.aspectRatio) {
            // @ts-expect-error TS(2339) FIXME: Property 'style' does not exist on type 'Node'.
            thumbnail.style.aspectRatio = metadata.aspectRatio;
        }
    }

    // @ts-expect-error TS(2339) FIXME: Property 'querySelector' does not exist on type 'N... Remove this comment to see the full error message
    const titleElement = thumbnail.querySelector('.BGSampleTitle');
    clipper.appendChild(titleElement);
    // @ts-expect-error TS(2339) FIXME: Property 'append' does not exist on type 'Node'.
    thumbnail.append(clipper);

    const url = generateUrlParameter(bg, isCustom);
    const title = isCustom ? bg.split('/').pop() : bg;
    const friendlyTitle = String(title || '').slice(0, title.lastIndexOf('.'));

    // @ts-expect-error TS(2339) FIXME: Property 'setAttribute' does not exist on type 'No... Remove this comment to see the full error message
    thumbnail.setAttribute('title', title);
    // @ts-expect-error TS(2339) FIXME: Property 'setAttribute' does not exist on type 'No... Remove this comment to see the full error message
    thumbnail.setAttribute('bgfile', bg);
    // @ts-expect-error TS(2339) FIXME: Property 'setAttribute' does not exist on type 'No... Remove this comment to see the full error message
    thumbnail.setAttribute('custom', String(isCustom));
    // @ts-expect-error TS(2339) FIXME: Property 'setAttribute' does not exist on type 'No... Remove this comment to see the full error message
    thumbnail.setAttribute('animated', String(isAnimated));
    // @ts-expect-error TS(2339) FIXME: Property 'setAttribute' does not exist on type 'No... Remove this comment to see the full error message
    thumbnail.setAttribute('data-url', url);
    titleElement.textContent = friendlyTitle;

    return thumbnail;
}

/**
 * Applies the thumbnail column count to the CSS and updates button states.
 * @param {number} count - The number of columns to display.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'count' implicitly has an 'any' type.
function applyThumbnailColumns(count) {
    const newCount = Math.max(THUMBNAIL_COLUMNS_MIN, Math.min(count, THUMBNAIL_COLUMNS_MAX));
    // @ts-expect-error TS(2339) FIXME: Property 'thumbnailColumns' does not exist on type... Remove this comment to see the full error message
    background_settings.thumbnailColumns = newCount;
    document.documentElement.style.setProperty('--bg-thumb-columns', newCount.toString());

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg_thumb_zoom_in').prop('disabled', newCount <= THUMBNAIL_COLUMNS_MIN);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg_thumb_zoom_out').prop('disabled', newCount >= THUMBNAIL_COLUMNS_MAX);

    saveSettingsDebounced();
}

/**
 *
 * @param settings
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'settings' implicitly has an 'any' type.
export function loadBackgroundSettings(settings) {
    let backgroundSettings = settings.background;
    if (!backgroundSettings || !backgroundSettings.name || !backgroundSettings.url) {
        backgroundSettings = background_settings;
    }
    if (!backgroundSettings.fitting) {
        backgroundSettings.fitting = 'classic';
    }
    if (!Object.hasOwn(backgroundSettings, 'animation')) {
        backgroundSettings.animation = false;
    }
    if (!backgroundSettings.sortOrder) {
        backgroundSettings.sortOrder = BG_SORT_OPTIONS.AZ;
    }

    // If a value is already saved, use it. Otherwise, determine default based on screen size.
    let columns = backgroundSettings.thumbnailColumns;
    if (!columns) {
        const isNarrowScreen = window.matchMedia('(max-width: 480px)').matches;
        columns = isNarrowScreen ? THUMBNAIL_COLUMNS_DEFAULT_MOBILE : THUMBNAIL_COLUMNS_DEFAULT_DESKTOP;
    }
    // @ts-expect-error TS(2339) FIXME: Property 'thumbnailColumns' does not exist on type... Remove this comment to see the full error message
    background_settings.thumbnailColumns = columns;
    background_settings.sortOrder = backgroundSettings.sortOrder;
    background_settings.animation = backgroundSettings.animation;
    // @ts-expect-error TS(2339) FIXME: Property 'thumbnailColumns' does not exist on type... Remove this comment to see the full error message
    applyThumbnailColumns(background_settings.thumbnailColumns);

    setBackground(backgroundSettings.name, backgroundSettings.url);
    setFittingClass(backgroundSettings.fitting);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#background_fitting').val(backgroundSettings.fitting);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#background_thumbnails_animation').prop('checked', background_settings.animation);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg-sort').val(background_settings.sortOrder);
    highlightSelectedBackground();
}

/**
 * Sets the background for the current chat and adds it to the list of custom backgrounds.
 * @param {{url: string, path:string}} backgroundInfo
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'backgroundInfo' implicitly has an 'any'... Remove this comment to see the full error message
async function forceSetBackground(backgroundInfo) {
    saveBackgroundMetadata(backgroundInfo.url);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg1').css('background-image', backgroundInfo.url);

    const list = chat_metadata[LIST_METADATA_KEY] || [];
    const bg = backgroundInfo.path;
    list.push(bg);
    chat_metadata[LIST_METADATA_KEY] = list;
    saveMetadataDebounced();
    // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
    renderChatBackgrounds();
    highlightNewBackground(bg);
    highlightLockedBackground();
}

/**
 *
 */
async function onChatChanged() {
    const lockedUrl = chat_metadata[BG_METADATA_KEY];

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg1').css('background-image', lockedUrl || background_settings.url);

    // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
    renderChatBackgrounds();
    highlightLockedBackground();
    highlightSelectedBackground();
}

/**
 * Checks if a given URL corresponds to a custom background in the current chat's metadata.
 * @param {string} fileUrl - The URL to check against the chat's custom backgrounds.
 * @returns {boolean} True if the URL corresponds to a custom background, false otherwise.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'fileUrl' implicitly has an 'any' type.
export function isCustomBackgroundUrl(fileUrl) {
    const customBackgrounds = chat_metadata[LIST_METADATA_KEY] || [];
    // @ts-expect-error TS(7006) FIXME: Parameter 'bg' implicitly has an 'any' type.
    return customBackgrounds.some(bg => bg === fileUrl || generateUrlParameter(bg, true) === fileUrl);
}

/**
 * Gets the client path for a background image, encoding the file name for safe URL usage.
 * @param {string} fileUrl File name or URL of the background image
 * @returns {string} Client path for the system backgroun
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'fileUrl' implicitly has an 'any' type.
export function getBackgroundPath(fileUrl) {
    return `backgrounds/${encodeURIComponent(fileUrl)}`;
}

/**
 * Gets the raw server-side relative path for a background image (no URL encoding).
 * Used when communicating paths to the API (stored as plain strings in metadata).
 * @param {string} file File name of the background image
 * @returns {string} Raw relative path, e.g. "backgrounds/my file.jpg"
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'file' implicitly has an 'any' type.
function getBackgroundRelativePath(file) {
    return `backgrounds/${file}`;
}


/**
 *
 */
function highlightLockedBackground() {
    document.querySelectorAll('.bg_example.locked-background').forEach(el => el.classList.remove('locked-background'));

    const lockedBackgroundUrl = chat_metadata[BG_METADATA_KEY];

    if (lockedBackgroundUrl) {
        document.querySelectorAll('.bg_example').forEach(el => {
            // @ts-expect-error TS(2339) FIXME: Property 'dataset' does not exist on type 'Element... Remove this comment to see the full error message
            if (el.dataset.url === lockedBackgroundUrl) {
                el.classList.add('locked-background');
            }
        });
    }
}

/**
 * Locks the background for the current chat
 * @param {Event|null} event
 */
function onLockBackgroundClick(event = null) {
    if (!getCurrentChatId()) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning(t`Select a chat to lock the background for it`);
        return;
    }

    // Take the global background's URL and save it to the chat's metadata.
    // @ts-expect-error TS(2339) FIXME: Property 'target' does not exist on type 'never'.
    const urlToLock = event ? event.target.closest('.bg_example')?.dataset.url : background_settings.url;
    saveBackgroundMetadata(urlToLock);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg1').css('background-image', urlToLock);

    // Update UI states to reflect the new lock.
    highlightLockedBackground();
    highlightSelectedBackground();
}

/**
 * Unlocks the background for the current chat
 * @param {Event|null} _event
 */
function onUnlockBackgroundClick(_event = null) {
    // Delete the lock from the chat's metadata.
    removeBackgroundMetadata();

    // Revert the view to the current global background.
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg1').css('background-image', background_settings.url);

    // Update UI states to reflect the removal of the lock.
    highlightLockedBackground();
    highlightSelectedBackground();
}

/**
 *
 */
function isChatBackgroundLocked() {
    return chat_metadata[BG_METADATA_KEY];
}

/**
 *
 * @param file
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'file' implicitly has an 'any' type.
function saveBackgroundMetadata(file) {
    chat_metadata[BG_METADATA_KEY] = file;
    saveMetadataDebounced();
}

/**
 *
 */
function removeBackgroundMetadata() {
    delete chat_metadata[BG_METADATA_KEY];
    saveMetadataDebounced();
}

/**
 * Handles the click event for selecting a background.
 * @param {JQuery.Event} e Event
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
function onSelectBackgroundClick(e) {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const bgFile = $(this).attr('bgfile');
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const isCustom = $(this).attr('custom') === 'true';
    if (isBackgroundSelectionMode && !isCustom) {
        toggleBackgroundGroupSelection(bgFile);
        return;
    }

    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
    const backgroundCssUrl = getUrlParameter(this);
    const bypassGlobalLock = !isCustom && e.shiftKey;

    if ((isChatBackgroundLocked() || isCustom) && !bypassGlobalLock) {
        // If a background is locked, update the locked background directly
        saveBackgroundMetadata(backgroundCssUrl);
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#bg1').css('background-image', backgroundCssUrl);
    } else {
        // Otherwise, update the global background setting
        setBackground(bgFile, backgroundCssUrl);
    }

    // Update UI highlights to reflect the changes.
    highlightLockedBackground();
    highlightSelectedBackground();
}

/**
 *
 * @param e
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
async function onCopyToSystemBackgroundClick(e) {
    e.stopPropagation();
    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
    const bgNames = await getNewBackgroundName(this);

    if (!bgNames) {
        return;
    }

    const bgFile = await fetch(bgNames.oldBg);

    if (!bgFile.ok) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning('Failed to copy background');
        return;
    }

    const blob = await bgFile.blob();
    const file = new File([blob], bgNames.newBg);
    const formData = new FormData();
    formData.set('avatar', file);

    await uploadBackground(formData);

    const list = chat_metadata[LIST_METADATA_KEY] || [];
    const index = list.indexOf(bgNames.oldBg);
    list.splice(index, 1);
    saveMetadataDebounced();
    // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
    renderChatBackgrounds();
}

/**
 * Gets a thumbnail for the background from storage or fetches it if not available.
 * It caches the thumbnail in local storage and returns a blob URL for the thumbnail.
 * If the thumbnail cannot be fetched, it returns a transparent PNG pixel as a fallback.
 * @param {string} bg Background URL
 * @param {boolean} isCustom Is the background custom?
 * @returns {Promise<string>} Blob URL of the thumbnail
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'bg' implicitly has an 'any' type.
async function getThumbnailFromStorage(bg, isCustom) {
    const cachedBlobUrl = THUMBNAIL_BLOBS.get(bg);
    if (cachedBlobUrl) {
        return cachedBlobUrl;
    }

    const savedBlob = await THUMBNAIL_STORAGE.getItem(bg);
    if (savedBlob) {
        const savedBlobUrl = URL.createObjectURL(savedBlob as Blob);
        THUMBNAIL_BLOBS.set(bg, savedBlobUrl);
        return savedBlobUrl;
    }

    try {
        const url = isCustom ? bg : getBackgroundPath(bg);
        const response = await fetch(url, { cache: 'force-cache' });
        if (!response.ok) {
            throw new Error('Fetch failed with status: ' + response.status);
        }
        const imageBlob = await response.blob();
        const imageBase64 = await getBase64Async(imageBlob);
        // @ts-expect-error TS(2345) FIXME: Argument of type 'number' is not assignable to par... Remove this comment to see the full error message
        const thumbnailBase64 = await createThumbnail(imageBase64, THUMBNAIL_CONFIG.width, THUMBNAIL_CONFIG.height);
        // @ts-expect-error TS(2769) FIXME: No overload matches this call.
        const thumbnailBlob = await fetch(thumbnailBase64).then(res => res.blob());
        await THUMBNAIL_STORAGE.setItem(bg, thumbnailBlob);
        const blobUrl = URL.createObjectURL(thumbnailBlob);
        THUMBNAIL_BLOBS.set(bg, blobUrl);
        return blobUrl;
    } catch (error) {
        console.error('Error fetching thumbnail, fallback image will be used:', error);
        const fallbackBlob = PNG_PIXEL_BLOB;
        const fallbackBlobUrl = URL.createObjectURL(fallbackBlob);
        THUMBNAIL_BLOBS.set(bg, fallbackBlobUrl);
        return fallbackBlobUrl;
    }
}

/**
 * Gets the new background name from the user.
 * @param {Element} referenceElement
 * @returns {Promise<{oldBg: string, newBg: string}>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'referenceElement' implicitly has an 'an... Remove this comment to see the full error message
async function getNewBackgroundName(referenceElement) {
    const exampleBlock = referenceElement.closest('.bg_example');
    const isCustom = exampleBlock?.getAttribute('custom') === 'true';
    const oldBg = exampleBlock?.getAttribute('bgfile');

    if (!oldBg) {
        console.debug('no bgfile');
        return;
    }

    const fileExtension = oldBg.split('.').pop();
    const fileNameBase = isCustom ? oldBg.split('/').pop() : oldBg;
    const oldBgExtensionless = fileNameBase.replace(`.${fileExtension}`, '');
    const newBgExtensionless = await Popup.show.input(t`Enter new background name:`, null, oldBgExtensionless);

    if (!newBgExtensionless) {
        console.debug('no new_bg_extensionless');
        return;
    }

    const newBg = `${newBgExtensionless}.${fileExtension}`;

    if (oldBgExtensionless === newBgExtensionless) {
        console.debug('new_bg === old_bg');
        return;
    }

    return { oldBg, newBg };
}

/**
 *
 * @param e
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
async function onRenameBackgroundClick(e) {
    e.stopPropagation();

    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
    const bgNames = await getNewBackgroundName(this);

    if (!bgNames) {
        return;
    }

    const data = { old_bg: bgNames.oldBg, new_bg: bgNames.newBg };
    const response = await fetch('/api/backgrounds/rename', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(data),
        cache: 'no-cache',
    });

    if (response.ok) {
        await getBackgrounds();
        highlightNewBackground(bgNames.newBg);
    } else {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning('Failed to rename background');
    }
}

/**
 *
 * @param e
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
async function onDeleteBackgroundClick(e) {
    e.stopPropagation();
    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
    const bgToDelete = this.closest('.bg_example');
    const url = bgToDelete?.dataset.url;
    const isCustom = bgToDelete?.getAttribute('custom') === 'true';
    const deleteFromServerId = 'delete_bg_from_server';
    /** @type {import('./popup.js').CustomPopupInput[]} */
    const customInputs = [{
        type: 'checkbox',
        label: t`Also delete file from server`,
        id: deleteFromServerId,
        defaultState: true,
    }];
    let deleteFromServer = false;
    const confirm = await Popup.show.confirm(t`Delete the background?`, null, {
        customInputs: isCustom ? customInputs : [],
        // @ts-expect-error TS(7006) FIXME: Parameter 'popup' implicitly has an 'any' type.
        onClose: (popup) => {
            if (isCustom) {
                deleteFromServer = Boolean(popup?.inputResults?.get(deleteFromServerId) ?? false);
            }
        },
    });
    const bg = bgToDelete?.getAttribute('bgfile');

    if (confirm) {
        // If it's not custom, it's a built-in background. Delete it from the server
        if (!isCustom) {
            await delBackground(bg);
            // Remove from cache to prevent reappearing on sort change
            // @ts-expect-error TS(7005) FIXME: Variable 'cachedSystemBackgrounds' implicitly has ... Remove this comment to see the full error message
            const cacheIndex = cachedSystemBackgrounds.findIndex(s => s.filename === bg);
            if (cacheIndex !== -1) {
                // @ts-expect-error TS(7005) FIXME: Variable 'cachedSystemBackgrounds' implicitly has ... Remove this comment to see the full error message
                cachedSystemBackgrounds.splice(cacheIndex, 1);
            }
        } else {
            const list = chat_metadata[LIST_METADATA_KEY] || [];
            const index = list.indexOf(bg);
            list.splice(index, 1);
        }

        if (bg === background_settings.name || url === chat_metadata[BG_METADATA_KEY]) {
            const siblingSelector = '.bg_example';
            const nextBg = bgToDelete?.nextElementSibling?.matches(siblingSelector) ? bgToDelete.nextElementSibling : null;
            const prevBg = bgToDelete?.previousElementSibling?.matches(siblingSelector) ? bgToDelete.previousElementSibling : null;

            if (nextBg) {
                nextBg.click();
            } else if (prevBg) {
                prevBg.click();
            } else {
                const anyOtherBg = Array.from(document.querySelectorAll('.bg_example')).find(el => el !== bgToDelete);
                if (anyOtherBg) {
                    // @ts-expect-error TS(2339) FIXME: Property 'click' does not exist on type 'Element'.
                    anyOtherBg.click();
                }
            }
        }

        // Remove from local image list so it doesn't reappear on re-render
        const deletedBg = bgToDelete?.getAttribute('bgfile');
        if (deletedBg) {
            // @ts-expect-error TS(7005) FIXME: Variable 'cachedSystemBackgrounds' implicitly has ... Remove this comment to see the full error message
            const cachedIdx = cachedSystemBackgrounds.findIndex(img => img.filename === deletedBg);
            // @ts-expect-error TS(7005) FIXME: Variable 'cachedSystemBackgrounds' implicitly has ... Remove this comment to see the full error message
            if (cachedIdx !== -1) cachedSystemBackgrounds.splice(cachedIdx, 1);
            selectedSystemBackgroundFiles.delete(deletedBg);

            // Update folder map and clear folder thumbnail if it referenced this image
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            if (imageFolderMap[deletedBg]) {
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                delete imageFolderMap[deletedBg];
            }
            // @ts-expect-error TS(7005) FIXME: Variable 'folderList' implicitly has an 'any[]' ty... Remove this comment to see the full error message
            for (const folder of folderList) {
                if (folder.thumbnailFile === deletedBg) {
                    folder.thumbnailFile = '';
                }
            }
            renderFolderGrid();
        }

        bgToDelete?.remove();

        if (url === chat_metadata[BG_METADATA_KEY]) {
            removeBackgroundMetadata();
        }

        if (isCustom) {
            if (deleteFromServer) {
                await deleteMediaFromServer(bg);
            }
            // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
            renderChatBackgrounds();
            await saveMetadata();
        }

        highlightLockedBackground();
        highlightSelectedBackground();
        syncGroupSelectionUi();
    }
}

const autoBgPrompt = 'Ignore previous instructions and choose a location ONLY from the provided list that is the most suitable for the current scene. Do not output any other text:\n{0}';

/**
 *
 */
async function autoBackgroundCommand() {
    /** @type {HTMLElement[]} */
    const bgTitles = Array.from(document.querySelectorAll('#bg_menu_content .BGSampleTitle'));
    // @ts-expect-error TS(2339) FIXME: Property 'innerText' does not exist on type 'Eleme... Remove this comment to see the full error message
    const options = bgTitles.map(x => ({ element: x, text: x.innerText.trim() })).filter(x => x.text.length > 0);
    if (options.length == 0) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning('No backgrounds to choose from. Please upload some images to the "backgrounds" folder.');
        return '';
    }

    const list = options.map(option => `- ${option.text}`).join('\n');
    const prompt = stringFormat(autoBgPrompt, list);
    const reply = await generateQuietPrompt({ quietPrompt: prompt });
    const fuse = new Fuse(options, { keys: ['text'] });
    const bestMatch = fuse.search(reply, { limit: 1 });

    if (bestMatch.length == 0) {
        for (const option of options) {
            if (String(reply).toLowerCase().includes(option.text.toLowerCase())) {
                console.debug('Fallback choosing background:', option);
                // @ts-expect-error TS(2339) FIXME: Property 'click' does not exist on type 'Element'.
                option.element.click();
                return '';
            }
        }

        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning('No match found. Please try again.');
        return '';
    }

    console.debug('Automatically choosing background:', bestMatch);
    (bestMatch[0]?.item?.element as HTMLElement)?.click();
    return '';
}

/**
 * Renders the system backgrounds gallery.
 * @param {Array<{filename: string, isAnimated: boolean}>} [backgrounds] - Optional filtered list of backgrounds with metadata.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'backgrounds' implicitly has an 'any' ty... Remove this comment to see the full error message
function renderSystemBackgrounds(backgrounds) {
    const sourceList = backgrounds || [];
    const container = document.getElementById('bg_menu_content');
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    container.innerHTML = '';

    if (sourceList.length === 0) {
        syncGroupSelectionUi();
        return;
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'bg' implicitly has an 'any' type.
    const sortedList = sortBackgrounds(sourceList.map(bg => bg.filename), false);
    // @ts-expect-error TS(7006) FIXME: Parameter 'bg' implicitly has an 'any' type.
    const metadataByFilename = new Map(sourceList.map(bg => [bg.filename, bg]));
    sortedList.forEach(filename => {
        const bg = metadataByFilename.get(filename);
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        const imageData = { filename, isCustom: false, isAnimated: bg?.isAnimated ?? false };
        const thumbnail = createThumbnailElement(imageData);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        container.append(thumbnail);
    });

    syncGroupSelectionUi();
    activateLazyLoader();
}

/**
 * Renders the chat-specific (custom) backgrounds gallery.
 * @param {string[]} [backgrounds] - Optional filtered list of backgrounds.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'backgrounds' implicitly has an 'any' ty... Remove this comment to see the full error message
function renderChatBackgrounds(backgrounds) {
    const sourceList = backgrounds ?? (chat_metadata[LIST_METADATA_KEY] || []);
    const container = document.getElementById('bg_custom_content');
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    container.innerHTML = '';
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg_chat_hint').toggle(!sourceList.length);

    if (sourceList.length === 0) return;

    const sortedList = sortBackgrounds(sourceList, true);
    sortedList.forEach(bg => {
        // For custom backgrounds, infer isAnimated from extension since we don't have server metadata
        const isAnimated = isAnimatedBackgroundExtension(bg);
        const imageData = { filename: bg, isCustom: true, isAnimated };
        const thumbnail = createThumbnailElement(imageData);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        container.append(thumbnail);
    });

    activateLazyLoader();
}

/**
 *
 */
export async function getBackgrounds() {
    const response = await fetch('/api/backgrounds/all', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({}),
    });
    if (response.ok) {
        const { images, config } = await response.json();
        Object.assign(THUMBNAIL_CONFIG, config);
        cachedSystemBackgrounds = images;
        // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
        const existingFiles = new Set(images.map(x => x.filename));
        for (const selectedFile of selectedSystemBackgroundFiles) {
            if (!existingFiles.has(selectedFile)) {
                selectedSystemBackgroundFiles.delete(selectedFile);
            }
        }

        // Load folders first so getFilteredImages() works correctly in folder view
        await loadFolders();

        await preloadImageMetadata();

        // Render only filtered images if inside a folder, otherwise all
        renderSystemBackgrounds(getFilteredImages());
        highlightSelectedBackground();
    }
}

/**
 * Preloads all image metadata to use dominant colors as placeholders.
 * @returns {Promise<void>}
 */
async function preloadImageMetadata() {
    try {
        const response = await fetch('/api/image-metadata/all', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ prefix: 'backgrounds/' }),
        });
        if (response.ok) {
            const data = await response.json();
            if (data?.images) {
                METADATA_CACHE.clear();
                for (const [path, metadata] of Object.entries(data.images)) {
                    METADATA_CACHE.set(path, metadata);
                }
            }
        }
    } catch (error) {
        console.error('[ImageMetadata] Failed to preload metadata:', error);
    }
}

/**
 * Loads folder data from the server (separate from image loading).
 */
async function loadFolders() {
    try {
        const response = await fetch('/api/backgrounds/folders', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({}),
        });
        if (response.ok) {
            const data = await response.json();
            folderList = data.folders || [];
            imageFolderMap = data.imageFolderMap || {};

            // Auto-assign thumbnail for folders that don't have one, then persist
            // @ts-expect-error TS(7005) FIXME: Variable 'cachedSystemBackgrounds' implicitly has ... Remove this comment to see the full error message
            const allImages = cachedSystemBackgrounds.map(img => img.filename);
            /** @type {{id: string, thumbnailFile: string}[]} */
            const thumbnailUpdates = [];
            for (const folder of folderList) {
                if (!folder.thumbnailFile) {
                    const firstImage = allImages.find(img => {
                        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                        const fids = imageFolderMap[img];
                        return fids && fids.includes(folder.id);
                    });
                    if (firstImage) {
                        folder.thumbnailFile = firstImage;
                        thumbnailUpdates.push({ id: folder.id, thumbnailFile: firstImage });
                    }
                }
            }
            if (thumbnailUpdates.length > 0) {
                await fetch('/api/image-metadata/folders/set-thumbnails', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({ updates: thumbnailUpdates }),
                }).catch(err => console.debug('Auto-thumbnail save failed:', err));
            }

            renderFolderGrid();
        }
    } catch (error) {
        console.error('Error loading folders:', error);
    }
}

/**
 * Renders the folder grid inside #bg_folder_grid.
 */
function renderFolderGrid() {
    const container = document.getElementById('bg_folder_grid');
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    container.innerHTML = '';

    // @ts-expect-error TS(7005) FIXME: Variable 'activeFolderId' implicitly has an 'any' ... Remove this comment to see the full error message
    if (folderList.length === 0 && !activeFolderId) {
        return;
    }

    // @ts-expect-error TS(7005) FIXME: Variable 'folderList' implicitly has an 'any[]' ty... Remove this comment to see the full error message
    for (const folder of folderList) {
        const tile = createFolderTileElement(folder);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        container.append(tile);
    }
}

/**
 * Creates a single folder tile DOM element.
 * @param {{id: string, name: string, thumbnailFile: string}} folder
 * @returns {HTMLElement}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'folder' implicitly has an 'any' type.
function createFolderTileElement(folder) {
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    const tile = document.querySelector('#bg_folder_tile_template .bg_folder_tile').cloneNode(true);
    // @ts-expect-error TS(2339) FIXME: Property 'attr' does not exist on type 'Node'.
    tile.attr('data-folder-id', folder.id);
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    tile[0].querySelector('.bg_folder_tile_name').textContent = folder.name;

    // Set cover image (async, update when resolved)
    getFolderCoverUrl(folder).then(coverUrl => {
        if (coverUrl) {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            tile[0].querySelector('.bg_folder_tile_cover').style.backgroundImage = `url("${coverUrl}")`;
        }
    });

    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    return tile[0];
}

/**
 * Gets the cover image URL for a folder.
 * Uses thumbnailFile if set, otherwise falls back to the first image in the folder.
 * @param {{id: string, name: string, thumbnailFile: string}} folder
 * @returns {Promise<string|null>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'folder' implicitly has an 'any' type.
async function getFolderCoverUrl(folder) {
    // @ts-expect-error TS(7005) FIXME: Variable 'cachedSystemBackgrounds' implicitly has ... Remove this comment to see the full error message
    const file = folder.thumbnailFile || cachedSystemBackgrounds.find(img => {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        const fids = imageFolderMap[img.filename];
        return fids && fids.includes(folder.id);
    })?.filename;
    if (!file) return null;

    if (isAnimatedBackgroundExtension(file) && !background_settings.animation) {
        return getThumbnailFromStorage(file, false);
    }
    return getThumbnailUrl('bg', file);
}

/**
 * Gets images filtered by the active folder.
 * @returns {Array<{filename: string, isAnimated: boolean}>}
 */
function getFilteredImages() {
    // @ts-expect-error TS(7005) FIXME: Variable 'activeFolderId' implicitly has an 'any' ... Remove this comment to see the full error message
    if (!activeFolderId) return cachedSystemBackgrounds;
    // @ts-expect-error TS(7005) FIXME: Variable 'cachedSystemBackgrounds' implicitly has ... Remove this comment to see the full error message
    return cachedSystemBackgrounds.filter(img => {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        const fids = imageFolderMap[img.filename];
        // @ts-expect-error TS(7005) FIXME: Variable 'activeFolderId' implicitly has an 'any' ... Remove this comment to see the full error message
        return fids && fids.includes(activeFolderId);
    });
}

/**
 * Drills into a folder — hides folder grid, shows breadcrumb, filters images.
 * @param {string} folderId
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'folderId' implicitly has an 'any' type.
function onFolderDrillIn(folderId) {
    // @ts-expect-error TS(7005) FIXME: Variable 'folderList' implicitly has an 'any[]' ty... Remove this comment to see the full error message
    const folder = folderList.find(f => f.id === folderId);
    if (!folder) return;

    clearBackgroundGroupSelection();
    activeFolderId = folderId;
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    document.getElementById('Backgrounds').classList.add('in-folder-view');

    // Hide folder grid, show breadcrumb
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg_folder_grid').hide();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg_folder_breadcrumb').show();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg_current_folder_name').text(folder.name);

    // Render only this folder's images
    renderSystemBackgrounds(getFilteredImages());
    highlightSelectedBackground();
}

/**
 * Returns to the root folder overview.
 */
function onBackToFolders() {
    clearBackgroundGroupSelection();
    activeFolderId = null;
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    document.getElementById('Backgrounds').classList.remove('in-folder-view');

    // Show folder grid, hide breadcrumb
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg_folder_grid').show();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg_folder_breadcrumb').hide();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg_current_folder_name').text('');

    // Show all images
    renderSystemBackgrounds(getFilteredImages());
    highlightSelectedBackground();
}

/**
 * Refreshes click-to-select and group action UI state.
 */
function syncGroupSelectionUi() {
    const selectedCount = selectedSystemBackgroundFiles.size;
    const isGlobalTab = getActiveBackgroundTab() === BG_SOURCES.GLOBAL;
    const showAddButton = isGlobalTab && isBackgroundSelectionMode && selectedCount > 0;
    // @ts-expect-error TS(7005) FIXME: Variable 'activeFolderId' implicitly has an 'any' ... Remove this comment to see the full error message
    const showRemoveFromCurrentFolderButton = isGlobalTab && Boolean(activeFolderId) && isBackgroundSelectionMode && selectedCount > 0;

    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    document.getElementById('Backgrounds').classList.toggle('bg-selection-mode', isBackgroundSelectionMode);
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    document.getElementById('bg_selection_mode_button').classList.toggle('active', isBackgroundSelectionMode);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg_group_select_count').text(selectedCount > 0 ? ` (${selectedCount})` : '').toggle(selectedCount > 0);

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg_group_add_to_folder_button').toggle(showAddButton);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg_folder_remove_selected_button').toggle(showRemoveFromCurrentFolderButton);

    document.querySelectorAll('#bg_menu_content .bg_example').forEach(el => {
        const bgFile = String(el.getAttribute('bgfile') || '');
        el.classList.toggle('folder-group-selected', selectedSystemBackgroundFiles.has(bgFile));
    });
}

/**
 * Enables/disables click-to-select mode for system backgrounds.
 * @param {boolean} enabled
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'enabled' implicitly has an 'any' type.
function setBackgroundSelectionMode(enabled) {
    isBackgroundSelectionMode = enabled;
    if (!enabled) {
        selectedSystemBackgroundFiles.clear();
    }
    // Clear any open mobile menus
    document.querySelectorAll('#bg_menu_content .bg_example.mobile-menu-open').forEach(el => el.classList.remove('mobile-menu-open'));
    syncGroupSelectionUi();
}

/**
 * Toggles selected state of a system background for group folder actions.
 * @param {string} bgFile
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'bgFile' implicitly has an 'any' type.
function toggleBackgroundGroupSelection(bgFile) {
    if (!bgFile) return;
    if (selectedSystemBackgroundFiles.has(bgFile)) {
        selectedSystemBackgroundFiles.delete(bgFile);
    } else {
        selectedSystemBackgroundFiles.add(bgFile);
    }
    syncGroupSelectionUi();
}

/**
 * Clears all selected system backgrounds for group folder actions.
 */
function clearBackgroundGroupSelection() {
    selectedSystemBackgroundFiles.clear();
    syncGroupSelectionUi();
}

/**
 * Updates selection/folder action control visibility for the active tab.
 */
function updateGroupFolderControlsVisibility() {
    const isGlobalTab = getActiveBackgroundTab() === BG_SOURCES.GLOBAL;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg_selection_mode_button').toggle(isGlobalTab);

    if (!isGlobalTab && isBackgroundSelectionMode) {
        setBackgroundSelectionMode(false);
        return;
    }
    syncGroupSelectionUi();
}

/**
 * Shows a folder selection popup and returns the selected folder id.
 * @param {string} headingText
 * @returns {Promise<string[]|null>} Array of selected folder IDs, or null if cancelled
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'headingText' implicitly has an 'any' ty... Remove this comment to see the full error message
async function selectFoldersForGroupAction(headingText) {
    if (folderList.length === 0) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info(t`Create a folder first`);
        return null;
    }

    const contentEl = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = headingText;
    contentEl.appendChild(heading);

    // @ts-expect-error TS(7005) FIXME: Variable 'folderList' implicitly has an 'any[]' ty... Remove this comment to see the full error message
    for (const folder of folderList) {
        const label = document.createElement('label');
        label.className = 'checkbox_label flexGap5';
        label.style.margin = '4px 0';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.folderId = folder.id;

        const span = document.createElement('span');
        span.textContent = folder.name;

        label.appendChild(checkbox);
        label.appendChild(span);
        contentEl.appendChild(label);
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const content = $(contentEl);
    const result = await callGenericPopup(content, POPUP_TYPE.CONFIRM, '', {
        okButton: t`Apply`,
        cancelButton: t`Cancel`,
        allowVerticalScrolling: true,
        leftAlign: true,
    });
    if (!result) return null;

    // @ts-expect-error TS(7034) FIXME: Variable 'selectedIds' implicitly has type 'any[]'... Remove this comment to see the full error message
    const selectedIds = [];
    // @ts-expect-error TS(7006) FIXME: Parameter 'checkbox' implicitly has an 'any' type.
    content[0].querySelectorAll('input[type="checkbox"]:checked').forEach(function (checkbox) {
        selectedIds.push(checkbox.dataset.folderId);
    });
    // @ts-expect-error TS(7005) FIXME: Variable 'selectedIds' implicitly has an 'any[]' t... Remove this comment to see the full error message
    return selectedIds.length > 0 ? selectedIds : null;
}

/**
 * Sends a folder assign/unassign request and updates local imageFolderMap state.
 * @param {string[]} bgFiles - Background filenames to update
 * @param {string} folderId - Target folder ID
 * @param {boolean} isRemove - Whether to remove (unassign) or add (assign)
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'bgFiles' implicitly has an 'any' type.
async function updateFolderAssignments(bgFiles, folderId, isRemove) {
    const paths = bgFiles.map(getBackgroundRelativePath);
    const endpoint = isRemove ? '/api/image-metadata/folders/unassign' : '/api/image-metadata/folders/assign';

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ id: folderId, paths }),
    });

    if (!response.ok) {
        throw new Error(`Folder ${isRemove ? 'unassign' : 'assign'} failed: ${response.status}`);
    }

    for (const bgFile of bgFiles) {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        const currentFolderIds = imageFolderMap[bgFile] || [];
        if (isRemove) {
            // @ts-expect-error TS(7006) FIXME: Parameter 'id' implicitly has an 'any' type.
            const nextFolderIds = currentFolderIds.filter(id => id !== folderId);
            if (nextFolderIds.length > 0) {
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                imageFolderMap[bgFile] = nextFolderIds;
            } else {
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                delete imageFolderMap[bgFile];
            }
        } else if (!currentFolderIds.includes(folderId)) {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            imageFolderMap[bgFile] = [...currentFolderIds, folderId];
        }
    }
}

/**
 * Adds selected system backgrounds to a chosen folder.
 */
async function onAddSelectedToFolder() {
    if (getActiveBackgroundTab() !== BG_SOURCES.GLOBAL) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning(t`Folder actions are only available in the Global tab`);
        return;
    }

    const bgFiles = Array.from(selectedSystemBackgroundFiles);
    if (bgFiles.length === 0) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info(t`Select one or more backgrounds first`);
        return;
    }

    const folderIds = await selectFoldersForGroupAction(t`Add selected backgrounds to folders`);
    if (!folderIds) return;

    try {
        let totalAdded = 0;
        for (const folderId of folderIds) {
            const actionableBgFiles = bgFiles.filter(bgFile => {
                // @ts-expect-error TS(2538) FIXME: Type 'unknown' cannot be used as an index type.
                const currentFolderIds = imageFolderMap[bgFile] || [];
                return !currentFolderIds.includes(folderId);
            });
            if (actionableBgFiles.length > 0) {
                await updateFolderAssignments(actionableBgFiles, folderId, false);
                totalAdded += actionableBgFiles.length;
            }
        }

        renderFolderGrid();

        // @ts-expect-error TS(7005) FIXME: Variable 'activeFolderId' implicitly has an 'any' ... Remove this comment to see the full error message
        if (activeFolderId) {
            renderSystemBackgrounds(getFilteredImages());
            highlightSelectedBackground();
        }

        setBackgroundSelectionMode(false);
        if (totalAdded > 0) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.success(t`Added backgrounds to ${folderIds.length} folder(s)`);
        } else {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.info(t`Selected backgrounds are already in the chosen folders`);
        }
    } catch (error) {
        console.error('Error adding selected backgrounds to folder:', error);
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`Failed to update folder assignment`);
    }
}

/**
 * Removes selected system backgrounds from the currently drilled-in folder.
 */
async function onRemoveSelectedFromCurrentFolder() {
    if (getActiveBackgroundTab() !== BG_SOURCES.GLOBAL) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning(t`Folder actions are only available in the Global tab`);
        return;
    }

    // @ts-expect-error TS(7005) FIXME: Variable 'activeFolderId' implicitly has an 'any' ... Remove this comment to see the full error message
    if (!activeFolderId) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info(t`Open a folder first`);
        return;
    }

    const bgFiles = Array.from(selectedSystemBackgroundFiles);
    if (bgFiles.length === 0) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info(t`Select one or more backgrounds first`);
        return;
    }

    try {
        await updateFolderAssignments(bgFiles, activeFolderId, true);
        renderFolderGrid();
        renderSystemBackgrounds(getFilteredImages());
        highlightSelectedBackground();
        setBackgroundSelectionMode(false);
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success(t`Removed ${bgFiles.length} background(s) from folder`);
    } catch (error) {
        console.error('Error removing selected backgrounds from current folder:', error);
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`Failed to update folder assignment`);
    }
}

/**
 * Creates a new folder via API.
 */
async function onCreateFolder() {
    const currentTab = getActiveBackgroundTab();
    if (currentTab !== BG_SOURCES.GLOBAL) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning(t`Folders can only be created in the Global tab`);
        return;
    }

    // @ts-expect-error TS(2554) FIXME: Expected 2-4 arguments, but got 1.
    const name = await Popup.show.input(t`Enter folder name:`);
    if (!name || !name.trim()) return;

    try {
        const response = await fetch('/api/image-metadata/folders/create', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name: name.trim() }),
        });
        if (response.ok) {
            const folder = await response.json();
            folderList.push(folder);
            renderFolderGrid();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.success(t`Folder created: ${folder.name}`);
        }
    } catch (error) {
        console.error('Error creating folder:', error);
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`Failed to create folder`);
    }
}

/**
 * Renames a folder via API.
 * @param {string} folderId
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'folderId' implicitly has an 'any' type.
async function onRenameFolder(folderId) {
    // @ts-expect-error TS(7005) FIXME: Variable 'folderList' implicitly has an 'any[]' ty... Remove this comment to see the full error message
    const folder = folderList.find(f => f.id === folderId);
    if (!folder) return;

    const newName = await Popup.show.input(t`Enter new folder name:`, null, folder.name);
    if (!newName || !newName.trim() || newName.trim() === folder.name) return;

    try {
        const response = await fetch('/api/image-metadata/folders/update', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ id: folderId, name: newName.trim() }),
        });
        if (response.ok) {
            folder.name = newName.trim();
            renderFolderGrid();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.success(t`Folder renamed`);
        }
    } catch (error) {
        console.error('Error renaming folder:', error);
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`Failed to rename folder`);
    }
}

/**
 * Deletes a folder via API.
 * @param {string} folderId
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'folderId' implicitly has an 'any' type.
async function onDeleteFolder(folderId) {
    // @ts-expect-error TS(7005) FIXME: Variable 'folderList' implicitly has an 'any[]' ty... Remove this comment to see the full error message
    const folder = folderList.find(f => f.id === folderId);
    if (!folder) return;

    const confirm = await Popup.show.confirm(t`Delete folder "${folder.name}"?`, t`Images will not be deleted, only the folder grouping.`);
    if (!confirm) return;

    try {
        const response = await fetch('/api/image-metadata/folders/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ id: folderId }),
        });
        if (response.ok) {
            // @ts-expect-error TS(7005) FIXME: Variable 'folderList' implicitly has an 'any[]' ty... Remove this comment to see the full error message
            folderList = folderList.filter(f => f.id !== folderId);
            // Clean imageFolderMap
            for (const fids of Object.values(imageFolderMap)) {
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                const idx = fids.indexOf(folderId);
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                if (idx !== -1) fids.splice(idx, 1);
            }
            // If we were inside this folder, go back
            // @ts-expect-error TS(7005) FIXME: Variable 'activeFolderId' implicitly has an 'any' ... Remove this comment to see the full error message
            if (activeFolderId === folderId) {
                onBackToFolders();
            }
            renderFolderGrid();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.success(t`Folder deleted`);
        }
    } catch (error) {
        console.error('Error deleting folder:', error);
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`Failed to delete folder`);
    }
}

/**
 * Shows a folder assignment popup for an image.
 * @param {string} bgFile - The background filename
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'bgFile' implicitly has an 'any' type.
async function onAssignToFolder(bgFile) {
    if (folderList.length === 0) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info(t`Create a folder first`);
        return;
    }

    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    const currentFolderIds = imageFolderMap[bgFile] || [];

    // Build checkbox inputs for Popup using DOM construction (avoids HTML injection)
    const contentEl = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = t`Assign to folders`;
    contentEl.appendChild(heading);

    // @ts-expect-error TS(7005) FIXME: Variable 'folderList' implicitly has an 'any[]' ty... Remove this comment to see the full error message
    for (const f of folderList) {
        const label = document.createElement('label');
        label.className = 'checkbox_label flexGap5';
        label.style.margin = '4px 0';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.folderId = f.id;
        checkbox.checked = currentFolderIds.includes(f.id);

        const span = document.createElement('span');
        span.textContent = f.name;

        label.appendChild(checkbox);
        label.appendChild(span);
        contentEl.appendChild(label);
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const content = $(contentEl);

    const result = await callGenericPopup(content, POPUP_TYPE.CONFIRM, '', { okButton: t`Save`, cancelButton: t`Cancel` });
    if (!result) return;

    // Determine which folders were toggled on/off
    // @ts-expect-error TS(7034) FIXME: Variable 'toAssign' implicitly has type 'any[]' in... Remove this comment to see the full error message
    const toAssign = [];
    // @ts-expect-error TS(7034) FIXME: Variable 'toUnassign' implicitly has type 'any[]' ... Remove this comment to see the full error message
    const toUnassign = [];
    // @ts-expect-error TS(7006) FIXME: Parameter 'checkbox' implicitly has an 'any' type.
    content[0].querySelectorAll('input[type="checkbox"]').forEach(function (checkbox) {
        const fid = checkbox.dataset.folderId;
        const isChecked = checkbox.checked;
        const wasChecked = currentFolderIds.includes(fid);
        if (isChecked && !wasChecked) toAssign.push(fid);
        if (!isChecked && wasChecked) toUnassign.push(fid);
    });

    try {
        // @ts-expect-error TS(7005) FIXME: Variable 'toAssign' implicitly has an 'any[]' type... Remove this comment to see the full error message
        for (const fid of toAssign) {
            await updateFolderAssignments([bgFile], fid, false);
        }
        // @ts-expect-error TS(7005) FIXME: Variable 'toUnassign' implicitly has an 'any[]' ty... Remove this comment to see the full error message
        for (const fid of toUnassign) {
            await updateFolderAssignments([bgFile], fid, true);
        }

        renderFolderGrid();

        // Re-render filtered image list if currently inside a folder view
        // @ts-expect-error TS(7005) FIXME: Variable 'activeFolderId' implicitly has an 'any' ... Remove this comment to see the full error message
        if (activeFolderId) {
            renderSystemBackgrounds(getFilteredImages());
            highlightSelectedBackground();
        }

        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success(t`Folder assignment updated`);
    } catch (error) {
        console.error('Error assigning to folder:', error);
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`Failed to update folder assignment`);
    }
}

/**
 * Sets an image as the folder cover.
 * @param {string} bgFile - The background filename
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'bgFile' implicitly has an 'any' type.
async function onSetFolderCover(bgFile) {
    // @ts-expect-error TS(7005) FIXME: Variable 'activeFolderId' implicitly has an 'any' ... Remove this comment to see the full error message
    if (!activeFolderId) return;

    try {
        const response = await fetch('/api/image-metadata/folders/update', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ id: activeFolderId, thumbnailFile: bgFile }),
        });
        if (response.ok) {
            // @ts-expect-error TS(7005) FIXME: Variable 'folderList' implicitly has an 'any[]' ty... Remove this comment to see the full error message
            const folder = folderList.find(f => f.id === activeFolderId);
            if (folder) {
                folder.thumbnailFile = bgFile;
                // Update the DOM tile cover image
                const coverUrl = await getFolderCoverUrl(folder);
                if (coverUrl) {
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $(`.bg_folder_tile[data-folder-id="${folder.id}"] .bg_folder_tile_cover`)
                        .css('background-image', `url('${coverUrl}')`);
                }
            }
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.success(t`Folder cover updated`);
        }
    } catch (error) {
        console.error('Error setting folder cover:', error);
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`Failed to set folder cover`);
    }
}

/**
 *
 */
function activateLazyLoader() {
    // Disconnect previous observer to prevent memory leaks
    if (lazyLoadObserver) {
        lazyLoadObserver.disconnect();
        lazyLoadObserver = null;
    }

    const lazyLoadElements = document.querySelectorAll('.lazy-load-background');

    const options = {
        root: null,
        rootMargin: '200px',
        threshold: 0.01,
    };

    lazyLoadObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.target instanceof HTMLElement && entry.isIntersecting) {
                const clipper = entry.target;
                const parentThumbnail = clipper.closest('.bg_example');

                if (parentThumbnail) {
                    const bg = parentThumbnail.getAttribute('bgfile');
                    const isCustom = parentThumbnail.getAttribute('custom') === 'true';
                    const isAnimated = parentThumbnail.getAttribute('animated') === 'true';
                    // @ts-expect-error TS(2345) FIXME: Argument of type 'boolean' is not assignable to pa... Remove this comment to see the full error message
                    resolveImageUrl(bg, isCustom, isAnimated)
                        .then(url => { clipper.style.backgroundImage = url; })
                        .catch(() => { clipper.style.backgroundImage = PLACEHOLDER_IMAGE; });
                }

                clipper.classList.remove('lazy-load-background');
                observer.unobserve(clipper);
            }
        });
    }, options);

    lazyLoadElements.forEach(element => {
        // @ts-expect-error TS(7005) FIXME: Variable 'lazyLoadObserver' implicitly has an 'any... Remove this comment to see the full error message
        lazyLoadObserver.observe(element);
    });
}

/**
 * Gets the CSS URL of the background
 * @param {Element} block
 * @returns {string} URL of the background
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'block' implicitly has an 'any' type.
function getUrlParameter(block) {
    return block.closest('.bg_example')?.dataset.url;
}

/**
 *
 * @param bg
 * @param isCustom
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'bg' implicitly has an 'any' type.
function generateUrlParameter(bg, isCustom) {
    return isCustom ? `url("${encodeURI(bg)}")` : `url("${getBackgroundPath(bg)}")`;
}

/**
 *
 * @param fileName
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'fileName' implicitly has an 'any' type.
function isAnimatedBackgroundExtension(fileName) {
    const fileExtension = fileName.split('.').pop().toLowerCase();
    return ANIMATED_BACKGROUND_EXTENSIONS.includes(fileExtension);
}

/**
 * Resolves the image URL for the background.
 * @param {string} bg Background file name
 * @param {boolean} isCustom Is a custom background
 * @param {boolean|null} [isAnimated] Is the background animated (from metadata). If null, infers from extension.
 * @returns {Promise<string>} CSS URL of the background
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'bg' implicitly has an 'any' type.
async function resolveImageUrl(bg, isCustom, isAnimated = null) {
    // If isAnimated is not provided (null), fall back to extension-based heuristic
    let animated = isAnimated;
    if (animated === null) {
        // @ts-expect-error TS(2322) FIXME: Type 'boolean' is not assignable to type 'null'.
        animated = isAnimatedBackgroundExtension(bg);
    }

    const thumbnailUrl = animated && !background_settings.animation
        ? await getThumbnailFromStorage(bg, isCustom)
        : isCustom
            ? bg
            : getThumbnailUrl('bg', bg);

    return `url("${thumbnailUrl}")`;
}

/**
 *
 * @param bg
 * @param url
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'bg' implicitly has an 'any' type.
async function setBackground(bg, url) {
    // Only change the visual background if one is not locked for the current chat.
    if (!isChatBackgroundLocked()) {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#bg1').css('background-image', url);
    }
    background_settings.name = bg;
    background_settings.url = url;
    saveSettingsDebounced();
}

/**
 *
 * @param bg
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'bg' implicitly has an 'any' type.
async function delBackground(bg) {
    await fetch('/api/backgrounds/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            bg: bg,
        }),
    });

    await THUMBNAIL_STORAGE.removeItem(bg);
    if (THUMBNAIL_BLOBS.has(bg)) {
        URL.revokeObjectURL(THUMBNAIL_BLOBS.get(bg));
        THUMBNAIL_BLOBS.delete(bg);
    }
}

/**
 * Background upload handler.
 * @param {Event} e Event
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
async function onBackgroundUploadSelected(e) {
    const input = e.currentTarget;

    if (!(input instanceof HTMLInputElement)) {
        console.error('Invalid input element for background upload');
        return;
    }

    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    for (const file of input.files) {
        if (file.size === 0) {
            continue;
        }

        const formData = new FormData();
        formData.append('avatar', file);

        await convertFileIfVideo(formData);
        switch (getActiveBackgroundTab()) {
            case BG_SOURCES.GLOBAL:
                await uploadBackground(formData);
                break;
            case BG_SOURCES.CHAT:
                await uploadChatBackground(formData);
                break;
            default:
                console.error('Unknown background source type');
                continue;
        }
    }

    // Allow re-uploading the same file again by clearing the input value
    input.value = '';
}

/**
 * Converts a video file to an animated webp format if the file is a video.
 * @param {FormData} formData
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'formData' implicitly has an 'any' type.
async function convertFileIfVideo(formData) {
    const file = formData.get('avatar');
    if (!(file instanceof File)) {
        return;
    }
    if (!file.type.startsWith('video/')) {
        return;
    }
    if (typeof globalThis.convertVideoToAnimatedWebp !== 'function') {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning(t`Click here to install the Video Background Loader extension`, t`Video background uploads require a downloadable add-on`, {
            timeOut: 0,
            extendedTimeOut: 0,
            onclick: () => openThirdPartyExtensionMenu('https://github.com/SillyTavern/Extension-VideoBackgroundLoader'),
        });
        return;
    }

    // @ts-expect-error TS(2304) FIXME: Cannot find name 'jQuery'.
    let toastMessage = jQuery();
    try {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastMessage = toastr.info(t`Preparing video for upload. This may take several minutes.`, t`Please wait`, { timeOut: 0, extendedTimeOut: 0 });
        const sourceBuffer = await file.arrayBuffer();
        const convertedBuffer = await globalThis.convertVideoToAnimatedWebp({ buffer: new Uint8Array(sourceBuffer), name: file.name });
        const convertedFileName = file.name.replace(/\.[^/.]+$/, '.webp');
        const convertedFile = new File([new Uint8Array(convertedBuffer)], convertedFileName, { type: 'image/webp' });
        formData.set('avatar', convertedFile);
        toastMessage.remove();
    } catch (error) {
        formData.delete('avatar');
        toastMessage.remove();
        console.error('Error converting video to animated webp:', error);
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(t`Error converting video to animated webp`);
    }
}

/**
 * Uploads a background to the server
 * @param {FormData} formData
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'formData' implicitly has an 'any' type.
async function uploadBackground(formData) {
    try {
        if (!formData.has('avatar')) {
            console.log('No file provided. Background upload cancelled.');
            return;
        }

        const response = await fetch('/api/backgrounds/upload', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
            body: formData,
            cache: 'no-cache',
        });

        if (!response.ok) {
            throw new Error('Failed to upload background');
        }

        const bg = await response.text();
        setBackground(bg, generateUrlParameter(bg, false));
        await getBackgrounds();
        highlightNewBackground(bg);
    } catch (error) {
        console.error('Error uploading background:', error);
    }
}

/**
 * Upload a chat background using a FormData object.
 * @param {FormData} formData FormData containing the background file
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'formData' implicitly has an 'any' type.
async function uploadChatBackground(formData) {
    try {
        if (!getCurrentChatId()) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.warning(t`Select a chat to upload a background for it`);
            return;
        }
        if (!formData.has('avatar')) {
            console.log('No file provided. Chat background upload cancelled.');
            return;
        }

        const file = formData.get('avatar');
        if (!(file instanceof File)) {
            console.error('Invalid file type for chat background upload');
            return;
        }

        const imageDataUri = await getBase64Async(file);
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        const base64Data = imageDataUri.split(',')[1];
        const extension = getFileExtension(file);
        const characterName = selected_group
            ? groups.find(g => g.id === selected_group)?.id?.toString()
            : characters[this_chid]?.name;
        const filename = `${characterName}_${humanizedDateTime()}`;
        const imagePath = await saveBase64AsFile(base64Data, characterName, filename, extension);

        const list = chat_metadata[LIST_METADATA_KEY] || [];
        list.push(imagePath);
        chat_metadata[LIST_METADATA_KEY] = list;
        await saveMetadata();
        // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
        renderChatBackgrounds();
        highlightNewBackground(imagePath);
        highlightLockedBackground();
        highlightSelectedBackground();
    } catch (error) {
        console.error('Error uploading chat background:', error);
    }
}

/**
 * @param {string} bg
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'bg' implicitly has an 'any' type.
function highlightNewBackground(bg) {
    const newBg = document.querySelector(`.bg_example[bgfile="${bg}"]`);
    if (!newBg) return;
    const parent = newBg.parentElement;
    if (!parent) return;
    // @ts-expect-error TS(2339) FIXME: Property 'offsetTop' does not exist on type 'Eleme... Remove this comment to see the full error message
    const scrollOffset = newBg.offsetTop - parent.offsetTop;
    const bgContainer = document.querySelector('#Backgrounds');
    if (bgContainer) bgContainer.scrollTop = scrollOffset;
    flashHighlight(newBg);
}

/**
 * Sets the fitting class for the background element
 * @param {string} fitting Fitting type
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'fitting' implicitly has an 'any' type.
function setFittingClass(fitting) {
    const backgrounds = document.getElementById('bg1');
    for (const option of ['cover', 'contain', 'stretch', 'center']) {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        backgrounds.classList.toggle(option, option === fitting);
    }
    background_settings.fitting = fitting;
}

/**
 *
 */
function highlightSelectedBackground() {
    document.querySelectorAll('.bg_example.selected-background').forEach(el => el.classList.remove('selected-background'));

    // The "selected" highlight should always reflect the global background setting.
    const activeUrl = background_settings.url;

    if (activeUrl) {
        // Find the thumbnail whose data-url attribute matches the active URL
        document.querySelectorAll('.bg_example').forEach(el => {
            // @ts-expect-error TS(2339) FIXME: Property 'dataset' does not exist on type 'Element... Remove this comment to see the full error message
            if (el.dataset.url === activeUrl) {
                el.classList.add('selected-background');
            }
        });
    }
}

/**
 *
 */
function onBackgroundFilterInput() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const filterValue = String($('#bg-filter').val()).toLowerCase();
    document.querySelectorAll('#bg_menu_content > .bg_example, #bg_custom_content > .bg_example').forEach(function (el) {
        const title = el.getAttribute('title') || '';
        const hasMatch = title.toLowerCase().includes(filterValue);
        // @ts-expect-error TS(2339) FIXME: Property 'style' does not exist on type 'Element'.
        el.style.display = hasMatch ? '' : 'none';
    });

    // Show/hide folder tiles based on whether folder name matches the filter
    // @ts-expect-error TS(7005) FIXME: Variable 'activeFolderId' implicitly has an 'any' ... Remove this comment to see the full error message
    if (!activeFolderId) {
        document.querySelectorAll('#bg_folder_grid .bg_folder_tile').forEach(function (el) {
            const folderId = el.getAttribute('data-folder-id');
            if (!folderId || !filterValue) {
                // @ts-expect-error TS(2339) FIXME: Property 'style' does not exist on type 'Element'.
                el.style.display = '';
                return;
            }
            // @ts-expect-error TS(7005) FIXME: Variable 'folderList' implicitly has an 'any[]' ty... Remove this comment to see the full error message
            const folder = folderList.find(f => f.id === folderId);
            const folderName = folder ? folder.name.toLowerCase() : '';
            // @ts-expect-error TS(2339) FIXME: Property 'style' does not exist on type 'Element'.
            el.style.display = folderName.includes(filterValue) ? '' : 'none';
        });
    }
}

const debouncedOnBackgroundFilterInput = debounce(onBackgroundFilterInput, debounce_timeout.standard);

/**
 * Gets the active background tab source.
 * @returns {BG_SOURCES} Active background tab source
 */
export function getActiveBackgroundTab() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const tabs = $('#bg_tabs');
    if (!tabs.length || !tabs.data('ui-tabs')) {
        return BG_SOURCES.GLOBAL;
    }
    return tabs.tabs('option', 'active');
}

/**
 *
 */
export function initBackgrounds() {
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
    eventSource.on(event_types.FORCE_SET_BACKGROUND, forceSetBackground);

    // Folder event handlers
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document)
        // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
        .on('click', '.bg_folder_tile:not(.bg_new_folder_tile)', function (e) {
            if (e.target.closest('.jg-button')) return; // let button handler run
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const folderId = $(this).attr('data-folder-id');
            if (folderId) onFolderDrillIn(folderId);
        })
        .on('click', '#bg_add_folder_button', function () {
            onCreateFolder();
        })
        .on('click', '#bg_back_to_folders', function () {
            onBackToFolders();
        })
        // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
        .on('click', '.bg_folder_tile [data-action="rename-folder"]', function (e) {
            e.stopPropagation();
            // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
            const folderId = this.closest('.bg_folder_tile')?.getAttribute('data-folder-id');
            if (folderId) onRenameFolder(folderId);
        })
        // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
        .on('click', '.bg_folder_tile [data-action="delete-folder"]', function (e) {
            e.stopPropagation();
            // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
            const folderId = this.closest('.bg_folder_tile')?.getAttribute('data-folder-id');
            if (folderId) onDeleteFolder(folderId);
        })
        // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
        .on('click', '.bg_folder_tile .mobile-only-menu-toggle', function (e) {
            e.stopPropagation();
            // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
            const context = this.closest('.bg_folder_tile');
            const wasOpen = context?.classList.contains('mobile-menu-open');
            // Close all other open menus before opening a new one.
            document.querySelectorAll('.bg_folder_tile.mobile-menu-open').forEach(el => el.classList.remove('mobile-menu-open'));
            document.querySelectorAll('.bg_example.mobile-menu-open').forEach(el => el.classList.remove('mobile-menu-open'));
            if (!wasOpen) {
                context?.classList.add('mobile-menu-open');
            }
        });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document)
        .off('click', '.bg_example').on('click', '.bg_example', onSelectBackgroundClick)
        // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
        .off('click', '.bg_example .mobile-only-menu-toggle').on('click', '.bg_example .mobile-only-menu-toggle', function (e) {
            e.stopPropagation();
            // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
            const context = this.closest('.bg_example');
            const wasOpen = context?.classList.contains('mobile-menu-open');
            // Close all other open menus before opening a new one.
            document.querySelectorAll('.bg_example.mobile-menu-open').forEach(el => el.classList.remove('mobile-menu-open'));
            document.querySelectorAll('.bg_folder_tile.mobile-menu-open').forEach(el => el.classList.remove('mobile-menu-open'));
            if (!wasOpen) {
                context?.classList.add('mobile-menu-open');
            }
        })
        .off('blur', '.bg_example.mobile-menu-open').on('blur', '.bg_example.mobile-menu-open', function () {
            // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
            if (!this.matches(':focus-within')) {
                // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
                this.classList.remove('mobile-menu-open');
            }
        })
        // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
        .off('click', '.jg-button').on('click', '.jg-button', function (e) {
            e.stopPropagation();
            // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
            if (isBackgroundSelectionMode && this.closest('#bg_menu_content')) {
                return;
            }
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const action = $(this).data('action');

            switch (action) {
                case 'lock':
                    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
                    onLockBackgroundClick.call(this, e.originalEvent);
                    break;
                case 'unlock':
                    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
                    onUnlockBackgroundClick.call(this, e.originalEvent);
                    break;
                case 'edit':
                    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
                    onRenameBackgroundClick.call(this, e.originalEvent);
                    break;
                case 'delete':
                    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
                    onDeleteBackgroundClick.call(this, e.originalEvent);
                    break;
                case 'copy':
                    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
                    onCopyToSystemBackgroundClick.call(this, e.originalEvent);
                    break;
                case 'folder': {
                    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
                    const bgEl = this.closest('.bg_example');
                    if (bgEl?.getAttribute('custom') === 'true') break; // Only system backgrounds
                    const bgFile = bgEl?.getAttribute('bgfile');
                    if (bgFile) onAssignToFolder(bgFile);
                    break;
                }
                case 'set-cover': {
                    // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
                    const bgEl = this.closest('.bg_example');
                    if (bgEl?.getAttribute('custom') === 'true') break; // Only system backgrounds
                    const bgFile = bgEl?.getAttribute('bgfile');
                    if (bgFile) onSetFolderCover(bgFile);
                    break;
                }
            }
        });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg_thumb_zoom_in').on('click', () => {
        // @ts-expect-error TS(2339) FIXME: Property 'thumbnailColumns' does not exist on type... Remove this comment to see the full error message
        applyThumbnailColumns(background_settings.thumbnailColumns - 1);
    });
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg_thumb_zoom_out').on('click', () => {
        // @ts-expect-error TS(2339) FIXME: Property 'thumbnailColumns' does not exist on type... Remove this comment to see the full error message
        applyThumbnailColumns(background_settings.thumbnailColumns + 1);
    });
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#auto_background').on('click', autoBackgroundCommand);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg_selection_mode_button').on('click', () => setBackgroundSelectionMode(!isBackgroundSelectionMode));
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg_group_add_to_folder_button').on('click', onAddSelectedToFolder);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg_folder_remove_selected_button').on('click', onRemoveSelectedFromCurrentFolder);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#add_bg_button').on('change', (e) => onBackgroundUploadSelected(e.originalEvent));
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg-filter').on('input', () => debouncedOnBackgroundFilterInput());
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg-sort').on('change', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        background_settings.sortOrder = String($(this).val());
        saveSettingsDebounced();
        // Re-render both galleries with new sort order (respecting active folder filter)
        renderSystemBackgrounds(getFilteredImages());
        // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
        renderChatBackgrounds();
        highlightSelectedBackground();
        highlightLockedBackground();
        // Re-apply any active search filter
        onBackgroundFilterInput();
    });
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'lockbg',
        callback: () => {
            onLockBackgroundClick();
            return '';
        },
        aliases: ['bglock'],
        helpString: 'Locks a background for the currently selected chat',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'unlockbg',
        callback: () => {
            onUnlockBackgroundClick();
            return '';
        },
        aliases: ['bgunlock'],
        helpString: 'Unlocks a background for the currently selected chat',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'autobg',
        callback: autoBackgroundCommand,
        aliases: ['bgauto'],
        helpString: 'Automatically changes the background based on the chat context using the AI request prompt',
    }));

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#background_fitting').on('input', function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        background_settings.fitting = String($(this).val());
        setFittingClass(background_settings.fitting);
        saveSettingsDebounced();
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#background_thumbnails_animation').on('input', async function () {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        background_settings.animation = !!$(this).prop('checked');
        saveSettingsDebounced();

        // Refresh background thumbnails
        await getBackgrounds();
        await onChatChanged();
    });

    Object.values(BG_TABS).forEach(tabId => {
        setupScrollToTop({
            scrollContainerId: tabId,
            buttonId: 'bg-scroll-top',
            drawerId: 'Backgrounds',
        });
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg_tabs').tabs();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bg_tabs').on('tabsactivate', () => updateGroupFolderControlsVisibility());
    updateGroupFolderControlsVisibility();
    syncGroupSelectionUi();
}
