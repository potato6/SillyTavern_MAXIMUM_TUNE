import {
    MAX_INJECTION_DEPTH,
    animation_duration,
    chat_metadata,
    eventSource,
    event_types,
    extension_prompt_roles,
    extension_prompt_types,
    saveSettingsDebounced,
    this_chid,
} from '../script.js';
import { selected_group } from './group-chats.js';
import { extension_settings, getContext, saveMetadataDebounced } from './extensions.js';
import { getCharaFilename, debounce, delay } from './utils.js';
import { getTokenCountAsync } from './tokenizers.js';
import { debounce_timeout } from './constants.js';
import { SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument } from './slash-commands/SlashCommandArgument.js';
export { MODULE_NAME as NOTE_MODULE_NAME };
import { t } from './i18n.js';
import { macros, MacroCategory } from './macros/macro-system.js';
import { MacrosParser } from './macros.js';
import { power_user } from './power-user.js';

const MODULE_NAME = '2_floating_prompt'; // <= Deliberate, for sorting lower than memory

export let shouldWIAddPrompt = false;

export const metadata_keys = {
    prompt: 'note_prompt',
    interval: 'note_interval',
    depth: 'note_depth',
    position: 'note_position',
    role: 'note_role',
};

const chara_note_position = {
    replace: 0,
    before: 1,
    after: 2,
};

/**
 * @param {string} _ Unused
 * @param {string} text Text to set as author's note
 * @returns {string} Current author's note text
 */
function setNoteTextCommand(_: string, text: string) {
    if (text) {
        const fp = document.getElementById('extension_floating_prompt') as HTMLInputElement | null;
        if (fp) {
            fp.value = text;
            fp.dispatchEvent(new Event('input', { bubbles: true }));
        }
        notyf.success(t`Author's Note text updated`);
    }
    return (chat_metadata as Record<string, unknown>)[metadata_keys.prompt] as string;
}

/**
 * @param {string} _ Unused
 * @param {string} text Depth value to set
 * @returns {number|undefined} Current depth, or undefined if invalid
 */
function setNoteDepthCommand(_: string, text: string) {
    if (text) {
        const value = Number(text);

        if (Number.isNaN(value)) {
            notyf.error(t`Not a valid number`);
            return;
        }

        const fd = document.getElementById('extension_floating_depth') as HTMLInputElement | null;
        if (fd) {
            fd.value = String(Math.abs(value));
            fd.dispatchEvent(new Event('input', { bubbles: true }));
        }
        notyf.success(t`Author's Note depth updated`);
    }
    return (chat_metadata as Record<string, unknown>)[metadata_keys.depth] as number | undefined;
}

/**
 * @param {string} _ Unused
 * @param {string} text Interval value to set
 * @returns {number|undefined} Current interval, or undefined if invalid
 */
function setNoteIntervalCommand(_: string, text: string) {
    if (text) {
        const value = Number(text);

        if (Number.isNaN(value)) {
            notyf.error(t`Not a valid number`);
            return;
        }

        const fi = document.getElementById('extension_floating_interval') as HTMLInputElement | null;
        if (fi) {
            fi.value = String(Math.abs(value));
            fi.dispatchEvent(new Event('input', { bubbles: true }));
        }
        notyf.success(t`Author's Note frequency updated`);
    }
    return (chat_metadata as Record<string, unknown>)[metadata_keys.interval] as number | undefined;
}

/**
 * @param {string} _ Unused
 * @param {string} text Position value to set
 * @returns {string|undefined} Current position name, or undefined if invalid
 */
