import {
    buildAvatarList,
    characterToEntity,
    characters,
    chat,
    chat_metadata,
    createOrEditCharacter,
    default_user_avatar,
    eventSource,
    event_types,
    getCurrentChatId,
    getRequestHeaders,
    getThumbnailUrl,
    groupToEntity,
    menu_type,
    name1,
    name2,
    reloadCurrentChat,
    saveChatConditional,
    saveMetadata,
    saveSettingsDebounced,
    setUserName,
    this_chid,
} from '../script.js';
import { power_user } from './power-user.js';
import { getTokenCountAsync } from './tokenizers.js';
import {
    createPaginator,
    clearInfoBlock,
    debounce,
    delay,
    download,
    ensureImageFormatSupported,
    flashHighlight,
    getBase64Async,
    getCharIndex,
    isFalseBoolean,
    isTrueBoolean,
    onlyUnique,
    parseJsonFile,
    setInfoBlock,
    paginationDropdownChangeHandler,
    addLongPressEvent,
    stringToRange,
    sortIgnoreCaseAndAccents,
    equalsIgnoreCaseAndAccents,
    uuidv4,
    resolveAvatarData,
    findPersona,
    escapeHtml,
} from './utils.js';
import { debounce_timeout } from './constants.js';
import { FILTER_TYPES, FilterHelper } from './filters.js';
import { groups, selected_group } from './group-chats.js';
import { POPUP_RESULT, POPUP_TYPE, Popup, callGenericPopup } from './popup.js';
import { t } from './i18n.js';
import { openWorldInfoEditor, world_names } from './world-info.js';
import { renderTemplateAsync } from './templates.js';
import { saveMetadataDebounced } from './extensions.js';
import { accountStorage } from './util/AccountStorage.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import { SlashCommandNamedArgument, ARGUMENT_TYPE, SlashCommandArgument } from './slash-commands/SlashCommandArgument.js';
import { commonEnumMatchProviders, commonEnumProviders, enumIcons } from './slash-commands/SlashCommandCommonEnumsProvider.js';
import { SlashCommandEnumValue, enumTypes } from './slash-commands/SlashCommandEnumValue.js';
import { SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import { isFirefox } from './browser-fixes.js';
import { slashCommandReturnHelper } from './slash-commands/SlashCommandReturnHelper.js';

interface PersonaConnection {
    type: 'character' | 'group';
    id: string;
}

interface PersonaState {
    avatarId: string;
    default: boolean;
    locked: {
        chat: boolean;
        character: boolean;
    };
}

export const persona_description_positions = {
    IN_PROMPT: 0,
    /**
     * @deprecated Use persona_description_positions.IN_PROMPT instead.
     */
    AFTER_CHAR: 1,
    TOP_AN: 2,
    BOTTOM_AN: 3,
    AT_DEPTH: 4,
    NONE: 9,
};

const USER_AVATAR_PATH = 'User Avatars/';

const savePersonasPage = 0;
let personaPaginator: ReturnType<typeof createPaginator> | undefined;
const GRID_STORAGE_KEY = 'Personas_GridView';
const DEFAULT_DEPTH = 2;
const DEFAULT_ROLE = 0;

/** @type {string} The currently selected persona (identified by its avatar) */
export let user_avatar = '';

/** @type {FilterHelper} Filter helper for the persona list */
export const personasFilter = new FilterHelper(debounce(getUserAvatars, debounce_timeout.quick));

/** @type {string} The last loaded chat id to remember for persona loading */
let personaLastLoadedChatId: string | null = null;

/** @type {function(string): void} */
let navigateToAvatar: (...args: unknown[]) => void = () => { };

/**
 * Checks if the Persona Management panel is currently open
 * @returns {boolean}
 */
export function isPersonaPanelOpen() {
    return document.querySelector('#persona-management-button .drawer-content')?.classList.contains('openDrawer') ?? false;
}

/**
 *
 */
function switchPersonaGridView() {
    const state = accountStorage.getItem(GRID_STORAGE_KEY) === 'true';
    document.getElementById('user_avatar_block')!.classList.toggle('gridView', state);
}

/**
 * Returns the URL of the avatar for the given user avatar Id.
 * @param {string} avatarImg User avatar Id
 * @returns {string} User avatar URL
 */
export function getUserAvatar(avatarImg: string) {
    return `${USER_AVATAR_PATH}${avatarImg}`;
}

/**
 *
 * @param avatar
 */
export function initUserAvatar(avatar: string) {
    user_avatar = avatar;
    reloadUserAvatar();
    updatePersonaUIStates();
}

/**
 * Sets a user avatar file
 * @param {string} imgfile Link to an image file
 * @param {object} [options] Optional settings
 * @param {boolean} [options.toastPersonaNameChange] Whether to show a toast when the persona name is changed
 * @param {boolean} [options.navigateToCurrent] Whether to navigate to the current persona after setting the avatar
 */
export async function setUserAvatar(imgfile: string, { toastPersonaNameChange = true, navigateToCurrent = false }: { toastPersonaNameChange?: boolean; navigateToCurrent?: boolean } = {}) {
    const currentUserAvatar = user_avatar;
    user_avatar = imgfile && typeof imgfile === 'string' ? imgfile : (document.querySelector('[data-avatar-id]') as HTMLElement)?.dataset.avatarId ?? '';
    if (currentUserAvatar === user_avatar) {
        return;
    }
    reloadUserAvatar();
    updatePersonaUIStates({ navigateToCurrent: navigateToCurrent });
    selectCurrentPersona({ toastPersonaNameChange: toastPersonaNameChange });
    await retriggerFirstMessageOnEmptyChat();
    saveSettingsDebounced();
    document.querySelector('.zoomed_avatar[forchar]')?.remove();
    await eventSource.emit(event_types.PERSONA_CHANGED, user_avatar);
}

/**
 *
 * @param force
 */
function reloadUserAvatar(force = false) {
    document.querySelectorAll('.mes').forEach(el => {
        const avatarImg = el.querySelector('.avatar img') as HTMLImageElement | null;
        if (!avatarImg) return;
        if (force) {
            avatarImg.setAttribute('src', avatarImg.getAttribute('src') ?? '');
        }

        if (el.getAttribute('is_user') == 'true' && el.getAttribute('force_avatar') == 'false') {
            avatarImg.setAttribute('src', getThumbnailUrl('persona', user_avatar));
        }
    });
}

/**
 * Sort the given personas
 * @param {string[]} personas - The persona names to sort
 * @returns {string[]} The sorted persona names array, same reference as passed in
 */
function sortPersonas(personas: string[]) {
    const option = document.querySelector('#persona_sort_order option:checked') as HTMLOptionElement | null;
    if (!option) return personas;
    if (option.getAttribute('value') === 'search') {
        personas.sort((a: string, b: string) => {
            const aScore = personasFilter.getScore(FILTER_TYPES.PERSONA_SEARCH, a);
            const bScore = personasFilter.getScore(FILTER_TYPES.PERSONA_SEARCH, b);
            return (aScore - bScore);
        });
    } else {
        personas.sort((a: string, b: string) => {
            const personasMap = power_user.personas as Record<string, string | undefined>;
            const aName = String(personasMap[a] || a);
            const bName = String(personasMap[b] || b);
            return power_user.persona_sort_order === 'asc' ? aName.localeCompare(bName) : bName.localeCompare(aName);
        });
    }

    return personas;
}

/** Checks the state of the current search, and adds/removes the search sorting option accordingly */
function verifyPersonaSearchSortRule() {
    const searchTerm = personasFilter.getFilterData(FILTER_TYPES.PERSONA_SEARCH);
    const searchOption = document.querySelector('#persona_sort_order option[value="search"]') as HTMLOptionElement | null;
    const selector = document.getElementById('persona_sort_order') as HTMLSelectElement | null;
    if (!searchOption || !selector) return;
    const isHidden = searchOption.getAttribute('hidden') !== undefined;

    // If we have a search term, we are displaying the sorting option for it
    if (searchTerm && isHidden) {
        searchOption.removeAttribute('hidden');
        selector.value = searchOption.value;
        flashHighlight(selector);
    }
    // If search got cleared, we make sure to hide the option and go back to the one before
    if (!searchTerm) {
        searchOption.setAttribute('hidden', '');
        selector.value = power_user.persona_sort_order;
    }
}

/**
 * Gets a rendered avatar block.
 * @param {string} avatarId Avatar file name
 * @returns {JQuery<HTMLElement>} Avatar block
 */
function getUserAvatarBlock(avatarId: string): HTMLElement {
    const template = document.querySelector('#user_avatar_template .avatar-container')!.cloneNode(true) as HTMLElement;
    const templateEl = template;
    const personasMap = power_user.personas as Record<string, string | undefined>;
    const personaDescsMap = power_user.persona_descriptions as Record<string, Record<string, unknown> | undefined>;
    const personaName = personasMap[avatarId];
    const personaDescription = personaDescsMap[avatarId]?.description as string | undefined;
    const personaTitle = personaDescsMap[avatarId]?.title as string | undefined;

    (templateEl.querySelector('.ch_name') as HTMLElement).textContent = personaName || '[Unnamed Persona]';
    (templateEl.querySelector('.ch_description') as HTMLElement).textContent = personaDescription || document.getElementById('user_avatar_block')?.getAttribute('no_desc_text') || 'No description';
    (templateEl.querySelector('.ch_description') as HTMLElement).classList.toggle('text_muted', !personaDescription);
    (templateEl.querySelector('.ch_additional_info') as HTMLElement).textContent = personaTitle || '';
    template.setAttribute('data-avatar-id', avatarId);
    (templateEl.querySelector('.avatar') as HTMLElement)?.setAttribute('data-avatar-id', avatarId);
    (templateEl.querySelector('.avatar') as HTMLElement)?.setAttribute('title', avatarId);
    template.classList.toggle('default_persona', avatarId === power_user.default_persona);
    const avatarUrl = getThumbnailUrl('persona', avatarId, isFirefox());
    (templateEl.querySelector('img') as HTMLImageElement).setAttribute('src', avatarUrl);

    // Make sure description block has at least three rows. Otherwise height looks inconsistent. I don't have a better idea for this.
    const currentText = (templateEl.querySelector('.ch_description') as HTMLElement).textContent ?? '';
    if (currentText.split('\n').length < 3) {
        (templateEl.querySelector('.ch_description') as HTMLElement).textContent = currentText + '\n\xa0\n\xa0';
    }

    document.getElementById('user_avatar_block')!.append(template);
    return template;
}

/**
 * Initialize missing personas in the power user settings.
 * @param {string[]} avatarsList List of avatar file names
 * @returns {Promise<void>}
 */
async function addMissingPersonas(avatarsList: string[]) {
    const personasMap = power_user.personas as Record<string, string | undefined>;
    for (const persona of avatarsList) {
        if (!personasMap[persona]) {
            await initPersona(persona, '[Unnamed Persona]', '', '', { silent: true });
        }
    }
}

/**
 * Gets a list of user avatars.
 * @param {boolean} doRender Whether to render the list
 * @param {string} openPageAt Item to be opened at
 * @returns {Promise<string[]>} List of avatar file names
 */
export async function getUserAvatars(doRender = true, openPageAt = '') {
    const response = await fetch('/api/avatars/get', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
    });
    if (response.ok) {
        const allEntities = await response.json();

        if (!Array.isArray(allEntities)) {
            return [];
        }

        if (!doRender) {
            return allEntities;
        }

        // If any persona is missing from the power user settings, we add it
        await addMissingPersonas(allEntities);
        // Before printing the personas, we check if we should enable/disable search sorting
        verifyPersonaSearchSortRule();

        let entities = personasFilter.applyFilters(allEntities);
        entities = sortPersonas(entities);

        const storageKey = 'Personas_PerPage';
        const listId = document.getElementById('user_avatar_block');
        const perPage = Number(accountStorage.getItem(storageKey)) || 5;
        const sizeChangerOptions = [5, 10, 25, 50, 100, 250, 500, 1000];

        const pagContainer = document.getElementById('persona_pagination_container');
        if (pagContainer) {
            personaPaginator = createPaginator(pagContainer, {
                dataSource: entities,
                pageSize: perPage,
                pageNumber: savePersonasPage || 1,
                showSizeChanger: true,
                sizeChangerOptions,
                showNavigator: true,
                prevText: '<',
                nextText: '>',
                callback: function (data: string[]) {
                    if (listId) {
                        listId.innerHTML = '';
                        for (const item of data) {
                            listId.append(getUserAvatarBlock(item));
                        }
                    }
                    updatePersonaUIStates();
                },
                onPageSizeChange: function (e: Event, size: number) {
                    accountStorage.setItem(storageKey, (e.target as HTMLSelectElement).value);
                    paginationDropdownChangeHandler(e, size);
                },
            });
        }

        navigateToAvatar = ((avatarId: string): void => {
            const avatarIndex = entities.indexOf(avatarId);
            const page = Math.floor(avatarIndex / perPage) + 1;

            if (avatarIndex !== -1 && personaPaginator) {
                personaPaginator.go(page);
            }
        }) as (...args: unknown[]) => void;

        if (openPageAt) navigateToAvatar(openPageAt);

        return allEntities;
    }
}

/**
 * Uploads an avatar file to the server
 * @param {string} url URL for the avatar file
 * @param {string} [name] Optional name for the avatar file
 * @returns {Promise} Promise that resolves when the avatar is uploaded
 */
async function uploadUserAvatar(url: string, name?: string) {
    const fetchResult = await fetch(url);
    const blob = await fetchResult.blob();
    const file = new File([blob], 'avatar.png', { type: 'image/png' });
    const formData = new FormData();
    formData.append('avatar', file);

    if (name) {
        formData.append('overwrite_name', name);
    }

    const response = await fetch('/api/avatars/upload', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
        cache: 'no-cache',
        body: formData,
    });

    if (!response.ok) {
        throw new Error(`Failed to upload avatar: ${response.statusText}`);
    }

    // Get the actual path from the response
    const data = await response.json();
    await getUserAvatars(true, data?.path || name);
}

/**
 *
 * @param e
 */
