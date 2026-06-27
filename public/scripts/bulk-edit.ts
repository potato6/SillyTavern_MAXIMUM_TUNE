import { characterGroupOverlay } from '../script.js';
import { BulkEditOverlay, BulkEditOverlayState, CharacterContextMenu } from './BulkEditOverlay.js';
import { event_types, eventSource } from './events.js';

let is_bulk_edit = false;

const enableBulkEdit = () => {
    enableBulkSelect();
    characterGroupOverlay.selectState();
    // show the bulk edit option buttons
    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('.bulkEditOptionElement').show();
    is_bulk_edit = true;
    characterGroupOverlay.updateSelectedCount(0);
};

const disableBulkEdit = () => {
    disableBulkSelect();
    characterGroupOverlay.browseState();
    // hide the bulk edit option buttons
    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('.bulkEditOptionElement').hide();
    is_bulk_edit = false;
    characterGroupOverlay.updateSelectedCount(0);
};

const toggleBulkEditMode = (isBulkEdit) => {
    if (isBulkEdit) {
        disableBulkEdit();
    } else {
        enableBulkEdit();
    }
};

/**
 * Toggles bulk edit mode on/off when the edit button is clicked.
 */
function onEditButtonClick() {
    console.log('Edit button clicked');
    toggleBulkEditMode(is_bulk_edit);
}

/**
 * Toggles the select state of all characters in bulk edit mode to selected. If all are selected, they'll be deselected.
 */
function onSelectAllButtonClick() {
    console.log('Bulk select all button clicked');
    const characters = Array.from(document.querySelectorAll('#' + BulkEditOverlay.containerId + ' .' + BulkEditOverlay.characterClass));
    let atLeastOneSelected = false;
    for (const character of characters) {
        const checked = character.querySelector('.bulk_select_checkbox:checked') !== null;
        if (!checked && character instanceof HTMLElement) {
            characterGroupOverlay.toggleSingleCharacter(character);
            atLeastOneSelected = true;
        }
    }

    if (!atLeastOneSelected) {
        // If none was selected, trigger click on all to deselect all of them
        for (const character of characters) {
            const checked = character.querySelector('.bulk_select_checkbox:checked') !== null;
            if (checked && character instanceof HTMLElement) {
                characterGroupOverlay.toggleSingleCharacter(character);
            }
        }
    }
}

/**
 * Deletes all characters that have been selected via the bulk checkboxes.
 */
async function onDeleteButtonClick() {
    console.log('Delete button clicked');

    // We just let the button trigger the context menu delete option
    await characterGroupOverlay.handleContextMenuDelete();
}

/**
 * Enables bulk selection by adding a checkbox next to each character.
 */
function enableBulkSelect() {
    document.querySelectorAll('#rm_print_characters_block .character_select').forEach(el => {
        // Prevent checkbox from adding multiple times (because of stage change callback)
        if (el.querySelector('.bulk_select_checkbox')) {
            return;
        }
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'bulk_select_checkbox';
        checkbox.addEventListener('change', () => {
            // Do something when the checkbox is changed
        });
        el.prepend(checkbox);
    });
    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#rm_print_characters_block.group_overlay_mode_select .bogus_folder_select, #rm_print_characters_block.group_overlay_mode_select .group_select')
        .addClass('disabled');

    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#rm_print_characters_block').addClass('bulk_select');
    // We also need to disable the default click event for the character_select divs
    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.bulk_select_checkbox', function (event) {
        event.stopImmediatePropagation();
    });
}

/**
 * Disables bulk selection by removing the checkboxes.
 */
function disableBulkSelect() {
    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('.bulk_select_checkbox').remove();
    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#rm_print_characters_block.group_overlay_mode_select .bogus_folder_select, #rm_print_characters_block.group_overlay_mode_select .group_select')
        .removeClass('disabled');
    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#rm_print_characters_block').removeClass('bulk_select');
}

/**
 * Entry point that runs on page load.
 */
export function initBulkEdit() {
    characterGroupOverlay.addStateChangeCallback((state) => {
        if (state === BulkEditOverlayState.select) enableBulkEdit();
        if (state === BulkEditOverlayState.browse) disableBulkEdit();
    });

    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bulkEditButton').on('click', onEditButtonClick);
    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bulkSelectAllButton').on('click', onSelectAllButtonClick);
    // @ts-expect-error TS(2592): Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $('#bulkDeleteButton').on('click', onDeleteButtonClick);

    const characterContextMenu = new CharacterContextMenu(characterGroupOverlay);
    eventSource.on(event_types.CHARACTER_PAGE_LOADED, characterGroupOverlay.onPageLoad);
    console.debug('Character context menu initialized', characterContextMenu);
}
