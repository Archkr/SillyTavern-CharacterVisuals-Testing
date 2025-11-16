import Fuse from "../vendor/fuse.mjs";
import { sampleClassifyText } from "./sample-text.js";

const MIN_FUZZY_CHARACTER_OVERLAP_RATIO = 0.5;
const MAX_NORMALIZED_FUZZY_EDIT_DISTANCE = 0.34;
const MAX_FUZZY_AFFIX_OVERHANG = 4;

function toTrimmedString(value) {
    if (value == null) {
        return "";
    }
    return String(value).trim();
}

export function stripDiacritics(value) {
    if (typeof value !== "string") {
        return "";
    }
    return value.normalize("NFD").replace(/\p{M}+/gu, "");
}

function normalizeOverlapKey(value) {
    if (typeof value !== "string" || !value.trim()) {
        return "";
    }
    return stripDiacritics(value)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "");
}

function computeCharacterOverlapRatio(source, target) {
    if (!source || !target) {
        return 0;
    }
    const sourceCounts = new Map();
    for (const char of source) {
        sourceCounts.set(char, (sourceCounts.get(char) || 0) + 1);
    }
    let shared = 0;
    for (const char of target) {
        const available = sourceCounts.get(char);
        if (available > 0) {
            shared += 1;
            sourceCounts.set(char, available - 1);
        }
    }
    const maxLength = Math.max(source.length, target.length);
    return maxLength > 0 ? shared / maxLength : 0;
}

function damerauLevenshteinDistance(source, target) {
    if (!source || !target) {
        return Math.max(source?.length ?? 0, target?.length ?? 0);
    }
    if (source === target) {
        return 0;
    }
    const sourceLength = source.length;
    const targetLength = target.length;
    if (!sourceLength) {
        return targetLength;
    }
    if (!targetLength) {
        return sourceLength;
    }
    const matrix = Array.from({ length: sourceLength + 1 }, () => new Array(targetLength + 1).fill(0));
    for (let i = 0; i <= sourceLength; i += 1) {
        matrix[i][0] = i;
    }
    for (let j = 0; j <= targetLength; j += 1) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= sourceLength; i += 1) {
        const sourceChar = source[i - 1];
        for (let j = 1; j <= targetLength; j += 1) {
            const targetChar = target[j - 1];
            const cost = sourceChar === targetChar ? 0 : 1;
            let value = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost,
            );
            if (
                i > 1
                && j > 1
                && sourceChar === target[j - 2]
                && source[i - 2] === targetChar
            ) {
                value = Math.min(value, matrix[i - 2][j - 2] + cost);
            }
            matrix[i][j] = value;
        }
    }
    return matrix[sourceLength][targetLength];
}

function computeNormalizedEditDistance(source, target) {
    const sourceLength = source?.length ?? 0;
    const targetLength = target?.length ?? 0;
    const maxLength = Math.max(sourceLength, targetLength);
    if (!maxLength) {
        return 0;
    }
    if (!sourceLength || !targetLength) {
        return 1;
    }
    const distance = damerauLevenshteinDistance(source, target);
    return distance / maxLength;
}

export function hasDiacritics(value) {
    if (typeof value !== "string") {
        return false;
    }
    return stripDiacritics(value) !== value;
}

const DEFAULT_TOLERANCE = Object.freeze({
    enabled: false,
    accentSensitive: true,
    lowConfidenceThreshold: null,
    maxScore: 0.45,
});

function normalizeBoolean(value, fallback = false) {
    if (value === null || value === undefined) {
        return fallback;
    }
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true" || normalized === "yes" || normalized === "on") {
            return true;
        }
        if (normalized === "false" || normalized === "no" || normalized === "off") {
            return false;
        }
    }
    return fallback;
}

function parseNumeric(value, fallback = null) {
    const number = Number(value);
    if (Number.isFinite(number)) {
        return number;
    }
    return fallback;
}

