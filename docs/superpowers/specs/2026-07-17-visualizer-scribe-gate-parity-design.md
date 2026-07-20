# Visualizer ↔ Scribe Gate Parity — Design

**Date:** 2026-07-17  
**Status:** Approved (Approach A)  
**Parent:** `2026-07-17-visualizer-truesight-amp-design.md`

## Problem

Baked Visualizer Truesight under-colors vs Scribe on the same lyrics. Measured on Petrichor: word connections match (455), but gate size is 216 vs Scribe 286 because bake stores `multis: []` while Scribe’s panel path runs `findMultiRhymes` (121 chains). Hue families already match when both gate a word.

## Goal (Approach A)

Same gated charStarts and same `rhyme` / `assonance` tiers as Scribe’s `buildResonanceGate` for a given lyric text. No client G2P hue fallback when token data is missing (COLOR_DRAGON).

## Out of scope

Enhanced VerseIR / server policy / bytecode glow (B). Live panel-analysis API (C).

## Changes

### Bake (`scripts/bake-visualiser-truesight.mjs`)

After dict prime + `DeepRhymeEngine.analyzeDocument`:

1. `compileVerseToIR(text, { phonemeEngine: PhonemeEngine })`
2. `findMultiRhymes(verseIR, { phonemeEngine })` → strip `__start`, write to `artifact.multis`
3. Keep word `connections` as today (`phrase_compound` excluded)
4. Stats include `multis` count; log it

Proven: bake connections + real multis → gate **286 = 286**, zero tier diffs vs Scribe-shaped analysis.

### Apply AMP (`visualizerTruesightAmp.js`)

- Continue `buildResonanceGate(connections, { multis, authorityUnavailable })`
- Gated + tokenData → `tokenTruesight` only
- Gated + no tokenData → leave uncolored (do **not** call `wordTruesight`)

### Verification

- Unit: multis light gate; missing tokenData does not call `wordTruesight`
- Re-bake all tracks with `--require-authority`
- Optional parity smoke: Scribe-shaped gate size equals apply gate size on Petrichor
