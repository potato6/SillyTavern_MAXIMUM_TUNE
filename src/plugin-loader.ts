import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { Elysia } from 'elysia';

import { default as git, CheckRepoActions } from 'simple-git';
import { getConfigValue, color } from './util.js';

const enableServerPlugins = !!getConfigValue('enableServerPlugins', false, 'boolean' as const);
const enableServerPluginsAutoUpdate = !!getConfigValue(
    'enableServerPluginsAutoUpdate',
    true,
    'boolean',
);

interface PluginInfo {
    id: string;
    name: string;
    description: string;
}

interface PluginModule {
    info?: PluginInfo;
    init?: (router: any) => void | Promise<void>;
    exit?: () => void | Promise<void>;
    default?: PluginModule;
}

/**
 * Map of loaded plugins.
 */
const loadedPlugins = new Map<string, PluginModule>();

const isCommonJS = (file: string) => path.extname(file) === '.js' || path.extname(file) === '.cjs';
const isESModule = (file: string) => path.extname(file) === '.mjs';

// ── Express Router shim for Elysia ───────────────────────────────────────────
// Plugins expect an express.Router() with .get(), .post(), etc.
// We create a proxy that intercepts route registrations and builds
// an Elysia instance with matching handlers.

function createPluginRouter(): { elysiaRouter: Elysia } {
    const router = new Elysia();
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'all'] as const;

    // Proxy that intercepts method calls (router.get, router.post, etc.)
    // and registers them on the Elysia instance.
    const handler: ProxyHandler<Record<string, Function>> = {
        get(target, prop: string) {
            if (methods.includes(prop as any)) {
                return (path: string, ...handlers: Function[]) => {
                    // Elysia route handlers receive (context) not (req, res, next)
                    // We wrap Express-style handlers to extract req/res from context
                    const wrappedHandler = async (context: any) => {
                        const { request, set, ...rest } = context;
                        const url = new URL(request.url);

                        // Build mock Express req
                        const req: any = {
                            params: context.params ?? {},
                            query: Object.fromEntries(url.searchParams),
                            body: context.body ?? {},
                            headers: Object.fromEntries(request.headers),
                            path: url.pathname,
                            method: request.method,
                            url: request.url,
                            ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
                                || request.headers.get('x-real-ip')
                                || '127.0.0.1',
                            session: context.session,
                            user: context.user,
                        };

                        // Build mock Express res
                        let bodySent: any = undefined;
                        let statusCode = 200;
                        const res: any = {
                            status(code: number) { statusCode = code; return this; },
                            send(body: any) { bodySent = body; },
                            json(body: any) { bodySent = body; },
                            sendStatus(code: number) { statusCode = code; bodySent = undefined; },
                            setHeader() {},
                            getHeaders() { return {}; },
                            end() {},
                            type() { return this; },
                            attachment() {},
                        };

                        // Run Express-style handlers in sequence
                        for (const handler of handlers) {
                            await new Promise<void>((resolve, reject) => {
                                handler(req, res, (err?: any) => err ? reject(err) : resolve());
                            });
                            if (bodySent !== undefined) break;
                        }

                        set.status = statusCode;
                        return bodySent;
                    };

                    // Use the Elysia method (prop) with the path and wrapped handler
                    (router as any)[prop](path, wrappedHandler);
                    return handler; // proxy returns itself for chaining
                };
            }
            return Reflect.get(target, prop);
        },
    };

    return { elysiaRouter: router };
}

/**
 * Load and initialize server plugins from a directory if they are enabled.
 */
export async function loadPlugins(app: any, pluginsPath: string) {
    try {
        const exitHooks: Array<() => unknown> = [];
        const emptyFn = () => {};

        if (!enableServerPlugins) return emptyFn;
        if (!fs.existsSync(pluginsPath)) return emptyFn;

        const files = fs.readdirSync(pluginsPath);
        if (files.length === 0) return emptyFn;

        await updatePlugins(pluginsPath);

        for (const file of files) {
            const pluginFilePath = path.join(pluginsPath, file);
            if (fs.statSync(pluginFilePath).isDirectory()) {
                await loadFromDirectory(app, pluginFilePath, exitHooks);
                continue;
            }
            if (!isCommonJS(file) && !isESModule(file)) continue;
            await loadFromFile(app, pluginFilePath, exitHooks);
        }

        if (loadedPlugins.size > 0) {
            console.log(
                `${loadedPlugins.size} server plugin(s) are currently loaded. Make sure you know exactly what they do, and only install plugins from trusted sources!`,
            );
        }

        return () => Promise.all(exitHooks.map((exitFn) => exitFn()));
    } catch (error) {
        console.error('Plugin loading failed.', error);
        return () => {};
    }
}

