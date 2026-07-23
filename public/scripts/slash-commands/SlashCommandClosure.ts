import { substituteParams } from '../../script.js';
import { delay, uuidv4 } from '../utils.js';
import { SlashCommandBreak } from './SlashCommandBreak.js';
import { SlashCommandBreakPoint } from './SlashCommandBreakPoint.js';
import { SlashCommandClosureResult } from './SlashCommandClosureResult.js';
import { SlashCommandExecutionError } from './SlashCommandExecutionError.js';
import { SlashCommandScope } from './SlashCommandScope.js';

export class SlashCommandClosure {
    /** @type {SlashCommandScope} */ scope;
    /** @type {boolean} */ executeNow = false;
    /** @type {SlashCommandNamedArgumentAssignment[]} */ argumentList = [];
    /** @type {SlashCommandNamedArgumentAssignment[]} */ providedArgumentList = [];
    /** @type {SlashCommandExecutor[]} */ executorList = [];
    // @ts-expect-error TS(7008) FIXME: Member 'abortController' implicitly has an 'any' t... Remove this comment to see the full error message
    /** @type {SlashCommandAbortController} */ abortController;
    // @ts-expect-error TS(7008) FIXME: Member 'breakController' implicitly has an 'any' t... Remove this comment to see the full error message
    /** @type {SlashCommandBreakController} */ breakController;
    // @ts-expect-error TS(7008) FIXME: Member 'debugController' implicitly has an 'any' t... Remove this comment to see the full error message
    /** @type {SlashCommandDebugController} */ debugController;
    // @ts-expect-error TS(7008) FIXME: Member 'onProgress' implicitly has an 'any' type.
    /** @type {(done:number, total:number)=>void} */ onProgress;
    // @ts-expect-error TS(7008) FIXME: Member 'rawText' implicitly has an 'any' type.
    /** @type {string} */ rawText;
    // @ts-expect-error TS(7008) FIXME: Member 'fullText' implicitly has an 'any' type.
    /** @type {string} */ fullText;
    // @ts-expect-error TS(7008) FIXME: Member 'parserContext' implicitly has an 'any' typ... Remove this comment to see the full error message
    /** @type {string} */ parserContext;
    /** @type {string} */ #source = uuidv4();
    get source() {
        return this.#source;
    }
    set source(value) {
        this.#source = value;
        for (const executor of this.executorList) {
            // @ts-expect-error TS(2339) FIXME: Property 'source' does not exist on type 'never'.
            executor.source = value;
        }
    }

