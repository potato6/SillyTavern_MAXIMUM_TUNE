import { saveSettingsDebounced } from '../script.js';
import { getTextTokens } from './tokenizers.js';
import { getSortableDelay, uuidv4 } from './utils.js';

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

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const list = $(document.querySelector(containerSelector).querySelector('.logit_bias_list'));
    list.empty();

    for (const entry of logitBias) {
        if (entry) {
            createLogitBiasListItem(entry, logitBias, containerSelector);
        }
    }

    // Check if a sortable instance exists
    if (list.sortable('instance') !== undefined) {
        // Destroy the instance
        list.sortable('destroy');
    }

    // Make the list sortable
    list.sortable({
        delay: getSortableDelay(),
        handle: '.drag-handle',
        stop: function () {
            // @ts-expect-error TS(7034) FIXME: Variable 'order' implicitly has type 'any[]' in so... Remove this comment to see the full error message
            const order = [];
            for (const child of list[0].children) {
                order.unshift(child.dataset.id);
            }
            // @ts-expect-error TS(7005) FIXME: Variable 'order' implicitly has an 'any[]' type.
            logitBias.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
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
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
function createLogitBiasListItem(entry, logitBias, containerSelector) {
    const id = entry.id;
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    const template = /** @type {HTMLElement} */(document.querySelector('#logit_bias_template .logit_bias_form')).cloneNode(true);
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
    document.querySelector(containerSelector).querySelector('.logit_bias_list').prepend(template);
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
        if (entry.text?.length > 0) {
            const text = entry.text.trim();

            // Skip empty lines
            if (text.length === 0) {
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

                    if (Array.isArray(tokens) && tokens.every(t => Number.isInteger(t))) {
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
    }
    return result;
}
