import { AutoCompleteOption } from '../autocomplete/AutoCompleteOption.js';
// @ts-expect-error TS(6133): 'SlashCommand' is declared but its value is never ... Remove this comment to see the full error message
import { SlashCommand } from './SlashCommand.js';
// @ts-expect-error TS(6133): 'SlashCommandNamedArgument' is declared but its va... Remove this comment to see the full error message
import { SlashCommandNamedArgument } from './SlashCommandArgument.js';

export class SlashCommandNamedArgumentAutoCompleteOption extends AutoCompleteOption {
    /** @type {SlashCommandNamedArgument} */ arg;
    /** @type {SlashCommand} */ cmd;

    /**
     * @param {SlashCommandNamedArgument} arg
     * @param cmd
     */
    constructor(arg, cmd) {
        super(`${arg.name}=`);
        this.arg = arg;
        this.cmd = cmd;
    }


    // @ts-expect-error TS(4114): This member must have an 'override' modifier becau... Remove this comment to see the full error message
    renderItem() {
        const li = this.makeItem(this.name, '⌗', true, [], [], null, `${this.arg.isRequired ? '' : '(optional) '}${this.arg.description ?? ''}`);
        li.setAttribute('data-name', this.name);
        li.setAttribute('data-option-type', 'namedArgument');
        return li;
    }


    // @ts-expect-error TS(4114): This member must have an 'override' modifier becau... Remove this comment to see the full error message
    renderDetails() {
        return this.cmd.renderHelpDetails();
    }
}
