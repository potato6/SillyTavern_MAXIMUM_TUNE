import { AutoCompleteNameResultBase } from './AutoCompleteNameResultBase.js';
// @ts-expect-error TS(6133): 'AutoCompleteSecondaryNameResult' is declared but ... Remove this comment to see the full error message
import { AutoCompleteSecondaryNameResult } from './AutoCompleteSecondaryNameResult.js';


export class AutoCompleteNameResult extends AutoCompleteNameResultBase {
    /**
     *
     * @param {string} text The whole text
     * @param {number} index Cursor index within text
     * @param {boolean} isSelect Whether autocomplete was triggered by selecting an autocomplete option
     * @returns {AutoCompleteSecondaryNameResult}
     */
    // @ts-expect-error TS(6133): 'text' is declared but its value is never read.
    getSecondaryNameAt(text, index, isSelect) {
        return null;
    }
}
