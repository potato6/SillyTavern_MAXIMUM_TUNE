import { chat_metadata, getCurrentChatId, saveSettingsDebounced } from '../script.js';
import { extension_settings, saveMetadataDebounced } from './extensions.js';
import { executeSlashCommandsWithOptions } from './slash-commands.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import { SlashCommandAbortController } from './slash-commands/SlashCommandAbortController.js';
import {
    ARGUMENT_TYPE,
    SlashCommandArgument,
    SlashCommandNamedArgument,
} from './slash-commands/SlashCommandArgument.js';
import { SlashCommandBreakController } from './slash-commands/SlashCommandBreakController.js';
import { SlashCommandClosure } from './slash-commands/SlashCommandClosure.js';
import {
    commonEnumProviders,
    enumIcons,
} from './slash-commands/SlashCommandCommonEnumsProvider.js';
import { SlashCommandEnumValue, enumTypes } from './slash-commands/SlashCommandEnumValue.js';
import { SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import { slashCommandReturnHelper } from './slash-commands/SlashCommandReturnHelper.js';
import { isFalseBoolean, convertValueType, isTrueBoolean } from './utils.js';

/** @typedef {import('./slash-commands/SlashCommandParser.js').NamedArguments} NamedArguments */
/** @typedef {import('./slash-commands/SlashCommand.js').UnnamedArguments} UnnamedArguments */

const MAX_LOOPS = 100;

/**
 *
 * @param name
 * @param args
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export function getLocalVariable(name, args = {}) {
    if (!chat_metadata.variables) {
        chat_metadata.variables = {};
    }

    // @ts-expect-error TS(2339) FIXME: Property 'variables' does not exist on type '{}'.
    let localVariable = chat_metadata?.variables[args.key ?? name];
    // @ts-expect-error TS(2339) FIXME: Property 'index' does not exist on type '{}'.
    if (args.index !== undefined) {
        try {
            localVariable = JSON.parse(localVariable);
            // @ts-expect-error TS(2339) FIXME: Property 'index' does not exist on type '{}'.
            const numIndex = Number(args.index);
            if (Number.isNaN(numIndex)) {
                // @ts-expect-error TS(2339) FIXME: Property 'index' does not exist on type '{}'.
                localVariable = localVariable[args.index];
            } else {
                // @ts-expect-error TS(2339) FIXME: Property 'index' does not exist on type '{}'.
                localVariable = localVariable[Number(args.index)];
            }
            if (typeof localVariable === 'object') {
                localVariable = JSON.stringify(localVariable);
            }
        } catch {
            // that didn't work
        }
    }

    return localVariable?.trim?.() === '' || isNaN(Number(localVariable))
        ? localVariable || ''
        : Number(localVariable);
}

/**
 *
 * @param name
 * @param value
 * @param args
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export function setLocalVariable(name, value, args = {}) {
    if (!name) {
        throw new Error('Variable name cannot be empty or undefined.');
    }

    if (!chat_metadata.variables) {
        chat_metadata.variables = {};
    }

    // @ts-expect-error TS(2339) FIXME: Property 'index' does not exist on type '{}'.
    if (args.index !== undefined) {
        try {
            let localVariable = JSON.parse(chat_metadata.variables[name] ?? 'null');
            // @ts-expect-error TS(2339) FIXME: Property 'index' does not exist on type '{}'.
            const numIndex = Number(args.index);
            if (Number.isNaN(numIndex)) {
                if (localVariable === null) {
                    localVariable = {};
                }
                // @ts-expect-error TS(2339) FIXME: Property 'index' does not exist on type '{}'.
                localVariable[args.index] = convertValueType(value, args.as);
            } else {
                if (localVariable === null) {
                    localVariable = [];
                }
                // @ts-expect-error TS(2339) FIXME: Property 'as' does not exist on type '{}'.
                localVariable[numIndex] = convertValueType(value, args.as);
            }
            chat_metadata.variables[name] = JSON.stringify(localVariable);
        } catch {
            // that didn't work
        }
    } else {
        chat_metadata.variables[name] = value;
    }
    saveMetadataDebounced();
    return value;
}

/**
 *
 * @param name
 * @param args
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export function getGlobalVariable(name, args = {}) {
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    let globalVariable = extension_settings.variables.global[args.key ?? name];
    // @ts-expect-error TS(2339) FIXME: Property 'index' does not exist on type '{}'.
    if (args.index !== undefined) {
        try {
            globalVariable = JSON.parse(globalVariable);
            // @ts-expect-error TS(2339) FIXME: Property 'index' does not exist on type '{}'.
            const numIndex = Number(args.index);
            if (Number.isNaN(numIndex)) {
                // @ts-expect-error TS(2339) FIXME: Property 'index' does not exist on type '{}'.
                globalVariable = globalVariable[args.index];
            } else {
                // @ts-expect-error TS(2339) FIXME: Property 'index' does not exist on type '{}'.
                globalVariable = globalVariable[Number(args.index)];
            }
            if (typeof globalVariable === 'object') {
                globalVariable = JSON.stringify(globalVariable);
            }
        } catch {
            // that didn't work
        }
    }

    return globalVariable?.trim?.() === '' || isNaN(Number(globalVariable))
        ? globalVariable || ''
        : Number(globalVariable);
}

/**
 *
 * @param name
 * @param value
 * @param args
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export function setGlobalVariable(name, value, args = {}) {
    if (!name) {
        throw new Error('Variable name cannot be empty or undefined.');
    }

    // @ts-expect-error TS(2339) FIXME: Property 'index' does not exist on type '{}'.
    if (args.index !== undefined) {
        try {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            let globalVariable = JSON.parse(extension_settings.variables.global[name] ?? 'null');
            // @ts-expect-error TS(2339) FIXME: Property 'index' does not exist on type '{}'.
            const numIndex = Number(args.index);
            if (Number.isNaN(numIndex)) {
                if (globalVariable === null) {
                    globalVariable = {};
                }
                // @ts-expect-error TS(2339) FIXME: Property 'index' does not exist on type '{}'.
                globalVariable[args.index] = convertValueType(value, args.as);
            } else {
                if (globalVariable === null) {
                    globalVariable = [];
                }
                // @ts-expect-error TS(2339) FIXME: Property 'as' does not exist on type '{}'.
                globalVariable[numIndex] = convertValueType(value, args.as);
            }
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            extension_settings.variables.global[name] = JSON.stringify(globalVariable);
        } catch {
            // that didn't work
        }
    } else {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        extension_settings.variables.global[name] = value;
    }
    saveSettingsDebounced();
    return value;
}

/**
 *
 * @param name
 * @param value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export function addLocalVariable(name, value) {
    const currentValue = getLocalVariable(name) || 0;
    try {
        const parsedValue = JSON.parse(currentValue);
        if (Array.isArray(parsedValue)) {
            parsedValue.push(value);
            setLocalVariable(name, JSON.stringify(parsedValue));
            return parsedValue;
        }
    } catch {
        // ignore non-array values
    }
    const increment = Number(value);

    if (isNaN(increment) || isNaN(Number(currentValue))) {
        const stringValue = String(currentValue || '') + value;
        setLocalVariable(name, stringValue);
        return stringValue;
    }

    const newValue = Number(currentValue) + increment;

    if (isNaN(newValue)) {
        return '';
    }

    setLocalVariable(name, newValue);
    return newValue;
}

/**
 *
 * @param name
 * @param value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export function addGlobalVariable(name, value) {
    const currentValue = getGlobalVariable(name) || 0;
    try {
        const parsedValue = JSON.parse(currentValue);
        if (Array.isArray(parsedValue)) {
            parsedValue.push(value);
            setGlobalVariable(name, JSON.stringify(parsedValue));
            return parsedValue;
        }
    } catch {
        // ignore non-array values
    }
    const increment = Number(value);

    if (isNaN(increment) || isNaN(Number(currentValue))) {
        const stringValue = String(currentValue || '') + value;
        setGlobalVariable(name, stringValue);
        return stringValue;
    }

    const newValue = Number(currentValue) + increment;

    if (isNaN(newValue)) {
        return '';
    }

    setGlobalVariable(name, newValue);
    return newValue;
}

/**
 *
 * @param name
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export function incrementLocalVariable(name) {
    return addLocalVariable(name, 1);
}

/**
 *
 * @param name
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export function incrementGlobalVariable(name) {
    return addGlobalVariable(name, 1);
}

/**
 *
 * @param name
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export function decrementLocalVariable(name) {
    return addLocalVariable(name, -1);
}

/**
 *
 * @param name
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export function decrementGlobalVariable(name) {
    return addGlobalVariable(name, -1);
}

/**
 * Resolves a variable name to its value or returns the string as is if the variable does not exist.
 * @param {string} name Variable name
 * @param {SlashCommandScope} scope Scope
 * @returns {string} Variable value or the string literal
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export function resolveVariable(name, scope = null) {
    // @ts-expect-error TS(2339) FIXME: Property 'existsVariable' does not exist on type '... Remove this comment to see the full error message
    if (scope?.existsVariable(name)) {
        // @ts-expect-error TS(2339) FIXME: Property 'getVariable' does not exist on type 'nev... Remove this comment to see the full error message
        return scope.getVariable(name);
    }

    if (existsLocalVariable(name)) {
        return getLocalVariable(name);
    }

    if (existsGlobalVariable(name)) {
        return getGlobalVariable(name);
    }

    return name;
}

/**
 *
 * @param args
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
async function listVariablesCallback(args) {
    /** @type {import('./slash-commands/SlashCommandReturnHelper.js').SlashCommandReturnType} */
    const returnType = args.return;

    // Now the actual new return type handling
    const scope =
        String(args?.scope || '')
            .toLowerCase()
            .trim() || 'all';
    if (!chat_metadata.variables) {
        chat_metadata.variables = {};
    }

    const includeLocalVariables = scope === 'all' || scope === 'local';
    const includeGlobalVariables = scope === 'all' || scope === 'global';

    const localVariables = includeLocalVariables
        ? Object.entries(chat_metadata.variables).map(([name, value]) => `${name}: ${value}`)
        : [];
    const globalVariables = includeGlobalVariables
        ? Object.entries(
              (extension_settings.variables as { global: Record<string, string> }).global,
          ).map(([name, value]) => `${name}: ${value}`)
        : [];

    // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
    const buildTextValue = (_) => {
        const localVariablesString =
            localVariables.length > 0 ? localVariables.join('\n\n') : 'No local variables';
        const globalVariablesString =
            globalVariables.length > 0 ? globalVariables.join('\n\n') : 'No global variables';
        const chatName = getCurrentChatId();

        const message = [
            includeLocalVariables
                ? `### Local variables (${chatName}):\n${localVariablesString}`
                : '',
            includeGlobalVariables ? `### Global variables:\n${globalVariablesString}` : '',
        ]
            .filter((x) => x)
            .join('\n\n');
        return message;
    };

    const jsonVariables = [
        ...Object.entries(chat_metadata.variables).map((x) => ({
            key: x[0],
            value: x[1],
            scope: 'local',
        })),
        ...Object.entries(
            (extension_settings.variables as { global: Record<string, string> }).global,
        ).map((x) => ({ key: x[0], value: x[1], scope: 'global' })),
    ];

    return await slashCommandReturnHelper.doReturn(returnType ?? 'popup-html', jsonVariables, {
        objectToStringFunc: buildTextValue,
    });
}

