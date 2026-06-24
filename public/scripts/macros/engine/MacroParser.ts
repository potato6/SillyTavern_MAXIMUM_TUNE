import { chevrotain } from '../../../lib.js';
import { MacroLexer } from './MacroLexer.js';

const { CstParser } = chevrotain;

/** @typedef {import('chevrotain').TokenType} TokenType */
/** @typedef {import('chevrotain').CstNode} CstNode */
/** @typedef {import('chevrotain').ILexingError} ILexingError */
/** @typedef {import('chevrotain').IRecognitionException} IRecognitionException */

/**
 * The singleton instance of the MacroParser.
 * @type {MacroParser}
 */
let instance;
export { instance as MacroParser };

class MacroParser extends CstParser {
    document: any;
    errors: any;
    input: any;
    macro: any;
    performSelfAnalysis: any;
    /** @type {MacroParser} */ static #instance;
    /** @type {MacroParser} */ static get instance() { return MacroParser.#instance ?? (MacroParser.#instance = new MacroParser()); }

    /** @private */
    constructor() {
        super(MacroLexer.def, {
            traceInitPerf: false,
            nodeLocationTracking: 'full',
            recoveryEnabled: true,
        });
        const Tokens = MacroLexer.tokens;

        const $ = this;

        // Top-level document rule that can handle both plaintext and macros
        // @ts-expect-error TS(2339): Property 'RULE' does not exist on type 'MacroParse... Remove this comment to see the full error message
        $.document = $.RULE('document', () => {
            // @ts-expect-error TS(2339): Property 'MANY' does not exist on type 'MacroParse... Remove this comment to see the full error message
            $.MANY(() => {
                // @ts-expect-error TS(2339): Property 'OR' does not exist on type 'MacroParser'... Remove this comment to see the full error message
                $.OR([
                    // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                    { ALT: () => $.CONSUME(Tokens.Plaintext, { LABEL: 'plaintext' }) },
                    // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                    { ALT: () => $.CONSUME(Tokens.PlaintextOpenBrace, { LABEL: 'plaintext' }) },
                    // @ts-expect-error TS(2339): Property 'SUBRULE' does not exist on type 'MacroPa... Remove this comment to see the full error message
                    { ALT: () => $.SUBRULE($.macro) },
                    // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                    { ALT: () => $.CONSUME(Tokens.Macro.Start, { LABEL: 'plaintext' }) },
                ]);
            });
        });

        // Basic Macro Structure - can be either a regular macro or a variable expression
        // @ts-expect-error TS(2339): Property 'RULE' does not exist on type 'MacroParse... Remove this comment to see the full error message
        $.macro = $.RULE('macro', () => {
            // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
            $.CONSUME(Tokens.Macro.Start);

            // Optional flags before the identifier (e.g., {{!user}}, {{?~macro}}, {{>filtered}})
            // Both regular flags and filter flag are captured under the 'flags' label
            // @ts-expect-error TS(2339): Property 'MANY' does not exist on type 'MacroParse... Remove this comment to see the full error message
            $.MANY(() => {
                // @ts-expect-error TS(2339): Property 'OR1' does not exist on type 'MacroParser... Remove this comment to see the full error message
                $.OR1([
                    // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                    { ALT: () => $.CONSUME(Tokens.Macro.Flags, { LABEL: 'flags' }) },
                    // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                    { ALT: () => $.CONSUME(Tokens.Macro.FilterFlag, { LABEL: 'flags' }) },
                ]);
            });

            // Branch: either a variable expression (starts with . or $) or a regular macro
            // @ts-expect-error TS(2339): Property 'OR' does not exist on type 'MacroParser'... Remove this comment to see the full error message
            $.OR([
                // Variable expression branch
                // @ts-expect-error TS(2339): Property 'SUBRULE' does not exist on type 'MacroPa... Remove this comment to see the full error message
                { ALT: () => $.SUBRULE($.variableExpr) },
                // Regular macro branch
                // @ts-expect-error TS(2339): Property 'SUBRULE' does not exist on type 'MacroPa... Remove this comment to see the full error message
                { ALT: () => $.SUBRULE($.macroBody) },
            ]);

            // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
            $.CONSUME(Tokens.Macro.End);
        });

        // Regular macro body (flags + identifier + optional arguments)
        // @ts-expect-error TS(2339): Property 'macroBody' does not exist on type 'Macro... Remove this comment to see the full error message
        $.macroBody = $.RULE('macroBody', () => {
            // Macro identifier (name)
            // @ts-expect-error TS(2339): Property 'OR2' does not exist on type 'MacroParser... Remove this comment to see the full error message
            $.OR2([
                // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                { ALT: () => $.CONSUME(Tokens.Macro.DoubleSlash, { LABEL: 'Macro.identifier' }) },
                // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                { ALT: () => $.CONSUME(Tokens.Macro.Identifier, { LABEL: 'Macro.identifier' }) },
            ]);
            // @ts-expect-error TS(2339): Property 'OPTION' does not exist on type 'MacroPar... Remove this comment to see the full error message
            $.OPTION(() => $.SUBRULE($.arguments));
        });

        // Variable expression: .varName or $varName with optional operator
        // @ts-expect-error TS(2339): Property 'variableExpr' does not exist on type 'Ma... Remove this comment to see the full error message
        $.variableExpr = $.RULE('variableExpr', () => {
            // Variable scope prefix
            // @ts-expect-error TS(2339): Property 'OR3' does not exist on type 'MacroParser... Remove this comment to see the full error message
            $.OR3([
                // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                { ALT: () => $.CONSUME(Tokens.Var.LocalPrefix, { LABEL: 'Var.scope' }) },
                // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                { ALT: () => $.CONSUME(Tokens.Var.GlobalPrefix, { LABEL: 'Var.scope' }) },
            ]);

            // Variable identifier (name)
            // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
            $.CONSUME(Tokens.Var.Identifier, { LABEL: 'Var.identifier' });

            // Optional operator (and expression, if operator requires one)
            // @ts-expect-error TS(2339): Property 'OPTION2' does not exist on type 'MacroPa... Remove this comment to see the full error message
            $.OPTION2(() => $.SUBRULE($.variableOperator));
        });

        // Variable operator: ++, --, = value, += value, -= value, ||, ??, ||=, ??=, ==, !=, >, >=, <, <=
        // @ts-expect-error TS(2339): Property 'variableOperator' does not exist on type... Remove this comment to see the full error message
        $.variableOperator = $.RULE('variableOperator', () => {
            // @ts-expect-error TS(2339): Property 'OR4' does not exist on type 'MacroParser... Remove this comment to see the full error message
            $.OR4([
                // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                { ALT: () => $.CONSUME(Tokens.Var.Operators.Increment, { LABEL: 'Var.operator' }) },
                // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                { ALT: () => $.CONSUME(Tokens.Var.Operators.Decrement, { LABEL: 'Var.operator' }) },
                {
                    ALT: () => {
                        // @ts-expect-error TS(2339): Property 'OR5' does not exist on type 'MacroParser... Remove this comment to see the full error message
                        $.OR5([
                            // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.NullishCoalescingEquals, { LABEL: 'Var.operator' }) },
                            // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.NullishCoalescing, { LABEL: 'Var.operator' }) },
                            // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.LogicalOrEquals, { LABEL: 'Var.operator' }) },
                            // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.LogicalOr, { LABEL: 'Var.operator' }) },
                            // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.MinusEquals, { LABEL: 'Var.operator' }) },
                            // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.DoubleEquals, { LABEL: 'Var.operator' }) },
                            // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.NotEquals, { LABEL: 'Var.operator' }) },
                            // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.GreaterThanOrEqual, { LABEL: 'Var.operator' }) },
                            // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.GreaterThan, { LABEL: 'Var.operator' }) },
                            // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.LessThanOrEqual, { LABEL: 'Var.operator' }) },
                            // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.LessThan, { LABEL: 'Var.operator' }) },
                            // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.PlusEquals, { LABEL: 'Var.operator' }) },
                            // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.Equals, { LABEL: 'Var.operator' }) },
                        ]);
                        // @ts-expect-error TS(2339): Property 'SUBRULE' does not exist on type 'MacroPa... Remove this comment to see the full error message
                        $.SUBRULE($.variableValue, { LABEL: 'Var.value' });
                    },
                },
            ]);
        });

        // Variable value: everything after = or += until the end
        // Can contain nested macros and any other tokens
        // @ts-expect-error TS(2339): Property 'variableValue' does not exist on type 'M... Remove this comment to see the full error message
        $.variableValue = $.RULE('variableValue', () => {
            // @ts-expect-error TS(2339): Property 'MANY2' does not exist on type 'MacroPars... Remove this comment to see the full error message
            $.MANY2(() => {
                // @ts-expect-error TS(2339): Property 'OR5' does not exist on type 'MacroParser... Remove this comment to see the full error message
                $.OR5([
                    // @ts-expect-error TS(2339): Property 'SUBRULE' does not exist on type 'MacroPa... Remove this comment to see the full error message
                    { ALT: () => $.SUBRULE($.macro) }, // Nested macros
                    // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                    { ALT: () => $.CONSUME(Tokens.Identifier) },
                    // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                    { ALT: () => $.CONSUME(Tokens.Unknown) },
                ]);
            });
        });

        // Arguments Parsing
        // @ts-expect-error TS(2339): Property 'arguments' does not exist on type 'Macro... Remove this comment to see the full error message
        $.arguments = $.RULE('arguments', () => {
            // @ts-expect-error TS(2339): Property 'OR' does not exist on type 'MacroParser'... Remove this comment to see the full error message
            $.OR([
                {
                    ALT: () => {
                        // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                        $.CONSUME(Tokens.Args.DoubleColon, { LABEL: 'separator' });
                        // @ts-expect-error TS(2339): Property 'AT_LEAST_ONE_SEP' does not exist on type... Remove this comment to see the full error message
                        $.AT_LEAST_ONE_SEP({
                            SEP: Tokens.Args.DoubleColon,
                            // @ts-expect-error TS(2339): Property 'SUBRULE' does not exist on type 'MacroPa... Remove this comment to see the full error message
                            DEF: () => $.SUBRULE($.argument, { LABEL: 'argument' }),
                        });
                    },
                },
                {
                    ALT: () => {
                        // @ts-expect-error TS(2339): Property 'OPTION' does not exist on type 'MacroPar... Remove this comment to see the full error message
                        $.OPTION(() => {
                            // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                            $.CONSUME(Tokens.Args.Colon, { LABEL: 'separator' });
                        });
                        // @ts-expect-error TS(2339): Property 'SUBRULE' does not exist on type 'MacroPa... Remove this comment to see the full error message
                        $.SUBRULE($.argumentAllowingColons, { LABEL: 'argument' });
                    },
                    // So, this is a bit hacky. But implemented below, the argument capture does explicitly exclude double colons
                    // from being captured as the first token. The potential ambiguity chevrotain claims here is not possible.
                    // It says stuff like <Args.DoubleColon, Identifier/Macro/Unknown> is possible in both branches, but it is not.
                    IGNORE_AMBIGUITIES: true,
                },
            ]);
        });

        // List the argument tokens here, as we need two rules, one to be able to parse with double colons and one without
        const validArgumentTokens = [
            // @ts-expect-error TS(2339): Property 'SUBRULE' does not exist on type 'MacroPa... Remove this comment to see the full error message
            { ALT: () => $.SUBRULE($.macro) }, // Nested Macros
            // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
            { ALT: () => $.CONSUME(Tokens.Identifier) },
            // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
            { ALT: () => $.CONSUME(Tokens.Unknown) },
            // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
            { ALT: () => $.CONSUME(Tokens.Args.Colon) },
            // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
            { ALT: () => $.CONSUME(Tokens.Args.Equals) },
            // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
            { ALT: () => $.CONSUME(Tokens.Args.Quote) },
        ];

        // @ts-expect-error TS(2339): Property 'argument' does not exist on type 'MacroP... Remove this comment to see the full error message
        $.argument = $.RULE('argument', () => {
            // @ts-expect-error TS(2339): Property 'MANY' does not exist on type 'MacroParse... Remove this comment to see the full error message
            $.MANY(() => {
                // @ts-expect-error TS(2339): Property 'OR' does not exist on type 'MacroParser'... Remove this comment to see the full error message
                $.OR([...validArgumentTokens]);
            });
        });
        // @ts-expect-error TS(2339): Property 'argumentAllowingColons' does not exist o... Remove this comment to see the full error message
        $.argumentAllowingColons = $.RULE('argumentAllowingColons', () => {
            // @ts-expect-error TS(2339): Property 'AT_LEAST_ONE' does not exist on type 'Ma... Remove this comment to see the full error message
            $.AT_LEAST_ONE(() => {
                // @ts-expect-error TS(2339): Property 'OR' does not exist on type 'MacroParser'... Remove this comment to see the full error message
                $.OR([
                    ...validArgumentTokens,
                    // @ts-expect-error TS(2339): Property 'CONSUME' does not exist on type 'MacroPa... Remove this comment to see the full error message
                    { ALT: () => $.CONSUME(Tokens.Args.DoubleColon) },
                ]);
            });
        });

        this.performSelfAnalysis();
    }

    /**
     * Parses a document into a CST.
     * @param {string} input
     * @returns {{ cst: CstNode|null, errors: ({ message: string }|ILexingError|IRecognitionException)[] , lexingErrors: ILexingError[], parserErrors: IRecognitionException[] }}
     */
    parseDocument(input) {
        if (!input) {
            return { cst: null, errors: [{ message: 'Input is empty' }], lexingErrors: [], parserErrors: [] };
        }

        const lexingResult = MacroLexer.tokenize(input);

        this.input = lexingResult.tokens;
        const cst = this.document();

        const errors = [
            ...lexingResult.errors,
            ...this.errors,
        ];

        return { cst, errors, lexingErrors: lexingResult.errors, parserErrors: this.errors };
    }

    test(input) {
        const lexingResult = MacroLexer.tokenize(input);
        // "input" is a setter which will reset the parser's state.
        this.input = lexingResult.tokens;
        const cst = this.macro();

        // For testing purposes we need to actually persist the error messages in the object,
        // otherwise the test cases cannot read those, as they don't have access to the exception object type.
        const errors = this.errors.map(x => ({ message: x.message, ...x, stack: x.stack }));

        return { cst, errors: errors };
    }
}

instance = MacroParser.instance;
