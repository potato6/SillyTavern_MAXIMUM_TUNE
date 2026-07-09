import { chat, chat_metadata, eventSource, event_types, getRequestHeaders, this_chid, characters } from '../../../script.js';
import { extension_settings } from '../../extensions.js';
import { QuickReplyApi } from './api/QuickReplyApi.js';
import { AutoExecuteHandler } from './src/AutoExecuteHandler.js';
import { QuickReply } from './src/QuickReply.js';
import { QuickReplyConfig } from './src/QuickReplyConfig.js';
import { QuickReplySet } from './src/QuickReplySet.js';
import { QuickReplySettings } from './src/QuickReplySettings.js';
import { SlashCommandHandler } from './src/SlashCommandHandler.js';
import { ButtonUi } from './src/ui/ButtonUi.js';
import { SettingsUi } from './src/ui/SettingsUi.js';
import { debounceAsync } from '../../utils.js';
import { selected_group } from '../../group-chats.js';
export { debounceAsync };


const _VERBOSE = true;
export const debug = (...msg: any[]) => _VERBOSE ? console.debug('[QR2]', ...msg) : null;
export const log = (...msg: any[]) => _VERBOSE ? console.log('[QR2]', ...msg) : null;
export const warn = (...msg: any[]) => _VERBOSE ? console.warn('[QR2]', ...msg) : null;


const defaultConfig = {
    setList: [{
        set: 'Default',
        isVisible: true,
    }],
};

const defaultSettings = {
    isEnabled: false,
    isCombined: false,
    config: defaultConfig,
};


/** @type {Boolean}*/
let isReady = false;
/** @type {Function[]}*/
let executeQueue: any = [];
/** @type {string}*/
let lastCharId: any;
/** @type {QuickReplySettings}*/
let settings: any;
/** @type {SettingsUi} */
let manager: any;
/** @type {ButtonUi} */
let buttons: any;
/** @type {AutoExecuteHandler} */
let autoExec: any;
/** @type {QuickReplyApi} */
// @ts-expect-error TS(7005): Variable 'quickReplyApi' implicitly has an 'any' t... Remove this comment to see the full error message
export let quickReplyApi;


const loadSets = async () => {
    const response = await fetch('/api/settings/get', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({}),
    });

    if (response.ok) {
        const setList = (await response.json()).quickReplyPresets ?? [];
        for (const set of setList) {
            if (set.version !== 2) {
                // migrate old QR set
                set.version = 2;
                set.disableSend = set.quickActionEnabled ?? false;
                set.placeBeforeInput = set.placeBeforeInputEnabled ?? false;
                set.injectInput = set.AutoInputInject ?? false;
                set.qrList = set.quickReplySlots.map((slot: any, idx: any) => {
                    const qr = {};
                    // @ts-expect-error TS(2339): Property 'id' does not exist on type '{}'.
                    qr.id = idx + 1;
                    // @ts-expect-error TS(2339): Property 'label' does not exist on type '{}'.
                    qr.label = slot.label ?? '';
                    // @ts-expect-error TS(2339): Property 'title' does not exist on type '{}'.
                    qr.title = slot.title ?? '';
                    // @ts-expect-error TS(2339): Property 'message' does not exist on type '{}'.
                    qr.message = slot.mes ?? '';
                    // @ts-expect-error TS(2339): Property 'isHidden' does not exist on type '{}'.
                    qr.isHidden = slot.hidden ?? false;
                    // @ts-expect-error TS(2339): Property 'executeOnStartup' does not exist on type... Remove this comment to see the full error message
                    qr.executeOnStartup = slot.autoExecute_appStartup ?? false;
                    // @ts-expect-error TS(2339): Property 'executeOnUser' does not exist on type '{... Remove this comment to see the full error message
                    qr.executeOnUser = slot.autoExecute_userMessage ?? false;
                    // @ts-expect-error TS(2339): Property 'executeOnAi' does not exist on type '{}'... Remove this comment to see the full error message
                    qr.executeOnAi = slot.autoExecute_botMessage ?? false;
                    // @ts-expect-error TS(2339): Property 'executeOnChatChange' does not exist on t... Remove this comment to see the full error message
                    qr.executeOnChatChange = slot.autoExecute_chatLoad ?? false;
                    // @ts-expect-error TS(2339): Property 'executeOnGroupMemberDraft' does not exis... Remove this comment to see the full error message
                    qr.executeOnGroupMemberDraft = slot.autoExecute_groupMemberDraft ?? false;
                    // @ts-expect-error TS(2339): Property 'executeOnNewChat' does not exist on type... Remove this comment to see the full error message
                    qr.executeOnNewChat = slot.autoExecute_newChat ?? false;
                    // @ts-expect-error TS(2339): Property 'executeBeforeGeneration' does not exist ... Remove this comment to see the full error message
                    qr.executeBeforeGeneration = slot.autoExecute_beforeGeneration ?? false;
                    // @ts-expect-error TS(2339): Property 'automationId' does not exist on type '{}... Remove this comment to see the full error message
                    qr.automationId = slot.automationId ?? '';
                    // @ts-expect-error TS(2339): Property 'contextList' does not exist on type '{}'... Remove this comment to see the full error message
                    qr.contextList = (slot.contextMenu ?? []).map((it: any) => ({
                        set: it.preset,
                        isChained: it.chain
                    }));
                    return qr;
                });
            }
            if (set.version == 2) {
                // @ts-expect-error TS(2345): Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
                QuickReplySet.list.push(QuickReplySet.from(JSON.parse(JSON.stringify(set))));
            }
        }
        // need to load QR lists after all sets are loaded to be able to resolve context menu entries
        setList.forEach((set: any, idx: any) => {
            // @ts-expect-error TS(2532): Object is possibly 'undefined'.
            QuickReplySet.list[idx].qrList = set.qrList.map((it: any) => QuickReply.from(it));
            // @ts-expect-error TS(2532): Object is possibly 'undefined'.
            QuickReplySet.list[idx].init();
        });
        log('sets: ', QuickReplySet.list);
    }
};