async function changeUserAvatar(e: Event) {
    const form = document.getElementById('form_upload_avatar');

    if (!(form instanceof HTMLFormElement)) {
        console.error('Form not found');
        return;
    }

    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
        form.reset();
        return;
    }

    const formData = new FormData(form);
    const dataUrl = await getBase64Async(file);
    let url = '/api/avatars/upload';

    if (!power_user.never_resize_avatars) {
        const dlg = new Popup(t`Set the crop position of the avatar image`, POPUP_TYPE.CROP, '', { cropImage: dataUrl } as Record<string, unknown>);
        const result = await dlg.show();

        if (!result) {
            return;
        }

        if (dlg.cropData !== undefined) {
            url += `?crop=${encodeURIComponent(JSON.stringify(dlg.cropData))}`;
        }
    }

    const rawFile = formData.get('avatar');
    if (rawFile instanceof File) {
        const convertedFile = await ensureImageFormatSupported(rawFile);
        formData.set('avatar', convertedFile);
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
        cache: 'no-cache',
        body: formData,
    });

    if (response.ok) {
        const data = await response.json();

        const overwriteName = formData.get('overwrite_name');
        const dataPath = data?.path;

        // If the user uploaded a new avatar, we want to make sure it's not cached
        if (overwriteName && dataPath) {
            await fetch(getUserAvatar(String(dataPath)), { cache: 'reload' });
            await fetch(getThumbnailUrl('persona', String(dataPath)), { cache: 'reload' });
            reloadUserAvatar(true);
        }

        if (!overwriteName && dataPath) {
            await getUserAvatars();
            await delay(1);
            await createPersona(dataPath);
        }

        await getUserAvatars(true, dataPath || String(overwriteName));
    }

    // Will allow to select the same file twice in a row
    form.reset();
}

/**
 * Prompts the user to create a persona for the uploaded avatar.
 * @param {string} avatarId User avatar id
 * @returns {Promise} Promise that resolves when the persona is set
 */
export async function createPersona(avatarId: string) {
    const personaName = await Popup.show.input(t`Enter a name for this persona:`, t`Cancel if you're just uploading an avatar.`, '');

    if (!personaName) {
        console.debug('User cancelled creating a persona');
        return;
    }

    const personaDescription = await Popup.show.input(t`Enter a description for this persona:`, t`You can always add or change it later.`, '', { rows: 4 });

    await initPersona(avatarId, personaName, personaDescription ?? '', '');
    if (power_user.persona_show_notifications) {
        notyf.success(t`You can now pick ${personaName} as a persona in the Persona Management menu.`, t`Persona Created`);
    }
}

/**
 *
 */
async function createDummyPersona() {
    const popup = new Popup(t`Enter a name for this persona:`, POPUP_TYPE.INPUT, '', {
        customInputs: [{
            id: 'persona_title',
            type: 'text' as const,
            label: t`Persona Title (optional, display only)`,
        }],
    } as Record<string, unknown>);

    const personaName: unknown = await popup.show();
    const personaTitle = String(popup.inputResults.get('persona_title') || '').trim();

    if (!personaName || typeof personaName !== 'string') {
        console.debug('User cancelled creating dummy persona');
        return;
    }

    // Date + name (only ASCII) to make it unique
    const avatarId = `${Date.now()}-${personaName.replace(/[^a-zA-Z0-9]/g, '')}.png`;
    await initPersona(avatarId, personaName, '', personaTitle);
    await uploadUserAvatar(default_user_avatar, avatarId);
}

/**
 * Initializes a persona for the given avatar id.
 * @param {string} avatarId User avatar id
 * @param {string} personaName Name for the persona
 * @param {string} personaDescription Optional description for the persona
 * @param {string} personaTitle Optional title for the persona
 * @param {object} [options] Optional settings
 * @param {boolean} [options.silent] If true, no PERSONA_CREATED event is emitted (used for background migrations)
 * @param {number} [options.position] Description position (defaults to IN_PROMPT)
 * @param {number} [options.depth] Description depth (defaults to DEFAULT_DEPTH)
 * @param {number} [options.role] Description role (defaults to DEFAULT_ROLE)
 * @param {string} [options.lorebook] Attached lorebook name
 * @returns {Promise<void>}
 */
export async function initPersona(avatarId: string, personaName: string, personaDescription: string, personaTitle: string, {
    silent = false,
    position = persona_description_positions.IN_PROMPT,
    depth = DEFAULT_DEPTH,
    role = DEFAULT_ROLE,
    lorebook = '',
}: {
    silent?: boolean;
    position?: number;
    depth?: number;
    role?: number;
    lorebook?: string;
} = {}) {
    (power_user.personas as Record<string, string>)[avatarId] = personaName;
    (power_user.persona_descriptions as Record<string, Record<string, unknown>>)[avatarId] = {
        description: personaDescription || '',
        position: position,
        depth: depth,
        role: role,
        lorebook: lorebook,
        title: personaTitle || '',
    };

    saveSettingsDebounced();

    if (!silent) {
        await eventSource.emit(event_types.PERSONA_CREATED, { avatarId, name: personaName, description: personaDescription || '', title: personaTitle || '' });
    }
}

/**
 * Converts a character given character (either by character id or the current character) to a persona.
 *
 * If a persona with the same name already exists, the user is prompted to confirm whether or not to overwrite it.
 * If the character description contains {{char}} or {{user}} macros, the user is prompted to confirm whether or not to swap them for persona macros.
 *
 * The function creates a new persona with the same name as the character, and sets the persona description to the character description with the macros swapped.
 * The function also saves the settings and refreshes the persona selector.
 * @param {number} [characterId] - The ID of the character to convert to a persona. Defaults to the current character ID.
 * @returns {Promise<boolean>} A promise that resolves to true if the character was converted, false otherwise.
 */
export async function convertCharacterToPersona(characterId: number | null = null) {
    if (null === characterId) characterId = Number(this_chid);

    const avatarUrl = characters[characterId!]?.avatar;
    if (!avatarUrl) {
        console.log('No avatar found for this character');
        return false;
    }

    const name = characters[characterId!]?.name;
    let description = characters[characterId!]?.description ?? '';
    const overwriteName = `${name} (Persona).png`;

    if (overwriteName in power_user.personas) {
        const confirm = await Popup.show.confirm(t`Overwrite Existing Persona`, t`This character exists as a persona already. Do you want to overwrite it?`);
        if (!confirm) {
            console.log('User cancelled the overwrite of the persona');
            return false;
        }
    }

    if (description.includes('{{char}}') || description.includes('{{user}}')) {
        const confirm = await Popup.show.confirm(t`Persona Description Macros`, t`This character has a description that uses <code>{{char}}</code> or <code>{{user}}</code> macros. Do you want to swap them in the persona description?`);
        if (confirm) {
            description = description.replace(/{{char}}/gi, '{{personaChar}}').replace(/{{user}}/gi, '{{personaUser}}');
            description = description.replace(/{{personaUser}}/gi, '{{char}}').replace(/{{personaChar}}/gi, '{{user}}');
        }
    }

    const thumbnailAvatar = getThumbnailUrl('avatar', avatarUrl);
    await uploadUserAvatar(thumbnailAvatar, overwriteName);

    (power_user.personas as Record<string, string>)[overwriteName] = name!;
    (power_user.persona_descriptions as Record<string, Record<string, unknown>>)[overwriteName] = {
        description: description,
        position: persona_description_positions.IN_PROMPT,
        depth: DEFAULT_DEPTH,
        role: DEFAULT_ROLE,
        lorebook: '',
        title: '',
    };

    // If the user is currently using this persona, update the description
    if (user_avatar === overwriteName) {
        power_user.persona_description = description;
    }

    saveSettingsDebounced();
    await eventSource.emit(event_types.PERSONA_CREATED, { avatarId: overwriteName, name, description, title: '' });

    console.log('Persona for character created');
    notyf.success(t`You can now pick ${name} as a persona in the Persona Management menu.`, t`Persona Created`);

    // Refresh the persona selector
    await getUserAvatars(true, overwriteName);
    // Reload the persona description
    setPersonaDescription();
    return true;
}

/**
 * Counts the number of tokens in a persona description.
 */
const countPersonaDescriptionTokens = debounce(async () => {
    const description = String((document.getElementById('persona_description') as HTMLInputElement).value);
    const count = await getTokenCountAsync(description);
    document.getElementById('persona_description_token_count')!.textContent = String(count);
}, debounce_timeout.relaxed);

/**
 * Updates the UI for the Persona Management page with the current persona values
 */
export function setPersonaDescription() {
    document.getElementById('your_name')!.textContent = name1;

    if (power_user.persona_description_position === persona_description_positions.AFTER_CHAR) {
        power_user.persona_description_position = persona_description_positions.IN_PROMPT;
    }

    const _el695 = document.getElementById('persona_depth_position_settings') as HTMLElement;
    if (_el695) _el695.style.display = power_user.persona_description_position === persona_description_positions.AT_DEPTH ? '' : 'none';
    (document.getElementById('persona_description') as HTMLInputElement).value = power_user.persona_description;
    (document.getElementById('persona_depth_value') as HTMLInputElement).value = String(power_user.persona_description_depth ?? DEFAULT_DEPTH);
    const personaDescPosEl = document.querySelector('#persona_description_position') as HTMLSelectElement | null;
    if (personaDescPosEl) {
        personaDescPosEl.value = String(power_user.persona_description_position);
        const option = personaDescPosEl.querySelector(`option[value="${power_user.persona_description_position}"]`) as HTMLOptionElement | null;
        if (option) option.selected = true;
    }
    const personaDepthRoleEl = document.querySelector('#persona_depth_role') as HTMLSelectElement | null;
    if (personaDepthRoleEl) {
        personaDepthRoleEl.value = String(power_user.persona_description_role);
        const option = personaDepthRoleEl.querySelector(`option[value="${power_user.persona_description_role}"]`) as HTMLOptionElement | null;
        if (option) option.selected = true;
    }
    document.getElementById('persona_lore_button')!.classList.toggle('world_set', !!power_user.persona_description_lorebook);
    countPersonaDescriptionTokens();

    updatePersonaUIStates();
    updatePersonaConnectionsAvatarList();
}

/**
 * Gets a list of all personas in the current chat.
 * @returns {string[]} An array of persona identifiers
 */
function getPersonasOfCurrentChat() {
    const personas = chat.filter((message: ChatMessage) => String(message.force_avatar).startsWith(USER_AVATAR_PATH))
        .map((message: ChatMessage) => message.force_avatar!.replace(USER_AVATAR_PATH, ''))
        .filter(onlyUnique);
    return personas;
}

/**
 * Builds a list of persona avatars and populates the given block element with them.
 * @param {HTMLElement} block - The HTML element where the avatar list will be rendered
 * @param {string[]} personas - An array of persona identifiers
 * @param {object} [options] - Optional settings for building the avatar list
 * @param {boolean} [options.empty] - Whether to clear the block element before adding avatars
 * @param {boolean} [options.interactable] - Whether the avatars should be interactable
 * @param {boolean} [options.highlightFavs] - Whether to highlight favorite avatars
 */
export function buildPersonaAvatarList(block: HTMLElement, personas: string[], { empty = true, interactable = false, highlightFavs = true }: { empty?: boolean; interactable?: boolean; highlightFavs?: boolean } = {}) {
    const personasMap = power_user.personas as Record<string, string | undefined>;
    const personaDescsMap = power_user.persona_descriptions as Record<string, Record<string, unknown> | undefined>;
    const personaEntities = personas.map(avatar => ({
        type: 'persona',
        id: avatar,
        item: {
            name: personasMap[avatar],
            description: (personaDescsMap[avatar]?.description as string) || '',
            avatar: avatar,
            fav: power_user.default_persona === avatar,
        },
    }));

    buildAvatarList(block, personaEntities, { empty: empty, interactable: interactable, highlightFavs: highlightFavs });
}

/**
 * Displays avatar connections for the current persona.
 * Converts connections to entities and populates the avatar list. Shows a message if no connections are found.
 */
export function updatePersonaConnectionsAvatarList() {
    const personaDescsMap = power_user.persona_descriptions as Record<string, Record<string, unknown> | undefined>;
    const connections = (personaDescsMap[user_avatar]?.connections ?? []) as PersonaConnection[];
    const entities = connections.map((connection: PersonaConnection) => {
        if (connection.type === 'character') {
            const character = characters.find(c => c.avatar === connection.id);
            if (character) return characterToEntity(character, getCharIndex(character));
        }
        if (connection.type === 'group') {
            const group = groups.find(g => g.id === connection.id);
            if (group) return groupToEntity(group);
        }
        return undefined;
    }).filter((entity): entity is NonNullable<typeof entity> => entity?.item !== undefined);

    if (entities.length)
        buildAvatarList(document.getElementById('persona_connections_list')!, entities, { interactable: true });
    else
        document.getElementById('persona_connections_list')!.textContent = t`[No character connections. Click one of the buttons above to connect this persona.]`;
}


/**
 * Displays a popup for persona selection and returns the selected persona.
 * @param {string} title - The title to display in the popup
 * @param {string} text - The text to display in the popup
 * @param {string[]} personas - An array of persona ids to display for selection
 * @param {object} [options] - Optional settings for the popup
 * @param {string} [options.okButton] - The label for the OK button
 * @param {(element: HTMLElement, ev: MouseEvent) => any} [options.shiftClickHandler] - A function to handle shift-click
 * @param {boolean|string[]} [options.highlightPersonas] - Whether to highlight personas - either by providing a list of persona keys, or true to highlight all present in current chat
 * @param {PersonaConnection} [options.targetedChar] - The targeted character or gorup for this persona selection
 * @returns {Promise<string?>} - A promise that resolves to the selected persona id or null if no selection was made
 */
export async function askForPersonaSelection(title: string, text: string, personas: string[], { okButton = 'None', shiftClickHandler = undefined, highlightPersonas = false, targetedChar = undefined }: {
    okButton?: string;
    shiftClickHandler?: ((element: HTMLElement, ev: MouseEvent) => void) | undefined;
    highlightPersonas?: boolean | string[];
    targetedChar?: PersonaConnection | null | undefined;
} = {}) {
    const content = document.createElement('div');
    const titleElement = document.createElement('h3');
    titleElement.textContent = title;
    content.appendChild(titleElement);

    const textElement = document.createElement('div');
    textElement.classList.add('multiline', 'm-b-1');
    textElement.textContent = text;
    content.appendChild(textElement);

    const personaListBlock = document.createElement('div');
    personaListBlock.classList.add('persona-list', 'avatars_inline', 'avatars_multiline', 'text_muted');
    content.appendChild(personaListBlock);

    if (personas.length > 0)
        buildPersonaAvatarList(personaListBlock, personas, { interactable: true });
    else
        personaListBlock.textContent = t`[Currently no personas connected]`;

    const personasToHighlight = Array.isArray(highlightPersonas) ? highlightPersonas as string[] : (highlightPersonas ? getPersonasOfCurrentChat() : []);

    // Make the persona blocks clickable and close the popup
    personaListBlock.querySelectorAll('.avatar[data-type="persona"]').forEach(block => {
        if (!(block instanceof HTMLElement)) return;
        block.dataset.result = String(100 + personas.indexOf(block.dataset.pid ?? ''));

        if (shiftClickHandler) {
            block.addEventListener('click', function (this: HTMLElement, ev: MouseEvent) {
                if (ev.shiftKey) {
                    shiftClickHandler(this, ev);
                }
            });
        }

        if (personasToHighlight && personasToHighlight.includes(block.dataset.pid ?? '')) {
            block.classList.add('is_active');
            block.title = block.title + '\n\n' + t`Was used in current chat.`;
            if (block.classList.contains('is_fav')) block.title = block.title + '\n' + t`Is your default persona.`;
        }
    });

    const personaDescsMap = power_user.persona_descriptions as Record<string, Record<string, unknown> | undefined>;
    const customButtons: Record<string, unknown>[] = [];
    if (targetedChar) {
        customButtons.push({
            text: t`Remove All Connections`,
            result: 2,
            action: () => {
                for (const [personaId, description] of Object.entries(personaDescsMap)) {
                    const connections = (description?.connections ?? []) as PersonaConnection[];
                    if (connections) {
                        (personaDescsMap[personaId]!).connections = connections.filter((c: PersonaConnection) => {
                            if (targetedChar!.type == c.type && targetedChar!.id == c.id) return false;
                            return true;
                        });
                    }
                }

                saveSettingsDebounced();
                updatePersonaConnectionsAvatarList();
                if (power_user.persona_show_notifications) {
                    const name = targetedChar!.type == 'character' ? characters.find(c => c.avatar === targetedChar!.id)?.name : groups.find(g => g.id === targetedChar!.id)?.name;
                    notyf.info(t`All connections to ${name} have been removed.`, t`Personas Unlocked`);
                }
            },
        });
    }

    const popup = new Popup(content, POPUP_TYPE.TEXT, '', { okButton: okButton, customButtons: customButtons } as Record<string, unknown>);
    const result = await popup.show();
    return Number(result) >= 100 ? personas[Number(result) - 100] ?? null : null;
}

