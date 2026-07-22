import path from 'node:path';
import fs from 'node:fs';

import vectra from 'vectra';
import express from 'express';
import sanitize from 'sanitize-filename';

const registry: Record<string, () => Promise<unknown>> = {
    nomicai: () => import('../vectors/nomicai-vectors.js'),
    openai: () => import('../vectors/openai-vectors.js'),
    mistral: () => import('../vectors/openai-vectors.js'),
    togetherai: () => import('../vectors/openai-vectors.js'),
    electronhub: () => import('../vectors/openai-vectors.js'),
    openrouter: () => import('../vectors/openai-vectors.js'),
    chutes: () => import('../vectors/openai-vectors.js'),
    nanogpt: () => import('../vectors/openai-vectors.js'),
    siliconflow: () => import('../vectors/openai-vectors.js'),
    workers_ai: () => import('../vectors/openai-vectors.js'),
    extras: () => import('../vectors/extras-vectors.js'),
    palm: () =>
        import('../vectors/google-vectors.js').then((m) => ({
            getVector: m.getMakerSuiteVector,
            getBatchVector: m.getMakerSuiteBatchVector,
        })),
    vertexai: () =>
        import('../vectors/google-vectors.js').then((m) => ({
            getVector: m.getVertexVector,
            getBatchVector: m.getVertexBatchVector,
        })),
    cohere: () => import('../vectors/cohere-vectors.js'),
    llamacpp: () => import('../vectors/llamacpp-vectors.js'),
    vllm: () => import('../vectors/vllm-vectors.js'),
    ollama: () => import('../vectors/ollama-vectors.js'),
};

// Don't forget to add new sources to the SOURCES array
const SOURCES = [
    'mistral',
    'openai',
    'extras',
    'palm',
    'togetherai',
    'nomicai',
    'cohere',
    'ollama',
    'llamacpp',
    'vllm',
    'webllm',
    'koboldcpp',
    'vertexai',
    'electronhub',
    'openrouter',
    'chutes',
    'nanogpt',
    'siliconflow',
    'workers_ai',
];

interface SourceSettings {
    model?: string;
    apiUrl?: string;
    keep?: boolean;
    extrasUrl?: string;
    extrasKey?: string;
    request?: express.Request;
    embeddings?: Record<string, number[]>;
    urlOverride?: string | null;
}

/**
 * Gets the vector for the given text from the given source.
 * @param {string} source - The source of the vector
 * @param {object} sourceSettings - Settings for the source, if it needs any
 * @param {string} text - The text to get the vector for
 * @param {boolean} isQuery - If the text is a query for embedding search
 * @param {import('../users.js').UserDirectoryList} directories - The directories object for the user
 * @returns {Promise<number[]>} - The vector for the text
 */
async function getVector(
    source: string,
    sourceSettings: SourceSettings,
    text: string,
    isQuery: boolean,
    directories: import('../users.js').UserDirectoryList,
) {
    if (source === 'webllm' || source === 'koboldcpp') {
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        return sourceSettings.embeddings[text];
    }

    const providerLoader = registry[source];
    if (!providerLoader) {
        throw new Error(`Unknown vector source ${source}`);
    }

    const provider = await providerLoader();

    switch (source) {
        case 'nomicai':
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            return provider.getVector(text, source, directories);
        case 'togetherai':
        case 'mistral':
        case 'openai':
        case 'electronhub':
        case 'openrouter':
        case 'chutes':
        case 'nanogpt':
        case 'siliconflow':
        case 'workers_ai':
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            return provider.getVector(
                text,
                source,
                directories,
                sourceSettings.model,
                sourceSettings.urlOverride,
            );
        case 'extras':
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            return provider.getVector(text, sourceSettings.extrasUrl, sourceSettings.extrasKey);
        case 'palm':
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            return provider.getVector(text, sourceSettings.model, sourceSettings.request);
        case 'vertexai':
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            return provider.getVector(text, sourceSettings.model, sourceSettings.request);
        case 'cohere':
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            return provider.getVector(text, isQuery, directories, sourceSettings.model);
        case 'llamacpp':
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            return provider.getVector(text, sourceSettings.apiUrl, directories);
        case 'vllm':
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            return provider.getVector(
                text,
                sourceSettings.apiUrl,
                sourceSettings.model,
                directories,
            );
        case 'ollama':
            // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
            return provider.getVector(
                text,
                sourceSettings.apiUrl,
                sourceSettings.model,
                sourceSettings.keep,
                directories,
            );
    }

    throw new Error(`Unknown vector source ${source}`);
}

