# Mandala Bytecode Motion (1+3 Hybrid) — Design

**Date:** 2026-07-17  
**Status:** Approved  
**Context:** Deck Chrome AMD/`exit_on_context_lost` Aw Snap under uncapped canvas mandala RAF + FFT bars.

## Problem

`BytecodeVisualiser` rebuilds sacred geometry every animation frame (dozens of strokes, optional `lighter` composite, FFT radial bars). On Steam Deck that exhausts the GPU process. Server logs show no API fault. `chrome://gpu` confirms hardware canvas + `exit_on_context_lost`.

## Goal

Drive mandala **motion** from **BPM + deterministic mathematical bytecode**, not per-frame procedural FFT redraw.

- **Mode A reactivity:** no live FFT on the orb.
- **Hybrid 1+3:** CSS/SVG transforms carry most motion; optional thin canvas evaluates the same IR with a hard stroke/FPS budget.

## Non-goals

- Sprite-sheet / video bake (approach 2)
- Live FFT spectral bars on the mandala
- WebGL / WebGPU mandala
- Changing Truesight gate / AMP logic

## Bytecode IR

Deterministic program derived from track seed (fingerprint FNV hash) + BPM.

```ts
type MandalaOp =
  | { op: 'RING'; k: number; rate: number; pulse: number }
  | { op: 'POLY'; sides: number; rate: number; phase: number; scale: number }
  | { op: 'CORE'; pulse: number };

type MandalaProgram = {
  schemaVersion: 'scholomance.mandala.v1';
  seed: number;
  bpm: number;
  ops: MandalaOp[];
};
```

Evaluation at time `t` seconds (audio clock or monotonic when idle):

- `ω = 2π · (bpm / 60)`
- `θ(op, t) = phase₀ + ω · t · rate`
- `s(op, t) = 1 + pulse · sin(ω · t + phase₀)`

Same `(seed, bpm, t)` → same transforms (VAELRIX determinism). No `Math.random` / `Date.now` in the eval path.

## Runtime architecture

```
track.pacing.bpm + fingerprint(seed)
        ↓
  compileMandalaProgram()
        ↓
   MandalaStage
   ├── SVG layers (primary)  ← apply rotate/scale from eval ~10–15 Hz
   └── Thin canvas (optional) ← ≤8 strokes, ≤15 fps; OFF on coarse pointer / reduced-motion
```

FFT remains only on `SpectralStrip` (orthogonal; can be disabled later on Deck without touching mandala).

### SVG path (1)

Static geometry in markup (rings, dual triangles / merkaba, core). JS (or CSS variables updated from eval) sets:

- `--rot-k`, `--scale-k` per layer

Prefer updating transforms without clearing a bitmap every frame.

### Thin canvas path (3)

Same `MandalaProgram`. Draw at most:

- 3 rings + 2 triangles + 1 core fill  
- No spectral bars, no flower-of-life node ring, no `globalCompositeOperation = 'lighter'`  
- Frame cap ≥ 66ms (≤15 fps)  
- Disabled when `matchMedia('(pointer: coarse)')` or `prefers-reduced-motion`

## Integration

- Replace `BytecodeVisualiser` on `BytecodeVisualiserPage` stage with `MandalaStage`.
- Keep `ResonanceCard` / Listen console on old component until a follow-up, **or** point them at `MandalaStage` with `thinCanvas={false}` if trivial.
- Seed: reuse `computeFingerprint` hash from `bytecodeFingerprint.ts`.
- BPM: `activeTrack.pacing?.bpm ?? DEFAULT_PACING.bpm` (measured provenance preferred; no fabricated 120 without comment).

## Files

| Path | Role |
|---|---|
| `src/pages/Visualiser/mandala/mandalaBytecode.ts` | compile + eval IR |
| `src/pages/Visualiser/mandala/MandalaStage.tsx` | SVG + optional thin canvas |
| `src/pages/Visualiser/mandala/MandalaStage.css` | layer transforms |
| `BytecodeVisualiserPage.tsx` | mount MandalaStage |
| `tests/pages/Visualiser/mandalaBytecode.test.ts` | determinism + BPM phase |

## Verification

1. Unit: same seed/bpm/t → identical θ/s; no randomness in module.
2. Manual Deck: play Petrichor 60s with DevTools closed — no Aw Snap.
3. `prefers-reduced-motion`: static pose, no RAF.
4. Optional: Performance panel — no uncapped 60fps mandala canvas when thin canvas off.

## Success criteria

- Mandala still reads as BPM-locked living geometry.
- GPU load dominated by at most one low-rate thin canvas (Deck: zero canvas).
- Crash class `exit_on_context_lost` no longer reproducible from mandala alone.
