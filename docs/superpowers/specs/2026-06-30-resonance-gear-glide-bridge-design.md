# Resonance → Gear-Glide Bridge (BPM Quantization)

**Date:** 2026-06-30
**Status:** Approved design — pending implementation plan
**Surfaces:** `codex/core/pixelbrain/gear-glide-amp.js`, `public/data/resonance/*.resonance.json`

## Problem

Two animation-misalignment symptoms were reported:

1. **Words drift** against the vocal. Root cause: WhisperX forced alignment ran on the
   full, heavily-effected mix and localized words inaccurately. **Out of scope here** —
   tracked separately (needs vocal-stem separation + onset-snapping).
2. **Beat-synced visuals drift** against the music over the song. Root cause: rotation is
   driven by a single hand-typed `pacing.bpm` scalar integrated from `t=0`.

This spec addresses **#2 only**.

### Why a constant BPM cannot work

`gear-glide-amp.js::getRotationAtTime()` computes:

```
rotation(t) = radiansPerSecond × t          // radiansPerSecond derived from one constant BPM
```

This integrates a *constant* angular velocity from `t=0`. Any offset error or tempo
variation in a human/AI-performed track accumulates **monotonically** over ~3 minutes. No
increase in BPM measurement precision fixes a constant-velocity model fitted to a
non-constant performance. The misalignment is structural, not a tuning problem.

### Why not "reconstruct the waveform formula"

The original framing — reconstruct a closed-form mathematical formula of the soundwave —
is the wrong tool. A music waveform is broadband; any formula precise enough to reproduce
it *is* the audio (millions of coefficients), and the sample value at time `t` carries no
alignment information. Alignment is about **when events happen**, not the wave's amplitude.

The correct representation already exists in the repo: the **resonance sidecar**, a
piecewise-interpolated function of time (sparse keyframes + a per-channel interpolation
rule). That is the compact, animation-relevant "formula" of the signal's envelope.

## Existing assets

`public/data/resonance/<fingerprint>.resonance.json` (currently a `mock-hash` scaffold;
the **schema** is the contract):

- `sync.downbeatsMs: number[]` — a real **beat grid** (actual timestamps), not a scalar.
- `sync.bpm`, `sync.analysisOffsetMs` — fallback tempo + lead-in offset.
- `channels` — declares `interpolation` (`linear` | `step`), `required`, and `default`
  per channel.
- `frames[]` — sparse keyframes carrying `spectral.{rms,bassEnergy,onset}` and
  `resonance.{violence,luminosity,section}`.

Populating these frames for real is the job of the **resonance compiler** (separate work).
This spec consumes the schema regardless of mock vs. real data.

## Scope

In scope: **rotation + pulse.**

- Grid-anchored rotation driven by `sync.downbeatsMs`.
- Beat pulse driven by the `onset` (step) and `rms` (linear) channels, replacing the
  synthetic first-25%-of-beat heuristic in `getBeatPulse`.

Out of scope (deferred): generic volatility sampler exposing `violence`/`luminosity`/
`bassEnergy` to other AMP consumers; word-timing accuracy (#1); the resonance compiler
itself.

## Design

### Module boundary

A new **pure** module sits beside gear-glide-amp; gear-glide gains resonance-aware entry
points and keeps its scalar-BPM functions untouched as the **idle / no-music fallback**.
No existing caller of `getRotationAtTime` changes behavior.

**`codex/core/pixelbrain/resonance-grid-bridge.js`** (new, pure, no IO — the caller loads
the JSON; the bridge never fetches):

- `compileGrid(sidecar)` → normalizes a `.resonance.json` into a fast-lookup object:
  - sorted downbeat anchors, each with a precomputed cumulative-beat count,
  - per-channel sorted frame arrays,
  - `{ bpm, analysisOffsetMs, durationMs }`.
- `fractionalBeatAt(grid, timeMs)` → the core quantizer (math below).
- `sampleChannel(grid, channelPath, timeMs)` → respects the per-channel `interpolation`
  (`linear` vs `step`) and `default` from the sidecar's `channels` block.

**`gear-glide-amp.js`** (additive only):

- `getRotationFromResonance(grid, timeMs, degreesPerBeat)` →
  `normalizeRotation(degreesPerBeat × fractionalBeatAt(grid, timeMs) in radians)`.
- `getRotationWithPulseFromResonance(grid, timeMs, degreesPerBeat)` → above plus a real
  pulse from the `onset`/`rms` channels.

### Quantizer: grid-anchored phase

Given downbeat anchors `d₀ … dₙ` and `beatPeriod = 60000 / sync.bpm`:

1. **Precompute cumulative beats** at each anchor:
   `beats(dᵢ₊₁) = beats(dᵢ) + round((dᵢ₊₁ − dᵢ) / beatPeriod)`, with `beats(d₀) = 0`.
   Inferring beats-per-interval from `bpm` avoids any `beatsPerBar` assumption and
   tolerates variable bar lengths.
2. **Within `[dᵢ, dᵢ₊₁]`** (piecewise-linear):
   `fractionalBeat = beats(dᵢ) + (beats(dᵢ₊₁) − beats(dᵢ)) × (t − dᵢ) / (dᵢ₊₁ − dᵢ)`.
   This re-locks to an exact integer beat count at every downbeat ⇒ **zero accumulated
   drift**, while remaining continuous.
3. **Boundaries:**
   - `t > dₙ` (past last anchor): extrapolate at constant `sync.bpm` from `dₙ`.
   - `t < d₀`, or empty/absent grid: fall back to the existing scalar-BPM path.
   - `analysisOffsetMs` shifts `t` to account for lead-in before grid lookup.

Angular velocity gently varies when the track's tempo varies. This is **correct** — the
gear breathes with the real performance rather than fighting it.

### Pulse mapping

- `onset` (step, default 0) **gates** the pulse: a frame with `onset:1` fires a decaying
  pulse.
- `rms` (linear) **scales** the pulse amplitude at that instant.
- Result: pulses land on real transients, not synthesized grid positions.

## Testing

- **Drift test:** synthetic grid whose downbeats encode a deliberate tempo change; assert
  `fractionalBeatAt` returns exact integers at every downbeat and total accumulated error
  is 0 — the case a constant-velocity model fails.
- **Continuity test:** no jump greater than ε in rotation across each downbeat boundary.
- **Fallback test:** empty / absent grid produces output identical to current
  `getRotationAtTime`.
- **Pulse test:** pulse peaks at `onset:1` frames scaled by `rms`; stays at baseline on
  `onset:0`.
- **Interpolation test:** `step` vs `linear` channels sampled between frames return the
  correct held / interpolated value; `default` applies where a channel frame is absent.

## Out-of-scope follow-ups

- Resonance compiler: fill `frames[]`/`downbeatsMs` from real audio (beat tracking +
  onset/RMS extraction).
- Word-timing accuracy (#1): vocal-stem separation (Demucs) before forced alignment, then
  snap word boundaries to the `onset` envelope.
- Generic volatility sampler for glow/turbulence consumers.
