// ── Server directory ──────────────────────────────────────────────────────────
import path from 'node:path';
import EventEmitter from 'node:events';
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import net from 'node:net';
import dns from 'node:dns';
import crypto from 'node:crypto';
import util from 'node:util';

import cors from 'cors';
import express from 'express';
import compression from 'compression';
import multer from 'multer';
import responseTime from 'response-time';
import helmet from 'helmet';
import type { App } from 'open';

import { addMissingConfigValues } from './config-init.js';
import { serverDirectory } from './server-directory.js';
import {
    color,
    urlHostnameToIPv6,
    getHasIP,
    getVersion,
    getSeparator,
    removeColorFormatting,
    safeReadFileSync,
    setupLogLevel,
    setWindowTitle,
    getConfigValue,
} from './util.js';
import bunSessionMiddleware from './middleware/bun-session.js';

// Express routers
import {
    router as userDataRouter,
    initUserStorage,
    getCookieSecret,
    getCookieSessionName,
    ensurePublicDirectoriesExist,
    getUserDirectoriesList,
    migrateSystemPrompts,
    migrateUserData,
    requireLoginMiddleware,
    setUserDataMiddleware,
    shouldRedirectToLogin,
    cleanUploads,
    getSessionCookieAge,
    verifySecuritySettings,
    loginPageMiddleware,
    migratePublicOverrides,
} from './users.js';
import { router as usersPrivateRouter } from './endpoints/users-private.js';
import { router as usersAdminRouter } from './endpoints/users-admin.js';
import { router as movingUIRouter } from './endpoints/moving-ui.js';
import { router as imagesRouter } from './endpoints/images.js';
import { router as quickRepliesRouter } from './endpoints/quick-replies.js';
import { router as avatarsRouter } from './endpoints/avatars.js';
import { router as themesRouter } from './endpoints/themes.js';
import { router as openAiRouter } from './endpoints/openai.js';
import { router as googleRouter } from './endpoints/google.js';
import { router as anthropicRouter } from './endpoints/anthropic.js';
import { router as tokenizersRouter } from './endpoints/tokenizers.js';
import { router as presetsRouter } from './endpoints/presets.js';
import { router as secretsRouter, migrateFlatSecrets } from './endpoints/secrets.js';
import { router as thumbnailRouter } from './endpoints/thumbnails.js';
import { router as novelAiRouter } from './endpoints/novelai.js';
import { router as extensionsRouter } from './endpoints/extensions.js';
import { router as assetsRouter } from './endpoints/assets.js';
import { router as filesRouter } from './endpoints/files.js';
import { router as charactersRouter, diskCache } from './endpoints/characters.js';
import { router as chatsRouter } from './endpoints/chats.js';
import { router as groupsRouter, migrateGroupChatsMetadataFormat } from './endpoints/groups.js';
import { router as worldInfoRouter } from './endpoints/worldinfo.js';
import {
    router as statsRouter,
    init as statsInit,
    onExit as statsOnExit,
} from './endpoints/stats.js';
import { router as contentManagerRouter, checkForNewContent } from './endpoints/content-manager.js';
import { router as settingsRouter, init as settingsInit } from './endpoints/settings.js';
import { router as backgroundsRouter } from './endpoints/backgrounds.js';
import { router as spritesRouter } from './endpoints/sprites.js';
import { router as stableDiffusionRouter } from './endpoints/stable-diffusion.js';
import { router as hordeRouter } from './endpoints/horde.js';
import { router as vectorsRouter } from './endpoints/vectors.js';
import { router as translateRouter } from './endpoints/translate.js';
import { router as searchRouter } from './endpoints/search.js';
import { router as openRouterRouter } from './endpoints/openrouter.js';
import { router as nanogptRouter } from './endpoints/nanogpt.js';
import { router as chatCompletionsRouter } from './endpoints/backends/chat-completions/index.js';
import { router as koboldRouter } from './endpoints/backends/kobold.js';
import { router as textCompletionsRouter } from './endpoints/backends/text-completions/index.js';
import { router as backendsKeysRouter } from './endpoints/backends/keys.js';
import { router as speechRouter } from './endpoints/speech.js';
import { router as azureRouter } from './endpoints/azure.js';
import { router as minimaxRouter } from './endpoints/minimax.js';
import { router as dataMaidRouter } from './endpoints/data-maid.js';
import { router as backupsRouter } from './endpoints/backups.js';
import { router as imageMetadataRouter } from './endpoints/image-metadata.js';
import { router as volcengineRouter } from './endpoints/volcengine.js';

