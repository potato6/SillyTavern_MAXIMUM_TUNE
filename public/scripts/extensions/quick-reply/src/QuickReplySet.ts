import { getRequestHeaders, substituteParams } from '../../../../script.js';
declare const toastr: any;
import { Popup, POPUP_RESULT, POPUP_TYPE } from '../../../popup.js';
import { executeSlashCommandsOnChatInput, executeSlashCommandsWithOptions } from '../../../slash-commands.js';
import { SlashCommandScope } from '../../../slash-commands/SlashCommandScope.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { debounceAsync, warn } from '../index.js';
import { QuickReply } from './QuickReply.js';

export class QuickReplySet {
    /**@type {QuickReplySet[]}*/ static list = [];

    /**
     * @param {Partial<QuickReplySet>} props
     * @returns {QuickReplySet}
     */
    static from(props: any) {
        props.qrList = []; //props.qrList?.map(it=>QuickReply.from(it));
        const instance = Object.assign(new this(), props);
        // instance.init();
        return instance;
    }

    /**
     * @param {string} name - name of the QuickReplySet
     */
    static get(name: any) {
        // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
        return this.list.find(it => it.name == name);
    }

    /**@type {string}*/ name: any;
    /**@type {'global'|'chat'|'character'}*/ scope = 'global';
    /**@type {boolean}*/ disableSend = false;
    /**@type {boolean}*/ placeBeforeInput = false;
    /**@type {boolean}*/ injectInput = false;
    /**@type {string}*/ color = 'transparent';
    /**@type {boolean}*/ onlyBorderColor = false;
    /**@type {QuickReply[]}*/ qrList = [];
    /**@type {number}*/ idIndex = 0;
    /**@type {boolean}*/ isDeleted = false;
    /**@type {function}*/ save;
    /**@type {HTMLElement}*/ dom: any;
    /**@type {HTMLElement}*/ settingsDom: any;

    constructor() {
        this.save = debounceAsync(() => this.performSave(), 200);
    }

    init() {
        this.qrList.forEach(qr => this.hookQuickReply(qr));
    }

    unrender() {
        this.dom?.remove();
        this.dom = null;
    }
    render() {
        this.unrender();
        if (!this.dom) {
            const root = document.createElement('div'); {
                this.dom = root;
                root.classList.add('qr--buttons');
                this.updateColor();
                // @ts-expect-error TS(2339): Property 'isHidden' does not exist on type 'never'... Remove this comment to see the full error message
                this.qrList.filter(qr => !qr.isHidden).forEach(qr => {
                    // @ts-expect-error TS(2339): Property 'render' does not exist on type 'never'.
                    root.append(qr.render());
                });
            }
        }
        return this.dom;
    }
    rerender() {
        if (!this.dom) return;
        this.dom.innerHTML = '';
        // @ts-expect-error TS(2339): Property 'isHidden' does not exist on type 'never'... Remove this comment to see the full error message
        this.qrList.filter(qr => !qr.isHidden).forEach(qr => {
            // @ts-expect-error TS(2339): Property 'render' does not exist on type 'never'.
            this.dom.append(qr.render());
        });
    }
    updateColor() {
        if (!this.dom) return;
        if (this.color && this.color != 'transparent') {
            this.dom.style.setProperty('--qr--color', this.color);
            this.dom.classList.add('qr--color');
            if (this.onlyBorderColor) {
                this.dom.classList.add('qr--borderColor');
            } else {
                this.dom.classList.remove('qr--borderColor');
            }
        } else {
            this.dom.style.setProperty('--qr--color', 'transparent');
            this.dom.classList.remove('qr--color');
            this.dom.classList.remove('qr--borderColor');
        }
    }

    renderSettings() {
        if (!this.settingsDom) {
            this.settingsDom = document.createElement('div'); {
                this.settingsDom.classList.add('qr--set-qrListContents');
                this.qrList.forEach((qr, idx) => {
                    this.renderSettingsItem(qr, idx);
                });
            }
        }
        return this.settingsDom;
    }
    /**
     *
     * @param {QuickReply} qr
     * @param {number} idx
     */
    renderSettingsItem(qr: any, idx: any) {
        this.settingsDom.append(qr.renderSettings(idx));
    }