const loadSettings = async () => {
    // @ts-expect-error TS(2551): Property 'quickReplyV2' does not exist on type '{ ... Remove this comment to see the full error message
    if (!extension_settings.quickReplyV2) {
        if (!extension_settings.quickReply) {
            // @ts-expect-error TS(2551): Property 'quickReplyV2' does not exist on type '{ ... Remove this comment to see the full error message
            extension_settings.quickReplyV2 = defaultSettings;
        } else {
            // @ts-expect-error TS(2551): Property 'quickReplyV2' does not exist on type '{ ... Remove this comment to see the full error message
            extension_settings.quickReplyV2 = {
                // @ts-expect-error TS(2339): Property 'quickReplyEnabled' does not exist on typ... Remove this comment to see the full error message
                isEnabled: extension_settings.quickReply.quickReplyEnabled ?? false,
                isCombined: false,
                isPopout: false,
                config: {
                    setList: [{
                        // @ts-expect-error TS(2339): Property 'selectedPreset' does not exist on type '... Remove this comment to see the full error message
                        set: extension_settings.quickReply.selectedPreset ?? extension_settings.quickReply.name ?? 'Default',
                        isVisible: true,
                    }],
                },
            };
        }
    }
    try {
        // @ts-expect-error TS(2551): Property 'quickReplyV2' does not exist on type '{ ... Remove this comment to see the full error message
        settings = QuickReplySettings.from(extension_settings.quickReplyV2);
        settings.config.scope = 'global';
        settings.config.onUpdate = () => settings.save();
    } catch (ex) {
        settings = QuickReplySettings.from(defaultSettings);
    }
};

const executeIfReadyElseQueue = async (functionToCall: any, args: any) => {
    if (isReady) {
        log('calling', { functionToCall, args });
        await functionToCall(...args);
    } else {
        log('queueing', { functionToCall, args });
        executeQueue.push(async () => await functionToCall(...args));
    }
};

const handleCharChange = () => {
    if (lastCharId === this_chid) return;

    // Unload the old character's config and update the character ID cache.
    settings.charConfig = null;
    lastCharId = this_chid;

    // If no character is loaded, there's nothing more to do.
    /** @type {Character} */
    const character = characters[this_chid];
    if (!character || selected_group) {
        return;
    }

    // Get the character-specific config from the local settings storage.
    let charConfig = settings.characterConfigs[character.avatar];

    // If no config exists for this character, create a new one.
    if (!charConfig) {
        charConfig = QuickReplyConfig.from({ setList: [] });
        settings.characterConfigs[character.avatar] = charConfig;
    }

    charConfig.scope = 'character';
    // The main settings save function will handle persistence.
    charConfig.onUpdate = () => settings.save();
    settings.charConfig = charConfig;
};

export async function init() {
    await loadSets();
    await loadSettings();
    log('settings: ', settings);

    manager = new SettingsUi(settings);
    // @ts-expect-error TS(2531): Object is possibly 'null'.
    document.querySelector('#qr_container').append(await manager.render());

    buttons = new ButtonUi(settings);
    buttons.show();
    settings.onSave = () => buttons.refresh();

    // @ts-expect-error TS(7017): Element implicitly has an 'any' type because type ... Remove this comment to see the full error message
    globalThis.executeQuickReplyByName = async (name: any, args = {}, options = {}) => {
        let qr = [
            ...settings.config.setList,
            ...(settings.chatConfig?.setList ?? []),
            ...(settings.charConfig?.setList ?? []),
        ]
            .map(it => it.set.qrList)
            .flat()
            .find(it => it.label == name)
            ;
        if (!qr) {
            let [setName, ...qrName] = name.split('.');
            qrName = qrName.join('.');
            let qrs = QuickReplySet.get(setName);
            if (qrs) {
                // @ts-expect-error TS(2339): Property 'qrList' does not exist on type 'never'.
                qr = qrs.qrList.find((it: any) => it.label == qrName);
            }
        }
        if (qr && qr.onExecute) {
            return await qr.execute(args, false, true, options);
        } else {
            throw new Error(`No Quick Reply found for "${name}".`);
        }
    };

    quickReplyApi = new QuickReplyApi(settings, manager);
    const slash = new SlashCommandHandler(quickReplyApi);
    slash.init();
    autoExec = new AutoExecuteHandler(settings);

    eventSource.on(event_types.APP_READY, async () => await finalizeInit());

    // @ts-expect-error TS(7017): Element implicitly has an 'any' type because type ... Remove this comment to see the full error message
    globalThis.quickReplyApi = quickReplyApi;
}

