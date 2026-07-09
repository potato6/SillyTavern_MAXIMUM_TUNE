import { loader } from './action-loader.js';

/**
 * Handle for the legacy loader created by showLoader().
 * @type {import('./action-loader.js').ActionLoaderHandle|null}
 */
// @ts-expect-error TS(7034) FIXME: Variable 'legacyLoaderHandle' implicitly has type ... Remove this comment to see the full error message
let legacyLoaderHandle = null;

/**
 * Shows the loader overlay.
 * @deprecated Use `showActionLoader()` from action-loader.js instead.
 * This function now creates a blocking action loader with no toast.
 * The new system supports stacking multiple loaders and provides better control.
 * @example
 * // New recommended approach:
 * import { showActionLoader } from './action-loader.js';
 * const handle = showActionLoader({ message: 'Loading...' });
 * // ... do work ...
 * handle.hide();
 */
export function showLoader() {
    // Hide any existing legacy loader first to maintain old behavior
    // @ts-expect-error TS(7005) FIXME: Variable 'legacyLoaderHandle' implicitly has an 'a... Remove this comment to see the full error message
    if (legacyLoaderHandle && legacyLoaderHandle.isActive) {
        // @ts-expect-error TS(7005) FIXME: Variable 'legacyLoaderHandle' implicitly has an 'a... Remove this comment to see the full error message
        legacyLoaderHandle.hide();
    }

    // Create a blocking loader with no toast (matches old behavior)
    legacyLoaderHandle = loader.show({
        slug: 'legacy-loader',
        blocking: true,
        toastMode: loader.ToastMode.NONE,
    });
}

/**
 * Hides the loader overlay.
 * @deprecated Use `hideActionLoader()` or `handle.hide()` from action-loader.js instead.
 * This function now hides the legacy loader created by showLoader().
 * @example
 * // New recommended approach:
 * import { showActionLoader } from './action-loader.js';
 * const handle = showActionLoader({ message: 'Loading...' });
 * // ... do work ...
 * await handle.hide();
 * @returns {Promise<void>}
 */
export async function hideLoader() {
    // @ts-expect-error TS(7005) FIXME: Variable 'legacyLoaderHandle' implicitly has an 'a... Remove this comment to see the full error message
    if (!legacyLoaderHandle || !legacyLoaderHandle.isActive) {
        console.warn('There is no loader showing to hide');
        return Promise.resolve();
    }

    // @ts-expect-error TS(7005) FIXME: Variable 'legacyLoaderHandle' implicitly has an 'a... Remove this comment to see the full error message
    await legacyLoaderHandle.hide();
    legacyLoaderHandle = null;
}
