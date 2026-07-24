import { getRequestHeaders } from '../script.js';
import { VIDEO_EXTENSIONS } from './constants.js';
import { t } from './i18n.js';
import { callGenericPopup, Popup, POPUP_TYPE } from './popup.js';
import { renderTemplateAsync } from './templates.js';
import { humanFileSize, timestampToMoment } from './utils.js';

/**
 * @typedef {object} DataMaidReportResult
 * @property {import('../../src/endpoints/data-maid.js').DataMaidSanitizedReport} report - The sanitized report of the Data Maid.
 * @property {string} token - The token to use for the Data Maid report.
 */

/**
 * Data Maid Dialog class for managing the cleanup dialog interface.
 */
class DataMaidDialog {
    DATA_MAID_CATEGORIES: Record<string, unknown>;
    container: HTMLElement | null;
    spinner: HTMLElement | null;
    placeholder: HTMLElement | null;
    resultsList: HTMLElement | null;
    isScanning: boolean;
    token: string | null; // Changed to string based on usage

    constructor() {
        // Pre-initialize all properties in a fixed order to ensure a stable V8 Hidden Class (Map)
        this.container = null;
        this.spinner = null;
        this.placeholder = null;
        this.resultsList = null;
        this.isScanning = false;
        this.token = null;

        this.DATA_MAID_CATEGORIES = {
            files: {
                name: t`Files`,
                description: t`Files that are not associated with chat messages or Data Bank. WILL DELETE MANUAL UPLOADS!`,
            },
            images: {
                name: t`Images`,
                description: t`Images that are not associated with chat messages. WILL DELETE MANUAL UPLOADS!`,
            },
            chats: {
                name: t`Chats`,
                description: t`Chat files associated with deleted characters.`,
            },
            groupChats: {
                name: t`Group Chats`,
                description: t`Chat files associated with deleted groups.`,
            },
            avatarThumbnails: {
                name: t`Avatar Thumbnails`,
                description: t`Thumbnails for avatars of missing or deleted characters.`,
            },
            backgroundThumbnails: {
                name: t`Background Thumbnails`,
                description: t`Thumbnails for missing or deleted backgrounds.`,
            },
            personaThumbnails: {
                name: t`Persona Thumbnails`,
                description: t`Thumbnails for missing or deleted personas.`,
            },
            chatBackups: {
                name: t`Chat Backups`,
                description: t`Automatically generated chat backups.`,
            },
            settingsBackups: {
                name: t`Settings Backups`,
                description: t`Automatically generated settings backups.`,
            },
        };
    }

