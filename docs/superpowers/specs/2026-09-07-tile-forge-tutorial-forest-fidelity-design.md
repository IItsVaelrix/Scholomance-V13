# Design: Forge-Authored Tutorial Forest Fidelity

**Date:** 2026-09-07
**Status:** Design — approved approach, awaiting written-spec review
**Decision owner:** Angel
**Selected approach:** Forge-authored scene fabrics
**Collab task:** `d1e046d5-a42b-4cc8-9419-09139fb40196`

## 1. Goal

Beautify the existing 24×24 tutorial forest to professional storybook isometric-game
fidelity while retaining Scholomance's own visual identity. Wakfu and Dofus are
quality references for composition, material readability, scale, and atmosphere;
their assets, characters, motifs, and exact palette are not source material.

The final daylight scene must read as one authored forest, not a grid of individually
decorated diamonds. Quiet ground should support a legible route from the player glade
to the lotus pond and sanctuary. Hero trees and landmarks should carry the strongest
silhouettes and contrast. Void, lotus, and crystalline accents should identify the
world as Scholomance without overwhelming its pastoral tutorial function.

## 2. Current Evidence

The existing forest and Tile Forge implementation is a strong functional substrate:

- The 24×24 world, pathfinding, procedural assets, SCD128 witnesses, SCDL V2
  character, Phaser scene, and focused test suites are present.
- The focused forest and Tile Forge battery currently passes 58/58 tests.
- Tile Forge already has polymorphic `AssetSpec` output, deterministic sub-stream
  seeds, palette families, material primitives, hero-prop synthesis, and an
  asset-level quality scorer.

The current render does not yet meet the visual target:

- Most visible terrain comes from tutorial-specific `SCD128ReforgedTiles`, while
  Tile Forge supplies only a handful of props. Tile Forge is demonstrated but is
  not the authoritative scene renderer.
- Reusing one texture per terrain name exposes every 80×40 diamond boundary and
  creates high-frequency grass repetition.
- The pond reads as a cyan checkerboard rather than a continuous body of water.
- Paths repeat identical stones at tile cadence instead of forming one route.
- Prop scale, anchor shadows, and detail density vary enough that the scene reads
  as a montage of generators.
- The current quality scorer awards every benchmark asset 100/100 because it checks
  only basic pixel occupancy, luminance range, color count, and isolated pixels. It
  cannot detect repetition, excessive texture noise, scene hierarchy, anchor drift,
  or material discontinuity.

## 3. Considered Approaches

### A. Reskin the current per-tile render

Improve palettes and individual sprites while retaining one repeated texture per
terrain type. This is the lowest-risk code change, but the tile cadence remains the
dominant visual structure. Rejected because it cannot reach the target composition.

### B. Forge-authored scene fabrics — selected

Extend Tile Forge to synthesize a deterministic multi-tile ground surface from the
existing world description, then overlay Forge-authored botanical actors and props.
The logical grid remains authoritative for pathfinding and interaction, while the
visible surface is composed as regions rather than repeated tiles.

### C. One hand-painted background

Replace terrain generation with a single bespoke scene raster. This could maximize
one screenshot's fidelity, but it would abandon procedural reuse, deterministic
reseeding, and Tile Forge's purpose. Rejected.

## 4. Architectural Boundary

The world model stays authoritative for gameplay. Tile Forge becomes authoritative
for environmental appearance. Phaser remains a consumer.

```text
buildTutorialForestWorld(seed)
        │ logical cells, elevation, walkability, landmarks
        ▼
compileTutorialForestForgePlan(world)
        │ existing AssetSpec values + deterministic placements
        ▼
synthesizeTileForgeRegion(regionSpec)
        │ form masks first, shared palette/material realization second
        ├── scene ground RGBA + region witness/checksum
        └── Forge-authored environmental actors and props
        ▼
TutorialForestAssetBridge → Phaser textures
        ▼
TutorialForestScene
        ├── one continuous ground surface
        ├── animated water/lotus overlays
        ├── depth-sorted props and trees
        └── unchanged logical hit testing and BFS movement
```

No core Tile Forge module may import the tutorial forest. The tutorial adapter maps
the world to general Tile Forge inputs. This keeps the forge reusable for later maps.

The SCDL V2 player remains SCDL-authored. Per-cell SCD128 records remain the
authoritative provenance for logical tiles and props. The region texture is a
deterministic derived render, not a replacement schema or new gameplay authority.

## 5. Tile Forge Region Synthesis

### 5.1 Region input

Add a validated `TileForgeRegionSpec` beside the existing asset specifications:

- `id`, `seed`, `paletteFamily`
- `gridWidth`, `gridHeight`, `tileWidth`, `tileHeight`
- immutable cells containing `tx`, `ty`, `material`, `elevation`, and relevant
  rendering flags
- optional landmark and accent placements expressed through existing `AssetSpec`
  records
- explicit pixel and cell budgets

Validation must reject duplicate/out-of-bounds coordinates, unsupported materials,
invalid elevations, unsafe dimensions, and region pixel counts above the declared
budget. Inputs are copied or frozen; synthesis never mutates the world.

