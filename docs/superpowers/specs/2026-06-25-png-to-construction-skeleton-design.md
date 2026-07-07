# PNG → Character Construction Skeleton — Design

**Date:** 2026-06-25
**Status:** Approved (design), pending implementation plan
**Area:** `codex/core/pixelbrain/`

## Goal

Give PixelBrain a function you can hand a character/body **asset PNG** and get back the
**construction lines** of that image as a data structure: the underlying geometry an artist
would block in — vertical midline, head circle, and the horizontal division lines through
the chin, shoulders, waist/hips, knees, and ankles — plus the matching skeleton anchors.

This is the *reverse* of the existing `construction-line-microprocessor.js`
(`spec → guides`) and `character-construction-skeleton.js` (`bodyResult → skeleton`):
here we infer construction geometry *from finished pixels*.

## Scope decisions (locked during brainstorming)

- **Output:** data structure only — no image is written.
- **Asset type:** characters/bodies. Output uses the existing
  `PB-CONSTRUCTION-SKELETON-v1` contract (head/face/torso/legs anchors).
- **Input source:** PixelBrain foundry-generated PNGs — clean transparent background,
  single centered figure, known canvas sizes, roughly-known proportions. Robust external
  pixel-art segmentation (backgrounds, multi-pose) is **out of scope**.
- **Approach:** row-width-profile landmark detection, with canonical chibi proportion
  priors used only as a sanity-check / fallback (not as the primary measurement).

## Module & location

New file: `codex/core/pixelbrain/image-to-construction-skeleton.js`

- Matches the existing `image-to-*.js` naming family
  (`image-to-bytecode-formula.js`, `image-to-pixel-art.js`, `image-to-semantic-bridge.js`).
- Reuses, does not duplicate:
  - `createCharacterSkeleton` / `validateCharacterSkeleton` /
    `CHARACTER_SKELETON_CONTRACT` from `character-construction-skeleton.js`
  - `rasterLine`, `rasterCircleMidpoint` from `raster-math.js`
  - Guide color convention `#00E5FF` (the `00_Reference` layer color used by
    `construction-line-microprocessor.js` and `construction-guides.js`).

## Architecture — two layers (isolation)

### 1. Pure core (all math, no I/O)

```
extractConstructionSkeleton({ mask, width, height }, opts) -> ConstructionResult
```

- `mask`: `Uint8Array` of length `width*height`, alpha/coverage per pixel.
- No filesystem, no `sharp`. Deterministic. Integer coordinates only.
- This is the unit-tested heart of the feature.

### 2. Thin I/O wrappers (the asset entry points)

```
imageToConstructionSkeleton(pngPathOrBuffer, opts) -> ConstructionResult   (async)
pbrainToConstructionSkeleton(pbrainObjOrJson, opts) -> ConstructionResult
maskFromCoordinates(coordinates, width, height)     -> Uint8Array
```

- **PNG** (`imageToConstructionSkeleton`): decodes via `sharp` (already a
  dependency) to raw RGBA, builds the alpha mask `alpha > opts.alphaThreshold`
  (default `8`), calls the core.
- **PixelBrain export** (`pbrainToConstructionSkeleton`): the real asset format
  is a `.pbrain.json` with a `coordinates` array and `metadata.manifest`
  dimensions. This wrapper rasterizes the coordinates to a mask via
  `maskFromCoordinates` (excluding any construction/reference guide cells so they
  never pollute the silhouette) and calls the core. Accepts a parsed object or a
  JSON string.
- Keeping decoding in the wrappers means the core stays pure and testable.

## Algorithm (the core)

1. **Silhouette + bounding box.** Figure pixels = `mask[i] > 0`. Compute
   `bounds = { minX, minY, maxX, maxY, width, height }`. Throw if no figure pixels.
2. **Row profile.** For each row `y` in `[minY..maxY]` record:
   - `left`, `right` extent of figure pixels,
   - `filled` width (count of figure pixels in the row),
   - `runs` = number of separate horizontal segments in the row (drives leg-split).
3. **Vertical midline.** Primary = center-of-mass x (weighted over all figure pixels).
   Refine by a symmetry score over candidate columns `±2px`, keep the best.
   Midline x is integer and clamped in-bounds.
4. **Head.** `headTop = bounds.minY`. **Chin** = the neck pinch: scanning down from the
   top, the first significant local minimum of `filled` below the head bulge (significance
   measured relative to head max width). Head circle: center at
   `(midline, (headTop+chin)/2)`, radius from head max half-width.
