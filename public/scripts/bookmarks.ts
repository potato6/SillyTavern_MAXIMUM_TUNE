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
    // @ts-expect-error TS(7034) FIXME: Variable 'groups' implicitly has type 'any[]' in s... Remove this comment to see the full error message
    groups,
    openGroupById,
    openGroupChat,
    saveGroupBookmarkChat,
    // @ts-expect-error TS(7034) FIXME: Variable 'selected_group' implicitly has type 'any... Remove this comment to see the full error message
    selected_group,
} from './group-chats.js';
import { loader } from './action-loader.js';
import { getLastMessageId } from './macros.js';
import { Popup } from './popup.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from './slash-commands/SlashCommandArgument.js';
import { commonEnumProviders } from './slash-commands/SlashCommandCommonEnumsProvider.js';
import { SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import { createTagMapFromList } from './tags.js';
import { renderTemplateAsync } from './templates.js';
import { compressRequest } from './request-compression.js';
import { t } from './i18n.js';

import {
    getUniqueName,
    isTrueBoolean,
} from './utils.js';

const bookmarkNameToken = 'Checkpoint #';

/**
 * Gets the names of existing chats for the current character or group.
 * @returns {Promise<string[]>} - Returns a promise that resolves to an array of existing chat names.
 */
async function getExistingChatNames() {
    // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
    if (selected_group) {
        // @ts-expect-error TS(7005) FIXME: Variable 'groups' implicitly has an 'any[]' type.
        const group = groups.find(x => x.id == selected_group);
        if (group && Array.isArray(group.chats)) {
            return [...group.chats];
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
        // @ts-expect-error TS(2339) FIXME: Property 'avatar' does not exist on type 'never'.
        body: JSON.stringify({ avatar_url: character.avatar, simple: true }),
    });

    if (response.ok) {
        const data = await response.json();
        // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
        const chats = Object.values(data).map(x => x.file_name.replace('.jsonl', ''));
        return [...chats];
    }

    return [];
}

/**
 *
 * @param root0
 * @param root0.isReplace
 * @param root0.forceName
 */
async function getBookmarkName({ isReplace = false, forceName = null } = {}) {
    const mainChatName = (getCurrentChatDetails()).sessionName;

    /**
     *
     * @param name
     * @param i
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
    function buildCheckpointName(name, i) {
        // Strip off existing suffixes, then build new name
        let cleanName = name.replace(new RegExp(` - ${bookmarkNameToken}\\d+$`), '');
        // Strip off legacy old name prefix too
        cleanName = cleanName.replace(new RegExp(`^${bookmarkNameToken}\\d+ - `), '');
        return `${cleanName} - ${bookmarkNameToken}${i}`;
    }
    const existingChats = await getExistingChatNames();
    // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
    const suggestedName = getUniqueName(mainChatName, (x) => existingChats.includes(x), { nameBuilder: buildCheckpointName });

    const body = await renderTemplateAsync('createCheckpoint', { isReplace: isReplace, suggestedName: suggestedName });
    let name = forceName ?? (await Popup.show.input('Create Checkpoint', body, suggestedName));
    // Special handling for confirmed empty input (=> auto-generate name)
    if (name === '') {
        name = suggestedName;
    }
    if (!name) {
        return null;
    }

    return name;
}

/**
 *
 */
function getMainChatName() {
    if (chat_metadata) {
        // @ts-expect-error TS(2339) FIXME: Property 'main_chat' does not exist on type '{}'.
        if (chat_metadata.main_chat) {
            // @ts-expect-error TS(2339) FIXME: Property 'main_chat' does not exist on type '{}'.
            return chat_metadata.main_chat;
        // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
        } else if (selected_group) {
            // groups didn't support bookmarks before chat metadata was introduced
            return null;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        } else if (characters[this_chid].chat && characters[this_chid].chat.includes(bookmarkNameToken)) {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            const tokenIndex = characters[this_chid].chat.lastIndexOf(bookmarkNameToken);
            // @ts-expect-error TS(2339) FIXME: Property 'main_chat' does not exist on type '{}'.
            chat_metadata.main_chat = characters[this_chid].chat.substring(0, tokenIndex).trim();
            // @ts-expect-error TS(2339) FIXME: Property 'main_chat' does not exist on type '{}'.
            return chat_metadata.main_chat;
        }
    }
    return null;
}

/**
 *
 */
export function showBookmarksButtons() {
    try {
        // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
        if (selected_group) {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#option_convert_to_group').hide();
        } else {
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#option_convert_to_group').show();
        }

        // @ts-expect-error TS(2339) FIXME: Property 'main_chat' does not exist on type '{}'.
        if (chat_metadata.main_chat) {
            // In bookmark chat
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#option_back_to_main').show();
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#option_new_bookmark').show();
        // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
        } else if (!selected_group && !characters[this_chid].chat) {
            // No chat recorded on character
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#option_back_to_main').hide();
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#option_new_bookmark').hide();
        } else {
            // In main chat
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#option_back_to_main').hide();
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $('#option_new_bookmark').show();
        }
    } catch {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#option_back_to_main').hide();
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#option_new_bookmark').hide();
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#option_convert_to_group').hide();
    }
}

/**
 *
 */
async function saveBookmarkMenu() {
    if (!chat.length) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning('The chat is empty.', 'Checkpoint creation failed');
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
// @ts-expect-error TS(7006) FIXME: Parameter 'mesId' implicitly has an 'any' type.
function getBranchChatSnapshot(mesId, { swipeId = null } = {}) {
    const snapshot = structuredClone(chat.slice(0, Number(mesId) + 1));

    if (swipeId === null) {
        return snapshot;
    }

    if (!syncSwipeToMes(null, swipeId, snapshot[mesId])) {
        return null;
    }

    return snapshot;
}

// Export is used by Timelines extension. Do not remove.
/**
 *
 * @param mesId
 * @param root0
 * @param root0.swipeId
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'mesId' implicitly has an 'any' type.
export async function createBranch(mesId, { swipeId = null } = {}) {
    if (!chat.length) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning('The chat is empty.', 'Branch creation failed');
        return;
    }

    if (mesId < 0 || mesId >= chat.length) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning('Invalid message ID.', 'Branch creation failed');
        return;
    }

    const lastMes = chat[mesId];
    const mainChatName = (getCurrentChatDetails()).sessionName;
    const newMetadata = { main_chat: mainChatName };
    const selectedSwipeId = swipeId === null ? null : Number(swipeId);

    // @ts-expect-error TS(2339) FIXME: Property 'swipes' does not exist on type 'never'.
    if (selectedSwipeId !== null && (!Number.isInteger(selectedSwipeId) || selectedSwipeId < 0 || selectedSwipeId >= (lastMes?.swipes?.length ?? 0))) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning('Invalid swipe ID.', 'Branch creation failed');
        return;
    }

    /**
     *
     * @param name
     * @param i
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
    function buildBranchName(name, i) {
        // Strip off existing suffixes, then build new name
        let cleanName = name.replace(/ - Branch #\d+$/, '');
        // Strip off legacy old name prefix too
        cleanName = cleanName.replace(/^Branch #\d+ - /, '');
        return `${cleanName} - Branch #${i}`;
    }
    const existingChats = await getExistingChatNames();
    // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
    const name = getUniqueName(mainChatName, (x) => existingChats.includes(x), { nameBuilder: buildBranchName });
    if (!name) {
        console.error('Could not generate a unique branch name.');
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error('Could not generate a unique branch name.', 'Branch creation failed');
        return;
    }

    // @ts-expect-error TS(2322) FIXME: Type 'number | null' is not assignable to type 'nu... Remove this comment to see the full error message
    const branchChatSnapshot = getBranchChatSnapshot(mesId, { swipeId: selectedSwipeId });
    if (!branchChatSnapshot) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning('Could not prepare the selected swipe for branching.', 'Branch creation failed');
        return;
    }

    // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
    if (selected_group) {
        // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
        await saveGroupBookmarkChat(selected_group, name, newMetadata, mesId, branchChatSnapshot);
    } else {
        await saveChat({ chatName: name, withMetadata: newMetadata, mesId, chatData: branchChatSnapshot });
    }
    // append to branches list if it exists
    // otherwise create it
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    if (typeof lastMes.extra !== 'object') {
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMes.extra = {};
    }
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    if (typeof lastMes.extra.branches !== 'object') {
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMes.extra.branches = [];
    }
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
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
    // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
    if (this_chid === undefined && !selected_group) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info('No character selected.', 'Create Checkpoint');
        return null;
    }
    if (!chat.length) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning('The chat is empty.', 'Create Checkpoint');
        return null;
    }
    if (!chat[mesId]) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.warning('Invalid message ID.', 'Create Checkpoint');
        return null;
    }

    const lastMes = chat[mesId];

    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    if (typeof lastMes.extra !== 'object') {
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        lastMes.extra = {};
    }

    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    const isReplace = lastMes.extra.bookmark_link;

    const name = await getBookmarkName({ isReplace: isReplace, forceName: forceName });
    if (!name) {
        return null;
    }

    // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
    const mainChat = selected_group ? groups?.find(x => x.id == selected_group)?.chat_id : characters[this_chid].chat;
    const newMetadata = { main_chat: mainChat };
    await saveItemizedPrompts(name);

    // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
    if (selected_group) {
        // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
        await saveGroupBookmarkChat(selected_group, name, newMetadata, mesId);
    } else {
        await saveChat({ chatName: name, withMetadata: newMetadata, mesId });
    }

    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    lastMes.extra.bookmark_link = name;

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    const mes = $(`.mes[mesid="${mesId}"]`);
    // @ts-expect-error TS(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
    updateBookmarkDisplay(mes, name);

    await saveChatConditional();
    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
    toastr.success('Click the flag icon next to the message to open the checkpoint chat.', 'Create Checkpoint', { timeOut: 10000 });
    return name;
}


/**
 * Updates the display of the bookmark on a chat message.
 * @param {JQuery<HTMLElement>} mes - The message element
 * @param {string?} [newBookmarkLink] - The new bookmark link (optional)
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'mes' implicitly has an 'any' type.
export function updateBookmarkDisplay(mes, newBookmarkLink = null) {
        if (newBookmarkLink) mes.attr('bookmark_link', newBookmarkLink);
    const bookmarkFlag = mes.find('.mes_bookmark');
    bookmarkFlag.attr('title', `Checkpoint\n${mes.attr('bookmark_link')}\n\n${bookmarkFlag.data('tooltip')}`);
}

/**
 *
 */
async function backToMainChat() {
    const mainChatName = getMainChatName();
    const allChats = await getExistingChatNames();

    if (allChats.includes(mainChatName)) {
        // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
        if (selected_group) {
            // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
            await openGroupChat(selected_group, mainChatName);
        } else {
            await openCharacterChat(mainChatName);
        }
        return mainChatName;
    }

    return null;
}

/**
 *
 */
export async function convertSoloToGroupChat() {
    // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
    if (selected_group) {
        console.log('Already in group. No need for conversion');
        return;
    }

    if (this_chid === undefined) {
        console.log('Need to have a character selected');
        return;
    }

    const confirm = await Popup.show.confirm(t`Convert to group chat`, t`Are you sure you want to convert this chat to a group chat?` + '<br />' + t`This cannot be reverted.`);
    if (!confirm) {
        return;
    }

    const character = characters[this_chid];

    // Populate group required fields
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    const name = getUniqueName(`Group: ${character.name}`, y => groups.findIndex(x => x.name === y) !== -1);
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    const avatar = getThumbnailUrl('avatar', character.avatar);
    const chatName = humanizedDateTime();
    const chats = [chatName];
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    const members = [character.avatar];
    // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
    const favChecked = character.fav || character.fav == 'true';
    /** @type {ChatMetadata} */
    const metadata = Object.assign({}, chat_metadata);
    // @ts-expect-error TS(2339) FIXME: Property 'main_chat' does not exist on type '{}'.
    delete metadata.main_chat;
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

    // Convert tags list and assign to group
    createTagMapFromList('#tagList', group.id);

    // Update chars list
    await getCharacters();

    // Convert chat to group format
    const groupChat = [...chat].map(m => structuredClone(m));
    const genIdFirst = Date.now();

    for (let index = 0; index < groupChat.length; index++) {
        const message = groupChat[index];

        // Skip messages we don't care about
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        if (message.is_user || message.is_system || message.extra?.type === system_message_types.NARRATOR || message.force_avatar !== undefined) {
            continue;
        }

        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        if (!message.extra || typeof message.extra !== 'object') {
            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            message.extra = {};
        }

        // Set force fields for solo character
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        message.name = character.name;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        message.original_avatar = character.avatar;
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        message.force_avatar = getThumbnailUrl('avatar', character.avatar);
        // Allow regens of a single message in group
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        message.extra.gen_id = genIdFirst + index;
    }

    // Save group chat
    const createChatRequest = await compressRequest({
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ id: chatName, chat: [chatHeader, ...groupChat] }),
    });
    const createChatResponse = await fetch('/api/chats/group/save', createChatRequest);

    if (!createChatResponse.ok) {
        console.error('Group chat creation unsuccessful');
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.error('Group chat creation unsuccessful');
        return;
    }

    // Click on the freshly selected group to open it
    setActiveGroup(group.id);
    await openGroupById(group.id);

    // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
    toastr.success(t`The chat has been successfully converted!`);
}

/**
 * Creates a new branch from the message with the given ID
 * @param {number} mesId Message ID
 * @param {{swipeId?: number|null}} [options] Branch options
 * @returns {Promise<string?>} Branch file name
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'mesId' implicitly has an 'any' type.
export async function branchChat(mesId, { swipeId = null } = {}) {
    // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
    if (this_chid === undefined && !selected_group) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info('No character selected.', 'Create Branch');
        return null;
    }

    const fileName = await createBranch(mesId, { swipeId });
    if (!fileName) {
        return null;
    }

    await saveItemizedPrompts(fileName);

    // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
    if (selected_group) {
        // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
        await openGroupChat(selected_group, fileName);
    } else {
        await openCharacterChat(fileName);
    }

    return fileName;
}

/**
 *
 */
function registerBookmarksSlashCommands() {
    /**
     * Validates a message ID. (Is a number, exists as a message)
     * @param {number} mesId - The message ID to validate.
     * @param {string} context - The context of the slash command. Will be used as the title of any toasts.
     * @returns {boolean} - Returns true if the message ID is valid, otherwise false.
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'mesId' implicitly has an 'any' type.
    function validateMessageId(mesId, context) {
        if (isNaN(mesId)) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.warning('Invalid message ID was provided', context);
            return false;
        }
        if (!chat[mesId]) {
            // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
            toastr.warning(`Message for id ${mesId} not found`, context);
            return false;
        }
        return true;
    }

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
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
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'checkpoint-create',
        returns: 'Name of the new checkpoint',
        // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
        callback: async (args, text) => {
            const mesId = Number(args.mesId ?? getLastMessageId());
            if (!validateMessageId(mesId, 'Create Checkpoint')) return '';

            if (typeof text !== 'string') {
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.warning('Checkpoint name must be a string or empty', 'Create Checkpoint');
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
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'checkpoint-go',
        returns: 'Name of the checkpoint',
        // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
        callback: async (args, text) => {
            const mesId = Number(args.mesId ?? text ?? getLastMessageId());
            if (!validateMessageId(mesId, 'Open Checkpoint')) return '';

            // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
            const checkPointName = chat[mesId].extra?.bookmark_link;
            if (!checkPointName) {
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.warning('No checkpoint is linked to the selected message', 'Open Checkpoint');
                return '';
            }

            // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
            if (selected_group) {
                // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
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
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'checkpoint-exit',
        returns: 'The name of the chat exited to. Returns an empty string if not in a checkpoint chat.',
        callback: async () => {
            const mainChat = await backToMainChat();
            return mainChat ?? '';
        },
        helpString: 'Exit the checkpoint chat.<br />If not in a checkpoint chat, returns empty string.',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'checkpoint-parent',
        returns: 'Name of the parent chat for this checkpoint',
        callback: async () => {
            const mainChatName = getMainChatName();
            return mainChatName ?? '';
        },
        helpString: 'Get the name of the parent chat for this checkpoint.<br />If not in a checkpoint chat, returns empty string.',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
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
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'checkpoint-list',
        returns: 'JSON array of all existing checkpoints in this chat, as an array',
        /**
         * @param {{links?: string}} args @returns {Promise<string>}
         * @param _
         */
        // @ts-expect-error TS(7006) FIXME: Parameter 'args' implicitly has an 'any' type.
        callback: async (args, _) => {
            const result = Object.entries(chat)
                // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
                .filter(([_, message]) => message.extra?.bookmark_link)
                // @ts-expect-error TS(2339) FIXME: Property 'extra' does not exist on type 'never'.
                .map(([mesId, message]) => isTrueBoolean(args.links) ? message.extra.bookmark_link : Number(mesId));
            return JSON.stringify(result);
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'links',
                description: 'Get a list of all links / chat names of the checkpoints, instead of the message ids',
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
    }));
}

