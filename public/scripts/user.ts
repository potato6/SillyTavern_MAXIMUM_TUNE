import { getRequestHeaders } from '../script.js';
import { POPUP_RESULT, POPUP_TYPE, callGenericPopup } from './popup.js';
import { canViewSecrets } from './secrets.js';
import { renderTemplateAsync } from './templates.js';
import { ensureImageFormatSupported, getBase64Async, humanFileSize } from './utils.js';

interface UserViewModel {
    handle: string;
    name: string;
    avatar: string;
    admin?: boolean;
    password: boolean;
    enabled?: boolean;
    created?: number;
}

export let currentUser: UserViewModel | null = null;
export let accountsEnabled = false;

// Extend the session every 10 minutes
const SESSION_EXTEND_INTERVAL = 10 * 60 * 1000;

/**
 * Enable or disable user account controls in the UI.
 * @param {boolean} isEnabled User account controls enabled
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'isEnabled' implicitly has an 'any' type... Remove this comment to see the full error message
export async function setUserControls(isEnabled) {
    accountsEnabled = isEnabled;

    if (!isEnabled) {
        const logoutBtn = document.getElementById('logout_button');
        if (logoutBtn) logoutBtn.style.display = 'none';
        const adminBtn = document.getElementById('admin_button');
        if (adminBtn) adminBtn.style.display = 'none';
        return;
    }

    const logoutBtn = document.getElementById('logout_button');
    if (logoutBtn) logoutBtn.style.display = '';
    await getCurrentUser();
}

/**
 * Check if the current user is an admin.
 * @returns {boolean} True if the current user is an admin
 */
export function isAdmin() {
    if (!accountsEnabled) {
        return true;
    }

    if (!currentUser) {
        return false;
    }

    return Boolean(currentUser.admin);
}

/**
 * Gets the handle string of the current user.
 * @returns {string} User handle
 */
export function getCurrentUserHandle() {
    return currentUser?.handle || 'default-user';
}

/**
 * Get the current user.
 * @returns {Promise<void>}
 */
async function getCurrentUser() {
    try {
        const response = await fetch('/api/users/me', {
            headers: getRequestHeaders(),
        });

        if (!response.ok) {
            throw new Error('Failed to get current user');
        }

        currentUser = await response.json();
        const adminBtn = document.getElementById('admin_button');
        if (adminBtn) adminBtn.style.display = (accountsEnabled && isAdmin()) ? '' : 'none';
    } catch (error) {
        console.error('Error getting current user:', error);
    }
}

/**
 * Get a list of all users.
 * @returns {Promise<import('../../src/users.js').UserViewModel[]>} Users
 */
