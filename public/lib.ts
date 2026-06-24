/**
 * Add all the libraries that you want to expose to the client here.
 * They are bundled and exposed by Webpack in the /lib.js file.
 */
import lodash from 'lodash';
// @ts-expect-error TS(2792): Cannot find module 'fuse.js'. Did you mean to set ... Remove this comment to see the full error message
import Fuse from 'fuse.js';
// @ts-expect-error TS(2792): Cannot find module 'dompurify'. Did you mean to se... Remove this comment to see the full error message
import DOMPurify from 'dompurify';
// @ts-expect-error TS(2792): Cannot find module 'highlight.js'. Did you mean to... Remove this comment to see the full error message
import hljs from 'highlight.js';
// @ts-expect-error TS(2792): Cannot find module 'localforage'. Did you mean to ... Remove this comment to see the full error message
import localforage from 'localforage';
// @ts-expect-error TS(2792): Cannot find module 'handlebars'. Did you mean to s... Remove this comment to see the full error message
import Handlebars from 'handlebars';
// @ts-expect-error TS(2792): Cannot find module '@adobe/css-tools'. Did you mea... Remove this comment to see the full error message
import css from '@adobe/css-tools';
// @ts-expect-error TS(2792): Cannot find module 'bowser'. Did you mean to set t... Remove this comment to see the full error message
import Bowser from 'bowser';
// @ts-expect-error TS(2792): Cannot find module 'diff-match-patch'. Did you mea... Remove this comment to see the full error message
import DiffMatchPatch from 'diff-match-patch';
// @ts-expect-error TS(2792): Cannot find module '@mozilla/readability'. Did you... Remove this comment to see the full error message
import { isProbablyReaderable, Readability } from '@mozilla/readability';
// @ts-expect-error TS(2792): Cannot find module '@iconfu/svg-inject'. Did you m... Remove this comment to see the full error message
import SVGInject from '@iconfu/svg-inject';
// @ts-expect-error TS(2792): Cannot find module 'showdown'. Did you mean to set... Remove this comment to see the full error message
import showdown from 'showdown';
// @ts-expect-error TS(2792): Cannot find module 'moment'. Did you mean to set t... Remove this comment to see the full error message
import moment from 'moment';
// @ts-expect-error TS(2792): Cannot find module 'seedrandom'. Did you mean to s... Remove this comment to see the full error message
import seedrandom from 'seedrandom';
// @ts-expect-error TS(2792): Cannot find module '@popperjs/core'. Did you mean ... Remove this comment to see the full error message
import * as Popper from '@popperjs/core';
// @ts-expect-error TS(2792): Cannot find module 'droll'. Did you mean to set th... Remove this comment to see the full error message
import droll from 'droll';
// @ts-expect-error TS(2792): Cannot find module 'morphdom'. Did you mean to set... Remove this comment to see the full error message
import morphdom from 'morphdom';
// @ts-expect-error TS(2792): Cannot find module 'slidetoggle'. Did you mean to ... Remove this comment to see the full error message
import { toggle as slideToggle } from 'slidetoggle';
// @ts-expect-error TS(2792): Cannot find module 'chalk'. Did you mean to set th... Remove this comment to see the full error message
import chalk from 'chalk';
// @ts-expect-error TS(2792): Cannot find module 'yaml'. Did you mean to set the... Remove this comment to see the full error message
import yaml from 'yaml';
// @ts-expect-error TS(2792): Cannot find module 'chevrotain'. Did you mean to s... Remove this comment to see the full error message
import * as chevrotain from 'chevrotain';
// @ts-expect-error TS(2792): Cannot find module 'fflate'. Did you mean to set t... Remove this comment to see the full error message
import { gzipSync, gzip } from 'fflate';
// @ts-expect-error TS(2792): Cannot find module 'js-sha256'. Did you mean to se... Remove this comment to see the full error message
import { sha256 } from 'js-sha256';

/**
 * Expose the libraries to the 'window' object.
 * Needed for compatibility with old extensions.
 * Note: New extensions are encouraged to import the libraries directly from lib.js.
 */
export function initLibraryShims() {
    if (!window) {
        return;
    }
    if (!('Fuse' in window)) {
        // @ts-expect-error TS(2339): Property 'Fuse' does not exist on type 'Window & t... Remove this comment to see the full error message
        window.Fuse = Fuse;
    }
    if (!('DOMPurify' in window)) {
        // @ts-expect-error TS(2339): Property 'DOMPurify' does not exist on type 'Windo... Remove this comment to see the full error message
        window.DOMPurify = DOMPurify;
    }
    if (!('hljs' in window)) {
        // @ts-expect-error TS(2339): Property 'hljs' does not exist on type 'Window & t... Remove this comment to see the full error message
        window.hljs = hljs;
    }
    if (!('localforage' in window)) {
        // @ts-expect-error TS(2551): Property 'localforage' does not exist on type 'Win... Remove this comment to see the full error message
        window.localforage = localforage;
    }
    if (!('Handlebars' in window)) {
        // @ts-expect-error TS(2339): Property 'Handlebars' does not exist on type 'Wind... Remove this comment to see the full error message
        window.Handlebars = Handlebars;
    }
    if (!('diff_match_patch' in window)) {
        // @ts-expect-error TS(2339): Property 'diff_match_patch' does not exist on type... Remove this comment to see the full error message
        window.diff_match_patch = DiffMatchPatch;
    }
    if (!('SVGInject' in window)) {
        // @ts-expect-error TS(2339): Property 'SVGInject' does not exist on type 'Windo... Remove this comment to see the full error message
        window.SVGInject = SVGInject;
    }
    if (!('showdown' in window)) {
        // @ts-expect-error TS(2339): Property 'showdown' does not exist on type 'Window... Remove this comment to see the full error message
        window.showdown = showdown;
    }
    if (!('moment' in window)) {
        // @ts-expect-error TS(2339): Property 'moment' does not exist on type 'Window &... Remove this comment to see the full error message
        window.moment = moment;
    }
    if (!('Popper' in window)) {
        // @ts-expect-error TS(2339): Property 'Popper' does not exist on type 'Window &... Remove this comment to see the full error message
        window.Popper = Popper;
    }
    if (!('droll' in window)) {
        // @ts-expect-error TS(2339): Property 'droll' does not exist on type 'Window & ... Remove this comment to see the full error message
        window.droll = droll;
    }
}

export default {
    lodash,
    Fuse,
    DOMPurify,
    hljs,
    localforage,
    Handlebars,
    css,
    Bowser,
    DiffMatchPatch,
    Readability,
    isProbablyReaderable,
    SVGInject,
    showdown,
    moment,
    seedrandom,
    Popper,
    droll,
    morphdom,
    slideToggle,
    chalk,
    yaml,
    chevrotain,
    gzipSync,
    gzip,
    sha256,
};

export {
    lodash,
    Fuse,
    DOMPurify,
    hljs,
    localforage,
    Handlebars,
    css,
    Bowser,
    DiffMatchPatch,
    Readability,
    isProbablyReaderable,
    SVGInject,
    showdown,
    moment,
    seedrandom,
    Popper,
    droll,
    morphdom,
    slideToggle,
    chalk,
    yaml,
    chevrotain,
    gzipSync,
    gzip,
    sha256,
};
