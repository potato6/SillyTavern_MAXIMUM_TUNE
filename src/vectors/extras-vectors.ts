
/**
 * Gets the vector for the given text from SillyTavern-extras
 * @param {string[]} texts - The array of texts to get the vectors for
 * @param {string} apiUrl - The Extras API URL
 * @param {string} apiKey - The Extras API key, or empty string if API key not enabled
 * @returns {Promise<number[][]>} - The array of vectors for the texts
 */
export async function getBatchVector(texts: string[], apiUrl: string, apiKey: string): Promise<number[][]> {
    return getExtrasVectorImpl(texts, apiUrl, apiKey) as Promise<number[][]>;
}

/**
 * Gets the vector for the given text from SillyTavern-extras
 * @param {string} text - The text to get the vector for
 * @param {string} apiUrl - The Extras API URL
 * @param {string} apiKey - The Extras API key, or empty string if API key not enabled
 * @returns {Promise<number[]>} - The vector for the text
 */
export async function getVector(text: string, apiUrl: string, apiKey: string): Promise<number[]> {
    return getExtrasVectorImpl(text, apiUrl, apiKey) as Promise<number[]>;
}

/**
 * Gets the vector for the given text from SillyTavern-extras
 * @param {string|string[]} text - The text or texts to get the vector(s) for
 * @param {string} apiUrl - The Extras API URL
 * @param {string} apiKey - The Extras API key, or empty string if API key not enabled *
 * @returns {Promise<Array>} - The vector for a single text if input is string, or the array of vectors for multiple texts if input is string[]
 */
async function getExtrasVectorImpl(text: string | string[], apiUrl: string, apiKey: string): Promise<number[] | number[][]> {
    let url;
    try {
        url = new URL(apiUrl);
        url.pathname = '/api/embeddings/compute';
    } catch (error) {
        console.error('Failed to set up Extras API call:', error);
        console.debug('Extras API URL given was:', apiUrl);
        throw error;
    }

    const headers = {
        'Content-Type': 'application/json',
    };

    // Include the Extras API key, if enabled
    if (apiKey && apiKey.length > 0) {
        Object.assign(headers, {
            'Authorization': `Bearer ${apiKey}`,
        });
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            text: text,  // The backend accepts {string|string[]} for one or multiple text items, respectively.
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        console.warn('Extras request failed', response.statusText, text);
        throw new Error('Extras request failed');
    }

    const data = await response.json() as { embedding: number[] | number[][] };
    const vector = data.embedding;

    return vector;
}
