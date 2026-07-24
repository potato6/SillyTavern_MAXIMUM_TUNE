import { DiffMatchPatch, DOMPurify, localspace } from '../lib.js';
import { chat, event_types, eventSource, getCurrentChatId, reloadCurrentChat } from '../script.js';
import { t } from './i18n.js';
import { oai_settings } from './openai.js';
import { Popup, POPUP_TYPE } from './popup.js';
import { power_user, registerDebugFunction } from './power-user.js';
import { isMobile } from './RossAscends-mods.js';
import { renderTemplateAsync } from './templates.js';
import { getFriendlyTokenizerName, getTokenCountAsync } from './tokenizers.js';
import { copyText } from './utils.js';

let PromptArrayItemForRawPromptDisplay: number;
let priorPromptArrayItemForRawPromptDisplay: number;
const promptStorage = localspace.createInstance({ name: 'SillyTavern_Prompts' });
export let itemizedPrompts: any[] = [];

const flatten = (rawPrompt: any) =>
    Array.isArray(rawPrompt) ? rawPrompt.map((x: any) => x.content).join('\n') : rawPrompt;

const getFriendlyName = (value: any) =>
    document.querySelector(`#rm_api_block select option[value="${value}"]`)?.textContent || value;

/**
 * Gets the itemized prompts for a chat.
 * @param {string} chatId Chat ID to load
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'chatId' implicitly has an 'any' type.
export async function loadItemizedPrompts(chatId) {
    try {
        if (!chatId) {
            itemizedPrompts = [];
            return;
        }

        itemizedPrompts = (await promptStorage.getItem(chatId)) ?? [];

        if (!itemizedPrompts) {
            itemizedPrompts = [];
        }

        await eventSource.emit(event_types.ITEMIZED_PROMPTS_LOADED, { chatId: chatId });
    } catch {
        console.log('Error loading itemized prompts for chat', chatId);
        itemizedPrompts = [];
    }
}

/**
 * Saves the itemized prompts for a chat.
 * @param {string} chatId Chat ID to save itemized prompts for
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'chatId' implicitly has an 'any' type.
export async function saveItemizedPrompts(chatId) {
    try {
        if (!chatId) {
            return;
        }

        await promptStorage.setItem(chatId, itemizedPrompts);
        await eventSource.emit(event_types.ITEMIZED_PROMPTS_SAVED, { chatId: chatId });
    } catch {
        console.log('Error saving itemized prompts for chat', chatId);
    }
}

/**
 * Replaces the itemized prompt text for a message.
 * @param {number} mesId Message ID to get itemized prompt for
 * @param {string} promptText New raw prompt text
 * @returns
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'mesId' implicitly has an 'any' type.
export async function replaceItemizedPromptText(mesId, promptText) {
    if (!Array.isArray(itemizedPrompts)) {
        itemizedPrompts = [];
    }

    const itemizedPrompt = itemizedPrompts.find((x: any) => x.mesId === mesId);

    if (!itemizedPrompt) {
        return;
    }

    itemizedPrompt.rawPrompt = promptText;
}

/**
 * Deletes the itemized prompts for a chat.
 * @param {string} chatId Chat ID to delete itemized prompts for
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'chatId' implicitly has an 'any' type.
export async function deleteItemizedPrompts(chatId) {
    try {
        if (!chatId) {
            return;
        }

        await promptStorage.removeItem(chatId);
        await eventSource.emit(event_types.ITEMIZED_PROMPTS_DELETED, {
            chatId: chatId,
            all: false,
        });
    } catch {
        console.log('Error deleting itemized prompts for chat', chatId);
    }
}

/**
 * Empties the itemized prompts array and caches.
 */
export async function clearItemizedPrompts() {
    try {
        await promptStorage.clear();
        itemizedPrompts = [];
        await eventSource.emit(event_types.ITEMIZED_PROMPTS_DELETED, { all: true });
    } catch {
        console.log('Error clearing itemized prompts');
    }
}

