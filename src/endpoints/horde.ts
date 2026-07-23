import express from 'express';

import AIHorde from '@zeldafan0225/ai_horde';

import { getVersion, delay, Cache } from '../util.js';
import { readSecret, SECRET_KEYS } from './secrets.js';

// Local type aliases for @zeldafan0225/ai_horde
const ModelGenerationInputStableSamplers = undefined as any;
const ModelInterrogationFormTypes = { Captions: 'captions' } as any;
const HordeAsyncRequestStates = undefined as any;

const ANONYMOUS_KEY = '0000000000';
const HORDE_TEXT_MODEL_METADATA_URL =
    'https://raw.githubusercontent.com/db0/AI-Horde-text-model-reference/main/db.json';
const cache = new Cache(60 * 1000);
export const router = express.Router();

/**
 * Returns the AIHorde client agent.
 * @returns {Promise<string>} AIHorde client agent
 */
async function getClientAgent() {
    const version = await getVersion();
    return version?.agent || 'SillyTavern:UNKNOWN:Cohee#1207';
}

/**
 * Returns the AIHorde client.
 * @returns {Promise<AIHorde>} AIHorde client
 */
async function getHordeClient() {
    return new AIHorde({
        client_agent: await getClientAgent(),
    });
}

/**
 * Removes dirty no-no words from the prompt.
 * Taken verbatim from KAI Lite's implementation (AGPLv3).
 * https://github.com/LostRuins/lite.koboldai.net/blob/main/index.html#L7786C2-L7811C1
 * @param {string} prompt Prompt to sanitize
 * @returns {string} Sanitized prompt
 */
function sanitizeHordeImagePrompt(prompt: string) {
    if (!prompt) {
        return '';
    }

    //to avoid flagging from some image models, always swap these words
    prompt = prompt.replace(/\b(girl)\b/gim, 'woman');
    prompt = prompt.replace(/\b(boy)\b/gim, 'man');
    prompt = prompt.replace(/\b(girls)\b/gim, 'women');
    prompt = prompt.replace(/\b(boys)\b/gim, 'men');
    //always remove these high risk words from prompt, as they add little value to image gen while increasing the risk the prompt gets flagged
    prompt = prompt.replace(
        /\b(under.age|under.aged|underage|underaged|loli|pedo|pedophile|(\w+).year.old|(\w+).years.old|minor|prepubescent|minors|shota)\b/gim,
        '',
    );
    return prompt;
}

export { sanitizeHordeImagePrompt };

/**
 * Gets the raw text model list from the horde API.
 * @returns {Promise<import('../util.js').CacheEntry>} Raw text model metadata
 */
async function getRawTextModelMetadata() {
    const cacheKey = 'text_model_metadata';
    const cached = cache.get(cacheKey);
    if (cached) {
        return cached;
    }
    try {
        const response = await fetch(HORDE_TEXT_MODEL_METADATA_URL);
        if (!response.ok) {
            throw new Error('Failed to fetch text model metadata');
        }
        const data = await response.json();
        cache.set(cacheKey, data);
        return data;
    } catch (error) {
        console.error('Failed to fetch text model metadata', error);
        throw error;
    }
}

/**
 * Get available image generation models from the horde.
 * @param {import('express').Request} request Request object
 * @param {import('express').Response} response Response object
 */
router.post('/image-models', async (request, response) => {
    try {
        const hordeClient = await getHordeClient();
        const models = await hordeClient.getModels();
        return response.send(models);
    } catch (error: any) {
        console.error('Failed to get horde image models:', error);
        return response.sendStatus(500);
    }
});

/**
 * Interrogates an image against the horde.
 * @param {import('express').Request} request Request object
 * @param {import('express').Response} response Response object
 */
router.post('/interrogate', async (request, response) => {
    try {
        const hordeClient = await getHordeClient();
        const form = {
            source_image: request.body.image,
            forms: [
                {
                    name: ModelInterrogationFormTypes.Captions,
                },
            ],
        };
        const interrogation = await hordeClient.postAsyncInterrogate(form);
        return response.send(interrogation);
    } catch (error: any) {
        console.error('Failed to interrogate image:', error);
        return response.sendStatus(500);
    }
});

/**
 * Gets the interrogation status from the horde.
 * @param {import('express').Request} request Request object
 * @param {import('express').Response} response Response object
 */
router.post('/interrogate/status', async (request, response) => {
    try {
        const hordeClient = await getHordeClient();
        const id = request.body.id;
        const status = await hordeClient.getInterrogationStatus(id);
        return response.send(status);
    } catch (error: any) {
        console.error('Failed to get interrogation status:', error);
        return response.sendStatus(500);
    }
});

/**
 * Gets the shared key for the horde.
 * @param {import('express').Request} request Request object
 * @param {import('express').Response} response Response object
 */
router.post('/share', async (request, response) => {
    try {
        const hordeClient = await getHordeClient();
        const share = await hordeClient.getSharedKey();
        return response.send(share);
    } catch (error: any) {
        console.error('Failed to get horde share key:', error);
        return response.sendStatus(500);
    }
});

/**
 * Finds a user on the horde.
 * @param {import('express').Request} request Request object
 * @param {import('express').Response} response Response object
 */
router.post('/find-user', async (request, response) => {
    try {
        const hordeClient = await getHordeClient();
        const user = await hordeClient.findUser({ name: request.body.name });
        return response.send(user);
    } catch (error: any) {
        console.error('Failed to find user:', error);
        return response.sendStatus(500);
    }
});

export { AIHorde };