async function getUsers() {
    try {
        const response = await fetch('/api/users/get', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (!response.ok) {
            throw new Error('Failed to get users');
        }

        return response.json();
    } catch (error) {
        console.error('Error getting users:', error);
    }
}

/**
 * Enable a user account.
 * @param {string} handle User handle
 * @param {function} callback Success callback
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'handle' implicitly has an 'any' type.
async function enableUser(handle, callback) {
    try {
        const response = await fetch('/api/users/enable', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle }),
        });

        if (!response.ok) {
            const data = await response.json();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(data.error || 'Unknown error', 'Failed to enable user');
            throw new Error('Failed to enable user');
        }

        callback();
    } catch (error) {
        console.error('Error enabling user:', error);
    }
}

/**
 *
 * @param handle
 * @param callback
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'handle' implicitly has an 'any' type.
async function disableUser(handle, callback) {
    try {
        const response = await fetch('/api/users/disable', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle }),
        });

        if (!response.ok) {
            const data = await response.json();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(data?.error || 'Unknown error', 'Failed to disable user');
            throw new Error('Failed to disable user');
        }

        callback();
    } catch (error) {
        console.error('Error disabling user:', error);
    }
}

/**
 * Promote a user to admin.
 * @param {string} handle User handle
 * @param {function} callback Success callback
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'handle' implicitly has an 'any' type.
async function promoteUser(handle, callback) {
    try {
        const response = await fetch('/api/users/promote', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle }),
        });

        if (!response.ok) {
            const data = await response.json();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(data.error || 'Unknown error', 'Failed to promote user');
            throw new Error('Failed to promote user');
        }

        callback();
    } catch (error) {
        console.error('Error promoting user:', error);
    }
}

/**
 * Demote a user from admin.
 * @param {string} handle User handle
 * @param {function} callback Success callback
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'handle' implicitly has an 'any' type.
async function demoteUser(handle, callback) {
    try {
        const response = await fetch('/api/users/demote', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle }),
        });

        if (!response.ok) {
            const data = await response.json();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(data.error || 'Unknown error', 'Failed to demote user');
            throw new Error('Failed to demote user');
        }

        callback();
    } catch (error) {
        console.error('Error demoting user:', error);
    }
}

/**
 * Create a new user.
 * @param {HTMLFormElement} form Form element
 * @param callback
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'form' implicitly has an 'any' type.
async function createUser(form, callback) {
    const errors = [];
    const formData = new FormData(form);

    if (!formData.get('handle')) {
        errors.push('Handle is required');
    }

    if (formData.get('password') !== formData.get('confirm')) {
        errors.push('Passwords do not match');
    }

    if (errors.length) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error(errors.join(', '), 'Failed to create user');
        return;
    }

    const body = {};
    formData.forEach(function (value, key) {
        if (key === 'confirm') {
            return;
        }
        if (key.startsWith('_')) {
            key = key.substring(1);
        }
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        body[key] = value;
    });

    try {
        const response = await fetch('/api/users/create', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const data = await response.json();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(data.error || 'Unknown error', 'Failed to create user');
            throw new Error('Failed to create user');
        }

        form.reset();
        callback();
    } catch (error) {
        console.error('Error creating user:', error);
    }
}

/**
 * Backup a user's data.
 * @param {string} handle Handle of the user to backup
 * @param {function} callback Success callback
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'handle' implicitly has an 'any' type.
async function backupUserData(handle, callback) {
    try {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info('Please wait for the download to start.', 'Backup Requested');
        const response = await fetch('/api/users/backup', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle }),
        });

        if (!response.ok) {
            const data = await response.json();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(data.error || 'Unknown error', 'Failed to backup user data');
            throw new Error('Failed to backup user data');
        }

        const includesSecrets = await canViewSecrets();
        if (includesSecrets === false) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.warning('The backup will not include secrets due to a server configuration.', 'Secrets Not Included');
        }

        const blob = await response.blob();
        const header = response.headers.get('Content-Disposition');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const parts = header.split(';');
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        const filename = parts[1].split('=')[1].replaceAll('"', '');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        callback();
    } catch (error) {
        console.error('Error backing up user data:', error);
    }
}

/**
 * Shows a popup to change a user's password.
 * @param {string} handle User handle
 * @param {function} callback Success callback
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'handle' implicitly has an 'any' type.
async function changePassword(handle, callback) {
    try {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const wrapper = document.createElement('div');
        wrapper.innerHTML = await renderTemplateAsync('changePassword');
        const template = wrapper;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const currentPasswordBlock = template.querySelector('.currentPasswordBlock');
        if (currentPasswordBlock instanceof HTMLElement) currentPasswordBlock.style.display = isAdmin() ? 'none' : '';
        let newPassword = '';
        let confirmPassword = '';
        let oldPassword = '';
        template.querySelector('input[name="current"]').addEventListener('input', function (this: HTMLInputElement) {
            oldPassword = String(this.value);
        });
        template.querySelector('input[name="password"]').addEventListener('input', function (this: HTMLInputElement) {
            newPassword = String(this.value);
        });
        template.querySelector('input[name="confirm"]').addEventListener('input', function (this: HTMLInputElement) {
            confirmPassword = String(this.value);
        });
        const result = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '', { okButton: 'Change', cancelButton: 'Cancel', wide: false, large: false });
        if (result === POPUP_RESULT.CANCELLED || result === POPUP_RESULT.NEGATIVE) {
            throw new Error('Change password cancelled');
        }

        if (newPassword !== confirmPassword) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error('Passwords do not match', 'Failed to change password');
            throw new Error('Passwords do not match');
        }

        const response = await fetch('/api/users/change-password', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle, newPassword, oldPassword }),
        });

        if (!response.ok) {
            const data = await response.json();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(data.error || 'Unknown error', 'Failed to change password');
            throw new Error('Failed to change password');
        }

        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success('Password changed successfully', 'Password Changed');
        callback();
    } catch (error) {
        console.error('Error changing password:', error);
    }
}

/**
 * Delete a user.
 * @param {string} handle User handle
 * @param {function} callback Success callback
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'handle' implicitly has an 'any' type.
async function deleteUser(handle, callback) {
    try {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (handle === currentUser.handle) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error('Cannot delete yourself', 'Failed to delete user');
            throw new Error('Cannot delete yourself');
        }

        let purge = false;
        let confirmHandle = '';

        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const wrapper = document.createElement('div');
        wrapper.innerHTML = await renderTemplateAsync('deleteUser');
        const template = wrapper;
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        template.querySelector('#deleteUserName').textContent = handle;
        template.querySelector('input[name="deleteUserData"]').addEventListener('input', function (this: HTMLInputElement) {
            purge = this.checked;
        });
        template.querySelector('input[name="deleteUserHandle"]').addEventListener('input', function (this: HTMLInputElement) {
            confirmHandle = String(this.value);
        });

        const result = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '', { okButton: 'Delete', cancelButton: 'Cancel', wide: false, large: false });

        if (result !== POPUP_RESULT.AFFIRMATIVE) {
            throw new Error('Delete user cancelled');
        }

        if (handle !== confirmHandle) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error('Handles do not match', 'Failed to delete user');
            throw new Error('Handles do not match');
        }

        const response = await fetch('/api/users/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle, purge }),
        });

        if (!response.ok) {
            const data = await response.json();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(data.error || 'Unknown error', 'Failed to delete user');
            throw new Error('Failed to delete user');
        }

        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success('User deleted successfully', 'User Deleted');
        callback();
    } catch (error) {
        console.error('Error deleting user:', error);
    }
}

/**
 * Reset a user's settings.
 * @param {string} handle User handle
 * @param {function} callback Success callback
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'handle' implicitly has an 'any' type.
async function resetSettings(handle, callback) {
    try {
        let password = '';
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const wrapper = document.createElement('div');
        wrapper.innerHTML = await renderTemplateAsync('resetSettings');
        const template = wrapper;
        template.querySelector('input[name="password"]').addEventListener('input', function (this: HTMLInputElement) {
            password = String(this.value);
        });
        const result = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '', { okButton: 'Reset', cancelButton: 'Cancel', wide: false, large: false });

        if (result !== POPUP_RESULT.AFFIRMATIVE) {
            throw new Error('Reset settings cancelled');
        }

        const response = await fetch('/api/users/reset-settings', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle, password }),
        });

        if (!response.ok) {
            const data = await response.json();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(data.error || 'Unknown error', 'Failed to reset settings');
            throw new Error('Failed to reset settings');
        }

        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success('Settings reset successfully', 'Settings Reset');
        callback();
    } catch (error) {
        console.error('Error resetting settings:', error);
    }
}

/**
 * Change a user's display name.
 * @param {string} handle User handle
 * @param {string} name Current name
 * @param {function} callback Success callback
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'handle' implicitly has an 'any' type.
async function changeName(handle, name, callback) {
    try {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const wrapper = document.createElement('div');
        wrapper.innerHTML = await renderTemplateAsync('changeName');
        const template = wrapper;
        const result = await callGenericPopup(template, POPUP_TYPE.INPUT, name, { okButton: 'Change', cancelButton: 'Cancel', wide: false, large: false });

        if (!result) {
            throw new Error('Change name cancelled');
        }

        name = String(result);

        const response = await fetch('/api/users/change-name', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle, name }),
        });

        if (!response.ok) {
            const data = await response.json();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(data.error || 'Unknown error', 'Failed to change name');
            throw new Error('Failed to change name');
        }

        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success('Name changed successfully', 'Name Changed');
        callback();
    } catch (error) {
        console.error('Error changing name:', error);
    }
}

/**
 * Restore a settings snapshot.
 * @param {string} name Snapshot name
 * @param {function} callback Success callback
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
async function restoreSnapshot(name, callback) {
    try {
        const confirm = await callGenericPopup(
            `Are you sure you want to restore the settings from "${name}"?`,
            POPUP_TYPE.CONFIRM,
            '',
            { okButton: 'Restore', cancelButton: 'Cancel', wide: false, large: false },
        );

        if (confirm !== POPUP_RESULT.AFFIRMATIVE) {
            throw new Error('Restore snapshot cancelled');
        }

        const response = await fetch('/api/settings/restore-snapshot', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name }),
        });

        if (!response.ok) {
            const data = await response.json();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(data.error || 'Unknown error', 'Failed to restore snapshot');
            throw new Error('Failed to restore snapshot');
        }

        callback();
    } catch (error) {
        console.error('Error restoring snapshot:', error);
    }
}

/**
 * Load the content of a settings snapshot.
 * @param {string} name Snapshot name
 * @returns {Promise<string>} Snapshot content
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
async function loadSnapshotContent(name) {
    try {
        const response = await fetch('/api/settings/load-snapshot', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name }),
        });

        if (!response.ok) {
            const data = await response.json();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(data.error || 'Unknown error', 'Failed to load snapshot content');
            throw new Error('Failed to load snapshot content');
        }

        return response.text();
    } catch (error) {
        console.error('Error loading snapshot content:', error);
    }
}

/**
 * Gets a list of settings snapshots.
 * @returns {Promise<Snapshot[]>} List of snapshots
 * @typedef {object} Snapshot
 * @property {string} name Snapshot name
 * @property {number} date Date in milliseconds
 * @property {number} size File size in bytes
 */
async function getSnapshots() {
    try {
        const response = await fetch('/api/settings/get-snapshots', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (!response.ok) {
            const data = await response.json();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(data.error || 'Unknown error', 'Failed to get settings snapshots');
            throw new Error('Failed to get settings snapshots');
        }

        const snapshots = await response.json();
        return snapshots;
    } catch (error) {
        console.error('Error getting settings snapshots:', error);
        return [];
    }
}

/**
 * Make a snapshot of the current settings.
 * @param {function} callback Success callback
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'callback' implicitly has an 'any' type.
async function makeSnapshot(callback) {
    try {
        const response = await fetch('/api/settings/make-snapshot', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (!response.ok) {
            const data = await response.json();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(data.error || 'Unknown error', 'Failed to make snapshot');
            throw new Error('Failed to make snapshot');
        }

        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success('Snapshot created successfully', 'Snapshot Created');
        callback();
    } catch (error) {
        console.error('Error making snapshot:', error);
    }
}

/**
 * Open the settings snapshots view.
 */
async function viewSettingsSnapshots() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const wrapper = document.createElement('div');
    wrapper.innerHTML = await renderTemplateAsync('snapshotsView');
    const template = wrapper;
    /**
     *
     */
    async function renderSnapshots() {
        const snapshots = await getSnapshots();
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        template.querySelector('.snapshotList').innerHTML = '';

        // @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
        for (const snapshot of snapshots.sort((a, b) => b.date - a.date)) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const snapshotBlock = template.querySelector('.snapshotTemplate .snapshot').clone();
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            snapshotBlock.querySelector('.snapshotName').textContent = snapshot.name;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            snapshotBlock.querySelector('.snapshotDate').textContent = new Date(snapshot.date.toLocaleString());
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            snapshotBlock.querySelector('.snapshotSize').textContent = humanFileSize(snapshot.size);
            snapshotBlock.querySelector('.snapshotRestoreButton').addEventListener('click', async (e: Event) => {
                e.stopPropagation();
                restoreSnapshot(snapshot.name, () => location.reload());
            });
            snapshotBlock.querySelector('.inline-drawer-toggle').addEventListener('click', async () => {
                const contentBlock = snapshotBlock.querySelector('.snapshotContent');
                if (contentBlock && !contentBlock.value) {
                    const content = await loadSnapshotContent(snapshot.name);
                    contentBlock.value = content;
                }
            });
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            template.querySelector('.snapshotList').append(snapshotBlock);
        }
    }

    callGenericPopup(template, POPUP_TYPE.TEXT, '', { okButton: 'Close', wide: false, large: false, allowVerticalScrolling: true });
    template.querySelector('.makeSnapshotButton').addEventListener('click', () => makeSnapshot(renderSnapshots));
    renderSnapshots();
}

