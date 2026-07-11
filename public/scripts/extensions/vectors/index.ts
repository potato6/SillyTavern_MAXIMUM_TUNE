import {
    eventSource,
    event_types,
    extension_prompt_types,
    extension_prompt_roles,
    getCurrentChatId,
    getRequestHeaders,
    is_send_press,
    saveSettingsDebounced,
    setExtensionPrompt,
    substituteParams,
    generateRaw,
    substituteParamsExtended,
} from '../../../script.js';
// @ts-expect-error TS(2451): Cannot redeclare block-scoped variable '$'.
declare const $: any; declare const toastr: any;
import {
    ModuleWorkerWrapper,
    extension_settings,
    getContext,
    modules,
    renderExtensionTemplateAsync,
    doExtrasFetch, getApiUrl,
    openThirdPartyExtensionMenu,
} from '../../extensions.js';
import { collapseNewlines, registerDebugFunction } from '../../power-user.js';
import { SECRET_KEYS, secret_state } from '../../secrets.js';
import { getDataBankAttachments, getDataBankAttachmentsForSource, getFileAttachment } from '../../chats.js';
import { debounce, getStringHash as calculateHash, waitUntilCondition, onlyUnique, splitRecursive, trimToStartSentence, trimToEndSentence, escapeHtml, isTrueBoolean } from '../../utils.js';
import { debounce_timeout } from '../../constants.js';
import { getSortedEntries } from '../../world-info.js';
import { textgen_types, textgenerationwebui_settings } from '../../textgen-settings.js';
import { SlashCommandParser } from '../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../slash-commands/SlashCommandArgument.js';
import { SlashCommandEnumValue, enumTypes } from '../../slash-commands/SlashCommandEnumValue.js';
import { commonEnumProviders } from '../../slash-commands/SlashCommandCommonEnumsProvider.js';
import { slashCommandReturnHelper } from '../../slash-commands/SlashCommandReturnHelper.js';
import { generateWebLlmChatPrompt, isWebLlmSupported } from '../shared.js';
import { WebLlmVectorProvider } from './webllm.js';
import { removeReasoningFromString } from '../../reasoning.js';
import { oai_settings } from '../../openai.js';

/**
 * @typedef {object} HashedMessage
 * @property {string} text - The hashed message text
 * @property {number} hash - The hash used as the vector key
 * @property {number} index - The index of the message in the chat
 * @property {boolean} [summaryFailed] - Whether summarization failed for this message (used internally to skip messages that fail summarization)
 */

const MODULE_NAME = 'vectors';

export const EXTENSION_PROMPT_TAG = '3_vectors';
export const EXTENSION_PROMPT_TAG_DB = '4_vectors_data_bank';

// Force solo chunks for sources that don't support batching.
const getBatchSize = () => ['transformers', 'ollama'].includes(settings.source) ? 1 : 5;

const settings = {
    // For both
    source: 'transformers',
    alt_endpoint_url: '',
    use_alt_endpoint: false,
    include_wi: false,
    togetherai_model: 'togethercomputer/m2-bert-80M-32k-retrieval',
    openai_model: 'text-embedding-ada-002',
    electronhub_model: 'text-embedding-3-small',
    openrouter_model: 'openai/text-embedding-3-large',
    cohere_model: 'embed-english-v3.0',
    ollama_model: 'mxbai-embed-large',
    ollama_keep: false,
    vllm_model: '',
    webllm_model: '',
    google_model: 'text-embedding-005',
    chutes_model: 'chutes-qwen-qwen3-embedding-8b',
    nanogpt_model: 'text-embedding-3-small',
    siliconflow_model: 'Qwen/Qwen3-Embedding-0.6B',
    summarize: false,
    summarize_sent: false,
    summary_source: 'main',
    summary_prompt: 'Ignore previous instructions. Summarize the most important parts of the message. Limit yourself to 250 words or less. Your response should include nothing but the summary.',
    summary_retries: 2,
    summary_threshold: 200,
    force_chunk_delimiter: '',

    // For chats
    enabled_chats: false,
    keep_hidden: false,
    template: 'Past events:\n{{text}}',
    depth: 2,
    position: extension_prompt_types.IN_PROMPT,
    protect: 5,
    insert: 3,
    query: 2,
    message_chunk_size: 400,
    score_threshold: 0.25,

    // For files
    enabled_files: false,
    translate_files: false,
    size_threshold: 10,
    chunk_size: 5000,
    chunk_count: 2,
    overlap_percent: 0,
    only_custom_boundary: false,

    // For Data Bank
    size_threshold_db: 5,
    chunk_size_db: 2500,
    chunk_count_db: 5,
    overlap_percent_db: 0,
    file_template_db: 'Related information:\n{{text}}',
    file_position_db: extension_prompt_types.IN_PROMPT,
    file_depth_db: 4,
    file_depth_role_db: extension_prompt_roles.SYSTEM,

    // For World Info
    enabled_world_info: false,
    enabled_for_all: false,
    max_entries: 5,
};
// @ts-expect-error TS(2451): Cannot redeclare block-scoped variable '$'.
declare const $: any; declare const toastr: any;

const moduleWorker = new ModuleWorkerWrapper(synchronizeChat);
const webllmProvider = new WebLlmVectorProvider();
/**
 * Cache for storing summaries of messages by their hash.
 * @type {Map<number, string>}
 */
const cachedSummaries = new Map();
/**
 * Hashes skipped this Vectorize All session (summary or embed failure). Cleared on next Vectorize All click.
 * @type {Set<number>}
 */
const skippedHashes = new Set();
/**
 * Error causes treated as fatal — abort Vectorize All rather than skip.
 * @type {Set<string>}
 */
const FATAL_CAUSES = new Set(['account_id_missing', 'api_key_missing', 'api_url_missing', 'api_model_missing', 'extras_module_missing', 'webllm_not_supported', 'summary_endpoint_invalid']);
const vectorApiRequiresUrl = ['llamacpp', 'vllm', 'ollama', 'koboldcpp'];

/**
 * @typedef {object} RemoteEmbeddingEndpointConfig
 * @property {string} url - The API endpoint URL
 * @property {string} settingsKey - The key in settings for the selected model
 * @property {string} selectId - The ID of the select element (without #)
 * @property {string} [valueProperty='id'] - Property name for the option value
 * @property {string} [textProperty] - Property name for the option text. Falls back to valueProperty
 * @property {() => object} [getBody] - Function returning the request body
 * @property {(models: any[]) => any[]} [filter] - Optional post-fetch filter for models
 */

/** @type {Record<string, RemoteEmbeddingEndpointConfig>} */
const remoteEmbeddingEndpoints = {
    chutes: {
        url: '/api/openai/chutes/models/embedding',
        settingsKey: 'chutes_model',
        selectId: 'vectors_chutes_model',
        valueProperty: 'slug',
        textProperty: 'name',
    },
    nanogpt: {
        url: '/api/openai/nanogpt/models/embedding',
        settingsKey: 'nanogpt_model',
        selectId: 'vectors_nanogpt_model',
        textProperty: 'name',
    },
    electronhub: {
        url: '/api/openai/electronhub/models',
        settingsKey: 'electronhub_model',
        selectId: 'vectors_electronhub_model',
        textProperty: 'name',
        filter: (models: any) => models.filter((m: any) => Array.isArray(m?.endpoints) && m.endpoints.includes('/v1/embeddings')),
    },
    openrouter: {
        url: '/api/openrouter/models/embedding',
        settingsKey: 'openrouter_model',
        selectId: 'vectors_openrouter_model',
        textProperty: 'name',
    },
    siliconflow: {
        url: '/api/openai/siliconflow/models/embedding',
        settingsKey: 'siliconflow_model',
        selectId: 'vectors_siliconflow_model',
        getBody: () => ({ siliconflow_endpoint: oai_settings.siliconflow_endpoint }),
    },
    workers_ai: {
        url: '/api/openai/workers-ai/models/embedding',
        settingsKey: 'workers_ai_model',
        selectId: 'vectors_workers_ai_model',
        getBody: () => ({ workers_ai_account_id: oai_settings.workers_ai_account_id }),
    },
};

/**
 * Gets the Collection ID for a file embedded in the chat.
 * @param {string} fileUrl URL of the file
 * @returns {string} Collection ID
 */
function getFileCollectionId(fileUrl: any) {
    return `file_${getStringHash(fileUrl)}`;
}

async function onVectorizeAllClick() {
    try {
        if (!settings.enabled_chats) {
            return;
        }

        const chatId = getCurrentChatId();

        if (!chatId) {
            notyf.info('No chat selected', 'Vectorization aborted');
            return;
        }

        // Clear all cached summaries to ensure that new ones are created
        // upon request of a full vectorise
        cachedSummaries.clear();
        skippedHashes.clear();

        const batchSize = getBatchSize();
        const elapsedLog = [];
        let finished = false;
        let initialPending = null; // total items pending at the start of this run — set on first sync return
        $('#vectorize_progress').show();
        $('#vectorize_progress_percent').text('0');
        $('#vectorize_progress_eta').text('...');

        while (!finished) {
            if (is_send_press) {
                notyf.info('Message generation is in progress.', 'Vectorization aborted');
                throw new Error('Message generation is in progress.');
            }

            const startTime = Date.now();
            const remaining = await synchronizeChat(batchSize);
            const elapsed = Date.now() - startTime;

            if (remaining === null) {
                // synchronizeChat already surfaced a toast; bail out of the loop.
                throw new Error('Vectorization aborted');
            }

            elapsedLog.push(elapsed);
            finished = remaining <= 0;

            if (initialPending === null) {
                initialPending = Math.max(0, remaining + batchSize);
            }
            const pending = Math.max(0, remaining);
            const processed = Math.max(0, initialPending - pending);
            const processedPercent = initialPending > 0
                ? Math.min(100, Math.round((processed / initialPending) * 100))
                : 100;
            const lastElapsed = elapsedLog.slice(-5); // last 5 elapsed times
            const averageElapsed = lastElapsed.reduce((a, b) => a + b, 0) / lastElapsed.length; // average time needed to process one item
            const pace = averageElapsed / batchSize; // time needed to process one item
            const remainingTime = Math.round(pace * pending / 1000);

            $('#vectorize_progress_percent').text(processedPercent);
            $('#vectorize_progress_eta').text(remainingTime);

            if (chatId !== getCurrentChatId()) {
                throw new Error('Chat changed');
            }
        }
        if (skippedHashes.size > 0) {
            notyf.warning(`${skippedHashes.size} message(s) skipped due to errors. Click Vectorize All again to retry.`, 'Vectorization partial');
        }
    } catch (error) {
        console.error('Vectors: Failed to vectorize all', error);
    } finally {
        $('#vectorize_progress').hide();
    }
}

let syncBlocked = false;

/**
 * Gets the chunk delimiters for splitting text.
 * @returns {string[]} Array of chunk delimiters
 */
function getChunkDelimiters() {
    const delimiters = ['\n\n', '\n', ' ', ''];

    if (settings.force_chunk_delimiter) {
        delimiters.unshift(settings.force_chunk_delimiter);
    }

    return delimiters;
}

