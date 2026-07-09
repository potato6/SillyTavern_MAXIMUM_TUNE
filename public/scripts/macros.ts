import { Handlebars, moment, seedrandom, droll } from '../lib.js';
import { chat, chat_metadata, main_api, getMaxPromptTokens, getMaxContextTokens, getMaxResponseTokens, getCurrentChatId, substituteParams, eventSource, event_types, extension_prompts } from '../script.js';
import { timestampToMoment, isDigitsOnly, getStringHash, escapeRegex, uuidv4 } from './utils.js';
import { textgenerationwebui_banned_in_macros } from './textgen-settings.js';
import { getInstructMacros } from './instruct-mode.js';
import { getVariableMacros } from './variables.js';
import { isMobile } from './RossAscends-mods.js';
import { inject_ids } from './constants.js';
import { initRegisterMacros, macros as macroSystem } from './macros/macro-system.js';
import { power_user } from './power-user.js';

/**
 * @typedef Macro
 * @property {RegExp} regex - Regular expression to match the macro
 * @property {(substring: string, ...args: any[]) => string} replace - Function to replace the macro
 */

// Register any macro that you want to leave in the compiled story string
Handlebars.registerHelper('trim', () => '{{trim}}');
// Catch-all helper for any macro that is not defined for story strings
Handlebars.registerHelper('helperMissing', function (...args: unknown[]) {
    const options = args[args.length - 1];
    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
    const macroName = options.name;
    return substituteParams(`{{${macroName}}}`);
});

/**
 * @typedef {Object<string, *>} EnvObject
 * @typedef {(nonce: string) => string} MacroFunction
 */

/**
 * @typedef {object} CustomMacro
 * @property {string} key - Macro name (key)
 * @property {string} description - Optional description of the macro
 */

/**
 * @deprecated Use macros.registry.registerMacro (from scripts/macros/macro-system.js)
 * or substituteParams({ dynamicMacros }) with the new macro engine.
 */
export class MacrosParser {
    /**
     * A map of registered macros.
     * @type {Map<string, string|MacroFunction>}
     */
    static #macros = new Map();

    /**
     * A map of macro descriptions.
     * @type {Map<string, string>}
     */
    static #descriptions = new Map();

    /**
     * Logs a deprecation warning for MacrosParser APIs, pointing callers to
     * the new macro engine registration surface.
     * @param {string} method
     * @param {string} replacement
     * @param {IArguments} [methodArgs]
     * @returns {void}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'method' implicitly has an 'any' type.
    static #logDeprecated(method, replacement, methodArgs = null) {
        console.warn(`[DEPRECATED] MacrosParser.${method} is deprecated and will be removed in a future version. Use ${replacement} instead. Arguments:`, (methodArgs ?? 'none'));
    }

    /**
     * Bridges a legacy MacrosParser macro registration into the new macro
     * engine when the experimental macro engine flag is enabled.
     *
     * This mirrors the simple "{{key}}" replacement behavior by registering
     * a 0-arg macro in MacroRegistry that does not take arguments and returns
     * the sanitized value from the legacy registry.
     * @param {string} key
     * @param {string|MacroFunction} value
     * @param {string} description
     * @returns {void}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'key' implicitly has an 'any' type.
    static #registerMacroInNewEngine(key, value, description) {
        if (!power_user.experimental_macro_engine) {
            return;
        }

        // Like the old MacrosParser, we explicitly allow overriding macros, and only warn
        if (macroSystem.registry.hasMacro(key)) {
            console.warn(`Macro ${key} is already registered`);
        }

        const legacyValue = value;

        macroSystem.registry.registerMacro(key, {
            // Legacy MacrosParser macros never took arguments; keep the
            // contract that only {{key}} without arguments is valid.
            category: 'legacy',
            description: typeof description === 'string' ? description : 'Automatically registered macro from MacrosParser',
            handler: () => {
                /** @type {string|MacroFunction|undefined} */
                let stored = legacyValue;

                if (typeof stored === 'function') {
                    try {
                        const nonce = uuidv4();
                        stored = stored(nonce);
                    } catch (e) {
                        console.warn(`Macro "${key}" function threw an error.`, e);
                        stored = '';
                    }
                }

