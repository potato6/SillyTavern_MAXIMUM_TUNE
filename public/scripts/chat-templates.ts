import { t } from './i18n.js';
import { Template } from '@huggingface/jinja';

const substr_derivations = [
    [
        'Moonshot AI',
        ['<|im_user|>user<|im_middle|>', '<|im_assistant|>assistant<|im_middle|>', '<|im_end|>'],
    ],
    [
        'OpenAI Harmony',
        ['<|start|>user<|message|>', '<|start|>assistant<|channel|>final<|message|>', '<|end|>'],
    ],

    // Generic cases
    ['ChatML', ['<|im_start|>user', '<|im_start|>assistant', '<|im_end|>']],
];

// @ts-expect-error TS(7006) FIXME: Parameter 'derivation' implicitly has an 'any' typ... Remove this comment to see the full error message
const parse_derivation = (derivation) =>
    typeof derivation === 'string'
        ? {
              context: derivation,
              instruct: derivation,
          }
        : derivation;

const not_found = { context: null, instruct: null };

/**
 *
 * @param chat_template
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'chat_template' implicitly has an 'any' ... Remove this comment to see the full error message
export async function deriveTemplatesFromChatTemplate(chat_template) {
    if (chat_template.trim() === '') {
        console.log('Missing chat template.');
        return not_found;
    }

    // template substring matching
    for (const [derivation, substr] of substr_derivations) {
        if ([substr].flat().every((str) => chat_template.includes(str))) {
            return parse_derivation(derivation);
        }
    }

    console.warn(`Unknown chat template: [${chat_template}]`);
    return not_found;
}

/**
 *
 * @param power_user
 * @param online_status
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'power_user' implicitly has an 'any' typ... Remove this comment to see the full error message
export async function bindModelTemplates(power_user, online_status) {
    if (online_status === 'no_connection') {
        return false;
    }

    const chatTemplateHash = power_user.chat_template_hash;
    const bindModelTemplates =
        power_user.model_templates_mappings[online_status] ??
        power_user.model_templates_mappings[chatTemplateHash] ??
        {};
    const bindingsMatch =
        bindModelTemplates &&
        power_user.context.preset == bindModelTemplates.context &&
        (!power_user.instruct.enabled ||
            power_user.instruct.preset === bindModelTemplates.instruct);

    const bound = [];

    if (bindingsMatch) {
        // unmap current preset
        delete power_user.model_templates_mappings[chatTemplateHash];
        delete power_user.model_templates_mappings[online_status];
        notyf.info(
            t`Context preset for ${online_status} will use defaults when loaded the next time.`,
        );
    } else {
        if (power_user.context_derived) {
            if (power_user.context.preset !== bindModelTemplates.context) {
                bound.push(`${power_user.context.preset} context preset`);
                // notyf.info(`Bound ${power_user.context.preset} preset to currently loaded model and all models that share its chat template.`);

                // map current preset to current chat template hash
                bindModelTemplates.context = power_user.context.preset;
            }
        } else {
            notyf.warning(t`Note: Context derivation is disabled. Not including context preset.`);
        }
        if (power_user.instruct.enabled) {
            if (power_user.instruct_derived) {
                if (power_user.instruct.preset !== bindModelTemplates.instruct) {
                    bound.push(`${power_user.instruct.preset} instruct preset`);
                    bindModelTemplates.instruct = power_user.instruct.preset;
                }
            } else {
                notyf.warning(
                    t`Note: Instruct derivation is disabled. Not including instruct preset.`,
                );
            }
        }
        if (bound.length == 0) {
            notyf.warning(t`No applicable presets available.`);
            return false;
        }

        notyf.info(t`Bound ${online_status} to ${bound.join(', ')}.`);
        if (!online_status.startsWith('koboldcpp/ggml-model-')) {
            power_user.model_templates_mappings[online_status] = bindModelTemplates;
        }
        if (chatTemplateHash !== '') {
            power_user.model_templates_mappings[chatTemplateHash] = bindModelTemplates;
        }
    }

    return true;
}

/**
 * Renders a list of messages using the model's own HuggingFace chat template via @huggingface/jinja.
 * Use this instead of the instruct mode pipeline when a model provides a chat_template.
 *
 * @param messages Array of chat messages with role and content
 * @param chatTemplate The Jinja chat template string from the model's tokenizer_config.json
 * @param options Optional render parameters
 * @param options.bos_token Beginning-of-sequence token (default: '')
 * @param options.eos_token End-of-sequence token (default: '')
 * @param options.add_generation_prompt Whether to append the assistant turn prompt (default: false)
 * @param options.extra Extra variables to pass to the template renderer
 * @returns The rendered prompt string
 */
