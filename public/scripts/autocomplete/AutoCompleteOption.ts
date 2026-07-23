export class AutoCompleteOption {
    /** @type {string} */ name;
    /** @type {string} */ typeIcon;
    /** @type {string} */ type;
    /** @type {number} */ nameOffset = 0;
    // @ts-expect-error TS(7008) FIXME: Member 'score' implicitly has an 'any' type.
    /** @type {AutoCompleteFuzzyScore} */ score;
    // @ts-expect-error TS(7008) FIXME: Member 'replacer' implicitly has an 'any' type.
    /** @type {string} */ replacer;
    // @ts-expect-error TS(7008) FIXME: Member 'dom' implicitly has an 'any' type.
    /** @type {HTMLElement} */ dom;
    // @ts-expect-error TS(7008) FIXME: Member 'matchProvider' implicitly has an 'any' typ... Remove this comment to see the full error message
    /** @type {(input:string)=>boolean} */ matchProvider;
    // @ts-expect-error TS(7008) FIXME: Member 'valueProvider' implicitly has an 'any' typ... Remove this comment to see the full error message
    /** @type {(input:string)=>string} */ valueProvider;
    /** @type {boolean} */ makeSelectable = false;
    /** @type {boolean} */ forceFullNameMatch = false;

    /**
     * Offset to adjust the replacement start position.
     * Negative values start replacement earlier (e.g., -2 to include 2 chars before normal start).
     * Used by closing tag autocomplete to replace leading whitespace.
     * @type {number}
     */
    replacementStartOffset = 0;

    /**
     * Priority for sorting. Lower values = higher priority (sorted first).
     * Default is 100 (normal priority). Use lower values for items that should appear at the top.
     * @type {number}
     */
    sortPriority = 100;

    /**
     * Used as a comparison value when removing duplicates (e.g., when a SlashCommand has aliases).
     * @type {any}
     */
    get value() {
        return this.name;
    }

    get isSelectable() {
        return this.makeSelectable || !this.valueProvider;
    }

    /**
     * @param {string} name
     * @param typeIcon
     * @param type
     * @param matchProvider
     * @param valueProvider
     * @param makeSelectable
     */
    constructor(
        name: any,
        typeIcon = ' ',
        type = '',
        matchProvider = null,
        valueProvider = null,
        makeSelectable = false,
    ) {
        this.name = name;
        this.typeIcon = typeIcon;
        this.type = type;
        this.matchProvider = matchProvider;
        this.valueProvider = valueProvider;
        this.makeSelectable = makeSelectable;
    }

    makeItem(
        key: any,
        typeIcon: any,
        noSlash: any,
        namedArguments = [],
        unnamedArguments = [],
        returnType = 'void',
        helpString = '',
        aliasList = [],
    ) {
        const li = document.createElement('li');
        {
            li.classList.add('item');
            const type = document.createElement('span');
            {
                type.classList.add('type');
                type.classList.add('monospace');
                type.textContent = typeIcon;
                li.append(type);
            }
            const specs = document.createElement('span');
            {
                specs.classList.add('specs');
                const name = document.createElement('span');
                {
                    name.classList.add('name');
                    name.classList.add('monospace');
                    name.textContent = noSlash ? '' : '/';
                    // @ts-expect-error TS(7006) FIXME: Parameter 'char' implicitly has an 'any' type.
                    key.split('').forEach((char) => {
                        const span = document.createElement('span');
                        {
                            span.textContent = char;
                            name.append(span);
                        }
                    });
                    specs.append(name);
                }
                const body = document.createElement('span');
                {
                    body.classList.add('body');
                    const args = document.createElement('span');
                    {
                        args.classList.add('arguments');
                        for (const arg of namedArguments) {
                            const argItem = document.createElement('span');
                            {
                                argItem.classList.add('argument');
                                argItem.classList.add('namedArgument');
                                // @ts-expect-error TS(2339) FIXME: Property 'isRequired' does not exist on type 'neve... Remove this comment to see the full error message
                                if (!arg.isRequired || (arg.defaultValue ?? false))
                                    argItem.classList.add('optional');
                                // @ts-expect-error TS(2339) FIXME: Property 'acceptsMultiple' does not exist on type ... Remove this comment to see the full error message
                                if (arg.acceptsMultiple) argItem.classList.add('multiple');
                                const name = document.createElement('span');
                                {
                                    name.classList.add('argument-name');
                                    // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
                                    name.textContent = arg.name;
                                    argItem.append(name);
                                }
                                // @ts-expect-error TS(2339) FIXME: Property 'enumList' does not exist on type 'never'... Remove this comment to see the full error message
                                if (arg.enumList.length > 0) {
                                    const enums = document.createElement('span');
                                    {
                                        enums.classList.add('argument-enums');
                                        // @ts-expect-error TS(2339) FIXME: Property 'enumList' does not exist on type 'never'... Remove this comment to see the full error message
                                        for (const e of arg.enumList) {
                                            const enumItem = document.createElement('span');
                                            {
                                                enumItem.classList.add('argument-enum');
                                                enumItem.textContent = e;
                                                enums.append(enumItem);
                                            }
                                        }
                                        argItem.append(enums);
                                    }
                                } else {
                                    const types = document.createElement('span');
                                    {
                                        types.classList.add('argument-types');
                                        // @ts-expect-error TS(2339) FIXME: Property 'typeList' does not exist on type 'never'... Remove this comment to see the full error message
                                        for (const t of arg.typeList) {
                                            const type = document.createElement('span');
                                            {
                                                type.classList.add('argument-type');
                                                type.textContent = t;
                                                types.append(type);
                                            }
                                        }
                                        argItem.append(types);
                                    }
                                }
                                args.append(argItem);
                            }
                        }
                        for (const arg of unnamedArguments) {
                            const argItem = document.createElement('span');
                            {
                                argItem.classList.add('argument');
                                argItem.classList.add('unnamedArgument');
                                // @ts-expect-error TS(2339) FIXME: Property 'isRequired' does not exist on type 'neve... Remove this comment to see the full error message
                                if (!arg.isRequired || (arg.defaultValue ?? false))
                                    argItem.classList.add('optional');
                                // @ts-expect-error TS(2339) FIXME: Property 'acceptsMultiple' does not exist on type ... Remove this comment to see the full error message
                                if (arg.acceptsMultiple) argItem.classList.add('multiple');
                                // @ts-expect-error TS(2339) FIXME: Property 'enumList' does not exist on type 'never'... Remove this comment to see the full error message
                                if (arg.enumList.length > 0) {
                                    const enums = document.createElement('span');
                                    {
                                        enums.classList.add('argument-enums');
                                        // @ts-expect-error TS(2339) FIXME: Property 'enumList' does not exist on type 'never'... Remove this comment to see the full error message
                                        for (const e of arg.enumList) {
                                            const enumItem = document.createElement('span');
                                            {
                                                enumItem.classList.add('argument-enum');
                                                enumItem.textContent = e;
                                                enums.append(enumItem);
                                            }
                                        }
                                        argItem.append(enums);
                                    }
                                } else {
                                    const types = document.createElement('span');
                                    {
                                        types.classList.add('argument-types');
                                        // @ts-expect-error TS(2339) FIXME: Property 'typeList' does not exist on type 'never'... Remove this comment to see the full error message
                                        for (const t of arg.typeList) {
                                            const type = document.createElement('span');
                                            {
                                                type.classList.add('argument-type');
                                                type.textContent = t;
                                                types.append(type);
                                            }
                                        }
                                        argItem.append(types);
                                    }
                                }
                                args.append(argItem);
                            }
                        }
                        body.append(args);
                    }
                    const returns = document.createElement('span');
                    {
                        returns.classList.add('returns');
                        returns.textContent = returnType ?? 'void';
                        // body.append(returns);
                    }
                    specs.append(body);
                }
                li.append(specs);
            }
            const stopgap = document.createElement('span');
            {
                stopgap.classList.add('stopgap');
                stopgap.textContent = '';
                li.append(stopgap);
            }
            const help = document.createElement('span');
            {
                help.classList.add('help');
                const content = document.createElement('span');
                {
                    content.classList.add('helpContent');
                    content.innerHTML = helpString;
                    const text = content.textContent;
                    content.innerHTML = '';
                    content.textContent = text;
                    help.append(content);
                }
                li.append(help);
            }
            if (aliasList.length > 0) {
                const aliases = document.createElement('span');
                {
                    aliases.classList.add('aliases');
                    aliases.append(' (alias: ');
                    for (const aliasName of aliasList) {
                        const alias = document.createElement('span');
                        {
                            alias.classList.add('monospace');
                            alias.textContent = `/${aliasName}`;
                            aliases.append(alias);
                        }
                    }
                    aliases.append(')');
                    // li.append(aliases);
                }
            }
        }
        return li;
    }

    /**
     * @returns {HTMLElement}
     */
    renderItem() {
        // throw new Error(`${this.constructor.name}.renderItem() is not implemented`);
        const li = this.makeItem(this.name, this.typeIcon, true);
        li.setAttribute('data-name', this.name);
        li.setAttribute('data-option-type', this.type);
        return li;
    }

    /**
     * @returns {DocumentFragment}
     */
    renderDetails() {
        // throw new Error(`${this.constructor.name}.renderDetails() is not implemented`);
        const frag = document.createDocumentFragment();
        const specs = document.createElement('div');
        {
            specs.classList.add('specs');
            const name = document.createElement('div');
            {
                name.classList.add('name');
                name.classList.add('monospace');
                name.textContent = this.name;
                specs.append(name);
            }
            frag.append(specs);
        }
        return frag;
    }
}