const finalizeInit = async () => {
    debug('executing startup');
    await autoExec.handleStartup();
    debug('/executing startup');

    debug(`executing queue (${executeQueue.length} items)`);
    while (executeQueue.length > 0) {
        const func = executeQueue.shift();
        await func();
    }
    debug('/executing queue');
    isReady = true;
    debug('READY');
};


const purgeCharacterQuickReplySets = ({
    character
}: any) => {
    // Remove the character's Quick Reply Sets from the settings.
    const avatar = character?.avatar;
    if (avatar && avatar in settings.characterConfigs) {
        log(`Purging Quick Reply Sets for character: ${avatar}`);
        delete settings.characterConfigs[avatar];
        settings.save();
    }
};

const updateCharacterQuickReplySets = (oldAvatar: any, newAvatar: any) => {
    // Update the character's Quick Reply Sets in the settings.
    if (oldAvatar && newAvatar && oldAvatar !== newAvatar) {
        log(`Updating Quick Reply Sets for character: ${oldAvatar} -> ${newAvatar}`);
        if (settings.characterConfigs[oldAvatar]) {
            settings.characterConfigs[newAvatar] = settings.characterConfigs[oldAvatar];
            delete settings.characterConfigs[oldAvatar];
            settings.save();
        }
    }
};

const onChatChanged = async (chatIdx: any) => {
    log('CHAT_CHANGED', chatIdx);

    handleCharChange();

    if (chatIdx) {
        const chatConfig = QuickReplyConfig.from(chat_metadata.quickReply ?? {});
        chatConfig.scope = 'chat';
        chatConfig.onUpdate = () => settings.save();
        settings.chatConfig = chatConfig;
    } else {
        settings.chatConfig = null;
    }
    manager.rerender();
    buttons.refresh();

    await autoExec.handleChatChanged();
};
eventSource.on(event_types.CHAT_CHANGED, (...args: any[]) => executeIfReadyElseQueue(onChatChanged, args));
eventSource.on(event_types.CHARACTER_DELETED, purgeCharacterQuickReplySets);
eventSource.on(event_types.CHARACTER_RENAMED, updateCharacterQuickReplySets);

const onUserMessage = async () => {
    await autoExec.handleUser();
};
eventSource.makeFirst(event_types.USER_MESSAGE_RENDERED, (...args: any[]) => executeIfReadyElseQueue(onUserMessage, args));

const onAiMessage = async (messageId: any) => {
    // @ts-expect-error TS(2339): Property 'mes' does not exist on type 'never'.
    if (['...'].includes(chat[messageId]?.mes)) {
        log('QR auto-execution suppressed for swiped message');
        return;
    }

    await autoExec.handleAi();
};
eventSource.makeFirst(event_types.CHARACTER_MESSAGE_RENDERED, (...args: any[]) => executeIfReadyElseQueue(onAiMessage, args));

const onGroupMemberDraft = async () => {
    await autoExec.handleGroupMemberDraft();
};
eventSource.on(event_types.GROUP_MEMBER_DRAFTED, (...args: any[]) => executeIfReadyElseQueue(onGroupMemberDraft, args));

const onWIActivation = async (entries: any) => {
    await autoExec.handleWIActivation(entries);
};
eventSource.on(event_types.WORLD_INFO_ACTIVATED, (...args: any[]) => executeIfReadyElseQueue(onWIActivation, args));

const onNewChat = async () => {
    await autoExec.handleNewChat();
};
eventSource.on(event_types.CHAT_CREATED, (...args: any[]) => executeIfReadyElseQueue(onNewChat, args));
eventSource.on(event_types.GROUP_CHAT_CREATED, (...args: any[]) => executeIfReadyElseQueue(onNewChat, args));

const onBeforeGeneration = async (_generationType: any, _options = {}, isDryRun = false) => {
    if (isDryRun) {
        log('Before-generation hook skipped due to dryRun.');
        return;
    }
    if (selected_group && this_chid === undefined) {
        log('Before-generation hook skipped for event before group wrapper.');
        return;
    }
    await autoExec.handleBeforeGeneration();
};
eventSource.on(event_types.GENERATION_AFTER_COMMANDS, (...args: any[]) => executeIfReadyElseQueue(onBeforeGeneration, args));
