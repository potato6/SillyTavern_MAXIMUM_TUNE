import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Buffer } from 'node:buffer';

import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { getConfigValue, color, setPermissionsSync, isValidUrl } from '../util.js';
import { write } from '../character-card-parser.js';
import { serverDirectory } from '../server-directory.js';
import { DEFAULT_AVATAR_PATH } from '../constants.js';
import type { UserDirectoryList } from '../users.js';

const contentDirectory = path.join(serverDirectory, 'default/content');
const scaffoldDirectory = path.join(serverDirectory, 'default/scaffold');
const contentIndexPath = path.join(contentDirectory, 'index.json');
const scaffoldIndexPath = path.join(scaffoldDirectory, 'index.json');

const WHITELIST_GENERIC_URL_DOWNLOAD_SOURCES = getConfigValue('whitelistImportDomains', []);
const USER_AGENT = 'SillyTavern';

/**
 * @typedef {object} ContentItem
 * @property {string} filename - File name of the content item
 * @property {string} type - Content type identifier
 * @property {string} [name] - Display name of the content item
 * @property {string|null} [folder] - Parent folder path
 */

/**
 * @typedef {string} ContentType
 * @enum {string}
 */
export const CONTENT_TYPES = {
    SETTINGS: 'settings',
    CHARACTER: 'character',
    SPRITES: 'sprites',
    BACKGROUND: 'background',
    WORLD: 'world',
    AVATAR: 'avatar',
    THEME: 'theme',
    WORKFLOW: 'workflow',
    KOBOLD_PRESET: 'kobold_preset',
    OPENAI_PRESET: 'openai_preset',
    NOVEL_PRESET: 'novel_preset',
    TEXTGEN_PRESET: 'textgen_preset',
    INSTRUCT: 'instruct',
    CONTEXT: 'context',
    MOVING_UI: 'moving_ui',
    QUICK_REPLIES: 'quick_replies',
    SYSPROMPT: 'sysprompt',
    REASONING: 'reasoning',
    ERROR_PAGE: 'error_page',
    STYLESHEET: 'stylesheet',
};

/**
 * @enum {string}
 */
export const CONTENT_SCOPE = {
    USER: 'user',
    GLOBAL: 'global',
};

/**
 * Gets the scope of a content type.
 * @param {CONTENT_TYPES} type Content type
 * @returns {CONTENT_SCOPE} Resolved content scope
 */
function getScopeByType(type: string) {
    const globalTypes = [CONTENT_TYPES.ERROR_PAGE, CONTENT_TYPES.STYLESHEET];
    return globalTypes.includes(type) ? CONTENT_SCOPE.GLOBAL : CONTENT_SCOPE.USER;
}

/**
 * Gets the default presets from the content directory.
 * @param {UserDirectoryList} directories User directories
 * @returns {object[]} Array of default presets
 */
export function getDefaultPresets(directories: UserDirectoryList) {
    try {
        const contentIndex = getContentIndex(CONTENT_SCOPE.USER);
        const presets = [];

        for (const contentItem of contentIndex) {
            if (
                contentItem.type.endsWith('_preset') ||
                ['instruct', 'context', 'sysprompt', 'reasoning'].includes(contentItem.type)
            ) {
                contentItem.name = path.parse(contentItem.filename).name;
                contentItem.folder = getUserTargetByType(contentItem.type, directories);
                presets.push(contentItem);
            }
        }

        return presets;
    } catch (err) {
        console.warn('Failed to get default presets', err);
        return [];
    }
}

/**
 * Gets a default JSON file from the content directory.
 * @param {string} filename Name of the file to get
 * @returns {object | null} JSON object or null if the file doesn't exist
 */
export function getDefaultPresetFile(filename: string) {
    try {
        const contentPath = path.join(contentDirectory, filename);

        if (!fs.existsSync(contentPath)) {
            return null;
        }

        const fileContent = fs.readFileSync(contentPath, 'utf8');
        return JSON.parse(fileContent);
    } catch (err) {
        console.warn(`Failed to get default file ${filename}`, err);
        return null;
    }
}

/**
 * Seeds content from a content index into a target location.
 * @param {ContentItem[]} contentIndex Content index
 * @param {string} contentLogPath Path to the content log file
 * @param {(type: string) => string | null} resolveTarget Function to resolve the target directory for a content type
 * @param {string[]} [forceCategories] List of categories to force check (even if content check is skipped)
 * @returns {boolean} Whether any content was added
 */
