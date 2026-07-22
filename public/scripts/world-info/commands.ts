/**
 * World Info slash commands — all /command registrations for world info.
 *
 * Extracted from world-info.ts to keep that file focused on UI/editor logic.
 */

// External dependencies
import { getContext } from '../extensions.js';
import { power_user } from '../power-user.js';
import { t } from '../i18n.js';
import {
    isTrueBoolean,
    isFalseBoolean,
    getCharaFilename,
    logSlashCommandWarn,
    findChar,
    onlyUnique,
    parseStringArray,
    uuidv4,
    getUniqueName,
} from '../utils.js';

import { SlashCommandParser } from '../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../slash-commands/SlashCommand.js';
import {
    ARGUMENT_TYPE,
    SlashCommandArgument,
    SlashCommandNamedArgument,
} from '../slash-commands/SlashCommandArgument.js';
import { SlashCommandEnumValue, enumTypes } from '../slash-commands/SlashCommandEnumValue.js';
import {
    commonEnumProviders,
    enumIcons,
} from '../slash-commands/SlashCommandCommonEnumsProvider.js';
import { SlashCommandClosure } from '../slash-commands/SlashCommandClosure.js';
import { Fuse } from '../../lib.js';
import {
    substituteParams,
    saveMetadata,
    getCurrentChatId,
    chat_metadata,
    name1,
    this_chid,
} from '../../script.js';

// World-info internal modules
import {
    world_info_position,
    world_info_logic,
    METADATA_KEY,
    originalWIDataKeyMap,
} from './constants.js';
import {
    saveWorldInfo,
    createWorldInfoEntry,
    saveSettingsNow,
    newWorldInfoEntryDefinition,
    newWorldInfoEntryTemplate,
    createNewWorldInfo,
} from './data.js';
import { wiManager } from './manager.js';
import { worldInfoCache, WorldInfoTimedEffects, loadWorldInfo } from './engine.js';
import { setWIOriginalDataValue } from './editor.js';

/** @typedef {{ onWorldInfoChange: Function, setWorldInfoButtonClass: Function, charUpdateAddAuxWorld: Function, charUpdatePrimaryWorld: Function, reloadEditor: Function, setPersonaDescription: Function }} WIDeps */

/**
 * Registers all world-info related slash commands.
 * @param {WIDeps} deps - Dependencies from the parent module to avoid circular imports
 * @returns {void}
 */
