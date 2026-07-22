/**
 * World Info editor — UI rendering and event binding.
 *
 * DOM-dependent: knows about templates, popups, TomSelect, Sortable.
 * Imports data/engine functions from their respective modules; never
 * imports from world-info.ts directly to avoid circular dependencies.
 */

import { getSelect2OptionId } from '../utils.js';
import type { WorldInfoBook } from './types.js';

import { setValueByPath } from '../utils.js';

// ═══════════════════════════════════════════════════════════════
//  Template references
// ═══════════════════════════════════════════════════════════════

export const WI_ENTRY_HEADER_TEMPLATE = /** @type {HTMLElement} */ (
    document.querySelector('#entry_edit_template .world_entry')
);
export const WI_ENTRY_EDIT_TEMPLATE = /** @type {HTMLElement} */ (
    document.querySelector('#entry_edit_template .world_entry_edit')
);

// ═══════════════════════════════════════════════════════════════
//  Utilities
// ═══════════════════════════════════════════════════════════════

/**
 * Shows a toast when no WI file is loaded.
 */
export function nullWorldInfo() {
    notyf.info('Create or import a new World Info file first.', 'World Info is not set', {
        timeOut: 10000,
        preventDuplicates: true,
    });
}

/**
 * Updates the global key-options cache used by TomSelect autocomplete.
 * @param keyOptions
 * @param root0
 * @param root0.remove
 * @param root0.reset
 */
export function updateWorldEntryKeyOptionsCache(
    keyOptions: (string | { id: string; text: string })[],
    { remove = false, reset = false }: { remove?: boolean; reset?: boolean } = {},
) {
    if (!keyOptions.length) return;
    const options = keyOptions.map((x) =>
        typeof x === 'string' ? { id: getSelect2OptionId(x), text: x } : { ...x, count: 0 },
    );
    if (reset) worldEntryKeyOptionsCache.length = 0;
    options.forEach((option) => {
        const cachedEntry = worldEntryKeyOptionsCache.find((x) => x.id == option.id);
        if (cachedEntry) {
            cachedEntry.count += !remove ? 1 : -1;
        } else if (!remove) {
            worldEntryKeyOptionsCache.push({ ...option, count: 1 });
        }
    });
    worldEntryKeyOptionsCache.sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
}

/** @type {{ id: string; text: string; count: number }[]} */
export const worldEntryKeyOptionsCache: { id: string; text: string; count: number }[] = [];

/**
 * Clears all child elements and TomSelect instances from a list element.
 * @param listElement
 */
export function clearEntryList(listElement: HTMLElement) {
    if (!listElement.children.length) return;

    listElement.querySelectorAll('.inline-drawer').forEach(function (el) {
        el.removeEventListener('inline-drawer-toggle', nullWorldInfo);
    });

    listElement.querySelectorAll('option').forEach(function (option) {
        option.remove();
    });

    listElement.querySelectorAll('select').forEach(function (select) {
        // @ts-expect-error TS(2339) Property 'tomselect' does not exist
        const tomSelect = select.tomselect;
        if (tomSelect) {
            try {
                tomSelect.destroy();
            } catch (e) {
                console.debug('TomSelect destroy failed:', e);
            }
        }
        const container = select.parentElement;
        if (container) {
            container.remove();
        }
        select.remove();
    });

    listElement.querySelectorAll('div, span, input').forEach(function (elem) {
        elem.remove();
    });

    if (listElement.children.length) {
        listElement.innerHTML = '';
    }
}

/**
 * Sets a value in the original book data at the given key path.
 * @param data
 * @param uid
 * @param key
 * @param value
 */
export function setWIOriginalDataValue(
    data: WorldInfoBook,
    uid: number | string,
    key: string,
    value: unknown,
) {
    if (data.originalData && Array.isArray(data.originalData.entries)) {
        const originalEntry = data.originalData.entries.find(
            (x: Record<string, unknown>) => x.uid === uid,
        );
        if (originalEntry) {
            setValueByPath(originalEntry, key, value);
        }
    }
}

/**
 * Deletes an entry from the original book data.
 * @param data
 * @param uid
 */
export function deleteWIOriginalDataValue(data: WorldInfoBook, uid: number | string) {
    if (data.originalData && Array.isArray(data.originalData.entries)) {
        const originalIndex = data.originalData.entries.findIndex(
            (x: Record<string, unknown>) => x.uid == uid,
        );
        if (originalIndex >= 0) {
            data.originalData.entries.splice(originalIndex, 1);
        }
    }
}