/**
 * Automatically selects a persona based on the given name if a matching persona exists.
 * @param {string} name - The name to search for
 * @param {object} [options]
 * @param {string} [options.personaKey] - Optionally a persona avatar key to target (if multiple persona have the same name); must match the name
 * @returns {Promise<boolean>} True if a matching persona was found and selected, false otherwise
 */
export async function autoSelectPersona(name: string, { personaKey = null }: { personaKey?: string | null } = {}) {
    const persona = findPersona({ name: personaKey ?? name, allowAvatar: !!personaKey });
    if (persona) {
        console.log(`Auto-selecting persona ${persona.avatar} for name ${name}`);
        await setUserAvatar(persona.avatar);
        return true;
    }
    return false;
}

/**
 * Edits the title of a persona based on the input from a popup.
 * @param {Popup} popup Popup instance
 * @param {string} avatarId Avatar ID of the persona to edit
 * @param {string} currentTitle Current title of the persona
 */
async function editPersonaTitle(popup: Popup, avatarId: string, currentTitle: string) {
    if (popup.result !== POPUP_RESULT.AFFIRMATIVE) {
        return;
    }

    const personaDescsMap = power_user.persona_descriptions as Record<string, Record<string, unknown> | undefined>;
    if (!personaDescsMap[avatarId]) {
        console.warn('Uninitialized persona descriptor for avatar:', avatarId);
        return;
    }

    const newTitle = String(popup.inputResults.get('persona_title') || '').trim();

    if (!newTitle && currentTitle) {
        console.log(`Removed persona title for ${avatarId}`);
        delete personaDescsMap[avatarId]!.title;
        await getUserAvatars(true, avatarId);
        saveSettingsDebounced();
        await eventSource.emit(event_types.PERSONA_UPDATED, avatarId);
        return;
    }

    if (newTitle !== currentTitle) {
        personaDescsMap[avatarId]!.title = newTitle;
        console.log(`Updated persona title for ${avatarId} to ${newTitle}`);
        await getUserAvatars(true, avatarId);
        saveSettingsDebounced();
        await eventSource.emit(event_types.PERSONA_UPDATED, avatarId);
        return;
    }
}

/**
 * Renames the persona with the given avatar ID by showing a popup to enter a new name.
 * @param {string} avatarId - ID of the avatar to rename
 * @returns {Promise<boolean>} A promise that resolves to true if the persona was renamed, false otherwise
 */
async function renamePersona(avatarId: string) {
    const personasMap = power_user.personas as Record<string, string | undefined>;
    const personaDescsMap = power_user.persona_descriptions as Record<string, Record<string, unknown> | undefined>;
    const currentName = personasMap[avatarId];
    const currentTitle = (personaDescsMap[avatarId]?.title as string) || '';
    const newName = await Popup.show.input(t`Rename Persona`, t`Enter a new name for this persona:`, currentName, {
        customInputs: [{
            id: 'persona_title',
            type: 'text',
            label: t`Persona Title (optional, display only)`,
            defaultState: currentTitle,
        }],
        onClose: (popup: Popup) => editPersonaTitle(popup, avatarId, currentTitle),
    });

    if (!newName || newName === currentName) {
        console.debug('User cancelled renaming persona or name is unchanged');
        return false;
    }

    (power_user.personas as Record<string, string>)[avatarId] = newName;
    console.log(`Renamed persona ${avatarId} to ${newName}`);

    if (avatarId === user_avatar) {
        setUserName(newName);
    }

    saveSettingsDebounced();
    await eventSource.emit(event_types.PERSONA_RENAMED, { avatarId, oldName: currentName, newName });
    await getUserAvatars(true, avatarId);
    updatePersonaUIStates();
    setPersonaDescription();
    return true;
}

/**
 * Selects the persona with the currently set avatar ID by updating the user name and persona description, and updating the locked persona if the setting is enabled.
 * @param {object} [options] - Optional settings
 * @param {boolean} [options.toastPersonaNameChange] - Whether to show a toast when the persona name is changed
 * @returns {Promise<void>}
 */
async function selectCurrentPersona({ toastPersonaNameChange = true }: { toastPersonaNameChange?: boolean } = {}) {
    const personasMap = power_user.personas as Record<string, string | undefined>;
    const personaDescsMap = power_user.persona_descriptions as Record<string, Record<string, unknown> | undefined>;
    const personaName = personasMap[user_avatar];
    if (personaName) {
        const shouldAutoLock = !!(power_user as Record<string, unknown>).persona_auto_lock && user_avatar !== chat_metadata.persona;

        if (personaName !== name1) {
            console.log(`Auto-updating user name to ${personaName}`);
            setUserName(personaName, { toastPersonaNameChange: !shouldAutoLock && toastPersonaNameChange });
        }

        const descriptor = personaDescsMap[user_avatar];

        if (descriptor) {
            power_user.persona_description = (descriptor.description as string) ?? '';
            power_user.persona_description_position = (descriptor.position as number) ?? persona_description_positions.IN_PROMPT;
            power_user.persona_description_depth = (descriptor.depth as number) ?? DEFAULT_DEPTH;
            power_user.persona_description_role = (descriptor.role as number) ?? DEFAULT_ROLE;
            power_user.persona_description_lorebook = (descriptor.lorebook as string) ?? '';
        } else {
            power_user.persona_description = '';
            power_user.persona_description_position = persona_description_positions.IN_PROMPT;
            power_user.persona_description_depth = DEFAULT_DEPTH;
            power_user.persona_description_role = DEFAULT_ROLE;
            power_user.persona_description_lorebook = '';
            personaDescsMap[user_avatar] = {
                description: '',
                position: persona_description_positions.IN_PROMPT,
                depth: DEFAULT_DEPTH,
                role: DEFAULT_ROLE,
                lorebook: '',
                connections: [],
                title: '',
            };
        }

        setPersonaDescription();

        // Update the locked persona if setting is enabled
        if (shouldAutoLock) {
            chat_metadata.persona = user_avatar;
            console.log(`Auto locked persona to ${user_avatar}`);
            if (toastPersonaNameChange && power_user.persona_show_notifications) {
                notyf.success(t`Persona ${personaName} selected and auto-locked to current chat`, t`Persona Selected`);
            }
            saveMetadataDebounced();
            updatePersonaUIStates();
        }

        // As the last step, inform user if the persona is only temporarily chosen
        if (power_user.persona_show_notifications && !isPersonaPanelOpen()) {
            const temporary = getPersonaTemporaryLockInfo();
            if (temporary.isTemporary) {
                notyf.info(t`This persona is only temporarily chosen. Click for more info.`, t`Temporary Persona`, {
                    preventDuplicates: true,
                    onclick: () => {
                        notyf.info(escapeHtml(temporary.info).replaceAll('\n', '<br />'), t`Temporary Persona`, { escapeHtml: false });
                    },
                });
            }
        }
    }
}

/**
 * Checks if a connection is locked for the current character or group edit menu
 * @param {PersonaConnection} connection - Connection to check
 * @returns {boolean} Whether the connection is locked
 */
export function isPersonaConnectionLocked(connection: PersonaConnection) {
    return (!selected_group && connection.type === 'character' && connection.id === characters[Number(this_chid)]?.avatar)
        || (selected_group && connection.type === 'group' && connection.id === selected_group);
}

/**
 * Checks if the persona is locked
 * @param {'chat' | 'character' | 'default'} type - Lock type
 * @returns {boolean} Whether the persona is locked
 */
export function isPersonaLocked(type: string = 'chat') {
    switch (type) {
        case 'default':
            return power_user.default_persona === user_avatar;
        case 'chat':
            return chat_metadata.persona == user_avatar;
        case 'character': {
            const descs = power_user.persona_descriptions as Record<string, Record<string, unknown> | undefined>;
            return !!(descs[user_avatar]?.connections as PersonaConnection[] | undefined)?.some(isPersonaConnectionLocked);
        }
        default: throw new Error(`Unknown persona lock type: ${type}`);
    }
}

/**
 * Locks or unlocks the persona
 * @param {boolean} state Desired lock state
 * @param {'chat' | 'character' | 'default'} type - Lock type
 * @returns {Promise<void>}
 */
export async function setPersonaLockState(state: boolean, type: string = 'chat') {
    return state ? await lockPersona(type) : await unlockPersona(type);
}

/**
 * Toggle the persona lock state
 * @param {'chat' | 'character' | 'default'} type - Lock type
 * @returns {Promise<boolean>} - Whether the persona was locked
 */
export async function togglePersonaLock(type = 'chat') {
    if (isPersonaLocked(type)) {
        await unlockPersona(type);
        return false;
    } else {
        await lockPersona(type);
        return true;
    }
}

/**
 * Unlock the persona
 * @param {'chat' | 'character' | 'default'} type - Lock type
 * @returns {Promise<void>}
 */
async function unlockPersona(type: string = 'chat') {
    switch (type) {
        case 'default': {
            await toggleDefaultPersona(user_avatar, { quiet: true });
            break;
        }
        case 'chat': {
            if (chat_metadata.persona) {
                console.log(`Unlocking persona ${user_avatar} from this chat`);
                delete chat_metadata.persona;
                await saveMetadata();
                if (power_user.persona_show_notifications && !isPersonaPanelOpen()) {
                    notyf.info(t`Persona ${name1} is now unlocked from this chat.`, t`Persona Unlocked`);
                }
            }
            break;
        }
        case 'character': {
            const personaDescsMap = power_user.persona_descriptions as Record<string, Record<string, unknown> | undefined>;
            const connections = personaDescsMap[user_avatar]?.connections as PersonaConnection[] | undefined;
            if (connections) {
                console.log(`Unlocking persona ${user_avatar} from this character ${name2}`);
                personaDescsMap[user_avatar]!.connections = connections.filter((c: PersonaConnection) => !isPersonaConnectionLocked(c));
                saveSettingsDebounced();
                updatePersonaConnectionsAvatarList();
                if (power_user.persona_show_notifications && !isPersonaPanelOpen()) {
                    notyf.info(t`Persona ${name1} is now unlocked from character ${name2}.`, t`Persona Unlocked`);
                }
            }
            break;
        }
        default:
            throw new Error(`Unknown persona lock type: ${type}`);
    }

    updatePersonaUIStates();
}

/**
 * Lock the persona
 * @param {'chat' | 'character' | 'default'} type - Lock type
 */
async function lockPersona(type: string = 'chat') {
    const personasMap = power_user.personas as Record<string, string | undefined>;
    const personaDescsMap = power_user.persona_descriptions as Record<string, Record<string, unknown> | undefined>;
    // First make sure that user_avatar is actually a persona
    if (!(user_avatar in personasMap)) {
        console.log(`Creating a new persona ${user_avatar}`);
        if (power_user.persona_show_notifications) {
            notyf.info(t`Creating a new persona for currently selected user name and avatar...`, t`Persona Not Found`);
        }
        (power_user.personas as Record<string, string>)[user_avatar] = name1;
        personaDescsMap[user_avatar] = {
            description: '',
            position: persona_description_positions.IN_PROMPT,
            depth: DEFAULT_DEPTH,
            role: DEFAULT_ROLE,
            lorebook: '',
            connections: [],
            title: '',
        };
        await eventSource.emit(event_types.PERSONA_CREATED, { avatarId: user_avatar, name: name1, description: '', title: '' });
    }

    switch (type) {
        case 'default': {
            await toggleDefaultPersona(user_avatar, { quiet: true });
            break;
        }
        case 'chat': {
            console.log(`Locking persona ${user_avatar} to this chat`);
            chat_metadata.persona = user_avatar;
            saveMetadataDebounced();
            if (power_user.persona_show_notifications && !isPersonaPanelOpen()) {
                notyf.success(t`User persona ${name1} is locked to ${name2} in this chat`, t`Persona Locked`);
            }
            break;
        }
        case 'character': {
            const newConnection = getCurrentConnectionObj();
            const existingConnections = personaDescsMap[user_avatar]!.connections as PersonaConnection[] | undefined;
            const connections = existingConnections?.filter((c: PersonaConnection) => !isPersonaConnectionLocked(c)) ?? [];
            if (newConnection && newConnection.id) {
                console.log(`Locking persona ${user_avatar} to this character ${name2}`);
                personaDescsMap[user_avatar]!.connections = [...connections, newConnection];

                const unlinkedCharacters: string[] = [];
                if (!(power_user as Record<string, unknown>).persona_allow_multi_connections) {
                    const allDescs = power_user.persona_descriptions as Record<string, Record<string, unknown> | undefined>;
                    for (const [avatarId, description] of Object.entries(allDescs)) {
                        if (avatarId === user_avatar) continue;

                        const descConns = description?.connections as PersonaConnection[] | undefined;
                        const filteredConnections = descConns?.filter((c: PersonaConnection) => !(c.type === newConnection!.type && c.id === newConnection!.id)) ?? [];
                        if (filteredConnections.length !== descConns?.length) {
                            if (description) description.connections = filteredConnections;
                            unlinkedCharacters.push(personasMap[avatarId] ?? '');
                        }
                    }
                }

                saveSettingsDebounced();
                updatePersonaConnectionsAvatarList();
                if (power_user.persona_show_notifications) {
                    let additional = '';
                    if (unlinkedCharacters.length)
                        additional += `<br /><br />${t`Unlinked existing persona${unlinkedCharacters.length > 1 ? 's' : ''}: ${unlinkedCharacters.map(escapeHtml).join(', ')}`}`;
                    if (additional || !isPersonaPanelOpen()) {
                        notyf.success(t`User persona ${escapeHtml(name1)} is locked to character ${escapeHtml(name2)}${additional}`, t`Persona Locked`, { escapeHtml: false });
                    }
                }
            }
            break;
        }
        default:
            throw new Error(`Unknown persona lock type: ${type}`);
    }

    updatePersonaUIStates();
}


