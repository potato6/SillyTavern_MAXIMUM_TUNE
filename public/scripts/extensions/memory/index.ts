import { getStringHash, debounce, waitUntilCondition, extractAllWords, isTrueBoolean } from '../../utils.js';
declare const $: any; declare const toastr: any;
import { getContext, getApiUrl, extension_settings, doExtrasFetch, modules, renderExtensionTemplateAsync } from '../../extensions.js';
import { removeReasoningFromString } from '../../reasoning.js';
import {
    activateSendButtons,
    deactivateSendButtons,
    animation_duration,
    eventSource,
    event_types,
    extension_prompt_roles,
    extension_prompt_types,
    generateQuietPrompt,
    is_send_press,
    saveSettingsDebounced,
    substituteParams,
    generateRaw,
    getMaxPromptTokens,
    setExtensionPrompt,
    streamingProcessor,
    animation_easing,
} from '../../../script.js';
import { is_group_generating, selected_group } from '../../group-chats.js';
import { loadMovingUIState, power_user } from '../../power-user.js';
import { dragElement } from '../../RossAscends-mods.js';
import { getTextTokens, getTokenCountAsync, tokenizers } from '../../tokenizers.js';
import { debounce_timeout } from '../../constants.js';
import { SlashCommandParser } from '../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../slash-commands/SlashCommandArgument.js';
import { macros, MacroCategory } from '../../macros/macro-system.js';
import { countWebLlmTokens, generateWebLlmChatPrompt, getWebLlmContextSize, isWebLlmSupported } from '../shared.js';
import { commonEnumProviders } from '../../slash-commands/SlashCommandCommonEnumsProvider.js';
export { MODULE_NAME };

const MODULE_NAME = '1_memory';

let lastMessageHash: any = null;
let lastMessageId: any = null;
let inApiCall = false;

/**
 * Count the number of tokens in the provided text.
 * @param {string} text Text to count tokens for
 * @param {number} padding Number of additional tokens to add to the count
 * @returns {Promise<number>} Number of tokens in the text
 */
async function countSourceTokens(text: any, padding = 0) {
    // @ts-expect-error TS(2339): Property 'source' does not exist on type '{}'.
    if (extension_settings.memory.source === summary_sources.webllm) {
        const count = await countWebLlmTokens(text);
        return count + padding;
    }

    // @ts-expect-error TS(2339): Property 'source' does not exist on type '{}'.
    if (extension_settings.memory.source === summary_sources.extras) {
        const count = (await getTextTokens(tokenizers.GPT2, text)).length;
        return count + padding;
    }

    // @ts-expect-error TS(2345): Argument of type 'number' is not assignable to par... Remove this comment to see the full error message
    return await getTokenCountAsync(text, padding);
}

async function getSourceContextSize() {
    // @ts-expect-error TS(2339): Property 'overrideResponseLength' does not exist o... Remove this comment to see the full error message
    const overrideLength = extension_settings.memory.overrideResponseLength;

    // @ts-expect-error TS(2339): Property 'source' does not exist on type '{}'.
    if (extension_settings.memory.source === summary_sources.webllm) {
        const maxContext = await getWebLlmContextSize();
        return overrideLength > 0 ? (maxContext - overrideLength) : Math.round(maxContext * 0.75);
    }

    if (extension_settings.source === summary_sources.extras) {
        return 1024 - 64;
    }

    return getMaxPromptTokens(overrideLength);
}

const formatMemoryValue = function (value: any) {
    if (!value) {
        return '';
    }

    value = value.trim();

    // @ts-expect-error TS(2339): Property 'template' does not exist on type '{}'.
    if (extension_settings.memory.template) {
        // @ts-expect-error TS(2339): Property 'template' does not exist on type '{}'.
        return substituteParams(extension_settings.memory.template, { dynamicMacros: { summary: value } });
    } else {
        return `Summary: ${value}`;
    }
};

const saveChatDebounced = debounce(() => getContext().saveChat(), debounce_timeout.relaxed);

const summary_sources = {
    'extras': 'extras',
    'main': 'main',
    'webllm': 'webllm',
};

const prompt_builders = {
    DEFAULT: 0,
    RAW_BLOCKING: 1,
    RAW_NON_BLOCKING: 2,
};

const defaultPrompt = 'Ignore previous instructions. Summarize the most important facts and events in the story so far. If a summary already exists in your memory, use that as a base and expand with new facts. Limit the summary to {{words}} words or less. Your response should include nothing but the summary.';
const defaultTemplate = '[Summary: {{summary}}]';

const defaultSettings = {
    memoryFrozen: false,
    SkipWIAN: false,
    source: summary_sources.extras,
    prompt: defaultPrompt,
    template: defaultTemplate,
    position: extension_prompt_types.IN_PROMPT,
    role: extension_prompt_roles.SYSTEM,
    scan: false,
    depth: 2,
    promptWords: 200,
    promptMinWords: 25,
    promptMaxWords: 1000,
    promptWordsStep: 25,
    promptInterval: 10,
    promptMinInterval: 0,
    promptMaxInterval: 250,
    promptIntervalStep: 1,
    promptForceWords: 0,
    promptForceWordsStep: 100,
    promptMinForceWords: 0,
    promptMaxForceWords: 10000,
    overrideResponseLength: 0,
    overrideResponseLengthMin: 0,
    overrideResponseLengthMax: 4096,
    overrideResponseLengthStep: 16,
    maxMessagesPerRequest: 0,
    maxMessagesPerRequestMin: 0,
    maxMessagesPerRequestMax: 250,
    maxMessagesPerRequestStep: 1,
    prompt_builder: prompt_builders.DEFAULT,
};

