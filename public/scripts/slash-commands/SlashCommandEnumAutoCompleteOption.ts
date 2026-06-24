import { AutoCompleteOption } from '../autocomplete/AutoCompleteOption.js';
// @ts-expect-error TS(6133): 'SlashCommand' is declared but its value is never ... Remove this comment to see the full error message
import { SlashCommand } from './SlashCommand.js';
// @ts-expect-error TS(6133): 'SlashCommandEnumValue' is declared but its value ... Remove this comment to see the full error message
import { SlashCommandEnumValue } from './SlashCommandEnumValue.js';

export class SlashCommandEnumAutoCompleteOption extends AutoCompleteOption {
    /**
     * @param {SlashCommand} cmd
     * @param {SlashCommandEnumValue} enumValue
     * @returns {SlashCommandEnumAutoCompleteOption}
     */
    static from(cmd, enumValue) {
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
    constructor(cmd, enumValue) {
        super(enumValue.value, enumValue.typeIcon, enumValue.type, enumValue.matchProvider, enumValue.valueProvider, enumValue.makeSelectable);
        this.cmd = cmd;
        this.enumValue = enumValue;
    }


    // @ts-expect-error TS(4114): This member must have an 'override' modifier becau... Remove this comment to see the full error message
    renderItem() {
        let li;
        li = this.makeItem(this.name, this.typeIcon, true, [], [], null, this.enumValue.description);
        li.setAttribute('data-name', this.name);
        li.setAttribute('data-option-type', this.type);
        return li;
    }


    // @ts-expect-error TS(4114): This member must have an 'override' modifier becau... Remove this comment to see the full error message
    renderDetails() {
        return this.cmd.renderHelpDetails();
    }
}
