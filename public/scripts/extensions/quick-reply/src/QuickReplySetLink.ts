import { QuickReplySet } from './QuickReplySet.js';

export class QuickReplySetLink {
    static from(props: any) {
        props.set = QuickReplySet.get(props.set);
        /**@type {QuickReplySetLink}*/
        const instance = Object.assign(new this(), props);
        return instance;
    }


    /**@type {QuickReplySet}*/ set: any;
    /**@type {Boolean}*/ isVisible = true;

    /**@type {Number}*/ index: any;

    /**@type {Function}*/ onUpdate: any;
    /**@type {Function}*/ onRequestEditSet: any;
    /**@type {Function}*/ onDelete: any;

    /**@type {HTMLElement}*/ settingsDom: any;


    renderSettings(idx: any) {
        this.index = idx;
        const item = document.createElement('div'); {
            this.settingsDom = item;
            item.classList.add('qr--item');
            item.setAttribute('data-order', String(this.index));
            const drag = document.createElement('div'); {
                drag.classList.add('drag-handle');
                drag.classList.add('ui-sortable-handle');
                drag.textContent = '☰';
                item.append(drag);
            }
            const set = document.createElement('select'); {
                set.classList.add('qr--set');
                // fix for jQuery sortable breaking childrens' touch events
                set.addEventListener('touchstart', (evt) => evt.stopPropagation());
                set.addEventListener('change', () => {
                    this.set = QuickReplySet.get(set.value);
                    this.update();
                });
                // @ts-expect-error TS(2339): Property 'toSorted' does not exist on type 'never[... Remove this comment to see the full error message
                QuickReplySet.list.toSorted((a: any, b: any) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())).forEach((qrs: any) => {
                    const opt = document.createElement('option'); {
                        opt.value = qrs.name;
                        opt.textContent = qrs.name;
                        opt.selected = qrs == this.set;
                        set.append(opt);
                    }
                });
                item.append(set);
            }
            const visible = document.createElement('label'); {
                visible.classList.add('qr--visible');
                visible.title = 'Show buttons';
                const cb = document.createElement('input'); {
                    cb.type = 'checkbox';
                    cb.checked = this.isVisible;
                    cb.addEventListener('click', () => {
                        this.isVisible = cb.checked;
                        this.update();
                    });
                    visible.append(cb);
                }
                visible.append('Buttons');
                item.append(visible);
            }
            const edit = document.createElement('div'); {
                edit.classList.add('menu_button');
                edit.classList.add('menu_button_icon');
                edit.classList.add('fa-solid');
                edit.classList.add('fa-pencil');
                edit.title = 'Edit quick reply set';
                edit.addEventListener('click', () => this.requestEditSet());
                item.append(edit);
            }
            const del = document.createElement('div'); {
                del.classList.add('qr--del');
                del.classList.add('menu_button');
                del.classList.add('menu_button_icon');
                del.classList.add('fa-solid');
                del.classList.add('fa-trash-can');
                del.title = 'Remove quick reply set';
                del.addEventListener('click', () => this.delete());
                item.append(del);
            }
        }
        return this.settingsDom;
    }
    unrenderSettings() {
        this.settingsDom?.remove();
        this.settingsDom = null;
    }


    update() {
        if (this.onUpdate) {
            this.onUpdate(this);
        }
    }
    requestEditSet() {
        if (this.onRequestEditSet) {
            this.onRequestEditSet(this.set);
        }
    }
    delete() {
        this.unrenderSettings();
        if (this.onDelete) {
            this.onDelete();
        }
    }


    toJSON() {
        return {
            set: this.set.name,
            isVisible: this.isVisible,
        };
    }
}
