// Heuristic Tuning for index.js

// --- Utility Functions ---
export function escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
export function parsePatternEntry(raw) { 
    const t = String(raw || '').trim(); 
    if (!t) return null; 
    const m = t.match(/^\/((?:\\.|[^\/])+)\/([gimsuy]*)$/); 
    return m ? { body: m[1], flags: m[2] || '', raw: t } : { body: escapeRegex(t), flags: '', raw: t };
}
export function computeFlagsFromEntries(entries, requireI = true) {
    const f = new Set();
    for (const e of entries) {
        if (!e) continue;
        for (const c of (e.flags || '')) f.add(c);
    }
    if (requireI) f.add('i');
    return Array.from(f).filter(c => 'gimsuy'.includes(c)).join('');
}
export function processVerbsForRegex(verbString) {
    return verbString.split('|')
        .map(v => v.trim())
        .filter(Boolean)
        .map(v => v.replace(/\s+/g, '\\s+'))
        .join('|');
}

// --- Regex Builders ---
export function buildGenericRegex(patternList) {
    const entries = (patternList || []).map(parsePatternEntry).filter(Boolean);
    if (!entries.length) return null;
    const parts = entries.map(e => `(?:${e.body})`);
    const body = `(?:${parts.join('|')})`;
    const flags = computeFlagsFromEntries(entries, true);
    try {
        return new RegExp(body, flags);
    } catch (e) {
        for (let i = 0; i < entries.length; i++) {
            try {
                new RegExp(entries[i].body, computeFlagsFromEntries([entries[i]], true));
            } catch (err) {
                throw new Error(`Pattern #${i+1} failed to compile: "${entries[i].raw || entries[i].body}" — ${err.message}`);
            }
        }
        throw new Error(`Combined pattern failed to compile: ${e.message}`);
    }
}
export function buildNameRegex(patternList) { const e = (patternList || []).map(parsePatternEntry).filter(Boolean); if (!e.length) return null; const p = e.map(x => `(?:${x.body})`), b = `(?:^|\\n|[\\(\\[\\-—–])(?:(${p.join('|')}))(?:\\W|$)`, f = computeFlagsFromEntries(e, !0); try { return new RegExp(b, f) } catch (err) { console.warn("buildNameRegex compile failed:", err); return null } }
export function buildSpeakerRegex(patternList) { const e = (patternList || []).map(parsePatternEntry).filter(Boolean); if (!e.length) return null; const p = e.map(x => `(?:${x.body})`), b = `(?:^|\\n)\\s*(${p.join('|')})\\s*[:;,]\\s*`, f = computeFlagsFromEntries(e, !0); try { return new RegExp(b, f) } catch (err) { console.warn("buildSpeakerRegex compile failed:", err); return null } }
export function buildVocativeRegex(patternList) { const e = (patternList || []).map(parsePatternEntry).filter(Boolean); if (!e.length) return null; const p = e.map(x => `(?:${x.body})`), b = `(?:["“'\\s])(${p.join('|')})[,.!?]`, f = computeFlagsFromEntries(e, !0); try { return new RegExp(b, f) } catch (err) { console.warn("buildVocativeRegex compile failed:", err); return null } }

