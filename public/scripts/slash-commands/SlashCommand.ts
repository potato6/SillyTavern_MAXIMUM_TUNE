import { hljs } from '../../lib.js';
import { t } from '../i18n.js';
import { SlashCommandArgument, SlashCommandNamedArgument } from './SlashCommandArgument.js';
import { SlashCommandClosure } from './SlashCommandClosure.js';

/**
 * @typedef {NamedArgumentsCapture & {
 * _scope:SlashCommandScope,
 * _parserFlags:import('./SlashCommandParser.js').ParserFlags,
 * _abortController:SlashCommandAbortController,
 * _debugController:SlashCommandDebugController,
 * _hasUnnamedArgument:boolean,
 * }} NamedArguments
 */

/**
 * Alternative object for local JSDocs, where you don't need existing pipe, scope, etc. arguments
 * @typedef {{[id:string]:string|SlashCommandClosure|(string|SlashCommandClosure)[]|undefined}} NamedArgumentsCapture
 */

/**
 * @typedef {string|SlashCommandClosure|(string|SlashCommandClosure)[]} UnnamedArguments
 */


export class SlashCommand {
    /**
     * Creates a SlashCommand from a properties object.
     * @param {object} props
     * @param {string} [props.name]
     * @param {(namedArguments:NamedArguments|NamedArgumentsCapture, unnamedArguments:string|SlashCommandClosure|(string|SlashCommandClosure)[])=>string|SlashCommandClosure|Promise<string|SlashCommandClosure>} [props.callback]
     * @param {string} [props.helpString]
     * @param {boolean} [props.splitUnnamedArgument]
     * @param {number} [props.splitUnnamedArgumentCount]
     * @param {boolean} [props.rawQuotes] If set to true, does not remove wrapping quotes from the unnamed argument.
     * @param {string[]} [props.aliases]
     * @param {string} [props.returns]
     * @param {SlashCommandNamedArgument[]} [props.namedArgumentList]
     * @param {SlashCommandArgument[]} [props.unnamedArgumentList]
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'props' implicitly has an 'any' type.
    static fromProps(props) {
        const instance = Object.assign(new this(), props);
        return instance;
    }


    // @ts-expect-error TS(7008) FIXME: Member 'name' implicitly has an 'any' type.
    /**@type {string}*/ name;
    // @ts-expect-error TS(7008) FIXME: Member 'callback' implicitly has an 'any' type.
    /**@type {(namedArguments:NamedArguments, unnamedArguments:UnnamedArguments)=>string|SlashCommandClosure|Promise<string|SlashCommandClosure>}*/ callback;
    // @ts-expect-error TS(7008) FIXME: Member 'helpString' implicitly has an 'any' type.
    /**@type {string}*/ helpString;
    /**@type {boolean}*/ splitUnnamedArgument = false;
    // @ts-expect-error TS(7008) FIXME: Member 'splitUnnamedArgumentCount' implicitly has ... Remove this comment to see the full error message
    /**@type {Number}*/ splitUnnamedArgumentCount;
    /** @type {boolean} */ rawQuotes = false;
    /**@type {string[]}*/ aliases = [];
    // @ts-expect-error TS(7008) FIXME: Member 'returns' implicitly has an 'any' type.
    /**@type {string}*/ returns;
    /**@type {SlashCommandNamedArgument[]}*/ namedArgumentList = [];
    /**@type {SlashCommandArgument[]}*/ unnamedArgumentList = [];

    /**@type {Object.<string, HTMLElement>}*/ helpCache = {};
    /**@type {Object.<string, DocumentFragment>}*/ helpDetailsCache = {};

    /**@type {boolean}*/ isExtension = false;
    /**@type {boolean}*/ isThirdParty = false;
    // @ts-expect-error TS(7008) FIXME: Member 'source' implicitly has an 'any' type.
    /**@type {string}*/ source;

