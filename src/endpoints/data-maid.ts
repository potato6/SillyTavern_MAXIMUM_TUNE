import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Elysia } from 'elysia';
import { getSettingsBackupFilePrefix } from './settings.js';
import { CHAT_BACKUPS_PREFIX } from './chats.js';
import { isPathUnderParent, tryParse } from '../util.js';
import { SETTINGS_FILE } from '../constants.js';

const sha256 = (str: string) => crypto.createHash('sha256').update(str).digest('hex');

interface DataMaidRawReport {
    images: string[];
    files: string[];
    chats: string[];
    groupChats: string[];
    avatarThumbnails: string[];
    backgroundThumbnails: string[];
    personaThumbnails: string[];
    chatBackups: string[];
    settingsBackups: string[];
}

interface DataMaidFile {
    url: string;
}

interface DataMaidMedia {
    url: string;
}

interface DataMaidMessageExtra {
    image?: string;
    video?: string;
    image_swipes?: string[];
    media?: DataMaidMedia[];
    file?: DataMaidFile;
    files?: DataMaidFile[];
}

interface DataMaidChatMetadata {
    attachments?: DataMaidFile[];
    chat_backgrounds?: string[];
}

interface DataMaidMessage {
    extra?: DataMaidMessageExtra;
    chat_metadata?: DataMaidChatMetadata;
}

/**
 * Service for detecting and managing loose user data files.
 * Helps identify orphaned files that are no longer referenced by the application.
 */
export class DataMaidService {
    /**
     * @type {Map<string, DataMaidTokenEntry>} Map clean-up tokens to user IDs
     */
    static TOKENS = new Map();

    directories: import('../users.js').UserDirectoryList;
    handle: string;

    /**
     * Creates a new DataMaidService instance for a specific user.
     * @param {string} handle - The user's handle.
     * @param {import('../users.js').UserDirectoryList} directories - List of user directories to scan for loose data.
     */
    constructor(handle: string, directories: import('../users.js').UserDirectoryList) {
        this.handle = handle;
        this.directories = directories;
    }

    /**
     * Generates a report of loose user data.
     * @returns {Promise<DataMaidRawReport>} A report containing lists of loose user data.
     */
    async generateReport() {
        /** @type {DataMaidRawReport} */
        const report = {
            images: await this.#collectImages(),
            files: await this.#collectFiles(),
            chats: await this.#collectChats(),
            groupChats: await this.#collectGroupChats(),
            avatarThumbnails: await this.#collectAvatarThumbnails(),
            backgroundThumbnails: await this.#collectBackgroundThumbnails(),
            personaThumbnails: await this.#collectPersonaThumbnails(),
            chatBackups: await this.#collectChatBackups(),
            settingsBackups: await this.#collectSettingsBackups(),
        };

        return report;
    }

