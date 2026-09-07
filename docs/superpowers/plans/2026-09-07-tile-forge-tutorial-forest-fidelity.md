# Tile Forge Tutorial Forest Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox notation so progress survives handoffs.

**Goal:** Upgrade Tile Forge and the tutorial forest so the running Phaser scene closely preserves the approved concept image's broad composition, continuous terrain, readable silhouettes, material separation, and Scholomance palette while remaining deterministic, interactive, and pixel-authoritative.

**Architecture:** Add a region-level Forge path beside the existing single-asset synthesizers. It compiles the existing gameplay world into an immutable projected form mask, realizes that mask into one continuous RGBA ground fabric, scores scene-scale defects, and uploads the result through a thin tutorial-forest adapter. Environmental actors remain separate depth-sorted sprites, but their pixels and palette come from Tile Forge. Gameplay semantics stay owned by the existing world builder.

**Tech Stack:** Node.js 20 ESM, Vitest, Phaser 4.2, deterministic `Uint8ClampedArray` RGBA buffers, SCD128 witness records, Sharp for offline evidence renders, Playwright/browser inspection for final visual QA.

**Design spec:** `docs/superpowers/specs/2026-09-07-tile-forge-tutorial-forest-fidelity-design.md`

**Visual oracle:** `docs/superpowers/specs/assets/2026-09-07-tutorial-forest-concept.png`

## Non-negotiable constraints

- Preserve the 24×24 gameplay grid, walkability contract, player spawn, interaction coordinates, and pathfinding semantics.
- Keep form construction independent of color realization. A palette change must not alter the form hash.
- Every output must be byte-identical for identical input and seed. Do not use `Date.now()`, `Math.random()`, unordered iteration, browser dimensions, or ambient process state in production synthesis.
- Keep authored color count at or below 32 opaque RGB colors. Alpha zero is not a palette color.
- Render with integer pixel coordinates and nearest-neighbor scaling only.
- Do not import tutorial-scene modules into Tile Forge core. The adapter owns translation from game semantics to Forge semantics.
- Do not copy the concept image into the game or trace its pixels. Emulate its relationships: quiet central meadow, S-path, right pond, upper-right raised sanctuary, upper-left farm vignette, foreground stump/log, and a dense perimeter canopy.
- Keep the generated ground texture within 2048×2048 and initial synthesis within 500 ms on the repository's Node 20 baseline.
- Existing single-tile public APIs stay backward compatible.
- Target tests must be green before each scoped commit. Stage only the paths named in that task because the worktree contains inherited changes.

## Task 1: Freeze the region-input and deterministic-identity contract

**Files:**

- Create: `codex/core/pixelbrain/tile-forge/tile-forge.region-spec.js`
- Create: `tests/game/tile-forge/tile-forge-region-spec.test.js`

- [ ] **Step 1: Write the failing contract tests**

```js
import { describe, expect, it } from 'vitest';
import {
  createTileForgeRegionSpec,
  validateTileForgeRegionSpec,
} from '../../../codex/core/pixelbrain/tile-forge/tile-forge.region-spec.js';

const cells = [
  { tx: 0, ty: 0, elevation: 0, material: 'grass_quiet', tags: [] },
  { tx: 1, ty: 0, elevation: 0, material: 'path_flagstone', tags: ['path'] },
];

describe('Tile Forge region spec', () => {
  it('derives a stable identity from canonical content', () => {
    const a = createTileForgeRegionSpec({ id: 'tutorial-forest', seed: 4242, gridWidth: 2, gridHeight: 1, cells });
    const b = createTileForgeRegionSpec({ id: 'tutorial-forest', seed: 4242, gridWidth: 2, gridHeight: 1, cells: [...cells].reverse() });
    expect(a.regionKey).toBe(b.regionKey);
    expect(Object.isFrozen(a)).toBe(true);
  });

  it('rejects duplicate, missing, out-of-bounds, and unknown-material cells', () => {
    expect(validateTileForgeRegionSpec({ id: 'x', seed: 1, gridWidth: 2, gridHeight: 1, cells: [cells[0]] }).ok).toBe(false);
    expect(validateTileForgeRegionSpec({ id: 'x', seed: 1, gridWidth: 1, gridHeight: 1, cells: [cells[0], cells[0]] }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the new test and confirm it fails because the module is absent**

Run: `npx vitest run tests/game/tile-forge/tile-forge-region-spec.test.js`

Expected: FAIL with module-not-found for `tile-forge.region-spec.js`.

- [ ] **Step 3: Implement the smallest complete region spec**

Export these public contracts:

```js
export const TILE_FORGE_REGION_MATERIALS = Object.freeze([
  'grass_quiet', 'grass_edge', 'path_flagstone', 'water_pond',
  'cliff_stone', 'soil_garden', 'sanctuary_stone',
]);

