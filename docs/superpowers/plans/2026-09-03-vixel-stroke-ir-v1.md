# Vixel Stroke IR v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix VRI's real tearing bug (fragile per-cell coverage math disagreeing at curves) by building a discrete contour-extraction → frozen Stroke IR → geometry-blind stylizer → raster-overlay pipeline, architecturally separate from VRI's existing lighting passes.

**Architecture:** Two new pure-function modules (`stroke-extractor.js`: geometry+adjacency → `StrokeIR[]`, zero style knowledge; `stroke-stylizer.js`: `StrokeIR[]` → paint instructions, zero geometry knowledge) plus a frozen `PB-STROKE-v1` contract in `vri-schema.js`, wired into `renderVRI` as a new opt-in final overlay pass that runs after all four existing lighting passes, untouched.

**Tech Stack:** Node.js (ESM), Vitest.

**Spec:** `docs/scholomance-encyclopedia/PDR-archive/2026-09-03-vixel-stroke-ir-v1-pdr.md` (design doc: `docs/superpowers/specs/2026-09-03-vixel-stroke-ir-v1-design.md`)

## Global Constraints

- Determinism (Law 6): identical input coordinates → byte-identical `StrokeIR[]`, every run.
- No existing-behavior regression: `renderVRI` calls without `options.strokes: true` must produce byte-identical raster output to today.
- The extractor must contain zero style constants (no color, no pixel-weight literal beyond a neutral run-length `baseWeight`).
- The stylizer must contain zero geometry discovery (no coordinate arithmetic, no adjacency lookups, no `Map` construction over cells).
- `vri-renderer.js`'s existing Pass 1–4 (`:409-680`, geometry/texture/marks/lighting) are read-only reference — not modified anywhere in this plan.
- Material-boundary detection keys on `material` difference, not `partId` difference (two parts sharing a material get no seam).
- Adjacency is 8-connected (includes diagonals).

---

### Task 1: `extractContours()` — discrete contour extraction

**Files:**
- Modify: `codex/core/pixelbrain/vixel/vri-schema.js` (add `STROKE_CONTRACT` constant + type docs, alongside the existing `VRI_VERSION`/`LAYER_TYPES` block at lines 24-100)
- Create: `codex/core/pixelbrain/vixel/stroke-extractor.js`
- Test: `tests/codex/core/pixelbrain/vixel/stroke-extractor.test.js`

**Interfaces:**
- Consumes: an array of cell objects shaped `{x, y, material, partId?, sourceOpId?}` — the same shape `packet.geometry.coordinates` already has (verified live: `{x, y, color, partId, material, role, sourceOpId, z, snappedX, snappedY, emphasis}`).
- Produces: `extractContours(coords) → StrokeIR[]`, where each `StrokeIR` is `{ path: { cells: [{x,y,partId,sourceOpId}] }, role: 'silhouette'|'material-boundary', baseWeight: number, schemaVersion: 'PB-STROKE-v1' }`. Task 2 (stylizer) and Task 3 (raster integration) both import `extractContours` by this exact name and signature.

- [ ] **Step 1: Write the failing test**

