// Plugin manager script.
// Usage:
// 1. node plugins.js update
// 2. node plugins.js install <plugin-git-url>
// More operations coming soon.
// @ts-expect-error TS(1192) FIXME: Module '"node:fs"' has no default export.
import fs from 'node:fs';
// @ts-expect-error TS(1259) FIXME: Module '"node:path"' can only be default-imported ... Remove this comment to see the full error message
import path from 'node:path';
// @ts-expect-error TS(1259) FIXME: Module '"node:process"' can only be default-import... Remove this comment to see the full error message
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// @ts-expect-error TS(2792) FIXME: Cannot find module 'simple-git'. Did you mean to s... Remove this comment to see the full error message
import { default as git, CheckRepoActions } from 'simple-git';
import { createGitClient } from './src/git/client.js';
import { color } from './src/util.js';

// @ts-expect-error TS(1343) FIXME: The 'import.meta' meta-property is only allowed wh... Remove this comment to see the full error message
const __dirname = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
process.chdir(__dirname);
const pluginsPath = './plugins';
const gitBackend = process.env.SILLYTAVERN_GIT_BACKEND || 'auto';

const command = process.argv[2];

if (!command) {
    console.log('Usage: node plugins.js <command>');
    console.log('Commands:');
    console.log('  update - Update all installed plugins');
    console.log('  install <plugin-git-url> - Install plugin from a Git URL');
    process.exit(1);
}

if (command === 'update') {
    console.log(color.magenta('Updating all plugins'));
    updatePlugins();
}

if (command === 'install') {
    const pluginName = process.argv[3];
    console.log('Installing a new plugin', color.green(pluginName));
    installPlugin(pluginName);
}

/**
 *
 */
async function updatePlugins() {
    const directories = fs.readdirSync(pluginsPath)
        // @ts-expect-error TS(7006) FIXME: Parameter 'file' implicitly has an 'any' type.
        .filter(file => !file.startsWith('.'))
        // @ts-expect-error TS(7006) FIXME: Parameter 'file' implicitly has an 'any' type.
        .filter(file => fs.statSync(path.join(pluginsPath, file)).isDirectory());

    console.log(`Found ${color.cyan(directories.length)} directories in ./plugins`);

    for (const directory of directories) {
        try {
            console.log(`Updating plugin ${color.green(directory)}...`);
            const pluginPath = path.join(pluginsPath, directory);
            const pluginRepo = git(pluginPath);

            const isRepo = await pluginRepo.checkIsRepo(CheckRepoActions.IS_REPO_ROOT);
            if (!isRepo) {
                console.log(`Directory ${color.yellow(directory)} is not a Git repository`);
                continue;
            }

            await pluginRepo.fetch();
            const commitHash = await pluginRepo.revparse(['HEAD']);
            const trackingBranch = await pluginRepo.revparse(['--abbrev-ref', '@{u}']);
            const log = await pluginRepo.log({
                from: commitHash,
                to: trackingBranch,
            });

            if (log.total === 0) {
                console.log(`Plugin ${color.blue(directory)} is already up to date`);
                continue;
            }

            await pluginRepo.pull();
            const latestCommit = await pluginRepo.revparse(['HEAD']);
            console.log(`Plugin ${color.green(directory)} updated to commit ${color.cyan(latestCommit)}`);
        } catch (error) {
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            console.error(color.red(`Failed to update plugin ${directory}: ${error.message}`));
        }
    }

    console.log(color.magenta('All plugins updated!'));
}

/**
 * @param {string} pluginName Name of the plugin to install
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'pluginName' implicitly has an 'any' typ... Remove this comment to see the full error message
async function installPlugin(pluginName) {
    try {
        const pluginPath = path.join(pluginsPath, path.basename(pluginName, '.git'));

        if (fs.existsSync(pluginPath)) {
            return console.log(color.yellow(`Directory already exists at ${pluginPath}`));
        }

        await createGitClient({ backend: gitBackend }).clone(pluginName, pluginPath, { depth: 1 });
        console.log(`Plugin ${color.green(pluginName)} installed to ${color.cyan(pluginPath)}`);
    } catch (error) {
        console.error(color.red(`Failed to install plugin ${pluginName}`), error);
    }
}
