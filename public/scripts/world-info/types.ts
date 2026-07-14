/** Chat-independent data that entries can be configured to scan against */
export interface WIGlobalScanData {
    trigger: string;
    personaDescription: string;
    characterDescription: string;
    characterPersonality: string;
    characterDepthPrompt: string;
    scenario: string;
    creatorNotes: string;
}

/** An entry that triggered (or may trigger) a WI scan */
export interface WIScanEntry {
    uid?: number;
    world?: string;
    scanDepth?: number;
    caseSensitive?: boolean;
    matchWholeWords?: boolean;
    useGroupScoring?: boolean;
    matchPersonaDescription?: boolean;
    matchCharacterDescription?: boolean;
    matchCharacterPersonality?: boolean;
    matchCharacterDepthPrompt?: boolean;
    matchScenario?: boolean;
    matchCreatorNotes?: boolean;
    key?: string[];
    keysecondary?: string[];
    selectiveLogic?: number;
    sticky?: number;
    cooldown?: number;
    delay?: number;
    decorators?: string[];
    hash?: number;
    [key: string]: unknown;
}

/** A timed effect (sticky / cooldown / delay) stored in chat_metadata */
export interface WITimedEffect {
    hash: number;
    start: number;
    end: number;
    protected: boolean;
}

export type TimedEffectType = 'sticky' | 'cooldown' | 'delay';

/** Result returned from the WI scanning pipeline */
export interface WIPromptResult {
    worldInfoString: string;
    worldInfoBefore: string;
    worldInfoAfter: string;
    worldInfoExamples: unknown[];
    worldInfoDepth: unknown[];
    anBefore: unknown[];
    anAfter: unknown[];
    outletEntries: Record<string, string[]>;
}

/** Internal result of a completed scan */
export interface WIActivated {
    worldInfoBefore: string;
    worldInfoAfter: string;
    EMEntries: unknown[];
    WIDepthEntries: unknown[];
    ANBeforeEntries: unknown[];
    ANAfterEntries: unknown[];
    outletEntries: Record<string, string[]>;
    allActivatedEntries: Set<unknown>;
}

/** Definition of a single WI entry field (for the editor template) */
export interface WIEntryFieldDefinition {
    default: string | number | boolean | null;
    type: 'string' | 'number' | 'boolean' | 'array' | 'enum';
    excludeFromTemplate?: boolean;
    arrayFilter?: (value: unknown) => boolean;
}

/** Persisted WI settings */
export interface WorldInfoSettings {
    world_info: Record<string, unknown>;
    world_info_depth: number;
    world_info_min_activations: number;
    world_info_min_activations_depth_max: number;
    world_info_budget: number;
    world_info_include_names: boolean;
    world_info_recursive: boolean;
    world_info_overflow_alert: boolean;
    world_info_case_sensitive: boolean;
    world_info_match_whole_words: boolean;
    world_info_character_strategy: number;
    world_info_budget_cap: number;
    world_info_use_group_scoring: boolean;
    world_info_max_recursion_steps: number;
}

/** A world-info entry as stored in the book data */
export interface WorldInfoEntryData {
    uid: number;
    key: string[];
    keysecondary: string[];
    comment: string;
    content: string;
    constant: boolean;
    vectorized: boolean;
    selective: boolean;
    selectiveLogic: number;
    addMemo: boolean;
    order: number;
    position: number;
    disable: boolean;
    ignoreBudget: boolean;
    excludeRecursion: boolean;
    preventRecursion: boolean;
    matchPersonaDescription: boolean;
    matchCharacterDescription: boolean;
    matchCharacterPersonality: boolean;
    matchCharacterDepthPrompt: boolean;
    matchScenario: boolean;
    matchCreatorNotes: boolean;
    delayUntilRecursion: number | boolean;
    probability: number | null;
    useProbability: boolean;
    depth: number;
    outletName: string;
    group: string;
    groupOverride: boolean;
    groupWeight: number;
    scanDepth: number | null;
    caseSensitive: boolean | null;
    matchWholeWords: boolean | null;
    useGroupScoring: boolean | null;
    automationId: string;
    role: number;
    sticky: number | null;
    cooldown: number | null;
    delay: number | null;
    triggers: string[];
    characterFilter?: {
        isExclude: boolean;
        names: string[];
        tags: string[];
    };
    displayIndex?: number;
}

/** A world-info book as stored on the server */
export interface WorldInfoBook {
    entries: Record<string, WorldInfoEntryData>;
    originalData?: {
        entries: Record<string, unknown>[];
        [key: string]: unknown;
    };
    name?: string;
    [key: string]: unknown;
}
