import { Fuse } from '../lib.js';

import {
    shuffle,
    onlyUnique,
    debounce,
    delay,
    isDataURL,
    createThumbnail,
    extractAllWords,
    saveBase64AsFile,
    PAGINATION_TEMPLATE,
    getBase64Async,
    resetScrollHeight,
    initScrollHeight,
    localizePagination,
    renderPaginationDropdown,
    paginationDropdownChangeHandler,
    waitUntilCondition,
    uuidv4,
} from './utils.js';
import { RA_CountCharTokens, humanizedDateTime, dragElement, favsToHotswap, getMessageTimeStamp } from './RossAscends-mods.js';
import { power_user, loadMovingUIState, sortEntitiesList } from './power-user.js';
import { debounce_timeout } from './constants.js';

import {
    chat,
    sendSystemMessage,
    printMessages,
    substituteParams,
    characters,
    default_avatar,
    addOneMessage,
    clearChat,
    Generate,
    select_rm_info,
    setCharacterId,
    setCharacterName,
    setEditedMessageId,
    is_send_press,
    resetChatState,
    setSendButtonState,
    getCharacters,
    system_message_types,
    online_status,
    talkativeness_default,
    selectRightMenuWithAnimation,
    deleteLastMessage,
    showSwipeButtons,
    hideSwipeButtons,
    chat_metadata,
    updateChatMetadata,
    getThumbnailUrl,
    getRequestHeaders,
    setMenuType,
    menu_type,
    select_selected_character,
    cancelTtsPlay,
    displayPastChats,
    sendMessageAsUser,
    getBiasStrings,
    saveChatConditional,
    deactivateSendButtons,
    activateSendButtons,
    eventSource,
    event_types,
    getCurrentChatId,
    setCharacterSettingsOverrides,
    system_avatar,
    isChatSaving,
    setExternalAbortController,
    baseChatReplace,
    createLazyFields,
    depth_prompt_depth_default,
    loadItemizedPrompts,
    animation_duration,
    depth_prompt_role_default,
    shouldAutoContinue,
    unshallowCharacter,
    chatElement,
    ensureMessageMediaIsArray,
} from '../script.js';
import { printTagList, createTagMapFromList, applyTagsOnCharacterSelect, tag_map, applyTagsOnGroupSelect, printTagFilters, tag_filter_type } from './tags.js';
import { FILTER_TYPES, FilterHelper } from './filters.js';
import { isExternalMediaAllowed } from './chats.js';
import { POPUP_TYPE, Popup, callGenericPopup } from './popup.js';
import { t } from './i18n.js';
import { accountStorage } from './util/AccountStorage.js';
import { compressRequest } from './request-compression.js';

export {
    selected_group,
    openGroupId,
    is_group_automode_enabled,
    hideMutedSprites,
    is_group_generating,
    group_generation_id,
    groups,
    saveGroupChat,
    generateGroupWrapper,
    deleteGroup,
    getGroupAvatar,
    getGroups,
    regenerateGroup,
    resetSelectedGroup,
    select_group_chats,
    getGroupChatNames,
};

let is_group_generating = false; // Group generation flag
let is_group_automode_enabled = false;
let hideMutedSprites = false;
/** @type {Group[]} */
let groups = [];
/** @type {string|null} */
let selected_group = null;
let group_generation_id = null;
let fav_grp_checked = false;
let openGroupId = null;
let newGroupMembers = [];

export const group_activation_strategy = {
    NATURAL: 0,
    LIST: 1,
    MANUAL: 2,
    POOLED: 3,
};

export const group_generation_mode = {
    SWAP: 0,
    APPEND: 1,
    APPEND_DISABLED: 2,
};

export const DEFAULT_AUTO_MODE_DELAY = 5;

export const groupCandidatesFilter = new FilterHelper(debounce(printGroupCandidates, debounce_timeout.quick));
export const groupMembersFilter = new FilterHelper(debounce(printGroupMembers, debounce_timeout.quick));
let autoModeWorker = null;
const saveGroupDebounced = debounce(async (group, reload) => await _save(group, reload), debounce_timeout.relaxed);
/** @type {Map<string, number>} */
let groupChatQueueOrder = new Map();

/**
 *
 */
function setAutoModeWorker() {
    clearInterval(autoModeWorker);
    const autoModeDelay = groups.find(x => x.id === selected_group)?.auto_mode_delay ?? DEFAULT_AUTO_MODE_DELAY;
    autoModeWorker = setInterval(groupChatAutoModeWorker, autoModeDelay * 1000);
}

/**
 * Saves a group to the server.
 * @param {Group} group Group object to save
 * @param {boolean} reload Whether to reload characters after saving
 */
async function _save(group, reload = true) {
    await fetch('/api/groups/edit', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(group),
    });
    if (reload) {
        await getCharacters();
    }
}

// Group chats
/**
 *
 */
async function regenerateGroup() {
    const generationId = getLastMessageGenerationId();

    while (chat.length > 0) {
        const lastMes = chat[chat.length - 1];
        const this_generationId = lastMes.extra?.gen_id;

        // for new generations after the update
        if ((generationId && this_generationId) && generationId !== this_generationId) {
            break;
        } else if (lastMes.is_user || lastMes.is_system) {
            // legacy for generations before the update
            break;
        }

        await deleteLastMessage();
    }

    const abortController = new AbortController();
    setExternalAbortController(abortController);
    return generateGroupWrapper(false, 'normal', { signal: abortController.signal });
}

/**
 * Loads group chat messages from the server.
 * @param {string} chatId Chat ID
 * @returns {Promise<ChatFile>} Array of chat messages
 */
async function loadGroupChat(chatId) {
    const response = await fetch('/api/chats/group/get', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ id: chatId }),
    });

    if (response.ok) {
        const data = await response.json();
        if (!Array.isArray(data)) {
            return [];
        }
        return data;
    }

    return [];
}

/**
 * Validates a group by checking if all members exist and removing duplicates.
 * @param {Group} group Group to validate
 * @returns {Promise<void>}
 */
async function validateGroup(group) {
    if (!group) return;

    // Validate that all members exist as characters
    let dirty = false;
    group.members = group.members.filter(member => {
        const character = characters.find(x => x.avatar === member || x.name === member);
        if (!character) {
            const msg = t`Warning: Listed member ${member} does not exist as a character. It will be removed from the group.`;
            // @ts-expect-error TS(2304): Cannot find name 'toastr'.
            toastr.warning(msg, t`Group Validation`);
            console.warn(msg);
            dirty = true;
        }
        return character;
    });

    // Remove duplicate chat ids
    if (Array.isArray(group.chats)) {
        const lengthBefore = group.chats.length;
        group.chats = group.chats.filter(onlyUnique);
        const lengthAfter = group.chats.length;
        if (lengthBefore !== lengthAfter) {
            dirty = true;
        }
    }

    if (dirty) {
        await editGroup(group.id, true, false);
    }
}

/**
 * Loads the chat messages for a specific group.
 * @param {string} groupId - The ID of the group to load chat messages for.
 * @param {boolean} reload - Whether to reload the group chat after loading.
 * @returns {Promise<void>} A promise that resolves when the chat messages have been loaded.
 */
export async function getGroupChat(groupId, reload = false) {
    const group = groups.find((x) => x.id === groupId);
    if (!group) {
        console.warn('Group not found', groupId);
        return;
    }

    // Run validation before any loading
    await validateGroup(group);
    await unshallowGroupMembers(groupId);

    const chat_id = group.chat_id;
    const data = await loadGroupChat(chat_id);
    const metadata = data?.[0]?.chat_metadata ?? {};
    const freshChat = !metadata.tainted && (!Array.isArray(data) || !data.length);

    // Remove chat file header if present
    if (Array.isArray(data) && data.length && Object.hasOwn(data[0], 'chat_metadata')) {
        data.shift();
    }

    // Add integrity slug if missing
    if (!metadata.integrity) {
        metadata.integrity = uuidv4();
    }

    await loadItemizedPrompts(getCurrentChatId());

    if (group && Array.isArray(group.members) && freshChat) {
        chat.splice(0, chat.length);
        chatElement[0].querySelectorAll('.mes').forEach(el => el.remove());
        for (const member of group.members) {
            const character = characters.find(x => x.avatar === member || x.name === member);
            if (!character) {
                continue;
            }

            const mes = await getFirstCharacterMessage(character);

            // No first message
            // @ts-expect-error TS(2339): Property 'mes' does not exist on type '{}'.
            if (!(mes?.mes)) {
                continue;
            }

            chat.push(mes);
            await eventSource.emit(event_types.MESSAGE_RECEIVED, (chat.length - 1), 'first_message');
            addOneMessage(mes);
            await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, (chat.length - 1), 'first_message');
        }
        await saveGroupChat(groupId, false);
    } else if (Array.isArray(data) && data.length) {
        chat.splice(0, chat.length, ...data);
        chat.forEach(ensureMessageMediaIsArray);
        chatElement[0].querySelectorAll('.mes').forEach(el => el.remove());
        await printMessages();
    }

    updateChatMetadata(metadata, true);

    if (reload) {
        select_group_chats(groupId, true);
    }

    await eventSource.emit(event_types.CHAT_CHANGED, getCurrentChatId());
    if (freshChat) await eventSource.emit(event_types.GROUP_CHAT_CREATED);
}

/**
 * Retrieves the members of a group
 * @param {string} [groupId] - The ID of the group to retrieve members from. Defaults to the currently selected group.
 * @returns {Character[]} An array of character objects representing the members of the group. If the group is not found, an empty array is returned.
 */
export function getGroupMembers(groupId = selected_group) {
    const group = groups.find((x) => x.id === groupId);
    return group?.members.map(member => characters.find(x => x.avatar === member)) ?? [];
}

/**
 * Retrieves the member names of a group. If the group is not selected, an empty array is returned.
 * @returns {string[]} An array of character names representing the members of the group.
 */
export function getGroupNames() {
    if (!selected_group) {
        return [];
    }
    const groupMembers = groups.find(x => x.id == selected_group)?.members;
    return Array.isArray(groupMembers)
        ? groupMembers.map(x => characters.find(y => y.avatar === x)?.name).filter(x => x)
        : [];
}

/**
 * Finds the character ID for a group member.
 * @param {number|string} arg 0-based member index or character name
 * @param {boolean} full Whether to return a key-value object containing extra data
 * @returns {number | object} 0-based character ID or key-value object if full is true
 */
