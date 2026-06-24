// @ts-expect-error TS(6133): 'SlashCommandClosure' is declared but its value is... Remove this comment to see the full error message
import { SlashCommandClosure } from './SlashCommandClosure.js';

export class SlashCommandUnnamedArgumentAssignment {
    /** @type {number} */ start;
    /** @type {number} */ end;
    /** @type {string|SlashCommandClosure} */ value;


    constructor() {
    }
}
