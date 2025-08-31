import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, event_types, eventSource } from "../../../../script.js";
import { executeSlashCommandsOnChatInput } from "../../../slash-commands.js";

const extensionName = "Costume-Switch-Testing";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

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
    detectGeneral: false,
};

const DEFAULTS = {
    enabled: true,
    profiles: { 'Default': structuredClone(PROFILE_DEFAULTS) },
    activeProfile: 'Default',
};

function escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function parsePatternEntry(raw) {
    const t = String(raw || '').trim();
    if (!t) return null;
    const m = t.match(/^\/((?:\\.|[^\/])+)\/([gimsuy]*)$/);
    return m ? { body: m[1], flags: m[2] || '', raw: t } : { body: escapeRegex(t), flags: '', raw: t };
}
function computeFlagsFromEntries(entries, requireI = true) {
    const f = new Set();
    for (const e of entries) {
        if (!e) continue;
        for (const c of (e.flags || '')) f.add(c);
    }
    if (requireI) f.add('i');
    return Array.from(f).filter(c => 'gimsuy'.includes(c)).join('');
}

function checkPatternComplexity(entries) {
    const totalLen = entries.reduce((s, e) => s + (e?.body?.length || 0), 0);
    if (totalLen > 4000 || entries.length > 250) throw new Error("Too many/long patterns — shorten the list.");
}

function buildGenericRegex(patternList) {
    const entries = (patternList || []).map(parsePatternEntry).filter(Boolean);
    if (!entries.length) return null;
    checkPatternComplexity(entries);
    const body = `(?:${entries.map(e => `(?:${e.body})`).join('|')})`;
    const flags = computeFlagsFromEntries(entries, true);
    try { return new RegExp(body, flags); } catch (e) { throw new Error(`Combined pattern failed: ${e.message}`); }
}

function buildNameRegex(patternList) {
    const e = (patternList || []).map(parsePatternEntry).filter(Boolean);
    if (!e.length) return null; checkPatternComplexity(e);
    const p = e.map(x => `(?:${x.body})`);
    const b = `\\b(${p.join('|')})(?!'s|'d|'ll|'ve|'re|:)\\b`;
    const f = computeFlagsFromEntries(e, true);
    try { return new RegExp(b, f); } catch (err) { console.warn("buildNameRegex compile failed:", err); return null; }
}

function buildSpeakerRegex(patternList) {
    const e = (patternList || []).map(parsePatternEntry).filter(Boolean);
    if (!e.length) return null; checkPatternComplexity(e);
    const p = e.map(x => `(?:${x.body})`);
    const b = `(?:^|\\n)\\s*(${p.join('|')})\\s*[:;,]\\s*`;
    const f = computeFlagsFromEntries(e, true);
    try { return new RegExp(b, f); } catch (err) { console.warn("buildSpeakerRegex compile failed:", err); return null; }
}

function buildVocativeRegex(patternList) {
    const e = (patternList || []).map(parsePatternEntry).filter(Boolean);
    if (!e.length) return null; checkPatternComplexity(e);
    const p = e.map(x => `(?:${x.body})`);
    const b = `\\b(${p.join('|')})[.,!?]`;
    const f = computeFlagsFromEntries(e, true);
    try { return new RegExp(b, f); } catch (err) { console.warn("buildVocativeRegex compile failed:", err); return null; }
}

function buildAttributionRegex(patternList) {
    const e = (patternList || []).map(parsePatternEntry).filter(Boolean);
    if (!e.length) return null; checkPatternComplexity(e);
    const n = e.map(x => `(?:${x.body})`).join("|");
    const v = "(?:admitted|agreed|announced|answered|asked|bellowed|called|commented|complained|concluded|confessed|continued|cried|declared|demanded|denied|exclaimed|explained|gasped|insisted|interrupted|mumbled|murmured|mused|muttered|nodded|objected|ordered|pleaded|promised|protested|queried|questioned|replied|responded|retorted|roared|said|scolded|screamed|shouted|sighed|snapped|spoke|stated|suggested|threatened|warned|whispered|wondered|yelled)";
    const a = `(?:["“”][^"“”]{0,400}["“”])\\s*,\\s*(${n})(?:\\s+[A-Z][a-z]+)*\\s+${v}`;
    const b = `\\b(${n})(?:\\s+[A-Z][a-z]+)*\\s+${v}\\s*[:,]?\\s*["“”]`;
    const B = `(?:${a})|(?:${b})`;
    const f = computeFlagsFromEntries(e, true);
    try { return new RegExp(B, f); } catch (err) { console.warn("buildAttributionRegex compile failed:", err); return null; }
}

