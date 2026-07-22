'use strict';

import {
    characterGroupOverlay,
    characters,
    event_types,
    eventSource,
    getCharacters,
    getRequestHeaders,
    buildAvatarList,
    characterToEntity,
    printCharactersDebounced,
    deleteCharacter,
} from '../script.js';

import { favsToHotswap } from './RossAscends-mods.js';
import { loader } from './action-loader.js';
import { convertCharacterToPersona } from './personas.js';
import { callGenericPopup, POPUP_TYPE } from './popup.js';
import {
    createTagInput,
    getTagKeyForEntity,
    getTagsList,
    printTagList,
    tag_map,
    compareTagsForSort,
    removeTagFromMap,
    importTags,
    tag_import_setting,
} from './tags.js';
import { t } from './i18n.js';

/**
 * Static object representing the actions of the
 * character context menu override.
 */
class CharacterContextMenu {
    /**
     * Tag one or more characters,
     * opens a popup.
     * @param {Array<number>} selectedCharacters Character IDs to tag
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'selectedCharacters' implicitly has an '... Remove this comment to see the full error message
    static tag = (selectedCharacters) => {
        characterGroupOverlay.bulkTagPopupHandler.show(selectedCharacters);
    };

    /**
     * Duplicate one or more characters
     * @param {number} characterId Character ID to duplicate
     * @returns {Promise<object>} The response data from the duplicate API call
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'characterId' implicitly has an 'any' ty... Remove this comment to see the full error message
    static duplicate = async (characterId) => {
        const character = CharacterContextMenu.#getCharacter(characterId);
        const body = { avatar_url: character.avatar };

        const result = await fetch('/api/characters/duplicate', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(body),
        });

        if (!result.ok) {
            throw new Error('Character not duplicated');
        }

        const data = await result.json();
        await eventSource.emit(event_types.CHARACTER_DUPLICATED, {
            oldAvatar: body.avatar_url,
            newAvatar: data.path,
        });
    };

    /**
     * Favorite a character
     * and highlight it.
     * @param {number} characterId Character ID to favorite
     * @returns {Promise<void>}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'characterId' implicitly has an 'any' ty... Remove this comment to see the full error message
    static favorite = async (characterId) => {
        const character = CharacterContextMenu.#getCharacter(characterId);
        const newFavState = !character.data.extensions.fav;

        const data = {
            name: character.name,
            avatar: character.avatar,
            data: {
                extensions: {
                    fav: newFavState,
                },
            },
            fav: newFavState,
        };

        const mergeResponse = await fetch('/api/characters/merge-attributes', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(data),
        });

        if (!mergeResponse.ok) {
            mergeResponse
                .json()
                .then((json) =>
                    notyf.error(
                        `Character not saved. Error: ${json.message}. Field: ${json.error}`,
                    ),
                );
        }

        const element = document.getElementById(`CharID${characterId}`);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        element.classList.toggle('is_fav');
    };

    /**
     * Convert one or more characters to persona,
     * may open a popup for one or more characters.
     * @param {number} characterId Character ID to convert to persona
     * @returns {Promise<void>}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'characterId' implicitly has an 'any' ty... Remove this comment to see the full error message
    static persona = async (characterId) => void (await convertCharacterToPersona(characterId));

    /**
     * Delete one or more characters,
     * opens a popup.
     * @param {string|string[]} characterKey Character key(s) to delete
     * @param {boolean} [deleteChats] Whether to also delete associated chat files
     * @returns {Promise<void>}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'characterKey' implicitly has an 'any' t... Remove this comment to see the full error message
    static delete = async (characterKey, deleteChats = false) => {
        await deleteCharacter(characterKey, { deleteChats: deleteChats });
    };

    // @ts-expect-error TS(7006) FIXME: Parameter 'characterId' implicitly has an 'any' ty... Remove this comment to see the full error message
    static #getCharacter = (characterId) => characters[characterId] ?? null;

    /**
     * Show the context menu at the given position
     * @param {number} positionX X coordinate for the context menu
     * @param {number} positionY Y coordinate for the context menu
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'positionX' implicitly has an 'any' type... Remove this comment to see the full error message
    static show = (positionX, positionY) => {
        const contextMenu = document.getElementById(BulkEditOverlay.contextMenuId);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        contextMenu.style.left = `${positionX}px`;
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        contextMenu.style.top = `${positionY}px`;

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById(BulkEditOverlay.contextMenuId).classList.remove('hidden');

        // Adjust position if context menu is outside of viewport
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const boundingRect = contextMenu.getBoundingClientRect();
        if (boundingRect.right > window.innerWidth) {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            contextMenu.style.left = `${positionX - (boundingRect.right - window.innerWidth)}px`;
        }
        if (boundingRect.bottom > window.innerHeight) {
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            contextMenu.style.top = `${positionY - (boundingRect.bottom - window.innerHeight)}px`;
        }
    };

    /**
     * Hide the context menu
     * @returns {void}
     */
    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    static hide = () =>
        document.getElementById(BulkEditOverlay.contextMenuId).classList.add('hidden');

