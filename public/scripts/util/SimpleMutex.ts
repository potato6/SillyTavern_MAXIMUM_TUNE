/**
 * A simple mutex class to prevent concurrent updates.
 */
export class SimpleMutex {
    /**
     * @type {boolean}
     */
    isBusy = false;

    /**
     * @type {Function}
     */
    callback = () => {};

    /**
     * Constructs a SimpleMutex.
     * @param {Function} callback Callback function.
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'callback' implicitly has an 'any' type.
    constructor(callback) {
        this.isBusy = false;
        this.callback = callback;
    }

    /**
     * Updates the mutex by calling the callback if not busy.
     * @param  {...any} args Callback args
     * @returns {Promise<void>}
     */
    // @ts-expect-error TS(7019) FIXME: Rest parameter 'args' implicitly has an 'any[]' ty... Remove this comment to see the full error message
    async update(...args) {
        // Don't touch me I'm busy...
        if (this.isBusy) {
            return;
        }

        // I'm free. Let's update!
        try {
            this.isBusy = true;
            // @ts-expect-error TS(2556) FIXME: A spread argument must either have a tuple type or... Remove this comment to see the full error message
            await this.callback(...args);
        } finally {
            this.isBusy = false;
        }
    }
}
