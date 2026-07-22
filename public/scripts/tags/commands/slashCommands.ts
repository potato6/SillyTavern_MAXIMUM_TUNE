/**
 * Tag slash commands — all /command registrations for the tag system.
 *
 * Extracted from tags.ts to keep that file focused on store/UI logic.
 */

// External dependencies
import { SlashCommandParser } from '../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../slash-commands/SlashCommand.js';
import {
    ARGUMENT_TYPE,
    SlashCommandArgument,
    SlashCommandNamedArgument,
} from '../../slash-commands/SlashCommandArgument.js';
import { commonEnumProviders } from '../../slash-commands/SlashCommandCommonEnumsProvider.js';
import { enumTypes, SlashCommandEnumValue } from '../../slash-commands/SlashCommandEnumValue.js';

// Tag store
import { addTagsToEntity, removeTagFromEntity } from '../orchestrator.js';
import { getTag, createNewTag, getTagsList, tag_map } from '../store/tagStore.js';

// Tag utilities
import { searchCharByName } from '../utils/search.js';
import { importTags } from '../import/importer.js';

// App-level imports
import { printCharacters } from '../../../script.js';
import { selected_group } from '../../group-chats.js';
import { tag_import_setting } from '../types.js';
import { findChar } from '../../utils.js';
import { t } from '../../i18n.js';

declare const notyf: Omit<import('notyf').Notyf, 'error' | 'success'> & {
    error: (
        message: string,
        title?: string,
        opts?: Record<string, unknown>,
    ) => import('notyf').NotyfNotification;
    success: (
        message: string,
        title?: string,
        opts?: Record<string, unknown>,
    ) => import('notyf').NotyfNotification;
    warning: (
        message: string,
        title?: string,
        opts?: Record<string, unknown>,
    ) => import('notyf').NotyfNotification;
    info: (
        message: string,
        title?: string,
        opts?: Record<string, unknown>,
    ) => import('notyf').NotyfNotification;
};

/**
 * Registers all tag-related slash commands.
 * @returns {void}
 */
