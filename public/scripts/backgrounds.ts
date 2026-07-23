import { Fuse, localspace } from '../lib.js';
import {
    characters,
    chat_metadata,
    eventSource,
    event_types,
    generateQuietPrompt,
    getCurrentChatId,
    getRequestHeaders,
    getThumbnailUrl,
    saveMetadata,
    saveSettingsDebounced,
    this_chid,
} from '../script.js';
import { openThirdPartyExtensionMenu, saveMetadataDebounced } from './extensions.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import { SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import {
    createThumbnail,
    flashHighlight,
    getBase64Async,
    stringFormat,
    debounce,
    setupScrollToTop,
    saveBase64AsFile,
    getFileExtension,
    sortIgnoreCaseAndAccents,
} from './utils.js';
import { debounce_timeout } from './constants.js';
import { t } from './i18n.js';
import { callGenericPopup, Popup, POPUP_TYPE } from './popup.js';
import { groups, selected_group } from './group-chats.js';
import { humanizedDateTime } from './RossAscends-mods.js';
import { deleteMediaFromServer } from './chats.js';

const BG_METADATA_KEY = 'custom_background';
const LIST_METADATA_KEY = 'chat_backgrounds';

interface Folder {
    id: string;
    name: string;
    thumbnailFile: string;
}