// ── Server events ─────────────────────────────────────────────────────────────
/**
 * @typedef {import('../index').ServerEventMap} ServerEventMap
 * @type {EventEmitter<ServerEventMap>} The default event source.
 */
export const serverEvents = new EventEmitter();
process.serverEvents = serverEvents;
export default serverEvents;

export const EVENT_NAMES = Object.freeze({
    SERVER_STARTED: 'server-started',
});

// ── Config init ───────────────────────────────────────────────────────────────
try {
    addMissingConfigValues(path.join(process.cwd(), './config.yaml'));
} catch (error) {
    console.error(error);
}

// ── Server startup ────────────────────────────────────────────────────────────
export interface ServerStartupResult {
    v6Failed: boolean;
    v4Failed: boolean;
    v6Error?: unknown;
    v4Error?: unknown;
    useIPv6: boolean;
    useIPv4: boolean;
}

/**
 * Redirect deprecated API endpoints to their replacements.
 * @param {import('express').Express} app The Express app to use
 */
export function redirectDeprecatedEndpoints(app: import('express').Express) {
    /**
     *
     * @param src
     * @param destination
     */
    function redirect(src: string, destination: string) {
        app.use(src, (req: import('express').Request, res: import('express').Response) => {
            console.warn(`API endpoint ${src} is deprecated; use ${destination} instead`);
            res.redirect(308, destination);
        });
    }

    const REDIRECTS: [string, string][] = [
        ['/createcharacter', '/api/characters/create'],
        ['/renamecharacter', '/api/characters/rename'],
        ['/editcharacter', '/api/characters/edit'],
        ['/editcharacterattribute', '/api/characters/edit-attribute'],
        ['/v2/editcharacterattribute', '/api/characters/merge-attributes'],
        ['/deletecharacter', '/api/characters/delete'],
        ['/getcharacters', '/api/characters/all'],
        ['/getonecharacter', '/api/characters/get'],
        ['/getallchatsofcharacter', '/api/characters/chats'],
        ['/importcharacter', '/api/characters/import'],
        ['/dupecharacter', '/api/characters/duplicate'],
        ['/exportcharacter', '/api/characters/export'],
        ['/savechat', '/api/chats/save'],
        ['/getchat', '/api/chats/get'],
        ['/renamechat', '/api/chats/rename'],
        ['/delchat', '/api/chats/delete'],
        ['/exportchat', '/api/chats/export'],
        ['/importgroupchat', '/api/chats/group/import'],
        ['/importchat', '/api/chats/import'],
        ['/getgroupchat', '/api/chats/group/get'],
        ['/deletegroupchat', '/api/chats/group/delete'],
        ['/savegroupchat', '/api/chats/group/save'],
        ['/getgroups', '/api/groups/all'],
        ['/creategroup', '/api/groups/create'],
        ['/editgroup', '/api/groups/edit'],
        ['/deletegroup', '/api/groups/delete'],
        ['/getworldinfo', '/api/worldinfo/get'],
        ['/deleteworldinfo', '/api/worldinfo/delete'],
        ['/importworldinfo', '/api/worldinfo/import'],
        ['/editworldinfo', '/api/worldinfo/edit'],
        ['/getstats', '/api/stats/get'],
        ['/recreatestats', '/api/stats/recreate'],
        ['/updatestats', '/api/stats/update'],
        ['/getbackgrounds', '/api/backgrounds/all'],
        ['/delbackground', '/api/backgrounds/delete'],
        ['/renamebackground', '/api/backgrounds/rename'],
        ['/downloadbackground', '/api/backgrounds/upload'],
        ['/savetheme', '/api/themes/save'],
        ['/getuseravatars', '/api/avatars/get'],
        ['/deleteuseravatar', '/api/avatars/delete'],
        ['/uploaduseravatar', '/api/avatars/upload'],
        ['/deletequickreply', '/api/quick-replies/delete'],
        ['/savequickreply', '/api/quick-replies/save'],
        ['/uploadimage', '/api/images/upload'],
        ['/listimgfiles/:folder', '/api/images/list/:folder'],
        ['/api/content/import', '/api/content/importURL'],
        ['/savemovingui', '/api/moving-ui/save'],
        ['/api/serpapi/search', '/api/search/serpapi'],
        ['/api/serpapi/visit', '/api/search/visit'],
        ['/api/serpapi/transcript', '/api/search/transcript'],
    ];
    for (const [src, dest] of REDIRECTS) redirect(src, dest);
}

