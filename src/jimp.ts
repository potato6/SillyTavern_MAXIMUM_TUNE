// @ts-expect-error TS(2792): Cannot find module '@jimp/core'. Did you mean to s... Remove this comment to see the full error message
import { createJimp } from '@jimp/core';

// Optimized image formats
// @ts-expect-error TS(2792): Cannot find module '@jimp/wasm-webp'. Did you mean... Remove this comment to see the full error message
import webp from '@jimp/wasm-webp';
// @ts-expect-error TS(2792): Cannot find module '@jimp/wasm-png'. Did you mean ... Remove this comment to see the full error message
import png from '@jimp/wasm-png';
// @ts-expect-error TS(2792): Cannot find module '@jimp/wasm-jpeg'. Did you mean... Remove this comment to see the full error message
import jpeg from '@jimp/wasm-jpeg';
// @ts-expect-error TS(2792): Cannot find module '@jimp/wasm-avif'. Did you mean... Remove this comment to see the full error message
import avif from '@jimp/wasm-avif';

// Other image formats
// @ts-expect-error TS(2792): Cannot find module '@jimp/js-bmp'. Did you mean to... Remove this comment to see the full error message
import bmp, { msBmp } from '@jimp/js-bmp';
// @ts-expect-error TS(2792): Cannot find module '@jimp/js-gif'. Did you mean to... Remove this comment to see the full error message
import gif from '@jimp/js-gif';
// @ts-expect-error TS(2792): Cannot find module '@jimp/js-tiff'. Did you mean t... Remove this comment to see the full error message
import tiff from '@jimp/js-tiff';

// Plugins
// @ts-expect-error TS(2792): Cannot find module '@jimp/plugin-blit'. Did you me... Remove this comment to see the full error message
import * as blit from '@jimp/plugin-blit';
// @ts-expect-error TS(2792): Cannot find module '@jimp/plugin-circle'. Did you ... Remove this comment to see the full error message
import * as circle from '@jimp/plugin-circle';
// @ts-expect-error TS(2792): Cannot find module '@jimp/plugin-color'. Did you m... Remove this comment to see the full error message
import * as color from '@jimp/plugin-color';
// @ts-expect-error TS(2792): Cannot find module '@jimp/plugin-contain'. Did you... Remove this comment to see the full error message
import * as contain from '@jimp/plugin-contain';
// @ts-expect-error TS(2792): Cannot find module '@jimp/plugin-cover'. Did you m... Remove this comment to see the full error message
import * as cover from '@jimp/plugin-cover';
// @ts-expect-error TS(2792): Cannot find module '@jimp/plugin-crop'. Did you me... Remove this comment to see the full error message
import * as crop from '@jimp/plugin-crop';
// @ts-expect-error TS(2792): Cannot find module '@jimp/plugin-displace'. Did yo... Remove this comment to see the full error message
import * as displace from '@jimp/plugin-displace';
// @ts-expect-error TS(2792): Cannot find module '@jimp/plugin-fisheye'. Did you... Remove this comment to see the full error message
import * as fisheye from '@jimp/plugin-fisheye';
// @ts-expect-error TS(2792): Cannot find module '@jimp/plugin-flip'. Did you me... Remove this comment to see the full error message
import * as flip from '@jimp/plugin-flip';
// @ts-expect-error TS(2792): Cannot find module '@jimp/plugin-mask'. Did you me... Remove this comment to see the full error message
import * as mask from '@jimp/plugin-mask';
// @ts-expect-error TS(2792): Cannot find module '@jimp/plugin-resize'. Did you ... Remove this comment to see the full error message
import * as resize from '@jimp/plugin-resize';
// @ts-expect-error TS(2792): Cannot find module '@jimp/plugin-rotate'. Did you ... Remove this comment to see the full error message
import * as rotate from '@jimp/plugin-rotate';
// @ts-expect-error TS(2792): Cannot find module '@jimp/plugin-threshold'. Did y... Remove this comment to see the full error message
import * as threshold from '@jimp/plugin-threshold';
// @ts-expect-error TS(2792): Cannot find module '@jimp/plugin-quantize'. Did yo... Remove this comment to see the full error message
import * as quantize from '@jimp/plugin-quantize';

const defaultPlugins = [
    blit.methods,
    circle.methods,
    color.methods,
    contain.methods,
    cover.methods,
    crop.methods,
    displace.methods,
    fisheye.methods,
    flip.methods,
    mask.methods,
    resize.methods,
    rotate.methods,
    threshold.methods,
    quantize.methods,
];

// A custom jimp that uses WASM for optimized formats and JS for the rest
const Jimp = createJimp({
    formats: [webp, png, jpeg, avif, bmp, msBmp, gif, tiff],
    plugins: [...defaultPlugins],
});

const JimpMime = {
    bmp: bmp().mime,
    gif: gif().mime,
    jpeg: jpeg().mime,
    png: png().mime,
    tiff: tiff().mime,
};

export default Jimp;

export { Jimp, JimpMime };
