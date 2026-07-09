import { t } from './i18n.js';
import { callGenericPopup, Popup, POPUP_TYPE } from './popup.js';
import { getFileExtension, sortMoments, timestampToMoment } from './utils.js';
// @ts-expect-error TS(2792) FIXME: Cannot find module '/script.js'. Did you mean to s... Remove this comment to see the full error message
import { displayPastChats, getRequestHeaders, importCharacterChat } from '/script.js';
import { importGroupChat } from './group-chats.js';

class BackupsBrowser {
    /** @type {HTMLElement} */
    // @ts-expect-error TS(7008) FIXME: Member '#buttonElement' implicitly has an 'any' ty... Remove this comment to see the full error message
    #buttonElement;
    /** @type {HTMLElement} */
    // @ts-expect-error TS(7008) FIXME: Member '#buttonChevronIcon' implicitly has an 'any... Remove this comment to see the full error message
    #buttonChevronIcon;
    /** @type {HTMLElement} */
    // @ts-expect-error TS(7008) FIXME: Member '#backupsListElement' implicitly has an 'an... Remove this comment to see the full error message
    #backupsListElement;
    /** @type {AbortController} */
    // @ts-expect-error TS(7008) FIXME: Member '#loadingAbortController' implicitly has an... Remove this comment to see the full error message
    #loadingAbortController;
    /** @type {boolean} */
    #isOpen = false;

    get isOpen() {
        return this.#isOpen;
    }