/**
 *
 * @param {NamedArguments} args
 * @param {(string|SlashCommandClosure)[]} value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
async function whileCallback(args, value) {
    if (args.guard instanceof SlashCommandClosure)
        throw new Error("argument 'guard' cannot be a closure for command /while");
    const isGuardOff = isFalseBoolean(args.guard?.toString());
    const iterations = isGuardOff ? Number.MAX_SAFE_INTEGER : MAX_LOOPS;
    /**@type {string|SlashCommandClosure} */
    let command;
    if (value) {
        if (value[0] instanceof SlashCommandClosure) {
            command = value[0];
        } else {
            command = value.join(' ');
        }
    }

    let commandResult;
    for (let i = 0; i < iterations; i++) {
        const { a, b, rule } = parseBooleanOperands(args);
        const result = evalBoolean(rule, a, b);

        if (result && command) {
            if (command instanceof SlashCommandClosure) {
                command.breakController = new SlashCommandBreakController();
                commandResult = await command.execute();
            } else {
                commandResult = await executeSubCommands(
                    command,
                    args._scope,
                    args._parserFlags,
                    args._abortController,
                );
            }
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            if (commandResult.isAborted) break;
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            if (commandResult.isBreak) break;
        } else {
            break;
        }
    }

    if (commandResult) {
        return commandResult.pipe;
    }

    return '';
}

/**
 *
 * @param {NamedArguments} args
 * @param {UnnamedArguments} value
 * @returns
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
async function timesCallback(args, value) {
    if (args.guard instanceof SlashCommandClosure)
        throw new Error("argument 'guard' cannot be a closure for command /while");
    let repeats;
    let command;
    if (Array.isArray(value)) {
        [repeats, ...command] = value;
        if (command[0] instanceof SlashCommandClosure) {
            command = command[0];
        } else {
            command = command.join(' ');
        }
    } else {
        [repeats, ...command] = /**@type {string}*/ (value).split(' ');
        command = command.join(' ');
    }
    const isGuardOff = isFalseBoolean(args.guard?.toString());
    const iterations = Math.min(Number(repeats), isGuardOff ? Number.MAX_SAFE_INTEGER : MAX_LOOPS);
    let result;
    for (let i = 0; i < iterations; i++) {
        if (command instanceof SlashCommandClosure) {
            command.breakController = new SlashCommandBreakController();
            command.scope.setMacro('timesIndex', i);
            result = await command.execute();
        } else {
            result = await executeSubCommands(
                command.replace(/\{\{timesIndex\}\}/g, i.toString()),
                args._scope,
                args._parserFlags,
                args._abortController,
            );
        }
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (result.isAborted) break;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (result.isBreak) break;
    }

    return result?.pipe ?? '';
}

/**
 *
 * @param {NamedArguments} args
 * @param {(string|SlashCommandClosure)[]} value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
async function ifCallback(args, value) {
    const { a, b, rule } = parseBooleanOperands(args);
    const result = evalBoolean(rule, a, b);

    /** @type {string|SlashCommandClosure} */
    let command;
    if (value) {
        if (value[0] instanceof SlashCommandClosure) {
            command = value[0];
        } else {
            command = value.join(' ');
        }
    }

    let commandResult;
    if (result && command) {
        if (command instanceof SlashCommandClosure) return (await command.execute()).pipe;
        commandResult = await executeSubCommands(
            command,
            args._scope,
            args._parserFlags,
            args._abortController,
        );
    } else if (
        !result &&
        args.else &&
        ((typeof args.else === 'string' && args.else !== '') ||
            args.else instanceof SlashCommandClosure)
    ) {
        if (args.else instanceof SlashCommandClosure) return (await args.else.execute()).pipe;
        commandResult = await executeSubCommands(
            args.else,
            args._scope,
            args._parserFlags,
            args._abortController,
        );
    }

    if (commandResult) {
        return commandResult.pipe;
    }
    return '';
}

