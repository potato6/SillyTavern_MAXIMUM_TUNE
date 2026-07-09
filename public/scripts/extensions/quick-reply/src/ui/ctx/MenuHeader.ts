import { MenuItem } from './MenuItem.js';

export class MenuHeader extends MenuItem {
    constructor(/**@type {String}*/label: any) {
        super(null, null, label, null, null, null, []);
    }


    // @ts-expect-error TS(4114): This member must have an 'override' modifier becau... Remove this comment to see the full error message
    render() {
        if (!this.root) {
            const item = document.createElement('li'); {
                this.root = item;
                item.classList.add('list-group-item');
                item.classList.add('ctx-header');
                item.append(this.label);
            }
        }
        return this.root;
    }
}