/**
 * Reset everything to default.
 * @param {function} callback Success callback
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'callback' implicitly has an 'any' type.
async function resetEverything(callback) {
    try {
        const step1Response = await fetch('/api/users/reset-step1', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (!step1Response.ok) {
            const data = await step1Response.json();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(data.error || 'Unknown error', 'Failed to reset');
            throw new Error('Failed to reset everything');
        }

        let password = '';
        let code = '';

        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        const wrapper = document.createElement('div');
        wrapper.innerHTML = await renderTemplateAsync('userReset');
        const template = wrapper;
        template.querySelector('input[name="password"]').addEventListener('input', function (this: HTMLInputElement) {
            password = String(this.value);
        });
        template.querySelector('input[name="code"]').addEventListener('input', function (this: HTMLInputElement) {
            code = String(this.value);
        });
        const confirm = await callGenericPopup(
            template,
            POPUP_TYPE.CONFIRM,
            '',
            { okButton: 'Reset', cancelButton: 'Cancel', wide: false, large: false },
        );

        if (confirm !== POPUP_RESULT.AFFIRMATIVE) {
            throw new Error('Reset everything cancelled');
        }

        const step2Response = await fetch('/api/users/reset-step2', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ password, code }),
        });

        if (!step2Response.ok) {
            const data = await step2Response.json();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(data.error || 'Unknown error', 'Failed to reset');
            throw new Error('Failed to reset everything');
        }

        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.success('Everything reset successfully', 'Reset Everything');
        callback();
    } catch (error) {
        console.error('Error resetting everything:', error);
    }
}

/**
 *
 */
