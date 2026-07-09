/**
 * @abstract
 * @implements {EventTarget}
 */
export class AbstractEventTarget {
    listeners: Record<string, ((event: Event) => void)[]>;
    constructor() {
        this.listeners = {};
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
    addEventListener(type, callback, _options) {
        if (!this.listeners[type]) {
            this.listeners[type] = [];
        }
        this.listeners[type].push(callback);
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    dispatchEvent(event) {
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        if (!this.listeners[event.type] || this.listeners[event.type].length === 0) {
            return true;
        }
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        this.listeners[event.type].forEach(listener => {
            listener(event);
        });
        return true;
    }

    // @ts-expect-error TS(7006) FIXME: Parameter 'type' implicitly has an 'any' type.
    removeEventListener(type, callback, _options) {
        if (!this.listeners[type]) {
            return;
        }
        const index = this.listeners[type].indexOf(callback);
        if (index !== -1) {
            this.listeners[type].splice(index, 1);
        }
    }
}
