import { event_types, eventSource, saveSettingsDebounced } from '../../../script.js';
declare const $: any; declare const toastr: any;
import { deleteAttachment, getDataBankAttachments, getDataBankAttachmentsForSource, getFileAttachment, uploadFileAttachmentToServer } from '../../chats.js';
import { extension_settings, renderExtensionTemplateAsync } from '../../extensions.js';
import { SlashCommand } from '../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../slash-commands/SlashCommandArgument.js';
import { SlashCommandClosure } from '../../slash-commands/SlashCommandClosure.js';
import { enumIcons } from '../../slash-commands/SlashCommandCommonEnumsProvider.js';
import { SlashCommandEnumValue, enumTypes } from '../../slash-commands/SlashCommandEnumValue.js';
import { SlashCommandExecutor } from '../../slash-commands/SlashCommandExecutor.js';
import { SlashCommandParser } from '../../slash-commands/SlashCommandParser.js';

/**
 * List of attachment sources
 * @type {string[]}
 */
const TYPES = ['global', 'character', 'chat'];
const FIELDS = ['name', 'url'];

/**
 * Get attachments from the data bank. Includes disabled attachments.
 * @param {string} [source] Source for the attachments
 * @returns {import('../../chats').FileAttachment[]} List of attachments
 */
function getAttachments(source: any) {
    if (!source || !TYPES.includes(source)) {
        return getDataBankAttachments(true);
    }

    return getDataBankAttachmentsForSource(source, true);
}

/**
 * Get attachment by a single name or URL.
 * @param {import('../../chats').FileAttachment[]} attachments List of attachments
 * @param {string} value Name or URL of the attachment
 * @returns {import('../../chats').FileAttachment} Attachment
 */
function getAttachmentByField(attachments: any, value: any) {
    const match = (a: any) => String(a).trim().toLowerCase() === String(value).trim().toLowerCase();
    const fullMatchByURL = attachments.find((it: any) => match(it.url));
    const fullMatchByName = attachments.find((it: any) => match(it.name));
    return fullMatchByURL || fullMatchByName;
}

/**
 * Get attachment by multiple fields.
 * @param {import('../../chats').FileAttachment[]} attachments List of attachments
 * @param {string[]} values Name and URL of the attachment to search for
 * @returns
 */
function getAttachmentByFields(attachments: any, values: any) {
    for (const value of values) {
        const attachment = getAttachmentByField(attachments, value);
        if (attachment) {
            return attachment;
        }
    }

    return null;
}

/**
 * Callback for listing attachments in the data bank.
 * @param {object} args Named arguments
 * @returns {string} JSON string of the list of attachments
 */
function listDataBankAttachments(args: any) {
    const attachments = getAttachments(args?.source);
    const field = args?.field;
    return JSON.stringify(attachments.map((a: any) => FIELDS.includes(field) ? a[field] : a.url));
}

/**
 * Callback for getting text from an attachment in the data bank.
 * @param {object} args Named arguments
 * @param {string} value Name or URL of the attachment
 * @returns {Promise<string>} Content of the attachment
 */
async function getDataBankText(args: any, value: any) {
    if (!value) {
        notyf.warning('No attachment name or URL provided.');
        return;
    }

    const attachments = getAttachments(args?.source);
    const attachment = getAttachmentByField(attachments, value);

    if (!attachment) {
        notyf.warning('Attachment not found.');
        return;
    }

    const content = await getFileAttachment(attachment.url);
    return content;
}

/**
 * Callback for adding an attachment to the data bank.
 * @param {object} args Named arguments
 * @param {string} value Content of the attachment
 * @returns {Promise<string>} URL of the attachment
 */
async function uploadDataBankAttachment(args: any, value: any) {
    const source = args?.source && TYPES.includes(args.source) ? args.source : 'chat';
    const name = args?.name || new Date().toLocaleString();
    const file = new File([value], name, { type: 'text/plain' });
    const url = await uploadFileAttachmentToServer(file, source);
    return url;
}