/**
 * Click handler for the delete persona button. Delegates to deletePersona with the current user avatar.
 */
async function deleteUserAvatar() {
    await deletePersona(user_avatar);
}

/**
 * Deletes a persona by avatar id.
 * @param {string} avatarId The persona's avatar id to delete
 * @param {object} [options] Options
 * @param {boolean} [options.silent] If true, skips the confirmation popup and suppresses toast notifications
 * @returns {Promise<boolean>} True if the persona was deleted
 */
async function deletePersona(avatarId: string, { silent = false }: { silent?: boolean } = {}) {
    if (!avatarId) {
        console.warn('No avatar id found');
        return false;
    }

    const personasMap = power_user.personas as Record<string, string | undefined>;
    const personaDescsMap = power_user.persona_descriptions as Record<string, Record<string, unknown> | undefined>;
    const name = personasMap[avatarId] || '';

    if (!silent) {
        const confirm = await Popup.show.confirm(
            t`Delete Persona` + `: ${name}`,
            t`Are you sure you want to delete this avatar?` + '<br />' + t`All information associated with its linked persona will be lost.`);

        if (!confirm) {
            console.debug('User cancelled deleting avatar');
            return false;
        }
    }

    const request = await fetch('/api/avatars/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            'avatar': avatarId,
        }),
    });

    if (request.ok) {
        console.log(`Deleted avatar ${avatarId}`);
        delete personasMap[avatarId];
        delete personaDescsMap[avatarId];

        if (avatarId === power_user.default_persona) {
            if (!silent) notyf.warning(t`The default persona was deleted. You will need to set a new default persona.`, t`Default Persona Deleted`);
            power_user.default_persona = null;
        }

        if (avatarId === chat_metadata.persona) {
            if (!silent) notyf.warning(t`The locked persona was deleted. You will need to set a new persona for this chat.`, t`Persona Deleted`);
            delete chat_metadata.persona;
            await saveMetadata();
        }

        saveSettingsDebounced();
        await eventSource.emit(event_types.PERSONA_DELETED, { avatarId, name });

        // Use the existing mechanism to re-render the persona list and choose the next persona here
        personaLastLoadedChatId = uuidv4(); // Force reload by making a dummy chat id
        await loadPersonaForCurrentChat({ doRender: true });
        return true;
    }

    return false;
}

/**
 *
 */
async function onPersonaDescriptionInput() {
    power_user.persona_description = String((document.getElementById('persona_description') as HTMLInputElement).value);
    countPersonaDescriptionTokens();

    const personasMap = power_user.personas as Record<string, string | undefined>;
    const personaDescsMap = power_user.persona_descriptions as Record<string, Record<string, unknown> | undefined>;

    if (personasMap[user_avatar]) {
        let object = personaDescsMap[user_avatar];

        if (!object) {
            object = {
                description: power_user.persona_description,
                position: Number((document.querySelector('#persona_description_position option:checked') as HTMLOptionElement)?.value),
                depth: Number((document.getElementById('persona_depth_value') as HTMLInputElement).value),
                role: Number((document.querySelector('#persona_depth_role option:checked') as HTMLOptionElement)?.value),
                lorebook: '',
                title: '',
            };
            personaDescsMap[user_avatar] = object;
        }

        object.description = power_user.persona_description;
    }

    const chDescEl = document.querySelector(`.avatar-container[data-avatar-id="${user_avatar}"] .ch_description`) as HTMLElement | null;
    if (chDescEl) {
        chDescEl.textContent = power_user.persona_description || document.getElementById('user_avatar_block')?.getAttribute('no_desc_text') || '';
        chDescEl.classList.toggle('text_muted', !power_user.persona_description);
    }
    saveSettingsDebounced();

    if (personasMap[user_avatar]) {
        await eventSource.emit(event_types.PERSONA_UPDATED, user_avatar);
    }
}

/**
 *
 */
async function onPersonaDescriptionDepthValueInput() {
    power_user.persona_description_depth = Number((document.getElementById('persona_depth_value') as HTMLInputElement).value);

    const personasMap = power_user.personas as Record<string, string | undefined>;
    if (personasMap[user_avatar]) {
        const object = getOrCreatePersonaDescriptor();
        object.depth = power_user.persona_description_depth;
        saveSettingsDebounced();
        await eventSource.emit(event_types.PERSONA_UPDATED, user_avatar);
        return;
    }

    saveSettingsDebounced();
}

/**
 *
 */
async function onPersonaDescriptionDepthRoleInput() {
    power_user.persona_description_role = Number((document.querySelector('#persona_depth_role option:checked') as HTMLOptionElement)?.value);

    const personasMap = power_user.personas as Record<string, string | undefined>;
    if (personasMap[user_avatar]) {
        const object = getOrCreatePersonaDescriptor();
        object.role = power_user.persona_description_role;
        saveSettingsDebounced();
        await eventSource.emit(event_types.PERSONA_UPDATED, user_avatar);
        return;
    }

    saveSettingsDebounced();
}

/**
 * Opens a popup to set the lorebook for the current persona.
 * @param {Pick<JQuery.ClickEvent, 'shiftKey' | 'altKey'>} event Click event
 */
async function onPersonaLoreButtonClick({ shiftKey, altKey }: { shiftKey: boolean; altKey: boolean }) {
    const personasMap = power_user.personas as Record<string, string | undefined>;
    const personaName = personasMap[user_avatar];
    const selectedLorebook = power_user.persona_description_lorebook;

    if (!personaName) {
        notyf.warning(t`You must bind a name to this persona before you can set a lorebook.`, t`Persona Name Not Set`);
        return;
    }

    if (selectedLorebook && !shiftKey && !altKey) {
        openWorldInfoEditor(selectedLorebook);
        return;
    }

    const templateEl = await renderTemplateAsync('personaLorebook');
    const template = templateEl;

    const worldSelect = templateEl.querySelector('select') as HTMLSelectElement | null;
    (templateEl.querySelector('.persona_name') as HTMLElement).textContent = personaName;

    for (const worldName of (world_names as string[])) {
        const option = document.createElement('option');
        option.value = worldName;
        option.innerText = worldName;
        option.selected = selectedLorebook === worldName;
        worldSelect!.append(option);
    }

    worldSelect!.addEventListener('change', async function (this: HTMLSelectElement) {
        power_user.persona_description_lorebook = String(this.value);

        if (personasMap[user_avatar]) {
            const object = getOrCreatePersonaDescriptor();
            object.lorebook = power_user.persona_description_lorebook;
        }

        document.getElementById('persona_lore_button')!.classList.toggle('world_set', !!power_user.persona_description_lorebook);
        saveSettingsDebounced();

        if (personasMap[user_avatar]) {
            await eventSource.emit(event_types.PERSONA_UPDATED, user_avatar);
        }
    });

    await callGenericPopup(template, POPUP_TYPE.TEXT);
}

/**
 *
 */
async function onPersonaDescriptionPositionInput() {
    power_user.persona_description_position = Number(
        (document.querySelector('#persona_description_position option:checked') as HTMLOptionElement)?.value,
    );

    const personasMap = power_user.personas as Record<string, string | undefined>;
    if (personasMap[user_avatar]) {
        const object = getOrCreatePersonaDescriptor();
        object.position = power_user.persona_description_position;
        saveSettingsDebounced();
        await eventSource.emit(event_types.PERSONA_UPDATED, user_avatar);
        const _el1487 = document.getElementById('persona_depth_position_settings') as HTMLElement;
        if (_el1487) _el1487.style.display = power_user.persona_description_position === persona_description_positions.AT_DEPTH ? '' : 'none';
        return;
    }

    saveSettingsDebounced();
    const _el1493 = document.getElementById('persona_depth_position_settings') as HTMLElement;
    if (_el1493) _el1493.style.display = power_user.persona_description_position === persona_description_positions.AT_DEPTH ? '' : 'none';
}

/**
 *
 */
export function getOrCreatePersonaDescriptor(): Record<string, unknown> {
    const personaDescsMap = power_user.persona_descriptions as Record<string, Record<string, unknown> | undefined>;
    let object = personaDescsMap[user_avatar];

    if (!object) {
        object = {
            description: power_user.persona_description,
            position: power_user.persona_description_position,
            depth: power_user.persona_description_depth,
            role: power_user.persona_description_role,
            lorebook: power_user.persona_description_lorebook,
            connections: [],
            title: '',
        };
        personaDescsMap[user_avatar] = object;
    }
    return object;
}

/**
 * Sets a persona as the default one to be used for all new chats and unlocked existing chats
 * @param {string} avatarId The avatar id of the persona to set as the default
 * @param {object} [options] Optional arguments
 * @param {boolean} [options.quiet] If true, no confirmation popups will be shown
 * @returns {Promise<void>}
 */
async function toggleDefaultPersona(avatarId: string, { quiet = false }: { quiet?: boolean } = {}) {
    if (!avatarId) {
        console.warn('No avatar id found');
        return;
    }

    const currentDefault = power_user.default_persona;
    const personasMap = power_user.personas as Record<string, string | undefined>;

    if (personasMap[avatarId] === undefined) {
        console.warn(`No persona name found for avatar ${avatarId}`);
        notyf.warning(t`You must bind a name to this persona before you can set it as the default.`, t`Persona Name Not Set`);
        return;
    }


    if (avatarId === currentDefault) {
        if (!quiet) {
            const confirm = await Popup.show.confirm(t`Are you sure you want to remove the default persona?`, personasMap[avatarId]);
            if (!confirm) {
                console.debug('User cancelled removing default persona');
                return;
            }
        }

        console.log(`Removing default persona ${avatarId}`);
        if (power_user.persona_show_notifications && !isPersonaPanelOpen()) {
            notyf.info(t`This persona will no longer be used by default when you open a new chat.`, t`Default Persona Removed`);
        }
        (power_user as Record<string, unknown>).default_persona = null;
    } else {
        if (!quiet) {
            const confirm = await Popup.show.confirm(t`Set Default Persona`,
                t`Are you sure you want to set "${personasMap[avatarId]}" as the default persona?`
                + '<br /><br />'
                + t`This name and avatar will be used for all new chats, as well as existing chats where the user persona is not locked.`);
            if (!confirm) {
                console.debug('User cancelled setting default persona');
                return;
            }
        }

        (power_user as Record<string, unknown>).default_persona = avatarId;
        if (power_user.persona_show_notifications && !isPersonaPanelOpen()) {
            notyf.success(t`Set to ${personasMap[avatarId]}.This persona will be used by default when you open a new chat.`, t`Default Persona`);
        }
    }

    saveSettingsDebounced();
    await getUserAvatars(true, avatarId);
    updatePersonaUIStates();
}

/**
 * Returns an object with 3 properties that describe the state of the given persona
 *
 * - default: Whether this persona is the default one for all new chats
 * - locked: An object containing the lock states
 *   - chat: Whether the persona is locked to the currently open chat
 *   - character: Whether the persona is locked to the currently open character or group
 * @param {string} avatarId - The avatar id of the persona to get the state for
 * @returns {PersonaState} An object describing the state of the given persona
 */
function getPersonaStates(avatarId: string): PersonaState {
    const isDefaultPersona = power_user.default_persona === avatarId;
    const hasChatLock = chat_metadata.persona == avatarId;

    const personaDescsMap = power_user.persona_descriptions as Record<string, Record<string, unknown> | undefined>;
    const connections = personaDescsMap[avatarId]?.connections as PersonaConnection[] | undefined;
    const hasCharLock = !!connections?.some((c: PersonaConnection) =>
        (!selected_group && c.type === 'character' && c.id === characters[Number(this_chid)]?.avatar)
        || (selected_group && c.type === 'group' && c.id === selected_group));

    return {
        avatarId: avatarId,
        default: isDefaultPersona,
        locked: {
            chat: hasChatLock,
            character: hasCharLock,
        },
    };
}

/**
 * Updates the UI to reflect the current states of all personas and the selected user's persona.
 * This includes updating class states on avatar containers to indicate default status, chat lock,
 * and character lock, as well as updating icons and labels in the persona management panel to reflect
 * the current state of the user's persona.
 * Additionally, it manages the display of temporary persona lock information.
 * @param {object} [options={}] - Optional settings
 * @param {boolean} [options.navigateToCurrent=false] - Whether to navigate to the current persona in the persona list
 */

/**
 *
 * @param root0
 * @param root0.navigateToCurrent
 */
function updatePersonaUIStates({ navigateToCurrent = false }: { navigateToCurrent?: boolean } = {}) {
    if (navigateToCurrent) {
        navigateToAvatar(user_avatar);
    }

    // Update the persona list
    document.querySelectorAll('#user_avatar_block .avatar-container').forEach(el => {
        const avatarId = el.getAttribute('data-avatar-id');
        const states = getPersonaStates(avatarId!);
        el.classList.toggle('default_persona', states.default);
        el.classList.toggle('locked_to_chat', states.locked.chat);
        el.classList.toggle('locked_to_character', states.locked.character);
        el.classList.toggle('selected', avatarId === user_avatar);
    });

    // Buttons for the persona panel on the right
    const personaStates = getPersonaStates(user_avatar);

    document.getElementById('lock_persona_default')!.classList.toggle('locked', personaStates.default);

    document.getElementById('lock_user_name')!.classList.toggle('locked', personaStates.locked.chat);
    (document.querySelector('#lock_user_name i.icon') as HTMLElement)!.classList.toggle('fa-lock', personaStates.locked.chat);
    (document.querySelector('#lock_user_name i.icon') as HTMLElement)!.classList.toggle('fa-unlock', !personaStates.locked.chat);

    document.getElementById('lock_persona_to_char')!.classList.toggle('locked', personaStates.locked.character);
    (document.querySelector('#lock_persona_to_char i.icon') as HTMLElement)!.classList.toggle('fa-lock', personaStates.locked.character);
    (document.querySelector('#lock_persona_to_char i.icon') as HTMLElement)!.classList.toggle('fa-unlock', !personaStates.locked.character);

    // Persona panel info block
    const { isTemporary, info } = getPersonaTemporaryLockInfo();
    if (isTemporary) {
        const messageContainer = document.createElement('div');
        const messageSpan = document.createElement('span');
        messageSpan.textContent = t`Temporary persona in use.`;
        messageContainer.appendChild(messageSpan);
        messageContainer.classList.add('flex-container', 'alignItemsBaseline');

        const infoIcon = document.createElement('i');
        infoIcon.classList.add('fa-solid', 'fa-circle-info', 'opacity50p');
        infoIcon.title = info;
        messageContainer.appendChild(infoIcon);

        // Set the info block content
        setInfoBlock('#persona_connections_info_block', messageContainer, 'hint');
    } else {
        // Clear the info block if no condition applies
        clearInfoBlock('#persona_connections_info_block');
    }
}

