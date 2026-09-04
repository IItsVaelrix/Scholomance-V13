# Design: Vixel Stroke IR v1 — Contour Extraction, Frozen Contract, Deliberately Dumb Stylizer

**Status:** Approved by Vaelrix in conversation 2026-09-03; ready for PDR.
**Classification:** Architectural — new subsystem, new frozen data contract (`PB-STROKE-v1`).
**Prior art:** `2026-09-03-vri-scdl-wiring-pdr.md` (in-progress implementation; Task 1 committed, Task 2 written but held uncommitted specifically because this bug blocked its Phase 3 eyes-on check). `VERDICT-2026-09-03-VIXEL-SYSTEM.md` (documents VRI's earlier additive-lighting incident — the same shape of lesson: undifferentiated per-pass math produces silent, hard-to-see defects until someone actually looks).

## 1. Problem

Wiring `compileAsset()` into SCDL's CLI (the prior PDR) required a real eyes-on render check before merge — not a formality; it's exactly what caught this. `void_acolyte.scdl`'s hood (`circle 15.5 10 radius 7.5 hoodhi`, a real vector op) rendered with a torn, dashed-circle artifact around its silhouette under `--shade vri`. Root cause, traced directly: `vri-renderer.js:409-448`'s coverage-AA pass computes each cell's sub-pixel coverage **independently**, via a first-order linear extrapolation of that cell's own `signedDistance` along its own `normal`. On a straight edge, neighboring cells' linear approximations roughly agree. On a curve, they don't have to — and when two adjacent cells both independently compute low coverage at the same shared sub-pixel, that pixel is never painted (the frame buffer starts fully transparent), producing a visible gap. This is a continuous-math consistency bug: no amount of tuning the *formula* fixes it, because the formula is evaluated once per cell with no cross-cell agreement mechanism.

## 2. The reframe (Vaelrix, in conversation)

Rather than patch the coverage formula, treat this as the wrong architecture for what a boundary line actually is. Vixels' real job is not "vectorize the pixel art" — it's "decide where a line means something, and draw it deliberately," the way ink-and-paint animation separates line art from color fill. That reframe turns the bug into the occasion for the right fix: a discrete, deterministic **contour extraction** step (grid adjacency, not continuous sub-pixel math) feeding a typed **Stroke IR**, interpreted by a **stylizer** that is completely decoupled from geometry discovery. The tearing bug gets fixed as a side effect of doing this correctly — discrete grid adjacency between two cells cannot disagree with itself the way two independent floating-point extrapolations can.

## 3. Frozen v1 contract (`PB-STROKE-v1`)

```
type StrokeRole = "silhouette" | "material-boundary";

type StrokePath = {
  cells: Array<{ x: number, y: number, partId: string | null, sourceOpId: string | null }>;
};

type StrokeIR = {
  path: StrokePath;
  role: StrokeRole;
  baseWeight: number;           // neutral geometric fact (run length in cells), not a style choice
  depthClass?: string;          // reserved — not interpreted by the v1 stylizer
  lightExposure?: number;       // reserved — not interpreted by the v1 stylizer
  materialBoundary?: boolean;   // reserved — not interpreted by the v1 stylizer
  schemaVersion: "PB-STROKE-v1";
};
```

**Deliberately not frozen yet:** `weightStart`/`weightEnd`/taper representation. Variable-width strokes could be endpoint widths, a width curve, or control-point metadata — v1 doesn't yet have evidence to pick one, so it doesn't pretend to. Freezing `path`/`role`/`baseWeight`/the reserved semantic slots/`schemaVersion` protects the seam that matters (geometry survives presentation changes); leaving taper open protects against freezing the wrong representation.

**Provenance lives on the path, not a side table.** Each cell in `path.cells` carries its own `partId` and `sourceOpId`, taken directly from the compiled packet's own cell data (confirmed live: a compiled `void_acolyte.scdl` cell is `{x, y, color, partId, material, role, sourceOpId, z, snappedX, snappedY, emphasis}` — everything needed already exists on the packet, nothing new has to be threaded through SCDL or VRI's compiler to get it).

## 4. Extraction algorithm

Pure function, `extractContours(coords) → StrokeIR[]`, keyed by `` `${snappedX},${snappedY}` `` — the same lookup convention `vri-renderer.js:401-406` already uses for texture/mark/light cell lookups, so this reads as a sibling pattern rather than a new one.

