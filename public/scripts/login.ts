import { initAccessibility } from './a11y.js';

/**
 * CRSF token for requests.
 */
let csrfToken = '';
let discreetLogin = false;

/**
 * Gets a CSRF token from the server.
 * @returns {Promise<string>} CSRF token
 */
async function getCsrfToken() {
    const response = await fetch('/csrf-token');
    const data = await response.json();
    return data.token;
}

/**
 * Gets a list of users from the server.
 * @returns {Promise<object>} List of users
 */
async function getUserList() {
    const response = await fetch('/api/users/list', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
        },
    });

    if (!response.ok) {
        const errorData = await response.json();
        return displayError(errorData.error || 'An error occurred');
    }

    if (response.status === 204) {
        discreetLogin = true;
        return [];
    }

    const userListObj = await response.json();
    console.log(userListObj);
    return userListObj;
}

/**
 * Requests a recovery code for the user.
 * @param {string} handle User handle
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'handle' implicitly has an 'any' type.
async function sendRecoveryPart1(handle) {
    const response = await fetch('/api/users/recover-step1', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ handle }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        return displayError(errorData.error || 'An error occurred');
    }

    showRecoveryBlock();
}

/**
 * Sets a new password for the user using the recovery code.
 * @param {string} handle User handle
 * @param {string} code Recovery code
 * @param {string} newPassword New password
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'handle' implicitly has an 'any' type.
async function sendRecoveryPart2(handle, code, newPassword) {
    const recoveryData = {
        handle,
        code,
        newPassword,
    };

    const response = await fetch('/api/users/recover-step2', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify(recoveryData),
    });

    if (!response.ok) {
        const errorData = await response.json();
        return displayError(errorData.error || 'An error occurred');
    }

    console.log(`Successfully recovered password for ${handle}!`);
    await performLogin(handle, newPassword);
}

/**
 * Attempts to log in the user.
 * @param {string} handle User's handle
 * @param {string} password User's password
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'handle' implicitly has an 'any' type.
async function performLogin(handle, password) {
    const userInfo = {
        handle: handle,
        password: password,
    };

    try {
        const response = await fetch('/api/users/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken,
            },
            body: JSON.stringify(userInfo),
        });

        if (!response.ok) {
            const errorData = await response.json();
            return displayError(errorData.error || 'An error occurred');
        }

        const data = await response.json();

        if (data.handle) {
            console.log(`Successfully logged in as ${handle}!`);
            redirectToHome();
        }
    } catch (error) {
        console.error('Error logging in:', error);
        displayError(String(error));
    }
}

/**
 * Handles the user selection event.
 * @param {object} user User object
 * @returns {Promise<void>}
 */
async function onUserSelected(user: { password?: string; handle: string }) {
    // No password, just log in
    if (!user.password) {
        return await performLogin(user.handle, '');
    }

    (document.getElementById('passwordRecoveryBlock') as HTMLElement).style.display = 'none';
    (document.getElementById('passwordEntryBlock') as HTMLElement).style.display = '';
    (document.getElementById('loginButton') as HTMLElement).addEventListener('click', async () => {
        const password = String((document.getElementById('userPassword') as HTMLInputElement).value);
        await performLogin(user.handle, password);
    });

    (document.getElementById('recoverPassword') as HTMLElement).addEventListener('click', async () => {
        await sendRecoveryPart1(user.handle);
    });

    (document.getElementById('sendRecovery') as HTMLElement).addEventListener('click', async () => {
        const code = String((document.getElementById('recoveryCode') as HTMLInputElement).value);
        const newPassword = String((document.getElementById('newPassword') as HTMLInputElement).value);
        await sendRecoveryPart2(user.handle, code, newPassword);
    });

    displayError('');
}

/**
 * Displays an error message to the user.
 * @param {string} message Error message
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'message' implicitly has an 'any' type.
function displayError(message) {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.getElementById('errorMessage').textContent = message;
}

/**
 * Redirects the user to the home page.
 * Preserves the query string.
 */
function redirectToHome() {
    // Create a URL object based on the current location
    const currentUrl = new URL(window.location.href);

    // After a login there's no need to preserve the
    // noauto parameter (if present)
    currentUrl.searchParams.delete('noauto');

    // Set the pathname to root and keep the updated query string
    currentUrl.pathname = '/';

    // Redirect to the new URL
    window.location.href = currentUrl.toString();
}

/**
 * Hides the password entry block and shows the password recovery block.
 */
