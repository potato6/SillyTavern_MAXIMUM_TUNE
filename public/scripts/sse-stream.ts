import { power_user } from './power-user.js';
import { delay } from './utils.js';

// Symbol for not primary swipe error
const NOT_PRIMARY = Symbol('not_primary_swipe');

/**
 * A stream which handles Server-Sent Events from a binary ReadableStream like you get from the fetch API.
 */
class EventSourceStream {
    readable: ReadableStream | null;
    writable: WritableStream | null;
    constructor() {
        const decoder = new TextDecoderStream('utf-8');

        let streamBuffer = '';
        let lastEventId = '';

        /**
         *
         * @param controller
         */
        // @ts-expect-error TS(7006) FIXME: Parameter 'controller' implicitly has an 'any' type.
        function processChunk(controller) {
            const events = streamBuffer.split(/\r\n\r\n|\r\r|\n\n/g);
            if (events.length === 0) return;

            // @ts-expect-error TS(2322)
            streamBuffer = events.pop();

            for (let i = 0; i < events.length; i++) {
                const eventChunk = events[i]!;
                let eventType = '';
                const lines = eventChunk.split(/\n|\r|\r\n/g);
                let eventData = '';

                for (let j = 0; j < lines.length; j++) {
                    const line = lines[j]!;
                    const colonIndex = line.indexOf(':');

                    if (colonIndex !== -1) {
                        const field = line.substring(0, colonIndex);
                        let value = line.substring(colonIndex + 1);
                        if (value.charCodeAt(0) === 32) {
                            // check for space ' '
                            value = value.substring(1);
                        }

                        if (field === 'event') {
                            eventType = value;
                        } else if (field === 'data') {
                            eventData += value + '\n';
                        } else if (field === 'id') {
                            if (!value.includes('\0')) lastEventId = value;
                        }
                    } else if (line.length > 0) {
                        // Field name only, no colon
                        if (line === 'event') {
                            eventType = '';
                        } else if (line === 'data') {
                            eventData += '\n';
                        }
                    }
                }

                if (eventData === '') continue;

                if (eventData.charCodeAt(eventData.length - 1) === 10) {
                    // '\n'
                    eventData = eventData.slice(0, -1);
                }

                const event = new MessageEvent(eventType || 'message', {
                    data: eventData,
                    lastEventId,
                });
                controller.enqueue(event);
            }
        }

        const sseStream = new TransformStream({
            transform(chunk, controller) {
                streamBuffer += chunk;
                processChunk(controller);
            },
        });

        decoder.readable.pipeThrough(sseStream);

        this.readable = sseStream.readable;
        this.writable = decoder.writable;
    }
}

