#!/usr/bin/env node
globalThis.FORCE_GLOBAL_MODE = true;
// @ts-expect-error TS(1378) FIXME: Top-level 'await' expressions are only allowed whe... Remove this comment to see the full error message
await import('../server.js');

export {};
