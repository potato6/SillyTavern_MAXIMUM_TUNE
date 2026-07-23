import fs, { promises as fsPromises } from 'node:fs';
import path from 'node:path';

import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync, default as writeFileAtomic } from 'write-file-atomic';

import { color, tryParse } from '../util.js';
import { forbiddenRegExp } from '../middleware/validateFileName.js';

/**
 * Warns if group data contains deprecated metadata keys and removes them.
 * @param {object} groupData Group data object
 */
function warnOnGroupMetadata(groupData: Record<string, unknown>) {
    if (typeof groupData !== 'object' || groupData === null) {
        return;
    }
    ['chat_metadata', 'past_metadata'].forEach((key) => {
        if (Object.hasOwn(groupData, key)) {
            console.warn(
                color.yellow(
                    `Group JSON data for "${groupData.id}" contains deprecated key "${key}".`,
                ),
            );
            delete groupData[key];
        }
    });
}

/**
 * Migrates group metadata to include chat metadata for each group chat instead of the group itself.
 * @param {import('../users.js').UserDirectoryList[]} userDirectories Listing of all users' directories
 */
export async function migrateGroupChatsMetadataFormat(userDirectories: Record<string, string>[]) {
    for (const userDirs of userDirectories) {
        try {
            let anyDataMigrated = false;
            const backupPath = path.join(userDirs.backups!, '_group_metadata_update');
            const groupFiles = await fsPromises.readdir(userDirs.groups!, { withFileTypes: true });
            const groupChatFiles = await fsPromises.readdir(userDirs.groupChats!, {
                withFileTypes: true,
            });
            for (const groupFile of groupFiles) {
                try {
                    const isJsonFile =
                        groupFile.isFile() && path.extname(groupFile.name) === '.json';
                    if (!isJsonFile) {
                        continue;
                    }
                    const groupFilePath = path.join(userDirs.groups ?? '', groupFile.name);
                    const groupDataRaw = await fsPromises.readFile(groupFilePath, 'utf8');
                    const groupData = tryParse(groupDataRaw) || {};
                    const needsMigration = ['chat_metadata', 'past_metadata'].some((key) =>
                        Object.hasOwn(groupData, key),
                    );
                    if (!needsMigration) {
                        continue;
                    }
                    if (!fs.existsSync(backupPath)) {
                        await fsPromises.mkdir(backupPath, { recursive: true });
                    }
                    await fsPromises.copyFile(groupFilePath, path.join(backupPath, groupFile.name));
                    const allMetadata = {
                        ...groupData.past_metadata,
                        [groupData.chat_id]: groupData.chat_metadata || {},
                    };
                    if (!Array.isArray(groupData.chats)) {
                        console.warn(
                            color.yellow(
                                `Group ${groupFile.name} has no chats array, skipping migration.`,
                            ),
                        );
                        continue;
                    }
                    for (const chatId of groupData.chats) {
                        try {
                            const chatFileName = sanitize(`${chatId}.jsonl`);
                            const chatFileDirent = groupChatFiles.find(
                                (f) => f.isFile() && f.name === chatFileName,
                            );
                            if (!chatFileDirent) {
                                console.warn(
                                    color.yellow(
                                        `Group chat file ${chatId} not found, skipping migration.`,
                                    ),
                                );
                                continue;
                            }
                            const chatFilePath = path.join(userDirs.groupChats!, chatFileName);
                            const chatMetadata = allMetadata[chatId] || {};
                            const chatDataRaw = await fsPromises.readFile(chatFilePath, 'utf8');
                            const chatData = chatDataRaw
                                .split('\n')
                                .filter((line) => line.trim())
                                .map((line) => tryParse(line))
                                .filter(Boolean);
                            const alreadyHasMetadata =
                                chatData.length > 0 && Object.hasOwn(chatData[0], 'chat_metadata');
                            if (alreadyHasMetadata) {
                                console.log(
                                    color.yellow(
                                        `Group chat ${chatId} already has chat metadata, skipping update.`,
                                    ),
                                );
                                continue;
                            }
                            await fsPromises.copyFile(
                                chatFilePath,
                                path.join(backupPath, chatFileName),
                            );
                            const chatHeader = {
                                chat_metadata: chatMetadata,
                                user_name: 'unused',
                                character_name: 'unused',
                            };
                            const newChatData = [chatHeader, ...chatData];
                            const newChatDataRaw = newChatData
                                .map((entry) => JSON.stringify(entry))
                                .join('\n');
                            await writeFileAtomic(chatFilePath, newChatDataRaw, 'utf8');
                            console.log(`Updated group chat data format for ${chatId}`);
                            anyDataMigrated = true;
                        } catch (chatError) {
                            console.error(
                                color.red(`Could not update existing chat data for ${chatId}`),
                                chatError,
                            );
                        }
                    }
                    delete groupData.chat_metadata;
                    delete groupData.past_metadata;
                    await writeFileAtomic(
                        groupFilePath,
                        JSON.stringify(groupData, null, 4),
                        'utf8',
                    );
                    console.log(`Migrated group chats metadata for group: ${groupData.id}`);
                    anyDataMigrated = true;
                } catch (groupError) {
                    console.error(
                        color.red(`Could not process group file ${groupFile.name}`),
                        groupError,
                    );
                }
            }
            if (anyDataMigrated) {
                console.log(
                    color.green(
                        `Completed migration of group chats metadata for user at ${userDirs.root}`,
                    ),
                );
                console.log(color.cyan(`Backups of modified files are located at ${backupPath}`));
            }
        } catch (directoryError) {
            console.error(
                color.red(`Error migrating group chats metadata for user at ${userDirs.root}`),
                directoryError,
            );
        }
    }
}