function loadSettings() {
    if (Object.keys(extension_settings.memory as Record<string, unknown>).length === 0) {
        Object.assign(extension_settings.memory as Record<string, unknown>, defaultSettings);
    }

    for (const key of Object.keys(defaultSettings)) {
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        if (extension_settings.memory[key] === undefined) {
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            extension_settings.memory[key] = defaultSettings[key];
        }
    }

    // @ts-expect-error TS(2339): Property 'source' does not exist on type '{}'.
    $('#summary_source').val(extension_settings.memory.source);
    document.getElementById('summary_source')?.dispatchEvent(new Event('change'));
    // @ts-expect-error TS(2339): Property 'memoryFrozen' does not exist on type '{}... Remove this comment to see the full error message
    $('#memory_frozen').prop('checked', extension_settings.memory.memoryFrozen);
    document.getElementById('memory_frozen')?.dispatchEvent(new Event('input'));
    // @ts-expect-error TS(2339): Property 'SkipWIAN' does not exist on type '{}'.
    $('#memory_skipWIAN').prop('checked', extension_settings.memory.SkipWIAN);
    document.getElementById('memory_skipWIAN')?.dispatchEvent(new Event('input'));
    // @ts-expect-error TS(2339): Property 'prompt' does not exist on type '{}'.
    $('#memory_prompt').val(extension_settings.memory.prompt);
    document.getElementById('memory_prompt')?.dispatchEvent(new Event('input'));
    // @ts-expect-error TS(2339): Property 'promptWords' does not exist on type '{}'... Remove this comment to see the full error message
    $('#memory_prompt_words').val(extension_settings.memory.promptWords);
    document.getElementById('memory_prompt_words')?.dispatchEvent(new Event('input'));
    // @ts-expect-error TS(2339): Property 'promptInterval' does not exist on type '... Remove this comment to see the full error message
    $('#memory_prompt_interval').val(extension_settings.memory.promptInterval);
    document.getElementById('memory_prompt_interval')?.dispatchEvent(new Event('input'));
    // @ts-expect-error TS(2339): Property 'template' does not exist on type '{}'.
    $('#memory_template').val(extension_settings.memory.template);
    document.getElementById('memory_template')?.dispatchEvent(new Event('input'));
    // @ts-expect-error TS(2339): Property 'depth' does not exist on type '{}'.
    $('#memory_depth').val(extension_settings.memory.depth);
    document.getElementById('memory_depth')?.dispatchEvent(new Event('input'));
    // @ts-expect-error TS(2339): Property 'role' does not exist on type '{}'.
    $('#memory_role').val(extension_settings.memory.role);
    document.getElementById('memory_role')?.dispatchEvent(new Event('input'));
    // @ts-expect-error TS(2339): Property 'position' does not exist on type '{}'.
    $(`input[name="memory_position"][value="${extension_settings.memory.position}"]`).prop('checked', true);
    // @ts-expect-error TS(2339): Property 'position' does not exist on type '{}'.
    const memoryPositionInput = document.querySelector(`input[name="memory_position"][value="${extension_settings.memory.position}"]`);
    memoryPositionInput?.dispatchEvent(new Event('input'));
    // @ts-expect-error TS(2339): Property 'promptForceWords' does not exist on type... Remove this comment to see the full error message
    $('#memory_prompt_words_force').val(extension_settings.memory.promptForceWords);
    document.getElementById('memory_prompt_words_force')?.dispatchEvent(new Event('input'));
    // @ts-expect-error TS(2339): Property 'prompt_builder' does not exist on type '... Remove this comment to see the full error message
    $(`input[name="memory_prompt_builder"][value="${extension_settings.memory.prompt_builder}"]`).prop('checked', true);
    // @ts-expect-error TS(2339): Property 'prompt_builder' does not exist on type '... Remove this comment to see the full error message
    document.querySelector(`input[name="memory_prompt_builder"][value="${extension_settings.memory.prompt_builder}"]`)?.dispatchEvent(new Event('input'));
    // @ts-expect-error TS(2339): Property 'overrideResponseLength' does not exist o... Remove this comment to see the full error message
    $('#memory_override_response_length').val(extension_settings.memory.overrideResponseLength);
    document.getElementById('memory_override_response_length')?.dispatchEvent(new Event('input'));
    // @ts-expect-error TS(2339): Property 'maxMessagesPerRequest' does not exist on... Remove this comment to see the full error message
    $('#memory_max_messages_per_request').val(extension_settings.memory.maxMessagesPerRequest);
    document.getElementById('memory_max_messages_per_request')?.dispatchEvent(new Event('input'));
    // @ts-expect-error TS(2339): Property 'scan' does not exist on type '{}'.
    $('#memory_include_wi_scan').prop('checked', extension_settings.memory.scan);
    document.getElementById('memory_include_wi_scan')?.dispatchEvent(new Event('input'));
    // @ts-expect-error TS(2339): Property 'source' does not exist on type '{}'.
    switchSourceControls(extension_settings.memory.source);
}

async function onPromptForceWordsAutoClick() {
    const context = getContext();
    const maxPromptLength = await getSourceContextSize();
    const chat = context.chat;
    const allMessages = chat.filter((m: any) => !m.is_system && m.mes).map((m: any) => m.mes);
    const messagesWordCount = allMessages.map(m => extractAllWords(m)).flat().length;
    const averageMessageWordCount = messagesWordCount / allMessages.length;
    const tokensPerWord = (await countSourceTokens(allMessages.join('\n'))) / messagesWordCount;
    const wordsPerToken = 1 / tokensPerWord;
    const maxPromptLengthWords = Math.round(maxPromptLength * wordsPerToken);
    // How many words should pass so that messages will start be dropped out of context;
    const wordsPerPrompt = Math.floor(maxPromptLength / tokensPerWord);
    // How many words will be needed to fit the allowance buffer
    const summaryPromptWords = extractAllWords((extension_settings.memory as Record<string, any>).prompt).length;
    const promptAllowanceWords = maxPromptLengthWords - (extension_settings.memory as Record<string, any>).promptWords - summaryPromptWords;
    const averageMessagesPerPrompt = Math.floor(promptAllowanceWords / averageMessageWordCount);
    // @ts-expect-error TS(2339): Property 'maxMessagesPerRequest' does not exist on... Remove this comment to see the full error message
    const maxMessagesPerSummary = extension_settings.memory.maxMessagesPerRequest || 0;
    const targetMessagesInPrompt = maxMessagesPerSummary > 0 ? maxMessagesPerSummary : Math.max(0, averageMessagesPerPrompt);
    const targetSummaryWords = (targetMessagesInPrompt * averageMessageWordCount) + (promptAllowanceWords / 4);

    console.table({
        maxPromptLength,
        maxPromptLengthWords,
        promptAllowanceWords,
        averageMessagesPerPrompt,
        targetMessagesInPrompt,
        targetSummaryWords,
        wordsPerPrompt,
        wordsPerToken,
        tokensPerWord,
        messagesWordCount,
    });

    const ROUNDING = 100;
    (extension_settings.memory as Record<string, any>).promptForceWords = Math.max(1, Math.floor(targetSummaryWords / ROUNDING) * ROUNDING);
    $('#memory_prompt_words_force').val((extension_settings.memory as Record<string, any>).promptForceWords);
    document.getElementById('memory_prompt_words_force')?.dispatchEvent(new Event('input'));
}

