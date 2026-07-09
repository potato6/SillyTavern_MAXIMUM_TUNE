import { crc32 } from 'crc';
import { Buffer } from 'node:buffer';

/**
 * Encodes PNG chunks into a PNG file format buffer.
 * @param {Array<{ name: string; data: Uint8Array }>} chunks Array of PNG chunks
 * @returns {Uint8Array} Encoded PNG data
 * @copyright Based on https://github.com/hughsk/png-chunks-encode (MIT)
 */
export default function encode(chunks: { name: string; data: Uint8Array }[]) {
    const uint8 = new Uint8Array(4);
    const int32 = new Int32Array(uint8.buffer);
    const uint32 = new Uint32Array(uint8.buffer);

    let totalSize = 8;
    let idx = totalSize;

    for (let i = 0; i < chunks.length; i++) {
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        totalSize += chunks[i].data.length;
        totalSize += 12;
    }

    const output = new Uint8Array(totalSize);

    output[0] = 0x89;
    output[1] = 0x50;
    output[2] = 0x4E;
    output[3] = 0x47;
    output[4] = 0x0D;
    output[5] = 0x0A;
    output[6] = 0x1A;
    output[7] = 0x0A;

    for (let i = 0; i < chunks.length; i++) {
        // @ts-expect-error TS(2339) FIXME: Property 'name' does not exist on type '{ name: st... Remove this comment to see the full error message
        const { name, data } = chunks[i];
        const size = data.length;
        const nameChars = [
            name.charCodeAt(0),
            name.charCodeAt(1),
            name.charCodeAt(2),
            name.charCodeAt(3),
        ];

        uint32[0] = size;
        // @ts-expect-error TS(2322) FIXME: Type 'number | undefined' is not assignable to typ... Remove this comment to see the full error message
        output[idx++] = uint8[3];
        // @ts-expect-error TS(2322) FIXME: Type 'number | undefined' is not assignable to typ... Remove this comment to see the full error message
        output[idx++] = uint8[2];
        // @ts-expect-error TS(2322) FIXME: Type 'number | undefined' is not assignable to typ... Remove this comment to see the full error message
        output[idx++] = uint8[1];
        // @ts-expect-error TS(2322) FIXME: Type 'number | undefined' is not assignable to typ... Remove this comment to see the full error message
        output[idx++] = uint8[0];

        output[idx++] = nameChars[0];
        output[idx++] = nameChars[1];
        output[idx++] = nameChars[2];
        output[idx++] = nameChars[3];

        for (let j = 0; j < size;) {
            output[idx++] = data[j++];
        }

        const crc = crc32(data, crc32(new Uint8Array(nameChars) as Buffer));

        int32[0] = crc;
        // @ts-expect-error TS(2322) FIXME: Type 'number | undefined' is not assignable to typ... Remove this comment to see the full error message
        output[idx++] = uint8[3];
        // @ts-expect-error TS(2322) FIXME: Type 'number | undefined' is not assignable to typ... Remove this comment to see the full error message
        output[idx++] = uint8[2];
        // @ts-expect-error TS(2322) FIXME: Type 'number | undefined' is not assignable to typ... Remove this comment to see the full error message
        output[idx++] = uint8[1];
        // @ts-expect-error TS(2322) FIXME: Type 'number | undefined' is not assignable to typ... Remove this comment to see the full error message
        output[idx++] = uint8[0];
    }

    return output;
}
