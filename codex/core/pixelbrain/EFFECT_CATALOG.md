# PixelBrain Effect & AMP Catalog

> **Generated file — do not edit by hand.**
> Produced by `node scripts/pixelbrain-effect-catalog.mjs`; `--check` fails CI
> when this file no longer matches the source tree. Regenerate after adding,
> renaming, or resuming use of any amp module.

The answer to "what effects exist to make an asset look good?" — previously the
only candidate (`amp-registry.js`) declared 2 of these modules and told readers
not to trust it. Everything in the tables below is measured from the tree:
summaries come from each module's own header comment, and **Status** is the
real import graph, not a claim.

## Reading Status

| Status | Means |
|---|---|
| `WIRED` | Imported by at least one non-test, non-script module — reachable from a real code path. |
| `GEN` | Reached only from a `scripts/` asset generator. Live in output, not in the library path. |
| `TEST-ONLY` | Imported only by tests. **Probably dead or aspirational** — confirm before depending on it. |
| `ORPHAN` | Nothing in the scanned tree imports it. |

`Registered` shows an id in `amp-registry.js`, and is deliberately **not** the
column to judge liveness by: registration is not what makes an effect run — the
production path imports its passes directly, and only 2 id(s) are
registered repo-wide (`semantic-unifier`, `scholomance.character.motif`). That gap is exactly why the registry
alone could never serve as this catalog; `Status` here is measured from the
real import graph instead.

**54 modules** — 54 WIRED, 0 GEN, 0 TEST-ONLY,
0 ORPHAN. 25/54 have a header summary.

## PixelBrain passes (`codex/core/pixelbrain/*-amp.js`)