    renderHelpItem(key = null) {
        key = key ?? this.name;
        // @ts-expect-error TS(2538) FIXME: Type 'null' cannot be used as an index type.
        if (!this.helpCache[key]) {
            const typeIcon = '[/]';
            const li = document.createElement('li'); {
                li.classList.add('item');
                const type = document.createElement('span'); {
                    type.classList.add('type');
                    type.classList.add('monospace');
                    type.textContent = typeIcon;
                    li.append(type);
                }
                const specs = document.createElement('span'); {
                    specs.classList.add('specs');
                    const name = document.createElement('span'); {
                        name.classList.add('name');
                        name.classList.add('monospace');
                        name.textContent = '/';
                        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                        key.split('').forEach(char => {
                            const span = document.createElement('span'); {
                                span.textContent = char;
                                name.append(span);
                            }
                        });
                        specs.append(name);
                    }
                    const body = document.createElement('span'); {
                        body.classList.add('body');
                        const args = document.createElement('span'); {
                            args.classList.add('arguments');
                            for (const arg of this.namedArgumentList) {
                                const argItem = document.createElement('span'); {
                                    argItem.classList.add('argument');
                                    argItem.classList.add('namedArgument');
                                    // @ts-expect-error TS(2339) FIXME: Property 'isRequired' does not exist on type 'neve... Remove this comment to see the full error message
                                    if (!arg.isRequired || (arg.defaultValue ?? false)) argItem.classList.add('optional');
                                    // @ts-expect-error TS(2339) FIXME: Property 'acceptsMultiple' does not exist on type ... Remove this comment to see the full error message
                                    if (arg.acceptsMultiple) argItem.classList.add('multiple');
                                    const name = document.createElement('span'); {
                                        name.classList.add('argument-name');
                                        // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
                                        name.textContent = arg.name;
                                        argItem.append(name);
                                    }
                                    // @ts-expect-error TS(2339) FIXME: Property 'enumList' does not exist on type 'never'... Remove this comment to see the full error message
                                    if (arg.enumList.length > 0) {
                                        const enums = document.createElement('span'); {
                                            enums.classList.add('argument-enums');
                                            // @ts-expect-error TS(2339) FIXME: Property 'enumList' does not exist on type 'never'... Remove this comment to see the full error message
                                            for (const e of arg.enumList) {
                                                const enumItem = document.createElement('span'); {
                                                    enumItem.classList.add('argument-enum');
                                                    enumItem.textContent = e.value;
                                                    enums.append(enumItem);
                                                }
                                            }
                                            argItem.append(enums);
                                        }
                                    } else {
                                        const types = document.createElement('span'); {
                                            types.classList.add('argument-types');
                                            // @ts-expect-error TS(2339) FIXME: Property 'typeList' does not exist on type 'never'... Remove this comment to see the full error message
                                            for (const t of arg.typeList) {
                                                const type = document.createElement('span'); {
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
                            for (const arg of this.unnamedArgumentList) {
                                const argItem = document.createElement('span'); {
                                    argItem.classList.add('argument');
                                    argItem.classList.add('unnamedArgument');
                                    // @ts-expect-error TS(2339) FIXME: Property 'isRequired' does not exist on type 'neve... Remove this comment to see the full error message
                                    if (!arg.isRequired || (arg.defaultValue ?? false)) argItem.classList.add('optional');
                                    // @ts-expect-error TS(2339) FIXME: Property 'acceptsMultiple' does not exist on type ... Remove this comment to see the full error message
                                    if (arg.acceptsMultiple) argItem.classList.add('multiple');
                                    // @ts-expect-error TS(2339) FIXME: Property 'enumList' does not exist on type 'never'... Remove this comment to see the full error message
                                    if (arg.enumList.length > 0) {
                                        const enums = document.createElement('span'); {
                                            enums.classList.add('argument-enums');
                                            // @ts-expect-error TS(2339) FIXME: Property 'enumList' does not exist on type 'never'... Remove this comment to see the full error message
                                            for (const e of arg.enumList) {
                                                const enumItem = document.createElement('span'); {
                                                    enumItem.classList.add('argument-enum');
                                                    enumItem.textContent = e.value;
                                                    enums.append(enumItem);
                                                }
                                            }
                                            argItem.append(enums);
                                        }
                                    } else {
                                        const types = document.createElement('span'); {
                                            types.classList.add('argument-types');
                                            // @ts-expect-error TS(2339) FIXME: Property 'typeList' does not exist on type 'never'... Remove this comment to see the full error message
                                            for (const t of arg.typeList) {
                                                const type = document.createElement('span'); {
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
                        const returns = document.createElement('span'); {
                            returns.classList.add('returns');
                            returns.textContent = this.returns ?? 'void';
                            body.append(returns);
                        }
                        specs.append(body);
                    }
                    li.append(specs);
                }
                const stopgap = document.createElement('span'); {
                    stopgap.classList.add('stopgap');
                    stopgap.textContent = '';
                    li.append(stopgap);
                }
                const help = document.createElement('span'); {
                    help.classList.add('help');
                    const content = document.createElement('span'); {
                        content.classList.add('helpContent');
                        content.innerHTML = this.helpString;
                        const text = content.textContent;
                        content.innerHTML = '';
                        content.textContent = text;
                        help.append(content);
                    }
                    li.append(help);
                }
                if (this.aliases.length > 0) {
                    const aliases = document.createElement('span'); {
                        aliases.classList.add('aliases');
                        aliases.append(' (alias: ');
                        for (const aliasName of this.aliases) {
                            const alias = document.createElement('span'); {
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
            // @ts-expect-error TS(2538) FIXME: Type 'null' cannot be used as an index type.
            this.helpCache[key] = li;
        }
        // @ts-expect-error TS(2538) FIXME: Type 'null' cannot be used as an index type.
        return /**@type {HTMLElement}*/(this.helpCache[key].cloneNode(true));
    }

    renderHelpDetails(key = null) {
        key = key ?? this.name;
        // @ts-expect-error TS(2538) FIXME: Type 'null' cannot be used as an index type.
        if (!this.helpDetailsCache[key]) {
            const frag = document.createDocumentFragment();
            const namedArguments = this.namedArgumentList ?? [];
            const unnamedArguments = this.unnamedArgumentList ?? [];
            const returnType = this.returns ?? 'void';
            const helpString = this.helpString ?? 'NO DETAILS';
            const aliasList = [this.name, ...(this.aliases ?? [])].filter(it => it != key);
            const specs = document.createElement('div'); {
                specs.classList.add('specs');
                const head = document.createElement('div'); {
                    head.classList.add('head');
                    const name = document.createElement('div'); {
                        name.classList.add('name');
                        name.classList.add('monospace');
                        name.title = t`Command name`;
                        name.textContent = `/${key}`;
                        head.append(name);
                    }
                    const src = document.createElement('div'); {
                        src.classList.add('source');
                        src.classList.add('fa-solid');
                        if (this.isExtension) {
                            src.classList.add('isExtension');
                            src.classList.add('fa-cubes');
                            if (this.isThirdParty) src.classList.add('isThirdParty');
                            else src.classList.add('isCore');
                        } else {
                            src.classList.add('isCore');
                            src.classList.add('fa-star-of-life');
                        }
                        src.title = [
                            this.isExtension ? 'Extension' : 'Core',
                            this.isThirdParty ? 'Third Party' : (this.isExtension ? 'Core' : null),
                            this.source,
                        ].filter(it => it).join('\n');
                        head.append(src);
                    }
                    if (this.rawQuotes) {
                        const rawQuotes = document.createElement('div'); {
                            rawQuotes.classList.add('rawQuotes');
                            rawQuotes.classList.add('fa-solid');
                            rawQuotes.classList.add('fa-quote-left');
                            rawQuotes.title = t`Does not alter quoted literal unnamed arguments. Pass raw=false argument to override.`;
                            head.append(rawQuotes);
                        }
                    }
                    specs.append(head);
                }
                const body = document.createElement('div'); {
                    body.classList.add('body');
                    const args = document.createElement('ul'); {
                        args.classList.add('arguments');
                        for (const arg of namedArguments) {
                            const listItem = document.createElement('li'); {
                                listItem.classList.add('argumentItem');
                                const argSpec = document.createElement('div'); {
                                    argSpec.classList.add('argumentSpec');
                                    const argItem = document.createElement('div'); {
                                        argItem.classList.add('argument');
                                        argItem.classList.add('namedArgument');
                                        // @ts-expect-error TS(2339) FIXME: Property 'isRequired' does not exist on type 'neve... Remove this comment to see the full error message
                                        argItem.title = arg.isRequired ? t`Named argument` : t`Optional named argument`;
                                        // @ts-expect-error TS(2339) FIXME: Property 'isRequired' does not exist on type 'neve... Remove this comment to see the full error message
                                        if (!arg.isRequired || (arg.defaultValue ?? false)) argItem.classList.add('optional');
                                        // @ts-expect-error TS(2339) FIXME: Property 'acceptsMultiple' does not exist on type ... Remove this comment to see the full error message
                                        if (arg.acceptsMultiple) argItem.classList.add('multiple');
                                        const name = document.createElement('span'); {
                                            name.classList.add('argument-name');
                                            name.title = t`${argItem.title} - Name`;
                                            // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type 'never'.
                                            name.textContent = arg.name;
                                            argItem.append(name);
                                        }
                                        // @ts-expect-error TS(2339) FIXME: Property 'enumList' does not exist on type 'never'... Remove this comment to see the full error message
                                        if (arg.enumList.length > 0) {
                                            const enums = document.createElement('span'); {
                                                enums.classList.add('argument-enums');
                                                enums.title = t`${argItem.title} - Accepted values`;
                                                // @ts-expect-error TS(2339) FIXME: Property 'enumList' does not exist on type 'never'... Remove this comment to see the full error message
                                                for (const e of arg.enumList) {
                                                    const enumItem = document.createElement('span'); {
                                                        enumItem.classList.add('argument-enum');
                                                        enumItem.textContent = e.value;
                                                        enums.append(enumItem);
                                                    }
                                                }
                                                argItem.append(enums);
                                            }
                                        } else {
                                            const types = document.createElement('span'); {
                                                types.classList.add('argument-types');
                                                types.title = t`${argItem.title} - Accepted types`;
                                                // @ts-expect-error TS(2339) FIXME: Property 'typeList' does not exist on type 'never'... Remove this comment to see the full error message
                                                for (const t of arg.typeList) {
                                                    const type = document.createElement('span'); {
                                                        type.classList.add('argument-type');
                                                        type.textContent = t;
                                                        types.append(type);
                                                    }
                                                }
                                                argItem.append(types);
                                            }
                                        }
                                        argSpec.append(argItem);
                                    }
                                    // @ts-expect-error TS(2339) FIXME: Property 'defaultValue' does not exist on type 'ne... Remove this comment to see the full error message
                                    if (arg.defaultValue !== null) {
                                        const argDefault = document.createElement('div'); {
                                            argDefault.classList.add('argument-default');
                                            argDefault.title = t`Default value`;
                                            // @ts-expect-error TS(2339) FIXME: Property 'defaultValue' does not exist on type 'ne... Remove this comment to see the full error message
                                            argDefault.textContent = arg.defaultValue.toString();
                                            argSpec.append(argDefault);
                                        }
                                    }
                                    listItem.append(argSpec);
                                }
                                const desc = document.createElement('div'); {
                                    desc.classList.add('argument-description');
                                    // @ts-expect-error TS(2339) FIXME: Property 'description' does not exist on type 'nev... Remove this comment to see the full error message
                                    desc.innerHTML = arg.description;
                                    listItem.append(desc);
                                }
                                args.append(listItem);
                            }
                        }
                        for (const arg of unnamedArguments) {
                            const listItem = document.createElement('li'); {
                                listItem.classList.add('argumentItem');
                                const argSpec = document.createElement('div'); {
                                    argSpec.classList.add('argumentSpec');
                                    const argItem = document.createElement('div'); {
                                        argItem.classList.add('argument');
                                        argItem.classList.add('unnamedArgument');
                                        // @ts-expect-error TS(2339) FIXME: Property 'isRequired' does not exist on type 'neve... Remove this comment to see the full error message
                                        argItem.title = arg.isRequired ? t`Unnamed argument` : t`Optional unnamed argument`;
                                        // @ts-expect-error TS(2339) FIXME: Property 'isRequired' does not exist on type 'neve... Remove this comment to see the full error message
                                        if (!arg.isRequired || (arg.defaultValue ?? false)) argItem.classList.add('optional');
                                        // @ts-expect-error TS(2339) FIXME: Property 'acceptsMultiple' does not exist on type ... Remove this comment to see the full error message
                                        if (arg.acceptsMultiple) argItem.classList.add('multiple');
                                        // @ts-expect-error TS(2339) FIXME: Property 'enumList' does not exist on type 'never'... Remove this comment to see the full error message
                                        if (arg.enumList.length > 0) {
                                            const enums = document.createElement('span'); {
                                                enums.classList.add('argument-enums');
                                                enums.title = t`${argItem.title} - Accepted values`;
                                                // @ts-expect-error TS(2339) FIXME: Property 'enumList' does not exist on type 'never'... Remove this comment to see the full error message
                                                for (const e of arg.enumList) {
                                                    const enumItem = document.createElement('span'); {
                                                        enumItem.classList.add('argument-enum');
                                                        enumItem.textContent = e.value;
                                                        enums.append(enumItem);
                                                    }
                                                }
                                                argItem.append(enums);
                                            }
                                        } else {
                                            const types = document.createElement('span'); {
                                                types.classList.add('argument-types');
                                                types.title = t`${argItem.title} - Accepted types`;
                                                // @ts-expect-error TS(2339) FIXME: Property 'typeList' does not exist on type 'never'... Remove this comment to see the full error message
                                                for (const t of arg.typeList) {
                                                    const type = document.createElement('span'); {
                                                        type.classList.add('argument-type');
                                                        type.textContent = t;
                                                        types.append(type);
                                                    }
                                                }
                                                argItem.append(types);
                                            }
                                        }
                                        argSpec.append(argItem);
                                    }
                                    // @ts-expect-error TS(2339) FIXME: Property 'defaultValue' does not exist on type 'ne... Remove this comment to see the full error message
                                    if (arg.defaultValue !== null) {
                                        const argDefault = document.createElement('div'); {
                                            argDefault.classList.add('argument-default');
                                            argDefault.title = t`Default value`;
                                            // @ts-expect-error TS(2339) FIXME: Property 'defaultValue' does not exist on type 'ne... Remove this comment to see the full error message
                                            argDefault.textContent = arg.defaultValue.toString();
                                            argSpec.append(argDefault);
                                        }
                                    }
                                    listItem.append(argSpec);
                                }
                                const desc = document.createElement('div'); {
                                    desc.classList.add('argument-description');
                                    // @ts-expect-error TS(2339) FIXME: Property 'description' does not exist on type 'nev... Remove this comment to see the full error message
                                    desc.innerHTML = arg.description;
                                    listItem.append(desc);
                                }
                                args.append(listItem);
                            }
                        }
                        body.append(args);
                    }
                    const returns = document.createElement('span'); {
                        returns.classList.add('returns');
                        returns.title = [null, undefined, 'void'].includes(returnType) ? t`Command does not return anything` : t`Return value`;
                        returns.textContent = returnType ?? 'void';
                        body.append(returns);
                    }
                    specs.append(body);
                }
                frag.append(specs);
            }
            const help = document.createElement('span'); {
                help.classList.add('help');
                help.innerHTML = helpString;
                for (const code of help.querySelectorAll('pre > code')) {
                    code.classList.add('language-stscript');
                    hljs.highlightElement(code as HTMLElement);
                }
                frag.append(help);
            }
            if (aliasList.length > 0) {
                const aliases = document.createElement('span'); {
                    aliases.classList.add('aliases');
                    for (const aliasName of aliasList) {
                        const alias = document.createElement('span'); {
                            alias.classList.add('alias');
                            alias.textContent = `/${aliasName}`;
                            aliases.append(alias);
                        }
                    }
                    frag.append(aliases);
                }
            }
            // @ts-expect-error TS(2538) FIXME: Type 'null' cannot be used as an index type.
            this.helpDetailsCache[key] = frag;
        }
        const frag = document.createDocumentFragment();
        // @ts-expect-error TS(2538) FIXME: Type 'null' cannot be used as an index type.
        frag.append(this.helpDetailsCache[key].cloneNode(true));
        return frag;
    }
}