interface ImageData {
    filename: string;
    isCustom: boolean;
    isAnimated: boolean;
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type AnyObject = Record<string, any>;

interface BackgroundSettings {
    name: string;
    url: string;
    fitting: string;
    animation: boolean;
    sortOrder: string;
    thumbnailColumns?: number;
    [key: string]: unknown;
}

let folderList: Folder[] = [];
let imageFolderMap: Record<string, string[]> = {};
let activeFolderId: string | null = null;
const selectedSystemBackgroundFiles = new Set<string>();
let isBackgroundSelectionMode = false;

// DOM Caches
let thumbnailTemplate: HTMLElement | null = null;
let folderTileTemplate: HTMLElement | null = null;

const PNG_PIXEL =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const PNG_PIXEL_BLOB = new Blob([Uint8Array.from(atob(PNG_PIXEL), (c) => c.charCodeAt(0))], {
    type: 'image/png',
});
const PLACEHOLDER_IMAGE = `url('data:image/png;base64,${PNG_PIXEL}')`;

const THUMBNAIL_COLUMNS_MIN = 2;
const THUMBNAIL_COLUMNS_MAX = 8;
const THUMBNAIL_COLUMNS_DEFAULT_DESKTOP = 5;
const THUMBNAIL_COLUMNS_DEFAULT_MOBILE = 3;

const THUMBNAIL_STORAGE = localspace.createInstance({ name: 'SillyTavern_Thumbnails' });
const THUMBNAIL_BLOBS = new Map<string, string>();
const THUMBNAIL_CONFIG = { width: 160, height: 90 };
const ANIMATED_BACKGROUND_EXTENSIONS = new Set(['mp4', 'webp', 'gif', 'apng']);

const METADATA_CACHE = new Map<string, AnyObject>();

const BG_SOURCES = { GLOBAL: 0, CHAT: 1 } as const;
const BG_SORT_OPTIONS = { AZ: 'az', ZA: 'za', NEWEST: 'newest', OLDEST: 'oldest' } as const;
const BG_TABS = { [BG_SOURCES.GLOBAL]: 'bg_global_tab', [BG_SOURCES.CHAT]: 'bg_chat_tab' } as const;

let lazyLoadObserver: IntersectionObserver | null = null;
let cachedSystemBackgrounds: ImageData[] = [];

export const background_settings: BackgroundSettings = {
    name: '__transparent.png',
    url: generateUrlParameter('__transparent.png', false),
    fitting: 'classic',
    animation: false,
    sortOrder: BG_SORT_OPTIONS.AZ,
};

/**
 * Sorts backgrounds using Schwartzian transform for O(N) map lookups
 */
function sortBackgrounds(backgrounds: string[], isCustom = false): string[] {
    const sortOrder = background_settings.sortOrder || BG_SORT_OPTIONS.AZ;

    if (sortOrder === BG_SORT_OPTIONS.AZ || sortOrder === BG_SORT_OPTIONS.ZA) {
        const sorted = [...backgrounds].toSorted(sortIgnoreCaseAndAccents);
        return sortOrder === BG_SORT_OPTIONS.ZA ? sorted.toReversed() : sorted;
    }

    // Schwartzian transform for timestamp sorting
    const mapped = backgrounds.map((bg) => {
        const key = isCustom ? bg : `backgrounds/${bg}`;
        const meta = METADATA_CACHE.get(key);
        return { bg, time: (meta?.addedTimestamp as number) ?? 0 };
    });

    mapped.sort((a, b) =>
        sortOrder === BG_SORT_OPTIONS.NEWEST ? b.time - a.time : a.time - b.time,
    );

    const result: string[] = Array.from({ length: mapped.length });
    for (let i = 0; i < mapped.length; i++) result[i] = mapped[i]!.bg;
    return result;
}

function createThumbnailElement(imageData: ImageData): HTMLElement {
    if (!thumbnailTemplate) {
        thumbnailTemplate = document.querySelector<HTMLElement>('#background_template .bg_example');
    }
    const thumbnail = thumbnailTemplate!.cloneNode(true) as HTMLElement;
    const clipper = document.createElement('div');

    clipper.className = 'thumbnail-clipper lazy-load-background';
    clipper.style.backgroundImage = PLACEHOLDER_IMAGE;

    const metadataKey = imageData.isCustom
        ? imageData.filename
        : `backgrounds/${imageData.filename}`;
    const metadata = METADATA_CACHE.get(metadataKey);

    if (metadata) {
        if (metadata.dominantColor) clipper.style.backgroundColor = metadata.dominantColor;
        if (metadata.aspectRatio) thumbnail.style.aspectRatio = metadata.aspectRatio;
    }

    const titleElement = thumbnail.querySelector('.BGSampleTitle')!;
    clipper.appendChild(titleElement);
    thumbnail.appendChild(clipper);

    const url = generateUrlParameter(imageData.filename, imageData.isCustom);
    const safeTitle = imageData.filename.split('/').pop() || '';
    const friendlyTitle = safeTitle.slice(0, safeTitle.lastIndexOf('.'));

    thumbnail.title = safeTitle;
    thumbnail.setAttribute('bgfile', imageData.filename);
    thumbnail.setAttribute('custom', String(imageData.isCustom));
    thumbnail.setAttribute('animated', String(imageData.isAnimated));
    thumbnail.dataset.url = url;
    titleElement.textContent = friendlyTitle;

    return thumbnail;
}

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

export function loadBackgroundSettings(settings: Record<string, unknown>): void {
    const bgSettings = (settings.background as BackgroundSettings) || background_settings;

    background_settings.fitting = bgSettings.fitting || 'classic';
    background_settings.animation = bgSettings.animation ?? false;
    background_settings.sortOrder = bgSettings.sortOrder || BG_SORT_OPTIONS.AZ;

    let columns = bgSettings.thumbnailColumns as number | undefined;
    if (!columns) {
        columns = window.matchMedia('(max-width: 480px)').matches
            ? THUMBNAIL_COLUMNS_DEFAULT_MOBILE
            : THUMBNAIL_COLUMNS_DEFAULT_DESKTOP;
    }

    applyThumbnailColumns(columns);
    setBackground(
        (bgSettings.name as string) || background_settings.name,
        (bgSettings.url as string) || background_settings.url,
    );
    setFittingClass(background_settings.fitting);

    const fittingEl = document.getElementById('background_fitting') as HTMLSelectElement | null;
    if (fittingEl) fittingEl.value = background_settings.fitting;

    const animEl = document.getElementById(
        'background_thumbnails_animation',
    ) as HTMLInputElement | null;
    if (animEl) animEl.checked = background_settings.animation;

    const sortEl = document.getElementById('bg-sort') as HTMLSelectElement | null;
    if (sortEl) sortEl.value = background_settings.sortOrder;

    highlightSelectedBackground();
}

async function forceSetBackground(backgroundInfo: { url: string; path: string }): Promise<void> {
    saveBackgroundMetadata(backgroundInfo.url);
    const bg1 = document.getElementById('bg1');
    if (bg1) bg1.style.backgroundImage = backgroundInfo.url;

    const list = (chat_metadata[LIST_METADATA_KEY] as string[]) || [];
    list.push(backgroundInfo.path);
    chat_metadata[LIST_METADATA_KEY] = list;

    saveMetadataDebounced();
    renderChatBackgrounds();
    highlightNewBackground(backgroundInfo.path);
    highlightLockedBackground();
}

async function onChatChanged(): Promise<void> {
    const lockedUrl = chat_metadata[BG_METADATA_KEY] as string | undefined;
    const bg1 = document.getElementById('bg1');
    if (bg1) bg1.style.backgroundImage = lockedUrl || background_settings.url;

    renderChatBackgrounds();
    highlightLockedBackground();
    highlightSelectedBackground();
}

export function isCustomBackgroundUrl(fileUrl: string): boolean {
    const list = (chat_metadata[LIST_METADATA_KEY] as string[]) || [];
    for (let i = 0; i < list.length; i++) {
        if (list[i] === fileUrl || generateUrlParameter(list[i]!, true) === fileUrl) return true;
    }
    return false;
}

export function getBackgroundPath(fileUrl: string): string {
    return `backgrounds/${encodeURIComponent(fileUrl)}`;
}

function getBackgroundRelativePath(file: string): string {
    return `backgrounds/${file}`;
}

function highlightLockedBackground(): void {
    // O(K) rapid class removal
    const active = document.getElementsByClassName('locked-background');
    while (active.length > 0) active[0]!.classList.remove('locked-background');

    const lockedBackgroundUrl = chat_metadata[BG_METADATA_KEY] as string | undefined;
    if (lockedBackgroundUrl) {
        const examples = document.getElementsByClassName('bg_example');
        for (let i = 0; i < examples.length; i++) {
            const el = examples[i] as HTMLElement;
            if (el.dataset.url === lockedBackgroundUrl) el.classList.add('locked-background');
        }
    }
}

function onLockBackgroundClick(event: Event | null = null): void {
    if (!getCurrentChatId()) {
        notyf.warning(t`Select a chat to lock the background for it`);
        return;
    }

    const urlToLock = event
        ? ((event.target as Element).closest('.bg_example') as HTMLElement)?.dataset.url
        : background_settings.url;
    saveBackgroundMetadata(urlToLock);

    const bg1 = document.getElementById('bg1');
    if (bg1) bg1.style.backgroundImage = urlToLock || '';

    highlightLockedBackground();
    highlightSelectedBackground();
}

function onUnlockBackgroundClick(): void {
    removeBackgroundMetadata();
    const bg1 = document.getElementById('bg1');
    if (bg1) bg1.style.backgroundImage = background_settings.url;

    highlightLockedBackground();
    highlightSelectedBackground();
}

function isChatBackgroundLocked(): string | undefined {
    return chat_metadata[BG_METADATA_KEY] as string | undefined;
}

function saveBackgroundMetadata(file: string | undefined): void {
    chat_metadata[BG_METADATA_KEY] = file;
    saveMetadataDebounced();
}

function removeBackgroundMetadata(): void {
    delete chat_metadata[BG_METADATA_KEY];
    saveMetadataDebounced();
}

function onSelectBackgroundClick(this: HTMLElement, e: Event): void {
    const bgFile = this.getAttribute('bgfile') || '';
    const isCustom = this.getAttribute('custom') === 'true';

    if (isBackgroundSelectionMode && !isCustom) {
        toggleBackgroundGroupSelection(bgFile);
        return;
    }

    const backgroundCssUrl = this.dataset.url || '';
    const bypassGlobalLock = !isCustom && (e as MouseEvent).shiftKey;

    if ((isChatBackgroundLocked() || isCustom) && !bypassGlobalLock) {
        saveBackgroundMetadata(backgroundCssUrl);
        const bg1 = document.getElementById('bg1');
        if (bg1) bg1.style.backgroundImage = backgroundCssUrl;
    } else {
        setBackground(bgFile, backgroundCssUrl);
    }

    highlightLockedBackground();
    highlightSelectedBackground();
}

async function onCopyToSystemBackgroundClick(this: HTMLElement, e: Event): Promise<void> {
    e.stopPropagation();
    const bgNames = await getNewBackgroundName(this);
    if (!bgNames) return;

    const bgFile = await fetch(bgNames.oldBg);
    if (!bgFile.ok) {
        notyf.warning('Failed to copy background');
        return;
    }

    const blob = await bgFile.blob();
    const formData = new FormData();
    formData.set('avatar', new File([blob], bgNames.newBg));

    await uploadBackground(formData);

    const list = (chat_metadata[LIST_METADATA_KEY] as string[]) || [];
    const index = list.indexOf(bgNames.oldBg);
    if (index > -1) list.splice(index, 1);

    saveMetadataDebounced();
    renderChatBackgrounds();
}

async function getThumbnailFromStorage(bg: string, isCustom: boolean): Promise<string> {
    const cachedBlobUrl = THUMBNAIL_BLOBS.get(bg);
    if (cachedBlobUrl) return cachedBlobUrl;

    const savedBlob = await THUMBNAIL_STORAGE.getItem(bg);
    if (savedBlob) {
        const savedBlobUrl = URL.createObjectURL(savedBlob as Blob);
        THUMBNAIL_BLOBS.set(bg, savedBlobUrl);
        return savedBlobUrl;
    }

    try {
        const url = isCustom ? bg : getBackgroundPath(bg);
        const response = await fetch(url, { cache: 'force-cache' });
        if (!response.ok) throw new Error('Fetch failed with status: ' + response.status);

        const imageBase64 = await getBase64Async(await response.blob());
        const thumbnailBase64 = (await createThumbnail(imageBase64, null, null)) as string;
        const thumbnailBlob = await (await fetch(thumbnailBase64)).blob();

        await THUMBNAIL_STORAGE.setItem(bg, thumbnailBlob);
        const blobUrl = URL.createObjectURL(thumbnailBlob);
        THUMBNAIL_BLOBS.set(bg, blobUrl);
        return blobUrl;
    } catch (error) {
        console.error('Error fetching thumbnail:', error);
        const fallbackUrl = URL.createObjectURL(PNG_PIXEL_BLOB);
        THUMBNAIL_BLOBS.set(bg, fallbackUrl);
        return fallbackUrl;
    }
}

async function getNewBackgroundName(
    referenceElement: Element,
): Promise<{ oldBg: string; newBg: string } | undefined> {
    const exampleBlock = referenceElement.closest('.bg_example');
    const isCustom = exampleBlock?.getAttribute('custom') === 'true';
    const oldBg = exampleBlock?.getAttribute('bgfile');
    if (!oldBg) return;

    const fileExtension = oldBg.split('.').pop()!;
    const fileNameBase = isCustom ? oldBg.split('/').pop()! : oldBg;
    const oldBgExtensionless = fileNameBase.replace(`.${fileExtension}`, '');

    const newBgExtensionless = await Popup.show.input(
        t`Enter new background name:`,
        null,
        oldBgExtensionless,
    );
    if (!newBgExtensionless || oldBgExtensionless === newBgExtensionless) return;

    return { oldBg, newBg: `${newBgExtensionless}.${fileExtension}` };
}

async function onRenameBackgroundClick(this: HTMLElement, e: Event): Promise<void> {
    e.stopPropagation();
    const bgNames = await getNewBackgroundName(this);
    if (!bgNames) return;

    const response = await fetch('/api/backgrounds/rename', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ old_bg: bgNames.oldBg, new_bg: bgNames.newBg }),
        cache: 'no-cache',
    });

    if (response.ok) {
        await getBackgrounds();
        highlightNewBackground(bgNames.newBg);
    } else {
        notyf.warning('Failed to rename background');
    }
}