function buildActionRegex(patternList) {
    const e = (patternList || []).map(parsePatternEntry).filter(Boolean);
    if (!e.length) return null; checkPatternComplexity(e);
    const n = e.map(x => `(?:${x.body})`).join("|");
    const a = "(?:blinked|bowed|crouched|frowned|gestured|glanced|grinned|looked|nodded|paused|ran|shrugged|sighed|smiled|stared|stepped|turned|walked|yelled)";
    const p = `\\b(${n})(?:\\s+[A-Z][a-z]+)*\\b(?:\\s+[a-zA-Z'’]+){0,4}?\\s+${a}\\b`;
    const f = computeFlagsFromEntries(e, true);
    try { return new RegExp(p, f); } catch (err) { console.warn("buildActionRegex compile failed:", err); return null; }
}

function getQuoteRanges(s) {
    const q = /"|\u201C|\u201D/g, pos = [], ranges = []; let m;
    while ((m = q.exec(s)) !== null) {
        if (s[m.index - 1] === '\\') continue;
        pos.push(m.index);
    }
    for (let i = 0; i + 1 < pos.length; i += 2) ranges.push([pos[i], pos[i + 1]]);
    if (pos.length % 2 === 1) ranges.push([pos[pos.length - 1], s.length]);
    return ranges;
}

function isIndexInsideQuotesRanges(ranges, idx) { for (const [a, b] of ranges) if (idx > a && idx < b) return true; return false; }

function findMatches(combined, regex, quoteRanges, searchInsideQuotes = false) {
    if (!combined || !regex) return [];
    const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
    const results = [];
    let m;
    while ((m = re.exec(combined)) !== null) {
        const idx = m.index ?? 0;
        if (searchInsideQuotes || !isIndexInsideQuotesRanges(quoteRanges, idx)) {
            results.push({ match: m[0], groups: m.slice(1), index: idx });
        }
        if (re.lastIndex === m.index) re.lastIndex++;
    }
    return results;
}

function findAllMatches(combined, regexes, settings, quoteRanges) {
    const allMatches = [], { speakerRegex, attributionRegex, actionRegex, vocativeRegex, nameRegex } = regexes;
    if (speakerRegex) findMatches(combined, speakerRegex, quoteRanges).forEach(m => { const name = m.groups?.[0]?.trim(); name && allMatches.push({ name, matchKind: "speaker", matchIndex: m.index }); });
    if (settings.detectAttribution && attributionRegex) findMatches(combined, attributionRegex, quoteRanges).forEach(m => { const name = m.groups?.find(g => g)?.trim(); name && allMatches.push({ name, matchKind: "attribution", matchIndex: m.index }); });
    if (settings.detectAction && actionRegex) findMatches(combined, actionRegex, quoteRanges).forEach(m => { const name = m.groups?.find(g => g)?.trim(); name && allMatches.push({ name, matchKind: "action", matchIndex: m.index }); });
    if (settings.detectVocative && vocativeRegex) findMatches(combined, vocativeRegex, quoteRanges, true).forEach(m => { const name = m.groups?.[0]?.trim(); name && allMatches.push({ name, matchKind: "vocative", matchIndex: m.index }); });
    if (settings.detectPossessive && settings.patterns?.length) {
        const possRe = new RegExp(`\\b(${settings.patterns.map(escapeRegex).join("|")})['\`’]s\\b`, "gi");
        findMatches(combined, possRe, quoteRanges).forEach(m => { const name = m.groups?.[0]?.trim(); name && allMatches.push({ name, matchKind: "possessive", matchIndex: m.index }); });
    }
    if (settings.detectGeneral && nameRegex) findMatches(combined, nameRegex, quoteRanges).forEach(m => { const name = String(m.groups?.[0] || m.match).trim(); name && allMatches.push({ name, matchKind: "name", matchIndex: m.index }); });
    return allMatches;
}

