import simpleGit from 'simple-git';
import type { SimpleGit } from 'simple-git';

/**
 * Supported git backends.
 */
export const GIT_BACKENDS = {
    AUTO: 'auto',
    SYSTEM: 'system',
} as const;

export type GitBackend = (typeof GIT_BACKENDS)[keyof typeof GIT_BACKENDS];

export interface GitCloneOptions {
    /** Limit the number of commits to be fetched. */
    depth?: number;
    /** Point the newly created HEAD to a specific branch instead of the default. */
    branch?: string;
}

export interface GitClientOptions {
    /** Requested backend string (e.g., 'auto', 'system'). */
    backend?: string | null;
}

export interface GitClient {
    backend: 'system';
    clone(url: string, localPath: string, options?: GitCloneOptions): Promise<void>;
}

const SUPPORTED_CLONE_OPTIONS = new Set(['depth', 'branch']);

/**
 * Resolves and verifies the Git backend configuration.
 * Validates that the system 'git' binary is securely accessible in the PATH environment variable.
 * @param preferredBackend - The preferred backend option ('auto' or 'system')
 * @returns The resolved backend (always 'system')
 * @throws {Error} If the system Git binary is not found in PATH
 */
function resolveBackend(preferredBackend?: string | null): 'system' {
    const systemGitAvailable = Bun.which('git') !== null;

    if (!systemGitAvailable) {
        throw new Error(
            'System git is required by simple-git, but no git binary was found in PATH.',
        );
    }

    return GIT_BACKENDS.SYSTEM;
}

/**
 * Validates and normalizes git clone options, stripping any unsupported flags.
 * @param options - The clone options object provided by the consumer
 * @returns Normalized clone options containing only supported fields
 * @throws {Error} If an unsupported option is provided
 */
function normalizeCloneOptions(options: GitCloneOptions | null | undefined = {}): GitCloneOptions {
    const safeOptions = options || {};

    for (const key of Object.keys(safeOptions)) {
        if (!SUPPORTED_CLONE_OPTIONS.has(key)) {
            throw new Error(`Unsupported clone option provided: ${key}`);
        }
    }

    return {
        depth: safeOptions.depth,
        branch: safeOptions.branch,
    };
}

/**
 * @param options - Initialization options for the Git client
 * @returns A fully initialized SimpleGitClient instance
 */
export function createGitClient(options: GitClientOptions | null | undefined = {}): GitClient {
    const safeOptions = options || {};

    // Validate system environment prior to instantiation
    resolveBackend(safeOptions.backend);

    return new SimpleGitClient();
}

/**
 * @implements {GitClient}
 */
class SimpleGitClient implements GitClient {
    public readonly backend = GIT_BACKENDS.SYSTEM;
    private readonly git: SimpleGit;

    constructor() {
        // Initialise the simple-git instance
        this.git = simpleGit();
    }

    /**
     * Clones a remote git repository into a designated local path.
     * @param url - The remote repository URL to clone from
     * @param localPath - The local directory path to clone into
     * @param options - Additional options to pass during cloning (e.g. depth, branch)
     * @returns A Promise that resolves when the clone operation is fully complete
     * @throws {Error} If the URL/local path are invalid or if the underlying clone operation fails
     */
    public async clone(
        url: string | null | undefined,
        localPath: string | null | undefined,
        options: GitCloneOptions | null | undefined = {},
    ): Promise<void> {
        // Validation for critical inputs
        if (!url || typeof url !== 'string' || url.trim() === '') {
            throw new Error('A valid repository URL is required for cloning.');
        }

        if (!localPath || typeof localPath !== 'string' || localPath.trim() === '') {
            throw new Error('A valid local directory path is required for cloning.');
        }

        const { depth, branch } = normalizeCloneOptions(options);

        // Assemble command-line arguments for simple-git
        const cloneOptions: Record<string, string | number> = {};

        if (depth !== undefined && depth !== null) {
            if (typeof depth !== 'number' || depth <= 0) {
                throw new Error('The "depth" option must be a positive integer.');
            }
            cloneOptions['--depth'] = depth;
        }

        if (branch) {
            if (typeof branch !== 'string' || branch.trim() === '') {
                throw new Error('The "branch" option must be a valid, non-empty string.');
            }
            cloneOptions['--branch'] = branch.trim();
        }

        try {
            await this.git.clone(url.trim(), localPath.trim(), cloneOptions);
        } catch (error: unknown) {
            // Provide a graceful wrapper over core execution failures
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to clone repository: ${errorMessage}`, { cause: error });
        }
    }
}