async function onPromptIntervalAutoClick() {
    const context = getContext();
    const maxPromptLength = await getSourceContextSize();
    const chat = context.chat;
    const allMessages = chat.filter((m: any) => !m.is_system && m.mes).map((m: any) => m.mes);
    const messagesWordCount = allMessages.map(m => extractAllWords(m)).flat().length;
    const messagesTokenCount = await countSourceTokens(allMessages.join('\n'));
    const tokensPerWord = messagesTokenCount / messagesWordCount;
    const averageMessageTokenCount = messagesTokenCount / allMessages.length;
    const targetSummaryTokens = Math.round((extension_settings.memory as Record<string, any>).promptWords * tokensPerWord);
    const promptTokens = await countSourceTokens((extension_settings.memory as Record<string, any>).prompt);
    const promptAllowance = maxPromptLength - promptTokens - targetSummaryTokens;
    const maxMessagesPerSummary = (extension_settings.memory as Record<string, any>).maxMessagesPerRequest || 0;
    const averageMessagesPerPrompt = Math.floor(promptAllowance / averageMessageTokenCount);
    const targetMessagesInPrompt = maxMessagesPerSummary > 0 ? maxMessagesPerSummary : Math.max(0, averageMessagesPerPrompt);
    const adjustedAverageMessagesPerPrompt = targetMessagesInPrompt + (averageMessagesPerPrompt - targetMessagesInPrompt) / 4;

    console.table({
        maxPromptLength,
        promptAllowance,
        targetSummaryTokens,
        promptTokens,
        messagesWordCount,
        messagesTokenCount,
        tokensPerWord,
        averageMessageTokenCount,
        averageMessagesPerPrompt,
        targetMessagesInPrompt,
        adjustedAverageMessagesPerPrompt,
        maxMessagesPerSummary,
    });

    const ROUNDING = 5;
    // @ts-expect-error TS(2339): Property 'promptInterval' does not exist on type '... Remove this comment to see the full error message
    extension_settings.memory.promptInterval = Math.max(1, Math.floor(adjustedAverageMessagesPerPrompt / ROUNDING) * ROUNDING);

    // @ts-expect-error TS(2339): Property 'promptInterval' does not exist on type '... Remove this comment to see the full error message
    $('#memory_prompt_interval').val(extension_settings.memory.promptInterval);
    document.getElementById('memory_prompt_interval')?.dispatchEvent(new Event('input'));
}

function onSummarySourceChange(event: any) {
    const value = event.target.value;
    // @ts-expect-error TS(2339): Property 'source' does not exist on type '{}'.
    extension_settings.memory.source = value;
    switchSourceControls(value);
    saveSettingsDebounced();
}

function switchSourceControls(value: any) {
    const elements = document.querySelectorAll('#summaryExtensionDrawerContents [data-summary-source], #memory_settings [data-summary-source]');
    elements.forEach(element => {
        // @ts-expect-error TS(2339): Property 'dataset' does not exist on type 'Element... Remove this comment to see the full error message
        const source = element.dataset.summarySource.split(',').map((s: any) => s.trim());
        $(element).toggle(source.includes(value));
    });
}

function onMemoryFrozenInput(this: any) {
    const value = Boolean(this.checked);
    // @ts-expect-error TS(2339): Property 'memoryFrozen' does not exist on type '{}... Remove this comment to see the full error message
    extension_settings.memory.memoryFrozen = value;
    saveSettingsDebounced();
}

function onMemorySkipWIANInput(this: any) {
    const value = Boolean(this.checked);
    // @ts-expect-error TS(2339): Property 'SkipWIAN' does not exist on type '{}'.
    extension_settings.memory.SkipWIAN = value;
    saveSettingsDebounced();
}

function onMemoryPromptWordsInput(this: any) {
    const value = this.value;
    // @ts-expect-error TS(2339): Property 'promptWords' does not exist on type '{}'... Remove this comment to see the full error message
    extension_settings.memory.promptWords = Number(value);
    // @ts-expect-error TS(2339): Property 'promptWords' does not exist on type '{}'... Remove this comment to see the full error message
    $('#memory_prompt_words_value').text(extension_settings.memory.promptWords);
    saveSettingsDebounced();
}

function onMemoryPromptIntervalInput(this: any) {
    const value = this.value;
    // @ts-expect-error TS(2339): Property 'promptInterval' does not exist on type '... Remove this comment to see the full error message
    extension_settings.memory.promptInterval = Number(value);
    // @ts-expect-error TS(2339): Property 'promptInterval' does not exist on type '... Remove this comment to see the full error message
    $('#memory_prompt_interval_value').text(extension_settings.memory.promptInterval);
    saveSettingsDebounced();
}

function onMemoryPromptRestoreClick() {
    $('#memory_prompt').val(defaultPrompt);
    document.getElementById('memory_prompt')?.dispatchEvent(new Event('input'));
}

function onMemoryPromptInput(this: any) {
    const value = this.value;
    // @ts-expect-error TS(2339): Property 'prompt' does not exist on type '{}'.
    extension_settings.memory.prompt = value;
    saveSettingsDebounced();
}

function onMemoryTemplateInput(this: any) {
    const value = this.value;
    // @ts-expect-error TS(2339): Property 'template' does not exist on type '{}'.
    extension_settings.memory.template = value;
    reinsertMemory();
    saveSettingsDebounced();
}

function onMemoryDepthInput(this: any) {
    const value = this.value;
    // @ts-expect-error TS(2339): Property 'depth' does not exist on type '{}'.
    extension_settings.memory.depth = Number(value);
    reinsertMemory();
    saveSettingsDebounced();
}

function onMemoryRoleInput(this: any) {
    const value = this.value;
    // @ts-expect-error TS(2339): Property 'role' does not exist on type '{}'.
    extension_settings.memory.role = Number(value);
    reinsertMemory();
    saveSettingsDebounced();
}

function onMemoryPositionChange(e: any) {
    const value = e.target.value;
    // @ts-expect-error TS(2339): Property 'position' does not exist on type '{}'.
    extension_settings.memory.position = value;
    reinsertMemory();
    saveSettingsDebounced();
}

function onMemoryIncludeWIScanInput(this: any) {
    const value = !!this.checked;
    // @ts-expect-error TS(2339): Property 'scan' does not exist on type '{}'.
    extension_settings.memory.scan = value;
    reinsertMemory();
    saveSettingsDebounced();
}

