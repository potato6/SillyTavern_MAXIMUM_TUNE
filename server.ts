#!/usr/bin/env node
import { CommandLineParser } from './src/command-line.js';
import { serverDirectory } from './src/server-directory.js';

console.log(`Node version: ${process.version}. Running in ${process.env.NODE_ENV} environment. Server directory: ${serverDirectory}`);

/**
 *
 */
async function main() {
    // config.yaml will be set when parsing command line arguments
    const cliArgs = new CommandLineParser().parse(process.argv);
    globalThis.DATA_ROOT = cliArgs.dataRoot;
    globalThis.COMMAND_LINE_ARGS = cliArgs;
    try { process.chdir(serverDirectory); } catch { /* not needed in compiled binary */ }

    try {
        // @ts-expect-error TS(1323) FIXME: Dynamic imports are only supported when the '--mod... Remove this comment to see the full error message
        await import('./src/server-main.js');
    } catch (error) {
        console.error('A critical error has occurred while starting the server:', error);
    }
}

main();