/**
 * Setup the routers for the endpoints.
 * @param {import('express').Express} app The Express app to use
 */
export function setupPrivateEndpoints(app: import('express').Express) {
    app.use(mountElysia(userDataRouter));
    app.use(mountElysia(usersPrivateRouter));
    app.use(mountElysia(usersAdminRouter));
    app.use(mountElysia(movingUIRouter));
    app.use(mountElysia(imagesRouter));
    app.use(mountElysia(quickRepliesRouter));
    app.use(mountElysia(avatarsRouter));
    app.use(mountElysia(themesRouter));
    app.use(mountElysia(openAiRouter));
    app.use(mountElysia(googleRouter));
    app.use(mountElysia(anthropicRouter));
    app.use(mountElysia(tokenizersRouter));
    app.use(mountElysia(presetsRouter));
    app.use(mountElysia(secretsRouter));
    app.use(mountElysia(thumbnailRouter));
    app.use(mountElysia(novelAiRouter));
    app.use(mountElysia(extensionsRouter));
    app.use(mountElysia(assetsRouter));
    app.use(mountElysia(filesRouter));
    app.use(mountElysia(charactersRouter));
    app.use(mountElysia(chatsRouter));
    app.use(mountElysia(groupsRouter));
    app.use(mountElysia(worldInfoRouter));
    app.use(mountElysia(statsRouter));
    app.use(mountElysia(backgroundsRouter));
    app.use(mountElysia(spritesRouter));
    app.use(mountElysia(contentManagerRouter));
    app.use(mountElysia(settingsRouter));
    app.use(mountElysia(stableDiffusionRouter));
    app.use(mountElysia(hordeRouter));
    app.use(mountElysia(vectorsRouter));
    app.use(mountElysia(translateRouter));
    app.use(mountElysia(searchRouter));
    app.use(mountElysia(textCompletionsRouter));
    app.use(mountElysia(openRouterRouter));
    app.use(mountElysia(nanogptRouter));
    app.use(mountElysia(koboldRouter));
    app.use(mountElysia(chatCompletionsRouter));
    app.use(mountElysia(backendsKeysRouter));
    app.use(mountElysia(speechRouter));
    app.use(mountElysia(azureRouter));
    app.use(mountElysia(volcengineRouter));
    app.use(mountElysia(minimaxRouter));
    app.use(mountElysia(dataMaidRouter));
    app.use(mountElysia(backupsRouter));
    app.use(mountElysia(imageMetadataRouter));
}

/**
 * Utilities for starting the express server.
 */
export class ServerStartup {
    app: import('express').Express;
    cliArgs: import('./command-line.js').CommandLineArguments;

    constructor(
        app: import('express').Express,
        cliArgs: import('./command-line.js').CommandLineArguments,
    ) {
        this.app = app;
        this.cliArgs = cliArgs;
    }