function seedContent(
    contentIndex: ContentItem[],
    contentLogPath: string,
    resolveTarget: (type: string) => string | null,
    forceCategories?: string[],
) {
    let anyContentAdded = false;
    const contentLog = getContentLog(contentLogPath);

    for (const contentItem of contentIndex) {
        if (
            contentLog.includes(contentItem.filename) &&
            !forceCategories?.includes(contentItem.type)
        ) {
            continue;
        }

        if (!contentItem.folder) {
            console.warn(`Content file ${contentItem.filename} has no parent folder`);
            continue;
        }

        const contentPath = path.join(contentItem.folder, contentItem.filename);

        if (!fs.existsSync(contentPath)) {
            console.warn(`Content file ${contentItem.filename} is missing`);
            continue;
        }

        const contentTarget = resolveTarget(contentItem.type);

        if (!contentTarget) {
            console.warn(
                `Content file ${contentItem.filename} has unknown type ${contentItem.type}`,
            );
            continue;
        }

        const basePath = path.parse(contentItem.filename).base;
        const targetPath = path.join(contentTarget, basePath);
        contentLog.push(contentItem.filename);

        if (fs.existsSync(targetPath)) {
            console.warn(`Content file ${contentItem.filename} already exists in ${contentTarget}`);
            continue;
        }

        fs.mkdirSync(contentTarget, { recursive: true });
        fs.cpSync(contentPath, targetPath, { recursive: true, force: false });
        setPermissionsSync(targetPath);
        console.info(`Content file ${contentItem.filename} copied to ${contentTarget}`);
        anyContentAdded = true;
    }

    writeFileAtomicSync(contentLogPath, contentLog.join('\n'));
    return anyContentAdded;
}

/**
 * Seeds content for a user.
 * @param {ContentItem[]} contentIndex Content index
 * @param {UserDirectoryList} directories User directories
 * @param {string[]} forceCategories List of categories to force check (even if content check is skipped)
 * @returns {Promise<boolean>} Whether any content was added
 */
async function seedContentForUser(
    contentIndex: ContentItem[],
    directories: UserDirectoryList,
    forceCategories: string[],
) {
    if (!fs.existsSync(directories.root)) {
        fs.mkdirSync(directories.root, { recursive: true });
    }

    const contentLogPath = path.join(directories.root, 'content.log');
    return seedContent(
        contentIndex,
        contentLogPath,
        (type: string) => getUserTargetByType(type, directories),
        forceCategories,
    );
}

/**
 * Seeds global content that is not user-specific, such as error pages.
 * @param {ContentItem[]} contentIndex Content index
 * @returns {Promise<boolean>} Whether any content was added
 */
async function seedGlobalContent(contentIndex: ContentItem[]) {
    const contentLogPath = path.join(globalThis.DATA_ROOT, 'content.log');
    return seedContent(contentIndex, contentLogPath, getGlobalTargetByType);
}

/**
 * Checks for new content and seeds it for all users.
 * @param {UserDirectoryList[]} directoriesList List of user directories
 * @param {string[]} forceCategories List of categories to force check (even if content check is skipped)
 * @returns {Promise<void>}
 */
export async function checkForNewContent(
    directoriesList: UserDirectoryList[],
    forceCategories: string[] = [],
) {
    try {
        const contentCheckSkip = getConfigValue('skipContentCheck', false, 'boolean');
        if (contentCheckSkip && forceCategories?.length === 0) {
            return;
        }

        const userContentIndex = getContentIndex(CONTENT_SCOPE.USER);
        const globalContentIndex = getContentIndex(CONTENT_SCOPE.GLOBAL);
        let anyContentAdded = false;

        const globalSeedResult = await seedGlobalContent(globalContentIndex);
        if (globalSeedResult) {
            anyContentAdded = true;
        }

        for (const directories of directoriesList) {
            const userSeedResult = await seedContentForUser(
                userContentIndex,
                directories,
                forceCategories,
            );

            if (userSeedResult) {
                anyContentAdded = true;
            }
        }

        if (anyContentAdded && !contentCheckSkip && forceCategories?.length === 0) {
            console.info();
            console.info(
                `${color.blue("If you don't want to receive content updates in the future, set")} ${color.yellow('skipContentCheck')} ${color.blue('to true in the config.yaml file.')}`,
            );
            console.info();
        }
    } catch (err) {
        console.error('Content check failed', err);
    }
}

/**
 * Gets combined content index from the content and scaffold directories.
 * @param {CONTENT_SCOPE} scope Scope of content to get
 * @returns {ContentItem[]} Array of content index
 */
function getContentIndex(scope = CONTENT_SCOPE.USER) {
    const result = [];

    if (fs.existsSync(scaffoldIndexPath)) {
        const scaffoldIndexText = fs.readFileSync(scaffoldIndexPath, 'utf8');
        const scaffoldIndex = JSON.parse(scaffoldIndexText);
        if (Array.isArray(scaffoldIndex)) {
            scaffoldIndex.forEach((item) => {
                item.folder = scaffoldDirectory;
                item.scope = getScopeByType(item.type);
            });
            result.push(...scaffoldIndex);
        }
    }

    if (fs.existsSync(contentIndexPath)) {
        const contentIndexText = fs.readFileSync(contentIndexPath, 'utf8');
        const contentIndex = JSON.parse(contentIndexText);
        if (Array.isArray(contentIndex)) {
            contentIndex.forEach((item) => {
                item.folder = contentDirectory;
                item.scope = getScopeByType(item.type);
            });
            result.push(...contentIndex);
        }
    }

    return result.filter((item) => item.scope === scope);
}

