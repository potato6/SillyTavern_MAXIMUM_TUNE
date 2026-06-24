// @ts-expect-error TS(6133): 'SlashCommand' is declared but its value is never ... Remove this comment to see the full error message
import { SlashCommand } from './SlashCommand.js';
import { AutoCompleteOption } from '../autocomplete/AutoCompleteOption.js';

export class SlashCommandCommandAutoCompleteOption extends AutoCompleteOption {
    /**@type {SlashCommand}*/ command;


    // @ts-expect-error TS(4114): This member must have an 'override' modifier becau... Remove this comment to see the full error message
    get value() {
        return this.command;
    }


    /**
     * @param {SlashCommand} command
     * @param {string} name
     */
    constructor(command, name) {
        super(name);
        this.command = command;
    }


    // @ts-expect-error TS(4114): This member must have an 'override' modifier becau... Remove this comment to see the full error message
    renderItem() {
        let li;
        li = this.command.renderHelpItem(this.name);
        li.setAttribute('data-name', this.name);
        li.setAttribute('data-option-type', 'command');
        return li;
    }


    // @ts-expect-error TS(4114): This member must have an 'override' modifier becau... Remove this comment to see the full error message
    renderDetails() {
        return this.command.renderHelpDetails(this.name);
    }
}