function setNotePositionCommand(_: string, text: string) {
    const validPositions: Record<string, number> = {
        'after': 0,
        'scenario': 0,
        'chat': 1,
        'before_scenario': 2,
        'before': 2,
    };

    if (text) {
        const position = validPositions[text?.trim()?.toLowerCase() ?? ''];

        if (typeof position === 'undefined') {
            notyf.error(t`Not a valid position`);
            return;
        }

        const posEl = document.querySelector(`input[name="extension_floating_position"][value="${position}"]`) as HTMLInputElement | null;
        if (posEl) {
            posEl.checked = true;
            posEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
        notyf.info(t`Author's Note position updated`);
    }
    return Object.keys(validPositions).find(key => validPositions[key] == (chat_metadata as Record<string, unknown>)[metadata_keys.position]);
}

/**
 * @param {string} _ Unused
 * @param {string} text Role value to set
 * @returns {string|undefined} Current role name, or undefined if invalid
 */
function setNoteRoleCommand(_: string, text: string) {
    const validRoles: Record<string, number> = {
        'system': 0,
        'user': 1,
        'assistant': 2,
    };

    if (text) {
        const role = validRoles[text?.trim()?.toLowerCase() ?? ''];

        if (typeof role === 'undefined') {
            notyf.error(t`Not a valid role`);
            return;
        }

        const fr = document.getElementById('extension_floating_role') as HTMLInputElement | null;
        if (fr) {
            fr.value = String(Math.abs(role));
            fr.dispatchEvent(new Event('input', { bubbles: true }));
        }
        notyf.info(t`Author's Note role updated`);
    }
    return Object.keys(validRoles).find(key => validRoles[key] == (chat_metadata as Record<string, unknown>)[metadata_keys.role]);
}

/**
 *
 */
function updateSettings() {
    saveSettingsDebounced();
    loadSettings();
    setFloatingPrompt();
}

const setMainPromptTokenCounterDebounced = debounce(async (value: string) => {
    const el = document.getElementById('extension_floating_prompt_token_counter');
    if (el) el.textContent = await getTokenCountAsync(value);
}, debounce_timeout.relaxed);

const setCharaPromptTokenCounterDebounced = debounce(async (value: string) => {
    const el = document.getElementById('extension_floating_chara_token_counter');
    if (el) el.textContent = await getTokenCountAsync(value);
}, debounce_timeout.relaxed);

const setDefaultPromptTokenCounterDebounced = debounce(async (value: string) => {
    const el = document.getElementById('extension_floating_default_token_counter');
    if (el) el.textContent = await getTokenCountAsync(value);
}, debounce_timeout.relaxed);

/**
 *
 */
async function onExtensionFloatingPromptInput(this: HTMLInputElement) {
    (chat_metadata as Record<string, unknown>)[metadata_keys.prompt] = this.value;
    setMainPromptTokenCounterDebounced((chat_metadata as Record<string, unknown>)[metadata_keys.prompt] as string);
    updateSettings();
    saveMetadataDebounced();
}

/**
 *
 */
async function onExtensionFloatingIntervalInput(this: HTMLInputElement) {
    (chat_metadata as Record<string, unknown>)[metadata_keys.interval] = Number(this.value);
    updateSettings();
    saveMetadataDebounced();
}

/**
 *
 */
async function onExtensionFloatingDepthInput(this: HTMLInputElement) {
    let value = Number(this.value);

    if (value < 0) {
        value = Math.abs(value);
        this.value = String(value);
    }

    (chat_metadata as Record<string, unknown>)[metadata_keys.depth] = value;
    updateSettings();
    saveMetadataDebounced();
}

/**
 * @param {Event} e Input event
 */
async function onExtensionFloatingPositionInput(e: Event) {
    (chat_metadata as Record<string, unknown>)[metadata_keys.position] = Number((e.target as HTMLInputElement).value);
    updateSettings();
    saveMetadataDebounced();
}

/**
 * @param {Event} e Input event
 */
async function onDefaultPositionInput(e: Event) {
    (extension_settings.note as Record<string, unknown>).defaultPosition = Number((e.target as HTMLInputElement).value);
    saveSettingsDebounced();
}

/**
 *
 */
async function onDefaultDepthInput(this: HTMLInputElement) {
    let value = Number(this.value);

    if (value < 0) {
        value = Math.abs(value);
        this.value = String(value);
    }

    (extension_settings.note as Record<string, unknown>).defaultDepth = value;
    saveSettingsDebounced();
}

/**
 *
 */
async function onDefaultIntervalInput(this: HTMLInputElement) {
    (extension_settings.note as Record<string, unknown>).defaultInterval = Number(this.value);
    saveSettingsDebounced();
}

/**
 * @param {Event} e Input event
 */
function onExtensionFloatingRoleInput(e: Event) {
    (chat_metadata as Record<string, unknown>)[metadata_keys.role] = Number((e.target as HTMLInputElement).value);
    updateSettings();
}

/**
 * @param {Event} e Input event
 */
function onExtensionDefaultRoleInput(e: Event) {
    (extension_settings.note as Record<string, unknown>).defaultRole = Number((e.target as HTMLInputElement).value);
    saveSettingsDebounced();
}

/**
 * @param {Event} e Input event
 */
async function onExtensionFloatingCharPositionInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    const note = extension_settings.note as Record<string, unknown>;
    const chara = note.chara as Array<Record<string, unknown>> | undefined;
    const charaNote = chara?.find((ch) => ch.name === getCharaFilename());

    if (charaNote) {
        charaNote.position = Number(value);
        updateSettings();
    }
}