export function findGroupMemberId(arg, full = false) {
    arg = arg?.toString()?.trim();

    if (!arg) {
        console.warn('WARN: No argument provided for findGroupMemberId');
        return;
    }

    const group = groups.find(x => x.id == selected_group);

    if (!group || !Array.isArray(group.members)) {
        console.warn('WARN: No group found for selected group ID');
        return;
    }

    const index = parseInt(arg);
    const searchByString = isNaN(index);

    if (searchByString) {
        const memberNames = group.members.map(x => ({
            avatar: x,
            name: characters.find(y => y.avatar === x)?.name,
            index: characters.findIndex(y => y.avatar === x),
        }));
        const fuse = new Fuse(memberNames, { keys: ['avatar', 'name'] });
        const result = fuse.search(arg);

        if (!result.length) {
            console.warn(`WARN: No group member found using string ${arg}`);
            return;
        }

        const chid = result[0].item.index;

        if (chid === -1) {
            console.warn(`WARN: No character found for group member ${arg}`);
            return;
        }

        console.log(`Targeting group member ${chid} (${arg}) from search result`, result[0]);

        return !full ? chid : { ...{ id: chid }, ...result[0].item };
    } else {
        const memberAvatar = group.members[index];

        if (memberAvatar === undefined) {
            console.warn(`WARN: No group member found at index ${index}`);
            return;
        }

        const chid = characters.findIndex(x => x.avatar === memberAvatar);

        if (chid === -1) {
            console.warn(`WARN: No character found for group member ${memberAvatar} at index ${index}`);
            return;
        }

        console.log(`Targeting group member ${memberAvatar} at index ${index}`);

        return !full ? chid : {
            id: chid,
            avatar: memberAvatar,
            name: characters.find(y => y.avatar === memberAvatar)?.name,
            index: index,
        };
    }
}

/**
 * Gets depth prompts for group members.
 * @param {string} groupId Group ID
 * @param {number} characterId Current Character ID
 * @returns {{depth: number, text: string, role: string}[]} Array of depth prompts
 */
export function getGroupDepthPrompts(groupId, characterId) {
    if (!groupId) {
        return [];
    }

    console.debug('getGroupDepthPrompts entered for group: ', groupId);
    const group = groups.find(x => x.id === groupId);

    if (!group || !Array.isArray(group.members) || !group.members.length) {
        return [];
    }

    if (group.generation_mode === group_generation_mode.SWAP) {
        return [];
    }

    const depthPrompts = [];

    for (const member of group.members) {
        const index = characters.findIndex(x => x.avatar === member);
        const character = characters[index];

        if (index === -1 || !character) {
            console.debug(`Skipping missing member: ${member}`);
            continue;
        }

        if (group.disabled_members.includes(member) && characterId !== index) {
            console.debug(`Skipping disabled group member: ${member}`);
            continue;
        }

        const depthPromptText = baseChatReplace(character.data?.extensions?.depth_prompt?.prompt?.trim(), null, character.name) || '';
        const depthPromptDepth = character.data?.extensions?.depth_prompt?.depth ?? depth_prompt_depth_default;
        const depthPromptRole = character.data?.extensions?.depth_prompt?.role ?? depth_prompt_role_default;

        if (depthPromptText) {
            depthPrompts.push({ text: depthPromptText, depth: depthPromptDepth, role: depthPromptRole });
        }
    }

    return depthPrompts;
}

/**
 * Combines group members cards into a single string. Only for groups with generation mode set to APPEND or APPEND_DISABLED.
 * @param {string} groupId Group ID
 * @param {number} characterId Current Character ID
 * @returns {{description: string, personality: string, scenario: string, mesExamples: string}} Group character cards combined
 */
export function getGroupCharacterCards(groupId, characterId) {
    const lazy = getGroupCharacterCardsLazy(groupId, characterId);
    if (!lazy) return null;

    // Resolve all lazy fields into a plain object
    return {
        // @ts-expect-error TS(2339): Property 'description' does not exist on type '{}'... Remove this comment to see the full error message
        description: lazy.description,
        // @ts-expect-error TS(2339): Property 'personality' does not exist on type '{}'... Remove this comment to see the full error message
        personality: lazy.personality,
        // @ts-expect-error TS(2339): Property 'scenario' does not exist on type '{}'.
        scenario: lazy.scenario,
        // @ts-expect-error TS(2339): Property 'mesExamples' does not exist on type '{}'... Remove this comment to see the full error message
        mesExamples: lazy.mesExamples,
    };
}

/**
 * Returns group character cards with lazy evaluation.
 * Each field is only processed when first accessed.
 * @param {string} groupId Group ID
 * @param {number} characterId Current Character ID
 * @returns {{description: string, personality: string, scenario: string, mesExamples: string}} Group character cards with lazy getters
 */
export function getGroupCharacterCardsLazy(groupId, characterId) {
    const group = groups.find(x => x.id === groupId);

    // If no group cards should be generated, return null so caller knows to fall back
    if (!group || !group?.generation_mode || !Array.isArray(group.members) || !group.members.length) {
        return null;
    }

    /**
     * Runs baseChatReplace on a text, with custom <FIELDNAME> replace
     * @param {string} value Value to replace
     * @param {string} fieldName Name of the field
     * @param {string} characterName Name of the character
     * @param {boolean} trim Whether to trim the value
     * @returns {string} Replaced text
     */
    function customTransform(value, fieldName, characterName, trim) {
        if (!value) return '';
        value = value.replace(/<FIELDNAME>/gi, fieldName);
        value = trim ? value.trim() : value;
        return baseChatReplace(value, null, characterName);
    }

    /**
     * Prepares text with prefix/suffix for a character field
     * @param {string} value Value to replace
     * @param {string} characterName Name of the character
     * @param {string} fieldName Name of the field
     * @param {function(string): string} [preprocess] Preprocess function
     * @returns {string} Prepared text
     */
    function replaceAndPrepareForJoin(value, characterName, fieldName, preprocess = null) {
        value = value?.trim() ?? '';
        if (!value) return '';
        if (typeof preprocess === 'function') {
            value = preprocess(value);
        }
        const prefix = customTransform(group.generation_mode_join_prefix, fieldName, characterName, false);
        const suffix = customTransform(group.generation_mode_join_suffix, fieldName, characterName, false);
        value = customTransform(value, fieldName, characterName, true);
        return `${prefix}${value}${suffix}`;
    }

    /**
     * Collects and joins field values from all group members
     * @param {string} fieldName Display name of the field
     * @param {function(Character): string} getter Function to get field value from character
     * @param {function(string): string} [preprocess] Optional preprocess function
     * @returns {string} Combined field values
     */
    function collectField(fieldName, getter, preprocess = null) {
        const values = [];
        for (const member of group.members) {
            const index = characters.findIndex(x => x.avatar === member);
            const character = characters[index];
            if (index === -1 || !character) continue;
            if (group.disabled_members.includes(member) && characterId !== index && group.generation_mode !== group_generation_mode.APPEND_DISABLED) {
                continue;
            }
            values.push(replaceAndPrepareForJoin(getter(character), character.name, fieldName, preprocess));
        }
        return values.filter(x => x.length).join('\n');
    }

    // @ts-expect-error TS(2339): Property 'scenario' does not exist on type '{}'.
    const scenarioOverride = String(chat_metadata.scenario || '');
    // @ts-expect-error TS(2339): Property 'mes_example' does not exist on type '{}'... Remove this comment to see the full error message
    const mesExamplesOverride = String(chat_metadata.mes_example || '');

    return createLazyFields({
        description: () => collectField('Description', c => c.description),
        personality: () => collectField('Personality', c => c.personality),
        scenario: () => baseChatReplace(scenarioOverride?.trim()) || collectField('Scenario', c => c.scenario),
        mesExamples: () => baseChatReplace(mesExamplesOverride?.trim()) ||
            collectField('Example Messages', c => c.mes_example, x => !x.startsWith('<START>') ? `<START>\n${x}` : x),
    });
}

/**
 * Gets the first message for a character.
 * @param {Character} character Character object
 * @returns {Promise<ChatMessage>} First message object
 */
async function getFirstCharacterMessage(character) {
    let messageText = character.first_mes;

    // if there are alternate greetings, pick one at random
    if (Array.isArray(character.data?.alternate_greetings)) {
        const messageTexts = [character.first_mes, ...character.data.alternate_greetings].filter(x => x);
        messageText = messageTexts[Math.floor(Math.random() * messageTexts.length)];
    }

    // Allow extensions to change the first message
    const eventArgs = { input: messageText, output: '', character: character };
    await eventSource.emit(event_types.CHARACTER_FIRST_MESSAGE_SELECTED, eventArgs);
    if (eventArgs.output) {
        messageText = eventArgs.output;
    }

    const mes = {};
    // @ts-expect-error TS(2339): Property 'is_user' does not exist on type '{}'.
    mes.is_user = false;
    // @ts-expect-error TS(2339): Property 'is_system' does not exist on type '{}'.
    mes.is_system = false;
    // @ts-expect-error TS(2339): Property 'name' does not exist on type '{}'.
    mes.name = character.name;
    // @ts-expect-error TS(2339): Property 'send_date' does not exist on type '{}'.
    mes.send_date = getMessageTimeStamp();
    // @ts-expect-error TS(2339): Property 'original_avatar' does not exist on type ... Remove this comment to see the full error message
    mes.original_avatar = character.avatar;
    // @ts-expect-error TS(2339): Property 'extra' does not exist on type '{}'.
    mes.extra = { 'gen_id': Date.now() * Math.random() * 1000000 };
    // @ts-expect-error TS(2339): Property 'mes' does not exist on type '{}'.
    mes.mes = messageText
        ? substituteParams(messageText.trim(), { name2Override: character.name })
        : '';
    // @ts-expect-error TS(2339): Property 'force_avatar' does not exist on type '{}... Remove this comment to see the full error message
    mes.force_avatar =
        character.avatar != 'none'
            ? getThumbnailUrl('avatar', character.avatar)
            : default_avatar;
    return mes;
}

/**
 *
 */
function resetSelectedGroup() {
    selected_group = null;
    is_group_generating = false;
}

/**
 * Saves a group chat to the server.
 * @param {string} groupId Group ID
 * @param {boolean} shouldSaveGroup Whether to save the group after saving the chat
 * @param {boolean} force Force the saving on integrity error
 * @returns {Promise<void>} A promise that resolves when the group chat has been saved.
 */
async function saveGroupChat(groupId, shouldSaveGroup, force = false) {
    const group = groups.find(x => x.id == groupId);
    if (!group) {
        console.warn('Group not found', groupId);
        return;
    }
    const chatId = group.chat_id;
    group.date_last_chat = Date.now();
    /** @type {ChatHeader} */
    const chatHeader = {
        chat_metadata: { ...chat_metadata },
        user_name: 'unused',
        character_name: 'unused',
    };
    const saveGroupChatRequest = await compressRequest({
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ id: chatId, chat: [chatHeader, ...chat], force: force }),
    });
    const response = await fetch('/api/chats/group/save', saveGroupChatRequest);

    if (!response.ok) {
        const errorData = await response.json();
        const isIntegrityError = errorData?.error === 'integrity' && !force;
        if (!isIntegrityError) {
            // @ts-expect-error TS(2304): Cannot find name 'toastr'.
            toastr.error(t`Check the server connection and reload the page to prevent data loss.`, t`Group Chat could not be saved`);
            console.error('Group chat could not be saved', response);
            return;
        }

        const popupResult = await Popup.show.input(
            t`ERROR: Chat integrity check failed while saving the file.`,
            t`<p>After you click OK, the page will be reloaded to prevent data corruption.</p>
              <p>To confirm an overwrite (and potentially <b>LOSE YOUR DATA</b>), enter <code>OVERWRITE</code> (in all caps) in the box below before clicking OK.</p>`,
            '',
            { okButton: 'OK', cancelButton: false },
        );

        const forceSaveConfirmed = popupResult === 'OVERWRITE';

        if (!forceSaveConfirmed) {
            console.warn('Chat integrity check failed, and user did not confirm the overwrite. Reloading the page.');
            window.location.reload();
            return;
        }

        await saveGroupChat(groupId, shouldSaveGroup, true);
    }

    if (shouldSaveGroup) {
        await editGroup(groupId, false, false);
    }
}

