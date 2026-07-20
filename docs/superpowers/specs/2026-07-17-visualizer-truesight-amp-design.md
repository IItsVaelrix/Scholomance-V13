# Visualizer Gated Truesight AMP — Design

**Date:** 2026-07-17  
**Status:** Approved (Approach 2 + scholo-gate warrants)  
**Mode:** B — Scribe-grade gated coloring via precomputed artifacts

## Problem

Visualizer colors lyrics with client-only `wordTruesight` (ungated). Scribe uses backend tokens + `buildResonanceGate`. Hue helpers are already shared; the *gate* is not.

## Solution

1. **Bake** per-track `scholomance.truesight.v1` artifacts (connections, wordsByCharStart, authority flag, text digest).  
2. **Apply** via microprocessor `amp.visualizer.truesight` — pure gate + `tokenTruesight`; no client G2P for hue when artifact words exist (COLOR_DRAGON).  
3. **Dictionary wire** — bake and Node synthesis must run `dict.primeAuthority` (self-sqlite via `buildSelfDictionaryAPI`) and pass that same `dictionaryAPI` into `DeepRhymeEngine.analyzeDocument`. Bare `primeAuthorityBatch()` defaults to fetch and will set `authorityUnavailable`, blanking colors.  
4. **Scripts** (scholo-gate bindable Do acts):  
   - `bake:visualiser:truesight` — create artifacts  
   - `test:visualiser:truesight-amp` — prove gate/apply law  

## Artifact

`public/data/truesight/<trackId>.truesight-v1.json`

```ts
{
  schemaVersion: 'scholomance.truesight.v1',
  trackId: string,
  sourceTextDigest: string, // sha256 hex of lyrics.join('\\n')
  authorityUnavailable: boolean,
  wordsByCharStart: Record<string, object>, // keys = String(charStart)
  connections: object[], // phrase_compound excluded
  multis: object[], // REQUIRED: findMultiRhymes(verseIR) — same pass as panelAnalysis (Approach A gate parity)
  bakedAt: string
}
```

## AMP

**Id:** `amp.visualizer.truesight`  
**Input:** `{ lyrics: string[], artifact, trackId }`  
**Output:** `{ lines, syncMode: 'gated'|'empty'|'mismatch'|'degraded', dominantSchool, gateSize }`

Laws: hash/`trackId` mismatch → refuse; `authorityUnavailable` → empty gate; gated words use `tokenTruesight(tokenData)` only; gated without tokenData → uncolored (never `wordTruesight` / client G2P — COLOR_DRAGON).

## UI

`BytecodeVisualiserPage` loads artifact like alignment, runs AMP, feeds colored lines + song-score.