    /**
     * Sets up the context menu for the given overlay
     * @param {object} characterGroupOverlay The bulk edit overlay instance
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'characterGroupOverlay' implicitly has a... Remove this comment to see the full error message
    constructor(characterGroupOverlay) {
        const contextMenuItems = [
            {
                id: 'character_context_menu_favorite',
                callback: characterGroupOverlay.handleContextMenuFavorite,
            },
            {
                id: 'character_context_menu_duplicate',
                callback: characterGroupOverlay.handleContextMenuDuplicate,
            },
            {
                id: 'character_context_menu_delete',
                callback: characterGroupOverlay.handleContextMenuDelete,
            },
            {
                id: 'character_context_menu_persona',
                callback: characterGroupOverlay.handleContextMenuPersona,
            },
            {
                id: 'character_context_menu_tag',
                callback: characterGroupOverlay.handleContextMenuTag,
            },
        ];

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        contextMenuItems.forEach((contextMenuItem) =>
            document
                .getElementById(contextMenuItem.id)
                .addEventListener('click', contextMenuItem.callback),
        );
    }
}

/**
 * Represents a tag control not bound to a single character
 */
class BulkTagPopupHandler {
    /**
     * The characters for this popup
     * @type {number[]}
     */
    // @ts-expect-error TS(7008) FIXME: Member 'characterIds' implicitly has an 'any' type... Remove this comment to see the full error message
    characterIds;

    /**
     * A storage of the current mutual tags, as calculated by getMutualTags()
     * @type {object[]}
     */
    // @ts-expect-error TS(7008) FIXME: Member 'currentMutualTags' implicitly has an 'any'... Remove this comment to see the full error message
    currentMutualTags;

    /**
     * Sets up the bulk popup menu handler for the given overlay.
     *
     * Characters can be passed in with the show() call.
     */
    constructor() {}

    /**
     * Gets the HTML as a string that is going to be the popup for the bulk tag edit
     * @returns {string} String containing the html for the popup
     */
    #getHtml = () => {
        const characterData = JSON.stringify({ characterIds: this.characterIds });
        return `<div id="bulk_tag_shadow_popup">
            <div id="bulk_tag_popup" class="wider_dialogue_popup">
                <div id="bulk_tag_popup_holder">
                    <h3 class="marginBot5">Modify tags of ${this.characterIds.length} characters</h3>
                    <small class="bulk_tags_desc m-b-1">Add or remove the mutual tags of all selected characters. Import all or existing tags for all selected characters.</small>
                    <div id="bulk_tags_avatars_block" class="avatars_inline avatars_inline_small tags tags_inline"></div>
                    <br>
                    <div id="bulk_tags_div" class="marginBot5" data-characters='${characterData}'>
                        <div class="tag_controls">
                            <input id="bulkTagInput" class="text_pole tag_input wide100p margin0" data-i18n="[placeholder]Search / Create Tags" placeholder="Search / Create tags" maxlength="25" />
                            <div class="tags_view menu_button fa-solid fa-tags" title="View all tags" data-i18n="[title]View all tags"></div>
                        </div>
                        <div id="bulkTagList" class="m-t-1 tags"></div>
                    </div>
                    <div id="dialogue_popup_controls" class="m-t-1">
                        <div id="bulk_tag_popup_reset" class="menu_button" title="Remove all tags from the selected characters" data-i18n="[title]Remove all tags from the selected characters">
                            <i class="fa-solid fa-trash-can margin-right-10px"></i>
                            All
                        </div>
                        <div id="bulk_tag_popup_remove_mutual" class="menu_button" title="Remove all mutual tags from the selected characters" data-i18n="[title]Remove all mutual tags from the selected characters">
                            <i class="fa-solid fa-trash-can margin-right-10px"></i>
                            Mutual
                        </div>
                        <div id="bulk_tag_popup_import_all_tags" class="menu_button" title="Import all tags from selected characters" data-i18n="[title]Import all tags from selected characters">
                            Import All
                        </div>
                        <div id="bulk_tag_popup_import_existing_tags" class="menu_button" title="Import existing tags from selected characters" data-i18n="[title]Import existing tags from selected characters">
                            Import Existing
                        </div>
                        <div id="bulk_tag_popup_cancel" class="menu_button" data-i18n="Cancel">Close</div>
                    </div>
                </div>
            </div>
        </div>`;
    };

