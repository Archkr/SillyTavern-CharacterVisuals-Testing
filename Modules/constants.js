// Constants for configuration and state management
export const MAX_MESSAGE_BUFFERS = 60;
export const DEFAULT_ATTRIBUTION_VERBS = ["acknowledged", "added", "admitted", "advised", "affirmed", "agreed", "announced", "answered", "argued", "asked", "barked", "began", "bellowed", "blurted", "boasted", "bragged", "called", "chirped", "commanded", "commented", "complained", "conceded", "concluded", "confessed", "confirmed", "continued", "countered", "cried", "croaked", "crowed", "declared", "decreed", "demanded", "denied", "drawled", "echoed", "emphasized", "enquired", "enthused", "estimated", "exclaimed", "explained", "gasped", "insisted", "instructed", "interjected", "interrupted", "joked", "lamented", "lied", "maintained", "moaned", "mumbled", "murmured", "mused", "muttered", "nagged", "nodded", "noted", "objected", "offered", "ordered", "perked up", "pleaded", "prayed", "predicted", "proclaimed", "promised", "proposed", "protested", "queried", "questioned", "quipped", "rambled", "reasoned", "reassured", "recited", "rejoined", "remarked", "repeated", "replied", "responded", "retorted", "roared", "said", "scolded", "scoffed", "screamed", "shouted", "sighed", "snapped", "snarled", "spoke", "stammered", "stated", "stuttered", "suggested", "surmised", "tapped", "threatened", "turned", "urged", "vowed", "wailed", "warned", "whimpered", "whispered", "wondered", "yelled"];
export const DEFAULT_ACTION_VERBS = ["adjust", "adjusted", "appear", "appeared", "approach", "approached", "arrive", "arrived", "blink", "blinked", "bow", "bowed", "charge", "charged", "chase", "chased", "climb", "climbed", "collapse", "collapsed", "crawl", "crawled", "crept", "crouch", "crouched", "dance", "danced", "dart", "darted", "dash", "dashed", "depart", "departed", "dive", "dived", "dodge", "dodged", "drag", "dragged", "drift", "drifted", "drop", "dropped", "emerge", "emerged", "enter", "entered", "exit", "exited", "fall", "fell", "flee", "fled", "flinch", "flinched", "float", "floated", "fly", "flew", "follow", "followed", "freeze", "froze", "frown", "frowned", "gesture", "gestured", "giggle", "giggled", "glance", "glanced", "grab", "grabbed", "grasp", "grasped", "grin", "grinned", "groan", "groaned", "growl", "growled", "grumble", "grumbled", "grunt", "grunted", "hold", "held", "hit", "hop", "hopped", "hurry", "hurried", "jerk", "jerked", "jog", "jogged", "jump", "jumped", "kneel", "knelt", "laugh", "laughed", "lean", "leaned", "leap", "leapt", "left", "limp", "limped", "look", "looked", "lower", "lowered", "lunge", "lunged", "march", "marched", "motion", "motioned", "move", "moved", "nod", "nodded", "observe", "observed", "pace", "paced", "pause", "paused", "point", "pointed", "pop", "popped", "position", "positioned", "pounce", "pounced", "push", "pushed", "race", "raced", "raise", "raised", "reach", "reached", "retreat", "retreated", "rise", "rose", "run", "ran", "rush", "rushed", "sit", "sat", "scramble", "scrambled", "set", "shift", "shifted", "shake", "shook", "shrug", "shrugged", "shudder", "shuddered", "sigh", "sighed", "sip", "sipped", "slip", "slipped", "slump", "slumped", "smile", "smiled", "snort", "snorted", "spin", "spun", "sprint", "sprinted", "stagger", "staggered", "stare", "stared", "step", "stepped", "stand", "stood", "straighten", "straightened", "stumble", "stumbled", "swagger", "swaggered", "swallow", "swallowed", "swap", "swapped", "swing", "swung", "tap", "tapped", "throw", "threw", "tilt", "tilted", "tiptoe", "tiptoed", "take", "took", "toss", "tossed", "trudge", "trudged", "turn", "turned", "twist", "twisted", "vanish", "vanished", "wake", "woke", "walk", "walked", "wander", "wandered", "watch", "watched", "wave", "waved", "wince", "winced", "withdraw", "withdrew"];
export const PRONOUNS = ["he", "she", "they", "his", "her", "their", "him", "her", "them"]; // Basic list for pronoun detection


// Default settings for a single profile.
export const PROFILE_DEFAULTS = {
    patterns: ["Char A", "Char B", "Char C", "Char D"],
    ignorePatterns: [],
    vetoPatterns: ["OOC:", "(OOC)"],
    defaultCostume: "",
    debug: false,
    globalCooldownMs: 1200,
    perTriggerCooldownMs: 250,
    failedTriggerCooldownMs: 10000,
    maxBufferChars: 2000,
    repeatSuppressMs: 800,
    tokenProcessThreshold: 60,
    mappings: [],
    detectAttribution: true,
    detectAction: true,
    detectVocative: true,
    detectPossessive: true,
    detectPronoun: true, // NEW
    detectGeneral: false,
    attributionVerbs: [...DEFAULT_ATTRIBUTION_VERBS],
    actionVerbs: [...DEFAULT_ACTION_VERBS],
    detectionBias: 0,
    enableSceneRoster: true, // NEW
    sceneRosterTTL: 5, // NEW: Time-to-live in messages
};

// Top-level settings object which contains all profiles.
export const DEFAULTS = {
    enabled: true,
    profiles: {
        'Default': structuredClone(PROFILE_DEFAULTS),
    },
    activeProfile: 'Default',
    focusLock: { character: null },
};
