import { registerDebugFunction } from './power-user.js';

const storageKey = 'language';
const overrideLanguage = localStorage.getItem(storageKey);
const localeFile = String(
    overrideLanguage || navigator.language || (navigator as any).userLanguage || 'en',
).toLowerCase();
// @ts-expect-error TS(7034) FIXME: Variable 'langs' implicitly has type 'any' in some... Remove this comment to see the full error message
let langs;
// Don't change to let/const! It will break module loading.

// @ts-expect-error TS(7034) FIXME: Variable 'localeData' implicitly has type 'any' in... Remove this comment to see the full error message
let localeData;

/** @type {Set<string>|null} Array of translations keys if they should be tracked - if not tracked then null */
// @ts-expect-error TS(7034) FIXME: Variable 'trackMissingDynamicTranslate' implicitly... Remove this comment to see the full error message
let trackMissingDynamicTranslate = null;

export const getCurrentLocale = () => localeFile;

/**
 * Adds additional localization data to the current locale file.
 * @param {string} localeId Locale ID (e.g. 'fr-fr' or 'zh-cn')
 * @param {Record<string, string>} data Localization data to add
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'localeId' implicitly has an 'any' type.
export function addLocaleData(localeId, data) {
    // @ts-expect-error TS(7005) FIXME: Variable 'localeData' implicitly has an 'any' type... Remove this comment to see the full error message
    if (!localeData) {
        console.warn('Localization data not loaded yet. Additional data will not be added.');
        return;
    }

    if (localeId !== localeFile) {
        console.debug('Ignoring addLocaleData call for different locale', localeId);
        return;
    }

    for (const [key, value] of Object.entries(data)) {
        // Overrides for default locale data are not allowed
        if (!Object.hasOwn(localeData, key)) {
            localeData[key] = value;
        }
    }
}

/**
 * An observer that will check if any new i18n elements are added to the document
 * @type {MutationObserver}
 */
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE && node instanceof Element) {
                if (node.hasAttribute('data-i18n')) {
                    translateElement(node);
                }
                node.querySelectorAll('[data-i18n]').forEach((element) => {
                    translateElement(element);
                });
            }
        });
        if (mutation.attributeName === 'data-i18n' && mutation.target instanceof Element) {
            translateElement(mutation.target);
        }
    });
});

/**
 * Translates a template string with named arguments
 *
 * Uses the template literal with all values replaced by index placeholder for translation key.
 * @example
 * ```js
 * notyf.warning(t`Tag ${tagName} not found.`);
 * ```
 * Should be translated in the translation files as:
 * ```
 * Tag ${0} not found. -> Tag ${0} nicht gefunden.
 * ```
 * @param {TemplateStringsArray} strings - Template strings array
 * @param  {...any} values - Values for placeholders in the template string
 * @returns {string} Translated and formatted string
 */
export function t(strings: any, ...values: any) {
    const str = strings.reduce(
        (result: any, string: any, i: any) =>
            result + string + (values[i] !== undefined ? '\\${' + i + '}' : ''),
        '',
    );
    const translatedStr = translate(str);

    // Replace indexed placeholders with actual values
    // @ts-expect-error TS(7006) FIXME: Parameter 'match' implicitly has an 'any' type.
    return translatedStr.replace(/\$\{(\d+)\}/g, (match, index) => values[index]);
}

