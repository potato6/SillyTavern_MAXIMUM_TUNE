import {
    chat_metadata,
    substituteParams,
    this_chid,
    eventSource,
    event_types,
    saveSettingsDebounced,
    animation_duration,
} from '../script.js';
import { extension_settings, saveMetadataDebounced } from './extensions.js';
import { selected_group } from './group-chats.js';
import { getCharaFilename, delay } from './utils.js';
import { power_user } from './power-user.js';

const extensionName = 'cfg';
const defaultSettings = {
    global: {
        'guidance_scale': 1,
        'negative_prompt': '',
    },
    chara: [],
};
const settingType = {
    guidance_scale: 0,
    negative_prompt: 1,
    positive_prompt: 2,
};

/**
 *
 */
function updateSettings() {
    saveSettingsDebounced();
    loadSettings();
}

/**
 *
 * @param tempValue
 * @param setting
 */
function setCharCfg(tempValue: string, setting: number) {
    const avatarName = getCharaFilename();

    const tempCharaCfg: Record<string, unknown> = {
        name: avatarName,
    };

    switch (setting) {
        case settingType.guidance_scale:
            tempCharaCfg.guidance_scale = Number(tempValue);
            break;
        case settingType.negative_prompt:
            tempCharaCfg.negative_prompt = tempValue;
            break;
        case settingType.positive_prompt:
            tempCharaCfg.positive_prompt = tempValue;
            break;
        default:
            return false;
    }

    let existingCharaCfgIndex;
    let existingCharaCfg;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extSettings = extension_settings as any;

    if (extSettings.cfg.chara) {
        existingCharaCfgIndex = extSettings.cfg.chara.findIndex((e: Record<string, unknown>) => e.name === avatarName);
        existingCharaCfg = extSettings.cfg.chara[existingCharaCfgIndex];
    }

    if (extSettings.cfg.chara && existingCharaCfg) {
        const tempAssign = Object.assign(existingCharaCfg, tempCharaCfg);

        if (!existingCharaCfg.useChara &&
            (tempAssign.guidance_scale ?? 1.00) === 1.00 &&
            (tempAssign.negative_prompt?.length ?? 0) === 0 &&
            (tempAssign.positive_prompt?.length ?? 0) === 0) {
            extSettings.cfg.chara.splice(existingCharaCfgIndex, 1);
        }
    } else if (avatarName && tempValue.length > 0) {
        if (!extSettings.cfg.chara) {
            extSettings.cfg.chara = [];
        }

        extSettings.cfg.chara.push(tempCharaCfg);
    } else {
        console.debug('Character CFG error: No avatar name key could be found.');

        return false;
    }

    updateSettings();

    return true;
}

/**
 *
 * @param tempValue
 * @param setting
 */
function setChatCfg(tempValue: string, setting: number) {
    switch (setting) {
        case settingType.guidance_scale:
            chat_metadata[metadataKeys.guidance_scale] = tempValue;
            break;
        case settingType.negative_prompt:
            chat_metadata[metadataKeys.negative_prompt] = tempValue;
            break;
        case settingType.positive_prompt:
            chat_metadata[metadataKeys.positive_prompt] = tempValue;
            break;
        default:
            return false;
    }

    saveMetadataDebounced();

    return true;
}

/**
 *
 */
