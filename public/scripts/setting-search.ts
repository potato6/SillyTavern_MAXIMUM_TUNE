/**
 * Search for settings that match the search string and highlight them.
 */
async function searchSettings() {
    removeHighlighting(); // Remove previous highlights
    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const searchString = String($('#settingsSearch').val());
    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const searchableText = $('#user-settings-block-content'); // Get the HTML block
    if (searchString.trim() !== '') {
        highlightMatchingElements(searchableText[0], searchString); // Highlight matching elements
    }
}

/**
 * Check if the element is a child of a header element
 * @param {HTMLElement | Text | Document | Comment} element Settings block HTML element
 * @returns {boolean} True if the element is a child of a header element, false otherwise
 */
function isParentHeader(element) {
    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    return $(element).closest('h4, h3').length > 0;
}

/**
 * Recursively highlight elements that match the search string
 * @param {HTMLElement | Text | Document | Comment} element Settings block HTML element
 * @param {string} searchString Search string
 */
function highlightMatchingElements(element, searchString) {
    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(element).contents().each(function () {
        const isTextNode = this.nodeType === Node.TEXT_NODE;
        const isElementNode = this.nodeType === Node.ELEMENT_NODE;

        if (isTextNode && this.nodeValue.trim() !== '' && !isParentHeader(this)) {
            // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const parentElement = $(this).parent();
            const elementText = this.nodeValue;

            if (elementText.toLowerCase().includes(searchString.toLowerCase())) {
                parentElement.addClass('highlighted'); // Add CSS class to highlight matched elements
            }
        // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        } else if (isElementNode && !$(this).is('h4')) {
            highlightMatchingElements(this, searchString);
        }
    });
}

/**
 * Remove highlighting from previously highlighted elements.
 */
function removeHighlighting() {
    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('.highlighted').removeClass('highlighted');  // Remove CSS class from previously highlighted elements
}

/**
 *
 */
export function initSettingsSearch() {
    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#settingsSearch').on('input change', searchSettings);
}