/**
 * @typedef {object} PersonaLockInfo
 * @property {boolean} isTemporary - Whether the selected persona is temporary based on current locks.
 * @property {boolean} hasDifferentChatLock - True if the chat persona is set and differs from the user avatar.
 * @property {boolean} hasDifferentDefaultLock - True if the default persona is set and differs from the user avatar.
 * @property {string} info - Detailed information about the current, chat, and default personas.
 */

/**
 * Computes temporary lock information for the current persona.
 *
 * This function checks whether the currently selected persona is temporary by comparing
 * the chat persona and the default persona to the user avatar. If either is different,
 * the currently selected persona is considered temporary and a detailed message is generated.
 * @returns {PersonaLockInfo} An object containing flags and a message describing the persona lock status.
 */
function getPersonaTemporaryLockInfo() {
    const hasDifferentChatLock = !!chat_metadata.persona && chat_metadata.persona !== user_avatar;
    const hasDifferentDefaultLock = power_user.default_persona && power_user.default_persona !== user_avatar;
    const isTemporary = hasDifferentChatLock || (!chat_metadata.persona && hasDifferentDefaultLock);
    const personasMap = power_user.personas as Record<string, string | undefined>;
    const info = isTemporary ? t`A different persona is locked to this chat, or you have a different default persona set. The currently selected persona will only be temporary, and resets on reload. Consider locking this persona to the chat if you want to permanently use it.`
        + '\n\n'
        + t`Current Persona: ${personasMap[user_avatar]}`
        + (hasDifferentChatLock ? '\n' + t`Chat persona: ${personasMap[chat_metadata.persona!]}` : '')
        + (hasDifferentDefaultLock ? '\n' + t`Default persona: ${personasMap[power_user.default_persona!]}` : '') : '';

    return {
        isTemporary: isTemporary,
        hasDifferentChatLock: hasDifferentChatLock,
        hasDifferentDefaultLock: hasDifferentDefaultLock,
        info: info,
    };
}

/**
 * Loads the appropriate persona for the current chat session based on locks (chat lock, char lock, default persona)
 * @param {object} [options] - Optional arguments
 * @param {boolean} [options.doRender] - Whether to render the persona immediately
 * @returns {Promise<boolean>} - A promise that resolves to a boolean indicating whether a persona was selected
 */
async function loadPersonaForCurrentChat({ doRender = false }: { doRender?: boolean } = {}) {
    const currentChatId = getCurrentChatId();
    if (currentChatId === personaLastLoadedChatId) return;
    personaLastLoadedChatId = currentChatId;

    // Cache persona list to check if they exist
    const userAvatars = await getUserAvatars(doRender);

    // Check if the user avatar is set and exists in the list of user avatars
    if (userAvatars && userAvatars.length && !userAvatars.includes(user_avatar)) {
        console.log(`User avatar ${user_avatar} not found in user avatars list, pick the first available one`);
        await setUserAvatar(userAvatars[0]!, { toastPersonaNameChange: false, navigateToCurrent: true });
    }

    // Define a persona for this chat
    let chatPersona = '';

    /** @type {'chat' | 'character' | 'default' | null} */
    let connectType: 'chat' | 'character' | 'default' | null = null;

    // If persona is locked in chat metadata, select it
    if (chat_metadata.persona) {
        console.log(`Using locked persona ${chat_metadata.persona}`);
        chatPersona = chat_metadata.persona;

        // Verify it exists
        if (userAvatars && !userAvatars.includes(chatPersona)) {
            console.warn('Chat-locked persona avatar not found, unlocking persona');
            delete chat_metadata.persona;
            saveSettingsDebounced();
            chatPersona = '';
        }
        if (chatPersona) connectType = 'chat';
    }

    // If the persona panel is open when the chat changes, this is likely because a character was selected from that panel.
    // In that case, we are not automatically switching persona - but need to make changes if there is any chat-bound connection
    /*
    if (isPersonaPanelOpen()) {
        if (chatPersona) {
            // If the chat-bound persona is the currently selected one, we can simply exit out
            if (chatPersona === user_avatar) {
                return false;
            }
            // Otherwise ask if we want to switch
            const autoLock = power_user.persona_auto_lock;
            const result = await Popup.show.confirm(t`Switch Persona?`,
                t`You have a connected persona for the current chat (${power_user.personas[chatPersona]}). Do you want to stick to the current persona (${power_user.personas[user_avatar]}) ${(autoLock ? t`and lock that to the chat` : '')}, or switch to ${power_user.personas[chatPersona]} instead?`,
                { okButton: autoLock ? t`Keep and Lock` : t`Keep`, cancelButton: t`Switch` });
            if (result === POPUP_RESULT.AFFIRMATIVE) {
                if (autoLock) {
                    lockPersona('chat');
                }
                return false;
            }
        } else {
            // If we don't have a chat-bound persona, we simply return and keep the current one we have
            return false;
        }
    }
    */

    // Check if we have any persona connected to the current character
    if (!chatPersona) {
        const connectedPersonas = getConnectedPersonas();

        if (connectedPersonas.length > 0) {
            if (connectedPersonas.length === 1) {
                chatPersona = connectedPersonas[0]!;
            } else if (!(power_user as Record<string, unknown>).persona_allow_multi_connections) {
                console.warn('More than one persona is connected to this character.Using the first available persona for this chat.');
                chatPersona = connectedPersonas[0]!;
            } else {
                chatPersona = await askForPersonaSelection(t`Select Persona`,
                    t`Multiple personas are connected to this character.\nSelect a persona to use for this chat.`,
                    connectedPersonas, { highlightPersonas: true, targetedChar: getCurrentConnectionObj() ?? undefined }) ?? '';
            }
        }

        if (chatPersona) connectType = 'character';
    }

    // Last check if default persona is set, select it
    if (!chatPersona && power_user.default_persona) {
        console.log(`Using default persona ${power_user.default_persona}`);
        chatPersona = power_user.default_persona;

        if (chatPersona) connectType = 'default';
    }

    // Whatever way we selected a persona, if it doesn't exist, unlock this chat
    if (chat_metadata.persona && userAvatars && !userAvatars.includes(chat_metadata.persona)) {
        console.warn('Persona avatar not found, unlocking persona');
        delete chat_metadata.persona;
    }

    // Default persona missing
    if (power_user.default_persona && userAvatars && !userAvatars.includes(power_user.default_persona)) {
        console.warn('Default persona avatar not found, clearing default persona');
        power_user.default_persona = null;
        saveSettingsDebounced();
    }

    // Persona avatar found, select it
    const personasMap = power_user.personas as Record<string, string | undefined>;
    if (chatPersona && user_avatar !== chatPersona) {
        const willAutoLock = !!(power_user as Record<string, unknown>).persona_auto_lock && user_avatar !== chat_metadata.persona;
        await setUserAvatar(chatPersona, { toastPersonaNameChange: false, navigateToCurrent: true });

        if (power_user.persona_show_notifications) {
            let message = t`Auto-selected persona based on ${connectType} connection.<br />Your messages will now be sent as ${personasMap[chatPersona]}.`;
            if (willAutoLock) {
                message += '<br /><br />' + t`Auto-locked this persona to current chat.`;
            }
            notyf.success(message, t`Persona Auto Selected`, { escapeHtml: false });
        }
    } else if (chatPersona && (power_user as Record<string, unknown>).persona_auto_lock && !chat_metadata.persona) {
        // Even if it's the same persona, we still might need to auto-lock to chat if that's enabled
        await lockPersona('chat');
    }

    updatePersonaUIStates();

    return !!chatPersona;
}

/**
 * Returns an array of persona keys that are connected to the given character key.
 * If the character key is not provided, it defaults to the currently selected group or character.
 * @param {string} [characterKey] - The character key to query
 * @returns {string[]} - An array of persona keys that are connected to the given character key
 */
export function getConnectedPersonas(characterKey?: string) {
    characterKey ??= selected_group || characters[Number(this_chid)]?.avatar;
    const descsMap = power_user.persona_descriptions as Record<string, Record<string, unknown> | undefined>;
    const connectedPersonas = Object.entries(descsMap)
        .filter(([_, desc]) => {
            const conns = desc?.connections as PersonaConnection[] | undefined;
            return conns?.some((conn: PersonaConnection) => conn.id === characterKey);
        })
        .map(([key, _]) => key);
    return connectedPersonas;
}


/**
 * Shows a popup with all personas connected to the currently selected character or group.
 * In the popup, the user can select a persona to load for the current character or group, or shift-click to remove the connection.
 * @returns {Promise<void>}
 */
export async function showCharConnections() {
    let isRemoving = false;

    const connections = getConnectedPersonas();
    const message = t`The following personas are connected to the current character.\n\nClick on a persona to select it for the current character.\nShift + Click to unlink the persona from the character.`;
    const selectedPersona = await askForPersonaSelection(t`Persona Connections`, message, connections, {
        okButton: t`Ok`,
        highlightPersonas: true,
        targetedChar: getCurrentConnectionObj() ?? undefined,
        shiftClickHandler: (element: HTMLElement, ev: MouseEvent) => {
            const personaId = element.dataset.pid;
            if (!personaId) return;
            const personaDescsMap = power_user.persona_descriptions as Record<string, Record<string, unknown> | undefined>;
            const personasMap = power_user.personas as Record<string, string | undefined>;
            const connections = personaDescsMap[personaId]?.connections as PersonaConnection[] | undefined;
            if (connections) {
                console.log(`Unlocking persona ${personaId} from current character ${name2}`);
                personaDescsMap[personaId]!.connections = connections.filter((c: PersonaConnection) => {
                    if (menu_type == 'group_edit' && c.type == 'group' && c.id == selected_group) return false;
                    else if (c.type == 'character' && c.id == characters[Number(this_chid)]?.avatar) return false;
                    return true;
                });
                saveSettingsDebounced();
                updatePersonaConnectionsAvatarList();
                if (power_user.persona_show_notifications) {
                    notyf.info(t`User persona ${personasMap[personaId]} is now unlocked from the current character ${name2}.`, t`Persona unlocked`);
                }

                isRemoving = true;
                document.getElementById('char_connections_button')?.click();
            }
        },
    });

    // One of the persona was selected. So load it.
    if (!isRemoving && selectedPersona) {
        await setUserAvatar(selectedPersona, { toastPersonaNameChange: false });
        if (power_user.persona_show_notifications) {
            const personasMap = power_user.personas as Record<string, string | undefined>;
            notyf.success(t`Selected persona ${personasMap[selectedPersona]} for current chat.`, t`Connected Persona Selected`);
        }
    }
}

/**
 * Retrieves the current connection object based on whether the current chat is with a char or a group.
 * @returns {PersonaConnection} An object representing the current connection
 */
export function getCurrentConnectionObj(): PersonaConnection | null {
    if (selected_group)
        return { type: 'group', id: selected_group };
    if (characters[Number(this_chid)]?.avatar)
        return { type: 'character', id: characters[Number(this_chid)]!.avatar };
    return null;
}

/**
 *
 */
function onBackupPersonas() {
    const timestamp = new Date().toISOString().split('T')[0]!.replace(/-/g, '');
    const filename = `personas_${timestamp}.json`;
    const data = JSON.stringify({
        'personas': power_user.personas,
        'persona_descriptions': power_user.persona_descriptions,
        'default_persona': power_user.default_persona,
    }, null, 2);

    const blob = new Blob([data], { type: 'application/json' });
    download(blob, filename, 'application/json');
}

/**
 *
 * @param e
 */
async function onPersonasRestoreInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
        console.debug('No file selected');
        return;
    }

    const data: Record<string, unknown> | null = await parseJsonFile(file) as Record<string, unknown> | null;

    if (!data) {
        notyf.warning(t`Invalid file selected`, t`Persona Management`);
        console.debug('Invalid file selected');
        return;
    }

    if (!data.personas || !data.persona_descriptions || typeof data.personas !== 'object' || typeof data.persona_descriptions !== 'object') {
        notyf.warning(t`Invalid file format`, t`Persona Management`);
        console.debug('Invalid file selected');
        return;
    }

    const avatarsList = await getUserAvatars(false);
    const warnings: string[] = [];
    const personasMap = power_user.personas as Record<string, string | undefined>;
    const personaDescsMap = power_user.persona_descriptions as Record<string, Record<string, unknown> | undefined>;

    // Merge personas with existing ones
    for (const [key, value] of Object.entries(data.personas as Record<string, unknown>)) {
        if (key in personasMap) {
            warnings.push(`Persona "${key}" (${value}) already exists, skipping`);
            continue;
        }

        (power_user.personas as Record<string, string>)[key] = String(value);

        // If the avatar is missing, upload it
        if (avatarsList && !avatarsList.includes(key)) {
            warnings.push(`Persona image "${key}" (${value}) is missing, uploading default avatar`);
            await uploadUserAvatar(default_user_avatar, key);
        }
    }

    // Merge persona descriptions with existing ones
    for (const [key, value] of Object.entries(data.persona_descriptions as Record<string, unknown>)) {
        if (key in personaDescsMap) {
            warnings.push(`Persona description for "${key}" (${personasMap[key]}) already exists, skipping`);
            continue;
        }

        if (!personasMap[key]) {
            warnings.push(`Persona for "${key}" does not exist, skipping`);
            continue;
        }

        personaDescsMap[key] = value as Record<string, unknown>;
    }

    if (data.default_persona) {
        if (String(data.default_persona) in personasMap) {
            (power_user as Record<string, unknown>).default_persona = String(data.default_persona);
        } else {
            warnings.push(`Default persona "${data.default_persona}" does not exist, skipping`);
        }
    }

    if (warnings.length) {
        notyf.success(t`Personas restored with warnings. Check console for details.`, t`Persona Management`);
        console.warn(`PERSONA RESTORE REPORT\n====================\n${warnings.join('\n')}`);
    } else {
        notyf.success(t`Personas restored successfully.`, t`Persona Management`);
    }

    await getUserAvatars();
    setPersonaDescription();
    saveSettingsDebounced();
    (document.getElementById('personas_restore_input') as HTMLInputElement).value = '';
}