async function openUserProfile() {
    await getCurrentUser();
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const wrapper = document.createElement('div');
    wrapper.innerHTML = await renderTemplateAsync('userProfile');
    const template = wrapper;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    template.querySelector('.userName').textContent = currentUser.name;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    template.querySelector('.userHandle').textContent = currentUser.handle;
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    template.querySelector('.avatar img').setAttribute('src', currentUser.avatar);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    template.querySelector('.userRole').textContent = currentUser.admin ? 'Admin' : 'User';
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    template.querySelector('.userCreated').textContent = new Date(currentUser.created.toLocaleString());
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const hasPasswordEl = template.querySelector('.hasPassword');
    if (hasPasswordEl instanceof HTMLElement) hasPasswordEl.style.display = currentUser.password ? '' : 'none';
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const noPasswordEl = template.querySelector('.noPassword');
    if (noPasswordEl instanceof HTMLElement) noPasswordEl.style.display = !currentUser.password ? '' : 'none';
    template.querySelector('.userSettingsSnapshotsButton').addEventListener('click', () => viewSettingsSnapshots());
    template.querySelector('.userChangeNameButton').addEventListener('click', async () => changeName(currentUser!.handle, currentUser!.name, async () => {
        await getCurrentUser();
        template.querySelector('.userName').textContent = currentUser!.name;
    }));
    template.querySelector('.userChangePasswordButton').addEventListener('click', () => changePassword(currentUser!.handle, async () => {
        await getCurrentUser();
        const hasPasswordEl = template.querySelector('.hasPassword');
        const noPasswordEl = template.querySelector('.noPassword');
        if (hasPasswordEl) hasPasswordEl.style.display = currentUser!.password ? '' : 'none';
        if (noPasswordEl) noPasswordEl.style.display = !currentUser!.password ? '' : 'none';
    }));
    template.querySelector('.userBackupButton').addEventListener('click', function (this: HTMLElement) {
        this.classList.add('disabled');
        backupUserData(currentUser!.handle, () => {
            this.classList.remove('disabled');
        });
    });
    template.querySelector('.userResetSettingsButton').addEventListener('click', () => resetSettings(currentUser!.handle, () => location.reload()));
    template.querySelector('.userResetAllButton').addEventListener('click', () => resetEverything(() => location.reload()));
    template.querySelector('.userAvatarChange').addEventListener('click', () => template.querySelector('.avatarUpload').dispatchEvent(new Event('click')));
    template.querySelector('.avatarUpload').addEventListener('change', async function (this: HTMLInputElement) {
        if (!(this instanceof HTMLInputElement)) {
            return;
        }

        const file = this.files?.[0];
        if (!file) {
            return;
        }

        await cropAndUploadAvatar(currentUser!.handle, file);
        await getCurrentUser();
        const avatarImg = template.querySelector('.avatar img');
        if (avatarImg) avatarImg.setAttribute('src', currentUser!.avatar);
    });
    template.querySelector('.userAvatarRemove').addEventListener('click', async function (this: HTMLElement) {
        await changeAvatar(currentUser!.handle, '');
        await getCurrentUser();
        const avatarImg = template.querySelector('.avatar img');
        if (avatarImg) avatarImg.setAttribute('src', currentUser!.avatar);
    });

    if (!accountsEnabled) {
        template.querySelectorAll('[data-require-accounts]').forEach(el => (el as HTMLElement).style.display = 'none');
        const accountsDisabledHint = template.querySelector('.accountsDisabledHint') as HTMLElement | null;
        if (accountsDisabledHint) accountsDisabledHint.style.display = '';
    }

    const popupOptions = {
        okButton: 'Close',
        wide: false,
        large: false,
        allowVerticalScrolling: true,
        allowHorizontalScrolling: false,
    };
    callGenericPopup(template, POPUP_TYPE.TEXT, '', popupOptions);
}

