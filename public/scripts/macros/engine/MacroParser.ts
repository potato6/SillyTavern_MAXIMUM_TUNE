import { chevrotain } from '../../../lib.js';
import { MacroLexer } from './MacroLexer.js';

// Import Lexer directly from chevrotain to handle tokenizing when needed
const { CstParser, Lexer } = chevrotain;

/** @typedef {import('chevrotain').TokenType} TokenType */
/** @typedef {import('chevrotain').CstNode} CstNode */
/** @typedef {import('chevrotain').ILexingError} ILexingError */
/** @typedef {import('chevrotain').IRecognitionException} IRecognitionException */

/**
 * The singleton instance of the MacroParser.
 * @type {MacroParser}
 */
// The singleton instance is assigned after the class definition to handle circular references
// eslint-disable-next-line prefer-const
let instance: MacroParser;
export { instance as MacroParser };

class MacroParser extends CstParser {
    // @ts-expect-error TS(2564) FIXME: Property 'document' has no initializer and is not ... Remove this comment to see the full error message
    document: () => unknown;
    // @ts-expect-error TS(2564) FIXME: Property 'macro' has no initializer and is not def... Remove this comment to see the full error message
    macro: () => unknown;
    // @ts-expect-error TS(2564) FIXME: Property 'macroBody' has no initializer and is not... Remove this comment to see the full error message
    macroBody: () => unknown;
    // @ts-expect-error TS(2564) FIXME: Property 'variableExpr' has no initializer and is ... Remove this comment to see the full error message
    variableExpr: () => unknown;
    // @ts-expect-error TS(2564) FIXME: Property 'variableOperator' has no initializer and... Remove this comment to see the full error message
    variableOperator: () => unknown;
    // @ts-expect-error TS(2564) FIXME: Property 'variableValue' has no initializer and is... Remove this comment to see the full error message
    variableValue: () => unknown;
    // @ts-expect-error TS(2564) FIXME: Property 'arguments' has no initializer and is not... Remove this comment to see the full error message
    arguments: () => unknown;
    // @ts-expect-error TS(2564) FIXME: Property 'argument' has no initializer and is not ... Remove this comment to see the full error message
    argument: () => unknown;
    // @ts-expect-error TS(2564) FIXME: Property 'argumentAllowingColons' has no initializ... Remove this comment to see the full error message
    argumentAllowingColons: () => unknown;

    // @ts-expect-error TS(2694) FIXME: Namespace '"/mnt/DISCO/downloads/some_git_projects... Remove this comment to see the full error message
    lexerInstance: import('./MacroLexer.js').MacroLexer | null; // Used to cache the Lexer locally

