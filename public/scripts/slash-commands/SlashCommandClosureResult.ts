export class SlashCommandClosureResult {
    /**@type {boolean}*/ interrupt = false;
    // @ts-expect-error TS(7008) FIXME: Member 'pipe' implicitly has an 'any' type.
    /**@type {string}*/ pipe;
    /**@type {boolean}*/ isBreak = false;
    /**@type {boolean}*/ isAborted = false;
    /**@type {boolean}*/ isQuietlyAborted = false;
    // @ts-expect-error TS(7008) FIXME: Member 'abortReason' implicitly has an 'any' type.
    /**@type {string}*/ abortReason;
    /**@type {boolean}*/ isError = false;
    // @ts-expect-error TS(7008) FIXME: Member 'errorMessage' implicitly has an 'any' type... Remove this comment to see the full error message
    /**@type {string}*/ errorMessage;
}