    /**
     * View a backup file content.
     * @param {string} name File name of the backup to view.
     * @returns {Promise<void>}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
    async viewBackup(name) {
        const response = await fetch('/api/backups/chat/download', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name: name }),
        });

        if (!response.ok) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(t`Failed to download backup, try again later.`);
            console.error('Failed to download chat backup:', response.statusText);
            return;
        }

        try {
            /** @type {ChatMessage[]} */
            // @ts-expect-error TS(7034) FIXME: Variable 'parsedLines' implicitly has type 'any[]'... Remove this comment to see the full error message
            const parsedLines = [];
            const fileText = await response.text();
            fileText.split('\n').forEach(line => {
                try {
                    /** @type {ChatMessage} */
                    const lineData = JSON.parse(line);
                    if (lineData?.mes) {
                        parsedLines.push(lineData);
                    }
                } catch (error) {
                    console.error('Failed to parse chat backup line:', error);
                }
            });
            const textArea = document.createElement('textarea');
            textArea.classList.add('text_pole', 'monospace', 'textarea_compact', 'margin0', 'height100p');
            textArea.readOnly = true;
            // @ts-expect-error TS(7005) FIXME: Variable 'parsedLines' implicitly has an 'any[]' t... Remove this comment to see the full error message
            textArea.value = parsedLines.map(l => `${l.name} [${timestampToMoment(l.send_date).format('lll')}]\n${l.mes}`).join('\n\n\n');
            await callGenericPopup(textArea, POPUP_TYPE.TEXT, '', { allowVerticalScrolling: true, large: true, wide: true });
        } catch (error) {
            console.error('Failed to parse chat backup content:', error);
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(t`Failed to parse backup content.`);
            return;
        }
    }

    /**
     * Restore a backup by importing it.
     * @param {string} name File name of the backup to restore.
     * @returns {Promise<void>}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
    async restoreBackup(name) {
        const response = await fetch('/api/backups/chat/download', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name: name }),
        });

        if (!response.ok) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(t`Failed to download backup, try again later.`);
            console.error('Failed to download chat backup:', response.statusText);
            return;
        }

        const blob = await response.blob();
        const file = new File([blob], name, { type: 'application/octet-stream' });

        const extension = getFileExtension(file);

        if (extension !== 'jsonl') {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.warning(t`Only .jsonl files are supported for chat imports.`);
            return;
        }

        const context = SillyTavern.getContext();

        const formData = new FormData();
        formData.set('file_type', extension);
        formData.set('avatar', file);
        // @ts-expect-error TS(2339) FIXME: Property 'characters' does not exist on type '() =... Remove this comment to see the full error message
        formData.set('avatar_url', context.characters[context.characterId]?.avatar || '');
        // @ts-expect-error TS(2339) FIXME: Property 'name1' does not exist on type '() => { a... Remove this comment to see the full error message
        formData.set('user_name', context.name1);
        // @ts-expect-error TS(2339) FIXME: Property 'name2' does not exist on type '() => { a... Remove this comment to see the full error message
        formData.set('character_name', context.name2);

        // @ts-expect-error TS(2339) FIXME: Property 'groupId' does not exist on type '() => {... Remove this comment to see the full error message
        const importFn = context.groupId ? importGroupChat : importCharacterChat;
        const result = await importFn(formData, { refresh: false });

        if (result.length === 0) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(t`Failed to import chat backup, try again later.`);
            return;
        }

        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success(`Chat imported: ${result.join(', ')}`);
        await displayPastChats(result);
    }

    /**
     * Delete a backup file.
     * @param {string} name File name of the backup to delete.
     * @returns {Promise<boolean>} True if deleted, false otherwise.
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
    async deleteBackup(name) {
        // @ts-expect-error TS(2554) FIXME: Expected 2-3 arguments, but got 1.
        const confirm = await Popup.show.confirm(t`Are you sure?`);
        if (!confirm) {
            return false;
        }

        const response = await fetch('/api/backups/chat/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name: name }),
        });

        if (!response.ok) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(t`Failed to delete backup, try again later.`);
            console.error('Failed to delete chat backup:', response.statusText);
            return false;
        }

        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success(t`Backup deleted successfully.`);
        return true;
    }

    /**
     * Load backups and populate the list element.
     * @param {AbortSignal} signal Signal to abort loading.
     * @returns {Promise<void>}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'signal' implicitly has an 'any' type.
    async loadBackupsIntoList(signal) {
        if (!this.#backupsListElement) {
            return;
        }

        this.#backupsListElement.innerHTML = '';

        const response = await fetch('/api/backups/chat/get', {
            method: 'POST',
            headers: getRequestHeaders(),
            signal,
        });

        if (!response.ok) {
            console.error('Failed to load chat backups list:', response.statusText);
            return;
        }

        /** @type {import('../../src/endpoints/chats.js').ChatInfo[]} */
        const backupsList = await response.json();

        // @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
        for (const backup of backupsList.sort((a, b) => sortMoments(timestampToMoment(a.last_mes), timestampToMoment(b.last_mes)))) {
            const listItem = document.createElement('div');
            listItem.classList.add('chatBackupsListItem');

            const backupName = document.createElement('div');
            backupName.textContent = backup.file_name;
            backupName.classList.add('chatBackupsListItemName');

            const backupInfo = document.createElement('div');
            backupInfo.classList.add('chatBackupsListItemInfo');
            backupInfo.textContent = `${timestampToMoment(backup.last_mes).format('lll')} (${backup.file_size}, ${backup.chat_items} 💬)`;

            const actionsList = document.createElement('div');
            actionsList.classList.add('chatBackupsListItemActions');

            const viewButton = document.createElement('div');
            viewButton.classList.add('right_menu_button', 'fa-solid', 'fa-eye');
            viewButton.title = t`View backup`;
            viewButton.addEventListener('click', async () => {
                await this.viewBackup(backup.file_name);
            });

            const restoreButton = document.createElement('div');
            restoreButton.classList.add('right_menu_button', 'fa-solid', 'fa-rotate-left');
            restoreButton.title = t`Restore backup`;
            restoreButton.addEventListener('click', async () => {
                await this.restoreBackup(backup.file_name);
            });

            const deleteButton = document.createElement('div');
            deleteButton.classList.add('right_menu_button', 'fa-solid', 'fa-trash');
            deleteButton.title = t`Delete backup`;
            deleteButton.addEventListener('click', async () => {
                const isDeleted = await this.deleteBackup(backup.file_name);
                if (isDeleted) {
                    listItem.remove();
                }
            });

            actionsList.appendChild(viewButton);
            actionsList.appendChild(restoreButton);
            actionsList.appendChild(deleteButton);

            listItem.appendChild(backupName);
            listItem.appendChild(backupInfo);
            listItem.appendChild(actionsList);

            this.#backupsListElement.appendChild(listItem);
        }
    }

    closeBackups() {
        if (!this.#isOpen) {
            return;
        }

        this.#isOpen = false;
        if (this.#buttonChevronIcon) {
            this.#buttonChevronIcon.classList.remove('fa-chevron-up');
            this.#buttonChevronIcon.classList.add('fa-chevron-down');
        }
        if (this.#backupsListElement) {
            this.#backupsListElement.classList.remove('open');
            this.#backupsListElement.innerHTML = '';
        }
        if (this.#loadingAbortController) {
            this.#loadingAbortController.abort();
            this.#loadingAbortController = null;
        }
    }

    openBackups() {
        if (this.#isOpen) {
            return;
        }

        this.#isOpen = true;
        if (this.#buttonChevronIcon) {
            this.#buttonChevronIcon.classList.remove('fa-chevron-down');
            this.#buttonChevronIcon.classList.add('fa-chevron-up');
        }
        if (this.#backupsListElement) {
            this.#backupsListElement.classList.add('open');
        }
        if (this.#loadingAbortController) {
            this.#loadingAbortController.abort();
            this.#loadingAbortController = null;
        }

        this.#loadingAbortController = new AbortController();
        this.loadBackupsIntoList(this.#loadingAbortController.signal);
    }

    renderButton() {
        if (this.#buttonElement) {
            return;
        }

        const sibling = document.getElementById('select_chat_search');
        if (!sibling) {
            console.error('Could not find sibling element for BackupsBrowser button');
            return;
        }

        const button = document.createElement('button');
        button.classList.add('menu_button', 'menu_button_icon');

        const buttonIcon = document.createElement('i');
        buttonIcon.classList.add('fa-solid', 'fa-box-open');

        const buttonText = document.createElement('span');
        buttonText.textContent = t`Backups`;
        buttonText.title = t`Browse chat backups`;

        const chevronIcon = document.createElement('i');
        chevronIcon.classList.add('fa-solid', 'fa-chevron-down', 'fa-sm');

        button.appendChild(buttonIcon);
        button.appendChild(buttonText);
        button.appendChild(chevronIcon);

        button.addEventListener('click', () => {
            if (this.#isOpen) {
                this.closeBackups();
            } else {
                this.openBackups();
            }
        });

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        sibling.parentNode.insertBefore(button, sibling);

        this.#buttonElement = button;
        this.#buttonChevronIcon = chevronIcon;
    }

    renderBackupsList() {
        if (this.#backupsListElement) {
            return;
        }

        const sibling = document.getElementById('select_chat_div');
        if (!sibling) {
            console.error('Could not find sibling element for BackupsBrowser list');
            return;
        }

        const list = document.createElement('div');
        list.classList.add('chatBackupsList');

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        sibling.parentNode.insertBefore(list, sibling);
        this.#backupsListElement = list;
    }
}

const backupsBrowser = new BackupsBrowser();

/**
 *
 */
export function addChatBackupsBrowser() {
    backupsBrowser.renderButton();
    backupsBrowser.renderBackupsList();

    // Refresh the backups list if it's already open
    if (backupsBrowser.isOpen) {
        backupsBrowser.closeBackups();
        backupsBrowser.openBackups();
    }
}