    /**
     * Sanitizes a record by hashing the file name and removing sensitive information.
     * Additionally, adds metadata like size and modification time.
     * @param {string} name The file or directory name to sanitize.
     * @param {boolean} withParent If the model should include the parent directory name.
     * @returns {Promise<DataMaidSanitizedRecord>} A sanitized record with the file name, hash, parent directory name, size, and modification time.
     */
    async #sanitizeRecord(name: string, withParent: boolean) {
        const stat = fs.existsSync(name) ? await fs.promises.stat(name) : null;
        return {
            name: path.basename(name),
            hash: sha256(name),
            parent: withParent ? path.basename(path.dirname(name)) : void 0,
            size: stat?.size,
            mtime: stat?.mtimeMs,
        };
    }

    /**
     * Sanitizes the report by hashing the file paths and removing sensitive information.
     * @param {DataMaidRawReport} report - The raw report containing loose user data.
     * @returns {Promise<DataMaidSanitizedReport>} A sanitized report with sensitive paths removed.
     */
    async sanitizeReport(report: DataMaidRawReport) {
        const sanitizedReport = {
            images: await Promise.all(
                report.images.map((i: string) => this.#sanitizeRecord(i, true)),
            ),
            files: await Promise.all(
                report.files.map((i: string) => this.#sanitizeRecord(i, false)),
            ),
            chats: await Promise.all(
                report.chats.map((i: string) => this.#sanitizeRecord(i, true)),
            ),
            groupChats: await Promise.all(
                report.groupChats.map((i: string) => this.#sanitizeRecord(i, false)),
            ),
            avatarThumbnails: await Promise.all(
                report.avatarThumbnails.map((i: string) => this.#sanitizeRecord(i, false)),
            ),
            backgroundThumbnails: await Promise.all(
                report.backgroundThumbnails.map((i: string) => this.#sanitizeRecord(i, false)),
            ),
            personaThumbnails: await Promise.all(
                report.personaThumbnails.map((i: string) => this.#sanitizeRecord(i, false)),
            ),
            chatBackups: await Promise.all(
                report.chatBackups.map((i: string) => this.#sanitizeRecord(i, false)),
            ),
            settingsBackups: await Promise.all(
                report.settingsBackups.map((i: string) => this.#sanitizeRecord(i, false)),
            ),
        };

        return sanitizedReport;
    }

    /**
     * Collects loose user images from the provided directories.
     * Images are considered loose if they exist in the user images directory
     * but are not referenced in any chat messages.
     * @returns {Promise<string[]>} List of paths to loose user images
     */
    async #collectImages() {
        const result = [];

        try {
            const messages = await this.#parseAllChats(
                (x: DataMaidMessage) =>
                    !!x?.extra?.image ||
                    !!x?.extra?.video ||
                    Array.isArray(x?.extra?.image_swipes) ||
                    Array.isArray(x?.extra?.media),
            );
            const knownImages = new Set();
            for (const message of messages) {
                if (message?.extra?.image) {
                    knownImages.add(message.extra.image);
                }
                if (message?.extra?.video) {
                    knownImages.add(message.extra.video);
                }
                if (Array.isArray(message?.extra?.image_swipes)) {
                    for (const swipe of message.extra.image_swipes) {
                        knownImages.add(swipe);
                    }
                }
                if (Array.isArray(message?.extra?.media)) {
                    for (const media of message.extra.media) {
                        if (media?.url) {
                            knownImages.add(media.url);
                        }
                    }
                }
            }
            const metadata = await this.#parseAllMetadata(
                (x: DataMaidChatMetadata) =>
                    Array.isArray(x?.chat_backgrounds) && x.chat_backgrounds.length > 0,
            );
            for (const meta of metadata) {
                if (Array.isArray(meta?.chat_backgrounds)) {
                    for (const background of meta.chat_backgrounds) {
                        if (background) {
                            knownImages.add(background);
                        }
                    }
                }
            }
            const knownImageFullPaths = new Set();
            knownImages.forEach((image) => {
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                if (image.startsWith('http') || image.startsWith('data:')) {
                    return; // Skip URLs and data URIs
                }
                knownImageFullPaths.add(
                    path.normalize(path.join(this.directories.root, image as string)),
                );
            });
            const images = await fs.promises.readdir(this.directories.userImages, {
                withFileTypes: true,
            });
            for (const dirent of images) {
                const direntPath = path.join(dirent.parentPath, dirent.name);
                if (dirent.isFile() && !knownImageFullPaths.has(direntPath)) {
                    result.push(direntPath);
                }
                if (dirent.isDirectory()) {
                    const subdirFiles = await fs.promises.readdir(direntPath, {
                        withFileTypes: true,
                    });
                    for (const file of subdirFiles) {
                        const subdirFilePath = path.join(direntPath, file.name);
                        if (file.isFile() && !knownImageFullPaths.has(subdirFilePath)) {
                            result.push(subdirFilePath);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[Data Maid] Error collecting user images:', error);
        }

        return result;
    }

    /**
     * Collects loose user files from the provided directories.
     * Files are considered loose if they exist in the files directory
     * but are not referenced in chat messages, metadata, or settings.
     * @returns {Promise<string[]>} List of paths to loose user files
     */
    async #collectFiles() {
        const result = [];

        try {
            const messages = await this.#parseAllChats(
                (x: DataMaidMessage) =>
                    !!x?.extra?.file?.url ||
                    (Array.isArray(x?.extra?.files) && x.extra.files.length > 0),
            );
            const knownFiles = new Set();
            for (const message of messages) {
                if (message?.extra?.file?.url) {
                    knownFiles.add(message.extra.file.url);
                }
                if (Array.isArray(message?.extra?.files)) {
                    for (const file of message.extra.files) {
                        if (file?.url) {
                            knownFiles.add(file.url);
                        }
                    }
                }
            }
            const metadata = await this.#parseAllMetadata(
                (x: DataMaidChatMetadata) =>
                    Array.isArray(x?.attachments) && x.attachments.length > 0,
            );
            for (const meta of metadata) {
                if (Array.isArray(meta?.attachments)) {
                    for (const attachment of meta.attachments) {
                        if (attachment?.url) {
                            knownFiles.add(attachment.url);
                        }
                    }
                }
            }
            const pathToSettings = path.join(this.directories.root, SETTINGS_FILE);
            if (fs.existsSync(pathToSettings)) {
                try {
                    const settingsContent = await fs.promises.readFile(pathToSettings, 'utf-8');
                    const settings = tryParse(settingsContent);
                    if (Array.isArray(settings?.extension_settings?.attachments)) {
                        for (const file of settings.extension_settings.attachments) {
                            if (file?.url) {
                                knownFiles.add(file.url);
                            }
                        }
                    }
                    if (typeof settings?.extension_settings?.character_attachments === 'object') {
                        for (const files of Object.values(
                            settings.extension_settings.character_attachments,
                        )) {
                            if (!Array.isArray(files)) {
                                continue;
                            }
                            for (const file of files) {
                                if (file?.url) {
                                    knownFiles.add(file.url);
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error('[Data Maid] Error reading settings file:', error);
                }
            }
            const knownFileFullPaths = new Set();
            knownFiles.forEach((file) => {
                knownFileFullPaths.add(
                    path.normalize(path.join(this.directories.root, file as string)),
                );
            });
            const files = await fs.promises.readdir(this.directories.files, {
                withFileTypes: true,
            });
            for (const file of files) {
                const filePath = path.join(this.directories.files, file.name);
                if (file.isFile() && !knownFileFullPaths.has(filePath)) {
                    result.push(filePath);
                }
            }
        } catch (error) {
            console.error('[Data Maid] Error collecting user files:', error);
        }

        return result;
    }

    /**
     * Collects loose character chats from the provided directories.
     * Chat folders are considered loose if they don't have corresponding character files.
     * @returns {Promise<string[]>} List of paths to loose character chats
     */
    async #collectChats() {
        const result = [];

        try {
            const knownChatFolders = new Set();
            const characters = await fs.promises.readdir(this.directories.characters, {
                withFileTypes: true,
            });
            for (const file of characters) {
                if (file.isFile() && path.parse(file.name).ext === '.png') {
                    knownChatFolders.add(file.name.replace('.png', ''));
                }
            }
            const chatFolders = await fs.promises.readdir(this.directories.chats, {
                withFileTypes: true,
            });
            for (const folder of chatFolders) {
                if (folder.isDirectory() && !knownChatFolders.has(folder.name)) {
                    const chatFiles = await fs.promises.readdir(
                        path.join(this.directories.chats, folder.name),
                        { withFileTypes: true },
                    );
                    for (const file of chatFiles) {
                        if (file.isFile() && path.parse(file.name).ext === '.jsonl') {
                            result.push(path.join(this.directories.chats, folder.name, file.name));
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[Data Maid] Error collecting character chats:', error);
        }

        return result;
    }

    /**
     * Collects loose group chats from the provided directories.
     * Group chat files are considered loose if they're not referenced by any group definition.
     * @returns {Promise<string[]>} List of paths to loose group chats
     */
    async #collectGroupChats() {
        const result = [];

        try {
            const groups = await fs.promises.readdir(this.directories.groups, {
                withFileTypes: true,
            });
            const knownGroupChats = new Set();
            for (const file of groups) {
                if (file.isFile() && path.parse(file.name).ext === '.json') {
                    try {
                        const pathToFile = path.join(this.directories.groups, file.name);
                        const fileContent = await fs.promises.readFile(pathToFile, 'utf-8');
                        const groupData = tryParse(fileContent);
                        if (groupData?.chat_id) {
                            knownGroupChats.add(groupData.chat_id);
                        }
                        if (Array.isArray(groupData?.chats)) {
                            for (const chat of groupData.chats) {
                                knownGroupChats.add(chat);
                            }
                        }
                    } catch (error) {
                        console.error(
                            `[Data Maid] Error parsing group chat file ${file.name}:`,
                            error,
                        );
                    }
                }
            }
            const groupChats = await fs.promises.readdir(this.directories.groupChats, {
                withFileTypes: true,
            });
            for (const file of groupChats) {
                if (file.isFile() && path.parse(file.name).ext === '.jsonl') {
                    if (!knownGroupChats.has(path.parse(file.name).name)) {
                        result.push(path.join(this.directories.groupChats, file.name));
                    }
                }
            }
        } catch (error) {
            console.error('[Data Maid] Error collecting group chats:', error);
        }

        return result;
    }

    /**
     * Collects loose avatar thumbnails from the provided directories.
     * @returns {Promise<string[]>} List of paths to loose avatar thumbnails
     */
    async #collectAvatarThumbnails() {
        const result = [];

        try {
            const knownAvatars = new Set();
            const avatars = await fs.promises.readdir(this.directories.characters, {
                withFileTypes: true,
            });
            for (const file of avatars) {
                if (file.isFile()) {
                    knownAvatars.add(file.name);
                }
            }
            const avatarThumbnails = await fs.promises.readdir(this.directories.thumbnailsAvatar, {
                withFileTypes: true,
            });
            for (const file of avatarThumbnails) {
                if (file.isFile() && !knownAvatars.has(file.name)) {
                    result.push(path.join(this.directories.thumbnailsAvatar, file.name));
                }
            }
        } catch (error) {
            console.error('[Data Maid] Error collecting avatar thumbnails:', error);
        }

        return result;
    }

    /**
     * Collects loose background thumbnails from the provided directories.
     * @returns {Promise<string[]>} List of paths to loose background thumbnails
     */
    async #collectBackgroundThumbnails() {
        const result = [];

        try {
            const knownBackgrounds = new Set();
            const backgrounds = await fs.promises.readdir(this.directories.backgrounds, {
                withFileTypes: true,
            });
            for (const file of backgrounds) {
                if (file.isFile()) {
                    knownBackgrounds.add(file.name);
                }
            }
            const backgroundThumbnails = await fs.promises.readdir(this.directories.thumbnailsBg, {
                withFileTypes: true,
            });
            for (const file of backgroundThumbnails) {
                if (file.isFile() && !knownBackgrounds.has(file.name)) {
                    result.push(path.join(this.directories.thumbnailsBg, file.name));
                }
            }
        } catch (error) {
            console.error('[Data Maid] Error collecting background thumbnails:', error);
        }

        return result;
    }

    /**
     * Collects loose persona thumbnails from the provided directories.
     * @returns {Promise<string[]>} List of paths to loose persona thumbnails
     */
    async #collectPersonaThumbnails() {
        const result = [];

        try {
            const knownPersonas = new Set();
            const personas = await fs.promises.readdir(this.directories.avatars, {
                withFileTypes: true,
            });
            for (const file of personas) {
                if (file.isFile()) {
                    knownPersonas.add(file.name);
                }
            }
            const personaThumbnails = await fs.promises.readdir(
                this.directories.thumbnailsPersona,
                { withFileTypes: true },
            );
            for (const file of personaThumbnails) {
                if (file.isFile() && !knownPersonas.has(file.name)) {
                    result.push(path.join(this.directories.thumbnailsPersona, file.name));
                }
            }
        } catch (error) {
            console.error('[Data Maid] Error collecting persona thumbnails:', error);
        }

        return result;
    }

    /**
     * Collects chat backups from the provided directories.
     * @returns {Promise<string[]>} List of paths to chat backups
     */
    async #collectChatBackups() {
        const result = [];

        try {
            const prefix = CHAT_BACKUPS_PREFIX;
            const backups = await fs.promises.readdir(this.directories.backups, {
                withFileTypes: true,
            });
            for (const file of backups) {
                if (file.isFile() && file.name.startsWith(prefix)) {
                    result.push(path.join(this.directories.backups, file.name));
                }
            }
        } catch (error) {
            console.error('[Data Maid] Error collecting chat backups:', error);
        }

        return result;
    }

    /**
     * Collects settings backups from the provided directories.
     * @returns {Promise<string[]>} List of paths to settings backups
     */
    async #collectSettingsBackups() {
        const result = [];

        try {
            const prefix = getSettingsBackupFilePrefix(this.handle);
            const backups = await fs.promises.readdir(this.directories.backups, {
                withFileTypes: true,
            });
            for (const file of backups) {
                if (file.isFile() && file.name.startsWith(prefix)) {
                    result.push(path.join(this.directories.backups, file.name));
                }
            }
        } catch (error) {
            console.error('[Data Maid] Error collecting settings backups:', error);
        }

        return result;
    }

    /**
     * Parses all chat files and returns an array of chat messages.
     * Searches both individual character chats and group chats.
     * @param {function(DataMaidMessage): boolean} filterFn - Filter function to apply to each message.
     * @returns {Promise<DataMaidMessage[]>} Array of chat messages
     */
    async #parseAllChats(filterFn: (message: DataMaidMessage) => boolean) {
        try {
            const allChats = [];

            const groupChats = await fs.promises.readdir(this.directories.groupChats, {
                withFileTypes: true,
            });
            for (const file of groupChats) {
                if (file.isFile() && path.parse(file.name).ext === '.jsonl') {
                    const chatMessages = await this.#parseChatFile(
                        path.join(this.directories.groupChats, file.name),
                    );
                    allChats.push(...chatMessages.filter(filterFn));
                }
            }

            const chatDirectories = await fs.promises.readdir(this.directories.chats, {
                withFileTypes: true,
            });
            for (const directory of chatDirectories) {
                if (directory.isDirectory()) {
                    const chatFiles = await fs.promises.readdir(
                        path.join(this.directories.chats, directory.name),
                        { withFileTypes: true },
                    );
                    for (const file of chatFiles) {
                        if (file.isFile() && path.parse(file.name).ext === '.jsonl') {
                            const chatMessages = await this.#parseChatFile(
                                path.join(this.directories.chats, directory.name, file.name),
                            );
                            allChats.push(...chatMessages.filter(filterFn));
                        }
                    }
                }
            }

            return allChats;
        } catch (error) {
            console.error('[Data Maid] Error parsing chats:', error);
            return [];
        }
    }

    /**
     * Parses all metadata from chat files and group definitions.
     * Extracts metadata from both active and historical chat data.
     * @param {function(DataMaidChatMetadata): boolean} filterFn - Filter function to apply to each metadata entry.
     * @returns {Promise<DataMaidChatMetadata[]>} Parsed chat metadata as an array.
     */
    async #parseAllMetadata(filterFn: (metadata: DataMaidChatMetadata) => boolean) {
        try {
            const allMetadata = [];

            const groups = await fs.promises.readdir(this.directories.groups, {
                withFileTypes: true,
            });
            for (const file of groups) {
                if (file.isFile() && path.parse(file.name).ext === '.json') {
                    try {
                        const pathToFile = path.join(this.directories.groups, file.name);
                        const fileContent = await fs.promises.readFile(pathToFile, 'utf-8');
                        const groupData = tryParse(fileContent);
                        if (groupData?.chat_metadata && filterFn(groupData.chat_metadata)) {
                            console.warn(
                                'Found group chat metadata in group definition - this is deprecated behavior.',
                            );
                            allMetadata.push(groupData.chat_metadata);
                        }
                        if (groupData?.past_metadata) {
                            console.warn(
                                'Found group past chat metadata in group definition - this is deprecated behavior.',
                            );
                            allMetadata.push(
                                ...Object.values(groupData.past_metadata).filter(
                                    filterFn as (value: unknown) => boolean,
                                ),
                            );
                        }
                    } catch (error) {
                        console.error(
                            `[Data Maid] Error parsing group chat file ${file.name}:`,
                            error,
                        );
                    }
                }
            }

            const groupChats = await fs.promises.readdir(this.directories.groupChats, {
                withFileTypes: true,
            });
            for (const file of groupChats) {
                if (file.isFile() && path.parse(file.name).ext === '.jsonl') {
                    const chatMessages = await this.#parseChatFile(
                        path.join(this.directories.groupChats, file.name),
                    );
                    const chatMetadata = chatMessages?.[0]?.chat_metadata;
                    if (chatMetadata && filterFn(chatMetadata)) {
                        allMetadata.push(chatMetadata);
                    }
                }
            }

            const chatDirectories = await fs.promises.readdir(this.directories.chats, {
                withFileTypes: true,
            });
            for (const directory of chatDirectories) {
                if (directory.isDirectory()) {
                    const chatFiles = await fs.promises.readdir(
                        path.join(this.directories.chats, directory.name),
                        { withFileTypes: true },
                    );
                    for (const file of chatFiles) {
                        if (file.isFile() && path.parse(file.name).ext === '.jsonl') {
                            const chatMessages = await this.#parseChatFile(
                                path.join(this.directories.chats, directory.name, file.name),
                            );
                            const chatMetadata = chatMessages?.[0]?.chat_metadata;
                            if (chatMetadata && filterFn(chatMetadata)) {
                                allMetadata.push(chatMetadata);
                            }
                        }
                    }
                }
            }

            return allMetadata;
        } catch (error) {
            console.error('[Data Maid] Error parsing chats:', error);
            return [];
        }
    }

    /**
     * Parses a single chat file and returns an array of chat messages.
     * Each line in the JSONL file represents one message.
     * @param {string} filePath Path to the chat file to parse.
     * @returns {Promise<DataMaidMessage[]>} Parsed chat messages as an array.
     */
    async #parseChatFile(filePath: string) {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const chatData = content.split('\n').map(tryParse).filter(Boolean);
            return chatData;
        } catch (error) {
            console.error(`[Data Maid] Error reading chat file ${filePath}:`, error);
            return [];
        }
    }

    /**
     * Generates a unique token for the user to clean up their data.
     * Replaces any existing token for the same user.
     * @param {string} handle - The user's handle or identifier.
     * @param {DataMaidRawReport} report - The report containing loose user data.
     * @returns {string} A unique token.
     */
    static generateToken(handle: string, report: DataMaidRawReport) {
        // Remove any existing token for this user
        for (const [token, entry] of this.TOKENS.entries()) {
            if (entry.handle === handle) {
                this.TOKENS.delete(token);
            }
        }

        const token = crypto.randomBytes(32).toString('hex');
        const tokenEntry = {
            handle,
            paths: Object.values(report)
                .filter((v) => Array.isArray(v))
                .flat()
                .map((x) => ({ path: x, hash: sha256(x) })),
        };
        this.TOKENS.set(token, tokenEntry);
        return token;
    }
}

