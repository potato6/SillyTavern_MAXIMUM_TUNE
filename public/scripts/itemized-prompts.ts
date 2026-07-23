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

// @ts-expect-error TS(7034) FIXME: Variable 'PromptArrayItemForRawPromptDisplay' impl... Remove this comment to see the full error message
let PromptArrayItemForRawPromptDisplay;
// @ts-expect-error TS(7034) FIXME: Variable 'priorPromptArrayItemForRawPromptDisplay'... Remove this comment to see the full error message
let priorPromptArrayItemForRawPromptDisplay;

const promptStorage = localspace.createInstance({ name: 'SillyTavern_Prompts' });
export let itemizedPrompts = [];

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

    // @ts-expect-error TS(2339) FIXME: Property 'mesId' does not exist on type 'never'.
    const itemizedPrompt = itemizedPrompts.find((x) => x.mesId === mesId);

    if (!itemizedPrompt) {
        return;
    }

    // @ts-expect-error TS(2339) FIXME: Property 'rawPrompt' does not exist on type 'never... Remove this comment to see the full error message
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
    const params = {
        charDescriptionTokens: await getTokenCountAsync(
            itemizedPrompts[thisPromptSet].charDescription,
        ),
        charPersonalityTokens: await getTokenCountAsync(
            itemizedPrompts[thisPromptSet].charPersonality,
        ),
        scenarioTextTokens: await getTokenCountAsync(itemizedPrompts[thisPromptSet].scenarioText),
        userPersonaStringTokens: await getTokenCountAsync(
            itemizedPrompts[thisPromptSet].userPersona,
        ),
        worldInfoStringTokens: await getTokenCountAsync(
            itemizedPrompts[thisPromptSet].worldInfoString,
        ),
        allAnchorsTokens: await getTokenCountAsync(itemizedPrompts[thisPromptSet].allAnchors),
        summarizeStringTokens: await getTokenCountAsync(
            itemizedPrompts[thisPromptSet].summarizeString,
        ),
        authorsNoteStringTokens: await getTokenCountAsync(
            itemizedPrompts[thisPromptSet].authorsNoteString,
        ),
        smartContextStringTokens: await getTokenCountAsync(
            itemizedPrompts[thisPromptSet].smartContextString,
        ),
        beforeScenarioAnchorTokens: await getTokenCountAsync(
            itemizedPrompts[thisPromptSet].beforeScenarioAnchor,
        ),
        afterScenarioAnchorTokens: await getTokenCountAsync(
            itemizedPrompts[thisPromptSet].afterScenarioAnchor,
        ),
        zeroDepthAnchorTokens: await getTokenCountAsync(
            itemizedPrompts[thisPromptSet].zeroDepthAnchor,
        ), // TODO: unused
        thisPrompt_padding: itemizedPrompts[thisPromptSet].padding,
        this_main_api: itemizedPrompts[thisPromptSet].main_api,
        chatInjects: await getTokenCountAsync(itemizedPrompts[thisPromptSet].chatInjects),
        chatVectorsStringTokens: await getTokenCountAsync(
            itemizedPrompts[thisPromptSet].chatVectorsString,
        ),
        dataBankVectorsStringTokens: await getTokenCountAsync(
            itemizedPrompts[thisPromptSet].dataBankVectorsString,
        ),
        modelUsed: chat[incomingMesId]?.extra?.model,
        apiUsed: chat[incomingMesId]?.extra?.api,
        presetName: itemizedPrompts[thisPromptSet].presetName || t`(Unknown)`,
        messagesCount: String(itemizedPrompts[thisPromptSet].messagesCount ?? ''),
        examplesCount: String(itemizedPrompts[thisPromptSet].examplesCount ?? ''),
    };

    // @ts-expect-error TS(7006) FIXME: Parameter 'value' implicitly has an 'any' type.
    const getFriendlyName = (value) =>
        document.querySelector(`#rm_api_block select option[value="${value}"]`)?.textContent ||
        value;

    if (params.apiUsed) {
        params.apiUsed = getFriendlyName(params.apiUsed);
    }

    if (params.this_main_api) {
        // @ts-expect-error TS(2339) FIXME: Property 'mainApiFriendlyName' does not exist on t... Remove this comment to see the full error message
        params.mainApiFriendlyName = getFriendlyName(params.this_main_api);
    }

    if (params.chatInjects) {
        // @ts-expect-error TS(2339) FIXME: Property 'ActualChatHistoryTokens' does not exist ... Remove this comment to see the full error message
        params.ActualChatHistoryTokens = params.ActualChatHistoryTokens - params.chatInjects;
    }

    if (params.this_main_api == 'openai') {
        //for OAI API
        //console.log('-- Counting OAI Tokens');

        //params.finalPromptTokens = itemizedPrompts[thisPromptSet].oaiTotalTokens;
        // @ts-expect-error TS(2339) FIXME: Property 'oaiMainTokens' does not exist on type '{... Remove this comment to see the full error message
        params.oaiMainTokens = itemizedPrompts[thisPromptSet].oaiMainTokens;
        // @ts-expect-error TS(2339) FIXME: Property 'oaiStartTokens' does not exist on type '... Remove this comment to see the full error message
        params.oaiStartTokens = itemizedPrompts[thisPromptSet].oaiStartTokens;
        // @ts-expect-error TS(2339) FIXME: Property 'ActualChatHistoryTokens' does not exist ... Remove this comment to see the full error message
        params.ActualChatHistoryTokens = itemizedPrompts[thisPromptSet].oaiConversationTokens;
        // @ts-expect-error TS(2339) FIXME: Property 'examplesStringTokens' does not exist on ... Remove this comment to see the full error message
        params.examplesStringTokens = itemizedPrompts[thisPromptSet].oaiExamplesTokens;
        // @ts-expect-error TS(2339) FIXME: Property 'oaiPromptTokens' does not exist on type ... Remove this comment to see the full error message
        params.oaiPromptTokens =
            itemizedPrompts[thisPromptSet].oaiPromptTokens -
            (params.afterScenarioAnchorTokens + params.beforeScenarioAnchorTokens) +
// @ts-expect-error TS(2339) FIXME: Property 'examplesStringTokens' does not exist on type.
            params.examplesStringTokens;
        // @ts-expect-error TS(2339) FIXME: Property 'oaiBiasTokens' does not exist on type '{... Remove this comment to see the full error message
        params.oaiBiasTokens = itemizedPrompts[thisPromptSet].oaiBiasTokens;
        // @ts-expect-error TS(2339) FIXME: Property 'oaiJailbreakTokens' does not exist on ty... Remove this comment to see the full error message
        params.oaiJailbreakTokens = itemizedPrompts[thisPromptSet].oaiJailbreakTokens;
        // @ts-expect-error TS(2339) FIXME: Property 'oaiNudgeTokens' does not exist on type '... Remove this comment to see the full error message
        params.oaiNudgeTokens = itemizedPrompts[thisPromptSet].oaiNudgeTokens;
        // @ts-expect-error TS(2339) FIXME: Property 'oaiImpersonateTokens' does not exist on ... Remove this comment to see the full error message
        params.oaiImpersonateTokens = itemizedPrompts[thisPromptSet].oaiImpersonateTokens;
        // @ts-expect-error TS(2339) FIXME: Property 'oaiNsfwTokens' does not exist on type '{... Remove this comment to see the full error message
        params.oaiNsfwTokens = itemizedPrompts[thisPromptSet].oaiNsfwTokens;
        // @ts-expect-error TS(2339) FIXME: Property 'finalPromptTokens' does not exist on typ... Remove this comment to see the full error message
        params.finalPromptTokens =
            // @ts-expect-error TS(2339) FIXME: Property 'oaiStartTokens' does not exist on type '... Remove this comment to see the full error message
            params.oaiStartTokens +
            // @ts-expect-error TS(2339) FIXME: Property 'oaiPromptTokens' does not exist on type ... Remove this comment to see the full error message
            params.oaiPromptTokens +
            // @ts-expect-error TS(2339) FIXME: Property 'oaiMainTokens' does not exist on type '{... Remove this comment to see the full error message
            params.oaiMainTokens +
            // @ts-expect-error TS(2339) FIXME: Property 'oaiNsfwTokens' does not exist on type '{... Remove this comment to see the full error message
            params.oaiNsfwTokens +
            // @ts-expect-error TS(2339) FIXME: Property 'oaiBiasTokens' does not exist on type '{... Remove this comment to see the full error message
            params.oaiBiasTokens +
            // @ts-expect-error TS(2339) FIXME: Property 'oaiImpersonateTokens' does not exist on ... Remove this comment to see the full error message
            params.oaiImpersonateTokens +
            // @ts-expect-error TS(2339) FIXME: Property 'oaiJailbreakTokens' does not exist on ty... Remove this comment to see the full error message
            params.oaiJailbreakTokens +
            // @ts-expect-error TS(2339) FIXME: Property 'oaiNudgeTokens' does not exist on type '... Remove this comment to see the full error message
            params.oaiNudgeTokens +
            // @ts-expect-error TS(2339) FIXME: Property 'ActualChatHistoryTokens' does not exist ... Remove this comment to see the full error message
            params.ActualChatHistoryTokens +
            //charDescriptionTokens +
            //charPersonalityTokens +
            //allAnchorsTokens +
            params.worldInfoStringTokens +
            params.beforeScenarioAnchorTokens +
            params.afterScenarioAnchorTokens;
        // Max context size - max completion tokens
        // @ts-expect-error TS(2339) FIXME: Property 'thisPrompt_max_context' does not exist o... Remove this comment to see the full error message
        params.thisPrompt_max_context =
            oai_settings.openai_max_context - oai_settings.openai_max_tokens;

        //console.log('-- applying % on OAI tokens');
        // @ts-expect-error TS(2339) FIXME: Property 'oaiStartTokensPercentage' does not exist... Remove this comment to see the full error message
        params.oaiStartTokensPercentage = (
// @ts-expect-error TS(2339) FIXME: Property 'oaiStartTokens' does not exist on type.
            (params.oaiStartTokens / params.finalPromptTokens) *
            100
        ).toFixed(2);
        // @ts-expect-error TS(2339) FIXME: Property 'storyStringTokensPercentage' does not ex... Remove this comment to see the full error message
        params.storyStringTokensPercentage = (
            ((params.afterScenarioAnchorTokens +
                params.beforeScenarioAnchorTokens +
// @ts-expect-error TS(2339) FIXME: Property 'oaiPromptTokens' does not exist on type.
                params.oaiPromptTokens) /
// @ts-expect-error TS(2339) FIXME: Property 'finalPromptTokens' does not exist on type.
                params.finalPromptTokens) *
            100
        ).toFixed(2);
        // @ts-expect-error TS(2339) FIXME: Property 'ActualChatHistoryTokensPercentage' does ... Remove this comment to see the full error message
        params.ActualChatHistoryTokensPercentage = (
// @ts-expect-error TS(2339) FIXME: Property 'ActualChatHistoryTokens' does not exist on type.
            (params.ActualChatHistoryTokens / params.finalPromptTokens) *
            100
        ).toFixed(2);
        // @ts-expect-error TS(2339) FIXME: Property 'promptBiasTokensPercentage' does not exi... Remove this comment to see the full error message
        params.promptBiasTokensPercentage = (
// @ts-expect-error TS(2339) FIXME: Property 'oaiBiasTokens' does not exist on type.
            (params.oaiBiasTokens / params.finalPromptTokens) *
            100
        ).toFixed(2);
        // @ts-expect-error TS(2339) FIXME: Property 'worldInfoStringTokensPercentage' does no... Remove this comment to see the full error message
        params.worldInfoStringTokensPercentage = (
// @ts-expect-error TS(2339) FIXME: Property 'worldInfoStringTokens' does not exist on type.
            (params.worldInfoStringTokens / params.finalPromptTokens) *
            100
        ).toFixed(2);
        // @ts-expect-error TS(2339) FIXME: Property 'allAnchorsTokensPercentage' does not exi... Remove this comment to see the full error message
        params.allAnchorsTokensPercentage = (
// @ts-expect-error TS(2339) FIXME: Property 'allAnchorsTokens' does not exist on type.
            (params.allAnchorsTokens / params.finalPromptTokens) *
            100
        ).toFixed(2);
        // @ts-expect-error TS(2339) FIXME: Property 'selectedTokenizer' does not exist on typ... Remove this comment to see the full error message
        params.selectedTokenizer = getFriendlyTokenizerName(params.this_main_api).tokenizerName;
        // @ts-expect-error TS(2339) FIXME: Property 'oaiSystemTokens' does not exist on type ... Remove this comment to see the full error message
        params.oaiSystemTokens =
// @ts-expect-error TS(2339) FIXME: Property 'oaiImpersonateTokens' does not exist on type.
            params.oaiImpersonateTokens +
// @ts-expect-error TS(2339) FIXME: Property 'oaiJailbreakTokens' does not exist on type.
            params.oaiJailbreakTokens +
// @ts-expect-error TS(2339) FIXME: Property 'oaiNudgeTokens' does not exist on type.
            params.oaiNudgeTokens +
// @ts-expect-error TS(2339) FIXME: Property 'oaiStartTokens' does not exist on type.
            params.oaiStartTokens +
// @ts-expect-error TS(2339) FIXME: Property 'oaiNsfwTokens' does not exist on type.
            params.oaiNsfwTokens +
// @ts-expect-error TS(2339) FIXME: Property 'oaiMainTokens' does not exist on type.
            params.oaiMainTokens;
        // @ts-expect-error TS(2339) FIXME: Property 'oaiSystemTokensPercentage' does not exis... Remove this comment to see the full error message
        params.oaiSystemTokensPercentage = (
// @ts-expect-error TS(2339) FIXME: Property 'oaiSystemTokens' does not exist on type.
            (params.oaiSystemTokens / params.finalPromptTokens) *
            100
        ).toFixed(2);
    } else {
        //for non-OAI APIs
        //console.log('-- Counting non-OAI Tokens');
        // @ts-expect-error TS(2339) FIXME: Property 'finalPromptTokens' does not exist on typ... Remove this comment to see the full error message
        params.finalPromptTokens = await getTokenCountAsync(
            itemizedPrompts[thisPromptSet].finalPrompt,
        );
        // @ts-expect-error TS(2339) FIXME: Property 'storyStringTokens' does not exist on typ... Remove this comment to see the full error message
        params.storyStringTokens =
            (await getTokenCountAsync(itemizedPrompts[thisPromptSet].storyString)) -
            params.worldInfoStringTokens;
        // @ts-expect-error TS(2339) FIXME: Property 'examplesStringTokens' does not exist on ... Remove this comment to see the full error message
        params.examplesStringTokens = await getTokenCountAsync(
            itemizedPrompts[thisPromptSet].examplesString,
        );
        // @ts-expect-error TS(2339) FIXME: Property 'mesSendStringTokens' does not exist on t... Remove this comment to see the full error message
        params.mesSendStringTokens = await getTokenCountAsync(
            itemizedPrompts[thisPromptSet].mesSendString,
        );
        // @ts-expect-error TS(2339) FIXME: Property 'ActualChatHistoryTokens' does not exist ... Remove this comment to see the full error message
        params.ActualChatHistoryTokens =
// @ts-expect-error TS(2339) FIXME: Property 'mesSendStringTokens' does not exist on type.
            params.mesSendStringTokens -
            (params.allAnchorsTokens -
                (params.beforeScenarioAnchorTokens + params.afterScenarioAnchorTokens)) +
            power_user.token_padding;
        // @ts-expect-error TS(2339) FIXME: Property 'instructionTokens' does not exist on typ... Remove this comment to see the full error message
        params.instructionTokens = await getTokenCountAsync(
            itemizedPrompts[thisPromptSet].instruction,
        );
        // @ts-expect-error TS(2339) FIXME: Property 'promptBiasTokens' does not exist on type... Remove this comment to see the full error message
        params.promptBiasTokens = await getTokenCountAsync(
            itemizedPrompts[thisPromptSet].promptBias,
        );

        // @ts-expect-error TS(2339) FIXME: Property 'totalTokensInPrompt' does not exist on t... Remove this comment to see the full error message
        params.totalTokensInPrompt =
            // @ts-expect-error TS(2339) FIXME: Property 'storyStringTokens' does not exist on typ... Remove this comment to see the full error message
            params.storyStringTokens + //chardefs total
            params.worldInfoStringTokens +
            // @ts-expect-error TS(2339) FIXME: Property 'examplesStringTokens' does not exist on ... Remove this comment to see the full error message
            params.examplesStringTokens + // example messages
            // @ts-expect-error TS(2339) FIXME: Property 'ActualChatHistoryTokens' does not exist ... Remove this comment to see the full error message
            params.ActualChatHistoryTokens + //chat history
            params.allAnchorsTokens + // AN and/or legacy anchors
            //afterScenarioAnchorTokens +       //only counts if AN is set to 'after scenario'
            //zeroDepthAnchorTokens +           //same as above, even if AN not on 0 depth
            // @ts-expect-error TS(2339) FIXME: Property 'promptBiasTokens' does not exist on type... Remove this comment to see the full error message
            params.promptBiasTokens; //{{}}
        //- thisPrompt_padding;  //not sure this way of calculating is correct, but the math results in same value as 'finalPrompt'
        // @ts-expect-error TS(2339) FIXME: Property 'thisPrompt_max_context' does not exist o... Remove this comment to see the full error message
        params.thisPrompt_max_context = itemizedPrompts[thisPromptSet].this_max_context;
        // @ts-expect-error TS(2339) FIXME: Property 'thisPrompt_actual' does not exist on typ... Remove this comment to see the full error message
        params.thisPrompt_actual = params.thisPrompt_max_context - params.thisPrompt_padding;

        //console.log('-- applying % on non-OAI tokens');
        // @ts-expect-error TS(2339) FIXME: Property 'storyStringTokensPercentage' does not ex... Remove this comment to see the full error message
        params.storyStringTokensPercentage = (
// @ts-expect-error TS(2339) FIXME: Property 'storyStringTokens' does not exist on type.
            (params.storyStringTokens / params.totalTokensInPrompt) *
            100
        ).toFixed(2);
        // @ts-expect-error TS(2339) FIXME: Property 'ActualChatHistoryTokensPercentage' does ... Remove this comment to see the full error message
        params.ActualChatHistoryTokensPercentage = (
// @ts-expect-error TS(2339) FIXME: Property 'ActualChatHistoryTokens' does not exist on type.
            (params.ActualChatHistoryTokens / params.totalTokensInPrompt) *
            100
        ).toFixed(2);
        // @ts-expect-error TS(2339) FIXME: Property 'promptBiasTokensPercentage' does not exi... Remove this comment to see the full error message
        params.promptBiasTokensPercentage = (
// @ts-expect-error TS(2339) FIXME: Property 'promptBiasTokens' does not exist on type.
            (params.promptBiasTokens / params.totalTokensInPrompt) *
            100
        ).toFixed(2);
        // @ts-expect-error TS(2339) FIXME: Property 'worldInfoStringTokensPercentage' does no... Remove this comment to see the full error message
        params.worldInfoStringTokensPercentage = (
// @ts-expect-error TS(2339) FIXME: Property 'worldInfoStringTokens' does not exist on type.
            (params.worldInfoStringTokens / params.totalTokensInPrompt) *
            100
        ).toFixed(2);
        // @ts-expect-error TS(2339) FIXME: Property 'allAnchorsTokensPercentage' does not exi... Remove this comment to see the full error message
        params.allAnchorsTokensPercentage = (
// @ts-expect-error TS(2339) FIXME: Property 'allAnchorsTokens' does not exist on type.
            (params.allAnchorsTokens / params.totalTokensInPrompt) *
            100
        ).toFixed(2);
        // @ts-expect-error TS(2339) FIXME: Property 'selectedTokenizer' does not exist on typ... Remove this comment to see the full error message
        params.selectedTokenizer =
            itemizedPrompts[thisPromptSet]?.tokenizer ||
            getFriendlyTokenizerName(params.this_main_api).tokenizerName;
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
        console.log(`looking for ${incomingMesId} vs ${itemizedPrompts[i].mesId}`);
        if (itemizedPrompts[i].mesId === incomingMesId) {
            console.log(`found matching mesID ${i}`);
            thisPromptSet = i;
            PromptArrayItemForRawPromptDisplay = i;
            console.log(
                `wanting to raw display of ArrayItem: ${PromptArrayItemForRawPromptDisplay} which is mesID ${incomingMesId}`,
            );
            console.log(itemizedPrompts[thisPromptSet]);
            break;
        } else if (itemizedPrompts[i].rawPrompt) {
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
    // @ts-expect-error TS(7006) FIXME: Parameter 'rawPrompt' implicitly has an 'any' type... Remove this comment to see the full error message
    const flatten = (rawPrompt) =>
        Array.isArray(rawPrompt) ? rawPrompt.map((x) => x.content).join('\n') : rawPrompt;

    const template =
        params.this_main_api == 'openai'
            ? await renderTemplateAsync('itemizationChat', params)
            : await renderTemplateAsync('itemizationText', params);

    const popup = new Popup(template, POPUP_TYPE.TEXT);

    /** @type {HTMLElement} */
    const diffPrevPrompt = popup.dlg.querySelector('#diffPrevPrompt');
    // @ts-expect-error TS(7005) FIXME: Variable 'priorPromptArrayItemForRawPromptDisplay'... Remove this comment to see the full error message
    if (priorPromptArrayItemForRawPromptDisplay >= 0) {
        diffPrevPrompt.style.display = '';
        diffPrevPrompt.addEventListener('click', function () {
            const dmp = new DiffMatchPatch();
            const text1 = flatten(
// @ts-expect-error TS(7005) FIXME: Variable 'priorPromptArrayItemForRawPromptDisplay' implicitly has an 'any' type.
                itemizedPrompts[priorPromptArrayItemForRawPromptDisplay].rawPrompt,
            );
            // @ts-expect-error TS(7005) FIXME: Variable 'PromptArrayItemForRawPromptDisplay' impl... Remove this comment to see the full error message
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
            // @ts-expect-error TS(7005) FIXME: Variable 'PromptArrayItemForRawPromptDisplay' impl... Remove this comment to see the full error message
            const rawPrompt = itemizedPrompts[PromptArrayItemForRawPromptDisplay].rawPrompt;
            let rawPromptValues = rawPrompt;

            if (Array.isArray(rawPrompt)) {
                rawPromptValues = rawPrompt.map((x) => x.content).join('\n');
            }

            await copyText(rawPromptValues);
            notyf.info(t`Copied!`);
        });

    popup.dlg.querySelector('#showRawPrompt').addEventListener('click', async function () {
        //console.log(itemizedPrompts[PromptArrayItemForRawPromptDisplay].rawPrompt);
        // @ts-expect-error TS(7005) FIXME: Variable 'PromptArrayItemForRawPromptDisplay' impl... Remove this comment to see the full error message
        console.log(PromptArrayItemForRawPromptDisplay);
        console.log(itemizedPrompts);
        // @ts-expect-error TS(7005) FIXME: Variable 'PromptArrayItemForRawPromptDisplay' impl... Remove this comment to see the full error message
        console.log(itemizedPrompts[PromptArrayItemForRawPromptDisplay].rawPrompt);

        // @ts-expect-error TS(7005) FIXME: Variable 'PromptArrayItemForRawPromptDisplay' impl... Remove this comment to see the full error message
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

        //let DisplayStringifiedPrompt = JSON.stringify(itemizedPrompts[PromptArrayItemForRawPromptDisplay].rawPrompt).replace(/\n+/g, '<br>');
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
        if (
            mesIdForItemization &&
            itemizedPrompts.length !== undefined &&
            itemizedPrompts.length !== 0
        ) {
            await promptItemize(itemizedPrompts, mesIdForItemization);
        }
    });

    // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
    eventSource.on(event_types.CHAT_DELETED, async (name) => {
        await deleteItemizedPrompts(name);
    });
    // @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
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

    // @ts-expect-error TS(2339) FIXME: Property 'mesId' does not exist on type 'never'.
    const sourcePrompts = itemizedPrompts.filter((x) => x.mesId === sourceMessageId);
    // @ts-expect-error TS(2339) FIXME: Property 'mesId' does not exist on type 'never'.
    const targetPrompts = itemizedPrompts.filter((x) => x.mesId === targetMessageId);

    sourcePrompts.forEach((prompt) => {
        // @ts-expect-error TS(2339) FIXME: Property 'mesId' does not exist on type 'never'.
        prompt.mesId = targetMessageId;
    });

    targetPrompts.forEach((prompt) => {
        // @ts-expect-error TS(2339) FIXME: Property 'mesId' does not exist on type 'never'.
        prompt.mesId = sourceMessageId;
    });

    // @ts-expect-error TS(2339) FIXME: Property 'mesId' does not exist on type 'never'.
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

    // @ts-expect-error TS(2339) FIXME: Property 'mesId' does not exist on type 'never'.
    itemizedPrompts = itemizedPrompts.filter((x) => x.mesId !== messageId);

    // @ts-expect-error TS(2339) FIXME: Property 'mesId' does not exist on type 'never'.
    for (const prompt of itemizedPrompts.filter((x) => x.mesId > messageId)) {
        // @ts-expect-error TS(2339) FIXME: Property 'mesId' does not exist on type 'never'.
        prompt.mesId -= 1;
    }
}
