/**
 * World Info scanning engine — core classes & scanning pipeline.
 */

import { escapeRegex, getCharaFilename, getStringHash } from '../utils.js';
import {
    chat_metadata,
    characters,
    eventSource,
    event_types,
    extension_prompt_roles,
    getExtensionPromptByName,
    getRequestHeaders,
    substituteParams,
    this_chid,
} from '../../script.js';
import { extension_settings, getContext } from '../extensions.js';
import { shouldWIAddPrompt, NOTE_MODULE_NAME, metadata_keys } from '../authors-note.js';
import { getTokenCountAsync } from '../tokenizers.js';
import { power_user } from '../power-user.js';
import { getTagKeyForEntity } from '../tags.js';

import { getRegexedString, regex_placement } from '../extensions/regex/engine.js';
import { StructuredCloneMap } from '../util/StructuredCloneMap.js';

import {
    wi_anchor_position,
    world_info_insertion_strategy,
    world_info_logic,
    world_info_position,
    scan_state,
    MAX_SCAN_DEPTH,
    DEFAULT_DEPTH,
    DEFAULT_WEIGHT,
    KNOWN_DECORATORS,
    METADATA_KEY,
    defaultGlobalScanData,
} from './constants.js';

import { wiManager } from './manager.js';

import type { WIGlobalScanData, WIScanEntry, WITimedEffect } from './types.js';

// ═══════════════════════════════════════════════════════════════
//  Regex helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Validates if a string is a valid slash-delimited regex.
 * @param input
 */
export function isValidRegex(input: string): boolean {
    return parseRegexFromString(input) !== null;
}

/**
 * Parses a slash-delimited regex string into a RegExp object.
 * Format: `/pattern/flags`
 * @param input
 */