    /**
     * Append and show the tag control
     * @param {number[]} characterIds - The characters that are shown inside the popup
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'characterIds' implicitly has an 'any' t... Remove this comment to see the full error message
    show(characterIds) {
        // shallow copy character ids persistently into this tooltip
        this.characterIds = characterIds.slice();

        if (this.characterIds.length == 0) {
            console.log('No characters selected for bulk edit tags.');
            return;
        }

        document.body.insertAdjacentHTML('beforeend', this.#getHtml());

        // @ts-expect-error TS(7006) FIXME: Parameter 'id' implicitly has an 'any' type.
        const entities = this.characterIds
            .map((id) => characterToEntity(characters[id], id))
            .filter((entity) => entity.item !== undefined);
        buildAvatarList(document.getElementById('bulk_tags_avatars_block'), entities);

        // Print the tag list with all mutuable tags, marking them as removable. That is the initial fill
        printTagList(document.getElementById('bulkTagList'), {
            tags: () => this.getMutualTags(),
            tagOptions: { removable: true },
        });

        // Tag input with resolvable list for the mutual tags to get redrawn, so that newly added tags get sorted correctly
        createTagInput('#bulkTagInput', '#bulkTagList', {
            tags: () => this.getMutualTags(),
            tagOptions: { removable: true },
        });

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document
            .querySelector('#bulk_tag_popup_reset')
            .addEventListener('click', this.resetTags.bind(this));
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document
            .querySelector('#bulk_tag_popup_remove_mutual')
            .addEventListener('click', this.removeMutual.bind(this));
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document
            .querySelector('#bulk_tag_popup_cancel')
            .addEventListener('click', this.hide.bind(this));
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document
            .querySelector('#bulk_tag_popup_import_all_tags')
            .addEventListener('click', this.importAllTags.bind(this));
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document
            .querySelector('#bulk_tag_popup_import_existing_tags')
            .addEventListener('click', this.importExistingTags.bind(this));
    }

    /**
     * Import existing tags for all selected characters
     */
    async importExistingTags() {
        for (const characterId of this.characterIds) {
            await importTags(characters[characterId], {
                importSetting: tag_import_setting.ONLY_EXISTING,
            });
        }

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('bulkTagList').innerHTML = '';
    }

    /**
     * Import all tags for all selected characters
     */
    async importAllTags() {
        for (const characterId of this.characterIds) {
            await importTags(characters[characterId], { importSetting: tag_import_setting.ALL });
        }

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('bulkTagList').innerHTML = '';
    }

    /**
     * Builds a list of all tags that the provided characters have in common.
     * @returns {Array<object>} A list of mutual tags
     */
    getMutualTags() {
        if (this.characterIds.length == 0) {
            return [];
        }

        if (this.characterIds.length === 1) {
            // Just use tags of the single character
            return getTagsList(getTagKeyForEntity(this.characterIds[0]));
        }

        // Find mutual tags for multiple characters
        // @ts-expect-error TS(7006) FIXME: Parameter 'cid' implicitly has an 'any' type.
        const allTags = this.characterIds.map((cid) => getTagsList(getTagKeyForEntity(cid)));
        // @ts-expect-error TS(7006) FIXME: Parameter 'mutual' implicitly has an 'any' type.
        const mutualTags = allTags.reduce((mutual, characterTags) =>
            // @ts-expect-error TS(7006) FIXME: Parameter 'tag' implicitly has an 'any' type.
            mutual.filter((tag) => characterTags.some((cTag) => cTag.id === tag.id)),
        );

        this.currentMutualTags = mutualTags.toSorted(compareTagsForSort);
        return this.currentMutualTags;
    }