/**
 * Synchronizes user-sent messages in the chat to the current persona.
 * @param {object} [options] - Optional parameters
 * @param {number} [options.start] - Start index of the message range (inclusive)
 * @param {number} [options.end] - End index of the message range (inclusive)
 * @param {boolean} [options.quiet] - If true, skips the confirmation popup
 * @param {string} [options.nameFilter] - Filter messages by name (case-insensitive)
 * @returns {Promise<void>}
 */
async function syncUserNameToPersona({ start = 0, end = chat.length - 1, quiet = false, nameFilter = '' } = {}) {
    const isRangeAll = start === 0 && end === chat.length - 1;
    const hasNameFilter = nameFilter?.trim();
    const confirmMessage = isRangeAll && !hasNameFilter
        ? t`All user-sent messages in this chat will be attributed to ${name1}.`
        : isRangeAll && hasNameFilter
            ? t`User-sent messages with name "${nameFilter}" will be attributed to ${name1}.`
            : !isRangeAll && !hasNameFilter
                ? t`User-sent messages in the specified range will be attributed to ${name1}.`
                : t`User-sent messages with name "${nameFilter}" in the specified range will be attributed to ${name1}.`;

    if (!quiet) {
        const confirmation = await Popup.show.confirm(t`Are you sure?`, confirmMessage);
        if (!confirmation) {
            return;
        }
    }

    for (let i = start; i <= end; i++) {
        const mes = chat[i];
        if (mes?.is_user && (!hasNameFilter || equalsIgnoreCaseAndAccents(mes.name, nameFilter))) {
            mes.name = name1;
            mes.force_avatar = getThumbnailUrl('persona', user_avatar);
        }
    }

    await saveChatConditional();
    await reloadCurrentChat();
}

/**
 * Retriggers the first message to reload it from the char definition.
 */
export async function retriggerFirstMessageOnEmptyChat() {
    if (chat_metadata.tainted) {
        return;
    }
    if (selected_group) {
        await reloadCurrentChat();
    }
    if (!selected_group && Number(this_chid) >= 0 && chat.length === 1) {
        await createOrEditCharacter(undefined as unknown as number);
    }
}

/**
 * Duplicates a persona.
 * @param {string} avatarId Source persona avatar id
 * @param {object} [options] Options
 * @param {boolean} [options.silent] If true, skips the confirmation popup
 * @param {boolean} [options.select] If true, selects/activates the duplicated persona
 * @returns {Promise<string>} The avatar id of the new persona, or empty string on failure/cancellation
 */
async function duplicatePersona(avatarId: string, { silent = false, select = false }: { silent?: boolean; select?: boolean } = {}) {
    const personasMap = power_user.personas as Record<string, string | undefined>;
    const personaDescsMap = power_user.persona_descriptions as Record<string, Record<string, unknown> | undefined>;
    const personaName = personasMap[avatarId];

    if (!personaName) {
        notyf.warning(t`Chosen avatar is not a persona`, t`Persona Management`);
        return '';
    }

    if (!silent) {
        const confirm = await Popup.show.confirm(t`Are you sure you want to duplicate this persona?`, personaName);

        if (!confirm) {
            console.debug('User cancelled duplicating persona');
            return '';
        }
    }

    const newAvatarId = `${Date.now()}-${personaName.replace(/[^a-zA-Z0-9]/g, '')}.png`;
    const descriptor = personaDescsMap[avatarId];

    (power_user.personas as Record<string, string>)[newAvatarId] = personaName;
    personaDescsMap[newAvatarId] = {
        description: descriptor?.description ?? '',
        position: descriptor?.position ?? persona_description_positions.IN_PROMPT,
        depth: descriptor?.depth ?? DEFAULT_DEPTH,
        role: descriptor?.role ?? DEFAULT_ROLE,
        lorebook: descriptor?.lorebook ?? '',
        title: descriptor?.title ?? '',
    };

    await uploadUserAvatar(getUserAvatar(avatarId), newAvatarId);

    const eventData = {
        avatarId: newAvatarId,
        name: personaName,
        description: (descriptor?.description as string) ?? '',
        title: (descriptor?.title as string) ?? '',
        duplicatedFromAvatarId: avatarId,
    };
    await eventSource.emit(event_types.PERSONA_CREATED, eventData);

    await getUserAvatars(true, newAvatarId);
    saveSettingsDebounced();

    if (select) {
        await setUserAvatar(newAvatarId);
    }

    return newAvatarId;
}

/**
 * If a current user avatar is not bound to persona, bind it.
 */
async function migrateNonPersonaUser() {
    const personasMap = power_user.personas as Record<string, string | undefined>;
    if (user_avatar in personasMap) {
        return;
    }

    await initPersona(user_avatar, name1, '', '', { silent: true });
    setPersonaDescription();
    await getUserAvatars(true, user_avatar);
}


// #region Persona CRUD Slash Command Utilities

/**
 * Mapping of human-readable position names to persona_description_positions enum values.
 * @type {Record<string, number>}
 */
const POSITION_NAME_MAP = Object.freeze({
    'inprompt': persona_description_positions.IN_PROMPT,
    'topan': persona_description_positions.TOP_AN,
    'bottoman': persona_description_positions.BOTTOM_AN,
    'atdepth': persona_description_positions.AT_DEPTH,
    'none': persona_description_positions.NONE,
});

/**
 * Mapping of human-readable role names to numeric role values.
 * @type {Record<string, number>}
 */
const ROLE_NAME_MAP = Object.freeze({
    'system': 0,
    'user': 1,
    'assistant': 2,
});

/**
 * Parses a persona description position from a string or number value.
 * @param {string|number|undefined} value Position value (name or number)
 * @returns {number|null} Parsed position value, or null if invalid/undefined
 */
function parsePersonaPosition(value: string | number | undefined | null): number | null {
    if (value === undefined || value === null) return null;
    const strValue = String(value).toLowerCase();
    const nameMap = POSITION_NAME_MAP as Record<string, number | undefined>;
    if (strValue in nameMap) return nameMap[strValue] ?? null;
    const numValue = Number(value);
    if (!isNaN(numValue) && (Object.values(persona_description_positions) as number[]).includes(numValue)) return numValue;
    return null;
}

/**
 * Parses a persona description role from a string or number value.
 * @param {string|number|undefined} value Role value (name or number)
 * @returns {number|null} Parsed role value, or null if invalid/undefined
 */
function parsePersonaRole(value: string | number | undefined | null): number | null {
    if (value === undefined || value === null) return null;
    const strValue = String(value).toLowerCase();
    const nameMap = ROLE_NAME_MAP as Record<string, number | undefined>;
    if (strValue in nameMap) return nameMap[strValue] ?? null;
    const numValue = Number(value);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 2) return numValue;
    return null;
}

/**
 * Uploads base64 avatar data to a persona, optionally showing a crop dialog.
 * @param {string} avatarId The persona's avatar file name
 * @param {string} base64Data Base64 data URL of the image
 * @param {object} [options] Options
 * @param {boolean} [options.resizePrompt] Whether to show the crop dialog
 * @returns {Promise<boolean>} True if upload was successful
 */
async function uploadPersonaAvatar(avatarId: string, base64Data: string, { resizePrompt = false }: { resizePrompt?: boolean } = {}) {
    if (!base64Data || !avatarId) return false;

    let finalImageData = base64Data;

    if (resizePrompt && !power_user.never_resize_avatars) {
        const dlg = new Popup(t`Set the crop position of the avatar image`, POPUP_TYPE.CROP, '', { cropImage: base64Data } as Record<string, unknown>);
        const croppedImage = await dlg.show();
        if (!croppedImage) return false;
        finalImageData = String(croppedImage);
    }

    try {
        const response = await fetch(finalImageData);
        const blob = await response.blob();
        const file = new File([blob], 'avatar.png', { type: 'image/png' });
        const formData = new FormData();
        formData.append('avatar', file);
        formData.append('overwrite_name', avatarId);

        const uploadResponse = await fetch('/api/avatars/upload', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
            cache: 'no-cache',
            body: formData,
        });

        if (!uploadResponse.ok) {
            throw new Error(`Upload failed: ${uploadResponse.statusText}`);
        }

        // Cache bust for the updated avatar
        await fetch(getUserAvatar(avatarId), { cache: 'reload' });
        await fetch(getThumbnailUrl('persona', avatarId), { cache: 'reload' });
        reloadUserAvatar(true);
        return true;
    } catch (error) {
        console.error('Error uploading persona avatar:', error);
        notyf.warning(t`Failed to upload avatar: ${(error as Error).message}`);
        return false;
    }
}

/**
 * Resolves a persona from the given argument or falls back to the currently active persona.
 * @param {string} [personaArg] Persona name or avatar key argument
 * @returns {import('./utils.js').PersonaViewModel|null} The resolved persona, or null if not found
 */
function getTargetPersona(personaArg?: string) {
    if (personaArg) {
        const persona = findPersona({ name: personaArg });
        if (!persona) {
            notyf.warning(t`Persona "${personaArg}" not found`);
            return null;
        }
        return persona;
    }

    // Fall back to currently active persona
    const persona = findPersona({ preferCurrentPersona: true });
    if (!persona) {
        notyf.warning(t`No persona selected and no persona argument provided`);
        return null;
    }
    return persona;
}

// #endregion

// #region Persona CRUD Slash Command Callbacks

/**
 * Creates a new persona with the specified attributes.
 * @param {object} args Named arguments from the slash command
 * @returns {Promise<string>} Avatar key of the created persona, or empty string on failure
 */
async function createPersonaCallback(args: Record<string, unknown>) {
    const name = args.name;
    if (!name || typeof name !== 'string' || !name.trim()) {
        notyf.warning(t`Persona name is required`);
        return '';
    }

    const trimmedName = name.trim();
    const avatarId = `${Date.now()}-${trimmedName.replace(/[^a-zA-Z0-9]/g, '')}.png`;

    const description = (args.description ?? '') as string;
    const title = (args.title ?? '') as string;
    const position = parsePersonaPosition(args.descriptionPosition as string) ?? persona_description_positions.IN_PROMPT;
    const role = parsePersonaRole(args.descriptionRole as string) ?? DEFAULT_ROLE;
    const lorebook = (args.lorebook ?? '') as string;

    let depth = args.descriptionDepth !== undefined ? Number(args.descriptionDepth as string) : DEFAULT_DEPTH;
    if (isNaN(depth)) {
        notyf.warning(t`Invalid description depth "${args.descriptionDepth as string}", defaulting to ${DEFAULT_DEPTH}`);
        depth = DEFAULT_DEPTH;
    }

    // Initialize persona data with all fields
    await initPersona(avatarId, trimmedName, description, title, {
        position, depth, role, lorebook,
    });

    // Handle avatar upload
    const avatarData = args.avatar ? await resolveAvatarData(args.avatar) : null;
    if (avatarData) {
        const resizePrompt = !isFalseBoolean(args.avatarPromptResize ?? 'true');
        const uploaded = await uploadPersonaAvatar(avatarId, avatarData as string, { resizePrompt });
        if (!uploaded) {
            // Crop was cancelled or upload failed — use default avatar
            await uploadUserAvatar(default_user_avatar, avatarId);
        }
    } else {
        await uploadUserAvatar(default_user_avatar, avatarId);
    }

    saveSettingsDebounced();
    await getUserAvatars(true, avatarId);

    // Select/activate if requested (default: true)
    if (!isFalseBoolean(args.select ?? 'true')) {
        await setUserAvatar(avatarId);
    }

    notyf.success(t`Persona "${trimmedName}" created successfully`);
    return avatarId;
}

/**
 * Updates an existing persona's attributes.
 * @param {object} args Named arguments from the slash command
 * @returns {Promise<string>} Avatar key of the updated persona, or empty string on failure
 */
async function updatePersonaCallback(args: Record<string, unknown>) {
    const persona = getTargetPersona(args.persona as string | undefined);
    if (!persona) return '';

    const avatarId = persona.avatar ?? '';
    const personaDescsMap = power_user.persona_descriptions as Record<string, Record<string, unknown> | undefined>;
    const descriptor = personaDescsMap[avatarId];

    if (!descriptor) {
        notyf.warning(t`Persona data not found for "${persona.name}"`);
        return '';
    }

    let hasUpdates = false;

    // Update name
    if (args.name !== undefined) {
        const newName = String(args.name).trim();
        if (newName) {
            const personasMap = power_user.personas as Record<string, string | undefined>;
            const oldName = personasMap[avatarId];
            (power_user.personas as Record<string, string>)[avatarId] = newName;
            if (avatarId === user_avatar) {
                setUserName(newName);
            }
            await eventSource.emit(event_types.PERSONA_RENAMED, { avatarId, oldName, newName });
            hasUpdates = true;
        }
    }

    // Update description
    if (args.description !== undefined) {
        descriptor.description = args.description as string;
        if (avatarId === user_avatar) {
            power_user.persona_description = args.description as string;
        }
        hasUpdates = true;
    }

    // Update title
    if (args.title !== undefined) {
        descriptor.title = args.title as string;
        hasUpdates = true;
    }

    // Update description position
    if (args.descriptionPosition !== undefined) {
        const position = parsePersonaPosition(args.descriptionPosition as string);
        if (position !== null) {
            descriptor.position = position;
            if (avatarId === user_avatar) {
                power_user.persona_description_position = position;
            }
            hasUpdates = true;
        }
    }

    // Update description depth
    if (args.descriptionDepth !== undefined) {
        const depth = Number(args.descriptionDepth);
        if (!isNaN(depth)) {
            descriptor.depth = depth;
            if (avatarId === user_avatar) {
                power_user.persona_description_depth = depth;
            }
            hasUpdates = true;
        }
    }

    // Update description role
    if (args.descriptionRole !== undefined) {
        const role = parsePersonaRole(args.descriptionRole as string | number | null | undefined);
        if (role !== null) {
            descriptor.role = role;
            if (avatarId === user_avatar) {
                power_user.persona_description_role = role;
            }
            hasUpdates = true;
        }
    }

    // Update lorebook
    if (args.lorebook !== undefined) {
        descriptor.lorebook = args.lorebook as string;
        if (avatarId === user_avatar) {
            power_user.persona_description_lorebook = args.lorebook as string;
        }
        hasUpdates = true;
    }

    // Handle avatar
    const avatarData = args.avatar ? await resolveAvatarData(args.avatar) : null;
    if (avatarData) {
        const resizePrompt = !isFalseBoolean(args.avatarPromptResize ?? 'true');
        const uploaded = await uploadPersonaAvatar(avatarId, avatarData as string, { resizePrompt });
        if (uploaded) {
            hasUpdates = true;
        }
    }

    if (!hasUpdates) {
        notyf.info(t`No fields provided to update`);
        return avatarId;
    }

    saveSettingsDebounced();
    await eventSource.emit(event_types.PERSONA_UPDATED, avatarId);

    // Refresh UI if the updated persona is the active one
    if (avatarId === user_avatar) {
        setPersonaDescription();
    }
    await getUserAvatars(true, avatarId);
    updatePersonaUIStates();

    const upPersonasMap = power_user.personas as Record<string, string | undefined>;
    notyf.success(t`Persona "${upPersonasMap[avatarId]}" updated successfully`);
    return avatarId;
}