export function buildPostQuoteAttributionRegex(patternList, verbString) {
    const e = (patternList || []).map(parsePatternEntry).filter(Boolean); if (!e.length) return null;
    const names = e.map(x => `(?:${x.body})`).join("|");
    const verbs = processVerbsForRegex(verbString);
    if (!verbs) return null;
    const optionalMiddleName = `(?:\\s+[A-Z][a-z]+)*`;
    const body = `(?:["“”][^"“”]*["“”])\\s*,?\\s*(${names})${optionalMiddleName}\\s+${verbs}`;
    const flags = computeFlagsFromEntries(e, true);
    try { return new RegExp(body, flags) } catch (err) { console.warn("buildPostQuoteAttributionRegex compile failed:", err); return null }
}
export function buildPreQuoteAttributionRegex(patternList, verbString) {
    const e = (patternList || []).map(parsePatternEntry).filter(Boolean); if (!e.length) return null;
    const names = e.map(x => `(?:${x.body})`).join("|");
    const verbs = processVerbsForRegex(verbString);
    if (!verbs) return null;
    const optionalMiddleName = `(?:\\s+[A-Z][a-z]+)*`;
    const body = `\\b(${names})${optionalMiddleName}\\s+${verbs}\\s*[:,]?\\s*["“”]`;
    const flags = computeFlagsFromEntries(e, true);
    try { return new RegExp(body, flags) } catch (err) { console.warn("buildPreQuoteAttributionRegex compile failed:", err); return null }
}
export function buildVoiceAttributionRegex(patternList) {
    const e = (patternList || []).map(parsePatternEntry).filter(Boolean); if (!e.length) return null;
    const names = e.map(x => `(?:${x.body})`).join("|");
    const optionalMiddleName = `(?:\\s+[A-Z][a-z]+)*`;
    const body = `\\b(${names})${optionalMiddleName}[’\`']s\\s+(?:[a-zA-Z'’]+\\s+){0,3}?voice\\b`;
    const flags = computeFlagsFromEntries(e, true);
    try { return new RegExp(body, flags) } catch (err) { console.warn("buildVoiceAttributionRegex compile failed:", err); return null }
}
export function buildDirectActionRegex(patternList, verbString) {
    const e = (patternList || []).map(parsePatternEntry).filter(Boolean); if (!e.length) return null;
    const names = e.map(x => `(?:${x.body})`).join("|");
    const verbs = processVerbsForRegex(verbString);
    if (!verbs) return null;
    const body = `\\b(${names})(?:\\s+[A-Z][a-z]+)*\\s+(?:[a-zA-Z'’]+\\s+){0,2}?${verbs}\\b`;
    const flags = computeFlagsFromEntries(e, true);
    try { return new RegExp(body, flags) } catch (err) { console.warn("buildDirectActionRegex compile failed:", err); return null }
}
export function buildPossessiveRegex(patternList) {
    const e = (patternList || []).map(parsePatternEntry).filter(Boolean); if (!e.length) return null;
    const names = e.map(x => `(?:${x.body})`).join("|");
    const body = `\\b(${names})(?:\\s+[A-Z][a-z]+)*[’\`']s\\b`;
    const flags = computeFlagsFromEntries(e, true);
    try { return new RegExp(body, flags) } catch (err) { console.warn("buildPossessiveRegex compile failed:", err); return null }
}

