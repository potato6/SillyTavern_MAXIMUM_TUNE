import { AutoCompleteOption } from './AutoCompleteOption.js';

export class BlankAutoCompleteOption extends AutoCompleteOption {
    /**
     * @param {string} name
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
    constructor(name) {
        super(name);
        this.dom = this.renderItem();
    }

    // @ts-expect-error TS(4114) FIXME: This member must have an 'override' modifier becau... Remove this comment to see the full error message
    get value() {
        return null;
    }

    // @ts-expect-error TS(4114) FIXME: This member must have an 'override' modifier becau... Remove this comment to see the full error message
    renderItem() {
        const li = document.createElement('li');
        {
            li.classList.add('item');
            li.classList.add('blank');
            li.textContent = this.name;
        }
        return li;
    }

    // @ts-expect-error TS(4114) FIXME: This member must have an 'override' modifier becau... Remove this comment to see the full error message
    renderDetails() {
        const frag = document.createDocumentFragment();
        return frag;
    }
}
