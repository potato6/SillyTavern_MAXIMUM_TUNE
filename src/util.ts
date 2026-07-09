// @ts-expect-error TS(1259) FIXME: Module '"node:path"' can only be default-imported ... Remove this comment to see the full error message
import path from 'node:path';
// @ts-expect-error TS(1192) FIXME: Module '"node:fs"' has no default export.
import fs from 'node:fs';
// @ts-expect-error TS(1192) FIXME: Module '"node:http2"' has no default export.
import http2 from 'node:http2';
// @ts-expect-error TS(1259) FIXME: Module '"node:process"' can only be default-import... Remove this comment to see the full error message
import process from 'node:process';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';
import { promises as dnsPromise } from 'node:dns';
// @ts-expect-error TS(1192) FIXME: Module '"node:os"' has no default export.
import os from 'node:os';
// @ts-expect-error TS(1192) FIXME: Module '"node:crypto"' has no default export.
import crypto from 'node:crypto';
// @ts-expect-error TS(1192) FIXME: Module '"node:readline"' has no default export.
import readline from 'node:readline';

// @ts-expect-error TS(2792) FIXME: Cannot find module 'yaml'. Did you mean to set the... Remove this comment to see the full error message
import yaml from 'yaml';
import { sync as commandExistsSync } from 'command-exists';
// @ts-expect-error TS(2792) FIXME: Cannot find module 'es-toolkit/compat'. Did you me... Remove this comment to see the full error message
import { get } from 'es-toolkit/compat';
// @ts-expect-error TS(2792) FIXME: Cannot find module 'fflate'. Did you mean to set t... Remove this comment to see the full error message
import * as fflate from 'fflate';
// @ts-expect-error TS(1192) FIXME: Module '"/mnt/DISCO/downloads/some_git_projects/Si... Remove this comment to see the full error message
import mime from 'mime-types';
// @ts-expect-error TS(2792) FIXME: Cannot find module 'simple-git'. Did you mean to s... Remove this comment to see the full error message
import { default as simpleGit } from 'simple-git';
// @ts-expect-error TS(2792) FIXME: Cannot find module 'chalk'. Did you mean to set th... Remove this comment to see the full error message
import chalk from 'chalk';
// @ts-expect-error TS(1259) FIXME: Module '"/mnt/DISCO/downloads/some_git_projects/Si... Remove this comment to see the full error message
import bytes from 'bytes';
import { LOG_LEVELS, CHAT_COMPLETION_SOURCES, MEDIA_REQUEST_TYPE } from './constants.js';
import { serverDirectory } from './server-directory.js';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import { isFirefox } from './express-common.js';

/**
 * Parsed config object.
 */
let CACHED_CONFIG: Record<string, unknown> | null = null;
let CONFIG_PATH: string | null = null;

/**
 * Converts a configuration key to an environment variable key.
 * @param {string} key Configuration key
 * @returns {string} Environment variable key
 * @example keyToEnv('extensions.models.speechToText') // 'SILLYTAVERN_EXTENSIONS_MODELS_SPEECHTOTEXT'
 */
export const keyToEnv = (key: unknown) => 'SILLYTAVERN_' + String(key).toUpperCase().replace(/\./g, '_');

/**
 * Set the config file path.
 * @param {string} configFilePath Path to the config file
 */
export function setConfigFilePath(configFilePath: string) {
    if (CONFIG_PATH !== null) {
        console.error(color.red('Config file path already set. Please restart the server to change the config file path.'));
    }
    CONFIG_PATH = path.resolve(configFilePath);
}

/**
 * Returns the config object from the config.yaml file.
 * @returns {Record<string, unknown>} Config object
 */
// @ts-expect-error TS(2366) FIXME: Function lacks ending return statement and return ... Remove this comment to see the full error message
export function getConfig(): Record<string, unknown> {
    if (CONFIG_PATH === null) {
        console.trace();
        console.error(color.red('No config file path set. Please set the config file path using setConfigFilePath().'));
        process.exit(1);
    }
    if (CACHED_CONFIG) {
        return CACHED_CONFIG;
    }
    if (!fs.existsSync(CONFIG_PATH)) {
        console.error(color.red('No config file found. Please create a config.yaml file. The default config file can be found in the /default folder.'));
        console.error(color.red('The program will now exit.'));
        process.exit(1);
    }

    try {
        const config = yaml.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        CACHED_CONFIG = config;
        return config;
    } catch (error) {
        console.error(color.red('FATAL: Failed to read config.yaml. Please check the file for syntax errors.'));
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        console.error(error.message);
        process.exit(1);
    }
}

/**
 * Returns the value for the given key from the config object.
 * @param {string} key - Key to get from the config object
 * @param {unknown} defaultValue - Default value to return if the key is not found
 * @param {'number'|'boolean'|null} typeConverter - Type to convert the value to
 * @returns {unknown} Value for the given key
 */
export function getConfigValue(key: string, defaultValue = null, typeConverter = null) {
    /**
     * Gets the value from environment variables or config file.
     * @returns {unknown} The retrieved value
     */
    function _getValue() {
        const envKey = keyToEnv(key);
        if (envKey in process.env) {
            const needsJsonParse = defaultValue && typeof defaultValue === 'object';
            const envValue = process.env[envKey];
            return needsJsonParse ? (tryParse(envValue) ?? defaultValue) : envValue;
        }
        const config = getConfig();
        return get(config, key, defaultValue);
    }

    const value = _getValue();
    switch (typeConverter) {
        // @ts-expect-error TS(2678) FIXME: Type '"number"' is not comparable to type 'null'.
        case 'number':
            return isNaN(parseFloat(value)) ? defaultValue : parseFloat(value);
        // @ts-expect-error TS(2678) FIXME: Type '"boolean"' is not comparable to type 'null'.
        case 'boolean':
            return toBoolean(value);
        default:
            return value;
    }
}

/**
 * THIS FUNCTION IS DEPRECATED AND ONLY EXISTS FOR BACKWARDS COMPATIBILITY. DON'T USE IT.
 * @param {unknown} _key Unused
 * @param {unknown} _value Unused
 * @deprecated Configs are read-only. Use environment variables instead.
 */