/**
 * Crop and upload an avatar image.
 * @param {string} handle User handle
 * @param {File} file Avatar file
 * @returns {Promise<string>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'handle' implicitly has an 'any' type.
async function cropAndUploadAvatar(handle, file) {
    const dataUrl = await getBase64Async(await ensureImageFormatSupported(file));
    const croppedImage = await callGenericPopup('Set the crop position of the avatar image', POPUP_TYPE.CROP, '', { cropAspect: 1, cropImage: dataUrl });
    if (!croppedImage) {
        return;
    }

    await changeAvatar(handle, String(croppedImage));

    return String(croppedImage);
}

/**
 * Change the avatar of the user.
 * @param {string} handle User handle
 * @param {string} avatar File to upload or base64 string
 * @returns {Promise<void>} Avatar URL
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'handle' implicitly has an 'any' type.
async function changeAvatar(handle, avatar) {
    try {
        const response = await fetch('/api/users/change-avatar', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ avatar, handle }),
        });

        if (!response.ok) {
            const data = await response.json();
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.error(data.error || 'Unknown error', 'Failed to change avatar');
            return;
        }
    } catch (error) {
        console.error('Error changing avatar:', error);
    }
}

/**
 *
 */
async function openAdminPanel() {
    /**
     *
     */
    async function renderUsers() {
        const users = await getUsers();
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        template.querySelector('.usersList').innerHTML = '';
        for (const user of users) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const userBlock = template.querySelector('.userAccountTemplate .userAccount').clone();
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            userBlock.querySelector('.userName').textContent = user.name;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            userBlock.querySelector('.userHandle').textContent = user.handle;
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            userBlock.querySelector('.userStatus').textContent = user.enabled ? 'Enabled' : 'Disabled';
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            userBlock.querySelector('.userRole').textContent = user.admin ? 'Admin' : 'User';
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            userBlock.querySelector('.avatar img').setAttribute('src', user.avatar);
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            userBlock.querySelector('.hasPassword').toggle(user.password);
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            userBlock.querySelector('.noPassword').toggle(!user.password);
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            userBlock.querySelector('.userCreated').textContent = new Date(user.created.toLocaleString());
            const enableBtn = userBlock.querySelector('.userEnableButton');
            enableBtn.style.display = !user.enabled ? '' : 'none';
            enableBtn.addEventListener('click', () => enableUser(user.handle, renderUsers));
            const disableBtn = userBlock.querySelector('.userDisableButton');
            disableBtn.style.display = user.enabled ? '' : 'none';
            disableBtn.addEventListener('click', () => disableUser(user.handle, renderUsers));
            const promoteBtn = userBlock.querySelector('.userPromoteButton');
            promoteBtn.style.display = !user.admin ? '' : 'none';
            promoteBtn.addEventListener('click', () => promoteUser(user.handle, renderUsers));
            const demoteBtn = userBlock.querySelector('.userDemoteButton');
            demoteBtn.style.display = user.admin ? '' : 'none';
            demoteBtn.addEventListener('click', () => demoteUser(user.handle, renderUsers));
            userBlock.querySelector('.userChangePasswordButton').addEventListener('click', () => changePassword(user.handle, renderUsers));
            userBlock.querySelector('.userDelete').addEventListener('click', () => deleteUser(user.handle, renderUsers));
            userBlock.querySelector('.userChangeNameButton').addEventListener('click', async () => changeName(user.handle, user.name, renderUsers));
            userBlock.querySelector('.userBackupButton').addEventListener('click', function (this: HTMLElement) {
                this.classList.add('disabled');
                // Remove any existing listeners to prevent double-click
                // (original used .off('click'))
                backupUserData(user.handle, renderUsers);
            });
            userBlock.querySelector('.userAvatarChange').addEventListener('click', () => userBlock.querySelector('.avatarUpload').dispatchEvent(new Event('click')));
            userBlock.querySelector('.avatarUpload').addEventListener('change', async function (this: HTMLInputElement) {
                if (!(this instanceof HTMLInputElement)) {
                    return;
                }

                const file = this.files?.[0];
                if (!file) {
                    return;
                }

                await cropAndUploadAvatar(user.handle, file);
                renderUsers();
            });
            userBlock.querySelector('.userAvatarRemove').addEventListener('click', async function (this: HTMLElement) {
                await changeAvatar(user.handle, '');
                renderUsers();
            });
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            template.querySelector('.usersList').append(userBlock);
        }
    }

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const wrapper = document.createElement('div');
    wrapper.innerHTML = await renderTemplateAsync('admin');
    const template = wrapper;

    template.querySelectorAll('.adminNav > button').forEach((el: Element) => el.addEventListener('click', function (this: HTMLElement) {
    const target = String(this.dataset.targetTab);
    template.querySelectorAll('.navTab').forEach((tab: Element) => {
        (tab as HTMLElement).style.display = tab.classList.contains(target) ? '' : 'none';
        });
    }));

    template.querySelector('.createUserDisplayName').addEventListener('input', async function (this: HTMLInputElement) {
        const slug = await slugify(String(this.value));
        (template.querySelector('.createUserHandle') as HTMLInputElement).value = slug;
    });

    template.querySelector('.userCreateForm').addEventListener('submit', function (event: Event) {
        if (!(event.target instanceof HTMLFormElement)) {
            return;
        }

        event.preventDefault();
        createUser(event.target, () => {
            template.querySelector('.manageUsersButton').dispatchEvent(new Event('click'));
            renderUsers();
        });
    });

    callGenericPopup(template, POPUP_TYPE.TEXT, '', { okButton: 'Close', wide: false, large: false, allowVerticalScrolling: true, allowHorizontalScrolling: false });
    renderUsers();
}

