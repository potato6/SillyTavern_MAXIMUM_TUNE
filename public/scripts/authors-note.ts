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
import { getCharaFilename, debounce } from './utils.js';
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
} as const;

const chara_note_position = {
    replace: 0,
    before: 1,
    after: 2,
} as const;

// Types to keep V8 inline caches monomorphic
interface CharaNote {
    name: string;
    prompt: string;
    useChara: boolean;
    position: number;
}

interface NoteSettings {
    default?: string;
    defaultDepth?: number;
    defaultInterval?: number;
    defaultPosition?: number;
    defaultRole?: number;
    allowWIScan?: boolean;
    chara?: CharaNote[];
}

interface ChatMetadata {
    [metadata_keys.prompt]?: string;
    [metadata_keys.interval]?: number;
    [metadata_keys.depth]?: number;
    [metadata_keys.position]?: number;
    [metadata_keys.role]?: number;
    [key: string]: unknown;
}

// Cached dictionaries for O(1) lookups
const VALID_POSITIONS: Record<string, number> = { 'after': 0, 'scenario': 0, 'chat': 1, 'before_scenario': 2, 'before': 2 };
const POSITION_NAMES = ['after', 'chat', 'before'];

const VALID_ROLES: Record<string, number> = { 'system': 0, 'user': 1, 'assistant': 2 };
const ROLE_NAMES = ['system', 'user', 'assistant'];

// DOM Element cache for hot paths
const elements = {
    fp: () => document.getElementById('extension_floating_prompt') as HTMLInputElement | null,
    counter: () => document.getElementById('extension_floating_counter'),
    anContainer: () => document.getElementById('floatingPrompt'),
    options: () => document.getElementById('options'),
};

function getMeta(): ChatMetadata {
    return chat_metadata as ChatMetadata;
}

function getSettings(): NoteSettings {
    return extension_settings.note as NoteSettings;
}

function getCurrentCharaNote(): CharaNote | undefined {
    const charaArray = getSettings().chara;
    if (!charaArray) return undefined;
    const filename = getCharaFilename();
    return charaArray.find(c => c.name === filename);
}