function onCfgMenuItemClick() {
    if (!selected_group && this_chid === undefined) {
        notyf.warning('Select a character before trying to configure CFG', '', { timeOut: 2000 });
        return;
    }

    const cfgEl = document.getElementById('cfgConfig');
    if (cfgEl && getComputedStyle(cfgEl).display !== 'flex') {
        cfgEl.classList.add('resizing');
        cfgEl.style.display = 'flex';
        cfgEl.style.opacity = '0';
        const anim = cfgEl.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: animation_duration,
            fill: 'forwards',
        });
        anim.onfinish = async function () {
            await delay(50);
            cfgEl.classList.remove('resizing');
        };

        const cfgBlockToggle = document.getElementById('CFGBlockToggle');
        const inlineDrawerContent = cfgBlockToggle?.parentElement?.querySelector('.inline-drawer-content');
        if (inlineDrawerContent && getComputedStyle(inlineDrawerContent).display !== 'block') {
            document.getElementById('floatingPrompt')?.classList.add('resizing');
            cfgBlockToggle?.click();
        }
    } else if (cfgEl) {
        cfgEl.classList.add('resizing');
        const anim = cfgEl.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: animation_duration,
            easing: 'ease-in-out',
            fill: 'forwards',
        });
        anim.onfinish = async function () {
            await delay(50);
            cfgEl.classList.remove('resizing');
        };
        setTimeout(function () {
            cfgEl.style.display = 'none';
        }, animation_duration);
    }
    const el = document.getElementById('options');
    if (el) {
        el.style.transition = `opacity ${animation_duration}ms`;
        el.style.opacity = '0';
        setTimeout(() => { el.style.display = 'none'; }, animation_duration);
    }
}

/**
 *
 */
async function onChatChanged() {
    loadSettings();
    await modifyCharaHtml();
}

/**
 *
 */
async function modifyCharaHtml() {
    const charaCfgContainer = document.getElementById('chara_cfg_container');
    const groupchatCfgUseCharaContainer = document.getElementById('groupchat_cfg_use_chara_container');
    if (selected_group) {
        if (charaCfgContainer) charaCfgContainer.style.display = 'none';
        if (groupchatCfgUseCharaContainer) groupchatCfgUseCharaContainer.style.display = '';
    } else {
        if (charaCfgContainer) charaCfgContainer.style.display = '';
        if (groupchatCfgUseCharaContainer) groupchatCfgUseCharaContainer.style.display = 'none';
    }
}

/**
 *
 */
function loadSettings() {
    document.getElementById('chat_cfg_guidance_scale')?.setAttribute('value', chat_metadata[metadataKeys.guidance_scale] ?? (1.0).toFixed(2));
    document.getElementById('chat_cfg_guidance_scale_counter')?.setAttribute('value', chat_metadata[metadataKeys.guidance_scale]?.toFixed(2) ?? (1.0).toFixed(2));
    document.getElementById('chat_cfg_negative_prompt')?.setAttribute('value', chat_metadata[metadataKeys.negative_prompt] ?? '');
    document.getElementById('chat_cfg_positive_prompt')?.setAttribute('value', chat_metadata[metadataKeys.positive_prompt] ?? '');
    const groupChatEl = document.getElementById('groupchat_cfg_use_chara');
    if (groupChatEl) groupChatEl.checked = chat_metadata[metadataKeys.groupchat_individual_chars] ?? false;
    if (chat_metadata[metadataKeys.prompt_combine]?.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chat_metadata[metadataKeys.prompt_combine].forEach((element: any) => {
            const cb = document.querySelector(`input[name="cfg_prompt_combine"][value="${element}"]`) as HTMLInputElement | null;
            if (cb) cb.checked = true;
        });
    }

    const promptSeparatorDisplay = [];
    const promptSeparator = chat_metadata[metadataKeys.prompt_separator];
    if (promptSeparator) {
        promptSeparatorDisplay.push(promptSeparator);
        if (!promptSeparator.startsWith('"')) {
            promptSeparatorDisplay.unshift('"');
        }

        if (!promptSeparator.endsWith('"')) {
            promptSeparatorDisplay.push('"');
        }
    }

    (document.getElementById('cfg_prompt_separator') as HTMLInputElement).value = promptSeparatorDisplay.length === 0 ? '' : promptSeparatorDisplay.join('');

    (document.getElementById('cfg_prompt_insertion_depth') as HTMLInputElement).value = String(chat_metadata[metadataKeys.prompt_insertion_depth] ?? 1);

    if (!selected_group) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const charaCfg = (extension_settings as any).cfg.chara.find((e: Record<string, unknown>) => e.name === getCharaFilename());
        (document.getElementById('chara_cfg_guidance_scale') as HTMLInputElement).value = String(charaCfg?.guidance_scale ?? 1.00);
        (document.getElementById('chara_cfg_guidance_scale_counter') as HTMLInputElement).value = charaCfg?.guidance_scale?.toFixed(2) ?? (1.0).toFixed(2);
        (document.getElementById('chara_cfg_negative_prompt') as HTMLInputElement).value = charaCfg?.negative_prompt ?? '';
        (document.getElementById('chara_cfg_positive_prompt') as HTMLInputElement).value = charaCfg?.positive_prompt ?? '';
    }
}

