/**
 * Shared utilities for the chat sub-modules.
 *
 * Extracts common patterns (template loading, DOM helpers,
 * server calls) so the domain modules stay DRY.
 */

import { renderExtensionTemplateAsync } from '../extensions.js';

// ── Template loading ──────────────────────────────────────────

/**
 * Renders an extension template and returns the first child element.
 *
 * Eliminates the 6-line boilerplate of:
 *   templateHTML → createElement('div') → innerHTML → firstElementChild → guard
 * @param templateName
 * @param group
 * @param data
 * @returns The template root element, or `null` on failure.
 */
export async function loadTemplate(
    templateName: string,
    group: string = 'attachments',
    data: Record<string, unknown> = {},
): Promise<Element | null> {
    try {
        const templateHTML = await renderExtensionTemplateAsync(group, templateName, data);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = templateHTML;
        const template = tempDiv.firstElementChild;
        if (!template) {
            console.error(`Template "${group}/${templateName}" rendered no root element`);
        }
        return template;
    } catch (error) {
        console.error(`Failed to load template "${group}/${templateName}":`, error);
        return null;
    }
}

// ── DOM query helpers ─────────────────────────────────────────

/**
 * Type-safe querySelector that casts the result.
 * @param parent
 * @param selector
 */
export function qs<K extends keyof HTMLElementTagNameMap>(
    parent: ParentNode,
    selector: K,
): HTMLElementTagNameMap[K] | null;
export function qs<E extends Element = Element>(
    parent: ParentNode,
    selector: string,
): E | null;
export function qs(parent: ParentNode, selector: string): Element | null {
    return parent.querySelector(selector);
}

/**
 * Type-safe querySelector with instanceof check.
 * @param parent
 * @param selector
 * @param ctor
 */
export function qsAs<T extends Element>(
    parent: ParentNode,
    selector: string,
    ctor: new (...args: unknown[]) => T,
): T | null {
    const el = parent.querySelector(selector);
    return el instanceof ctor ? el : null;
}

/**
 * Assert an element is of a given type or throw.
 * @param el
 * @param ctor
 * @param name
 */
export function assertEl<T extends Element>(
    el: Element | null,
    ctor: new (...args: unknown[]) => T,
    name: string,
): T {
    if (!(el instanceof ctor)) {
        throw new Error(`Expected "${name}" to be a ${ctor.name}`);
    }
    return el;
}

// ── Server API helpers ────────────────────────────────────────

import { getRequestHeaders, eventSource } from '../../script.js';

/**
 * Perform a JSON POST request to a server endpoint.
 * Throws on non-OK responses.
 * @param url
 * @param body
 */
export async function apiPost<T = unknown>(
    url: string,
    body: Record<string, unknown>,
): Promise<T> {
    const result = await fetch(url, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(body),
    });

    if (!result.ok) {
        const error = await result.text();
        throw new Error(error);
    }

    return result.json() as Promise<T>;
}

/**
 * Perform a GET request and return the response text.
 * @param url
 * @param cache
 */
export async function apiGetText(url: string, cache: RequestCache = 'force-cache'): Promise<string> {
    const result = await fetch(url, {
        method: 'GET',
        cache,
        headers: getRequestHeaders(),
    });

    if (!result.ok) {
        const error = await result.text();
        throw new Error(error);
    }

    return result.text();
}

/**
 * Delete a resource from the server.
 *
 * Collapses the near-identical `deleteMediaFromServer` /
 * `deleteFileFromServer` pattern into one call.
 * @param endpoint  API path  e.g. `/api/images/delete`
 * @param path      Server-side file path
 * @param eventType Event to emit on success  (or null)
 * @param silent    If true, suppress error logging
 * @returns         Whether the deletion succeeded
 */
export async function serverDelete(
    endpoint: string,
    path: string,
    eventType?: string,
    silent = false,
): Promise<boolean> {
    try {
        await apiPost(endpoint, { path });
        if (eventType) {
            eventSource.emit(eventType, path);
        }
        return true;
    } catch (error) {
        if (!silent) {
            console.error(`Failed to delete ${path}:`, error);
        }
        return false;
    }
}

// ── Popup helpers ─────────────────────────────────────────────

import { POPUP_RESULT, POPUP_TYPE, callGenericPopup } from '../popup.js';

/**
 * Show a simple confirm dialog and return whether the user accepted.
 * @param message
 */
export async function confirmDialog(message: string): Promise<boolean> {
    const result = await callGenericPopup(message, POPUP_TYPE.CONFIRM);
    return result === POPUP_RESULT.AFFIRMATIVE;
}

// ── DataTransfer helpers ──────────────────────────────────────

import { isSameFile } from '../utils.js';

/**
 * Merge files into a DataTransfer, preserving existing files and
 * skipping duplicates (by name + size + lastModified).
 * @param existing
 * @param incoming
 */
export function mergeFilesIntoDataTransfer(
    existing: FileList | File[],
    incoming: File[],
): DataTransfer {
    const dt = new DataTransfer();

    for (const file of existing) {
        dt.items.add(file);
    }

    for (const file of incoming) {
        const isDuplicate = Array.from(dt.files).some((f) => isSameFile(f, file));
        if (!isDuplicate) {
            dt.items.add(file);
        }
    }

    return dt;
}
