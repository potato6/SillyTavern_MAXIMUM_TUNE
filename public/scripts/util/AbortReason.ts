export class AbortReason {
    reason: string;
    constructor(reason) {
        this.reason = reason;
    }

    toString() {
        return this.reason;
    }
}