export function resolveFuzzyTolerance(value) {
    if (value == null || value === false) {
        return { ...DEFAULT_TOLERANCE };
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return {
            enabled: true,
            accentSensitive: true,
            lowConfidenceThreshold: Math.max(0, Math.floor(value)),
            maxScore: DEFAULT_TOLERANCE.maxScore,
        };
    }
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        switch (normalized) {
            case "off":
            case "disabled":
                return { ...DEFAULT_TOLERANCE };
            case "always":
            case "on":
                return {
                    enabled: true,
                    accentSensitive: false,
                    lowConfidenceThreshold: null,
                    maxScore: 0.45,
                };
            case "accent":
            case "accented":
                return {
                    enabled: true,
                    accentSensitive: true,
                    lowConfidenceThreshold: null,
                    maxScore: DEFAULT_TOLERANCE.maxScore,
                };
            case "low":
            case "low-confidence":
            case "lowconfidence":
                return {
                    enabled: true,
                    accentSensitive: false,
                    lowConfidenceThreshold: 2,
                    maxScore: DEFAULT_TOLERANCE.maxScore,
                };
            case "auto":
            default:
                return {
                    enabled: true,
                    accentSensitive: true,
                    lowConfidenceThreshold: 2,
                    maxScore: DEFAULT_TOLERANCE.maxScore,
                };
        }
    }
    if (typeof value === "object") {
        const enabled = normalizeBoolean(value.enabled, true);
        if (!enabled) {
            return { ...DEFAULT_TOLERANCE };
        }
        const accentSensitive = normalizeBoolean(value.accentSensitive, true);
        const threshold = value.lowConfidenceThreshold ?? value.threshold;
        const lowConfidenceThreshold = parseNumeric(threshold, DEFAULT_TOLERANCE.lowConfidenceThreshold);
        const maxScore = parseNumeric(value.maxScore, DEFAULT_TOLERANCE.maxScore) ?? DEFAULT_TOLERANCE.maxScore;
        return {
            enabled: true,
            accentSensitive,
            lowConfidenceThreshold: lowConfidenceThreshold == null
                ? DEFAULT_TOLERANCE.lowConfidenceThreshold
                : Math.max(0, Math.floor(lowConfidenceThreshold)),
            maxScore: Math.max(0, Math.min(1, maxScore)),
        };
    }
    return { ...DEFAULT_TOLERANCE };
}

function shouldApplyFuzzy(tolerance, { priority = null, hasAccents = false } = {}) {
    if (!tolerance || !tolerance.enabled) {
        return false;
    }
    const lowConfidence = tolerance.lowConfidenceThreshold != null
        && Number.isFinite(priority)
        && priority <= tolerance.lowConfidenceThreshold;
    const accentTrigger = tolerance.accentSensitive && hasAccents;
    if (tolerance.lowConfidenceThreshold == null && !tolerance.accentSensitive) {
        return true;
    }
    return lowConfidence || accentTrigger;
}

function buildCandidateMaps(candidates) {
    const direct = new Map();
    const accentless = new Map();
    candidates.forEach((candidate) => {
        const trimmed = toTrimmedString(candidate);
        if (!trimmed) {
            return;
        }
        const lowered = trimmed.toLowerCase();
        if (!direct.has(lowered)) {
            direct.set(lowered, trimmed);
        }
        const accentKey = stripDiacritics(trimmed).toLowerCase();
        if (accentKey && !accentless.has(accentKey)) {
            accentless.set(accentKey, trimmed);
        }
    });
    return { direct, accentless };
}