/**
 * Log out the current user.
 * @returns {Promise<void>}
 */
async function logout() {
    await fetch('/api/users/logout', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
    });

    // On an explicit logout stop auto login
    // to allow user to change username even
    // when auto auth (such as authelia or basic)
    // would be valid
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('noauto', 'true');

    window.location.search = urlParams.toString();
}

/**
 * Runs a text through the slugify API endpoint.
 * @param {string} text Text to slugify
 * @returns {Promise<string>} Slugified text
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'text' implicitly has an 'any' type.
async function slugify(text) {
    try {
        const response = await fetch('/api/users/slugify', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ text }),
        });

        if (!response.ok) {
            throw new Error('Failed to slugify text');
        }

        return response.text();
    } catch (error) {
        console.error('Error slugifying text:', error);
        return text;
    }
}

/**
 * Pings the server to extend the user session.
 */
async function extendUserSession() {
    try {
        const response = await fetch('/api/ping?extend=1', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (!response.ok) {
            throw new Error('Ping did not succeed', { cause: response.status });
        }
    } catch (error) {
        console.error('Failed to extend user session', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('logout_button')?.addEventListener('click', () => {
        logout();
    });
    document.getElementById('admin_button')?.addEventListener('click', () => {
        openAdminPanel();
    });
    document.getElementById('account_button')?.addEventListener('click', () => {
        openUserProfile();
    });
    setInterval(async () => {
        if (currentUser) {
            await extendUserSession();
        }
    }, SESSION_EXTEND_INTERVAL);
});