export function registerTagsSlashCommands() {
    /**
     * Gets a tag by its name. Optionally can create the tag if it does not exist.
     * @param {string} tagName - The name of the tag
     * @param {object} options - Optional arguments
     * @param {boolean} [options.allowCreate] - Whether a new tag should be created if no tag with the name exists
     * @returns {Tag?} The tag, or null if not found
     */
    function paraGetTag(
        tagName: string,
        { allowCreate = false }: { allowCreate?: boolean } = {},
    ): Record<string, unknown> | null {
        if (!tagName) {
            notyf.warning('Tag name must be provided.');
            return null;
        }
        let tag = getTag(tagName);
        if (allowCreate && !tag) {
            tag = createNewTag(tagName);
        }
        if (!tag) {
            notyf.warning(`Tag ${tagName} not found.`);
            return null;
        }
        return tag;
    }

    // ──────────────────────────────────────────────
    // /tag-add
    // ──────────────────────────────────────────────

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'tag-add',
            returns: 'true/false - Whether the tag was added or was assigned already',
            /**
             * @param {{name: string}} namedArgs @param {string} tagName @returns {string}
             * @param tagName
             */
            callback: ({ name }: { name: string }, tagName: string) => {
                const key = searchCharByName(name);
                if (!key) return 'false';
                const tag = paraGetTag(tagName, { allowCreate: true });
                if (!tag) return 'false';
                const result = addTagsToEntity(tag, key);
                printCharacters();
                return String(result);
            },
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'name',
                    description: 'Character name - or unique character identifier (avatar key)',
                    typeList: [ARGUMENT_TYPE.STRING],
                    defaultValue: '{{char}}',
                    enumProvider: commonEnumProviders.characters(),
                }),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'tag name',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: commonEnumProviders.tagsForChar('not-existing'),
                    forceEnum: false,
                }),
            ],
            helpString: `
        <div>
            Adds a tag to the character. If no character is provided, it adds it to the current character (<code>{{char}}</code>).
            If the tag doesn't exist, it is created.
        </div>
        <div>
            <strong>Example:</strong>
            <ul>
                <li>
                    <pre><code>/tag-add name="Chloe" scenario</code></pre>
                    will add the tag "scenario" to the character named Chloe.
                </li>
            </ul>
        </div>
    `,
        }),
    );

    // ──────────────────────────────────────────────
    // /tag-remove
    // ──────────────────────────────────────────────

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'tag-remove',
            returns: "true/false - Whether the tag was removed or wasn't assigned already",
            /**
             * @param {{name: string}} namedArgs @param {string} tagName @returns {string}
             * @param tagName
             */
            callback: ({ name }: { name: string }, tagName: string) => {
                const key = searchCharByName(name);
                if (!key) return 'false';
                const tag = paraGetTag(tagName);
                if (!tag) return 'false';
                const result = removeTagFromEntity(tag, key);
                printCharacters();
                return String(result);
            },
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'name',
                    description: 'Character name - or unique character identifier (avatar key)',
                    typeList: [ARGUMENT_TYPE.STRING],
                    defaultValue: '{{char}}',
                    enumProvider: commonEnumProviders.characters(),
                }),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'tag name',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    /**@param {SlashCommandExecutor} executor */
                    enumProvider: commonEnumProviders.tagsForChar('existing'),
                }),
            ],
            helpString: `
        <div>
            Removes a tag from the character. If no character is provided, it removes it from the current character (<code>{{char}}</code>).
        </div>
        <div>
            <strong>Example:</strong>
            <ul>
                <li>
                    <pre><code>/tag-remove name="Chloe" scenario</code></pre>
                    will remove the tag "scenario" from the character named Chloe.
                </li>
            </ul>
        </div>
    `,
        }),
    );

    // ──────────────────────────────────────────────
    // /tag-exists
    // ──────────────────────────────────────────────

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'tag-exists',
            returns: 'true/false - Whether the given tag name is assigned to the character',
            /**
             * @param {{name: string}} namedArgs @param {string} tagName @returns {string}
             * @param tagName
             */
            callback: ({ name }: { name: string }, tagName: string) => {
                const key = searchCharByName(name);
                if (!key) return 'false';
                const tag = paraGetTag(tagName);
                if (!tag) return 'false';
                return String(
                    (tag_map as Record<string, string[] | undefined>)[key]?.includes(
                        tag.id as string,
                    ),
                );
            },
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'name',
                    description: 'Character name - or unique character identifier (avatar key)',
                    typeList: [ARGUMENT_TYPE.STRING],
                    defaultValue: '{{char}}',
                    enumProvider: commonEnumProviders.characters(),
                }),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'tag name',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    /**@param {SlashCommandExecutor} executor */
                    enumProvider: commonEnumProviders.tagsForChar('all'),
                }),
            ],
            helpString: `
        <div>
            Checks whether the given tag is assigned to the character. If no character is provided, it checks the current character (<code>{{char}}</code>).
        </div>
        <div>
            <strong>Example:</strong>
            <ul>
                <li>
                    <pre><code>/tag-exists name="Chloe" scenario</code></pre>
                    will return true if the character named Chloe has the tag "scenario".
                </li>
            </ul>
        </div>
    `,
        }),
    );

    // ──────────────────────────────────────────────
    // /tag-list
    // ──────────────────────────────────────────────

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'tag-list',
            returns: 'Comma-separated list of all assigned tags',
            /** @param {{name: string}} namedArgs @returns {string} */
            callback: ({ name }: { name: string }) => {
                const key = searchCharByName(name);
                if (!key) return '';
                const tags = getTagsList(key);

                return tags
                    .map((x: Record<string, unknown>) => x?.name)
                    .filter(Boolean)
                    .join(', ');
            },
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'name',
                    description: 'Character name - or unique character identifier (avatar key)',
                    typeList: [ARGUMENT_TYPE.STRING],
                    defaultValue: '{{char}}',
                    enumProvider: commonEnumProviders.characters(),
                }),
            ],
            helpString: `
        <div>
            Lists all assigned tags of the character. If no character is provided, it uses the current character (<code>{{char}}</code>).
            <br />
            Note that there is no special handling for tags containing commas, they will be printed as-is.
        </div>
        <div>
            <strong>Example:</strong>
            <ul>
                <li>
                    <pre><code>/tag-list name="Chloe"</code></pre>
                    could return something like <code>OC, scenario, edited, funny</code>
                </li>
            </ul>
        </div>
    `,
        }),
    );

    // ──────────────────────────────────────────────
    // /tag-import
    // ──────────────────────────────────────────────

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'tag-import',
            /** @param {{name: string, mode: 'all'|'existing'|'none'|'ask'}} namedArgs @returns {Promise<string>} */
            callback: async ({ name, mode }: { name: string; mode?: string }) => {
                if (selected_group !== null) {
                    notyf.warning(t`Tag import does not support group chats.`);
                    return 'false';
                }
                const key = searchCharByName(name);
                if (!key) return 'false';

                // Map mode argument to tag_import_setting
                const modeMap: Record<string, number> = {
                    all: tag_import_setting.ALL,
                    existing: tag_import_setting.ONLY_EXISTING,
                    none: tag_import_setting.NONE,
                    ask: tag_import_setting.ASK,
                };
                if (mode && !modeMap[mode]) {
                    notyf.warning(
                        `Invalid tag import mode: ${mode}. Valid modes are: ${Object.keys(modeMap).join(', ')}`,
                    );
                    return 'false';
                }

                const importSetting = mode ? modeMap[mode] : null;
                const character = findChar({ name: key as unknown as null });

                const result = await importTags(character, { importSetting });
                return result ? 'true' : 'false';
            },
            returns: t`true if any tags were imported, false otherwise`,
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'name',
                    description: 'Character name - or unique character identifier (avatar key)',
                    typeList: [ARGUMENT_TYPE.STRING],
                    defaultValue: '{{char}}',
                    enumProvider: commonEnumProviders.characters(),
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'mode',
                    description: t`Import mode: "all" imports all tags, "existing" imports only existing ST tags, "none" skips import, "ask" shows the import popup (default: uses your saved setting)`,
                    typeList: [ARGUMENT_TYPE.STRING],
                    enumList: [
                        new SlashCommandEnumValue(
                            'all',
                            t`Import all tags (create new ones if needed)`,
                            enumTypes.enum,
                        ),
                        new SlashCommandEnumValue(
                            'existing',
                            t`Import only existing ST tags`,
                            enumTypes.enum,
                        ),
                        new SlashCommandEnumValue('none', t`Skip import`, enumTypes.enum),
                        new SlashCommandEnumValue('ask', t`Show the import popup`, enumTypes.enum),
                    ],
                }),
            ],
            helpString: `
        <div>
            ${t`Imports character card tags as SillyTavern tags for folder/filter use.`}
        </div>
        <div>
            ${t`Character cards can have embedded tags (set via <code>tags</code> argument in <code>/char-create</code> or <code>/char-update</code>). This command imports those embedded tags as ST tags that can be used for filtering and organizing characters.`}
        </div>
        <div>
            ${t`If no mode is specified, uses your saved tag import setting from preferences.`}
        </div>
        <div>
            <strong>${t`Example:`}</strong>
            <ul>
                <li>
                    <pre><code>/tag-import</code></pre>
                    ${t`Imports tags for the current character using your default setting.`}
                </li>
                <li>
                    <pre><code>/tag-import name="Alice" mode=all</code></pre>
                    ${t`Imports all of Alice's card tags, creating new ST tags if needed.`}
                </li>
            </ul>
        </div>
        `,
        }),
    );
}
