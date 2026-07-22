/**
 * Tag system type definitions and enums.
 * Central source of truth for all tag-related types.
 */

// ──────────────────────────────────────────────
// Enums / Constants
// ──────────────────────────────────────────────

/** @enum {number} */
export const tag_filter_type = {
    character: 0,
    group_candidates_list: 1,
    group_members_list: 2,
};

/** @enum {number} */
export const tag_import_setting = {
    ASK: 1,
    NONE: 2,
    ALL: 3,
    ONLY_EXISTING: 4,
};

/** @enum {string} */
export const tag_sort_mode = {
    MANUAL: 'manual',
    ALPHABETICAL: 'alphabetical',
    BY_ENTRIES: 'by_entries',
};

// ──────────────────────────────────────────────
// Tag Types
// ──────────────────────────────────────────────

/**
 * @typedef FolderType Bogus folder type
 * @property {string} icon - The icon as a string representation / character
 * @property {string} class - The class to apply to the folder type element
 * @property {string} [fa_icon] - Optional font-awesome icon class representing the folder type element
 * @property {string} [tooltip] - Optional tooltip for the folder type element
 * @property {string} [color] - Optional color for the folder type element
 * @property {string} [size] - A string representation of the size that the folder type element should be
 */

/**
 * @type {{ OPEN: FolderType, CLOSED: FolderType, NONE: FolderType, [key: string]: FolderType }}
 * The list of all possible tag folder types
 */
export const TAG_FOLDER_TYPES = {
    OPEN: { icon: '✔', class: 'folder_open', fa_icon: 'fa-folder-open', tooltip: 'Open Folder (Show all characters even if not selected)', color: 'green', size: '1' },
    CLOSED: { icon: '👁', class: 'folder_closed', fa_icon: 'fa-eye-slash', tooltip: 'Closed Folder (Hide all characters unless selected)', color: 'lightgoldenrodyellow', size: '0.7' },
    NONE: { icon: '✕', class: 'no_folder', tooltip: 'No Folder', color: 'red', size: '1' },
};

/** @type {string} */
export const TAG_FOLDER_DEFAULT_TYPE = 'NONE';

/**
 * @typedef {object} Tag - Object representing a tag
 * @property {string} id - The id of the tag
 * @property {string} name - The name of the tag
 * @property {string} [folder_type] - The bogus folder type of this tag (based on `TAG_FOLDER_TYPES`)
 * @property {string} [filter_state] - The saved state of the filter chosen of this tag (based on `FILTER_STATES`)
 * @property {number} [sort_order] - A custom integer representing the sort order if tags are sorted
 * @property {string} [color] - The background color of the tag
 * @property {string} [color2] - The foreground color of the tag
 * @property {number} [create_date] - A number representing the date when this tag was created
 * @property {boolean} [is_hidden_on_character_card] - Whether this tag is hidden on the character card
 * @property {function} [action] - An optional function that gets executed when this tag is an actionable tag and is clicked on.
 * @property {string} [class] - An optional css class added to the control representing this tag when printed.
 * @property {string} [icon] - An optional css class of an icon representing this tag when printed. This will replace the tag name with the icon.
 * @property {string} [title] - An optional title for the tooltip of the tag.
 */

/**
 * @typedef {object} TagOptions - Options for tag behavior. (Same object will be passed into "appendTagToList")
 * @property {boolean} [removable=false] - Whether tags can be removed.
 * @property {boolean} [isFilter=false] - Whether tags can be selected as a filter.
 * @property {function} [action=undefined] - Action to perform on tag interaction.
 * @property {(tag: Tag)=>boolean} [removeAction=undefined] - Action to perform on tag removal instead of the default remove action.
 * @property {boolean} [isGeneralList=false] - If true, indicates that this is the general list of tags.
 * @property {boolean} [skipExistsCheck=false] - If true, the tag gets added even if a tag with the same id already exists.
 * @property {boolean} [isCharacterList=false] - If true, indicates that this is the character's list of tags.
 * @property {boolean} [isInactive=false] - If true, indicates that the tag is inactive (for styling purposes).
 */

/**
 * @typedef {object} PrintTagListOptions - Optional parameters for printing the tag list.
 * @property {Tag[]|function(): Tag[]} [tags=undefined] - Optional override of tags that should be printed.
 * @property {Tag|Tag[]} [addTag=undefined] - Optionally provide one or multiple tags that should be manually added to this print.
 * @property {object|number|string} [forEntityOrKey=undefined] - Optional override for the chosen entity.
 * @property {boolean|string} [empty=true] - Whether the list should be initially empty.
 * @property {boolean} [sort=true] - Whether the tags should be sorted via the sort function.
 * @property {function(object): Function} [tagActionSelector=undefined] - An optional override for the action property.
 * @property {TagOptions} [tagOptions={}] - Options for tag behavior.
 * @property {string[]} [inactiveTags=[]] - List of tag IDs that are considered inactive (for styling purposes).
 */
