import { AutoCompleteOption } from '../autocomplete/AutoCompleteOption.js';
import { SlashCommand } from './SlashCommand.js';
import { SlashCommandEnumValue } from './SlashCommandEnumValue.js';

export class SlashCommandEnumAutoCompleteOption extends AutoCompleteOption {
    /**
     * @param {SlashCommand} cmd
     * @param {SlashCommandEnumValue} enumValue
     * @returns {SlashCommandEnumAutoCompleteOption}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'cmd' implicitly has an 'any' type.
    static from(cmd, enumValue) {
        // @ts-expect-error TS(2339) FIXME: Property 'value' does not exist on type 'never'.
        const mapped = this.valueToOptionMap.find(it => enumValue instanceof it.value)?.option ?? this;
        return new mapped(cmd, enumValue);
    }
    /**@type {{value:(typeof SlashCommandEnumValue), option:(typeof SlashCommandEnumAutoCompleteOption)}[]} */
    static valueToOptionMap = [];
    /**@type {SlashCommand}*/ cmd;
    /**@type {SlashCommandEnumValue}*/ enumValue;


    /**
     * @param {SlashCommand} cmd
     * @param {SlashCommandEnumValue} enumValue
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'cmd' implicitly has an 'any' type.
    constructor(cmd, enumValue) {
        super(enumValue.value, enumValue.typeIcon, enumValue.type, enumValue.matchProvider, enumValue.valueProvider, enumValue.makeSelectable);
        this.cmd = cmd;
        this.enumValue = enumValue;
    }


    // @ts-expect-error TS(4114) FIXME: This member must have an 'override' modifier becau... Remove this comment to see the full error message
    renderItem() {
        // @ts-expect-error TS(2345) FIXME: Argument of type 'null' is not assignable to param... Remove this comment to see the full error message
        const li = this.makeItem(this.name, this.typeIcon, true, [], [], null, this.enumValue.description);
        li.setAttribute('data-name', this.name);
        li.setAttribute('data-option-type', this.type);
        return li;
    }


    // @ts-expect-error TS(4114) FIXME: This member must have an 'override' modifier becau... Remove this comment to see the full error message
    renderDetails() {
        return this.cmd.renderHelpDetails();
    }
}