    #fatal(message: string) {
        console.error(color.red(message));
        process.exit(1);
    }

    #isAddressInUseError(error: unknown) {
        return (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'EADDRINUSE'
        );
    }

    #getListenAddress(url: URL, ipVersion: number) {
        const host = ipVersion === 6 ? urlHostnameToIPv6(url.hostname) : url.hostname;
        return `${host}:${Number(url.port || (this.cliArgs.ssl ? 443 : 80))}`;
    }

    #getAddressInUseMessage(url: URL, ipVersion: number) {
        const listenAddress = this.#getListenAddress(url, ipVersion);
        return `Address ${listenAddress} is already in use. Another SillyTavern instance may already be running. Stop the other process or change "port" in config.yaml.`;
    }

    #verifySslOptions() {
        if (!this.cliArgs.ssl) return;
        if (!this.cliArgs.certPath)
            this.#fatal(
                'Error: SSL certificate path is required when using HTTPS. Check your config',
            );
        if (!this.cliArgs.keyPath)
            this.#fatal('Error: SSL key path is required when using HTTPS. Check your config');
        if (!fs.existsSync(this.cliArgs.certPath))
            this.#fatal('Error: SSL certificate path does not exist');
        if (!fs.existsSync(this.cliArgs.keyPath)) this.#fatal('Error: SSL key path does not exist');
    }

    #createHttpsServer(url: URL, ipVersion: number) {
        this.#verifySslOptions();
        return new Promise((resolve, reject) => {
            const sslOptions = {
                cert: fs.readFileSync(this.cliArgs.certPath),
                key: fs.readFileSync(this.cliArgs.keyPath),
                passphrase: String(this.cliArgs.keyPassphrase ?? ''),
            };
            const server = https.createServer(sslOptions, this.app);
            server.on('error', reject);
            server.on('listening', resolve);
            let host = url.hostname;
            if (ipVersion === 6) host = urlHostnameToIPv6(url.hostname);
            server.listen({ host, port: Number(url.port || 443), ipv6Only: true });
        });
    }

    #createHttpServer(url: URL, ipVersion: number) {
        return new Promise((resolve, reject) => {
            const server = http.createServer(this.app);
            server.on('error', reject);
            server.on('listening', resolve);
            let host = url.hostname;
            if (ipVersion === 6) host = urlHostnameToIPv6(url.hostname);
            server.listen({ host, port: Number(url.port || 80), ipv6Only: true });
        });
    }

    async #startHTTPorHTTPS(useIPv6: boolean, useIPv4: boolean) {
        let v6Failed = false,
            v4Failed = false,
            v6Error,
            v4Error;
        const createFunc = this.cliArgs.ssl
            ? this.#createHttpsServer.bind(this)
            : this.#createHttpServer.bind(this);

        if (useIPv6) {
            try {
                await createFunc(this.cliArgs.getIPv6ListenUrl(), 6);
            } catch (error) {
                console.error('Warning: failed to start server on IPv6');
                if (this.#isAddressInUseError(error))
                    console.error(this.#getAddressInUseMessage(this.cliArgs.getIPv6ListenUrl(), 6));
                else console.error(error);
                v6Failed = true;
                v6Error = error;
            }
        }

        if (useIPv4) {
            try {
                await createFunc(this.cliArgs.getIPv4ListenUrl(), 4);
            } catch (error) {
                console.error('Warning: failed to start server on IPv4');
                if (this.#isAddressInUseError(error))
                    console.error(this.#getAddressInUseMessage(this.cliArgs.getIPv4ListenUrl(), 4));
                else console.error(error);
                v4Failed = true;
                v4Error = error;
            }
        }

        return [v6Failed, v4Failed, v6Error, v4Error];
    }

    #handleServerListenFail({
        v6Failed,
        v4Failed,
        v6Error,
        v4Error,
        useIPv6,
        useIPv4,
    }: ServerStartupResult) {
        if (v6Failed && !useIPv4) {
            if (this.#isAddressInUseError(v6Error))
                this.#fatal(
                    'Error: Startup aborted because IPv6 is the only enabled protocol and its listen port is already in use.',
                );
            this.#fatal('Error: Failed to start server on IPv6 and IPv4 disabled');
        }
        if (v4Failed && !useIPv6) {
            if (this.#isAddressInUseError(v4Error))
                this.#fatal(
                    'Error: Startup aborted because IPv4 is the only enabled protocol and its listen port is already in use.',
                );
            this.#fatal('Error: Failed to start server on IPv4 and IPv6 disabled');
        }
        if (v6Failed && v4Failed) {
            if (this.#isAddressInUseError(v6Error) && this.#isAddressInUseError(v4Error))
                this.#fatal(
                    'Error: Failed to start server because the configured IPv6 and IPv4 listen ports are already in use.',
                );
            this.#fatal('Error: Failed to start server on both IPv6 and IPv4');
        }
    }

    async start() {
        let useIPv6: boolean = this.cliArgs.enableIPv6 === true;
        let useIPv4: boolean = this.cliArgs.enableIPv4 === true;

        if (this.cliArgs.enableIPv6 === 'auto' || this.cliArgs.enableIPv4 === 'auto') {
            const ipQuery = await getHasIP();
            let hasIPv6 = false,
                hasIPv4 = false;
            hasIPv6 = this.cliArgs.listen ? ipQuery.hasIPv6Any : ipQuery.hasIPv6Local;
            if (this.cliArgs.enableIPv6 === 'auto') useIPv6 = hasIPv6;
            if (hasIPv6) {
                if (useIPv6) console.log(color.green('IPv6 support detected'));
                else console.log('IPv6 support detected (but disabled)');
            }
            hasIPv4 = this.cliArgs.listen ? ipQuery.hasIPv4Any : ipQuery.hasIPv4Local;
            if (this.cliArgs.enableIPv4 === 'auto') useIPv4 = hasIPv4;
            if (hasIPv4) {
                if (useIPv4) console.log(color.green('IPv4 support detected'));
                else console.log('IPv4 support detected (but disabled)');
            }
            if (this.cliArgs.enableIPv6 === 'auto' && this.cliArgs.enableIPv4 === 'auto') {
                if (!hasIPv6 && !hasIPv4) {
                    console.error('Both IPv6 and IPv4 are not detected');
                    process.exit(1);
                }
            }
        }

        if (!useIPv6 && !useIPv4) {
            console.error('Both IPv6 and IPv4 are disabled or not detected');
            process.exit(1);
        }

        const [v6Failed, v4Failed, v6Error, v4Error] = (await this.#startHTTPorHTTPS(
            useIPv6,
            useIPv4,
        )) as [boolean, boolean, unknown, unknown];
        const result: ServerStartupResult = {
            v6Failed,
            v4Failed,
            v6Error,
            v4Error,
            useIPv6,
            useIPv4,
        };
        this.#handleServerListenFail(result);
        return result;
    }
}