/**
 * Gets the vector for the given text batch from the given source.
 * @param {string} source - The source of the vector
 * @param {object} sourceSettings - Settings for the source, if it needs any
 * @param {string[]} texts - The array of texts to get the vector for
 * @param {boolean} isQuery - If the text is a query for embedding search
 * @param {import('../users.js').UserDirectoryList} directories - The directories object for the user
 * @returns {Promise<number[][]>} - The array of vectors for the texts
 */
async function getBatchVector(
    source: string,
    sourceSettings: SourceSettings,
    texts: string[],
    isQuery: boolean,
    directories: import('../users.js').UserDirectoryList,
) {
    const batchSize = 10;
    const batches = Array(Math.ceil(texts.length / batchSize))
        .fill(undefined)
        .map((_, i) => texts.slice(i * batchSize, i * batchSize + batchSize));

    const results = [];
    for (const batch of batches) {
        if (source === 'webllm' || source === 'koboldcpp') {
            results.push(...texts.map((x: string) => sourceSettings.embeddings![x]));
            // Note: Since webllm/koboldcpp don't use batches, we only need to do this once.
            // However, to keep the loop structure, I'll just return results early.
            return results;
        }

        const providerLoader = registry[source];
        if (!providerLoader) {
            throw new Error(`Unknown vector source ${source}`);
        }

        const provider = await providerLoader();

        switch (source) {
            case 'nomicai':
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                results.push(...(await provider.getBatchVector(batch, source, directories)));
                break;
            case 'togetherai':
            case 'mistral':
            case 'openai':
            case 'electronhub':
            case 'openrouter':
            case 'chutes':
            case 'nanogpt':
            case 'siliconflow':
            case 'workers_ai':
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                results.push(
                    ...(await provider.getBatchVector(
                        batch,
                        source,
                        directories,
                        sourceSettings.model,
                        sourceSettings.urlOverride,
                    )),
                );
                break;
            case 'extras':
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                results.push(
                    ...(await provider.getBatchVector(
                        batch,
                        sourceSettings.extrasUrl,
                        sourceSettings.extrasKey,
                    )),
                );
                break;
            case 'palm':
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                results.push(
                    ...(await provider.getBatchVector(
                        batch,
                        sourceSettings.model,
                        sourceSettings.request,
                    )),
                );
                break;
            case 'vertexai':
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                results.push(
                    ...(await provider.getBatchVector(
                        batch,
                        sourceSettings.model,
                        sourceSettings.request,
                    )),
                );
                break;
            case 'cohere':
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                results.push(
                    ...(await provider.getBatchVector(
                        batch,
                        isQuery,
                        directories,
                        sourceSettings.model,
                    )),
                );
                break;
            case 'llamacpp':
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                results.push(
                    ...(await provider.getBatchVector(batch, sourceSettings.apiUrl, directories)),
                );
                break;
            case 'vllm':
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                results.push(
                    ...(await provider.getBatchVector(
                        batch,
                        sourceSettings.apiUrl,
                        sourceSettings.model,
                        directories,
                    )),
                );
                break;
            case 'ollama':
                // @ts-expect-error TS(2571) FIXME: Object is of type 'unknown'.
                results.push(
                    ...(await provider.getBatchVector(
                        batch,
                        sourceSettings.apiUrl,
                        sourceSettings.model,
                        sourceSettings.keep,
                        directories,
                    )),
                );
                break;
            default:
                throw new Error(`Unknown vector source ${source}`);
        }
    }

    return results;
}