/**
 *
 */
function onExtensionFloatingCharaPromptInput(this: HTMLInputElement) {
    const tempPrompt = this.value;
    const avatarName = getCharaFilename();
    const tempCharaNote: Record<string, unknown> = {
        name: avatarName,
        prompt: tempPrompt,
    };

    setCharaPromptTokenCounterDebounced(tempPrompt);

    const note = extension_settings.note as Record<string, unknown>;
    const chara = note.chara as Array<Record<string, unknown>> | undefined;

    let existingCharaNoteIndex: number | undefined;
    let existingCharaNote: Record<string, unknown> | undefined;

    if (chara) {
        existingCharaNoteIndex = chara.findIndex((e) => e.name === avatarName);
        existingCharaNote = chara[existingCharaNoteIndex];
    }

    if (tempPrompt.length === 0 &&
        chara &&
        existingCharaNote &&
        !existingCharaNote.useChara
    ) {
        if (existingCharaNoteIndex !== undefined) {
            chara.splice(existingCharaNoteIndex, 1);
        }
    } else if (chara && existingCharaNote) {
        Object.assign(existingCharaNote, tempCharaNote);
    } else if (avatarName && tempPrompt.length > 0) {
        if (!chara) {
            note.chara = [];
        }
        Object.assign(tempCharaNote, { useChara: false, position: chara_note_position.replace });
        (note.chara as Array<Record<string, unknown>>).push(tempCharaNote);
    } else {
        console.log('Character author\'s note error: No avatar name key could be found.');
        notyf.error(t`Something went wrong. Could not save character's author's note.`);

        // Don't save settings if something went wrong
        return;
    }

    updateSettings();
}

/**
 *
 */
function onExtensionFloatingCharaCheckboxChanged(this: HTMLInputElement) {
    const value = !!this.checked;
    const note = extension_settings.note as Record<string, unknown>;
    const chara = note.chara as Array<Record<string, unknown>> | undefined;
    const charaNote = chara?.find((e) => e.name === getCharaFilename());

    if (charaNote) {
        charaNote.useChara = value;
        updateSettings();
    }
}

/**
 *
 */
function onExtensionFloatingDefaultInput(this: HTMLInputElement) {
    (extension_settings.note as Record<string, unknown>).default = this.value;
    setDefaultPromptTokenCounterDebounced((extension_settings.note as Record<string, unknown>).default as string);
    updateSettings();
}

/**
 *
 */
