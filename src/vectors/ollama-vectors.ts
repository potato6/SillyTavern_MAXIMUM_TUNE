import { setAdditionalHeadersByType } from '../additional-headers.js';
import { TEXTGEN_TYPES } from '../constants.js';

type OllamaEmbeddingResponse = {
    embeddings: number[][];
};

/**
 * Gets the vector for the given text from Ollama
 * @param {string[]} texts - The array of texts to get the vectors for
 * @param {string} apiUrl - The API URL
 * @param {string} model - The model to use
 * @param {boolean} keep - Keep the model loaded in memory
 * @param {import('../users.js').UserDirectoryList} directories - The directories object for the user
 * @returns {Promise<number[][]>} - The array of vectors for the texts
 */
export async function getBatchVector(texts: string[], apiUrl: string, model: string, keep: boolean, directories: import('../users.js').UserDirectoryList): Promise<number[][]> {
    const url = new URL(apiUrl);
    url.pathname = '/api/embed';

    const headers = {};
    setAdditionalHeadersByType(headers, TEXTGEN_TYPES.OLLAMA, apiUrl, directories);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
        body: JSON.stringify({
            input: texts,
            model: model,
            keep_alive: keep ? -1 : undefined,
            truncate: true,
        }),
    });

    if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`Ollama: Failed to get batch vectors: ${response.statusText} ${responseText}`);
    }

    const data = await response.json() as OllamaEmbeddingResponse;

    if (!Array.isArray(data?.embeddings)) {
        throw new Error('API response was not an array');
    }

    return data.embeddings;
}

/**
 * Gets the vector for the given text from Ollama
 * @param {string} text - The text to get the vector for
 * @param {string} apiUrl - The API URL
 * @param {string} model - The model to use
 * @param {boolean} keep - Keep the model loaded in memory
 * @param {import('../users.js').UserDirectoryList} directories - The directories object for the user
 * @returns {Promise<number[]>} - The vector for the text
 */
export async function getVector(text: string, apiUrl: string, model: string, keep: boolean, directories: import('../users.js').UserDirectoryList): Promise<number[]> {
    const vectors = await getBatchVector([text], apiUrl, model, keep, directories);
    return vectors[0]!;
}
