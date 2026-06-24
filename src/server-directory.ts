import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error TS(1470): The 'import.meta' meta-property is not allowed in ... Remove this comment to see the full error message
export const serverDirectory = path.dirname(import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url)));
