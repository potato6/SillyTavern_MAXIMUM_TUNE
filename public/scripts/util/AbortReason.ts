export class AbortReason {
    reason: any;
    constructor(reason) {
        this.reason = reason;
    }

    toString() {
        return this.reason;
    }
}