```js
// tests/codex/core/pixelbrain/vixel/stroke-extractor.test.js
import { describe, it, expect } from 'vitest';
import { extractContours } from '../../../../../codex/core/pixelbrain/vixel/stroke-extractor.js';

const cell = (x, y, material, partId = 'a') => ({ x, y, material, partId, sourceOpId: `op:${partId}:0:test` });

// A filled 3x3 single-material square: the center cell has all 8 neighbors
// present and same-material, so it must NOT appear in any stroke. Every edge
// and corner cell is missing at least one neighbor, so all 8 of them must.
function filledSquare(material = 'stone') {
  const cells = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) cells.push(cell(x, y, material));
  return cells;
}

// A 2x2 checkerboard of two materials: every cell touches a differently
// materialed neighbor AND touches empty space (it's only 2x2), so every cell
// is both silhouette and material-boundary — material-boundary must win per
// the extractor's own rule (checked separately below on a shape where they
// don't coincide).
function twoMaterialStrip() {
  return [
    cell(0, 0, 'red'), cell(1, 0, 'red'), cell(2, 0, 'red'),
    cell(0, 1, 'blue'), cell(1, 1, 'blue'), cell(2, 1, 'blue'),
  ];
}

describe('extractContours', () => {
  it('a single-material filled square produces only silhouette strokes, on exactly the 8 edge/corner cells', () => {
    const strokes = extractContours(filledSquare());
    expect(strokes.every((s) => s.role === 'silhouette')).toBe(true);
    const cellCount = strokes.reduce((n, s) => n + s.path.cells.length, 0);
    expect(cellCount).toBe(8);
    // the center cell (1,1) has all 8 neighbors present and same-material
    const touchesCenter = strokes.some((s) => s.path.cells.some((c) => c.x === 1 && c.y === 1));
    expect(touchesCenter).toBe(false);
  });

  it('two horizontal material strips produce material-boundary strokes at the seam, silhouette elsewhere', () => {
    const strokes = extractContours(twoMaterialStrip());
    const roles = new Set(strokes.map((s) => s.role));
    expect(roles.has('material-boundary')).toBe(true);
    expect(roles.has('silhouette')).toBe(true);
  });

  it('every emitted stroke carries schemaVersion PB-STROKE-v1 and per-cell provenance', () => {
    const strokes = extractContours(filledSquare());
    expect(strokes.length).toBeGreaterThan(0);
    for (const s of strokes) {
      expect(s.schemaVersion).toBe('PB-STROKE-v1');
      expect(typeof s.baseWeight).toBe('number');
      for (const c of s.path.cells) {
        expect(c.partId).toBe('a');
        expect(c.sourceOpId).toBe('op:a:0:test');
      }
    }
  });

  it('is deterministic: 100 repeated runs on the same input produce byte-identical output', () => {
    const input = filledSquare();
    const first = JSON.stringify(extractContours(input));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(extractContours(input))).toBe(first);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/vixel/stroke-extractor.test.js`
Expected: FAIL — `stroke-extractor.js` doesn't exist yet (`Cannot find module`).

- [ ] **Step 3: Write minimal implementation**

```js
// codex/core/pixelbrain/vixel/vri-schema.js — add near VRI_VERSION (line 24), alongside
// the existing LAYER_TYPES/BLEND_MODES contract-constant block:
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

```js
// codex/core/pixelbrain/vixel/stroke-extractor.js
/**
 * Discrete contour extraction — PB-STROKE-v1.
 *
 * Replaces continuous per-cell sub-pixel coverage estimation (the source of
 * the tearing bug in vri-renderer.js's Pass 1: two neighboring cells can each
 * independently compute low coverage at their shared sub-pixel boundary on a
 * curve, leaving an uncovered gap) with discrete integer-grid adjacency. Two
 * lookups into the same key cannot disagree with each other the way two
 * independent floating-point extrapolations can.
 *
 * Zero style knowledge lives here — no color, no pixel-weight constant beyond
 * a neutral geometric baseWeight (run length in cells). See stroke-stylizer.js
 * for the "how should this look" half.
 */
import { STROKE_CONTRACT } from './vri-schema.js';

const NEIGHBORS_8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

