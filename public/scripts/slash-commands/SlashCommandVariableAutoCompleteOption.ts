import { AutoCompleteOption } from '../autocomplete/AutoCompleteOption.js';

export class SlashCommandVariableAutoCompleteOption extends AutoCompleteOption {
    /**
     * @param {string} name
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
    constructor(name) {
        super(name);
    }

    // @ts-expect-error TS(4114) FIXME: This member must have an 'override' modifier becau... Remove this comment to see the full error message
    renderItem() {
        const li = this.makeItem(this.name, '[𝑥]', true);
        li.setAttribute('data-name', this.name);
        li.setAttribute('data-option-type', 'variable');
        return li;
    }

    // @ts-expect-error TS(4114) FIXME: This member must have an 'override' modifier becau... Remove this comment to see the full error message
    renderDetails() {
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
        const help = document.createElement('span');
        {
            help.classList.add('help');
            help.textContent = 'scoped variable';
            frag.append(help);
        }
        return frag;
    }
}