// ── Server main (Express app, middleware, routes, lifecycle) ──────────────────
import './fetch-patch.js';
import { loadPlugins } from './plugin-loader.js';
import getLibServeMiddleware from './middleware/lib-serve.js';
import basicAuthMiddleware from './middleware/basicAuth.js';
import getWhitelistMiddleware from './middleware/whitelist.js';
import accessLoggerMiddleware, {
    getAccessLogPath,
    migrateAccessLog,
} from './middleware/accessLogWriter.js';
import multerMonkeyPatch from './middleware/multerMonkeyPatch.js';
import initRequestProxy from './request-proxy.js';
import initPrivateRequestFilter from './private-request-filter.js';
import cacheBuster from './middleware/cacheBuster.js';
import corsProxyMiddleware from './middleware/corsProxy.js';
import hostWhitelistMiddleware from './middleware/hostWhitelist.js';
import userCssMiddleware from './middleware/userCss.js';
import { UPLOADS_DIRECTORY } from './constants.js';
import { router as usersPublicRouter } from './endpoints/users-public.js';
import { mountElysia } from './elysia-mount.js';

// Work around a node v20.0.0, v20.1.0, and v20.2.0 bug
if (process.versions?.node?.match(/20\.[0-2]\.0/)) {
    if (net.setDefaultAutoSelectFamily) net.setDefaultAutoSelectFamily(false);
}

// Unrestrict console logs display limit
util.inspect.defaultOptions.maxArrayLength = null;
util.inspect.defaultOptions.maxStringLength = null;
util.inspect.defaultOptions.depth = 4;

/** @type {import('./command-line.js').CommandLineArguments} */
const cliArgs = globalThis.COMMAND_LINE_ARGS;

if (!cliArgs.enableIPv6 && !cliArgs.enableIPv4) {
    console.error(
        "error: You can't disable all internet protocols: at least IPv6 or IPv4 must be enabled.",
    );
    process.exit(1);
}

// Set keep-alive preference for all HTTP/HTTPS requests
http.globalAgent = new http.Agent({ keepAlive: cliArgs.enableKeepAlive });
https.globalAgent = new https.Agent({ keepAlive: cliArgs.enableKeepAlive });

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
// @ts-expect-error TS(2769) Bun/Express type mismatch
app.use(compression());
app.use(responseTime());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// CORS Settings
const corsEnabled = getConfigValue(
    'cors.enabled',
    true as unknown as null,
    'boolean' as unknown as null,
);
if (corsEnabled) {
    const corsOrigin = getConfigValue('cors.origin', 'null' as unknown as null) as string;
    const corsMethods = getConfigValue('cors.methods', ['OPTIONS'] as unknown as null) as string[];
    const corsAllowedHeaders = getConfigValue(
        'cors.allowedHeaders',
        [] as unknown as null,
    ) as string[];
    const corsExposedHeaders = getConfigValue(
        'cors.exposedHeaders',
        [] as unknown as null,
    ) as string[];
    const corsCredentials = getConfigValue(
        'cors.credentials',
        false as unknown as null,
        'boolean' as unknown as null,
    ) as boolean;
    const corsMaxAge = getConfigValue('cors.maxAge', null, 'number' as unknown as null) as
        | number
        | null;
    const corsOptions: cors.CorsOptions = {
        origin: corsOrigin,
        methods: corsMethods,
        credentials: corsCredentials,
    };
    if (Array.isArray(corsAllowedHeaders) && corsAllowedHeaders.length > 0)
        (corsOptions as Record<string, unknown>).allowedHeaders = corsAllowedHeaders;
    if (Array.isArray(corsExposedHeaders) && corsExposedHeaders.length > 0)
        (corsOptions as Record<string, unknown>).exposedHeaders = corsExposedHeaders;
    if (corsMaxAge !== null && Number.isInteger(corsMaxAge))
        (corsOptions as Record<string, unknown>).maxAge = corsMaxAge;
    app.use(cors(corsOptions));
}