/**
 * Extracts settings for the vectorization sources from the HTTP request headers.
 * @param {string} source - Which source to extract settings for.
 * @param {object} request - The HTTP request object.
 * @returns {object} - An object that can be used as `sourceSettings` in functions that take that parameter.
 */
function getSourceSettings(source: string, request: express.Request): SourceSettings {
    switch (source) {
        case 'togetherai':
            return {
                model: String(request.body.model),
            };
        case 'openai':
            return {
                model: String(request.body.model),
            };
        case 'electronhub':
            return {
                model: String(request.body.model || 'text-embedding-3-small'),
            };
        case 'openrouter':
            return {
                model: String(request.body.model) || 'openai/text-embedding-3-large',
            };
        case 'cohere':
            return {
                model: String(request.body.model),
            };
        case 'llamacpp':
            return {
                apiUrl: String(request.body.apiUrl),
            };
        case 'vllm':
            return {
                apiUrl: String(request.body.apiUrl),
                model: String(request.body.model),
            };
        case 'ollama':
            return {
                apiUrl: String(request.body.apiUrl),
                model: String(request.body.model),
                keep: Boolean(request.body.keep),
            };
        case 'extras':
            return {
                extrasUrl: String(request.body.extrasUrl),
                extrasKey: String(request.body.extrasKey),
            };
        case 'palm':
        case 'vertexai':
            return {
                model: String(request.body.model || 'text-embedding-005'),
                request: request, // Pass the request object to get API key and URL
            };
        case 'mistral':
            return {
                model: 'mistral-embed',
            };
        case 'nomicai':
            return {
                model: 'nomic-embed-text-v1.5',
            };
        case 'webllm':
            return {
                model: String(request.body.model),
                embeddings: request.body.embeddings ?? {},
            };
        case 'koboldcpp':
            return {
                model: String(request.body.model),
                embeddings: request.body.embeddings ?? {},
            };
        case 'chutes':
            return {
                model: String(request.body.model || 'chutes-qwen-qwen3-embedding-8b'),
            };
        case 'nanogpt':
            return {
                model: String(request.body.model || 'text-embedding-3-small'),
            };
        case 'siliconflow':
            return {
                model: String(request.body.model || 'Qwen/Qwen3-Embedding-0.6B'),
                urlOverride:
                    request.body.siliconflow_endpoint === 'cn'
                        ? 'https://api.siliconflow.cn/v1'
                        : null,
            };
        case 'workers_ai': {
            const accountId = String(request.body.workers_ai_account_id || '').trim();
            return {
                model: String(request.body.model || '@cf/baai/bge-m3'),
                urlOverride: accountId
                    ? `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1`
                    : null,
            };
        }
        default:
            return {};
    }
}

/**
 * Gets the model scope for the source.
 * @param {object} sourceSettings - The settings for the source
 * @returns {string} The model scope for the source
 */
function getModelScope(sourceSettings: SourceSettings) {
    return sourceSettings?.model || '';
}

/**
 * Gets the index for the vector collection
 * @param {import('../users.js').UserDirectoryList} directories - User directories
 * @param {string} collectionId - The collection ID
 * @param {string} source - The source of the vector
 * @param {object} sourceSettings - The model for the source
 * @returns {Promise<vectra.LocalIndex>} - The index for the collection
 */
async function getIndex(
    directories: import('../users.js').UserDirectoryList,
    collectionId: string,
    source: string,
    sourceSettings: SourceSettings,
) {
    const model = getModelScope(sourceSettings);
    const pathToFile = path.join(
        directories.vectors,
        sanitize(source),
        sanitize(collectionId),
        sanitize(model),
    );
    const store = new vectra.LocalIndex(pathToFile);

    if (!(await store.isIndexCreated())) {
        await store.createIndex();
    }

    return store;
}