    /**
     * Hide and remove the tag control
     */
    hide() {
        const popupElement = document.querySelector('#bulk_tag_shadow_popup');
        if (popupElement) {
            document.body.removeChild(popupElement);
        }

        // No need to redraw here, all tags actions were redrawn when they happened
    }

    /**
     * Empty the tag map for the given characters
     */
    resetTags() {
        for (const characterId of this.characterIds) {
            const key = getTagKeyForEntity(characterId);
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            if (key) tag_map[key] = [];
        }

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('bulkTagList').innerHTML = '';

        printCharactersDebounced();
    }

    /**
     * Remove the mutual tags for all given characters
     */
    removeMutual() {
        const mutualTags = this.getMutualTags();

        for (const characterId of this.characterIds) {
            for (const tag of mutualTags) {
                removeTagFromMap(tag.id, characterId.toString());
            }
        }

        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        document.getElementById('bulkTagList').innerHTML = '';

        printCharactersDebounced();
    }
}

class BulkEditOverlayState {
    /**
     *
     * @type {number}
     */
    static browse = 0;

    /**
     *
     * @type {number}
     */
    static select = 1;
}

/**
 * Implement a SingletonPattern, allowing access to the group overlay instance
 * from everywhere via (new CharacterGroupOverlay())
 * @type {Readonly<BulkEditOverlay>}
 */
// @ts-expect-error TS(7034) FIXME: Variable 'bulkEditOverlayInstance' implicitly has ... Remove this comment to see the full error message
let bulkEditOverlayInstance = null;

class BulkEditOverlay {
    static containerId = 'rm_print_characters_block';
    static contextMenuId = 'character_context_menu';
    static characterClass = 'character_select';
    static groupClass = 'group_select';
    static bogusFolderClass = 'bogus_folder_select';
    static selectModeClass = 'group_overlay_mode_select';
    static selectedClass = 'character_selected';
    static legacySelectedClass = 'bulk_select_checkbox';
    static bulkSelectedCountId = 'bulkSelectedCount';

    static longPressDelay = 2500;

    #state = BulkEditOverlayState.browse;
    #longPress = false;
    #stateChangeCallbacks = [];
    #selectedCharacters = [];
    #bulkTagPopupHandler = new BulkTagPopupHandler();

    /**
     * @typedef {object} LastSelected - An object noting the last selected character and its state.
     * @property {number} [characterId] - The character id of the last selected character.
     * @property {boolean} [select] - The selected state of the last selected character. <c>true</c> if it was selected, <c>false</c> if it was deselected.
     */

    /**
     * @type {LastSelected} - An object noting the last selected character and its state.
     */
    lastSelected = { characterId: undefined, select: undefined };

    /**
     * Locks other pointer actions when the context menu is open
     * @type {boolean}
     */
    #contextMenuOpen = false;

    /**
     * Whether the next character select should be skipped
     * @type {boolean}
     */
    #cancelNextToggle = false;

    /**
     * @type {HTMLElement}
     */
    container = null;

    get state() {
        return this.#state;
    }

