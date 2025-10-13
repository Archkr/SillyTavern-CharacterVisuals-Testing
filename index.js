import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, event_types, eventSource } from "../../../../script.js";
import { executeSlashCommandsOnChatInput, registerSlashCommand } from "../../../slash-commands.js";

const extensionName = "SillyTavern-CostumeSwitch-Testing";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const logPrefix = "[CostumeSwitch 2.0]";

// ======================================================================
// UTILITY: STATUS MESSAGE HANDLER
// ======================================================================
let statusTimeout;

/**
 * Displays a message in the status bar at the bottom of the settings panel.
 * This is a self-contained system and does not use callPopup.
 * @param {string} message The HTML message to display.
 * @param {string} type 'success', 'info', or 'error'.
 * @param {number} duration Duration in milliseconds. 0 for a persistent message.
 */
function showStatus(message, type = 'success', duration = 3000) {
    clearTimeout(statusTimeout);
    const statusEl = $('#cs-status');
    const errorEl = $('#cs-error');

    // Reset both elements
    statusEl.hide();
    errorEl.hide();

    if (type === 'error') {
        errorEl.html(message).show();
        // Don't set a timeout for errors, they should be cleared by the next status update.
    } else { // 'success' or 'info'
        statusEl.html(message).show();
        if (duration > 0) {
            statusTimeout = setTimeout(() => {
                statusEl.html('Ready');
            }, duration);
        }
    }
}

// ======================================================================
// CONSTANTS
// ======================================================================
const MAX_MESSAGE_BUFFERS = 60;
const DEFAULT_ATTRIBUTION_VERBS = ["acknowledged", "added", "admitted", "advised", "affirmed", "agreed", "announced", "answered", "argued", "asked", "barked", "began", "bellowed", "blurted", "boasted", "bragged", "called", "chirped", "commanded", "commented", "complained", "conceded", "concluded", "confessed", "confirmed", "continued", "countered", "cried", "croaked", "crowed", "declared", "decreed", "demanded", "denied", "drawled", "echoed", "emphasized", "enquired", "enthused", "estimated", "exclaimed", "explained", "gasped", "insisted", "instructed", "interjected", "interrupted", "joked", "lamented", "lied", "maintained", "moaned", "mumbled", "murmured", "mused", "muttered", "nagged", "nodded", "noted", "objected", "offered", "ordered", "perked up", "pleaded", "prayed", "predicted", "proclaimed", "promised", "proposed", "protested", "queried", "questioned", "quipped", "rambled", "reasoned", "reassured", "recited", "rejoined", "remarked", "repeated", "replied", "responded", "retorted", "roared", "said", "scolded", "scoffed", "screamed", "shouted", "sighed", "snapped", "snarled", "spoke", "stammered", "stated", "stuttered", "suggested", "surmised", "tapped", "threatened", "turned", "urged", "vowed", "wailed", "warned", "whimpered", "whispered", "wondered", "yelled"];
const DEFAULT_ACTION_VERBS = ["adjust", "adjusted", "appear", "appeared", "approach", "approached", "arrive", "arrived", "blink", "blinked", "bow", "bowed", "charge", "charged", "chase", "chased", "climb", "climbed", "collapse", "collapsed", "crawl", "crawled", "crept", "crouch", "crouched", "dance", "danced", "dart", "darted", "dash", "dashed", "depart", "departed", "dive", "dived", "dodge", "dodged", "drag", "dragged", "drift", "drifted", "drop", "dropped", "emerge", "emerged", "enter", "entered", "exit", "exited", "fall", "fell", "flee", "fled", "flinch", "flinched", "float", "floated", "fly", "flew", "follow", "followed", "freeze", "froze", "frown", "frowned", "gesture", "gestured", "giggle", "giggled", "glance", "glanced", "grab", "grabbed", "grasp", "grasped", "grin", "grinned", "groan", "groaned", "growl", "growled", "grumble", "grumbled", "grunt", "grunted", "hold", "held", "hit", "hop", "hopped", "hurry", "hurried", "jerk", "jerked", "jog", "jogged", "jump", "jumped", "kneel", "knelt", "laugh", "laughed", "lean", "leaned", "leap", "leapt", "left", "limp", "limped", "look", "looked", "lower", "lowered", "lunge", "lunged", "march", "marched", "motion", "motioned", "move", "moved", "nod", "nodded", "observe", "observed", "pace", "paced", "pause", "paused", "point", "pointed", "pop", "popped", "position", "positioned", "pounce", "pounced", "push", "pushed", "race", "raced", "raise", "raised", "reach", "reached", "retreat", "retreated", "rise", "rose", "run", "ran", "rush", "rushed", "sit", "sat", "scramble", "scrambled", "set", "shift", "shifted", "shake", "shook", "shrug", "shrugged", "shudder", "shuddered", "sigh", "sighed", "sip", "sipped", "slip", "slipped", "slump", "slumped", "smile", "smiled", "snort", "snorted", "spin", "spun", "sprint", "sprinted", "stagger", "staggered", "stare", "stared", "step", "stepped", "stand", "stood", "straighten", "straightened", "stumble", "stumbled", "swagger", "swaggered", "swallow", "swallowed", "swap", "swapped", "swing", "swung", "tap", "tapped", "throw", "threw", "tilt", "tilted", "tiptoe", "tiptoed", "take", "took", "toss", "tossed", "trudge", "trudged", "turn", "turned", "twist", "twisted", "vanish", "vanished", "wake", "woke", "walk", "walked", "wander", "wandered", "watch", "watched", "wave", "waved", "wince", "winced", "withdraw", "withdrew"];
const PRONOUNS = ["he", "she", "they", "his", "her", "their", "him", "her", "them"];