/**
 * Callback for updating an attachment in the data bank.
 * @param {object} args Named arguments
 * @param {string} value Content of the attachment
 * @returns {Promise<string>} URL of the attachment
 */
async function updateDataBankAttachment(args: any, value: any) {
    const source = args?.source && TYPES.includes(args.source) ? args.source : 'chat';
    const attachments = getAttachments(source);
    const attachment = getAttachmentByFields(attachments, [args?.url, args?.name]);

    if (!attachment) {
        notyf.warning('Attachment not found.');
        return '';
    }

    await deleteAttachment(attachment, source, () => { }, false);
    const file = new File([value], attachment.name, { type: 'text/plain' });
    const url = await uploadFileAttachmentToServer(file, source);
    return url;
}

/**
 * Callback for deleting an attachment from the data bank.
 * @param {object} args Named arguments
 * @param {string} value Name or URL of the attachment
 * @returns {Promise<string>} Empty string
 */
async function deleteDataBankAttachment(args: any, value: any) {
    const source = args?.source && TYPES.includes(args.source) ? args.source : 'chat';
    const attachments = getAttachments(source);
    const attachment = getAttachmentByField(attachments, value);

    if (!attachment) {
        notyf.warning('Attachment not found.');
        return '';
    }

    await deleteAttachment(attachment, source, () => { }, false);
    return '';
}

/**
 * Callback for disabling an attachment in the data bank.
 * @param {object} args Named arguments
 * @param {string} value Name or URL of the attachment
 * @returns {Promise<string>} Empty string
 */
async function disableDataBankAttachment(args: any, value: any) {
    const attachments = getAttachments(args?.source);
    const attachment = getAttachmentByField(attachments, value);

    if (!attachment) {
        notyf.warning('Attachment not found.');
        return '';
    }

    // @ts-expect-error TS(2345): Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
    if (extension_settings.disabled_attachments.includes(attachment.url)) {
        return '';
    }

    // @ts-expect-error TS(2345): Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
    extension_settings.disabled_attachments.push(attachment.url);
    return '';
}

/**
 * Callback for enabling an attachment in the data bank.
 * @param {object} args Named arguments
 * @param {string} value Name or URL of the attachment
 * @returns {Promise<string>} Empty string
 */
async function enableDataBankAttachment(args: any, value: any) {
    const attachments = getAttachments(args?.source);
    const attachment = getAttachmentByField(attachments, value);

    if (!attachment) {
        notyf.warning('Attachment not found.');
        return '';
    }

    const index = (extension_settings.disabled_attachments as string[]).indexOf(attachment.url);
    if (index === -1) {
        return '';
    }

    (extension_settings.disabled_attachments as string[]).splice(index, 1);
    return '';
}

function cleanUpAttachments() {
    let shouldSaveSettings = false;
    if (extension_settings.character_attachments) {
        Object.values(extension_settings.character_attachments).flat().filter(a => a.text).forEach(a => {
            shouldSaveSettings = true;
            delete a.text;
        });
    }
    if (Array.isArray(extension_settings.attachments)) {
        extension_settings.attachments.filter(a => a.text).forEach(a => {
            shouldSaveSettings = true;
            delete a.text;
        });
    }
    if (shouldSaveSettings) {
        saveSettingsDebounced();
    }
}

/**
 * Clean up character attachments when a character is deleted.
 * @param {{character: Character}} data Event data
 */
function cleanUpCharacterAttachments(data: any) {
    const avatar = data?.character?.avatar;
    if (!avatar) return;
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    if (Array.isArray(extension_settings?.character_attachments?.[avatar])) {
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        delete extension_settings.character_attachments[avatar];
        saveSettingsDebounced();
    }
}

/**
 * Handle character rename event to update character attachments.
 * @param {string} oldAvatar Old avatar name
 * @param {string} newAvatar New avatar name
 */
