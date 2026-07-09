import { SlashCommandExecutor } from './SlashCommandExecutor.js';

export class SlashCommandBreak extends SlashCommandExecutor {
    get value() {
        // @ts-expect-error TS(2339) FIXME: Property 'value' does not exist on type 'never'.
        return this.unnamedArgumentList[0]?.value;
    }
}