/**
 * Splits messages into chunks before inserting them into the vector index.
 * @param {object[]} items Array of vector items
 * @returns {object[]} Array of vector items (possibly chunked)
 */
function splitByChunks(items: any) {
    if (settings.message_chunk_size <= 0) {
        return items;
    }

    const chunkedItems = [];

    for (const item of items) {
        const chunks = splitRecursive(item.text, settings.message_chunk_size, getChunkDelimiters());
        for (const chunk of chunks) {
            const chunkedItem = { ...item, text: chunk };
            chunkedItems.push(chunkedItem);
        }
    }

    return chunkedItems;
}

/**
 * Summarizes messages using the Extras API method.
 * @param {HashedMessage} element hashed message
 * @returns {Promise<boolean>} Sucess
 */
async function summarizeExtra(element: any) {
    try {
        const url = new URL(getApiUrl());
        url.pathname = '/api/summarize';

        const apiResult = await doExtrasFetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Bypass-Tunnel-Reminder': 'bypass',
            },
            body: JSON.stringify({
                text: element.text,
                params: {},
            }),
        });

        if (apiResult.ok) {
            const data = await apiResult.json();
            element.text = removeReasoningFromString(data.summary);
        }
    } catch (error) {
        console.log(error);
        return false;
    }

    return true;
}

/**
 * Summarizes messages using the main API method.
 * @param {HashedMessage} element hashed message
 * @returns {Promise<boolean>} Success
 */
async function summarizeMain(element: any) {
    element.text = removeReasoningFromString(await generateRaw({ prompt: element.text, systemPrompt: settings.summary_prompt }));
    return true;
}

/**
 * Summarizes messages using WebLLM.
 * @param {HashedMessage} element hashed message
 * @returns {Promise<boolean>} Success
 */
async function summarizeWebLLM(element: any) {
    if (!isWebLlmSupported()) {
        console.warn('Vectors: WebLLM is not supported');
        return false;
    }

    const messages = [{ role: 'system', content: settings.summary_prompt }, { role: 'user', content: element.text }];
    element.text = removeReasoningFromString(await generateWebLlmChatPrompt(messages));

    return true;
}

/**
 * Runs one summarization attempt for a single element via the chosen endpoint.
 * @param {HashedMessage} element
 * @param {string} endpoint
 * @returns {Promise<boolean>} Whether the attempt succeeded.
 */
async function summarizeOne(element: any, endpoint: any) {
    switch (endpoint) {
        case 'main':
            return await summarizeMain(element);
        case 'extras':
            return await summarizeExtra(element);
        case 'webllm':
            return await summarizeWebLLM(element);
        default:

            throw new Error(`Unsupported summary endpoint: ${endpoint}`, { cause: 'summary_endpoint_invalid' });
    }
}

/**
 * Summarizes messages using the chosen method. Every returned element has been
 * summarized (via live call or cache). Throws if any element fails after
 * `settings.summary_retries` attempts.
 * @param {HashedMessage[]} hashedMessages Array of hashed messages (mutated in place)
 * @param {string} endpoint Type of endpoint to use
 * @param {Object} [options] Options for summarization behavior
 * @param {boolean} [options.skipOnFailure=false] If true, tags failed elements with `summaryFailed = true` instead of throwing
 * @returns {Promise<HashedMessage[]>} Summarized messages
 */
async function summarize(hashedMessages: any, endpoint = 'main', { skipOnFailure = false } = {}) {
    const maxAttempts = Math.max(1, Number(settings.summary_retries) || 1);
    for (const element of hashedMessages) {
        const cachedSummary = cachedSummaries.get(element.hash);
        if (cachedSummary) {
            element.text = cachedSummary;
            continue;
        }

        let success = false;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                success = await summarizeOne(element, endpoint);
                if (success) break;
            } catch (error) {
                // @ts-expect-error TS(2571): Object is of type 'unknown'.
                if (FATAL_CAUSES.has(error?.cause)) throw error;
                console.warn(`Vectors: summary attempt ${attempt}/${maxAttempts} threw for hash ${element.hash}`, error);
            }
            console.warn(`Vectors: summary attempt ${attempt}/${maxAttempts} failed for hash ${element.hash}`);
        }
        if (!success) {
            if (skipOnFailure) {
                console.warn(`Vectors: summarization exhausted ${maxAttempts} attempt(s) for hash ${element.hash} — marking for skip`);
                element.summaryFailed = true;
                continue;
            }


            throw new Error(`Summarization failed after ${maxAttempts} attempt(s)`, { cause: 'summary_failed' });
        }
        cachedSummaries.set(element.hash, element.text);
    }
    return hashedMessages;
}

async function synchronizeChat(batchSize = 5) {
    if (!settings.enabled_chats) {
        return -1;
    }

    try {
        await waitUntilCondition(() => !syncBlocked && !is_send_press, 1000);
    } catch {
        console.log('Vectors: Synchronization blocked by another process');
        return -1;
    }

    try {
        syncBlocked = true;
        const context = getContext();
        const chatId = getCurrentChatId();

        if (!chatId || !Array.isArray(context.chat)) {
            console.debug('Vectors: No chat selected');
            return -1;
        }

        /** @type {HashedMessage[]} */
        // @ts-expect-error TS(2339): Property 'is_system' does not exist on type 'never... Remove this comment to see the full error message
        const hashedMessages = context.chat.filter(x => settings.keep_hidden || !x.is_system).map(x => ({ text: String(substituteParams(x.mes)), hash: getStringHash(substituteParams(x.mes)), index: context.chat.indexOf(x) }));
        const hashesInCollection = await getSavedHashes(chatId);

        const newVectorItems = hashedMessages
            .filter(x => !hashesInCollection.includes(x.hash))
            .filter(x => !skippedHashes.has(x.hash));
        const deletedHashes = hashesInCollection.filter((x: any) => !hashedMessages.some(y => y.hash === x));

        let batch = newVectorItems.slice(0, batchSize);

        if (settings.summarize) {
            const minLength = Math.max(0, Number(settings.summary_threshold) || 0);
            const toSummarize = minLength > 0 ? batch.filter(x => x.text.length >= minLength) : batch;
            if (toSummarize.length > 0) {
                await summarize(toSummarize, settings.summary_source, { skipOnFailure: true });
                // @ts-expect-error TS(2339): Property 'summaryFailed' does not exist on type '{... Remove this comment to see the full error message
                const failed = toSummarize.filter(x => x.summaryFailed);
                if (failed.length > 0) {
                    for (const item of failed) skippedHashes.add(item.hash);
                    // @ts-expect-error TS(2339): Property 'summaryFailed' does not exist on type '{... Remove this comment to see the full error message
                    batch = batch.filter(x => !x.summaryFailed);
                }
            }
        }

        if (batch.length > 0) {
            const chunkedBatch = splitByChunks(batch);

            console.log(`Vectors: Found ${newVectorItems.length} new items. Processing ${batch.length}...`);
            try {
                await insertVectorItems(chatId, chunkedBatch);
            } catch (insertError) {
                // @ts-expect-error TS(2571): Object is of type 'unknown'.
                if (FATAL_CAUSES.has(insertError?.cause)) {
                    throw insertError;
                }
                console.warn('Vectors: insert failed for batch — marking for skip', insertError);
                for (const item of batch) skippedHashes.add(item.hash);
            }
        }

        if (deletedHashes.length > 0) {
            await deleteVectorItems(chatId, deletedHashes);
            console.log(`Vectors: Deleted ${deletedHashes.length} old hashes`);
        }

        return newVectorItems.length - batchSize;
    } catch (error) {
        /**
         * Gets the error message for a given cause
         * @param {string} cause Error cause key
         * @returns {string} Error message
         */
        function getErrorMessage(cause: any) {
            switch (cause) {
                case 'api_key_missing':
                    return 'API key missing. Save it in the "API Connections" panel.';
                case 'api_url_missing':
                    return 'API URL missing. Save it in the "API Connections" panel.';
                case 'api_model_missing':
                    return 'Vectorization Source Model is required, but not set.';
                case 'extras_module_missing':
                    return 'Extras API must provide an "embeddings" module.';
                case 'webllm_not_supported':
                    return 'WebLLM extension is not installed or the model is not set.';
                case 'account_id_missing':
                    return 'Workers AI account ID is required. Save it in the "API Connections" panel.';
                case 'summary_endpoint_invalid':
                    return 'Summarization endpoint is not supported.';
                case 'summary_failed':
                    return 'Summarization failed after the configured number of retries.';
                default:
                    return 'Check server console for more details';
            }
        }

        console.error('Vectors: Failed to synchronize chat', error);

        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        const message = getErrorMessage(error.cause);
        notyf.error(message, 'Vectorization failed', { preventDuplicates: true });
        return null;
    } finally {
        syncBlocked = false;
    }
}

/**
 * @type {Map<string, number>} Cache object for storing hash values
 */
const hashCache = new Map();

/**
 * Gets the hash value for a given string
 * @param {string} str Input string
 * @returns {number} Hash value
 */
function getStringHash(str: any) {
    // Check if the hash is already in the cache
    if (hashCache.has(str)) {
        return hashCache.get(str);
    }

    // Calculate the hash value
    const hash = calculateHash(str);

    // Store the hash in the cache
    hashCache.set(str, hash);

    return hash;
}

/**
 * Retrieves files from the chat and inserts them into the vector index.
 * @param {ChatMessage[]} chat Array of chat messages
 * @returns {Promise<void>}
 */
async function processFiles(chat: any) {
    try {
        if (!settings.enabled_files) {
            return;
        }

        // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
        const dataBankCollectionIds = await ingestDataBankAttachments();

        if (dataBankCollectionIds.length) {
            const queryText = await getQueryText(chat, 'file');
            await injectDataBankChunks(queryText, dataBankCollectionIds);
        }

        for (const message of chat) {
            // Message has no files
            if (!Array.isArray(message?.extra?.files) || !message.extra.files.length) {
                continue;
            }

            // Trim file inserted by the script
            const allFileText = String(message.mes || '').substring(0, message.extra.fileLength).trim();

            // Convert kilobytes to string length
            const thresholdLength = settings.size_threshold * 1024;

            // File is too small
            if (allFileText.length < thresholdLength) {
                continue;
            }

            message.mes = message.mes.substring(message.extra.fileLength);

            const allFileChunks = [];
            const queryText = await getQueryText(chat, 'file');

            for (const file of message.extra.files) {
                const fileName = file.name;
                const fileUrl = file.url;
                const collectionId = getFileCollectionId(fileUrl);
                const hashesInCollection = await getSavedHashes(collectionId);

                // File is not vectorized yet
                if (!hashesInCollection.length) {
                    const fileText = file.text || (await getFileAttachment(fileUrl));
                    if (!fileText) {
                        continue;
                    }
                    await vectorizeFile(fileText, fileName, collectionId, settings.chunk_size, settings.overlap_percent);
                }

                const fileChunks = await retrieveFileChunks(queryText, collectionId);
                if (fileChunks) {
                    allFileChunks.push(fileChunks);
                }
            }

            message.mes = `${allFileChunks.join('\n\n')}\n\n${message.mes}`;
        }
    } catch (error) {
        console.error('Vectors: Failed to retrieve files', error);
    }
}