/**
 * Gets content by type and format.
 * @param {string} type Type of content
 * @param {'json'|'string'|'raw'} format Format of content
 * @param {CONTENT_SCOPE} scope Scope of content to get
 * @returns {string[]|Buffer[]} Array of content
 */
export function getContentOfType(
    type: string,
    format: 'json' | 'string' | 'raw',
    scope = CONTENT_SCOPE.USER,
) {
    const contentIndex = getContentIndex(scope);
    const indexItems = contentIndex.filter((item) => item.type === type && item.folder);
    const files = [];
    for (const item of indexItems) {
        if (!item.folder) {
            continue;
        }
        try {
            const filePath = path.join(item.folder, item.filename);
            const fileContent = fs.readFileSync(filePath);
            switch (format) {
                case 'json':
                    files.push(JSON.parse(fileContent.toString()));
                    break;
                case 'string':
                    files.push(fileContent.toString());
                    break;
                case 'raw':
                    files.push(fileContent);
                    break;
            }
        } catch {
            // Ignore errors
        }
    }
    return files;
}

/**
 * Gets the target directory for the specified asset type.
 * @param {ContentType} type Asset type
 * @param {UserDirectoryList} directories User directories
 * @returns {string | null} Target directory
 */
export function getUserTargetByType(type: string, directories: UserDirectoryList) {
    switch (type) {
        case CONTENT_TYPES.SETTINGS:
            return directories.root;
        case CONTENT_TYPES.CHARACTER:
            return directories.characters;
        case CONTENT_TYPES.SPRITES:
            return directories.characters;
        case CONTENT_TYPES.BACKGROUND:
            return directories.backgrounds;
        case CONTENT_TYPES.WORLD:
            return directories.worlds;
        case CONTENT_TYPES.AVATAR:
            return directories.avatars;
        case CONTENT_TYPES.THEME:
            return directories.themes;
        case CONTENT_TYPES.WORKFLOW:
            return directories.comfyWorkflows;
        case CONTENT_TYPES.KOBOLD_PRESET:
            return directories.koboldAI_Settings;
        case CONTENT_TYPES.OPENAI_PRESET:
            return directories.openAI_Settings;
        case CONTENT_TYPES.NOVEL_PRESET:
            return directories.novelAI_Settings;
        case CONTENT_TYPES.TEXTGEN_PRESET:
            return directories.textGen_Settings;
        case CONTENT_TYPES.INSTRUCT:
            return directories.instruct;
        case CONTENT_TYPES.CONTEXT:
            return directories.context;
        case CONTENT_TYPES.MOVING_UI:
            return directories.movingUI;
        case CONTENT_TYPES.QUICK_REPLIES:
            return directories.quickreplies;
        case CONTENT_TYPES.SYSPROMPT:
            return directories.sysprompt;
        case CONTENT_TYPES.REASONING:
            return directories.reasoning;
        default:
            return null;
    }
}

/**
 * Gets the target directory for global content types.
 * @param {CONTENT_TYPES} type Content type
 * @returns {string | null} Target directory
 */
export function getGlobalTargetByType(type: string) {
    switch (type) {
        case CONTENT_TYPES.ERROR_PAGE:
            return path.join(globalThis.DATA_ROOT, '_errors');
        case CONTENT_TYPES.STYLESHEET:
            return path.join(globalThis.DATA_ROOT, '_css');
        default:
            return null;
    }
}

/**
 * Gets the content log from the content log file.
 * @param {string} contentLogPath Path to the content log file
 * @returns {string[]} Array of content log lines
 */
function getContentLog(contentLogPath: string) {
    if (!fs.existsSync(contentLogPath)) {
        return [];
    }

    const contentLogText = fs.readFileSync(contentLogPath, 'utf8');
    return contentLogText.split('\n');
}

/**
 * Downloads a lorebook from Chub.
 * @param {string} id - Chub lorebook identifier
 * @returns {Promise<{buffer: Buffer, fileName: string, fileType: string}>}
 */