// --- Core Detection Logic ---
export function getQuoteRanges(s) { const q=/"|\u201C|\u201D/g,pos=[],ranges=[];let m;while((m=q.exec(s))!==null)pos.push(m.index);for(let i=0;i+1<pos.length;i+=2)ranges.push([pos[i],pos[i+1]]);return ranges }
function isIndexInsideQuotesRanges(ranges,idx){for(const[a,b]of ranges)if(idx>a&&idx<b)return!0;return!1}
function findMatches(combined,regex,quoteRanges,searchInsideQuotes=!1){if(!combined||!regex)return[];const flags=regex.flags.includes("g")?regex.flags:regex.flags+"g",re=new RegExp(regex.source,flags),results=[];let m;for(; (m=re.exec(combined))!==null;){const idx=m.index||0;(searchInsideQuotes||!isIndexInsideQuotesRanges(quoteRanges,idx))&&results.push({match:m[0],groups:m.slice(1),index:idx}),re.lastIndex===m.index&&re.lastIndex++}return results}
export function findAllMatches(combined, regexes, settings, quoteRanges) {
    const allMatches = [];
    const { speakerRegex, postQuoteAttributionRegex, preQuoteAttributionRegex, voiceAttributionRegex, directActionRegex, possessiveRegex, vocativeRegex, nameRegex } = regexes;
    const priorities = { speaker: 5, attribution: 4, action: 3, vocative: 2, possessive: 1, name: 0 };
    
    if (speakerRegex) findMatches(combined, speakerRegex, quoteRanges).forEach(m => { const name = m.groups?.[0]?.trim(); name && allMatches.push({ name, matchKind: "speaker", matchIndex: m.index, priority: priorities.speaker }); });
    
    if (settings.detectAttribution) {
        if (postQuoteAttributionRegex) findMatches(combined, postQuoteAttributionRegex, quoteRanges).forEach(m => { const name = m.groups?.[0]?.trim(); name && allMatches.push({ name, matchKind: "attribution", matchIndex: m.index, priority: priorities.attribution }); });
        if (preQuoteAttributionRegex) findMatches(combined, preQuoteAttributionRegex, quoteRanges).forEach(m => { const name = m.groups?.[0]?.trim(); name && allMatches.push({ name, matchKind: "attribution", matchIndex: m.index, priority: priorities.attribution }); });
        if (voiceAttributionRegex) findMatches(combined, voiceAttributionRegex, quoteRanges).forEach(m => { const name = m.groups?.[0]?.trim(); name && allMatches.push({ name, matchKind: "attribution", matchIndex: m.index, priority: priorities.attribution }); });
    }

    if (settings.detectAction && directActionRegex) findMatches(combined, directActionRegex, quoteRanges).forEach(m => { const name = m.groups?.[0]?.trim(); name && allMatches.push({ name, matchKind: "action", matchIndex: m.index, priority: priorities.action }); });
    if (settings.detectVocative && vocativeRegex) findMatches(combined, vocativeRegex, quoteRanges, true).forEach(m => { const name = m.groups?.[0]?.trim(); name && allMatches.push({ name, matchKind: "vocative", matchIndex: m.index, priority: priorities.vocative }); });
    if (settings.detectPossessive && possessiveRegex) findMatches(combined, possessiveRegex, quoteRanges).forEach(m => { const name = m.groups?.[0]?.trim(); name && allMatches.push({ name, matchKind: "possessive", matchIndex: m.index, priority: priorities.possessive }); });
    if (settings.detectGeneral && nameRegex) findMatches(combined, nameRegex, quoteRanges).forEach(m => { const name = String(m.groups?.[0] || m.match).replace(/-(?:sama|san)$/i, "").trim(); name && allMatches.push({ name, matchKind: "name", matchIndex: m.index, priority: priorities.name }); });

    if (settings.detectAttribution && nameRegex) {
        const verbs = processVerbsForRegex(settings.attributionVerbs || '');
        if (verbs) {
            const pronounRegex = new RegExp(`(["”'][,.]?)(?:.*?)?\\s+(he|she|they)\\s+(${verbs})`, 'gi');
            findMatches(combined, pronounRegex, quoteRanges).forEach(pronounMatch => {
                const pronounMatchIndex = pronounMatch.index;
                const textBeforePronoun = combined.substring(0, pronounMatchIndex);
                
                const nameMatchesBefore = findMatches(textBeforePronoun, nameRegex, getQuoteRanges(textBeforePronoun));
                if (nameMatchesBefore.length > 0) {
                    const lastMention = nameMatchesBefore[nameMatchesBefore.length - 1];
                    const name = (lastMention.groups?.[0] || lastMention.match).trim();
                    if (name) {
                        allMatches.push({ name, matchKind: "attribution (pronoun)", matchIndex: pronounMatchIndex, priority: priorities.attribution });
                    }
                }
            });
        }
    }

    return allMatches;
}
export function findBestMatch(combined, regexes, settings, quoteRanges) {
    if (!combined) return null;

    const allMatches = findAllMatches(combined, regexes, settings, quoteRanges);
    if (allMatches.length === 0) return null;

    allMatches.sort((a, b) => {
        if (a.matchIndex !== b.matchIndex) {
            return a.matchIndex - b.matchIndex;
        }
        return a.priority - b.priority;
    });

    const bias = Number(settings.detectionBias || 0);
    let bestMatch = allMatches[allMatches.length - 1];

    if (bias !== 0) {
        let highestScore = -Infinity;
        for (const match of allMatches) {
            const score = match.matchIndex + (match.priority * bias);
            if (score >= highestScore) {
                highestScore = score;
                bestMatch = match;
            }
        }
    }
    
    return bestMatch;
}
export function calculateCharacterFocusScores(text, profile, regexes) { if (!text || !profile || !regexes) return {}; const combined = normalizeStreamText(text), quoteRanges = getQuoteRanges(combined), allMatches = findAllMatches(combined, regexes, profile, quoteRanges), scores = {}, points = { "attribution (pronoun)": 3, speaker: 3, attribution: 3, action: 2, vocative: 1, possessive: 1, name: 1 }; allMatches.forEach(match => { const normalizedName = normalizeCostumeName(match.name); if (!scores[normalizedName]) { scores[normalizedName] = 0; } scores[normalizedName] += (points[match.matchKind] || 0); }); return scores; }
export function normalizeStreamText(s){return s?String(s).replace(/[\uFEFF\u200B\u200C\u200D]/g,"").replace(/[\u2018\u2019\u201A\u201B]/g,"'").replace(/[\u201C\u201D\u201E\u201F]/g,'"').replace(/(\*\*|__|~~|`{1,3})/g,"").replace(/\u00A0/g," "):""}
export function normalizeCostumeName(n){if(!n)return"";let s=String(n).trim();s.startsWith("/")&&(s=s.slice(1).trim());const first=s.split(/[\/\s]+/).filter(Boolean)[0]||s;return String(first).replace(/[-_](?:sama|san|chan|kun)$/i,"").trim()}
