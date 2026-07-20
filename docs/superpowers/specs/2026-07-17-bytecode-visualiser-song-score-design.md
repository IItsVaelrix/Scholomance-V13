# Bytecode Visualiser Song Score — Design

**Date:** 2026-07-17  
**Status:** Approved  
**Surface:** `/visualiser` right page (`BytecodeVisualiserPage`)

## Problem

The right page labeled Fingerprint / Spectral / Coordinates / Energy Matrix / Ritual Sync is mostly FNV theater. The left page already carries real meaning (lyrics, Truesight, karaoke). The right page should show **honest song instrumentation**, not decorative hashes.

## Approach

**Hybrid score + cursor (Approach 3):** whole-song graphs readable while paused, with a thin playhead overlay while audio runs. Center mandala stays. No Genius prose.

## Panel map

Preserve the existing three-column grid around the mandala.

| Grid slot | Becomes |
|-----------|---------|
| Identity (`fp`) | BPM, sync mode (`aligned` / `estimated`), dominant school + % |
| Spectral (`spec`) | Live FFT strip from existing `AnalyserNode`; idle baseline when disconnected |
| Density (`coord`) | Phonemic density by line (syllables) + playhead on `activeLine` |
| Stage | Mandala unchanged |
| School (`sem`) | School association stacked bar + legend (Truesight schools) |
| Pressure (`mat`) | Delivery pressure = syllables ÷ beats per line |
| Meta (`ritual`) | Slim honest meta (model · version) |

**Dropped:** fake 256-bit checksum / hex blocks, MiniWave sines, hash X/Y/Z, hash energy dots, golden-ratio PHASE, GlyphCore version cosplay.

## Data: `TrackScore`

Derived once per track after PhonemeEngine / Truesight (with heuristic fallback):

```ts
{
  bpm: number;
  syncMode: 'aligned' | 'estimated';
  dominantSchool: string;
  schoolShares: { school: string; count: number; pct: number; color: string }[];
  lines: {
    index: number;
    syllables: number;
    phonemes: number;
    beats: number;
    pressure: number; // syllables / max(beats, ε)
    schools: Record<string, number>;
  }[];
}
```

Playhead = existing `activeLine` (aligned or estimated). One clock drives left lyrics and right charts.

## GrimDesign craft

Intent analysis for this surface: TRANSCENDENT instrument chrome (glow ~28–32px, border alpha ~0.85, generous padding, ornament, 360ms transition, optional `grim-shimmer` on live accents only).

**Color binding:** hue from live track `dominantSchool` / `--bcv-world`, not the intent-string school. School-share segments use per-school Truesight colors. No whole-page hue-rotate shimmer (would fight school colors).

CSS vars: `--grim-color`, `--grim-glow`, `--grim-border`, `--grim-transition`. Motion wrapped in `prefers-reduced-motion: no-preference`.

## Craft bar (beauty)

Charts are first-class instruments: tight typography matching `.bcv-*`, soft playhead glow, spectral idle that does not look broken, bespoke SVG (canvas only for spectral FFT). No third-party chart library.

## Edge cases

- Engine not ready → heuristic syllables; school chart empty/skeleton until Truesight  
- No FFT → spectral idle baseline  
- No alignment → density cursor follows estimated `activeLine`  
- Reduced motion → static plate, snap cursor, no shimmer  
- Mobile → right page remains hidden (`max-width: 768px`)

## Non-goals

Genius-style annotation UI; `visual.genome.js` / resonance sidecar wiring; rhyme constellation; left-page or mandala redesign.

## Files

- `src/pages/Visualiser/songScore.ts`
- `src/pages/Visualiser/charts/*`
- `BytecodeVisualiserPage.tsx` / `BytecodeVisualiser.css`