    /**@type {number}*/
    get commandCount() {
        return this.executorList
// @ts-expect-error TS(2339) FIXME: Property 'map' does not exist on type.
            .map((executor) => executor.commandCount)
            .reduce((sum, cur) => sum + cur, 0);
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'parent' implicitly has an 'any' type.
    constructor(parent) {
        this.scope = new SlashCommandScope(parent);
    }

    toString() {
        return `[Closure]${this.executeNow ? '()' : ''}`;
    }

    /**
     * Performs parameter substitution using the macro engine.
     * @param {string} text Text to substitute
     * @param {SlashCommandScope} scope Script scope
     * @param {{key:string, value:string|SlashCommandClosure}[]} macroList Custom scope macros
     * @returns {string|SlashCommandClosure|(string|SlashCommandClosure)[]} Substituted text or list of strings/closures
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'text' implicitly has an 'any' type.
    substituteWithMacroEngine(text, scope, macroList) {
        /** @type {Record<string, import('./../macros/engine/MacroEnv.types.js').DynamicMacroValue>} */
        const dynamicMacros = {
            pipe: () => scope.pipe,
            var: {
                strictArgs: false,
                list: { min: 1, max: 2 },
                // @ts-expect-error TS(7006) FIXME: Parameter 'context' implicitly has an 'any' type.
                handler: (context) => {
                    try {
                        // NB: Legacy replacer halted the script execution on unknown variables
                        return scope.getVariable(context.list[0], context.list[1]);
                    } catch (error) {
                        console.warn('{{var}} dynamic macro execution error:', error);
                        return '';
                    }
                },
            },
        };

        // Special marker to denote closures in the substituted text
        const CLOSURE_BOUNDARY = '\uFFF0~CLOSURE~\uFFF0';
        /** @type {Map<string, SlashCommandClosure>} */
        const closures = new Map();
        /** @type {Record<string, { args: string[], value: string|SlashCommandClosure }[]>} */
        const customMacros = {};

        for (const macro of macroList) {
            const [name, ...rest] = macro.key.split('::');
            if (!Object.hasOwn(customMacros, name)) {
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                customMacros[name] = [];
            }
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            customMacros[name].push({ args: rest, value: macro.value });
        }

        for (const [macroName, macroArguments] of Object.entries(customMacros)) {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            dynamicMacros[macroName] = {
                strictArgs: false,
                list: { min: 0, max: Number.MAX_SAFE_INTEGER },
                // @ts-expect-error TS(7006) FIXME: Parameter 'context' implicitly has an 'any' type.
                handler: (context) => {
                    // Sort to prefer exact matches over wildcard matches
                    // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                    const sortedMacroArgs = macroArguments.toSorted((a, b) => {
                        const aHasWildcard = a.args.includes('*');
                        const bHasWildcard = b.args.includes('*');
                        if (aHasWildcard && !bHasWildcard) return 1;
                        if (!aHasWildcard && bHasWildcard) return -1;
                        return 0;
                    });

                    // @ts-expect-error TS(7006) FIXME: Parameter 'i' implicitly has an 'any' type.
                    const findMacroMatch = (/** @type {{args: string[]}} */ i) => {
                        // Exact match
                        if (
                            i.args.length === context.list.length &&
// @ts-expect-error TS(7006) FIXME: Parameter 'arg' implicitly has an 'any' type.
                            i.args.every((arg, index) => arg === context.list[index])
                        ) {
                            return true;
                        }
                        // Wildcard match - if any definition arg is '*', it matches any value at that position
                        if (i.args.length === context.list.length) {
                            return i.args.every(
// @ts-expect-error TS(7006) FIXME: Parameter 'arg' implicitly has an 'any' type.
                                (arg, index) => arg === '*' || arg === context.list[index],
                            );
                        }
                        return false;
                    };

                    const replacer = sortedMacroArgs.find(findMacroMatch)?.value;
                    if (replacer instanceof SlashCommandClosure) {
                        replacer.abortController = this.abortController;
                        replacer.breakController = this.breakController;
                        replacer.scope.parent = this.scope;
                        if (this.debugController && !replacer.debugController) {
                            replacer.debugController = this.debugController;
                        }

                        const closureKey = uuidv4();
                        closures.set(closureKey, replacer);
                        return `${CLOSURE_BOUNDARY}${closureKey}${CLOSURE_BOUNDARY}`;
                    }

                    return String(replacer ?? '');
                },
            };
        }

        const substitutedText = substituteParams(text, { dynamicMacros });

        // If any closures were inserted, split the text accordingly
        if (closures.size > 0) {
            const parts = substitutedText
                .split(CLOSURE_BOUNDARY)
// @ts-expect-error TS(7006) FIXME: Parameter 'part' implicitly has an 'any' type.
                .map((part) => (closures.has(part) ? closures.get(part) : part))
                .filter(Boolean);
            return parts.length === 1 ? parts[0] : parts;
        }

        // No closures, return substituted text as-is
        return substitutedText;
    }

    /**
     *
     * @param {string} text
     * @param {SlashCommandScope} scope
     * @returns {string|SlashCommandClosure|(string|SlashCommandClosure)[]}
     */
    // @ts-expect-error TS(7023) FIXME: 'substituteParams' implicitly has return type 'any... Remove this comment to see the full error message
    substituteParams(text, scope = null) {
        // @ts-expect-error TS(2322) FIXME: Type 'SlashCommandScope' is not assignable to type... Remove this comment to see the full error message
        scope = scope ?? this.scope;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const macroList = scope.macroList.toSorted((a, b) => {
            if (a.key.includes('*') && !b.key.includes('*')) return 1;
            if (!a.key.includes('*') && b.key.includes('*')) return -1;
            if (a.key.includes('*') && b.key.includes('*'))
                return b.key.indexOf('*') - a.key.indexOf('*');
            return 0;
        });
        return this.substituteWithMacroEngine(text, scope, macroList);
    }

    getCopy() {
        // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
        const closure = new SlashCommandClosure();
        closure.scope = this.scope.getCopy();
        closure.executeNow = this.executeNow;
        closure.argumentList = this.argumentList;
        closure.providedArgumentList = this.providedArgumentList;
        closure.executorList = this.executorList;
        closure.abortController = this.abortController;
        closure.breakController = this.breakController;
        closure.debugController = this.debugController;
        closure.rawText = this.rawText;
        closure.fullText = this.fullText;
        closure.parserContext = this.parserContext;
        closure.source = this.source;
        closure.onProgress = this.onProgress;
        return closure;
    }

    /**
     *
     * @returns {Promise<SlashCommandClosureResult>}
     */
    async execute() {
        // execute a copy of the closure to no taint it and its scope with the effects of its execution
        // as this would affect the closure being called a second time (e.g., loop, multiple /run calls)
        const closure = this.getCopy();
        const gen = closure.executeDirect();
        let step;
        while (!step?.done) {
            step = await gen.next(this.debugController?.testStepping(this) ?? false);
            if (!(step.value instanceof SlashCommandClosureResult) && this.debugController) {
                this.debugController.isStepping = await this.debugController.awaitBreakPoint(
                    step.value.closure,
                    step.value.executor,
                );
            }
        }
        return step.value;
    }

    async *executeDirect() {
        this.debugController?.down(this);
        // closure arguments
        for (const arg of this.argumentList) {
            // @ts-expect-error TS(2339) FIXME: Property 'value' does not exist on type 'never'.
            let v = arg.value;
            if (v instanceof SlashCommandClosure) {
                /**@type {SlashCommandClosure}*/
                const closure = v;
                closure.scope.parent = this.scope;
                closure.breakController = this.breakController;
                if (closure.executeNow) {
                    v = (await closure.execute())?.pipe;
                } else {
                    v = closure;
                }
            } else {
                v = this.substituteParams(v);
            }
            // unescape value
            if (typeof v === 'string') {
                v = v?.replace(/\\\{/g, '{')?.replace(/\\\}/g, '}');
            }
            // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
            this.scope.letVariable(arg.name, v);
        }
        for (const arg of this.providedArgumentList) {
            // @ts-expect-error TS(2339) FIXME: Property 'value' does not exist on type 'never'.
            let v = arg.value;
            if (v instanceof SlashCommandClosure) {
                /**@type {SlashCommandClosure}*/
                const closure = v;
                closure.scope.parent = this.scope;
                closure.breakController = this.breakController;
                if (closure.executeNow) {
                    v = (await closure.execute())?.pipe;
                } else {
                    v = closure;
                }
            } else {
                v = this.substituteParams(v, this.scope.parent);
            }
            // unescape value
            if (typeof v === 'string') {
                v = v?.replace(/\\\{/g, '{')?.replace(/\\\}/g, '}');
            }
            // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
            this.scope.setVariable(arg.name, v);
        }

        if (this.executorList.length == 0) {
            this.scope.pipe = '';
        }
        const stepper = this.executeStep();
        let step;
        while (!step?.done && !this.breakController?.isBreak) {
            // get executor before execution
            step = await stepper.next();
            if (step.value instanceof SlashCommandBreakPoint) {
                console.log('encountered SlashCommandBreakPoint');
                if (this.debugController) {
                    // resolve args
                    step = await stepper.next();
                    // "execute" breakpoint
                    step = await stepper.next();
                    // get next executor
                    step = await stepper.next();
                    // breakpoint has to yield before arguments are resolved if one of the
                    // arguments is an immediate closure, otherwise you cannot step into the
                    // immediate closure
                    const hasImmediateClosureInNamedArgs = /**@type {SlashCommandExecutor}*/ (
                        step.value
// @ts-expect-error TS(2339) FIXME: Property 'namedArgumentList' does not exist on type.
                    )?.namedArgumentList?.find(
// @ts-expect-error TS(7006) FIXME: Parameter 'it' implicitly has an 'any' type.
                        (it) => it.value instanceof SlashCommandClosure && it.value.executeNow,
                    );
                    const hasImmediateClosureInUnnamedArgs = /**@type {SlashCommandExecutor}*/ (
                        step.value
// @ts-expect-error TS(2339) FIXME: Property 'unnamedArgumentList' does not exist on type.
                    )?.unnamedArgumentList?.find(
// @ts-expect-error TS(7006) FIXME: Parameter 'it' implicitly has an 'any' type.
                        (it) => it.value instanceof SlashCommandClosure && it.value.executeNow,
                    );
                    if (hasImmediateClosureInNamedArgs || hasImmediateClosureInUnnamedArgs) {
                        // @ts-expect-error TS(7057) FIXME: 'yield' expression implicitly results in an 'any' ... Remove this comment to see the full error message
                        this.debugController.isStepping = yield {
                            closure: this,
                            executor: step.value,
                        };
                    } else {
                        this.debugController.isStepping = true;
                        this.debugController.stepStack[this.debugController.stepStack.length - 1] =
                            true;
                    }
                }
            } else if (!step.done && this.debugController?.testStepping(this)) {
                this.debugController.isSteppingInto = false;
                // if stepping, have to yield before arguments are resolved if one of the arguments
                // is an immediate closure, otherwise you cannot step into the immediate closure
                const hasImmediateClosureInNamedArgs = /**@type {SlashCommandExecutor}*/ (
                    step.value
// @ts-expect-error TS(2339) FIXME: Property 'namedArgumentList' does not exist on type.
                )?.namedArgumentList?.find(
// @ts-expect-error TS(7006) FIXME: Parameter 'it' implicitly has an 'any' type.
                    (it) => it.value instanceof SlashCommandClosure && it.value.executeNow,
                );
                const hasImmediateClosureInUnnamedArgs = /**@type {SlashCommandExecutor}*/ (
                    step.value
// @ts-expect-error TS(2339) FIXME: Property 'unnamedArgumentList' does not exist on type.
                )?.unnamedArgumentList?.find(
// @ts-expect-error TS(7006) FIXME: Parameter 'it' implicitly has an 'any' type.
                    (it) => it.value instanceof SlashCommandClosure && it.value.executeNow,
                );
                if (hasImmediateClosureInNamedArgs || hasImmediateClosureInUnnamedArgs) {
                    // @ts-expect-error TS(7057) FIXME: 'yield' expression implicitly results in an 'any' ... Remove this comment to see the full error message
                    this.debugController.isStepping = yield { closure: this, executor: step.value };
                }
            }
            // resolve args
            step = await stepper.next();
            if (step.value instanceof SlashCommandBreak) {
                console.log('encountered SlashCommandBreak');
                if (this.breakController) {
                    this.breakController?.break();
                    break;
                }
            } else if (!step.done && this.debugController?.testStepping(this)) {
                this.debugController.isSteppingInto = false;
                // @ts-expect-error TS(7057) FIXME: 'yield' expression implicitly results in an 'any' ... Remove this comment to see the full error message
                this.debugController.isStepping = yield { closure: this, executor: step.value };
            }
            // execute executor
            step = await stepper.next();
        }

        // if execution has returned a closure result, return that (should only happen on abort)
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        if (step.value instanceof SlashCommandClosureResult) {
            this.debugController?.up();
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            return step.value;
        }
        /**@type {SlashCommandClosureResult} */
        const result = Object.assign(new SlashCommandClosureResult(), {
            pipe: this.scope.pipe,
            isBreak: this.breakController?.isBreak ?? false,
        });
        this.debugController?.up();
        return result;
    }
    /**
     * Generator that steps through the executor list.
     * Every executor is split into three steps:
     *  - before arguments are resolved
     *  - after arguments are resolved
     *  - after execution
     */
    async *executeStep() {
        let done = 0;
        let isFirst = true;
        for (const executor of this.executorList) {
            this.onProgress?.(done, this.commandCount);
            if (this.debugController) {
                this.debugController.setExecutor(executor);
                this.debugController.namedArguments = undefined;
                this.debugController.unnamedArguments = undefined;
            }
            // yield before doing anything with this executor, the debugger might want to do
            // something with it (e.g., breakpoint, immediate closures that need resolving
            // or stepping into)
            yield executor;
            /**@type {import('./SlashCommand.js').NamedArguments} */
            const args = {
                _scope: this.scope,
                // @ts-expect-error TS(2339) FIXME: Property 'parserFlags' does not exist on type 'nev... Remove this comment to see the full error message
                _parserFlags: executor.parserFlags,
                _abortController: this.abortController,
                _debugController: this.debugController,
                // @ts-expect-error TS(2339) FIXME: Property 'unnamedArgumentList' does not exist on t... Remove this comment to see the full error message
                _hasUnnamedArgument: executor.unnamedArgumentList.length > 0,
            };
            // @ts-expect-error TS(2358) FIXME: The left-hand side of an 'instanceof' expression m... Remove this comment to see the full error message
            if (executor instanceof SlashCommandBreakPoint) {
                // nothing to do for breakpoints, just raise counter and yield for "before exec"
                done++;
                yield executor;
                isFirst = false;
                // @ts-expect-error TS(2358) FIXME: The left-hand side of an 'instanceof' expression m... Remove this comment to see the full error message
            } else if (executor instanceof SlashCommandBreak) {
                // /break need to resolve the unnamed arg and put it into pipe, then yield
                // for "before exec"
                const value = await this.substituteUnnamedArgument(executor, isFirst, args);
                done += this.executorList.length - this.executorList.indexOf(executor);
                this.scope.pipe = value ?? this.scope.pipe;
                yield executor;
                isFirst = false;
            } else {
                // regular commands do all the argument resolving logic...
                await this.substituteNamedArguments(executor, args);
                const value = await this.substituteUnnamedArgument(executor, isFirst, args);

                let abortResult = await this.testAbortController();
                if (abortResult) {
                    return abortResult;
                }
                if (this.debugController) {
                    this.debugController.namedArguments = args;
                    this.debugController.unnamedArguments = value ?? '';
                }
                // then yield for "before exec"
                yield executor;
                // followed by command execution
                // @ts-expect-error TS(2339) FIXME: Property 'onProgress' does not exist on type 'neve... Remove this comment to see the full error message
                executor.onProgress = (subDone, subTotal) =>
                    this.onProgress?.(done + subDone, this.commandCount);
                const isStepping = this.debugController?.testStepping(this);
                if (this.debugController) {
                    this.debugController.isStepping = this.debugController.isSteppingInto;
                }
                try {
                    // @ts-expect-error TS(2339) FIXME: Property 'command' does not exist on type 'never'.
                    this.scope.pipe = await executor.command.callback(args, value ?? '');
                } catch (ex) {
                    throw new SlashCommandExecutionError(
                        ex,
// @ts-expect-error TS(18046) FIXME: 'ex' is of type 'unknown'.
                        ex.message,
// @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type.
                        executor.name,
// @ts-expect-error TS(2339) FIXME: Property 'start' does not exist on type.
                        executor.start,
// @ts-expect-error TS(2339) FIXME: Property 'end' does not exist on type.
                        executor.end,
// @ts-expect-error TS(2339) FIXME: Property 'fullText' does not exist on type.
                        this.fullText.slice(executor.start, executor.end),
                        this.fullText,
                    );
                }
                if (this.debugController) {
                    this.debugController.namedArguments = undefined;
                    this.debugController.unnamedArguments = undefined;
                    this.debugController.isStepping = isStepping;
                }
                // @ts-expect-error TS(2339) FIXME: Property 'command' does not exist on type 'never'.
                this.#lintPipe(executor.command);
                // @ts-expect-error TS(2339) FIXME: Property 'commandCount' does not exist on type 'ne... Remove this comment to see the full error message
                done += executor.commandCount;
                this.onProgress?.(done, this.commandCount);
                abortResult = await this.testAbortController();
                if (abortResult) {
                    return abortResult;
                }
            }
            // finally, yield for "after exec"
            yield executor;
            isFirst = false;
        }
    }

    async testPaused() {
        while (!this.abortController?.signal?.aborted && this.abortController?.signal?.paused) {
            await delay(200);
        }
    }
    async testAbortController() {
        await this.testPaused();
        if (this.abortController?.signal?.aborted) {
            const result = new SlashCommandClosureResult();
            result.isAborted = true;
            result.isQuietlyAborted = this.abortController.signal.isQuiet;
            result.abortReason = this.abortController.signal.reason.toString();
            return result;
        }
    }

    /**
     * @param {SlashCommandExecutor} executor
     * @param {import('./SlashCommand.js').NamedArguments} args
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'executor' implicitly has an 'any' type.
    async substituteNamedArguments(executor, args) {
        /**
         * Handles the assignment of named arguments, considering if they accept multiple values
         * @param {string} name The name of the argument, as defined for the command execution
         * @param {string|SlashCommandClosure|(string|SlashCommandClosure)[]} value The value to be assigned
         */
        // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
        const assign = (name, value) => {
            // If an array is supposed to be assigned, assign it one by one
            if (Array.isArray(value)) {
                for (const val of value) {
                    assign(name, val);
                }
                return;
            }

            // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
            const definition = executor.command.namedArgumentList.find((x) => x.name == name);

            // Prefer definition name if a valid named args defintion is found
            name = definition?.name ?? name;

            // Unescape named argument
            if (value && typeof value === 'string') {
                value = value.replace(/\\\{/g, '{').replace(/\\\}/g, '}');
            }

            // If the named argument accepts multiple values, we have to make sure to build an array correctly
            if (definition?.acceptsMultiple) {
                if (args[name] !== undefined) {
                    // If there already is something for that named arg, make the value is an array and add to it
                    let currentValue = args[name];
                    if (!Array.isArray(currentValue)) {
                        currentValue = [currentValue];
                    }
                    currentValue.push(value);
                    args[name] = currentValue;
                } else {
                    // If there is nothing in there, we create an array with that singular value
                    args[name] = [value];
                }
            } else {
                if (args[name] !== undefined)
                    console.debug(`Named argument assigned multiple times: ${name}`);
                args[name] = value;
            }
        };

        // substitute named arguments
        for (const arg of executor.namedArgumentList) {
            if (arg.value instanceof SlashCommandClosure) {
                /**@type {SlashCommandClosure}*/
                const closure = arg.value;
                closure.scope.parent = this.scope;
                closure.breakController = this.breakController;
                if (this.debugController && !closure.debugController) {
                    closure.debugController = this.debugController;
                }
                if (closure.executeNow) {
                    assign(arg.name, (await closure.execute())?.pipe);
                } else {
                    assign(arg.name, closure);
                }
            } else {
                assign(arg.name, this.substituteParams(arg.value));
            }
        }
    }

    /**
     * @param {SlashCommandExecutor} executor
     * @param {boolean} isFirst
     * @param {import('./SlashCommand.js').NamedArguments} args
     * @returns {Promise<string|SlashCommandClosure|(string|SlashCommandClosure)[]>}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'executor' implicitly has an 'any' type.
    async substituteUnnamedArgument(executor, isFirst, args) {
        let value;
        // substitute unnamed argument
        if (executor.unnamedArgumentList.length == 0) {
            if (!isFirst && executor.injectPipe) {
                value = this.scope.pipe;
                args._hasUnnamedArgument =
                    this.scope.pipe !== null && this.scope.pipe !== undefined;
            }
        } else {
            value = [];
            for (let i = 0; i < executor.unnamedArgumentList.length; i++) {
                /** @type {string|SlashCommandClosure|(string|SlashCommandClosure)[]} */
                let v = executor.unnamedArgumentList[i].value;
                if (v instanceof SlashCommandClosure) {
                    /**@type {SlashCommandClosure}*/
                    const closure = v;
                    closure.scope.parent = this.scope;
                    closure.breakController = this.breakController;
                    if (this.debugController && !closure.debugController) {
                        closure.debugController = this.debugController;
                    }
                    if (closure.executeNow) {
                        v = (await closure.execute())?.pipe;
                    } else {
                        v = closure;
                    }
                } else {
                    v = this.substituteParams(v);
                }
                value[i] = v;
            }
            if (!executor.command.splitUnnamedArgument) {
                if (value.length == 1) {
                    value = value[0];
                } else if (!value.find((it) => it instanceof SlashCommandClosure)) {
                    value = value.join('');
                }
            }
        }
        // unescape unnamed argument
        if (typeof value === 'string') {
            value = value?.replace(/\\\{/g, '{')?.replace(/\\\}/g, '}');
        } else if (Array.isArray(value)) {
            value = value.map((v) => {
                if (typeof v === 'string') {
                    return v?.replace(/\\\{/g, '{')?.replace(/\\\}/g, '}');
                }
                return v;
            });
        }

        value ??= '';

        // Make sure that if unnamed args are split, it should always return an array
        if (executor.command.splitUnnamedArgument && !Array.isArray(value)) {
            value = [value];
        }

        return value;
    }

    /**
     * Auto-fixes the pipe if it is not a valid result for STscript.
     * @param {SlashCommand} command Command being executed
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'command' implicitly has an 'any' type.
    #lintPipe(command) {
        if (this.scope.pipe === undefined || this.scope.pipe === null) {
            console.warn(
                `/${command.name} returned undefined or null. Auto-fixing to empty string.`,
            );
            this.scope.pipe = '';
        } else if (
            !(typeof this.scope.pipe === 'string' || this.scope.pipe instanceof SlashCommandClosure)
        ) {
            console.warn(
                `/${command.name} returned illegal type (${typeof this.scope.pipe} - ${this.scope.pipe.constructor?.name ?? ''}). Auto-fixing to stringified JSON.`,
            );
            this.scope.pipe = JSON.stringify(this.scope.pipe) ?? '';
        }
    }
}
