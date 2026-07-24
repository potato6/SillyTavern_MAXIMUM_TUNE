import { saveSettingsDebounced } from '../script.js';
import { getTextTokens } from './tokenizers.js';
import { getSortableDelay, uuidv4 } from './utils.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Sortable: any;

export const BIAS_CACHE = new Map();

/**
 * Displays the logit bias list in the specified container.
 * @param {object} logitBias Logit bias object
 * @param {string} containerSelector Container element selector
 * @returns
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'logitBias' implicitly has an 'any' type... Remove this comment to see the full error message
export function displayLogitBias(logitBias, containerSelector) {
    if (!Array.isArray(logitBias)) {
        console.log('Logit bias set not found');
        return;
    }

    const list = document.querySelector(containerSelector).querySelector('.logit_bias_list');
    list.innerHTML = '';

    for (const entry of logitBias) {
        if (entry) {
            createLogitBiasListItem(entry, logitBias, containerSelector, list);
        }
    }

    // Check if a sortable instance exists
    if (list[0]?.sortableInstance) {
        // Destroy the instance
        list[0].sortableInstance.destroy();
    }

    // Make the list sortable
    const sortableEl = list;
    sortableEl.sortableInstance = new Sortable(sortableEl, {
        delay: getSortableDelay(),
        handle: '.drag-handle',
        onEnd: function () {
            const children = sortableEl.children;
            // Use a Map for O(1) lookups instead of array.indexOf which is O(N) per sort comparison
            const orderMap = new Map();
            let idx = 0;
            // Replicate the original unshift behavior by iterating backwards
            for (let i = children.length - 1; i >= 0; i--) {
                orderMap.set(children[i].dataset.id, idx++);
            }
            logitBias.sort((a, b) => orderMap.get(a.id) - orderMap.get(b.id));
            console.log('Logit bias reordered:', logitBias);
            saveSettingsDebounced();
        },
    });

    BIAS_CACHE.delete(containerSelector);
}

/**
 * Creates a new logit bias entry
 * @param {object[]} logitBias Array of logit bias objects
 * @param {string} containerSelector Container element ID
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'logitBias' implicitly has an 'any' type... Remove this comment to see the full error message
export function createNewLogitBiasEntry(logitBias, containerSelector) {
    const entry = { id: uuidv4(), text: '', value: 0 };
    logitBias.push(entry);
    BIAS_CACHE.delete(containerSelector);
    createLogitBiasListItem(entry, logitBias, containerSelector);
    saveSettingsDebounced();
}

/**
 * Creates a logit bias list item.
 * @param {object} entry Logit bias entry
 * @param {object[]} logitBias Array of logit bias objects
 * @param {string} containerSelector Container element ID
 * @param {HTMLElement} [listElement] Pre-selected list element
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
function createLogitBiasListItem(entry, logitBias, containerSelector, listElement = null) {
    const id = entry.id;
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    const template = /** @type {HTMLElement} */ (
        document.querySelector('#logit_bias_template .logit_bias_form')
    ).cloneNode(true);
    // @ts-expect-error TS(2339) FIXME: Property 'dataset' does not exist on type 'Node'.
    template.dataset.id = id;
    // @ts-expect-error TS(2339) FIXME: Property 'querySelector' does not exist on type 'N... Remove this comment to see the full error message
    const textInput = template.querySelector('.logit_bias_text');
    textInput.value = entry.text;
    textInput.addEventListener('input', function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        entry.text = this.value;
        BIAS_CACHE.delete(containerSelector);
        saveSettingsDebounced();
    });
    // @ts-expect-error TS(2339) FIXME: Property 'querySelector' does not exist on type 'N... Remove this comment to see the full error message
    const valueInput = template.querySelector('.logit_bias_value');
    valueInput.value = entry.value;
    valueInput.addEventListener('input', function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        entry.value = Number(this.value);
        BIAS_CACHE.delete(containerSelector);
        saveSettingsDebounced();
    });
    // @ts-expect-error TS(2339) FIXME: Property 'querySelector' does not exist on type 'N... Remove this comment to see the full error message
    template.querySelector('.logit_bias_remove').addEventListener('click', function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        this.closest('.logit_bias_form').remove();
        const index = logitBias.indexOf(entry);
        if (index > -1) {
            logitBias.splice(index, 1);
        }
        BIAS_CACHE.delete(containerSelector);
        saveSettingsDebounced();
    });

    // Use the passed list element to avoid redundant DOM queries
    const list =
        listElement || document.querySelector(containerSelector).querySelector('.logit_bias_list');
    list.prepend(template);
}

/**
 * Populate logit bias list from preset.
 * @param {object[]} biasPreset Bias preset
 * @param {number} tokenizerType Tokenizer type (see tokenizers.js)
 * @param {(bias: number, sequence: number[]) => object} getBiasObject Transformer function to create bias object
 * @returns {object[]} Array of logit bias objects
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'biasPreset' implicitly has an 'any' typ... Remove this comment to see the full error message
export function getLogitBiasListResult(biasPreset, tokenizerType, getBiasObject) {
    const result = [];

    for (const entry of biasPreset) {
        // Trim once and check length to avoid multiple string allocations and property accesses
        const text = entry?.text?.trim();

        // Skip empty lines or missing text
        if (!text) {
            continue;
        }

        // Verbatim text
        if (text.startsWith('{') && text.endsWith('}')) {
            const tokens = getTextTokens(tokenizerType, text.slice(1, -1));
            result.push(getBiasObject(entry.value, tokens));
        } else if (text.startsWith('[') && text.endsWith(']')) {
            // Raw token ids, JSON serialized
            try {
                const tokens = JSON.parse(text);

                if (Array.isArray(tokens) && tokens.every((t) => Number.isInteger(t))) {
                    result.push(getBiasObject(entry.value, tokens));
                } else {
                    throw new Error('Not an array of integers');
                }
            } catch (err) {
                console.log(`Failed to parse logit bias token list: ${text}`, err);
            }
        } else {
            // Text with a leading space
            const biasText = ` ${text}`;
            const tokens = getTextTokens(tokenizerType, biasText);
            result.push(getBiasObject(entry.value, tokens));
        }
    }
    return result;
}
