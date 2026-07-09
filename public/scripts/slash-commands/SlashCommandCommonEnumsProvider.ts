import { chat_metadata, characters, substituteParams, chat, extension_prompt_roles, extension_prompt_types, name2, neutralCharacterName } from '../../script.js';
import { extension_settings } from '../extensions.js';
// @ts-expect-error TS(7034) FIXME: Variable 'groups' implicitly has type 'any[]' in s... Remove this comment to see the full error message
import { getGroupMembers, groups } from '../group-chats.js';
import { power_user } from '../power-user.js';
// @ts-expect-error TS(7034) FIXME: Variable 'tags' implicitly has type 'any[]' in som... Remove this comment to see the full error message
import { searchCharByName, getTagsList, tags, tag_map } from '../tags.js';
import { onlyUniqueJson, sortIgnoreCaseAndAccents } from '../utils.js';
import { world_names } from '../world-info.js';
import { SlashCommandClosure } from './SlashCommandClosure.js';
import { SlashCommandEnumValue, enumTypes } from './SlashCommandEnumValue.js';

/** @typedef {import('./SlashCommandExecutor.js').SlashCommandExecutor} SlashCommandExecutor */
/** @typedef {import('./SlashCommandScope.js').SlashCommandScope} SlashCommandScope */

/**
 * A collection of regularly used enum icons
 */
export const enumIcons = {
    default: '◊',

    // Variables
    variable: '𝑥',
    localVariable: 'L',
    globalVariable: 'G',
    scopeVariable: 'S',

    // Common types
    character: '👤',
    group: '🧑‍🤝‍🧑',
    persona: '🧙‍♂️',
    qr: 'QR',
    closure: '𝑓',
    macro: '{{',
    tag: '🏷️',
    world: '🌐',
    preset: '⚙️',
    file: '📄',
    message: '💬',
    reasoning: '💡',
    voice: '🎤',
    server: '🖥️',
    popup: '🗔',
    image: '🖼️',
    video: '🎥',
    key: '🔑',
    spinner: '♻️',
    stop: '🛑',

    true: '✔️',
    false: '❌',
    null: '🚫',
    undefined: '❓',

    // Value types
    boolean: '🔲',
    string: '📝',
    number: '1️⃣',
    array: '[]',
    enum: '📚',
    dictionary: '{}',

    // Roles
    system: '⚙️',
    user: '👤',
    assistant: '🤖',

    // WI Icons
    constant: '🔵',
    normal: '🟢',
    disabled: '❌',
    vectorized: '🔗',

    /**
     * Returns the appropriate state icon based on a boolean
     * @param {boolean} state - The state to determine the icon for
     * @returns {string} The corresponding state icon
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'state' implicitly has an 'any' type.
    getStateIcon: (state) => {
        return state ? enumIcons.true : enumIcons.false;
    },

    /**
     * Returns the appropriate WI icon based on the entry
     * @param {object} entry - WI entry
     * @returns {string} The corresponding WI icon
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'entry' implicitly has an 'any' type.
    getWiStatusIcon: (entry) => {
        if (entry.constant) return enumIcons.constant;
        if (entry.disable) return enumIcons.disabled;
        if (entry.vectorized) return enumIcons.vectorized;
        return enumIcons.normal;
    },

    /**
     * Returns the appropriate icon based on the role
     * @param {extension_prompt_roles} role - The role to get the icon for
     * @returns {string} The corresponding icon
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'role' implicitly has an 'any' type.
    getRoleIcon: (role) => {
        switch (role) {
            case extension_prompt_roles.SYSTEM: return enumIcons.system;
            case extension_prompt_roles.USER: return enumIcons.user;
            case extension_prompt_roles.ASSISTANT: return enumIcons.assistant;
            default: return enumIcons.default;
        }
    },

    /**
     * A function to get the data type icon
     * @param {string} type - The type of the data
     * @returns {string} The corresponding data type icon
     */
    // @ts-expect-error TS(7023) FIXME: 'getDataTypeIcon' implicitly has return type 'any'... Remove this comment to see the full error message
    getDataTypeIcon: (type) => {
        // Remove possible nullable types definition to match type icon
        type = type.replace(/\?$/, '');
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        return enumIcons[type] ?? enumIcons.default;
    },
};