/**
 * Checks if a local variable exists.
 * @param {string} name Local variable name
 * @returns {boolean} True if the local variable exists, false otherwise
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export function existsLocalVariable(name) {
    return chat_metadata.variables && chat_metadata.variables[name] !== undefined;
}

/**
 * Checks if a global variable exists.
 * @param {string} name Global variable name
 * @returns {boolean} True if the global variable exists, false otherwise
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export function existsGlobalVariable(name) {
    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    return (
        extension_settings.variables.global &&
        extension_settings.variables.global[name] !== undefined
    );
}

/**
 * Parses boolean operands from command arguments.
 * @param {object} args Command arguments
 * @returns {{a: string | number, b: string | number?, rule: string}} Boolean operands
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
export function parseBooleanOperands(args) {
    // Resolution order: numeric literal, local variable, global variable, string literal
    /**
     * @param {string} operand Boolean operand candidate
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'operand' implicitly has an 'any' type.
    function getOperand(operand) {
        if (operand === undefined) {
            return undefined;
        }
        if (operand === '') {
            return '';
        }

        // Number parses spaces as 0, and parseFloat is weird
        const operandNumber =
            typeof operand === 'string' && operand.trim().length ? Number(operand) : NaN;

        if (!isNaN(operandNumber)) {
            return operandNumber;
        }

        if (args._scope.existsVariable(operand)) {
            const operandVariable = args._scope.getVariable(operand);
            return operandVariable ?? '';
        }

        if (existsLocalVariable(operand)) {
            const operandLocalVariable = getLocalVariable(operand);
            return operandLocalVariable ?? '';
        }

        if (existsGlobalVariable(operand)) {
            const operandGlobalVariable = getGlobalVariable(operand);
            return operandGlobalVariable ?? '';
        }

        const stringLiteral = String(operand);
        return stringLiteral || '';
    }

    const left = getOperand(args.a ?? args.left ?? args.first ?? args.x);
    const right = getOperand(args.b ?? args.right ?? args.second ?? args.y);
    const rule = args.rule;

    return { a: left, b: right, rule };
}

/**
 * Evaluates a boolean comparison rule.
 * @param {string?} rule Boolean comparison rule
 * @param {string|number} a The left operand
 * @param {string|number?} b The right operand
 * @returns {boolean} True if the rule yields true, false otherwise
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'rule' implicitly has an 'any' type.
export function evalBoolean(rule, a, b) {
    if (a === undefined) {
        throw new Error('Left operand is not provided');
    }

    // If right-hand side was not provided, whe just check if the left side is truthy
    if (b === undefined) {
        switch (rule) {
            case undefined:
            case 'not': {
                const resultOnTruthy = rule !== 'not';
                if (isTrueBoolean(String(a))) return resultOnTruthy;
                if (isFalseBoolean(String(a))) return !resultOnTruthy;
                return a ? resultOnTruthy : !resultOnTruthy;
            }
            default:
                throw new Error(
                    `Unknown boolean comparison rule for truthy check. If right operand is not provided, the rule must not provided or be 'not'. Provided: ${rule}`,
                );
        }
    }

    // If no rule was provided, we are implicitly using 'eq', as defined for the slash commands
    rule ??= 'eq';

    if (typeof a === 'number' && typeof b === 'number') {
        // only do numeric comparison if both operands are numbers
        const aNumber = Number(a);
        const bNumber = Number(b);

        switch (rule) {
            case 'gt':
                return aNumber > bNumber;
            case 'gte':
                return aNumber >= bNumber;
            case 'lt':
                return aNumber < bNumber;
            case 'lte':
                return aNumber <= bNumber;
            case 'eq':
                return aNumber === bNumber;
            case 'neq':
                return aNumber !== bNumber;
            case 'in':
            case 'nin':
                // Fall through to string comparison. Otherwise you could not check if 12345 contains 45 for example.
                console.debug(
                    `Boolean comparison rule '${rule}' is not supported for type number. Falling back to string comparison.`,
                );
                break;
            default:
                throw new Error(
                    `Unknown boolean comparison rule for type number. Accepted: gt, gte, lt, lte, eq, neq. Provided: ${rule}`,
                );
        }
    }

    // otherwise do case-insensitive string comparsion, stringify non-strings
    const aString = typeof a === 'string' ? a.toLowerCase() : JSON.stringify(a).toLowerCase();
    const bString = typeof b === 'string' ? b.toLowerCase() : JSON.stringify(b).toLowerCase();

    switch (rule) {
        case 'in':
            return aString.includes(bString);
        case 'nin':
            return !aString.includes(bString);
        case 'eq':
            return aString === bString;
        case 'neq':
            return aString !== bString;
        default:
            throw new Error(
                `Unknown boolean comparison rule for type string. Accepted: in, nin, eq, neq. Provided: ${rule}`,
            );
    }
}

/**
 * Executes a slash command from a string (may be enclosed in quotes) and returns the result.
 * @param {string} command Command to execute. May contain escaped macro and batch separators.
 * @param {SlashCommandScope} [scope] The scope to use.
 * @param {import('./slash-commands/SlashCommandParser.js').ParserFlags} [parserFlags] The parser flags to use.
 * @param {SlashCommandAbortController} [abortController] The abort controller to use.
 * @returns {Promise<SlashCommandClosureResult>} Closure execution result
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'command' implicitly has an 'any' type.
async function executeSubCommands(
    command,
    scope = null,
    parserFlags = null,
    abortController = null,
) {
    if (command.startsWith('"') && command.endsWith('"')) {
        command = command.slice(1, -1);
    }

    const result = await executeSlashCommandsWithOptions(command, {
        handleExecutionErrors: false,
        handleParserErrors: false,
        parserFlags,
        scope,
        abortController: abortController ?? new SlashCommandAbortController(),
    });

    return result;
}

/**
 * Deletes a local variable.
 * @param {string} name Variable name to delete
 * @returns {string} Empty string
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export function deleteLocalVariable(name) {
    if (!existsLocalVariable(name)) {
        console.warn(`The local variable "${name}" does not exist.`);
        return '';
    }

    delete chat_metadata.variables[name];
    saveMetadataDebounced();
    return '';
}

/**
 * Deletes a global variable.
 * @param {string} name Variable name to delete
 * @returns {string} Empty string
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export function deleteGlobalVariable(name) {
    if (!existsGlobalVariable(name)) {
        console.warn(`The global variable "${name}" does not exist.`);
        return '';
    }

    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    delete extension_settings.variables.global[name];
    saveSettingsDebounced();
    return '';
}

/**
 * Parses a series of numeric values from a string or a string array.
 * @param {string|string[]} value A space-separated list of numeric values or variable names
 * @param {SlashCommandScope} scope Scope
 * @returns {number[]} An array of numeric values
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
function parseNumericSeries(value, scope = null) {
    if (typeof value === 'number') {
        return [value];
    }

    /** @type {(string|number)[]} */
    let values = Array.isArray(value) ? value : value.split(' ');

    // If an array of strings was provided as the only value, convert it to an array
    if (values.length === 1 && typeof values[0] === 'string') {
        if (values[0].startsWith('[')) {
            // JSON-style array
            values = convertValueType(values[0], 'array');
        } else {
            // Space-separated string
            values = values[0].split(' ');
        }
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'i' implicitly has an 'any' type.
    const array = values
        .map((i) => (typeof i === 'string' ? i.trim() : i))
        // @ts-expect-error TS(7006) FIXME: Parameter 'i' implicitly has an 'any' type.
        .filter((i) => i !== '')
        // @ts-expect-error TS(7006) FIXME: Parameter 'i' implicitly has an 'any' type.
        .map((i) => (isNaN(Number(i)) ? Number(resolveVariable(String(i), scope)) : Number(i)))
        // @ts-expect-error TS(7006) FIXME: Parameter 'i' implicitly has an 'any' type.
        .filter((i) => !isNaN(i));

    return array;
}

/**
 *
 * @param value
 * @param operation
 * @param singleOperand
 * @param scope
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
function performOperation(value, operation, singleOperand = false, scope = null) {
    /**
     *
     */
    function getResult() {
        if (!value) {
            return 0;
        }

        const array = parseNumericSeries(value, scope);

        if (array.length === 0) {
            return 0;
        }

        const result = singleOperand ? operation(array[0]) : operation(array);

        if (isNaN(result)) {
            return 0;
        }

        return result;
    }

    const result = getResult();
    return String(result);
}