function onMemoryPromptWordsForceInput(this: any) {
    const value = this.value;
    // @ts-expect-error TS(2339): Property 'promptForceWords' does not exist on type... Remove this comment to see the full error message
    extension_settings.memory.promptForceWords = Number(value);
    // @ts-expect-error TS(2339): Property 'promptForceWords' does not exist on type... Remove this comment to see the full error message
    $('#memory_prompt_words_force_value').text(extension_settings.memory.promptForceWords);
    saveSettingsDebounced();
}

function onOverrideResponseLengthInput(this: any) {
    const value = this.value;
    // @ts-expect-error TS(2339): Property 'overrideResponseLength' does not exist o... Remove this comment to see the full error message
    extension_settings.memory.overrideResponseLength = Number(value);
    // @ts-expect-error TS(2339): Property 'overrideResponseLength' does not exist o... Remove this comment to see the full error message
    $('#memory_override_response_length_value').text(extension_settings.memory.overrideResponseLength);
    saveSettingsDebounced();
}

function onMaxMessagesPerRequestInput(this: any) {
    const value = this.value;
    // @ts-expect-error TS(2339): Property 'maxMessagesPerRequest' does not exist on... Remove this comment to see the full error message
    extension_settings.memory.maxMessagesPerRequest = Number(value);
    // @ts-expect-error TS(2339): Property 'maxMessagesPerRequest' does not exist on... Remove this comment to see the full error message
    $('#memory_max_messages_per_request_value').text(extension_settings.memory.maxMessagesPerRequest);
    saveSettingsDebounced();
}

/**
 * Get the latest memory summary from the chat.
 * @param {ChatMessage[]} chat Chat messages
 * @returns {string} Latest memory summary or empty string
 */
function getLatestMemoryFromChat(chat: any) {
    if (!Array.isArray(chat) || !chat.length) {
        return '';
    }

    const reversedChat = chat.slice().reverse();
    reversedChat.shift();
    for (let mes of reversedChat) {
        if (mes.extra && mes.extra.memory) {
            return mes.extra.memory;
        }
    }

    return '';
}

/**
 * Get the index of the latest memory summary from the chat.
 * @param {ChatMessage[]} chat Chat messages
 * @returns {number} Index of the latest memory summary or -1 if not found
 */
function getIndexOfLatestChatSummary(chat: any) {
    if (!Array.isArray(chat) || !chat.length) {
        return -1;
    }

    const reversedChat = chat.slice().reverse();
    reversedChat.shift();
    for (let mes of reversedChat) {
        if (mes.extra && mes.extra.memory) {
            return chat.indexOf(mes);
        }
    }

    return -1;
}

/**
 * Check if something is changed during the summarization process.
 * @param {{ groupId: any; chatId: any; characterId: any; }} context
 * @returns {boolean} True if the context has changed and the summary should be discarded
 */
function isContextChanged(context: any) {
    const newContext = getContext();
    if (newContext.groupId !== context.groupId
        || newContext.chatId !== context.chatId
        || (!newContext.groupId && (newContext.characterId !== context.characterId))) {
        console.log('Context changed, summary discarded');
        return true;
    }

    return false;
}

function onChatChanged() {
    const context = getContext();
    const latestMemory = getLatestMemoryFromChat(context.chat);
    setMemoryContext(latestMemory, false);
}

async function onChatEvent() {
    // Module not enabled
    // @ts-expect-error TS(2339): Property 'source' does not exist on type '{}'.
    if (extension_settings.memory.source === summary_sources.extras && !modules.includes('summarize')) {
        return;
    }

    // WebLLM is not supported
    // @ts-expect-error TS(2339): Property 'source' does not exist on type '{}'.
    if (extension_settings.memory.source === summary_sources.webllm && !isWebLlmSupported()) {
        return;
    }

    // Streaming in-progress
    if (streamingProcessor && !streamingProcessor.isFinished) {
        return;
    }

    // Currently summarizing or frozen state - skip
    // @ts-expect-error TS(2339): Property 'memoryFrozen' does not exist on type '{}... Remove this comment to see the full error message
    if (inApiCall || extension_settings.memory.memoryFrozen) {
        return;
    }

    const context = getContext();
    const chat = context.chat;
    // Chat can't be empty.
    if (chat.length === 0) return;

    const lastMessage = chat[chat.length - 1];

    // No new messages - do nothing
    // @ts-expect-error TS(2532): Object is possibly 'undefined'.
    if ((lastMessageId === chat.length && getStringHash(lastMessage.mes) === lastMessageHash)) {
        return;
    }

    // Messages has been deleted - rewrite the context with the latest available memory
    if (chat.length < lastMessageId) {
        const latestMemory = getLatestMemoryFromChat(chat);
        setMemoryContext(latestMemory, false);
    }

    // Message has been edited / regenerated - delete the saved memory
    if (chat.length
        // @ts-expect-error TS(2532): Object is possibly 'undefined'.
        && lastMessage.extra
        // @ts-expect-error TS(2532): Object is possibly 'undefined'.
        && lastMessage.extra.memory
        && lastMessageId === chat.length
        // @ts-expect-error TS(2532): Object is possibly 'undefined'.
        && getStringHash(lastMessage.mes) !== lastMessageHash) {
        // @ts-expect-error TS(2532): Object is possibly 'undefined'.
        delete lastMessage.extra.memory;
    }

    summarizeChat(context)
        .catch(console.error)
        .finally(() => {
            lastMessageId = context.chat?.length ?? null;
            // @ts-expect-error TS(2532): Object is possibly 'undefined'.
            lastMessageHash = getStringHash((context.chat.length && context.chat[context.chat.length - 1].mes) ?? '');
        });
}

/**
 * Forces a summary generation for the current chat.
 * @param {boolean} quiet If an informational toast should be displayed
 * @returns {Promise<string>} Summarized text
 */
async function forceSummarizeChat(quiet: any) {
    // @ts-expect-error TS(2339): Property 'source' does not exist on type '{}'.
    if (extension_settings.memory.source === summary_sources.extras) {
        notyf.warning('Force summarization is not supported for Extras API');
        return;
    }

    const context = getContext();
    // @ts-expect-error TS(2339): Property 'SkipWIAN' does not exist on type '{}'.
    const skipWIAN = extension_settings.memory.SkipWIAN;

    // @ts-expect-error TS(2304): Cannot find name 'jQuery'.
    const toast = quiet ? jQuery() : notyf.info('Summarizing chat...', 'Please wait', { timeOut: 0, extendedTimeOut: 0 });
    // @ts-expect-error TS(2339): Property 'source' does not exist on type '{}'.
    const value = extension_settings.memory.source === summary_sources.main
        ? await summarizeChatMain(context, true, skipWIAN)
        : await summarizeChatWebLLM(context, true);

    notyf.dismiss(toast);

    if (!value) {
        notyf.warning('Failed to summarize chat');
        return '';
    }

    return value;
}

