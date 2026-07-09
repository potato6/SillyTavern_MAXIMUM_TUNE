import { AutoCompleteNameResultBase } from './AutoCompleteNameResultBase.js';

export class AutoCompleteNameResult extends AutoCompleteNameResultBase {
    /**
     *
     * @param {string} text The whole text
     * @param {number} index Cursor index within text
     * @param {boolean} isSelect Whether autocomplete was triggered by selecting an autocomplete option
     * @returns {AutoCompleteSecondaryNameResult}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'text' implicitly has an 'any' type.
    getSecondaryNameAt(text, index, isSelect) {
        return null;
    }
}
