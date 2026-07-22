import {
    name1,
    name2,
    characters,
    getCharacterCardFieldsLazy,
    getGeneratingModel,
} from '../../../script.js';
import { groups, selected_group } from '../../../scripts/group-chats.js';
import { logMacroGeneralError } from './MacroDiagnostics.js';
// @ts-expect-error TS(2792) FIXME: Cannot find module '/scripts/utils.js'. Did you me... Remove this comment to see the full error message
import { getStringHash } from '/scripts/utils.js';
/**
 * MacroEnvBuilder is responsible for constructing the MacroEnv object
 * that is passed to macro handlers.
 *
 * It does **not** depend on the legacy regex macro system. Instead, it
 * works from the same raw inputs that substituteParams receives plus a
 * small bundle of global helpers, so it can eventually replace the
 * environment-building block in substituteParams.
 */

/** @typedef {import('./MacroEnv.types.js').MacroEnv} MacroEnv */

/**
 * @typedef {object} MacroEnvRawContext
 * @property {string} content
 * @property {string|null} [name1Override]
 * @property {string|null} [name2Override]
 * @property {string|null} [original]
 * @property {string|null} [groupOverride]
 * @property {boolean} [replaceCharacterCard]
 * @property {Record<string, import('./MacroEnv.types.js').DynamicMacroValue>|null} [dynamicMacros]
 * @property {(value: string) => string} [postProcessFn]
 */

/**
 * @typedef {(env: MacroEnv, ctx: MacroEnvRawContext) => void} MacroEnvProvider
 */

/**
 * @enum {number} Exposed ordering buckets for providers. Callers can use envBuilder.providerOrder.* when registering providers.
 */
export const env_provider_order = {
    EARLIEST: 0,
    EARLY: 10,
    NORMAL: 50,
    LATE: 90,
    LATEST: 100,
};

class MacroEnvBuilder {
    // @ts-expect-error TS(7008) FIXME: Member '#instance' implicitly has an 'any' type.
    /** @type {MacroEnvBuilder} */ static #instance;
    /** @type {MacroEnvBuilder} */ static get instance() {
        return MacroEnvBuilder.#instance ?? (MacroEnvBuilder.#instance = new MacroEnvBuilder());
    }

    /** @type {{ fn: MacroEnvProvider, order: env_provider_order }[]} */
    // @ts-expect-error TS(7008) FIXME: Member '#providers' implicitly has an 'any[]' type... Remove this comment to see the full error message
    #providers;

    constructor() {
        this.#providers = [];
    }

    /**
     * Registers a provider that can augment the MacroEnv with additional
     * data (for extensions, extra context, etc.).
     *
     * Should be called once during initialization.
     * @param {MacroEnvProvider} provider
     * @param {env_provider_order} [order]
     * @returns {void}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'provider' implicitly has an 'any' type.
    registerProvider(provider, order = env_provider_order.NORMAL) {
        if (typeof provider !== 'function') throw new Error('Provider must be a function');
        this.#providers.push({ fn: provider, order });
    }

    /**
     * Builds a MacroEnv from the raw arguments that are conceptually the
     * same as substituteParams receives, plus a bundle of global helpers.
     * @param {MacroEnvRawContext} ctx
     * @returns {MacroEnv}
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'ctx' implicitly has an 'any' type.
    buildFromRawEnv(ctx) {
        // Create the env first, we will populate it step by step.
        // Some fields are marked as required, so we have to fill them with dummy fields here
        /** @type {MacroEnv} */
        const env = {
            content: ctx.content,
            contentHash: getStringHash(ctx.content),
            names: { user: '', char: '', group: '', groupNotMuted: '', notChar: '' },
            character: {},
            system: { model: '' },
            // @ts-expect-error TS(7006) FIXME: Parameter 'x' implicitly has an 'any' type.
            functions: { postProcess: (x) => x },
            dynamicMacros: {},
            extra: {},
        };

        if (ctx.replaceCharacterCard) {
            // Use lazy fields - each property is only resolved when accessed
            const fields = getCharacterCardFieldsLazy();
            if (fields) {
                // Define lazy getters on env.character that delegate to fields
                const fieldMappings = /** @type {const} */ ([
                    ['charPrompt', 'system'],
                    ['charInstruction', 'jailbreak'],
                    ['description', 'description'],
                    ['personality', 'personality'],
                    ['scenario', 'scenario'],
                    ['persona', 'persona'],
                    ['mesExamplesRaw', 'mesExamples'],
                    ['version', 'version'],
                    ['charDepthPrompt', 'charDepthPrompt'],
                    ['creatorNotes', 'creatorNotes'],
                    ['firstMessage', 'firstMessage'],
                    ['alternateGreetings', 'alternateGreetings'],
                ]);
                for (const [envKey, fieldKey] of fieldMappings) {
                    // @ts-expect-error TS(2345) FIXME: Argument of type 'string | undefined' is not assig... Remove this comment to see the full error message
                    Object.defineProperty(env.character, envKey, {
                        get() {
                            // @ts-expect-error TS(2538) FIXME: Type 'undefined' cannot be used as an index type.
                            const value = fields[fieldKey];
                            // alternateGreetings should default to [] instead of ''
                            if (envKey === 'alternateGreetings') {
                                return Array.isArray(value) ? value : [];
                            }
                            return value || '';
                        },
                        enumerable: true,
                        configurable: true,
                    });
                }
            }
        }