/**
 * Inserts items into the vector collection
 * @param {import('../users.js').UserDirectoryList} directories - User directories
 * @param {string} collectionId - The collection ID
 * @param {string} source - The source of the vector
 * @param {object} sourceSettings - Settings for the source, if it needs any
 * @param {{ hash: number; text: string; index: number; }[]} items - The items to insert
 */
async function insertVectorItems(
    directories: import('../users.js').UserDirectoryList,
    collectionId: string,
    source: string,
    sourceSettings: SourceSettings,
    items: { hash: number; text: string; index: number }[],
) {
    const store = await getIndex(directories, collectionId, source, sourceSettings);

    await store.beginUpdate();

    const vectors = await getBatchVector(
        source,
        sourceSettings,
        items.map((x) => x.text),
        false,
        directories,
    );

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const vector = vectors[i];
        // @ts-expect-error TS(2532) FIXME: Object is possibly 'undefined'.
        await store.upsertItem({
            vector: vector,
            metadata: { hash: item.hash, text: item.text, index: item.index },
        });
    }

    await store.endUpdate();
}

/**
 * Gets the hashes of the items in the vector collection
 * @param {import('../users.js').UserDirectoryList} directories - User directories
 * @param {string} collectionId - The collection ID
 * @param {string} source - The source of the vector
 * @param {object} sourceSettings - Settings for the source, if it needs any
 * @returns {Promise<number[]>} - The hashes of the items in the collection
 */
async function getSavedHashes(
    directories: import('../users.js').UserDirectoryList,
    collectionId: string,
    source: string,
    sourceSettings: SourceSettings,
) {
    const store = await getIndex(directories, collectionId, source, sourceSettings);

    const items = await store.listItems();
    const hashes = items.map((x) => Number(x.metadata.hash));

    return hashes;
}

/**
 * Deletes items from the vector collection by hash
 * @param {import('../users.js').UserDirectoryList} directories - User directories
 * @param {string} collectionId - The collection ID
 * @param {string} source - The source of the vector
 * @param {object} sourceSettings - Settings for the source, if it needs any
 * @param {number[]} hashes - The hashes of the items to delete
 */
async function deleteVectorItems(
    directories: import('../users.js').UserDirectoryList,
    collectionId: string,
    source: string,
    sourceSettings: SourceSettings,
    hashes: number[],
) {
    const store = await getIndex(directories, collectionId, source, sourceSettings);
    const items = await store.listItemsByMetadata({ hash: { $in: hashes } });

    await store.beginUpdate();

    for (const item of items) {
        await store.deleteItem(item.id);
    }

    await store.endUpdate();
}

/**
 * Gets the hashes of the items in the vector collection that match the search text
 * @param {import('../users.js').UserDirectoryList} directories - User directories
 * @param {string} collectionId - The collection ID
 * @param {string} source - The source of the vector
 * @param {object} sourceSettings - Settings for the source, if it needs any
 * @param {string} searchText - The text to search for
 * @param {number} topK - The number of results to return
 * @param {number} threshold - The threshold for the search
 * @returns {Promise<{hashes: number[], metadata: object[]}>} - The metadata of the items that match the search text
 */
async function queryCollection(
    directories: import('../users.js').UserDirectoryList,
    collectionId: string,
    source: string,
    sourceSettings: SourceSettings,
    searchText: string,
    topK: number,
    threshold: number,
) {
    const store = await getIndex(directories, collectionId, source, sourceSettings);
    const vector = await getVector(source, sourceSettings, searchText, true, directories);

    const result = await store.queryItems(vector, '', topK);
    const metadata = result.filter((x) => x.score >= threshold).map((x) => x.item.metadata);
    const hashes = result.map((x) => Number(x.item.metadata.hash));
    return { metadata, hashes };
}

