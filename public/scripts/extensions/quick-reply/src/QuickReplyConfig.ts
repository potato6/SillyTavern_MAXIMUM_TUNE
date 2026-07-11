import { getSortableDelay } from '../../../utils.js';
declare const $: any; declare const toastr: any;
import { QuickReplySetLink } from './QuickReplySetLink.js';
import { QuickReplySet } from './QuickReplySet.js';

export class QuickReplyConfig {
    /**@type {QuickReplySetLink[]}*/ setList = [];
    /**@type {'global'|'chat'|'character'}*/ scope: any;

    /**@type {Function}*/ onUpdate: any;
    /**@type {Function}*/ onRequestEditSet: any;

    /**@type {HTMLElement}*/ dom: any;
    /**@type {HTMLElement}*/ setListDom: any;


    static from(props: any) {
        props.setList = props.setList?.map((it: any) => QuickReplySetLink.from(it))?.filter((it: any) => it.set) ?? [];
        const instance = Object.assign(new this(), props);
        instance.init();
        return instance;
    }


    init() {
        this.setList.forEach(it => this.hookQuickReplyLink(it));
    }


    hasSet(qrs: any) {
        // @ts-expect-error TS(2339): Property 'set' does not exist on type 'never'.
        return this.setList.find(it => it.set == qrs) != null;
    }
    addSet(qrs: any, isVisible = true) {
        if (!this.hasSet(qrs)) {
            const qrl = new QuickReplySetLink();
            qrl.set = qrs;
            qrl.isVisible = isVisible;
            this.hookQuickReplyLink(qrl);
            // @ts-expect-error TS(2345): Argument of type 'QuickReplySetLink' is not assign... Remove this comment to see the full error message
            this.setList.push(qrl);
            this.setListDom.append(qrl.renderSettings(this.setList.length - 1));
            this.update();
        }
    }
    removeSet(qrs: any) {
        // @ts-expect-error TS(2339): Property 'set' does not exist on type 'never'.
        const idx = this.setList.findIndex(it => it.set == qrs);
        if (idx > -1) {
            this.setList.splice(idx, 1);
            this.update();
            this.updateSetListDom();
        }
    }


    renderSettingsInto(/**@type {HTMLElement}*/root: any) {
        /**@type {HTMLElement}*/
        this.setListDom = root.querySelector('.qr--setList');
        root.querySelector('.qr--setListAdd').addEventListener('click', () => {
            // @ts-expect-error TS(2339): Property 'set' does not exist on type 'never'.
            const newSet = QuickReplySet.list.find(qr => !this.setList.find(qrl => qrl.set == qr));
            if (newSet) {
                this.addSet(newSet);
            } else {
                notyf.warning('All existing QR Sets have already been added.');
            }
        });
        this.updateSetListDom();
    }
    updateSetListDom() {
        this.setListDom.innerHTML = '';
        // @ts-ignore
        $(this.setListDom).sortable({
            delay: getSortableDelay(),
            stop: () => this.onSetListSort(),
        });
        // @ts-expect-error TS(2339): Property 'set' does not exist on type 'never'.
        this.setList.filter(it => !it.set.isDeleted).forEach((qrl, idx) => this.setListDom.append(qrl.renderSettings(idx)));
    }


    onSetListSort() {
        // @ts-expect-error TS(2322): Type 'undefined[]' is not assignable to type 'neve... Remove this comment to see the full error message
        this.setList = Array.from(this.setListDom.children).map((it, idx) => {
            // @ts-expect-error TS(2571): Object is of type 'unknown'.
            const qrl = this.setList[Number(it.getAttribute('data-order'))];
            // @ts-expect-error TS(2532): Object is possibly 'undefined'.
            qrl.index = idx;
            // @ts-expect-error TS(2571): Object is of type 'unknown'.
            it.setAttribute('data-order', String(idx));
            return qrl;
        });
        this.update();
    }


    /**
     * @param {QuickReplySetLink} qrl
     */
    hookQuickReplyLink(qrl: any) {
        qrl.onDelete = () => this.deleteQuickReplyLink(qrl);
        qrl.onUpdate = () => this.update();
        qrl.onRequestEditSet = () => this.requestEditSet(qrl.set);
    }

    deleteQuickReplyLink(qrl: any) {
        // @ts-expect-error TS(2345): Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
        this.setList.splice(this.setList.indexOf(qrl), 1);
        this.update();
    }

    update() {
        if (this.onUpdate) {
            this.onUpdate(this);
        }
    }

    requestEditSet(qrs: any) {
        if (this.onRequestEditSet) {
            this.onRequestEditSet(qrs);
        }
    }

    toJSON() {
        return {
            setList: this.setList,
        };
    }
}
