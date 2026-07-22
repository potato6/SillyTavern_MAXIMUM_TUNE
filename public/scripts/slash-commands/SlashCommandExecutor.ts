import { uuidv4 } from '../utils.js';
import { SlashCommandClosure } from './SlashCommandClosure.js';

export class SlashCommandExecutor {
    /**@type {Boolean}*/ injectPipe = true;
    /**@type {Number}*/ start;
    // @ts-expect-error TS(7008) FIXME: Member 'end' implicitly has an 'any' type.
    /**@type {Number}*/ end;
    // @ts-expect-error TS(7008) FIXME: Member 'startNamedArgs' implicitly has an 'any' ty... Remove this comment to see the full error message
    /**@type {Number}*/ startNamedArgs;
    // @ts-expect-error TS(7008) FIXME: Member 'endNamedArgs' implicitly has an 'any' type... Remove this comment to see the full error message
    /**@type {Number}*/ endNamedArgs;
    // @ts-expect-error TS(7008) FIXME: Member 'startUnnamedArgs' implicitly has an 'any' ... Remove this comment to see the full error message
    /**@type {Number}*/ startUnnamedArgs;
    // @ts-expect-error TS(7008) FIXME: Member 'endUnnamedArgs' implicitly has an 'any' ty... Remove this comment to see the full error message
    /**@type {Number}*/ endUnnamedArgs;
    /**@type {String}*/ name = '';
    /**@type {String}*/ #source = uuidv4();
    get source() {
        return this.#source;
    }
    set source(value) {
        this.#source = value;
        // @ts-expect-error TS(2339) FIXME: Property 'value' does not exist on type 'never'.
        for (const arg of this.namedArgumentList.filter(
            (it) => it.value instanceof SlashCommandClosure,
        )) {
            // @ts-expect-error TS(2339) FIXME: Property 'value' does not exist on type 'never'.
            arg.value.source = value;
        }
        // @ts-expect-error TS(2339) FIXME: Property 'value' does not exist on type 'never'.
        for (const arg of this.unnamedArgumentList.filter(
            (it) => it.value instanceof SlashCommandClosure,
        )) {
            // @ts-expect-error TS(2339) FIXME: Property 'value' does not exist on type 'never'.
            arg.value.source = value;
        }
    }
    // @ts-expect-error TS(7008) FIXME: Member 'command' implicitly has an 'any' type.
    /** @type {SlashCommand} */ command;
    /** @type {SlashCommandNamedArgumentAssignment[]} */ namedArgumentList = [];
    /** @type {SlashCommandUnnamedArgumentAssignment[]} */ unnamedArgumentList = [];
    // @ts-expect-error TS(7008) FIXME: Member 'parserFlags' implicitly has an 'any' type.
    /** @type {import('./SlashCommandParser.js').ParserFlags} */ parserFlags;

    get commandCount() {
        return (
            1 +
            // @ts-expect-error TS(2339) FIXME: Property 'value' does not exist on type 'never'.
            this.namedArgumentList
                .filter((it) => it.value instanceof SlashCommandClosure)
                .map((it) => /**@type {SlashCommandClosure}*/ (it.value).commandCount)
                .reduce((cur, sum) => cur + sum, 0) +
            // @ts-expect-error TS(2339) FIXME: Property 'value' does not exist on type 'never'.
            this.unnamedArgumentList
                .filter((it) => it.value instanceof SlashCommandClosure)
                .map((it) => /**@type {SlashCommandClosure}*/ (it.value).commandCount)
                .reduce((cur, sum) => cur + sum, 0)
        );
    }

    // @ts-expect-error TS(7032) FIXME: Property 'onProgress' implicitly has type 'any', b... Remove this comment to see the full error message
    set onProgress(value) {
        const closures = /**@type {SlashCommandClosure[]}*/ ([
            // @ts-expect-error TS(2339) FIXME: Property 'value' does not exist on type 'never'.
            ...this.namedArgumentList
                .filter((it) => it.value instanceof SlashCommandClosure)
                .map((it) => it.value),
            // @ts-expect-error TS(2339) FIXME: Property 'value' does not exist on type 'never'.
            ...this.unnamedArgumentList
                .filter((it) => it.value instanceof SlashCommandClosure)
                .map((it) => it.value),
        ]);
        for (const closure of closures) {
            closure.onProgress = value;
        }
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'start' implicitly has an 'any' type.
    constructor(start) {
        this.start = start;
    }
}
