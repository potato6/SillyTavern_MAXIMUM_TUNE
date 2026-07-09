export class AutoCompleteFuzzyScore {
    /**@type {number}*/ start;
    /**@type {number}*/ longestConsecutive;

    /**
     * @param {number} start
     * @param {number} longestConsecutive
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'start' implicitly has an 'any' type.
    constructor(start, longestConsecutive) {
        this.start = start;
        this.longestConsecutive = longestConsecutive;
    }
}
