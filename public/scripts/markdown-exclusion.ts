import { power_user } from './power-user.js';
import { substituteParams } from '../script.js';

/**
 * Pre-processes text to exclude non-markdown strings from markdown parsing
 * @param {string} text The input text
 * @returns {string} The processed text
 */
export function processMarkdownExclusions(text) {
    if (!power_user) {
        console.log('markdown-exclusion: power_user wasn\'t found! Returning.');
        return text;
    }

    if (!power_user.markdown_escape_strings) {
        return text;
    }

    const escapedExclusions = substituteParams(power_user.markdown_escape_strings)
        .split(',')
        .filter((element) => element.length > 0)
        .map((element) => `(${element.split('').map((char) => `\\${char}`).join('')})`);

    if (escapedExclusions.length === 0) {
        return text;
    }

    const replaceRegex = new RegExp(`^(${escapedExclusions.join('|')})\n`, 'gm');
    return text.replace(replaceRegex, ((match) => match.replace(replaceRegex, `\u0000${match} \n`)));
}