### 5.2 Form before realization

Region synthesis is two-stage:

1. **Form pass:** project cell diamonds to region coordinates; construct contiguous
   masks for meadow, ancient grove, path, pond, shore, plateau, and exposed cliff
   faces; derive material boundaries and elevation silhouettes.
2. **Realization pass:** apply a shared palette and material grammar inside those
   masks. Palette changes may not move a single alpha, boundary, elevation, or
   anchor pixel.

The form pass uses the exact tutorial grid projection (`tileW=80`, `tileH=40`,
16-pixel elevation step). Exterior pixels remain alpha-zero. Plateau faces are
generated only where a higher cell borders a lower cell; no rectangular tile boxes
or full-diamond cliff repetition is permitted.

### 5.3 Continuous material grammar

The realization pass samples region-space fields rather than restarting noise per
tile:

- **Meadow:** broad warm/cool value masses, sparse clustered clover and leaf marks,
  and quiet negative space. Blade detail is reserved for silhouettes and focal
  margins rather than covering every cell.
- **Path:** one continuous earthen route with irregular flagstone clusters, softened
  verge transitions, and occasional roots. Stone joints cannot reset at tile edges.
- **Water:** one broad dark-to-light mineral plane, clustered caustic bands,
  shoreline depth falloff, reeds at selected shore masks, and lotus accents. Logical
  water cells must not be individually outlined.
- **Cliff:** continuous strata across adjacent exposed faces, NW-lit ledges, root and
  moss clusters, and darker lower occlusion.
- **Ground shadows:** low-chroma, material-aware contact shadows under major props;
  no generic translucent ellipse detached from the receiving plane.

All noise, clustering, and accent selection uses namespaced deterministic sub-streams.
No timestamp, `Math.random()`, frame delta, or environment-dependent input is allowed.

## 6. Scholomance Sunlit-Glade Art Direction

Add a `scholomance_sunlit_glade` palette family and keep existing palette IDs for
backward compatibility. The new family is shared across scene surfaces and props and
is capped at 32 opaque RGB colors for the full environmental family.

Value hierarchy:

1. Deep root, pond, and under-canopy occlusion
2. Meadow and path body values
3. Sunlit foliage and stone planes
4. Lotus cyan, restrained void violet, and crystalline highlights
5. Small warm focal accents on flowers, wayfinding elements, and the player route

The primary light vector is NW/upper-left. Hue shifts distinguish material ramps:
cooler blue-green shadows, warm yellow-green foliage light, violet-biased root
occlusion, neutral-warm stone, and cyan mineral water. Pure white is reserved for
rare one-pixel specular accents.

The scene opens in bright storybook daylight. Twilight and night grading remain
functional, but they are secondary validation modes and must not be used to conceal
weak daytime form or contrast.

## 7. Environmental Actors and Composition

All non-character hero trees and principal forest landmarks used by the scene will
be dispatched through Tile Forge's public synthesis surface. Existing Forge types
are refined; missing forest types are added without importing game-specific modules
into core.

Required families:

- grandfather oak, autumn maple, moss oak, lotus cedar, young sapling, frost pine
- dolmen/waymarker, fairy stump, fallen log, lotus basin, stone well, fence,
  sunflowers, and mossy boulder

Each asset declares logical footprint, visual bounds, bottom-center anchor, contact
plane, light vector, and palette family. Scale is derived from role:

- framing trees: 2×2-cell footprint and dominant silhouette
- midground trees: 1×1 or 1×2 footprint
- landmarks: strong readable shape without exceeding nearby framing trees
- minor props: grouped clusters, not evenly scattered icons

The tutorial composition keeps the current semantic destinations but adjusts purely
visual placement when needed to create:

- a quiet, readable player clearing
- a continuous S-curve path
- one coherent pond mass
- asymmetrical tree framing and depth overlap
- a clear sanctuary focal point
- deliberate gaps between high-detail clusters

Any change to walkability, spawn, destination identity, or BFS connectivity is out
of scope.

## 8. Phaser Integration

Reorder scene creation so the logical world is built before visual assets. The asset
bridge receives the world and registers:

- one full ground-region texture for this 24×24 scene (within a 2048×2048 texture
  and declared pixel budget)
- separate elevated/animated overlays where needed
- Forge-authored prop and botanical textures
- the existing SCDL V2 character textures

`renderGroundTiles` becomes a continuous-region renderer. Logical tile selection and
movement continue through `fromIso` and `world.tileMap`; the visual region does not
become an input authority. Water and lotus animation layers retain absolute-time or
timer-selected deterministic frames. Tree sway may alter presentation only, never
source geometry or collision.

An explicit compatibility fallback may render the current individual tiles only if
region synthesis returns a structured validation failure. It must log the diagnostic
and may not silently award a passing quality grade. Tests and the production sandbox
must exercise the region path.

The React sandbox and its CSS are not redesigned in this pass.

## 9. Quality Scoring

Keep the existing asset scorer for basic structural checks and add a scene/region
quality evaluator. A single aggregate grade is insufficient; acceptance exposes
each metric and its evidence.

Required metrics:

