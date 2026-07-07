# Sacred Geometry Visualizer

**Date:** 2026-06-30
**Status:** Implemented

## Summary

A standalone Remotion composition that renders real-time audio-reactive sacred geometry. Drop in any audio asset (analyzed via the existing `analyzeAudio` pipeline) and get a professional-grade mandala visualizer driven entirely by beat detection and RMS envelope — no lyrics, no text, pure geometry.

## Files

| File | Purpose |
|---|---|
| `src/video/geometry/geometryMath.ts` | Pure math: polar coords, N-fold vertices, Lissajous curves, beat phase |
| `src/video/geometry/schoolPalette.ts` | School ID → color constants (no DOM reads) |
| `src/video/geometry/mandalaRenderer.ts` | Canvas 2D draw pipeline, frame-deterministic |
| `src/video/SacredGeometryVisualizer.tsx` | Remotion composition wrapper |

## Architecture

Frame-deterministic Canvas 2D inside a Remotion composition. All motion derives from `frame` (integer), never `Date.now()`. Correct for both browser preview and headless CLI export.

Data flow: `AudioAnalysis → getRmsAtFrame / getBeatPulse → renderMandalaFrame → Canvas 2D`

## Five Geometry Layers

1. **Background** — radial gradient, black center → school color at 8–18% opacity, breathes with RMS
2. **Polygon ring** — N-fold symmetry (N = 6 + beatCount % 3), slow-rotating; inner counter-rotating ring; glows on beat
3. **Petal bloom** — 8 bezier petals, radius driven by RMS, screen-blend composite, gradient from school primary to accent
4. **Harmonic spokes** — 12 spokes, length modulated by simulated frequency bands from beat timing
5. **Lissajous sigil** — parametric curve (a:b ratio cycles 3:2 → 5:3 → 4:3 over 3s), parchment gold `#f1e7c8`; glow pass via screen blend + shadowBlur
6. **Orbital particles** — 24 nodes at 1.15× baseR, 2× rotation speed, pulse on beat
7. **Scanline overlay** — 4px pitch, 4% black (matches Scholomance design system)

## Color System

School ID → `SCHOOL_PALETTE[schoolId]` returns `{ primary, accent, glow }`. Defaults to gold (`#c5a26f` / `#f1e7c8`). Schools: SONIC (purple), PSYCHIC (cyan), ALCHEMY (magenta), WILL (orange), VOID (zinc).

## Remotion Registration

Composition ID: `SacredGeometryVisualizer`
Default: 30fps, 1920×1080, 60s, no audio analysis (renders at rms=0.3 / no beat pulse)

## Usage

Pass `audioAnalysis` (from `analyzeAudio()`) and an optional `schoolId` as Remotion props. The browser preview in VideoForge's Remotion Player will render live. For CLI export:

```bash
npx remotion render SacredGeometryVisualizer output/sacred.mp4
```