    /** @type {MacroParser} */ static #instance: MacroParser;
    /** @type {MacroParser} */ static get instance() { return MacroParser.#instance ?? (MacroParser.#instance = new MacroParser()); }

    /** @private */
    constructor() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        super((MacroLexer as any).def, {
            traceInitPerf: false,
            nodeLocationTracking: 'full',
            recoveryEnabled: true,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Tokens = (MacroLexer as any).tokens;

        // eslint-disable-next-line @typescript-eslint/no-this-alias, @typescript-eslint/no-explicit-any
        const $: any = this;

        // Top-level document rule that can handle both plaintext and macros
        $.document = $.RULE('document', () => {
            $.MANY(() => {
                $.OR([
                    { ALT: () => $.CONSUME(Tokens.Plaintext, { LABEL: 'plaintext' }) },
                    { ALT: () => $.CONSUME(Tokens.PlaintextOpenBrace, { LABEL: 'plaintext' }) },
                    { ALT: () => $.SUBRULE($.macro) },
                    { ALT: () => $.CONSUME(Tokens.Macro.Start, { LABEL: 'plaintext' }) },
                ]);
            });
        });

        // Basic Macro Structure - can be either a regular macro or a variable expression
        $.macro = $.RULE('macro', () => {
            $.CONSUME(Tokens.Macro.Start);

            // Optional flags before the identifier (e.g., {{!user}}, {{?~macro}}, {{>filtered}})
            // Both regular flags and filter flag are captured under the 'flags' label
            $.MANY(() => {
                $.OR1([
                    { ALT: () => $.CONSUME(Tokens.Macro.Flags, { LABEL: 'flags' }) },
                    { ALT: () => $.CONSUME(Tokens.Macro.FilterFlag, { LABEL: 'flags' }) },
                ]);
            });

            // Branch: either a variable expression (starts with . or $) or a regular macro
            $.OR([
                // Variable expression branch
                { ALT: () => $.SUBRULE($.variableExpr) },
                // Regular macro branch
                { ALT: () => $.SUBRULE($.macroBody) },
            ]);

            $.CONSUME(Tokens.Macro.End);
        });

        // Regular macro body (flags + identifier + optional arguments)
        $.macroBody = $.RULE('macroBody', () => {
            // Macro identifier (name)
            $.OR2([
                { ALT: () => $.CONSUME(Tokens.Macro.DoubleSlash, { LABEL: 'Macro.identifier' }) },
                { ALT: () => $.CONSUME(Tokens.Macro.Identifier, { LABEL: 'Macro.identifier' }) },
            ]);
            $.OPTION(() => $.SUBRULE($.arguments));
        });

        // Variable expression: .varName or $varName with optional operator
        $.variableExpr = $.RULE('variableExpr', () => {
            // Variable scope prefix
            $.OR3([
                { ALT: () => $.CONSUME(Tokens.Var.LocalPrefix, { LABEL: 'Var.scope' }) },
                { ALT: () => $.CONSUME(Tokens.Var.GlobalPrefix, { LABEL: 'Var.scope' }) },
            ]);

            // Variable identifier (name)
            $.CONSUME(Tokens.Var.Identifier, { LABEL: 'Var.identifier' });

            // Optional operator (and expression, if operator requires one)
            $.OPTION2(() => $.SUBRULE($.variableOperator));
        });

        // Variable operator: ++, --, = value, += value, -= value, ||, ??, ||=, ??=, ==, !=, >, >=, <, <=
        $.variableOperator = $.RULE('variableOperator', () => {
            $.OR4([
                { ALT: () => $.CONSUME(Tokens.Var.Operators.Increment, { LABEL: 'Var.operator' }) },
                { ALT: () => $.CONSUME(Tokens.Var.Operators.Decrement, { LABEL: 'Var.operator' }) },
                {
                    ALT: () => {
                        $.OR5([
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.NullishCoalescingEquals, { LABEL: 'Var.operator' }) },
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.NullishCoalescing, { LABEL: 'Var.operator' }) },
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.LogicalOrEquals, { LABEL: 'Var.operator' }) },
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.LogicalOr, { LABEL: 'Var.operator' }) },
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.MinusEquals, { LABEL: 'Var.operator' }) },
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.DoubleEquals, { LABEL: 'Var.operator' }) },
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.NotEquals, { LABEL: 'Var.operator' }) },
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.GreaterThanOrEqual, { LABEL: 'Var.operator' }) },
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.GreaterThan, { LABEL: 'Var.operator' }) },
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.LessThanOrEqual, { LABEL: 'Var.operator' }) },
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.LessThan, { LABEL: 'Var.operator' }) },
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.PlusEquals, { LABEL: 'Var.operator' }) },
                            { ALT: () => $.CONSUME(Tokens.Var.Operators.Equals, { LABEL: 'Var.operator' }) },
                        ]);
                        $.SUBRULE($.variableValue, { LABEL: 'Var.value' });
                    },
                },
            ]);
        });

        // Variable value: everything after = or += until the end
        // Can contain nested macros and any other tokens
        $.variableValue = $.RULE('variableValue', () => {
            $.MANY2(() => {
                $.OR5([
                    { ALT: () => $.SUBRULE($.macro) }, // Nested macros
                    { ALT: () => $.CONSUME(Tokens.Identifier) },
                    { ALT: () => $.CONSUME(Tokens.Unknown) },
                ]);
            });
        });

        // Arguments Parsing
        $.arguments = $.RULE('arguments', () => {
            $.OR([
                {
                    ALT: () => {
                        $.CONSUME(Tokens.Args.DoubleColon, { LABEL: 'separator' });
                        $.AT_LEAST_ONE_SEP({
                            SEP: Tokens.Args.DoubleColon,
                            DEF: () => $.SUBRULE($.argument, { LABEL: 'argument' }),
                        });
                    },
                },
                {
                    ALT: () => {
                        $.OPTION(() => {
                            $.CONSUME(Tokens.Args.Colon, { LABEL: 'separator' });
                        });
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
            { ALT: () => $.SUBRULE($.macro) }, // Nested Macros
            { ALT: () => $.CONSUME(Tokens.Identifier) },
            { ALT: () => $.CONSUME(Tokens.Unknown) },
            { ALT: () => $.CONSUME(Tokens.Args.Colon) },
            { ALT: () => $.CONSUME(Tokens.Args.Equals) },
            { ALT: () => $.CONSUME(Tokens.Args.Quote) },
        ];

        $.argument = $.RULE('argument', () => {
            $.MANY(() => {
                $.OR([...validArgumentTokens]);
            });
        });

        $.argumentAllowingColons = $.RULE('argumentAllowingColons', () => {
            $.AT_LEAST_ONE(() => {
                $.OR([
                    ...validArgumentTokens,
                    { ALT: () => $.CONSUME(Tokens.Args.DoubleColon) },
                ]);
            });
        });

        // @ts-expect-error TS(2339) FIXME: Property 'performSelfAnalysis' does not exist on t... Remove this comment to see the full error message
        this.performSelfAnalysis();
    }

    /**
     * Resolves the tokenization dynamically to avoid transpilation mapping errors
     * @param input
     */
    tokenizeInput(input: string) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lexerAny = MacroLexer as any;

        if (typeof lexerAny.tokenize === 'function') {
            return lexerAny.tokenize(input);
        }
        if (lexerAny.instance && typeof lexerAny.instance.tokenize === 'function') {
            return lexerAny.instance.tokenize(input);
        }

        // As a final robust fallback, recreate the chevrotain Lexer with the token array
        if (!this.lexerInstance) {
            this.lexerInstance = new Lexer(lexerAny.def);
        }
        return this.lexerInstance.tokenize(input);
    }

    /**
     * Parses a document into a CST.
     * @param {string} input
     * @returns {{ cst: CstNode|null, errors: ({ message: string }|ILexingError|IRecognitionException)[] , lexingErrors: ILexingError[], parserErrors: IRecognitionException[] }}
     */
    parseDocument(input: string) {
        if (!input) {
            return { cst: null, errors: [{ message: 'Input is empty' }], lexingErrors: [], parserErrors: [] };
        }

        const lexingResult = this.tokenizeInput(input);

        // @ts-expect-error TS(2339) FIXME: Property 'input' does not exist on type 'MacroPars... Remove this comment to see the full error message
        this.input = lexingResult.tokens;
        const cst = this.document();

        const errors = [
            ...lexingResult.errors,
            // @ts-expect-error TS(2339) FIXME: Property 'errors' does not exist on type 'MacroPar... Remove this comment to see the full error message
            ...this.errors,
        ];

        // @ts-expect-error TS(2339) FIXME: Property 'errors' does not exist on type 'MacroPar... Remove this comment to see the full error message
        return { cst, errors, lexingErrors: lexingResult.errors, parserErrors: this.errors };
    }

    test(input: string) {
        const lexingResult = this.tokenizeInput(input);

        // "input" is a setter which will reset the parser's state.
        // @ts-expect-error TS(2339) FIXME: Property 'input' does not exist on type 'MacroPars... Remove this comment to see the full error message
        this.input = lexingResult.tokens;
        return this.macro();

   }
}

instance = MacroParser.instance;
