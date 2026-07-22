type EnumType =
    | 'enum'
    | 'command'
    | 'namedArgument'
    | 'variable'
    | 'qr'
    | 'macro'
    | 'number'
    | 'name';

/**
 * Collection of the enum types that can be used with `SlashCommandEnumValue`
 *
 * Contains documentation on which color this will result to
 */
export const enumTypes = {
    enum: 'enum' as EnumType,
    command: 'command' as EnumType,
    namedArgument: 'namedArgument' as EnumType,
    variable: 'variable' as EnumType,
    qr: 'qr' as EnumType,
    macro: 'macro' as EnumType,
    number: 'number' as EnumType,
    name: 'name' as EnumType,

    /**
     * Gets the value of the enum type based on the provided index
     *
     * Can be used to get differing colors or even random colors, by providing the index of a unique set
     * @param {number?} index - The index used to retrieve the enum type
     * @returns {EnumType} The enum type corresponding to the index
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'index' implicitly has an 'any' type.
    getBasedOnIndex(index) {
        const keys = Object.keys(this);
        // @ts-expect-error TS(2538) FIXME: Type 'undefined' cannot be used as an index type.
        return this[keys[(index ?? 0) % keys.length]];
    },
};

export class SlashCommandEnumValue {
    value!: string;
    description: string | null = null;
    type: EnumType = 'enum';
    typeIcon = '◊';
    matchProvider: ((input: string) => boolean | SlashCommandEnumValue[]) | null = null;
    valueProvider: ((input: string) => string) | null = null;
    makeSelectable = false;

    /**
     * A constructor for creating a SlashCommandEnumValue instance.
     * @param {string} value - The value
     * @param {string?} description - Optional description, displayed in a second line
     * @param {EnumType?} type - type of the enum (defining its color)
     * @param {string?} typeIcon - The icon to display (Can be pulled from `enumIcons` for common ones)
     * @param {(input:string)=>boolean?} matchProvider - A custom function to match autocomplete input instead of startsWith/includes/fuzzy. Should only be used for generic options like "any number" or "any string". "input" is the part of the text that is getting auto completed.
     * @param {(input:string)=>string?} valueProvider - A function returning a value to be used in autocomplete instead of the enum value. "input" is the part of the text that is getting auto completed. By default, values with a valueProvider will not be selectable in the autocomplete (with tab/enter).
     * @param {boolean?} makeSelectable - Set to true to make the value selectable (through tab/enter) even though a valueProvider exists.
     */
    constructor(
        value: string,
        description: string | null = null,
        type: EnumType = 'enum',
        typeIcon: string = '◊',
        matchProvider: ((input: string) => boolean | SlashCommandEnumValue[]) | null = null,
        valueProvider: ((input: string) => string) | null = null,
        makeSelectable: boolean = false,
    ) {
        this.value = value;
        this.description = description;
        this.type = type ?? 'enum';
        this.typeIcon = typeIcon;
        this.matchProvider = matchProvider;
        this.valueProvider = valueProvider;
        this.makeSelectable = makeSelectable;
    }

    toString() {
        return this.value;
    }
}
