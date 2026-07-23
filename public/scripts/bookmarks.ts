import {
    characters,
    saveChat,
    system_message_types,
    syncSwipeToMes,
    this_chid,
    openCharacterChat,
    chat_metadata,
    getRequestHeaders,
    getThumbnailUrl,
    getCharacters,
    chat,
    saveChatConditional,
    saveItemizedPrompts,
    setActiveGroup,
    getCurrentChatDetails,
} from '../script.js';
import { humanizedDateTime } from './RossAscends-mods.js';
import {
    DEFAULT_AUTO_MODE_DELAY,
    group_activation_strategy,
    group_generation_mode,
    groups,
    openGroupById,
    openGroupChat,
    saveGroupBookmarkChat,
    selected_group,
} from './group-chats.js';
import { loader } from './action-loader.js';
import { getLastMessageId } from './macros.js';
import { Popup } from './popup.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import {
    ARGUMENT_TYPE,
    SlashCommandArgument,
    SlashCommandNamedArgument,
} from './slash-commands/SlashCommandArgument.js';
import { commonEnumProviders } from './slash-commands/SlashCommandCommonEnumsProvider.js';
import { SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import { createTagMapFromList } from './tags.js';
import { renderTemplateAsync } from './templates.js';
import { compressRequest } from './request-compression.js';
import { t } from './i18n.js';

import { getUniqueName, isTrueBoolean } from './utils.js';

const bookmarkNameToken = 'Checkpoint #';
const cleanSuffixRegex = new RegExp(` - ${bookmarkNameToken}\\d+$`);
const cleanPrefixRegex = new RegExp(`^${bookmarkNameToken}\\d+ - `);
const branchSuffixRegex = / - Branch #\d+$/;
const branchPrefixRegex = /^Branch #\d+ - /;

/**
 * Gets the names of existing chats for the current character or group.
 * @returns {Promise<string[]>} - Returns a promise that resolves to an array of existing chat names.
 */
async function getExistingChatNames() {
    if (selected_group) {
        const group = groups.find((x) => String(x.id) === String(selected_group));
        if (group && Array.isArray(group.chats)) {
            return group.chats;
        }

        return [];
    }

    if (this_chid === undefined) {
        return [];
    }

    const character = characters[this_chid];
    if (!character) {
        return [];
    }

    const response = await fetch('/api/characters/chats', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ avatar_url: character.avatar, simple: true }),
    });

    if (response.ok) {
        const data = await response.json();
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        return Object.values(data).map((x) => x.file_name.replace('.jsonl', ''));
    }

    return [];
}

/**
 * Generates and prompts for a checkpoint name.
 * @param {object} root0
 * @param {boolean} root0.isReplace
 * @param {string|null} root0.forceName
 */
