import { setAdditionalHeadersByType } from '../additional-headers.js';
import { TEXTGEN_TYPES } from '../constants.js';
import { trimV1 } from '../util.js';

interface VllmEmbeddingResponse {
    data: Array<{
        index: number;
        embedding: number[];
    }>;
}

/**
 * Gets the vector for the given text from VLLM
 * @param {string[]} texts - The array of texts to get the vectors for
 * @param {string} apiUrl - The API URL
 * @param {string} model - The model to use
 * @param {import('../users.js').UserDirectoryList} directories - The directories object for the user
 * @returns {Promise<number[][]>} - The array of vectors for the texts
 */
export async function getBatchVector(texts: string[], apiUrl: string, model: string, directories: import('../users.js').UserDirectoryList) {
    const url = new URL(trimV1(apiUrl) + '/v1/embeddings');

    const headers = {};
    setAdditionalHeadersByType(headers, TEXTGEN_TYPES.VLLM, apiUrl, directories);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
        body: JSON.stringify({ input: texts, model }),
    });

    if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`VLLM: Failed to get vector for text: ${response.statusText} ${responseText}`);
    }

    const data = await response.json() as VllmEmbeddingResponse;

    if (!Array.isArray(data?.data)) {
        throw new Error('API response was not an array');
    }

    // Sort data by x.index to ensure the order is correct
    data.data.sort((a, b) => a.index - b.index);

    const vectors = data.data.map((x) => x.embedding);
    return vectors;
}

/**
 * Gets the vector for the given text from VLLM
 * @param {string} text - The text to get the vector for
 * @param {string} apiUrl - The API URL
 * @param {string} model - The model to use
 * @param {import('../users.js').UserDirectoryList} directories - The directories object for the user
 * @returns {Promise<number[]>} - The vector for the text
 */
export async function getVector(text: string, apiUrl: string, model: string, directories: import('../users.js').UserDirectoryList) {
    const vectors = await getBatchVector([text], apiUrl, model, directories);
    return vectors[0];
}