// Generic metadata update command
function createMetadataCommand(
    key: keyof ChatMetadata,
    domId: string,
    successMsg: string,
    parseFn: (val: string) => number | undefined,
    reverseLookupFn?: (val: number) => string
) {
    return (_: string, text: string) => {
        if (text) {
            const value = parseFn(text);
            if (value === undefined) {
                notyf.error(t`Invalid value provided`);
                return;
            }

            const el = document.getElementById(domId) as HTMLInputElement | null;
            if (el) {
                el.value = String(value);
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
            notyf.success(successMsg);
        }

        const currentVal = getMeta()[key] as number;
        return reverseLookupFn ? reverseLookupFn(currentVal) : currentVal;
    };
}

const setNoteTextCommand = (_: string, text: string) => {
    if (text) {
        const fp = elements.fp();
        if (fp) {
            fp.value = text;
            fp.dispatchEvent(new Event('input', { bubbles: true }));
        }
        notyf.success(t`Author's Note text updated`);
    }
    return getMeta()[metadata_keys.prompt];
};

const setNoteDepthCommand = createMetadataCommand(
    metadata_keys.depth, 'extension_floating_depth', t`Author's Note depth updated`,
    (val) => Number.isNaN(Number(val)) ? undefined : Math.abs(Number(val))
);

const setNoteIntervalCommand = createMetadataCommand(
    metadata_keys.interval, 'extension_floating_interval', t`Author's Note frequency updated`,
    (val) => Number.isNaN(Number(val)) ? undefined : Math.abs(Number(val))
);

const setNotePositionCommand = (_: string, text: string) => {
    if (text) {
        const pos = VALID_POSITIONS[text.trim().toLowerCase()];
        if (pos === undefined) return notyf.error(t`Not a valid position`);

        const posEl = document.querySelector(`input[name="extension_floating_position"][value="${pos}"]`) as HTMLInputElement | null;
        if (posEl) {
            posEl.checked = true;
            posEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
        notyf.info(t`Author's Note position updated`);
    }
    const val = getMeta()[metadata_keys.position] ?? 1;
    return POSITION_NAMES[val];
};

const setNoteRoleCommand = (_: string, text: string) => {
    if (text) {
        const role = VALID_ROLES[text.trim().toLowerCase()];
        if (role === undefined) return notyf.error(t`Not a valid role`);

        const fr = document.getElementById('extension_floating_role') as HTMLInputElement | null;
        if (fr) {
            fr.value = String(role);
            fr.dispatchEvent(new Event('input', { bubbles: true }));
        }
        notyf.info(t`Author's Note role updated`);
    }
    const val = getMeta()[metadata_keys.role] ?? 0;
    return ROLE_NAMES[val];
};

function updateSettings() {
    saveSettingsDebounced();
    loadSettings();
    setFloatingPrompt();
}

// Generic debounced token counter
const updateTokenCounter = debounce(async (value: string, elementId: string) => {
    const el = document.getElementById(elementId);
    if (el) el.textContent = String(await getTokenCountAsync(value));
}, debounce_timeout.relaxed);

async function onExtensionFloatingPromptInput(this: HTMLInputElement) {
    getMeta()[metadata_keys.prompt] = this.value;
    updateTokenCounter(this.value, 'extension_floating_prompt_token_counter');
    updateSettings();
    saveMetadataDebounced();
}

async function onExtensionFloatingIntervalInput(this: HTMLInputElement) {
    getMeta()[metadata_keys.interval] = Number(this.value);
    updateSettings();
    saveMetadataDebounced();
}

async function onExtensionFloatingDepthInput(this: HTMLInputElement) {
    const value = Math.abs(Number(this.value));
    if (Number(this.value) < 0) this.value = String(value);

    getMeta()[metadata_keys.depth] = value;
    updateSettings();
    saveMetadataDebounced();
}

async function onExtensionFloatingPositionInput(e: Event) {
    getMeta()[metadata_keys.position] = Number((e.target as HTMLInputElement).value);
    updateSettings();
    saveMetadataDebounced();
}

function onExtensionFloatingRoleInput(e: Event) {
    getMeta()[metadata_keys.role] = Number((e.target as HTMLInputElement).value);
    updateSettings();
}

async function onDefaultPositionInput(e: Event) {
    getSettings().defaultPosition = Number((e.target as HTMLInputElement).value);
    saveSettingsDebounced();
}

async function onDefaultDepthInput(this: HTMLInputElement) {
    const value = Math.abs(Number(this.value));
    if (Number(this.value) < 0) this.value = String(value);
    getSettings().defaultDepth = value;
    saveSettingsDebounced();
}

async function onDefaultIntervalInput(this: HTMLInputElement) {
    getSettings().defaultInterval = Number(this.value);
    saveSettingsDebounced();
}

function onExtensionDefaultRoleInput(e: Event) {
    getSettings().defaultRole = Number((e.target as HTMLInputElement).value);
    saveSettingsDebounced();
}

async function onExtensionFloatingCharPositionInput(e: Event) {
    const charaNote = getCurrentCharaNote();
    if (charaNote) {
        charaNote.position = Number((e.target as HTMLInputElement).value);
        updateSettings();
    }
}

function onExtensionFloatingCharaPromptInput(this: HTMLInputElement) {
    const tempPrompt = this.value;
    const avatarName = getCharaFilename();
    const note = getSettings();

    updateTokenCounter(tempPrompt, 'extension_floating_chara_token_counter');

    if (!note.chara) note.chara = [];
    const charaNote = getCurrentCharaNote();

    if (tempPrompt.length === 0 && charaNote && !charaNote.useChara) {
        note.chara = note.chara.filter(c => c.name !== avatarName);
    } else if (charaNote) {
        charaNote.prompt = tempPrompt;
    } else if (avatarName && tempPrompt.length > 0) {
        note.chara.push({ name: avatarName, prompt: tempPrompt, useChara: false, position: chara_note_position.replace });
    } else {
        notyf.error(t`Something went wrong. Could not save character's author's note.`);
        return;
    }

    updateSettings();
}

function onExtensionFloatingCharaCheckboxChanged(this: HTMLInputElement) {
    const charaNote = getCurrentCharaNote();
    if (charaNote) {
        charaNote.useChara = !!this.checked;
        updateSettings();
    }
}

function onExtensionFloatingDefaultInput(this: HTMLInputElement) {
    getSettings().default = this.value;
    updateTokenCounter(this.value, 'extension_floating_default_token_counter');
    updateSettings();
}

function onAllowWIScanCheckboxChanged(this: HTMLInputElement) {
    getSettings().allowWIScan = !!this.checked;
    updateSettings();
}

function loadSettings() {
    const note = getSettings();
    note.defaultPosition ??= 1;
    note.defaultDepth ??= 4;
    note.defaultInterval ??= 1;
    note.defaultRole ??= extension_prompt_roles.SYSTEM;

    const meta = getMeta();
    meta[metadata_keys.prompt] ??= note.default ?? '';
    meta[metadata_keys.interval] ??= note.defaultInterval;
    meta[metadata_keys.position] ??= note.defaultPosition;
    meta[metadata_keys.depth] ??= note.defaultDepth;
    meta[metadata_keys.role] ??= note.defaultRole;

    const fpEl = elements.fp();
    if (fpEl) fpEl.value = meta[metadata_keys.prompt] as string;

    document.getElementById('extension_floating_interval')?.setAttribute('value', String(meta[metadata_keys.interval]));
    document.getElementById('extension_floating_depth')?.setAttribute('value', String(meta[metadata_keys.depth]));
    document.getElementById('extension_floating_role')?.setAttribute('value', String(meta[metadata_keys.role]));

    const wiScanEl = document.getElementById('extension_floating_allow_wi_scan') as HTMLInputElement | null;
    if (wiScanEl) wiScanEl.checked = !!note.allowWIScan;

    const fpPosEl = document.querySelector(`input[name="extension_floating_position"][value="${meta[metadata_keys.position]}"]`) as HTMLInputElement | null;
    if (fpPosEl) fpPosEl.checked = true;

    const charaNote = getContext().characterId !== undefined ? getCurrentCharaNote() : undefined;
    const charaPromptEl = document.getElementById('extension_floating_chara');
    const charaUseEl = document.getElementById('extension_use_floating_chara') as HTMLInputElement | null;
    const charaPosElValue = charaNote?.position ?? chara_note_position.replace;

    charaPromptEl?.setAttribute('value', charaNote ? charaNote.prompt : '');
    if (charaUseEl) charaUseEl.checked = !!charaNote?.useChara;

    const fcpEl = document.querySelector(`input[name="extension_floating_char_position"][value="${charaPosElValue}"]`) as HTMLInputElement | null;
    if (fcpEl) fcpEl.checked = true;

    const fdEl = document.getElementById('extension_floating_default') as HTMLInputElement | null;
    if (fdEl) fdEl.value = note.default ?? '';

    const setVal = (id: string, val: number | string) => {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (el) el.value = String(val);
    };

    setVal('extension_default_depth', note.defaultDepth);
    setVal('extension_default_interval', note.defaultInterval);
    setVal('extension_default_role', note.defaultRole);

    const dpEl = document.querySelector(`input[name="extension_default_position"][value="${note.defaultPosition}"]`) as HTMLInputElement | null;
    if (dpEl) dpEl.checked = true;
}

export function setFloatingPrompt() {
    const context = getContext();
    if (!context.groupId && context.characterId === undefined) {
        shouldWIAddPrompt = false;
        return;
    }

    const meta = getMeta();
    const note = getSettings();
    const chat = context.chat as Array<{ is_user?: boolean }> | undefined;

    let lastMessageNumber = 0;
    if (chat) {
        for (const msg of chat) {
            if (msg.is_user) lastMessageNumber++;
        }
    }

    const interval = Number(meta[metadata_keys.interval]);
    if (interval === 1) lastMessageNumber = 1;

    const counterEl = elements.counter();

    if (lastMessageNumber <= 0 || interval <= 0) {
        context.setExtensionPrompt(MODULE_NAME, '', extension_prompt_types.NONE, MAX_INJECTION_DEPTH);
        if (counterEl) counterEl.textContent = '(disabled)';
        shouldWIAddPrompt = false;
        return;
    }

    const messagesTillInsertion = lastMessageNumber >= interval ? (lastMessageNumber % interval) : (interval - lastMessageNumber);
    shouldWIAddPrompt = (messagesTillInsertion === 0);

    let prompt = '';
    if (shouldWIAddPrompt) {
        const fpEl = elements.fp();
        prompt = fpEl ? fpEl.value : '';

        if (context.characterId !== undefined) {
            const charaNote = getCurrentCharaNote();
            if (charaNote && charaNote.useChara) {
                if (charaNote.position === chara_note_position.before) prompt = `${charaNote.prompt}\n${prompt}`;
                else if (charaNote.position === chara_note_position.after) prompt = `${prompt}\n${charaNote.prompt}`;
                else prompt = charaNote.prompt;
            }
        }
    }

    context.setExtensionPrompt(
        MODULE_NAME,
        prompt,
        Number(meta[metadata_keys.position]),
        Number(meta[metadata_keys.depth]),
        !!note.allowWIScan,
        Number(meta[metadata_keys.role]),
    );

    if (counterEl) counterEl.textContent = shouldWIAddPrompt ? '0' : String(messagesTillInsertion);
}

function onANMenuItemClick() {
    if (!selected_group && this_chid === undefined) {
        return notyf.warning(t`Select a character before trying to use Author's Note`, '', { timeOut: 2000 });
    }

    const anContainer = elements.anContainer();
    if (anContainer && anContainer.style.display !== 'flex') {
        anContainer.classList.add('resizing');
        anContainer.style.display = 'flex';
        anContainer.style.opacity = '0';
        anContainer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: animation_duration, fill: 'forwards' })
            .onfinish = () => anContainer.classList.remove('resizing');

        const toggleElement = document.getElementById('ANBlockToggle');
        const drawerContent = toggleElement?.closest('.inline-drawer-content') as HTMLElement | null;
        if (drawerContent?.style.display !== 'block') {
            toggleElement?.click();
        }
    } else if (anContainer) {
        anContainer.classList.add('resizing');
        anContainer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: animation_duration, fill: 'forwards' })
            .onfinish = () => {
                anContainer.style.display = 'none';
                anContainer.classList.remove('resizing');
            };
    }

    const optionsEl = elements.options();
    if (optionsEl) {
        optionsEl.style.transition = `opacity ${animation_duration}ms`;
        optionsEl.style.opacity = '0';
        setTimeout(() => { optionsEl.style.display = 'none'; }, animation_duration);
    }
}