async function downloadChubLorebook(id: string) {
    const [lorebooks, creatorName, projectName] = id.split('/') as [string, string, string];
    const result = await fetch(
        `https://api.chub.ai/api/${lorebooks}/${creatorName}/${projectName}`,
        {
            method: 'GET',
            headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        },
    );

    if (!result.ok) {
        const text = await result.text();
        console.error('Chub returned error', result.statusText, text);
        throw new Error('Failed to fetch lorebook metadata');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- API response shape unknown
    const metadata = (await result.json()) as any;
    const projectId = metadata.node?.id;

    if (!projectId) {
        throw new Error('Project ID not found in lorebook metadata');
    }

    const downloadUrl = `https://api.chub.ai/api/v4/projects/${projectId}/repository/files/raw%252Fsillytavern_raw.json/raw`;
    const downloadResult = await fetch(downloadUrl, {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    });

    if (!downloadResult.ok) {
        const text = await downloadResult.text();
        console.error('Chub returned error', downloadResult.statusText, text);
        throw new Error('Failed to download lorebook');
    }

    const name = projectName;
    const buffer = Buffer.from(await downloadResult.arrayBuffer());
    const fileName = `${sanitize(name)}.json`;
    const fileType = downloadResult.headers.get('content-type');

    return { buffer, fileName, fileType };
}

/**
 * Downloads a character from Chub.
 * @param {string} id - Chub character identifier
 * @returns {Promise<{buffer: Buffer, fileName: string, fileType: string}>}
 */
async function downloadChubCharacter(id: string) {
    const [creatorName, projectName] = id.split('/');
    const result = await fetch(
        `https://api.chub.ai/api/characters/${creatorName}/${projectName}?full=true`,
        {
            method: 'GET',
            headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        },
    );

    if (!result.ok) {
        const text = await result.text();
        console.error('Chub returned error', result.statusText, text);
        throw new Error('Failed to fetch character metadata');
    }

    const metadata = (await result.json()) as {
        node: { definition: Record<string, unknown>; topics: string[]; max_res_url?: string };
    };
    const { definition, topics } = metadata.node;

    /** @type {TavernCardV2} */
    const characterCard = {
        data: {
            name: definition.name,
            description: definition.personality,
            personality: definition.tavern_personality,
            scenario: definition.scenario,
            first_mes: definition.first_message,
            mes_example: definition.example_dialogs,
            creator_notes: definition.description,
            system_prompt: definition.system_prompt,
            post_history_instructions: definition.post_history_instructions,
            alternate_greetings: definition.alternate_greetings,
            tags: topics,
            creator: creatorName,
            character_version: '',
            character_book: definition.embedded_lorebook,
            extensions: definition.extensions,
        },
        spec: 'chara_card_v2',
        spec_version: '2.0',
    };

    const defaultAvatarPath = path.join(serverDirectory, DEFAULT_AVATAR_PATH);
    const defaultAvatarBuffer = fs.readFileSync(defaultAvatarPath);

    let imageBuffer = defaultAvatarBuffer;

    const imageUrl = metadata.node?.max_res_url;

    if (imageUrl) {
        const downloadResult = await fetch(imageUrl);
        if (downloadResult.ok) {
            imageBuffer = Buffer.from(await downloadResult.arrayBuffer());
        }
    }

    const buffer = write(imageBuffer, JSON.stringify(characterCard));
    const fileName = `${sanitize(String(characterCard.data.name))}.png`;
    const fileType = 'image/png';

    return { buffer, fileName, fileType };
}

/**
 * Downloads a character card from the Pygsite.
 * @param {string} id UUID of the character
 * @returns {Promise<{buffer: Buffer, fileName: string, fileType: string}>}
 */
async function downloadPygmalionCharacter(id: string) {
    const result = await fetch(`https://server.pygmalion.chat/api/export/character/${id}/v2`);

    if (!result.ok) {
        const text = await result.text();
        console.error('Pygsite returned error', result.status, text);
        throw new Error('Failed to download character');
    }

    const jsonData = (await result.json()) as { character?: Record<string, unknown> };
    const characterData = jsonData?.character;

    if (!characterData || typeof characterData !== 'object') {
        console.error('Pygsite returned invalid character data', jsonData);
        throw new Error('Failed to download character');
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic nested API response access
        const avatarUrl = (characterData as Record<string, any>)?.data?.avatar;

        if (!avatarUrl) {
            console.error('Pygsite character does not have an avatar', characterData);
            throw new Error('Failed to download avatar');
        }

        const avatarResult = await fetch(avatarUrl);
        const avatarBuffer = Buffer.from(await avatarResult.arrayBuffer());

        const cardBuffer = write(avatarBuffer, JSON.stringify(characterData));

        return {
            buffer: cardBuffer,
            fileName: `${sanitize(id)}.png`,
            fileType: 'image/png',
        };
    } catch (e) {
        console.error('Failed to download avatar, using JSON instead', e);
        return {
            buffer: Buffer.from(JSON.stringify(jsonData)),
            fileName: `${sanitize(id)}.json`,
            fileType: 'application/json',
        };
    }
}

/**
 *
 * @param {string} str
 * @returns { { id: string, type: "character" | "lorebook" } | null }
 */
function parseChubUrl(str: string) {
    const splitStr = str.split('/');
    const length = splitStr.length;

    if (length < 2) {
        return null;
    }

    let domainIndex = -1;

    splitStr.forEach((part: string, index: number) => {
        if (
            part === 'www.chub.ai' ||
            part === 'chub.ai' ||
            part === 'www.characterhub.org' ||
            part === 'characterhub.org'
        ) {
            domainIndex = index;
        }
    });

    const lastTwo = domainIndex !== -1 ? splitStr.slice(domainIndex + 1) : splitStr;

    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    const firstPart = lastTwo[0].toLowerCase();

    if (firstPart === 'characters' || firstPart === 'lorebooks') {
        const type = firstPart === 'characters' ? 'character' : 'lorebook';
        const id = type === 'character' ? lastTwo.slice(1).join('/') : lastTwo.join('/');
        return {
            id: id,
            type: type,
        };
    } else if (length === 2) {
        return {
            id: lastTwo.join('/'),
            type: 'character',
        };
    }

    return null;
}

/**
 * Downloads a character from JannyAI.
 * @param {string} uuid - UUID of the character
 * @returns {Promise<{buffer: Buffer, fileName: string, fileType: string}>}
 */
async function downloadJannyCharacter(uuid: string) {
    // This endpoint is being guarded behind Bot Fight Mode of Cloudflare
    // So hosted ST on Azure/AWS/GCP/Collab might get blocked by IP
    // Should work normally on self-host PC/Android
    const result = await fetch('https://api.jannyai.com/api/v1/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            characterId: uuid,
        }),
    });

    if (result.ok) {
        /** @type {{ status: string; downloadUrl: string }} */
        const downloadResult = (await result.json()) as { status: string; downloadUrl: string };
        if (downloadResult.status === 'ok') {
            const imageResult = await fetch(downloadResult.downloadUrl);
            const buffer = Buffer.from(await imageResult.arrayBuffer());
            const fileName = `${sanitize(uuid)}.png`;
            const fileType = imageResult.headers.get('content-type');

            return { buffer, fileName, fileType };
        } else {
            console.error('Janny failed to download', downloadResult);
        }
    } else {
        console.error('Janny returned error', result.statusText, await result.text());
    }

    throw new Error('Failed to download character');
}