export function setConfigValue(_key: unknown, _value: unknown) {
    console.trace(color.yellow('setConfigValue is deprecated and should not be used.'));
}

/**
 * Encodes the Basic Auth header value for the given user and password.
 * @param {string} auth username:password
 * @returns {string} Basic Auth header value
 */
export function getBasicAuthHeader(auth: unknown) {
    const encoded = Buffer.from(`${auth}`).toString('base64');
    return `Basic ${encoded}`;
}

/**
 * Returns the version of the running instance. Get the version from the package.json file and the git revision.
 * Also returns the agent string for the Horde API.
 * @returns {Promise<{agent: string, pkgVersion: string, gitRevision: string | null, gitBranch: string | null, commitDate: string | null, isLatest: boolean}>} Version info object
 */
export async function getVersion() {
    let pkgVersion = 'UNKNOWN';
    let gitRevision = null;
    let gitBranch = null;
    let commitDate = null;
    let isLatest = true;

    try {
        // @ts-expect-error TS(1343) FIXME: The 'import.meta' meta-property is only allowed wh... Remove this comment to see the full error message
        const require = createRequire(import.meta.url);
        const pkgJson = require(path.join(serverDirectory, './package.json'));
        pkgVersion = pkgJson.version;
        if (commandExistsSync('git')) {
            const git = simpleGit({ baseDir: serverDirectory });
            gitRevision = await git.revparse(['--short', 'HEAD']);
            gitBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
            commitDate = await git.show(['-s', '--format=%ci', gitRevision]);

            const trackingBranch = await git.revparse(['--abbrev-ref', '@{u}']);

            // Might fail, but exception is caught. Just don't run anything relevant after in this block...
            const localLatest = await git.revparse(['HEAD']);
            const remoteLatest = await git.revparse([trackingBranch]);
            isLatest = localLatest === remoteLatest;
        }
    } catch {
        // suppress exception
    }

    const agent = `SillyTavern:${pkgVersion}:Cohee#1207`;
    return { agent, pkgVersion, gitRevision, gitBranch, commitDate: commitDate?.trim() ?? null, isLatest };
}

/**
 * Delays the current async function by the given amount of milliseconds.
 * @param {number} ms Milliseconds to wait
 * @returns {Promise<void>} Promise that resolves after the given amount of milliseconds
 */
export function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generates a random hex string of the given length.
 * @param {number} length String length
 * @returns {string} Random hex string
 * @example getHexString(8) // 'a1b2c3d4'
 */
export function getHexString(length: number) {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

/**
 * Formats a byte size into a human-readable string with units
 * @param {number} numBytes - The size in bytes to format
 * @returns {string} The formatted string (e.g., "1.5 MB")
 */
export function formatBytes(numBytes: number) {
    return bytes.format(numBytes) ?? '';
}

/**
 * Extracts a file with given extension from an ArrayBuffer containing a ZIP archive.
 * @param {ArrayBufferLike} archiveBuffer Buffer containing a ZIP archive
 * @param {string} fileExtension File extension to look for
 * @returns {Promise<Buffer|null>} Buffer containing the extracted file. Null if the file was not found.
 */
export async function extractFileFromZipBuffer(archiveBuffer: ArrayBufferLike, fileExtension: string) {
    try {
        const zip = fflate.unzipSync(new Uint8Array(archiveBuffer));
        for (const [fileName, data] of Object.entries(zip)) {
            if (fileName.endsWith(fileExtension) && !fileName.startsWith('__MACOSX')) {
                // @ts-expect-error TS(2769) FIXME: No overload matches this call.
                return Buffer.from(data);
            }
        }
    } catch (error) {
        console.warn('Failed to process ZIP buffer', error);
    }
    return null;
}

/**
 * Normalizes a ZIP entry path for safe extraction.
 * @param {string} entryName The entry name from the ZIP archive
 * @returns {string|null} Normalized path or null if invalid
 */
export function normalizeZipEntryPath(entryName: unknown) {
    if (typeof entryName !== 'string') {
        return null;
    }

    let normalized = entryName.replace(/\\/g, '/').trim();

    if (!normalized) {
        return null;
    }

    normalized = normalized.replace(/^\.\/+/g, '');
    normalized = path.posix.normalize(normalized);

    if (!normalized || normalized === '.' || normalized.startsWith('..')) {
        return null;
    }

    if (normalized.startsWith('/')) {
        normalized = normalized.slice(1);
    }

    return normalized;
}

/**
 * Extracts multiple files from an ArrayBuffer containing a ZIP archive.
 * @param {ArrayBufferLike} archiveBuffer Buffer containing a ZIP archive
 * @param {string[]} fileNames Array of file paths to extract
 * @returns {Promise<Map<string, Buffer>>} Map of normalized paths to their extracted buffers
 */
export async function extractFilesFromZipBuffer(archiveBuffer: ArrayBufferLike, fileNames: unknown) {
    const targets = new Map();

    if (Array.isArray(fileNames)) {
        for (const fileName of fileNames) {
            const normalized = normalizeZipEntryPath(fileName);
            if (normalized && !targets.has(normalized)) {
                targets.set(normalized, true);
            }
        }
    }

    if (targets.size === 0) {
        return new Map();
    }

    const results = new Map();

    try {
        const zip = fflate.unzipSync(new Uint8Array(archiveBuffer));
        for (const [fileName, data] of Object.entries(zip)) {
            const normalizedEntry = normalizeZipEntryPath(fileName);
            if (normalizedEntry && targets.has(normalizedEntry)) {
                // @ts-expect-error TS(2769) FIXME: No overload matches this call.
                results.set(normalizedEntry, Buffer.from(data));
                targets.delete(normalizedEntry);
                if (targets.size === 0) break;
            }
        }
    } catch (error) {
        console.warn('Failed to process ZIP buffer', error);
    }

    return results;
}

/**
 * Ensures a directory exists, creating it if necessary.
 * @param {string} dirPath Path to the directory
 * @returns {boolean} True if the directory exists or was created, false on error
 */
export function ensureDirectory(dirPath: string) {
    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        } else if (!fs.statSync(dirPath).isDirectory()) {
            console.warn(`ensureDirectory: Path ${dirPath} exists and is not a directory.`);
            return false;
        }
        return true;
    } catch (error) {
        console.error(`ensureDirectory: Failed to prepare directory ${dirPath}`, error);
        return false;
    }
}