/**
 *
 * @param args
 * @param value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
function addValuesCallback(args, value) {
    // @ts-expect-error TS(7006) FIXME: Parameter 'array' implicitly has an 'any' type.
    return performOperation(value, (array) => array.reduce((a, b) => a + b, 0), false, args._scope);
}

/**
 *
 * @param args
 * @param value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
function mulValuesCallback(args, value) {
    // @ts-expect-error TS(7006) FIXME: Parameter 'array' implicitly has an 'any' type.
    return performOperation(value, (array) => array.reduce((a, b) => a * b, 1), false, args._scope);
}

/**
 *
 * @param args
 * @param value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
function minValuesCallback(args, value) {
    // @ts-expect-error TS(7006) FIXME: Parameter 'array' implicitly has an 'any' type.
    return performOperation(value, (array) => Math.min(...array), false, args._scope);
}

/**
 *
 * @param args
 * @param value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
function maxValuesCallback(args, value) {
    // @ts-expect-error TS(7006) FIXME: Parameter 'array' implicitly has an 'any' type.
    return performOperation(value, (array) => Math.max(...array), false, args._scope);
}

/**
 *
 * @param args
 * @param value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
function subValuesCallback(args, value) {
    // @ts-expect-error TS(7006) FIXME: Parameter 'array' implicitly has an 'any' type.
    return performOperation(
        value,
        (array) => array.reduce((a, b) => a - b, array.shift() ?? 0),
        false,
        args._scope,
    );
}

/**
 *
 * @param args
 * @param value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
function divValuesCallback(args, value) {
    // @ts-expect-error TS(7006) FIXME: Parameter 'array' implicitly has an 'any' type.
    return performOperation(
        value,
        (array) => {
            if (array[1] === 0) {
                console.warn('Division by zero.');
                return 0;
            }
            return array[0] / array[1];
        },
        false,
        args._scope,
    );
}

/**
 *
 * @param args
 * @param value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
function modValuesCallback(args, value) {
    // @ts-expect-error TS(7006) FIXME: Parameter 'array' implicitly has an 'any' type.
    return performOperation(
        value,
        (array) => {
            if (array[1] === 0) {
                console.warn('Division by zero.');
                return 0;
            }
            return array[0] % array[1];
        },
        false,
        args._scope,
    );
}

/**
 *
 * @param args
 * @param value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
function powValuesCallback(args, value) {
    // @ts-expect-error TS(7006) FIXME: Parameter 'array' implicitly has an 'any' type.
    return performOperation(value, (array) => Math.pow(array[0], array[1]), false, args._scope);
}

/**
 *
 * @param args
 * @param value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
function sinValuesCallback(args, value) {
    return performOperation(value, Math.sin, true, args._scope);
}

/**
 *
 * @param args
 * @param value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
function cosValuesCallback(args, value) {
    return performOperation(value, Math.cos, true, args._scope);
}

/**
 *
 * @param args
 * @param value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
function logValuesCallback(args, value) {
    return performOperation(value, Math.log, true, args._scope);
}

/**
 *
 * @param args
 * @param value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
function roundValuesCallback(args, value) {
    return performOperation(value, Math.round, true, args._scope);
}

/**
 *
 * @param args
 * @param value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
function absValuesCallback(args, value) {
    return performOperation(value, Math.abs, true, args._scope);
}

/**
 *
 * @param args
 * @param value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
function sqrtValuesCallback(args, value) {
    return performOperation(value, Math.sqrt, true, args._scope);
}

/**
 *
 * @param value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
function lenValuesCallback(value) {
    let parsedValue = value;
    try {
        parsedValue = JSON.parse(value);
    } catch {
        // could not parse
    }
    if (Array.isArray(parsedValue)) {
        return parsedValue.length;
    }
    switch (typeof parsedValue) {
        case 'string':
            return parsedValue.length;
        case 'object':
            return Object.keys(parsedValue).length;
        case 'number':
            return String(parsedValue).length;
        default:
            return 0;
    }
}

/**
 *
 * @param from
 * @param to
 * @param args
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'from' implicitly has an 'any' type.
function randValuesCallback(from, to, args) {
    const range = to - from;
    const value = from + Math.random() * range;
    if (args.round == 'round') {
        return Math.round(value);
    }
    if (args.round == 'ceil') {
        return Math.ceil(value);
    }
    if (args.round == 'floor') {
        return Math.floor(value);
    }
    return value;
}

/**
 *
 * @param a
 * @param b
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
function customSortComparitor(a, b) {
    if (typeof a !== typeof b) {
        a = typeof a;
        b = typeof b;
    }
    return a > b ? 1 : a < b ? -1 : 0;
}

/**
 *
 * @param args
 * @param value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
function sortArrayObjectCallback(args, value) {
    // @ts-expect-error TS(7034) FIXME: Variable 'parsedValue' implicitly has type 'any' i... Remove this comment to see the full error message
    let parsedValue;
    if (typeof value === 'string') {
        try {
            parsedValue = JSON.parse(value);
        } catch {
            // return the original input if it was invalid
            return value;
        }
    } else {
        parsedValue = value;
    }
    if (Array.isArray(parsedValue)) {
        // always sort lists by value
        parsedValue.sort(customSortComparitor);
    } else if (typeof parsedValue === 'object') {
        const keysort = args.keysort;
        if (isFalseBoolean(keysort)) {
            // @ts-expect-error TS(7005) FIXME: Variable 'parsedValue' implicitly has an 'any' typ... Remove this comment to see the full error message
            parsedValue = Object.keys(parsedValue).toSorted(function (a, b) {
                return customSortComparitor(parsedValue[a], parsedValue[b]);
            });
        } else {
            parsedValue = Object.keys(parsedValue).toSorted(customSortComparitor);
        }
    }
    return JSON.stringify(parsedValue);
}

/**
 * Declare a new variable in the current scope.
 * @param {NamedArguments} args Named arguments.
 * @param {string|SlashCommandClosure|(string|SlashCommandClosure)[]} value Name and optional value for the variable.
 * @returns The variable's value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
function letCallback(args, value) {
    if (!Array.isArray(value)) value = [value];
    if (args.key !== undefined) {
        const key = args.key;
        if (typeof key !== 'string') throw new Error('Key must be a string');
        if (args._hasUnnamedArgument) {
            const val = typeof value[0] === 'string' ? value.join(' ') : value[0];
            args._scope.letVariable(key, val);
            return val;
        } else {
            args._scope.letVariable(key);
            return '';
        }
    }
    const key = value.shift();
    if (typeof key !== 'string') throw new Error('Key must be a string');
    if (value.length > 0) {
        const val = typeof value[0] === 'string' ? value.join(' ') : value[0];
        args._scope.letVariable(key, val);
        return val;
    } else {
        args._scope.letVariable(key);
        return '';
    }
}

/**
 * Set or retrieve a variable in the current scope or nearest ancestor scope.
 * @param {NamedArguments} args Named arguments.
 * @param {string|SlashCommandClosure|(string|SlashCommandClosure)[]} value Name and optional value for the variable.
 * @returns The variable's value
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
function varCallback(args, value) {
    if (!Array.isArray(value)) value = [value];
    if (args.key !== undefined) {
        const key = args.key;
        if (typeof key !== 'string') throw new Error('Key must be a string');
        if (args._hasUnnamedArgument) {
            const val = typeof value[0] === 'string' ? value.join(' ') : value[0];
            args._scope.setVariable(key, val, args.index, args.as);
            return val;
        } else {
            return args._scope.getVariable(key, args.index);
        }
    }
    const key = value.shift();
    if (typeof key !== 'string') throw new Error('Key must be a string');
    if (value.length > 0) {
        const val = typeof value[0] === 'string' ? value.join(' ') : value[0];
        args._scope.setVariable(key, val, args.index, args.as);
        return val;
    } else {
        return args._scope.getVariable(key, args.index);
    }
}

/**
 * @param {NamedArguments} args
 * @param {SlashCommandClosure} value
 * @returns {string}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
function closureSerializeCallback(args, value) {
    if (!(value instanceof SlashCommandClosure)) {
        throw new Error('unnamed argument must be a closure');
    }
    return value.rawText;
}

/**
 * @param {NamedArguments} args
 * @param {UnnamedArguments} value
 * @returns {SlashCommandClosure}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
function closureDeserializeCallback(args, value) {
    const parser = new SlashCommandParser();
    const closure = parser.parse(value, true, args._parserFlags, args._abortController);
    closure.scope.parent = args._scope;
    return closure;
}

/**
 *
 */
