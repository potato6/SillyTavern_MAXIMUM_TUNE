// @ts-expect-error TS(2792) FIXME: Cannot find module 'electron'. Did you mean to set... Remove this comment to see the full error message
import { app, BrowserWindow } from 'electron';
// @ts-expect-error TS(1259) FIXME: Module '"path"' can only be default-imported using... Remove this comment to see the full error message
import path from 'path';
import { fileURLToPath } from 'url';
import yargs from 'yargs';
import { serverEvents, EVENT_NAMES } from '../server-events.js';

const cliArguments = yargs(process.argv)
    .usage('Usage: <your-start-script> [options]')
    .option('width', {
        type: 'number',
        default: 800,
        describe: 'The width of the window',
    })
    .option('height', {
        type: 'number',
        default: 600,
        describe: 'The height of the window',
    })
    .parseSync();

/** @type {string} The URL to load in the window. */
let appUrl: string;

/**
 *
 */
function createSillyTavernWindow() {
    if (!appUrl) {
        console.error('The server has not started yet.');
        return;
    }
    new BrowserWindow({
        height: cliArguments.height,
        width: cliArguments.width,
    }).loadURL(appUrl);
}

/**
 *
 */
function startServer() {
    return new Promise((_resolve, _reject) => {
        // @ts-expect-error TS(7031) FIXME: Binding element 'url' implicitly has an 'any' type... Remove this comment to see the full error message
        serverEvents.addListener(EVENT_NAMES.SERVER_STARTED, ({ url }) => {
            appUrl = url.toString();
            createSillyTavernWindow();
        });
        // @ts-expect-error TS(1343) FIXME: The 'import.meta' meta-property is only allowed wh... Remove this comment to see the full error message
        const sillyTavernRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
        process.chdir(sillyTavernRoot);

        // @ts-expect-error TS(1323) FIXME: Dynamic imports are only supported when the '--mod... Remove this comment to see the full error message
        import('../server-global.js');
    });
}

app.whenReady().then(() => {
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createSillyTavernWindow();
        }
    });

    startServer();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
