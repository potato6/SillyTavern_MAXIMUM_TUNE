

export class SlashCommandDebugController {
    /** @type {SlashCommandClosure[]} */ stack = [];
    /** @type {SlashCommandExecutor[]} */ cmdStack = [];
    /** @type {boolean[]} */ stepStack = [];
    /** @type {boolean} */ isStepping = false;
    /** @type {boolean} */ isSteppingInto = false;
    /** @type {boolean} */ isSteppingOut = false;

    // @ts-expect-error TS(7008) FIXME: Member 'namedArguments' implicitly has an 'any' ty... Remove this comment to see the full error message
    /** @type {object} */ namedArguments;
    // @ts-expect-error TS(7008) FIXME: Member 'unnamedArguments' implicitly has an 'any' ... Remove this comment to see the full error message
    /** @type {string|SlashCommandClosure|(string|SlashCommandClosure)[]} */ unnamedArguments;

    // @ts-expect-error TS(7008) FIXME: Member 'continuePromise' implicitly has an 'any' t... Remove this comment to see the full error message
    /** @type {Promise<boolean>} */ continuePromise;
    // @ts-expect-error TS(7008) FIXME: Member 'continueResolver' implicitly has an 'any' ... Remove this comment to see the full error message
    /** @type {(boolean)=>void} */ continueResolver;

    // @ts-expect-error TS(7008) FIXME: Member 'onBreakPoint' implicitly has an 'any' type... Remove this comment to see the full error message
    /** @type {(closure:SlashCommandClosure, executor:SlashCommandExecutor)=>Promise<boolean>} */ onBreakPoint;


    // @ts-expect-error TS(7006) FIXME: Parameter 'closure' implicitly has an 'any' type.
    testStepping(closure) {
        // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
        return this.stepStack[this.stack.indexOf(closure)];
    }


    // @ts-expect-error TS(7006) FIXME: Parameter 'closure' implicitly has an 'any' type.
    down(closure) {
        // @ts-expect-error TS(2345) FIXME: Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
        this.stack.push(closure);
        if (this.stepStack.length < this.stack.length) {
            // @ts-expect-error TS(2345) FIXME: Argument of type 'boolean' is not assignable to pa... Remove this comment to see the full error message
            this.stepStack.push(this.isSteppingInto);
        }
    }
    up() {
        this.stack.pop();
        while (this.cmdStack.length > this.stack.length) this.cmdStack.pop();
        this.stepStack.pop();
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'executor' implicitly has an 'any' type.
    setExecutor(executor) {
        // @ts-expect-error TS(2322) FIXME: Type 'any' is not assignable to type 'never'.
        this.cmdStack[this.stack.length - 1] = executor;
    }


    resume() {
        this.continueResolver?.(false);
        this.continuePromise = null;
        // @ts-expect-error TS(2322) FIXME: Type 'boolean' is not assignable to type 'never'.
        this.stepStack.forEach((_, idx) => this.stepStack[idx] = false);
    }
    step() {
        // @ts-expect-error TS(2322) FIXME: Type 'boolean' is not assignable to type 'never'.
        this.stepStack.forEach((_, idx) => this.stepStack[idx] = true);
        this.continueResolver?.(true);
        this.continuePromise = null;
    }
    stepInto() {
        this.isSteppingInto = true;
        // @ts-expect-error TS(2322) FIXME: Type 'boolean' is not assignable to type 'never'.
        this.stepStack.forEach((_, idx) => this.stepStack[idx] = true);
        this.continueResolver?.(true);
        this.continuePromise = null;
    }
    stepOut() {
        this.isSteppingOut = true;
        // @ts-expect-error TS(2322) FIXME: Type 'boolean' is not assignable to type 'never'.
        this.stepStack[this.stepStack.length - 1] = false;
        this.continueResolver?.(false);
        this.continuePromise = null;
    }

    async awaitContinue() {
        this.continuePromise ??= new Promise(resolve => {
            this.continueResolver = resolve;
        });
        this.isStepping = await this.continuePromise;
        return this.isStepping;
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'closure' implicitly has an 'any' type.
    async awaitBreakPoint(closure, executor) {
        this.isStepping = await this.onBreakPoint(closure, executor);
        return this.isStepping;
    }
}
