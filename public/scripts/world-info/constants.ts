// ── Insertion strategies ──
export const world_info_insertion_strategy = {
    evenly: 0,
    character_first: 1,
    global_first: 2,
} as const;

// ── Selective logic modes ──
export const world_info_logic = {
    AND_ANY: 0,
    NOT_ALL: 1,
    NOT_ANY: 2,
    AND_ALL: 3,
} as const;

// ── Scan states ──
export const scan_state = {
    NONE: 0,
    INITIAL: 1,
    RECURSION: 2,
    MIN_ACTIVATIONS: 3,
} as const;

// ── Entry positions ──
export const world_info_position = {
    before: 0,
    after: 1,
    ANTop: 2,
    ANBottom: 3,
    atDepth: 4,
    EMTop: 5,
    EMBottom: 6,
    outlet: 7,
} as const;

export const wi_anchor_position = {
    before: 0,
    after: 1,
} as const;

// ── Default values ──
export const DEFAULT_DEPTH = 4;
export const DEFAULT_WEIGHT = 100;
export const MAX_SCAN_DEPTH = 1000;
export const MAX_COMMENT_LENGTH = 100;

// ── Storage keys ──
export const SORT_ORDER_KEY = 'world_info_sort_order';
export const METADATA_KEY = 'world_info';

// ── Decorators ──
export const KNOWN_DECORATORS = ['@@activate', '@@dont_activate'];

// ── Default global scan data ──
export const defaultGlobalScanData = Object.freeze({
    trigger: 'normal',
    personaDescription: '',
    characterDescription: '',
    characterPersonality: '',
    characterDepthPrompt: '',
    scenario: '',
    creatorNotes: '',
});

/**
 * Maps the internal JS property names used in entry objects
 * to the key paths used in the original JSON book data.
 */
export const originalWIDataKeyMap: Record<string, string> = {
    displayIndex: 'extensions.display_index',
    excludeRecursion: 'extensions.exclude_recursion',
    preventRecursion: 'extensions.prevent_recursion',
    delayUntilRecursion: 'extensions.delay_until_recursion',
    selectiveLogic: 'selectiveLogic',
    comment: 'comment',
    constant: 'constant',
    order: 'insertion_order',
    depth: 'extensions.depth',
    probability: 'extensions.probability',
    position: 'extensions.position',
    role: 'extensions.role',
    content: 'content',
    enabled: 'enabled',
    key: 'keys',
    keysecondary: 'secondary_keys',
    selective: 'selective',
    matchWholeWords: 'extensions.match_whole_words',
    useGroupScoring: 'extensions.use_group_scoring',
    caseSensitive: 'extensions.case_sensitive',
    matchPersonaDescription: 'extensions.match_persona_description',
    matchCharacterDescription: 'extensions.match_character_description',
    matchCharacterPersonality: 'extensions.match_character_personality',
    matchCharacterDepthPrompt: 'extensions.match_character_depth_prompt',
    matchScenario: 'extensions.match_scenario',
    matchCreatorNotes: 'extensions.match_creator_notes',
    scanDepth: 'extensions.scan_depth',
    automationId: 'extensions.automation_id',
    vectorized: 'extensions.vectorized',
    groupOverride: 'extensions.group_override',
    groupWeight: 'extensions.group_weight',
    sticky: 'extensions.sticky',
    cooldown: 'extensions.cooldown',
    delay: 'extensions.delay',
    triggers: 'extensions.triggers',
    ignoreBudget: 'extensions.ignore_budget',
};
