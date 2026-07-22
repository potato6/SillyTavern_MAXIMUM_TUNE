/**
 * Unified action loader system - shows loader overlay with optional toast notifications.
 * Designed to be flexible and reusable for various long-running operations.
 *
 * Features:
 * - Stacking multiple loaders - overlay stays single, but toasts can stack
 * - Blocking and non-blocking modes
 * - Stoppable or static toasts
 * - Class-based handle system for fine-grained control
 * @module action-loader
 */

import { t } from './i18n.js';
import { stopGeneration } from '../script.js';
import { Popup, POPUP_RESULT, POPUP_TYPE } from './popup.js';

/**
 * Enum representing the toast display mode for the action loader.
 * @readonly
 * @enum {string}
 */
export const ActionLoaderToastMode = {
    NONE: 'none',
    STATIC: 'static',
    STOPPABLE: 'stoppable',
};

let loaderIdCounter = 0;
let blockingLoaderCount = 0;

/** @type {Map<string, ActionLoaderHandle>} Map of all active loader handles by ID */
const activeHandles = new Map<string, ActionLoaderHandle>();

function generateLoaderId() {
    return `loader_${++loaderIdCounter}`;
}

let emptyHandleInstance: ActionLoaderHandle | null = null;

/**
 * Class representing an action loader handle.
 * Manages its own toast, stop handler, and lifecycle.
 */
export class ActionLoaderHandle {
    /**
     * A special empty handle that is already disposed.
     * Does not generate any id, toast, or overlay, and all its methods are no-ops.
     * @type {ActionLoaderHandle}
     */
    static get EMPTY() {
        if (!emptyHandleInstance) {
            emptyHandleInstance = new ActionLoaderHandle({ predisposed: true });
        }
        return emptyHandleInstance;
    }

    #id: string;
    #slug: string | null = null;
    #toast: import('notyf').NotyfNotification | null = null;
    #onStop: (() => void) | null = null;
    #onHide: (() => void) | null = null;
    #blocking = true;
    #disposed = false;

    /**
     * Creates a new ActionLoaderHandle.
     * @param {object} options - Configuration options
     */
    constructor({
        blocking = true,
        toastMode = ActionLoaderToastMode.STOPPABLE,
        slug = null,
        message = t`Generating...`,
        title = '',
        stopTooltip = t`Stop`,
        overlayContent = null,
        onStop = null,
        onHide = null,
        predisposed = false,
    }: {
        blocking?: boolean;
        toastMode?: string;
        slug?: string | null;
        message?: string;
        title?: string;
        stopTooltip?: string;
        overlayContent?: HTMLElement | string | null;
        onStop?: (() => void) | null;
        onHide?: (() => void) | null;
        predisposed?: boolean;
    } = {}) {
        if (predisposed) {
            this.#id = 'empty';
            this.#disposed = true;
            return;
        }

        this.#id = generateLoaderId();
        this.#slug = slug;
        this.#blocking = blocking;
        this.#onStop = onStop;
        this.#onHide = onHide;

        if (!blocking && toastMode === ActionLoaderToastMode.NONE && !overlayContent) {
            console.warn('[ActionLoader] Non-blocking loader created without a toast. This loader will not be visible to the user.');
        }

        if (blocking) {
            if (blockingLoaderCount === 0 && !isOverlayDisplayed()) {
                showOverlay(overlayContent);
            }
            blockingLoaderCount++;
        }

        activeHandles.set(this.#id, this);

        if (toastMode !== ActionLoaderToastMode.NONE) {
            this.#createToast(message, title, toastMode, stopTooltip);
        }
    }

    #createToast(message: string, title: string, toastMode: string, stopTooltip: string) {
        let html = `<div class="action-loader-toast" data-loader-id="${this.#id}" data-blocking="${this.#blocking}"`;
        if (this.#slug) html += ` data-slug="${this.#slug}"`;
        html += `><span class="action-loader-message">${message}</span>`;

        if (toastMode === ActionLoaderToastMode.STOPPABLE) {
            html += `<i class="fa-solid fa-stop-circle action-loader-stop interactable" title="${stopTooltip}"></i>`;
        }
        html += `</div>`;

        this.#toast = notyf.info(html, title, {
            timeOut: 0,
            extendedTimeOut: 0,
            tapToDismiss: false,
            escapeHtml: false,
        });

