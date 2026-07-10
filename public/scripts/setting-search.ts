/**
 * Search for settings that match the search string and highlight them.
 */
async function searchSettings() {
    removeHighlighting(); // Remove previous highlights
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const searchString = String(document.getElementById('settingsSearch').value);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const searchableText = document.getElementById('user-settings-block-content'); // Get the HTML block
    if (searchString.trim() !== '') {
        highlightMatchingElements(searchableText[0], searchString); // Highlight matching elements
    }
}

/**
 * Check if the element is a child of a header element
 * @param {HTMLElement | Text | Document | Comment} element Settings block HTML element
 * @returns {boolean} True if the element is a child of a header element, false otherwise
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'element' implicitly has an 'any' type.
function isParentHeader(element) {
    return element instanceof HTMLElement && element.closest('h4, h3') !== null;
}

/**
 * Recursively highlight elements that match the search string
 * @param {HTMLElement | Text | Document | Comment} element Settings block HTML element
 * @param {string} searchString Search string
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'element' implicitly has an 'any' type.
function highlightMatchingElements(element, searchString) {
    for (const node of element.childNodes) {
        const isTextNode = node.nodeType === Node.TEXT_NODE;
        const isElementNode = node.nodeType === Node.ELEMENT_NODE;

        if (isTextNode && node.nodeValue.trim() !== '' && !isParentHeader(node)) {
            const parentElement = node.parentElement;
            const elementText = node.nodeValue;

            if (elementText.toLowerCase().includes(searchString.toLowerCase())) {
                parentElement.classList.add('highlighted');
            }
        } else if (isElementNode && node.tagName !== 'H4') {
            highlightMatchingElements(node, searchString);
        }
    }
}

/**
 * Remove highlighting from previously highlighted elements.
 */
function removeHighlighting() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    document.querySelector('.highlighted').classList.remove('highlighted');  // Remove CSS class from previously highlighted elements
}

/**
 *
 */
export function initSettingsSearch() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document.getElementById('settingsSearch')).on('input change', searchSettings);
}