export function createNamePreprocessor({
    candidates = [],
    tolerance = DEFAULT_TOLERANCE,
    translate = false,
    sample = sampleClassifyText,
    fuseOptions = {},
    aliasMap = null,
} = {}) {
    const uniqueCandidates = Array.from(new Set(candidates.map(toTrimmedString).filter(Boolean)));
    const fuse = uniqueCandidates.length && tolerance.enabled
        ? new Fuse(uniqueCandidates, {
            includeScore: true,
            threshold: 0.45,
            ignoreLocation: true,
            ignoreFieldNorm: true,
            ...fuseOptions,
        })
        : null;
    const maps = buildCandidateMaps(uniqueCandidates);
    const aliasLookup = aliasMap instanceof Map
        ? aliasMap
        : aliasMap && typeof aliasMap === "object"
            ? new Map(Object.entries(aliasMap).map(([key, value]) => [String(key ?? "").toLowerCase(), String(value ?? "")]))
            : new Map();

    return function preprocess(rawName, meta = {}) {
        const raw = toTrimmedString(rawName);
        if (!raw) {
            return {
                raw: "",
                normalized: "",
                canonical: "",
                method: "empty",
                score: null,
                applied: false,
                changed: false,
            };
        }

        const sampled = sample(raw) || raw;
        const sampledTrimmed = toTrimmedString(sampled);
        const normalized = translate ? stripDiacritics(sampledTrimmed) : sampledTrimmed;
        const overlapKey = normalizeOverlapKey(sampledTrimmed);
        const lowered = normalized.toLowerCase();
        let canonical = null;
        let method = "raw";
        if (aliasLookup.has(lowered)) {
            canonical = aliasLookup.get(lowered);
            method = "alias";
        } else if (maps.direct.has(lowered)) {
            canonical = maps.direct.get(lowered);
            method = "direct";
        }
        let score = null;
        let applied = false;

        if (!canonical) {
            const accentKey = stripDiacritics(normalized).toLowerCase();
            if (aliasLookup.has(accentKey)) {
                canonical = aliasLookup.get(accentKey);
                method = "alias";
            } else if (maps.accentless.has(accentKey)) {
                canonical = maps.accentless.get(accentKey);
                method = "accent-fold";
            }
        }

        if (!canonical && shouldApplyFuzzy(tolerance, {
            priority: meta.priority,
            hasAccents: hasDiacritics(sampledTrimmed),
        })) {
            applied = true;
            if (fuse) {
                const allowLooseFuzzyMatch = Boolean(meta?.allowLooseFuzzyMatch);
                const query = translate ? normalized : stripDiacritics(sampledTrimmed);
                const results = fuse.search(query);
                if (Array.isArray(results) && results.length) {
                    const selected = results.find((entry) => {
                        if (!entry?.item) {
                            return false;
                        }
                        if (entry.score != null && entry.score > tolerance.maxScore) {
                            return false;
                        }
                        if (!overlapKey) {
                            return true;
                        }
                        const candidateKey = normalizeOverlapKey(entry.item);
                        if (!candidateKey) {
                            return true;
                        }
                        const overlapRatio = computeCharacterOverlapRatio(overlapKey, candidateKey);
                        if (overlapRatio < MIN_FUZZY_CHARACTER_OVERLAP_RATIO) {
                            return false;
                        }
                        if (allowLooseFuzzyMatch) {
                            return true;
                        }
                        const tokenExtendsCandidate = overlapKey.length > candidateKey.length
                            && overlapKey.length <= candidateKey.length + MAX_FUZZY_AFFIX_OVERHANG
                            && (overlapKey.startsWith(candidateKey) || overlapKey.endsWith(candidateKey));
                        if (tokenExtendsCandidate) {
                            return true;
                        }
                        const normalizedEditDistance = computeNormalizedEditDistance(overlapKey, candidateKey);
                        return normalizedEditDistance <= MAX_NORMALIZED_FUZZY_EDIT_DISTANCE;
                    });
                    if (selected?.item) {
                        canonical = selected.item;
                        method = "fuzzy";
                        score = typeof selected.score === "number" ? selected.score : null;
                    }
                }
            }
        }

        if (!canonical) {
            canonical = normalized;
        }

        const changed = canonical.toLowerCase() !== raw.toLowerCase();

        return {
            raw,
            normalized,
            canonical,
            method,
            score,
            applied,
            changed,
        };
    };
}
