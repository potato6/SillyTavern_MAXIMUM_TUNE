import {
    extractTextFromHTML,
    extractTextFromMarkdown,
    extractTextFromPDF,
    extractTextFromEpub,
    extractTextFromOffice,
} from '../utils.js';

/**
 * @typedef {function} ConverterFunction
 * @param {File} file File object
 * @returns {Promise<string>} Converted file text
 */

/**
 * @type {Record<string, ConverterFunction>} File converters
 */
const converters: Record<string, (file: File) => Promise<string>> = {
    'application/pdf': extractTextFromPDF,
    'text/html': extractTextFromHTML,
    'text/markdown': extractTextFromMarkdown,
    'application/epub+zip': extractTextFromEpub,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        extractTextFromOffice,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': extractTextFromOffice,
    'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        extractTextFromOffice,
    'application/vnd.oasis.opendocument.text': extractTextFromOffice,
    'application/vnd.oasis.opendocument.presentation': extractTextFromOffice,
    'application/vnd.oasis.opendocument.spreadsheet': extractTextFromOffice,
};

/**
 * Finds a matching key in the converters object.
 * @param mimeType MIME type to find
 * @returns Matching MIME type key
 */
export function findConverterKey(mimeType: string): string | undefined {
    return Object.keys(converters).find((key) => mimeType.startsWith(key));
}

/**
 * Checks if a file type is convertible.
 * @param mimeType MIME type to check
 * @returns Whether the file type is convertible
 */
export function isConvertible(mimeType: string): boolean {
    return !!findConverterKey(mimeType);
}

/**
 * Gets the converter function for a file type.
 * @param mimeType MIME type to get converter for
 * @returns Converter function
 */
export function getConverter(mimeType: string): ((file: File) => Promise<string>) | undefined {
    const key = findConverterKey(mimeType);
    return key ? converters[key] : undefined;
}

/**
 * Registers a new file converter.
 * @param mimeType MIME type to register
 * @param converterFn Converter function
 */
export function registerFileConverter(
    mimeType: string,
    converterFn: (file: File) => Promise<string>,
): void {
    if (typeof mimeType !== 'string' || typeof converterFn !== 'function') {
        console.error('Invalid converter registration');
        return;
    }

    if (Object.keys(converters).includes(mimeType)) {
        console.error('Converter already registered');
        return;
    }

    converters[mimeType] = converterFn;
}
