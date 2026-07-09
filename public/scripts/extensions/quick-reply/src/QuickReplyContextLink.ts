import { QuickReplySet } from './QuickReplySet.js';

export class QuickReplyContextLink {
    static from(props: any) {
        props.set = QuickReplySet.get(props.set);
        const x = Object.assign(new this(), props);
        return x;
    }


    /**@type {QuickReplySet}*/ set: any;
    /**@type {Boolean}*/ isChained = false;

    toJSON() {
        return {
            set: this.set?.name,
            isChained: this.isChained,
        };
    }
}