        if (this.#toast) {
            this.#toast.on('click' as unknown as import('notyf').NotyfEvent, () => {
                if (toastMode === ActionLoaderToastMode.STOPPABLE) {
                    this.stop();
                }
            });
        }
    }

    #clearToast() {
        if (this.#toast) {
            notyf.dismiss(this.#toast);
            this.#toast = null;
        }
    }

    async #dispose() {
        if (this.#disposed) return;
        this.#disposed = true;

        this.#clearToast();
        activeHandles.delete(this.#id);

        if (this.#blocking) {
            blockingLoaderCount--;
            if (blockingLoaderCount <= 0) {
                blockingLoaderCount = 0;
                await hideOverlay();
            }
        }
    }

    get id() { return this.#id; }
    get slug() { return this.#slug; }
    get isActive() { return !this.#disposed; }
    get isBlocking() { return this.#blocking; }

    async stop() {
        if (this.#disposed) return;

        if (this.#onStop) {
            try {
                await this.#onStop();
            } catch (e) {
                console.error('Error executing onStop handler', e);
            }
        } else {
            stopGeneration();
        }

        await this.#dispose();
    }

    async hide() {
        if (this.#disposed) return;

        if (this.#onHide) {
            try {
                await this.#onHide();
            } catch (e) {
                console.error('Error executing onHide handler', e);
            }
        }

        await this.#dispose();
    }
}

export const loader = {
    show: showActionLoader,
    hide: hideActionLoader,
    active: getActiveLoaderHandles,
    get: getLoaderHandleById,
    isBlocking: isOverlayDisplayed,
    ToastMode: ActionLoaderToastMode,
    Handle: ActionLoaderHandle,
    createOverlay: createDefaultLoaderOverlay,
};

export function showActionLoader(options = {}) {
    return new ActionLoaderHandle(options);
}

export async function hideActionLoader(handle?: ActionLoaderHandle | null) {
    if (handle instanceof ActionLoaderHandle) {
        if (handle.isActive) {
            await handle.hide();
            return true;
        }
        return false;
    }

    if (activeHandles.size === 0) return false;

    const hidePromises = [];
    for (const h of activeHandles.values()) {
        hidePromises.push(h.hide());
    }
    await Promise.all(hidePromises);

    return true;
}

export function getActiveLoaderHandles() {
    return Array.from(activeHandles.values());
}

export function getLoaderHandleById(id: string): ActionLoaderHandle | undefined {
    return activeHandles.get(id);
}

// ============================================================================
// Internal overlay management
// ============================================================================

let loaderPopup: Popup | null = null;
let preloaderYoinked = false;

export function createDefaultLoaderOverlay() {
    const loaderElement = document.createElement('div');
    loaderElement.id = 'loader';
    loaderElement.innerHTML = '<div id="load-spinner" class="fa-solid fa-gear fa-spin fa-3x"></div>';
    return loaderElement;
}

function getOverlayContent(customContent: HTMLElement | string | null) {
    if (typeof customContent === 'string' || customContent instanceof HTMLElement) {
        return customContent;
    }
    return createDefaultLoaderOverlay();
}

function isOverlayDisplayed() {
    return !!loaderPopup;
}

function showOverlay(customContent: HTMLElement | string | null = null) {
    if (loaderPopup) loaderPopup.complete(POPUP_RESULT.CANCELLED);

    const content = getOverlayContent(customContent);

    loaderPopup = new Popup(content, POPUP_TYPE.DISPLAY, undefined, {
        allowEscapeClose: false,
        transparent: true,
        animation: 'none',
        wide: true,
        large: true,
    });

    loaderPopup.closeButton.style.display = 'none';
    loaderPopup.show();
}

async function hideOverlay() {
    if (!loaderPopup) return;

    const loaderElement = document.getElementById('loader');

    if (loaderElement) {
        loaderElement.style.filter = 'blur(15px)';
        loaderElement.style.opacity = '0';

        await Promise.race([
            new Promise((r) => setTimeout(r, 500)),
            new Promise((r) => loaderElement.addEventListener('transitionend', r, { once: true }))
        ]);

        loaderElement.remove();
        yoinkPreloader();
    }

    try {
        await loaderPopup.complete(POPUP_RESULT.AFFIRMATIVE);
    } catch (err) {
        console.error('Error completing loaderPopup:', err);
    } finally {
        loaderPopup = null;
    }
}

function yoinkPreloader() {
    if (preloaderYoinked) return;
    document.getElementById('preloader')?.remove();
    preloaderYoinked = true;
}