export function validateTileForgeRegionSpec(input) { /* returns { ok, diagnostics } */ }
export function createTileForgeRegionSpec(input) { /* validates, sorts ty/tx, freezes, hashes */ }
```

The returned value must contain `contract: 'PB-TILE-FORGE-REGION-v1'`, `id`, unsigned `seed`, `gridWidth`, `gridHeight`, `tileWidth: 80`, `tileHeight: 40`, canonical `cells`, optional canonical `regions`, `paletteFamily`, and an FNV-1a-derived `regionKey`. Validate a maximum of 4096 cells and projected dimensions no larger than 2048×2048. Throw one `TypeError` carrying joined diagnostic codes only in the constructor; keep `validate...` non-throwing.

- [ ] **Step 4: Run the focused test**

Run: `npx vitest run tests/game/tile-forge/tile-forge-region-spec.test.js`

Expected: PASS.

- [ ] **Step 5: Commit only the two contract files**

```bash
git add codex/core/pixelbrain/tile-forge/tile-forge.region-spec.js tests/game/tile-forge/tile-forge-region-spec.test.js
git commit -m "feat(tile-forge): define deterministic region contract"
```

## Task 2: Build the palette-independent isometric form pass

**Files:**

- Create: `codex/core/pixelbrain/tile-forge/tile-forge.region-form.js`
- Create: `tests/game/tile-forge/tile-forge-region-form.test.js`

- [ ] **Step 1: Write tests for projection, continuity, and form stability**

The tests must construct a 3×3 spec with grass, path, water, and elevation. Assert:

```js
const form = buildTileForgeRegionForm(spec);
expect(form.contract).toBe('PB-TILE-FORGE-REGION-FORM-v1');
expect(form.width).toBeLessThanOrEqual(2048);
expect(form.height).toBeLessThanOrEqual(2048);
expect(form.cellAnchors['0,0']).toEqual({ x: 80, y: 0, elevation: 0 });
expect(form.materialMasks.path_flagstone.some(Boolean)).toBe(true);
expect(form.boundaries.some((edge) => edge.kind === 'shore')).toBe(true);
expect(buildTileForgeRegionForm({ ...spec, paletteFamily: 'autumnal_gold' }).formHash).toBe(form.formHash);
```

Also scan every opaque diamond row to prove adjacent cell coverage has no one-pixel transparent seam.

- [ ] **Step 2: Confirm the form tests fail**

Run: `npx vitest run tests/game/tile-forge/tile-forge-region-form.test.js`

Expected: FAIL because `buildTileForgeRegionForm` is not implemented.

- [ ] **Step 3: Implement form construction**

Export:

```js
export function projectRegionCell(tx, ty, elevation, gridHeight) {
  return {
    x: (tx - ty + gridHeight - 1) * 40,
    y: (tx + ty) * 20 - elevation * 16,
  };
}

export function buildTileForgeRegionForm(spec) { /* pure geometry only */ }
```

Rasterize each 80×40 top diamond into material masks using a shared edge rule. Derive ordered boundary records for shore, path verge, cliff face, and material transition. Store elevation separately. Hash only canonical geometry, material membership, and boundary topology. Do not import a palette module here.

- [ ] **Step 4: Run contract and form tests together**

Run: `npx vitest run tests/game/tile-forge/tile-forge-region-spec.test.js tests/game/tile-forge/tile-forge-region-form.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the form pass**

