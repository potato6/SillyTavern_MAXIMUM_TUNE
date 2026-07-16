/**
 * Message tags module — applies character tags as data attributes on chat message divs.
 */

import { tags, tag_map } from './store/tagStore.js';

/**
 * Function to apply character tags to message divs when rendering the chat
 * @param {object} options Options for applying character tags
 * @param {number|number[]} [options.mesIds] An id or array of message IDs to filter by.
 * If empty, all messages will be processed.
 * @returns {void}
 * @description This function iterates through the chat messages and applies character tags
 */
export function applyCharacterTagsToMessageDivs({ mesIds = [] as number[] } = {}) {
    try {
        const messagesFilter = buildMessagesFilter(mesIds);
        const chatEl = document.querySelector('#chat');
        const messages = chatEl ? [...chatEl.children].filter(el => el.matches(messagesFilter)) : [];

        // Clear existing tags
        messages.forEach(element => {
            for (const attr of [...element.attributes]) {
                if (attr.name.startsWith('data-char-tag-') || attr.name === 'data-char-tags') {
                    element.removeAttribute(attr.name);
                }
            }
        });

        const tagsList = tags, characterTagData = tag_map;

        if (!tagsList?.length || !characterTagData) {
            return;
        }

        const tagNamesById = tagsList.reduce((acc, tag) => {
            acc[tag.id] = tag.name;
            return acc;
        }, {});

        const characterTagsCache = new Map();

        // Iterate each message div
        messages.forEach(element => {
            const $this = element;
            const avatarFileName = extractCharacterAvatar(element.querySelector('.avatar img')?.getAttribute('src'));

            if (!avatarFileName) {
                return;
            }

            let tagsForCharacter = characterTagsCache.get(avatarFileName);

            // If tags are NOT in the cache, compute and store them
            if (!tagsForCharacter) {
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                const tagIds = characterTagData[avatarFileName];
                if (tagIds?.length) {
                    const tagNames = tagIds
                        // @ts-expect-error TS(7006) FIXME: Parameter 'id' implicitly has an 'any' type.
                        .map(id => tagNamesById[id])
                        .filter(Boolean);

                    if (tagNames.length) {
                        tagsForCharacter = {
                            tagNames,
                            joinedTagNames: tagNames
                                // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
                                .map(name => name?.replace(/,/g, ' ')) // replace commas with spaces to avoid issues with tag names containing commas
                                .join(','),
                        };
                        // Add the newly computed tags to the cache
                        characterTagsCache.set(avatarFileName, tagsForCharacter);
                    }
                }
            }

            // If we have tags (either from cache or newly computed), apply them
            if (tagsForCharacter) {
                applyTags($this, tagsForCharacter);
            }
        });
    } catch (error) {
        console.error('Error applying character tags to message divs:', error);
    }
}

/**
 * Builds a jQuery selector string to filter messages by their IDs.
 * @param {number|number[]} mesIds - An id or array of message IDs to filter by.
 * @returns {string} A jQuery selector string that matches messages with the specified IDs.
 * If mesIds is empty, it returns '.mes' to select all messages.
 * @example
 * buildMessagesFilter([1, 5]); // Returns '.mes[mesid="1"],.mes[mesid="5"]'
 * buildMessagesFilter([]); // Returns '.mes'
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'mesIds' implicitly has an 'any' type.
function buildMessagesFilter(mesIds) {
    const allMessages = '.mes';

    if (!mesIds) {
        return allMessages; // If no mesIds provided, select all messages
    }

    const mesIdsArray = Array.isArray(mesIds) ? mesIds : [mesIds];

    if (mesIdsArray?.length) {
        // Create a valid jQuery selector for multiple attribute values.
        // Example output: '.mes[mesid="1"],.mes[mesid="5"]'
        return mesIdsArray.map(id => `.mes[mesid="${id}"]`).join(',');
    }

    // If mesIds is empty, select all messages.
    return allMessages;
}

/**
 * Helper function to apply all necessary data attributes to a DOM element.
 * @param {JQuery<HTMLElement>} $element - The jQuery object for the message div.
 * @param {object} tagData - An object containing tag information.
 * @param {string[]} tagData.tagNames - An array of tag names.
 * @param {string} tagData.joinedTagNames - A comma-separated string of tag names.
 */
// @ts-expect-error TS(7006) FIXME: Parameter '$element' implicitly has an 'any' type.
function applyTags($element, tagData) {
    $element.setAttribute('data-char-tags', tagData.joinedTagNames);
    // @ts-expect-error TS(7006) FIXME: Parameter 'tagName' implicitly has an 'any' type.
    tagData.tagNames.forEach(tagName => {
        const normalizedTagName = normalizeTagName(tagName);

        if (!normalizedTagName) {
            return; // Skip empty tag names
        }

        $element.setAttribute(`data-char-tag-${normalizedTagName}`, '');
    });
}

/**
 * Normalizes a tag name by trimming, converting spaces to hyphens, replacing accented characters,
 * removing special characters, and converting to lowercase.
 * @param {string} name The tag name to normalize.
 * @returns {string} The normalized tag name.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
function normalizeTagName(name) {
    if (!name?.trim()) {
        return '';
    }

    // Normalize the tag name by trimming, converting spaces to hyphens, replacing accented characters, removing special characters, and converting to lowercase
    return name.trim()
        .normalize('NFD') // Normalize accented characters
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks
        .replace(/[^a-zA-Z0-9\s_-]/g, '') // Remove special characters except spaces, underscores, and hyphens
        .replace(/[\s_]+/g, '-') // Replace spaces and underscores with hyphens
        .toLowerCase();
}

/**
 * Extracts the character avatar file name from the avatar source URL.
 * @param {string} avatarSrc The source URL of the character avatar.
 * @returns {string|null} The normalized avatar file name, or null if the input is falsy or doesn't contain a valid file name.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'avatarSrc' implicitly has an 'any' type... Remove this comment to see the full error message
function extractCharacterAvatar(avatarSrc) {
    if (!avatarSrc) {
        return null;
    }

    try {
        const url = new URL(avatarSrc, window.location.origin);
        return url?.searchParams.get('file');
    } catch (error) {
        console.error('Unable to parse character avatar using avatarSrc', avatarSrc, error);
        return null;
    }
}