async function onDeleteBackgroundClick(this: HTMLElement, e: Event): Promise<void> {
    e.stopPropagation();
    const bgToDelete = this.closest('.bg_example') as HTMLElement | null;
    if (!bgToDelete) return;

    const url = bgToDelete.dataset.url;
    const isCustom = bgToDelete.getAttribute('custom') === 'true';
    const bg = bgToDelete.getAttribute('bgfile') || '';

    let deleteFromServer = false;
    const confirm = await Popup.show.confirm(t`Delete the background?`, null, {
        customInputs: isCustom
            ? [
                  {
                      type: 'checkbox',
                      label: t`Also delete file from server`,
                      id: 'del_server',
                      defaultState: true,
                  },
              ]
            : [],
        onClose: (popup: AnyObject) => {
            if (isCustom)
                deleteFromServer =
                    (popup?.inputResults as Map<string, boolean>)?.get('del_server') ?? false;
        },
    });

    if (!confirm) return;

    if (!isCustom) {
        await delBackground(bg);
        const cacheIndex = cachedSystemBackgrounds.findIndex((s) => s.filename === bg);
        if (cacheIndex !== -1) cachedSystemBackgrounds.splice(cacheIndex, 1);
    } else {
        const list = (chat_metadata[LIST_METADATA_KEY] as string[]) || [];
        const index = list.indexOf(bg);
        if (index > -1) list.splice(index, 1);
    }

    if (bg === background_settings.name || url === chat_metadata[BG_METADATA_KEY]) {
        const nextBg = bgToDelete.nextElementSibling?.matches('.bg_example')
            ? (bgToDelete.nextElementSibling as HTMLElement)
            : null;
        const prevBg = bgToDelete.previousElementSibling?.matches('.bg_example')
            ? (bgToDelete.previousElementSibling as HTMLElement)
            : null;

        if (nextBg) nextBg.click();
        else if (prevBg) prevBg.click();
        else {
            const anyOther = document.querySelector(
                '.bg_example:not([bgfile="' + bg + '"])',
            ) as HTMLElement;
            if (anyOther) anyOther.click();
        }
    }

    selectedSystemBackgroundFiles.delete(bg);
    if (imageFolderMap[bg]) delete imageFolderMap[bg];
    for (let i = 0; i < folderList.length; i++) {
        if (folderList[i]?.thumbnailFile === bg) folderList[i]!.thumbnailFile = '';
    }

    renderFolderGrid();
    bgToDelete.remove();

    if (url === chat_metadata[BG_METADATA_KEY]) removeBackgroundMetadata();

    if (isCustom) {
        if (deleteFromServer) await deleteMediaFromServer(bg);
        renderChatBackgrounds();
        await saveMetadata();
    }

    highlightLockedBackground();
    highlightSelectedBackground();
    syncGroupSelectionUi();
}