/**
 * Extracts all images from a ZIP archive.
 * @param {string} zipFilePath Path to the ZIP archive
 * @returns {Promise<[string, Buffer][]>} Array of image buffers
 */
export async function getImageBuffers(zipFilePath: string) {
    if (!fs.existsSync(zipFilePath)) {
        throw new Error('File not found');
    }

    const imageBuffers: [string, Buffer][] = [];
    const fileBuffer = fs.readFileSync(zipFilePath);
    const zip = fflate.unzipSync(new Uint8Array(fileBuffer));

    for (const [fileName, data] of Object.entries(zip)) {
        const mimeType = mime.lookup(fileName);
        if (mimeType && mimeType.startsWith('image/') && !fileName.startsWith('__MACOSX')) {
            // @ts-expect-error TS(2769) FIXME: No overload matches this call.
            imageBuffers.push([path.parse(fileName).base, Buffer.from(data)]);
        }
    }

    return imageBuffers;
}

/**
 * Gets all chunks of data from the given readable stream.
 * @param {Readable} readableStream Readable stream to read from
 * @returns {Promise<Buffer[]>} Array of chunks
 */
export async function readAllChunks(readableStream: Readable) {
    return new Promise((resolve, reject) => {
        // Consume the readable stream
        const chunks: Buffer[] = [];
        readableStream.on('data', (chunk: Buffer | string) => {
            // @ts-expect-error TS(2345) FIXME: Argument of type 'string | Buffer' is not assignab... Remove this comment to see the full error message
            chunks.push(chunk);
        });

        readableStream.on('end', () => {
            //console.log('Finished reading the stream.');
            resolve(chunks);
        });

        readableStream.on('error', (error: Error) => {
            console.error('Error while reading the stream:', error);
            reject();
        });
    });
}

/**
 * Checks if the item is a plain object.
 * @param {unknown} item Item to check
 * @returns {boolean} True if the item is an object and not an array
 */
function isObject(item: unknown) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Deeply merges two objects.
 * @param {Record<string, unknown>} target Target object
 * @param {Record<string, unknown>} source Source object
 * @returns {Record<string, unknown>} Merged object
 */
export function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>) {
    const output = Object.assign({}, target);
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!(key in target)) {
                    Object.assign(output, { [key]: source[key] });
                } else {
                    // @ts-expect-error TS(2345) FIXME: Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
                    output[key] = deepMerge(target[key], source[key]);
                }
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    return output;
}

export const color = chalk;

/**
 * Gets a random UUIDv4 string.
 * @returns {string} A UUIDv4 string
 */
