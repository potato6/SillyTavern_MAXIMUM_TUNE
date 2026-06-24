import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error TS(2339): Property 'dirname' does not exist on type 'ImportM... Remove this comment to see the full error message
export const serverDirectory = path.dirname(import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url)));