/**
 * Renames a group member across all groups and their chats.
 * @param {string} oldAvatar Old avatar name
 * @param {string} newAvatar New avatar name
 * @param {string} newName New character name
 */
export async function renameGroupMember(oldAvatar, newAvatar, newName) {
    // Scan every group for our renamed character
    for (const group of groups) {
        try {
            // Try finding the member by old avatar link
            const memberIndex = group.members.findIndex(x => x == oldAvatar);

            // Character was not present in the group...
            if (memberIndex == -1) {
                continue;
            }

            // Replace group member avatar id and save the changes
            group.members[memberIndex] = newAvatar;
            await editGroup(group.id, true, false);
            console.log(`Renamed character ${newName} in group: ${group.name}`);

            // Load all chats from this group
            for (const chatId of group.chats) {
                const messages = await loadGroupChat(chatId);

                // Only save the chat if there were any changes to the chat content
                let hadChanges = false;
                // Chat shouldn't be empty
                if (Array.isArray(messages) && messages.length) {
                    // Iterate over every chat message
                    for (const message of messages) {
                        // Skip the chat header
                        if (Object.hasOwn(message, 'chat_metadata')) {
                            continue;
                        }

                        // Only look at character messages
                        if (message.is_user || message.is_system) {
                            continue;
                        }

                        // Message belonged to the old-named character:
                        // Update name, avatar thumbnail URL and original avatar link
                        if (message.force_avatar && message.force_avatar.indexOf(encodeURIComponent(oldAvatar)) !== -1) {
                            message.name = newName;
                            message.force_avatar = message.force_avatar.replace(encodeURIComponent(oldAvatar), encodeURIComponent(newAvatar));
                            message.original_avatar = newAvatar;
                            hadChanges = true;
                        }
                    }

                    if (hadChanges) {
                        await eventSource.emit(event_types.CHARACTER_RENAMED_IN_PAST_CHAT, messages, oldAvatar, newAvatar);

                        const saveChatRequest = await compressRequest({
                            method: 'POST',
                            headers: getRequestHeaders(),
                            body: JSON.stringify({ id: chatId, chat: [...messages] }),
                        });
                        const saveChatResponse = await fetch('/api/chats/group/save', saveChatRequest);

                        if (!saveChatResponse.ok) {
                            throw new Error('Group member could not be renamed');
                        }

                        console.log(`Renamed character ${newName} in group chat: ${chatId}`);
                    }
                }
            }
        } catch (error) {
            console.log(`An error during renaming the character ${newName} in group: ${group.name}`);
            console.error(error);
        }
    }
}

/**
 * Fetches all groups from the server and processes them.
 */
async function getGroups() {
    const response = await fetch('/api/groups/all', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
    });

    if (response.ok) {
        /** @type {Group[]} */
        const data = await response.json();
        groups = data.slice();

        // Convert groups to new format
        for (const group of groups) {
            if (typeof group.id === 'number') {
                group.id = String(group.id);
            }
            if (group.disabled_members == undefined) {
                group.disabled_members = [];
            }
            if (group.chat_id == undefined) {
                group.chat_id = group.id;
                group.chats = [group.id];
                group.members = group.members
                    .map(x => characters.find(y => y.name == x)?.avatar)
                    .filter(x => x)
                    .filter(onlyUnique);
            }
            if (typeof group.chat_id === 'number') {
                group.chat_id = String(group.chat_id);
            }
            if (Array.isArray(group.chats) && group.chats.some(x => typeof x === 'number')) {
                group.chats = group.chats.map(x => String(x));
            }
        }
    }
}

export function getGroupBlock(group) {
    let count = 0;
    const namesList = [];

    if (Array.isArray(group.members) && group.members.length) {
        for (const member of group.members) {
            const character = characters.find(x => x.avatar === member || x.name === member);
            if (character) {
                namesList.push(character.name);
                count++;
            }
        }
    }

    const template = document.querySelector('#group_list_template .group_select').cloneNode(true);
    template.dataset.id = group.id;
    template.setAttribute('data-grid', group.id);
    template.querySelector('.ch_name').textContent = group.name;
    template.querySelector('.ch_name').setAttribute('title', `[Group] ${group.name}`);
    template.querySelector('.group_fav_icon').style.display = 'none';
    template.classList.toggle('is_fav', !!group.fav);
    template.querySelector('.ch_fav').value = String(group.fav);
    template.querySelector('.group_select_counter').textContent = count + ' ' + (count != 1 ? t`characters` : t`character`);
    template.querySelector('.group_select_block_list').textContent = namesList.join(', ');

    const tagsElement = $(template.querySelector('.tags'));
    printTagList(tagsElement, { forEntityOrKey: group.id, tagOptions: { isCharacterList: true } });

    const avatar = getGroupAvatar(group);
    if (avatar) {
        template.querySelector('.avatar').replaceWith(avatar);
    }

    return template;
}

function updateGroupAvatar(group) {
    const preview = document.getElementById('group_avatar_preview');
    preview.innerHTML = '';
    preview.append(getGroupAvatar(group));

    document.querySelectorAll('.group_select').forEach(el => {
        if (el.dataset.id == group.id) {
            el.querySelector('.avatar').replaceWith(getGroupAvatar(group));
        }
    });

    favsToHotswap();
}

/**
 * Checks if a URL is a valid image URL.
 * @param {string} url URL to check
 * @returns {boolean} True if valid, false otherwise
 */
function isValidImageUrl(url) {
    // check if empty dict
    if (!url || Object.keys(url).length === 0) {
        return false;
    }
    return isDataURL(url) || (url && (url.startsWith('user') || url.startsWith('/user')));
}

function getGroupAvatar(group) {
    if (!group) {
        const div = document.createElement('div');
        div.className = 'avatar';
        div.innerHTML = `<img src="${default_avatar}">`;
        return div;
    }
    if (isValidImageUrl(group.avatar_url)) {
        const div = document.createElement('div');
        div.className = 'avatar';
        div.title = `[Group] ${group.name}`;
        div.innerHTML = `<img src="${group.avatar_url}">`;
        return div;
    }

    const memberAvatars = [];
    if (group && Array.isArray(group.members) && group.members.length) {
        for (const member of group.members) {
            const charIndex = characters.findIndex(x => x.avatar === member);
            if (charIndex !== -1 && characters[charIndex].avatar !== 'none') {
                const avatar = getThumbnailUrl('avatar', characters[charIndex].avatar);
                memberAvatars.push(avatar);
            }
            if (memberAvatars.length === 4) {
                break;
            }
        }
    }

    const avatarCount = memberAvatars.length;

    if (avatarCount >= 1 && avatarCount <= 4) {
        const groupAvatar = document.querySelector(`#group_avatars_template .collage_${avatarCount}`).cloneNode(true);
        for (let i = 0; i < avatarCount; i++) {
            groupAvatar.querySelector(`.img_${i + 1}`).setAttribute('src', memberAvatars[i]);
        }
        groupAvatar.setAttribute('title', `[Group] ${group.name}`);
        return groupAvatar;
    }

    if (avatarCount === 0) {
        const div = document.createElement('div');
        div.className = 'missing-avatar fa-solid fa-user-slash';
        return div;
    }

    const groupAvatar = document.querySelector('#group_avatars_template .collage_1').cloneNode(true);
    groupAvatar.querySelector('.img_1').setAttribute('src', group.avatar_url || system_avatar);
    groupAvatar.setAttribute('title', `[Group] ${group.name}`);
    return groupAvatar;
}

/**
 * Gets chat IDs for a group.
 * @param {string} groupId Group ID
 * @returns {string[]} Array of chat IDs
 */
function getGroupChatNames(groupId) {
    const group = groups.find(x => x.id === groupId);

    if (!group) {
        return [];
    }

    const names = [];
    for (const chatId of group.chats) {
        names.push(chatId);
    }
    return names;
}

/**
 * Generates text for the group chat by queueing members according to the activation strategy.
 * @param {boolean} byAutoMode If the generation was triggered by the auto mode.
 * @param {string?} type Generation type
 * @param {object} params Additional Generate parameters
 * @returns {Promise<string|void>} Generated text or nothing if no generation occurred
 */
