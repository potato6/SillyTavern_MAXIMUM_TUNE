import { canUseNegativeLookbehind } from './utils.js';

/**
 * Post-processes HTML to replace words surrounded by singular underscores with <em> tags.
 * Markdown-it handles emphasis natively, but this provides explicit control.
 * @param {string} html The HTML output
 * @returns {string} The processed HTML
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'html' implicitly has an 'any' type.
export function processMarkdownUnderscores(html) {
    try {
        if (!canUseNegativeLookbehind()) {
            return html;
        }

        return html.replace(
            new RegExp('(<code(?:\\s+[^>]*)?>[\\s\\S]*?<\\/code>|<style(?:\\s+[^>]*)?>[\\s\\S]*?<\\/style>)|\\b(?<!_)_(?!_)(.*?)(?<!_)_(?!_)\\b', 'gi'),
            // @ts-expect-error TS(7006) FIXME: Parameter 'match' implicitly has an 'any' type.
            function (match, tagContent, italicContent) {
                if (tagContent) {
                    return match;
                } else if (italicContent) {
                    return '<em>' + italicContent + '</em>';
                }
                return match;
            },
        );
    } catch (e) {
        console.error('Error in markdown-underscore processing:', e);
        return html;
    }
}