/**
 * Callback for the summarize command.
 * @param {object} args Command arguments
 * @param {string} text Text to summarize
 */
async function summarizeCallback(args: any, text: any) {
    text = text.trim();

    // Summarize the current chat if no text provided
    if (!text) {
        const quiet = isTrueBoolean(args.quiet);
        return await forceSummarizeChat(quiet);
    }

    // @ts-expect-error TS(2339): Property 'source' does not exist on type '{}'.
    const source = args.source || extension_settings.memory.source;
    // @ts-expect-error TS(2339): Property 'prompt' does not exist on type '{}'.
    const prompt = substituteParams((args.prompt || extension_settings.memory.prompt), { dynamicMacros: { words: extension_settings.memory.promptWords } });

    try {
        switch (source) {
            case summary_sources.extras:
                return await callExtrasSummarizeAPI(text);
            case summary_sources.main:
                // @ts-expect-error TS(2339): Property 'overrideResponseLength' does not exist o... Remove this comment to see the full error message
                return removeReasoningFromString(await generateRaw({ prompt: text, systemPrompt: prompt, responseLength: extension_settings.memory.overrideResponseLength }));
            case summary_sources.webllm: {
                const messages = [{ role: 'system', content: prompt }, { role: 'user', content: text }].filter(m => m.content);
                // @ts-expect-error TS(2339): Property 'overrideResponseLength' does not exist o... Remove this comment to see the full error message
                const params = extension_settings.memory.overrideResponseLength > 0 ? { max_tokens: extension_settings.memory.overrideResponseLength } : {};
                return await generateWebLlmChatPrompt(messages, params);
            }
            default:
                notyf.warning('Invalid summarization source specified');
                return '';
        }
    } catch (error) {
        notyf.error(String(error), 'Failed to summarize text');
        console.log(error);
        return '';
    }
}

async function summarizeChat(context: any) {
    // @ts-expect-error TS(2339): Property 'SkipWIAN' does not exist on type '{}'.
    const skipWIAN = extension_settings.memory.SkipWIAN;
    // @ts-expect-error TS(2339): Property 'source' does not exist on type '{}'.
    switch (extension_settings.memory.source) {
        case summary_sources.extras:
            await summarizeChatExtras(context);
            break;
        case summary_sources.main:
            await summarizeChatMain(context, false, skipWIAN);
            break;
        case summary_sources.webllm:
            await summarizeChatWebLLM(context, false);
            break;
        default:
            break;
    }
}

/**
 * Check if the chat should be summarized based on the current conditions.
 * Return summary prompt if it should be summarized.
 * @param {any} context ST context
 * @param {boolean} force Summarize the chat regardless of the conditions
 * @returns {Promise<string>} Summary prompt or empty string
 */
async function getSummaryPromptForNow(context: any, force: any) {
    // @ts-expect-error TS(2339): Property 'promptInterval' does not exist on type '... Remove this comment to see the full error message
    if (extension_settings.memory.promptInterval === 0 && !force) {
        console.debug('Prompt interval is set to 0, skipping summarization');
        return '';
    }

    try {
        // Wait for group to finish generating
        if (selected_group) {
            await waitUntilCondition(() => is_group_generating === false, 1000, 10);
        }
        // Wait for the send button to be released
        await waitUntilCondition(() => is_send_press === false, 30000, 100);
    } catch {
        console.debug('Timeout waiting for is_send_press');
        return '';
    }

    if (!context.chat.length) {
        console.debug('No messages in chat to summarize');
        return '';
    }

    // @ts-expect-error TS(2339): Property 'promptInterval' does not exist on type '... Remove this comment to see the full error message
    if (context.chat.length < extension_settings.memory.promptInterval && !force) {
        // @ts-expect-error TS(2339): Property 'promptInterval' does not exist on type '... Remove this comment to see the full error message
        console.debug(`Not enough messages in chat to summarize (chat: ${context.chat.length}, interval: ${extension_settings.memory.promptInterval})`);
        return '';
    }

    let messagesSinceLastSummary = 0;
    let wordsSinceLastSummary = 0;
    let conditionSatisfied = false;
    for (let i = context.chat.length - 1; i >= 0; i--) {
        if (context.chat[i].extra && context.chat[i].extra.memory) {
            break;
        }
        messagesSinceLastSummary++;
        wordsSinceLastSummary += extractAllWords(context.chat[i].mes).length;
    }

    // @ts-expect-error TS(2339): Property 'promptInterval' does not exist on type '... Remove this comment to see the full error message
    if (messagesSinceLastSummary >= extension_settings.memory.promptInterval) {
        conditionSatisfied = true;
    }

    // @ts-expect-error TS(2339): Property 'promptForceWords' does not exist on type... Remove this comment to see the full error message
    if (extension_settings.memory.promptForceWords && wordsSinceLastSummary >= extension_settings.memory.promptForceWords) {
        conditionSatisfied = true;
    }

    if (!conditionSatisfied && !force) {
        // @ts-expect-error TS(2339): Property 'promptInterval' does not exist on type '... Remove this comment to see the full error message
        console.debug(`Summary conditions not satisfied (messages: ${messagesSinceLastSummary}, interval: ${extension_settings.memory.promptInterval}, words: ${wordsSinceLastSummary}, force words: ${extension_settings.memory.promptForceWords})`);
        return '';
    }

    console.log('Summarizing chat, messages since last summary: ' + messagesSinceLastSummary, 'words since last summary: ' + wordsSinceLastSummary);
    // @ts-expect-error TS(2339): Property 'prompt' does not exist on type '{}'.
    const prompt = substituteParams(extension_settings.memory.prompt, { dynamicMacros: { words: extension_settings.memory.promptWords } });

    if (!prompt) {
        console.debug('Summarization prompt is empty. Skipping summarization.');
        return '';
    }

    return prompt;
}