/**
 *
 */
async function initialLoadSettings() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _ext = extension_settings as any;

    _ext[extensionName] = _ext[extensionName] || {};
    if (Object.keys(_ext[extensionName]).length === 0) {
        Object.assign(_ext[extensionName], defaultSettings);
        saveSettingsDebounced();
    }

    (document.getElementById('global_cfg_guidance_scale') as HTMLInputElement).value = String(_ext.cfg.global.guidance_scale);
    (document.getElementById('global_cfg_guidance_scale_counter') as HTMLInputElement).value = _ext.cfg.global.guidance_scale.toFixed(2);
    (document.getElementById('global_cfg_negative_prompt') as HTMLInputElement).value = _ext.cfg.global.negative_prompt;
    (document.getElementById('global_cfg_positive_prompt') as HTMLInputElement).value = _ext.cfg.global.positive_prompt;
}

/**
 *
 */
function migrateSettings() {
    let performSettingsSave = false;
    let performMetaSave = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _ext = extension_settings as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _pwr = power_user as any;

    if (_pwr.guidance_scale) {
        _ext.cfg.global.guidance_scale = _pwr.guidance_scale;
        delete _pwr.guidance_scale;
        performSettingsSave = true;
    }

    if (_pwr.negative_prompt) {
        _ext.cfg.global.negative_prompt = _pwr.negative_prompt;
        delete _pwr.negative_prompt;
        performSettingsSave = true;
    }

    if (chat_metadata.cfg_negative_combine) {
        chat_metadata[metadataKeys.prompt_combine] = chat_metadata.cfg_negative_combine;
        chat_metadata.cfg_negative_combine = undefined;
        performMetaSave = true;
    }

    if (chat_metadata.cfg_negative_insertion_depth) {
        chat_metadata[metadataKeys.prompt_insertion_depth] = chat_metadata.cfg_negative_insertion_depth;
        chat_metadata.cfg_negative_insertion_depth = undefined;
        performMetaSave = true;
    }

    if (chat_metadata.cfg_negative_separator) {
        chat_metadata[metadataKeys.prompt_separator] = chat_metadata.cfg_negative_separator;
        chat_metadata.cfg_negative_separator = undefined;
        performMetaSave = true;
    }

    if (performSettingsSave) {
        saveSettingsDebounced();
    }

    if (performMetaSave) {
        saveMetadataDebounced();
    }
}

/**
 *
 */