const PROFILE_DEFAULTS = {
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
    detectPronoun: true,
    detectGeneral: false,
    attributionVerbs: [...DEFAULT_ATTRIBUTION_VERBS],
    actionVerbs: [...DEFAULT_ACTION_VERBS],
    detectionBias: 0,
    enableSceneRoster: true,
    sceneRosterTTL: 5,
};

const DEFAULTS = {
    enabled: true,
    profiles: { 'Default': structuredClone(PROFILE_DEFAULTS) },
    activeProfile: 'Default',
    focusLock: { character: null },
};


// ======================================================================
// STATE MANAGEMENT
// ======================================================================
const perMessageBuffers = new Map();
const perMessageStates = new Map();

const state = {
    lastIssuedCostume: null,
    lastSwitchTimestamp: 0,
    lastTriggerTimes: new Map(),
    failedTriggerTimes: new Map(),
    pronounSubject: null,
    activeRoster: new Map(),
};

function resetGlobalState() {
    perMessageBuffers.clear();
    perMessageStates.clear();
    Object.assign(state, {
        lastIssuedCostume: null,
        lastSwitchTimestamp: 0,
        lastTriggerTimes: new Map(),
        failedTriggerTimes: new Map(),
        pronounSubject: null,
        activeRoster: new Map(),
    });
    console.log(`${logPrefix} Global state reset.`);
};

function ensureBufferLimit() {
    if (perMessageBuffers.size <= MAX_MESSAGE_BUFFERS) return;
    for (let i = 0; i < perMessageBuffers.size - MAX_MESSAGE_BUFFERS; i++) {
        const firstKey = perMessageBuffers.keys().next().value;
        perMessageBuffers.delete(firstKey);
        perMessageStates.delete(firstKey);
    }
}

const handleGenerationStart = (messageId) => {
    const bufKey = messageId != null ? `m${messageId}` : 'live';
    perMessageStates.set(bufKey, { lastAcceptedName: null, lastAcceptedTs: 0, vetoed: false, nextThreshold: 0 });
    perMessageBuffers.delete(bufKey);
};

const cleanupMessageState = (messageId) => {
    if (messageId != null) {
        perMessageBuffers.delete(`m${messageId}`);
        perMessageStates.delete(`m${messageId}`);
    }
};


// ======================================================================
// SETTINGS
// ======================================================================
let settings = {};

function getActiveProfile() {
    return settings?.profiles?.[settings.activeProfile];
}

function loadSettings() {
    const ctx = getContext();
    let storeSource = (ctx && ctx.extensionSettings) ? ctx.extensionSettings : (typeof extension_settings !== 'undefined' ? extension_settings : {});

    if (!storeSource[extensionName] || !storeSource[extensionName].profiles) {
        console.log(`${logPrefix} Migrating old settings to new profile format.`);
        const oldSettings = storeSource[extensionName] || {};
        const newSettings = structuredClone(DEFAULTS);
        Object.keys(PROFILE_DEFAULTS).forEach(key => {
            if (oldSettings.hasOwnProperty(key)) newSettings.profiles.Default[key] = oldSettings[key];
        });
        if (oldSettings.hasOwnProperty('enabled')) newSettings.enabled = oldSettings.enabled;
        storeSource[extensionName] = newSettings;
    }
    
    settings = Object.assign({}, structuredClone(DEFAULTS), storeSource[extensionName]);
    for (const profileName in settings.profiles) {
        settings.profiles[profileName] = Object.assign({}, structuredClone(PROFILE_DEFAULTS), settings.profiles[profileName]);
    }
    storeSource[extensionName] = settings;
}

function saveSettings() {
    if (saveSettingsDebounced) {
        saveSettingsDebounced();
    }
}

function getMappedCostume(name) {
    const profile = getActiveProfile();
    if (!name || !profile?.mappings?.length) return null;
    const lowerName = name.toLowerCase();
    for (const m of (profile.mappings || [])) {
        if (m?.name?.toLowerCase() === lowerName) return m.folder?.trim() || null;
    }
    return null;
}


// ======================================================================
// DETECTION LOGIC
// ======================================================================
let compiledRegexes = {};

function escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function parsePatternEntry(raw) {
    const t = String(raw || '').trim();
    if (!t) return null;
    const m = t.match(/^\/((?:\\.|[^\/])+)\/([gimsuy]*)$/);
    return m ? { body: m[1], flags: m[2] || '', raw: t } : { body: escapeRegex(t), flags: '', raw: t };
}
function computeFlagsFromEntries(entries, requireI = true) {
    const f = new Set(requireI ? ['i'] : []);
    for (const e of entries) { if (!e) continue; for (const c of (e.flags || '')) f.add(c); }
    return Array.from(f).filter(c => 'gimsuy'.includes(c)).join('');
}
function normalizeStreamText(s, opts = {}) {
    if (!s) return "";
    let str = String(s)
        .replace(/[\uFEFF\u200B\u200C\u200D]/g, "")
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
        .replace(/\u00A0/g, " ");

    if (opts.isCostumeName) {
        str = str.trim();
        if (str.startsWith("/")) str = str.slice(1).trim();
        const first = str.split(/[\/\s]+/).filter(Boolean)[0] || str;
        return String(first).replace(/[-_](?:sama|san)$/i, "").trim();
    } else {
        return str.replace(/(\*\*|__|~~|`{1,3})/g, "");
    }
}

function buildGenericRegex(patternList) {
    const entries = (patternList || []).map(parsePatternEntry).filter(Boolean);
    if (!entries.length) return null;
    const body = `(?:${entries.map(e => `(?:${e.body})`).join('|')})`;
    const flags = computeFlagsFromEntries(entries, true);
    try { return new RegExp(body, flags); } catch (e) { throw new Error(`Generic pattern compile failed: ${e.message}`); }
}
function buildSpeakerRegex(p) { const e = (p || []).map(parsePatternEntry).filter(Boolean); if (!e.length) return null; const b = `(?:^|\\n)\\s*(${e.map(x=>`(?:${x.body})`).join('|')})\\s*[:;,]\\s*`, f = computeFlagsFromEntries(e); try { return new RegExp(b, f) } catch { return null } }
function buildVocativeRegex(p) { const e = (p || []).map(parsePatternEntry).filter(Boolean); if (!e.length) return null; const b = `(?:["“'\\s])(${e.map(x=>`(?:${x.body})`).join('|')})[,.!?]`, f = computeFlagsFromEntries(e); try { return new RegExp(b, f) } catch { return null } }
function buildAttributionRegex(p, v) { const e = (p || []).map(parsePatternEntry).filter(Boolean); if (!e.length) return null; const n = e.map(x => `(?:${x.body})`).join("|"), b = `(["“”][^"“”]{0,400}["“”])\\s*,?\\s*(${n})\\s+${(v||[]).map(escapeRegex).join("|")}`, f = computeFlagsFromEntries(e); try { return new RegExp(b, f) } catch { return null } }
function buildActionRegex(p, v) { const e = (p || []).map(parsePatternEntry).filter(Boolean); if (!e.length) return null; const n = e.map(x => `(?:${x.body})`).join("|"), b = `\\b(${n})\\b(?:\\s+[a-zA-Z'’]+){0,4}?\\s+${(v||[]).map(escapeRegex).join("|")}\\b`, f = computeFlagsFromEntries(e); try { return new RegExp(b, f) } catch { return null } }
function buildPossessiveRegex(p) { const e = (p || []).map(parsePatternEntry).filter(Boolean); if (!e.length) return null; const b = `\\b(${e.map(x=>`(?:${x.body})`).join('|')})[’\`']s\\b`, f = computeFlagsFromEntries(e); try { return new RegExp(b, f) } catch { return null } }
function buildPronounRegex(v) { const b = `\\b(${PRONOUNS.join("|")})\\b(?:\\s+[a-zA-Z'’]+){0,4}?\\s+(${(v||[]).map(escapeRegex).join("|")})\\b`, f = 'gi'; try { return new RegExp(b, f) } catch { return null } }
function buildNameRegex(p) { const e = (p || []).map(parsePatternEntry).filter(Boolean); if (!e.length) return null; const b = `\\b(${e.map(x=>`(?:${x.body})`).join('|')})\\b`, f = computeFlagsFromEntries(e); try { return new RegExp(b, f) } catch { return null } }

function recompileRegexes() {
    try {
        const profile = getActiveProfile();
        if (!profile) return;
        const lowerIgnored = (profile.ignorePatterns || []).map(p => String(p).trim().toLowerCase());
        const effectivePatterns = (profile.patterns || []).filter(p => !lowerIgnored.includes(String(p).trim().toLowerCase()));

        compiledRegexes = {
            speakerRegex: buildSpeakerRegex(effectivePatterns),
            attributionRegex: buildAttributionRegex(effectivePatterns, profile.attributionVerbs),
            actionRegex: buildActionRegex(effectivePatterns, profile.actionVerbs),
            vocativeRegex: buildVocativeRegex(effectivePatterns),
            possessiveRegex: buildPossessiveRegex(effectivePatterns),
            pronounRegex: buildPronounRegex(profile.actionVerbs),
            nameRegex: buildNameRegex(effectivePatterns),
            vetoRegex: buildGenericRegex(profile.vetoPatterns),
        };
        showStatus('Ready', 'info', 0);
    } catch (e) {
        showStatus(`Pattern compile error: ${String(e)}`, 'error');
    }
}

function getQuoteRanges(s) { const q = /"|\u201C|\u201D/g, p = []; let m; while ((m = q.exec(s)) !== null) p.push(m.index); const r = []; for (let i = 0; i + 1 < p.length; i += 2) r.push([p[i], p[i + 1]]); return r; }
function isIndexInsideQuotes(ranges, idx) { for (const [a, b] of ranges) if (idx > a && idx < b) return true; return false; }

function findMatches(text, regex, quoteRanges, { searchInsideQuotes = false, groupIndex = 1 } = {}) {
    if (!text || !regex) return [];
    const flags = regex.flags.includes("g") ? regex.flags : regex.flags + "g";
    const re = new RegExp(regex.source, flags);
    const results = [];
    let match;
    while ((match = re.exec(text)) !== null) {
        const index = match.index || 0;
        if (searchInsideQuotes || !isIndexInsideQuotes(quoteRanges, index)) {
            const name = match[groupIndex]?.trim();
            if (name) results.push({ name, index, match: match[0] });
        }
        if (re.lastIndex === match.index) re.lastIndex++;
    }
    return results;
}

function findAllMatches(text) {
    const profile = getActiveProfile();
    const quoteRanges = getQuoteRanges(text);
    const all = [];
    const priorities = { speaker: 5, attribution: 4, action: 3, pronoun: 3, vocative: 2, possessive: 1, name: 0 };
    
    if (compiledRegexes.speakerRegex) findMatches(text, compiledRegexes.speakerRegex, quoteRanges, { groupIndex: 1 }).forEach(m => all.push({ ...m, kind: "speaker", priority: priorities.speaker }));
    if (profile.detectAttribution && compiledRegexes.attributionRegex) findMatches(text, compiledRegexes.attributionRegex, quoteRanges, { groupIndex: 2 }).forEach(m => all.push({ ...m, kind: "attribution", priority: priorities.attribution }));
    if (profile.detectAction && compiledRegexes.actionRegex) findMatches(text, compiledRegexes.actionRegex, quoteRanges).forEach(m => all.push({ ...m, kind: "action", priority: priorities.action }));
    if (profile.detectVocative && compiledRegexes.vocativeRegex) findMatches(text, compiledRegexes.vocativeRegex, quoteRanges, { searchInsideQuotes: true }).forEach(m => all.push({ ...m, kind: "vocative", priority: priorities.vocative }));
    if (profile.detectPossessive && compiledRegexes.possessiveRegex) findMatches(text, compiledRegexes.possessiveRegex, quoteRanges).forEach(m => all.push({ ...m, kind: "possessive", priority: priorities.possessive }));
    if (profile.detectGeneral && compiledRegexes.nameRegex) findMatches(text, compiledRegexes.nameRegex, quoteRanges).forEach(m => all.push({ ...m, kind: "name", priority: priorities.name }));

    if (profile.detectPronoun && compiledRegexes.pronounRegex && state.pronounSubject) {
        findMatches(text, compiledRegexes.pronounRegex, quoteRanges).forEach(m => {
            all.push({ name: state.pronounSubject, index: m.index, kind: 'pronoun', priority: priorities.pronoun, isPronoun: true });
        });
    }
    
    return all;
}

function findBestMatch(text) {
    if (!text) return null;
    const profile = getActiveProfile();
    const allMatches = findAllMatches(text);
    if (allMatches.length === 0) return null;

    const bias = Number(profile.detectionBias || 0);
    const scoredMatches = allMatches.map(match => {
        const isActive = match.priority >= 3;
        let score = match.index + (isActive ? bias : 0);
        if (profile.enableSceneRoster && state.activeRoster.has(match.name)) {
            score += 50;
        }
        return { ...match, score };
    });

    scoredMatches.sort((a, b) => b.score - a.score);
    return scoredMatches[0];
}


// ======================================================================
// CORE LOGIC (issueCostume)
// ======================================================================
async function issueCostumeForName(name, opts = {}) {
    const profile = getActiveProfile();
    if (!name || !profile) return;
    const now = Date.now();
    
    const cleanName = normalizeStreamText(name, { isCostumeName: true });
    let argFolder = getMappedCostume(cleanName) || cleanName;

    const context = getContext();
    const currentCostume = normalizeStreamText(state.lastIssuedCostume || profile.defaultCostume || (context?.characters?.[context.characterId]?.name) || '', { isCostumeName: true });
    
    if (!opts.isLock && currentCostume?.toLowerCase() === argFolder.toLowerCase()) {
        if (profile.debug) console.debug(`${logPrefix} Already using costume for "${argFolder}" - skipping.`);
        return;
    }
    if (!opts.isLock && now - state.lastSwitchTimestamp < (profile.globalCooldownMs ?? PROFILE_DEFAULTS.globalCooldownMs)) {
        if (profile.debug) console.debug(`${logPrefix} Global cooldown active, skipping switch to "${argFolder}".`);
        return;
    }
    if (!opts.isLock) {
        const lastSuccess = state.lastTriggerTimes.get(argFolder) || 0;
        if (now - lastSuccess < (profile.perTriggerCooldownMs ?? PROFILE_DEFAULTS.perTriggerCooldownMs)) {
            if (profile.debug) console.debug(`${logPrefix} Per-trigger cooldown active for "${argFolder}".`); return;
        }
        const lastFailed = state.failedTriggerTimes.get(argFolder) || 0;
        if (now - lastFailed < (profile.failedTriggerCooldownMs ?? PROFILE_DEFAULTS.failedTriggerCooldownMs)) {
            if (profile.debug) console.debug(`${logPrefix} Failed-trigger cooldown active for "${argFolder}".`); return;
        }
    }

    const command = `/costume \\${argFolder}`;
    if (profile.debug) console.log(`${logPrefix} executing command:`, command, "kind:", opts.matchKind || 'manual', "isLock:", !!opts.isLock);

    try {
        await executeSlashCommandsOnChatInput(command);
        state.lastTriggerTimes.set(argFolder, now);
        state.lastIssuedCostume = argFolder;
        state.lastSwitchTimestamp = now;
        
        if (!opts.isPronoun) {
            state.pronounSubject = cleanName;
        }
        if (profile.enableSceneRoster) {
            state.activeRoster.set(cleanName, profile.sceneRosterTTL ?? PROFILE_DEFAULTS.sceneRosterTTL);
        }

        showStatus(`Switched to <b>${argFolder}</b>`, 'success');

    } catch (err) {
        state.failedTriggerTimes.set(argFolder, now);
        showStatus(`Failed to switch to costume "<b>${argFolder}</b>". Check console (F12).`, 'error');
        console.error(`${logPrefix} Failed to execute /costume command for "${argFolder}".`, err);
    }
}


// ======================================================================
// UI MANAGEMENT
// ======================================================================
const uiMapping = {
    patterns: { selector: '#cs-patterns', type: 'textarea' },
    ignorePatterns: { selector: '#cs-ignore-patterns', type: 'textarea' },
    vetoPatterns: { selector: '#cs-veto-patterns', type: 'textarea' },
    defaultCostume: { selector: '#cs-default', type: 'text' },
    debug: { selector: '#cs-debug', type: 'checkbox' },
    globalCooldownMs: { selector: '#cs-global-cooldown', type: 'number' },
    repeatSuppressMs: { selector: '#cs-repeat-suppress', type: 'number' },
    tokenProcessThreshold: { selector: '#cs-token-process-threshold', type: 'number' },
    detectionBias: { selector: '#cs-detection-bias', type: 'number' },
    detectAttribution: { selector: '#cs-detect-attribution', type: 'checkbox' },
    detectAction: { selector: '#cs-detect-action', type: 'checkbox' },
    detectVocative: { selector: '#cs-detect-vocative', type: 'checkbox' },
    detectPossessive: { selector: '#cs-detect-possessive', type: 'checkbox' },
    detectPronoun: { selector: '#cs-detect-pronoun', type: 'checkbox' },
    detectGeneral: { selector: '#cs-detect-general', type: 'checkbox' },
    attributionVerbs: { selector: '#cs-attribution-verbs', type: 'csvTextarea' },
    actionVerbs: { selector: '#cs-action-verbs', type: 'csvTextarea' },
    enableSceneRoster: { selector: '#cs-enable-scene-roster', type: 'checkbox' },
    sceneRosterTTL: { selector: '#cs-scene-roster-ttl', type: 'number' },
};

function populateProfileDropdown() {
    const select = $("#cs-profile-select");
    select.empty();
    Object.keys(settings.profiles).forEach(name => {
        select.append($('<option>', { value: name, text: name }));
    });
    select.val(settings.activeProfile);
}

function updateFocusLockUI() {
    const profile = getActiveProfile();
    const lockSelect = $("#cs-focus-lock-select");
    const lockToggle = $("#cs-focus-lock-toggle");
    lockSelect.empty().append($('<option>', { value: '', text: 'None' }));
    (profile.patterns || []).forEach(name => {
        const cleanName = normalizeStreamText(name, { isCostumeName: true });
        if (cleanName) lockSelect.append($('<option>', { value: cleanName, text: cleanName }));
    });
    if (settings.focusLock.character) {
        lockSelect.val(settings.focusLock.character).prop("disabled", true);
        lockToggle.text("Unlock");
    } else {
        lockSelect.val('').prop("disabled", false);
        lockToggle.text("Lock");
    }
}

function renderMappings(profile) {
    const tbody = $("#cs-mappings-tbody");
    tbody.empty();
    (profile.mappings || []).forEach((m, idx) => {
        tbody.append($("<tr>").attr("data-idx", idx)
            .append($("<td>").append($("<input>").addClass("map-name text_pole").val(m.name || "")))
            .append($("<td>").append($("<input>").addClass("map-folder text_pole").val(m.folder || "")))
            .append($("<td>").append($("<button>").addClass("map-remove menu_button interactable cs-button-danger").text("Remove")))
        );
    });
}

function loadProfileUI(profileName) {
    if (!settings.profiles[profileName]) {
        profileName = Object.keys(settings.profiles)[0];
    }
    settings.activeProfile = profileName;
    const profile = getActiveProfile();
    $("#cs-profile-name").val(profileName);
    for (const key in uiMapping) {
        const { selector, type } = uiMapping[key];
        const value = profile[key] ?? PROFILE_DEFAULTS[key];
        switch (type) {
            case 'checkbox': $(selector).prop('checked', !!value); break;
            case 'textarea': $(selector).val((value || []).join('\n')); break;
            case 'csvTextarea': $(selector).val((value || []).join(', ')); break;
            default: $(selector).val(value); break;
        }
    }
    $("#cs-detection-bias-value").text(profile.detectionBias || PROFILE_DEFAULTS.detectionBias);
    renderMappings(profile);
    recompileRegexes();
    updateFocusLockUI();
}

function saveCurrentProfileData() {
    const profileData = {};
    for (const key in uiMapping) {
        const { selector, type } = uiMapping[key];
        switch (type) {
            case 'checkbox': profileData[key] = $(selector).prop('checked'); break;
            case 'textarea': profileData[key] = $(selector).val().split(/\r?\n/).map(s => s.trim()).filter(Boolean); break;
            case 'csvTextarea': profileData[key] = $(selector).val().split(',').map(s => s.trim()).filter(Boolean); break;
            case 'number': profileData[key] = parseInt($(selector).val(), 10) || 0; break;
            default: profileData[key] = $(selector).val().trim(); break;
        }
    }
    profileData.mappings = [];
    $("#cs-mappings-tbody tr").each(function() {
        const name = $(this).find(".map-name").val().trim();
        const folder = $(this).find(".map-folder").val().trim();
        if (name && folder) profileData.mappings.push({ name, folder });
    });
    return profileData;
}

function testRegexPattern() {
    $("#cs-test-veto-result").text('N/A').css('color', 'var(--text-color-soft)');
    const text = $("#cs-regex-test-input").val();
    if (!text) {
        $("#cs-test-all-detections, #cs-test-winner-list").html('<li class="cs-tester-list-placeholder">Enter text to test.</li>');
        return;
    }
    const tempProfile = saveCurrentProfileData();
    const originalProfile = getActiveProfile();
    // Temporarily apply the current UI settings for the test
    settings.profiles[settings.activeProfile] = tempProfile;
    recompileRegexes();

    const combined = normalizeStreamText(text);

    // 1. Veto Check (same as before)
    if (compiledRegexes.vetoRegex && compiledRegexes.vetoRegex.test(combined)) {
        $("#cs-test-veto-result").html(`Vetoed by: <b style="color: var(--red);">${combined.match(compiledRegexes.vetoRegex)[0]}</b>`);
    } else {
        $("#cs-test-veto-result").text('No veto phrases matched.').css('color', 'var(--green)');
    }

    // 2. All Detections (same as before)
    const allMatches = findAllMatches(combined);
    allMatches.sort((a, b) => a.index - b.index);
    const allDetectionsList = $("#cs-test-all-detections").empty();
    if (allMatches.length > 0) {
        allMatches.forEach(m => allDetectionsList.append(`<li><b>${m.name}</b> <small>(${m.kind} @ ${m.index}, p: ${m.priority})</small></li>`));
    } else {
        allDetectionsList.html('<li class="cs-tester-list-placeholder">No detections.</li>');
    }
    
    // 3. **CORRECTED** Winning Detections Logic
    const winnerList = $("#cs-test-winner-list").empty();
    const winners = [];
    const words = combined.split(/(\s+)/); // Split by whitespace, keeping the spaces
    let currentBuffer = "";
    let lastWinnerName = null;

    for (const word of words) {
        currentBuffer += word;
        const bestMatch = findBestMatch(currentBuffer);
        if (bestMatch && bestMatch.name !== lastWinnerName) {
            winners.push(bestMatch);
            lastWinnerName = bestMatch.name;
        }
    }

    if (winners.length > 0) {
        winners.forEach(m => winnerList.append(`<li><b>${m.name}</b> <small>(${m.kind} @ ${m.index}, score: ${Math.round(m.score)})</small></li>`));
    } else {
        winnerList.html('<li class="cs-tester-list-placeholder">No winning match.</li>');
    }

    // Restore the original profile settings
    settings.profiles[settings.activeProfile] = originalProfile;
    recompileRegexes();
}

function wireUI() {
    $(document).on('change', '#cs-enable', function() { settings.enabled = $(this).prop("checked"); saveSettings(); showStatus(`Costume Switcher ${settings.enabled ? 'Enabled' : 'Disabled'}.`, 'info'); });
    $(document).on('click', '#cs-save', () => { const d = saveCurrentProfileData(); if(d){ settings.profiles[settings.activeProfile] = d; recompileRegexes(); updateFocusLockUI(); saveSettings(); showStatus(`Profile "<b>${settings.activeProfile}</b>" saved.`, 'success'); }});
    $(document).on('change', '#cs-profile-select', function() { loadProfileUI($(this).val()); });
    $(document).on('click', '#cs-profile-save', () => { const n = $("#cs-profile-name").val().trim(); if (!n) return; const o = settings.activeProfile, d = saveCurrentProfileData(); if(!d) return; if (n !== o) delete settings.profiles[o]; settings.profiles[n] = d; settings.activeProfile = n; populateProfileDropdown(); saveSettings(); showStatus(`Profile saved as "<b>${n}</b>".`, 'success'); });
    $(document).on('click', '#cs-profile-delete', () => { if (Object.keys(settings.profiles).length <= 1) { showStatus("Cannot delete the last profile.", 'error'); return; } const n = settings.activeProfile; if (confirm(`Delete profile "${n}"?`)) { delete settings.profiles[n]; settings.activeProfile = Object.keys(settings.profiles)[0]; populateProfileDropdown(); loadProfileUI(settings.activeProfile); saveSettings(); showStatus(`Deleted "<b>${n}</b>".`, 'success'); } });
    $(document).on('click', '#cs-profile-export', () => { const p = getActiveProfile(), n = settings.activeProfile, d = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ name: n, data: p }, null, 2)), a = document.createElement('a'); a.href = d; a.download = `${n}_costume_profile.json`; a.click(); a.remove(); showStatus("Profile exported.", 'success'); });
    $(document).on('click', '#cs-profile-import', () => { $('#cs-profile-file-input').click(); });
    $(document).on('change', '#cs-profile-file-input', function(e) { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = (evt) => { try { const c = JSON.parse(evt.target.result); if (!c.name || !c.data) throw new Error("Invalid format."); let n = c.name; if (settings.profiles[n]) n = `${n} (Imported)`; settings.profiles[n] = Object.assign({}, structuredClone(PROFILE_DEFAULTS), c.data); settings.activeProfile = n; populateProfileDropdown(); loadProfileUI(n); saveSettings(); showStatus(`Imported as "<b>${n}</b>".`, 'success', 3000); } catch (err) { showStatus(`Import failed: ${err.message}`, 'error'); } }; r.readAsText(f); $(this).val(''); });
    $(document).on('click', '#cs-focus-lock-toggle', async () => { if (settings.focusLock.character) { settings.focusLock.character = null; showStatus('Focus lock released.', 'success'); } else { const c = $("#cs-focus-lock-select").val(); if (c) { settings.focusLock.character = c; await issueCostumeForName(c, { isLock: true }); } } updateFocusLockUI(); saveSettings(); });
    $(document).on('input change', '#cs-detection-bias', function(e) { $("#cs-detection-bias-value").text($(this).val()); if (e.type === 'change') { const p = getActiveProfile(); if (p) { p.detectionBias = parseInt($(this).val(), 10); saveSettings(); testRegexPattern(); } } });
    $(document).on('click', '#cs-reset', async () => { const p = getActiveProfile(), a = p?.defaultCostume?.trim() ? `\\${p.defaultCostume.trim()}` : '\\'; await executeSlashCommandsOnChatInput(`/costume ${a}`); });
    $(document).on('click', '#cs-mapping-add', () => { const p = getActiveProfile(); if (p) { p.mappings = p.mappings || []; p.mappings.push({ name: "", folder: "" }); renderMappings(p); } });
    $(document).on('click', '#cs-mappings-tbody .map-remove', function() { const p = getActiveProfile(); if (p) { const i = parseInt($(this).closest('tr').attr('data-idx'), 10); if (!isNaN(i)) { p.mappings.splice(i, 1); renderMappings(p); } } });
    $(document).on('click', '#cs-regex-test-button', testRegexPattern);
}


// ======================================================================
// SLASH COMMANDS
// ======================================================================
function registerCommands() {
    registerSlashCommand("cs-addchar", "Adds a character to the current profile's pattern list for this session.", ["char"], (args) => {
        const profile = getActiveProfile();
        const charName = args.join(" ").trim();
        if (profile && charName) {
            if (!profile.patterns.includes(charName)) {
                profile.patterns.push(charName);
                recompileRegexes();
                loadProfileUI(settings.activeProfile);
                showStatus(`Added "<b>${charName}</b>" to patterns for this session.`, 'success');
            } else {
                showStatus(`"<b>${charName}</b>" is already in the pattern list.`, 'info');
            }
        }
    }, true);

    registerSlashCommand("cs-ignore", "Adds a character to the current profile's ignore list for this session.", ["char"], (args) => {
        const profile = getActiveProfile();
        const charName = args.join(" ").trim();
        if (profile && charName) {
            if (!profile.ignorePatterns.includes(charName)) {
                profile.ignorePatterns.push(charName);
                recompileRegexes();
                loadProfileUI(settings.activeProfile);
                showStatus(`Ignoring "<b>${charName}</b>" for this session.`, 'success');
            } else {
                showStatus(`"<b>${charName}</b>" is already on the ignore list.`, 'info');
            }
        }
    }, true);

    registerSlashCommand("cs-map", "Maps a character alias to a costume folder for this session. Use 'to' to separate.", ["alias", "to", "folder"], (args) => {
        const profile = getActiveProfile();
        const commandString = args.join(" ");
        const parts = commandString.split(/\s+to\s+/i);
        if (profile && parts.length === 2) {
            const name = parts[0].trim();
            const folder = parts[1].trim();
            profile.mappings = profile.mappings.filter(m => m.name.toLowerCase() !== name.toLowerCase());
            profile.mappings.push({ name, folder });
            loadProfileUI(settings.activeProfile);
            showStatus(`Mapped "<b>${name}</b>" to "<b>${folder}</b>" for this session.`, 'success');
        } else {
            showStatus("Invalid map format. Use: /cs-map [alias] to [folder]", 'error', 3000);
        }
    }, true);
}


// ======================================================================
// MAIN ENTRY POINT & LIFECYCLE
// ======================================================================
let eventHandlers = {};
const STREAM_EVENT_NAME = event_types?.STREAM_TOKEN_RECEIVED || event_types?.SMOOTH_STREAM_TOKEN_RECEIVED || 'stream_token_received';

function unload() {
    if (eventSource) {
        for (const [event, handler] of Object.entries(eventHandlers)) eventSource.off?.(event, handler);
    }
    eventHandlers = {};
    resetGlobalState();
}

function load() {
    unload();
    eventHandlers = {
        [STREAM_EVENT_NAME]: (...args) => {
            if (!settings.enabled || settings.focusLock.character) return;
            const profile = getActiveProfile();
            if (!profile) return;
            let tokenText = "", messageId = null;
            if (typeof args[0] === 'number') { messageId = args[0]; tokenText = String(args[1] ?? ""); }
            else if (typeof args[0] === 'object') { tokenText = String(args[0].token ?? args[0].text ?? ""); messageId = args[0].messageId ?? args[1] ?? null; }
            else { tokenText = String(args.join(' ') || ""); }
            if (!tokenText) return;
            const bufKey = messageId != null ? `m${messageId}` : 'live';
            if (!perMessageStates.has(bufKey)) handleGenerationStart(messageId);
            const msgState = perMessageStates.get(bufKey);
            if (msgState.vetoed) return;
            const prev = perMessageBuffers.get(bufKey) || "";
            const combined = (prev + normalizeStreamText(tokenText)).slice(-(profile.maxBufferChars ?? PROFILE_DEFAULTS.maxBufferChars));
            perMessageBuffers.set(bufKey, combined);
            ensureBufferLimit();
            const threshold = Number(profile.tokenProcessThreshold ?? PROFILE_DEFAULTS.tokenProcessThreshold);
            if (!/[\s.,!?:\u2014)\]]$/.test(tokenText.slice(-1)) && combined.length < (msgState.nextThreshold || threshold)) return;
            msgState.nextThreshold = combined.length + threshold;
            if (compiledRegexes.vetoRegex && compiledRegexes.vetoRegex.test(combined)) {
                msgState.vetoed = true; return;
            }
            const bestMatch = findBestMatch(combined);
            if (bestMatch) {
                const { name: matchedName, matchKind, isPronoun } = bestMatch;
                const now = Date.now();
                if (msgState.lastAcceptedName?.toLowerCase() === matchedName.toLowerCase() && (now - msgState.lastAcceptedTs < (profile.repeatSuppressMs ?? PROFILE_DEFAULTS.repeatSuppressMs))) {
                    return;
                }
                msgState.lastAcceptedName = matchedName;
                msgState.lastAcceptedTs = now;
                issueCostumeForName(matchedName, { matchKind, isPronoun });
            }
        },
        [event_types.GENERATION_STARTED]: (messageId) => {
            handleGenerationStart(messageId);
            if (getActiveProfile()?.enableSceneRoster) {
                for (const [name, ttl] of state.activeRoster.entries()) {
                    if (ttl - 1 <= 0) state.activeRoster.delete(name);
                    else state.activeRoster.set(name, ttl - 1);
                }
            }
        },
        [event_types.GENERATION_ENDED]: cleanupMessageState,
        [event_types.MESSAGE_RECEIVED]: cleanupMessageState,
        [event_types.CHAT_CHANGED]: resetGlobalState,
    };
    for (const [event, handler] of Object.entries(eventHandlers)) eventSource.on?.(event, handler);
}

jQuery(async() => {
    $('head').append(`<link rel="stylesheet" type="text/css" href="${extensionFolderPath}/style.css">`);
    try {
        $("#extensions_settings").append(await $.get(`${extensionFolderPath}/settings.html`));
    } catch (e) {
        console.warn(`${logPrefix} Failed to load settings.html:`, e);
    }

    loadSettings();
    $("#cs-enable").prop("checked", !!settings.enabled);
    populateProfileDropdown();
    loadProfileUI(settings.activeProfile);
    wireUI();
    registerCommands();
    load();
    
    window[`__${extensionName}_unload`] = unload;
    console.log(`${logPrefix} v2.0.4 (Combined) loaded successfully.`);
});