export function uuidv4() {
    // Node v16.7.0+
    if ('crypto' in globalThis && 'randomUUID' in globalThis.crypto) {
        return globalThis.crypto.randomUUID();
    }
    // Node v14.17.0+
    if ('randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    // Very insecure UUID generator, but it's better than nothing.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Gets a humanized date time string from a given timestamp.
 * @param {number} timestamp Timestamp in milliseconds
 * @returns {string} Humanized date time string in the format `YYYY-MM-DD@HHhMMmSSsMSms`
 */
export function humanizedDateTime(timestamp = Date.now()) {
    const date = new Date(timestamp);
    const dt = {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes(),
        second: date.getSeconds(),
        millisecond: date.getMilliseconds(),
    };
    for (const key in dt) {
        const padLength = key === 'millisecond' ? 3 : 2;
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        dt[key] = dt[key].toString().padStart(padLength, '0');
    }
    return `${dt.year}-${dt.month}-${dt.day}@${dt.hour}h${dt.minute}m${dt.second}s${dt.millisecond}ms`;
}

/**
 * Attempts to parse a JSON string.
 * @param {string} str JSON string to parse
 * @returns {unknown} Parsed object or undefined if parsing fails
 */
export function tryParse(str: string) {
    try {
        return JSON.parse(str);
    } catch {
        return undefined;
    }
}

/**
 * Takes a path to a client-accessible file in the data folder and converts it to a relative URL segment that the
 * client can fetch it from. This involves stripping the data root path prefix and always using `/` as the separator.
 * @param {string} root The root directory of the user data folder.
 * @param {string} inputPath The path to be converted.
 * @returns {string} The relative URL path from which the client can access the file.
 */
export function clientRelativePath(root: string, inputPath: string) {
    if (!inputPath.startsWith(root)) {
        throw new Error('Input path does not start with the root directory');
    }

    return inputPath.slice(root.length).split(path.sep).join('/');
}

/**
 * Returns a name that is unique among the names that exist.
 * @param {string} baseName The name to check.
 * @param {{ (name: string): boolean; }} exists Function to check if name exists.
 * @param {object} [options] The options.
 * @param {((baseName: string, i: number) => string)|null} [options.nameBuilder] Function to build the name.
 *        Starts with the index provided by `startIndex` (default is 1). If not provided, uses "${baseName} (${i})".
 * @param {number} [options.maxTries] The maximum number of tries to find a unique name. Default is 1000.
 * @param {number} [options.startIndex] The index to start with when building the name. Default is 1.
 *        When set to 0, the intention is to also check if the basename (without applied index) is free.
 * @returns {string|null} A unique name. Null if no unique name could be found in `maxTries`.
 */
export function getUniqueName(baseName: string, exists: (name: string) => boolean, { nameBuilder = null, maxTries = 1000, startIndex = 1 } = {}) {
    // @ts-expect-error TS(2322) FIXME: Type '(baseName: string, i: number) => string' is ... Remove this comment to see the full error message
    nameBuilder ??= (baseName: string, i: number) => i === 0 ? baseName : `${baseName} (${i})`;
    let i = startIndex;
    let name;
    while (i < maxTries + startIndex) {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        name = nameBuilder(baseName, i);
        if (!exists(name)) {
            return name;
        }
        i++;
    }
    return null;
}

/**
 * Provides safe replacements for characters in filenames. Intended for use with sanitize() from the sanitize-filename package.
 * @param {string} char Character to sanitize
 * @returns {string} Safe replacement character
 */
export function sanitizeSafeCharacterReplacements(char: string) {
    return '_';
}

/**
 * Strip the last file extension from a given file name. If there are multiple extensions, only the last is removed.
 * @param {string} filename The file name to remove the extension from.
 * @returns {string} The file name, sans extension
 */
export function removeFileExtension(filename: string) {
    return filename.replace(/\.[^.]+$/, '');
}

/**
 * Generates a timestamp string.
 * @returns {string} Timestamp in format YYYYMMDD-HHMMSS
 */
export function generateTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

/**
 * Remove old backups with the given prefix from a specified directory.
 * @param {string} directory The root directory to remove backups from.
 * @param {string} prefix File prefix to filter backups by.
 * @param {number?} limit Maximum number of backups to keep. If null, the limit is determined by the `backups.common.numberOfBackups` config value.
 */
export function removeOldBackups(directory: string, prefix: string, limit = null) {
    // @ts-expect-error TS(2345) FIXME: Argument of type '50' is not assignable to paramet... Remove this comment to see the full error message
    const MAX_BACKUPS = limit ?? Number(getConfigValue('backups.common.numberOfBackups', 50, 'number'));

    // @ts-expect-error TS(7006) FIXME: Parameter 'f' implicitly has an 'any' type.
    let files = fs.readdirSync(directory).filter(f => f.startsWith(prefix));
    if (files.length > MAX_BACKUPS) {
        // @ts-expect-error TS(7006) FIXME: Parameter 'f' implicitly has an 'any' type.
        files = files.map(f => path.join(directory, f));
        // @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
        files.sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);

        while (files.length > MAX_BACKUPS) {
            const oldest = files.shift();
            if (!oldest) {
                break;
            }

            fs.unlinkSync(oldest);
        }
    }
}

/**
 * Get a list of images in a directory.
 * @param {string} directoryPath Path to the directory containing the images
 * @param {'name' | 'date'} sortBy Sort images by name or date
 * @param {number} type Bitwise flag representing media types to include
 * @returns {string[]} List of image file names
 */
export function getImages(directoryPath: string, sortBy = 'name', type = MEDIA_REQUEST_TYPE.IMAGE) {
    /**
     * Returns the sort function based on the sortBy parameter.
     * @returns {(a: string, b: string) => number} The sort function
     */
    function getSortFunction() {
        switch (sortBy) {
            case 'name':
                return Intl.Collator().compare;
            case 'date':
                return (a: string, b: string) => fs.statSync(path.join(directoryPath, a)).mtimeMs - fs.statSync(path.join(directoryPath, b)).mtimeMs;
            default:
                return (_a: string, _b: string) => 0;
        }
    }

    return fs
        .readdirSync(directoryPath, { withFileTypes: true })
        // @ts-expect-error TS(7006) FIXME: Parameter 'dirent' implicitly has an 'any' type.
        .filter(dirent => dirent.isFile())
        // @ts-expect-error TS(7006) FIXME: Parameter 'dirent' implicitly has an 'any' type.
        .map(dirent => dirent.name)
        // @ts-expect-error TS(7006) FIXME: Parameter 'file' implicitly has an 'any' type.
        .filter(file => {
            const fileType = mime.lookup(file);
            if (!fileType) {
                return false;
            }
            if ((type & MEDIA_REQUEST_TYPE.IMAGE) && fileType.startsWith('image/')) {
                return true;
            }
            if ((type & MEDIA_REQUEST_TYPE.VIDEO) && fileType.startsWith('video/')) {
                return true;
            }
            if ((type & MEDIA_REQUEST_TYPE.AUDIO) && fileType.startsWith('audio/')) {
                return true;
            }
            return false;
        })
        .sort(getSortFunction());
}

/**
 * Pipe a fetch() response to an Express.js Response, including status code.
 * @param {import('node-fetch').Response} from The Fetch API response to pipe from.
 * @param {import('express').Response} to The Express response to pipe to.
 * @returns {Promise<void>}
 */
export async function forwardFetchResponse(from: import('node-fetch').Response, to: import('express').Response) {
    let statusCode = from.status;
    const statusText = from.statusText;

    // Avoid sending 401 responses as they reset the client Basic auth.
    // This can produce an interesting artifact as "400 Unauthorized", but it's not out of spec.
    // https://www.rfc-editor.org/rfc/rfc9110.html#name-overview-of-status-codes
    // "The reason phrases listed here are only recommendations -- they can be replaced by local
    //  equivalents or left out altogether without affecting the protocol."
    if (statusCode === 401) {
        statusCode = 400;
    }

    to.statusCode = statusCode;
    to.statusMessage = statusText;

    if (!from.ok) {
        try {
            const rawErrorText = await from.text();
            const detail = rawErrorText || 'Unknown error occurred';

            console.warn(`Streaming request failed with status ${from.status} ${statusText}: ${detail}`);
            to.end(rawErrorText, 'utf-8');
        } catch {
            console.warn(`Streaming request failed with status ${from.status} ${statusText}: Unknown error occurred`);
            to.end();
        }

        return;
    }

    if (from.body && to.socket) {
        from.body.pipe(to);

        to.socket.on('close', function () {
            if (from.body instanceof Readable) from.body.destroy(); // Close the remote stream

            to.end(); // End the Express response
        });

        from.body.on('end', function () {
            console.info('Streaming request finished');
            to.end();
        });
    } else {
        to.end();
    }
}

/**
 * Makes an HTTP/2 request to the specified endpoint.
 * @deprecated Use `node-fetch` if possible.
 * @param {string} endpoint URL to make the request to
 * @param {string} method HTTP method to use
 * @param {string} body Request body
 * @param {object} headers Request headers
 * @returns {Promise<string>} Response body
 */
export function makeHttp2Request(endpoint: string, method: string, body: string, headers: Record<string, string>) {
    return new Promise((resolve, reject) => {
        try {
            const url = new URL(endpoint);
            const client = http2.connect(url.origin);

            const req = client.request({
                ':method': method,
                ':path': url.pathname,
                ...headers,
            });
            req.setEncoding('utf8');

            // @ts-expect-error TS(7006) FIXME: Parameter 'headers' implicitly has an 'any' type.
            req.on('response', (headers) => {
                const status = Number(headers[':status']);

                if (status < 200 || status >= 300) {
                    reject(new Error(`Request failed with status ${status}`));
                }

                let data = '';

                // @ts-expect-error TS(7006) FIXME: Parameter 'chunk' implicitly has an 'any' type.
                req.on('data', (chunk) => {
                    data += chunk;
                });

                req.on('end', () => {
                    console.debug(data);
                    resolve(data);
                });
            });

            // @ts-expect-error TS(7006) FIXME: Parameter 'err' implicitly has an 'any' type.
            req.on('error', (err) => {
                reject(err);
            });

            if (body) {
                req.write(body);
            }

            req.end();
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Adds YAML-serialized object to the object.
 * @param {Record<string, unknown>} obj Object
 * @param {string} yamlString YAML-serialized object
 * @returns {void}
 */
export function mergeObjectWithYaml(obj: Record<string, unknown>, yamlString: string) {
    if (!yamlString) {
        return;
    }

    try {
        const parsedObject = yaml.parse(yamlString);

        if (Array.isArray(parsedObject)) {
            for (const item of parsedObject) {
                if (typeof item === 'object' && item && !Array.isArray(item)) {
                    Object.assign(obj, item);
                }
            }
        } else if (parsedObject && typeof parsedObject === 'object') {
            Object.assign(obj, parsedObject);
        }
    } catch {
        // Do nothing
    }
}

/**
 * Removes keys from the object by YAML-serialized array.
 * @param {Record<string, unknown>} obj Object
 * @param {string} yamlString YAML-serialized array
 * @returns {void} Nothing
 */
export function excludeKeysByYaml(obj: Record<string, unknown>, yamlString: string) {
    if (!yamlString) {
        return;
    }

    try {
        const parsedObject = yaml.parse(yamlString);

        if (Array.isArray(parsedObject)) {
            parsedObject.forEach(key => {
                delete obj[key];
            });
        } else if (typeof parsedObject === 'object') {
            Object.keys(parsedObject).forEach(key => {
                delete obj[key];
            });
        } else if (typeof parsedObject === 'string') {
            delete obj[parsedObject];
        }
    } catch {
        // Do nothing
    }
}

/**
 * Removes trailing slash and /v1 from a string.
 * @param {string} str Input string
 * @returns {string} Trimmed string
 */
export function trimV1(str: unknown) {
    return String(str ?? '').replace(/\/$/, '').replace(/\/v1$/, '');
}

/**
 * Removes trailing slash from a string.
 * @param {string} str Input string
 * @returns {string} String with trailing slash removed
 */
export function trimTrailingSlash(str: unknown) {
    return String(str ?? '').replace(/\/$/, '');
}

/**
 * Simple TTL memory cache.
 */
export class Cache {
    cache: Map<string, { value: unknown, expiry: number }>;
    ttl: number;
    /**
     * @param {number} ttl Time to live in milliseconds
     */
    constructor(ttl: number) {
        this.cache = new Map();
        this.ttl = ttl;
    }

    /**
     * Gets a value from the cache.
     * @param {string} key Cache key
     * @returns {unknown} Cached value or null
     */
    get(key: string) {
        const value = this.cache.get(key);
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        if (value?.expiry > Date.now()) {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            return value.value;
        }

        // Cache miss or expired, remove the key
        this.cache.delete(key);
        return null;
    }

    /**
     * Sets a value in the cache.
     * @param {string} key Key
     * @param {object} value Value
     */
    set(key: string, value: unknown) {
        this.cache.set(key, {
            value: value,
            expiry: Date.now() + this.ttl,
        });
    }

    /**
     * Removes a value from the cache.
     * @param {string} key Key
     */
    remove(key: string) {
        this.cache.delete(key);
    }

    /**
     * Clears the cache.
     */
    clear() {
        this.cache.clear();
    }
}

/**
 * Removes color formatting from a text string.
 * @param {string} text Text with color formatting
 * @returns {string} Text without color formatting
 */
export function removeColorFormatting(text: string) {
    // ANSI escape codes for colors are usually in the format \x1b[<codes>m
    return text.replace(/\x1b\[\d{1,2}(;\d{1,2})*m/g, '');
}

/**
 * Gets a separator string repeated n times.
 * @param {number} n Number of times to repeat the separator
 * @returns {string} Separator string
 */
export function getSeparator(n: number) {
    return '='.repeat(n);
}

/**
 * Checks if the string is a valid URL.
 * @param {string} url String to check
 * @returns {boolean} If the URL is valid
 */
export function isValidUrl(url: string) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}
/**
 * removes starting `[` or ending `]` from hostname.
 * @param {string} hostname hostname to use
 * @returns {string} hostname plus the modifications
 */
export function urlHostnameToIPv6(hostname: string) {
    if (hostname.startsWith('[')) {
        hostname = hostname.slice(1);
    }
    if (hostname.endsWith(']')) {
        hostname = hostname.slice(0, -1);
    }
    return hostname;
}

/**
 * Test if can resolve a dns name.
 * @param {string} name Domain name to use
 * @param {boolean} useIPv6 If use IPv6
 * @param {boolean} useIPv4 If use IPv4
 * @returns {Promise<boolean>} Whether the domain can be resolved
 */
export async function canResolve(name: string, useIPv6 = true, useIPv4 = true) {
    try {
        let v6Resolved = false;
        let v4Resolved = false;

        if (useIPv6) {
            try {
                await dnsPromise.resolve6(name);
                v6Resolved = true;
                } catch {
                    v6Resolved = false;
                }
        }

        if (useIPv4) {
            try {
                await dnsPromise.resolve(name);
                v4Resolved = true;
                } catch {
                    v4Resolved = false;
                }
        }

        return v6Resolved || v4Resolved;
    } catch {
        return false;
    }
}

/**
 * Checks the network interfaces to determine the presence of IPv6 and IPv4 addresses.
 * @typedef {object} IPQueryResult
 * @property {boolean} hasIPv6Any - Whether the computer has any IPv6 address, including (`::1`).
 * @property {boolean} hasIPv4Any - Whether the computer has any IPv4 address, including (`127.0.0.1`).
 * @property {boolean} hasIPv6Local - Whether the computer has local IPv6 address (`::1`).
 * @property {boolean} hasIPv4Local - Whether the computer has local IPv4 address (`127.0.0.1`).
 * @returns {Promise<IPQueryResult>} A promise that resolves to an array containing:
 */
export async function getHasIP() {
    let hasIPv6Any = false;
    let hasIPv6Local = false;

    let hasIPv4Any = false;
    let hasIPv4Local = false;

    const interfaces = os.networkInterfaces();

    for (const iface of Object.values(interfaces)) {
        if (iface === undefined) {
            continue;
        }

        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        for (const info of iface) {
            if (info.family === 'IPv6') {
                hasIPv6Any = true;
                if (info.address === '::1') {
                    hasIPv6Local = true;
                }
            }

            if (info.family === 'IPv4') {
                hasIPv4Any = true;
                if (info.address === '127.0.0.1') {
                    hasIPv4Local = true;
                }
            }
            if (hasIPv6Any && hasIPv4Any && hasIPv6Local && hasIPv4Local) break;
        }
        if (hasIPv6Any && hasIPv4Any && hasIPv6Local && hasIPv4Local) break;
    }

    return { hasIPv6Any, hasIPv4Any, hasIPv6Local, hasIPv4Local };
}


/**
 * Converts various JavaScript primitives to boolean values.
 * Handles special case for "true"/"false" strings (case-insensitive)
 * @param {unknown} value - The value to convert to boolean
 * @returns {boolean} - The boolean representation of the value
 */
export function toBoolean(value: unknown) {
    // Handle string values case-insensitively
    if (typeof value === 'string') {
        // Trim and convert to lowercase for case-insensitive comparison
        const trimmedLower = value.trim().toLowerCase();

        // Handle explicit "true"/"false" strings
        if (trimmedLower === 'true') return true;
        if (trimmedLower === 'false') return false;
    }

    // Handle all other JavaScript values based on their "truthiness"
    return Boolean(value);
}

/**
 * converts string to boolean accepts 'true' or 'false' else it returns the string put in
 * @param {string|null} str Input string or null
 * @returns {boolean|string|null} boolean else original input string or null if input is
 */
export function stringToBool(str: unknown) {
    if (String(str).trim().toLowerCase() === 'true') return true;
    if (String(str).trim().toLowerCase() === 'false') return false;
    return str;
}

/**
 * Setup the minimum log level
 */
export function setupLogLevel() {
    // @ts-expect-error TS(2345) FIXME: Argument of type 'number' is not assignable to par... Remove this comment to see the full error message
    const logLevel = getConfigValue('logging.minLogLevel', LOG_LEVELS.DEBUG, 'number');

    globalThis.console.debug = logLevel <= LOG_LEVELS.DEBUG ? console.debug : () => { };
    globalThis.console.info = logLevel <= LOG_LEVELS.INFO ? console.info : () => { };
    globalThis.console.warn = logLevel <= LOG_LEVELS.WARN ? console.warn : () => { };
    globalThis.console.error = logLevel <= LOG_LEVELS.ERROR ? console.error : () => { };
}

/**
 * MemoryLimitedMap class that limits the memory usage of string values.
 */
export class MemoryLimitedMap {
    currentMemory: number;
    map: Map<string, string>;
    maxMemory: number;
    queue: string[];
    /**
     * Creates an instance of MemoryLimitedMap.
     * @param {string} cacheCapacity - Maximum memory usage in human-readable format (e.g., '1 GB').
     */
    constructor(cacheCapacity: string) {
        this.maxMemory = bytes.parse(cacheCapacity) ?? 0;
        this.currentMemory = 0;
        this.map = new Map();
        this.queue = [];
    }

    /**
     * Estimates the memory usage of a string in bytes.
     * Assumes each character occupies 2 bytes (UTF-16).
     * @param {string} str The string to estimate
     * @returns {number} Estimated size in bytes
     */
    static estimateStringSize(str: string) {
        return str ? str.length * 2 : 0;
    }

    /**
     * Adds or updates a key-value pair in the map.
     * If adding the new value exceeds the memory limit, evicts oldest entries.
     * @param {string} key The key to set
     * @param {string} value The value to set
     */
    set(key: string, value: string) {
        if (this.maxMemory <= 0) {
            return;
        }

        if (typeof key !== 'string' || typeof value !== 'string') {
            return;
        }

        const newValueSize = MemoryLimitedMap.estimateStringSize(value);

        // If the new value itself exceeds the max memory, reject it
        if (newValueSize > this.maxMemory) {
            return;
        }

        // Check if the key already exists to adjust memory accordingly
        if (this.map.has(key)) {
            const oldValue = this.map.get(key);
            // @ts-expect-error TS(2345) FIXME: Argument of type 'string | undefined' is not assig... Remove this comment to see the full error message
            const oldValueSize = MemoryLimitedMap.estimateStringSize(oldValue);
            this.currentMemory -= oldValueSize;
            // Remove the key from its current position in the queue
            const index = this.queue.indexOf(key);
            if (index > -1) {
                this.queue.splice(index, 1);
            }
        }

        // Evict oldest entries until there's enough space
        while (this.currentMemory + newValueSize > this.maxMemory && this.queue.length > 0) {
            const oldestKey = this.queue.shift();
            // @ts-expect-error TS(2345) FIXME: Argument of type 'string | undefined' is not assig... Remove this comment to see the full error message
            const oldestValue = this.map.get(oldestKey);
            // @ts-expect-error TS(2345) FIXME: Argument of type 'string | undefined' is not assig... Remove this comment to see the full error message
            const oldestValueSize = MemoryLimitedMap.estimateStringSize(oldestValue);
            // @ts-expect-error TS(2345) FIXME: Argument of type 'string | undefined' is not assig... Remove this comment to see the full error message
            this.map.delete(oldestKey);
            this.currentMemory -= oldestValueSize;
        }

        // After eviction, check again if there's enough space
        if (this.currentMemory + newValueSize > this.maxMemory) {
            return;
        }

        // Add the new key-value pair
        this.map.set(key, value);
        this.queue.push(key);
        this.currentMemory += newValueSize;
    }

    /**
     * Retrieves the value associated with the given key.
     * @param {string} key The key to retrieve
     * @returns {string | undefined} The associated value or undefined
     */
    get(key: string) {
        return this.map.get(key);
    }

    /**
     * Checks if the map contains the given key.
     * @param {string} key The key to check
     * @returns {boolean} True if the key exists in the map
     */
    has(key: string) {
        return this.map.has(key);
    }

    /**
     * Deletes the key-value pair associated with the given key.
     * @param {string} key The key to delete
     * @returns {boolean} - Returns true if the key was found and deleted, else false.
     */
    delete(key: string) {
        if (!this.map.has(key)) {
            return false;
        }
        const value = this.map.get(key);
        // @ts-expect-error TS(2345) FIXME: Argument of type 'string | undefined' is not assig... Remove this comment to see the full error message
        const valueSize = MemoryLimitedMap.estimateStringSize(value);
        this.map.delete(key);
        this.currentMemory -= valueSize;

        // Remove the key from the queue
        const index = this.queue.indexOf(key);
        if (index > -1) {
            this.queue.splice(index, 1);
        }

        return true;
    }

    /**
     * Clears all entries from the map.
     */
    clear() {
        this.map.clear();
        this.queue = [];
        this.currentMemory = 0;
    }

    /**
     * Returns the number of key-value pairs in the map.
     * @returns {number} The number of entries
     */
    size() {
        return this.map.size;
    }

    /**
     * Returns the current memory usage in bytes.
     * @returns {number} The current memory usage in bytes
     */
    totalMemory() {
        return this.currentMemory;
    }

    /**
     * Returns an iterator over the keys in the map.
     * @returns {IterableIterator<string>} An iterator over the keys
     */
    keys() {
        return this.map.keys();
    }

    /**
     * Returns an iterator over the values in the map.
     * @returns {IterableIterator<string>} An iterator over the values
     */
    values() {
        return this.map.values();
    }

    /**
     * Iterates over the map in insertion order.
     * @param {(value: string, key: string, map: MemoryLimitedMap) => void} callback - Function to execute for each element.
     */
    forEach(callback: (value: string, key: string, map: MemoryLimitedMap) => void) {
        this.map.forEach((value, key) => {
            callback(value, key, this);
        });
    }

    /**
     * Makes the MemoryLimitedMap iterable.
     * @returns {Iterator} - Iterator over [key, value] pairs.
     */
    [Symbol.iterator]() {
        return this.map[Symbol.iterator]();
    }
}

/**
 * A 'safe' version of `fs.readFileSync()`. Returns the contents of a file if it exists, falling back to a default value if not.
 * @param {string} filePath Path of the file to be read.
 * @param {Parameters<typeof fs.readFileSync>[1]} options Options object to pass through to `fs.readFileSync()` (default: `{ encoding: 'utf-8' }`).
 * @returns {string | null} The contents at `filePath` if it exists, or `null` if not.
 */
export function safeReadFileSync(filePath: string, options = { encoding: 'utf-8' }) {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, options);
    return null;
}

/**
 * Set the title of the terminal window
 * @param {string} title Desired title for the window
 */
export function setWindowTitle(title: string) {
    if (process.platform === 'win32') {
        process.title = title;
    } else {
        process.stdout.write(`\x1b]2;${title}\x1b\x5c`);
    }
}

/**
 * Parses a JSON string and applies a mutation function to the parsed object.
 * @param {string} jsonString JSON string to parse
 * @param {(obj: unknown) => void} mutation Mutation function to apply to the parsed JSON object
 * @returns {string} Mutated JSON string
 */
export function mutateJsonString(jsonString: string, mutation: (obj: unknown) => void) {
    try {
        const json = JSON.parse(jsonString);
        mutation(json);
        return JSON.stringify(json);
    } catch (error) {
        console.error('Error parsing or mutating JSON:', error);
        return jsonString;
    }
}

/**
 * Sets the permissions of a file or directory to be writable.
 * @param {string} targetPath Path to the file or directory
 */
export function setPermissionsSync(targetPath: string) {
    /**
     * Appends writable permission to the file mode.
     * @param {string} filePath Path to the file
     * @param {fs.Stats} stats File stats
     */
    function appendWritablePermission(filePath: string, stats: fs.Stats) {
        const currentMode = stats.mode;
        const newMode = currentMode | 0o200;
        if (newMode != currentMode) {
            fs.chmodSync(filePath, newMode);
        }
    }

    try {
        const stats = fs.statSync(targetPath);

        if (stats.isDirectory()) {
            appendWritablePermission(targetPath, stats);
            const files = fs.readdirSync(targetPath);

            // @ts-expect-error TS(7006) FIXME: Parameter 'file' implicitly has an 'any' type.
            files.forEach((file) => {
                setPermissionsSync(path.join(targetPath, file));
            });
        } else {
            appendWritablePermission(targetPath, stats);
        }
    } catch (error) {
        console.error(`Error setting write permissions for ${targetPath}:`, error);
    }
}

/**
 * Checks if a child path is under a parent path.
 * @param {string} parentPath Parent path
 * @param {string} childPath Child path
 * @returns {boolean} Returns true if the child path is under the parent path, false otherwise
 */
export function isPathUnderParent(parentPath: string, childPath: string) {
    const normalizedParent = path.normalize(parentPath);
    const normalizedChild = path.normalize(childPath);

    const relativePath = path.relative(normalizedParent, normalizedChild);

    return relativePath !== '..' && !relativePath.startsWith('..' + path.sep) && !path.isAbsolute(relativePath);
}

/**
 * Checks if the given request is a file URL.
 * @param {string | URL | Request} request The request to check
 * @returns {boolean} Returns true if the request is a file URL, false otherwise
 */
export function isFileURL(request: string | URL | Request) {
    if (typeof request === 'string') {
        return request.startsWith('file://');
    }
    if (request instanceof URL) {
        // @ts-expect-error TS(2339) FIXME: Property 'protocol' does not exist on type 'URL | ... Remove this comment to see the full error message
        return request.protocol === 'file:';
    }
    if (request instanceof Request) {
        // @ts-expect-error TS(2339) FIXME: Property 'url' does not exist on type 'URL | Reque... Remove this comment to see the full error message
        return request.url.startsWith('file://');
    }
    return false;
}

/**
 * Gets the URL from the request.
 * @param {string | URL | Request} request The request to get the URL from
 * @returns {string} The URL of the request
 */
export function getRequestURL(request: string | URL | Request) {
    if (typeof request === 'string') {
        return request;
    }
    if (request instanceof URL) {
        // @ts-expect-error TS(2339) FIXME: Property 'href' does not exist on type 'URL | Requ... Remove this comment to see the full error message
        return request.href;
    }
    if (request instanceof Request) {
        // @ts-expect-error TS(2339) FIXME: Property 'url' does not exist on type 'URL | Reque... Remove this comment to see the full error message
        return request.url;
    }
    throw new TypeError('Invalid request type');
}

/**
 * Flattens and simplifies a JSON schema to be compatible with the strict requirements
 * of Google's Generative AI API.
 * @param {Record<string, unknown>} schema The JSON schema to process.
 * @param {string} api The API source.
 * @returns {Record<string, unknown>} The flattened and simplified schema.
 */
export function flattenSchema(schema: Record<string, unknown>, api: string) {
    if (!schema || typeof schema !== 'object') {
        return schema;
    }

    const schemaCopy = structuredClone(schema);
    const isGoogleApi = [CHAT_COMPLETION_SOURCES.VERTEXAI, CHAT_COMPLETION_SOURCES.MAKERSUITE].includes(api);

    const definitions = schemaCopy.$defs || {};
    delete schemaCopy.$defs;

    /**
     * Resolves $refs in the schema.
     * @param {unknown} obj Object to resolve
     * @param {string[]} parents List of parents to prevent recursion
     * @returns {unknown} The resolved object
     */
    // @ts-expect-error TS(7023) FIXME: 'resolve' implicitly has return type 'any' because... Remove this comment to see the full error message
    function resolve(obj: unknown, parents: string[] = []) {
        if (!obj || typeof obj !== 'object') {
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map(item => resolve(item, parents));
        }

        // 1. Resolve $refs first
        // @ts-expect-error TS(2339) FIXME: Property '$ref' does not exist on type 'object'.
        if (obj.$ref?.startsWith('#/$defs/')) {
            // @ts-expect-error TS(2339) FIXME: Property '$ref' does not exist on type 'object'.
            const defName = obj.$ref.split('/').pop();
            if (parents.includes(defName)) return {}; // Prevent infinite recursion
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            if (definitions[defName]) {
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                return resolve(structuredClone(definitions[defName]), [...parents, defName]);
            }
            return {}; // Broken reference
        }

        // 2. Process the object's properties
        const result = {};
        for (const key in obj) {
            if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;

            // For Google, filter unsupported top-level keywords
            if (isGoogleApi && ['default', 'additionalProperties', 'exclusiveMinimum', 'propertyNames'].includes(key)) {
                continue;
            }

            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            result[key] = resolve(obj[key], parents);
        }

        return result;
    }

    const flattenedSchema = resolve(schemaCopy);
    delete flattenedSchema.$schema;
    return flattenedSchema;
}

/**
 * Writes to a file, creating it's parent directories if needed.
 * @param {string} filePath Path to the file
 * @param {string} data Data to write
 */
export function tryWriteFileSync(filePath: string, data: string) {
    const directory = path.dirname(filePath);
    //Ensure the directory exists.
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
    }
    writeFileAtomicSync(filePath, data, 'utf8');
}

/**
 * Attempts to read a file as utf8.
 * @param {string} filePath Path to the file
 * @returns {string|null} File contents or null if reading fails
 */
export function tryReadFileSync(filePath: string) {
    try {
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf8');
        }
    } catch (error) {
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        console.error(`Error reading ${filePath}: ${error.message}`);
    }
    return null;
}

/**
 * Attempts to delete a file.
 * @param {string} filePath Target file.
 * @returns {boolean} Returns true if the file was found and deleted.
 */
export function tryDeleteFile(filePath: string) {
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.info(`Deleted file: ${filePath}`);
        return true;
    } else {
        console.error(`File not found '${filePath}'`);
        return false;
    }
}

/**
 * Reads the first line of a file asynchronously.
 * @param {string} filePath Path to the file
 * @returns {Promise<string>} The first line of the file
 */
export function readFirstLine(filePath: string) {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream });
    return new Promise((resolve, reject) => {
        let resolved = false;
        // @ts-expect-error TS(7006) FIXME: Parameter 'line' implicitly has an 'any' type.
        rl.on('line', line => {
            resolved = true;
            rl.close();
            stream.close();
            resolve(line);
        });

        // @ts-expect-error TS(7006) FIXME: Parameter 'error' implicitly has an 'any' type.
        rl.on('error', error => {
            resolved = true;
            reject(error);
        });

        // Handle empty files
        stream.on('end', () => {
            if (!resolved) {
                resolved = true;
                resolve('');
            }
        });
    });
}

/**
 * If the file is an image, and the request's user agent matches Firefox, then the response's headers are set to invalidate the cache.
 * Without this, Firefox ignores updated images even after a refresh.
 * https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control
 * @param {string} file File path
 * @param {import('express').Request} request Request object
 * @param {import('express').Response} response Response object
 */
export function invalidateFirefoxCache(file: string, request: import('express').Request, response: import('express').Response) {
    const mimeType = isFirefox(request) && mime.lookup(file);
    if (mimeType && mimeType.startsWith('image/')) {
        response.setHeader('Cache-Control', 'must-understand, no-store');
    }
}