export function initCfg() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _ext = extension_settings as any;

    document.getElementById('CFGClose')?.addEventListener('click', function () {
        const cfgEl = document.getElementById('cfgConfig');
        if (cfgEl) {
            cfgEl.animate([{ opacity: 1 }, { opacity: 0 }], {
                duration: animation_duration,
                easing: 'ease-in-out',
                fill: 'forwards',
            });
        }
        setTimeout(function () { 
            const cfgEl = document.getElementById('cfgConfig');
            if (cfgEl) cfgEl.style.display = 'none';
        }, animation_duration);
    });

    document.getElementById('chat_cfg_guidance_scale')?.addEventListener('input', function (this: HTMLInputElement) {
        const numberValue = Number(this.value);
        const success = setChatCfg(String(numberValue), settingType.guidance_scale);
        if (success) {
            (document.getElementById('chat_cfg_guidance_scale_counter') as HTMLInputElement).value = numberValue.toFixed(2);
        }
    });

    document.getElementById('chat_cfg_negative_prompt')?.addEventListener('input', function (this: HTMLInputElement) {
        setChatCfg(this.value, settingType.negative_prompt);
    });

    document.getElementById('chat_cfg_positive_prompt')?.addEventListener('input', function (this: HTMLInputElement) {
        setChatCfg(this.value, settingType.positive_prompt);
    });

    document.getElementById('chara_cfg_guidance_scale')?.addEventListener('input', function (this: HTMLInputElement) {
        const value = this.value;
        const success = setCharCfg(value, settingType.guidance_scale);
        if (success) {
            (document.getElementById('chara_cfg_guidance_scale_counter') as HTMLInputElement).value = Number(value).toFixed(2);
        }
    });

    document.getElementById('chara_cfg_negative_prompt')?.addEventListener('input', function (this: HTMLInputElement) {
        setCharCfg(this.value, settingType.negative_prompt);
    });

    document.getElementById('chara_cfg_positive_prompt')?.addEventListener('input', function (this: HTMLInputElement) {
        setCharCfg(this.value, settingType.positive_prompt);
    });

    document.getElementById('global_cfg_guidance_scale')?.addEventListener('input', function (this: HTMLInputElement) {
        _ext.cfg.global.guidance_scale = Number(this.value);
        (document.getElementById('global_cfg_guidance_scale_counter') as HTMLInputElement).value = _ext.cfg.global.guidance_scale.toFixed(2);
        saveSettingsDebounced();
    });

    document.getElementById('global_cfg_negative_prompt')?.addEventListener('input', function (this: HTMLInputElement) {
        _ext.cfg.global.negative_prompt = this.value;
        saveSettingsDebounced();
    });

    document.getElementById('global_cfg_positive_prompt')?.addEventListener('input', function (this: HTMLInputElement) {
        _ext.cfg.global.positive_prompt = this.value;
        saveSettingsDebounced();
    });

    document.querySelector('input[name="cfg_prompt_combine"]')?.addEventListener('input', function () {
        const values = Array.from(document.querySelectorAll<HTMLInputElement>('#cfgConfig input[name="cfg_prompt_combine"]:checked'))
            .map(function (el) { return Number(el.value); })
            .filter((e) => !Number.isNaN(e)) || [];

        chat_metadata[metadataKeys.prompt_combine] = values;
        saveMetadataDebounced();
    });

    document.getElementById('cfg_prompt_insertion_depth')?.addEventListener('input', function (this: HTMLInputElement) {
        chat_metadata[metadataKeys.prompt_insertion_depth] = Number(this.value);
        saveMetadataDebounced();
    });

    document.getElementById('cfg_prompt_separator')?.addEventListener('input', function (this: HTMLInputElement) {
        chat_metadata[metadataKeys.prompt_separator] = this.value;
        saveMetadataDebounced();
    });

    document.getElementById('groupchat_cfg_use_chara')?.addEventListener('input', function (this: HTMLInputElement) {
        const checked = !!(this).checked;
        chat_metadata[metadataKeys.groupchat_individual_chars] = checked;

        if (checked) {
            notyf.info('You can edit character CFG values in their respective character chats.');
        }

        saveMetadataDebounced();
    });

    initialLoadSettings();

    if (_ext.cfg) {
        migrateSettings();
    }
    document.getElementById('option_toggle_CFG')?.addEventListener('click', onCfgMenuItemClick);

    eventSource.on(event_types.CHAT_CHANGED, async () => {
        await onChatChanged();
    });
}

export const cfgType = {
    chat: 0,
    chara: 1,
    global: 2,
};