async function generateGroupWrapper(byAutoMode, type = null, params = {}) {
    /**
     *
     */
    function throwIfAborted() {
        // @ts-expect-error TS(2339): Property 'signal' does not exist on type '{}'.
        if (params.signal instanceof AbortSignal && params.signal.aborted) {
            throw new Error('AbortSignal was fired. Group generation stopped');
        }
    }

    if (online_status === 'no_connection') {
        is_group_generating = false;
        setSendButtonState(false);
        return Promise.resolve();
    }

    if (is_group_generating) {
        return Promise.resolve();
    }

    // Auto-navigate back to group menu
    if (menu_type !== 'group_edit') {
        select_group_chats(selected_group, false);
        await delay(1);
    }

    /** @type {any} Caution: JS war crimes ahead */
    let textResult = '';
    const group = groups.find((x) => x.id === selected_group);

    if (!group || !Array.isArray(group.members) || !group.members.length) {
        sendSystemMessage(system_message_types.EMPTY, '', { isSmallSys: true });
        return Promise.resolve();
    }

    try {
        await unshallowGroupMembers(selected_group);

        throwIfAborted();
        hideSwipeButtons();
        is_group_generating = true;
        setCharacterName('');
        setCharacterId(undefined);
        const userInput = String(document.getElementById('send_textarea').value);

        // id of this specific batch for regeneration purposes
        group_generation_id = Date.now();
        const lastMessage = chat[chat.length - 1];
        let activationText = '';
        let isUserInput = false;

        if (userInput?.length && !byAutoMode) {
            isUserInput = true;
            activationText = userInput;
        } else {
            if (lastMessage && !lastMessage.is_system) {
                activationText = lastMessage.mes;
            }
        }

        const activationStrategy = Number(group.activation_strategy ?? group_activation_strategy.NATURAL);
        const enabledMembers = group.members.filter(x => !group.disabled_members.includes(x));
        let activatedMembers = [];

        // @ts-expect-error TS(2339): Property 'force_chid' does not exist on type '{}'.
        if (params && typeof params.force_chid == 'number') {
            // @ts-expect-error TS(2339): Property 'force_chid' does not exist on type '{}'.
            activatedMembers = [params.force_chid];
        } else if (type === 'quiet') {
            activatedMembers = activateSwipe(group.members, { allowSystem: true }).slice(0, 1);

            if (activatedMembers.length === 0) {
                activatedMembers = activateListOrder(group.members.slice(0, 1));
            }
        } else if (type === 'swipe' || type === 'continue') {
            activatedMembers = activateSwipe(group.members, { allowSystem: false });

            if (activatedMembers.length === 0) {
                // @ts-expect-error TS(2304): Cannot find name 'toastr'.
                toastr.warning(t`Deleted group member swiped. To get a reply, add them back to the group.`);
                throw new Error('Deleted group member swiped');
            }
        } else if (type === 'impersonate') {
            activatedMembers = activateImpersonate(group.members);
        } else if (activationStrategy === group_activation_strategy.NATURAL) {
            activatedMembers = activateNaturalOrder(enabledMembers, activationText, lastMessage, group.allow_self_responses, isUserInput);
        } else if (activationStrategy === group_activation_strategy.LIST) {
            activatedMembers = activateListOrder(enabledMembers);
        } else if (activationStrategy === group_activation_strategy.POOLED) {
            activatedMembers = activatePooledOrder(enabledMembers, lastMessage, isUserInput);
        } else if (activationStrategy === group_activation_strategy.MANUAL && !isUserInput) {
            activatedMembers = shuffle(enabledMembers).slice(0, 1).map(x => characters.findIndex(y => y.avatar === x)).filter(x => x !== -1);
        }

        if (activatedMembers.length === 0) {
            //toastr.warning('All group members are disabled. Enable at least one to get a reply.');

            // Send user message as is
            const bias = getBiasStrings(userInput, type);
            await sendMessageAsUser(userInput, bias.messageBias);
            await saveChatConditional();
            document.getElementById('send_textarea').value = '';
            document.getElementById('send_textarea').dispatchEvent(new Event('input', { bubbles: true }));
        }
        groupChatQueueOrder = new Map();

        if (power_user.show_group_chat_queue) {
            for (let i = 0; i < activatedMembers.length; ++i) {
                groupChatQueueOrder.set(characters[activatedMembers[i]].avatar, i + 1);
            }
        }
        await eventSource.emit(event_types.GROUP_WRAPPER_STARTED, { selected_group, type });
        // now the real generation begins: cycle through every activated character
        for (const chId of activatedMembers) {
            throwIfAborted();
            deactivateSendButtons();
            setCharacterId(chId);
            setCharacterName(characters[chId].name);
            if (power_user.show_group_chat_queue) {
                printGroupMembers();
            }
            await eventSource.emit(event_types.GROUP_MEMBER_DRAFTED, chId);

            // Wait for generation to finish
            const generateType = ['swipe', 'impersonate', 'quiet', 'continue'].includes(type) ? type : 'normal';
            textResult = await Generate(generateType, { automatic_trigger: byAutoMode, ...(params || {}) });
            // @ts-expect-error TS(2339): Property 'messageChunk' does not exist on type 'st... Remove this comment to see the full error message
            let messageChunk = textResult?.messageChunk;

            if (messageChunk) {
                while (shouldAutoContinue(messageChunk, type === 'impersonate')) {
                    textResult = await Generate('continue', { automatic_trigger: byAutoMode, ...(params || {}) });
                    // @ts-expect-error TS(2339): Property 'messageChunk' does not exist on type 'st... Remove this comment to see the full error message
                    messageChunk = textResult?.messageChunk;
                }
            }
            if (power_user.show_group_chat_queue) {
                groupChatQueueOrder.delete(characters[chId].avatar);
                groupChatQueueOrder.forEach((value, key, map) => map.set(key, value - 1));
            }
        }
    } finally {
        is_group_generating = false;
        setSendButtonState(false);
        setCharacterId(undefined);
        if (power_user.show_group_chat_queue) {
            groupChatQueueOrder = new Map();
            printGroupMembers();
        }
        setCharacterName('');
        activateSendButtons();
        showSwipeButtons();
        await eventSource.emit(event_types.GROUP_WRAPPER_FINISHED, { selected_group, type });
    }

    return Promise.resolve(textResult);
}

/**
 * Gets the generation ID of the last chat message.
 * @returns {number|null} Generation ID or null
 */
function getLastMessageGenerationId() {
    let generationId = null;
    if (chat.length > 0) {
        const lastMes = chat[chat.length - 1];
        if (!lastMes.is_user && !lastMes.is_system && lastMes.extra) {
            generationId = lastMes.extra.gen_id;
        }
    }
    return generationId;
}

/**
 * Activate group chat members for 'impersonate' generation type.
 * @param {string[]} members Array of group member avatar ids
 * @returns {number[]} Array of character ids
 */
function activateImpersonate(members) {
    const randomIndex = Math.floor(Math.random() * members.length);
    const activatedMembers = [members[randomIndex]];
    const memberIds = activatedMembers
        .map((x) => characters.findIndex((y) => y.avatar === x))
        .filter((x) => x !== -1);
    return memberIds;
}

/**
 * Activates a group member based on the last message.
 * @param {string[]} members Array of group member avatar ids
 * @param {object} [options] Options object
 * @param {boolean} [options.allowSystem] Whether to allow system messages
 * @returns {number[]} Array of character ids
 */
function activateSwipe(members, { allowSystem = false } = {}) {
    const activatedNames = [];
    const lastMessage = chat[chat.length - 1];

    if (!lastMessage) {
        return [];
    }

    if (lastMessage.is_user || (!allowSystem && lastMessage.is_system) || lastMessage.extra?.type === system_message_types.NARRATOR) {
        for (const message of chat.slice().reverse()) {
            if (message.is_user || (!allowSystem && message.is_system) || message.extra?.type === system_message_types.NARRATOR) {
                continue;
            }

            if (message.original_avatar) {
                activatedNames.push(message.original_avatar);
                break;
            }
        }

        if (activatedNames.length === 0) {
            activatedNames.push(shuffle(members.slice())[0]);
        }
    }

    // pre-update group chat swipe
    if (!lastMessage.original_avatar) {
        const matches = characters.filter(x => x.name == lastMessage.name);

        for (const match of matches) {
            if (members.includes(match.avatar)) {
                activatedNames.push(match.avatar);
                break;
            }
        }
    } else {
        activatedNames.push(lastMessage.original_avatar);
    }

    const memberIds = activatedNames
        .map((x) => characters.findIndex((y) => y.avatar === x))
        .filter((x) => x !== -1);
    return memberIds;
}

/**
 * Activate group members for the list activation order.
 * @param {string[]} members Array of group member avatar ids
 * @returns {number[]} Array of character ids
 */
function activateListOrder(members) {
    const activatedMembers = members.filter(onlyUnique);

    // map to character ids
    const memberIds = activatedMembers
        .map((x) => characters.findIndex((y) => y.avatar === x))
        .filter((x) => x !== -1);
    return memberIds;
}

/**
 * Activate group members based on the last message.
 * @param {string[]} members List of member avatars
 * @param {object} lastMessage Last message
 * @param {boolean} isUserInput Whether the user has input text
 * @returns {number[]} List of character ids
 */
function activatePooledOrder(members, lastMessage, isUserInput) {
    /** @type {string} */
    let activatedMember = null;
    /** @type {string[]} */
    const spokenSinceUser = [];

    for (const message of chat.slice().reverse()) {
        if (message.is_user || isUserInput) {
            break;
        }

        if (message.is_system || message.extra?.type === system_message_types.NARRATOR) {
            continue;
        }

        if (message.original_avatar) {
            spokenSinceUser.push(message.original_avatar);
        }
    }

    const haveNotSpoken = members.filter(x => !spokenSinceUser.includes(x));

    if (haveNotSpoken.length) {
        activatedMember = haveNotSpoken[Math.floor(Math.random() * haveNotSpoken.length)];
    }

    if (activatedMember === null) {
        const lastMessageAvatar = members.length > 1 && lastMessage && !lastMessage.is_user && lastMessage.original_avatar;
        const randomPool = lastMessageAvatar ? members.filter(x => x !== lastMessage.original_avatar) : members;
        activatedMember = randomPool[Math.floor(Math.random() * randomPool.length)];
    }

    const memberId = characters.findIndex(y => y.avatar === activatedMember);
    return memberId !== -1 ? [memberId] : [];
}

/**
 * Activate group members for the natural activation order.
 * @param {string[]} members Array of group member avatar ids
 * @param {string} input User input that triggered the generation
 * @param {ChatMessage} lastMessage Last message in the chat
 * @param {boolean} allowSelfResponses If the group allows self-responses
 * @param {boolean} isUserInput If the generation was triggered by user input
 * @returns {number[]} Array of character ids
 */
function activateNaturalOrder(members, input, lastMessage, allowSelfResponses, isUserInput) {
    let activatedMembers = [];

    // prevents the same character from speaking twice
    let bannedUser = !isUserInput && lastMessage && !lastMessage.is_user && lastMessage.name;

    // ...unless allowed to do so
    if (allowSelfResponses) {
        bannedUser = undefined;
    }

    // find mentions (excluding self)
    if (input && input.length) {
        for (const inputWord of extractAllWords(input)) {
            for (const member of members) {
                const character = characters.find(x => x.avatar === member);

                if (!character || character.name === bannedUser) {
                    continue;
                }

                if (extractAllWords(character.name).includes(inputWord)) {
                    activatedMembers.push(member);
                    break;
                }
            }
        }
    }

    const chattyMembers = [];
    // activation by talkativeness (in shuffled order, except banned)
    const shuffledMembers = shuffle([...members]);
    for (const member of shuffledMembers) {
        const character = characters.find((x) => x.avatar === member);

        if (!character || character.name === bannedUser) {
            continue;
        }

        const rollValue = Math.random();
        const talkativeness = isNaN(character.talkativeness)
            ? talkativeness_default
            : Number(character.talkativeness);
        if (talkativeness >= rollValue) {
            activatedMembers.push(member);
        }
        if (talkativeness > 0) {
            chattyMembers.push(member);
        }
    }

    // pick 1 at random if no one was activated
    let retries = 0;
    // try to limit the selected random character to those with talkativeness > 0
    const randomPool = chattyMembers.length > 0 ? chattyMembers : members;
    while (activatedMembers.length === 0 && ++retries <= randomPool.length) {
        const randomIndex = Math.floor(Math.random() * randomPool.length);
        const character = characters.find((x) => x.avatar === randomPool[randomIndex]);

        if (!character) {
            continue;
        }

        activatedMembers.push(randomPool[randomIndex]);
    }

    // de-duplicate array of character avatars
    activatedMembers = activatedMembers.filter(onlyUnique);

    // map to character ids
    const memberIds = activatedMembers
        .map((x) => characters.findIndex((y) => y.avatar === x))
        .filter((x) => x !== -1);
    return memberIds;
}

