import path from 'node:path';
import fs from 'node:fs';
import type { Request, Response, NextFunction } from 'express';

import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import { CheckRepoActions, default as simpleGit } from 'simple-git';

import { PUBLIC_DIRECTORIES } from '../constants.js';
import { getConfigValue, isValidUrl } from '../util.js';
import { createGitClient } from '../git/client.js';

const gitBackend = getConfigValue('git.backend', 'auto');

/**
 * @type {Partial<import('simple-git').SimpleGitOptions>}
 */
const OPTIONS = Object.freeze({ timeout: { block: 5 * 60 * 1000 } });

/**
 * This function extracts the extension information from the manifest file.
 * @param {string} extensionPath - The path of the extension folder
 * @returns {Promise<object>} - Returns the manifest data as an object
 */
async function getManifest(extensionPath: string) {
    const manifestPath = path.join(extensionPath, 'manifest.json');

    // Check if manifest.json exists
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`Manifest file not found at ${manifestPath}`);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return manifest;
}

/**
 * This function checks if the local repository is up-to-date with the remote repository.
 * @param {string} extensionPath - The path of the extension folder
 * @returns {Promise<object>} - Returns the extension information as an object
 */
async function checkIfRepoIsUpToDate(extensionPath: string) {
    const git = simpleGit({ baseDir: extensionPath, ...OPTIONS });
    await git.fetch('origin');
    const currentBranch = await git.branch();
    const currentCommitHash = await git.revparse(['HEAD']);
    const log = await git.log({
        from: currentCommitHash,
        to: `origin/${currentBranch.current}`,
    });

    // Fetch remote repository information
    const remotes = await git.getRemotes(true);
    if (remotes.length === 0) {
        return {
            isUpToDate: true,
            remoteUrl: '',
        };
    }

    return {
        isUpToDate: log.total === 0,
        remoteUrl: remotes[0]!.refs.fetch, // URL of the remote repository
    };
}