- **palette discipline:** no more than 32 opaque environmental colors
- **repetition:** adjacent same-material tile crops may not be byte-identical;
  repeated local-block signatures must remain below a calibrated threshold
- **high-frequency noise:** quiet meadow regions must remain within a bounded local
  edge-density band
- **continuity:** shared path, water, shore, and cliff boundaries may not contain
  transparent gaps or one-pixel seams
- **form/realization isolation:** palette mutation cannot change form-mask hashes
- **value hierarchy:** path and landmark silhouettes remain separable from nearby
  ground in grayscale
- **anchor integrity:** opaque prop bounds and contact planes agree with `AssetSpec`
- **scene composition:** protected quiet zones and focal zones meet declared detail
  and contrast tiers

The current benchmark cannot claim Grade S merely because buffers exist. Scene-level
Grade S requires all hard invariants plus the target visual render to pass inspection.
Automated metrics are rejection oracles, not proof of artistic parity.

## 10. Error Handling and Budgets

- Reuse the project's structured PixelBrain diagnostic conventions for invalid
  region specs and over-budget synthesis.
- Reject unsafe integer dimensions before allocating RGBA buffers.
- Default region budget: at most 4,194,304 pixels and 64×64 logical cells.
- Tutorial target: one 24×24, approximately 1920×960 ground surface plus bounded
  overlays, remaining below a 2048×2048 texture.
- Cold synthesis plus texture upload must complete within 500 ms on the current
  development machine; exact measurements go in the PIR.
- Rendering remains pure and deterministic for identical normalized inputs.

## 11. Test-Driven Implementation

Implementation begins with failing tests for the missing behavior:

1. Region spec validation and allocation budgets
2. Exact deterministic output and checksum
3. Form-mask stability under palette mutation
4. Isometric alpha bounds and NW lighting order
5. Path/water/cliff continuity across former tile boundaries
6. Same-material repetition and quiet-zone edge-density guards
7. Shared 32-color environmental palette cap
8. Prop anchor/contact-plane integrity
9. Tutorial compiler uses Tile Forge region output and preserves the 24×24 logical
   world, spawn, destinations, walkability, and BFS path
10. Phaser scene selects the region render path while retaining interaction

After focused tests pass:

- rerun all existing Tile Forge and tutorial-forest tests
- run targeted lint on changed files
- run the production build and relevant security/immunity scans
- export native-resolution assets and a full-scene daylight render
- inspect 1× pixels, 2× nearest-neighbor zoom, alpha bounds, and grayscale hierarchy
- open `/internal/pixel-lotus/tutorial-forest` in the real browser and verify daylight,
  twilight, pan/zoom, selection, pathfinding, water animation, and deterministic reseed

## 12. Expected File Scope

Likely new core modules:

- `codex/core/pixelbrain/tile-forge/tile-forge.region-spec.js`
- `codex/core/pixelbrain/tile-forge/tile-forge.region-synthesizer.js`
- `codex/core/pixelbrain/tile-forge/tile-forge.region-quality-scorer.js`

Likely existing core modules:

- `tile-forge.palette-engine.js`
- `tile-forge.material-grammar.js`
- `tile-forge.hero-synthesizer.js`
- `tile-forge.synthesizer.js`
- `tile-forge.quality-scorer.js`
- `tile-forge.schema.js`

Likely tutorial integration:

- `src/game/tutorial-forest/generators/TutorialForestAssetBridge.js`
- `src/game/tutorial-forest/world/tutorialForestBuilder.js`
- `src/game/tutorial-forest/phaser/TutorialForestScene.js`
- a focused tutorial-to-Tile-Forge adapter beside the existing generators

Likely verification/artifacts:

- `tests/game/tile-forge/`
- `tests/game/tutorial-forest/`
- `scripts/export-tutorial-forest-visuals.mjs`
- `scripts/export-isometric-glade-composite.mjs`
- a post-implementation report and before/after visual evidence

Exact implementation scope may shrink after the first failing test, but it may not
expand beyond Tile Forge, the tutorial-forest consumer, focused tests, render/export
scripts, and the required PIR without renewed approval.

## 13. Non-Goals

- Copying or tracing Wakfu/Dofus assets, characters, maps, motifs, or exact palettes
- Replacing the logical world, pathfinding, interaction, or tutorial mechanics
- Rewriting the React sandbox UI or CSS
- Changing the SCDL V2 character architecture
- Adding combat, quests, NPC behavior, persistence, or networking
- Making post-processing compensate for weak source pixels
- Treating an automated score as proof of professional visual parity

## 14. Acceptance Verdict

The pass is complete only when:

- the visible environment is produced through Tile Forge's public synthesis path
- the forest reads as continuous regions rather than repeated diamonds
- the daylight render has a clear player glade, route, pond, and sanctuary hierarchy
- trees and landmarks share scale, anchoring, palette, and NW light law
- the environmental family uses no more than 32 opaque colors
- deterministic, isolation, budget, continuity, regression, build, and browser checks
  pass with recorded evidence
- before/after renders demonstrate material improvement at native resolution

The claim is **professional parity in composition and rendering discipline within
Scholomance's own style**, not asset-level imitation of another game's artwork.