export const router = new Elysia({ prefix: '/api/data-maid' })
    .post('/report', async (context) => {
        const { set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        try {
            if (!user || !user.directories) {
                set.status = 403;
                return;
            }

            const profile = user.profile as Record<string, string>;
            const dataMaid = new DataMaidService(
                profile.handle,
                user.directories as import('../users.js').UserDirectoryList,
            );
            const rawReport = await dataMaid.generateReport();

            const report = await dataMaid.sanitizeReport(rawReport);
            const token = DataMaidService.generateToken(profile.handle, rawReport);

            return { report, token };
        } catch (error) {
            console.error('[Data Maid] Error generating data maid report:', error);
            set.status = 500;
            return;
        }
    })
    .post('/finalize', async (context) => {
        const { set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        try {
            if (!user || !user.directories) {
                set.status = 403;
                return;
            }

            const body = context.body as Record<string, unknown>;
            if (!body.token) {
                set.status = 400;
                return;
            }

            const token = body.token.toString();
            if (!DataMaidService.TOKENS.has(token)) {
                set.status = 403;
                return;
            }

            const tokenEntry = DataMaidService.TOKENS.get(token) as
                | { handle: string; paths: { path: string; hash: string }[] }
                | undefined;
            if (
                !tokenEntry ||
                tokenEntry.handle !== (user.profile as Record<string, string>).handle
            ) {
                set.status = 403;
                return;
            }

            // Remove the token after finalization
            DataMaidService.TOKENS.delete(token);
            set.status = 204;
            return;
        } catch (error) {
            console.error('[Data Maid] Error finalizing the token:', error);
            set.status = 500;
            return;
        }
    })
    .get('/view', async (context) => {
        const { set, query } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        try {
            if (!user || !user.directories) {
                set.status = 403;
                return;
            }

            if (!query.token || !query.hash) {
                set.status = 400;
                return;
            }

            const token = query.token.toString();
            const hash = query.hash.toString();

            if (!DataMaidService.TOKENS.has(token)) {
                set.status = 403;
                return;
            }

            const tokenEntry = DataMaidService.TOKENS.get(token) as
                | { handle: string; paths: { path: string; hash: string }[] }
                | undefined;
            if (
                !tokenEntry ||
                tokenEntry.handle !== (user.profile as Record<string, string>).handle
            ) {
                set.status = 403;
                return;
            }

            const fileEntry = tokenEntry.paths.find(
                (entry: { path: string; hash: string }) => entry.hash === hash,
            );
            if (!fileEntry) {
                set.status = 404;
                return;
            }

            if (
                !isPathUnderParent(
                    (user.directories as Record<string, string>).root,
                    fileEntry.path,
                )
            ) {
                console.warn(
                    '[Data Maid] Attempted access to a file outside of the user directory:',
                    fileEntry.path,
                );
                set.status = 403;
                return;
            }

            const pathToFile = fileEntry.path;
            const fileExists = fs.existsSync(pathToFile);

            if (!fileExists) {
                set.status = 404;
                return;
            }

            return new Response(Bun.file(pathToFile));
        } catch (error) {
            console.error('[Data Maid] Error viewing file:', error);
            set.status = 500;
            return;
        }
    })
    .post('/delete', async (context) => {
        const { set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        try {
            if (!user || !user.directories) {
                set.status = 403;
                return;
            }

            const body = context.body as Record<string, unknown>;
            const token = body.token;
            const hashes = body.hashes;
            if (!token || !Array.isArray(hashes) || (hashes as unknown[]).length === 0) {
                set.status = 400;
                return;
            }

            if (!DataMaidService.TOKENS.has(token as string)) {
                set.status = 403;
                return;
            }

            const tokenEntry = DataMaidService.TOKENS.get(token as string) as
                | { handle: string; paths: { path: string; hash: string }[] }
                | undefined;
            if (
                !tokenEntry ||
                tokenEntry.handle !== (user.profile as Record<string, string>).handle
            ) {
                set.status = 403;
                return;
            }

            for (const hash of hashes as string[]) {
                const fileEntry = tokenEntry.paths.find(
                    (entry: { path: string; hash: string }) => entry.hash === hash,
                );
                if (!fileEntry) {
                    continue;
                }

                if (
                    !isPathUnderParent(
                        (user.directories as Record<string, string>).root,
                        fileEntry.path,
                    )
                ) {
                    console.warn(
                        '[Data Maid] Attempted deletion of a file outside of the user directory:',
                        fileEntry.path,
                    );
                    continue;
                }

                const pathToFile = fileEntry.path;
                const fileExists = fs.existsSync(pathToFile);

                if (!fileExists) {
                    continue;
                }

                await fs.promises.unlink(pathToFile);
            }

            set.status = 204;
            return;
        } catch (error) {
            console.error('[Data Maid] Error deleting files:', error);
            set.status = 500;
            return;
        }
    });
