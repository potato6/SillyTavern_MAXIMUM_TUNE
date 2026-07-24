/**
 * Shared typedefs for the structured macro environment object (MacroEnv)
 * used by the macro engine, registry, env builder, and macro definition
 * modules. This file intentionally only contains JSDoc typedefs so that
 * we can share types across the macro subsystem without circular deps.
 *
 * @module MacroEnv
 */

/**
 * @typedef {{
 *   generateId: () => string,
 *   getMessageById: (id: string) => import('../../chats/types.js').ChatMessage | undefined,
 *   getUserMessageById: (id: string) => import('../../chats/types.js').ChatMessage | undefined,
 *   isMessageMuted: (id: string) => boolean,
 *   isMessagePending: (id: string) => boolean,
 *   registerSlashCommand: (name: string, callback: Function, helpString: string, group?: string, aliases?: string[]) => void,
 *   callGenericPopup: (data: any, type: string, input: any, options?: any) => Promise<any>,
 *   Popup: import('../../popup.js').PopupManager,
 *   toastr: any,
 *   runSlash: (command: string, from?: string) => Promise<string>,
 *   runSlashWithOptions: (options: import('../../slash-commands/SlashCommand.js').SlashCommandOptions) => Promise<string>,
 *   encodeState: (data: any, key?: string) => string | undefined,
 *   decodeState: (data: string, key?: string) => any,
 *   delay: (ms: number) => Promise<void>,
 *   uuidv4: () => string,
 * }} MacroEnvSystem
 */

/**
 * @typedef {{
 *   countCharacters: (text: string) => number,
 *   countTokens: (text: string) => Promise<number>,
 *   getContext: () => any,
 *   getCurrentChatId: () => string | undefined,
 *   isGroupChat: (id?: string) => boolean,
 *   setExtensionPrompt: (role: string, content: string, insertionPosition: number, depth: number) => void,
 *   this_chid: string | undefined,
 *   characters: import('../../../scripts/extensions.js').CharacterInfo[],
 *   characterJson: any,
 *   chat: any[],
 *   selected_group: string | undefined,
 *   groups: any[],
 *   online: boolean,
 *   streamingProcessor: import('../../../scripts/streaming-processor.js').StreamingProcessor | undefined,
 * }} MacroEnvFunctions
 */

/**
 * A value stored in a dynamic macro.
 * @typedef {string | number | boolean | object | null | undefined} DynamicMacroValue
 */

/**
 * Describes the full structured macro environment that gets injected into
 * every {@link Macro} at evaluation time.  The union of `system` and
 * `functions` is the "global scope" for macro expressions; individual
 * macros add their own properties on top.
 *
 * Properties are intentionally non-enumerable and read-only at runtime,
 * enforced by a Proxy inside the evaluation sandbox.
 *
 * @typedef {{
 *   system: MacroEnvSystem,
 *   functions: MacroEnvFunctions,
 *   dynamicMacros: Object<string, DynamicMacroValue>,
 *   extra: Record<string, unknown>,
 * }} MacroEnv
 */