/**
 * Ensures that data bank attachments are ingested and inserted into the vector index.
 * @param {string} [source] Optional source filter for data bank attachments.
 * @returns {Promise<string[]>} Collection IDs
 */
async function ingestDataBankAttachments(source: any) {
    // Exclude disabled files
    const dataBank = source ? getDataBankAttachmentsForSource(source, false) : getDataBankAttachments(false);
    const dataBankCollectionIds = [];

    for (const file of dataBank) {
        const collectionId = getFileCollectionId(file.url);
        const hashesInCollection = await getSavedHashes(collectionId);
        dataBankCollectionIds.push(collectionId);

        // File is already in the collection
        if (hashesInCollection.length) {
            continue;
        }

        // Download and process the file
        const fileText = await getFileAttachment(file.url);
        console.log(`Vectors: Retrieved file ${file.name} from Data Bank`);
        // Convert kilobytes to string length
        const thresholdLength = settings.size_threshold_db * 1024;
        // Use chunk size from settings if file is larger than threshold
        const chunkSize = file.size > thresholdLength ? settings.chunk_size_db : -1;
        await vectorizeFile(fileText, file.name, collectionId, chunkSize, settings.overlap_percent_db);
    }

    return dataBankCollectionIds;
}

/**
 * Inserts file chunks from the Data Bank into the prompt.
 * @param {string} queryText Text to query
 * @param {string[]} collectionIds File collection IDs
 * @returns {Promise<void>}
 */
async function injectDataBankChunks(queryText: any, collectionIds: any) {
    try {
        const queryResults = await queryMultipleCollections(collectionIds, queryText, settings.chunk_count_db, settings.score_threshold);
        console.debug(`Vectors: Retrieved ${collectionIds.length} Data Bank collections`, queryResults);
        let textResult = '';

        for (const collectionId in queryResults) {
            console.debug(`Vectors: Processing Data Bank collection ${collectionId}`, queryResults[collectionId]);
            const metadata = queryResults[collectionId].metadata?.filter((x: any) => x.text)?.sort((a: any, b: any) => a.index - b.index)?.map((x: any) => x.text)?.filter(onlyUnique) || [];
            textResult += metadata.join('\n') + '\n\n';
        }

        if (!textResult) {
            console.debug('Vectors: No Data Bank chunks found');
            return;
        }

        const insertedText = substituteParamsExtended(settings.file_template_db, { text: textResult });
        setExtensionPrompt(EXTENSION_PROMPT_TAG_DB, insertedText, settings.file_position_db, settings.file_depth_db, settings.include_wi, settings.file_depth_role_db);
    } catch (error) {
        console.error('Vectors: Failed to insert Data Bank chunks', error);
    }
}

/**
 * Retrieves file chunks from the vector index and inserts them into the chat.
 * @param {string} queryText Text to query
 * @param {string} collectionId File collection ID
 * @returns {Promise<string>} Retrieved file text
 */
async function retrieveFileChunks(queryText: any, collectionId: any) {
    console.debug(`Vectors: Retrieving file chunks for collection ${collectionId}`, queryText);
    const queryResults = await queryCollection(collectionId, queryText, settings.chunk_count);
    console.debug(`Vectors: Retrieved ${queryResults.hashes.length} file chunks for collection ${collectionId}`, queryResults);
    const metadata = queryResults.metadata.filter((x: any) => x.text).sort((a: any, b: any) => a.index - b.index).map((x: any) => x.text).filter(onlyUnique);
    const fileText = metadata.join('\n');

    return fileText;
}

/**
 * Vectorizes a file and inserts it into the vector index.
 * @param {string} fileText File text
 * @param {string} fileName File name
 * @param {string} collectionId File collection ID
 * @param {number} chunkSize Chunk size
 * @param {number} overlapPercent Overlap size (in %)
 * @returns {Promise<boolean>} True if successful, false if not
 */
async function vectorizeFile(fileText: any, fileName: any, collectionId: any, chunkSize: any, overlapPercent: any) {
    // @ts-expect-error TS(2304): Cannot find name 'jQuery'.
    let toast = jQuery();

    try {

        if (settings.translate_files && typeof globalThis.translate === 'function') {
            console.log(`Vectors: Translating file ${fileName} to English...`);

            const translatedText = await globalThis.translate(fileText, 'en');
            fileText = translatedText;
        }

        const batchSize = getBatchSize();
        const toastBody = $('<span>').text('This may take a while. Please wait...');
        toast = notyf.info(toastBody, `Ingesting file ${escapeHtml(fileName)}`, { closeButton: false, escapeHtml: false, timeOut: 0, extendedTimeOut: 0 });
        const overlapSize = Math.round(chunkSize * overlapPercent / 100);
        const delimiters = getChunkDelimiters();
        // Overlap should not be included in chunk size. It will be later compensated by overlapChunks
        chunkSize = overlapSize > 0 ? (chunkSize - overlapSize) : chunkSize;
        const applyOverlap = (x: any, y: any, z: any) => overlapSize > 0 ? overlapChunks(x, y, z, overlapSize) : x;
        const chunks = settings.only_custom_boundary && settings.force_chunk_delimiter
            ? fileText.split(settings.force_chunk_delimiter).map(applyOverlap)
            : splitRecursive(fileText, chunkSize, delimiters).map(applyOverlap);
        console.debug(`Vectors: Split file ${fileName} into ${chunks.length} chunks with ${overlapPercent}% overlap`, chunks);

        // @ts-expect-error TS(7006): Parameter 'chunk' implicitly has an 'any' type.
        const items = chunks.map((chunk, index) => ({
            hash: getStringHash(chunk),
            text: chunk,
            index: index
        }));

        for (let i = 0; i < items.length; i += batchSize) {
            toastBody.text(`${i}/${items.length} (${Math.round((i / items.length) * 100)}%) chunks processed`);
            const chunkedBatch = items.slice(i, i + batchSize);
            await insertVectorItems(collectionId, chunkedBatch);
        }

        notyf.dismiss(toast);
        console.log(`Vectors: Inserted ${chunks.length} vector items for file ${fileName} into ${collectionId}`);
        return true;
    } catch (error) {
        notyf.dismiss(toast);
        notyf.error(String(error), 'Failed to vectorize file', { preventDuplicates: true });
        console.error('Vectors: Failed to vectorize file', error);
        return false;
    }
}

/**
 * Removes the most relevant messages from the chat and displays them in the extension prompt
 * @param {ChatMessage[]} chat Array of chat messages
 * @param {number} _contextSize Context size (unused)
 * @param {function} _abort Abort function (unused)
 * @param {string} type Generation type
 */
async function rearrangeChat(chat: any, _contextSize: any, _abort: any, type: any) {
    try {
        if (type === 'quiet') {
            console.debug('Vectors: Skipping quiet prompt');
            return;
        }

        // Clear the extension prompt
        setExtensionPrompt(EXTENSION_PROMPT_TAG, '', settings.position, settings.depth, settings.include_wi);
        setExtensionPrompt(EXTENSION_PROMPT_TAG_DB, '', settings.file_position_db, settings.file_depth_db, settings.include_wi, settings.file_depth_role_db);

        if (settings.enabled_files) {
            await processFiles(chat);
        }

        if (settings.enabled_world_info) {
            await activateWorldInfo(chat);
        }

        if (!settings.enabled_chats) {
            return;
        }

        const chatId = getCurrentChatId();

        if (!chatId || !Array.isArray(chat)) {
            console.debug('Vectors: No chat selected');
            return;
        }

        if (chat.length < settings.protect) {
            console.debug(`Vectors: Not enough messages to rearrange (less than ${settings.protect})`);
            return;
        }

        const queryText = await getQueryText(chat, 'chat');

        if (queryText.length === 0) {
            console.debug('Vectors: No text to query');
            return;
        }

        // Get the most relevant messages, excluding the last few
        const queryResults = await queryCollection(chatId, queryText, settings.insert);
        const queryHashes = queryResults.hashes.filter(onlyUnique);
        const queriedMessages = [];
        const insertedHashes = new Set();
        const retainMessages = chat.slice(-settings.protect);

        for (const message of chat) {
            if (retainMessages.includes(message) || !message.mes) {
                continue;
            }
            const hash = getStringHash(substituteParams(message.mes));
            if (queryHashes.includes(hash) && !insertedHashes.has(hash)) {
                queriedMessages.push(message);
                insertedHashes.add(hash);
            }
        }

        // Rearrange queried messages to match query order
        // Order is reversed because more relevant are at the lower indices
        queriedMessages.sort((a, b) => queryHashes.indexOf(getStringHash(substituteParams(b.mes))) - queryHashes.indexOf(getStringHash(substituteParams(a.mes))));

        // Remove queried messages from the original chat array
        for (const message of chat) {
            if (queriedMessages.includes(message)) {
                chat.splice(chat.indexOf(message), 1);
            }
        }

        if (queriedMessages.length === 0) {
            console.debug('Vectors: No relevant messages found');
            return;
        }

        // Format queried messages into a single string
        const insertedText = getPromptText(queriedMessages);
        setExtensionPrompt(EXTENSION_PROMPT_TAG, insertedText, settings.position, settings.depth, settings.include_wi);
    } catch (error) {
        notyf.error('Generation interceptor aborted. Check browser console for more details.', 'Vector Storage');
        console.error('Vectors: Failed to rearrange chat', error);
    }
}

/**
 * @param {any[]} queriedMessages
 * @returns {string}
 */
function getPromptText(queriedMessages: any) {
    const queriedText = queriedMessages.map((x: any) => collapseNewlines(`${x.name}: ${x.mes}`).trim()).join('\n\n');
    console.log('Vectors: relevant past messages found.\n', queriedText);
    return substituteParamsExtended(settings.template, { text: queriedText });
}

/**
 * Modifies text chunks to include overlap with adjacent chunks.
 * @param {string} chunk Current item
 * @param {number} index Current index
 * @param {string[]} chunks List of chunks
 * @param {number} overlapSize Size of the overlap
 * @returns {string} Overlapped chunks, with overlap trimmed to sentence boundaries
 */
function overlapChunks(chunk: any, index: any, chunks: any, overlapSize: any) {
    const halfOverlap = Math.floor(overlapSize / 2);
    const nextChunk = chunks[index + 1];
    const prevChunk = chunks[index - 1];

    const nextOverlap = trimToEndSentence(nextChunk?.substring(0, halfOverlap)) || '';
    const prevOverlap = trimToStartSentence(prevChunk?.substring(prevChunk.length - halfOverlap)) || '';
    const overlappedChunk = [prevOverlap, chunk, nextOverlap].filter(x => x).join(' ');

    return overlappedChunk;
}

// @ts-expect-error TS(7017): Element implicitly has an 'any' type because type ... Remove this comment to see the full error message
globalThis.vectors_rearrangeChat = rearrangeChat;

const onChatEvent = debounce(async () => await moduleWorker.update(), debounce_timeout.relaxed);

/**
 * Gets the text to query from the chat
 * @param {ChatMessage[]} chat Chat messages
 * @param {'file'|'chat'|'world-info'} initiator Initiator of the query
 * @returns {Promise<string>} Text to query
 */
