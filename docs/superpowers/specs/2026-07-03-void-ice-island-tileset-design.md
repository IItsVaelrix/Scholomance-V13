# Void Ice Island Tutorial Tileset — Design Brief

**Date:** 2026-07-03 · **Status:** proceeding under autonomous judgment (Damien AFK at format question; recommended option taken — revisit if wrong)

## Goal

Replace the low-fidelity 32×32 square `void_tiles` set with a professionally
rendered, high-detail tileset for the tutorial Void ice island, authored in
SCDL v1.2 and exported through the standard pipeline.

## Key decisions

1. **Isometric 128×64 diamond tiles** — the Scholomance OS client
   (`Scholomance OS/client/app.js`) renders a 2:1 iso grid (60×30 logical
   diamonds, elevation = `height * -16px`). The old square tiles never matched
   that projection. 128×64 is the standard power-of-two iso tile, scales down
   clean, and gives a real pixel budget for facets, cracks, rune inlay, and
   rim light. Cliff-edge tiles extend the canvas downward (128×112) for
   elevation faces.
2. **Exact registry materials** — the old set used `material ice`, which is
   not in `material-registry.js` (silent SCDL-005 fallback to `source`). New
   set binds real materials: `void_ice`, `diamond`, `cyan_glow`,
   `void_rune_glow`, `amethyst`, `voidsteel`.
3. **Single light law** — light from upper-left `(-1,-1)` (the `sphere`
   default). NW edges lit, SE edges in shadow, across every tile. Highlight
   parts are never mirrored by `symmetry`.
4. **Shared palette** — one Void-school palette (deep void navy → ice blues →
   frost white, cyan emissive, indigo runes, amethyst crystal) declared
   per-file but kept byte-identical across tiles for set coherence.
5. **Delete-and-replace** — old `codex/core/pixelbrain/scdl/fixtures/void_tiles/`
   sources and the copied PNGs in `Scholomance OS/client/assets/void_tiles/`
   are removed entirely, per instruction.

## Roster

| Asset | Canvas | Role |
|---|---|---|
| `void_ice_floor` | 128×64 | primary walkable faceted ice diamond |
| `void_ice_floor_cracked` | 128×64 | variant: crevasse cracks with cyan glow seep |
| `void_snow_floor` | 128×64 | snow-drifted ice, sparkle specks |
| `void_rune_path` | 128×64 | walkway with glowing indigo rune circuit |
| `void_rune_focus` | 128×64 | tutorial centerpiece: emissive sigil ring |
| `void_cliff_edge` | 128×112 | island south edge: diamond + cliff faces, icicles, void fade |
| `void_crystal_cluster` | 128×128 | large amethyst/cyan crystal prop (transparent bg) |
| `void_crystal_fern` | 96×112 | frost fern prop (transparent bg) |
| `void_glow_mushroom` | 96×96 | bioluminescent mushroom cluster prop (transparent bg) |
| `void_tutorial_island` | ~896×512 | scene-graph composite: full island preview via `def`/`instance` |

## Method

Author each tile hand-written in SCDL (polygons for facets, `sphere` for
crystal bulbs/mushroom caps, `cell` dither for frost, `glow` hints on
emissives), compile with `scdl.cli.js compile --export png`, visually inspect
the PNG, iterate until professional. Painter order = back-to-front for iso.
Composite island instances the tile defs in (x+y) row order.

Exports land next to sources per the Naming Law; final PNGs are copied to
`Scholomance OS/client/assets/void_tiles/`.

## Out of scope

Client rendering changes (app.js still draws flat diamonds — wiring textures
into the iso renderer is a follow-up), autotile/Wang edge matching, animation
frames.