async function getBookmarkName({ isReplace = false, forceName = null } = {}) {
    const mainChatName = getCurrentChatDetails().sessionName;

    /**
     * Builds a checkpoint name while preventing regex recompilation in loops
     * @param {string} name
     * @param {number} i
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
    function buildCheckpointName(name, i) {
        let cleanName = name.replace(cleanSuffixRegex, '');
        cleanName = cleanName.replace(cleanPrefixRegex, '');
        return `${cleanName} - ${bookmarkNameToken}${i}`;
    }

    const existingChats = await getExistingChatNames();
    // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
    const suggestedName = getUniqueName(mainChatName, (x) => existingChats.includes(x), {
        nameBuilder: buildCheckpointName,
    } as any);

    const body = await renderTemplateAsync('createCheckpoint', {
        isReplace: isReplace,
        suggestedName: suggestedName,
    });
    let name =
        forceName ??
        (await Popup.show.input('Create Checkpoint', body, suggestedName ?? undefined));

    if (name === '') {
        name = suggestedName;
    }

    if (!name) {
        return null;
    }

    return name;
}

/**
 * Retrieves the main chat name for the active session.
 */
function getMainChatName() {
    if (chat_metadata) {
        if (chat_metadata.main_chat) {
            return chat_metadata.main_chat;
        } else if (selected_group) {
            return null;
        } else {
            const charChat = characters[this_chid]?.chat;
            if (charChat && charChat.includes(bookmarkNameToken)) {
                const tokenIndex = charChat.lastIndexOf(bookmarkNameToken);
                chat_metadata.main_chat = charChat.substring(0, tokenIndex).trim();
                return chat_metadata.main_chat;
            }
        }
    }
    return null;
}

/**
 * Toggles the visibility of bookmark-related UI buttons.
 */
export function showBookmarksButtons() {
    const optionConvertToGroup = document.getElementById('option_convert_to_group');
    const optionBackToMain = document.getElementById('option_back_to_main');
    const optionNewBookmark = document.getElementById('option_new_bookmark');

    try {
        const hasSelectedGroup = Boolean(selected_group);
        const hasMainChat = Boolean(chat_metadata?.main_chat);
        const hasCharChat = Boolean(this_chid !== undefined && characters[this_chid]?.chat);

        if (optionConvertToGroup)
            optionConvertToGroup.style.display = hasSelectedGroup ? 'none' : '';

        if (hasMainChat) {
            if (optionBackToMain) optionBackToMain.style.display = '';
            if (optionNewBookmark) optionNewBookmark.style.display = '';
        } else if (!hasSelectedGroup && !hasCharChat) {
            if (optionBackToMain) optionBackToMain.style.display = 'none';
            if (optionNewBookmark) optionNewBookmark.style.display = 'none';
        } else {
            if (optionBackToMain) optionBackToMain.style.display = 'none';
            if (optionNewBookmark) optionNewBookmark.style.display = '';
        }
    } catch {
        if (optionBackToMain) optionBackToMain.style.display = 'none';
        if (optionNewBookmark) optionNewBookmark.style.display = 'none';
        if (optionConvertToGroup) optionConvertToGroup.style.display = 'none';
    }
}

/**
 * Saves a bookmark for the current chat state via the UI menu.
 */
async function saveBookmarkMenu() {
    if (!chat.length) {
        notyf.warning('The chat is empty.', 'Checkpoint creation failed');
        return;
    }

    return await createNewBookmark(chat.length - 1);
}

/**
 * Builds the branch chat snapshot, optionally selecting a specific swipe for the target message.
 * @param {number} mesId
 * @param {{swipeId?: number|null}} [options]
 * @returns {ChatMessage[]|null}
 */
function getBranchChatSnapshot(
    mesId: number,
    { swipeId = null }: { swipeId?: number | null } = {},
) {
    const sliceEnd = Number(mesId) + 1;
    const snapshot = structuredClone(chat.slice(0, sliceEnd));

    if (swipeId === null) {
        return snapshot;
    }

    if (!syncSwipeToMes(null, swipeId as never, snapshot[mesId] as never)) {
        return null;
    }

    return snapshot;
}

// Export is used by Timelines extension. Do not remove.
/**
 * Creates a chat branch based on a specific message.
 * @param {number} mesId
 * @param {object} root0
 * @param {number|null} root0.swipeId
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'mesId' implicitly has an 'any' type.
export async function createBranch(mesId, { swipeId = null } = {}) {
    if (!chat.length) {
        notyf.warning('The chat is empty.', 'Branch creation failed');
        return;
    }

    const messageIndex = Number(mesId);
    if (messageIndex < 0 || messageIndex >= chat.length) {
        notyf.warning('Invalid message ID.', 'Branch creation failed');
        return;
    }

    const lastMes = chat[messageIndex];
    const mainChatName = getCurrentChatDetails().sessionName;
    const newMetadata = { main_chat: mainChatName };
    const selectedSwipeId = swipeId === null ? null : Number(swipeId);

    if (
        selectedSwipeId !== null &&
        (!Number.isInteger(selectedSwipeId) ||
            selectedSwipeId < 0 ||
            selectedSwipeId >= (lastMes?.swipes?.length ?? 0))
    ) {
        notyf.warning('Invalid swipe ID.', 'Branch creation failed');
        return;
    }

    /**
     * Reuses branch regex patterns to construct unique branch names.
     * @param {string} name
     * @param {number} i
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
    function buildBranchName(name, i) {
        let cleanName = name.replace(branchSuffixRegex, '');
        cleanName = cleanName.replace(branchPrefixRegex, '');
        return `${cleanName} - Branch #${i}`;
    }

    const existingChats = await getExistingChatNames();
    // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
    const name = getUniqueName(mainChatName, (x) => existingChats.includes(x), {
        nameBuilder: buildBranchName,
    } as any);
    if (!name) {
        console.error('Could not generate a unique branch name.');
        notyf.error('Could not generate a unique branch name.', 'Branch creation failed');
        return;
    }

    const branchChatSnapshot = getBranchChatSnapshot(messageIndex, { swipeId: selectedSwipeId });
    if (!branchChatSnapshot) {
        notyf.warning(
            'Could not prepare the selected swipe for branching.',
            'Branch creation failed',
        );
        return;
    }

    if (selected_group) {
        await saveGroupBookmarkChat(
            selected_group,
            name,
            newMetadata,
            messageIndex,
            branchChatSnapshot as any,
        );
    } else {
        await saveChat({
            chatName: name,
            withMetadata: newMetadata,
            mesId: messageIndex,
            chatData: branchChatSnapshot,
        });
    }

    if (!lastMes) return name;

    if (!lastMes.extra || typeof lastMes.extra !== 'object') {
        lastMes.extra = { branches: [] };
    } else if (!Array.isArray(lastMes.extra.branches)) {
        lastMes.extra.branches = [];
    }

    lastMes.extra.branches.push(name);
    return name;
}

/**
 * Creates a new bookmark for a message.
 * @param {number} mesId - The ID of the message.
 * @param {object} [options] - Optional parameters.
 * @param {string?} [options.forceName] - The name to force for the bookmark.
 * @returns {Promise<string?>} - A promise that resolves to the bookmark name when the bookmark is created.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'mesId' implicitly has an 'any' type.
export async function createNewBookmark(mesId, { forceName = null } = {}) {
    if (this_chid === undefined && !selected_group) {
        notyf.info('No character selected.', 'Create Checkpoint');
        return null;
    }
    if (!chat.length) {
        notyf.warning('The chat is empty.', 'Create Checkpoint');
        return null;
    }

    const messageIndex = Number(mesId);
    if (!chat[messageIndex]) {
        notyf.warning('Invalid message ID.', 'Create Checkpoint');
        return null;
    }

    const lastMes = chat[messageIndex];

    if (!lastMes.extra || typeof lastMes.extra !== 'object') {
        lastMes.extra = {};
    }

    const isReplace = lastMes.extra.bookmark_link;

    const name = await getBookmarkName({ isReplace: isReplace, forceName: forceName });
    if (!name) {
        return null;
    }

    const mainChat = selected_group
        ? groups?.find((x) => String(x.id) === String(selected_group))?.chat_id
        : characters[this_chid].chat;
    const newMetadata = { main_chat: mainChat };
    await saveItemizedPrompts(name);

    if (selected_group) {
        await saveGroupBookmarkChat(selected_group, name, newMetadata, messageIndex);
    } else {
        await saveChat({ chatName: name, withMetadata: newMetadata, mesId: messageIndex });
    }

    lastMes.extra.bookmark_link = name;

    const mes = document.querySelector(`.mes[mesid="${messageIndex}"]`);
    if (mes) updateBookmarkDisplay(mes as HTMLElement, name as unknown as null | undefined);

    await saveChatConditional();
    notyf.success(
        'Click the flag icon next to the message to open the checkpoint chat.',
        'Create Checkpoint',
        { timeOut: 10000 },
    );
    return name;
}

/**
 * Updates the display of the bookmark on a chat message.
 * @param {HTMLElement} mes - The message element
 * @param {string?} [newBookmarkLink] - The new bookmark link (optional)
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'mes' implicitly has an 'any' type.
export function updateBookmarkDisplay(mes, newBookmarkLink = null) {
    // Unwrap Cash object to DOM element if needed
    if (mes?.[0] instanceof Element) {
        mes = mes[0];
    }
    if (!(mes instanceof Element)) return;
    if (newBookmarkLink) {
        mes.setAttribute('bookmark_link', newBookmarkLink);
    }
    const bookmarkFlag = mes.querySelector('.mes_bookmark');
    if (bookmarkFlag) {
        bookmarkFlag.setAttribute(
            'title',
            `Checkpoint\n${mes.getAttribute('bookmark_link') ?? ''}\n\n${bookmarkFlag.getAttribute('data-tooltip') ?? ''}`,
        );
    }
}

/**
 * Returns user back to the main chat from a checkpoint/branch.
 */
async function backToMainChat() {
    const mainChatName = getMainChatName();
    const allChats = await getExistingChatNames();

    if (allChats.includes(mainChatName)) {
        if (selected_group) {
            await openGroupChat(selected_group, mainChatName);
        } else {
            await openCharacterChat(mainChatName);
        }
        return mainChatName;
    }

    return null;
}

/**
 * Converts a 1-on-1 character chat into a group chat natively.
 */
export async function convertSoloToGroupChat() {
    if (selected_group) {
        console.log('Already in group. No need for conversion');
        return;
    }

    if (this_chid === undefined) {
        console.log('Need to have a character selected');
        return;
    }

    const confirm = await Popup.show.confirm(
        t`Convert to group chat`,
        t`Are you sure you want to convert this chat to a group chat?` +
            '<br />' +
            t`This cannot be reverted.`,
    );
    if (!confirm) {
        return;
    }

    const character = characters[this_chid];

    const name = getUniqueName(
        `Group: ${character.name}`,
        (y: any) => groups.findIndex((x) => x.name === y) !== -1,
    );
    const avatar = getThumbnailUrl('avatar', character.avatar);
    const chatName = humanizedDateTime();
    const chats = [chatName];
    const members = [character.avatar];
    const favChecked = character.fav || character.fav == 'true';

    // Destructures main_chat off the payload rather than using delete, avoiding dictionary mode transitions.
    const { ...metadata } = chat_metadata || {};

    /** @type {ChatHeader} */
    const chatHeader = {
        chat_metadata: metadata,
        user_name: 'unused',
        character_name: 'unused',
    };
    /** @type {Omit<Group, 'id'>} */
    const groupCreateModel = {
        name: name,
        members: members,
        avatar_url: avatar,
        allow_self_responses: false,
        activation_strategy: group_activation_strategy.NATURAL,
        disabled_members: [],
        fav: favChecked,
        chat_id: chatName,
        chats: chats,
        hideMutedSprites: false,
        generation_mode: group_generation_mode.SWAP,
        auto_mode_delay: DEFAULT_AUTO_MODE_DELAY,
    };

    const createGroupResponse = await fetch('/api/groups/create', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(groupCreateModel),
    });

    if (!createGroupResponse.ok) {
        console.error('Group creation unsuccessful');
        return;
    }

    /** @type {Group} */
    const group = await createGroupResponse.json();

    createTagMapFromList('#tagList', group.id);

    await getCharacters();

    const groupChat = Array.from({ length: chat.length });
    const genIdFirst = Date.now();

    for (let index = 0; index < chat.length; index++) {
        const message = structuredClone(chat[index]);
        groupChat[index] = message;

        if (
            message!.is_user ||
            message!.is_system ||
            message!.extra?.type === system_message_types.NARRATOR ||
            message!.force_avatar !== undefined
        ) {
            continue;
        }

        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        message.name = character.name;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        message.original_avatar = character.avatar;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        message.force_avatar = getThumbnailUrl('avatar', character.avatar);

        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        if (!message.extra || typeof message.extra !== 'object') {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            message.extra = { gen_id: genIdFirst + index };
        } else {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            message.extra.gen_id = genIdFirst + index;
        }
    }

    const createChatRequest = await compressRequest({
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ id: chatName, chat: [chatHeader, ...groupChat] }),
    });
    const createChatResponse = await fetch('/api/chats/group/save', createChatRequest);

    if (!createChatResponse.ok) {
        console.error('Group chat creation unsuccessful');
        notyf.error('Group chat creation unsuccessful');
        return;
    }

    setActiveGroup(group.id);
    await openGroupById(group.id);

    notyf.success(t`The chat has been successfully converted!`);
}