async function getQueryText(chat: any, initiator: any) {
    const getTextWithoutAttachments = (x: any) => {
        const fileLength = x?.extra?.fileLength || 0;
        return String(x?.mes || '').substring(fileLength).trim();
    };

    let hashedMessages = chat
        .map((x: any) => ({
        text: substituteParams(getTextWithoutAttachments(x)),
        hash: getStringHash(substituteParams(getTextWithoutAttachments(x))),
        index: chat.indexOf(x)
    }))
        .filter((x: any) => x.text)
        .reverse()
        .slice(0, settings.query);

    if (initiator === 'chat' && settings.enabled_chats && settings.summarize && settings.summarize_sent) {
        const minLength = Math.max(0, Number(settings.summary_threshold) || 0);
        const toSummarize = minLength > 0 ? hashedMessages.filter((x: any) => x.text.length >= minLength) : hashedMessages;
        if (toSummarize.length > 0) {
            await summarize(toSummarize, settings.summary_source, { skipOnFailure: true });
        }
    }

    const queryText = hashedMessages.map((x: any) => x.text).join('\n');

    return collapseNewlines(queryText).trim();
}

/**
 * Gets common body parameters for vector requests.
 * @param {object} args Additional arguments
 * @returns {object} Request body
 */
function getVectorsRequestBody(args = {}) {
    const body = Object.assign({}, args);
    switch (settings.source) {
        case 'extras':
            // @ts-expect-error TS(2339): Property 'extrasUrl' does not exist on type '{}'.
            body.extrasUrl = extension_settings.apiUrl;
            // @ts-expect-error TS(2339): Property 'extrasKey' does not exist on type '{}'.
            body.extrasKey = extension_settings.apiKey;
            break;
        case 'electronhub':
            // @ts-expect-error TS(2339): Property 'model' does not exist on type '{}'.
            body.model = extension_settings.vectors.electronhub_model;
            break;
        case 'openrouter':
            // @ts-expect-error TS(2339): Property 'model' does not exist on type '{}'.
            body.model = extension_settings.vectors.openrouter_model;
            break;
        case 'togetherai':
            // @ts-expect-error TS(2339): Property 'model' does not exist on type '{}'.
            body.model = extension_settings.vectors.togetherai_model;
            break;
        case 'openai':
            // @ts-expect-error TS(2339): Property 'model' does not exist on type '{}'.
            body.model = extension_settings.vectors.openai_model;
            break;
        case 'cohere':
            // @ts-expect-error TS(2339): Property 'model' does not exist on type '{}'.
            body.model = extension_settings.vectors.cohere_model;
            break;
        case 'ollama':
            // @ts-expect-error TS(2339): Property 'model' does not exist on type '{}'.
            body.model = extension_settings.vectors.ollama_model;
            // @ts-expect-error TS(2339): Property 'apiUrl' does not exist on type '{}'.
            body.apiUrl = settings.use_alt_endpoint ? settings.alt_endpoint_url : textgenerationwebui_settings.server_urls[textgen_types.OLLAMA];
            // @ts-expect-error TS(2339): Property 'keep' does not exist on type '{}'.
            body.keep = !!extension_settings.vectors.ollama_keep;
            break;
        case 'llamacpp':
            // @ts-expect-error TS(2339): Property 'apiUrl' does not exist on type '{}'.
            body.apiUrl = settings.use_alt_endpoint ? settings.alt_endpoint_url : textgenerationwebui_settings.server_urls[textgen_types.LLAMACPP];
            break;
        case 'vllm':
            // @ts-expect-error TS(2339): Property 'apiUrl' does not exist on type '{}'.
            body.apiUrl = settings.use_alt_endpoint ? settings.alt_endpoint_url : textgenerationwebui_settings.server_urls[textgen_types.VLLM];
            // @ts-expect-error TS(2339): Property 'model' does not exist on type '{}'.
            body.model = extension_settings.vectors.vllm_model;
            break;
        case 'webllm':
            // @ts-expect-error TS(2339): Property 'model' does not exist on type '{}'.
            body.model = extension_settings.vectors.webllm_model;
            break;
        case 'palm':
            // @ts-expect-error TS(2339): Property 'model' does not exist on type '{}'.
            body.model = extension_settings.vectors.google_model;
            // @ts-expect-error TS(2339): Property 'api' does not exist on type '{}'.
            body.api = 'makersuite';
            break;
        case 'vertexai':
            // @ts-expect-error TS(2339): Property 'model' does not exist on type '{}'.
            body.model = extension_settings.vectors.google_model;
            // @ts-expect-error TS(2339): Property 'api' does not exist on type '{}'.
            body.api = 'vertexai';
            // @ts-expect-error TS(2339): Property 'vertexai_auth_mode' does not exist on ty... Remove this comment to see the full error message
            body.vertexai_auth_mode = oai_settings.vertexai_auth_mode;
            // @ts-expect-error TS(2339): Property 'vertexai_region' does not exist on type ... Remove this comment to see the full error message
            body.vertexai_region = oai_settings.vertexai_region;
            // @ts-expect-error TS(2339): Property 'vertexai_express_project_id' does not ex... Remove this comment to see the full error message
            body.vertexai_express_project_id = oai_settings.vertexai_express_project_id;
            break;
        case 'chutes':
            // @ts-expect-error TS(2339): Property 'model' does not exist on type '{}'.
            body.model = extension_settings.vectors.chutes_model;
            break;
        case 'nanogpt':
            // @ts-expect-error TS(2339): Property 'model' does not exist on type '{}'.
            body.model = extension_settings.vectors.nanogpt_model;
            break;
        case 'siliconflow':
            // @ts-expect-error TS(2339): Property 'model' does not exist on type '{}'.
            body.model = extension_settings.vectors.siliconflow_model;
            // @ts-expect-error TS(2339): Property 'siliconflow_endpoint' does not exist on ... Remove this comment to see the full error message
            body.siliconflow_endpoint = oai_settings.siliconflow_endpoint;
            break;
        case 'workers_ai':
            // @ts-expect-error TS(2339): Property 'model' does not exist on type '{}'.
            body.model = extension_settings.vectors.workers_ai_model || '@cf/baai/bge-m3';
            // @ts-expect-error TS(2339): Property 'workers_ai_account_id' does not exist on... Remove this comment to see the full error message
            body.workers_ai_account_id = oai_settings.workers_ai_account_id;
            break;
        default:
            break;
    }
    return body;
}

/**
 * Gets additional arguments for vector requests.
 * @param {string[]} items Items to embed
 * @returns {Promise<object>} Additional arguments
 */
async function getAdditionalArgs(items: any) {
    const args = {};
    switch (settings.source) {
        case 'webllm':
            // @ts-expect-error TS(2339): Property 'embeddings' does not exist on type '{}'.
            args.embeddings = await createWebLlmEmbeddings(items);
            break;
        case 'koboldcpp': {
            const { embeddings, model } = await createKoboldCppEmbeddings(items);
            // @ts-expect-error TS(2339): Property 'embeddings' does not exist on type '{}'.
            args.embeddings = embeddings;
            // @ts-expect-error TS(2339): Property 'model' does not exist on type '{}'.
            args.model = model;
            break;
        }
    }
    return args;
}

/**
 * Gets the saved hashes for a collection
* @param {string} collectionId
* @returns {Promise<number[]>} Saved hashes
*/
async function getSavedHashes(collectionId: any) {
    const args = await getAdditionalArgs([]);
    const response = await fetch('/api/vector/list', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            ...getVectorsRequestBody(args),
            collectionId: collectionId,
            source: settings.source,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to get saved hashes for collection ${collectionId}`);
    }

    const hashes = await response.json();
    return hashes;
}

/**
 * Inserts vector items into a collection
 * @param {string} collectionId - The collection to insert into
 * @param {{ hash: number, text: string }[]} items - The items to insert
 * @returns {Promise<void>}
 */
async function insertVectorItems(collectionId: any, items: any) {
    throwIfSourceInvalid();

    const args = await getAdditionalArgs(items.map((x: any) => x.text));
    const response = await fetch('/api/vector/insert', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            ...getVectorsRequestBody(args),
            collectionId: collectionId,
            items: items,
            source: settings.source,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to insert vector items for collection ${collectionId}`);
    }
}

/**
 * Throws an error if the source is invalid (missing API key or URL, or missing module)
 */
function throwIfSourceInvalid() {
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    if (settings.source === 'openai' && !secret_state[SECRET_KEYS.OPENAI] ||
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        settings.source === 'electronhub' && !secret_state[SECRET_KEYS.ELECTRONHUB] ||
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        settings.source === 'chutes' && !secret_state[SECRET_KEYS.CHUTES] ||
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        settings.source === 'nanogpt' && !secret_state[SECRET_KEYS.NANOGPT] ||
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        settings.source === 'openrouter' && !secret_state[SECRET_KEYS.OPENROUTER] ||
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        settings.source === 'palm' && !secret_state[SECRET_KEYS.MAKERSUITE] ||
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        settings.source === 'vertexai' && !secret_state[SECRET_KEYS.VERTEXAI] && !secret_state[SECRET_KEYS.VERTEXAI_SERVICE_ACCOUNT] ||
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        settings.source === 'mistral' && !secret_state[SECRET_KEYS.MISTRALAI] ||
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        settings.source === 'togetherai' && !secret_state[SECRET_KEYS.TOGETHERAI] ||
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        settings.source === 'nomicai' && !secret_state[SECRET_KEYS.NOMICAI] ||
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        settings.source === 'cohere' && !secret_state[SECRET_KEYS.COHERE] ||
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        settings.source === 'workers_ai' && !secret_state[SECRET_KEYS.WORKERS_AI] ||
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        settings.source === 'siliconflow' && !secret_state[SECRET_KEYS.SILICONFLOW]) {

        throw new Error('Vectors: API key missing', { cause: 'api_key_missing' });
    }

    if (vectorApiRequiresUrl.includes(settings.source) && settings.use_alt_endpoint) {
        if (!settings.alt_endpoint_url) {

            throw new Error('Vectors: API URL missing', { cause: 'api_url_missing' });
        }
    } else {
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        if (settings.source === 'ollama' && !textgenerationwebui_settings.server_urls[textgen_types.OLLAMA] ||
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            settings.source === 'vllm' && !textgenerationwebui_settings.server_urls[textgen_types.VLLM] ||
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            settings.source === 'koboldcpp' && !textgenerationwebui_settings.server_urls[textgen_types.KOBOLDCPP] ||
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            settings.source === 'llamacpp' && !textgenerationwebui_settings.server_urls[textgen_types.LLAMACPP]) {

            throw new Error('Vectors: API URL missing', { cause: 'api_url_missing' });
        }
    }

    if (settings.source === 'ollama' && !settings.ollama_model || settings.source === 'vllm' && !settings.vllm_model) {

        throw new Error('Vectors: API model missing', { cause: 'api_model_missing' });
    }

    // @ts-expect-error TS(2345): Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
    if (settings.source === 'extras' && !modules.includes('embeddings')) {

        throw new Error('Vectors: Embeddings module missing', { cause: 'extras_module_missing' });
    }

    if (settings.source === 'webllm' && (!isWebLlmSupported() || !settings.webllm_model)) {

        throw new Error('Vectors: WebLLM is not supported', { cause: 'webllm_not_supported' });
    }

    if (settings.source === 'workers_ai' && !oai_settings.workers_ai_account_id) {

        throw new Error('Vectors: Workers AI account ID missing', { cause: 'account_id_missing' });
    }
}