| Module | What it does | Status | Registered |
|---|---|---|---|
| `codex/core/pixelbrain/biome-coherence-amp.js` | _(no header comment — exports `getNeighbors6`, `runBiomeCoherenceAMP`, `runBiomeCoherenceAMPWorld`, `NEGOTIATION_THRESHOLD`)_ | WIRED | — |
| `codex/core/pixelbrain/chestplate-amp.js` | _(no header comment — exports `applyChestplateTemplate`)_ | WIRED | — |
| `codex/core/pixelbrain/chestplate-bevel-amp.js` | Deterministic trim/plate beveling for chestplate-class assets. | WIRED | — |
| `codex/core/pixelbrain/chestplate-surface-texture-amp.js` | Deterministic material texture for chestplate surfaces. | WIRED | — |
| `codex/core/pixelbrain/chunks-seam-amp.js` | _(no header comment — exports `injectBorderEnergy`, `injectAllBorderEnergies`, `DEFAULT_OVERLAP_RADIUS`)_ | WIRED | — |
| `codex/core/pixelbrain/coord-symmetry-amp.js` | COORDINATE SYMMETRY AMP MICROPROCESSOR | WIRED | — |
| `codex/core/pixelbrain/crystal-core-amp.js` | Structured sternum crystal/core pass for deterministic chestplate assets. | WIRED | — |
| `codex/core/pixelbrain/facet-amp.js` | Faceting pass for gem-class parts. | WIRED | — |
| `codex/core/pixelbrain/flame-tip-amp.js` | _(no header comment — exports `applyFlameTipGeometry`, `buildFlameTipAmpPayload`, `FLAME_TIP_AMP_ID`, `FLAME_TIP_AMP_VERSION`)_ | WIRED | `pixelbrain.flame-tip-amp` |
| `codex/core/pixelbrain/gear-glide-amp.js` | GEAR-GLIDE AMP — BPM-Synced Clock Rotation System | WIRED | — |
| `codex/core/pixelbrain/geometry-amp.js` | Geometry AMP converts composed PixelBrain item geometry into deterministic | WIRED | — |
| `codex/core/pixelbrain/grass-amp.js` | PixelBrain AMP wrapper for the literal SWARD grass engine port. | WIRED | `grass` |
| `codex/core/pixelbrain/gravity-amp.js` | _(no header comment — exports `applyGravityAMP`)_ | WIRED | — |
| `codex/core/pixelbrain/hair-flow-amp.js` | HairFlowAMP - Generates deterministic rasterized hair clumps and strands | WIRED | — |
| `codex/core/pixelbrain/heraldry-amp.js` | HERALDRY MICROPROCESSOR — emblem stamping for shield faces and panels. | WIRED | — |
| `codex/core/pixelbrain/hollowness-amp.js` | _(no header comment — exports `computeHollownessAMP`, `buildSurfaceLockSet`, `collectHollowDeltas`, `applyHollownessAMP`)_ | WIRED | — |
| `codex/core/pixelbrain/holyfire-motif-amp.js` | HOLY FIRE MOTIF AMP — deterministic flame emission for the Holy Fire | WIRED | `pixelbrain.holyfireMotif` |
| `codex/core/pixelbrain/image-segmentation-amp.js` | _(no header comment — exports `segmentImage`)_ | WIRED | — |
| `codex/core/pixelbrain/jewelry-amp.js` | Template pre-processor: Generates chains, gem settings, and manipulates volumes for jewelry. | WIRED | — |
| `codex/core/pixelbrain/neighbor-extrapolation-amp.js` | _(no header comment — exports `extrapolateNeighbors`)_ | WIRED | — |
| `codex/core/pixelbrain/noise-fill-amp.js` | Modulates material intensity or adds optional variation using PB-NOISE-v1 on existing lattice cells. | WIRED | `noise-fill` |
| `codex/core/pixelbrain/palette-quantization-amp.js` | Deterministic final palette budget enforcement. | WIRED | — |
| `codex/core/pixelbrain/pixel-aa-amp.js` | Anti-Aliasing pass for pixel art. | WIRED | — |
| `codex/core/pixelbrain/pixel-scale-amp.js` | _(no header comment — exports `colorDist`, `applyXBR2x`)_ | WIRED | — |
| `codex/core/pixelbrain/region-fill-amp.js` | REGION FILL AMP — color authority for the Item Foundry. | WIRED | — |
| `codex/core/pixelbrain/scholomance-character-motif-amp.js` | Scholomance Character Motif Amp | WIRED | — |
| `codex/core/pixelbrain/school-tag-amp.js` | _(no header comment — exports `collectSchoolTagDeltas`, `applySchoolTagAMP`)_ | WIRED | — |
| `codex/core/pixelbrain/sdf-shape-amp.js` | Consumes PB-SDF-v1 (from part spec or profile) + construction skeleton. | WIRED | `sdf-shape` |
| `codex/core/pixelbrain/selout-amp.js` | Selective Outline (selout) pass. | WIRED | — |
| `codex/core/pixelbrain/shadow-amp.js` | _(no header comment — exports `buildShadowAmpPayload`, `SHADOW_AMP_ID`, `SHADOW_AMP_VERSION`)_ | WIRED | `pixelbrain.shadow-amp` |
| `codex/core/pixelbrain/shadow-perception-amp.js` | _(no header comment — exports `runShadowPerceptionAmp`, `SHADOW_PERCEPTION_AMP_ID`, `SHADOW_SCALARS`)_ | WIRED | `pixelbrain.shadow-perception-amp` |
| `codex/core/pixelbrain/shield-rim-amp.js` | Template pre-processor: Owns outer border, gold/bronze frame, rim thickness, corner highlights, bottom shadow. | WIRED | — |
| `codex/core/pixelbrain/shield-volume-amp.js` | Template pre-processor: Owns curved face shading, center plane, side shadows, and rim cast shadows. | WIRED | — |
| `codex/core/pixelbrain/sketch-amp.js` | SKETCH AMP — Silhouette Authoring → Auto-Shaded Template + Construction Geometry | WIRED | — |
| `codex/core/pixelbrain/square-sharpness-contrast-amp.js` | _(no header comment — exports `enhanceSquaresForRender`, `buildSquareSharpnessContrastPayload`, `SQUARE_SHARPNESS_CONTRAST_AMP_ID`, `SQUARE_SHARPNESS_CONTRAST_VERSION`)_ | WIRED | `square-sharpness-contrast` |
| `codex/core/pixelbrain/symmetry-amp.js` | SYMMETRY AMP MICROPROCESSOR | WIRED | — |
| `codex/core/pixelbrain/tonation-amp.js` | _(no header comment — exports `buildTonationAmpPayload`, `TONATION_AMP_ID`, `TONATION_AMP_VERSION`)_ | WIRED | `pixelbrain.tonation-amp` |
| `codex/core/pixelbrain/vector-amp.js` | _(no header comment — exports `buildVectorAmpPayload`, `VECTOR_AMP_ID`, `VECTOR_AMP_VERSION`)_ | WIRED | `pixelbrain.vector-amp` |
| `codex/core/pixelbrain/volume-amp.js` | _(no header comment — exports `buildVolumeAmpPayload`, `VOLUME_AMP_ID`, `VOLUME_AMP_VERSION`)_ | WIRED | `pixelbrain.volume-amp` |
| `codex/core/pixelbrain/volume-lift-amp.js` | VOLUME-LIFT AMP — Structural-Energy → True 3D Voxel Volume | WIRED | `pixelbrain.volume-lift-amp` |

## Microprocessor family (`amps/**`, `codex/core/microprocessors`)