function showRecoveryBlock() {
    const pwEntryBlock = document.getElementById('passwordEntryBlock'); if (pwEntryBlock) pwEntryBlock.style.display = 'none';
    const pwRecoveryBlock = document.getElementById('passwordRecoveryBlock'); if (pwRecoveryBlock) pwRecoveryBlock.style.display = '';
    displayError('');
}

/**
 * Hides the password recovery block and shows the password entry block.
 */
function onCancelRecoveryClick() {
    const pwRecoveryBlock = document.getElementById('passwordRecoveryBlock'); if (pwRecoveryBlock) pwRecoveryBlock.style.display = 'none';
    const pwEntryBlock = document.getElementById('passwordEntryBlock'); if (pwEntryBlock) pwEntryBlock.style.display = '';
    displayError('');
}

/**
 * Configures the login page for normal login.
 * @param {import('../../src/users').UserViewModel[]} userList List of users
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'userList' implicitly has an 'any' type.
function configureNormalLogin(userList) {
    console.log('Discreet login is disabled');
    const handleEntryBlock = document.getElementById('handleEntryBlock'); if (handleEntryBlock) handleEntryBlock.style.display = 'none';
    const normalLoginPrompt = document.getElementById('normalLoginPrompt'); if (normalLoginPrompt) normalLoginPrompt.style.display = '';
    const discreetLoginPrompt = document.getElementById('discreetLoginPrompt'); if (discreetLoginPrompt) discreetLoginPrompt.style.display = 'none';
    console.log(userList);
    for (const user of userList) {
        const userBlock = document.createElement('div');
        userBlock.classList.add('userSelect');
        const avatarBlock = document.createElement('div');
        avatarBlock.classList.add('avatar');
        const img = document.createElement('img');
        img.setAttribute('src', user.avatar);
        avatarBlock.appendChild(img);
        userBlock.appendChild(avatarBlock);
        const nameSpan = document.createElement('span');
        nameSpan.classList.add('userName');
        nameSpan.textContent = user.name;
        userBlock.appendChild(nameSpan);
        const handleSmall = document.createElement('small');
        handleSmall.classList.add('userHandle');
        handleSmall.textContent = user.handle;
        userBlock.appendChild(handleSmall);
        userBlock.addEventListener('click', () => onUserSelected(user));
        document.getElementById('userList')?.appendChild(userBlock);
    }
}

/**
 * Configures the login page for discreet login.
 */
function configureDiscreetLogin() {
    console.log('Discreet login is enabled');
    (document.getElementById('handleEntryBlock') as HTMLElement).style.display = '';
    (document.getElementById('normalLoginPrompt') as HTMLElement).style.display = 'none';
    (document.getElementById('discreetLoginPrompt') as HTMLElement).style.display = '';
    (document.getElementById('userList') as HTMLElement).style.display = 'none';
    (document.getElementById('passwordRecoveryBlock') as HTMLElement).style.display = 'none';
    (document.getElementById('passwordEntryBlock') as HTMLElement).style.display = '';
    (document.getElementById('loginButton') as HTMLElement).addEventListener('click', async () => {
        const handle = String((document.getElementById('userHandle') as HTMLInputElement).value);
        const password = String((document.getElementById('userPassword') as HTMLInputElement).value);
        await performLogin(handle, password);
    });

    (document.getElementById('recoverPassword') as HTMLElement).addEventListener('click', async () => {
        const handle = String((document.getElementById('userHandle') as HTMLInputElement).value);
        await sendRecoveryPart1(handle);
    });

    (document.getElementById('sendRecovery') as HTMLElement).addEventListener('click', async () => {
        const handle = String((document.getElementById('userHandle') as HTMLInputElement).value);
        const code = String((document.getElementById('recoveryCode') as HTMLInputElement).value);
        const newPassword = String((document.getElementById('newPassword') as HTMLInputElement).value);
        await sendRecoveryPart2(handle, code, newPassword);
    });
}

(async function () {
    initAccessibility();

    csrfToken = await getCsrfToken();
    const userList = await getUserList();

    if (discreetLogin) {
        configureDiscreetLogin();
    } else {
        configureNormalLogin(userList);
    }
    (document.getElementById('shadow_popup') as HTMLElement).style.opacity = '';
    (document.getElementById('cancelRecovery') as HTMLElement).addEventListener('click', onCancelRecoveryClick);
    document.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter' && document.activeElement?.tagName === 'INPUT') {
            if ((document.getElementById('passwordRecoveryBlock') as HTMLElement).offsetParent !== null) {
                (document.getElementById('sendRecovery') as HTMLElement).dispatchEvent(new Event('click'));
            } else {
                (document.getElementById('loginButton') as HTMLElement).dispatchEvent(new Event('click'));
            }
        }
    });
})();
