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
let folderList: Array<{ id: string; name: string; thumbnailFile: string }> = [];
/** @type {Object.<string, string[]>} filename → folderIds */
let imageFolderMap: Record<string, string[]> = {};
/** @type {string|null} Currently active folder drill-in, or null for root */
let activeFolderId: string | null = null;
/** @type {Set<string>} Selected system backgrounds for group folder actions */
const selectedSystemBackgroundFiles = new Set<string>();
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
const THUMBNAIL_BLOBS = new Map<string, string>();

const THUMBNAIL_CONFIG = {
    width: 160,
    height: 90,
};

const ANIMATED_BACKGROUND_EXTENSIONS = ['mp4', 'webp', 'gif', 'apng'];

/**
 * Cache for image metadata.
 * @type {Map<string, import('../../src/endpoints/image-metadata.js').ImageMetadata>}
 */
const METADATA_CACHE = new Map<string, unknown>();

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
let cachedSystemBackgrounds: Array<{ filename: string; isAnimated: boolean }> = [];

export const background_settings: Record<string, unknown> = {
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
function sortBackgrounds(backgrounds: string[], isCustom = false): string[] {
    const sortOrder = background_settings.sortOrder || BG_SORT_OPTIONS.AZ;

    return [...backgrounds].sort((a: string, b: string) => {
        switch (sortOrder) {
            case BG_SORT_OPTIONS.AZ:
                return sortIgnoreCaseAndAccents(a, b);
            case BG_SORT_OPTIONS.ZA:
                return sortIgnoreCaseAndAccents(b, a);
            case BG_SORT_OPTIONS.NEWEST:
            case BG_SORT_OPTIONS.OLDEST: {
                const keyA = isCustom ? a : `backgrounds/${a}`;
                const keyB = isCustom ? b : `backgrounds/${b}`;
                const metaA = METADATA_CACHE.get(keyA) as Record<string, unknown> | undefined;
                const metaB = METADATA_CACHE.get(keyB) as Record<string, unknown> | undefined;
                const timestampA = (metaA?.addedTimestamp as number) ?? 0;
                const timestampB = (metaB?.addedTimestamp as number) ?? 0;
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

interface ImageData {
    filename: string;
    isCustom: boolean;
    isAnimated: boolean;
}

/**
 * Creates a single thumbnail DOM element. The CSS now handles all sizing.
 * @param {object} imageData - Data for the image (filename, isCustom, isAnimated).
 * @returns {HTMLElement} The created thumbnail element.
 */
function createThumbnailElement(imageData: ImageData): HTMLElement {
    const bg = imageData.filename;
    const isCustom = imageData.isCustom;
    const isAnimated = imageData.isAnimated ?? false;

    const thumbnail = document.querySelector<HTMLElement>('#background_template .bg_example')!.cloneNode(true) as HTMLElement;

    const clipper = document.createElement('div');
    clipper.className = 'thumbnail-clipper lazy-load-background';
    clipper.style.backgroundImage = PLACEHOLDER_IMAGE;

    // Apply dominant color and aspect ratio as placeholder if available
    const metadataKey = isCustom ? bg : `backgrounds/${bg}`;
    const metadata = METADATA_CACHE.get(metadataKey) as Record<string, unknown> | undefined;
    if (metadata) {
        if (metadata.dominantColor) {
            clipper.style.backgroundColor = metadata.dominantColor as string;
        }
        if (metadata.aspectRatio) {
            thumbnail.style.aspectRatio = metadata.aspectRatio as string;
        }
    }

    const titleElement = thumbnail.querySelector('.BGSampleTitle')!;
    clipper.appendChild(titleElement);
    thumbnail.append(clipper);

    const url = generateUrlParameter(bg, isCustom);
    const title = isCustom ? bg.split('/').pop() : bg;
    const safeTitle = title ?? '';
    const friendlyTitle = String(safeTitle).slice(0, safeTitle.lastIndexOf('.'));

    thumbnail.setAttribute('title', safeTitle);
    thumbnail.setAttribute('bgfile', bg);
    thumbnail.setAttribute('custom', String(isCustom));
    thumbnail.setAttribute('animated', String(isAnimated));
    thumbnail.setAttribute('data-url', url);
    titleElement.textContent = friendlyTitle;

    return thumbnail;
}

/**
 * Applies the thumbnail column count to the CSS and updates button states.
 * @param {number} count - The number of columns to display.
 */
function applyThumbnailColumns(count: number): void {
    const newCount = Math.max(THUMBNAIL_COLUMNS_MIN, Math.min(count, THUMBNAIL_COLUMNS_MAX));
    background_settings.thumbnailColumns = newCount;
    document.documentElement.style.setProperty('--bg-thumb-columns', newCount.toString());

    const zoomIn = document.getElementById('bg_thumb_zoom_in') as HTMLButtonElement | null;
    if (zoomIn) zoomIn.disabled = newCount <= THUMBNAIL_COLUMNS_MIN;
    const zoomOut = document.getElementById('bg_thumb_zoom_out') as HTMLButtonElement | null;
    if (zoomOut) zoomOut.disabled = newCount >= THUMBNAIL_COLUMNS_MAX;

    saveSettingsDebounced();
}

/**
 *
 * @param settings
 */
export function loadBackgroundSettings(settings: Record<string, unknown>): void {
    let backgroundSettings = (settings.background as Record<string, unknown>) || {};
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
    let columns = backgroundSettings.thumbnailColumns as number | undefined;
    if (!columns) {
        const isNarrowScreen = window.matchMedia('(max-width: 480px)').matches;
        columns = isNarrowScreen ? THUMBNAIL_COLUMNS_DEFAULT_MOBILE : THUMBNAIL_COLUMNS_DEFAULT_DESKTOP;
    }
    background_settings.thumbnailColumns = columns;
    background_settings.sortOrder = backgroundSettings.sortOrder;
    background_settings.animation = backgroundSettings.animation;
    applyThumbnailColumns(background_settings.thumbnailColumns as number);

    setBackground(backgroundSettings.name as string, backgroundSettings.url as string);
    setFittingClass(backgroundSettings.fitting as string);
    const fittingEl = document.getElementById('background_fitting') as HTMLSelectElement | null;
    if (fittingEl) fittingEl.value = backgroundSettings.fitting as string;
    const el = document.getElementById('background_thumbnails_animation') as HTMLInputElement | null; if (el) el.checked = background_settings.animation as boolean;
    const sortEl = document.getElementById('bg-sort') as HTMLSelectElement | null;
    if (sortEl) sortEl.value = background_settings.sortOrder as string;
    highlightSelectedBackground();
}

/**
 * Sets the background for the current chat and adds it to the list of custom backgrounds.
 * @param {{url: string, path:string}} backgroundInfo
 * @param backgroundInfo.url
 * @param backgroundInfo.path
 */
async function forceSetBackground(backgroundInfo: { url: string; path: string }): Promise<void> {
    saveBackgroundMetadata(backgroundInfo.url);
    const bg1 = document.getElementById('bg1');
    if (bg1) bg1.style.backgroundImage = backgroundInfo.url;

    const list = (chat_metadata[LIST_METADATA_KEY] as string[]) || [];
    const bg = backgroundInfo.path;
    list.push(bg);
    chat_metadata[LIST_METADATA_KEY] = list;
    saveMetadataDebounced();
    renderChatBackgrounds();
    highlightNewBackground(bg);
    highlightLockedBackground();
}

/**
 *
 */
async function onChatChanged(): Promise<void> {
    const lockedUrl = chat_metadata[BG_METADATA_KEY] as string | undefined;

    const bg1 = document.getElementById('bg1');
    if (bg1) bg1.style.backgroundImage = lockedUrl || background_settings.url as string;

    renderChatBackgrounds();
    highlightLockedBackground();
    highlightSelectedBackground();
}

/**
 * Checks if a given URL corresponds to a custom background in the current chat's metadata.
 * @param {string} fileUrl - The URL to check against the chat's custom backgrounds.
 * @returns {boolean} True if the URL corresponds to a custom background, false otherwise.
 */
export function isCustomBackgroundUrl(fileUrl: string): boolean {
    const customBackgrounds = (chat_metadata[LIST_METADATA_KEY] as string[]) || [];
    return customBackgrounds.some((bg: string) => bg === fileUrl || generateUrlParameter(bg, true) === fileUrl);
}

/**
 * Gets the client path for a background image, encoding the file name for safe URL usage.
 * @param {string} fileUrl File name or URL of the background image
 * @returns {string} Client path for the system backgroun
 */
export function getBackgroundPath(fileUrl: string): string {
    return `backgrounds/${encodeURIComponent(fileUrl)}`;
}

/**
 * Gets the raw server-side relative path for a background image (no URL encoding).
 * Used when communicating paths to the API (stored as plain strings in metadata).
 * @param {string} file File name of the background image
 * @returns {string} Raw relative path, e.g. "backgrounds/my file.jpg"
 */
function getBackgroundRelativePath(file: string): string {
    return `backgrounds/${file}`;
}


/**
 *
 */
function highlightLockedBackground(): void {
    document.querySelectorAll('.bg_example.locked-background').forEach(el => el.classList.remove('locked-background'));

    const lockedBackgroundUrl = chat_metadata[BG_METADATA_KEY] as string | undefined;

    if (lockedBackgroundUrl) {
        document.querySelectorAll('.bg_example').forEach(el => {
            if ((el as HTMLElement).dataset.url === lockedBackgroundUrl) {
                el.classList.add('locked-background');
            }
        });
    }
}

/**
 * Locks the background for the current chat
 * @param {Event|null} event
 */
function onLockBackgroundClick(this: void, event: Event | null = null): void {
    if (!getCurrentChatId()) {
        notyf.warning(t`Select a chat to lock the background for it`);
        return;
    }

    // Take the global background's URL and save it to the chat's metadata.
    const urlToLock = event ? ((event.target as Element)?.closest('.bg_example') as HTMLElement)?.dataset.url : background_settings.url as string;
    saveBackgroundMetadata(urlToLock);
    const bg1 = document.getElementById('bg1');
    if (bg1) (bg1 as HTMLElement).style.backgroundImage = urlToLock ?? '';

    // Update UI states to reflect the new lock.
    highlightLockedBackground();
    highlightSelectedBackground();
}

/**
 * Unlocks the background for the current chat
 * @param {Event|null} _event
 */
function onUnlockBackgroundClick(this: void, _event: Event | null = null): void {
    // Delete the lock from the chat's metadata.
    removeBackgroundMetadata();

    // Revert the view to the current global background.
    const bg1 = document.getElementById('bg1');
    if (bg1) bg1.style.backgroundImage = background_settings.url as string;

    // Update UI states to reflect the removal of the lock.
    highlightLockedBackground();
    highlightSelectedBackground();
}

/**
 *
 */
function isChatBackgroundLocked(): string | undefined {
    return chat_metadata[BG_METADATA_KEY] as string | undefined;
}

/**
 *
 * @param file
 */
function saveBackgroundMetadata(file: string | undefined): void {
    chat_metadata[BG_METADATA_KEY] = file;
    saveMetadataDebounced();
}

/**
 *
 */
function removeBackgroundMetadata(): void {
    delete chat_metadata[BG_METADATA_KEY];
    saveMetadataDebounced();
}

/**
 * Handles the click event for selecting a background.
 * @param {JQuery.Event} e Event
 */
function onSelectBackgroundClick(this: HTMLElement, e: Event): void {
    const bgFile = this.getAttribute('bgfile');
    const isCustom = this.getAttribute('custom') === 'true';
    if (isBackgroundSelectionMode && !isCustom) {
        toggleBackgroundGroupSelection(bgFile ?? '');
        return;
    }

    const backgroundCssUrl = getUrlParameter(this);
    const bypassGlobalLock = !isCustom && (e as MouseEvent).shiftKey;

    if ((isChatBackgroundLocked() || isCustom) && !bypassGlobalLock) {
        // If a background is locked, update the locked background directly
        saveBackgroundMetadata(backgroundCssUrl);
        const bg1 = document.getElementById('bg1');
        if (bg1) bg1.style.backgroundImage = backgroundCssUrl ?? '';
    } else {
        // Otherwise, update the global background setting
        setBackground(bgFile ?? '', backgroundCssUrl ?? '');
    }

    // Update UI highlights to reflect the changes.
    highlightLockedBackground();
    highlightSelectedBackground();
}

/**
 *
 * @param e
 */
async function onCopyToSystemBackgroundClick(this: HTMLElement, e: Event): Promise<void> {
    e.stopPropagation();
    const bgNames = await getNewBackgroundName(this);

    if (!bgNames) {
        return;
    }

    const bgFile = await fetch(bgNames.oldBg);

    if (!bgFile.ok) {
        notyf.warning('Failed to copy background');
        return;
    }

    const blob = await bgFile.blob();
    const file = new File([blob], bgNames.newBg);
    const formData = new FormData();
    formData.set('avatar', file);

    await uploadBackground(formData);

    const list = (chat_metadata[LIST_METADATA_KEY] as string[]) || [];
    const index = list.indexOf(bgNames.oldBg);
    list.splice(index, 1);
    saveMetadataDebounced();
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
async function getThumbnailFromStorage(bg: string, isCustom: boolean): Promise<string> {
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
        const thumbnailBase64 = await createThumbnail(imageBase64, THUMBNAIL_CONFIG.width as unknown as null | undefined, THUMBNAIL_CONFIG.height as unknown as null | undefined);
        const thumbnailBlob = await (await fetch(thumbnailBase64 as string)).blob();
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
async function getNewBackgroundName(referenceElement: Element): Promise<{ oldBg: string; newBg: string } | undefined> {
    const exampleBlock = referenceElement.closest('.bg_example');
    const isCustom = exampleBlock?.getAttribute('custom') === 'true';
    const oldBg = exampleBlock?.getAttribute('bgfile');

    if (!oldBg) {
        console.debug('no bgfile');
        return;
    }

    const fileExtension = oldBg.split('.').pop()!;
    const fileNameBase = isCustom ? oldBg.split('/').pop()! : oldBg;
    const oldBgExtensionless = fileNameBase!.replace(`.${fileExtension}`, '');
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
async function onRenameBackgroundClick(this: HTMLElement, e: Event): Promise<void> {
    e.stopPropagation();

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
        notyf.warning('Failed to rename background');
    }
}

/**
 *
 * @param e
 */
async function onDeleteBackgroundClick(this: HTMLElement, e: Event): Promise<void> {
    e.stopPropagation();
    const bgToDelete = this.closest('.bg_example') as HTMLElement | null;
    const url = bgToDelete?.dataset.url;
    const isCustom = bgToDelete?.getAttribute('custom') === 'true';
    const deleteFromServerId = 'delete_bg_from_server';
    /** @type {import('./popup.js').CustomPopupInput[]} */
    const customInputs = [{
        type: 'checkbox' as const,
        label: t`Also delete file from server`,
        id: deleteFromServerId,
        defaultState: true,
    }];
    let deleteFromServer = false;
    const confirm = await Popup.show.confirm(t`Delete the background?`, null, {
        customInputs: isCustom ? customInputs : [],
        onClose: (popup: Record<string, unknown>) => {
            if (isCustom) {
                deleteFromServer = Boolean((popup?.inputResults as Map<string, unknown>)?.get(deleteFromServerId) ?? false);
            }
        },
    });
    const bg = bgToDelete?.getAttribute('bgfile');

    if (confirm) {
        // If it's not custom, it's a built-in background. Delete it from the server
        if (!isCustom) {
            await delBackground(bg ?? '');
            // Remove from cache to prevent reappearing on sort change
            const cacheIndex = cachedSystemBackgrounds.findIndex(s => s.filename === bg);
            if (cacheIndex !== -1) {
                cachedSystemBackgrounds.splice(cacheIndex, 1);
            }
        } else {
            const list = (chat_metadata[LIST_METADATA_KEY] as string[]) || [];
            const index = list.indexOf(bg ?? '');
            list.splice(index, 1);
        }

        if (bg === background_settings.name || url === (chat_metadata[BG_METADATA_KEY] as string | undefined)) {
            const siblingSelector = '.bg_example';
            const nextBg = bgToDelete?.nextElementSibling?.matches(siblingSelector) ? (bgToDelete.nextElementSibling as HTMLElement) : null;
            const prevBg = bgToDelete?.previousElementSibling?.matches(siblingSelector) ? (bgToDelete.previousElementSibling as HTMLElement) : null;

            if (nextBg) {
                nextBg.click();
            } else if (prevBg) {
                prevBg.click();
            } else {
                const anyOtherBg = Array.from(document.querySelectorAll('.bg_example')).find(el => el !== bgToDelete);
                if (anyOtherBg) {
                    (anyOtherBg as HTMLElement).click();
                }
            }
        }

        // Remove from local image list so it doesn't reappear on re-render
        const deletedBg = bgToDelete?.getAttribute('bgfile');
        if (deletedBg) {
            const cachedIdx = cachedSystemBackgrounds.findIndex(img => img.filename === deletedBg);
            if (cachedIdx !== -1) cachedSystemBackgrounds.splice(cachedIdx, 1);
            selectedSystemBackgroundFiles.delete(deletedBg);

            // Update folder map and clear folder thumbnail if it referenced this image
            if (imageFolderMap[deletedBg]) {
                delete imageFolderMap[deletedBg];
            }
            for (const folder of folderList) {
                if (folder.thumbnailFile === deletedBg) {
                    folder.thumbnailFile = '';
                }
            }
            renderFolderGrid();
        }

        bgToDelete?.remove();

        if (url === (chat_metadata[BG_METADATA_KEY] as string | undefined)) {
            removeBackgroundMetadata();
        }

        if (isCustom) {
            if (deleteFromServer) {
                await deleteMediaFromServer(bg ?? '');
            }
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
async function autoBackgroundCommand(): Promise<string> {
    /** @type {HTMLElement[]} */
    const bgTitles = Array.from(document.querySelectorAll('#bg_menu_content .BGSampleTitle'));
    const options = bgTitles.map(x => ({ element: x, text: (x as HTMLElement).innerText.trim() })).filter(x => x.text.length > 0);
    if (options.length == 0) {
        notyf.warning('No backgrounds to choose from. Please upload some images to the "backgrounds" folder.');
        return '';
    }

    const list = options.map(option => `- ${option.text}`).join('\n');
    const prompt = stringFormat(autoBgPrompt, list);
    const reply = await generateQuietPrompt({ quietPrompt: prompt });
    const fuse = new Fuse(options, { keys: ['text'] as (keyof typeof options[0])[] });
    const bestMatch = fuse.search(reply, { limit: 1 });

    if (bestMatch.length == 0) {
        for (const option of options) {
            if (String(reply).toLowerCase().includes(option.text.toLowerCase())) {
                console.debug('Fallback choosing background:', option);
                (option.element as HTMLElement).click();
                return '';
            }
        }

        notyf.warning('No match found. Please try again.');
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
function renderSystemBackgrounds(backgrounds: Array<{ filename: string; isAnimated: boolean }>): void {
    const sourceList = backgrounds || [];
    const container = document.getElementById('bg_menu_content');
    if (!container) return;
    container.innerHTML = '';

    if (sourceList.length === 0) {
        syncGroupSelectionUi();
        return;
    }

    const sortedList = sortBackgrounds(sourceList.map((bg: { filename: string }) => bg.filename), false);
    const metadataByFilename = new Map(sourceList.map((bg: { filename: string; isAnimated: boolean }) => [bg.filename, bg]));
    sortedList.forEach(filename => {
        const bg = metadataByFilename.get(filename);
        const imageData: ImageData = { filename, isCustom: false, isAnimated: bg?.isAnimated ?? false };
        const thumbnail = createThumbnailElement(imageData);
        container!.append(thumbnail);
    });

    syncGroupSelectionUi();
    activateLazyLoader();
}

/**
 * Renders the chat-specific (custom) backgrounds gallery.
 * @param {string[]} [backgrounds] - Optional filtered list of backgrounds.
 */
function renderChatBackgrounds(backgrounds?: string[]): void {
    const sourceList = backgrounds ?? ((chat_metadata[LIST_METADATA_KEY] as string[]) || []);
    const container = document.getElementById('bg_custom_content');
    if (!container) return;
    container.innerHTML = '';
    const hintEl = document.getElementById('bg_chat_hint');
    if (hintEl) hintEl.style.display = !sourceList.length ? '' : 'none';

    if (sourceList.length === 0) return;

    const sortedList = sortBackgrounds(sourceList, true);
    sortedList.forEach(bg => {
        // For custom backgrounds, infer isAnimated from extension since we don't have server metadata
        const isAnimated = isAnimatedBackgroundExtension(bg);
        const imageData: ImageData = { filename: bg, isCustom: true, isAnimated };
        const thumbnail = createThumbnailElement(imageData);
        container!.append(thumbnail);
    });

    activateLazyLoader();
}

/**
 *
 */
export async function getBackgrounds(): Promise<void> {
    const response = await fetch('/api/backgrounds/all', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({}),
    });
    if (response.ok) {
        const { images, config } = await response.json();
        Object.assign(THUMBNAIL_CONFIG, config);
        cachedSystemBackgrounds = images;
        const existingFiles = new Set(images.map((x: { filename: string }) => x.filename));
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
async function preloadImageMetadata(): Promise<void> {
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
async function loadFolders(): Promise<void> {
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
            const allImages = cachedSystemBackgrounds.map(img => img.filename);
            /** @type {{id: string, thumbnailFile: string}[]} */
            const thumbnailUpdates: Array<{ id: string; thumbnailFile: string }> = [];
            for (const folder of folderList) {
                if (!folder.thumbnailFile) {
                    const firstImage = allImages.find(img => {
                        const fids = imageFolderMap[img!];
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
function renderFolderGrid(): void {
    const container = document.getElementById('bg_folder_grid');
    if (!container) return;
    container.innerHTML = '';

    if (folderList.length === 0 && !activeFolderId) {
        return;
    }

    for (const folder of folderList) {
        const tile = createFolderTileElement(folder);
        container.append(tile);
    }
}

/**
 * Creates a single folder tile DOM element.
 * @param {{id: string, name: string, thumbnailFile: string}} folder
 * @param folder.id
 * @param folder.name
 * @param folder.thumbnailFile
 * @returns {HTMLElement}
 */
function createFolderTileElement(folder: { id: string; name: string; thumbnailFile: string }): HTMLElement {
    const tile = document.querySelector<HTMLElement>('#bg_folder_tile_template .bg_folder_tile')!.cloneNode(true) as HTMLElement;
    tile.setAttribute('data-folder-id', folder.id);
    const nameEl = tile.querySelector('.bg_folder_tile_name') as HTMLElement | null;
    if (nameEl) nameEl.textContent = folder.name;

    // Set cover image (async, update when resolved)
    getFolderCoverUrl(folder).then(coverUrl => {
        if (coverUrl) {
            const coverEl = tile.querySelector('.bg_folder_tile_cover') as HTMLElement | null;
            if (coverEl) coverEl.style.backgroundImage = `url("${coverUrl}")`;
        }
    });

    return tile;
}

/**
 * Gets the cover image URL for a folder.
 * Uses thumbnailFile if set, otherwise falls back to the first image in the folder.
 * @param {{id: string, name: string, thumbnailFile: string}} folder
 * @param folder.id
 * @param folder.name
 * @param folder.thumbnailFile
 * @returns {Promise<string|null>}
 */
async function getFolderCoverUrl(folder: { id: string; name: string; thumbnailFile: string }): Promise<string | null> {
    const file = folder.thumbnailFile || cachedSystemBackgrounds.find(img => {
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
function getFilteredImages(): Array<{ filename: string; isAnimated: boolean }> {
    if (!activeFolderId) return cachedSystemBackgrounds;
    return cachedSystemBackgrounds.filter(img => {
        const fids = imageFolderMap[img.filename];
        return fids && fids.includes(activeFolderId!);
    });
}

/**
 * Drills into a folder — hides folder grid, shows breadcrumb, filters images.
 * @param {string} folderId
 */
function onFolderDrillIn(folderId: string): void {
    const folder = folderList.find(f => f.id === folderId);
    if (!folder) return;

    clearBackgroundGroupSelection();
    activeFolderId = folderId;
    const backgroundsEl = document.getElementById('Backgrounds');
    if (backgroundsEl) backgroundsEl.classList.add('in-folder-view');

    // Hide folder grid, show breadcrumb
    const bgFolderGrid = document.getElementById('bg_folder_grid'); if (bgFolderGrid) bgFolderGrid.style.display = 'none';
    const bgFolderBreadcrumb = document.getElementById('bg_folder_breadcrumb'); if (bgFolderBreadcrumb) bgFolderBreadcrumb.style.display = '';
    const currentFolderName = document.getElementById('bg_current_folder_name');
    if (currentFolderName) currentFolderName.textContent = folder.name;

    // Render only this folder's images
    renderSystemBackgrounds(getFilteredImages());
    highlightSelectedBackground();
}

/**
 * Returns to the root folder overview.
 */
function onBackToFolders(): void {
    clearBackgroundGroupSelection();
    activeFolderId = null;
    const backgroundsEl = document.getElementById('Backgrounds');
    if (backgroundsEl) backgroundsEl.classList.remove('in-folder-view');

    // Show folder grid, hide breadcrumb
    const bgFolderGrid = document.getElementById('bg_folder_grid'); if (bgFolderGrid) bgFolderGrid.style.display = '';
    const bgFolderBreadcrumb = document.getElementById('bg_folder_breadcrumb'); if (bgFolderBreadcrumb) bgFolderBreadcrumb.style.display = 'none';
    const currentFolderName = document.getElementById('bg_current_folder_name');
    if (currentFolderName) currentFolderName.textContent = '';

    // Show all images
    renderSystemBackgrounds(getFilteredImages());
    highlightSelectedBackground();
}

/**
 * Refreshes click-to-select and group action UI state.
 */
function syncGroupSelectionUi(): void {
    const selectedCount = selectedSystemBackgroundFiles.size;
    const isGlobalTab = getActiveBackgroundTab() === BG_SOURCES.GLOBAL;
    const showAddButton = isGlobalTab && isBackgroundSelectionMode && selectedCount > 0;
    const showRemoveFromCurrentFolderButton = isGlobalTab && Boolean(activeFolderId) && isBackgroundSelectionMode && selectedCount > 0;

    const backgroundsEl = document.getElementById('Backgrounds');
    if (backgroundsEl) backgroundsEl.classList.toggle('bg-selection-mode', isBackgroundSelectionMode);
    const selectionModeButton = document.getElementById('bg_selection_mode_button');
    if (selectionModeButton) selectionModeButton.classList.toggle('active', isBackgroundSelectionMode);
    const bgCount = document.getElementById('bg_group_select_count');
    if (bgCount) bgCount.textContent = selectedCount > 0 ? ` (${selectedCount}` : '';
    if (bgCount) bgCount.style.display = selectedCount > 0 ? '' : 'none';

    const addToFolderButton = document.getElementById('bg_group_add_to_folder_button');
    if (addToFolderButton) addToFolderButton.style.display = showAddButton ? '' : 'none';
    const removeSelectedButton = document.getElementById('bg_folder_remove_selected_button');
    if (removeSelectedButton) removeSelectedButton.style.display = showRemoveFromCurrentFolderButton ? '' : 'none';

    document.querySelectorAll('#bg_menu_content .bg_example').forEach(el => {
        const bgFile = String(el.getAttribute('bgfile') || '');
        el.classList.toggle('folder-group-selected', selectedSystemBackgroundFiles.has(bgFile));
    });
}

/**
 * Enables/disables click-to-select mode for system backgrounds.
 * @param {boolean} enabled
 */
function setBackgroundSelectionMode(enabled: boolean): void {
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
function toggleBackgroundGroupSelection(bgFile: string): void {
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
function clearBackgroundGroupSelection(): void {
    selectedSystemBackgroundFiles.clear();
    syncGroupSelectionUi();
}

/**
 * Updates selection/folder action control visibility for the active tab.
 */
function updateGroupFolderControlsVisibility(): void {
    const isGlobalTab = getActiveBackgroundTab() === BG_SOURCES.GLOBAL;
    const selectionModeButton = document.getElementById('bg_selection_mode_button');
    if (selectionModeButton) selectionModeButton.style.display = isGlobalTab ? '' : 'none';

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
async function selectFoldersForGroupAction(headingText: string): Promise<string[] | null> {
    if (folderList.length === 0) {
        notyf.info(t`Create a folder first`);
        return null;
    }

    const contentEl = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = headingText;
    contentEl.appendChild(heading);

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

    const content = contentEl;
    const result = await callGenericPopup(content, POPUP_TYPE.CONFIRM, '', {
        okButton: t`Apply`,
        cancelButton: t`Cancel`,
        allowVerticalScrolling: true,
        leftAlign: true,
    });
    if (!result) return null;

    const selectedIds: string[] = [];
    content.querySelectorAll('input[type="checkbox"]:checked').forEach(function (this: void, checkbox: Element) {
        selectedIds.push((checkbox as HTMLInputElement).dataset.folderId ?? '');
    });
    return selectedIds.length > 0 ? selectedIds : null;
}

/**
 * Sends a folder assign/unassign request and updates local imageFolderMap state.
 * @param {string[]} bgFiles - Background filenames to update
 * @param {string} folderId - Target folder ID
 * @param {boolean} isRemove - Whether to remove (unassign) or add (assign)
 */
async function updateFolderAssignments(bgFiles: string[], folderId: string, isRemove: boolean): Promise<void> {
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
        const currentFolderIds = imageFolderMap[bgFile] || [];
        if (isRemove) {
            const nextFolderIds = currentFolderIds.filter((id: string) => id !== folderId);
            if (nextFolderIds.length > 0) {
                imageFolderMap[bgFile] = nextFolderIds;
            } else {
                delete imageFolderMap[bgFile];
            }
        } else if (!currentFolderIds.includes(folderId)) {
            imageFolderMap[bgFile] = [...currentFolderIds, folderId];
        }
    }
}

/**
 * Adds selected system backgrounds to a chosen folder.
 */
async function onAddSelectedToFolder(): Promise<void> {
    if (getActiveBackgroundTab() !== BG_SOURCES.GLOBAL) {
        notyf.warning(t`Folder actions are only available in the Global tab`);
        return;
    }

    const bgFiles = Array.from(selectedSystemBackgroundFiles);
    if (bgFiles.length === 0) {
        notyf.info(t`Select one or more backgrounds first`);
        return;
    }

    const folderIds = await selectFoldersForGroupAction(t`Add selected backgrounds to folders`);
    if (!folderIds) return;

    try {
        let totalAdded = 0;
        for (const folderId of folderIds) {
            const actionableBgFiles = bgFiles.filter(bgFile => {
                const currentFolderIds = imageFolderMap[bgFile] || [];
                return !currentFolderIds.includes(folderId);
            });
            if (actionableBgFiles.length > 0) {
                await updateFolderAssignments(actionableBgFiles, folderId, false);
                totalAdded += actionableBgFiles.length;
            }
        }

        renderFolderGrid();

        if (activeFolderId) {
            renderSystemBackgrounds(getFilteredImages());
            highlightSelectedBackground();
        }

        setBackgroundSelectionMode(false);
        if (totalAdded > 0) {
            notyf.success(t`Added backgrounds to ${folderIds.length} folder(s)`);
        } else {
            notyf.info(t`Selected backgrounds are already in the chosen folders`);
        }
    } catch (error) {
        console.error('Error adding selected backgrounds to folder:', error);
        notyf.error(t`Failed to update folder assignment`);
    }
}

/**
 * Removes selected system backgrounds from the currently drilled-in folder.
 */
async function onRemoveSelectedFromCurrentFolder(): Promise<void> {
    if (getActiveBackgroundTab() !== BG_SOURCES.GLOBAL) {
        notyf.warning(t`Folder actions are only available in the Global tab`);
        return;
    }

    if (!activeFolderId) {
        notyf.info(t`Open a folder first`);
        return;
    }

    const bgFiles = Array.from(selectedSystemBackgroundFiles);
    if (bgFiles.length === 0) {
        notyf.info(t`Select one or more backgrounds first`);
        return;
    }

    try {
        await updateFolderAssignments(bgFiles, activeFolderId, true);
        renderFolderGrid();
        renderSystemBackgrounds(getFilteredImages());
        highlightSelectedBackground();
        setBackgroundSelectionMode(false);
        notyf.success(t`Removed ${bgFiles.length} background(s) from folder`);
    } catch (error) {
        console.error('Error removing selected backgrounds from current folder:', error);
        notyf.error(t`Failed to update folder assignment`);
    }
}

/**
 * Creates a new folder via API.
 */
async function onCreateFolder(): Promise<void> {
    const currentTab = getActiveBackgroundTab();
    if (currentTab !== BG_SOURCES.GLOBAL) {
        notyf.warning(t`Folders can only be created in the Global tab`);
        return;
    }

    const name = await Popup.show.input(t`Enter folder name:`, null, '');
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
            notyf.success(t`Folder created: ${folder.name}`);
        }
    } catch (error) {
        console.error('Error creating folder:', error);
        notyf.error(t`Failed to create folder`);
    }
}

/**
 * Renames a folder via API.
 * @param {string} folderId
 */
async function onRenameFolder(folderId: string): Promise<void> {
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
            notyf.success(t`Folder renamed`);
        }
    } catch (error) {
        console.error('Error renaming folder:', error);
        notyf.error(t`Failed to rename folder`);
    }
}

/**
 * Deletes a folder via API.
 * @param {string} folderId
 */
async function onDeleteFolder(folderId: string): Promise<void> {
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
            folderList = folderList.filter(f => f.id !== folderId);
            // Clean imageFolderMap
            for (const fids of Object.values(imageFolderMap)) {
                const idx = fids.indexOf(folderId);
                if (idx !== -1) fids.splice(idx, 1);
            }
            // If we were inside this folder, go back
            if (activeFolderId === folderId) {
                onBackToFolders();
            }
            renderFolderGrid();
            notyf.success(t`Folder deleted`);
        }
    } catch (error) {
        console.error('Error deleting folder:', error);
        notyf.error(t`Failed to delete folder`);
    }
}

/**
 * Shows a folder assignment popup for an image.
 * @param {string} bgFile - The background filename
 */
async function onAssignToFolder(bgFile: string): Promise<void> {
    if (folderList.length === 0) {
        notyf.info(t`Create a folder first`);
        return;
    }

    const currentFolderIds = imageFolderMap[bgFile] || [];

    // Build checkbox inputs for Popup using DOM construction (avoids HTML injection)
    const contentEl = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = t`Assign to folders`;
    contentEl.appendChild(heading);

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

    const content = contentEl;

    const result = await callGenericPopup(content, POPUP_TYPE.CONFIRM, '', { okButton: t`Save`, cancelButton: t`Cancel` });
    if (!result) return;

    // Determine which folders were toggled on/off
    const toAssign: string[] = [];
    const toUnassign: string[] = [];
    content.querySelectorAll('input[type="checkbox"]').forEach(function (this: void, checkbox: Element) {
        const cb = checkbox as HTMLInputElement;
        const fid = cb.dataset.folderId;
        const isChecked = cb.checked;
        const wasChecked = currentFolderIds.includes(fid ?? '');
        if (isChecked && !wasChecked) toAssign.push(fid ?? '');
        if (!isChecked && wasChecked) toUnassign.push(fid ?? '');
    });

    try {
        for (const fid of toAssign) {
            await updateFolderAssignments([bgFile], fid, false);
        }
        for (const fid of toUnassign) {
            await updateFolderAssignments([bgFile], fid, true);
        }

        renderFolderGrid();

        // Re-render filtered image list if currently inside a folder view
        if (activeFolderId) {
            renderSystemBackgrounds(getFilteredImages());
            highlightSelectedBackground();
        }

        notyf.success(t`Folder assignment updated`);
    } catch (error) {
        console.error('Error assigning to folder:', error);
        notyf.error(t`Failed to update folder assignment`);
    }
}

/**
 * Sets an image as the folder cover.
 * @param {string} bgFile - The background filename
 */
async function onSetFolderCover(bgFile: string): Promise<void> {
    if (!activeFolderId) return;

    try {
        const response = await fetch('/api/image-metadata/folders/update', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ id: activeFolderId, thumbnailFile: bgFile }),
        });
        if (response.ok) {
            const folder = folderList.find(f => f.id === activeFolderId);
            if (folder) {
                folder.thumbnailFile = bgFile;
                // Update the DOM tile cover image
                const coverUrl = await getFolderCoverUrl(folder);
                if (coverUrl) {
                    const coverEl = document.querySelector(`.bg_folder_tile[data-folder-id="${folder.id}"] .bg_folder_tile_cover`) as HTMLElement | null;
                    if (coverEl) coverEl.style.backgroundImage = `url('${coverUrl}')`;
                }
            }
            notyf.success(t`Folder cover updated`);
        }
    } catch (error) {
        console.error('Error setting folder cover:', error);
        notyf.error(t`Failed to set folder cover`);
    }
}

/**
 *
 */
function activateLazyLoader(): void {
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
                    resolveImageUrl(bg ?? '', isCustom, isAnimated)
                        .then(url => { clipper.style.backgroundImage = url; })
                        .catch(() => { clipper.style.backgroundImage = PLACEHOLDER_IMAGE; });
                }

                clipper.classList.remove('lazy-load-background');
                observer.unobserve(clipper);
            }
        });
    }, options);

    lazyLoadElements.forEach(element => {
        lazyLoadObserver!.observe(element);
    });
}

/**
 * Gets the CSS URL of the background
 * @param {Element} block
 * @returns {string} URL of the background
 */
function getUrlParameter(block: Element): string | undefined {
    const el = (block as HTMLElement).closest('.bg_example') as HTMLElement | null;
    return el?.dataset.url;
}

/**
 *
 * @param bg
 * @param isCustom
 */
function generateUrlParameter(bg: string, isCustom: boolean): string {
    return isCustom ? `url("${encodeURI(bg)}")` : `url("${getBackgroundPath(bg)}")`;
}

/**
 *
 * @param fileName
 */
function isAnimatedBackgroundExtension(fileName: string): boolean {
    const fileExtension = fileName.split('.').pop()!.toLowerCase();
    return ANIMATED_BACKGROUND_EXTENSIONS.includes(fileExtension);
}

/**
 * Resolves the image URL for the background.
 * @param {string} bg Background file name
 * @param {boolean} isCustom Is a custom background
 * @param {boolean|null} [isAnimated] Is the background animated (from metadata). If null, infers from extension.
 * @returns {Promise<string>} CSS URL of the background
 */
async function resolveImageUrl(bg: string, isCustom: boolean, isAnimated: boolean | null = null): Promise<string> {
    // If isAnimated is not provided (null), fall back to extension-based heuristic
    let animated: boolean | null = isAnimated;
    if (animated === null) {
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
async function setBackground(bg: string, url: string): Promise<void> {
    // Only change the visual background if one is not locked for the current chat.
    if (!isChatBackgroundLocked()) {
        const bg1 = document.getElementById('bg1');
        if (bg1) bg1.style.backgroundImage = url;
    }
    background_settings.name = bg;
    background_settings.url = url;
    saveSettingsDebounced();
}

/**
 *
 * @param bg
 */
async function delBackground(bg: string): Promise<void> {
    await fetch('/api/backgrounds/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            bg: bg,
        }),
    });

    await THUMBNAIL_STORAGE.removeItem(bg);
    if (THUMBNAIL_BLOBS.has(bg)) {
        URL.revokeObjectURL(THUMBNAIL_BLOBS.get(bg)!);
        THUMBNAIL_BLOBS.delete(bg);
    }
}

/**
 * Background upload handler.
 * @param {Event} e Event
 * @returns {Promise<void>}
 */
async function onBackgroundUploadSelected(e: Event): Promise<void> {
    const input = e.currentTarget;

    if (!(input instanceof HTMLInputElement)) {
        console.error('Invalid input element for background upload');
        return;
    }

    for (const file of input.files!) {
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
async function convertFileIfVideo(formData: FormData): Promise<void> {
    const file = formData.get('avatar');
    if (!(file instanceof File)) {
        return;
    }
    if (!file.type.startsWith('video/')) {
        return;
    }
    if (typeof (globalThis as Record<string, unknown>).convertVideoToAnimatedWebp !== 'function') {
        notyf.warning(t`Click here to install the Video Background Loader extension`, t`Video background uploads require a downloadable add-on`, {
            timeOut: 0,
            extendedTimeOut: 0,
            onclick: () => openThirdPartyExtensionMenu('https://github.com/SillyTavern/Extension-VideoBackgroundLoader'),
        });
        return;
    }

    let toastMessage: { remove: () => void } | null = null;
    try {
        toastMessage = notyf.info(t`Preparing video for upload. This may take several minutes.`, t`Please wait`, { timeOut: 0, extendedTimeOut: 0 }) as unknown as { remove: () => void } | null;
        const sourceBuffer = await file.arrayBuffer();
        const convertedBuffer = await (globalThis as unknown as { convertVideoToAnimatedWebp: (opts: { buffer: Uint8Array; name: string }) => Promise<ArrayBuffer> }).convertVideoToAnimatedWebp({ buffer: new Uint8Array(sourceBuffer), name: file.name });
        const convertedFileName = file.name.replace(/\.[^/.]+$/, '.webp');
        const convertedFile = new File([new Uint8Array(convertedBuffer)], convertedFileName, { type: 'image/webp' });
        formData.set('avatar', convertedFile);
        toastMessage?.remove();
    } catch (error) {
        formData.delete('avatar');
        if (toastMessage) toastMessage.remove();
        console.error('Error converting video to animated webp:', error);
        notyf.error(t`Error converting video to animated webp`);
    }
}

/**
 * Uploads a background to the server
 * @param {FormData} formData
 */
async function uploadBackground(formData: FormData): Promise<void> {
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
async function uploadChatBackground(formData: FormData): Promise<void> {
    try {
        if (!getCurrentChatId()) {
            notyf.warning(t`Select a chat to upload a background for it`);
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
        const base64Data = (imageDataUri as string).split(',')[1];
        const extension = getFileExtension(file);
        const characterName = selected_group
            ? groups.find(g => g.id === selected_group)?.id?.toString()
            : characters[this_chid]?.name;
        const filename = `${characterName}_${humanizedDateTime()}`;
        const imagePath = await saveBase64AsFile(base64Data!, characterName, filename, extension);

        const list = (chat_metadata[LIST_METADATA_KEY] as string[]) || [];
        list.push(imagePath);
        chat_metadata[LIST_METADATA_KEY] = list;
        await saveMetadata();
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
function highlightNewBackground(bg: string): void {
    const newBg = document.querySelector(`.bg_example[bgfile="${bg}"]`);
    if (!newBg) return;
    const parent = newBg.parentElement;
    if (!parent) return;
    const scrollOffset = (newBg as HTMLElement).offsetTop - parent.offsetTop;
    const bgContainer = document.querySelector('#Backgrounds');
    if (bgContainer) bgContainer.scrollTop = scrollOffset;
    flashHighlight(newBg);
}

/**
 * Sets the fitting class for the background element
 * @param {string} fitting Fitting type
 */
function setFittingClass(fitting: string): void {
    const backgrounds = document.getElementById('bg1');
    for (const option of ['cover', 'contain', 'stretch', 'center']) {
        backgrounds?.classList.toggle(option, option === fitting);
    }
    background_settings.fitting = fitting;
}

/**
 *
 */
function highlightSelectedBackground(): void {
    document.querySelectorAll('.bg_example.selected-background').forEach(el => el.classList.remove('selected-background'));

    // The "selected" highlight should always reflect the global background setting.
    const activeUrl = background_settings.url as string;

    if (activeUrl) {
        // Find the thumbnail whose data-url attribute matches the active URL
        document.querySelectorAll('.bg_example').forEach(el => {
            if ((el as HTMLElement).dataset.url === activeUrl) {
                el.classList.add('selected-background');
            }
        });
    }
}

/**
 *
 */
function onBackgroundFilterInput(): void {
    const filterValue = String((document.getElementById('bg-filter') as HTMLInputElement | null)?.value ?? '').toLowerCase();
    document.querySelectorAll('#bg_menu_content > .bg_example, #bg_custom_content > .bg_example').forEach(function (this: void, el: Element) {
        const title = el.getAttribute('title') || '';
        const hasMatch = title.toLowerCase().includes(filterValue);
        (el as HTMLElement).style.display = hasMatch ? '' : 'none';
    });

    // Show/hide folder tiles based on whether folder name matches the filter
    if (!activeFolderId) {
        document.querySelectorAll('#bg_folder_grid .bg_folder_tile').forEach(function (this: void, el: Element) {
            const folderId = el.getAttribute('data-folder-id');
            if (!folderId || !filterValue) {
                (el as HTMLElement).style.display = '';
                return;
            }
            const folder = folderList.find(f => f.id === folderId);
            const folderName = folder ? folder.name.toLowerCase() : '';
            (el as HTMLElement).style.display = folderName.includes(filterValue) ? '' : 'none';
        });
    }
}

const debouncedOnBackgroundFilterInput = debounce(onBackgroundFilterInput, debounce_timeout.standard);

/**
 * Gets the active background tab source.
 * @returns {BG_SOURCES} Active background tab source
 */
export function getActiveBackgroundTab(): number {
    const tabs = document.getElementById('bg_tabs') as HTMLSelectElement | null;
    if (!tabs?.dataset?.uiTabs) {
        return BG_SOURCES.GLOBAL;
    }
    return BG_SOURCES.GLOBAL;
}

/**
 *
 */
export function initBackgrounds(): void {
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
    eventSource.on(event_types.FORCE_SET_BACKGROUND, forceSetBackground);

    // Folder event handlers
    document.addEventListener('click', function (event: Event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const el = target.closest('.bg_folder_tile:not(.bg_new_folder_tile)');
        if (!el) return;
        if (target.closest('.jg-button')) return; // let button handler run
        const folderId = el.getAttribute('data-folder-id');
        if (folderId) onFolderDrillIn(folderId);
    });
    document.addEventListener('click', function (event: Event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('#bg_add_folder_button')) onCreateFolder();
    });
    document.addEventListener('click', function (event: Event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('#bg_back_to_folders')) onBackToFolders();
    });
    document.addEventListener('click', function (event: Event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const el = target.closest('.bg_folder_tile [data-action="rename-folder"]');
        if (!el) return;
        event.stopPropagation();
        const folderId = el.closest('.bg_folder_tile')?.getAttribute('data-folder-id');
        if (folderId) onRenameFolder(folderId!);
    });
    document.addEventListener('click', function (event: Event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const el = target.closest('.bg_folder_tile [data-action="delete-folder"]');
        if (!el) return;
        event.stopPropagation();
        const folderId = el.closest('.bg_folder_tile')?.getAttribute('data-folder-id');
        if (folderId) onDeleteFolder(folderId!);
    });
    document.addEventListener('click', function (event: Event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const el = target.closest('.bg_folder_tile .mobile-only-menu-toggle');
        if (!el) return;
        event.stopPropagation();
        const context = el.closest('.bg_folder_tile');
        const wasOpen = context?.classList.contains('mobile-menu-open');
        // Close all other open menus before opening a new one.
        document.querySelectorAll('.bg_folder_tile.mobile-menu-open').forEach(el => el.classList.remove('mobile-menu-open'));
        document.querySelectorAll('.bg_example.mobile-menu-open').forEach(el => el.classList.remove('mobile-menu-open'));
        if (!wasOpen) {
            context?.classList.add('mobile-menu-open');
        }
    });

    document.addEventListener('click', function (event: Event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const el = target.closest('.bg_example');
        if (el) onSelectBackgroundClick.call(el as HTMLElement, event);
    });
    document.addEventListener('click', function (event: Event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const el = target.closest('.bg_example .mobile-only-menu-toggle');
        if (!el) return;
        event.stopPropagation();
        const context = el.closest('.bg_example');
        const wasOpen = context?.classList.contains('mobile-menu-open');
        // Close all other open menus before opening a new one.
        document.querySelectorAll('.bg_example.mobile-menu-open').forEach(el => el.classList.remove('mobile-menu-open'));
        document.querySelectorAll('.bg_folder_tile.mobile-menu-open').forEach(el => el.classList.remove('mobile-menu-open'));
        if (!wasOpen) {
            context?.classList.add('mobile-menu-open');
        }
    });
    document.addEventListener('blur', function (event: Event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const el = target.closest('.bg_example.mobile-menu-open');
        if (!el) return;
        if (!el.matches(':focus-within')) {
            el.classList.remove('mobile-menu-open');
        }
    }, true);
    document.addEventListener('click', function (event: Event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const el = target.closest('.jg-button');
        if (!el) return;
        event.stopPropagation();
        if (isBackgroundSelectionMode && el.closest('#bg_menu_content')) {
            return;
        }
        const action = el.getAttribute('data-action');

        switch (action) {
            case 'lock':
                onLockBackgroundClick(event as Event);
                break;
            case 'unlock':
                onUnlockBackgroundClick(event as Event);
                break;
            case 'edit':
                onRenameBackgroundClick.call(el as HTMLElement, event);
                break;
            case 'delete':
                onDeleteBackgroundClick.call(el as HTMLElement, event);
                break;
            case 'copy':
                onCopyToSystemBackgroundClick.call(el as HTMLElement, event);
                break;
            case 'folder': {
                const bgEl = el.closest('.bg_example');
                if (bgEl?.getAttribute('custom') === 'true') break; // Only system backgrounds
                const bgFile = bgEl?.getAttribute('bgfile');
                if (bgFile) onAssignToFolder(bgFile!);
                break;
            }
            case 'set-cover': {
                const bgEl = el.closest('.bg_example');
                if (bgEl?.getAttribute('custom') === 'true') break; // Only system backgrounds
                const bgFile = bgEl?.getAttribute('bgfile');
                if (bgFile) onSetFolderCover(bgFile!);
                break;
            }
        }
    });

    document.getElementById('bg_thumb_zoom_in')?.addEventListener('click', () => {
        applyThumbnailColumns((background_settings.thumbnailColumns as number) - 1);
    });
    document.getElementById('bg_thumb_zoom_out')?.addEventListener('click', () => {
        applyThumbnailColumns((background_settings.thumbnailColumns as number) + 1);
    });
    document.getElementById('auto_background')?.addEventListener('click', autoBackgroundCommand);
    document.getElementById('bg_selection_mode_button')?.addEventListener('click', () => setBackgroundSelectionMode(!isBackgroundSelectionMode));
    document.getElementById('bg_group_add_to_folder_button')?.addEventListener('click', onAddSelectedToFolder);
    document.getElementById('bg_folder_remove_selected_button')?.addEventListener('click', onRemoveSelectedFromCurrentFolder);
    document.getElementById('add_bg_button')?.addEventListener('change', (e) => onBackgroundUploadSelected(e));
    document.getElementById('bg-filter')?.addEventListener('input', () => debouncedOnBackgroundFilterInput());
    const bgSortEl = document.getElementById('bg-sort') as HTMLSelectElement | null;
    bgSortEl?.addEventListener('change', function (this: HTMLSelectElement) {
        background_settings.sortOrder = String(bgSortEl?.value);
        saveSettingsDebounced();
        // Re-render both galleries with new sort order (respecting active folder filter)
        renderSystemBackgrounds(getFilteredImages());
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

    const fittingEl = document.getElementById('background_fitting') as HTMLSelectElement | null;
    fittingEl?.addEventListener('input', function (this: HTMLSelectElement) {
        background_settings.fitting = String(this.value);
        setFittingClass(background_settings.fitting as string);
        saveSettingsDebounced();
    });

    const animationEl = document.getElementById('background_thumbnails_animation') as HTMLInputElement | null;
    animationEl?.addEventListener('input', async function (this: HTMLInputElement) {
        background_settings.animation = !!(this).checked;
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

    document.getElementById('bg_tabs')?.addEventListener('tabsactivate', () => updateGroupFolderControlsVisibility());
    updateGroupFolderControlsVisibility();
    syncGroupSelectionUi();
}