A **separate system** from the passes above: microprocessors are wired through
their own registries (e.g. `TileForgeMicroprocessor`) and are deliberately not
in `amp-registry.js`.

| Module | What it does | Status | Registered |
|---|---|---|---|
| `codex/core/microprocessors/arena/arena-tick.processor.js` | Arena Visual Tick Processor | WIRED | — |
| `codex/core/pixelbrain/amps/biome/biome-material.microprocessor.js` | _(no header comment — exports `BiomeMaterialMicroprocessor`)_ | WIRED | — |
| `codex/core/pixelbrain/amps/noise/deterministic-noise.js` | _(no header comment — exports `createSeededRng`)_ | WIRED | — |
| `codex/core/pixelbrain/amps/fibonacci/fibonacci-field.microprocessor.js` | _(no header comment — exports `FibonacciFieldMicroprocessor`)_ | WIRED | — |
| `codex/core/pixelbrain/amps/fibonacci/fibonacci-seed-field.js` | _(no header comment — exports `generateFibonacciSeedField`)_ | WIRED | — |
| `codex/core/pixelbrain/amps/volume/processors/heightmap.microprocessor.js` | _(no header comment — exports `generateHeightMap`)_ | WIRED | — |
| `codex/core/pixelbrain/amps/geometry/processors/iso-tile-geometry.microprocessor.js` | _(no header comment — exports `IsoTileGeometryMicroprocessor`)_ | WIRED | — |
| `codex/core/pixelbrain/amps/biome/material-resolver.js` | _(no header comment — exports `MaterialResolver`)_ | WIRED | — |
| `codex/core/pixelbrain/amps/noise/noise-mask.microprocessor.js` | _(no header comment — exports `generateNoiseMask`)_ | WIRED | — |
| `codex/core/pixelbrain/amps/noise/perlin-field.microprocessor.js` | _(no header comment — exports `PerlinFieldMicroprocessor`)_ | WIRED | — |
| `codex/core/pixelbrain/amps/qbit/qbit-snap-profile.js` | _(no header comment — exports `areSnapProfilesCompatible`, `canSnapEdges`, `QbitTileCellSchema`, `TileSnapProfileSchema`)_ | WIRED | — |
| `codex/core/pixelbrain/amps/geometry/processors/tile-socket.microprocessor.js` | _(no header comment — exports `TileSocketMicroprocessor`)_ | WIRED | — |
| `codex/core/pixelbrain/amps/turboquant/turboquant-layer-snapshot.js` | _(no header comment — exports `TurboQuantCandidateMemorySchema`)_ | WIRED | — |
| `codex/core/pixelbrain/amps/volume/processors/volume.microprocessor.js` | _(no header comment — exports `VolumeMicroprocessor`)_ | WIRED | — |

## Asset generators (`scripts/generate-*.mjs`)

**40 generators, 2 reachable via an `npm run` entry.**
The rest are invoked directly: `node scripts/generate-<name>.mjs`. Listed here so
the set is enumerable without a directory listing, and so each one's output root
is visible before you run it.