/**
 * Retrieves persona data or a specific field.
 * @param {object} args Named arguments from the slash command
 * @returns {Promise<string>} The persona data or field value
 */
async function getPersonaDataCallback(args: Record<string, unknown>) {
    const persona = getTargetPersona(args.persona as string | undefined);
    if (!persona) return '';

    const avatarId = persona.avatar;
    const personaDescsMap = power_user.persona_descriptions as Record<string, Record<string, unknown> | undefined>;
    const descriptor = personaDescsMap[avatarId] ?? {};

    if (args.field) {
        const personasMap = power_user.personas as Record<string, string | undefined>;
        const fieldMap: Record<string, unknown> = {
            name: personasMap[avatarId] ?? '',
            description: descriptor.description ?? '',
            title: descriptor.title ?? '',
            position: descriptor.position ?? persona_description_positions.IN_PROMPT,
            depth: descriptor.depth ?? DEFAULT_DEPTH,
            role: descriptor.role ?? DEFAULT_ROLE,
            lorebook: descriptor.lorebook ?? '',
            avatar: avatarId,
            default: power_user.default_persona === avatarId,
            connections: descriptor.connections ?? [],
        };

        const value = fieldMap[args.field as string];
        if (value === undefined) {
            notyf.warning(t`Unknown persona field "${args.field as string}"`);
            return '';
        }

        return await slashCommandReturnHelper.doReturn(
            (args.return as string) ?? 'pipe', value,
            { objectToStringFunc: (x: unknown) => typeof x === 'object' ? JSON.stringify(x) : String(x) },
        );
    }

    // Return full persona data
    const personasMap2 = power_user.personas as Record<string, string | undefined>;
    const personaData = {
        avatar: avatarId,
        name: personasMap2[avatarId] ?? '',
        description: descriptor.description ?? '',
        title: descriptor.title ?? '',
        position: descriptor.position ?? persona_description_positions.IN_PROMPT,
        depth: descriptor.depth ?? DEFAULT_DEPTH,
        role: descriptor.role ?? DEFAULT_ROLE,
        lorebook: descriptor.lorebook ?? '',
        default: power_user.default_persona === avatarId,
        connections: descriptor.connections ?? [],
    };

    return await slashCommandReturnHelper.doReturn(
        (args.return as string) ?? 'pipe', personaData,
        { objectToStringFunc: (x: unknown) => JSON.stringify(x, null, 2) },
    );
}

/**
 * Deletes a persona via slash command.
 * @param {object} args Named arguments from the slash command
 * @returns {Promise<string>} 'true' if deleted, 'false' otherwise
 */
async function deletePersonaCallback(args: Record<string, unknown>) {
    const persona = getTargetPersona(args.persona as string | undefined);
    if (!persona) return 'false';

    const silent = isTrueBoolean(args.silent);
    const success = await deletePersona(persona.avatar, { silent });
    return String(success);
}

/**
 * Duplicates a persona via slash command.
 * @param {object} args Named arguments from the slash command
 * @returns {Promise<string>} Avatar key of the duplicated persona, or empty string on failure
 */
async function duplicatePersonaCallback(args: Record<string, unknown>) {
    const persona = getTargetPersona(args.persona as string | undefined);
    if (!persona) return '';

    const shouldSelect = isTrueBoolean(args.select);
    const newAvatarId = await duplicatePersona(persona.avatar, { silent: true, select: shouldSelect });

    if (!newAvatarId) {
        notyf.error(t`Failed to duplicate persona`);
        return '';
    }

    const dupPersonasMap = power_user.personas as Record<string, string | undefined>;
    notyf.success(t`Persona "${dupPersonasMap[newAvatarId]}" duplicated successfully`);
    return newAvatarId;
}

// #endregion

/**
 * Locks or unlocks the persona of the current chat.
 * @param {{type: string}} _args Named arguments
 * @param {string} value The value to set the lock to
 * @returns {Promise<string>} The value of the lock after setting
 */
async function lockPersonaCallback(_args: Record<string, string>, value: string) {
    const type = /** @type {'chat' | 'character' | 'default'} */ (_args.type ?? 'chat');

    if (!['chat', 'character', 'default'].includes(type)) {
        notyf.warning(t`Unknown lock type "${type}"`, t`Persona Management`);
        return '';
    }

    if (!value) {
        return String(isPersonaLocked(type));
    }

    if (['toggle', 't'].includes(value.trim().toLowerCase())) {
        const result = await togglePersonaLock(type);
        return String(result);
    }

    if (isTrueBoolean(value)) {
        await setPersonaLockState(true, type);
        return 'true';
    }

    if (isFalseBoolean(value)) {
        await setPersonaLockState(false, type);
        return 'false';
    }

    return '';
}

/**
 * Sets a persona name and optionally an avatar.
 * @param {{mode: 'lookup' | 'temp' | 'all'}} namedArgs Named arguments
 * @param {string} name Name to set
 * @returns {Promise<string>}
 */
async function setNameCallback({ mode = 'all' }: { mode?: string }, name: string) {
    if (!name) {
        notyf.warning('You must specify a name to change to');
        return '';
    }

    if (!['lookup', 'temp', 'all'].includes(mode)) {
        notyf.warning('Mode must be one of "lookup", "temp" or "all"');
        return '';
    }

    name = name.trim();

    // If the name matches a persona avatar, or a name, auto-select it
    if (['lookup', 'all'].includes(mode)) {
        const persona = findPersona({ name });
        if (persona) {
            await autoSelectPersona(persona.name, { personaKey: persona.avatar });
            return '';
        } else if (mode === 'lookup') {
            notyf.warning(`Persona ${name} not found`);
            return '';
        }
    }

    if (['temp', 'all'].includes(mode)) {
        // Otherwise, set just the name
        setUserName(name); //this prevented quickReply usage
    }

    return '';
}

/**
 *
 * @param args
 * @param value
 */
async function syncCallback(args: Record<string, unknown> | undefined, value: string) {
    const range = value ? stringToRange(value, 0, chat.length - 1) : null;

    if (value && !range) {
        console.warn(`WARN: Invalid range provided for /persona-sync command: ${value}`);
        return '';
    }

    const quiet = !isFalseBoolean(args?.quiet);
    const nameFilter = typeof args?.from === 'string' ? args.from.trim() : '';
    const start = range ? range.start : 0;
    const end = range ? range.end : chat.length - 1;

    await syncUserNameToPersona({ start, end, quiet, nameFilter });

    return '';
}

/**
 * Returns all unique user message names in the current chat for enum autocomplete.
 * @returns {SlashCommandEnumValue[]}
 */
function userMessageNamesEnumProvider(): SlashCommandEnumValue[] {
    return chat
        .filter((mes: ChatMessage) => mes.is_user)
        .map((mes: ChatMessage) => mes.name)
        .filter((name): name is string => !!name)
        .filter(onlyUnique)
        .sort(sortIgnoreCaseAndAccents)
        .map((name: string) => new SlashCommandEnumValue(name, null, enumTypes.name, enumIcons.persona));
}

/**
 *
 */
