import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';

import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import writeFileAtomic from 'write-file-atomic';
import yaml from 'yaml';
import { isPlainObject, cloneDeep } from 'es-toolkit/compat';

import storage from 'node-persist';

import {
    AVATAR_WIDTH,
    AVATAR_HEIGHT,
    DEFAULT_AVATAR_PATH,
    UPLOADS_DIRECTORY,
} from '../constants.js';
import { forbiddenRegExp } from '../middleware/validateFileName.js';
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

// With 100 MB limit it would take roughly 3000 characters to reach this limit
const memoryCacheCapacity = getConfigValue('performance.memoryCacheCapacity', '100mb');
const memoryCache = new MemoryLimitedMap(memoryCacheCapacity);
// Some Android devices require tighter memory management
const isAndroid = process.platform === 'android';
// Use shallow character data for the character list
const useShallowCharacters = !!getConfigValue('performance.lazyLoadCharacters', false, 'boolean');
const useDiskCache = !!getConfigValue('performance.useDiskCache', true, 'boolean');

interface UserDirectories {
    characters?: string;
    chats?: string;
    backups?: string;
    userImages?: string;
    root?: string;
    [key: string]: unknown;
}

interface UserContext {
    directories?: UserDirectories;
    profile?: { handle?: string };
    [key: string]: unknown;
}

function isForbiddenFilename(name: unknown): boolean {
    return typeof name === 'string' && forbiddenRegExp.test(name);
}

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
    #instance: any;

    /** @type {NodeJS.Timeout} */
    #syncInterval: NodeJS.Timeout | undefined;

    /**
     * Queue of user handles to sync.
     * @type {Set<string>}
     * @readonly
     */
    syncQueue = new Set<string>();

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
            for (let i = 0; i < directoriesList.length; i++) {
                const dir = directoriesList[i]!;
                const files = await fsp.readdir(dir.characters, { withFileTypes: true });
                for (let j = 0; j < files.length; j++) {
                    const file = files[j]!;
                    if (file.isFile() && file.name.endsWith('.png')) {
                        const filePath = path.join(dir.characters, file.name);
                        const cacheKey = await getCacheKey(filePath);
                        validKeys.add(path.parse(cache.getDatumPath(cacheKey)).base);
                    }
                }
            }
            const keys = this.hashedKeys;
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
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
 * @returns {Promise<string>} - Cache key
 */
async function getCacheKey(inputFile: string): Promise<string> {
    try {
        const stat = await fsp.stat(inputFile);
        return `${inputFile}-${stat.mtimeMs}`;
    } catch {
        return inputFile;
    }
}

/**
 * Reads the character card from the specified image file.
 * @param {string} inputFile - Path to the image file
 * @param {string} inputFormat - 'png'
 * @returns {Promise<string | undefined>} - Character card data
 */
async function readCharacterData(inputFile: string, inputFormat = 'png') {
    const cacheKey = await getCacheKey(inputFile);
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
    request: any,
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
                return await fsp.readFile(DEFAULT_AVATAR_PATH);
            }
        }

        const inputImage = await getInputImage();

        // Get the chunks
        const outputImage = write(inputImage, data);
        const outputImagePath = path.join(request.user.directories.characters, `${outputFile}.png`);

        await writeFileAtomic(outputImagePath, outputImage);
        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
}

type Crop = any;

export async function applyAvatarCropResize(buffer: Buffer, crop: Crop | undefined) {
    let pipeline = new Bun.Image(buffer);

    if (
        typeof crop === 'object' &&
        crop !== null &&
        typeof crop.x === 'number' &&
        typeof crop.y === 'number' &&
        typeof crop.width === 'number' &&
        typeof crop.height === 'number'
    ) {
        const width = Math.round(crop.width);
        const height = Math.round(crop.height);
        pipeline = pipeline.resize(width, height);

        if (crop.want_resize) {
            pipeline = pipeline.resize(AVATAR_WIDTH, AVATAR_HEIGHT);
        }
    } else {
        const metadata = await pipeline.metadata();
        const finalWidth = metadata.width ?? 0;
        const finalHeight = metadata.height ?? 0;
        pipeline = pipeline.resize(finalWidth, finalHeight);
    }

    return await pipeline.png().buffer();
}

async function parseImageBuffer(buffer: Buffer, crop: Crop | undefined) {
    return await applyAvatarCropResize(buffer, crop);
}

async function tryReadImage(imgPath: string, crop: Crop | undefined) {
    try {
        const buffer = await fsp.readFile(imgPath);
        return await applyAvatarCropResize(buffer, crop);
    } catch (error) {
        console.error(`Failed to read image: ${imgPath}`, error);
        return await fsp.readFile(imgPath);
    }
}

const calculateChatSize = async (charDir: string) => {
    let chatSize = 0;
    let dateLastChat = 0;

    try {
        const chats = await fsp.readdir(charDir);
        for (let i = 0; i < chats.length; i++) {
            const chatStat = await fsp.stat(path.join(charDir, chats[i]!));
            chatSize += chatStat.size;
            if (chatStat.mtimeMs > dateLastChat) {
                dateLastChat = chatStat.mtimeMs;
            }
        }
    } catch {
        // Directory does not exist
    }

    return { chatSize, dateLastChat };
};

