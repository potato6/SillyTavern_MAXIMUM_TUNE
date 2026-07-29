import { Elysia } from 'elysia';
import AIHorde from '@zeldafan0225/ai_horde';

import { getVersion } from '../util.js';

// Local type aliases for @zeldafan0225/ai_horde
const ModelInterrogationFormTypes = { Captions: 'captions' } as any;

export const router = new Elysia({ prefix: '/api/horde', aot: false })
    /**
     * Get available image generation models from the horde.
     */
    .post('/image-models', async () => {
        try {
            const hordeClient = await getHordeClient();
            const models = await hordeClient.getModels();
            return models;
        } catch (error: any) {
            console.error('Failed to get horde image models:', error);
            return new Response(null, { status: 500 });
        }
    })
    /**
     * Interrogates an image against the horde.
     */
    .post('/interrogate', async (context) => {
        try {
            const body = context.body as Record<string, unknown>;
            const hordeClient = await getHordeClient();
            const form = {
                source_image: body.image,
                forms: [
                    {
                        name: ModelInterrogationFormTypes.Captions,
                    },
                ],
            };
            const interrogation = await hordeClient.postAsyncInterrogate(form);
            return interrogation;
        } catch (error: any) {
            console.error('Failed to interrogate image:', error);
            return new Response(null, { status: 500 });
        }
    })
    /**
     * Gets the interrogation status from the horde.
     */
    .post('/interrogate/status', async (context) => {
        try {
            const body = context.body as Record<string, unknown>;
            const hordeClient = await getHordeClient();
            const id = body.id;
            const status = await hordeClient.getInterrogationStatus(id);
            return status;
        } catch (error: any) {
            console.error('Failed to get interrogation status:', error);
            return new Response(null, { status: 500 });
        }
    })
    /**
     * Gets the shared key for the horde.
     */
    .post('/share', async () => {
        try {
            const hordeClient = await getHordeClient();
            const share = await hordeClient.getSharedKey();
            return share;
        } catch (error: any) {
            console.error('Failed to get horde share key:', error);
            return new Response(null, { status: 500 });
        }
    })
    /**
     * Finds a user on the horde.
     */
    .post('/find-user', async (context) => {
        try {
            const body = context.body as Record<string, unknown>;
            const hordeClient = await getHordeClient();
            const user = await hordeClient.findUser({ name: body.name });
            return user;
        } catch (error: any) {
            console.error('Failed to find user:', error);
            return new Response(null, { status: 500 });
        }
    });

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

export { AIHorde };