/**
 * Queries multiple collections for the given search queries. Returns the overall top K results.
 * @param {import('../users.js').UserDirectoryList} directories - User directories
 * @param {string[]} collectionIds - The collection IDs to query
 * @param {string} source - The source of the vector
 * @param {object} sourceSettings - Settings for the source, if it needs any
 * @param {string} searchText - The text to search for
 * @param {number} topK - The number of results to return
 * @param {number} threshold - The threshold for the search
 * @returns {Promise<Record<string, { hashes: number[], metadata: object[] }>>} - The top K results from each collection
 */
async function multiQueryCollection(
    directories: import('../users.js').UserDirectoryList,
    collectionIds: string[],
    source: string,
    sourceSettings: SourceSettings,
    searchText: string,
    topK: number,
    threshold: number,
) {
    const vector = await getVector(source, sourceSettings, searchText, true, directories);
    const results = [];

    for (const collectionId of collectionIds) {
        const store = await getIndex(directories, collectionId, source, sourceSettings);
        const result = await store.queryItems(vector, '', topK);
        results.push(...result.map((result) => ({ collectionId, result })));
    }

    // Sort results by descending similarity, apply threshold, and take top K
    const sortedResults = results
        .toSorted((a, b) => b.result.score - a.result.score)
        .filter((x) => x.result.score >= threshold)
        .slice(0, topK);

    /**
     * Group the results by collection ID
     * @type {Record<string, { hashes: number[], metadata: object[] }>}
     */
    const groupedResults = {};
    for (const result of sortedResults) {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        if (!groupedResults[result.collectionId]) {
            // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            groupedResults[result.collectionId] = { hashes: [], metadata: [] };
        }

        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        groupedResults[result.collectionId].hashes.push(Number(result.result.item.metadata.hash));
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        groupedResults[result.collectionId].metadata.push(result.result.item.metadata);
    }

    return groupedResults;
}

/**
 * Performs a request to regenerate the index if it is corrupted.
 * @param {import('express').Request} req Express request object
 * @param {import('express').Response} res Express response object
 * @param {Error} error Error object
 * @returns {Promise<import('express').Response>} Promise
 */
async function regenerateCorruptedIndexErrorHandler(
    req: express.Request,
    res: express.Response,
    error: unknown,
) {
    if (error instanceof SyntaxError && !req.query.regenerated) {
        const collectionId = String(req.body.collectionId);
        const source = String(req.body.source) || 'openai';
        const sourceSettings = getSourceSettings(source, req);

        if (collectionId && source) {
            const index = await getIndex(
                req.user.directories,
                collectionId,
                source,
                sourceSettings,
            );
            const exists = await index.isIndexCreated();

            if (exists) {
                const path = index.folderPath;
                console.warn(`Corrupted index detected at ${path}, regenerating...`);
                await index.deleteIndex();
                return res.redirect(307, req.originalUrl + '?regenerated=true');
            }
        }
    }

    console.error(error);
    return res.sendStatus(500);
}

export const router = express.Router();

router.post('/query', async (req, res) => {
    try {
        if (!req.body.collectionId || !req.body.searchText) {
            return res.sendStatus(400);
        }

        const collectionId = String(req.body.collectionId);
        const searchText = String(req.body.searchText);
        const topK = Number(req.body.topK) || 10;
        const threshold = Number(req.body.threshold) || 0.0;
        const source = String(req.body.source) || 'openai';
        const sourceSettings = getSourceSettings(source, req);

        const results = await queryCollection(
            req.user.directories,
            collectionId,
            source,
            sourceSettings,
            searchText,
            topK,
            threshold,
        );
        return res.json(results);
    } catch (error) {
        return regenerateCorruptedIndexErrorHandler(req, res, error);
    }
});