    /**
     *
     * @param {QuickReply} qr
     */
    async debug(qr: any) {
        const parser = new SlashCommandParser();
        // @ts-expect-error TS(2345): Argument of type 'never[]' is not assignable to pa... Remove this comment to see the full error message
        const closure = parser.parse(qr.message, true, [], qr.abortController, qr.debugController);
        closure.source = `${this.name}.${qr.label}`;
        closure.onProgress = (done: any, total: any) => qr.updateEditorProgress(done, total);
        closure.scope.setMacro('arg::*', '');
        return (await closure.execute())?.pipe;
    }

    /**
     *
     * @param {QuickReply} qr The QR to execute.
     * @param {object} options
     * @param {string} [options.message] (null) altered message to be used
     * @param {boolean} [options.isAutoExecute] (false) whether the execution is triggered by auto execute
     * @param {boolean} [options.isEditor] (false) whether the execution is triggered by the QR editor
     * @param {boolean} [options.isRun] (false) whether the execution is triggered by /run or /: (window.executeQuickReplyByName)
     * @param {SlashCommandScope} [options.scope] (null) scope to be used when running the command
     * @param {import('../../../slash-commands.js').ExecuteSlashCommandsOptions} [options.executionOptions] ({}) further execution options
     * @returns
     */
    async executeWithOptions(qr: any, options = {}) {
        options = Object.assign({
            message: null,
            isAutoExecute: false,
            isEditor: false,
            isRun: false,
            scope: null,
            executionOptions: {},
        }, options);
        // @ts-expect-error TS(2339): Property 'executionOptions' does not exist on type... Remove this comment to see the full error message
        const execOptions = options.executionOptions;
        /**@type {HTMLTextAreaElement}*/
        const ta = document.querySelector('#send_textarea');
        // @ts-expect-error TS(2339): Property 'message' does not exist on type '{}'.
        const finalMessage = options.message ?? qr.message;
        // @ts-expect-error TS(2531): Object is possibly 'null'.
        let input = ta.value;
        // @ts-expect-error TS(2339): Property 'isAutoExecute' does not exist on type '{... Remove this comment to see the full error message
        if (!options.isAutoExecute && !options.isEditor && !options.isRun && this.injectInput && input.length > 0) {
            if (this.placeBeforeInput) {
                input = `${finalMessage} ${input}`;
            } else {
                input = `${input} ${finalMessage}`;
            }
        } else {
            input = `${finalMessage} `;
        }

        if (input[0] == '/' && !this.disableSend) {
            let result;
            // @ts-expect-error TS(2339): Property 'isAutoExecute' does not exist on type '{... Remove this comment to see the full error message
            if (options.isAutoExecute || options.isRun) {
                result = await executeSlashCommandsWithOptions(input, Object.assign(execOptions, {
                    handleParserErrors: true,
                    // @ts-expect-error TS(2339): Property 'scope' does not exist on type '{}'.
                    scope: options.scope,
                    source: `${this.name}.${qr.label}`,
                }));
            // @ts-expect-error TS(2339): Property 'isEditor' does not exist on type '{}'.
            } else if (options.isEditor) {
                result = await executeSlashCommandsWithOptions(input, Object.assign(execOptions, {
                    handleParserErrors: false,
                    // @ts-expect-error TS(2339): Property 'scope' does not exist on type '{}'.
                    scope: options.scope,
                    abortController: qr.abortController,
                    source: `${this.name}.${qr.label}`,
                    onProgress: (done: any, total: any) => qr.updateEditorProgress(done, total),
                }));
            } else {
                result = await executeSlashCommandsOnChatInput(input, Object.assign(execOptions, {
                    // @ts-expect-error TS(2339): Property 'scope' does not exist on type '{}'.
                    scope: options.scope,
                    source: `${this.name}.${qr.label}`,
                }));
            }
            return typeof result === 'object' ? result?.pipe : '';
        }

        // @ts-expect-error TS(2531): Object is possibly 'null'.
        ta.value = substituteParams(input);
        // @ts-expect-error TS(2531): Object is possibly 'null'.
        ta.focus();

        if (!this.disableSend) {
            // @ts-ignore
            document.querySelector('#send_but').click();
        }
    }

