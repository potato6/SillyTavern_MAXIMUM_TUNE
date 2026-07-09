import path from 'node:path';
import fs from 'node:fs';
import type { Request, Response, NextFunction } from 'express';
import { getIpAddress } from '../express-common.js';
import { color, getConfigValue } from '../util.js';

// @ts-expect-error TS(2345) FIXME: Argument of type 'true' is not assignable to param... Remove this comment to see the full error message
const enableAccessLog = getConfigValue('logging.enableAccessLog', true, 'boolean');

const knownIPs = new Set();

export const getAccessLogPath = () => path.join(globalThis.DATA_ROOT, 'access.log');

/**
 *
 */
export function migrateAccessLog() {
    try {
        if (!fs.existsSync('access.log')) {
            return;
        }
        const logPath = getAccessLogPath();
        if (fs.existsSync(logPath)) {
            return;
        }
        fs.renameSync('access.log', logPath);
        console.log(color.yellow('Migrated access.log to new location:'), logPath);
    } catch (e) {
        console.error('Failed to migrate access log:', e);
        console.info('Please move access.log to the data directory manually.');
    }
}

/**
 * Creates middleware for logging access and new connections
 * @returns {import('express').RequestHandler} Express request handler middleware
 */
export default function accessLoggerMiddleware() {
    return function (req: Request, res: Response, next: NextFunction) {
        const clientIp = getIpAddress(req, true);
        const userAgent = req.headers['user-agent'];

        if (!knownIPs.has(clientIp)) {
            // Log new connection
            knownIPs.add(clientIp);

            // Write to access log if enabled
            if (enableAccessLog) {
                console.info(color.yellow(`New connection from ${clientIp}; User Agent: ${userAgent}\n`));
                const logPath = getAccessLogPath();
                const timestamp = new Date().toISOString();
                const log = `${timestamp} ${clientIp} ${userAgent}\n`;

                fs.appendFile(logPath, log, (err) => {
                    if (err) {
                        console.error('Failed to write access log:', err);
                    }
                });
            }
        }

        next();
    };
}