/**
 * Deletes vector items from a collection
 * @param {string} collectionId - The collection to delete from
 * @param {number[]} hashes - The hashes of the items to delete
 * @returns {Promise<void>}
 */
async function deleteVectorItems(collectionId: any, hashes: any) {
    const args = await getAdditionalArgs([]);
    const response = await fetch('/api/vector/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            ...getVectorsRequestBody(args),
            collectionId: collectionId,
            hashes: hashes,
            source: settings.source,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to delete vector items for collection ${collectionId}`);
    }
}

/**
 * @param {string} collectionId - The collection to query
 * @param {string} searchText - The text to query
 * @param {number} topK - The number of results to return
 * @returns {Promise<{ hashes: number[], metadata: object[]}>} - Hashes of the results
 */
async function queryCollection(collectionId: any, searchText: any, topK: any) {
    const args = await getAdditionalArgs([searchText]);
    const response = await fetch('/api/vector/query', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            ...getVectorsRequestBody(args),
            collectionId: collectionId,
            searchText: searchText,
            topK: topK,
            source: settings.source,
            threshold: settings.score_threshold,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to query collection ${collectionId}`);
    }

    return await response.json();
}

/**
 * Queries multiple collections for a given text.
 * @param {string[]} collectionIds - Collection IDs to query
 * @param {string} searchText - Text to query
 * @param {number} topK - Number of results to return
 * @param {number} threshold - Score threshold
 * @returns {Promise<Record<string, { hashes: number[], metadata: object[] }>>} - Results mapped to collection IDs
 */
async function queryMultipleCollections(collectionIds: any, searchText: any, topK: any, threshold: any) {
    const args = await getAdditionalArgs([searchText]);
    const response = await fetch('/api/vector/query-multi', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            ...getVectorsRequestBody(args),
            collectionIds: collectionIds,
            searchText: searchText,
            topK: topK,
            source: settings.source,
            threshold: threshold ?? settings.score_threshold,
        }),
    });

    if (!response.ok) {
        throw new Error('Failed to query multiple collections');
    }

    return await response.json();
}

/**
 * Purges the vector index for a file.
 * @param {string} fileUrl File URL to purge
 */
async function purgeFileVectorIndex(fileUrl: any) {
    try {
        if (!settings.enabled_files) {
            return;
        }

        console.log(`Vectors: Purging file vector index for ${fileUrl}`);
        const collectionId = getFileCollectionId(fileUrl);

        const response = await fetch('/api/vector/purge', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                ...getVectorsRequestBody(),
                collectionId: collectionId,
            }),
        });

        if (!response.ok) {
            throw new Error(`Could not delete vector index for collection ${collectionId}`);
        }

        console.log(`Vectors: Purged vector index for collection ${collectionId}`);
    } catch (error) {
        console.error('Vectors: Failed to purge file', error);
    }
}

/**
 * Purges the vector index for a collection.
 * @param {string} collectionId Collection ID to purge
 * @returns <Promise<boolean>> True if deleted, false if not
 */
async function purgeVectorIndex(collectionId: any) {
    try {
        if (!settings.enabled_chats) {
            return true;
        }

        const response = await fetch('/api/vector/purge', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                ...getVectorsRequestBody(),
                collectionId: collectionId,
            }),
        });

        if (!response.ok) {
            throw new Error(`Could not delete vector index for collection ${collectionId}`);
        }

        console.log(`Vectors: Purged vector index for collection ${collectionId}`);
        return true;
    } catch (error) {
        console.error('Vectors: Failed to purge', error);
        return false;
    }
}

/**
 * Purges all vector indexes.
 */
async function purgeAllVectorIndexes() {
    try {
        const response = await fetch('/api/vector/purge-all', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                ...getVectorsRequestBody(),
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to purge all vector indexes');
        }

        console.log('Vectors: Purged all vector indexes');
        notyf.success('All vector indexes purged', 'Purge successful');
    } catch (error) {
        console.error('Vectors: Failed to purge all', error);
        notyf.error('Failed to purge all vector indexes', 'Purge failed');
    }
}

function toggleSettings() {
    $('#vectors_files_settings').toggle(!!settings.enabled_files);
    $('#vectors_chats_settings').toggle(!!settings.enabled_chats);
    $('#vectors_world_info_settings').toggle(!!settings.enabled_world_info);
    $('#together_vectorsModel').toggle(settings.source === 'togetherai');
    $('#openai_vectorsModel').toggle(settings.source === 'openai');
    $('#electronhub_vectorsModel').toggle(settings.source === 'electronhub');
    $('#chutes_vectorsModel').toggle(settings.source === 'chutes');
    $('#nanogpt_vectorsModel').toggle(settings.source === 'nanogpt');
    $('#openrouter_vectorsModel').toggle(settings.source === 'openrouter');
    $('#cohere_vectorsModel').toggle(settings.source === 'cohere');
    $('#ollama_vectorsModel').toggle(settings.source === 'ollama');
    $('#llamacpp_vectorsModel').toggle(settings.source === 'llamacpp');
    $('#vllm_vectorsModel').toggle(settings.source === 'vllm');
    $('#nomicai_apiKey').toggle(settings.source === 'nomicai');
    $('#webllm_vectorsModel').toggle(settings.source === 'webllm');
    $('#koboldcpp_vectorsModel').toggle(settings.source === 'koboldcpp');
    $('#google_vectorsModel').toggle(settings.source === 'palm' || settings.source === 'vertexai');
    $('#siliconflow_vectorsModel').toggle(settings.source === 'siliconflow');
    $('#workers_ai_vectorsModel').toggle(settings.source === 'workers_ai');
    $('#vector_altEndpointUrl').toggle(vectorApiRequiresUrl.includes(settings.source));
    if (settings.source === 'webllm') {
        loadWebLlmModels();
    } else if (settings.source in remoteEmbeddingEndpoints) {
        loadRemoteEmbeddingModels(settings.source);
    }
}

/**
 * Loads models from a remote embedding endpoint and populates the corresponding select element.
 * @param {string} source - The source key matching a remoteEmbeddingEndpoints entry
 */
async function loadRemoteEmbeddingModels(source: any) {
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    const config = remoteEmbeddingEndpoints[source];
    if (!config) {
        return;
    }

    const { url, settingsKey, selectId, getBody, filter } = config;
    const valueProperty = config.valueProperty || 'id';
    const textProperty = config.textProperty;

    /**
     * Populates the select element with the given models.
     * @param {any[]} models - Array of model objects
     */
    function populateSelect(models: any) {
        const select = $(`#${selectId}`);
        select.empty();
        for (const m of models) {
            const option = document.createElement('option');
            option.value = m[valueProperty];
            option.text = textProperty ? (m[textProperty] || m[valueProperty]) : m[valueProperty];
            select.append(option);
        }
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        if (!settings[settingsKey] && models.length) {
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            settings[settingsKey] = models[0][valueProperty];
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        }
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        select.val(settings[settingsKey]);
    }

    try {
        const body = typeof getBody === 'function' ? getBody() : {};

        /** @type {RequestInit} */
        const fetchOptions = {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(body || {}),
        };

        const response = await fetch(url, fetchOptions);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        /** @type {Array<any>} */
        const data = await response.json();
        let models = Array.isArray(data) ? data : [];
        if (filter) {
            models = filter(models);
        }

        populateSelect(models);
    } catch (err) {
        console.warn(`${source} models fetch failed`, err);
        populateSelect([]);
    }
}

/**
 * Executes a function with WebLLM error handling.
 * @param {function(): Promise<T>} func Function to execute
 * @returns {Promise<T>}
 * @template T
 */
async function executeWithWebLlmErrorHandling(func: any) {
    try {
        return await func();
    } catch (error) {
        console.log('Vectors: Failed to load WebLLM models', error);
        if (!(error instanceof Error)) {
            return;
        }
        switch (error.cause) {

            case 'webllm-not-available':
                notyf.warning('WebLLM is not available. Please install the extension.', 'WebLLM not installed');
                break;

            case 'webllm-not-updated':
                notyf.warning('The installed extension version does not support embeddings.', 'WebLLM update required');
                break;
        }
    }
}

/**
 * Loads and displays WebLLM models in the settings.
 * @returns {Promise<void>}
 */
function loadWebLlmModels() {
    return executeWithWebLlmErrorHandling(() => {
        const models = webllmProvider.getModels();
        $('#vectors_webllm_model').empty();
        for (const model of models) {
            $('#vectors_webllm_model').append($('<option>', { value: model.id, text: model.toString() }));
        }
        if (!settings.webllm_model || !models.some((x: any) => x.id === settings.webllm_model)) {
            if (models.length) {
                settings.webllm_model = models[0].id;
            }
        }
        $('#vectors_webllm_model').val(settings.webllm_model);
        return Promise.resolve();
    });
}

/**
 * Creates WebLLM embeddings for a list of items.
 * @param {string[]} items Items to embed
 * @returns {Promise<Record<string, number[]>>} Calculated embeddings
 */
async function createWebLlmEmbeddings(items: any) {
    if (items.length === 0) {
        return /** @type {Record<string, number[]>} */ ({});
    }
    return executeWithWebLlmErrorHandling(async () => {
        const embeddings = await webllmProvider.embedTexts(items, settings.webllm_model);
        const result = /** @type {Record<string, number[]>} */ ({});
        for (let i = 0; i < items.length; i++) {
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            result[items[i]] = embeddings[i];
        }
        return result;
    });
}

/**
 * Creates KoboldCpp embeddings for a list of items.
 * @param {string[]} items Items to embed
 * @returns {Promise<{embeddings: Record<string, number[]>, model: string}>} Calculated embeddings
 */
async function createKoboldCppEmbeddings(items: any) {
    const response = await fetch('/api/backends/kobold/embed', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            items: items,
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            server: settings.use_alt_endpoint ? settings.alt_endpoint_url : textgenerationwebui_settings.server_urls[textgen_types.KOBOLDCPP],
        }),
    });

    if (!response.ok) {
        throw new Error('Failed to get KoboldCpp embeddings');
    }

    const data = await response.json();
    if (!Array.isArray(data.embeddings) || !data.model || data.embeddings.length !== items.length) {
        throw new Error('Invalid response from KoboldCpp embeddings');
    }

    const embeddings = /** @type {Record<string, number[]>} */ ({});
    for (let i = 0; i < data.embeddings.length; i++) {
        if (!Array.isArray(data.embeddings[i]) || data.embeddings[i].length === 0) {
            throw new Error('KoboldCpp returned an empty embedding. Reduce the chunk size and/or size threshold and try again.');
        }

        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        embeddings[items[i]] = data.embeddings[i];
    }

    return {
        embeddings: embeddings,
        model: data.model,
    };
}

