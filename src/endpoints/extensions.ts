import path from 'node:path';
import fsp from 'node:fs/promises';
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

interface UserDirectories {
    extensions?: string;
    [key: string]: unknown;
}

interface UserProfile {
    admin?: boolean;
    handle?: string;
    [key: string]: unknown;
}

interface UserContext {
    directories?: UserDirectories;
    profile?: UserProfile;
    [key: string]: unknown;
}

/**
 * This function extracts the extension information from the manifest file.
 * @param {string} extensionPath - The path of the extension folder
 * @returns {Promise<object>} - Returns the manifest data as an object
 */
async function getManifest(extensionPath: string) {
    const manifestPath = path.join(extensionPath, 'manifest.json');

    try {
        const content = await fsp.readFile(manifestPath, 'utf8');
        return JSON.parse(content);
    } catch {
        throw new Error(`Manifest file not found at ${manifestPath}`);
    }
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

    const remotes = await git.getRemotes(true);
    if (remotes.length === 0) {
        return {
            isUpToDate: true,
            remoteUrl: '',
        };
    }

    return {
        isUpToDate: log.total === 0,
        remoteUrl: remotes[0]!.refs.fetch,
    };
}

export const router = new Elysia({ prefix: '/api/extensions', aot: false })
    .onBeforeHandle((context) => {
        const enabled = !!getConfigValue('extensions.enabled', true, 'boolean');
        if (!enabled) {
            context.set.status = 404;
            return 'Extensions are disabled';
        }
    })
    .post('/install', async (context) => {
        const { set } = context;

        const body = context.body as Record<string, unknown> | undefined;
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;
        const profile = user?.profile;

        try {
            if (!body) {
                set.status = 400;
                return 'Bad Request';
            }

            const { url, global, branch } = body;

            if (global && !profile?.admin) {
                console.error(
                    `User ${profile?.handle} does not have permission to install global extensions.`,
                );
                set.status = 403;
                return 'Forbidden: No permission to install global extensions.';
            }

            if (typeof url !== 'string' || !isValidUrl(url)) {
                set.status = 400;
                return 'Bad Request: A valid URL is required in the request body.';
            }

            const parsedUrl = new URL(url);
            const protocol = parsedUrl.protocol;
            if (protocol !== 'http:' && protocol !== 'https:') {
                set.status = 400;
                return 'Bad Request: Only HTTP and HTTPS protocols are supported for the Extension URL.';
            }

            const git = createGitClient({ backend: gitBackend });

            const userExtDir = directories?.extensions ?? '';
            if (userExtDir) {
                await fsp.mkdir(userExtDir, { recursive: true });
            }
            await fsp.mkdir(PUBLIC_DIRECTORIES.globalExtensions, { recursive: true });

            const basePath = global ? PUBLIC_DIRECTORIES.globalExtensions : userExtDir;

            const pathname = parsedUrl.pathname;
            const lastSlash = Math.max(pathname.lastIndexOf('/'), pathname.lastIndexOf('\\'));
            let rawName = lastSlash !== -1 ? pathname.slice(lastSlash + 1) : pathname;
            if (rawName.endsWith('.git')) {
                rawName = rawName.slice(0, -4);
            }

            const extensionNameSanitized = sanitize(rawName);
            if (!extensionNameSanitized) {
                set.status = 400;
                return 'Could not determine the extension name from the URL. Please provide a valid git repository URL.';
            }

            const extensionPath = path.join(basePath, extensionNameSanitized);
            const folderName = extensionNameSanitized;

            try {
                await fsp.access(extensionPath);
                set.status = 409;
                return `Directory already exists at ${extensionPath}`;
            } catch {
                // Extension directory does not exist, proceed
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
                await fsp.rm(extensionPath, { recursive: true, force: true });
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

        const body = context.body as Record<string, unknown> | undefined;
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;
        const profile = user?.profile;

        try {
            if (!body || typeof body.extensionName !== 'string') {
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

            try {
                await fsp.access(extensionPath);
            } catch {
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

        const body = context.body as Record<string, unknown> | undefined;
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;
        const profile = user?.profile;

        try {
            if (!body || typeof body.extensionName !== 'string') {
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

            try {
                await fsp.access(extensionPath);
            } catch {
                set.status = 404;
                return `Directory does not exist at ${extensionPath}`;
            }

            const git = simpleGit({ baseDir: extensionPath, ...OPTIONS });
            const isShallow = (await git.revparse(['--is-shallow-repository'])) === 'true';
            if (isShallow) {
                console.info(`Unshallowing the repository at ${extensionPath}`);
                await git.fetch('origin', ['--unshallow']);
            }

            await git.remote(['set-branches', 'origin', '*']);
            await git.fetch('origin');
            const localBranches = await git.branchLocal();
            const remoteBranches = await git.branch(['-r', '--list', 'origin/*']);

            const localVals = Object.values(localBranches.branches);
            const remoteVals = Object.values(remoteBranches.branches);

            const result = [
                ...localVals.map((b) => ({
                    current: b.current,
                    commit: b.commit,
                    name: b.name,
                    label: b.label,
                })),
                ...remoteVals.map((b) => ({
                    current: b.current,
                    commit: b.commit,
                    name: b.name,
                    label: b.label,
                })),
            ];

            return result;
        } catch (error) {
            console.error('Getting branches failed', error);
            set.status = 500;
            return 'Internal Server Error. Check the server logs for more details.';
        }
    })
    .post('/switch', async (context) => {
        const { set } = context;

        const body = context.body as Record<string, unknown> | undefined;
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;
        const profile = user?.profile;

        try {
            if (!body || typeof body.extensionName !== 'string') {
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

            try {
                await fsp.access(extensionPath);
            } catch {
                set.status = 404;
                return `Directory does not exist at ${extensionPath}`;
            }

            const git = simpleGit({ baseDir: extensionPath, ...OPTIONS });
            const branches = await git.branchLocal();
            const branchStr = String(branch);

            if (branchStr.startsWith('origin/')) {
                const localBranch = branchStr.slice(7);
                if (branches.all.includes(localBranch)) {
                    console.info(`Branch ${localBranch} already exists locally, checking it out`);
                    await git.checkout(localBranch);
                    set.status = 204;
                    return;
                }

                console.info(
                    `Branch ${localBranch} does not exist locally, creating it from ${branchStr}`,
                );
                await git.checkoutBranch(localBranch, branchStr);
                set.status = 204;
                return;
            }

            if (!branches.all.includes(branchStr)) {
                console.error(`Branch ${branchStr} does not exist locally`);
                set.status = 404;
                return `Branch ${branchStr} does not exist locally`;
            }

            const currentBranch = await git.branch();
            if (currentBranch.current === branchStr) {
                console.info(`Branch ${branchStr} is already checked out`);
                set.status = 204;
                return;
            }

            await git.checkout(branchStr);
            console.info(`Checked out branch ${branchStr} at ${extensionPath}`);

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

        const body = context.body as Record<string, unknown> | undefined;
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;
        const profile = user?.profile;

        try {
            if (!body || typeof body.extensionName !== 'string') {
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

            try {
                const stat = await fsp.stat(sourcePath);
                if (!stat.isDirectory()) {
                    console.error(`Source directory does not exist at ${sourcePath}`);
                    set.status = 404;
                    return 'Source directory does not exist.';
                }
            } catch {
                console.error(`Source directory does not exist at ${sourcePath}`);
                set.status = 404;
                return 'Source directory does not exist.';
            }

            try {
                await fsp.access(destinationPath);
                console.error(`Destination directory already exists at ${destinationPath}`);
                set.status = 409;
                return 'Destination directory already exists.';
            } catch {
                // Destination path does not exist, proceed
            }

            if (source === destination) {
                console.error('Source and destination directories are the same');
                set.status = 409;
                return 'Source and destination directories are the same.';
            }

            await fsp.cp(sourcePath, destinationPath, { recursive: true, force: true });
            await fsp.rm(sourcePath, { recursive: true, force: true });
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

        const body = context.body as Record<string, unknown> | undefined;
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;

        try {
            if (!body || typeof body.extensionName !== 'string') {
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

            try {
                await fsp.access(extensionPath);
            } catch {
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
                return {
                    currentBranchName: '',
                    currentCommitHash: '',
                    isUpToDate: true,
                    remoteUrl: '',
                };
            }

            const currentBranch = await git.branch();
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

        const body = context.body as Record<string, unknown> | undefined;
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;
        const profile = user?.profile;

        try {
            if (!body || typeof body.extensionName !== 'string') {
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

            try {
                await fsp.access(extensionPath);
            } catch {
                set.status = 404;
                return `Directory does not exist at ${extensionPath}`;
            }

            await fsp.rm(extensionPath, { recursive: true, force: true });
            console.info(`Extension has been deleted at ${extensionPath}`);

            return `Extension has been deleted at ${extensionPath}`;
        } catch (error) {
            console.error('Deleting extension failed', error);
            set.status = 500;
            return 'Internal Server Error. Check the server logs for more details.';
        }
    })
    .get('/discover', async (context) => {
        const user = context.user as UserContext | undefined;
        const directories = user?.directories;
        const profile = user?.profile;

        const userExtDir = directories?.extensions ?? '';
        if (userExtDir) {
            await fsp.mkdir(userExtDir, { recursive: true });
        }
        await fsp.mkdir(PUBLIC_DIRECTORIES.globalExtensions, { recursive: true });

        const builtInDirents = await fsp.readdir(PUBLIC_DIRECTORIES.extensions, {
            withFileTypes: true,
        });
        const builtInExtensions: { type: string; name: string }[] = [];
        for (const entry of builtInDirents) {
            if (entry.isDirectory() && entry.name !== 'third-party') {
                builtInExtensions.push({ type: 'system', name: entry.name });
            }
        }

        const userExtensions: { type: string; name: string }[] = [];
        if (userExtDir) {
            try {
                const userDirents = await fsp.readdir(userExtDir, { withFileTypes: true });
                for (const entry of userDirents) {
                    if (entry.isDirectory()) {
                        userExtensions.push({ type: 'local', name: `third-party/${entry.name}` });
                    }
                }
            } catch {
                // User extensions directory unreadable
            }
        }

        const userNamesSet = new Set<string>();
        for (const ext of userExtensions) {
            userNamesSet.add(ext.name);
        }

        const globalExtensions: { type: string; name: string }[] = [];
        try {
            const globalDirents = await fsp.readdir(PUBLIC_DIRECTORIES.globalExtensions, {
                withFileTypes: true,
            });
            for (const entry of globalDirents) {
                if (entry.isDirectory()) {
                    const fullName = `third-party/${entry.name}`;
                    if (!userNamesSet.has(fullName)) {
                        globalExtensions.push({ type: 'global', name: fullName });
                    }
                }
            }
        } catch {
            // Global extensions directory unreadable
        }

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
