import { SlashCommandClosure } from './SlashCommandClosure.js';

export class SlashCommandNamedArgumentAssignment {
    // @ts-expect-error TS(7008) FIXME: Member 'start' implicitly has an 'any' type.
    /** @type {number} */ start;
    // @ts-expect-error TS(7008) FIXME: Member 'end' implicitly has an 'any' type.
    /** @type {number} */ end;
    // @ts-expect-error TS(7008) FIXME: Member 'name' implicitly has an 'any' type.
    /** @type {string} */ name;
    // @ts-expect-error TS(7008) FIXME: Member 'value' implicitly has an 'any' type.
    /** @type {string|SlashCommandClosure} */ value;


    constructor() {
    }
}