router.post('/query-multi', async (req, res) => {
    try {
        if (!Array.isArray(req.body.collectionIds) || !req.body.searchText) {
            return res.sendStatus(400);
        }

        const collectionIds = req.body.collectionIds.map((x: unknown) => String(x));
        const searchText = String(req.body.searchText);
        const topK = Number(req.body.topK) || 10;
        const threshold = Number(req.body.threshold) || 0.0;
        const source = String(req.body.source) || 'openai';
        const sourceSettings = getSourceSettings(source, req);

        const results = await multiQueryCollection(
            req.user.directories,
            collectionIds,
            source,
            sourceSettings,
            searchText,
            topK,
            threshold,
        );
        return res.json(results);
    } catch (error) {
        return regenerateCorruptedIndexErrorHandler(req, res, error);
    }
});

router.post('/insert', async (req, res) => {
    try {
        if (!Array.isArray(req.body.items) || !req.body.collectionId) {
            return res.sendStatus(400);
        }

        const collectionId = String(req.body.collectionId);
        const items = req.body.items.map((x: { hash: unknown; text: unknown; index: unknown }) => ({
            hash: x.hash,
            text: x.text,
            index: x.index,
        }));
        const source = String(req.body.source) || 'openai';
        const sourceSettings = getSourceSettings(source, req);

        await insertVectorItems(req.user.directories, collectionId, source, sourceSettings, items);
        return res.sendStatus(200);
    } catch (error) {
        return regenerateCorruptedIndexErrorHandler(req, res, error);
    }
});

router.post('/list', async (req, res) => {
    try {
        if (!req.body.collectionId) {
            return res.sendStatus(400);
        }

        const collectionId = String(req.body.collectionId);
        const source = String(req.body.source) || 'openai';
        const sourceSettings = getSourceSettings(source, req);

        const hashes = await getSavedHashes(
            req.user.directories,
            collectionId,
            source,
            sourceSettings,
        );
        return res.json(hashes);
    } catch (error) {
        return regenerateCorruptedIndexErrorHandler(req, res, error);
    }
});

router.post('/delete', async (req, res) => {
    try {
        if (!Array.isArray(req.body.hashes) || !req.body.collectionId) {
            return res.sendStatus(400);
        }

        const collectionId = String(req.body.collectionId);
        const hashes = req.body.hashes.map((x: unknown) => Number(x));
        const source = String(req.body.source) || 'openai';
        const sourceSettings = getSourceSettings(source, req);

        await deleteVectorItems(req.user.directories, collectionId, source, sourceSettings, hashes);
        return res.sendStatus(200);
    } catch (error) {
        return regenerateCorruptedIndexErrorHandler(req, res, error);
    }
});

router.post('/purge-all', async (req, res) => {
    try {
        for (const source of SOURCES) {
            const sourcePath = path.join(req.user.directories.vectors, sanitize(source));
            if (!fs.existsSync(sourcePath)) {
                continue;
            }
            await fs.promises.rm(sourcePath, { recursive: true });
            console.info(`Deleted vector source store at ${sourcePath}`);
        }

        return res.sendStatus(200);
    } catch (error) {
        console.error(error);
        return res.sendStatus(500);
    }
});

router.post('/purge', async (req, res) => {
    try {
        if (!req.body.collectionId) {
            return res.sendStatus(400);
        }

        const collectionId = String(req.body.collectionId);

        for (const source of SOURCES) {
            const sourcePath = path.join(
                req.user.directories.vectors,
                sanitize(source),
                sanitize(collectionId),
            );
            if (!fs.existsSync(sourcePath)) {
                continue;
            }
            await fs.promises.rm(sourcePath, { recursive: true });
            console.info(`Deleted vector index at ${sourcePath}`);
        }

        return res.sendStatus(200);
    } catch (error) {
        console.error(error);
        return res.sendStatus(500);
    }
});