if (cliArgs.listen && cliArgs.basicAuthMode) app.use(basicAuthMiddleware);

const whitelistPromise = cliArgs.whitelistMode ? getWhitelistMiddleware() : null;
app.use(hostWhitelistMiddleware);

if (cliArgs.listen) app.use(accessLoggerMiddleware());

app.use(
    bunSessionMiddleware({
        name: getCookieSessionName(),
        sameSite: 'lax',
        httpOnly: true,
        maxAge: getSessionCookieAge() ?? 400 * 24 * 60 * 60 * 1000,
        secret: getCookieSecret(globalThis.DATA_ROOT),
    }),
);

app.use(setUserDataMiddleware);

// CSRF Protection
if (!cliArgs.disableCsrf) {
    const CSRF_SECRET = process.env['CSRF_SECRET'] || crypto.randomBytes(64).toString('hex');
    app.get('/csrf-token', (req, res) => {
        const sessionId = req.ip || 'anonymous';
        const token = Bun.CSRF.generate(CSRF_SECRET, {
            sessionId,
            expiresIn: 24 * 60 * 60 * 1000,
        } as Record<string, unknown>);
        res.json({ token });
    });
    app.use((req, res, next) => {
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
        if (cliArgs.enableCorsProxy && req.path.startsWith('/proxy/')) return next();
        const token = req.headers['x-csrf-token']?.toString();
        const sessionId = req.ip || 'anonymous';
        if (
            !token ||
            !Bun.CSRF.verify(token, { secret: CSRF_SECRET, sessionId } as Record<string, unknown>)
        ) {
            console.error(color.red('Invalid CSRF token. Please refresh the page and try again.'));
            res.status(403).json({
                error: 'Invalid CSRF token. Please refresh the page and try again.',
            });
            return;
        }
        next();
    });
} else {
    console.warn(
        '\nCSRF protection is disabled. This will make your server vulnerable to CSRF attacks.\n',
    );
    app.get('/csrf-token', (req, res) => res.json({ token: 'disabled' }));
}

// Static files
app.get('/', cacheBuster.middleware, (request, response) => {
    if (shouldRedirectToLogin(request)) {
        const query = request.url.split('?')[1];
        return response.redirect(query ? `/login?${query}` : '/login');
    }
    return response.sendFile('index.html', { root: path.join(serverDirectory, 'public/dist') });
});

app.get('/callback{/:source}', (request, response) => {
    const source = request.params.source;
    const query = request.url.split('?')[1];
    const searchParams = new URLSearchParams();
    if (source) searchParams.set('source', source);
    if (query) searchParams.set('query', query);
    return response.redirect(307, `/?${searchParams.toString()}`);
});

app.get('/login', loginPageMiddleware);

const libMiddleware = getLibServeMiddleware();
app.use(libMiddleware);
app.use(userCssMiddleware);
app.use(express.static(path.join(serverDirectory, 'public/dist')));

// Public API
app.use(mountElysia(usersPublicRouter));

// Everything below this line requires authentication
app.use(requireLoginMiddleware);
app.post('/api/ping', (request, response) => {
    if (request.query.extend && request.session) request.session.touch = Date.now();
    response.sendStatus(204);
});

if (cliArgs.enableCorsProxy) {
    app.use('/proxy', corsProxyMiddleware);
} else {
    app.use('/proxy', async (_, res) => {
        const message =
            'CORS proxy is disabled. Enable it in config.yaml or use the --corsProxy flag.';
        console.log(message);
        res.status(404).send(message);
    });
}

