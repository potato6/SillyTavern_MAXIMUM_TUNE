import path from 'node:path';
import fs, { promises as fsPromises } from 'node:fs';
import { Buffer } from 'node:buffer';

import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import yaml from 'yaml';
import { get, set, unset, isUndefined, forEach, isPlainObject, cloneDeep } from 'es-toolkit/compat';

import storage from 'node-persist';

import { AVATAR_WIDTH, AVATAR_HEIGHT, DEFAULT_AVATAR_PATH } from '../constants.js';
import {
    default as validateAvatarUrlMiddleware,
    getFileNameValidationFunction,
    forbiddenRegExp,
} from '../middleware/validateFileName.js';
import {
    deepMerge,
    humanizedDateTime,
    tryParse,
    MemoryLimitedMap,
    getConfigValue,
    mutateJsonString,
    clientRelativePath,
    getUniqueName,
    sanitizeSafeCharacterReplacements,
} from '../util.js';
import { TavernCardValidator } from '../validator/TavernCardValidator.js';
import { parse, read, write } from '../character-card-parser.js';
import { readWorldInfoFile } from './worldinfo.js';
import { invalidateThumbnail } from './thumbnails.js';
import { importRisuSprites } from './sprites.js';
import { getUserDirectories } from '../users.js';
import { getChatInfo } from './chats.js';
import { ByafParser } from '../byaf.js';
import { CharXParser, persistCharXAssets } from '../charx.js';
import cacheBuster from '../middleware/cacheBuster.js';

// With 100 MB limit it would take roughly 3000 characters to reach this limit
const memoryCacheCapacity = getConfigValue('performance.memoryCacheCapacity', '100mb');
const memoryCache = new MemoryLimitedMap(memoryCacheCapacity);
// Some Android devices require tighter memory management
const isAndroid = process.platform === 'android';
// Use shallow character data for the character list
const useShallowCharacters = !!getConfigValue('performance.lazyLoadCharacters', false, 'boolean');
const useDiskCache = !!getConfigValue('performance.useDiskCache', true, 'boolean');

class DiskCache {
    /**
     * @type {string}
     * @readonly
     */
    static DIRECTORY = 'characters';

    /**
     * @type {number}
     * @readonly
     */
    static SYNC_INTERVAL = 5 * 60 * 1000;

    /** @type {import('node-persist').LocalStorage} */
    // @ts-expect-error TS(7008) FIXME: Member '#instance' implicitly has an 'any' type.
    #instance;

    /** @type {NodeJS.Timeout} */
    // @ts-expect-error TS(7008) FIXME: Member '#syncInterval' implicitly has an 'any' typ... Remove this comment to see the full error message
    #syncInterval;

    /**
     * Queue of user handles to sync.
     * @type {Set<string>}
     * @readonly
     */
    syncQueue = new Set();

    /**
     * Path to the cache directory.
     * @returns {string} Path to the cache directory
     */
    get cachePath() {
        return path.join(globalThis.DATA_ROOT, '_cache', DiskCache.DIRECTORY);
    }

    /**
     * Returns the list of hashed keys in the cache.
     * @returns {string[]} List of hashed key filenames
     */
    get hashedKeys() {
        return fs.readdirSync(this.cachePath);
    }

    /**
     * Processes the synchronization queue.
     * @returns {Promise<void>}
     */
    async #syncCacheEntries() {
        try {
            if (!useDiskCache || this.syncQueue.size === 0) {
                return;
            }

            // @ts-expect-error TS(2345) FIXME: Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
            const directories = [...this.syncQueue].map((entry) => getUserDirectories(entry));
            this.syncQueue.clear();

            await this.verify(directories);
        } catch (error) {
            console.error('Error while synchronizing cache entries:', error);
        }
    }

    /**
     * Gets the disk cache instance.
     * @returns {Promise<import('node-persist').LocalStorage>} Disk cache instance
     */
    async instance() {
        if (this.#instance) {
            return this.#instance;
        }

        this.#instance = storage.create({
            dir: this.cachePath,
            ttl: false,
            forgiveParseErrors: true,
            expiredInterval: 0,
            maxFileDescriptors: 100,
        } as Record<string, unknown>);
        await this.#instance.init();
        this.#syncInterval = setInterval(
            this.#syncCacheEntries.bind(this),
            DiskCache.SYNC_INTERVAL,
        );
        return this.#instance;
    }

    /**
     * Verifies disk cache size and prunes it if necessary.
     * @param {import('../users.js').UserDirectoryList[]} directoriesList List of user directories
     * @returns {Promise<void>}
     */
    async verify(directoriesList: import('../users.js').UserDirectoryList[]) {
        try {
            if (!useDiskCache) {
                return;
            }

            const cache = await this.instance();
            const validKeys = new Set();
            for (const dir of directoriesList) {
                const files = fs.readdirSync(dir.characters, { withFileTypes: true });
                for (const file of files.filter(
                    (f) => f.isFile() && path.extname(f.name) === '.png',
                )) {
                    const filePath = path.join(dir.characters, file.name);
                    const cacheKey = getCacheKey(filePath);
                    validKeys.add(path.parse(cache.getDatumPath(cacheKey)).base);
                }
            }
            for (const key of this.hashedKeys) {
                if (!validKeys.has(key)) {
                    await cache.removeItem(key);
                }
            }
        } catch (error) {
            console.error('Error while verifying disk cache:', error);
        }
    }

    dispose() {
        if (this.#syncInterval) {
            clearInterval(this.#syncInterval);
        }
    }
}

export const diskCache = new DiskCache();

/**
 * Gets the cache key for the specified image file.
 * @param {string} inputFile - Path to the image file
 * @returns {string} - Cache key
 */
function getCacheKey(inputFile: string) {
    if (fs.existsSync(inputFile)) {
        const stat = fs.statSync(inputFile);
        return `${inputFile}-${stat.mtimeMs}`;
    }

    return inputFile;
}

/**
 * Reads the character card from the specified image file.
 * @param {string} inputFile - Path to the image file
 * @param {string} inputFormat - 'png'
 * @returns {Promise<string | undefined>} - Character card data
 */
async function readCharacterData(inputFile: string, inputFormat = 'png') {
    const cacheKey = getCacheKey(inputFile);
    if (memoryCache.has(cacheKey)) {
        return memoryCache.get(cacheKey);
    }
    if (useDiskCache) {
        try {
            const cache = await diskCache.instance();
            const cachedData = await cache.getItem(cacheKey);
            if (cachedData) {
                return cachedData;
            }
        } catch (error) {
            console.warn('Error while reading from disk cache:', error);
        }
    }

    const result = await parse(inputFile, inputFormat);
    if (!isAndroid) {
        memoryCache.set(cacheKey, result);
    }
    if (useDiskCache) {
        try {
            const cache = await diskCache.instance();
            await cache.setItem(cacheKey, result);
        } catch (error) {
            console.warn('Error while writing to disk cache:', error);
        }
    }
    return result;
}

/**
 * Writes the character card to the specified image file.
 * @param {string|Buffer} inputFile - Path to the image file or image buffer
 * @param {string} data - Character card data
 * @param {string} outputFile - Target image file name
 * @param {import('express').Request} request - Express request obejct
 * @param {Crop|undefined} crop - Crop parameters
 * @returns {Promise<boolean>} - True if the operation was successful
 */
