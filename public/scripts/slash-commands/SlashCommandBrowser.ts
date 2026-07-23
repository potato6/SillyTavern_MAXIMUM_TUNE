import { escapeRegex } from '../utils.js';
import { SlashCommandParser } from './SlashCommandParser.js';

export class SlashCommandBrowser {
    // @ts-expect-error TS(7008) FIXME: Member 'cmdList' implicitly has an 'any' type.
    /**@type {SlashCommand[]}*/ cmdList;
    // @ts-expect-error TS(7008) FIXME: Member 'dom' implicitly has an 'any' type.
    /**@type {HTMLElement}*/ dom;
    // @ts-expect-error TS(7008) FIXME: Member 'search' implicitly has an 'any' type.
    /**@type {HTMLElement}*/ search;
    // @ts-expect-error TS(7008) FIXME: Member 'details' implicitly has an 'any' type.
    /**@type {HTMLElement}*/ details;
    /**@type {Object.<string,HTMLElement>}*/ itemMap = {};
    // @ts-expect-error TS(7008) FIXME: Member 'mo' implicitly has an 'any' type.
    /**@type {MutationObserver}*/ mo;

    // @ts-expect-error TS(7006) FIXME: Parameter 'parent' implicitly has an 'any' type.
    renderInto(parent) {
        if (!this.dom) {
            const queryRegex =
                /(?:(?:^|\s+)([^\s"][^\s]*?)(?:\s+|$))|(?:(?:^|\s+)"(.*?)(?:"|$)(?:\s+|$))/;
            const root = document.createElement('div');
            {
                this.dom = root;
                const search = document.createElement('div');
                {
                    search.classList.add('search');
                    const lbl = document.createElement('label');
                    {
                        lbl.classList.add('searchLabel');
                        lbl.textContent = 'Search: ';
                        const inp = document.createElement('input');
                        {
                            this.search = inp;
                            inp.classList.add('searchInput');
                            inp.classList.add('text_pole');
                            inp.type = 'search';
                            inp.placeholder =
                                'Search slash commands - use quotes to search "literal" instead of fuzzy';
                            inp.addEventListener('input', () => {
                                this.details?.remove();
                                this.details = null;
                                let query = inp.value.trim();
                                if (query.slice(-1) === '"' && !/(?:^|\s+)"/.test(query)) {
                                    query = `"${query}`;
                                }
                                const fuzzyList: any[] = [];
                                const quotedList: any[] = [];
                                while (query.length > 0) {
                                    const match = queryRegex.exec(query);
                                    if (!match) break;
                                    if (match[1] !== undefined) {
                                        fuzzyList.push(
                                            new RegExp(
                                                `^(.*?)${match[1]
                                                    .split('')
                                                    .map((char) => `(${escapeRegex(char)})`)
                                                    .join('(.*?)')}(.*?)$`,
                                                'i',
                                            ),
                                        );
                                    } else if (match[2] !== undefined) {
                                        quotedList.push(match[2]);
                                    }
                                    query = query.slice(match.index + match[0].length);
                                }
                                for (const cmd of this.cmdList) {
                                    const targets = [
                                        cmd.name,
                                        // @ts-expect-error TS(7006) FIXME: Parameter 'it' implicitly has an 'any' type.
                                        ...cmd.namedArgumentList.map((it) => it.name),
                                        // @ts-expect-error TS(7006) FIXME: Parameter 'it' implicitly has an 'any' type.
                                        ...cmd.namedArgumentList.map((it) => it.description),
                                        // @ts-expect-error TS(7006) FIXME: Parameter 'it' implicitly has an 'any' type.
                                        ...cmd.namedArgumentList.flatMap((it) =>
                                            it.enumList.map((e: any) => e.value),
                                        ),
                                        // @ts-expect-error TS(7006) FIXME: Parameter 'it' implicitly has an 'any' type.
                                        ...cmd.namedArgumentList.flatMap((it) => it.typeList),
                                        // @ts-expect-error TS(7006) FIXME: Parameter 'it' implicitly has an 'any' type.
                                        ...cmd.unnamedArgumentList.map((it) => it.description),
                                        // @ts-expect-error TS(7006) FIXME: Parameter 'it' implicitly has an 'any' type.
                                        ...cmd.unnamedArgumentList.flatMap((it) =>
                                            it.enumList.map((e: any) => e.value),
                                        ),
                                        // @ts-expect-error TS(7006) FIXME: Parameter 'it' implicitly has an 'any' type.
                                        ...cmd.unnamedArgumentList.flatMap((it) => it.typeList),
                                        ...cmd.aliases,
                                        cmd.helpString,
                                    ];
                                    const find = () =>
                                        targets.find(
                                            (t) =>
                                                (fuzzyList.find((f) => f.test(t)) ??
                                                    quotedList.find((q) => t.includes(q))) !==
                                                undefined,
                                        ) !== undefined;
                                    if (fuzzyList.length + quotedList.length === 0 || find()) {
                                        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                                        this.itemMap[cmd.name].classList.remove('isFiltered');
                                    } else {
                                        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                                        this.itemMap[cmd.name].classList.add('isFiltered');
                                    }
                                }
                            });
                            lbl.append(inp);
                        }
                        search.append(lbl);
                    }
                    root.append(search);
                }
                const container = document.createElement('div');
                {
                    container.classList.add('commandContainer');
                    const list = document.createElement('div');
                    {
                        list.classList.add('autoComplete');
                        this.cmdList = Object.keys(SlashCommandParser.commands)
                            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                            .filter((key) => SlashCommandParser.commands[key].name === key) // exclude aliases
                            .toSorted((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
                            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                            .map((key) => SlashCommandParser.commands[key]);
                        for (const cmd of this.cmdList) {
                            const item = cmd.renderHelpItem();
                            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                            this.itemMap[cmd.name] = item;
                            // @ts-expect-error TS(7034) FIXME: Variable 'details' implicitly has type 'any' in so... Remove this comment to see the full error message
                            let details;
                            item.addEventListener('click', () => {
                                // @ts-expect-error TS(7005) FIXME: Variable 'details' implicitly has an 'any' type.
                                if (!details) {
                                    details = document.createElement('div');
                                    {
                                        details.classList.add('autoComplete-detailsWrap');
                                        const inner = document.createElement('div');
                                        {
                                            inner.classList.add('autoComplete-details');
                                            inner.append(cmd.renderHelpDetails());
                                            details.append(inner);
                                        }
                                    }
                                }
                                if (this.details !== details) {
                                    Array.from(list.querySelectorAll('.selected')).forEach((it) =>
                                        it.classList.remove('selected'),
                                    );
                                    item.classList.add('selected');
                                    this.details?.remove();
                                    container.append(details);
                                    this.details = details;
                                    const pRect = list.getBoundingClientRect();
                                    const rect = item.children[0].getBoundingClientRect();
                                    details.style.setProperty(
                                        '--targetOffset',
                                        rect.top - pRect.top,
                                    );
                                } else {
                                    item.classList.remove('selected');
                                    details.remove();
                                    this.details = null;
                                }
                            });
                            list.append(item);
                        }
                        container.append(list);
                    }
                    root.append(container);
                }
                root.classList.add('slashCommandBrowser');
            }
        }
        parent.append(this.dom);

        this.mo = new MutationObserver((muts) => {
            if (
                muts.find((mut) =>
                    Array.from(mut.removedNodes).find(
                        (it) => it === this.dom || it.contains(this.dom),
                    ),
                )
            ) {
                this.mo.disconnect();
                window.removeEventListener('keydown', boundHandler);
            }
        });
        this.mo.observe(document.querySelector('#chat'), { childList: true, subtree: true });
        const boundHandler = this.handleKeyDown.bind(this);
        window.addEventListener('keydown', boundHandler);
        return this.dom;
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'evt' implicitly has an 'any' type.
    handleKeyDown(evt) {
        if (!evt.shiftKey && !evt.altKey && evt.ctrlKey && evt.key.toLowerCase() === 'f') {
            if (!this.dom.closest('body')) return;
            if (this.dom.closest('.mes') && !this.dom.closest('.last_mes')) return;
            evt.preventDefault();
            evt.stopPropagation();
            evt.stopImmediatePropagation();
            this.search.focus();
        }
    }
}