/**
 * A collection of common enum providers
 *
 * Can be used on `SlashCommandNamedArgument` and `SlashCommandArgument` and their `enumProvider` property.
 */
export const commonEnumProviders = {
    /**
     * Enum values for booleans. Either using true/false or on/off
     * Optionally supports "toggle".
     * @param {('onOff'|'onOffToggle'|'trueFalse')?} [mode] - The mode to use. Default is 'trueFalse'.
     * @returns {() => SlashCommandEnumValue[]}
     */
    boolean: (mode = 'trueFalse') => () => {
        switch (mode) {
            case 'onOff': return [new SlashCommandEnumValue('on', null, 'macro', enumIcons.true), new SlashCommandEnumValue('off', null, 'macro', enumIcons.false)];
            case 'onOffToggle': return [new SlashCommandEnumValue('on', null, 'macro', enumIcons.true), new SlashCommandEnumValue('off', null, 'macro', enumIcons.false), new SlashCommandEnumValue('toggle', null, 'macro', enumIcons.boolean)];
            case 'trueFalse': return [new SlashCommandEnumValue('true', null, 'macro', enumIcons.true), new SlashCommandEnumValue('false', null, 'macro', enumIcons.false)];
            default: throw new Error(`Invalid boolean enum provider mode: ${mode}`);
        }
    },

    /**
     * All possible variable names
     *
     * Can be filtered by `type` to only show global or local variables
     * @param {...('global'|'local'|'scope'|'all')} type - The type of variables to include in the array. Can be 'all', 'global', or 'local'.
     * @returns {(executor:SlashCommandExecutor, scope:SlashCommandScope) => SlashCommandEnumValue[]}
     */
    // @ts-expect-error TS(7019) FIXME: Rest parameter 'type' implicitly has an 'any[]' ty... Remove this comment to see the full error message
    variables: (...type) => (_, scope) => {
        const types = type.flat();
        const isAll = types.includes('all');
        return [
            // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
            ...(isAll || types.includes('scope') ? scope.allVariableNames.map(name => new SlashCommandEnumValue(name, null, enumTypes.variable, enumIcons.scopeVariable)) : []),
            // @ts-expect-error TS(2339) FIXME: Property 'variables' does not exist on type '{}'.
            ...(isAll || types.includes('local') ? Object.keys(chat_metadata.variables ?? []).map(name => new SlashCommandEnumValue(name, null, enumTypes.name, enumIcons.localVariable)) : []),
            ...(isAll || types.includes('global') ? Object.keys(extension_settings.variables.global ?? []).map(name => new SlashCommandEnumValue(name, null, enumTypes.macro, enumIcons.globalVariable)) : []),
        ].filter((item, idx, list) => idx == list.findIndex(it => it.value == item.value));
    },

    /**
     * Enum values for numbers and variable names
     *
     * Includes all variable names and the ability to specify any number
     * @param {SlashCommandExecutor} executor - The executor of the slash command
     * @param {SlashCommandScope} scope - The scope of the slash command
     * @returns {SlashCommandEnumValue[]} The enum values
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'executor' implicitly has an 'any' type.
    numbersAndVariables: (executor, scope) => [
        ...commonEnumProviders.variables('all')(executor, scope),
        new SlashCommandEnumValue(
            'any variable name',
            null,
            enumTypes.variable,
            enumIcons.variable,
            // @ts-expect-error TS(2345) FIXME: Argument of type '(input: any) => boolean' is not ... Remove this comment to see the full error message
            (input) => /^\w*$/.test(input),
            // @ts-expect-error TS(7006) FIXME: Parameter 'input' implicitly has an 'any' type.
            (input) => input,
        ),
        new SlashCommandEnumValue(
            'any number',
            null,
            enumTypes.number,
            enumIcons.number,
            // @ts-expect-error TS(2345) FIXME: Argument of type '(input: any) => boolean' is not ... Remove this comment to see the full error message
            (input) => input == '' || !Number.isNaN(Number(input)),
            // @ts-expect-error TS(7006) FIXME: Parameter 'input' implicitly has an 'any' type.
            (input) => input,
        ),
    ],

    /**
     * All possible char entities, like characters and groups. Can be filtered down to just one type.
     * @param {('all' | 'character' | 'group')?} [mode] - Which type to return
     * @returns {() => SlashCommandEnumValue[]}
     */
    characters: (mode = 'all') => () => {
        return [
            // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
            ...(['all', 'character'].includes(mode) ? characters.map(char => new SlashCommandEnumValue(char.name, null, enumTypes.name, enumIcons.character)) : []),
            // @ts-expect-error TS(7005) FIXME: Variable 'groups' implicitly has an 'any[]' type.
            ...(['all', 'group'].includes(mode) ? groups.map(group => new SlashCommandEnumValue(group.name, null, enumTypes.qr, enumIcons.group)) : []),
            ...(name2 === neutralCharacterName ? [new SlashCommandEnumValue(neutralCharacterName, null, enumTypes.name, '🥸')] : []),
        ];
    },

    /**
     * All group members of the given group, or default the current active one
     * @param {string?} groupId - The id of the group - pass in `undefined` to use the current active group
     * @returns {() =>SlashCommandEnumValue[]}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'character' implicitly has an 'any' type... Remove this comment to see the full error message
    groupMembers: (groupId = undefined) => () => getGroupMembers(groupId).map((character, index) => new SlashCommandEnumValue(String(index), character.name, enumTypes.enum, enumIcons.character)),

    /**
     * All possible personas
     * @param root0
     * @param root0.allowPersonaKey
     * @returns {() => SlashCommandEnumValue[]}
     */
    personas: ({ allowPersonaKey = false } = {}) => () => Object.entries(power_user.personas).map(([personaKey, personaName]) => {
        const existsMultiple = Object.values(power_user.personas).filter(p => p === personaName).length > 1;
        const returnValue = allowPersonaKey && existsMultiple ? personaKey : personaName;
        // @ts-expect-error TS(2345) FIXME: Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
        return new SlashCommandEnumValue(returnValue, allowPersonaKey && existsMultiple ? personaName : null, enumTypes.name, enumIcons.persona);
    }),

    /**
     * All possible tags, or only those that have been assigned
     * @param {('all' | 'assigned')} [mode] - Which types of tags to show
     * @returns {() => SlashCommandEnumValue[]}
     */
    tags: (mode = 'all') => () => {
        const assignedTags = mode === 'assigned' ? new Set(Object.values(tag_map).flat()) : new Set();
        // @ts-expect-error TS(7005) FIXME: Variable 'tags' implicitly has an 'any[]' type.
        return tags.filter(tag => mode === 'all' || (mode === 'assigned' && assignedTags.has(tag.id)))
            .map(tag => new SlashCommandEnumValue(tag.name, null, enumTypes.command, enumIcons.tag));
    },

    /**
     * All possible tags for a given char/group entity
     * @param {('all' | 'existing' | 'not-existing')?} [mode] - Which types of tags to show
     * @returns {(executor:SlashCommandExecutor, scope:SlashCommandScope) => SlashCommandEnumValue[]}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'executor' implicitly has an 'any' type.
    tagsForChar: (mode = 'all') => (executor, _scope) => {
        // Try to see if we can find the char during execution to filter down the tags list some more. Otherwise take all tags.
        // @ts-expect-error TS(7006) FIXME: Parameter 'it' implicitly has an 'any' type.
        const charName = executor.namedArgumentList.find(it => it.name == 'name')?.value;
        if (charName instanceof SlashCommandClosure) throw new Error('Argument \'name\' does not support closures');
        const key = searchCharByName(substituteParams(charName), { suppressLogging: true });
        const assigned = key ? getTagsList(key) : [];
        // @ts-expect-error TS(7005) FIXME: Variable 'tags' implicitly has an 'any[]' type.
        return tags.filter(it => mode === 'all' || mode === 'existing' && assigned.includes(it) || mode === 'not-existing' && !assigned.includes(it))
            .map(tag => new SlashCommandEnumValue(tag.name, null, enumTypes.command, enumIcons.tag));
    },

    /**
     * All messages in the current chat, returning the message id
     *
     * Optionally supports variable names, and/or a placeholder for the last/new message id
     * @param {object} [options] - Optional arguments
     * @param {boolean} [options.allowIdAfter] - Whether to add an enum option for the new message id after the last message
     * @param {boolean} [options.allowVars] - Whether to add enum option for variable names
     * @returns {(executor:SlashCommandExecutor, scope:SlashCommandScope) => SlashCommandEnumValue[]}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'executor' implicitly has an 'any' type.
    messages: ({ allowIdAfter = false, allowVars = false } = {}) => (executor, scope) => {
        // @ts-expect-error TS(7006) FIXME: Parameter 'it' implicitly has an 'any' type.
        const nameFilter = executor.namedArgumentList.find(it => it.name == 'name')?.value || '';
        return [
            // @ts-expect-error TS(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
            ...chat.map((message, index) => new SlashCommandEnumValue(String(index), `${message.name}: ${message.mes}`, enumTypes.number, message.is_user ? enumIcons.user : message.is_system ? enumIcons.system : enumIcons.assistant)).filter(value => !nameFilter || value.description.startsWith(`${nameFilter}:`)),
            // @ts-expect-error TS(2345) FIXME: Argument of type '">> After Last Message >>"' is n... Remove this comment to see the full error message
            ...(allowIdAfter ? [new SlashCommandEnumValue(String(chat.length), '>> After Last Message >>', enumTypes.enum, '➕')] : []),
            ...(allowVars ? commonEnumProviders.variables('all')(executor, scope) : []),
        ];
    },

    /**
     * Media items attached to a specific message
     * @returns {(executor:SlashCommandExecutor, scope:SlashCommandScope) => SlashCommandEnumValue[]}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'executor' implicitly has an 'any' type.
    messageMedia: () => (executor, _scope) => {
        // @ts-expect-error TS(7006) FIXME: Parameter 'it' implicitly has an 'any' type.
        const messageId = Number(executor.namedArgumentList.find(it => ['mesId', 'id'].includes(it.name))?.value || '');
        if (isNaN(messageId) || messageId === null || messageId < 0 || messageId >= chat.length) {
            return [];
        }
        const message = chat[messageId];
        // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
        if (!Array.isArray(message?.extra?.media)) {
            return [];
        }
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        return message.extra.media.map((media, index) => new SlashCommandEnumValue(index.toString(), media.title || message.extra.title || '[Untitled]', enumTypes.enum, enumIcons[media.type] || enumIcons.file));
    },

    /**
     * All names used in the current chat.
     * @returns {SlashCommandEnumValue[]}
     */
    messageNames: () => chat
        .map(message => ({
            // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
            name: message.name,
            // @ts-expect-error TS(2339) FIXME: Property 'is_user' does not exist on type 'never'.
            icon: message.is_user ? enumIcons.user : enumIcons.assistant,
        }))
        .filter(onlyUniqueJson)
        .sort((a, b) => sortIgnoreCaseAndAccents(a.name, b.name))
        // @ts-expect-error TS(2345) FIXME: Argument of type 'null' is not assignable to param... Remove this comment to see the full error message
        .map(name => new SlashCommandEnumValue(name.name, null, null, name.icon)),

    /**
     * All existing worlds / lorebooks
     * @returns {SlashCommandEnumValue[]}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'worldName' implicitly has an 'any' type... Remove this comment to see the full error message
    worlds: () => world_names.map(worldName => new SlashCommandEnumValue(worldName, null, enumTypes.name, enumIcons.world)),

    /**
     * All existing injects for the current chat
     * @returns {SlashCommandEnumValue[]}
     */
    injects: () => {
        // @ts-expect-error TS(2339) FIXME: Property 'script_injects' does not exist on type '... Remove this comment to see the full error message
        if (!chat_metadata.script_injects || !Object.keys(chat_metadata.script_injects).length) return [];
        // @ts-expect-error TS(2339) FIXME: Property 'script_injects' does not exist on type '... Remove this comment to see the full error message
        return Object.entries(chat_metadata.script_injects)
            .map(([id, inject]) => {
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                const positionName = (Object.entries(extension_prompt_types)).find(([_, value]) => value === inject.position)?.[0] ?? 'unknown';
                // @ts-expect-error TS(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
                return new SlashCommandEnumValue(id, `${enumIcons.getRoleIcon(inject.role ?? extension_prompt_roles.SYSTEM)}[Inject](${positionName}, depth: ${inject.depth}, scan: ${inject.scan ?? false}) ${inject.value}`,
                    enumTypes.enum, '💉');
            });
    },

    /**
     * Gets somewhat recognizable STscript types.
     * @returns {SlashCommandEnumValue[]}
     */
    types: () => [
        // @ts-expect-error TS(2339) FIXME: Property 'type' does not exist on type '{ enum: st... Remove this comment to see the full error message
        new SlashCommandEnumValue('string', null, enumTypes.type, enumIcons.string),
        // @ts-expect-error TS(2339) FIXME: Property 'type' does not exist on type '{ enum: st... Remove this comment to see the full error message
        new SlashCommandEnumValue('number', null, enumTypes.type, enumIcons.number),
        // @ts-expect-error TS(2339) FIXME: Property 'type' does not exist on type '{ enum: st... Remove this comment to see the full error message
        new SlashCommandEnumValue('boolean', null, enumTypes.type, enumIcons.boolean),
        // @ts-expect-error TS(2339) FIXME: Property 'type' does not exist on type '{ enum: st... Remove this comment to see the full error message
        new SlashCommandEnumValue('array', null, enumTypes.type, enumIcons.array),
        // @ts-expect-error TS(2339) FIXME: Property 'type' does not exist on type '{ enum: st... Remove this comment to see the full error message
        new SlashCommandEnumValue('object', null, enumTypes.type, enumIcons.dictionary),
        // @ts-expect-error TS(2339) FIXME: Property 'type' does not exist on type '{ enum: st... Remove this comment to see the full error message
        new SlashCommandEnumValue('null', null, enumTypes.type, enumIcons.null),
        // @ts-expect-error TS(2339) FIXME: Property 'type' does not exist on type '{ enum: st... Remove this comment to see the full error message
        new SlashCommandEnumValue('undefined', null, enumTypes.type, enumIcons.undefined),
    ],

    messageRoles: () => [
        new SlashCommandEnumValue('user', null, enumTypes.enum, enumIcons.user),
        new SlashCommandEnumValue('assistant', null, enumTypes.enum, enumIcons.assistant),
        new SlashCommandEnumValue('system', null, enumTypes.enum, enumIcons.system),
    ],

    backgrounds: () => Array.from(document.querySelectorAll('.bg_example'))
        .map(it => new SlashCommandEnumValue(it.getAttribute('bgfile')))
        .filter(it => it.value?.length),

    connectionProfiles: ({ includeNone = false } = {}) => () => [
        ...(includeNone ? [new SlashCommandEnumValue('<None>')] : []),
        // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
        ...extension_settings.connectionManager.profiles.map(p => new SlashCommandEnumValue(p.name, null, enumTypes.name, enumIcons.server)),
    ],
};


/**
 * A collection of common enum match providers
 *
 * Can be used on `SlashCommandEnumValue` and their `matchProvider` property.
 */
export const commonEnumMatchProviders = {
    /**
     * Provides autocomplete matching for folder-like enum values.
     * Matches if the input starts with the check or vice versa (case-insensitive).
     * @param {string} input - The input string to match against
     * @param {string} check - The check string to match with
     * @param {object} [options] - Options
     * @param {boolean} [options.trueOnEmpty] - Whether to return true when input is empty
     * @returns {boolean} - True if the strings match according to the folder matching rules
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'input' implicitly has an 'any' type.
    folderEnum: (input, check, { trueOnEmpty = true } = {}) => {
        if (!check) return false;
        if (!input) return trueOnEmpty;
        const inputLower = input.toLowerCase();
        const checkLower = check.toLowerCase();
        return inputLower.startsWith(checkLower) || checkLower.startsWith(inputLower);
    },
};
