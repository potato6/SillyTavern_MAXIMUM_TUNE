/**
 * Attachment Manager dialog.
 *
 * This module owns the full "Data Bank" attachment management UI:
 * listing attachments per source, sorting, filtering, bulk actions,
 * drag-and-drop upload, and scrapers.
 */

import { humanFileSize } from '../utils.js';
import { chat_metadata, characters, this_chid, getCurrentChatId } from '../../script.js';
import { selected_group } from '../group-chats.js';
import { extension_settings } from '../extensions.js';
import { POPUP_RESULT, POPUP_TYPE, callGenericPopup } from '../popup.js';

import { loadTemplate } from './shared.js';
import { accountStorage } from '../util/AccountStorage.js';
import { ScraperManager } from '../scrapers.js';
import { DragAndDropHandler } from '../dragdrop.js';
import { ATTACHMENT_SOURCE, type FileAttachment } from './types.js';
import {
    openFilePopup,
    editAttachment,
    downloadAttachment,
    enableAttachment,
    disableAttachment,
    isAttachmentDisabled,
    moveAttachment,
    deleteAttachment,
    uploadFileAttachmentToServer,
    getDataBankAttachments,
    verifyAttachments,
    getAvailableTargets,
    runScraper,
} from './attachment-store.js';

/**
 * Opens the attachment manager dialog.
 */
