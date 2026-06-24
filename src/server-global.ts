#!/usr/bin/env node
// @ts-expect-error TS(7017): Element implicitly has an 'any' type because type ... Remove this comment to see the full error message
globalThis.FORCE_GLOBAL_MODE = true;
// @ts-expect-error TS(7016): Could not find a declaration file for module '../s... Remove this comment to see the full error message
await import('../server.js');

export {};