const uploadsPath = path.join(cliArgs.dataRoot, UPLOADS_DIRECTORY);
app.use(multer({ dest: uploadsPath, limits: { fieldSize: 500 * 1024 * 1024 } }).single('avatar'));
app.use(multerMonkeyPatch);

app.get('/version', async function (_, response) {
    response.send(await getVersion());
});

redirectDeprecatedEndpoints(app);
setupPrivateEndpoints(app);

/**
 *
 */
async function preSetupTasks() {
    if (whitelistPromise) {
        const whitelistMiddleware = await whitelistPromise;
        app.use(whitelistMiddleware);
    }
    const version = await getVersion();

    console.log();
    console.log(`SillyTavern ${version.pkgVersion}`);
    if (version.gitBranch && version.commitDate) {
        const date = new Date(version.commitDate);
        const localDate = date.toLocaleString('en-US', { timeZoneName: 'short' });
        console.log(`Running '${version.gitBranch}' (${version.gitRevision}) - ${localDate}`);
        if (!version.isLatest && ['staging', 'release'].includes(version.gitBranch)) {
            console.log('INFO: Currently not on the latest commit.');
            console.log(
                "      Run 'git pull' to update. If you have any merge conflicts, run 'git reset --hard' and 'git pull' to reset your branch.",
            );
        }
    }
    console.log();

    const directories = await getUserDirectoriesList();
    await migrateGroupChatsMetadataFormat(directories);
    await checkForNewContent(directories);
    await diskCache.verify(directories);
    migrateFlatSecrets(directories);
    cleanUploads();
    migrateAccessLog();
    await settingsInit();
    await statsInit();

    const pluginsDirectory = path.join(serverDirectory, 'plugins');
    const cleanupPlugins = await loadPlugins(app, pluginsDirectory);
    const consoleTitle = process.title;

    let isExiting = false;
    const exitProcess = async () => {
        if (isExiting) return;
        isExiting = true;
        await statsOnExit();
        if (typeof cleanupPlugins === 'function') await cleanupPlugins();
        diskCache.dispose();
        setWindowTitle(consoleTitle);
        process.exit();
    };

    process.on('SIGINT', exitProcess);
    process.on('SIGTERM', exitProcess);
    process.on('uncaughtException', (err) => {
        console.error('Uncaught exception:', err);
        exitProcess();
    });

    const requestFilterOptions = {
        listen: cliArgs.listen,
        enabled: !!getConfigValue(
            'privateAddressWhitelist.enabled',
            false as unknown as null,
            'boolean' as unknown as null,
        ) as boolean,
        privateAddressWhitelist: getConfigValue('privateAddressWhitelist.allowedRanges', [
            '127.0.0.0/8',
            '::1/128',
        ] as unknown as null) as string[],
        logBlocked: !!getConfigValue(
            'privateAddressWhitelist.log.blockedRequests',
            true as unknown as null,
            'boolean' as unknown as null,
        ) as boolean,
        logAllowed: !!getConfigValue(
            'privateAddressWhitelist.log.allowedRequests',
            false as unknown as null,
            'boolean' as unknown as null,
        ) as boolean,
        allowUnresolvedHosts: !!getConfigValue(
            'privateAddressWhitelist.allowUnresolvedHosts',
            false as unknown as null,
            'boolean' as unknown as null,
        ) as boolean,
        enableKeepAlive: cliArgs.enableKeepAlive,
    };
    initPrivateRequestFilter(requestFilterOptions);
    initRequestProxy({
        enabled: cliArgs.requestProxyEnabled,
        url: cliArgs.requestProxyUrl,
        bypass: cliArgs.requestProxyBypass,
        enableKeepAlive: cliArgs.enableKeepAlive,
        privateRequestFilterEnabled: requestFilterOptions.enabled,
    });
    await libMiddleware.runBunBuild({ pruneCache: true } as Record<string, unknown>);
}

/**
 *
 * @param result
 */
