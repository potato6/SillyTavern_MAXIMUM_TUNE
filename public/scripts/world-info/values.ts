import { wiManager } from './manager.js';

/**
 * Shared world info values used across multiple modules.
 * Importing from this file avoids circular dependency chains
 * that occur when importing from world-info.ts.
 */

/**
 * Returns the current list of world info file names.
 * Uses wiManager as the single source of truth.
 */
export function getWorldNames(): string[] {
    return wiManager.worldNames;
}
