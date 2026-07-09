/**
 * Add all the libraries that you want to expose to the client here.
 * They are bundled and exposed by Webpack in the /lib.js file.
 */
import * as lodash from 'es-toolkit/compat';
import Fuse from 'fuse.js';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import localspace from 'localspace';
import Handlebars from 'handlebars';
import css from '@adobe/css-tools';
import Bowser from 'bowser';
// @ts-expect-error no types
import DiffMatchPatch from 'diff-match-patch';
import { isProbablyReaderable, Readability } from '@mozilla/readability';
import SVGInject from '@iconfu/svg-inject';
// @ts-expect-error no types
import MarkdownIt from 'markdown-it';
import moment from 'moment';
// @ts-expect-error no types
import seedrandom from 'seedrandom';
// @ts-expect-error no types
import droll from 'droll';
import morphdom from 'morphdom';
import { toggle as slideToggle } from 'slidetoggle';
import chalk from 'chalk';
import yaml from 'yaml';
import * as chevrotain from 'chevrotain';
import { gzipSync, gzip } from 'fflate';
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
        // @ts-expect-error TS(2339) FIXME: Property 'Fuse' does not exist on type 'Window & t... Remove this comment to see the full error message
        window.Fuse = Fuse;
    }
    if (!('DOMPurify' in window)) {
        // @ts-expect-error TS(2339) FIXME: Property 'DOMPurify' does not exist on type 'Windo... Remove this comment to see the full error message
        window.DOMPurify = DOMPurify;
    }
    if (!('hljs' in window)) {
        // @ts-expect-error TS(2339) FIXME: Property 'hljs' does not exist on type 'Window & t... Remove this comment to see the full error message
        window.hljs = hljs;
    }
    if (!('localspace' in window)) {
        // @ts-expect-error TS(2339) FIXME: Property 'localspace' does not exist on type 'Wind... Remove this comment to see the full error message
        window.localspace = localspace;
    }
    if (!('Handlebars' in window)) {
        // @ts-expect-error TS(2339) FIXME: Property 'Handlebars' does not exist on type 'Wind... Remove this comment to see the full error message
        window.Handlebars = Handlebars;
    }
    if (!('diff_match_patch' in window)) {
        // @ts-expect-error TS(2339) FIXME: Property 'diff_match_patch' does not exist on type... Remove this comment to see the full error message
        window.diff_match_patch = DiffMatchPatch;
    }
    if (!('SVGInject' in window)) {
        // @ts-expect-error TS(2339) FIXME: Property 'SVGInject' does not exist on type 'Windo... Remove this comment to see the full error message
        window.SVGInject = SVGInject;
    }

    if (!('moment' in window)) {
        // @ts-expect-error TS(2339) FIXME: Property 'moment' does not exist on type 'Window &... Remove this comment to see the full error message
        window.moment = moment;
    }
    if (!('droll' in window)) {
        // @ts-expect-error TS(2339) FIXME: Property 'droll' does not exist on type 'Window & ... Remove this comment to see the full error message
        window.droll = droll;
    }
}

export default {
    lodash,
    Fuse,
    DOMPurify,
    hljs,
    localspace,
    Handlebars,
    css,
    Bowser,
    DiffMatchPatch,
    Readability,
    isProbablyReaderable,
    SVGInject,
    MarkdownIt,
    moment,
    seedrandom,
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
    localspace,
    Handlebars,
    css,
    Bowser,
    DiffMatchPatch,
    Readability,
    isProbablyReaderable,
    SVGInject,
    MarkdownIt,
    moment,
    seedrandom,
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