function loadSettings() {
    const DEFAULT_DEPTH = 4;
    const DEFAULT_POSITION = 1;
    const DEFAULT_INTERVAL = 1;
    const DEFAULT_ROLE = extension_prompt_roles.SYSTEM;

    const note = extension_settings.note as Record<string, unknown>;

    if (note.defaultPosition === undefined) {
        note.defaultPosition = DEFAULT_POSITION;
    }

    if (note.defaultDepth === undefined) {
        note.defaultDepth = DEFAULT_DEPTH;
    }

    if (note.defaultInterval === undefined) {
        note.defaultInterval = DEFAULT_INTERVAL;
    }

    if (note.defaultRole === undefined) {
        note.defaultRole = DEFAULT_ROLE;
    }

    const meta = chat_metadata as Record<string, unknown>;

    meta[metadata_keys.prompt] = meta[metadata_keys.prompt] ?? note.default ?? '';
    meta[metadata_keys.interval] = meta[metadata_keys.interval] ?? note.defaultInterval ?? DEFAULT_INTERVAL;
    meta[metadata_keys.position] = meta[metadata_keys.position] ?? note.defaultPosition ?? DEFAULT_POSITION;
    meta[metadata_keys.depth] = meta[metadata_keys.depth] ?? note.defaultDepth ?? DEFAULT_DEPTH;
    meta[metadata_keys.role] = meta[metadata_keys.role] ?? note.defaultRole ?? DEFAULT_ROLE;

    const fpEl = document.getElementById('extension_floating_prompt') as HTMLInputElement | null;
    if (fpEl) fpEl.value = meta[metadata_keys.prompt] as string;
    document.getElementById('extension_floating_interval')?.setAttribute('value', String(meta[metadata_keys.interval]));
    const wiScanEl = document.getElementById('extension_floating_allow_wi_scan') as HTMLInputElement | null;
    if (wiScanEl) wiScanEl.checked = note.allowWIScan as boolean ?? false;
    document.getElementById('extension_floating_depth')?.setAttribute('value', String(meta[metadata_keys.depth]));
    document.getElementById('extension_floating_role')?.setAttribute('value', String(meta[metadata_keys.role]));
    const fpPosEl = document.querySelector(`input[name="extension_floating_position"][value="${meta[metadata_keys.position]}"]`) as HTMLInputElement | null;
    if (fpPosEl) fpPosEl.checked = true;

    const chara = note.chara as Array<Record<string, unknown>> | undefined;
    if (chara && getContext().characterId !== undefined) {
        const charaNote = chara.find((e) => e.name === getCharaFilename());

        document.getElementById('extension_floating_chara')?.setAttribute('value', charaNote ? String(charaNote.prompt) : '');
        const charaEl = document.getElementById('extension_use_floating_chara') as HTMLInputElement | null;
        if (charaEl) charaEl.checked = charaNote ? Boolean(charaNote.useChara) : false;
        const fcpEl = document.querySelector(`input[name="extension_floating_char_position"][value="${charaNote?.position ?? chara_note_position.replace}"]`) as HTMLInputElement | null;
        if (fcpEl) fcpEl.checked = true;
    } else {
        document.getElementById('extension_floating_chara')?.setAttribute('value', '');
        const charaEl2 = document.getElementById('extension_use_floating_chara') as HTMLInputElement | null;
        if (charaEl2) charaEl2.checked = false;
        const fcpEl2 = document.querySelector(`input[name="extension_floating_char_position"][value="${chara_note_position.replace}"]`) as HTMLInputElement | null;
        if (fcpEl2) fcpEl2.checked = true;
    }

    const fdEl = document.getElementById('extension_floating_default') as HTMLInputElement | null;
    if (fdEl) fdEl.value = note.default as string;
    const ddEl = document.getElementById('extension_default_depth') as HTMLInputElement | null;
    if (ddEl) ddEl.value = String(note.defaultDepth);
    const diEl = document.getElementById('extension_default_interval') as HTMLInputElement | null;
    if (diEl) diEl.value = String(note.defaultInterval);
    const drEl = document.getElementById('extension_default_role') as HTMLInputElement | null;
    if (drEl) drEl.value = String(note.defaultRole);
    const dpEl = document.querySelector(`input[name="extension_default_position"][value="${note.defaultPosition}"]`) as HTMLInputElement | null;
    if (dpEl) dpEl.checked = true;
}

/**
 *
 */