/**
 * Deletes a group from the server by ID.
 * @param {string} id Group ID to delete
 * @returns {Promise<void>} Promise that resolves when the group is deleted
 */
async function deleteGroup(id) {
    const group = groups.find((x) => x.id === id);

    const response = await fetch('/api/groups/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ id: id }),
    });

    if (group && Array.isArray(group.chats)) {
        for (const chatId of group.chats) {
            await eventSource.emit(event_types.GROUP_CHAT_DELETED, chatId);
        }
    }

    if (response.ok) {
        await clearChat();
        selected_group = null;
        delete tag_map[id];
        resetChatState();
        await printMessages();
        await getCharacters();

        select_rm_info('group_delete', id);

        document.getElementById('rm_button_selected_ch').querySelector(':scope > h2').textContent = '';
    }
}

/**
 * Edits a group by ID.
 * @param {string} id Group ID to edit
 * @param {boolean} immediately Whether to save immediately
 * @param {boolean} reload Whether to reload the groups after saving
 * @returns {Promise<void>} Promise that resolves when the group is edited
 */
export async function editGroup(id, immediately, reload = true) {
    const group = groups.find((x) => x.id === id);

    if (!group) {
        return;
    }

    if (immediately) {
        return await _save(group, reload);
    }

    saveGroupDebounced(group, reload);
}

/**
 * Unshallows all definitions of group members.
 * @param {string} groupId Id of the group
 * @returns {Promise<void>} Promise that resolves when all group members are unshallowed
 */
export async function unshallowGroupMembers(groupId) {
    const group = groups.find(x => x.id == groupId);
    if (!group) {
        return;
    }
    const members = group.members;
    if (!Array.isArray(members)) {
        return;
    }
    for (const member of members) {
        const index = characters.findIndex(x => x.avatar === member);
        if (index === -1) {
            continue;
        }
        await unshallowCharacter(String(index));
    }
}

let groupAutoModeAbortController = null;

/**
 *
 */
async function groupChatAutoModeWorker() {
    if (!is_group_automode_enabled || online_status === 'no_connection') {
        return;
    }

    if (!selected_group || is_send_press || is_group_generating) {
        return;
    }

    const group = groups.find((x) => x.id === selected_group);

    if (!group || !Array.isArray(group.members) || !group.members.length) {
        return;
    }

    groupAutoModeAbortController = new AbortController();
    await generateGroupWrapper(true, 'auto', { signal: groupAutoModeAbortController.signal });
}

async function modifyGroupMember(groupId, groupMember, isDelete) {
    const id = groupMember.dataset.id;
    const thisGroup = groups.find((x) => x.id == groupId);
    const membersArray = thisGroup?.members ?? newGroupMembers;

    if (isDelete) {
        const index = membersArray.findIndex((x) => x === id);
        if (index !== -1) {
            membersArray.splice(membersArray.indexOf(id), 1);
        }
    } else {
        membersArray.unshift(id);
    }

    if (openGroupId) {
        await unshallowGroupMembers(openGroupId);
        await editGroup(openGroupId, false, false);
        updateGroupAvatar(thisGroup);
    }

    printGroupCandidates();
    printGroupMembers();

    printTagFilters(tag_filter_type.group_candidates_list);
    printTagFilters(tag_filter_type.group_members_list);

    const groupHasMembers = getGroupCharacters({ doFilter: false, onlyMembers: true }).length > 0;
    document.getElementById('rm_group_submit').disabled = !groupHasMembers;
}

async function reorderGroupMember(groupId, groupMember, direction) {
    const id = groupMember.dataset.id;
    const thisGroup = groups.find((x) => x.id == groupId);
    const memberArray = thisGroup?.members ?? newGroupMembers;

    const indexOf = memberArray.indexOf(id);
    if (direction == 'down') {
        const next = memberArray[indexOf + 1];
        if (next) {
            memberArray[indexOf + 1] = memberArray[indexOf];
            memberArray[indexOf] = next;
        }
    }
    if (direction == 'up') {
        const prev = memberArray[indexOf - 1];
        if (prev) {
            memberArray[indexOf - 1] = memberArray[indexOf];
            memberArray[indexOf] = prev;
        }
    }

    printGroupMembers();

    if (openGroupId) {
        await editGroup(groupId, false, false);
        updateGroupAvatar(thisGroup);
    }
}

/**
 *
 * @param e
 */
async function onGroupActivationStrategyInput(e) {
    if (openGroupId) {
        const _thisGroup = groups.find((x) => x.id == openGroupId);
        _thisGroup.activation_strategy = Number(e.target.value);
        await editGroup(openGroupId, false, false);
    }
}

/**
 *
 * @param e
 */
async function onGroupGenerationModeInput(e) {
    if (openGroupId) {
        const _thisGroup = groups.find((x) => x.id == openGroupId);
        _thisGroup.generation_mode = Number(e.target.value);
        await editGroup(openGroupId, false, false);

        toggleHiddenControls(_thisGroup);
    }
}

/**
 *
 * @param e
 */
async function onGroupAutoModeDelayInput(e) {
    if (openGroupId) {
        const _thisGroup = groups.find((x) => x.id == openGroupId);
        _thisGroup.auto_mode_delay = Number(e.target.value);
        await editGroup(openGroupId, false, false);
        setAutoModeWorker();
    }
}

/**
 *
 * @param e
 */
    async function onGroupGenerationModeTemplateInput(e) {
    if (openGroupId) {
        const _thisGroup = groups.find((x) => x.id == openGroupId);
        const prop = e.target.getAttribute('setting');
        _thisGroup[prop] = String(e.target.value);
        await editGroup(openGroupId, false, false);
    }
}

/**
 *
 */
async function onGroupNameInput(event) {
    if (openGroupId) {
        const _thisGroup = groups.find((x) => x.id == openGroupId);
        _thisGroup.name = event.currentTarget.value;
        document.getElementById('rm_button_selected_ch').querySelector(':scope > h2').textContent = _thisGroup.name;
        await editGroup(openGroupId, false);
    }
}

/**
 * Checks if a character with the given avatar ID is a member of the group.
 * @param {Group} group Group object
 * @param {string} avatarId Avatar ID to check
 * @returns {boolean} True if the avatar is a member of the group, false otherwise
 */
function isGroupMember(group, avatarId) {
    if (group && Array.isArray(group.members)) {
        return group.members.includes(avatarId);
    } else {
        return newGroupMembers.includes(avatarId);
    }
}

/**
 * Gets group characters based on filters.
 * @param {object} param
 * @param {boolean} [param.doFilter] Whether to apply filters
 * @param {boolean} [param.onlyMembers] Whether to include only group members
 * @returns {Array<{item: Character, id: number, type: string}>} Array of group character objects
 */
function getGroupCharacters({ doFilter = false, onlyMembers = false } = {}) {
    /**
     *
     * @param results
     * @param filter
     * @param filterSelector
     */
    function applyFilterAndSort(results, filter, filterSelector) {
        let filtered = results;
        if (doFilter) {
            filtered = filter.applyFilters(filtered);
        }
        const filterEl = document.querySelector(filterSelector);
        const useFilterOrder = doFilter && !!(filterEl && filterEl.value);
        sortEntitiesList(filtered, useFilterOrder, filter);
        filter.clearFuzzySearchCaches();
        return filtered;
    }

    /**
     *
     * @param results
     * @param thisGroup
     */
    function handleMembers(results, thisGroup) {
        const membersArray = thisGroup?.members ?? newGroupMembers;

        // Create index map for O(1) lookups in member sort function
        // (separate from characterIndexMap which maps character objects to their array indices)
        const memberIndexMap = new Map(membersArray.map((avatar, index) => [avatar, index]));

        /**
         *
         * @param a
         * @param b
         */
        function sortMembersFn(a, b) {
            const aIndex = memberIndexMap.get(a.item.avatar) ?? -1;
            const bIndex = memberIndexMap.get(b.item.avatar) ?? -1;
            // @ts-expect-error TS(2362): The left-hand side of an arithmetic operation must... Remove this comment to see the full error message
            return aIndex - bIndex;
        }

        // Apply manual member sort before filter and sort
        let filtered = results;
        if (doFilter) {
            filtered = groupMembersFilter.applyFilters(filtered);
        }
        filtered.sort(sortMembersFn);

        const groupMembersFilterEl = document.getElementById('rm_group_members_filter');
        const useFilterOrder = doFilter && !!(groupMembersFilterEl && groupMembersFilterEl.value);
        if (useFilterOrder) {
            sortEntitiesList(filtered, useFilterOrder, groupMembersFilter);
        }
        groupMembersFilter.clearFuzzySearchCaches();
        return filtered;
    }

    const thisGroup = openGroupId && groups.find((x) => x.id == openGroupId);

    // Create index map for O(1) lookups when mapping characters to their array indices
    // (separate from memberIndexMap used later for sorting members by their group order)
    const characterIndexMap = new Map(characters.map((char, index) => [char, index]));

    const results = characters
        .filter((x) => isGroupMember(thisGroup, x.avatar) == onlyMembers)
        .map((x) => ({ item: x, id: characterIndexMap.get(x), type: 'character' }));

    // Early return for candidates (non-members)
    if (!onlyMembers) {
        return applyFilterAndSort(results, groupCandidatesFilter, '#rm_group_filter');
    }

    // Handle members with manual sort capability
    return handleMembers(results, thisGroup);
}

/**
 *
 */
function printGroupCandidates() {
    const storageKey = 'GroupCandidates_PerPage';
    const pageSize = Number(accountStorage.getItem(storageKey)) || 5;
    const sizeChangerOptions = [5, 10, 25, 50, 100, 200, 500, 1000];
    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#rm_group_add_members_pagination').pagination({
        dataSource: getGroupCharacters({ doFilter: true, onlyMembers: false }),
        pageRange: 1,
        position: 'top',
        showPageNumbers: false,
        prevText: '<',
        nextText: '>',
        formatNavigator: PAGINATION_TEMPLATE,
        formatSizeChanger: renderPaginationDropdown(pageSize, sizeChangerOptions),
        showNavigator: true,
        showSizeChanger: true,
        pageSize,
        afterSizeSelectorChange: function (e, size) {
            accountStorage.setItem(storageKey, e.target.value);
            paginationDropdownChangeHandler(e, size);
        },
            callback: function (data) {
                document.getElementById('rm_group_add_members').innerHTML = '';
                for (const i of data) {
                    document.getElementById('rm_group_add_members').append(getGroupCharacterBlock(i.item));
                }
                localizePagination($('#rm_group_add_members_pagination'));
            },
    });
}

/**
 *
 */
