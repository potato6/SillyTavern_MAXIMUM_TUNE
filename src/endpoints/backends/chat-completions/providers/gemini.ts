import util from 'node:util';
import { CHAT_COMPLETION_SOURCES, GEMINI_SAFETY, VERTEX_SAFETY } from '../../../../constants.js';
import { getConfigValue, forwardFetchResponse, tryParse } from '../../../../util.js';
import { convertGooglePrompt, getPromptNames, calculateGoogleBudgetTokens } from '../../../../prompt-converters.js';
import { readSecret, SECRET_KEYS } from '../../../secrets.js';
import { getVertexAIAuth, getProjectIdFromServiceAccount } from '../../../google.js';
import { createSocketAbortController } from '../../common/abort-controller.js';
import type { ChatProvider, ModelEntry } from '../types.js';

const API_MAKERSUITE = 'https://generativelanguage.googleapis.com';
const API_VERTEX_AI = 'https://us-central1-aiplatform.googleapis.com';

/* eslint-disable @typescript-eslint/no-explicit-any */

const provider: ChatProvider = {
    source: CHAT_COMPLETION_SOURCES.MAKERSUITE,
    secretKey: { id: 'MAKERSUITE', label: 'Google AI Studio', category: 'chat-completion' },
    endpoints: { chat: '', models: '/models' },
    capabilities: {
        supportsStreaming: true,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: true,
    },

    async chat(req, res): Promise<any> {
        const useVertexAi = req.body.chat_completion_source === CHAT_COMPLETION_SOURCES.VERTEXAI;
        const apiName = useVertexAi ? 'Google Vertex AI' : 'Google AI Studio';
        let apiUrl: URL;
        let apiKey: string | undefined;
        let authHeader: string;
        let authType: string;

        if (useVertexAi) {
            apiUrl = new URL(req.body.reverse_proxy || API_VERTEX_AI);
            try {
                const auth = await getVertexAIAuth(req);
                authHeader = auth.authHeader;
                authType = auth.authType;
                console.debug(`Using Vertex AI authentication type: ${authType}`);
            } catch (error: any) {
                console.warn(`${apiName} authentication failed: ${error.message}`);
                res.status(400).send({ error: true, message: error.message });
                return;
            }
        } else {
            apiUrl = new URL(req.body.reverse_proxy || API_MAKERSUITE);
            apiKey = req.body.reverse_proxy
                ? req.body.proxy_password
                : readSecret(req.user.directories, SECRET_KEYS.MAKERSUITE, req.body.secret_id);
            if (!req.body.reverse_proxy && !apiKey) {
                console.warn(`${apiName} API key is missing.`);
                res.status(400).send({ error: true });
                return;
            }
            authHeader = `Bearer ${apiKey}`;
            authType = 'api_key';
        }

        const model = String(req.body.model);
        const stream = Boolean(req.body.stream);
        const enableWebSearch = Boolean(req.body.enable_web_search);
        const requestImages = Boolean(req.body.request_images);
        const reasoningEffort = String(req.body.reasoning_effort);
        const includeReasoning = Boolean(req.body.include_reasoning);
        const aspectRatio = String(req.body.request_image_aspect_ratio);
        const imageSize = String(req.body.request_image_resolution);
        const isGemma3 = /gemma-3/.test(model);
        const isLearnLM = model.includes('learnlm');

        const responseMimeType = req.body.responseMimeType ?? (req.body.json_schema ? 'application/json' : undefined);
        const responseSchema = req.body.responseSchema ?? (req.body.json_schema ? req.body.json_schema.value : undefined);

        const generationConfig: Record<string, any> = {
            stopSequences: req.body.stop,
            candidateCount: 1,
            maxOutputTokens: req.body.max_tokens,
            temperature: req.body.temperature,
            topP: req.body.top_p,
            topK: req.body.top_k || undefined,
            responseMimeType,
            responseSchema,
            seed: req.body.seed,
        };

        const imageGenerationModels = [
            'gemini-2.0-flash-exp', 'gemini-2.0-flash-exp-image-generation',
            'gemini-2.0-flash-preview-image-generation', 'gemini-2.5-flash-image-preview',
            'gemini-2.5-flash-image', 'gemini-3-pro-image-preview', 'gemini-3.1-flash-image-preview',
        ];
        const isThinkingConfigModel = (m: string) => (/^gemini-2.5-(flash|pro)/.test(m) && !/-image(-preview)?$/.test(m)) || (/^gemini-3[.\d]*-(flash|pro)/.test(m));
        const isImageSizeModel = (m: string) => /^gemini-3/.test(m);
        const noSearchModels = ['gemini-2.0-flash-lite', 'gemini-2.0-flash-lite-001', 'gemini-2.0-flash-lite-preview-02-05', 'gemini-robotics-er-1.5-preview'];

        if (!Array.isArray(generationConfig.stopSequences) || !generationConfig.stopSequences.length) {
            delete generationConfig.stopSequences;
        }

        const enableImageModality = requestImages && imageGenerationModels.includes(model);
        if (enableImageModality) {
            generationConfig.responseModalities = ['text', 'image'];
            if (aspectRatio || imageSize) {
                generationConfig.imageConfig = {};
                if (imageSize && isImageSizeModel(model)) generationConfig.imageConfig.imageSize = imageSize;
                if (aspectRatio) generationConfig.imageConfig.aspectRatio = aspectRatio;
            }
        }

        const useSystemPrompt = !enableImageModality && !isGemma3 && req.body.use_sysprompt;
        const tools: any[] = [];
        const prompt = convertGooglePrompt(req.body.messages, model, useSystemPrompt, getPromptNames(req));
        const safetySettings = [...GEMINI_SAFETY, ...(useVertexAi ? VERTEX_SAFETY : [])];

        if (Array.isArray(req.body.tools) && req.body.tools.length > 0 && !enableImageModality && !isGemma3) {
            const functionDeclarations: any[] = [];
            const customTools: any[] = [];
            for (const tool of req.body.tools) {
                if (tool.type === 'function') {
                    if (tool.function.parameters?.$schema) delete tool.function.parameters.$schema;
                    if (tool.function.parameters?.properties && Object.keys(tool.function.parameters.properties).length === 0) {
                        delete tool.function.parameters;
                    }
                    functionDeclarations.push(tool.function);
                } else if (tool[tool.type]) {
                    customTools.push({ [tool.type]: tool[tool.type] });
                }
            }
            if (functionDeclarations.length > 0) tools.push({ function_declarations: functionDeclarations });
            if (functionDeclarations.length === 0 && customTools.length > 0) tools.push(...customTools);
        }

        if (enableWebSearch && !enableImageModality && !isGemma3 && !isLearnLM && !noSearchModels.includes(model)) {
            if (!tools.some((t: any) => t.function_declarations)) tools.push({ google_search: {} });
        }

        if (isThinkingConfigModel(model)) {
            const thinkingConfig: Record<string, any> = { includeThoughts: includeReasoning };
            const thinkingBudget = calculateGoogleBudgetTokens(generationConfig.maxOutputTokens, reasoningEffort, model);
            if (typeof thinkingBudget === 'number' && Number.isInteger(thinkingBudget)) thinkingConfig.thinkingBudget = thinkingBudget;
            if (typeof thinkingBudget === 'string' && thinkingBudget.length > 0) thinkingConfig.thinkingLevel = thinkingBudget;
            if (useVertexAi && thinkingBudget === 0 && thinkingConfig.includeThoughts) {
                console.info('Thinking budget is 0 but includeThoughts is true.');
                thinkingConfig.includeThoughts = false;
            }
            generationConfig.thinkingConfig = thinkingConfig;
        }

        const body: Record<string, any> = {
            contents: prompt.contents,
            safetySettings,
            generationConfig,
        };

        if (useSystemPrompt && Array.isArray(prompt.system_instruction.parts) && prompt.system_instruction.parts.length) {
            body.systemInstruction = prompt.system_instruction;
        }

        if (tools.length) {
            body.tools = tools;
            const toolChoice = req.body.tool_choice;
            let functionCallingConfig: any;
            if (typeof toolChoice === 'string') {
                switch (toolChoice) {
                    case 'none': functionCallingConfig = { mode: 'NONE' }; break;
                    case 'required': functionCallingConfig = { mode: 'ANY' }; break;
                    case 'auto': functionCallingConfig = { mode: 'AUTO' }; break;
                }
            } else if (typeof toolChoice === 'object' && toolChoice?.function?.name) {
                functionCallingConfig = { mode: 'ANY', allowedFunctionNames: [toolChoice.function.name] };
            }
            if (functionCallingConfig) body.toolConfig = { functionCallingConfig };
        }

        console.debug(`${apiName} request:`, body);

        try {
            const { signal } = createSocketAbortController(req.socket);

             
            const apiVersion: any = getConfigValue('gemini.apiVersion', 'v1beta' as any, 'string' as any);
            const responseType = stream ? 'streamGenerateContent' : 'generateContent';

            let url: string;
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };

            if (useVertexAi) {
                if (authType === 'express') {
                    const keyParam = authHeader.replace('Bearer ', '');
                    const region = req.body.vertexai_region || 'us-central1';
                    const projectId = req.body.vertexai_express_project_id;
                    url = projectId
                        ? `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/${model}:${responseType}?key=${keyParam}${stream ? '&alt=sse' : ''}`
                        : `https://${region}-aiplatform.googleapis.com/v1/publishers/google/models/${model}:${responseType}?key=${keyParam}${stream ? '&alt=sse' : ''}`;
                } else if (authType === 'full') {
                    const serviceAccountJson = readSecret(req.user.directories, SECRET_KEYS.VERTEXAI_SERVICE_ACCOUNT, req.body.secret_id);
                    if (!serviceAccountJson) {
                        console.warn('Vertex AI Service Account JSON is missing.');
                        res.status(400).send({ error: true });
                        return;
                    }
                    let projectId: string;
                    try {
                        projectId = getProjectIdFromServiceAccount(JSON.parse(serviceAccountJson));
                    } catch (e) {
                        console.error('Failed to extract project ID:', e);
                        res.status(400).send({ error: true });
                        return;
                    }
                    const region = req.body.vertexai_region || 'us-central1';
                    if (region === 'global') {
                        url = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/${model}:${responseType}${stream ? '?alt=sse' : ''}`;
                    } else {
                        url = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/${model}:${responseType}${stream ? '?alt=sse' : ''}`;
                    }
                    headers['Authorization'] = authHeader;
                } else {
                    url = `${apiUrl.toString().replace(/\/$/, '')}/v1/publishers/google/models/${model}:${responseType}${stream ? '?alt=sse' : ''}`;
                    headers['Authorization'] = authHeader;
                }
            } else {
                url = `${apiUrl.toString().replace(/\/$/, '')}/${apiVersion}/models/${model}:${responseType}?key=${apiKey}${stream ? '&alt=sse' : ''}`;
            }

            const generateResponse = await globalThis.fetch(url, {
                body: JSON.stringify(body),
                method: 'POST',
                headers,
                signal,
            });

            if (stream) {
                await forwardFetchResponse(generateResponse, res);
            } else {
                if (!generateResponse.ok) {
                    const errorText = await generateResponse.text();
                    console.warn(`${apiName} API returned error: ${generateResponse.status} ${generateResponse.statusText} ${errorText}`);
                    const errorJson = tryParse(errorText) ?? { error: true };
                    res.status(500).send(errorJson);
                    return;
                }

                const json = await generateResponse.json() as any;
                const candidates = json?.candidates;
                if (!candidates || candidates.length === 0) {
                    let msg = `${apiName} API returned no candidate`;
                    console.warn(msg, json);
                    if (json?.promptFeedback?.blockReason) msg += `\nPrompt was blocked due to: ${json.promptFeedback.blockReason}`;
                    res.send({ error: { message: msg } });
                    return;
                }

                const responseContent = candidates[0].content ?? candidates[0].output;
                const functionCall = (candidates[0]?.content?.parts ?? []).some((p: any) => p.functionCall);
                const inlineData = (candidates[0]?.content?.parts ?? []).some((p: any) => p.inlineData);
                console.debug(`${apiName} response:`, util.inspect(json, { depth: 5, colors: true }));

                const responseText = typeof responseContent === 'string'
                    ? responseContent
                    : responseContent?.parts?.filter((p: any) => !p.thought)?.map((p: any) => p.text)?.join('\n\n');

                if (!responseText && !functionCall && !inlineData) {
                    console.warn(`${apiName} Candidate text empty`, json);
                    res.send({ error: { message: `${apiName} Candidate text empty` } });
                    return;
                }

                res.send({
                    choices: [{ message: { content: responseText } }],
                    responseContent,
                });
            }
        } catch (error: any) {
            console.error(`Error communicating with ${apiName} API:`, error);
            if (!res.headersSent) res.status(500).send({ error: true });
        }
    },

    async listModels(req): Promise<ModelEntry[]> {
        const useVertexAi = req.body.chat_completion_source === CHAT_COMPLETION_SOURCES.VERTEXAI;

        if (useVertexAi) {
            // Vertex AI model listing is not standard; return empty.
            return [];
        }

        const apiKey = req.body.reverse_proxy
            ? req.body.proxy_password
            : readSecret(req.user.directories, SECRET_KEYS.MAKERSUITE, req.body.secret_id);

        if (!apiKey && !req.body.reverse_proxy) return [];

        const apiUrl = req.body.reverse_proxy || API_MAKERSUITE;
         
        const apiVersion: any = getConfigValue('gemini.apiVersion', 'v1beta' as any, 'string' as any);
        const modelsUrl = !apiKey && req.body.reverse_proxy
            ? `${apiUrl}/${apiVersion}/models`
            : `${apiUrl}/${apiVersion}/models?key=${apiKey}`;

        try {
            const response = await globalThis.fetch(modelsUrl);
            if (!response.ok) return [];
            const data = await response.json() as any;
            const models = (data.models as any[])
                ?.filter((m: any) => (m.supportedGenerationMethods as string[])?.includes('generateContent'))
                ?.map((m: any) => ({ ...m, id: m.name.replace('models/', '') })) || [];
            console.info('Available Google AI Studio models:', models.map((m: any) => m.id));
            return models;
        } catch {
            return [];
        }
    },
    resolveTokenizer: () => 'gemma',
};

export default provider;