                // Let the new macro engine's normalizeMacroResult handle type
                // normalization for the returned value.
                return stored;
            },
        });
    }

    /**
     * Bridges a legacy MacrosParser macro unregistration into the new macro
     * engine when the experimental macro engine flag is enabled.
     * @param {string} key
     * @returns {void}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'key' implicitly has an 'any' type.
    static #unregisterMacroInNewEngine(key) {
        if (!power_user.experimental_macro_engine) {
            return;
        }

        macroSystem.registry.unregisterMacro(key);
    }

    /**
     * Returns an iterator over all registered macros.
     * @returns {IterableIterator<CustomMacro>}
     */
    static [Symbol.iterator] = function* () {
        // When experimental macro engine is active, yield from the new registry
        if (power_user.experimental_macro_engine) {
            // Exclude hidden aliases for consistency with autocomplete behavior
            for (const def of macroSystem.registry.getAllMacros({ excludeHiddenAliases: true })) {
                yield { key: def.name, description: def.description || '' };
            }
            return;
        }

        for (const macro of MacrosParser.#macros.keys()) {
            yield { key: macro, description: MacrosParser.#descriptions.get(macro) };
        }
    };

    /**
     * Access a macro by its name.
     * @param {string} key Macro name (key)
     * @returns {string|MacroFunction|undefined} The macro value
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'key' implicitly has an 'any' type.
    static get(key) {
        // @ts-expect-error TS(2345) FIXME: Argument of type 'any[]' is not assignable to para... Remove this comment to see the full error message
        MacrosParser.#logDeprecated('get', 'macros.registry.getMacro (from scripts/macros/macro-system.js)', [key]);
        return MacrosParser.#macros.get(key);
    }

    /**
     * Checks if a macro is registered.
     * @param {string} key Macro name (key)
     * @returns {boolean} True if the macro is registered, false otherwise
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'key' implicitly has an 'any' type.
    static has(key) {
        // @ts-expect-error TS(2345) FIXME: Argument of type 'any[]' is not assignable to para... Remove this comment to see the full error message
        MacrosParser.#logDeprecated('has', 'macros.registry.hasMacro (from scripts/macros/macro-system.js)', [key]);
        if (power_user.experimental_macro_engine) {
            return macroSystem.registry.hasMacro(key);
        }

        return MacrosParser.#macros.has(key);
    }

    /**
     * Registers a global macro that can be used anywhere where substitution is allowed.
     * @param {string} key Macro name (key)
     * @param {string|MacroFunction} value A string or a function that returns a string
     * @param {string} [description] Optional description of the macro
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'key' implicitly has an 'any' type.
    static registerMacro(key, value, description = '') {
        // @ts-expect-error TS(2345) FIXME: Argument of type 'any[]' is not assignable to para... Remove this comment to see the full error message
        MacrosParser.#logDeprecated('registerMacro', 'macros.registry.registerMacro (from scripts/macros/macro-system.js) or substituteParams({ dynamicMacros })', [key, value, description]);
        if (typeof key !== 'string') {
            throw new Error('Macro key must be a string');
        }

        // Allowing surrounding whitespace would just create more confusion...
        key = key.trim();

        if (!key) {
            throw new Error('Macro key must not be empty or whitespace only');
        }

        if (key.startsWith('{{') || key.endsWith('}}')) {
            throw new Error('Macro key must not include the surrounding braces');
        }

        if (typeof value !== 'string' && typeof value !== 'function') {
            console.warn(`Macro value for "${key}" will be converted to a string`);
            value = this.sanitizeMacroValue(value);
        }

        MacrosParser.#registerMacroInNewEngine(key, value, description);
        if (power_user.experimental_macro_engine) {
            return;
        }

        if (this.#macros.has(key)) {
            console.warn(`Macro ${key} is already registered`);
        }

        this.#macros.set(key, value);

        if (typeof description === 'string' && description) {
            this.#descriptions.set(key, description);
        }
    }

    /**
     * Unregisters a global macro with the given key
     * @param {string} key Macro name (key)
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'key' implicitly has an 'any' type.
    static unregisterMacro(key) {
        // @ts-expect-error TS(2345) FIXME: Argument of type 'any[]' is not assignable to para... Remove this comment to see the full error message
        MacrosParser.#logDeprecated('unregisterMacro', 'macros.registry.unregisterMacro (from scripts/macros/macro-system.js)', [key]);
        if (typeof key !== 'string') {
            throw new Error('Macro key must be a string');
        }

        // Allowing surrounding whitespace would just create more confusion...
        key = key.trim();

        if (!key) {
            throw new Error('Macro key must not be empty or whitespace only');
        }

        if (power_user.experimental_macro_engine) {
            MacrosParser.#unregisterMacroInNewEngine(key);
            return;
        }

        const deleted = this.#macros.delete(key);

        if (!deleted) {
            console.warn(`Macro ${key} was not registered`);
        }

        this.#descriptions.delete(key);
    }

    /**
     * Populate the env object with macro values from the current context.
     * @param {EnvObject} env Env object for the current evaluation context
     * @returns {void}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'env' implicitly has an 'any' type.
    static populateEnv(env) {
        if (!env || typeof env !== 'object') {
            console.warn('Env object is not provided');
            return;
        }

        // No macros are registered
        if (this.#macros.size === 0) {
            return;
        }

        for (const [key, value] of this.#macros) {
            env[key] = value;
        }
    }

    /**
     * Performs a type-check on the macro value and returns a sanitized version of it.
     * @param {any} value Value returned by a macro
     * @returns {string} Sanitized value
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
    static sanitizeMacroValue(value) {
        if (typeof value === 'string') {
            return value;
        }

        if (value === null || value === undefined) {
            return '';
        }

        if (value instanceof Promise) {
            console.warn('Promises are not supported as macro values');
            return '';
        }

        if (typeof value === 'function') {
            console.warn('Functions are not supported as macro values');
            return '';
        }

        if (value instanceof Date) {
            return value.toISOString();
        }

        if (typeof value === 'object') {
            return JSON.stringify(value);
        }

        return String(value);
    }
}

/**
 * Gets a hashed id of the current chat from the metadata.
 * If no metadata exists, creates a new hash and saves it.
 * @returns {number} The hashed chat id
 */
function getChatIdHash() {
    const cachedIdHash = chat_metadata.chat_id_hash;

    // If chat_id_hash is not already set, calculate it
    if (!cachedIdHash) {
        // Use the main_chat if it's available, otherwise get the current chat ID
        const chatId = chat_metadata.main_chat ?? getCurrentChatId();
        const chatIdHash = getStringHash(chatId);
        chat_metadata.chat_id_hash = chatIdHash;
        return chatIdHash;
    }

    return cachedIdHash;
}

/**
 * Returns the ID of the last message in the chat
 *
 * Optionally can only choose specific messages, if a filter is provided.
 * @param {object} param0 - Optional arguments
 * @param {boolean} [param0.exclude_swipe_in_propress] - Whether a message that is currently being swiped should be ignored
 * @param {function(object):boolean} [param0.filter] - A filter applied to the search, ignoring all messages that don't match the criteria. For example to only find user messages, etc.
 * @returns {number|null} The message id, or null if none was found
 */
export function getLastMessageId({ exclude_swipe_in_propress = true, filter = null } = {}) {
    for (let i = chat?.length - 1; i >= 0; i--) {
        const message = chat[i];

        // If ignoring swipes and the message is being swiped, continue
        // We can check if a message is being swiped by checking whether the current swipe id is not in the list of finished swipes yet
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        if (exclude_swipe_in_propress && message.swipes && message.swipe_id >= message.swipes.length) {
            continue;
        }

        // Check if no filter is provided, or if the message passes the filter
        // @ts-expect-error TS(2349) FIXME: This expression is not callable.
        if (!filter || filter(message)) {
            return i;
        }
    }

    return null;
}

/**
 * Returns the ID of the first message included in the context
 * @returns {number|null} The ID of the first message in the context
 */
function getFirstIncludedMessageId() {
    return chat_metadata.lastInContextMessageId;
}

/**
 * Returns the ID of the first displayed message in the chat.
 * @returns {number|null} The ID of the first displayed message
 */
function getFirstDisplayedMessageId() {
    const mesId = Number(document.querySelector('#chat .mes')?.getAttribute('mesid'));

    if (!isNaN(mesId) && mesId >= 0) {
        return mesId;
    }

    return null;
}

/**
 * Returns the last message in the chat
 * @returns {string} The last message in the chat
 */
function getLastMessage() {
    const mid = getLastMessageId();
    // @ts-expect-error TS(2538) FIXME: Type 'null' cannot be used as an index type.
    return chat[mid]?.mes ?? '';
}

/**
 * Returns the last message from the user
 * @returns {string} The last message from the user
 */
function getLastUserMessage() {
    // @ts-expect-error TS(2322) FIXME: Type '(m: any) => any' is not assignable to type '... Remove this comment to see the full error message
    const mid = getLastMessageId({ filter: m => m.is_user && !m.is_system });
    // @ts-expect-error TS(2538) FIXME: Type 'null' cannot be used as an index type.
    return chat[mid]?.mes ?? '';
}

/**
 * Returns the last message from the bot
 * @returns {string} The last message from the bot
 */
function getLastCharMessage() {
    // @ts-expect-error TS(2322) FIXME: Type '(m: any) => boolean' is not assignable to ty... Remove this comment to see the full error message
    const mid = getLastMessageId({ filter: m => !m.is_user && !m.is_system });
    // @ts-expect-error TS(2538) FIXME: Type 'null' cannot be used as an index type.
    return chat[mid]?.mes ?? '';
}

/**
 * Returns the 1-based ID (number) of the last swipe
 * @returns {number|null} The 1-based ID of the last swipe
 */
function getLastSwipeId() {
    // For swipe macro, we are accepting using the message that is currently being swiped
    const mid = getLastMessageId({ exclude_swipe_in_propress: false });
    // @ts-expect-error TS(2538) FIXME: Type 'null' cannot be used as an index type.
    const swipes = chat[mid]?.swipes;
    return swipes?.length;
}

/**
 * Returns the 1-based ID (number) of the current swipe
 * @returns {number|null} The 1-based ID of the current swipe
 */
function getCurrentSwipeId() {
    // For swipe macro, we are accepting using the message that is currently being swiped
    const mid = getLastMessageId({ exclude_swipe_in_propress: false });
    // @ts-expect-error TS(2538) FIXME: Type 'null' cannot be used as an index type.
    const swipeId = chat[mid]?.swipe_id;
    return swipeId !== null ? swipeId + 1 : null;
}

/**
 * Replaces banned words in macros with an empty string.
 * Adds them to textgenerationwebui ban list.
 * @returns {Macro}
 */
function getBannedWordsMacro() {
    const banPattern = /{{banned "(.*)"}}/gi;
    // @ts-expect-error TS(7006) FIXME: Parameter 'match' implicitly has an 'any' type.
    const banReplace = (match, bannedWord) => {
        if (main_api == 'textgenerationwebui') {
            console.log('Found banned word in macros: ' + bannedWord);
            // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
            textgenerationwebui_banned_in_macros.push(bannedWord);
        }
        return '';
    };

    return { regex: banPattern, replace: banReplace };
}

/**
 *
 */
function getTimeSinceLastMessage() {
    const now = moment();

    if (Array.isArray(chat) && chat.length > 0) {
        let lastMessage;
        let takeNext = false;

        for (let i = chat.length - 1; i >= 0; i--) {
            const message = chat[i];

            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            if (message.is_system) {
                continue;
            }

            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            if (message.is_user && takeNext) {
                lastMessage = message;
                break;
            }

            takeNext = true;
        }

        // @ts-expect-error TS(2339) FIXME: Property 'send_date' does not exist on type 'never... Remove this comment to see the full error message
        if (lastMessage?.send_date) {
            // @ts-expect-error TS(2339) FIXME: Property 'send_date' does not exist on type 'never... Remove this comment to see the full error message
            const lastMessageDate = timestampToMoment(lastMessage.send_date);
            const duration = moment.duration(now.diff(lastMessageDate));
            return duration.humanize();
        }
    }

    return 'just now';
}

/**
 * Returns a macro that picks a random item from a list.
 * @returns {Macro} The random replace macro
 */
function getRandomReplaceMacro() {
    const randomPattern = /{{random\s?::?([^}]+)}}/gi;
    // @ts-expect-error TS(7006) FIXME: Parameter 'match' implicitly has an 'any' type.
    const randomReplace = (match, listString) => {
        // Split on either double colons or comma. If comma is the separator, we are also trimming all items.
        const list = listString.includes('::')
            ? listString.split('::')
            // Replaced escaped commas with a placeholder to avoid splitting on them
            // @ts-expect-error TS(7006) FIXME: Parameter 'item' implicitly has an 'any' type.
            : listString.replace(/\\,/g, '##�COMMA�##').split(',').map(item => item.trim().replace(/##�COMMA�##/g, ','));

        if (list.length === 0) {
            return '';
        }
        const rng = seedrandom('added entropy.', { entropy: true });
        const randomIndex = Math.floor(rng() * list.length);
        return list[randomIndex];
    };

    return { regex: randomPattern, replace: randomReplace };
}

/**
 * Returns a macro that picks a random item from a list with a consistent seed.
 * @param {string} rawContent The raw content of the string
 * @returns {Macro} The pick replace macro
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'rawContent' implicitly has an 'any' typ... Remove this comment to see the full error message
function getPickReplaceMacro(rawContent) {
    // We need to have a consistent chat hash, otherwise we'll lose rolls on chat file rename or branch switches
    // No need to save metadata here - branching and renaming will implicitly do the save for us, and until then loading it like this is consistent
    const chatIdHash = getChatIdHash();
    const rawContentHash = getStringHash(rawContent);

    const pickPattern = /{{pick\s?::?([^}]+)}}/gi;
    // @ts-expect-error TS(7006) FIXME: Parameter 'match' implicitly has an 'any' type.
    const pickReplace = (match, listString, offset) => {
        // Split on either double colons or comma. If comma is the separator, we are also trimming all items.
        const list = listString.includes('::')
            ? listString.split('::')
            // Replaced escaped commas with a placeholder to avoid splitting on them
            // @ts-expect-error TS(7006) FIXME: Parameter 'item' implicitly has an 'any' type.
            : listString.replace(/\\,/g, '##�COMMA�##').split(',').map(item => item.trim().replace(/##�COMMA�##/g, ','));

        if (list.length === 0) {
            return '';
        }

        // We build a hash seed based on: unique chat file, raw content, and the placement inside this content
        // This allows us to get unique but repeatable picks in nearly all cases
        const combinedSeedString = `${chatIdHash}-${rawContentHash}-${offset}`;
        const finalSeed = getStringHash(combinedSeedString);
        const rng = seedrandom(finalSeed);
        const randomIndex = Math.floor(rng() * list.length);
        return list[randomIndex];
    };

    return { regex: pickPattern, replace: pickReplace };
}

/**
 * @returns {Macro} The dire roll macro
 */
function getDiceRollMacro() {
    const rollPattern = /{{roll[ : ]([^}]+)}}/gi;
    // @ts-expect-error TS(7006) FIXME: Parameter 'match' implicitly has an 'any' type.
    const rollReplace = (match, matchValue) => {
        let formula = matchValue.trim();

        if (isDigitsOnly(formula)) {
            formula = `1d${formula}`;
        }

        const isValid = droll.validate(formula);

        if (!isValid) {
            console.debug(`Invalid roll formula: ${formula}`);
            return '';
        }

        const result = droll.roll(formula);
        if (result === false) return '';
        return String(result.total);
    };

    return { regex: rollPattern, replace: rollReplace };
}

/**
 * Returns the difference between two times. Works with any time format acceptable by moment().
 * Can work with {{date}} {{time}} macros
 * @returns {Macro} The time difference macro
 */
function getTimeDiffMacro() {
    const timeDiffPattern = /{{timeDiff::(.*?)::(.*?)}}/gi;
    // @ts-expect-error TS(7006) FIXME: Parameter '_match' implicitly has an 'any' type.
    const timeDiffReplace = (_match, matchPart1, matchPart2) => {
        const time1 = moment(matchPart1);
        const time2 = moment(matchPart2);

        const timeDifference = moment.duration(time1.diff(time2));
        return timeDifference.humanize(true);
    };

    return { regex: timeDiffPattern, replace: timeDiffReplace };
}

/**
 * Returns the outlet prompt for a given outlet key.
 * @param {string} key - The outlet key
 * @returns {string} The outlet prompt
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'key' implicitly has an 'any' type.
function getOutletPrompt(key) {
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    const value = extension_prompts[inject_ids.CUSTOM_WI_OUTLET(key)]?.value;
    return value || '';
}

/**
 * Substitutes {{macro}} parameters in a string.
 * @param {string} content - The string to substitute parameters in.
 * @param {EnvObject} env - Map of macro names to the values they'll be substituted with. If the param
 * values are functions, those functions will be called and their return values are used.
 * @param {function(string): string} postProcessFn - Function to run on the macro value before replacing it.
 * @returns {string} The string with substituted parameters.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'content' implicitly has an 'any' type.
export function evaluateMacros(content, env, postProcessFn) {
    if (!content) {
        return '';
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
    postProcessFn = typeof postProcessFn === 'function' ? postProcessFn : (x => x);
    const rawContent = content;

    /**
     * Built-ins running before the env variables
     * @type {Macro[]}
     */
    const preEnvMacros = [
        // Legacy non-curly macros
        { regex: /<USER>/gi, replace: () => typeof env.user === 'function' ? env.user() : env.user },
        { regex: /<BOT>/gi, replace: () => typeof env.char === 'function' ? env.char() : env.char },
        { regex: /<CHAR>/gi, replace: () => typeof env.char === 'function' ? env.char() : env.char },
        { regex: /<CHARIFNOTGROUP>/gi, replace: () => typeof env.group === 'function' ? env.group() : env.group },
        { regex: /<GROUP>/gi, replace: () => typeof env.group === 'function' ? env.group() : env.group },
        getDiceRollMacro(),
        ...getInstructMacros(env),
        ...getVariableMacros(),
        { regex: /{{newline}}/gi, replace: () => '\n' },
        { regex: /(?:\r?\n)*{{trim}}(?:\r?\n)*/gi, replace: () => '' },
        { regex: /{{noop}}/gi, replace: () => '' },
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        { regex: /{{input}}/gi, replace: () => String($('#send_textarea').val()) },
    ];

    /**
     * Built-ins running after the env variables
     * @type {Macro[]}
     */
    const postEnvMacros = [
        { regex: /{{maxPrompt}}/gi, replace: () => String(getMaxPromptTokens()) },
        { regex: /{{maxPromptTokens}}/gi, replace: () => String(getMaxPromptTokens()) },
        { regex: /{{maxContext}}/gi, replace: () => String(getMaxContextTokens()) },
        { regex: /{{maxContextTokens}}/gi, replace: () => String(getMaxContextTokens()) },
        { regex: /{{maxResponse}}/gi, replace: () => String(getMaxResponseTokens()) },
        { regex: /{{maxResponseTokens}}/gi, replace: () => String(getMaxResponseTokens()) },
        { regex: /{{lastMessage}}/gi, replace: () => getLastMessage() },
        { regex: /{{lastMessageId}}/gi, replace: () => String(getLastMessageId() ?? '') },
        { regex: /{{lastUserMessage}}/gi, replace: () => getLastUserMessage() },
        { regex: /{{lastCharMessage}}/gi, replace: () => getLastCharMessage() },
        { regex: /{{firstIncludedMessageId}}/gi, replace: () => String(getFirstIncludedMessageId() ?? '') },
        { regex: /{{firstDisplayedMessageId}}/gi, replace: () => String(getFirstDisplayedMessageId() ?? '') },
        { regex: /{{lastSwipeId}}/gi, replace: () => String(getLastSwipeId() ?? '') },
        { regex: /{{currentSwipeId}}/gi, replace: () => String(getCurrentSwipeId() ?? '') },
        { regex: /{{allChatRange}}/gi, replace: () => chat.length === 0 ? '' : `0-${chat.length - 1}` },
        // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
        { regex: /{{reverse:(.+?)}}/gi, replace: (_, str) => Array.from(str).reverse().join('') },
        { regex: /\{\{\/\/([\s\S]*?)\}\}/gm, replace: () => '' },
        { regex: /{{time}}/gi, replace: () => moment().format('LT') },
        { regex: /{{date}}/gi, replace: () => moment().format('LL') },
        { regex: /{{weekday}}/gi, replace: () => moment().format('dddd') },
        { regex: /{{isotime}}/gi, replace: () => moment().format('HH:mm') },
        { regex: /{{isodate}}/gi, replace: () => moment().format('YYYY-MM-DD') },
        // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
        { regex: /{{datetimeformat +([^}]*)}}/gi, replace: (_, format) => moment().format(format) },
        { regex: /{{idle_duration}}/gi, replace: () => getTimeSinceLastMessage() },
        // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
        { regex: /{{time_UTC([-+]\d+)}}/gi, replace: (_, offset) => moment().utc().utcOffset(parseInt(offset, 10)).format('LT') },
        // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
        { regex: /{{outlet::(.+?)}}/gi, replace: (_, key) => getOutletPrompt(key.trim()) || '' },
        getTimeDiffMacro(),
        getBannedWordsMacro(),
        getRandomReplaceMacro(),
        getPickReplaceMacro(rawContent),
    ];

    // Add all registered macros to the env object
    MacrosParser.populateEnv(env);
    const nonce = uuidv4();
    const envMacros = [];

    // Substitute passed-in variables
    for (const varName in env) {
        if (!Object.hasOwn(env, varName)) continue;

        const envRegex = new RegExp(`{{${escapeRegex(varName)}}}`, 'gi');
        const envReplace = () => {
            const param = env[varName];
            const value = MacrosParser.sanitizeMacroValue(typeof param === 'function' ? param(nonce) : param);
            return value;
        };

        envMacros.push({ regex: envRegex, replace: envReplace });
    }

    const macros = [...preEnvMacros, ...envMacros, ...postEnvMacros];

    for (const macro of macros) {
        // Stop if the content is empty
        if (!content) {
            break;
        }

        // Short-circuit if no curly braces are found
        if (!macro.regex.source.startsWith('<') && !content.includes('{{')) {
            break;
        }

        try {
            // @ts-expect-error TS(7019) FIXME: Rest parameter 'args' implicitly has an 'any[]' ty... Remove this comment to see the full error message
            content = content.replace(macro.regex, (...args) => postProcessFn(macro.replace(...args)));
        } catch (e) {
            console.warn(`Macro content can't be replaced: ${macro.regex} in ${content}`, e);
        }
    }

    return content;
}

/**
 *
 */
export function initMacros() {
    // Only manually register those is new macro engine is not on. In the new one, they are already registered automatically
    if (!power_user.experimental_macro_engine) {
        /**
         *
         */
        function initLastGenerationType() {
            let lastGenerationType = '';

            MacrosParser.registerMacro('lastGenerationType',
                () => lastGenerationType,
                'Returns the type of the last generation (e.g., "normal", "swipe", "continue", "impersonate", "quiet").',
            );

            // @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
            eventSource.on(event_types.GENERATION_STARTED, (type, _params, isDryRun) => {
                if (isDryRun) return;
                lastGenerationType = type || 'normal';
            });

            eventSource.on(event_types.CHAT_CHANGED, () => {
                lastGenerationType = '';
            });
        }

        MacrosParser.registerMacro('isMobile',
            () => String(isMobile()),
            'Returns "true" if the user is on a mobile device, "false" otherwise.',
        );
        initLastGenerationType();
    }

    // TODO: Needs to be moved once old macros are deprecated and removed
    initRegisterMacros();
}