function findBestMatch(combined, regexes, settings, quoteRanges) {
    const allMatches = findAllMatches(combined, regexes, settings, quoteRanges);
    if (!allMatches.length) return null;
    const priorities = { speaker: 5, attribution: 4, action: 3, vocative: 2, possessive: 1, name: 0 };
    allMatches.sort((a, b) => (b.matchIndex - a.matchIndex) || ((priorities[b.matchKind] || 0) - (priorities[a.matchKind] || 0)));
    return allMatches[0];
}

function normalizeStreamText(s) { return s ? String(s).replace(/[\uFEFF\u200B\u200C\u200D]/g, "").replace(/[\u2018\u2019\u201A\u201B]/g, "'").replace(/[\u201C\u201D\u201E\u201F]/g, '"').replace(/(\*\*|__|~~|`{1,3})/g, "").replace(/\u00A0/g, " ") : ""; }
function normalizeCostumeName(n) { if (!n) return ""; return String(n).trim().replace(/-(?:sama|san)$/i, "").trim(); }

// ... (rest of the file is mostly unchanged UI and event handling logic) ...

const perMessageBuffers = new Map, perMessageStates = new Map;
let lastIssuedCostume = null, lastSwitchTimestamp = 0;
const lastTriggerTimes = new Map, failedTriggerTimes = new Map;
let _streamHandler = null, _genStartHandler = null, _genEndHandler = null, _msgRecvHandler = null, _chatChangedHandler = null;

function ensureBufferLimit() {
    const MAX_MESSAGE_BUFFERS = 60;
    while (perMessageBuffers.size > MAX_MESSAGE_BUFFERS) {
        const firstKey = perMessageBuffers.keys().next().value;
        perMessageBuffers.delete(firstKey);
        perMessageStates.delete(firstKey);
    }
}

function waitForSelector(selector, timeout = 3000, interval = 120) {
    return new Promise(resolve => {
        const start = Date.now(), iv = setInterval(() => {
            const el = document.querySelector(selector);
            if (el) { clearInterval(iv); resolve(true); }
            else if (Date.now() - start > timeout) { clearInterval(iv); resolve(false); }
        }, interval);
    });
}

function debugLog(settings, ...args) {
    try {
        if (settings && getActiveProfile(settings)?.debug) {
            console.debug("[CostumeSwitch]", ...args);
        }
    } catch (e) { }
}

function getActiveProfile(settings) {
    return settings?.profiles?.[settings.activeProfile];
}

jQuery(async () => {
    if (typeof executeSlashCommandsOnChatInput !== 'function') {
        console.error("[CostumeSwitch] FATAL: The global 'executeSlashCommandsOnChatInput' function is not available.");
        return;
    }

    const { store, save, ctx } = getSettingsObj();
    let settings = store[extensionName];

    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings").append(settingsHtml);
    } catch (e) {
        console.warn("Failed to load settings.html:", e);
        $("#extensions_settings").append('<div><h3>Costume Switch</h3><div>Failed to load UI (see console)</div></div>');
    }

    if (!(await waitForSelector("#cs-save", 3000, 100))) {
        console.warn("CostumeSwitch: settings UI did not appear within timeout.");
    }

    let nameRegex, speakerRegex, attributionRegex, actionRegex, vocativeRegex, vetoRegex;

    function recompileRegexes() {
        try {
            const profile = getActiveProfile(settings);
            if (!profile) return;
            const lowerIgnored = (profile.ignorePatterns || []).map(p => String(p).trim().toLowerCase());
            const effectivePatterns = (profile.patterns || []).filter(p => !lowerIgnored.includes(String(p).trim().toLowerCase()));
            nameRegex = buildNameRegex(effectivePatterns);
            speakerRegex = buildSpeakerRegex(effectivePatterns);
            attributionRegex = buildAttributionRegex(effectivePatterns);
            actionRegex = buildActionRegex(effectivePatterns);
            vocativeRegex = buildVocativeRegex(effectivePatterns);
            vetoRegex = buildGenericRegex(profile.vetoPatterns);
            $("#cs-error").text("").hide();
        } catch (e) {
            $("#cs-error").text(`Pattern compile error: ${String(e)}`).show();
        }
    }

    function populateProfileDropdown() {
        const select = $("#cs-profile-select");
        select.empty();
        Object.keys(settings.profiles).forEach(name => {
            select.append($('<option>', { value: name, text: name }));
        });
        select.val(settings.activeProfile);
    }

    function loadProfile(profileName) {
        if (!settings.profiles[profileName]) {
            console.warn(`Profile "${profileName}" not found. Loading default.`);
            profileName = Object.keys(settings.profiles)[0];
        }
        settings.activeProfile = profileName;
        const profile = getActiveProfile(settings);
        $("#cs-profile-name").val(profileName);
        $("#cs-patterns").val((profile.patterns || []).join("\n"));
        $("#cs-ignore-patterns").val((profile.ignorePatterns || []).join("\n"));
        $("#cs-veto-patterns").val((profile.vetoPatterns || []).join("\n"));
        $("#cs-default").val(profile.defaultCostume || "");
        $("#cs-debug").prop("checked", !!profile.debug);
        $("#cs-global-cooldown").val(profile.globalCooldownMs ?? PROFILE_DEFAULTS.globalCooldownMs);
        $("#cs-repeat-suppress").val(profile.repeatSuppressMs ?? PROFILE_DEFAULTS.repeatSuppressMs);
        $("#cs-token-process-threshold").val(profile.tokenProcessThreshold ?? PROFILE_DEFAULTS.tokenProcessThreshold);
        $("#cs-detect-attribution").prop("checked", profile.detectAttribution);
        $("#cs-detect-action").prop("checked", profile.detectAction);
        $("#cs-detect-vocative").prop("checked", profile.detectVocative);
        $("#cs-detect-possessive").prop("checked", profile.detectPossessive);
        $("#cs-detect-general").prop("checked", profile.detectGeneral);
        renderMappings(profile);
        recompileRegexes();
    }

    function renderMappings(profile) {
        const tbody = $("#cs-mappings-tbody");
        tbody.empty();
        (profile.mappings || []).forEach((m, idx) => {
            tbody.append(
                $("<tr>").attr("data-idx", idx)
                    .append($("<td>").append($("<input>").addClass("map-name text_pole").val(m.name || "").attr("type", "text")))
                    .append($("<td>").append($("<input>").addClass("map-folder text_pole").val(m.folder || "").attr("type", "text")))
                    .append($("<td>").append($("<button>").addClass("map-remove menu_button interactable").text("Remove")))
            );
        });
    }

    function persistSettings() {
        save();
        $("#cs-status").text(`Saved ${new Date().toLocaleTimeString()}`).show();
        setTimeout(() => $("#cs-status").text("Ready"), 1500);
    }

    function testRegexPattern() {
        const text = $("#cs-regex-test-input").val();
        const allDetectionsList = $("#cs-test-all-detections");
        const winnerList = $("#cs-test-winner-list");

        if (!text) {
            allDetectionsList.html('<li style="color: var(--text-color-soft);">Enter text to test.</li>');
            winnerList.html('<li style="color: var(--text-color-soft);">N/A</li>');
            return;
        }

        const tempProfile = saveCurrentProfileData();
        const lowerIgnored = (tempProfile.ignorePatterns || []).map(p => String(p).trim().toLowerCase());
        const effectivePatterns = (tempProfile.patterns || []).filter(p => !lowerIgnored.includes(String(p).trim().toLowerCase()));
        
        const tempRegexes = {
            speakerRegex: buildSpeakerRegex(effectivePatterns),
            attributionRegex: buildAttributionRegex(effectivePatterns),
            actionRegex: buildActionRegex(effectivePatterns),
            vocativeRegex: buildVocativeRegex(effectivePatterns),
            nameRegex: buildNameRegex(effectivePatterns),
            vetoRegex: buildGenericRegex(tempProfile.vetoPatterns)
        };

        const combined = normalizeStreamText(text);

        if (tempRegexes.vetoRegex && tempRegexes.vetoRegex.test(combined)) {
            allDetectionsList.html('<li style="color: var(--red);">Veto phrase detected. No further processing.</li>');
            winnerList.html('<li style="color: var(--red);">N/A (Vetoed)</li>');
            return;
        }

        const quoteRanges = getQuoteRanges(combined);
        const allMatches = findAllMatches(combined, tempRegexes, tempProfile, quoteRanges);
        allMatches.sort((a, b) => a.matchIndex - b.matchIndex);

        allDetectionsList.empty();
        if (allMatches.length) {
            allMatches.forEach(match => allDetectionsList.append(`<li><b>${match.name}</b> <small>(${match.matchKind} @ ${match.matchIndex})</small></li>`));
        } else {
            allDetectionsList.html('<li style="color: var(--text-color-soft);">No detections found.</li>');
        }

        winnerList.empty();
        const winners = [];
        let lastWinnerName = null;
        const words = combined.split(/(\s+)/);
        let currentBuffer = "";
        
        for (const word of words) {
            currentBuffer += word;
            const bestMatch = findBestMatch(currentBuffer, tempRegexes, tempProfile, getQuoteRanges(currentBuffer));
            if (bestMatch && bestMatch.name !== lastWinnerName) {
                winners.push(bestMatch);
                lastWinnerName = bestMatch.name;
            }
        }
        
        if (winners.length) {
            winners.forEach(match => winnerList.append(`<li><b>${match.name}</b> <small>(${match.matchKind} @ ${match.matchIndex})</small></li>`));
        } else {
            winnerList.html('<li style="color: var(--text-color-soft);">No winning match.</li>');
        }
    }
    
    function saveCurrentProfileData() {
        const profileData = {
            patterns: $("#cs-patterns").val().split(/\r?\n/).map(s => s.trim()).filter(Boolean),
            ignorePatterns: $("#cs-ignore-patterns").val().split(/\r?\n/).map(s => s.trim()).filter(Boolean),
            vetoPatterns: $("#cs-veto-patterns").val().split(/\r?\n/).map(s => s.trim()).filter(Boolean),
            defaultCostume: $("#cs-default").val().trim(),
            debug: !!$("#cs-debug").prop("checked"),
            globalCooldownMs: parseInt($("#cs-global-cooldown").val(), 10) || PROFILE_DEFAULTS.globalCooldownMs,
            repeatSuppressMs: parseInt($("#cs-repeat-suppress").val(), 10) || PROFILE_DEFAULTS.repeatSuppressMs,
            tokenProcessThreshold: parseInt($("#cs-token-process-threshold").val(), 10) || PROFILE_DEFAULTS.tokenProcessThreshold,
            detectAttribution: !!$("#cs-detect-attribution").prop("checked"),
            detectAction: !!$("#cs-detect-action").prop("checked"),
            detectVocative: !!$("#cs-detect-vocative").prop("checked"),
            detectPossessive: !!$("#cs-detect-possessive").prop("checked"),
            detectGeneral: !!$("#cs-detect-general").prop("checked"),
            mappings: []
        };
        $("#cs-mappings-tbody tr").each(function () {
            const name = $(this).find(".map-name").val().trim();
            const folder = $(this).find(".map-folder").val().trim();
            if (name && folder) profileData.mappings.push({ name, folder });
        });
        return profileData;
    }

    function tryWireUI() {
        $("#cs-enable").off('change.cs').on("change.cs", function() { settings.enabled = !!this.checked; persistSettings(); });
        $("#cs-save").off('click.cs').on("click.cs", () => {
            const profileData = saveCurrentProfileData();
            settings.profiles[settings.activeProfile] = profileData;
            recompileRegexes();
            persistSettings();
        });
        $("#cs-profile-select").off('change.cs').on("change.cs", function() { loadProfile(this.value); });
        $("#cs-profile-save").off('click.cs').on("click.cs", () => {
            const newName = $("#cs-profile-name").val().trim();
            if (!newName) return;
            const oldName = settings.activeProfile;
            if (newName !== oldName && settings.profiles[newName]) {
                $("#cs-error").text("A profile with that name already exists.").show(); return;
            }
            const profileData = saveCurrentProfileData();
            if (newName !== oldName) delete settings.profiles[oldName];
            settings.profiles[newName] = profileData;
            settings.activeProfile = newName;
            populateProfileDropdown();
            $("#cs-error").text("").hide();
            persistSettings();
        });
        $("#cs-profile-delete").off('click.cs').on("click.cs", () => {
            if (Object.keys(settings.profiles).length <= 1) {
                $("#cs-error").text("Cannot delete the last profile.").show(); return;
            }
            const nameToDelete = settings.activeProfile;
            if (confirm(`Are you sure you want to delete the profile "${nameToDelete}"?`)) {
                delete settings.profiles[nameToDelete];
                settings.activeProfile = Object.keys(settings.profiles)[0];
                populateProfileDropdown();
                loadProfile(settings.activeProfile);
                persistSettings();
            }
        });
        $("#cs-reset").off('click.cs').on("click.cs", manualReset);
        $("#cs-mapping-add").off('click.cs').on("click.cs", () => {
            const profile = getActiveProfile(settings);
            if (!profile.mappings) profile.mappings = [];
            profile.mappings.push({ name: "", folder: "" });
            renderMappings(profile);
        });
        $("#cs-mappings-tbody").off('click.cs', '.map-remove').on('click.cs', '.map-remove', function () {
            const idx = parseInt($(this).closest('tr').attr('data-idx'), 10);
            const profile = getActiveProfile(settings);
            if (profile && !isNaN(idx)) {
                profile.mappings.splice(idx, 1);
                renderMappings(profile);
            }
        });
        $(document).off('click.cs', '#cs-regex-test-button').on('click.cs', '#cs-regex-test-button', testRegexPattern);
    }
    
    $("#cs-enable").prop("checked", !!settings.enabled);
    populateProfileDropdown();
    loadProfile(settings.activeProfile);
    tryWireUI();

    async function manualReset() {
        const profile = getActiveProfile(settings);
        const costumeArg = profile?.defaultCostume?.trim() ? `\\${profile.defaultCostume.trim()}` : '\\';
        const command = `/costume ${costumeArg}`;
        debugLog(settings, "Attempting manual reset with command:", command);
        try {
            await executeSlashCommandsOnChatInput(command);
            lastIssuedCostume = costumeArg;
        } catch (err) { console.error(`[CostumeSwitch] Manual reset failed for "${costumeArg}".`, err); }
    }

    async function issueCostumeForName(name, opts = {}) {
        const profile = getActiveProfile(settings);
        if (!name || !profile) return;
        const now = Date.now();
        name = normalizeCostumeName(name);
        const currentName = normalizeCostumeName(lastIssuedCostume || profile.defaultCostume || (ctx?.characters?.[ctx.characterId]?.name) || '');
        if (currentName.toLowerCase() === name.toLowerCase()) return;
        if (now - lastSwitchTimestamp < profile.globalCooldownMs) return;
        
        const mappedFolder = (profile.mappings.find(m => m.name.toLowerCase() === name.toLowerCase()))?.folder?.trim() || name;
        if (now - (lastTriggerTimes.get(mappedFolder) || 0) < profile.perTriggerCooldownMs) return;
        if (now - (failedTriggerTimes.get(mappedFolder) || 0) < profile.failedTriggerCooldownMs) return;

        const command = `/costume \\${mappedFolder}`;
        debugLog(settings, "executing command:", command, "kind:", opts.matchKind);
        try {
            await executeSlashCommandsOnChatInput(command);
            lastTriggerTimes.set(mappedFolder, now);
            lastIssuedCostume = mappedFolder;
            lastSwitchTimestamp = now;
        } catch (err) {
            failedTriggerTimes.set(mappedFolder, now);
            console.error(`[CostumeSwitch] Failed to execute /costume command for "${mappedFolder}".`, err);
        }
    }

    const streamEventName = event_types?.STREAM_TOKEN_RECEIVED || event_types?.SMOOTH_STREAM_TOKEN_RECEIVED || 'stream_token_received';

    _genStartHandler = (messageId) => {
        const bufKey = messageId != null ? `m${messageId}` : 'live';
        perMessageStates.set(bufKey, { lastAcceptedName: null, lastAcceptedTs: 0, vetoed: false });
        perMessageBuffers.delete(bufKey);
    };

    _streamHandler = (...args) => {
        if (!settings.enabled) return;
        const profile = getActiveProfile(settings);
        if (!profile) return;
        
        let tokenText, messageId;
        if (typeof args[0] === 'object') { tokenText = String(args[0].token ?? args[0].text ?? ""); messageId = args[0].messageId ?? args[1] ?? null; } 
        else { tokenText = String(args[0] || ""); messageId = args[1] ?? null; }
        if (!tokenText) return;

        const bufKey = messageId != null ? `m${messageId}` : 'live';
        if (!perMessageStates.has(bufKey)) _genStartHandler(messageId);
        const state = perMessageStates.get(bufKey);
        if (state.vetoed) return;

        const prev = perMessageBuffers.get(bufKey) || "";
        const combined = (prev + normalizeStreamText(tokenText)).slice(-profile.maxBufferChars);
        perMessageBuffers.set(bufKey, combined);
        ensureBufferLimit();
        
        const threshold = profile.tokenProcessThreshold;
        if (combined.length < (state.nextThreshold || threshold)) return;
        state.nextThreshold = combined.length + threshold;

        if (vetoRegex && vetoRegex.test(combined)) {
            state.vetoed = true; return;
        }

        const quoteRanges = getQuoteRanges(combined);
        const regexes = { speakerRegex, attributionRegex, actionRegex, vocativeRegex, nameRegex };
        const bestMatch = findBestMatch(combined, regexes, profile, quoteRanges);
        
        if (bestMatch) {
            const { name: matchedName, matchKind } = bestMatch;
            const now = Date.now();
            if (state.lastAcceptedName?.toLowerCase() === matchedName.toLowerCase() && (now - state.lastAcceptedTs < profile.repeatSuppressMs)) return;
            state.lastAcceptedName = matchedName;
            state.lastAcceptedTs = now;
            issueCostumeForName(matchedName, { matchKind, bufKey });
        }
    };

    _genEndHandler = (messageId) => { if (messageId != null) { perMessageBuffers.delete(`m${messageId}`); perMessageStates.delete(`m${messageId}`); } };
    _msgRecvHandler = (messageId) => { if (messageId != null) { perMessageBuffers.delete(`m${messageId}`); perMessageStates.delete(`m${messageId}`); } };
    _chatChangedHandler = () => { perMessageBuffers.clear(); perMessageStates.clear(); lastIssuedCostume = null; lastTriggerTimes.clear(); failedTriggerTimes.clear(); };

    function unload() {
        eventSource?.off?.(streamEventName, _streamHandler);
        eventSource?.off?.(event_types.GENERATION_STARTED, _genStartHandler);
        eventSource?.off?.(event_types.GENERATION_ENDED, _genEndHandler);
        eventSource?.off?.(event_types.MESSAGE_RECEIVED, _msgRecvHandler);
        eventSource?.off?.(event_types.CHAT_CHANGED, _chatChangedHandler);
    }
    
    unload(); // Clear any previous listeners
    eventSource.on(streamEventName, _streamHandler);
    eventSource.on(event_types.GENERATION_STARTED, _genStartHandler);
    eventSource.on(event_types.GENERATION_ENDED, _genEndHandler);
    eventSource.on(event_types.MESSAGE_RECEIVED, _msgRecvHandler);
    eventSource.on(event_types.CHAT_CHANGED, _chatChangedHandler);
    window[`__${extensionName}_unload`] = unload;
    console.log(`SillyTavern-CostumeSwitch v1.2.5 loaded successfully.`);
});

function getSettingsObj() {
    const ctx = getContext();
    const storeSource = ctx.extensionSettings || extension_settings;
    if (!storeSource[extensionName] || !storeSource[extensionName].profiles) {
        const oldSettings = storeSource[extensionName] || {};
        const newSettings = structuredClone(DEFAULTS);
        Object.keys(PROFILE_DEFAULTS).forEach(key => {
            if (oldSettings.hasOwnProperty(key)) newSettings.profiles.Default[key] = oldSettings[key];
        });
        if (oldSettings.hasOwnProperty('enabled')) newSettings.enabled = oldSettings.enabled;
        storeSource[extensionName] = newSettings;
    }
    storeSource[extensionName] = Object.assign({}, DEFAULTS, storeSource[extensionName]);
    for (const profileName in storeSource[extensionName].profiles) {
        storeSource[extensionName].profiles[profileName] = Object.assign({}, PROFILE_DEFAULTS, storeSource[extensionName].profiles[profileName]);
    }
    return { store: storeSource, save: ctx.saveSettingsDebounced || saveSettingsDebounced, ctx };
}