export function setFloatingPrompt() {
    const context = getContext();
    if (!context.groupId && context.characterId === undefined) {
        console.debug('setFloatingPrompt: Not in a chat. Skipping.');
        shouldWIAddPrompt = false;
        return;
    }

    const meta = chat_metadata as Record<string, unknown>;
    const note = extension_settings.note as Record<string, unknown>;
    const chara = note.chara as Array<Record<string, unknown>> | undefined;

    // take the count of messages
    const chat = context.chat as Array<Record<string, unknown>> | undefined;
    let lastMessageNumber = Array.isArray(chat) && chat.length ? chat.filter(m => m.is_user).length : 0;

    console.debug(`
    setFloatingPrompt entered
    ------
    lastMessageNumber = ${lastMessageNumber}
    metadata_keys.interval = ${meta[metadata_keys.interval]}
    metadata_keys.position = ${meta[metadata_keys.position]}
    metadata_keys.depth = ${meta[metadata_keys.depth]}
    metadata_keys.role = ${meta[metadata_keys.role]}
    ------
    `);

    // interval 1 should be inserted no matter what
    if (meta[metadata_keys.interval] === 1) {
        lastMessageNumber = 1;
    }

    if (lastMessageNumber <= 0 || Number(meta[metadata_keys.interval]) <= 0) {
        context.setExtensionPrompt(MODULE_NAME, '', extension_prompt_types.NONE, MAX_INJECTION_DEPTH);
        const counterEl = document.getElementById('extension_floating_counter');
        if (counterEl) counterEl.textContent = '(disabled)';
        shouldWIAddPrompt = false;
        return;
    }

    const messagesTillInsertion = lastMessageNumber >= Number(meta[metadata_keys.interval])
        ? (lastMessageNumber % Number(meta[metadata_keys.interval]))
        : (Number(meta[metadata_keys.interval]) - lastMessageNumber);
    const shouldAddPrompt = messagesTillInsertion == 0;
    shouldWIAddPrompt = shouldAddPrompt;

    const fpEl = document.getElementById('extension_floating_prompt') as HTMLInputElement | null;
    let prompt = shouldAddPrompt && fpEl ? fpEl.value : '';
    if (shouldAddPrompt && chara && getContext().characterId !== undefined) {
        const charaNote = chara.find((e) => e.name === getCharaFilename());

        // Only replace with the chara note if the user checked the box
        if (charaNote && charaNote.useChara) {
            switch (charaNote.position) {
                case chara_note_position.before:
                    prompt = String(charaNote.prompt) + '\n' + prompt;
                    break;
                case chara_note_position.after:
                    prompt = prompt + '\n' + String(charaNote.prompt);
                    break;
                default:
                    prompt = String(charaNote.prompt);
                    break;
            }
        }
    }
    context.setExtensionPrompt(
        MODULE_NAME,
        String(prompt),
        Number(meta[metadata_keys.position]),
        Number(meta[metadata_keys.depth]),
        note.allowWIScan as boolean,
        Number(meta[metadata_keys.role]),
    );
    const counterEl = document.getElementById('extension_floating_counter');
    if (counterEl) counterEl.textContent = shouldAddPrompt ? '0' : String(messagesTillInsertion);
}

/**
 *
 */
function onANMenuItemClick() {
    if (!selected_group && this_chid === undefined) {
        notyf.warning(t`Select a character before trying to use Author's Note`, '', { timeOut: 2000 });
        return;
    }

    //show AN if it's hidden
    const anContainer = document.getElementById('floatingPrompt');
    if (anContainer && anContainer.style.display !== 'flex') {
        anContainer.classList.add('resizing');
        anContainer.style.display = 'flex';
        anContainer.style.opacity = '0';
        const anim = anContainer.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: animation_duration,
            fill: 'forwards',
        });
        anim.onfinish = async function (this: Animation) {
            await delay(50);
            anContainer.classList.remove('resizing');
        };

        //auto-open the main AN inline drawer
        const toggleElement = document.getElementById('ANBlockToggle');
        const drawerContent = toggleElement?.closest('.inline-drawer-content') as HTMLElement | null;
        if (drawerContent?.style.display !== 'block') {
            anContainer?.classList.add('resizing');
            document.getElementById('ANBlockToggle')?.click();
        }
    } else {
        //hide AN if it's already displayed
        if (anContainer) {
            anContainer.classList.add('resizing');
            const anim = anContainer.animate([{ opacity: 1 }, { opacity: 0 }], {
                duration: animation_duration,
                fill: 'forwards',
            });
            anim.onfinish = async function (this: Animation) {
                await delay(50);
                anContainer.classList.remove('resizing');
            };
        }
        setTimeout(function () {
            if (anContainer) anContainer.style.display = 'none';
        }, animation_duration);
    }

    //duplicate options menu close handler from script.js
    //because this listener takes priority
    const optionsEl = document.getElementById('options');
    if (optionsEl) {
        optionsEl.style.transition = `opacity ${animation_duration}ms`;
        optionsEl.style.opacity = '0';
        setTimeout(() => { optionsEl.style.display = 'none'; }, animation_duration);
    }
}