5. **Shoulders.** From chin downward, first significant local **maximum** of `filled`
   within a proportional window → `shoulderY`; `shoulderL/R` from that row's `left/right`.
6. **Waist / hips.** In the torso band (shoulder → leg region): first local **minimum**
   (waist) then a local **maximum** below it (hips), or the row just above the leg split.
   `hipL/R` from row extent.
7. **Legs.** Scanning down from the hips, the first row whose `runs == 2` (a center gap)
   marks the leg top. Ankles near `bounds.maxY`; knees at the midpoint between leg top and
   ankle. Each leg's column gives `kneeL/R`, `ankleL/R` x positions (left run vs right run).
8. **Face anchors** (eye line, nose line, mouth line). Placed by proportion *inside the
   measured head box* (e.g. eyes ~60% down the head box). Each flagged `inferred: true` —
   these are prior-derived construction lines, not pixel-measured landmarks.
9. **Priors as sanity-check.** Each landmark y is clamped to its expected proportional
   band relative to `bounds.height`. Any landmark not detected falls back to the
   proportional position. The result records, per anchor, whether it was `measured` or
   `prior`.

## Output shape (`ConstructionResult`, frozen)

```
{
  contract: 'PB-CONSTRUCTION-SKELETON-v1',
  skeleton: {            // passes validateCharacterSkeleton()
    head:  { top, center, chin },
    face:  { eyeLeft, eyeRight, nose, mouth, earLeft, earRight },  // inferred
    torso: { shoulderL, shoulderR, hipL, hipR },
    legs:  { kneeL, kneeR, ankleL, ankleR },
  },
  constructionLines: [   // explicit line primitives
    { id: 'axis.vertical', kind: 'axis-vertical', x, y0, y1, cells: [...] },
    { id: 'head.circle',   kind: 'head-circle',   center, radius,  cells: [...] },
    { id: 'guide.chin',    kind: 'guide-horizontal', y, x0, x1,    cells: [...] },
    // ...one guide-horizontal per landmark: chin, shoulder, waist, hip, knee, ankle
  ],
  bounds,                // { minX, minY, maxX, maxY, width, height }
  center,                // { x: midline, y: vertical COM }
  widthProfile,          // per-row diagnostics (left/right/filled/runs)
  provenance,            // { headChin: 'measured', shoulderY: 'measured', legTop: 'prior', ... }
}
```

- `constructionLines[*].cells` are integer, in-bounds guide cells (color `#00E5FF`)
  produced via `rasterLine` / `rasterCircleMidpoint`, matching the `00_Reference`
  convention so they drop straight into existing tooling.

## Options (`opts`)

- `alphaThreshold` (default `8`) — alpha cutoff for figure vs background.
- `includeCells` (default `true`) — emit rasterized guide cells, not just geometry.
- `includeFaceAnchors` (default `true`) — proportional face construction lines.
- `proportionProfile` (default chibi) — which proportion priors to use for sanity-check.

## Errors & edge cases

- Empty / fully-transparent image → throw a clear error (`no figure pixels`).
- No leg gap (robe / dress silhouette, `runs` never reaches 2) → legs derived from
  proportion, flagged `prior` in provenance (no crash).
- Asymmetric figure → midline still resolves from center-of-mass.
- All coordinates integer and clamped in-bounds (lattice keys cells by `"x,y"`;
  fractional/off-lattice guides are illegal per `construction-guides.js`).

## Determinism

No randomness anywhere. Same PNG in → identical result out. Integer math throughout.

## Testing

1. **Synthetic mask unit tests.** Programmatically build `Uint8Array` silhouettes
   (head bulge + torso + two legs; plus edge cases: robe with no leg gap, asymmetric
   figure, empty image) and assert detected anchors / provenance are within tolerance.
2. **Round-trip ground-truth test (strong).** Generate a character with the existing
   foundry, rasterize its cells to a mask, run `extractConstructionSkeleton`, and assert
   the inferred anchors match the foundry's *own* skeleton anchors within a small drift
   tolerance (center ≤ 2px, landmark y ≤ 2–3px). This validates the inference against a
   known construction rather than only synthetic shapes.
3. Tests live under `tests/core/pixelbrain/` alongside `body-profiles.test.js`.

## Out of scope

- External / hand-drawn sprites with backgrounds or arbitrary poses.
- Radial-item and generic-sprite construction models (the existing
  `construction-line-microprocessor.js` already covers radial).
- Writing an overlay PNG (output is data only).
- Medial-axis / morphological skeletonization (rejected approach C).