async function onChatChanged() {
    loadSettings();
    setFloatingPrompt();
    const context = getContext();
    const meta = getMeta();
    const note = getSettings();

    const charaInput = document.getElementById('extension_floating_chara') as HTMLInputElement | null;
    if (charaInput) charaInput.disabled = !!context.groupId;

    updateTokenCounter(meta[metadata_keys.prompt] ?? '', 'extension_floating_prompt_token_counter');
    updateTokenCounter(note.default ?? '', 'extension_floating_default_token_counter');

    const charaNote = context.characterId !== undefined ? getCurrentCharaNote() : undefined;
    updateTokenCounter(charaNote?.prompt ?? '', 'extension_floating_chara_token_counter');
}

export function initAuthorsNote() {
    const bind = (id: string, event: string, handler: EventListener) => {
        document.getElementById(id)?.addEventListener(event, handler);
    };
    const bindQuery = (query: string, event: string, handler: EventListener) => {
        document.querySelector(query)?.addEventListener(event, handler);
    };

    bind('extension_floating_prompt', 'input', onExtensionFloatingPromptInput);
    bind('extension_floating_interval', 'input', onExtensionFloatingIntervalInput);
    bind('extension_floating_depth', 'input', onExtensionFloatingDepthInput);
    bind('extension_floating_chara', 'input', onExtensionFloatingCharaPromptInput);
    bind('extension_use_floating_chara', 'input', onExtensionFloatingCharaCheckboxChanged);
    bind('extension_floating_default', 'input', onExtensionFloatingDefaultInput);
    bind('extension_default_depth', 'input', onDefaultDepthInput);
    bind('extension_default_interval', 'input', onDefaultIntervalInput);
    bind('extension_floating_allow_wi_scan', 'input', onAllowWIScanCheckboxChanged);
    bind('extension_floating_role', 'input', onExtensionFloatingRoleInput);
    bind('extension_default_role', 'input', onExtensionDefaultRoleInput);
    bindQuery('input[name="extension_floating_position"]', 'change', onExtensionFloatingPositionInput);
    bindQuery('input[name="extension_default_position"]', 'change', onDefaultPositionInput);
    bindQuery('input[name="extension_floating_char_position"]', 'change', onExtensionFloatingCharPositionInput);

    bind('ANClose', 'click', () => {
        const fp = elements.anContainer();
        if (fp) {
            fp.animate([{ opacity: 1 }, { opacity: 0 }], { duration: animation_duration, easing: 'ease-in-out', fill: 'forwards' })
                .onfinish = () => fp.style.display = 'none';
        }
    });
    bind('option_toggle_AN', 'click', onANMenuItemClick);

    type SlashCmdCallback = (_: string, text: string) => unknown;
    const addCmd = (name: string, aliases: string[], cb: SlashCmdCallback, returns: string, help: string, argType: (typeof ARGUMENT_TYPE)[keyof typeof ARGUMENT_TYPE], enumList?: never[]) => {
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name, aliases, callback: cb, returns,
            unnamedArgumentList: [new SlashCommandArgument('value', [argType], false, false, null, enumList)],
            helpString: `<div>${help}</div>`,
        }));
    };

    addCmd('note', [], setNoteTextCommand, "current author's note", "Sets an author's note for the currently selected chat if specified and returns the current note.", ARGUMENT_TYPE.STRING);
    addCmd('note-depth', ['depth'], setNoteDepthCommand, "current author's note depth", "Sets an author's note depth for in-chat positioning if specified and returns the current depth.", ARGUMENT_TYPE.NUMBER);
    addCmd('note-frequency', ['freq', 'note-freq'], setNoteIntervalCommand, "current author's note insertion frequency", "Sets an author's note insertion frequency if specified and returns the current frequency.", ARGUMENT_TYPE.NUMBER);
    addCmd('note-position', ['pos', 'note-pos'], setNotePositionCommand, "current author's note insertion position", "Sets an author's note position if specified and returns the current position.", ARGUMENT_TYPE.STRING, ['before', 'after', 'chat'] as never[]);
    addCmd('note-role', [], setNoteRoleCommand, "current author's note chat insertion role", "Sets an author's note chat insertion role if specified and returns the current role.", ARGUMENT_TYPE.STRING, ['system', 'user', 'assistant'] as never[]);

    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
    registerAuthorsNoteMacros();
}

function registerAuthorsNoteMacros() {
    const getCharaNotePrompt = () => (this_chid !== undefined ? getCurrentCharaNote()?.prompt ?? '' : '');
    const getDefaultNote = () => getSettings().default ?? '';
    const getNote = () => getMeta()[metadata_keys.prompt] ?? '';

    if (power_user.experimental_macro_engine) {
        macros.register('authorsNote', { category: MacroCategory.PROMPTS, description: t`The contents of the Author's Note`, handler: getNote });
        macros.register('charAuthorsNote', { category: MacroCategory.PROMPTS, description: t`The contents of the Character Author's Note`, handler: getCharaNotePrompt });
        macros.register('defaultAuthorsNote', { category: MacroCategory.PROMPTS, description: t`The contents of the Default Author's Note`, handler: getDefaultNote });
    } else {
        MacrosParser.registerMacro('authorsNote', getNote, t`The contents of the Author's Note`);
        MacrosParser.registerMacro('charAuthorsNote', getCharaNotePrompt, t`The contents of the Character Author's Note`);
        MacrosParser.registerMacro('defaultAuthorsNote', getDefaultNote, t`The contents of the Default Author's Note`);
    }
}