| Generator | Writes to | Door | npm |
|---|---|---|---|
| `scripts/generate-block-assets.mjs` | — | neither (direct) | no |
| `scripts/generate-compose-themes.mjs` | — | other | yes |
| `scripts/generate-declarative-amulet.mjs` | `output/pixelbrain/amulet` | B foundry | no |
| `scripts/generate-eclipse-ward-pauldron.mjs` — Generate the Eclipse Ward Pauldron asset via PixelBrain. | `output/foundry/eclipse-ward-pauldron` | neither (direct) | no |
| `scripts/generate-ff3-onion-knight.mjs` | `output/foundry/ff3-onion-knight` | neither (direct) | no |
| `scripts/generate-frost-acolyte-chibi.mjs` | `output/foundry/frost-acolyte-chibi` | neither (direct) | no |
| `scripts/generate-grass-tile-variations.mjs` | — | neither (direct) | no |
| `scripts/generate-holyfire-paladin-sword.mjs` — Generate the canonical Holy Fire Paladin Sword asset through the | `output/foundry/holyfire-paladin-sword` | B foundry | no |
| `scripts/generate-ice-slime-staff-scdl.mjs` | — | B foundry | no |
| `scripts/generate-ice-slime-staff.mjs` — Forge Ice Slime Staff through the SCDL compiler pipeline. | — | other | no |
| `scripts/generate-inventory-assets.mjs` | `output/foundry/scholomance-inventory` | B foundry | no |
| `scripts/generate-iso-tile-landscape.mjs` | — | other | no |
| `scripts/generate-kiteshield-v2.mjs` | `output/pixelbrain/kiteshield-v2` | B foundry | no |
| `scripts/generate-kiteshield-v3.mjs` | `output/pixelbrain/kiteshield-v3` | B foundry | no |
| `scripts/generate-loot-chest-tiers.mjs` | `output/foundry/loot-chest` | neither (direct) | no |
| `scripts/generate-mvp-inventory-icons.mjs` | — | other | no |
| `scripts/generate-new-void-chestplate.mjs` | `output/foundry` | B foundry | no |
| `scripts/generate-pickaxe-from-blueprint.mjs` — Forge a 3D voxel pickaxe directly from a sealed . | `output/foundry/voidmetal-pickaxe-blueprint` | B foundry | no |
| `scripts/generate-pickaxe-pdr.mjs` | `output/foundry/voidmetal-pickaxe-pdr` | B foundry | no |
| `scripts/generate-pine-tree.mjs` — Detailed isometric pine tree — organic jagged edges, 6-depth shading, | — | neither (direct) | no |
| `scripts/generate-pixelbrain-amulet.mjs` | `output/pixelbrain/amulet` | neither (direct) | no |
| `scripts/generate-pixelbrain-combat-props.mjs` | — | neither (direct) | no |
| `scripts/generate-pixelbrain-kiteshield.mjs` — Generate a high-definition Kiteshield asset through the PixelBrain pipeline. | `output/pixelbrain/kiteshield` | neither (direct) | no |
| `scripts/generate-pixelbrain-scimitar.mjs` — Generate a high-definition scimitar asset through the PixelBrain pipeline. | `output/pixelbrain/scimitar` | neither (direct) | no |
| `scripts/generate-pixelbrain-studio-manifest.mjs` | — | neither (direct) | yes |
| `scripts/generate-pixelbrain-sword.mjs` | `output/pixelbrain/sword` | neither (direct) | no |
| `scripts/generate-redwood-tree.mjs` — REDWOOD TREE — tall, majestic conifer using PixelBrain harmonic construction. | — | B foundry | no |
| `scripts/generate-slime-scdl.mjs` | — | neither (direct) | no |
| `scripts/generate-starbound-esper-aseprite.mjs` | `output/foundry/starbound-esper-void-chibi` | neither (direct) | no |
| `scripts/generate-starbound-esper-chibi-aseprite.mjs` | `output/foundry/starbound-esper-chibi` | neither (direct) | no |
| `scripts/generate-vaelrix-chibi-from-blueprint.mjs` | `output/foundry/vaelrix-chibi` | neither (direct) | no |
| `scripts/generate-void-chestplate-pro.mjs` | `output/foundry/void-chestplate-pro` | B foundry | no |
| `scripts/generate-void-chestplate.mjs` | `output/foundry/void-chestplate` | B foundry | no |
| `scripts/generate-void-grass.mjs` — Generates isometric void grass tiles from scratch. | — | neither (direct) | no |
| `scripts/generate-void-ice-island.mjs` | `output/foundry/void-ice-island` | neither (direct) | no |
| `scripts/generate-void-ui-hud.mjs` — VOID UI HUD Generator using PixelBrain | — | B foundry | no |
| `scripts/generate-voidmetal-pickaxe-3d.mjs` | `output/foundry/voidmetal-pickaxe-3d` | B foundry | no |
| `scripts/generate-voidmetal-pickaxe.mjs` | `output/foundry/voidmetal-pickaxe` | B foundry | no |
| `scripts/generate-voidshield.mjs` | `output/pixelbrain/voidshield` | B foundry | no |
| `scripts/generate-water-tile-variations.mjs` | — | neither (direct) | no |

`Door` is measured from each script's own imports, not its filename. It is
**three-way because the tree really holds three populations**: 16
scripts drive the ITEM-SPEC-v1 foundry (B), 0 drive the SCDL
compiler (A), and 20 import effect passes and the rasterizer
directly and compose them by hand. "writes to —" means the script resolves its
output path from a variable rather than a literal: open it to see.

Note the SCDL count. `scripts/` contains **no** SCDL-driven generator at all —
Door A is reached only through the CLI or an editor. So "there are two front
doors" is true of the *compiler* but false of the *tooling*: one door has a
walkway and 39 hand-laid paths beside it, and this is the first place that
difference is written down.

## If you are looking for something specific

- **Authoring an asset from text** → SCDL: `codex/core/pixelbrain/scdl/`, guide at
  `docs/scholomance-encyclopedia/Scholomance White Papers/SCDL_AUTHORING_GUIDE.md`.
  `npm run scdl -- compile <file.scdl>`.
- **Authoring an asset from a JS spec** → `item-foundry.js` / `ITEM-SPEC-v1`; the
  passes above are what the foundry composes.
- **Which output folder** → see `codex/core/pixelbrain/OUTPUTS.md`.
