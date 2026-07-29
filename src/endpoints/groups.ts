import fsPromises from 'node:fs/promises';
import path from 'node:path';

import { Elysia } from 'elysia';
import sanitize from 'sanitize-filename';
import writeFileAtomic from 'write-file-atomic';

import { color, tryParse } from '../util.js';
import { forbiddenRegExp } from '../middleware/validateFileName.js';

interface UserDirectories {
    groups?: string;
    groupChats?: string;
    backups?: string;
    root?: string;
    [key: string]: unknown;
}

interface UserContext {
    directories?: UserDirectories;
    [key: string]: unknown;
}

/**
 * Warns if group data contains deprecated metadata keys and removes them.
 * @param {object} groupData Group data object
 */
function warnOnGroupMetadata(groupData: Record<string, unknown>) {
    if (typeof groupData !== 'object' || groupData === null) {
        return;
    }
    if (Object.hasOwn(groupData, 'chat_metadata')) {
        console.warn(
            color.yellow(
                `Group JSON data for "${groupData.id}" contains deprecated key "chat_metadata".`,
            ),
        );
        delete groupData.chat_metadata;
    }
    if (Object.hasOwn(groupData, 'past_metadata')) {
        console.warn(
            color.yellow(
                `Group JSON data for "${groupData.id}" contains deprecated key "past_metadata".`,
            ),
        );
        delete groupData.past_metadata;
    }
}

/**
 * Migrates group metadata to include chat metadata for each group chat instead of the group itself.
 * @param {import('../users.js').UserDirectoryList[]} userDirectories Listing of all users' directories
 */