/**
 * Gets a delay based on the character.
 * @param {string} s The character.
 * @returns {number} The delay in milliseconds.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 's' implicitly has an 'any' type.
function getDelay(s) {
    if (!s) return 0;

    const speedFactor = Math.max(100 - power_user.smooth_streaming_speed, 1);
    const defaultDelayMs = speedFactor * 0.4;

    if (s === ',' || s === '\n') {
        return (defaultDelayMs * 25) / 2;
    }

    if (s === '.' || s === '!' || s === '?') {
        return defaultDelayMs * 25;
    }

    return defaultDelayMs;
}

/**
 * Parses the stream data and returns the parsed data and the chunk to be sent.
 * @param {object} json The JSON data.
 * @returns {AsyncGenerator<{data: object, chunk: string, reasoning: boolean}>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'json' implicitly has an 'any' type.
async function* parseStreamData(json) {
    /**
     * Generic helper to mutate the parsed JSON instance and yield character by character.
     * Prevents massive heap allocations by mutating instead of deeply cloning objects.
     */
    function* emitChars(
        text: string,
        updateFn: (char: string, index: number, length: number) => void,
        reasoning = false,
    ) {
        if (!text) return;
        for (let i = 0; i < text.length; i++) {
            const char = text[i]!;
            updateFn(char, i, text.length);
            yield { data: json, chunk: char, reasoning };
        }
    }

    const delta = json?.delta;
    const choices = json?.choices;
    const c0 = choices?.[0];

    // Cohere
    if (
        delta?.message?.content?.text !== undefined &&
        (json.type === 'tool-plan-delta' || json.type === 'content-delta')
    ) {
        yield* emitChars(delta.message.content.text, (c) => {
            delta.message.content.text = c;
        });
        return;
    }

    // Claude
    if (delta?.text !== undefined) {
        yield* emitChars(delta.text, (c) => {
            delta.text = c;
        });
        return;
    }

    // Claude (reasoning content)
    if (delta?.thinking !== undefined) {
        yield* emitChars(
            delta.thinking,
            (c) => {
                delta.thinking = c;
            },
            true,
        );
        return;
    }

    // Google VertexAI / AI Studio
    if (Array.isArray(json.candidates)) {
        if (json.candidates.length === 0 || json.candidates[0]?.index > 0) return null;

        const parts = json.candidates[0]?.content?.parts;
        if (!parts) return;

        if (
            parts.some(
                (p: { functionCall?: unknown; inlineData?: unknown }) =>
                    p?.functionCall || p?.inlineData,
            )
        ) {
            yield { data: json, chunk: '', reasoning: false };
            return;
        }

        for (let j = 0; j < parts.length; j++) {
            const text = parts[j]?.text;
            if (typeof text === 'string') {
                const isReasoning = parts[j].thought ?? false;
                const originalParts = parts;

                yield* emitChars(
                    text,
                    (c, i, len) => {
                        const isLastSymbol = i === len - 1;
                        const moreThanOnePart = originalParts.length > 1;
                        const isNotLastPart = j !== originalParts.length - 1;
                        const addNewline = moreThanOnePart && isNotLastPart && isLastSymbol;

                        json.candidates[0].content.parts = [
                            { ...originalParts[j], text: c + (addNewline ? '\n\n' : '') },
                        ];
                    },
                    isReasoning,
                );
            }
        }
        return;
    }

    // NovelAI / KoboldCpp Classic
    if (typeof json.token === 'string' && json.token.length > 0) {
        yield* emitChars(json.token, (c) => {
            json.token = c;
        });
        return;
    }

    // llama.cpp
    if (
        typeof json.content === 'string' &&
        json.content.length > 0 &&
        json.object !== 'chat.completion.chunk'
    ) {
        if (json?.index > 0) throw new Error('Not a primary swipe', { cause: NOT_PRIMARY });
        yield* emitChars(json.content, (c) => {
            json.content = c;
        });
        return;
    }

    // OpenAI-likes and friends
    if (Array.isArray(choices)) {
        if (choices.length === 0 || c0?.index > 0) {
            throw new Error('Not a primary swipe', { cause: NOT_PRIMARY });
        }

        if (typeof c0.text === 'string' && c0.text.length > 0) {
            yield* emitChars(c0.text, (c) => {
                c0.text = c;
                json.choices = [c0];
            });
            return;
        }

        if (typeof c0.thinking === 'string' && c0.thinking.length > 0) {
            yield* emitChars(
                c0.thinking,
                (c) => {
                    c0.thinking = c;
                    json.choices = [c0];
                },
                true,
            );
            return;
        }

        const c0Delta = c0.delta;
        if (c0Delta) {
            if (typeof c0Delta.text === 'string' && c0Delta.text.length > 0) {
                yield* emitChars(c0Delta.text, (c) => {
                    c0Delta.text = c;
                    json.choices = [c0];
                });
                return;
            }

            if (
                typeof c0Delta.reasoning_content === 'string' &&
                c0Delta.reasoning_content.length > 0
            ) {
                yield* emitChars(
                    c0Delta.reasoning_content,
                    (c, i, len) => {
                        c0Delta.reasoning_content = c;
                        c0Delta.content = i === len - 1 ? c0Delta.content : '';
                        json.choices = [c0];
                    },
                    true,
                );
                return;
            }

            if (typeof c0Delta.reasoning === 'string' && c0Delta.reasoning.length > 0) {
                yield* emitChars(
                    c0Delta.reasoning,
                    (c, i, len) => {
                        c0Delta.reasoning = c;
                        c0Delta.content = i === len - 1 ? c0Delta.content : '';
                        json.choices = [c0];
                    },
                    true,
                );
                return;
            }

            if (typeof c0Delta.content === 'string' && c0Delta.content.length > 0) {
                yield* emitChars(c0Delta.content, (c) => {
                    c0Delta.content = c;
                    json.choices = [c0];
                });
                return;
            }

            if (Array.isArray(c0Delta.content) && c0Delta.content.length > 0) {
                const thinkingText = c0Delta.content[0]?.thinking?.[0]?.text;
                if (typeof thinkingText === 'string' && thinkingText.length > 0) {
                    yield* emitChars(
                        thinkingText,
                        (c) => {
                            c0Delta.content[0].thinking[0].text = c;
                            json.choices = [c0];
                        },
                        true,
                    );
                    return;
                }
            }
        }

        if (typeof c0.message?.content === 'string' && c0.message.content.length > 0) {
            yield* emitChars(c0.message.content, (c) => {
                c0.message.content = c;
                json.choices = [c0];
            });
            return;
        }
    }

    throw new Error('Unknown event data format');
}

/**
 * Like the default one, but multiplies the events by the number of letters in the event data.
 */
export class SmoothEventSourceStream extends EventSourceStream {
    // @ts-expect-error TS(4114) FIXME: This member must have an 'override' modifier becau...
    readable: ReadableStream | null;

    constructor() {
        super();
        let lastStr = '';
        const transformStream = new TransformStream({
            async transform(chunk, controller) {
                const event = chunk;
                const data = event.data;

                try {
                    const hasFocus = document.hasFocus();

                    if (data === '[DONE]') {
                        lastStr = '';
                        return controller.enqueue(event);
                    }

                    const json = JSON.parse(data);

                    if (!json) {
                        lastStr = '';
                        return controller.enqueue(event);
                    }

                    for await (const parsed of parseStreamData(json)) {
                        if (
                            !(power_user.smooth_streaming_no_think && parsed.reasoning) &&
                            hasFocus
                        ) {
                            await delay(getDelay(lastStr));
                        }
                        controller.enqueue(
                            new MessageEvent(event.type, { data: JSON.stringify(parsed.data) }),
                        );
                        lastStr = parsed.chunk;
                    }
                } catch (error) {
                    if (error instanceof Error && error.cause !== NOT_PRIMARY) {
                        console.debug('Smooth Streaming parsing error', error);
                    }
                    controller.enqueue(event);
                }
            },
        });

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.readable = this.readable.pipeThrough(transformStream);
    }
}

/**
 *
 */
export function getEventSourceStream() {
    if (power_user.smooth_streaming) {
        return new SmoothEventSourceStream();
    }

    return new EventSourceStream();
}

export default EventSourceStream;