function registerPersonaSlashCommands() {
    // Shared persona field definitions for persona CRUD commands
    const getPersonaFieldArgs = ({ requiredFields = [] as string[] } = {}) => [
        SlashCommandNamedArgument.fromProps({
            name: 'name',
            description: t`The name of the persona`,
            typeList: [ARGUMENT_TYPE.STRING],
            isRequired: requiredFields.includes('name'),
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'description',
                    description: t`The persona description (sent with messages for AI context)`,
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: requiredFields.includes('description'),
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'title',
                    description: t`A display title for the persona (not sent to the AI, display only)`,
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: requiredFields.includes('title'),
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'avatar',
                    description: t`Avatar image. Use "prompt" to open file picker, or provide a local ST file path or base64 data URL. Can also be the return value of /imagine.`,
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: requiredFields.includes('avatar'),
                    enumList: [
                        new SlashCommandEnumValue('prompt', 'Open file picker to select an image', enumTypes.enum, '📁'),
                        new SlashCommandEnumValue('characters/...', 'Character avatars path (e.g., characters/Name.png)', enumTypes.enum, '📄', (input: string) => commonEnumMatchProviders.folderEnum(input, 'characters/') as SlashCommandEnumValue[], () => 'characters/'),
                        new SlashCommandEnumValue('backgrounds/...', 'Background image path', enumTypes.enum, '📄', (input: string) => commonEnumMatchProviders.folderEnum(input, 'backgrounds/') as SlashCommandEnumValue[], () => 'backgrounds/'),
                        new SlashCommandEnumValue('User Avatars/...', 'User avatar path', enumTypes.enum, '📄', (input: string) => commonEnumMatchProviders.folderEnum(input, 'User Avatars/') as SlashCommandEnumValue[], () => 'User Avatars/'),
                        new SlashCommandEnumValue('assets/...', 'Asset file path', enumTypes.enum, '📄', (input: string) => commonEnumMatchProviders.folderEnum(input, 'assets/') as SlashCommandEnumValue[], () => 'assets/'),
                        new SlashCommandEnumValue('user/images/...', 'User image path', enumTypes.enum, '📄', (input: string) => commonEnumMatchProviders.folderEnum(input, 'user/images/') as SlashCommandEnumValue[], () => 'user/images/'),
                    ],
                }),
        SlashCommandNamedArgument.fromProps({
            name: 'avatarPromptResize',
            description: t`Whether to show the avatar resize/crop dialog when uploading. Ignored if "Never resize avatars" is enabled in settings.`,
            typeList: [ARGUMENT_TYPE.BOOLEAN],
            defaultValue: 'true',
            enumProvider: commonEnumProviders.boolean('trueFalse'),
        }),
        SlashCommandNamedArgument.fromProps({
            name: 'descriptionPosition',
            description: t`Where to inject the persona description in the prompt`,
            typeList: [ARGUMENT_TYPE.STRING],
            enumList: [
                new SlashCommandEnumValue('inPrompt', t`In Prompt (default)`, enumTypes.enum),
                new SlashCommandEnumValue('topAN', t`Top of Author's Note`, enumTypes.enum),
                new SlashCommandEnumValue('bottomAN', t`Bottom of Author's Note`, enumTypes.enum),
                new SlashCommandEnumValue('atDepth', t`At a specific depth (uses descriptionDepth and descriptionRole)`, enumTypes.enum),
                new SlashCommandEnumValue('none', t`None (don't inject)`, enumTypes.enum),
            ],
        }),
        SlashCommandNamedArgument.fromProps({
            name: 'descriptionDepth',
            description: t`Depth for the persona description (when position is "atDepth")`,
            typeList: [ARGUMENT_TYPE.NUMBER],
        }),
        SlashCommandNamedArgument.fromProps({
            name: 'descriptionRole',
            description: t`Role for the persona description (when position is "atDepth")`,
            typeList: [ARGUMENT_TYPE.STRING],
            enumList: commonEnumProviders.messageRoles(),
        }),
        SlashCommandNamedArgument.fromProps({
            name: 'lorebook',
            description: t`The name of the lorebook/world info to attach to this persona`,
            typeList: [ARGUMENT_TYPE.STRING],
            enumProvider: commonEnumProviders.worlds,
        }),
    ];

    // Shared persona target argument (for commands that operate on an existing persona)
    const personaTargetArg = SlashCommandNamedArgument.fromProps({
        name: 'persona',
        description: t`Persona name or avatar key. If not provided, uses the currently active persona.`,
        typeList: [ARGUMENT_TYPE.STRING],
        enumProvider: commonEnumProviders.personas({ allowPersonaKey: true }),
    });

    // ========================
    // New CRUD commands
    // ========================

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'persona-create',
        callback: createPersonaCallback,
        returns: t`the avatar key (unique identifier) of the created persona`,
        namedArgumentList: [
                    ...(getPersonaFieldArgs({ requiredFields: ['name'] }) as SlashCommandNamedArgument[]),
            SlashCommandNamedArgument.fromProps({
                name: 'select',
                description: t`Whether to select/activate the persona after creation`,
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'true',
                enumProvider: commonEnumProviders.boolean('trueFalse'),
            }),
        ],
        helpString: `
        <div>
            ${t`Creates a new persona with the specified attributes. Returns the avatar key of the created persona.`}
        </div>
        <div>
            <strong>${t`Required arguments:`}</strong>
            <ul>
                <li><code>name</code> – ${t`The persona's display name.`}</li>
            </ul>
        </div>
        <div>
            <strong>${t`Note on avatar:`}</strong>
            ${t`The <code>avatar</code> argument accepts <code>prompt</code> to open a file picker, a local ST file path, or a base64 data URL. Can also be the return value of <code>/imagine</code>. If not provided, a default avatar will be used.`}
        </div>
        <div>
            <strong>${t`Example:`}</strong>
            <ul>
                <li>
                    <pre><code>/persona-create name="Alice" description="A curious adventurer"</code></pre>
                </li>
                <li>
                    <pre><code>/persona-create name="Bob" avatar=prompt lorebook="detective_lore" select=false</code></pre>
                </li>
                <li>
                    <pre><code>/imagine portrait of an elf | /persona-create name="Elf" avatar="{{pipe}}"</code></pre>
                </li>
            </ul>
        </div>
        `,
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'persona-update',
        callback: updatePersonaCallback,
        returns: t`the avatar key of the updated persona`,
        namedArgumentList: [
            personaTargetArg,
            ...getPersonaFieldArgs(),
        ],
        helpString: `
        <div>
            ${t`Updates an existing persona's attributes. Only the provided fields are changed; others are left untouched.`}
        </div>
        <div>
            ${t`If no <code>persona</code> argument is provided, updates the currently active persona.`}
        </div>
        <div>
            <strong>${t`Example:`}</strong>
            <ul>
                <li>
                    <pre><code>/persona-update description="An updated description"</code></pre>
                    ${t`Updates the current persona's description.`}
                </li>
                <li>
                    <pre><code>/persona-update persona="Alice" name="Alice 2.0" descriptionPosition=atDepth descriptionDepth=3</code></pre>
                    ${t`Renames Alice and sets her description to inject at depth 3.`}
                </li>
                <li>
                    <pre><code>/imagine portrait | /persona-update avatar="{{pipe}}"</code></pre>
                    ${t`Generates an image and sets it as the current persona's avatar.`}
                </li>
            </ul>
        </div>
        `,
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'persona-get',
        aliases: ['persona-data'],
        callback: getPersonaDataCallback,
        returns: t`persona data as JSON or a specific field value`,
        namedArgumentList: [
            personaTargetArg,
            SlashCommandNamedArgument.fromProps({
                name: 'field',
                description: t`Specific field to retrieve. If not provided, returns the entire persona data as JSON.`,
                typeList: [ARGUMENT_TYPE.STRING],
                enumList: [
                    new SlashCommandEnumValue('name', t`Persona name`, enumTypes.enum, enumIcons.persona),
                    new SlashCommandEnumValue('description', t`Persona description`, enumTypes.enum, enumIcons.default),
                    new SlashCommandEnumValue('title', t`Display title`, enumTypes.enum, enumIcons.default),
                    new SlashCommandEnumValue('position', t`Description position (numeric)`, enumTypes.enum, enumIcons.default),
                    new SlashCommandEnumValue('depth', t`Description depth`, enumTypes.enum, enumIcons.default),
                    new SlashCommandEnumValue('role', t`Description role (numeric)`, enumTypes.enum, enumIcons.default),
                    new SlashCommandEnumValue('lorebook', t`Attached lorebook name`, enumTypes.enum, enumIcons.world),
                    new SlashCommandEnumValue('avatar', t`Avatar filename (unique key)`, enumTypes.enum, enumIcons.persona),
                    new SlashCommandEnumValue('default', t`Whether this is the default persona`, enumTypes.enum, enumIcons.default),
                    new SlashCommandEnumValue('connections', t`Character/group connections (array)`, enumTypes.enum, enumIcons.character),
                ],
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'return',
                description: t`The way to return the result`,
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'pipe',
                enumList: slashCommandReturnHelper.enumList({ allowPipe: true, allowObject: true, allowPopup: true, allowTextVersion: false }),
            }),
        ],
        helpString: `
        <div>
            ${t`Retrieves persona data. Can return all data as JSON or a specific field value.`}
        </div>
        <div>
            ${t`If no <code>persona</code> argument is provided, uses the currently active persona.`}
        </div>
        <div>
            <strong>${t`Example:`}</strong>
            <ul>
                <li>
                    <pre><code>/persona-get field=description | /echo</code></pre>
                    ${t`Outputs the current persona's description.`}
                </li>
                <li>
                    <pre><code>/persona-get persona="Alice" field=name</code></pre>
                    ${t`Returns Alice's persona name.`}
                </li>
                <li>
                    <pre><code>/persona-get return=object | /json-get key=avatar</code></pre>
                    ${t`Returns the current persona's full data as an object, then extracts the avatar key.`}
                </li>
            </ul>
        </div>
        `,
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'persona-delete',
        callback: deletePersonaCallback,
        returns: t`true if the persona was deleted, false otherwise`,
        namedArgumentList: [
            personaTargetArg,
            SlashCommandNamedArgument.fromProps({
                name: 'silent',
                description: t`Skip the confirmation popup`,
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
                enumProvider: commonEnumProviders.boolean('trueFalse'),
            }),
        ],
        helpString: `
        <div>
            ${t`Deletes a persona and its avatar from the system.`}
        </div>
        <div>
            ${t`If no <code>persona</code> argument is provided, deletes the currently active persona.`}
        </div>
        <div>
            <strong>⚠️ ${t`Warning:`}</strong> ${t`This action is irreversible. All data associated with the persona will be lost.`}
        </div>
        <div>
            <strong>${t`Example:`}</strong>
            <ul>
                <li>
                    <pre><code>/persona-delete</code></pre>
                    ${t`Deletes the current persona (shows confirmation popup).`}
                </li>
                <li>
                    <pre><code>/persona-delete persona="Bob" silent=true</code></pre>
                    ${t`Deletes Bob without confirmation.`}
                </li>
            </ul>
        </div>
        `,
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'persona-duplicate',
        callback: duplicatePersonaCallback,
        returns: t`the avatar key (unique identifier) of the duplicated persona`,
        namedArgumentList: [
            personaTargetArg,
            SlashCommandNamedArgument.fromProps({
                name: 'select',
                description: t`Whether to select/activate the duplicated persona after creation`,
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
                enumProvider: commonEnumProviders.boolean('trueFalse'),
            }),
        ],
        helpString: `
        <div>
            ${t`Duplicates a persona including all its data and avatar. Returns the avatar key of the new persona.`}
        </div>
        <div>
            ${t`Use <code>/persona-update</code> afterwards to rename or modify the duplicated persona's fields.`}
        </div>
        <div>
            <strong>${t`Example:`}</strong>
            <ul>
                <li>
                    <pre><code>/persona-duplicate</code></pre>
                    ${t`Duplicates the currently active persona.`}
                </li>
                <li>
                    <pre><code>/persona-duplicate persona="Alice" select=true</code></pre>
                    ${t`Duplicates Alice and selects the new persona.`}
                </li>
                <li>
                    <pre><code>/persona-duplicate | /persona-update persona="{{pipe}}" name="Clone"</code></pre>
                    ${t`Duplicates the current persona, then renames the clone.`}
                </li>
            </ul>
        </div>
        `,
    }));

    // ========================
    // Existing commands (enhanced help strings)
    // ========================

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'persona-lock',
        aliases: ['lock', 'bind'],
        callback: lockPersonaCallback,
        returns: t`The current lock state for the given type`,
        helpString: `
        <div>
            ${t`Locks/unlocks the current persona to a chat, character, or as the default. Returns the lock state if no value is provided.`}
        </div>
        <div>
            <strong>${t`Example:`}</strong>
            <ul>
                <li><pre><code>/persona-lock on</code></pre> ${t`Locks persona to this chat.`}</li>
                <li><pre><code>/persona-lock type=character on</code></pre> ${t`Locks persona to the current character.`}</li>
                <li><pre><code>/persona-lock type=default on</code></pre> ${t`Sets persona as the default for new chats.`}</li>
                <li><pre><code>/persona-lock</code></pre> ${t`Returns whether the persona is locked to this chat.`}</li>
            </ul>
        </div>
        `,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'type',
                description: t`The type of the lock, where it should apply to`,
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'chat',
                enumList: [
                    new SlashCommandEnumValue('chat', t`Lock the persona to the current chat.`),
                    new SlashCommandEnumValue('character', t`Lock this persona to the currently selected character. If the setting is enabled, multiple personas can be locked to the same character.`),
                    new SlashCommandEnumValue('default', t`Lock this persona as the default persona for all new chats.`),
                ],
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'state',
                typeList: [ARGUMENT_TYPE.STRING],
                enumProvider: commonEnumProviders.boolean('onOffToggle'),
            }),
        ],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'persona-set',
        callback: setNameCallback,
        aliases: ['persona', 'name'],
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'mode',
                description: t`The mode for persona selection`,
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'all',
                enumList: [
                    new SlashCommandEnumValue('lookup', t`Search for an existing persona only`),
                    new SlashCommandEnumValue('temp', t`Set a temporary name only (no persona lookup)`),
                    new SlashCommandEnumValue('all', t`Try persona lookup first, fall back to temporary name`),
                ],
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'persona name',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: commonEnumProviders.personas({ allowPersonaKey: true }),
            }),
        ],
        helpString: `
        <div>
            ${t`Selects an existing persona by name or avatar key, or sets a temporary user name.`}
        </div>
        <div>
            ${t`If a matching persona exists, it will be selected with its name and avatar. Otherwise (in "all" or "temp" mode), only the display name is changed temporarily.`}
        </div>
        <div>
            <strong>${t`Example:`}</strong>
            <ul>
                <li><pre><code>/persona-set Alice</code></pre> ${t`Selects persona "Alice", or sets name to "Alice" if not found.`}</li>
                <li><pre><code>/persona-set mode=lookup Alice</code></pre> ${t`Only selects if persona "Alice" exists.`}</li>
            </ul>
        </div>
        `,
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'persona-sync',
        aliases: ['sync'],
        callback: syncCallback,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'from',
                description: t`only sync messages from a certain persona name`,
                typeList: [ARGUMENT_TYPE.STRING],
                enumProvider: userMessageNamesEnumProvider,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'quiet',
                description: t`suppress the confirmation popup`,
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                enumList: commonEnumProviders.boolean('trueFalse')(),
                defaultValue: 'true',
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: t`message index (starts with 0) or range, syncs all user messages if not provided`,
                typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.RANGE],
                defaultValue: '0-{{lastMessageId}}',
            }),
        ],
        helpString: `
        <div>
            ${t`Syncs the user persona (name and avatar) in user-attributed messages in the current chat.`}
        </div>
        <div>
            ${t`If <code>from</code> is set, only messages with that specific persona name will be synced. Useful when multiple personas have been used in the same chat.`}
        </div>
        <div>
            ${t`If <code>quiet</code> is set to <code>false</code>, a confirmation popup will be shown before syncing.`}
        </div>
        <div>
            <strong>${t`Examples:`}</strong>
            <ul>
                <li><pre><code>/persona-sync</code></pre> ${t`- Sync all user messages`}</li>
                <li><pre><code>/persona-sync 5</code></pre> ${t`- Sync only message 5`}</li>
                <li><pre><code>/persona-sync 0-10</code></pre> ${t`- Sync messages 0 through 10`}</li>
                <li><pre><code>/persona-sync from=OldPersona 0-20</code></pre> ${t`- Sync only messages with name "OldPersona" in range 0-20`}</li>
                <li><pre><code>/persona-sync quiet=false</code></pre> ${t`- Sync all with confirmation popup`}</li>
                <li><pre><code>/persona-sync from=TempName quiet=false 5-15</code></pre> ${t`- Sync messages with name "TempName" in range 5-15 with confirmation`}</li>
            </ul>
        </div>
    `,
    }));
}

/**
 * Initializes the persona management and all its functionality.
 * This is called during the initialization of the page.
 */
export async function initPersonas() {
    await migrateNonPersonaUser();
    registerPersonaSlashCommands();
    document.getElementById('persona_delete_button')?.addEventListener('click', deleteUserAvatar);
    document.getElementById('lock_persona_default')?.addEventListener('click', () => togglePersonaLock('default'));
    document.getElementById('lock_user_name')?.addEventListener('click', () => togglePersonaLock('chat'));
    document.getElementById('lock_persona_to_char')?.addEventListener('click', () => togglePersonaLock('character'));
    document.getElementById('create_dummy_persona')?.addEventListener('click', createDummyPersona);
    document.getElementById('persona_description')?.addEventListener('input', onPersonaDescriptionInput);
    document.getElementById('persona_description_position')?.addEventListener('input', onPersonaDescriptionPositionInput);
    document.getElementById('persona_depth_value')?.addEventListener('input', onPersonaDescriptionDepthValueInput);
    document.getElementById('persona_depth_role')?.addEventListener('input', onPersonaDescriptionDepthRoleInput);
    document.getElementById('persona_lore_button')?.addEventListener('click', onPersonaLoreButtonClick);
    addLongPressEvent('#persona_lore_button', function () {
        onPersonaLoreButtonClick({ shiftKey: true, altKey: false });
    });
    document.getElementById('persona-management-dropdown')?.addEventListener('change', async function (this: HTMLSelectElement) {
        const target = this.querySelector('option:checked')?.id;
        this.selectedIndex = 0;
        switch (target) {
            case 'persona_lorebook_link':
                await onPersonaLoreButtonClick({ shiftKey: true, altKey: false });
                break;
        }
    });
    document.getElementById('personas_backup')?.addEventListener('click', onBackupPersonas);
    document.getElementById('personas_restore')?.addEventListener('click', () => document.getElementById('personas_restore_input')?.click());
    document.getElementById('personas_restore_input')?.addEventListener('change', onPersonasRestoreInput);
    const personaSortOrderEl = document.getElementById('persona_sort_order') as HTMLSelectElement | null;
    if (personaSortOrderEl) {
        personaSortOrderEl.value = power_user.persona_sort_order;
        personaSortOrderEl.addEventListener('input', function (this: HTMLSelectElement) {
            const value = String(this.value);
            // Save sort order, but do not save search sorting, as this is a temporary sorting option
            if (value !== 'search') power_user.persona_sort_order = value;
            getUserAvatars(true, user_avatar);
            saveSettingsDebounced();
        });
    }
    document.getElementById('persona_grid_toggle')?.addEventListener('click', () => {
        const state = accountStorage.getItem(GRID_STORAGE_KEY) === 'true';
        accountStorage.setItem(GRID_STORAGE_KEY, String(!state));
        switchPersonaGridView();
    });

    const debouncedPersonaSearch = debounce((searchQuery: string) => {
        personasFilter.setFilterData(FILTER_TYPES.PERSONA_SEARCH, searchQuery);
    });

    document.getElementById('persona_search_bar')?.addEventListener('input', function (this: HTMLInputElement) {
        const searchQuery = String(this.value);
        debouncedPersonaSearch(searchQuery);
    });

    document.getElementById('sync_name_button')?.addEventListener('click', async () => await syncUserNameToPersona());
    document.getElementById('avatar_upload_file')?.addEventListener('change', changeUserAvatar);

    document.addEventListener('click', async function (e) {
        if (!(e.target instanceof Element)) return;
        const el = e.target.closest('#user_avatar_block .avatar-container');
        if (!el) return;
        const imgfile = el.getAttribute('data-avatar-id');
        if (imgfile) await setUserAvatar(imgfile);
    });

    document.getElementById('persona_rename_button')?.addEventListener('click', () => renamePersona(user_avatar));

    document.addEventListener('click', function (e) {
        if (!(e.target instanceof Element)) return;
        const el = e.target.closest('#user_avatar_block .avatar_upload');
        if (!el) return;
        (document.getElementById('avatar_upload_overwrite') as HTMLInputElement).value = '';
        document.getElementById('avatar_upload_file')?.click();
    });

    document.getElementById('persona_duplicate_button')?.addEventListener('click', () => duplicatePersona(user_avatar));

    document.getElementById('persona_set_image_button')?.addEventListener('click', function () {
        if (!user_avatar) {
            console.log('no imgfile');
            return;
        }

            (document.getElementById('avatar_upload_overwrite') as HTMLInputElement).value = user_avatar;
        document.getElementById('avatar_upload_file')?.click();
    });

    document.getElementById('char_connections_button')?.addEventListener('click', showCharConnections);

    eventSource.on(event_types.CHARACTER_MANAGEMENT_DROPDOWN, (target: unknown) => {
        if (target === 'convert_to_persona') {
            convertCharacterToPersona();
        }
    });
    eventSource.on(event_types.CHAT_CHANGED, updatePersonaUIStates);
    eventSource.on(event_types.CHAT_CHANGED, loadPersonaForCurrentChat);
    switchPersonaGridView();
}