    set state(newState) {
        if (this.#state === newState) return;

        eventSource
            .emit(event_types.CHARACTER_GROUP_OVERLAY_STATE_CHANGE_BEFORE, newState)
            .then(() => {
                this.#state = newState;
                eventSource.emit(
                    event_types.CHARACTER_GROUP_OVERLAY_STATE_CHANGE_AFTER,
                    this.state,
                );
            });
    }

    get isLongPress() {
        return this.#longPress;
    }

    set isLongPress(longPress) {
        this.#longPress = longPress;
    }

    get stateChangeCallbacks() {
        return this.#stateChangeCallbacks;
    }

    /**
     * The currently selected character IDs
     * @returns {number[]} Array of selected character IDs
     */
    get selectedCharacters() {
        return this.#selectedCharacters;
    }

    /**
     * The instance of the bulk tag popup handler that handles tagging of all selected characters
     * @returns {BulkTagPopupHandler} The bulk tag popup handler instance
     */
    get bulkTagPopupHandler() {
        return this.#bulkTagPopupHandler;
    }

    constructor() {
        // @ts-expect-error TS(7005) FIXME: Variable 'bulkEditOverlayInstance' implicitly has ... Remove this comment to see the full error message
        if (bulkEditOverlayInstance instanceof BulkEditOverlay) return bulkEditOverlayInstance;

        // @ts-expect-error TS(2322) FIXME: Type 'HTMLElement | null' is not assignable to typ... Remove this comment to see the full error message
        this.container = document.getElementById(BulkEditOverlay.containerId);

        eventSource.on(
            event_types.CHARACTER_GROUP_OVERLAY_STATE_CHANGE_AFTER,
            this.handleStateChange,
        );
        bulkEditOverlayInstance = Object.freeze(this);
    }

    /**
     * Set the overlay to browse mode
     * @returns {void}
     */
    browseState = () => (this.state = BulkEditOverlayState.browse);

    /**
     * Set the overlay to select mode
     * @returns {void}
     */
    selectState = () => (this.state = BulkEditOverlayState.select);

    /**
     * Set up a Sortable grid for the loaded page
     */
    onPageLoad = () => {
        this.browseState();

        const elements = this.#getEnabledElements();
        elements.forEach((element) => element.addEventListener('touchstart', this.handleHold));
        elements.forEach((element) => element.addEventListener('mousedown', this.handleHold));
        elements.forEach((element) =>
            element.addEventListener('contextmenu', this.handleDefaultContextMenu),
        );

        elements.forEach((element) =>
            element.addEventListener('touchend', this.handleLongPressEnd),
        );
        elements.forEach((element) => element.addEventListener('mouseup', this.handleLongPressEnd));
        elements.forEach((element) => element.addEventListener('dragend', this.handleLongPressEnd));
        elements.forEach((element) =>
            element.addEventListener('touchmove', this.handleLongPressEnd),
        );

        // Cohee: It only triggers when clicking on a margin between the elements?
        // Feel free to fix or remove this, I'm not sure how to.
        //this.container.addEventListener('click', this.handleCancelClick);
    };

    /**
     * Handle state changes
     *
     *
     */
    handleStateChange = () => {
        switch (this.state) {
            case BulkEditOverlayState.browse:
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                this.container.classList.remove(BulkEditOverlay.selectModeClass);
                this.#contextMenuOpen = false;
                this.#enableClickEventsForCharacters();
                this.#enableClickEventsForGroups();
                this.clearSelectedCharacters();
                this.disableContextMenu();
                this.#disableBulkEditButtonHighlight();
                (CharacterContextMenu as unknown as HTMLElement).style.display = 'none';
                break;
            case BulkEditOverlayState.select:
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                this.container.classList.add(BulkEditOverlay.selectModeClass);
                this.#disableClickEventsForCharacters();
                this.#disableClickEventsForGroups();
                this.enableContextMenu();
                this.#enableBulkEditButtonHighlight();
                break;
        }

        // @ts-expect-error TS(2349) FIXME: This expression is not callable.
        this.stateChangeCallbacks.forEach((callback) => callback(this.state));
    };

    /**
     * Block the browsers native context menu and
     * set a click event to hide the custom context menu.
     */
    enableContextMenu = () => {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.container.addEventListener('contextmenu', this.handleContextMenuShow);
        document.addEventListener('click', this.handleContextMenuHide);
    };

    /**
     * Remove event listeners, allowing the native browser context
     * menu to be opened.
     */
    disableContextMenu = () => {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.container.removeEventListener('contextmenu', this.handleContextMenuShow);
        document.removeEventListener('click', this.handleContextMenuHide);
    };

    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    handleDefaultContextMenu = (event) => {
        if (this.isLongPress) {
            event.preventDefault();
            event.stopPropagation();
            return false;
        }
    };

    /**
     * Opens menu on long-press.
     * @param {MouseEvent|TouchEvent} event Pointer event
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    handleHold = (event) => {
        if (0 !== event.button && event.type !== 'touchstart') return;
        if (this.#contextMenuOpen) {
            this.#contextMenuOpen = false;
            this.#cancelNextToggle = true;
            (CharacterContextMenu as unknown as HTMLElement).style.display = 'none';
            return;
        }

        let cancel = false;

        // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
        const cancelHold = (event) => (cancel = true);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.container.addEventListener('mouseup', cancelHold);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        this.container.addEventListener('touchend', cancelHold);

        this.isLongPress = true;

        setTimeout(() => {
            if (this.isLongPress && !cancel) {
                if (this.state === BulkEditOverlayState.browse) {
                    this.selectState();
                } else if (this.state === BulkEditOverlayState.select) {
                    this.#contextMenuOpen = true;
                    const [x, y] = this.#getContextMenuPosition(event);
                    CharacterContextMenu.show(x, y);
                }
            }

            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            this.container.removeEventListener('mouseup', cancelHold);
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            this.container.removeEventListener('touchend', cancelHold);
        }, BulkEditOverlay.longPressDelay);
    };

    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    handleLongPressEnd = (event) => {
        this.isLongPress = false;
        if (this.#contextMenuOpen) event.stopPropagation();
    };

    handleCancelClick = () => {
        if (false === this.#contextMenuOpen) this.state = BulkEditOverlayState.browse;
        this.#contextMenuOpen = false;
    };

    /**
     * Returns the position of the mouse/touch location
     * @param {MouseEvent|TouchEvent} event Pointer event
     * @returns {[number, number]} X and Y coordinates
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    #getContextMenuPosition = (event) => [
        event.clientX || event.touches[0].clientX,
        event.clientY || event.touches[0].clientY,
    ];

    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    #stopEventPropagation = (event) => {
        if (this.#contextMenuOpen) {
            this.handleContextMenuHide(event);
        }
        event.stopPropagation();
    };

    #enableClickEventsForGroups = () =>
        this.#getDisabledElements().forEach((element) =>
            element.removeEventListener('click', this.#stopEventPropagation),
        );

    #disableClickEventsForGroups = () =>
        this.#getDisabledElements().forEach((element) =>
            element.addEventListener('click', this.#stopEventPropagation),
        );

    #enableClickEventsForCharacters = () =>
        this.#getEnabledElements().forEach((element) =>
            element.removeEventListener('click', this.toggleCharacterSelected),
        );

    #disableClickEventsForCharacters = () =>
        this.#getEnabledElements().forEach((element) =>
            element.addEventListener('click', this.toggleCharacterSelected),
        );

    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    #enableBulkEditButtonHighlight = () =>
        document.getElementById('bulkEditButton').classList.add('bulk_edit_overlay_active');

    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    #disableBulkEditButtonHighlight = () =>
        document.getElementById('bulkEditButton').classList.remove('bulk_edit_overlay_active');

    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    #getEnabledElements = () => [
        ...this.container.getElementsByClassName(BulkEditOverlay.characterClass),
    ];

    // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
    #getDisabledElements = () => [
        ...this.container.getElementsByClassName(BulkEditOverlay.groupClass),
        ...this.container.getElementsByClassName(BulkEditOverlay.bogusFolderClass),
    ];

    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    toggleCharacterSelected = (event) => {
        event.stopPropagation();

        const character = event.currentTarget;

        if (!this.#contextMenuOpen && !this.#cancelNextToggle) {
            if (event.shiftKey) {
                // Shift click might have selected text that we don't want to. Unselect it.
                // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
                document.getSelection().removeAllRanges();

                this.handleShiftClick(character);
            } else {
                this.toggleSingleCharacter(character);
            }
        }

        this.#cancelNextToggle = false;
    };

    /**
     * When shift click was held down, this function handles the multi select of characters in a single click.
     *
     * If the last clicked character was deselected, and the current one was deselected too, it will deselect all currently selected characters between those two.
     * If the last clicked character was selected, and the current one was selected too, it will select all currently not selected characters between those two.
     * If the states do not match, nothing will happen.
     * @param {HTMLElement} currentCharacter - The html element of the currently toggled character
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'currentCharacter' implicitly has an 'an... Remove this comment to see the full error message
    handleShiftClick = (currentCharacter) => {
        const characterId = Number(currentCharacter.getAttribute('data-chid'));
        // @ts-expect-error TS(2345) FIXME: Argument of type 'number' is not assignable to par... Remove this comment to see the full error message
        const select = !this.selectedCharacters.includes(characterId);

        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        if (this.lastSelected.characterId >= 0 && this.lastSelected.select !== undefined) {
            // Only if select state and the last select state match we execute the range select
            if (select === this.lastSelected.select) {
                this.toggleCharactersInRange(currentCharacter, select);
            }
        }
    };

    /**
     * Toggles the selection of a given characters
     * @param {HTMLElement} character - The html element of a character
     * @param {object} param1 - Optional params
     * @param {boolean} [param1.markState] - Whether the toggle of this character should be remembered as the last done toggle
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'character' implicitly has an 'any' type... Remove this comment to see the full error message
    toggleSingleCharacter = (character, { markState = true } = {}) => {
        const characterId = Number(character.getAttribute('data-chid'));

        // @ts-expect-error TS(2345) FIXME: Argument of type 'number' is not assignable to par... Remove this comment to see the full error message
        const select = !this.selectedCharacters.includes(characterId);
        const legacyBulkEditCheckbox = /** @type {HTMLInputElement} */ (
            character.querySelector('.' + BulkEditOverlay.legacySelectedClass)
        );

        if (select) {
            character.classList.add(BulkEditOverlay.selectedClass);
            if (legacyBulkEditCheckbox) legacyBulkEditCheckbox.checked = true;
            // @ts-expect-error TS(2345) FIXME: Argument of type 'number' is not assignable to par... Remove this comment to see the full error message
            this.#selectedCharacters.push(characterId);
        } else {
            character.classList.remove(BulkEditOverlay.selectedClass);
            if (legacyBulkEditCheckbox) legacyBulkEditCheckbox.checked = false;
            this.#selectedCharacters = this.#selectedCharacters.filter(
                (item) => characterId !== item,
            );
        }