/**
 * Creates a new branch from the message with the given ID
 * @param {number} mesId Message ID
 * @param {{swipeId?: number|null}} [options] Branch options
 * @returns {Promise<string?>} Branch file name
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'mesId' implicitly has an 'any' type.
export async function branchChat(mesId, { swipeId = null } = {}) {
    if (this_chid === undefined && !selected_group) {
        notyf.info('No character selected.', 'Create Branch');
        return null;
    }

    const fileName = await createBranch(mesId, { swipeId });
    if (!fileName) {
        return null;
    }

    await saveItemizedPrompts(fileName);

    if (selected_group) {
        await openGroupChat(selected_group, fileName);
    } else {
        await openCharacterChat(fileName);
    }

    return fileName;
}

/**
 * Registers bookmark slash commands for parsing engine.
 */
function registerBookmarksSlashCommands() {
    /**
     * Validates a message ID ensuring its bounds within the packed chat array.
     * @param {number} mesId - The message ID to validate.
     * @param {string} context - The context of the slash command. Will be used as the title of any toasts.
     * @returns {boolean} - Returns true if the message ID is valid, otherwise false.
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'mesId' implicitly has an 'any' type.
    function validateMessageId(mesId, context) {
        if (!Number.isFinite(mesId) || mesId < 0 || mesId >= chat.length || !chat[mesId]) {
            notyf.warning(`Invalid message ID was provided`, context);
            return false;
        }
        return true;
    }

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'branch-create',
            returns: 'Name of the new branch',
            // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
            callback: async (args, text) => {
                const mesId = Number(args.mesId ?? text ?? getLastMessageId());
                if (!validateMessageId(mesId, 'Create Branch')) return '';

                const branchName = await branchChat(mesId);
                return branchName ?? '';
            },
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'Message ID',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    enumProvider: commonEnumProviders.messages(),
                }),
            ],
            helpString: `
        <div>
            Create a new branch from the selected message. If no message id is provided, will use the last message.
        </div>
        <div>
            Creating a branch will automatically choose a name for the branch.<br />
            After creating the branch, the branch chat will be automatically opened.
        </div>
        <div>
            Use Checkpoints and <code>/checkpoint-create</code> instead if you do not want to jump to the new chat.
        </div>`,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'checkpoint-create',
            returns: 'Name of the new checkpoint',
            // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
            callback: async (args, text) => {
                const mesId = Number(args.mesId ?? getLastMessageId());
                if (!validateMessageId(mesId, 'Create Checkpoint')) return '';

                if (typeof text !== 'string') {
                    notyf.warning('Checkpoint name must be a string or empty', 'Create Checkpoint');
                    return '';
                }

                // @ts-expect-error TS(2322) FIXME: Type 'string' is not assignable to type 'null | un... Remove this comment to see the full error message
                const checkPointName = await createNewBookmark(mesId, { forceName: text });
                return checkPointName ?? '';
            },
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'mesId',
                    description: 'Message ID',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    enumProvider: commonEnumProviders.messages(),
                }),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'Checkpoint name',
                    typeList: [ARGUMENT_TYPE.STRING],
                }),
            ],
            helpString: `
        <div>
            Create a new checkpoint for the selected message with the provided name. If no message id is provided, will use the last message.<br />
            Leave the checkpoint name empty to auto-generate one.
        </div>
        <div>
            A created checkpoint will be permanently linked with the message.<br />
            If a checkpoint already exists, the link to it will be overwritten.<br />
            After creating the checkpoint, the checkpoint chat can be opened with the checkpoint flag,
            using the <code>/go</code> command with the checkpoint name or the <code>/checkpoint-go</code> command on the message.
        </div>
        <div>
            Use Branches and <code>/branch-create</code> instead if you do want to jump to the new chat.
        </div>
        <div>
            <strong>Example:</strong>
            <ul>
                <li>
                    <pre><code>/checkpoint-create mes={{lastCharMessage}} Checkpoint for char reply | /setvar key=rememberCheckpoint {{pipe}}</code></pre>
                    Will create a new checkpoint to the latest message of the current character, and save it as a local variable for future use.
                </li>
            </ul>
        </div>`,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'checkpoint-go',
            returns: 'Name of the checkpoint',
            // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
            callback: async (args, text) => {
                const mesId = Number(args.mesId ?? text ?? getLastMessageId());
                if (!validateMessageId(mesId, 'Open Checkpoint')) return '';

                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                const checkPointName = chat[mesId].extra?.bookmark_link;
                if (!checkPointName) {
                    notyf.warning(
                        'No checkpoint is linked to the selected message',
                        'Open Checkpoint',
                    );
                    return '';
                }

                if (selected_group) {
                    await openGroupChat(selected_group, checkPointName);
                } else {
                    await openCharacterChat(checkPointName);
                }

                return checkPointName;
            },
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'Message ID',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    enumProvider: commonEnumProviders.messages(),
                }),
            ],
            helpString: `
        <div>
            Open the checkpoint linked to the selected message. If no message id is provided, will use the last message.
        </div>
        <div>
            Use <code>/checkpoint-get</code> if you want to make sure that the selected message has a checkpoint.
        </div>`,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'checkpoint-exit',
            returns:
                'The name of the chat exited to. Returns an empty string if not in a checkpoint chat.',
            callback: async () => {
                const mainChat = await backToMainChat();
                return mainChat ?? '';
            },
            helpString:
                'Exit the checkpoint chat.<br />If not in a checkpoint chat, returns empty string.',
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'checkpoint-parent',
            returns: 'Name of the parent chat for this checkpoint',
            callback: async () => {
                const mainChatName = getMainChatName();
                return mainChatName ?? '';
            },
            helpString:
                'Get the name of the parent chat for this checkpoint.<br />If not in a checkpoint chat, returns empty string.',
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'checkpoint-get',
            returns: 'Name of the chat',
            // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
            callback: async (args, text) => {
                const mesId = Number(args.mesId ?? text ?? getLastMessageId());
                if (!validateMessageId(mesId, 'Get Checkpoint')) return '';

                // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
                const checkPointName = chat[mesId].extra?.bookmark_link;
                return checkPointName ?? '';
            },
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'Message ID',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    enumProvider: commonEnumProviders.messages(),
                }),
            ],
            helpString: `
        <div>
            Get the name of the checkpoint linked to the selected message. If no message id is provided, will use the last message.<br />
            If no checkpoint is linked, the result will be empty.
        </div>`,
        }),
    );
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'checkpoint-list',
            returns: 'JSON array of all existing checkpoints in this chat, as an array',
            /**
             * @param {{links?: string}} args @returns {Promise<string>}
             * @param _
             */
            // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
            callback: async (args, _) => {
                const useLinks = isTrueBoolean(args.links);
                const result = [];
                for (let i = 0; i < chat.length; i++) {
                    const message = chat[i];
                    if (message && message.extra && message.extra.bookmark_link) {
                        result.push(useLinks ? message.extra.bookmark_link : i);
                    }
                }
                return JSON.stringify(result);
            },
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'links',
                    description:
                        'Get a list of all links / chat names of the checkpoints, instead of the message ids',
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                    enumList: commonEnumProviders.boolean('trueFalse')(),
                    defaultValue: 'false',
                }),
            ],
            helpString: `
        <div>
            List all existing checkpoints in this chat.
        </div>
        <div>
            Returns a list of all message ids that have a checkpoint, or all checkpoint links if <code>links</code> is set to <code>true</code>.<br />
            The value will be a JSON array.
        </div>`,
        }),
    );
}