/**
 * Downloads a character card from AICharactersCards.com (AICC) API.
 * @param {string} id - AICC character identifier
 * @returns {Promise<{buffer: Buffer, fileName: string, fileType: string}>}
 */
async function downloadAICCCharacter(id: string) {
    const apiURL = `https://aicharactercards.com/wp-json/pngapi/v1/image/${id}`;
    try {
        const response = await fetch(apiURL);
        if (!response.ok) {
            throw new Error(`Failed to download character: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type') || 'image/png'; // Default to 'image/png' if header is missing
        const buffer = Buffer.from(await response.arrayBuffer());
        const fileName = `${sanitize(id)}.png`; // Assuming PNG, but adjust based on actual content or headers

        return {
            buffer: buffer,
            fileName: fileName,
            fileType: contentType,
        };
    } catch (error) {
        console.error('Error downloading character:', error);
        throw error;
    }
}

/**
 * Parses an aicharactercards URL to extract the path.
 * @param {string} url URL to parse
 * @returns {string | null} AICC path
 */
function parseAICC(url: string) {
    try {
        if (isValidUrl(url)) {
            const urlObj = new URL(url);
            // Split the path and remove empty strings caused by trailing slashes
            const parts = urlObj.pathname.split('/').filter(Boolean);
            if (parts.length >= 2) {
                // Always grab the last two segments (author/character)
                return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
            }
        } else {
            // Fallback for relative paths or raw "author/character" strings
            const parts = url.split('/').filter(Boolean);
            if (parts.length >= 2) {
                return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
            }
        }
    } catch (e) {
        console.error('Error parsing AICC URL:', e);
    }
    return null;
}

/**
 * Download character card from generic url.
 * @param {string} url - URL of the character card
 * @returns {Promise<{buffer: Buffer, fileName: string, fileType: string} | null>}
 */
async function downloadGenericPng(url: string) {
    try {
        const result = await fetch(url);

        if (result.ok) {
            const buffer = Buffer.from(await result.arrayBuffer());
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            let fileName = sanitize(result.url.split('?')[0].split('/').toReversed()[0]);
            const contentType = result.headers.get('content-type') || 'image/png'; //yoink it from AICC function lol

            // The `importCharacter()` function detects the MIME (content-type) of the file
            // using its file extension. The problem is that not all third-party APIs serve
            // their cards with a `.png` extension. To support more third-party sites,
            // dynamically append the `.png` extension to the filename if it doesn't
            // already have a file extension.
            if (contentType === 'image/png') {
                const ext = fileName.match(/\.(\w+)$/); // Same regex used by `importCharacter()`
                if (!ext) {
                    fileName += '.png';
                }
            }

            return {
                buffer: buffer,
                fileName: fileName,
                fileType: contentType,
            };
        }
    } catch (error) {
        console.error('Error downloading file: ', error);
        throw error;
    }
    return null;
}

/**
 * Parse Risu Realm URL to extract the UUID.
 * @param {string} url Risu Realm URL
 * @returns {string | null} UUID of the character
 */
function parseRisuUrl(url: string) {
    // Example: https://realm.risuai.net/character/7adb0ed8d81855c820b3506980fb40f054ceef010ff0c4bab73730c0ebe92279
    // or https://realm.risuai.net/character/7adb0ed8-d818-55c8-20b3-506980fb40f0
    const pattern = /^https?:\/\/realm\.risuai\.net\/character\/([a-f0-9-]+)\/?$/i;
    const match = url.match(pattern);
    return match ? match[1] : null;
}

/**
 * Download RisuAI character card
 * @param {string} uuid UUID of the character
 * @returns {Promise<{buffer: Buffer, fileName: string, fileType: string}>}
 */
async function downloadRisuCharacter(uuid: string) {
    const result = await fetch(
        `https://realm.risuai.net/api/v1/download/png-v3/${uuid}?non_commercial=true`,
    );

    if (!result.ok) {
        const text = await result.text();
        console.error('RisuAI returned error', result.statusText, text);
        throw new Error('Failed to download character');
    }

    const buffer = Buffer.from(await result.arrayBuffer());
    const fileName = `${sanitize(uuid)}.png`;
    const fileType = 'image/png';

    return { buffer, fileName, fileType };
}

/**
 * Check if the given string is a valid Perchance UUID.
 * @param {string} uuid UUID string to check
 * @returns {boolean} True if the UUID is valid, false otherwise
 */
function isPerchanceUUID(uuid: string) {
    if (!uuid) {
        return false;
    }

    //example: Personality_Advisor~6903e991c90fd1dba52c036d917e99c6.gz
    //charactername~uuid.gz

    const uuidRegex = /^\w+~[a-f0-9]{32}\.gz$/;
    return uuidRegex.test(uuid);
}

/**
 * Parse Perchance URL to extract the character slug.
 * @param {string} url Perchance character URL
 * @returns {string} Slug of the character
 */
function parsePerchanceSlug(url: string) {
    // Example: https://perchance.org/ai-character-chat?data=Personality_Advisor~6903e991c90fd1dba52c036d917e99c6.gz
    // or: Personality_Advisor~6903e991c90fd1dba52c036d917e99c6.gz
    return url?.split('~')[1] || '';
}

/**
 * Download Perchance character card
 * @param {string} slug Slug of the character
 * @returns {Promise<{buffer: Buffer, fileName: string, fileType: string} | null>}
 */
async function downloadPerchanceCharacter(slug: string) {
    // example of slug
    // 6903e991c90fd1dba52c036d917e99c6.gz
    const perchanceBaseURL = 'https://user.uploads.dev/file';

    try {
        const charURL = `${perchanceBaseURL}/${slug}`;
        console.log('Downloading Perchance character from URL:', charURL);
        const result = await fetch(charURL, {
            headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
        });

        //decompress gzipped content
        if (result.ok) {
            const perchanceChar = await extractPerchanceCharacterFromGz(result);

            const avatarUrl = perchanceChar.avatar?.url;

            //check if avatarURL is a base64 of any image type
            const isAvatarBase64 = avatarUrl && avatarUrl.startsWith('data:image/');

            const charData = {
                name: perchanceChar.name || 'Unnamed Perchance Character',
                first_mes: '',
                tags: [],
                description: perchanceChar.roleInstruction || '',
                creator: perchanceChar.metaTitle || '',
                creator_notes: perchanceChar.metaDescription || '',
                alternate_greetings: [],
                character_version: '',
                mes_example: '',
                post_history_instructions: '',
                system_prompt: '',
                scenario: '',
                personality: perchanceChar.reminderMessage || '',
                extensions: {
                    perchance_data: {
                        slug: slug,
                        char_url: charURL,
                        uuid: perchanceChar.uuid || null,
                        avatar_url: isAvatarBase64 ? null : avatarUrl || null,
                        folder_path: perchanceChar.folderPath || null,
                        folder_name: perchanceChar.folderName || null,
                        custom_data: perchanceChar.customData || {},
                    },
                },
            };

            const avatarBuffer = await fetchPerchanceAvatar(avatarUrl, isAvatarBase64);

            // Character card
            const buffer = write(
                avatarBuffer,
                JSON.stringify({
                    spec: 'chara_card_v2',
                    spec_version: '2.0',
                    data: charData,
                }),
            );

            const fileName = `${charData.name}.png`;
            const fileType = 'image/png';

            return { buffer, fileName, fileType };
        }
    } catch (error) {
        console.error('Error downloading character:', error);
        throw error;
    }
    return null;
}

/**
 * Extracts Perchance character data from a gzipped response.
 * @param {Response} result Fetch response containing gzipped character data
 * @returns {Promise<object>} Parsed Perchance character data
 * @throws {Error} If the character data is invalid or missing required fields
 */
async function extractPerchanceCharacterFromGz(result: Response) {
    const compressedBuffer = await result.arrayBuffer();
    const decompressedBuffer = zlib.gunzipSync(compressedBuffer);

    // inside the gz file, there is a file of the same name without extensions, but it is a json file

    if (!decompressedBuffer || decompressedBuffer.length === 0) {
        console.error('Perchance character data is empty or invalid');
        throw new Error('Failed to download character: Invalid Perchance character data');
    }

    // Parse the decompressed JSON
    const perchanceCharData = JSON.parse(decompressedBuffer.toString());

    if (!perchanceCharData?.addCharacter) {
        console.error('Perchance character data is missing addCharacter field', perchanceCharData);
        throw new Error('Failed to download character: Invalid Perchance character data');
    }

    return perchanceCharData.addCharacter;
}

/**
 * Fetches the avatar from Perchance URL or uses a default avatar if not available.
 * @param {string} avatarUrl URL of the avatar
 * @param {boolean} isAvatarBase64 Flag indicating if the avatar URL is a base64 string
 * @returns {Promise<Buffer>} Buffer containing the avatar image
 */
async function fetchPerchanceAvatar(avatarUrl: string, isAvatarBase64: boolean) {
    const defaultAvatarPath = path.join(serverDirectory, DEFAULT_AVATAR_PATH);
    const defaultAvatarBuffer = fs.readFileSync(defaultAvatarPath);

    if (!avatarUrl || (!isAvatarBase64 && !isValidUrl(avatarUrl))) {
        console.warn(
            'Perchance character does not have an avatar, it is not base64, or it is an invalid url, using default avatar',
        );
        return defaultAvatarBuffer;
    }

    if (isAvatarBase64) {
        // check if avatarUrl is a png
        const isPng = avatarUrl.startsWith('data:image/png;base64,');
        const base64 = avatarUrl.split(',')[1];
        // @ts-expect-error TS(2769) FIXME: No overload matches this call.
        const buffer = Buffer.from(base64, 'base64');

        if (isPng) {
            return buffer;
        } else {
            // use Bun.image to convert the base64 to PNG if it's not PNG
            console.debug('Perchance character avatar is not PNG, converting to PNG...');
            return await new Bun.Image(buffer).png().buffer();
        }
    }

    // Fetch avatar from URL
    console.log('Fetching Perchance avatar from URL:', avatarUrl);
    const avatarResponse = await fetch(avatarUrl, { headers: { 'User-Agent': USER_AGENT } });

    if (avatarResponse.ok) {
        const avatarContentType = avatarResponse.headers.get('content-type');
        const avatarBuffer = Buffer.from(await avatarResponse.arrayBuffer());

        if (avatarContentType === 'image/png') {
            return avatarBuffer;
        } else {
            console.debug(
                `Perchance character avatar is not PNG: ${avatarContentType}. Converting to PNG...`,
            );

            // use Bun.image to convert the image to PNG if it's not PNG
            return await new Bun.Image(avatarBuffer).png().buffer();
        }
    }

    console.error('Failed to fetch Perchance avatar:', avatarResponse.statusText);
    const isPerchanceOrgFileUploader = avatarUrl.includes('https://user-uploads.perchance.org');

    if (isPerchanceOrgFileUploader) {
        console.warn(
            'Files from https://user-uploads.perchance.org are sometimes blocked by CloudFlare, try reuploading it in https://perchance.org/upload to get the new link from https://user-uploads.dev instead.',
        );
    }

    console.warn(
        'You can also download the avatar manually and assign it to the character:',
        avatarUrl,
    );
    return defaultAvatarBuffer;
}

/**
 * Extracts a UUID from a URL.
 * @param {string} url - URL to extract UUID from
 * @returns {string | null} UUID of the character
 */
function getUuidFromUrl(url: string) {
    // Extract UUID from URL
    const uuidRegex = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/;
    const matches = url.match(uuidRegex);

    // Check if UUID is found
    const uuid = matches ? matches[0] : null;
    return uuid;
}

/**
 * Filter to get the domain host of a url instead of a blanket string search.
 * @param {string} url URL to strip
 * @returns {string} Domain name
 */
export function getHostFromUrl(url: string) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch {
        return '';
    }
}

/**
 * Checks if host is part of generic download source whitelist.
 * @param {string} host Host to check
 * @returns {boolean} If the host is on the whitelist.
 */
export function isHostWhitelisted(host: string) {
    return WHITELIST_GENERIC_URL_DOWNLOAD_SOURCES.includes(host);
}

export const router = new Elysia({ prefix: '/api/content' })
    .post('/importURL', async (context) => {
        const { set, body } = context;
        const bodyAny = body as Record<string, unknown>;

        if (!bodyAny.url) {
            set.status = 400;
            return;
        }

        try {
            const url = bodyAny.url as string;
            const host = getHostFromUrl(url);
            let result;
            let type;

            const isChub = host.includes('chub.ai') || host.includes('characterhub.org');
            const isJannnyContent = host.includes('janitorai');
            const isPygmalionContent = host.includes('pygmalion.chat');
            const isAICharacterCardsContent = host.includes('aicharactercards.com');
            const isRisu = host.includes('realm.risuai.net');
            const isPerchance = host.includes('perchance.org');
            const isGeneric = isHostWhitelisted(host);

            if (isPygmalionContent) {
                const uuid = getUuidFromUrl(url);
                if (!uuid) {
                    set.status = 404;
                    return;
                }

                type = 'character';
                result = await downloadPygmalionCharacter(uuid);
            } else if (isJannnyContent) {
                const uuid = getUuidFromUrl(url);
                if (!uuid) {
                    set.status = 404;
                    return;
                }

                type = 'character';
                result = await downloadJannyCharacter(uuid);
            } else if (isAICharacterCardsContent) {
                const AICCParsed = parseAICC(url);
                if (!AICCParsed) {
                    set.status = 404;
                    return;
                }
                type = 'character';
                result = await downloadAICCCharacter(AICCParsed);
            } else if (isChub) {
                const chubParsed = parseChubUrl(url);
                type = chubParsed?.type;

                if (chubParsed?.type === 'character') {
                    console.info('Downloading chub character:', chubParsed.id);
                    result = await downloadChubCharacter(chubParsed.id);
                } else if (chubParsed?.type === 'lorebook') {
                    console.info('Downloading chub lorebook:', chubParsed.id);
                    result = await downloadChubLorebook(chubParsed.id);
                } else {
                    set.status = 404;
                    return;
                }
            } else if (isRisu) {
                const uuid = parseRisuUrl(url);
                if (!uuid) {
                    set.status = 404;
                    return;
                }

                type = 'character';
                result = await downloadRisuCharacter(uuid);
            } else if (isPerchance) {
                const perchanceSlug = parsePerchanceSlug(url);
                if (!perchanceSlug) {
                    set.status = 404;
                    return;
                }
                type = 'character';
                result = await downloadPerchanceCharacter(perchanceSlug);
            } else if (isGeneric) {
                console.info('Downloading from generic url:', url);
                type = 'character';
                result = await downloadGenericPng(url);
            } else {
                console.error(
                    `Received an import for "${getHostFromUrl(url)}", but site is not whitelisted. This domain must be added to the config key "whitelistImportDomains" to allow import from this source.`,
                );
                set.status = 404;
                return;
            }

            if (!result) {
                set.status = 404;
                return;
            }

            if (result.fileType) set.headers['Content-Type'] = result.fileType;
            set.headers['Content-Disposition'] =
                `attachment; filename="${encodeURI(result.fileName)}"`;
            set.headers['X-Custom-Content-Type'] = type as string;
            return new Response(result.buffer);
        } catch (error) {
            console.error('Importing custom content failed', error);
            set.status = 500;
            return;
        }
    })
    .post('/importUUID', async (context) => {
        const { set, body } = context;
        const bodyAny = body as Record<string, unknown>;

        if (!bodyAny.url) {
            set.status = 400;
            return;
        }

        try {
            const uuid = bodyAny.url as string;
            let result;

            const isJannny = uuid.includes('_character');
            const isPygmalion = !isJannny && uuid.length == 36;
            const isAICC = uuid.startsWith('AICC/');
            const isPerchance = isPerchanceUUID(uuid);
            const uuidType = uuid.includes('lorebook') ? 'lorebook' : 'character';

            if (isPygmalion) {
                console.info('Downloading Pygmalion character:', uuid);
                result = await downloadPygmalionCharacter(uuid);
            } else if (isJannny) {
                console.info('Downloading Janitor character:', uuid.split('_')[0]);
                result = await downloadJannyCharacter(uuid.split('_')[0] ?? '');
            } else if (isAICC) {
                const [, author, card] = uuid.split('/');
                console.info('Downloading AICC character:', `${author}/${card}`);
                result = await downloadAICCCharacter(`${author}/${card}`);
            } else if (isPerchance) {
                console.info('Downloading Perchance character:', uuid);
                const parsedUuid = parsePerchanceSlug(uuid);
                result = await downloadPerchanceCharacter(parsedUuid);
            } else {
                if (uuidType === 'character') {
                    console.info('Downloading chub character:', uuid);
                    result = await downloadChubCharacter(uuid);
                } else if (uuidType === 'lorebook') {
                    console.info('Downloading chub lorebook:', uuid);
                    result = await downloadChubLorebook(uuid);
                } else {
                    set.status = 404;
                    return;
                }
            }

            if (!result) {
                throw new Error('Failed to download content');
            }

            if (result.fileType) set.headers['Content-Type'] = result.fileType;
            set.headers['Content-Disposition'] =
                `attachment; filename="${encodeURI(result.fileName)}"`;
            set.headers['X-Custom-Content-Type'] = type as string;
            return new Response(result.buffer);
        } catch (error) {
            console.error('Importing custom content failed', error);
            set.status = 500;
            return;
        }
    });
