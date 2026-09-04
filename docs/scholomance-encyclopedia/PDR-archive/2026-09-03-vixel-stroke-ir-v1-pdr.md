# PDR: Vixel Stroke IR v1
## Discrete Contour Extraction, a Frozen Stroke Contract, and a Deliberately Dumb Stylizer

**Status:** Draft. Design approved by Vaelrix in conversation 2026-09-03; not yet implemented.
**Classification:** Architectural | PixelBrain/VRI | New Subsystem | New Frozen Contract (`PB-STROKE-v1`)
**Priority:** High — blocks `2026-09-03-vri-scdl-wiring-pdr.md`'s Task 2 commit, which is written, tested, and held specifically because its Phase 3 eyes-on check found the bug this PDR fixes.
**Primary Goal:** Replace VRI's fragile, per-cell-independent sub-pixel coverage math at part boundaries with a discrete, deterministic contour-extraction → Stroke IR → stylizer → raster-overlay pipeline — fixing a real tearing bug as a structural consequence of the correct architecture, not a patch to the broken one, and establishing the frozen v1 contract Vixels' contour system will build on.
**Bytecode Search Code:** `SCHOL-ENC-BYKE-SEARCH-PDR-VIXEL-STROKE-IR-V1-2026-09-03`

---

## Owner(s)
- **Codex:** the frozen `PB-STROKE-v1` contract (`StrokeRole`, `StrokePath`, `StrokeIR` shape) — schema-sovereign, same category as `VRI_VERSION`/`LAYER_TYPES` in `vri-schema.js`, which Codex already owns.
- **Gemini:** implementation — `stroke-extractor.js`, `stroke-stylizer.js`, the `renderVRI` options parameter and overlay-paint integration, all new tests.
- **Claude:** no v1 scope. No UI surface touched.
- **Escalation owner** (cross-domain conflicts): Angel (repository owner).

## Context (seed — not the Executive Summary)
Wiring `compileAsset()` into SCDL's CLI required a real eyes-on render check before merge, per that PDR's own rollout plan. It caught something the Verdict's 194-test corpus hadn't: `void_acolyte.scdl`'s hood — a real `circle` op — rendered with a torn, dashed silhouette. Rather than patch the formula that broke, this PDR builds what the bug's root cause was actually asking for: boundaries as deliberate, discrete decisions, not continuous math hoping to agree with itself.

## Target Integration Area
- New: `codex/core/pixelbrain/vixel/stroke-extractor.js`, `codex/core/pixelbrain/vixel/stroke-stylizer.js`.
- `codex/core/pixelbrain/vixel/vri-schema.js` — new frozen contract constants/types, alongside existing `LAYER_TYPES`/`BLEND_MODES`.
- `codex/core/pixelbrain/vixel/vri-renderer.js` — `renderVRI` gains an options parameter and a final overlay-paint step; **Pass 1–4 (`:409-680`, geometry/texture/marks/lighting) are read-only reference, not modified.**
- **Not modified:** `codex/core/pixelbrain/scdl/scdl.cli.js`, `codex/core/pixelbrain/asset-pipeline.js` — wiring `options.strokes: true` into the CLI's `--shade vri` path is `2026-09-03-vri-scdl-wiring-pdr.md`'s job, not this one's. This PDR makes the capability exist and default off; it does not turn it on anywhere.

## Core Concept
A boundary is a discrete fact about a grid, not a continuous property that two neighboring cells each estimate independently and hope agrees. `extractContours()` walks the compiled packet's own cell grid (keyed by `x,y`, the exact convention `vri-renderer.js` already uses for its own texture/mark/light lookups) and classifies each boundary cell by 8-connected adjacency: touches empty space → `silhouette`; touches a differently-materialed neighbor → `material-boundary`. That classification becomes a frozen `StrokeIR` record — geometry and semantic identity, no style. A stylizer, which cannot see geometry at all, maps `role` to a fixed weight and color. A final raster pass paints those instructions as hard, opaque pixels, after every existing lighting pass has already run, completely undisturbed. Two independent floating-point coverage estimates can disagree with each other; two lookups into the same integer-keyed map cannot.