export function registerVariableCommands() {
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'listvar',
            callback: listVariablesCallback,
            aliases: ['listchatvar'],
            helpString:
                'List registered chat variables. Displays variables in a popup by default. Use the <code>return</code> argument to change the return type.',
            returns: 'JSON list of local variables',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'scope',
                    description: 'filter variables by scope',
                    typeList: [ARGUMENT_TYPE.STRING],
                    defaultValue: 'all',
                    isRequired: false,
                    forceEnum: true,
                    enumList: [
                        new SlashCommandEnumValue(
                            'all',
                            'All variables',
                            enumTypes.enum,
                            enumIcons.variable,
                        ),
                        new SlashCommandEnumValue(
                            'local',
                            'Local variables',
                            enumTypes.enum,
                            enumIcons.localVariable,
                        ),
                        new SlashCommandEnumValue(
                            'global',
                            'Global variables',
                            enumTypes.enum,
                            enumIcons.globalVariable,
                        ),
                    ],
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'return',
                    description: 'The way how you want the return value to be provided',
                    typeList: [ARGUMENT_TYPE.STRING],
                    defaultValue: 'popup-html',
                    enumList: slashCommandReturnHelper.enumList({
                        allowPipe: false,
                        allowObject: true,
                        allowChat: true,
                        allowPopup: true,
                        allowTextVersion: false,
                    }),
                    forceEnum: true,
                }),
            ],
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'setvar',
            // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
            callback: (args, value) => String(setLocalVariable(args.key || args.name, value, args)),
            aliases: ['setchatvar'],
            returns: 'the set variable value',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description: 'variable name',
                    typeList: [ARGUMENT_TYPE.VARIABLE_NAME],
                    isRequired: true,
                    enumProvider: commonEnumProviders.variables('local'),
                    forceEnum: false,
                }),
                new SlashCommandNamedArgument(
                    'index',
                    'list index',
                    [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.STRING],
                    false,
                ),
                SlashCommandNamedArgument.fromProps({
                    name: 'as',
                    description: 'change the type of the value when used with index',
                    forceEnum: true,
                    enumProvider: commonEnumProviders.types,
                    isRequired: false,
                    defaultValue: 'string',
                }),
            ],
            unnamedArgumentList: [
                new SlashCommandArgument(
                    'value',
                    [
                        ARGUMENT_TYPE.STRING,
                        ARGUMENT_TYPE.NUMBER,
                        ARGUMENT_TYPE.BOOLEAN,
                        ARGUMENT_TYPE.LIST,
                        ARGUMENT_TYPE.DICTIONARY,
                    ],
                    true,
                ),
            ],
            helpString: `
            <div>
                Set a local variable value and pass it down the pipe. The <code>index</code> argument is optional.
                To convert the value to a specific JSON type when using <code>index</code>, use the <code>as</code> argument.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/setvar key=color green</code></pre>
                    </li>
                    <li>
                        <pre><code class="language-stscript">/setvar key=ages index=John as=number 21</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'getvar',
            // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
            callback: (args, value) => String(getLocalVariable(value, args)),
            aliases: ['getchatvar'],
            returns: 'the variable value',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description: 'variable name',
                    typeList: [ARGUMENT_TYPE.VARIABLE_NAME],
                    enumProvider: commonEnumProviders.variables('local'),
                }),
                new SlashCommandNamedArgument(
                    'index',
                    'list index',
                    [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.STRING],
                    false,
                ),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'key',
                    typeList: [ARGUMENT_TYPE.VARIABLE_NAME],
                    isRequired: false,
                    enumProvider: commonEnumProviders.variables('local'),
                }),
            ],
            helpString: `
            <div>
                Get a local variable value and pass it down the pipe. The <code>index</code> argument is optional.
            </div>
            <div>
                <strong>Examples:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/getvar height</code></pre>
                    </li>
                    <li>
                        <pre><code class="language-stscript">/getvar key=height</code></pre>
                    </li>
                    <li>
                        <pre><code class="language-stscript">/getvar index=3 costumes</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'addvar',
            // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
            callback: (args, value) => String(addLocalVariable(args.key || args.name, value)),
            aliases: ['addchatvar'],
            returns: 'the new variable value',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description: 'variable name',
                    typeList: [ARGUMENT_TYPE.VARIABLE_NAME],
                    isRequired: true,
                    enumProvider: commonEnumProviders.variables('local'),
                    forceEnum: false,
                }),
            ],
            unnamedArgumentList: [
                new SlashCommandArgument(
                    'value to add to the variable',
                    [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.STRING],
                    true,
                ),
            ],
            helpString: `
            <div>
                Add a value to a local variable and pass the result down the pipe.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/addvar key=score 10</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'setglobalvar',
            // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
            callback: (args, value) =>
                String(setGlobalVariable(args.key || args.name, value, args)),
            returns: 'the set global variable value',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description: 'variable name',
                    typeList: [ARGUMENT_TYPE.VARIABLE_NAME],
                    isRequired: true,
                    enumProvider: commonEnumProviders.variables('global'),
                    forceEnum: false,
                }),
                new SlashCommandNamedArgument(
                    'index',
                    'list index',
                    [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.STRING],
                    false,
                ),
                SlashCommandNamedArgument.fromProps({
                    name: 'as',
                    description: 'change the type of the value when used with index',
                    forceEnum: true,
                    enumProvider: commonEnumProviders.types,
                    isRequired: false,
                    defaultValue: 'string',
                }),
            ],
            unnamedArgumentList: [
                new SlashCommandArgument(
                    'value',
                    [
                        ARGUMENT_TYPE.STRING,
                        ARGUMENT_TYPE.NUMBER,
                        ARGUMENT_TYPE.BOOLEAN,
                        ARGUMENT_TYPE.LIST,
                        ARGUMENT_TYPE.DICTIONARY,
                    ],
                    true,
                ),
            ],
            helpString: `
            <div>
                Set a global variable value and pass it down the pipe. The <code>index</code> argument is optional.
                To convert the value to a specific JSON type when using <code>index</code>, use the <code>as</code> argument.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/setglobalvar key=color green</code></pre>
                    </li>
                    <li>
                        <pre><code class="language-stscript">/setglobalvar key=ages index=John as=number 21</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'getglobalvar',
            // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
            callback: (args, value) => String(getGlobalVariable(value, args)),
            returns: 'global variable value',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description: 'variable name',
                    typeList: [ARGUMENT_TYPE.VARIABLE_NAME],
                    enumProvider: commonEnumProviders.variables('global'),
                }),
                new SlashCommandNamedArgument(
                    'index',
                    'list index',
                    [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.STRING],
                    false,
                ),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'key',
                    typeList: [ARGUMENT_TYPE.VARIABLE_NAME],
                    enumProvider: commonEnumProviders.variables('global'),
                }),
            ],
            helpString: `
            <div>
                Get a global variable value and pass it down the pipe. The <code>index</code> argument is optional.
            </div>
            <div>
                <strong>Examples:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/getglobalvar height</code></pre>
                    </li>
                    <li>
                        <pre><code class="language-stscript">/getglobalvar key=height</code></pre>
                    </li>
                    <li>
                        <pre><code class="language-stscript">/getglobalvar index=3 costumes</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'addglobalvar',
            // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
            callback: (args, value) => String(addGlobalVariable(args.key || args.name, value)),
            returns: 'the new variable value',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description: 'variable name',
                    typeList: [ARGUMENT_TYPE.VARIABLE_NAME],
                    isRequired: true,
                    enumProvider: commonEnumProviders.variables('global'),
                    forceEnum: false,
                }),
            ],
            unnamedArgumentList: [
                new SlashCommandArgument(
                    'value to add to the variable',
                    [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.STRING],
                    true,
                ),
            ],
            helpString: `
            <div>
                Add a value to a global variable and pass the result down the pipe.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/addglobalvar key=score 10</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'incvar',
            // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
            callback: (_, value) => String(incrementLocalVariable(value)),
            aliases: ['incchatvar'],
            returns: 'the new variable value',
            unnamedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description: 'variable name',
                    typeList: [ARGUMENT_TYPE.VARIABLE_NAME],
                    isRequired: true,
                    enumProvider: commonEnumProviders.variables('local'),
                    forceEnum: false,
                }),
            ],
            helpString: `
            <div>
                Increment a local variable by 1 and pass the result down the pipe.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/incvar score</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'decvar',
            // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
            callback: (_, value) => String(decrementLocalVariable(value)),
            aliases: ['decchatvar'],
            returns: 'the new variable value',
            unnamedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description: 'variable name',
                    typeList: [ARGUMENT_TYPE.VARIABLE_NAME],
                    isRequired: true,
                    enumProvider: commonEnumProviders.variables('local'),
                    forceEnum: false,
                }),
            ],
            helpString: `
            <div>
                Decrement a local variable by 1 and pass the result down the pipe.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/decvar score</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'incglobalvar',
            // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
            callback: (_, value) => String(incrementGlobalVariable(value)),
            returns: 'the new variable value',
            unnamedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description: 'variable name',
                    typeList: [ARGUMENT_TYPE.VARIABLE_NAME],
                    isRequired: true,
                    enumProvider: commonEnumProviders.variables('global'),
                    forceEnum: false,
                }),
            ],
            helpString: `
            <div>
                Increment a global variable by 1 and pass the result down the pipe.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/incglobalvar score</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'decglobalvar',
            // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
            callback: (_, value) => String(decrementGlobalVariable(value)),
            returns: 'the new variable value',
            unnamedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description: 'variable name',
                    typeList: [ARGUMENT_TYPE.VARIABLE_NAME],
                    isRequired: true,
                    enumProvider: commonEnumProviders.variables('global'),
                    forceEnum: false,
                }),
            ],
            helpString: `
            <div>
                Decrement a global variable by 1 and pass the result down the pipe.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/decglobalvar score</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'if',
            callback: ifCallback,
            returns: 'result of the executed command ("then" or "else")',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'left',
                    description: 'left operand',
                    typeList: [
                        ARGUMENT_TYPE.VARIABLE_NAME,
                        ARGUMENT_TYPE.STRING,
                        ARGUMENT_TYPE.NUMBER,
                    ],
                    isRequired: true,
                    enumProvider: commonEnumProviders.variables('all'),
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'right',
                    description: 'right operand',
                    typeList: [
                        ARGUMENT_TYPE.VARIABLE_NAME,
                        ARGUMENT_TYPE.STRING,
                        ARGUMENT_TYPE.NUMBER,
                    ],
                    enumProvider: commonEnumProviders.variables('all'),
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'rule',
                    description: 'comparison rule',
                    typeList: [ARGUMENT_TYPE.STRING],
                    defaultValue: 'eq',
                    enumList: [
                        new SlashCommandEnumValue('eq', 'a == b (strings & numbers)'),
                        new SlashCommandEnumValue('neq', 'a !== b (strings & numbers)'),
                        new SlashCommandEnumValue(
                            'in',
                            'a includes b (strings & numbers as strings)',
                        ),
                        new SlashCommandEnumValue(
                            'nin',
                            'a not includes b (strings & numbers as strings)',
                        ),
                        new SlashCommandEnumValue('gt', 'a > b (numbers)'),
                        new SlashCommandEnumValue('gte', 'a >= b (numbers)'),
                        new SlashCommandEnumValue('lt', 'a < b (numbers)'),
                        new SlashCommandEnumValue('lte', 'a <= b (numbers)'),
                        new SlashCommandEnumValue('not', '!a (truthy)'),
                    ],
                    forceEnum: true,
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'else',
                    description: 'command to execute if not true',
                    typeList: [ARGUMENT_TYPE.CLOSURE, ARGUMENT_TYPE.SUBCOMMAND],
                }),
            ],
            unnamedArgumentList: [
                new SlashCommandArgument(
                    'command to execute if true',
                    [ARGUMENT_TYPE.CLOSURE, ARGUMENT_TYPE.SUBCOMMAND],
                    true,
                ),
            ],
            splitUnnamedArgument: true,
            helpString: `
            <div>
                Compares the value of the left operand <code>a</code> with the value of the right operand <code>b</code>,
                and if the condition yields true, then execute any valid slash command enclosed in quotes and pass the
                result of the command execution down the pipe.
            </div>
            <div>
                Numeric values and string literals for left and right operands supported.
            </div>
            <div>
                If the rule is not provided, it defaults to <code>eq</code>.
            </div>
            <div>
                If no right operand is provided, it defaults to checking the <code>left</code> value to be truthy.
                A non-empty string or non-zero number is considered truthy, as is the value <code>true</code> or <code>on</code>.<br />
                Only acceptable rules for no provided right operand are <code>not</code>, and no provided rule - which default to returning whether it is not or is truthy.
            </div>
            <div>
                <strong>Available rules:</strong>
                <ul>
                    <li><code>eq</code> => a == b <small>(strings & numbers)</small></li>
                    <li><code>neq</code> => a !== b <small>(strings & numbers)</small></li>
                    <li><code>in</code> => a includes b <small>(strings & numbers as strings)</small></li>
                    <li><code>nin</code> => a not includes b <small>(strings & numbers as strings)</small></li>
                    <li><code>gt</code> => a > b <small>(numbers)</small></li>
                    <li><code>gte</code> => a >= b <small>(numbers)</small></li>
                    <li><code>lt</code> => a < b <small>(numbers)</small></li>
                    <li><code>lte</code> => a <= b <small>(numbers)</small></li>
                    <li><code>not</code> => !a <small>(truthy)</small></li>
                </ul>
            </div>
            <div>
                <strong>Examples:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/if left=score right=10 rule=gte "/speak You win"</code></pre>
                        triggers a /speak command if the value of "score" is greater or equals 10.
                    </li>
                    <li>
                        <pre><code class="language-stscript">/if left={{lastMessage}} rule=in right=surprise {: /echo SURPISE! :}</code></pre>
                        executes a subcommand defined as a closure if the given value contains a specified word.
                    <li>
                        <pre><code class="language-stscript">/if left=myContent {: /echo My content had some content. :}</code></pre>
                        executes the defined subcommand, if the provided value of left is truthy (contains some kind of contant that is not empty or false)
                    </li>
                    <li>
                        <pre><code class="language-stscript">/if left=tree right={{getvar::object}} {: /echo The object is a tree! :}</code></pre>
                        executes the defined subcommand, if the left and right values are equals.
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'while',
            callback: whileCallback,
            returns: 'result of the last executed command',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'left',
                    description: 'left operand',
                    typeList: [
                        ARGUMENT_TYPE.VARIABLE_NAME,
                        ARGUMENT_TYPE.STRING,
                        ARGUMENT_TYPE.NUMBER,
                    ],
                    isRequired: true,
                    enumProvider: commonEnumProviders.variables('all'),
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'right',
                    description: 'right operand',
                    typeList: [
                        ARGUMENT_TYPE.VARIABLE_NAME,
                        ARGUMENT_TYPE.STRING,
                        ARGUMENT_TYPE.NUMBER,
                    ],
                    enumProvider: commonEnumProviders.variables('all'),
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'rule',
                    description: 'comparison rule',
                    typeList: [ARGUMENT_TYPE.STRING],
                    defaultValue: 'eq',
                    enumList: [
                        new SlashCommandEnumValue('eq', 'a == b (strings & numbers)'),
                        new SlashCommandEnumValue('neq', 'a !== b (strings & numbers)'),
                        new SlashCommandEnumValue(
                            'in',
                            'a includes b (strings & numbers as strings)',
                        ),
                        new SlashCommandEnumValue(
                            'nin',
                            'a not includes b (strings & numbers as strings)',
                        ),
                        new SlashCommandEnumValue('gt', 'a > b (numbers)'),
                        new SlashCommandEnumValue('gte', 'a >= b (numbers)'),
                        new SlashCommandEnumValue('lt', 'a < b (numbers)'),
                        new SlashCommandEnumValue('lte', 'a <= b (numbers)'),
                        new SlashCommandEnumValue('not', '!a (truthy)'),
                    ],
                    forceEnum: true,
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'guard',
                    description: 'disable loop iteration limit',
                    typeList: [ARGUMENT_TYPE.STRING],
                    defaultValue: 'off',
                    enumList: commonEnumProviders.boolean('onOff')(),
                }),
            ],
            unnamedArgumentList: [
                new SlashCommandArgument(
                    'command to execute while true',
                    [ARGUMENT_TYPE.CLOSURE, ARGUMENT_TYPE.SUBCOMMAND],
                    true,
                ),
            ],
            splitUnnamedArgument: true,
            helpString: `
            <div>
                Compares the value of the left operand <code>a</code> with the value of the right operand <code>b</code>,
                and if the condition yields true, then execute any valid slash command enclosed in quotes.
            </div>
            <div>
                Numeric values and string literals for left and right operands supported.
            </div>
            <div>
                <strong>Available rules:</strong>
                <ul>
                    <li><code>eq</code> => a == b <small>(strings & numbers)</small></li>
                    <li><code>neq</code> => a !== b <small>(strings & numbers)</small></li>
                    <li><code>in</code> => a includes b <small>(strings & numbers as strings)</small></li>
                    <li><code>nin</code> => a not includes b <small>(strings & numbers as strings)</small></li>
                    <li><code>gt</code> => a > b <small>(numbers)</small></li>
                    <li><code>gte</code> => a >= b <small>(numbers)</small></li>
                    <li><code>lt</code> => a < b <small>(numbers)</small></li>
                    <li><code>lte</code> => a <= b <small>(numbers)</small></li>
                    <li><code>not</code> => !a <small>(truthy)</small></li>
                </ul>
            </div>
            <div>
                <strong>Examples:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/setvar key=i 0 | /while left=i right=10 rule=lte "/addvar key=i 1"</code></pre>
                        adds 1 to the value of "i" until it reaches 10.
                    </li>
                    <li>
                        <pre><code class="language-stscript">/while left={{getvar::currentword}} {: /setvar key=currentword {: /do-something-and-return :}() | /echo The current work is "{{getvar::currentword}}" :}</code></pre>
                        executes the defined subcommand as long as the "currentword" variable is truthy (has any content that is not false/empty)
                        </ul>
                        </li>
            </div>
            <div>
                Loops are limited to 100 iterations by default, pass <code>guard=off</code> to disable.
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'times',
            callback: timesCallback,
            returns: 'result of the last executed command',
            namedArgumentList: [
                new SlashCommandNamedArgument(
                    // @ts-expect-error TS(2345) FIXME: Argument of type 'SlashCommandEnumValue[]' is not ... Remove this comment to see the full error message
                    'guard',
                    'disable loop iteration limit',
                    [ARGUMENT_TYPE.STRING],
                    false,
                    false,
                    null,
                    commonEnumProviders.boolean('onOff')(),
                ),
            ],
            unnamedArgumentList: [
                new SlashCommandArgument('repeats', [ARGUMENT_TYPE.NUMBER], true),
                new SlashCommandArgument(
                    'command',
                    [ARGUMENT_TYPE.CLOSURE, ARGUMENT_TYPE.SUBCOMMAND],
                    true,
                ),
            ],
            splitUnnamedArgument: true,
            splitUnnamedArgumentCount: 1,
            helpString: `
            <div>
                Execute any valid slash command enclosed in quotes <code>repeats</code> number of times.
            </div>
            <div>
                <strong>Examples:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/setvar key=i 1 | /times 5 "/addvar key=i 1"</code></pre>
                        adds 1 to the value of "i" 5 times.
                    </li>
                    <li>
                        <pre><code class="language-stscript">/times 4 "/echo {{timesIndex}}"</code></pre>
                        echos the numbers 0 through 4. <code>{{timesIndex}}</code> is replaced with the iteration number (zero-based).
                    </li>
                </ul>
            </div>
            <div>
                Loops are limited to 100 iterations by default, pass <code>guard=off</code> to disable.
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'flushvar',
            // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
            callback: async (_, value) =>
                deleteLocalVariable(
                    value instanceof SlashCommandClosure
                        ? (await value.execute())?.pipe
                        : String(value),
                ),
            aliases: ['flushchatvar'],
            unnamedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description: 'variable name or closure that returns a variable name',
                    typeList: [ARGUMENT_TYPE.VARIABLE_NAME, ARGUMENT_TYPE.CLOSURE],
                    enumProvider: commonEnumProviders.variables('local'),
                }),
            ],
            helpString: `
            <div>
                Delete a local variable.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/flushvar score</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'flushglobalvar',
            // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
            callback: async (_, value) =>
                deleteGlobalVariable(
                    value instanceof SlashCommandClosure
                        ? (await value.execute())?.pipe
                        : String(value),
                ),
            namedArgumentList: [],
            unnamedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description: 'variable name or closure that returns a variable name',
                    typeList: [ARGUMENT_TYPE.VARIABLE_NAME, ARGUMENT_TYPE.CLOSURE],
                    enumProvider: commonEnumProviders.variables('global'),
                }),
            ],
            helpString: `
            <div>
                Deletes the specified global variable.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/flushglobalvar score</code></pre>
                        Deletes the global variable <code>score</code>.
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'add',
            // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
            callback: (args, value) => addValuesCallback(args, value),
            returns: 'sum of the provided values',
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'values to sum',
                    typeList: [
                        ARGUMENT_TYPE.NUMBER,
                        ARGUMENT_TYPE.VARIABLE_NAME,
                        ARGUMENT_TYPE.LIST,
                    ],
                    isRequired: true,
                    acceptsMultiple: true,
                    enumProvider: commonEnumProviders.numbersAndVariables,
                    forceEnum: false,
                }),
            ],
            splitUnnamedArgument: true,
            helpString: `
            <div>
                Performs an addition of the set of values and passes the result down the pipe.
            </div>
            <div>
                Can use variable names, or a JSON array consisting of numbers and variables (with quotes).
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/add 10 i 30 j</code></pre>
                    </li>
                    <li>
                        <pre><code class="language-stscript">/add ["count", 15, 2, "i"]</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'mul',
            // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
            callback: (args, value) => mulValuesCallback(args, value),
            returns: 'product of the provided values',
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'values to multiply',
                    typeList: [
                        ARGUMENT_TYPE.NUMBER,
                        ARGUMENT_TYPE.VARIABLE_NAME,
                        ARGUMENT_TYPE.LIST,
                    ],
                    isRequired: true,
                    acceptsMultiple: true,
                    enumProvider: commonEnumProviders.numbersAndVariables,
                    forceEnum: false,
                }),
            ],
            splitUnnamedArgument: true,
            helpString: `
            <div>
                Performs a multiplication of the set of values and passes the result down the pipe.
            </div>
            <div>
                Can use variable names, or a JSON array consisting of numbers and variables (with quotes).
            </div>
            <div>
                <strong>Examples:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/mul 10 i 30 j</code></pre>
                    </li>
                    <li>
                        <pre><code class="language-stscript">/mul ["count", 15, 2, "i"]</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'max',
            callback: maxValuesCallback,
            returns: 'maximum value of the set of values',
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'values to find the max',
                    typeList: [
                        ARGUMENT_TYPE.NUMBER,
                        ARGUMENT_TYPE.VARIABLE_NAME,
                        ARGUMENT_TYPE.LIST,
                    ],
                    isRequired: true,
                    acceptsMultiple: true,
                    enumProvider: commonEnumProviders.numbersAndVariables,
                    forceEnum: false,
                }),
            ],
            splitUnnamedArgument: true,
            helpString: `
            <div>
                Returns the maximum value of the set of values and passes the result down the pipe.
            </div>
            <div>
                Can use variable names, or a JSON array consisting of numbers and variables (with quotes).
            </div>
            <div>
                <strong>Examples:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/max 10 i 30 j</code></pre>
                    </li>
                    <li>
                        <pre><code class="language-stscript">/max ["count", 15, 2, "i"]</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'min',
            callback: minValuesCallback,
            returns: 'minimum value of the set of values',
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'values to find the min',
                    typeList: [
                        ARGUMENT_TYPE.NUMBER,
                        ARGUMENT_TYPE.VARIABLE_NAME,
                        ARGUMENT_TYPE.LIST,
                    ],
                    isRequired: true,
                    acceptsMultiple: true,
                    enumProvider: commonEnumProviders.numbersAndVariables,
                    forceEnum: false,
                }),
            ],
            splitUnnamedArgument: true,
            helpString: `
            <div>
                Returns the minimum value of the set of values and passes the result down the pipe.
            </div>
            <div>
                Can use variable names, or a JSON array consisting of numbers and variables (with quotes).
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/min 10 i 30 j</code></pre>
                    </li>
                    <li>
                        <pre><code class="language-stscript">/min ["count", 15, 2, "i"]</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'sub',
            callback: subValuesCallback,
            returns: 'difference of the provided values',
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'values to subtract, starting form the first provided value',
                    typeList: [
                        ARGUMENT_TYPE.NUMBER,
                        ARGUMENT_TYPE.VARIABLE_NAME,
                        ARGUMENT_TYPE.LIST,
                    ],
                    isRequired: true,
                    acceptsMultiple: true,
                    enumProvider: commonEnumProviders.numbersAndVariables,
                    forceEnum: false,
                }),
            ],
            splitUnnamedArgument: true,
            helpString: `
            <div>
                Performs a subtraction of the set of values and passes the result down the pipe.
            </div>
            <div>
                Can use variable names, or a JSON array consisting of numbers and variables (with quotes).
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/sub i 5</code></pre>
                    </li>
                    <li>
                        <pre><code class="language-stscript">/sub ["count", 4, "i"]</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'div',
            callback: divValuesCallback,
            returns: 'result of division',
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'dividend',
                    typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.VARIABLE_NAME],
                    isRequired: true,
                    enumProvider: commonEnumProviders.numbersAndVariables,
                    forceEnum: false,
                }),
                SlashCommandArgument.fromProps({
                    description: 'divisor',
                    typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.VARIABLE_NAME],
                    isRequired: true,
                    enumProvider: commonEnumProviders.numbersAndVariables,
                    forceEnum: false,
                }),
            ],
            splitUnnamedArgument: true,
            helpString: `
            <div>
                Performs a division of two values and passes the result down the pipe.
                Can use variable names.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/div 10 i</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'mod',
            callback: modValuesCallback,
            returns: 'result of modulo operation',
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'dividend',
                    typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.VARIABLE_NAME],
                    isRequired: true,
                    enumProvider: commonEnumProviders.numbersAndVariables,
                    forceEnum: false,
                }),
                SlashCommandArgument.fromProps({
                    description: 'divisor',
                    typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.VARIABLE_NAME],
                    isRequired: true,
                    enumProvider: commonEnumProviders.numbersAndVariables,
                    forceEnum: false,
                }),
            ],
            splitUnnamedArgument: true,
            helpString: `
            <div>
                Performs a modulo operation of two values and passes the result down the pipe.
                Can use variable names.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/mod i 2</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'pow',
            callback: powValuesCallback,
            returns: 'result of power operation',
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'base',
                    typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.VARIABLE_NAME],
                    isRequired: true,
                    enumProvider: commonEnumProviders.numbersAndVariables,
                    forceEnum: false,
                }),
                SlashCommandArgument.fromProps({
                    description: 'exponent',
                    typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.VARIABLE_NAME],
                    isRequired: true,
                    enumProvider: commonEnumProviders.numbersAndVariables,
                    forceEnum: false,
                }),
            ],
            splitUnnamedArgument: true,
            helpString: `
            <div>
                Performs a power operation of two values and passes the result down the pipe.
                Can use variable names.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/pow i 2</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'sin',
            callback: sinValuesCallback,
            returns: 'sine of the provided value',
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'value',
                    typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.VARIABLE_NAME],
                    isRequired: true,
                    enumProvider: commonEnumProviders.numbersAndVariables,
                    forceEnum: false,
                }),
            ],
            helpString: `
            <div>
                Performs a sine operation of a value and passes the result down the pipe.
                Can use variable names.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/sin i</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'cos',
            callback: cosValuesCallback,
            returns: 'cosine of the provided value',
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'value',
                    typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.VARIABLE_NAME],
                    isRequired: true,
                    enumProvider: commonEnumProviders.numbersAndVariables,
                    forceEnum: false,
                }),
            ],
            helpString: `
            <div>
                Performs a cosine operation of a value and passes the result down the pipe.
                Can use variable names.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/cos i</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'log',
            callback: logValuesCallback,
            returns: 'log of the provided value',
            namedArgumentList: [],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'value',
                    typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.VARIABLE_NAME],
                    isRequired: true,
                    enumProvider: commonEnumProviders.numbersAndVariables,
                    forceEnum: false,
                }),
            ],
            helpString: `
            <div>
                Performs a logarithm operation of a value and passes the result down the pipe.
                Can use variable names.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/log i</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'abs',
            callback: absValuesCallback,
            returns: 'absolute value of the provided value',
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'value',
                    typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.VARIABLE_NAME],
                    isRequired: true,
                    enumProvider: commonEnumProviders.numbersAndVariables,
                    forceEnum: false,
                }),
            ],
            helpString: `
            <div>
                Performs an absolute value operation of a value and passes the result down the pipe.
                Can use variable names.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/abs i</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'sqrt',
            callback: sqrtValuesCallback,
            returns: 'square root of the provided value',
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'value',
                    typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.VARIABLE_NAME],
                    isRequired: true,
                    enumProvider: commonEnumProviders.numbersAndVariables,
                    forceEnum: false,
                }),
            ],
            helpString: `
            <div>
                Performs a square root operation of a value and passes the result down the pipe.
                Can use variable names.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/sqrt i</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'round',
            callback: roundValuesCallback,
            returns: 'rounded value',
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'value',
                    typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.VARIABLE_NAME],
                    isRequired: true,
                    enumProvider: commonEnumProviders.numbersAndVariables,
                    forceEnum: false,
                }),
            ],
            helpString: `
            <div>
                Rounds a value and passes the result down the pipe.
                Can use variable names.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/round i</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'len',
            // @ts-expect-error TS(7006) FIXME: Parameter '_' implicitly has an 'any' type.
            callback: (_, value) => String(lenValuesCallback(value)),
            aliases: ['length'],
            returns: 'length of the provided value',
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'value',
                    typeList: [
                        ARGUMENT_TYPE.STRING,
                        ARGUMENT_TYPE.NUMBER,
                        ARGUMENT_TYPE.LIST,
                        ARGUMENT_TYPE.DICTIONARY,
                    ],
                    isRequired: true,
                    forceEnum: false,
                }),
            ],
            helpString: `
            <div>
                Gets the length of a value and passes the result down the pipe.
                <ul>
                    <li>
                        For strings, returns the number of characters.
                    </li>
                    <li>
                        For lists and dictionaries, returns the number of elements.
                    </li>
                    <li>
                        For numbers, returns the number of digits (including the sign and decimal point).
                    </li>
                </ul>
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/len Lorem ipsum | /echo</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'sort',
            callback: sortArrayObjectCallback,
            returns: 'the sorted list or dictionary keys',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'keysort',
                    description: 'whether to sort by key or value; ignored for lists',
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                    enumList: ['true', 'false'],
                    defaultValue: 'true',
                }),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'value',
                    typeList: [
                        ARGUMENT_TYPE.STRING,
                        ARGUMENT_TYPE.NUMBER,
                        ARGUMENT_TYPE.LIST,
                        ARGUMENT_TYPE.DICTIONARY,
                    ],
                    isRequired: true,
                    forceEnum: false,
                }),
            ],
            helpString: `
            <div>
                Sorts a list or dictionary in ascending order and passes the result down the pipe.
                <ul>
                    <li>
                        For lists, returns the list sorted by value.
                    </li>
                    <li>
                        For dictionaries, returns the ordered list of keys after sorting. Setting keysort=false means keys are sorted by associated value.
                    </li>
                </ul>
            </div>
            <div>
                <strong>Examples:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/sort [5,3,4,1,2] | /echo</code></pre>
                    </li>
                    <li>
                        <pre><code class="language-stscript">/sort keysort=false {"a": 1, "d": 3, "c": 2, "b": 5} | /echo</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'rand',
            // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
            callback: (args, value) =>
                String(
                    randValuesCallback(
                        Number(args.from ?? 0),
                        Number(args.to ?? (value ? value : 1)),
                        args,
                    ),
                ),
            returns: 'random number',
            namedArgumentList: [
                new SlashCommandNamedArgument(
                    'from',
                    'starting value for the range (inclusive)',
                    [ARGUMENT_TYPE.NUMBER],
                    false,
                    false,
                    // @ts-expect-error TS(2345) FIXME: Argument of type '"0"' is not assignable to parame... Remove this comment to see the full error message
                    '0',
                ),
                new SlashCommandNamedArgument(
                    'to',
                    'ending value for the range (inclusive)',
                    [ARGUMENT_TYPE.NUMBER],
                    false,
                    false,
                    // @ts-expect-error TS(2345) FIXME: Argument of type '"1"' is not assignable to parame... Remove this comment to see the full error message
                    '1',
                ),
                new SlashCommandNamedArgument(
                    'round',
                    'rounding method for the result',
                    [ARGUMENT_TYPE.STRING],
                    false,
                    false,
                    null,
                    // @ts-expect-error TS(2322) FIXME: Type 'string' is not assignable to type 'never'.
                    ['round', 'ceil', 'floor'],
                ),
            ],
            helpString: `
            <div>
                Returns a random number between <code>from</code> and <code>to</code> (inclusive).
            </div>
            <div>
                <strong>Examples:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/rand</code></pre>
                        Returns a random number between 0 and 1.
                    </li>
                    <li>
                        <pre><code class="language-stscript">/rand 10</code></pre>
                        Returns a random number between 0 and 10.
                    </li>
                    <li>
                        <pre><code class="language-stscript">/rand from=5 to=10</code></pre>
                        Returns a random number between 5 and 10.
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'var',
            // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
            callback: (/** @type {NamedArguments} */ args, value) => varCallback(args, value),
            returns: 'the variable value',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description:
                        'variable name; forces setting the variable, even if no value is provided',
                    typeList: [ARGUMENT_TYPE.VARIABLE_NAME],
                    enumProvider: commonEnumProviders.variables('scope'),
                    forceEnum: false,
                }),
                new SlashCommandNamedArgument(
                    'index',
                    'optional index for list or dictionary',
                    [ARGUMENT_TYPE.NUMBER],
                    false, // isRequired
                    false, // acceptsMultiple
                ),
                SlashCommandNamedArgument.fromProps({
                    name: 'as',
                    description: 'change the type of the value when used with index',
                    forceEnum: true,
                    enumProvider: commonEnumProviders.types,
                    isRequired: false,
                    defaultValue: 'string',
                }),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'variable name',
                    typeList: [ARGUMENT_TYPE.VARIABLE_NAME],
                    enumProvider: commonEnumProviders.variables('scope'),
                    forceEnum: false,
                }),
                new SlashCommandArgument(
                    'variable value',
                    [
                        ARGUMENT_TYPE.STRING,
                        ARGUMENT_TYPE.NUMBER,
                        ARGUMENT_TYPE.BOOLEAN,
                        ARGUMENT_TYPE.LIST,
                        ARGUMENT_TYPE.DICTIONARY,
                        ARGUMENT_TYPE.CLOSURE,
                    ],
                    false, // isRequired
                    false, // acceptsMultiple
                ),
            ],
            splitUnnamedArgument: true,
            splitUnnamedArgumentCount: 1,
            helpString: `
            <div>
                Get or set a variable. Use <code>index</code> to access elements of a JSON-serialized list or dictionary.
                To convert the value to a specific JSON type when using with <code>index</code>, use the <code>as</code> argument.
            </div>
            <div>
                <strong>Examples:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/let x foo | /var x foo bar | /var x | /echo</code></pre>
                    </li>
                    <li>
                        <pre><code class="language-stscript">/let x foo | /var key=x foo bar | /var x | /echo</code></pre>
                    </li>
                    <li>
                        <pre><code class="language-stscript">/let x {} | /var index=cool as=number x 1337 | /echo {{var::x}}</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'let',
            // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
            callback: (/** @type {NamedArguments} */ args, value) => letCallback(args, value),
            returns: 'the variable value',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description: 'variable name',
                    typeList: [ARGUMENT_TYPE.VARIABLE_NAME],
                    enumProvider: commonEnumProviders.variables('scope'),
                    forceEnum: false,
                }),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'variable name',
                    typeList: [ARGUMENT_TYPE.VARIABLE_NAME],
                    enumProvider: commonEnumProviders.variables('scope'),
                    forceEnum: false,
                }),
                new SlashCommandArgument('variable value', [
                    ARGUMENT_TYPE.STRING,
                    ARGUMENT_TYPE.NUMBER,
                    ARGUMENT_TYPE.BOOLEAN,
                    ARGUMENT_TYPE.LIST,
                    ARGUMENT_TYPE.DICTIONARY,
                    ARGUMENT_TYPE.CLOSURE,
                ]),
            ],
            splitUnnamedArgument: true,
            splitUnnamedArgumentCount: 1,
            helpString: `
            <div>
                Declares a new variable in the current scope.
            </div>
            <div>
                <strong>Examples:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/let x foo bar | /echo {{var::x}}</code></pre>
                    </li>
                    <li>
                        <pre><code class="language-stscript">/let key=x foo bar | /echo {{var::x}}</code></pre>
                    </li>
                    <li>
                        <pre><code class="language-stscript">/let y</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'closure-serialize',
            /**
             *
             * @param {NamedArguments} args
             * @param {SlashCommandClosure} value
             * @returns {string}
             */
            // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
            callback: (args, value) => closureSerializeCallback(args, value),
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'the closure to serialize',
                    typeList: [ARGUMENT_TYPE.CLOSURE],
                    isRequired: true,
                }),
            ],
            returns: 'serialized closure as string',
            helpString: `
            <div>
                Serialize a closure as text that can be stored in global and chat variables.
            </div>
            <div>
                <strong>Examples:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/closure-serialize {: x=1 /echo x is {{var::x}} and y is {{var::y}} :} |\n/setvar key=myClosure</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'closure-deserialize',
            /**
             * @param {NamedArguments} args
             * @param {UnnamedArguments} value
             * @returns {SlashCommandClosure}
             */
            // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
            callback: (args, value) => closureDeserializeCallback(args, value),
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'serialized closure',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                }),
            ],
            returns: 'deserialized closure',
            helpString: `
            <div>
                Deserialize a closure from text.
            </div>
            <div>
                <strong>Examples:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/closure-deserialize {{getvar::myClosure}} |\n/let myClosure {{pipe}} |\n/let y bar |\n/:myClosure x=foo</code></pre>
                    </li>
                </ul>
            </div>
        `,
        }),
    );
}