function printGroupMembers() {
    const storageKey = 'GroupMembers_PerPage';
    for (const el of document.querySelectorAll('.rm_group_members_pagination')) {
        const that = el;
        const pageSize = Number(accountStorage.getItem(storageKey)) || 5;
        const sizeChangerOptions = [5, 10, 25, 50, 100, 200, 500, 1000];
        $(el).pagination({
            dataSource: getGroupCharacters({ doFilter: true, onlyMembers: true }),
            pageRange: 1,
            position: 'top',
            showPageNumbers: false,
            prevText: '<',
            nextText: '>',
            formatNavigator: PAGINATION_TEMPLATE,
            showNavigator: true,
            showSizeChanger: true,
            formatSizeChanger: renderPaginationDropdown(pageSize, sizeChangerOptions),
            pageSize,
            afterSizeSelectorChange: function (e, size) {
                accountStorage.setItem(storageKey, e.target.value);
                paginationDropdownChangeHandler(e, size);
            },
            callback: function (data) {
                document.querySelectorAll('.rm_group_members').forEach(el => el.innerHTML = '');
                for (const i of data) {
                    document.querySelectorAll('.rm_group_members').forEach(el => el.append(getGroupCharacterBlock(i.item)));
                }
                // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                localizePagination($(that));
            },
        });
    }
}

function getGroupCharacterBlock(character) {
    const avatar = getThumbnailUrl('avatar', character.avatar);
    const template = document.querySelector('#group_member_template .group_member').cloneNode(true);
    const isFav = !!character.fav || character.fav == 'true';
    template.dataset.id = character.avatar;
    template.querySelector('.avatar img').setAttribute('src', avatar);
    template.querySelector('.avatar img').setAttribute('title', character.avatar);
    template.querySelector('.ch_name').textContent = character.name;
    template.setAttribute('data-chid', characters.indexOf(character));
    template.querySelector('.ch_fav').value = String(isFav);
    template.classList.toggle('is_fav', isFav);

    const auxFieldName = power_user.aux_field || 'character_version';
    const auxFieldValue = (character.data && character.data[auxFieldName]) || '';
    if (auxFieldValue) {
        template.querySelector('.character_version').textContent = auxFieldValue;
    } else {
        template.querySelector('.character_version').style.display = 'none';
    }

    const queuePosition = groupChatQueueOrder.get(character.avatar);
    if (queuePosition) {
        template.querySelector('.queue_position').textContent = queuePosition;
        template.classList.toggle('is_queued', queuePosition > 1);
        template.classList.toggle('is_active', queuePosition === 1);
    }

    template.classList.toggle('disabled', isGroupMemberDisabled(character.avatar));

    const tagsElement = $(template.querySelector('.tags'));
    printTagList(tagsElement, { forEntityOrKey: characters.indexOf(character), tagOptions: { isCharacterList: true } });

    if (!openGroupId) {
        template.querySelector('[data-action="speak"]').style.display = 'none';
        template.querySelector('[data-action="enable"]').style.display = 'none';
        template.querySelector('[data-action="disable"]').style.display = 'none';
    }

    return template;
}

/**
 * Checks if a group member is disabled.
 * @param {string} avatarId Avatar ID of the group member
 * @returns {boolean} True if the group member is disabled, false otherwise
 */
function isGroupMemberDisabled(avatarId) {
    const thisGroup = openGroupId && groups.find((x) => x.id == openGroupId);
    return Boolean(thisGroup && thisGroup.disabled_members.includes(avatarId));
}

/**
 *
 */
async function onDeleteGroupClick() {
    if (!openGroupId) {
        // @ts-expect-error TS(2304): Cannot find name 'toastr'.
        toastr.warning(t`Currently no group selected.`);
        return;
    }
    if (is_group_generating) {
        // @ts-expect-error TS(2304): Cannot find name 'toastr'.
        toastr.warning(t`Not so fast! Wait for the characters to stop typing before deleting the group.`);
        return;
    }

    const confirm = await Popup.show.confirm(t`Delete the group?`, '<p>' + t`This will also delete all your chats with that group. If you want to delete a single conversation, select a "View past chats" option in the lower left menu.` + '</p>');
    if (confirm) {
        deleteGroup(openGroupId);
    }
}

/**
 *
 */
async function onFavoriteGroupClick() {
    updateFavButtonState(!fav_grp_checked);
    if (openGroupId) {
        const _thisGroup = groups.find((x) => x.id == openGroupId);
        _thisGroup.fav = fav_grp_checked;
        await editGroup(openGroupId, false, false);
        favsToHotswap();
    }
}

/**
 *
 */
async function onGroupSelfResponsesClick(event) {
    if (openGroupId) {
        const _thisGroup = groups.find((x) => x.id == openGroupId);
        const value = event.currentTarget.checked;
        _thisGroup.allow_self_responses = value;
        await editGroup(openGroupId, false, false);
    }
}

/**
 *
 * @param value
 */
async function onHideMutedSpritesClick(value) {
    if (openGroupId) {
        const _thisGroup = groups.find((x) => x.id == openGroupId);
        _thisGroup.hideMutedSprites = value;
        console.log(`_thisGroup.hideMutedSprites = ${_thisGroup.hideMutedSprites}`);
        await editGroup(openGroupId, false, false);
        await eventSource.emit(event_types.GROUP_UPDATED);
    }
}

function toggleHiddenControls(group, generationMode = null) {
    const isJoin = [group_generation_mode.APPEND, group_generation_mode.APPEND_DISABLED].includes(generationMode ?? group?.generation_mode);
    document.getElementById('rm_group_generation_mode_join_prefix').parentElement.style.display = isJoin ? '' : 'none';
    document.getElementById('rm_group_generation_mode_join_suffix').parentElement.style.display = isJoin ? '' : 'none';

    if (!CSS.supports('field-sizing', 'content')) {
        initScrollHeight(document.getElementById('rm_group_generation_mode_join_prefix'));
        initScrollHeight(document.getElementById('rm_group_generation_mode_join_suffix'));
    }
}

/**
 * Opens a group creation/editing right menu.
 * @param {string|null} groupId ID of the group to select or null if creating a new group
 * @param {boolean} skipAnimation If true, skips the animation when selecting the group
 */
function select_group_chats(groupId, skipAnimation) {
    openGroupId = groupId;
    newGroupMembers = [];
    const group = openGroupId && groups.find((x) => x.id == openGroupId);
    const groupName = group?.name ?? '';
    const replyStrategy = Number(group?.activation_strategy ?? group_activation_strategy.NATURAL);
    const generationMode = Number(group?.generation_mode ?? group_generation_mode.SWAP);

    setMenuType(group ? 'group_edit' : 'group_create');
    const preview = document.getElementById('group_avatar_preview');
    preview.innerHTML = '';
    preview.append(getGroupAvatar(group));
    document.getElementById('rm_group_restore_avatar').style.display = (!!group && isValidImageUrl(group.avatar_url)) ? '' : 'none';
    document.getElementById('rm_group_filter').value = '';
    document.getElementById('rm_group_filter').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('rm_group_members_filter').value = '';
    document.getElementById('rm_group_members_filter').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('rm_group_activation_strategy').value = replyStrategy;
    const _strategyOption = document.querySelector(`#rm_group_activation_strategy option[value="${replyStrategy}"]`);
    if (_strategyOption instanceof HTMLOptionElement) _strategyOption.selected = true;
    document.getElementById('rm_group_generation_mode').value = generationMode;
    const _genModeOption = document.querySelector(`#rm_group_generation_mode option[value="${generationMode}"]`);
    if (_genModeOption instanceof HTMLOptionElement) _genModeOption.selected = true;
    document.getElementById('rm_group_chat_name').value = groupName;

    if (!skipAnimation) {
        selectRightMenuWithAnimation('rm_group_chats_block');
    }

    // render tags
    applyTagsOnGroupSelect(groupId);

    // render characters list
    printGroupCandidates();
    printGroupMembers();

    const groupHasMembers = !!document.querySelector('#rm_group_members')?.children.length;
    document.getElementById('rm_group_submit').disabled = !groupHasMembers;
    document.getElementById('rm_group_allow_self_responses').checked = !!(group && group.allow_self_responses);
    document.getElementById('rm_group_hidemutedsprites').checked = !!(group && group.hideMutedSprites);
    document.getElementById('rm_group_automode_delay').value = String(group?.auto_mode_delay ?? DEFAULT_AUTO_MODE_DELAY);

    const _joinPrefix = document.getElementById('rm_group_generation_mode_join_prefix');
    _joinPrefix.value = group?.generation_mode_join_prefix ?? '';
    _joinPrefix.setAttribute('setting', 'generation_mode_join_prefix');
    const _joinSuffix = document.getElementById('rm_group_generation_mode_join_suffix');
    _joinSuffix.value = group?.generation_mode_join_suffix ?? '';
    _joinSuffix.setAttribute('setting', 'generation_mode_join_suffix');
    toggleHiddenControls(group, generationMode);

    // bottom buttons
    if (openGroupId) {
        document.getElementById('rm_group_submit').style.display = 'none';
        document.getElementById('rm_group_delete').style.display = '';
        document.getElementById('rm_group_scenario').style.display = '';
        const lorebookBtn = document.querySelector('#group-metadata-controls .chat_lorebook_button');
        lorebookBtn.classList.remove('disabled');
        lorebookBtn.disabled = false;
        document.getElementById('group_open_media_overrides').style.display = '';
        const isMediaAllowed = isExternalMediaAllowed();
        document.getElementById('group_media_allowed_icon').style.display = isMediaAllowed ? '' : 'none';
        document.getElementById('group_media_forbidden_icon').style.display = !isMediaAllowed ? '' : 'none';
    } else {
        document.getElementById('rm_group_submit').style.display = '';
        const drawerContent = document.querySelector('#groupAddMemberListToggle .inline-drawer-content');
        if (drawerContent && window.getComputedStyle(drawerContent).display !== 'block') {
            document.querySelector('#groupAddMemberListToggle .inline-drawer-toggle').click();
        }
        document.getElementById('rm_group_delete').style.display = 'none';
        document.getElementById('rm_group_scenario').style.display = 'none';
        const lorebookBtn = document.querySelector('#group-metadata-controls .chat_lorebook_button');
        lorebookBtn.classList.add('disabled');
        lorebookBtn.disabled = true;
        document.getElementById('group_open_media_overrides').style.display = 'none';
    }

    updateFavButtonState(group?.fav ?? false);
    setAutoModeWorker();

    // top bar
    if (group) {
        document.getElementById('rm_group_automode_label').style.display = '';
        document.getElementById('rm_button_selected_ch').querySelector(':scope > h2').textContent = groupName;
    } else {
        document.getElementById('rm_group_automode_label').style.display = 'none';
    }

    // Toggle textbox sizes, as input events have not fired here
    if (!CSS.supports('field-sizing', 'content')) {
        document.querySelectorAll('#rm_group_chats_block .autoSetHeight').forEach(element => {
            resetScrollHeight(element);
        });
    }

    hideMutedSprites = group?.hideMutedSprites ?? false;
    document.getElementById('rm_group_hidemutedsprites').checked = hideMutedSprites;

    eventSource.emit('groupSelected', { detail: { id: openGroupId, group: group } });
}