    /**
     * Returns a promise that resolves to the Data Maid report.
     * @returns {Promise<DataMaidReportResult>}
     * @private
     */
    async getReport() {
        const response = await fetch('/api/data-maid/report', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (!response.ok) {
            throw new Error(`Error fetching Data Maid report: ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Finalizes the Data Maid process by sending a request to the server.
     * @returns {Promise<void>}
     * @private
     */
    async finalize() {
        const response = await fetch('/api/data-maid/finalize', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ token: this.token }),
        });

        if (!response.ok) {
            throw new Error(`Error finalizing Data Maid: ${response.statusText}`);
        }
    }

    /**
     * Sets up the dialog UI elements and event listeners.
     * Cache DOM lookups to avoid polymorphic queries on the hot path.
     * @private
     */
    async setupDialogUI() {
        const template = await renderTemplateAsync('dataMaidDialog');
        this.container = document.createElement('div');
        this.container.classList.add('dataMaidDialogContainer');
        this.container.innerHTML = template;

        this.spinner = this.container.querySelector('.dataMaidSpinner');
        this.placeholder = this.container.querySelector('.dataMaidPlaceholder');
        this.resultsList = this.container.querySelector('.dataMaidResultsList');

        const startButton = this.container.querySelector('.dataMaidStartButton');
        startButton?.addEventListener('click', () => this.handleScanClick());
    }

    /**
     * Handles the scan button click event.
     * @private
     */
    async handleScanClick() {
        if (this.isScanning) {
            notyf.warning(t`The scan is already running. Please wait for it to finish.`);
            return;
        }

        try {
            if (this.resultsList) this.resultsList.innerHTML = '';

            this.showSpinner();
            this.isScanning = true;

            const report = await this.getReport();

            this.hideSpinner();
            await this.renderReport(report, this.resultsList);
            this.token = report.token;
        } catch (error) {
            this.hideSpinner();
            notyf.error(t`An error has occurred. Check the console for details.`);
            console.error('Error generating Data Maid report:', error);
        } finally {
            this.isScanning = false;
        }
    }

    /**
     * Shows the loading spinner and hides the placeholder.
     * @private
     */
    showSpinner() {
        this.placeholder?.classList.add('displayNone');
        this.spinner?.classList.remove('displayNone');
    }

    /**
     * Hides the loading spinner.
     * @private
     */
    hideSpinner() {
        this.spinner?.classList.add('displayNone');
    }

    /**
     * Renders the Data Maid report into the results list.
     * @param {DataMaidReportResult} report
     * @param {Element | null} resultsList
     * @private
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'report' implicitly has an 'any' type.
    async renderReport(report, resultsList) {
        if (!resultsList) return;

        for (const [prop, data] of Object.entries(this.DATA_MAID_CATEGORIES)) {
            const category = await this.renderCategory(
                prop,
                // @ts-expect-error TS(18046) FIXME: 'data' is of type 'unknown'.
                data.name,
                // @ts-expect-error TS(18046) FIXME: 'data' is of type 'unknown'.
                data.description,
                (report as any).report[prop],
            );

            if (category) {
                resultsList.appendChild(category);
            }
        }
        this.displayEmptyPlaceholder();
    }

    /**
     * Displays a placeholder message if no items are found in the results list.
     * @private
     */
    displayEmptyPlaceholder() {
        if (this.resultsList && this.resultsList.children.length === 0 && this.placeholder) {
            this.placeholder.classList.remove('displayNone');
            this.placeholder.textContent = t`No items found to clean up. Come back later!`;
        }
    }

    /**
     * Renders a single Data Maid category into a DOM element.
     * @param {string} prop Property name for the category
     * @param {string} name Name of the category
     * @param {string} description Description of the category
     * @param {import('../../src/endpoints/data-maid.js').DataMaidSanitizedRecord[]} items List of items in the category
     * @returns {Promise<Element|null>} A promise that resolves to a DOM element containing the rendered category
     * @private
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'prop' implicitly has an 'any' type.
    async renderCategory(prop, name, description, items) {
        if (!Array.isArray(items) || items.length === 0) {
            return null;
        }

        let totalSize = 0;
        const viewModelItems = [];

        // Single pass map/reduce is better for V8's optimizer
        const sortedItems = items.toSorted((a, b) => b.mtime - a.mtime);

        for (let i = 0; i < sortedItems.length; i++) {
            const item = sortedItems[i];
            totalSize += item.size;
            viewModelItems.push({
                ...item,
                size: humanFileSize(item.size),
                date: timestampToMoment(item.mtime).format('L LT'),
            });
        }

        const viewModel = {
            name: name,
            description: description,
            totalSize: humanFileSize(totalSize),
            totalItems: items.length,
            items: viewModelItems,
        };

        const template = await renderTemplateAsync('dataMaidCategory', viewModel);
        const categoryElement = document.createElement('div');
        categoryElement.innerHTML = template;

        // V8 Event Delegation: One listener replaces hundreds of function closures
        categoryElement.addEventListener('click', async (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;

            // Handle "Delete All" for category
            if (target.closest('.dataMaidDeleteAll')) {
                event.stopPropagation();
                const confirm = await Popup.show.confirm(
                    t`Are you sure?`,
                    t`This will permanently delete all files in this category. THIS CANNOT BE UNDONE!`,
                );
                if (!confirm) return;

                const hashes = [];
                for (let i = 0; i < items.length; i++) {
                    if (items[i].hash) hashes.push(items[i].hash);
                }

                await this.delete(hashes);
                categoryElement.remove();
                this.displayEmptyPlaceholder();
                return;
            }

            // Handle per-item interactions
            const itemEl = target.closest('.dataMaidItem');
            if (!itemEl) return;

            const hash = itemEl.getAttribute('data-hash');
            if (!hash) return;

            if (target.closest('.dataMaidItemView')) {
                const itemName = items.find((i) => i.hash === hash)?.name;
                await this.view(prop, hash, itemName);
            } else if (target.closest('.dataMaidItemDownload')) {
                await this.download(items, hash);
            } else if (target.closest('.dataMaidItemDelete')) {
                const confirm = await Popup.show.confirm(
                    t`Are you sure?`,
                    t`This will permanently delete the file. THIS CANNOT BE UNDONE!`,
                );
                if (!confirm) return;

                if (await this.delete([hash])) {
                    itemEl.remove();
                    const idx = items.findIndex((i) => i.hash === hash);
                    if (idx !== -1) items.splice(idx, 1);

                    if (items.length === 0) {
                        categoryElement.remove();
                        this.displayEmptyPlaceholder();
                    }
                }
            }
        });

        return categoryElement;
    }

    /**
     * Constructs the URL for viewing an item by its hash.
     * @param {string} hash Hash of the item to view
     * @returns {string} URL to view the item
     * @private
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'hash' implicitly has an 'any' type.
    getViewUrl(hash) {
        return `/api/data-maid/view?hash=${encodeURIComponent(hash)}&token=${encodeURIComponent(this.token || '')}`;
    }

    /**
     * Downloads an item by its hash.
     * @param {import('../../src/endpoints/data-maid.js').DataMaidSanitizedRecord[]} items List of items in the category
     * @param {string} hash Hash of the item to download
     * @private
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'items' implicitly has an 'any' type.
    async download(items, hash) {
        const item = items.find((i: any) => i.hash === hash);
        if (!item) return;

        const url = this.getViewUrl(hash);
        const a = document.createElement('a');
        a.href = url;
        a.download = item.name || hash;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    /**
     * Opens the item view for a specific hash.
     * @param {string} prop Property name for the category
     * @param {string} hash Item hash to view
     * @param {string} name Name of the item to view
     * @private
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'prop' implicitly has an 'any' type.
    async view(prop, hash, name) {
        const url = this.getViewUrl(hash);
        const isImage =
            prop === 'images' || prop === 'avatarThumbnails' || prop === 'backgroundThumbnails';

        const element = isImage
            ? await this.getViewElement(url, name)
            : await this.getTextViewElement(url);

        await callGenericPopup(element, POPUP_TYPE.DISPLAY, '', { large: true, wide: true });
    }

    /**
     * Deletes an item by its file path hash.
     * @param {string[]} hashes Hashes of items to delete
     * @returns {Promise<boolean>} True if the deletion was successful, false otherwise
     * @private
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'hashes' implicitly has an 'any' type.
    async delete(hashes) {
        try {
            const response = await fetch('/api/data-maid/delete', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ hashes: hashes, token: this.token }),
            });

            if (!response.ok) {
                throw new Error(`Error deleting item: ${response.statusText}`);
            }

            return true;
        } catch (error) {
            console.error('Error deleting item:', error);
            return false;
        }
    }

    /**
     * Gets a media element for viewing images or videos.
     * @param {string} url View URL
     * @param {string} name Name of the file
     * @returns {Promise<HTMLElement>} Image element
     * @private
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'url' implicitly has an 'any' type.
    async getViewElement(url, name) {
        // Fast extension extraction (avoids Array heap allocation via string splitting)
        const extIndex = name.lastIndexOf('.');
        const extension = extIndex !== -1 ? name.slice(extIndex + 1) : name;

        const isVideo = VIDEO_EXTENSIONS.includes(extension);
        const mediaElement = document.createElement(isVideo ? 'video' : 'img');

        if (mediaElement instanceof HTMLVideoElement) {
            mediaElement.controls = true;
        }

        mediaElement.src = url;
        mediaElement.classList.add('dataMaidImageView');
        return mediaElement;
    }

    /**
     * Gets an iframe element for viewing text content.
     * @param {string} url View URL
     * @returns {Promise<HTMLTextAreaElement>} Frame element
     * @private
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'url' implicitly has an 'any' type.
    async getTextViewElement(url) {
        const response = await fetch(url);
        const text = await response.text();
        const element = document.createElement('textarea');

        element.classList.add('dataMaidTextView');
        element.readOnly = true;
        element.textContent = text;

        return element;
    }

    /**
     * Opens the Data Maid dialog and handles the interaction.
     */
    async open() {
        await this.setupDialogUI();
        await callGenericPopup(this.container, POPUP_TYPE.TEXT, '', { wide: true, large: true });

        if (this.token) {
            await this.finalize();
        }
    }
}

/**
 *
 */
export function initDataMaid() {
    const dataMaidButton = document.getElementById('data_maid_button');
    if (!dataMaidButton) {
        console.warn('Data Maid button not found');
        return;
    }

    dataMaidButton.addEventListener('click', () => new DataMaidDialog().open());
}
