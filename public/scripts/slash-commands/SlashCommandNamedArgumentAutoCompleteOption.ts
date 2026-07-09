import { AutoCompleteOption } from '../autocomplete/AutoCompleteOption.js';

export class SlashCommandNamedArgumentAutoCompleteOption extends AutoCompleteOption {
    /** @type {SlashCommandNamedArgument} */ arg;
    /** @type {SlashCommand} */ cmd;

    /**
     * @param {SlashCommandNamedArgument} arg
     * @param cmd
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'arg' implicitly has an 'any' type.
    constructor(arg, cmd) {
        super(`${arg.name}=`);
        this.arg = arg;
        this.cmd = cmd;
    }


    // @ts-expect-error TS(4114) FIXME: This member must have an 'override' modifier becau... Remove this comment to see the full error message
    renderItem() {
        // @ts-expect-error TS(2345) FIXME: Argument of type 'null' is not assignable to param... Remove this comment to see the full error message
        const li = this.makeItem(this.name, '⌗', true, [], [], null, `${this.arg.isRequired ? '' : '(optional) '}${this.arg.description ?? ''}`);
        li.setAttribute('data-name', this.name);
        li.setAttribute('data-option-type', 'namedArgument');
        return li;
    }


    // @ts-expect-error TS(4114) FIXME: This member must have an 'override' modifier becau... Remove this comment to see the full error message
    renderDetails() {
        return this.cmd.renderHelpDetails();
    }
}