async function writeCharacterData(
    inputFile: string | Buffer,
    data: string,
    outputFile: string,
    request: import('express').Request,
    crop: Crop | undefined = undefined,
) {
    try {
        // Reset the cache
        for (const key of memoryCache.keys()) {
            if (Buffer.isBuffer(inputFile)) {
                break;
            }
            if (key.startsWith(inputFile)) {
                memoryCache.delete(key);
                break;
            }
        }
        if (useDiskCache && !Buffer.isBuffer(inputFile)) {
            diskCache.syncQueue.add(request.user.profile.handle);
        }
        /**
         * Read the image, resize, and save it as a PNG into the buffer.
         * @returns {Promise<Buffer>} Image buffer
         */
        async function getInputImage() {
            try {
                if (Buffer.isBuffer(inputFile)) {
                    return await parseImageBuffer(inputFile, crop);
                }

                return await tryReadImage(inputFile, crop);
            } catch (error) {
                const message = Buffer.isBuffer(inputFile)
                    ? 'Failed to read image buffer.'
                    : `Failed to read image: ${inputFile}.`;
                console.warn(message, 'Using a fallback image.', error);
                return await fs.promises.readFile(DEFAULT_AVATAR_PATH);
            }
        }

        const inputImage = await getInputImage();

        // Get the chunks
        const outputImage = write(inputImage, data);
        const outputImagePath = path.join(request.user.directories.characters, `${outputFile}.png`);

        writeFileAtomicSync(outputImagePath, outputImage);
        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
}

/**
 * @typedef {object} Crop
 * @property {number} x X-coordinate
 * @property {number} y Y-coordinate
 * @property {number} width Width
 * @property {number} height Height
 * @property {boolean} want_resize Resize the image to the standard avatar size
 */

/**
 * Applies avatar crop and resize operations to an image using sharp.
 * @param {Buffer} buffer Image buffer
 * @param {Crop|undefined} [crop] Crop parameters
 * @returns {Promise<Buffer>} Processed image buffer
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Crop = any;

export async function applyAvatarCropResize(buffer: Buffer, crop: Crop | undefined) {
    const metadata = await new Bun.Image(buffer).metadata();
    let finalWidth = metadata.width ?? 0;
    let finalHeight = metadata.height ?? 0;

    let pipeline = new Bun.Image(buffer);

    // Apply crop if defined
    if (
        typeof crop === 'object' &&
        [crop.x, crop.y, crop.width, crop.height].every((x) => typeof x === 'number')
    ) {
        const width = Math.round(crop.width);
        const height = Math.round(crop.height);
        // Resize to approximate the crop region
        pipeline = pipeline.resize(width, height);
        // Apply standard resize if requested
        if ((crop as any).want_resize) {
            finalWidth = AVATAR_WIDTH;
            finalHeight = AVATAR_HEIGHT;
        } else {
            finalWidth = width;
            finalHeight = height;
        }
    }

    pipeline = pipeline.resize(finalWidth, finalHeight);
    return await pipeline.png().buffer();
}

/**
 * Parses an image buffer and applies crop if defined.
 * @param {Buffer} buffer Buffer of the image
 * @param {Crop|undefined} [crop] Crop parameters
 * @returns {Promise<Buffer>} Image buffer
 */
async function parseImageBuffer(buffer: Buffer, crop: Crop | undefined) {
    return await applyAvatarCropResize(buffer, crop);
}

/**
 * Reads an image file and applies crop if defined.
 * @param {string} imgPath Path to the image file
 * @param {Crop|undefined} crop Crop parameters
 * @returns {Promise<Buffer>} Image buffer
 */
async function tryReadImage(imgPath: string, crop: Crop | undefined) {
    try {
        const buffer = fs.readFileSync(imgPath);
        return await applyAvatarCropResize(buffer, crop);
    } catch (error) {
        // If it's an unsupported type of image (APNG) - just read the file as buffer
        console.error(`Failed to read image: ${imgPath}`, error);
        return fs.readFileSync(imgPath);
    }
}

/**
 * calculateChatSize - Calculates the total chat size for a given character.
 * @param  {string} charDir The directory where the chats are stored.
 * @returns { {chatSize: number, dateLastChat: number} }         The total chat size.
 */
const calculateChatSize = (charDir: string) => {
    let chatSize = 0;
    let dateLastChat = 0;

    if (fs.existsSync(charDir)) {
        const chats = fs.readdirSync(charDir);
        if (Array.isArray(chats) && chats.length) {
            for (const chat of chats) {
                const chatStat = fs.statSync(path.join(charDir, chat));
                chatSize += chatStat.size;
                dateLastChat = Math.max(dateLastChat, chatStat.mtimeMs);
            }
        }
    }

    return { chatSize, dateLastChat };
};

// Calculate the total string length of the data object
const calculateDataSize = (data: unknown) => {
    return data !== null && typeof data === 'object'
        ? Object.values(data as Record<string, unknown>).reduce(
              (acc: number, val: unknown) => acc + String(val).length,
              0,
          )
        : 0;
};

/**
 * Only get fields that are used to display the character list.
 * @param {object} character Character object
 * @returns {{shallow: true, [key: string]: unknown}} Shallow character
 */
const toShallow = (character: Record<string, unknown>) => {
    return {
        shallow: true,
        name: character.name,
        avatar: character.avatar,
        chat: character.chat,
        fav: character.fav,
        date_added: character.date_added,
        create_date: character.create_date,
        date_last_chat: character.date_last_chat,
        chat_size: character.chat_size,
        data_size: character.data_size,
        tags: character.tags,
        data: {
            name: get(character, 'data.name', ''),
            character_version: get(character, 'data.character_version', ''),
            creator: get(character, 'data.creator', ''),
            creator_notes: get(character, 'data.creator_notes', ''),
            tags: get(character, 'data.tags', []),
            extensions: {
                fav: get(character, 'data.extensions.fav', false),
                world: get(character, 'data.extensions.world', ''),
            },
        },
    };
};

/**
 * processCharacter - Process a given character, read its data and calculate its statistics.
 * @param  {string} item The name of the character.
 * @param  {import('../users.js').UserDirectoryList} directories User directories
 * @param  {object} options Options for the character processing
 * @param  {boolean} options.shallow If true, only return the core character's metadata
 * @returns {Promise<object>}     A Promise that resolves when the character processing is done.
 */
const processCharacter = async (
    item: string,
    directories: import('../users.js').UserDirectoryList,
    { shallow }: { shallow: boolean },
) => {
    try {
        const imgFile = path.join(directories.characters, item);
        const imgData = await readCharacterData(imgFile);
        if (imgData === undefined) throw new Error('Failed to read character file');

        const jsonObject = getCharaCardV2(JSON.parse(imgData), directories, false);
        jsonObject.avatar = item;
        const character = jsonObject;
        character.json_data = imgData;
        const charStat = fs.statSync(path.join(directories.characters, item));
        character.date_added = charStat.ctimeMs;
        character.create_date =
            jsonObject.create_date || new Date(Math.round(charStat.ctimeMs)).toISOString();
        const chatsDirectory = path.join(directories.chats, item.replace('.png', ''));

        const { chatSize, dateLastChat } = calculateChatSize(chatsDirectory);
        character.chat_size = chatSize;
        character.date_last_chat = dateLastChat;
        character.data_size = calculateDataSize(jsonObject?.data);
        return shallow ? toShallow(character) : character;
    } catch (err) {
        console.error(`Could not process character: ${item}`);

        if (err instanceof SyntaxError) {
            console.error(`${item} does not contain a valid JSON object.`);
        } else {
            console.error('An unexpected error occurred: ', err);
        }

        return {
            date_added: 0,
            date_last_chat: 0,
            chat_size: 0,
        };
    }
};

/**
 * Convert a character object to Spec V2 format.
 * @param {object} jsonObject Character object
 * @param {import('../users.js').UserDirectoryList} directories User directories
 * @param {boolean} hoistDate Will set the chat and create_date fields to the current date if they are missing
 * @returns {object} Character object in Spec V2 format
 */
function getCharaCardV2(
    jsonObject: Record<string, unknown>,
    directories: import('../users.js').UserDirectoryList,
    hoistDate = true,
) {
    if (jsonObject.spec === undefined) {
        jsonObject = convertToV2(jsonObject, directories);

        if (hoistDate && !jsonObject.create_date) {
            jsonObject.create_date = new Date().toISOString();
        }
    } else {
        jsonObject = readFromV2(jsonObject);
    }
    return jsonObject;
}

/**
 * Convert a character object to Spec V2 format.
 * @param {object} char Character object
 * @param {import('../users.js').UserDirectoryList} directories User directories
 * @returns {object} Character object in Spec V2 format
 */
function convertToV2(
    char: Record<string, unknown>,
    directories: import('../users.js').UserDirectoryList,
) {
    // Simulate incoming data from frontend form
    const result = charaFormatData(
        {
            json_data: JSON.stringify(char),
            ch_name: char.name,
            description: char.description,
            personality: char.personality,
            scenario: char.scenario,
            first_mes: char.first_mes,
            mes_example: char.mes_example,
            creator_notes: char.creatorcomment,
            talkativeness: char.talkativeness,
            fav: char.fav,
            creator: char.creator,
            tags: char.tags,
            depth_prompt_prompt: char.depth_prompt_prompt,
            depth_prompt_depth: char.depth_prompt_depth,
            depth_prompt_role: char.depth_prompt_role,
        },
        directories,
    );

    result.chat = char.chat ?? `${char.name} - ${humanizedDateTime()}`;
    result.create_date = char.create_date;

    return result;
}

/**
 * Removes fields that are not meant to be shared.
 * @param {Record<string, unknown>} char Character object
 */
function unsetPrivateFields(char: Record<string, unknown>) {
    set(char, 'fav', false);
    set(char, 'data.extensions.fav', false);
    unset(char, 'chat');
}

/**
 * Reads character data in V2 format and backfills missing extension fields.
 * @param {Record<string, unknown>} char Character object
 * @returns {Record<string, unknown>} Character object with backfilled fields
 */
function readFromV2(char: Record<string, unknown>) {
    if (isUndefined(char.data)) {
        console.warn(`Char ${char.name} has Spec v2 data missing`);
        return char;
    }

    // If 'json_data' was already saved, don't let it propagate
    unset(char, 'json_data');

    const fieldMappings = {
        name: 'name',
        description: 'description',
        personality: 'personality',
        scenario: 'scenario',
        first_mes: 'first_mes',
        mes_example: 'mes_example',
        talkativeness: 'extensions.talkativeness',
        fav: 'extensions.fav',
        tags: 'tags',
    };

    forEach(fieldMappings, (v2Path, charField) => {
        //console.info(`Migrating field: ${charField} from ${v2Path}`);
        const v2Value = get(char.data, v2Path);
        if (isUndefined(v2Value)) {
            let defaultValue = undefined;

            // Backfill default values for missing ST extension fields
            if (v2Path === 'extensions.talkativeness') {
                defaultValue = 0.5;
            }

            if (v2Path === 'extensions.fav') {
                defaultValue = false;
            }

            if (!isUndefined(defaultValue)) {
                //console.warn(`Spec v2 extension data missing for field: ${charField}, using default value: ${defaultValue}`);
                char[charField] = defaultValue;
            } else {
                console.warn(
                    `Char ${char.name} has Spec v2 data missing for unknown field: ${charField}`,
                );
                return;
            }
        }
        if (
            !isUndefined(char[charField]) &&
            !isUndefined(v2Value) &&
            String(char[charField]) !== String(v2Value)
        ) {
            console.warn(
                `Char ${char.name} has Spec v2 data mismatch with Spec v1 for field: ${charField}`,
                char[charField],
                v2Value,
            );
        }
        char[charField] = v2Value;
    });

    char.chat = char.chat ?? `${char.name} - ${humanizedDateTime()}`;

    return char;
}

/**
 * Format character data to Spec V2 format.
 * @param {Record<string, unknown>} data Character data
 * @param {import('../users.js').UserDirectoryList} directories User directories
 * @returns {Record<string, unknown>} Formatted character object
 */
function charaFormatData(
    data: Record<string, unknown>,
    directories: import('../users.js').UserDirectoryList,
) {
    // This is supposed to save all the foreign keys that ST doesn't care about
    // @ts-expect-error TS(2345) FIXME: Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
    const char = tryParse(data.json_data) || {};

    // Prevent erroneous 'json_data' recursive saving
    unset(char, 'json_data');

    // Checks if data.alternate_greetings is an array, a string, or neither, and acts accordingly. (expected to be an array of strings)
    const getAlternateGreetings = (data: Record<string, unknown>) => {
        if (Array.isArray(data.alternate_greetings)) return data.alternate_greetings;
        if (typeof data.alternate_greetings === 'string') return [data.alternate_greetings];
        return [];
    };

    // Spec V1 fields
    set(char, 'name', data.ch_name);
    set(char, 'description', data.description || '');
    set(char, 'personality', data.personality || '');
    set(char, 'scenario', data.scenario || '');
    set(char, 'first_mes', data.first_mes || '');
    set(char, 'mes_example', data.mes_example || '');

    // Old ST extension fields (for backward compatibility, will be deprecated)
    set(char, 'creatorcomment', data.creator_notes || '');
    set(char, 'avatar', 'none');
    set(char, 'chat', data.ch_name + ' - ' + humanizedDateTime());
    set(char, 'talkativeness', data.talkativeness || 0.5);
    set(char, 'fav', data.fav == 'true');
    set(
        char,
        'tags',
        typeof data.tags === 'string'
            ? data.tags
                  .split(',')
                  .map((x: string) => x.trim())
                  .filter((x: string) => x)
            : data.tags || [],
    );

    // Spec V2 fields
    set(char, 'spec', 'chara_card_v2');
    set(char, 'spec_version', '2.0');
    set(char, 'data.name', data.ch_name);
    set(char, 'data.description', data.description || '');
    set(char, 'data.personality', data.personality || '');
    set(char, 'data.scenario', data.scenario || '');
    set(char, 'data.first_mes', data.first_mes || '');
    set(char, 'data.mes_example', data.mes_example || '');

    // New V2 fields
    set(char, 'data.creator_notes', data.creator_notes || '');
    set(char, 'data.system_prompt', data.system_prompt || '');
    set(char, 'data.post_history_instructions', data.post_history_instructions || '');
    set(
        char,
        'data.tags',
        typeof data.tags === 'string'
            ? data.tags
                  .split(',')
                  .map((x: string) => x.trim())
                  .filter((x: string) => x)
            : data.tags || [],
    );
    set(char, 'data.creator', data.creator || '');
    set(char, 'data.character_version', data.character_version || '');
    set(char, 'data.alternate_greetings', getAlternateGreetings(data));

    // ST extension fields to V2 object
    set(char, 'data.extensions.talkativeness', data.talkativeness || 0.5);
    set(char, 'data.extensions.fav', data.fav == 'true');
    set(char, 'data.extensions.world', data.world || '');

    // Spec extension: depth prompt
    const depth_default = 4;
    const role_default = 'system';
    const depth_value = !isNaN(Number(data.depth_prompt_depth))
        ? Number(data.depth_prompt_depth)
        : depth_default;
    const role_value = data.depth_prompt_role ?? role_default;
    set(char, 'data.extensions.depth_prompt.prompt', data.depth_prompt_prompt ?? '');
    set(char, 'data.extensions.depth_prompt.depth', depth_value);
    set(char, 'data.extensions.depth_prompt.role', role_value);

    if (data.world) {
        try {
            // @ts-expect-error TS(2345) FIXME: Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
            const file = readWorldInfoFile(directories, data.world, false);

            // File was imported - save it to the character book
            if (file && file.originalData) {
                set(char, 'data.character_book', file.originalData);
            }

            // File was not imported - convert the world info to the character book
            if (file && file.entries) {
                set(
                    char,
                    'data.character_book',
                    convertWorldInfoToCharacterBook(data.world as any, (file as any).entries),
                );
            }
        } catch {
            console.warn(
                `Failed to read world info file: ${data.world}. Character book will not be available.`,
            );
        }
    }

    if (data.extensions) {
        try {
            // @ts-expect-error TS(2345) FIXME: Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
            const extensions = JSON.parse(data.extensions);
            // Deep merge the extensions object
            set(char, 'data.extensions', deepMerge(char.data.extensions, extensions));
        } catch {
            console.warn(`Failed to parse extensions JSON: ${data.extensions}`);
        }
    }

    return char;
}

/**
 * @param {string} name Name of World Info file
 * @param {object} entries Entries object
 * @returns {object} Character book object
 */
function convertWorldInfoToCharacterBook(name: string, entries: Record<string, unknown>) {
    /** @type {{ entries: object[]; name: string }} */
    const result = { entries: [], name };

    for (const index in entries) {
        const entry = entries[index];

        const originalEntry = {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            id: entry.uid,
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            keys: entry.key,
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            secondary_keys: entry.keysecondary,
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            comment: entry.comment,
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            content: entry.content,
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            constant: entry.constant,
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            selective: entry.selective,
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            insertion_order: entry.order,
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            enabled: !entry.disable,
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            position: entry.position == 0 ? 'before_char' : 'after_char',
            use_regex: true, // ST keys are always regex
            extensions: {
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                ...entry.extensions,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                position: entry.position,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                exclude_recursion: entry.excludeRecursion,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                display_index: entry.displayIndex,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                probability: entry.probability ?? null,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                useProbability: entry.useProbability ?? false,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                depth: entry.depth ?? 4,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                selectiveLogic: entry.selectiveLogic ?? 0,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                outlet_name: entry.outletName ?? '',
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                group: entry.group ?? '',
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                group_override: entry.groupOverride ?? false,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                group_weight: entry.groupWeight ?? null,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                prevent_recursion: entry.preventRecursion ?? false,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                delay_until_recursion: entry.delayUntilRecursion ?? false,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                scan_depth: entry.scanDepth ?? null,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                match_whole_words: entry.matchWholeWords ?? null,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                use_group_scoring: entry.useGroupScoring ?? false,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                case_sensitive: entry.caseSensitive ?? null,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                automation_id: entry.automationId ?? '',
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                role: entry.role ?? 0,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                vectorized: entry.vectorized ?? false,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                sticky: entry.sticky ?? null,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                cooldown: entry.cooldown ?? null,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                delay: entry.delay ?? null,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                match_persona_description: entry.matchPersonaDescription ?? false,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                match_character_description: entry.matchCharacterDescription ?? false,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                match_character_personality: entry.matchCharacterPersonality ?? false,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                match_character_depth_prompt: entry.matchCharacterDepthPrompt ?? false,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                match_scenario: entry.matchScenario ?? false,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                match_creator_notes: entry.matchCreatorNotes ?? false,
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                triggers: entry.triggers ?? [],
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                ignore_budget: entry.ignoreBudget ?? false,
            },
        };

        // @ts-expect-error TS(2345) FIXME: Argument of type '{ id: any; keys: any; secondary_... Remove this comment to see the full error message
        result.entries.push(originalEntry);
    }

    return result;
}

/**
 * Import a character from a YAML file.
 * @param {string} uploadPath Path to the uploaded file
 * @param {{ request: import('express').Request, response: import('express').Response }} context Express request and response objects
 * @param context.request
 * @param context.response
 * @param {string|undefined} preservedFileName Preserved file name
 * @returns {Promise<string>} Internal name of the character
 */
async function importFromYaml(
    uploadPath: string,
    context: { request: import('express').Request; response: import('express').Response },
    preservedFileName: string | undefined,
) {
    const fileText = fs.readFileSync(uploadPath, 'utf8');
    fs.unlinkSync(uploadPath);
    const yamlData = yaml.parse(fileText);
    console.info('Importing from YAML');
    yamlData.name = sanitize(yamlData.name);
    const fileName =
        preservedFileName || getPngName(yamlData.name, context.request.user.directories);
    const char = convertToV2(
        {
            name: yamlData.name,
            description: yamlData.context ?? '',
            first_mes: yamlData.greeting ?? '',
            create_date: new Date().toISOString(),
            chat: `${yamlData.name} - ${humanizedDateTime()}`,
            personality: '',
            creatorcomment: '',
            avatar: 'none',
            mes_example: '',
            scenario: '',
            talkativeness: 0.5,
            creator: '',
            tags: '',
        },
        context.request.user.directories,
    );
    const result = await writeCharacterData(
        DEFAULT_AVATAR_PATH,
        JSON.stringify(char),
        fileName,
        context.request,
    );
    return result ? fileName : '';
}

/**
 * Imports a character card from CharX (ZIP) file.
 * @param {string} uploadPath Path to the uploaded file
 * @param {object} params Parameters object
 * @param {import('express').Request} params.request Express request object
 * @param {string|undefined} preservedFileName Preserved file name
 * @returns {Promise<string>} Internal name of the character
 */
async function importFromCharX(
    uploadPath: string,
    { request }: { request: import('express').Request },
    preservedFileName: string | undefined,
) {
    const fileBuffer = fs.readFileSync(uploadPath);
    // Create a properly-sized ArrayBuffer (Node's buffer pool can cause oversized .buffer)
    const data = fileBuffer.buffer.slice(
        fileBuffer.byteOffset,
        fileBuffer.byteOffset + fileBuffer.byteLength,
    );
    fs.unlinkSync(uploadPath);

    const parser = new CharXParser(data);
    const { card, avatar, auxiliaryAssets, extractedBuffers } = await parser.parse();

    // Apply standard character transformations
    if (card.data?.name) {
        card.data.name = sanitize(card.data.name);
    }
    card.name = sanitize(card.data?.name || card.name);
    const processedCard = readFromV2(card);
    unsetPrivateFields(processedCard);
    processedCard.create_date = new Date().toISOString();

    // @ts-expect-error TS(2345) FIXME: Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
    const fileName = preservedFileName || getPngName(processedCard.name, request.user.directories);
    // Use the actual character name for asset folders, not the unique filename
    // ST's sprite system looks up by character name, not PNG filename
    const characterFolder = processedCard.name;

    if (auxiliaryAssets.length > 0) {
        try {
            const summary = persistCharXAssets(
                auxiliaryAssets,
                extractedBuffers,
                request.user.directories,
                characterFolder as any,
            );
            if (summary.sprites || summary.backgrounds || summary.misc) {
                console.log(
                    `CharX: Imported ${summary.sprites} sprite(s), ${summary.backgrounds} background(s), ${summary.misc} misc asset(s) for ${characterFolder}`,
                );
            }
        } catch (error) {
            console.warn(`CharX: Failed to persist auxiliary assets for ${characterFolder}`, error);
        }
    }

    const result = await writeCharacterData(
        avatar,
        JSON.stringify(processedCard),
        fileName,
        request,
    );
    return result ? fileName : '';
}

/**
 * Import a character from a BYAF file.
 * @param {string} uploadPath Path to the uploaded file
 * @param {object} root0 Parameters object
 * @param {import('express').Request} root0.request Express request object
 * @param {string|undefined} preservedFileName Preserved file name
 * @returns {Promise<string>} Internal name of the character
 */
async function importFromByaf(
    uploadPath: string,
    { request }: { request: import('express').Request },
    preservedFileName: string | undefined,
) {
    const data = (await fsPromises.readFile(uploadPath)).buffer;
    await fsPromises.unlink(uploadPath);
    console.info('Importing from BYAF');

    const byafData = await new ByafParser(data).parse();
    const card = readFromV2(byafData.card);
    const fileName =
        preservedFileName ||
        getPngName(
            sanitize(byafData.character.displayName || card.name, {
                replacement: sanitizeSafeCharacterReplacements,
            }),
            request.user.directories,
        );

    // Don't import chats and images if the character is being replaced or updated, instead of newly imported.
    if (!preservedFileName) {
        /**
         * Creates a chat from a BYAF scenario.
         * @param {Partial<ByafScenario>} scenario BYAF scenario
         * @returns {string} Chat name
         */
        const createChatAsCurrentPersona = (scenario: Record<string, unknown>) => {
            const chatName = sanitize(
                `${scenario.title || card.name} - ${humanizedDateTime()} imported.jsonl`,
                { replacement: sanitizeSafeCharacterReplacements },
            );
            const filePath = path.join(
                request.user.directories.chats,
                path.basename(fileName),
                chatName,
            );
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            writeFileAtomicSync(
                filePath,
                ByafParser.getChatFromScenario(
                    scenario,
                    request.body.user_name,
                    card.name as any,
                    byafData.chatBackgrounds,
                ),
                'utf8',
            );
            console.log(`Created ${chatName} chat from BYAF import`);
            return chatName;
        };

        // Upload backgrounds
        for (const bg of byafData.chatBackgrounds) {
            const extension = path.extname(bg.paths?.[0] ?? '') || '.png';
            const baseName = `${path.basename(fileName)}_bg`;
            const filePath = path.join(request.user.directories.userImages!, fileName);
            if (!fs.existsSync(filePath)) fs.mkdirSync(filePath, { recursive: true });
            const file = getUniqueName(baseName, (name: string) =>
                fs.existsSync(path.join(filePath, `${name}${extension}`)),
            );
            if (Buffer.isBuffer(bg.data)) {
                const newFile = `${file}${extension}`;
                writeFileAtomicSync(path.join(filePath, newFile), bg.data);
                bg.name = clientRelativePath(
                    request.user.directories.root,
                    path.join(filePath, newFile),
                ); // Update background name to the new file
                console.log(`Created ${newFile} background from BYAF import`);
            }
        }

        const chats = [];
        // Create chats for each scenario
        if (Array.isArray(byafData.scenarios)) {
            for (const scenario of byafData.scenarios) {
                chats.push(createChatAsCurrentPersona(scenario));
            }
        }

        // Update the default chat if there are any so we open to an existing chat instead of creating a new one and opening that.
        if (chats.length > 0) {
            const chat = chats[0]!;
            card.chat = path.basename(chat, path.extname(chat));
        }

        // Save alternate icons for the character.
        for (const icon of byafData.images.slice(1)) {
            // BYAF does not support character expressions, so using the same structure will not result in conflicts,
            // even if the expression system did not tolerate additional icons that are not mapped to expressions.
            // This will not yet allow changing icons within the UI but at least the icons will be available for manual selection, rather than being lost.
            const altImagesFolder = path.join(
                request.user.directories.characters!,
                sanitize(card.name as string),
            );
            if (!fs.existsSync(altImagesFolder)) fs.mkdirSync(altImagesFolder, { recursive: true });
            const extension = path.extname(icon.filename) || '.png';
            const file = getUniqueName(
                `${sanitize(icon.label, { replacement: sanitizeSafeCharacterReplacements }) || 'alt'}`,
                (name: string) => fs.existsSync(path.join(altImagesFolder, `${name}${extension}`)),
            );
            if (Buffer.isBuffer(icon.image)) {
                writeFileAtomicSync(path.join(altImagesFolder, `${file}${extension}`), icon.image);
                console.log(`Created ${file}${extension} alternate icon from BYAF import`);
            }
        }
    }

    const result = await writeCharacterData(
        byafData.images[0]?.image ?? (null as any),
        JSON.stringify(card),
        fileName,
        request,
    );

    return result ? fileName : '';
}

/**
 * Import a character from a JSON file.
 * @param {string} uploadPath Path to the uploaded file
 * @param {{ request: import('express').Request, response: import('express').Response }} context Express request and response objects
 * @param {string|undefined} preservedFileName Preserved file name
 * @returns {Promise<string>} Internal name of the character
 */
async function importFromJson(
    uploadPath: string,
    { request }: { request: import('express').Request },
    preservedFileName: string | undefined,
) {
    const data = fs.readFileSync(uploadPath, 'utf8');
    fs.unlinkSync(uploadPath);

    let jsonData = JSON.parse(data);

    if (jsonData.spec !== undefined) {
        console.info(`Importing from ${jsonData.spec} json`);
        importRisuSprites(request.user.directories, jsonData);
        unsetPrivateFields(jsonData);
        if (jsonData.data?.name) {
            jsonData.data.name = sanitize(jsonData.data.name);
        }
        jsonData.name = sanitize(jsonData.data?.name || jsonData.name);
        jsonData = readFromV2(jsonData);
        jsonData.create_date = new Date().toISOString();
        const pngName = preservedFileName || getPngName(jsonData.name, request.user.directories);
        const char = JSON.stringify(jsonData);
        const result = await writeCharacterData(DEFAULT_AVATAR_PATH, char, pngName, request);
        return result ? pngName : '';
    } else if (jsonData.name !== undefined) {
        console.info('Importing from v1 json');
        jsonData.name = sanitize(jsonData.name);
        if (jsonData.creator_notes) {
            jsonData.creator_notes = jsonData.creator_notes.replace("Creator's notes go here.", '');
        }
        const pngName = preservedFileName || getPngName(jsonData.name, request.user.directories);
        let char = {
            name: jsonData.name,
            description: jsonData.description ?? '',
            creatorcomment: jsonData.creatorcomment ?? jsonData.creator_notes ?? '',
            personality: jsonData.personality ?? '',
            first_mes: jsonData.first_mes ?? '',
            avatar: 'none',
            chat: jsonData.name + ' - ' + humanizedDateTime(),
            mes_example: jsonData.mes_example ?? '',
            scenario: jsonData.scenario ?? '',
            create_date: new Date().toISOString(),
            talkativeness: jsonData.talkativeness ?? 0.5,
            creator: jsonData.creator ?? '',
            tags: jsonData.tags ?? '',
        };
        char = convertToV2(char, request.user.directories);
        const charJSON = JSON.stringify(char);
        const result = await writeCharacterData(DEFAULT_AVATAR_PATH, charJSON, pngName, request);
        return result ? pngName : '';
    } else if (jsonData.char_name !== undefined) {
        //json Pygmalion notepad
        console.info('Importing from gradio json');
        jsonData.char_name = sanitize(jsonData.char_name);
        if (jsonData.creator_notes) {
            jsonData.creator_notes = jsonData.creator_notes.replace("Creator's notes go here.", '');
        }
        const pngName =
            preservedFileName || getPngName(jsonData.char_name, request.user.directories);
        let char = {
            name: jsonData.char_name,
            description: jsonData.char_persona ?? '',
            creatorcomment: jsonData.creatorcomment ?? jsonData.creator_notes ?? '',
            personality: '',
            first_mes: jsonData.char_greeting ?? '',
            avatar: 'none',
            chat: jsonData.name + ' - ' + humanizedDateTime(),
            mes_example: jsonData.example_dialogue ?? '',
            scenario: jsonData.world_scenario ?? '',
            create_date: new Date().toISOString(),
            talkativeness: jsonData.talkativeness ?? 0.5,
            creator: jsonData.creator ?? '',
            tags: jsonData.tags ?? '',
        };
        char = convertToV2(char, request.user.directories);
        const charJSON = JSON.stringify(char);
        const result = await writeCharacterData(DEFAULT_AVATAR_PATH, charJSON, pngName, request);
        return result ? pngName : '';
    }

    return '';
}

/**
 * Import a character from a PNG file.
 * @param {string} uploadPath Path to the uploaded file
 * @param {{ request: import('express').Request, response: import('express').Response }} context Express request and response objects
 * @param {string|undefined} preservedFileName Preserved file name
 * @returns {Promise<string>} Internal name of the character
 */
async function importFromPng(
    uploadPath: string,
    { request }: { request: import('express').Request },
    preservedFileName: string | undefined,
) {
    const imgData = await readCharacterData(uploadPath);
    if (imgData === undefined) throw new Error('Failed to read character data');

    let jsonData = JSON.parse(imgData);

    if (jsonData.data?.name) {
        jsonData.data.name = sanitize(jsonData.data.name);
    }
    jsonData.name = sanitize(jsonData.data?.name || jsonData.name);
    const pngName = preservedFileName || getPngName(jsonData.name, request.user.directories);

    if (jsonData.spec !== undefined) {
        console.info(`Found a ${jsonData.spec} character file.`);
        importRisuSprites(request.user.directories, jsonData);
        unsetPrivateFields(jsonData);
        jsonData = readFromV2(jsonData);
        jsonData.create_date = new Date().toISOString();
        const char = JSON.stringify(jsonData);
        const result = await writeCharacterData(uploadPath, char, pngName, request);
        fs.unlinkSync(uploadPath);
        return result ? pngName : '';
    } else if (jsonData.name !== undefined) {
        console.info('Found a v1 character file.');

        if (jsonData.creator_notes) {
            jsonData.creator_notes = jsonData.creator_notes.replace("Creator's notes go here.", '');
        }

        let char = {
            name: jsonData.name,
            description: jsonData.description ?? '',
            creatorcomment: jsonData.creatorcomment ?? jsonData.creator_notes ?? '',
            personality: jsonData.personality ?? '',
            first_mes: jsonData.first_mes ?? '',
            avatar: 'none',
            chat: jsonData.name + ' - ' + humanizedDateTime(),
            mes_example: jsonData.mes_example ?? '',
            scenario: jsonData.scenario ?? '',
            create_date: new Date().toISOString(),
            talkativeness: jsonData.talkativeness ?? 0.5,
            creator: jsonData.creator ?? '',
            tags: jsonData.tags ?? '',
        };
        char = convertToV2(char, request.user.directories);
        const charJSON = JSON.stringify(char);
        const result = await writeCharacterData(uploadPath, charJSON, pngName, request);
        fs.unlinkSync(uploadPath);
        return result ? pngName : '';
    }

    return '';
}

/**
 * Gets the name for the uploaded PNG file.
 * @param {string} file File name
 * @param {import('../users.js').UserDirectoryList} directories User directories
 * @returns {string} - The name for the uploaded PNG file
 */
function getPngName(file: string, directories: import('../users.js').UserDirectoryList) {
    file = sanitize(file);
    return (
        getUniqueName(
            file,
            (name: string) => fs.existsSync(path.join(directories.characters, `${name}.png`)),
            {
                nameBuilder: (base: string, i: number) => (i === 0 ? base : `${base}${i}`),
                startIndex: 0,
                maxTries: 10000,
            } as any,
        ) ?? file
    );
}

/**
 * Gets the preserved name for the uploaded file if the request is valid.
 * @param {import("express").Request} request - Express request object
 * @returns {string | undefined} - The preserved name if the request is valid, otherwise undefined
 */
function getPreservedName(request: import('express').Request) {
    return typeof request.body.preserved_name === 'string' && request.body.preserved_name.length > 0
        ? path.parse(request.body.preserved_name).name
        : undefined;
}

/**
 * Sentinel value that signals a field should be completely removed (unset)
 * from the character card rather than being set to any value. Use this in
 * the merge payload wherever a key should be deleted.
 *
 * Both the server and the frontend share this constant so that callers can
 * explicitly opt into deletion without overloading `null`.
 * @type {string}
 */
const UNSET_SENTINEL = '__@@UNSET@@__';

/** Maximum number of characters processed in parallel during bulk merge */
const BULK_MERGE_CONCURRENCY = 10;

/**
 * Recursively walks `source` and removes any key from `target` whose
 * corresponding value in `source` equals the {@link UNSET_SENTINEL}.
 * Called after {@link deepMerge} so that the sentinel gets replaced by
 * an actual key deletion.
 * @param {object} target The merged character object to clean up
 * @param {object} source The original update payload (pre-merge clone)
 */
function processUnsetSentinels(target: Record<string, unknown>, source: Record<string, unknown>) {
    for (const key of Object.keys(source)) {
        if (source[key] === UNSET_SENTINEL) {
            unset(target, key);
        } else if (isPlainObject(source[key]) && isPlainObject(target[key])) {
            // @ts-expect-error TS(2345) FIXME: Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
            processUnsetSentinels(target[key], source[key]);
        }
    }
}

/**
 * Reads a character card, applies a merge update (with sentinel-based
 * unsetting), validates the result, and writes it back.
 * @param {string} avatarPath Full path to the character PNG
 * @param {string} avatar     Avatar filename (e.g. "char.png")
 * @param {object} updateData The merge payload to apply
 * @param {import("express").Request} request Express request object
 * @param {((data: Record<string, unknown>) => boolean) | null} [shouldSkip] Optional function to determine if a character should be skipped based on its original data (used for bulk merge filtering)
 * @returns {Promise<{ok: boolean, error?: string, skipped?: boolean}>} Result of the merge operation, including any validation error
 */
async function mergeCharacterUpdate(
    avatarPath: string,
    avatar: string,
    updateData: Record<string, unknown>,
    request: import('express').Request,
    shouldSkip: ((data: Record<string, unknown>) => boolean) | null = null,
) {
    const pngStringData = await readCharacterData(avatarPath);
    if (!pngStringData) {
        return { ok: false, error: 'Invalid character file' };
    }

    let character = JSON.parse(pngStringData);

    if (typeof shouldSkip === 'function' && shouldSkip(character)) {
        return { ok: false, skipped: true };
    }

    const update = cloneDeep(updateData);
    unset(update, 'json_data');
    unset(character, 'json_data');

    character = deepMerge(character, update);
    processUnsetSentinels(character, update);

    const validator = new TavernCardValidator(character);
    //Accept either V1 or V2.
    if (!validator.validate()) {
        return { ok: false, error: validator.lastValidationError ?? 'Validation failed' };
    }

    const targetImg = avatar.replace('.png', '');
    await writeCharacterData(avatarPath, JSON.stringify(character), targetImg, request);
    return { ok: true };
}

export const router = new Elysia({ prefix: '/api/characters' })
    .post('/create', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const uploadedFile = (context as unknown as Record<string, unknown>).file as Record<
            string,
            unknown
        > | null;
        const query = context.query as Record<string, string>;
        const mockRequest = {
            user: {
                directories: directories,
                profile: {
                    handle: ((user?.profile as Record<string, unknown>)?.handle as string) ?? '',
                },
            },
        } as any;

        try {
            if (!body) {
                set.status = 400;
                return;
            }

            // Inline getFileNameValidationFunction('file_name')
            if (
                body.file_name &&
                typeof body.file_name === 'string' &&
                forbiddenRegExp.test(body.file_name as string)
            ) {
                set.status = 400;
                return;
            }

            body.ch_name = sanitize(body.ch_name as string);

            const char = JSON.stringify(charaFormatData(body, directories as any));
            const internalName =
                (body.file_name as string) ||
                getPngName(body.ch_name as string, directories as any);
            const avatarName = `${internalName}.png`;
            const chatsPath = path.join(directories?.chats ?? '', internalName);

            if (!fs.existsSync(chatsPath)) fs.mkdirSync(chatsPath);

            if (!uploadedFile) {
                await writeCharacterData(DEFAULT_AVATAR_PATH, char, internalName, mockRequest);
                return avatarName;
            } else {
                const crop = tryParse(query.crop as string);
                const uploadPath = path.join(
                    uploadedFile.destination as string,
                    uploadedFile.filename as string,
                );
                await writeCharacterData(uploadPath, char, internalName, mockRequest, crop);
                fs.unlinkSync(uploadPath);
                return avatarName;
            }
        } catch (err) {
            console.error(err);
            set.status = 500;
        }
    })
    .post('/rename', async (context) => {
        const { set: elysiaSet } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const mockRequest = {
            user: {
                directories: directories,
                profile: {
                    handle: ((user?.profile as Record<string, unknown>)?.handle as string) ?? '',
                },
            },
        } as any;

        // Inline validateAvatarUrlMiddleware
        if (
            body &&
            'avatar_url' in body &&
            (typeof body.avatar_url === 'string' || body.avatar_url?.toString) &&
            forbiddenRegExp.test(body.avatar_url as string)
        ) {
            elysiaSet.status = 400;
            return;
        }

        if (!body?.avatar_url || !body?.new_name) {
            elysiaSet.status = 400;
            return;
        }

        const oldAvatarName = body.avatar_url as string;
        const newName = sanitize(body.new_name as string);
        const oldInternalName = path.parse(body.avatar_url as string).name;
        const newInternalName = getPngName(newName, directories as any);
        const newAvatarName = `${newInternalName}.png`;

        const oldAvatarPath = path.join(directories?.characters ?? '', oldAvatarName);

        const oldChatsPath = path.join(directories?.chats ?? '', oldInternalName);
        const newChatsPath = path.join(directories?.chats ?? '', newInternalName);

        try {
            // Read old file, replace name int it
            const rawOldData = await readCharacterData(oldAvatarPath);
            if (rawOldData === undefined) throw new Error('Failed to read character file');

            const oldData = getCharaCardV2(JSON.parse(rawOldData), directories as any);
            set(oldData, 'data.name', newName);
            set(oldData, 'name', newName);
            const newData = JSON.stringify(oldData);

            // Write data to new location
            await writeCharacterData(oldAvatarPath, newData, newInternalName, mockRequest);

            // Rename chats folder
            if (fs.existsSync(oldChatsPath) && !fs.existsSync(newChatsPath)) {
                fs.cpSync(oldChatsPath, newChatsPath, { recursive: true });
                fs.rmSync(oldChatsPath, { recursive: true, force: true });
            }

            // Remove the old character file
            fs.unlinkSync(oldAvatarPath);

            // Return new avatar name to ST
            return { avatar: newAvatarName };
        } catch (err) {
            console.error(err);
            elysiaSet.status = 500;
        }
    })

    .post('/edit', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const uploadedFile = (context as unknown as Record<string, unknown>).file as Record<
            string,
            unknown
        > | null;
        const query = context.query as Record<string, string>;
        const mockRequest = {
            user: {
                directories: directories,
                profile: {
                    handle: ((user?.profile as Record<string, unknown>)?.handle as string) ?? '',
                },
            },
        } as any;

        // Inline validateAvatarUrlMiddleware
        if (
            body &&
            'avatar_url' in body &&
            (typeof body.avatar_url === 'string' || (body.avatar_url as any)?.toString) &&
            forbiddenRegExp.test(body.avatar_url as string)
        ) {
            set.status = 400;
            return;
        }

        if (!body) {
            console.warn('Error: no response body detected');
            set.status = 400;
            return 'Error: no response body detected';
        }

        if (body.ch_name === '' || body.ch_name === undefined || body.ch_name === '.') {
            console.warn('Error: invalid name.');
            set.status = 400;
            return 'Error: invalid name.';
        }

        let char = charaFormatData(body, directories as any);
        char.chat = body.chat;
        char.create_date = body.create_date;
        char = JSON.stringify(char);
        const targetFile = (body.avatar_url as string).replace('.png', '');

        try {
            if (!uploadedFile) {
                const avatarPath = path.join(
                    directories?.characters ?? '',
                    body.avatar_url as string,
                );
                await writeCharacterData(avatarPath, char, targetFile, mockRequest);
            } else {
                const crop = tryParse(query.crop as string);
                const newAvatarPath = path.join(
                    uploadedFile.destination as string,
                    uploadedFile.filename as string,
                );
                invalidateThumbnail(directories as any, 'avatar', body.avatar_url as string);
                await writeCharacterData(newAvatarPath, char, targetFile, mockRequest, crop);
                fs.unlinkSync(newAvatarPath);

                // Bust cache to reload the new avatar
                const isEnabled = true; // cacheBuster.shouldBust equivalent
                if (isEnabled) {
                    set.headers['Clear-Site-Data'] = '"cache"';
                }
            }

            return;
        } catch (err) {
            console.error('An error occurred, character edit invalidated.', err);
            set.status = 500;
        }
    })
    .post('/edit-avatar', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const uploadedFile = (context as unknown as Record<string, unknown>).file as Record<
            string,
            unknown
        > | null;
        const query = context.query as Record<string, string>;
        const mockRequest = {
            user: {
                directories: directories,
                profile: {
                    handle: ((user?.profile as Record<string, unknown>)?.handle as string) ?? '',
                },
            },
        } as any;

        // Inline validateAvatarUrlMiddleware
        if (
            body &&
            'avatar_url' in body &&
            (typeof body.avatar_url === 'string' || (body.avatar_url as any)?.toString) &&
            forbiddenRegExp.test(body.avatar_url as string)
        ) {
            set.status = 400;
            return;
        }

        try {
            if (!uploadedFile) {
                set.status = 400;
                return 'Error: no file uploaded';
            }

            if (!body || !body.avatar_url) {
                set.status = 400;
                return 'Error: no avatar_url in request body';
            }

            const uploadPath = path.join(
                uploadedFile.destination as string,
                uploadedFile.filename as string,
            );
            if (!fs.existsSync(uploadPath)) {
                set.status = 400;
                return 'Error: uploaded file does not exist';
            }
            const characterPath = path.join(
                directories?.characters ?? '',
                body.avatar_url as string,
            );
            if (!fs.existsSync(characterPath)) {
                set.status = 400;
                return 'Error: character file does not exist';
            }
            const data = await readCharacterData(characterPath);
            if (!data) {
                set.status = 400;
                return 'Error: failed to read character data';
            }

            const crop = tryParse(query.crop as string);
            const fileName = (body.avatar_url as string).replace('.png', '');
            await writeCharacterData(uploadPath, data, fileName, mockRequest, crop);

            // Remove uploaded temp file
            fs.unlinkSync(uploadPath);

            // Reset images caches
            set.headers['Clear-Site-Data'] = '"cache"';
            invalidateThumbnail(directories as any, 'avatar', body.avatar_url as string);

            return;
        } catch (err) {
            console.error('An error occurred while editing avatar', err);
            set.status = 500;
        }
    })
    .post('/edit-attribute', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const mockRequest = {
            user: {
                directories: directories,
                profile: {
                    handle: ((user?.profile as Record<string, unknown>)?.handle as string) ?? '',
                },
            },
        } as any;

        // Inline validateAvatarUrlMiddleware
        if (
            body &&
            'avatar_url' in body &&
            (typeof body.avatar_url === 'string' || (body.avatar_url as any)?.toString) &&
            forbiddenRegExp.test(body.avatar_url as string)
        ) {
            set.status = 400;
            return;
        }

        console.debug(body);
        if (!body) {
            console.warn('Error: no response body detected');
            set.status = 400;
            return 'Error: no response body detected';
        }

        if (body.ch_name === '' || body.ch_name === undefined || body.ch_name === '.') {
            console.warn('Error: invalid name.');
            set.status = 400;
            return 'Error: invalid name.';
        }

        if (body.field === 'json_data') {
            console.warn('Error: cannot edit json_data field.');
            set.status = 400;
            return 'Error: cannot edit json_data field.';
        }

        try {
            const avatarPath = path.join(directories?.characters ?? '', body.avatar_url as string);
            const charJSON = await readCharacterData(avatarPath);
            if (typeof charJSON !== 'string') throw new Error('Failed to read character file');

            const char = JSON.parse(charJSON);
            //check if the field exists
            if (
                char[body.field as string] === undefined &&
                char.data?.[body.field as string] === undefined
            ) {
                console.warn('Error: invalid field.');
                set.status = 400;
                return 'Error: invalid field.';
            }
            char[body.field as string] = body.value;
            char.data[body.field as string] = body.value;
            const newCharJSON = JSON.stringify(char);
            const targetFile = (body.avatar_url as string).replace('.png', '');
            await writeCharacterData(avatarPath, newCharJSON, targetFile, mockRequest);
            return;
        } catch (err) {
            console.error('An error occurred, character edit invalidated.', err);
            set.status = 500;
        }
    })
    .post('/merge-attributes', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const mockRequest = {
            user: {
                directories: directories,
                profile: {
                    handle: ((user?.profile as Record<string, unknown>)?.handle as string) ?? '',
                },
            },
        } as any;

        // Inline getFileNameValidationFunction('avatar')
        if (
            body &&
            'avatar' in body &&
            (typeof body.avatar === 'string' || (body.avatar as any)?.toString) &&
            forbiddenRegExp.test(body.avatar as string)
        ) {
            set.status = 400;
            return;
        }

        try {
            // ── Bulk mode: avatars array is present ──────────────────
            if (Array.isArray(body.avatars)) {
                const { avatars, data, filter } = body as any;

                if (!isPlainObject(data)) {
                    set.status = 400;
                    return { message: 'No valid update data provided.' };
                }

                // Determine which avatar files to process
                let targetAvatars;
                if (avatars.length > 0) {
                    for (const avatar of avatars) {
                        if (
                            typeof avatar !== 'string' ||
                            forbiddenRegExp.test(avatar) ||
                            path.extname(avatar).toLowerCase() !== '.png'
                        ) {
                            set.status = 400;
                            return { message: `Invalid avatar filename: ${avatar}` };
                        }
                    }
                    targetAvatars = avatars;
                } else {
                    // Empty array → scan all characters in the directory
                    const files = fs.readdirSync(directories?.characters ?? '');
                    targetAvatars = files.filter(
                        (file: string) => path.extname(file).toLowerCase() === '.png',
                    );
                }

                const updated: string[] = [];
                const skipped: string[] = [];
                const failed: string[] = [];

                /**
                 * Process a single character in bulk: read, filter, merge, validate, write.
                 * @param {string} avatar Avatar filename
                 */
                const processOne = async (avatar: string) => {
                    const avatarPath = path.join(directories?.characters ?? '', avatar);

                    try {
                        /** @type {(character: object) => boolean} */
                        let shouldSkip: (character: Record<string, unknown>) => boolean = () =>
                            false;

                        // Apply optional server-side filter before updating the card
                        if (filter && typeof filter.path === 'string') {
                            shouldSkip = (character: Record<string, unknown>) => {
                                const value = get(character, filter.path);
                                return value === undefined;
                            };
                        }

                        const result = await mergeCharacterUpdate(
                            avatarPath,
                            avatar,
                            data,
                            mockRequest,
                            shouldSkip,
                        );
                        if (result.ok) {
                            updated.push(avatar);
                        } else if (result.skipped) {
                            skipped.push(avatar);
                        } else {
                            console.warn(`Bulk merge failed for ${avatar}:`, result.error);
                            failed.push(avatar);
                        }
                    } catch (error) {
                        console.error(`Bulk merge failed for ${avatar}:`, error);
                        failed.push(avatar);
                    }
                };

                // Process in parallel with a concurrency limit
                for (let i = 0; i < targetAvatars.length; i += BULK_MERGE_CONCURRENCY) {
                    const batch = targetAvatars.slice(i, i + BULK_MERGE_CONCURRENCY);
                    await Promise.allSettled(batch.map(processOne));
                }

                return { updated, skipped, failed };
            }

            // ── Single mode (default behavior) ───────────────────────
            const update = body;
            const avatarPath = path.join(directories?.characters ?? '', (update as any).avatar);

            const result = await mergeCharacterUpdate(
                avatarPath,
                (update as any).avatar,
                update,
                mockRequest,
            );
            if (result.ok) {
                return;
            } else {
                console.warn(result.error);
                set.status = 400;
                return {
                    message: `Validation failed for ${(update as any).avatar}`,
                    error: result.error,
                };
            }
        } catch (exception) {
            set.status = 500;
            return {
                message: 'Unexpected error while saving character.',
                error: (exception as any).toString(),
            };
        }
    })
    .post('/delete', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        // Inline validateAvatarUrlMiddleware
        if (
            body &&
            'avatar_url' in body &&
            (typeof body.avatar_url === 'string' || (body.avatar_url as any)?.toString) &&
            forbiddenRegExp.test(body.avatar_url as string)
        ) {
            set.status = 400;
            return;
        }

        if (!body?.avatar_url) {
            set.status = 400;
            return;
        }

        if ((body.avatar_url as string) !== sanitize(body.avatar_url as string)) {
            console.error('Malicious filename prevented');
            set.status = 403;
            return;
        }

        const avatarPath = path.join(directories?.characters ?? '', body.avatar_url as string);
        if (!fs.existsSync(avatarPath)) {
            set.status = 400;
            return;
        }

        fs.unlinkSync(avatarPath);
        invalidateThumbnail(directories as any, 'avatar', body.avatar_url as string);
        const dir_name = (body.avatar_url as string).replace('.png', '');

        if (!dir_name.length) {
            console.error('Malicious dirname prevented');
            set.status = 403;
            return;
        }

        if (body.delete_chats == true) {
            try {
                await fs.promises.rm(path.join(directories?.chats ?? '', sanitize(dir_name)), {
                    recursive: true,
                    force: true,
                });
            } catch (err) {
                console.error(err);
                set.status = 500;
                return;
            }
        }

        return;
    })
    .post('/all', async (context) => {
        const { set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            const files = fs.readdirSync(directories?.characters ?? '');
            const pngFiles = files.filter((file: string) => file.endsWith('.png'));
            const processingPromises = pngFiles.map((file: string) =>
                processCharacter(file, directories as any, { shallow: useShallowCharacters }),
            );
            const data = (await Promise.all(processingPromises)).filter((c: any) => c.name);
            return data;
        } catch (err) {
            console.error(err);
            const isRangeError = err instanceof RangeError;
            set.status = 500;
            return { overflow: isRangeError, error: true };
        }
    })
    .post('/get', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        // Inline validateAvatarUrlMiddleware
        if (
            body &&
            'avatar_url' in body &&
            (typeof body.avatar_url === 'string' || (body.avatar_url as any)?.toString) &&
            forbiddenRegExp.test(body.avatar_url as string)
        ) {
            set.status = 400;
            return;
        }

        try {
            if (!body) {
                set.status = 400;
                return;
            }
            const item = body.avatar_url as string;
            const filePath = path.join(directories?.characters ?? '', item);

            if (!fs.existsSync(filePath)) {
                set.status = 404;
                return;
            }

            const data = await processCharacter(item, directories as any, { shallow: false });

            return data;
        } catch (err) {
            console.error(err);
            set.status = 500;
        }
    })
    .post('/chats', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        // Inline validateAvatarUrlMiddleware
        if (
            body &&
            'avatar_url' in body &&
            (typeof body.avatar_url === 'string' || (body.avatar_url as any)?.toString) &&
            forbiddenRegExp.test(body.avatar_url as string)
        ) {
            set.status = 400;
            return;
        }

        try {
            if (!body) {
                set.status = 400;
                return;
            }

            const characterDirectory = (body.avatar_url as string).replace('.png', '');
            const chatsDirectory = path.join(directories?.chats ?? '', characterDirectory);

            if (!fs.existsSync(chatsDirectory)) {
                return { error: true };
            }

            const files = fs.readdirSync(chatsDirectory, { withFileTypes: true });
            const jsonFiles = files
                .filter((file) => file.isFile() && path.extname(file.name) === '.jsonl')
                .map((file) => file.name);

            if (jsonFiles.length === 0) {
                return [];
            }

            if (body.simple) {
                return jsonFiles.map((file: string) => ({
                    file_name: file,
                    file_id: path.parse(file).name,
                }));
            }

            const jsonFilesPromise = jsonFiles.map((file: string) => {
                const withMetadata = !!body.metadata;
                const pathToFile = path.join(directories?.chats ?? '', characterDirectory, file);
                return getChatInfo(pathToFile, {}, withMetadata);
            });

            const chatData = (await Promise.allSettled(jsonFilesPromise))
                .filter((x) => x.status === 'fulfilled')
                .map((x) => (x as PromiseFulfilledResult<any>).value);
            const validFiles = chatData.filter((i: any) => i.file_name);

            return validFiles;
        } catch (error) {
            console.error(error);
            return { error: true };
        }
    })
    .post('/import', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const uploadedFile = (context as unknown as Record<string, unknown>).file as Record<
            string,
            unknown
        > | null;
        const mockRequest = {
            user: {
                directories: directories,
                profile: {
                    handle: ((user?.profile as Record<string, unknown>)?.handle as string) ?? '',
                },
            },
        } as any;

        if (!body || !uploadedFile) {
            set.status = 400;
            return;
        }

        const uploadPath = path.join(
            uploadedFile.destination as string,
            uploadedFile.filename as string,
        );
        const format = body.file_type as string;
        const preservedFileName = getPreservedName({ body } as any);

        const formatImportFunctions: Record<string, Function> = {
            yaml: importFromYaml,
            yml: importFromYaml,
            json: importFromJson,
            png: importFromPng,
            charx: importFromCharX,
            byaf: importFromByaf,
        };

        try {
            const importFunction = formatImportFunctions[format];

            if (!importFunction) {
                throw new Error(`Unsupported format: ${format}`);
            }

            const fileName = await importFunction(
                uploadPath,
                { request: mockRequest, response: {} },
                preservedFileName,
            );

            if (!fileName) {
                console.warn('Failed to import character');
                set.status = 400;
                return;
            }

            if (preservedFileName) {
                invalidateThumbnail(directories as any, 'avatar', `${preservedFileName}.png`);
            }

            return { file_name: fileName };
        } catch (err) {
            console.error(err);
            return { error: true };
        }
    })
    .post('/duplicate', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        // Inline validateAvatarUrlMiddleware
        if (
            body &&
            'avatar_url' in body &&
            (typeof body.avatar_url === 'string' || (body.avatar_url as any)?.toString) &&
            forbiddenRegExp.test(body.avatar_url as string)
        ) {
            set.status = 400;
            return;
        }

        try {
            if (!body?.avatar_url) {
                console.warn('avatar URL not found in request body');
                console.debug(body);
                set.status = 400;
                return;
            }
            const filename = path.join(
                directories?.characters ?? '',
                sanitize(body.avatar_url as string),
            );
            if (!fs.existsSync(filename)) {
                console.error('file for dupe not found', filename);
                set.status = 404;
                return;
            }
            let suffix = 1;
            let newFilename = filename;

            // If filename ends with a _number, increment the number
            const nameParts = path.basename(filename, path.extname(filename)).split('_');
            const lastPart = nameParts[nameParts.length - 1]!;

            let baseName: string;

            if (!isNaN(Number(lastPart)) && nameParts.length > 1) {
                suffix = parseInt(lastPart) + 1;
                baseName = nameParts.slice(0, -1).join('_'); // construct baseName without suffix
            } else {
                baseName = nameParts.join('_'); // original filename is completely the baseName
            }

            newFilename = path.join(
                directories?.characters ?? '',
                `${baseName}_${suffix}${path.extname(filename)}`,
            );

            while (fs.existsSync(newFilename)) {
                const suffixStr = '_' + suffix;
                newFilename = path.join(
                    directories?.characters ?? '',
                    `${baseName}${suffixStr}${path.extname(filename)}`,
                );
                suffix++;
            }

            fs.copyFileSync(filename, newFilename);
            console.info(`${filename} was copied to ${newFilename}`);
            return { path: path.parse(newFilename).base };
        } catch (error) {
            console.error(error);
            return { error: true };
        }
    })
    .post('/export', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        // Inline validateAvatarUrlMiddleware
        if (
            body &&
            'avatar_url' in body &&
            (typeof body.avatar_url === 'string' || (body.avatar_url as any)?.toString) &&
            forbiddenRegExp.test(body.avatar_url as string)
        ) {
            set.status = 400;
            return;
        }

        try {
            if (!body?.format || !body?.avatar_url) {
                set.status = 400;
                return;
            }

            const filename = path.join(
                directories?.characters ?? '',
                sanitize(body.avatar_url as string),
            );

            if (!fs.existsSync(filename)) {
                set.status = 404;
                return;
            }

            switch (body.format) {
                case 'png': {
                    const rawBuffer = await fsPromises.readFile(filename);
                    const rawData = read(rawBuffer);
                    // @ts-expect-error TS(2345) FIXME: Argument of type '(char: Record<string, unknown>) ... Remove this comment to see the full error message
                    const mutatedData = mutateJsonString(rawData, unsetPrivateFields);
                    const mutatedBuffer = write(rawBuffer, mutatedData);
                    const contentType = Bun.file(filename).type;
                    set.headers['Content-Type'] = contentType;
                    set.headers['Content-Disposition'] =
                        `attachment; filename="${encodeURI(path.basename(filename))}"`;
                    return new Response(new Uint8Array(mutatedBuffer));
                }
                case 'json': {
                    try {
                        const json = await readCharacterData(filename);
                        if (json === undefined) {
                            set.status = 400;
                            return;
                        }
                        const jsonObject = getCharaCardV2(JSON.parse(json), directories as any);
                        unsetPrivateFields(jsonObject);
                        set.headers['Content-Type'] = 'application/json';
                        return JSON.stringify(jsonObject, null, 4);
                    } catch {
                        set.status = 400;
                        return;
                    }
                }
            }

            set.status = 400;
        } catch (err) {
            console.error('Character export failed', err);
            set.status = 500;
        }
    });