export const metadataKeys = {
    guidance_scale: 'cfg_guidance_scale',
    negative_prompt: 'cfg_negative_prompt',
    positive_prompt: 'cfg_positive_prompt',
    prompt_combine: 'cfg_prompt_combine',
    groupchat_individual_chars: 'cfg_groupchat_individual_chars',
    prompt_insertion_depth: 'cfg_prompt_insertion_depth',
    prompt_separator: 'cfg_prompt_separator',
};

/**
 *
 */
export function getGuidanceScale() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _ext = extension_settings as any;

    if (!_ext.cfg) {
        console.warn('CFG extension is not enabled. Skipping CFG guidance.');
        return;
    }

    const charaCfg = _ext.cfg.chara?.find((e: Record<string, unknown>) => e.name === getCharaFilename(this_chid));
    const chatGuidanceScale = chat_metadata[metadataKeys.guidance_scale];
    const groupchatCharOverride = chat_metadata[metadataKeys.groupchat_individual_chars] ?? false;

    if (chatGuidanceScale && chatGuidanceScale !== 1 && !groupchatCharOverride) {
        return {
            type: cfgType.chat,
            value: chatGuidanceScale,
        };
    }

    if ((!selected_group && charaCfg || groupchatCharOverride) && charaCfg?.guidance_scale !== 1) {
        return {
            type: cfgType.chara,
            value: charaCfg.guidance_scale,
        };
    }

    if (_ext.cfg.global && _ext.cfg.global?.guidance_scale !== 1) {
        return {
            type: cfgType.global,
            value: _ext.cfg.global.guidance_scale,
        };
    }
}

/**
 *
 */
function getCustomSeparator() {
    const defaultSeparator = '\n';

    try {
        if (chat_metadata[metadataKeys.prompt_separator]) {
            return JSON.parse(chat_metadata[metadataKeys.prompt_separator]);
        }

        return defaultSeparator;
    } catch {
        console.warn('Invalid JSON detected for prompt separator. Using default separator.');
        return defaultSeparator;
    }
}

/**
 *
 * @param guidanceScale
 * @param guidanceScale.type
 * @param guidanceScale.value
 * @param isNegative
 * @param quiet
 */
export function getCfgPrompt(guidanceScale: { type: number; value: number }, isNegative: boolean, quiet = false) {
    const splitCfgPrompt = [];

    const cfgPromptCombine = chat_metadata[metadataKeys.prompt_combine] ?? [];
    if (guidanceScale.type === cfgType.chat || cfgPromptCombine.includes(cfgType.chat)) {
        splitCfgPrompt.unshift(
            substituteParams(
                chat_metadata[isNegative ? metadataKeys.negative_prompt : metadataKeys.positive_prompt],
            ),
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _ext = extension_settings as any;
    const charaCfg = _ext.cfg.chara?.find((e: Record<string, unknown>) => e.name === getCharaFilename(this_chid));
    if (guidanceScale.type === cfgType.chara || cfgPromptCombine.includes(cfgType.chara)) {
        splitCfgPrompt.unshift(
            substituteParams(
                isNegative ? charaCfg.negative_prompt : charaCfg.positive_prompt,
            ),
        );
    }

    if (guidanceScale.type === cfgType.global || cfgPromptCombine.includes(cfgType.global)) {
        splitCfgPrompt.unshift(
            substituteParams(
                isNegative ? _ext.cfg.global.negative_prompt : _ext.cfg.global.positive_prompt,
            ),
        );
    }

    const customSeparator = getCustomSeparator();
    const combinedCfgPrompt = splitCfgPrompt.filter((e) => e.length > 0).join(customSeparator);
    const insertionDepth = chat_metadata[metadataKeys.prompt_insertion_depth] ?? 1;
    if (!quiet) console.log(`Setting CFG with guidance scale: ${guidanceScale.value}, negatives: ${combinedCfgPrompt}`);

    return {
        value: combinedCfgPrompt,
        depth: insertionDepth,
    };
}
