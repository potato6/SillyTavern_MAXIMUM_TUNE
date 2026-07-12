import path from 'node:path';
import { fileURLToPath } from 'node:url';
const moduleDir = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const dir = path.dirname(moduleDir);
/** In compiled binary, moduleDir is /$bunfs/root (virtual FS). Fall back to real cwd. */
export const serverDirectory = dir.startsWith('/$bunfs') ? process.cwd() : dir;
