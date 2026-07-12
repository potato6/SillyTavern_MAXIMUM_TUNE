#!/usr/bin/env node
import { CommandLineParser } from './src/command-line.js';
import { serverDirectory } from './src/server-directory.js';

console.log(`Node version: ${process.version}. Running in ${process.env.NODE_ENV} environment. Server directory: ${serverDirectory}`);

async function main() {
    const cliArgs = new CommandLineParser().parse(process.argv);
    globalThis.DATA_ROOT = cliArgs.dataRoot;
    globalThis.COMMAND_LINE_ARGS = cliArgs;
    try { process.chdir(serverDirectory); } catch { /* not needed in compiled binary */ }

    try {
        await import('./src/server.js');
    } catch (error) {
        console.error('A critical error has occurred while starting the server:', error);
    }
}

main();