async function summarizeChatWebLLM(context: any, force: any) {
    if (!isWebLlmSupported()) {
        return;
    }

    const prompt = await getSummaryPromptForNow(context, force);

    if (!prompt) {
        return;
    }

    const { rawPrompt, lastUsedIndex } = await getRawSummaryPrompt(context, prompt);

    if (lastUsedIndex === null || lastUsedIndex === -1) {
        if (force) {
            notyf.info('To try again, remove the latest summary.', 'No messages found to summarize');
        }

        return null;
    }

    const messages = [
        { role: 'system', content: prompt },
        { role: 'user', content: rawPrompt },
    ];

    const params = {};

    // @ts-expect-error TS(2339): Property 'overrideResponseLength' does not exist o... Remove this comment to see the full error message
    if (extension_settings.memory.overrideResponseLength > 0) {
        // @ts-expect-error TS(2339): Property 'max_tokens' does not exist on type '{}'.
        params.max_tokens = extension_settings.memory.overrideResponseLength;
    }

    try {
        inApiCall = true;
        const summary = await generateWebLlmChatPrompt(messages, params);

        if (!summary) {
            console.warn('Empty summary received');
            return;
        }

        // something changed during summarization request
        if (isContextChanged(context)) {
            return;
        }

        setMemoryContext(summary, true, lastUsedIndex);
        return summary;
    } finally {
        inApiCall = false;
    }
}

async function summarizeChatMain(context: any, force: any, skipWIAN: any) {
    const prompt = await getSummaryPromptForNow(context, force);

    if (!prompt) {
        return;
    }

    console.log('sending summary prompt');
    let summary = '';
    let index = null;

    // @ts-expect-error TS(2339): Property 'prompt_builder' does not exist on type '... Remove this comment to see the full error message
    if (prompt_builders.DEFAULT === extension_settings.memory.prompt_builder) {
        try {
            inApiCall = true;
            /** @type {import('../../../script.js').GenerateQuietPromptParams} */
            const params = {
                quietPrompt: prompt,
                skipWIAN: skipWIAN,
                // @ts-expect-error TS(2339): Property 'overrideResponseLength' does not exist o... Remove this comment to see the full error message
                responseLength: extension_settings.memory.overrideResponseLength,
            };
            summary = await generateQuietPrompt(params);
        } finally {
            inApiCall = false;
        }
    }

    // @ts-expect-error TS(2339): Property 'prompt_builder' does not exist on type '... Remove this comment to see the full error message
    if ([prompt_builders.RAW_BLOCKING, prompt_builders.RAW_NON_BLOCKING].includes(extension_settings.memory.prompt_builder)) {
        // @ts-expect-error TS(2339): Property 'prompt_builder' does not exist on type '... Remove this comment to see the full error message
        const lock = extension_settings.memory.prompt_builder === prompt_builders.RAW_BLOCKING;
        try {
            inApiCall = true;
            if (lock) {
                deactivateSendButtons();
            }

            const { rawPrompt, lastUsedIndex } = await getRawSummaryPrompt(context, prompt);

            if (lastUsedIndex === null || lastUsedIndex === -1) {
                if (force) {
                    notyf.info('To try again, remove the latest summary.', 'No messages found to summarize');
                }

                return null;
            }

            /** @type {import('../../../script.js').GenerateRawParams} */
            const params = {
                prompt: rawPrompt,
                systemPrompt: prompt,
                // @ts-expect-error TS(2339): Property 'overrideResponseLength' does not exist o... Remove this comment to see the full error message
                responseLength: extension_settings.memory.overrideResponseLength,
            };
            const rawSummary = await generateRaw(params);
            summary = removeReasoningFromString(rawSummary);
            index = lastUsedIndex;
        } finally {
            inApiCall = false;
            if (lock) {
                activateSendButtons();
            }
        }
    }

    if (!summary) {
        console.warn('Empty summary received');
        return;
    }

    if (isContextChanged(context)) {
        return;
    }

    setMemoryContext(summary, true, index);
    return summary;
}

/**
 * Get the raw summarization prompt from the chat context.
 * @param {object} context ST context
 * @param {string} prompt Summarization system prompt
 * @returns {Promise<{rawPrompt: string, lastUsedIndex: number}>} Raw summarization prompt
 */
async function getRawSummaryPrompt(context: any, prompt: any) {
    /**
     * Get the memory string from the chat buffer.
     * @param {boolean} includeSystem Include prompt into the memory string
     * @returns {string} Memory string
     */
    function getMemoryString(includeSystem: any) {
        const delimiter = '\n\n';
        const stringBuilder = [];
        const bufferString = chatBuffer.slice().join(delimiter);

        if (includeSystem) {
            stringBuilder.push(prompt);
        }

        if (latestSummary) {
            stringBuilder.push(latestSummary);
        }

        stringBuilder.push(bufferString);

        return stringBuilder.join(delimiter).trim();
    }

    const chat = context.chat.slice();
    const latestSummary = getLatestMemoryFromChat(chat);
    const latestSummaryIndex = getIndexOfLatestChatSummary(chat);
    chat.pop(); // We always exclude the last message from the buffer
    const chatBuffer: any = [];
    const PADDING = 64;
    const PROMPT_SIZE = await getSourceContextSize();
    let latestUsedMessage = null;

    for (let index = latestSummaryIndex + 1; index < chat.length; index++) {
        const message = chat[index];

        if (!message) {
            break;
        }

        if (message.is_system || !message.mes) {
            continue;
        }

        const entry = `${message.name}:\n${message.mes}`;
        chatBuffer.push(entry);

        const tokens = await countSourceTokens(getMemoryString(true), PADDING);

        if (tokens > PROMPT_SIZE) {
            chatBuffer.pop();
            break;
        }

        latestUsedMessage = message;

        // @ts-expect-error TS(2339): Property 'maxMessagesPerRequest' does not exist on... Remove this comment to see the full error message
        if (extension_settings.memory.maxMessagesPerRequest > 0 && chatBuffer.length >= extension_settings.memory.maxMessagesPerRequest) {
            break;
        }
    }

    const lastUsedIndex = context.chat.indexOf(latestUsedMessage);
    const rawPrompt = getMemoryString(false);
    return { rawPrompt, lastUsedIndex };
}

