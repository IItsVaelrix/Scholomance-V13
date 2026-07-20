# Karaoke Bytecode Motion (Cheap Playhead + BPM IR) — Design

**Date:** 2026-07-17  
**Status:** Approved (design dialogue)  
**Context:** Deck Chrome Aw Snap under visualiser load. Mandala already moved to BPM+bytecode IR. Karaoke still re-renders lyric tokens on playhead ticks and can reintroduce GPU/CPU cost via React thrash and glow effects.

## Problem

Karaoke sync is correct (alignment / estimate → active line + sung word) but the **presentation path** is expensive:

- React re-renders lyric rows / word spans on every progress tick.
- Historical `text-shadow` glow on sung words was Aw Snap fuel (already partly removed).
- No shared deterministic motion IR with the mandala — beat feel is either absent or CSS-ad-hoc.

## Goal

**Both:**

1. **Cheap playhead** — class / attribute flips on previous vs next nodes only; static token DOM; no remount storm.
2. **BPM + seed bytecode motion** — active line and sung word pulse/scale/glow intensity from the same deterministic eval model as mandala, applied via CSS custom properties at ~10–12 Hz.

Surfaces: **Bytecode Visualiser** + **Album page lyrics** only.

## Non-goals

- Bake per-word curves into alignment JSON
- FFT-driven karaoke
- Framer-motion on lyric words (annotation hover panels may keep framer-motion; out of scope)
- Changing Truesight gate / AMP / colors
- Every lyric surface outside Visualiser + Album

## Decisions (locked)

| Item | Choice |
|------|--------|
| Priority | Deck stability **and** beat-locked look |
| Scope | Bytecode Visualiser + Album lyrics |
| Approach | Shared karaoke IR + CSS vars (mandala sibling) |
| Seed | Same `computeFingerprint` family as mandala |
| Glow | CSS vars / `color-mix` / opacity — **no** per-frame `text-shadow` blur |

## Bytecode IR

Schema: `scholomance.karaoke.v1`

```ts
type KaraokeOp =
  | { op: 'LINE_PULSE'; rate: number; pulse: number; phase0: number }
  | { op: 'WORD_PULSE'; rate: number; pulse: number; phase0: number }
  | { op: 'WORD_GLOW'; rate: number; pulse: number; phase0: number };

type KaraokeProgram = {
  schemaVersion: 'scholomance.karaoke.v1';
  seed: number;
  bpm: number;
  ops: KaraokeOp[];
};

type KaraokePose = {
  linePulse: number;   // brightness / weight multiplier
  wordScale: number;   // sung word scale
  wordGlow: number;    // intensity 0..1 for CSS var (not blur radius storm)
};
```

Evaluation at time `t` seconds (audio clock when playing; monotonic when idle):

- `ω = 2π · (bpm / 60)`
- pulse terms: `1 + pulse · sin(ω · t · rate + phase0)` (glow maps to `[0,1]` intensity)

Same `(seed, bpm, t)` → same pose (VAELRIX determinism). No `Math.random` / `Date.now` in compile salt beyond seeded `u01`, and none in eval.

`prefers-reduced-motion`: freeze pose at `t = 0`; no RAF.

## Runtime architecture

```
fingerprint(seed) + track.pacing.bpm + audio t
        ↓
  compileKaraokeProgram()
        ↓
  useKaraokeMotion → CSS vars on lyrics root (~10–12 Hz)
        ↓
  applyKaraokePlayhead(root, { line, word })  ← attribute flips only
        ↓
  CSS: .is-highlight / [data-sung] consume --k-*
```

### CSS variables

| Var | Applied to |
|-----|------------|
| `--k-line-pulse` | active line (`.is-highlight`) |
| `--k-word-scale` | sung word (`[data-sung='true']`) |
| `--k-word-glow` | sung word intensity (opacity / color-mix), not blur |

### Playhead contract

- Token DOM is static (memoized rows; Truesight spans unchanged).
- Playhead helper is idempotent: clear previous sung/highlight, set next.
- Does **not** call React `setState` per word tick for styling.
- Alignment / estimate logic for *which* line/word remains source of truth.

## Integration

| Surface | Wire |
|---------|------|
| `BytecodeVisualiserPage` | lyrics `<ol>` root + existing alignment playhead |
| `AlbumLyrics` | `.alb-lyrics` root + existing alignment playhead |

BPM: `track.pacing?.bpm` with measured provenance preferred (same caution as mandala — no silent fabricated 120).

## Files

| Path | Role |
|------|------|
| `src/pages/Visualiser/karaoke/karaokeBytecode.ts` | compile + eval IR |
| `src/pages/Visualiser/karaoke/useKaraokeMotion.ts` | throttled CSS var writer |
| `src/pages/Visualiser/karaoke/karaokePlayhead.ts` | previous/next attribute flips |
| `BytecodeVisualiser.css` | consume `--k-*` |
| `AlbumPage.css` | consume `--k-*` |
| `tests/pages/Visualiser/karaokeBytecode.test.ts` | determinism + BPM phase |

## Verification

1. Unit: same seed/bpm/t → identical pose; no randomness in eval.
2. Manual Deck: play a vocal track 60s on Visualiser + Album — no Aw Snap from karaoke path.
3. `prefers-reduced-motion`: static karaoke pose, no motion RAF.
4. React: progress ticks do not remount every lyric token (playhead flips only).

## Success criteria

- Sung word / active line still readable and beat-aware.
- Karaoke CPU/GPU cost dominated by ~10–12 Hz CSS var updates + O(1) DOM attribute flips.
- Truesight colors unchanged.
- Mandala and karaoke share seed/BPM family so the page feels one ritual, not two clocks.