/**
 * Handles the upload and processing of a group avatar.
 * The selected image is read, cropped using a popup, processed into a thumbnail,
 * and then uploaded to the server.
 * @param {Event} event - The event triggered by selecting a file input, containing the image file to upload.
 * @returns {Promise<void>} - A promise that resolves when the processing and upload is complete.
 */
async function uploadGroupAvatar(event) {
    if (!(event.target instanceof HTMLInputElement) || !event.target.files.length) {
        return;
    }

    const file = event.target.files[0];

    if (!file) {
        return;
    }

    const result = await getBase64Async(file);

    document.getElementById('dialogue_popup').classList.add('large_dialogue_popup', 'wide_dialogue_popup');

    const croppedImage = await callGenericPopup('Set the crop position of the avatar image', POPUP_TYPE.CROP, '', { cropImage: result });

    if (!croppedImage) {
        return;
    }

    let thumbnail = await createThumbnail(String(croppedImage), 200, 300);
    //remove data:image/whatever;base64
    // @ts-expect-error TS(2339): Property 'replace' does not exist on type 'unknown... Remove this comment to see the full error message
    thumbnail = thumbnail.replace(/^data:image\/[a-z]+;base64,/, '');
    const _thisGroup = groups.find((x) => x.id == openGroupId);
    // filename should be group id + human readable timestamp
    const filename = _thisGroup ? `${_thisGroup.id}_${humanizedDateTime()}` : humanizedDateTime();
    const thumbnailUrl = await saveBase64AsFile(thumbnail, String(openGroupId ?? ''), filename, 'jpg');
    if (!openGroupId) {
        const _avatarPreviewImg = document.querySelector('#group_avatar_preview img');
        if (_avatarPreviewImg) _avatarPreviewImg.setAttribute('src', thumbnailUrl);
        document.getElementById('rm_group_restore_avatar').style.display = '';
        return;
    }

    _thisGroup.avatar_url = thumbnailUrl;
    const _preview = document.getElementById('group_avatar_preview');
    _preview.innerHTML = '';
    _preview.append(getGroupAvatar(_thisGroup));
    document.getElementById('rm_group_restore_avatar').style.display = '';
    await editGroup(openGroupId, true, true);
}

/**
 *
 */
async function restoreGroupAvatar() {
    const confirm = await Popup.show.confirm('Are you sure you want to restore the group avatar?', 'Your custom image will be deleted, and a collage will be used instead.');
    if (!confirm) {
        return;
    }

    if (!openGroupId) {
        const _restoreImg = document.querySelector('#group_avatar_preview img');
        if (_restoreImg) _restoreImg.setAttribute('src', default_avatar);
        document.getElementById('rm_group_restore_avatar').style.display = 'none';
        return;
    }

    const _thisGroup = groups.find((x) => x.id == openGroupId);
    _thisGroup.avatar_url = '';
    const _previewRestore = document.getElementById('group_avatar_preview');
    _previewRestore.innerHTML = '';
    _previewRestore.append(getGroupAvatar(_thisGroup));
    document.getElementById('rm_group_restore_avatar').style.display = 'none';
    await editGroup(openGroupId, true, true);
}

/**
 *
 * @param event
 */
async function onGroupActionClick(event) {
    const target = event.target.closest('.group_member .right_menu_button');
    if (!target) return;
    event.stopPropagation();
    const action = target.getAttribute('data-action');
    const member = target.closest('.group_member');

    if (action === 'remove') {
        await modifyGroupMember(openGroupId, member, true);
    }

    if (action === 'add') {
        await modifyGroupMember(openGroupId, member, false);
    }

    if (action === 'enable') {
        member.classList.remove('disabled');
        const _thisGroup = groups.find(x => x.id === openGroupId);
        const index = _thisGroup.disabled_members.indexOf(member.dataset.id);
        if (index !== -1) {
            _thisGroup.disabled_members.splice(index, 1);
            await editGroup(openGroupId, false, false);
        }
    }

    if (action === 'disable') {
        member.classList.add('disabled');
        const _thisGroup = groups.find(x => x.id === openGroupId);
        if (!_thisGroup.disabled_members.includes(member.dataset.id)) {
            _thisGroup.disabled_members.push(member.dataset.id);
            await editGroup(openGroupId, false, false);
        }
    }

    if (action === 'up' || action === 'down') {
        await reorderGroupMember(openGroupId, member, action);
    }

    if (action === 'view') {
        await openCharacterDefinition(member);
    }

    if (action === 'speak') {
        const chid = Number(member.getAttribute('data-chid'));
        if (Number.isInteger(chid)) {
            Generate('normal', { force_chid: chid });
        }
    }

    await eventSource.emit(event_types.GROUP_UPDATED);
}

function updateFavButtonState(state) {
    fav_grp_checked = state;
    document.getElementById('rm_group_fav').value = String(fav_grp_checked);
    document.getElementById('group_favorite_button').classList.toggle('fav_on', fav_grp_checked);
    document.getElementById('group_favorite_button').classList.toggle('fav_off', !fav_grp_checked);
}

/**
 * Opens a group chat by its ID and updates the UI accordingly.
 * @param {string} groupId ID of the group to open
 * @returns {Promise<boolean>} Whether the group was opened
 */
export async function openGroupById(groupId) {
    if (isChatSaving) {
        // @ts-expect-error TS(2304): Cannot find name 'toastr'.
        toastr.info(t`Please wait until the chat is saved before switching characters.`, t`Your chat is still saving...`);
        return false;
    }

    if (!groups.find(x => x.id === groupId)) {
        console.log('Group not found', groupId);
        return false;
    }

    if (!is_send_press && !is_group_generating) {
        select_group_chats(groupId, false);

        if (selected_group !== groupId) {
            groupChatQueueOrder = new Map();
            setCharacterId(undefined);
            setCharacterName('');
            resetSelectedGroup();
            await clearChat({ clearData: true });
            cancelTtsPlay();
            selected_group = groupId;
            setEditedMessageId(undefined);
            updateChatMetadata({}, true);
            await getGroupChat(groupId);
            return true;
        }
    }

    return false;
}

async function openCharacterDefinition(characterSelect) {
    if (is_group_generating) {
        // @ts-expect-error TS(2304): Cannot find name 'toastr'.
        toastr.warning(t`Can't peek a character while group reply is being generated`);
        console.warn('Can\'t peek a character def while group reply is being generated');
        return;
    }

    const chid = characterSelect.getAttribute('data-chid');

    if (chid === null || chid === undefined) {
        return;
    }

    await unshallowCharacter(chid);
    setCharacterId(chid);
    select_selected_character(chid);
    RA_CountCharTokens();
    applyTagsOnCharacterSelect(chid);
}

function filterGroupMembers(event) {
    const searchValue = String(event.currentTarget.value).toLowerCase();
    groupCandidatesFilter.setFilterData(FILTER_TYPES.SEARCH, searchValue);
}

function filterGroupMemberList(event) {
    const searchValue = String(event.currentTarget.value).toLowerCase();
    groupMembersFilter.setFilterData(FILTER_TYPES.SEARCH, searchValue);
}

/**
 *
 */
async function createGroup() {
    let name = String(document.getElementById('rm_group_chat_name').value);
    const allowSelfResponses = !!document.getElementById('rm_group_allow_self_responses').checked;
    const activationStrategy = Number(document.querySelector('#rm_group_activation_strategy :checked')?.value) ?? group_activation_strategy.NATURAL;
    const generationMode = Number(document.querySelector('#rm_group_generation_mode :checked')?.value) ?? group_generation_mode.SWAP;
    const autoModeDelay = Number(document.getElementById('rm_group_automode_delay').value) ?? DEFAULT_AUTO_MODE_DELAY;
    const members = newGroupMembers;
    const memberNames = characters.filter(x => members.includes(x.avatar)).map(x => x.name).join(', ');

    if (!name) {
        name = t`Group: ${memberNames}`;
    }

    const avatarUrl = document.querySelector('#group_avatar_preview img')?.getAttribute('src');
    const chatName = humanizedDateTime();
    const chats = [chatName];

    /** @type {Omit<Group, 'id'>} */
    const groupCreateModel = {
        name: name,
        members: members,
        avatar_url: isValidImageUrl(avatarUrl) ? avatarUrl : default_avatar,
        allow_self_responses: allowSelfResponses,
        hideMutedSprites: hideMutedSprites,
        activation_strategy: activationStrategy,
        generation_mode: generationMode,
        disabled_members: [],
        fav: fav_grp_checked,
        chat_id: chatName,
        chats: chats,
        auto_mode_delay: autoModeDelay,
    };

    const createGroupResponse = await fetch('/api/groups/create', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(groupCreateModel),
    });

    if (createGroupResponse.ok) {
        newGroupMembers = [];
        const data = await createGroupResponse.json();
        createTagMapFromList('#groupTagList', data.id);
        await getCharacters();
        select_rm_info('group_create', data.id);
    }
}

/**
 * Creates a new group chat within the specified group.
 * @param {string} groupId Group ID
 * @returns {Promise<void>} Promise that resolves when the new group chat is created
 */
export async function createNewGroupChat(groupId) {
    const group = groups.find(x => x.id === groupId);

    if (!group) {
        return;
    }

    await clearChat({ clearData: true });
    const newChatName = humanizedDateTime();
    group.chats.push(newChatName);
    group.chat_id = newChatName;
    updateChatMetadata({}, true);

    await editGroup(group.id, true, false);
    await getGroupChat(group.id);
}

/**
 * Retrieves past chats for a specified group.
 * @param {string} groupId Group ID
 * @returns {Promise<Array<import('../../src/endpoints/chats.js').ChatInfo>>} Array of past chats
 */
export async function getGroupPastChats(groupId) {
    const group = groups.find(x => x.id === groupId);

    if (!group) {
        return [];
    }

    const chats = [];

    try {
        for (const chatId of group.chats) {
            const response = await fetch('/api/chats/group/info', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ id: chatId }),
            });
            if (response.ok) {
                const data = await response.json();
                chats.push(data);
            }
        }
    } catch (err) {
        console.error(err);
    }
    return chats;
}

/**
 * Opens a specific group chat for the specified group by its ID.
 * @param {string} groupId Group ID
 * @param {string} chatId Chat ID
 * @returns {Promise<void>}
 */
export async function openGroupChat(groupId, chatId) {
    await waitUntilCondition(() => !isChatSaving, debounce_timeout.extended, 10);
    const group = groups.find(x => x.id === groupId);

    if (!group || !group.chats.includes(chatId)) {
        return;
    }

    await clearChat({ clearData: true });
    group.chat_id = chatId;
    group.date_last_chat = Date.now();
    updateChatMetadata({}, true);

    await editGroup(groupId, true, false);
    await getGroupChat(groupId);
}

/**
 * Renames a group chat within the specified group.
 * @param {string} groupId Group ID
 * @param {string} oldChatId Old chat ID
 * @param {string} newChatId New chat ID
 * @returns {Promise<void>} Promise that resolves when the group chat is renamed
 */
