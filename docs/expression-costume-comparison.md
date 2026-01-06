# Character Expressions vs. Costume Switcher

## Why Character Expressions reliably swaps sprites
- **Multi-layer classification fallback.** The extension can classify text through local BERT, hosted "Extras", WebLLM, or the main LLM, and every path returns a label or gracefully falls back to the configured default instead of failing hard.【F:expressions/index.js†L1010-L1129】
- **Tight prompt shaping.** Incoming text is sanitized, macros are expanded, and the content is sliced to a 500-character window so the classifier sees only the most relevant spans (or the full prompt for LLM runs).【F:expressions/index.js†L903-L920】
- **Label-first parsing.** LLM replies are parsed via JSON schema, with fuzzy search and substring matching as a backstop to rescue malformed outputs, which keeps label selection consistent.【F:expressions/index.js†L934-L972】
- **Asset-aware filtering.** Classification can optionally filter to expressions that the current character actually has sprites for, reducing chances of requesting missing images.【F:expressions/index.js†L1032-L1096】
- **Visual swap guards.** Expression changes clone the current image, stage it off-screen, and animate a cross-fade while locking concurrent swaps to avoid flicker or broken IDs.【F:expressions/index.js†L1503-L1586】

## What Costume Switcher already does well
- **Pattern-rich detectors.** It compiles dedicated regexes for speakers, attributions, actions, pronouns, vocatives, possessives, and generic name hits, plus veto rules, so multiple cues can fire per pass.【F:src/detector-core.js†L821-L846】【F:src/detector-core.js†L1009-L1079】
- **Preprocessing pipeline.** Detection applies per-profile script collections, records which ran, and keeps both original and preprocessed text for reporting.【F:src/detector-core.js†L898-L919】
- **Token- and quote-aware windows.** Scans track quote ranges, project matches back to token offsets, and adjust start indices to keep streaming buffers and priority weights aligned.【F:src/detector-core.js†L920-L983】

## Making Costume Switcher as accurate and streamlined as Expressions
1. **Adopt the same input conditioning.** Before running detectors, pass buffered text through a sanitizer similar to `sampleClassifyText` (macro substitution, asterisk/quote stripping, and windowed slicing) to minimize noise and keep streaming scans focused on the latest salient span.
2. **Filter detections by available outfits.** Like Expressions’ `filterAvailable` option, trim candidate matches to characters/outfits that actually have mapped folders for the current scene to avoid empty switches and reduce false positives.
3. **Harden result parsing and logging.** Mirror Expressions’ label parsing pattern by adding a reconciliation layer that records fallback reasons (e.g., missing outfit, veto hit, or overlapping ranges) and surfaces them in the live tester so switches fail gracefully instead of silently dropping.
4. **Reuse the swap guard.** When swapping costume images, stage a clone and cross-fade with an "animating" flag to prevent concurrent DOM edits from racing against each other, keeping the visible avatar stable during rapid scene changes.【F:expressions/index.js†L1503-L1586】
