import process from 'node:process';
import { CHAT_COMPLETION_SOURCES } from '../../../../constants.js';
import { getConfigValue, forwardFetchResponse, flattenSchema, color } from '../../../../util.js';
import {
    convertClaudeMessages,
    cachingAtDepthForClaude,
    getPromptNames,
    calculateClaudeBudgetTokens,
} from '../../../../prompt-converters.js';
import { readSecret, SECRET_KEYS } from '../../../secrets.js';
import type { ChatProvider, ModelEntry } from '../types.js';

const API_CLAUDE = 'https://api.anthropic.com/v1';

/* eslint-disable @typescript-eslint/no-explicit-any */
const cacheTTL: any = getConfigValue('claude.extendedTTL', false as any, 'boolean' as any) ? '1h' : '5m';
const enableSystemPromptCache: any = getConfigValue('claude.enableSystemPromptCache', false as any, 'boolean' as any);
const cachingAtDepth = (() => {
    const value: any = getConfigValue('claude.cachingAtDepth', -1 as any, 'number' as any);
    return Number.isInteger(value) && value >= 0 ? value : -1;
})();
const enableAdaptiveThinking: any = getConfigValue('claude.enableAdaptiveThinking', true as any, 'boolean' as any);

const provider: ChatProvider = {
    source: CHAT_COMPLETION_SOURCES.CLAUDE,
    endpoints: { chat: '/messages', models: '/models' },
    capabilities: {
        supportsStreaming: true,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: true,
    },

    async chat(req: import('express').Request, res: import('express').Response): Promise<any> {
        const apiUrl = new URL(req.body.reverse_proxy || API_CLAUDE).toString();
        const apiKey = req.body.reverse_proxy
            ? req.body.proxy_password
            : readSecret(req.user.directories, SECRET_KEYS.CLAUDE, req.body.secret_id);
        const divider = '-'.repeat(process.stdout.columns);

        if (!apiKey) {
            console.warn(color.red(`Claude API key is missing.\n${divider}`));
            res.status(400).send({ error: true });
            return;
        }

        try {
            const controller = new AbortController();
            req.socket.removeAllListeners('close');
            req.socket.on('close', () => controller.abort());

            const additionalHeaders: Record<string, string> = {};
            const betaHeaders = ['output-128k-2025-02-19', 'context-1m-2025-08-07'];
            const useTools = Array.isArray(req.body.tools) && req.body.tools.length > 0;
            const useSystemPrompt = Boolean(req.body.use_sysprompt);
            const convertedPrompt = convertClaudeMessages(
                req.body.messages, req.body.assistant_prefill,
                useSystemPrompt, useTools, getPromptNames(req),
            );
            const useThinking = /^claude-(3-7|opus-4|sonnet-4|haiku-4-5|opus-4-5|opus-4-6|sonnet-4-6|opus-4-7)/.test(req.body.model);
            const useWebSearch = /^claude-(3-5|3-7|opus-4|sonnet-4|haiku-4-5|opus-4-5|opus-4-6|sonnet-4-6|opus-4-7)/.test(req.body.model) && Boolean(req.body.enable_web_search);
            const isLimitedSampling = /^claude-(opus-4-1|sonnet-4-5|haiku-4-5|opus-4-5|opus-4-6|sonnet-4-6)/.test(req.body.model);
            const useVerbosity = /^claude-(opus-4-5|opus-4-6|sonnet-4-6|opus-4-7)/.test(req.body.model);
            const noPrefillModel = /^claude-(opus-4-6|sonnet-4-6|opus-4-7)/.test(req.body.model);
            const isAdaptiveModel = /^claude-(opus-4-7)/.test(req.body.model) || (enableAdaptiveThinking && /^claude-(opus-4-6|sonnet-4-6)/.test(req.body.model));
            const noSamplingModel = /^claude-(opus-4-7)/.test(req.body.model);

            const stopSequences: string[] = [];
            if (Array.isArray(req.body.stop)) stopSequences.push(...req.body.stop);

            const requestBody: any = {
                system: [],
                messages: convertedPrompt.messages,
                model: req.body.model,
                max_tokens: req.body.max_tokens,
                stop_sequences: stopSequences,
                temperature: req.body.temperature,
                top_p: req.body.top_p,
                top_k: req.body.top_k,
                stream: req.body.stream,
            };

            if (useSystemPrompt) {
                if (enableSystemPromptCache && Array.isArray(convertedPrompt.systemPrompt) && convertedPrompt.systemPrompt.length) {
                    // @ts-expect-error TS(2532) — cache_control added to last element
                    convertedPrompt.systemPrompt[convertedPrompt.systemPrompt.length - 1].cache_control = { type: 'ephemeral', ttl: cacheTTL };
                }
                requestBody.system = convertedPrompt.systemPrompt;
            } else {
                delete requestBody.system;
            }

            if (useTools) {
                betaHeaders.push('tools-2024-05-16');
                requestBody.tool_choice = { type: req.body.tool_choice };
                requestBody.tools = req.body.tools
                    .filter((t: any) => t.type === 'function')
                    .map((t: any) => t.function)
                    .map((fn: any) => ({
                        name: fn.name,
                        description: fn.description,
                        input_schema: flattenSchema(fn.parameters, req.body.chat_completion_source),
                    }));
                if (enableSystemPromptCache && requestBody.tools.length) {
                    requestBody.tools[requestBody.tools.length - 1].cache_control = { type: 'ephemeral', ttl: cacheTTL };
                }
            }

            if (req.body.json_schema) {
                requestBody.tools = [...(requestBody.tools || []), {
                    name: req.body.json_schema.name,
                    description: req.body.json_schema.description || 'Well-formed JSON object',
                    input_schema: req.body.json_schema.value,
                }];
                requestBody.tool_choice = { type: 'tool', name: req.body.json_schema.name };
            }

            if (useWebSearch) {
                requestBody.tools = [{ type: 'web_search_20250305', name: 'web_search' }, ...(requestBody.tools || [])];
            }

            if (cachingAtDepth !== -1) cachingAtDepthForClaude(convertedPrompt.messages, cachingAtDepth, cacheTTL);
            if (enableSystemPromptCache || cachingAtDepth !== -1) {
                betaHeaders.push('prompt-caching-2024-07-31', 'extended-cache-ttl-2025-04-11');
            }

            if (isLimitedSampling) {
                if (requestBody.top_p < 1) delete requestBody.temperature;
                else delete requestBody.top_p;
            }
            if (noSamplingModel) {
                delete requestBody.temperature;
                delete requestBody.top_p;
                delete requestBody.top_k;
            }

            const budgetTokens = calculateClaudeBudgetTokens(
                requestBody.max_tokens,
                req.body.reasoning_effort,
                req.body.stream,
                isAdaptiveModel,
            );

            if (useThinking && typeof budgetTokens === 'string') {
                requestBody.thinking = { type: 'adaptive' };
                if (noSamplingModel && req.body.include_reasoning) {
                    requestBody.thinking.display = 'summarized';
                }
                requestBody.output_config ??= {};
                requestBody.output_config.effort = budgetTokens;
                delete requestBody.top_k;
            } else if (useThinking && Number.isInteger(budgetTokens)) {
                if (requestBody.max_tokens <= 1024) {
                    requestBody.max_tokens = requestBody.max_tokens + 1024;
                    console.warn(color.yellow('Claude thinking requires a minimum of 1024 response tokens.'));
                }
                requestBody.thinking = { type: 'enabled', budget_tokens: budgetTokens };
                delete requestBody.temperature;
                delete requestBody.top_p;
                delete requestBody.top_k;
            }

            // @ts-expect-error TS(2532) — prompt messages are arrays, not undefined at this point
            if (convertedPrompt.messages.length && convertedPrompt.messages[convertedPrompt.messages.length - 1].role === 'assistant') {
                // @ts-expect-error TS(2532) — ditto
                convertedPrompt.messages[convertedPrompt.messages.length - 1].role = 'user';
            }

            if (useVerbosity && req.body.verbosity && !requestBody.output_config?.effort) {
                betaHeaders.push('effort-2025-11-24');
                requestBody.output_config ??= {};
                requestBody.output_config.effort = req.body.verbosity;
            }

            if (betaHeaders.length) additionalHeaders['anthropic-beta'] = betaHeaders.join(',');

            console.debug('Claude request:', requestBody);

            const generateResponse = await globalThis.fetch(apiUrl + '/messages', {
                method: 'POST',
                signal: controller.signal,
                body: JSON.stringify(requestBody),
                headers: {
                    'Content-Type': 'application/json',
                    'anthropic-version': '2023-06-01',
                    'x-api-key': apiKey,
                    ...additionalHeaders,
                },
            });

            if (req.body.stream) {
                // @ts-expect-error TS(2345) — web Response vs node-fetch Response; works on Bun
                await forwardFetchResponse(generateResponse, res);
            } else {
                if (!generateResponse.ok) {
                    const text = await generateResponse.text();
                    console.warn(color.red(`Claude API returned error: ${generateResponse.status} ${generateResponse.statusText}\n${text}\n${divider}`));
                    res.status(500).send({ error: true });
                    return;
                }
                const json = await generateResponse.json() as any;
                const responseText = json?.content?.[0]?.text || '';
                const reply = { choices: [{ message: { content: responseText } }], content: json.content };
                res.send(reply);
            }
        } catch (error) {
            console.error(color.red(`Error communicating with Claude: ${error}\n${divider}`));
            if (!res.headersSent) res.status(500).send({ error: true });
        }
    },

    async listModels(req): Promise<ModelEntry[]> {
        const apiUrl = new URL(req.body.reverse_proxy || API_CLAUDE).toString();
        const apiKey = req.body.reverse_proxy
            ? req.body.proxy_password
            : readSecret(req.user.directories, SECRET_KEYS.CLAUDE, req.body.secret_id);
        if (!apiKey) return [];

        const response = await globalThis.fetch(`${apiUrl}/models`, {
            headers: { 'anthropic-version': '2023-06-01', 'x-api-key': apiKey },
        });
        if (!response.ok) return [];
        const data = await response.json() as any;
        return data.data || [];
    },
};

export default provider;
