import { throttle } from './utils.js';

/**
 * Update input and slider values based on wheel delta
 * @param {HTMLInputElement} input The number input element
 * @param {HTMLInputElement|null} slider The associated range input element, if any
 * @param {number} deltaY The wheel deltaY value
 */
function updateValue(input: HTMLInputElement, slider: HTMLInputElement | null, deltaY: number) {
    const currentValue = parseFloat(input.value);
    const step = parseFloat(input.step);

    // Fast bailout before parsing min/max if baseline math is invalid
    if (Number.isNaN(currentValue) || Number.isNaN(step) || step <= 0 || deltaY === 0) return;

    const min = parseFloat(input.min);
    const max = parseFloat(input.max);

    // Calculate new value based on wheel movement delta (negative = up, positive = down)
    let newValue = currentValue + (deltaY > 0 ? -step : step);

    // Ensure it's a multiple of step
    newValue = Math.round(newValue / step) * step;

    // Ensure it's within the min and max range (NaN-aware)
    if (!Number.isNaN(min)) newValue = Math.max(newValue, min);
    if (!Number.isNaN(max)) newValue = Math.min(newValue, max);

    // Simple fix for floating point precision issues
    newValue = Math.round(newValue * 1e10) / 1e10;

    // Allocate the string representation once
    const valueStr = newValue.toString();

    // Update both input and slider values
    input.value = valueStr;
    if (slider) slider.value = valueStr;

    // Trigger input event (just ONE) to update any listeners
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

// Throttled version is instantiated once at the module level
const updateValueThrottled = throttle(updateValue, 25);

/**
 * Locates the associated range slider for a given number input.
 * @param {HTMLInputElement} input
 * @returns {HTMLInputElement | null}
 */
function getAssociatedSlider(input: HTMLInputElement): HTMLInputElement | null {
    const parent =
        input.closest('.range-block-range-and-counter') ??
        input.closest('div') ??
        input.parentElement;

    return /** @type {HTMLInputElement | null} */ (
        parent ? parent.querySelector('input[type="range"]') : null
    );
}

/**
 * Trap mouse wheel inside of focused number inputs to prevent scrolling their containers.
 * Instead of firing wheel events, manually update both slider and input values.
 * This also makes wheel work inside Firefox.
 */
function handleInputWheel() {
    document.addEventListener(
        'wheel',
        (e) => {
            const target = e.target;

            // Fast path bailout: wheel events fire continuously.
            // We only care if the event target is an input element.
            if (!(target instanceof HTMLInputElement)) return;

            const input = document.activeElement;

            // Active element must be a number input with a step attribute
            if (
                !(input instanceof HTMLInputElement) ||
                input.type !== 'number' ||
                !input.hasAttribute('step')
            ) {
                return;
            }

            let slider = null;

            // Determine if the wheel event occurred on the input or its associated slider.
            // Delays expensive DOM traversal until we verify the target is relevant.
            if (target === input) {
                slider = getAssociatedSlider(input);
            } else if (target.type === 'range') {
                slider = getAssociatedSlider(input);
                if (target !== slider) return;
            } else {
                return;
            }

            e.stopPropagation();
            e.preventDefault();

            updateValueThrottled(input, slider, e.deltaY);
        },
        { passive: false },
    );
}

/**
 *
 */
export function initDomHandlers() {
    handleInputWheel();
}