async function loadFromDirectory(
    app: any,
    pluginDirectoryPath: string,
    exitHooks: Array<() => unknown>,
) {
    const files = fs.readdirSync(pluginDirectoryPath);
    if (files.length === 0) return;

    const packageJsonFilePath = path.join(pluginDirectoryPath, 'package.json');
    if (fs.existsSync(packageJsonFilePath)) {
        if (await loadFromPackage(app, packageJsonFilePath, exitHooks)) return;
    }

    const fileTypes = ['index.js', 'index.cjs', 'index.mjs'];
    for (const fileType of fileTypes) {
        const filePath = path.join(pluginDirectoryPath, fileType);
        if (fs.existsSync(filePath)) {
            if (await loadFromFile(app, filePath, exitHooks)) return;
        }
    }
}

async function loadFromPackage(
    app: any,
    packageJsonPath: string,
    exitHooks: Array<() => unknown>,
): Promise<boolean> {
    try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (packageJson.main) {
            const pluginFilePath = path.join(path.dirname(packageJsonPath), packageJson.main);
            return await loadFromFile(app, pluginFilePath, exitHooks);
        }
    } catch (error) {
        console.error(`Failed to load plugin from ${packageJsonPath}: ${error}`);
    }
    return false;
}

async function loadFromFile(
    app: any,
    pluginFilePath: string,
    exitHooks: Array<() => unknown>,
): Promise<boolean> {
    try {
        const fileUrl = url.pathToFileURL(pluginFilePath).toString();
        const plugin = await import(fileUrl);
        console.log(`Initializing plugin from ${pluginFilePath}`);
        return await initPlugin(app, plugin, exitHooks);
    } catch (error) {
        console.error(`Failed to load plugin from ${pluginFilePath}: ${error}`);
        return false;
    }
}

function isValidPluginID(id: string) {
    return /^[a-z0-9_-]+$/.test(id);
}

async function initPlugin(
    app: any,
    plugin: PluginModule,
    exitHooks: Array<() => unknown>,
): Promise<boolean> {
    const info = plugin.info || plugin.default?.info;
    if (typeof info !== 'object') {
        console.error('Failed to load plugin module; plugin info not found');
        return false;
    }

    for (const field of ['id', 'name', 'description'] as const) {
        if (typeof info[field] !== 'string') {
            console.error(`Failed to load plugin module; plugin info missing field '${field}'`);
            return false;
        }
    }

    const init = plugin.init || plugin.default?.init;
    if (typeof init !== 'function') {
        console.error('Failed to load plugin module; no init function');
        return false;
    }

    const { id } = info;

    if (!isValidPluginID(id)) {
        console.error(`Failed to load plugin module; invalid plugin ID '${id}'`);
        return false;
    }

    if (loadedPlugins.has(id)) {
        console.error(`Failed to load plugin module; plugin ID '${id}' is already in use`);
        return false;
    }

    // Create a proxy router that looks like express.Router() to plugins
    // but actually builds an Elysia sub-app
    const { elysiaRouter } = createPluginRouter();

    await init(elysiaRouter as any);

    loadedPlugins.set(id, plugin);

    // Mount the plugin's Elysia router on the main app
    app.use(`/api/plugins/${id}`, elysiaRouter);

    const exit = plugin.exit || plugin.default?.exit;
    if (typeof exit === 'function') {
        exitHooks.push(exit);
    }

    return true;
}

async function updatePlugins(pluginsPath: string) {
    if (!enableServerPluginsAutoUpdate) return;

    const directories = fs
        .readdirSync(pluginsPath)
        .filter((file) => !file.startsWith('.'))
        .filter((file) => fs.statSync(path.join(pluginsPath, file)).isDirectory());

    if (directories.length === 0) return;

    console.log(
        color.blue('Auto-updating server plugins... Set'),
        color.yellow('enableServerPluginsAutoUpdate: false'),
        color.blue('in config.yaml to disable this feature.'),
    );

    if (!Bun.which('git')) {
        console.error(
            color.red('Git is not installed. Please install Git to enable auto-updating of server plugins.'),
        );
        return;
    }

    let pluginsToUpdate = 0;

    for (const directory of directories) {
        try {
            const pluginPath = path.join(pluginsPath, directory);
            const pluginRepo = git(pluginPath);
            const isRepo = await pluginRepo.checkIsRepo(CheckRepoActions.IS_REPO_ROOT);
            if (!isRepo) continue;

            await pluginRepo.fetch();
            const commitHash = await pluginRepo.revparse(['HEAD']);
            const trackingBranch = await pluginRepo.revparse(['--abbrev-ref', '@{u}']);
            const log = await pluginRepo.log({ from: commitHash, to: trackingBranch });

            if (log.total === 0) continue;

            pluginsToUpdate++;
            await pluginRepo.pull();
            const latestCommit = await pluginRepo.revparse(['HEAD']);
            console.log(`Plugin ${color.green(directory)} updated to commit ${color.cyan(latestCommit)}`);
        } catch (error) {
            console.error(color.red(`Failed to update plugin ${directory}: ${(error as any).message}`));
        }
    }

    if (pluginsToUpdate === 0) {
        console.log('All plugins are up to date.');
    }
}