export const router = new Elysia({ prefix: '/api/groups' })
    .post('/all', (context) => {
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const groups: object[] = [];

        if (!fs.existsSync(directories?.groups ?? '')) {
            fs.mkdirSync(directories?.groups ?? '');
        }

        const files = fs
            .readdirSync(directories?.groups ?? '')
            .filter((x) => path.extname(x) === '.json');
        const chats = fs
            .readdirSync(directories?.groupChats ?? '')
            .filter((x) => path.extname(x) === '.jsonl');

        files.forEach(function (file) {
            try {
                const filePath = path.join(directories?.groups ?? '', file);
                const fileContents = fs.readFileSync(filePath, 'utf8');
                const group = JSON.parse(fileContents);
                const groupStat = fs.statSync(filePath);
                group.date_added = groupStat.birthtimeMs;
                group.create_date = new Date(groupStat.birthtimeMs).toISOString();

                let chat_size = 0;
                let date_last_chat = 0;

                if (Array.isArray(group.chats) && Array.isArray(chats)) {
                    for (const chat of chats) {
                        if (group.chats.includes(path.parse(chat).name)) {
                            const chatStat = fs.statSync(
                                path.join(directories?.groupChats ?? '', chat),
                            );
                            chat_size += chatStat.size;
                            date_last_chat = Math.max(date_last_chat, chatStat.mtimeMs);
                        }
                    }
                }

                group.date_last_chat = date_last_chat;
                group.chat_size = chat_size;
                groups.push(group);
            } catch (error) {
                console.error(error);
            }
        });

        return groups;
    })
    .post('/create', (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const bodyAny = body as Record<string, unknown> | null;

        if (!bodyAny) {
            set.status = 400;
            return;
        }

        warnOnGroupMetadata(bodyAny);
        const id = String(Date.now());
        const groupMetadata = {
            id: id,
            name: (bodyAny.name as string) ?? 'New Group',
            members: (bodyAny.members as string[]) ?? [],
            avatar_url: bodyAny.avatar_url as string,
            allow_self_responses: !!(bodyAny.allow_self_responses as boolean),
            activation_strategy: (bodyAny.activation_strategy as number) ?? 0,
            generation_mode: (bodyAny.generation_mode as number) ?? 0,
            disabled_members: (bodyAny.disabled_members as string[]) ?? [],
            fav: bodyAny.fav as boolean,
            chat_id: (bodyAny.chat_id as string) ?? id,
            chats: (bodyAny.chats as string[]) ?? [id],
            auto_mode_delay: (bodyAny.auto_mode_delay as number) ?? 5,
            generation_mode_join_prefix: (bodyAny.generation_mode_join_prefix as string) ?? '',
            generation_mode_join_suffix: (bodyAny.generation_mode_join_suffix as string) ?? '',
        };
        const pathToFile = path.join(directories?.groups ?? '', sanitize(`${id}.json`));
        const fileData = JSON.stringify(groupMetadata, null, 4);

        if (!fs.existsSync(directories?.groups ?? '')) {
            fs.mkdirSync(directories?.groups ?? '');
        }

        writeFileAtomicSync(pathToFile, fileData);
        return groupMetadata;
    })
    .post('/edit', (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const bodyAny = body as Record<string, unknown> | null;

        if (!bodyAny || !bodyAny.id) {
            set.status = 400;
            return;
        }

        if (typeof bodyAny.id === 'string' && forbiddenRegExp.test(bodyAny.id)) {
            console.error('An error occurred while validating the request body', {
                field: 'id',
                value: bodyAny.id,
            });
            set.status = 400;
            return;
        }

        warnOnGroupMetadata(bodyAny);
        const id = bodyAny.id as string;
        const pathToFile = path.join(directories?.groups ?? '', sanitize(`${id}.json`));
        const fileData = JSON.stringify(bodyAny, null, 4);

        writeFileAtomicSync(pathToFile, fileData);
        return { ok: true };
    })
    .post('/delete', async (context) => {
        const { body, set } = context;
        const user = (context as unknown as Record<string, unknown>).user as Record<
            string,
            unknown
        > | null;
        const directories = user?.directories as Record<string, string> | undefined;
        const bodyAny = body as Record<string, unknown> | null;

        if (!bodyAny || !bodyAny.id) {
            set.status = 400;
            return;
        }

        if (typeof bodyAny.id === 'string' && forbiddenRegExp.test(bodyAny.id)) {
            console.error('An error occurred while validating the request body', {
                field: 'id',
                value: bodyAny.id,
            });
            set.status = 400;
            return;
        }

        const id = bodyAny.id as string;
        const pathToGroup = path.join(directories?.groups ?? '', sanitize(`${id}.json`));

        try {
            // Delete group chats
            const group = JSON.parse(fs.readFileSync(pathToGroup, 'utf8'));

            if (group && Array.isArray(group.chats)) {
                for (const chat of group.chats) {
                    console.info('Deleting group chat', chat);
                    const pathToFile = path.join(
                        directories?.groupChats ?? '',
                        sanitize(`${chat}.jsonl`),
                    );

                    if (fs.existsSync(pathToFile)) {
                        fs.unlinkSync(pathToFile);
                    }
                }
            }
        } catch (error) {
            console.error('Could not delete group chats. Clean them up manually.', error);
        }

        if (fs.existsSync(pathToGroup)) {
            fs.unlinkSync(pathToGroup);
        }

        return { ok: true };
    });