/**
 * Translates a given key or text
 *
 * If the translation is based on a key, that one is used to find a possible translation in the translation file.
 * The original text still has to be provided, as that is the default value being returned if no translation is found.
 *
 * For in-code text translation on a format string, using the template literal `t` is preferred.
 * @param {string} text - The text to translate
 * @param {string?} key - The key to use for translation. If not provided, text is used as the key.
 * @returns {string} - The translated text
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'text' implicitly has an 'any' type.
export function translate(text, key = null) {
    const translationKey = key || text;
    if (translationKey === null || translationKey === undefined) {
        console.trace('WARN: No translation key provided');
        return '';
    }
    // @ts-expect-error TS(7005) FIXME: Variable 'trackMissingDynamicTranslate' implicitly... Remove this comment to see the full error message
    if (trackMissingDynamicTranslate && localeData && !Object.hasOwn(localeData, translationKey)) {
        trackMissingDynamicTranslate.add(translationKey);
    }
    // @ts-expect-error TS(7005) FIXME: Variable 'localeData' implicitly has an 'any' type... Remove this comment to see the full error message
    return localeData?.[translationKey] || text;
}

/**
 * Fetches the locale data for the given language.
 * @param {string} language Language code
 * @returns {Promise<Record<string, string>>} Locale data
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'language' implicitly has an 'any' type.
async function getLocaleData(language) {
    const supportedLang = findLang(language);
    if (!supportedLang) {
        return {};
    }

    const data = await fetch(`./locales/${language}.json`).then((response) => {
        console.log(`Loading locale data from ./locales/${language}.json`);
        if (!response.ok) {
            return {};
        }
        return response.json();
    });

    return data;
}

/**
 * Gets a language object for the given language code.
 * @param {string} language Language code
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'language' implicitly has an 'any' type.
function findLang(language) {
    // @ts-expect-error TS(7005) FIXME: Variable 'langs' implicitly has an 'any' type.
    const supportedLang = langs.find((x) => x.lang === language);

    const isEn = language.startsWith('en'); // includes 'en', and more specific locales like 'en-us', 'en-au', etc
    if (!supportedLang && !isEn) {
        console.warn(`Unsupported language: ${language}`);
    }
    return supportedLang;
}

/**
 * Translates a given element based on its data-i18n attribute.
 * @param {Element} element The element to translate
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'element' implicitly has an 'any' type.
function translateElement(element) {
    const keys = element.getAttribute('data-i18n').split(';'); // Multi-key entries are ; delimited
    for (const key of keys) {
        const attributeMatch = key.match(/\[(\S+)\](.+)/); // [attribute]key
        if (attributeMatch) {
            // attribute-tagged key
            // @ts-expect-error TS(7005) FIXME: Variable 'localeData' implicitly has an 'any' type... Remove this comment to see the full error message
            const localizedValue = localeData?.[attributeMatch[2]];
            if (localizedValue || localizedValue === '') {
                element.setAttribute(attributeMatch[1], localizedValue);
            }
        } else {
            // No attribute tag, treat as 'text'
            // @ts-expect-error TS(7005) FIXME: Variable 'localeData' implicitly has an 'any' type... Remove this comment to see the full error message
            const localizedValue = localeData?.[key];
            if (localizedValue || localizedValue === '') {
                element.textContent = localizedValue;
            }
        }
    }
}

/**
 * Checks if the given locale is supported and not English.
 * @param {string} [locale] The locale to check (defaults to the current locale)
 * @returns {boolean} True if the locale is not English and supported
 */
function isSupportedNonEnglish(locale = null) {
    const lang = locale || localeFile;
    return lang && lang != 'en' && findLang(lang);
}

/**
 *
 */
async function getMissingTranslations() {
    /** @type {Array<{key: string, language: string, value: string}>} */
    const missingData = [];

    // @ts-expect-error TS(7005) FIXME: Variable 'trackMissingDynamicTranslate' implicitly... Remove this comment to see the full error message
    if (trackMissingDynamicTranslate) {
        missingData.push(
            ...Array.from(trackMissingDynamicTranslate).map((key) => ({
                key,
                language: localeFile,
                value: key,
            })),
        );
    }

    // Determine locales to search for untranslated strings
    // @ts-expect-error TS(7005) FIXME: Variable 'langs' implicitly has an 'any' type.
    const langsToProcess = isSupportedNonEnglish() ? [findLang(localeFile)] : langs;

    for (const language of langsToProcess) {
        const localeData = await getLocaleData(language.lang);
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            const keys = el.getAttribute('data-i18n').split(';'); // Multi-key entries are ; delimited
            for (const key of keys) {
                const attributeMatch = key.match(/\[(\S+)\](.+)/); // [attribute]key
                if (attributeMatch) {
                    // attribute-tagged key
                    const localizedValue = (localeData as any)?.[attributeMatch[2]!];
                    if (!localizedValue) {
                        missingData.push({
                            key,
                            language: language.lang,
                            value: String(el.getAttribute(attributeMatch[1]!)),
                        });
                    }
                } else {
                    // No attribute tag, treat as 'text'
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    const localizedValue = localeData?.[key];
                    if (!localizedValue) {
                        missingData.push({
                            key,
                            language: language.lang,
                            value: el.textContent?.trim() ?? '',
                        });
                    }
                }
            }
        });
    }

    // Remove duplicates
    const uniqueMissingData: any[] = [];
    for (const { key, language, value } of missingData) {
        if (
            !uniqueMissingData.some(
                (x) => x.key === key && x.language === language && x.value === value,
            )
        ) {
            uniqueMissingData.push({ key, language, value });
        }
    }

    // Sort by language, then key
    uniqueMissingData.sort(
        (a: any, b: any) => a.language.localeCompare(b.language) || a.key.localeCompare(b.key),
    );

    // Map to { language: { key: value } }
    const missingDataMap = Object.fromEntries(
        uniqueMissingData.map(({ key, value }) => [key, value]),
    );

    console.log(`Missing Translations (${uniqueMissingData.length}):`);
    console.table(uniqueMissingData);
    console.log(`Full map of missing data (${Object.keys(missingDataMap).length}):`);
    console.log(missingDataMap);

    // @ts-expect-error TS(7005) FIXME: Variable 'trackMissingDynamicTranslate' implicitly... Remove this comment to see the full error message
    if (trackMissingDynamicTranslate) {
        const trackMissingDynamicTranslateMap = Object.fromEntries(
            Array.from(trackMissingDynamicTranslate).map((key) => [key, key]),
        );
        console.log(
            `Dynamic translations missing (${Object.keys(trackMissingDynamicTranslateMap).length}):`,
        );
        console.log(trackMissingDynamicTranslateMap);
    }

    notyf.success(
        `Found ${uniqueMissingData.length} missing translations. See browser console for details.`,
    );
}

