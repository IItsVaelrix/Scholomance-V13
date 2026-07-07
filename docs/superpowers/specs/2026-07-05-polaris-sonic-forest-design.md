# Polaris Sonic Thaumaturgist Forest — Design Spec

**Status:** Approved (Option A — post Portal Warden)  
**Date:** 2026-07-05

## Summary

After defeating the Portal Warden, the northeast dimensional portal becomes a one-way exit. Clicking it (while adjacent) triggers a 3s matrix loading screen displaying **Welcome to Polaris** / **Our World**, then recompiles the combat arena into the **Sonic Thaumaturgist Forest** — same Phaser scene, new biome, tuning-fork trees, sonic leylines.

## Trigger

| Phase | Portal click behavior |
|-------|----------------------|
| BECKONING | Spawn Portal Warden (unchanged) |
| CLEARED | Begin Polaris matrix transition → forest |
| TELEPORTED | Portal dimmed; no re-teleport |

## Flow

1. Player adjacent to portal, `portalPhase === cleared`
2. `beginPolarisTeleport()` locks input, emits `polaris-teleport-start`
3. `PolarisMatrixIntro` (React) — 3000ms, cyan matrix rain
4. On complete: `polaris-teleport-ready` window event
5. `applyPolarisSonicForest()` — terrain, trees, spawn, scene context

## Visual

- **Palette:** sonic teal (`#22aacc`, `#44e8c0`) on violet-brown earth
- **Trees:** 10+ procedural tuning-fork trees (metal prongs + leaf clusters), idle vibration
- **Spawn:** `(4, 7)` south clearing
- **Scene ID:** `polaris-sonic-forest`

## Files

| Path | Role |
|------|------|
| `src/game/world/polarisForestConfig.js` | Spawn, placements, heightmap builder |
| `src/game/world/polarisTransition.js` | Event names, durations |
| `src/phaser/polarisTuningForkTrees.js` | Tree drawing + animation |
| `src/ui/world/PolarisMatrixIntro.jsx` | Matrix welcome screen |
| `src/game/combat/arenaBiomeTransform.js` | `polaris_sonic` palette |
| `src/phaser/CombatArenaScene.js` | Teleport + apply forest |
| `src/pages/Combat/CombatPage.jsx` | Intro overlay |
| `src/game/combat/portalPhase.js` | `POLARIS_SPAWN_TILE`, `TELEPORTED` |