    /**
     * @param {QuickReply} qr
     * @param {string} [message] - optional altered message to be used
     * @param {SlashCommandScope} [scope] - optional scope to be used when running the command
     */
    async execute(qr: any, message = null, isAutoExecute = false, scope = null) {
        return this.executeWithOptions(qr, {
            message,
            isAutoExecute,
            scope,
        });
    }

    addQuickReply(data = {}) {
        // @ts-expect-error TS(2339): Property 'id' does not exist on type 'never'.
        const id = Math.max(this.idIndex, this.qrList.reduce((max, qr) => Math.max(max, qr.id), 0)) + 1;
        // @ts-expect-error TS(2339): Property 'id' does not exist on type '{}'.
        data.id = this.idIndex = id + 1;
        const qr = QuickReply.from(data);
        // @ts-expect-error TS(2345): Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
        this.qrList.push(qr);
        this.hookQuickReply(qr);
        if (this.settingsDom) {
            this.renderSettingsItem(qr, this.qrList.length - 1);
        }
        if (this.dom) {
            this.dom.append(qr.render());
        }
        this.save();
        return qr;
    }

    addQuickReplyFromText(qrJson: any) {
        let data;
        if (qrJson) {
            try {
                data = JSON.parse(qrJson ?? '{}');
                delete data.id;
            } catch {
                // not JSON data
            }
            if (data) {
                // JSON data
                if (data.label === undefined || data.message === undefined) {
                    // not a QR
                    notyf.error('Not a QR.');
                    return;
                }
            } else {
                // no JSON, use plaintext as QR message
                data = { message: qrJson };
            }
        } else {
            data = {};
        }
        const newQr = this.addQuickReply(data);
        return newQr;
    }