/**
 *
 */
async function onChatChanged() {
    loadSettings();
    setFloatingPrompt();
    const context = getContext();
    const meta = chat_metadata as Record<string, unknown>;
    const note = extension_settings.note as Record<string, unknown>;
    const chara = note.chara as Array<Record<string, unknown>> | undefined;

    // Disable the chara note if in a group
    const charaInput = document.getElementById('extension_floating_chara') as HTMLInputElement | null;
    if (charaInput) charaInput.disabled = !!context.groupId;

    const tokenCounter1 = meta[metadata_keys.prompt] ? await getTokenCountAsync(meta[metadata_keys.prompt] as string) : 0;
    const ptcEl = document.getElementById('extension_floating_prompt_token_counter');
    if (ptcEl) ptcEl.textContent = String(tokenCounter1);

    let tokenCounter2: number | undefined;
    if (chara && context.characterId !== undefined) {
        const charaNote = chara.find((e) => e.name === getCharaFilename());

        if (charaNote) {
            tokenCounter2 = await getTokenCountAsync(charaNote.prompt as string);
        }
    }

    const ctcEl = document.getElementById('extension_floating_chara_token_counter');
    if (ctcEl) ctcEl.textContent = String(tokenCounter2 || 0);

    const tokenCounter3 = note.default ? await getTokenCountAsync(note.default as string) : 0;
    const dtcEl = document.getElementById('extension_floating_default_token_counter');
    if (dtcEl) dtcEl.textContent = String(tokenCounter3);
}

/**
 *
 */
function onAllowWIScanCheckboxChanged(this: HTMLInputElement) {
    (extension_settings.note as Record<string, unknown>).allowWIScan = !!this.checked;
    updateSettings();
}

/**
 * Inject author's note options and setup event listeners.
 */
// Inserts the extension first since it's statically imported
export function initAuthorsNote() {
    document.getElementById('extension_floating_prompt')?.addEventListener('input', onExtensionFloatingPromptInput);
    document.getElementById('extension_floating_interval')?.addEventListener('input', onExtensionFloatingIntervalInput);
    document.getElementById('extension_floating_depth')?.addEventListener('input', onExtensionFloatingDepthInput);
    document.getElementById('extension_floating_chara')?.addEventListener('input', onExtensionFloatingCharaPromptInput);
    document.getElementById('extension_use_floating_chara')?.addEventListener('input', onExtensionFloatingCharaCheckboxChanged);
    document.getElementById('extension_floating_default')?.addEventListener('input', onExtensionFloatingDefaultInput);
    document.getElementById('extension_default_depth')?.addEventListener('input', onDefaultDepthInput);
    document.getElementById('extension_default_interval')?.addEventListener('input', onDefaultIntervalInput);
    document.getElementById('extension_floating_allow_wi_scan')?.addEventListener('input', onAllowWIScanCheckboxChanged);
    document.getElementById('extension_floating_role')?.addEventListener('input', onExtensionFloatingRoleInput);
    document.getElementById('extension_default_role')?.addEventListener('input', onExtensionDefaultRoleInput);
    document.querySelector('input[name="extension_floating_position"]')?.addEventListener('change', onExtensionFloatingPositionInput);
    document.querySelector('input[name="extension_default_position"]')?.addEventListener('change', onDefaultPositionInput);
    document.querySelector('input[name="extension_floating_char_position"]')?.addEventListener('change', onExtensionFloatingCharPositionInput);
    document.getElementById('ANClose')?.addEventListener('click', function () {
        const fp = document.getElementById('floatingPrompt');
        if (fp) {
            fp.animate([{ opacity: 1 }, { opacity: 0 }], {
                duration: animation_duration,
                easing: 'ease-in-out',
                fill: 'forwards',
            });
        }
        setTimeout(function () { const fp = document.getElementById('floatingPrompt'); if (fp) fp.style.display = 'none'; }, animation_duration);
    });
    document.getElementById('option_toggle_AN')?.addEventListener('click', onANMenuItemClick);

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'note',
        callback: setNoteTextCommand,
        returns: 'current author\'s note',
        unnamedArgumentList: [
            new SlashCommandArgument(
                'text', [ARGUMENT_TYPE.STRING], false,
            ),
        ],
        helpString: `
            <div>
                Sets an author's note for the currently selected chat if specified and returns the current note.
            </div>
        `,
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'note-depth',
        aliases: ['depth'],
        callback: setNoteDepthCommand,
        returns: 'current author\'s note depth',
        unnamedArgumentList: [
            new SlashCommandArgument(
                'number', [ARGUMENT_TYPE.NUMBER], false,
            ),
        ],
        helpString: `
            <div>
                Sets an author's note depth for in-chat positioning if specified and returns the current depth.
            </div>
        `,
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'note-frequency',
        aliases: ['freq', 'note-freq'],
        callback: setNoteIntervalCommand,
        returns: 'current author\'s note insertion frequency',
        namedArgumentList: [],
        unnamedArgumentList: [
            new SlashCommandArgument(
                'number', [ARGUMENT_TYPE.NUMBER], false,
            ),
        ],
        helpString: `
            <div>
                Sets an author's note insertion frequency if specified and returns the current frequency.
            </div>
        `,
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'note-position',
        callback: setNotePositionCommand,
        aliases: ['pos', 'note-pos'],
        returns: 'current author\'s note insertion position',
        namedArgumentList: [],
        unnamedArgumentList: [
            new SlashCommandArgument(
                            'position', [ARGUMENT_TYPE.STRING], false, false, null, ['before', 'after', 'chat'] as never[],
                        ),
        ],
        helpString: `
            <div>
                Sets an author's note position if specified and returns the current position.
            </div>
        `,
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'note-role',
        callback: setNoteRoleCommand,
        returns: 'current author\'s note chat insertion role',
        namedArgumentList: [],
        unnamedArgumentList: [
            new SlashCommandArgument(
                            'role', [ARGUMENT_TYPE.STRING], false, false, null, ['system', 'user', 'assistant'] as never[],
                        ),
        ],
        helpString: `
            <div>
                Sets an author's note chat insertion role if specified and returns the current role.
            </div>
        `,
    }));
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);

    registerAuthorsNoteMacros();
}