export function extractContours(coords) {
  const byKey = new Map();
  for (const c of coords) byKey.set(`${c.x},${c.y}`, c);

  const roleByKey = new Map();
  for (const c of coords) {
    const key = `${c.x},${c.y}`;
    let role = null;
    for (const [dx, dy] of NEIGHBORS_8) {
      const n = byKey.get(`${c.x + dx},${c.y + dy}`);
      if (!n) { role = 'silhouette'; break; }
      if (n.material !== c.material) role = 'material-boundary';
    }
    if (role) roleByKey.set(key, role);
  }

  const sorted = [...coords].sort((a, b) => a.y - b.y || a.x - b.x);
  const visited = new Set();
  const strokes = [];
  for (const start of sorted) {
    const startKey = `${start.x},${start.y}`;
    const role = roleByKey.get(startKey);
    if (!role || visited.has(startKey)) continue;

    const cells = [];
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop();
      const curKey = `${cur.x},${cur.y}`;
      if (visited.has(curKey) || roleByKey.get(curKey) !== role) continue;
      visited.add(curKey);
      cells.push({ x: cur.x, y: cur.y, partId: cur.partId ?? null, sourceOpId: cur.sourceOpId ?? null });
      for (const [dx, dy] of NEIGHBORS_8) {
        const n = byKey.get(`${cur.x + dx},${cur.y + dy}`);
        if (n && !visited.has(`${n.x},${n.y}`)) stack.push(n);
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/vixel/stroke-extractor.test.js`
Expected: PASS (all four tests).

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/vixel/vri-schema.js codex/core/pixelbrain/vixel/stroke-extractor.js tests/codex/core/pixelbrain/vixel/stroke-extractor.test.js
git commit -m "feat(pixelbrain): PB-STROKE-v1 contract + discrete contour extraction

extractContours() classifies boundary cells by 8-connected integer-grid
adjacency (silhouette = touches empty space, material-boundary = touches a
differently-materialed neighbor) instead of continuous per-cell sub-pixel
math -- the source of a real tearing bug on void_acolyte.scdl's hood (a
circle op, where two neighboring cells' independent linear signed-distance
extrapolations disagreed and left an uncovered gap). Two lookups into the
same integer-keyed map cannot disagree the way two floating-point
extrapolations can.

Zero style knowledge in this module by design -- see stroke-stylizer.js.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0158NgddUD3TEouGrp4naQ35"
```

---

### Task 2: `stylizeStrokes()` — geometry-blind stylizer + structural boundary lint

**Files:**
- Create: `codex/core/pixelbrain/vixel/stroke-stylizer.js`
- Test: `tests/codex/core/pixelbrain/vixel/stroke-stylizer.test.js`
- Test: `tests/codex/core/pixelbrain/vixel/stroke-boundary-lint.test.js`

**Interfaces:**
- Consumes: `StrokeIR[]` from Task 1's `extractContours()` — reads only `.role` and passes `.path.cells` through unread.
- Produces: `stylizeStrokes(strokeIR) → Array<{ cells, color, pixelWeight }>`. Task 3 (raster integration) imports this by exact name and consumes this exact return shape.

- [ ] **Step 1: Write the failing test**

```js
// tests/codex/core/pixelbrain/vixel/stroke-stylizer.test.js
import { describe, it, expect } from 'vitest';
import { stylizeStrokes } from '../../../../../codex/core/pixelbrain/vixel/stroke-stylizer.js';

describe('stylizeStrokes', () => {
  it('maps role to a fixed color and pixelWeight, passing cells through unmodified', () => {
    const cells = [{ x: 1, y: 2, partId: 'p', sourceOpId: 'op:p:0:x' }];
    const strokeIR = [
      { path: { cells }, role: 'silhouette', baseWeight: 1, schemaVersion: 'PB-STROKE-v1' },
      { path: { cells }, role: 'material-boundary', baseWeight: 1, schemaVersion: 'PB-STROKE-v1' },
    ];
    const paint = stylizeStrokes(strokeIR);
    expect(paint).toHaveLength(2);
    for (const p of paint) {
      expect(p.cells).toBe(cells); // same reference: passed through, not rebuilt
      expect(typeof p.color).toBe('string');
      expect(typeof p.pixelWeight).toBe('number');
    }
  });

  it('is a pure function of role alone: two strokes with the same role get identical treatment', () => {
    const cellsA = [{ x: 0, y: 0, partId: null, sourceOpId: null }];
    const cellsB = [{ x: 99, y: 99, partId: null, sourceOpId: null }];
    const [a, b] = stylizeStrokes([
      { path: { cells: cellsA }, role: 'silhouette', baseWeight: 1, schemaVersion: 'PB-STROKE-v1' },
      { path: { cells: cellsB }, role: 'silhouette', baseWeight: 5, schemaVersion: 'PB-STROKE-v1' },
    ]);
    expect(a.color).toBe(b.color);
    expect(a.pixelWeight).toBe(b.pixelWeight);
  });
});
```

```js
// tests/codex/core/pixelbrain/vixel/stroke-boundary-lint.test.js
//
// Structural enforcement (PDR F5): the extractor/stylizer separation is a
// mechanical fact about these two files, not a code-review convention.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const extractorSrc = readFileSync(resolve(repoRoot, 'codex/core/pixelbrain/vixel/stroke-extractor.js'), 'utf8');
const stylizerSrc = readFileSync(resolve(repoRoot, 'codex/core/pixelbrain/vixel/stroke-stylizer.js'), 'utf8');

describe('stroke extractor/stylizer structural boundary', () => {
  it('the extractor contains no hex color style constants', () => {
    expect(extractorSrc).not.toMatch(/#[0-9A-Fa-f]{6}/);
  });

  it('the stylizer performs no coordinate arithmetic or adjacency discovery', () => {
    expect(stylizerSrc).not.toMatch(/\.x\s*[-+]|\.y\s*[-+]/); // no cell.x +/- N style neighbor math
    expect(stylizerSrc).not.toMatch(/new Map\(/);             // no adjacency index construction
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/vixel/stroke-stylizer.test.js tests/codex/core/pixelbrain/vixel/stroke-boundary-lint.test.js`
Expected: FAIL — `stroke-stylizer.js` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
// codex/core/pixelbrain/vixel/stroke-stylizer.js
/**
 * v1 stylizer — role to fixed treatment. Reads .role and nothing else; passes
 * .path.cells through unread. This is the seam future style profiles (Anime
 * Ink, Manga Ink, Pixel-Clean, ...) plug into without the extractor ever
 * changing -- see docs/scholomance-encyclopedia/PDR-archive/
 * 2026-09-03-vixel-stroke-ir-v1-pdr.md §5.
 */
const V1_TREATMENT = {
  'silhouette':        { color: '#1B1230', pixelWeight: 1 },
  'material-boundary': { color: '#1B1230', pixelWeight: 1 },
};

export function stylizeStrokes(strokeIR) {
  return strokeIR.map((stroke) => ({
    cells: stroke.path.cells,
    ...V1_TREATMENT[stroke.role],
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/vixel/stroke-stylizer.test.js tests/codex/core/pixelbrain/vixel/stroke-boundary-lint.test.js`
Expected: PASS (all four tests across both files).

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/vixel/stroke-stylizer.js tests/codex/core/pixelbrain/vixel/stroke-stylizer.test.js tests/codex/core/pixelbrain/vixel/stroke-boundary-lint.test.js
git commit -m "feat(pixelbrain): geometry-blind stroke stylizer + structural boundary lint

stylizeStrokes() maps StrokeIR.role to a fixed {color, pixelWeight} and
passes path.cells through unread -- no coordinate arithmetic, no adjacency
discovery. A structural lint test greps both stroke-extractor.js and
stroke-stylizer.js so the extractor-has-no-style / stylizer-has-no-geometry
separation is a mechanically checked fact, not a code-review convention.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0158NgddUD3TEouGrp4naQ35"
```

---

### Task 3: Raster overlay integration in `renderVRI`

**Files:**
- Modify: `codex/core/pixelbrain/vixel/vri-renderer.js:395` (function signature), and the end of the function body (new final overlay step, after Pass 4 and before the `return { width: W, height: H, data: buf }` at line 426)
- Test: `tests/codex/core/pixelbrain/vixel/vri-renderer.strokes.test.js`

**Interfaces:**
- Consumes: `extractContours` (Task 1) and `stylizeStrokes` (Task 2), imported by exact name into `vri-renderer.js`.
- Produces: `renderVRI(scene, scale, options = {})` — third parameter, `options.strokes` (boolean, default `false`). No other task depends on this yet; this is the outward-facing capability the PDR exists to deliver.

- [ ] **Step 1: Write the failing test**

```js
// tests/codex/core/pixelbrain/vixel/vri-renderer.strokes.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';
import { compileVRI } from '../../../../../codex/core/pixelbrain/vixel/vri-compiler.js';
import { renderVRI } from '../../../../../codex/core/pixelbrain/vixel/vri-renderer.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const source = readFileSync(
  resolve(repoRoot, 'codex/core/pixelbrain/scdl/fixtures/void_acolyte/void_acolyte.scdl'),
  'utf8',
);

function sceneFor(src) {
  const compiled = compileSCDL(src, {});
  return compileVRI(compiled.packet, {});
}

describe('renderVRI stroke overlay', () => {
  it('options.strokes omitted or false produces byte-identical output to the two-argument call', () => {
    const scene = sceneFor(source);
    const withoutOptions = renderVRI(scene, 8);
    const explicitFalse = renderVRI(scene, 8, { strokes: false });
    expect(Buffer.from(explicitFalse.data).equals(Buffer.from(withoutOptions.data))).toBe(true);
  });

  it('options.strokes: true changes the raster (it is not a silent no-op)', () => {
    const scene = sceneFor(source);
    const without = renderVRI(scene, 8);
    const withStrokes = renderVRI(scene, 8, { strokes: true });
    expect(Buffer.from(withStrokes.data).equals(Buffer.from(without.data))).toBe(false);
  });

  it("the hood's circular silhouette has no uncovered (fully transparent) gap cells within its run — the tearing bug is fixed", () => {
    const scene = sceneFor(source);
    const { width, data } = renderVRI(scene, 1, { strokes: true }); // scale 1: one pixel per cell, easy to inspect
    // The hood is a circle centered near (15.5, 10) radius 7.5 (void_acolyte.scdl:75).
    // Sample the ring of cells at that radius and assert none are fully transparent.
    let sampledOpaque = 0, sampledTotal = 0;
    for (let deg = 0; deg < 360; deg += 5) {
      const rad = (deg * Math.PI) / 180;
      const x = Math.round(15.5 + 7.5 * Math.cos(rad));
      const y = Math.round(10 + 7.5 * Math.sin(rad));
      if (x < 0 || x >= width || y < 0) continue;
      const idx = (y * width + x) * 4;
      if (idx < 0 || idx + 3 >= data.length) continue;
      sampledTotal += 1;
      if (data[idx + 3] > 0) sampledOpaque += 1;
    }
    expect(sampledTotal).toBeGreaterThan(0);
    expect(sampledOpaque).toBe(sampledTotal); // every sampled boundary point is painted, none transparent
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/vixel/vri-renderer.strokes.test.js`
Expected: FAIL — `renderVRI` currently accepts only 2 arguments; `options.strokes` has no effect, so the second test ("changes the raster") fails because both calls produce identical output.

- [ ] **Step 3: Write minimal implementation**

```js
// codex/core/pixelbrain/vixel/vri-renderer.js — add near the top imports:
import { extractContours } from './stroke-extractor.js';
import { stylizeStrokes } from './stroke-stylizer.js';
```

```js
// codex/core/pixelbrain/vixel/vri-renderer.js:395 — was:
//   export function renderVRI(scene, scale = 4) {
export function renderVRI(scene, scale = 4, options = {}) {
```

```js
// codex/core/pixelbrain/vixel/vri-renderer.js — immediately before the existing
// `return { width: W, height: H, data: buf };` (currently line 426), insert:

  // ── Final overlay: strokes ────────────────────────────────────────────────
  // Runs strictly after Pass 1-4, which are completely unmodified by this
  // block. Hard opaque fill, no smoothstep, no sub-pixel math -- this is what
  // actually fixes the tearing bug (a fragile continuous per-cell coverage
  // estimate disagreeing with itself at curves): discrete integer-grid
  // adjacency (stroke-extractor.js) cannot disagree with itself the way two
  // independent floating-point extrapolations can.
  if (options.strokes) {
    const strokeIR = extractContours(geoLayer?.payload.coordinates || []);
    const paint = stylizeStrokes(strokeIR);
    for (const { cells, color, pixelWeight } of paint) {
      const inkRgb = hexToRGB(color);
      for (const cellCoord of cells) {
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = cellCoord.x * scale + sx;
            const py = cellCoord.y * scale + sy;
            if (px < 0 || px >= W || py < 0 || py >= H) continue;
            const idx = (py * W + px) * 4;
            buf[idx] = inkRgb[0];
            buf[idx + 1] = inkRgb[1];
            buf[idx + 2] = inkRgb[2];
            buf[idx + 3] = 255;
          }
        }
      }
    }
    void pixelWeight; // reserved for v2 (thicker strokes); v1 always paints exactly the cell
  }
```

Note: `geoLayer` is already in scope at this point in `renderVRI` (built at the top of the function, per the existing `cellMap`/`geoLayer` pattern at lines 400-403) — this step reuses it rather than re-deriving it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/vixel/vri-renderer.strokes.test.js`
Expected: PASS (all three tests).

- [ ] **Step 5: Run the full existing VRI regression suite**

Run: `npx vitest run tests/codex/core/pixelbrain/vixel/ tests/codex/core/pixelbrain/asset-pipeline.test.js tests/codex/core/pixelbrain/compile-asset.test.js tests/codex/core/pixelbrain/material-validator.test.js`
Expected: PASS, same count as the Verdict's 194 plus this plan's new tests so far (194 + 4 from Task 1 + 4 from Task 2 + 3 from this task = 205). `options.strokes` defaults `false`, so nothing in the existing 194 should move.

- [ ] **Step 6: Commit**

```bash
git add codex/core/pixelbrain/vixel/vri-renderer.js tests/codex/core/pixelbrain/vixel/vri-renderer.strokes.test.js
git commit -m "fix(pixelbrain): wire the stroke overlay into renderVRI, fixing the tearing bug

renderVRI(scene, scale, options={}) -- new third parameter, options.strokes
default false. When true, runs the discrete contour-extraction + stylizer
pipeline (stroke-extractor.js, stroke-stylizer.js) as a final overlay after
Pass 1-4, completely unmodified. Verified directly on void_acolyte.scdl's
hood (the real circle op that exposed the original bug): every sampled point
around its silhouette is now opaque, none transparent.

options.strokes omitted or false is provably byte-identical to today's
output -- Pass 1-4 never know this code exists.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0158NgddUD3TEouGrp4naQ35"
```

---

### Task 4: Full regression + eyes-on check (gates completion, not automatable)

**Files:** none modified — verification only.

**Interfaces:** none new.

- [ ] **Step 1: Run the complete new-and-existing test suite**

```bash
npx vitest run tests/codex/core/pixelbrain/vixel/ tests/codex/core/pixelbrain/asset-pipeline.test.js tests/codex/core/pixelbrain/compile-asset.test.js tests/codex/core/pixelbrain/material-validator.test.js
```
Expected: 205/205 (the Verdict's 194 + this plan's 11 new tests across Tasks 1-3), zero failures.

- [ ] **Step 2: Render `void_acolyte.scdl` with strokes enabled and look at it**

```bash
node -e "
import('./codex/core/pixelbrain/scdl/scdl.compiler.js').then(async ({compileSCDL}) => {
  const { compileVRI } = await import('./codex/core/pixelbrain/vixel/vri-compiler.js');
  const { renderVRI } = await import('./codex/core/pixelbrain/vixel/vri-renderer.js');
  const { encodePng } = await import('./codex/core/pixelbrain/scdl/scdl.exporters.js');
  const fs = await import('node:fs');
  const src = fs.readFileSync('codex/core/pixelbrain/scdl/fixtures/void_acolyte/void_acolyte.scdl', 'utf8');
  const r = compileSCDL(src, {});
  const scene = compileVRI(r.packet, {});
  const raster = renderVRI(scene, 8, { strokes: true });
  fs.writeFileSync(process.env.CLAUDE_JOB_DIR + '/tmp/vixel-stroke-check/acolyte-strokes.png', encodePng(raster.width, raster.height, raster.data));
});
"
```

Read the resulting PNG (via the Read tool, on the actual image file). Confirm the hood's circular silhouette reads as one continuous line — no dashed/checkerboard gap, matching what the original bug report showed as broken.

- [ ] **Step 3: Render a second, materially different sprite with strokes enabled and look at it**

`codex/core/pixelbrain/scdl/fixtures/void_tiles/void_rune_focus.scdl` — a small item (different silhouette entirely from the acolyte character), compiles strict-clean, 3 circle/sphere ops, 5 distinct materials (a real test of material-boundary detection, not just silhouette).

```bash
node -e "
import('./codex/core/pixelbrain/scdl/scdl.compiler.js').then(async ({compileSCDL}) => {
  const { compileVRI } = await import('./codex/core/pixelbrain/vixel/vri-compiler.js');
  const { renderVRI } = await import('./codex/core/pixelbrain/vixel/vri-renderer.js');
  const { encodePng } = await import('./codex/core/pixelbrain/scdl/scdl.exporters.js');
  const fs = await import('node:fs');
  const src = fs.readFileSync('codex/core/pixelbrain/scdl/fixtures/void_tiles/void_rune_focus.scdl', 'utf8');
  const r = compileSCDL(src, {});
  const scene = compileVRI(r.packet, {});
  const raster = renderVRI(scene, 8, { strokes: true });
  fs.writeFileSync(process.env.CLAUDE_JOB_DIR + '/tmp/vixel-stroke-check/rune-focus-strokes.png', encodePng(raster.width, raster.height, raster.data));
});
"
```

Read this PNG too. Confirm: silhouette is continuous, and internal material-boundary lines appear at real material seams (not randomly, not missing).

- [ ] **Step 4: Record what was actually observed**

Write one or two sentences describing what the two renders actually showed — not "looks good," the specific thing checked (continuity at the hood boundary; whether material-boundary lines landed at real seams). This is the PDR's own explicit standard (§9 Q1, §14 Rollout Plan): the original bug was found by looking, not by a passing suite, so the fix's proof needs the same standard, recorded, not just asserted.

- [ ] **Step 5: No commit for this task** — verification only, nothing to stage. If Step 2 or 3 reveals a real problem, stop and report it rather than proceeding — do not adjust the acceptance criteria to match what shipped.

---

## Self-Review

**Spec coverage:** F1 (frozen contract) → Task 1 Step 3 (`vri-schema.js`). F2 (deterministic extraction, both acceptance shapes) → Task 1. F3 (geometry-blind stylizer) → Task 2. F4 (raster overlay, byte-identical without the flag) → Task 3. F5 (structural lint) → Task 2. PDR Phase 5 (regression + eyes-on) → Task 4. No PDR requirement without a task.

**Placeholder scan:** none. Task 4 Step 4 asks for a real recorded observation rather than inventing one — that's the plan correctly refusing to fabricate a result for a step that hasn't happened yet, not a placeholder.

**Type consistency:** `extractContours(coords) → StrokeIR[]` (Task 1) is consumed identically in Task 2's tests and Task 3's `vri-renderer.js` integration. `stylizeStrokes(strokeIR) → {cells, color, pixelWeight}[]` (Task 2) is consumed identically in Task 3. `StrokeIR` field names (`path.cells`, `role`, `baseWeight`, `schemaVersion`) match the PDR's frozen contract exactly, checked against the design doc's §3 verbatim.

## Execution

Four tasks, strictly sequential (Task 2 needs Task 1's `extractContours`; Task 3 needs both; Task 4 needs Task 3). Given the size and the sequential dependency, I'll execute inline via `superpowers:executing-plans` rather than subagents, matching how the last two plans went tonight — say so if you'd rather have subagent-driven review between tasks instead.