export const router = new Elysia({ prefix: '/api/extensions' })
    .onBeforeHandle((context) => {
        const enabled = !!getConfigValue('extensions.enabled', true, 'boolean');
        if (!enabled) {
            context.set.status = 404;
            return 'Extensions are disabled';
        }
    })
    .post('/install', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const profile = user?.profile as Record<string, unknown> | undefined;

        try {
            const { url, global, branch } = body;

            if (global && !profile?.admin) {
                console.error(
                    `User ${profile?.handle} does not have permission to install global extensions.`,
                );
                set.status = 403;
                return 'Forbidden: No permission to install global extensions.';
            }

            if (!isValidUrl(url as string)) {
                set.status = 400;
                return 'Bad Request: A valid URL is required in the request body.';
            }

            const parsedUrl = new URL(url as string);
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                set.status = 400;
                return 'Bad Request: Only HTTP and HTTPS protocols are supported for the Extension URL.';
            }

            const git = createGitClient({ backend: gitBackend });

            // make sure the third-party directory exists
            if (!fs.existsSync(path.join(directories?.extensions ?? ''))) {
                fs.mkdirSync(path.join(directories?.extensions ?? ''));
            }

            if (!fs.existsSync(PUBLIC_DIRECTORIES.globalExtensions)) {
                fs.mkdirSync(PUBLIC_DIRECTORIES.globalExtensions);
            }

            const basePath = global
                ? PUBLIC_DIRECTORIES.globalExtensions
                : (directories?.extensions ?? '');
            const extensionNameSanitized = sanitize(path.basename(parsedUrl.pathname, '.git'));
            if (!extensionNameSanitized) {
                set.status = 400;
                return 'Could not determine the extension name from the URL. Please provide a valid git repository URL.';
            }

            const extensionPath = path.join(basePath, extensionNameSanitized);
            const folderName = path.basename(extensionPath);

            if (fs.existsSync(extensionPath)) {
                set.status = 409;
                return `Directory already exists at ${extensionPath}`;
            }

            const cloneOptions: Record<string, unknown> = { depth: 1 };
            if (branch) {
                cloneOptions.branch = branch;
            }
            await git.clone(parsedUrl.href, extensionPath, cloneOptions);
            console.info(
                `Extension has been cloned to ${extensionPath} from ${parsedUrl.href} at ${branch || '(default)'} branch`,
            );

            try {
                const manifest = await getManifest(extensionPath);
                if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
                    throw new Error('Manifest is not a valid JSON object.');
                }
                const { version, author, display_name } = manifest;
                return { version, author, display_name, extensionPath, folderName };
            } catch (manifestError) {
                await fs.promises.rm(extensionPath, { recursive: true, force: true });
                throw manifestError;
            }
        } catch (error) {
            console.error('Importing extension failed', error);
            set.status = 500;
            return 'Internal Server Error. Check the server logs for more details.';
        }
    })
    .post('/update', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const profile = user?.profile as Record<string, unknown> | undefined;

        try {
            if (typeof body.extensionName !== 'string') {
                set.status = 400;
                return 'Bad Request: A valid extensionName is required in the request body.';
            }

            const { extensionName, global } = body;
            const extensionNameSanitized = sanitize(extensionName as string);
            if (!extensionNameSanitized) {
                set.status = 400;
                return 'Bad Request: A valid extensionName is required in the request body.';
            }

            if (global && !profile?.admin) {
                console.error(
                    `User ${profile?.handle} does not have permission to update global extensions.`,
                );
                set.status = 403;
                return 'Forbidden: No permission to update global extensions.';
            }

            const basePath = global
                ? PUBLIC_DIRECTORIES.globalExtensions
                : (directories?.extensions ?? '');
            const extensionPath = path.join(basePath, extensionNameSanitized);

            if (!fs.existsSync(extensionPath)) {
                set.status = 404;
                return `Directory does not exist at ${extensionPath}`;
            }

            const { isUpToDate, remoteUrl } = await checkIfRepoIsUpToDate(extensionPath);
            const git = simpleGit({ baseDir: extensionPath, ...OPTIONS });
            const isRepo = await git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT);
            if (!isRepo) {
                throw new Error(`Directory is not a Git repository at ${extensionPath}`);
            }
            const currentBranch = await git.branch();
            if (!isUpToDate) {
                await git.pull('origin', currentBranch.current);
                console.info(`Extension has been updated at ${extensionPath}`);
            } else {
                console.info(`Extension is up to date at ${extensionPath}`);
            }
            await git.fetch('origin');
            const fullCommitHash = await git.revparse(['HEAD']);
            const shortCommitHash = fullCommitHash.slice(0, 7);

            return { shortCommitHash, extensionPath, isUpToDate, remoteUrl };
        } catch (error) {
            console.error('Updating extension failed', error);
            set.status = 500;
            return 'Internal Server Error. Check the server logs for more details.';
        }
    })
    .post('/branches', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const profile = user?.profile as Record<string, unknown> | undefined;

        try {
            if (typeof body.extensionName !== 'string') {
                set.status = 400;
                return 'Bad Request: A valid extensionName is required in the request body.';
            }

            const { extensionName, global } = body;
            const extensionNameSanitized = sanitize(extensionName as string);
            if (!extensionNameSanitized) {
                set.status = 400;
                return 'Bad Request: A valid extensionName is required in the request body.';
            }

            if (global && !profile?.admin) {
                console.error(
                    `User ${profile?.handle} does not have permission to list branches of global extensions.`,
                );
                set.status = 403;
                return 'Forbidden: No permission to list branches of global extensions.';
            }

            const basePath = global
                ? PUBLIC_DIRECTORIES.globalExtensions
                : (directories?.extensions ?? '');
            const extensionPath = path.join(basePath, extensionNameSanitized);

            if (!fs.existsSync(extensionPath)) {
                set.status = 404;
                return `Directory does not exist at ${extensionPath}`;
            }

            const git = simpleGit({ baseDir: extensionPath, ...OPTIONS });
            // Unshallow the repository if it is shallow
            const isShallow = (await git.revparse(['--is-shallow-repository'])) === 'true';
            if (isShallow) {
                console.info(`Unshallowing the repository at ${extensionPath}`);
                await git.fetch('origin', ['--unshallow']);
            }

            // Fetch all branches
            await git.remote(['set-branches', 'origin', '*']);
            await git.fetch('origin');
            const localBranches = await git.branchLocal();
            const remoteBranches = await git.branch(['-r', '--list', 'origin/*']);
            const result = [
                ...Object.values(localBranches.branches),
                ...Object.values(remoteBranches.branches),
            ].map((b) => ({ current: b.current, commit: b.commit, name: b.name, label: b.label }));

            return result;
        } catch (error) {
            console.error('Getting branches failed', error);
            set.status = 500;
            return 'Internal Server Error. Check the server logs for more details.';
        }
    })
    .post('/switch', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const profile = user?.profile as Record<string, unknown> | undefined;

        try {
            if (typeof body.extensionName !== 'string') {
                set.status = 400;
                return 'Bad Request: A valid extensionName is required in the request body.';
            }

            const { extensionName, branch, global } = body;
            const extensionNameSanitized = sanitize(extensionName as string);
            if (!extensionNameSanitized || !branch) {
                set.status = 400;
                return 'Bad Request: A valid extensionName and branch are required in the request body.';
            }

            if (global && !profile?.admin) {
                console.error(
                    `User ${profile?.handle} does not have permission to switch branches of global extensions.`,
                );
                set.status = 403;
                return 'Forbidden: No permission to switch branches of global extensions.';
            }

            const basePath = global
                ? PUBLIC_DIRECTORIES.globalExtensions
                : (directories?.extensions ?? '');
            const extensionPath = path.join(basePath, extensionNameSanitized);

            if (!fs.existsSync(extensionPath)) {
                set.status = 404;
                return `Directory does not exist at ${extensionPath}`;
            }

            const git = simpleGit({ baseDir: extensionPath, ...OPTIONS });
            const branches = await git.branchLocal();

            if (String(branch).startsWith('origin/')) {
                const localBranch = String(branch).replace('origin/', '');
                if (branches.all.includes(localBranch)) {
                    console.info(`Branch ${localBranch} already exists locally, checking it out`);
                    await git.checkout(localBranch);
                    set.status = 204;
                    return;
                }

                console.info(
                    `Branch ${localBranch} does not exist locally, creating it from ${branch}`,
                );
                await git.checkoutBranch(localBranch, String(branch));
                set.status = 204;
                return;
            }

            if (!branches.all.includes(String(branch))) {
                console.error(`Branch ${branch} does not exist locally`);
                set.status = 404;
                return `Branch ${branch} does not exist locally`;
            }

            // Check if the branch is already checked out
            const currentBranch = await git.branch();
            if (currentBranch.current === branch) {
                console.info(`Branch ${branch} is already checked out`);
                set.status = 204;
                return;
            }

            // Checkout the branch
            await git.checkout(String(branch));
            console.info(`Checked out branch ${branch} at ${extensionPath}`);

            set.status = 204;
            return;
        } catch (error) {
            console.error('Switching branches failed', error);
            set.status = 500;
            return 'Internal Server Error. Check the server logs for more details.';
        }
    })
    .post('/move', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const profile = user?.profile as Record<string, unknown> | undefined;

        try {
            if (typeof body.extensionName !== 'string') {
                set.status = 400;
                return 'Bad Request: A valid extensionName is required in the request body.';
            }

            const { extensionName, source, destination } = body;
            const extensionNameSanitized = sanitize(extensionName as string);
            if (!extensionNameSanitized || !source || !destination) {
                set.status = 400;
                return 'Bad Request: A valid extensionName, source, and destination are required in the request body.';
            }

            if (!profile?.admin) {
                console.error(
                    `User ${profile?.handle} does not have permission to move extensions.`,
                );
                set.status = 403;
                return 'Forbidden: No permission to move extensions.';
            }

            const sourceDirectory =
                source === 'global'
                    ? PUBLIC_DIRECTORIES.globalExtensions
                    : (directories?.extensions ?? '');
            const destinationDirectory =
                destination === 'global'
                    ? PUBLIC_DIRECTORIES.globalExtensions
                    : (directories?.extensions ?? '');
            const sourcePath = path.join(sourceDirectory, extensionNameSanitized);
            const destinationPath = path.join(destinationDirectory, extensionNameSanitized);

            if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) {
                console.error(`Source directory does not exist at ${sourcePath}`);
                set.status = 404;
                return 'Source directory does not exist.';
            }

            if (fs.existsSync(destinationPath)) {
                console.error(`Destination directory already exists at ${destinationPath}`);
                set.status = 409;
                return 'Destination directory already exists.';
            }

            if (source === destination) {
                console.error('Source and destination directories are the same');
                set.status = 409;
                return 'Source and destination directories are the same.';
            }

            fs.cpSync(sourcePath, destinationPath, { recursive: true, force: true });
            fs.rmSync(sourcePath, { recursive: true, force: true });
            console.info(`Extension has been moved from ${sourcePath} to ${destinationPath}`);

            set.status = 204;
            return;
        } catch (error) {
            console.error('Moving extension failed', error);
            set.status = 500;
            return 'Internal Server Error. Check the server logs for more details.';
        }
    })
    .post('/version', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;

        try {
            if (typeof body.extensionName !== 'string') {
                set.status = 400;
                return 'Bad Request: A valid extensionName is required in the request body.';
            }

            const { extensionName, global } = body;
            const extensionNameSanitized = sanitize(extensionName as string);
            if (!extensionNameSanitized) {
                set.status = 400;
                return 'Bad Request: A valid extensionName is required in the request body.';
            }

            const basePath = global
                ? PUBLIC_DIRECTORIES.globalExtensions
                : (directories?.extensions ?? '');
            const extensionPath = path.join(basePath, extensionNameSanitized);

            if (!fs.existsSync(extensionPath)) {
                set.status = 404;
                return `Directory does not exist at ${extensionPath}`;
            }

            const git = simpleGit({ baseDir: extensionPath, ...OPTIONS });
            let currentCommitHash;
            try {
                const isRepo = await git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT);
                if (!isRepo) {
                    throw new Error(`Directory is not a Git repository at ${extensionPath}`);
                }
                currentCommitHash = await git.revparse(['HEAD']);
            } catch {
                // it is not a git repo, or has no commits yet, or is a bare repo
                // not possible to update it, most likely can't get the branch name either
                return {
                    currentBranchName: '',
                    currentCommitHash: '',
                    isUpToDate: true,
                    remoteUrl: '',
                };
            }

            const currentBranch = await git.branch();
            // get only the working branch
            const currentBranchName = currentBranch.current;
            await git.fetch('origin');
            console.debug(extensionNameSanitized, currentBranchName, currentCommitHash);
            const { isUpToDate, remoteUrl } = await checkIfRepoIsUpToDate(extensionPath);

            return { currentBranchName, currentCommitHash, isUpToDate, remoteUrl };
        } catch (error) {
            console.error('Getting extension version failed', error);
            set.status = 500;
            return 'Internal Server Error. Check the server logs for more details.';
        }
    })
    .post('/delete', async (context) => {
        const { set } = context;
        const body = context.body as Record<string, unknown>;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const profile = user?.profile as Record<string, unknown> | undefined;

        try {
            if (typeof body.extensionName !== 'string') {
                set.status = 400;
                return 'Bad Request: A valid extensionName is required in the request body.';
            }

            const { extensionName, global } = body;
            const extensionNameSanitized = sanitize(extensionName as string);
            if (!extensionNameSanitized) {
                set.status = 400;
                return 'Bad Request: A valid extensionName is required in the request body.';
            }

            if (global && !profile?.admin) {
                console.error(
                    `User ${profile?.handle} does not have permission to delete global extensions.`,
                );
                set.status = 403;
                return 'Forbidden: No permission to delete global extensions.';
            }

            const basePath = global
                ? PUBLIC_DIRECTORIES.globalExtensions
                : (directories?.extensions ?? '');
            const extensionPath = path.join(basePath, extensionNameSanitized);

            if (!fs.existsSync(extensionPath)) {
                set.status = 404;
                return `Directory does not exist at ${extensionPath}`;
            }

            await fs.promises.rm(extensionPath, { recursive: true });
            console.info(`Extension has been deleted at ${extensionPath}`);

            return `Extension has been deleted at ${extensionPath}`;
        } catch (error) {
            console.error('Deleting extension failed', error);
            set.status = 500;
            return 'Internal Server Error. Check the server logs for more details.';
        }
    })
    .get('/discover', (context) => {
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const profile = user?.profile as Record<string, unknown> | undefined;

        if (!fs.existsSync(path.join(directories?.extensions ?? ''))) {
            fs.mkdirSync(path.join(directories?.extensions ?? ''));
        }

        if (!fs.existsSync(PUBLIC_DIRECTORIES.globalExtensions)) {
            fs.mkdirSync(PUBLIC_DIRECTORIES.globalExtensions);
        }

        // Get all folders in system extensions folder, excluding third-party
        const builtInExtensions = fs
            .readdirSync(PUBLIC_DIRECTORIES.extensions)
            .filter((f) => fs.statSync(path.join(PUBLIC_DIRECTORIES.extensions, f)).isDirectory())
            .filter((f) => f !== 'third-party')
            .map((f) => ({ type: 'system', name: f }));

        // Get all folders in local extensions folder
        const userExtensions = fs
            .readdirSync(path.join(directories?.extensions ?? ''))
            .filter((f) => fs.statSync(path.join(directories?.extensions ?? '', f)).isDirectory())
            .map((f) => ({ type: 'local', name: `third-party/${f}` }));

        // Get all folders in global extensions folder
        // In case of a conflict, the extension will be loaded from the user folder
        const globalExtensions = fs
            .readdirSync(PUBLIC_DIRECTORIES.globalExtensions)
            .filter((f) =>
                fs.statSync(path.join(PUBLIC_DIRECTORIES.globalExtensions, f)).isDirectory(),
            )
            .map((f) => ({ type: 'global', name: `third-party/${f}` }))
            .filter((f) => !userExtensions.some((e) => e.name === f.name));

        // Combine all extensions
        const allExtensions = [...builtInExtensions, ...userExtensions, ...globalExtensions];
        console.debug('Extensions available for', profile?.handle, allExtensions);

        return allExtensions;
    });

/**
 * Feature flag guard: don't allow calling any of the endpoints if extensions are disabled
 * @type {import('express').RequestHandler}
 */
export const extensionsEnabledFeatureGuard = (
    _: Request,
    response: Response,
    next: NextFunction,
) => {
    const enabled = !!getConfigValue('extensions.enabled', true, 'boolean');
    if (!enabled) {
        response.sendStatus(404);
        return;
    }
    next();
};