/**
 * Applies localization to a given root element or HTML string.
 * @param {Document|string} root The root element or HTML string to apply localization to
 * @returns {Document|string} Translated root, in the same format as the input (Document or HTML string)
 */
export function applyLocale(root = document) {
    // @ts-expect-error TS(7005) FIXME: Variable 'localeData' implicitly has an 'any' type... Remove this comment to see the full error message
    if (!localeData || Object.keys(localeData).length === 0) {
        return root;
    }

    const rootElement =
        root instanceof Document ? document : new DOMParser().parseFromString(root, 'text/html');

    rootElement.querySelectorAll('[data-i18n]').forEach(function (el) {
        translateElement(el);
    });

    if (root !== document) {
        return rootElement.body.innerHTML;
    }
}

/**
 *
 */
function addLanguagesToDropdown() {
    const uiLanguageSelects = document.querySelectorAll(
        '#ui_language_select, #onboarding_ui_language_select',
    );
    // @ts-expect-error TS(7005) FIXME: Variable 'langs' implicitly has an 'any' type.
    for (const langObj of langs) {
        for (const select of uiLanguageSelects) {
            const option = document.createElement('option');
            option.value = langObj.lang;
            option.innerText = langObj.display;
            select.appendChild(option);
        }
    }

    const selectedLanguage = localStorage.getItem(storageKey);
    if (selectedLanguage) {
        for (const select of uiLanguageSelects) {
            // @ts-expect-error TS(2339) FIXME: Property 'value' does not exist on type 'Element'.
            select.value = selectedLanguage;
        }
    }
}

/**
 *
 */
export async function initLocales() {
    langs = await fetch('/locales/lang.json').then((response) => response.json());
    localeData = await getLocaleData(localeFile);
    document.documentElement.lang = localeFile;
    applyLocale();
    addLanguagesToDropdown();
    const { updateSecretDisplay } = await import('./secrets.js');
    updateSecretDisplay();

    for (const select of document.querySelectorAll(
        '#ui_language_select, #onboarding_ui_language_select',
    )) {
        select.addEventListener('change', async function () {
            // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
            const language = String(this.value);

            if (language) {
                localStorage.setItem(storageKey, language);
            } else {
                localStorage.removeItem(storageKey);
            }

            location.reload();
        });
    }

    observer.observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-i18n'],
    });

    if (localStorage.getItem('trackDynamicTranslate') === 'true' && isSupportedNonEnglish()) {
        trackMissingDynamicTranslate = new Set();
    }

    registerDebugFunction(
        'getMissingTranslations',
        'Get missing translations',
        'Detects missing localization data in the current locale and dumps the data into the browser console. ' +
            'If the current locale is English, searches all other locales.',
        getMissingTranslations,
    );
    registerDebugFunction(
        'trackDynamicTranslate',
        'Track dynamic translation',
        'Toggles tracking of dynamic translations, which will be dumped into the missing translations translations too. ' +
            'This includes things translated via the t`...` function and translate(). It will only track strings translated <b>after</b> this is toggled on, ' +
            'and when they actually pop up, so refreshing the page and opening popups, etc, is needed. Will only track if the current locale is not English.',
        () => {
            const isTracking = localStorage.getItem('trackDynamicTranslate') !== 'true';
            localStorage.setItem('trackDynamicTranslate', isTracking ? 'true' : 'false');
            if (isTracking && isSupportedNonEnglish()) {
                trackMissingDynamicTranslate = new Set();
                notyf.success('Dynamic translation tracking enabled.');
            } else if (isTracking) {
                trackMissingDynamicTranslate = null;
                notyf.warning(
                    'Dynamic translation tracking enabled, but will not be tracked with locale English.',
                );
            } else {
                trackMissingDynamicTranslate = null;
                notyf.info('Dynamic translation tracking disabled.');
            }
        },
    );
    registerDebugFunction(
        'applyLocale',
        'Apply locale',
        'Reapplies the currently selected locale to the page.',
        applyLocale,
    );
}
