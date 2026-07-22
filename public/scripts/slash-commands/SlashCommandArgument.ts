import { commonEnumProviders } from './SlashCommandCommonEnumsProvider.js';
import { SlashCommandEnumValue } from './SlashCommandEnumValue.js';

/**@readonly*/
/**@enum {string}*/
export const ARGUMENT_TYPE = {
    STRING: 'string',
    NUMBER: 'number',
    RANGE: 'range',
    BOOLEAN: 'bool',
    VARIABLE_NAME: 'varname',
    CLOSURE: 'closure',
    SUBCOMMAND: 'subcommand',
    LIST: 'list',
    DICTIONARY: 'dictionary',
};

export class SlashCommandArgument {
    /**
     * Creates an unnamed argument from a properties object.
     * @param {object} props
     * @param {string} props.description description of the argument
     * @param {ARGUMENT_TYPE|ARGUMENT_TYPE[]} [props.typeList] default: ARGUMENT_TYPE.STRING - list of accepted types (from ARGUMENT_TYPE)
     * @param {boolean} [props.isRequired] default: false - whether the argument is required (false = optional argument)
     * @param {boolean} [props.acceptsMultiple] default: false - whether argument accepts multiple values
     * @param {string|SlashCommandClosure} [props.defaultValue] default value if no value is provided
     * @param {string|SlashCommandEnumValue|(string|SlashCommandEnumValue)[]} [props.enumList] list of accepted values
     * @param {(executor:SlashCommandExecutor, scope:SlashCommandScope)=>SlashCommandEnumValue[]} [props.enumProvider] function that returns auto complete options
     * @param {boolean} [props.forceEnum] default: false - whether the input must match one of the enum values
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'props' implicitly has an 'any' type.
    static fromProps(props) {
        return new SlashCommandArgument(
            props.description,
            props.typeList ?? [ARGUMENT_TYPE.STRING],
            props.isRequired ?? false,
            props.acceptsMultiple ?? false,
            props.defaultValue ?? null,
            props.enumList ?? [],
            props.enumProvider ?? null,
            props.forceEnum ?? false,
        );
    }

    /**@type {string}*/ description;
    /**@type {ARGUMENT_TYPE[]}*/ typeList = [];
    /**@type {boolean}*/ isRequired = false;
    /**@type {boolean}*/ acceptsMultiple = false;
    // @ts-expect-error TS(7008) FIXME: Member 'defaultValue' implicitly has an 'any' type... Remove this comment to see the full error message
    /**@type {string|SlashCommandClosure}*/ defaultValue;
    /**@type {SlashCommandEnumValue[]}*/ enumList = [];
    /**@type {(executor:SlashCommandExecutor, scope:SlashCommandScope)=>SlashCommandEnumValue[]}*/ enumProvider =
        null;
    /**@type {boolean}*/ forceEnum = false;