async function onPurgeClick() {
    const chatId = getCurrentChatId();
    if (!chatId) {
        notyf.info('No chat selected', 'Purge aborted');
        return;
    }
    if (await purgeVectorIndex(chatId)) {
        notyf.success('Vector index purged', 'Purge successful');
    } else {
        notyf.error('Failed to purge vector index', 'Purge failed');
    }
}

async function onViewStatsClick() {
    const chatId = getCurrentChatId();
    if (!chatId) {
        notyf.info('No chat selected');
        return;
    }

    const hashesInCollection = await getSavedHashes(chatId);
    const totalHashes = hashesInCollection.length;
    const uniqueHashes = hashesInCollection.filter(onlyUnique).length;

    notyf.info(`Total hashes: <b>${totalHashes}</b><br>
    Unique hashes: <b>${uniqueHashes}</b><br><br>
    I'll mark collected messages with a green circle.`,
    `Stats for chat ${escapeHtml(chatId)}`,
    { timeOut: 10000, escapeHtml: false },
    );

    $('#chat .mes.vectorized').removeClass('vectorized');
    const chat = getContext().chat;
    for (const message of chat) {
        // @ts-expect-error TS(2339): Property 'mes' does not exist on type 'never'.
        if (hashesInCollection.includes(getStringHash(substituteParams(message.mes)))) {
            const messageElement = $(`#chat .mes[mesid="${chat.indexOf(message)}"]`);
            messageElement.addClass('vectorized');
        }
    }
}

async function onVectorizeAllFilesClick() {
    try {
        const dataBank = getDataBankAttachments();
        // @ts-expect-error TS(2339): Property 'extra' does not exist on type 'never'.
        const chatAttachments = getContext().chat.filter(x => Array.isArray(x.extra?.files)).map(x => x.extra.files).flat();
        const allFiles = [...dataBank, ...chatAttachments];

        /**
         * Gets the chunk size for a file attachment.
         * @param file {import('../../chats.js').FileAttachment} File attachment
         * @returns {number} Chunk size for the file
         */
        function getChunkSize(file: any) {
            if (chatAttachments.includes(file)) {
                // Convert kilobytes to string length
                const thresholdLength = settings.size_threshold * 1024;
                return file.size > thresholdLength ? settings.chunk_size : -1;
            }

            if (dataBank.includes(file)) {
                // Convert kilobytes to string length
                const thresholdLength = settings.size_threshold_db * 1024;
                // Use chunk size from settings if file is larger than threshold
                return file.size > thresholdLength ? settings.chunk_size_db : -1;
            }

            return -1;
        }

        /**
         * Gets the overlap percent for a file attachment.
         * @param file {import('../../chats.js').FileAttachment} File attachment
         * @returns {number} Overlap percent for the file
         */
        function getOverlapPercent(file: any) {
            if (chatAttachments.includes(file)) {
                return settings.overlap_percent;
            }

            if (dataBank.includes(file)) {
                return settings.overlap_percent_db;
            }

            return 0;
        }

        let allSuccess = true;

        for (const file of allFiles) {
            const text = await getFileAttachment(file.url);
            const collectionId = getFileCollectionId(file.url);
            const hashes = await getSavedHashes(collectionId);

            if (hashes.length) {
                console.log(`Vectors: File ${file.name} is already vectorized`);
                continue;
            }

            const chunkSize = getChunkSize(file);
            const overlapPercent = getOverlapPercent(file);
            const result = await vectorizeFile(text, file.name, collectionId, chunkSize, overlapPercent);

            if (!result) {
                allSuccess = false;
            }
        }

        if (allSuccess) {
            notyf.success('All files vectorized', 'Vectorization successful');
        } else {
            notyf.warning('Some files failed to vectorize. Check browser console for more details.', 'Vector Storage');
        }
    } catch (error) {
        console.error('Vectors: Failed to vectorize all files', error);
        notyf.error('Failed to vectorize all files', 'Vectorization failed');
    }
}

async function onPurgeFilesClick() {
    try {
        const dataBank = getDataBankAttachments();
        // @ts-expect-error TS(2339): Property 'extra' does not exist on type 'never'.
        const chatAttachments = getContext().chat.filter(x => Array.isArray(x.extra?.files)).map(x => x.extra.files).flat();
        const allFiles = [...dataBank, ...chatAttachments];

        for (const file of allFiles) {
            await purgeFileVectorIndex(file.url);
        }

        notyf.success('All files purged', 'Purge successful');
    } catch (error) {
        console.error('Vectors: Failed to purge all files', error);
        notyf.error('Failed to purge all files', 'Purge failed');
    }
}

async function activateWorldInfo(chat: any) {
    if (!settings.enabled_world_info) {
        console.debug('Vectors: Disabled for World Info');
        return;
    }

    const entries = await getSortedEntries();

    if (!Array.isArray(entries) || entries.length === 0) {
        console.debug('Vectors: No WI entries found');
        return;
    }

    // Group entries by "world" field
    const groupedEntries = {};

    for (const entry of entries) {
        // Skip orphaned entries. Is it even possible?
        if (!entry.world) {
            console.debug('Vectors: Skipped orphaned WI entry', entry);
            continue;
        }

        // Skip disabled entries
        if (entry.disable) {
            console.debug('Vectors: Skipped disabled WI entry', entry);
            continue;
        }

        // Skip entries without content
        if (!entry.content) {
            console.debug('Vectors: Skipped WI entry without content', entry);
            continue;
        }

        // Skip non-vectorized entries
        if (!entry.vectorized && !settings.enabled_for_all) {
            console.debug('Vectors: Skipped non-vectorized WI entry', entry);
            continue;
        }

        if (!Object.hasOwn(groupedEntries, entry.world)) {
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            groupedEntries[entry.world] = [];
        }

        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        groupedEntries[entry.world].push(entry);
    }

    const collectionIds = [];

    if (Object.keys(groupedEntries).length === 0) {
        console.debug('Vectors: No WI entries to synchronize');
        return;
    }

    // Synchronize collections
    for (const world in groupedEntries) {
        const collectionId = `world_${getStringHash(world)}`;
        const hashesInCollection = await getSavedHashes(collectionId);
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        const newEntries = groupedEntries[world].filter((x: any) => !hashesInCollection.includes(getStringHash(x.content)));
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        const deletedHashes = hashesInCollection.filter((x: any) => !groupedEntries[world].some((y: any) => getStringHash(y.content) === x));

        if (newEntries.length > 0) {
            console.log(`Vectors: Found ${newEntries.length} new WI entries for world ${world}`);
            await insertVectorItems(collectionId, newEntries.map((x: any) => ({
                hash: getStringHash(x.content),
                text: x.content,
                index: x.uid
            })));
        }

        if (deletedHashes.length > 0) {
            console.log(`Vectors: Deleted ${deletedHashes.length} old hashes for world ${world}`);
            await deleteVectorItems(collectionId, deletedHashes);
        }

        collectionIds.push(collectionId);
    }

    // Perform a multi-query
    const queryText = await getQueryText(chat, 'world-info');

    if (queryText.length === 0) {
        console.debug('Vectors: No text to query for WI');
        return;
    }

    const queryResults = await queryMultipleCollections(collectionIds, queryText, settings.max_entries, settings.score_threshold);
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    const activatedHashes = Object.values(queryResults).flatMap(x => x.hashes).filter(onlyUnique);
    const activatedEntries = [];

    // Activate entries found in the query results
    for (const entry of entries) {
        const hash = getStringHash(entry.content);

        if (activatedHashes.includes(hash)) {
            activatedEntries.push(entry);
        }
    }

    if (activatedEntries.length === 0) {
        console.debug('Vectors: No activated WI entries found');
        return;
    }

    console.log(`Vectors: Activated ${activatedEntries.length} WI entries`, activatedEntries);
    await eventSource.emit(event_types.WORLDINFO_FORCE_ACTIVATE, activatedEntries);
}

