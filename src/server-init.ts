/**
 * Scripts to be done before starting the server for the first time.
 */
// @ts-expect-error TS(1259) FIXME: Module '"node:path"' can only be default-imported ... Remove this comment to see the full error message
import path from 'node:path';
// @ts-expect-error TS(1259) FIXME: Module '"node:process"' can only be default-import... Remove this comment to see the full error message
import process from 'node:process';
import { addMissingConfigValues } from './config-init.js';

try {
    addMissingConfigValues(path.join(process.cwd(), './config.yaml'));
} catch (error) {
    console.error(error);
}