    /**
     *
     * @param {QuickReply} qr
     */
    hookQuickReply(qr: any) {
        // @ts-ignore
        qr.onDebug = () => this.debug(qr);
        qr.onExecute = (_: any, options: any) => this.executeWithOptions(qr, options);
        qr.onDelete = () => this.removeQuickReply(qr);
        qr.onUpdate = () => this.save();
        qr.onInsertBefore = (qrJson: any) => {
            this.addQuickReplyFromText(qrJson);
            const newQr = this.qrList.pop();
            // @ts-expect-error TS(2345): Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
            this.qrList.splice(this.qrList.indexOf(qr), 0, newQr);
            if (qr.settingsDom) {
                // @ts-expect-error TS(2532): Object is possibly 'undefined'.
                qr.settingsDom.insertAdjacentElement('beforebegin', newQr.settingsDom);
            }
            this.save();
        };
        qr.onTransfer = async () => {
            /**@type {HTMLSelectElement} */
            let sel: any;
            let isCopy = false;
            const dom = document.createElement('div'); {
                dom.classList.add('qr--transferModal');
                const title = document.createElement('h3'); {
                    title.textContent = 'Transfer Quick Reply';
                    dom.append(title);
                }
                const subTitle = document.createElement('h4'); {
                    const entryName = qr.label;
                    const bookName = this.name;
                    subTitle.textContent = `${bookName}: ${entryName}`;
                    dom.append(subTitle);
                }
                sel = document.createElement('select'); {
                    sel.classList.add('qr--transferSelect');
                    sel.setAttribute('autofocus', '1');
                    const noOpt = document.createElement('option'); {
                        noOpt.value = '';
                        noOpt.textContent = '-- Select QR Set --';
                        sel.append(noOpt);
                    }
                    for (const qrs of QuickReplySet.list) {
                        const opt = document.createElement('option'); {
                            // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
                            opt.value = qrs.name;
                            // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
                            opt.textContent = qrs.name;
                            sel.append(opt);
                        }
                    }
                    // @ts-expect-error TS(7006): Parameter 'evt' implicitly has an 'any' type.
                    sel.addEventListener('keyup', (evt) => {
                        if (evt.key == 'Shift') {
                            // @ts-ignore
                            (dlg.dom ?? dlg.dlg).classList.remove('qr--isCopy');
                            return;
                        }
                    });
                    // @ts-expect-error TS(7006): Parameter 'evt' implicitly has an 'any' type.
                    sel.addEventListener('keydown', (evt) => {
                        if (evt.key == 'Shift') {
                            // @ts-ignore
                            (dlg.dom ?? dlg.dlg).classList.add('qr--isCopy');
                            return;
                        }
                        if (!evt.ctrlKey && !evt.altKey && evt.key == 'Enter') {
                            evt.preventDefault();
                            if (evt.shiftKey) isCopy = true;
                            dlg.completeAffirmative();
                        }
                    });
                    dom.append(sel);
                }
                const hintP = document.createElement('p'); {
                    const hint = document.createElement('small'); {
                        hint.textContent = 'Type or arrows to select QR Set. Enter to transfer. Shift+Enter to copy.';
                        hintP.append(hint);
                    }
                    dom.append(hintP);
                }
            }
            // @ts-expect-error TS(2345): Argument of type 'null' is not assignable to param... Remove this comment to see the full error message
            const dlg = new Popup(dom, POPUP_TYPE.CONFIRM, null, { okButton: 'Transfer', cancelButton: 'Cancel' });
            const copyBtn = document.createElement('div'); {
                copyBtn.classList.add('qr--copy');
                copyBtn.classList.add('menu_button');
                copyBtn.textContent = 'Copy';
                copyBtn.addEventListener('click', () => {
                    isCopy = true;
                    dlg.completeAffirmative();
                });
                // @ts-ignore
                (dlg.ok ?? dlg.okButton).insertAdjacentElement('afterend', copyBtn);
            }
            const prom = dlg.show();
            sel.focus();
            await prom;
            if (dlg.result == POPUP_RESULT.AFFIRMATIVE) {
                // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
                const qrs = QuickReplySet.list.find(it => it.name == sel.value);
                // @ts-expect-error TS(2532): Object is possibly 'undefined'.
                qrs.addQuickReply(qr.toJSON());
                if (!isCopy) {
                    qr.delete();
                }
            }
        };
    }

    removeQuickReply(qr: any) {
        // @ts-expect-error TS(2345): Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
        this.qrList.splice(this.qrList.indexOf(qr), 1);
        this.save();
    }

    toJSON() {
        return {
            version: 2,
            name: this.name,
            disableSend: this.disableSend,
            placeBeforeInput: this.placeBeforeInput,
            injectInput: this.injectInput,
            color: this.color,
            onlyBorderColor: this.onlyBorderColor,
            qrList: this.qrList,
            idIndex: this.idIndex,
        };
    }

    async performSave() {
        const response = await fetch('/api/quick-replies/save', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(this),
        });

        if (response.ok) {
            this.rerender();
        } else {
            warn(`Failed to save Quick Reply Set: ${this.name}`);
            console.error('QR could not be saved', response);
        }
    }

    async delete() {
        const response = await fetch('/api/quick-replies/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(this),
        });

        if (response.ok) {
            this.unrender();
            // @ts-expect-error TS(2345): Argument of type 'this' is not assignable to param... Remove this comment to see the full error message
            const idx = QuickReplySet.list.indexOf(this);
            if (idx > -1) {
                QuickReplySet.list.splice(idx, 1);
                this.isDeleted = true;
            } else {
                warn(`Deleted Quick Reply Set was not found in the list of sets: ${this.name}`);
            }
        } else {
            warn(`Failed to delete Quick Reply Set: ${this.name}`);
        }
    }
}