For each cell, check its 8 grid neighbors (diagonals included — a 4-connected check can miss a diagonal-only gap in a stairstepped silhouette):
- A missing neighbor → this cell touches a **silhouette** edge.
- A present neighbor with a different `material` → this cell touches a **material-boundary** edge. Keyed strictly on `material`, not `partId` — two parts sharing a material shouldn't get an unjustified seam (matches Vaelrix's own spec: "differing material adjacency → material-boundary").

Contiguous same-role boundary cells, walked in a stable `y`-then-`x` order, merge into one `StrokeIR`'s `path.cells`. Stable iteration order is what makes "identical scene → byte-identical Stroke IR" achievable without floating point anywhere in the extractor.

**The extractor contains zero style constants** — no color, no pixel weight beyond the neutral run-length `baseWeight`. It answers exactly one question: what boundary is this, and why does it exist.

## 5. Stylizer

Pure function, `stylizeStrokes(strokeIR[], config?) → paint instructions` (`{ cells, color, pixelWeight }[]`). v1's only behavior: `role → fixed weight/color` (two constants, silhouette and material-boundary). It reads `role` and nothing else — no coordinate math, no adjacency discovery, no access to the original packet. This is the seam the whole design protects: richer stylizers (semantic line weight, style profiles) plug in here later without the extractor ever changing.

## 6. Raster integration — why this actually fixes the bug, not just covers it

Existing Pass 1–4 in `vri-renderer.js` run **completely unmodified**. Strokes are a fully separate, final overlay pass: after lighting, if `options.strokes` is true, walk the paint instructions and write hard, opaque, un-anti-aliased pixels directly into the buffer — no `smoothstep`, no sub-pixel extrapolation anywhere in this path. That's the actual fix: the bug is fragile *continuous* math failing to agree with itself at curves; a final overlay built entirely from *discrete* grid adjacency cannot disagree with itself by construction, because there's no floating-point comparison happening at all.

`renderVRI(scene, scale=4)` currently takes no options parameter — gains one: `renderVRI(scene, scale, options = {})`, `options.strokes` default `false`. Every existing caller, including `compileAsset()` (`asset-pipeline.js:242`), is unaffected until something explicitly opts in — "disabling the stroke pass reproduces existing raster behavior exactly" holds by construction, not by testing for it after the fact.

## 7. File organization

- `codex/core/pixelbrain/vixel/stroke-extractor.js` — `extractContours()`. No style knowledge.
- `codex/core/pixelbrain/vixel/stroke-stylizer.js` — `stylizeStrokes()`. No geometry discovery.
- `codex/core/pixelbrain/vixel/vri-schema.js` — gains the frozen `StrokeIR`/`StrokeRole`/`StrokePath` type documentation and `STROKE_CONTRACT = 'PB-STROKE-v1'`, alongside the existing `LAYER_TYPES`/`BLEND_MODES` contracts it already owns.
- `codex/core/pixelbrain/vixel/vri-renderer.js` — gains the options parameter and the final overlay-paint step; Pass 1–4 untouched.

## 8. Explicit v1 non-goals

Endpoint taper; continuous variable-width strokes; light-facing/shadow-facing stroke modulation; depth-aware occlusion weight; semantic anatomical roles beyond `silhouette`/`material-boundary`; pluggable style profiles; Anime Ink/Manga Ink/Pixel-Clean profiles; curved-path reconstruction beyond what fixing the tearing requires; hand-authored stroke overrides. All of these are real, named future work — not forgotten, just not tonight.

## 9. Relationship to the blocked PDR

`2026-09-03-vri-scdl-wiring-pdr.md`'s Task 2 (`--shade vri` CLI wiring) is written and tested but held uncommitted — its Phase 3 eyes-on check is what surfaced this bug, and per that PDR's own rollout plan, Phase 3 gates merge. Once this v1 slice lands, Task 2's eyes-on check gets redone (ideally with `options.strokes: true` enabled, once wired that far) before that commit proceeds. This design doc does not itself modify `scdl.cli.js` or re-wire `--shade vri`'s default — that remains the other PDR's job.

## Spec self-review

- Placeholder scan: none — every section states a concrete decision or an explicit, named non-goal.
- Internal consistency: §4/§5's "extractor has no style, stylizer has no geometry" split is enforced by §7's file boundaries, not just asserted in prose.
- Scope check: one subsystem, one frozen contract, two extraction rules, one stylizer behavior. Small enough for a single implementation plan; the explicit non-goals list (§8) is what keeps it that size.
- Ambiguity check: "material-boundary" is pinned to `material` difference, not `partId` difference, per Vaelrix's own spec — stated explicitly in §4 rather than left inferred.