export function parseRegexFromString(input: string): RegExp | null {
    const match = input.match(/^\/([\w\W]+?)\/([gimsuy]*)$/);
    if (!match) return null;
    const [, rawPattern, flags] = match;
    let pattern = rawPattern!;
    if (pattern.match(/(^|[^\\])\//)) return null;
    pattern = pattern.replace('\\/', '/');
    try {
        return new RegExp(pattern, flags!);
    } catch {
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════
//  WorldInfoBuffer
// ═══════════════════════════════════════════════════════════════

export class WorldInfoBuffer {
    static externalActivations: Map<string, object> = new Map();

    #globalScanData: WIGlobalScanData | null = null;
    #depthBuffer: string[] = [];
    #recurseBuffer: string[] = [];
    #injectBuffer: string[] = [];
    #skew = 0;
    #startDepth = 0;
    #depthSetting = 2;
    #caseSensitive = false;
    #matchWholeWords = false;

    constructor(
        messages: string[],
        globalScanData: WIGlobalScanData,
        options?: { depth?: number; caseSensitive?: boolean; matchWholeWords?: boolean },
    ) {
        for (let depth = 0; depth < MAX_SCAN_DEPTH; depth++) {
            const msg = messages[depth];
            if (msg) this.#depthBuffer[depth] = msg.trim();
            if (depth === messages.length - 1) break;
        }
        this.#globalScanData = globalScanData;
        if (options?.depth !== undefined) this.#depthSetting = options.depth;
        if (options?.caseSensitive !== undefined) this.#caseSensitive = options.caseSensitive;
        if (options?.matchWholeWords !== undefined) this.#matchWholeWords = options.matchWholeWords;
    }

    #transformString(str: string, entry: WIScanEntry): string {
        const cs = entry.caseSensitive ?? this.#caseSensitive;
        return cs ? str : str.toLowerCase();
    }

    get(entry: WIScanEntry, scanState: number): string {
        let depth = entry.scanDepth ?? this.getDepth();
        if (depth <= this.#startDepth) return '';
        if (depth < 0) {
            console.error(`[WI] Invalid depth ${depth}`);
            return '';
        }
        if (depth > MAX_SCAN_DEPTH) {
            console.warn(`[WI] Truncating depth to ${MAX_SCAN_DEPTH}`);
            depth = MAX_SCAN_DEPTH;
        }

        const SEP = '\x01';
        const J = '\n' + SEP;
        let r = SEP + this.#depthBuffer.slice(this.#startDepth, depth).join(J);

        const gs = this.#globalScanData;
        if (entry.matchPersonaDescription && gs?.personaDescription) r += J + gs.personaDescription;
        if (entry.matchCharacterDescription && gs?.characterDescription)
            r += J + gs.characterDescription;
        if (entry.matchCharacterPersonality && gs?.characterPersonality)
            r += J + gs.characterPersonality;
        if (entry.matchCharacterDepthPrompt && gs?.characterDepthPrompt)
            r += J + gs.characterDepthPrompt;
        if (entry.matchScenario && gs?.scenario) r += J + gs.scenario;
        if (entry.matchCreatorNotes && gs?.creatorNotes) r += J + gs.creatorNotes;
        if (this.#injectBuffer.length > 0) r += J + this.#injectBuffer.join(J);
        if (this.#recurseBuffer.length > 0 && scanState !== scan_state.MIN_ACTIVATIONS)
            r += J + this.#recurseBuffer.join(J);
        return r;
    }

    matchKeys(haystack: string, needle: string, entry: WIScanEntry): boolean {
        const rx = parseRegexFromString(needle);
        if (rx) return rx.test(haystack);

        haystack = this.#transformString(haystack, entry);
        const ns = this.#transformString(needle, entry);
        const mw = entry.matchWholeWords ?? this.#matchWholeWords;

        if (mw) {
            const words = ns.split(/\s+/);
            if (words.length > 1) return haystack.includes(ns);
            return new RegExp(`(?:^|\\W)(${escapeRegex(ns)})(?:$|\\W)`).test(haystack);
        }
        return haystack.includes(ns);
    }

    addRecurse(m: string) {
        this.#recurseBuffer.push(m);
    }
    addInject(m: string) {
        this.#injectBuffer.push(m);
    }
    hasRecurse(): boolean {
        return this.#recurseBuffer.length > 0;
    }
    advanceScan() {
        this.#skew++;
    }
    getDepth(): number {
        return this.#depthSetting + this.#skew;
    }

    getExternallyActivated(entry: WIScanEntry): object | undefined {
        return WorldInfoBuffer.externalActivations.get(`${entry.world}.${entry.uid}`);
    }
    resetExternalEffects() {
        WorldInfoBuffer.externalActivations = new Map();
    }

    getScore(entry: WIScanEntry, scanState_: number): number {
        const buf = this.get(entry, scanState_);
        let n1 = 0,
            n2 = 0,
            s1 = 0,
            s2 = 0;

        if (Array.isArray(entry.key)) {
            n1 = entry.key.length;
            for (const k of entry.key) if (this.matchKeys(buf, k, entry)) s1++;
        }
        if (Array.isArray(entry.keysecondary)) {
            n2 = entry.keysecondary.length;
            for (const k of entry.keysecondary) if (this.matchKeys(buf, k, entry)) s2++;
        }
        if (!n1) return 0;
        if (n2 > 0) {
            if (entry.selectiveLogic === world_info_logic.AND_ANY) return s1 + s2;
            if (entry.selectiveLogic === world_info_logic.AND_ALL) return s2 === n2 ? s1 + s2 : s1;
        }
        return s1;
    }
}

// ═══════════════════════════════════════════════════════════════
//  WorldInfoTimedEffects
// ═══════════════════════════════════════════════════════════════

export class WorldInfoTimedEffects {
    #chat: string[];
    #entries: WIScanEntry[];
    #isDryRun: boolean;
    #buffer: Record<string, WIScanEntry[]> = { sticky: [], cooldown: [], delay: [] };

    #onEnded: Record<string, (e: WIScanEntry) => void> = {
        sticky: (entry) => {
            if (!entry.cooldown) return;
            const key = this.#ekey(entry);
            const eff = this.#mkEffect('cooldown', entry, true);
            chat_metadata.timedWorldInfo!.cooldown![key] = eff;
            this.#buffer.cooldown!.push(entry);
        },
        cooldown: () => {},
        delay: () => {},
    };

    constructor(chat: string[], entries: WIScanEntry[], isDryRun = false) {
        this.#chat = chat;
        this.#entries = entries;
        this.#isDryRun = isDryRun;
        this.#ensureMeta();
    }

    #ensureMeta() {
        if (!chat_metadata.timedWorldInfo) chat_metadata.timedWorldInfo = {};
        for (const t of ['sticky', 'cooldown'] as const) {
            if (
                !chat_metadata.timedWorldInfo[t] ||
                typeof chat_metadata.timedWorldInfo[t] !== 'object'
            )
                chat_metadata.timedWorldInfo[t] = {};
            Object.entries(chat_metadata.timedWorldInfo[t]).forEach(([k, v]) => {
                if (!v || typeof v !== 'object') delete chat_metadata.timedWorldInfo[t][k];
            });
        }
    }

    #hash(e: WIScanEntry): number {
        return e.hash ?? 0;
    }
    #ekey(e: WIScanEntry): string {
        return `${e.world}.${e.uid}`;
    }
    #mkEffect(t: string, e: WIScanEntry, p: boolean): WITimedEffect {
        return {
            hash: this.#hash(e),
            start: this.#chat.length,
            end: this.#chat.length + Number((e as Record<string, unknown>)[t]),
            protected: p,
        };
    }

    #checkType(type: string, buf: WIScanEntry[], onEnded: (e: WIScanEntry) => void) {
        const effects = Object.entries(chat_metadata.timedWorldInfo[type] ?? {}) as [
            string,
            WITimedEffect,
        ][];
        for (const [key, val] of effects) {
            const entry = this.#entries.find((x) => String(this.#hash(x)) === String(val.hash));
            if (this.#chat.length <= Number(val.start) && !val.protected) {
                delete chat_metadata.timedWorldInfo[type][key];
                continue;
            }
            if (!entry) {
                if (this.#chat.length >= Number(val.end))
                    delete chat_metadata.timedWorldInfo[type][key];
                continue;
            }
            if (!(entry as Record<string, unknown>)[type]) {
                delete chat_metadata.timedWorldInfo[type][key];
                continue;
            }
            if (this.#chat.length >= Number(val.end)) {
                delete chat_metadata.timedWorldInfo[type][key];
                onEnded(entry);
                continue;
            }
            buf.push(entry);
        }
    }

    #checkDelay(buf: WIScanEntry[]) {
        for (const e of this.#entries) {
            if (
                (e as Record<string, unknown>).delay &&
                this.#chat.length < Number((e as Record<string, unknown>).delay)
            )
                buf.push(e);
        }
    }

    checkTimedEffects() {
        if (!this.#isDryRun) {
            this.#checkType('sticky', this.#buffer.sticky!, this.#onEnded.sticky!.bind(this));
            this.#checkType('cooldown', this.#buffer.cooldown!, this.#onEnded.cooldown!.bind(this));
        }
        this.#checkDelay(this.#buffer.delay!);
    }

    getEffectMetadata(type: string, e: WIScanEntry): WITimedEffect | null {
        if (!this.isValidType(type)) return null;
        return chat_metadata.timedWorldInfo[type]?.[this.#ekey(e)] ?? null;
    }

    setTimedEffects(activated: WIScanEntry[]) {
        if (this.#isDryRun) return;
        for (const e of activated) {
            for (const t of ['sticky', 'cooldown'] as const) {
                if (!e[t]) continue;
                const k = this.#ekey(e);
                if (!chat_metadata.timedWorldInfo[t][k])
                    chat_metadata.timedWorldInfo[t][k] = this.#mkEffect(t, e, false);
            }
        }
    }

    setTimedEffect(type: string, e: WIScanEntry, state: boolean) {
        if (!this.isValidType(type)) return;
        if (this.#isDryRun && type !== 'delay') return;
        delete chat_metadata.timedWorldInfo[type][this.#ekey(e)];
        if (state)
            chat_metadata.timedWorldInfo[type][this.#ekey(e)] = this.#mkEffect(type, e, false);
    }

    isValidType(type: string): boolean {
        return ['sticky', 'cooldown', 'delay'].includes(type.trim().toLowerCase());
    }

    isEffectActive(type: string, e: WIScanEntry): boolean {
        if (!this.isValidType(type)) return false;
        return this.#buffer[type]?.some((x) => this.#hash(x) === this.#hash(e)) ?? false;
    }

    cleanUp() {
        for (const b of Object.values(this.#buffer)) b.splice(0, b.length);
    }
}

// ═══════════════════════════════════════════════════════════════
//  Group filtering
// ═══════════════════════════════════════════════════════════════

/**
 *
 * @param newEntries
 * @param allActivatedEntries
 * @param buffer
 * @param scanState_
 * @param timedEffects
 * @param useGroupScoring
 */
export function filterByInclusionGroups(
    newEntries: WIScanEntry[],
    allActivatedEntries: Map<string, WIScanEntry>,
    buffer: WorldInfoBuffer,
    scanState_: number,
    timedEffects: WorldInfoTimedEffects,
    useGroupScoring = false,
) {
    const grouped: Record<string, WIScanEntry[]> = {};
    for (const item of newEntries) {
        const g = (item as Record<string, unknown>).group;
        if (!g) continue;
        for (const gName of String(g).split(/,\s*/).filter(Boolean)) {
            if (!grouped[gName]) grouped[gName] = [];
            grouped[gName].push(item);
        }
    }
    if (!Object.keys(grouped).length) return;

    const remove = (e: WIScanEntry) => {
        const i = newEntries.indexOf(e);
        if (i !== -1) newEntries.splice(i, 1);
    };
    const removeAllBut = (grp: WIScanEntry[], chosen: WIScanEntry | null) => {
        for (const e of grp) if (e !== chosen) remove(e);
    };

    // Timed-effects filter
    const stickyMap = new Map<string, boolean>();
    for (const [gName, grp] of Object.entries(grouped)) {
        stickyMap.set(gName, false);
        const sticky = grp.filter((x) => timedEffects.isEffectActive('sticky', x));
        if (sticky.length) {
            for (const e of grp) if (!sticky.includes(e)) remove(e);
            stickyMap.set(gName, true);
        }
        for (const e of grp) {
            if (
                timedEffects.isEffectActive('cooldown', e) ||
                timedEffects.isEffectActive('delay', e)
            )
                remove(e);
        }
    }

    // Scoring filter
    for (const [gName, grp] of Object.entries(grouped)) {
        if (!useGroupScoring && !grp.some((x) => x.useGroupScoring)) continue;
        if (stickyMap.get(gName)) continue;
        const scores = grp.map((e) => buffer.getScore(e, scanState_));
        const max = Math.max(...scores);
        for (let i = 0; i < grp.length; i++) {
            if (!(grp[i]!.useGroupScoring ?? useGroupScoring)) continue;
            if (scores[i]! < max) {
                remove(grp[i]!);
                grp.splice(i, 1);
                scores.splice(i, 1);
                i--;
            }
        }
    }

    // Final selection per group
    for (const [gName, grp] of Object.entries(grouped)) {
        if (stickyMap.get(gName)) continue;
        if (
            Array.from(allActivatedEntries.values()).some(
                (x) => (x as Record<string, unknown>).group === gName,
            )
        ) {
            removeAllBut(grp, null);
            continue;
        }
        if (grp.length <= 1) continue;

        const prios = grp
            .filter((x) => Boolean((x as Record<string, unknown>).groupOverride))
            .toSorted(
                (a, b) =>
                    Number((b as Record<string, unknown>).order) -
                    Number((a as Record<string, unknown>).order),
            );
        if (prios.length) {
            removeAllBut(grp, prios[0]!);
            continue;
        }

        const totalW = grp.reduce(
            (a, e) => a + (Number((e as Record<string, unknown>).groupWeight) || DEFAULT_WEIGHT),
            0,
        );
        const roll = Math.random() * totalW;
        let acc = 0;
        let winner: WIScanEntry | null = null;
        for (const e of grp) {
            acc += Number((e as Record<string, unknown>).groupWeight) || DEFAULT_WEIGHT;
            if (roll <= acc) {
                winner = e;
                break;
            }
        }
        if (winner) removeAllBut(grp, winner);
    }
}

// ═══════════════════════════════════════════════════════════════
//  Scanning pipeline
// ═══════════════════════════════════════════════════════════════

/**
 * The cache of all world info data that was loaded from the backend.
 *
 * Calling `loadWorldInfo` will fill this cache and utilize this cache, so should be the preferred way to load any world info data.
 * Only use the cache directly if you need synchronous access.
 *
 * This will return a deep clone of the data, so no way to modify the data without actually saving it.
 * Should generally be only used for readonly access.
 * @type {StructuredCloneMap<string,object>}
 */
export const worldInfoCache = new StructuredCloneMap({ cloneOnGet: true, cloneOnSet: false });

/**
 * Gets the world info based on chat messages.
 * @param {string[]} chat - The chat messages to scan, in reverse order.
 * @param {number} maxContext - The maximum context size of the generation.
 * @param {boolean} isDryRun - If true, the function will not emit any events.
 * @param {WIGlobalScanData} globalScanData Chat independent context to be scanned
 * @returns {Promise<WIPromptResult>} The world info string and depth.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'chat' implicitly has an 'any' type.
export async function getWorldInfoPrompt(chat, maxContext, isDryRun, globalScanData) {
    let worldInfoString = '',
        worldInfoBefore = '',
        worldInfoAfter = '';

    const activatedWorldInfo = await checkWorldInfo(chat, maxContext, isDryRun, globalScanData);
    worldInfoBefore = activatedWorldInfo.worldInfoBefore;
    worldInfoAfter = activatedWorldInfo.worldInfoAfter;
    worldInfoString = worldInfoBefore + worldInfoAfter;

    if (
        !isDryRun &&
        activatedWorldInfo.allActivatedEntries &&
        activatedWorldInfo.allActivatedEntries.size > 0
    ) {
        const arg = Array.from(activatedWorldInfo.allActivatedEntries.values());
        await eventSource.emit(event_types.WORLD_INFO_ACTIVATED, arg);
    }

    return {
        worldInfoString,
        worldInfoBefore,
        worldInfoAfter,
        worldInfoExamples: activatedWorldInfo.EMEntries ?? [],
        worldInfoDepth: activatedWorldInfo.WIDepthEntries ?? [],
        anBefore: activatedWorldInfo.ANBeforeEntries ?? [],
        anAfter: activatedWorldInfo.ANAfterEntries ?? [],
        outletEntries: activatedWorldInfo.outletEntries ?? {},
    };
}

/**
 * Loads world info from the backend.
 *
 * This function will return from `worldInfoCache` if it has already been loaded before.
 * @param {string} name - The name of the world to load
 * @returns {Promise<object | null>} A promise that resolves to the loaded world information, or null if the request fails.
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'name' implicitly has an 'any' type.
export async function loadWorldInfo(name) {
    if (!name) {
        return;
    }

    if (worldInfoCache.has(name)) {
        return worldInfoCache.get(name);
    }

    const response = await fetch('/api/worldinfo/get', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ name: name }),
        cache: 'no-cache',
    });

    if (response.ok) {
        const data = await response.json();
        worldInfoCache.set(name, data);
        return data;
    }

    return null;
}

/**
 * Shared helper: loads entries from one or more lorebook files and annotates
 * each with its source world name.  This is the core mapping that all four
 * lore-source functions (global, character, chat, persona) previously duplicated.
 * @param worldNames
 */
async function loadLoreEntries(worldNames: string[]): Promise<object[]> {
    const entries: object[] = [];
    for (const worldName of worldNames) {
        const data = await loadWorldInfo(worldName);
        if (data?.entries) {
            for (const [uid, entry] of Object.entries(data.entries)) {
                entries.push({ uid: Number(uid), world: worldName, ...(entry as object) });
            }
        }
    }
    return entries;
}

/**
 * @returns {Promise<object[]>} Array of character lore entries
 */
async function getCharacterLore() {
    const character = characters[this_chid];
    const name = character?.name;
    /** @type {Set<string>} */
    let worldsToSearch = new Set();

    const baseWorldName = character?.data?.extensions?.world;
    if (baseWorldName) {
        worldsToSearch.add(baseWorldName);
    }

    // TODO: Maybe make the utility function not use the window context?
    const fileName = getCharaFilename(this_chid);
    const extraCharLore = (
        wiManager.info.charLore as Array<{ name: string; extraBooks: string[] }> | undefined
    )?.find((e) => e.name === fileName);
    if (extraCharLore) {
        worldsToSearch = new Set([...worldsToSearch, ...extraCharLore.extraBooks]);
    }

    if (!worldsToSearch.size) {
        return [];
    }

    // @ts-expect-error TS(7034) FIXME: Variable 'entries' implicitly has type 'any[]' in ...
    let entries = [];
    for (const worldName of worldsToSearch) {
        // @ts-expect-error TS(2345) FIXME: Argument of type 'unknown' is not assignable to pa...
        if (wiManager.selectedWorlds.includes(worldName)) {
            console.debug(
                `[WI] Character ${name}'s world ${worldName} is already activated in global world info! Skipping...`,
            );
            continue;
        }

        if (chat_metadata[METADATA_KEY] === worldName) {
            console.debug(
                `[WI] Character ${name}'s world ${worldName} is already activated in chat lore! Skipping...`,
            );
            continue;
        }

        if (power_user.persona_description_lorebook === worldName) {
            console.debug(
                `[WI] Character ${name}'s world ${worldName} is already activated in persona lore! Skipping...`,
            );
            continue;
        }

        // @ts-expect-error TS(7005) FIXME: Variable 'entries' implicitly has an 'any[]' type.
        entries = entries.concat(await loadLoreEntries([worldName]));

        if (!entries.length) {
            console.debug(
                `[WI] Character ${name}'s world ${worldName} could not be found or is empty`,
            );
        }
    }

    console.debug(`[WI] Character ${name}'s lore has ${entries.length} world info entries`, [
        ...worldsToSearch,
    ]);
    return entries;
}

/**
 * @returns {Promise<object[]>} Array of global lore entries
 */
async function getGlobalLore() {
    if (!wiManager.selectedWorlds?.length) {
        return [];
    }

    const entries = await loadLoreEntries(wiManager.selectedWorlds);

    console.debug(`[WI] Global world info has ${entries.length} entries`, wiManager.selectedWorlds);

    return entries;
}

/**
 * @returns {Promise<object[]>} Array of chat lore entries
 */
async function getChatLore() {
    const chatWorld = chat_metadata[METADATA_KEY];

    if (!chatWorld) {
        return [];
    }

    if (wiManager.selectedWorlds.includes(chatWorld)) {
        console.debug(
            `[WI] Chat world ${chatWorld} is already activated in global world info! Skipping...`,
        );
        return [];
    }

    const entries = await loadLoreEntries([chatWorld]);

    console.debug(`[WI] Chat lore has ${entries.length} entries`, [chatWorld]);

    return entries;
}

/**
 * @returns {Promise<object[]>} Array of persona lore entries
 */
async function getPersonaLore() {
    const chatWorld = chat_metadata[METADATA_KEY];
    const personaWorld = power_user.persona_description_lorebook;

    if (!personaWorld) {
        return [];
    }

    if (chatWorld === personaWorld) {
        console.debug(
            `[WI] Persona world ${personaWorld} is already activated in chat world! Skipping...`,
        );
        return [];
    }

    if (wiManager.selectedWorlds.includes(personaWorld)) {
        console.debug(
            `[WI] Persona world ${personaWorld} is already activated in global world info! Skipping...`,
        );
        return [];
    }

    const entries = await loadLoreEntries([personaWorld]);

    console.debug(`[WI] Persona lore has ${entries.length} entries`, [personaWorld]);

    return entries;
}

/**
 * @returns {Promise<object[]>} Sorted array of all lore entries
 */
export async function getSortedEntries() {
    try {
        const [globalLore, characterLore, chatLore, personaLore] = await Promise.all([
            getGlobalLore(),
            getCharacterLore(),
            getChatLore(),
            getPersonaLore(),
        ]);

        await eventSource.emit(event_types.WORLDINFO_ENTRIES_LOADED, {
            globalLore,
            characterLore,
            chatLore,
            personaLore,
        });

        let entries;

        switch (Number(wiManager.characterStrategy)) {
            case world_info_insertion_strategy.evenly:
                entries = [...globalLore, ...characterLore].toSorted(
                    wiManager.sortFn as (a: object, b: object) => number,
                );
                break;
            case world_info_insertion_strategy.character_first:
                entries = [
                    ...characterLore.toSorted(wiManager.sortFn as (a: object, b: object) => number),
                    ...globalLore.toSorted(wiManager.sortFn as (a: object, b: object) => number),
                ];
                break;
            case world_info_insertion_strategy.global_first:
                entries = [
                    ...globalLore.toSorted(wiManager.sortFn as (a: object, b: object) => number),
                    ...characterLore.toSorted(wiManager.sortFn as (a: object, b: object) => number),
                ];
                break;
            default:
                console.error(
                    '[WI] Unknown WI insertion strategy:',
                    wiManager.characterStrategy,
                    'defaulting to evenly',
                );
                entries = [...globalLore, ...characterLore].toSorted(
                    wiManager.sortFn as (a: object, b: object) => number,
                );
                break;
        }

        // Chat lore always goes first, then persona lore, then the rest
        entries = [
            ...chatLore.toSorted(wiManager.sortFn as (a: object, b: object) => number),
            ...personaLore.toSorted(wiManager.sortFn as (a: object, b: object) => number),
            ...entries,
        ];

        // Calculate hash and parse decorators. Split maps to preserve old hashes.
        entries = entries
            .map((entry) => {
                const [decorators, content] = parseDecorators(entry.content || '');
                return { ...entry, decorators, content };
            })
            .map((entry) => {
                const hash = getStringHash(JSON.stringify(entry));
                return { ...entry, hash };
            });

        console.debug(
            `[WI] Found ${entries.length} world lore entries. Sorted by strategy`,
            Object.entries(world_info_insertion_strategy).find(
                (x) => x[1] === wiManager.characterStrategy,
            ),
        );

        // Need to deep clone the entries to avoid modifying the cached data
        return structuredClone(entries);
    } catch (e) {
        console.error(e);
        return [];
    }
}

/**
 * Parse decorators from worldinfo content
 * @param {string} content The content to parse
 * @returns {[string[],string]} The decorators found in the content and the content without decorators
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'content' implicitly has an 'any' type.
function parseDecorators(content) {
    /**
     * Check if the decorator is known
     * @param {string} data string to check
     * @returns {boolean} true if the decorator is known
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'data' implicitly has an 'any' type.
    const isKnownDecorator = (data) => {
        if (data.startsWith('@@@')) {
            data = data.substring(1);
        }

        for (let i = 0; i < KNOWN_DECORATORS.length; i++) {
            if (data.startsWith(KNOWN_DECORATORS[i])) {
                return true;
            }
        }
        return false;
    };

    if (content.startsWith('@@')) {
        let newContent = content;
        const splited = content.split('\n');
        const decorators = [];
        let fallbacked = false;

        for (let i = 0; i < splited.length; i++) {
            if (splited[i].startsWith('@@')) {
                if (splited[i].startsWith('@@@') && !fallbacked) {
                    continue;
                }

                if (isKnownDecorator(splited[i])) {
                    decorators.push(
                        splited[i].startsWith('@@@') ? splited[i].substring(1) : splited[i],
                    );
                    fallbacked = false;
                } else {
                    fallbacked = true;
                }
            } else {
                newContent = splited.slice(i).join('\n');
                break;
            }
        }
        return [decorators, newContent];
    }

    return [[], content];
}

/**
 * Performs a scan on the chat and returns the world info activated.
 * @param {string[]} chat The chat messages to scan, in reverse order.
 * @param {number} maxContext The maximum context size of the generation.
 * @param {boolean} isDryRun Whether to perform a dry run.
 * @param {WIGlobalScanData} globalScanData Chat independent context to be scanned
 * @returns {Promise<WIActivated>} The world info activated.
 */
//MARK: checkWorldInfo
export async function checkWorldInfo(
    // @ts-expect-error TS(7006) FIXME: Parameter 'chat' implicitly has an 'any' type.
    chat,
    // @ts-expect-error TS(7006) FIXME: Parameter 'maxContext' implicitly has an 'any' type.
    maxContext,
    // @ts-expect-error TS(7006) FIXME: Parameter 'isDryRun' implicitly has an 'any' type.
    isDryRun,
    globalScanData = defaultGlobalScanData,
) {
    const context = getContext();
    const buffer = new WorldInfoBuffer(chat, globalScanData);

    console.debug(
        `[WI] --- START WI SCAN (on ${chat.length} messages, trigger = ${globalScanData.trigger})${isDryRun ? ' (DRY RUN)' : ''} ---`,
    );

    // Combine the chat

    // Add the depth or AN if enabled
    // Put this code here since otherwise, the chat reference is modified
    for (const key of Object.keys(context.extensionPrompts)) {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        if (context.extensionPrompts[key]?.scan) {
            const prompt = await getExtensionPromptByName(key);
            if (prompt) {
                buffer.addInject(prompt);
            }
        }
    }

    /** @type {scan_state} */
    let scanState: number = scan_state.INITIAL;
    let token_budget_overflowed = false;
    let count = 0;
    const allActivatedEntries = new Map();
    const failedProbabilityChecks = new Set();
    let allActivatedText = '';

    let budget = Math.round((wiManager.budget * maxContext) / 100) || 1;

    if (wiManager.budgetCap > 0 && budget > wiManager.budgetCap) {
        console.debug(`[WI] Budget ${budget} exceeds cap ${wiManager.budgetCap}, using cap`);
        budget = wiManager.budgetCap;
    }

    console.debug(
        `[WI] Context size: ${maxContext}; WI budget: ${budget} (max% = ${wiManager.budget}%, cap = ${wiManager.budgetCap})`,
    );
    const sortedEntries = await getSortedEntries();
    const timedEffects = new WorldInfoTimedEffects(chat, sortedEntries, isDryRun);

    timedEffects.checkTimedEffects();

    if (sortedEntries.length === 0) {
        return {
            worldInfoBefore: '',
            worldInfoAfter: '',
            WIDepthEntries: [],
            EMEntries: [],
            ANBeforeEntries: [],
            ANAfterEntries: [],
            outletEntries: {},
            allActivatedEntries: new Set(),
        };
    }

    /** @type {number[]} Represents the delay levels for entries that are delayed until recursion */
    const availableRecursionDelayLevels = [
        ...new Set(
            sortedEntries
                .filter((entry) => entry.delayUntilRecursion)
                .map((entry) =>
                    entry.delayUntilRecursion === true ? 1 : entry.delayUntilRecursion,
                ),
        ),
    ].toSorted((a, b) => a - b);
    // Already preset with the first level
    let currentRecursionDelayLevel = availableRecursionDelayLevels.shift() ?? 0;
    if (currentRecursionDelayLevel > 0 && availableRecursionDelayLevels.length) {
        console.debug(
            '[WI] Preparing first delayed recursion level',
            currentRecursionDelayLevel,
            '. Still delayed:',
            availableRecursionDelayLevels,
        );
    }

    console.debug(`[WI] --- SEARCHING ENTRIES (on ${sortedEntries.length} entries) ---`);

    while (scanState) {
        //if world_info_max_recursion_steps is non-zero min activations are disabled, and vice versa
        if (wiManager.maxRecursionSteps && wiManager.maxRecursionSteps <= count) {
            console.debug(
                '[WI] Search stopped by reaching max recursion steps',
                wiManager.maxRecursionSteps,
            );
            break;
        }

        // Track how many times the loop has run. May be useful for debugging.
        count++;

        console.debug(`[WI] --- LOOP #${count} START ---`);
        console.debug(
            '[WI] Scan state',
            Object.entries(scan_state).find((x) => x[1] === scanState),
        );

        // Until decided otherwise, we set the loop to stop scanning after this
        let nextScanState: number = scan_state.NONE;

        // Loop and find all entries that can activate here
        const activatedNow = new Set<WIScanEntry>();

        for (const entry of sortedEntries) {
            // Logging preparation
            let headerLogged = false;
            /**
             * @param {...unknown} args - Arguments to log
             * @returns {void}
             */
            // @ts-expect-error TS(7019) FIXME: Rest parameter 'args' implicitly has an 'any[]' ty... Remove this comment to see the full error message
            function log(...args) {
                if (!headerLogged) {
                    console.debug(
                        `[WI] Entry ${entry.uid}`,
                        `from '${entry.world}' processing`,
                        entry,
                    );
                    headerLogged = true;
                }
                console.debug(`[WI] Entry ${entry.uid}`, ...args);
            }

            // Already processed, considered and then skipped entries should still be skipped
            if (
                failedProbabilityChecks.has(entry) ||
                allActivatedEntries.has(`${entry.world}.${entry.uid}`)
            ) {
                continue;
            }

            if (entry.disable == true) {
                log('disabled');
                continue;
            }

            // Check for generation type trigger filter
            if (Array.isArray(entry.triggers) && entry.triggers.length > 0) {
                const isTriggered = entry.triggers.includes(globalScanData.trigger);
                if (!isTriggered) {
                    log(
                        `skipped by generation type trigger filter (${globalScanData.trigger} ∉ ${entry.triggers})`,
                    );
                    continue;
                }
            }

            // Check if this entry applies to the character or if it's excluded
            if (entry.characterFilter && entry.characterFilter?.names?.length > 0) {
                const nameIncluded = entry.characterFilter.names.includes(getCharaFilename());
                const filtered = entry.characterFilter.isExclude ? nameIncluded : !nameIncluded;

                if (filtered) {
                    log('filtered out by character');
                    continue;
                }
            }

            if (entry.characterFilter && entry.characterFilter?.tags?.length > 0) {
                const tagKey = getTagKeyForEntity(this_chid);

                if (tagKey) {
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    const tagMapEntry = context.tagMap[tagKey];

                    if (Array.isArray(tagMapEntry)) {
                        // If tag map intersects with the tag exclusion list, skip
                        const includesTag = tagMapEntry.some((tag) =>
                            entry.characterFilter.tags.includes(tag),
                        );
                        const filtered = entry.characterFilter.isExclude
                            ? includesTag
                            : !includesTag;

                        if (filtered) {
                            log('filtered out by tag');
                            continue;
                        }
                    }
                }
            }

            const isSticky = timedEffects.isEffectActive('sticky', entry);
            const isCooldown = timedEffects.isEffectActive('cooldown', entry);
            const isDelay = timedEffects.isEffectActive('delay', entry);

            if (isDelay) {
                log('suppressed by delay');
                continue;
            }

            if (isCooldown && !isSticky) {
                log('suppressed by cooldown');
                continue;
            }

            // Only use checks for recursion flags if the scan step was activated by recursion
            if (scanState !== scan_state.RECURSION && entry.delayUntilRecursion && !isSticky) {
                log('suppressed by delay until recursion');
                continue;
            }

            if (
                scanState === scan_state.RECURSION &&
                entry.delayUntilRecursion &&
                entry.delayUntilRecursion > currentRecursionDelayLevel &&
                !isSticky
            ) {
                log(
                    'suppressed by delay until recursion level',
                    entry.delayUntilRecursion,
                    '. Currently',
                    currentRecursionDelayLevel,
                );
                continue;
            }

            if (
                scanState === scan_state.RECURSION &&
                wiManager.recursive &&
                entry.excludeRecursion &&
                !isSticky
            ) {
                log('suppressed by exclude recursion');
                continue;
            }

            if (entry.decorators.includes('@@activate')) {
                log('activated by @@activate decorator');
                activatedNow.add(entry);
                continue;
            }

            if (entry.decorators.includes('@@dont_activate')) {
                log('suppressed by @@dont_activate decorator');
                continue;
            }

            if (buffer.getExternallyActivated(entry)) {
                log('externally activated');
                activatedNow.add(buffer.getExternallyActivated(entry) as WIScanEntry);
                continue;
            }

            // Now do checks for immediate activations
            if (entry.constant) {
                log('activated because of constant');
                activatedNow.add(entry);
                continue;
            }

            if (isSticky) {
                log('activated because active sticky');
                activatedNow.add(entry);
                continue;
            }

            if (!Array.isArray(entry.key) || !entry.key.length) {
                log('has no keys defined, skipped');
                continue;
            }

            // Cache the text to scan before the loop, it won't change its content
            const textToScan = buffer.get(entry, scanState);

            // PRIMARY KEYWORDS
            // @ts-expect-error TS(7006) FIXME: Parameter 'key' implicitly has an 'any' type.
            const primaryKeyMatch = entry.key.find((key) => {
                const substituted = substituteParams(key);
                return substituted && buffer.matchKeys(textToScan, substituted.trim(), entry);
            });

            if (!primaryKeyMatch) {
                // Don't write logs for simple no-matches
                continue;
            }

            const hasSecondaryKeywords =
                entry.selective && //all entries are selective now
                Array.isArray(entry.keysecondary) && //always true
                entry.keysecondary.length; //ignore empties

            if (!hasSecondaryKeywords) {
                // Handle cases where secondary is empty
                log('activated by primary key match', primaryKeyMatch);
                activatedNow.add(entry);
                continue;
            }

            // SECONDARY KEYWORDS
            const selectiveLogic = entry.selectiveLogic ?? 0; // If selectiveLogic isn't found, assume it's AND, only do this once per entry
            log(
                'Entry with primary key match',
                primaryKeyMatch,
                'has secondary keywords. Checking with logic logic',
                Object.entries(world_info_logic).find((x) => x[1] === entry.selectiveLogic),
            );

            /** @type {() => boolean} */
            function matchSecondaryKeys() {
                let hasAnyMatch = false;
                let hasAllMatch = true;
                for (const keysecondary of entry.keysecondary) {
                    const secondarySubstituted = substituteParams(keysecondary);
                    const hasSecondaryMatch =
                        secondarySubstituted &&
                        buffer.matchKeys(textToScan, secondarySubstituted.trim(), entry);

                    if (hasSecondaryMatch) hasAnyMatch = true;
                    if (!hasSecondaryMatch) hasAllMatch = false;

                    // Simplified AND ANY / NOT ALL if statement. (Proper fix for PR#1356 by Bronya)
                    // If AND ANY logic and the main checks pass OR if NOT ALL logic and the main checks do not pass
                    if (selectiveLogic === world_info_logic.AND_ANY && hasSecondaryMatch) {
                        log(
                            'activated. (AND ANY) Found match secondary keyword',
                            secondarySubstituted,
                        );
                        return true;
                    }
                    if (selectiveLogic === world_info_logic.NOT_ALL && !hasSecondaryMatch) {
                        log(
                            'activated. (NOT ALL) Found not matching secondary keyword',
                            secondarySubstituted,
                        );
                        return true;
                    }
                }

                // Handle NOT ANY logic
                if (selectiveLogic === world_info_logic.NOT_ANY && !hasAnyMatch) {
                    log('activated. (NOT ANY) No secondary keywords found', entry.keysecondary);
                    return true;
                }

                // Handle AND ALL logic
                if (selectiveLogic === world_info_logic.AND_ALL && hasAllMatch) {
                    log('activated. (AND ALL) All secondary keywords found', entry.keysecondary);
                    return true;
                }

                return false;
            }

            const matched = matchSecondaryKeys();
            if (!matched) {
                log('skipped. Secondary keywords not satisfied', entry.keysecondary);
                continue;
            }

            // Success logging was already done inside the function, so just add the entry
            activatedNow.add(entry);
            continue;
        }

        console.debug(`[WI] Search done. Found ${activatedNow.size} possible entries.`);

        // Sort the entries for the probability and the budget limit checks
        const newEntries = [...activatedNow].toSorted((a, b) => {
            const isASticky = timedEffects.isEffectActive('sticky', a as WIScanEntry) ? 1 : 0;
            const isBSticky = timedEffects.isEffectActive('sticky', b as WIScanEntry) ? 1 : 0;
            return isBSticky - isASticky || sortedEntries.indexOf(a) - sortedEntries.indexOf(b);
        });

        let newContent = '';
        const textToScanTokens = await getTokenCountAsync(allActivatedText);

        filterByInclusionGroups(
            newEntries as WIScanEntry[],
            allActivatedEntries,
            buffer,
            scanState,
            timedEffects,
        );

        console.debug('[WI] --- PROBABILITY CHECKS ---');
        if (!newEntries.length) console.debug('[WI] No probability checks to do');

        let ignoresBudget = newEntries.filter((e) => e.ignoreBudget).length;

        for (const entry of newEntries) {
            ignoresBudget -= entry.ignoreBudget ? 1 : 0;
            if (token_budget_overflowed && !entry.ignoreBudget) {
                if (ignoresBudget > 0) {
                    continue;
                }
                break;
            }

            /**
             * @returns {boolean} Whether the probability check passes
             */
            function verifyProbability() {
                // If we don't need to roll, it's always true
                if (!entry.useProbability || entry.probability === 100) {
                    console.debug(`WI entry ${entry.uid} does not use probability`);
                    return true;
                }

                const isSticky = timedEffects.isEffectActive('sticky', entry);
                if (isSticky) {
                    console.debug(
                        `WI entry ${entry.uid} is sticky, does not need to re-roll probability`,
                    );
                    return true;
                }

                const rollValue = Math.random() * 100;
                if (rollValue <= (entry.probability as number)) {
                    console.debug(
                        `WI entry ${entry.uid} passed probability check of ${entry.probability}%`,
                    );
                    return true;
                }

                failedProbabilityChecks.add(entry);
                return false;
            }

            const success = verifyProbability();
            if (!success) {
                console.debug(
                    `WI entry ${entry.uid} failed probability check, removing from activated entries`,
                    entry,
                );
                continue;
            }

            // Substitute macros inline, for both this checking and also future processing
            entry.content = substituteParams(entry.content);
            newContent += `${entry.content}\n`;

            if (
                !entry.ignoreBudget &&
                textToScanTokens + (await getTokenCountAsync(newContent)) >= budget
            ) {
                if (!token_budget_overflowed) {
                    console.debug('[WI] --- BUDGET OVERFLOW CHECK ---');
                    if (wiManager.overflowAlert) {
                        console.warn(
                            `[WI] budget of ${budget} reached, stopping after ${allActivatedEntries.size} entries`,
                        );
                        notyf.warning(
                            `World info budget reached after ${allActivatedEntries.size} entries.`,
                            'World Info',
                        );
                    } else {
                        console.debug(
                            `[WI] budget of ${budget} reached, stopping after ${allActivatedEntries.size} entries`,
                        );
                    }
                    token_budget_overflowed = true;
                }
                continue;
            }

            allActivatedEntries.set(`${entry.world}.${entry.uid}`, entry);
            console.debug(`[WI] Entry ${entry.uid} activation successful, adding to prompt`, entry);
        }

        const successfulNewEntries = newEntries.filter((x) => !failedProbabilityChecks.has(x));
        const successfulNewEntriesForRecursion = successfulNewEntries.filter(
            (x) => !x.preventRecursion,
        );

        console.debug(`[WI] --- LOOP #${count} RESULT ---`);
        if (!newEntries.length) {
            console.debug('[WI] No new entries activated.');
        } else if (!successfulNewEntries.length) {
            console.debug(
                '[WI] Probability checks failed for all activated entries. No new entries activated.',
            );
        } else {
            console.debug(
                `[WI] Successfully activated ${successfulNewEntries.length} new entries to prompt. ${allActivatedEntries.size} total entries activated.`,
                successfulNewEntries,
            );
        }

        /**
         * @param {...unknown} args - Arguments to log
         * @returns {void}
         */
        // @ts-expect-error TS(7019) FIXME: Rest parameter 'args' implicitly has an 'any[]' ty... Remove this comment to see the full error message
        function logNextState(...args) {
            if (args.length) console.debug(args.shift(), ...args);
            console.debug(
                '[WI] Setting scan state',
                Object.entries(scan_state).find((x) => x[1] === scanState),
            );
        }

        // After processing and rolling entries is done, see if we should continue with normal recursion
        if (
            wiManager.recursive &&
            !token_budget_overflowed &&
            successfulNewEntriesForRecursion.length
        ) {
            nextScanState = scan_state.RECURSION;
            logNextState(
                '[WI] Found',
                successfulNewEntriesForRecursion.length,
                'new entries for recursion',
            );
        }

        // If we are inside min activations scan, and we have recursive buffer, we should do a recursive scan before increasing the buffer again
        // There might be recurse-trigger-able entries that match the buffer, so we need to check that
        if (
            wiManager.recursive &&
            !token_budget_overflowed &&
            scanState === scan_state.MIN_ACTIVATIONS &&
            buffer.hasRecurse()
        ) {
            nextScanState = scan_state.RECURSION;
            logNextState(
                '[WI] Min Activations run done, whill will always be followed by a recursive scan',
            );
        }

        // If scanning is planned to stop, but min activations is set and not satisfied, check if we should continue
        const minActivationsNotSatisfied =
            wiManager.minActivations > 0 && allActivatedEntries.size < wiManager.minActivations;
        if (!nextScanState && !token_budget_overflowed && minActivationsNotSatisfied) {
            console.debug('[WI] --- MIN ACTIVATIONS CHECK ---');

            const over_max =
                (wiManager.minActivationsDepthMax > 0 &&
                    buffer.getDepth() > wiManager.minActivationsDepthMax) ||
                buffer.getDepth() > chat.length;

            if (!over_max) {
                nextScanState = scan_state.MIN_ACTIVATIONS; // loop
                logNextState(
                    `[WI] Min activations not reached (${allActivatedEntries.size}/${wiManager.minActivations}), advancing depth to ${buffer.getDepth() + 1}, starting another scan`,
                );
                buffer.advanceScan();
            } else {
                console.debug(
                    `[WI] Min activations not reached (${allActivatedEntries.size}/${wiManager.minActivations}), but reached on of depth. Stopping`,
                );
            }
        }

        // If the scan is done, but we still have open \"delay until recursion\" levels, we should continue with the next one
        if (nextScanState === scan_state.NONE && availableRecursionDelayLevels.length) {
            nextScanState = scan_state.RECURSION;
            currentRecursionDelayLevel = availableRecursionDelayLevels.shift();
            logNextState(
                '[WI] Open delayed recursion levels left. Preparing next delayed recursion level',
                currentRecursionDelayLevel,
                '. Still delayed:',
                availableRecursionDelayLevels,
            );
        }

        // Final check if we should really continue scan, and extend the current WI recurse buffer
        const curScanState = scanState;
        scanState = nextScanState;
        if (scanState) {
            const text = successfulNewEntriesForRecursion.map((x) => x.content).join('\n');
            if (text) {
                buffer.addRecurse(text);
                allActivatedText = text + '\n' + allActivatedText;
            }
        } else {
            logNextState('[WI] Scan done. No new entries to prompt. Stopping.');
        }

        // Fire an event after each scan loop, so extensions can hook into the current scanning state
        // @ts-expect-error TS(7022) FIXME: 'args' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const args = {
            state: {
                current: curScanState,
                next: scanState,
                loopCount: count,
            },
            new: {
                all: newEntries,
                successful: successfulNewEntries,
            },
            activated: {
                entries: allActivatedEntries,
                text: allActivatedText,
            },
            sortedEntries,
            recursionDelay: {
                availableLevels: availableRecursionDelayLevels,
                currentLevel: currentRecursionDelayLevel,
            },
            budget: {
                current: budget,
                overflowed: token_budget_overflowed,
            },
            timedEffects,
        };
        await eventSource.emit(event_types.WORLDINFO_SCAN_DONE, args);

        // Some fields are allowed to be changed by listeners, those will be handled here manually. They can be updated via changed the args from the listeners.
        // Any array provided directly can be modified by updating it's elements, adding or removing elements. This has to be done consistently.
        if (args.state.next !== scanState) {
            logNextState('[WI] Scan state changed from', scanState, 'to', args.state.next);
            scanState = args.state.next;
        }
        allActivatedText = args.activated.text;
        currentRecursionDelayLevel = args.recursionDelay.currentLevel;
        budget = args.budget.current;
        token_budget_overflowed = args.budget.overflowed;
    }

    console.debug('[WI] --- BUILDING PROMPT ---');

    // Forward-sorted list of entries for joining
    // @ts-expect-error TS(7034) FIXME: Variable 'WIBeforeEntries' implicitly has type 'an... Remove this comment to see the full error message
    const WIBeforeEntries = [];
    // @ts-expect-error TS(7034) FIXME: Variable 'WIAfterEntries' implicitly has type 'any... Remove this comment to see the full error message
    const WIAfterEntries = [];
    // @ts-expect-error TS(7034) FIXME: Variable 'EMEntries' implicitly has type 'any[]' i... Remove this comment to see the full error message
    const EMEntries = [];
    // @ts-expect-error TS(7034) FIXME: Variable 'ANTopEntries' implicitly has type 'any[]... Remove this comment to see the full error message
    const ANTopEntries = [];
    // @ts-expect-error TS(7034) FIXME: Variable 'ANBottomEntries' implicitly has type 'an... Remove this comment to see the full error message
    const ANBottomEntries = [];
    // @ts-expect-error TS(7034) FIXME: Variable 'WIDepthEntries' implicitly has type 'any... Remove this comment to see the full error message
    const WIDepthEntries = [];
    /** @type {{[key: string]: string[]}} */
    const WIOutletEntries = {};

    // Appends from insertion order 999 to 1. Use unshift for this purpose
    // TODO (kingbri): Change to use WI Anchor positioning instead of separate top/bottom arrays
    [...allActivatedEntries.values()].toSorted(wiManager.sortFn).forEach((entry) => {
        const regexDepth =
            entry.position === world_info_position.atDepth ? (entry.depth ?? DEFAULT_DEPTH) : null;
        const content = getRegexedString(entry.content, regex_placement.WORLD_INFO, {
            depth: regexDepth,
            isMarkdown: false,
            isPrompt: true,
        });

        if (!content) {
            console.debug(
                `[WI] Entry ${entry.uid}`,
                'skipped adding to prompt due to empty content',
                entry,
            );
            return;
        }

        switch (entry.position) {
            case world_info_position.before:
                WIBeforeEntries.unshift(content);
                break;
            case world_info_position.after:
                WIAfterEntries.unshift(content);
                break;
            case world_info_position.EMTop:
                EMEntries.unshift({ position: wi_anchor_position.before, content: content });
                break;
            case world_info_position.EMBottom:
                EMEntries.unshift({ position: wi_anchor_position.after, content: content });
                break;
            case world_info_position.ANTop:
                ANTopEntries.unshift(content);
                break;
            case world_info_position.ANBottom:
                ANBottomEntries.unshift(content);
                break;
            case world_info_position.atDepth: {
                // @ts-expect-error TS(7005) FIXME: Variable 'WIDepthEntries' implicitly has an 'any[]... Remove this comment to see the full error message
                const existingDepthIndex = WIDepthEntries.findIndex(
                    (e) =>
                        e.depth === (entry.depth ?? DEFAULT_DEPTH) &&
                        e.role === (entry.role ?? extension_prompt_roles.SYSTEM),
                );
                if (existingDepthIndex !== -1) {
                    // @ts-expect-error TS(7005) FIXME: Variable 'WIDepthEntries' implicitly has an 'any[]... Remove this comment to see the full error message
                    WIDepthEntries[existingDepthIndex].entries.unshift(content);
                } else {
                    WIDepthEntries.push({
                        depth: entry.depth,
                        entries: [content],
                        role: entry.role ?? extension_prompt_roles.SYSTEM,
                    });
                }
                break;
            }
            case world_info_position.outlet: {
                if (!entry.outletName) {
                    console.warn(
                        `[WI] Entry ${entry.uid} has position 'outlet' but no outlet name. Skipping.`,
                    );
                    break;
                }
                // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                if (Array.isArray(WIOutletEntries[entry.outletName])) {
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    WIOutletEntries[entry.outletName].push(content);
                } else {
                    // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    WIOutletEntries[entry.outletName] = [content];
                }
                break;
            }
            default:
                break;
        }
    });

    // @ts-expect-error TS(7005) FIXME: Variable 'WIBeforeEntries' implicitly has an 'any[... Remove this comment to see the full error message
    const worldInfoBefore = WIBeforeEntries.length ? WIBeforeEntries.join('\n') : '';
    // @ts-expect-error TS(7005) FIXME: Variable 'WIAfterEntries' implicitly has an 'any[]... Remove this comment to see the full error message
    const worldInfoAfter = WIAfterEntries.length ? WIAfterEntries.join('\n') : '';

    if (shouldWIAddPrompt) {
        // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        const originalAN = context.extensionPrompts[NOTE_MODULE_NAME].value;
        const ANWithWI =
            // @ts-expect-error TS(7005) FIXME: Variable 'ANTopEntries' implicitly has an 'any' type.
            `${ANTopEntries.join('\n')}\n${originalAN}\n${ANBottomEntries.join('\n')}`.replace(
                /(^\n)|(\n$)/g,
                '',
            );
        context.setExtensionPrompt(
            NOTE_MODULE_NAME,
            ANWithWI,
            chat_metadata[metadata_keys.position],
            chat_metadata[metadata_keys.depth],
            // @ts-expect-error TS(18046) FIXME: 'extension_settings.note' is of type 'unknown'.
            extension_settings.note.allowWIScan,
            chat_metadata[metadata_keys.role],
        );
    }

    timedEffects.setTimedEffects(Array.from(allActivatedEntries.values()));
    buffer.resetExternalEffects();
    timedEffects.cleanUp();

    console.log(
        `[WI] ${isDryRun ? 'Hypothetically adding' : 'Adding'} ${allActivatedEntries.size} entries to prompt`,
        Array.from(allActivatedEntries.values()),
    );
    console.debug(`[WI] --- DONE${isDryRun ? ' (DRY RUN)' : ''} ---`);

    return {
        worldInfoBefore,
        worldInfoAfter,
        // @ts-expect-error TS(7005) FIXME: Variable 'EMEntries' implicitly has an 'any' type.
        EMEntries,
        // @ts-expect-error TS(7005) FIXME: Variable 'WIDepthEntries' implicitly has an 'any' type.
        WIDepthEntries,
        // @ts-expect-error TS(7005) FIXME: Variable 'ANTopEntries' implicitly has an 'any' type.
        ANBeforeEntries: ANTopEntries,
        // @ts-expect-error TS(7005) FIXME: Variable 'ANBottomEntries' implicitly has an 'any' type.
        ANAfterEntries: ANBottomEntries,
        outletEntries: WIOutletEntries,
        allActivatedEntries: new Set(allActivatedEntries.values()),
    };
}
