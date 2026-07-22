import { debounce_timeout } from './constants.js';

/**
 * Drag and drop handler
 *
 * Can be used on any element, enabling drag&drop styling and callback on drop.
 */
export class DragAndDropHandler {
    /** @private */ selector;
    /** @private */ onDropCallback;
    // @ts-expect-error TS(7008) FIXME: Member 'dragLeaveTimeout' implicitly has an 'any' ... Remove this comment to see the full error message
    /** @private */ dragLeaveTimeout;
    /** @private */ noAnimation;
    /** @private */ _boundDragOver;
    /** @private */ _boundDragLeave;
    /** @private */ _boundDrop;

    /**
     * Create a DragAndDropHandler
     * @param {string} selector - The CSS selector for the elements to enable drag and drop
     * @param {(files: File[], event: DragEvent) => void} onDropCallback - The callback function to handle the drop event
     * @param root0
     * @param root0.noAnimation
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'selector' implicitly has an 'any' type.
    constructor(selector, onDropCallback, { noAnimation = false } = {}) {
        this.selector = selector;
        this.onDropCallback = onDropCallback;
        this.dragLeaveTimeout = null;
        this.noAnimation = noAnimation;

        // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
        this._boundDragOver = (e) => this._handleIfMatch(e, this.handleDragOver);
        // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
        this._boundDragLeave = (e) => this._handleIfMatch(e, this.handleDragLeave);
        // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
        this._boundDrop = (e) => this._handleIfMatch(e, this.handleDrop);

        this.init();
    }

    /**
     * @param {Event} event
     * @param {(event: DragEvent) => void} handler
     * @private
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    _handleIfMatch(event, handler) {
        if (
            this.selector === 'body' ||
            (event.target instanceof Element && event.target.closest(this.selector))
        ) {
            handler.call(this, event);
        }
    }

    /**
     * Destroy the drag and drop functionality
     */
    destroy() {
        document.body.removeEventListener('dragover', this._boundDragOver);
        document.body.removeEventListener('dragleave', this._boundDragLeave);
        document.body.removeEventListener('drop', this._boundDrop);

        document.querySelectorAll(this.selector).forEach((el) => {
            if (el.matches('drop_target no_animation')) {
                el.remove();
            }
        });
    }

    /**
     * Initialize the drag and drop functionality
     * Automatically called on construction
     * @private
     */
    init() {
        document.body.addEventListener('dragover', this._boundDragOver);
        document.body.addEventListener('dragleave', this._boundDragLeave);
        document.body.addEventListener('drop', this._boundDrop);

        document.querySelectorAll(this.selector).forEach((el) => el.classList.add('drop_target'));
        if (this.noAnimation)
            document
                .querySelectorAll(this.selector)
                .forEach((el) => el.classList.add('no_animation'));
    }

    /**
     * @param {DragEvent} event - The dragover event
     * @private
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    handleDragOver(event) {
        event.preventDefault();
        event.stopPropagation();
        clearTimeout(this.dragLeaveTimeout);
        document
            .querySelectorAll(this.selector)
            .forEach((el) => el.classList.add('drop_target', 'dragover'));
        if (this.noAnimation)
            document
                .querySelectorAll(this.selector)
                .forEach((el) => el.classList.add('no_animation'));
    }

    /**
     * @param {DragEvent} event - The dragleave event
     * @private
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    handleDragLeave(event) {
        event.preventDefault();
        event.stopPropagation();

        clearTimeout(this.dragLeaveTimeout);
        this.dragLeaveTimeout = setTimeout(() => {
            document
                .querySelectorAll(this.selector)
                .forEach((el) => el.classList.remove('dragover'));
        }, debounce_timeout.quick);
    }

    /**
     * @param {DragEvent} event - The drop event
     * @private
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    handleDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        clearTimeout(this.dragLeaveTimeout);
        document.querySelectorAll(this.selector).forEach((el) => el.classList.remove('dragover'));

        const files = Array.from(event.dataTransfer?.files ?? []);
        this.onDropCallback(files, event);
    }
}