```bash
git add codex/core/pixelbrain/tile-forge/tile-forge.region-form.js tests/game/tile-forge/tile-forge-region-form.test.js
git commit -m "feat(tile-forge): compile continuous isometric region forms"
```

## Task 3: Add the Scholomance sunlit-glade palette and continuous realization

**Files:**

- Modify: `codex/core/pixelbrain/tile-forge/tile-forge.palette-engine.js`
- Create: `codex/core/pixelbrain/tile-forge/tile-forge.region-synthesizer.js`
- Create: `tests/game/tile-forge/tile-forge-region-synthesizer.test.js`

- [ ] **Step 1: Write failing realization tests**

Cover all of these assertions:

- `scholomance_sunlit_glade` exposes named ramps for meadow, verge, path, pond, cliff, wood, foliage, flower, cyan magic, violet magic, ink, and cast shadow.
- The union of all opaque ramp entries contains no more than 32 unique RGB values.
- Same spec and seed produce byte-identical RGBA, `formHash`, and `realizationHash`.
- A different seed changes detail pixels but leaves `formHash`, alpha occupancy, and material masks unchanged.
- A palette-family change leaves `formHash` unchanged.
- A 4-cell path has no disconnected run and a 2×2 pond has no checkerboard crop reset.
- Opaque pixels use only the declared palette.

- [ ] **Step 2: Confirm the new tests fail**

Run: `npx vitest run tests/game/tile-forge/tile-forge-region-synthesizer.test.js`

Expected: FAIL for missing palette family and synthesizer.

- [ ] **Step 3: Add the exact 32-color role palette**

Define `scholomance_sunlit_glade` as frozen role arrays. Reserve four darkest colors for contour/contact shadows, eight greens across meadow and foliage, five stone/path values, four water values, four wood/soil values, three warm flower/sun accents, two cyan accents, and two violet accents. Do not generate intermediate RGB values: dithering selects palette entries.

- [ ] **Step 4: Implement region realization**

Export:

```js
export function synthesizeTileForgeRegion(regionSpec) {
  const form = buildTileForgeRegionForm(regionSpec);
  return realizeTileForgeRegion(form, regionSpec);
}

export function realizeTileForgeRegion(form, regionSpec) { /* returns RGBA asset */ }
```

Use named deterministic substreams for `macro`, `material`, `lighting`, and `detail`. Shade once in projected region space with fixed northwest light. Use low-frequency clustered variation across world coordinates, not per-tile PRNG resets. Paint in this order: cast-shadow underpainting, material base masses, cliff faces, shoreline/path borders, restrained texture clusters, then rare accents. Keep at least 70% of quiet-meadow pixels in the three middle meadow colors.

Return `width`, `height`, `originX`, `originY`, `data`, `form`, `formHash`, `realizationHash`, `paletteFamily`, `palette`, `textureKey`, and a compact deterministic witness record. The `textureKey` must include the region key and seed.

- [ ] **Step 5: Run the three region suites**

Run: `npx vitest run tests/game/tile-forge/tile-forge-region-spec.test.js tests/game/tile-forge/tile-forge-region-form.test.js tests/game/tile-forge/tile-forge-region-synthesizer.test.js`

Expected: PASS.

- [ ] **Step 6: Commit the palette and realization**

```bash
git add codex/core/pixelbrain/tile-forge/tile-forge.palette-engine.js codex/core/pixelbrain/tile-forge/tile-forge.region-synthesizer.js tests/game/tile-forge/tile-forge-region-synthesizer.test.js
git commit -m "feat(tile-forge): synthesize continuous region fabrics"
```

## Task 4: Replace self-congratulatory asset scoring with scene-scale falsifiers

**Files:**

- Create: `codex/core/pixelbrain/tile-forge/tile-forge.region-quality-scorer.js`
- Create: `tests/game/tile-forge/tile-forge-region-quality.test.js`
- Modify: `tests/game/tile-forge/tile-forge-scd128.test.js`