export async function init() {
    if (!extension_settings.vectors) {
        extension_settings.vectors = settings;
    }

    // Migrate from old settings
    // @ts-expect-error TS(2339): Property 'enabled' does not exist on type '{ sourc... Remove this comment to see the full error message
    if (settings.enabled) {
        settings.enabled_chats = true;
    }

    Object.assign(settings, extension_settings.vectors);

    // Migrate from TensorFlow to Transformers
    settings.source = settings.source !== 'local' ? settings.source : 'transformers';
    const template = await renderExtensionTemplateAsync(MODULE_NAME, 'settings');
    $('#vectors_container').append(template);
    const elEnabledChats = document.getElementById('vectors_enabled_chats');
    if (elEnabledChats) {
        // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
        elEnabledChats.checked = settings.enabled_chats;
        elEnabledChats.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
            settings.enabled_chats = elEnabledChats.checked;
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
            toggleSettings();
        });
    }
    const elKeepHidden = document.getElementById('vectors_keep_hidden');
    if (elKeepHidden) {
        // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
        elKeepHidden.checked = settings.keep_hidden;
        elKeepHidden.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
            settings.keep_hidden = !!elKeepHidden.checked;
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elEnabledFiles = document.getElementById('vectors_enabled_files');
    if (elEnabledFiles) {
        // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
        elEnabledFiles.checked = settings.enabled_files;
        elEnabledFiles.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
            settings.enabled_files = elEnabledFiles.checked;
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
            toggleSettings();
        });
    }
    const elSource = document.getElementById('vectors_source');
    if (elSource) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elSource.value = settings.source;
        elSource.addEventListener('change', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.source = String(elSource.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
            toggleSettings();
        });
    }
    const elAltEndpoint = document.getElementById('vector_altEndpointUrl_enabled');
    if (elAltEndpoint) {
        // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
        elAltEndpoint.checked = settings.use_alt_endpoint;
        elAltEndpoint.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
            settings.use_alt_endpoint = elAltEndpoint.checked;
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elAltAddress = document.getElementById('vector_altEndpoint_address');
    if (elAltAddress) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elAltAddress.value = settings.alt_endpoint_url;
        elAltAddress.addEventListener('change', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.alt_endpoint_url = String(elAltAddress.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elTogether = document.getElementById('vectors_togetherai_model');
    if (elTogether) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elTogether.value = settings.togetherai_model;
        elTogether.addEventListener('change', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.togetherai_model = String(elTogether.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elOpenAI = document.getElementById('vectors_openai_model');
    if (elOpenAI) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elOpenAI.value = settings.openai_model;
        elOpenAI.addEventListener('change', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.openai_model = String(elOpenAI.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elElectronHub = document.getElementById('vectors_electronhub_model');
    if (elElectronHub) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elElectronHub.value = settings.electronhub_model;
        elElectronHub.addEventListener('change', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.electronhub_model = String(elElectronHub.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elChutes = document.getElementById('vectors_chutes_model');
    if (elChutes) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elChutes.value = settings.chutes_model;
        elChutes.addEventListener('change', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.chutes_model = String(elChutes.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elNanoGPT = document.getElementById('vectors_nanogpt_model');
    if (elNanoGPT) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elNanoGPT.value = settings.nanogpt_model;
        elNanoGPT.addEventListener('change', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.nanogpt_model = String(elNanoGPT.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elSilicon = document.getElementById('vectors_siliconflow_model');
    if (elSilicon) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elSilicon.value = settings.siliconflow_model;
        elSilicon.addEventListener('change', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.siliconflow_model = String(elSilicon.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elWorkers = document.getElementById('vectors_workers_ai_model');
    if (elWorkers) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elWorkers.value = settings.workers_ai_model;
        elWorkers.addEventListener('change', () => {
            // @ts-expect-error TS(2339): Property 'workers_ai_model' does not exist on type... Remove this comment to see the full error message
            settings.workers_ai_model = String(elWorkers.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elOpenRouter = document.getElementById('vectors_openrouter_model');
    if (elOpenRouter) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elOpenRouter.value = settings.openrouter_model;
        elOpenRouter.addEventListener('change', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.openrouter_model = String(elOpenRouter.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elCohere = document.getElementById('vectors_cohere_model');
    if (elCohere) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elCohere.value = settings.cohere_model;
        elCohere.addEventListener('change', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.cohere_model = String(elCohere.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elOllamaModel = document.getElementById('vectors_ollama_model');
    if (elOllamaModel) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elOllamaModel.value = settings.ollama_model;
        elOllamaModel.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.ollama_model = String(elOllamaModel.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elVllm = document.getElementById('vectors_vllm_model');
    if (elVllm) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elVllm.value = settings.vllm_model;
        elVllm.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.vllm_model = String(elVllm.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elOllamaKeep = document.getElementById('vectors_ollama_keep');
    if (elOllamaKeep) {
        // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
        elOllamaKeep.checked = settings.ollama_keep;
        elOllamaKeep.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
            settings.ollama_keep = elOllamaKeep.checked;
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elTemplate = document.getElementById('vectors_template');
    if (elTemplate) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elTemplate.value = settings.template;
        elTemplate.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.template = String(elTemplate.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elDepth = document.getElementById('vectors_depth');
    if (elDepth) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elDepth.value = settings.depth;
        elDepth.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.depth = Number(elDepth.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elProtect = document.getElementById('vectors_protect');
    if (elProtect) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elProtect.value = settings.protect;
        elProtect.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.protect = Number(elProtect.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elInsert = document.getElementById('vectors_insert');
    if (elInsert) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elInsert.value = settings.insert;
        elInsert.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.insert = Number(elInsert.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elQuery = document.getElementById('vectors_query');
    if (elQuery) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elQuery.value = settings.query;
        elQuery.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.query = Number(elQuery.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const positionInputs = document.querySelectorAll('input[name="vectors_position"]');
    // @ts-expect-error TS(2339): Property 'value' does not exist on type 'Element'.
    positionInputs.forEach(input => { if (String(input.value) === String(settings.position)) input.checked = true; });
    positionInputs.forEach(input => input.addEventListener('change', () => {
        const checked = document.querySelector('input[name="vectors_position"]:checked');
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'Element'.
        settings.position = Number(checked?.value ?? settings.position);
        Object.assign(extension_settings.vectors, settings);
        saveSettingsDebounced();
    }));
    document.getElementById('vectors_vectorize_all')?.addEventListener('click', onVectorizeAllClick);
    document.getElementById('vectors_purge')?.addEventListener('click', onPurgeClick);
    document.getElementById('vectors_view_stats')?.addEventListener('click', onViewStatsClick);
    document.getElementById('vectors_files_vectorize_all')?.addEventListener('click', onVectorizeAllFilesClick);
    document.getElementById('vectors_files_purge')?.addEventListener('click', onPurgeFilesClick);
    const elSizeThreshold = document.getElementById('vectors_size_threshold');
    if (elSizeThreshold) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elSizeThreshold.value = settings.size_threshold;
        elSizeThreshold.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.size_threshold = Number(elSizeThreshold.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elChunkSize = document.getElementById('vectors_chunk_size');
    if (elChunkSize) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elChunkSize.value = settings.chunk_size;
        elChunkSize.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.chunk_size = Number(elChunkSize.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elChunkCount = document.getElementById('vectors_chunk_count');
    if (elChunkCount) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elChunkCount.value = settings.chunk_count;
        elChunkCount.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.chunk_count = Number(elChunkCount.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elIncludeWi = document.getElementById('vectors_include_wi');
    if (elIncludeWi) {
        // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
        elIncludeWi.checked = settings.include_wi;
        elIncludeWi.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
            settings.include_wi = !!elIncludeWi.checked;
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elSummarize = document.getElementById('vectors_summarize');
    if (elSummarize) {
        // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
        elSummarize.checked = settings.summarize;
        elSummarize.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
            settings.summarize = !!elSummarize.checked;
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elSummarizeUser = document.getElementById('vectors_summarize_user');
    if (elSummarizeUser) {
        // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
        elSummarizeUser.checked = settings.summarize_sent;
        elSummarizeUser.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
            settings.summarize_sent = !!elSummarizeUser.checked;
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elSummarySource = document.getElementById('vectors_summary_source');
    if (elSummarySource) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elSummarySource.value = settings.summary_source;
        elSummarySource.addEventListener('change', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.summary_source = String(elSummarySource.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elSummaryPrompt = document.getElementById('vectors_summary_prompt');
    if (elSummaryPrompt) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elSummaryPrompt.value = settings.summary_prompt;
        elSummaryPrompt.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.summary_prompt = String(elSummaryPrompt.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elSummaryRetries = document.getElementById('vectors_summary_retries');
    if (elSummaryRetries) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elSummaryRetries.value = settings.summary_retries;
        elSummaryRetries.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            const parsed = Number(elSummaryRetries.value);
            settings.summary_retries = Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elSummaryThreshold = document.getElementById('vectors_summary_threshold');
    if (elSummaryThreshold) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elSummaryThreshold.value = settings.summary_threshold;
        elSummaryThreshold.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            const parsed = Number(elSummaryThreshold.value);
            settings.summary_threshold = Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elMsgChunkSize = document.getElementById('vectors_message_chunk_size');
    if (elMsgChunkSize) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elMsgChunkSize.value = settings.message_chunk_size;
        elMsgChunkSize.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.message_chunk_size = Number(elMsgChunkSize.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elSizeThresholdDb = document.getElementById('vectors_size_threshold_db');
    if (elSizeThresholdDb) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elSizeThresholdDb.value = settings.size_threshold_db;
        elSizeThresholdDb.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.size_threshold_db = Number(elSizeThresholdDb.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elChunkSizeDb = document.getElementById('vectors_chunk_size_db');
    if (elChunkSizeDb) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elChunkSizeDb.value = settings.chunk_size_db;
        elChunkSizeDb.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.chunk_size_db = Number(elChunkSizeDb.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elChunkCountDb = document.getElementById('vectors_chunk_count_db');
    if (elChunkCountDb) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elChunkCountDb.value = settings.chunk_count_db;
        elChunkCountDb.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.chunk_count_db = Number(elChunkCountDb.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elOverlapPercent = document.getElementById('vectors_overlap_percent');
    if (elOverlapPercent) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elOverlapPercent.value = settings.overlap_percent;
        elOverlapPercent.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.overlap_percent = Number(elOverlapPercent.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elOverlapPercentDb = document.getElementById('vectors_overlap_percent_db');
    if (elOverlapPercentDb) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elOverlapPercentDb.value = settings.overlap_percent_db;
        elOverlapPercentDb.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.overlap_percent_db = Number(elOverlapPercentDb.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elFileTemplateDb = document.getElementById('vectors_file_template_db');
    if (elFileTemplateDb) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elFileTemplateDb.value = settings.file_template_db;
        elFileTemplateDb.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.file_template_db = String(elFileTemplateDb.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const filePosInputs = document.querySelectorAll('input[name="vectors_file_position_db"]');
    // @ts-expect-error TS(2339): Property 'value' does not exist on type 'Element'.
    filePosInputs.forEach(input => { if (String(input.value) === String(settings.file_position_db)) input.checked = true; });
    filePosInputs.forEach(input => input.addEventListener('change', () => {
        const checked = document.querySelector('input[name="vectors_file_position_db"]:checked');
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'Element'.
        settings.file_position_db = Number(checked?.value ?? settings.file_position_db);
        Object.assign(extension_settings.vectors, settings);
        saveSettingsDebounced();
    }));
    const elFileDepthDb = document.getElementById('vectors_file_depth_db');
    if (elFileDepthDb) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elFileDepthDb.value = settings.file_depth_db;
        elFileDepthDb.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.file_depth_db = Number(elFileDepthDb.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elFileDepthRoleDb = document.getElementById('vectors_file_depth_role_db');
    if (elFileDepthRoleDb) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elFileDepthRoleDb.value = settings.file_depth_role_db;
        elFileDepthRoleDb.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.file_depth_role_db = Number(elFileDepthRoleDb.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elTranslate = document.getElementById('vectors_translate_files');
    if (elTranslate) {
        // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
        elTranslate.checked = settings.translate_files;
        elTranslate.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
            settings.translate_files = !!elTranslate.checked;
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elWorldInfo = document.getElementById('vectors_enabled_world_info');
    if (elWorldInfo) {
        // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
        elWorldInfo.checked = settings.enabled_world_info;
        elWorldInfo.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
            settings.enabled_world_info = !!elWorldInfo.checked;
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
            toggleSettings();
        });
    }
    const elEnabledForAll = document.getElementById('vectors_enabled_for_all');
    if (elEnabledForAll) {
        // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
        elEnabledForAll.checked = settings.enabled_for_all;
        elEnabledForAll.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
            settings.enabled_for_all = !!elEnabledForAll.checked;
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elMaxEntries = document.getElementById('vectors_max_entries');
    if (elMaxEntries) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elMaxEntries.value = settings.max_entries;
        elMaxEntries.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.max_entries = Number(elMaxEntries.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elScoreThreshold = document.getElementById('vectors_score_threshold');
    if (elScoreThreshold) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elScoreThreshold.value = settings.score_threshold;
        elScoreThreshold.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.score_threshold = Number(elScoreThreshold.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elForceDelim = document.getElementById('vectors_force_chunk_delimiter');
    if (elForceDelim) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elForceDelim.value = settings.force_chunk_delimiter;
        elForceDelim.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.force_chunk_delimiter = String(elForceDelim.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    const elCustomBoundary = document.getElementById('vectors_only_custom_boundary');
    if (elCustomBoundary) {
        // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
        elCustomBoundary.checked = settings.only_custom_boundary;
        elCustomBoundary.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'checked' does not exist on type 'HTMLEle... Remove this comment to see the full error message
            settings.only_custom_boundary = !!elCustomBoundary.checked;
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    document.getElementById('vectors_ollama_pull')?.addEventListener('click', (e) => {
        // @ts-expect-error TS(2339): Property 'ollama_model' does not exist on type '{}... Remove this comment to see the full error message
        const presetModel = extension_settings.vectors.ollama_model || '';
        e.preventDefault();
        const ollamaBtn = document.getElementById('ollama_download_model');
        if (ollamaBtn) ollamaBtn.click();
        const dialogueInput = document.getElementById('dialogue_popup_input');
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        if (dialogueInput) dialogueInput.value = presetModel;
    });
    document.getElementById('vectors_webllm_install')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (Object.hasOwn(SillyTavern, 'llm')) {
            notyf.info('WebLLM is already installed');
            return;
        }
        openThirdPartyExtensionMenu('https://github.com/SillyTavern/Extension-WebLLM');
    });
    const elWebllmModel = document.getElementById('vectors_webllm_model');
    if (elWebllmModel) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elWebllmModel.value = settings.webllm_model;
        elWebllmModel.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.webllm_model = String(elWebllmModel.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }
    document.getElementById('vectors_webllm_load')?.addEventListener('click', async () => {
        if (!settings.webllm_model) return;
        await webllmProvider.loadModel(settings.webllm_model);
        notyf.success('WebLLM model loaded');
    });
    const elGoogleModel = document.getElementById('vectors_google_model');
    if (elGoogleModel) {
        // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
        elGoogleModel.value = settings.google_model;
        elGoogleModel.addEventListener('input', () => {
            // @ts-expect-error TS(2339): Property 'value' does not exist on type 'HTMLEleme... Remove this comment to see the full error message
            settings.google_model = String(elGoogleModel.value);
            Object.assign(extension_settings.vectors, settings);
            saveSettingsDebounced();
        });
    }

    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    $('#api_key_nomicai').toggleClass('success', !!secret_state[SECRET_KEYS.NOMICAI]);
    [event_types.SECRET_WRITTEN, event_types.SECRET_DELETED, event_types.SECRET_ROTATED].forEach(event => {
        eventSource.on(event, (/** @type {string} */ key: any) => {
            if (key !== SECRET_KEYS.NOMICAI) return;
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            $('#api_key_nomicai').toggleClass('success', !!secret_state[SECRET_KEYS.NOMICAI]);
        });
    });

    toggleSettings();
    eventSource.on(event_types.MESSAGE_DELETED, onChatEvent);
    eventSource.on(event_types.MESSAGE_EDITED, onChatEvent);
    eventSource.on(event_types.MESSAGE_SENT, onChatEvent);
    eventSource.on(event_types.MESSAGE_RECEIVED, onChatEvent);
    eventSource.on(event_types.MESSAGE_SWIPED, onChatEvent);
    eventSource.on(event_types.CHAT_DELETED, purgeVectorIndex);
    eventSource.on(event_types.GROUP_CHAT_DELETED, purgeVectorIndex);
    eventSource.on(event_types.FILE_ATTACHMENT_DELETED, purgeFileVectorIndex);
    eventSource.on(event_types.EXTENSION_SETTINGS_LOADED, async (manifest: any) => {
        if (settings.source === 'webllm' && manifest?.display_name === 'WebLLM') {
            await loadWebLlmModels();
        }
    });

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'db-ingest',
        callback: async () => {
            // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
            await ingestDataBankAttachments();
            return '';
        },
        aliases: ['databank-ingest', 'data-bank-ingest'],
        helpString: 'Force the ingestion of all Data Bank attachments.',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'db-purge',
        callback: async () => {
            const dataBank = getDataBankAttachments();

            for (const file of dataBank) {
                await purgeFileVectorIndex(file.url);
            }

            return '';
        },
        aliases: ['databank-purge', 'data-bank-purge'],
        helpString: 'Purge the vector index for all Data Bank attachments.',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'db-search',
        callback: async (args: any, query: any) => {
            const clamp = (v: any) => Number.isNaN(v) ? null : Math.min(1, Math.max(0, v));
            const threshold = clamp(Number(args?.threshold ?? settings.score_threshold));
            const validateCount = (v: any) => Number.isNaN(v) || !Number.isInteger(v) || v < 1 ? null : v;
            const count = validateCount(Number(args?.count)) ?? settings.chunk_count_db;
            const source = String(args?.source ?? '');
            const attachments = source ? getDataBankAttachmentsForSource(source, false) : getDataBankAttachments(false);
            const collectionIds = await ingestDataBankAttachments(String(source));
            const queryResults = await queryMultipleCollections(collectionIds, String(query), count, threshold);

            // Get URLs
            const urls = Object
                .keys(queryResults)
                .map(x => attachments.find((y: any) => getFileCollectionId(y.url) === x))
                .filter(x => x)
                .map(x => x.url);

            // Gets the actual text content of chunks
            const getChunksText = () => {
                let textResult = '';
                for (const collectionId in queryResults) {
                    const metadata = queryResults[collectionId].metadata?.filter((x: any) => x.text)?.sort((a: any, b: any) => a.index - b.index)?.map((x: any) => x.text)?.filter(onlyUnique) || [];
                    textResult += metadata.join('\n') + '\n\n';
                }
                return textResult;
            };
            if (args.return === 'chunks') {
                return getChunksText();
            }

            // @ts-ignore
            return slashCommandReturnHelper.doReturn(args.return ?? 'object', urls, { objectToStringFunc: list => list.join('\n') });
        },
        aliases: ['databank-search', 'data-bank-search'],
        helpString: 'Search the Data Bank for a specific query using vector similarity. Returns a list of file URLs with the most relevant content.',
        namedArgumentList: [
            // @ts-expect-error TS(2345): Argument of type '""' is not assignable to paramet... Remove this comment to see the full error message
            new SlashCommandNamedArgument('threshold', 'Threshold for the similarity score in the [0, 1] range. Uses the global config value if not set.', ARGUMENT_TYPE.NUMBER, false, false, ''),
            // @ts-expect-error TS(2345): Argument of type '""' is not assignable to paramet... Remove this comment to see the full error message
            new SlashCommandNamedArgument('count', 'Maximum number of query results to return.', ARGUMENT_TYPE.NUMBER, false, false, ''),
            // @ts-expect-error TS(2345): Argument of type '""' is not assignable to paramet... Remove this comment to see the full error message
            new SlashCommandNamedArgument('source', 'Optional filter for the attachments by source.', ARGUMENT_TYPE.STRING, false, false, '', ['global', 'character', 'chat']),
            SlashCommandNamedArgument.fromProps({
                name: 'return',
                description: 'How you want the return value to be provided',
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'object',
                enumList: [
                    // @ts-expect-error TS(2345): Argument of type '"Return the actual content chunk... Remove this comment to see the full error message
                    new SlashCommandEnumValue('chunks', 'Return the actual content chunks', enumTypes.enum, '{}'),
                    ...slashCommandReturnHelper.enumList({ allowObject: true }),
                ],
                forceEnum: true,
            }),
        ],
        unnamedArgumentList: [
            new SlashCommandArgument('Query to search by.', ARGUMENT_TYPE.STRING, true, false),
        ],
        returns: ARGUMENT_TYPE.LIST,
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'vector-threshold',
        helpString: 'Set the vector score threshold or return the current threshold if no argument is provided.',
        returns: 'score threshold value',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Score threshold (number).',
                typeList: [ARGUMENT_TYPE.NUMBER],
            }),
        ],
        callback: async (_args: any, value: any) => {
            const raw = String(value ?? '').trim();
            if (!raw) {
                return String(settings.score_threshold);
            }

            const parsed = Number(raw);
            if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
                notyf.warning('Score threshold must be a number between 0 and 1.');
                return '';
            }

            $('#vectors_score_threshold')
                .val(parsed);
            document.getElementById('vectors_score_threshold')?.dispatchEvent(new Event('input'));

            return String(settings.score_threshold);
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'vector-query',
        helpString: 'Set the vector query messages or returns the current query messages count if no argument is provided',
        returns: 'the query messages value',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Query messages (number > 0).',
                typeList: [ARGUMENT_TYPE.NUMBER],
            }),
        ],
        callback: async (_args: any, value: any) => {
            const raw = String(value ?? '').trim();
            if (!raw) {
                return String(settings.query);
            }

            const parsed = Number(raw);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                notyf.warning('Query messages must be a number greater than 0.');
                return '';
            }

            $('#vectors_query')
                .val(parsed);
            document.getElementById('vectors_query')?.dispatchEvent(new Event('input'));

            return String(settings.query);
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'vector-max-entries',
        helpString: 'Set the vector world info max entries or returns the current max entries if no argument is provided',
        returns: 'world info max entries',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Max entries (number > 0).',
                typeList: [ARGUMENT_TYPE.NUMBER],
            }),
        ],
        callback: async (_args: any, value: any) => {
            const raw = String(value ?? '').trim();
            if (!raw) {
                return String(settings.max_entries);
            }

            const parsed = Number(raw);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                notyf.warning('Max entries must be a number greater than 0.');
                return '';
            }

            $('#vectors_max_entries')
                .val(parsed);
            document.getElementById('vectors_max_entries')?.dispatchEvent(new Event('input'));

            return String(settings.max_entries);
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'vector-chats-state',
        helpString: 'Set whether chat vectorization is enabled or return the current boolean if no argument is provided',
        returns: 'boolean for if chat vectorization is enabled',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'boolean to set whether chat vectorization is enabled',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                enumList: commonEnumProviders.boolean('trueFalse')(),
            }),
        ],
        callback: async (_args: any, value: any) => {
            const raw = String(value ?? '').trim();
            if (!raw) {
                return String(settings.enabled_chats);
            }

            const parsed = isTrueBoolean(raw);
            $('#vectors_enabled_chats')
                .prop('checked', parsed);
            document.getElementById('vectors_enabled_chats')?.dispatchEvent(new Event('input'));

            return String(settings.enabled_chats);
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'vector-files-state',
        helpString: 'Set whether file vectorization is enabled or return the current boolean if no argument is provided',
        returns: 'boolean for if file vectorization is enabled',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'boolean to set whether file vectorization is enabled',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                enumList: commonEnumProviders.boolean('trueFalse')(),
            }),
        ],
        callback: async (_args: any, value: any) => {
            const raw = String(value ?? '').trim();
            if (!raw) {
                return String(settings.enabled_files);
            }

            const parsed = isTrueBoolean(raw) ;
            $('#vectors_enabled_files')
                .prop('checked', parsed);
            document.getElementById('vectors_enabled_files')?.dispatchEvent(new Event('input'));

            return String(settings.enabled_files);
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'vector-worldinfo-state',
        helpString: 'Set whether world info vectorization is enabled or return the current boolean if no argument is provided',
        returns: 'boolean for if world info vectorization is enabled',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'boolean to set whether world info vectorization is enabled',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                enumList: commonEnumProviders.boolean('trueFalse')(),
            }),
        ],
        callback: async (_args: any, value: any) => {
            const raw = String(value ?? '').trim();
            if (!raw) {
                return String(settings.enabled_world_info);
            }

            const parsed = isTrueBoolean(raw);
            $('#vectors_enabled_world_info')
                .prop('checked', parsed);
            document.getElementById('vectors_enabled_world_info')?.dispatchEvent(new Event('input'));

            return String(settings.enabled_world_info);
        },
    }));

    registerDebugFunction('purge-everything', 'Purge all vector indices', 'Obliterate all stored vectors for all sources. No mercy.', async () => {
        if (!confirm('Are you sure?')) {
            return;
        }
        await purgeAllVectorIndexes();
    });
}
