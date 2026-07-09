// @ts-expect-error TS(1259) FIXME: Module '"node:path"' can only be default-imported ... Remove this comment to see the full error message
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error TS(1343) FIXME: The 'import.meta' meta-property is only allowed wh... Remove this comment to see the full error message
const moduleDir = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const dir = path.dirname(moduleDir);
/** In compiled binary, moduleDir is /$bunfs/root (virtual FS). Fall back to real cwd. */
export const serverDirectory = dir.startsWith('/$bunfs') ? process.cwd() : dir;