- [ ] **Step 1: Write mutant tests before the scorer**

Create deterministic in-memory mutants from a valid region:

- `checkerboardWater`: alternates two water colors every pixel.
- `repeatedTileCrops`: copies one 80×40 crop across all cells.
- `seamedPath`: clears two pixels across the path centerline.
- `noisyMeadow`: replaces 45% of quiet meadow with accents.
- `flatGrayscale`: maps grass and path to equal luminance.

Assert each mutant fails its corresponding metric and cannot receive grade A. Assert the valid fixture passes hard invariants. Tests must inspect reported evidence rather than a single aggregate score.

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/game/tile-forge/tile-forge-region-quality.test.js`

Expected: FAIL because the region scorer is absent.

- [ ] **Step 3: Implement measurable scene metrics**

Export `scoreTileForgeRegion({ asset, form, spec })`. Return:

```js
{
  grade,
  score,
  hardFailures,
  metrics: {
    paletteColorCount,
    transparentSeamPixels,
    pathContinuityGaps,
    repeatedAdjacentCropRatio,
    quietMeadowAccentRatio,
    materialLuminanceSeparation,
    synthesisMilliseconds,
  },
}
```

Hard-fail any palette overflow, seam, path disconnect, dimension overflow, or nondeterministic witness. Grade A requires all hard invariants, crop repetition below 0.18, quiet-meadow accent ratio below 0.12, and at least 16 luma points between major adjacent materials. Grade S is reserved and must not be emitted by automated scoring alone.

- [ ] **Step 4: Repair the historical benchmark assertion**

Keep the existing single-asset benchmark as backward-compatibility evidence, but change the test name and expectation so `100/S` is no longer presented as professional scene parity. Assert deterministic completion and contract validity only. The new region scorer owns scene claims.

- [ ] **Step 5: Run all Tile Forge tests**

Run: `npx vitest run tests/game/tile-forge`

Expected: PASS, including every mutant rejection.

- [ ] **Step 6: Commit the quality gate**

```bash
git add codex/core/pixelbrain/tile-forge/tile-forge.region-quality-scorer.js tests/game/tile-forge/tile-forge-region-quality.test.js tests/game/tile-forge/tile-forge-scd128.test.js
git commit -m "test(tile-forge): add honest scene-scale fidelity gates"
```

## Task 5: Move the forest actor family behind Tile Forge's public API

**Files:**

- Create: `codex/core/pixelbrain/tile-forge/tile-forge.forest-actor-synthesizer.js`
- Modify: `codex/core/pixelbrain/tile-forge/tile-forge.synthesizer.js`
- Modify: `src/lib/pixelbrain/tileForge.adapter.js`
- Create: `tests/game/tile-forge/tile-forge-forest-actors.test.js`

- [ ] **Step 1: Write the public-API tests**

Request these actors through `synthesizeTileForgeAsset`, never through tutorial-local generators:

```js
const actorTypes = [
  'canopy_oak', 'canopy_maple', 'canopy_pine', 'young_sapling',
  'rustic_well', 'sanctuary_ruin', 'timber_fence', 'sunflower_patch',
  'hollow_stump', 'fallen_log', 'lotus_cluster', 'waymarker',
];
```

For every result assert deterministic bytes, transparent background, integer dimensions, 32-color compliance, lower-center anchor metadata, nonempty shadow/contact pixels, and a recognizable silhouette occupancy range. Assert distinct tree types do not share the same silhouette hash.

- [ ] **Step 2: Confirm public-API tests fail**

Run: `npx vitest run tests/game/tile-forge/tile-forge-forest-actors.test.js`

Expected: FAIL because actor types are not in the public dispatch.

- [ ] **Step 3: Implement actors form-first**

Build actor silhouettes from discrete primitives and reuse `tile-forge.material-grammar.js` for foliage, wood, and stone. Use one common 32-color palette. Produce `anchor: { x: 0.5, y: 0.94 }`, `depthBias`, `silhouetteHash`, and witness metadata. The tree family must use three canopy masses before leaves: trunk gesture, large boughs, then foliage lobes. Accents occupy less than 5% of opaque pixels.

- [ ] **Step 4: Wire the core and browser-safe adapter exports**

Add `synthesizeTileForgeRegion`, `scoreTileForgeRegion`, and the forest actor route to the core API. Re-export only browser-safe functions from `src/lib/pixelbrain/tileForge.adapter.js`; do not pull Node-only modules into the Vite bundle.

- [ ] **Step 5: Run public and historical Forge suites**

Run: `npx vitest run tests/game/tile-forge tests/tile-forge`

Expected: PASS.

- [ ] **Step 6: Commit the actor/API seam**

```bash
git add codex/core/pixelbrain/tile-forge/tile-forge.forest-actor-synthesizer.js codex/core/pixelbrain/tile-forge/tile-forge.synthesizer.js src/lib/pixelbrain/tileForge.adapter.js tests/game/tile-forge/tile-forge-forest-actors.test.js
git commit -m "feat(tile-forge): expose cohesive forest actor synthesis"
```

## Task 6: Compile the tutorial gameplay world into a Forge scene plan

**Files:**

- Create: `src/game/tutorial-forest/generators/TutorialForestForgeAdapter.js`
- Create: `tests/game/tutorial-forest/tutorial-forest-forge-adapter.test.js`
- Modify: `src/game/tutorial-forest/world/tutorialForestBuilder.js`

- [ ] **Step 1: Write adapter tests around existing gameplay invariants**

Capture the pre-change world facts in assertions: grid size, spawn, semantic tile counts, interactable IDs, and BFS reachability. Then assert:

```js
const world = buildTutorialForestWorld(4242);
const plan = compileTutorialForestForgePlan(world, { seed: 4242 });
expect(plan.regionSpec.gridWidth).toBe(24);
expect(plan.regionSpec.gridHeight).toBe(24);
expect(plan.composition.quietMeadow).toBeTruthy();
expect(plan.composition.pond.side).toBe('right');
expect(plan.composition.sanctuary.quadrant).toBe('upper-right');
expect(plan.composition.canopyRing.openCenterRatio).toBeGreaterThan(0.5);
```

Assert the concept relationships in tile coordinates, not pixel resemblance: the path crosses the center, the pond does not overlap the spawn clearing, sanctuary elevations exceed meadow elevation, and foreground log/stump anchors sit below the clearing centroid.

- [ ] **Step 2: Confirm the adapter test fails**

Run: `npx vitest run tests/game/tutorial-forest/tutorial-forest-forge-adapter.test.js`

Expected: FAIL for the absent adapter.

- [ ] **Step 3: Implement semantic translation**

Export:

```js
export function compileTutorialForestForgePlan(world, { seed = world.seed } = {}) { /* pure */ }
export function forgeTutorialForestEnvironment(world, options) { /* calls core Forge */ }
```

Map existing terrain to the seven region materials. Add visual-only composition metadata and actor descriptors. Preserve gameplay objects and collision values. If the world builder lacks enough metadata to express the oracle, add only explicit `visualRole`, `visualScale`, or `compositionRegion` fields; do not change walkability or IDs.

- [ ] **Step 4: Run adapter and world tests**

Run: `npx vitest run tests/game/tutorial-forest/reforged-world.test.js tests/game/tutorial-forest/tutorial-forest-forge-adapter.test.js`

Expected: PASS with the captured gameplay invariants unchanged.

- [ ] **Step 5: Commit the adapter**

```bash
git add src/game/tutorial-forest/generators/TutorialForestForgeAdapter.js src/game/tutorial-forest/world/tutorialForestBuilder.js tests/game/tutorial-forest/tutorial-forest-forge-adapter.test.js
git commit -m "feat(tutorial-forest): compile gameplay world for Tile Forge"
```

## Task 7: Replace per-tile ground repetition in Phaser without breaking interaction

**Files:**

- Modify: `src/game/tutorial-forest/generators/TutorialForestAssetBridge.js`
- Modify: `src/game/tutorial-forest/phaser/TutorialForestScene.js`
- Create: `tests/game/tutorial-forest/tutorial-forest-scene-region.test.js`

- [ ] **Step 1: Write a scene-level mock test**

Mock the Phaser texture manager and display list. Assert:

- `create()` builds the world before requesting Forge assets.
- Exactly one region-ground image is added for the 24×24 substrate.
- Per-tile ground images and per-water-cell base images are not added.
- Trees/props/player remain separate depth-sorted images.
- Texture upload sets `imageSmoothingEnabled = false`.
- `reseed(4242)` twice yields the same texture key and bytes.
- `reseed(4243)` replaces the prior generated region texture, leaves no orphan, and preserves input/interaction handlers.
- Particle placement and reset consume a seeded PRNG, not `Math.random()`.

- [ ] **Step 2: Confirm the scene test fails against current rendering**

Run: `npx vitest run tests/game/tutorial-forest/tutorial-forest-scene-region.test.js`

Expected: FAIL because the scene adds hundreds of ground images and uses `Math.random()`.

- [ ] **Step 3: Update the texture bridge**

Change `buildTutorialForestAssets(scene)` to `buildTutorialForestAssets(scene, world, { seed })`. Forge the ground and every environmental actor through the public API. Keep the existing SCDL player compiler. Add an RGBA uploader that replaces only the previous generated texture owned by this scene. Return a manifest containing `ground`, `actors`, `quality`, and `ownedTextureKeys`.

- [ ] **Step 4: Update scene lifecycle and rendering**

Build `world` before assets. Replace `renderGroundTiles()` with `renderGroundRegion()` using the generated asset's explicit origin. Keep `toIso`/`fromIso` for gameplay. Change `renderLotusPond()` to place only lotus/lilypad actors and any single pond effect layer; the continuous pond pixels already belong to the ground region. Create a seeded atmosphere substream and retain it during updates. On reseed, destroy scene-owned sprites/textures, rebuild world and Forge assets, then render once.

- [ ] **Step 5: Run all tutorial-forest tests**

Run: `npx vitest run tests/game/tutorial-forest`

Expected: PASS.

- [ ] **Step 6: Commit the Phaser cutover**

```bash
git add src/game/tutorial-forest/generators/TutorialForestAssetBridge.js src/game/tutorial-forest/phaser/TutorialForestScene.js tests/game/tutorial-forest/tutorial-forest-scene-region.test.js
git commit -m "feat(tutorial-forest): render one continuous Forge environment"
```

## Task 8: Produce native-size visual evidence and compare it to the oracle

**Files:**

- Modify: `scripts/export-tutorial-forest-visuals.mjs`
- Create: `tests/game/tutorial-forest/tutorial-forest-export.test.js`
- Create: `docs/scholomance-encyclopedia/post-implementation-reports/assets/tutorial-forest-fidelity/.gitkeep`

- [ ] **Step 1: Write CLI/parser and composite-layout tests**

Test that the exporter accepts `--seed`, `--out`, and `--scale`, rejects non-integer scale, defaults to nearest-neighbor scale 2, and invokes the same Forge adapter as runtime. Assert its native render hash equals the runtime region asset hash.

- [ ] **Step 2: Confirm the exporter test fails**

Run: `npx vitest run tests/game/tutorial-forest/tutorial-forest-export.test.js`

Expected: FAIL until the exporter becomes parameterized and uses the region API.

- [ ] **Step 3: Implement deterministic evidence export**

Compose the region ground plus depth-sorted actor RGBA buffers at integer coordinates with Sharp. Do not resample the native image. Generate a separate 2× nearest-neighbor inspection PNG. Print seed, dimensions, palette count, form hash, realization hash, SHA-256, synthesis time, and quality metrics as JSON.

- [ ] **Step 4: Run the exporter**

```bash
node scripts/export-tutorial-forest-visuals.mjs \
  --seed 4242 \
  --scale 2 \
  --out docs/scholomance-encyclopedia/post-implementation-reports/assets/tutorial-forest-fidelity