async function autoBackgroundCommand(): Promise<string> {
    const bgTitles = Array.from(
        document.querySelectorAll('#bg_menu_content .BGSampleTitle'),
    ) as HTMLElement[];
    const options = bgTitles
        .map((x) => ({ element: x, text: x.innerText.trim() }))
        .filter((x) => x.text.length > 0);

    if (options.length === 0) {
        notyf.warning('No backgrounds to choose from.');
        return '';
    }

    const list = options.map((o) => `- ${o.text}`).join('\n');
    const prompt = stringFormat(
        'Ignore previous instructions and choose a location ONLY from the provided list that is the most suitable for the current scene. Do not output any other text:\n{0}',
        list,
    );
    const reply = await generateQuietPrompt({ quietPrompt: prompt });

    const bestMatch = new Fuse(options, { keys: ['text'] }).search(reply, { limit: 1 });

    if (bestMatch.length > 0) {
        bestMatch[0]!.item.element.click();
    } else {
        const lowerReply = String(reply).toLowerCase();
        for (let i = 0; i < options.length; i++) {
            if (lowerReply.includes(options[i]!.text.toLowerCase())) {
                options[i]!.element.click();
                return '';
            }
        }
        notyf.warning('No match found. Please try again.');
    }
    return '';
}

function renderSystemBackgrounds(backgrounds: ImageData[]): void {
    const container = document.getElementById('bg_menu_content');
    if (!container) return;
    container.innerHTML = '';

    if (backgrounds.length > 0) {
        const sortedList = sortBackgrounds(
            backgrounds.map((bg) => bg.filename),
            false,
        );
        const metadataMap = new Map(backgrounds.map((bg) => [bg.filename, bg]));

        for (let i = 0; i < sortedList.length; i++) {
            const bgData = metadataMap.get(sortedList[i]!);
            if (bgData) container.appendChild(createThumbnailElement(bgData));
        }
    }

    syncGroupSelectionUi();
    activateLazyLoader();
}

function renderChatBackgrounds(backgrounds?: string[]): void {
    const sourceList = backgrounds ?? ((chat_metadata[LIST_METADATA_KEY] as string[]) || []);
    const container = document.getElementById('bg_custom_content');
    if (!container) return;

    container.innerHTML = '';
    const hintEl = document.getElementById('bg_chat_hint');
    if (hintEl) hintEl.style.display = sourceList.length === 0 ? '' : 'none';

    if (sourceList.length > 0) {
        const sortedList = sortBackgrounds(sourceList, true);
        for (let i = 0; i < sortedList.length; i++) {
            const bg = sortedList[i]!;
            container.appendChild(
                createThumbnailElement({
                    filename: bg,
                    isCustom: true,
                    isAnimated: isAnimatedBackgroundExtension(bg),
                }),
            );
        }
    }
    activateLazyLoader();
}

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
        for (const selected of selectedSystemBackgroundFiles) {
            if (!existingFiles.has(selected)) selectedSystemBackgroundFiles.delete(selected);
        }

        await loadFolders();
        await preloadImageMetadata();

        renderSystemBackgrounds(getFilteredImages());
        highlightSelectedBackground();
    }
}

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
                for (const path in data.images) METADATA_CACHE.set(path, data.images[path]);
            }
        }
    } catch (error) {
        console.error('[ImageMetadata] Failed to preload metadata:', error);
    }
}

async function loadFolders(): Promise<void> {
    try {
        const response = await fetch('/api/backgrounds/folders', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: '{}',
        });
        if (response.ok) {
            const data = await response.json();
            folderList = data.folders || [];
            imageFolderMap = data.imageFolderMap || {};

            const thumbnailUpdates: Array<{ id: string; thumbnailFile: string }> = [];
            for (let i = 0; i < folderList.length; i++) {
                const folder = folderList[i]!;
                if (!folder.thumbnailFile) {
                    const firstImage = cachedSystemBackgrounds.find((img) =>
                        imageFolderMap[img.filename]?.includes(folder.id),
                    );
                    if (firstImage) {
                        folder.thumbnailFile = firstImage.filename;
                        thumbnailUpdates.push({
                            id: folder.id,
                            thumbnailFile: firstImage.filename,
                        });
                    }
                }
            }
            if (thumbnailUpdates.length > 0) {
                fetch('/api/image-metadata/folders/set-thumbnails', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({ updates: thumbnailUpdates }),
                }).catch(() => {});
            }
            renderFolderGrid();
        }
    } catch (error) {
        console.error('Error loading folders:', error);
    }
}

function renderFolderGrid(): void {
    const container = document.getElementById('bg_folder_grid');
    if (!container) return;
    container.innerHTML = '';

    if (folderList.length === 0 && !activeFolderId) return;

    for (let i = 0; i < folderList.length; i++) {
        container.appendChild(createFolderTileElement(folderList[i]!));
    }
}

function createFolderTileElement(folder: Folder): HTMLElement {
    if (!folderTileTemplate)
        folderTileTemplate = document.querySelector<HTMLElement>(
            '#bg_folder_tile_template .bg_folder_tile',
        );

    const tile = folderTileTemplate!.cloneNode(true) as HTMLElement;
    tile.dataset.folderId = folder.id;

    const nameEl = tile.querySelector('.bg_folder_tile_name');
    if (nameEl) nameEl.textContent = folder.name;

    getFolderCoverUrl(folder).then((coverUrl) => {
        if (coverUrl) {
            const coverEl = tile.querySelector('.bg_folder_tile_cover') as HTMLElement | null;
            if (coverEl) coverEl.style.backgroundImage = `url("${coverUrl}")`;
        }
    });

    return tile;
}

async function getFolderCoverUrl(folder: Folder): Promise<string | null> {
    const file =
        folder.thumbnailFile ||
        cachedSystemBackgrounds.find((img) => imageFolderMap[img.filename]?.includes(folder.id))
            ?.filename;
    if (!file) return null;
    return isAnimatedBackgroundExtension(file) && !background_settings.animation
        ? getThumbnailFromStorage(file, false)
        : getThumbnailUrl('bg', file);
}

function getFilteredImages(): ImageData[] {
    if (!activeFolderId) return cachedSystemBackgrounds;
    return cachedSystemBackgrounds.filter((img) =>
        imageFolderMap[img.filename]?.includes(activeFolderId!),
    );
}

function onFolderDrillIn(folderId: string): void {
    const folder = folderList.find((f) => f.id === folderId);
    if (!folder) return;

    clearBackgroundGroupSelection();
    activeFolderId = folderId;

    document.getElementById('Backgrounds')?.classList.add('in-folder-view');
    const grid = document.getElementById('bg_folder_grid');
    if (grid) grid.style.display = 'none';
    const crumb = document.getElementById('bg_folder_breadcrumb');
    if (crumb) crumb.style.display = '';
    const nameEl = document.getElementById('bg_current_folder_name');
    if (nameEl) nameEl.textContent = folder.name;

    renderSystemBackgrounds(getFilteredImages());
    highlightSelectedBackground();
}