    /**
     * @param {string} description
     * @param {ARGUMENT_TYPE|ARGUMENT_TYPE[]} types
     * @param isRequired
     * @param acceptsMultiple
     * @param {string|SlashCommandClosure} defaultValue
     * @param {string|SlashCommandEnumValue|(string|SlashCommandEnumValue)[]} enums
     * @param {(executor:SlashCommandExecutor, scope:SlashCommandScope)=>SlashCommandEnumValue[]} enumProvider function that returns auto complete options
     * @param forceEnum
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'description' implicitly has an 'any' ty... Remove this comment to see the full error message
    constructor(
        description,
        types,
        isRequired = false,
        acceptsMultiple = false,
        defaultValue = null,
        enums = [],
        enumProvider = null,
        forceEnum = false,
    ) {
        this.description = description;
        // @ts-expect-error TS(2322) FIXME: Type 'any[]' is not assignable to type 'never[]'.
        this.typeList = types ? (Array.isArray(types) ? types : [types]) : [];
        this.isRequired = isRequired ?? false;
        this.acceptsMultiple = acceptsMultiple ?? false;
        this.defaultValue = defaultValue;
        // @ts-expect-error TS(2322) FIXME: Type 'SlashCommandEnumValue[]' is not assignable t... Remove this comment to see the full error message
        this.enumList = (enums ? (Array.isArray(enums) ? enums : [enums]) : []).map((it) => {
            // @ts-expect-error TS(2358) FIXME: The left-hand side of an 'instanceof' expression m... Remove this comment to see the full error message
            if (it instanceof SlashCommandEnumValue) return it;
            return new SlashCommandEnumValue(it);
        });
        this.enumProvider = enumProvider;
        this.forceEnum = forceEnum;

        // If no enums were set explictly and the type is one where we know possible enum values, we set them here
        // @ts-expect-error TS(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
        if (
            !this.enumList.length &&
            this.typeList.length === 1 &&
            this.typeList.includes(ARGUMENT_TYPE.BOOLEAN)
        )
            this.enumList = commonEnumProviders.boolean()();
    }
}

export class SlashCommandNamedArgument extends SlashCommandArgument {
    /**
     * Creates an unnamed argument from a properties object.
     * @param {object} props
     * @param {string} props.name the argument's name
     * @param {string} props.description description of the argument
     * @param {string[]} [props.aliasList] list of aliases
     * @param {ARGUMENT_TYPE|ARGUMENT_TYPE[]} [props.typeList] default: ARGUMENT_TYPE.STRING - list of accepted types (from ARGUMENT_TYPE)
     * @param {boolean} [props.isRequired] default: false - whether the argument is required (false = optional argument)
     * @param {boolean} [props.acceptsMultiple] default: false - whether argument accepts multiple values
     * @param {string|SlashCommandClosure} [props.defaultValue] default value if no value is provided
     * @param {string|SlashCommandEnumValue|(string|SlashCommandEnumValue)[]} [props.enumList] list of accepted values
     * @param {(executor:SlashCommandExecutor, scope:SlashCommandScope)=>SlashCommandEnumValue[]} [props.enumProvider] function that returns auto complete options
     * @param {boolean} [props.forceEnum] default: false - whether the input must match one of the enum values
     */
    // @ts-expect-error TS(4114) FIXME: This member must have an 'override' modifier becau... Remove this comment to see the full error message
    static fromProps(props) {
        return new SlashCommandNamedArgument(
            props.name,
            props.description,
            props.typeList ?? [ARGUMENT_TYPE.STRING],
            props.isRequired ?? false,
            props.acceptsMultiple ?? false,
            props.defaultValue ?? null,
            props.enumList ?? [],
            props.aliasList ?? [],
            props.enumProvider ?? null,
            props.forceEnum ?? false,
        );
    }

    /**@type {string}*/ name;
    /**@type {string[]}*/ aliasList = [];

    /**
     * @param {string} name
     * @param {string} description
     * @param {ARGUMENT_TYPE|ARGUMENT_TYPE[]} types
     * @param {boolean} [isRequired]
     * @param {boolean} [acceptsMultiple]
     * @param {string|SlashCommandClosure} [defaultValue]
     * @param {string|SlashCommandEnumValue|(string|SlashCommandEnumValue)[]} [enums]
     * @param {string[]} [aliases]
     * @param {(executor:SlashCommandExecutor, scope:SlashCommandScope)=>SlashCommandEnumValue[]} [enumProvider] function that returns auto complete options
     * @param {boolean} [forceEnum]
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
    constructor(
        name,
        description,
        types,
        isRequired = false,
        acceptsMultiple = false,
        defaultValue = null,
        enums = [],
        aliases = [],
        enumProvider = null,
        forceEnum = false,
    ) {
        super(
            description,
            types,
            isRequired,
            acceptsMultiple,
            defaultValue,
            enums,
            enumProvider,
            forceEnum,
        );
        this.name = name;
        this.aliasList = aliases ? (Array.isArray(aliases) ? aliases : [aliases]) : [];
    }
}