async function postSetupTasks(result: ServerStartupResult) {
    const browserLaunchHostname = await cliArgs.getBrowserLaunchHostname(result);
    const browserLaunchUrl = cliArgs.getBrowserLaunchUrl(browserLaunchHostname);
    const browserLaunchApp = String(
        getConfigValue('browserLaunch.browser', 'default' as unknown as null) ?? '',
    );

    if (cliArgs.browserLaunchEnabled) {
        try {
            const openModule = await import('open');
            const { default: open, apps } = openModule;
            const validBrowsers: Record<string, unknown> =
                process.platform === 'android'
                    ? {}
                    : {
                          firefox: apps.firefox,
                          chrome: apps.chrome,
                          edge: apps.edge,
                          brave: apps.brave,
                      };
            const appName = validBrowsers[browserLaunchApp.trim().toLowerCase()] as App | undefined;
            const openOptions: Record<string, unknown> = appName ? { app: { name: appName } } : {};
            console.log(`Launching in a browser: ${browserLaunchApp}...`);
            await open(
                browserLaunchUrl.toString(),
                openOptions as unknown as Parameters<typeof open>[1],
            );
        } catch (error) {
            console.error('Failed to launch the browser. Open the URL manually.', error);
        }
    }

    if (cliArgs.heartbeatInterval > 0) {
        const intervalMs = cliArgs.heartbeatInterval * 1000;
        const heartbeatPath = path.join(globalThis.DATA_ROOT, 'heartbeat.json');
        console.log(
            `Heartbeat enabled. Updating ${color.green(heartbeatPath)} every ${cliArgs.heartbeatInterval} seconds`,
        );
        const writeHeartbeat = () => {
            try {
                fs.writeFileSync(heartbeatPath, JSON.stringify({ timestamp: Date.now() }));
            } catch (err) {
                console.error(
                    `Failed to write heartbeat file at ${color.green(heartbeatPath)}:`,
                    (err as Error).message,
                );
            }
        };
        writeHeartbeat();
        setInterval(writeHeartbeat, intervalMs).unref();
    }

    setWindowTitle('SillyTavern WebServer');
    let logListen = 'SillyTavern is listening on';
    if (result.useIPv6 && !result.v6Failed)
        logListen += color.green(' IPv6: ' + cliArgs.getIPv6ListenUrl().host);
    if (result.useIPv4 && !result.v4Failed)
        logListen += color.green(' IPv4: ' + cliArgs.getIPv4ListenUrl().host);
    const goToLog = `Go to: ${color.blue(browserLaunchUrl)} to open SillyTavern`;
    const plainGoToLog = removeColorFormatting(goToLog);
    console.log(logListen);
    if (cliArgs.listen) {
        console.log();
        console.log(
            'To limit connections to internal localhost only ([::1] or 127.0.0.1), change the setting in config.yaml to "listen: false".',
        );
        console.log(
            'Check the "access.log" file in the data directory to inspect incoming connections:',
            color.green(getAccessLogPath()),
        );
    }
    console.log('\n' + getSeparator(plainGoToLog.length) + '\n');
    console.log(goToLog);
    console.log('\n' + getSeparator(plainGoToLog.length) + '\n');
    setupLogLevel();
    serverEvents.emit(EVENT_NAMES.SERVER_STARTED, { url: browserLaunchUrl });
}

/**
 *
 */
function apply404Middleware() {
    const notFoundWebpage =
        safeReadFileSync(path.join(globalThis.DATA_ROOT, '_errors', 'url-not-found.html')) ?? '';
    app.use((req, res) => {
        res.status(404).send(notFoundWebpage);
    });
}

/**
 *
 */
function setDnsResolutionOrder() {
    try {
        if (cliArgs.dnsPreferIPv6) {
            dns.setDefaultResultOrder('ipv6first');
            console.log('Preferring IPv6 for DNS resolution');
        } else {
            dns.setDefaultResultOrder('ipv4first');
            console.log('Preferring IPv4 for DNS resolution');
        }
    } catch {
        /* ignore */
    }
}

// ── Boot sequence ─────────────────────────────────────────────────────────────
export { preSetupTasks, postSetupTasks, apply404Middleware, setDnsResolutionOrder, app };

// ── Boot chain ────────────────────────────────────────────────────────────────
initUserStorage(globalThis.DATA_ROOT)
    .then(setDnsResolutionOrder)
    .then(ensurePublicDirectoriesExist)
    .then(migrateUserData)
    .then(migrateSystemPrompts)
    .then(migratePublicOverrides)
    .then(verifySecuritySettings)
    .then(preSetupTasks)
    .then(apply404Middleware)
    .then(() => new ServerStartup(app, cliArgs).start())
    .then(postSetupTasks);