export async function openAttachmentManager(): Promise<void> {
    /**
     * Renders a list of attachments for a given source.
     * @param attachments
     * @param source
     */
    async function renderList(attachments: FileAttachment[], source: string): Promise<void> {
        /**
         *
         * @param a
         * @param b
         */
        function sortFn(a: FileAttachment, b: FileAttachment): number {
            const sortValueA = (a as unknown as Record<string, unknown>)[sortField];
            const sortValueB = (b as unknown as Record<string, unknown>)[sortField];
            if (typeof sortValueA === 'string' && typeof sortValueB === 'string') {
                return sortValueA.localeCompare(sortValueB) * (sortOrder === 'asc' ? 1 : -1);
            }
            return (Number(sortValueA) - Number(sortValueB)) * (sortOrder === 'asc' ? 1 : -1);
        }

        /**
         *
         * @param a
         */
        function filterFn(a: FileAttachment): boolean {
            if (!filterString) return true;
            return a.name.toLowerCase().includes(filterString.toLowerCase());
        }

        const sources: Record<string, string> = {
            [ATTACHMENT_SOURCE.GLOBAL]: '.globalAttachmentsList',
            [ATTACHMENT_SOURCE.CHARACTER]: '.characterAttachmentsList',
            [ATTACHMENT_SOURCE.CHAT]: '.chatAttachmentsList',
        };

        const containerEl = (template as HTMLElement).querySelector(sources[source]!);
        const selected = Array.from(containerEl?.querySelectorAll('.attachmentListItemCheckbox:checked') ?? [])
            .map(el => (el as Element).closest('.attachmentListItem')?.getAttribute('data-attachment-url'));

        const sourceContainer = (template as HTMLElement).querySelector(sources[source]!);
        if (sourceContainer) sourceContainer.innerHTML = '';

        const sortedAttachmentList = attachments.slice().filter(filterFn).sort(sortFn);

        for (const attachment of sortedAttachmentList) {
            const disabled = isAttachmentDisabled(attachment);
            const attachmentTemplate = (template!.querySelector('.attachmentListItemTemplate .attachmentListItem') as Element)?.cloneNode(true) as HTMLElement;
            if (!attachmentTemplate) continue;

            attachmentTemplate.classList.toggle('disabled', disabled);
            attachmentTemplate.setAttribute('data-attachment-url', attachment.url);
            attachmentTemplate.setAttribute('data-attachment-source', source);

            const fileIcon = attachmentTemplate.querySelector('.attachmentFileIcon');
            if (fileIcon) fileIcon.setAttribute('title', attachment.url);

            const listItemName = attachmentTemplate.querySelector('.attachmentListItemName');
            if (listItemName) listItemName.textContent = attachment.name;

            const sizeEl = attachmentTemplate.querySelector('.attachmentListItemSize');
            if (sizeEl) sizeEl.textContent = humanFileSize(attachment.size);

            const createdEl = attachmentTemplate.querySelector('.attachmentListItemCreated');
            if (createdEl) createdEl.textContent = new Date(attachment.created).toLocaleString();

            attachmentTemplate.querySelector('.viewAttachmentButton')?.addEventListener('click', () => openFilePopup(attachment));
            attachmentTemplate.querySelector('.editAttachmentButton')?.addEventListener('click', () => editAttachment(attachment, source, renderAttachments));
            attachmentTemplate.querySelector('.deleteAttachmentButton')?.addEventListener('click', () => deleteAttachment(attachment, source, renderAttachments));
            attachmentTemplate.querySelector('.downloadAttachmentButton')?.addEventListener('click', () => downloadAttachment(attachment));
            attachmentTemplate.querySelector('.moveAttachmentButton')?.addEventListener('click', () => moveAttachment(attachment, source, renderAttachments));

            const enableBtn = attachmentTemplate.querySelector('.enableAttachmentButton') as HTMLElement;
            if (enableBtn) {
                enableBtn.style.display = disabled ? '' : 'none';
                enableBtn.addEventListener('click', () => enableAttachment(attachment, renderAttachments));
            }

            const disableBtn = attachmentTemplate.querySelector('.disableAttachmentButton') as HTMLElement;
            if (disableBtn) {
                disableBtn.style.display = !disabled ? '' : 'none';
                disableBtn.addEventListener('click', () => disableAttachment(attachment, renderAttachments));
            }

            const sourceCont = (template as HTMLElement).querySelector(sources[source]!);
            if (sourceCont) sourceCont.appendChild(attachmentTemplate);

            if (selected.includes(attachment.url)) {
                const checkbox = attachmentTemplate.querySelector('.attachmentListItemCheckbox') as HTMLInputElement;
                if (checkbox) checkbox.checked = true;
            }
        }
    }

    /**
     * Renders buttons for the attachment manager (scrapers).
     */
    async function renderButtons(): Promise<() => void> {
        const sources: Record<string, string> = {
            [ATTACHMENT_SOURCE.GLOBAL]: '.globalAttachmentsTitle',
            [ATTACHMENT_SOURCE.CHARACTER]: '.characterAttachmentsTitle',
            [ATTACHMENT_SOURCE.CHAT]: '.chatAttachmentsTitle',
        };

        const modal = template!.querySelector('.actionButtonsModal');
        const scrapers = ScraperManager.getDataBankScrapers();

        for (const scraper of scrapers) {
            const isAvailable = await ScraperManager.isScraperAvailable(scraper.id);
            if (!isAvailable) continue;

            const buttonTemplate = (template!.querySelector('.actionButtonTemplate .actionButton') as Element)?.cloneNode(true) as HTMLElement;
            if (!buttonTemplate) continue;

            if (scraper.iconAvailable) {
                buttonTemplate.querySelector('.actionButtonIcon')?.classList.add(...scraper.iconClass.split(' '));
                buttonTemplate.querySelector('.actionButtonImg')?.remove();
            } else {
                buttonTemplate.querySelector('.actionButtonImg')?.setAttribute('src', scraper.iconClass);
                buttonTemplate.querySelector('.actionButtonIcon')?.remove();
            }

            const textEl = buttonTemplate.querySelector('.actionButtonText');
            if (textEl) textEl.textContent = scraper.name;

            buttonTemplate.setAttribute('title', scraper.description);
            buttonTemplate.addEventListener('click', () => {
                const target = modal?.getAttribute('data-attachment-manager-target') ?? null;
                runScraper(scraper.id, target, renderAttachments);
            });
            modal?.append(buttonTemplate);
        }

        Object.entries(sources).forEach(([source, selector]) => {
            const button = template?.querySelector(`${selector} .openActionModalButton`);
            if (!button) return;

            button.addEventListener('pointerdown', (e) => e.stopPropagation());
            button.addEventListener('mousedown', (e) => e.stopPropagation());
            button.addEventListener('click', () => {
                modal?.setAttribute('data-attachment-manager-target', source);
                (button as HTMLElement).style.setProperty('anchor-name', '--action-btn');
                (modal as HTMLElement)?.togglePopover();
            });
        });

        return () => { modal?.remove(); };
    }

    /**
     * Renders all attachments across all sources.
     */
    async function renderAttachments(): Promise<void> {
        const globalAttachments: FileAttachment[] = (extension_settings.attachments ?? []) as FileAttachment[];
        const chatAttachments: FileAttachment[] = (chat_metadata.attachments ?? []) as FileAttachment[];
        const characterAttachments: FileAttachment[] = ((extension_settings.character_attachments as Record<string, FileAttachment[]> | undefined)?.[characters[this_chid]?.avatar] ?? []) as FileAttachment[];

        await renderList(globalAttachments, ATTACHMENT_SOURCE.GLOBAL);
        await renderList(chatAttachments, ATTACHMENT_SOURCE.CHAT);
        await renderList(characterAttachments, ATTACHMENT_SOURCE.CHARACTER);

        const isNotCharacter = this_chid === undefined || selected_group;
        const isNotInChat = getCurrentChatId() === undefined;

        const charBlock = template!.querySelector('.characterAttachmentsBlock') as HTMLElement;
        if (charBlock) charBlock.style.display = isNotCharacter ? 'none' : '';

        const chatBlock = template!.querySelector('.chatAttachmentsBlock') as HTMLElement;
        if (chatBlock) chatBlock.style.display = isNotInChat ? 'none' : '';

        const characterName = characters[this_chid]?.name || 'Anonymous';
        const charNameEl = template!.querySelector('.characterAttachmentsName');
        if (charNameEl) charNameEl.textContent = characterName;

        const chatName = getCurrentChatId() || 'Unnamed chat';
        const chatNameEl = template!.querySelector('.chatAttachmentsName');
        if (chatNameEl) chatNameEl.textContent = chatName;
    }

    // ── Setup ──────────────────────────────────────────────────

    const dragDropHandler = new DragAndDropHandler('.popup', async (files: File[], event: DragEvent) => {
        let selectedTarget = ATTACHMENT_SOURCE.GLOBAL;
        const targets = getAvailableTargets();

        const targetSelectTemplate = await loadTemplate('files-dropped', 'attachments', { count: files.length, targets: targets.join(',') });
        if (!targetSelectTemplate) return;

        const targetInput = targetSelectTemplate.querySelector('.droppedFilesTarget');
        if (targetInput instanceof HTMLInputElement) {
            targetInput.addEventListener('input', function () {
                selectedTarget = String(this.value) as typeof selectedTarget;
            });
        }

        const result = await callGenericPopup(targetSelectTemplate, POPUP_TYPE.CONFIRM, '', { wide: false, large: false, okButton: 'Upload', cancelButton: 'Cancel' });
        if (result !== POPUP_RESULT.AFFIRMATIVE) return;

        for (const file of files) {
            await uploadFileAttachmentToServer(file, selectedTarget);
        }
        renderAttachments();
    });

    let sortField = accountStorage.getItem('DataBank_sortField') || 'created';
    let sortOrder = accountStorage.getItem('DataBank_sortOrder') || 'desc';
    let filterString = '';

    const template = await loadTemplate('manager', 'attachments');
    if (!template) return;

    // Search
    template.querySelector('.attachmentSearch')?.addEventListener('input', function (this: HTMLInputElement) {
        if (this instanceof HTMLInputElement) {
            filterString = String(this.value);
        }
        renderAttachments();
    });

    // Sort
    template.querySelector('.attachmentSort')?.addEventListener('change', function (this: HTMLSelectElement) {
        if (!(this instanceof HTMLSelectElement) || this.selectedOptions.length === 0) return;
        sortField = this.selectedOptions[0]!.dataset.sortField ?? 'created';
        sortOrder = this.selectedOptions[0]!.dataset.sortOrder ?? 'desc';
        accountStorage.setItem('DataBank_sortField', sortField);
        accountStorage.setItem('DataBank_sortOrder', sortOrder);
        renderAttachments();
    });

    // Bulk actions
    /**
     *
     * @param action
     * @param action.confirmMessage
     * @param action.perform
     */
    function handleBulkAction(action: { confirmMessage?: string; perform: (attachment: FileAttachment, source: string) => void }) {
        return async () => {
            const selectedAttachments = document.querySelectorAll('.attachmentListItemCheckboxContainer .attachmentListItemCheckbox:checked');
            if (selectedAttachments.length === 0) {
                console.info('No attachments selected.');
                return;
            }

            if (action.confirmMessage) {
                const confirm = await callGenericPopup(action.confirmMessage, POPUP_TYPE.CONFIRM);
                if (confirm !== POPUP_RESULT.AFFIRMATIVE) return;
            }

            const includeDisabled = true;
            const attachments = getDataBankAttachments(includeDisabled);

            selectedAttachments.forEach(async (checkbox) => {
                const listItem = (checkbox as Element).closest('.attachmentListItem') as HTMLElement;
                if (!listItem) return;

                const url = listItem.dataset.attachmentUrl;
                const source = listItem.dataset.attachmentSource ?? '';
                const attachment = attachments.find((a: FileAttachment) => a.url === url);
                if (!attachment) return;

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
        perform: (attachment: FileAttachment) => disableAttachment(attachment, () => { }),
    }));

    template.querySelector('.bulkActionEnable')?.addEventListener('click', handleBulkAction({
        perform: (attachment: FileAttachment) => enableAttachment(attachment, () => { }),
    }));

    template.querySelector('.bulkActionDelete')?.addEventListener('click', handleBulkAction({
        confirmMessage: 'Are you sure you want to delete the selected attachments?',
        perform: async (attachment: FileAttachment, source: string) => await deleteAttachment(attachment, source, () => { }, false),
    }));

    template.querySelector('.bulkActionSelectAll')?.addEventListener('click', () => {
        [...document.querySelectorAll('.attachmentListItemCheckbox')]
            .filter(c => (c as HTMLElement).offsetParent !== null)
            .forEach(checkbox => {
                if (checkbox instanceof HTMLInputElement) checkbox.checked = true;
            });
    });

    template.querySelector('.bulkActionSelectNone')?.addEventListener('click', () => {
        [...document.querySelectorAll('.attachmentListItemCheckbox')]
            .filter(c => (c as HTMLElement).offsetParent !== null)
            .forEach(checkbox => {
                if (checkbox instanceof HTMLInputElement) checkbox.checked = false;
            });
    });

    // ── Show ───────────────────────────────────────────────────

    const cleanupFn = await renderButtons();
    await verifyAttachments();
    await renderAttachments();
    await callGenericPopup(template, POPUP_TYPE.TEXT, '', { wide: true, large: true, okButton: 'Close', allowVerticalScrolling: true });

    cleanupFn();
    dragDropHandler.destroy();
}