/**
 *
 * @param itemizedPrompts
 * @param thisPromptSet
 * @param incomingMesId
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'itemizedPrompts' implicitly has an 'any... Remove this comment to see the full error message
export async function itemizedParams(itemizedPrompts, thisPromptSet, incomingMesId) {
    // Cache array access to avoid repeated lookups and maintain stable references
    const promptData = itemizedPrompts[thisPromptSet];

    // Pre-initialize all fields to ensure V8 creates a single stable hidden class (map)
    // for the params object, preventing shape transitions and megamorphic property access.
    const params = {
        charDescriptionTokens: await getTokenCountAsync(promptData.charDescription),
        charPersonalityTokens: await getTokenCountAsync(promptData.charPersonality),
        scenarioTextTokens: await getTokenCountAsync(promptData.scenarioText),
        userPersonaStringTokens: await getTokenCountAsync(promptData.userPersona),
        worldInfoStringTokens: await getTokenCountAsync(promptData.worldInfoString),
        allAnchorsTokens: await getTokenCountAsync(promptData.allAnchors),
        summarizeStringTokens: await getTokenCountAsync(promptData.summarizeString),
        authorsNoteStringTokens: await getTokenCountAsync(promptData.authorsNoteString),
        smartContextStringTokens: await getTokenCountAsync(promptData.smartContextString),
        beforeScenarioAnchorTokens: await getTokenCountAsync(promptData.beforeScenarioAnchor),
        afterScenarioAnchorTokens: await getTokenCountAsync(promptData.afterScenarioAnchor),
        zeroDepthAnchorTokens: await getTokenCountAsync(promptData.zeroDepthAnchor),
        thisPrompt_padding: promptData.padding,
        this_main_api: promptData.main_api,
        chatInjects: await getTokenCountAsync(promptData.chatInjects),
        chatVectorsStringTokens: await getTokenCountAsync(promptData.chatVectorsString),
        dataBankVectorsStringTokens: await getTokenCountAsync(promptData.dataBankVectorsString),
        modelUsed: chat[incomingMesId]?.extra?.model,
        apiUsed: chat[incomingMesId]?.extra?.api,
        presetName: promptData.presetName || t`(Unknown)`,
        messagesCount: String(promptData.messagesCount ?? ''),
        examplesCount: String(promptData.examplesCount ?? ''),

        // Pre-initialized conditional/derived fields
        mainApiFriendlyName: '',
        ActualChatHistoryTokens: 0,
        oaiMainTokens: 0,
        oaiStartTokens: 0,
        examplesStringTokens: 0,
        oaiPromptTokens: 0,
        oaiBiasTokens: 0,
        oaiJailbreakTokens: 0,
        oaiNudgeTokens: 0,
        oaiImpersonateTokens: 0,
        oaiNsfwTokens: 0,
        finalPromptTokens: 0,
        thisPrompt_max_context: 0,
        oaiStartTokensPercentage: '',
        storyStringTokensPercentage: '',
        ActualChatHistoryTokensPercentage: '',
        promptBiasTokensPercentage: '',
        worldInfoStringTokensPercentage: '',
        allAnchorsTokensPercentage: '',
        selectedTokenizer: '',
        oaiSystemTokens: 0,
        oaiSystemTokensPercentage: '',
        storyStringTokens: 0,
        mesSendStringTokens: 0,
        instructionTokens: 0,
        promptBiasTokens: 0,
        totalTokensInPrompt: 0,
        thisPrompt_actual: 0,
    };

    if (params.apiUsed) {
        params.apiUsed = getFriendlyName(params.apiUsed);
    }

    if (params.this_main_api) {
        params.mainApiFriendlyName = getFriendlyName(params.this_main_api);
    }

    if (params.chatInjects) {
        params.ActualChatHistoryTokens = params.ActualChatHistoryTokens - params.chatInjects;
    }

    if (params.this_main_api == 'openai') {
        //for OAI API
        params.oaiMainTokens = promptData.oaiMainTokens;
        params.oaiStartTokens = promptData.oaiStartTokens;
        params.ActualChatHistoryTokens = promptData.oaiConversationTokens;
        params.examplesStringTokens = promptData.oaiExamplesTokens;
        params.oaiPromptTokens =
            promptData.oaiPromptTokens -
            (params.afterScenarioAnchorTokens + params.beforeScenarioAnchorTokens) +
            params.examplesStringTokens;
        params.oaiBiasTokens = promptData.oaiBiasTokens;
        params.oaiJailbreakTokens = promptData.oaiJailbreakTokens;
        params.oaiNudgeTokens = promptData.oaiNudgeTokens;
        params.oaiImpersonateTokens = promptData.oaiImpersonateTokens;
        params.oaiNsfwTokens = promptData.oaiNsfwTokens;

        params.finalPromptTokens =
            params.oaiStartTokens +
            params.oaiPromptTokens +
            params.oaiMainTokens +
            params.oaiNsfwTokens +
            params.oaiBiasTokens +
            params.oaiImpersonateTokens +
            params.oaiJailbreakTokens +
            params.oaiNudgeTokens +
            params.ActualChatHistoryTokens +
            params.worldInfoStringTokens +
            params.beforeScenarioAnchorTokens +
            params.afterScenarioAnchorTokens;

        params.thisPrompt_max_context =
            oai_settings.openai_max_context - oai_settings.openai_max_tokens;

        params.oaiStartTokensPercentage = (
            (params.oaiStartTokens / params.finalPromptTokens) *
            100
        ).toFixed(2);
        params.storyStringTokensPercentage = (
            ((params.afterScenarioAnchorTokens +
                params.beforeScenarioAnchorTokens +
                params.oaiPromptTokens) /
                params.finalPromptTokens) *
            100
        ).toFixed(2);
        params.ActualChatHistoryTokensPercentage = (
            (params.ActualChatHistoryTokens / params.finalPromptTokens) *
            100
        ).toFixed(2);
        params.promptBiasTokensPercentage = (
            (params.oaiBiasTokens / params.finalPromptTokens) *
            100
        ).toFixed(2);
        params.worldInfoStringTokensPercentage = (
            (params.worldInfoStringTokens / params.finalPromptTokens) *
            100
        ).toFixed(2);
        params.allAnchorsTokensPercentage = (
            (params.allAnchorsTokens / params.finalPromptTokens) *
            100
        ).toFixed(2);
        params.selectedTokenizer =
            getFriendlyTokenizerName(params.this_main_api).tokenizerName ?? '';
        params.oaiSystemTokens =
            params.oaiImpersonateTokens +
            params.oaiJailbreakTokens +
            params.oaiNudgeTokens +
            params.oaiStartTokens +
            params.oaiNsfwTokens +
            params.oaiMainTokens;
        params.oaiSystemTokensPercentage = (
            (params.oaiSystemTokens / params.finalPromptTokens) *
            100
        ).toFixed(2);
    } else {
        //for non-OAI APIs
        params.finalPromptTokens = await getTokenCountAsync(promptData.finalPrompt);
        params.storyStringTokens =
            (await getTokenCountAsync(promptData.storyString)) - params.worldInfoStringTokens;
        params.examplesStringTokens = await getTokenCountAsync(promptData.examplesString);
        params.mesSendStringTokens = await getTokenCountAsync(promptData.mesSendString);
        params.ActualChatHistoryTokens =
            params.mesSendStringTokens -
            (params.allAnchorsTokens -
                (params.beforeScenarioAnchorTokens + params.afterScenarioAnchorTokens)) +
            power_user.token_padding;
        params.instructionTokens = await getTokenCountAsync(promptData.instruction);
        params.promptBiasTokens = await getTokenCountAsync(promptData.promptBias);

        params.totalTokensInPrompt =
            params.storyStringTokens +
            params.worldInfoStringTokens +
            params.examplesStringTokens +
            params.ActualChatHistoryTokens +
            params.allAnchorsTokens +
            params.promptBiasTokens;

        params.thisPrompt_max_context = promptData.this_max_context;
        params.thisPrompt_actual = params.thisPrompt_max_context - params.thisPrompt_padding;

        params.storyStringTokensPercentage = (
            (params.storyStringTokens / params.totalTokensInPrompt) *
            100
        ).toFixed(2);
        params.ActualChatHistoryTokensPercentage = (
            (params.ActualChatHistoryTokens / params.totalTokensInPrompt) *
            100
        ).toFixed(2);
        params.promptBiasTokensPercentage = (
            (params.promptBiasTokens / params.totalTokensInPrompt) *
            100
        ).toFixed(2);
        params.worldInfoStringTokensPercentage = (
            (params.worldInfoStringTokens / params.totalTokensInPrompt) *
            100
        ).toFixed(2);
        params.allAnchorsTokensPercentage = (
            (params.allAnchorsTokens / params.totalTokensInPrompt) *
            100
        ).toFixed(2);
        params.selectedTokenizer =
            promptData?.tokenizer || getFriendlyTokenizerName(params.this_main_api).tokenizerName;
    }
    return params;
}

/**
 *
 * @param itemizedPrompts
 * @param incomingMesId
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'itemizedPrompts' implicitly has an 'any... Remove this comment to see the full error message
export function findItemizedPromptSet(itemizedPrompts, incomingMesId) {
    let thisPromptSet = undefined;
    priorPromptArrayItemForRawPromptDisplay = -1;

    for (let i = 0; i < itemizedPrompts.length; i++) {
        const item = itemizedPrompts[i];
        if (item.mesId === incomingMesId) {
            thisPromptSet = i;
            PromptArrayItemForRawPromptDisplay = i;
            break;
        } else if (item.rawPrompt) {
            priorPromptArrayItemForRawPromptDisplay = i;
        }
    }
    return thisPromptSet;
}

/**
 *
 * @param itemizedPrompts
 * @param requestedMesId
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'itemizedPrompts' implicitly has an 'any... Remove this comment to see the full error message
export async function promptItemize(itemizedPrompts, requestedMesId) {
    console.log('PROMPT ITEMIZE ENTERED');
    const incomingMesId = Number(requestedMesId);
    console.debug(`looking for MesId ${incomingMesId}`);
    const thisPromptSet = findItemizedPromptSet(itemizedPrompts, incomingMesId);

    if (thisPromptSet === undefined) {
        console.log(`couldnt find the right mesId. looked for ${incomingMesId}`);
        console.log(itemizedPrompts);
        return null;
    }

    const params = await itemizedParams(itemizedPrompts, thisPromptSet, incomingMesId);

    const template =
        params.this_main_api == 'openai'
            ? await renderTemplateAsync('itemizationChat', params)
            : await renderTemplateAsync('itemizationText', params);

    const popup = new Popup(template, POPUP_TYPE.TEXT);

    /** @type {HTMLElement} */
    const diffPrevPrompt = popup.dlg.querySelector('#diffPrevPrompt');
    if (priorPromptArrayItemForRawPromptDisplay >= 0) {
        diffPrevPrompt.style.display = '';
        diffPrevPrompt.addEventListener('click', function () {
            const dmp = new DiffMatchPatch();
            const text1 = flatten(
                itemizedPrompts[priorPromptArrayItemForRawPromptDisplay].rawPrompt,
            );
            const text2 = flatten(itemizedPrompts[PromptArrayItemForRawPromptDisplay].rawPrompt);

            dmp.Diff_Timeout = 2.0;

            const d = dmp.diff_main(text1, text2);
            let ds = dmp.diff_prettyHtml(d);
            // make it readable
            ds = ds.replaceAll('background:#e6ffe6;', 'background:#b9f3b9; color:black;');
            ds = ds.replaceAll('background:#ffe6e6;', 'background:#f5b4b4; color:black;');
            ds = ds.replaceAll('&para;', '');
            const container = document.createElement('div');
            container.innerHTML = DOMPurify.sanitize(ds);
            const rawPromptWrapper = document.getElementById('rawPromptWrapper');
            // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
            rawPromptWrapper.replaceChildren(container);
            const rawPromptPopup = document.getElementById('rawPromptPopup');
            if (rawPromptPopup) {
                rawPromptPopup.style.display =
                    getComputedStyle(rawPromptPopup).display === 'none' ? '' : 'none';
            }
        });
    } else {
        diffPrevPrompt.style.display = 'none';
    }

    popup.dlg
        .querySelector('#copyPromptToClipboard')
        .addEventListener('pointerup', async function () {
            const rawPrompt = itemizedPrompts[PromptArrayItemForRawPromptDisplay].rawPrompt;
            await copyText(flatten(rawPrompt));
            notyf.info(t`Copied!`);
        });

    popup.dlg.querySelector('#showRawPrompt').addEventListener('click', async function () {
        //console.log(itemizedPrompts[PromptArrayItemForRawPromptDisplay].rawPrompt);
        console.log(PromptArrayItemForRawPromptDisplay);
        console.log(itemizedPrompts);
        console.log(itemizedPrompts[PromptArrayItemForRawPromptDisplay].rawPrompt);

        const rawPrompt = flatten(itemizedPrompts[PromptArrayItemForRawPromptDisplay].rawPrompt);

        // Mobile needs special handholding. The side-view on the popup wouldn't work,
        // so we just show an additional popup for this.
        if (isMobile()) {
            const content = document.createElement('div');
            content.classList.add('tokenItemizingMaintext');
            content.innerText = rawPrompt;
            // @ts-expect-error TS(2345) FIXME: Argument of type 'null' is not assignable to param... Remove this comment to see the full error message
            const popup = new Popup(content, POPUP_TYPE.TEXT, null, {
                allowVerticalScrolling: true,
                leftAlign: true,
            });
            await popup.show();
            return;
        }

        const rawPromptWrapper = document.getElementById('rawPromptWrapper');
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        rawPromptWrapper.innerText = rawPrompt;
        const rawPromptPopup = document.getElementById('rawPromptPopup');
        if (rawPromptPopup) {
            rawPromptPopup.style.display =
                getComputedStyle(rawPromptPopup).display === 'none' ? '' : 'none';
        }
    });

    await popup.show();
}