function handleCharacterRename(oldAvatar: any, newAvatar: any) {
    if (!oldAvatar || !newAvatar) return;
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    if (Array.isArray(extension_settings?.character_attachments?.[oldAvatar])) {
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        extension_settings.character_attachments[newAvatar] = extension_settings.character_attachments[oldAvatar];
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        delete extension_settings.character_attachments[oldAvatar];
        saveSettingsDebounced();
    }
}

export async function init() {
    eventSource.on(event_types.APP_READY, cleanUpAttachments);
    eventSource.on(event_types.CHARACTER_DELETED, cleanUpCharacterAttachments);
    eventSource.on(event_types.CHARACTER_RENAMED, handleCharacterRename);
    const manageButton = await renderExtensionTemplateAsync('attachments', 'manage-button', {});
    const attachButton = await renderExtensionTemplateAsync('attachments', 'attach-button', {});
    $('#data_bank_wand_container').append(manageButton);
    $('#attach_file_wand_container').append(attachButton);

    /** A collection of local enum providers for this context of data bank */
    const localEnumProviders = {
        /**
         * All attachments in the data bank based on the source argument. If not provided, defaults to 'chat'.
         * @param {'name' | 'url'} returnField - Whether the enum should return the 'name' field or the 'url'
         * @param {'chat' | 'character' | 'global' | ''} fallbackSource - The source to use if the source argument is not provided. Empty string to use all sources.
         * */
        attachments: (returnField = 'name', fallbackSource = 'chat') => (/** @type {SlashCommandExecutor} */ executor: any) => {
            const source = executor.namedArgumentList.find((it: any) => it.name == 'source')?.value ?? fallbackSource;
            if (source instanceof SlashCommandClosure) throw new Error('Argument \'source\' does not support closures');
            const attachments = getAttachments(source);

            return attachments.map((attachment: any) => new SlashCommandEnumValue(
                returnField === 'name' ? attachment.name : attachment.url,
                // @ts-expect-error TS(2345): Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
                `${enumIcons.getStateIcon(!extension_settings.disabled_attachments.includes(attachment.url))} [${source}] ${returnField === 'url' ? attachment.name : attachment.url}`,
                enumTypes.enum, enumIcons.file));
        },
    };

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'db',
        callback: () => {
            document.getElementById('manageAttachments')?.click();
            return '';
        },
        aliases: ['databank', 'data-bank'],
        helpString: 'Open the data bank',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'db-list',
        callback: listDataBankAttachments,
        aliases: ['databank-list', 'data-bank-list'],
        helpString: 'List attachments in the Data Bank as a JSON-serialized array. Optionally, provide the source of the attachments and the field to list by.',
        namedArgumentList: [
            // @ts-expect-error TS(2345): Argument of type '""' is not assignable to paramet... Remove this comment to see the full error message
            new SlashCommandNamedArgument('source', 'The source of the attachments.', ARGUMENT_TYPE.STRING, false, false, '', TYPES),
            // @ts-expect-error TS(2345): Argument of type '"url"' is not assignable to para... Remove this comment to see the full error message
            new SlashCommandNamedArgument('field', 'The field to list by.', ARGUMENT_TYPE.STRING, false, false, 'url', FIELDS),
        ],
        returns: ARGUMENT_TYPE.LIST,
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'db-get',
        callback: getDataBankText,
        aliases: ['databank-get', 'data-bank-get'],
        helpString: 'Get attachment text from the Data Bank. Either provide the name or URL of the attachment. Optionally, provide the source of the attachment.',
        namedArgumentList: [
            // @ts-expect-error TS(2345): Argument of type '""' is not assignable to paramet... Remove this comment to see the full error message
            new SlashCommandNamedArgument('source', 'The source of the attachment.', ARGUMENT_TYPE.STRING, false, false, '', TYPES),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'The name or URL of the attachment.',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                acceptsMultiple: false,
                enumProvider: localEnumProviders.attachments('name', ''),
            }),
        ],
        returns: ARGUMENT_TYPE.STRING,
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'db-add',
        callback: uploadDataBankAttachment,
        aliases: ['databank-add', 'data-bank-add'],
        helpString: 'Add an attachment to the Data Bank. If name is not provided, it will be generated automatically. Returns the URL of the attachment.',
        namedArgumentList: [
            // @ts-expect-error TS(2345): Argument of type '"chat"' is not assignable to par... Remove this comment to see the full error message
            new SlashCommandNamedArgument('source', 'The source for the attachment.', ARGUMENT_TYPE.STRING, false, false, 'chat', TYPES),
            new SlashCommandNamedArgument('name', 'The name of the attachment.', ARGUMENT_TYPE.STRING, false, false),
        ],
        unnamedArgumentList: [
            new SlashCommandArgument('The content of the file attachment.', ARGUMENT_TYPE.STRING, true, false),
        ],
        returns: ARGUMENT_TYPE.STRING,
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'db-update',
        callback: updateDataBankAttachment,
        aliases: ['databank-update', 'data-bank-update'],
        helpString: 'Update an attachment in the Data Bank, preserving its name. Returns a new URL of the attachment.',
        namedArgumentList: [
            // @ts-expect-error TS(2345): Argument of type '"chat"' is not assignable to par... Remove this comment to see the full error message
            new SlashCommandNamedArgument('source', 'The source for the attachment.', ARGUMENT_TYPE.STRING, false, false, 'chat', TYPES),
            SlashCommandNamedArgument.fromProps({
                name: 'name',
                description: 'The name of the attachment.',
                typeList: [ARGUMENT_TYPE.STRING],
                enumProvider: localEnumProviders.attachments('name'),
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'url',
                description: 'The URL of the attachment.',
                typeList: [ARGUMENT_TYPE.STRING],
                enumProvider: localEnumProviders.attachments('url'),
            }),
        ],
        unnamedArgumentList: [
            new SlashCommandArgument('The content of the file attachment.', ARGUMENT_TYPE.STRING, true, false),
        ],
        returns: ARGUMENT_TYPE.STRING,
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'db-disable',
        callback: disableDataBankAttachment,
        aliases: ['databank-disable', 'data-bank-disable'],
        helpString: 'Disable an attachment in the Data Bank by its name or URL. Optionally, provide the source of the attachment.',
        namedArgumentList: [
            // @ts-expect-error TS(2345): Argument of type '""' is not assignable to paramet... Remove this comment to see the full error message
            new SlashCommandNamedArgument('source', 'The source of the attachment.', ARGUMENT_TYPE.STRING, false, false, '', TYPES),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'The name or URL of the attachment.',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: localEnumProviders.attachments('name', ''),
            }),
        ],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'db-enable',
        callback: enableDataBankAttachment,
        aliases: ['databank-enable', 'data-bank-enable'],
        helpString: 'Enable an attachment in the Data Bank by its name or URL. Optionally, provide the source of the attachment.',
        namedArgumentList: [
            // @ts-expect-error TS(2345): Argument of type '""' is not assignable to paramet... Remove this comment to see the full error message
            new SlashCommandNamedArgument('source', 'The source of the attachment.', ARGUMENT_TYPE.STRING, false, false, '', TYPES),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'The name or URL of the attachment.',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: localEnumProviders.attachments('name', ''),
            }),
        ],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'db-delete',
        callback: deleteDataBankAttachment,
        aliases: ['databank-delete', 'data-bank-delete'],
        helpString: 'Delete an attachment from the Data Bank.',
        namedArgumentList: [
            // @ts-expect-error TS(2345): Argument of type '"chat"' is not assignable to par... Remove this comment to see the full error message
            new SlashCommandNamedArgument('source', 'The source of the attachment.', ARGUMENT_TYPE.STRING, false, false, 'chat', TYPES),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'The name or URL of the attachment.',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: localEnumProviders.attachments(),
            }),
        ],
    }));
}