async function summarizeChatExtras(context: any) {
    function getMemoryString() {
        return (longMemory + '\n\n' + memoryBuffer.slice().reverse().join('\n\n')).trim();
    }

    const chat = context.chat;
    const longMemory = getLatestMemoryFromChat(chat);
    const reversedChat = chat.slice().reverse();
    reversedChat.shift();
    const memoryBuffer: any = [];
    const CONTEXT_SIZE = await getSourceContextSize();

    for (const message of reversedChat) {
        // we reached the point of latest memory
        if (longMemory && message.extra && message.extra.memory == longMemory) {
            break;
        }

        // don't care about system
        if (message.is_system) {
            continue;
        }

        // determine the sender's name
        const entry = `${message.name}:\n${message.mes}`;
        memoryBuffer.push(entry);

        // check if token limit was reached
        const tokens = await countSourceTokens(getMemoryString());
        if (tokens >= CONTEXT_SIZE) {
            break;
        }
    }

    const resultingString = getMemoryString();
    const resultingTokens = await countSourceTokens(resultingString);

    if (!resultingString || resultingTokens < CONTEXT_SIZE) {
        console.debug('Not enough context to summarize');
        return;
    }

    // perform the summarization API call
    try {
        inApiCall = true;
        const summary = await callExtrasSummarizeAPI(resultingString);

        if (!summary) {
            console.warn('Empty summary received');
            return;
        }

        if (isContextChanged(context)) {
            return;
        }

        setMemoryContext(summary, true);
    } catch (error) {
        console.log(error);
    } finally {
        inApiCall = false;
    }
}

/**
 * Call the Extras API to summarize the provided text.
 * @param {string} text Text to summarize
 * @returns {Promise<string>} Summarized text
 */
async function callExtrasSummarizeAPI(text: any) {
    if (!modules.includes('summarize')) {
        throw new Error('Summarize module is not enabled in Extras API');
    }

    const url = new URL(getApiUrl() as string);
    url.pathname = '/api/summarize';

    const apiResult = await doExtrasFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Bypass-Tunnel-Reminder': 'bypass',
        },
        body: JSON.stringify({
            text: text,
            params: {},
        }),
    });

    if (apiResult.ok) {
        const data = await apiResult.json();
        const summary = data.summary;
        return summary;
    }

    throw new Error('Extras API call failed');
}

function onMemoryRestoreClick() {
    const context = getContext();
    const content = $('#memory_contents').val();
    const reversedChat = context.chat.slice().reverse();
    reversedChat.shift();

    for (let mes of reversedChat) {
        if ((mes as any).extra && (mes as any).extra.memory == content) {
            delete (mes as any).extra.memory;
            break;
        }
    }

    const newContent = getLatestMemoryFromChat(context.chat);
    setMemoryContext(newContent, false);
}

function onMemoryContentInput(this: any) {
    const value = this.value;
    setMemoryContext(value, true);
}

function onMemoryPromptBuilderInput(e: any) {
    const value = Number(e.target.value);
    // @ts-expect-error TS(2339): Property 'prompt_builder' does not exist on type '... Remove this comment to see the full error message
    extension_settings.memory.prompt_builder = value;
    saveSettingsDebounced();
}

function reinsertMemory() {
    // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
    const existingValue = String(document.getElementById('memory_contents')?.value || '');
    setMemoryContext(existingValue, false);
}

/**
 * Set the summary value to the context and save it to the chat message extra.
 * @param {string} value Value of a summary
 * @param {boolean} saveToMessage Should the summary be saved to the chat message extra
 * @param {number|null} index Index of the chat message to save the summary to. If null, the pre-last message is used.
 */
function setMemoryContext(value: any, saveToMessage: any, index = null) {
    // @ts-expect-error TS(2339): Property 'position' does not exist on type '{}'.
    setExtensionPrompt(MODULE_NAME, formatMemoryValue(value), extension_settings.memory.position, extension_settings.memory.depth, extension_settings.memory.scan, extension_settings.memory.role);
    $('#memory_contents').val(value);

    const summaryLog = value
        // @ts-expect-error TS(2339): Property 'position' does not exist on type '{}'.
        ? `Summary set to: ${value}. Position: ${extension_settings.memory.position}. Depth: ${extension_settings.memory.depth}. Role: ${extension_settings.memory.role}`
        : 'Summary has no content';
    console.debug(summaryLog);

    const context = getContext();
    if (saveToMessage && context.chat.length) {
        const idx = index ?? context.chat.length - 2;
        const mes = context.chat[idx < 0 ? 0 : idx];

        // @ts-expect-error TS(2532): Object is possibly 'undefined'.
        if (!mes.extra) {
            // @ts-expect-error TS(2532): Object is possibly 'undefined'.
            mes.extra = {};
        }

        // @ts-expect-error TS(2532): Object is possibly 'undefined'.
        mes.extra.memory = value;
        saveChatDebounced();
    }
}

function doPopout(e: any) {
    const target = e.target;
    //repurposes the zoomed avatar template to server as a floating div
    if (!document.getElementById('summaryExtensionPopout')) {
        console.debug('did not see popout yet, creating');
        const originalElement = target.closest('.inline-drawer');
        const originalHTMLClone = originalElement?.querySelector('.inline-drawer-content')?.innerHTML ?? '';
        const templateElement = document.getElementById('zoomed_avatar_template');
        let newElement: any = null;
        if (templateElement instanceof HTMLTemplateElement) {
            newElement = templateElement.content.firstElementChild?.cloneNode(true);
        } else if (templateElement) {
            newElement = templateElement.firstElementChild?.cloneNode(true);
        }
        if (!(newElement instanceof HTMLElement)) {
            console.error('Zoomed avatar template is empty');
            return;
        }
        const controlBarHtml = `<div class="panelControlBar flex-container">
        <div id="summaryExtensionPopoutheader" class="fa-solid fa-grip drag-grabber hoverglow"></div>
        <div id="summaryExtensionPopoutClose" class="fa-solid fa-circle-xmark hoverglow dragClose"></div>
    </div>`;
        newElement.setAttribute('id', 'summaryExtensionPopout');
        newElement.style.opacity = '0';
        newElement.classList.remove('zoomed_avatar');
        newElement.classList.add('draggable');
        newElement.innerHTML = '';
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        const prevSummaryBoxContents = document.getElementById('memory_contents')?.value?.toString() ?? '';
        if (originalElement) {
            const contentDiv = originalElement.querySelector('.inline-drawer-content');
            if (contentDiv) {
                contentDiv.innerHTML = '<div class="flex-container alignitemscenter justifyCenter wide100p"><small>Currently popped out</small></div>';
            }
        }
        newElement.insertAdjacentHTML('beforeend', controlBarHtml);
        newElement.insertAdjacentHTML('beforeend', originalHTMLClone);
        document.getElementById('movingDivs')?.appendChild(newElement);
        newElement.style.transition = `opacity ${animation_duration}ms ease`;
        newElement.offsetHeight;
        newElement.style.opacity = '1';
        const drawerContents = document.getElementById('summaryExtensionDrawerContents');
        if (drawerContents) drawerContents.classList.add('scrollableInnerFull');
        setMemoryContext(prevSummaryBoxContents, false);
        setupListeners();
        loadSettings();
        loadMovingUIState();

        dragElement(newElement);

        //setup listener for close button to restore extensions menu
        const closeBtn = document.getElementById('summaryExtensionPopoutClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', function () {
                const drawerContents = document.getElementById('summaryExtensionDrawerContents');
                if (drawerContents) drawerContents.classList.remove('scrollableInnerFull');
                if (animation_duration > 0) {
                    newElement.style.transition = `opacity ${animation_duration}ms ease`;
                    newElement.style.opacity = '0';
                    setTimeout(() => {
                        if (originalElement) {
                            const contentDiv = originalElement.querySelector('.inline-drawer-content');
                            if (contentDiv) {
                                contentDiv.innerHTML = '';
                                contentDiv.append(drawerContents);
                            }
                        }
                        newElement.remove();
                    }, animation_duration);
                } else {
                    if (originalElement) {
                        const contentDiv = originalElement.querySelector('.inline-drawer-content');
                        if (contentDiv) {
                            contentDiv.innerHTML = '';
                            contentDiv.append(drawerContents);
                        }
                    }
                    newElement.remove();
                }
            });
            loadSettings();
        }
    } else {
        console.debug('saw existing popout, removing');
        $('#summaryExtensionPopout').fadeOut(animation_duration, () => {
            const closeBtn = document.getElementById('summaryExtensionPopoutClose');
            if (closeBtn) closeBtn.click();
        });
    }
}