/**
 * Initializes listeners and routines for bookmarks and branches.
 */
export function initBookmarks() {
    document.getElementById('option_new_bookmark')?.addEventListener('click', saveBookmarkMenu);
    document.getElementById('option_back_to_main')?.addEventListener('click', backToMainChat);
    document
        .getElementById('option_convert_to_group')
        ?.addEventListener('click', convertSoloToGroupChat);

    document.addEventListener('click', async function (e) {
        if (!(e.target instanceof Element)) return;
        const el = e.target.closest('.select_chat_block, .mes_bookmark');
        if (!el) return;

        const mes = el.closest('.mes');
        if (e.shiftKey && mes) {
            const selectedMesId = mes.getAttribute('mesid');
            await createNewBookmark(Number(selectedMesId));
            return;
        }

        const mesElement = el.classList.contains('mes_bookmark') ? el.closest('.mes') : null;
        const fileName = mesElement
            ? mesElement.getAttribute('bookmark_link')
            : el.getAttribute('file_name');

        if (!fileName) {
            return;
        }

        const loaderHandle = loader.show({
            slug: 'chat-load',
            title: t`Chat History`,
            message: t`Loading chat…`,
            toastMode: loader.ToastMode.STATIC,
        });

        try {
            if (selected_group) {
                await openGroupChat(selected_group, fileName);
            } else {
                await openCharacterChat(fileName);
            }
        } finally {
            await loaderHandle.hide();
        }

        const shadowPopup = document.getElementById('shadow_select_chat_popup');
        if (shadowPopup) shadowPopup.style.display = 'none';
    });

    document.addEventListener('click', async function (e) {
        if (!(e.target instanceof Element)) return;
        const el = e.target.closest('.mes_create_bookmark');
        if (!el) return;
        const mesId = el.closest('.mes')?.getAttribute('mesid');
        if (mesId !== undefined && mesId !== null) {
            await createNewBookmark(Number(mesId));
        }
    });

    document.addEventListener('click', async function (e) {
        if (!(e.target instanceof Element)) return;
        const el = e.target.closest('.mes_create_branch');
        if (!el) return;
        const mesId = el.closest('.mes')?.getAttribute('mesid');
        if (mesId !== undefined && mesId !== null) {
            await branchChat(Number(mesId));
        }
    });

    registerBookmarksSlashCommands();
}