export function renderChatTemplate(
    messages: ChatTemplateMessage[],
    chatTemplate: string,
    options: {
        bos_token?: string;
        eos_token?: string;
        add_generation_prompt?: boolean;
        extra?: Record<string, unknown>;
    } = {},
): string {
    if (!chatTemplate) {
        return '';
    }

    console.debug(
        '[CT] messages:',
        messages
            .map(
                (m) =>
                    `${m.role}${m.tool_calls ? '☎' : ''}${m.tool_call_id ? '→' : ''} "${(m.content ?? '').slice(0, 80)}"`,
            )
            .join(' | '),
    );

    const template = new Template(chatTemplate);

    const result = template.render({
        messages: messages,
        bos_token: options.bos_token ?? '',
        eos_token: options.eos_token ?? '',
        add_generation_prompt: options.add_generation_prompt ?? false,
        ...options.extra,
    });

    return result;
}

export type ChatTemplateMessage = {
    role: string;
    content: string | null;
    tool_calls?: Array<{ type: string; function: { name: string; arguments: string }; id: string }>;
    tool_call_id?: string;
};

/**
 * Enforces strict HuggingFace role alternation on a messages array.
 *
 * Rules:
 *  - An optional 'system' message is only allowed at position 0; additional
 *    system messages are dropped (their content merged into the first message).
 *  - After position 0, 'user' and 'assistant' must strictly alternate.
 *  - Consecutive same-role messages (user+user or assistant+assistant) have
 *    their content merged into the first occurrence.
 *  - 'tool' messages are kept as-is (they follow assistant.tool_calls or
 *    consecutive tool results).
 *  - An 'assistant' message with tool_calls preserves its dedicated slot
 *    (a subsequent non-tool assistant message is merged into it rather than
 *    creating a duplicate).
 */
function enforceAlternation(messages: ChatTemplateMessage[]): ChatTemplateMessage[] {
    if (messages.length === 0) return messages;

    // HuggingFace chat templates expect the first non-system message to be
    // 'user'.  SillyTavern chats typically start with the character greeting
    // (assistant).  Prepend a synthetic empty user message so the alternation
    // counter doesn't immediately fail.
    const result: ChatTemplateMessage[] = [];

    let loopStart = 0;

    if (messages[0]!.role === 'system') {
        result.push(messages[0]!);
        loopStart = 1;
        if (messages.length > 1 && messages[1]!.role !== 'user') {
            result.push({ role: 'user', content: '' });
        }
    } else if (messages[0]!.role !== 'user') {
        // assistant-first (character greeting) — inject dummy user
        result.push({ role: 'user', content: '' });
    }

    // Push all messages from loopStart into result, then run the merge pass
    for (let i = loopStart; i < messages.length; i++) {
        result.push(messages[i]!);
    }

    // Merge pass: walk result and handle consecutive same-role messages
    const merged: ChatTemplateMessage[] = [result[0]!];
    for (let i = 1; i < result.length; i++) {
        const curr = result[i]!;
        const prev = merged[merged.length - 1]!;

        // 'tool' messages always pass through
        if (curr.role === 'tool') {
            merged.push(curr);
            continue;
        }

        // Same role — merge depending on tool_calls
        if (curr.role === prev.role) {
            if (curr.tool_calls && !prev.tool_calls) {
                // bare assistant → assistant(tool_calls): merge forward
                prev.tool_calls = curr.tool_calls;
                if (curr.content) {
                    prev.content = prev.content
                        ? prev.content + '\n\n' + curr.content
                        : curr.content;
                }
            } else if (prev.tool_calls && !curr.tool_calls) {
                // assistant(tool_calls) → bare assistant: keep separate (follow-up response)
                merged.push(curr);
            } else {
                // plain same-role: merge content
                if (curr.content) {
                    prev.content = prev.content
                        ? prev.content + '\n\n' + curr.content
                        : curr.content;
                }
            }
            continue;
        }

        // Alternation is correct
        merged.push(curr);
    }

    return merged;
}

