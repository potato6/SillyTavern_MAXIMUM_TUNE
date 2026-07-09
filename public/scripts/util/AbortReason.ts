export class AbortReason {
    reason: string;
    // @ts-expect-error TS(7006) FIXME: Parameter 'reason' implicitly has an 'any' type.
    constructor(reason) {
        this.reason = reason;
    }

    toString() {
        return this.reason;
    }
}