function setupListeners() {
    //setup shared listeners for popout and regular ext menu
    document.getElementById('memory_restore')?.addEventListener('click', onMemoryRestoreClick);
    document.getElementById('memory_contents')?.addEventListener('input', onMemoryContentInput);
    document.getElementById('memory_frozen')?.addEventListener('input', onMemoryFrozenInput);
    document.getElementById('memory_skipWIAN')?.addEventListener('input', onMemorySkipWIANInput);
    document.getElementById('summary_source')?.addEventListener('change', onSummarySourceChange);
    document.getElementById('memory_prompt_words')?.addEventListener('input', onMemoryPromptWordsInput);
    document.getElementById('memory_prompt_interval')?.addEventListener('input', onMemoryPromptIntervalInput);
    document.getElementById('memory_prompt')?.addEventListener('input', onMemoryPromptInput);
    document.getElementById('memory_force_summarize')?.addEventListener('click', () => forceSummarizeChat(false));
    document.getElementById('memory_template')?.addEventListener('input', onMemoryTemplateInput);
    document.getElementById('memory_depth')?.addEventListener('input', onMemoryDepthInput);
    document.getElementById('memory_role')?.addEventListener('input', onMemoryRoleInput);
    document.querySelectorAll('input[name="memory_position"]').forEach(el => el.addEventListener('change', onMemoryPositionChange));
    document.getElementById('memory_prompt_words_force')?.addEventListener('input', onMemoryPromptWordsForceInput);
    document.getElementById('memory_prompt_builder_default')?.addEventListener('input', onMemoryPromptBuilderInput);
    document.getElementById('memory_prompt_builder_raw_blocking')?.addEventListener('input', onMemoryPromptBuilderInput);
    document.getElementById('memory_prompt_builder_raw_non_blocking')?.addEventListener('input', onMemoryPromptBuilderInput);
    document.getElementById('memory_prompt_restore')?.addEventListener('click', onMemoryPromptRestoreClick);
    document.getElementById('memory_prompt_interval_auto')?.addEventListener('click', onPromptIntervalAutoClick);
    document.getElementById('memory_prompt_words_auto')?.addEventListener('click', onPromptForceWordsAutoClick);
    document.getElementById('memory_override_response_length')?.addEventListener('input', onOverrideResponseLengthInput);
    document.getElementById('memory_max_messages_per_request')?.addEventListener('input', onMaxMessagesPerRequestInput);
    document.getElementById('memory_include_wi_scan')?.addEventListener('input', onMemoryIncludeWIScanInput);
    document.getElementById('summarySettingsBlockToggle')?.addEventListener('click', function () {
        const block = document.getElementById('summarySettingsBlock');
        if (block) {
            $('#summarySettingsBlock').slideToggle(200, 'swing');
        }
    });
}

export async function init() {
    async function addExtensionControls() {
        const settingsHtml = await renderExtensionTemplateAsync('memory', 'settings', { defaultSettings });
        $('#summarize_container').append(settingsHtml);
        setupListeners();
        document.getElementById('summaryExtensionPopoutButton')?.addEventListener('click', function (e) {
            doPopout(e);
            e.stopPropagation();
        });
    }

    await addExtensionControls();
    loadSettings();
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
    eventSource.makeLast(event_types.CHARACTER_MESSAGE_RENDERED, onChatEvent);
    for (const event of [event_types.MESSAGE_DELETED, event_types.MESSAGE_UPDATED, event_types.MESSAGE_SWIPED]) {
        eventSource.on(event, onChatEvent);
    }
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'summarize',
        callback: summarizeCallback,
        namedArgumentList: [
            // @ts-expect-error TS(2345): Argument of type '""' is not assignable to paramet... Remove this comment to see the full error message
            new SlashCommandNamedArgument('source', 'API to use for summarization', [ARGUMENT_TYPE.STRING], false, false, '', Object.values(summary_sources)),
            SlashCommandNamedArgument.fromProps({
                name: 'prompt',
                description: 'prompt to use for summarization',
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: '',
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'quiet',
                description: 'suppress the toast message when summarizing the chat',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
                enumList: commonEnumProviders.boolean('trueFalse')(),
            }),
        ],
        unnamedArgumentList: [
            // @ts-expect-error TS(2345): Argument of type '""' is not assignable to paramet... Remove this comment to see the full error message
            new SlashCommandArgument('text to summarize', [ARGUMENT_TYPE.STRING], false, false, ''),
        ],
        helpString: 'Summarizes the given text. If no text is provided, the current chat will be summarized. Can specify the source and the prompt to use.',
        returns: ARGUMENT_TYPE.STRING,
    }));

    const summaryMacroHandler = () => {
        // Checking content of the UI summary box first
        const uiSummary = $('#memory_contents').val().toString();
        if (uiSummary.trim().length > 0) {
            return uiSummary;
        }
        // Fallback to scanning the chat for the latest summary if the UI summary box is empty
        return getLatestMemoryFromChat(getContext().chat);
    };
    macros.register('summary', {
        category: MacroCategory.CHAT,
        description: 'Returns the latest memory/summary from the current chat.',
        handler: () => summaryMacroHandler(),
    });
}