export async function renameGroupChat(groupId, oldChatId, newChatId) {
    const group = groups.find(x => x.id === groupId);

    if (!group || !group.chats.includes(oldChatId)) {
        return;
    }

    if (group.chat_id === oldChatId) {
        group.chat_id = newChatId;
    }

    group.chats.splice(group.chats.indexOf(oldChatId), 1);
    group.chats.push(newChatId);

    await editGroup(groupId, true, true);
}

/**
 * Deletes a group chat by its name. Doesn't affect displayed chat.
 * @param {string} groupId Group ID
 * @param {string} chatName Name of the chat to delete
 * @returns {Promise<void>}
 */
export async function deleteGroupChatByName(groupId, chatName) {
    const group = groups.find(x => x.id === groupId);
    if (!group || !group.chats.includes(chatName)) {
        return;
    }

    group.chats.splice(group.chats.indexOf(chatName), 1);

    const response = await fetch('/api/chats/group/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ id: chatName }),
    });

    if (!response.ok) {
        // @ts-expect-error TS(2304): Cannot find name 'toastr'.
        toastr.error(t`Check the server connection and reload the page to prevent data loss.`, t`Group chat could not be deleted`);
        console.error('Group chat could not be deleted');
        return;
    }

    // If the deleted chat was the current chat, switch to the last chat in the group
    if (group.chat_id === chatName) {
        const newChatName = group.chats.length ? group.chats[group.chats.length - 1] : humanizedDateTime();
        group.chat_id = newChatName;
    }

    await editGroup(groupId, true, true);
    await eventSource.emit(event_types.GROUP_CHAT_DELETED, chatName);
}

/**
 * Deletes a group chat by name.
 * @param {string} groupId The ID of the group containing the chat to delete.
 * @param {string} chatId The id/name of the chat to delete.
 * @param {object} [options] Options for the deletion.
 * @param {boolean} [options.jumpToNewChat] Whether to jump to a new chat after deletion (existing one, or create a new one if none exists)
 */
export async function deleteGroupChat(groupId, chatId, { jumpToNewChat = true } = {}) {
    const group = groups.find(x => x.id === groupId);

    if (!group || !group.chats.includes(chatId)) {
        return;
    }

    group.chats.splice(group.chats.indexOf(chatId), 1);

    if (group.chat_id === chatId) {
        group.chat_id = '';
        updateChatMetadata({}, true);
    }

    const response = await fetch('/api/chats/group/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ id: chatId }),
    });

    if (response.ok) {
        if (jumpToNewChat) {
            if (group.chats.length) {
                await openGroupChat(groupId, group.chats[group.chats.length - 1]);
            } else {
                await createNewGroupChat(groupId);
            }
        }

        await eventSource.emit(event_types.GROUP_CHAT_DELETED, chatId);
    }
}

/**
 * Imports a group chat from a file and adds it to the group.
 * @param {FormData} formData Form data to send to the server
 * @param {object} [options] Options for the import
 * @param {boolean} [options.refresh] Whether to refresh the group chat list after import
 * @returns {Promise<string[]>} List of imported file names
 */
export async function importGroupChat(formData, { refresh = true } = {}) {
    const fetchResult = await fetch('/api/chats/group/import', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
        body: formData,
        cache: 'no-cache',
    });

    if (fetchResult.ok) {
        const data = await fetchResult.json();
        if (data.res) {
            const chatId = data.res;
            const group = groups.find(x => x.id == selected_group);

            if (group) {
                group.chats.push(chatId);
                await editGroup(selected_group, true, true);
                if (refresh) {
                    await displayPastChats();
                }
            }

            return [data.res];
        }

        return data?.fileNames || [];
    }

    return [];
}

/**
 * Saves the current group chat as a bookmark chat.
 * @param {string} groupId Group ID
 * @param {string} name Name of the chat to save
 * @param {ChatMetadata?} metadata New metadata to save with the chat
 * @param {number|undefined} mesId Optional message ID to trim the chat up to
 * @param {ChatMessage[]|undefined} chatData Optional chat snapshot to save instead of the current in-memory chat
 * @returns {Promise<void>} Promise that resolves when the group chat is saved
 */
export async function saveGroupBookmarkChat(groupId, name, metadata, mesId, chatData = undefined) {
    const group = groups.find(x => x.id === groupId);

    if (!group) {
        return;
    }

    group.chats.push(name);

    /** @type {ChatHeader} */
    const chatHeader = {
        chat_metadata: { ...chat_metadata, ...(metadata || {}) },
        user_name: 'unused',
        character_name: 'unused',
    };

    /** @type {ChatMessage[]} */
    const trimmedChat = Array.isArray(chatData)
        ? chatData
        : (mesId !== undefined && mesId >= 0 && mesId < chat.length)
            ? chat.slice(0, Number(mesId) + 1)
            : chat;

    await editGroup(groupId, true, false);

    const saveChatRequest = await compressRequest({
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ id: name, chat: [chatHeader, ...trimmedChat] }),
    });
    const response = await fetch('/api/chats/group/save', saveChatRequest);

    if (!response.ok) {
        // @ts-expect-error TS(2304): Cannot find name 'toastr'.
        toastr.error(t`Check the server connection and reload the page to prevent data loss.`, t`Group chat could not be saved`);
        console.error('Group chat could not be saved', response);
    }
}

/**
 *
 */
function onSendTextareaInput() {
    if (is_group_automode_enabled) {
        // Wait for current automode generation to finish
        is_group_automode_enabled = false;
            document.getElementById('rm_group_automode').checked = false;
    }
}

/**
 *
 */
function stopAutoModeGeneration() {
    if (groupAutoModeAbortController) {
        groupAutoModeAbortController.abort();
    }

    is_group_automode_enabled = false;
    document.getElementById('rm_group_automode').checked = false;
}

/**
 *
 */
function doCurMemberListPopout(event) {
    //repurposes the zoomed avatar template to server as a floating group member list
    if (!document.getElementById('groupMemberListPopout')) {
        console.debug('did not see popout yet, creating');
        const memberListClone = event.currentTarget.parentElement?.parentElement?.querySelector('.inline-drawer-content')?.innerHTML ?? '';
        const templateElement = document.getElementById('zoomed_avatar_template');
        let newElement = null;
        if (templateElement instanceof HTMLTemplateElement) {
            newElement = templateElement.content.firstElementChild?.cloneNode(true);
        } else if (templateElement) {
            newElement = templateElement.firstElementChild?.cloneNode(true);
        }
        if (!(newElement instanceof HTMLElement)) {
            console.error('Zoomed avatar template is empty');
            return;
        }
        const controlBarHtml = `<div class="panelControlBar flex-container">
        <div id="groupMemberListPopoutheader" class="fa-solid fa-grip drag-grabber hoverglow"></div>
        <div id="groupMemberListPopoutClose" class="fa-solid fa-circle-xmark hoverglow"></div>
    </div>`;

        newElement.setAttribute('id', 'groupMemberListPopout');
        newElement.classList.remove('zoomed_avatar');
        newElement.classList.add('draggable');
        newElement.innerHTML = '';
        newElement.insertAdjacentHTML('beforeend', controlBarHtml);
        newElement.insertAdjacentHTML('beforeend', memberListClone);

        // Remove pagination from popout
        const paginationEl = newElement.querySelector('.group_pagination');
        if (paginationEl) paginationEl.innerHTML = '';

        document.getElementById('movingDivs')?.appendChild(newElement);
        loadMovingUIState();

        if (animation_duration > 0) {
            newElement.style.opacity = '0';
            newElement.style.transition = `opacity ${animation_duration}ms ease`;
            newElement.offsetHeight;
            newElement.style.opacity = '1';
        }

        dragElement(newElement);
        const closeBtn = document.getElementById('groupMemberListPopoutClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', function () {
                if (animation_duration > 0) {
                    newElement.style.transition = `opacity ${animation_duration}ms ease`;
                    newElement.style.opacity = '0';
                    setTimeout(() => {
                        newElement.remove();
                    }, animation_duration);
                } else {
                    newElement.remove();
                }
            });
        }

        // Re-add pagination not working in popout
        printGroupMembers();
    } else {
        console.debug('saw existing popout, removing');
        const popout = document.getElementById('groupMemberListPopout');
        if (popout) {
            if (animation_duration > 0) {
                popout.style.transition = `opacity ${animation_duration}ms ease`;
                popout.style.opacity = '0';
                setTimeout(() => popout.remove(), animation_duration);
            } else {
                popout.remove();
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (!CSS.supports('field-sizing', 'content')) {
        document.addEventListener('input', function (e) {
            const target = e.target.closest('#rm_group_chats_block .autoSetHeight');
            if (target) resetScrollHeight(target);
        });
    }

    document.addEventListener('click', function (e) {
        const target = e.target.closest('.group_select');
        if (target) {
            const groupId = target.dataset.chid || target.dataset.grid;
            openGroupById(groupId);
        }
    });
    document.getElementById('rm_group_filter').addEventListener('input', filterGroupMembers);
    document.getElementById('rm_group_members_filter').addEventListener('input', filterGroupMemberList);
    document.getElementById('rm_group_submit').addEventListener('click', createGroup);
    document.getElementById('rm_group_scenario').addEventListener('click', setCharacterSettingsOverrides);
    document.getElementById('rm_group_automode').addEventListener('input', function (e) {
        const value = e.currentTarget.checked;
        is_group_automode_enabled = value;
        eventSource.once(event_types.GENERATION_STOPPED, stopAutoModeGeneration);
    });
    document.getElementById('rm_group_hidemutedsprites').addEventListener('input', function (e) {
        const value = e.currentTarget.checked;
        hideMutedSprites = value;
        onHideMutedSpritesClick(value);
    });
    document.getElementById('send_textarea').addEventListener('keyup', onSendTextareaInput);
    document.getElementById('groupCurrentMemberPopoutButton').addEventListener('click', doCurMemberListPopout);
    document.getElementById('rm_group_chat_name').addEventListener('input', onGroupNameInput);
    document.getElementById('rm_group_delete').addEventListener('click', onDeleteGroupClick);
    document.getElementById('group_favorite_button').addEventListener('click', onFavoriteGroupClick);
    document.getElementById('rm_group_allow_self_responses').addEventListener('input', onGroupSelfResponsesClick);
    document.getElementById('rm_group_activation_strategy').addEventListener('change', onGroupActivationStrategyInput);
    document.getElementById('rm_group_generation_mode').addEventListener('change', onGroupGenerationModeInput);
    document.getElementById('rm_group_automode_delay').addEventListener('input', onGroupAutoModeDelayInput);
    document.getElementById('rm_group_generation_mode_join_prefix').addEventListener('input', onGroupGenerationModeTemplateInput);
    document.getElementById('rm_group_generation_mode_join_suffix').addEventListener('input', onGroupGenerationModeTemplateInput);
    document.getElementById('group_avatar_button').addEventListener('input', uploadGroupAvatar);
    document.getElementById('rm_group_restore_avatar').addEventListener('click', restoreGroupAvatar);
    document.addEventListener('click', onGroupActionClick);
});
