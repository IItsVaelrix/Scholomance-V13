# Compose Galaxy Backdrop — Design Spec

**Date:** 2026-07-20  
**Status:** Implemented  
**Surface:** Landing twin-gate full-bleed storm galaxy (`LandingPage` / `StormCanvas` scene variant)

---

## Intent

Move the landing galaxy spiral onto Compose using buttery compositor motion (transform-only plate rotation), while keeping the full photonic storm (lightning, retina bridge, intensity, sparkles) as a transparent overlay. Same look; smoother frame path.

## Decisions (locked)

| Topic | Choice |
|---|---|
| Target | Landing storm galaxy (A) — not combat arena |
| Architecture | Hybrid plate + overlay (C) → Approach **1** (Compose plate + CSS/compositor rotate) |
| Storm retention | Full storm (A) — lightning, retina bridge, intensity, sparkles |
| Rollout | Always-on — no feature flag on the primary path |
| Fallback | Validate fail → today's single-canvas `StormCanvas` (galaxy included) |

## Architecture

- Factory: `createGalaxyBackdropScene()` → `PB-UI-SCENE-v1`
- Kind: `galaxy-backdrop`
- Parts:
  - `galaxy-plate` — static spiral bitmap (from existing `initGalaxy` offscreen cache)
  - `storm-overlay` — transparent canvas host for photonic storm dynamics only
- Shell: `ComposeGalaxyBackdrop` always-on in `LandingPage.jsx` (replaces bare `StormCanvas` for the scene backdrop)
- Props passthrough: `intensity`, `debug`, `variant="scene"` (and existing strike callback if any)
- Storm engine change: mode/flag to **skip** per-frame `drawGalaxy` blit/rotate when Compose owns the plate; still `initGalaxy`, sparkle updates, `stellarStrikeInput`, retina routing
- `galaxySim`: export plate-bake helpers + `PATTERN_SPEED` for the shell (reuse cache + spectral palette / spiral params)
- Plate rotation: CSS `@keyframes` / WAAPI infinite `transform: rotate` at `PATTERN_SPEED` (rad/s) — not per-frame canvas `ctx.rotate`. Storm clock may stay independent for sparkles/strikes; visual parity is angular speed, not frame-locked phase sync
- Stacking: plate under overlay, both full-bleed behind twin gates; pointer behavior unchanged vs today

## Motion / perf / fidelity

- Animate plate with compositor `transform` rotate only (pivot at galaxy center; centerY ≈ 44% height as today)
- `contain` + `will-change: transform` on plate only; no layout thrash
- Rebuild plate bitmap **only on resize**; DPR capped ≤2 (match StormCanvas)
- Storm overlay: clear transparent each frame; draw strikes/sparkles only
- Visual identity locked: Hα / OIII / SII / dust lanes + existing spiral constants
- `prefers-reduced-motion`: frozen plate (no rotate); storm `renderStatic` as today

## Testing

- Packet golden + `validateComposeScene`
- Shell: mounts plate + overlay; reduced-motion freezes rotation
- Storm overlay path: galaxy blit skipped when Compose-owned
- Fallback path: legacy single-canvas still draws galaxy
- Landing twin-gate regression: Enter Scholomance + Update Ledger still present/order intact

## Out of scope

- Combat arena / Phaser galaxy
- WebGL rewrite of the spiral
- Feature-flag gated rollout
- Changing default storm intensity or bolt art
- WatercolorDissolve / navigation behavior
- Orb-variant StormCanvas (scrying orb) unless it shares the same skip-draw path harmlessly

## File touchpoints (expected)

- `src/core/compose/migrated/GalaxyBackdrop.ts`
- `src/core/compose/migrated/ComposeGalaxyBackdrop.tsx`
- `src/pages/Landing/LandingPage.jsx` + CSS stacking
- `src/pages/Landing/storm/galaxySim.js` (exports for plate bake)
- `src/pages/Landing/storm/photonicStorm.js` + `StormCanvas.jsx` (overlay / skip-galaxy mode)
- Tests under `tests/qa/features/compose-galaxy-backdrop-*.ts(x)`
- Docs: compose README + MIGRATION_GUIDE note
