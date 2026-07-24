/** @type {CSSStyleSheet} */
let dynamicStyleSheet: CSSStyleSheet | null = null;
/** @type {CSSStyleSheet} */
let dynamicExtensionStyleSheet: CSSStyleSheet | null = null;

const PLACEHOLDER = ':__PLACEHOLDER__';

type WrapperCond = { type: string; conditionText: string };

/**
 * Builds a stable signature string for a chain of wrapper conditions so we can distinguish
 * identical selectors under different contexts (e.g., different @media queries)
 */
function getWrapperSignature(wrappers: WrapperCond[]): string {
    let signature = '';
    for (let i = 0; i < wrappers.length; i++) {
        if (i > 0) signature += ';';
        signature += wrappers[i]!.type + ':' + wrappers[i]!.conditionText;
    }
    return signature;
}

/**
 * Processes the CSS rules and separates selectors for hover and focus
 */
function processRules(
    rules: CSSRuleList,
    wrappers: WrapperCond[],
    hoverRules: { baseSelector: string; rule: CSSStyleRule; wrappers: WrapperCond[] }[],
    focusRules: Set<string>,
) {
    if (!rules) return;

    for (let i = 0; i < rules.length; i++) {
        const rule = rules[i]!;

        if (rule instanceof CSSImportRule) {
            let nextWrappers = wrappers;
            if (rule.media && rule.media.mediaText) {
                // Slice is faster than array spreading [...wrappers]
                nextWrappers = wrappers.slice();
                nextWrappers.push({ type: 'media', conditionText: rule.media.mediaText });
            }
            if (rule.styleSheet) {
                processRules(rule.styleSheet.cssRules, nextWrappers, hoverRules, focusRules);
            }
        } else if (rule instanceof CSSStyleRule) {
            const selectorText = rule.selectorText;

            // V8 Fast Path Bailout: Skip split/allocations entirely if neither state exists
            if (!selectorText.includes(':hover') && !selectorText.includes(':focus')) continue;

            const selectors = selectorText.split(',');
            for (let j = 0; j < selectors.length; j++) {
                const selector = selectors[j]!.trim();
                const isHover = selector.includes(':hover');
                const isFocus = selector.includes(':focus');

                if (isHover && isFocus) {
                    continue; // Rules containing both hover and focus are very specific and should never be automatically touched
                } else if (isHover) {
                    const baseSelector = selector.replace(/:hover/g, PLACEHOLDER).trim();
                    hoverRules.push({ baseSelector, rule, wrappers: wrappers.slice() });
                } else if (isFocus) {
                    const baseSelector = selector
                        .replace(/:focus(-within|-visible)?/g, PLACEHOLDER)
                        .trim();
                    focusRules.add(`${baseSelector}|${getWrapperSignature(wrappers)}`);
                }
            }
        } else if (rule instanceof CSSMediaRule) {
            const nextWrappers = wrappers.slice();
            nextWrappers.push({ type: 'media', conditionText: rule.conditionText });
            processRules(rule.cssRules, nextWrappers, hoverRules, focusRules);
        } else if (rule instanceof CSSSupportsRule) {
            const nextWrappers = wrappers.slice();
            nextWrappers.push({ type: 'supports', conditionText: rule.conditionText });
            processRules(rule.cssRules, nextWrappers, hoverRules, focusRules);
        } else if (window.CSSContainerRule && rule instanceof window.CSSContainerRule) {
            const nextWrappers = wrappers.slice();
            nextWrappers.push({ type: 'container', conditionText: rule.conditionText });
            processRules(rule.cssRules, nextWrappers, hoverRules, focusRules);
        }
    }
}

/**
 * An observer that will check if any new stylesheets are added to the head
 * @type {MutationObserver}
 */
const observer = new MutationObserver((mutations: MutationRecord[]) => {
    for (let i = 0; i < mutations.length; i++) {
        const mutation = mutations[i]!;
        if (mutation.type !== 'childList') continue;

        const addedNodes = mutation.addedNodes;
        for (let j = 0; j < addedNodes.length; j++) {
            const node = addedNodes[j]!;
            if (
                node instanceof HTMLLinkElement &&
                node.tagName === 'LINK' &&
                node.rel === 'stylesheet'
            ) {
                node.addEventListener('load', () => {
                    try {
                        applyDynamicFocusStyles(node.sheet);
                    } catch (e) {
                        console.warn('Failed to process new stylesheet:', e);
                    }
                });
            }
        }
    }
});

