export interface EventEmitter {
    on(event: string, listener: (...args: any[]) => void): void;
    makeLast(event: string, listener: (...args: any[]) => void): void;
    makeFirst(event: string, listener: (...args: any[]) => void): void;
    removeListener(event: string, listener: (...args: any[]) => void): void;
    emit(event: string, ...args: any[]): Promise<void>;
    emitAndWait(event: string, ...args: any[]): void;
    once(event: string, listener: (...args: any[]) => void): void;
}

interface EventEmitterConstructor {
    new(autoFireAfterEmit?: string[]): EventEmitter;
    readonly prototype: EventEmitter;
}

declare const EventEmitter: EventEmitterConstructor;
export { EventEmitter };
