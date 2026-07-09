/**
 * A floating toast-like display panel for showing streaming LLM generation progress.
 * Shows reasoning (thinking) and content as they stream in.
 * Designed to work with ConnectionManagerRequestService streaming responses.
 *
 * Appends itself inside the topmost open `<dialog>` element (same approach as
 * fixToastrForDialogs in popup.js) so it renders above modal overlays.
 * @example
 * const display = new StreamingDisplay();
 * display.show({ label: 'Generating...' });
 *
 * for await (const chunk of streamGenerator) {
 *     display.updateReasoning(chunk.state?.reasoning)
 *         .updateContent(chunk.text);
 * }
 *
 * display.complete('Generated Something'); // Mark as done (green LED, auto-hide if configured)
 */

import { SVGInject } from '../lib.js';
import { t } from './i18n.js';
// @ts-expect-error TS(2792) FIXME: Cannot find module '/script.js'. Did you mean to s... Remove this comment to see the full error message
import { animation_duration, messageFormatting } from '/script.js';

/** CSS class prefix */
const CSS_PREFIX = 'streaming-display';

/**
 * @typedef {object} StreamingDisplayOptions
 * @property {string} [label] - Header label (e.g. "Generating greeting...")
 * @property {HTMLImageElement} [icon] - Optional API/model icon image (e.g. from createModelIcon). Will be SVG-injected when loaded.
 * @property {(() => (void | Promise<void>)) | null} [onStop] - Optional stop handler. When provided, a stop button is shown. Clicking it invokes this handler only — the display is not automatically hidden or completed.
 */

export class StreamingDisplay {
    /** @type {HTMLElement | null} */
    #element = null;
    /** @type {HTMLElement | null} */
    #labelElement = null;
    /** @type {HTMLElement | null} */
    #labelText = null;
    /** @type {HTMLElement | null} */
    #reasoningSection = null;
    /** @type {HTMLElement | null} */
    #reasoningContent = null;
    /** @type {HTMLElement | null} */
    #textSection = null;
    /** @type {HTMLElement | null} */
    #textContent = null;
    /** @type {HTMLButtonElement | null} */
    #stopButton = null;
    /** @type {HTMLButtonElement | null} */
    #minimizeButton = null;
    /** @type {HTMLButtonElement | null} */
    #closeButton = null;
    /** @type {(() => (void | Promise<void>)) | null} */
    #onStop = null;
    /** @type {HTMLElement | null} */
    #ledIndicator = null;
    /** @type {boolean} */
    #hasContent = false;
    /** @type {boolean} */
    #isMinimized = false;
    /** @type {boolean} */
    #isComplete = false;
    /** @type {boolean} */
    #isStopped = false;
    /** @type {ReturnType<typeof setTimeout> | null} */
    #hideTimeoutId = null;