export interface BuildChatMessagesParams {
    storyStringParams: {
        description: string;
        personality: string;
        persona: string;
        scenario: string;
        system: string;
        wiBefore: string;
        wiAfter: string;
        anchorBefore: string;
        anchorAfter: string;
    };
    mesExamplesArray: string[];
    coreChat: Array<Record<string, any>>;
    quiet_prompt?: string;
    quietToLoud?: boolean;
}

/**
 * Builds a structured messages array from SillyTavern's assembled context,
 * suitable for rendering with a HuggingFace chat template.
 *
 * Extracts raw content from story string params (description, personality, etc.)
 * as a system message, parses examples into individual messages, and maps
 * coreChat items to their appropriate roles.
 */
export async function buildChatMessages(
    params: BuildChatMessagesParams,
): Promise<ChatTemplateMessage[]> {
    const messages: ChatTemplateMessage[] = [];

    // 1. System-level context from story string (raw, no pre-formatting)
    const systemParts = [
        params.storyStringParams.description,
        params.storyStringParams.personality,
        params.storyStringParams.scenario,
        params.storyStringParams.persona,
        params.storyStringParams.system,
        params.storyStringParams.wiBefore,
        params.storyStringParams.wiAfter,
        params.storyStringParams.anchorBefore,
        params.storyStringParams.anchorAfter,
    ].filter(Boolean);

    if (systemParts.length > 0) {
        messages.push({ role: 'system', content: systemParts.join('\n\n') });
    }

    // 2. Example messages
    // Lazy import to avoid circular deps
    const { parseExampleIntoIndividual } = await import('./openai.js');
    for (const example of params.mesExamplesArray) {
        const cleaned = example.replace(/<START>/i, '{Example Dialogue:}').replace(/\r/gm, '');
        const parsed = parseExampleIntoIndividual(cleaned, true);
        for (const msg of parsed) {
            // parseExampleIntoIndividual returns role='system' with name='example_user'/'example_assistant'
            // HuggingFace templates need proper user/assistant roles for alternation
            const role =
                msg.name === 'example_user'
                    ? 'user'
                    : msg.name === 'example_assistant'
                      ? 'assistant'
                      : String(msg.role);
            messages.push({
                role: role,
                content: String(msg.content),
            });
        }
    }

    // 3. Core chat (already has extension injections + jailbreak)
    for (const item of params.coreChat) {
        if (item?.extra?.ignore) continue; // IGNORE_SYMBOL check

        // Non-tool system messages break HuggingFace alternation; skip them.
        // Tool-call related system messages are handled separately below.
        if (item.is_system && !Array.isArray(item.extra?.tool_invocations)) continue;

        if (Array.isArray(item.extra?.tool_invocations)) {
            // Split a single tool invocation message into HuggingFace format:
            //   assistant (with tool_calls) → tool (result) for each invocation

            // Safety: content should be empty/null when tool_calls are present
            messages.push({
                role: 'assistant',
                content: item.mes ?? '',
                tool_calls: item.extra.tool_invocations.map((inv: any) => ({
                    type: 'function',
                    function: {
                        name: inv.name,
                        arguments: inv.parameters,
                    },
                    id: inv.id,
                })),
            });

            for (const inv of item.extra.tool_invocations) {
                messages.push({
                    role: 'tool',
                    content: String(inv.result ?? ''),
                    tool_call_id: inv.id,
                });
            }
        } else {
            const role = item.is_user ? 'user' : 'assistant';
            messages.push({ role, content: item.mes ?? '' });
        }
    }

    // 4. Quiet prompt
    if (params.quiet_prompt) {
        // 'system' role only allowed as the first message; if we already have
        // messages fall back to 'assistant' to preserve alternation.
        const quietRole = params.quietToLoud
            ? 'assistant'
            : messages.length === 0
              ? 'system'
              : 'assistant';
        messages.push({
            role: quietRole,
            content: params.quiet_prompt,
        });
    }

    return enforceAlternation(messages);
}