const calculateDataSize = (data: unknown) => {
    if (data === null || typeof data !== 'object') return 0;
    let size = 0;
    const values = Object.values(data as Record<string, unknown>);
    for (let i = 0; i < values.length; i++) {
        size += String(values[i]).length;
    }
    return size;
};

const toShallow = (character: Record<string, unknown>) => {
    const data = (character.data as Record<string, unknown>) || {};
    const extensions = (data.extensions as Record<string, unknown>) || {};

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
            name: data.name ?? '',
            character_version: data.character_version ?? '',
            creator: data.creator ?? '',
            creator_notes: data.creator_notes ?? '',
            tags: data.tags ?? [],
            extensions: {
                fav: extensions.fav ?? false,
                world: extensions.world ?? '',
            },
        },
    };
};

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

        const charStat = await fsp.stat(imgFile);
        character.date_added = charStat.ctimeMs;
        character.create_date =
            jsonObject.create_date || new Date(Math.round(charStat.ctimeMs)).toISOString();

        const folderName = item.endsWith('.png') ? item.slice(0, -4) : item;
        const chatsDirectory = path.join(directories.chats, folderName);

        const { chatSize, dateLastChat } = await calculateChatSize(chatsDirectory);
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

function convertToV2(
    char: Record<string, unknown>,
    directories: import('../users.js').UserDirectoryList,
) {
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

function unsetPrivateFields(char: Record<string, unknown>) {
    char.fav = false;
    if (char.data && typeof char.data === 'object') {
        const data = char.data as Record<string, any>;
        if (data.extensions && typeof data.extensions === 'object') {
            data.extensions.fav = false;
        }
    }
    delete char.chat;
}

function readFromV2(char: Record<string, unknown>) {
    if (char.data === undefined || char.data === null || typeof char.data !== 'object') {
        console.warn(`Char ${char.name} has Spec v2 data missing`);
        return char;
    }

    delete char.json_data;

    const data = char.data as Record<string, any>;

    if (data.name !== undefined) char.name = data.name;
    if (data.description !== undefined) char.description = data.description;
    if (data.personality !== undefined) char.personality = data.personality;
    if (data.scenario !== undefined) char.scenario = data.scenario;
    if (data.first_mes !== undefined) char.first_mes = data.first_mes;
    if (data.mes_example !== undefined) char.mes_example = data.mes_example;
    if (data.tags !== undefined) char.tags = data.tags;

    const ext = data.extensions;
    char.talkativeness = ext?.talkativeness ?? 0.5;
    char.fav = ext?.fav ?? false;

    char.chat = char.chat ?? `${char.name} - ${humanizedDateTime()}`;

    return char;
}

function charaFormatData(
    data: Record<string, unknown>,
    directories: import('../users.js').UserDirectoryList,
) {
    const char = (tryParse(data.json_data as string) || {}) as Record<string, any>;
    delete char.json_data;

    const getAlternateGreetings = (d: Record<string, unknown>) => {
        if (Array.isArray(d.alternate_greetings)) return d.alternate_greetings;
        if (typeof d.alternate_greetings === 'string') return [d.alternate_greetings];
        return [];
    };

    const tagsFormatted =
        typeof data.tags === 'string'
            ? data.tags.split(',').map((x: string) => x.trim()).filter(Boolean)
            : data.tags || [];

    const depth_default = 4;
    const role_default = 'system';
    const depth_value = !isNaN(Number(data.depth_prompt_depth))
        ? Number(data.depth_prompt_depth)
        : depth_default;
    const role_value = data.depth_prompt_role ?? role_default;

    char.name = data.ch_name;
    char.description = data.description || '';
    char.personality = data.personality || '';
    char.scenario = data.scenario || '';
    char.first_mes = data.first_mes || '';
    char.mes_example = data.mes_example || '';

    char.creatorcomment = data.creator_notes || '';
    char.avatar = 'none';
    char.chat = `${data.ch_name} - ${humanizedDateTime()}`;
    char.talkativeness = data.talkativeness || 0.5;
    char.fav = data.fav === 'true' || data.fav === true;
    char.tags = tagsFormatted;

    char.spec = 'chara_card_v2';
    char.spec_version = '2.0';

    if (!char.data || typeof char.data !== 'object') {
        char.data = {};
    }
    const charData = char.data;

    charData.name = data.ch_name;
    charData.description = data.description || '';
    charData.personality = data.personality || '';
    charData.scenario = data.scenario || '';
    charData.first_mes = data.first_mes || '';
    charData.mes_example = data.mes_example || '';

    charData.creator_notes = data.creator_notes || '';
    charData.system_prompt = data.system_prompt || '';
    charData.post_history_instructions = data.post_history_instructions || '';
    charData.tags = tagsFormatted;
    charData.creator = data.creator || '';
    charData.character_version = data.character_version || '';
    charData.alternate_greetings = getAlternateGreetings(data);

    if (!charData.extensions || typeof charData.extensions !== 'object') {
        charData.extensions = {};
    }
    const ext = charData.extensions;

    ext.talkativeness = data.talkativeness || 0.5;
    ext.fav = data.fav === 'true' || data.fav === true;
    ext.world = data.world || '';

    if (!ext.depth_prompt || typeof ext.depth_prompt !== 'object') {
        ext.depth_prompt = {};
    }
    ext.depth_prompt.prompt = data.depth_prompt_prompt ?? '';
    ext.depth_prompt.depth = depth_value;
    ext.depth_prompt.role = role_value;

    if (data.world) {
        try {
            const file = readWorldInfoFile(directories, data.world as string, false);

            if (file && file.originalData) {
                charData.character_book = file.originalData;
            } else if (file && file.entries) {
                charData.character_book = convertWorldInfoToCharacterBook(
                    data.world as string,
                    file.entries as any,
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
            const extensions =
                typeof data.extensions === 'string'
                    ? JSON.parse(data.extensions)
                    : data.extensions;
            charData.extensions = deepMerge(charData.extensions, extensions);
        } catch {
            console.warn(`Failed to parse extensions JSON: ${data.extensions}`);
        }
    }

    return char;
}

function convertWorldInfoToCharacterBook(name: string, entries: Record<string, unknown>) {
    const entryValues = Object.values(entries);
    const count = entryValues.length;
    const resultEntries = Array.from({ length: count });

    for (let i = 0; i < count; i++) {
        const entry = entryValues[i] as Record<string, any>;

        resultEntries[i] = {
            id: entry.uid,
            keys: entry.key,
            secondary_keys: entry.keysecondary,
            comment: entry.comment,
            content: entry.content,
            constant: entry.constant,
            selective: entry.selective,
            insertion_order: entry.order,
            enabled: !entry.disable,
            position: entry.position == 0 ? 'before_char' : 'after_char',
            use_regex: true,
            extensions: {
                ...entry.extensions,
                position: entry.position,
                exclude_recursion: entry.excludeRecursion,
                display_index: entry.displayIndex,
                probability: entry.probability ?? null,
                useProbability: entry.useProbability ?? false,
                depth: entry.depth ?? 4,
                selectiveLogic: entry.selectiveLogic ?? 0,
                outlet_name: entry.outletName ?? '',
                group: entry.group ?? '',
                group_override: entry.groupOverride ?? false,
                group_weight: entry.groupWeight ?? null,
                prevent_recursion: entry.preventRecursion ?? false,
                delay_until_recursion: entry.delayUntilRecursion ?? false,
                scan_depth: entry.scanDepth ?? null,
                match_whole_words: entry.matchWholeWords ?? null,
                use_group_scoring: entry.useGroupScoring ?? false,
                case_sensitive: entry.caseSensitive ?? null,
                automation_id: entry.automationId ?? '',
                role: entry.role ?? 0,
                vectorized: entry.vectorized ?? false,
                sticky: entry.sticky ?? null,
                cooldown: entry.cooldown ?? null,
                delay: entry.delay ?? null,
                match_persona_description: entry.matchPersonaDescription ?? false,
                match_character_description: entry.matchCharacterDescription ?? false,
                match_character_personality: entry.matchCharacterPersonality ?? false,
                match_character_depth_prompt: entry.matchCharacterDepthPrompt ?? false,
                match_scenario: entry.matchScenario ?? false,
                match_creator_notes: entry.matchCreatorNotes ?? false,
                triggers: entry.triggers ?? [],
                ignore_budget: entry.ignoreBudget ?? false,
            },
        };
    }

    return { entries: resultEntries, name };
}

async function importFromYaml(
    uploadPath: string,
    context: { request: any; response: any },
    preservedFileName: string | undefined,
) {
    const fileText = await fsp.readFile(uploadPath, 'utf8');
    await fsp.unlink(uploadPath);
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

async function importFromCharX(
    uploadPath: string,
    { request }: { request: any },
    preservedFileName: string | undefined,
) {
    const fileBuffer = await fsp.readFile(uploadPath);
    const data = fileBuffer.buffer.slice(
        fileBuffer.byteOffset,
        fileBuffer.byteOffset + fileBuffer.byteLength,
    );
    await fsp.unlink(uploadPath);

    const parser = new CharXParser(data);
    const { card, avatar, auxiliaryAssets, extractedBuffers } = await parser.parse();

    if (card.data?.name) {
        card.data.name = sanitize(card.data.name);
    }
    card.name = sanitize(card.data?.name || card.name);
    const processedCard = readFromV2(card);
    unsetPrivateFields(processedCard);
    processedCard.create_date = new Date().toISOString();

    const fileName = preservedFileName || getPngName(processedCard.name as string, request.user.directories);
    const characterFolder = processedCard.name as string;

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

async function importFromByaf(
    uploadPath: string,
    { request }: { request: any },
    preservedFileName: string | undefined,
) {
    const data = (await fsp.readFile(uploadPath)).buffer;
    await fsp.unlink(uploadPath);
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

    if (!preservedFileName) {
        const createChatAsCurrentPersona = async (scenario: Record<string, unknown>) => {
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
            await fsp.mkdir(dir, { recursive: true });
            await writeFileAtomic(
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

        for (let i = 0; i < byafData.chatBackgrounds.length; i++) {
            const bg = byafData.chatBackgrounds[i]!;
            const extension = path.extname(bg.paths?.[0] ?? '') || '.png';
            const baseName = `${path.basename(fileName)}_bg`;
            const filePath = path.join(request.user.directories.userImages!, fileName);
            await fsp.mkdir(filePath, { recursive: true });
            const file = getUniqueName(baseName, (name: string) =>
                fs.existsSync(path.join(filePath, `${name}${extension}`)),
            );
            if (Buffer.isBuffer(bg.data)) {
                const newFile = `${file}${extension}`;
                await writeFileAtomic(path.join(filePath, newFile), bg.data);
                bg.name = clientRelativePath(
                    request.user.directories.root,
                    path.join(filePath, newFile),
                );
                console.log(`Created ${newFile} background from BYAF import`);
            }
        }

        const chats = [];
        if (Array.isArray(byafData.scenarios)) {
            for (let i = 0; i < byafData.scenarios.length; i++) {
                chats.push(await createChatAsCurrentPersona(byafData.scenarios[i]));
            }
        }

        if (chats.length > 0) {
            const chat = chats[0]!;
            const extIdx = chat.lastIndexOf('.');
            card.chat = extIdx !== -1 ? chat.slice(0, extIdx) : chat;
        }

        for (let i = 0; i < byafData.images.length; i++) {
            if (i === 0) continue;
            const icon = byafData.images[i]!;
            const altImagesFolder = path.join(
                request.user.directories.characters!,
                sanitize(card.name as string),
            );
            await fsp.mkdir(altImagesFolder, { recursive: true });
            const extension = path.extname(icon.filename) || '.png';
            const file = getUniqueName(
                `${sanitize(icon.label, { replacement: sanitizeSafeCharacterReplacements }) || 'alt'}`,
                (name: string) => fs.existsSync(path.join(altImagesFolder, `${name}${extension}`)),
            );
            if (Buffer.isBuffer(icon.image)) {
                await writeFileAtomic(path.join(altImagesFolder, `${file}${extension}`), icon.image);
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

async function importFromJson(
    uploadPath: string,
    { request }: { request: any },
    preservedFileName: string | undefined,
) {
    const data = await fsp.readFile(uploadPath, 'utf8');
    await fsp.unlink(uploadPath);

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
        let char: Record<string, any> = {
            name: jsonData.name,
            description: jsonData.description ?? '',
            creatorcomment: jsonData.creatorcomment ?? jsonData.creator_notes ?? '',
            personality: jsonData.personality ?? '',
            first_mes: jsonData.first_mes ?? '',
            avatar: 'none',
            chat: `${jsonData.name} - ${humanizedDateTime()}`,
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
        console.info('Importing from gradio json');
        jsonData.char_name = sanitize(jsonData.char_name);
        if (jsonData.creator_notes) {
            jsonData.creator_notes = jsonData.creator_notes.replace("Creator's notes go here.", '');
        }
        const pngName =
            preservedFileName || getPngName(jsonData.char_name, request.user.directories);
        let char: Record<string, any> = {
            name: jsonData.char_name,
            description: jsonData.char_persona ?? '',
            creatorcomment: jsonData.creatorcomment ?? jsonData.creator_notes ?? '',
            personality: '',
            first_mes: jsonData.char_greeting ?? '',
            avatar: 'none',
            chat: `${jsonData.name} - ${humanizedDateTime()}`,
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

async function importFromPng(
    uploadPath: string,
    { request }: { request: any },
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
        await fsp.unlink(uploadPath);
        return result ? pngName : '';
    } else if (jsonData.name !== undefined) {
        console.info('Found a v1 character file.');

        if (jsonData.creator_notes) {
            jsonData.creator_notes = jsonData.creator_notes.replace("Creator's notes go here.", '');
        }

        let char: Record<string, any> = {
            name: jsonData.name,
            description: jsonData.description ?? '',
            creatorcomment: jsonData.creatorcomment ?? jsonData.creator_notes ?? '',
            personality: jsonData.personality ?? '',
            first_mes: jsonData.first_mes ?? '',
            avatar: 'none',
            chat: `${jsonData.name} - ${humanizedDateTime()}`,
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
        await fsp.unlink(uploadPath);
        return result ? pngName : '';
    }

    return '';
}

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

function getPreservedName(request: Record<string, any>) {
    const name = request?.body?.preserved_name;
    if (typeof name === 'string' && name.length > 0) {
        const lastSlash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        const base = lastSlash !== -1 ? name.slice(lastSlash + 1) : name;
        const lastDot = base.lastIndexOf('.');
        return lastDot !== -1 ? base.slice(0, lastDot) : base;
    }
    return undefined;
}

const UNSET_SENTINEL = '__@@UNSET@@__';
const BULK_MERGE_CONCURRENCY = 10;

function processUnsetSentinels(target: Record<string, unknown>, source: Record<string, unknown>) {
    const keys = Object.keys(source);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i]!;
        const sourceVal = source[key];
        if (sourceVal === UNSET_SENTINEL) {
            delete target[key];
        } else if (isPlainObject(sourceVal) && isPlainObject(target[key])) {
            processUnsetSentinels(
                target[key] as Record<string, unknown>,
                sourceVal as Record<string, unknown>,
            );
        }
    }
}

async function mergeCharacterUpdate(
    avatarPath: string,
    avatar: string,
    updateData: Record<string, unknown>,
    request: any,
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
    delete update.json_data;
    delete character.json_data;

    character = deepMerge(character, update);
    processUnsetSentinels(character, update);

    const validator = new TavernCardValidator(character);
    if (!validator.validate()) {
        return { ok: false, error: validator.lastValidationError ?? 'Validation failed' };
    }

    const targetImg = avatar.endsWith('.png') ? avatar.slice(0, -4) : avatar;
    await writeCharacterData(avatarPath, JSON.stringify(character), targetImg, request);
    return { ok: true };
}

export const router = new Elysia({ prefix: '/api/characters' })
    .post('/create', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const body = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;
        const uploadedFile = ctx.file as { destination?: string; filename?: string } | undefined;
        const query = (ctx.query ?? {}) as Record<string, string>;

        const mockRequest = {
            user: {
                directories,
                profile: { handle: user?.profile?.handle ?? '' },
            },
        };

        try {
            if (!body) {
                set.status = 400;
                return;
            }

            const fileNameParam = body.file_name;
            if (isForbiddenFilename(fileNameParam)) {
                set.status = 400;
                return;
            }

            const rawChName = body.ch_name as string;
            body.ch_name = sanitize(rawChName);

            const char = JSON.stringify(charaFormatData(body, directories as any));
            const internalName =
                (fileNameParam as string) ||
                getPngName(body.ch_name as string, directories as any);
            const avatarName = `${internalName}.png`;
            const chatsPath = path.join(directories?.chats ?? '', internalName);

            await fsp.mkdir(chatsPath, { recursive: true });

            if (!uploadedFile) {
                await writeCharacterData(DEFAULT_AVATAR_PATH, char, internalName, mockRequest);
                return avatarName;
            } else {
                const crop = tryParse(String(query.crop ?? ''));
                const uploadPath = path.join(uploadedFile.destination ?? '', uploadedFile.filename ?? '');
                await writeCharacterData(uploadPath, char, internalName, mockRequest, crop);
                await fsp.unlink(uploadPath);
                return avatarName;
            }
        } catch (err) {
            console.error(err);
            set.status = 500;
        }
    })
    .post('/rename', async (context) => {
        const { set: elysiaSet } = context;
        const ctx = context as Record<string, unknown>;
        const body = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

        const mockRequest = {
            user: {
                directories,
                profile: { handle: user?.profile?.handle ?? '' },
            },
        };

        const avatarUrl = body?.avatar_url;
        if (isForbiddenFilename(avatarUrl)) {
            elysiaSet.status = 400;
            return;
        }

        const newNameRaw = body?.new_name;
        if (!avatarUrl || !newNameRaw) {
            elysiaSet.status = 400;
            return;
        }

        const oldAvatarName = avatarUrl as string;
        const newName = sanitize(newNameRaw as string);
        const oldInternalName = oldAvatarName.endsWith('.png') ? oldAvatarName.slice(0, -4) : oldAvatarName;
        const newInternalName = getPngName(newName, directories as any);
        const newAvatarName = `${newInternalName}.png`;

        const charactersDir = directories?.characters ?? '';
        const chatsDir = directories?.chats ?? '';

        const oldAvatarPath = path.join(charactersDir, oldAvatarName);
        const oldChatsPath = path.join(chatsDir, oldInternalName);
        const newChatsPath = path.join(chatsDir, newInternalName);

        try {
            const rawOldData = await readCharacterData(oldAvatarPath);
            if (rawOldData === undefined) throw new Error('Failed to read character file');

            const oldData = getCharaCardV2(JSON.parse(rawOldData), directories as any);
            if (!oldData.data || typeof oldData.data !== 'object') oldData.data = {};
            (oldData.data as Record<string, unknown>).name = newName;
            oldData.name = newName;
            const newData = JSON.stringify(oldData);

            await writeCharacterData(oldAvatarPath, newData, newInternalName, mockRequest);

            try {
                await fsp.cp(oldChatsPath, newChatsPath, { recursive: true });
                await fsp.rm(oldChatsPath, { recursive: true, force: true });
            } catch {
                // Chats directory might not exist
            }

            await fsp.unlink(oldAvatarPath);

            return { avatar: newAvatarName };
        } catch (err) {
            console.error(err);
            elysiaSet.status = 500;
        }
    })
    .post('/edit', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const body = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;
        const uploadedFile = ctx.file as { destination?: string; filename?: string } | undefined;
        const query = (ctx.query ?? {}) as Record<string, string>;

        const mockRequest = {
            user: {
                directories,
                profile: { handle: user?.profile?.handle ?? '' },
            },
        };

        const avatarUrl = body?.avatar_url;
        if (isForbiddenFilename(avatarUrl)) {
            set.status = 400;
            return;
        }

        if (!body) {
            console.warn('Error: no response body detected');
            set.status = 400;
            return 'Error: no response body detected';
        }

        const chName = body.ch_name;
        if (chName === '' || chName === undefined || chName === '.') {
            console.warn('Error: invalid name.');
            set.status = 400;
            return 'Error: invalid name.';
        }

        const char = charaFormatData(body, directories as any);
        char.chat = body.chat;
        char.create_date = body.create_date;
        const charJsonString = JSON.stringify(char);

        const avatarUrlStr = avatarUrl as string;
        const targetFile = avatarUrlStr.endsWith('.png') ? avatarUrlStr.slice(0, -4) : avatarUrlStr;
        const charactersDir = directories?.characters ?? '';

        try {
            if (!uploadedFile) {
                const avatarPath = path.join(charactersDir, avatarUrlStr);
                await writeCharacterData(avatarPath, charJsonString, targetFile, mockRequest);
            } else {
                const crop = tryParse(String(query.crop ?? ''));
                const newAvatarPath = path.join(uploadedFile.destination ?? '', uploadedFile.filename ?? '');
                invalidateThumbnail(directories as any, 'avatar', avatarUrlStr);
                await writeCharacterData(newAvatarPath, charJsonString, targetFile, mockRequest, crop);
                await fsp.unlink(newAvatarPath);

                set.headers['Clear-Site-Data'] = '"cache"';
            }

            return;
        } catch (err) {
            console.error('An error occurred, character edit invalidated.', err);
            set.status = 500;
        }
    })
    .post('/edit-avatar', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const body = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;
        const uploadedFile = ctx.file as { destination?: string; filename?: string } | undefined;
        const query = (ctx.query ?? {}) as Record<string, string>;

        const mockRequest = {
            user: {
                directories,
                profile: { handle: user?.profile?.handle ?? '' },
            },
        };

        const avatarUrl = body?.avatar_url;
        if (isForbiddenFilename(avatarUrl)) {
            set.status = 400;
            return;
        }

        try {
            if (!uploadedFile) {
                set.status = 400;
                return 'Error: no file uploaded';
            }

            if (!body || !avatarUrl) {
                set.status = 400;
                return 'Error: no avatar_url in request body';
            }

            const avatarUrlStr = avatarUrl as string;
            const uploadPath = path.join(uploadedFile.destination ?? '', uploadedFile.filename ?? '');
            const charactersDir = directories?.characters ?? '';
            const characterPath = path.join(charactersDir, avatarUrlStr);

            const data = await readCharacterData(characterPath);
            if (!data) {
                set.status = 400;
                return 'Error: failed to read character data';
            }

            const crop = tryParse(String(query.crop ?? ''));
            const fileName = avatarUrlStr.endsWith('.png') ? avatarUrlStr.slice(0, -4) : avatarUrlStr;
            await writeCharacterData(uploadPath, data, fileName, mockRequest, crop);

            await fsp.unlink(uploadPath);

            set.headers['Clear-Site-Data'] = '"cache"';
            invalidateThumbnail(directories as any, 'avatar', avatarUrlStr);

            return;
        } catch (err) {
            console.error('An error occurred while editing avatar', err);
            set.status = 500;
        }
    })
    .post('/edit-attribute', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const body = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

        const mockRequest = {
            user: {
                directories,
                profile: { handle: user?.profile?.handle ?? '' },
            },
        };

        const avatarUrl = body?.avatar_url;
        if (isForbiddenFilename(avatarUrl)) {
            set.status = 400;
            return;
        }

        if (!body) {
            console.warn('Error: no response body detected');
            set.status = 400;
            return 'Error: no response body detected';
        }

        const chName = body.ch_name;
        if (chName === '' || chName === undefined || chName === '.') {
            console.warn('Error: invalid name.');
            set.status = 400;
            return 'Error: invalid name.';
        }

        const field = body.field as string;
        if (field === 'json_data') {
            console.warn('Error: cannot edit json_data field.');
            set.status = 400;
            return 'Error: cannot edit json_data field.';
        }

        try {
            const avatarUrlStr = avatarUrl as string;
            const avatarPath = path.join(directories?.characters ?? '', avatarUrlStr);
            const charJSON = await readCharacterData(avatarPath);
            if (typeof charJSON !== 'string') throw new Error('Failed to read character file');

            const char = JSON.parse(charJSON);
            if (char[field] === undefined && char.data?.[field] === undefined) {
                console.warn('Error: invalid field.');
                set.status = 400;
                return 'Error: invalid field.';
            }

            const val = body.value;
            char[field] = val;
            if (char.data && typeof char.data === 'object') {
                char.data[field] = val;
            }

            const newCharJSON = JSON.stringify(char);
            const targetFile = avatarUrlStr.endsWith('.png') ? avatarUrlStr.slice(0, -4) : avatarUrlStr;
            await writeCharacterData(avatarPath, newCharJSON, targetFile, mockRequest);
            return;
        } catch (err) {
            console.error('An error occurred, character edit invalidated.', err);
            set.status = 500;
        }
    })
    .post('/merge-attributes', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const body = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

        const mockRequest = {
            user: {
                directories,
                profile: { handle: user?.profile?.handle ?? '' },
            },
        };

        const avatarParam = body?.avatar;
        if (isForbiddenFilename(avatarParam)) {
            set.status = 400;
            return;
        }

        try {
            if (!body) {
                set.status = 400;
                return;
            }

            if (Array.isArray(body.avatars)) {
                const { avatars, data, filter } = body as any;

                if (!isPlainObject(data)) {
                    set.status = 400;
                    return { message: 'No valid update data provided.' };
                }

                let targetAvatars: string[];
                const charactersDir = directories?.characters ?? '';

                if (avatars.length > 0) {
                    for (let i = 0; i < avatars.length; i++) {
                        const avatar = avatars[i];
                        if (
                            typeof avatar !== 'string' ||
                            forbiddenRegExp.test(avatar) ||
                            !avatar.toLowerCase().endsWith('.png')
                        ) {
                            set.status = 400;
                            return { message: `Invalid avatar filename: ${avatar}` };
                        }
                    }
                    targetAvatars = avatars;
                } else {
                    const files = await fsp.readdir(charactersDir);
                    targetAvatars = files.filter((file) => file.toLowerCase().endsWith('.png'));
                }

                const updated: string[] = [];
                const skipped: string[] = [];
                const failed: string[] = [];

                const processOne = async (avatar: string) => {
                    const avatarPath = path.join(charactersDir, avatar);

                    try {
                        let shouldSkip: ((character: Record<string, unknown>) => boolean) | null = null;

                        if (filter && typeof filter.path === 'string') {
                            shouldSkip = (character: Record<string, unknown>) => {
                                const val = filter.path
                                    .split('.')
                                    .reduce((acc: any, key: string) => acc?.[key], character);
                                return val === undefined;
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

                for (let i = 0; i < targetAvatars.length; i += BULK_MERGE_CONCURRENCY) {
                    const batch = targetAvatars.slice(i, i + BULK_MERGE_CONCURRENCY);
                    await Promise.allSettled(batch.map(processOne));
                }

                return { updated, skipped, failed };
            }

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
                error: String(exception),
            };
        }
    })
    .post('/delete', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const body = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

        const avatarUrl = body?.avatar_url;
        if (isForbiddenFilename(avatarUrl)) {
            set.status = 400;
            return;
        }

        if (!avatarUrl || typeof avatarUrl !== 'string') {
            set.status = 400;
            return;
        }

        const sanitizedAvatar = sanitize(avatarUrl);
        if (avatarUrl !== sanitizedAvatar) {
            console.error('Malicious filename prevented');
            set.status = 403;
            return;
        }

        const charactersDir = directories?.characters ?? '';
        const avatarPath = path.join(charactersDir, sanitizedAvatar);

        try {
            await fsp.unlink(avatarPath);
        } catch {
            set.status = 400;
            return;
        }

        invalidateThumbnail(directories as any, 'avatar', sanitizedAvatar);
        const dirName = sanitizedAvatar.endsWith('.png') ? sanitizedAvatar.slice(0, -4) : sanitizedAvatar;

        if (!dirName.length) {
            console.error('Malicious dirname prevented');
            set.status = 403;
            return;
        }

        if (body.delete_chats === true) {
            try {
                const chatsDir = directories?.chats ?? '';
                await fsp.rm(path.join(chatsDir, sanitize(dirName)), {
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
        const ctx = context as Record<string, unknown>;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

        try {
            const charactersDir = directories?.characters ?? '';
            const files = await fsp.readdir(charactersDir);

            const pngFiles: string[] = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i]!;
                if (file.endsWith('.png')) {
                    pngFiles.push(file);
                }
            }

            const processingPromises: Promise<any>[] = Array.from({ length: pngFiles.length });
            for (let i = 0; i < pngFiles.length; i++) {
                processingPromises[i] = processCharacter(pngFiles[i]!, directories as any, {
                    shallow: useShallowCharacters,
                });
            }

            const rawResults = await Promise.all(processingPromises);
            const data: any[] = [];
            for (let i = 0; i < rawResults.length; i++) {
                const item = rawResults[i];
                if (item && item.name) {
                    data.push(item);
                }
            }

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
        const ctx = context as Record<string, unknown>;
        const body = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

        const avatarUrl = body?.avatar_url;
        if (isForbiddenFilename(avatarUrl)) {
            set.status = 400;
            return;
        }

        try {
            if (!body || !avatarUrl || typeof avatarUrl !== 'string') {
                set.status = 400;
                return;
            }

            const item = avatarUrl;
            const charactersDir = directories?.characters ?? '';
            const filePath = path.join(charactersDir, item);

            try {
                await fsp.access(filePath);
            } catch {
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
        const ctx = context as Record<string, unknown>;
        const body = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

        const avatarUrl = body?.avatar_url;
        if (isForbiddenFilename(avatarUrl)) {
            set.status = 400;
            return;
        }

        try {
            if (!body || !avatarUrl || typeof avatarUrl !== 'string') {
                set.status = 400;
                return;
            }

            const characterDirectory = avatarUrl.endsWith('.png') ? avatarUrl.slice(0, -4) : avatarUrl;
            const chatsDirectory = path.join(directories?.chats ?? '', characterDirectory);

            let files: fs.Dirent[];
            try {
                files = await fsp.readdir(chatsDirectory, { withFileTypes: true });
            } catch {
                return { error: true };
            }

            const jsonFiles: string[] = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i]!;
                if (file.isFile() && file.name.endsWith('.jsonl')) {
                    jsonFiles.push(file.name);
                }
            }

            if (jsonFiles.length === 0) {
                return [];
            }

            if (body.simple) {
                const count = jsonFiles.length;
                const simpleResults = Array.from({ length: count });
                for (let i = 0; i < count; i++) {
                    const fileName = jsonFiles[i]!;
                    const fileId = fileName.endsWith('.jsonl') ? fileName.slice(0, -6) : fileName;
                    simpleResults[i] = {
                        file_name: fileName,
                        file_id: fileId,
                    };
                }
                return simpleResults;
            }

            const withMetadata = Boolean(body.metadata);
            const chatsDirBase = directories?.chats ?? '';
            const count = jsonFiles.length;
            const jsonFilesPromise: Promise<Record<string, unknown>>[] = Array.from({ length: count });

            for (let i = 0; i < count; i++) {
                const file = jsonFiles[i]!;
                const pathToFile = path.join(chatsDirBase, characterDirectory, file);
                jsonFilesPromise[i] = getChatInfo(pathToFile, {}, withMetadata);
            }

            const settled = await Promise.allSettled(jsonFilesPromise);
            const validFiles: any[] = [];

            for (let i = 0; i < settled.length; i++) {
                const res = settled[i]!;
                if (res.status === 'fulfilled' && res.value && res.value.file_name) {
                    validFiles.push(res.value);
                }
            }

            return validFiles;
        } catch (error) {
            console.error(error);
            return { error: true };
        }
    })
    .post('/import', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const body = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;
        const uploadedFile = ctx.file as { destination?: string; filename?: string } | undefined;

        const mockRequest = {
            user: {
                directories,
                profile: { handle: user?.profile?.handle ?? '' },
            },
        };

        if (!body) {
            set.status = 400;
            return;
        }

        let uploadPath: string;
        const elysiaFile = body.avatar;

        if (uploadedFile) {
            uploadPath = path.join(
                uploadedFile.destination ?? '',
                uploadedFile.filename ?? '',
            );
        } else if (
            typeof elysiaFile === 'object' &&
            elysiaFile !== null &&
            'arrayBuffer' in (elysiaFile as any)
        ) {
            const fileObj = elysiaFile as File;
            const buffer = Buffer.from(await fileObj.arrayBuffer());
            const dataRoot = (globalThis as Record<string, unknown>).DATA_ROOT as string ?? '';
            const uploadsDir = path.join(dataRoot, UPLOADS_DIRECTORY);
            const tempName = randomUUID();
            uploadPath = path.join(uploadsDir, tempName);
            await fsp.writeFile(uploadPath, buffer);
        } else {
            set.status = 400;
            return;
        }
        const format = body.file_type as string;
        const preservedFileName = getPreservedName({ body });

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
        const ctx = context as Record<string, unknown>;
        const body = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

        const avatarUrl = body?.avatar_url;
        if (isForbiddenFilename(avatarUrl)) {
            set.status = 400;
            return;
        }

        try {
            if (!body || !avatarUrl || typeof avatarUrl !== 'string') {
                console.warn('avatar URL not found in request body');
                set.status = 400;
                return;
            }

            const charactersDir = directories?.characters ?? '';
            const sanitizedAvatar = sanitize(avatarUrl);
            const filename = path.join(charactersDir, sanitizedAvatar);

            try {
                await fsp.access(filename);
            } catch {
                console.error('file for dupe not found', filename);
                set.status = 404;
                return;
            }

            let suffix = 1;

            const nameParts = sanitizedAvatar.endsWith('.png')
                ? sanitizedAvatar.slice(0, -4).split('_')
                : sanitizedAvatar.split('_');

            const lastPart = nameParts[nameParts.length - 1]!;
            let baseName: string;

            if (!isNaN(Number(lastPart)) && nameParts.length > 1) {
                suffix = parseInt(lastPart, 10) + 1;
                baseName = nameParts.slice(0, -1).join('_');
            } else {
                baseName = nameParts.join('_');
            }

            let newFilename = path.join(charactersDir, `${baseName}_${suffix}.png`);

            while (true) {
                try {
                    await fsp.access(newFilename);
                    suffix++;
                    newFilename = path.join(charactersDir, `${baseName}_${suffix}.png`);
                } catch {
                    break;
                }
            }

            await fsp.copyFile(filename, newFilename);
            console.info(`${filename} was copied to ${newFilename}`);

            const lastSlash = Math.max(newFilename.lastIndexOf('/'), newFilename.lastIndexOf('\\'));
            const baseFile = lastSlash !== -1 ? newFilename.slice(lastSlash + 1) : newFilename;

            return { path: baseFile };
        } catch (error) {
            console.error(error);
            return { error: true };
        }
    })
    .post('/export', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const body = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

        const avatarUrl = body?.avatar_url;
        if (isForbiddenFilename(avatarUrl)) {
            set.status = 400;
            return;
        }

        try {
            if (!body || !body.format || !avatarUrl || typeof avatarUrl !== 'string') {
                set.status = 400;
                return;
            }

            const sanitizedAvatar = sanitize(avatarUrl);
            const charactersDir = directories?.characters ?? '';
            const filename = path.join(charactersDir, sanitizedAvatar);

            try {
                await fsp.access(filename);
            } catch {
                set.status = 404;
                return;
            }

            switch (body.format) {
                case 'png': {
                    const rawBuffer = await fsp.readFile(filename);
                    const rawData = read(rawBuffer);
                    const mutatedData = mutateJsonString(rawData, unsetPrivateFields as (obj: unknown) => void);
                    const mutatedBuffer = write(rawBuffer, mutatedData);
                    const contentType = Bun.file(filename).type;
                    set.headers['Content-Type'] = contentType;
                    set.headers['Content-Disposition'] =
                        `attachment; filename="${encodeURI(sanitizedAvatar)}"`;
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
