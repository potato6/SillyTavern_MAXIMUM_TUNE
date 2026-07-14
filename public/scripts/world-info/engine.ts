/**
 * World Info scanning engine — core classes.
 *
 * DOM-free core: knows nothing about Popup, templates, jQuery, or UI state.
 * The big scanning pipeline (checkWorldInfo) lives in world-info.ts and
 * will be migrated here in a follow-up pass once the class dependencies
 * are verified stable.
 */

import { escapeRegex } from '../utils.js';
import { chat_metadata } from '../../script.js';

import {
    world_info_logic,
    scan_state,
    MAX_SCAN_DEPTH,
    DEFAULT_WEIGHT,
    KNOWN_DECORATORS,
} from './constants.js';

import type { WIGlobalScanData, WIScanEntry, WITimedEffect, TimedEffectType } from './types.js';

// ═══════════════════════════════════════════════════════════════
//  Regex helpers
// ═══════════════════════════════════════════════════════════════

/** Validates if a string is a valid slash-delimited regex. */
export function isValidRegex(input: string): boolean {
    return parseRegexFromString(input) !== null;
}

/**
 * Parses a slash-delimited regex string into a RegExp object.
 * Format: `/pattern/flags`
 */
export function parseRegexFromString(input: string): RegExp | null {
    const match = input.match(/^\/([\w\W]+?)\/([gimsuy]*)$/);
    if (!match) return null;
    const [, rawPattern, flags] = match;
    let pattern = rawPattern;
    if (pattern.match(/(^|[^\\])\//)) return null;
    pattern = pattern.replace('\\/', '/');
    try { return new RegExp(pattern, flags); }
    catch { return null; }
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
            if (messages[depth]) this.#depthBuffer[depth] = messages[depth].trim();
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
        if (depth < 0) { console.error(`[WI] Invalid depth ${depth}`); return ''; }
        if (depth > MAX_SCAN_DEPTH) { console.warn(`[WI] Truncating depth to ${MAX_SCAN_DEPTH}`); depth = MAX_SCAN_DEPTH; }

        const SEP = '\x01';
        const J = '\n' + SEP;
        let r = SEP + this.#depthBuffer.slice(this.#startDepth, depth).join(J);

        const gs = this.#globalScanData;
        if (entry.matchPersonaDescription && gs?.personaDescription) r += J + gs.personaDescription;
        if (entry.matchCharacterDescription && gs?.characterDescription) r += J + gs.characterDescription;
        if (entry.matchCharacterPersonality && gs?.characterPersonality) r += J + gs.characterPersonality;
        if (entry.matchCharacterDepthPrompt && gs?.characterDepthPrompt) r += J + gs.characterDepthPrompt;
        if (entry.matchScenario && gs?.scenario) r += J + gs.scenario;
        if (entry.matchCreatorNotes && gs?.creatorNotes) r += J + gs.creatorNotes;
        if (this.#injectBuffer.length > 0) r += J + this.#injectBuffer.join(J);
        if (this.#recurseBuffer.length > 0 && scanState !== scan_state.MIN_ACTIVATIONS) r += J + this.#recurseBuffer.join(J);
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

    addRecurse(m: string) { this.#recurseBuffer.push(m); }
    addInject(m: string) { this.#injectBuffer.push(m); }
    hasRecurse(): boolean { return this.#recurseBuffer.length > 0; }
    advanceScan() { this.#skew++; }
    getDepth(): number { return this.#depthSetting + this.#skew; }

    getExternallyActivated(entry: WIScanEntry): object | undefined {
        return WorldInfoBuffer.externalActivations.get(`${entry.world}.${entry.uid}`);
    }
    resetExternalEffects() { WorldInfoBuffer.externalActivations = new Map(); }

    getScore(entry: WIScanEntry, scanState_: number): number {
        const buf = this.get(entry, scanState_);
        let n1 = 0, n2 = 0, s1 = 0, s2 = 0;

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
            chat_metadata.timedWorldInfo.cooldown[key] = eff;
            this.#buffer.cooldown.push(entry);
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
            if (!chat_metadata.timedWorldInfo[t] || typeof chat_metadata.timedWorldInfo[t] !== 'object')
                chat_metadata.timedWorldInfo[t] = {};
            Object.entries(chat_metadata.timedWorldInfo[t]).forEach(([k, v]) => {
                if (!v || typeof v !== 'object') delete chat_metadata.timedWorldInfo[t][k];
            });
        }
    }

    #hash(e: WIScanEntry): number { return e.hash ?? 0; }
    #ekey(e: WIScanEntry): string { return `${e.world}.${e.uid}`; }
    #mkEffect(t: string, e: WIScanEntry, p: boolean): WITimedEffect {
        return { hash: this.#hash(e), start: this.#chat.length, end: this.#chat.length + Number((e as any)[t]), protected: p };
    }

    #checkType(type: string, buf: WIScanEntry[], onEnded: (e: WIScanEntry) => void) {
        const effects: [string, any][] = Object.entries(chat_metadata.timedWorldInfo[type] ?? {});
        for (const [key, val] of effects) {
            const entry = this.#entries.find(x => String(this.#hash(x)) === String(val.hash));
            if (this.#chat.length <= Number(val.start) && !val.protected) { delete chat_metadata.timedWorldInfo[type][key]; continue; }
            if (!entry) { if (this.#chat.length >= Number(val.end)) delete chat_metadata.timedWorldInfo[type][key]; continue; }
            if (!(entry as any)[type]) { delete chat_metadata.timedWorldInfo[type][key]; continue; }
            if (this.#chat.length >= Number(val.end)) { delete chat_metadata.timedWorldInfo[type][key]; onEnded(entry); continue; }
            buf.push(entry);
        }
    }

    #checkDelay(buf: WIScanEntry[]) {
        for (const e of this.#entries) {
            if ((e as any).delay && this.#chat.length < Number((e as any).delay)) buf.push(e);
        }
    }

    checkTimedEffects() {
        if (!this.#isDryRun) {
            this.#checkType('sticky', this.#buffer.sticky, this.#onEnded.sticky.bind(this));
            this.#checkType('cooldown', this.#buffer.cooldown, this.#onEnded.cooldown.bind(this));
        }
        this.#checkDelay(this.#buffer.delay);
    }

    getEffectMetadata(type: string, e: WIScanEntry): WITimedEffect | null {
        if (!this.isValidType(type)) return null;
        return chat_metadata.timedWorldInfo[type]?.[this.#ekey(e)] ?? null;
    }

    setTimedEffects(activated: WIScanEntry[]) {
        if (this.#isDryRun) return;
        for (const e of activated) {
            for (const t of ['sticky', 'cooldown'] as const) {
                if (!(e as any)[t]) continue;
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
        if (state) chat_metadata.timedWorldInfo[type][this.#ekey(e)] = this.#mkEffect(type, e, false);
    }

    isValidType(type: string): boolean { return ['sticky', 'cooldown', 'delay'].includes(type.trim().toLowerCase()); }

    isEffectActive(type: string, e: WIScanEntry): boolean {
        if (!this.isValidType(type)) return false;
        return this.#buffer[type]?.some(x => this.#hash(x) === this.#hash(e)) ?? false;
    }

    cleanUp() { for (const b of Object.values(this.#buffer)) b.splice(0, b.length); }
}

// ═══════════════════════════════════════════════════════════════
//  Group filtering
// ═══════════════════════════════════════════════════════════════

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
        const g = (item as any).group;
        if (!g) continue;
        for (const gName of String(g).split(/,\s*/).filter(Boolean)) {
            if (!grouped[gName]) grouped[gName] = [];
            grouped[gName].push(item);
        }
    }
    if (!Object.keys(grouped).length) return;

    const remove = (e: WIScanEntry) => { const i = newEntries.indexOf(e); if (i !== -1) newEntries.splice(i, 1); };
    const removeAllBut = (grp: WIScanEntry[], chosen: WIScanEntry | null) => {
        for (const e of grp) if (e !== chosen) remove(e);
    };

    // Timed-effects filter
    const stickyMap = new Map<string, boolean>();
    for (const [gName, grp] of Object.entries(grouped)) {
        stickyMap.set(gName, false);
        const sticky = grp.filter(x => timedEffects.isEffectActive('sticky', x));
        if (sticky.length) {
            for (const e of grp) if (!sticky.includes(e)) remove(e);
            stickyMap.set(gName, true);
        }
        for (const e of grp) {
            if (timedEffects.isEffectActive('cooldown', e) || timedEffects.isEffectActive('delay', e)) remove(e);
        }
    }

    // Scoring filter
    for (const [gName, grp] of Object.entries(grouped)) {
        if (!useGroupScoring && !grp.some(x => x.useGroupScoring)) continue;
        if (stickyMap.get(gName)) continue;
        const scores = grp.map(e => buffer.getScore(e, scanState_));
        const max = Math.max(...scores);
        for (let i = 0; i < grp.length; i++) {
            if (!(grp[i].useGroupScoring ?? useGroupScoring)) continue;
            if (scores[i] < max) { remove(grp[i]); grp.splice(i, 1); scores.splice(i, 1); i--; }
        }
    }

    // Final selection per group
    for (const [gName, grp] of Object.entries(grouped)) {
        if (stickyMap.get(gName)) continue;
        if (Array.from(allActivatedEntries.values()).some(x => (x as any).group === gName)) { removeAllBut(grp, null); continue; }
        if (grp.length <= 1) continue;

        const prios = grp.filter(x => (x as any).groupOverride).sort((a, b) => (b as any).order - (a as any).order);
        if (prios.length) { removeAllBut(grp, prios[0]); continue; }

        const totalW = grp.reduce((a, e) => a + ((e as any).groupWeight ?? DEFAULT_WEIGHT), 0);
        let roll = Math.random() * totalW, acc = 0, winner: WIScanEntry | null = null;
        for (const e of grp) {
            acc += (e as any).groupWeight ?? DEFAULT_WEIGHT;
            if (roll <= acc) { winner = e; break; }
        }
        if (winner) removeAllBut(grp, winner);
    }
}