/**
 *
 */
export function initItemizedPrompts() {
    registerDebugFunction(
        'clearPrompts',
        'Delete itemized prompts',
        'Deletes all itemized prompts from the local storage.',
        async () => {
            await clearItemizedPrompts();
            notyf.info('Itemized prompts deleted.');
            if (getCurrentChatId()) {
                await reloadCurrentChat();
            }
        },
    );

    document.addEventListener('pointerup', async function (event) {
        // @ts-expect-error TS(2531) FIXME: Object is possibly 'null'.
        const target = event.target.closest('.mes_prompt');
        if (!target) {
            return;
        }
        const mesIdForItemization = target.closest('.mes')?.getAttribute('mesId');
        console.log(`looking for mesID: ${mesIdForItemization}`);

        // Simplified length check to avoid redundant property accesses
        if (mesIdForItemization && itemizedPrompts.length > 0) {
            await promptItemize(itemizedPrompts, mesIdForItemization);
        }
    });

    eventSource.on(event_types.CHAT_DELETED, async (name) => {
        await deleteItemizedPrompts(name);
    });
    eventSource.on(event_types.GROUP_CHAT_DELETED, async (name) => {
        await deleteItemizedPrompts(name);
    });
}

/**
 * Swaps the itemized prompts between two messages. Useful when moving messages around in the chat.
 * @param {number} sourceMessageId Source message ID
 * @param {number} targetMessageId Target message ID
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'sourceMessageId' implicitly has an 'any... Remove this comment to see the full error message
export function swapItemizedPrompts(sourceMessageId, targetMessageId) {
    if (!Array.isArray(itemizedPrompts)) {
        return;
    }

    // Replaced double filter().forEach() with a single pass to avoid intermediate array allocations
    for (let i = 0; i < itemizedPrompts.length; i++) {
        const prompt = itemizedPrompts[i]!;
        if (prompt.mesId === sourceMessageId) {
            prompt.mesId = targetMessageId;
        } else if (prompt.mesId === targetMessageId) {
            prompt.mesId = sourceMessageId;
        }
    }

    itemizedPrompts.sort((a, b) => a.mesId - b.mesId);
}

/**
 * Deletes the itemized prompt for a specific message.
 * Shifts down other itemized prompts as necessary.
 * @param {number} messageId Message ID to delete itemized prompt for
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'messageId' implicitly has an 'any' type... Remove this comment to see the full error message
export function deleteItemizedPromptForMessage(messageId) {
    if (!Array.isArray(itemizedPrompts)) {
        return;
    }

    // Replaced filter().filter().for...of with a single pass array reconstruction
    const newPrompts: any[] = [];
    for (let i = 0; i < itemizedPrompts.length; i++) {
        const prompt = itemizedPrompts[i]!;
        if (prompt.mesId === messageId) {
            continue;
        }
        if (prompt.mesId > messageId) {
            prompt.mesId -= 1;
        }
        newPrompts.push(prompt);
    }
    itemizedPrompts = newPrompts;
}