export async function migrateGroupChatsMetadataFormat(userDirectories: Record<string, string>[]) {
    const userCount = userDirectories.length;

    for (let u = 0; u < userCount; u++) {
        const userDirs = userDirectories[u]!;
        try {
            let anyDataMigrated = false;
            const backupsDir = userDirs.backups ?? '';
            const groupsDir = userDirs.groups ?? '';
            const groupChatsDir = userDirs.groupChats ?? '';
            const backupPath = path.join(backupsDir, '_group_metadata_update');

            const groupFiles = await fsPromises.readdir(groupsDir, { withFileTypes: true });
            const groupChatFiles = await fsPromises.readdir(groupChatsDir, {
                withFileTypes: true,
            });

            const chatFileNamesSet = new Set<string>();
            for (let i = 0; i < groupChatFiles.length; i++) {
                const f = groupChatFiles[i]!;
                if (f.isFile()) {
                    chatFileNamesSet.add(f.name);
                }
            }

            for (let g = 0; g < groupFiles.length; g++) {
                const groupFile = groupFiles[g]!;
                try {
                    const fn = groupFile.name;
                    if (!groupFile.isFile() || !fn.endsWith('.json')) {
                        continue;
                    }

                    const groupFilePath = path.join(groupsDir, fn);
                    const groupDataRaw = await fsPromises.readFile(groupFilePath, 'utf8');
                    const groupData = (tryParse(groupDataRaw) || {}) as Record<string, any>;

                    const hasChatMeta = Object.hasOwn(groupData, 'chat_metadata');
                    const hasPastMeta = Object.hasOwn(groupData, 'past_metadata');

                    if (!hasChatMeta && !hasPastMeta) {
                        continue;
                    }

                    await fsPromises.mkdir(backupPath, { recursive: true });
                    await fsPromises.copyFile(groupFilePath, path.join(backupPath, fn));

                    const pastMeta = groupData.past_metadata || {};
                    const chatMeta = groupData.chat_metadata || {};

                    const allMetadata: Record<string, any> = {
                        ...pastMeta,
                        [groupData.chat_id]: chatMeta,
                    };

                    const chats = groupData.chats;
                    if (!Array.isArray(chats)) {
                        console.warn(
                            color.yellow(`Group ${fn} has no chats array, skipping migration.`),
                        );
                        continue;
                    }

                    for (let c = 0; c < chats.length; c++) {
                        const chatId = chats[c];
                        try {
                            const chatFileName = sanitize(`${chatId}.jsonl`);
                            if (!chatFileNamesSet.has(chatFileName)) {
                                console.warn(
                                    color.yellow(
                                        `Group chat file ${chatId} not found, skipping migration.`,
                                    ),
                                );
                                continue;
                            }

                            const chatFilePath = path.join(groupChatsDir, chatFileName);
                            const chatMetadata = allMetadata[chatId] || {};
                            const chatDataRaw = await fsPromises.readFile(chatFilePath, 'utf8');
                            const lines = chatDataRaw.split('\n');

                            const chatData: object[] = [];
                            for (let l = 0; l < lines.length; l++) {
                                const line = lines[l]!.trim();
                                if (line) {
                                    const parsed = tryParse(line);
                                    if (parsed) chatData.push(parsed as object);
                                }
                            }

                            const alreadyHasMetadata =
                                chatData.length > 0 && Object.hasOwn(chatData[0]!, 'chat_metadata');

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

                            const serializedLines = [JSON.stringify(chatHeader)];

                            for (let idx = 0; idx < chatData.length; idx++) {
                                serializedLines.push(JSON.stringify(chatData[idx]));
                            }

                            const newChatDataRaw = serializedLines.join('\n');
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
    .post('/all', async (context) => {
        const ctx = context as Record<string, unknown>;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;
        const groupsDir = directories?.groups ?? '';
        const groupChatsDir = directories?.groupChats ?? '';

        const groups: object[] = [];

        try {
            await fsPromises.mkdir(groupsDir, { recursive: true });
            await fsPromises.mkdir(groupChatsDir, { recursive: true });
        } catch {
            // Directories exist
        }

        try {
            const groupDirents = await fsPromises.readdir(groupsDir, { withFileTypes: true });
            const chatDirents = await fsPromises.readdir(groupChatsDir, { withFileTypes: true });

            const chatStatsMap = new Map<string, { size: number; mtimeMs: number }>();
            const statPromises: Promise<void>[] = [];

            for (let i = 0; i < chatDirents.length; i++) {
                const entry = chatDirents[i]!;
                if (entry.isFile() && entry.name.endsWith('.jsonl')) {
                    const fileName = entry.name;
                    const chatName = fileName.slice(0, -6);
                    const chatFilePath = path.join(groupChatsDir, fileName);

                    statPromises.push(
                        fsPromises
                            .stat(chatFilePath)
                            .then((st) => {
                                chatStatsMap.set(chatName, { size: st.size, mtimeMs: st.mtimeMs });
                            })
                            .catch(() => {}),
                    );
                }
            }

            await Promise.all(statPromises);

            const readPromises: Promise<void>[] = [];

            for (let i = 0; i < groupDirents.length; i++) {
                const entry = groupDirents[i]!;
                if (entry.isFile() && entry.name.endsWith('.json')) {
                    const filePath = path.join(groupsDir, entry.name);

                    readPromises.push(
                        Promise.all([
                            fsPromises.readFile(filePath, 'utf8'),
                            fsPromises.stat(filePath),
                        ])
                            .then(([fileContents, groupStat]) => {
                                const group = JSON.parse(fileContents);
                                const birthMs = groupStat.birthtimeMs;
                                group.date_added = birthMs;
                                group.create_date = new Date(birthMs).toISOString();

                                let chat_size = 0;
                                let date_last_chat = 0;

                                const chatsList = group.chats;
                                if (Array.isArray(chatsList)) {
                                    for (let c = 0; c < chatsList.length; c++) {
                                        const chatId = chatsList[c];
                                        const st = chatStatsMap.get(chatId);
                                        if (st) {
                                            chat_size += st.size;
                                            if (st.mtimeMs > date_last_chat) {
                                                date_last_chat = st.mtimeMs;
                                            }
                                        }
                                    }
                                }

                                group.date_last_chat = date_last_chat;
                                group.chat_size = chat_size;
                                groups.push(group);
                            })
                            .catch((error) => {
                                console.error(error);
                            }),
                    );
                }
            }

            await Promise.all(readPromises);
            return groups;
        } catch (error) {
            console.error(error);
            return [];
        }
    })
    .post('/create', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const bodyAny = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

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
            allow_self_responses: Boolean(bodyAny.allow_self_responses),
            activation_strategy: (bodyAny.activation_strategy as number) ?? 0,
            generation_mode: (bodyAny.generation_mode as number) ?? 0,
            disabled_members: (bodyAny.disabled_members as string[]) ?? [],
            fav: Boolean(bodyAny.fav),
            chat_id: (bodyAny.chat_id as string) ?? id,
            chats: (bodyAny.chats as string[]) ?? [id],
            auto_mode_delay: (bodyAny.auto_mode_delay as number) ?? 5,
            generation_mode_join_prefix: (bodyAny.generation_mode_join_prefix as string) ?? '',
            generation_mode_join_suffix: (bodyAny.generation_mode_join_suffix as string) ?? '',
        };

        const groupsDir = directories?.groups ?? '';
        const pathToFile = path.join(groupsDir, `${id}.json`);
        const fileData = JSON.stringify(groupMetadata, null, 4);

        await fsPromises.mkdir(groupsDir, { recursive: true });
        await writeFileAtomic(pathToFile, fileData);

        return groupMetadata;
    })
    .post('/edit', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const bodyAny = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

        if (!bodyAny || !bodyAny.id) {
            set.status = 400;
            return;
        }

        const id = bodyAny.id;
        if (typeof id === 'string' && forbiddenRegExp.test(id)) {
            console.error('An error occurred while validating the request body', {
                field: 'id',
                value: id,
            });
            set.status = 400;
            return;
        }

        warnOnGroupMetadata(bodyAny);
        const idStr = String(id);
        const groupsDir = directories?.groups ?? '';
        const pathToFile = path.join(groupsDir, sanitize(`${idStr}.json`));
        const fileData = JSON.stringify(bodyAny, null, 4);

        await writeFileAtomic(pathToFile, fileData);
        return { ok: true };
    })
    .post('/delete', async (context) => {
        const { set } = context;
        const ctx = context as Record<string, unknown>;
        const bodyAny = ctx.body as Record<string, unknown> | undefined;
        const user = ctx.user as UserContext | undefined;
        const directories = user?.directories;

        if (!bodyAny || !bodyAny.id) {
            set.status = 400;
            return;
        }

        const id = bodyAny.id;
        if (typeof id === 'string' && forbiddenRegExp.test(id)) {
            console.error('An error occurred while validating the request body', {
                field: 'id',
                value: id,
            });
            set.status = 400;
            return;
        }

        const idStr = String(id);
        const groupsDir = directories?.groups ?? '';
        const groupChatsDir = directories?.groupChats ?? '';
        const pathToGroup = path.join(groupsDir, sanitize(`${idStr}.json`));

        try {
            const fileContents = await fsPromises.readFile(pathToGroup, 'utf8');
            const group = JSON.parse(fileContents);

            if (group && Array.isArray(group.chats)) {
                const chats = group.chats;
                for (let i = 0; i < chats.length; i++) {
                    const chat = chats[i];
                    console.info('Deleting group chat', chat);
                    const pathToFile = path.join(groupChatsDir, sanitize(`${chat}.jsonl`));
                    try {
                        await fsPromises.unlink(pathToFile);
                    } catch {
                        // File already missing or deleted
                    }
                }
            }
        } catch (error) {
            console.error('Could not delete group chats. Clean them up manually.', error);
        }

        try {
            await fsPromises.unlink(pathToGroup);
        } catch {
            // Group file already missing or deleted
        }

        return { ok: true };
    });