function onBackToFolders(): void {
    clearBackgroundGroupSelection();
    activeFolderId = null;

    document.getElementById('Backgrounds')?.classList.remove('in-folder-view');
    const grid = document.getElementById('bg_folder_grid');
    if (grid) grid.style.display = '';
    const crumb = document.getElementById('bg_folder_breadcrumb');
    if (crumb) crumb.style.display = 'none';
    const nameEl = document.getElementById('bg_current_folder_name');
    if (nameEl) nameEl.textContent = '';

    renderSystemBackgrounds(getFilteredImages());
    highlightSelectedBackground();
}

function syncGroupSelectionUi(): void {
    const selectedCount = selectedSystemBackgroundFiles.size;
    const isGlobalTab = getActiveBackgroundTab() === BG_SOURCES.GLOBAL;
    const showAddButton = isGlobalTab && isBackgroundSelectionMode && selectedCount > 0;
    const showRemove =
        isGlobalTab && Boolean(activeFolderId) && isBackgroundSelectionMode && selectedCount > 0;

    document
        .getElementById('Backgrounds')
        ?.classList.toggle('bg-selection-mode', isBackgroundSelectionMode);
    document
        .getElementById('bg_selection_mode_button')
        ?.classList.toggle('active', isBackgroundSelectionMode);

    const bgCount = document.getElementById('bg_group_select_count');
    if (bgCount) {
        bgCount.textContent = selectedCount > 0 ? ` (${selectedCount}` : '';
        bgCount.style.display = selectedCount > 0 ? '' : 'none';
    }

    const addBtn = document.getElementById('bg_group_add_to_folder_button');
    if (addBtn) addBtn.style.display = showAddButton ? '' : 'none';
    const remBtn = document.getElementById('bg_folder_remove_selected_button');
    if (remBtn) remBtn.style.display = showRemove ? '' : 'none';

    const examples = document
        .getElementById('bg_menu_content')
        ?.getElementsByClassName('bg_example');
    if (examples) {
        for (let i = 0; i < examples.length; i++) {
            const el = examples[i] as HTMLElement;
            el.classList.toggle(
                'folder-group-selected',
                selectedSystemBackgroundFiles.has(el.getAttribute('bgfile') || ''),
            );
        }
    }
}

function setBackgroundSelectionMode(enabled: boolean): void {
    isBackgroundSelectionMode = enabled;
    if (!enabled) selectedSystemBackgroundFiles.clear();

    const openMenus = document
        .getElementById('bg_menu_content')
        ?.getElementsByClassName('mobile-menu-open');
    while (openMenus?.length) openMenus[0]!.classList.remove('mobile-menu-open');

    syncGroupSelectionUi();
}

function toggleBackgroundGroupSelection(bgFile: string): void {
    if (!bgFile) return;
    if (selectedSystemBackgroundFiles.has(bgFile)) selectedSystemBackgroundFiles.delete(bgFile);
    else selectedSystemBackgroundFiles.add(bgFile);
    syncGroupSelectionUi();
}

function clearBackgroundGroupSelection(): void {
    selectedSystemBackgroundFiles.clear();
    syncGroupSelectionUi();
}

function updateGroupFolderControlsVisibility(): void {
    const isGlobalTab = getActiveBackgroundTab() === BG_SOURCES.GLOBAL;
    const btn = document.getElementById('bg_selection_mode_button');
    if (btn) btn.style.display = isGlobalTab ? '' : 'none';

    if (!isGlobalTab && isBackgroundSelectionMode) setBackgroundSelectionMode(false);
    else syncGroupSelectionUi();
}

async function selectFoldersForGroupAction(headingText: string): Promise<string[] | null> {
    if (folderList.length === 0) {
        notyf.info(t`Create a folder first`);
        return null;
    }

    const contentEl = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = headingText;
    contentEl.appendChild(heading);

    for (let i = 0; i < folderList.length; i++) {
        const folder = folderList[i]!;
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

    const result = await callGenericPopup(contentEl, POPUP_TYPE.CONFIRM, '', {
        okButton: t`Apply`,
        cancelButton: t`Cancel`,
        allowVerticalScrolling: true,
        leftAlign: true,
    });
    if (!result) return null;

    const selectedIds: string[] = [];
    const checkboxes = contentEl.querySelectorAll('input[type="checkbox"]:checked');
    for (let i = 0; i < checkboxes.length; i++) {
        selectedIds.push((checkboxes[i] as HTMLInputElement).dataset.folderId || '');
    }
    return selectedIds.length > 0 ? selectedIds : null;
}

async function updateFolderAssignments(
    bgFiles: string[],
    folderId: string,
    isRemove: boolean,
): Promise<void> {
    const paths = bgFiles.map(getBackgroundRelativePath);
    const endpoint = isRemove
        ? '/api/image-metadata/folders/unassign'
        : '/api/image-metadata/folders/assign';

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ id: folderId, paths }),
    });

    if (!response.ok) throw new Error(`Folder update failed: ${response.status}`);

    for (let i = 0; i < bgFiles.length; i++) {
        const bgFile = bgFiles[i];
        const currentFolderIds = imageFolderMap[bgFile!] || [];
        if (isRemove) {
            const nextFolderIds = currentFolderIds.filter((id: string) => id !== folderId);
            if (nextFolderIds.length > 0) imageFolderMap[bgFile!] = nextFolderIds;
            else delete imageFolderMap[bgFile!];
        } else if (!currentFolderIds.includes(folderId)) {
            imageFolderMap[bgFile!] = [...currentFolderIds, folderId];
        }
    }
}

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
        for (let i = 0; i < folderIds.length; i++) {
            const folderId = folderIds[i]!;
            const actionableBgFiles = bgFiles.filter(
                (bg) => !(imageFolderMap[bg!] || []).includes(folderId),
            );
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
        console.error('Error removing selected backgrounds from folder:', error);
        notyf.error(t`Failed to update folder assignment`);
    }
}