export function registerWorldInfoSlashCommands(deps) {
    const {
        onWorldInfoChange,
        setWorldInfoButtonClass,
        charUpdateAddAuxWorld,
        charUpdatePrimaryWorld,
        reloadEditor,
        setPersonaDescription,
    } = deps;
    /**
     * Gets a *rough* approximation of the current chat context.
     * Normally, it is provided externally by the prompt builder.
     * Don't use for anything critical!
     * @returns {string[]} Array of chat messages
     */
    function getScanningChat(): string[] {
        return (getContext().chat as ChatMessage[])
            .filter((x: ChatMessage) => !x.is_system)
            .map((x: ChatMessage) => x.mes)
            .filter((x: string | undefined): x is string => !!x);
    }

    /**
     * @param {string} file - World info file name
     * @param {object} root0 - Options object
     * @param {object} [root0.args] - Arguments
     * @param {unknown} [root0.unnamed] - Unnamed argument
     * @param {string} [root0.callbackName] - Callback name for logging
     * @returns {Promise<string|import('./types.js').WorldInfoEntryData[]>} Entries from file or empty string
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'file' implicitly has an 'any' type.
    async function getEntriesFromFile(
        file,
        { args = {}, unnamed = null, callbackName = 'getEntriesFromFile' } = {},
    ) {
        if (!file || !wiManager.worldNames.includes(file)) {
            notyf.warning(t`Valid World Info file name is required`);
            logSlashCommandWarn(
                `${callbackName}: Valid World Info file name is required`,
                args,
                unnamed,
            );
            return '';
        }

        const data = await loadWorldInfo(file);

        if (!data || !('entries' in data)) {
            notyf.warning(t`World Info file has an invalid format`);
            logSlashCommandWarn(
                `${callbackName}: World Info file has an invalid format`,
                args,
                unnamed,
            );
            return '';
        }

        const entries = Object.values(data.entries) as import('./types.js').WorldInfoEntryData[];

        if (!entries || entries.length === 0) {
            notyf.warning(t`World Info file has no entries`);
            logSlashCommandWarn(`${callbackName}: World Info file has no entries`, args, unnamed);
            return '';
        }

        return entries;
    }

    /**
     * Gets the name of the persona-bound lorebook.
     * @param {import('./slash-commands/SlashCommand.js').NamedArguments} args Named arguments
     * @param {string} _unnamedArg not used
     * @returns {Promise<string>} The name of the persona-bound lorebook
     */
    // @ts-expect-error TS(7031) FIXME: Binding element 'name' implicitly has an 'any' type.
    async function getPersonaBookCallback({ name, create }, _unnamedArg) {
        const bookName = power_user.persona_description_lorebook || '';
        if (bookName) {
            return bookName;
        }

        if (isTrueBoolean(String(create))) {
            // @ts-expect-error TS(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
            const newName = await createWorldWithName(
                name,
                `Persona Book ${name1}`
                    .replace(/[^a-z0-9 -]/gi, '_')
                    .replace(/_{2,}/g, '_')
                    .substring(0, 64),
            );
            power_user.persona_description_lorebook = newName;
            setPersonaDescription();
            saveSettingsNow();
            return newName;
        }

        return '';
    }

    /**
     * Gets the name of the character-bound lorebook.
     * @param {import('./slash-commands/SlashCommand.js').NamedArguments} args Named arguments
     * @param {string} characterIdentifier Character name
     * @returns {Promise<string>} The name of the character-bound lorebook, a JSON string of the character's lorebooks, or an empty string
     */
    // @ts-expect-error TS(7031) FIXME: Binding element 'type' implicitly has an 'any' type.
    async function getCharBookCallback({ type, name, create }, characterIdentifier) {
        const context = getContext();
        if (context.groupId && !characterIdentifier)
            throw new Error(
                'This command is not available in groups without providing a character name',
            );
        type =
            String(type ?? '')
                .trim()
                .toLowerCase() || 'primary';
        characterIdentifier =
            String(characterIdentifier ?? '') ||
            context.characters[context.characterId]?.avatar ||
            null;
        const character = findChar({ name: characterIdentifier });
        if (!character) {
            notyf.error(t`Character not found.`);
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ characterIdentifier: any; }' i... Remove this comment to see the full error message
            logSlashCommandWarn(
                'getCharBookCallback: Character not found',
                { type, name, create },
                { characterIdentifier },
            );
            return '';
        }
        const books = [];
        if (type === 'all' || (type === 'primary' && character.data?.extensions?.world)) {
            books.push(character.data.extensions.world);
        }
        if (type === 'all' || type === 'additional') {
            // @ts-expect-error TS(2345) FIXME: Argument of type 'number' is not assignable to par... Remove this comment to see the full error message
            const fileName = getCharaFilename(context.characters.indexOf(character));
            // @ts-expect-error TS(2339) FIXME: Property 'charLore' does not exist on type '{}'.
            const extraCharLore = wiManager.info.charLore?.find((e) => e.name === fileName);
            if (extraCharLore && Array.isArray(extraCharLore.extraBooks)) {
                books.push(...extraCharLore.extraBooks.filter(onlyUnique).filter(Boolean));
            }
        }

        if (isTrueBoolean(String(create)) && books.length === 0) {
            // @ts-expect-error TS(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
            const newName = await createWorldWithName(
                name,
                `Character Book ${character.name}`
                    .replace(/[^a-z0-9 -]/gi, '_')
                    .replace(/_{2,}/g, '_')
                    .substring(0, 64),
            );
            // Also assign the book now - additional if requested, otherwise as primary
            if (type === 'additional') {
                await charUpdateAddAuxWorld(character.avatar, newName);
            } else {
                await charUpdatePrimaryWorld(newName);
            }
            // Refresh UI, if needed
            setWorldInfoButtonClass(this_chid);
            books.push(newName);
        }

        return type === 'primary'
            ? (books[0] ?? '')
            : JSON.stringify(books.filter(onlyUnique).filter(Boolean));
    }

    /**
     * Gets the name of the chat-bound lorebook. Creates a new one if it doesn't exist.
     * @param {import('./slash-commands/SlashCommand.js').NamedArguments} args Named arguments
     * @returns {Promise<string>} The name of the chat-bound lorebook
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
    async function getChatBookCallback(args) {
        const chatId = getCurrentChatId();

        if (!chatId) {
            notyf.warning(t`Open a chat to get a name of the chat-bound lorebook`);
            logSlashCommandWarn(
                'getChatBookCallback: Open a chat to get a name of the chat-bound lorebook',
                args,
            );
            return '';
        }

        if (
            chat_metadata[METADATA_KEY] &&
            wiManager.worldNames.includes(chat_metadata[METADATA_KEY])
        ) {
            return chat_metadata[METADATA_KEY];
        }

        if (isFalseBoolean(String(args.create))) {
            return '';
        }

        // @ts-expect-error TS(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
        const name = await createWorldWithName(
            args.name,
            `Chat Book ${getCurrentChatId()}`
                .replace(/[^a-z0-9 -]/gi, '_')
                .replace(/_{2,}/g, '_')
                .substring(0, 64),
        );

        chat_metadata[METADATA_KEY] = name;
        await saveMetadata();
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.querySelector('.chat_lorebook_button').classList.add('world_set');
        return name;
    }

    /**
     * @param {string} [possibleName] - Possible name for the world
     * @param {string} [fallbackName] - Fallback name if possible name is not provided
     * @returns {Promise<string>} The created world name
     */
    async function createWorldWithName(possibleName = undefined, fallbackName = undefined) {
        let newName = (() => {
            // Use the provided name if it's not in use
            if (typeof possibleName === 'string') {
                const name = String(possibleName);
                if (wiManager.worldNames.includes(name)) {
                    throw new Error('This World Info file name is already in use');
                }
                return name;
            }

            // Replace non-alphanumeric characters with underscores, cut to 64 characters
            return fallbackName ?? `Lorebook (${uuidv4()})`;
        })();

        // Make sure the name is unique
        newName =
            getUniqueName(newName, wiManager.worldNames.includes.bind(wiManager.worldNames)) ??
            newName;

        await createNewWorldInfo(newName);
        return newName;
    }

    /**
     * @param {object} args - Arguments object containing file and field
     * @param {string} value - Search value
     * @returns {Promise<string>} The matching entry UID or empty string
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
    async function findBookEntryCallback(args, value) {
        const file = args.file;
        const field = args.field || 'key';

        // @ts-expect-error TS(2322) FIXME: Type '{ value: any; }' is not assignable to type 'null | undefined'.
        const entries = await getEntriesFromFile(file, {
            args,
            unnamed: { value },
            callbackName: 'findBookEntryCallback',
        });

        if (!entries) {
            return '';
        }

        if (typeof newWorldInfoEntryTemplate[field] === 'boolean') {
            const isTrue = isTrueBoolean(value);
            const isFalse = isFalseBoolean(value);

            if (isTrue) {
                value = String(true);
            }

            if (isFalse) {
                value = String(false);
            }
        }

        const fuse = new Fuse(entries, {
            keys: [{ name: field, weight: 1 }],
            includeScore: true,
            threshold: 0.3,
        });

        const results = fuse.search(value);

        if (!results || results.length === 0) {
            return '';
        }

        const result = (results[0]?.item as import('./types.js').WorldInfoEntryData | undefined)
            ?.uid;

        if (result === undefined) {
            return '';
        }

        return String(result);
    }

    /**
     * @param {object} args - Arguments object containing file and field
     * @param {string} uid - Entry UID
     * @returns {Promise<string>} The entry field value or empty string
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
    async function getEntryFieldCallback(args, uid) {
        const file = args.file;
        const field = args.field || 'content';
        const tags = getContext().tags;

        // @ts-expect-error TS(2322) FIXME: Type '{ uid: any; }' is not assignable to type 'null | undefined'.
        const entries = await getEntriesFromFile(file, {
            args,
            unnamed: { uid },
            callbackName: 'getEntryFieldCallback',
        });

        if (!entries) {
            return '';
        }

        const entry = entries.find((x) => String(x.uid) === String(uid));

        if (!entry) {
            notyf.warning('Valid UID is required');
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ uid: any; }' is not assignable... Remove this comment to see the full error message
            logSlashCommandWarn('getEntryFieldCallback: Valid UID is required', args, { uid });
            console.warn();
            return '';
        }

        if (!Object.hasOwn(newWorldInfoEntryDefinition, field)) {
            notyf.warning('Valid field name is required');
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ uid: any; }' is not assignable... Remove this comment to see the full error message
            logSlashCommandWarn('getEntryFieldCallback: Valid field name is required', args, {
                uid,
            });
            return '';
        }

        // handle special cases, otherwise execute default logic
        let fieldValue;
        switch (field) {
            case 'characterFilterNames':
                if (entry.characterFilter) {
                    fieldValue = entry.characterFilter.names;
                }
                break;
            case 'characterFilterTags':
                if (entry.characterFilter) {
                    if (!entry.characterFilter.tags) {
                        return '';
                    }
                    //Find the tag objects corresponding to each ID in the array, then return the names
                    const filterTags = entry.characterFilter.tags;
                    fieldValue = tags
                        .filter((tag) => filterTags.includes(tag.id))
                        .map((tag) => tag.name);
                }
                break;
            case 'characterFilterExclude':
                if (entry.characterFilter) {
                    fieldValue = entry.characterFilter.isExclude;
                }
                break;
            default:
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expression of type 'any' can't be used to index type 'WorldInfoEntryData'
                fieldValue =
                    entry[/** @type {keyof import('./types.js').WorldInfoEntryData} */ (field)] ??
                    newWorldInfoEntryDefinition[
                        /** @type {keyof typeof newWorldInfoEntryDefinition} */ (field)
                    ]?.default;
        }

        if (fieldValue === undefined) {
            return '';
        }

        if (Array.isArray(fieldValue)) {
            return JSON.stringify(fieldValue.map((x) => substituteParams(x)));
        }

        return substituteParams(String(fieldValue));
    }

    /**
     * @param {object} args - Arguments object containing file and key
     * @param {string} [content] - Entry content
     * @returns {Promise<string>} The created entry UID or empty string
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
    async function createEntryCallback(args, content) {
        const file = args.file;
        const key = args.key;

        // Load book from server into the store
        const book = await wiManager.loadBookIntoStore(file);
        if (!book || !book.entries) {
            notyf.warning('Valid World Info file name is required');
            logSlashCommandWarn(
                'createEntryCallback: Valid World Info file name is required',
                args,
            );
            return '';
        }

        const store = wiManager.getStore(file);

        const entry = (await createWorldInfoEntry(store)) as
            | import('./types.js').WorldInfoEntryData
            | undefined;

        if (!entry) return '';

        if (key) {
            entry.key.push(key);
            entry.addMemo = true;
            entry.comment = key;
        }

        if (content) {
            entry.content = content;
        }

        // Sync modified entry back to store and persist
        await store.updateEntry(entry.uid, entry);
        book.entries[entry.uid] = entry;
        await saveWorldInfo(file, book);
        reloadEditor(file);

        return String(entry.uid);
    }

    /**
     * @param {object} args - Arguments object containing file, uid, and field
     * @param {string} value - New field value
     * @returns {Promise<string>} Empty string on success
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
    async function setEntryFieldCallback(args, value) {
        const file = args.file;
        const uid = args.uid;
        const field = args.field || 'content';
        const tags = getContext().tags;

        // characterFilter is an object with internal fields we need to access, which may also may be null and need to be populated
        // @ts-expect-error TS(7006) FIXME: Parameter 'currentEntry' implicitly has an 'any' type.
        const createCharacterFilterFieldObjectIfNeeded = (
            /** @type {import('./types.js').WorldInfoEntryData} */ currentEntry,
        ) => {
            if (!currentEntry.characterFilter) {
                Object.assign(currentEntry, {
                    characterFilter: {
                        isExclude: false,
                        names: [],
                        tags: [],
                    },
                });
            }
        };

        if (value === undefined) {
            notyf.warning('Value is required');
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ value: any; }' is not assignab... Remove this comment to see the full error message
            logSlashCommandWarn('setEntryFieldCallback: Value is required', args, { value });
            return '';
        }

        value = value.replace(/\\([{}|])/g, '$1');

        const data = await loadWorldInfo(file);

        if (!data || !('entries' in data)) {
            notyf.warning('Valid World Info file name is required');
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ value: any; }' is not assignab... Remove this comment to see the full error message
            logSlashCommandWarn(
                'setEntryFieldCallback: Valid World Info file name is required',
                args,
                { value },
            );
            return '';
        }

        const entry = data.entries[uid];

        if (!entry) {
            notyf.warning('Valid UID is required');
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ value: any; }' is not assignab... Remove this comment to see the full error message
            logSlashCommandWarn('setEntryFieldCallback: Valid UID is required', args, { value });
            return '';
        }

        if (!Object.hasOwn(newWorldInfoEntryDefinition, field)) {
            notyf.warning('Valid field name is required');
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ value: any; }' is not assignab... Remove this comment to see the full error message
            logSlashCommandWarn('setEntryFieldCallback: Valid field name is required', args, {
                value,
            });
            return '';
        }

        // Init a default value for the field if it does not exist
        if (!Object.hasOwn(entry, field)) {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            entry[field] = newWorldInfoEntryDefinition[field].default;
        }

        // Use an array filter if it exists for the field
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        const arrayFilter = newWorldInfoEntryDefinition[field]?.arrayFilter || (() => true);

        // handle special cases, otherwise execute default logic
        // @ts-expect-error TS(7034) FIXME: Variable 'tagNames' implicitly has type 'any' in s... Remove this comment to see the full error message
        let tagNames;
        let charNames;
        switch (field) {
            case 'characterFilterNames':
                createCharacterFilterFieldObjectIfNeeded(entry);
                charNames = parseStringArray(value);
                entry.characterFilter.names = charNames
                    // @ts-expect-error TS(2322) FIXME: Type 'string' is not assignable to type 'null | un... Remove this comment to see the full error message
                    .map((name) =>
                        getCharaFilename(null, {
                            manualAvatarKey: findChar({
                                name,
                                allowAvatar: true,
                                preferCurrentChar: false,
                                quiet: true,
                            })?.avatar,
                        }),
                    )
                    .filter(Boolean)
                    .filter(onlyUnique);
                setWIOriginalDataValue(data, uid, 'character_filter', entry.characterFilter);
                break;
            case 'characterFilterTags':
                createCharacterFilterFieldObjectIfNeeded(entry);
                tagNames = parseStringArray(value);
                //Find the tag objects corresponding to each name in the user array, then return an array of the corresponding IDs
                // @ts-expect-error TS(7005) FIXME: Variable 'tagNames' implicitly has an 'any' type.
                entry.characterFilter.tags = tags
                    .filter((tag) => tagNames.includes(tag.name))
                    .map((tag) => tag.id);
                setWIOriginalDataValue(data, uid, 'character_filter', entry.characterFilter);
                break;
            case 'characterFilterExclude':
                createCharacterFilterFieldObjectIfNeeded(entry);
                entry.characterFilter.isExclude = isTrueBoolean(value);
                setWIOriginalDataValue(data, uid, 'character_filter', entry.characterFilter);
                break;
            default:
                if (Array.isArray(entry[field])) {
                    entry[field] = parseStringArray(value).filter(arrayFilter);
                } else if (typeof entry[field] === 'boolean') {
                    entry[field] = isTrueBoolean(value);
                } else if (typeof entry[field] === 'number') {
                    entry[field] = Number(value);
                } else {
                    entry[field] = value;
                }

                if (
                    originalWIDataKeyMap[/** @type {keyof typeof originalWIDataKeyMap} */ (field)]
                ) {
                    setWIOriginalDataValue(
                        data,
                        uid,
                        originalWIDataKeyMap[
                            /** @type {keyof typeof originalWIDataKeyMap} */ (field)
                        ] as string,
                        entry[field] as string,
                    );
                }
        }

        // Sync the mutated entry to the store and persist
        const store = wiManager.getStore(file);
        await store.updateEntry(Number(uid), entry);
        await saveWorldInfo(file, data);
        reloadEditor(file);
        return '';
    }
    /**
     *
     * @param args
     * @param value
     */
    async function getTimedEffectCallback(args: Record<string, unknown>, value: unknown) {
        if (!getCurrentChatId()) {
            throw new Error('This command can only be used in chat');
        }

        const file = args.file as string;
        const uid = value;
        const effect = args.effect as string;

        // @ts-expect-error TS(2322) FIXME: Type '{ uid: any; }' is not assignable to type 'nu... Remove this comment to see the full error message
        const entries = await getEntriesFromFile(file, {
            args,
            unnamed: { uid },
            callbackName: 'getTimedEffectCallback',
        });

        if (!entries) {
            return '';
        }

        const entry = structuredClone(entries.find((x) => String(x.uid) === String(uid))) as
            | import('./types.js').WIScanEntry
            | undefined;

        if (!entry) {
            notyf.warning('Valid UID is required');
            logSlashCommandWarn('getTimedEffectCallback: Valid UID is required', args, {
                uid,
            } as unknown as null | undefined);
            return '';
        }

        entry.world = file; // Required by the timed effects manager
        const chat = getScanningChat();
        const timedEffects = new WorldInfoTimedEffects(chat, [entry]);

        if (!timedEffects.isValidType(effect)) {
            notyf.warning('Valid effect type is required');
            logSlashCommandWarn('getTimedEffectCallback: Valid effect type is required', args, {
                uid,
            } as unknown as null | undefined);
            return '';
        }

        const data = timedEffects.getEffectMetadata(effect, entry);

        if (String(args.format).trim().toLowerCase() === ARGUMENT_TYPE.NUMBER) {
            return String(data ? data.end - chat.length : 0);
        }

        return String(!!data);
    }

    /**
     * @param {object} args - Arguments object containing file, uid, and effect
     * @param {string} value - New effect state
     * @returns {Promise<string>} Empty string on success
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
    async function setTimedEffectCallback(args, value) {
        if (!getCurrentChatId()) {
            throw new Error('This command can only be used in chat');
        }

        const file = args.file;
        const uid = args.uid;
        const effect = args.effect;

        if (value === undefined) {
            notyf.warning('New state is required');
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ value: any; }' is not assignab... Remove this comment to see the full error message
            logSlashCommandWarn('setTimedEffectCallback: New state is required', args, { value });
            return '';
        }

        // @ts-expect-error TS(2322) FIXME: Type '{ value: any; }' is not assignable to type '... Remove this comment to see the full error message
        const entries = await getEntriesFromFile(file, {
            args,
            unnamed: { value },
            callbackName: 'setTimedEffectCallback',
        });

        if (!entries) {
            return '';
        }

        const entry = structuredClone(entries.find((x) => String(x.uid) === String(uid))) as
            | import('./types.js').WIScanEntry
            | undefined;

        if (!entry) {
            notyf.warning('Valid UID is required');
            // @ts-expect-error TS(2345) FIXME: Argument of type '{ value: any; }' is not assignab... Remove this comment to see the full error message
            logSlashCommandWarn('setTimedEffectCallback: Valid UID is required', args, { value });
            return '';
        }

        entry.world = file; // Required by the timed effects manager
        const chat = getScanningChat();
        const timedEffects = new WorldInfoTimedEffects(chat, [entry]);

        if (!timedEffects.isValidType(effect)) {
            notyf.warning('Valid effect type is required');
            logSlashCommandWarn('setTimedEffectCallback: Valid effect type is required', args, {
                value,
            } as unknown as null | undefined);
            return '';
        }

        if (!entry[effect]) {
            notyf.warning(
                'This entry does not have the selected effect. Configure it in the editor first.',
            );
            logSlashCommandWarn(
                'setTimedEffectCallback: This entry does not have the selected effect',
                args,
                { value } as unknown as null | undefined,
            );
            return '';
        }

        const getNewEffectState = () => {
            const currentState = !!timedEffects.getEffectMetadata(effect, entry);

            if (['toggle', 't', ''].includes(value.trim().toLowerCase())) {
                return !currentState;
            }

            if (isTrueBoolean(value)) {
                return true;
            }

            if (isFalseBoolean(value)) {
                return false;
            }

            return currentState;
        };

        const newEffectState = getNewEffectState();
        timedEffects.setTimedEffect(effect, entry, newEffectState);

        await saveMetadata();
        notyf.success(
            `Timed effect "${effect}" for entry ${entry.uid} is now ${newEffectState ? 'active' : 'inactive'}`,
        );

        return '';
    }

    /** A collection of local enum providers for this context of world info */
    const localEnumProviders = {
        /**
         * All possible fields that can be set in a WI entry
         * @returns {SlashCommandEnumValue[]} Array of enum values for WI entry fields
         */
        wiEntryFields: () =>
            Object.entries(newWorldInfoEntryDefinition).map(
                ([key, value]) =>
                    new SlashCommandEnumValue(
                        key,
                        `[${value.type}] default: ${typeof value.default === 'string' ? `'${value.default}'` : JSON.stringify(value.default)}`,
                        enumTypes.enum,
                        enumIcons.getDataTypeIcon(value.type),
                    ),
            ),

        /**
         * All existing UIDs based on the file argument as world name
         * @param {import('./slash-commands/SlashCommandExecutor.js').SlashCommandExecutor} executor - The slash command executor
         * @returns {SlashCommandEnumValue[]} Array of enum values for WI entry UIDs
         */
        // @ts-expect-error TS(7006) FIXME: Parameter 'executor' implicitly has an 'any' type.
        wiUids: (
            /** @type {import('./slash-commands/SlashCommandExecutor.js').SlashCommandExecutor} */ executor,
        ) => {
            // @ts-expect-error TS(7006) FIXME: Parameter 'it' implicitly has an 'any' type.
            const file = executor.namedArgumentList.find((it) => it.name == 'file')?.value;
            if (file instanceof SlashCommandClosure)
                throw new Error("Argument 'file' does not support closures");
            // Try find world from cache
            if (!worldInfoCache.has(file)) return [];
            const world = worldInfoCache.get(file);
            if (!world) return [];
            return Object.entries(world.entries).map(([uid, data]) => {
                const d = data as Record<string, unknown>;
                return new SlashCommandEnumValue(
                    uid,
                    `${d.comment ? `${d.comment as string}: ` : ''}${(d.key as string[]).join(', ')}${(d.keysecondary as string[])?.length ? ` [${Object.entries(world_info_logic).find(([_, value]) => value == d.selectiveLogic)?.[0] ?? ''}] ${(d.keysecondary as string[]).join(', ')}` : ''} [${getWiPositionString(d)}]`,
                    enumTypes.enum,
                    enumIcons.getWiStatusIcon(d),
                );
            });
        },

        /**
         * @returns {SlashCommandEnumValue[]} Array of enum values for timed effects
         */
        timedEffects: () => [
            new SlashCommandEnumValue(
                'sticky',
                'Stays active for N messages',
                enumTypes.enum,
                '📌',
            ),
            new SlashCommandEnumValue('cooldown', 'Cooldown for N messages', enumTypes.enum, '⌛'),
        ],
    };

    /**
     * @param {object} entry - WI entry object
     * @returns {string} Position string representation
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
    function getWiPositionString(entry) {
        switch (entry.position) {
            case world_info_position.before:
                return '↑Char';
            case world_info_position.after:
                return '↓Char';
            case world_info_position.EMTop:
                return '↑EM';
            case world_info_position.EMBottom:
                return '↓EM';
            case world_info_position.ANTop:
                return '↑AT';
            case world_info_position.ANBottom:
                return '↓AT';
            case world_info_position.atDepth:
                return `@D${enumIcons.getRoleIcon(entry.role)}`;
            default:
                return '<Unknown>';
        }
    }

    /**
     * @returns {Promise<string>} JSON string of selected global books
     */
    async function getGlobalBooksCallback() {
        if (!wiManager.selectedWorlds?.length) {
            return JSON.stringify([]);
        }

        const entries = wiManager.selectedWorlds.slice();

        console.debug(
            `[WI] Selected global world info has ${entries.length} entries`,
            wiManager.selectedWorlds,
        );

        return JSON.stringify(entries);
    }

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'world',
            callback: onWorldInfoChange,
            namedArgumentList: [
                new SlashCommandNamedArgument(
                    // @ts-expect-error TS(2345) FIXME: Argument of type 'SlashCommandEnumValue[]' is not ... Remove this comment to see the full error message
                    'state',
                    'set world state',
                    [ARGUMENT_TYPE.STRING],
                    false,
                    false,
                    null,
                    commonEnumProviders.boolean('onOffToggle')(),
                ),
                new SlashCommandNamedArgument(
                    'silent',
                    'suppress toast messages',
                    [ARGUMENT_TYPE.BOOLEAN],
                    false,
                ),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'world name',
                    typeList: [ARGUMENT_TYPE.STRING],
                    enumProvider: commonEnumProviders.worlds,
                }),
            ],
            helpString: `
            <div>
                Sets active World, or unsets if no args provided, use <code>state=off</code> and <code>state=toggle</code> to deactivate or toggle a World, use <code>silent=true</code> to suppress toast messages.
            </div>
        `,
            aliases: [],
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'getchatbook',
            callback: getChatBookCallback,
            returns: 'lorebook name',
            helpString:
                'Get a name of the chat-bound lorebook or create a new one if was unbound, and pass it down the pipe.',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'name',
                    description:
                        'lorebook name if creating a new one, will be auto-generated otherwise',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    acceptsMultiple: false,
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'create',
                    description: "create a new lorebook if it doesn't exist",
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                    isRequired: false,
                    acceptsMultiple: false,
                    enumList: commonEnumProviders.boolean('trueFalse')(),
                    defaultValue: 'true',
                }),
            ],
            aliases: ['getchatlore', 'getchatwi'],
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'getglobalbooks',
            callback: getGlobalBooksCallback,
            returns: 'list of selected lorebook names',
            helpString:
                'Get a list of names of the selected global lorebooks and pass it down the pipe.',
            aliases: ['getgloballore', 'getglobalwi'],
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'getpersonabook',
            callback: getPersonaBookCallback,
            returns: 'lorebook name',

            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'name',
                    description:
                        'lorebook name if creating a new one, will be auto-generated otherwise',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    acceptsMultiple: false,
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'create',
                    description: "create a new lorebook if it doesn't exist",
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                    isRequired: false,
                    acceptsMultiple: false,
                    enumList: commonEnumProviders.boolean('trueFalse')(),
                    defaultValue: 'false',
                }),
            ],
            helpString:
                'Get a name of the current persona-bound lorebook and pass it down the pipe. Returns empty string if persona lorebook is not set.',
            aliases: ['getpersonalore', 'getpersonawi'],
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'getcharbook',
            callback: getCharBookCallback,
            returns: 'lorebook name or a list of lorebook names',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'type',
                    description:
                        'type of the lorebook to get, returns a list for "all" and "additional"',
                    typeList: [ARGUMENT_TYPE.STRING],
                    enumList: ['primary', 'additional', 'all'],
                    defaultValue: 'primary',
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'name',
                    description:
                        'lorebook name if creating a new one, will be auto-generated otherwise',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    acceptsMultiple: false,
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'create',
                    description: "create a new lorebook if it doesn't exist",
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                    isRequired: false,
                    acceptsMultiple: false,
                    enumList: commonEnumProviders.boolean('trueFalse')(),
                    defaultValue: 'false',
                }),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description:
                        'Character name - or unique character identifier (avatar key). If not provided, the current character is used.',
                    typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: commonEnumProviders.characters('character'),
                }),
            ],
            helpString:
                'Get a name of the character-bound lorebook and pass it down the pipe. Returns empty string if character lorebook is not set. Does not work in group chats without providing a character avatar name.',
            aliases: ['getcharlore', 'getcharwi'],
        }),
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'findentry',
            aliases: ['findlore', 'findwi'],
            returns: 'UID',
            callback: findBookEntryCallback,
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'file',
                    description: 'book name',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: commonEnumProviders.worlds,
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'field',
                    description: 'field value for fuzzy match (default: key)',
                    typeList: [ARGUMENT_TYPE.STRING],
                    defaultValue: 'key',
                    enumList: localEnumProviders.wiEntryFields(),
                }),
            ],
            unnamedArgumentList: [
                new SlashCommandArgument('texts', ARGUMENT_TYPE.STRING, true, true),
            ],
            helpString: `
            <div>
                Find a UID of the record from the specified book using the fuzzy match of a field value (default: key) and pass it down the pipe.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/findentry file=chatLore field=key Shadowfang</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'getentryfield',
            aliases: ['getlorefield', 'getwifield'],
            callback: getEntryFieldCallback,
            returns: 'field value',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'file',
                    description: 'book name',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: commonEnumProviders.worlds,
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'field',
                    description: 'field to retrieve (default: content)',
                    typeList: [ARGUMENT_TYPE.STRING],
                    defaultValue: 'content',
                    enumList: localEnumProviders.wiEntryFields(),
                }),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'record UID',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: localEnumProviders.wiUids,
                }),
            ],
            helpString: `
            <div>
                Get a field value (default: content) of the record with the UID from the specified book and pass it down the pipe.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/getentryfield file=chatLore field=content 123</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'createentry',
            callback: createEntryCallback,
            aliases: ['createlore', 'createwi'],
            returns: 'UID of the new record',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'file',
                    description: 'book name',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: commonEnumProviders.worlds,
                }),
                new SlashCommandNamedArgument('key', 'record key', [ARGUMENT_TYPE.STRING], false),
            ],
            unnamedArgumentList: [
                new SlashCommandArgument('content', [ARGUMENT_TYPE.STRING], false),
            ],
            helpString: `
            <div>
                Create a new record in the specified book with the key and content (both are optional) and pass the UID down the pipe.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/createentry file=chatLore key=Shadowfang The sword of the king</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'setentryfield',
            callback: setEntryFieldCallback,
            aliases: ['setlorefield', 'setwifield'],
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'file',
                    description: 'book name',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: commonEnumProviders.worlds,
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'uid',
                    description: 'record UID',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: localEnumProviders.wiUids,
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'field',
                    description: 'field name (default: content)',
                    typeList: [ARGUMENT_TYPE.STRING],
                    defaultValue: 'content',
                    enumList: localEnumProviders.wiEntryFields(),
                }),
            ],
            unnamedArgumentList: [new SlashCommandArgument('value', [ARGUMENT_TYPE.STRING], true)],
            helpString: `
            <div>
                Set a field value (default: content) of the record with the UID from the specified book. To set multiple values for key fields, use comma-delimited list as a value.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/setentryfield file=chatLore uid=123 field=key Shadowfang,sword,weapon</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'wi-set-timed-effect',
            callback: setTimedEffectCallback,
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'file',
                    description: 'book name',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: commonEnumProviders.worlds,
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'uid',
                    description: 'record UID',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: localEnumProviders.wiUids,
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'effect',
                    description: 'effect name',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: localEnumProviders.timedEffects,
                }),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'new state of the effect',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    acceptsMultiple: false,
                    enumList: commonEnumProviders.boolean('onOffToggle')(),
                }),
            ],
            helpString: `
            <div>
                Set a timed effect for the record with the UID from the specified book. The duration must be set in the entry itself.
                Will only be applied for the current chat. Enabling an effect that was already active refreshes the duration.
                If the last chat message is swiped or deleted, the effect will be removed.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/wi-set-timed-effect file=chatLore uid=123 effect=sticky on</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'wi-get-timed-effect',
            callback: getTimedEffectCallback,
            helpString: `
            <div>
                Get the current state of the timed effect for the record with the UID from the specified book.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <code>/wi-get-timed-effect file=chatLore format=bool effect=sticky 123</code> - returns true or false if the effect is active or not
                    </li>
                    <li>
                        <code>/wi-get-timed-effect file=chatLore format=number effect=sticky 123</code> - returns the remaining duration of the effect, or 0 if inactive
                    </li>
                </ul>
            </div>
        `,
            returns: 'state of the effect',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'file',
                    description: 'book name',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: commonEnumProviders.worlds,
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'effect',
                    description: 'effect name',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: localEnumProviders.timedEffects,
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'format',
                    description: 'output format',
                    isRequired: false,
                    typeList: [ARGUMENT_TYPE.STRING],
                    defaultValue: ARGUMENT_TYPE.BOOLEAN,
                    enumList: [ARGUMENT_TYPE.BOOLEAN, ARGUMENT_TYPE.NUMBER],
                }),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'record UID',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: localEnumProviders.wiUids,
                }),
            ],
        }),
    );
}