/**
 * Generates dynamic focus styles based on the given stylesheet, taking its hover styles as reference
 * @param {CSSStyleSheet} styleSheet - The stylesheet to process
 * @param {object} [options] - Optional configuration options
 * @param {boolean} [options.fromExtension] - Indicates if the styles are from an extension
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'styleSheet' implicitly has an 'any' typ... Remove this comment to see the full error message
function applyDynamicFocusStyles(styleSheet, { fromExtension = false } = {}) {
    /** @typedef {{ type: 'media'|'supports'|'container', conditionText: string }} WrapperCond */
    /** @type {{baseSelector: string, rule: CSSStyleRule, wrappers: WrapperCond[]}[]} */
    const hoverRules: { baseSelector: string; rule: CSSStyleRule; wrappers: WrapperCond[] }[] = [];
    /** @type {Set<string>} */
    const focusRules = new Set<string>();

    if (styleSheet && styleSheet.cssRules) {
        processRules(styleSheet.cssRules, [], hoverRules, focusRules);
    }

    /** @type {CSSStyleSheet} */
    let targetStyleSheet: CSSStyleSheet | null = null;

    for (let i = 0; i < hoverRules.length; i++) {
        const { baseSelector, rule, wrappers } = hoverRules[i]!;
        const signature = getWrapperSignature(wrappers);

        if (!focusRules.has(`${baseSelector}|${signature}`)) {
            targetStyleSheet ??= getDynamicStyleSheet({ fromExtension });

            const focusSelector = rule.selectorText.replace(/:hover/g, ':focus-visible');

            if (focusSelector.includes('::')) {
                continue;
            }

            let focusRule = `${focusSelector} { ${rule.style.cssText} }`;

            if (wrappers.length > 0) {
                // Reverse loop avoids the closure allocation created by reduceRight
                for (let w = wrappers.length - 1; w >= 0; w--) {
                    const wrapper = wrappers[w]!;
                    if (wrapper.type === 'media') {
                        focusRule = `@media ${wrapper.conditionText} { ${focusRule} }`;
                    } else if (wrapper.type === 'supports') {
                        focusRule = `@supports ${wrapper.conditionText} { ${focusRule} }`;
                    } else if (wrapper.type === 'container') {
                        focusRule = `@container ${wrapper.conditionText} { ${focusRule} }`;
                    }
                }
            }

            try {
                targetStyleSheet!.insertRule(focusRule, targetStyleSheet!.cssRules.length);
            } catch (e) {
                console.warn('Failed to insert focus rule:', e);
            }
        }
    }
}

/**
 * Retrieves the stylesheet that should be used for dynamic rules
 * @param {object} options - The options object
 * @param {boolean} [options.fromExtension] - Indicates whether the rules are coming from extensions
 * @returns {CSSStyleSheet} The dynamic stylesheet
 */
function getDynamicStyleSheet({ fromExtension = false } = {}) {
    if (fromExtension) {
        if (!dynamicExtensionStyleSheet) {
            const styleSheetElement = document.createElement('style');
            styleSheetElement.setAttribute('id', 'dynamic-extension-styles');
            document.head.appendChild(styleSheetElement);
            dynamicExtensionStyleSheet = styleSheetElement.sheet;
        }
        return dynamicExtensionStyleSheet;
    } else {
        if (!dynamicStyleSheet) {
            const styleSheetElement = document.createElement('style');
            styleSheetElement.setAttribute('id', 'dynamic-styles');
            document.head.appendChild(styleSheetElement);
            dynamicStyleSheet = styleSheetElement.sheet;
        }
        return dynamicStyleSheet;
    }
}

/**
 * Initializes dynamic styles for ST
 */
export function initDynamicStyles() {
    observer.observe(document.head, {
        childList: true,
        subtree: true,
    });

    const sheets = document.styleSheets;
    for (let i = 0; i < sheets.length; i++) {
        const sheet = sheets[i]!;
        try {
            const isExtension = sheet.href
                ? sheet.href.toLowerCase().includes('scripts/extensions')
                : false;
            applyDynamicFocusStyles(sheet, { fromExtension: isExtension });
        } catch (e) {
            console.warn('Failed to process stylesheet on initial load:', e);
        }
    }
}