        // Names
        env.names.user = ctx.name1Override ?? name1 ?? '';
        env.names.char = ctx.name2Override ?? name2 ?? '';
        // @ts-expect-error TS(2322) FIXME: Type 'string' is not assignable to type 'null | un... Remove this comment to see the full error message
        env.names.group = getGroupValue(ctx, { currentChar: env.names.char, includeMuted: true });
        // @ts-expect-error TS(2322) FIXME: Type 'string' is not assignable to type 'null | un... Remove this comment to see the full error message
        env.names.groupNotMuted = getGroupValue(ctx, {
            currentChar: env.names.char,
            includeMuted: false,
        });
        // @ts-expect-error TS(2322) FIXME: Type 'string' is not assignable to type 'null | un... Remove this comment to see the full error message
        env.names.notChar = getGroupValue(ctx, {
            currentChar: env.names.char,
            filterOutChar: true,
            includeUser: env.names.user,
        });

        // System
        // @ts-expect-error TS(2554) FIXME: Expected 1 arguments, but got 0.
        env.system.model = getGeneratingModel();

        // Functions
        // original (one-shot) and arbitrary additional values
        if (typeof ctx.original === 'string') {
            let originalSubstituted = false;
            // @ts-expect-error TS(2339) FIXME: Property 'original' does not exist on type '{ post... Remove this comment to see the full error message
            env.functions.original = () => {
                if (originalSubstituted) return '';
                originalSubstituted = true;
                return ctx.original;
            };
        }
        env.functions.postProcess =
            typeof ctx.postProcessFn === 'function' ? ctx.postProcessFn : (x) => x;

        // Dynamic, per-call macros that should be visible only for this evaluation run.
        // Keys are normalized to lowercase for case-insensitive matching.
        if (ctx.dynamicMacros && typeof ctx.dynamicMacros === 'object') {
            for (const [key, value] of Object.entries(ctx.dynamicMacros)) {
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                env.dynamicMacros[key.toLowerCase()] = value;
            }
        }

        // Let providers augment the env, if any are registered. Apply them in order,
        // so callers can influence when their provider runs relative to others.
        const orderedProviders = this.#providers.slice().toSorted((a, b) => a.order - b.order);
        for (const { fn } of orderedProviders) {
            try {
                fn(env, ctx);
            } catch (e) {
                // Provider errors should not break macro evaluation
                logMacroGeneralError({ message: 'MacroEnvBuilder: Provider error', error: e });
            }
        }

        return env;
    }
}

/**
 * @param {MacroEnvRawContext} ctx
 * @param {object} options
 * @param {string} [options.currentChar]
 * @param {boolean} [options.includeMuted]
 * @param {boolean} [options.filterOutChar]
 * @param {string|null} [options.includeUser]
 * @returns {string}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'ctx' implicitly has an 'any' type.
function getGroupValue(
    ctx,
    { currentChar = null, includeMuted = false, filterOutChar = false, includeUser = null },
) {
    if (typeof ctx.groupOverride === 'string') {
        return ctx.groupOverride;
    }

    if (!selected_group) return filterOutChar ? includeUser || '' : (currentChar ?? '');

    const groupEntry = Array.isArray(groups)
        ? groups.find((x) => x && x.id === selected_group)
        : null;
    const members = /** @type {string[]} */ (groupEntry?.members ?? []);
    const disabledMembers = /** @type {string[]} */ (groupEntry?.disabled_members ?? []);

    const names = Array.isArray(members)
        ? members
              .filter((id) => (includeMuted ? true : !disabledMembers.includes(id)))
              .map((m) =>
                  Array.isArray(characters) ? characters.find((c) => c && c.avatar === m) : null,
              )
              .filter((c) => !!c && typeof c.name === 'string')
              .filter((c) => !filterOutChar || c.name !== currentChar)
              .map((c) => c.name)
              .join(', ')
        : '';

    return names;
}

const instance = MacroEnvBuilder.instance;
export { instance as MacroEnvBuilder };