async function onCreateFolder(): Promise<void> {
    if (getActiveBackgroundTab() !== BG_SOURCES.GLOBAL) {
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

async function onRenameFolder(folderId: string): Promise<void> {
    const folder = folderList.find((f) => f.id === folderId);
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

async function onDeleteFolder(folderId: string): Promise<void> {
    const folder = folderList.find((f) => f.id === folderId);
    if (!folder) return;

    const confirm = await Popup.show.confirm(
        t`Delete folder "${folder.name}"?`,
        t`Images will not be deleted, only the folder grouping.`,
    );
    if (!confirm) return;

    try {
        const response = await fetch('/api/image-metadata/folders/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ id: folderId }),
        });
        if (response.ok) {
            folderList = folderList.filter((f) => f.id !== folderId);
            for (const key in imageFolderMap) {
                const arr = imageFolderMap[key];
                if (arr) {
                    const idx = arr.indexOf(folderId);
                    if (idx !== -1) arr.splice(idx, 1);
                }
            }
            if (activeFolderId === folderId) onBackToFolders();
            renderFolderGrid();
            notyf.success(t`Folder deleted`);
        }
    } catch (error) {
        console.error('Error deleting folder:', error);
        notyf.error(t`Failed to delete folder`);
    }
}

async function onAssignToFolder(bgFile: string): Promise<void> {
    if (folderList.length === 0) {
        notyf.info(t`Create a folder first`);
        return;
    }

    const currentFolderIds = imageFolderMap[bgFile] || [];
    const contentEl = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = t`Assign to folders`;
    contentEl.appendChild(heading);

    for (let i = 0; i < folderList.length; i++) {
        const f = folderList[i]!;
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

    const result = await callGenericPopup(contentEl, POPUP_TYPE.CONFIRM, '', {
        okButton: t`Save`,
        cancelButton: t`Cancel`,
    });
    if (!result) return;

    const toAssign: string[] = [];
    const toUnassign: string[] = [];
    const checkboxes = contentEl.querySelectorAll('input[type="checkbox"]');

    for (let i = 0; i < checkboxes.length; i++) {
        const cb = checkboxes[i] as HTMLInputElement;
        const fid = cb.dataset.folderId!;
        const wasChecked = currentFolderIds.includes(fid);
        if (cb.checked && !wasChecked) toAssign.push(fid);
        if (!cb.checked && wasChecked) toUnassign.push(fid);
    }

    try {
        for (let i = 0; i < toAssign.length; i++)
            await updateFolderAssignments([bgFile], toAssign[i]!, false);
        for (let i = 0; i < toUnassign.length; i++)
            await updateFolderAssignments([bgFile], toUnassign[i]!, true);

        renderFolderGrid();
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

async function onSetFolderCover(bgFile: string): Promise<void> {
    if (!activeFolderId) return;

    try {
        const response = await fetch('/api/image-metadata/folders/update', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ id: activeFolderId, thumbnailFile: bgFile }),
        });
        if (response.ok) {
            const folder = folderList.find((f) => f.id === activeFolderId);
            if (folder) {
                folder.thumbnailFile = bgFile;
                const coverUrl = await getFolderCoverUrl(folder);
                if (coverUrl) {
                    const coverEl = document.querySelector(
                        `.bg_folder_tile[data-folder-id="${folder.id}"] .bg_folder_tile_cover`,
                    ) as HTMLElement;
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

function activateLazyLoader(): void {
    if (lazyLoadObserver) {
        lazyLoadObserver.disconnect();
        lazyLoadObserver = null;
    }

    lazyLoadObserver = new IntersectionObserver(
        (entries, observer) => {
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i]!;
                if (entry.isIntersecting) {
                    const clipper = entry.target as HTMLElement;
                    const parent = clipper.closest('.bg_example');

                    if (parent) {
                        const bg = parent.getAttribute('bgfile') || '';
                        const isCustom = parent.getAttribute('custom') === 'true';
                        const isAnimated = parent.getAttribute('animated') === 'true';
                        resolveImageUrl(bg, isCustom, isAnimated)
                            .then((url) => {
                                clipper.style.backgroundImage = url;
                            })
                            .catch(() => {
                                clipper.style.backgroundImage = PLACEHOLDER_IMAGE;
                            });
                    }

                    clipper.classList.remove('lazy-load-background');
                    observer.unobserve(clipper);
                }
            }
        },
        { rootMargin: '200px', threshold: 0.01 },
    );

    const elements = document.getElementsByClassName('lazy-load-background');
    for (let i = 0; i < elements.length; i++) {
        lazyLoadObserver.observe(elements[i]!);
    }
}

function generateUrlParameter(bg: string, isCustom: boolean): string {
    return isCustom ? `url("${encodeURI(bg)}")` : `url("${getBackgroundPath(bg)}")`;
}

function isAnimatedBackgroundExtension(fileName: string): boolean {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    return ANIMATED_BACKGROUND_EXTENSIONS.has(ext);
}

async function resolveImageUrl(
    bg: string,
    isCustom: boolean,
    isAnimated: boolean | null = null,
): Promise<string> {
    const animated = isAnimated ?? isAnimatedBackgroundExtension(bg);
    const url =
        animated && !background_settings.animation
            ? await getThumbnailFromStorage(bg, isCustom)
            : isCustom
              ? bg
              : getThumbnailUrl('bg', bg);
    return `url("${url}")`;
}

async function setBackground(bg: string, url: string): Promise<void> {
    if (!isChatBackgroundLocked()) {
        const bg1 = document.getElementById('bg1');
        if (bg1) bg1.style.backgroundImage = url;
    }
    background_settings.name = bg;
    background_settings.url = url;
    saveSettingsDebounced();
}

async function delBackground(bg: string): Promise<void> {
    await fetch('/api/backgrounds/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ bg }),
    });
    await THUMBNAIL_STORAGE.removeItem(bg);
    const blob = THUMBNAIL_BLOBS.get(bg);
    if (blob) {
        URL.revokeObjectURL(blob);
        THUMBNAIL_BLOBS.delete(bg);
    }
}

async function onBackgroundUploadSelected(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    if (!input?.files) return;

    const files = input.files;
    const tab = getActiveBackgroundTab();

    for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        if (file.size === 0) continue;

        const formData = new FormData();
        formData.append('avatar', file);
        await convertFileIfVideo(formData);

        if (tab === BG_SOURCES.GLOBAL) await uploadBackground(formData);
        else if (tab === BG_SOURCES.CHAT) await uploadChatBackground(formData);
    }
    input.value = '';
}

async function convertFileIfVideo(formData: FormData): Promise<void> {
    const file = formData.get('avatar');
    if (!(file instanceof File) || !file.type.startsWith('video/')) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (globalThis as any).convertVideoToAnimatedWebp !== 'function') {
        notyf.warning(
            t`Click here to install the Video Background Loader extension`,
            t`Video background uploads require a downloadable add-on`,
            {
                timeOut: 0,
                extendedTimeOut: 0,
                onclick: () =>
                    openThirdPartyExtensionMenu(
                        'https://github.com/SillyTavern/Extension-VideoBackgroundLoader',
                    ),
            },
        );
        return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toast = notyf.info(
        t`Preparing video for upload. This may take several minutes.`,
        t`Please wait`,
        { timeOut: 0, extendedTimeOut: 0 },
    ) as any;
    try {
        const buffer = new Uint8Array(await file.arrayBuffer());
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const converted = await (globalThis as any).convertVideoToAnimatedWebp({
            buffer,
            name: file.name,
        });
        formData.set(
            'avatar',
            new File([new Uint8Array(converted)], file.name.replace(/\.[^/.]+$/, '.webp'), {
                type: 'image/webp',
            }),
        );
        toast?.remove();
    } catch (error) {
        formData.delete('avatar');
        toast?.remove();
        console.error('Error converting video to animated webp:', error);
        notyf.error(t`Error converting video to animated webp`);
    }
}

async function uploadBackground(formData: FormData): Promise<void> {
    if (!formData.has('avatar')) return;
    try {
        const response = await fetch('/api/backgrounds/upload', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
            body: formData,
            cache: 'no-cache',
        });
        if (!response.ok) throw new Error('Failed to upload background');

        const bg = await response.text();
        setBackground(bg, generateUrlParameter(bg, false));
        await getBackgrounds();
        highlightNewBackground(bg);
    } catch (error) {
        console.error('Error uploading background:', error);
    }
}

async function uploadChatBackground(formData: FormData): Promise<void> {
    if (!getCurrentChatId()) {
        notyf.warning(t`Select a chat to upload a background for it`);
        return;
    }
    if (!formData.has('avatar')) return;

    const file = formData.get('avatar') as File;
    try {
        const imageDataUri = await getBase64Async(file);
        const base64Data = (imageDataUri as string).split(',')[1];
        const characterName = selected_group
            ? groups.find((g) => g.id === selected_group)?.id?.toString()
            : characters[this_chid]?.name;
        const filename = `${characterName}_${humanizedDateTime()}`;
        const imagePath = await saveBase64AsFile(
            base64Data,
            characterName,
            filename,
            getFileExtension(file),
        );

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

function highlightNewBackground(bg: string): void {
    const newBg = document.querySelector(`.bg_example[bgfile="${bg}"]`);
    if (!newBg || !newBg.parentElement) return;
    const scrollOffset = (newBg as HTMLElement).offsetTop - newBg.parentElement.offsetTop;
    const container = document.getElementById('Backgrounds');
    if (container) container.scrollTop = scrollOffset;
    flashHighlight(newBg);
}

function setFittingClass(fitting: string): void {
    const backgrounds = document.getElementById('bg1');
    if (backgrounds) {
        backgrounds.classList.toggle('cover', fitting === 'cover');
        backgrounds.classList.toggle('contain', fitting === 'contain');
        backgrounds.classList.toggle('stretch', fitting === 'stretch');
        backgrounds.classList.toggle('center', fitting === 'center');
    }
    background_settings.fitting = fitting;
}

function highlightSelectedBackground(): void {
    // O(K) rapid class removal
    const active = document.getElementsByClassName('selected-background');
    while (active.length > 0) active[0]!.classList.remove('selected-background');

    const activeUrl = background_settings.url as string;
    if (activeUrl) {
        const examples = document.getElementsByClassName('bg_example');
        for (let i = 0; i < examples.length; i++) {
            const el = examples[i] as HTMLElement;
            if (el.dataset.url === activeUrl) el.classList.add('selected-background');
        }
    }
}

const onBackgroundFilterInput = debounce(() => {
    const filterValue =
        (document.getElementById('bg-filter') as HTMLInputElement | null)?.value.toLowerCase() ||
        '';
    const examples = document.getElementsByClassName('bg_example');

    for (let i = 0; i < examples.length; i++) {
        const el = examples[i] as HTMLElement;
        if (el.id !== '') continue; // Skip templates
        const title = el.getAttribute('title') || '';
        el.style.display = title.toLowerCase().includes(filterValue) ? '' : 'none';
    }

    if (!activeFolderId) {
        const folders = document
            .getElementById('bg_folder_grid')
            ?.getElementsByClassName('bg_folder_tile');
        if (folders) {
            for (let i = 0; i < folders.length; i++) {
                const el = folders[i] as HTMLElement;
                const fid = el.dataset.folderId;
                if (!fid || !filterValue) {
                    el.style.display = '';
                    continue;
                }
                const f = folderList.find((x) => x.id === fid);
                el.style.display = f && f.name.toLowerCase().includes(filterValue) ? '' : 'none';
            }
        }
    }
}, debounce_timeout.standard);

function switchBgTab(tabHref: string): void {
    const tabs = document.getElementById('bg_tabs');
    if (!tabs) return;

    const targetId = tabHref.replace('#', '');
    const targetPanel = document.getElementById(targetId);
    if (!targetPanel) return;

    // Hide all panels, show target
    tabs.querySelectorAll<HTMLElement>('.bg_tab_panel').forEach((panel) => {
        panel.style.display = 'none';
    });
    targetPanel.style.display = '';

    // Toggle active class on buttons
    tabs.querySelectorAll('.bg_tab_button').forEach((btn) => {
        btn.classList.remove('ui-tabs-active');
    });
    const activeButton = tabs.querySelector<HTMLAnchorElement>(`.bg_tab_button a[href="${tabHref}"]`);
    activeButton?.closest('.bg_tab_button')?.classList.add('ui-tabs-active');

    tabs.dispatchEvent(new CustomEvent('tabsactivate', { bubbles: true }));
}

export function getActiveBackgroundTab(): number {
    const tabs = document.getElementById('bg_tabs');
    if (!tabs) return BG_SOURCES.GLOBAL;
    const activeButton = tabs.querySelector('.bg_tab_button.ui-tabs-active');
    if (!activeButton) return BG_SOURCES.GLOBAL;
    const href = activeButton.querySelector('a')?.getAttribute('href');
    return href === '#bg_chat_tab' ? BG_SOURCES.CHAT : BG_SOURCES.GLOBAL;
}

export function initBackgrounds(): void {
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
    eventSource.on(event_types.FORCE_SET_BACKGROUND, forceSetBackground);

    // O(1) Master Event Delegation for the entire background module
    document.addEventListener('click', (event: Event) => {
        const target = event.target as Element;
        if (!target) return;

        const button = target.closest('.jg-button');
        if (button) {
            event.stopPropagation();
            if (isBackgroundSelectionMode && button.closest('#bg_menu_content')) return;
            const action = button.getAttribute('data-action');
            if (action === 'lock') onLockBackgroundClick(event);
            else if (action === 'unlock') onUnlockBackgroundClick();
            else if (action === 'edit') onRenameBackgroundClick.call(button as HTMLElement, event);
            else if (action === 'delete')
                onDeleteBackgroundClick.call(button as HTMLElement, event);
            else if (action === 'copy')
                onCopyToSystemBackgroundClick.call(button as HTMLElement, event);
            else if (action === 'folder') {
                const bgEl = button.closest('.bg_example');
                if (bgEl?.getAttribute('custom') !== 'true') {
                    const bgFile = bgEl?.getAttribute('bgfile');
                    if (bgFile) onAssignToFolder(bgFile);
                }
            } else if (action === 'set-cover') {
                const bgEl = button.closest('.bg_example');
                if (bgEl?.getAttribute('custom') !== 'true') {
                    const bgFile = bgEl?.getAttribute('bgfile');
                    if (bgFile) onSetFolderCover(bgFile);
                }
            }
            return;
        }

        const mobileToggle = target.closest('.mobile-only-menu-toggle');
        if (mobileToggle) {
            event.stopPropagation();
            const context =
                mobileToggle.closest('.bg_example') || mobileToggle.closest('.bg_folder_tile');
            const wasOpen = context?.classList.contains('mobile-menu-open');
            const opens = document.getElementsByClassName('mobile-menu-open');
            while (opens.length) opens[0]!.classList.remove('mobile-menu-open');
            if (!wasOpen && context) context.classList.add('mobile-menu-open');
            return;
        }

        const bgExample = target.closest('.bg_example');
        if (bgExample) return onSelectBackgroundClick.call(bgExample as HTMLElement, event);

        const folderActionRename = target.closest('.bg_folder_tile [data-action="rename-folder"]');
        if (folderActionRename) {
            event.stopPropagation();
            const id = folderActionRename
                .closest('.bg_folder_tile')
                ?.getAttribute('data-folder-id');
            if (id) onRenameFolder(id);
            return;
        }

        const folderActionDel = target.closest('.bg_folder_tile [data-action="delete-folder"]');
        if (folderActionDel) {
            event.stopPropagation();
            const id = folderActionDel.closest('.bg_folder_tile')?.getAttribute('data-folder-id');
            if (id) onDeleteFolder(id);
            return;
        }

        const folderTile = target.closest('.bg_folder_tile:not(.bg_new_folder_tile)');
        if (folderTile) {
            const id = folderTile.getAttribute('data-folder-id');
            if (id) onFolderDrillIn(id);
            return;
        }

        if (target.closest('#bg_add_folder_button')) return onCreateFolder();
        if (target.closest('#bg_back_to_folders')) return onBackToFolders();
    });

    document.addEventListener(
        'blur',
        (event: Event) => {
            const target = event.target as Element;
            if (!target) return;
            const el = target.closest('.mobile-menu-open');
            if (el && !el.matches(':focus-within')) el.classList.remove('mobile-menu-open');
        },
        true,
    );

    const bindClick = (id: string, fn: () => void) =>
        document.getElementById(id)?.addEventListener('click', fn);
    bindClick('bg_thumb_zoom_in', () =>
        applyThumbnailColumns((background_settings.thumbnailColumns as number) - 1),
    );
    bindClick('bg_thumb_zoom_out', () =>
        applyThumbnailColumns((background_settings.thumbnailColumns as number) + 1),
    );
    bindClick('auto_background', autoBackgroundCommand);
    bindClick('bg_selection_mode_button', () =>
        setBackgroundSelectionMode(!isBackgroundSelectionMode),
    );
    bindClick('bg_group_add_to_folder_button', onAddSelectedToFolder);
    bindClick('bg_folder_remove_selected_button', onRemoveSelectedFromCurrentFolder);

    document
        .getElementById('add_bg_button')
        ?.addEventListener('change', onBackgroundUploadSelected);
    document.getElementById('bg-filter')?.addEventListener('input', onBackgroundFilterInput);

    document
        .getElementById('bg-sort')
        ?.addEventListener('change', function (this: HTMLSelectElement) {
            background_settings.sortOrder = this.value;
            saveSettingsDebounced();
            renderSystemBackgrounds(getFilteredImages());
            renderChatBackgrounds();
            highlightSelectedBackground();
            highlightLockedBackground();
            onBackgroundFilterInput();
        });

    document
        .getElementById('background_fitting')
        ?.addEventListener('input', function (this: HTMLSelectElement) {
            setFittingClass(this.value);
            saveSettingsDebounced();
        });

    document
        .getElementById('background_thumbnails_animation')
        ?.addEventListener('input', async function (this: HTMLInputElement) {
            background_settings.animation = this.checked;
            saveSettingsDebounced();
            await getBackgrounds();
            await onChatChanged();
        });

    const addCmd = (
        name: string,
        aliases: string[],
        callback: () => string | Promise<string>,
        helpString: string,
    ) => {
        SlashCommandParser.addCommandObject(
            SlashCommand.fromProps({ name, aliases, callback, helpString }),
        );
    };

    addCmd(
        'lockbg',
        ['bglock'],
        () => {
            onLockBackgroundClick();
            return '';
        },
        'Locks a background for the currently selected chat',
    );
    addCmd(
        'unlockbg',
        ['bgunlock'],
        () => {
            onUnlockBackgroundClick();
            return '';
        },
        'Unlocks a background for the currently selected chat',
    );
    addCmd(
        'autobg',
        ['bgauto'],
        autoBackgroundCommand,
        'Automatically changes the background based on the chat context',
    );

    Object.values(BG_TABS).forEach((tabId) =>
        setupScrollToTop({
            scrollContainerId: tabId,
            buttonId: 'bg-scroll-top',
            drawerId: 'Backgrounds',
        }),
    );

    // Native tab switching (replaces jQuery UI tabs)
    document.querySelectorAll<HTMLElement>('.bg_tabs_list .bg_tab_button a').forEach((link) => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const href = (e.currentTarget as HTMLAnchorElement).getAttribute('href');
            if (href) switchBgTab(href);
        });
    });

    // Activate Global tab by default
    switchBgTab('#bg_global_tab');

    document
        .getElementById('bg_tabs')
        ?.addEventListener('tabsactivate', updateGroupFolderControlsVisibility);
    updateGroupFolderControlsVisibility();
    syncGroupSelectionUi();
}