## Implementation Philosophy
Fix the architecture, not the formula — the formula (`vri-renderer.js:409-448`'s sub-pixel SD extrapolation) is left exactly as it is; this PDR doesn't touch it, because the fix isn't "make that math more careful," it's "don't rely on that math to agree with itself at a boundary at all." Freeze only what has evidence behind it (`path`/`role`/`baseWeight`/reserved slots/`schemaVersion`); leave taper's representation genuinely open rather than guessing. Small composable modules with a hard style/geometry boundary enforced by file structure, not just convention.

## Ownership & Law Compliance
Every file this PDR writes appears in §7 with its owning agent. `PB-STROKE-v1` is a real schema addition to `vri-schema.js`, which already carries `PB-VRI-v1` — both are Codex-owned contracts in the same file, no new registration gap of the kind flagged against `PB-VRI-v1` in `VERDICT-2026-09-03-VIXEL-SYSTEM.md` (this PDR's §6 escalation addresses that directly for both). Determinism per `VAELRIX_LAW.md` Law 6: identical compiled packet → byte-identical `StrokeIR[]`, enforced by the extraction algorithm having zero floating-point comparisons and a stable iteration order (§3 Spec Sheet, F2).

---

# 1. Executive Summary

VRI's coverage-AA pass estimates anti-aliased boundary coverage per authored cell, independently, via a linear extrapolation of that cell's own signed distance along its own normal. On curves, neighboring cells' independent estimates can disagree, leaving an uncovered — fully transparent — gap. Measured directly on `void_acolyte.scdl`'s hood (a real `circle` op): a visibly torn, dashed silhouette.

This PDR does not patch that formula. It builds a separate, discrete contour system: `extractContours()` classifies boundary cells by integer grid adjacency (no floating point), emitting a frozen `StrokeIR` contract (`PB-STROKE-v1`) that separates geometric/semantic fact (`path`, `role`, `baseWeight`) from presentation (deferred to the stylizer, and beyond v1, to future style profiles). A final overlay pass paints the result as hard-edged ink, after all four existing lighting passes run completely unmodified.

Blast radius: three new/extended files, one new options parameter on `renderVRI` (default off), zero changes to existing rendering passes. `2026-09-03-vri-scdl-wiring-pdr.md`'s held Task 2 commit is this PDR's direct reason for existing — once this lands, that PDR's Phase 3 eyes-on check gets redone.

# 2. Out of Scope / Non-Goals

- **Endpoint taper / continuous variable-width strokes.** Representation undecided by design — freezing it now would freeze the wrong guess.
- **Light-facing/shadow-facing stroke modulation.** `lightExposure` is a reserved IR slot, unused by the v1 stylizer.
- **Depth-aware occlusion weight.** `depthClass` is reserved, unused by v1.
- **Semantic anatomical roles beyond `silhouette`/`material-boundary`.**
- **Pluggable style profiles** (Anime Ink, Manga Ink, Retro JRPG, 90s Cel, Pixel-Clean, etc.) — v1's stylizer has exactly one, unconditional behavior.
- **Curved-path reconstruction beyond what fixing the tearing requires** — `StrokePath.cells` is a cell list, not a smoothed polyline or bezier.
- **Hand-authored stroke overrides.**
- **Re-wiring `--shade vri`'s default to enable strokes** — that belongs to `2026-09-03-vri-scdl-wiring-pdr.md`, not this PDR.
- **Any change to `vri-renderer.js`'s existing Pass 1–4 logic.** Read-only reference throughout.

# 3. Spec Sheet

## 3.1 Functional Spec

**F1 — Frozen `PB-STROKE-v1` contract.** `vri-schema.js` gains `STROKE_CONTRACT = 'PB-STROKE-v1'` and documented types for `StrokeRole` (`'silhouette' | 'material-boundary'`), `StrokePath` (`{ cells: Array<{x, y, partId, sourceOpId}> }`), and `StrokeIR` (`{ path, role, baseWeight, depthClass?, lightExposure?, materialBoundary?, schemaVersion }`). *Acceptance:* a schema-shape test asserts every field name and that the three reserved fields are optional.

**F2 — `extractContours(coords) → StrokeIR[]`, deterministic.** Builds a `Map` keyed by `` `${x},${y}` `` (matching `vri-renderer.js:400-407`'s existing convention exactly). For each cell, checks its 8 grid neighbors: any missing → `silhouette`; any present with `neighbor.material !== cell.material` → `material-boundary`. Contiguous same-role cells (walked `y`-then-`x`) merge into one `StrokeIR`. *Acceptance:* (a) running twice on the same input produces byte-identical (via `JSON.stringify` equality) output arrays; (b) a synthetic single-material filled circle produces only `silhouette` strokes, zero `material-boundary`; (c) a two-material checkerboard produces `material-boundary` strokes at every color change and `silhouette` only at the true outer edge.

**F3 — `stylizeStrokes(strokeIR[], config?) → paint instructions`, geometry-blind.** Maps `role` to a fixed `{ color, pixelWeight }` (two constants: silhouette, material-boundary). *Acceptance:* a mutation test replacing the function body with one that also reads `path.cells[0].x` (i.e., touches geometry) must be independently rejected by a lint/structural check — see F5.

**F4 — Raster overlay in `renderVRI`.** `renderVRI(scene, scale, options = {})` — new third parameter, `options.strokes` default `false`. When `true`, after Pass 4 completes, walk the stylizer's paint instructions and write hard `[r,g,b,255]` pixels (no `smoothstep`, no coverage blending) at each cell's full `scale×scale` sub-pixel block. *Acceptance:* `options.strokes` omitted or `false` produces byte-identical raster output to the current `renderVRI(scene, scale)` two-argument call, on every existing VRI test fixture.

**F5 — Structural enforcement of the extractor/stylizer boundary.** A test statically greps `stroke-extractor.js` for style-constant patterns (hex colors, pixel-weight literals) and `stroke-stylizer.js` for geometry-discovery patterns (`.neighbor`, `Map(`, coordinate arithmetic) and fails if either is found outside an allow-listed exception. This makes the invariant mechanically checkable, not just a code-review convention.

## 3.2 Non-Functional Spec

- **Determinism:** `extractContours()` on an identical input array produces byte-identical output, 100-iteration repeat test (matching this project's standard determinism ritual).
- **No existing-behavior regression:** every existing VRI test (the Verdict's 194) passes unmodified; `renderVRI` calls that don't pass `options.strokes: true` are provably unaffected (F4).
- **Failure mode:** `extractContours()` or `stylizeStrokes()` throwing propagates as a real error from `renderVRI`, never a silent fallback to un-inked output — an author who asked for strokes and got none needs to know.

## 3.3 Contracts

See §1 Core Concept and the frozen shape in F1. Real example, from `void_acolyte.scdl`'s hood boundary (`circle 15.5 10 radius 7.5 hoodhi`):

```json
{
  "schemaVersion": "PB-STROKE-v1",
  "role": "silhouette",
  "baseWeight": 1,
  "path": {
    "cells": [
      { "x": 8, "y": 3, "partId": "hood", "sourceOpId": "op:hood:0:circle" },
      { "x": 9, "y": 2, "partId": "hood", "sourceOpId": "op:hood:0:circle" }
    ]
  }
}
```

**Deferred to a follow-up PDR:** taper representation; light/depth-aware weighting; style profiles; wiring `options.strokes` into `--shade vri`'s actual CLI path.

# 4. Change Classification

- **architectural** — new subsystem (contour extraction + stylizer), new frozen contract (`PB-STROKE-v1`). The reason this gets full PDR treatment despite fixing what looks like a rendering bug.
- **structural** — two new files; `vri-schema.js` and `vri-renderer.js` extended, not restructured.
- **behavioral** — new opt-in raster output path; default behavior for every existing caller is provably unchanged (F4).
- Not **cosmetic** — this is the actual fix for a real visual defect, not a formatting change.

# 5. Assumptions and Unknowns

## 5.0 Grounds

| Claim | Grounds | Basis |
|---|---|---|
| The tearing bug's root cause is per-cell-independent linear SD extrapolation disagreeing at curves | measured | `vri-renderer.js:409-448` read directly; reproduced live on `void_acolyte.scdl`'s hood (`circle 15.5 10 radius 7.5`), confirmed the artifact follows the circular boundary exactly |
| `renderVRI` currently takes no options parameter | measured | `vri-renderer.js:395`, `export function renderVRI(scene, scale = 4) {` |
| A compiled cell already carries everything F2's extraction needs | measured | live compile of `void_acolyte.scdl`: `{x, y, color, partId, material, role, sourceOpId, z, snappedX, snappedY, emphasis}` |
| `vri-renderer.js` already has a `x,y`-keyed cell-lookup convention to match | measured | `vri-renderer.js:400-407`, `cellMap.set(`${c.x},${c.y}`, c)` |
| `vri-schema.js` already owns contract constants of this shape | measured | `VRI_VERSION`, `LAYER_TYPES`, `BLEND_MODES` etc. all declared there, `:24-100` |
| 8-connected adjacency is the right default for silhouette detection | **judgement** | defensible (catches diagonal-only gaps a 4-connected check would miss) but not measured against a corpus of counterexamples — flagged as the one algorithmic parameter chosen by default rather than derived |
| Merging contiguous same-role cells into one stroke (vs. one stroke per cell) is the right granularity | **architectural** | matches the "stroke as a path" framing in the frozen contract; not yet tested against a case where this grouping produces a surprising result |

## 5.1 Assumptions

- A1 *(measured)*: keying on `material` (not `partId`) for material-boundary detection is correct per Vaelrix's own explicit spec — two parts sharing a material should not get an unjustified seam.
- A2 *(architectural)*: a final-overlay raster pass (paint after Pass 4, never touching Pass 1–4's own buffer-write logic) is sufficient to guarantee "disabling reproduces existing behavior exactly" — true by construction as long as the overlay step is genuinely the last thing that touches `buf`, which F4's acceptance test verifies directly.

## 5.2 Unknowns

- U1: whether 8-connected adjacency (§5.0) produces visually correct results on a wider corpus than the two-fixture spot check in this PDR's QA plan. Resolve empirically as more real assets are checked, not by pre-emptive tuning.
- U2: whether merging contiguous cells into one `StrokeIR` per run (rather than per-cell) will need revisiting once taper is designed — a taper needs to know where along a path it is, which requires the path to already be one connected thing. Flagged as a forward-compatibility bet, not yet tested against taper because taper doesn't exist yet.

# 6. Open Questions / Escalations

**ESCALATION:** `VERDICT-2026-09-03-VIXEL-SYSTEM.md` flagged `PB-VRI-v1` as never registered in `SCHEMA_CONTRACT.md` (WARN, not CRIT — see that Verdict's §4). This PDR adds a second contract, `PB-STROKE-v1`, to the same unregistered file. Option A: register both `PB-VRI-v1` and `PB-STROKE-v1` in `SCHEMA_CONTRACT.md` together, as one follow-up, since they now share the registration gap. Option B: keep deferring, as the Verdict already elected to do for `PB-VRI-v1` alone. Recommendation: Option A — two related unregistered contracts in the same file is a stronger case for registering than one was. Owner: Codex.

# 7. Architecture / File Map

```
codex/core/pixelbrain/vixel/
  stroke-extractor.js       NEW  Gemini  extractContours(coords) -> StrokeIR[] (F2).
                                          Zero style constants (F5).
  stroke-stylizer.js        NEW  Gemini  stylizeStrokes(strokeIR[], config?) -> paint
                                          instructions (F3). Zero geometry discovery (F5).
  vri-schema.js             MOD  Codex   STROKE_CONTRACT = 'PB-STROKE-v1', StrokeRole/
                                          StrokePath/StrokeIR type docs (F1)
  vri-renderer.js           MOD  Gemini  renderVRI gains options param + final overlay-
                                          paint step (F4). Pass 1-4 untouched.
tests/codex/core/pixelbrain/vixel/
  stroke-extractor.test.js       NEW  Gemini  F2: determinism (100-iter), single-material
                                               circle -> silhouette only, checkerboard ->
                                               material-boundary at every seam
  stroke-stylizer.test.js        NEW  Gemini  F3: role -> fixed weight/color, no geometry
                                               access
  stroke-boundary-lint.test.js   NEW  Gemini  F5: structural grep enforcing the extractor/
                                               stylizer separation
  vri-renderer.strokes.test.js   NEW  Gemini  F4: options.strokes off -> byte-identical to
                                               today; options.strokes on -> void_acolyte's
                                               hood boundary is continuous (no transparent
                                               gap cells within the silhouette run)
```

Dependency direction: `vri-renderer.js` → `stroke-extractor.js` (pure) → `stroke-stylizer.js` (pure) → back into `vri-renderer.js`'s own buffer-write step. Neither new file imports the other; `vri-renderer.js` is the only thing that imports both, and only inside the new opt-in branch.

# 8. Step-by-Step Implementation Plan

**Phase 1 — Frozen contract (Codex defines, Gemini implements, ~1 hour).** Milestone: `vri-schema.js` carries `STROKE_CONTRACT` and documented types. Exit criteria: schema-shape test (F1) green.

**Phase 2 — Extractor (Gemini, ~2 hours). Requires Phase 1.** Milestone: `extractContours()` passes F2's three acceptance cases plus the 100-iteration determinism test. Exit criteria: `stroke-extractor.test.js` green.

**Phase 3 — Stylizer (Gemini, ~1 hour). Requires Phase 1.** Milestone: `stylizeStrokes()` implemented. Exit criteria: `stroke-stylizer.test.js` green; `stroke-boundary-lint.test.js` (F5) passes for both new files.

**Phase 4 — Raster integration (Gemini, ~1.5 hours). Requires Phases 2-3.** Milestone: `renderVRI` gains the options parameter and overlay step. Exit criteria: `vri-renderer.strokes.test.js` green — specifically, `void_acolyte.scdl` compiled with `options.strokes: true` produces a continuous (non-torn) hood silhouette, verified both by an automated no-transparent-gap-cells assertion and a human look at the rendered PNG (this bug was found by looking, not by a test — the fix's proof needs the same standard).

**Phase 5 — Full regression + eyes-on (Gemini + Vaelrix, ~30 min).** Run the Verdict's full 194-test VRI suite (must stay 194/194, `options.strokes` defaults false so nothing here should move) plus this PDR's new tests. Then render `void_acolyte.scdl` and at least one materially different sprite (different silhouette shape, different material count) with `options.strokes: true` and look at both.

# 9. Code Examples — Pivotal Changes

**9.1 Frozen contract (`vri-schema.js`):**

```js
// vri-schema.js — alongside VRI_VERSION, LAYER_TYPES, etc.
export const STROKE_CONTRACT = 'PB-STROKE-v1';

/**
 * @typedef {'silhouette'|'material-boundary'} StrokeRole
 * @typedef {{ cells: Array<{x:number,y:number,partId:string|null,sourceOpId:string|null}> }} StrokePath
 * @typedef {{
 *   path: StrokePath, role: StrokeRole, baseWeight: number,
 *   depthClass?: string, lightExposure?: number, materialBoundary?: boolean,
 *   schemaVersion: 'PB-STROKE-v1',
 * }} StrokeIR
 */
```

**9.2 Extraction — the discrete adjacency check that replaces continuous per-cell math:**

```js
// stroke-extractor.js
import { STROKE_CONTRACT } from './vri-schema.js';

const NEIGHBORS_8 = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];

export function extractContours(coords) {
  const byKey = new Map();
  for (const c of coords) byKey.set(`${c.x},${c.y}`, c);

  // role per cell, computed once, purely from grid membership + material —
  // no signed distance, no normals, no floating point anywhere in this function.
  const roleByKey = new Map();
  for (const c of coords) {
    const key = `${c.x},${c.y}`;
    let role = null;
    for (const [dx, dy] of NEIGHBORS_8) {
      const n = byKey.get(`${c.x + dx},${c.y + dy}`);
      if (!n) { role = 'silhouette'; break; }
      if (n.material !== c.material && role !== 'silhouette') role = 'material-boundary';
    }
    if (role) roleByKey.set(key, role);
  }

  // Stable y-then-x walk, merging contiguous same-role runs — this ordering is
  // what makes repeated runs on the same input byte-identical.
  const sorted = [...coords].sort((a, b) => a.y - b.y || a.x - b.x);
  const visited = new Set();
  const strokes = [];
  for (const c of sorted) {
    const key = `${c.x},${c.y}`;
    const role = roleByKey.get(key);
    if (!role || visited.has(key)) continue;
    const cells = [];
    const stack = [c];
    while (stack.length) {
      const cur = stack.pop();
      const curKey = `${cur.x},${cur.y}`;
      if (visited.has(curKey) || roleByKey.get(curKey) !== role) continue;
      visited.add(curKey);
      cells.push({ x: cur.x, y: cur.y, partId: cur.partId ?? null, sourceOpId: cur.sourceOpId ?? null });
      for (const [dx, dy] of NEIGHBORS_8) {
        const n = byKey.get(`${cur.x + dx},${cur.y + dy}`);
        if (n) stack.push(n);
      }
    }
    strokes.push({
      path: { cells: cells.sort((a, b) => a.y - b.y || a.x - b.x) },
      role,
      baseWeight: cells.length,
      schemaVersion: STROKE_CONTRACT,
    });
  }
  return strokes;
}
```

**9.3 Stylizer — role-only, cannot see geometry:**

```js
// stroke-stylizer.js
const V1_TREATMENT = {
  'silhouette':        { color: '#1B1230', pixelWeight: 1 },
  'material-boundary':  { color: '#1B1230', pixelWeight: 1 },
};

export function stylizeStrokes(strokeIR) {
  return strokeIR.map((stroke) => ({
    cells: stroke.path.cells,          // passed through, not inspected
    ...V1_TREATMENT[stroke.role],
  }));
}
```

**9.4 Raster overlay — the actual fix, running after everything else:**

```js
// vri-renderer.js — was: export function renderVRI(scene, scale = 4) {
export function renderVRI(scene, scale = 4, options = {}) {
  // ...existing Pass 1-4, completely unchanged, builds `buf`...

  if (options.strokes) {
    const geoLayer = scene.layers.find(l => l.type === LAYER_TYPES.GEOMETRY);
    const strokeIR = extractContours(geoLayer?.payload.coordinates || []);
    const paint = stylizeStrokes(strokeIR);
    for (const { cells, color, pixelWeight } of paint) {
      const [r, g, b] = hexToRGB(color);
      for (const cell of cells) {
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = cell.x * scale + sx, py = cell.y * scale + sy;
            const idx = (py * W + px) * 4;
            buf[idx] = r; buf[idx + 1] = g; buf[idx + 2] = b; buf[idx + 3] = 255;
          }
        }
      }
    }
  }

  return { width: W, height: H, data: buf };
}
```

# 10. Glossary

- **Contour extraction** — classifying which authored cells sit on a boundary, and why, using discrete grid adjacency rather than continuous sub-pixel math.
- **Stroke IR / `PB-STROKE-v1`** — the frozen data contract separating a boundary's semantic identity (`path`, `role`, `baseWeight`) from how it's ultimately drawn.
- **Stylizer** — the presentation layer, geometry-blind by design, that maps `role` to actual paint instructions.
- **Silhouette** — a boundary cell touching empty grid space (the part's outer edge).
- **Material-boundary** — a boundary cell touching a differently-materialed neighbor (an internal seam).
- **Reserved slot** — an IR field (`depthClass`, `lightExposure`, `materialBoundary`) present in the frozen contract but not yet interpreted by any stylizer, protecting the shape future passes will need.

# 11. Q&A — Implementation Concerns

**Q1: Why not just fix the coverage-AA formula in Pass 1?** Because the bug isn't a wrong constant, it's an architectural property: two independent per-cell floating-point estimates are not guaranteed to agree at a shared boundary, no matter how the formula is tuned. A discrete, single-source-of-truth classification (this cell's role, computed once) cannot have that class of disagreement.

**Q2: Does this change what non-stroke VRI output looks like?** No — Pass 1–4 are unmodified, and `options.strokes` defaults `false`. F4's acceptance criterion is explicitly byte-identical output without the flag.

**Q3: Why 8-connected adjacency and not 4?** A 4-connected check can miss a diagonal-only gap in a stairstepped silhouette (two cells touching only at a corner). Flagged in §5.0 as a judgement call, not a measured requirement — worth revisiting if a real asset's silhouette looks wrong under it.

**Q4: What happens to the existing `strokeHalfWidth`-based stroke rendering already in Pass 1 (the `hw != null` branch)?** Untouched. That's a different mechanism (author-declared stroke width on a vector op, rendered with the same fragile per-cell coverage math as fills) and out of scope — it has the same theoretical tearing exposure on curves, but wasn't the bug found this session and isn't this PDR's job to fix. Worth naming as a related, not-yet-measured risk for a future pass.

**Q5: Why merge contiguous cells into one stroke instead of one `StrokeIR` per cell?** A stroke is conceptually a path, and per-cell IR would make future taper (which needs "where along this path am I") impossible to express later without changing the contract. Flagged as U2 (§5.2) — an architectural bet made now, not yet tested against taper because taper doesn't exist yet.

**Q6: Could this ever paint a stroke where none was intended?** Only if `extractContours()`'s adjacency logic is wrong, which is exactly what F2's acceptance tests (single-material circle → silhouette only, checkerboard → boundary at every seam) are built to catch before merge.

# 12. QA Plan

New tests (exact paths, from §7):
```bash
npx vitest run tests/codex/core/pixelbrain/vixel/stroke-extractor.test.js \
  tests/codex/core/pixelbrain/vixel/stroke-stylizer.test.js \
  tests/codex/core/pixelbrain/vixel/stroke-boundary-lint.test.js \
  tests/codex/core/pixelbrain/vixel/vri-renderer.strokes.test.js

npx vitest run tests/codex/core/pixelbrain/vixel/ tests/codex/core/pixelbrain/asset-pipeline.test.js \
  tests/codex/core/pixelbrain/compile-asset.test.js tests/codex/core/pixelbrain/material-validator.test.js
  # the Verdict's 194 — must stay 194/194, options.strokes defaults false

node -e "
import('./codex/core/pixelbrain/scdl/scdl.compiler.js').then(async ({compileSCDL}) => {
  const { compileVRI } = await import('./codex/core/pixelbrain/vixel/vri-compiler.js');
  const { renderVRI } = await import('./codex/core/pixelbrain/vixel/vri-renderer.js');
  const fs = await import('node:fs');
  const src = fs.readFileSync('codex/core/pixelbrain/scdl/fixtures/void_acolyte/void_acolyte.scdl', 'utf8');
  const r = compileSCDL(src, {});
  const scene = compileVRI(r.packet, {});
  const raster = renderVRI(scene, 8, { strokes: true });
  console.log('rendered', raster.width, raster.height);
});
"
```

Manual: render `void_acolyte-f0` with `{ strokes: true }` at 8x and look — the hood's circular silhouette must read as one continuous line, no checkerboard/transparent gaps.

# 13. Regression Risks and Specific Retest Checklist

| Risk | Retest |
|---|---|
| `renderVRI`'s existing 2-argument callers break | Full VRI test suite (194) — must stay 194/194 |
| `options.strokes: false`/omitted produces different output than today | F4's byte-identical assertion, run against every existing VRI fixture |
| Extraction non-determinism (iteration-order or Map-ordering dependent) | 100-iteration repeat test in `stroke-extractor.test.js` |
| Extractor/stylizer boundary erodes over time (someone adds a color constant to the extractor) | `stroke-boundary-lint.test.js` (F5) — structural, not just a code-review convention |

# 14. Rollout Plan

- **Incomplete-but-safe:** ships with `options.strokes` defaulting `false` — the capability exists, nothing uses it by default.
- **No separate feature flag needed** — the options parameter itself is the gate.
- **Phase 4/5's eyes-on check gates merge**, not just test-passing — this entire PDR exists because a passing test suite didn't catch the original bug; a human look is the actual proof.
- **Rollback:** revert the merge commit. No runtime state, no migration, no other caller depends on the new parameter existing.
- **Next step after this ships:** `2026-09-03-vri-scdl-wiring-pdr.md`'s held Task 2 commit gets its eyes-on check redone, ideally with strokes enabled, before it proceeds.

# 15. Definition of Done

- [ ] `npx vitest run tests/codex/core/pixelbrain/vixel/` — all pass, including the four new test files.
- [ ] The Verdict's 194-test VRI/asset-pipeline suite stays 194/194.
- [ ] F2's determinism test: 100 iterations, byte-identical `StrokeIR[]`.
- [ ] F4's byte-identical-without-the-flag assertion passes on every existing VRI fixture.
- [ ] F5's structural lint passes for both new files.
- [ ] `void_acolyte.scdl`'s hood renders as a continuous silhouette with `options.strokes: true` — verified both by an automated no-gap assertion and a human look at the actual PNG.
- [ ] At least one additional, materially different sprite eyes-on checked (different silhouette, different material count).
- [ ] §6's escalation (schema registration) answered.
- [ ] This PDR committed with its bytecode search code; PIR filename reserved (§18).

# 16. Final Architectural Verdict

**Complete with acceptable risk, within its stated scope.**

The core bet — that discrete grid adjacency structurally cannot exhibit the disagreement that broke continuous per-cell math — is sound and falls directly out of the bug's own root cause, not a hopeful guess. The frozen contract does the hard thing correctly: it protects the seam that has evidence (geometry/role survive presentation changes) without pretending to know the seam that doesn't yet (taper's representation). The one real judgement call (8-connected adjacency, §5.0) is named as exactly that, not smuggled in as a measured fact.

The honest limitation is scope, matching this session's own pattern tonight: this fixes the boundary that was found, on the vocabulary that was decided (two roles, one weight each), and explicitly defers the richer vision (semantic line weight, style profiles, taper) rather than trying to build all of it at 4 AM. That's the right call, not a shortfall — the alternative was either shipping nothing tonight or shipping something that would need rewriting once the fuller system is designed.

# 17. References

- `VERDICT-2026-09-03-VIXEL-SYSTEM.md` — found VRI correct-but-unreachable; this PDR is downstream of the eyes-on discipline that Verdict itself argued for.
- `2026-09-03-vri-scdl-wiring-pdr.md` — the PDR whose Task 2 commit is held pending this one; not modified by this PDR.
- `codex/core/pixelbrain/vixel/vri-renderer.js:395,400-407,409-448` — `renderVRI`'s current signature, the existing cell-lookup convention this PDR's extractor matches, and the coverage-AA pass whose bug motivated this PDR (read-only reference, not modified).
- `codex/core/pixelbrain/vixel/vri-schema.js:24-100` — existing contract-constant conventions (`VRI_VERSION`, `LAYER_TYPES`, etc.) this PDR's `STROKE_CONTRACT` follows.
- `codex/core/pixelbrain/scdl/fixtures/void_acolyte/void_acolyte.scdl:75` — the real `circle` op whose rendering exposed the bug.
- `docs/superpowers/specs/2026-09-03-vixel-stroke-ir-v1-design.md` — the brainstorming design doc this PDR formalizes.
- `docs/scholomance-encyclopedia/PDR-archive/PDR Prompt.md` — house PDR format this document follows.
- `docs/scholomance-encyclopedia/Scholomance LAW/VAELRIX_LAW.md` — domain map, escalation format, determinism law.

# 18. Post-Implementation Report Handoff

Required PIR: `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260903-VIXEL-STROKE-IR-V1.md`

The PIR must record:
- Full test results, including the 194-test VRI regression count.
- The eyes-on check results for `void_acolyte.scdl` and the second sprite — described or screenshotted, not just "looked fine."
- §6's escalation resolution (schema registration for `PB-VRI-v1` and `PB-STROKE-v1` together).
- Whether U1 (8-connected adjacency) held up visually on the sprites checked, or needs revisiting.
- Confirmation that `2026-09-03-vri-scdl-wiring-pdr.md`'s Task 2 commit was re-run through its eyes-on check and what was observed.

A PDR that ships without this PIR is incomplete.