/**
 *
 */
function registerAuthorsNoteMacros() {
    if (power_user.experimental_macro_engine) {
        macros.register('authorsNote', {
            category: MacroCategory.PROMPTS,
            description: t`The contents of the Author's Note`,
            handler: () => (chat_metadata as Record<string, unknown>)[metadata_keys.prompt] ?? '',
        });
        macros.register('charAuthorsNote', {
            category: MacroCategory.PROMPTS,
            description: t`The contents of the Character Author's Note`,
            handler: () => {
                if (this_chid === undefined) return '';
                const note = extension_settings.note as Record<string, unknown>;
                const chara = note.chara as Array<Record<string, unknown>> | undefined;
                if (!chara) return '';
                const found = chara.find((e) => e.name === getCharaFilename());
                return found?.prompt ?? '';
            },
        });
        macros.register('defaultAuthorsNote', {
            category: MacroCategory.PROMPTS,
            description: t`The contents of the Default Author's Note`,
            handler: () => (extension_settings.note as Record<string, unknown>).default ?? '',
        });
    } else {
        // TODO: Remove this when the experimental macro engine is replacing the old macro engine
        MacrosParser.registerMacro('authorsNote',
            () => (chat_metadata as Record<string, unknown>)[metadata_keys.prompt] ?? '',
            t`The contents of the Author's Note`,
        );
        MacrosParser.registerMacro('charAuthorsNote',
            () => {
                if (this_chid === undefined) return '';
                const note = extension_settings.note as Record<string, unknown>;
                const chara = note.chara as Array<Record<string, unknown>> | undefined;
                if (!chara) return '';
                const found = chara.find((e) => e.name === getCharaFilename());
                return found?.prompt ?? '';
            },
            t`The contents of the Character Author's Note`,
        );
        MacrosParser.registerMacro('defaultAuthorsNote',
            () => (extension_settings.note as Record<string, unknown>).default ?? '',
            t`The contents of the Default Author's Note`,
        );
    }
}