/**
 *
 */
export function initBookmarks() {
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#option_new_bookmark').on('click', saveBookmarkMenu);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#option_back_to_main').on('click', backToMainChat);
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#option_convert_to_group').on('click', convertSoloToGroupChat);

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.select_chat_block, .mes_bookmark', async function (e) {
        // If shift is held down, we are not following the bookmark, but creating a new one
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const mes = this.closest('.mes');
        if (e.shiftKey && mes) {
            const selectedMesId = mes.getAttribute('mesid');
            await createNewBookmark(Number(selectedMesId));
            return;
        }

        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const fileName = this.classList.contains('mes_bookmark')
            // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
            ? this.closest('.mes').getAttribute('bookmark_link')
            // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
            : this.getAttribute('file_name');

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
            // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
            if (selected_group) {
                // @ts-expect-error TS(7005) FIXME: Variable 'selected_group' implicitly has an 'any' ... Remove this comment to see the full error message
                await openGroupChat(selected_group, fileName);
            } else {
                await openCharacterChat(fileName);
            }
        } finally {
            await loaderHandle.hide();
        }

        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $('#shadow_select_chat_popup').css('display', 'none');
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.mes_create_bookmark', async function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const mesId = this.closest('.mes').getAttribute('mesid');
        if (mesId !== undefined) {
            await createNewBookmark(Number(mesId));
        }
    });

    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.mes_create_branch', async function () {
        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const mesId = this.closest('.mes').getAttribute('mesid');
        if (mesId !== undefined) {
            await branchChat(Number(mesId));
        }
    });

    registerBookmarksSlashCommands();
}