        this.updateSelectedCount();

        if (markState) {
            // @ts-expect-error TS(2322) FIXME: Type 'number' is not assignable to type 'undefined... Remove this comment to see the full error message
            this.lastSelected.characterId = characterId;
            // @ts-expect-error TS(2322) FIXME: Type 'boolean' is not assignable to type 'undefine... Remove this comment to see the full error message
            this.lastSelected.select = select;
        }
    };

    /**
     * Updates the selected count element with the current count
     * @param {number} [countOverride] - optional override for a manual number to set
     */
    updateSelectedCount = (countOverride = undefined) => {
        const count = countOverride ?? this.selectedCharacters.length;
        const countEl = document.getElementById(BulkEditOverlay.bulkSelectedCountId);
        if (countEl) {
            countEl.textContent = String(count);
            countEl.setAttribute('title', `${count} characters selected`);
        }
    };

    /**
     * Toggles the selection of characters in a given range.
     * The range is provided by the given character and the last selected one remembered in the selection state.
     * @param {HTMLElement} currentCharacter - The html element of the currently toggled character
     * @param {boolean} select - <c>true</c> if the characters in the range are to be selected, <c>false</c> if deselected
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'currentCharacter' implicitly has an 'an... Remove this comment to see the full error message
    toggleCharactersInRange = (currentCharacter, select) => {
        const currentCharacterId = Number(currentCharacter.getAttribute('data-chid'));
        const characters = Array.from(
            document.querySelectorAll(
                '#' + BulkEditOverlay.containerId + ' .' + BulkEditOverlay.characterClass,
            ),
        );

        const startIndex = characters.findIndex(
            (c) => Number(c.getAttribute('data-chid')) === Number(this.lastSelected.characterId),
        );
        const endIndex = characters.findIndex(
            (c) => Number(c.getAttribute('data-chid')) === currentCharacterId,
        );

        for (let i = Math.min(startIndex, endIndex); i <= Math.max(startIndex, endIndex); i++) {
            const character = characters[i];
            const characterId = Number(character!.getAttribute('data-chid'));
            // @ts-expect-error TS(2345) FIXME: Argument of type 'number' is not assignable to par... Remove this comment to see the full error message
            const isCharacterSelected = this.selectedCharacters.includes(characterId);

            // Only toggle the character if it wasn't on the state we have are toggling towards.
            // Also doing a weird type check, because typescript checker doesn't like the return of 'querySelectorAll'.
            if (
                ((select && !isCharacterSelected) || (!select && isCharacterSelected)) &&
                character instanceof HTMLElement
            ) {
                this.toggleSingleCharacter(character, {
                    markState: currentCharacterId == characterId,
                });
            }
        }
    };

    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    handleContextMenuShow = (event) => {
        event.preventDefault();
        const [x, y] = this.#getContextMenuPosition(event);
        CharacterContextMenu.show(x, y);
        this.#contextMenuOpen = true;
    };

    // @ts-expect-error TS(7006) FIXME: Parameter 'event' implicitly has an 'any' type.
    handleContextMenuHide = (event) => {
        const contextMenu = document.getElementById(BulkEditOverlay.contextMenuId);
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        if (false === contextMenu.contains(event.target)) {
            (CharacterContextMenu as unknown as HTMLElement).style.display = 'none';
            this.#contextMenuOpen = false;
        }
    };

    /**
     * Concurrently handle character favorite requests.
     * @returns {Promise<void>}
     */
    handleContextMenuFavorite = async () => {
        const promises = [];

        for (const characterId of this.selectedCharacters) {
            promises.push(CharacterContextMenu.favorite(characterId));
        }

        await Promise.allSettled(promises);
        await getCharacters();
        await favsToHotswap();
        this.browseState();
    };

    /**
     * Concurrently handle character duplicate requests.
     * @returns {Promise<number>} Number of duplicated characters
     */
    handleContextMenuDuplicate = () =>
        Promise.all(
            this.selectedCharacters.map(async (characterId) =>
                CharacterContextMenu.duplicate(characterId),
            ),
        )
            .then(() => getCharacters())
            .then(() => this.browseState());

    /**
     * Sequentially handle all character-to-persona conversions.
     * @returns {Promise<void>}
     */
    handleContextMenuPersona = async () => {
        for (const characterId of this.selectedCharacters) {
            await CharacterContextMenu.persona(characterId);
        }

        this.browseState();
    };

    /**
     * Gets the HTML as a string that is displayed inside the popup for the bulk delete
     * @param {Array<number>} characterIds - The characters that are shown inside the popup
     * @returns {string} String containing the html for the popup content
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'characterIds' implicitly has an 'any' t... Remove this comment to see the full error message
    static #getDeletePopupContentHtml = (characterIds) => {
        return `
            <h3 class="marginBot5">Delete ${characterIds.length} characters?</h3>
            <span class="bulk_delete_note">
                <i class="fa-solid fa-triangle-exclamation warning margin-r5"></i>
                <b>THIS IS PERMANENT!</b>
            </span>
            <div id="bulk_delete_avatars_block" class="avatars_inline avatars_inline_small tags tags_inline m-t-1"></div>
            <br>
            <div id="bulk_delete_options" class="m-b-1">
                <label for="del_char_checkbox" class="checkbox_label justifyCenter">
                    <input type="checkbox" id="del_char_checkbox" />
                    <span>Also delete the chat files</span>
                </label>
            </div>`;
    };

    /**
     * Request user input before concurrently handle deletion
     * requests.
     * @returns {Promise<number|undefined>} Promise resolving when deletion is complete
     */
    handleContextMenuDelete = () => {
        const characterIds = this.selectedCharacters;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = BulkEditOverlay.#getDeletePopupContentHtml(characterIds);
        const popupContent = tempDiv;
        const checkbox = popupContent.querySelectorAll('#del_char_checkbox');
        const promise = callGenericPopup(popupContent, POPUP_TYPE.CONFIRM).then((accept) => {
            if (!accept) return;

            const deleteChats = (checkbox as unknown as HTMLInputElement).checked ?? false;

            const loaderHandle = loader.show({
                slug: 'bulk-delete',
                title: t`Bulk Delete`,
                message: t`Deleting ${characterIds.length} character(s)…`,
                toastMode: loader.ToastMode.STATIC,
            });
            const avatarList = characterIds.map((id) => characters[id]?.avatar).filter((a) => a);
            return CharacterContextMenu.delete(avatarList, deleteChats)
                .then(() => this.browseState())
                .finally(() => loaderHandle.hide());
        });

        // At this moment the popup is already changed in the dom, but not yet closed/resolved. We build the avatar list here
        const entities = characterIds
            .map((id) => characterToEntity(characters[id], id))
            .filter((entity) => entity.item !== undefined);
        buildAvatarList(document.getElementById('bulk_delete_avatars_block'), entities);

        return promise;
    };

    /**
     * Attaches and opens the tag menu
     */
    handleContextMenuTag = () => {
        CharacterContextMenu.tag(this.selectedCharacters);
        this.browseState();
    };

    // @ts-expect-error TS(7006) FIXME: Parameter 'callback' implicitly has an 'any' type.
    addStateChangeCallback = (callback) => this.stateChangeCallbacks.push(callback);

    /**
     * Clears internal character storage and
     * removes visual highlight.
     */
    clearSelectedCharacters = () => {
        document
            .querySelectorAll(
                '#' + BulkEditOverlay.containerId + ' .' + BulkEditOverlay.selectedClass,
            )
            .forEach((element) => element.classList.remove(BulkEditOverlay.selectedClass));
        this.selectedCharacters.length = 0;
    };
}

export { BulkEditOverlayState, CharacterContextMenu, BulkEditOverlay };