    /**
     * Shows the streaming display panel.
     * @param {StreamingDisplayOptions} [options]
     * @returns {StreamingDisplay} this instance for chaining
     */
    show({ label = '', icon = null, onStop = null } = {}) {
        if (this.#element) this.hide({ instant: true });

        this.#isMinimized = false;
        this.#isComplete = false;
        this.#onStop = onStop;
        this.#clearHideTimeout();

        // @ts-expect-error TS(2322) FIXME: Type 'HTMLDivElement' is not assignable to type 'n... Remove this comment to see the full error message
        this.#element = document.createElement('div');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#element.classList.add(CSS_PREFIX);

        // Header label with LED indicator
        // @ts-expect-error TS(2322) FIXME: Type 'HTMLDivElement' is not assignable to type 'n... Remove this comment to see the full error message
        this.#labelElement = document.createElement('div');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#labelElement.classList.add(`${CSS_PREFIX}-label`);

        // LED status indicator (pulsing while streaming, green when complete)
        // @ts-expect-error TS(2322) FIXME: Type 'HTMLSpanElement' is not assignable to type '... Remove this comment to see the full error message
        this.#ledIndicator = document.createElement('span');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#ledIndicator.classList.add(`${CSS_PREFIX}-led`);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#labelElement.appendChild(this.#ledIndicator);

        // Insert model icon into the label (after the LED)
        // @ts-expect-error TS(2358) FIXME: The left-hand side of an 'instanceof' expression m... Remove this comment to see the full error message
        if (icon instanceof HTMLImageElement) {
            // @ts-expect-error TS(2339) FIXME: Property 'classList' does not exist on type 'never... Remove this comment to see the full error message
            icon.classList.add(`${CSS_PREFIX}-icon`);
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            this.#labelElement.appendChild(icon);
            // @ts-expect-error TS(2339) FIXME: Property 'onload' does not exist on type 'never'.
            icon.onload = async function () {
                await SVGInject(icon);
            };
        }

        // @ts-expect-error TS(2322) FIXME: Type 'HTMLSpanElement' is not assignable to type '... Remove this comment to see the full error message
        this.#labelText = document.createElement('span');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#labelText.classList.add(`${CSS_PREFIX}-label-text`);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#labelText.textContent = label;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#labelElement.appendChild(this.#labelText);

        // Window control buttons container
        const controls = document.createElement('div');
        controls.classList.add(`${CSS_PREFIX}-controls`);

        // Stop button (only shown when an onStop handler is provided)
        if (onStop) {
            // @ts-expect-error TS(2322) FIXME: Type 'HTMLButtonElement' is not assignable to type... Remove this comment to see the full error message
            this.#stopButton = document.createElement('button');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            this.#stopButton.classList.add(`${CSS_PREFIX}-btn`, `${CSS_PREFIX}-btn-stop`);
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            this.#stopButton.setAttribute('aria-label', t`Stop`);
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            this.#stopButton.setAttribute('title', t`Stop generation`);
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            this.#stopButton.innerHTML = '&#9632;'; // Black square ■
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            this.#stopButton.addEventListener('click', async () => {
                // Disable immediately to prevent double-clicks and give instant feedback
                if (this.#stopButton) {
                    // @ts-expect-error TS(2339) FIXME: Property 'disabled' does not exist on type 'never'... Remove this comment to see the full error message
                    this.#stopButton.disabled = true;
                }
                try {
                    // @ts-expect-error TS(2349) FIXME: This expression is not callable.
                    await this.#onStop?.();
                } catch (e) {
                    console.error('[StreamingDisplay] Error executing stop handler', e);
                }
            });
            // @ts-expect-error TS(2345) FIXME: Argument of type 'null' is not assignable to param... Remove this comment to see the full error message
            controls.appendChild(this.#stopButton);
        }

        // Minimize button
        // @ts-expect-error TS(2322) FIXME: Type 'HTMLButtonElement' is not assignable to type... Remove this comment to see the full error message
        this.#minimizeButton = document.createElement('button');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#minimizeButton.classList.add(`${CSS_PREFIX}-btn`, `${CSS_PREFIX}-btn-minimize`);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#minimizeButton.setAttribute('aria-label', t`Minimize`);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#minimizeButton.setAttribute('title', t`Minimize`);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#minimizeButton.innerHTML = '&#8211;'; // En dash
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#minimizeButton.addEventListener('click', () => this.toggleMinimize());
        // @ts-expect-error TS(2345) FIXME: Argument of type 'null' is not assignable to param... Remove this comment to see the full error message
        controls.appendChild(this.#minimizeButton);

        // Close button
        // @ts-expect-error TS(2322) FIXME: Type 'HTMLButtonElement' is not assignable to type... Remove this comment to see the full error message
        this.#closeButton = document.createElement('button');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#closeButton.classList.add(`${CSS_PREFIX}-btn`, `${CSS_PREFIX}-btn-close`);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#closeButton.setAttribute('aria-label', t`Close`);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#closeButton.setAttribute('title', t`Close (generation continues in background)`);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#closeButton.innerHTML = '&#215;'; // Multiplication sign (×)
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#closeButton.addEventListener('click', () => this.hide());
        // @ts-expect-error TS(2345) FIXME: Argument of type 'null' is not assignable to param... Remove this comment to see the full error message
        controls.appendChild(this.#closeButton);

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#labelElement.appendChild(controls);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#element.appendChild(this.#labelElement);

        // Content container (for minimize functionality)
        const contentContainer = document.createElement('div');
        contentContainer.classList.add(`${CSS_PREFIX}-content`);

        // Reasoning section (hidden until content arrives)
        // @ts-expect-error TS(2322) FIXME: Type 'HTMLDivElement' is not assignable to type 'n... Remove this comment to see the full error message
        this.#reasoningSection = document.createElement('div');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#reasoningSection.classList.add(`${CSS_PREFIX}-reasoning`);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#reasoningSection.style.display = 'none';

        const reasoningLabel = document.createElement('div');
        reasoningLabel.classList.add(`${CSS_PREFIX}-reasoning-label`);
        reasoningLabel.textContent = t`Thinking...`;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#reasoningSection.appendChild(reasoningLabel);

        // @ts-expect-error TS(2322) FIXME: Type 'HTMLDivElement' is not assignable to type 'n... Remove this comment to see the full error message
        this.#reasoningContent = document.createElement('div');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#reasoningContent.classList.add(`${CSS_PREFIX}-reasoning-content`);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#reasoningSection.appendChild(this.#reasoningContent);

        // @ts-expect-error TS(2345) FIXME: Argument of type 'null' is not assignable to param... Remove this comment to see the full error message
        contentContainer.appendChild(this.#reasoningSection);

        // Content section (hidden until content arrives)
        // @ts-expect-error TS(2322) FIXME: Type 'HTMLDivElement' is not assignable to type 'n... Remove this comment to see the full error message
        this.#textSection = document.createElement('div');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#textSection.classList.add(`${CSS_PREFIX}-text`);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#textSection.style.display = 'none';

        // @ts-expect-error TS(2322) FIXME: Type 'HTMLDivElement' is not assignable to type 'n... Remove this comment to see the full error message
        this.#textContent = document.createElement('div');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#textContent.classList.add(`${CSS_PREFIX}-text-content`, 'mes_text'); // Allow formatting based on how chat messages are formatted too
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#textSection.appendChild(this.#textContent);

        // @ts-expect-error TS(2345) FIXME: Argument of type 'null' is not assignable to param... Remove this comment to see the full error message
        contentContainer.appendChild(this.#textSection);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.#element.appendChild(contentContainer);

        // Append inside the topmost open dialog (same pattern as fixToastrForDialogs in popup.js).
        // Modal <dialog> elements live in the browser's top layer, so z-index alone won't work.
        const target = Array.from(document.querySelectorAll('dialog[open]:not([closing])')).pop() ?? document.body;
        // @ts-expect-error TS(2345) FIXME: Argument of type 'null' is not assignable to param... Remove this comment to see the full error message
        target.appendChild(this.#element);

        // Trigger entrance animation on next frame
        requestAnimationFrame(() => {
            // @ts-expect-error TS(2339) FIXME: Property 'classList' does not exist on type 'never... Remove this comment to see the full error message
            this.#element?.classList.add(`${CSS_PREFIX}-visible`);
        });

        return this;
    }

    /**
     * Toggles the minimized state of the display.
     * When minimized, only the header with label and buttons is shown.
     * @returns {StreamingDisplay} this instance for chaining
     */
    toggleMinimize() {
        if (!this.#element) return this;

        this.#isMinimized = !this.#isMinimized;
        // @ts-expect-error TS(2339) FIXME: Property 'classList' does not exist on type 'never... Remove this comment to see the full error message
        this.#element.classList.toggle(`${CSS_PREFIX}-minimized`, this.#isMinimized);

        // Update minimize button icon/appearance
        if (this.#minimizeButton) {
            // @ts-expect-error TS(2339) FIXME: Property 'innerHTML' does not exist on type 'never... Remove this comment to see the full error message
            this.#minimizeButton.innerHTML = this.#isMinimized ? '&#9633;' : '&#8211;'; // Square when minimized, dash when not
            // @ts-expect-error TS(2339) FIXME: Property 'setAttribute' does not exist on type 'ne... Remove this comment to see the full error message
            this.#minimizeButton.setAttribute('title', this.#isMinimized ? t`Restore` : t`Minimize`);
            // @ts-expect-error TS(2339) FIXME: Property 'setAttribute' does not exist on type 'ne... Remove this comment to see the full error message
            this.#minimizeButton.setAttribute('aria-label', this.#isMinimized ? t`Restore` : t`Minimize`);
        }

        return this;
    }

    /**
     * @returns {boolean} Whether the display is currently minimized
     */
    get isMinimized() {
        return this.#isMinimized;
    }

    /**
     * @returns {boolean} Whether the display is marked as complete (generation finished)
     */
    get isComplete() {
        return this.#isComplete;
    }

    /**
     * @returns {boolean} Whether the display was stopped by the user
     */
    get isStopped() {
        return this.#isStopped;
    }

    /**
     * Updates the header label text.
     * @param {string} label
     * @returns {StreamingDisplay} this instance for chaining
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'label' implicitly has an 'any' type.
    setLabel(label) {
        if (this.#labelText) {
            // @ts-expect-error TS(2339) FIXME: Property 'textContent' does not exist on type 'nev... Remove this comment to see the full error message
            this.#labelText.textContent = label;
        }
        return this;
    }

    /**
     * Updates the reasoning (thinking) section with new text.
     * Automatically shows the reasoning section when text is provided.
     * @param {string} text - Accumulated reasoning text
     * @returns {StreamingDisplay} this instance for chaining
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'text' implicitly has an 'any' type.
    updateReasoning(text) {
        if (!this.#reasoningContent || !this.#reasoningSection || !text) return this;

        // @ts-expect-error TS(2339) FIXME: Property 'style' does not exist on type 'never'.
        this.#reasoningSection.style.display = '';
        // @ts-expect-error TS(2339) FIXME: Property 'innerHTML' does not exist on type 'never... Remove this comment to see the full error message
        this.#reasoningContent.innerHTML = messageFormatting(text, '', false, false, -1, {}, true);
        // @ts-expect-error TS(2339) FIXME: Property 'scrollTop' does not exist on type 'never... Remove this comment to see the full error message
        this.#reasoningContent.scrollTop = this.#reasoningContent.scrollHeight;
        return this;
    }

    /**
     * Updates the main content section with new text.
     * Automatically shows the content section when text is provided (including empty string).
     * @param {string|null|undefined} text - Accumulated content text
     * @returns {StreamingDisplay} this instance for chaining
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'text' implicitly has an 'any' type.
    updateContent(text) {
        if (!this.#textContent || !this.#textSection || !text) return this;

        this.#hasContent = true;
        // @ts-expect-error TS(2339) FIXME: Property 'style' does not exist on type 'never'.
        this.#textSection.style.display = '';
        // @ts-expect-error TS(2339) FIXME: Property 'innerHTML' does not exist on type 'never... Remove this comment to see the full error message
        this.#textContent.innerHTML = messageFormatting(text, '', false, false, -1, {}, false);
        // @ts-expect-error TS(2339) FIXME: Property 'scrollTop' does not exist on type 'never... Remove this comment to see the full error message
        this.#textContent.scrollTop = this.#textContent.scrollHeight;
        return this;
    }

    /** @returns {boolean} Whether any content text has been displayed via streaming */
    get hasContent() {
        return this.#hasContent;
    }

    /**
     * Marks the generation as stopped by the user.
     *
     * Changes the LED indicator to solid red, removes the stop button, and keeps the display
     * visible until the user manually closes it with the close button (no auto-hide).
     * @param {object} [options]
     * @param {string|null} [options.label] - Optional label override (e.g. `'Generating... [Stopped]'`).
     * @returns {StreamingDisplay} this instance for chaining
     */
    markStopped({ label = null } = {}) {
        if (!this.#element || this.#isStopped || this.#isComplete) return this;

        this.#isStopped = true;
        this.#clearHideTimeout();
        // @ts-expect-error TS(2339) FIXME: Property 'classList' does not exist on type 'never... Remove this comment to see the full error message
        this.#element.classList.add(`${CSS_PREFIX}-stopped`);

        // Remove the stop button — nothing left to stop
        if (this.#stopButton) {
            // @ts-expect-error TS(2339) FIXME: Property 'remove' does not exist on type 'never'.
            this.#stopButton.remove();
            this.#stopButton = null;
        }

        if (label !== null) {
            this.setLabel(label);
        }

        return this;
    }

    /**
     * Marks the generation as complete and initiates cleanup. Optionally set a new label.
     *
     * This is the **preferred method** to call after streaming ends. It:
     * - Changes the LED indicator from pulsing orange to solid green
     * - Waits for the specified delay to let the user see the final result
     * - Then hides the display with a fade-out animation
     * @param {object} [options]
     * @param {string|null} [options.label] - Set the label automatically to a new one to display the completed state.
     * @param {number|null} [options.delay] - Delay in ms before hiding. Use `null` or negative value to keep displayed until user manually closes it.
     * @returns {StreamingDisplay} this instance for chaining
     */
    complete({ label = null, delay = 3000 } = {}) {
        if (!this.#element || this.#isComplete) return this;

        this.#isComplete = true;
        // @ts-expect-error TS(2339) FIXME: Property 'classList' does not exist on type 'never... Remove this comment to see the full error message
        this.#element.classList.add(`${CSS_PREFIX}-complete`);

        // Clear any existing hide timeout
        this.#clearHideTimeout();

        if (this.#stopButton) {
            // @ts-expect-error TS(2339) FIXME: Property 'remove' does not exist on type 'never'.
            this.#stopButton.remove();
            this.#stopButton = null;
        }
        if (label !== null) {
            this.setLabel(label);
        }

        // Auto-hide after delay if specified (positive number)
        if (typeof delay === 'number' && delay >= 0) {
            // @ts-expect-error TS(2322) FIXME: Type 'Timeout' is not assignable to type 'null'.
            this.#hideTimeoutId = setTimeout(() => {
                this.#performHide();
            }, delay);
        }

        return this;
    }

    /**
     * Immediately hides and removes the streaming display.
     *
     * **Note:** This is for immediate cleanup (e.g., when canceling generation
     * or closing the app). Prefer `complete()` when generation finishes normally,
     * as it shows the green LED and gives the user time to see the final result.
     * @param {object} [options]
     * @param {boolean} [options.instant] - Skip the fade-out animation
     * @returns {StreamingDisplay} this instance for chaining
     */
    hide({ instant = false } = {}) {
        this.#clearHideTimeout();
        this.#performHide({ instant });
        return this;
    }

    /**
     * Clears any pending auto-hide timeout.
     */
    #clearHideTimeout() {
        if (this.#hideTimeoutId !== null) {
            clearTimeout(this.#hideTimeoutId);
            this.#hideTimeoutId = null;
        }
    }

    /**
     * Internal method to actually remove the DOM element.
     * @param {object} [options]
     * @param {boolean} [options.instant]
     */
    #performHide({ instant = false } = {}) {
        if (!this.#element) return;

        const el = this.#element;

        // Clear all private fields
        this.#element = null;
        this.#labelElement = null;
        this.#labelText = null;
        this.#reasoningSection = null;
        this.#reasoningContent = null;
        this.#textSection = null;
        this.#textContent = null;
        this.#stopButton = null;
        this.#minimizeButton = null;
        this.#closeButton = null;
        this.#ledIndicator = null;
        this.#onStop = null;
        this.#hasContent = false;
        this.#isMinimized = false;
        this.#isComplete = false;
        this.#isStopped = false;
        this.#hideTimeoutId = null;

        if (instant) {
            // @ts-expect-error TS(2339) FIXME: Property 'remove' does not exist on type 'never'.
            el.remove();
            return;
        }

        // @ts-expect-error TS(2339) FIXME: Property 'classList' does not exist on type 'never... Remove this comment to see the full error message
        el.classList.remove(`${CSS_PREFIX}-visible`);
        const duration = animation_duration;
        if (duration > 0) {
            // @ts-expect-error TS(2339) FIXME: Property 'remove' does not exist on type 'never'.
            setTimeout(() => el.remove(), duration);
        } else {
            // @ts-expect-error TS(2339) FIXME: Property 'remove' does not exist on type 'never'.
            el.remove();
        }
    }
}
