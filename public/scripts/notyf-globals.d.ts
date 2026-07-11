/**
 * Global type declarations for notyf (loaded via IIFE script tag).
 * Extends the Notyf class with toastr-compatible multi-arg signatures.
 */
import type { Notyf, NotyfNotification } from 'notyf';

type NotyfShimMethod = (message: string, title?: string, opts?: Record<string, unknown>) => NotyfNotification;

declare global {
    /** The notyf IIFE constructor (loaded from lib/notyf.min.js) */
    // eslint-disable-next-line no-var
    var Notyf: typeof import('notyf').Notyf;

    /** Global notyf instance with toastr-compatible multi-arg shims */
    // eslint-disable-next-line no-var
    var notyf: Omit<Notyf, 'error' | 'success'> & {
        error: NotyfShimMethod;
        success: NotyfShimMethod;
        warning: NotyfShimMethod;
        info: NotyfShimMethod;
    };
}

export {};
