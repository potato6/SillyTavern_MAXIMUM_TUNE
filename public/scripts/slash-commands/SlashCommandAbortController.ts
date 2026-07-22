import { AbstractEventTarget } from './AbstractEventTarget.js';

export class SlashCommandAbortController extends AbstractEventTarget {
    /**@type {SlashCommandAbortSignal}*/ signal;

    constructor() {
        super();
        this.signal = new SlashCommandAbortSignal();
    }
    abort(reason = 'No reason.', isQuiet = false) {
        this.signal.isQuiet = isQuiet;
        this.signal.aborted = true;
        // @ts-expect-error TS(2322) FIXME: Type 'string' is not assignable to type 'null'.
        this.signal.reason = reason;
        this.dispatchEvent(new Event('abort'));
    }
    pause(reason = 'No reason.') {
        this.signal.paused = true;
        // @ts-expect-error TS(2322) FIXME: Type 'string' is not assignable to type 'null'.
        this.signal.reason = reason;
        this.dispatchEvent(new Event('pause'));
    }
    continue(reason = 'No reason.') {
        this.signal.paused = false;
        // @ts-expect-error TS(2322) FIXME: Type 'string' is not assignable to type 'null'.
        this.signal.reason = reason;
        this.dispatchEvent(new Event('continue'));
    }
}

export class SlashCommandAbortSignal {
    /**@type {boolean}*/ isQuiet = false;
    /**@type {boolean}*/ paused = false;
    /**@type {boolean}*/ aborted = false;
    /**@type {string}*/ reason = null;
}