```

Expected files:

- `tutorial-forest-forge-native.png`
- `tutorial-forest-forge-2x.png`
- `tutorial-forest-forge-evidence.json`

- [ ] **Step 5: Inspect native and 2× images**

Use raw-pixel inspection plus a human visual pass. Reject and iterate if any of these remain:

- visible 80×40 crop repetition;
- checkerboard water;
- grass detail competing with the player/path;
- broken S-path continuity;
- pond outside the right-middle read;
- sanctuary not visually elevated;
- repeated identical tree silhouettes adjacent to one another;
- cyan/violet accents occupying more visual area than warm daylight greens;
- mixed nearest-neighbor and smoothed scaling.

- [ ] **Step 6: Commit exporter and evidence**

```bash
git add scripts/export-tutorial-forest-visuals.mjs tests/game/tutorial-forest/tutorial-forest-export.test.js docs/scholomance-encyclopedia/post-implementation-reports/assets/tutorial-forest-fidelity
git commit -m "test(tutorial-forest): add deterministic visual evidence"
```

## Task 9: Browser verification, PIR, and completion gate

**Files:**

- Create: `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260907-TILE-FORGE-TUTORIAL-FOREST-FIDELITY.md`
- Modify only if needed: `tests/visual/tutorial-forest.spec.js`

- [ ] **Step 1: Run the complete focused automated suite**

```bash
npx vitest run tests/game/tile-forge tests/game/tutorial-forest tests/tile-forge
npm run typecheck
```

Expected: focused tests PASS. If repository-wide typecheck has unrelated inherited failures, record the exact command and failures separately; do not misstate them as caused or fixed by this task.

- [ ] **Step 2: Run the real app and inspect the tutorial forest route**

Start the project with its normal dev command, open the actual tutorial-forest route in the in-app browser, and capture the rendered viewport. Verify keyboard movement, pointer movement, interaction markers, lighting toggle, debug toggle, resize, and reseed. Confirm the canvas uses crisp integer scaling at native zoom.

- [ ] **Step 3: Compare against the conceptual oracle by relationships**

Record PASS/FAIL for:

- quiet central meadow;
- legible S-curve flagstone path;
- pond right of center with readable lotus accents;
- upper-right raised sanctuary/ruin;
- upper-left agrarian vignette;
- foreground stump and fallen-log framing;
- dark perimeter canopy and bright interior;
- one coherent northwest daylight direction;
- restrained cyan/violet Scholomance accents;
- player silhouette remains the primary interactive focal point.

Do not claim exact stylistic parity with another studio. Claim only measured implementation fidelity to the approved original oracle.

- [ ] **Step 4: Run raw-pixel checks on exported evidence**

Use Sharp to verify image dimensions, channel count, opaque palette cardinality, alpha bounds, SHA-256, and exact 2× nearest-neighbor duplication. Save the measurements in the PIR.

- [ ] **Step 5: Write the PIR with explicit evidence boundaries**

Include commits, changed contracts, before/after images, test commands and results, quality metrics, browser observations, concept-relationship checklist, known limitations, and a hard distinction between automated evidence and human visual judgment.

- [ ] **Step 6: Run immunity scan on all staged task files**

```bash
npm run immune:scan
```

Expected: CLEAN for staged paths.

- [ ] **Step 7: Commit the PIR and any final focused visual test**

```bash
git add docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260907-TILE-FORGE-TUTORIAL-FOREST-FIDELITY.md tests/visual/tutorial-forest.spec.js
git commit -m "docs(tile-forge): record tutorial forest fidelity evidence"
```

- [ ] **Step 8: Run a final clean focused verification from HEAD**

```bash
npx vitest run tests/game/tile-forge tests/game/tutorial-forest tests/tile-forge
git status --short
```

Expected: focused tests PASS; `git status` may still show unrelated inherited work, but no uncommitted files owned by this plan.

## Execution note

The user has already approved implementation by asking to emulate the generated concept. Execute inline in this session, task by task, because the active collaboration policy does not authorize spawning subagents. Stop only for a genuine scope-changing decision or an unrecoverable external blocker.
